/** Motor de valoración por flujo de caja descontado (paper → código).
 *  Implementa el DCF de 2 etapas con la metodología del paper de la knowledge
 *  base, aplicada a datos reales de mercado. Es un ejercicio educativo: el
 *  resultado depende de los supuestos y NO es recomendación de inversión. */

import { covariance, variance, returns } from "./stats";

export interface InputsDCF {
  /** Flujo de caja libre del año base (en USD). */
  fcf_actual: number;
  /** Crecimiento anual del FCF durante la proyección explícita (%). */
  crecimiento_anual: number;
  /** Años de proyección explícita. */
  años_proyeccion: number;
  /** Tasa de descuento / WACC (%). */
  tasa_descuento: number;
  /** Crecimiento perpetuo del valor terminal (%). */
  crecimiento_terminal: number;
  /** Deuda neta a restar del valor de la empresa (USD). */
  deuda_neta: number;
  /** Acciones en circulación. */
  acciones_circulacion: number;
}

export interface FilaDetalle {
  anio: number;
  fcf: number;
  pv_fcf: number;
}

export interface ResultadoValuacion {
  ok: boolean;
  error?: string;
  pv_flujos?: number;
  pv_terminal?: number;
  valor_empresa?: number;
  valor_patrimonio?: number;
  valor_por_accion?: number | null;
  detalle?: FilaDetalle[];
  sensibilidad?: Array<{ tasa: number; valor: number | null }>;
}

/** Datos para estimar la tasa de descuento (WACC) vía CAPM. */
export interface DatosWACC {
  beta: number;
  rf: number;
  mrp: number;
  /** Prima adicional (tamaño / país) en %. */
  premio: number;
  /** Tasa de impuestos a la renta (0-1). */
  tasa_impuestos: number;
  /** Deuda a valor de mercado (USD). */
  deuda: number;
  /** Capital (market cap) a valor de mercado (USD). */
  capital: number;
  /** Costo de la deuda bruto (%). Si es 0/null se omite el término. */
  rd: number | null;
}

/** WACC = E/V·Ke + D/V·Kd·(1-t), con Ke = rf + β·(MRP + prima). Devuelve % (ej 8.7). */
export function calcularWACC(d: DatosWACC): number {
  const E = Math.abs(d.capital) || 0;
  const D = Math.abs(d.deuda) || 0;
  const V = E + D;
  if (V <= 0) return d.rf + d.beta * (d.mrp + d.premio);
  const ke = d.rf + d.beta * (d.mrp + d.premio);
  const wE = E / V;
  let wacc = wE * ke;
  if (d.rd && isFinite(d.rd) && d.rd > 0) {
    const wD = D / V;
    wacc += wD * d.rd * (1 - d.tasa_impuestos);
  }
  return wacc;
}

/** Beta clásica: cov(activo, benchmark) / var(benchmark), sobre retornos. */
export function calcularBeta(returnsActivo: number[], returnsBenchmark: number[]): number | null {
  if (returnsActivo.length < 20 || returnsBenchmark.length < 20) return null;
  const v = variance(returnsBenchmark);
  if (v === 0) return null;
  return covariance(returnsActivo, returnsBenchmark) / v;
}

/** DCF de 2 etapas: proyección explícita de FCF + valor terminal de Gordon. */
export function calcularDCF(inputs: InputsDCF): ResultadoValuacion {
  const fcf = Number(inputs.fcf_actual);
  const g = (Number(inputs.crecimiento_anual) || 0) / 100;
  const años = Math.max(1, Math.floor(Number(inputs.años_proyeccion) || 5));
  const gT = (Number(inputs.crecimiento_terminal) || 0) / 100;
  const r = (Number(inputs.tasa_descuento) || 0) / 100;
  const deudaNeta = Number(inputs.deuda_neta) || 0;
  const acciones = Math.abs(Number(inputs.acciones_circulacion) || 0);

  if (!isFinite(fcf) || fcf <= 0) {
    return { ok: false, error: "El flujo de caja libre debe ser un número positivo." };
  }
  if (!isFinite(r) || r <= 0) {
    return { ok: false, error: "La tasa de descuento debe ser un número positivo." };
  }
  if (r <= gT) {
    return {
      ok: false,
      error: "La tasa de descuento debe ser mayor al crecimiento terminal.",
    };
  }

  let pvFlujos = 0;
  const detalle: FilaDetalle[] = [];
  for (let t = 1; t <= años; t++) {
    const fcfT = fcf * Math.pow(1 + g, t);
    const pvFcfT = fcfT / Math.pow(1 + r, t);
    pvFlujos += pvFcfT;
    detalle.push({ anio: t, fcf: fcfT, pv_fcf: pvFcfT });
  }

  const fcfFinal = fcf * Math.pow(1 + g, años);
  const tv = (fcfFinal * (1 + gT)) / (r - gT);
  const pvTerminal = tv / Math.pow(1 + r, años);

  const valorEmpresa = pvFlujos + pvTerminal;
  const valorPatrimonio = valorEmpresa - deudaNeta;
  const valorPorAccion = acciones > 0 ? valorPatrimonio / acciones : null;

  const sensibilidad: Array<{ tasa: number; valor: number | null }> = [];
  for (const delta of [-2, 0, 2]) {
    const rAlt = r + delta / 100;
    if (rAlt <= gT) continue;
    let pvAlt = 0;
    for (let t = 1; t <= años; t++) {
      pvAlt += (fcf * Math.pow(1 + g, t)) / Math.pow(1 + rAlt, t);
    }
    const tvAlt = (fcf * Math.pow(1 + g, años) * (1 + gT)) / (rAlt - gT);
    const evAlt = pvAlt + tvAlt / Math.pow(1 + rAlt, años) - deudaNeta;
    sensibilidad.push({ tasa: rAlt * 100, valor: acciones > 0 ? evAlt / acciones : null });
  }

  return {
    ok: true,
    pv_flujos: pvFlujos,
    pv_terminal: pvTerminal,
    valor_empresa: valorEmpresa,
    valor_patrimonio: valorPatrimonio,
    valor_por_accion: valorPorAccion,
    detalle,
    sensibilidad,
  };
}

/** Conveniencia: serie de retornos a partir de precios (para calcularBeta). */
export function preciosARetornos(precios: number[]): number[] {
  return returns(precios);
}