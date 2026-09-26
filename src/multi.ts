// Hydra — © 2026 José Segura (GKsegura) · MIT
// Operações em vários repositórios do workspace de uma vez. Cada repo é independente: um que falha não desfaz os outros.
import { commit, getStatus, stage } from './git/index.ts';
import type { Repo } from './workspace.ts';

export interface RepoResult {
  id: string;
  name: string;
  /** `ok`: feito · `skipped`: nada a fazer (ex.: nada em stage) · `error`: o git recusou. */
  outcome: 'ok' | 'skipped' | 'error';
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
