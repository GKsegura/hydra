// Hydra — © 2026 José Segura (GKsegura) · MIT
import { assertHash, assertRefName, FS, git, GitError, gitOrNull, gitRaw } from './core.ts';

export interface Branch {
  name: string;
  /** 'local' (refs/heads) ou 'remote' (refs/remotes/<remote>/…) */
  kind: 'local' | 'remote';
  remote: string | null;
  hash: string;
  time: number;
  current: boolean;
  upstream: string | null;
  upstreamGone: boolean;
  ahead: number;
  behind: number;
}

export async function listBranches(cwd: string): Promise<Branch[]> {
  const out = await gitOrNull(cwd, [
    'for-each-ref',
    `--format=%(refname)${FS}%(objectname)${FS}%(committerdate:unix)${FS}%(HEAD)${FS}%(upstream:short)${FS}%(upstream:track)`,
    'refs/heads', 'refs/remotes',
  ]);
  if (!out) return [];
  const remotes = ((await gitOrNull(cwd, ['remote'])) ?? '').split('\n').map((r) => r.trim()).filter(Boolean);
  const list: Branch[] = [];
  for (const line of out.split('\n')) {
    if (!line) continue;
    const [ref, hash, time, head, upstream, track] = line.split(FS);
    if (ref.endsWith('/HEAD')) continue;
    const isLocal = ref.startsWith('refs/heads/');
    const short = ref.replace(/^refs\/(heads|remotes)\//, '');
    const remote = isLocal ? null : remotes.find((r) => short.startsWith(`${r}/`)) ?? short.split('/')[0];
    list.push({
      name: short,
      kind: isLocal ? 'local' : 'remote',
      remote,
      hash,
      time: Number(time),
      current: head === '*',
      upstream: upstream || null,
      upstreamGone: track === '[gone]',
      ahead: Number(/ahead (\d+)/.exec(track)?.[1] ?? 0),
      behind: Number(/behind (\d+)/.exec(track)?.[1] ?? 0),
    });
  }
  return list;
}

export async function currentBranch(cwd: string): Promise<string | null> {
  const out = await gitOrNull(cwd, ['symbolic-ref', '--short', '-q', 'HEAD']);
  return out?.trim() || null;
}

/** Cria uma branch a partir do HEAD (ou de um commit) e, se pedido, já troca para ela. */
export async function createBranch(cwd: string, name: string, opts: { from?: string; checkout?: boolean } = {}): Promise<void> {
  await assertRefName(cwd, name);
  // `from` pode ser um commit ou outra branch (local ou remota); só precisa resolver para um commit.
  if (opts.from && (opts.from.startsWith('-') || (await gitRaw(cwd, ['rev-parse', '--verify', '-q', `${opts.from}^{commit}`])).code !== 0)) {
    throw new GitError(`Origem "${opts.from}" não encontrada.`);
  }
  if ((await gitRaw(cwd, ['show-ref', '--verify', '-q', `refs/heads/${name}`])).code === 0) throw new GitError(`Já existe uma branch "${name}".`);
  if (opts.checkout) await git(cwd, ['switch', '-c', name, ...(opts.from ? [opts.from] : [])]);
  else await git(cwd, ['branch', name, ...(opts.from ? [opts.from] : [])]);
}

export type CheckoutMode = 'carry' | 'stash';

/**
 * Troca de branch. Com alterações locais:
 * - `carry` leva as alterações junto (o git recusa se houver conflito);
 * - `stash` guarda as alterações num stash marcado com o nome da branch de origem.
 * Uma branch só remota (ex.: origin/feature) vira local rastreando a remota.
 */
export async function checkoutBranch(cwd: string, name: string, mode: CheckoutMode = 'carry'): Promise<{ stashed: boolean }> {
  const branches = await listBranches(cwd);
  const target = branches.find((b) => b.name === name);
  if (!target) throw new GitError(`Branch "${name}" não encontrada.`);

  let stashed = false;
  if (mode === 'stash') {
    const dirty = ((await git(cwd, ['status', '--porcelain'])) ?? '').trim().length > 0;
    if (dirty) {
      const from = (await currentBranch(cwd)) ?? 'HEAD';
      await git(cwd, ['stash', 'push', '--include-untracked', '-m', stashLabel(from)]);
      stashed = true;
    }
  }

  if (target.kind === 'local') {
    await git(cwd, ['switch', name]);
  } else {
    const localName = name.slice((target.remote?.length ?? 0) + 1);
    const exists = branches.some((b) => b.kind === 'local' && b.name === localName);
    await git(cwd, exists ? ['switch', localName] : ['switch', '-c', localName, '--track', name]);
  }
  return { stashed };
}

/** Texto usado nos stashes criados ao trocar de branch — permite oferecer "restaurar" ao voltar. */
export const stashLabel = (branch: string) => `hydra: alterações de ${branch}`;

export async function checkoutCommit(cwd: string, hash: string): Promise<void> {
  assertHash(hash);
  await git(cwd, ['switch', '--detach', hash]);
}

export async function renameBranch(cwd: string, from: string, to: string, opts: { remote?: string } = {}): Promise<void> {
  await assertRefName(cwd, to);
  const upstream = (await gitOrNull(cwd, ['rev-parse', '--abbrev-ref', `${from}@{u}`]))?.trim() ?? null;
  await git(cwd, ['branch', '-m', from, to]);
  if (opts.remote && upstream) {
    // No remoto não existe "renomear": publica com o nome novo e apaga o antigo.
    const oldRemoteName = upstream.slice(opts.remote.length + 1);
    await git(cwd, ['push', '--set-upstream', opts.remote, `${to}:${to}`]);
    await git(cwd, ['push', opts.remote, '--delete', oldRemoteName]);
  }
}

export interface DeleteOptions {
  local: boolean;
  /** Nome do remoto onde apagar a branch (ex.: "origin"), ou nada para não mexer no remoto. */
  remote?: string;
  /** Apagar mesmo sem estar mergeada (os commits só vão continuar acessíveis pelo reflog). */
  force?: boolean;
}

/** A branch está contida no HEAD ou no próprio upstream (ou seja, apagar não perde commits)? */
export async function isMerged(cwd: string, name: string): Promise<boolean> {
  if ((await gitRaw(cwd, ['merge-base', '--is-ancestor', `refs/heads/${name}`, 'HEAD'])).code === 0) return true;
  const up = (await gitOrNull(cwd, ['rev-parse', '--abbrev-ref', `${name}@{u}`]))?.trim();
  return !!up && (await gitRaw(cwd, ['merge-base', '--is-ancestor', `refs/heads/${name}`, up])).code === 0;
}

export async function deleteBranch(cwd: string, name: string, opts: DeleteOptions): Promise<void> {
  if (!opts.local && !opts.remote) return;
  if (opts.local) {
    if ((await currentBranch(cwd)) === name) throw new GitError('Não dá para excluir a branch em que você está. Troque de branch antes.');
    if (!opts.force && !(await isMerged(cwd, name))) {
      throw new GitError(`A branch "${name}" tem commits que não estão em nenhuma outra branch.`, '', 'not_merged');
    }
  }
  if (opts.remote) {
    const upstream = (await gitOrNull(cwd, ['rev-parse', '--abbrev-ref', `${name}@{u}`]))?.trim();
    const remoteBranch = upstream?.startsWith(`${opts.remote}/`) ? upstream.slice(opts.remote.length + 1) : name;
    const r = await gitRaw(cwd, ['push', opts.remote, '--delete', remoteBranch]);
    // Já não existir no remoto não é erro: o objetivo era ela não estar lá.
    if (r.code !== 0 && !/remote ref does not exist/i.test(r.stderr)) throw new GitError(r.stderr.trim());
    await gitRaw(cwd, ['branch', '-dr', `${opts.remote}/${remoteBranch}`]);
  }
  if (opts.local) await git(cwd, ['branch', opts.force ? '-D' : '-d', name]);
}

/** Apaga só a referência remota (ex.: excluir "origin/feature" direto da lista de remotas). */
export async function deleteRemoteBranch(cwd: string, remoteRef: string): Promise<void> {
  const remotes = ((await gitOrNull(cwd, ['remote'])) ?? '').split('\n').map((r) => r.trim()).filter(Boolean);
  const remote = remotes.find((r) => remoteRef.startsWith(`${r}/`));
  if (!remote) throw new GitError(`"${remoteRef}" não é uma branch remota.`);
  const name = remoteRef.slice(remote.length + 1);
  const r = await gitRaw(cwd, ['push', remote, '--delete', name]);
  if (r.code !== 0 && !/remote ref does not exist/i.test(r.stderr)) throw new GitError(r.stderr.trim());
  await gitRaw(cwd, ['branch', '-dr', remoteRef]);
}
