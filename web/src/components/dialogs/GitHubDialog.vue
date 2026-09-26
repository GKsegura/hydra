<!-- Hydra — © 2026 José Segura (GKsegura) · MIT -->
<script setup lang="ts">
import { closeDialog, githubCancel, githubLogin, githubLogout } from '../../actions.ts';
import { state, toast } from '../../store.ts';

import BaseDialog from './BaseDialog.vue';

async function copyCode(code: string) {
  await navigator.clipboard?.writeText(code).catch(() => {});
  toast('Código copiado');
}

function close() {
  if (state.github?.login.state === 'pending') githubCancel();
  closeDialog();
}
</script>

<template>
  <BaseDialog title="Conta do GitHub" :width="480" @close="close">
    <template v-if="!state.github?.enabled">
      <div class="soon-box">
        <span class="soon-chip big">em breve</span>
        <p class="dialog-text"><b>O login com GitHub será liberado em breve.</b></p>
        <p class="faint">Com ele você vai poder escolher entre os seus repositórios na hora de clonar, publicar repositórios novos direto do Hydra e ver Pull Requests de repositórios privados.</p>
      </div>
      <p class="faint">Enquanto isso, <b>push, pull, fetch e clone já funcionam</b>: quem cuida do login é o Git Credential Manager que vem com o Git for Windows. Na primeira vez ele abre uma janela do GitHub para você entrar.</p>
    </template>

    <template v-else-if="state.github?.user">
      <div class="gh-user">
        <img :src="state.github.user.avatar" alt="" width="48" height="48">
        <div>
          <b>{{ state.github.user.name ?? state.github.user.login }}</b>
          <div class="faint">@{{ state.github.user.login }}</div>
        </div>
      </div>
      <p class="faint">O Hydra usa essa conta para listar seus repositórios, publicar repositórios novos, ver Pull Requests e autenticar push/pull/clone no github.com.</p>
    </template>

    <template v-else-if="state.github?.login.state === 'pending'">
      <p class="dialog-text">1. Copie o código abaixo.<br>2. Abra a página do GitHub e cole o código.<br>3. Autorize o Hydra. Esta janela atualiza sozinha.</p>
      <div class="device-code">
        <code>{{ state.github.login.userCode }}</code>
        <button class="btn" @click="copyCode(state.github.login.userCode)">Copiar</button>
      </div>
      <a class="btn primary wide" :href="state.github.login.verificationUri" target="_blank" rel="noopener">Abrir {{ state.github.login.verificationUri.replace('https://', '') }}</a>
      <p class="faint">Aguardando autorização…</p>
    </template>

    <template v-else-if="!state.github?.configured">
      <p class="dialog-text">O login com GitHub ainda não foi configurado nesta build do Hydra.</p>
      <p class="faint">
        É preciso registrar um <b>OAuth App</b> no GitHub (Settings → Developer settings → OAuth Apps, marcando "Enable Device Flow")
        e colocar o Client ID em <code>src/config.ts</code> ou na variável <code>HYDRA_GITHUB_CLIENT_ID</code>. O passo a passo está no README.
      </p>
      <p class="faint">Enquanto isso, push/pull/clone funcionam normalmente com o login do Git Credential Manager.</p>
    </template>

    <template v-else-if="!state.github?.canLogin">
      <p class="dialog-text">No modo CLI o Hydra não guarda login.</p>
      <p class="faint">Defina a variável <code>GITHUB_TOKEN</code> ou faça <code>gh auth login</code> no GitHub CLI e reinicie o <code>hydra</code>.</p>
    </template>

    <template v-else>
      <p v-if="state.github.login.state === 'error'" class="err">{{ state.github.login.error }}</p>
      <p class="dialog-text">Entre com o GitHub para ver seus repositórios, publicar projetos novos e acompanhar Pull Requests.</p>
      <p class="faint">O login usa o fluxo oficial do GitHub (código de dispositivo). O token fica criptografado pelo Windows neste computador.</p>
    </template>

    <template #footer>
      <button v-if="state.github?.user" class="btn danger" @click="githubLogout">Sair</button>
      <button class="btn" @click="close">{{ state.github?.login.state === 'pending' ? 'Cancelar' : 'Fechar' }}</button>
      <button v-if="state.github?.enabled && !state.github?.user && state.github?.available && state.github.login.state !== 'pending'" class="btn primary" @click="githubLogin">Entrar com GitHub</button>
    </template>
  </BaseDialog>
</template>
