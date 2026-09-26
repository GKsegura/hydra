<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { saveLayout, state } from '../store.ts';
import { MIN_PANE } from '../utils.ts';
import GraphPane from './GraphPane.vue';

const SPLITTER = 6;
const box = ref<HTMLElement>();
const dragging = ref<number | null>(null);

/**
 * Distribui a largura disponível entre os painéis, mantendo a proporção atual.
 * Painéis sem tamanho (recém-abertos, ou após "Igualar") entram com a média dos outros.
 */
function fit() {
  const el = box.value;
  const ids = state.visible;
  if (!el || !ids.length) return;
  const available = el.clientWidth - SPLITTER * (ids.length - 1);
  const known = ids.map((id) => state.sizes[id]).filter((n): n is number => !!n);
  const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const current = ids.map((id) => state.sizes[id] || avg);
  const total = current.reduce((a, b) => a + b, 0);
  ids.forEach((id, i) => (state.sizes[id] = Math.max(MIN_PANE, Math.floor((current[i] / total) * available))));
}

/**
 * Arrasta a divisória entre o painel i-1 e o i. O da esquerda cresce/encolhe;
 * o da direita compensa até o mínimo — passando disso, a área rola na horizontal.
 */
function startResize(i: number, ev: PointerEvent) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  const leftId = state.visible[i - 1];
  const rightId = state.visible[i];
  const lw = state.sizes[leftId] ?? MIN_PANE;
  const rw = state.sizes[rightId] ?? MIN_PANE;
  const startX = ev.clientX;
  const handle = ev.currentTarget as HTMLElement;
  handle.setPointerCapture(ev.pointerId);
  dragging.value = i;
  document.body.classList.add('resizing');

  const move = (e: PointerEvent) => {
    const left = Math.max(MIN_PANE, lw + e.clientX - startX);
    state.sizes[leftId] = left;
    state.sizes[rightId] = Math.max(MIN_PANE, rw - (left - lw));
  };
  const up = () => {
    dragging.value = null;
    document.body.classList.remove('resizing');
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
    saveLayout();
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

function equalizeNow() {
  state.sizes = {};
}

// Reajusta quando a janela muda, quando painéis entram/saem e depois de "Igualar".
let observer: ResizeObserver | undefined;
let lastWidth = 0;
onMounted(() => {
  observer = new ResizeObserver(() => {
    const w = box.value?.clientWidth ?? 0;
    if (w !== lastWidth) {
      lastWidth = w;
      fit();
    }
  });
  if (box.value) observer.observe(box.value);
});
onBeforeUnmount(() => observer?.disconnect());

watch(
  () => [state.visible.join('|'), Object.keys(state.sizes).length === 0] as const,
  () => nextTick(fit),
);
</script>

<template>
  <div ref="box" class="panes">
    <div v-if="!state.visible.length" class="panes-empty">
      Nenhum repositório visível.<br>Marque algum na barra lateral ou clique num card.
    </div>
    <template v-for="(id, i) in state.visible" :key="id">
      <div
        v-if="i > 0"
        class="splitter"
        :class="{ drag: dragging === i }"
        title="Arraste para redimensionar · duplo clique iguala"
        @pointerdown="startResize(i, $event)"
        @dblclick="equalizeNow"
      />
      <GraphPane :repo-id="id" :width="state.sizes[id] ?? MIN_PANE" />
    </template>
  </div>
</template>
