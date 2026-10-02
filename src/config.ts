// Hydra — © 2026 José Segura (GKsegura) · MIT

/**
 * Login com GitHub: device flow, token no cofre do Windows, lista de repositórios, publicar repositório,
 * PRs privados. Ligado por padrão; HYDRA_GITHUB_LOGIN=0 desativa (quem compila o próprio Hydra com outro
 * OAuth App, ou quer rodar sem essa integração).
 */
export const GITHUB_LOGIN_ENABLED = process.env.HYDRA_GITHUB_LOGIN !== '0';

/**
 * Client ID do OAuth App do Hydra no GitHub (login por "device flow", sem client secret). É público: vai
 * no app, mas sozinho não dá acesso a nada — cada pessoa autoriza a própria conta.
 * Para usar o seu próprio OAuth App (GitHub → Settings → Developer settings → OAuth Apps → New OAuth App,
 * marcando "Enable Device Flow"), defina a variável de ambiente HYDRA_GITHUB_CLIENT_ID.
 */
export const GITHUB_CLIENT_ID = process.env.HYDRA_GITHUB_CLIENT_ID ?? 'Ov23lie4jT3Q1JRcblHW';

/** repo: listar/criar repositórios privados e ler PRs · read:user: nome e avatar. */
export const GITHUB_SCOPES = 'repo read:user';
