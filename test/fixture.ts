// Hydra — © 2026 José Segura (GKsegura) · MIT
// Gerador de repositórios grandes para medir performance (usado pelos testes e por scripts/gen-fixture.ts).
// Usa `git fast-import`: dezenas de milhares de commits em segundos, em vez de um `git commit` por vez.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type FixtureProfile = 'linear' | 'merges';

export interface FixtureOptions {
  commits: number;
  profile: FixtureProfile;
}

const BASE_TIME = 1_700_000_000;

/** Monta o stream do fast-import. Em 'merges', a cada 7 commits na main sai uma branch de 2 commits que volta com merge. */
export function fastImportStream({ commits, profile }: FixtureOptions): string {
  const out: string[] = [];
  let mark = 0;
  let time = BASE_TIME;
  let main = 0;
  let side = 0;

  const emit = (ref: string, from: number, merge: number, subject: string) => {
    const id = ++mark;
    time += 60;
    const ident = `Fixture <fixture@hydra.local> ${time} +0000`;
    const file = `f${id % 20}.txt`;
    const body = `linha ${id}\n`;
    out.push(`commit ${ref}`, `mark :${id}`, `author ${ident}`, `committer ${ident}`);
    out.push(`data ${Buffer.byteLength(subject)}`, subject);
    if (from) out.push(`from :${from}`);
    if (merge) out.push(`merge :${merge}`);
    out.push(`M 644 inline ${file}`, `data ${Buffer.byteLength(body)}`, body.trimEnd(), '');
    return id;
  };

  let total = 0;
  while (total < commits) {
    if (profile === 'merges' && total > 0 && total % 7 === 0 && total + 3 <= commits) {
      const ref = `refs/heads/feature/f${(side++ % 12)}`;
      const a = emit(ref, main, 0, `feature ${total} a`);
      const b = emit(ref, a, 0, `feature ${total} b`);
      main = emit('refs/heads/main', main, b, `merge feature ${total}`);
      total += 3;
    } else {
      main = emit('refs/heads/main', main, 0, `commit ${total}`);
      total += 1;
    }
  }
  return `${out.join('\n')}\n`;
}

/** Cria (ou completa) um repositório em `dir` com `commits` commits no perfil pedido. */
export function makeFixtureRepo(dir: string, opts: FixtureOptions): string {
  mkdirSync(dir, { recursive: true });
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@hydra.local');
  git('config', 'core.autocrlf', 'false');
  const r = spawnSync('git', ['fast-import', '--quiet'], { cwd: dir, input: fastImportStream(opts), maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`git fast-import falhou: ${r.stderr?.toString()}`);
  git('checkout', '-q', '-f', 'main');
  return dir;
}

/** Cria N repositórios em `root` (api, app, bot, infra…) e um arquivo .code-workspace que os reúne. */
export function makeFixtureWorkspace(root: string, repos: number, opts: FixtureOptions): string {
  const names = ['api', 'app', 'bot', 'infra', 'web', 'docs', 'jobs', 'lib'];
  const folders: { path: string }[] = [];
  for (let i = 0; i < repos; i++) {
    const name = names[i] ?? `repo${i}`;
    makeFixtureRepo(path.join(root, name), opts);
    folders.push({ path: name });
  }
  const file = path.join(root, 'fixture.code-workspace');
  writeFileSync(file, JSON.stringify({ folders }, null, 2));
  return file;
}
