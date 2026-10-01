// Hydra — © 2026 José Segura (GKsegura) · MIT
// Os tipos vêm direto do backend: front e servidor falam a mesma língua.
export type {
  Branch, Commit, CommitDetail, ConflictFile, FileChange, MergePreview, MergeResult, Operation, Progress, Ref, Remote,
  RebaseAction, RebaseCommit, RebasePlan, RebaseStep, RepoStatus, Segment, Stash,
} from '../../src/git/index.ts';
export type { GitHubRepo, PullRequest } from '../../src/github.ts';
export type { JobEvent } from '../../src/jobs.ts';
export type { RepoBranches, RepoMergePreview, RepoResult, RepoScenario, RepoScenarioStep, ScenarioStepInput } from '../../src/multi.ts';

import type { Branch, Operation, Remote, Stash } from '../../src/git/index.ts';
import type { PullRequest } from '../../src/github.ts';
import type { LoginState } from '../../src/github-session.ts';

export interface BranchInfo {
  branches: Branch[];
  remotes: Remote[];
  stashes: Stash[];
  current: string | null;
}

export interface OperationInfo {
  operation: Operation;
  message: string;
  current: string;
  incoming: string | null;
  conflicts: { path: string; kind: string | undefined }[];
}

export interface GitHubInfo {
  /** Login com GitHub liberado? Por enquanto não: a interface mostra "em breve". */
  enabled: boolean;
  available: boolean;
  configured: boolean;
  canLogin: boolean;
  user: { login: string; name: string | null; avatar: string; url: string } | null;
  login: LoginState;
}

export interface PullsInfo {
  repo: string | null;
  pulls: PullRequest[];
  error?: string;
}
export type { Edge, GraphLayout, Node } from '../../src/layout.ts';
export type { RepoGraph, RepoSummary, WorkspaceSummary } from '../../src/data.ts';

import type { RepoGraph, WorkspaceSummary } from '../../src/data.ts';

export type { Recent } from '../../src/recents.ts';
import type { Recent } from '../../src/recents.ts';

/** Estado do app no servidor: workspace aberto (ou nenhum) e recentes. */
export interface AppInfo {
  desktop: boolean;
  version: string;
  defaultDir: string;
  /** O workspace ativo (o front atual só mostra este). */
  workspace: { id: string; name: string; file: string | null; source: string | null } | null;
  /** As guias abertas, na ordem, e a ativa (null = tela inicial). */
  tabs: { id: string; name: string; file: string | null; source: string | null }[];
  active: string | null;
  recents: Recent[];
  /** Aviso a mostrar uma vez (ex.: não foi possível reabrir o último workspace). */
  notice?: string | null;
}

/** Ponte exposta pelo preload do app desktop (Electron). */
export interface DesktopBridge {
  pickWorkspace(kind: 'file' | 'folder'): Promise<string | null>;
  pathForFile(file: File): string;
  onMenu(callback: (action: string) => void): void;
  onUpdate(callback: (state: UpdateState) => void): void;
  installUpdate(): Promise<void>;
}

/** Atualização do app desktop (instalado: baixa e instala; portátil: só avisa). Espelha electron/updater.ts. */
export type UpdateState =
  | { state: 'idle' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'available'; version: string; url: string };

export interface Boot {
  mode: 'server' | 'static';
  desktop?: boolean;
  token?: string;
  workspace?: string;
  generatedAt?: number;
  data?: { summary: WorkspaceSummary; graphs: Record<string, RepoGraph> };
}

/** Terminal integrado: disponível se o node-pty estiver instalado; `shell` é o nome exibido (ex.: "Git Bash"). */
export interface TerminalInfo {
  available: boolean;
  shell: string | null;
}

export type Selection ={ repoId: string; type: 'commit'; hash: string } | { repoId: string; type: 'wip' };

declare global {
  interface Window {
    HYDRA_BOOT?: Boot | null;
    hydraDesktop?: DesktopBridge;
  }
}
