// Hydra — © 2026 José Segura (GKsegura) · MIT
import { execFile, spawn } from 'node:child_process';

export const FS = '\x1f';
export const RS = '\x1e';

export class GitError extends Error {
  stderr: string;
  code: string | undefined;
  constructor(message: string, stderr = '', code?: string) {
    super(message);
    this.stderr = stderr;
    this.code = code;
  }
}

const BASE_ARGS = ['-c', 'core.quotepath=off', '-c', 'color.ui=false', '-c', 'i18n.logOutputEncoding=utf-8'];

// Token do GitHub (login no app). Vai por variáveis GIT_CONFIG_* e não pela linha de comando,
// pra não aparecer na lista de processos; e nunca é gravado no .git/config.
let githubToken: string | null = null;
export function setGitHubToken(token: string | null) {
  githubToken = token;
}

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0', // nunca travar esperando senha no terminal; o Credential Manager usa janela própria
    GCM_INTERACTIVE: 'auto',
  };
  if (githubToken) {
    const basic = Buffer.from(`x-access-token:${githubToken}`).toString('base64');
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basic}`;
  }
  return env;
}

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Executa git sem shell e devolve o código de saída sem lançar erro (para comandos em que 1 = "tem conflito"). */
export function gitRaw(cwd: string, args: string[], input?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const child = execFile(
      'git',
      [...BASE_ARGS, ...args],
      { cwd, maxBuffer: 256 * 1024 * 1024, encoding: 'utf8', windowsHide: true, env: gitEnv() },
      (err, stdout, stderr) => {
        const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number((err as NodeJS.ErrnoException).code) : 1) : 0;
        resolve({ code, stdout, stderr });
      },
    );
    if (input !== undefined) child.stdin?.end(input);
  });
}

/** Executa git sem shell, com saída em UTF-8 e sem cores. Lança GitError se o comando falhar. */
export async function git(cwd: string, args: string[], input?: string): Promise<string> {
  const r = await gitRaw(cwd, args, input);
  if (r.code !== 0) throw new GitError(friendly(r.stderr || r.stdout) || `git ${args[0]} falhou`, r.stderr);
  return r.stdout;
}

export async function gitOrNull(cwd: string, args: string[]): Promise<string | null> {
  const r = await gitRaw(cwd, args);
  return r.code === 0 ? r.stdout : null;
}

export interface Progress {
  phase: string;
  percent: number | null;
  line: string;
}

/**
 * Executa operações de rede (clone, fetch, pull, push) repassando o progresso que o git escreve no stderr
 * ("Receiving objects:  45% (450/1000)").
 */
export function gitStream(cwd: string, args: string[], onProgress: (p: Progress) => void): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', [...BASE_ARGS, ...args], { cwd, windowsHide: true, env: gitEnv() });
    let stdout = '';
    let stderr = '';
    let pending = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => {
      stderr += d;
      pending += d;
      const parts = pending.split(/[\r\n]/);
      pending = parts.pop() ?? '';
      for (const line of parts.map((l) => l.trim()).filter(Boolean)) {
        const m = /^(?:remote:\s*)?([A-Za-zÀ-ú ]+):\s+(\d+)%/.exec(line);
        onProgress({ phase: m ? m[1].trim() : line, percent: m ? Number(m[2]) : null, line });
      }
    });
    child.on('error', (err) => reject(new GitError(`Não foi possível executar o git: ${err.message}`)));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

/** Traduz as mensagens mais comuns do git para algo acionável. */
export function friendly(stderr: string): string {
  const msg = stderr.trim();
  if (/Authentication failed|could not read Username|terminal prompts disabled|403/i.test(msg)) {
    return 'Falha de autenticação no remoto. Entre com o GitHub no Hydra ou faça login pelo Git Credential Manager (ex.: um git fetch no terminal).';
  }
  if (/\[rejected\]|non-fast-forward|fetch first/i.test(msg)) {
    return 'O remoto tem commits que você ainda não tem. Faça Pull antes de dar Push.';
  }
  if (/Could not resolve host|unable to access/i.test(msg)) return 'Sem conexão com o remoto. Verifique a internet e a URL do repositório.';
  if (/Please tell me who you are|empty ident/i.test(msg)) {
    return 'Configure sua identidade no git: git config --global user.name "Seu Nome" e git config --global user.email "voce@exemplo.com".';
  }
  if (/would be overwritten by (checkout|merge)/i.test(msg)) {
    return 'Suas alterações locais seriam sobrescritas. Faça commit, guarde (stash) ou descarte antes.';
  }
  return msg.replace(/^(error|fatal): /gim, '').trim();
}

const HASH_RE = /^[0-9a-f]{4,64}$/i;

export function assertHash(hash: string): void {
  if (!HASH_RE.test(hash)) throw new GitError('Hash inválido');
}

/** Valida nome de branch/tag com as regras do próprio git. */
export async function assertRefName(cwd: string, name: string, kind: 'branch' | 'tag' = 'branch'): Promise<void> {
  const ok = kind === 'branch'
    ? (await gitRaw(cwd, ['check-ref-format', '--branch', name])).code === 0
    : (await gitRaw(cwd, ['check-ref-format', `refs/tags/${name}`])).code === 0;
  if (!name || name.startsWith('-') || !ok) throw new GitError(`Nome inválido: "${name}"`);
}

/** Caminho de um arquivo interno do .git (MERGE_HEAD, MERGE_MSG…), respeitando worktrees. */
export async function gitPath(cwd: string, name: string): Promise<string> {
  const p = (await git(cwd, ['rev-parse', '--git-path', name])).trim();
  return p;
}
