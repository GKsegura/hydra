// Hydra — © 2026 José Segura (GKsegura) · MIT
import { existsSync } from 'node:fs';
import path from 'node:path';
import { FS, git, gitOrNull, gitPath } from './core.ts';

export interface FileChange {
  path: string;
  /** Caminho antigo, em renomeações/cópias. */
  orig?: string;
  /** Status no índice (staged): M, A, D, R, C, U ou '.' */
  index: string;
  /** Status na árvore de trabalho: M, D, U, '?' (untracked) ou '.' */
  work: string;
  /** Em conflito: o par XY do git (UU, AA, DU, UD, AU, UA, DD). */
  conflict?: string;
}

/** Operação em andamento que pode deixar conflitos para resolver. */
export type Operation = 'merge' | 'revert' | 'cherry-pick' | 'rebase';

export interface RepoStatus {
  branch: string | null;
  detached: boolean;
  initial: boolean;
  upstream: string | null;
  /** O upstream foi apagado no remoto ([gone]). */
  upstreamGone: boolean;
  ahead: number;
  behind: number;
  files: FileChange[];
  staged: number;
  unstaged: number;
  untracked: number;
  conflicted: number;
  lastTag: string | null;
  lastCommit: { hash: string; subject: string; time: number } | null;
  operation: Operation | null;
  stashes: number;
  remotes: string[];
}

async function currentOperation(cwd: string): Promise<Operation | null> {
  const checks: [Operation, string][] = [
    ['merge', 'MERGE_HEAD'], ['revert', 'REVERT_HEAD'], ['cherry-pick', 'CHERRY_PICK_HEAD'], ['rebase', 'rebase-merge'], ['rebase', 'rebase-apply'],
  ];
  for (const [op, name] of checks) {
    if (existsSync(path.resolve(cwd, await gitPath(cwd, name)))) return op;
  }
  return null;
}

export async function getStatus(cwd: string): Promise<RepoStatus> {
  const out = await git(cwd, ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
  const tokens = out.split('\0');
  const st: RepoStatus = {
    branch: null, detached: false, initial: false, upstream: null, upstreamGone: false, ahead: 0, behind: 0,
    files: [], staged: 0, unstaged: 0, untracked: 0, conflicted: 0, lastTag: null, lastCommit: null,
    operation: null, stashes: 0, remotes: [],
  };

  let sawAb = false;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t) continue;
    if (t.startsWith('# ')) {
      const [key, ...rest] = t.slice(2).split(' ');
      const val = rest.join(' ');
      if (key === 'branch.oid') st.initial = val === '(initial)';
      else if (key === 'branch.head') {
        st.detached = val === '(detached)';
        st.branch = st.detached ? null : val;
      } else if (key === 'branch.upstream') st.upstream = val;
      else if (key === 'branch.ab') {
        sawAb = true;
        const m = /\+(\d+) -(\d+)/.exec(val);
        if (m) {
          st.ahead = Number(m[1]);
          st.behind = Number(m[2]);
        }
      }
      continue;
    }
    const kind = t[0];
    const parts = t.split(' ');
    if (kind === '1') {
      st.files.push({ path: parts.slice(8).join(' '), index: parts[1][0], work: parts[1][1] });
    } else if (kind === '2') {
      st.files.push({ path: parts.slice(9).join(' '), orig: tokens[++i], index: parts[1][0], work: parts[1][1] });
    } else if (kind === 'u') {
      st.files.push({ path: parts.slice(10).join(' '), index: 'U', work: 'U', conflict: parts[1] });
    } else if (kind === '?') {
      st.files.push({ path: t.slice(2), index: '.', work: '?' });
    }
  }
  // Tem upstream configurado mas o git não conseguiu comparar: a branch remota foi apagada.
  st.upstreamGone = !!st.upstream && !sawAb;

  for (const f of st.files) {
    if (f.index === 'U') st.conflicted++;
    else {
      if (f.index !== '.') st.staged++;
      if (f.work === '?') st.untracked++;
      else if (f.work !== '.') st.unstaged++;
    }
  }

  const [tag, last, op, stashes, remotes] = await Promise.all([
    gitOrNull(cwd, ['describe', '--tags', '--abbrev=0']),
    st.initial ? null : gitOrNull(cwd, ['log', '-1', `--format=%H${FS}%s${FS}%at`]),
    currentOperation(cwd),
    gitOrNull(cwd, ['stash', 'list', '--format=%gd']),
    gitOrNull(cwd, ['remote']),
  ]);
  st.lastTag = tag?.trim() || null;
  if (last) {
    const [hash, subject, time] = last.trim().split(FS);
    st.lastCommit = { hash, subject, time: Number(time) };
  }
  st.operation = op;
  st.stashes = stashes ? stashes.split('\n').filter(Boolean).length : 0;
  st.remotes = remotes ? remotes.split('\n').map((r) => r.trim()).filter(Boolean) : [];
  return st;
}
