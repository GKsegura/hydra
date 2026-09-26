<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { ref } from 'vue';
import { closeDialog, stashChanges } from '../../actions.ts';
import { statusOf } from '../../store.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ repoId: string }>();
const message = ref('');
const busy = ref(false);

async function submit() {
  busy.value = true;
  await stashChanges(props.repoId, message.value);
  busy.value = false;
  closeDialog();
}
</script>

<template>
  <BaseDialog title="Guardar alterações (stash)" :busy="busy" @close="closeDialog">
    <form class="form" @submit.prevent="submit">
      <p class="faint">Os {{ statusOf(repoId)?.files.length }} arquivo(s) alterados (inclusive os novos) saem da área de trabalho e ficam guardados. Recupere pela seção <b>Stashes</b> da barra lateral.</p>
      <label class="field"><span>Descrição <small class="faint">(opcional)</small></span><input v-model="message" placeholder="O que é esse trabalho em andamento"></label>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="busy || !statusOf(repoId)?.files.length" @click="submit">Guardar</button>
    </template>
  </BaseDialog>
</template>
