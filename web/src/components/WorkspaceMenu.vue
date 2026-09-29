<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { desktop, IS_STATIC } from '../api.ts';
import { openDialog } from '../actions.ts';
import { activateTab, closeWorkspace, openWorkspace, pickWorkspace, state } from '../store.ts';

const open = ref(false);
const root = ref<HTMLElement>();

const others = computed(() => (state.app?.recents ?? []).filter((r) => r.path !== state.app?.workspace?.source).slice(0, 8));

function run(fn: () => unknown) {
  open.value = false;
  fn();
}

function onDocClick(ev: MouseEvent) {
  if (open.value && !root.value?.contains(ev.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener('mousedown', onDocClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
  <div v-if="state.summary" ref="root" class="ws-menu">
    <button class="ws-name" :disabled="IS_STATIC" :title="IS_STATIC ? '' : 'Trocar de workspace'" @click="open = !open">
      workspace <b>{{ state.summary.name }}</b> · {{ state.summary.repos.length }} repositórios
      <span v-if="!IS_STATIC" class="caret">▾</span>
    </button>

    <div v-if="open" class="menu" role="menu">
      <template v-if="others.length">
        <div class="menu-label">Recentes</div>
        <button v-for="r in others" :key="r.path" class="menu-item" :title="r.path" @click="run(() => openWorkspace(r.path))">
          <span>{{ r.name }}</span><span class="faint"><bdi>{{ r.path }}</bdi></span>
        </button>
        <div class="menu-sep" />
      </template>
      <button class="menu-item" @click="run(() => openDialog('clone'))"><span>Clonar repositório…</span><kbd>Ctrl+Shift+O</kbd></button>
      <button class="menu-item" @click="run(() => openDialog('init'))"><span>Novo repositório…</span></button>
      <div class="menu-sep" />
      <button class="menu-item" @click="run(() => pickWorkspace('file'))">
        <span>Abrir workspace…</span><kbd>Ctrl+O</kbd>
      </button>
      <button v-if="desktop" class="menu-item" @click="run(() => pickWorkspace('folder'))"><span>Abrir repositório ou pasta…</span></button>
      <button class="menu-item" @click="run(() => activateTab(null))"><span>Tela inicial</span></button>
      <div class="menu-sep" />
      <button class="menu-item" @click="run(closeWorkspace)"><span>Fechar guia</span><kbd>Ctrl+W</kbd></button>
    </div>
  </div>
</template>
