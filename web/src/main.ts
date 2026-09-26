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
import App from './App.vue';
import './style.css';

console.log(
  `%c GKsegura %c Hydra v${__APP_VERSION__} %c`,
  'background:#34d6a6;color:#0f1115;font-weight:bold;padding:4px 8px;border-radius:4px 0 0 4px;font-size:14px',
  'background:#15171c;color:#34d6a6;font-weight:bold;padding:4px 8px;border-radius:0 4px 4px 0;font-size:14px',
  '',
);
console.log('%cCrafted with purpose. © ' + new Date().getFullYear(), 'color:#666;font-size:11px;font-style:italic;padding-left:4px');

createApp(App).mount('#app');
