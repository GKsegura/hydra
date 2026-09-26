// Hydra — © 2026 José Segura (GKsegura) · MIT
import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { commitMany } from '../src/multi.ts';
import type { Repo } from '../src/workspace.ts';
import { cleanup, makeRepo, sh, write } from './helpers.ts';

afterAll(cleanup);

const repoAt = (id: string, dir: string): Repo => ({ id, name: id.toUpperCase(), path: dir });
const lastSubject = (dir: string) => sh(dir, 'log', '-1', '--format=%s').trim();

describe('commitMany (commit no workspace)', () => {
  it('commita com a mesma mensagem, respeitando o stage de cada repo', async () => {
    const api = makeRepo();
    const app = makeRepo();
    const bot = makeRepo();
    write(api, 'a.txt', 'api mudou\n');
    sh(api, 'add', 'a.txt'); // em stage
    write(app, 'a.txt', 'app mudou\n'); // não está em stage: "incluir tudo"
    // bot: nada mudou

    const results = await commitMany(
      [{ repo: repoAt('api', api), stageAll: false }, { repo: repoAt('app', app), stageAll: true }, { repo: repoAt('bot', bot), stageAll: false }],
      'feat: mesma feature nos repos',
      'corpo',
    );

    expect(results.map((r) => [r.id, r.outcome])).toEqual([['api', 'ok'], ['app', 'ok'], ['bot', 'skipped']]);
    expect(lastSubject(api)).toBe('feat: mesma feature nos repos');
    expect(lastSubject(app)).toBe('feat: mesma feature nos repos');
    expect(lastSubject(bot)).toBe('inicial');
    expect(results[0].hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it('sem "incluir tudo", o que não está em stage fica de fora', async () => {
    const dir = makeRepo();
    write(dir, 'a.txt', 'mudou mas não está em stage\n');
    const [r] = await commitMany([{ repo: repoAt('x', dir), stageAll: false }], 'feat: nada', '');
    expect(r.outcome).toBe('skipped');
    expect(lastSubject(dir)).toBe('inicial');
  });

  it('um repo que falha (hook pre-commit) não impede os outros', async () => {
    const bad = makeRepo();
    const good = makeRepo();
    const hook = path.join(bad, '.git', 'hooks', 'pre-commit');
    writeFileSync(hook, '#!/bin/sh\necho "lint falhou" >&2\nexit 1\n');
    chmodSync(hook, 0o755);
    write(bad, 'a.txt', 'x\n');
    write(good, 'a.txt', 'y\n');

    const results = await commitMany([{ repo: repoAt('bad', bad), stageAll: true }, { repo: repoAt('good', good), stageAll: true }], 'fix: teste', '');
    expect(results[0].outcome).toBe('error');
    expect(results[0].message).toMatch(/lint falhou|hook|pre-commit/i);
    expect(results[1].outcome).toBe('ok');
    expect(lastSubject(good)).toBe('fix: teste');
    expect(lastSubject(bad)).toBe('inicial');
  });

  it('repo com merge em andamento é pulado', async () => {
    const dir = makeRepo();
    sh(dir, 'checkout', '-q', '-b', 'outra');
    write(dir, 'a.txt', 'outra\n');
    sh(dir, 'commit', '-qam', 'outra');
    sh(dir, 'checkout', '-q', 'main');
    write(dir, 'a.txt', 'main\n');
    sh(dir, 'commit', '-qam', 'main');
    try {
      sh(dir, 'merge', 'outra');
    } catch {
      /* conflito esperado */
    }
    const [r] = await commitMany([{ repo: repoAt('m', dir), stageAll: true }], 'feat: x', '');
    expect(r.outcome).toBe('skipped');
    expect(r.message).toMatch(/andamento/);
  });
});
