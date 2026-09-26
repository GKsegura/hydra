// Hydra — © 2026 José Segura (GKsegura) · MIT
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const created: string[] = [];

/** Roda git de forma síncrona (só nos testes, para montar cenários). */
export function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

export function tmpDir(prefix = 'hydra-test-'): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Repositório novo com identidade configurada e um commit inicial em main. */
export function makeRepo(): string {
  const dir = tmpDir();
  sh(dir, 'init', '-q', '-b', 'main');
  sh(dir, 'config', 'user.name', 'Teste Hydra');
  sh(dir, 'config', 'user.email', 'teste@hydra.local');
  sh(dir, 'config', 'core.autocrlf', 'false');
  write(dir, 'a.txt', 'linha 1\nlinha 2\nlinha 3\n');
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', 'inicial');
  return dir;
}

export function write(dir: string, file: string, content: string) {
  writeFileSync(path.join(dir, file), content);
}

export function commitFile(dir: string, file: string, content: string, message: string) {
  write(dir, file, content);
  sh(dir, 'add', '-A');
  sh(dir, 'commit', '-q', '-m', message);
}

/** Repositório "na nuvem" (bare) + um clone de trabalho, para testar fetch/pull/push sem internet. */
export function makeRemotePair(): { remote: string; work: string } {
  const seed = makeRepo();
  const remote = path.join(tmpDir(), 'remote.git');
  sh(path.dirname(remote), 'clone', '-q', '--bare', seed, remote);
  const work = path.join(tmpDir(), 'work');
  sh(path.dirname(work), 'clone', '-q', remote, work);
  sh(work, 'config', 'user.name', 'Teste Hydra');
  sh(work, 'config', 'user.email', 'teste@hydra.local');
  sh(work, 'config', 'core.autocrlf', 'false');
  return { remote, work };
}

export function cleanup() {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
}
