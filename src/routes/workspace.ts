// Hydra — © 2026 José Segura (GKsegura) · MIT
import express from 'express';
import { HttpError, str } from '../http.ts';
import { commitMany } from '../multi.ts';
import type { Session } from '../server.ts';

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

  return r;
}
