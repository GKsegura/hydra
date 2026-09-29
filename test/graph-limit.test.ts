// Hydra — © 2026 José Segura (GKsegura) · MIT
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startServer } from '../src/server.ts';
import { makeFixtureRepo } from './fixture.ts';
import { tmpDir } from './helpers.ts';

describe('GET /repos/:id/graph?limit=', () => {
  it('respeita o limit, tem o teto em max e recusa valores inválidos', async () => {
    const dir = makeFixtureRepo(path.join(tmpDir('hydra-limit-'), 'r'), { commits: 60, profile: 'linear' });
    const srv = await startServer(dir, { port: 0, max: 40, recentsFile: path.join(tmpDir(), 'recents.json') });
    try {
      const id = srv.session.current().repos[0].id;
      const get = (q: string) =>
        fetch(`http://127.0.0.1:${srv.port}/api/repos/${id}/graph${q}`, { headers: { 'x-hydra-token': srv.token } });
      const body = async (q: string) => (await (await get(q)).json()) as { commits: unknown[]; truncated: boolean };

      const small = await body('?limit=10');
      expect(small.commits).toHaveLength(10);
      expect(small.truncated).toBe(true);

      const capped = await body('?limit=500'); // acima do teto: vale o max do servidor
      expect(capped.commits).toHaveLength(40);
      expect(capped.truncated).toBe(true);

      expect((await body('')).commits).toHaveLength(40); // sem parâmetro: o teto

      for (const bad of ['?limit=0', '?limit=-3', '?limit=abc', '?limit=1.5', '?limit=']) {
        expect((await get(bad)).status, bad).toBe(400);
      }
    } finally {
      srv.server.close();
    }
  });
});
