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

/** Data do commit mais antigo já carregado de um repo que ainda tem mais commits; null se ele está completo/vazio. */
const oldestLoaded = (g: RepoGraph | undefined): number | null => (g?.truncated && g.commits.length ? g.commits[g.commits.length - 1].time : null);

/**
 * Repo que limita até onde a timeline está completa: entre os repos com mais commits a carregar, o que parou
 * na data mais recente. Carregar mais dele é o que faz a timeline avançar para trás. Null se todos estão completos.
 */
export function limitingRepo(graphs: Record<string, RepoGraph | undefined>, repoIds: string[]): string | null {
  let best: string | null = null;
  let bestTime = -Infinity;
  for (const id of repoIds) {
    const t = oldestLoaded(graphs[id]);
    if (t !== null && t > bestTime) [best, bestTime] = [id, t];
  }
  return best;
}

/**
 * Junta os commits dos repos em `repoIds` (na ordem dos painéis) e ordena por data, mais recente primeiro.
 * Em datas iguais, mantém a ordem dos painéis e, dentro do repo, a ordem do `git log` (filhos antes dos pais).
 * Repos sem grafo carregado são ignorados.
 * Com `partial` (padrão), commits mais antigos que o ponto até onde todos os repos estão carregados ficam de fora:
 * a lista só é confiável até ali, e ao carregar mais os commits novos entram sempre no fim (sem reordenar o que já se vê).
 * Passe `partial = false` quando não há como carregar mais (HTML estático).
 */
export function mergeTimeline(graphs: Record<string, RepoGraph | undefined>, repoIds: string[], partial = true): TimelineEntry[] {
  const limit = partial ? oldestLoaded(graphs[limitingRepo(graphs, repoIds) ?? '']) ?? -Infinity : -Infinity;
  const entries: (TimelineEntry & { index: number })[] = [];
  repoIds.forEach((repoId, lane) => {
    graphs[repoId]?.commits.forEach((commit, index) => {
      if (commit.time >= limit) entries.push({ repoId, commit, lane, index });
    });
  });
  entries.sort((a, b) => b.commit.time - a.commit.time || a.lane - b.lane || a.index - b.index);
  return entries.map(({ repoId, commit, lane }) => ({ repoId, commit, lane }));
}
