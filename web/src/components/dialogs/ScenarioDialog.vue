<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { closeDialog } from '../../actions.ts';
import { api } from '../../api.ts';
import { repoColor, state, toast } from '../../store.ts';
import { cleanSteps, describeStep, MAX_STEPS, moveItem, overallText, stepTitle, summarizeRepo, type StepDraft } from '../../scenario.ts';
import type { RepoBranches, RepoScenario } from '../../types.ts';
import AppIcon from '../AppIcon.vue';
import BaseDialog from './BaseDialog.vue';

/**
 * Simula uma sequência de passos (merge, cherry-pick, rebase) sobre uma base em vários repositórios. Só previsão: nenhum
 * repositório é alterado. `commit` abre com um passo de cherry-pick desse commit (menu de um commit no grafo).
 */
const props = defineProps<{ commit?: string; repoId?: string }>();
const repos = ref<RepoBranches[]>([]);
const loading = ref(true);
const running = ref(false);
const on = reactive<Record<string, boolean>>({});

const base = ref('');
const steps = ref<StepDraft[]>([props.commit ? { op: 'cherry-pick', value: props.commit } : { op: 'merge', value: '' }]);
const result = ref<RepoScenario[] | null>(null);

const short = (remote: string) => remote.slice(remote.indexOf('/') + 1);

/** Todas as branches do workspace, as que existem em mais repos primeiro (sugestões dos campos). */
const allBranches = computed(() => {
  const count = new Map<string, number>();
  for (const r of repos.value) {
    for (const n of new Set([...r.local, ...r.remote.map(short)])) count.set(n, (count.get(n) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n);
});

onMounted(async () => {
  try {
    repos.value = await api.workspaceBranches();
    // Aberto pelo menu de um commit: só o repositório dele (o hash não existe nos outros).
    for (const r of repos.value) on[r.id] = !props.repoId || r.id === props.repoId;
    // Sugestão de base: a branch em uso na maioria dos repos.
    const current = new Map<string, number>();
    for (const r of repos.value) if (r.current) current.set(r.current, (current.get(r.current) ?? 0) + 1);
    base.value = [...current].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  } catch (err) {
    toast((err as Error).message, 'error');
  } finally {
    loading.value = false;
  }
});

// Mudou o cenário? O resultado antigo deixa de valer e sai da tela, em vez de mostrar uma previsão que não é a deste cenário.
watch([base, steps, () => ({ ...on })], () => (result.value = null), { deep: true });

const selected = computed(() => repos.value.filter((r) => on[r.id]));
const filled = computed(() => cleanSteps(steps.value));
const canRun = computed(() => !running.value && !!base.value.trim() && filled.value.length > 0 && selected.value.length > 0);

const addStep = () => steps.value.length < MAX_STEPS && steps.value.push({ op: 'merge', value: '' });
const removeStep = (i: number) => (steps.value = steps.value.length > 1 ? steps.value.filter((_, k) => k !== i) : [{ op: 'merge', value: '' }]);

const OPS: { op: StepDraft['op']; label: string; hint: string }[] = [
  { op: 'merge', label: 'merge', hint: 'Branch que entra na base' },
  { op: 'cherry-pick', label: 'cherry-pick', hint: 'Commit (hash) ou branch (a ponta dela)' },
  { op: 'rebase', label: 'rebase sobre', hint: 'Branch sobre a qual a base é reaplicada' },
];
const hint = (op: StepDraft['op']) => OPS.find((o) => o.op === op)!.hint;

/** O commit selecionado no grafo, para preencher um cherry-pick (o hash só vale no repositório de onde ele veio). */
const selectedCommit = computed(() => (state.selected?.type === 'commit' ? state.selected : null));
const useSelected = (i: number) => selectedCommit.value && (steps.value[i].value = selectedCommit.value.hash);
const move = (i: number, to: number) => (steps.value = moveItem(steps.value, i, to));

async function simulate() {
  if (!canRun.value) return;
  running.value = true;
  try {
    const list = await api.workspaceScenario(selected.value.map((r) => r.id), base.value.trim(), filled.value);
    result.value = list;
  } catch (err) {
    toast((err as Error).message, 'error');
  } finally {
    running.value = false;
  }
}

const repoName = (id: string) => repos.value.find((r) => r.id === id)?.name ?? id;
</script>

<template>
  <BaseDialog title="Cenário: simular operações" :width="760" :busy="running" @close="closeDialog">
    <p v-if="loading" class="faint">Carregando branches…</p>

    <template v-else>
      <datalist id="sc-branches"><option v-for="b in allBranches" :key="b" :value="b" /></datalist>
      <p class="faint sc-lead">
        Veja o que aconteceria se a <b>base</b> passasse por estes passos, em ordem (merge, cherry-pick ou rebase), nos repositórios marcados.
        É uma previsão: nada é alterado nos repositórios.
      </p>

      <form class="form" @submit.prevent="simulate">
        <label class="field"><span>Base (a branch que recebe os merges)</span><input v-model="base" list="sc-branches" placeholder="Ex.: develop"></label>

        <div class="sc-steps">
          <span class="sc-label">Passos, em ordem</span>
          <div v-for="(st, i) in steps" :key="i" class="sc-step">
            <span class="sc-n">{{ i + 1 }}</span>
            <select v-model="st.op" class="sc-op" title="O que este passo faz">
              <option v-for="o in OPS" :key="o.op" :value="o.op">{{ o.label }}</option>
            </select>
            <input v-model="st.value" :list="st.op === 'cherry-pick' ? undefined : 'sc-branches'" :placeholder="hint(st.op)">
            <button
              v-if="st.op === 'cherry-pick'"
              type="button"
              class="btn ghost sm"
              :disabled="!selectedCommit"
              title="Usa o commit que está selecionado no grafo (vale no repositório dele; nos outros o passo é ignorado)"
              @click="useSelected(i)"
            >Usar o selecionado</button>
            <button type="button" class="btn ghost sm" title="Subir" :disabled="i === 0" @click="move(i, i - 1)">↑</button>
            <button type="button" class="btn ghost sm" title="Descer" :disabled="i === steps.length - 1" @click="move(i, i + 1)">↓</button>
            <button type="button" class="btn ghost sm" title="Remover o passo" @click="removeStep(i)">✕</button>
          </div>
          <button type="button" class="btn sm" :disabled="steps.length >= MAX_STEPS" @click="addStep">+ Adicionar passo</button>
        </div>
        <button type="submit" hidden />
      </form>

      <span class="sc-label">Repositórios</span>
      <ul class="wc-list sc-repos">
        <li v-for="r in repos" :key="r.id" :style="{ '--c': repoColor(r.id) }">
          <label class="wc-repo">
            <input v-model="on[r.id]" type="checkbox">
            <span class="repo-dot" /><b>{{ r.name }}</b>
            <span class="faint wc-branch"><AppIcon name="branch" :size="12" />{{ r.current ?? 'HEAD' }}</span>
          </label>
        </li>
      </ul>

      <p v-if="running" class="faint">Simulando…</p>

      <template v-else-if="result">
        <p class="sc-overall"><b>{{ overallText(result) }}</b></p>
        <ul class="sc-results">
          <li v-for="r in result" :key="r.id" :style="{ '--c': repoColor(r.id) }">
            <div class="sc-head">
              <span class="repo-dot" /><b>{{ repoName(r.id) }}</b>
              <span v-if="r.baseRef" class="faint wc-branch"><AppIcon name="branch" :size="12" />{{ r.baseRef }}</span>
              <span class="sc-sum" :class="summarizeRepo(r).tone">{{ summarizeRepo(r).text }}</span>
            </div>
            <ol v-if="!r.reason && r.steps.length" class="sc-list">
              <li v-for="(s, i) in r.steps" :key="i" :class="describeStep(s, i, r.stoppedAt).tone">
                <span class="sc-icon">{{ describeStep(s, i, r.stoppedAt).icon }}</span>
                <span class="sc-what">{{ i + 1 }}. <code>{{ stepTitle(s) }}</code></span>
                <span class="sc-text">{{ describeStep(s, i, r.stoppedAt).text }}</span>
              </li>
            </ol>
          </li>
        </ul>
        <p class="faint">Previsão feita com <code>git merge-tree</code> (cherry-pick e rebase pedem Git 2.40 ou mais novo). Para executar, use <b>Branch no workspace…</b> (Mergear), o merge do painel do repositório ou o terminal.</p>
      </template>
    </template>

    <template #footer>
      <button class="btn" @click="closeDialog">Fechar</button>
      <button class="btn primary" :disabled="!canRun" @click="simulate">{{ running ? 'Simulando…' : 'Simular' }}</button>
    </template>
  </BaseDialog>
</template>
