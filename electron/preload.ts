// Hydra — © 2026 José Segura (GKsegura) · MIT
import { contextBridge, ipcRenderer, webUtils } from 'electron';

// A única ponte entre a interface e o sistema: seletor nativo, caminho real de arquivos soltos na janela
// e as ações do menu do app (que a interface executa).
contextBridge.exposeInMainWorld('hydraDesktop', {
  pickWorkspace: (kind: 'file' | 'folder'): Promise<string | null> => ipcRenderer.invoke('hydra:pick', kind),
  pathForFile: (file: File): string => webUtils.getPathForFile(file),
  onMenu: (callback: (action: string) => void) => {
    ipcRenderer.on('hydra:menu', (_ev, action: string) => callback(action));
  },
});
