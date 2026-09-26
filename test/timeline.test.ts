// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import type { RepoGraph } from '../src/data.ts';
import type { Commit } from '../src/git/index.ts';
import { mergeTimeline } from '../web/src/timeline.ts';

const commit = (hash: string, time: number): Commit => ({ hash, parents: [], author: 'T', email: 't@t', time, subject: hash, refs: [] });
const graph = (...commits: Commit[]): RepoGraph => ({
  commits,
  layout: { nodes: [], edges: [], width: 1 },
  refs: { local: [], remote: [], tags: [] },
  truncated: false,
});

describe('mergeTimeline (timeline unificada)', () => {
  const graphs = {
    api: graph(commit('a3', 300), commit('a1', 100)),
    app: graph(commit('b4', 400), commit('b2', 200)),
    bot: graph(commit('c3', 300)),
  };

  it('junta os repos e ordena do mais recente para o mais antigo', () => {
    const t = mergeTimeline(graphs, ['api', 'app']);
    expect(t.map((e) => e.commit.hash)).toEqual(['b4', 'a3', 'b2', 'a1']);
    expect(t.map((e) => e.repoId)).toEqual(['app', 'api', 'app', 'api']);
  });

  it('a faixa é a posição do repo na lista de painéis', () => {
    const t = mergeTimeline(graphs, ['app', 'api']);
    expect(t.find((e) => e.commit.hash === 'a3')?.lane).toBe(1);
    expect(t.find((e) => e.commit.hash === 'b4')?.lane).toBe(0);
  });

  it('em datas iguais, segue a ordem dos painéis', () => {
    expect(mergeTimeline(graphs, ['bot', 'api']).slice(0, 2).map((e) => e.commit.hash)).toEqual(['c3', 'a3']);
    expect(mergeTimeline(graphs, ['api', 'bot']).slice(0, 2).map((e) => e.commit.hash)).toEqual(['a3', 'c3']);
  });

  it('dentro do mesmo repo, mantém a ordem do git log quando a data empata', () => {
    const t = mergeTimeline({ x: graph(commit('filho', 500), commit('pai', 500)) }, ['x']);
    expect(t.map((e) => e.commit.hash)).toEqual(['filho', 'pai']);
  });

  it('só entram os repos pedidos (visíveis) e os que já têm grafo', () => {
    const t = mergeTimeline({ ...graphs, vazio: graph() }, ['api', 'vazio', 'sem-grafo']);
    expect(t.map((e) => e.commit.hash)).toEqual(['a3', 'a1']);
  });
});
