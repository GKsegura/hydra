// Hydra — © 2026 José Segura (GKsegura) · MIT
import { GITHUB_CLIENT_ID, GITHUB_SCOPES } from './config.ts';
import { VERSION } from './version.ts';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function gh<T>(path: string, token: string | null, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method ?? 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': `Hydra/${VERSION}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string; errors?: { message?: string }[] };
  if (!res.ok) {
    const detail = data.errors?.map((e) => e.message).filter(Boolean).join('; ');
    throw new GitHubError(res.status, res.status === 401 ? 'Login do GitHub expirou. Entre de novo.' : `GitHub: ${data.message ?? res.statusText}${detail ? ` (${detail})` : ''}`);
  }
  return data as T;
}

// ---------------------------------------------------------------- login (device flow)

export interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

export function loginAvailable(): boolean {
  return !!GITHUB_CLIENT_ID;
}

async function form<T>(url: string, body: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded', 'user-agent': `Hydra/${VERSION}` },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.json()) as T;
}

export async function startDeviceFlow(): Promise<DeviceCode> {
  if (!GITHUB_CLIENT_ID) throw new GitHubError(400, 'Login com GitHub ainda não configurado (falta o Client ID do OAuth App — veja o README).');
  const r = await form<DeviceCode & { error?: string; error_description?: string }>('https://github.com/login/device/code', {
    client_id: GITHUB_CLIENT_ID,
    scope: GITHUB_SCOPES,
  });
  if (r.error) throw new GitHubError(400, r.error_description ?? r.error);
  return r;
}

/** Espera o usuário autorizar no navegador. Resolve com o token ou rejeita (expirou/negado/cancelado). */
export async function pollDeviceFlow(code: DeviceCode, signal: AbortSignal): Promise<string> {
  let interval = Math.max(code.interval, 5) * 1000;
  const deadline = Date.now() + code.expires_in * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval));
    if (signal.aborted) throw new GitHubError(499, 'Login cancelado.');
    const r = await form<{ access_token?: string; error?: string; interval?: number }>('https://github.com/login/oauth/access_token', {
      client_id: GITHUB_CLIENT_ID,
      device_code: code.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    if (r.access_token) return r.access_token;
    if (r.error === 'slow_down') interval = (r.interval ?? interval / 1000 + 5) * 1000;
    else if (r.error === 'access_denied') throw new GitHubError(403, 'Login negado no GitHub.');
    else if (r.error === 'expired_token') break;
    else if (r.error && r.error !== 'authorization_pending') throw new GitHubError(400, r.error);
  }
  throw new GitHubError(408, 'O código expirou. Tente entrar de novo.');
}

// ---------------------------------------------------------------- API

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export const getUser = (token: string) => gh<GitHubUser>('/user', token);

export interface GitHubRepo {
  full_name: string;
  name: string;
  owner: string;
  private: boolean;
  description: string | null;
  clone_url: string;
  html_url: string;
  updated_at: string;
}

/** Repositórios do usuário (dele, de organizações e colaborações), mais recentes primeiro. */
export async function listRepos(token: string): Promise<GitHubRepo[]> {
  const all: GitHubRepo[] = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh<(Omit<GitHubRepo, 'owner'> & { owner: { login: string } })[]>(
      `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator,organization_member`,
      token,
    );
    all.push(...batch.map((r) => ({
      full_name: r.full_name, name: r.name, owner: r.owner.login, private: r.private, description: r.description,
      clone_url: r.clone_url, html_url: r.html_url, updated_at: r.updated_at,
    })));
    if (batch.length < 100) break;
  }
  return all;
}

export async function createRepo(token: string, opts: { name: string; private: boolean; description?: string }): Promise<GitHubRepo> {
  const r = await gh<Omit<GitHubRepo, 'owner'> & { owner: { login: string } }>('/user/repos', token, {
    method: 'POST',
    body: { name: opts.name, private: opts.private, description: opts.description ?? '', auto_init: false },
  });
  return { ...r, owner: r.owner.login };
}

export interface PullRequest {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  author: string;
  branch: string;
  base: string;
  updated_at: string;
}

export async function listPulls(token: string | null, fullName: string): Promise<PullRequest[]> {
  const list = await gh<{ number: number; title: string; html_url: string; draft: boolean; user: { login: string }; head: { ref: string }; base: { ref: string }; updated_at: string }[]>(
    `/repos/${fullName}/pulls?state=open&per_page=30`,
    token,
  );
  return list.map((p) => ({
    number: p.number, title: p.title, html_url: p.html_url, draft: p.draft, author: p.user.login,
    branch: p.head.ref, base: p.base.ref, updated_at: p.updated_at,
  }));
}

/** Página do GitHub para abrir um Pull Request da branch (o GitHub escolhe a base padrão). */
export function compareUrl(fullName: string, branch: string): string {
  return `https://github.com/${fullName}/compare/${encodeURIComponent(branch)}?expand=1`;
}
