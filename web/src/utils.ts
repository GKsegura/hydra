// Hydra — © 2026 José Segura (GKsegura) · MIT
export const ROW = 28;
export const COL = 16;
export const PAD = 12;
export const MIN_PANE = 260;
export const COLORS = ['#20b2d8', '#3d7dff', '#a64dff', '#e040c8', '#ff3d8b', '#ff5252', '#ff8a3d', '#ffd23f', '#8be04e', '#34d6a6'];

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60],
];

export function ago(sec: number): string {
  const d = sec - Date.now() / 1000;
  for (const [u, s] of UNITS) if (Math.abs(d) >= s) return rtf.format(Math.round(d / s), u);
  return 'agora';
}

export const fullDate = (sec: number) => new Date(sec * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export function hashColor(str: string): string {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

export function initials(name: string): string {
  const parts = (name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function splitPath(p: string) {
  const i = p.lastIndexOf('/');
  return i === -1 ? { dir: '', base: p } : { dir: p.slice(0, i + 1), base: p.slice(i + 1) };
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
