// Hydra — © 2026 José Segura (GKsegura) · MIT
// Stage parcial: colocar (ou tirar) do stage só alguns trechos/linhas de um arquivo, como no GitHub Desktop.
// Monta um patch só com as linhas escolhidas a partir do diff atual e aplica no índice com `git apply --cached`.
import { GitError, gitRaw } from './core.ts';
import { getWorkingDiff } from './diff.ts';
import type { FileChange } from './status.ts';

export interface PatchLine {
  /** ' ' contexto, '+' adicionada, '-' removida, '\\' "No newline at end of file". */
  type: ' ' | '+' | '-' | '\\';
  text: string;
  /** Posição da linha no texto do diff (o mesmo índice que a interface usa para marcar a seleção). */
  index: number;
}

export interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  /** O que vem depois do segundo @@ (ex.: nome da função). */
  section: string;
  /** Índice da linha "@@ … @@" no texto do diff. */
  index: number;
  lines: PatchLine[];
}

export interface ParsedPatch {
  /** Linhas antes do primeiro hunk (diff --git, index, ---, +++). */
  header: string[];
  hunks: Hunk[];
}

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/** Quebra a saída do `git diff` de um arquivo em cabeçalho e hunks, guardando o índice de cada linha. */
export function parsePatch(diff: string): ParsedPatch {
  const header: string[] = [];
  const hunks: Hunk[] = [];
  const lines = diff.split('\n');
  // O diff termina com "\n": a última "linha" vazia não faz parte do patch.
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.forEach((text, index) => {
    const m = HUNK.exec(text);
    if (m) {
      hunks.push({
        oldStart: Number(m[1]), oldCount: m[2] === undefined ? 1 : Number(m[2]),
        newStart: Number(m[3]), newCount: m[4] === undefined ? 1 : Number(m[4]),
        section: m[5], index, lines: [],
      });
      return;
    }
    const hunk = hunks[hunks.length - 1];
    if (!hunk) return void header.push(text);
    const type = text[0];
    if (type === '+' || type === '-' || type === ' ' || type === '\\') hunk.lines.push({ type, text: text.slice(1), index });
    else if (text === '') hunk.lines.push({ type: ' ', text: '', index }); // linha de contexto vazia sem o espaço
  });
  return { header, hunks };
}

/**
 * Monta o patch só com as linhas alteradas escolhidas (`selected` = índices no texto do diff).
 *
 * - `stage` (diff da árvore de trabalho, aplicado no índice): "+" não escolhida sai do patch; "-" não escolhida vira
 *   contexto (a linha continua existindo no índice).
 * - `unstage` (diff do stage, aplicado ao contrário): "+" não escolhida vira contexto (continua no índice);
 *   "-" não escolhida sai do patch (continua fora do índice).
 *
 * Devolve `null` se nenhuma linha alterada foi escolhida.
 */
export function buildPartialPatch(diff: string, selected: Set<number>, mode: 'stage' | 'unstage'): string | null {
  const { header, hunks } = parsePatch(diff);
  const out: string[] = [];
  let delta = 0; // quanto o lado novo já andou em relação ao antigo, nos hunks anteriores deste patch
  for (const hunk of hunks) {
    const body: string[] = [];
    let oldCount = 0;
    let newCount = 0;
    let changed = false;
    let lastKept = false;
    for (const line of hunk.lines) {
      if (line.type === '\\') {
        if (lastKept) body.push(`\\${line.text}`);
        continue;
      }
      const chosen = selected.has(line.index);
      let as: ' ' | '+' | '-' | null;
      if (line.type === ' ') as = ' ';
      else if (chosen) as = line.type;
      else if (line.type === '+') as = mode === 'stage' ? null : ' ';
      else as = mode === 'stage' ? ' ' : null;
      lastKept = as !== null;
      if (as === null) continue;
      body.push(`${as}${line.text}`);
      if (as !== '+') oldCount++;
      if (as !== '-') newCount++;
      if (as !== ' ') changed = true;
    }
    if (!changed) continue;
    const newStart = hunk.oldStart + delta;
    out.push(`@@ -${hunk.oldStart},${oldCount} +${newStart},${newCount} @@${hunk.section}`, ...body);
    delta += newCount - oldCount;
  }
  if (!out.length) return null;
  return `${[...header, ...out].join('\n')}\n`;
}

/** Arquivos que só dá pra colocar no stage inteiros (o diff não é um patch aplicável linha a linha). */
export function partialUnsupported(change: FileChange, staged: boolean): string | null {
  if (change.conflict) return 'Arquivo em conflito: resolva o conflito antes.';
  if (!staged && change.work === '?') return 'Arquivo novo: coloque no stage inteiro (ainda não existe no índice).';
  if (change.orig) return 'Arquivo renomeado: coloque no stage inteiro.';
  return null;
}

/**
 * Coloca no stage (ou tira dele, com `staged`) só as linhas escolhidas de um arquivo.
 * `expected` é o diff que a interface mostrou: se o arquivo mudou desde então, recusa em vez de aplicar linhas erradas.
 */
export async function applyPartial(
  cwd: string, change: FileChange, lines: number[], opts: { staged: boolean; expected?: string },
): Promise<void> {
  const unsupported = partialUnsupported(change, opts.staged);
  if (unsupported) throw new GitError(unsupported);
  const diff = await getWorkingDiff(cwd, change, opts.staged);
  if (opts.expected !== undefined && opts.expected !== diff) {
    throw new GitError('O arquivo mudou desde que o diff foi aberto. O diff foi recarregado: escolha as linhas de novo.', '', 'diff_changed');
  }
  if (/^Binary files /m.test(diff)) throw new GitError('Arquivo binário: coloque no stage inteiro.');
  const patch = buildPartialPatch(diff, new Set(lines), opts.staged ? 'unstage' : 'stage');
  if (!patch) throw new GitError('Nenhuma linha alterada foi escolhida.');
  const args = ['apply', '--cached', '--recount', '--whitespace=nowarn', ...(opts.staged ? ['--reverse'] : []), '-'];
  const r = await gitRaw(cwd, args, patch);
  if (r.code !== 0) throw new GitError(`Não foi possível aplicar as linhas escolhidas: ${r.stderr.trim() || 'git apply falhou'}`, r.stderr);
}
