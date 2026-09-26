// Hydra — © 2026 José Segura (GKsegura) · MIT
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { friendly, git, GitError, gitRaw, gitStream, type Progress } from './core.ts';

/** Aceita https://, ssh://, git@host:dono/repo e caminhos locais (útil para repositórios em rede/pendrive). */
export function assertCloneUrl(url: string): void {
  const u = url.trim();
  const ok = /^(https?|ssh|git|file):\/\//i.test(u) || /^[\w.-]+@[\w.-]+:/.test(u) || /^[A-Za-z]:[\\/]/.test(u) || u.startsWith('\\\\') || u.startsWith('/');
  if (!u || u.startsWith('-') || !ok) throw new GitError('URL de repositório inválida. Ex.: https://github.com/dono/repo.git');
}

/** Pasta de destino sugerida: <pai>/<nome do repo>. */
export function repoNameFromUrl(url: string): string {
  const last = url.trim().replace(/[\\/]+$/, '').split(/[\\/:]/).pop() ?? 'repo';
  return last.replace(/\.git$/i, '') || 'repo';
}

function assertEmptyTarget(dir: string) {
  if (existsSync(dir) && (!statSync(dir).isDirectory() || readdirSync(dir).length > 0)) {
    throw new GitError(`A pasta "${dir}" já existe e não está vazia.`);
  }
}

export async function clone(url: string, dest: string, onProgress: (p: Progress) => void): Promise<string> {
  assertCloneUrl(url);
  const target = path.resolve(dest);
  assertEmptyTarget(target);
  mkdirSync(path.dirname(target), { recursive: true });
  const r = await gitStream(path.dirname(target), ['clone', '--progress', '--', url.trim(), target], onProgress);
  if (r.code !== 0) throw new GitError(friendly(r.stderr) || 'Não foi possível clonar.', r.stderr);
  return target;
}

// ---------------------------------------------------------------- novo repositório

const GITIGNORES: Record<string, string> = {
  none: '',
  node: ['node_modules/', 'dist/', 'build/', 'coverage/', '.env', '.env.*', '!.env.example', '*.log', '.DS_Store', 'Thumbs.db'].join('\n'),
  vue: ['node_modules/', 'dist/', 'dist-ssr/', 'coverage/', '*.local', '.env', '.env.*', '!.env.example', '*.log', '.vite/', '.DS_Store', 'Thumbs.db'].join('\n'),
  java: ['target/', 'build/', '.gradle/', 'out/', '*.class', '*.jar', '*.war', '.idea/', '*.iml', '.vscode/', '*.log', 'hs_err_pid*', '.env'].join('\n'),
  python: ['__pycache__/', '*.py[cod]', '.venv/', 'venv/', 'env/', 'dist/', 'build/', '*.egg-info/', '.pytest_cache/', '.mypy_cache/', '.env', '*.log'].join('\n'),
};

export const GITIGNORE_TEMPLATES = Object.keys(GITIGNORES);

export interface InitOptions {
  gitignore?: string;
  readme?: boolean;
  description?: string;
}

/** Cria um repositório novo (branch main), com .gitignore/README opcionais e um commit inicial. */
export async function initRepo(dir: string, opts: InitOptions = {}): Promise<{ path: string; committed: boolean }> {
  const target = path.resolve(dir);
  if (existsSync(path.join(target, '.git'))) throw new GitError('Essa pasta já é um repositório git.');
  mkdirSync(target, { recursive: true });
  await git(target, ['init', '-b', 'main']);

  const name = path.basename(target);
  const template = GITIGNORES[opts.gitignore ?? 'none'] ?? '';
  if (template && !existsSync(path.join(target, '.gitignore'))) writeFileSync(path.join(target, '.gitignore'), `${template}\n`);
  if (opts.readme && !existsSync(path.join(target, 'README.md'))) {
    writeFileSync(path.join(target, 'README.md'), `# ${name}\n${opts.description?.trim() ? `\n${opts.description.trim()}\n` : ''}`);
  }

  // Commit inicial só se houver algo para commitar e a identidade do git estiver configurada.
  await git(target, ['add', '-A']);
  const hasStaged = (await gitRaw(target, ['diff', '--cached', '--quiet'])).code === 1;
  if (!hasStaged) return { path: target, committed: false };
  const r = await gitRaw(target, ['commit', '-m', 'chore: commit inicial']);
  return { path: target, committed: r.code === 0 };
}
