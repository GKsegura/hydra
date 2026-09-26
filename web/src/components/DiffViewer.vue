<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { applyDiffLines, closeDiff, partialBlocked, state } from '../store.ts';

const META = /^(\+\+\+|---|diff |index |new file|deleted file|similarity|rename)/;

interface Line {
  text: string;
  cls: string;
  /** Linha adicionada/removida dentro de um trecho: pode ser escolhida para o stage parcial. */
  change: boolean;
  /** Índice do cabeçalho "@@" do trecho a que a linha pertence (ou dela mesma, se for o cabeçalho). */
  hunk: number;
}

const lines = computed<Line[]>(() => {
  let hunk = -1;
  return (state.diff?.text ?? '').split('\n').map((text, i) => {
    const isHunk = text.startsWith('@@');
    if (isHunk) hunk = i;
    const inHunk = hunk >= 0 && !isHunk;
    const change = inHunk && (text.startsWith('+') || text.startsWith('-'));
    return {
      text: text || ' ',
      cls: isHunk ? 'hunk' : !inHunk && META.test(text) ? 'meta' : text.startsWith('+') ? 'add' : text.startsWith('-') ? 'del' : '',
      change,
      hunk,
    };
  });
});

// ------------------------------------------------------------------ stage parcial

const work = computed(() => state.diff?.work ?? null);
const blocked = computed(() => (work.value ? partialBlocked(work.value.repoId, work.value.file, work.value.staged) : null));
/** Stage parcial disponível neste diff (área de trabalho ou stage, arquivo de texto comum, com alguma linha alterada). */
const interactive = computed(() => !!work.value && !blocked.value && !state.diff?.loading && lines.value.some((l) => l.change));
const verb = computed(() => (work.value?.staged ? 'Unstage' : 'Stage'));

const selected = ref(new Set<number>());
let anchor: number | null = null;
watch(() => state.diff?.key + '|' + state.diff?.text, () => {
  selected.value = new Set();
  anchor = null;
});

/** Clique marca/desmarca a linha; Shift+clique marca todas as linhas alteradas entre a última clicada e esta. */
function toggle(i: number, ev: MouseEvent) {
  if (!interactive.value || !lines.value[i].change) return;
  const next = new Set(selected.value);
  if (ev.shiftKey && anchor !== null) {
    const [a, b] = anchor < i ? [anchor, i] : [i, anchor];
    for (let k = a; k <= b; k++) if (lines.value[k].change) next.add(k);
  } else if (next.has(i)) next.delete(i);
  else next.add(i);
  anchor = i;
  selected.value = next;
}

function hunkLines(h: number): number[] {
  return lines.value.flatMap((l, i) => (l.change && l.hunk === h ? [i] : []));
}

async function apply(indexes: number[]) {
  if (await applyDiffLines(indexes)) selected.value = new Set();
}
</script>

<template>
  <div v-if="state.diff" class="diff">
    <div class="diff-head">
      <span class="diff-title">{{ state.diff.title }}</span>
      <span class="spacer" />
      <template v-if="interactive">
        <span class="muted">{{ selected.size ? `${selected.size} linha(s) escolhida(s)` : 'Clique nas linhas para escolher (Shift = intervalo)' }}</span>
        <button v-if="selected.size" class="btn ghost sm" @click="selected = new Set()">Limpar</button>
        <button class="btn primary sm" :disabled="!selected.size || state.busy" @click="apply([...selected])">{{ verb }} das linhas ({{ selected.size }})</button>
      </template>
      <span v-else-if="work && blocked" class="muted" :title="blocked">Stage parcial indisponível</span>
      <button class="btn ghost" title="Fechar (Esc)" @click="closeDiff">✕</button>
    </div>
    <pre class="diff-body" :class="{ pick: interactive }"><span v-if="state.diff.loading" class="meta">Carregando…</span><span v-else-if="state.diff.error" class="del">{{ state.diff.error }}</span><span v-else-if="!state.diff.text.trim()" class="meta">Sem diferenças de texto (arquivo binário, modo ou renomeação).</span><template v-else><span
      v-for="(l, i) in lines"
      :key="i"
      :class="[l.cls, { chosen: selected.has(i), pickable: interactive && l.change }]"
      @click="toggle(i, $event)"
    ><span v-if="interactive" class="dl-gut">{{ l.change ? (selected.has(i) ? '☑' : '☐') : '' }}</span>{{ l.text }}<button
      v-if="interactive && l.cls === 'hunk' && hunkLines(i).length"
      class="btn ghost sm dl-hunk"
      :disabled="state.busy"
      @click.stop="apply(hunkLines(i))"
    >{{ verb }} deste trecho</button></span></template></pre>
  </div>
</template>
