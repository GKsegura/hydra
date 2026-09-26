<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { abortOperation, closeConflict, openConflict, resolveContent, resolveSide } from '../actions.ts';
import { repoById, state } from '../store.ts';
import type { Segment } from '../types.ts';

type Choice = 'ours' | 'theirs' | 'both' | 'both-rev' | null;
type ConflictSeg = Extract<Segment, { type: 'conflict' }>;

const CONTEXT = 3; // linhas iguais mostradas em volta de cada conflito

const conflict = computed(() => state.conflict);
const file = computed(() => conflict.value?.file ?? null);
const repoId = computed(() => conflict.value?.repoId ?? '');
const others = computed(() => state.operations[repoId.value]?.conflicts ?? []);

const choices = ref<Choice[]>([]);
const result = ref('');
const manual = ref(false); // o usuário editou o resultado à mão: as escolhas deixam de sobrescrever
const showBase = ref(false);
const saving = ref(false);
const current = ref(0);
const blockEls = ref<HTMLElement[]>([]);

const blocks = computed(() => (file.value?.segments ?? []).filter((s): s is ConflictSeg => s.type === 'conflict'));
const hasBase = computed(() => blocks.value.some((b) => b.base));
const resolvedCount = computed(() => choices.value.filter(Boolean).length);
const wholeFileOnly = computed(() => !!file.value && (file.value.binary || !file.value.segments.length));
const deletedSide = computed(() => {
  const k = file.value?.kind ?? '';
  return k[0] === 'D' ? 'current' : k[1] === 'D' ? 'incoming' : null;
});
const hasMarkers = computed(() => /^(<<<<<<<|>>>>>>>)/m.test(result.value));

function chosenLines(seg: ConflictSeg, c: Choice): string[] | null {
  if (c === 'ours') return seg.ours;
  if (c === 'theirs') return seg.theirs;
  if (c === 'both') return [...seg.ours, ...seg.theirs];
  if (c === 'both-rev') return [...seg.theirs, ...seg.ours];
  return null;
}

/** Monta o arquivo final: trechos comuns + a escolha de cada bloco (blocos sem escolha mantêm os marcadores). */
function build(): string {
  const f = file.value;
  if (!f) return '';
  const out: string[] = [];
  let i = 0;
  for (const seg of f.segments) {
    if (seg.type === 'text') out.push(...seg.lines);
    else {
      const lines = chosenLines(seg, choices.value[i++]);
      if (lines) out.push(...lines);
      else {
        out.push(`<<<<<<< ${seg.oursLabel}`, ...seg.ours);
        if (seg.base) out.push(`||||||| base`, ...seg.base);
        out.push('=======', ...seg.theirs, `>>>>>>> ${seg.theirsLabel}`);
      }
    }
  }
  return out.join(f.eol) + f.eol;
}

watch(
  () => file.value,
  (f) => {
    if (!f) return;
    choices.value = blocks.value.map(() => null);
    manual.value = false;
    current.value = 0;
    result.value = build();
  },
  { immediate: true },
);

function choose(i: number, c: Choice) {
  choices.value[i] = choices.value[i] === c ? null : c;
  if (!manual.value) result.value = build();
  // Pula para o próximo bloco ainda sem escolha.
  const next = choices.value.findIndex((x, j) => j > i && !x);
  if (next !== -1) goTo(next);
}

function chooseAll(c: Choice) {
  choices.value = blocks.value.map(() => c);
  manual.value = false;
  result.value = build();
}

function rebuild() {
  manual.value = false;
  result.value = build();
}

async function goTo(i: number) {
  current.value = Math.max(0, Math.min(blocks.value.length - 1, i));
  await nextTick();
  blockEls.value[current.value]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/** Trechos comuns longos viram "… N linhas iguais …" — mostra só o contexto perto dos conflitos. */
function textView(lines: string[], first: boolean, last: boolean) {
  if (lines.length <= CONTEXT * 2 + 1) return { head: lines, hidden: 0, tail: [] as string[] };
  const head = first ? [] : lines.slice(0, CONTEXT);
  const tail = last ? [] : lines.slice(-CONTEXT);
  return { head, hidden: lines.length - head.length - tail.length, tail };
}

async function save() {
  if (!file.value || hasMarkers.value) return;
  saving.value = true;
  // O <textarea> sempre usa \n; devolve a quebra de linha original do arquivo (CRLF no Windows).
  const content = file.value.eol === '\r\n' ? result.value.replace(/\r?\n/g, '\r\n') : result.value;
  await resolveContent(repoId.value, file.value.path, content);
  saving.value = false;
}

async function whole(side: 'ours' | 'theirs' | 'delete') {
  if (!file.value) return;
  saving.value = true;
  await resolveSide(repoId.value, file.value.path, side);
  saving.value = false;
}

/** Segmentos prontos para exibir: trechos comuns já recortados e cada conflito com seu índice. */
const items = computed(() => {
  const segs = file.value?.segments ?? [];
  let bi = 0;
  return segs.map((seg, si) =>
    seg.type === 'text'
      ? { kind: 'text' as const, key: `t${si}`, view: textView(seg.lines, si === 0, si === segs.length - 1) }
      : { kind: 'conflict' as const, key: `c${si}`, seg, bi: bi++ },
  );
});
</script>

<template>
  <div v-if="file" class="resolver">
    <header class="resolver-head">
      <div class="resolver-title">
        <span class="op-chip">Conflito</span>
        <code>{{ file.path }}</code>
        <span class="faint">em {{ repoById(repoId)?.name }}</span>
      </div>
      <div class="resolver-nav">
        <template v-if="!wholeFileOnly && blocks.length">
          <button class="btn sm ghost" :disabled="current === 0" title="Conflito anterior" @click="goTo(current - 1)">↑</button>
          <span>{{ current + 1 }} de {{ blocks.length }}</span>
          <button class="btn sm ghost" :disabled="current >= blocks.length - 1" title="Próximo conflito" @click="goTo(current + 1)">↓</button>
          <span class="faint">· {{ resolvedCount }}/{{ blocks.length }} escolhidos</span>
        </template>
        <button class="btn ghost" title="Fechar (o merge continua em andamento)" @click="closeConflict">✕</button>
      </div>
    </header>

    <div v-if="others.length > 1" class="resolver-files">
      <span class="faint">Arquivos em conflito:</span>
      <button v-for="o in others" :key="o.path" class="file-chip" :class="{ active: o.path === file.path }" @click="openConflict(repoId, o.path)">{{ o.path }}</button>
    </div>

    <!-- Binário ou um dos lados apagou o arquivo: escolhe o arquivo inteiro -->
    <div v-if="wholeFileOnly" class="resolver-whole">
      <p v-if="deletedSide === 'current'">O arquivo foi <b>apagado em {{ file.current }}</b> e <b>alterado em {{ file.incoming }}</b>.</p>
      <p v-else-if="deletedSide === 'incoming'">O arquivo foi <b>alterado em {{ file.current }}</b> e <b>apagado em {{ file.incoming }}</b>.</p>
      <p v-else-if="file.binary">Arquivo binário: não dá para juntar linha a linha. Escolha qual versão manter.</p>
      <p v-else>Escolha qual versão manter.</p>
      <div class="whole-actions">
        <button class="btn primary" :disabled="saving" @click="whole('ours')">{{ deletedSide === 'current' ? 'Manter apagado' : `Usar a versão de ${file.current}` }}</button>
        <button class="btn primary" :disabled="saving" @click="whole('theirs')">{{ deletedSide === 'incoming' ? 'Aceitar apagar' : `Usar a versão de ${file.incoming}` }}</button>
        <button class="btn danger" :disabled="saving" @click="whole('delete')">Excluir o arquivo</button>
      </div>
    </div>

    <template v-else>
      <div class="resolver-toolbar">
        <span class="faint">Para todos os blocos:</span>
        <button class="btn sm" @click="chooseAll('ours')">Tudo de {{ file.current }}</button>
        <button class="btn sm" @click="chooseAll('theirs')">Tudo de {{ file.incoming }}</button>
        <label v-if="hasBase" class="check"><input v-model="showBase" type="checkbox"> Mostrar base (ancestral comum)</label>
      </div>

      <div class="resolver-blocks">
        <template v-for="item in items" :key="item.key">
          <div v-if="item.kind === 'text'" class="ctx-lines">
            <pre v-if="item.view.head.length">{{ item.view.head.join('\n') }}</pre>
            <div v-if="item.view.hidden" class="ctx-fold">… {{ item.view.hidden }} linha(s) sem conflito …</div>
            <pre v-if="item.view.tail.length">{{ item.view.tail.join('\n') }}</pre>
          </div>
          <template v-else>
            <template v-for="{ seg, bi } in [item]" :key="item.key">
              <div :ref="(el) => { if (el) blockEls[bi] = el as HTMLElement; }" class="conflict-block" :class="{ current: current === bi, done: !!choices[bi] }" @click="current = bi">
                <div class="conflict-cols" :class="{ three: showBase && seg.base }">
                  <div class="side ours" :class="{ picked: choices[bi] === 'ours' || choices[bi]?.startsWith('both') }">
                    <div class="side-head">Atual · <b>{{ file.current }}</b></div>
                    <pre>{{ seg.ours.join('\n') || '(vazio)' }}</pre>
                  </div>
                  <div v-if="showBase && seg.base" class="side base">
                    <div class="side-head">Base</div>
                    <pre>{{ seg.base.join('\n') || '(vazio)' }}</pre>
                  </div>
                  <div class="side theirs" :class="{ picked: choices[bi] === 'theirs' || choices[bi]?.startsWith('both') }">
                    <div class="side-head">Entrando · <b>{{ file.incoming }}</b></div>
                    <pre>{{ seg.theirs.join('\n') || '(vazio)' }}</pre>
                  </div>
                </div>
                <div class="conflict-actions">
                  <button class="btn sm" :class="{ primary: choices[bi] === 'ours' }" @click.stop="choose(bi, 'ours')">Aceitar atual</button>
                  <button class="btn sm" :class="{ primary: choices[bi] === 'theirs' }" @click.stop="choose(bi, 'theirs')">Aceitar entrando</button>
                  <button class="btn sm" :class="{ primary: choices[bi] === 'both' }" @click.stop="choose(bi, 'both')">Ambos (atual primeiro)</button>
                  <button class="btn sm" :class="{ primary: choices[bi] === 'both-rev' }" @click.stop="choose(bi, 'both-rev')">Ambos (entrando primeiro)</button>
                  <span v-if="choices[bi]" class="ok">✓ escolhido</span>
                </div>
              </div>
            </template>
          </template>
        </template>
      </div>

      <div class="resolver-result">
        <div class="result-head">
          <b>Resultado</b>
          <span class="faint">edite à mão se precisar</span>
          <span class="spacer" />
          <span v-if="manual" class="warn">editado manualmente</span>
          <button v-if="manual" class="btn sm ghost" @click="rebuild">Refazer a partir das escolhas</button>
        </div>
        <textarea v-model="result" spellcheck="false" @input="manual = true" />
      </div>
    </template>

    <footer class="resolver-foot">
      <button class="btn ghost" @click="abortOperation(repoId)">Abortar {{ state.operations[repoId]?.operation ?? 'merge' }}</button>
      <span class="spacer" />
      <span v-if="!wholeFileOnly && hasMarkers" class="warn">Ainda há marcadores de conflito no resultado</span>
      <button v-if="!wholeFileOnly" class="btn primary" :disabled="hasMarkers || saving" @click="save">Salvar e marcar como resolvido</button>
    </footer>
  </div>
</template>
