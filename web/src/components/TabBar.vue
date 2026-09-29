<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { ref } from 'vue';
import { activateTab, closeTab, reorderTabs, state } from '../store.ts';

/** Nome da guia; se outra tem o mesmo nome (ex.: dois "backend"), acrescenta a pasta de cima para distinguir. */
function label(t: { name: string; source: string | null }): string {
  const same = (state.app?.tabs ?? []).filter((x) => x.name === t.name).length > 1;
  const parts = (t.source ?? '').split(/[\\/]/).filter(Boolean);
  const folder = parts[parts.length - 2];
  return same && folder ? `${t.name} · ${folder}` : t.name;
}

const dragging = ref<string | null>(null);
const over = ref<string | null>(null);

function onDragStart(ev: DragEvent, id: string) {
  dragging.value = id;
  ev.dataTransfer?.setData('text/plain', id);
  if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
}

function onDrop(target: string) {
  const from = dragging.value;
  dragging.value = over.value = null;
  if (!from || from === target) return;
  const ids = (state.app?.tabs ?? []).map((t) => t.id).filter((id) => id !== from);
  ids.splice(ids.indexOf(target), 0, from); // solta antes da guia sobre a qual está
  reorderTabs(ids);
}
</script>

<template>
  <nav class="tabbar" role="tablist" aria-label="Workspaces abertos">
    <!-- O Início é fixo: sempre o primeiro, sem fechar e sem arrastar. -->
    <div class="tab home" role="tab" :class="{ active: state.app!.active === null }" title="Tela inicial" @click="activateTab(null)">
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7.5 8 3l5.5 4.5M4 6.8V13h3V9.5h2V13h3V6.8" /></svg>
      <span class="tab-name">Início</span>
    </div>

    <div
      v-for="t in state.app!.tabs"
      :key="t.id"
      class="tab"
      :class="{ active: state.app!.active === t.id, over: over === t.id && dragging !== t.id, dragging: dragging === t.id }"
      role="tab"
      draggable="true"
      :title="t.source ?? t.name"
      @click="activateTab(t.id)"
      @auxclick.middle.prevent="closeTab(t.id)"
      @dragstart="onDragStart($event, t.id)"
      @dragend="dragging = over = null"
      @dragover.prevent="over = t.id"
      @dragleave="over === t.id && (over = null)"
      @drop.prevent="onDrop(t.id)"
    >
      <span class="tab-name">{{ label(t) }}</span>
      <span class="x" title="Fechar guia (Ctrl+W)" @click.stop="closeTab(t.id)">✕</span>
    </div>
  </nav>
</template>
