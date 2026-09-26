<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { openDialog } from '../actions.ts';
import { state } from '../store.ts';
</script>

<template>
  <button
    v-if="state.github"
    class="gh-account"
    :class="{ soon: !state.github.enabled }"
    :title="!state.github.enabled ? 'Login com GitHub: em breve' : state.github.user ? `GitHub: @${state.github.user.login}` : 'Entrar com GitHub'"
    @click="openDialog('github')"
  >
    <img v-if="state.github.user" :src="state.github.user.avatar" alt="" width="22" height="22">
    <svg v-else viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" /></svg>
    <span>{{ state.github.user ? state.github.user.login : 'GitHub' }}</span>
    <span v-if="!state.github.enabled" class="soon-chip">em breve</span>
  </button>
</template>
