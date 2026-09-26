// Hydra — © 2026 José Segura (GKsegura) · MIT
// Sem dependência do Electron, para poder ser testado no Node.

/**
 * Transforma o erro do updater numa mensagem para gente (o texto cru do electron-updater traz headers e stack).
 * O caso mais comum: a Release acabou de ser criada e o CI ainda está gerando o instalador e o latest.yml.
 */
export function describeUpdateError(message: string): { message: string; detail: string } {
  if (/latest\.yml/i.test(message) && /\b404\b/.test(message)) {
    return {
      message: 'Uma versão nova acabou de ser publicada e ainda está sendo preparada.',
      detail: 'O instalador leva alguns minutos para ficar pronto depois que a versão sai. Tente de novo daqui a pouco; o Hydra também verifica sozinho a cada 4 horas.',
    };
  }
  if (/ERR_INTERNET_DISCONNECTED|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|ERR_NAME_NOT_RESOLVED|ERR_NETWORK|fetch failed/i.test(message)) {
    return { message: 'Sem conexão com o GitHub.', detail: 'Confira a internet e tente de novo. O Hydra também verifica sozinho a cada 4 horas.' };
  }
  if (/\b(403|429)\b/.test(message) && /rate limit/i.test(message)) {
    return { message: 'O GitHub limitou as consultas por agora.', detail: 'Tente de novo em alguns minutos.' };
  }
  const first = message.split('\n')[0].trim();
  return { message: 'Não foi possível procurar atualizações.', detail: first.length > 200 ? `${first.slice(0, 200)}…` : first };
}
