// Hydra — © 2026 José Segura (GKsegura) · MIT
// Timeline unificada: os commits de vários repos numa lista só, do mais recente para o mais antigo.
// Função pura (sem Vue nem DOM) para ser testada no Node; importa os tipos direto do back-end.
import type { RepoGraph } from '../../src/data.ts';
import type { Commit } from '../../src/git/index.ts';

export interface TimelineEntry {
  repoId: string;
  commit: Commit;
  /** Posição do repo em `repoIds`: a faixa (coluna) onde a bolinha do commit é desenhada. */
  lane: number;
}

/**
 * Junta os commits dos repos em `repoIds` (na ordem dos painéis) e ordena por data, mais recente primeiro.
 * Em datas iguais, mantém a ordem dos painéis e, dentro do repo, a ordem do `git log` (filhos antes dos pais).
 * Repos sem grafo carregado são ignorados.
 */
export function mergeTimeline(graphs: Record<string, RepoGraph | undefined>, repoIds: string[]): TimelineEntry[] {
  const entries: (TimelineEntry & { index: number })[] = [];
  repoIds.forEach((repoId, lane) => {
    graphs[repoId]?.commits.forEach((commit, index) => entries.push({ repoId, commit, lane, index }));
  });
  entries.sort((a, b) => b.commit.time - a.commit.time || a.lane - b.lane || a.index - b.index);
  return entries.map(({ repoId, commit, lane }) => ({ repoId, commit, lane }));
}
