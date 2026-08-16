# Roadmap de entrega — catCloner 4.0

Prazo: **7 dias**  
Versão atual: **4.3.2**  
Objetivo: entregar uma versão comercial estável para criação de snapshots visuais offline autorizados, com páginas e subpáginas navegáveis.

## Definição da entrega

A versão 4.0 será considerada pronta quando conseguir:

- capturar uma página renderizada com HTML, CSS, imagens, fontes e mídia suportada;
- capturar subpáginas internas dentro dos limites escolhidos;
- gerar navegação offline entre as páginas capturadas;
- neutralizar scripts remotos, formulários e dados sensíveis;
- pausar para CAPTCHA manual sem bloquear a interação;
- gerar ZIP e relatório de diagnóstico de forma confiável;
- falhar de forma compreensível quando um site não puder ser reproduzido;
- passar pela matriz mínima de testes sem regressões críticas.

Não fazem parte desta entrega:

- checkout funcional, pagamentos, pedidos ou login offline;
- quebra de CAPTCHA, DRM, paywall ou controle de acesso;
- reprodução de APIs e sistemas de servidor;
- promessa de cópia perfeita de todos os sites existentes;
- publicação automática na Chrome Web Store, caso a conta e a análise ainda não estejam prontas.

## Prioridades

### P0 — obrigatório para entregar

- ZIP sempre finaliza ou apresenta erro claro.
- HTML principal abre sem tela preta ou carregamento infinito.
- CSS e imagens locais funcionam em `file://`.
- Subpáginas capturadas abrem pelos links locais.
- CAPTCHA pausa e retoma corretamente.
- Dados de formulários são removidos.
- Relatório registra páginas e recursos com falha.
- Testes de regressão cobrem os sites escolhidos.

### P1 — importante, mas pode receber correções após a entrega

- Interface com resumo do resultado.
- Cancelamento de captura.
- Limite estimado de tamanho do ZIP.
- Nomes mais legíveis para arquivos de subpáginas.
- Melhor suporte a Shadow DOM aberto.
- Detecção de overlays e skeletons presos.
- Refinamento, reordenação e edição das etapas do Fluxo Visual.

### P2 — pós-lançamento

- Retomada completa após reiniciar o navegador.
- Adaptadores individuais para grandes lojas.
- Exportação para formatos além de ZIP.
- Atualizações automáticas e telemetria opcional.
- Painel completo de projetos capturados.

## Cronograma de sete dias

### Dia 1 — Baseline e testes reproduzíveis

Objetivo: parar de corrigir problemas sem conseguir reproduzi-los.

- Criar uma lista fixa de URLs de teste.
- Executar captura de uma página e de três páginas em cada site.
- Guardar ZIP, `clone-report.json` e captura de tela do resultado.
- Classificar cada falha como HTML, CSS, imagem, link, bloqueio ou download.
- Criar uma checklist manual de regressão.
- Congelar novas funcionalidades que não sejam P0.

Saída esperada: matriz inicial preenchida e lista ordenada de falhas.

### Dia 2 — HTML e carregamento offline

Objetivo: eliminar telas pretas, skeletons e conteúdo invisível.

- Remover CSP, base URL e estados remotos incompatíveis.
- Detectar overlays de carregamento que permaneceram presos.
- Preservar atributos visuais necessários.
- Avaliar captura de Shadow DOM aberto.
- Garantir documento, idioma, título e metadados básicos.
- Testar KaBuM, Terabyte e dois sites comuns.

Critério de aceite: todas as páginas P0 exibem conteúdo útil ao abrir o `index.html`.

### Dia 3 — CSS, imagens, fontes e mídia

Objetivo: aumentar a fidelidade visual.

- Corrigir caminhos relativos de CSS e `@import`.
- Validar `url()`, fontes e imagens referenciadas por CSS.
- Preservar `currentSrc`, `srcset`, lazy loading e background images.
- Usar tipo de conteúdo para diagnosticar extensões incorretas.
- Adicionar retentativa e timeout por recurso.
- Testar Play Store, Mercado Livre e Amazon.

Critério de aceite: nenhuma página P0 pode perder todas as imagens ou todo o CSS.

### Dia 4 — Subpáginas e navegação

Objetivo: entregar clones realmente navegáveis.

- Validar fila BFS, profundidade e limite de páginas.
- Priorizar produto, artigo e página de detalhes.
- Eliminar URLs duplicadas e parâmetros de rastreamento.
- Reescrever links para arquivos locais.
- Criar página de fallback para links não capturados.
- Confirmar que uma falha não interrompe as páginas seguintes.

Critério de aceite: pelo menos três subpáginas navegáveis em cada site compatível da matriz.

### Dia 5 — Robustez e experiência do usuário

Objetivo: evitar que o comprador pense que a extensão travou.

- Implementar cancelamento seguro.
- Melhorar estados de progresso e mensagens de erro.
- Garantir pausa e retomada de CAPTCHA.
- Informar páginas encontradas, capturadas e rejeitadas.
- Avisar sobre ZIP grande antes do download.
- Revisar popup e overlay em telas menores.

Critério de aceite: todo processo termina em sucesso, cancelamento ou erro explicado.

### Dia 6 — Regressão, privacidade e documentação

Objetivo: preparar o pacote comercial.

- Rodar toda a matriz novamente.
- Confirmar remoção de campos, tokens, iframes e scripts remotos.
- Revisar permissões do manifesto.
- Atualizar README, instalação, uso, limitações e solução de problemas.
- Criar política de privacidade e termos de uso adequados.
- Atualizar contrato de licenciamento com revisão jurídica externa recomendada.
- Preparar changelog e versão candidata.

Critério de aceite: zero falhas críticas abertas e documentação coerente com o produto real.

### Dia 7 — Release Candidate e entrega

Objetivo: gerar uma versão que não será mais alterada sem necessidade crítica.

- Criar **4.0.0 RC1**.
- Instalar a extensão do zero em um perfil limpo.
- Executar smoke test em cinco sites diferentes.
- Validar ZIPs em Chrome e Edge.
- Conferir ícones, versão, nomes e arquivos distribuídos.
- Criar backup imutável da versão entregue.
- Preparar demonstração curta e roteiro comercial.
- Registrar problemas conhecidos e plano de suporte.

Critério de aceite: RC1 aprovada na instalação limpa e nos smoke tests.

## Matriz mínima de testes

| Categoria | Alvo sugerido | Página única | 3 subpáginas | CSS | Imagens | Navegação | Resultado |
|---|---|---:|---:|---:|---:|---:|---|
| E-commerce | KaBuM | ☐ | ☐ | ☐ | ☐ | ☐ | Pendente |
| E-commerce | Terabyte | ☐ | ☐ | ☐ | ☐ | ☐ | Pendente |
| Marketplace | Mercado Livre | ☐ | ☐ | ☐ | ☐ | ☐ | Pendente |
| Marketplace | Amazon | ☐ | ☐ | ☐ | ☐ | ☐ | Pendente |
| Marketplace | Shopee | ☐ | ☐ | ☐ | ☐ | ☐ | Pendente |
| Aplicação | Google Play | ☐ | ☐ | ☐ | ☐ | ☐ | Pendente |
| Conteúdo | Blog ou notícia | ☐ | ☐ | ☐ | ☐ | ☐ | Pendente |
| Institucional | Site simples | ☐ | ☐ | ☐ | ☐ | ☐ | Pendente |

## Severidade de falhas

- **Crítica:** não gera ZIP, extensão trava, captura dados sensíveis ou todas as páginas ficam inutilizáveis.
- **Alta:** HTML abre, mas conteúdo principal, CSS, imagens ou navegação estão ausentes.
- **Média:** componente secundário, fonte, vídeo ou parte do layout está incorreto.
- **Baixa:** diferença estética pequena ou recurso opcional ausente.

Uma versão candidata não pode ter falhas críticas abertas. Falhas altas precisam ser corrigidas ou documentadas como incompatibilidade conhecida.

## Pacote de entrega

- pasta limpa da extensão;
- ZIP versionado da versão comercial;
- README de instalação e uso;
- changelog da 4.0;
- política de privacidade;
- contrato/licença revisado;
- lista de compatibilidade testada;
- lista de limitações conhecidas;
- roteiro de demonstração;
- procedimento de suporte e coleta do `clone-report.json`.

## Riscos principais

- Proteções anti-bot podem variar durante os testes.
- Sites mudam o DOM sem aviso.
- Recursos autenticados ou temporários podem expirar.
- ZIPs grandes podem exceder memória disponível.
- Prometer compatibilidade universal cria risco comercial e jurídico.

O posicionamento recomendado é: **gerador de snapshots visuais offline para conteúdo autorizado, com compatibilidade progressiva e relatório transparente**, não “cópia perfeita de qualquer sistema”.

## Regra para esta semana

Depois do Dia 4, nenhuma funcionalidade nova entra na 4.0, exceto se resolver uma falha P0. Melhorias P1 e P2 vão para a versão 4.1. Essa disciplina é necessária para chegar ao final da semana com uma entrega testada, não apenas com mais código.
