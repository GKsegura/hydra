// Hydra — © 2026 José Segura (GKsegura) · MIT
import { afterAll, describe, expect, it } from 'vitest';
import { applyPartial, buildPartialPatch, getStatus, getWorkingDiff, parsePatch, type FileChange } from '../src/git/index.ts';
import { cleanup, commitFile, makeRepo, sh, write } from './helpers.ts';

afterAll(cleanup);

// Arquivo de 20 linhas; duas mudanças longe uma da outra viram dois hunks.
const base = Array.from({ length: 20 }, (_, i) => `linha ${i + 1}`);
const text = (lines: string[]) => `${lines.join('\n')}\n`;

async function change(dir: string, file: string): Promise<FileChange> {
  const c = (await getStatus(dir)).files.find((f) => f.path === file);
  if (!c) throw new Error(`${file} não está no status`);
  return c;
}
/** Índices (no texto do diff) das linhas alteradas cujo conteúdo bate com `match`. */
function indexesOf(diff: string, match: RegExp): number[] {
  return parsePatch(diff).hunks.flatMap((h) => h.lines.filter((l) => l.type !== ' ' && match.test(l.text)).map((l) => l.index));
}
const staged = (dir: string) => sh(dir, 'diff', '--cached', '--no-color');
const unstaged = (dir: string) => sh(dir, 'diff', '--no-color');

describe('parsePatch', () => {
  it('separa cabeçalho e hunks, com o índice de cada linha no texto do diff', () => {
    const diff = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@ func\n ctx\n-velho\n+novo\n\\ No newline at end of file\n';
    const p = parsePatch(diff);
    expect(p.header).toHaveLength(3);
    expect(p.hunks).toHaveLength(1);
    expect(p.hunks[0]).toMatchObject({ oldStart: 1, oldCount: 2, newStart: 1, newCount: 2, section: ' func', index: 3 });
    expect(p.hunks[0].lines.map((l) => `${l.type}${l.index}`)).toEqual([' 4', '-5', '+6', '\\7']);
  });

  it('só escolher contexto não gera patch', () => {
    const diff = 'diff --git a/x b/x\n--- a/x\n+++ b/x\n@@ -1,2 +1,2 @@\n ctx\n-velho\n+novo\n';
    expect(buildPartialPatch(diff, new Set([4]), 'stage')).toBeNull();
  });
});

describe('stage parcial', () => {
  function repoWithTwoChanges() {
    const dir = makeRepo();
    commitFile(dir, 'f.txt', text(base), 'base');
    const edited = [...base];
    edited[1] = 'linha 2 MUDADA';
    edited[16] = 'linha 17 MUDADA';
    write(dir, 'f.txt', text(edited));
    return dir;
  }

  it('coloca no stage só um dos dois trechos', async () => {
    const dir = repoWithTwoChanges();
    const c = await change(dir, 'f.txt');
    const diff = await getWorkingDiff(dir, c, false);
    expect(parsePatch(diff).hunks).toHaveLength(2);
    await applyPartial(dir, c, indexesOf(diff, /linha 2\b/), { staged: false, expected: diff });
    expect(staged(dir)).toContain('+linha 2 MUDADA');
    expect(staged(dir)).not.toContain('linha 17 MUDADA');
    expect(unstaged(dir)).toContain('+linha 17 MUDADA');
    expect(unstaged(dir)).not.toContain('linha 2 MUDADA');
  });

  it('dentro de um trecho, escolhe linhas soltas (só a adição, sem a remoção)', async () => {
    const dir = makeRepo();
    commitFile(dir, 'g.txt', text(['a', 'b', 'c']), 'base');
    write(dir, 'g.txt', text(['a', 'b novo', 'x extra', 'c']));
    const c = await change(dir, 'g.txt');
    const diff = await getWorkingDiff(dir, c, false);
    // Escolhe só "+x extra": "-b" vira contexto e "+b novo" fica de fora.
    await applyPartial(dir, c, indexesOf(diff, /^x extra$/), { staged: false });
    expect(sh(dir, 'show', ':g.txt')).toBe(text(['a', 'b', 'x extra', 'c']));
  });

  it('tira do stage só as linhas escolhidas', async () => {
    const dir = repoWithTwoChanges();
    sh(dir, 'add', 'f.txt');
    const c = await change(dir, 'f.txt');
    const diff = await getWorkingDiff(dir, c, true);
    await applyPartial(dir, c, indexesOf(diff, /linha 17/), { staged: true, expected: diff });
    expect(staged(dir)).toContain('+linha 2 MUDADA');
    expect(staged(dir)).not.toContain('linha 17 MUDADA');
    expect(unstaged(dir)).toContain('+linha 17 MUDADA');
  });

  it('funciona com fim de linha CRLF', async () => {
    const dir = makeRepo();
    commitFile(dir, 'w.txt', 'um\r\ndois\r\ntres\r\n', 'crlf');
    write(dir, 'w.txt', 'um\r\nDOIS\r\ntres\r\nquatro\r\n');
    const c = await change(dir, 'w.txt');
    const diff = await getWorkingDiff(dir, c, false);
    await applyPartial(dir, c, indexesOf(diff, /^quatro/), { staged: false });
    expect(sh(dir, 'show', ':w.txt')).toBe('um\r\ndois\r\ntres\r\nquatro\r\n');
  });

  it('recusa se o arquivo mudou depois que o diff foi aberto', async () => {
    const dir = repoWithTwoChanges();
    const c = await change(dir, 'f.txt');
    const diff = await getWorkingDiff(dir, c, false);
    write(dir, 'f.txt', text([...base, 'mais uma']));
    await expect(applyPartial(dir, c, indexesOf(diff, /linha 2\b/), { staged: false, expected: diff })).rejects.toMatchObject({ code: 'diff_changed' });
  });

  it('arquivo novo (untracked) só vai inteiro', async () => {
    const dir = makeRepo();
    write(dir, 'novo.txt', 'x\n');
    const c = await change(dir, 'novo.txt');
    await expect(applyPartial(dir, c, [3], { staged: false })).rejects.toThrow(/inteiro/);
  });
});
