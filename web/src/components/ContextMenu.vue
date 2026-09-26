<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { state, type MenuItem } from '../store.ts';

const el = ref<HTMLElement>();
const pos = ref({ left: 0, top: 0 });

// Mantém o menu dentro da janela (abre para cima/esquerda perto das bordas).
watch(
  () => state.menu,
  async (m) => {
    if (!m) return;
    pos.value = { left: m.x, top: m.y };
    await nextTick();
    const r = el.value?.getBoundingClientRect();
    if (!r) return;
    pos.value = {
      left: Math.min(m.x, window.innerWidth - r.width - 8),
      top: m.y + r.height > window.innerHeight - 8 ? Math.max(8, m.y - r.height) : m.y,
    };
  },
);

function pick(item: MenuItem) {
  if (item.disabled || item.separator) return;
  state.menu = null;
  item.run?.();
}

const close = () => (state.menu = null);
function onDoc(ev: MouseEvent) {
  if (state.menu && !el.value?.contains(ev.target as Node)) close();
}
function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && state.menu) close();
}
onMounted(() => {
  document.addEventListener('mousedown', onDoc);
  window.addEventListener('keydown', onKey);
  window.addEventListener('blur', close);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDoc);
  window.removeEventListener('keydown', onKey);
  window.removeEventListener('blur', close);
});
</script>

<template>
  <div v-if="state.menu" ref="el" class="ctx-menu" :style="{ left: `${pos.left}px`, top: `${pos.top}px` }" role="menu" @contextmenu.prevent>
    <template v-for="(item, i) in state.menu.items" :key="i">
      <div v-if="item.separator" class="menu-sep" />
      <button v-else class="menu-item" :class="{ danger: item.danger }" :disabled="item.disabled" role="menuitem" @click="pick(item)">
        <span>{{ item.label }}</span>
        <span v-if="item.hint" class="faint">{{ item.hint }}</span>
      </button>
    </template>
  </div>
</template>
