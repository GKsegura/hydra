<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { branchMenu, checkout, openDialog, openMenu } from '../actions.ts';
import { loadBranches, state, statusOf } from '../store.ts';
import { ago } from '../utils.ts';
import AppIcon from './AppIcon.vue';

// Seletor de branch da barra do painel, no estilo do GitHub Desktop: buscar, trocar, criar e agir sobre branches.
const props = defineProps<{ repoId: string }>();
const open = ref(false);
const search = ref('');
const root = ref<HTMLElement>();
const input = ref<HTMLInputElement>();
const loading = ref(false);
const btn = ref<HTMLElement>();
const popStyle = ref<Record<string, string>>({});

const status = computed(() => statusOf(props.repoId));
const label = computed(() => status.value?.branch ?? (status.value?.detached ? 'HEAD destacado' : '—'));

const info = computed(() => state.branchInfo[props.repoId]);
const q = computed(() => search.value.trim().toLowerCase());
const locals = computed(() => (info.value?.branches ?? []).filter((b) => b.kind === 'local' && (!q.value || b.name.toLowerCase().includes(q.value))).sort((a, b) => Number(b.current) - Number(a.current) || b.time - a.time));
// Remotas que ainda não têm uma local com o mesmo nome (as outras já aparecem como local).
const remotesOnly = computed(() => {
  const localNames = new Set((info.value?.branches ?? []).filter((b) => b.kind === 'local').map((b) => b.name));
  return (info.value?.branches ?? [])
    .filter((b) => b.kind === 'remote' && !localNames.has(b.name.slice((b.remote?.length ?? 0) + 1)))
    .filter((b) => !q.value || b.name.toLowerCase().includes(q.value))
    .sort((a, b) => b.time - a.time);
});

async function toggle() {
  open.value = !open.value;
  if (!open.value) return;
  search.value = '';
  // A barra do painel corta o que passa dela: o popup é "fixed", posicionado a partir do botão.
  const r = btn.value!.getBoundingClientRect();
  popStyle.value = { top: `${r.bottom + 6}px`, left: `${Math.max(8, Math.min(r.left, window.innerWidth - 390))}px` };
  loading.value = true;
  await loadBranches(props.repoId).catch(() => {});
  loading.value = false;
  await nextTick();
  input.value?.focus();
}

function pick(name: string) {
  open.value = false;
  checkout(props.repoId, name);
}

function action(fn: () => unknown) {
  open.value = false;
  fn();
}

function onDoc(ev: MouseEvent) {
  if (open.value && !root.value?.contains(ev.target as Node) && !(ev.target as HTMLElement).closest('.ctx-menu')) open.value = false;
}
onMounted(() => document.addEventListener('mousedown', onDoc));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc));
</script>

<template>
  <div ref="root" class="branch-menu">
    <button ref="btn" class="branch-btn" :title="`Branch atual: ${label} — clique para trocar`" @click.stop="toggle">
      <AppIcon name="branch" /><span class="name">{{ label }}</span><span class="caret">▾</span>
    </button>
    <div v-if="open" class="branch-pop" :style="popStyle" @click.stop>
      <div class="branch-pop-head">
        <input ref="input" v-model="search" placeholder="Filtrar ou digitar nome da nova branch…" spellcheck="false"
               @keydown.enter="locals[0] ? pick(locals[0].name) : action(() => openDialog('create-branch', { repoId }))"
               @keydown.esc="open = false">
        <button class="btn sm primary" @click="action(() => openDialog('create-branch', { repoId }))">Nova branch</button>
      </div>
      <div class="branch-pop-list">
        <div v-if="loading && !info" class="faint pad">Carregando…</div>
        <div class="group-label">Locais</div>
        <button v-for="b in locals" :key="b.name" class="branch-item" :class="{ current: b.current }"
                @click="b.current ? (open = false) : pick(b.name)" @contextmenu="openMenu($event, branchMenu(repoId, b.name, 'local'))">
          <span class="mark">{{ b.current ? '✓' : '' }}</span>
          <span class="name">{{ b.name }}</span>
          <span v-if="b.upstreamGone" class="tag-mini warn" title="A branch remota foi apagada">remota apagada</span>
          <span v-else-if="b.ahead || b.behind" class="ab"><span v-if="b.ahead" class="up">↑{{ b.ahead }}</span><span v-if="b.behind" class="down">↓{{ b.behind }}</span></span>
          <span class="when faint">{{ ago(b.time) }}</span>
          <span class="more-btn" title="Mais ações" @click.stop="openMenu($event, branchMenu(repoId, b.name, 'local'))">⋯</span>
        </button>
        <template v-if="remotesOnly.length">
          <div class="group-label">Só no remoto</div>
          <button v-for="b in remotesOnly" :key="b.name" class="branch-item" @click="pick(b.name)" @contextmenu="openMenu($event, branchMenu(repoId, b.name, 'remote'))">
            <span class="mark"><AppIcon name="remote" /></span>
            <span class="name">{{ b.name }}</span>
            <span class="when faint">{{ ago(b.time) }}</span>
            <span class="more-btn" title="Mais ações" @click.stop="openMenu($event, branchMenu(repoId, b.name, 'remote'))">⋯</span>
          </button>
        </template>
        <div v-if="!locals.length && !remotesOnly.length && !loading" class="faint pad">
          Nenhuma branch "{{ search }}". <a href="#" @click.prevent="action(() => openDialog('create-branch', { repoId }))">Criar?</a>
        </div>
      </div>
      <div class="branch-pop-foot">
        <button class="btn sm" :disabled="!status?.branch" @click="action(() => openDialog('merge', { repoId }))">Merge em {{ status?.branch ?? '…' }}…</button>
        <small class="faint">Clique direito numa branch para mais ações</small>
      </div>
    </div>
  </div>
</template>
