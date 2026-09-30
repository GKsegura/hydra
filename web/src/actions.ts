// Hydra — © 2026 José Segura (GKsegura) · MIT
// Ações git no estilo do GitHub Desktop: cada função chama a API, mostra progresso/erros e recarrega o repo.
import { api, ApiError, desktop, followJob } from './api.ts';
import {
  currentTab, hasWip, loadBranches, loadOperation, markTabStale, openWorkspace, refreshRepo, repoById, run, selectCommit, selectWip, state,
  statusOf, toast, type MenuItem,
} from './store.ts';
import type { Commit, Progress, Ref } from './types.ts';

// ------------------------------------------------------------------ diálogos e menus

export function openDialog(kind: string, props: Record<string, unknown> = {}) {
  state.menu = null;
  state.dialog = { kind, props };
}

export function closeDialog() {
  state.dialog = null;
}

export function openMenu(ev: MouseEvent, items: MenuItem[]) {
  ev.preventDefault();
  ev.stopPropagation();
  state.menu = { x: ev.clientX, y: ev.clientY, items };
}

/** Confirmação genérica (ações destrutivas). Resolve true se o usuário confirmar. */
export function confirm(opts: { title: string; message: string; confirm?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => openDialog('confirm', { ...opts, resolve }));
}

// ------------------------------------------------------------------ jobs (operações longas)

async function withJob<T>(id: string, label: string, start: () => Promise<{ jobId: string }>): Promise<T> {
  // O progresso vai para as operações da guia que iniciou o job, mesmo que o usuário troque de guia no meio.
  const jobs = state.jobs;
  const tab = currentTab();
  jobs[id] = { label, phase: 'Iniciando…', percent: null };
  try {
    const { jobId } = await start();
    return await followJob<T>(jobId, (p: Progress) => {
      jobs[id] = { label, phase: p.phase, percent: p.percent };
    });
  } finally {
    delete jobs[id];
    if (tab && currentTab() !== tab) markTabStale(tab); // terminou em segundo plano: a guia mudou e recarrega ao voltar
  }
}

// ------------------------------------------------------------------ sync

export async function fetchRepo(id: string) {
  try {
    await withJob(id, 'Fetch', () => api.fetch(id));
    toast(`Fetch concluído em ${repoById(id)?.name}`, 'ok');
  } catch (err) {
    toast((err as Error).message, 'error');
  }
  await refreshRepo(id);
}

export async function pullRepo(id: string) {
  try {
    const r = await withJob<{ conflicts: boolean }>(id, 'Pull', () => api.pull(id));
    await refreshRepo(id);
    if (r.conflicts) {
      toast('O pull trouxe conflitos. Resolva os arquivos marcados.', 'error');
      selectWip(id);
    } else toast(`Pull concluído em ${repoById(id)?.name}`, 'ok');
  } catch (err) {
    toast((err as Error).message, 'error');
    await refreshRepo(id);
  }
}

export async function pushRepo(id: string) {
  try {
    const r = await withJob<{ published: boolean }>(id, 'Push', () => api.push(id));
    toast(r.published ? 'Branch publicada no remoto' : `Push concluído em ${repoById(id)?.name}`, 'ok');
  } catch (err) {
    if (err instanceof ApiError && err.code === 'no_remote') return openDialog('publish', { repoId: id });
    toast((err as Error).message, 'error');
  }
  await refreshRepo(id);
}

/** O botão de sync do painel faz a ação certa, como no GitHub Desktop. */
export function syncAction(id: string): { label: string; hint: string; run: () => unknown } {
  const s = statusOf(id);
  if (!s) return { label: 'Fetch', hint: '', run: () => fetchRepo(id) };
  if (!s.remotes.length) return { label: 'Publicar', hint: 'Criar este repositório no GitHub', run: () => openDialog('publish', { repoId: id }) };
  if (s.detached) return { label: 'Fetch', hint: 'HEAD destacado', run: () => fetchRepo(id) };
  if (!s.upstream || s.upstreamGone) return { label: 'Publicar branch', hint: 'Enviar esta branch para o remoto', run: () => pushRepo(id) };
  if (s.behind > 0) return { label: `Pull ↓${s.behind}`, hint: `${s.behind} commit(s) no remoto`, run: () => pullRepo(id) };
  if (s.ahead > 0) return { label: `Push ↑${s.ahead}`, hint: `${s.ahead} commit(s) para enviar`, run: () => pushRepo(id) };
  return { label: 'Fetch', hint: 'Buscar novidades do remoto', run: () => fetchRepo(id) };
}

// ------------------------------------------------------------------ branches

export async function checkout(id: string, name: string) {
  if (hasWip(id)) return openDialog('checkout-changes', { repoId: id, name });
  await doCheckout(id, name, 'carry');
}

export async function doCheckout(id: string, name: string, mode: 'carry' | 'stash') {
  const r = await run(() => api.checkout(id, name, mode));
  if (!r) return refreshRepo(id);
  closeDialog();
  await refreshRepo(id);
  toast(`Agora em ${statusOf(id)?.branch ?? name}${r.stashed ? ' · alterações guardadas no stash' : ''}`, 'ok');
  if (r.restorable !== null && r.restorable !== undefined) {
    const ok = await confirm({
      title: 'Alterações guardadas',
      message: 'Você guardou alterações desta branch quando trocou para outra. Quer restaurá-las agora?',
      confirm: 'Restaurar',
    });
    if (ok) await applyStash(id, r.restorable, true);
  }
}

export async function createBranch(id: string, name: string, opts: { from?: string; checkout: boolean }) {
  const ok = await run(() => api.createBranch(id, name, opts));
  if (ok === undefined) return false;
  toast(`Branch ${name} criada${opts.checkout ? ' e ativa' : ''}`, 'ok');
  await refreshRepo(id);
  return true;
}

export async function renameBranch(id: string, from: string, to: string, remote: boolean) {
  const ok = await run(() => api.renameBranch(id, from, to, remote));
  if (ok === undefined) return false;
  toast(`Branch renomeada para ${to}`, 'ok');
  await refreshRepo(id);
  return true;
}

/** Exclui local e/ou no remoto. Se a branch não estiver mergeada, pede confirmação extra antes de forçar. */
export async function deleteBranch(id: string, name: string, opts: { local: boolean; remote?: string }) {
  try {
    await api.deleteBranch(id, name, opts);
  } catch (err) {
    if (err instanceof ApiError && err.code === 'not_merged') {
      const force = await confirm({
        title: 'Branch com commits não mergeados',
        message: `"${name}" tem commits que não estão em nenhuma outra branch. Excluir mesmo assim? Esses commits deixam de aparecer no histórico.`,
        confirm: 'Excluir mesmo assim',
        danger: true,
      });
      if (!force) return false;
      try {
        await api.deleteBranch(id, name, { ...opts, force: true });
      } catch (e2) {
        toast((e2 as Error).message, 'error');
        return false;
      }
    } else {
      toast((err as Error).message, 'error');
      return false;
    }
  }
  toast(`Branch ${name} excluída${opts.remote ? (opts.local ? ' (local e remota)' : ' do remoto') : ''}`, 'ok');
  await refreshRepo(id);
  return true;
}

export async function deleteRemoteBranch(id: string, ref: string) {
  const ok = await confirm({ title: 'Excluir branch remota', message: `Excluir "${ref}" do servidor? Quem já baixou continua com a cópia local.`, confirm: 'Excluir do remoto', danger: true });
  if (!ok) return;
  if ((await run(() => api.deleteRemoteBranch(id, ref))) === undefined) return;
  toast(`${ref} excluída do remoto`, 'ok');
  await refreshRepo(id);
}

export async function checkoutCommit(id: string, hash: string) {
  if (hasWip(id)) return toast('Faça commit, guarde ou descarte as alterações antes de ir para um commit.', 'error');
  if ((await run(() => api.checkoutCommit(id, hash))) === undefined) return;
  toast(`HEAD destacado em ${hash.slice(0, 7)}. Crie uma branch aqui se for trabalhar a partir dele.`);
  await refreshRepo(id);
}

// ------------------------------------------------------------------ merge e conflitos

export async function merge(id: string, branch: string, noFastForward: boolean) {
  const r = await run(() => api.merge(id, branch, noFastForward));
  if (!r) return false;
  closeDialog();
  await refreshRepo(id);
  if (r.status === 'conflicts') {
    toast(`Merge com ${r.conflicts} conflito(s). Resolva cada arquivo e conclua o merge.`, 'error');
    await loadOperation(id);
    selectWip(id);
    const first = state.operations[id]?.conflicts[0];
    if (first) await openConflict(id, first.path);
  } else if (r.status === 'up-to-date') toast('Nada para mergear: a branch atual já tem tudo.', 'ok');
  else toast(r.status === 'fast-forward' ? `Merge de ${branch} (fast-forward)` : `Merge de ${branch} concluído`, 'ok');
  return true;
}

export async function openConflict(id: string, path: string) {
  try {
    state.diff = null;
    state.conflict = { repoId: id, file: await api.conflictFile(id, path) };
  } catch (err) {
    toast((err as Error).message, 'error');
  }
}

export function closeConflict() {
  state.conflict = null;
}

async function afterResolve(id: string) {
  await refreshRepo(id);
  await loadOperation(id);
  const next = state.operations[id]?.conflicts[0];
  if (next) await openConflict(id, next.path);
  else {
    closeConflict();
    toast('Todos os conflitos resolvidos. Conclua a operação.', 'ok');
  }
}

export async function resolveContent(id: string, path: string, content: string) {
  if ((await run(() => api.resolveContent(id, path, content))) === undefined) return;
  toast(`${path} resolvido`, 'ok');
  await afterResolve(id);
}

export async function resolveSide(id: string, path: string, side: 'ours' | 'theirs' | 'delete') {
  if ((await run(() => api.resolveSide(id, path, side))) === undefined) return;
  toast(`${path} resolvido`, 'ok');
  await afterResolve(id);
}

export async function abortOperation(id: string) {
  const op = state.operations[id]?.operation ?? statusOf(id)?.operation ?? 'merge';
  const ok = await confirm({ title: `Abortar ${op}`, message: 'Tudo volta a como estava antes da operação. As resoluções feitas até agora são perdidas.', confirm: 'Abortar', danger: true });
  if (!ok) return;
  if ((await run(() => api.abortOperation(id))) === undefined) return;
  closeConflict();
  toast('Operação abortada', 'ok');
  await refreshRepo(id);
}

export async function continueOperation(id: string, message: string) {
  const r = await run(() => api.continueOperation(id, message));
  if (!r) return;
  closeConflict();
  toast('Operação concluída', 'ok');
  await refreshRepo(id);
  selectCommit(id, r.hash, true);
}

// ------------------------------------------------------------------ commits

export async function undoLastCommit(id: string) {
  const ok = await confirm({ title: 'Desfazer último commit', message: 'O commit sai do histórico e as alterações dele voltam para a área de stage, com a mensagem preenchida.', confirm: 'Desfazer' });
  if (!ok) return;
  const r = await run(() => api.undo(id));
  if (!r) return;
  state.drafts[id] = { summary: r.message.summary, body: r.message.body };
  toast('Commit desfeito — as alterações voltaram para o stage', 'ok');
  await refreshRepo(id);
  selectWip(id);
}

export async function revert(id: string, commit: Commit) {
  const ok = await confirm({ title: 'Reverter commit', message: `Cria um commit novo que desfaz "${commit.subject}". O histórico não é reescrito.`, confirm: 'Reverter' });
  if (!ok) return;
  const r = await run(() => api.revert(id, commit.hash));
  if (!r) return;
  await refreshRepo(id);
  if (r.conflicts) {
    toast('O revert tem conflitos. Resolva e conclua.', 'error');
    selectWip(id);
  } else toast('Commit revertido', 'ok');
}

export async function cherryPick(id: string, commit: Commit) {
  const r = await run(() => api.cherryPick(id, commit.hash));
  if (!r) return;
  await refreshRepo(id);
  if (r.conflicts) {
    toast('O cherry-pick tem conflitos. Resolva e conclua.', 'error');
    selectWip(id);
  } else toast(`"${commit.subject}" aplicado na branch atual`, 'ok');
}

export async function discard(id: string, files: string[] | 'all') {
  const n = files === 'all' ? statusOf(id)?.files.filter((f) => f.index !== 'U').length ?? 0 : files.length;
  const ok = await confirm({
    title: 'Descartar alterações',
    message: desktop
      ? `Descartar ${n} arquivo(s)? As versões atuais vão para a Lixeira do Windows.`
      : `Descartar ${n} arquivo(s)? Essa ação não pode ser desfeita.`,
    confirm: 'Descartar',
    danger: true,
  });
  if (!ok) return;
  if ((await run(() => api.discard(id, files))) === undefined) return;
  toast('Alterações descartadas', 'ok');
  await refreshRepo(id);
}

// ------------------------------------------------------------------ stash e tags

export async function stashChanges(id: string, message = '') {
  if ((await run(() => api.stash(id, message))) === undefined) return;
  toast('Alterações guardadas no stash', 'ok');
  await refreshRepo(id);
  await loadBranches(id);
}

export async function applyStash(id: string, index: number, pop: boolean) {
  const r = await run(() => api.stashApply(id, index, pop));
  if (!r) return;
  toast(r.conflicts ? 'Stash aplicado com conflitos — resolva os arquivos marcados.' : pop ? 'Stash restaurado' : 'Stash aplicado', r.conflicts ? 'error' : 'ok');
  await refreshRepo(id);
  await loadBranches(id);
  selectWip(id);
}

export async function dropStash(id: string, index: number) {
  const ok = await confirm({ title: 'Descartar stash', message: 'As alterações guardadas nesse stash serão perdidas.', confirm: 'Descartar', danger: true });
  if (!ok) return;
  if ((await run(() => api.stashDrop(id, index))) === undefined) return;
  await loadBranches(id);
  await refreshRepo(id);
}

export async function createTag(id: string, name: string, at: string | undefined, message: string, pushAfter: boolean) {
  if ((await run(() => api.createTag(id, name, at, message))) === undefined) return false;
  if (pushAfter && (await run(() => api.pushTag(id, name))) === undefined) return false;
  toast(`Tag ${name} criada${pushAfter ? ' e enviada' : ''}`, 'ok');
  await refreshRepo(id);
  return true;
}

export async function pushTag(id: string, name: string) {
  if ((await run(() => api.pushTag(id, name))) === undefined) return;
  toast(`Tag ${name} enviada ao remoto`, 'ok');
}

export async function deleteTag(id: string, name: string, remote: boolean) {
  const ok = await confirm({ title: 'Excluir tag', message: `Excluir a tag "${name}"${remote ? ' localmente e no remoto' : ' localmente'}?`, confirm: 'Excluir', danger: true });
  if (!ok) return;
  if ((await run(() => api.deleteTag(id, name, true, remote))) === undefined) return;
  toast(`Tag ${name} excluída`, 'ok');
  await refreshRepo(id);
}

// ------------------------------------------------------------------ fora do Hydra

export async function openIn(id: string, target: 'editor' | 'explorer' | 'terminal') {
  await run(() => api.openIn(id, target));
}

export async function openPullRequest(id: string, branch?: string) {
  const r = await run(() => api.compareUrl(id, branch));
  if (r) window.open(r.url, '_blank');
}

export async function openOnGitHub(id: string) {
  const info = state.branchInfo[id] ?? (await api.branches(id).catch(() => null));
  const gh = info?.remotes.find((r) => r.github)?.github;
  if (!gh) return toast('Este repositório não está no GitHub.', 'error');
  window.open(`https://github.com/${gh}`, '_blank');
}

// ------------------------------------------------------------------ clonar / criar / publicar

export async function cloneRepo(url: string, parent: string, name: string | undefined, onProgress: (p: Progress) => void) {
  const { jobId } = await api.clone(url, parent, name);
  const r = await followJob<{ path: string }>(jobId, onProgress);
  closeDialog();
  toast('Repositório clonado', 'ok');
  await openWorkspace(r.path);
}

export async function createRepo(
  opts: { parent: string; name: string; gitignore: string; readme: boolean; description?: string; publish?: { private: boolean } | null },
  onProgress: (p: Progress) => void,
) {
  const { jobId } = await api.init(opts);
  const r = await followJob<{ path: string; committed: boolean; url: string | null }>(jobId, onProgress);
  closeDialog();
  toast(r.url ? 'Repositório criado e publicado no GitHub' : r.committed ? 'Repositório criado' : 'Repositório criado (sem commit inicial: configure user.name/user.email no git)', 'ok');
  await openWorkspace(r.path);
}

export async function publishRepo(id: string, opts: { name: string; private: boolean; description?: string }, onProgress: (p: Progress) => void) {
  const { jobId } = await api.publish(id, opts);
  const r = await followJob<{ url: string }>(jobId, onProgress);
  closeDialog();
  toast('Repositório publicado no GitHub', 'ok');
  await refreshRepo(id);
  return r.url;
}

// ------------------------------------------------------------------ GitHub

export async function loadGitHub() {
  try {
    state.github = await api.github();
  } catch {
    state.github = null;
  }
}

let loginPoll: ReturnType<typeof setInterval> | undefined;
export async function githubLogin() {
  const info = await run(() => api.githubLogin());
  if (!info) return;
  state.github = info;
  openDialog('github');
  clearInterval(loginPoll);
  loginPoll = setInterval(async () => {
    await loadGitHub();
    const s = state.github?.login.state;
    if (s !== 'pending') {
      clearInterval(loginPoll);
      if (state.github?.user) {
        toast(`Conectado como ${state.github.user.login}`, 'ok');
        for (const id of state.visible) state.pulls[id] = await api.pulls(id).catch(() => ({ repo: null, pulls: [] }));
      }
    }
  }, 2000);
}

export async function githubCancel() {
  clearInterval(loginPoll);
  state.github = (await run(() => api.githubCancel())) ?? state.github;
}

export async function githubLogout() {
  const ok = await confirm({ title: 'Sair do GitHub', message: 'O token guardado neste computador é apagado. Seus repositórios não são afetados.', confirm: 'Sair' });
  if (!ok) return;
  state.github = (await run(() => api.githubLogout())) ?? state.github;
  toast('Você saiu do GitHub');
}

export async function loadPulls(id: string) {
  try {
    state.pulls[id] = await api.pulls(id);
  } catch {
    /* sem rede/sem GitHub: só não mostra PRs */
  }
}

// ------------------------------------------------------------------ menus de contexto

/** Itens de menu para uma branch (sidebar, badge no grafo ou lista do seletor de branch). */
export function branchMenu(id: string, name: string, kind: 'local' | 'remote'): MenuItem[] {
  const st = statusOf(id);
  const isCurrent = kind === 'local' && st?.branch === name;
  const remote = st?.remotes[0];
  const items: MenuItem[] = [];
  if (!isCurrent) items.push({ label: kind === 'remote' ? 'Checkout (criar branch local)' : 'Checkout', run: () => checkout(id, name) });
  if (!isCurrent && st?.branch) items.push({ label: `Merge em ${st.branch}…`, run: () => openDialog('merge', { repoId: id, branch: name }) });
  items.push({ label: 'Nova branch a partir daqui…', run: () => openDialog('create-branch', { repoId: id, from: name }) });
  if (kind === 'local') {
    items.push({ separator: true, label: '' });
    if (isCurrent) items.push({ label: st?.upstream ? 'Push' : 'Publicar branch', run: () => pushRepo(id), disabled: !remote });
    items.push({ label: 'Criar Pull Request', run: () => openPullRequest(id, name), disabled: !remote });
    items.push({ label: 'Renomear…', run: () => openDialog('rename-branch', { repoId: id, name }) });
    items.push({ label: 'Excluir…', danger: true, run: () => openDialog('delete-branch', { repoId: id, name }), disabled: isCurrent, hint: isCurrent ? 'é a branch atual' : undefined });
  } else {
    items.push({ separator: true, label: '' });
    items.push({ label: 'Excluir do remoto…', danger: true, run: () => deleteRemoteBranch(id, name) });
  }
  return items;
}

export function tagMenu(id: string, name: string): MenuItem[] {
  const hasRemote = !!statusOf(id)?.remotes.length;
  return [
    { label: 'Enviar tag para o remoto', run: () => pushTag(id, name), disabled: !hasRemote },
    { label: 'Excluir tag (local)', danger: true, run: () => deleteTag(id, name, false) },
    { label: 'Excluir tag (local e remoto)', danger: true, run: () => deleteTag(id, name, true), disabled: !hasRemote },
  ];
}

/** Menu do commit no grafo: ações do commit + das branches/tags que apontam para ele. */
export function commitMenu(id: string, commit: Commit): MenuItem[] {
  const st = statusOf(id);
  const isHead = st?.lastCommit?.hash === commit.hash;
  const items: MenuItem[] = [
    { label: 'Nova branch a partir deste commit…', run: () => openDialog('create-branch', { repoId: id, from: commit.hash, fromLabel: commit.hash.slice(0, 7) }) },
    { label: 'Criar tag aqui…', run: () => openDialog('create-tag', { repoId: id, at: commit.hash }) },
    { separator: true, label: '' },
    { label: 'Reverter este commit…', run: () => revert(id, commit) },
    { label: 'Cherry-pick na branch atual', run: () => cherryPick(id, commit), disabled: isHead },
    { label: 'Simular cherry-pick em um cenário…', run: () => openDialog('scenario', { commit: commit.hash, repoId: id }) },
    { label: 'Checkout deste commit (HEAD destacado)', run: () => checkoutCommit(id, commit.hash), disabled: isHead },
  ];
  if (isHead && !st?.detached) items.push({ label: 'Desfazer este commit…', run: () => undoLastCommit(id), hint: 'só se ainda não foi enviado' });
  items.push({ separator: true, label: '' }, { label: 'Copiar hash', run: () => navigator.clipboard?.writeText(commit.hash).then(() => toast('Hash copiado')) });

  const refs = commit.refs.filter((r: Ref) => r.type !== 'head');
  for (const r of refs) {
    items.push({ separator: true, label: '' });
    if (r.type === 'tag') items.push(...tagMenu(id, r.name).map((i) => ({ ...i, label: `${r.name}: ${i.label}` })));
    else items.push(...branchMenu(id, r.name, r.type === 'remote' ? 'remote' : 'local').map((i) => ({ ...i, label: i.separator ? '' : `${r.name}: ${i.label}` })));
  }
  return items;
}
