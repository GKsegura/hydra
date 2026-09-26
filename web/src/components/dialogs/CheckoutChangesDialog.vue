<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { ref } from 'vue';
import { closeDialog, doCheckout } from '../../actions.ts';
import { statusOf } from '../../store.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ repoId: string; name: string }>();
const mode = ref<'stash' | 'carry'>('stash');
const busy = ref(false);

async function submit() {
  busy.value = true;
  await doCheckout(props.repoId, props.name, mode.value);
  busy.value = false;
}
</script>

<template>
  <BaseDialog title="Você tem alterações" :busy="busy" :width="500" @close="closeDialog">
    <p class="dialog-text">
      Há {{ statusOf(repoId)?.files.length }} arquivo(s) alterado(s) em <code>{{ statusOf(repoId)?.branch }}</code>.
      O que fazer com eles ao trocar para <code>{{ name }}</code>?
    </p>
    <label class="radio">
      <input v-model="mode" type="radio" value="stash">
      <span><b>Deixar em {{ statusOf(repoId)?.branch }}</b><br><small class="faint">Guarda as alterações num stash. Ao voltar para esta branch, o Hydra oferece restaurar.</small></span>
    </label>
    <label class="radio">
      <input v-model="mode" type="radio" value="carry">
      <span><b>Levar para {{ name }}</b><br><small class="faint">As alterações vão junto. Se conflitarem com a outra branch, o git recusa a troca.</small></span>
    </label>
    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="busy" @click="submit">Trocar de branch</button>
    </template>
  </BaseDialog>
</template>
