// Hydra — © 2026 José Segura (GKsegura) · MIT
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { git } from './core.ts';
import type { FileChange } from './status.ts';

const MAX_UNTRACKED_PREVIEW = 512 * 1024;

/** Diff de um arquivo da área de trabalho (staged ou não). Untracked vira um diff sintético de "tudo novo". */
export async function getWorkingDiff(cwd: string, file: FileChange, staged: boolean): Promise<string> {
  if (!staged && file.work === '?') {
    const full = path.join(cwd, file.path);
    const size = statSync(full).size;
    if (size > MAX_UNTRACKED_PREVIEW) return `Arquivo novo (${(size / 1024).toFixed(0)} KB) — grande demais para pré-visualizar.`;
    const buf = readFileSync(full);
    if (buf.includes(0)) return 'Arquivo binário novo.';
    const lines = buf.toString('utf8').split(/\r?\n/);
    if (lines[lines.length - 1] === '') lines.pop();
    return [`--- /dev/null`, `+++ b/${file.path}`, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((l) => '+' + l)].join('\n');
  }
  return git(cwd, ['diff', '--no-color', ...(staged ? ['--cached'] : []), '--', file.path]);
}
