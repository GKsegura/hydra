<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { computed } from 'vue';
import { splitPath } from '../utils.ts';

const props = defineProps<{ path: string; status: string; orig?: string; active?: boolean }>();
const parts = computed(() => splitPath(props.path));
const letter = computed(() => (props.status === '?' ? 'A' : props.status));
</script>

<template>
  <li class="file" :class="{ active }" :title="orig ? `${orig} → ${path}` : path">
    <span class="st" :class="`st-${letter}`">{{ letter }}</span>
    <span class="p"><bdi><span class="dir">{{ parts.dir }}</span>{{ parts.base }}</bdi></span>
    <slot />
  </li>
</template>
