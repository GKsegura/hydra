// Hydra — © 2026 José Segura (GKsegura) · MIT
// Rebase interativo de verdade: reordena e reescreve commits no repositório real, só quando você confirma.
// Diferente do simulador de cenários (./simulate.ts), que roda num sandbox e nunca muda o repositório.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMessage } from './commit.ts';
import { assertHash, FS, git, gitOrNull, gitRaw, GitError } from './core.ts';
import { getStatus } from './status.ts';

/** Existe como commit/branch/tag válido? (sem puxar merge.ts, pra não criar import circular). */
async function assertCommittish(cwd: string, ref: string) {
  if (ref.startsWith('-') || (await gitRaw(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`])).code !== 0) {
    throw new GitError(`"${ref}" não foi encontrado.`);
  }
}

export type RebaseAction = 'pick' | 'reword' | 'squash' | 'fixup' | 'drop';

export interface RebaseStep {
  hash: string;
  action: RebaseAction;
  /** Mensagem nova, para `reword` (obrigatória) e `squash` (opcional: sem ela, usa a combinação padrão do git). */
  summary?: string;
  body?: string;
}

export interface RebaseCommit {
  hash: string;
  subject: string;
  author: string;
  /** Alcançável por algum `origin/*`: reescrever muda um commit que já foi enviado. */
  published: boolean;
}

export interface RebasePlan {
  /** `base` resolvido para o hash (a interface pode mandar uma branch ou um commit). */
  base: string;
  /** Do mais antigo para o mais novo — a ordem que aparece no diálogo. */
  commits: RebaseCommit[];
}

/** Commits alcançáveis a partir de HEAD que não existem em nenhum `origin/*` (ainda não publicados). */
async function unpublishedHashes(cwd: string): Promise<Set<string>> {
  const out = await gitOrNull(cwd, ['rev-list', 'HEAD', '--not', '--remotes']);
  return new Set((out ?? '').split('\n').map((s) => s.trim()).filter(Boolean));
}

/** Os commits entre `base` (exclusive) e HEAD, para montar o diálogo de rebase. */
export async function rebasePlan(cwd: string, base: string): Promise<RebasePlan> {
  await assertCommittish(cwd, base);
  if ((await gitRaw(cwd, ['merge-base', '--is-ancestor', base, 'HEAD'])).code !== 0) {
    throw new GitError(`"${base}" não é ancestral do HEAD: não dá para rebasear a partir daí.`);
  }
  const [out, unpublished, resolvedBase] = await Promise.all([
    git(cwd, ['log', '--reverse', `--format=%H${FS}%an${FS}%s`, `${base}..HEAD`]),
    unpublishedHashes(cwd),
    git(cwd, ['rev-parse', base]),
  ]);
  const commits = out.trim()
    ? out.trim().split('\n').map((line) => {
      const [hash, author, subject] = line.split(FS);
      return { hash, author, subject, published: !unpublished.has(hash) };
    })
    : [];
  return { base: resolvedBase.trim(), commits };
}

/** Linha do todo do `git rebase -i` para um passo (o texto depois do hash é só cosmético). */
function todoLine(step: RebaseStep, subject: string): string {
  if (step.action === 'drop') return `drop ${step.hash} ${subject}`;
  if (step.action === 'fixup') return `fixup ${step.hash} ${subject}`;
  if (step.action === 'squash') return `squash ${step.hash} ${subject}`;
  // pick e reword viram "pick" no todo; reword ganha um `exec` depois que reescreve a mensagem — assim a
  // mensagem final é exatamente a que a pessoa digitou, sem precisar de um editor interativo no meio do processo.
  return `pick ${step.hash} ${subject}`;
}

/**
 * Reordena e reescreve commits de `base..HEAD` de verdade, com `git rebase -i`.
 * O todo é montado pelo Hydra e entregue ao git via `GIT_SEQUENCE_EDITOR` (um `cp` do Git for Windows,
 * sem shell nem script Node); `GIT_EDITOR=true` evita qualquer editor interativo no meio do processo.
 * Para junto o resultado: `{ done: true, hash }` quando terminou, ou `{ done: false, conflicts }` quando
 * parou num conflito (o repo fica com `operation: 'rebase'`; resolva e chame `continueOperation`).
 */
export async function startRebase(
  cwd: string, base: string, steps: RebaseStep[],
): Promise<{ done: true; hash: string } | { done: false; conflicts: number }> {
  const status = await getStatus(cwd);
  if (status.operation) throw new GitError(`Já tem um ${status.operation} em andamento neste repositório.`);
  if (status.files.length) throw new GitError('Você tem alterações não commitadas. Faça commit, guarde (stash) ou descarte antes de rebasear.');
  if (!steps.length) throw new GitError('Escolha pelo menos um commit.');
  for (const s of steps) assertHash(s.hash);
  if (steps.some((s) => s.action === 'reword' && !s.summary?.trim())) throw new GitError('Reword precisa de uma mensagem.');

  const plan = await rebasePlan(cwd, base);
  const known = new Map(plan.commits.map((c) => [c.hash, c.subject]));
  const ids = steps.map((s) => s.hash);
  if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((h) => !known.has(h))) {
    throw new GitError('A lista de commits não bate com os commits desse intervalo (ela pode ter mudado). Abra o rebase de novo.');
  }
  const unchanged = steps.every((s, i) => s.action === 'pick' && s.hash === plan.commits[i].hash);
  if (unchanged) throw new GitError('Nada para fazer: todos os commits continuam como estão, na mesma ordem.');

  const scratch = mkdtempSync(path.join(os.tmpdir(), 'hydra-rebase-'));
  const posix = (p: string) => p.replace(/\\/g, '/');
  try {
    const lines: string[] = [];
    let msgCount = 0;
    for (const step of steps) {
      lines.push(todoLine(step, known.get(step.hash)!));
      if ((step.action === 'reword' || step.action === 'squash') && step.summary?.trim()) {
        const file = path.join(scratch, `msg-${msgCount++}.txt`);
        writeFileSync(file, buildMessage(step.summary, step.body ?? ''));
        lines.push(`exec git commit --amend -F "${posix(file)}"`);
      }
    }
    const todoFile = path.join(scratch, 'todo.txt');
    writeFileSync(todoFile, `${lines.join('\n')}\n`);

    const r = await gitRaw(cwd, ['rebase', '-i', plan.base], undefined, {
      GIT_SEQUENCE_EDITOR: `cp '${posix(todoFile)}'`,
      GIT_EDITOR: 'true',
    });
    if (r.code === 0) return { done: true, hash: (await git(cwd, ['rev-parse', 'HEAD'])).trim() };
    const after = await getStatus(cwd);
    if (after.operation === 'rebase') return { done: false, conflicts: after.conflicted };
    throw new GitError(r.stderr.trim() || 'O rebase falhou.', r.stderr);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Rebase simples: leva os commits da branch atual (que ainda não estão em `upstream`) para cima da ponta de
 * `upstream`, na mesma ordem — sem editar a lista. É o "Rebase de atual sobre…" do seletor de branch;
 * `upstream` não precisa ser ancestral do HEAD (ao contrário de `startRebase`, que reordena dentro da própria branch).
 */
export async function rebaseOnto(cwd: string, upstream: string): Promise<{ done: true; hash: string } | { done: false; conflicts: number }> {
  const status = await getStatus(cwd);
  if (status.operation) throw new GitError(`Já tem um ${status.operation} em andamento neste repositório.`);
  if (status.files.length) throw new GitError('Você tem alterações não commitadas. Faça commit, guarde (stash) ou descarte antes de rebasear.');
  await assertCommittish(cwd, upstream);
  const r = await gitRaw(cwd, ['rebase', upstream], undefined, { GIT_EDITOR: 'true' });
  if (r.code === 0) return { done: true, hash: (await git(cwd, ['rev-parse', 'HEAD'])).trim() };
  const after = await getStatus(cwd);
  if (after.operation === 'rebase') return { done: false, conflicts: after.conflicted };
  throw new GitError(r.stderr.trim() || 'O rebase falhou.', r.stderr);
}

/** `git rebase --continue`, depois que os conflitos do passo atual foram resolvidos. */
export async function continueRebase(cwd: string): Promise<string> {
  const r = await gitRaw(cwd, ['rebase', '--continue'], undefined, { GIT_EDITOR: 'true' });
  if (r.code !== 0) {
    const st = await getStatus(cwd);
    if (st.operation === 'rebase' && st.conflicted > 0) throw new GitError(`Ainda há ${st.conflicted} arquivo(s) em conflito.`);
    throw new GitError(r.stderr.trim() || 'Não foi possível continuar o rebase.', r.stderr);
  }
  return (await git(cwd, ['rev-parse', 'HEAD'])).trim();
}
