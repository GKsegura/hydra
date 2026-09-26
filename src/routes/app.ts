// Hydra — © 2026 José Segura (GKsegura) · MIT
import path from 'node:path';
import express from 'express';
import { addRemote, clone, GITIGNORE_TEMPLATES, initRepo, push, repoNameFromUrl } from '../git/index.ts';
import { createRepo, listRepos } from '../github.ts';
import type { GitHubSession } from '../github-session.ts';
import { bool, HttpError, optStr, str } from '../http.ts';
import type { Jobs } from '../jobs.ts';

export interface AppContext {
  jobs: Jobs;
  github: GitHubSession;
}

/** Rotas que não dependem de um workspace aberto: clonar, criar repositório e conta do GitHub. */
export function appRoutes(ctx: AppContext) {
  const r = express.Router();

  // ---------------------------------------------------------------- clonar / criar
  r.get('/repos/templates', (_req, res) => {
    res.json({ gitignore: GITIGNORE_TEMPLATES });
  });

  r.post('/repos/clone', (req, res) => {
    const url = str(req.body?.url, 'a URL do repositório').trim();
    const parent = str(req.body?.parent, 'a pasta de destino').trim();
    const dest = path.resolve(parent, optStr(req.body?.name)?.trim() || repoNameFromUrl(url));
    const jobId = ctx.jobs.start(`clone:${dest.toLowerCase()}`, 'clone', async (progress) => ({ path: await clone(url, dest, progress) }));
    res.json({ jobId, path: dest });
  });

  r.post('/repos/init', (req, res) => {
    const parent = str(req.body?.parent, 'a pasta onde criar').trim();
    const name = str(req.body?.name, 'o nome do repositório').trim();
    if (/[<>:"/\\|?*]/.test(name)) throw new HttpError(400, 'Nome com caracteres inválidos para pasta');
    const dir = path.resolve(parent, name);
    const publish = req.body?.publish && typeof req.body.publish === 'object' ? { private: req.body.publish.private !== false } : null;
    if (publish && !ctx.github.token) throw new HttpError(401, 'Entre com o GitHub para publicar o repositório.');

    const jobId = ctx.jobs.start(`init:${dir.toLowerCase()}`, 'init', async (progress) => {
      progress({ phase: 'Criando repositório', percent: null, line: '' });
      const created = await initRepo(dir, { gitignore: optStr(req.body?.gitignore), readme: bool(req.body?.readme), description: optStr(req.body?.description) });
      let url: string | null = null;
      if (publish) {
        if (!created.committed) throw new HttpError(400, 'Repositório criado, mas sem commit inicial (configure user.name/user.email no git). Publique depois pelo painel.');
        progress({ phase: 'Criando repositório no GitHub', percent: null, line: '' });
        const gh = await createRepo(ctx.github.token!, { name, private: publish.private, description: optStr(req.body?.description) });
        await addRemote(created.path, 'origin', gh.clone_url);
        await push(created.path, progress);
        url = gh.html_url;
      }
      return { path: created.path, committed: created.committed, url };
    });
    res.json({ jobId, path: dir });
  });

  // ---------------------------------------------------------------- conta do GitHub
  r.get('/github', (_req, res) => {
    res.json(ctx.github.info());
  });
  r.post('/github/login', async (_req, res) => {
    if (!ctx.github.info().canLogin) throw new HttpError(400, 'O login pela interface existe só no app desktop. No CLI, use GITHUB_TOKEN ou `gh auth login`.');
    await ctx.github.startLogin();
    res.json(ctx.github.info());
  });
  r.post('/github/login/cancel', (_req, res) => {
    ctx.github.cancelLogin();
    res.json(ctx.github.info());
  });
  r.post('/github/logout', async (_req, res) => {
    await ctx.github.logout();
    res.json(ctx.github.info());
  });
  r.get('/github/repos', async (_req, res) => {
    if (!ctx.github.token) throw new HttpError(401, 'Entre com o GitHub para ver seus repositórios.');
    res.json(await listRepos(ctx.github.token));
  });

  return r;
}
