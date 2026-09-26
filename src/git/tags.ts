// Hydra — © 2026 José Segura (GKsegura) · MIT
import { assertHash, assertRefName, git, GitError, gitRaw } from './core.ts';

export async function createTag(cwd: string, name: string, opts: { at?: string; message?: string } = {}): Promise<void> {
  await assertRefName(cwd, name, 'tag');
  if (opts.at) assertHash(opts.at);
  if ((await gitRaw(cwd, ['show-ref', '--verify', '-q', `refs/tags/${name}`])).code === 0) throw new GitError(`A tag "${name}" já existe.`);
  const at = opts.at ? [opts.at] : [];
  if (opts.message?.trim()) await git(cwd, ['tag', '-a', name, '-F', '-', ...at], `${opts.message.trim()}\n`);
  else await git(cwd, ['tag', name, ...at]);
}

export async function pushTag(cwd: string, name: string, remote: string): Promise<void> {
  await assertRefName(cwd, name, 'tag');
  await git(cwd, ['push', remote, `refs/tags/${name}`]);
}

export async function deleteTag(cwd: string, name: string, opts: { local: boolean; remote?: string }): Promise<void> {
  await assertRefName(cwd, name, 'tag');
  if (opts.remote) {
    const r = await gitRaw(cwd, ['push', opts.remote, '--delete', `refs/tags/${name}`]);
    if (r.code !== 0 && !/remote ref does not exist/i.test(r.stderr)) throw new GitError(r.stderr.trim());
  }
  if (opts.local) await git(cwd, ['tag', '-d', name]);
}
