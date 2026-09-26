// Hydra — © 2026 José Segura (GKsegura) · MIT
import { describe, expect, it } from 'vitest';
import { describeUpdateError } from '../electron/update-errors.ts';

describe('describeUpdateError (mensagens de "Procurar atualizações…")', () => {
  it('Release criada mas ainda sem latest.yml vira "sendo preparada", sem o texto técnico', () => {
    // Texto real do electron-updater quando a Release existe mas o CI ainda não anexou o instalador.
    const raw = 'Cannot find latest.yml in the latest release artifacts (https://github.com/GKsegura/hydra/releases/download/v1.4.0/latest.yml): '
      + 'HttpError: 404\n"method: GET url: https://github.com/GKsegura/hydra/releases/download/v1.4.0/latest.yml\n\nPlease double check…"\nHeaders: {\n  "cache-control": "no-cache"\n}';
    const r = describeUpdateError(raw);
    expect(r.message).toMatch(/sendo preparada/);
    expect(r.detail).not.toMatch(/Headers|HttpError|cache-control/);
  });

  it('sem internet', () => {
    expect(describeUpdateError('net::ERR_INTERNET_DISCONNECTED').message).toBe('Sem conexão com o GitHub.');
    expect(describeUpdateError('getaddrinfo ENOTFOUND api.github.com').message).toBe('Sem conexão com o GitHub.');
  });

  it('limite de consultas do GitHub', () => {
    expect(describeUpdateError('HttpError: 403 API rate limit exceeded for 1.2.3.4').message).toMatch(/limitou/);
  });

  it('outros erros: só a primeira linha, curta', () => {
    const r = describeUpdateError(`algo estranho aconteceu\n${'stack '.repeat(100)}`);
    expect(r.message).toBe('Não foi possível procurar atualizações.');
    expect(r.detail).toBe('algo estranho aconteceu');
    expect(describeUpdateError('x'.repeat(500)).detail.length).toBeLessThanOrEqual(201);
  });
});
