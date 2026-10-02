<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api, desktop } from '../../api.ts';
import { closeDialog, createRepo, githubLogin } from '../../actions.ts';
import { state } from '../../store.ts';
import type { Progress } from '../../types.ts';
import BaseDialog from './BaseDialog.vue';
import ProgressBar from './ProgressBar.vue';

const LABELS: Record<string, string> = { none: 'Nenhum', node: 'Node.js', vue: 'Vue / Vite', java: 'Java (Maven/Gradle)', python: 'Python' };

const name = ref('');
const description = ref('');
const parent = ref(readParent());
const gitignore = ref('node');
const templates = ref<string[]>(['none', 'node', 'vue', 'java', 'python']);
const readme = ref(true);
const publish = ref(false);
const isPrivate = ref(true);
const busy = ref(false);
const progress = ref<Progress | null>(null);
const error = ref('');

function readParent(): string {
  try {
    return localStorage.getItem('hydra:clone-parent') || state.app?.defaultDir || '';
  } catch {
    return state.app?.defaultDir ?? '';
  }
}

onMounted(async () => {
  templates.value = (await api.templates().catch(() => null))?.gitignore ?? templates.value;
});

const clean = computed(() => name.value.trim().replace(/\s+/g, '-'));
const invalid = computed(() => /[<>:"/\\|?*]/.test(clean.value));

async function chooseFolder() {
  const p = await desktop?.pickWorkspace('folder');
  if (p) parent.value = p;
}

async function submit() {
  if (!clean.value || invalid.value || !parent.value.trim() || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await createRepo(
      {
        parent: parent.value.trim(), name: clean.value, gitignore: gitignore.value, readme: readme.value,
        description: description.value.trim() || undefined, publish: publish.value ? { private: isPrivate.value } : null,
      },
      (p) => (progress.value = p),
    );
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
    progress.value = null;
  }
}
</script>

<template>
  <BaseDialog title="Novo repositório" :busy="busy" :width="560" @close="closeDialog">
    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>Nome</span>
        <input v-model="name" placeholder="meu-projeto" spellcheck="false">
        <small v-if="invalid" class="err">O nome não pode ter &lt; &gt; : " / \ | ? *</small>
      </label>
      <label class="field">
        <span>Descrição <small class="faint">(opcional)</small></span>
        <input v-model="description" placeholder="Para que serve este projeto">
      </label>
      <label class="field">
        <span>Criar em</span>
        <div class="row-input">
          <input v-model="parent" placeholder="C:\Users\...\Documents\GitHub" spellcheck="false">
          <button v-if="desktop" class="btn" type="button" @click="chooseFolder">Escolher…</button>
        </div>
      </label>
      <div class="field-row">
        <label class="field">
          <span>.gitignore</span>
          <select v-model="gitignore">
            <option v-for="t in templates" :key="t" :value="t">{{ LABELS[t] ?? t }}</option>
          </select>
        </label>
        <label class="check"><input v-model="readme" type="checkbox"> Criar README.md</label>
      </div>

      <div class="publish-box">
        <label class="check"><input v-model="publish" type="checkbox" :disabled="!state.github?.user"> Publicar no GitHub</label>
        <template v-if="state.github?.user">
          <div v-if="publish" class="radios">
            <label class="check"><input v-model="isPrivate" type="radio" :value="true"> Privado</label>
            <label class="check"><input v-model="isPrivate" type="radio" :value="false"> Público</label>
            <small class="faint">em github.com/{{ state.github.user.login }}/{{ clean || '…' }}</small>
          </div>
        </template>
        <small v-else class="faint">
          <template v-if="state.github?.canLogin"><a href="#" @click.prevent="githubLogin">Entre com o GitHub</a> para publicar direto daqui.</template>
          <template v-else>Publicar direto daqui exige login no GitHub (app desktop).</template>
        </small>
      </div>
      <p v-if="clean && parent" class="faint">Vai criar <code>{{ parent.replace(/[\\/]+$/, '') }}\{{ clean }}</code> com a branch <code>main</code> e abrir no Hydra.</p>
      <button type="submit" hidden />
    </form>

    <ProgressBar v-if="progress" :progress="progress" />
    <p v-if="error" class="err">{{ error }}</p>

    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="!clean || invalid || !parent.trim() || busy" @click="submit">{{ busy ? 'Criando…' : 'Criar repositório' }}</button>
    </template>
  </BaseDialog>
</template>
