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
  /** Workspace dono do repo (ausente quando quem observa não informou um). */
  workspaceId?: string;
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

/**
 * Um `fs.watch` recursivo por repo, com debounce por repo. Cada grupo de repos tem um dono (o workspace):
 * observar de novo ou fechar um dono não mexe nos demais. Sem dono, tudo cai no mesmo grupo (`''`).
 */
export class RepoWatchers {
  private watchers = new Map<string, FSWatcher[]>();
  private pending = new Map<string, { owner: string; repoId: string; kind: RepoChangeKind; timer: ReturnType<typeof setTimeout> }>();
  private listeners = new Set<(change: RepoChange) => void>();

  /** Assina as mudanças. Devolve a função que cancela a assinatura. */
  subscribe(listener: (change: RepoChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Passa a observar estes repos (fecha os anteriores do mesmo dono). */
  watch(repos: Repo[], owner = '') {
    this.close(owner);
    const list: FSWatcher[] = [];
    this.watchers.set(owner, list);
    for (const repo of repos) {
      try {
        const w = watch(repo.path, { recursive: true }, (_event, filename) => {
          const kind = classifyChange(typeof filename === 'string' ? filename : null);
          if (kind) this.queue(owner, repo.id, kind);
        });
        // Pasta apagada ou sem permissão: o repo só deixa de atualizar sozinho (F5 continua funcionando).
        w.on('error', () => w.close());
        list.push(w);
      } catch (err) {
        console.error(`Não foi possível observar ${repo.path}:`, (err as Error).message);
      }
    }
  }

  /** Fecha os observadores (e avisos pendentes) de um dono; sem argumento, de todos. */
  close(owner?: string) {
    for (const [o, list] of this.watchers) {
      if (owner !== undefined && o !== owner) continue;
      for (const w of list) w.close();
      this.watchers.delete(o);
    }
    for (const [key, p] of this.pending) {
      if (owner !== undefined && p.owner !== owner) continue;
      clearTimeout(p.timer);
      this.pending.delete(key);
    }
  }

  // Um commit mexe em dezenas de arquivos em milissegundos: junta tudo num aviso só, com o tipo "mais forte".
  private queue(owner: string, repoId: string, kind: RepoChangeKind) {
    const key = `${owner}\0${repoId}`;
    const prev = this.pending.get(key);
    if (prev) clearTimeout(prev.timer);
    const merged: RepoChangeKind = prev?.kind === 'repo' || kind === 'repo' ? 'repo' : 'status';
    const timer = setTimeout(() => {
      this.pending.delete(key);
      const change: RepoChange = owner ? { workspaceId: owner, repoId, kind: merged } : { repoId, kind: merged };
      for (const l of this.listeners) l(change);
    }, DEBOUNCE_MS);
    timer.unref?.();
    this.pending.set(key, { owner, repoId, kind: merged, timer });
  }
}
