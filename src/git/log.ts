// Hydra — © 2026 José Segura (GKsegura) · MIT
import { assertHash, FS, git, gitOrNull, RS } from './core.ts';

export type RefType = 'head' | 'local' | 'remote' | 'tag';

export interface Ref {
  type: RefType;
  name: string;
  /** Para 'local': é a branch em que o HEAD está. */
  current?: boolean;
}

export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  time: number;
  subject: string;
  refs: Ref[];
}

export async function listRefs(cwd: string): Promise<{ local: string[]; remote: string[]; tags: string[] }> {
  const out = (await gitOrNull(cwd, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags'])) ?? '';
  const local: string[] = [];
  const remote: string[] = [];
  const tags: string[] = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('refs/heads/')) local.push(line.slice(11));
    else if (line.startsWith('refs/remotes/')) {
      const name = line.slice(13);
      if (!name.endsWith('/HEAD')) remote.push(name);
    } else if (line.startsWith('refs/tags/')) tags.push(line.slice(10));
  }
  return { local, remote, tags };
}

/** Interpreta o %D de `git log --decorate=full` (nomes completos evitam ambiguidade local x remoto). */
function parseDecorations(raw: string): Ref[] {
  const refs: Ref[] = [];
  if (!raw.trim()) return refs;
  for (const part of raw.split(', ')) {
    if (part.startsWith('HEAD -> refs/heads/')) {
      refs.push({ type: 'local', name: part.slice(19), current: true });
    } else if (part === 'HEAD') {
      refs.push({ type: 'head', name: 'HEAD' });
    } else if (part.startsWith('tag: refs/tags/')) {
      refs.push({ type: 'tag', name: part.slice(15) });
    } else if (part.startsWith('refs/heads/')) {
      refs.push({ type: 'local', name: part.slice(11) });
    } else if (part.startsWith('refs/remotes/') && !part.endsWith('/HEAD')) {
      refs.push({ type: 'remote', name: part.slice(13) });
    }
  }
  return refs;
}

export async function getCommits(cwd: string, max: number): Promise<Commit[]> {
  const out = await gitOrNull(cwd, [
    'log', '--all', '--date-order', `-n${max}`, '--decorate=full',
    `--format=%H${FS}%P${FS}%an${FS}%ae${FS}%at${FS}%s${FS}%D${RS}`,
  ]);
  if (!out) return [];
  const commits: Commit[] = [];
  for (const rec of out.split(RS)) {
    const line = rec.replace(/^\n/, '');
    if (!line) continue;
    const [hash, parents, author, email, time, subject, deco] = line.split(FS);
    commits.push({
      hash,
      parents: parents ? parents.split(' ') : [],
      author,
      email,
      time: Number(time),
      subject,
      refs: parseDecorations(deco ?? ''),
    });
  }
  return commits;
}

export interface CommitDetail {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  time: number;
  committer: string;
  message: string;
  files: { status: string; path: string; orig?: string }[];
}

export async function getCommitDetail(cwd: string, hash: string): Promise<CommitDetail> {
  assertHash(hash);
  const out = await git(cwd, [
    'show', '--no-color', '--name-status', '--diff-merges=first-parent',
    `--format=%H${FS}%P${FS}%an${FS}%ae${FS}%at${FS}%cn${FS}%B${RS}`, hash,
  ]);
  const [head, rest = ''] = out.split(RS);
  const [h, parents, author, email, time, committer, message] = head.split(FS);
  const files = rest
    .split('\n')
    .filter((l) => l.includes('\t'))
    .map((l) => {
      const [status, a, b] = l.split('\t');
      return b ? { status: status[0], path: b, orig: a } : { status: status[0], path: a };
    });
  return {
    hash: h, parents: parents ? parents.split(' ') : [], author, email, time: Number(time), committer,
    message: message.trim(), files,
  };
}

export function getCommitFileDiff(cwd: string, hash: string, file: string): Promise<string> {
  assertHash(hash);
  return git(cwd, ['show', '--no-color', '--format=', '--diff-merges=first-parent', hash, '--', file]);
}
