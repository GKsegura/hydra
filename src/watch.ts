// Hydra — © 2026 José Segura (GKsegura) · MIT
// Atualização em tempo real: observa cada repo aberto e avisa a interface quando algo muda,
// seja pelo Hydra, pelo VS Code, pelo terminal integrado ou por qualquer outro programa.
import { watch, type FSWatcher } from 'node:fs';
import type { Repo } from './workspace.ts';

/**
 * - `repo`: mudou o que está no `.git` (commit, checkout, pull, merge, stash, tag…): recarrega grafo e status.
 * - `status`: só a árvore de trabalho mudou (arquivo salvo, criado, apagado): basta recarregar o status.
 */
export type RepoChangeKind = 'repo' | 'status';
export interface RepoChange {
  repoId: string;
  kind: RepoChangeKind;
}

const DEBOUNCE_MS = 400;

// Dentro do .git, só o que muda o que a interface mostra. objects/ e logs/ mudam o tempo todo e não dizem nada sozinhos.
const GIT_RELEVANT = /^\.git\/(HEAD|index|packed-refs|FETCH_HEAD|ORIG_HEAD|MERGE_HEAD|CHERRY_PICK_HEAD|REVERT_HEAD|refs\/.*|rebase-merge(\/.*)?|rebase-apply(\/.*)?)$/;

/**
 * Classifica um caminho (relativo à raiz do repo) vindo do `fs.watch`.
 * `null` = ignorar. Sem nome (alguns sistemas não informam) conta como mudança geral.
 */
export function classifyChange(filename: string | null): RepoChangeKind | null {
  if (filename === null) return 'repo';
  const f = filename.replace(/\\/g, '/');
  if (f === '.git' || f.startsWith('.git/')) {
    if (f.endsWith('.lock')) return null; // o arquivo final (sem .lock) gera o próprio evento
    return GIT_RELEVANT.test(f) ? 'repo' : null;
  }
  if (/(^|\/)node_modules(\/|$)/.test(f)) return null;
  return 'status';
}

/** Um `fs.watch` recursivo por repo do workspace aberto, com debounce por repo. */
export class RepoWatchers {
  private watchers: FSWatcher[] = [];
  private pending = new Map<string, { kind: RepoChangeKind; timer: ReturnType<typeof setTimeout> }>();
  private listeners = new Set<(change: RepoChange) => void>();

  /** Assina as mudanças. Devolve a função que cancela a assinatura. */
  subscribe(listener: (change: RepoChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Passa a observar estes repos (fecha os anteriores). */
  watch(repos: Repo[]) {
    this.close();
    for (const repo of repos) {
      try {
        const w = watch(repo.path, { recursive: true }, (_event, filename) => {
          const kind = classifyChange(typeof filename === 'string' ? filename : null);
          if (kind) this.queue(repo.id, kind);
        });
        // Pasta apagada ou sem permissão: o repo só deixa de atualizar sozinho (F5 continua funcionando).
        w.on('error', () => w.close());
        this.watchers.push(w);
      } catch (err) {
        console.error(`Não foi possível observar ${repo.path}:`, (err as Error).message);
      }
    }
  }

  close() {
    for (const w of this.watchers) w.close();
    this.watchers = [];
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.pending.clear();
  }

  // Um commit mexe em dezenas de arquivos em milissegundos: junta tudo num aviso só, com o tipo "mais forte".
  private queue(repoId: string, kind: RepoChangeKind) {
    const prev = this.pending.get(repoId);
    if (prev) clearTimeout(prev.timer);
    const merged: RepoChangeKind = prev?.kind === 'repo' || kind === 'repo' ? 'repo' : 'status';
    const timer = setTimeout(() => {
      this.pending.delete(repoId);
      for (const l of this.listeners) l({ repoId, kind: merged });
    }, DEBOUNCE_MS);
    timer.unref?.();
    this.pending.set(repoId, { kind: merged, timer });
  }
}
