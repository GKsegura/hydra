// Hydra — © 2026 José Segura (GKsegura) · MIT
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoGraph, workspaceSummary } from './data.ts';
import { distDir, indexHtml } from './server.ts';
import type { Workspace } from './workspace.ts';

/** Gera um HTML único e somente leitura, com o CSS, o JS do Vue e os dados embutidos. */
export async function renderStatic(ws: Workspace, max: number): Promise<string> {
  const summary = await workspaceSummary(ws);
  const graphs = Object.fromEntries(await Promise.all(ws.repos.map(async (r) => [r.id, await repoGraph(r, max)] as const)));
  const css = readFileSync(path.join(distDir(), 'assets/app.css'), 'utf8');
  const js = readFileSync(path.join(distDir(), 'assets/app.js'), 'utf8').replace(/<\/script/gi, '<\\/script');

  return indexHtml({ mode: 'static', workspace: ws.name, generatedAt: Date.now(), data: { summary, graphs } })
    .replace(/<link rel="stylesheet"[^>]*href="\/assets\/app\.css"[^>]*>/, () => `<style>\n${css}\n</style>`)
    .replace(/<script type="module"[^>]*src="\/assets\/app\.js"[^>]*><\/script>/, () => `<script type="module">\n${js}\n</script>`);
}
