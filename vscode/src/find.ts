// Hydra — © 2026 José Segura (GKsegura) · MIT
// Acha o Hydra instalado. Função pura (sem vscode nem fs/child_process reais) para dar pra testar com caminhos falsos.

export interface FindHydraEnv {
  /** `hydra.executablePath` das configurações, se a pessoa apontou um caminho. */
  configuredPath?: string;
  /** `%LOCALAPPDATA%`, para montar o caminho do instalador padrão. */
  localAppData?: string;
  /** Esse caminho existe no disco? */
  exists: (path: string) => boolean;
  /** Acha o comando `hydra` no PATH (ex.: via `where`/`which`); `null` se não achar. */
  findOnPath: () => string | null;
}

export interface HydraLaunch {
  /** O executável (ou comando) a rodar. */
  exe: string;
}

/**
 * Onde está o Hydra, nesta ordem: caminho configurado → instalado (`%LOCALAPPDATA%\Programs\hydra-git`) →
 * comando `hydra` do CLI no PATH. `null` se nenhum existir.
 */
export function findHydra(env: FindHydraEnv): HydraLaunch | null {
  if (env.configuredPath?.trim() && env.exists(env.configuredPath)) return { exe: env.configuredPath };

  if (env.localAppData) {
    const installed = `${env.localAppData}\\Programs\\hydra-git\\Hydra.exe`;
    if (env.exists(installed)) return { exe: installed };
  }

  const onPath = env.findOnPath();
  if (onPath) return { exe: onPath };

  return null;
}
