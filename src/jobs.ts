// Hydra — © 2026 José Segura (GKsegura) · MIT
import { randomBytes } from 'node:crypto';
import type { Progress } from './git/index.ts';
import { HttpError } from './http.ts';

export type JobEvent =
  | { type: 'progress'; progress: Progress }
  | { type: 'done'; result: unknown }
  | { type: 'error'; error: string; code?: string };

interface Job {
  id: string;
  key: string;
  label: string;
  last: JobEvent | null;
  finished: boolean;
  listeners: Set<(e: JobEvent) => void>;
}

const KEEP_FINISHED_MS = 5 * 60_000;

/**
 * Operações demoradas (clone, fetch, pull, push…) rodam como "jobs": a API devolve um id na hora e a interface
 * acompanha o progresso por Server-Sent Events. Um job por repositório por vez.
 */
export class Jobs {
  private jobs = new Map<string, Job>();
  private running = new Map<string, string>();

  start(key: string, label: string, run: (progress: (p: Progress) => void) => Promise<unknown>): string {
    const busy = this.running.get(key);
    if (busy) throw new HttpError(409, `Já existe uma operação em andamento (${this.jobs.get(busy)?.label ?? 'git'}). Aguarde terminar.`, 'busy');

    const job: Job = { id: randomBytes(8).toString('hex'), key, label, last: null, finished: false, listeners: new Set() };
    this.jobs.set(job.id, job);
    this.running.set(key, job.id);

    let lastPercent: number | null = -1;
    let lastPhase = '';
    const emit = (e: JobEvent) => {
      job.last = e;
      for (const l of job.listeners) l(e);
    };
    const progress = (p: Progress) => {
      // Só avisa quando a fase ou o percentual muda: o git escreve dezenas de linhas por segundo.
      if (p.phase === lastPhase && p.percent === lastPercent) return;
      lastPhase = p.phase;
      lastPercent = p.percent;
      emit({ type: 'progress', progress: p });
    };

    run(progress)
      .then((result) => emit({ type: 'done', result: result ?? null }))
      .catch((err: Error & { code?: string }) => emit({ type: 'error', error: err.message, code: typeof err.code === 'string' ? err.code : undefined }))
      .finally(() => {
        job.finished = true;
        this.running.delete(key);
        setTimeout(() => this.jobs.delete(job.id), KEEP_FINISHED_MS).unref?.();
      });

    return job.id;
  }

  /** Assina os eventos do job. O último evento é repetido na hora (quem chega atrasado não perde o resultado). */
  subscribe(id: string, listener: (e: JobEvent) => void): () => void {
    const job = this.jobs.get(id);
    if (!job) throw new HttpError(404, 'Operação não encontrada');
    if (job.last) listener(job.last);
    if (job.finished) return () => {};
    job.listeners.add(listener);
    return () => job.listeners.delete(listener);
  }
}
