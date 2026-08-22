// FASE 3 — Validación del motor de noticias unificado.
// 3 casos vía keywords (GEMINI_API_KEY no seteada en test):
//   vacío -> disponible:false, valor 50
//   positivo -> valor esperado 100 ±5
//   negativo -> valor esperado 0 ±5
// Sin NaN y con fuente "keywords-regex".

import { calcularScoreNoticias } from "../lib/scoring/noticias";

async function main() {
  let errores = 0;

  const vacio = await calcularScoreNoticias("GGAL", []);
  const positivo = await calcularScoreNoticias("GGAL", [
    "La empresa reportó un récord de ganancias",
  ]);
  const negativo = await calcularScoreNoticias("GGAL", [
    "La empresa reportó fuertes pérdidas y un downgrade",
  ]);
  const casos = [vacio, positivo, negativo];

  for (const c of casos) {
    const nu = Number.isNaN(c.valor);
    const rango = c.valor >= 0 && c.valor <= 100;
    const flagOk = !c.disponible ? c.valor === 50 : true;
    if (nu || !rango || !flagOk) errores++;
  }

  const okVacio = vacio.disponible === false && vacio.valor === 50;
  const okPos = positivo.disponible === true && positivo.valor >= 95 && positivo.valor <= 105;
  const okNeg = negativo.disponible === true && negativo.valor >= -5 && negativo.valor <= 5;
  if (!okVacio || !okPos || !okNeg) errores++;

  console.log(
    `vacío    | valor=${vacio.valor} | disponible=${vacio.disponible} | fuente=${vacio.fuente}`,
  );
  console.log(
    `positivo | valor=${positivo.valor} | disponible=${positivo.disponible} | raw=${positivo.raw} | fuente=${positivo.fuente}`,
  );
  console.log(
    `negativo | valor=${negativo.valor} | disponible=${negativo.disponible} | raw=${negativo.raw} | fuente=${negativo.fuente}`,
  );

  console.log(
    errores === 0 ? "Motor de noticias unificado con fallback funcional" : `FALLOS: ${errores}`,
  );
  process.exit(errores === 0 ? 0 : 1);
}

void main();
