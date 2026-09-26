<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { ref } from 'vue';
import { desktop } from '../api.ts';
import { openDialog } from '../actions.ts';
import { openWorkspace, pickWorkspace, removeRecent, state } from '../store.ts';
import { ago } from '../utils.ts';
import SignatureFooter from './SignatureFooter.vue';

const typed = ref('');

async function submit() {
  if (await openWorkspace(typed.value)) typed.value = '';
}
</script>

<template>
  <div class="welcome">
    <div class="welcome-box">
      <div class="welcome-brand">
        <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 26V6M16 26V12M23 26V6M9 12c0 5 7 4 7 9M23 12c0 5-7 4-7 9" /></svg>
        <div>
          <h1>Hydra</h1>
          <p class="muted">Seus repositórios lado a lado — commit, branches, merge e sync com o GitHub.</p>
        </div>
      </div>

      <button v-if="state.welcome && state.app?.workspace" class="btn ghost back" @click="state.welcome = false">
        ← Voltar para {{ state.app.workspace.name }}
      </button>

      <section class="welcome-cards">
        <button class="welcome-card" @click="openDialog('clone')">
          <span class="wc-ico">⤓</span>
          <b>Clonar repositório</b>
          <small class="faint">Do GitHub ou de qualquer URL git</small>
        </button>
        <button class="welcome-card" @click="openDialog('init')">
          <span class="wc-ico">＋</span>
          <b>Novo repositório</b>
          <small class="faint">Cria a pasta, .gitignore e README — e publica, se quiser</small>
        </button>
        <button class="welcome-card" :disabled="!desktop" :title="desktop ? '' : 'No navegador, cole o caminho abaixo'" @click="pickWorkspace('folder')">
          <span class="wc-ico">▢</span>
          <b>Abrir repositório</b>
          <small class="faint">Um projeto normal (uma pasta com .git)</small>
        </button>
        <button class="welcome-card" :disabled="!desktop" :title="desktop ? '' : 'No navegador, cole o caminho abaixo'" @click="pickWorkspace('file')">
          <span class="wc-ico">▦</span>
          <b>Abrir workspace</b>
          <small class="faint">Arquivo .code-workspace com vários repositórios</small>
        </button>
      </section>

      <section class="welcome-open">
        <h2>Ou cole um caminho</h2>
        <form class="welcome-path" @submit.prevent="submit">
          <input v-model="typed" placeholder="C:\...\projeto  ·  C:\...\projeto.code-workspace  ·  uma pasta com vários repos" spellcheck="false">
          <button class="btn" :class="{ primary: !desktop }" :disabled="!typed.trim() || state.opening">Abrir</button>
        </form>
        <p class="faint hint">
          Aceita um repositório sozinho, uma pasta com repositórios ou um arquivo <code>.code-workspace</code>.
          <template v-if="desktop"> Você também pode <b>arrastar</b> o arquivo ou a pasta para esta janela.</template>
        </p>
      </section>

      <section v-if="state.app?.recents.length" class="welcome-recents">
        <h2>Recentes</h2>
        <ul>
          <li v-for="r in state.app.recents" :key="r.path" :title="r.path" @click="openWorkspace(r.path)">
            <span class="r-name">{{ r.name }}</span>
            <span class="r-path"><bdi>{{ r.path }}</bdi></span>
            <span class="r-when">{{ ago(r.openedAt / 1000) }}</span>
            <button class="x" title="Remover dos recentes" @click.stop="removeRecent(r.path)">✕</button>
          </li>
        </ul>
      </section>

      <SignatureFooter />
    </div>
  </div>
</template>
