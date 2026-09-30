// Hydra — © 2026 José Segura (GKsegura) · MIT
// Cherry-pick e rebase na simulação de cenários (o merge está em simulate.test.ts).
import { readdirSync } from 'node:fs';
import os from 'node:os';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_REBASE_COMMITS, simulateChain } from '../src/git/index.ts';
import { cleanup, commitFile, makeRepo, sh, write } from './helpers.ts';

afterAll(cleanup);

/**
 * main: a.txt (3 linhas) + main-only.txt
 *  - feature/p (a partir de main~1): p1 muda a linha 2 de a.txt para "P"; p2 cria p2.txt
 *  - feature/q (a partir de main~1): q1 muda a linha 2 para "Q" (conflita com p1)
 */
function pickRepo(): { repo: string; p1: string; p2: string; q1: string } {
  const repo = makeRepo();
  commitFile(repo, 'main-only.txt', 'x\n', 'main avança');
  sh(repo, 'checkout', '-q', '-b', 'feature/p', 'main~1');
  commitFile(repo, 'a.txt', 'linha 1\nP\nlinha 3\n', 'p1');
  commitFile(repo, 'p2.txt', 'p2\n', 'p2');
  sh(repo, 'checkout', '-q', '-b', 'feature/q', 'main~1');
  commitFile(repo, 'a.txt', 'linha 1\nQ\nlinha 3\n', 'q1');
  sh(repo, 'checkout', '-q', 'main');
  const rev = (r: string) => sh(repo, 'rev-parse', r).trim();
  return { repo, p1: rev('feature/p~1'), p2: rev('feature/p'), q1: rev('feature/q') };
}

/** O que o simulador NÃO pode alterar: refs, HEAD, árvore de trabalho e os objetos do repositório. */
function fingerprint(repo: string) {
  return {
    refs: sh(repo, 'for-each-ref', '--format=%(refname) %(objectname)'),
    head: sh(repo, 'rev-parse', 'HEAD') + sh(repo, 'symbolic-ref', '-q', 'HEAD'),
    status: sh(repo, 'status', '--porcelain=v1'),
    allObjects: sh(repo, 'cat-file', '--batch-all-objects', '--batch-check'),
  };
}
const scratchDirs = () => readdirSync(os.tmpdir()).filter((d) => d.startsWith('hydra-sim-')).length;

describe('cherry-pick simulado', () => {
  it('commit independente entra limpo; o mesmo commit já aplicado vira "nada a fazer"', async () => {
    const { repo, p2 } = pickRepo();
    const r = await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: p2 }]);
    expect(r.steps[0]).toMatchObject({ op: 'cherry-pick', state: 'ok', commits: 1, fastForward: false, upToDate: false });

    const again = await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: p2 }, { op: 'cherry-pick', ref: p2 }]);
    expect(again.steps[1]).toMatchObject({ state: 'ok', upToDate: true, commits: 0, note: 'o commit já estava aplicado' });
  });

  it('encadeado: o 2º cherry-pick conflita por causa do 1º', async () => {
    const { repo, p1, q1 } = pickRepo();
    expect((await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: q1 }])).stoppedAt).toBeNull();
    const r = await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: p1 }, { op: 'cherry-pick', ref: q1 }, { op: 'cherry-pick', ref: p1 }]);
    expect(r.stoppedAt).toBe(1);
    expect(r.steps.map((s) => s.state)).toEqual(['ok', 'conflict', 'skipped']);
    expect(r.steps[1].conflicts).toEqual(['a.txt']);
  });

  it('aceita uma branch (pega a ponta dela) e mistura com merge', async () => {
    const { repo } = pickRepo();
    const r = await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: 'feature/p' }, { op: 'merge', ref: 'feature/p' }]);
    expect(r.steps.map((s) => s.state)).toEqual(['ok', 'ok']);
    expect(r.steps[1].commits).toBe(2); // o cherry-pick criou um commit novo: para o merge, p1 e p2 ainda não estão na base
  });

  it('commit de merge e commit inicial não são suportados: o passo dá "error" com o motivo e a cadeia para', async () => {
    const { repo } = pickRepo();
    sh(repo, 'checkout', '-q', '-b', 'com-merge', 'main');
    sh(repo, 'merge', '-q', '--no-edit', '--no-ff', 'feature/p');
    const mergeCommit = sh(repo, 'rev-parse', 'HEAD').trim();
    sh(repo, 'checkout', '-q', 'main');
    const root = sh(repo, 'rev-list', '--max-parents=0', 'main').trim();

    const a = await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: mergeCommit }, { op: 'merge', ref: 'feature/q' }]);
    expect(a.stoppedAt).toBe(0);
    expect(a.steps[0]).toMatchObject({ state: 'error' });
    expect(a.steps[0].note).toMatch(/commit de merge/);
    expect(a.steps[1].state).toBe('skipped');

    const b = await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: root }]);
    expect(b.steps[0]).toMatchObject({ state: 'error' });
    expect(b.steps[0].note).toMatch(/commit inicial/);
  });

  it('prevê o mesmo que o cherry-pick de verdade', async () => {
    const { repo, p1, q1 } = pickRepo();
    const sim = await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: p1 }, { op: 'cherry-pick', ref: q1 }]);
    expect(sim.steps.map((s) => s.state)).toEqual(['ok', 'conflict']);
    sh(repo, 'cherry-pick', p1);
    expect(() => sh(repo, 'cherry-pick', q1)).toThrow(); // conflito de verdade
    sh(repo, 'cherry-pick', '--abort');
  });
});

describe('rebase simulado', () => {
  it('reaplica os commits da base sobre a ref (dois commits, limpo)', async () => {
    const { repo } = pickRepo();
    const r = await simulateChain(repo, 'feature/p', [{ op: 'rebase', ref: 'main' }]);
    expect(r.steps[0]).toMatchObject({ op: 'rebase', state: 'ok', commits: 2, fastForward: false, upToDate: false });
  });

  it('conflito: diz em qual commit parou (k de n), lista os arquivos e prevê o mesmo que o rebase de verdade', async () => {
    const { repo } = pickRepo();
    commitFile(repo, 'a.txt', 'linha 1\nM\nlinha 3\n', 'main muda a linha 2'); // agora p1 conflita com a main
    const r = await simulateChain(repo, 'feature/p', [{ op: 'rebase', ref: 'main' }]);
    expect(r.stoppedAt).toBe(0);
    expect(r.steps[0]).toMatchObject({ state: 'conflict', conflicts: ['a.txt'], commits: 0 });
    expect(r.steps[0].note).toMatch(/no commit [0-9a-f]{7} \(1 de 2\)/);
    sh(repo, 'checkout', '-q', 'feature/p');
    expect(() => sh(repo, 'rebase', 'main')).toThrow();
    sh(repo, 'rebase', '--abort');
  });

  it('sem commits locais só avança (fast-forward); já sobre a ref é "nada a fazer"', async () => {
    const { repo } = pickRepo();
    sh(repo, 'branch', 'antiga', 'main~1');
    const ff = await simulateChain(repo, 'antiga', [{ op: 'rebase', ref: 'main' }]);
    expect(ff.steps[0]).toMatchObject({ state: 'ok', fastForward: true, commits: 0, commit: sh(repo, 'rev-parse', 'main').trim() });

    const done = await simulateChain(repo, 'main', [{ op: 'rebase', ref: 'main~1' }]);
    expect(done.steps[0]).toMatchObject({ state: 'ok', upToDate: true });
  });

  it('não reaplica o que a ref já tem com o mesmo conteúdo (como o git rebase)', async () => {
    const { repo, p2 } = pickRepo();
    sh(repo, 'cherry-pick', p2); // a main recebe o p2 (mesmo patch); feature/p continua com p1 + p2
    const r = await simulateChain(repo, 'feature/p', [{ op: 'rebase', ref: 'main' }]);
    expect(r.steps[0]).toMatchObject({ state: 'ok', commits: 1 }); // só o p1 precisa ser reaplicado
  });

  it('cadeia: rebase e depois merge, cada um sobre o resultado do anterior', async () => {
    const { repo } = pickRepo();
    const r = await simulateChain(repo, 'feature/p', [{ op: 'rebase', ref: 'main' }, { op: 'merge', ref: 'feature/q' }]);
    // feature/q muda a linha 2, que o p1 (já reaplicado) também mudou → conflita
    expect(r.steps.map((s) => s.state)).toEqual(['ok', 'conflict']);
    expect(r.stoppedAt).toBe(1);
  });

  it('muitos commits para reaplicar: erro claro, sem simular', async () => {
    const { repo } = pickRepo(); // feature/p tem 2 commits para reaplicar
    const r = await simulateChain(repo, 'feature/p', [{ op: 'rebase', ref: 'main' }], { rebaseCommits: 1 });
    expect(r.steps[0]).toMatchObject({ state: 'error' });
    expect(r.steps[0].note).toMatch(/2 commits.*limite.*1/);
    expect(MAX_REBASE_COMMITS).toBeGreaterThan(1); // o padrão é bem maior
  });
});

describe('cherry-pick e rebase não deixam rastro', () => {
  it('refs, HEAD, árvore de trabalho e objetos ficam idênticos', async () => {
    const { repo, p1, q1 } = pickRepo();
    write(repo, 'sujo.txt', 'alteração não commitada\n');
    const before = fingerprint(repo);
    const dirs = scratchDirs();
    await simulateChain(repo, 'main', [{ op: 'cherry-pick', ref: p1 }, { op: 'cherry-pick', ref: q1 }]);
    await simulateChain(repo, 'feature/p', [{ op: 'rebase', ref: 'main' }, { op: 'merge', ref: 'feature/q' }]);
    expect(fingerprint(repo)).toEqual(before);
    expect(scratchDirs()).toBe(dirs);
  });
});
