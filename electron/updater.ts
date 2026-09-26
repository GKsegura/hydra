// Hydra — © 2026 José Segura (GKsegura) · MIT
// Atualizações do app desktop.
// - Instalado (NSIS): electron-updater baixa a versão nova das Releases do GitHub em segundo plano, confere o sha512
//   do latest.yml e pergunta para reiniciar; se a pessoa deixar para depois, instala ao fechar o app.
// - Portátil: não tem onde se instalar por cima (roda de uma pasta temporária), então só avisa e abre o download.
import { app, dialog, shell, type BrowserWindow } from 'electron';
import electronUpdater from 'electron-updater';
import { isNewer } from '../src/version.ts';
import { describeUpdateError } from './update-errors.ts';

const { autoUpdater } = electronUpdater;

const REPO = 'GKsegura/hydra';
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const FIRST_CHECK_MS = 15_000;

/** Estado mostrado na interface (aviso na barra do topo). */
export type UpdateState =
  | { state: 'idle' }
  | { state: 'downloading'; version: string; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'available'; version: string; url: string }; // portátil: há versão nova para baixar

export interface Updater {
  /** Verifica agora. `manual`: veio do menu, então responde mesmo quando não há novidade. */
  check(manual: boolean): Promise<void>;
  /** Fecha o app e instala a versão já baixada (só no instalado). */
  install(): void;
  state(): UpdateState;
}

interface Options {
  window: () => BrowserWindow | null;
  send: (state: UpdateState) => void;
  /** Encerra terminais e servidor antes de o instalador substituir os arquivos. */
  beforeInstall: () => void;
}

/** O launcher do .exe portátil define essa variável com o caminho do .exe original. */
export const isPortable = () => !!process.env.PORTABLE_EXECUTABLE_FILE;

export function createUpdater(opts: Options): Updater {
  let current: UpdateState = { state: 'idle' };
  const set = (s: UpdateState) => {
    current = s;
    opts.send(s);
  };
  const info = (message: string, detail?: string, buttons?: string[]) => {
    const win = opts.window();
    const box = { type: 'info' as const, title: 'Atualizações do Hydra', message, detail, buttons: buttons ?? ['OK'] };
    return win ? dialog.showMessageBox(win, box) : dialog.showMessageBox(box);
  };
  const upToDate = () => info(`Você está na versão mais recente (${app.getVersion()}).`);

  const updater: Updater = isPortable() ? portableUpdater() : installedUpdater();
  setTimeout(() => void updater.check(false), FIRST_CHECK_MS).unref();
  setInterval(() => void updater.check(false), CHECK_EVERY_MS).unref();
  return updater;

  // ---------------------------------------------------------------- instalado (NSIS)

  function installedUpdater(): Updater {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    // Sem log de "checking/no update" a cada 4 h; erros continuam no console.
    autoUpdater.logger = { info: () => {}, warn: console.warn, error: console.error, debug: () => {} };
    // Teste local ponta a ponta: aponta para uma pasta servida por HTTP em vez das Releases do GitHub.
    if (process.env.HYDRA_UPDATE_FEED) autoUpdater.setFeedURL({ provider: 'generic', url: process.env.HYDRA_UPDATE_FEED });

    let lastPercent = -1;
    autoUpdater.on('update-available', (u) => {
      lastPercent = -1;
      set({ state: 'downloading', version: u.version, percent: 0 });
    });
    autoUpdater.on('download-progress', (p) => {
      const percent = Math.floor(p.percent);
      if (current.state !== 'downloading' || percent === lastPercent) return;
      lastPercent = percent;
      set({ ...current, percent });
    });
    autoUpdater.on('update-downloaded', (u) => set({ state: 'ready', version: u.version }));
    autoUpdater.on('error', (err) => {
      console.error('Atualização falhou:', err.message);
      if (current.state === 'downloading') set({ state: 'idle' });
    });

    return {
      state: () => current,
      async check(manual) {
        if (current.state === 'ready') {
          if (manual) await askToInstall(current.version);
          return;
        }
        if (current.state === 'downloading') {
          if (manual) await info(`Baixando o Hydra ${current.version} (${current.percent}%).`, 'Quando terminar, aparece um aviso no topo da janela.');
          return;
        }
        try {
          const result = await autoUpdater.checkForUpdates();
          if (!manual) return;
          if (result?.isUpdateAvailable) {
            await info(`Hydra ${result.updateInfo.version} disponível.`, 'O download começou em segundo plano. Quando terminar, aparece um aviso no topo da janela.');
          } else await upToDate();
        } catch (err) {
          console.error('Verificação de atualização falhou:', (err as Error).message);
          if (manual) {
            const { message, detail } = describeUpdateError((err as Error).message);
            await info(message, detail);
          }
        }
      },
      install() {
        if (current.state !== 'ready') return;
        opts.beforeInstall();
        // Silencioso (é o mesmo instalador por usuário) e reabre o Hydra na versão nova.
        autoUpdater.quitAndInstall(true, true);
      },
    };
  }

  async function askToInstall(version: string) {
    const { response } = await info(`Hydra ${version} pronto para instalar.`, 'Reiniciar agora? Se preferir, a atualização é instalada quando você fechar o Hydra.', [
      'Reiniciar agora',
      'Depois',
    ]);
    if (response === 0) updater.install();
  }

  // ---------------------------------------------------------------- portátil

  function portableUpdater(): Updater {
    return {
      state: () => current,
      async check(manual) {
        try {
          const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
            headers: { accept: 'application/vnd.github+json', 'user-agent': `Hydra/${app.getVersion()}` },
          });
          if (!res.ok) throw new Error(`GitHub respondeu ${res.status}`);
          const release = (await res.json()) as { tag_name: string; html_url: string };
          if (!isNewer(release.tag_name, app.getVersion())) {
            if (manual) await upToDate();
            return;
          }
          const version = release.tag_name.replace(/^v/i, '');
          set({ state: 'available', version, url: release.html_url });
          if (manual) {
            const { response } = await info(`Hydra ${version} disponível.`, 'Esta é a versão portátil, que não se atualiza sozinha. Baixe o instalador para receber as próximas versões automaticamente.', [
              'Abrir download',
              'Depois',
            ]);
            if (response === 0) void shell.openExternal(release.html_url);
          }
        } catch (err) {
          console.error('Verificação de atualização falhou:', (err as Error).message);
          if (manual) {
            const { message, detail } = describeUpdateError((err as Error).message);
            await info(message, detail);
          }
        }
      },
      install() {
        // O portátil não se instala: a interface abre a página da Release.
      },
    };
  }
}
