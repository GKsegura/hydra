<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { openMenu } from '../actions.ts';
import { repoColor, state, toast } from '../store.ts';
import {
  closeTerminal, focusTerminal, moveTerminalToPane, openTerminal, setSplitRatio, splitTerminal, splitWithTerminal, tabTitle, unsplitTerminal,
} from '../terminal.ts';
import { canSplit, MAX_RATIO, MIN_RATIO, type SplitDirection } from '../terminal-layout.ts';
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

const body = ref<HTMLElement>();
const split = computed(() => state.terminal.split);

/** Cabe uma divisão nessa direção? Sem isso os painéis ficariam minúsculos; avisa em vez de dividir. */
function fits(direction: SplitDirection): boolean {
  const ok = canSplit(direction, body.value?.clientWidth ?? 0, body.value?.clientHeight ?? 0);
  if (!ok) {
    toast(direction === 'columns' ? 'A janela está estreita demais para dividir lado a lado.' : 'O terminal está baixo demais para dividir. Aumente a altura do dock.', 'error');
  }
  return ok;
}

/** "Dividir": escolhe o repositório do terminal novo (o do terminal em foco vem primeiro). */
function pickSplit(ev: MouseEvent, direction: SplitDirection) {
  if (!fits(direction)) return;
  const repos = state.summary?.repos ?? [];
  const focusedRepo = state.terminal.tabs.find((t) => t.id === state.terminal.active)?.repoId;
  const ordered = [...repos.filter((r) => r.id === focusedRepo), ...repos.filter((r) => r.id !== focusedRepo)];
  openMenu(ev, ordered.map((r) => ({ label: r.name, run: () => splitTerminal(direction, r.id) })));
}

function tabMenu(ev: MouseEvent, id: string, repoId: string) {
  const inSplit = !!split.value && state.terminal.panes.includes(id);
  openMenu(ev, [
    { label: `Novo terminal em ${tabTitle(repoId)}`, run: () => openTerminal(repoId) },
    { separator: true, label: '' },
    { label: 'Abrir ao lado', run: () => fits('columns') && splitWithTerminal('columns', id), disabled: id === state.terminal.active && !split.value },
    { label: 'Abrir abaixo', run: () => fits('rows') && splitWithTerminal('rows', id), disabled: id === state.terminal.active && !split.value },
    ...(split.value
      ? [
          { label: 'Mostrar no primeiro painel', run: () => moveTerminalToPane(id, 0), disabled: state.terminal.panes[0] === id },
          { label: 'Mostrar no segundo painel', run: () => moveTerminalToPane(id, 1), disabled: state.terminal.panes[1] === id },
          { label: 'Desfazer a divisão', run: unsplitTerminal },
        ]
      : []),
    { separator: true, label: '' },
    { label: inSplit ? 'Fechar este painel' : 'Fechar terminal', danger: true, run: () => closeTerminal(id) },
  ]);
}

/** Arrastar a divisória entre os painéis: a fração é a posição do ponteiro dentro da área dos terminais. */
const dividerDrag = ref(false);
function startDivider(ev: PointerEvent) {
  if (ev.button !== 0 || !body.value) return;
  ev.preventDefault();
  const handle = ev.currentTarget as HTMLElement;
  const box = body.value.getBoundingClientRect();
  const horizontal = state.terminal.split === 'columns';
  handle.setPointerCapture(ev.pointerId);
  dividerDrag.value = true;
  document.body.classList.add(horizontal ? 'resizing-h' : 'resizing-v');
  const move = (e: PointerEvent) => {
    const r = horizontal ? (e.clientX - box.left) / box.width : (e.clientY - box.top) / box.height;
    setSplitRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)));
  };
  const up = () => {
    dividerDrag.value = false;
    document.body.classList.remove('resizing-h', 'resizing-v');
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', up);
    handle.removeEventListener('pointercancel', up);
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
}

// As células do grid seguem a proporção; uma folga de 4px separa os painéis e a divisória fica no meio dela.
const GAP = 4;
const gridStyle = computed(() => {
  const r = state.terminal.ratio;
  const tracks = `minmax(0, ${r}fr) minmax(0, ${1 - r}fr)`;
  if (split.value === 'columns') return { gridTemplateColumns: tracks, gridTemplateRows: 'minmax(0, 1fr)', gap: `${GAP}px` };
  if (split.value === 'rows') return { gridTemplateRows: tracks, gridTemplateColumns: 'minmax(0, 1fr)', gap: `${GAP}px` };
  return { gridTemplateColumns: 'minmax(0, 1fr)', gridTemplateRows: 'minmax(0, 1fr)' };
});
const dividerStyle = computed(() => {
  const at = `calc((100% - ${GAP}px) * ${state.terminal.ratio} + ${GAP / 2}px)`;
  return split.value === 'columns' ? { left: at } : { top: at };
});
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
          :class="{ active: state.terminal.active === t.id, shown: split && state.terminal.panes.includes(t.id) }"
          role="tab"
          :title="`${t.shell} · ${tabTitle(t.repoId)}`"
          @click="focusTerminal(t.id)"
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
      <span class="term-sep" />
      <button class="btn ghost sm" title="Dividir: novo terminal lado a lado" :disabled="!state.terminal.tabs.length" @click="pickSplit($event, 'columns')">
        <svg class="split-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M8 3v10" /></svg>
      </button>
      <button class="btn ghost sm" title="Dividir: novo terminal empilhado" :disabled="!state.terminal.tabs.length" @click="pickSplit($event, 'rows')">
        <svg class="split-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M2 8h12" /></svg>
      </button>
      <button v-if="split" class="btn ghost sm" title="Desfazer a divisão (os terminais continuam abertos)" @click="unsplitTerminal">Desfazer divisão</button>
      <span class="spacer" />
      <span class="term-shell">{{ state.terminal.info?.shell }}</span>
      <button class="btn ghost sm" title="Esconder terminal (Ctrl+`)" @click="state.terminal.open = false">—</button>
    </div>
    <div ref="body" class="term-body" :style="gridStyle">
      <TerminalView
        v-for="t in state.terminal.tabs"
        :key="t.id"
        :tab="t"
        :visible="state.terminal.panes.includes(t.id)"
        :focused="state.terminal.active === t.id"
        :index="Math.max(0, state.terminal.panes.indexOf(t.id))"
        @focus="focusTerminal(t.id)"
      />
      <div
        v-if="split"
        class="term-divider"
        :class="[split, { drag: dividerDrag }]"
        :style="dividerStyle"
        title="Arraste para ajustar o tamanho dos painéis"
        @pointerdown="startDivider"
      />
    </div>
  </div>
</template>
