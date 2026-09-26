// Hydra — © 2026 José Segura (GKsegura) · MIT
import express from 'express';
import type { Session } from '../server.ts';
import type { Terminals } from '../terminal.ts';

/** Terminal integrado: abrir/fechar sessões. A entrada e a saída passam pelo WebSocket (server.ts). */
export function terminalRoutes(ctx: { session: Session; terminals: Terminals }) {
  const r = express.Router();

  r.get('/terminal', (_req, res) => {
    res.json(ctx.terminals.info());
  });
  // A pasta vem do repo do workspace aberto, nunca do corpo da requisição.
  r.post('/repos/:id/terminals', (req, res) => {
    const repo = ctx.session.repo(String(req.params.id));
    res.json(ctx.terminals.spawn(repo, req.body?.cols, req.body?.rows));
  });
  r.delete('/terminals/:tid', (req, res) => {
    ctx.terminals.kill(String(req.params.tid));
    res.json({ ok: true });
  });

  return r;
}
