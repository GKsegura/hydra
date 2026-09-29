// Hydra — © 2026 José Segura (GKsegura) · MIT
import { createHash } from 'node:crypto';
import { HttpError } from './http.ts';
import type { Repo, Workspace } from './workspace.ts';

/** Id estável de um workspace, pelo caminho de origem (sem diferenciar maiúsculas, como no Windows). */
export function workspaceId(source: string): string {
  return createHash('sha1').update(source.toLowerCase()).digest('hex').slice(0, 10);
}

/** Um workspace aberto (uma guia): o que foi carregado dele e a busca de repositórios por id. */
export class WorkspaceSession {
  readonly id: string;
  readonly ws: Workspace;
  private repos: Map<string, Repo>;

  constructor(ws: Workspace) {
    this.ws = ws;
    this.id = workspaceId(ws.source ?? ws.file ?? ws.name);
    this.repos = new Map(ws.repos.map((r) => [r.id, r]));
  }

  current(): Workspace {
    return this.ws;
  }

  repo(id: string): Repo {
    const repo = this.repos.get(id);
    if (!repo) throw new HttpError(404, 'Repositório não encontrado');
    return repo;
  }
}
