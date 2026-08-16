# Changelog

## 4.3.2 — 2026-08-06

### Alterações

- Removido o controlador flutuante Anterior/Próxima dos Fluxos Visuais exportados.
- A navegação agora acontece somente pelos cards, links, formulários e botões naturais das páginas.
- A seleção de produto continua sendo propagada silenciosamente entre as etapas.

## 4.3.1 — 2026-08-06

### Correções

- O painel de etapas não aparece mais quando o modo Snapshot está selecionado.
- A seleção entre Snapshot e Fluxo Visual fica salva ao fechar o popup.
- Ao reabrir o popup durante uma gravação, o modo Fluxo e sua lista são restaurados.

## 4.3.0 — 2026-08-06

### Novidades

- Cancelamento do Snapshot pelo popup ou pelo overlay flutuante.
- Interrupção da descoberta de páginas, processamento de CSS, downloads e compactação.
- Requisições de rede ativas são abortadas imediatamente.
- Fluxo Visual pode ser cancelado e completamente limpo.
- Etapas individuais podem ser excluídas antes da geração do ZIP.
- Etapas restantes são renumeradas depois de uma exclusão.
- Finalização e cancelamento esperam operações concorrentes terminarem com segurança.

## 4.2.0 — 2026-08-06

### Novidades

- Gravação automática do Fluxo Visual vinculada à aba atual.
- Captura da tela inicial assim que o DOM estabiliza.
- Reinstalação automática do observador após cada navegação completa.
- Detecção de mudanças de rota e estados estáveis em aplicações SPA.
- Estado da gravação persistido mesmo quando o popup fecha.
- Deduplicação por impressão digital da página.
- Finalização aguarda a última captura em andamento antes de gerar o ZIP.
- Fechar a aba gravada encerra a sessão automaticamente.

## 4.1.0 — 2026-08-06

### Novidades

- Catálogos do Fluxo Visual podem encaminhar múltiplos cards ao modelo local de produto.
- A seleção transporta título, imagem e preço pelas etapas seguintes usando somente parâmetros locais.
- Navegação Anterior e Próxima preserva o produto selecionado.
- Formulários simulados mantêm a seleção ao avançar para garantia e checkout.
- Heurísticas genéricas reconhecem rotas de produtos em diferentes tipos de loja.

## 4.0.1 — 2026-08-06

### Correções

- Novo motor de privacidade para mascarar e-mail, telefone, CPF, CNPJ, CEP e números de cartão renderizados.
- Substituição de blocos simples de endereço e nome de usuário em Fluxos Visuais.
- Remoção de tokens, sessões, identificadores de checkout e rastreamento das URLs do relatório.
- Relatórios de falha agora recebem a mesma limpeza de URLs sensíveis.

## 4.0.0 — 2026-08-06

Primeiro lançamento estável da arquitetura modular do catCloner.

### Novidades

- Motores separados para HTML, CSS, imagens, links, segurança de JavaScript e vídeo.
- Captura de páginas e subpáginas internas com limite e profundidade configuráveis.
- Priorização de produtos, artigos e páginas de detalhes.
- Preservação de imagens responsivas e remoção de CSP incompatível com arquivos locais.
- Retentativas para recursos e relatório detalhado de falhas.
- Overlay compacto com terminal de eventos reais e progresso.
- Pausa automática para resolução manual de CAPTCHA.
- Limpeza de formulários, campos ocultos e conteúdo editável.
- Fluxo Visual persistente com várias telas no mesmo ZIP.
- Navegação local entre etapas, formulários simulados, botões, abas e acordeões seguros.
- Interface redesenhada em português.

### Limitações conhecidas

- Aplicações dependentes de APIs, login, DRM ou servidor não funcionam integralmente offline.
- Frames de pagamento e scripts originais são removidos deliberadamente.
- Sites podem alterar sua estrutura e exigir ajustes futuros.
- Recursos protegidos, temporários ou bloqueados por anti-bot podem não ser baixados.
