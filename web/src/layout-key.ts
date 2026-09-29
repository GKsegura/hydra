// Hydra — © 2026 José Segura (GKsegura) · MIT
// Chave do layout salvo de cada workspace no localStorage. Função pura, testável no Node.

/** FNV-1a de 32 bits em hexadecimal: curto, estável e suficiente para distinguir caminhos. */
export function hashText(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** Chave antiga, pelo nome do workspace: dois projetos com o mesmo nome (ex.: "backend") colidiam. */
export const legacyLayoutKey = (name: string | undefined) => `hydra:${name}:layout`;

/** Chave pelo caminho do que foi aberto (sem diferenciar maiúsculas: no Windows "C:\x" e "c:\X" são a mesma pasta). */
export function layoutKeyFor(source: string | null, name: string | undefined): string {
  return source ? `hydra:ws-${hashText(source.toLowerCase())}:layout` : legacyLayoutKey(name);
}
