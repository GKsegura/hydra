<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../../api.ts';
import { closeDialog, githubLogin, publishRepo, pushRepo } from '../../actions.ts';
import { refreshRepo, repoById, state, toast } from '../../store.ts';
import type { Progress } from '../../types.ts';
import BaseDialog from './BaseDialog.vue';
import ProgressBar from './ProgressBar.vue';

const props = defineProps<{ repoId: string }>();
const name = ref(repoById(props.repoId)?.name.replace(/\s+/g, '-') ?? '');
const description = ref('');
const isPrivate = ref(true);
const busy = ref(false);
const progress = ref<Progress | null>(null);
const error = ref('');
const remoteUrl = ref('');

// Com login: o Hydra cria o repositório no GitHub e envia.
async function submit() {
  if (!name.value.trim() || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const url = await publishRepo(props.repoId, { name: name.value.trim(), private: isPrivate.value, description: description.value.trim() || undefined }, (p) => (progress.value = p));
    if (url) window.open(url, '_blank');
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
    progress.value = null;
  }
}

// Sem login: o repositório vazio é criado no site do GitHub e o Hydra só conecta o remoto e faz o push.
async function connect() {
  if (!remoteUrl.value.trim() || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await api.addRemote(props.repoId, remoteUrl.value.trim());
    closeDialog();
    toast('Remoto "origin" adicionado. Enviando a branch…', 'ok');
    await refreshRepo(props.repoId);
    await pushRepo(props.repoId);
  } catch (err) {
    error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseDialog title="Publicar repositório" :busy="busy" :width="520" @close="closeDialog">
    <div v-if="!state.github?.user" class="empty-box">
      <p>Este repositório ainda não tem remoto.</p>
      <button v-if="state.github?.canLogin" class="btn primary" @click="githubLogin">Entrar com GitHub para publicar com um clique</button>
      <p v-else class="faint">Login disponível no app desktop.</p>
      <p class="dialog-text">Ou, sem entrar, em dois passos:</p>
      <ol class="steps">
        <li>
          Crie um repositório <b>vazio</b> no GitHub (sem README, sem .gitignore):
          <a href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a>
        </li>
        <li>
          Cole aqui a URL que o GitHub mostrar:
          <form class="row-input" @submit.prevent="connect">
            <input v-model="remoteUrl" placeholder="https://github.com/GKsegura/meu-projeto.git" spellcheck="false">
          </form>
        </li>
      </ol>
      <p class="faint">O Hydra adiciona como <code>origin</code> e envia a branch atual. Se o GitHub pedir login, o Git Credential Manager abre uma janela para você entrar.</p>
    </div>
    <form v-else class="form" @submit.prevent="submit">
      <label class="field"><span>Nome no GitHub</span><input v-model="name" spellcheck="false"></label>
      <label class="field"><span>Descrição <small class="faint">(opcional)</small></span><input v-model="description"></label>
      <div class="radios">
        <label class="check"><input v-model="isPrivate" type="radio" :value="true"> Privado</label>
        <label class="check"><input v-model="isPrivate" type="radio" :value="false"> Público</label>
      </div>
      <p class="faint">Cria <code>github.com/{{ state.github.user.login }}/{{ name || '…' }}</code>, adiciona como <code>origin</code> e envia a branch atual.</p>
      <button type="submit" hidden />
    </form>
    <ProgressBar v-if="progress" :progress="progress" />
    <p v-if="error" class="err">{{ error }}</p>
    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button v-if="state.github?.user" class="btn primary" :disabled="!name.trim() || busy" @click="submit">{{ busy ? 'Publicando…' : 'Publicar' }}</button>
      <button v-else class="btn primary" :disabled="!remoteUrl.trim() || busy" @click="connect">Conectar e enviar</button>
    </template>
  </BaseDialog>
</template>
