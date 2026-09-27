// Hydra — © 2026 José Segura (GKsegura) · MIT
import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { branchOverview, checkoutMany, commitMany, createMany, mergeMany, previewMany } from '../src/multi.ts';
import type { Repo } from '../src/workspace.ts';
import { cleanup, commitFile, makeRemotePair, makeRepo, sh, write } from './helpers.ts';

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

describe('branches em vários repos', () => {
  const current = (dir: string) => sh(dir, 'branch', '--show-current').trim();

  it('cria a mesma branch em todos e pula onde ela já existe', async () => {
    const a = makeRepo();
    const b = makeRepo();
    sh(b, 'branch', 'feature/x');
    const results = await createMany([{ repo: repoAt('a', a) }, { repo: repoAt('b', b) }], 'feature/x', true);
    expect(results.map((r) => r.outcome)).toEqual(['ok', 'skipped']);
    expect(current(a)).toBe('feature/x');
    expect(current(b)).toBe('main'); // já existia: não foi trocada
  });

  it('nome inválido vira erro por repo, sem derrubar a operação', async () => {
    const a = makeRepo();
    const [r] = await createMany([{ repo: repoAt('a', a) }], 'nome com..pontos', true);
    expect(r.outcome).toBe('error');
  });

  it('troca todos: cria onde não existe, guarda alterações num stash e rastreia branch só remota', async () => {
    const withBranch = makeRepo();
    sh(withBranch, 'branch', 'feature/x');
    const dirty = makeRepo();
    sh(dirty, 'branch', 'feature/x');
    write(dirty, 'a.txt', 'trabalho em andamento\n');
    const missing = makeRepo();
    const { remote, work } = makeRemotePair();
    // A branch existe só no remoto do "work".
    const other = path.join(path.dirname(remote), 'other');
    sh(path.dirname(remote), 'clone', '-q', remote, other);
    // Identidade própria do clone: no CI não existe user.name/user.email global.
    sh(other, 'config', 'user.name', 'Teste Hydra');
    sh(other, 'config', 'user.email', 'teste@hydra.local');
    sh(other, 'checkout', '-q', '-b', 'feature/x');
    commitFile(other, 'r.txt', 'remoto\n', 'no remoto');
    sh(other, 'push', '-q', 'origin', 'feature/x');
    sh(work, 'fetch', '-q');

    const results = await checkoutMany([
      { repo: repoAt('com', withBranch), mode: 'carry', create: false },
      { repo: repoAt('sujo', dirty), mode: 'stash', create: false },
      { repo: repoAt('sem', missing), mode: 'carry', create: true },
      { repo: repoAt('remoto', work), mode: 'carry', create: false },
    ], 'feature/x');

    expect(results.map((r) => r.outcome)).toEqual(['ok', 'ok', 'ok', 'ok']);
    for (const dir of [withBranch, dirty, missing, work]) expect(current(dir)).toBe('feature/x');
    expect(results[1].message).toMatch(/stash/);
    expect(sh(dirty, 'stash', 'list')).toMatch(/hydra: alterações de main/);
    expect(results[3].message).toMatch(/rastreando/);
    expect(sh(work, 'rev-parse', '--abbrev-ref', 'feature/x@{upstream}').trim()).toBe('origin/feature/x');
  });

  it('sem "criar", repo sem a branch é pulado', async () => {
    const a = makeRepo();
    const [r] = await checkoutMany([{ repo: repoAt('a', a), mode: 'carry', create: false }], 'nao-existe');
    expect(r.outcome).toBe('skipped');
    expect(current(a)).toBe('main');
  });

  it('prévia e merge: um repo mergeia, outro para em conflito, outro não tem a branch', async () => {
    const clean = makeRepo();
    sh(clean, 'checkout', '-q', '-b', 'feature/x');
    commitFile(clean, 'novo.txt', 'feature\n', 'feature');
    sh(clean, 'checkout', '-q', 'main');

    const conflict = makeRepo();
    sh(conflict, 'checkout', '-q', '-b', 'feature/x');
    commitFile(conflict, 'a.txt', 'versão da feature\n', 'feature');
    sh(conflict, 'checkout', '-q', 'main');
    commitFile(conflict, 'a.txt', 'versão da main\n', 'main');

    const without = makeRepo();
    const repos = [repoAt('limpo', clean), repoAt('conflito', conflict), repoAt('sem', without)];

    const preview = await previewMany(repos, 'feature/x');
    expect(preview[0].preview).toMatchObject({ commits: 1, fastForward: true, conflicts: [] });
    expect(preview[1].preview?.conflicts).toEqual(['a.txt']);
    expect(preview[2].reason).toMatch(/não existe/);

    const results = await mergeMany(repos, 'feature/x', false);
    expect(results.map((r) => r.outcome)).toEqual(['ok', 'conflict', 'skipped']);
    expect(sh(clean, 'log', '-1', '--format=%s').trim()).toBe('feature');
    expect((await branchOverview([repoAt('conflito', conflict)]))[0].operation).toBe('merge');
  });
});
