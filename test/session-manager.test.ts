// Hydra — © 2026 José Segura (GKsegura) · MIT
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Session } from '../src/server.ts';
import { workspaceId } from '../src/workspace-session.ts';
import { makeRepo, tmpDir } from './helpers.ts';

function manager() {
  const dir = tmpDir();
  const session = new Session(path.join(dir, 'recents.json'), path.join(dir, 'session.json'));
  const closed: string[] = [];
  const opened: string[] = [];
  session.onClose = (id) => closed.push(id);
  session.onOpen = (w) => opened.push(w.id);
  return { session, closed, opened };
}

describe('Session com vários workspaces', () => {
  it('open() padrão substitui: fecha os anteriores e só o novo fica aberto', () => {
    const { session, closed } = manager();
    session.open(makeRepo());
    const first = session.active!.id;
    session.open(makeRepo());
    expect(session.all()).toHaveLength(1);
    expect(closed).toEqual([first]);
  });

  it("open(…, 'add') mantém os outros, na ordem, e ativa o novo", () => {
    const { session, closed, opened } = manager();
    const [a, b, c] = [makeRepo(), makeRepo(), makeRepo()];
    session.open(a, 'add');
    session.open(b, 'add');
    session.open(c, 'add');
    expect(session.all().map((w) => w.ws.source)).toEqual([a, b, c].map((d) => path.resolve(d)));
    expect(session.active!.ws.source).toBe(path.resolve(c));
    expect(closed).toEqual([]);
    expect(opened).toHaveLength(3);
  });

  it('abrir de novo um workspace já aberto só o ativa (sem duplicar nem reabrir)', () => {
    const { session, opened } = manager();
    const [a, b] = [makeRepo(), makeRepo()];
    session.open(a, 'add');
    session.open(b, 'add');
    session.open(a, 'add');
    expect(session.all()).toHaveLength(2);
    expect(session.active!.ws.source).toBe(path.resolve(a));
    expect(opened).toHaveLength(2);
  });

  it('fechar um workspace avisa só o dele; o ativo passa para o vizinho', () => {
    const { session, closed } = manager();
    const [a, b, c] = [makeRepo(), makeRepo(), makeRepo()];
    [a, b, c].forEach((d) => session.open(d, 'add'));
    const ids = session.all().map((w) => w.id);
    session.activate(ids[1]);
    session.closeWorkspace(ids[1]);
    expect(closed).toEqual([ids[1]]);
    expect(session.all().map((w) => w.id)).toEqual([ids[0], ids[2]]);
    expect(session.active!.id).toBe(ids[2]);
    session.closeWorkspace(ids[2]);
    expect(session.active!.id).toBe(ids[0]);
    session.closeWorkspace(ids[0]);
    expect(session.active).toBeNull();
    expect(() => session.current()).toThrow(/Nenhum workspace/);
  });

  it('repo() procura no workspace ativo', () => {
    const { session } = manager();
    const [a, b] = [makeRepo(), makeRepo()];
    session.open(a, 'add');
    const idA = session.repo(session.current().repos[0].id).path;
    session.open(b, 'add');
    expect(session.repo(session.current().repos[0].id).path).not.toBe(idA);
    expect(() => session.repo('nao-existe')).toThrow(/não encontrado/);
  });

  it('grava todas as guias e a ativa na sessão salva', () => {
    const { session } = manager();
    const [a, b] = [makeRepo(), makeRepo()];
    session.open(a, 'add');
    session.open(b, 'add');
    session.activate(session.all()[0].id);
    expect(session.store.read()).toEqual({ tabs: [{ source: path.resolve(a) }, { source: path.resolve(b) }], activeTab: 0 });
  });
});

describe('workspaceId', () => {
  it('é estável e não diferencia maiúsculas', () => {
    expect(workspaceId('C:\\Proj\\A')).toBe(workspaceId('c:\\proj\\a'));
    expect(workspaceId('C:\\x')).not.toBe(workspaceId('C:\\y'));
  });
});
