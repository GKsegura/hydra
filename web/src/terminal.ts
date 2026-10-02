// Hydra — © 2026 José Segura (GKsegura) · MIT
import { nextTick, watch } from 'vue';
import { api, IS_STATIC } from './api.ts';
import { applyTermLayout, repoById, state, termLayout, toast } from './store.ts';
import {
  addTab, canSplit, closeTerminal as closeInLayout, focus, moveToPane, setRatio, splitWith, unsplit, type SplitDirection,
} from './terminal-layout.ts';

// A altura do dock vale para todos os workspaces (localStorage). A lista de abas de cada guia vem do servidor (os shells
// sobrevivem a F5/Ctrl+R; a interface reconecta e repete a saída recente): ver loadTerminals em store.ts.
const PREFS_KEY = 'hydra:terminal';

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    return JSON.parse(storage().getItem(key) || 'null') as T | null;
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value));
  } catch {
    /* storage bloqueado: só não lembramos */
  }
}

const prefs = read<{ height?: number }>(() => localStorage, PREFS_KEY);
if (prefs?.height) state.terminal.height = prefs.height;
try {
  sessionStorage.removeItem('hydra:terminal-tabs'); // formato antigo (uma lista só para todos os workspaces)
} catch {
  /* storage bloqueado */
}

watch(
  () => state.terminal.height,
  (height) => write(() => localStorage, PREFS_KEY, { height }),
);

// Painel de detalhes minimizado: também vale para todos os workspaces.
const DETAIL_KEY = 'hydra:detail-collapsed';
state.detailCollapsed = read<boolean>(() => localStorage, DETAIL_KEY) === true;
watch(
  () => state.detailCollapsed,
  (collapsed) => write(() => localStorage, DETAIL_KEY, collapsed),
);

export async function loadTerminalInfo() {
  if (IS_STATIC) return;
  try {
    state.terminal.info = await api.terminalInfo();
  } catch {
    state.terminal.info = { available: false, shell: null };
  }
}

export const terminalAvailable = () => !IS_STATIC && !!state.terminal.info?.available;

/** Abre o shell no servidor e registra a aba (o layout é atualizado por quem chamou). Devolve o id, ou null se falhou. */
async function spawnTerminal(repoId: string): Promise<string | null> {
  if (!terminalAvailable()) {
    toast('Terminal integrado indisponível: o módulo node-pty não foi instalado.', 'error');
    return null;
  }
  try {
    // O tamanho real chega pelo WebSocket assim que o xterm se ajusta ao dock.
    const { id, shell } = await api.openTerminal(repoId, 80, 24);
    state.terminal.tabs.push({ id, repoId, shell });
    return id;
  } catch (err) {
    toast((err as Error).message, 'error');
    return null;
  }
}

/** Abre uma aba nova na pasta do repo (padrão: o repo em foco): ocupa o painel em foco e mostra o dock. */
export async function openTerminal(repoId: string | null = state.active) {
  if (!repoId) return;
  const id = await spawnTerminal(repoId);
  if (!id) return;
  applyTermLayout(addTab(termLayout(), id));
  state.terminal.open = true;
}

/** Divide o dock e abre um terminal novo, no repo escolhido, na nova área (que ganha o foco). */
export async function splitTerminal(direction: SplitDirection, repoId: string) {
  const id = await spawnTerminal(repoId);
  if (!id) return;
  applyTermLayout(splitWith(termLayout(), direction, id));
  state.terminal.open = true;
}

/** Divide o dock levando para a nova área um terminal que já estava aberto como aba. */
export function splitWithTerminal(direction: SplitDirection, id: string) {
  applyTermLayout(splitWith(termLayout(), direction, id));
}

/** Desfaz a divisão: fica só o terminal em foco; o outro continua como aba. */
export function unsplitTerminal() {
  applyTermLayout(unsplit(termLayout()));
}

/** Dá foco a um terminal (clique no painel ou na aba). Uma aba que não estava à vista ocupa o painel em foco. */
export function focusTerminal(id: string) {
  applyTermLayout(focus(termLayout(), id));
}

export function setSplitRatio(ratio: number) {
  applyTermLayout(setRatio(termLayout(), ratio));
}

/** Leva um terminal para o painel 0 (primeiro) ou 1 (segundo) de um dock dividido. */
export function moveTerminalToPane(id: string, index: 0 | 1) {
  applyTermLayout(moveToPane(termLayout(), id, index));
}

/** Tamanho da área dos terminais (px), para saber se cabe uma divisão. Sem o dock na tela, 0. */
function dockSize() {
  const body = document.querySelector<HTMLElement>('.term-body');
  return { width: body?.clientWidth ?? 0, height: body?.clientHeight ?? 0 };
}

/** Cabe uma divisão nessa direção? Sem isso os painéis ficariam minúsculos; avisa em vez de dividir. */
export function fitsSplit(direction: SplitDirection): boolean {
  const { width, height } = dockSize();
  const ok = canSplit(direction, width, height);
  if (!ok) {
    toast(direction === 'columns' ? 'A janela está estreita demais para dividir lado a lado.' : 'O terminal está baixo demais para dividir. Aumente a altura do dock.', 'error');
  }
  return ok;
}

/**
 * Atalho de dividir (Ctrl+\ lado a lado, Ctrl+Shift+\ empilhado). Sem terminal, abre um. Sem divisão, divide com um terminal
 * novo no repo do terminal em foco; já dividido na mesma direção, desfaz; já dividido na outra, só troca a direção.
 */
export async function splitShortcut(direction: SplitDirection) {
  const focused = state.terminal.tabs.find((t) => t.id === state.terminal.active);
  if (!focused) return openTerminal();
  if (!state.terminal.open) state.terminal.open = true;
  if (state.terminal.split === direction) return unsplitTerminal();
  if (state.terminal.split) return splitWithTerminal(direction, focused.id);
  await nextTick(); // o dock acabou de abrir? espera a tela para medir
  if (fitsSplit(direction)) await splitTerminal(direction, focused.repoId);
}

/** Passa o foco para o outro painel (Ctrl+Alt+setas), se o dock estiver dividido. */
export function focusOtherPane() {
  const { panes, active } = state.terminal;
  if (panes.length < 2) return;
  focusTerminal(panes[(panes.indexOf(active ?? '') + 1) % panes.length]);
}

/** Ctrl+`: mostra/esconde o dock. Sem nenhuma aba, abre uma no repo em foco. */
export function toggleTerminal() {
  if (!state.terminal.open && !state.terminal.tabs.length) return openTerminal();
  state.terminal.open = !state.terminal.open;
}

/** Fecha a aba e encerra o shell. `killed`: o shell já saiu (exit), só tira a aba. */
export function closeTerminal(id: string, killed = false) {
  const tabs = state.terminal.tabs;
  const i = tabs.findIndex((t) => t.id === id);
  if (i < 0) return;
  applyTermLayout(closeInLayout(termLayout(), id)); // dividido: o outro ocupa tudo; senão o foco vai para a vizinha
  tabs.splice(i, 1);
  if (!tabs.length) state.terminal.open = false;
  if (!killed) api.closeTerminal(id).catch(() => {});
}

export const tabTitle = (repoId: string) => repoById(repoId)?.name ?? repoId;
