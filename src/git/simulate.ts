// Hydra — © 2026 José Segura (GKsegura) · MIT
// Simulação de sequências de operações ("cenários") sem tocar no repositório: nada de checkout, nada na área de trabalho,
// nenhuma ref alterada e nenhum objeto novo no .git. O resultado de cada passo é um commit VIRTUAL (`git commit-tree`)
// que serve de base do passo seguinte, então dá para prever conflitos que só aparecem depois de outro passo.
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, GitError, gitRaw } from './core.ts';
import { assertBranchExists } from './merge.ts';

/** O que aconteceu em um passo do cenário. */
export interface SimulatedStep {
  op: 'merge';
  /** A ref que entrou (branch local, remota, tag ou commit). */
  ref: string;
  /**
   * - `ok`: aplicado sem conflito; o resultado (`commit`) é a base do próximo passo;
   * - `conflict`: os `conflicts` impedem o passo; a cadeia para aqui;
   * - `skipped`: não foi calculado porque um passo anterior deu conflito.
   */
  state: 'ok' | 'conflict' | 'skipped';
  /** Commits de `ref` que ainda não estavam na base deste passo. */
  commits: number;
  /** O passo só avança a base até `ref` (sem commit de merge). */
  fastForward: boolean;
  /** A base já tinha tudo de `ref`: nada a fazer. */
  upToDate: boolean;
  /** Arquivos em conflito (previsão do `git merge-tree`). */
  conflicts: string[];
  /** Commit resultante (existe só na simulação), ou null se o passo conflitou ou foi pulado. */
  commit: string | null;
}

export interface SimulatedChain {
  /** O commit de partida (a ponta da base). */
  base: string;
  steps: SimulatedStep[];
  /** Índice do primeiro passo que conflitou, ou null se todos passaram. */
  stoppedAt: number | null;
}

export interface Step {
  op: 'merge';
  ref: string;
}

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

const sha = async (cwd: string, ref: string, env: NodeJS.ProcessEnv) =>
  (await git(cwd, ['rev-parse', '--verify', '-q', `${ref}^{commit}`], undefined, env)).trim();

/** Um merge virtual de `ref` sobre o commit `base`. Sem efeito no repositório. */
async function virtualMerge(cwd: string, base: string, ref: string, env: NodeJS.ProcessEnv): Promise<Omit<SimulatedStep, 'op' | 'ref'>> {
  const incoming = await sha(cwd, ref, env);
  const commits = Number((await git(cwd, ['rev-list', '--count', `${base}..${incoming}`], undefined, env)).trim());
  if (commits === 0) return { state: 'ok', commits: 0, fastForward: false, upToDate: true, conflicts: [], commit: base };

  const fastForward = (await gitRaw(cwd, ['merge-base', '--is-ancestor', base, incoming], undefined, env)).code === 0;
  if (fastForward) return { state: 'ok', commits, fastForward: true, upToDate: false, conflicts: [], commit: incoming };

  const r = await gitRaw(cwd, ['merge-tree', '--write-tree', '--name-only', '--no-messages', base, incoming], undefined, env);
  if (r.code === 1) {
    // Saída: <árvore>\n<arquivo em conflito>… (o mesmo arquivo pode aparecer mais de uma vez)
    const conflicts = [...new Set(r.stdout.split('\n').slice(1).map((l) => l.trim()).filter(Boolean))];
    return { state: 'conflict', commits, fastForward: false, upToDate: false, conflicts, commit: null };
  }
  if (r.code !== 0) throw new GitError(r.stderr.trim() || 'Não foi possível simular o merge.', r.stderr);
  const tree = r.stdout.split('\n')[0].trim();
  const commit = (await git(cwd, ['commit-tree', tree, '-p', base, '-p', incoming, '-m', `Simulação: merge de ${ref}`], undefined, env)).trim();
  return { state: 'ok', commits, fastForward: false, upToDate: false, conflicts: [], commit };
}

/**
 * Simula `steps` em sequência partindo da ponta de `baseRef` (uma branch que pode nem estar em uso). Cada passo parte do
 * resultado do anterior; se um conflita, os seguintes ficam `skipped`. Lança GitError se uma ref não existir.
 */
export async function simulateChain(cwd: string, baseRef: string, steps: Step[]): Promise<SimulatedChain> {
  await assertBranchExists(cwd, baseRef);
  for (const step of steps) await assertBranchExists(cwd, step.ref);

  return withScratchObjects(cwd, async (env) => {
    const base = await sha(cwd, baseRef, env);
    let current = base;
    let stoppedAt: number | null = null;
    const out: SimulatedStep[] = [];
    for (const [i, step] of steps.entries()) {
      if (stoppedAt !== null) {
        out.push({ ...step, state: 'skipped', commits: 0, fastForward: false, upToDate: false, conflicts: [], commit: null });
        continue;
      }
      const result = await virtualMerge(cwd, current, step.ref, env);
      out.push({ ...step, ...result });
      if (result.state === 'conflict') stoppedAt = i;
      else current = result.commit!;
    }
    return { base, steps: out, stoppedAt };
  });
}
