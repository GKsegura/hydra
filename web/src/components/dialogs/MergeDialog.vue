<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { api } from '../../api.ts';
import { closeDialog, merge } from '../../actions.ts';
import { loadBranches, state, statusOf } from '../../store.ts';
import type { MergePreview } from '../../types.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ repoId: string; branch?: string }>();
const selected = ref(props.branch ?? '');
const search = ref('');
const preview = ref<MergePreview | null>(null);
const previewError = ref('');
const noFf = ref(false);
const busy = ref(false);

const current = computed(() => statusOf(props.repoId)?.branch ?? 'HEAD');
const options = computed(() => {
  const q = search.value.toLowerCase();
  return (state.branchInfo[props.repoId]?.branches ?? [])
    .filter((b) => !(b.kind === 'local' && b.current))
    .filter((b) => !q || b.name.toLowerCase().includes(q))
    .sort((a, b) => (a.kind === b.kind ? b.time - a.time : a.kind === 'local' ? -1 : 1));
});

onMounted(() => {
  if (!state.branchInfo[props.repoId]) loadBranches(props.repoId);
});

// Prévia ao escolher a branch: quantos commits entram e se vai dar conflito.
watch(
  selected,
  async (b) => {
    preview.value = null;
    previewError.value = '';
    if (!b) return;
    try {
      const p = await api.mergePreview(props.repoId, b);
      if (selected.value === b) preview.value = p;
    } catch (err) {
      previewError.value = (err as Error).message;
    }
  },
  { immediate: true },
);

async function submit() {
  if (!selected.value || busy.value || preview.value?.upToDate) return;
  busy.value = true;
  await merge(props.repoId, selected.value, noFf.value);
  busy.value = false;
}
</script>

<template>
  <BaseDialog :title="`Merge em ${current}`" :busy="busy" :width="540" @close="closeDialog">
    <input v-model="search" class="list-search" placeholder="Filtrar branches…" spellcheck="false">
    <ul class="pick-list">
      <li v-for="b in options" :key="`${b.kind}:${b.name}`" :class="{ active: selected === b.name }" @click="selected = b.name">
        <span class="kind" :class="b.kind">{{ b.kind === 'local' ? 'local' : 'remota' }}</span>
        <span class="name">{{ b.name }}</span>
      </li>
      <li v-if="!options.length" class="faint">Nenhuma branch encontrada.</li>
    </ul>

    <div v-if="selected" class="merge-preview">
      <template v-if="previewError"><span class="err">{{ previewError }}</span></template>
      <template v-else-if="!preview"><span class="faint">Calculando…</span></template>
      <template v-else-if="preview.upToDate"><span class="ok">✓ {{ current }} já tem tudo de {{ selected }}.</span></template>
      <template v-else-if="preview.conflicts.length">
        <span class="warn">⚠ {{ preview.commits }} commit(s) entram, com conflito em {{ preview.conflicts.length }} arquivo(s):</span>
        <ul class="conflict-list"><li v-for="f in preview.conflicts" :key="f"><code>{{ f }}</code></li></ul>
        <small class="faint">Você vai resolver cada um no resolvedor visual antes de concluir.</small>
      </template>
      <template v-else>
        <span class="ok">✓ {{ preview.commits }} commit(s) de <code>{{ selected }}</code> entram em <code>{{ current }}</code>, sem conflitos{{ preview.fastForward ? ' (fast-forward)' : '' }}.</span>
      </template>
    </div>

    <label v-if="preview?.fastForward && !preview.upToDate" class="check">
      <input v-model="noFf" type="checkbox"> Criar commit de merge mesmo assim (<code>--no-ff</code>)
    </label>

    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="!selected || busy || !preview || preview.upToDate" @click="submit">
        Merge de {{ selected || '…' }} em {{ current }}
      </button>
    </template>
  </BaseDialog>
</template>
