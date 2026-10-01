// Hydra — © 2026 José Segura (GKsegura) · MIT
import { afterAll, describe, expect, it } from 'vitest';
import {
  abortOperation, continueOperation, getStatus, rebaseOnto, rebasePlan, resolveWithContent, startRebase, type RebaseStep,
} from '../src/git/index.ts';
import { cleanup, commitFile, makeRemotePair, makeRepo, sh, write } from './helpers.ts';

afterAll(cleanup);

const log = (dir: string) => sh(dir, 'log', '--format=%s').trim().split('\n');
const base = (dir: string) => sh(dir, 'rev-list', '--max-parents=0', 'HEAD').trim();

describe('rebasePlan', () => {
  it('lista do mais antigo para o mais novo, e marca o que já foi publicado', async () => {
    const { remote, work } = makeRemotePair();
    const root = base(work);
    commitFile(work, 'a.txt', 'a\n', 'publicado');
    sh(work, 'push', '-q', 'origin', 'main');
    commitFile(work, 'b.txt', 'b\n', 'local');

    const plan = await rebasePlan(work, root);
    expect(plan.commits.map((c) => c.subject)).toEqual(['publicado', 'local']);
    expect(plan.commits.map((c) => c.published)).toEqual([true, false]);
    expect(remote).toBeTruthy();
  });

  it('recusa uma base que não é ancestral do HEAD', async () => {
    const dir = makeRepo();
    sh(dir, 'checkout', '-q', '-b', 'outra');
    commitFile(dir, 'x.txt', 'x\n', 'na outra');
    sh(dir, 'checkout', '-q', 'main');
    await expect(rebasePlan(dir, 'outra')).rejects.toThrow(/ancestral/);
  });
});

describe('startRebase', () => {
  function fourCommits() {
    const dir = makeRepo();
    const root = base(dir);
    for (const n of [1, 2, 3, 4]) commitFile(dir, `f${n}.txt`, `${n}\n`, `c${n}`);
    return { dir, root };
  }
  const plan = async (dir: string, root: string) => (await rebasePlan(dir, root)).commits;
  const steps = (commits: Awaited<ReturnType<typeof plan>>, over: Record<string, Partial<RebaseStep>>): RebaseStep[] =>
    commits.map((c) => ({ hash: c.hash, action: 'pick', ...over[c.subject] }));

  it('reordena dois commits', async () => {
    const { dir, root } = fourCommits();
    const commits = await plan(dir, root);
    const [c1, c2, c3, c4] = commits;
    const r = await startRebase(dir, root, [c2, c1, c3, c4].map((c) => ({ hash: c.hash, action: 'pick' })));
    expect(r).toMatchObject({ done: true });
    expect(log(dir)).toEqual(['c4', 'c3', 'c1', 'c2', 'inicial']);
  });

  it('squash de dois commits com mensagem nova', async () => {
    const { dir, root } = fourCommits();
    const commits = await plan(dir, root);
    const r = await startRebase(dir, root, steps(commits, {
      c2: { action: 'squash', summary: 'feat: c1 e c2 juntos', body: 'detalhes' },
    }));
    expect(r).toMatchObject({ done: true });
    expect(log(dir)).toEqual(['c4', 'c3', 'feat: c1 e c2 juntos', 'inicial']);
    expect(sh(dir, 'log', '-1', '--format=%B', 'HEAD~2').trim()).toBe('feat: c1 e c2 juntos\n\ndetalhes');
    expect(sh(dir, 'log', '--oneline').trim().split('\n')).toHaveLength(4); // raiz + 3 (c1+c2, c3, c4)
  });

  it('squash sem mensagem usa a combinação padrão do git (não falha)', async () => {
    const { dir, root } = fourCommits();
    const commits = await plan(dir, root);
    const r = await startRebase(dir, root, steps(commits, { c2: { action: 'squash' } }));
    expect(r).toMatchObject({ done: true });
    expect(sh(dir, 'log', '-1', '--format=%B', 'HEAD~2')).toMatch(/c1/);
  });

  it('fixup descarta a mensagem do commit fundido', async () => {
    const { dir, root } = fourCommits();
    const commits = await plan(dir, root);
    const r = await startRebase(dir, root, steps(commits, { c2: { action: 'fixup' } }));
    expect(r).toMatchObject({ done: true });
    expect(log(dir)).not.toContain('c2');
    expect(log(dir)).toContain('c1');
  });

  it('reword muda a mensagem de um commit do meio', async () => {
    const { dir, root } = fourCommits();
    const commits = await plan(dir, root);
    const r = await startRebase(dir, root, steps(commits, { c3: { action: 'reword', summary: 'fix: renomeado' } }));
    expect(r).toMatchObject({ done: true });
    expect(log(dir)).toEqual(['c4', 'fix: renomeado', 'c2', 'c1', 'inicial']);
  });

  it('drop remove o commit e o arquivo que ele criava', async () => {
    const { dir, root } = fourCommits();
    const commits = await plan(dir, root);
    const r = await startRebase(dir, root, steps(commits, { c2: { action: 'drop' } }));
    expect(r).toMatchObject({ done: true });
    expect(log(dir)).not.toContain('c2');
    const { existsSync } = await import('node:fs');
    const path = await import('node:path');
    expect(existsSync(path.join(dir, 'f2.txt'))).toBe(false);
  });

  it('reword sem mensagem é recusado antes de mexer no repositório', async () => {
    const { dir, root } = fourCommits();
    const commits = await plan(dir, root);
    await expect(startRebase(dir, root, steps(commits, { c2: { action: 'reword', summary: '' } }))).rejects.toThrow(/mensagem/);
    expect(log(dir)).toEqual(['c4', 'c3', 'c2', 'c1', 'inicial']);
  });

  it('conflito no meio: resolve (um ou mais conflitos em cadeia) e continua até o fim', async () => {
    const dir = makeRepo(); // a.txt = linha 1\nlinha 2\nlinha 3\n (de makeRepo)
    const root = base(dir);
    // c1 e c2 mudam a MESMA linha, um em cima do outro: trocar a ordem força conflito ao reaplicar.
    write(dir, 'a.txt', 'linha 1\nA\nlinha 3\n');
    sh(dir, 'commit', '-qam', 'c1');
    write(dir, 'a.txt', 'linha 1\nB\nlinha 3\n');
    sh(dir, 'commit', '-qam', 'c2');
    const [c1, c2] = (await plan(dir, root));

    let result = await startRebase(dir, root, [c2, c1].map((c) => ({ hash: c.hash, action: 'pick' })));
    expect(result).toMatchObject({ done: false });
    let rounds = 0;
    let lastContent = '';
    while (!result.done) {
      rounds++;
      expect(rounds).toBeLessThan(5); // trava de segurança contra loop infinito
      expect((await getStatus(dir)).operation).toBe('rebase');
      // Conteúdo diferente a cada rodada: se repetisse o mesmo valor, o passo seguinte viraria um commit
      // "vazio" (sem diferença pro pai) e o git pularia ele sozinho, escondendo o commit da história.
      lastContent = `linha 1\nresolvido-rodada-${rounds}\nlinha 3\n`;
      await resolveWithContent(dir, 'a.txt', lastContent);
      try {
        result = { done: true, hash: await continueOperation(dir, 'rebase', '') };
      } catch (err) {
        expect((err as Error).message).toMatch(/conflito/);
        result = { done: false, conflicts: (await getStatus(dir)).conflicted };
      }
    }
    expect(rounds).toBeGreaterThan(0);
    expect((await getStatus(dir)).operation).toBeNull();
    expect(sh(dir, 'show', ':a.txt')).toBe(lastContent);
    expect(log(dir)).toEqual(['c1', 'c2', 'inicial']);
  });

  it('abortar volta tudo a como estava', async () => {
    const dir = makeRepo();
    const root = base(dir);
    commitFile(dir, 'a.txt', 'linha 1\n', 'c1');
    commitFile(dir, 'a.txt', 'linha 1\nlinha 2\n', 'c2');
    write(dir, 'a.txt', 'linha 1\nlinha 2 diferente\n');
    sh(dir, 'commit', '-qam', 'c3');
    const before = sh(dir, 'log', '--format=%H');
    const commits = await plan(dir, root);
    const [c1, c2, c3] = commits;
    const r = await startRebase(dir, root, [c2, c1, c3].map((c) => ({ hash: c.hash, action: 'pick' })));
    expect(r).toMatchObject({ done: false });
    await abortOperation(dir, 'rebase');
    expect((await getStatus(dir)).operation).toBeNull();
    expect(sh(dir, 'log', '--format=%H')).toBe(before);
  });

  it('recusa com alterações não commitadas', async () => {
    const { dir, root } = fourCommits();
    write(dir, 'novo.txt', 'x\n');
    const commits = await plan(dir, root);
    await expect(startRebase(dir, root, steps(commits, {}))).rejects.toThrow(/não commitadas/);
  });

  it('recusa quando já tem outra operação em andamento', async () => {
    const dir = makeRepo();
    const root = base(dir);
    sh(dir, 'checkout', '-q', '-b', 'outra');
    commitFile(dir, 'x.txt', 'x\n', 'na outra');
    sh(dir, 'checkout', '-q', 'main');
    commitFile(dir, 'x.txt', 'main\n', 'na main');
    try {
      sh(dir, 'merge', 'outra');
    } catch {
      /* conflito esperado */
    }
    const commits = await plan(dir, root);
    await expect(startRebase(dir, root, steps(commits, {}))).rejects.toThrow(/andamento/);
  });

  it('só reordenar (tudo pick, ordem nova) é aceito; a mesma ordem é recusada como "nada a fazer"', async () => {
    const { dir, root } = fourCommits();
    const commits = await plan(dir, root);
    await expect(startRebase(dir, root, steps(commits, {}))).rejects.toThrow(/nada a fazer|Nada para fazer/i);
    const [c1, c2, ...rest] = commits;
    const r = await startRebase(dir, root, [c2, c1, ...rest].map((c) => ({ hash: c.hash, action: 'pick' })));
    expect(r).toMatchObject({ done: true });
  });

  it('lista de commits que não bate com o intervalo é recusada', async () => {
    const { dir, root } = fourCommits();
    await expect(startRebase(dir, root, [{ hash: '0'.repeat(40), action: 'pick' }])).rejects.toThrow(/não bate/);
  });
});

describe('rebaseOnto', () => {
  it('leva os commits únicos da branch atual para cima de outra branch', async () => {
    const dir = makeRepo();
    sh(dir, 'checkout', '-q', '-b', 'base-nova');
    commitFile(dir, 'n.txt', 'n\n', 'na base nova');
    sh(dir, 'checkout', '-q', 'main');
    commitFile(dir, 'm.txt', 'm\n', 'na main');

    const r = await rebaseOnto(dir, 'base-nova');
    expect(r).toMatchObject({ done: true });
    expect(sh(dir, 'merge-base', '--is-ancestor', 'base-nova', 'main').trim()).toBe('');
    expect(log(dir)[0]).toBe('na main');
  });

  it('para em conflito e permite abortar', async () => {
    const dir = makeRepo();
    commitFile(dir, 'a.txt', 'linha 1\n', 'base a');
    sh(dir, 'checkout', '-q', '-b', 'outra');
    write(dir, 'a.txt', 'linha 1\nda outra\n');
    sh(dir, 'commit', '-qam', 'na outra');
    sh(dir, 'checkout', '-q', 'main');
    write(dir, 'a.txt', 'linha 1\nda main\n');
    sh(dir, 'commit', '-qam', 'na main');

    const r = await rebaseOnto(dir, 'outra');
    expect(r).toMatchObject({ done: false });
    await abortOperation(dir, 'rebase');
    expect((await getStatus(dir)).operation).toBeNull();
  });
});
