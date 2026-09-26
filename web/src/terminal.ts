// Hydra — © 2026 José Segura (GKsegura) · MIT
import { watch } from 'vue';
import { api, IS_STATIC } from './api.ts';
import { repoById, state, toast } from './store.ts';

// A altura do dock vale para todos os workspaces (localStorage). As abas duram só a sessão da página
// (sessionStorage): num F5/Ctrl+R a interface reconecta aos mesmos shells e repete a saída recente.
const PREFS_KEY = 'hydra:terminal';
const TABS_KEY = 'hydra:terminal-tabs';

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
const saved = read<{ tabs: typeof state.terminal.tabs; active: string | null; open: boolean }>(() => sessionStorage, TABS_KEY);
if (saved?.tabs?.length) {
  state.terminal.tabs = saved.tabs;
  state.terminal.active = saved.active;
  state.terminal.open = saved.open;
}

watch(
  () => state.terminal.height,
  (height) => write(() => localStorage, PREFS_KEY, { height }),
);
watch(
  () => [state.terminal.tabs.map((t) => t.id).join(), state.terminal.active, state.terminal.open],
  () => write(() => sessionStorage, TABS_KEY, { tabs: state.terminal.tabs, active: state.terminal.active, open: state.terminal.open }),
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

/** Abre uma aba nova na pasta do repo (padrão: o repo em foco) e mostra o dock. */
export async function openTerminal(repoId: string | null = state.active) {
  if (!terminalAvailable()) {
    toast('Terminal integrado indisponível: o módulo node-pty não foi instalado.', 'error');
    return;
  }
  if (!repoId) return;
  try {
    // O tamanho real chega pelo WebSocket assim que o xterm se ajusta ao dock.
    const { id, shell } = await api.openTerminal(repoId, 80, 24);
    state.terminal.tabs.push({ id, repoId, shell });
    state.terminal.active = id;
    state.terminal.open = true;
  } catch (err) {
    toast((err as Error).message, 'error');
  }
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
  tabs.splice(i, 1);
  if (state.terminal.active === id) state.terminal.active = tabs[Math.min(i, tabs.length - 1)]?.id ?? null;
  if (!tabs.length) state.terminal.open = false;
  if (!killed) api.closeTerminal(id).catch(() => {});
}

export const tabTitle = (repoId: string) => repoById(repoId)?.name ?? repoId;
