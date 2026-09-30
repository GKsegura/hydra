# 🐉 Hydra

![versão](https://img.shields.io/github/v/release/GKsegura/hydra?label=vers%C3%A3o&color=34d6a6)
![licença](https://img.shields.io/badge/licen%C3%A7a-MIT-34d6a6)
![CI](https://github.com/GKsegura/hydra/actions/workflows/ci.yml/badge.svg)

> **Um cliente git visual para workspaces.** Todos os repositórios do seu projeto lado a lado, no visual do GitKraken, com as funções do GitHub Desktop: commit, branches, fetch/pull/push, merge com **resolvedor visual de conflitos**, stash, tags, clonar, criar e publicar no GitHub.

Funciona com **workspaces** (vários repositórios, como o `.code-workspace` do VS Code) e com **projetos normais** (um repositório só). Dá pra usar de dois jeitos, com a mesma interface:

- **App desktop**: o instalador `Hydra-Setup-<versão>.exe`, que **se atualiza sozinho**, ou o `Hydra-<versão>-portable.exe`, que roda sem instalar.
- **CLI**: `hydra <caminho>` no terminal abre a interface no navegador.

**Primeira vez?** Veja a [Instalação](#instalação) e depois siga o [Tutorial](#tutorial).

---

## A dor

Projetos de verdade raramente cabem num repositório só. O **CRONOS**, por exemplo, é um workspace do VS Code com quatro repos:

| Repo | Papel |
|---|---|
| `CRONOS-API` | back-end |
| `CRONOS-APP` | front-end |
| `CRONOS-BOT` | robô/automação |
| `CRONOS-INFRA` | infraestrutura e monitoramento |

No VS Code eles abrem juntos, como **um** projeto. Na hora de mexer no git, cada repo vira uma ilha:

- O **GitKraken** e o **GitHub Desktop** trabalham com **um repositório por vez**. Para saber "o que aconteceu no CRONOS essa semana" é preciso trocar de repo quatro vezes.
- Uma feature que atravessa o workspace, como a `feature/docker-instalacao` que existe **nos quatro repos**, precisa ser acompanhada repo a repo.
- A pergunta "tem alguma coisa sem commitar ou sem push?" exige um `git status` em cada pasta.
- O `git log --graph` no terminal resolve pra um repo, mas é feio e não mostra os outros ao mesmo tempo.
- Resolver conflito de merge no terminal é propenso a erro, e as ferramentas visuais boas são pesadas, pagas para repositórios privados ou exigem conta.

## Por que o Hydra existe

A ideia é simples: **se o workspace é a unidade do projeto, o histórico também deveria ser.**

O nome vem da Hidra, o monstro de várias cabeças: cada cabeça é um repositório, e todas pertencem ao mesmo corpo. É também um aceno ao *Kraken* do GitKraken.

O Hydra foi pensado para:

1. **Abrir o workspace inteiro de uma vez**, lendo o mesmo `.code-workspace` que o VS Code usa. Ou abrir **um repositório só**, como qualquer cliente git.
2. **Mostrar os grafos lado a lado**, no visual que a gente já conhece do GitKraken: lanes coloridas, curvas de merge e badges de branch/tag.
3. **Deixar você escolher e dimensionar**: quais repos aparecem e quanto espaço cada um ocupa.
4. **Responder de relance** "está tudo limpo e sincronizado?", com um card de status por repo.
5. **Fazer o dia a dia do git sem sair da tela**: commit, branches, sync, merge e conflitos, no estilo do GitHub Desktop, mas em vários repos ao mesmo tempo.
6. **Ser fácil de rodar**: um instalador que se atualiza sozinho (ou um `.exe` portátil), ou um `npm install` para quem prefere o terminal. Sem banco, sem Docker, 100% local. A conta do GitHub é opcional.

---

## Funcionalidades

### Visualização
- **Um painel de grafo por repositório, lado a lado**, com as colunas `BRANCH / TAG`, `GRAPH`, `MENSAGEM`, `AUTOR` e `DATA`.
- **Grafo estilo GitKraken**: lanes coloridas, curvas bézier nos merges, anel no commit do `HEAD`.
- **Badges de refs**: branch local (🖥), remota (☁), as duas juntas quando apontam pro mesmo commit (ex.: `main` + `origin/main`), tags e `HEAD` destacado.
- **Linha `// WIP`** no topo quando há alterações não commitadas, ligada ao `HEAD` por uma linha tracejada.
- **Barras de rolagem em cada painel**: vertical para os commits e horizontal **dentro do próprio painel** quando as colunas não cabem. O cabeçalho rola junto na horizontal e fica fixo na vertical.

### Organização do espaço
- **Escolha quais repos aparecem** pelos checkboxes na barra lateral, pelo ✕ no painel ou clicando no card.
- **Redimensione arrastando as divisórias**. Duplo clique ou **Igualar** divide o espaço igualmente.
- **O layout é lembrado** (repos visíveis, larguras, repo em foco e a timeline ligada ou não) separadamente para cada workspace.

### Timeline unificada (opcional)
- Marque **"Timeline unificada"** na barra lateral e um painel extra aparece ao lado dos grafos, com **os commits de todos os repositórios visíveis numa lista só, por data**.
- Cada repo tem uma faixa na sua cor, e a bolinha do commit fica na faixa dele. Dá pra ver de relance "o que aconteceu no workspace essa semana", sem juntar quatro grafos de cabeça.
- O filtro (`Ctrl+F`) vale nela também. Clicar num commit abre o detalhe e rola o painel do repo até ele, e o clique direito tem o mesmo menu dos commits.
- É um painel como os outros: redimensiona pela divisória, entra no **Igualar** e sai pelo **✕** (ou desmarcando a opção).
- **Só a timeline**: com ela ligada, marque **"Só a timeline"** para esconder os grafos e deixar a timeline ocupando a área toda. Os repositórios marcados na barra lateral continuam definindo quais commits entram.

### Repositórios e workspaces
- **Tela inicial** com **Clonar**, **Novo repositório**, **Abrir repositório**, **Abrir workspace** e os **recentes**.
- **Clonar** por URL, com barra de progresso. (Escolher entre **os seus repositórios do GitHub** chega com o login, *em breve*.)
- **Criar repositório**: pasta, branch `main`, `.gitignore` pronto (Node, Vue/Vite, Java, Python), README e commit inicial.
- **Publicar** um repositório sem remoto: você cria o repositório vazio no GitHub, cola a URL e o Hydra conecta o `origin` e envia. (Publicar com um clique, sem sair do Hydra, chega com o login, *em breve*.)
- **Trocar de workspace sem reiniciar**, pelo menu `workspace <nome> ▾` ou com **Ctrl+O**.
- **No app desktop**: seletor nativo do Windows e **arrastar e soltar** o arquivo ou a pasta na janela.

### Branches e sincronização (como no GitHub Desktop)
- **Seletor de branch** em cada painel: buscar, **trocar**, **criar**, **renomear** e **excluir**, incluindo branches que só existem no remoto.
- **Excluir branch local e/ou na nuvem** (`origin`), com aviso se ela tiver commits que não estão em nenhuma outra branch.
- **Trocar de branch com alterações pendentes**: você escolhe entre **levar as alterações** ou **deixá-las guardadas** (stash). Ao voltar para a branch, o Hydra oferece restaurar.
- **Botão de sync inteligente** por repo: `Fetch`, `Pull ↓2`, `Push ↑1`, `Publicar branch` ou `Publicar` (repo sem remoto), com progresso em tempo real.
- **Pull Requests**: lista dos PRs abertos do repo e **Criar Pull Request** da branch atual, que abre no GitHub.
- **Branch no workspace**: **criar, trocar e mergear a mesma branch em vários repositórios** de uma vez (ex.: a `feature/docker-instalacao` nos quatro repos do CRONOS). O Hydra mostra antes, repo por repo, o que vai acontecer: onde a branch já existe, onde só está no remoto, quem tem alterações pendentes e quem vai dar conflito no merge. Na barra lateral, um marcador **×3** indica as branches que existem em vários repos.

### Merge e conflitos
- **Merge de qualquer branch na atual**, com **prévia antes de começar**: quantos commits entram, se é fast-forward e **quais arquivos vão dar conflito**.
- **Resolvedor visual de conflitos**: cada bloco mostra **Atual** e **Entrando** lado a lado (e a base, se quiser). Os botões **Aceitar atual / Aceitar entrando / Ambos** montam o resultado, que também dá pra **editar à mão**. Tem navegação entre conflitos e entre arquivos.
- Arquivos binários ou apagados de um lado: escolha do arquivo inteiro.
- **Concluir** ou **abortar** merge, revert e cherry-pick, com a mensagem do commit editável.

### Commits
- **Stage/unstage** por arquivo ou tudo, com **diff** de qualquer arquivo.
- **Stage parcial**: no diff, escolha **trechos** ("Stage deste trecho") ou **linhas soltas** (clique, `Shift` para um intervalo) e só elas entram no stage. No diff do stage, o mesmo vale para tirar linhas. Assim duas mudanças sem relação no mesmo arquivo viram commits separados.
- **Commit** com resumo (contador de 72 caracteres) + descrição, e rascunho guardado por repo.
- **Commit no workspace**: a **mesma mensagem em vários repositórios** de uma vez (ex.: a mesma feature nos quatro repos do CRONOS), com push opcional em todos no final e um relatório por repo.
- **Emendar o último commit** (amend) e **desfazer o último commit** (as alterações voltam para o stage). O desfazer só vale se o commit ainda não foi enviado.
- **Descartar alterações** por arquivo ou tudo. No app desktop, os arquivos vão para a **Lixeira**.
- No menu do commit (clique direito): **reverter**, **cherry-pick**, **criar branch aqui**, **criar tag aqui**, checkout do commit e copiar hash.
- **Stash**: guardar alterações com descrição, restaurar, aplicar ou descartar pela barra lateral.
- **Tags**: criar (leve ou anotada), enviar ao remoto e excluir (local e remota).

### Conta do GitHub · *em breve*
- O **login com GitHub** já está implementado (fluxo oficial de código de dispositivo, token **criptografado pelo Windows**), mas fica **desativado até ser liberado**. Na interface, o botão *GitHub* e os pontos que dependem dele mostram **"em breve"**.
- Quando liberado, vai servir para listar seus repositórios ao clonar, publicar repositórios com um clique e ver PRs de repositórios privados.
- **Sem login, tudo continua funcionando**: push, pull, fetch e clone usam o Git Credential Manager que já vem no Git for Windows. A lista de **Pull Requests** de repositórios públicos também funciona sem login.

### Terminal integrado
- **Um terminal embaixo dos grafos** (`Ctrl+\``), com **uma aba por repositório**, cada uma já aberta na pasta do repo.
- Usa o **Git Bash** que vem com o Git for Windows: prompt com a branch, cores, `vim`, `less` e tudo que você já usa. Sem Git Bash, abre o PowerShell.
- **O grafo acompanha**: depois de um `git commit`, `git pull` ou `git rebase` no terminal, o painel do repo se atualiza sozinho (pelo [tempo real](#status-filtro-e-integrações)).
- Abas coloridas com a cor do repo, painel redimensionável, `Ctrl+C` copia quando há texto selecionado e `Ctrl+V` cola. Um `F5` ou `Ctrl+R` reconecta aos mesmos shells sem perder a saída recente.
- **Dividido em dois**: veja dois terminais ao mesmo tempo, lado a lado (`Ctrl+\`) ou empilhados (`Ctrl+Shift+\`), cada um no seu repositório (por exemplo, a API e o APP). `Ctrl+Alt+→` (ou `←`, `↑`, `↓`) passa o foco para o outro painel.

### Status, filtro e integrações
- **Card por repo**: branch, ahead/behind, staged/modificados/novos/conflitos, última tag e idade do último commit.
- **Filtro** por mensagem, autor, hash ou branch/tag, em todos os painéis ao mesmo tempo.
- **Abrir no VS Code, no Explorer ou num terminal externo**, e **Ver no GitHub**, pelo menu `⋯` do painel.
- **Tempo real**: o Hydra observa os repositórios abertos e se atualiza sozinho em cerca de 1 segundo, seja qual for a origem da mudança (um commit no VS Code, um `git pull` no terminal, um arquivo salvo ou uma troca de branch), sem precisar de F5 nem de voltar o foco para a janela.

### Atalhos

| Atalho | Ação |
|---|---|
| `Ctrl+O` | abrir workspace ou repositório |
| `Ctrl+Shift+O` | clonar repositório |
| `Ctrl+N` | novo repositório (app desktop) |
| `Ctrl+Shift+N` | nova branch no repo em foco |
| `Ctrl+Shift+L` | pull no repo em foco |
| `Ctrl+Shift+P` | push no repo em foco |
| `Ctrl+F` | filtrar commits |
| `↑` / `↓` | navegar pelos commits do repo em foco |
| `Ctrl+Enter` | commitar (no formulário de commit) |
| `Ctrl+Shift+Enter` | commit no workspace (a mesma mensagem em vários repos) |
| `` Ctrl+` `` | mostrar/esconder o terminal integrado (abre um no repo em foco se não houver) |
| `Ctrl+\` | terminal: dividir lado a lado com um terminal novo no repo em foco (de novo, desfaz a divisão) |
| `Ctrl+Shift+\` | terminal: dividir empilhado (de novo, desfaz) |
| `Ctrl+Alt+` `←` `→` `↑` `↓` | terminal dividido: passar o foco para o outro painel |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | próxima / anterior guia de workspace (app desktop) |
| `Ctrl+W` | fechar a guia atual (app desktop; dentro do terminal o `Ctrl+W` continua sendo do shell) |
| `Esc` | fechar diff, resolvedor, menu ou diálogo; limpar o filtro |
| `F5` | atualizar os dados (normalmente desnecessário: o Hydra se atualiza em tempo real) |
| `Ctrl+R` | recarregar a página inteira (depois de atualizar o Hydra) |
| Clique direito | menu de ações em commits, branches, tags, arquivos e stashes |

---

## Stack

As mesmas tecnologias do dia a dia (Vue 3 + TypeScript no front, Node.js + Express no back), mantendo o projeto leve de rodar.

| Camada | Tecnologia | Por quê |
|---|---|---|
| CLI + servidor | **Node.js 22.18+ / TypeScript** | O Node roda `.ts` direto (type stripping), então o CLI não tem etapa de build |
| API | **Express 5** | Rotas simples, erros assíncronos tratados nativamente; operações longas com **Server-Sent Events** |
| Front | **Vue 3 + TypeScript** (`<script setup>`, `reactive`) | Componentes pequenos e uma store reativa sem dependência extra |
| Build do front | **Vite** | Build rápido; gera um único `app.js` + `app.css` |
| App desktop | **Electron** + **electron-builder** | Reaproveita o mesmo servidor e a mesma interface; gera o instalador (NSIS) e o `.exe` portátil |
| Atualizações | **electron-updater** | Baixa a versão nova das Releases do GitHub, confere o sha512 e instala ao reiniciar |
| Build do desktop | **esbuild** | Empacota o processo principal do Electron (e o back-end) |
| Testes | **Vitest** | Testes do git contra repositórios temporários (inclusive um "remoto" local) |
| Release | **semantic-release** + **GitHub Actions** | Versão, tag, CHANGELOG e Release automáticos a partir dos commits, com o instalador e o portátil anexados |
| Git | **git CLI** via `child_process` | Usa o git que já está instalado; sem libs nativas |
| Terminal | **xterm.js** + **node-pty** + **ws** | O mesmo terminal do VS Code; o shell roda num pseudo-console (ConPTY) e conversa com a interface por WebSocket local. O node-pty é dependência opcional: se não instalar, só o terminal fica indisponível |

**Ficaram de fora de propósito:** Spring Boot/Java (exigiria JDK só pra falar com o git), banco de dados (o próprio git é a fonte da verdade), Docker (o Hydra precisa enxergar as pastas e o git da sua máquina) e Tauri (exigiria Rust mais um processo Node à parte).

---

## Requisitos

| Para usar… | Precisa de |
|---|---|
| **App desktop (.exe)** | Windows 10/11 64-bit e **Git** no PATH. O Node já vem dentro do app |
| **CLI** | **Node.js 22.18+** e **Git** no PATH |
| **Gerar o .exe** | Node.js 22.18+ e internet na primeira vez (o electron-builder baixa o Electron e as ferramentas) |

Para conferir: `git --version` e `node --version`.

## Instalação

### App desktop: instalador (recomendado)

Baixe o **`Hydra-Setup-<versão>.exe`** da última versão em **[Releases](https://github.com/GKsegura/hydra/releases/latest)** e dê dois cliques. Ele instala na hora, sem assistente e **sem pedir administrador**. O app vai para `%LOCALAPPDATA%\Programs\hydra-git`, com atalhos no Menu Iniciar e na Área de Trabalho.

Depois disso, o Hydra **se atualiza sozinho** (veja [Atualizações](#atualizações)). Para desinstalar, use *Configurações → Aplicativos → Hydra*. Seus recentes e configurações são preservados.

### App desktop: portátil

Prefere não instalar? Baixe o **`Hydra-<versão>-portable.exe`** (~100 MB). É um arquivo só:

- copie para onde quiser (Área de Trabalho, `C:\Ferramentas`, pendrive…) e dê dois cliques;
- para ter no Menu Iniciar ou na barra de tarefas, crie um atalho para o `.exe` (botão direito → *Criar atalho*, ou *Fixar na barra de tarefas* com o app aberto).

O portátil **não se atualiza sozinho**: quando sai uma versão nova, ele avisa no topo da janela e abre a página de download.

> ⚠️ **Aviso do Windows (SmartScreen).** O instalador e o `.exe` não são assinados digitalmente, então na primeira vez o Windows pode mostrar *"O Windows protegeu o computador"*. Clique em **Mais informações → Executar assim mesmo**. As atualizações automáticas do instalador não passam por esse aviso de novo.

### Atualizações

**No instalador**, a atualização é automática:

1. Ao abrir, e depois a cada 4 horas, o Hydra verifica se há versão nova nas Releases do GitHub.
2. Se houver, ele baixa em segundo plano. No topo da janela aparece *"Baixando Hydra 1.3.0… 45%"*.
3. Terminado o download, aparece **"Hydra 1.3.0 pronto · Reiniciar agora · Depois"**:
   - **Reiniciar agora** fecha o Hydra, instala e abre de novo já na versão nova (leva alguns segundos);
   - **Depois** esconde o aviso, e a atualização é instalada na próxima vez que você fechar o Hydra.

Para verificar na hora: menu **Ajuda → Procurar atualizações…**. **Ajuda → Notas da versão** abre o que mudou na versão atual.

**No portátil**, aparece **"Hydra 1.3.0 disponível · Baixar"**, que abre a página da Release.

> Está na **1.0 ou 1.1 portátil**? Essas versões ainda não sabiam se atualizar. Baixe o instalador **uma vez**; dali em diante, é automático.

### A partir do código-fonte (CLI ou gerar o .exe)

```bash
git clone https://github.com/GKsegura/hydra.git
cd hydra
npm install
```

O `npm install` também já compila a interface (script `prepare`).

Para gerar o `.exe` localmente (sai em `release\`) ou testar o app sem empacotar:

```bash
npm run desktop:build   # gera release\Hydra-Setup-<versão>.exe e release\Hydra-<versão>-portable.exe
npm run desktop         # abre o app direto, sem gerar o .exe
```

### CLI

Com o código clonado e instalado (seção acima):

```bash
npm link
```

O `npm link` deixa o comando `hydra` disponível em qualquer terminal (`hydra --version` para conferir).

> Se não quiser o comando global, rode `npm start -- <caminho>` dentro da pasta do hydra.

### Configurar o login com GitHub (para quando for liberado)

> 🚧 **Em breve.** O login está implementado mas **desativado** por uma flag em [`src/config.ts`](src/config.ts) (`GITHUB_LOGIN_ENABLED`). Para testar localmente, rode com a variável de ambiente `HYDRA_GITHUB_LOGIN=1` depois de configurar o Client ID abaixo.

O "Entrar com GitHub" usa um **OAuth App** seu (o GitHub exige um para o login por código de dispositivo). É gratuito e leva 2 minutos:

1. No GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Preencha:
   - **Application name**: `Hydra`
   - **Homepage URL**: `https://github.com/GKsegura/hydra`
   - **Authorization callback URL**: `http://127.0.0.1` (não é usada no device flow, mas o campo é obrigatório)
3. Crie o app e, na página dele, marque **Enable Device Flow** e salve.
4. Copie o **Client ID** (não precisa de client secret) e cole em [`src/config.ts`](src/config.ts):

   ```ts
   export const GITHUB_CLIENT_ID = process.env.HYDRA_GITHUB_CLIENT_ID ?? 'Ov23li…seu-client-id…';
   ```

   Ou defina a variável de ambiente `HYDRA_GITHUB_CLIENT_ID`.
5. Gere o `.exe` de novo (`npm run desktop:build`).

O Client ID é público (vai no app), mas ele sozinho não dá acesso a nada: cada pessoa autoriza a própria conta.

**No CLI** o Hydra não guarda login: ele usa a variável `GITHUB_TOKEN` (ou `GH_TOKEN`) ou o login do [GitHub CLI](https://cli.github.com) (`gh auth login`), se existir.

## Como usar

### App desktop

Abra o Hydra pelo Menu Iniciar (instalador) ou pelo `Hydra-<versão>-portable.exe`. Na primeira vez aparece a **tela inicial**, com os cartões **Clonar repositório**, **Novo repositório**, **Abrir repositório** e **Abrir workspace**. Também dá pra **arrastar** a pasta/arquivo para a janela (no navegador, a tela inicial tem um campo para colar o caminho), e da próxima vez o projeto aparece em **Recentes**.

O `.exe` também aceita o caminho como parâmetro, útil pra criar atalhos que já abrem um projeto:

```bash
"%LOCALAPPDATA%\Programs\hydra-git\Hydra.exe" "C:\Users\José\Documents\GitHub\CRONOS\cronos.code-workspace"
```

### CLI

```bash
# Um workspace (arquivo .code-workspace)
hydra C:\Users\José\Documents\GitHub\CRONOS\cronos.code-workspace

# Um projeto normal (um repositório)
hydra C:\Users\José\Documents\GitHub\hydra

# A pasta atual (se não tiver repositórios, abre a tela inicial)
cd C:\Users\José\Documents\GitHub\CRONOS
hydra
```

O terminal mostra os repos encontrados e abre o navegador em `http://127.0.0.1:4711/?t=<token>`. Deixe o terminal aberto enquanto usa, e encerre com **Ctrl+C**.

#### Opções do CLI

| Opção | Padrão | Descrição |
|---|---|---|
| `-p, --port <n>` | `4711` | Porta do servidor local. Se estiver ocupada, tenta as próximas |
| `-m, --max <n>` | `1000` | Máximo de commits carregados por repo |
| `-o, --out <arquivo>` | — | Gera um **HTML estático** (somente leitura) em vez de subir o servidor |
| `--no-open` | — | Não abre o navegador automaticamente |
| `-v, --version` | — | Mostra a versão |
| `-h, --help` | — | Ajuda |

### Como o caminho é interpretado

1. **Arquivo `.code-workspace`**: usa as pastas de `folders[]`, com caminhos relativos ao arquivo. Comentários e vírgulas finais (JSONC) são aceitos.
2. **Pasta com exatamente um `.code-workspace`**: usa esse arquivo.
3. **Pasta que é um repo** (projeto normal): mostra só ele.
4. **Pasta qualquer**: usa as subpastas que são repositórios git.

Pastas do workspace que não são repositórios git são ignoradas.

### Modo estático (`--out`)

```bash
hydra C:\Users\José\Documents\GitHub\CRONOS --out cronos.html
```

Gera **um único arquivo HTML** com tudo embutido (CSS, JS e dados). Serve pra mandar um retrato do histórico pra alguém ou abrir sem servidor. É somente leitura: sem commit, branches, sync nem diffs.

---

## Tutorial

Um passo a passo do uso no dia a dia, usando o CRONOS como exemplo. Tudo vale igual para um projeto de um repositório só.

### 1. Abrindo um projeto

**No app desktop:** abra o Hydra pelo Menu Iniciar (ou dê dois cliques no `.exe` portátil). Na tela inicial:

- **Abrir workspace** → escolha `C:\Users\José\Documents\GitHub\CRONOS\cronos.code-workspace` (os 4 repos lado a lado);
- **Abrir repositório** → escolha a pasta de um projeto normal (um painel só, ocupando a tela);
- ou arraste o arquivo/pasta para a janela.

**Pelo terminal:**

```bash
hydra C:\Users\José\Documents\GitHub\CRONOS\cronos.code-workspace
```

O terminal mostra a assinatura **GKsegura** em arte ASCII, lista os repositórios encontrados e o navegador abre sozinho:

```
  🐉 Hydra v<versão> — crafted by GKsegura
     workspace cronos
     • CRONOS-API    C:\Users\José\Documents\GitHub\CRONOS\CRONOS-API
     • CRONOS-APP    C:\Users\José\Documents\GitHub\CRONOS\CRONOS-APP
     • CRONOS-INFRA  C:\Users\José\Documents\GitHub\CRONOS\CRONOS-INFRA
     • CRONOS-BOT    C:\Users\José\Documents\GitHub\CRONOS\CRONOS-BOT

  Abrindo http://127.0.0.1:4711/?t=3f9c…
  Ctrl+C para encerrar.
```

> ⚠️ No modo CLI, **deixe esse terminal aberto**: é ele que faz a página funcionar. Se o navegador não abrir, copie o link completo, **incluindo o `?t=…`**. Esse token é o que libera o acesso.

### 2. Entendendo a tela

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│ 🐉 Hydra  workspace cronos ▾   [ Filtrar commits ]  Atualizar  (aviso)  GitHub ● │  ← topo
├──────────────────────────────────────────────────────────────────────────────────┤
│ [CRONOS-API] [CRONOS-APP] [CRONOS-INFRA] [CRONOS-BOT]                            │  ← cards de status
├────────────┬──────────────────────────────────────────────────────┬──────────────┤
│ Repos ☑☑☑☑ │ CRONOS-API  ⎇ main ▾  [Push ↑1] ⋯ ✕ ┃ CRONOS-APP  ⎇ … │  Detalhe do  │
│ Local  +   │ grafo                             ▐ ┃ grafo         ▐ │  commit ou   │
│ Remoto     │ …                                 ▐ ┃ …             ▐ │  área de     │
│ PRs        │ ▬▬▬▬▬▬▬▬                            ┃ ▬▬▬▬▬           │  commit      │
│ Stashes    ├─────────────────────────────────────────────────────┤  (WIP)       │
│ Tags   +   │ ● CRONOS-API ✕  + ▾      terminal (Ctrl+`)        — │              │
│ GKsegura © │ $ git status                                         │              │
└────────────┴──────────────────────────────────────────────────────┴──────────────┘
```

- **Topo**: menu do workspace (`workspace cronos ▾`: recentes, clonar, novo, abrir, fechar), filtro, atualizar, o **aviso de atualização** do app (quando há versão nova) e a **conta do GitHub**.
- **Cards de status**: branch, `↑`/`↓` em relação ao remoto, staged/modificados/novos, última tag e idade do último commit. O selo **limpo** ou **N alterações** mostra quem tem trabalho pendente.
- **Barra de cada painel**: nome do repo, **seletor de branch** (`⎇ main ▾`), **botão de sync** (`Fetch` / `Pull ↓n` / `Push ↑n` / `Publicar`), menu **`⋯`** de ações e **✕** para ocultar.
- **Barra lateral**: escolhe quais repos aparecem e mostra, do repo em foco, as branches locais e remotas, **Pull Requests**, **Stashes** e **Tags**. No rodapé fica a assinatura e a versão.
- **Painel direito**: detalhe do commit selecionado, ou a área de commit (linha `// WIP`).
- **Terminal integrado** (embaixo dos grafos, `` Ctrl+` ``): um Git Bash por aba, cada um na pasta de um repo (seção 16).

> 💡 **Clique direito** funciona em quase tudo: commits, branches (no grafo, na lateral e no seletor), tags, arquivos alterados e stashes.

### 3. Escolhendo quais repositórios aparecem

| Quero… | Como |
|---|---|
| Esconder um repo | **✕** no painel ou **desmarque** o checkbox na barra lateral |
| Mostrar de novo | **Marque** o checkbox ou clique no **card** dele |
| Ver todos | Botão **Todos** na barra lateral |
| Ver só um | Desmarque os outros: o painel que sobra ocupa a largura toda |

### 4. Redimensionando e rolando os painéis

- **Arraste a divisória** entre dois painéis. **Duplo clique** nela, ou **Igualar**, divide o espaço igualmente.
- Cada painel tem **rolagem vertical** (commits) e **horizontal** (colunas), e o cabeçalho acompanha. `Shift` + roda do mouse rola na horizontal.
- Se os painéis somados passarem da tela, aparece também uma barra horizontal geral.

O layout é lembrado por workspace.

### 5. Navegando pelo histórico

- **Clique num commit** para ver mensagem, autor, data, pais e arquivos. **Clique num arquivo** para ver o diff (feche com **Esc**).
- **↑ / ↓** andam pelos commits do repo em foco. **Clique no título do painel** para focar aquele repo.
- Na barra lateral, **clique numa branch ou tag** para pular até o commit.
- **Filtro** (`Ctrl+F`): mensagem, autor, hash ou branch/tag, em todos os painéis.

> Dica: filtre por `feature/docker-instalacao` pra ver essa branch nos quatro repos do CRONOS ao mesmo tempo.

**Timeline unificada:** marque **"Timeline unificada"** na barra lateral (abaixo de *Todos / Igualar*). Um painel **Timeline** entra depois dos repos, com os commits de todos os painéis visíveis ordenados por data:

```
REPOS   MENSAGEM                  REPO          AUTOR   DATA
● │ │   app: tema escuro          CRONOS-APP    Ana     há 2 h
│ │ ●   bot: reconexão            CRONOS-BOT    José    há 5 h
│ ● │   api: docker-compose       CRONOS-API    José    ontem
```

Esconder um repo tira os commits dele da timeline. Para ver **só a timeline** (sem os grafos), marque **"Só a timeline"** logo abaixo. Para desligar, use o **✕** do painel ou desmarque a opção: os grafos voltam. As escolhas ficam salvas por workspace.

### 6. Fazendo um commit

1. Edite seus arquivos no VS Code: o Hydra **atualiza sozinho**, em tempo real, assim que você salva.
2. No painel do repo aparece a linha **`// WIP`** (ex.: `2 mod.`, `1 novo`). Clique nela.
3. No painel direito:
   - clique num arquivo para ver o **diff**. Para colocar no stage **só parte** do arquivo, use **"Stage deste trecho"** no cabeçalho de um trecho, ou clique nas linhas que quer (`Shift`+clique marca um intervalo) e depois em **"Stage das linhas (N)"**. No diff de um arquivo em stage, os botões viram **"Unstage"**. Arquivos novos, renomeados, binários ou em conflito vão para o stage inteiros;
   - **Stage** / **Stage all** para incluir no commit, **Unstage** para tirar;
   - clique direito num arquivo para **Descartar alterações** (ou use **Descartar** para todos).
4. Escreva o **Resumo** (o contador avisa passando de 72) e, se quiser, a **Descrição**.
5. **Commit** ou **Ctrl+Enter**.

Variações:

- **Emendar o último commit**: marque *"Emendar o último commit (amend)"*. A mensagem anterior é carregada. Dá pra só corrigir a mensagem ou incluir arquivos esquecidos.
- **Desfazer o último commit**: o link embaixo do botão tira o commit do histórico e devolve as alterações ao stage, com a mensagem preenchida. Só funciona se o commit **ainda não foi enviado** ao remoto; se já foi, use **Reverter** (seção 10).
- **Descartar** sempre pede confirmação. No app desktop, os arquivos vão para a **Lixeira do Windows** e dá pra recuperar; no navegador (CLI), a ação é definitiva.

**O mesmo commit em vários repositórios:** quando uma mudança atravessa o workspace, use **"Commit no workspace…"** (barra lateral, menu *Repositório* ou `Ctrl+Shift+Enter`):

1. A lista mostra os repos com alterações. Os que já têm algo em stage vêm marcados; marcar um repo sem nada em stage liga **"incluir tudo"** (stage de tudo antes do commit).
2. Escreva o resumo e a descrição **uma vez só** e, se quiser, marque **"Enviar (push) depois"**.
3. **Commit em N repositórios** (ou `Ctrl+Enter`). No fim aparece um relatório por repo: ✓ com o hash, – quando não havia nada para commitar, ✗ com o erro do git (ex.: um hook `pre-commit` que falhou). Um repo que falha **não desfaz** os outros.

Repos com merge, rebase ou conflito em andamento ficam de fora: conclua pelo painel deles.

### 7. Trabalhando com branches

Tudo começa no **seletor de branch** da barra do painel (`⎇ main ▾`):

| Quero… | Como |
|---|---|
| **Trocar de branch** | Abra o seletor e clique na branch. Branches **só no remoto** aparecem em "Só no remoto": ao clicar, o Hydra cria a local rastreando a remota |
| **Criar uma branch** | **Nova branch** no seletor (ou `Ctrl+Shift+N`, ou o **+** em "Local" na barra lateral). Digite o nome (espaços viram `-`) e escolha se já troca para ela |
| **Criar branch a partir de um commit antigo** | Clique direito no commit → **Nova branch a partir deste commit** |
| **Renomear** | Clique direito na branch → **Renomear…**. Se ela já está no remoto, marque *"Renomear também no remoto"* |
| **Excluir** | Clique direito → **Excluir…** (veja abaixo) |

**Excluir branch local e/ou na nuvem:** o diálogo tem duas caixas:

- ☑ **Branch local** (neste computador);
- ☑ **Branch no remoto** (`origin/nome`): some do GitHub para todo mundo; quem já baixou continua com a cópia.

Se a branch tiver commits que **não estão em nenhuma outra branch**, o Hydra avisa e pede uma segunda confirmação antes de apagar. Uma branch que só existe no remoto (lista **Remoto** da barra lateral) pode ser apagada com clique direito → **Excluir do remoto…**. Não dá para excluir a branch em que você está: troque de branch antes.

**Trocar de branch com alterações não commitadas:** o Hydra pergunta o que fazer (ex.: indo de `main` para `feature`):

- **Deixar em main**: as alterações são guardadas num stash. Quando você **voltar** para a `main`, o Hydra pergunta se quer restaurá-las;
- **Levar para feature**: as alterações vão junto. Se conflitarem com a outra branch, o git recusa a troca e nada é perdido.

**A mesma branch em vários repositórios:** use **"Branch…"** na barra lateral (ou menu *Repositório → Branch no workspace…*). O diálogo tem três abas, e todas mostram uma linha por repo **antes** de executar:

| Aba | O que faz |
|---|---|
| **Criar** | Cria a branch em cada repo marcado, a partir da branch atual (ou de outra, escolhida por repo), e já troca para ela se quiser. Onde ela já existe, o repo é pulado. |
| **Trocar** | Troca todos para a mesma branch. Por repo aparece se ela é **local**, **só no remoto** (vira local rastreando o remoto) ou **não existe** (marque *criar* para criá-la ali). Repos com alterações pendentes escolhem entre **guardar** (stash) e **levar** as alterações. |
| **Mergear** | Mergeia a branch escolhida na branch atual de cada repo, com a **prévia** de cada um: *"1 commit · fast-forward"* ou *"⚠ conflito em leia.txt"*. Repos com conflito começam desmarcados; se marcar, o merge para no conflito e você resolve pelo painel do repo (seção 9). |

No fim aparece o relatório por repo (✓ feito, – pulado, ⚠ conflito, ✗ erro). Um repo que falha não desfaz os outros.

> Dica: o marcador **×3** ao lado de uma branch na barra lateral mostra em quantos repos ela existe. Clique nele para abrir a aba **Trocar** já com a branch escolhida.

### 8. Sincronizando com o remoto (fetch, pull, push)

O **botão de sync** de cada painel mostra a ação mais útil no momento:

| O botão mostra | Significa | Ao clicar |
|---|---|---|
| `Fetch` | Está tudo em dia (até onde se sabe) | Busca novidades do remoto |
| `Pull ↓2` | O remoto tem 2 commits que você não tem | Traz e junta na sua branch |
| `Push ↑1` | Você tem 1 commit que não foi enviado | Envia para o remoto |
| `Publicar branch` | A branch só existe no seu computador | Cria a branch no remoto e passa a rastreá-la |
| `Publicar` | O repositório não tem remoto | Abre o diálogo de publicar no GitHub (seção 11) |

A setinha **▾** ao lado (ou clique direito no botão) oferece **Fetch, Pull e Push** avulsos. Durante a operação, o botão mostra a fase e o percentual.

- Se o push for recusado porque o remoto tem commits novos, o Hydra avisa para **fazer Pull antes**.
- Se o pull trouxer **conflitos**, você cai direto no fluxo de merge da seção 9.
- **Autenticação:** com login no GitHub (seção 12), o Hydra usa o seu token no github.com. Sem login, quem cuida é o **Git Credential Manager** do Git for Windows: na primeira vez ele abre uma janela do GitHub para você entrar.

### 9. Merge e resolução de conflitos

**Fazendo o merge:**

1. No seletor de branch, clique em **Merge em main…** (ou clique direito numa branch → **Merge em main…**, ou menu `⋯` do painel).
2. Escolha a branch que vai **entrar** na atual. Antes de confirmar, o Hydra mostra a **prévia**:
   - ✓ *"3 commits entram, sem conflitos"*, ou *(fast-forward)* quando é só avançar;
   - ⚠ *"1 commit entra, com conflito em 2 arquivos: config.js, README.md"*.
3. Se quiser forçar um commit de merge mesmo quando daria fast-forward, marque `--no-ff`.
4. Clique em **Merge de feature em main**.

**Quando há conflitos**, o painel ganha a faixa amarela **"Merge de feature em main · 2 conflito(s) · Resolver · Abortar"** e o **resolvedor visual** abre sozinho:

```
┌ CONFLITO  config.js                         1 de 2  ↑ ↓  · 0/2 escolhidos    ✕ ┐
│ Para todos os blocos: [Tudo de main] [Tudo de feature]   ☐ Mostrar base      │
│   const nome = "app";                         ← linhas sem conflito (contexto) │
│ ┌─ Atual · main ──────────────┬─ Entrando · feature ─────────┐                 │
│ │ const porta = 4000;          │ const porta = 8080;          │                 │
│ └──────────────────────────────┴──────────────────────────────┘                 │
│ [Aceitar atual] [Aceitar entrando] [Ambos (atual primeiro)] [Ambos (entrando…)]│
├ Resultado ─────────────────────────────────── edite à mão se precisar ─────────┤
│ const porta = 8080;                                                            │
│ const nome = "app";                                                            │
├────────────────────────────────────────────────────────────────────────────────┤
│ Abortar merge                               [Salvar e marcar como resolvido]  │
└────────────────────────────────────────────────────────────────────────────────┘
```

1. Para cada bloco, escolha **Aceitar atual** (o que está na sua branch), **Aceitar entrando** (o que vem da outra) ou **Ambos** (na ordem que preferir). O Hydra pula para o próximo bloco.
2. O **Resultado** embaixo mostra o arquivo final. Dá pra **editar à mão** (por exemplo, juntar as duas ideias numa linha só). Se editar, *"Refazer a partir das escolhas"* volta ao que os botões montaram.
3. **Salvar e marcar como resolvido** só fica disponível quando não sobra nenhum marcador `<<<<<<<` / `>>>>>>>`. O Hydra abre o próximo arquivo em conflito automaticamente.
4. **Arquivo binário** ou **apagado de um lado**: o resolvedor oferece escolher o arquivo inteiro: *"Usar a versão de main"*, *"Usar a versão de feature"* ou *"Excluir o arquivo"*.
5. Quando zerar, o painel direito mostra a **mensagem do commit de merge** (editável) e o botão **Concluir merge**.

A qualquer momento, **Abortar** volta tudo a como estava antes do merge. Fechar o resolvedor (✕) não aborta nada: o merge fica em andamento e dá para voltar pela faixa amarela ou pela lista de arquivos em conflito no painel direito. Revert e cherry-pick com conflito seguem exatamente o mesmo fluxo.

### 10. Stash, tags, reverter e cherry-pick

- **Guardar alterações (stash):** menu `⋯` do painel, botão **Stash** no painel de commit ou clique direito na linha `// WIP`. Dê uma descrição opcional.
- **Recuperar um stash:** seção **Stashes** da barra lateral. Um **clique restaura** (aplica e remove); o clique direito oferece *aplicar e manter* ou *descartar*.
- **Criar tag:** clique direito no commit → **Criar tag aqui…** (ou **+** em Tags). Com mensagem, ela vira uma tag anotada. Marque *"Enviar a tag para o remoto"* para publicar.
- **Enviar/excluir tag:** clique direito na tag (barra lateral ou badge no grafo).
- **Reverter um commit:** clique direito → **Reverter este commit…**. Cria um commit novo que desfaz aquele, sem reescrever o histórico. É o jeito certo para commits que já foram enviados.
- **Cherry-pick:** clique direito num commit de outra branch → **Cherry-pick na branch atual**.
- **Ir para um commit antigo:** clique direito → **Checkout deste commit** (HEAD destacado). Para trabalhar a partir dele, crie uma branch ali.

### 11. Clonar, criar e publicar repositórios

**Clonar** (tela inicial, menu do workspace ou `Ctrl+Shift+O`):

1. Aba **URL**: cole qualquer URL git (`https://…`, `git@github.com:…`). No GitHub, ela fica no botão verde **Code**. (A aba **GitHub**, para escolher entre os seus repositórios, está marcada como *em breve*.)
2. Confira a **pasta de destino**. O padrão é `Documentos\GitHub`, e o Hydra lembra a última usada.
3. **Clonar**: a barra mostra o progresso e, no fim, o repositório abre no Hydra.

**Criar um repositório novo** (tela inicial, menu do workspace ou `Ctrl+N` no app):

1. Nome (espaços viram `-`), descrição e **pasta onde criar**.
2. Escolha o **.gitignore** (Node, Vue/Vite, Java, Python ou nenhum) e se quer um **README.md**.
3. **Criar repositório**: o Hydra cria a pasta, a branch `main` e o commit inicial, e abre o projeto. (A opção *Publicar no GitHub* no mesmo diálogo está marcada como *em breve*; para publicar agora, veja abaixo.)

**Publicar um repositório que ainda não tem remoto:** o botão de sync mostra **Publicar** (ou menu `⋯` → *Publicar no GitHub…*):

1. Crie um repositório **vazio** em [github.com/new](https://github.com/new) (sem README e sem .gitignore, para não conflitar).
2. Cole a URL que o GitHub mostrar (ex.: `https://github.com/GKsegura/meu-projeto.git`) e clique em **Conectar e enviar**.
3. O Hydra adiciona como `origin` e envia a branch atual. Se for a primeira vez, o Git Credential Manager abre uma janela do GitHub para você entrar.

Quando o login com GitHub for liberado, dá para fazer tudo isso com um clique (o Hydra cria o repositório por você).

### 12. Conta do GitHub e Pull Requests

> 🚧 **Em breve.** Hoje o botão **GitHub** (canto superior direito) mostra *em breve* e explica o que vem por aí. O que já funciona sem login: push/pull/clone (pelo Git Credential Manager), a seção **Pull Requests** para repositórios públicos e **Criar Pull Request** (abre a página do GitHub com a sua branch). O passo a passo abaixo vale quando o login for liberado.

1. Clique em **Entrar** (canto superior direito). Precisa do [Client ID configurado](#configurar-o-login-com-github-para-quando-for-liberado).
2. O Hydra mostra um **código** (ex.: `ABCD-1234`). Clique em **Copiar**, depois em **Abrir github.com/login/device**, cole o código e autorize.
3. Pronto: o avatar aparece no topo. O login fica salvo (criptografado) para as próximas vezes.

Com a conta conectada:

- a seção **Pull Requests** da barra lateral lista os PRs abertos do repo em foco (clique abre no GitHub);
- **Criar Pull Request** (clique direito numa branch) abre a página de PR do GitHub já com a sua branch;
- clonar mostra seus repositórios, e dá para criar/publicar repositórios.

Para sair: clique no avatar → **Sair**. O token é apagado deste computador.

### 13. Trocando de workspace

A troca é feita **dentro do Hydra**:

- **Menu do topo** (`workspace cronos ▾`): **Recentes**, *Clonar…*, *Novo repositório…*, *Abrir workspace…* (`Ctrl+O`), *Abrir repositório ou pasta…* (app), *Tela inicial* e *Fechar workspace*.
- **Tela inicial**: recentes (o **✕** tira da lista, sem apagar nada), cartões (no navegador, também um campo para colar o caminho).
- **Menu do app** (a barra no topo da janela): **Arquivo**, **Repositório**, **Exibir** e **Ajuda** (conta do GitHub, procurar atualizações, notas da versão, sobre).

Cada workspace guarda **o seu próprio layout**.

**Dois workspaces ao mesmo tempo?** Sim: cada workspace abre em uma **guia** (a guia **Início** é fixa, à esquerda). Abrir o `.exe` de novo com um caminho abre uma nova guia na janela existente (ou ativa a guia dele, se já estiver aberto). Arraste as guias para reordenar; `Ctrl+W` fecha a guia e `Ctrl+Tab` / `Ctrl+Shift+Tab` trocam de guia (no app). Ao abrir o Hydra de novo, todas as guias voltam como estavam, com a mesma guia ativa. No navegador, rode um segundo `hydra` em outro terminal (ele sobe na porta **4712**) ou use as guias da mesma página.

**Formas de apontar o caminho** (campo da tela inicial no navegador, parâmetro do `.exe` ou `hydra`):

```bash
C:\Users\José\Documents\GitHub\CRONOS\cronos.code-workspace   # workspace
C:\Users\José\Documents\GitHub\CRONOS                         # pasta com um .code-workspace
C:\Users\José\Documents\GitHub\hydra                          # projeto normal (um repo)
C:\Users\José\Documents\GitHub                                # todos os repos da pasta
```

> ⚠️ Apontar para uma pasta grande como `Documents\GitHub` inteira abre **todos** os repos que estão nela. Depois é só desmarcar o que não interessa.

### 14. Criando um `.code-workspace`

Pelo VS Code: **File → Add Folder to Workspace…** (cada repo) e **File → Save Workspace As…**. Ou à mão (caminhos relativos ao arquivo):

```json
{
  "folders": [
    { "path": "MEUPROJETO-API" },
    { "path": "MEUPROJETO-WEB", "name": "Front" }
  ]
}
```

O `name` é opcional e vira o título do painel. O nome do arquivo vira o nome do workspace, e é por ele que o layout fica salvo.

### 15. Atalhos para seus projetos favoritos (opcional)

**App desktop:** crie um atalho do Hydra (clique direito na Área de Trabalho → *Novo → Atalho*) e, em **Destino**, coloque o executável seguido do caminho do projeto:

```
"%LOCALAPPDATA%\Programs\hydra-git\Hydra.exe" "C:\Users\José\Documents\GitHub\CRONOS\cronos.code-workspace"
```

Com o portátil, use o caminho do `.exe` portátil no lugar (ex.: `"C:\Ferramentas\Hydra-<versão>-portable.exe" "…"`).

**CLI:** no PowerShell (`notepad $PROFILE`):

```powershell
function cronos { hydra "C:\Users\José\Documents\GitHub\CRONOS\cronos.code-workspace" }
```

### 16. Usando o terminal integrado

1. Aperte **`` Ctrl+` ``** (ou menu `⋯` do painel → **Terminal integrado**). Um Git Bash abre embaixo dos grafos, já na pasta do repo em foco:

   ```
   José@PC MINGW64 ~/Documents/GitHub/CRONOS/CRONOS-API (feature/docker-instalacao)
   $ git status
   ```

2. **+** abre outro terminal no repo em foco; **▾** ao lado escolhe outro repo do workspace. Cada aba tem a cor do repo.
3. Arraste a **borda de cima** do painel para mudar a altura. **—** (ou `` Ctrl+` `` de novo) esconde o painel sem fechar os shells.
4. Rodou `git commit`, `git pull`, `git checkout`…? O grafo daquele repo **atualiza sozinho** logo depois que o comando termina (vale também para comandos rodados fora do Hydra).
5. Para fechar uma aba: **✕**, clique do meio, ou `exit` no próprio shell.

**Dividindo o terminal**

6. `Ctrl+\` divide o painel **lado a lado**: um terminal novo abre ao lado, no repo do terminal em foco. `Ctrl+Shift+\` divide **empilhado**. Apertando de novo o mesmo atalho, a divisão desfaz (os dois terminais continuam abertos, como abas).
7. Pelos botões da barra (os dois ícones ao lado de **▾**) você escolhe o **repositório** do terminal novo. O clique direito numa aba oferece **Abrir ao lado / abaixo**, **Mostrar no primeiro/segundo painel** e **Desfazer a divisão**.
8. Também dá para **arrastar uma aba** para a área dos terminais: soltar em **À direita** ou **Abaixo** divide; com o painel já dividido, soltar em **Painel 1** ou **Painel 2** escolhe onde ela aparece (ou troca os dois de lugar).
9. Arraste a **divisória** entre os painéis para mudar o tamanho (de 20% a 80%). Clicar num painel ou `Ctrl+Alt+setas` muda o painel em foco. Fechar o ✕ de um painel faz o outro ocupar tudo.
10. Para dividir, o painel precisa de pelo menos 500 px de largura (lado a lado) ou 260 px de altura (empilhado); senão o Hydra avisa. Cada guia de workspace lembra a sua divisão.

> Com texto selecionado, `Ctrl+C` **copia**; sem seleção, interrompe o comando como sempre. `Ctrl+V` cola.
> Dentro do terminal, `Ctrl+\` é do Hydra (dividir) e não mais o `SIGQUIT` do shell.
> Fechar a guia do workspace encerra os terminais dele.

### 17. Encerrando

- **App desktop:** feche a janela; o servidor interno e os terminais param junto.
- **CLI:** **Ctrl+C** no terminal do Hydra.

Nada fica rodando em segundo plano. O Hydra só altera seus repositórios quando você pede: pela interface ou pelos comandos que você digita no terminal integrado.

### Problemas comuns

| Sintoma | Causa / solução |
|---|---|
| *"O Windows protegeu o computador"* ao rodar o instalador ou o portátil | O executável não é assinado. **Mais informações → Executar assim mesmo** (só na primeira vez) |
| App avisa *"Git não encontrado"* | Instale o Git (<https://git-scm.com>) e abra o Hydra de novo |
| *"Falha de autenticação no remoto"* | Entre com o GitHub no Hydra, ou rode um `git fetch` no terminal uma vez para o Git Credential Manager pedir o login |
| *"O remoto tem commits que você ainda não tem"* ao dar push | Faça **Pull** primeiro (e resolva conflitos, se houver) |
| *"Suas alterações locais seriam sobrescritas"* | Faça commit, guarde (stash) ou descarte as alterações antes de trocar de branch/fazer merge |
| "Excluir…" está desabilitado para uma branch | É a branch em que você está: troque de branch antes |
| O botão GitHub diz "em breve" | O login com GitHub ainda não foi liberado. Push/pull/clone funcionam pelo Git Credential Manager; para publicar, use o caminho manual (seção 11) |
| *"Esse commit já está no remoto"* ao desfazer | Commits publicados não são desfeitos para não reescrever o histórico: use **Reverter** |
| `hydra` não é reconhecido como comando | Rode `npm link` na pasta do hydra e **abra um terminal novo**. Alternativa: `npm start -- <caminho>` |
| Atualizei o Hydra, mas a tela continua igual | Reinicie o Hydra e recarregue com **Ctrl+R**. O `F5` do Hydra só atualiza os dados |
| Uma mudança feita fora do Hydra não apareceu | O tempo real reconecta sozinho se a conexão cair. Enquanto isso, voltar o foco para a janela ou `F5` atualiza. Repos em pastas de rede podem não avisar mudanças: use `F5` |
| O aviso de atualização não aparece | Confira em **Ajuda → Procurar atualizações…**. Logo depois de uma Release sair, o instalador leva alguns minutos para ser anexado; o Hydra tenta de novo a cada 4 horas |
| *"Token inválido"* / *"Abra pelo link mostrado no terminal"* | O Hydra daquela aba foi reiniciado: use o link novo do terminal |
| *"Front não compilado"* | Rode `npm run build` (ou `npm install`) na pasta do hydra |
| *"Nenhum repositório git encontrado nesse caminho"* | O caminho não tem pasta com `.git`. Confira o caminho |
| Commit falha com *"Please tell me who you are"* | `git config --global user.name "Seu Nome"` e `git config --global user.email "voce@exemplo.com"` |
| Commits antigos não aparecem | Só os 1000 mais recentes são carregados. No CLI, use `--max 5000` |
| *"Rebase em andamento"* | O Hydra ainda não conduz rebase: conclua ou aborte pelo terminal integrado (`git rebase --continue` / `--abort`) |
| *"Terminal integrado indisponível"* | O módulo `node-pty` não foi instalado (no CLI, ele é opcional). Rode `npm install` de novo na pasta do hydra; o `.exe` já vem com ele |
| O terminal abriu PowerShell em vez de Git Bash | O Hydra não achou o `bash.exe` do Git. Confira se o Git for Windows está instalado com o Git Bash |

### Onde o Hydra guarda as coisas

| O quê | App desktop | CLI / navegador |
|---|---|---|
| Recentes | `%APPDATA%\hydra-git\recents.json` | `%USERPROFILE%\.hydra\recents.json` |
| Login do GitHub (quando liberado) | `%APPDATA%\hydra-git\github.bin` (criptografado pelo Windows) | não guarda (usa `GITHUB_TOKEN` ou `gh`) |
| Tamanho e posição da janela | `%APPDATA%\hydra-git\window.json` | — |
| O app instalado | `%LOCALAPPDATA%\Programs\hydra-git` (o portátil não instala nada) | — |
| Layout dos painéis (inclusive a timeline), altura do terminal e pasta de clone | armazenamento local do app | `localStorage` do navegador |

Nada disso vai para os seus repositórios.

---

## Desenvolvimento

| Script | O que faz |
|---|---|
| `npm run build` | Compila a interface (`web/` → `web/dist`) |
| `npm run check` | Type-check do back, do Electron e dos testes (`tsc`) e do front (`vue-tsc`) |
| `npm test` | Testes (Vitest) do git contra repositórios temporários |
| `npm run dev` | Vite com hot reload (veja abaixo) |
| `npm run desktop` | Compila e abre o app desktop sem empacotar |
| `npm run desktop:build` | Gera o instalador, o `latest.yml` e o `.exe` portátil em `release/` |

Para mexer no front com hot reload:

```bash
# terminal 1: a API (anote o token do link)
hydra C:\caminho\do\projeto --no-open

# terminal 2: o Vite, com proxy de /api (e do WebSocket do terminal) para a porta 4711
npm run dev
```

Abra `http://localhost:5173/?t=<token>` usando o mesmo token do terminal 1.

### Testes

`npm test` cria repositórios git temporários (e um repositório **bare** fazendo papel de "GitHub") e exercita as operações de verdade: commit/amend/undo, descartar, revert, cherry-pick, criar/renomear/excluir branch (local e remota), troca de branch com stash, merge fast-forward e com conflito, parse de conflitos (inclusive diff3), resolver e abortar, push/pull/fetch, push recusado, tags, clone, stash, criação de repositório e o layout do grafo. Confere as branches no workspace (criar pulando onde já existe, trocar com stash, criando onde falta e rastreando branch só remota, prévia e merge com um repo em conflito), o commit no workspace (stage respeitado por repo, "incluir tudo", hook que falha num repo sem afetar os outros, repo com merge pulado), o stage parcial (trecho, linhas soltas, unstage, CRLF e a recusa quando o arquivo muda no meio), o tempo real (um commit feito por fora vira um aviso só, e ruído do `.git/objects` é ignorado), a ordenação da timeline unificada, a comparação de versões usada no aviso de atualização e abre shells de verdade pelo terminal integrado (comandos, redimensionamento, reconexão) e confere que o WebSocket recusa token errado e origem de fora.

### Commits, versões e releases

O projeto segue **[Conventional Commits](https://www.conventionalcommits.org/pt-br/)** e usa **semantic-release** para versionar automaticamente:

| Commit | Efeito na versão |
|---|---|
| `fix: corrige X` | patch (`1.0.0` → `1.0.1`) |
| `feat: adiciona Y` | minor (`1.0.0` → `1.1.0`) |
| `feat!: …` ou rodapé `BREAKING CHANGE:` | major (`1.0.0` → `2.0.0`) |
| `docs:`, `chore:`, `refactor:`, `test:`… | sem release |

A cada push na `main`, o GitHub Actions ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

1. roda type-check, testes e build;
2. o **semantic-release** calcula a versão, atualiza `package.json` e `CHANGELOG.md`, cria a tag `vX.Y.Z` e a **GitHub Release**;
3. um job no Windows gera o **instalador** e o **portátil** daquela versão e anexa na Release, junto com o `latest.yml` e o `.blockmap`. São esses dois arquivos que os Hydras instalados consultam para se atualizar.

A versão do `package.json` é a que aparece no rodapé da barra lateral (`GKsegura © 2026 · vX.Y.Z`), na tela inicial, no *Sobre* do app e no `hydra --version`.

### Como o app desktop funciona

O app é uma "casca" Electron em volta do mesmo Hydra do CLI:

1. O **processo principal** (`electron/main.ts`) sobe o servidor Express em `127.0.0.1:47110` (ou na próxima porta livre) e abre uma janela apontando pra ele.
2. A **interface** é exatamente a mesma do navegador.
3. O **preload** (`electron/preload.ts`) expõe só cinco funções: o seletor nativo, o caminho real de arquivos arrastados, as ações do menu do app e o aviso de atualização (receber o estado e "reiniciar agora").
4. O processo principal fornece ao servidor o **cofre do token** (`safeStorage`/DPAPI) e a **Lixeira** (usada ao descartar).
5. O `esbuild` junta `electron/` + `src/` em `dist-electron/`, e o `electron-builder` empacota isso, a interface (`web/dist`), o Express, o `ws`, o `electron-updater` e o `node-pty` no **instalador** (NSIS) e no **`.exe` portátil**. O `node-pty` fica fora do `app.asar` (`asarUnpack`), porque o `conpty.dll` e os binários nativos precisam existir em disco. Como ele é N-API, o mesmo binário pré-compilado serve para o Node e para o Electron (`npmRebuild: false`, sem precisar de Visual Studio).
6. O **atualizador** (`electron/updater.ts`) roda só no app empacotado. No instalado, o `electron-updater` consulta o `latest.yml` da última Release, baixa o instalador novo, confere o sha512 e instala ao reiniciar. No portátil, ele só consulta a API de Releases e avisa.

### Estrutura

```
hydra/
├─ bin/hydra.js                # entrada do comando `hydra`
├─ src/                        # back-end (Node + TypeScript, sem build)
│  ├─ cli.ts                   # argumentos, modo servidor ou --out (banner GKsegura)
│  ├─ server.ts                # Express: sessão (workspace atual), rotas base, SSE, WebSocket do terminal, front
│  ├─ routes/
│  │  ├─ repo.ts               # /api/repos/:id/… branches, sync, merge, conflitos, stash, tags…
│  │  ├─ app.ts                # clonar, criar repositório, conta do GitHub
│  │  └─ terminal.ts           # abrir/fechar terminais integrados
│  ├─ terminal.ts              # shells (node-pty): Git Bash/PowerShell, scrollback, resize
│  ├─ git/                     # tudo que fala com o git, um arquivo por assunto
│  │  ├─ core.ts               # execução (sem shell), progresso, mensagens amigáveis, token
│  │  ├─ partial.ts            # stage parcial: monta o patch das linhas escolhidas e aplica com git apply --cached
│  │  ├─ log.ts · status.ts · diff.ts · commit.ts
│  │  ├─ branches.ts · remote.ts · merge.ts · stash.ts · tags.ts · repo.ts
│  │  └─ index.ts
│  ├─ jobs.ts                  # operações longas com progresso (clone/fetch/pull/push)
│  ├─ watch.ts                 # tempo real: observa os repos e avisa o que mudou (com debounce)
│  ├─ multi.ts                 # operações em vários repos de uma vez (commit e branches no workspace)
│  ├─ github.ts                # API do GitHub + login por device flow
│  ├─ github-session.ts        # conta conectada (token, usuário, login em andamento)
│  ├─ secrets.ts · config.ts   # onde o token fica · Client ID do OAuth App
│  ├─ workspace.ts · recents.ts · data.ts · layout.ts · render.ts · version.ts · http.ts
├─ electron/                   # app desktop
│  ├─ main.ts                  # janela, menus, seletor nativo, cofre do token, lixeira
│  ├─ preload.ts               # a ponte (5 funções) entre a interface e o sistema
│  └─ updater.ts               # atualizações: electron-updater (instalado) ou aviso (portátil)
├─ web/src/                    # front-end (Vue 3 + TypeScript + Vite)
│  ├─ App.vue · main.ts        # layout, atalhos, menus do app · banner GKsegura no console
│  ├─ store.ts · actions.ts    # estado reativo · ações git no estilo GitHub Desktop
│  ├─ terminal.ts              # abas do terminal integrado (abrir, fechar, Ctrl+`)
│  ├─ timeline.ts              # junta e ordena os commits dos repos para a timeline unificada
│  ├─ api.ts · types.ts · graph.ts · utils.ts
│  └─ components/              # GraphPane, BranchMenu, SyncButton, ConflictResolver,
│     │                        # OperationBanner, ContextMenu, SideBar, WipPanel, WelcomeScreen,
│     │                        # TerminalDock (painel e abas), TerminalView (xterm.js),
│     │                        # UpdateNotice (aviso de atualização), TimelinePane…
│     └─ dialogs/              # criar/renomear/excluir branch, merge, clonar, novo repo,
│                              # publicar, tag, stash, GitHub, confirmação
├─ test/                       # Vitest: operações git em repositórios temporários, terminal e versões
├─ scripts/ · build/icon.svg   # build do Electron e ícone
├─ .github/workflows/ci.yml    # testes, semantic-release e instalador + portátil + latest.yml na Release
├─ .releaserc.json · CHANGELOG.md · LICENSE
└─ package.json                # inclui a configuração do electron-builder ("build")
```

### Como o grafo é desenhado

1. `git log --all --date-order` traz os commits de todas as refs, com filhos sempre antes dos pais.
2. O algoritmo de lanes (`src/layout.ts`) percorre essa lista mantendo, para cada coluna, o hash do commit "esperado" nela:
   - o commit ocupa a primeira lane que o espera, ou abre uma nova se ele for ponta de branch;
   - outras lanes que também o esperavam **convergem** nele (fim de branch);
   - o primeiro pai herda a lane, e os demais pais (merge) reutilizam uma lane que já os espera ou abrem outra.
3. O resultado é uma lista de nós `{linha, coluna, cor}` e de arestas, desenhadas como retas e curvas bézier em SVG.

### Como o resolvedor de conflitos funciona

1. `git merge-tree --write-tree` **prevê** os conflitos antes do merge, sem tocar na área de trabalho.
2. Depois do merge, `src/git/merge.ts` lê o arquivo e separa **trechos comuns** e **blocos em conflito** (`<<<<<<<`, `|||||||`, `=======`, `>>>>>>>`).
3. A interface monta o resultado a partir das escolhas (ou da edição manual) e manda o **conteúdo final**. O servidor recusa se ainda houver marcadores, grava (preservando CRLF/LF) e faz `git add`.
4. Para binários e arquivos apagados de um lado, usa `git checkout --ours/--theirs` ou `git rm`.

### API local

Todas as rotas exigem o header `x-hydra-token` (os streams de eventos aceitam `?t=`). Sem workspace aberto, as rotas de repositório respondem `409`. Operações longas devolvem `{ jobId }` e o progresso vem por `GET /api/jobs/:id/events` (Server-Sent Events). O tempo real vem por `GET /api/events`, que manda `{ repoId, kind }` a cada mudança: `repo` quando o `.git` mudou (recarrega grafo e status) e `status` quando só a árvore de trabalho mudou.

| Grupo | Rotas principais |
|---|---|
| App e workspaces | `GET /api/app` · `POST /api/workspace/open` · `POST /api/workspace/close` · `POST /api/recents/remove` · `GET /api/workspace` · `POST /api/workspace/commit` (`{ repos: [{ id, stageAll }], summary, body }` → relatório por repo) |
| Branches no workspace | `GET /api/workspace/branches` · `POST /api/workspace/branches/{create,checkout,merge-preview,merge}` (cada um com a lista de repos e devolvendo um relatório por repo) |
| Leitura do repo | `GET /api/repos/:id/{graph,status,branches,remotes,operation,pulls,last-commit}` · `GET …/commit/:hash` · `GET …/commit/:hash/diff?file=` · `GET …/diff?file=&staged=` |
| Commits | `POST …/{stage,unstage,commit,amend,undo,revert,cherry-pick,discard}` · `POST …/{stage-lines,unstage-lines}` (stage parcial: `{ file, lines, expected }`) |
| Branches | `POST …/branches` · `…/branches/{checkout,rename,delete,delete-remote}` · `…/checkout-commit` |
| Sync (jobs) | `POST …/{fetch,pull,push,publish}` · `POST …/remotes` (conectar um `origin`, usado no "Publicar" manual) |
| Merge e conflitos | `GET …/merge/preview?branch=` · `POST …/merge` · `POST …/operation/{abort,continue}` · `GET …/conflicts/file?path=` · `POST …/conflicts/resolve` |
| Stash e tags | `POST …/stashes` · `…/stashes/{apply,drop}` · `POST …/tags` · `…/tags/{push,delete}` |
| Outros | `POST …/open` (VS Code/Explorer/terminal externo) · `GET …/compare-url` |
| Terminal integrado | `GET /api/terminal` · `POST /api/repos/:id/terminals` · `DELETE /api/terminals/:tid` · WebSocket `/api/terminals/:tid/ws?t=` (entrada `i…`, redimensionar `r{cols,rows}`) |
| Clonar/criar (jobs) | `POST /api/repos/clone` · `POST /api/repos/init` · `GET /api/repos/templates` |
| GitHub | `GET /api/github` · `POST /api/github/{login,login/cancel,logout}` · `GET /api/github/repos` |

---

## Segurança

O Hydra executa git na sua máquina, então tudo foi fechado para uso local:

- O servidor escuta **só em `127.0.0.1`**, sem exposição na rede, com **checagem do `Host`** contra DNS rebinding.
- **Token aleatório por sessão**, exigido em toda chamada via header customizado: outra aba ou site não consegue disparar um commit ou um push.
- **Só repositórios do workspace aberto** podem ser acessados. Stage/descartar/resolver só aceitam arquivos que aparecem no `git status`. Nomes de branch/tag são validados pelo próprio git (`check-ref-format`) e hashes por formato.
- O git é chamado com argumentos em lista, **nunca via shell**. Mensagens de commit vão por stdin, então acentos, aspas e emojis funcionam.
- Operações de rede rodam com `GIT_TERMINAL_PROMPT=0`: nada fica travado esperando senha.
- **Token do GitHub:**
  - no app, fica **criptografado pelo Windows** (`safeStorage`/DPAPI);
  - é repassado ao git por variáveis `GIT_CONFIG_*` só durante o comando, então não aparece na lista de processos e **nunca é gravado no `.git/config`**;
  - o login usa o device flow oficial, e o Hydra nunca vê sua senha.
- **Atualizações:** o instalador só baixa das Releases do GitHub (`GKsegura/hydra`), por HTTPS. Antes de instalar, confere o **sha512** do arquivo contra o `latest.yml` da mesma Release, e nada roda se o download vier corrompido ou alterado. O portátil só consulta a API de Releases para saber se há versão nova; ele não baixa nada sozinho.
- **Terminal integrado:**
  - o shell só abre na pasta de um repositório do workspace aberto (o caminho vem da sessão, nunca da requisição);
  - o WebSocket exige o token da sessão e recusa conexões cujo `Origin` não seja a própria interface local, então um site aberto no navegador não consegue se conectar ao seu shell;
  - trocar ou fechar o workspace, fechar o app ou dar Ctrl+C no CLI encerra os shells.
- **Ações destrutivas** (excluir branch/tag, descartar, abortar, desfazer commit) pedem confirmação. Excluir branch não mergeada pede uma segunda confirmação, e descartar no app vai para a Lixeira.
- **No app desktop:** a janela roda com `contextIsolation` e `sandbox`, sem acesso ao Node. A ponte tem cinco funções, links externos abrem no navegador padrão e a janela não navega para fora do servidor local.

## Limitações conhecidas

- Carrega os **N commits mais recentes** por repo (padrão 1000; no CLI, `--max`).
- **Rebase** interativo/em andamento não é conduzido pela interface (o Hydra detecta e pede para concluir no terminal integrado).
- O **terminal integrado** não sobrevive a reiniciar o Hydra: fechar o app encerra os shells. Um `F5`/`Ctrl+R` reconecta aos mesmos shells.
- O **stage parcial** não vale para arquivos novos (ainda fora do índice), renomeados, binários ou em conflito: esses vão inteiros.
- Commits de merge mostram os arquivos em relação ao **primeiro pai**.
- O app desktop é **só para Windows x64**, não é assinado (daí o aviso do SmartScreen na primeira instalação) e tem ~100 MB, porque carrega o Chromium e o Node do Electron.
- O `.exe` **portátil** não se atualiza sozinho: ele só avisa. Para atualização automática, use o instalador.
- O app desktop tem **uma janela** (um workspace por vez).
- O **login com GitHub** está implementado mas **desativado** (em breve). Quando liberado, exige configurar um OAuth App uma vez ([veja como](#configurar-o-login-com-github-para-quando-for-liberado)).

## Roadmap

- [x] Push / pull / fetch pela interface
- [x] Criar, trocar, renomear e excluir branches (local e remota)
- [x] Merge com prévia e resolvedor visual de conflitos
- [x] Clonar, criar e publicar repositórios; Pull Requests
- [ ] **Liberar o login com GitHub** (já implementado, desativado): escolher seus repositórios ao clonar, publicar com um clique, PRs privados
- [x] **Terminal integrado**: Git Bash embaixo dos grafos, uma aba por repositório, com o grafo atualizando depois dos comandos
- [x] **Stage parcial**: escolher trechos/linhas do diff para o commit
- [x] **Commit em vários repos de uma vez** com a mesma mensagem (ex.: a mesma feature nos 4 repos do CRONOS)
- [x] **Branches cross-repo**: criar/trocar/mergear a mesma branch em todos os repos do workspace
- [x] **Timeline unificada**: todos os commits do workspace numa linha do tempo só (opcional, ao lado dos grafos ou sozinha)
- [ ] Rebase interativo visual
- [x] Atualização em tempo real (observar os repos em vez de atualizar no foco)
- [x] Instalador com atualização automática
- [ ] Associação de arquivos ("Abrir com Hydra" no `.code-workspace`, sem tirar o VS Code como padrão)
- [ ] Extensão do VS Code que abre o Hydra junto com o workspace

---

## Licença e autoria

Distribuído sob a **[licença MIT](LICENSE)**: qualquer pessoa pode usar, copiar, modificar e redistribuir o Hydra, inclusive comercialmente, **desde que mantenha o aviso de copyright e o texto da licença** (`Copyright (c) 2026 José Segura (GKsegura)`) em todas as cópias ou partes substanciais do código.

**Crafted by GKsegura**: feito por **José Segura** ([@GKsegura](https://github.com/GKsegura)). © 2026.
