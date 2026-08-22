/**
 * calibracion-inversa.ts
 *
 * Para instrumentos donde el broker no publica el cupón anual directamente
 * (ej. BF40O: "Cupón anual: -"), pero sí publica TIR, Duration, Macaulay,
 * Convexity y Current Yield, se puede reconstruir el cupón por calibración
 * inversa: minimizar el error entre las métricas calculadas (para un cupón
 * candidato dado) y las métricas objetivo publicadas.
 */

import { BONOS_DB, getFrecuenciaNumerica } from "../bonos-data";
import type { YieldConvention, FlujoFuturo } from "../bonos-data";
import {
  interesesCorridos,
  yearFraction,
  xirrConvencion,
  durationMacaulayConvencion,
  durationModificadaConvencion,
  convexity,
  parseISO,
} from "../renta-fija.functions";

export interface MetricasObjetivo {
  tir: number;
  duration: number;
  macaulayDuration: number;
  convexity: number;
  currentYield: number;
}

export interface ParametrosCalibracion {
  precioClean: number;
  vencimiento: string;
  fechaSnapshot: string;
  frecuenciaPago: "Semiannual";
  convencionDias: "REAL/365";
  tipoAmortizacion: "Bullet";
  yieldConvention: "STREET";
  metricasObjetivo: MetricasObjetivo;
}

export interface ResultadoCalibracion {
  cuponAnualCalibrado: number;
  errorAjuste: number;
  metricasCalculadas: {
    tir: number | null;
    duration: number | null;
    macaulayDuration: number | null;
    convexity: number | null;
    currentYield: number;
  };
  converge: boolean;
}

/**
 * Construye flujos sintéticos para un bono Bullet con cupón fijo.
 * Semestral: paga c/2 cada 6 meses, +100 de principal al vencimiento.
 * Los flujos se generan desde la fechaSnapshot hacia adelante.
 */
function construirFlujosBullet(
  cuponAnual: number,
  vencimiento: string,
  fechaSnapshot: string,
  frecuenciaPago: "Semiannual",
): FlujoFuturo[] {
  const freqNum = frecuenciaPago === "Semiannual" ? 2 : 1;
  const cuponPeriodo = (cuponAnual / freqNum); // por cada 100 VN
  const vto = parseISO(vencimiento);
  const snapshot = parseISO(fechaSnapshot);
  const flujos: FlujoFuturo[] = [];

  // Generar flujos desde la fecha de vencimiento hacia atrás
  const periodoMs = (365.25 / freqNum) * 24 * 60 * 60 * 1000;
  let fechaPago = new Date(vto);

  while (fechaPago > snapshot) {
    const esUltimo = flujos.length === 0;
    flujos.unshift({
      fecha: `${fechaPago.getFullYear()}-${String(fechaPago.getMonth() + 1).padStart(2, "0")}-${String(fechaPago.getDate()).padStart(2, "0")}`,
      monto: esUltimo ? cuponPeriodo + 100 : cuponPeriodo, // última: cupón + principal
      tipo: esUltimo ? "cupon+amortizacion" : "cupon",
    });
    fechaPago = new Date(fechaPago.getTime() - periodoMs);
  }

  return flujos;
}

/**
 * Evalúa un cupón candidato: corre el pipeline completo y devuelve
 * el error relativo cuadrático contra las métricas objetivo.
 */
function evaluarCuponCandidato(
  cuponCandidato: number,
  params: ParametrosCalibracion,
): { error: number; metricas: ResultadoCalibracion["metricasCalculadas"] } {
  const { precioClean, vencimiento, fechaSnapshot, frecuenciaPago, convencionDias, yieldConvention, metricasObjetivo } = params;
  const freq = getFrecuenciaNumerica(frecuenciaPago);
  const conv: YieldConvention = yieldConvention as YieldConvention;
  const convDias = convencionDias;
  const fechaLiq = parseISO(fechaSnapshot);

  const flujosFuturos = construirFlujosBullet(cuponCandidato, vencimiento, fechaSnapshot, frecuenciaPago);

  if (flujosFuturos.length === 0) {
    return { error: Infinity, metricas: { tir: null, duration: null, macaulayDuration: null, convexity: null, currentYield: precioClean > 0 ? cuponCandidato / precioClean : 0 } };
  }

  const intCorridos = interesesCorridos(fechaLiq, parseISO(vencimiento), cuponCandidato, freq, convDias);
  const precioDirty = precioClean + intCorridos;

  const flujosXIRR: Array<{ yf: number; monto: number }> = [
    { yf: 0, monto: -precioDirty },
    ...flujosFuturos.map((f) => ({
      yf: yearFraction(fechaLiq, parseISO(f.fecha), convDias),
      monto: f.monto,
    })),
  ];

  const tirCalc = xirrConvencion(flujosXIRR, freq, conv);
  const dMacaulay = tirCalc !== null ? durationMacaulayConvencion(flujosXIRR, precioDirty, tirCalc, freq, conv) : null;
  const dMod = dMacaulay !== null && tirCalc !== null ? durationModificadaConvencion(dMacaulay, tirCalc, freq, conv) : null;
  const convx = tirCalc !== null ? convexity(flujosXIRR, precioDirty, tirCalc, freq, conv) : null;
  const cy = precioClean > 0 ? cuponCandidato / precioClean : 0;

  const metricas = {
    tir: tirCalc,
    duration: dMod,
    macaulayDuration: dMacaulay,
    convexity: convx,
    currentYield: cy,
  };

  // Error relativo cuadrático
  let sumError = 0;
  let count = 0;
  const pares: [number | null, number][] = [
    [tirCalc, metricasObjetivo.tir],
    [dMod, metricasObjetivo.duration],
    [dMacaulay, metricasObjetivo.macaulayDuration],
    [convx, metricasObjetivo.convexity],
    [cy, metricasObjetivo.currentYield],
  ];
  for (const [calc, objetivo] of pares) {
    if (calc !== null && objetivo > 0) {
      const errRel = ((calc - objetivo) / objetivo) ** 2;
      sumError += errRel;
      count++;
    }
  }

  return { error: count > 0 ? sumError / count : Infinity, metricas };
}

/**
 * Calibra el cupón anual mediante búsqueda en grid fino.
 * Rango: 0% – 15% anual, paso 0.01% (1500 iteraciones).
 */
export function calibrarCuponDesdeMetricas(params: ParametrosCalibracion): ResultadoCalibracion {
  let mejorCupon = 0;
  let mejorError = Infinity;
  let mejoresMetricas: ResultadoCalibracion["metricasCalculadas"] = {
    tir: null, duration: null, macaulayDuration: null, convexity: null, currentYield: 0,
  };

  // Grid fino: 0% a 15% en pasos de 0.01%
  for (let pct = 0; pct <= 15; pct += 0.01) {
    const cupon = pct / 100;
    const { error, metricas } = evaluarCuponCandidato(cupon, params);
    if (error < mejorError) {
      mejorError = error;
      mejorCupon = cupon;
      mejoresMetricas = metricas;
    }
  }

  return {
    cuponAnualCalibrado: Math.round(mejorCupon * 10000) / 10000,
    errorAjuste: Math.round(mejorError * 1e10) / 1e10,
    metricasCalculadas: mejoresMetricas,
    converge: mejorError < 5.0,
  };
}

// Auto-ejecución si se corre directamente
const [,, jsonArg] = process.argv;
if (jsonArg) {
  const params: ParametrosCalibracion = JSON.parse(jsonArg);
  const resultado = calibrarCuponDesdeMetricas(params);
  console.log(JSON.stringify(resultado, null, 2));
}
