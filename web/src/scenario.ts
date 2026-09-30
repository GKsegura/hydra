// Hydra — © 2026 José Segura (GKsegura) · MIT
// Textos e totais do resultado de um cenário. Funções puras (sem Vue nem DOM) para serem testadas no Node.
import type { RepoScenario, RepoScenarioStep } from '../../src/multi.ts';

export const MAX_STEPS = 10;

export type StepTone = 'ok' | 'warn' | 'muted';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A frase de um passo ("+8 commits · fast-forward", "2 conflitos: a.ts, b.ts"…) e o tom com que ela é mostrada. */
export function describeStep(step: RepoScenarioStep, index: number, stoppedAt: number | null): { text: string; tone: StepTone; icon: string } {
  switch (step.state) {
    case 'missing':
      return { text: 'a branch não existe neste repositório: passo ignorado', tone: 'muted', icon: '–' };
    case 'skipped':
      return { text: `não calculado: o passo ${stoppedAt === null ? '?' : stoppedAt + 1} deu conflito`, tone: 'muted', icon: '·' };
    case 'conflict':
      return { text: `${plural(step.conflicts.length, 'conflito', 'conflitos')}: ${step.conflicts.join(', ')}`, tone: 'warn', icon: '⚠' };
    default:
      if (step.upToDate) return { text: 'já contido: nada a fazer', tone: 'muted', icon: '✓' };
      return {
        text: `+${plural(step.commits, 'commit', 'commits')} · ${step.fastForward ? 'fast-forward' : 'commit de merge necessário'}`,
        tone: 'ok',
        icon: '✓',
      };
  }
}

/** Uma linha de resumo do repo inteiro. */
export function summarizeRepo(r: RepoScenario): { text: string; tone: StepTone } {
  if (r.reason) return { text: r.reason, tone: 'muted' };
  if (r.stoppedAt !== null) return { text: `para no passo ${r.stoppedAt + 1} (conflito)`, tone: 'warn' };
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

/** Passos com branch preenchida, já sem espaços; o que vai para a API. */
export function cleanSteps(branches: string[]): { op: 'merge'; branch: string }[] {
  return branches.map((b) => b.trim()).filter(Boolean).map((branch) => ({ op: 'merge' as const, branch }));
}

/** Move o item `from` para `to` (para reordenar os passos) sem mexer na lista original. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}
