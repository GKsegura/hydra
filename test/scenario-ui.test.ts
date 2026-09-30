// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import type { RepoScenario, RepoScenarioStep } from '../src/multi.ts';
import { cleanSteps, describeStep, moveItem, overallText, summarizeRepo, totals } from '../web/src/scenario.ts';

const step = (over: Partial<RepoScenarioStep> = {}): RepoScenarioStep => ({
  op: 'merge', branch: 'feature/x', ref: 'feature/x', state: 'ok', commits: 3, fastForward: false, upToDate: false, conflicts: [], ...over,
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

  it('passo pulado aponta o passo que conflitou (numerado a partir de 1); branch ausente é ignorada', () => {
    expect(describeStep(step({ state: 'skipped' }), 2, 1).text).toBe('não calculado: o passo 2 deu conflito');
    expect(describeStep(step({ state: 'missing', ref: null }), 0, null)).toMatchObject({ tone: 'muted', icon: '–' });
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
    expect(cleanSteps([' feature/a ', '', '  ', 'feature/b'])).toEqual([
      { op: 'merge', branch: 'feature/a' },
      { op: 'merge', branch: 'feature/b' },
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
