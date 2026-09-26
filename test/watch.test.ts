// Hydra — © 2026 José Segura (GKsegura) · MIT
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { classifyChange, RepoWatchers, type RepoChange } from '../src/watch.ts';
import { cleanup, commitFile, makeRepo, sh, write } from './helpers.ts';

afterAll(cleanup);

describe('classifyChange', () => {
  it('reconhece o que muda o repo, o que muda só o status e o que é ruído', () => {
    expect(classifyChange('.git/HEAD')).toBe('repo');
    expect(classifyChange('.git\\index')).toBe('repo');
    expect(classifyChange('.git/refs/heads/main')).toBe('repo');
    expect(classifyChange('.git/rebase-merge/done')).toBe('repo');
    expect(classifyChange('.git/objects/ab/cdef')).toBeNull();
    expect(classifyChange('.git/logs/HEAD')).toBeNull();
    expect(classifyChange('.git/index.lock')).toBeNull();
    expect(classifyChange('src/app.ts')).toBe('status');
    expect(classifyChange('web/node_modules/x/index.js')).toBeNull();
    expect(classifyChange(null)).toBe('repo');
  });
});

describe('RepoWatchers', () => {
  let watchers: RepoWatchers | null = null;
  afterEach(() => watchers?.close());

  /** Observa um repo temporário e junta os avisos que chegarem. */
  function observe(dir: string) {
    watchers = new RepoWatchers();
    const changes: RepoChange[] = [];
    watchers.subscribe((c) => changes.push(c));
    watchers.watch([{ id: 'r1', name: 'repo', path: dir }]);
    return changes;
  }
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function until(check: () => boolean, ms = 5000) {
    const end = Date.now() + ms;
    while (!check()) {
      if (Date.now() > end) throw new Error('tempo esgotado esperando o aviso');
      await wait(50);
    }
  }

  it('um commit feito por fora vira um aviso só, do tipo "repo"', async () => {
    const dir = makeRepo();
    const changes = observe(dir);
    await wait(200);
    commitFile(dir, 'b.txt', 'novo\n', 'commit feito por fora');
    await until(() => changes.length > 0);
    await wait(900); // o debounce não deixa sair um segundo aviso do mesmo commit
    expect(changes).toEqual([{ repoId: 'r1', kind: 'repo' }]);
  });

  it('salvar um arquivo avisa só o status', async () => {
    const dir = makeRepo();
    const changes = observe(dir);
    await wait(200);
    write(dir, 'a.txt', 'editado\n');
    await until(() => changes.length > 0);
    expect(changes[0]).toEqual({ repoId: 'r1', kind: 'status' });
  });

  it('mudanças só em .git/objects não avisam', async () => {
    const dir = makeRepo();
    const changes = observe(dir);
    await wait(200);
    writeFileSync(path.join(dir, '.git', 'objects', 'ruido'), 'x');
    await wait(900);
    expect(changes).toEqual([]);
  });

  it('depois de close() nada mais é avisado', async () => {
    const dir = makeRepo();
    const changes = observe(dir);
    watchers!.close();
    sh(dir, 'checkout', '-q', '-b', 'outra');
    await wait(900);
    expect(changes).toEqual([]);
  });
});
