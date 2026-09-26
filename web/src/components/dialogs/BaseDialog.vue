<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ title: string; width?: number; busy?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const box = ref<HTMLElement>();

function onKey(ev: KeyboardEvent) {
  if (ev.key === 'Escape' && !props.busy) {
    ev.stopPropagation();
    emit('close');
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKey, true);
  await nextTick();
  box.value?.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=radio]), textarea, select, button.primary')?.focus();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true));
</script>

<template>
  <div class="dialog-backdrop" @mousedown.self="!busy && emit('close')">
    <div ref="box" class="dialog" :style="{ width: `${width ?? 460}px` }" role="dialog" :aria-label="title">
      <header class="dialog-head">
        <h3>{{ title }}</h3>
        <button class="x" title="Fechar (Esc)" :disabled="busy" @click="emit('close')">✕</button>
      </header>
      <div class="dialog-body"><slot /></div>
      <footer v-if="$slots.footer" class="dialog-foot"><slot name="footer" /></footer>
    </div>
  </div>
</template>
