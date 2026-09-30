# Painel de CX — Central da Visão

Painel estático (`index.html`) com indicadores de comparecimento, faltas, cancelamentos, indicações e mediana cirúrgica, usado pela equipe da Central da Visão para complementar apresentações de CX e identificar clínicas/especialidades que precisam de atenção.

**Abrir o painel:** basta dar duplo-clique em `index.html` — abre em qualquer navegador, sem instalar nada.

## Arquitetura

- **Arquivo único**: `index.html` — HTML + CSS + JS puro, sem build step, sem backend, sem banco de dados.
- **Uma página, quatro abas**: a navegação entre "Visão geral & cancelamentos", "Comparecimento por clínica", "Mediana cirúrgica" e "Indicações" é feita 100% em JavaScript (`switchTab()`, troca de classe `.hidden`) — não são páginas HTML separadas nem há reload. Isso existe porque as abas dividem a mesma planilha de comparecimento (ver abaixo); com páginas separadas, cada uma pedia a planilha de novo.
- Bibliotecas via CDN: [SheetJS](https://sheetjs.com/) (`xlsx.full.min.js`) para ler `.xlsx`/`.xls`/`.csv`, e [Chart.js](https://www.chartjs.org/) para os gráficos das abas Visão geral/Mediana/Indicações. Únicas dependências externas — o painel precisa de internet na primeira carga (o navegador cacheia depois).
- **Todo o processamento acontece no navegador de quem abre a página.** Cada pessoa sobe suas próprias planilhas; nada é enviado para servidor nenhum, nada é compartilhado entre usuários.
- **Não há dado real embutido no código.** O repositório pode ficar público com segurança — os números só aparecem depois que alguém sobe a planilha, e planilhas nunca são commitadas (ver `.gitignore`, que ignora `*.xlsx`/`*.xls`/`*.csv`).

## As 4 abas e suas planilhas

Um mesmo tipo de planilha pode alimentar mais de uma aba — por isso o botão de upload correspondente aparece duplicado (mesmo `<input>`/handler, elementos diferentes) no final de cada aba que precisa dele, em vez de pedir a mesma planilha de novo.

| Aba | O que mostra | Planilha(s) |
|---|---|---|
| **Visão geral & cancelamentos** | KPIs de comparecimento/falta/aguardando, cancelamentos (total, por paciente, por clínica), comparecimento por tipo de agendamento, ranking de comparecimento por especialidade, evolução mensal de recuperação pós-cancelamento | Comparecimento (compartilhada) + cancelamentos por motivo + recuperação pós-cancelamento |
| **Comparecimento por clínica** | Comparecimento por clínica/especialidade/região — a aba original do painel, mantida como estava | Comparecimento (compartilhada) |
| **Mediana cirúrgica** | Dias entre consulta e 1ª cirurgia, por clínica/especialidade/trimestre, com destaques e metas | Mediana cirúrgica (própria, não compartilhada) |
| **Indicações** | Comparecimento por origem/campanha + evolução mensal de indicação em consultas e em cirurgias | Comparecimento (compartilhada) + evolução de indicação em consultas + evolução de indicação em cirurgias |

### Planilha de comparecimento (compartilhada)

Exportação por atendimento do Farol/Metabase (uma linha por agendamento). Colunas usadas (`HEADER_ALIASES_COMPARECIMENTO`): `Clínica`, `Especialidade`, `Status da consulta`, `Tipo de agendamento`, `Campanha`, e — só para o formato consolidado — `Agendamentos`/`Quantidade de Faltas`. É lida **uma vez só** (`handleComparecimentoFile()`) e alimenta as 3 abas que usam essa base: cada aba tem sua própria função de agregação (`aggregateClinicaEspecialidade`, `aggregateTipoAgendamento`, `aggregateEspecialidade`, `aggregateCampanha`) que roda sobre o mesmo array de linhas já canonicalizadas.

Aceita dois formatos, iguais aos da versão original do painel — ver a seção seguinte.

## Formatos aceitos pela planilha de comparecimento

Detectados automaticamente pelas colunas presentes:

### 1. Formato consolidado (relatório já agrupado por clínica/especialidade)

Colunas esperadas: `Clínica`, `Especialidade`, `Agendamentos`, `Quantidade de Faltas`. Só alimenta a aba "Comparecimento por clínica" — sem `Status da consulta`/`Tipo de agendamento`/`Campanha` por linha, as demais abas não têm o que calcular a partir dele.

### 2. Formato bruto (uma linha por atendimento)

Colunas esperadas: `Clínica`, `Especialidade`, `Status da consulta`. `Tipo de agendamento` e `Campanha` são opcionais — sem elas, os gráficos que dependem delas (tipo de agendamento na Visão geral, campanha em Indicações) ficam vazios, mas o resto do painel funciona normalmente.

Cada linha é classificada pelo campo de status (`classifyStatus()`, case/acento-insensível):

| Status contém | Classificação | Conta em quê |
|---|---|---|
| `NÃO COMPARECEU` | faltou | soma 1 agendamento **e** 1 falta |
| `FALT` (`FALTOU`, `FALTA`, etc.) | faltou | soma 1 agendamento **e** 1 falta |
| `AGUARDANDO` (retorno/confirmação) | pendente | **não entra no cálculo** — resultado ainda não é conhecido |
| `COMPARECEU` | compareceu | soma 1 agendamento |
| qualquer outro valor | não classificado | **não entra no cálculo** |

⚠️ **Ordem importa em `classifyStatus()`**: `NÃO COMPARECEU` contém a palavra "compareceu" como substring, então o teste de negação/falta tem que vir **antes** do teste de "compareceu" — senão todo "não compareceu" é lido como comparecimento (bug real, corrigido em 2026-08). Não reordenar essas checagens.

**Se aparecer um novo formato de planilha (qualquer aba)**: adicionar as novas variações de nome de coluna no `HEADER_ALIASES_*` correspondente, em vez de espalhar `.includes()` novo em cada função.

## Regras de negócio importantes (não óbvias pelo código)

### Comparecimento por clínica (e Visão geral / Indicações, que reaproveitam a mesma base)
- **Vocabulário**: o painel fala em **consultas** (já aconteceram), não "agendamentos". **Consultas = compareceram + faltaram + aguardando retorno**. Cada linha de clínica mostra "N consultas — X compareceram · Y faltaram · Z aguardando retorno".
- **Fórmula de comparecimento**: `compareceram / (compareceram + faltaram)`. Aguardando retorno e status não-classificados ficam fora do denominador do % (os cenários ▲▼ mostram o efeito dos aguardando).
- **Cores** (`statusOf()`): comparecimento **≥ 70%** = bom (verde); **60–69%** = ponto de atenção (amarelo); **< 60%** = ruim (vermelho). Mesma régua usada no ranking de comparecimento por especialidade da aba Visão geral.
- **Destaque "Alto volume"** (`HIGH_VOLUME_MIN = 10`): toda combinação clínica/especialidade com **10 ou mais consultas** (a soma dos três: compareceram + faltaram + aguardando retorno, não só comparecimento) no período recebe uma borda mais grossa e um selo "Alto volume" — independente da cor/status. Regra confirmada com o usuário em 2026-09 (antes era "mais de 10" só sobre compareceram + faltaram).
- **Especialidades primárias/secundárias/terciárias** (`TIERS`): Primárias = Catarata, **Catarata - mobilização saúde ocular**, Refrativa, Blefaroplastia, Retina ("mobilização" é especialidade própria, NÃO soma em Catarata; `normSpecName()` reconhece variações de grafia/acento); Secundárias = Capsulotomia, Calázio, Pterígio, Consulta Oftalmológica; Terciárias = Glaucoma, Estrabismo, Ceratocone, Córnea. Especialidade fora dessas listas cai num bloco "Outras especialidades" — nunca é descartada silenciosamente.
- **`SPEC_ALIASES`**: "Refrativa" e "Consulta Refrativa" contam como a mesma especialidade (somadas antes de qualquer cálculo). Novo caso parecido → confirmar com o usuário antes de adicionar ao alias, não presumir.
- **Ranking de comparecimento por especialidade (aba Visão geral)**: Catarata, Refrativa, Retina e Blefaroplastia (as "primárias") **sempre aparecem**; qualquer outra especialidade encontrada na planilha vira um filtro opcional (`spec-toggle`) para adicionar ao ranking, em vez de já vir junto — pedido explícito do usuário para manter o ranking padrão enxuto.
- **Cancelado pelo paciente vs. pela clínica**: só o motivo `SOLICITAÇÃO DA CLÍNICA` conta como cancelado pela clínica; **todos os demais motivos** (erro de cadastro, não informado, reagendamento, etc.) contam como cancelado pelo paciente — regra confirmada com o usuário em 2026-08, não uma suposição.
- **"Não informado" na campanha (aba Indicações)**: destacado em vermelho de propósito (gráfico e tabela) — é um alerta de que a equipe não está preenchendo o campo Campanha no agendamento, não um valor neutro.

### Mediana cirúrgica
- **Meta de dias por especialidade reaproveitada de outro painel**: as faixas de classificação (verde = dentro da meta, amarelo = intermediário, vermelho = crítico) usam a mesma régua de SLA já validada no painel "dashboard de pós consulta e NPS" (`SPECIALTY_RULES`/`SLA_PADRAO` naquele projeto), a pedido do usuário — em vez de inventar um número novo. Catarata/Refrativa/Retina/secundárias: ≤14 dias ótimo, ≤21 dentro da meta, ≥41 crítico (entre os dois, intermediário). Blefaroplastia: ≤29/≤39/≥66. **Especialidades terciárias (Glaucoma, Estrabismo, Ceratocone, Córnea) não têm meta definida** nesse painel de referência — por isso ficam sem cor aqui também (`getMedianaSLA()` retorna `null`). Se a régua de outra especialidade mudar lá, replicar aqui manualmente — não há integração entre os dois projetos.
- ⭐ marca combinações que estão **melhor que o esperado** (dentro do primeiro degrau da meta); ⚠️ marca as **críticas**.
- **"Trimestre atual/vigente"** = o trimestre mais recente presente na planilha carregada (maior `tSort`), não o trimestre corrente do calendário. Os **destaques** e a **ordenação da lista de clínicas por especialidade** usam o valor desse trimestre — não a média histórica — porque o pedido foi ver o desempenho mais recente, não uma média que mistura trimestres antigos com o atual.
- **"Mediana geral"** ao lado do nome de cada especialidade = mediana de todos os valores (todas as clínicas, todos os trimestres carregados) daquela especialidade — não é ponderada por volume.
- Filtros de Especialidade/Clínica (populados dinamicamente pela planilha carregada) afetam destaques, gráfico geral e detalhamento por especialidade ao mesmo tempo.
- **Mesma regra de negócio das outras abas**: o detalhamento por especialidade é agrupado em primárias / secundárias / terciárias / outras (`TIERS`), na mesma ordem da aba Comparecimento por clínica.

### Indicações
- "Indicação" (KPI e evolução) reúne as campanhas `INDICAÇÃO` e `INDICAÇÃO - CARTÃO DE DESCONTO`.
- Os dois gráficos de evolução mensal (indicação em consultas / em cirurgias) são combos coluna + linha: colunas = número bruto no eixo esquerdo, linha = % de indicação no eixo direito — os dois números já vêm prontos na planilha de origem, o painel só exibe.
- Tooltip em modo `index`: passar o mouse em qualquer ponto do mês (coluna ou área acima dela) já mostra o **% e a quantidade** daquele mês, sem precisar acertar a linha de tendência.
- A tabela de dados abaixo de cada gráfico da aba (origem, consultas, cirurgias) fica **recolhida por padrão** ("Ver tabela de dados"); no PDF de uma aba sai como está na tela, no relatório completo sai sempre expandida.

### Geral
- **Filtros sempre de múltipla seleção**: qualquer filtro novo deve usar `createMultiSelect()` (dropdown com caixas de marcação e busca); nada marcado = todas. O dashboard inteiro acompanha o filtro, e o PDF traz um aviso "Filtros aplicados" quando há filtro ativo. (Os botões-chip de especialidades extras na Visão geral já eram multi-seleção.)
- **Percentuais**: sempre 1 casa decimal, formatação `pt-BR` (`fmtPct()`) — usado tanto nas tabelas quanto nos eixos/tooltips dos gráficos, para não ter números com casas decimais demais num eixo.
- **Listas de clínica recolhíveis**: cada card de especialidade (Comparecimento por clínica e Mediana) tem um botão de recolher/expandir individual, mais um "recolher todas / expandir todas" por aba. Estado de recolhido é mantido em memória (`collapsedSpecsComparecimento`/`collapsedSpecsMediana`) e reaplicado a cada re-render — não persiste entre uploads novos.
  - ⚠️ **Não usar `JSON.stringify(valor)` cru dentro de um atributo `onclick="..."` com aspas duplas** — o valor serializado também vem entre aspas duplas e fecha o atributo antes da hora, quebrando o HTML silenciosamente (só falha no clique real, não em teste que chama a função direto). Sempre envolver com `escapeHtml(JSON.stringify(valor))`. Bug real, já corrigido — não reintroduzir.

## Exportação em PDF

Dois botões no topo, ao lado do título — ambos usam `window.print()` (o usuário escolhe "Salvar como PDF" como destino; nenhuma biblioteca tipo jsPDF, de propósito):

- **Exportar esta aba**: imprime só a aba aberta, como está na tela.
- **Exportar relatório completo** (`exportAllPdf()`): todas as abas que já têm dado, de uma vez. `prepareExportAll()` mostra as abas, expande listas/tabelas recolhidas, esconde seções vazias e redimensiona os gráficos; `endExportAll()` (no `afterprint`) devolve a tela ao estado anterior. Cada aba e cada seção começam numa página nova.
- **Slide de síntese** (`buildSummaryHtml()`): última página do relatório completo, um slide 16:9 com 4 colunas (uma por aba) × 3 blocos: Destaques / Pontos de atenção / Pontos negativos, máx. 3 frases por bloco, calculadas dos dados carregados (`summaryVisaoGeral/Comparecimento/Mediana/Indicacoes`). Usa as mesmas réguas do painel (verde ≥70%, amarelo 60–69%, vermelho <60%; SLA de mediana no trimestre mais recente). Aba sem planilha não gera coluna. Visual segue o **Design System da Central da Visão** (zip enviado pelo usuário em 2026-09): cabeçalho com gradiente azul→ciano e logo oficial branco (`assets/logo-horizontal-white.png`, embutido em base64 em `SUM_LOGO` para manter o arquivo único), navy `#203B5A`, cartões de 16px com sombra navy-alpha, tons semânticos de sucesso/atenção/perigo, fonte Figtree (substituta da Alte Haas Grotesk, ainda sem arquivos licenciados). Regras da marca a manter: sem emoji nem símbolos como ícone, sentence case, laranja `#F9623E` só para CTA (nunca para "ruim"). Só o slide de síntese usa esse visual; o resto do painel mantém a paleta própria dele. Botão **Exportar só a síntese** gera apenas essa página. Qualquer critério de "destaque/atenção/negativo" novo deve ser confirmado com o usuário.
- **Formato**: página 16:9 paisagem (`@page`, 13,33×7,5 pol = slide do PowerPoint) para o PDF já servir de apresentação. Usar sempre `@media screen` (não só `max-width`) nas regras de celular: a largura de uma página impressa ativava o layout mobile e escondia colunas.
- **Tabelas não quebram**: linhas (`.rk-row`, `tr`, `.destaque-row`) têm `break-inside:avoid`, cabeçalhos de tabela repetem em cada página, e `print-color-adjust:exact` mantém barras/heatmap coloridos. Altura dos gráficos no relatório completo é definida FORA do `@media print` (o Chart.js mede o contêiner na tela; senão o canvas invade a tabela abaixo).
- Testado gerando o PDF com Edge headless (`--print-to-pdf`) a partir de dados sintéticos e olhando cada página — refazer esse teste ao mexer no CSS de impressão.

- Todos os botões de "Carregar planilha" ficam no **final** de cada aba (não no topo) — pedido explícito para não aparecerem numa apresentação/print da parte de cima da página.
- O CSS de impressão (`@media print`) esconde tudo com `.no-print` (incluindo os cards de upload), força a paleta clara mesmo em modo escuro, evita quebra de card no meio de duas páginas, e **esconde qualquer aviso de "carregue sua planilha" ainda vazio** (`.empty-mini`, `.empty-state`) — o PDF exportado só deve mostrar o que já tem dado carregado.
- Os botões ficam desabilitados enquanto nenhuma planilha de nenhuma aba foi carregada (`updateExportAvailability()`).

## Navegação

Botão flutuante "voltar ao topo" (`#backToTop`) aparece depois de 400px de rolagem, some acima disso e fica oculto na impressão/PDF.

## Estado vazio / avisos de upload

- Antes do primeiro upload de cada planilha, a aba correspondente mostra um estado vazio explicando o que fazer — não tenta mostrar gráfico nenhum sem dado.
- Depois de cada upload, aparece uma faixa (`#uploadBanner`, compartilhada entre abas) com um resumo do que foi lido. Planilha sem coluna reconhecível gera erro explicando o que faltou — nunca falha em silêncio.

## Preferências do usuário

- Português nas interfaces e nos commits.
- Sempre confirmar antes de mudar regra de negócio (cores, tiers, aliases de especialidade, metas de SLA) sem pedido explícito — o que está documentado aqui é o que já foi combinado; qualquer ajuste novo deve ser registrado de volta neste README.
- Preferência confirmada por navegação em abas numa página só (em vez de arquivos HTML separados por página), para poder compartilhar a mesma planilha entre abas sem pedir upload duplicado.
