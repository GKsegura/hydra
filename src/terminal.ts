// Hydra — © 2026 José Segura (GKsegura) · MIT
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { HttpError } from './http.ts';
import type { Repo } from './workspace.ts';

// Tipos mínimos do node-pty: ele é dependência opcional (módulo nativo), então não importamos os tipos dele.
interface Pty {
  onData(cb: (data: string) => void): unknown;
  onExit(cb: (e: { exitCode: number }) => void): unknown;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}
interface PtyModule {
  spawn(file: string, args: string[], opts: { name: string; cols: number; rows: number; cwd: string; env: NodeJS.ProcessEnv }): Pty;
}

/** Quem recebe a saída de um terminal (a interface, via WebSocket). */
export interface TerminalClient {
  send(data: string): void;
  close(code: number, reason: string): void;
}

interface TermSession {
  id: string;
  repoId: string;
  pty: Pty;
  /** Saída recente, repetida quando a interface reconecta (F5, troca de aba). */
  buffer: string[];
  size: number;
  clients: Set<TerminalClient>;
}

export interface Shell {
  file: string;
  args: string[];
  name: string;
}

const SCROLLBACK_BYTES = 200 * 1024;
const MAX_TERMINALS = 20;

/**
 * Git Bash quando existir (a raiz sai de `git --exec-path`: …\Git\mingw64\libexec\git-core → …\Git\bin\bash.exe),
 * senão PowerShell. Fora do Windows, o shell do usuário.
 */
export function findShell(): Shell {
  if (process.platform !== 'win32') {
    return { file: process.env.SHELL || '/bin/bash', args: ['-l'], name: path.basename(process.env.SHELL || 'bash') };
  }
  const candidates: string[] = [];
  try {
    const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8', windowsHide: true }).trim();
    const root = exec.replace(/[\\/](mingw64|mingw32|clangarm64|usr)[\\/]libexec[\\/]git-core$/i, '');
    if (root !== exec) candidates.push(path.join(root, 'bin', 'bash.exe'), path.join(root, 'usr', 'bin', 'bash.exe'));
  } catch {
    // git fora do PATH: tenta os caminhos padrão
  }
  candidates.push('C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe');
  const bash = candidates.find((c) => existsSync(c));
  if (bash) return { file: bash, args: ['--login', '-i'], name: 'Git Bash' };
  return { file: 'powershell.exe', args: ['-NoLogo'], name: 'PowerShell' };
}

/** Terminais abertos pela interface: um processo de shell (pty) por aba, sempre na pasta de um repo do workspace. */
export class Terminals {
  private sessions = new Map<string, TermSession>();
  private pty: PtyModule | null = null;
  private shellCache: Shell | null = null;

  /** Carrega o node-pty. Se ele não estiver instalado (dependência opcional), o terminal fica indisponível. */
  async init() {
    try {
      const mod = (await import('node-pty')) as unknown as PtyModule & { default?: PtyModule };
      this.pty = typeof mod.spawn === 'function' ? mod : (mod.default ?? null);
    } catch {
      this.pty = null;
    }
  }

  get shell(): Shell {
    return (this.shellCache ??= findShell());
  }

  info() {
    return { available: !!this.pty, shell: this.pty ? this.shell.name : null };
  }

  spawn(repo: Repo, cols: number, rows: number): { id: string; shell: string } {
    if (!this.pty) throw new HttpError(501, 'Terminal indisponível: o módulo node-pty não foi instalado.');
    if (this.sessions.size >= MAX_TERMINALS) throw new HttpError(429, 'Muitos terminais abertos. Feche algum antes.');
    const shell = this.shell;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      CHERE_INVOKING: '1', // o login shell do Git Bash faz `cd ~` sem isso
    };
    delete env.ELECTRON_RUN_AS_NODE;
    const pty = this.pty.spawn(shell.file, shell.args, { name: 'xterm-256color', cols: clamp(cols, 80), rows: clamp(rows, 24), cwd: repo.path, env });
    const session: TermSession = { id: randomBytes(8).toString('hex'), repoId: repo.id, pty, buffer: [], size: 0, clients: new Set() };
    this.sessions.set(session.id, session);

    pty.onData((data) => {
      session.buffer.push(data);
      session.size += data.length;
      while (session.size > SCROLLBACK_BYTES && session.buffer.length > 1) session.size -= session.buffer.shift()!.length;
      for (const c of session.clients) c.send(data);
    });
    pty.onExit(({ exitCode }) => {
      this.sessions.delete(session.id);
      for (const c of session.clients) c.close(4000, `exit ${exitCode}`);
    });
    return { id: session.id, shell: shell.name };
  }

  has(id: string): boolean {
    return this.sessions.has(id);
  }

  /** Liga um cliente ao terminal: repete a saída recente e passa a receber a nova. Devolve quem trata as mensagens. */
  attach(id: string, client: TerminalClient): { message: (msg: string) => void; detach: () => void } | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (session.buffer.length) client.send(session.buffer.join(''));
    session.clients.add(client);
    return {
      // Protocolo: "i<texto>" é entrada do teclado; "r{cols,rows}" é redimensionamento.
      message: (msg) => {
        if (msg[0] === 'i') session.pty.write(msg.slice(1));
        else if (msg[0] === 'r') {
          try {
            const { cols, rows } = JSON.parse(msg.slice(1)) as { cols: unknown; rows: unknown };
            session.pty.resize(clamp(cols, 80), clamp(rows, 24));
          } catch {
            // mensagem de resize malformada: ignora
          }
        }
      },
      detach: () => session.clients.delete(client),
    };
  }

  kill(id: string) {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    try {
      session.pty.kill();
    } catch {
      // o processo já tinha saído
    }
  }

  /** Fecha todos os terminais (troca/fechamento do workspace, encerramento do servidor). */
  killAll() {
    for (const id of [...this.sessions.keys()]) this.kill(id);
  }
}

function clamp(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 2 ? Math.min(n, 1000) : fallback;
}
