// Hydra — © 2026 José Segura (GKsegura) · MIT
// Textos e totais do resultado de um cenário. Funções puras (sem Vue nem DOM) para serem testadas no Node.
import type { RepoScenario, RepoScenarioStep, ScenarioStepInput } from '../../src/multi.ts';

export const MAX_STEPS = 10;

export type StepTone = 'ok' | 'warn' | 'muted';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A frase de um passo ("+8 commits · fast-forward", "2 conflitos: a.ts, b.ts"…) e o tom com que ela é mostrada. */
export function describeStep(step: RepoScenarioStep, index: number, stoppedAt: number | null): { text: string; tone: StepTone; icon: string } {
  switch (step.state) {
    case 'missing':
      return { text: `${step.op === 'cherry-pick' ? 'o commit' : 'a branch'} não existe neste repositório: passo ignorado`, tone: 'muted', icon: '–' };
    case 'skipped':
      return { text: `não calculado: o passo ${stoppedAt === null ? '?' : stoppedAt + 1} parou a cadeia`, tone: 'muted', icon: '·' };
    case 'error':
      return { text: step.note ?? 'não foi possível simular este passo', tone: 'warn', icon: '✗' };
    case 'conflict': {
      const files = `${plural(step.conflicts.length, 'conflito', 'conflitos')}: ${step.conflicts.join(', ')}`;
      return { text: step.note ? `${files} (${step.note})` : files, tone: 'warn', icon: '⚠' };
    }
    default:
      if (step.upToDate) return { text: step.note ? `${step.note}: nada a fazer` : 'já contido: nada a fazer', tone: 'muted', icon: '✓' };
      if (step.op === 'cherry-pick') return { text: '+1 commit aplicado', tone: 'ok', icon: '✓' };
      if (step.op === 'rebase') {
        return {
          text: step.fastForward ? 'fast-forward: só avança até a branch' : `${plural(step.commits, 'commit reaplicado', 'commits reaplicados')}`,
          tone: 'ok',
          icon: '✓',
        };
      }
      return {
        text: `+${plural(step.commits, 'commit', 'commits')} · ${step.fastForward ? 'fast-forward' : 'commit de merge necessário'}`,
        tone: 'ok',
        icon: '✓',
      };
  }
}

/** O que o passo faz, para o título da linha: "merge feature/x", "rebase sobre main", "cherry-pick 1a2b3c4". */
export function stepTitle(step: { op: string; branch?: string; commit?: string }): string {
  if (step.op === 'cherry-pick') return `cherry-pick ${(step.commit ?? '').slice(0, 8)}`;
  return step.op === 'rebase' ? `rebase sobre ${step.branch}` : `merge ${step.branch}`;
}

/** Uma linha de resumo do repo inteiro. */
export function summarizeRepo(r: RepoScenario): { text: string; tone: StepTone } {
  if (r.reason) return { text: r.reason, tone: 'muted' };
  if (r.stoppedAt !== null) {
    const why = r.steps[r.stoppedAt]?.state === 'error' ? 'não dá para simular' : 'conflito';
    return { text: `para no passo ${r.stoppedAt + 1} (${why})`, tone: 'warn' };
  }
  const applied = r.steps.filter((s) => s.state === 'ok' && !s.upToDate);
  if (!applied.length) return { text: r.steps.some((s) => s.state === 'missing') ? 'nenhum passo se aplica aqui' : 'nada a fazer: já tem tudo', tone: 'muted' };
  return { text: 'sem conflitos', tone: 'ok' };
}

export interface ScenarioTotals {
  clean: number;
  conflict: number;
  /** Fora do cenário: base inexistente, erro, ou nada que se aplique. */
  out: number;
}

export function totals(list: RepoScenario[]): ScenarioTotals {
  const t: ScenarioTotals = { clean: 0, conflict: 0, out: 0 };
  for (const r of list) {
    const s = summarizeRepo(r);
    if (r.reason || s.tone === 'muted') t.out++;
    else if (r.stoppedAt !== null) t.conflict++;
    else t.clean++;
  }
  return t;
}

/** "3 repositórios: 1 sem conflitos · 1 com conflito · 1 fora do cenário" */
export function overallText(list: RepoScenario[]): string {
  const t = totals(list);
  const parts = [
    t.clean ? `${t.clean} sem conflitos` : '',
    t.conflict ? `${t.conflict} com conflito` : '',
    t.out ? `${t.out} fora do cenário` : '',
  ].filter(Boolean);
  return `${plural(list.length, 'repositório', 'repositórios')}: ${parts.join(' · ') || 'nada a mostrar'}`;
}

/** Um passo como o usuário o edita: a operação e o valor digitado (branch, ou commit no cherry-pick). */
export interface StepDraft {
  op: 'merge' | 'cherry-pick' | 'rebase';
  value: string;
}

/** Passos preenchidos, sem espaços; o que vai para a API. */
export function cleanSteps(drafts: StepDraft[]): ScenarioStepInput[] {
  return drafts
    .map((d) => ({ op: d.op, value: d.value.trim() }))
    .filter((d) => d.value)
    .map((d): ScenarioStepInput => (d.op === 'cherry-pick' ? { op: 'cherry-pick', commit: d.value } : { op: d.op, branch: d.value }));
}

/** Move o item `from` para `to` (para reordenar os passos) sem mexer na lista original. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
