// Carrega o script da página (index.html) dentro de um ambiente de teste, sem navegador.
// O document/window são "massa de modelar": aceitam qualquer chamada e não fazem nada, então o script inteiro
// roda e todas as funções e constantes ficam disponíveis para os testes (sem precisar separar o arquivo).
const fs = require("fs"), path = require("path"), vm = require("vm");

function massa(){
  const alvo = function(){};
  const p = new Proxy(alvo, {
    get(_, k){
      if (k === Symbol.toPrimitive) return () => "";
      if (k === Symbol.iterator) return function*(){};
      if (k === "length") return 0;
      if (k === "then") return undefined;
      return massa();
    },
    apply(){ return massa(); },
    construct(){ return massa(); },
    set(){ return true; },
    has(){ return true; },
  });
  return p;
}

function carregar(){
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const blocos = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const base = {
    document: massa(), window: massa(), navigator: {userAgent: "teste"}, console, setTimeout, clearTimeout, Intl, Date, Math, JSON,
    Chart: massa(), XLSX: massa(), html2canvas: massa(), localStorage: massa(), getComputedStyle: () => massa(),
    NodeFilter: {SHOW_TEXT: 4}, FileReader: function(){}, Blob: function(){}, URL: {createObjectURL(){ return ""; }, revokeObjectURL(){}},
    requestAnimationFrame: f => f, fetch: async () => ({}),
  };
  const ctx = vm.createContext(base);
  blocos.forEach(b => vm.runInContext(b, ctx, {filename: "index.html"}));
  return { ctx, avaliar: codigo => vm.runInContext(codigo, ctx) };
}
module.exports = { carregar };
