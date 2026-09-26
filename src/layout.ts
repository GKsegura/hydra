// Hydra — © 2026 José Segura (GKsegura) · MIT
import type { Commit } from './git/index.ts';

export const PALETTE_SIZE = 10;

export interface Node {
  row: number;
  col: number;
  color: number;
}

/**
 * Uma aresta liga um commit (filho) a um dos seus pais e "viaja" por uma lane.
 * - normal (1º pai): desce pela lane do filho e, se o pai estiver em outra coluna, curva na última linha.
 * - merge (demais pais): curva logo na linha seguinte para a lane do pai e desce por ela.
 * Pais fora da lista (limite de --max) têm toRow = número de linhas: a linha vai até o fim.
 */
export interface Edge {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
  lane: number;
  color: number;
  merge: boolean;
}

export interface GraphLayout {
  nodes: Node[];
  edges: Edge[];
  width: number;
}

export function layout(commits: Commit[]): GraphLayout {
  const lanes: (string | null)[] = [];
  const laneColor: number[] = [];
  let nextColor = 0;
  const nodes: Node[] = [];
  const pending: { fromRow: number; fromCol: number; lane: number; color: number; merge: boolean; parent: string }[] = [];

  const openLane = (hash: string, avoid = -1): number => {
    let col = lanes.findIndex((h, i) => h === null && i !== avoid);
    if (col === -1) col = lanes.length;
    lanes[col] = hash;
    laneColor[col] = nextColor++ % PALETTE_SIZE;
    return col;
  };

  commits.forEach((c, row) => {
    let col = lanes.indexOf(c.hash);
    if (col === -1) col = openLane(c.hash); // ponta de branch: ninguém esperava esse commit

    // Outras lanes que também esperavam este commit convergem aqui.
    for (let i = 0; i < lanes.length; i++) if (i !== col && lanes[i] === c.hash) lanes[i] = null;

    const color = laneColor[col];
    nodes.push({ row, col, color });

    const [first, ...others] = c.parents;
    if (first === undefined) {
      lanes[col] = null; // commit raiz: a lane termina
    } else {
      lanes[col] = first;
      pending.push({ fromRow: row, fromCol: col, lane: col, color, merge: false, parent: first });
    }

    for (const p of others) {
      let lane = lanes.indexOf(p);
      if (lane === -1) lane = openLane(p, col);
      pending.push({ fromRow: row, fromCol: col, lane, color: laneColor[lane], merge: true, parent: p });
    }
  });

  const rowOf = new Map(commits.map((c, i) => [c.hash, i]));
  const edges: Edge[] = pending.map(({ parent, ...e }) => {
    const toRow = rowOf.get(parent);
    return toRow === undefined
      ? { ...e, toRow: commits.length, toCol: e.lane }
      : { ...e, toRow, toCol: nodes[toRow].col };
  });

  return { nodes, edges, width: Math.max(1, lanes.length) };
}
