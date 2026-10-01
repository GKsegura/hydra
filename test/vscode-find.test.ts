// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import { findHydra } from '../vscode/src/find.ts';

describe('findHydra', () => {
  it('usa o caminho configurado quando existe', () => {
    const found = findHydra({
      configuredPath: 'D:\\ferramentas\\Hydra.exe',
      localAppData: 'C:\\Users\\alguem\\AppData\\Local',
      exists: (p) => p === 'D:\\ferramentas\\Hydra.exe',
      findOnPath: () => 'C:\\Windows\\hydra.cmd',
    });
    expect(found).toEqual({ exe: 'D:\\ferramentas\\Hydra.exe' });
  });

  it('ignora o caminho configurado se ele não existir no disco', () => {
    const found = findHydra({
      configuredPath: 'D:\\ferramentas\\Hydra.exe',
      localAppData: 'C:\\Users\\alguem\\AppData\\Local',
      exists: (p) => p === 'C:\\Users\\alguem\\AppData\\Local\\Programs\\hydra-git\\Hydra.exe',
      findOnPath: () => null,
    });
    expect(found).toEqual({ exe: 'C:\\Users\\alguem\\AppData\\Local\\Programs\\hydra-git\\Hydra.exe' });
  });

  it('prefere o Hydra instalado ao comando do PATH', () => {
    const found = findHydra({
      localAppData: 'C:\\Users\\alguem\\AppData\\Local',
      exists: (p) => p === 'C:\\Users\\alguem\\AppData\\Local\\Programs\\hydra-git\\Hydra.exe',
      findOnPath: () => 'C:\\Windows\\hydra.cmd',
    });
    expect(found).toEqual({ exe: 'C:\\Users\\alguem\\AppData\\Local\\Programs\\hydra-git\\Hydra.exe' });
  });

  it('usa o comando do PATH quando não há instalação nem configuração', () => {
    const found = findHydra({
      localAppData: 'C:\\Users\\alguem\\AppData\\Local',
      exists: () => false,
      findOnPath: () => 'C:\\Windows\\hydra.cmd',
    });
    expect(found).toEqual({ exe: 'C:\\Windows\\hydra.cmd' });
  });

  it('retorna null quando nada existe', () => {
    const found = findHydra({
      localAppData: 'C:\\Users\\alguem\\AppData\\Local',
      exists: () => false,
      findOnPath: () => null,
    });
    expect(found).toBeNull();
  });

  it('retorna null sem localAppData e sem comando no PATH', () => {
    const found = findHydra({
      exists: () => false,
      findOnPath: () => null,
    });
    expect(found).toBeNull();
  });

  it('ignora o caminho configurado em branco', () => {
    const found = findHydra({
      configuredPath: '   ',
      localAppData: 'C:\\Users\\alguem\\AppData\\Local',
      exists: (p) => p === 'C:\\Users\\alguem\\AppData\\Local\\Programs\\hydra-git\\Hydra.exe',
      findOnPath: () => null,
    });
    expect(found).toEqual({ exe: 'C:\\Users\\alguem\\AppData\\Local\\Programs\\hydra-git\\Hydra.exe' });
  });
});
