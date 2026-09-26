<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, IS_STATIC } from '../api.ts';
import { openCommitDiff, repoById, repoColor, selectCommit, state, toast } from '../store.ts';
import type { CommitDetail } from '../types.ts';
import { ago, fullDate, plural } from '../utils.ts';
import AppIcon from './AppIcon.vue';
import FileItem from './FileItem.vue';
import UserAvatar from './UserAvatar.vue';

const props = defineProps<{ repoId: string; hash: string }>();

const commit = computed(() => state.graphs[props.repoId]?.commits.find((c) => c.hash === props.hash));
const detail = ref<CommitDetail | null>(null);
const loading = ref(false);

watch(
  () => [props.repoId, props.hash] as const,
  async ([id, hash]) => {
    detail.value = null;
    if (IS_STATIC) return;
    loading.value = true;
    try {
      const d = await api.commit(id, hash);
      if (props.hash === hash) detail.value = d;
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const message = computed(() => detail.value?.message ?? commit.value?.subject ?? '');
const subject = computed(() => message.value.split('\n')[0]);
const body = computed(() => message.value.split('\n').slice(1).join('\n').trim());
const parents = computed(() => detail.value?.parents ?? commit.value?.parents ?? []);

function gotoParent(p: string) {
  if (state.graphs[props.repoId]?.commits.some((c) => c.hash === p)) selectCommit(props.repoId, p, true);
  else toast('Esse commit está fora dos carregados (--max).');
}

async function copy() {
  await navigator.clipboard?.writeText(props.hash).catch(() => {});
  toast('Hash copiado');
}
</script>

<template>
  <template v-if="commit">
    <div class="d-top">
      <span class="repo-dot" :style="{ '--c': repoColor(repoId) }" />
      <b>{{ repoById(repoId)?.name }}</b>
      <span class="muted">·</span>
      <code>{{ hash.slice(0, 8) }}</code>
      <button class="btn ghost sm" title="Copiar hash" @click="copy"><AppIcon name="copy" /></button>
    </div>

    <div class="d-card">
      <h2 class="d-subject">{{ subject }}</h2>
      <pre v-if="body" class="d-body">{{ body }}</pre>
    </div>

    <div class="d-meta">
      <UserAvatar :name="commit.author" :email="commit.email" large />
      <div class="who">
        <b>{{ commit.author }}</b>
        <span :title="commit.email">{{ fullDate(commit.time) }} · {{ ago(commit.time) }}</span>
      </div>
      <div class="d-parents">
        <template v-if="parents.length">
          {{ parents.length > 1 ? 'pais' : 'pai' }}<br>
          <button v-for="p in parents" :key="p" class="link" @click="gotoParent(p)">{{ p.slice(0, 7) }} </button>
        </template>
        <template v-else>commit raiz</template>
      </div>
    </div>

    <div v-if="IS_STATIC" class="d-note">
      Arquivos e diffs ficam disponíveis no modo servidor (rode <code>hydra</code> sem <code>--out</code>).
    </div>
    <div v-else-if="loading" class="d-note">Carregando arquivos…</div>
    <template v-else-if="detail">
      <div class="d-section">
        <b>{{ plural(detail.files.length, 'arquivo alterado', 'arquivos alterados') }}</b>
        <span v-if="detail.parents.length > 1" class="faint">(vs. 1º pai)</span>
      </div>
      <ul class="files">
        <FileItem
          v-for="f in detail.files"
          :key="f.path"
          :path="f.path"
          :orig="f.orig"
          :status="f.status"
          :active="state.diff?.key === `c:${hash}:${f.path}`"
          @click="openCommitDiff(repoId, hash, f.path)"
        />
      </ul>
    </template>
  </template>
</template>
