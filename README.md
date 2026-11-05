# Painel de CX — cdv

Painel estático (`index.html`) com indicadores de comparecimento, faltas, cancelamentos, indicações e mediana cirúrgica, usado pela equipe de CX para complementar apresentações de CX e identificar clínicas/especialidades que precisam de atenção.

**Abrir o painel:** basta dar duplo-clique em `index.html` — abre em qualquer navegador, sem instalar nada.

## Arquitetura

- **Arquivo único**: `index.html` — HTML + CSS + JS puro, sem build step, sem backend, sem banco de dados.
- **Uma página, seis abas**: a navegação entre "Visão geral & cancelamentos", "Comparecimento por clínica", "Mediana cirúrgica", "Indicações", "Síntese (infográfico)" e "Comparar períodos" é feita 100% em JavaScript (`switchTab()`, troca de classe `.hidden`) — não são páginas HTML separadas nem há reload. Isso existe porque as abas dividem a mesma planilha de comparecimento (ver abaixo); com páginas separadas, cada uma pedia a planilha de novo.
- Bibliotecas via CDN: [SheetJS](https://sheetjs.com/) (`xlsx.full.min.js`) para ler `.xlsx`/`.xls`/`.csv`, [Chart.js](https://www.chartjs.org/) para os gráficos das abas Visão geral/Mediana/Indicações, e [html2canvas](https://html2canvas.hertzen.com/) + [jsPDF](https://github.com/parallax/jsPDF) só para baixar o infográfico da aba Síntese em PNG/PDF. Únicas dependências externas — o painel precisa de internet na primeira carga (o navegador cacheia depois).
- **Todo o processamento acontece no navegador de quem abre a página.** Cada pessoa sobe suas próprias planilhas; nada é enviado para servidor nenhum, nada é compartilhado entre usuários.
- **Não há dado real embutido no código.** O repositório pode ficar público com segurança — os números só aparecem depois que alguém sobe a planilha, e planilhas nunca são commitadas (ver `.gitignore`, que ignora `*.xlsx`/`*.xls`/`*.csv`).

## As 6 abas e suas planilhas

Um mesmo tipo de planilha pode alimentar mais de uma aba — por isso o botão de upload correspondente aparece duplicado (mesmo `<input>`/handler, elementos diferentes) no final de cada aba que precisa dele, em vez de pedir a mesma planilha de novo.

| Aba | O que mostra | Planilha(s) |
|---|---|---|
| **Visão geral & cancelamentos** | KPIs de comparecimento/falta/aguardando, cancelamentos (total, por paciente, por clínica), comparecimento por tipo de agendamento, ranking de comparecimento por especialidade, evolução mensal de recuperação pós-cancelamento | Comparecimento (compartilhada) + cancelamentos por motivo + recuperação pós-cancelamento |
| **Comparecimento por clínica** | Comparecimento por clínica/especialidade/região — a aba original do painel, mantida como estava | Comparecimento (compartilhada) |
| **Mediana cirúrgica** | Dias entre consulta e 1ª cirurgia, por clínica/especialidade/trimestre, com destaques e metas | Mediana cirúrgica (própria, não compartilhada) |
| **Indicações** | Comparecimento por origem/campanha + evolução mensal de indicação em consultas e em cirurgias | Comparecimento (compartilhada) + evolução de indicação em consultas + evolução de indicação em cirurgias |
| **Síntese (infográfico)** | Uma página só que junta o essencial das outras 4 abas em formato de infográfico, com botões **Baixar PNG** / **Baixar PDF** | Nenhuma própria — usa o que já foi carregado nas outras abas (ver "Aba Síntese" abaixo) |
| **Comparar períodos** | Até 6 períodos lado a lado (indicadores, especialidade, tipo, clínica, cancelamentos, tombamento, mediana) | Arquivos JSON salvos na aba Síntese (ver "Comparar períodos" abaixo) |

### Planilha de comparecimento (compartilhada)

Exportação por atendimento (uma linha por consulta agendada). Colunas usadas (`HEADER_ALIASES_COMPARECIMENTO`): `Clínica`, `Especialidade`, `Status da consulta`, `Tipo de agendamento`, `Campanha`, e — só para o formato consolidado — `Agendamentos`/`Quantidade de Faltas`. É lida **uma vez só** (`handleComparecimentoFile()`) e alimenta as 3 abas que usam essa base: cada aba tem sua própria função de agregação (`aggregateClinicaEspecialidade`, `aggregateTipoAgendamento`, `aggregateEspecialidade`, `aggregateCampanha`) que roda sobre o mesmo array de linhas já canonicalizadas.

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
- **`SPEC_ALIASES`**: "Refrativa" e "Consulta Refrativa" contam como a mesma especialidade em TODAS as abas (aplicado em `normSpecName()`, somadas antes de qualquer cálculo; na Mediana, se a mesma clínica tiver as duas no mesmo trimestre, vale a média dos dois valores já calculados). Novo caso parecido → confirmar com o usuário antes de adicionar ao alias, não presumir.
- **Ranking de comparecimento por especialidade (aba Visão geral)**: Catarata, Refrativa, Retina e Blefaroplastia (as "primárias") **sempre aparecem**; qualquer outra especialidade encontrada na planilha vira um filtro opcional (`spec-toggle`) para adicionar ao ranking, em vez de já vir junto — pedido explícito do usuário para manter o ranking padrão enxuto.
- **Cancelado pelo paciente vs. pela clínica**: só o motivo `SOLICITAÇÃO DA CLÍNICA` conta como cancelado pela clínica; **todos os demais motivos** (erro de cadastro, não informado, reagendamento, etc.) contam como cancelado pelo paciente — regra confirmada com o usuário em 2026-08, não uma suposição.
- **"Não informado" na campanha (aba Indicações)**: destacado em vermelho de propósito (gráfico e tabela) — é um alerta de que a equipe não está preenchendo o campo Campanha no agendamento, não um valor neutro.

### Mediana cirúrgica
- **Meta de dias por especialidade**: as faixas de classificação (verde = dentro da meta, amarelo = intermediário, vermelho = crítico) ficam em `SLA_PADRAO_MEDIANA`/`SLA_BLEFAROPLASTIA_MEDIANA`. Catarata/Refrativa/Retina/secundárias: ≤14 dias ótimo, ≤21 dentro da meta, ≥41 crítico (entre os dois, intermediário). Blefaroplastia: ≤29/≤39/≥66. **Especialidades terciárias (Glaucoma, Estrabismo, Ceratocone, Córnea) não têm meta definida** — por isso ficam sem cor (`getMedianaSLA()` retorna `null`).
- ⭐ marca combinações que estão **melhor que o esperado** (dentro do primeiro degrau da meta); ⚠️ marca as **críticas**.
- **"Trimestre atual/vigente"** = o trimestre mais recente presente na planilha carregada (maior `tSort`), não o trimestre corrente do calendário. Os **destaques** e a **ordenação da lista de clínicas por especialidade** usam o valor desse trimestre — não a média histórica — porque o pedido foi ver o desempenho mais recente, não uma média que mistura trimestres antigos com o atual.
- **"Mediana geral"** ao lado do nome de cada especialidade = mediana de todos os valores (todas as clínicas, todos os trimestres carregados) daquela especialidade — não é ponderada por volume.
- Filtros de Especialidade/Clínica (populados dinamicamente pela planilha carregada) afetam destaques, gráfico geral e detalhamento por especialidade ao mesmo tempo.
- **Mesma regra de negócio das outras abas**: o detalhamento por especialidade é agrupado em primárias / secundárias / terciárias / outras (`TIERS`), na mesma ordem da aba Comparecimento por clínica.

### Indicações
- **Indicador do topo** (`indicacaoTrimestres()`/`renderIndKpi()`): média simples do % de indicação em consultas dos **3 últimos meses da planilha** de evolução (o mês mais recente que ela tem, não o do calendário), comparada com a média dos **3 meses imediatamente anteriores** (▲/▼ em p.p.). Meses reconhecidos em `2026/10`, `2026-10`, `10/2026` ou `out. de 2026`; janela por calendário, então mês faltando não desloca o período — se houver menos de 3 meses em algum dos períodos, usa os disponíveis e avisa. Antes era o consolidado de toda a planilha de comparecimento (124 de 792); essa conta saiu da tela. O slide de síntese usa a mesma regra.
- "Indicação" (KPI e evolução) reúne as campanhas `INDICAÇÃO` e `INDICAÇÃO - CARTÃO DE DESCONTO`.
- Os dois gráficos de evolução mensal (indicação em consultas / em cirurgias) são combos coluna + linha: colunas = número bruto no eixo esquerdo, linha = % de indicação no eixo direito — os dois números já vêm prontos na planilha de origem, o painel só exibe.
- Tooltip em modo `index`: passar o mouse em qualquer ponto do mês (coluna ou área acima dela) já mostra o **% e a quantidade** daquele mês, sem precisar acertar a linha de tendência.
- A tabela de dados abaixo de cada gráfico da aba (origem, consultas, cirurgias) fica **recolhida por padrão** ("Ver tabela de dados"); no PDF de uma aba sai como está na tela, no relatório completo sai sempre expandida.

### Geral
- **Filtros sempre de múltipla seleção**: qualquer filtro novo deve usar `createMultiSelect()` (dropdown com caixas de marcação e busca); nada marcado = todas. O dashboard inteiro acompanha o filtro, e o PDF traz um aviso "Filtros aplicados" quando há filtro ativo. (Os botões-chip de especialidades extras na Visão geral já eram multi-seleção.)
- **Percentuais**: sempre 1 casa decimal, formatação `pt-BR` (`fmtPct()`) — usado tanto nas tabelas quanto nos eixos/tooltips dos gráficos, para não ter números com casas decimais demais num eixo.
- **Listas de clínica recolhíveis**: cada card de especialidade (Comparecimento por clínica e Mediana) tem um botão de recolher/expandir individual, mais um "recolher todas / expandir todas" por aba. Estado de recolhido é mantido em memória (`collapsedSpecsComparecimento`/`collapsedSpecsMediana`) e reaplicado a cada re-render — não persiste entre uploads novos.
  - ⚠️ **Não usar `JSON.stringify(valor)` cru dentro de um atributo `onclick="..."` com aspas duplas** — o valor serializado também vem entre aspas duplas e fecha o atributo antes da hora, quebrando o HTML silenciosamente (só falha no clique real, não em teste que chama a função direto). Sempre envolver com `escapeHtml(JSON.stringify(valor))`. Bug real, já corrigido — não reintroduzir.

## Aba Síntese (infográfico)

Página própria (`#tabSintese`, `renderInfographic()`) pensada para quem **não conhece o relatório**: lê de cima para baixo e sabe como estamos e o que fazer. Redesenhada a cada vez que a aba é aberta, a partir dos dados já carregados; cada bloco só aparece se a planilha dele foi carregada (a faixa no topo lista o que falta carregar, fora do PNG/PDF).

**Cabeçalho**: título "Relatório de comparecimento" + período filtrado = menor e maior **"Data da consulta"** da planilha de comparecimento (`comparecimentoPeriodo()`; aceita `dd/mm/aaaa`, `aaaa-mm-dd` e data serial do Excel). Sem a coluna/datas reconhecidas, o período não aparece e a faixa acima do infográfico avisa. O PNG/PDF baixa como `relatorio-comparecimento-AAAA-MM-DD`.

Ordem do infográfico: cabeçalho → 4 cartões de números-chave (comparecimento, cancelamentos, mediana, indicação) → **semáforo** (pontos positivos / de atenção / negativos) → 4 blocos com gráficos, cada um com título em forma de pergunta e uma frase de leitura em linguagem simples ("Os pacientes estão vindo às consultas?", "Quantos cancelam e por quê?", "Quanto tempo até a cirurgia?", "De onde vêm os pacientes?") → **"O que fazer agora"** (única parte em texto corrido) → rodapé com a legenda das cores.

- **Nenhum critério novo de cor/meta**: usa as mesmas réguas do painel (`statusOf()`: verde ≥70%, amarelo 60–69%, vermelho <60%; `classifyMedianaSLA()` para a mediana; `indicacaoTrimestres()` para indicação; "alto volume" = `HIGH_VOLUME_MIN`). O semáforo reaproveita as mesmas frases do slide de síntese (`summaryVisaoGeral/Comparecimento/Mediana/Indicacoes`), sem as linhas de "Melhores/Piores/Mais lentas…" porque esses rankings já aparecem nos gráficos.
- **Cores dos cartões do topo**: Comparecimento segue o status (verde/amarelo/vermelho); **Cancelamentos fica sempre na paleta negativa (vermelho)**; **Mediana e Indicação ficam em cor neutra** e só o comparativo (chip "+x vs. período anterior") é colorido — vermelho quando piora, verde quando melhora. O cartão da Mediana se chama "Mediana geral das especialidades" (ou "...do filtro" quando há filtro na aba Mediana).
- **Cancelamentos na paleta negativa** (vermelho, nada de azul — não é um número "bom"): rosquinha e barras de motivo em tons de vermelho. Cancelado pela clínica (motivo `SOLICITAÇÃO DA CLÍNICA`) aparece como **"tombados pela clínica"** nos textos do infográfico e do slide.
- **Faixas de cor da recuperação pós-cancelamento** (`REC_CONV`/`REC_PERD`, definidas pelo usuário em 2026-11): **reagendados e convertidos** <50% vermelho · 50–69,9% laranja · ≥70% verde; **perdidos** (quanto menor, melhor) <40% verde · 40–59,9% laranja · ≥60% vermelho. Valem nas rosquinhas, na frase do semáforo e na ação. ⚠️ Em um print o usuário falou de "60% / 61–70% / >70%" para a conversão; usei as faixas do print mais detalhado (50/70). Confirmar se for para mudar.
- **Cor do número da mediana** = faixa da meta de dias (`classifyMedianaSLA`): verde dentro da meta, laranja intermediário, vermelho crítico. Como a meta é por especialidade e a mediana geral mistura várias, usa-se a faixa padrão (Catarata/Refrativa/Retina…); só a da Blefaroplastia quando ela é a única especialidade na conta; sem meta (só terciárias) fica neutro. O cartão em si continua neutro e o comparativo colorido.
- **Mediana — detalhes**: o número grande da seção e o número de cada trimestre (acima das colunas) usam a mesma cor de meta; as listas "Menor/Maior tempo até a cirurgia" são **top 5** e usam o mesmo formato das listas de comparecimento (especialidade em destaque, clínica embaixo, cor pela faixa da meta de cada combinação; terciárias sem meta ficam neutras).
- **Teste de vazamento** (refazer ao mexer no layout do infográfico): carregar dados com nomes de clínica/motivo muito longos, todas as especialidades extras marcadas e números grandes, e conferir por script que nenhum elemento passa da borda do próprio cartão, que não há texto cortado (`scrollWidth > clientWidth`) e que o número cabe dentro das rosquinhas.
- **Cartão de comparecimento** traz, como na Visão geral, o cenário dos "aguardando retorno": "se todos comparecerem sobe para X / se todos faltarem cai para Y".
- **Layout**: as colunas do infográfico usam `min-width:0` (sem isso uma coluna `1fr` com texto sem quebra vaza da página); rótulos longos de barra cabem em uma linha (coluna de 260px) e, se passarem, quebram. Nome da clínica nas listas top 5 em fonte maior e cor escura.
- **Títulos das seções** (definidos pelo usuário): "Comparecimento por especialidade e tipo de agendamento", "Principais motivos de cancelamento", "Tempo entre a consulta e a cirurgia (mediana cirúrgica)", "Indicações e campanhas - de onde os pacientes conheceram a Central" e "Tomadas de ações" (antes "O que fazer agora").
- **Benchmark só com volume**: qualquer ranking de clínicas ou especialidades (barras por especialidade/tipo de agendamento, listas top 5, clínicas que mais puxam as faltas, "benchmark" do semáforo) considera **apenas quem tem 10 ou mais consultas** (`HIGH_VOLUME_MIN`; compareceram + faltaram + aguardando). Não vale para a mediana, que não traz volume na planilha. Os indicadores positivos usam a palavra **"benchmark"** (ex.: "Benchmark de comparecimento", "Benchmark em especialidade") no lugar de "melhor/maior".
- **Redação objetiva**: nada de adjetivos subjetivos ("melhor", "pior", "bom", "ruim", "atacar") nos textos do infográfico e do slide — usar "melhor desempenho em…", "maior/menor comparecimento", "principais pontos de atenção", faixas numéricas ("70% ou mais"). Vale para qualquer frase nova.
- **Números de cenário e variação coloridos** (`iRich()`): em "pode ficar entre X e Y" o menor (queda) fica em vermelho e o maior em verde; variações "+x p.p." em verde e "−x p.p." em vermelho. Replicar em qualquer texto novo com faixa ou comparativo.
- **Asteriscos e notas de rodapé no semáforo**: frases que falam de "N combinações" ganham `*1`, `*2`… e a lista de quais são (com o %/dias) vai numa nota de rodapé embaixo do semáforo (máx. 12 por nota). As listas vêm de `o.notes`, devolvido por `summaryComparecimento()`/`summaryMediana()` (o slide antigo ignora).
- **Especialidades no bloco de comparecimento**: o gráfico "Por especialidade" mostra as primárias e aceita incluir outras pelo filtro de chips acima do infográfico (fora do PNG/PDF) — é o **mesmo estado** (`especialidadeExtraSelected`) do ranking da Visão geral. As listas **top 5** ("Maiores comparecimentos" e "Principais pontos de atenção", com a especialidade em destaque) usam só as primárias + as extras marcadas, em alto volume quando houver; a barra empilhada e o semáforo continuam sobre todas as especialidades.
- **Mediana respeita os filtros da aba Mediana** (Especialidade/Clínica), inclusive nas frases do semáforo e no slide de síntese (`summaryMediana()` usa `getFilteredMedianaRecords()`).
- **"O que fazer agora" (reformulado em 2026-11)**: **5 ações principais** (cartão completo) + **5 secundárias** (compactas), sem passar de 10. Cada ação tem tema, responsável (**CX** investiga o que já aconteceu — consultas passadas ou agendadas; **CS** atua na recepção antes do agendamento, então recebe a nota "Para o CS" com o perfil/qualidade de agendamento a observar), gravidade, o porquê (com os números), **curto prazo** e **médio prazo** (sem campos de prazo/responsável nominal: a complexidade define o horizonte). Ordem: gravidade (Crítica > Alta > Média > Baixa) e, no empate, maior impacto. Regras (definidas pelo usuário):
  - **Faltas**: identificar os principais motivos e **quais clínicas puxam o total para baixo** — medido em faltas acima do que haveria com 70% de comparecimento (`excess = faltas − 0,3 × consultas com desfecho`) e em quantos p.p. o geral subiria se a clínica chegasse a 70%. Médio prazo: evitar agendar na região/clínica ou investigar o perfil dos leads. Gravidade = a pior entre a faixa geral e a da clínica que mais pesa.
  - **Tombamento de agenda**: aceitável até **3% por clínica** (`TOMBAMENTO_MAX`); acima disso → ligar para a gestão das agendas dos médicos. ⚠️ Premissa a confirmar: % = tombados ÷ cancelamentos **da própria clínica** (mesma definição do % geral do painel), só para clínicas com ≥10 cancelamentos (`TOMBAMENTO_MIN_CANC`, evita 1 caso virar 10%).
  - **Mediana crítica** (paciente esperando para operar + receita represada para a clínica e a CDV): foco nas especialidades **primárias**; críticas das demais viram ação secundária ("se prejudicarem algum resultado, entram na conta").
  - **Indicação**: sinalização para as duas equipes, principalmente os pacientes em branco/sem tabulação no Farol ("Não informado").
  - **Variação (mediana geral, indicação em consultas e em cirurgias)**: piora **relativa** ao período anterior — ≥5% = atenção (Média), ≥10% = ruim (Alta), >15% = crítica. Melhora = ponto positivo. Vale também para os buckets do semáforo e do slide (`varBucket`). Comparecimento segue as faixas de 70% / 60% (não há meta numérica definida para este relatório; indicação e mediana são indicativos, "quanto melhor, melhor").
  - Os textos de "curto prazo", "médio prazo" e "Para o CS" de cada ação são **rascunho meu** a partir da explicação do usuário — revisar/ajustar a redação e registrar aqui o que mudar.
- (histórico) A versão anterior da seção gerava só frases soltas por regra a partir dos mesmos buckets: o que está vermelho/negativo vira **prioridade alta**, o que está amarelo/atenção vira **prioridade média**; máx. 6 ações, alta primeiro. Ex.: combinações de clínica/especialidade abaixo de 60%, cancelamentos por solicitação da clínica, combinações de mediana críticas, queda de indicação, "Não informado" ≥ 10% no campo Campanha. ⚠️ O texto de cada ação é novo — qualquer ação/regra nova (ou mudança de prioridade) deve ser confirmada com o usuário antes e registrada aqui.
- **Visual**: paleta cdv do slide de síntese (navy `#203B5A`, azul `#3874AF`, ciano `#00A4D0`, verde/amarelo/vermelho semânticos), Figtree, sem emoji, sentence case, laranja só para CTA. É igual no modo claro e escuro (o que se vê é o que se baixa).
- **Como é feito**: largura fixa de 1120px (`INFO_W`); na tela é escalado para caber (`fitInfographic()`), no download volta a 100%. Gráficos = formas em SVG (rosquinhas via `stroke-dasharray`) + texto/barras em HTML — **não usar `<text>` dentro de SVG nem `conic-gradient`/`clip-path`**, o html2canvas não renderiza fonte web dentro de SVG e não suporta os outros dois.
- **Download** (`downloadInfographic('png'|'pdf')`): `html2canvas` em escala 2 (PNG ~2–3 MB). O PDF é **uma página única** do tamanho do infográfico (jsPDF com a imagem), não paginado — diferente do relatório completo, que continua usando `window.print()`. Os botões ficam desabilitados enquanto nenhuma planilha foi carregada, e os botões de PDF do topo somem nessa aba (`body.on-sintese`).
- ⚠️ A classe CSS do infográfico é `.infog` (não `.info`): `.info` já é a variante azul do aviso de upload (`.banner.info`) e deformava o banner.
- O "Exportar só a síntese" / último slide do relatório completo (slide 16:9 em texto, `buildSummaryHtml()`) continua existindo, sem mudanças.

## Comparar períodos (aba 6)

Compara de **1 a 6 períodos** lado a lado (`CMP_MAX`), sem precisar recarregar as 6 planilhas de cada mês. Funciona em dois passos:

1. **Salvar** — na aba Síntese: **"Salvar dados do período (JSON)"** (`saveSnapshot('json')`, arquivo `relatorio-cx-AAAA-MM-DD_AAAA-MM-DD.json`) e, opcionalmente, **"Tabela do período (Excel)"** (tabela longa: Período · Indicador · Recorte · Valor · Unidade, mais uma aba "Informações"; serve só para conferir, a aba de comparação não lê Excel).
2. **Comparar** — na aba "Comparar períodos", carregar os JSON (vários de uma vez).

**O arquivo de dados** (`buildSnapshot()`, `SNAP_SCHEMA = 1`) guarda só números agregados (nada de paciente): comparecimento geral/por especialidade/tipo/clínica, origem (campanha), cancelamentos (total, motivos, tombados por clínica), recuperação, mediana (geral, por trimestre, por especialidade, combinações) e indicação. É sempre **completo e sem filtros de tela** (filtros só ficam anotados em `anotacoes`), para dois períodos nunca serem comparados com recortes diferentes. ⚠️ Mudou a estrutura do arquivo? Aumentar `SNAP_SCHEMA` e tratar em `cmpValidate()`. O `.gitignore` ignora `relatorio-cx-*.json` (têm números por clínica).

**Proteções contra misturar dados**: o período e o rótulo (ex.: "out/26") vêm de **dentro** do arquivo (menor/maior "Data da consulta"), não do nome; ordem cronológica automática; arquivo repetido (mesmo período ou mesmo `geradoEm`), JSON inválido, arquivo de outro painel ou de outra versão e o 7º arquivo são **recusados com aviso**; períodos sobrepostos, sem data ou sem alguma planilha geram aviso, e o indicador ausente aparece como "—" (nunca como zero). Sem coluna "Data da consulta", o botão pede um nome para o período.

**O que aparece**: resumo "O que mudou" (dois últimos períodos: indicadores com piora/melhora de 5% ou mais, clínicas com maiores quedas/altas, clínicas que cruzaram os 3% de tombamento), indicadores gerais, comparecimento por especialidade / tipo de agendamento / clínica (ordenável), motivos de cancelamento, tombamento por clínica e mediana por especialidade. Regras: **10+ consultas** no período para entrar em ranking (senão "—"); cores do comparecimento, recuperação e mediana pelas faixas já definidas; **variação pela regra de piora relativa 5/10/15%** (atenção/ruim/crítica; melhora em verde); consultas e faltas ficam sem cor porque dependem do volume.
- Limitações: só compara períodos já salvos (para um mês antigo, carregar as planilhas dele e salvar); a comparação não é exportada em PNG/PDF (o botão "Exportar esta aba" imprime a tela); os arquivos ficam com o usuário, nada é guardado no navegador.

## Exportação em PDF

Dois botões no topo, ao lado do título — ambos usam `window.print()` (o usuário escolhe "Salvar como PDF" como destino; nenhuma biblioteca tipo jsPDF nesses botões, de propósito; o jsPDF só é usado no download do infográfico da aba Síntese):

- **Exportar esta aba**: imprime só a aba aberta, como está na tela.
- **Exportar relatório completo** (`exportAllPdf()`): todas as abas que já têm dado, de uma vez. `prepareExportAll()` mostra as abas, expande listas/tabelas recolhidas, esconde seções vazias e redimensiona os gráficos; `endExportAll()` (no `afterprint`) devolve a tela ao estado anterior. Cada aba e cada seção começam numa página nova.
- **Slide de síntese** (`buildSummaryHtml()`): última página do relatório completo, um slide 16:9 com 4 colunas (uma por aba) × 3 blocos: Destaques / Pontos de atenção / Pontos negativos, máx. 3 frases por bloco, calculadas dos dados carregados (`summaryVisaoGeral/Comparecimento/Mediana/Indicacoes`). Usa as mesmas réguas do painel (verde ≥70%, amarelo 60–69%, vermelho <60%; SLA de mediana no trimestre mais recente). Aba sem planilha não gera coluna. Visual: cabeçalho com gradiente azul→ciano e a marca "cdv" em texto (sem logo embutido), navy `#203B5A`, cartões de 16px com sombra navy-alpha, tons semânticos de sucesso/atenção/perigo, fonte Figtree (Google Fonts). Regras visuais a manter: sem emoji nem símbolos como ícone, sentence case, laranja `#F9623E` só para CTA (nunca para "ruim"). Só o slide de síntese usa esse visual; o resto do painel mantém a paleta própria dele. Botão **Exportar só a síntese** gera apenas essa página. Qualquer critério de "destaque/atenção/negativo" novo deve ser confirmado com o usuário.
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
