<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { IS_STATIC } from '../api.ts';
import { commitMenu, openMenu } from '../actions.ts';
import { loadMore, matches, repoById, repoColor, selectCommit, setTimeline, state } from '../store.ts';
import { limitingRepo, mergeTimeline } from '../timeline.ts';
import { HEAD_H, useWindow } from '../useWindow.ts';
import { ago, fullDate, ROW } from '../utils.ts';
import UserAvatar from './UserAvatar.vue';

defineProps<{ width: number }>();

// Uma faixa (coluna estreita) por repo visível, na ordem dos painéis.
const LANE = 14;
const LANE_PAD = 10;
const lanes = computed(() => state.visible.map((id) => ({ id, color: repoColor(id) })));
const lanesWidth = computed(() => Math.max(lanes.value.length, 1) * LANE + LANE_PAD * 2 - LANE);
const laneX = (lane: number) => LANE_PAD + lane * LANE;

const entries = computed(() => mergeTimeline(state.graphs, state.visible, !IS_STATIC));
const height = computed(() => Math.max(entries.value.length * ROW, ROW));

// Virtualização (como no GraphPane): só as linhas e bolinhas perto da janela visível vão para o DOM.
const scroller = ref<HTMLElement>();
const { start, end, syncScroll } = useWindow(scroller, () => entries.value.length, () => HEAD_H);
const visibleRows = computed(() => entries.value.slice(start.value, end.value).map((e, k) => ({ e, i: start.value + k })));

// A timeline só é completa até onde o repo "limitante" foi carregado: perto do fim, carrega mais dele.
const limiting = computed(() => (IS_STATIC ? null : limitingRepo(state.graphs, state.visible)));
const LOAD_AHEAD = ROW * 30;
function maybeLoadMore() {
  const box = scroller.value;
  const id = limiting.value;
  if (!box || !id) return;
  if (box.scrollHeight - box.scrollTop - box.clientHeight < LOAD_AHEAD) void loadMore(id);
}
// Revisa ao mudar a lista, o repo limitante ou o estado da carga dele: a lista pode não crescer quando um repo avança
// (o corte se ajusta a outro), e ainda assim, com o fim à vista, é preciso seguir carregando.
watch(
  () => [entries.value.length, limiting.value, limiting.value && state.graphs[limiting.value]?.commits.length, limiting.value && state.loadingMore[limiting.value]],
  () => nextTick(maybeLoadMore),
);
function onScroll() {
  syncScroll();
  maybeLoadMore();
}

const query = computed(() => state.filter.trim().toLowerCase());
const hits = computed(() => {
  const q = query.value;
  return q ? new Set(entries.value.flatMap((e, i) => (matches(e.commit, q) ? [i] : []))) : null;
});
const selected = computed(() => (state.selected?.type === 'commit' ? state.selected : null));
const isSelected = (repoId: string, hash: string) => selected.value?.repoId === repoId && selected.value.hash === hash;

function onMenu(ev: MouseEvent, repoId: string, i: number) {
  if (IS_STATIC) return;
  const { commit } = entries.value[i];
  selectCommit(repoId, commit.hash);
  openMenu(ev, commitMenu(repoId, commit));
}

// Seleção feita em outro lugar (painel do repo, teclado)? Traz a linha para a vista, se estiver fora.
watch(selected, (sel) => {
  const box = scroller.value;
  if (!sel || !box) return;
  const i = entries.value.findIndex((e) => e.repoId === sel.repoId && e.commit.hash === sel.hash);
  if (i < 0) return;
  const top = i * ROW;
  const visible = box.clientHeight - HEAD_H;
  if (top < box.scrollTop || top > box.scrollTop + visible - ROW * 2) box.scrollTop = Math.max(0, top - visible / 3);
});
</script>

<template>
  <div class="pane timeline" :style="{ '--lanes-w': `${lanesWidth}px`, flex: `0 0 ${width}px` }">
    <div class="pane-bar">
      <svg class="tl-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3v10M8 3v10M13 3v10" /><circle cx="3" cy="5" r="1.6" /><circle cx="8" cy="8" r="1.6" /><circle cx="13" cy="11" r="1.6" /></svg>
      <b class="repo-name">Timeline</b>
      <span class="tl-count">{{ entries.length }} commit{{ entries.length === 1 ? '' : 's' }} · {{ lanes.length }} repo{{ lanes.length === 1 ? '' : 's' }}</span>
      <span class="spacer" />
      <button class="x" title="Desligar a timeline unificada" @click.stop="setTimeline(false)">✕</button>
    </div>

    <div ref="scroller" class="graph-scroll" @scroll.passive="onScroll">
      <div class="graph-head">
        <div class="h-lanes">REPOS</div>
        <div>MENSAGEM</div>
        <div>REPO</div>
        <div>AUTOR</div>
        <div>DATA</div>
      </div>
      <div class="graph-inner">
        <svg class="tl-svg" :width="lanesWidth" :height="height" aria-hidden="true">
          <line v-for="(l, i) in lanes" :key="l.id" :x1="laneX(i)" :x2="laneX(i)" y1="0" :y2="height" :stroke="l.color" />
          <circle
            v-for="{ e, i } in visibleRows"
            :key="`${e.repoId}:${e.commit.hash}`"
            :cx="laneX(e.lane)"
            :cy="i * ROW + ROW / 2"
            :r="e.commit.parents.length > 1 ? 3.5 : 5"
            :fill="repoColor(e.repoId)"
            :class="{ dim: hits && !hits.has(i) }"
          />
        </svg>

        <div class="rows">
          <div v-if="start" class="vspace" :style="{ height: `${start * ROW}px` }" />
          <div
            v-for="{ e, i } in visibleRows"
            :key="`${e.repoId}:${e.commit.hash}`"
            class="row"
            :class="{ sel: isSelected(e.repoId, e.commit.hash), dim: hits && !hits.has(i), hit: hits?.has(i) }"
            :title="`${e.commit.subject}\n${repoById(e.repoId)?.name} · ${e.commit.author} · ${fullDate(e.commit.time)} · ${e.commit.hash.slice(0, 8)}`"
            @click="selectCommit(e.repoId, e.commit.hash, true)"
            @contextmenu="onMenu($event, e.repoId, i)"
          >
            <div class="c-lanes" />
            <div class="c-msg"><span class="subj">{{ e.commit.subject }}</span></div>
            <div class="c-repo"><span class="tl-repo" :style="{ '--c': repoColor(e.repoId) }">{{ repoById(e.repoId)?.name }}</span></div>
            <div class="c-author"><UserAvatar :name="e.commit.author" :email="e.commit.email" /><span>{{ e.commit.author }}</span></div>
            <div class="c-date">{{ ago(e.commit.time) }}</div>
          </div>

          <div v-if="end < entries.length" class="vspace" :style="{ height: `${(entries.length - end) * ROW}px` }" />

          <div v-if="limiting" class="trunc">
            Timeline completa até aqui ·
            <button class="btn ghost" :disabled="state.loadingMore[limiting]" @click="loadMore(limiting)">
              {{ state.loadingMore[limiting] ? 'Carregando…' : 'Carregar mais' }}
            </button>
          </div>
          <div v-if="!lanes.length" class="empty">Nenhum repositório visível. Marque algum na barra lateral.</div>
          <div v-else-if="!entries.length" class="empty">Nenhum commit nos repositórios visíveis.</div>
        </div>
      </div>
    </div>
  </div>
</template>
