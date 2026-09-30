// Hydra — © 2026 José Segura (GKsegura) · MIT
// Simulação de sequências de operações ("cenários") sem tocar no repositório: nada de checkout, nada na área de trabalho,
// nenhuma ref alterada e nenhum objeto novo no .git. O resultado de cada passo é um commit VIRTUAL (`git commit-tree`)
// que serve de base do passo seguinte, então dá para prever conflitos que só aparecem depois de outro passo.
//
// Operações: merge, cherry-pick e rebase (a base é reaplicada sobre outra ref). Cherry-pick e rebase usam
// `git merge-tree --write-tree --merge-base=…` (Git ≥ 2.40).
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, GitError, gitRaw } from './core.ts';
import { assertBranchExists } from './merge.ts';

export type StepOp = 'merge' | 'cherry-pick' | 'rebase';

/** O que aconteceu em um passo do cenário. */
export interface SimulatedStep {
  op: StepOp;
  /** A ref usada (branch local, remota, tag ou commit). */
  ref: string;
  /**
   * - `ok`: aplicado sem conflito; o resultado (`commit`) é a base do próximo passo;
   * - `conflict`: os `conflicts` impedem o passo; a cadeia para aqui;
   * - `error`: o passo não pode ser simulado (ex.: cherry-pick de commit de merge); a cadeia para aqui, com o motivo em `note`;
   * - `skipped`: não foi calculado porque um passo anterior parou a cadeia.
   */
  state: 'ok' | 'conflict' | 'error' | 'skipped';
  /** merge: commits de `ref` que entram · cherry-pick: 1 (ou 0 se já estava aplicado) · rebase: commits reaplicados. */
  commits: number;
  /** O passo só avança a base até `ref` (sem commit novo). */
  fastForward: boolean;
  /** Nada a fazer: a base já tinha tudo. */
  upToDate: boolean;
  /** Arquivos em conflito (previsão do `git merge-tree`). */
  conflicts: string[];
  /** Detalhe legível: em qual commit o rebase conflitou, ou por que o passo não pôde ser simulado. */
  note: string | null;
  /** Commit resultante (existe só na simulação), ou null se o passo parou a cadeia ou foi pulado. */
  commit: string | null;
}

export interface SimulatedChain {
  /** O commit de partida (a ponta da base). */
  base: string;
  steps: SimulatedStep[];
  /** Índice do primeiro passo que parou a cadeia (conflito ou erro), ou null se todos passaram. */
  stoppedAt: number | null;
}

export interface Step {
  op: StepOp;
  ref: string;
}

/** Limite de commits reaplicados por um passo de rebase (cada um é um `merge-tree`). */
export const MAX_REBASE_COMMITS = 200;

// Identidade fixa só para os commits virtuais: o repositório pode nem ter user.name/user.email configurados.
const IDENTITY: NodeJS.ProcessEnv = {
  GIT_AUTHOR_NAME: 'Hydra (simulação)',
  GIT_AUTHOR_EMAIL: 'simulacao@hydra.local',
  GIT_COMMITTER_NAME: 'Hydra (simulação)',
  GIT_COMMITTER_EMAIL: 'simulacao@hydra.local',
};

/**
 * Roda `fn` com as gravações de objetos indo para uma pasta temporária (lendo o repositório como "alternate"):
 * tudo o que a simulação criar some junto com a pasta, e o `.git` do repositório fica intacto.
 */
async function withScratchObjects<T>(cwd: string, fn: (env: NodeJS.ProcessEnv) => Promise<T>): Promise<T> {
  const objects = (await git(cwd, ['rev-parse', '--path-format=absolute', '--git-path', 'objects'])).trim();
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'hydra-sim-'));
  try {
    return await fn({ ...IDENTITY, GIT_OBJECT_DIRECTORY: scratch, GIT_ALTERNATE_OBJECT_DIRECTORIES: objects });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

type Outcome = Omit<SimulatedStep, 'op' | 'ref'>;

const sha = async (cwd: string, ref: string, env: NodeJS.ProcessEnv) =>
  (await git(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], undefined, env)).trim();

const tree = async (cwd: string, commit: string, env: NodeJS.ProcessEnv) =>
  (await git(cwd, ['rev-parse', `${commit}^{tree}`], undefined, env)).trim();

const short = (hash: string) => hash.slice(0, 7);

const ok = (o: Partial<Outcome> & { commit: string }): Outcome => ({
  state: 'ok', commits: 0, fastForward: false, upToDate: false, conflicts: [], note: null, ...o,
});
const stop = (state: 'conflict' | 'error', o: Partial<Outcome> = {}): Outcome => ({
  state, commits: 0, fastForward: false, upToDate: false, conflicts: [], note: null, commit: null, ...o,
});

/** Um merge virtual de `ref` sobre o commit `base`. Sem efeito no repositório. */
async function virtualMerge(cwd: string, base: string, ref: string, env: NodeJS.ProcessEnv): Promise<Outcome> {
  const incoming = await sha(cwd, ref, env);
  const commits = Number((await git(cwd, ['rev-list', '--count', `${base}..${incoming}`], undefined, env)).trim());
  if (commits === 0) return ok({ upToDate: true, commit: base });

  const fastForward = (await gitRaw(cwd, ['merge-base', '--is-ancestor', base, incoming], undefined, env)).code === 0;
  if (fastForward) return ok({ commits, fastForward: true, commit: incoming });

  const r = await gitRaw(cwd, ['merge-tree', '--write-tree', '--name-only', '--no-messages', base, incoming], undefined, env);
  if (r.code === 1) return stop('conflict', { commits, conflicts: conflictsOf(r.stdout) });
  if (r.code !== 0) throw new GitError(r.stderr.trim() || 'Não foi possível simular o merge.', r.stderr);
  const merged = r.stdout.split('\n')[0].trim();
  const commit = (await git(cwd, ['commit-tree', merged, '-p', base, '-p', incoming, '-m', `Simulação: merge de ${ref}`], undefined, env)).trim();
  return ok({ commits, commit });
}

/** Saída do `merge-tree --name-only`: <árvore>\n<arquivo em conflito>… (o mesmo arquivo pode repetir). */
const conflictsOf = (stdout: string) => [...new Set(stdout.split('\n').slice(1).map((l) => l.trim()).filter(Boolean))];

/**
 * Aplica o commit `picked` sobre `base` (um cherry-pick): merge de 3 vias com o pai do commit como ancestral.
 * Devolve o novo commit virtual, ou o conflito. Commits raiz e de merge não são suportados.
 */
async function pick(cwd: string, base: string, picked: string, env: NodeJS.ProcessEnv):
  Promise<{ commit: string; empty: boolean } | { conflicts: string[] } | { error: string }> {
  const parents = (await git(cwd, ['rev-list', '--parents', '-n', '1', picked], undefined, env)).trim().split(' ').slice(1);
  if (parents.length === 0) return { error: `${short(picked)} é o commit inicial do repositório: não dá para aplicá-lo com cherry-pick.` };
  if (parents.length > 1) return { error: `${short(picked)} é um commit de merge: o cherry-pick precisa escolher um dos lados e a simulação ainda não faz isso.` };

  const r = await gitRaw(cwd, ['merge-tree', '--write-tree', '--name-only', '--no-messages', `--merge-base=${parents[0]}`, base, picked], undefined, env);
  if (r.code === 1) return { conflicts: conflictsOf(r.stdout) };
  if (r.code !== 0) throw new GitError(r.stderr.trim() || 'Não foi possível simular o cherry-pick.', r.stderr);
  const result = r.stdout.split('\n')[0].trim();
  if (result === (await tree(cwd, base, env))) return { commit: base, empty: true }; // o commit já estava aplicado
  const subject = (await git(cwd, ['log', '-1', '--format=%s', picked], undefined, env)).trim();
  const commit = (await git(cwd, ['commit-tree', result, '-p', base, '-m', subject], undefined, env)).trim();
  return { commit, empty: false };
}

async function virtualCherryPick(cwd: string, base: string, ref: string, env: NodeJS.ProcessEnv): Promise<Outcome> {
  const r = await pick(cwd, base, await sha(cwd, ref, env), env);
  if ('error' in r) return stop('error', { note: r.error });
  if ('conflicts' in r) return stop('conflict', { commits: 1, conflicts: r.conflicts });
  return r.empty ? ok({ upToDate: true, commit: base, note: 'o commit já estava aplicado' }) : ok({ commits: 1, commit: r.commit });
}

/**
 * Rebase virtual: reaplica, sobre `ref`, os commits da base que `ref` ainda não tem (sem os de merge e sem os que já existem
 * lá com o mesmo conteúdo, como o `git rebase`). Para no primeiro commit que conflitar.
 */
async function virtualRebase(cwd: string, base: string, ref: string, env: NodeJS.ProcessEnv, maxCommits: number): Promise<Outcome> {
  const onto = await sha(cwd, ref, env);
  const isAncestor = async (a: string, b: string) => (await gitRaw(cwd, ['merge-base', '--is-ancestor', a, b], undefined, env)).code === 0;

  if (onto === base || (await isAncestor(onto, base))) return ok({ upToDate: true, commit: base }); // já está sobre `ref`
  if (await isAncestor(base, onto)) return ok({ fastForward: true, commit: onto }); // nada local: só avança

  const list = await revList(cwd, `${onto}...${base}`, env, ['--no-merges', '--cherry-pick', '--right-only', '--topo-order']);
  if (!list.length) return ok({ fastForward: true, commit: onto, note: 'os commits locais já existem em ' + ref }); // todos equivalentes
  if (list.length > maxCommits) {
    return stop('error', { note: `são ${list.length} commits para reaplicar (o limite da simulação é ${maxCommits}).` });
  }

  let tip = onto;
  for (const [i, commit] of list.entries()) {
    const r = await pick(cwd, tip, commit, env);
    if ('error' in r) return stop('error', { commits: i, note: r.error });
    if ('conflicts' in r) {
      return stop('conflict', { commits: i, conflicts: r.conflicts, note: `no commit ${short(commit)} (${i + 1} de ${list.length})` });
    }
    tip = r.commit; // um commit vazio (já aplicado) não muda a ponta
  }
  return ok({ commits: list.length, commit: tip });
}

/** Commits de um intervalo, do mais antigo para o mais novo. */
async function revList(cwd: string, range: string, env: NodeJS.ProcessEnv, flags: string[] = []): Promise<string[]> {
  const out = await git(cwd, ['rev-list', '--reverse', ...flags, range], undefined, env);
  return out.split('\n').map((l) => l.trim()).filter(Boolean);
}

type Limits = { rebaseCommits: number };

const RUN: Record<StepOp, (cwd: string, base: string, ref: string, env: NodeJS.ProcessEnv, limits: Limits) => Promise<Outcome>> = {
  merge: virtualMerge,
  'cherry-pick': virtualCherryPick,
  rebase: (cwd, base, ref, env, limits) => virtualRebase(cwd, base, ref, env, limits.rebaseCommits),
};

/**
 * Simula `steps` em sequência partindo da ponta de `baseRef` (uma branch que pode nem estar em uso). Cada passo parte do
 * resultado do anterior; se um conflita (ou não pode ser simulado), os seguintes ficam `skipped`.
 * Lança GitError se uma ref não existir.
 */
export async function simulateChain(
  cwd: string, baseRef: string, steps: Step[], limits: Limits = { rebaseCommits: MAX_REBASE_COMMITS },
): Promise<SimulatedChain> {
  await assertBranchExists(cwd, baseRef);
  for (const step of steps) await assertBranchExists(cwd, step.ref);

  return withScratchObjects(cwd, async (env) => {
    const base = await sha(cwd, baseRef, env);
    let current = base;
    let stoppedAt: number | null = null;
    const out: SimulatedStep[] = [];
    for (const [i, step] of steps.entries()) {
      if (stoppedAt !== null) {
        out.push({ ...step, ...stop('conflict'), state: 'skipped' });
        continue;
      }
      const result = await RUN[step.op](cwd, current, step.ref, env, limits);
      out.push({ ...step, ...result });
      if (result.state === 'ok') current = result.commit!;
      else stoppedAt = i;
    }
    return { base, steps: out, stoppedAt };
  });
}
