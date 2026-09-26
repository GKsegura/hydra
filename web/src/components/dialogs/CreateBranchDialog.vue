<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { closeDialog, createBranch } from '../../actions.ts';
import { repoById, statusOf } from '../../store.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ repoId: string; from?: string; fromLabel?: string }>();
const name = ref('');
const switchTo = ref(true);
const busy = ref(false);

// Espaços viram hífen, como o GitHub Desktop faz.
const clean = computed(() => name.value.trim().replace(/\s+/g, '-'));
const base = computed(() => props.fromLabel ?? props.from ?? statusOf(props.repoId)?.branch ?? 'HEAD');

async function submit() {
  if (!clean.value || busy.value) return;
  busy.value = true;
  const ok = await createBranch(props.repoId, clean.value, { from: props.from, checkout: switchTo.value });
  busy.value = false;
  if (ok) closeDialog();
}
</script>

<template>
  <BaseDialog title="Nova branch" :busy="busy" @close="closeDialog">
    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>Nome</span>
        <input v-model="name" placeholder="feature/minha-feature" spellcheck="false">
        <small v-if="clean && clean !== name.trim()" class="faint">Será criada como <code>{{ clean }}</code></small>
      </label>
      <p class="faint">A partir de <code>{{ base }}</code> em <b>{{ repoById(repoId)?.name }}</b>.</p>
      <label class="check"><input v-model="switchTo" type="checkbox"> Trocar para a nova branch</label>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="!clean || busy" @click="submit">Criar branch</button>
    </template>
  </BaseDialog>
</template>
