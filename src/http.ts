// Hydra — © 2026 José Segura (GKsegura) · MIT

/** Erro com status HTTP. `code` identifica casos que a interface trata (ex.: "not_merged" pede confirmação). */
export class HttpError extends Error {
  status: number;
  code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Lê um campo de texto obrigatório do corpo da requisição. */
export function str(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `Informe ${field}`);
  return value;
}

export const optStr = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value : undefined);
export const bool = (value: unknown): boolean => value === true || value === 'true' || value === 1;

export function int(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, `${field} inválido`);
  return n;
}
