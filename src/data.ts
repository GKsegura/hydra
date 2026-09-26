// Hydra — © 2026 José Segura (GKsegura) · MIT
import { getCommits, getStatus, listRefs, type Commit, type RepoStatus } from './git/index.ts';
import { layout, type GraphLayout } from './layout.ts';
import type { Repo, Workspace } from './workspace.ts';

export interface RepoSummary extends Repo {
  status: RepoStatus | null;
  error?: string;
}

export interface RepoGraph {
  commits: Commit[];
  layout: GraphLayout;
  refs: { local: string[]; remote: string[]; tags: string[] };
  truncated: boolean;
}

export async function summarize(repo: Repo): Promise<RepoSummary> {
  try {
    return { ...repo, status: await getStatus(repo.path) };
  } catch (err) {
    return { ...repo, status: null, error: (err as Error).message };
  }
}

export interface WorkspaceSummary {
  name: string;
  file: string | null;
  repos: RepoSummary[];
}

export async function workspaceSummary(ws: Workspace): Promise<WorkspaceSummary> {
  return { name: ws.name, file: ws.file, repos: await Promise.all(ws.repos.map(summarize)) };
}

export async function repoGraph(repo: Repo, max: number): Promise<RepoGraph> {
  const [commits, refs] = await Promise.all([getCommits(repo.path, max), listRefs(repo.path)]);
  return { commits, layout: layout(commits), refs, truncated: commits.length >= max };
}
