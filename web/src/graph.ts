// Hydra — © 2026 José Segura (GKsegura) · MIT
import type { Edge } from './types.ts';
import { COL, PAD, ROW } from './utils.ts';

export const laneX = (col: number) => PAD + col * COL;
export const rowY = (row: number, off: number) => (row + off) * ROW + ROW / 2;

/**
 * Converte uma aresta do layout em path SVG:
 * - 1º pai: desce pela lane e curva na última linha se o pai estiver em outra coluna;
 * - merge: curva logo na linha seguinte para a lane do pai e desce por ela.
 */
export function edgePath(e: Edge, off: number): string {
  const x1 = laneX(e.fromCol);
  const y1 = rowY(e.fromRow, off);
  const xl = laneX(e.lane);
  const x2 = laneX(e.toCol);
  const y2 = rowY(e.toRow, off);
  const curve = (ax: number, ay: number, bx: number, by: number) => {
    const my = (ay + by) / 2;
    return `C${ax} ${my} ${bx} ${my} ${bx} ${by}`;
  };

  if (e.toRow <= e.fromRow + 1) return `M${x1} ${y1} ${x1 === x2 ? `L${x2} ${y2}` : curve(x1, y1, x2, y2)}`;

  let d = `M${x1} ${y1}`;
  let cy = y1;
  if (e.merge && x1 !== xl) {
    cy = rowY(e.fromRow + 1, off);
    d += curve(x1, y1, xl, cy);
  }
  const yb = rowY(e.toRow - 1, off);
  if (yb > cy) d += `L${xl} ${yb}`;
  d += xl === x2 ? `L${x2} ${y2}` : curve(xl, Math.max(yb, cy), x2, y2);
  return d;
}
