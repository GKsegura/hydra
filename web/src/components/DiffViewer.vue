<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed } from 'vue';
import { closeDiff, state } from '../store.ts';

const META = /^(\+\+\+|---|diff |index |new file|deleted file|similarity|rename)/;

const lines = computed(() =>
  (state.diff?.text ?? '').split('\n').map((text) => ({
    text: text || ' ',
    cls: text.startsWith('@@') ? 'hunk' : META.test(text) ? 'meta' : text.startsWith('+') ? 'add' : text.startsWith('-') ? 'del' : '',
  })),
);
</script>

<template>
  <div v-if="state.diff" class="diff">
    <div class="diff-head">
      <span>{{ state.diff.title }}</span>
      <button class="btn ghost" title="Fechar (Esc)" @click="closeDiff">✕</button>
    </div>
    <pre class="diff-body"><span v-if="state.diff.loading" class="meta">Carregando…</span><span v-else-if="state.diff.error" class="del">{{ state.diff.error }}</span><span v-else-if="!state.diff.text.trim()" class="meta">Sem diferenças de texto (arquivo binário, modo ou renomeação).</span><template v-else><span v-for="(l, i) in lines" :key="i" :class="l.cls">{{ l.text }}</span></template></pre>
  </div>
</template>
