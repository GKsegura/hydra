<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { closeDialog, pushRepo } from '../../actions.ts';
import { api } from '../../api.ts';
import { refreshRepo, repoColor, state, statusOf, toast } from '../../store.ts';
import type { RepoResult } from '../../types.ts';
import AppIcon from '../AppIcon.vue';
import BaseDialog from './BaseDialog.vue';

// Repos com alguma alteração. Os que têm algo em stage já vêm marcados.
const candidates = computed(() =>
  (state.summary?.repos ?? [])
    .map((r) => ({ id: r.id, name: r.name, s: statusOf(r.id) }))
    .filter((r) => r.s && r.s.files.length > 0),
);
const pick = reactive<Record<string, { on: boolean; all: boolean }>>(
  Object.fromEntries(candidates.value.map((r) => [r.id, { on: r.s!.staged > 0, all: false }])),
);
const blocked = (id: string) => {
  const s = statusOf(id);
  return s?.operation ? `${s.operation} em andamento` : s?.conflicted ? 'conflitos' : null;
};
/** Vai ter algo para commitar nesse repo? */
const willCommit = (id: string) => {
  const s = statusOf(id);
  return !!s && (pick[id].all ? s.files.length > 0 : s.staged > 0);
};
const chosen = computed(() => candidates.value.filter((r) => pick[r.id]?.on && !blocked(r.id)));
const ready = computed(() => chosen.value.filter((r) => willCommit(r.id)));

const summary = ref('');
const body = ref('');
const push = ref(false);
const busy = ref(false);
const results = ref<RepoResult[] | null>(null);
const pushing = reactive<Record<string, 'enviando' | 'enviado' | 'sem remoto' | 'falhou'>>({});

function toggle(id: string, on: boolean) {
  pick[id].on = on;
  // Marcou um repo sem nada em stage: "incluir tudo" é o que faz sentido.
  if (on && !statusOf(id)?.staged) pick[id].all = true;
}

async function submit() {
  if (!summary.value.trim() || !ready.value.length || busy.value) return;
  busy.value = true;
  try {
    const { results: res } = await api.workspaceCommit(
      ready.value.map((r) => ({ id: r.id, stageAll: pick[r.id].all })),
      summary.value.trim(),
      body.value,
    );
    results.value = res;
    const ok = res.filter((r) => r.outcome === 'ok');
    toast(`Commit em ${ok.length} de ${res.length} repositório(s)`, ok.length === res.length ? 'ok' : 'error');
    await Promise.all(res.map((r) => refreshRepo(r.id)));
    if (push.value) {
      // Um push por repo, ao mesmo tempo; o progresso aparece também no botão de sync de cada painel.
      await Promise.all(ok.map(async (r) => {
        if (!statusOf(r.id)?.remotes.length) return void (pushing[r.id] = 'sem remoto');
        pushing[r.id] = 'enviando';
        await pushRepo(r.id);
        pushing[r.id] = (statusOf(r.id)?.ahead ?? 0) === 0 && statusOf(r.id)?.upstream ? 'enviado' : 'falhou';
      }));
    }
  } catch (err) {
    toast((err as Error).message, 'error');
  } finally {
    busy.value = false;
  }
}

function onKey(ev: KeyboardEvent) {
  if ((ev.ctrlKey || ev.metaKey) && ev.key === 'Enter') {
    ev.preventDefault();
    void submit();
  }
}
</script>

<template>
  <BaseDialog title="Commit no workspace" :width="620" :busy="busy" @close="closeDialog">
    <template v-if="!results">
      <p v-if="!candidates.length" class="faint">Nenhum repositório tem alterações.</p>
      <template v-else>
        <p class="faint">A mesma mensagem, em cada repositório marcado. Cada commit leva o que estiver em stage (ou tudo, com <b>incluir tudo</b>).</p>
        <ul class="wc-list">
          <li v-for="r in candidates" :key="r.id" :class="{ off: !!blocked(r.id) }" :style="{ '--c': repoColor(r.id) }">
            <label class="wc-repo">
              <input type="checkbox" :checked="pick[r.id].on && !blocked(r.id)" :disabled="!!blocked(r.id)" @change="toggle(r.id, ($event.target as HTMLInputElement).checked)">
              <span class="repo-dot" />
              <b>{{ r.name }}</b>
              <span class="faint wc-branch"><AppIcon name="branch" :size="12" />{{ r.s!.branch ?? 'HEAD' }}</span>
            </label>
            <span class="wc-counts">
              <span v-if="blocked(r.id)" class="chip u">{{ blocked(r.id) }}</span>
              <template v-else>
                <span class="chip s">{{ r.s!.staged }} staged</span>
                <span v-if="r.s!.unstaged" class="chip m">{{ r.s!.unstaged }} mod.</span>
                <span v-if="r.s!.untracked" class="chip n">{{ r.s!.untracked }} novo(s)</span>
              </template>
            </span>
            <label v-if="!blocked(r.id)" class="wc-all" title="Coloca tudo no stage antes de commitar">
              <input v-model="pick[r.id].all" type="checkbox" :disabled="!pick[r.id].on">
              incluir tudo
            </label>
            <span v-if="pick[r.id].on && !blocked(r.id) && !willCommit(r.id)" class="wc-warn">nada em stage</span>
          </li>
        </ul>
        <form class="form" @submit.prevent="submit" @keydown="onKey">
          <label class="field">
            <span>Resumo <small class="faint" :class="{ over: summary.length > 72 }">{{ summary.length }}/72</small></span>
            <input v-model="summary" placeholder="Ex.: feat: instalação com Docker">
          </label>
          <label class="field"><span>Descrição <small class="faint">(opcional)</small></span><textarea v-model="body" rows="3" /></label>
          <label class="check"><input v-model="push" type="checkbox"> Enviar (push) depois</label>
          <button type="submit" hidden />
        </form>
      </template>
    </template>

    <ul v-else class="wc-results">
      <li v-for="r in results" :key="r.id" :class="r.outcome" :style="{ '--c': repoColor(r.id) }">
        <span class="wc-icon">{{ r.outcome === 'ok' ? '✓' : r.outcome === 'skipped' ? '–' : '✗' }}</span>
        <span class="repo-dot" />
        <b>{{ r.name }}</b>
        <code v-if="r.hash">{{ r.hash.slice(0, 7) }}</code>
        <span class="faint">{{ r.message }}</span>
        <span v-if="pushing[r.id]" class="wc-push" :class="pushing[r.id]">push: {{ pushing[r.id] }}</span>
      </li>
    </ul>

    <template #footer>
      <template v-if="!results">
        <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
        <button class="btn primary" :disabled="busy || !summary.trim() || !ready.length" title="Ctrl+Enter" @click="submit">
          {{ busy ? 'Commitando…' : `Commit em ${ready.length} repositório${ready.length === 1 ? '' : 's'}` }}
        </button>
      </template>
      <button v-else class="btn primary" :disabled="busy" @click="closeDialog">{{ busy ? 'Enviando…' : 'Fechar' }}</button>
    </template>
  </BaseDialog>
</template>
