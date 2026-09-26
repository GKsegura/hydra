<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { closeDialog, createTag } from '../../actions.ts';
import { statusOf } from '../../store.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ repoId: string; at?: string }>();
const name = ref('');
const message = ref('');
const pushAfter = ref(!!statusOf(props.repoId)?.remotes.length);
const busy = ref(false);
const clean = computed(() => name.value.trim().replace(/\s+/g, '-'));

async function submit() {
  if (!clean.value || busy.value) return;
  busy.value = true;
  const ok = await createTag(props.repoId, clean.value, props.at, message.value, pushAfter.value);
  busy.value = false;
  if (ok) closeDialog();
}
</script>

<template>
  <BaseDialog title="Criar tag" :busy="busy" @close="closeDialog">
    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>Nome</span>
        <input v-model="name" placeholder="v1.2.0" spellcheck="false">
      </label>
      <label class="field">
        <span>Mensagem <small class="faint">(opcional — cria uma tag anotada)</small></span>
        <textarea v-model="message" rows="3" placeholder="Notas da versão" />
      </label>
      <p class="faint">No commit <code>{{ at ? at.slice(0, 7) : 'atual (HEAD)' }}</code>.</p>
      <label v-if="statusOf(repoId)?.remotes.length" class="check"><input v-model="pushAfter" type="checkbox"> Enviar a tag para o remoto</label>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="!clean || busy" @click="submit">Criar tag</button>
    </template>
  </BaseDialog>
</template>
