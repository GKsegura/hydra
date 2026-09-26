<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed } from 'vue';
import { fetchRepo, openMenu, pullRepo, pushRepo, syncAction } from '../actions.ts';
import { state, statusOf } from '../store.ts';

// Botão único de sincronização, como no GitHub Desktop: Fetch / Pull ↓n / Push ↑n / Publicar branch.
const props = defineProps<{ repoId: string }>();
const job = computed(() => state.jobs[props.repoId]);
const act = computed(() => syncAction(props.repoId));
const hasRemote = computed(() => !!statusOf(props.repoId)?.remotes.length);

function more(ev: MouseEvent) {
  openMenu(ev, [
    { label: 'Fetch', run: () => fetchRepo(props.repoId), disabled: !hasRemote.value },
    { label: 'Pull', run: () => pullRepo(props.repoId), disabled: !hasRemote.value },
    { label: 'Push', run: () => pushRepo(props.repoId) },
  ]);
}
</script>

<template>
  <div class="sync">
    <button v-if="job" class="sync-btn busy" disabled :title="job.phase">
      <span class="spinner" /> {{ job.label }}<template v-if="job.percent !== null"> {{ job.percent }}%</template>
    </button>
    <button v-else class="sync-btn" :class="{ strong: act.label !== 'Fetch' }" :title="act.hint" @click.stop="act.run()" @contextmenu="more">
      {{ act.label }}
    </button>
    <button class="sync-more" title="Fetch, pull ou push" :disabled="!!job" @click.stop="more">▾</button>
  </div>
</template>
