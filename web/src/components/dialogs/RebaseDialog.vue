<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { api } from '../../api.ts';
import { closeDialog, rebaseStart } from '../../actions.ts';
import { toast } from '../../store.ts';
import type { RebaseAction, RebaseCommit } from '../../types.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ repoId: string; base?: string; fromLabel?: string }>();

interface Row {
  commit: RebaseCommit;
  action: RebaseAction;
  summary: string;
  body: string;
}

const loading = ref(true);
const busy = ref(false);
const resolvedBase = ref('');
const rows = ref<Row[]>([]);
const dragFrom = ref<number | null>(null);

const ACTIONS: { value: RebaseAction; label: string }[] = [
  { value: 'pick', label: 'pick' },
  { value: 'reword', label: 'reword' },
  { value: 'squash', label: 'squash' },
  { value: 'fixup', label: 'fixup' },
  { value: 'drop', label: 'drop' },
];

onMounted(async () => {
  try {
    const plan = await api.rebasePlan(props.repoId, props.base ?? 'HEAD');
    resolvedBase.value = plan.base.slice(0, 7);
    rows.value = plan.commits.map((commit) => ({ commit, action: 'pick', summary: '', body: '' }));
  } catch (err) {
    toast((err as Error).message, 'error');
    closeDialog();
  } finally {
    loading.value = false;
  }
});

function setAction(row: Row, action: RebaseAction) {
  row.action = action;
  // reword começa editando a mensagem original, em vez de um campo em branco.
  if (action === 'reword' && !row.summary.trim()) row.summary = row.commit.subject;
}

function move(i: number, delta: -1 | 1) {
  const j = i + delta;
  if (j < 0 || j >= rows.value.length) return;
  [rows.value[i], rows.value[j]] = [rows.value[j], rows.value[i]];
}
function onDrop(i: number) {
  const from = dragFrom.value;
  dragFrom.value = null;
  if (from === null || from === i) return;
  const [moved] = rows.value.splice(from, 1);
  rows.value.splice(i, 0, moved);
}

// squash sempre junta no commit ANTERIOR da nova ordem — não faz sentido ser o primeiro passo.
const squashNeedsPredecessor = computed(() => rows.value.length && rows.value[0].action === 'squash');
const anyPublished = computed(() => rows.value.some((r) => r.commit.published && r.action !== 'pick'));
const kept = computed(() => rows.value.filter((r) => r.action !== 'drop').length);
const confirmPublished = ref(false);
const canSubmit = computed(() =>
  !busy.value && !loading.value && rows.value.length > 0 && !squashNeedsPredecessor.value
  && rows.value.every((r) => r.action !== 'reword' || r.summary.trim())
  && (!anyPublished.value || confirmPublished.value),
);

const summaryText = computed(() => {
  const drops = rows.value.filter((r) => r.action === 'drop').length;
  const squashed = rows.value.filter((r) => r.action === 'squash' || r.action === 'fixup').length;
  const parts: string[] = [];
  if (kept.value !== rows.value.length) parts.push(`${rows.value.length} commits → ${kept.value}`);
  if (drops) parts.push(`${drops} removido(s)`);
  if (squashed) parts.push(`${squashed} combinado(s)`);
  return parts.length ? parts.join(' · ') : `${rows.value.length} commit(s), só reordenando`;
});

async function submit() {
  if (!canSubmit.value) return;
  busy.value = true;
  await rebaseStart(
    props.repoId,
    props.base ?? 'HEAD',
    rows.value.map((r) => ({ hash: r.commit.hash, action: r.action, summary: r.summary || undefined, body: r.body || undefined })),
  );
  busy.value = false;
}
</script>

<template>
  <BaseDialog title="Rebase interativo" :width="640" :busy="busy" @close="closeDialog">
    <p v-if="fromLabel" class="faint">A partir do commit <code>{{ fromLabel }}</code>{{ resolvedBase ? ` (base: ${resolvedBase})` : '' }}.</p>
    <p v-if="loading" class="faint">Carregando commits…</p>

    <template v-else>
      <p v-if="!rows.length" class="faint">Não há commits entre a base e o HEAD.</p>
      <ul v-else class="rebase-list">
        <li
          v-for="(row, i) in rows"
          :key="row.commit.hash"
          class="rebase-row"
          :class="{ drop: row.action === 'drop' }"
          draggable="true"
          @dragstart="dragFrom = i"
          @dragover.prevent
          @drop="onDrop(i)"
        >
          <div class="rebase-main">
            <span class="rebase-handle" title="Arraste para reordenar">⠿</span>
            <div class="rebase-order">
              <button type="button" class="btn ghost sm" :disabled="i === 0" title="Mover para cima" @click="move(i, -1)">↑</button>
              <button type="button" class="btn ghost sm" :disabled="i === rows.length - 1" title="Mover para baixo" @click="move(i, 1)">↓</button>
            </div>
            <select v-model="row.action" class="rebase-action" @change="setAction(row, row.action)">
              <option v-for="a in ACTIONS" :key="a.value" :value="a.value">{{ a.label }}</option>
            </select>
            <code class="rebase-hash">{{ row.commit.hash.slice(0, 7) }}</code>
            <span class="rebase-subject">{{ row.commit.subject }}</span>
            <span class="faint rebase-author">{{ row.commit.author }}</span>
            <span v-if="row.commit.published" class="chip u" title="Esse commit já está em algum remoto">publicado</span>
          </div>
          <div v-if="row.action === 'reword' || row.action === 'squash'" class="rebase-msg">
            <input v-model="row.summary" :placeholder="row.action === 'squash' ? 'Mensagem combinada (em branco = junção automática do git)' : 'Nova mensagem'">
            <textarea v-model="row.body" rows="2" placeholder="Descrição (opcional)" />
          </div>
        </li>
      </ul>
      <p v-if="squashNeedsPredecessor" class="warn">⚠ O primeiro commit não pode ser "squash" — ele entra em quem vem antes, e não há ninguém antes dele aqui.</p>

      <label v-if="anyPublished" class="check">
        <input v-model="confirmPublished" type="checkbox">
        Entendo que isso reescreve commits que já estão no remoto — o próximo push vai precisar de <code>--force</code>.
      </label>

      <p class="faint">{{ summaryText }}</p>
    </template>

    <template #footer>
      <button class="btn" :disabled="busy" @click="closeDialog">Cancelar</button>
      <button class="btn primary" :disabled="!canSubmit" @click="submit">{{ busy ? 'Rebaseando…' : 'Rebase' }}</button>
    </template>
  </BaseDialog>
</template>
