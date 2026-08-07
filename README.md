# Dashboard de Comparecimento — Central da Visão

Painel estático (`index.html`) para acompanhar a taxa de comparecimento por clínica parceira e por especialidade. Usado pela equipe da Central da Visão para identificar quais clínicas/especialidades têm problema de comparecimento e precisam de atenção.

**Abrir o painel:** basta dar duplo-clique em `index.html` — abre em qualquer navegador, sem instalar nada.

## Arquitetura

- **Arquivo único**: `index.html` — HTML + CSS + JS puro, sem build step, sem backend, sem banco de dados.
- Biblioteca via CDN: [SheetJS](https://sheetjs.com/) (`xlsx.full.min.js`), só para ler `.xlsx`/`.xls`/`.csv` no navegador. É a única dependência externa — por isso o painel precisa de internet na primeira carga (o navegador cacheia depois).
- **Todo o processamento acontece no navegador de quem abre a página.** Cada pessoa sobe sua própria planilha pelo botão "Carregar planilha"; nada é enviado para servidor nenhum, nada é compartilhado entre usuários.
- **Não há dado real embutido no código.** O repositório pode ficar público com segurança — os números só aparecem depois que alguém sobe a própria planilha, e a planilha nunca é commitada (ver `.gitignore`).

## Fontes de dados e formatos aceitos

O botão "Carregar planilha" aceita dois formatos, detectados automaticamente pelas colunas presentes (`processRows()` em `index.html`):

### 1. Formato consolidado (relatório já agrupado por clínica/especialidade)

Colunas esperadas: `Clínica`, `Especialidade`, `Agendamentos`, `Quantidade de Faltas` (a coluna `Média de Faltas`, se vier, é ignorada — é recalculada). Exemplo: o relatório "CX_faltas-locais mapa_Tabela" exportado do Farol/Metabase.

### 2. Formato bruto (uma linha por atendimento)

Colunas esperadas: `Clínica`/`clinicas`, `Especialidade`/`especialidades`, e uma coluna de status (`Status da consulta` ou `agendamento_status`). A coluna de data (`Data da consulta`/`agendamento_data`) é aceita mas hoje não é usada em nenhum cálculo — é só reconhecida para não sobrar como coluna "não identificada". Cobre tanto a exportação "resumida" do Farol (CSV) quanto a "completa" do Metabase (colunas em `snake_case`).

Nesse formato, cada linha é classificada pelo campo de status (`classifyStatus()`, case/acento-insensível):

| Status contém | Classificação | Conta em quê |
|---|---|---|
| `COMPARECEU` | compareceu | soma 1 agendamento |
| `FALTOU` | faltou | soma 1 agendamento **e** 1 falta |
| `AGUARDANDO` (retorno/confirmação) | pendente | **não entra no cálculo** — resultado ainda não é conhecido |
| qualquer outro valor | não classificado | **não entra no cálculo** — aparece no aviso de upload para conferência manual |

⚠️ **Por que excluir "aguardando"**: contar como falta ou como comparecimento distorceria a taxa real, já que o desfecho desses agendamentos ainda não aconteceu. Se um "outro" status aparecer com frequência (ex.: "REAGENDADO", "CANCELADO PELO PACIENTE"), é sinal de que vale adicionar uma regra nova em `classifyStatus()` — não ignorar silenciosamente.

**Se aparecer um terceiro formato de planilha no futuro**: adicionar as novas variações de nome de coluna em `HEADER_ALIASES` (mapeando para as chaves canônicas `clinica`, `especialidade`, `agendamentos`, `faltas`, `status`, `data_consulta`), em vez de espalhar `.includes()` novo em cada função.

## Regras de negócio importantes (não óbvias pelo código)

- **Fórmula de comparecimento**: `(agendamentos − faltas) / agendamentos`. No formato bruto, "agendamentos" aqui = compareceram + faltaram (pendentes e não-classificados ficam fora do denominador).
- **Cores** (`statusOf()`): comparecimento **≥ 70%** = bom (verde); **60–69%** = ponto de atenção (amarelo); **< 60%** = ruim (vermelho). Regra de negócio confirmada com o usuário em 2026-08.
- **Destaque "Alto volume"** (`HIGH_VOLUME_MIN = 10`): toda combinação clínica/especialidade com **mais de 10** agendamentos no período recebe uma borda mais grossa e um selo "Alto volume" — independente da cor/status. É pra separar sinal de ruído: uma clínica com 70% de comparecimento em 2 agendamentos pesa muito menos que uma com 70% em 50.
- **Especialidades primárias/secundárias/terciárias** (`TIERS`), nessa ordem de exibição:
  - Primárias: Catarata, Refrativa, Blefaroplastia, Retina.
  - Secundárias: Capsulotomia, Calázio, Pterígio, Consulta Oftalmológica.
  - Terciárias: Glaucoma, Estrabismo, Ceratocone, Córnea.
  - Qualquer especialidade que apareça na planilha e não esteja nessas listas cai num bloco extra **"Outras especialidades"** no final — nunca é descartada silenciosamente.
- **Ranking dentro de cada bloco de especialidade**: todas as clínicas daquela especialidade, ordenadas do melhor para o pior comparecimento (empate desempata por volume de agendamentos, maior primeiro). Especialidades nunca são misturadas entre si — cada bloco é uma lista própria.
- **`SPEC_ALIASES`**: **"Refrativa" e "Consulta Refrativa" contam como a mesma especialidade** (somadas antes de qualquer cálculo), a pedido do usuário em 2026-08 — a planilha do Farol às vezes traz as duas etiquetas para o mesmo tipo de atendimento. Se aparecer outro caso parecido (ex.: variações de campanha tipo "CATARATA - MOBILIZAÇÃO SAÚDE OCULAR"), o padrão é adicionar a variação em `SPEC_ALIASES` em vez de criar uma regra solta — mas só depois de confirmar com o usuário que de fato deve contar junto (não presumir).
- **Consolidado geral (topo do painel)**: soma de todas as clínicas e especialidades carregadas naquela sessão de upload — não é acumulado entre uploads diferentes; cada novo arquivo carregado substitui os dados anteriores.

## Exportação em PDF

Botão "Exportar PDF" chama `window.print()` — abre o diálogo de impressão do navegador, e o usuário escolhe "Salvar como PDF" como destino. Não usa nenhuma biblioteca (jsPDF etc.) de propósito, pra não depender de mais uma peça externa só para isso.

- O CSS de impressão (`@media print`) força a paleta clara mesmo se o navegador estiver em modo escuro, e evita que um card de especialidade quebre no meio entre duas páginas (`break-inside: avoid`).
- O botão fica desabilitado enquanto nenhuma planilha foi carregada (`exportPdf()` bloqueia com aviso).

## Estado vazio / avisos de upload

- Antes do primeiro upload, o painel mostra um estado vazio explicando o que fazer — não tenta mostrar gráfico nenhum sem dado.
- Depois de cada upload, aparece uma faixa (`#uploadBanner`) com: nome do arquivo, formato detectado, quantas linhas foram lidas, quantas combinações clínica/especialidade resultaram, e — no formato bruto — quantos registros ficaram pendentes ou não-classificados. Isso existe para que quem sobe a planilha perceba na hora se algo saiu errado (ex.: coluna de status com nome diferente do esperado), em vez de só confiar num número final sem contexto.
- Planilha sem coluna de Clínica/Especialidade reconhecível, ou sem "Agendamentos"+"Faltas" nem "Status", gera erro explicando o que faltou — nunca falha em silêncio.

## Preferências do usuário

- Português nas interfaces e nos commits.
- Sempre confirmar antes de mudar regra de negócio (cores, tiers, aliases de especialidade) sem pedido explícito — o que está documentado aqui é o que já foi combinado; qualquer ajuste novo deve ser registrado de volta neste README.
