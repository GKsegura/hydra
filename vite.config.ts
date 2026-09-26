// Hydra — © 2026 José Segura (GKsegura) · MIT
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// O front vive em web/ e é compilado para web/dist, que o servidor do hydra entrega.
export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [vue()],
  // Versão exibida na sidebar/tela inicial (a mesma que o semantic-release grava no package.json).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    // Bundle único de propósito (ver abaixo); o xterm.js do terminal integrado sozinho passa de 300 kB.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      // Nomes fixos e um único bundle: facilita embutir tudo no HTML do modo --out.
      output: { entryFileNames: 'assets/app.js', assetFileNames: 'assets/app[extname]', inlineDynamicImports: true },
    },
  },
  server: {
    // `npm run dev`: a API (e o WebSocket do terminal) continua sendo o hydra rodando na 4711.
    proxy: { '/api': { target: 'http://127.0.0.1:4711', changeOrigin: true, ws: true } },
  },
});
