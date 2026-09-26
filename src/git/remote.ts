// Hydra — © 2026 José Segura (GKsegura) · MIT
import { git, GitError, gitOrNull, gitStream, friendly, type Progress } from './core.ts';
import { currentBranch } from './branches.ts';

export interface Remote {
  name: string;
  url: string;
  /** "dono/repo" quando o remoto é do GitHub. */
  github: string | null;
}

export function parseGitHub(url: string): string | null {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(url.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}

export async function listRemotes(cwd: string): Promise<Remote[]> {
  const out = (await gitOrNull(cwd, ['remote', '-v'])) ?? '';
  const seen = new Map<string, Remote>();
  for (const line of out.split('\n')) {
    const m = /^(\S+)\s+(\S+)\s+\(fetch\)/.exec(line);
    if (m && !seen.has(m[1])) seen.set(m[1], { name: m[1], url: m[2], github: parseGitHub(m[2]) });
  }
  // origin primeiro: é o que o usuário espera como "o remoto".
  return [...seen.values()].sort((a, b) => (a.name === 'origin' ? -1 : b.name === 'origin' ? 1 : 0));
}

export async function defaultRemote(cwd: string): Promise<string> {
  const remotes = await listRemotes(cwd);
  if (!remotes.length) throw new GitError('Este repositório não tem remoto. Publique-o no GitHub ou adicione um remoto.', '', 'no_remote');
  return remotes[0].name;
}

async function run(cwd: string, args: string[], onProgress: (p: Progress) => void): Promise<string> {
  const r = await gitStream(cwd, args, onProgress);
  if (r.code !== 0) throw new GitError(friendly(r.stderr) || `git ${args[0]} falhou`, r.stderr);
  return r.stdout + r.stderr;
}

export async function fetchAll(cwd: string, onProgress: (p: Progress) => void): Promise<void> {
  await run(cwd, ['fetch', '--all', '--prune', '--progress'], onProgress);
}

/**
 * Pull da branch atual. Usa merge (não rebase), como o GitHub Desktop, a menos que o repo tenha
 * `pull.rebase` configurado. Conflitos deixam o repo em "merge em andamento".
 */
export async function pull(cwd: string, onProgress: (p: Progress) => void): Promise<{ conflicts: boolean }> {
  const configured = await gitOrNull(cwd, ['config', '--get', 'pull.rebase']);
  const args = [...(configured === null ? ['-c', 'pull.rebase=false'] : []), 'pull', '--progress'];
  const r = await gitStream(cwd, args, onProgress);
  if (r.code === 0) return { conflicts: false };
  const unmerged = ((await gitOrNull(cwd, ['diff', '--name-only', '--diff-filter=U'])) ?? '').trim();
  if (unmerged) return { conflicts: true };
  throw new GitError(friendly(r.stderr) || 'Pull falhou', r.stderr);
}

/** Push da branch atual. Sem upstream, publica a branch no remoto padrão (`--set-upstream`). */
export async function push(cwd: string, onProgress: (p: Progress) => void, opts: { tags?: boolean } = {}): Promise<{ published: boolean }> {
  const branch = await currentBranch(cwd);
  if (!branch) throw new GitError('HEAD destacado: troque para uma branch antes de dar push.');
  const upstream = await gitOrNull(cwd, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream) {
    await run(cwd, ['push', '--progress', ...(opts.tags ? ['--follow-tags'] : [])], onProgress);
    return { published: false };
  }
  const remote = await defaultRemote(cwd);
  await run(cwd, ['push', '--progress', '--set-upstream', remote, `${branch}:${branch}`], onProgress);
  return { published: true };
}

export async function addRemote(cwd: string, name: string, url: string): Promise<void> {
  await git(cwd, ['remote', 'add', name, url]);
}

/** Branch padrão do remoto (origin/HEAD → main/master), para montar a URL de Pull Request. */
export async function remoteDefaultBranch(cwd: string, remote = 'origin'): Promise<string | null> {
  const out = await gitOrNull(cwd, ['symbolic-ref', '--short', '-q', `refs/remotes/${remote}/HEAD`]);
  return out?.trim().slice(remote.length + 1) || null;
}
