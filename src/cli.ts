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
import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { renderStatic } from './render.ts';
import { startServer } from './server.ts';
import { cliToken } from './secrets.ts';
import { BANNER, SIGNATURE, VERSION } from './version.ts';
import { loadWorkspace, type Workspace } from './workspace.ts';

const HELP = `
hydra v${VERSION} — cliente git visual para workspaces · crafted by GKsegura

Uso:
  hydra [workspace] [opções]

  workspace   arquivo .code-workspace, pasta com um .code-workspace,
              pasta com vários repos ou um repo (padrão: pasta atual;
              sem repositórios, abre a tela inicial para escolher)

Opções:
  -p, --port <n>     porta do servidor local (padrão 4711)
  -m, --max <n>      máximo de commits por repo (padrão 1000)
  -o, --out <file>   gera um HTML estático (somente leitura) em vez de subir o servidor
      --no-open      não abre o navegador
  -v, --version      mostra a versão
  -h, --help         mostra esta ajuda

Login no GitHub pelo CLI: defina GITHUB_TOKEN ou tenha o GitHub CLI (gh) logado.
`;

function openInBrowser(target: string): void {
  if (process.platform === 'win32') execFile('explorer.exe', [target]);
  else if (process.platform === 'darwin') execFile('open', [target]);
  else execFile('xdg-open', [target]);
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string', short: 'p', default: '4711' },
      max: { type: 'string', short: 'm', default: '1000' },
      out: { type: 'string', short: 'o' },
      'no-open': { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
  });

  if (values.version) {
    console.log(SIGNATURE);
    return;
  }
  if (values.help) {
    console.log(HELP);
    return;
  }

  const max = Math.max(1, Number(values.max) || 1000);
  const explicit = positionals[0];

  // Sem argumento, a pasta atual só é usada se tiver repositórios; senão o app abre na tela inicial.
  let ws: Workspace | null = null;
  if (explicit) ws = loadWorkspace(explicit);
  else {
    try {
      ws = loadWorkspace(process.cwd());
    } catch {
      ws = null;
    }
  }
  if (ws && !ws.repos.length) {
    if (explicit || values.out) throw new Error('Nenhum repositório git encontrado nesse workspace.');
    ws = null;
  }

  // Assinatura em verde no terminal (sem cor quando a saída vai para arquivo/pipe).
  const green = (s: string) => (process.stdout.isTTY ? `\x1b[38;2;52;214;166m${s}\x1b[0m` : s);
  console.log(`\n${green(BANNER.replace(/^/gm, '  '))}`);
  console.log(`\n  🐉 ${SIGNATURE}`);
  if (ws) {
    console.log(`     workspace ${ws.name}`);
    for (const r of ws.repos) console.log(`     • ${r.name}  ${r.path}`);
  } else {
    console.log('     nenhum workspace aberto (escolha um na tela inicial)');
  }

  if (values.out) {
    if (!ws) throw new Error('Informe um workspace para gerar o HTML estático.');
    const out = path.resolve(values.out);
    mkdirSync(path.dirname(out), { recursive: true });
    writeFileSync(out, await renderStatic(ws, max));
    console.log(`\n  HTML gerado: ${out}\n`);
    if (!values['no-open']) openInBrowser(out);
    return;
  }

  const { url } = await startServer(ws ? (ws.source ?? null) : null, {
    port: Number(values.port) || 4711,
    max,
    secrets: { get: cliToken, set: async () => {}, clear: async () => {}, persistent: false },
  });
  console.log(`\n  Abrindo ${url}\n  Ctrl+C para encerrar.\n`);
  if (!values['no-open']) openInBrowser(url);
}

main().catch((err) => {
  console.error(`\n  hydra: ${(err as Error).message}\n`);
  process.exit(1);
});
