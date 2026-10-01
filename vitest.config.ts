// Hydra — © 2026 José Segura (GKsegura) · MIT
import { defineConfig } from 'vitest/config';

// Separado do vite.config.ts (que aponta para web/): os testes rodam no Node, contra repositórios temporários.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // test/simulate-ops.test.ts e test/simulate.test.ts conferem que o simulador de cenários não deixa
    // pasta temporária para trás varrendo os.tmpdir() inteiro — com arquivos rodando em paralelo, um
    // hydra-sim-* de outro arquivo pode existir no instante da varredura e derrubar o teste à toa.
    fileParallelism: false,
  },
});
