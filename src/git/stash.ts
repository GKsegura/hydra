// Hydra — © 2026 José Segura (GKsegura) · MIT
import { FS, git, GitError, gitOrNull, gitRaw } from './core.ts';

export interface Stash {
  index: number;
  ref: string;
  hash: string;
  time: number;
  /** Mensagem como o git mostra ("On main: minha mensagem" / "WIP on main: …"). */
  message: string;
  /** Branch onde o stash foi criado. */
  branch: string | null;
  files: number;
}

export async function listStashes(cwd: string): Promise<Stash[]> {
  const out = await gitOrNull(cwd, ['stash', 'list', `--format=%gd${FS}%H${FS}%ct${FS}%gs`]);
  if (!out) return [];
  const list: Stash[] = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [ref, hash, time, message] = line.split(FS);
    const index = Number(/\{(\d+)\}/.exec(ref)?.[1] ?? 0);
    const branch = /^(?:WIP on|On) ([^:]+):/.exec(message)?.[1] ?? null;
    // Arquivos: rastreados (diff contra o pai) + untracked (terceiro pai, quando existe).
    const tracked = (await gitOrNull(cwd, ['diff', '--name-only', `${hash}^1`, hash])) ?? '';
    const untracked = (await gitOrNull(cwd, ['ls-tree', '-r', '--name-only', `${hash}^3`])) ?? '';
    const files = new Set([...tracked.split('\n'), ...untracked.split('\n')].filter(Boolean)).size;
    list.push({ index, ref, hash, time: Number(time), message: message.replace(/^(?:WIP on|On) [^:]+: /, ''), branch, files });
  }
  return list;
}

function refOf(index: number) {
  if (!Number.isInteger(index) || index < 0) throw new GitError('Stash inválido');
  return `stash@{${index}}`;
}

export async function stashPush(cwd: string, message: string): Promise<void> {
  const dirty = (await git(cwd, ['status', '--porcelain'])).trim();
  if (!dirty) throw new GitError('Não há alterações para guardar.');
  await git(cwd, ['stash', 'push', '--include-untracked', ...(message.trim() ? ['-m', message.trim()] : [])]);
}

/** Aplica (e, com `pop`, remove) um stash. Conflitos deixam arquivos em conflito na área de trabalho. */
export async function stashApply(cwd: string, index: number, pop: boolean): Promise<{ conflicts: boolean }> {
  const r = await gitRaw(cwd, ['stash', pop ? 'pop' : 'apply', '--index', refOf(index)]);
  if (r.code === 0) return { conflicts: false };
  const unmerged = ((await gitOrNull(cwd, ['diff', '--name-only', '--diff-filter=U'])) ?? '').trim();
  if (unmerged) return { conflicts: true };
  // --index falha quando o índice não bate; tenta de novo sem ele antes de desistir.
  const retry = await gitRaw(cwd, ['stash', pop ? 'pop' : 'apply', refOf(index)]);
  if (retry.code === 0) return { conflicts: false };
  throw new GitError(retry.stderr.trim() || 'Não foi possível aplicar o stash. Faça commit ou guarde as alterações atuais antes.');
}

export async function stashDrop(cwd: string, index: number): Promise<void> {
  await git(cwd, ['stash', 'drop', refOf(index)]);
}
