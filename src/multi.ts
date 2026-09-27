// Hydra — © 2026 José Segura (GKsegura) · MIT
// Operações em vários repositórios do workspace de uma vez. Cada repo é independente: um que falha não desfaz os outros.
import {
  checkoutBranch, commit, createBranch, getStatus, listBranches, mergeBranch, previewMerge, stage,
  type CheckoutMode, type MergePreview, type Operation,
} from './git/index.ts';
import type { Repo } from './workspace.ts';

export interface RepoResult {
  id: string;
  name: string;
  /**
   * `ok`: feito · `skipped`: nada a fazer ou não se aplica · `error`: o git recusou ·
   * `conflict`: o merge parou em conflito (resolva no painel do repo).
   */
  outcome: 'ok' | 'skipped' | 'error' | 'conflict';
  message: string;
  hash?: string;
}

/**
 * Commit com a mesma mensagem em vários repos, um depois do outro.
 * `stageAll`: coloca tudo no stage antes (como o "Stage all" do painel). Repos com merge/rebase em andamento
 * ou conflitos são pulados: o commit ali tem outro significado e é feito pelo fluxo do próprio painel.
 */
export async function commitMany(items: { repo: Repo; stageAll: boolean }[], summary: string, body: string): Promise<RepoResult[]> {
  const results: RepoResult[] = [];
  for (const { repo, stageAll } of items) {
    const base = { id: repo.id, name: repo.name };
    try {
      const before = await getStatus(repo.path);
      if (before.operation || before.conflicted) {
        results.push({ ...base, outcome: 'skipped', message: 'Tem merge/rebase em andamento: conclua pelo painel do repo.' });
        continue;
      }
      if (stageAll) await stage(repo.path, 'all');
      const status = stageAll ? await getStatus(repo.path) : before;
      if (!status.staged) {
        results.push({ ...base, outcome: 'skipped', message: 'Nada em stage.' });
        continue;
      }
      const hash = await commit(repo.path, summary, body);
      results.push({ ...base, outcome: 'ok', message: `${status.staged} arquivo(s) em ${status.branch ?? 'HEAD'}`, hash });
    } catch (err) {
      results.push({ ...base, outcome: 'error', message: (err as Error).message });
    }
  }
  return results;
}

// ------------------------------------------------------------------ branches em vários repos

export interface RepoBranches {
  id: string;
  name: string;
  current: string | null;
  /** Branches locais. */
  local: string[];
  /** Branches remotas com o remoto na frente (ex.: "origin/feature/x"). */
  remote: string[];
  /** Alterações não commitadas (importa para trocar de branch). */
  dirty: boolean;
  operation: Operation | null;
}

/** Branches de cada repo, para o diálogo "Branch no workspace" mostrar o que existe onde. */
export async function branchOverview(repos: Repo[]): Promise<RepoBranches[]> {
  return Promise.all(repos.map(async (repo) => {
    const [branches, status] = await Promise.all([listBranches(repo.path), getStatus(repo.path)]);
    return {
      id: repo.id,
      name: repo.name,
      current: status.branch,
      local: branches.filter((b) => b.kind === 'local').map((b) => b.name),
      remote: branches.filter((b) => b.kind === 'remote').map((b) => b.name),
      dirty: status.files.length > 0,
      operation: status.operation,
    };
  }));
}

/** A ref que representa `name` neste repo: a branch local, senão a remota (origin/name), senão nada. */
function resolveBranch(info: RepoBranches, name: string): { ref: string; remoteOnly: boolean } | null {
  if (info.local.includes(name)) return { ref: name, remoteOnly: false };
  const remote = info.remote.find((r) => r.slice(r.indexOf('/') + 1) === name);
  return remote ? { ref: remote, remoteOnly: true } : null;
}

async function overviewOf(repo: Repo): Promise<RepoBranches> {
  return (await branchOverview([repo]))[0];
}

/** Cria a mesma branch em vários repos. `from` por repo (padrão: a branch atual de cada um). */
export async function createMany(items: { repo: Repo; from?: string }[], name: string, checkout: boolean): Promise<RepoResult[]> {
  const results: RepoResult[] = [];
  for (const { repo, from } of items) {
    const base = { id: repo.id, name: repo.name };
    try {
      const info = await overviewOf(repo);
      if (info.local.includes(name)) {
        results.push({ ...base, outcome: 'skipped', message: 'Já existe nesse repositório.' });
        continue;
      }
      if (checkout && info.operation) {
        results.push({ ...base, outcome: 'skipped', message: `Tem ${info.operation} em andamento: conclua antes de trocar de branch.` });
        continue;
      }
      await createBranch(repo.path, name, { from: from || undefined, checkout });
      const origin = from || info.current || 'HEAD';
      results.push({ ...base, outcome: 'ok', message: checkout ? `Criada a partir de ${origin} e em uso.` : `Criada a partir de ${origin}.` });
    } catch (err) {
      results.push({ ...base, outcome: 'error', message: (err as Error).message });
    }
  }
  return results;
}

/**
 * Troca todos os repos para a mesma branch. Por repo: `mode` diz o que fazer com alterações pendentes
 * (levar ou guardar num stash) e `create` cria a branch onde ela não existe.
 */
export async function checkoutMany(items: { repo: Repo; mode: CheckoutMode; create: boolean }[], name: string): Promise<RepoResult[]> {
  const results: RepoResult[] = [];
  for (const { repo, mode, create } of items) {
    const base = { id: repo.id, name: repo.name };
    try {
      const info = await overviewOf(repo);
      if (info.current === name) {
        results.push({ ...base, outcome: 'skipped', message: 'Já está nessa branch.' });
        continue;
      }
      if (info.operation) {
        results.push({ ...base, outcome: 'skipped', message: `Tem ${info.operation} em andamento: conclua antes de trocar de branch.` });
        continue;
      }
      const target = resolveBranch(info, name);
      if (!target) {
        if (!create) {
          results.push({ ...base, outcome: 'skipped', message: 'A branch não existe nesse repositório.' });
          continue;
        }
        await createBranch(repo.path, name, { checkout: true });
        results.push({ ...base, outcome: 'ok', message: `Criada a partir de ${info.current ?? 'HEAD'} (não existia).` });
        continue;
      }
      const { stashed } = await checkoutBranch(repo.path, target.ref, mode);
      const parts = [target.remoteOnly ? `Criada a partir de ${target.ref}, rastreando o remoto.` : 'Trocada.'];
      if (stashed) parts.push(`Alterações de ${info.current ?? 'HEAD'} guardadas num stash.`);
      results.push({ ...base, outcome: 'ok', message: parts.join(' ') });
    } catch (err) {
      results.push({ ...base, outcome: 'error', message: (err as Error).message });
    }
  }
  return results;
}

export interface RepoMergePreview {
  id: string;
  name: string;
  current: string | null;
  /** A ref que seria mergeada (local ou remota), ou `null` se a branch não existe nesse repo. */
  ref: string | null;
  preview: MergePreview | null;
  /** Por que esse repo fica de fora (branch inexistente, é a atual, operação em andamento…). */
  reason: string | null;
}

/** Prévia do merge de `branch` na branch atual de cada repo, sem tocar em nada. */
export async function previewMany(repos: Repo[], branch: string): Promise<RepoMergePreview[]> {
  return Promise.all(repos.map(async (repo) => {
    const info = await overviewOf(repo);
    const base = { id: repo.id, name: repo.name, current: info.current };
    const target = resolveBranch(info, branch);
    if (!target) return { ...base, ref: null, preview: null, reason: 'A branch não existe nesse repositório.' };
    if (info.current === branch) return { ...base, ref: target.ref, preview: null, reason: 'É a branch atual.' };
    if (info.operation) return { ...base, ref: target.ref, preview: null, reason: `Tem ${info.operation} em andamento.` };
    try {
      return { ...base, ref: target.ref, preview: await previewMerge(repo.path, target.ref), reason: null };
    } catch (err) {
      return { ...base, ref: target.ref, preview: null, reason: (err as Error).message };
    }
  }));
}

/** Merge de `branch` na branch atual de cada repo. Conflitos ficam em andamento no repo, para o resolvedor. */
export async function mergeMany(repos: Repo[], branch: string, noFastForward: boolean): Promise<RepoResult[]> {
  const results: RepoResult[] = [];
  for (const repo of repos) {
    const base = { id: repo.id, name: repo.name };
    try {
      const info = await overviewOf(repo);
      const target = resolveBranch(info, branch);
      if (!target) {
        results.push({ ...base, outcome: 'skipped', message: 'A branch não existe nesse repositório.' });
        continue;
      }
      if (info.current === branch) {
        results.push({ ...base, outcome: 'skipped', message: 'É a branch atual.' });
        continue;
      }
      if (info.operation) {
        results.push({ ...base, outcome: 'skipped', message: `Tem ${info.operation} em andamento.` });
        continue;
      }
      const r = await mergeBranch(repo.path, target.ref, { noFastForward });
      const into = info.current ?? 'HEAD';
      if (r.status === 'up-to-date') results.push({ ...base, outcome: 'skipped', message: `${into} já tem tudo de ${target.ref}.` });
      else if (r.status === 'conflicts') results.push({ ...base, outcome: 'conflict', message: `${r.conflicts} arquivo(s) em conflito: resolva no painel do repo.` });
      else results.push({ ...base, outcome: 'ok', message: r.status === 'fast-forward' ? `${into} avançou até ${target.ref} (fast-forward).` : `${target.ref} mergeada em ${into}.` });
    } catch (err) {
      results.push({ ...base, outcome: 'error', message: (err as Error).message });
    }
  }
  return results;
}
