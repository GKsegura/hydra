<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { terminalSocketUrl } from '../api.ts';
import { state, toast, type TerminalTab } from '../store.ts';
import { closeTerminal, tabTitle } from '../terminal.ts';

const props = defineProps<{ tab: TerminalTab; active: boolean }>();

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
  if (!el || !props.active || !el.clientWidth || !el.clientHeight) return;
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
  if (props.active) term.focus();
});

watch(
  () => [props.active, state.terminal.open],
  async ([active, open]) => {
    if (!active || !open) return;
    await nextTick();
    refit();
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
  <div v-show="active" ref="box" class="term-view" />
</template>
