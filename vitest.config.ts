// Hydra — © 2026 José Segura (GKsegura) · MIT
import { defineConfig } from 'vitest/config';

// Separado do vite.config.ts (que aponta para web/): os testes rodam no Node, contra repositórios temporários.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
