<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
defineProps<{ name: 'branch' | 'local' | 'remote' | 'tag' | 'check' | 'copy' | 'search' | 'refresh' | 'terminal' | 'chevron-right' | 'chevron-left'; size?: number }>();
</script>

<template>
  <svg viewBox="0 0 16 16" :width="size" :height="size" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">
    <template v-if="name === 'branch'">
      <circle cx="4.5" cy="3.5" r="1.5" /><circle cx="4.5" cy="12.5" r="1.5" /><circle cx="11.5" cy="5.5" r="1.5" />
      <path d="M4.5 5v6M11.5 7c0 3-7 2-7 4" />
    </template>
    <template v-else-if="name === 'local'"><rect x="2" y="3" width="12" height="8" rx="1" /><path d="M5 14h6M8 11v3" /></template>
    <path v-else-if="name === 'remote'" d="M4.5 12.5a3 3 0 0 1-.4-6A4 4 0 0 1 12 6a3.2 3.2 0 0 1-.3 6.5z" />
    <template v-else-if="name === 'tag'"><path d="M2.5 2.5h5l6 6-5 5-6-6z" /><circle cx="5.5" cy="5.5" r="1" /></template>
    <path v-else-if="name === 'check'" d="M3 8.5 6.5 12 13 4.5" />
    <template v-else-if="name === 'copy'">
      <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </template>
    <template v-else-if="name === 'search'"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></template>
    <path v-else-if="name === 'refresh'" d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" />
    <path v-else-if="name === 'chevron-right'" d="m6 3 5 5-5 5" />
    <path v-else-if="name === 'chevron-left'" d="m10 3-5 5 5 5" />
    <template v-else-if="name === 'terminal'"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><path d="m4.5 6.5 2 2-2 2M8.5 10.5h3" /></template>
  </svg>
</template>
