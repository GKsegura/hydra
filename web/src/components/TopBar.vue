<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { BOOT, IS_STATIC } from '../api.ts';
import { matches, refresh, state } from '../store.ts';
import AppIcon from './AppIcon.vue';
import GitHubAccount from './GitHubAccount.vue';
import WorkspaceMenu from './WorkspaceMenu.vue';

const input = ref<HTMLInputElement>();
defineExpose({ focus: () => input.value?.focus() });

const count = computed(() => {
  const q = state.filter.trim().toLowerCase();
  if (!q) return '';
  let hits = 0;
  let total = 0;
  for (const id of state.visible) {
    const commits = state.graphs[id]?.commits ?? [];
    total += commits.length;
    hits += commits.filter((c) => matches(c, q)).length;
  }
  return `${hits} de ${total}`;
});

const generated = BOOT.generatedAt ? new Date(BOOT.generatedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

function clear(ev: KeyboardEvent) {
  state.filter = '';
  (ev.target as HTMLInputElement).blur();
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 26V6M16 26V12M23 26V6M9 12c0 5 7 4 7 9M23 12c0 5-7 4-7 9" /></svg>
      <span>Hydra</span>
    </div>
    <WorkspaceMenu />
    <div class="spacer" />
    <label v-if="state.summary && !state.welcome" class="filter">
      <AppIcon name="search" />
      <input ref="input" v-model="state.filter" type="search" placeholder="Filtrar commits (Ctrl+F)" autocomplete="off" @keydown.esc="clear">
      <span class="muted">{{ count }}</span>
    </label>
    <button v-if="!IS_STATIC && state.summary && !state.welcome" class="btn ghost" title="Atualizar (F5)" @click="refresh"><AppIcon name="refresh" /> Atualizar</button>
    <GitHubAccount v-if="!IS_STATIC" />
    <span class="mode" :class="{ live: !IS_STATIC }">{{ IS_STATIC ? `estático · ${generated}` : '● ao vivo' }}</span>
  </header>
</template>
