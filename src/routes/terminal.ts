// Hydra — © 2026 José Segura (GKsegura) · MIT
import express from 'express';
import type { Terminals } from '../terminal.ts';
import type { WorkspaceScope } from '../workspace-session.ts';

/** Terminal integrado: abrir/fechar sessões. A entrada e a saída passam pelo WebSocket (server.ts). */
export function terminalRoutes(ctx: { session: WorkspaceScope; terminals: Terminals }) {
  const r = express.Router();

  // Os terminais vivos deste workspace: a interface os reencontra depois de recarregar a página.
  r.get('/terminals', (_req, res) => {
    res.json(ctx.terminals.list(ctx.session.currentSession().id));
  });
  // A pasta vem do repo do workspace da rota, nunca do corpo da requisição. (Info do shell e encerramento por id: em server.ts.)
  r.post('/repos/:id/terminals', (req, res) => {
    const workspace = ctx.session.currentSession();
    res.json(ctx.terminals.spawn(workspace.repo(String(req.params.id)), req.body?.cols, req.body?.rows, workspace.id));
  });

  return r;
}
