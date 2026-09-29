// Hydra — © 2026 José Segura (GKsegura) · MIT
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { startServer, type RunningServer } from '../src/server.ts';
import { SessionStore } from '../src/session-store.ts';
import { cleanup, commitFile, makeRepo, sh, tmpDir } from './helpers.ts';

afterAll(cleanup);

interface Tabs {
  tabs: { id: string; name: string; source: string | null }[];
  active: string | null;
  workspace: { id: string } | null;
  notice?: string | null;
}

async function boot(extra: Record<string, unknown> = {}) {
  const dir = tmpDir();
  const files = { recentsFile: path.join(dir, 'recents.json'), sessionFile: path.join(dir, 'session.json') };
  const srv = await startServer(null, { port: 0, max: 50, ...files, ...extra });
  const call = (method: string, url: string, body?: unknown, token = srv.token) =>
    fetch(`http://127.0.0.1:${srv.port}/api${url}`, {
      method,
      headers: { 'x-hydra-token': token, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const json = async <T>(method: string, url: string, body?: unknown) => (await call(method, url, body)).json() as Promise<T>;
  return { srv, files, call, json };
}

const repoIdOf = (srv: RunningServer, wid: string) => srv.session.get(wid)!.ws.repos[0].id;

describe('API com vários workspaces', () => {
  it("abrir em 'add' cria guias em ordem; abrir o mesmo de novo só o ativa; modo inválido dá 400", async () => {
    const { srv, call, json } = await boot();
    try {
      const [a, b] = [makeRepo(), makeRepo()];
      await json('POST', '/workspace/open', { path: a, mode: 'add' });
      const two = await json<Tabs>('POST', '/workspace/open', { path: b, mode: 'add' });
      expect(two.tabs.map((t) => t.source)).toEqual([path.resolve(a), path.resolve(b)]);
      expect(two.active).toBe(two.tabs[1].id);
      expect(two.workspace!.id).toBe(two.active);

      const again = await json<Tabs>('POST', '/workspace/open', { path: a, mode: 'add' });
      expect(again.tabs).toHaveLength(2);
      expect(again.active).toBe(two.tabs[0].id);

      expect((await call('POST', '/workspace/open', { path: a, mode: 'xis' })).status).toBe(400);

      const replaced = await json<Tabs>('POST', '/workspace/open', { path: b }); // padrão: substitui
      expect(replaced.tabs).toHaveLength(1);
    } finally {
      srv.server.close();
    }
  });

  it('/w/:wid alcança um workspace que não é o ativo; rota sem prefixo não existe; wid desconhecido dá 404', async () => {
    const { srv, call, json } = await boot();
    try {
      const [a, b] = [makeRepo(), makeRepo()];
      sh(a, 'checkout', '-q', '-b', 'so-no-a');
      await json('POST', '/workspace/open', { path: a, mode: 'add' });
      const tabs = await json<Tabs>('POST', '/workspace/open', { path: b, mode: 'add' }); // b ativo
      const [wa, wb] = tabs.tabs.map((t) => t.id);

      const statusA = await json<{ branch: string }>('GET', `/w/${wa}/repos/${repoIdOf(srv, wa)}/status`);
      const statusB = await json<{ branch: string }>('GET', `/w/${wb}/repos/${repoIdOf(srv, wb)}/status`);
      expect(statusA.branch).toBe('so-no-a');
      expect(statusB.branch).toBe('main');

      // As rotas sem prefixo (que valiam para o workspace ativo) foram removidas: tudo passa por /w/:wid.
      expect((await call('GET', `/repos/${repoIdOf(srv, wb)}/status`)).status).toBe(404);
      expect((await call('GET', '/workspace')).status).toBe(404);

      expect((await json<{ name: string }>('GET', `/w/${wa}/workspace`)).name).toBe(path.basename(a));
      expect((await call('GET', '/w/naoexiste/workspace')).status).toBe(404);
      expect((await call('GET', `/w/${wa}/workspace`, undefined, 'errado')).status).toBe(401);
    } finally {
      srv.server.close();
    }
  });

  it('escolher a guia ativa (inclusive o Início) e reordenar', async () => {
    const { srv, call, json } = await boot();
    try {
      const [a, b, c] = [makeRepo(), makeRepo(), makeRepo()];
      for (const d of [a, b, c]) await json('POST', '/workspace/open', { path: d, mode: 'add' });
      const ids = (await json<Tabs>('GET', '/app')).tabs.map((t) => t.id);

      expect((await json<Tabs>('POST', '/session/active', { id: ids[0] })).active).toBe(ids[0]);
      const home = await json<Tabs>('POST', '/session/active', { id: null });
      expect(home.active).toBeNull();
      expect(home.workspace).toBeNull();
      expect((await call('GET', `/w/${ids[0]}/workspace`)).status).toBe(200); // no Início, as guias continuam abertas
      expect((await call('POST', '/session/active', { id: 'naoexiste' })).status).toBe(404);
      expect((await call('POST', '/session/active', { id: 7 })).status).toBe(400);

      const reversed = [...ids].reverse();
      expect((await json<Tabs>('POST', '/session/order', { ids: reversed })).tabs.map((t) => t.id)).toEqual(reversed);
      expect((await call('POST', '/session/order', { ids: [ids[0]] })).status).toBe(400); // faltam guias
      expect((await call('POST', '/session/order', { ids: [ids[0], ids[0], ids[1]] })).status).toBe(400); // repetida
    } finally {
      srv.server.close();
    }
  });

  it('informações do terminal não dependem de haver workspace aberto', async () => {
    const { srv, call } = await boot();
    try {
      const res = await call('GET', '/terminal');
      expect(res.status).toBe(200);
      expect(await res.json()).toHaveProperty('available');
      expect((await call('DELETE', '/terminals/0000000000000000')).status).toBe(200);
    } finally {
      srv.server.close();
    }
  });

  it('fechar uma guia pelo id tira só ela; depois o id passa a dar 404', async () => {
    const { srv, call, json } = await boot();
    try {
      const [a, b] = [makeRepo(), makeRepo()];
      await json('POST', '/workspace/open', { path: a, mode: 'add' });
      const tabs = await json<Tabs>('POST', '/workspace/open', { path: b, mode: 'add' });
      const [wa, wb] = tabs.tabs.map((t) => t.id);

      const after = await json<Tabs>('POST', `/w/${wa}/close`);
      expect(after.tabs.map((t) => t.id)).toEqual([wb]);
      expect(after.active).toBe(wb); // fechar uma guia que não é a ativa não muda a ativa
      expect((await call('GET', `/w/${wa}/workspace`)).status).toBe(404);
      expect((await call('POST', `/w/${wa}/close`)).status).toBe(404);
    } finally {
      srv.server.close();
    }
  });

  it('a sessão salva guarda todas as guias na ordem, com a ativa', async () => {
    const { srv, files, json } = await boot();
    try {
      const [a, b] = [makeRepo(), makeRepo()];
      await json('POST', '/workspace/open', { path: a, mode: 'add' });
      await json('POST', '/workspace/open', { path: b, mode: 'add' });
      const ids = (await json<Tabs>('GET', '/app')).tabs.map((t) => t.id);
      await json('POST', '/session/active', { id: ids[0] });
      expect(new SessionStore(files.sessionFile).read()).toEqual({
        tabs: [{ source: path.resolve(a) }, { source: path.resolve(b) }],
        activeTab: 0,
      });
      await json('POST', '/session/active', { id: null }); // no Início: reabre na última guia usada
      expect(new SessionStore(files.sessionFile).read().activeTab).toBe(0);
    } finally {
      srv.server.close();
    }
  });
});

describe('restaurar todas as guias', () => {
  it('reabre na ordem, ativa a salva, pula a que sumiu e avisa uma vez', async () => {
    const dir = tmpDir();
    const [a, b, c] = [makeRepo(), makeRepo(), makeRepo()];
    const gone = path.join(dir, 'sumiu');
    const files = { recentsFile: path.join(dir, 'recents.json'), sessionFile: path.join(dir, 'session.json') };
    new SessionStore(files.sessionFile).write({ tabs: [{ source: a }, { source: gone }, { source: b }, { source: c }], activeTab: 2 });

    const srv = await startServer(null, { port: 0, max: 50, restore: true, ...files });
    try {
      const get = async () =>
        (await (await fetch(`http://127.0.0.1:${srv.port}/api/app`, { headers: { 'x-hydra-token': srv.token } })).json()) as Tabs;
      const first = await get();
      expect(first.tabs.map((t) => t.source)).toEqual([path.resolve(a), path.resolve(b), path.resolve(c)]);
      expect(first.active).toBe(first.tabs[1].id); // "b" era a ativa
      expect(first.notice).toContain('sumiu');
      expect((await get()).notice).toBeNull();
      // reabrir a sessão não bagunça os recentes
      expect(srv.session.recents.list()).toEqual([]);
      // e a lista salva agora só tem as que abriram
      expect(new SessionStore(files.sessionFile).read().tabs).toHaveLength(3);
    } finally {
      srv.server.close();
    }
  });

  it('se a guia ativa salva falhou, ativa a primeira que abriu', async () => {
    const dir = tmpDir();
    const [a, b] = [makeRepo(), makeRepo()];
    const files = { recentsFile: path.join(dir, 'recents.json'), sessionFile: path.join(dir, 'session.json') };
    new SessionStore(files.sessionFile).write({ tabs: [{ source: a }, { source: path.join(dir, 'sumiu') }, { source: b }], activeTab: 1 });
    const srv = await startServer(null, { port: 0, max: 50, restore: true, ...files });
    try {
      expect(srv.session.all()).toHaveLength(2);
      expect(srv.session.active!.ws.source).toBe(path.resolve(a));
    } finally {
      srv.server.close();
    }
  });
});

describe('tempo real com vários workspaces', () => {
  it('o aviso de mudança diz de qual workspace veio, mesmo o que não é o ativo', async () => {
    const { srv, json } = await boot();
    const abort = new AbortController();
    try {
      const [a, b] = [makeRepo(), makeRepo()];
      await json('POST', '/workspace/open', { path: a, mode: 'add' });
      const tabs = await json<Tabs>('POST', '/workspace/open', { path: b, mode: 'add' }); // b é o ativo
      const wa = tabs.tabs[0].id;

      const res = await fetch(`http://127.0.0.1:${srv.port}/api/events?t=${srv.token}`, { signal: abort.signal });
      const reader = res.body!.getReader();
      await new Promise((r) => setTimeout(r, 300)); // watchers prontos
      commitFile(a, 'novo.txt', 'x\n', 'commit no workspace inativo');

      let text = '';
      const end = Date.now() + 8000;
      while (!text.includes('workspaceId') && Date.now() < end) {
        const { value, done } = await reader.read();
        if (done) break;
        text += new TextDecoder().decode(value);
      }
      const data = text.split('\n').find((l) => l.startsWith('data: '));
      expect(data).toBeDefined();
      expect(JSON.parse(data!.slice(6))).toMatchObject({ workspaceId: wa, repoId: repoIdOf(srv, wa) });
    } finally {
      abort.abort();
      srv.server.close();
    }
  });
});
