// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import { isNewer } from '../src/version.ts';

describe('isNewer (aviso de atualização do .exe portátil)', () => {
  it('compara major, minor e patch numericamente', () => {
    expect(isNewer('1.2.0', '1.1.0')).toBe(true);
    expect(isNewer('1.10.0', '1.9.3')).toBe(true);
    expect(isNewer('2.0.0', '1.99.99')).toBe(true);
    expect(isNewer('1.1.1', '1.1.0')).toBe(true);
    expect(isNewer('1.1.0', '1.1.0')).toBe(false);
    expect(isNewer('1.0.9', '1.1.0')).toBe(false);
  });

  it('aceita a tag com "v" na frente', () => {
    expect(isNewer('v1.2.0', '1.1.0')).toBe(true);
    expect(isNewer('v1.1.0', '1.1.0')).toBe(false);
  });

  it('pré-release vem antes da versão final', () => {
    expect(isNewer('1.2.0', '1.2.0-beta.1')).toBe(true);
    expect(isNewer('1.2.0-beta.1', '1.2.0')).toBe(false);
    expect(isNewer('1.2.0-beta.2', '1.2.0-beta.1')).toBe(true);
  });
});
