/*
 *    ██████╗ ██╗  ██╗███████╗███████╗ ██████╗ ██╗   ██╗██████╗  █████╗
 *   ██╔════╝ ██║ ██╔╝██╔════╝██╔════╝██╔════╝ ██║   ██║██╔══██╗██╔══██╗
 *   ██║  ███╗█████╔╝ ███████╗█████╗  ██║  ███╗██║   ██║██████╔╝███████║
 *   ██║   ██║██╔═██╗ ╚════██║██╔══╝  ██║   ██║██║   ██║██╔══██╗██╔══██║
 *   ╚██████╔╝██║  ██╗███████║███████╗╚██████╔╝╚██████╔╝██║  ██║██║  ██║
 *    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚══════╝ ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝
 *
 *   Hydra — crafted by GKsegura
 *   © 2026 José Segura · MIT
 */

import { createApp } from 'vue';
import '@xterm/xterm/css/xterm.css';
import App from './App.vue';
import './style.css';

console.log(
  `%c GKsegura %c Hydra v${__APP_VERSION__} %c`,
  'background:#34d6a6;color:#0f1115;font-weight:bold;padding:4px 8px;border-radius:4px 0 0 4px;font-size:14px',
  'background:#15171c;color:#34d6a6;font-weight:bold;padding:4px 8px;border-radius:0 4px 4px 0;font-size:14px',
  '',
);
console.log('%cCrafted with purpose. © ' + new Date().getFullYear(), 'color:#666;font-size:11px;font-style:italic;padding-left:4px');

/**
 * Tela de erro em DOM puro (funciona mesmo com o Vue quebrado): em vez de deixar o usuário olhando
 * para o fundo cinza da janela, mostra o que houve e oferece recarregar.
 */
function showFatal(err: unknown) {
  console.error(err);
  if (document.getElementById('hydra-fatal')) return;
  const box = document.createElement('div');
  box.id = 'hydra-fatal';
  box.setAttribute('style', 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:#15171c;color:#e6e8ee;font:14px system-ui,sans-serif;padding:24px');
  const inner = document.createElement('div');
  inner.setAttribute('style', 'max-width:640px');
  const title = document.createElement('h2');
  title.textContent = 'Algo deu errado no Hydra';
  const msg = document.createElement('pre');
  msg.setAttribute('style', 'white-space:pre-wrap;color:#f0a0a0;max-height:40vh;overflow:auto');
  msg.textContent = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  const btn = document.createElement('button');
  btn.textContent = 'Recarregar';
  btn.setAttribute('style', 'padding:8px 16px;border-radius:6px;border:0;background:#34d6a6;color:#0f1115;font-weight:700;cursor:pointer');
  btn.onclick = () => location.reload();
  inner.append(title, msg, btn);
  box.append(inner);
  document.body.append(box);
}

const app = createApp(App);
app.config.errorHandler = (err) => showFatal(err);
window.addEventListener('error', (ev) => showFatal(ev.error ?? ev.message));
window.addEventListener('unhandledrejection', (ev) => {
  // Falhas de API já viram toast; aqui só o que ninguém tratou. Não derruba a tela por rejeição comum.
  console.error('unhandledrejection', ev.reason);
});
app.mount('#app');
