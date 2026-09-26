<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { ref } from 'vue';
import { openMenu } from '../actions.ts';
import { repoColor, state } from '../store.ts';
import { closeTerminal, openTerminal, tabTitle } from '../terminal.ts';
import AppIcon from './AppIcon.vue';
import TerminalView from './TerminalView.vue';

const MIN_HEIGHT = 120;
const dragging = ref(false);

/** Arrasta a borda de cima do dock. O limite deixa sempre um pedaço dos grafos à vista. */
function startResize(ev: PointerEvent) {
  if (ev.button !== 0) return;
  ev.preventDefault();
  const handle = ev.currentTarget as HTMLElement;
  const center = handle.closest('.center') as HTMLElement | null;
  const max = Math.max(MIN_HEIGHT, (center?.clientHeight ?? 600) - 120);
  const startY = ev.clientY;
  const startH = state.terminal.height;
  handle.setPointerCapture(ev.pointerId);
  dragging.value = true;
  document.body.classList.add('resizing-v');

  const move = (e: PointerEvent) => {
    state.terminal.height = Math.round(Math.min(max, Math.max(MIN_HEIGHT, startH - (e.clientY - startY))));
  };
  const up = () => {
    dragging.value = false;
    document.body.classList.remove('resizing-v');
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

/** "+" abre no repo em foco; a setinha ao lado escolhe outro repo do workspace. */
function pickRepo(ev: MouseEvent) {
  openMenu(ev, (state.summary?.repos ?? []).map((r) => ({ label: r.name, run: () => openTerminal(r.id) })));
}

function tabMenu(ev: MouseEvent, id: string, repoId: string) {
  openMenu(ev, [
    { label: `Novo terminal em ${tabTitle(repoId)}`, run: () => openTerminal(repoId) },
    { separator: true, label: '' },
    { label: 'Fechar terminal', danger: true, run: () => closeTerminal(id) },
  ]);
}
</script>

<template>
  <div v-show="state.terminal.open" class="term-dock" :style="{ height: `${state.terminal.height}px` }">
    <div class="term-resize" :class="{ drag: dragging }" title="Arraste para redimensionar" @pointerdown="startResize" />
    <div class="term-bar">
      <AppIcon name="terminal" :size="14" class="term-icon" />
      <div class="term-tabs" role="tablist">
        <button
          v-for="t in state.terminal.tabs"
          :key="t.id"
          class="term-tab"
          :class="{ active: state.terminal.active === t.id }"
          role="tab"
          :title="`${t.shell} · ${tabTitle(t.repoId)}`"
          @click="state.terminal.active = t.id"
          @auxclick.middle="closeTerminal(t.id)"
          @contextmenu="tabMenu($event, t.id, t.repoId)"
        >
          <span class="repo-dot" :style="{ '--c': repoColor(t.repoId) }" />
          <span class="name">{{ tabTitle(t.repoId) }}</span>
          <span class="x" title="Fechar terminal" @click.stop="closeTerminal(t.id)">✕</span>
        </button>
      </div>
      <button class="btn ghost sm" title="Novo terminal no repositório em foco" :disabled="!state.active" @click="openTerminal()">+</button>
      <button class="btn ghost sm" title="Novo terminal em outro repositório" @click="pickRepo">▾</button>
      <span class="spacer" />
      <span class="term-shell">{{ state.terminal.info?.shell }}</span>
      <button class="btn ghost sm" title="Esconder terminal (Ctrl+`)" @click="state.terminal.open = false">—</button>
    </div>
    <div class="term-body">
      <TerminalView v-for="t in state.terminal.tabs" :key="t.id" :tab="t" :active="state.terminal.active === t.id" />
    </div>
  </div>
</template>
