<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue';
import { desktop, IS_STATIC } from './api.ts';
import { fetchRepo, loadGitHub, openDialog, openIn, openOnGitHub, pullRepo, pushRepo } from './actions.ts';
import CommitDetail from './components/CommitDetail.vue';
import ConflictResolver from './components/ConflictResolver.vue';
import ContextMenu from './components/ContextMenu.vue';
import DialogHost from './components/dialogs/DialogHost.vue';
import DiffViewer from './components/DiffViewer.vue';
import PanesView from './components/PanesView.vue';
import RepoCards from './components/RepoCards.vue';
import SideBar from './components/SideBar.vue';
import TopBar from './components/TopBar.vue';
import WelcomeScreen from './components/WelcomeScreen.vue';
import WipPanel from './components/WipPanel.vue';
import { closeDiff, closeWorkspace, hasWip, moveSelection, openWorkspace, pickWorkspace, refresh, state } from './store.ts';

const topbar = ref<InstanceType<typeof TopBar>>();

// Título da janela/aba com o workspace aberto.
watchEffect(() => {
  document.title = state.summary ? `${state.summary.name} — Hydra` : 'Hydra';
});

// Tela inicial: sem workspace aberto, ou quando o usuário pediu "Abrir outro…" no navegador.
const showWelcome = computed(() => !IS_STATIC && !!state.app && (!state.app.workspace || state.welcome));

/** Ações do menu do app desktop e dos atalhos de teclado. Sem repo em foco, as de repositório são ignoradas. */
function runAction(action: string) {
  const id = state.active;
  const needsRepo = (fn: (repoId: string) => unknown) => (id ? fn(id) : undefined);
  switch (action) {
    case 'clone': return openDialog('clone');
    case 'init': return openDialog('init');
    case 'open-file': return pickWorkspace('file');
    case 'open-folder': return pickWorkspace('folder');
    case 'close': return closeWorkspace();
    case 'github': return openDialog('github');
    case 'fetch': return needsRepo(fetchRepo);
    case 'pull': return needsRepo(pullRepo);
    case 'push': return needsRepo(pushRepo);
    case 'new-branch': return needsRepo((r) => openDialog('create-branch', { repoId: r }));
    case 'merge': return needsRepo((r) => openDialog('merge', { repoId: r }));
    case 'stash': return needsRepo((r) => hasWip(r) && openDialog('stash', { repoId: r }));
    case 'open-editor': return needsRepo((r) => openIn(r, 'editor'));
    case 'open-explorer': return needsRepo((r) => openIn(r, 'explorer'));
    case 'open-terminal': return needsRepo((r) => openIn(r, 'terminal'));
    case 'open-github': return needsRepo(openOnGitHub);
  }
}

function onKey(ev: KeyboardEvent) {
  const inField = (ev.target as HTMLElement).matches('input, textarea, select');
  const ctrl = ev.ctrlKey || ev.metaKey;
  const key = ev.key.toLowerCase();
  if (state.dialog) return; // o diálogo aberto cuida do teclado
  if (ctrl && !IS_STATIC) {
    const shortcut =
      ev.shiftKey && key === 'o' ? 'clone' : ev.shiftKey && key === 'n' ? 'new-branch' : ev.shiftKey && key === 'p' ? 'push'
        : ev.shiftKey && key === 'l' ? 'pull' : !ev.shiftKey && key === 'o' ? 'open-file'
          // Ctrl+N só no app: no navegador ele abre outra janela e não dá para interceptar.
          : !ev.shiftKey && key === 'n' && desktop ? 'init' : null;
    if (shortcut) {
      ev.preventDefault();
      return runAction(shortcut);
    }
  }
  if (ev.key === 'Escape' && state.conflict) return (state.conflict = null);
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'f' && state.summary) {
    ev.preventDefault();
    return topbar.value?.focus();
  }
  if (ev.key === 'F5' && !IS_STATIC) {
    ev.preventDefault();
    return refresh();
  }
  if (ev.key === 'Escape' && state.diff) return closeDiff();
  if (ev.key === 'Escape' && state.welcome) {
    state.welcome = false;
    return;
  }
  if (inField || showWelcome.value) return;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    moveSelection(ev.key === 'ArrowDown' ? 1 : -1);
  }
}

// App desktop: soltar um .code-workspace ou uma pasta na janela abre o workspace.
const dropping = ref(false);
function onDragOver(ev: DragEvent) {
  if (!desktop || !ev.dataTransfer?.types.includes('Files')) return;
  ev.preventDefault();
  dropping.value = true;
}
function onDrop(ev: DragEvent) {
  dropping.value = false;
  const file = ev.dataTransfer?.files[0];
  if (!desktop || !file) return;
  ev.preventDefault();
  const path = desktop.pathForFile(file);
  if (path) openWorkspace(path);
}

// Voltou pra janela (ex.: commitou pelo terminal)? Atualiza.
let lastFocus = Date.now();
function onFocus() {
  if (IS_STATIC || Date.now() - lastFocus < 3000) return;
  lastFocus = Date.now();
  refresh();
}

onMounted(() => {
  window.addEventListener('keydown', onKey);
  window.addEventListener('focus', onFocus);
  desktop?.onMenu(runAction);
  refresh();
  if (!IS_STATIC) loadGitHub();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('focus', onFocus);
});
</script>

<template>
  <div class="app-root" @dragover="onDragOver" @dragleave.self="dropping = false" @drop="onDrop">
    <TopBar ref="topbar" />
    <WelcomeScreen v-if="showWelcome" />
    <template v-else-if="state.summary">
      <RepoCards />
      <main class="main">
        <SideBar />
        <section class="center">
          <PanesView />
          <ConflictResolver v-if="state.conflict" />
          <DiffViewer v-else />
        </section>
        <aside class="detail">
          <WipPanel v-if="state.selected?.type === 'wip'" :key="`wip:${state.selected.repoId}`" :repo-id="state.selected.repoId" />
          <CommitDetail v-else-if="state.selected?.type === 'commit'" :repo-id="state.selected.repoId" :hash="state.selected.hash" />
          <div v-else class="d-note">Selecione um commit ou a linha // WIP.</div>
        </aside>
      </main>
    </template>
    <DialogHost />
    <ContextMenu />
    <div v-if="dropping" class="drop-hint">Solte para abrir o workspace</div>
    <div class="toast" :class="[state.toast.kind, { show: state.toast.show }]" role="status">{{ state.toast.msg }}</div>
  </div>
</template>
