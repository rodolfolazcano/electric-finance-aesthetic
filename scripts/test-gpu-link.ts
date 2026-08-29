import { ejecutarTool } from "../src/lib/agents/orquestador.js";
console.log('test gpu link');
const r=await ejecutarTool('predecir_direccion', JSON.stringify({simbolo:'GGAL',horizonte:5}));
console.log('ok', r.ok);
console.log(r.texto.slice(0,1200));
console.log('includes GPU?', r.texto.includes('Aceleración GPU'));
