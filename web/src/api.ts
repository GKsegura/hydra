// Hydra — © 2026 José Segura (GKsegura) · MIT
import type {
  AppInfo, Boot, BranchInfo, CommitDetail, ConflictFile, GitHubInfo, GitHubRepo, JobEvent, MergePreview, MergeResult,
  OperationInfo, Progress, PullsInfo, RepoBranches, RepoGraph, RepoMergePreview, RepoResult, RepoScenario, RepoStatus, ScenarioStepInput,
  TerminalInfo, WorkspaceSummary,
} from './types.ts';

// No modo servidor o hydra injeta o token no HTML; no `npm run dev` (Vite) ele vem por ?t= na URL.
export const BOOT: Boot = window.HYDRA_BOOT ?? { mode: 'server', token: new URLSearchParams(location.search).get('t') ?? '' };
export const IS_STATIC = BOOT.mode === 'static';
/** Seletor nativo de arquivos/pastas e menu do app: só existem dentro do app desktop. */
export const desktop = window.hydraDesktop ?? null;

/** Erro da API; `code` identifica casos que a interface trata (ex.: "not_merged", "no_remote", "busy"). */
export class ApiError extends Error {
  code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** A guia (workspace) em que o usuário está agora; as chamadas de workspace vão para `/w/<id>/...`. */
let currentWid: string | null = null;
export const setCurrentWorkspace = (id: string | null) => (currentWid = id);

/** Chamado quando uma resposta chega depois de o usuário trocar de guia: o estado daquela guia mudou por trás e precisa recarregar. */
let onStale: ((wid: string) => void) | null = null;
export const setStaleHandler = (fn: (wid: string) => void) => (onStale = fn);

/** A resposta é de uma guia que já não é a atual e foi descartada (sem mensagem: a interface não mostra erro por isso). */
export class StaleTabError extends ApiError {
  constructor() {
    super('', 'stale_tab');
  }
}

async function call<T>(path: string, init: { method?: string; body?: unknown; guard?: boolean } = {}): Promise<T> {
  const wid = init.guard === false ? undefined : /^\/w\/([^/]+)/.exec(path)?.[1];
  const res = await fetch(`/api${path}`, {
    method: init.method ?? 'GET',
    headers: {
      'x-hydra-token': BOOT.token ?? '',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Guia trocada (ou fechada) enquanto a resposta vinha: não deixa o resultado cair no estado de outra guia.
  if (wid && decodeURIComponent(wid) !== currentWid) {
    onStale?.(decodeURIComponent(wid));
    throw new StaleTabError();
  }
  if (!res.ok) throw new ApiError(data.error || `Erro ${res.status}`, data.code);
  return data as T;
}

const post = <T>(path: string, body: unknown = {}, guard = true) => call<T>(path, { method: 'POST', body, guard });

/** Acompanha uma operação longa (clone, fetch, pull, push…) até terminar, repassando o progresso. */
export function followJob<T = unknown>(jobId: string, onProgress: (p: Progress) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`/api/jobs/${jobId}/events?t=${encodeURIComponent(BOOT.token ?? '')}`);
    let settled = false;
    es.onmessage = (ev) => {
      const e = JSON.parse(ev.data) as JobEvent;
      if (e.type === 'progress') return onProgress(e.progress);
      settled = true;
      es.close();
      if (e.type === 'done') resolve(e.result as T);
      else reject(new ApiError(e.error, e.code));
    };
    es.onerror = () => {
      if (settled) return;
      es.close();
      reject(new ApiError('A conexão com o Hydra caiu durante a operação.'));
    };
  });
}

const enc = encodeURIComponent;
/** Prefixo das rotas do workspace da guia atual. Sem guia aberta não há o que chamar. */
function ws(): string {
  if (!currentWid) throw new ApiError('Nenhum workspace aberto');
  return `/w/${enc(currentWid)}`;
}
const repo = (id: string) => `${ws()}/repos/${enc(id)}`;

/** Stream de mudanças nos repos (tempo real). Como no progresso dos jobs, o token vai na URL. */
export const eventsUrl = () => `/api/events?t=${encodeURIComponent(BOOT.token ?? '')}`;

/** WebSocket de um terminal. Como no stream de progresso, o token vai na URL (o WebSocket não envia headers). */
export function terminalSocketUrl(tid: string): string {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/terminals/${enc(tid)}/ws?t=${enc(BOOT.token ?? '')}`;
}

export const api = {
  // app e workspaces
  app: () => call<AppInfo>('/app'),
  // Abre em uma nova guia (ou ativa a que já existe para esse caminho).
  openWorkspace: (path: string) => post<AppInfo>('/workspace/open', { path, mode: 'add' }),
  // Operações sobre as guias em si: não são "de uma guia", então a guarda de troca não vale.
  closeTab: (id: string) => post<AppInfo>(`/w/${enc(id)}/close`, {}, false),
  setActiveTab: (id: string | null) => post<AppInfo>('/session/active', { id }, false),
  reorderTabs: (ids: string[]) => post<AppInfo>('/session/order', { ids }, false),
  removeRecent: (path: string) => post<AppInfo>('/recents/remove', { path }),
  workspaceCommit: (repos: { id: string; stageAll: boolean }[], summary: string, body: string) =>
    post<{ results: RepoResult[] }>(`${ws()}/workspace/commit`, { repos, summary, body }),
  // branches em vários repos
  workspaceBranches: () => call<RepoBranches[]>(`${ws()}/workspace/branches`),
  workspaceCreateBranch: (repos: { id: string; from?: string }[], name: string, checkout: boolean) =>
    post<{ results: RepoResult[] }>(`${ws()}/workspace/branches/create`, { repos, name, checkout }),
  workspaceCheckout: (repos: { id: string; mode: 'carry' | 'stash'; create: boolean }[], name: string) =>
    post<{ results: RepoResult[] }>(`${ws()}/workspace/branches/checkout`, { repos, name }),
  workspaceMergePreview: (repos: string[], branch: string) =>
    post<RepoMergePreview[]>(`${ws()}/workspace/branches/merge-preview`, { repos, branch }),
  workspaceMerge: (repos: string[], branch: string, noFastForward: boolean) =>
    post<{ results: RepoResult[] }>(`${ws()}/workspace/branches/merge`, { repos, branch, noFastForward }),
  // cenário: só simula (não altera nenhum repositório)
  workspaceScenario: (repos: string[], base: string, steps: ScenarioStepInput[]) =>
    post<RepoScenario[]>(`${ws()}/workspace/scenario/simulate`, { repos, base, steps }),
  workspace: async (): Promise<WorkspaceSummary> => (IS_STATIC ? BOOT.data!.summary : call(`${ws()}/workspace`)),

  // leitura
  graph: async (id: string, limit?: number): Promise<RepoGraph> =>
    IS_STATIC ? BOOT.data!.graphs[id] : call(`${repo(id)}/graph${limit ? `?limit=${limit}` : ''}`),
  status: (id: string) => call<RepoStatus>(`${repo(id)}/status`),
  commit: (id: string, hash: string) => call<CommitDetail>(`${repo(id)}/commit/${hash}`),
  commitDiff: (id: string, hash: string, file: string) => call<{ diff: string }>(`${repo(id)}/commit/${hash}/diff?file=${enc(file)}`),
  workDiff: (id: string, file: string, staged: boolean) => call<{ diff: string }>(`${repo(id)}/diff?file=${enc(file)}&staged=${staged ? 1 : 0}`),
  branches: (id: string) => call<BranchInfo>(`${repo(id)}/branches`),
  operation: (id: string) => call<OperationInfo | null>(`${repo(id)}/operation`),
  pulls: (id: string) => call<PullsInfo>(`${repo(id)}/pulls`),
  compareUrl: (id: string, branch?: string) => call<{ url: string }>(`${repo(id)}/compare-url${branch ? `?branch=${enc(branch)}` : ''}`),
  lastCommit: (id: string) => call<{ summary: string; body: string } | null>(`${repo(id)}/last-commit`),

  // área de trabalho e commits
  stage: (id: string, files: string[] | 'all') => post<RepoStatus>(`${repo(id)}/stage`, { files }),
  unstage: (id: string, files: string[] | 'all') => post<RepoStatus>(`${repo(id)}/unstage`, { files }),
  // stage parcial: `lines` são índices no texto do diff; `expected` é o diff que estava na tela
  stageLines: (id: string, file: string, lines: number[], expected: string) => post<RepoStatus>(`${repo(id)}/stage-lines`, { file, lines, expected }),
  unstageLines: (id: string, file: string, lines: number[], expected: string) => post<RepoStatus>(`${repo(id)}/unstage-lines`, { file, lines, expected }),
  discard: (id: string, files: string[] | 'all') => post<RepoStatus>(`${repo(id)}/discard`, { files }),
  commitNow: (id: string, summary: string, body: string) => post<{ hash: string; status: RepoStatus }>(`${repo(id)}/commit`, { summary, body }),
  amend: (id: string, summary: string, body: string) => post<{ hash: string; status: RepoStatus }>(`${repo(id)}/amend`, { summary, body }),
  undo: (id: string) => post<{ message: { summary: string; body: string }; status: RepoStatus }>(`${repo(id)}/undo`),
  revert: (id: string, hash: string) => post<{ conflicts: boolean }>(`${repo(id)}/revert`, { hash }),
  cherryPick: (id: string, hash: string) => post<{ conflicts: boolean }>(`${repo(id)}/cherry-pick`, { hash }),

  // branches
  createBranch: (id: string, name: string, opts: { from?: string; checkout?: boolean }) => post(`${repo(id)}/branches`, { name, ...opts }),
  checkout: (id: string, name: string, mode: 'carry' | 'stash') =>
    post<{ stashed: boolean; restorable: number | null }>(`${repo(id)}/branches/checkout`, { name, mode }),
  checkoutCommit: (id: string, hash: string) => post(`${repo(id)}/checkout-commit`, { hash }),
  renameBranch: (id: string, from: string, to: string, remote: boolean) => post(`${repo(id)}/branches/rename`, { from, to, remote }),
  deleteBranch: (id: string, name: string, opts: { local: boolean; remote?: string; force?: boolean }) =>
    post(`${repo(id)}/branches/delete`, { name, ...opts }),
  deleteRemoteBranch: (id: string, ref: string) => post(`${repo(id)}/branches/delete-remote`, { ref }),

  // sync (jobs)
  fetch: (id: string) => post<{ jobId: string }>(`${repo(id)}/fetch`),
  pull: (id: string) => post<{ jobId: string }>(`${repo(id)}/pull`),
  push: (id: string) => post<{ jobId: string }>(`${repo(id)}/push`),
  addRemote: (id: string, url: string) => post(`${repo(id)}/remotes`, { url }),
  publish: (id: string, opts: { name: string; private: boolean; description?: string }) => post<{ jobId: string }>(`${repo(id)}/publish`, opts),

  // merge e conflitos
  mergePreview: (id: string, branch: string) => call<MergePreview>(`${repo(id)}/merge/preview?branch=${enc(branch)}`),
  merge: (id: string, branch: string, noFastForward: boolean) => post<MergeResult>(`${repo(id)}/merge`, { branch, noFastForward }),
  abortOperation: (id: string) => post(`${repo(id)}/operation/abort`),
  continueOperation: (id: string, message: string) => post<{ hash: string }>(`${repo(id)}/operation/continue`, { message }),
  conflictFile: (id: string, path: string) => call<ConflictFile>(`${repo(id)}/conflicts/file?path=${enc(path)}`),
  resolveContent: (id: string, path: string, content: string) => post<RepoStatus>(`${repo(id)}/conflicts/resolve`, { path, content }),
  resolveSide: (id: string, path: string, side: 'ours' | 'theirs' | 'delete') => post<RepoStatus>(`${repo(id)}/conflicts/resolve`, { path, side }),

  // stash e tags
  stash: (id: string, message: string) => post<RepoStatus>(`${repo(id)}/stashes`, { message }),
  stashApply: (id: string, index: number, pop: boolean) => post<{ conflicts: boolean; status: RepoStatus }>(`${repo(id)}/stashes/apply`, { index, pop }),
  stashDrop: (id: string, index: number) => post(`${repo(id)}/stashes/drop`, { index }),
  createTag: (id: string, name: string, at?: string, message?: string) => post(`${repo(id)}/tags`, { name, at, message }),
  pushTag: (id: string, name: string) => post(`${repo(id)}/tags/push`, { name }),
  deleteTag: (id: string, name: string, local: boolean, remote: boolean) => post(`${repo(id)}/tags/delete`, { name, local, remote }),

  // fora do Hydra
  openIn: (id: string, target: 'editor' | 'explorer' | 'terminal') => post(`${repo(id)}/open`, { target }),

  // terminal integrado (a entrada e a saída passam pelo WebSocket: terminalSocketUrl)
  terminalInfo: () => call<TerminalInfo>('/terminal'),
  terminals: () => call<{ id: string; repoId: string; shell: string }[]>(`${ws()}/terminals`),
  openTerminal: (id: string, cols: number, rows: number) => post<{ id: string; shell: string }>(`${repo(id)}/terminals`, { cols, rows }),
  closeTerminal: (tid: string) => call(`/terminals/${enc(tid)}`, { method: 'DELETE' }),

  // clonar / criar
  templates: () => call<{ gitignore: string[] }>('/repos/templates'),
  clone: (url: string, parent: string, name?: string) => post<{ jobId: string; path: string }>('/repos/clone', { url, parent, name }),
  init: (opts: { parent: string; name: string; gitignore: string; readme: boolean; description?: string; publish?: { private: boolean } | null }) =>
    post<{ jobId: string; path: string }>('/repos/init', opts),

  // GitHub
  github: () => call<GitHubInfo>('/github'),
  githubLogin: () => post<GitHubInfo>('/github/login'),
  githubCancel: () => post<GitHubInfo>('/github/login/cancel'),
  githubLogout: () => post<GitHubInfo>('/github/logout'),
  githubRepos: () => call<GitHubRepo[]>('/github/repos'),
};
