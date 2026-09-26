// Hydra — © 2026 José Segura (GKsegura) · MIT
// Compila o processo principal e o preload do app desktop para dist-electron/.
// O main vira ESM (o package.json é "type": "module"); o preload precisa ser CommonJS (sandbox do Electron).
// As dependências (express) ficam de fora do bundle: o electron-builder empacota o node_modules de produção.
import { build } from 'esbuild';

const common = { bundle: true, platform: 'node', target: 'node22', packages: 'external', logLevel: 'info' };

await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.js', format: 'esm' });
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs', format: 'cjs' });
