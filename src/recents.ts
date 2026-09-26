// Hydra — © 2026 José Segura (GKsegura) · MIT
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Recent {
  path: string;
  name: string;
  openedAt: number;
}

const LIMIT = 10;

export const defaultRecentsFile = () => path.join(os.homedir(), '.hydra', 'recents.json');

/** Lista de workspaces abertos recentemente, guardada num JSON. Caminhos que sumiram do disco são descartados. */
export class Recents {
  file: string;

  constructor(file: string) {
    this.file = file;
  }

  list(): Recent[] {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Recent[];
      return Array.isArray(data) ? data.filter((r) => r && typeof r.path === 'string' && existsSync(r.path)) : [];
    } catch {
      return [];
    }
  }

  add(entry: Omit<Recent, 'openedAt'>): Recent[] {
    const key = entry.path.toLowerCase();
    const next = [{ ...entry, openedAt: Date.now() }, ...this.list().filter((r) => r.path.toLowerCase() !== key)].slice(0, LIMIT);
    this.save(next);
    return next;
  }

  remove(p: string): Recent[] {
    const next = this.list().filter((r) => r.path.toLowerCase() !== p.toLowerCase());
    this.save(next);
    return next;
  }

  private save(list: Recent[]) {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(list, null, 2));
    } catch {
      /* sem permissão de escrita: os recentes só não são lembrados */
    }
  }
}
