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
    const workspace = ctx.session.currentSession();
    res.json(ctx.terminals.spawn(workspace.repo(String(req.params.id)), req.body?.cols, req.body?.rows, workspace.id));
  });
  r.delete('/terminals/:tid', (req, res) => {
    ctx.terminals.kill(String(req.params.tid));
    res.json({ ok: true });
  });

  return r;
}
