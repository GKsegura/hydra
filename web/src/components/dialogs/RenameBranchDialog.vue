<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { closeDialog, renameBranch } from '../../actions.ts';
import { state } from '../../store.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ repoId: string; name: string }>();
const to = ref(props.name);
const busy = ref(false);
const clean = computed(() => to.value.trim().replace(/\s+/g, '-'));
const published = computed(() => !!state.branchInfo[props.repoId]?.branches.find((b) => b.kind === 'local' && b.name === props.name)?.upstream);
const alsoRemote = ref(true);

async function submit() {
  if (!clean.value || clean.value === props.name || busy.value) return;
  busy.value = true;
  const ok = await renameBranch(props.repoId, props.name, clean.value, published.value && alsoRemote.value);
  busy.value = false;
  if (ok) closeDialog();
}
</script>

<template>
  <BaseDialog title="Renomear branch" :busy="busy" @close="closeDialog">
    <form class="form" @submit.prevent="submit">
      <label class="field">
        <span>Novo nome para <code>{{ name }}</code></span>
        <input v-model="to" spellcheck="false">
      </label>
      <label v-if="published" class="check">
        <input v-model="alsoRemote" type="checkbox"> Renomear também no remoto
        <small class="faint">(publica com o nome novo e apaga o antigo)</small>
      </label>
      <button type="submit" hidden />
    </form>
    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="!clean || clean === name || busy" @click="submit">Renomear</button>
    </template>
  </BaseDialog>
</template>
