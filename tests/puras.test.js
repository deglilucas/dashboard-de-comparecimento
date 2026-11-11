// Testes das funções de leitura e cálculo do painel. Rodar com:  node --test
// (precisa só do Node; o script da página é carregado por tests/carregar.js, sem navegador)
const test = require("node:test");
const assert = require("node:assert/strict");
const { carregar } = require("./carregar.js");
const { avaliar } = carregar();
const j = (codigo) => JSON.parse(JSON.stringify(avaliar(codigo)));   // traz o resultado do ambiente de teste para cá

test("status da consulta: falta nunca vira comparecimento", () => {
  const faltas = ["NÃO COMPARECEU", "Não compareceu", "NÃO  COMPARECEU", "NAO_COMPARECEU", "Não-compareceu", "NÃO COMPARECEU", "N�O COMPARECEU", "Faltou", "FALTOU"];
  faltas.forEach(s => assert.equal(avaliar(`classifyStatus(${JSON.stringify(s)})`), "faltou", s));
  ["Compareceu", "COMPARECEU", " compareceu "].forEach(s => assert.equal(avaliar(`classifyStatus(${JSON.stringify(s)})`), "compareceu", s));
  ["Aguardando retorno", "AGUARDANDO RETORNO"].forEach(s => assert.equal(avaliar(`classifyStatus(${JSON.stringify(s)})`), "aguardando", s));
  ["AGENDADO", "", "Cancelado", "Atendido"].forEach(s => assert.equal(avaliar(`classifyStatus(${JSON.stringify(s)})`), "outro", s));
});

test("toNum: decimal e milhar em formato brasileiro e americano", () => {
  const casos = [["12", 12], ["12,5", 12.5], ["12.5", 12.5], ["1.234,56", 1234.56], ["1,234.56", 1234.56], ["1.234", 1234], ["12.345", 12345], ["0.625", 0.625], ["0.500", 0.5],
    ["1.234.567", 1234567], ["1,234,567", 1234567], ["0,5", 0.5], ["", 0], ["abc", 0], ["-3,5", -3.5], ["  40 ", 40]];
  casos.forEach(([entrada, esperado]) => assert.equal(avaliar(`toNum(${JSON.stringify(entrada)})`), esperado, `toNum(${entrada})`));
  assert.equal(avaliar("toNum(7)"), 7);
  assert.equal(avaliar("toNum(null)"), 0);
});

test("toPctValue: fração, texto com % e texto sem %", () => {
  assert.ok(Math.abs(avaliar("toPctValue(0.6295)") - 62.95) < 1e-9);
  assert.ok(Math.abs(avaliar('toPctValue("62,95%")') - 62.95) < 1e-9);
  assert.equal(avaliar('toPctValue("70%")'), 70);
  assert.ok(Math.abs(avaliar('toPctValue("0,5")') - 50) < 1e-9);
});

test("parseDataConsulta: formatos aceitos e datas impossíveis", () => {
  const dia = (a, m, d) => Date.UTC(a, m - 1, d);
  assert.equal(avaliar('parseDataConsulta("31/10/2026")'), dia(2026, 10, 31));
  assert.equal(avaliar('parseDataConsulta("2026-10-31")'), dia(2026, 10, 31));
  assert.equal(avaliar('parseDataConsulta("1/2/2026")'), dia(2026, 2, 1));
  assert.equal(avaliar("parseDataConsulta(46296)"), dia(2026, 10, 1));         // data serial do Excel
  assert.equal(avaliar('parseDataConsulta("46296")'), dia(2026, 10, 1));
  assert.equal(avaliar('parseDataConsulta("10/31/2026")'), null);              // mês 31: não existe
  assert.equal(avaliar('parseDataConsulta("32/01/2026")'), null);
  assert.equal(avaliar('parseDataConsulta("31/02/2026")'), null);              // fevereiro não tem 31
  assert.equal(avaliar('parseDataConsulta("")'), null);
  assert.equal(avaliar('parseDataConsulta("texto")'), null);
});

test("monthIndex: meses em vários formatos e em data do Excel", () => {
  const idx = (a, m) => a * 12 + (m - 1);
  assert.equal(avaliar('monthIndex("2026-10")'), idx(2026, 10));
  assert.equal(avaliar('monthIndex("2026/10")'), idx(2026, 10));
  assert.equal(avaliar('monthIndex("2026-10-01")'), idx(2026, 10));
  assert.equal(avaliar('monthIndex("10/2026")'), idx(2026, 10));
  assert.equal(avaliar('monthIndex("out. de 2026")'), idx(2026, 10));
  assert.equal(avaliar('monthIndex("Out/2026")'), idx(2026, 10));
  assert.equal(avaliar("monthIndex(46296)"), idx(2026, 10));                    // célula de data do Excel
  assert.equal(avaliar('monthIndex("2026-13")'), null);
  assert.equal(avaliar('monthIndex("sem mês")'), null);
});

test("trimestreKey: formatos aceitos, datas e lixo", () => {
  ["T4, 2026", "T4 2026", "4T2026", "4º tri/2026", "2026-T4", "t4,2026"].forEach(t =>
    assert.deepEqual(j(`trimestreKey(${JSON.stringify(t)})`), {sort: 2026 * 4 + 4, label: "T4, 2026"}, t));
  assert.equal(avaliar('trimestreKey("01/10/2026").label'), "T4, 2026");
  assert.equal(avaliar('trimestreKey("2026-07-15").label'), "T3, 2026");
  assert.equal(avaliar("trimestreKey(46300).label"), "T4, 2026");
  ["T0, 2026", "T7, 2026", "abc", "", "T4, 1999"].forEach(t => assert.equal(avaliar(`trimestreKey(${JSON.stringify(t)})`), null, t));
});

test("normSpecName: apelidos, travessão e caixa", () => {
  assert.equal(avaliar('normSpecName("Consulta refrativa")'), "REFRATIVA");
  assert.equal(avaliar('normSpecName("  catarata  ")'), "CATARATA");
  assert.equal(avaliar('normSpecName("Catarata – mobilização saúde ocular")'), "CATARATA - MOBILIZAÇÃO SAÚDE OCULAR");
  assert.equal(avaliar('normSpecName("Catarata - Mobilizacao Saude Ocular")'), "CATARATA - MOBILIZAÇÃO SAÚDE OCULAR");
});

test("faixas de comparecimento e de dias até a cirurgia", () => {
  assert.equal(avaliar("statusOf(70)"), "good"); assert.equal(avaliar("statusOf(69.9)"), "warn");
  assert.equal(avaliar("statusOf(60)"), "warn"); assert.equal(avaliar("statusOf(59.9)"), "bad");
  const tier = (d, e) => avaliar(`(classifyMedianaSLA(${d}, ${JSON.stringify(e)}) || {}).tier || null`);
  assert.equal(tier(14, "CATARATA"), "good"); assert.equal(tier(21, "CATARATA"), "good"); assert.equal(tier(30, "CATARATA"), "warn");
  assert.equal(tier(40, "CATARATA"), "warn"); assert.equal(tier(41, "CATARATA"), "bad");
  assert.equal(tier(39, "BLEFAROPLASTIA"), "good"); assert.equal(tier(50, "BLEFAROPLASTIA"), "warn"); assert.equal(tier(66, "BLEFAROPLASTIA"), "bad");
  assert.equal(tier(100, "GLAUCOMA"), null);                                    // terciária: sem meta
});

test("compScenarios: melhor e pior cenário para quem aguarda retorno", () => {
  const r = j("compScenarios(255, 81, 40)");
  assert.equal(r.total, 376); assert.equal(r.denom, 336);
  assert.ok(Math.abs(r.base - 255 / 336 * 100) < 1e-9);
  assert.ok(Math.abs(r.best - 295 / 376 * 100) < 1e-9);
  assert.ok(Math.abs(r.worst - 255 / 376 * 100) < 1e-9);
  const so = j("compScenarios(0, 0, 5)");                                       // só aguardando: sem desfecho
  assert.equal(so.denom, 0); assert.equal(so.base, 0);
});

test("median: ímpar, par e vazio", () => {
  assert.equal(avaliar("median([3, 1, 2])"), 2);
  assert.equal(avaliar("median([1, 2, 3, 4])"), 2.5);
  assert.equal(avaliar("median([7])"), 7);
  assert.ok(Number.isNaN(avaliar("median([])")));
});

test("packRows e unpackRows: ida e volta sem perder nem inventar valores", () => {
  const linhas = [{a: 1, b: "x"}, {a: 2, c: 0}, {b: "", c: null}];
  const volta = j(`unpackRows(packRows(${JSON.stringify(linhas)}))`);
  assert.deepEqual(volta, [{a: 1, b: "x"}, {a: 2, c: 0}, {b: ""}]);              // ausente continua ausente; null some; 0 e "" ficam
  assert.equal(avaliar("packRows([])"), null);
  assert.equal(avaliar("packRows(null)"), null);
  assert.equal(avaliar("unpackRows(null)"), null);
  assert.equal(avaliar('unpackRows({cols:["a"], rows:"nada"})'), null);
});

test("arquivo de dados do período: identificador, versão e campos", () => {
  const ok = {app: "painel-cx", schema: 1, rotulo: "out/26", fontes: {comparecimento: true}};
  const v = (o) => avaliar(`cmpValidate(${JSON.stringify(o)})`);
  assert.equal(v(ok), null);
  assert.equal(v({...ok, app: "abc-painel-cx"}), null, "arquivos salvos antes, com prefixo no identificador, continuam valendo");
  assert.match(v({...ok, app: "outro-painel"}), /não é um arquivo/);
  assert.match(v({...ok, schema: 2}), /versão 2/);
  assert.match(v({...ok, rotulo: ""}), /incompleto/);
  assert.match(v({...ok, fontes: undefined}), /incompleto/);
  assert.match(v(null), /não é um arquivo/);
});

test("arquivo de dados do período: campos fora do formato viram listas vazias, sem quebrar a comparação", () => {
  const s = j(`(() => { const o = {app:"painel-cx", schema:1, rotulo:"out/26", fontes:{}, porEspecialidade:"x", porTipo:null,
    cancelamentos:{total:5}, mediana:{trimestre:"T4, 2026"}, indicacao:{serie:3}, periodo:{de:12, ate:"2026-10-31"}, geradoEm:"ontem"}; cmpNormalizar(o); return o; })()`);
  assert.deepEqual(s.porEspecialidade, []); assert.deepEqual(s.porTipo, []); assert.deepEqual(s.porClinica, []);
  assert.deepEqual(s.cancelamentos.porMotivo, []); assert.deepEqual(s.cancelamentos.porClinica, []);
  assert.deepEqual(s.mediana.porEspecialidade, []); assert.deepEqual(s.mediana.porTrimestre, []); assert.deepEqual(s.mediana.combinacoes, []);
  assert.deepEqual(s.indicacao.serie, []); assert.deepEqual(s.indicacao.cirurgias, []);
  assert.equal(s.periodo, null, "período com data inválida some e o arquivo é tratado como sem datas");
  assert.match(s.geradoEm, /^\d{4}-\d{2}-\d{2}T/, "geradoEm inválido vira uma data de verdade");
});
