// Hydra — © 2026 José Segura (GKsegura) · MIT
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

export interface Repo {
  id: string;
  name: string;
  path: string;
}

export interface Workspace {
  name: string;
  file: string | null;
  /** O que foi aberto (arquivo .code-workspace ou pasta) — é o que vai para os recentes. */
  source?: string;
  repos: Repo[];
}

/** Remove comentários e vírgulas finais de um JSONC (formato do .code-workspace). */
function parseJsonc(text: string): unknown {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inString) {
      out += ch;
      if (ch === '\\') out += text[++i] ?? '';
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

function isGitRepo(dir: string): boolean {
  return existsSync(path.join(dir, '.git'));
}

function slug(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'repo';
}

function withIds(entries: { name: string; path: string }[]): Repo[] {
  const used = new Set<string>();
  return entries.map((e) => {
    let id = slug(e.name);
    for (let n = 2; used.has(id); n++) id = `${slug(e.name)}-${n}`;
    used.add(id);
    return { id, ...e };
  });
}

function fromWorkspaceFile(file: string): Workspace {
  const data = parseJsonc(readFileSync(file, 'utf8')) as { folders?: { path: string; name?: string }[] };
  const base = path.dirname(file);
  const entries = (data.folders ?? [])
    .map((f) => {
      const dir = path.resolve(base, f.path);
      return { name: f.name ?? path.basename(dir), path: dir };
    })
    .filter((e) => isGitRepo(e.path));
  return { name: path.basename(file, '.code-workspace'), file, repos: withIds(entries) };
}

function fromFolder(dir: string): Workspace {
  if (isGitRepo(dir)) {
    return { name: path.basename(dir), file: null, repos: withIds([{ name: path.basename(dir), path: dir }]) };
  }
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isGitRepo(path.join(dir, d.name)))
    .map((d) => ({ name: d.name, path: path.join(dir, d.name) }));
  return { name: path.basename(dir), file: null, repos: withIds(entries) };
}

/**
 * Resolve o alvo passado ao CLI:
 * - um arquivo .code-workspace → usa as pastas dele;
 * - uma pasta com exatamente um .code-workspace → usa esse arquivo;
 * - uma pasta que é repo → só ela;
 * - uma pasta qualquer → as subpastas que são repos.
 */
export function loadWorkspace(target: string): Workspace {
  const full = path.resolve(target);
  if (!existsSync(full)) throw new Error(`Caminho não encontrado: ${full}`);

  if (statSync(full).isFile()) {
    if (!full.endsWith('.code-workspace')) throw new Error(`Esperava um arquivo .code-workspace ou uma pasta: ${full}`);
    return { ...fromWorkspaceFile(full), source: full };
  }

  const wsFiles = readdirSync(full).filter((f) => f.endsWith('.code-workspace'));
  if (wsFiles.length === 1) {
    const file = path.join(full, wsFiles[0]);
    return { ...fromWorkspaceFile(file), source: file };
  }
  return { ...fromFolder(full), source: full };
}
