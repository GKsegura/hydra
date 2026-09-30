// Hydra — © 2026 José Segura (GKsegura) · MIT
import { readdirSync } from 'node:fs';
import os from 'node:os';
import { afterAll, describe, expect, it } from 'vitest';
import { mergeBranch, previewMerge, simulateChain } from '../src/git/index.ts';
import { cleanup, commitFile, makeRepo, sh, write } from './helpers.ts';

afterAll(cleanup);

/**
 * main → a.txt com 3 linhas.
 *  - feature/a: muda a linha 2 de a.txt para "A" e cria a-only.txt
 *  - feature/b: muda a linha 2 de a.txt para "B"           (conflita com feature/a, mas não com a main)
 *  - feature/c: só cria c.txt                               (não mexe em nada dos outros)
 * A main segue avançando com um arquivo à parte, então nenhuma delas é fast-forward.
 */
function scenarioRepo(): string {
  const repo = makeRepo();
  commitFile(repo, 'main-only.txt', 'x\n', 'main avança');
  const fork = (name: string, fn: () => void) => {
    sh(repo, 'checkout', '-q', '-b', name, 'main~1');
    fn();
    sh(repo, 'checkout', '-q', 'main');
  };
  fork('feature/a', () => {
    commitFile(repo, 'a.txt', 'linha 1\nA\nlinha 3\n', 'a muda a linha 2');
    commitFile(repo, 'a-only.txt', 'a\n', 'a cria arquivo');
  });
  fork('feature/b', () => commitFile(repo, 'a.txt', 'linha 1\nB\nlinha 3\n', 'b muda a linha 2'));
  fork('feature/c', () => commitFile(repo, 'c.txt', 'c\n', 'c cria arquivo'));
  return repo;
}

/** O que o simulador NÃO pode alterar: refs, HEAD, árvore de trabalho e os objetos do repositório. */
function fingerprint(repo: string) {
  return {
    refs: sh(repo, 'for-each-ref', '--format=%(refname) %(objectname)'),
    head: sh(repo, 'rev-parse', 'HEAD') + sh(repo, 'symbolic-ref', '-q', 'HEAD'),
    status: sh(repo, 'status', '--porcelain=v1'),
    objects: sh(repo, 'count-objects', '-v'),
    allObjects: sh(repo, 'cat-file', '--batch-all-objects', '--batch-check'),
  };
}

const scratchDirs = () => readdirSync(os.tmpdir()).filter((d) => d.startsWith('hydra-sim-')).length;

describe('simulateChain (cenários sem tocar no repositório)', () => {
  it('um merge limpo: commits que entram e commit virtual como resultado', async () => {
    const repo = scenarioRepo();
    const r = await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/c' }]);
    expect(r.stoppedAt).toBeNull();
    expect(r.base).toBe(sh(repo, 'rev-parse', 'main').trim());
    expect(r.steps[0]).toMatchObject({ state: 'ok', commits: 1, fastForward: false, upToDate: false, conflicts: [] });
    expect(r.steps[0].commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('fast-forward: a base só avança até a ref, sem commit de merge', async () => {
    const repo = makeRepo();
    sh(repo, 'checkout', '-q', '-b', 'feature/x');
    commitFile(repo, 'x.txt', 'x\n', 'x');
    sh(repo, 'checkout', '-q', 'main');
    const r = await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/x' }]);
    expect(r.steps[0]).toMatchObject({ state: 'ok', fastForward: true, commits: 1, commit: sh(repo, 'rev-parse', 'feature/x').trim() });
  });

  it('já contido: nada a fazer e a base continua a mesma', async () => {
    const repo = scenarioRepo();
    const r = await simulateChain(repo, 'main', [{ op: 'merge', ref: 'main~1' }]);
    expect(r.steps[0]).toMatchObject({ state: 'ok', upToDate: true, commits: 0, commit: r.base });
  });

  it('conflito: lista os arquivos e não gera commit', async () => {
    const repo = scenarioRepo();
    sh(repo, 'checkout', '-q', 'feature/a');
    const r = await simulateChain(repo, 'feature/a', [{ op: 'merge', ref: 'feature/b' }]);
    expect(r.stoppedAt).toBe(0);
    expect(r.steps[0]).toMatchObject({ state: 'conflict', conflicts: ['a.txt'], commit: null });
  });

  it('encadeado: o 2º passo só conflita por causa do 1º, e o 3º fica "skipped"', async () => {
    const repo = scenarioRepo();
    // sozinhos, contra a main, a e b entram sem conflito…
    expect((await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/a' }])).stoppedAt).toBeNull();
    expect((await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/b' }])).stoppedAt).toBeNull();
    // …mas b depois de a conflita
    const r = await simulateChain(repo, 'main', [
      { op: 'merge', ref: 'feature/a' },
      { op: 'merge', ref: 'feature/b' },
      { op: 'merge', ref: 'feature/c' },
    ]);
    expect(r.stoppedAt).toBe(1);
    expect(r.steps.map((s) => s.state)).toEqual(['ok', 'conflict', 'skipped']);
    expect(r.steps[1].conflicts).toEqual(['a.txt']);
    expect(r.steps[2]).toMatchObject({ commit: null, conflicts: [] });
  });

  it('cadeia limpa de vários passos: cada um parte do resultado do anterior', async () => {
    const repo = scenarioRepo();
    const r = await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/a' }, { op: 'merge', ref: 'feature/c' }]);
    expect(r.stoppedAt).toBeNull();
    // o commit do passo 2 tem o do passo 1 como pai (é o resultado virtual encadeado)
    // — os objetos virtuais já foram apagados, então só conferimos que os dois são distintos e existem como shas
    expect(new Set(r.steps.map((s) => s.commit)).size).toBe(2);
  });

  it('a base pode ser outra branch, sem fazer checkout', async () => {
    const repo = scenarioRepo();
    sh(repo, 'checkout', '-q', 'feature/c'); // HEAD em outra branch
    const before = sh(repo, 'rev-parse', 'HEAD');
    const r = await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/a' }]);
    expect(r.base).toBe(sh(repo, 'rev-parse', 'main').trim());
    expect(r.steps[0].state).toBe('ok');
    expect(sh(repo, 'rev-parse', 'HEAD')).toBe(before);
  });

  it('não deixa rastro: refs, HEAD, árvore de trabalho e objetos do repositório ficam idênticos', async () => {
    const repo = scenarioRepo();
    write(repo, 'sujo.txt', 'alteração não commitada\n'); // a área de trabalho suja também não pode mudar
    const before = fingerprint(repo);
    const dirs = scratchDirs();
    await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/a' }, { op: 'merge', ref: 'feature/b' }, { op: 'merge', ref: 'feature/c' }]);
    await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/c' }]);
    expect(fingerprint(repo)).toEqual(before);
    expect(scratchDirs()).toBe(dirs); // a pasta temporária de objetos foi apagada
  });

  it('funciona em repositório sem user.name/user.email configurados', async () => {
    const repo = scenarioRepo();
    sh(repo, 'config', '--local', '--unset', 'user.name');
    sh(repo, 'config', '--local', '--unset', 'user.email');
    const r = await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/c' }]);
    expect(r.steps[0].state).toBe('ok');
  });

  it('prevê o mesmo que o merge de verdade', async () => {
    const repo = scenarioRepo();
    const sim = await simulateChain(repo, 'main', [{ op: 'merge', ref: 'feature/a' }, { op: 'merge', ref: 'feature/b' }]);
    expect(sim.steps.map((s) => s.state)).toEqual(['ok', 'conflict']);
    expect((await mergeBranch(repo, 'feature/a')).status).toBe('merged');
    expect((await mergeBranch(repo, 'feature/b')).status).toBe('conflicts');
  });

  it('ref inexistente (base ou passo) lança erro claro e não simula nada', async () => {
    const repo = scenarioRepo();
    await expect(simulateChain(repo, 'main', [{ op: 'merge', ref: 'nao-existe' }])).rejects.toThrow(/não encontrada/);
    await expect(simulateChain(repo, 'sem-base', [{ op: 'merge', ref: 'feature/a' }])).rejects.toThrow(/não encontrada/);
    await expect(simulateChain(repo, 'main', [{ op: 'merge', ref: '--force' }])).rejects.toThrow(/não encontrada/);
  });

  it('sem passos, só devolve a base', async () => {
    const repo = scenarioRepo();
    expect(await simulateChain(repo, 'main', [])).toMatchObject({ steps: [], stoppedAt: null });
  });
});

describe('previewMerge com base', () => {
  it('sem base continua contra a branch atual; com base, contra ela, sem checkout', async () => {
    const repo = scenarioRepo();
    sh(repo, 'checkout', '-q', 'feature/a');
    const contraAtual = await previewMerge(repo, 'feature/b'); // HEAD = feature/a → conflita
    expect(contraAtual.conflicts).toEqual(['a.txt']);
    const contraMain = await previewMerge(repo, 'feature/b', 'main'); // main não tem a mudança de a → limpo
    expect(contraMain.conflicts).toEqual([]);
    expect(contraMain.commits).toBe(1);
    expect(sh(repo, 'symbolic-ref', '--short', 'HEAD').trim()).toBe('feature/a');
  });

  it('base inexistente lança erro', async () => {
    const repo = scenarioRepo();
    await expect(previewMerge(repo, 'feature/a', 'nao-existe')).rejects.toThrow(/não encontrada/);
  });
});
