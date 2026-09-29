// Hydra — © 2026 José Segura (GKsegura) · MIT
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** O que estava aberto quando o app foi fechado: reaberto na próxima execução. Hoje é uma guia só; as guias virão depois. */
export interface SessionState {
  tabs: { source: string }[];
  activeTab: number;
}

/** Sessão restaurável em JSON. Separada dos "Recentes": fechar um workspace sai da sessão, mas continua nos recentes. */
export class SessionStore {
  file: string;

  constructor(file: string) {
    this.file = file;
  }

  read(): SessionState {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<SessionState>;
      const tabs = Array.isArray(data.tabs) ? data.tabs.filter((t) => t && typeof t.source === 'string' && t.source) : [];
      const active = Number.isInteger(data.activeTab) ? (data.activeTab as number) : 0;
      return { tabs: tabs.map((t) => ({ source: t.source })), activeTab: Math.min(Math.max(active, 0), Math.max(tabs.length - 1, 0)) };
    } catch {
      return { tabs: [], activeTab: 0 };
    }
  }

  write(state: SessionState) {
    try {
      mkdirSync(path.dirname(this.file), { recursive: true });
      writeFileSync(this.file, JSON.stringify(state, null, 2));
    } catch {
      /* sem permissão de escrita: a sessão só não é lembrada */
    }
  }

  /** Sessão de uma guia só (o workspace aberto agora). */
  setSingle(source: string) {
    this.write({ tabs: [{ source }], activeTab: 0 });
  }

  clear() {
    this.write({ tabs: [], activeTab: 0 });
  }
}
