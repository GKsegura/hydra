// Hydra — © 2026 José Segura (GKsegura) · MIT
import { contextBridge, ipcRenderer, webUtils } from 'electron';

// A única ponte entre a interface e o sistema: seletor nativo, caminho real de arquivos soltos na janela,
// as ações do menu do app (que a interface executa) e o aviso de atualização.
contextBridge.exposeInMainWorld('hydraDesktop', {
  pickWorkspace: (kind: 'file' | 'folder'): Promise<string | null> => ipcRenderer.invoke('hydra:pick', kind),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  onMenu: (callback: (action: string) => void) => {
    ipcRenderer.on('hydra:menu', (_ev, action: string) => callback(action));
  },
  // Recebe o estado atual na hora (a verificação pode ter terminado antes de a página carregar) e as mudanças.
  onUpdate: (callback: (state: unknown) => void) => {
    ipcRenderer.on('hydra:update', (_ev, state: unknown) => callback(state));
    void ipcRenderer.invoke('hydra:update-state').then(callback);
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke('hydra:update-install'),
});
