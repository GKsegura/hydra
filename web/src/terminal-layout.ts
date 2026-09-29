// Hydra — © 2026 José Segura (GKsegura) · MIT
// Layout do dock de terminais: quais terminais aparecem, se o dock está dividido e qual está em foco.
// Funções puras (sem Vue nem DOM) para serem testadas no Node; a interface só troca o estado pelo que elas devolvem.
//
// Invariantes (garantidas por `normalize`, aplicada ao fim de toda função):
// - `panes` ⊆ `tabs`, sem repetição, no máximo 2 (MVP: uma divisão);
// - `active` (o terminal em foco) está sempre em `panes`; sem terminais, `active` é null e `panes` vazio;
// - sem divisão (`split` null) há um pane só; com divisão, dois — senão a divisão desfaz.

export type SplitDirection = 'columns' | 'rows';

export interface TermLayout {
  /** Ids de todos os terminais abertos da guia, na ordem das abas. */
  tabs: string[];
  /** O terminal em foco. */
  active: string | null;
  /** `columns`: lado a lado; `rows`: um em cima do outro; null: um só. */
  split: SplitDirection | null;
  /** Ids visíveis, na ordem (esquerda→direita ou cima→baixo). */
  panes: string[];
  /** Fração ocupada pelo primeiro pane. */
  ratio: number;
}

export const DEFAULT_RATIO = 0.5;
export const MIN_RATIO = 0.2;
export const MAX_RATIO = 0.8;
/** Tamanho mínimo da área do dock para permitir dividir (px). */
export const MIN_SPLIT_WIDTH = 500;
export const MIN_SPLIT_HEIGHT = 260;

export const emptyLayout = (): TermLayout => ({ tabs: [], active: null, split: null, panes: [], ratio: DEFAULT_RATIO });

const clampRatio = (r: number) => (Number.isFinite(r) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, r)) : DEFAULT_RATIO);

/**
 * Conserta um layout qualquer (vindo do storage, de uma guia antiga ou de um terminal que sumiu do servidor).
 * `existing`, se dado, é a lista de ids que ainda estão vivos: o resto sai das abas.
 */
export function normalize(layout: TermLayout, existing?: Iterable<string>): TermLayout {
  const alive = existing ? new Set(existing) : null;
  const tabs = [...new Set(layout.tabs)].filter((id) => !alive || alive.has(id));
  if (!tabs.length) return emptyLayout();

  let panes = [...new Set(layout.panes)].filter((id) => tabs.includes(id)).slice(0, 2);
  const active = layout.active && tabs.includes(layout.active) ? layout.active : (panes[0] ?? tabs[tabs.length - 1]);
  if (!panes.length) panes = [active];
  else if (!panes.includes(active)) panes = [active, ...panes.slice(1)]; // o foco sempre está à vista

  const split = layout.split && panes.length === 2 ? layout.split : null;
  if (!split) panes = [active];
  return { tabs, active, split, panes, ratio: clampRatio(layout.ratio) };
}

/** Um terminal novo aberto normalmente: ocupa o pane em foco (é o que a aba nova sempre fez) e ganha o foco. */
export function addTab(layout: TermLayout, id: string): TermLayout {
  const tabs = layout.tabs.includes(id) ? layout.tabs : [...layout.tabs, id];
  const panes = layout.panes.length ? layout.panes.map((p) => (p === layout.active ? id : p)) : [id];
  return normalize({ ...layout, tabs, panes, active: id });
}

/**
 * Divide o dock e coloca o terminal `id` (já aberto ou novo) na nova área, com o foco nela.
 * Sem divisão: o terminal em foco fica onde está e `id` vai para o segundo pane.
 * Já dividido: troca a direção e `id` ocupa o pane que não estava em foco (o outro terminal continua como aba).
 */
export function splitWith(layout: TermLayout, direction: SplitDirection, id: string): TermLayout {
  // Dividir com o próprio terminal em foco não faz sentido: no máximo troca a direção de uma divisão que já existe.
  if (id === layout.active) return layout.split ? normalize({ ...layout, split: direction }) : layout;
  const tabs = layout.tabs.includes(id) ? layout.tabs : [...layout.tabs, id];
  const focused = layout.active;
  if (!focused) return normalize({ ...layout, tabs, panes: [id], active: id, split: null });
  const panes = layout.split && layout.panes.length === 2
    ? layout.panes.map((p) => (p === focused ? p : id)) // o pane sem foco recebe o novo
    : [focused, id];
  const ratio = layout.split ? layout.ratio : DEFAULT_RATIO;
  return normalize({ tabs, active: id, split: direction, panes, ratio });
}

/** Desfaz a divisão sem fechar nada: fica só o terminal em foco; o outro continua como aba. */
export function unsplit(layout: TermLayout): TermLayout {
  return normalize({ ...layout, split: null, panes: layout.active ? [layout.active] : [] });
}

/** Fecha um terminal. Se estava dividido, o outro ocupa tudo; senão o foco vai para a aba vizinha. */
export function closeTerminal(layout: TermLayout, id: string): TermLayout {
  const i = layout.tabs.indexOf(id);
  if (i < 0) return layout;
  const tabs = layout.tabs.filter((t) => t !== id);
  if (!layout.panes.includes(id)) return normalize({ ...layout, tabs }); // fechou um que não estava à vista

  const other = layout.panes.find((p) => p !== id);
  if (layout.split && other) return normalize({ ...layout, tabs, split: null, panes: [other], active: other });
  const next = tabs[Math.min(i, tabs.length - 1)] ?? null;
  return normalize({ ...layout, tabs, split: null, panes: next ? [next] : [], active: next });
}

/**
 * Dá foco a um terminal (clique no pane ou na aba). Se ele já está à vista, só ganha o foco;
 * se não está (aba de fora), ocupa o pane que estava em foco.
 */
export function focus(layout: TermLayout, id: string): TermLayout {
  if (!layout.tabs.includes(id)) return layout;
  if (layout.panes.includes(id)) return normalize({ ...layout, active: id });
  return normalize({ ...layout, panes: layout.panes.map((p) => (p === layout.active ? id : p)), active: id });
}

/** Ajusta a proporção do primeiro pane (arrastar a divisória), limitada a 20%–80%. */
export function setRatio(layout: TermLayout, ratio: number): TermLayout {
  return { ...layout, ratio: clampRatio(ratio) };
}

/**
 * Leva o terminal `id` para o pane `index` (0 = primeiro, 1 = segundo) de um dock dividido. Se ele já estava no outro
 * pane, os dois trocam de lugar; se estava fora, o terminal que ocupava esse pane continua como aba. `id` ganha o foco.
 */
export function moveToPane(layout: TermLayout, id: string, index: 0 | 1): TermLayout {
  if (!layout.split || layout.panes.length !== 2 || !layout.tabs.includes(id)) return layout;
  const panes = [...layout.panes];
  const from = panes.indexOf(id);
  if (from >= 0) [panes[from], panes[index]] = [panes[index], panes[from]];
  else panes[index] = id;
  return normalize({ ...layout, panes, active: id });
}

/** A área do dock comporta uma divisão nessa direção? (Evita painéis minúsculos em janelas pequenas.) */
export function canSplit(direction: SplitDirection, width: number, height: number): boolean {
  return direction === 'columns' ? width >= MIN_SPLIT_WIDTH : height >= MIN_SPLIT_HEIGHT;
}
