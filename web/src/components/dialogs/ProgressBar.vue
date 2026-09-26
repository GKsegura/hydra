<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import type { Progress } from '../../types.ts';

defineProps<{ progress: Progress }>();
</script>

<template>
  <div class="progress">
    <div class="progress-track">
      <div class="progress-fill" :class="{ indeterminate: progress.percent === null }" :style="{ width: progress.percent === null ? '35%' : `${progress.percent}%` }" />
    </div>
    <small class="faint">{{ progress.phase }}{{ progress.percent !== null ? ` · ${progress.percent}%` : '…' }}</small>
  </div>
</template>
