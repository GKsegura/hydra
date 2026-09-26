<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { closeDialog } from '../../actions.ts';
import BaseDialog from './BaseDialog.vue';

const props = defineProps<{ title: string; message: string; confirm?: string; danger?: boolean; resolve: (ok: boolean) => void }>();

function answer(ok: boolean) {
  closeDialog();
  props.resolve(ok);
}
</script>

<template>
  <BaseDialog :title="title" @close="answer(false)">
    <p class="dialog-text">{{ message }}</p>
    <template #footer>
      <button class="btn" @click="answer(false)">Cancelar</button>
      <button class="btn primary" :class="{ danger }" @click="answer(true)">{{ confirm ?? 'Confirmar' }}</button>
    </template>
  </BaseDialog>
</template>
