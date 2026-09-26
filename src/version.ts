// Hydra — © 2026 José Segura (GKsegura) · MIT
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Versão do package.json (a mesma que o semantic-release atualiza e a interface mostra na sidebar). */
export const VERSION: string = (() => {
  try {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../package.json');
    return (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
  } catch {
    return '0.0.0';
  }
})();

/**
 * `candidate` é uma versão mais nova que `current`? Semver simples (X.Y.Z, aceita "v" na frente).
 * Pré-releases (1.2.0-beta) contam como anteriores à versão final.
 */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) => {
    const [core, pre] = v.trim().replace(/^v/i, '').split('-', 2);
    const nums = core.split('.').map((n) => Number.parseInt(n, 10) || 0);
    return { nums: [nums[0] ?? 0, nums[1] ?? 0, nums[2] ?? 0], pre: pre ?? null };
  };
  const a = parse(candidate);
  const b = parse(current);
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  if (a.pre === b.pre) return false;
  if (a.pre === null) return true; // 1.2.0 > 1.2.0-beta
  if (b.pre === null) return false;
  return a.pre > b.pre;
}

export const SIGNATURE =`Hydra v${VERSION} — crafted by GKsegura`;

/** Assinatura GKsegura (a mesma dos projetos CRONOS), impressa no terminal ao iniciar o CLI. */
export const BANNER = [
  ' ██████╗ ██╗  ██╗███████╗███████╗ ██████╗ ██╗   ██╗██████╗  █████╗',
  '██╔════╝ ██║ ██╔╝██╔════╝██╔════╝██╔════╝ ██║   ██║██╔══██╗██╔══██╗',
  '██║  ███╗█████╔╝ ███████╗█████╗  ██║  ███╗██║   ██║██████╔╝███████║',
  '██║   ██║██╔═██╗ ╚════██║██╔══╝  ██║   ██║██║   ██║██╔══██╗██╔══██║',
  '╚██████╔╝██║  ██╗███████║███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║',
  ' ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝',
].join('\n');
