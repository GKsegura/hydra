<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, desktop } from '../../api.ts';
import { closeDialog, cloneRepo, githubLogin } from '../../actions.ts';
import { state } from '../../store.ts';
import type { GitHubRepo, Progress } from '../../types.ts';
import { ago } from '../../utils.ts';
import BaseDialog from './BaseDialog.vue';
import ProgressBar from './ProgressBar.vue';

const LAST_PARENT = 'hydra:clone-parent';

const tab = ref<'github' | 'url'>(state.github?.user ? 'github' : 'url');
const url = ref('');
const parent = ref(readParent());
const name = ref('');
const repos = ref<GitHubRepo[] | null>(null);
const reposError = ref('');
const search = ref('');
const busy = ref(false);
const progress = ref<Progress | null>(null);
const error = ref('');

function readParent(): string {
  try {
    return localStorage.getItem(LAST_PARENT) || state.app?.defaultDir || '';
  } catch {
    return state.app?.defaultDir ?? '';
  }
}

onMounted(async () => {
  if (!state.github?.user) return;
  try {
    repos.value = await api.githubRepos();
  } catch (err) {
    reposError.value = (err as Error).message;
  }
});

const filtered = computed(() => {
  const q = search.value.toLowerCase();
  return (repos.value ?? []).filter((r) => !q || r.full_name.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)).slice(0, 200);
});

const suggested = computed(() => url.value.trim().replace(/[\\/]+$/, '').split(/[\\/:]/).pop()?.replace(/\.git$/i, '') ?? '');
const target = computed(() => (parent.value ? `${parent.value.replace(/[\\/]+$/, '')}\\${name.value.trim() || suggested.value}` : ''));

async function chooseFolder() {
  const p = await desktop?.pickWorkspace('folder');
  if (p) parent.value = p;
}

async function submit() {
  if (!url.value.trim() || !parent.value.trim() || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    localStorage.setItem(LAST_PARENT, parent.value.trim());
  } catch {
    /* sem storage: só não lembramos a pasta */
  }
  try {
    await cloneRepo(url.value, parent.value, name.value.trim() || undefined, (p) => (progress.value = p));
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
    progress.value = null;
  }
}
</script>

<template>
  <BaseDialog title="Clonar repositório" :busy="busy" :width="620" @close="closeDialog">
    <div class="tabs">
      <button :class="{ active: tab === 'github' }" @click="tab = 'github'">GitHub</button>
      <button :class="{ active: tab === 'url' }" @click="tab = 'url'">URL</button>
    </div>

    <template v-if="tab === 'github'">
      <div v-if="!state.github?.user" class="empty-box">
        <p>Entre com o GitHub para escolher entre os seus repositórios.</p>
        <button v-if="state.github?.canLogin" class="btn primary" @click="githubLogin">Entrar com GitHub</button>
        <p v-else class="faint">Login disponível no app desktop. No CLI, defina GITHUB_TOKEN ou use <code>gh auth login</code>. Ou use a aba URL.</p>
      </div>
      <template v-else>
        <input v-model="search" class="list-search" placeholder="Buscar nos seus repositórios…" spellcheck="false">
        <ul class="pick-list tall">
          <li v-if="!repos && !reposError" class="faint">Carregando…</li>
          <li v-if="reposError" class="err">{{ reposError }}</li>
          <li v-for="r in filtered" :key="r.full_name" :class="{ active: url === r.clone_url }" @click="url = r.clone_url" @dblclick="submit">
            <span class="kind" :class="r.private ? 'private' : 'public'">{{ r.private ? 'privado' : 'público' }}</span>
            <span class="name">{{ r.full_name }}</span>
            <span class="faint when">{{ ago(Date.parse(r.updated_at) / 1000) }}</span>
          </li>
        </ul>
      </template>
    </template>

    <label v-else class="field">
      <span>URL do repositório</span>
      <input v-model="url" placeholder="https://github.com/dono/repo.git ou git@github.com:dono/repo.git" spellcheck="false">
    </label>

    <label class="field">
      <span>Pasta onde clonar</span>
      <div class="row-input">
        <input v-model="parent" placeholder="C:\Users\...\Documents\GitHub" spellcheck="false">
        <button v-if="desktop" class="btn" type="button" @click="chooseFolder">Escolher…</button>
      </div>
    </label>
    <label class="field">
      <span>Nome da pasta <small class="faint">(opcional)</small></span>
      <input v-model="name" :placeholder="suggested || 'mesmo nome do repositório'" spellcheck="false">
    </label>
    <p v-if="target && url" class="faint">Vai criar <code>{{ target }}</code> e abrir no Hydra.</p>

    <ProgressBar v-if="progress" :progress="progress" />
    <p v-if="error" class="err">{{ error }}</p>

    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="!url.trim() || !parent.trim() || busy" @click="submit">{{ busy ? 'Clonando…' : 'Clonar' }}</button>
    </template>
  </BaseDialog>
</template>
