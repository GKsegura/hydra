<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { repoColor, showRepo, state } from '../store.ts';
import type { RepoStatus } from '../types.ts';
import { ago, plural } from '../utils.ts';
import AppIcon from './AppIcon.vue';

const changes = (s: RepoStatus | null) => s?.files.length ?? 0;
</script>

<template>
  <section v-if="state.summary" class="cards" aria-label="Repositórios">
    <button
      v-for="r in state.summary.repos"
      :key="r.id"
      class="card"
      :class="{ active: r.id === state.active, err: !r.status, off: !state.visible.includes(r.id) }"
      :style="{ '--c': repoColor(r.id) }"
      :title="state.visible.includes(r.id) ? '' : 'Painel oculto: clique para mostrar'"
      @click="showRepo(r.id)"
    >
      <div class="card-top">
        <span class="card-name">{{ r.name }}</span>
        <span v-if="r.status" class="pill" :class="changes(r.status) ? 'dirty' : 'clean'">
          {{ changes(r.status) ? plural(changes(r.status), 'alteração', 'alterações') : 'limpo' }}
        </span>
      </div>

      <template v-if="r.status">
        <div class="card-branch">
          <AppIcon name="branch" />
          <span class="name">{{ r.status.branch ?? (r.status.detached ? 'HEAD destacado' : '—') }}</span>
          <span class="ab">
            <template v-if="!r.status.upstream">sem upstream</template>
            <template v-else-if="!r.status.ahead && !r.status.behind">sincronizado</template>
            <template v-else>
              <span v-if="r.status.ahead" class="up">↑{{ r.status.ahead }}</span>
              <span v-if="r.status.behind" class="down"> ↓{{ r.status.behind }}</span>
            </template>
          </span>
        </div>
        <div class="card-stats">
          <span class="stat" title="Em stage"><i style="background: var(--ok)" /><b>{{ r.status.staged }}</b> staged</span>
          <span class="stat" title="Modificados"><i style="background: var(--warn)" /><b>{{ r.status.unstaged }}</b> mod.</span>
          <span class="stat" title="Novos (untracked)"><i style="background: var(--accent)" /><b>{{ r.status.untracked }}</b> novos</span>
          <span v-if="r.status.conflicted" class="stat" title="Conflitos"><i style="background: var(--danger)" /><b>{{ r.status.conflicted }}</b></span>
        </div>
        <div class="card-foot">
          <span><AppIcon name="tag" :size="11" /> <span class="tag">{{ r.status.lastTag ?? 'sem tag' }}</span></span>
          <span>·</span>
          <span :title="r.status.lastCommit?.subject">{{ r.status.lastCommit ? `último commit ${ago(r.status.lastCommit.time)}` : 'sem commits' }}</span>
        </div>
      </template>
      <div v-else class="card-foot">{{ r.error }}</div>
    </button>
  </section>
</template>
