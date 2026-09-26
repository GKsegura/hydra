// Hydra — © 2026 José Segura (GKsegura) · MIT
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  abortOperation, checkoutBranch, cherryPick, clone, commit, continueOperation, createBranch, createTag, deleteBranch,
  deleteRemoteBranch, deleteTag, discard, fetchAll, getCommits, getStatus, initRepo, listBranches, listStashes,
  mergeBranch, parseConflicts, previewMerge, pull, push, pushTag, readConflict, renameBranch, resolveWhole,
  resolveWithContent, revertCommit, stage, stashApply, stashPush, undoLastCommit,
} from '../src/git/index.ts';
import { layout } from '../src/layout.ts';
import { cleanup, commitFile, makeRemotePair, makeRepo, sh, tmpDir, write } from './helpers.ts';

const noop = () => {};
afterAll(cleanup);

describe('status, stage e commit', () => {
  it('lê alterações e commita com acentos', async () => {
    const repo = makeRepo();
    write(repo, 'a.txt', 'mudou\n');
    write(repo, 'novo com espaço.txt', 'x\n');
    let st = await getStatus(repo);
    expect(st.unstaged).toBe(1);
    expect(st.untracked).toBe(1);
    await stage(repo, 'all');
    await commit(repo, 'feat: acentuação — ok', 'corpo "com aspas"');
    st = await getStatus(repo);
    expect(st.files).toHaveLength(0);
    expect(sh(repo, 'log', '-1', '--format=%B').trim()).toBe('feat: acentuação — ok\n\ncorpo "com aspas"');
  });

  it('emenda (amend) e desfaz o último commit mantendo em stage', async () => {
    const repo = makeRepo();
    commitFile(repo, 'b.txt', 'b\n', 'feat: b');
    await commit(repo, 'feat: b (emendado)', '', true);
    expect(sh(repo, 'log', '-1', '--format=%s').trim()).toBe('feat: b (emendado)');
    const msg = await undoLastCommit(repo);
    expect(msg.summary).toBe('feat: b (emendado)');
    const st = await getStatus(repo);
    expect(st.staged).toBe(1);
  });

  it('descarta alterações rastreadas, novas e staged', async () => {
    const repo = makeRepo();
    write(repo, 'a.txt', 'estragado\n');
    write(repo, 'lixo.txt', 'x\n');
    write(repo, 'staged-novo.txt', 'y\n');
    sh(repo, 'add', 'staged-novo.txt');
    const st = await getStatus(repo);
    await discard(repo, st.files, false);
    expect((await getStatus(repo)).files).toHaveLength(0);
    expect(readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('linha 1\nlinha 2\nlinha 3\n');
    expect(existsSync(path.join(repo, 'lixo.txt'))).toBe(false);
  });

  it('reverte um commit', async () => {
    const repo = makeRepo();
    commitFile(repo, 'b.txt', 'b\n', 'feat: b');
    const hash = sh(repo, 'rev-parse', 'HEAD').trim();
    expect((await revertCommit(repo, hash)).conflicts).toBe(false);
    expect(existsSync(path.join(repo, 'b.txt'))).toBe(false);
  });
});

describe('branches', () => {
  it('cria, troca, renomeia e exclui', async () => {
    const repo = makeRepo();
    await createBranch(repo, 'feature/x', { checkout: true });
    commitFile(repo, 'x.txt', 'x\n', 'feat: x');
    await checkoutBranch(repo, 'main');
    await renameBranch(repo, 'feature/x', 'feature/y');
    expect((await listBranches(repo)).map((b) => b.name)).toContain('feature/y');

    // Não mergeada: exige force.
    await expect(deleteBranch(repo, 'feature/y', { local: true })).rejects.toMatchObject({ code: 'not_merged' });
    await deleteBranch(repo, 'feature/y', { local: true, force: true });
    expect((await listBranches(repo)).map((b) => b.name)).not.toContain('feature/y');
  });

  it('recusa nome inválido e excluir a branch atual', async () => {
    const repo = makeRepo();
    await expect(createBranch(repo, 'nome com espaço')).rejects.toThrow(/inválido/);
    await expect(deleteBranch(repo, 'main', { local: true })).rejects.toThrow(/em que você está/);
  });

  it('troca de branch guardando as alterações num stash', async () => {
    const repo = makeRepo();
    await createBranch(repo, 'outra');
    write(repo, 'a.txt', 'alteração em andamento\n');
    const r = await checkoutBranch(repo, 'outra', 'stash');
    expect(r.stashed).toBe(true);
    expect((await getStatus(repo)).files).toHaveLength(0);
    const stashes = await listStashes(repo);
    expect(stashes[0].message).toContain('hydra: alterações de main');
  });
});

describe('merge e conflitos', () => {
  function divergent() {
    const repo = makeRepo();
    sh(repo, 'switch', '-q', '-c', 'feature');
    commitFile(repo, 'a.txt', 'linha 1\nlinha 2 (feature)\nlinha 3\n', 'feat: muda na feature');
    sh(repo, 'switch', '-q', 'main');
    commitFile(repo, 'a.txt', 'linha 1\nlinha 2 (main)\nlinha 3\n', 'feat: muda na main');
    return repo;
  }

  it('faz fast-forward', async () => {
    const repo = makeRepo();
    sh(repo, 'switch', '-q', '-c', 'feature');
    commitFile(repo, 'b.txt', 'b\n', 'feat: b');
    sh(repo, 'switch', '-q', 'main');
    expect((await previewMerge(repo, 'feature')).fastForward).toBe(true);
    expect((await mergeBranch(repo, 'feature')).status).toBe('fast-forward');
  });

  it('prevê, entra em conflito, resolve pelo conteúdo e conclui', async () => {
    const repo = divergent();
    const preview = await previewMerge(repo, 'feature');
    expect(preview.conflicts).toEqual(['a.txt']);

    const r = await mergeBranch(repo, 'feature');
    expect(r).toEqual({ status: 'conflicts', conflicts: 1 });

    const file = await readConflict(repo, 'a.txt');
    expect(file.current).toBe('main');
    expect(file.incoming).toBe('feature');
    const block = file.segments.find((s) => s.type === 'conflict');
    expect(block).toMatchObject({ ours: ['linha 2 (main)'], theirs: ['linha 2 (feature)'] });

    await expect(resolveWithContent(repo, 'a.txt', '<<<<<<< x\n')).rejects.toThrow(/marcadores/);
    await resolveWithContent(repo, 'a.txt', 'linha 1\nlinha 2 (main)\nlinha 2 (feature)\nlinha 3\n');
    await continueOperation(repo, 'merge', '');
    const st = await getStatus(repo);
    expect(st.operation).toBeNull();
    expect(sh(repo, 'log', '-1', '--format=%P').trim().split(' ')).toHaveLength(2);
  });

  it('resolve escolhendo um lado inteiro e aborta', async () => {
    const repo = divergent();
    await mergeBranch(repo, 'feature');
    await resolveWhole(repo, 'a.txt', 'theirs');
    expect(readFileSync(path.join(repo, 'a.txt'), 'utf8')).toContain('(feature)');
    await abortOperation(repo, 'merge');
    expect((await getStatus(repo)).operation).toBeNull();
    expect(readFileSync(path.join(repo, 'a.txt'), 'utf8')).toContain('(main)');
  });

  it('interpreta marcadores com base (diff3) e trechos comuns', () => {
    const segs = parseConflicts('topo\n<<<<<<< HEAD\nmeu\n||||||| base\nbase\n=======\ndeles\n>>>>>>> feature\nfim\n');
    expect(segs).toEqual([
      { type: 'text', lines: ['topo'] },
      { type: 'conflict', ours: ['meu'], base: ['base'], theirs: ['deles'], oursLabel: 'HEAD', theirsLabel: 'feature' },
      { type: 'text', lines: ['fim'] },
    ]);
  });

  it('cherry-pick traz um commit de outra branch', async () => {
    const repo = makeRepo();
    sh(repo, 'switch', '-q', '-c', 'feature');
    commitFile(repo, 'c.txt', 'c\n', 'feat: c');
    const hash = sh(repo, 'rev-parse', 'HEAD').trim();
    sh(repo, 'switch', '-q', 'main');
    expect((await cherryPick(repo, hash)).conflicts).toBe(false);
    expect(existsSync(path.join(repo, 'c.txt'))).toBe(true);
  });
});

describe('remoto (repositório bare local no papel do GitHub)', () => {
  it('publica branch, faz push, fetch, pull e exclui no remoto', async () => {
    const { remote, work } = makeRemotePair();
    await createBranch(work, 'feature/nuvem', { checkout: true });
    commitFile(work, 'n.txt', 'n\n', 'feat: nuvem');
    expect((await push(work, noop)).published).toBe(true);
    expect(sh(remote, 'branch', '--list', 'feature/nuvem')).toContain('feature/nuvem');

    // Outro clone manda um commit; o primeiro faz fetch + pull.
    const other = path.join(tmpDir(), 'outro');
    sh(path.dirname(other), 'clone', '-q', remote, other);
    sh(other, 'config', 'user.name', 'Outra Pessoa');
    sh(other, 'config', 'user.email', 'outra@hydra.local');
    commitFile(other, 'm.txt', 'm\n', 'feat: vindo de outro clone');
    sh(other, 'push', '-q');

    await checkoutBranch(work, 'main');
    await fetchAll(work, noop);
    expect((await getStatus(work)).behind).toBe(1);
    expect((await pull(work, noop)).conflicts).toBe(false);
    expect(existsSync(path.join(work, 'm.txt'))).toBe(true);

    await deleteBranch(work, 'feature/nuvem', { local: true, remote: 'origin', force: true });
    expect(sh(remote, 'branch', '--list', 'feature/nuvem')).toBe('');
  });

  it('exclui uma branch que só existe no remoto', async () => {
    const { remote, work } = makeRemotePair();
    sh(remote, 'branch', 'so-no-remoto');
    await fetchAll(work, noop);
    await deleteRemoteBranch(work, 'origin/so-no-remoto');
    expect(sh(remote, 'branch', '--list', 'so-no-remoto')).toBe('');
  });

  it('push rejeitado vira mensagem de "faça pull"', async () => {
    const { remote, work } = makeRemotePair();
    const other = path.join(tmpDir(), 'outro');
    sh(path.dirname(other), 'clone', '-q', remote, other);
    sh(other, 'config', 'user.name', 'Outra');
    sh(other, 'config', 'user.email', 'o@h.local');
    commitFile(other, 'x.txt', 'x\n', 'feat: x');
    sh(other, 'push', '-q');
    commitFile(work, 'y.txt', 'y\n', 'feat: y');
    await expect(push(work, noop)).rejects.toThrow(/Pull/);
  });

  it('não deixa desfazer commit que já está no remoto', async () => {
    const { work } = makeRemotePair();
    await expect(undoLastCommit(work)).rejects.toThrow(/já está no remoto/);
  });

  it('cria, envia e exclui tag', async () => {
    const { remote, work } = makeRemotePair();
    await createTag(work, 'v1.0.0', { message: 'primeira versão' });
    await pushTag(work, 'v1.0.0', 'origin');
    expect(sh(remote, 'tag')).toContain('v1.0.0');
    await deleteTag(work, 'v1.0.0', { local: true, remote: 'origin' });
    expect(sh(remote, 'tag')).toBe('');
  });

  it('clona com progresso', async () => {
    const { remote } = makeRemotePair();
    const dest = path.join(tmpDir(), 'clonado');
    const target = await clone(remote, dest, noop);
    expect(existsSync(path.join(target, 'a.txt'))).toBe(true);
    await expect(clone(remote, dest, noop)).rejects.toThrow(/não está vazia/);
  });
});

describe('stash e repositório novo', () => {
  it('guarda e aplica stash', async () => {
    const repo = makeRepo();
    write(repo, 'a.txt', 'guardado\n');
    await stashPush(repo, 'meu stash');
    expect((await getStatus(repo)).files).toHaveLength(0);
    const [s] = await listStashes(repo);
    expect(s.message).toBe('meu stash');
    expect(s.files).toBe(1);
    await stashApply(repo, 0, true);
    expect(readFileSync(path.join(repo, 'a.txt'), 'utf8')).toBe('guardado\n');
    expect(await listStashes(repo)).toHaveLength(0);
  });

  it('cria repositório com .gitignore e README', async () => {
    const dir = path.join(tmpDir(), 'meu-projeto');
    const r = await initRepo(dir, { gitignore: 'node', readme: true });
    expect(existsSync(path.join(dir, '.gitignore'))).toBe(true);
    expect(readFileSync(path.join(dir, 'README.md'), 'utf8')).toContain('# meu-projeto');
    // O commit inicial depende da identidade global do git; se não houver, o repo fica pronto sem commit.
    const commits = await getCommits(dir, 10);
    expect(commits.length).toBe(r.committed ? 1 : 0);
  });
});

describe('layout do grafo', () => {
  it('merge com dois pais usa duas lanes e converge', async () => {
    const repo = makeRepo();
    sh(repo, 'switch', '-q', '-c', 'feature');
    commitFile(repo, 'f.txt', 'f\n', 'feat: f');
    sh(repo, 'switch', '-q', 'main');
    commitFile(repo, 'm.txt', 'm\n', 'feat: m');
    sh(repo, 'merge', '-q', '--no-ff', '-m', 'merge', 'feature');
    const g = layout(await getCommits(repo, 50));
    expect(g.width).toBe(2);
    expect(g.edges.filter((e) => e.merge)).toHaveLength(1);
    expect(g.nodes[0].col).toBe(0);
  });
});
