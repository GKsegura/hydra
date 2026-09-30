// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import type { RepoScenario, RepoScenarioStep } from '../src/multi.ts';
import { cleanSteps, describeStep, moveItem, overallText, stepTitle, summarizeRepo, totals } from '../web/src/scenario.ts';

const step = (over: Partial<RepoScenarioStep> = {}): RepoScenarioStep => ({
  op: 'merge', branch: 'feature/x', ref: 'feature/x', state: 'ok', commits: 3, fastForward: false, upToDate: false, conflicts: [], note: null, ...over,
});
const repo = (over: Partial<RepoScenario> = {}): RepoScenario => ({
  id: 'api', name: 'API', baseRef: 'main', reason: null, steps: [step()], stoppedAt: null, ...over,
});

describe('describeStep', () => {
  it('merge normal, fast-forward e já contido', () => {
    expect(describeStep(step(), 0, null)).toEqual({ text: '+3 commits · commit de merge necessário', tone: 'ok', icon: '✓' });
    expect(describeStep(step({ commits: 1, fastForward: true }), 0, null).text).toBe('+1 commit · fast-forward');
    expect(describeStep(step({ commits: 0, upToDate: true }), 0, null)).toMatchObject({ text: 'já contido: nada a fazer', tone: 'muted' });
  });

  it('conflito lista os arquivos (singular e plural)', () => {
    expect(describeStep(step({ state: 'conflict', conflicts: ['a.ts'] }), 1, 1)).toEqual({ text: '1 conflito: a.ts', tone: 'warn', icon: '⚠' });
    expect(describeStep(step({ state: 'conflict', conflicts: ['a.ts', 'b.ts'] }), 1, 1).text).toBe('2 conflitos: a.ts, b.ts');
  });

  it('passo pulado aponta o passo que parou a cadeia (numerado a partir de 1); branch ou commit ausente é ignorado', () => {
    expect(describeStep(step({ state: 'skipped' }), 2, 1).text).toBe('não calculado: o passo 2 parou a cadeia');
    expect(describeStep(step({ state: 'missing', ref: null }), 0, null)).toMatchObject({ tone: 'muted', icon: '–', text: /a branch não existe/ });
    expect(describeStep(step({ op: 'cherry-pick', state: 'missing', ref: null }), 0, null).text).toMatch(/o commit não existe/);
  });

  it('cherry-pick: aplicado, já aplicado e não suportado', () => {
    const pick = (over: Partial<RepoScenarioStep> = {}) => step({ op: 'cherry-pick', commit: 'abc1234', branch: undefined, commits: 1, ...over });
    expect(describeStep(pick(), 0, null)).toEqual({ text: '+1 commit aplicado', tone: 'ok', icon: '✓' });
    expect(describeStep(pick({ commits: 0, upToDate: true, note: 'o commit já estava aplicado' }), 0, null).text).toBe('o commit já estava aplicado: nada a fazer');
    expect(describeStep(pick({ state: 'error', note: 'abc1234 é um commit de merge' }), 0, 0)).toEqual({ text: 'abc1234 é um commit de merge', tone: 'warn', icon: '✗' });
  });

  it('rebase: commits reaplicados, fast-forward e conflito com o commit em que parou', () => {
    expect(describeStep(step({ op: 'rebase', commits: 2 }), 0, null).text).toBe('2 commits reaplicados');
    expect(describeStep(step({ op: 'rebase', commits: 1 }), 0, null).text).toBe('1 commit reaplicado');
    expect(describeStep(step({ op: 'rebase', commits: 0, fastForward: true }), 0, null).text).toBe('fast-forward: só avança até a branch');
    expect(describeStep(step({ op: 'rebase', state: 'conflict', conflicts: ['a.ts'], note: 'no commit abc1234 (1 de 2)' }), 0, 0).text)
      .toBe('1 conflito: a.ts (no commit abc1234 (1 de 2))');
  });
});

describe('stepTitle', () => {
  it('descreve cada operação', () => {
    expect(stepTitle({ op: 'merge', branch: 'feature/x' })).toBe('merge feature/x');
    expect(stepTitle({ op: 'rebase', branch: 'main' })).toBe('rebase sobre main');
    expect(stepTitle({ op: 'cherry-pick', commit: '1a2b3c4d5e6f7a8b' })).toBe('cherry-pick 1a2b3c4d');
  });
});

describe('summarizeRepo / totals / overallText', () => {
  const clean = repo();
  const conflicted = repo({ id: 'app', name: 'APP', stoppedAt: 1, steps: [step(), step({ state: 'conflict', conflicts: ['a.ts'] })] });
  const noBase = repo({ id: 'bot', name: 'BOT', baseRef: null, reason: 'A branch base não existe nesse repositório.', steps: [] });
  const contained = repo({ id: 'infra', steps: [step({ upToDate: true, commits: 0 })] });
  const noneApply = repo({ id: 'docs', steps: [step({ state: 'missing', ref: null })] });

  it('resume cada repo', () => {
    expect(summarizeRepo(clean)).toEqual({ text: 'sem conflitos', tone: 'ok' });
    expect(summarizeRepo(conflicted)).toEqual({ text: 'para no passo 2 (conflito)', tone: 'warn' });
    const failed = repo({ stoppedAt: 0, steps: [step({ op: 'cherry-pick', state: 'error', note: 'commit de merge' })] });
    expect(summarizeRepo(failed)).toEqual({ text: 'para no passo 1 (não dá para simular)', tone: 'warn' });
    expect(summarizeRepo(noBase)).toEqual({ text: 'A branch base não existe nesse repositório.', tone: 'muted' });
    expect(summarizeRepo(contained)).toMatchObject({ text: 'nada a fazer: já tem tudo', tone: 'muted' });
    expect(summarizeRepo(noneApply)).toMatchObject({ text: 'nenhum passo se aplica aqui', tone: 'muted' });
  });

  it('conta limpos, com conflito e fora do cenário', () => {
    expect(totals([clean, conflicted, noBase, contained, noneApply])).toEqual({ clean: 1, conflict: 1, out: 3 });
    expect(overallText([clean, conflicted, noBase])).toBe('3 repositórios: 1 sem conflitos · 1 com conflito · 1 fora do cenário');
    expect(overallText([clean])).toBe('1 repositório: 1 sem conflitos');
    expect(overallText([])).toBe('0 repositórios: nada a mostrar');
  });
});

describe('cleanSteps / moveItem', () => {
  it('tira espaços e passos vazios', () => {
    expect(cleanSteps([
      { op: 'merge', value: ' feature/a ' }, { op: 'merge', value: '' }, { op: 'rebase', value: '  ' }, { op: 'merge', value: 'feature/b' },
    ])).toEqual([
      { op: 'merge', branch: 'feature/a' },
      { op: 'merge', branch: 'feature/b' },
    ]);
  });

  it('cada operação vai para a API no formato certo (cherry-pick usa "commit"; merge e rebase usam "branch")', () => {
    expect(cleanSteps([
      { op: 'rebase', value: 'main' }, { op: 'cherry-pick', value: ' 1a2b3c4 ' }, { op: 'merge', value: 'feature/x' },
    ])).toEqual([
      { op: 'rebase', branch: 'main' },
      { op: 'cherry-pick', commit: '1a2b3c4' },
      { op: 'merge', branch: 'feature/x' },
    ]);
  });

  it('reordena sem alterar a lista original e ignora posições inválidas', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(list).toEqual(['a', 'b', 'c']);
    expect(moveItem(list, 1, 1)).toBe(list);
    expect(moveItem(list, -1, 1)).toBe(list);
    expect(moveItem(list, 0, 3)).toBe(list);
  });
});
