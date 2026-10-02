// Hydra — © 2026 José Segura (GKsegura) · MIT
import { GITHUB_LOGIN_ENABLED } from './config.ts';
import { setGitHubToken } from './git/index.ts';
import { getUser, loginAvailable, pollDeviceFlow, startDeviceFlow, type GitHubUser } from './github.ts';
import type { SecretStore } from './secrets.ts';

export type LoginState =
  | { state: 'idle' }
  | { state: 'pending'; userCode: string; verificationUri: string; expiresAt: number }
  | { state: 'error'; error: string };

/** Conta do GitHub conectada ao Hydra: token (guardado pelo SecretStore), usuário e o login por device flow. */
export class GitHubSession {
  token: string | null = null;
  user: GitHubUser | null = null;
  login: LoginState = { state: 'idle' };
  private abort: AbortController | null = null;
  private secrets: SecretStore;

  constructor(secrets: SecretStore) {
    this.secrets = secrets;
  }

  async init() {
    // Login desativado (HYDRA_GITHUB_LOGIN=0): não carrega token nenhum; o git segue com o Credential Manager.
    if (!GITHUB_LOGIN_ENABLED) return;
    await this.use(await this.secrets.get().catch(() => null));
  }

  private async use(token: string | null) {
    this.token = token;
    setGitHubToken(token);
    this.user = null;
    if (token) {
      try {
        this.user = await getUser(token);
      } catch {
        // Token inválido/expirado: fica sem login, sem travar o app.
        this.token = null;
        setGitHubToken(null);
      }
    }
  }

  info() {
    return {
      /** false se GITHUB_CLIENT_ID estiver vazio, ou com HYDRA_GITHUB_LOGIN=0. */
      configured: GITHUB_LOGIN_ENABLED && loginAvailable(),
      available: GITHUB_LOGIN_ENABLED && loginAvailable() && this.secrets.persistent,
      canLogin: this.secrets.persistent,
      user: this.user ? { login: this.user.login, name: this.user.name, avatar: this.user.avatar_url, url: this.user.html_url } : null,
      login: this.login,
    };
  }

  async startLogin() {
    if (!GITHUB_LOGIN_ENABLED) throw new Error('O login com GitHub está desativado nesta build.');
    this.abort?.abort();
    const code = await startDeviceFlow();
    const abort = new AbortController();
    this.abort = abort;
    this.login = { state: 'pending', userCode: code.user_code, verificationUri: code.verification_uri, expiresAt: Date.now() + code.expires_in * 1000 };
    pollDeviceFlow(code, abort.signal)
      .then(async (token) => {
        await this.secrets.set(token);
        await this.use(token);
        this.login = { state: 'idle' };
      })
      .catch((err: Error) => {
        if (!abort.signal.aborted) this.login = { state: 'error', error: err.message };
      });
    return this.login;
  }

  cancelLogin() {
    this.abort?.abort();
    this.login = { state: 'idle' };
  }

  async logout() {
    this.cancelLogin();
    await this.secrets.clear();
    await this.use(null);
  }
}
