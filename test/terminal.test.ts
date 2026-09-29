// Hydra — © 2026 José Segura (GKsegura) · MIT
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { startServer } from '../src/server.ts';
import { findShell, Terminals, type TerminalClient } from '../src/terminal.ts';
import { cleanup, makeRepo, tmpDir } from './helpers.ts';

afterAll(cleanup);

// O node-pty é dependência opcional (módulo nativo): sem ele, o terminal fica indisponível e estes testes são pulados.
const probe = new Terminals();
await probe.init();
const available = probe.info().available;

/** Espera até `check()` ser verdadeiro (saída do shell chega aos poucos). */
async function until(check: () => boolean, ms = 15_000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('tempo esgotado esperando o terminal');
    await new Promise((r) => setTimeout(r, 50));
  }
}

describe('findShell', () => {
  it('encontra um shell que existe (Git Bash no Windows)', () => {
    const shell = findShell();
    if (process.platform === 'win32') {
      expect(shell.name === 'PowerShell' || existsSync(shell.file)).toBe(true);
      if (shell.name === 'Git Bash') expect(shell.args).toContain('--login');
    } else {
      expect(shell.args).toContain('-l');
    }
  });
});

describe.skipIf(!available)('Terminals', () => {
  it('abre o shell na pasta do repo, executa comandos e encerra', async () => {
    const dir = makeRepo();
    const terminals = new Terminals();
    await terminals.init();
    const { id } = terminals.spawn({ id: 'r1', name: 'repo', path: dir }, 100, 30);

    let out = '';
    let closed: number | null = null;
    const client: TerminalClient = { send: (d) => (out += d), close: (code) => (closed = code) };
    const link = terminals.attach(id, client)!;
    link.message('iecho hydra-$((20+22))-ok\r');
    await until(() => out.includes('hydra-42-ok'));
    link.message('r{"cols":120,"rows":40}'); // redimensionar não quebra a sessão
    link.message('igit rev-parse --show-toplevel\r');
    await until(() => out.includes(path.basename(dir)));

    // Reconectar repete a saída recente
    let replay = '';
    terminals.attach(id, { send: (d) => (replay += d), close: () => {} })!.detach();
    expect(replay).toContain('hydra-42-ok');

    terminals.kill(id);
    await until(() => closed !== null);
    expect(terminals.has(id)).toBe(false);
    expect(terminals.attach(id, client)).toBeNull();
  });
});

describe.skipIf(!available)('Terminais por workspace', () => {
  it('killAll(dono) encerra só os terminais daquele workspace', async () => {
    const dir = makeRepo();
    const terminals = new Terminals();
    await terminals.init();
    const repo = { id: 'r1', name: 'repo', path: dir };
    const a = terminals.spawn(repo, 80, 24, 'wa').id;
    const b = terminals.spawn(repo, 80, 24, 'wb').id;
    terminals.killAll('wa');
    expect(terminals.has(a)).toBe(false);
    expect(terminals.has(b)).toBe(true);
    terminals.killAll();
    expect(terminals.has(b)).toBe(false);
  });
});

describe.skipIf(!available)('Terminal em workspace que não é o ativo', () => {
  it('abre por /w/:wid e fechar essa guia encerra só o terminal dela', async () => {
    const dir = tmpDir();
    const srv = await startServer(null, { port: 0, max: 10, recentsFile: path.join(dir, 'recents.json'), sessionFile: path.join(dir, 'session.json') });
    try {
      srv.session.open(makeRepo(), 'add');
      srv.session.open(makeRepo(), 'add'); // este é o ativo
      const [wa, wb] = srv.session.all().map((w) => w.id);
      const spawn = async (wid: string) => {
        const res = await fetch(`http://127.0.0.1:${srv.port}/api/w/${wid}/repos/${srv.session.get(wid)!.ws.repos[0].id}/terminals`, {
          method: 'POST',
          headers: { 'x-hydra-token': srv.token, 'content-type': 'application/json' },
          body: JSON.stringify({ cols: 80, rows: 24 }),
        });
        return ((await res.json()) as { id: string }).id;
      };
      const ta = await spawn(wa); // workspace inativo
      const tb = await spawn(wb);
      expect(srv.terminals.has(ta)).toBe(true);
      expect(srv.terminals.has(tb)).toBe(true);

      srv.session.closeWorkspace(wa);
      expect(srv.terminals.has(ta)).toBe(false);
      expect(srv.terminals.has(tb)).toBe(true);
    } finally {
      srv.server.close();
    }
  });
});

describe.skipIf(!available)('WebSocket do terminal', () => {
  it('exige o token e a origem local', async () => {
    const dir = makeRepo();
    const srv = await startServer(dir, { port: 0, max: 10, recentsFile: path.join(tmpDir(), 'recents.json') });
    const repoId = srv.session.current().repos[0].id;
    const base = `127.0.0.1:${srv.port}`;
    const res = await fetch(`http://${base}/api/repos/${repoId}/terminals`, {
      method: 'POST',
      headers: { 'x-hydra-token': srv.token, 'content-type': 'application/json' },
      body: JSON.stringify({ cols: 80, rows: 24 }),
    });
    const { id } = (await res.json()) as { id: string };
    expect(id).toMatch(/^[0-9a-f]{16}$/);

    /** Tenta conectar: devolve o status HTTP da recusa, ou 101 e a primeira saída. */
    const tryConnect = (token: string, origin: string) =>
      new Promise<{ status: number; ws?: WebSocket }>((resolve) => {
        const ws = new WebSocket(`ws://${base}/api/terminals/${id}/ws?t=${token}`, { headers: { origin } });
        ws.on('unexpected-response', (_req, r) => resolve({ status: r.statusCode ?? 0 }));
        ws.on('error', () => resolve({ status: 0 }));
        ws.on('open', () => resolve({ status: 101, ws }));
      });

    expect((await tryConnect('errado', `http://${base}`)).status).toBe(403);
    expect((await tryConnect(srv.token, 'https://site-malicioso.com')).status).toBe(403);

    const ok = await tryConnect(srv.token, `http://${base}`);
    expect(ok.status).toBe(101);
    let out = '';
    ok.ws!.on('message', (d) => (out += d.toString()));
    ok.ws!.send('iecho via-websocket\r');
    await until(() => out.includes('via-websocket'));

    // Fechar o workspace encerra os terminais dele
    srv.session.close();
    await until(() => ok.ws!.readyState === WebSocket.CLOSED);
    expect(srv.terminals.has(id)).toBe(false);

    srv.server.closeAllConnections();
    await new Promise((r) => srv.server.close(r));
  });
});
