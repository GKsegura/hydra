# Hydra

Abre o workspace atual (ou o repositório do arquivo em foco) no [Hydra](https://github.com/GKsegura/hydra), o cliente git visual para workspaces com vários repositórios lado a lado.

## Comandos

| Comando | O que faz |
|---|---|
| **Hydra: Abrir workspace no Hydra** | Abre o `.code-workspace` atual (ou a primeira pasta aberta) no Hydra. |
| **Hydra: Abrir este repositório no Hydra** | Sobe a partir do arquivo em foco (ou do item clicado no Explorer) até achar a pasta com `.git` e abre só ele. |

Também aparecem no menu de contexto do Explorer (clique direito numa pasta ou arquivo).

Com o Hydra já aberto, o caminho entra como **guia nova** — as outras guias continuam abertas.

## Requisitos

Precisa do Hydra instalado (o [instalador](https://github.com/GKsegura/hydra/releases/latest), ou o comando `hydra` do CLI no PATH). Sem nenhum dos dois, a extensão oferece o link de download.

## Configurações

- `hydra.executablePath`: aponta direto para um `Hydra.exe` (ou outro comando), se a extensão não achar o Hydra sozinha.
- `hydra.openOnStartup`: abre o Hydra automaticamente ao abrir um `.code-workspace` no VS Code (desligado por padrão).

## Instalação

Esta extensão ainda não está no Marketplace. Baixe o `.vsix` da [última versão do Hydra](https://github.com/GKsegura/hydra/releases/latest) e instale por **Extensions → ⋯ → Install from VSIX…**.

---

Distribuído sob a licença MIT. Crafted by [GKsegura](https://github.com/GKsegura).
