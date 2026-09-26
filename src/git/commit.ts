// Hydra — © 2026 José Segura (GKsegura) · MIT
import { rmSync } from 'node:fs';
import path from 'node:path';
import { assertHash, git, GitError, gitOrNull, gitRaw } from './core.ts';
import type { FileChange } from './status.ts';

export async function stage(cwd: string, files: string[] | 'all'): Promise<void> {
  if (files === 'all') await git(cwd, ['add', '-A']);
  else if (files.length) await git(cwd, ['add', '-A', '--', ...files]);
}

export async function unstage(cwd: string, files: string[] | 'all', initial: boolean): Promise<void> {
  const paths = files === 'all' ? ['.'] : files;
  if (!paths.length) return;
  // Sem nenhum commit ainda não existe HEAD para restaurar: tiramos do índice.
  if (initial) await git(cwd, ['rm', '--cached', '-r', '-q', '--', ...paths]);
  else await git(cwd, ['restore', '--staged', '--', ...paths]);
}

export function buildMessage(summary: string, body: string): string {
  return body.trim() ? `${summary.trim()}\n\n${body.trim()}\n` : `${summary.trim()}\n`;
}

/** Commit do que está em stage. Com `amend`, reescreve o último commit (mensagem e/ou conteúdo). */
export async function commit(cwd: string, summary: string, body: string, amend = false): Promise<string> {
  await git(cwd, ['commit', ...(amend ? ['--amend'] : []), '-F', '-'], buildMessage(summary, body));
  return (await git(cwd, ['rev-parse', 'HEAD'])).trim();
}

export async function lastCommitMessage(cwd: string): Promise<{ summary: string; body: string } | null> {
  const out = await gitOrNull(cwd, ['log', '-1', '--format=%B']);
  if (out === null) return null;
  const [summary, ...rest] = out.trim().split('\n');
  return { summary, body: rest.join('\n').trim() };
}

/**
 * Desfaz o último commit mantendo as alterações em stage (como o GitHub Desktop).
 * Recusa se o commit já foi enviado para o upstream. Devolve a mensagem, para reaproveitar.
 */
export async function undoLastCommit(cwd: string): Promise<{ summary: string; body: string }> {
  const msg = await lastCommitMessage(cwd);
  if (!msg) throw new GitError('Não há commit para desfazer.');
  const upstream = await gitOrNull(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream && (await gitRaw(cwd, ['merge-base', '--is-ancestor', 'HEAD', '@{u}'])).code === 0) {
    throw new GitError('Esse commit já está no remoto. Para não reescrever o histórico publicado, use "Reverter" em vez de desfazer.');
  }
  const hasParent = (await gitRaw(cwd, ['rev-parse', '--verify', '-q', 'HEAD~1'])).code === 0;
  if (hasParent) await git(cwd, ['reset', '--soft', 'HEAD~1']);
  else await git(cwd, ['update-ref', '-d', 'HEAD']); // primeiro commit do repo: volta ao estado "sem commits"
  return msg;
}

/** Cria um commit que desfaz o commit indicado. Pode parar em conflito (estado "revert"). */
export async function revertCommit(cwd: string, hash: string): Promise<{ conflicts: boolean }> {
  assertHash(hash);
  const parents = (await git(cwd, ['rev-list', '--parents', '-n', '1', hash])).trim().split(' ').length - 1;
  const r = await gitRaw(cwd, ['revert', '--no-edit', ...(parents > 1 ? ['-m', '1'] : []), hash]);
  if (r.code === 0) return { conflicts: false };
  if ((await gitRaw(cwd, ['rev-parse', '-q', '--verify', 'REVERT_HEAD'])).code === 0) return { conflicts: true };
  throw new GitError(r.stderr.trim() || 'Não foi possível reverter o commit.');
}

/** Aplica um commit de outra branch na atual. Pode parar em conflito (estado "cherry-pick"). */
export async function cherryPick(cwd: string, hash: string): Promise<{ conflicts: boolean }> {
  assertHash(hash);
  const r = await gitRaw(cwd, ['cherry-pick', hash]);
  if (r.code === 0) return { conflicts: false };
  if ((await gitRaw(cwd, ['rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD'])).code === 0) return { conflicts: true };
  throw new GitError(r.stderr.trim() || 'Não foi possível aplicar o commit.');
}

/**
 * Descarta alterações de arquivos da área de trabalho.
 * `trash` (app desktop) manda o arquivo para a Lixeira antes — dá pra recuperar, como no GitHub Desktop.
 * Sem `trash` (CLI), a alteração é perdida; a interface pede confirmação.
 */
export async function discard(cwd: string, files: FileChange[], initial: boolean, trash?: (file: string) => Promise<void>): Promise<void> {
  const remove = async (rel: string) => {
    const full = path.join(cwd, rel);
    if (trash) await trash(full).catch(() => rmSync(full, { force: true, recursive: true }));
    else rmSync(full, { force: true, recursive: true });
  };

  for (const f of files) {
    if (f.index === 'U') throw new GitError(`"${f.path}" está em conflito. Resolva ou aborte a operação.`);
    const isNew = f.work === '?' || f.index === 'A' || initial;
    if (f.work === '?') {
      await remove(f.path);
    } else if (isNew || f.index === 'R' || f.index === 'C') {
      // Arquivo que não existe no HEAD: tira do índice e apaga; numa renomeação, o original volta.
      await git(cwd, ['rm', '--cached', '-f', '-q', '--', f.path]);
      await remove(f.path);
      if (f.orig && !initial) await git(cwd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', f.orig]);
    } else {
      if (trash && f.work !== 'D') await trash(path.join(cwd, f.path)).catch(() => undefined);
      await git(cwd, ['restore', '--source=HEAD', '--staged', '--worktree', '--', f.path]);
    }
  }
}
