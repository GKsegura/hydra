// Hydra — © 2026 José Segura (GKsegura) · MIT
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { git, GitError, gitOrNull, gitPath, gitRaw } from './core.ts';
import { currentBranch } from './branches.ts';
import { getStatus, type Operation } from './status.ts';

export interface MergePreview {
  /** Commits que entrariam na branch atual. */
  commits: number;
  fastForward: boolean;
  upToDate: boolean;
  /** Arquivos que vão entrar em conflito (previsão via `git merge-tree`). */
  conflicts: string[];
}

/**
 * Prevê o resultado do merge sem tocar na área de trabalho, como o GitHub Desktop faz.
 * `base` é o que recebe o merge (padrão: a branch atual, `HEAD`); com outra ref, dá para perguntar
 * "o que aconteceria se `develop` recebesse `feature/x`?" sem fazer checkout de `develop`.
 */
export async function previewMerge(cwd: string, branch: string, base = 'HEAD'): Promise<MergePreview> {
  await assertBranchExists(cwd, branch);
  if (base !== 'HEAD') await assertBranchExists(cwd, base);
  const commits = Number((await git(cwd, ['rev-list', '--count', `${base}..${branch}`])).trim());
  const fastForward = (await gitRaw(cwd, ['merge-base', '--is-ancestor', base, branch])).code === 0;
  let conflicts: string[] = [];
  if (commits > 0 && !fastForward) {
    const r = await gitRaw(cwd, ['merge-tree', '--write-tree', '--name-only', '--no-messages', base, branch]);
    // Saída: <tree>\n<arquivo em conflito>… — código 1 quando há conflitos.
    if (r.code === 1) conflicts = r.stdout.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
  }
  return { commits, fastForward, upToDate: commits === 0, conflicts: [...new Set(conflicts)] };
}

export async function assertBranchExists(cwd: string, branch: string) {
  if (branch.startsWith('-') || (await gitRaw(cwd, ['rev-parse', '--verify', '-q', `${branch}^{commit}`])).code !== 0) {
    throw new GitError(`Branch "${branch}" não encontrada.`);
  }
}

export type MergeResult = { status: 'merged' | 'fast-forward' | 'up-to-date' } | { status: 'conflicts'; conflicts: number };

/** Faz merge de `branch` na branch atual. Conflitos deixam o repo em "merge em andamento". */
export async function mergeBranch(cwd: string, branch: string, opts: { noFastForward?: boolean } = {}): Promise<MergeResult> {
  await assertBranchExists(cwd, branch);
  const preview = await previewMerge(cwd, branch);
  if (preview.upToDate) return { status: 'up-to-date' };
  const r = await gitRaw(cwd, ['merge', '--no-edit', ...(opts.noFastForward ? ['--no-ff'] : []), branch]);
  if (r.code === 0) return { status: preview.fastForward && !opts.noFastForward ? 'fast-forward' : 'merged' };
  const st = await getStatus(cwd);
  if (st.operation === 'merge' && st.conflicted > 0) return { status: 'conflicts', conflicts: st.conflicted };
  throw new GitError(r.stderr.trim() || 'O merge falhou.');
}

export async function abortOperation(cwd: string, op: Operation): Promise<void> {
  if (op === 'rebase') await git(cwd, ['rebase', '--abort']);
  else await git(cwd, [op, '--abort']);
}

/** Mensagem que o git preparou para o commit de merge/revert (MERGE_MSG), sem as linhas de comentário. */
export async function pendingMessage(cwd: string): Promise<string> {
  const file = path.resolve(cwd, await gitPath(cwd, 'MERGE_MSG'));
  if (!existsSync(file)) return '';
  return readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('#')).join('\n').trim();
}

/** Nome legível do que está entrando (a branch do merge), para rotular "Entrando (feature)". */
export async function incomingLabel(cwd: string): Promise<string> {
  const msg = await pendingMessage(cwd);
  const m = /Merge (?:remote-tracking )?branch '([^']+)'/.exec(msg);
  if (m) return m[1];
  const head = await gitOrNull(cwd, ['name-rev', '--name-only', '--no-undefined', 'MERGE_HEAD']);
  return head?.trim() || 'entrando';
}

/** Conclui merge/revert/cherry-pick depois que todos os conflitos foram resolvidos. */
export async function continueOperation(cwd: string, op: Operation, message: string): Promise<string> {
  const st = await getStatus(cwd);
  if (st.conflicted > 0) throw new GitError(`Ainda há ${st.conflicted} arquivo(s) em conflito.`);
  if (op === 'rebase') throw new GitError('Rebase em andamento: conclua pelo terminal (git rebase --continue).');
  if (op === 'merge') {
    if (message.trim()) await git(cwd, ['commit', '-F', '-'], `${message.trim()}\n`);
    else await git(cwd, ['commit', '--no-edit']); // usa a mensagem que o git preparou (MERGE_MSG)
  }
  else await git(cwd, ['-c', 'core.editor=true', op, '--continue']);
  return (await git(cwd, ['rev-parse', 'HEAD'])).trim();
}

// ---------------------------------------------------------------- conflitos

export type Segment =
  | { type: 'text'; lines: string[] }
  | { type: 'conflict'; ours: string[]; base: string[] | null; theirs: string[]; oursLabel: string; theirsLabel: string };

export interface ConflictFile {
  path: string;
  /** Par XY do git: UU (os dois mudaram), AA (os dois criaram), UD/DU (um lado apagou)… */
  kind: string;
  binary: boolean;
  eol: '\n' | '\r\n';
  segments: Segment[];
  /** Nomes para os botões: "main" (atual) e a branch que está entrando. */
  current: string;
  incoming: string;
}

/** Quebra o arquivo com marcadores <<<<<<< ||||||| ======= >>>>>>> em trechos comuns e blocos em conflito. */
export function parseConflicts(content: string): Segment[] {
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  const segments: Segment[] = [];
  let text: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('<<<<<<<')) {
      text.push(line);
      i++;
      continue;
    }
    // Procura o fim do bloco; se o arquivo estiver malformado, trata como texto comum.
    const end = lines.findIndex((l, j) => j > i && l.startsWith('>>>>>>>'));
    const sep = lines.findIndex((l, j) => j > i && j < end && l.startsWith('======='));
    if (end === -1 || sep === -1) {
      text.push(line);
      i++;
      continue;
    }
    const baseAt = lines.findIndex((l, j) => j > i && j < sep && l.startsWith('|||||||'));
    if (text.length) segments.push({ type: 'text', lines: text });
    text = [];
    segments.push({
      type: 'conflict',
      ours: lines.slice(i + 1, baseAt === -1 ? sep : baseAt),
      base: baseAt === -1 ? null : lines.slice(baseAt + 1, sep),
      theirs: lines.slice(sep + 1, end),
      oursLabel: line.slice(7).trim(),
      theirsLabel: lines[end].slice(7).trim(),
    });
    i = end + 1;
  }
  if (text.length) segments.push({ type: 'text', lines: text });
  return segments;
}

async function conflictKind(cwd: string, file: string): Promise<string | null> {
  const st = await getStatus(cwd);
  return st.files.find((f) => f.path === file && f.index === 'U')?.conflict ?? null;
}

export async function readConflict(cwd: string, file: string): Promise<ConflictFile> {
  const kind = await conflictKind(cwd, file);
  if (!kind) throw new GitError(`"${file}" não está em conflito.`);
  const full = path.join(cwd, file);
  const exists = existsSync(full);
  const buf = exists ? readFileSync(full) : Buffer.alloc(0);
  const binary = buf.includes(0);
  const content = binary ? '' : buf.toString('utf8');
  const current = (await currentBranch(cwd)) ?? 'HEAD';
  return {
    path: file,
    kind,
    binary,
    eol: content.includes('\r\n') ? '\r\n' : '\n',
    segments: binary || !exists ? [] : parseConflicts(content),
    current,
    incoming: await incomingLabel(cwd),
  };
}

/** Grava o conteúdo final escolhido na interface e marca o arquivo como resolvido. */
export async function resolveWithContent(cwd: string, file: string, content: string): Promise<void> {
  if (!(await conflictKind(cwd, file))) throw new GitError(`"${file}" não está em conflito.`);
  if (/^(<<<<<<<|>>>>>>>)/m.test(content)) throw new GitError('Ainda há marcadores de conflito (<<<<<<< / >>>>>>>) no resultado.');
  writeFileSync(path.join(cwd, file), content);
  await git(cwd, ['add', '--', file]);
}

/** Resolve o arquivo inteiro escolhendo um lado — útil para binários e quando um lado apagou o arquivo. */
export async function resolveWhole(cwd: string, file: string, side: 'ours' | 'theirs' | 'delete'): Promise<void> {
  const kind = await conflictKind(cwd, file);
  if (!kind) throw new GitError(`"${file}" não está em conflito.`);
  // No XY, o primeiro caractere é o nosso lado e o segundo o deles; D = aquele lado apagou.
  const sideDeleted = side === 'ours' ? kind[0] === 'D' : side === 'theirs' ? kind[1] === 'D' : true;
  if (side === 'delete' || sideDeleted) {
    await git(cwd, ['rm', '-f', '-q', '--', file]);
    return;
  }
  await git(cwd, ['checkout', `--${side}`, '--', file]);
  await git(cwd, ['add', '--', file]);
}
