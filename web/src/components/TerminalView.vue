<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { terminalSocketUrl } from '../api.ts';
import { repoColor, state, toast, type TerminalTab } from '../store.ts';
import { closeTerminal, tabTitle } from '../terminal.ts';

// `visible`: está na tela (ajusta o tamanho); `focused`: recebe o teclado. Com o dock dividido, dois estão visíveis e um focado.
const props = defineProps<{ tab: TerminalTab; visible: boolean; focused: boolean; index: number }>();
const emit = defineEmits<{ focus: [] }>();
const split = computed(() => state.terminal.split);

const box = ref<HTMLElement>();
const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const term = new Terminal({
  fontFamily: css('--mono') || 'Consolas, monospace',
  fontSize: 13,
  cursorBlink: true,
  scrollback: 5000,
  theme: {
    background: css('--bg'),
    foreground: css('--text'),
    cursor: css('--accent'),
    selectionBackground: 'rgba(61, 139, 255, 0.35)',
    black: '#1c1f26', brightBlack: '#5d6472',
    red: '#ff5c6c', brightRed: '#ff7b88',
    green: '#34d6a6', brightGreen: '#5fe3bb',
    yellow: '#ffb547', brightYellow: '#ffc970',
    blue: '#3d8bff', brightBlue: '#6ba6ff',
    magenta: '#a64dff', brightMagenta: '#c27fff',
    cyan: '#20b2d8', brightCyan: '#56c8e6',
    white: '#d6dae3', brightWhite: '#ffffff',
  },
});
const fit = new FitAddon();
term.loadAddon(fit);

// ------------------------------------------------------------------ conexão com o shell (WebSocket)

let ws: WebSocket | null = null;
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;

const send = (msg: string) => {
  if (ws?.readyState === WebSocket.OPEN) ws.send(msg);
};
const sendSize = () => send(`r${JSON.stringify({ cols: term.cols, rows: term.rows })}`);

function connect() {
  ws = new WebSocket(terminalSocketUrl(props.tab.id));
  ws.onopen = () => {
    retries = 0;
    term.reset(); // o servidor repete a saída recente: começa da tela limpa para não duplicar
    sendSize();
  };
  ws.onmessage = (ev) => term.write(typeof ev.data === 'string' ? ev.data : '');
  ws.onclose = (ev) => {
    ws = null;
    if (disposed) return;
    // 4000: o shell terminou (exit). 4004: o servidor não conhece mais esse terminal.
    if (ev.code === 4000 || ev.code === 4004) return closeTerminal(props.tab.id, true);
    if (retries++ < 5) {
      term.write('\r\n\x1b[2m[Hydra] conexão perdida, reconectando…\x1b[0m\r\n');
      retryTimer = setTimeout(connect, 1000 * retries);
      return;
    }
    toast(`O terminal de ${tabTitle(props.tab.repoId)} foi encerrado.`, 'error');
    closeTerminal(props.tab.id, true);
  };
}

// Comandos git digitados aqui (commit, pull, checkout…) aparecem no grafo pela atualização em tempo real.
term.onData((data) => send(`i${data}`));
term.onResize(sendSize);

// Ctrl+C copia se houver seleção (senão vai para o shell como interrupção); Ctrl+V cola;
// Ctrl+` fica para o Hydra (mostrar/esconder o dock).
term.attachCustomKeyEventHandler((ev) => {
  if (ev.type !== 'keydown' || !(ev.ctrlKey || ev.metaKey)) return true;
  const key = ev.key.toLowerCase();
  if (key === '`') return false;
  // Atalhos do Hydra que passam pelo terminal: dividir (Ctrl+\ e Ctrl+Shift+\; no shell o Ctrl+\ seria SIGQUIT), passar o foco
  // entre painéis (Ctrl+Alt+setas) e trocar de guia (Ctrl+Tab).
  if (key === '\\' || key === '|' || key === 'tab' || (ev.altKey && key.startsWith('arrow'))) return false;
  if (key === 'c' && term.hasSelection()) {
    navigator.clipboard?.writeText(term.getSelection()).catch(() => {});
    term.clearSelection();
    return false;
  }
  if (key === 'v') return false; // o navegador dispara o evento de colar e o xterm envia o texto
  return true;
});

// ------------------------------------------------------------------ tamanho

function refit() {
  const el = box.value;
  if (!el || !props.visible || !el.clientWidth || !el.clientHeight) return;
  try {
    fit.fit();
  } catch {
    // dock escondido durante a medição
  }
}

let observer: ResizeObserver | undefined;
onMounted(() => {
  term.open(box.value!);
  refit();
  connect();
  observer = new ResizeObserver(() => refit());
  observer.observe(box.value!);
  if (props.focused) term.focus();
});

// Apareceu na tela (dock aberto, painel novo, divisão desfeita): ajusta o tamanho. O foco vai só para o painel em foco.
watch(
  () => [props.visible, state.terminal.open, split.value, state.terminal.ratio],
  async ([visible, open]) => {
    if (!visible || !open) return;
    await nextTick();
    refit();
    if (props.focused) term.focus();
  },
);
watch(
  () => props.focused,
  async (focused) => {
    if (!focused || !state.terminal.open) return;
    await nextTick();
    term.focus();
  },
);

onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(retryTimer);
  observer?.disconnect();
  ws?.close();
  term.dispose();
});

defineExpose({ focus: () => term.focus() });
</script>

<template>
  <!-- Cada terminal é uma célula do grid do dock: a posição vem da ordem em `panes`; fora dela fica escondido (mas vivo). -->
  <div
    v-show="visible"
    class="term-pane"
    :class="{ focused: focused && !!split, headed: !!split }"
    :style="split === 'rows' ? { gridRow: index + 1 } : { gridColumn: index + 1 }"
    @pointerdown.capture="emit('focus')"
  >
    <div v-if="split" class="term-pane-head">
      <span class="repo-dot" :style="{ '--c': repoColor(tab.repoId) }" />
      <span class="name">{{ tabTitle(tab.repoId) }}</span>
      <span class="x" title="Fechar terminal" @click.stop="closeTerminal(tab.id)">✕</span>
    </div>
    <div ref="box" class="term-view" />
  </div>
</template>
