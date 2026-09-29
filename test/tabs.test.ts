// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import { INACTIVE_MS, unloadIdleTabs, type ParkedTab } from '../web/src/tabs.ts';

const tab = (parkedAt: number, extra: Partial<ParkedTab> = {}): ParkedTab => ({
  values: {
    fields: {
      graphs: { api: { commits: [1, 2, 3] } },
      graphLimit: { api: 500 },
      loadingMore: { api: true },
      branchInfo: { api: {} },
    },
  },
  parkedAt,
  stale: false,
  unloaded: false,
  ...extra,
});

describe('unloadIdleTabs (guias em segundo plano)', () => {
  it('solta os grafos e branches de quem passou do prazo e marca como desatualizada', () => {
    const tabs = new Map([['velha', tab(0)]]);
    expect(unloadIdleTabs(tabs, INACTIVE_MS + 1)).toEqual(['velha']);
    const t = tabs.get('velha')!;
    expect(t.values.fields).toEqual({ graphs: {}, graphLimit: {}, loadingMore: {}, branchInfo: {} });
    expect(t.stale).toBe(true);
    expect(t.unloaded).toBe(true);
  });

  it('não mexe em quem saiu há pouco', () => {
    const tabs = new Map([['recente', tab(1000)]]);
    expect(unloadIdleTabs(tabs, 1000 + INACTIVE_MS - 1)).toEqual([]);
    expect(tabs.get('recente')!.values.fields.graphs).not.toEqual({});
    expect(tabs.get('recente')!.stale).toBe(false);
  });

  it('não varre de novo uma guia já solta', () => {
    const tabs = new Map([['a', tab(0, { unloaded: true })]]);
    expect(unloadIdleTabs(tabs, INACTIVE_MS * 10)).toEqual([]);
  });

  it('respeita um prazo próprio e trata cada guia separadamente', () => {
    const tabs = new Map([['a', tab(0)], ['b', tab(9000)]]);
    expect(unloadIdleTabs(tabs, 10_000, 5000)).toEqual(['a']);
    expect(tabs.get('b')!.unloaded).toBe(false);
  });
});
