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

export const SIGNATURE = `Hydra v${VERSION} — crafted by GKsegura`;

/** Assinatura GKsegura (a mesma dos projetos CRONOS), impressa no terminal ao iniciar o CLI. */
export const BANNER = [
  ' ██████╗ ██╗  ██╗███████╗███████╗ ██████╗ ██╗   ██╗██████╗  █████╗',
  '██╔════╝ ██║ ██╔╝██╔════╝██╔════╝██╔════╝ ██║   ██║██╔══██╗██╔══██╗',
  '██║  ███╗█████╔╝ ███████╗█████╗  ██║  ███╗██║   ██║██████╔╝███████║',
  '██║   ██║██╔═██╗ ╚════██║██╔══╝  ██║   ██║██║   ██║██╔══██╗██╔══██║',
  '╚██████╔╝██║  ██╗███████║███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║',
  ' ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝',
].join('\n');
