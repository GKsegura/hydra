<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, watch } from 'vue';
import { IS_STATIC } from '../api.ts';
import { applyStash, branchMenu, checkout, dropStash, loadPulls, openDialog, openMenu, tagMenu } from '../actions.ts';
import { equalize, hideRepo, loadBranches, repoById, repoColor, selectCommit, showAll, showRepo, state, statusOf } from '../store.ts';
import { ago } from '../utils.ts';
import AppIcon from './AppIcon.vue';
import SignatureFooter from './SignatureFooter.vue';

const TAG_LIMIT = 60;

const graph = computed(() => (state.active ? state.graphs[state.active] : undefined));
const status = computed(() => statusOf(state.active));
const stashes = computed(() => (state.active ? state.branchInfo[state.active]?.stashes ?? [] : []));
const pulls = computed(() => (state.active ? state.pulls[state.active] : undefined));

// Stashes e PRs do repo em foco são carregados quando ele entra em foco (e quando o status muda).
watch(
  () => [state.active, status.value?.stashes] as const,
  ([id]) => {
    if (!id || IS_STATIC) return;
    loadBranches(id).catch(() => {});
    if (!state.pulls[id] && status.value?.remotes.length) loadPulls(id);
  },
  { immediate: true },
);

/** Linha de cada ref nos commits carregados, pra pular até ela. */
const refRow = computed(() => {
  const map = new Map<string, number>();
  graph.value?.commits.forEach((c, i) => {
    for (const r of c.refs) map.set(`${r.type === 'head' ? 'local' : r.type}:${r.name}`, i);
  });
  return map;
});

const remotes = computed(() => {
  const groups = new Map<string, { full: string; label: string }[]>();
  for (const full of graph.value?.refs.remote ?? []) {
    const i = full.indexOf('/');
    const remote = full.slice(0, i);
    if (!groups.has(remote)) groups.set(remote, []);
    groups.get(remote)!.push({ full, label: full.slice(i + 1) });
  }
  return [...groups];
});

const tags = computed(() => [...(graph.value?.refs.tags ?? [])].reverse());

function jump(type: string, name: string) {
  const row = refRow.value.get(`${type}:${name}`);
  if (row !== undefined && state.active) selectCommit(state.active, graph.value!.commits[row].hash, true);
}
const has = (type: string, name: string) => refRow.value.has(`${type}:${name}`);

function toggle(id: string, ev: Event) {
  if ((ev.target as HTMLInputElement).checked) showRepo(id);
  else hideRepo(id);
}

function menu(ev: MouseEvent, kind: 'local' | 'remote' | 'tag', name: string) {
  if (IS_STATIC || !state.active) return;
  openMenu(ev, kind === 'tag' ? tagMenu(state.active, name) : branchMenu(state.active, name, kind));
}

function stashMenu(ev: MouseEvent, index: number) {
  const id = state.active!;
  openMenu(ev, [
    { label: 'Restaurar (aplicar e remover)', run: () => applyStash(id, index, true) },
    { label: 'Aplicar e manter guardado', run: () => applyStash(id, index, false) },
    { separator: true, label: '' },
    { label: 'Descartar stash…', danger: true, run: () => dropStash(id, index) },
  ]);
}
</script>

<template>
  <aside v-if="state.summary" class="sidebar">
    <div class="sidebar-scroll">
      <details open>
        <summary>Repositórios <span class="count">{{ state.visible.length }}/{{ state.summary.repos.length }}</span></summary>
        <label
          v-for="r in state.summary.repos"
          :key="r.id"
          class="side-item repo"
          :class="{ active: r.id === state.active, 'hidden-repo': !state.visible.includes(r.id) }"
          :style="{ '--c': repoColor(r.id) }"
          title="Marque para mostrar o painel"
        >
          <input type="checkbox" :checked="state.visible.includes(r.id)" @change="toggle(r.id, $event)">
          <span class="repo-dot" />
          <span class="name" @click.prevent="showRepo(r.id)">{{ r.name }}</span>
          <span v-if="r.status?.operation" class="ab" title="Merge em andamento"><span class="danger">!</span></span>
          <span v-else-if="r.status?.files.length" class="ab"><span class="down">●</span></span>
        </label>
        <div class="side-actions">
          <button class="btn sm" @click="showAll">Todos</button>
          <button class="btn sm" title="Dividir o espaço igualmente" @click="equalize">Igualar</button>
        </div>
      </details>

      <template v-if="graph">
        <details open>
          <summary>
            <AppIcon name="local" :size="13" /> Local · {{ repoById(state.active)?.name }}
            <span class="count">{{ graph.refs.local.length }}</span>
            <button v-if="!IS_STATIC" class="sum-btn" title="Nova branch" @click.prevent="openDialog('create-branch', { repoId: state.active })">+</button>
          </summary>
          <button
            v-for="b in graph.refs.local"
            :key="b"
            class="side-item"
            :class="{ off: !has('local', b), current: b === status?.branch }"
            :title="`${has('local', b) ? 'Clique: ir para o commit' : 'Fora dos commits carregados'} · Duplo clique: checkout · Clique direito: ações`"
            @click="jump('local', b)"
            @dblclick="!IS_STATIC && b !== status?.branch && checkout(state.active!, b)"
            @contextmenu="menu($event, 'local', b)"
          >
            <AppIcon name="branch" /><span class="name">{{ b }}</span>
            <span v-if="b === status?.branch && status?.upstream && (status.ahead || status.behind)" class="ab">
              <span v-if="status.ahead" class="up">{{ status.ahead }}↑</span><span v-if="status.behind" class="down">{{ status.behind }}↓</span>
            </span>
          </button>
          <div v-if="!graph.refs.local.length" class="side-more">nenhuma</div>
        </details>

        <details open>
          <summary>Remoto <span class="count">{{ graph.refs.remote.length }}</span></summary>
          <template v-for="[remote, branches] in remotes" :key="remote">
            <div class="side-group"><AppIcon name="remote" /> {{ remote }}</div>
            <button
              v-for="b in branches"
              :key="b.full"
              class="side-item"
              :class="{ off: !has('remote', b.full) }"
              :title="`${has('remote', b.full) ? 'Ir para o commit' : 'Fora dos commits carregados'} · Clique direito: ações`"
              @click="jump('remote', b.full)"
              @dblclick="!IS_STATIC && checkout(state.active!, b.full)"
              @contextmenu="menu($event, 'remote', b.full)"
            >
              <AppIcon name="branch" /><span class="name">{{ b.label }}</span>
            </button>
          </template>
          <div v-if="!remotes.length" class="side-more">nenhum</div>
        </details>

        <details v-if="!IS_STATIC && (pulls?.pulls.length || pulls?.repo)" :open="!!pulls?.pulls.length">
          <summary>Pull Requests <span class="count">{{ pulls?.pulls.length ?? 0 }}</span></summary>
          <a v-for="p in pulls?.pulls" :key="p.number" class="side-item pr" :href="p.html_url" target="_blank" rel="noopener" :title="`${p.title}\n${p.branch} → ${p.base} · @${p.author}`">
            <span class="pr-num">#{{ p.number }}</span><span class="name">{{ p.title }}</span>
            <span v-if="p.draft" class="tag-mini">rascunho</span>
          </a>
          <div v-if="pulls && !pulls.pulls.length" class="side-more">{{ pulls.error ? 'Não foi possível carregar (entre com o GitHub se o repo for privado)' : 'nenhum aberto' }}</div>
        </details>

        <details v-if="!IS_STATIC" :open="stashes.length > 0">
          <summary>Stashes <span class="count">{{ stashes.length }}</span></summary>
          <button
            v-for="s in stashes"
            :key="s.hash"
            class="side-item"
            :title="`${s.message}\n${s.files} arquivo(s) · ${s.branch ?? ''} · ${ago(s.time)}\nClique: restaurar · Clique direito: mais opções`"
            @click="applyStash(state.active!, s.index, true)"
            @contextmenu="stashMenu($event, s.index)"
          >
            <span class="stash-ico">⧉</span><span class="name">{{ s.message || 'sem descrição' }}</span>
            <span class="faint small">{{ s.files }}</span>
          </button>
          <div v-if="!stashes.length" class="side-more">nada guardado</div>
        </details>

        <details :open="tags.length <= 15">
          <summary>Tags <span class="count">{{ tags.length }}</span>
            <button v-if="!IS_STATIC" class="sum-btn" title="Criar tag no commit atual" @click.prevent="openDialog('create-tag', { repoId: state.active })">+</button>
          </summary>
          <button
            v-for="t in tags.slice(0, TAG_LIMIT)"
            :key="t"
            class="side-item"
            :class="{ off: !has('tag', t) }"
            @click="jump('tag', t)"
            @contextmenu="menu($event, 'tag', t)"
          >
            <AppIcon name="tag" /><span class="name">{{ t }}</span>
          </button>
          <div v-if="tags.length > TAG_LIMIT" class="side-more">+{{ tags.length - TAG_LIMIT }} tags</div>
          <div v-if="!tags.length" class="side-more">nenhuma</div>
        </details>
      </template>
    </div>
    <SignatureFooter />
  </aside>
</template>
