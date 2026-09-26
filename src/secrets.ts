// Hydra — © 2026 José Segura (GKsegura) · MIT
import { execFile } from 'node:child_process';

/**
 * Onde o token do GitHub fica guardado.
 * - App desktop: criptografado pelo Windows (safeStorage/DPAPI), implementado em electron/main.ts.
 * - CLI: não guarda nada; usa GITHUB_TOKEN/GH_TOKEN ou o login do GitHub CLI (`gh auth token`).
 */
export interface SecretStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
  /** true quando o app consegue guardar um login feito pela interface. */
  persistent: boolean;
}

export const memoryStore = (): SecretStore => {
  let token: string | null = null;
  return {
    get: async () => token,
    set: async (t) => void (token = t),
    clear: async () => void (token = null),
    persistent: false,
  };
};

export function cliToken(): Promise<string | null> {
  const env = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (env) return Promise.resolve(env);
  return new Promise((resolve) =>
    execFile('gh', ['auth', 'token'], { windowsHide: true, timeout: 5000 }, (err, stdout) => resolve(err ? null : stdout.trim() || null)),
  );
}
