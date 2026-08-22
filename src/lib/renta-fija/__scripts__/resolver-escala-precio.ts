/**
 * resolver-escala-precio.ts
 *
 * Determina empíricamente la escala del precio que devuelve IOL para
 * bonos soberanos USD y ONs USD.
 *
 * Hipótesis A: IOL cotiza por 100 VN → precioClean = precioIOL / 10
 * Hipótesis B: IOL cotiza por unidad (1 VN) → precioClean = precioIOL / 1000
 *
 * Se corre el pipeline completo contra el fixture de GD30 (TIR conocido 6.4%)
 * y BF40O (TIR conocido 4.86%). La hipótesis que reproduzca ambas TIR define
 * la escala.
 */

import { BONOS_DB, getFrecuenciaNumerica } from "../../bonos-data";
import {
  interesesCorridos,
  yearFraction,
  xirrConvencion,
  calcularTEA,
  calcularTNA,
  durationMacaulayConvencion,
  durationModificadaConvencion,
  convexity,
  paridad,
  precioTecnico,
  parseISO,
  toISO,
} from "../../renta-fija.functions";
import type { YieldConvention } from "../../bonos-data";

// Nota: las rutas relativas son correctas para ejecución directa con tsx/ts-node
// resolver-escala-precio.ts está en src/lib/renta-fija/__scripts__/
// bonos-data.ts está en src/lib/

interface ResultadoHipotesis {
  hipotesis: "A (por 100 VN)" | "B (por unidad)";
  factor: number;
  precioClean: number;
  tir: number | null;
  tna: number | null;
  paridadCalculada: number | null;
  duration: number | null;
  errorTIR_pp: number | null;
}

function correrHipotesis(
  ticker: string,
  precioIOL: number,
  factor: number,
  fechaSnapshot: string,
  tirEsperado: number,
): ResultadoHipotesis {
  const bono = BONOS_DB[ticker.toUpperCase()];
  if (!bono) {
    return {
      hipotesis: factor === 10 ? "A (por 100 VN)" : "B (por unidad)",
      factor,
      precioClean: 0,
      tir: null,
      tna: null,
      paridadCalculada: null,
      duration: null,
      errorTIR_pp: null,
    };
  }

  const precioClean = precioIOL / factor;
  const fechaLiq = parseISO(fechaSnapshot);
  const freq = getFrecuenciaNumerica(bono.frecuenciaPago ?? "Semiannual");
  const conv: YieldConvention = (bono.yieldConvention ?? "TRUE") as YieldConvention;
  const convDias = bono.convencionDias ?? "30/360";
  const cuponAnual = bono.cuponAnual ?? 0;

  // Flujos futuros desde fechaSnapshot
  const flujosFuturos = bono.flujosPorCada100VN.filter((f) => parseISO(f.fecha) > fechaLiq);
  if (flujosFuturos.length === 0) {
    return {
      hipotesis: factor === 10 ? "A (por 100 VN)" : "B (por unidad)",
      factor,
      precioClean,
      tir: null,
      tna: null,
      paridadCalculada: null,
      duration: null,
      errorTIR_pp: null,
    };
  }

  const intCorridos = interesesCorridos(
    fechaLiq,
    parseISO(bono.vencimiento),
    cuponAnual,
    freq,
    convDias,
  );
  const precioDirty = precioClean + intCorridos;
  const precioTecVal = precioTecnico(bono);
  const paridadCalc = paridad(precioClean, precioTecVal);

  const flujosXIRR: Array<{ yf: number; monto: number }> = [
    { yf: 0, monto: -precioDirty },
    ...flujosFuturos.map((f) => ({
      yf: yearFraction(fechaLiq, parseISO(f.fecha), convDias),
      monto: f.monto,
    })),
  ];

  const tirCalc = xirrConvencion(flujosXIRR, freq, conv);
  const tnaCalc = tirCalc !== null ? calcularTNA(tirCalc, freq, conv) : null;
  const dMacaulay =
    tirCalc !== null
      ? durationMacaulayConvencion(flujosXIRR, precioDirty, tirCalc, freq, conv)
      : null;

  const errorTIR = tirCalc !== null ? Math.abs(tirCalc - tirEsperado) * 100 : null;

  return {
    hipotesis: factor === 10 ? "A (por 100 VN)" : "B (por unidad)",
    factor,
    precioClean,
    tir: tirCalc,
    tna: tnaCalc,
    paridadCalculada: paridadCalc,
    duration: dMacaulay,
    errorTIR_pp: errorTIR,
  };
}

export function resolverEscala(
  ticker: string,
  precioIOL: number,
  fechaSnapshot: string,
  tirEsperado: number,
): { hipotesisA: ResultadoHipotesis; hipotesisB: ResultadoHipotesis; conclusion: string; factorRecomendado: number | null } {
  const hA = correrHipotesis(ticker, precioIOL, 10, fechaSnapshot, tirEsperado);
  const hB = correrHipotesis(ticker, precioIOL, 1000, fechaSnapshot, tirEsperado);

  let conclusion: string;
  let factorRecomendado: number | null = null;

  if (hA.errorTIR_pp !== null && hA.errorTIR_pp < 0.15) {
    conclusion = `Hipótesis A (÷10) reproduce TIR con error ${hA.errorTIR_pp.toFixed(3)}pp — escala por 100 VN confirmada.`;
    factorRecomendado = 10;
  } else if (hB.errorTIR_pp !== null && hB.errorTIR_pp < 0.15) {
    conclusion = `Hipótesis B (÷1000) reproduce TIR con error ${hB.errorTIR_pp.toFixed(3)}pp — escala por unidad confirmada.`;
    factorRecomendado = 1000;
  } else {
    conclusion = `Ninguna hipótesis reproduce la TIR esperada. H_A error=${hA.errorTIR_pp?.toFixed(3) ?? "N/A"}pp, H_B error=${hB.errorTIR_pp?.toFixed(3) ?? "N/A"}pp. Verificar fixture o convención de días.`;
  }

  return { hipotesisA: hA, hipotesisB: hB, conclusion, factorRecomendado };
}

// Auto-ejecución si se corre directamente
const [,, tickerArg, precioArg, fechaArg, tirArg] = process.argv;
if (tickerArg && precioArg && fechaArg && tirArg) {
  const resultado = resolverEscala(tickerArg, parseFloat(precioArg), fechaArg, parseFloat(tirArg));
  console.log(JSON.stringify(resultado, null, 2));
}
