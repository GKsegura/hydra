<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { hashColor, initials } from '../utils.ts';

defineProps<{ name: string; email?: string; large?: boolean }>();
</script>

<template>
  <span class="avatar" :class="{ lg: large }" :style="{ '--c': hashColor(email || name) }" :title="name">{{ initials(name) }}</span>
</template>
