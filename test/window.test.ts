// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import { visibleRange } from '../web/src/window.ts';

const base = { rowHeight: 20, viewport: 200, total: 1000, top: 26, buffer: 5 };

describe('visibleRange (virtualização)', () => {
  it('no topo, começa na linha 0 e cobre a janela mais o buffer', () => {
    // (0 - 26 + 200) / 20 = 8,7 → 9, +5
    expect(visibleRange({ ...base, scrollTop: 0 })).toEqual({ start: 0, end: 14 });
  });

  it('no meio, recua o buffer antes da primeira linha visível', () => {
    // primeira visível: (2026 - 26) / 20 = 100 → start 95; última: (2000 + 200) / 20 = 110 → end 115
    expect(visibleRange({ ...base, scrollTop: 2026 })).toEqual({ start: 95, end: 115 });
  });

  it('no fim da lista, não passa do total', () => {
    const r = visibleRange({ ...base, scrollTop: 100_000 });
    expect(r.end).toBe(1000);
    expect(r.start).toBeLessThanOrEqual(1000);
  });

  it('lista vazia ou menor que a janela renderiza tudo o que existe', () => {
    expect(visibleRange({ ...base, total: 0, scrollTop: 0 })).toEqual({ start: 0, end: 0 });
    expect(visibleRange({ ...base, total: 4, scrollTop: 0 })).toEqual({ start: 0, end: 4 });
  });

  it('a área acima (cabeçalho + WIP) desloca a janela', () => {
    const semWip = visibleRange({ ...base, scrollTop: 1000 });
    const comWip = visibleRange({ ...base, top: base.top + 20, scrollTop: 1000 });
    expect(comWip.start).toBe(semWip.start - 1);
  });

  it('a janela renderizada é pequena mesmo com dezenas de milhares de linhas', () => {
    const { start, end } = visibleRange({ ...base, total: 30_000, scrollTop: 300_000, buffer: 30 });
    expect(end - start).toBeLessThan(100);
  });
});
