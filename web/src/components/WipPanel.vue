<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, IS_STATIC } from '../api.ts';
import { abortOperation, continueOperation, discard, openConflict, openDialog, openMenu, undoLastCommit } from '../actions.ts';
import { commitStaged, loadOperation, openWorkDiff, repoById, repoColor, stageFiles, state, statusOf, unstageFiles } from '../store.ts';
import FileItem from './FileItem.vue';

const props = defineProps<{ repoId: string }>();

const status = computed(() => statusOf(props.repoId));
const conflicted = computed(() => status.value?.files.filter((f) => f.index === 'U') ?? []);
const unstaged = computed(() => status.value?.files.filter((f) => f.index !== 'U' && f.work !== '.') ?? []);
const staged = computed(() => status.value?.files.filter((f) => f.index !== '.' && f.index !== 'U') ?? []);
const op = computed(() => state.operations[props.repoId]);

// O rascunho fica na store: trocar de repo ou de commit não perde a mensagem.
state.drafts[props.repoId] ??= { summary: '', body: '' };
const draft = computed(() => state.drafts[props.repoId]);
const amend = computed({
  get: () => !!state.amend[props.repoId],
  set: (v: boolean) => (state.amend[props.repoId] = v),
});
// Amend permite commit sem nada em stage (só trocar a mensagem).
const canCommit = computed(() => !!draft.value.summary.trim() && (staged.value.length > 0 || amend.value) && !state.busy && !status.value?.operation);

// Ao marcar "emendar", preenche com a mensagem do último commit (como o GitHub Desktop).
watch(amend, async (on) => {
  if (!on || draft.value.summary.trim()) return;
  const last = await api.lastCommit(props.repoId).catch(() => null);
  if (last) state.drafts[props.repoId] = { ...last };
});

// Merge/revert em andamento: mensagem do commit final.
const opMessage = ref('');
watch(
  () => status.value?.operation,
  async (o) => {
    if (!o) return;
    if (!op.value) await loadOperation(props.repoId).catch(() => {});
    opMessage.value = op.value?.message ?? '';
  },
  { immediate: true },
);

const diffKey = (file: string, isStaged: boolean) => `w:${isStaged}:${file}`;

function fileMenu(ev: MouseEvent, path: string, isStaged: boolean) {
  if (IS_STATIC) return;
  openMenu(ev, [
    isStaged ? { label: 'Unstage', run: () => unstageFiles(props.repoId, [path]) } : { label: 'Stage', run: () => stageFiles(props.repoId, [path]) },
    { label: 'Ver diff', run: () => openWorkDiff(props.repoId, path, isStaged) },
    { separator: true, label: '' },
    { label: 'Descartar alterações…', danger: true, run: () => discard(props.repoId, [path]) },
    { label: 'Copiar caminho', run: () => navigator.clipboard?.writeText(path) },
  ]);
}
</script>

<template>
  <template v-if="status">
    <div class="d-top">
      <span class="repo-dot" :style="{ '--c': repoColor(repoId) }" />
      <span><b>{{ repoById(repoId)?.name }}</b> · {{ status.branch ?? 'HEAD destacado' }}</span>
      <button v-if="!IS_STATIC && status.files.length && !status.operation" class="btn sm ghost push-right" title="Guardar alterações (stash)" @click="openDialog('stash', { repoId })">Stash</button>
    </div>

    <!-- Merge / revert em andamento -->
    <template v-if="status.operation && !IS_STATIC">
      <div class="op-box" :class="{ done: !conflicted.length }">
        <b>{{ op?.incoming ? `Merge de ${op.incoming} em ${op.current}` : `${status.operation} em andamento` }}</b>
        <p v-if="conflicted.length" class="faint">Resolva os {{ conflicted.length }} arquivo(s) abaixo. Clique em um para abrir o resolvedor.</p>
        <p v-else class="faint">Todos os conflitos foram resolvidos. Revise a mensagem e conclua.</p>
      </div>
      <template v-if="conflicted.length">
        <div class="d-section"><b>{{ conflicted.length }}</b> em conflito</div>
        <ul class="files">
          <FileItem v-for="f in conflicted" :key="f.path" :path="f.path" status="U" :active="state.conflict?.file.path === f.path" @click="openConflict(repoId, f.path)">
            <button class="btn sm act" @click.stop="openConflict(repoId, f.path)">Resolver</button>
          </FileItem>
        </ul>
      </template>
    </template>

    <div class="d-section">
      <b>{{ unstaged.length }}</b> não staged
      <template v-if="!IS_STATIC && unstaged.length">
        <button class="btn sm push-right" :disabled="state.busy" @click="stageFiles(repoId, 'all')">Stage all</button>
        <button v-if="!status.operation" class="btn sm ghost" title="Descartar todas as alterações" :disabled="state.busy" @click="discard(repoId, 'all')">Descartar</button>
      </template>
    </div>
    <ul class="files">
      <FileItem
        v-for="f in unstaged"
        :key="f.path"
        :path="f.path"
        :orig="f.orig"
        :status="f.work"
        :active="state.diff?.key === diffKey(f.path, false)"
        @click="openWorkDiff(repoId, f.path, false)"
        @contextmenu="fileMenu($event, f.path, false)"
      >
        <button v-if="!IS_STATIC" class="btn sm act" :disabled="state.busy" @click.stop="stageFiles(repoId, [f.path])">Stage</button>
      </FileItem>
      <li v-if="!unstaged.length" class="d-note">Nada aqui.</li>
    </ul>

    <div class="d-section">
      <b>{{ staged.length }}</b> staged
      <button v-if="!IS_STATIC && staged.length" class="btn sm push-right" :disabled="state.busy" @click="unstageFiles(repoId, 'all')">Unstage all</button>
    </div>
    <ul class="files">
      <FileItem
        v-for="f in staged"
        :key="f.path"
        :path="f.path"
        :orig="f.orig"
        :status="f.index"
        :active="state.diff?.key === diffKey(f.path, true)"
        @click="openWorkDiff(repoId, f.path, true)"
        @contextmenu="fileMenu($event, f.path, true)"
      >
        <button v-if="!IS_STATIC" class="btn sm act" :disabled="state.busy" @click.stop="unstageFiles(repoId, [f.path])">Unstage</button>
      </FileItem>
      <li v-if="!staged.length" class="d-note">Dê stage nos arquivos que vão entrar no commit. Clique direito num arquivo para mais opções.</li>
    </ul>

    <div v-if="IS_STATIC" class="d-note">
      Modo somente leitura (HTML gerado com <code>--out</code>). Rode <code>hydra</code> sem <code>--out</code> para commitar.
    </div>

    <!-- Concluir merge/revert -->
    <form v-else-if="status.operation" class="commit-box" @submit.prevent="continueOperation(repoId, opMessage)">
      <div class="lbl"><span>Mensagem do commit de {{ status.operation }}</span></div>
      <textarea v-model="opMessage" rows="4" />
      <button class="btn primary" :disabled="!!conflicted.length || state.busy">Concluir {{ status.operation }}</button>
      <button class="btn ghost" type="button" @click="abortOperation(repoId)">Abortar {{ status.operation }}</button>
    </form>

    <form v-else class="commit-box" @submit.prevent="commitStaged(repoId)" @keydown.ctrl.enter.prevent="commitStaged(repoId)">
      <div class="lbl">
        <span>Resumo</span>
        <span :class="{ over: draft.summary.length > 72 }">{{ draft.summary.length }}/72</span>
      </div>
      <input v-model="draft.summary" maxlength="200" placeholder="Ex.: feat: adiciona login com Google">
      <div class="lbl"><span>Descrição</span></div>
      <textarea v-model="draft.body" placeholder="Detalhes opcionais" />
      <label v-if="status.lastCommit" class="check small"><input v-model="amend" type="checkbox"> Emendar o último commit (amend)</label>
      <button class="btn primary" :disabled="!canCommit">
        <template v-if="amend">Emendar último commit</template>
        <template v-else>Commit {{ staged.length ? `de ${staged.length} arquivo${staged.length > 1 ? 's' : ''}` : '' }} em {{ status.branch ?? 'HEAD' }}</template>
      </button>
      <button v-if="status.lastCommit && !status.detached" class="link small" type="button" @click="undoLastCommit(repoId)">
        Desfazer o último commit ("{{ status.lastCommit.subject.slice(0, 40) }}")
      </button>
    </form>
  </template>
</template>
