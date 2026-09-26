/*
 *    ██████╗ ██╗  ██╗███████╗███████╗ ██████╗ ██╗   ██╗██████╗  █████╗
 *   ██╔════╝ ██║ ██╔╝██╔════╝██╔════╝██╔════╝ ██║   ██║██╔══██╗██╔══██╗
 *   ██║  ███╗█████╔╝ ███████╗█████╗  ██║  ███╗██║   ██║██████╔╝███████║
 *   ██║   ██║██╔═██╗ ╚════██║██╔══╝  ██║   ██║██║   ██║██╔══██╗██╔══██║
 *   ╚██████╔╝██║  ██╗███████║███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║
 *    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
 *
 *   Hydra Desktop — crafted by GKsegura
 *   © 2026 José Segura · MIT
 */
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, screen, shell } from 'electron';
import type { SecretStore } from '../src/secrets.ts';
import type { RunningServer, ServerOptions } from '../src/server.ts';
import { createUpdater, RELEASES_URL, type Updater, type UpdateState } from './updater.ts';

// O front compilado: dentro do pacote fica em resources/web; em desenvolvimento, em web/dist.
process.env.HYDRA_WEB_DIR ??= app.isPackaged
  ? path.join(process.resourcesPath, 'web')
  : path.join(app.getAppPath(), 'web', 'dist');

// Importado depois de definir HYDRA_WEB_DIR (o servidor lê a variável quando precisa do front).
const { startServer } = await import('../src/server.ts');

let win: BrowserWindow | null = null;
let server: RunningServer | null = null;
let updater: Updater | null = null;

// ------------------------------------------------------------------ utilidades

/** Caminho passado na linha de comando (ex.: "Hydra.exe C:\projeto\x.code-workspace"). */
function pathFromArgs(argv: string[]): string | null {
  // Em desenvolvimento (`electron . <caminho>`) o próprio app aparece nos argumentos, e nem sempre na mesma posição
  // (ferramentas como o Playwright injetam flags antes): ignoramos o caminho do app onde quer que ele esteja.
  const norm = (p: string) => path.resolve(p).toLowerCase(); // Windows: "c:\" e "C:\" são a mesma pasta
  const appPath = app.isPackaged ? null : norm(app.getAppPath());
  const args = argv.slice(1).filter((a) => !a.startsWith('-') && norm(a) !== appPath);
  const found = args.find((a) => existsSync(a));
  return found ? path.resolve(found) : null;
}

/** Token do GitHub criptografado pelo Windows (DPAPI) — só este usuário, nesta máquina, consegue ler. */
function secretStore(): SecretStore {
  const file = path.join(app.getPath('userData'), 'github.bin');
  return {
    persistent: safeStorage.isEncryptionAvailable(),
    async get() {
      try {
        return existsSync(file) ? safeStorage.decryptString(readFileSync(file)) : null;
      } catch {
        return null;
      }
    },
    async set(token) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('Criptografia do sistema indisponível: não dá para guardar o login.');
      writeFileSync(file, safeStorage.encryptString(token));
    },
    async clear() {
      rmSync(file, { force: true });
    },
  };
}

/** Envia uma ação de menu para a interface (que abre o diálogo certo). */
function menuAction(action: string) {
  win?.webContents.send('hydra:menu', action);
}

/** Encerra os shells do terminal integrado e o servidor local (ao fechar ou antes de instalar uma atualização). */
function shutdown() {
  server?.terminals.killAll();
  if (server?.server.listening) server.server.close();
}

function gitAvailable(): Promise<boolean> {
  return new Promise((resolve) => execFile('git', ['--version'], { windowsHide: true }, (err) => resolve(!err)));
}

// Tamanho e posição da janela, lembrados entre execuções.
const windowFile = () => path.join(app.getPath('userData'), 'window.json');
interface WindowState { x?: number; y?: number; width: number; height: number; maximized?: boolean }

function readWindowState(): WindowState {
  const fallback = { width: 1600, height: 950 };
  try {
    const s = JSON.parse(readFileSync(windowFile(), 'utf8')) as WindowState;
    // Só reaproveita a posição se ela ainda cair dentro de algum monitor.
    const visible = s.x !== undefined && s.y !== undefined && screen.getAllDisplays().some(({ workArea: a }) =>
      s.x! >= a.x - 50 && s.y! >= a.y - 50 && s.x! < a.x + a.width - 100 && s.y! < a.y + a.height - 100);
    return visible ? s : { ...fallback, maximized: s.maximized };
  } catch {
    return fallback;
  }
}

function saveWindowState() {
  if (!win) return;
  try {
    writeFileSync(windowFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    /* sem permissão: só não lembramos o tamanho */
  }
}

// ------------------------------------------------------------------ workspace

async function pick(kind: 'file' | 'folder'): Promise<string | null> {
  const result = await dialog.showOpenDialog(win!, kind === 'folder'
    ? { title: 'Abrir pasta com repositórios', properties: ['openDirectory'] }
    : { title: 'Abrir workspace', properties: ['openFile'], filters: [{ name: 'Workspace do VS Code', extensions: ['code-workspace'] }] });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

/** Abre um workspace pelo processo principal (menu, segunda instância) e recarrega a interface. */
function openFromMain(target: string) {
  try {
    server!.session.open(target);
    win?.webContents.reload();
  } catch (err) {
    dialog.showErrorBox('Não foi possível abrir', (err as Error).message);
  }
}

// ------------------------------------------------------------------ menu

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [
        // Os atalhos são tratados pela própria interface; aqui eles só aparecem no menu.
        { label: 'Novo repositório…', accelerator: 'CmdOrCtrl+N', registerAccelerator: false, click: () => menuAction('init') },
        { label: 'Clonar repositório…', accelerator: 'CmdOrCtrl+Shift+O', registerAccelerator: false, click: () => menuAction('clone') },
        { type: 'separator' },
        { label: 'Abrir workspace…', accelerator: 'CmdOrCtrl+O', registerAccelerator: false, click: () => menuAction('open-file') },
        { label: 'Abrir repositório ou pasta…', click: () => menuAction('open-folder') },
        { label: 'Fechar workspace', click: () => menuAction('close') },
        { type: 'separator' },
        { label: 'Sair', role: 'quit' },
      ],
    },
    {
      label: 'Repositório',
      submenu: [
        { label: 'Fetch', click: () => menuAction('fetch') },
        { label: 'Pull', click: () => menuAction('pull') },
        { label: 'Push', click: () => menuAction('push') },
        { type: 'separator' },
        { label: 'Nova branch…', accelerator: 'CmdOrCtrl+Shift+N', registerAccelerator: false, click: () => menuAction('new-branch') },
        { label: 'Merge na branch atual…', click: () => menuAction('merge') },
        { label: 'Guardar alterações (stash)', click: () => menuAction('stash') },
        { label: 'Commit no workspace…', accelerator: 'CmdOrCtrl+Shift+Enter', registerAccelerator: false, click: () => menuAction('workspace-commit') },
        { type: 'separator' },
        { label: 'Abrir no VS Code', click: () => menuAction('open-editor') },
        { label: 'Mostrar no Explorer', click: () => menuAction('open-explorer') },
        { label: 'Terminal integrado', accelerator: 'CmdOrCtrl+`', registerAccelerator: false, click: () => menuAction('terminal') },
        { label: 'Abrir terminal externo', click: () => menuAction('open-terminal') },
        { label: 'Ver no GitHub', click: () => menuAction('open-github') },
      ],
    },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Recarregar', role: 'reload' },
        { label: 'Tela cheia', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Aumentar zoom', role: 'zoomIn' },
        { label: 'Diminuir zoom', role: 'zoomOut' },
        { label: 'Zoom padrão', role: 'resetZoom' },
        { type: 'separator' },
        { label: 'Ferramentas do desenvolvedor', role: 'toggleDevTools' },
      ],
    },
    {
      label: 'Ajuda',
      submenu: [
        { label: 'Conta do GitHub…', click: () => menuAction('github') },
        { label: 'Hydra no GitHub', click: () => shell.openExternal('https://github.com/GKsegura/hydra') },
        { type: 'separator' },
        {
          label: 'Procurar atualizações…',
          enabled: app.isPackaged,
          click: () => updater?.check(true),
        },
        { label: 'Notas da versão', click: () => shell.openExternal(`${RELEASES_URL}/tag/v${app.getVersion()}`) },
        { type: 'separator' },
        {
          label: 'Sobre o Hydra',
          click: () => dialog.showMessageBox(win!, {
            type: 'info', title: 'Sobre o Hydra',
            message: `Hydra v${app.getVersion()}`,
            detail: [
              'Cliente git visual para workspaces: todos os repositórios do seu projeto, lado a lado.',
              '',
              'Crafted by GKsegura',
              `© ${new Date().getFullYear()} José Segura · Licença MIT`,
              'github.com/GKsegura/hydra',
            ].join('\n'),
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ------------------------------------------------------------------ janela

function createWindow(url: string) {
  const state = readWindowState();
  win = new BrowserWindow({
    ...state,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#15171c',
    title: 'Hydra',
    autoHideMenuBar: false, // menu sempre visível (Arquivo, Repositório, Exibir, Ajuda → Procurar atualizações…)
    show: false,
    icon: app.isPackaged ? undefined : path.join(app.getAppPath(), 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win?.show());

  // Tudo que não for o servidor local abre no navegador padrão.
  const origin = new URL(url).origin;
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) shell.openExternal(target);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (ev, target) => {
    if (new URL(target).origin !== origin) {
      ev.preventDefault();
      if (/^https?:/.test(target)) shell.openExternal(target);
    }
  });

  win.on('close', saveWindowState);
  win.on('closed', () => (win = null));
  win.loadURL(url);
}

// ------------------------------------------------------------------ início

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Abriu de novo (ex.: outro atalho com caminho)? Reaproveita a janela existente.
  app.on('second-instance', (_ev, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const target = pathFromArgs(argv);
    if (target) openFromMain(target);
  });

  app.whenReady().then(async () => {
    if (!(await gitAvailable())) {
      dialog.showErrorBox('Git não encontrado', 'O Hydra usa o git instalado na sua máquina.\n\nInstale o Git (https://git-scm.com) e abra o Hydra de novo.');
      app.quit();
      return;
    }

    ipcMain.handle('hydra:pick', (_ev, kind: 'file' | 'folder') => pick(kind === 'folder' ? 'folder' : 'file'));

    // Porta fixa (com fallback para as seguintes): o layout salvo no navegador interno é por origem/porta.
    const opts: ServerOptions = {
      port: 47110,
      max: 1000,
      desktop: true,
      recentsFile: path.join(app.getPath('userData'), 'recents.json'),
      secrets: secretStore(),
      // Descartar alterações manda o arquivo para a Lixeira (dá pra recuperar), como no GitHub Desktop.
      trash: (file) => shell.trashItem(file),
    };
    const target = pathFromArgs(process.argv);
    try {
      server = await startServer(target, opts);
    } catch (err) {
      // Caminho inválido na linha de comando: abre na tela inicial e avisa.
      server = await startServer(null, opts);
      dialog.showErrorBox('Não foi possível abrir', (err as Error).message);
    }

    // Atualizações: só no app empacotado (instalado ou portátil). O estado vai para o aviso no topo da janela.
    ipcMain.handle('hydra:update-state', (): UpdateState => updater?.state() ?? { state: 'idle' });
    ipcMain.handle('hydra:update-install', () => updater?.install());
    if (app.isPackaged) {
      updater = createUpdater({
        window: () => win,
        send: (state) => win?.webContents.send('hydra:update', state),
        beforeInstall: shutdown,
      });
    }

    buildMenu();
    createWindow(server.url);
    console.log(`Hydra rodando em ${server.url}`);
  });

  app.on('window-all-closed', () => {
    shutdown();
    app.quit();
  });
}
