// Hydra — © 2026 José Segura (GKsegura) · MIT
import express from 'express';
import { HttpError, str } from '../http.ts';
import { branchOverview, checkoutMany, commitMany, createMany, mergeMany, previewMany } from '../multi.ts';
import type { Session } from '../server.ts';
import type { Repo } from '../workspace.ts';

/** Operações no workspace inteiro (vários repos de uma vez): /api/workspace/… */
export function workspaceRoutes(ctx: { session: Session }) {
  const r = express.Router();

  // Mesma mensagem em vários repos. O push, se pedido, é feito depois pela interface, repo a repo (com progresso).
  r.post('/workspace/commit', async (req, res) => {
    const summary = str(req.body?.summary, 'o resumo do commit').trim();
    const body = typeof req.body?.body === 'string' ? req.body.body : '';
    const list = req.body?.repos;
    if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'Escolha pelo menos um repositório');
    const seen = new Set<string>();
    const items = list.map((x: { id?: unknown; stageAll?: unknown }) => {
      const repo = ctx.session.repo(String(x?.id));
      if (seen.has(repo.id)) throw new HttpError(400, 'Repositório repetido');
      seen.add(repo.id);
      return { repo, stageAll: x?.stageAll === true };
    });
    res.json({ results: await commitMany(items, summary, body) });
  });

  // ---------------------------------------------------------------- branches em vários repos

  /** Lista de ids do corpo → repos do workspace (sem repetir, só os que existem). */
  const reposOf = (list: unknown): Repo[] => {
    if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'Escolha pelo menos um repositório');
    const ids = list.map((x) => String(typeof x === 'object' && x !== null ? (x as { id?: unknown }).id : x));
    if (new Set(ids).size !== ids.length) throw new HttpError(400, 'Repositório repetido');
    return ids.map((id) => ctx.session.repo(id));
  };

  r.get('/workspace/branches', async (_req, res) => {
    res.json(await branchOverview(ctx.session.current().repos));
  });
  r.post('/workspace/branches/create', async (req, res) => {
    const name = str(req.body?.name, 'o nome da branch').trim();
    const repos = reposOf(req.body?.repos);
    const from = new Map((req.body.repos as { id?: unknown; from?: unknown }[]).map((x) => [String(x?.id), typeof x?.from === 'string' ? x.from : undefined]));
    res.json({ results: await createMany(repos.map((repo) => ({ repo, from: from.get(repo.id) })), name, req.body?.checkout !== false) });
  });
  r.post('/workspace/branches/checkout', async (req, res) => {
    const name = str(req.body?.name, 'a branch').trim();
    const repos = reposOf(req.body?.repos);
    const opts = new Map((req.body.repos as { id?: unknown; mode?: unknown; create?: unknown }[]).map((x) => [String(x?.id), x]));
    res.json({
      results: await checkoutMany(repos.map((repo) => {
        const o = opts.get(repo.id);
        return { repo, mode: o?.mode === 'stash' ? 'stash' : 'carry', create: o?.create === true };
      }), name),
    });
  });
  r.post('/workspace/branches/merge-preview', async (req, res) => {
    res.json(await previewMany(reposOf(req.body?.repos), str(req.body?.branch, 'a branch').trim()));
  });
  r.post('/workspace/branches/merge', async (req, res) => {
    const branch = str(req.body?.branch, 'a branch').trim();
    res.json({ results: await mergeMany(reposOf(req.body?.repos), branch, req.body?.noFastForward === true) });
  });

  return r;
}
