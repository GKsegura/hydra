<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
// Assinatura do autor + versão, no mesmo formato do CRONOS.
const year = new Date().getFullYear();
const version = __APP_VERSION__;
</script>

<template>
  <a class="signature" href="https://github.com/GKsegura/hydra" target="_blank" rel="noopener" :title="`Hydra v${version} — crafted by GKsegura`">
    GKsegura © {{ year }}
    <br>
    v{{ version }}
  </a>
</template>
