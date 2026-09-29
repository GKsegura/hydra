// Hydra — © 2026 José Segura (GKsegura) · MIT
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Session, startServer } from '../src/server.ts';
import { SessionStore } from '../src/session-store.ts';
import { hashText, layoutKeyFor, legacyLayoutKey } from '../web/src/layout-key.ts';
import { makeRepo, tmpDir } from './helpers.ts';

const files = () => {
  const dir = tmpDir();
  return { recents: path.join(dir, 'recents.json'), session: path.join(dir, 'session.json') };
};

describe('SessionStore', () => {
  it('sem arquivo, ou com arquivo corrompido, devolve sessão vazia', () => {
    const { session } = files();
    expect(new SessionStore(session).read()).toEqual({ tabs: [], activeTab: 0 });
    writeFileSync(session, '{ isto não é json');
    expect(new SessionStore(session).read()).toEqual({ tabs: [], activeTab: 0 });
  });

  it('grava e lê de volta; fechar limpa a sessão', () => {
    const store = new SessionStore(files().session);
    store.setSingle('C:\\x\\ws.code-workspace');
    expect(store.read()).toEqual({ tabs: [{ source: 'C:\\x\\ws.code-workspace' }], activeTab: 0 });
    store.clear();
    expect(store.read()).toEqual({ tabs: [], activeTab: 0 });
  });

  it('ignora guias inválidas e ajusta o índice da guia ativa', () => {
    const { session } = files();
    writeFileSync(session, JSON.stringify({ tabs: [{ source: 'a' }, { source: 42 }, null, { source: '' }, { source: 'b' }], activeTab: 9 }));
    expect(new SessionStore(session).read()).toEqual({ tabs: [{ source: 'a' }, { source: 'b' }], activeTab: 1 });
  });
});

describe('Session: restaurar o último workspace', () => {
  it('abrir grava a sessão; um novo Session reabre o mesmo workspace; fechar tira da sessão mas não dos recentes', () => {
    const f = files();
    const dir = makeRepo();
    const first = new Session(f.recents, f.session);
    first.open(dir);

    const second = new Session(f.recents, f.session);
    expect(second.restore()).toBe(1);
    expect(second.ws?.repos).toHaveLength(1);

    second.close();
    expect(new Session(f.recents, f.session).restore()).toBe(0);
    expect(second.recents.list().map((r) => r.path.toLowerCase())).toContain(path.resolve(dir).toLowerCase());
  });

  it('caminho que sumiu: fica sem workspace e deixa um aviso (entregue uma só vez)', () => {
    const f = files();
    new SessionStore(f.session).setSingle(path.join(tmpDir(), 'nao-existe'));
    const s = new Session(f.recents, f.session);
    expect(s.restore()).toBe(0);
    expect(s.ws).toBeNull();
    expect(s.takeNotice()).toContain('Não foi possível reabrir');
    expect(s.takeNotice()).toBeNull();
  });

  it('startServer só restaura com restore: true, e sem caminho na linha de comando', async () => {
    const f = files();
    const dir = makeRepo();
    new SessionStore(f.session).setSingle(dir);
    const base = { port: 0, max: 10, recentsFile: f.recents, sessionFile: f.session };

    const plain = await startServer(null, base);
    expect(plain.session.ws).toBeNull();
    plain.server.close();

    const restored = await startServer(null, { ...base, restore: true });
    expect(restored.session.ws).not.toBeNull();
    restored.server.close();

    const other = makeRepo();
    // Com restore, o caminho da linha de comando é mais uma guia (ativa), sem perder as restauradas.
    const explicit = await startServer(other, { ...base, restore: true });
    expect(path.resolve(explicit.session.ws!.source!)).toBe(path.resolve(other));
    expect(explicit.session.all().map((w) => w.ws.source)).toEqual([path.resolve(dir), path.resolve(other)]);
    explicit.server.close();

    // Sem restore (CLI), o caminho substitui.
    const cli = await startServer(other, { ...base });
    expect(cli.session.all()).toHaveLength(1);
    cli.server.close();
  });
});

describe('chave do layout salvo', () => {
  it('é estável e não diferencia maiúsculas no caminho', () => {
    expect(layoutKeyFor('C:\\Proj\\A.code-workspace', 'a')).toBe(layoutKeyFor('c:\\proj\\a.code-workspace', 'a'));
    expect(hashText('abc')).toBe(hashText('abc'));
  });

  it('dois workspaces com o mesmo nome em pastas diferentes têm chaves diferentes', () => {
    expect(layoutKeyFor('C:\\x\\backend', 'backend')).not.toBe(layoutKeyFor('C:\\y\\backend', 'backend'));
  });

  it('sem caminho (HTML estático), cai na chave antiga por nome', () => {
    expect(layoutKeyFor(null, 'cronos')).toBe(legacyLayoutKey('cronos'));
    expect(legacyLayoutKey('cronos')).toBe('hydra:cronos:layout');
  });
});
