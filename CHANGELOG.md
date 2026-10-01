# Changelog

Este arquivo é mantido automaticamente pelo [semantic-release](https://github.com/semantic-release/semantic-release) a partir dos commits convencionais (`feat:`, `fix:`, …) na branch `main`.

# [1.11.0](https://github.com/GKsegura/hydra/compare/v1.10.0...v1.11.0) (2026-10-01)


### Features

* **vscode:** adiciona extensão do VS Code ([0eb9eeb](https://github.com/GKsegura/hydra/commit/0eb9eeb3447805484e71544da20616cd0e07b704))

# [1.10.0](https://github.com/GKsegura/hydra/compare/v1.9.0...v1.10.0) (2026-10-01)


### Bug Fixes

* evita falha instável nos testes do simulador de cenários ([5fc2afd](https://github.com/GKsegura/hydra/commit/5fc2afd6861287c96e41ee1704c3cd9ffb2b0987))


### Features

* **desktop:** adiciona o item Abrir com Hydra no Explorer ([a102472](https://github.com/GKsegura/hydra/commit/a102472e68956382080ffcfae7a3611a90c45696))
* **desktop:** adiciona o item Abrir com Hydra no Explorer ([d5e3a49](https://github.com/GKsegura/hydra/commit/d5e3a49863fa4781e05dc41d33045891783f2919))
* **rebase:** adiciona rebase interativo visual ([8d50e1a](https://github.com/GKsegura/hydra/commit/8d50e1ab9e17df1adaa784439415e211880e213e))

# [1.9.0](https://github.com/GKsegura/hydra/compare/v1.8.0...v1.9.0) (2026-09-30)


### Bug Fixes

* **terminal:** não derruba o servidor quando o navegador corta o WebSocket ([97314da](https://github.com/GKsegura/hydra/commit/97314da37db3701dc6af77c5402ada30892bb5ad))
* **terminal:** reencontra os terminais de cada guia depois de recarregar ([8642c5f](https://github.com/GKsegura/hydra/commit/8642c5f39b59931b34e788d1e08fec519e123cf3))


### Features

* **api:** vários workspaces abertos, rotas por workspace e sessão com todas as guias ([f3089af](https://github.com/GKsegura/hydra/commit/f3089afe19ce90a28e92828e5ecd1a33b85500fa))
* **cenarios:** cherry-pick e rebase na simulação ([9adcec5](https://github.com/GKsegura/hydra/commit/9adcec511e318f3c56b9421511dc9a62e94fbcd6))
* **cenarios:** motor de simulação de merge sem tocar no repositório ([5478f99](https://github.com/GKsegura/hydra/commit/5478f998793cef83a45dc4bbb21e2efb1328c69c))
* **cenarios:** rota para simular um cenário em vários repositórios ([70abd3b](https://github.com/GKsegura/hydra/commit/70abd3be90c982deb021781aec3a9195301c2759))
* **cenarios:** tela para montar e simular cenários de merge ([33bddf5](https://github.com/GKsegura/hydra/commit/33bddf529a737b9cabbfdbc90c12ed72b510e97f))
* **sessao:** abre caminhos externos como nova guia e adiciona o menu Guias ([7d23bf8](https://github.com/GKsegura/hydra/commit/7d23bf87c80f7cc4121f8c4cc6b0cc2ab7f92add))
* **sessao:** reabre o último workspace e salva o layout por caminho ([57ef14c](https://github.com/GKsegura/hydra/commit/57ef14cd77a2c8d4248e786908f6750633d99e50))
* **terminal:** atalhos de divisão, arrastar aba para um painel e menu Terminal ([b7720db](https://github.com/GKsegura/hydra/commit/b7720dbd4944fd8790f19aafac935bab5aa0c111))
* **terminal:** divide o terminal em dois painéis lado a lado ou empilhados~ ([130f1e9](https://github.com/GKsegura/hydra/commit/130f1e98a573a0c6e0ab28a0dd815638bd36d821))
* **terminal:** modelo do layout com divisão ([1adff91](https://github.com/GKsegura/hydra/commit/1adff919dca80d7f4df34ce569103849af44e07a))
* **web:** guias de workspace com Início fixo e estado por guia ([7b7035c](https://github.com/GKsegura/hydra/commit/7b7035c2e3db5ad84b09b1566bbd4feb7d95ab5e))
* **welcome:** remove o campo de caminho da tela inicial no desktop ([de6b615](https://github.com/GKsegura/hydra/commit/de6b61561d2729080f4039ee032d94b3b3e7418e))


### Performance Improvements

* **graph:** adiciona limit ao endpoint /graph e corrige o aviso de truncamento ([63eb800](https://github.com/GKsegura/hydra/commit/63eb80086ca0dc02cc7c4fbc43224588ae7f04d7))
* **graph:** virtualiza linhas, nós e arestas do painel de grafo ([096cd21](https://github.com/GKsegura/hydra/commit/096cd21b2234b8ea6bbd12c33cac7e2dda989554))
* **guias:** descarrega os grafos de guias inativas ([f31eb09](https://github.com/GKsegura/hydra/commit/f31eb09ebe7e7f137e98c975a57912c098448b1d))
* **timeline:** virtualiza as linhas e carrega mais commits conforme a rolagem ([bd02925](https://github.com/GKsegura/hydra/commit/bd02925fa8df99457121bd5fe8c11bc1310847ab))
* **web:** carrega os grafos por repo conforme ficam prontos e busca mais commits ao rolar ([66e88ff](https://github.com/GKsegura/hydra/commit/66e88ff8fdfa9706a23449142165272138b1a250))

# [1.8.0](https://github.com/GKsegura/hydra/compare/v1.7.0...v1.8.0) (2026-09-27)


### Features

* **branches:** cria, troca e mergeia branches em vários repositórios ([068ebb5](https://github.com/GKsegura/hydra/commit/068ebb55860e65e14e14a52c3d6b728208c6e502))

# [1.7.0](https://github.com/GKsegura/hydra/compare/v1.6.0...v1.7.0) (2026-09-26)


### Features

* **commit:** commita em vários repositórios de uma vez ([5e1d32c](https://github.com/GKsegura/hydra/commit/5e1d32c56a7b591b24f5896df56400af350916de))

# [1.6.0](https://github.com/GKsegura/hydra/compare/v1.5.0...v1.6.0) (2026-09-26)


### Features

* **commit:** adiciona stage parcial por trecho e linha ([942912f](https://github.com/GKsegura/hydra/commit/942912f9a3cbb6ddf6d6cb0c1385e96c46d46971))

# [1.5.0](https://github.com/GKsegura/hydra/compare/v1.4.0...v1.5.0) (2026-09-26)


### Bug Fixes

* **desktop:** mensagens claras ao procurar atualizações ([ed2d225](https://github.com/GKsegura/hydra/commit/ed2d2255386653e3be8a6aa8cb85a6ed69374f0b))


### Features

* **timeline:** opção de mostrar só a timeline ([1945e20](https://github.com/GKsegura/hydra/commit/1945e20320f3c0b731b9e1ff0b3c60a211864737))

# [1.4.0](https://github.com/GKsegura/hydra/compare/v1.3.0...v1.4.0) (2026-09-26)


### Features

* atualiza os repositórios em tempo real ([2ae00fb](https://github.com/GKsegura/hydra/commit/2ae00fb2536269a2647f08a800b9f1c52552242a))
* **desktop:** mantém o menu do app sempre visível ([c6fea18](https://github.com/GKsegura/hydra/commit/c6fea183dec9a803dc6dddaf89bf7d501d3ebdd3))

# [1.3.0](https://github.com/GKsegura/hydra/compare/v1.2.0...v1.3.0) (2026-09-26)


### Bug Fixes

* **desktop:** ignora o caminho do próprio app ao ler os argumentos em desenvolvimento ([d4952f4](https://github.com/GKsegura/hydra/commit/d4952f4e14273611fe62650eb3fcfc3881772f68))


### Features

* **timeline:** adiciona timeline unificada do workspace ([7d0541a](https://github.com/GKsegura/hydra/commit/7d0541a30592a85e33999b68442352877be695e6))

# [1.2.0](https://github.com/GKsegura/hydra/compare/v1.1.0...v1.2.0) (2026-09-26)


### Features

* **desktop:** adiciona instalador com atualização automática ([cd00427](https://github.com/GKsegura/hydra/commit/cd00427f006290dc92b6d4950e8dd579f4e45011))

# [1.1.0](https://github.com/GKsegura/hydra/compare/v1.0.0...v1.1.0) (2026-09-26)


### Features

* **terminal:** adiciona terminal integrado estilo Git Bash ([d18f825](https://github.com/GKsegura/hydra/commit/d18f825bd0525b443be51b338937d8e8b995a337))

# 1.0.0 (2026-09-26)


### Features

* adiciona CLI e servidor local do Hydra ([4fdd609](https://github.com/GKsegura/hydra/commit/4fdd609d9bc8d86deadf11dbe0d0a0b92700a577))
* **desktop:** adiciona app Electron com .exe portátil ([0a20426](https://github.com/GKsegura/hydra/commit/0a204269cbd7748ad0d802adf1177d548ce3e865))
* **web:** adiciona interface Vue com grafos lado a lado ([c4e6c93](https://github.com/GKsegura/hydra/commit/c4e6c93873f5e87d5e4caa3d9f50e2de54a282c1))
