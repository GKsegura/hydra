<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { abortOperation, openConflict } from '../actions.ts';
import { loadOperation, selectWip, state, statusOf } from '../store.ts';

// Faixa de "merge/revert em andamento" no topo do painel do repo.
const props = defineProps<{ repoId: string }>();
const status = computed(() => statusOf(props.repoId));
const op = computed(() => state.operations[props.repoId]);

watch(
  () => status.value?.operation,
  (o) => {
    if (o && !op.value) loadOperation(props.repoId).catch(() => {});
  },
  { immediate: true },
);

const NAMES: Record<string, string> = { merge: 'Merge', revert: 'Revert', 'cherry-pick': 'Cherry-pick', rebase: 'Rebase' };
const title = computed(() => {
  const o = op.value;
  if (!o) return `${NAMES[status.value?.operation ?? 'merge']} em andamento`;
  return o.incoming ? `${NAMES[o.operation]} de ${o.incoming} em ${o.current}` : `${NAMES[o.operation]} em andamento em ${o.current}`;
});
const conflicts = computed(() => status.value?.conflicted ?? 0);
</script>

<template>
  <div v-if="status?.operation" class="op-banner" :class="{ done: conflicts === 0 }" @click.stop>
    <span class="op-title">{{ title }}</span>
    <span class="op-state">{{ conflicts ? `${conflicts} conflito(s)` : 'pronto para concluir' }}</span>
    <span class="spacer" />
    <button v-if="conflicts && op?.conflicts[0]" class="btn sm" @click="openConflict(repoId, op.conflicts[0].path)">Resolver</button>
    <button v-else class="btn sm primary" @click="selectWip(repoId)">Concluir…</button>
    <button class="btn sm ghost" @click="abortOperation(repoId)">Abortar</button>
  </div>
</template>
