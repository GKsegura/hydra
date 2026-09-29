// Hydra — © 2026 José Segura (GKsegura) · MIT
// Virtualização das listas de commits: com altura de linha fixa, dá para saber só pela rolagem quais linhas
// aparecem. Função pura (sem Vue nem DOM) para ser testada no Node.

export interface RangeInput {
  /** scrollTop do contêiner rolável. */
  scrollTop: number;
  /** Altura visível do contêiner. */
  viewport: number;
  rowHeight: number;
  /** Total de linhas da lista. */
  total: number;
  /** Pixels que ficam acima da linha 0 dentro da área rolável (cabeçalho fixo, linha de WIP…). */
  top: number;
  /** Linhas extras renderizadas antes e depois da janela, para a rolagem rápida não mostrar vazio. */
  buffer: number;
}

/** Intervalo [start, end) de linhas a renderizar. */
export function visibleRange({ scrollTop, viewport, rowHeight, total, top, buffer }: RangeInput): { start: number; end: number } {
  const clamp = (n: number) => Math.min(Math.max(n, 0), total);
  const first = Math.floor((scrollTop - top) / rowHeight);
  const last = Math.ceil((scrollTop - top + viewport) / rowHeight);
  const start = clamp(first - buffer);
  return { start, end: Math.max(start, clamp(last + buffer)) };
}
