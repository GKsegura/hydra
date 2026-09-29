// Hydra — © 2026 José Segura (GKsegura) · MIT
// Gera repositórios grandes para reproduzir/medir lentidão. Uso:
//   node scripts/gen-fixture.ts --repos 4 --commits 30000 --profile merges --out C:\temp\hydra-fixture
// Depois abra o arquivo fixture.code-workspace gerado no Hydra.
import { parseArgs } from 'node:util';
import { makeFixtureWorkspace, type FixtureProfile } from '../test/fixture.ts';

const { values } = parseArgs({
  options: {
    repos: { type: 'string', default: '4' },
    commits: { type: 'string', default: '30000' },
    profile: { type: 'string', default: 'merges' },
    out: { type: 'string' },
  },
});

if (!values.out) {
  console.error('Informe --out <pasta> (será criada; use uma pasta vazia).');
  process.exit(1);
}
if (values.profile !== 'linear' && values.profile !== 'merges') {
  console.error('--profile deve ser "linear" ou "merges".');
  process.exit(1);
}

const t0 = Date.now();
const file = makeFixtureWorkspace(values.out, Math.max(1, Number(values.repos) || 4), {
  commits: Math.max(1, Number(values.commits) || 30000),
  profile: values.profile as FixtureProfile,
});
console.log(`Pronto em ${((Date.now() - t0) / 1000).toFixed(1)}s: ${file}`);
