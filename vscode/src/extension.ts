// Hydra — © 2026 José Segura (GKsegura) · MIT
// Abre o workspace (ou o repositório do arquivo em foco) no Hydra. Usa o Hydra instalado, senão o comando
// `hydra` do CLI; sem nenhum dos dois, oferece o download. Hydra.exe/hydra aceitam o caminho como argumento e,
// com um Hydra já aberto, entram como guia nova — não fecham o que já estava lá.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { findHydra } from './find.ts';

const RELEASES_URL = 'https://github.com/GKsegura/hydra/releases/latest';

function findOnPath(): string | null {
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['hydra'], { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

/** Sobe a partir de `start` (arquivo ou pasta) até achar uma pasta com `.git`. `null` se chegar à raiz sem achar. */
function findRepoRoot(start: string): string | null {
  let dir = existsSync(start) && statSync(start).isDirectory() ? start : path.dirname(start);
  for (;;) {
    if (existsSync(path.join(dir, '.git'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function openHydra(target: string) {
  const config = vscode.workspace.getConfiguration('hydra');
  const found = findHydra({
    configuredPath: config.get<string>('executablePath'),
    localAppData: process.env.LOCALAPPDATA,
    exists: existsSync,
    findOnPath,
  });
  if (!found) {
    void vscode.window.showWarningMessage('Hydra não encontrado. Instale-o para abrir o workspace nele.', 'Baixar o Hydra').then((choice) => {
      if (choice) void vscode.env.openExternal(vscode.Uri.parse(RELEASES_URL));
    });
    return;
  }
  // O host de extensões do VS Code roda com ELECTRON_RUN_AS_NODE=1 (é assim que ele executa código de
  // extensão); sem remover isso, o Hydra (também Electron) herdaria a variável e tentaria rodar como Node puro.
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  // `spawn` desanexado (não `execFile`): o Hydra é um app independente, não um comando cujo output o VS Code
  // precisa ler — anexado por pipes ao host de extensões, ficava preso ao ciclo de vida dele e era encerrado
  // junto cedo demais. `detached` + stdio ignorado garante um processo totalmente solto, como um atalho abriria.
  const child = spawn(found.exe, [target], { windowsHide: true, env, detached: true, stdio: 'ignore' });
  child.on('error', (e) => void vscode.window.showErrorMessage(`Não foi possível abrir o Hydra: ${e.message}`));
  child.unref();
}

/** O `.code-workspace` aberto, ou a primeira pasta do workspace. */
function currentWorkspaceTarget(): string | null {
  if (vscode.workspace.workspaceFile?.scheme === 'file') return vscode.workspace.workspaceFile.fsPath;
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null;
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('hydra.openWorkspace', () => {
      const target = currentWorkspaceTarget();
      if (!target) return void vscode.window.showWarningMessage('Nenhum workspace ou pasta aberto no VS Code.');
      openHydra(target);
    }),
    vscode.commands.registerCommand('hydra.openRepo', (uri?: vscode.Uri) => {
      const start = uri?.fsPath ?? vscode.window.activeTextEditor?.document.uri.fsPath ?? currentWorkspaceTarget();
      if (!start) return void vscode.window.showWarningMessage('Abra um arquivo, pasta ou workspace primeiro.');
      const repo = findRepoRoot(start);
      if (!repo) return void vscode.window.showWarningMessage('Nenhum repositório git encontrado a partir daí.');
      openHydra(repo);
    }),
  );

  // Só workspaces de verdade (.code-workspace com vários repos) — uma pasta única não precisa do Hydra.
  const openOnStartup = vscode.workspace.getConfiguration('hydra').get<boolean>('openOnStartup');
  if (openOnStartup && vscode.workspace.workspaceFile?.scheme === 'file') {
    const target = currentWorkspaceTarget();
    if (target) openHydra(target);
  }
}

export function deactivate() {}
