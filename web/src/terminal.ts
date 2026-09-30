// Hydra — © 2026 José Segura (GKsegura) · MIT
import { watch } from 'vue';
import { api, IS_STATIC } from './api.ts';
import { applyTermLayout, repoById, state, termLayout, toast } from './store.ts';
import {
  addTab, closeTerminal as closeInLayout, focus, moveToPane, setRatio, splitWith, unsplit, type SplitDirection,
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
