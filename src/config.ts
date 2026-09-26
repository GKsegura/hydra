// Hydra — © 2026 José Segura (GKsegura) · MIT

/**
 * Login com GitHub: o código está pronto (device flow, token no cofre do Windows, lista de repositórios,
 * publicar repositório, PRs privados), mas fica DESATIVADO até a integração ser liberada — a interface
 * mostra "em breve". Para testar localmente: variável de ambiente HYDRA_GITHUB_LOGIN=1.
 */
export const GITHUB_LOGIN_ENABLED = process.env.HYDRA_GITHUB_LOGIN === '1';

/**
 * Client ID do OAuth App do Hydra no GitHub (login por "device flow", sem client secret).
 * Como criar: GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
 * (Homepage: https://github.com/GKsegura/hydra · Callback: http://127.0.0.1) e marque "Enable Device Flow".
 * Cole o Client ID aqui ou defina a variável de ambiente HYDRA_GITHUB_CLIENT_ID.
 */
export const GITHUB_CLIENT_ID = process.env.HYDRA_GITHUB_CLIENT_ID ?? '';

/** repo: listar/criar repositórios privados e ler PRs · read:user: nome e avatar. */
export const GITHUB_SCOPES = 'repo read:user';
