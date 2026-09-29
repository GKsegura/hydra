// Hydra — © 2026 José Segura (GKsegura) · MIT
import { reactive } from 'vue';
import { api, desktop, eventsUrl, IS_STATIC } from './api.ts';
import type {
  AppInfo, BranchInfo, Commit, ConflictFile, GitHubInfo, OperationInfo, PullsInfo, RepoGraph, RepoStatus, Selection, TerminalInfo,
  WorkspaceSummary,
} from './types.ts';
import { COLORS } from './utils.ts';

interface DiffView {
  title: string;
  key: string;
  loading: boolean;
  text: string;
  error: string | null;
  /** Diff da área de trabalho ou do stage (não de um commit): permite o stage parcial. */
  work?: { repoId: string; file: string; staged: boolean };
}

export const state = reactive({
  app: null as AppInfo | null, // workspace aberto + recentes (modo servidor)
  welcome: false, // tela inicial aberta por cima de um workspace ("Abrir outro…")
  opening: false,
  summary: null as WorkspaceSummary | null,
  graphs: {} as Record<string, RepoGraph>,
  graphLimit: {} as Record<string, number>, // quantos commits pedir por repo (cresce em GRAPH_PAGE ao rolar até o fim)
  loadingMore: {} as Record<string, boolean>,
  visible: [] as string[], // repos com painel aberto, na ordem do workspace
  sizes: {} as Record<string, number>, // flex-grow de cada painel
  timeline: false, // painel "Timeline unificada" (commits de todos os repos visíveis numa linha do tempo só)
  timelineOnly: false, // com a timeline ligada: esconde os painéis dos repos e deixa só ela na tela
  active: null as string | null, // repo em foco (detalhe, sidebar, teclado)
  selected: null as Selection | null,
  filter: '',
  drafts: {} as Record<string, { summary: string; body: string }>,
  diff: null as DiffView | null,
  scroll: null as { repoId: string; row: number; seq: number } | null,
  busy: false,
  live: false, // conectado ao stream de mudanças (tempo real)
  toast: { msg: '', kind: '', show: false },

  // ---- operações git (branches, sync, merge…)
  dialog: null as Dialog | null, // diálogo aberto (um por vez)
  menu: null as MenuState | null, // menu de contexto aberto
  jobs: {} as Record<string, JobState>, // operação longa em andamento por repo (fetch/pull/push…)
  branchInfo: {} as Record<string, BranchInfo>, // branches, remotos e stashes por repo (carregado sob demanda)
  operations: {} as Record<string, OperationInfo | null>, // merge/revert em andamento por repo
  conflict: null as { repoId: string; file: ConflictFile } | null, // resolvedor de conflitos aberto
  amend: {} as Record<string, boolean>, // "emendar último commit" marcado no painel de commit
  pulls: {} as Record<string, PullsInfo>,
  github: null as GitHubInfo | null,

  // ---- terminal integrado (dock embaixo dos grafos)
  terminal: {
    info: null as TerminalInfo | null,
    open: false,
    height: 280,
    tabs: [] as TerminalTab[], // um shell por aba, sempre na pasta de um repo do workspace
    active: null as string | null,
  },
});

export interface TerminalTab {
  id: string;
  repoId: string;
  shell: string;
}

export interface Dialog {
  kind: string;
  props: Record<string, unknown>;
}

export interface MenuItem {
  label: string;
  run?: () => unknown;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
  hint?: string;
}

export interface MenuState {
  x: number;
  y: number;
  items: MenuItem[];
}

export interface JobState {
  label: string;
  phase: string;
  percent: number | null;
}

// ------------------------------------------------------------------ toast

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string, kind: '' | 'ok' | 'error' = '') {
  state.toast = { msg, kind, show: true };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (state.toast.show = false), kind === 'error' ? 6000 : 2600);
}

// ------------------------------------------------------------------ derivados

export const repoById = (id: string | null) => state.summary?.repos.find((r) => r.id === id);
export const repoColor = (id: string) => COLORS[(Math.max(0, state.summary?.repos.findIndex((r) => r.id === id) ?? 0) * 3) % COLORS.length];
export const statusOf = (id: string | null): RepoStatus | null => repoById(id)?.status ?? null;
export const hasWip = (id: string) => (statusOf(id)?.files.length ?? 0) > 0;

export function headRow(id: string): number {
  const commits = state.graphs[id]?.commits ?? [];
  let i = commits.findIndex((c) => c.refs.some((r) => r.current || r.type === 'head'));
  if (i === -1) {
    const last = statusOf(id)?.lastCommit?.hash;
    i = commits.findIndex((c) => c.hash === last);
  }
  return i;
}

export function matches(c: Commit, q: string): boolean {
  const hay = `${c.subject}\n${c.author}\n${c.email}\n${c.hash}\n${c.refs.map((r) => r.name).join(' ')}`.toLowerCase();
  return hay.includes(q);
}

// ------------------------------------------------------------------ layout salvo (por workspace)

const layoutKey = () => `hydra:${state.summary?.name}:layout`;

export function saveLayout() {
  try {
    localStorage.setItem(layoutKey(), JSON.stringify({
      visible: state.visible, sizes: state.sizes, active: state.active, timeline: state.timeline, timelineOnly: state.timelineOnly,
    }));
  } catch {
    /* storage bloqueado: só não lembramos o layout */
  }
}

function readLayout(): {
  visible?: string[]; sizes?: Record<string, number>; active?: string; timeline?: boolean; timelineOnly?: boolean;
} | null {
  try {
    return JSON.parse(localStorage.getItem(layoutKey()) || 'null');
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ seleção

export function setActive(id: string) {
  if (state.active === id) return;
  state.active = id;
  saveLayout();
}

export function selectCommit(id: string, hash: string, scroll = false) {
  closeDiff();
  setActive(id);
  state.selected = { repoId: id, type: 'commit', hash };
  if (scroll) {
    const row = state.graphs[id]?.commits.findIndex((c) => c.hash === hash) ?? -1;
    if (row >= 0) state.scroll = { repoId: id, row, seq: (state.scroll?.seq ?? 0) + 1 };
  }
}

export function selectWip(id: string) {
  closeDiff();
  setActive(id);
  state.selected = { repoId: id, type: 'wip' };
}

export function selectDefault(id: string) {
  if (hasWip(id)) return selectWip(id);
  const h = headRow(id);
  if (h >= 0) return selectCommit(id, state.graphs[id].commits[h].hash, true);
  setActive(id);
  state.selected = null;
}

export function moveSelection(delta: 1 | -1) {
  const id = state.active;
  if (!id || !state.graphs[id]) return;
  const commits = state.graphs[id].commits;
  const sel = state.selected;
  let i = sel?.type === 'commit' && sel.repoId === id ? commits.findIndex((c) => c.hash === sel.hash) : -1;
  i += delta;
  if (i < 0) return hasWip(id) ? selectWip(id) : undefined;
  if (i < commits.length) selectCommit(id, commits[i].hash, true);
}

// ------------------------------------------------------------------ painéis

/** Commits carregados por vez em cada repo (a carga inicial e cada "carregar mais"). */
export const GRAPH_PAGE = 250;
/** Repos carregados ao mesmo tempo na abertura: vários `git log` simultâneos não deixam o resultado aparecer antes. */
const GRAPH_CONCURRENCY = 2;

/** Grafo do repo com o limite atual dele (o watcher e os commits recarregam sem perder as páginas já carregadas). */
export function fetchGraph(id: string): Promise<RepoGraph> {
  return api.graph(id, state.graphLimit[id] ??= GRAPH_PAGE);
}

/** Carrega os grafos que faltam: cada repo aparece assim que fica pronto (o ativo primeiro), no máximo 2 por vez. */
async function ensureGraphs(ids: string[]) {
  const queue = ids.filter((id) => !state.graphs[id]).sort((a, b) => Number(b === state.active) - Number(a === state.active));
  const worker = async () => {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        state.graphs[id] = await fetchGraph(id);
      } catch (err) {
        toast((err as Error).message, 'error');
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(GRAPH_CONCURRENCY, queue.length) }, worker));
}

/** Busca mais uma página de commits do repo (se houver). O grafo é recalculado no servidor com o novo limite. */
export async function loadMore(id: string) {
  const g = state.graphs[id];
  if (IS_STATIC || !g?.truncated || state.loadingMore[id]) return;
  state.loadingMore[id] = true;
  const previous = state.graphLimit[id];
  try {
    state.graphLimit[id] = g.commits.length + GRAPH_PAGE;
    state.graphs[id] = await fetchGraph(id);
  } catch (err) {
    state.graphLimit[id] = previous;
    toast((err as Error).message, 'error');
  } finally {
    state.loadingMore[id] = false;
  }
}

/** Mostra o painel do repo (se estiver oculto) e coloca o foco nele. */
export async function showRepo(id: string) {
  if (!state.visible.includes(id)) {
    const order = state.summary!.repos.map((r) => r.id);
    state.visible = order.filter((x) => x === id || state.visible.includes(x));
    await ensureGraphs([id]);
  }
  selectDefault(id);
  saveLayout();
}

/** Id do painel da timeline unificada na lista de painéis (não é um repo). */
export const TIMELINE = '__timeline';

/** Liga/desliga o painel "Timeline unificada". A escolha fica salva no layout do workspace. */
export function setTimeline(on: boolean) {
  state.timeline = on;
  if (!on) {
    delete state.sizes[TIMELINE];
    state.timelineOnly = false; // desligar a timeline sempre traz os painéis de volta
  }
  saveLayout();
}

/** "Só a timeline": esconde os painéis dos repos (os repos marcados continuam definindo o que entra nela). */
export function setTimelineOnly(on: boolean) {
  state.timelineOnly = on;
  if (on) state.timeline = true;
  saveLayout();
}

export function hideRepo(id: string) {
  state.visible = state.visible.filter((x) => x !== id);
  if (state.active === id || state.selected?.repoId === id) {
    state.selected = null;
    closeDiff();
    const next = state.visible[0];
    if (next) selectDefault(next);
    else state.active = null;
  }
  saveLayout();
}

export async function showAll() {
  state.visible = state.summary!.repos.map((r) => r.id);
  await ensureGraphs(state.visible);
  saveLayout();
}

export function equalize() {
  state.sizes = {};
  saveLayout();
}

// ------------------------------------------------------------------ carga

let refreshing = false;
export async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    if (!IS_STATIC) {
      state.app = await api.app();
      if (!state.app.workspace) {
        state.summary = null;
        return;
      }
    }
    const first = !state.summary;
    const summary = await api.workspace();
    state.summary = summary;
    const ids = summary.repos.map((r) => r.id);

    if (first) {
      const saved = readLayout();
      state.visible = saved?.visible?.filter((x) => ids.includes(x)) ?? [];
      if (!state.visible.length) state.visible = [...ids];
      state.sizes = saved?.sizes ?? {};
      state.timeline = !!saved?.timeline;
      state.timelineOnly = !!saved?.timelineOnly;
      state.active = saved?.active && state.visible.includes(saved.active) ? saved.active : state.visible[0] ?? null;
    } else {
      state.visible = state.visible.filter((x) => ids.includes(x));
      if (!state.active || !ids.includes(state.active)) state.active = state.visible[0] ?? null;
      state.graphs = {};
    }

    await ensureGraphs(state.visible);

    const sel = state.selected;
    if (sel && state.visible.includes(sel.repoId)) {
      if (sel.type === 'commit' && state.graphs[sel.repoId]?.commits.some((c) => c.hash === sel.hash)) return;
      if (sel.type === 'wip' && hasWip(sel.repoId)) return;
    }
    if (state.active) selectDefault(state.active);
  } catch (err) {
    toast((err as Error).message, 'error');
  } finally {
    refreshing = false;
  }
}

// ------------------------------------------------------------------ workspaces (abrir / trocar / fechar)

/** Limpa tudo que pertence ao workspace atual; o layout salvo de cada um continua no localStorage. */
function resetWorkspaceState() {
  state.summary = null;
  state.branchInfo = {};
  state.operations = {};
  state.conflict = null;
  state.amend = {};
  state.pulls = {};
  state.menu = null;
  state.graphs = {};
  state.graphLimit = {};
  state.loadingMore = {};
  state.visible = [];
  state.sizes = {};
  state.timeline = false;
  state.timelineOnly = false;
  state.active = null;
  state.selected = null;
  state.drafts = {};
  state.diff = null;
  state.filter = '';
  state.scroll = null;
  // O servidor encerra os shells do workspace anterior ao trocar/fechar.
  state.terminal.tabs = [];
  state.terminal.active = null;
}

export async function openWorkspace(path: string): Promise<boolean> {
  if (!path.trim() || state.opening) return false;
  state.opening = true;
  try {
    state.app = await api.openWorkspace(path);
    resetWorkspaceState();
    state.welcome = false;
    await refresh();
    toast(`Workspace ${state.app.workspace?.name} aberto`, 'ok');
    return true;
  } catch (err) {
    toast((err as Error).message, 'error');
    return false;
  } finally {
    state.opening = false;
  }
}

/** Abre o seletor nativo (app desktop). No navegador, mostra a tela inicial com o campo de caminho. */
export async function pickWorkspace(kind: 'file' | 'folder' = 'file') {
  if (!desktop) {
    state.welcome = true;
    return;
  }
  const path = await desktop.pickWorkspace(kind);
  if (path) await openWorkspace(path);
}

export async function closeWorkspace() {
  try {
    state.app = await api.closeWorkspace();
    resetWorkspaceState();
    state.welcome = false;
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

export async function removeRecent(path: string) {
  try {
    state.app = await api.removeRecent(path);
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

// ------------------------------------------------------------------ escrita (stage / commit)

export async function run<T>(fn: () => Promise<T>): Promise<T | undefined> {
  if (state.busy) return undefined;
  state.busy = true;
  try {
    return await fn();
  } catch (err) {
    toast((err as Error).message, 'error');
    return undefined;
  } finally {
    state.busy = false;
  }
}

function applyStatus(id: string, status: RepoStatus | undefined) {
  const r = repoById(id);
  if (!r || !status) return;
  r.status = status;
  if (!hasWip(id)) selectDefault(id);
}

export async function stageFiles(id: string, files: string[] | 'all') {
  applyStatus(id, await run(() => api.stage(id, files)));
}

export async function unstageFiles(id: string, files: string[] | 'all') {
  applyStatus(id, await run(() => api.unstage(id, files)));
}

export async function commitStaged(id: string) {
  const draft = state.drafts[id];
  if (!draft?.summary.trim()) return;
  const amend = !!state.amend[id];
  const res = await run(() => (amend ? api.amend(id, draft.summary, draft.body) : api.commitNow(id, draft.summary, draft.body)));
  if (!res) return;
  state.drafts[id] = { summary: '', body: '' };
  state.amend[id] = false;
  toast(`${amend ? 'Commit emendado' : 'Commit'} ${res.hash.slice(0, 7)} ${amend ? 'em' : 'criado em'} ${repoById(id)?.name}`, 'ok');
  repoById(id)!.status = res.status;
  state.graphs[id] = await fetchGraph(id);
  selectCommit(id, res.hash, true);
}

// ------------------------------------------------------------------ diff

async function openDiff(title: string, key: string, fetcher: () => Promise<{ diff: string }>, work?: DiffView['work']) {
  state.diff = { title, key, loading: true, text: '', error: null, work };
  try {
    const { diff } = await fetcher();
    if (state.diff?.key === key) state.diff = { ...state.diff, loading: false, text: diff };
  } catch (err) {
    if (state.diff?.key === key) state.diff = { ...state.diff, loading: false, error: (err as Error).message };
  }
}

export function openCommitDiff(id: string, hash: string, file: string) {
  return openDiff(`${repoById(id)?.name} · ${hash.slice(0, 7)} · ${file}`, `c:${hash}:${file}`, () => api.commitDiff(id, hash, file));
}

export function openWorkDiff(id: string, file: string, staged: boolean) {
  if (IS_STATIC) return;
  return openDiff(`${repoById(id)?.name} · ${staged ? 'staged' : 'working'} · ${file}`, `w:${staged}:${file}`, () => api.workDiff(id, file, staged), {
    repoId: id, file, staged,
  });
}

/** Por que um arquivo só pode ir para o stage inteiro (espelha partialUnsupported de src/git/partial.ts). */
export function partialBlocked(id: string, file: string, staged: boolean): string | null {
  const f = statusOf(id)?.files.find((x) => x.path === file);
  if (!f) return 'O arquivo não está mais no status.';
  if (f.conflict) return 'Arquivo em conflito: resolva o conflito antes.';
  if (!staged && f.work === '?') return 'Arquivo novo: coloque no stage inteiro.';
  if (f.orig) return 'Arquivo renomeado: coloque no stage inteiro.';
  return null;
}

/**
 * Stage (ou unstage, no diff do stage) só das linhas escolhidas do diff aberto.
 * Depois recarrega o status e o diff: as linhas aplicadas saem dele.
 */
export async function applyDiffLines(lines: number[]): Promise<boolean> {
  const d = state.diff;
  if (!d?.work || !lines.length || state.busy) return false;
  const { repoId, file, staged } = d.work;
  state.busy = true;
  try {
    const status = await (staged ? api.unstageLines : api.stageLines)(repoId, file, lines, d.text);
    const r = repoById(repoId);
    if (r) r.status = status;
    toast(`${lines.length} linha(s) ${staged ? 'tirada(s) do' : 'colocada(s) no'} stage`, 'ok');
    return true;
  } catch (err) {
    toast((err as Error).message, 'error');
    return false;
  } finally {
    state.busy = false;
    // Sucesso ou arquivo que mudou no meio: recarrega o diff do mesmo lado.
    if (state.diff?.key === d.key) void openWorkDiff(repoId, file, staged);
  }
}

export function closeDiff() {
  state.diff = null;
}

// ------------------------------------------------------------------ recarregar um repo depois de uma operação

/** Recarrega status, grafo e (se já carregados) branches/operação de um repo. */
export async function refreshRepo(id: string) {
  const r = repoById(id);
  if (!r) return;
  try {
    const [status, graph] = await Promise.all([api.status(id), fetchGraph(id)]);
    r.status = status;
    state.graphs[id] = graph;
    await Promise.all([
      state.branchInfo[id] ? loadBranches(id) : null,
      status.operation ? loadOperation(id) : ((state.operations[id] = null), null),
    ]);
    // A seleção pode ter sumido (ex.: commit desfeito): volta para o padrão.
    const sel = state.selected;
    if (sel?.repoId === id) {
      if (sel.type === 'commit' && !graph.commits.some((c) => c.hash === sel.hash)) selectDefault(id);
      if (sel.type === 'wip' && !hasWip(id)) selectDefault(id);
    }
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

export async function loadBranches(id: string) {
  state.branchInfo[id] = await api.branches(id);
}

export async function loadOperation(id: string) {
  state.operations[id] = await api.operation(id);
}

// ------------------------------------------------------------------ tempo real

type ChangeKind = 'repo' | 'status';

/** Só a árvore de trabalho mudou: recarrega o status, sem mexer na seleção (a não ser que o WIP tenha sumido). */
async function refreshStatus(id: string) {
  const r = repoById(id);
  if (!r) return;
  try {
    r.status = await api.status(id);
    if (state.selected?.repoId === id && state.selected.type === 'wip' && !hasWip(id)) selectDefault(id);
  } catch {
    /* repo em mudança (ex.: git com lock): o próximo aviso tenta de novo */
  }
}

// Um aviso por repo por vez: o que chegar durante uma recarga fica guardado e roda logo depois, uma vez só.
const queued = new Map<string, ChangeKind>();
const running = new Set<string>();

function onRepoChange(id: string, kind: ChangeKind) {
  if (!repoById(id)) return;
  const prev = queued.get(id);
  queued.set(id, prev === 'repo' || kind === 'repo' ? 'repo' : 'status');
  if (!running.has(id)) void drain(id);
}

async function drain(id: string) {
  running.add(id);
  try {
    while (queued.has(id)) {
      const kind = queued.get(id)!;
      queued.delete(id);
      if (kind === 'status') await refreshStatus(id);
      else if (state.visible.includes(id)) await refreshRepo(id);
      else {
        // Painel escondido: só o card precisa do status; o grafo é recarregado quando o painel voltar.
        delete state.graphs[id];
        await refreshStatus(id);
      }
    }
  } finally {
    running.delete(id);
  }
}

let events: EventSource | null = null;

/**
 * Tempo real: o servidor observa os repos e avisa quando algo muda (commit no VS Code, pull no terminal,
 * arquivo salvo…). O EventSource reconecta sozinho se a conexão cair; enquanto isso, `state.live` fica falso
 * e a janela volta a se atualizar ao receber o foco.
 */
export function connectEvents() {
  if (IS_STATIC || events) return;
  events = new EventSource(eventsUrl());
  events.onopen = () => (state.live = true);
  events.onerror = () => (state.live = false);
  events.onmessage = (ev) => {
    const change = JSON.parse(ev.data) as { repoId: string; kind: ChangeKind };
    onRepoChange(change.repoId, change.kind);
  };
}
