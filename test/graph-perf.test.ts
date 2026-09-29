// Hydra — © 2026 José Segura (GKsegura) · MIT
// Limites estruturais do grafo em repositórios grandes. Não testa tempo absoluto (git + disco variam demais entre
// máquinas): mede e imprime, e só falha em regressões de estrutura (tamanho da carga, coerência do layout).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { repoGraph } from '../src/data.ts';
import type { Repo } from '../src/workspace.ts';
import { makeFixtureRepo, type FixtureProfile } from './fixture.ts';
import { tmpDir } from './helpers.ts';

const COMMITS = 2_000;

function count(dir: string): number {
  return Number(execFileSync('git', ['rev-list', '--all', '--count'], { cwd: dir, encoding: 'utf8' }).trim());
}

describe.each<FixtureProfile>(['linear', 'merges'])('grafo em repositório grande (%s)', (profile) => {
  let repo: Repo;
  let dir: string;

  beforeAll(() => {
    dir = makeFixtureRepo(path.join(tmpDir('hydra-fixture-'), 'big'), { commits: COMMITS, profile });
    repo = { id: 'big', name: 'big', path: dir };
  });

  it('a fixture tem o número de commits pedido', () => {
    expect(count(dir)).toBe(COMMITS);
  });

  it('carrega no máximo `max` commits e marca como truncado', async () => {
    const g = await repoGraph(repo, 250);
    expect(g.commits).toHaveLength(250);
    expect(g.truncated).toBe(true);
    expect(g.layout.nodes).toHaveLength(250);
  });

  it('carregando tudo, não trunca e cada node aponta para uma linha válida', async () => {
    const t0 = performance.now();
    const g = await repoGraph(repo, COMMITS + 10);
    const ms = Math.round(performance.now() - t0);
    const bytes = Buffer.byteLength(JSON.stringify(g));
    console.log(`[perf] ${profile}: ${g.commits.length} commits, repoGraph ${ms} ms, JSON ${(bytes / 1024).toFixed(0)} KB`);
    expect(g.truncated).toBe(false);
    expect(g.layout.nodes).toHaveLength(g.commits.length);
    for (const e of g.layout.edges) expect(e.toRow).toBeLessThanOrEqual(g.commits.length);
  });
});
