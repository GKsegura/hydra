// Hydra — © 2026 José Segura (GKsegura) · MIT
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { simulateMany, type RepoScenario } from '../src/multi.ts';
import { startServer } from '../src/server.ts';
import type { Repo } from '../src/workspace.ts';
import { cleanup, commitFile, makeRepo, sh, tmpDir } from './helpers.ts';

afterAll(cleanup);
// Montar 3 repositórios com várias branches são dezenas de chamadas ao git: no Windows isso passa dos 30 s padrão.
vi.setConfig({ testTimeout: 180_000 });

const editA = (repo: string, text: string) => commitFile(repo, 'a.txt', `linha 1\n${text}\nlinha 3\n`, `muda para ${text}`);
const asRepo = (id: string, dir: string): Repo => ({ id, name: id.toUpperCase(), path: dir });

/** Um repo com a main já adiantada (nenhuma feature é fast-forward), pronto para receber as branches dos testes. */
function baseRepo(): string {
  const repo = makeRepo();
  commitFile(repo, 'main-only.txt', 'x\n', 'main avança');
  return repo;
}

/** Cria `name` a partir do commit anterior à ponta da main, roda `fn` nela e volta para a main. */
function fork(repo: string, name: string, fn: () => void) {
  sh(repo, 'checkout', '-q', '-b', name, 'main~1');
  fn();
  sh(repo, 'checkout', '-q', 'main');
}

/** api: feature/a e feature/b (b depois de a conflita) · app: as duas, sem conflito · bot: só feature/b. */
function threeRepos(): Repo[] {
  const api = baseRepo();
  fork(api, 'feature/a', () => editA(api, 'A'));
  fork(api, 'feature/b', () => editA(api, 'B'));

  const app = baseRepo();
  fork(app, 'feature/a', () => commitFile(app, 'app.txt', 'app\n', 'app cria arquivo'));
  fork(app, 'feature/b', () => commitFile(app, 'app2.txt', 'app2\n', 'app cria outro'));

  const bot = baseRepo();
  fork(bot, 'feature/b', () => commitFile(bot, 'bot.txt', 'bot\n', 'bot cria arquivo'));
  return [asRepo('api', api), asRepo('app', app), asRepo('bot', bot)];
}

const byId = (list: RepoScenario[], id: string) => list.find((r) => r.id === id)!;

describe('simulateMany (cenário em vários repositórios)', () => {
  it('cada repo tem o seu resultado: limpo, conflito no 2º passo e branch que não existe', async () => {
    const repos = threeRepos();
    const r = await simulateMany(repos, 'main', [{ op: 'merge', branch: 'feature/a' }, { op: 'merge', branch: 'feature/b' }]);

    expect(r.map((x) => x.id)).toEqual(['api', 'app', 'bot']); // mesma ordem pedida

    const api = byId(r, 'api');
    expect(api).toMatchObject({ baseRef: 'main', reason: null, stoppedAt: 1 });
    expect(api.steps.map((s) => s.state)).toEqual(['ok', 'conflict']);
    expect(api.steps[1].conflicts).toEqual(['a.txt']);

    const app = byId(r, 'app');
    expect(app.stoppedAt).toBeNull();
    expect(app.steps.map((s) => s.state)).toEqual(['ok', 'ok']);
    expect(app.steps.every((s) => s.commits === 1)).toBe(true);

    const bot = byId(r, 'bot'); // sem feature/a: o passo 1 não faz nada aqui, o passo 2 entra normalmente
    expect(bot.steps.map((s) => s.state)).toEqual(['missing', 'ok']);
    expect(bot.steps[0]).toMatchObject({ ref: null, branch: 'feature/a' });
    expect(bot.stoppedAt).toBeNull();
  });

  it('o passo depois de um conflito fica "skipped" e stoppedAt usa o índice da lista pedida (com "missing" no meio)', async () => {
    const [api] = threeRepos();
    const r = await simulateMany([api], 'main', [
      { op: 'merge', branch: 'feature/nao-existe' }, // missing neste repo
      { op: 'merge', branch: 'feature/a' },
      { op: 'merge', branch: 'feature/b' }, // conflita
      { op: 'merge', branch: 'feature/a' }, // skipped
    ]);
    expect(r[0].steps.map((s) => s.state)).toEqual(['missing', 'ok', 'conflict', 'skipped']);
    expect(r[0].stoppedAt).toBe(2);
  });

  it('base que não existe num repo deixa só aquele repo de fora, com o motivo', async () => {
    const repos = threeRepos();
    sh(repos[1].path, 'branch', 'develop'); // só o app tem "develop"
    const r = await simulateMany(repos, 'develop', [{ op: 'merge', branch: 'feature/a' }]);
    expect(byId(r, 'app')).toMatchObject({ baseRef: 'develop', reason: null });
    expect(byId(r, 'api')).toMatchObject({ baseRef: null, steps: [] });
    expect(byId(r, 'api').reason).toMatch(/base não existe/);
  });

  it('usa a branch remota quando não há local (como o merge de verdade)', async () => {
    const origin = baseRepo();
    fork(origin, 'feature/a', () => commitFile(origin, 'a2.txt', 'a\n', 'a'));
    const clone = path.join(tmpDir(), 'clone');
    sh(path.dirname(clone), 'clone', '-q', origin, clone); // no clone, feature/a só existe como origin/feature/a
    const r = await simulateMany([asRepo('clone', clone)], 'main', [{ op: 'merge', branch: 'feature/a' }]);
    expect(r[0].steps[0]).toMatchObject({ ref: 'origin/feature/a', state: 'ok' });
  });

  it('cherry-pick de um commit (hash) só existe no repo de onde ele veio; nos outros o passo fica "missing"', async () => {
    const repos = threeRepos();
    const appCommit = sh(repos[1].path, 'rev-parse', 'feature/a').trim(); // commit que só o app tem
    const r = await simulateMany(repos, 'main', [{ op: 'cherry-pick', commit: appCommit }]);
    expect(byId(r, 'app').steps[0]).toMatchObject({ op: 'cherry-pick', commit: appCommit, state: 'ok', commits: 1 });
    expect(byId(r, 'api').steps[0]).toMatchObject({ state: 'missing', ref: null, commit: appCommit });
    expect(byId(r, 'bot').steps[0].state).toBe('missing');
  });

  it('cherry-pick por nome de branch pega a ponta dela em cada repo; rebase reaplica a base sobre a branch', async () => {
    const repos = threeRepos();
    const pick = await simulateMany(repos, 'main', [{ op: 'cherry-pick', commit: 'feature/b' }]);
    expect(pick.map((x) => x.steps[0].state)).toEqual(['ok', 'ok', 'ok']);

    // base = feature/a, reaplicada sobre a main: o commit da feature entra limpo
    const rebase = await simulateMany([repos[1]], 'feature/a', [{ op: 'rebase', branch: 'main' }]);
    expect(rebase[0].steps[0]).toMatchObject({ op: 'rebase', branch: 'main', state: 'ok', commits: 1 });
  });

  it('conflito ou erro de um passo novo para a cadeia e preenche stoppedAt', async () => {
    const [api] = threeRepos();
    const b = sh(api.path, 'rev-parse', 'feature/b').trim();
    const r = await simulateMany([api], 'main', [
      { op: 'merge', branch: 'feature/a' },
      { op: 'cherry-pick', commit: b }, // conflita com o merge do passo 1
      { op: 'rebase', branch: 'feature/a' }, // skipped
    ]);
    expect(r[0].steps.map((s) => s.state)).toEqual(['ok', 'conflict', 'skipped']);
    expect(r[0].stoppedAt).toBe(1);
  });

  it('não muda nada nos repositórios (refs, HEAD, árvore de trabalho)', async () => {
    const repos = threeRepos();
    const snap = () => repos.map((r) => sh(r.path, 'for-each-ref') + sh(r.path, 'rev-parse', 'HEAD') + sh(r.path, 'status', '--porcelain'));
    const before = snap();
    await simulateMany(repos, 'main', [{ op: 'merge', branch: 'feature/a' }, { op: 'merge', branch: 'feature/b' }]);
    expect(snap()).toEqual(before);
  });
});

describe('POST /w/:wid/workspace/scenario/simulate', () => {
  async function boot() {
    const dir = tmpDir();
    const srv = await startServer(null, { port: 0, max: 50, recentsFile: path.join(dir, 'recents.json'), sessionFile: path.join(dir, 'session.json') });
    // Um workspace de verdade: uma pasta com os 3 repos dentro (clones: as features ficam como origin/feature/*).
    const root = tmpDir();
    for (const r of threeRepos()) sh(root, 'clone', '-q', '--no-hardlinks', r.path, path.join(root, r.id));
    srv.session.open(root, 'add');
    const wid = srv.session.active!.id;
    const call = (body: unknown, token = srv.token) =>
      fetch(`http://127.0.0.1:${srv.port}/api/w/${wid}/workspace/scenario/simulate`, {
        method: 'POST',
        headers: { 'x-hydra-token': token, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    return { srv, call, ids: srv.session.active!.ws.repos.map((r) => r.id) };
  }

  it('devolve um resultado por repo e valida o corpo', async () => {
    const { srv, call, ids } = await boot();
    try {
      const ok = await call({ repos: ids, base: 'main', steps: [{ op: 'merge', branch: 'feature/a' }, { op: 'merge', branch: 'feature/b' }] });
      expect(ok.status).toBe(200);
      const body = (await ok.json()) as RepoScenario[];
      expect(body.map((r) => r.id).sort()).toEqual([...ids].sort());
      expect(body.find((r) => r.id === 'api')?.stoppedAt).toBe(1);
      expect(body.find((r) => r.id === 'bot')?.steps[0].state).toBe('missing');

      const bad = async (b: unknown) => (await call(b)).status;
      expect(await bad({ repos: ids, steps: [{ op: 'merge', branch: 'x' }] })).toBe(400); // sem base
      expect(await bad({ repos: ids, base: 'main', steps: [] })).toBe(400); // sem passos
      expect(await bad({ repos: ids, base: 'main', steps: [{ op: 'squash', branch: 'x' }] })).toBe(400); // passo desconhecido
      expect(await bad({ repos: ids, base: 'main', steps: [{ op: 'cherry-pick' }] })).toBe(400); // cherry-pick sem commit
      expect(await bad({ repos: ids, base: 'main', steps: [{ op: 'cherry-pick', commit: '--upload-pack=x' }] })).toBe(400);
      expect(await bad({ repos: ids, base: 'main', steps: [{ op: 'rebase' }] })).toBe(400); // rebase sem branch
      expect(await bad({ repos: ids, base: 'main', steps: [{ op: 'merge' }] })).toBe(400); // sem branch
      expect(await bad({ repos: [], base: 'main', steps: [{ op: 'merge', branch: 'x' }] })).toBe(400); // sem repos
      expect(await bad({ repos: ['nao-existe'], base: 'main', steps: [{ op: 'merge', branch: 'x' }] })).toBe(404);
      expect(await bad({ repos: [ids[0], ids[0]], base: 'main', steps: [{ op: 'merge', branch: 'x' }] })).toBe(400); // repetido
      const many = Array.from({ length: 11 }, () => ({ op: 'merge', branch: 'feature/a' }));
      expect(await bad({ repos: ids, base: 'main', steps: many })).toBe(400); // passos demais
      expect((await call({ repos: ids, base: 'main', steps: [{ op: 'merge', branch: 'feature/a' }] }, 'errado')).status).toBe(401);
    } finally {
      srv.server.close();
    }
  });
});
