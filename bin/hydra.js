#!/usr/bin/env node
// Hydra — © 2026 José Segura (GKsegura) · MIT
// O Node >= 22.18 executa TypeScript direto (type stripping); só silenciamos o aviso.
const emitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  if (String(warning).includes('Type Stripping')) return;
  return emitWarning.call(process, warning, ...args);
};

await import('../src/cli.ts');
