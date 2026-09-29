// Hydra — © 2026 José Segura (GKsegura) · MIT
import { computed, onBeforeUnmount, onMounted, ref, type Ref } from 'vue';
import { ROW } from './utils.ts';
import { visibleRange } from './window.ts';

const BUFFER = 30;
/** Altura do cabeçalho fixo (dentro da área rolável) dos painéis de grafo e timeline. */
export const HEAD_H = 26;

/**
 * Janela de linhas de uma lista virtualizada (altura de linha fixa = ROW) dentro de um contêiner rolável.
 * `total`: quantas linhas a lista tem; `top`: pixels acima da linha 0 na área rolável (cabeçalho fixo, WIP…).
 * Devolve `start`/`end` (intervalo [start, end) a renderizar) e `syncScroll`, para ligar ao @scroll.
 */
export function useWindow(scroller: Ref<HTMLElement | undefined>, total: () => number, top: () => number) {
  const scrollTop = ref(0);
  const viewport = ref(800);
  const range = computed(() =>
    visibleRange({ scrollTop: scrollTop.value, viewport: viewport.value, rowHeight: ROW, total: total(), top: top(), buffer: BUFFER }),
  );
  // start/end separados: quem depende só deles não recalcula a cada pixel de rolagem.
  const start = computed(() => range.value.start);
  const end = computed(() => range.value.end);

  // O navegador já entrega no máximo um evento de scroll por frame; atualizar direto evita um frame com linhas em branco.
  function syncScroll() {
    const box = scroller.value;
    if (!box) return;
    scrollTop.value = box.scrollTop;
    viewport.value = box.clientHeight;
  }

  let observer: ResizeObserver | undefined;
  onMounted(() => {
    if (!scroller.value) return;
    syncScroll();
    observer = new ResizeObserver(syncScroll);
    observer.observe(scroller.value);
  });
  onBeforeUnmount(() => observer?.disconnect());

  return { start, end, syncScroll };
}
