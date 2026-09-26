// Hydra — © 2026 José Segura (GKsegura) · MIT
import { execFile } from 'node:child_process';
import express, { type Request } from 'express';
import {
  abortOperation, addRemote, checkoutBranch, checkoutCommit, cherryPick, commit, continueOperation, createBranch,
  createTag, currentBranch, deleteBranch, deleteRemoteBranch, deleteTag, discard, fetchAll, getStatus, GitError,
  lastCommitMessage, listBranches, listRemotes, listStashes, mergeBranch, pendingMessage, previewMerge, pull, push,
  pushTag, readConflict, renameBranch, resolveWhole, resolveWithContent, revertCommit, stashApply, stashDrop,
  stashLabel, stashPush, undoLastCommit, incomingLabel, defaultRemote, assertCloneUrl,
} from '../git/index.ts';
import { compareUrl, createRepo, listPulls } from '../github.ts';
import type { GitHubSession } from '../github-session.ts';
import { bool, HttpError, int, optStr, str } from '../http.ts';
import type { Jobs } from '../jobs.ts';
import type { Session } from '../server.ts';
import type { Repo } from '../workspace.ts';

export interface RepoContext {
  session: Session;
  jobs: Jobs;
  github: GitHubSession;
  /** App desktop: manda arquivos para a Lixeira ao descartar. */
  trash?: (file: string) => Promise<void>;
}

const HASH = /^[0-9a-f]{4,64}$/i;
const hash = (v: unknown) => {
  const h = str(v, 'o commit');
  if (!HASH.test(h)) throw new HttpError(400, 'Hash inválido');
  return h;
};

/** Rotas de um repositório do workspace: /api/repos/:id/… */
export function repoRoutes(ctx: RepoContext) {
  const r = express.Router({ mergeParams: true });
  const repoOf = (req: Request): Repo => ctx.session.repo(String(req.params.id));
  const job = (req: Request, label: string, run: (repo: Repo, progress: Parameters<Parameters<Jobs['start']>[2]>[0]) => Promise<unknown>) => {
    const repo = repoOf(req);
    return { jobId: ctx.jobs.start(repo.path, label, (progress) => run(repo, progress)) };
  };

  // ---------------------------------------------------------------- branches
  r.get('/branches', async (req, res) => {
    const repo = repoOf(req);
    const [branches, remotes, stashes] = await Promise.all([listBranches(repo.path), listRemotes(repo.path), listStashes(repo.path)]);
    res.json({ branches, remotes, stashes, current: await currentBranch(repo.path) });
  });
  r.post('/branches', async (req, res) => {
    const repo = repoOf(req);
    const from = optStr(req.body?.from);
    await createBranch(repo.path, str(req.body?.name, 'o nome da branch').trim(), { from, checkout: bool(req.body?.checkout) });
    res.json({ ok: true });
  });
  r.post('/branches/checkout', async (req, res) => {
    const repo = repoOf(req);
    const mode = req.body?.mode === 'stash' ? 'stash' : 'carry';
    const result = await checkoutBranch(repo.path, str(req.body?.name, 'a branch'), mode);
    // Voltando para uma branch que tinha alterações guardadas? A interface oferece restaurar.
    const branch = await currentBranch(repo.path);
    const saved = branch ? (await listStashes(repo.path)).find((s) => s.message === stashLabel(branch)) : undefined;
    res.json({ ...result, restorable: saved ? saved.index : null });
  });
  r.post('/branches/rename', async (req, res) => {
    const repo = repoOf(req);
    const remote = bool(req.body?.remote) ? await defaultRemote(repo.path) : undefined;
    await renameBranch(repo.path, str(req.body?.from, 'a branch'), str(req.body?.to, 'o novo nome').trim(), { remote });
    res.json({ ok: true });
  });
  r.post('/branches/delete', async (req, res) => {
    const repo = repoOf(req);
    const remote = optStr(req.body?.remote);
    if (remote && !(await listRemotes(repo.path)).some((x) => x.name === remote)) throw new HttpError(400, 'Remoto desconhecido');
    await deleteBranch(repo.path, str(req.body?.name, 'a branch'), { local: bool(req.body?.local), remote, force: bool(req.body?.force) });
    res.json({ ok: true });
  });
  r.post('/branches/delete-remote', async (req, res) => {
    await deleteRemoteBranch(repoOf(req).path, str(req.body?.ref, 'a branch remota'));
    res.json({ ok: true });
  });
  r.post('/checkout-commit', async (req, res) => {
    await checkoutCommit(repoOf(req).path, hash(req.body?.hash));
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- sync (jobs com progresso)
  r.post('/fetch', (req, res) => {
    res.json(job(req, 'fetch', (repo, p) => fetchAll(repo.path, p)));
  });
  r.post('/pull', (req, res) => {
    res.json(job(req, 'pull', (repo, p) => pull(repo.path, p)));
  });
  r.post('/push', (req, res) => {
    res.json(job(req, 'push', (repo, p) => push(repo.path, p)));
  });
  r.get('/remotes', async (req, res) => {
    res.json(await listRemotes(repoOf(req).path));
  });
  // Publicar sem login no Hydra: o usuário cria o repositório vazio no GitHub e cola a URL aqui.
  r.post('/remotes', async (req, res) => {
    const repo = repoOf(req);
    const url = str(req.body?.url, 'a URL do repositório remoto').trim();
    assertCloneUrl(url);
    if ((await listRemotes(repo.path)).some((x) => x.name === 'origin')) throw new HttpError(400, 'Este repositório já tem o remoto "origin".');
    await addRemote(repo.path, 'origin', url);
    res.json(await listRemotes(repo.path));
  });

  // ---------------------------------------------------------------- merge e conflitos
  r.get('/merge/preview', async (req, res) => {
    res.json(await previewMerge(repoOf(req).path, str(req.query.branch, 'a branch')));
  });
  r.post('/merge', async (req, res) => {
    res.json(await mergeBranch(repoOf(req).path, str(req.body?.branch, 'a branch'), { noFastForward: bool(req.body?.noFastForward) }));
  });
  r.get('/operation', async (req, res) => {
    const repo = repoOf(req);
    const st = await getStatus(repo.path);
    if (!st.operation) return void res.json(null);
    res.json({
      operation: st.operation,
      message: await pendingMessage(repo.path),
      current: st.branch ?? 'HEAD',
      incoming: st.operation === 'merge' ? await incomingLabel(repo.path) : null,
      conflicts: st.files.filter((f) => f.index === 'U').map((f) => ({ path: f.path, kind: f.conflict })),
    });
  });
  r.post('/operation/abort', async (req, res) => {
    const repo = repoOf(req);
    const st = await getStatus(repo.path);
    if (!st.operation) throw new HttpError(400, 'Nenhuma operação em andamento.');
    await abortOperation(repo.path, st.operation);
    res.json({ ok: true });
  });
  r.post('/operation/continue', async (req, res) => {
    const repo = repoOf(req);
    const st = await getStatus(repo.path);
    if (!st.operation) throw new HttpError(400, 'Nenhuma operação em andamento.');
    res.json({ hash: await continueOperation(repo.path, st.operation, typeof req.body?.message === 'string' ? req.body.message : '') });
  });
  r.get('/conflicts/file', async (req, res) => {
    res.json(await readConflict(repoOf(req).path, str(req.query.path, 'o arquivo')));
  });
  r.post('/conflicts/resolve', async (req, res) => {
    const repo = repoOf(req);
    const file = str(req.body?.path, 'o arquivo');
    const side = req.body?.side;
    if (side === 'ours' || side === 'theirs' || side === 'delete') await resolveWhole(repo.path, file, side);
    else if (typeof req.body?.content === 'string') await resolveWithContent(repo.path, file, req.body.content);
    else throw new HttpError(400, 'Informe o conteúdo final ou o lado escolhido');
    res.json(await getStatus(repo.path));
  });

  // ---------------------------------------------------------------- commits: amend, desfazer, reverter, cherry-pick, descartar
  r.get('/last-commit', async (req, res) => {
    res.json(await lastCommitMessage(repoOf(req).path));
  });
  r.post('/undo', async (req, res) => {
    const repo = repoOf(req);
    const message = await undoLastCommit(repo.path);
    res.json({ message, status: await getStatus(repo.path) });
  });
  r.post('/revert', async (req, res) => {
    res.json(await revertCommit(repoOf(req).path, hash(req.body?.hash)));
  });
  r.post('/cherry-pick', async (req, res) => {
    res.json(await cherryPick(repoOf(req).path, hash(req.body?.hash)));
  });
  r.post('/discard', async (req, res) => {
    const repo = repoOf(req);
    const st = await getStatus(repo.path);
    const wanted = req.body?.files;
    let files = st.files.filter((f) => f.index !== 'U');
    if (wanted !== 'all') {
      if (!Array.isArray(wanted) || !wanted.every((f) => typeof f === 'string')) throw new HttpError(400, 'files deve ser "all" ou uma lista');
      const set = new Set(wanted as string[]);
      files = files.filter((f) => set.has(f.path));
      if (files.length !== set.size) throw new HttpError(400, 'Arquivo fora do status');
    }
    await discard(repo.path, files, st.initial, ctx.trash);
    res.json(await getStatus(repo.path));
  });

  // ---------------------------------------------------------------- stash
  r.post('/stashes', async (req, res) => {
    const repo = repoOf(req);
    await stashPush(repo.path, typeof req.body?.message === 'string' ? req.body.message : '');
    res.json(await getStatus(repo.path));
  });
  r.post('/stashes/apply', async (req, res) => {
    const repo = repoOf(req);
    const result = await stashApply(repo.path, int(req.body?.index, 'stash'), bool(req.body?.pop));
    res.json({ ...result, status: await getStatus(repo.path) });
  });
  r.post('/stashes/drop', async (req, res) => {
    await stashDrop(repoOf(req).path, int(req.body?.index, 'stash'));
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- tags
  r.post('/tags', async (req, res) => {
    const at = optStr(req.body?.at);
    await createTag(repoOf(req).path, str(req.body?.name, 'o nome da tag').trim(), { at: at ? hash(at) : undefined, message: optStr(req.body?.message) });
    res.json({ ok: true });
  });
  r.post('/tags/push', async (req, res) => {
    const repo = repoOf(req);
    await pushTag(repo.path, str(req.body?.name, 'a tag'), await defaultRemote(repo.path));
    res.json({ ok: true });
  });
  r.post('/tags/delete', async (req, res) => {
    const repo = repoOf(req);
    const remote = bool(req.body?.remote) ? await defaultRemote(repo.path) : undefined;
    await deleteTag(repo.path, str(req.body?.name, 'a tag'), { local: bool(req.body?.local), remote });
    res.json({ ok: true });
  });

  // ---------------------------------------------------------------- GitHub (PRs, publicar)
  r.get('/pulls', async (req, res) => {
    const gh = (await listRemotes(repoOf(req).path)).find((x) => x.github)?.github;
    if (!gh) return void res.json({ repo: null, pulls: [] });
    try {
      res.json({ repo: gh, pulls: await listPulls(ctx.github.token, gh) });
    } catch (err) {
      // Repo privado sem login, limite da API etc.: não é erro da tela, só não mostra PRs.
      res.json({ repo: gh, pulls: [], error: (err as Error).message });
    }
  });
  r.get('/compare-url', async (req, res) => {
    const repo = repoOf(req);
    const gh = (await listRemotes(repo.path)).find((x) => x.github)?.github;
    if (!gh) throw new HttpError(400, 'Este repositório não está no GitHub.');
    const branch = optStr(req.query.branch) ?? (await currentBranch(repo.path));
    if (!branch) throw new HttpError(400, 'Troque para uma branch antes.');
    res.json({ url: compareUrl(gh, branch) });
  });
  r.post('/publish', async (req, res) => {
    const repo = repoOf(req);
    if (!ctx.github.token) throw new HttpError(401, 'Entre com o GitHub para publicar o repositório.');
    if ((await listRemotes(repo.path)).length) throw new HttpError(400, 'Este repositório já tem um remoto.');
    const name = str(req.body?.name, 'o nome do repositório').trim();
    const isPrivate = req.body?.private !== false;
    const description = optStr(req.body?.description);
    res.json(job(req, 'publish', async (r2, progress) => {
      progress({ phase: 'Criando repositório no GitHub', percent: null, line: '' });
      const created = await createRepo(ctx.github.token!, { name, private: isPrivate, description });
      await addRemote(r2.path, 'origin', created.clone_url);
      await push(r2.path, progress);
      return { url: created.html_url };
    }));
  });

  // ---------------------------------------------------------------- abrir fora do Hydra
  r.post('/open', (req, res) => {
    const repo = repoOf(req);
    const target = req.body?.target;
    const detached = { windowsHide: false, cwd: repo.path };
    if (target === 'explorer') execFile('explorer.exe', [repo.path], detached, () => {});
    else if (target === 'terminal') {
      execFile('wt.exe', ['-d', repo.path], detached, (err) => {
        if (err) execFile('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', 'cd', '/d', repo.path], detached, () => {});
      });
    } else if (target === 'editor') {
      // `code` é um .cmd no Windows: precisa do cmd. O caminho vem só da sessão (nunca do corpo da requisição).
      execFile('cmd.exe', ['/c', 'code', repo.path], detached, (err) => {
        if (err) console.error('Não foi possível abrir o VS Code:', err.message);
      });
    } else throw new HttpError(400, 'Destino inválido');
    res.json({ ok: true });
  });

  // Commit com amend (o commit normal continua em server.ts; aqui a variação)
  r.post('/amend', async (req, res) => {
    const repo = repoOf(req);
    const summary = str(req.body?.summary, 'o resumo do commit').trim();
    res.json({ hash: await commit(repo.path, summary, typeof req.body?.body === 'string' ? req.body.body : '', true), status: await getStatus(repo.path) });
  });

  r.use((err: Error, _req: Request, _res: express.Response, next: express.NextFunction) => {
    // Erros do git com código conhecido viram HttpError com o mesmo código (a interface reage a eles).
    if (err instanceof GitError && err.code) return next(new HttpError(409, err.message, err.code));
    next(err);
  });

  return r;
}
