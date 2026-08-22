// FASE 4 — Validación del motor de contexto macro real.
// 1) Con datos (determinístico): debe dar 0-100, != 50 cuando hay señal, sin NaN.
// 2) Sin datos (auto-fetch real): no debe tirar excepción y debe quedar en 0-100
//    (50 disponible:false si el fetch falla, valor real si hay red).
// 3) Redistribución: 2 capas disponibles -> pesosUsados = 0.5.

import { calcularScoreMacroContexto, type MacroContextoInput } from "../lib/scoring/macro-contexto";

async function main() {
  let errores = 0;

  const datos: MacroContextoInput = {
    regimenIntermarket: {
      regimen: "Régimen inflacionario — dólar débil, commodities suben, bonos caen",
      confianza: "alta",
      valor: 1,
    },
    crbRatio30dChange: 4.2,
    semaforoGlobal: { scoreGlobal: 1 },
    sectorRanking: [
      { sector: "Energy", variacionPromedioSemanal: 3.1 },
      { sector: "Technology", variacionPromedioSemanal: 2.2 },
      { sector: "Bancos", variacionPromedioSemanal: 1.4 },
    ],
    etapaCiclo: {
      etapaEstimada: "Posible Expansión tardía",
      sectoresLideres: ["Energy", "Basic Materials"],
    },
  };

  const conDatos = await calcularScoreMacroContexto("GGAL", "Bancos", datos);
  const sinDatos = await calcularScoreMacroContexto("GGAL", "Bancos");

  const sinDatosValido =
    Number.isFinite(sinDatos.valor) && sinDatos.valor >= 0 && sinDatos.valor <= 100;
  const conDatosValido =
    Number.isFinite(conDatos.valor) &&
    conDatos.valor >= 0 &&
    conDatos.valor <= 100 &&
    conDatos.disponible === true &&
    conDatos.valor !== 50;

  if (!sinDatosValido) errores++;
  if (!conDatosValido) errores++;

  // Redistribución: solo 2 capas disponibles -> peso 0.5
  const soloDos: MacroContextoInput = {
    semaforoGlobal: { scoreGlobal: -1 },
    sectorRanking: [{ sector: "Bancos", variacionPromedioSemanal: 1 }],
    etapaCiclo: { etapaEstimada: null, sectoresLideres: [] },
  };
  const redistribuido = await calcularScoreMacroContexto("GGAL", "Bancos", soloDos);
  const redistribuidoOk =
    redistribuido.disponible === true &&
    Number.isFinite(redistribuido.valor) &&
    redistribuido.valor >= 0 &&
    redistribuido.valor <= 100 &&
    Math.abs((redistribuido.detalle.pesosUsados ?? 0) - 0.5) < 1e-9;

  if (!redistribuidoOk) errores++;

  console.log(
    `con datos     | valor=${conDatos.valor} | disponible=${conDatos.disponible} | pesosUsados=${conDatos.detalle.pesosUsados} | detalle=${JSON.stringify(conDatos.detalle)}`,
  );
  console.log(
    `sin datos     | valor=${sinDatos.valor} | disponible=${sinDatos.disponible} | (fetch real o fallback 50)`,
  );
  console.log(
    `redistribuido | valor=${redistribuido.valor} | disponible=${redistribuido.disponible} | pesosUsados=${redistribuido.detalle.pesosUsados}`,
  );

  console.log(
    errores === 0
      ? "Motor de contexto macro real reemplaza el placeholder que retornaba 0"
      : `FALLOS: ${errores}`,
  );
  process.exit(errores === 0 ? 0 : 1);
}

void main();
