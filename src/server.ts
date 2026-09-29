// Hydra — © 2026 José Segura (GKsegura) · MIT
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import { WebSocketServer } from 'ws';
import { repoGraph, workspaceSummary } from './data.ts';
import {
  commit, getCommitDetail, getCommitFileDiff, getStatus, getWorkingDiff, GitError, stage, unstage,
} from './git/index.ts';
import { GitHubSession } from './github-session.ts';
import { HttpError } from './http.ts';
import { Jobs } from './jobs.ts';
import { defaultRecentsFile, Recents } from './recents.ts';
import { SessionStore } from './session-store.ts';
import { appRoutes } from './routes/app.ts';
import { repoRoutes } from './routes/repo.ts';
import { terminalRoutes } from './routes/terminal.ts';
import { workspaceRoutes } from './routes/workspace.ts';
import { memoryStore, type SecretStore } from './secrets.ts';
import { Terminals } from './terminal.ts';
import { VERSION } from './version.ts';
import { RepoWatchers } from './watch.ts';
import { loadWorkspace, type Repo, type Workspace } from './workspace.ts';
import { WorkspaceSession, type WorkspaceScope } from './workspace-session.ts';

/** Pasta sugerida para clonar/criar repositórios: Documentos\GitHub se existir (padrão do GitHub Desktop). */
function defaultProjectsDir(): string {
  const gh = path.join(os.homedir(), 'Documents', 'GitHub');
  return existsSync(gh) ? gh : os.homedir();
}

/** Pasta do front compilado. O app desktop aponta para dentro do pacote via HYDRA_WEB_DIR. */
export function distDir(): string {
  return process.env.HYDRA_WEB_DIR ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../web/dist');
}

export interface ServerOptions {
  port: number;
  max: number;
  /** Onde guardar a lista de recentes (padrão: ~/.hydra/recents.json). */
  recentsFile?: string;
  /** Onde guardar a sessão restaurável (padrão: session.json ao lado dos recentes). */
  sessionFile?: string;
  /** Sem caminho na linha de comando, reabre o workspace da sessão anterior (app desktop). */
  restore?: boolean;
  /** Rodando dentro do app desktop (habilita o seletor nativo no front). */
  desktop?: boolean;
  /** Onde o token do GitHub fica guardado (desktop: safeStorage; CLI: variável de ambiente / gh). */
  secrets?: SecretStore;
  /** App desktop: manda arquivos para a Lixeira ao descartar alterações. */
  trash?: (file: string) => Promise<void>;
}

/** HTML do front (já compilado pelo Vite) com os dados de boot injetados. */
export function indexHtml(boot: object): string {
  const file = path.join(distDir(), 'index.html');
  if (!existsSync(file)) throw new Error('Front não compilado. Rode `npm run build` na pasta do hydra.');
  const json = JSON.stringify(boot).replace(/</g, '\\u003c');
  return readFileSync(file, 'utf8').replace('/*__HYDRA_BOOT__*/null', () => json);
}

/** Aceita "all" ou só caminhos que aparecem no status atual do repo. */
async function validFiles(repo: Repo, files: unknown): Promise<string[] | 'all'> {
  if (files === 'all') return 'all';
  if (!Array.isArray(files) || !files.every((f) => typeof f === 'string')) throw new HttpError(400, 'files deve ser "all" ou uma lista');
  const { files: changes } = await getStatus(repo.path);
  const known = new Set(changes.flatMap((c) => (c.orig ? [c.path, c.orig] : [c.path])));
  const unknown = files.filter((f) => !known.has(f));
  if (unknown.length) throw new HttpError(400, `Arquivo fora do status: ${unknown[0]}`);
  return files as string[];
}

/**
 * Os workspaces abertos (as guias), na ordem, e qual está ativo; mais o que é do app inteiro (recentes, sessão salva).
 * Por enquanto o app só usa um workspace por vez: `open` substitui, a menos que peçam `'add'`.
 */
export class Session {
  private workspaces = new Map<string, WorkspaceSession>();
  private order: string[] = [];
  private activeId: string | null = null;
  /** Última guia que esteve ativa (a sessão salva reabre nela, mesmo se o app fechou no Início). */
  private lastId: string | null = null;
  private restoring = false;
  recents: Recents;
  store: SessionStore;
  /** Aviso pendente (ex.: não deu para reabrir o último workspace); entregue uma vez ao front. */
  private notice: string | null = null;
  /** Chamado quando um workspace fecha (ex.: encerrar os terminais e watchers dele). */
  onClose: ((id: string) => void) | null = null;
  /** Chamado depois que um workspace abre (ex.: começar a observar os repos dele). */
  onOpen: ((workspace: WorkspaceSession) => void) | null = null;

  constructor(recentsFile: string, sessionFile = path.join(path.dirname(recentsFile), 'session.json')) {
    this.recents = new Recents(recentsFile);
    this.store = new SessionStore(sessionFile);
  }

  /**
   * Reabre todas as guias da sessão salva, na mesma ordem, e ativa a que estava ativa (ou, se ela falhou, a primeira que abriu).
   * As que não abrirem (pasta sumiu, sem repos) são puladas e viram um único aviso. Devolve quantas abriram.
   */
  restore(): number {
    const { tabs, activeTab } = this.store.read();
    const failed: string[] = [];
    let wanted: string | null = null;
    this.restoring = true;
    try {
      tabs.forEach((tab, i) => {
        try {
          this.open(tab.source, 'add');
          if (i === activeTab) wanted = this.activeId;
        } catch (err) {
          failed.push(`"${tab.source}" (${(err as Error).message})`);
        }
      });
    } finally {
      this.restoring = false;
    }
    if (this.order.length) this.activeId = wanted ?? this.order[0];
    if (failed.length) this.notice = `Não foi possível reabrir ${failed.join('; ')}`;
    this.persist();
    return this.order.length;
  }

  /** Entrega (uma vez) o aviso pendente. */
  takeNotice(): string | null {
    const n = this.notice;
    this.notice = null;
    return n;
  }

  /**
   * Abre um workspace (arquivo, pasta ou repo) e o torna o ativo. Lança erro legível se não houver repositórios.
   * `'replace'` (padrão) fecha os demais antes; `'add'` mantém os outros e, se este já estiver aberto, só o ativa.
   */
  open(target: string, mode: 'replace' | 'add' = 'replace'): Workspace {
    const ws = loadWorkspace(target);
    if (!ws.repos.length) throw new HttpError(400, 'Nenhum repositório git encontrado nesse caminho.');
    const opened = new WorkspaceSession(ws);
    if (mode === 'add' && this.workspaces.has(opened.id)) {
      this.activate(opened.id);
      return this.workspaces.get(opened.id)!.ws;
    }
    for (const id of mode === 'replace' ? [...this.order] : [opened.id]) this.closeWorkspace(id, false);
    this.workspaces.set(opened.id, opened);
    this.order.push(opened.id);
    this.activeId = this.lastId = opened.id;
    if (!this.restoring) this.recents.add({ path: ws.source ?? target, name: ws.name }); // reabrir a sessão não conta como "aberto agora"
    this.persist();
    this.onOpen?.(opened);
    return ws;
  }

  /** Fecha um workspace: encerra o que é dele (terminais, watchers) e, se era o ativo, passa para um vizinho. */
  closeWorkspace(id: string, save = true) {
    if (!this.workspaces.has(id)) return;
    this.onClose?.(id);
    this.workspaces.delete(id);
    const i = this.order.indexOf(id);
    this.order.splice(i, 1);
    if (this.activeId === id) this.activeId = this.order[Math.min(i, this.order.length - 1)] ?? null;
    if (this.lastId === id) this.lastId = this.activeId ?? this.order[this.order.length - 1] ?? null;
    if (save) this.persist();
  }

  /** Fecha o workspace ativo. */
  close() {
    if (this.activeId) this.closeWorkspace(this.activeId);
  }

  /** Passa a guia ativa para `id`; `null` = a tela inicial (nenhum workspace ativo). */
  activate(id: string | null) {
    if (id !== null && !this.workspaces.has(id)) throw new HttpError(404, 'Workspace não encontrado');
    this.activeId = id;
    if (id) this.lastId = id;
    this.persist();
  }

  get(id: string): WorkspaceSession | undefined {
    return this.workspaces.get(id);
  }

  /** Reordena as guias. `ids` precisa ser exatamente os workspaces abertos, em qualquer ordem. */
  reorder(ids: string[]) {
    if (ids.length !== this.order.length || new Set(ids).size !== ids.length || !ids.every((id) => this.workspaces.has(id))) {
      throw new HttpError(400, 'A lista de guias precisa ter exatamente os workspaces abertos');
    }
    this.order = [...ids];
    this.persist();
  }

  /** Os workspaces abertos, na ordem das guias. */
  all(): WorkspaceSession[] {
    return this.order.map((id) => this.workspaces.get(id)!);
  }

  get active(): WorkspaceSession | null {
    return this.activeId ? (this.workspaces.get(this.activeId) ?? null) : null;
  }

  /** O workspace ativo, ou null. */
  get ws(): Workspace | null {
    return this.active?.ws ?? null;
  }

  current(): Workspace {
    return this.currentSession().ws;
  }

  currentSession(): WorkspaceSession {
    const active = this.active;
    if (!active) throw new HttpError(409, 'Nenhum workspace aberto');
    return active;
  }

  repo(id: string): Repo {
    return this.currentSession().repo(id);
  }

  /** Grava as guias abertas (ordem e ativa) para reabrir na próxima execução. */
  private persist() {
    if (this.restoring) return; // durante a restauração a lista salva ainda está sendo lida: grava só no fim
    const tabs = this.all().map((w) => ({ source: w.ws.source ?? w.ws.file ?? w.ws.name }));
    this.store.write({ tabs, activeTab: Math.max(0, this.order.indexOf(this.activeId ?? this.lastId ?? '')) });
  }
}

export function createApp(
  session: Session, opts: ServerOptions, token: string, jobs: Jobs, github: GitHubSession, terminals: Terminals, watchers: RepoWatchers,
) {
  const app = express();
  app.disable('x-powered-by');

  // Proteção contra DNS rebinding: só respondemos para o host local.
  app.use((req, res, next) => {
    if (!localHost(req.headers.host)) return void res.status(403).send('Host não permitido');
    res.setHeader('cache-control', 'no-store');
    next();
  });

  // ------------------------------------------------------------ API
  const api = express.Router();
  api.use(express.json({ limit: '1mb' }));
  // Header customizado + token: outra página não consegue chamar a API (nem via CORS simples).
  // Exceções: os streams de eventos (EventSource não envia headers), que aceitam ?t= e só leem eventos.
  api.use((req, _res, next) => {
    const stream = req.path === '/events' || /^\/jobs\/[0-9a-f]+\/events$/.test(req.path);
    const sse = req.method === 'GET' && stream && req.query.t === token;
    next(req.headers['x-hydra-token'] === token || sse ? undefined : new HttpError(401, 'Token inválido'));
  });

  // Estado do app: workspace aberto (ou nenhum) e recentes.
  const appInfo = () => ({
    desktop: !!opts.desktop,
    version: VERSION,
    defaultDir: defaultProjectsDir(),
    workspace: session.active
      ? { id: session.active.id, name: session.ws!.name, file: session.ws!.file, source: session.ws!.source ?? null }
      : null,
    // As guias abertas, na ordem, e a ativa (null = tela inicial).
    tabs: session.all().map((w) => ({ id: w.id, name: w.ws.name, file: w.ws.file, source: w.ws.source ?? null })),
    active: session.active?.id ?? null,
    recents: session.recents.list(),
  });

  api.get('/app', (_req, res) => {
    res.json({ ...appInfo(), notice: session.takeNotice() });
  });
  api.post('/workspace/open', (req, res) => {
    const target = req.body?.path;
    if (typeof target !== 'string' || !target.trim()) throw new HttpError(400, 'Informe o caminho do workspace');
    // 'replace' (padrão, o front atual) fecha os outros; 'add' abre em uma nova guia (ou ativa a que já existe).
    const mode = req.body?.mode ?? 'replace';
    if (mode !== 'replace' && mode !== 'add') throw new HttpError(400, 'mode deve ser "replace" ou "add"');
    try {
      session.open(target.trim().replace(/^"(.*)"$/, '$1'), mode);
    } catch (err) {
      throw err instanceof HttpError ? err : new HttpError(400, (err as Error).message);
    }
    res.json(appInfo());
  });
  api.post('/workspace/close', (_req, res) => {
    session.close();
    res.json(appInfo());
  });
  // Guias: fechar uma pelo id, escolher a ativa (null = tela inicial) e reordenar.
  api.post('/w/:wid/close', (req, res) => {
    const id = String(req.params.wid);
    if (!session.get(id)) throw new HttpError(404, 'Workspace não encontrado');
    session.closeWorkspace(id);
    res.json(appInfo());
  });
  api.post('/session/active', (req, res) => {
    const id = req.body?.id;
    if (id !== null && typeof id !== 'string') throw new HttpError(400, 'Informe o id da guia (ou null para a tela inicial)');
    session.activate(id);
    res.json(appInfo());
  });
  api.post('/session/order', (req, res) => {
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) throw new HttpError(400, 'Informe a lista de ids das guias');
    session.reorder(ids);
    res.json(appInfo());
  });
  api.post('/recents/remove', (req, res) => {
    if (typeof req.body?.path !== 'string') throw new HttpError(400, 'Informe o caminho');
    session.recents.remove(req.body.path);
    res.json(appInfo());
  });

  /**
   * As rotas que trabalham dentro de um workspace, montadas em `/w/:wid/...` (um workspace qualquer, pelo id).
   */
  const scopedRoutes = (scope: WorkspaceScope): Router => {
    const r = express.Router();
    const repoOf = (req: Request): Repo => scope.repo(String(req.params.id));

    r.get('/workspace', async (_req, res) => {
      res.json(await workspaceSummary(scope.current()));
    });
    r.get('/repos/:id/status', async (req, res) => {
      res.json(await getStatus(repoOf(req).path));
    });
    r.get('/repos/:id/graph', async (req, res) => {
      // ?limit=N: só os N commits mais recentes (o teto é opts.max). Sem o parâmetro, vale o teto (CLI/estático).
      let limit = opts.max;
      if (req.query.limit !== undefined) {
        const n = Number(req.query.limit);
        if (typeof req.query.limit !== 'string' || !Number.isInteger(n) || n < 1) throw new HttpError(400, 'limit deve ser um inteiro positivo');
        limit = Math.min(n, opts.max);
      }
      res.json(await repoGraph(repoOf(req), limit));
    });
    r.get('/repos/:id/commit/:hash', async (req, res) => {
      res.json(await getCommitDetail(repoOf(req).path, String(req.params.hash)));
    });
    r.get('/repos/:id/commit/:hash/diff', async (req, res) => {
      const file = req.query.file;
      if (typeof file !== 'string' || !file) throw new HttpError(400, 'Informe ?file=');
      res.json({ diff: await getCommitFileDiff(repoOf(req).path, String(req.params.hash), file) });
    });
    r.get('/repos/:id/diff', async (req, res) => {
      const repo = repoOf(req);
      const change = (await getStatus(repo.path)).files.find((f) => f.path === req.query.file);
      if (!change) throw new HttpError(404, 'Arquivo não está no status');
      res.json({ diff: await getWorkingDiff(repo.path, change, req.query.staged === '1') });
    });

    r.post('/repos/:id/stage', async (req, res) => {
      const repo = repoOf(req);
      await stage(repo.path, await validFiles(repo, req.body?.files));
      res.json(await getStatus(repo.path));
    });
    r.post('/repos/:id/unstage', async (req, res) => {
      const repo = repoOf(req);
      const files = await validFiles(repo, req.body?.files);
      await unstage(repo.path, files, (await getStatus(repo.path)).initial);
      res.json(await getStatus(repo.path));
    });
    r.post('/repos/:id/commit', async (req, res) => {
      const repo = repoOf(req);
      const summary = typeof req.body?.summary === 'string' ? req.body.summary.trim() : '';
      const body = typeof req.body?.body === 'string' ? req.body.body : '';
      if (!summary) throw new HttpError(400, 'O resumo do commit é obrigatório');
      if ((await getStatus(repo.path)).staged === 0) throw new HttpError(400, 'Nada em stage para commitar');
      const hash = await commit(repo.path, summary, body);
      res.json({ hash, status: await getStatus(repo.path) });
    });

    r.use(terminalRoutes({ session: scope, terminals }));
    r.use(workspaceRoutes({ session: scope }));
    r.use('/repos/:id', repoRoutes({ session: scope, jobs, github, trash: opts.trash }));
    return r;
  };

  // Um roteador por workspace aberto (criado na primeira chamada; o WeakMap o solta junto com o workspace).
  const scopedRouters = new WeakMap<WorkspaceSession, Router>();
  const routerOf = (w: WorkspaceSession) => {
    let router = scopedRouters.get(w);
    if (!router) scopedRouters.set(w, (router = scopedRoutes(w)));
    return router;
  };

  // Tempo real: um aviso por repo que mudou (ver src/watch.ts). Um comentário a cada 25 s mantém a conexão viva.
  api.get('/events', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write(': conectado\n\n');
    const unsubscribe = watchers.subscribe((change) => res.write(`data: ${JSON.stringify(change)}\n\n`));
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      unsubscribe();
    });
  });

  // Progresso das operações longas (Server-Sent Events).
  api.get('/jobs/:id/events', (req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', connection: 'keep-alive' });
    const unsubscribe = jobs.subscribe(String(req.params.id), (e) => {
      res.write(`data: ${JSON.stringify(e)}

`);
      if (e.type !== 'progress') res.end();
    });
    req.on('close', unsubscribe);
  });

  // Terminais: a informação do shell e o encerramento por id não dependem de qual guia está aberta.
  api.get('/terminal', (_req, res) => {
    res.json(terminals.info());
  });
  api.delete('/terminals/:tid', (req, res) => {
    terminals.kill(String(req.params.tid));
    res.json({ ok: true });
  });

  api.use(appRoutes({ jobs, github }));
  api.use('/w/:wid', (req, res, next) => {
    const workspace = session.get(String(req.params.wid));
    if (!workspace) return next(new HttpError(404, 'Workspace não encontrado'));
    routerOf(workspace)(req, res, next);
  });

  api.use((_req, _res, next) => next(new HttpError(404, 'Rota não encontrada')));
  app.use('/api', api);

  // ------------------------------------------------------------ front
  app.get('/', (req, res) => {
    if (req.query.t !== token) return void res.status(401).type('text/plain; charset=utf-8').send('Abra pelo link mostrado no terminal do hydra.');
    res.type('html').send(indexHtml({ mode: 'server', token, desktop: !!opts.desktop }));
  });
  app.use('/assets', (req, res, next) => express.static(path.join(distDir(), 'assets'), { index: false })(req, res, next));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    const status = err instanceof HttpError ? err.status : err instanceof GitError ? 422 : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) return void res.end();
    res.status(status).json({ error: err.message, code: err instanceof HttpError || err instanceof GitError ? err.code : undefined });
  });

  return app;
}

/** Host (ou Origin sem o protocolo) apontando para a máquina local, em qualquer porta. */
function localHost(host: string | undefined): boolean {
  const name = (host ?? '').replace(/:\d+$/, '');
  return name === '127.0.0.1' || name === 'localhost';
}

/**
 * Terminal integrado: WebSocket em /api/terminals/:id/ws?t=<token>. O WebSocket não envia headers customizados,
 * então o token vai na URL (como no stream de progresso), e o Origin precisa ser a própria interface local.
 */
function attachTerminalSockets(server: Server, token: string, terminals: Terminals) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const id = /^\/api\/terminals\/([0-9a-f]{16})\/ws$/.exec(url.pathname)?.[1];
    const origin = req.headers.origin ?? '';
    const allowed = !!id && url.searchParams.get('t') === token && localHost(req.headers.host)
      && /^https?:\/\//.test(origin) && localHost(origin.replace(/^https?:\/\//, ''));
    if (!allowed || !terminals.has(id)) {
      socket.end(allowed ? 'HTTP/1.1 404 Not Found\r\n\r\n' : 'HTTP/1.1 403 Forbidden\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const link = terminals.attach(id, {
        send: (data) => {
          if (ws.readyState === ws.OPEN) ws.send(data);
        },
        close: (code, reason) => ws.close(code, reason),
      });
      if (!link) return void ws.close(4004, 'Terminal encerrado');
      ws.on('message', (data) => link.message(data.toString()));
      ws.on('close', link.detach);
    });
  });
}

export interface RunningServer {
  url: string;
  token: string;
  port: number;
  server: Server;
  session: Session;
  github: GitHubSession;
  terminals: Terminals;
}

/** Sobe o servidor. Sem `target`, o app abre na tela inicial. Porta 0 = qualquer livre. */
export async function startServer(target: string | null, opts: ServerOptions): Promise<RunningServer> {
  const token = randomBytes(16).toString('hex');
  const session = new Session(opts.recentsFile ?? defaultRecentsFile(), opts.sessionFile);
  if (target) session.open(target);
  else if (opts.restore) session.restore();
  const jobs = new Jobs();
  const github = new GitHubSession(opts.secrets ?? memoryStore());
  await github.init();
  const terminals = new Terminals();
  await terminals.init();
  const watchers = new RepoWatchers();
  session.onClose = (id) => {
    terminals.killAll(id);
    watchers.close(id);
  };
  session.onOpen = (w) => watchers.watch(w.ws.repos, w.id);
  for (const w of session.all()) watchers.watch(w.ws.repos, w.id); // abertos antes de os ganchos existirem (caminho na linha de comando)
  const app = createApp(session, opts, token, jobs, github, terminals, watchers);

  return new Promise((resolve, reject) => {
    const tryListen = (port: number) => {
      const server = app.listen(port, '127.0.0.1');
      server.once('listening', () => {
        const real = (server.address() as AddressInfo).port;
        attachTerminalSockets(server, token, terminals);
        server.on('close', () => {
          terminals.killAll();
          watchers.close();
        });
        resolve({ url: `http://127.0.0.1:${real}/?t=${token}`, token, port: real, server, session, github, terminals });
      });
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && port !== 0 && port < opts.port + 20) tryListen(port + 1);
        else reject(err);
      });
    };
    tryListen(opts.port);
  });
}
