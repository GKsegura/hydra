// Hydra — © 2026 José Segura (GKsegura) · MIT
// Empacota src/extension.ts num único dist/extension.js (CommonJS — é o que o host de extensões do VS Code espera).
import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  external: ['vscode'],
  logLevel: 'info',
});
