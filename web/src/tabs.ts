// Hydra — © 2026 José Segura (GKsegura) · MIT
// Guias em segundo plano: depois de um tempo sem uso, soltam os dados pesados (grafos, branches) para não somar memória.
// Função pura (sem Vue nem DOM) para ser testada no Node.

/** Só o que a varredura precisa saber de uma guia guardada. */
export interface ParkedTab {
  values: {
    fields: {
      graphs: Record<string, unknown>;
      graphLimit: Record<string, number>;
      loadingMore: Record<string, boolean>;
      branchInfo: Record<string, unknown>;
    };
  };
  /** Quando a guia saiu de cena. */
  parkedAt: number;
  /** Desatualizada: recarrega ao abrir. */
  stale: boolean;
  /** Já teve os grafos soltos (não varre de novo). */
  unloaded: boolean;
}

/** Tempo sem uso até soltar os grafos de uma guia em segundo plano. */
export const INACTIVE_MS = 5 * 60_000;

/**
 * Solta os grafos e as listas de branches das guias paradas há mais de `maxAgeMs` e as marca como desatualizadas,
 * para recarregarem (com a carga inicial) quando forem abertas. Mantém o resto: painéis, tamanhos, seleção, rascunhos.
 * Devolve os ids que foram soltos.
 */
export function unloadIdleTabs(tabs: Map<string, ParkedTab>, now: number, maxAgeMs = INACTIVE_MS): string[] {
  const unloaded: string[] = [];
  for (const [id, tab] of tabs) {
    if (tab.unloaded || now - tab.parkedAt < maxAgeMs) continue;
    const f = tab.values.fields;
    f.graphs = {};
    f.graphLimit = {};
    f.loadingMore = {};
    f.branchInfo = {};
    tab.stale = true;
    tab.unloaded = true;
    unloaded.push(id);
  }
  return unloaded;
}
