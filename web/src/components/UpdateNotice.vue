<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { desktop } from '../api.ts';
import type { UpdateState } from '../types.ts';

// Só no app desktop empacotado. "Depois" esconde o aviso desta versão; no instalador, ela é instalada ao fechar o Hydra.
const update = ref<UpdateState>({ state: 'idle' });
const dismissed = ref<string | null>(null);
const installing = ref(false);

onMounted(() => desktop?.onUpdate((s) => (update.value = s)));

function install() {
  installing.value = true;
  void desktop?.installUpdate();
}
</script>

<template>
  <div v-if="update.state === 'downloading'" class="update-chip muted" :title="`Baixando a atualização em segundo plano`">
    Baixando Hydra {{ update.version }}… {{ update.percent }}%
  </div>
  <div v-else-if="update.state === 'ready' && dismissed !== update.version" class="update-chip ready" role="status">
    <b>Hydra {{ update.version }} pronto</b>
    <button class="btn primary sm" :disabled="installing" @click="install">{{ installing ? 'Reiniciando…' : 'Reiniciar agora' }}</button>
    <button class="btn ghost sm" title="Instala quando você fechar o Hydra" @click="dismissed = update.version">Depois</button>
  </div>
  <div v-else-if="update.state === 'available' && dismissed !== update.version" class="update-chip ready" role="status">
    <b>Hydra {{ update.version }} disponível</b>
    <a class="btn primary sm" :href="update.url" target="_blank" rel="noopener">Baixar</a>
    <button class="btn ghost sm" @click="dismissed = update.version">Depois</button>
  </div>
</template>
