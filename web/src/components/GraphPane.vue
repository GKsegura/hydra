<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { IS_STATIC } from '../api.ts';
import { commitMenu, discard, openDialog, openIn, openMenu, openOnGitHub } from '../actions.ts';
import { edgePath, laneX, rowY } from '../graph.ts';
import { headRow, hideRepo, matches, repoById, repoColor, selectCommit, selectDefault, selectWip, state, statusOf } from '../store.ts';
import { ago, COL, COLORS, fullDate, PAD, ROW } from '../utils.ts';
import AppIcon from './AppIcon.vue';
import BranchMenu from './BranchMenu.vue';
import OperationBanner from './OperationBanner.vue';
import RefBadges from './RefBadges.vue';
import SyncButton from './SyncButton.vue';
import UserAvatar from './UserAvatar.vue';

const props = defineProps<{ repoId: string; width: number }>();

const repo = computed(() => repoById(props.repoId)!);
const graph = computed(() => state.graphs[props.repoId]);
const status = computed(() => statusOf(props.repoId));
const commits = computed(() => graph.value?.commits ?? []);
const wip = computed(() => (status.value?.files.length ?? 0) > 0);
const off = computed(() => (wip.value ? 1 : 0));
const head = computed(() => headRow(props.repoId));

const graphWidth = computed(() => Math.min(Math.max((graph.value?.layout.width ?? 1) * COL + PAD, 48), 320));
const height = computed(() => Math.max((commits.value.length + off.value) * ROW, ROW));

const edges = computed(() =>
  (graph.value?.layout.edges ?? []).map((e) => ({ d: edgePath(e, off.value), color: COLORS[e.color] })),
);
const nodes = computed(() =>
  (graph.value?.layout.nodes ?? []).map((n, i) => ({
    x: laneX(n.col),
    y: rowY(i, off.value),
    color: COLORS[n.color],
    merge: commits.value[i].parents.length > 1,
    head: i === head.value,
  })),
);
const wipX = computed(() => (head.value >= 0 ? nodes.value[head.value]?.x ?? PAD : PAD));

const ahead = computed(() => {
  const s = status.value;
  if (!s?.upstream || (!s.ahead && !s.behind)) return '';
  return `${s.ahead ? ` ↑${s.ahead}` : ''}${s.behind ? ` ↓${s.behind}` : ''}`;
});

const query = computed(() => state.filter.trim().toLowerCase());
const hits = computed(() => {
  const q = query.value;
  return q ? new Set(commits.value.flatMap((c, i) => (matches(c, q) ? [i] : []))) : null;
});

const selHash = computed(() => (state.selected?.repoId === props.repoId && state.selected.type === 'commit' ? state.selected.hash : null));
const wipSelected = computed(() => state.selected?.repoId === props.repoId && state.selected.type === 'wip');
const draft = computed(() => state.drafts[props.repoId]?.summary.trim());

// Rolagem pedida pela store (teclado, sidebar, pais do commit…).
const scroller = ref<HTMLElement>();
const HEAD_H = 26;
watch(
  () => state.scroll,
  (req) => {
    const box = scroller.value;
    if (!req || req.repoId !== props.repoId || !box) return;
    // A linha fica abaixo do cabeçalho sticky, que também está dentro da área rolável.
    const top = (req.row + off.value) * ROW;
    const visible = box.clientHeight - HEAD_H;
    if (top < box.scrollTop || top > box.scrollTop + visible - ROW * 2) box.scrollTop = Math.max(0, top - visible / 3);
  },
);

/** Menu "⋯" do painel: ações do repositório. */
function repoMenu(ev: MouseEvent) {
  const id = props.repoId;
  const s = status.value;
  openMenu(ev, [
    { label: 'Nova branch…', run: () => openDialog('create-branch', { repoId: id }) },
    { label: `Merge em ${s?.branch ?? '…'}…`, run: () => openDialog('merge', { repoId: id }), disabled: !s?.branch },
    { label: 'Criar tag…', run: () => openDialog('create-tag', { repoId: id }) },
    { label: 'Guardar alterações (stash)…', run: () => openDialog('stash', { repoId: id }), disabled: !wip.value },
    { separator: true, label: '' },
    { label: 'Abrir no VS Code', run: () => openIn(id, 'editor') },
    { label: 'Mostrar no Explorer', run: () => openIn(id, 'explorer') },
    { label: 'Abrir no terminal', run: () => openIn(id, 'terminal') },
    { label: 'Ver no GitHub', run: () => openOnGitHub(id), disabled: !s?.remotes.length },
    { label: 'Publicar no GitHub…', run: () => openDialog('publish', { repoId: id }), disabled: !!s?.remotes.length },
    { separator: true, label: '' },
    { label: 'Ocultar painel', run: () => hideRepo(id) },
  ]);
}

function wipMenu(ev: MouseEvent) {
  const id = props.repoId;
  openMenu(ev, [
    { label: 'Guardar alterações (stash)…', run: () => openDialog('stash', { repoId: id }) },
    { label: 'Descartar todas as alterações…', danger: true, run: () => discard(id, 'all'), disabled: !!status.value?.conflicted },
  ]);
}

function rowMenu(ev: MouseEvent, i: number) {
  if (IS_STATIC) return;
  selectCommit(props.repoId, commits.value[i].hash);
  openMenu(ev, commitMenu(props.repoId, commits.value[i]));
}
</script>

<template>
  <div
    class="pane"
    :class="{ active: state.active === repoId }"
    :data-pane="repoId"
    :style="{ '--c': repoColor(repoId), '--graph-w': `${graphWidth}px`, flex: `0 0 ${width}px` }"
  >
    <div class="pane-bar" title="Focar este repositório" @click="selectDefault(repoId)">
      <span class="repo-dot" />
      <b class="repo-name">{{ repo.name }}</b>
      <template v-if="IS_STATIC">
        <span v-if="status" class="branch"><AppIcon name="branch" />{{ status.branch ?? 'HEAD destacado' }}{{ ahead }}</span>
        <span class="spacer" />
      </template>
      <template v-else-if="status">
        <BranchMenu :repo-id="repoId" />
        <span class="spacer" />
        <SyncButton :repo-id="repoId" />
        <button class="x" title="Ações do repositório" @click.stop="repoMenu">⋯</button>
      </template>
      <span v-else class="spacer" />
      <button class="x" title="Ocultar painel" @click.stop="hideRepo(repoId)">✕</button>
    </div>
    <OperationBanner v-if="!IS_STATIC" :repo-id="repoId" />

    <div ref="scroller" class="graph-scroll">
      <div class="graph-head">
        <div class="h-refs">BRANCH / TAG</div>
        <div class="h-graph">GRAPH</div>
        <div class="h-msg">MENSAGEM</div>
        <div class="h-author">AUTOR</div>
        <div class="h-date">DATA</div>
      </div>
      <div class="graph-inner">
        <svg class="graph-svg" :height="height" :viewBox="`0 0 ${graphWidth} ${height}`" :style="{ height: `${height}px` }" aria-hidden="true">
          <path v-for="(e, i) in edges" :key="i" :d="e.d" :stroke="e.color" />
          <path v-if="wip && head >= 0" class="wip-line" :d="`M${wipX} ${ROW / 2} L${wipX} ${(head + 1) * ROW + ROW / 2}`" />
          <template v-for="(n, i) in nodes" :key="i">
            <circle v-if="n.head" class="head-ring" :cx="n.x" :cy="n.y" r="9" :stroke="n.color" />
            <circle class="node" :class="{ merge: n.merge }" :cx="n.x" :cy="n.y" :r="n.merge ? 4.5 : 6" :fill="n.color" />
          </template>
          <circle v-if="wip" class="wip-node" :cx="wipX" :cy="ROW / 2" r="6" />
        </svg>

        <div class="rows">
          <div v-if="wip && status" class="row wip" :class="{ sel: wipSelected }" @click="selectWip(repoId)" @contextmenu="!IS_STATIC && wipMenu($event)">
            <div class="c-refs" />
            <div class="c-graph" />
            <div class="c-msg">
              <span v-if="draft" class="subj">{{ draft }}</span>
              <span v-else class="wip-label">// WIP</span>
              <span class="wip-chips">
                <span v-if="status.staged" class="chip s">{{ status.staged }} staged</span>
                <span v-if="status.unstaged" class="chip m">{{ status.unstaged }} mod.</span>
                <span v-if="status.untracked" class="chip n">{{ status.untracked }} novo{{ status.untracked > 1 ? 's' : '' }}</span>
                <span v-if="status.conflicted" class="chip u">{{ status.conflicted }} conflito{{ status.conflicted > 1 ? 's' : '' }}</span>
              </span>
            </div>
            <div class="c-author" />
            <div class="c-date">agora</div>
          </div>

          <div
            v-for="(c, i) in commits"
            :key="c.hash"
            class="row"
            :class="{ sel: c.hash === selHash, dim: hits && !hits.has(i), hit: hits?.has(i) }"
            :title="`${c.subject}\n${c.author} · ${fullDate(c.time)} · ${c.hash.slice(0, 8)}`"
            @click="selectCommit(repoId, c.hash)"
            @contextmenu="rowMenu($event, i)"
          >
            <div class="c-refs"><RefBadges :refs="c.refs" :color="COLORS[graph!.layout.nodes[i].color]" /></div>
            <div class="c-graph" />
            <div class="c-msg"><span class="subj">{{ c.subject }}</span></div>
            <div class="c-author"><UserAvatar :name="c.author" :email="c.email" /><span>{{ c.author }}</span></div>
            <div class="c-date">{{ ago(c.time) }}</div>
          </div>

          <div v-if="!graph" class="empty">Carregando…</div>
          <div v-else-if="!commits.length && !wip" class="empty">Este repositório ainda não tem commits.</div>
          <div v-if="graph?.truncated" class="trunc">
            Mostrando os {{ commits.length }} commits mais recentes · use <code>--max</code> para carregar mais
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
