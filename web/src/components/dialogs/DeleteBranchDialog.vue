<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { closeDialog, deleteBranch } from '../../actions.ts';
import { loadBranches, state } from '../../store.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ repoId: string; name: string }>();
const busy = ref(false);
const local = ref(true);
const remote = ref(false);

onMounted(async () => {
  if (!state.branchInfo[props.repoId]) await loadBranches(props.repoId);
  remote.value = !!upstream.value && !branch.value?.upstreamGone;
});

const branch = computed(() => state.branchInfo[props.repoId]?.branches.find((b) => b.kind === 'local' && b.name === props.name));
const upstream = computed(() => branch.value?.upstream ?? null);
const remoteName = computed(() => upstream.value?.split('/')[0] ?? state.branchInfo[props.repoId]?.remotes[0]?.name ?? null);

async function submit() {
  if (busy.value || (!local.value && !remote.value)) return;
  busy.value = true;
  const ok = await deleteBranch(props.repoId, props.name, { local: local.value, remote: remote.value ? remoteName.value ?? undefined : undefined });
  busy.value = false;
  if (ok) closeDialog();
}
</script>

<template>
  <BaseDialog title="Excluir branch" :busy="busy" @close="closeDialog">
    <p class="dialog-text">O que excluir de <code>{{ name }}</code>?</p>
    <label class="check"><input v-model="local" type="checkbox"> Branch local (neste computador)</label>
    <label class="check" :class="{ off: !remoteName }">
      <input v-model="remote" type="checkbox" :disabled="!remoteName">
      Branch no remoto <code v-if="upstream">{{ upstream }}</code><code v-else-if="remoteName">{{ remoteName }}/{{ name }}</code>
      <small v-if="branch?.upstreamGone" class="faint">(já foi apagada no remoto)</small>
      <small v-else-if="!remoteName" class="faint">(sem remoto)</small>
    </label>
    <p v-if="remote" class="warn-box">A branch some do servidor para todo mundo. Quem já baixou continua com a cópia local.</p>
    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary danger" :disabled="busy || (!local && !remote)" @click="submit">Excluir</button>
    </template>
  </BaseDialog>
</template>
