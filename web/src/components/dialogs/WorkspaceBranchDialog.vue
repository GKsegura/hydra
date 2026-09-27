<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { closeDialog } from '../../actions.ts';
import { api } from '../../api.ts';
import { refreshRepo, repoColor, toast } from '../../store.ts';
import type { RepoBranches, RepoMergePreview, RepoResult } from '../../types.ts';
import AppIcon from '../AppIcon.vue';
import BaseDialog from './BaseDialog.vue';

type Tab = 'create' | 'checkout' | 'merge';
const props = defineProps<{ tab?: Tab; branch?: string }>();

const tab = ref<Tab>(props.tab ?? 'create');
const repos = ref<RepoBranches[]>([]);
const loading = ref(true);
const busy = ref(false);
const results = ref<{ title: string; list: RepoResult[] } | null>(null);

onMounted(async () => {
  try {
    repos.value = await api.workspaceBranches();
    for (const r of repos.value) {
      create[r.id] = { on: true, from: '' };
      change[r.id] = { on: true, mode: 'stash', create: false };
    }
  } catch (err) {
    toast((err as Error).message, 'error');
  } finally {
    loading.value = false;
  }
});

/** Nome da branch sem o remoto na frente ("origin/feature/x" → "feature/x"). */
const short = (remote: string) => remote.slice(remote.indexOf('/') + 1);
const where = (r: RepoBranches, name: string): 'local' | 'remote' | null =>
  r.local.includes(name) ? 'local' : r.remote.some((x) => short(x) === name) ? 'remote' : null;

/** Todas as branches do workspace, as que existem em mais repos primeiro (sugestões dos campos). */
const allBranches = computed(() => {
  const count = new Map<string, number>();
  for (const r of repos.value) {
    for (const n of new Set([...r.local, ...r.remote.map(short)])) count.set(n, (count.get(n) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
});

const cleanName = (s: string) => s.trim().replace(/\s+/g, '-');

// ---------------------------------------------------------------- Criar
const newName = ref('');
const switchTo = ref(true);
const create = reactive<Record<string, { on: boolean; from: string }>>({});
const createTargets = computed(() => repos.value.filter((r) => create[r.id]?.on && !r.local.includes(cleanName(newName.value))));

// ---------------------------------------------------------------- Trocar
const target = ref(props.tab === 'checkout' ? props.branch ?? '' : '');
const change = reactive<Record<string, { on: boolean; mode: 'carry' | 'stash'; create: boolean }>>({});
const checkoutTargets = computed(() =>
  repos.value.filter((r) => {
    const c = change[r.id];
    const name = cleanName(target.value);
    return c?.on && name && r.current !== name && !r.operation && (where(r, name) || c.create);
  }),
);

// ---------------------------------------------------------------- Mergear
const mergeBranch = ref(props.tab === 'merge' ? props.branch ?? '' : '');
const noFf = ref(false);
const previews = ref<RepoMergePreview[]>([]);
const mergeOn = reactive<Record<string, boolean>>({});
let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch([mergeBranch, tab, () => repos.value.length], () => {
  clearTimeout(previewTimer);
  previews.value = [];
  const name = cleanName(mergeBranch.value);
  if (tab.value !== 'merge' || !name || !repos.value.length) return;
  previewTimer = setTimeout(async () => {
    try {
      const list = await api.workspaceMergePreview(repos.value.map((r) => r.id), name);
      if (cleanName(mergeBranch.value) !== name) return;
      previews.value = list;
      // Marcados de início: os que têm o que mergear sem conflito. Conflitos ficam desmarcados até você decidir.
      for (const p of list) mergeOn[p.id] = !!p.preview && !p.preview.upToDate && !p.preview.conflicts.length;
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  }, 300);
});
const mergeTargets = computed(() => previews.value.filter((p) => p.preview && !p.preview.upToDate && mergeOn[p.id]));
function describe(p: RepoMergePreview): string {
  if (!p.preview) return p.reason ?? '';
  if (p.preview.upToDate) return `${p.current} já tem tudo`;
  const n = `${p.preview.commits} commit${p.preview.commits === 1 ? '' : 's'}`;
  if (p.preview.conflicts.length) return `${n} · conflito em ${p.preview.conflicts.join(', ')}`;
  return `${n}${p.preview.fastForward ? ' · fast-forward' : ''}`;
}

// ---------------------------------------------------------------- executar
const count = computed(() => (tab.value === 'create' ? createTargets.value : tab.value === 'checkout' ? checkoutTargets.value : mergeTargets.value).length);
const canRun = computed(() => {
  if (busy.value || !count.value) return false;
  if (tab.value === 'create') return !!cleanName(newName.value);
  if (tab.value === 'checkout') return !!cleanName(target.value);
  return !!cleanName(mergeBranch.value);
});
const actionLabel = computed(() => {
  const n = `${count.value} repositório${count.value === 1 ? '' : 's'}`;
  if (tab.value === 'create') return `Criar em ${n}`;
  if (tab.value === 'checkout') return `Trocar ${n}`;
  return `Mergear em ${n}`;
});

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    let list: RepoResult[];
    let title: string;
    if (tab.value === 'create') {
      const name = cleanName(newName.value);
      ({ results: list } = await api.workspaceCreateBranch(createTargets.value.map((r) => ({ id: r.id, from: create[r.id].from || undefined })), name, switchTo.value));
      title = `Criar ${name}`;
    } else if (tab.value === 'checkout') {
      const name = cleanName(target.value);
      ({ results: list } = await api.workspaceCheckout(checkoutTargets.value.map((r) => ({ id: r.id, mode: change[r.id].mode, create: change[r.id].create })), name));
      title = `Trocar para ${name}`;
    } else {
      const name = cleanName(mergeBranch.value);
      ({ results: list } = await api.workspaceMerge(mergeTargets.value.map((p) => p.id), name, noFf.value));
      title = `Mergear ${name}`;
    }
    results.value = { title, list };
    const failed = list.filter((r) => r.outcome === 'error' || r.outcome === 'conflict').length;
    toast(failed ? `${failed} repositório(s) precisam de atenção` : 'Feito em todos os repositórios', failed ? 'error' : 'ok');
    await Promise.all(list.map((r) => refreshRepo(r.id)));
  } catch (err) {
    toast((err as Error).message, 'error');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BaseDialog title="Branch no workspace" :width="680" :busy="busy" @close="closeDialog">
    <p v-if="loading" class="faint">Carregando branches…</p>

    <template v-else-if="!results">
      <div class="wb-tabs" role="tablist">
        <button :class="{ on: tab === 'create' }" role="tab" @click="tab = 'create'">Criar</button>
        <button :class="{ on: tab === 'checkout' }" role="tab" @click="tab = 'checkout'">Trocar</button>
        <button :class="{ on: tab === 'merge' }" role="tab" @click="tab = 'merge'">Mergear</button>
      </div>
      <datalist id="wb-branches"><option v-for="b in allBranches" :key="b" :value="b" /></datalist>

      <!-- Criar -->
      <template v-if="tab === 'create'">
        <form class="form" @submit.prevent="run">
          <label class="field"><span>Nome da branch</span><input v-model="newName" placeholder="Ex.: feature/docker-instalacao"></label>
          <label class="check"><input v-model="switchTo" type="checkbox"> Trocar para ela depois de criar</label>
          <button type="submit" hidden />
        </form>
        <ul class="wc-list">
          <li v-for="r in repos" :key="r.id" :style="{ '--c': repoColor(r.id) }" :class="{ off: r.local.includes(cleanName(newName)) }">
            <label class="wc-repo">
              <input v-model="create[r.id].on" type="checkbox" :disabled="r.local.includes(cleanName(newName))">
              <span class="repo-dot" /><b>{{ r.name }}</b>
            </label>
            <span v-if="r.local.includes(cleanName(newName))" class="wc-warn">já existe</span>
            <label v-else class="wb-from">
              a partir de
              <select v-model="create[r.id].from" :disabled="!create[r.id].on">
                <option value="">{{ r.current ?? 'HEAD' }} (atual)</option>
                <option v-for="b in r.local.filter((x) => x !== r.current)" :key="b" :value="b">{{ b }}</option>
              </select>
            </label>
          </li>
        </ul>
      </template>

      <!-- Trocar -->
      <template v-else-if="tab === 'checkout'">
        <form class="form" @submit.prevent="run">
          <label class="field"><span>Branch</span><input v-model="target" list="wb-branches" placeholder="Escolha ou digite o nome"></label>
          <button type="submit" hidden />
        </form>
        <ul class="wc-list">
          <li v-for="r in repos" :key="r.id" :style="{ '--c': repoColor(r.id) }" :class="{ off: !!r.operation || r.current === cleanName(target) }">
            <label class="wc-repo">
              <input v-model="change[r.id].on" type="checkbox" :disabled="!!r.operation || r.current === cleanName(target)">
              <span class="repo-dot" /><b>{{ r.name }}</b>
              <span class="faint wc-branch"><AppIcon name="branch" :size="12" />{{ r.current ?? 'HEAD' }}</span>
            </label>
            <template v-if="cleanName(target)">
              <span v-if="r.operation" class="chip u">{{ r.operation }} em andamento</span>
              <span v-else-if="r.current === cleanName(target)" class="chip s">já está nela</span>
              <span v-else-if="where(r, cleanName(target)) === 'local'" class="chip s">local</span>
              <span v-else-if="where(r, cleanName(target)) === 'remote'" class="chip n">só no remoto: vai rastrear</span>
              <label v-else class="wc-all"><input v-model="change[r.id].create" type="checkbox" :disabled="!change[r.id].on"> não existe: criar</label>
              <select v-if="r.dirty && !r.operation && r.current !== cleanName(target)" v-model="change[r.id].mode" class="wb-mode" title="O que fazer com as alterações não commitadas desse repo">
                <option value="stash">guardar alterações</option>
                <option value="carry">levar alterações</option>
              </select>
            </template>
          </li>
        </ul>
      </template>

      <!-- Mergear -->
      <template v-else>
        <form class="form" @submit.prevent="run">
          <label class="field"><span>Branch que vai entrar (na branch atual de cada repo)</span><input v-model="mergeBranch" list="wb-branches" placeholder="Ex.: feature/docker-instalacao"></label>
          <label class="check"><input v-model="noFf" type="checkbox"> Sempre criar commit de merge (<code>--no-ff</code>)</label>
          <button type="submit" hidden />
        </form>
        <p v-if="cleanName(mergeBranch) && !previews.length" class="faint">Calculando a prévia…</p>
        <ul v-else-if="previews.length" class="wc-list">
          <li v-for="p in previews" :key="p.id" :style="{ '--c': repoColor(p.id) }" :class="{ off: !p.preview || p.preview.upToDate }">
            <label class="wc-repo">
              <input v-model="mergeOn[p.id]" type="checkbox" :disabled="!p.preview || p.preview.upToDate">
              <span class="repo-dot" /><b>{{ p.name }}</b>
              <span class="faint wc-branch"><AppIcon name="branch" :size="12" />{{ p.current ?? 'HEAD' }}</span>
            </label>
            <span class="wb-preview" :class="{ warn: !!p.preview?.conflicts.length, muted: !p.preview || p.preview.upToDate }">
              {{ p.preview?.conflicts.length ? '⚠ ' : '' }}{{ describe(p) }}
            </span>
          </li>
        </ul>
        <p v-if="previews.some((p) => p.preview?.conflicts.length)" class="faint">
          Repos com conflito começam desmarcados. Se marcar, o merge para no conflito e você resolve pelo painel do repo, como num merge normal.
        </p>
      </template>
    </template>

    <template v-else>
      <p class="faint"><b>{{ results.title }}</b></p>
      <ul class="wc-results">
        <li v-for="r in results.list" :key="r.id" :class="r.outcome" :style="{ '--c': repoColor(r.id) }">
          <span class="wc-icon">{{ r.outcome === 'ok' ? '✓' : r.outcome === 'skipped' ? '–' : r.outcome === 'conflict' ? '⚠' : '✗' }}</span>
          <span class="repo-dot" /><b>{{ r.name }}</b>
          <span class="faint">{{ r.message }}</span>
        </li>
      </ul>
    </template>

    <template #footer>
      <template v-if="!results">
        <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
        <button class="btn primary" :disabled="!canRun" @click="run">{{ busy ? 'Executando…' : actionLabel }}</button>
      </template>
      <button v-else class="btn primary" @click="closeDialog">Fechar</button>
    </template>
  </BaseDialog>
</template>
