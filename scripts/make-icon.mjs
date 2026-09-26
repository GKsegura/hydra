// Hydra — © 2026 José Segura (GKsegura) · MIT
// Gera build/icon.png (512px) a partir de build/icon.svg. O electron-builder converte o PNG para .ico.
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('build/icon.svg', 'utf8');
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 512 } }).render().asPng();
writeFileSync('build/icon.png', png);
console.log('build/icon.png gerado');
