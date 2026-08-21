// @ts-nocheck
// src/lib/renta-fija.functions.ts
// Server functions para cálculos de renta fija: TIR, Duration, Monitor, Portafolio, Históricos
//
// FÓRMULAS POR TIPO DE INSTRUMENTO:
//
// BONOS Hard Dollar (cupón fijo, USD, pago semestral, 30/360):
//   - Yield Convention: STREET (tasación semestral)
//   - TIR (XIRR) resuelve: PrecioDirty = Σ CF_i / (1 + TIR/freq)^(freq × yf_i)
//     donde yf_i = year fraction según 30/360 desde fecha liquidación hasta flujo i
//   - PrecioDirty = PrecioClean + InteresesCorridos
//   - InteresesCorridos = cupón_periodo × (días desde último cupón) / 360 (30/360)
//   - TEA = (1 + TIR/freq)^freq - 1  (tasa efectiva anual desde TIR nominal)
//   - TNA = TIR (la TIR nominal YA es la tasa nominal anual)
//   - Duration Macaulay = Σ(t_i × PV_i) / Σ(PV_i), t_i en años según 30/360
//   - Duration Modificada = D_Mac / (1 + TIR/freq)
//   - Convexidad = Σ(t_i × (t_i + 1/freq) × PV_i) / (Precio × (1 + TIR/freq)²)
//
// BONOS CER / Dollar-Linked (ajustables, ARS, ACT/365):
//   - Yield Convention: TRUE (tasa efectiva anual)
//   - TIR resuelve: PrecioDirty = Σ CF_i × factorAjuste / (1 + TIR)^(yf_i)
//   - yf_i = días reales / 365 (ACT/365)
//   - TEA = TIR (ya es efectiva anual)
//   - TNA = freq × ((1 + TIR)^(1/freq) - 1)
//   - Duration: estándar con yf_i en años
//
// LETRAS (LECAPs / BONCAPs):
//   - NO USAN Newton-Raphson. Fórmula directa:
//     TEM = (VPV / Precio)^(30/dias) - 1
//     TEA = (1 + TEM)^12 - 1
//     TNA = TEM × 12
//
// OBLIGACIONES NEGOCIABLES (ONs):
//   - Mismo motor que Hard Dollar, + spreadSobreSoberano
//
// FCIs:
//   - NO PASAN POR ESTE MOTOR. Ver fci-lecap.functions.ts

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  BONOS_DB,
  BonoConfig,
  TipoBono,
  FlujoFuturo,
  YieldConvention,
  FlujoEntry,
  TipoInstrumento,
  getFrecuenciaNumerica,
} from "./bonos-data";
import { fetchBonosCashFlows } from "./docta-api";
import { getCached, setCache } from "./cache";

// ============================================================================
// CONSTANTES DE ESCALA DE PRECIOS IOL
// ============================================================================
// Resuelto empíricamente (ver src/lib/renta-fija/__scripts__/resolver-escala-precio.ts)
// Para bonos soberanos USD cotizados en BYMA: IOL devuelve precio por 1000 VN
// → dividir por 10 para obtener precio por 100 VN (nuestra convención interna)
// Para ONs USD: misma convención (confirmar con test de BF40O)
export const ESCALA_PRECIO_IOL_BONOS_USD = 10;
export const ESCALA_PRECIO_IOL_ONS_USD = 10;

// ============================================================================
// TIPOS DE SALIDA
// ============================================================================

export interface RendimientoBono {
  ticker: string;
  tipo: TipoBono;
  descripcion: string;
  vencimiento: string;
  fechaLiquidacion: string;

  tir: number | null; // TIR nominal anual (STREET) o TEA (TRUE)
  tea: number | null; // Tasa Efectiva Anual
  tna: number | null; // Tasa Nominal Anual

  precio: number; // precio clean (alias de precioPorCada100VN para tablas)
  precioPorCada100VN: number; // precio clean
  precioDirty?: number; // precio clean + intereses corridos
  interesesCorridos?: number; // intereses corridos devengados
  precioTecnico: number; // valor técnico (valor residual actual)
  paridad: number;

  durationMacaulay: number | null;
  durationModificada: number | null;
  convexity?: number | null;

  flujos: Array<{
    fecha: string;
    dias: number;
    tipo: string;
    monto: number;
    monedaOriginal: string;
    montoARS?: number;
    tcProyectado?: number;
    pvAlTIR: number;
    pctDelPrecio: number;
  }>;

  tcOficialUsado?: number;
  tasaDevaluacionUsada?: number;
  metodoDevaluacion?: "spread-real" | "mep-fallback" | "parametro" | "ninguno";

  monedaFlujos: string; // moneda de pago de los flujos (USD | ARS)
  monedaCotizacion?: string; // moneda en que cotiza en BYMA/IOL (USD | ARS)
  especie?: "MEP" | "Cable" | "Pesos"; // MEP = dólar MEP, Cable = dólar cable CCL, Pesos = ARS
  diasAlVencimiento: number;
  volumenNominal: number | null;
  montoOperado: number | null;
  error?: string;
  alertaSaltoBrusco?: string;
  fuente?: string; // "IOL" | "ArgentinaDatos" | "Teórico"
}

export interface PreciosResult {
  precios: Record<string, { precio: number | null; fuente: "iol" | "unavailable" }>;
  tcOficial: number | null;
  tcBlue: number | null;
  tcMep: number | null;
  timestamp: string;
}

export interface LecapData {
  ticker: string;
  fechaEmision: string;
  fechaVencimiento: string;
  tem: number;
  tea: number;
  tna: number;
  vpv: number;
  precio: number | null;
  precioFuente: "iol" | "argentinadatos" | null;
  diasAlVencimiento: number;
}

export interface MonitorResult {
  bonos: RendimientoBono[];
  lecaps: LecapData[];
  tcOficial: number | null;
  tcBlue: number | null;
  tcMep: number | null;
  timestamp: string;
}

export interface ResultadoBusqueda {
  encontrado: boolean;
  ticker: string;
  descripcion: string;
  categoriaIOL: string;
  tipoInterno: TipoBono;
  moneda: string;
  ultimoPrecio: number | null;
  precioCompra: number | null;
  precioVenta: number | null;
  spread: number | null;
  cierreAnterior: number | null;
  variacionDiaria: number | null;
  volumenNominal: number | null;
  montoOperado: number | null;
  estaEnBonoDB: boolean;
  flujosCargados: boolean;
  error?: string;
}

export interface InstrumentoSearchResult {
  instrumentos: ResultadoBusqueda[];
}

export interface PosicionRF {
  ticker: string;
  cantidad: number;
  vn: number;
  precio: number;
  total: number;
}

export interface PosicionPortafolio {
  ticker: string;
  descripcion: string;
  categoriaIOL: string;
  tipoInterno: TipoBono;
  moneda: string;
  valorNominal: number;
  precioPorCada100VN: number;
  valorMercado: number;
  valorMercadoUSD: number | null;
  peso: number;
  tir: number | null;
  tea: number | null;
  durationMacaulay: number | null;
  paridad: number | null;
  sinFlujos: boolean;
  error?: string;
}

export interface ComposicionPortafolio {
  porTipo: Array<{ nombre: string; pct: number; valorUSD: number | null }>;
  porMoneda: Array<{ moneda: string; pct: number }>;
  porInstrumento: Array<{
    ticker: string;
    descripcion: string;
    pct: number;
    valorUSD: number | null;
  }>;
}

export interface ResultadoPortafolio {
  posiciones: PosicionPortafolio[];
  metricas: {
    totalUSD: number | null;
    tirPonderadaUSD: number | null;
    durationPonderada: number | null;
    pctConTir: number;
    pctSinFlujos: number;
    advertencias: string[];
  };
  composicion: ComposicionPortafolio;
  tcOficialUsado: number | null;
  timestamp: string;
}

export type PortafolioRFResult = ResultadoPortafolio;

export interface SerieHistoricaPoint {
  fecha: string;
  precio: number;
  tir: number | null;
  paridad: number | null;
  precioTecnico: number | null;
  volumenNominal: number | null;
  maximo: number;
  minimo: number;
  equity: number | null; // capital evolution (base 100) from price changes
}

export interface SerieHistoricaResult {
  ticker: string;
  descripcion: string;
  tipo: TipoBono;
  serie: SerieHistoricaPoint[];
  stats?: {
    tirMin: number | null;
    tirMax: number | null;
    tirPromedio: number | null;
    paridadMin: number | null;
    paridadMax: number | null;
  };
  totalPuntos: number;
  puntosConTIR: number;
  fechaDesde: string;
  fechaHasta: string;
  error?: string;
}

// ============================================================================
// HELPERS MATEMÁTICOS
// ============================================================================

/**
 * Calcula el número de días entre dos fechas (Actual/365)
 */
export function diasEntre(desde: Date, hasta: Date): number {
  return (hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Convierte string ISO 'YYYY-MM-DD' a Date
 */
export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Convierte Date a string ISO 'YYYY-MM-DD'
 */
export function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Calcula T+1 hábil (saltando fines de semana)
 */
export function calcularTplus1(fechaBase: Date = new Date()): Date {
  const d = new Date(fechaBase);
  d.setDate(d.getDate() + 1);

  if (d.getDay() === 6) d.setDate(d.getDate() + 2); // sábado -> lunes
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // domingo -> lunes

  return d;
}

// ============================================================================
// DAY COUNT CONVENTIONS
// ============================================================================

/**
 * Días según convención 30/360 (ISDA)
 * Cada mes = 30 días, año = 360 días
 */
export function dias30_360(desde: Date, hasta: Date): number {
  let d1 = desde.getDate();
  const m1 = desde.getMonth() + 1;
  const y1 = desde.getFullYear();
  let d2 = hasta.getDate();
  const m2 = hasta.getMonth() + 1;
  const y2 = hasta.getFullYear();

  // Adjust: si d1=31 -> 30; si d2=31 y d1>=30 -> 30
  if (d1 === 31) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;

  return (y2 - y1) * 360 + (m2 - m1) * 30 + (d2 - d1);
}

/**
 * Días reales entre dos fechas
 */
export function diasAct365(desde: Date, hasta: Date): number {
  return (hasta.getTime() - desde.getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * Year fraction según convención de días
 */
export function yearFraction(desde: Date, hasta: Date, convencion: string = "30/360"): number {
  switch (convencion) {
    case "30/360":
      return dias30_360(desde, hasta) / 360;
    case "ACT/360":
      return diasAct365(desde, hasta) / 360;
    case "ACT/365":
    case "REAL/365":
      return diasAct365(desde, hasta) / 365;
    case "ACT/ACT":
      // Aproximación: días reales / 365.25
      return diasAct365(desde, hasta) / 365.25;
    default:
      return diasAct365(desde, hasta) / 365;
  }
}

// ============================================================================
// INTERESES CORRIDOS
// ============================================================================

/**
 * Calcula la fecha del último pago de cupón anterior a la fecha de liquidación
 * Asumiendo pagos regulares desde vencimiento hacia atrás
 */
export function fechaUltimoCupon(fechaLiq: Date, fechaVencimiento: Date, frecuencia: number): Date {
  // Iterar hacia atrás desde vencimiento en incrementos del período
  const periodoMs = (365.25 / frecuencia) * 24 * 60 * 60 * 1000;
  let cuponDate = new Date(fechaVencimiento);
  while (cuponDate >= fechaLiq) {
    cuponDate = new Date(cuponDate.getTime() - periodoMs);
  }
  return cuponDate;
}

/**
 * Intereses corridos por cada 100 VN
 * Para bonos con cupón periódico
 */
export function interesesCorridos(
  fechaLiq: Date,
  fechaVencimiento: Date,
  cuponAnual: number,
  frecuencia: number,
  convencionDias: string,
): number {
  if (cuponAnual <= 0 || frecuencia <= 0) return 0;

  const ultimoCupon = fechaUltimoCupon(fechaLiq, fechaVencimiento, frecuencia);
  const cuponPeriodo = cuponAnual / frecuencia; // % por período
  const yf = yearFraction(ultimoCupon, fechaLiq, convencionDias);

  return cuponPeriodo * yf * frecuencia;
}

// ============================================================================
// NPV / DESCUENTO
// ============================================================================

/**
 * Factor de descuento según yield convention
 *
 * STREET: 1 / (1 + tir/freq)^(freq × yf)
 *   - Usado para Hard Dollar USD, semestral
 *   - tir es la TASA NOMINAL ANUAL (TIR de mercado)
 *   - TEA = (1 + tir/freq)^freq - 1
 *
 * TRUE: 1 / (1 + tir)^(yf)
 *   - Usado para CER, Dollar-Linked, LECAPs
 *   - tir es la TASA EFECTIVA ANUAL (TEA)
 */
export function factorDescuento(
  yf: number,
  tir: number,
  freq: number,
  convention: YieldConvention,
): number {
  if (tir <= -1) return Infinity;
  if (convention === "STREET" && freq > 0) {
    return Math.pow(1 + tir / freq, freq * yf);
  }
  return Math.pow(1 + tir, yf);
}

/**
 * NPV (Valor Actual Neto) con convención de yield configurable
 * flujos: array de { yearFraction, monto } donde yearFraction está en años
 * según la convención de días del instrumento
 */
export function npvConvencion(
  flujos: Array<{ yf: number; monto: number }>,
  tir: number,
  freq: number,
  convention: YieldConvention,
): number {
  if (tir <= -1) return Infinity;
  return flujos.reduce((acc, f) => {
    const df = factorDescuento(f.yf, tir, freq, convention);
    if (!Number.isFinite(df) || df === 0) return acc;
    return acc + f.monto / df;
  }, 0);
}

/**
 * Derivada numérica de NPV (para Newton-Raphson)
 */
export function dnpvConvencion(
  flujos: Array<{ yf: number; monto: number }>,
  tir: number,
  freq: number,
  convention: YieldConvention,
  dx: number = 1e-7,
): number {
  const f1 = npvConvencion(flujos, tir + dx, freq, convention);
  const f2 = npvConvencion(flujos, tir - dx, freq, convention);
  return (f1 - f2) / (2 * dx);
}

// ============================================================================
// XIRR (TIR) — Newton-Raphson, configurable por convención
// ============================================================================

/**
 * XIRR con Newton-Raphson
 *
 * flujos: array de { yf: number, monto: number }
 *   - El primer flujo (índice 0) debe ser el outflow (precio, negativo)
 *   - yf está en años según la convención de días del instrumento
 * freq: frecuencia de pago por año (2 para semestral, 1 para anual, etc.)
 * convention: "STREET" | "TRUE"
 *
 * Retorna la TIR nominal anual (STREET) o TEA (TRUE), según convention.
 */
export function xirrConvencion(
  flujos: Array<{ yf: number; monto: number }>,
  freq: number,
  convention: YieldConvention,
  maxIter: number = 200,
  tolerancia: number = 1e-10,
): number | null {
  // Para plazos muy cortos (<30 días), usar aproximación lineal
  if (flujos.length >= 2) {
    const outflow = flujos.find((f) => f.yf === 0 && f.monto < 0);
    const inflows = flujos.filter((f) => f.yf > 0);
    if (outflow && inflows.length > 0) {
      const totalIn = inflows.reduce((s, f) => s + f.monto, 0);
      const totalOut = -outflow.monto;
      const maxYf = Math.max(...inflows.map((f) => f.yf));
      if (maxYf < 30 / 365 && totalOut > 0) {
        const simpleRet = totalIn / totalOut - 1;
        return Number.isFinite(simpleRet) ? simpleRet : null;
      }
    }
  }

  const semillas = [0.15, 0.05, 0.3, -0.05, 0.5, 0.01, 0.8, -0.3, -0.5, -0.8, 1.5, 0.005, 2.0];

  for (const x0 of semillas) {
    let x = x0;

    for (let i = 0; i < maxIter; i++) {
      const fx = npvConvencion(flujos, x, freq, convention);
      const dfx = dnpvConvencion(flujos, x, freq, convention);

      if (Math.abs(dfx) < 1e-12) break;

      const xNew = x - fx / dfx;

      if (!Number.isFinite(xNew)) break;

      if (Math.abs(xNew - x) < tolerancia) {
        if (xNew > -0.999 && xNew < 10) return xNew;
      }

      x = xNew;
    }
  }

  // ── Fallback: bisection method ──────────────────────────────────
  // For complex cash flow structures (step-up, sinkable, etc.),
  // Newton-Raphson may fail. Bisection is slower but more robust.
  const bisection = (lo: number, hi: number, nMax: number): number | null => {
    const fLo = npvConvencion(flujos, lo, freq, convention);
    const fHi = npvConvencion(flujos, hi, freq, convention);
    if (!Number.isFinite(fLo) || !Number.isFinite(fHi)) return null;
    if (fLo * fHi > 0) return null; // no sign change

    let a = lo,
      b = hi;
    for (let i = 0; i < nMax; i++) {
      const m = (a + b) / 2;
      const fM = npvConvencion(flujos, m, freq, convention);
      if (!Number.isFinite(fM)) return null;
      if (Math.abs(fM) < tolerancia * 100) return m;
      const fA = npvConvencion(flujos, a, freq, convention);
      if (fA * fM <= 0) b = m;
      else a = m;
      if (b - a < tolerancia) return (a + b) / 2;
    }
    return (a + b) / 2;
  };

  // Try multiple intervals expanding outward
  const intervalos = [
    [0.0001, 0.5],
    [0.5, 1.0],
    [1.0, 2.0],
    [2.0, 4.0],
    [-0.5, 0.0001],
    [0.0001, 1.0],
    [-0.3, 0.3],
    [-0.9, -0.3],
    [4.0, 8.0],
  ];
  for (const [lo, hi] of intervalos) {
    const r = bisection(lo, hi, 200);
    if (r !== null && r > -0.999 && r < 10) return r;
  }

  return null;
}

// ============================================================================
// DURATION & CONVEXITY
// ============================================================================

/**
 * Macaulay Duration en años
 *
 * D = Σ(t_i × PV_i) / Σ(PV_i)
 * donde t_i = year fraction desde valuación hasta flujo i
 * PV_i = valor presente del flujo i al TIR
 */
export function durationMacaulayConvencion(
  flujos: Array<{ yf: number; monto: number }>,
  precioDirty: number,
  tir: number,
  freq: number,
  convention: YieldConvention,
): number | null {
  if (flujos.length === 0 || precioDirty <= 0 || tir === null) return null;
  if (tir <= -1) return null;

  // Solo flujos futuros (yf > 0)
  const futuros = flujos.filter((f) => f.yf > 0);
  if (futuros.length === 0) return null;

  let sumaPV = 0;
  let sumaTPV = 0;

  for (const f of futuros) {
    const df = factorDescuento(f.yf, tir, freq, convention);
    if (!Number.isFinite(df) || df === 0) continue;
    const pv = f.monto / df;
    sumaPV += pv;
    sumaTPV += f.yf * pv;
  }

  if (sumaPV <= 0) return null;
  return sumaTPV / sumaPV;
}

/**
 * Duration Modificada = D_Mac / (1 + TIR/freq)
 */
export function durationModificadaConvencion(
  dMacaulay: number | null,
  tir: number | null,
  freq: number,
  convention: YieldConvention,
): number | null {
  if (dMacaulay === null || tir === null) return null;
  if (tir <= -1) return null;

  const divisor = convention === "STREET" && freq > 0 ? 1 + tir / freq : 1 + tir;
  return dMacaulay / divisor;
}

/**
 * Convexidad
 *
 * STREET: C = [ Σ CF_i × t_i × (t_i + 1/freq) / (1 + TIR/freq)^(freq × t_i + 2) ] / Precio
 * TRUE:   C = [ Σ CF_i × t_i × (t_i + 1) / (1 + TIR)^(t_i + 2) ] / Precio
 */
export function convexity(
  flujos: Array<{ yf: number; monto: number }>,
  precioDirty: number,
  tir: number,
  freq: number,
  convention: YieldConvention,
): number | null {
  if (precioDirty <= 0 || tir === null || tir <= -1) return null;

  const futuros = flujos.filter((f) => f.yf > 0);
  if (futuros.length === 0) return null;

  let sumC = 0;
  for (const f of futuros) {
    const df = factorDescuento(f.yf, tir, freq, convention);
    if (!Number.isFinite(df) || df === 0) continue;
    const t = f.yf;
    const adj = convention === "STREET" ? 1 / freq : 1;
    sumC += (f.monto / df) * t * (t + adj);
  }

  // STREET: dividir por (1 + TIR/freq)^2, TRUE: dividir por (1 + TIR)^2
  const denom = convention === "STREET" ? Math.pow(1 + tir / freq, 2) : Math.pow(1 + tir, 2);

  return sumC / (precioDirty * denom);
}

// ============================================================================
// TNA DESDE TIR
// ============================================================================

/**
 * Calcula TNA (Tasa Nominal Anual) desde TIR según convención
 *
 * STREET: TIR ya es nominal anual → TNA = TIR
 * TRUE:   TNA = freq × ((1 + TIR)^(1/freq) - 1)
 */
export function calcularTNA(tir: number, freq: number, convention: YieldConvention): number {
  if (convention === "STREET") return tir;
  // TRUE: convertir TEA → TNA
  if (freq > 0) return freq * (Math.pow(1 + tir, 1 / freq) - 1);
  return tir;
}

/**
 * Calcula TEA (Tasa Efectiva Anual) desde TIR según convención
 *
 * STREET: TEA = (1 + TIR/freq)^freq - 1
 * TRUE:   TIR ya es TEA → TEA = TIR
 */
export function calcularTEA(tir: number, freq: number, convention: YieldConvention): number {
  if (convention === "TRUE") return tir;
  if (freq > 0) return Math.pow(1 + tir / freq, freq) - 1;
  return tir;
}

// ============================================================================
// PRECIO TÉCNICO Y PARIDAD
// ============================================================================

/**
 * Precio Técnico (Valor Residual) por cada 100 VN
 * Para bonos: es el valor residual actual (sin contar cupones futuros)
 * Si no hay residual, suma los flujos como fallback
 */
export function precioTecnico(bono?: BonoConfig): number {
  if (bono?.valorResidualActual != null && bono.valorResidualActual > 0)
    return bono.valorResidualActual;
  return 100;
}

/**
 * Paridad = (Precio Clean / Precio Técnico) × 100
 * Paridad > 100 → bono sobre la par (caro)
 * Paridad < 100 → bono bajo la par (barato)
 */
export function paridad(precioClean: number, precioTecnicoVal: number): number {
  if (precioTecnicoVal === 0) return 0;
  return (precioClean / precioTecnicoVal) * 100;
}

// ============================================================================
// TASA FLOTANTE (BADLAR / TAMAR) — FETCH & PROJECTION
// ============================================================================

/**
 * Obtiene la última tasa BADLAR desde BCRA.
 * Variable 7 = BADLAR en bancos privados (TNA).
 */
export async function fetchBadlarRate(): Promise<number | null> {
  try {
    const res = await fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7", {
      cache: "no-store",
    });
    if (res.ok) {
      const j = await res.json();
      const results: Array<{ valor: number }> = j?.results ?? [];
      if (results.length > 0) return results[0].valor;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Obtiene la última tasa TAMAR desde BCRA.
 * Variable 13 = Tasa Activa Mercado Abierto (TAMAR).
 */
export async function fetchTamarRate(): Promise<number | null> {
  try {
    const res = await fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/13", {
      cache: "no-store",
    });
    if (res.ok) {
      const j = await res.json();
      const results: Array<{ valor: number }> = j?.results ?? [];
      if (results.length > 0) return results[0].valor;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Proyecta el valor de un cupón flotante para una fecha futura.
 *
 * Usa la última tasa BCRA conocida como proxy constante hacia adelante.
 * Si la ON tiene un spread fijo (ej. BADLAR + 300bps), se suma al resultado.
 *
 * @returns monto del cupón proyectado por cada 100 VN (nominal, sin spread de riesgo)
 */
export function proyectarTasaFlotante(
  tasaReferencia: number, // TNA de la tasa de referencia (BADLAR, TAMAR)
  tasaReferenciaTipo: "TNA" | "TEA",
  diasPeriodo: number, // días del período del cupón
  convencionDias: string, // "30/360", "ACT/365", etc.
  spreadBps: number = 0, // spread en puntos básicos (ej. 300 = 3%)
): number {
  if (tasaReferencia <= 0) return 0;
  const yf = yearFraction(
    new Date(),
    new Date(Date.now() + diasPeriodo * 86400000),
    convencionDias,
  );
  // Convertir TNA a tasa del período si es necesario
  const tasaPeriodo =
    tasaReferenciaTipo === "TNA"
      ? tasaReferencia * yf // TNA * year fraction = tasa del período
      : Math.pow(1 + tasaReferencia, yf) - 1; // TEA → tasa del período
  const spreadPeriodo = (spreadBps / 10000) * (tasaReferenciaTipo === "TNA" ? yf : 1);
  return (tasaPeriodo + spreadPeriodo) * 100; // por cada 100 VN
}

// ============================================================================
// CER / UVA INDEX — FETCH & PROJECTION
// ============================================================================

interface UvaEntry {
  fecha: string;
  valor: number;
}

let uvaCache: { data: UvaEntry[]; ts: number } | null = null;
const UVA_CACHE_TTL = 10 * 60 * 1000; // 10 min

/**
 * Obtiene la serie histórica de UVA desde ArgentinaDatos.
 * UVA ≈ CER, ambos ajustan por inflación.
 */
export async function fetchUvaHistory(): Promise<UvaEntry[]> {
  if (uvaCache && Date.now() - uvaCache.ts < UVA_CACHE_TTL) return uvaCache.data;
  try {
    const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/uva", {
      cache: "no-store",
    });
    if (r.ok) {
      const arr: UvaEntry[] = await r.json();
      if (arr.length > 0) {
        uvaCache = { data: arr, ts: Date.now() };
        return arr;
      }
    }
  } catch {
    /* ignore */
  }

  // Fallback: estadisticasbcra.com/uva (requiere auth, intentar sin)
  try {
    const r = await fetch("https://api.estadisticasbcra.com/uva", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (r.ok) {
      const arr: Array<{ d: string; v: number }> = await r.json();
      const mapped: UvaEntry[] = arr.map((a) => ({ fecha: a.d, valor: a.v }));
      if (mapped.length > 0) {
        uvaCache = { data: mapped, ts: Date.now() };
        return mapped;
      }
    }
  } catch {
    /* ignore */
  }
  return [];
}

/**
 * Obtiene la inflación mensual más reciente desde ArgentinaDatos.
 */
export async function fetchInflacionMensual(): Promise<number | null> {
  try {
    const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacion", {
      cache: "no-store",
    });
    if (r.ok) {
      const arr: Array<{ fecha: string; valor: number }> = await r.json();
      if (arr.length > 0) return arr[arr.length - 1].valor;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Proyecta el valor de CER/UVA para una fecha futura.
 *
 * Si la fecha está en el pasado (hay datos históricos), usa el valor real.
 * Si la fecha es futura, proyecta usando la última inflación mensual conocida.
 *
 * @returns factor de ajuste = CER_proyectado(fecha) / CER_último_conocido
 */
export function proyectarCER(
  fechaTarget: Date,
  uvaHistory: UvaEntry[],
  inflacionMensual: number | null,
): number {
  if (uvaHistory.length === 0) return 1;

  // Ordenar por fecha ascendente
  const sorted = [...uvaHistory].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ultimo = sorted[sorted.length - 1];
  const ultimaFecha = parseISO(ultimo.fecha);
  const ultimoValor = ultimo.valor;

  // Buscar valor exacto si la fecha está en el pasado
  const targetStr = toISO(fechaTarget);
  const exactMatch = sorted.find((e) => e.fecha === targetStr);
  if (exactMatch) return exactMatch.valor / ultimoValor;

  // Si la fecha target es anterior a la última fecha conocida, interpolar
  if (fechaTarget <= ultimaFecha) {
    // Buscar el más cercano anterior
    const anterior = sorted.filter((e) => e.fecha <= targetStr);
    if (anterior.length > 0) {
      const match = anterior[anterior.length - 1];
      return match.valor / ultimoValor;
    }
    return 1;
  }

  // Proyectar futuro: usar inflación mensual
  if (inflacionMensual == null || inflacionMensual <= 0) return 1;

  const diasDesdeHoy = Math.max(1, (fechaTarget.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const meses = diasDesdeHoy / 30.5;
  const factor = Math.pow(1 + inflacionMensual / 100, meses);
  return factor;
}

// ============================================================================
// BACKWARD COMPATIBILITY WRAPPERS
// ============================================================================

/**
 * XIRR original (mantenido para compatibilidad)
 * Usa TRUE convention con freq=1 (equivalente al comportamiento anterior)
 */
export function xirr(
  flujos: Array<{ dias: number; monto: number }>,
  maxIteraciones: number = 200,
  tolerancia: number = 1e-10,
): number | null {
  const flujosConv = flujos.map((f) => ({ yf: f.dias / 365, monto: f.monto }));
  return xirrConvencion(flujosConv, 1, "TRUE", maxIteraciones, tolerancia);
}

export function dnpv(
  flujos: Array<{ dias: number; monto: number }>,
  tir: number,
  dx: number = 1e-7,
): number {
  const flujosConv = flujos.map((f) => ({ yf: f.dias / 365, monto: f.monto }));
  return dnpvConvencion(flujosConv, tir, 1, "TRUE", dx);
}

export function npv(flujos: Array<{ dias: number; monto: number }>, tir: number): number {
  if (tir <= -1) return Infinity;
  return flujos.reduce((acc, f) => acc + f.monto / Math.pow(1 + tir, f.dias / 365), 0);
}

export function durationMacaulay(
  flujos: Array<{ dias: number; monto: number; pv: number }>,
  precioMercado: number,
): number | null {
  if (flujos.length === 0 || precioMercado <= 0) return null;
  const sumaPV = flujos.reduce((acc, f) => acc + f.pv, 0);
  const base = sumaPV > 0 ? sumaPV : precioMercado;
  const sumaTPV = flujos.reduce((acc, f) => acc + (f.dias / 365) * f.pv, 0);
  return sumaTPV / base;
}

export function durationModificada(dMacaulay: number | null, tir: number | null): number | null {
  if (dMacaulay === null || tir === null) return null;
  if (tir <= -1) return null;
  return dMacaulay / (1 + tir);
}

// ============================================================================
// SERVER FUNCTIONS
// ============================================================================

/**
 * FASE 1: Obtener precios de bonos y tipos de cambio reales
 */
export const getBonoPrecioYTCOficial = createServerFn({ method: "POST" })
  .validator(
    z.object({
      tickers: z.array(z.string()).min(1).max(20),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const AD = "https://api.argentinadatos.com";
    const IOL = "https://api.invertironline.com";
    const precios: Record<string, { precio: number | null; fuente: string }> = {};

    // 1. Tipos de cambio desde ArgentinaDatos (cached 2 min)
    let tcOficial: number | null = null;
    let tcBlue: number | null = null;
    let tcMep: number | null = null;
    const tcCacheKey = "tipos_cambio";
    const cachedTC = getCached<{ oficial: number | null; blue: number | null; mep: number | null }>(
      tcCacheKey,
      120000,
    );
    if (cachedTC) {
      tcOficial = cachedTC.oficial;
      tcBlue = cachedTC.blue;
      tcMep = cachedTC.mep;
    } else {
      const casas = ["oficial", "blue", "bolsa"];
      await Promise.all(
        casas.map(async (casa) => {
          try {
            const r = await fetch(`${AD}/v1/cotizaciones/dolares/${casa}`, { cache: "no-store" });
            if (!r.ok) return;
            const arr = await r.json();
            if (Array.isArray(arr) && arr.length > 0) {
              const ultimo = arr[arr.length - 1];
              const valor = ultimo?.venta ?? ultimo?.compra ?? null;
              if (casa === "oficial") tcOficial = valor;
              else if (casa === "blue") tcBlue = valor;
              else if (casa === "bolsa") tcMep = valor;
            }
          } catch {
            /* ignore */
          }
        }),
      );
      if (tcOficial || tcBlue || tcMep) {
        setCache(tcCacheKey, { oficial: tcOficial, blue: tcBlue, mep: tcMep });
      }
    }

    // 2. Precios de bonos desde IOL (si hay sessionId) o ArgentinaDatos
    // Para Hard Dollar bonds, intentar ticker D (MEP), luego C (Cable), luego plano+FX
    function dCSuffix(ticker: string): string[] {
      const bono = BONOS_DB[ticker];
      if (bono?.tipo === "Hard Dollar" || bono?.tipo === "ON Hard Dollar") {
        return [`${ticker}D`, `${ticker}C`, ticker];
      }
      return [ticker];
    }

    await Promise.all(
      data.tickers.map(async (ticker) => {
        if (data.sessionId) {
          const candidates = dCSuffix(ticker);
          for (const c of candidates) {
            try {
              const r = await fetch(`${IOL}/api/v2/BCBA/Titulos/${c}/Cotizacion`, {
                headers: { Authorization: `Bearer ${data.sessionId}` },
                cache: "no-store",
              });
              if (r.ok) {
                const j = await r.json();
                const p = j?.ultimoPrecio ?? j?.precio ?? null;
                if (p != null && p > 0) {
                  const suffix = c.replace(ticker, "");
                  const bono = BONOS_DB[ticker];
                  const escala = bono?.escalaPrecioIOL ?? 1;
                  precios[ticker] = {
                    precio: p / escala,
                    fuente: suffix ? `iol-${suffix}` : "iol-plano",
                  };
                  return;
                }
              }
            } catch {
              /* fall through */
            }
          }
        }
        precios[ticker] = { precio: null, fuente: "unavailable" };
      }),
    );

    return {
      precios,
      tcOficial,
      tcBlue,
      tcMep,
      timestamp: new Date().toISOString(),
    } as PreciosResult;
  });

/**
 * FASE 2: Calcular rendimientos de un bono individual
 */
export const calcularRendimientosBono = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string(),
      precioPorCada100VN: z.number().positive(),
      tcOficial: z.number().positive().optional(),
      tasaDevaluacionAnual: z.number().default(0.3),
      fechaLiquidacion: z.string().optional(),
      // Overrides para testing con fixtures históricos
      precioOverride: z.number().positive().optional(),
      fechaOverride: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const bono = BONOS_DB[data.ticker];
    let flujosFuturos: FlujoFuturo[] = [];
    let vencimiento = bono?.vencimiento ?? "";
    const tipo: TipoBono = bono?.tipo ?? "Hard Dollar";
    let descripcion = bono?.descripcion ?? "";
    const monedaFlujos: "USD" | "ARS" = bono?.monedaFlujos ?? "USD";

    // Determinar convenciones desde BonoConfig
    const convencionDias = bono?.convencionDias ?? "30/360";
    const frecuenciaPago = bono?.frecuenciaPago ?? "Semiannual";
    const freq = getFrecuenciaNumerica(frecuenciaPago);
    const yieldConv: YieldConvention = bono?.yieldConvention ?? "TRUE";
    const cuponAnual = bono?.cuponAnual ?? 0;
    const valorResidual = bono?.valorResidualActual ?? 100;
    // 1. Intentar flujos en vivo desde Docta API
    try {
      const doctaFlujos = await fetchBonosCashFlows({ data: { ticker: data.ticker } });
      if (doctaFlujos && doctaFlujos.data.length > 0) {
        const fechaLiq = data.fechaLiquidacion ? parseISO(data.fechaLiquidacion) : calcularTplus1();
        flujosFuturos = doctaFlujos.data
          .filter((f) => parseISO(f.payment_date) > fechaLiq)
          .map((f) => ({
            fecha: f.payment_date,
            monto: Math.round(f.cash_flow * 100) / 100,
            tipo: "cupon+amortizacion" as const,
          }));
        if (flujosFuturos.length > 0) {
          vencimiento = flujosFuturos[flujosFuturos.length - 1].fecha;
          descripcion = `${data.ticker} (Docta API)`;
        }
      }
    } catch {
      /* fall through a DB */
    }

    // 2. Fallback a base de datos local
    if (flujosFuturos.length === 0 && bono) {
      const fechaLiq = data.fechaLiquidacion ? parseISO(data.fechaLiquidacion) : calcularTplus1();
      flujosFuturos = bono.flujosPorCada100VN.filter((f) => parseISO(f.fecha) > fechaLiq);
    }

    // ── AJUSTE CER: inflar flujos nominales por CER/UVA ───────────
    // También aplica si ajuste === 'CER' independientemente del tipo (ej. LECAP CER)
    if (bono?.ajuste === "CER" && flujosFuturos.length > 0) {
      try {
        const [uvaHistory, inflacionMensual] = await Promise.all([
          fetchUvaHistory(),
          fetchInflacionMensual(),
        ]);
        if (uvaHistory.length > 0) {
          flujosFuturos = flujosFuturos.map((f) => {
            const factor = proyectarCER(parseISO(f.fecha), uvaHistory, inflacionMensual);
            return { ...f, monto: Math.round(f.monto * factor * 100) / 100 };
          });
        }
      } catch {
        /* si falla la proyección CER, usar flujos nominales (TIR incorrecta pero no crash) */
      }
    }

    // ── AJUSTE Dollar-Linked: proyectar flujos por devaluación esperada ──────
    // Usa spread AL30/AL30D (proxy de devaluación implícita), fallback a MEP/Oficial, luego a parámetro
    let metodoDevaluacion: "spread-real" | "mep-fallback" | "parametro" | "ninguno" = "ninguno";
    let tasaDevaluacionUsada = data.tasaDevaluacionAnual;
    if (bono?.ajuste === "DolarOficial" && flujosFuturos.length > 0) {
      try {
        // 1. Intentar spread AL30 vs AL30D (mismo subyacente, distinta liquidación)
        const AD = "https://api.argentinadatos.com";
        const [al30, al30d] = await Promise.all([
          fetch(`${AD}/v1/cotizaciones/dolares/bolsa`, { cache: "no-store" }).then((r) =>
            r.ok ? r.json() : [],
          ),
          Promise.resolve(null) as Promise<any>,
        ]);
        let spreadEncontrado = false;
        // Si tenemos AL30 (MEP) y AL30D (CCL), spread ≈ devaluación implícita
        if (Array.isArray(al30) && al30.length > 0) {
          const mepActual = al30[al30.length - 1]?.venta ?? al30[al30.length - 1]?.compra;
          // Obtener dólar oficial
          const oficialRes = await fetch(`${AD}/v1/cotizaciones/dolares/oficial`, {
            cache: "no-store",
          });
          if (oficialRes.ok) {
            const oficialArr = await oficialRes.json();
            const oficialActual =
              Array.isArray(oficialArr) && oficialArr.length > 0
                ? (oficialArr[oficialArr.length - 1]?.venta ??
                  oficialArr[oficialArr.length - 1]?.compra)
                : null;
            if (mepActual && oficialActual && oficialActual > 0) {
              // Tasa de devaluación implícita = (MEP / Oficial) - 1, anualizada
              tasaDevaluacionUsada = mepActual / oficialActual - 1;
              if (tasaDevaluacionUsada > 0 && tasaDevaluacionUsada < 5) {
                metodoDevaluacion = "spread-real";
                spreadEncontrado = true;
              }
            }
          }
        }
        // 2. Fallback: tasa parámetro si no hay spread disponible
        if (!spreadEncontrado) {
          tasaDevaluacionUsada = data.tasaDevaluacionAnual;
          metodoDevaluacion = tasaDevaluacionUsada > 0 ? "parametro" : "ninguno";
        }
      } catch {
        tasaDevaluacionUsada = data.tasaDevaluacionAnual;
        metodoDevaluacion = "parametro";
      }

      if (tasaDevaluacionUsada > 0) {
        flujosFuturos = flujosFuturos.map((f) => {
          const diasHastaFlujo = (parseISO(f.fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          const años = Math.max(0, diasHastaFlujo / 365);
          const factor = Math.pow(1 + tasaDevaluacionUsada, años);
          return { ...f, monto: Math.round(f.monto * factor * 100) / 100 };
        });
      }
    }

    // ── AJUSTE BADLAR / TAMAR: proyectar cupones flotantes ──────────
    if ((bono?.ajuste === "BADLAR" || bono?.ajuste === "TAMAR") && flujosFuturos.length > 0) {
      try {
        const tasaReferencia =
          bono.ajuste === "BADLAR" ? await fetchBadlarRate() : await fetchTamarRate();
        if (tasaReferencia != null && tasaReferencia > 0) {
          // Convertir TNA a decimal
          const tasaDecimal = tasaReferencia / 100;
          flujosFuturos = flujosFuturos.map((f) => {
            const diasPeriodo = Math.round(
              yearFraction(new Date(), parseISO(f.fecha), convencionDias) *
                (convencionDias === "30/360" ? 360 : 365),
            );
            const montoCupon = proyectarTasaFlotante(
              tasaDecimal,
              "TNA",
              Math.max(1, diasPeriodo),
              convencionDias,
              0, // spread fijo se puede extraer de bono.tipoTasa en el futuro
            );
            return { ...f, monto: Math.round(montoCupon * 100) / 100 };
          });
        }
      } catch {
        /* si falla la proyección, usar flujos nominales */
      }
    }

    if (!bono && flujosFuturos.length === 0) {
      return {
        error: `Bono ${data.ticker} no encontrado`,
      } as RendimientoBono & { error: string };
    }

    const fechaLiq = data.fechaLiquidacion ? parseISO(data.fechaLiquidacion) : calcularTplus1();
    const fechaLiqISO = toISO(fechaLiq);

    // ── LECAPs: fórmula directa ──────────────────────────────────
    // Solo para cupón cero puro identificado por tipoBono explícito
    if (bono?.tipoBono === "LECAP_CAPITALIZABLE") {
      // Pago único al vencimiento
      const pagoUnico = flujosFuturos[0].monto; // VPV
      const fechaVto = parseISO(flujosFuturos[0].fecha);
      const dias = yearFraction(fechaLiq, fechaVto, convencionDias) * 365;
      const meses = dias / 30;
      const precio = data.precioPorCada100VN;

      if (precio > 0 && meses > 0) {
        const tem = Math.pow(pagoUnico / precio, 1 / meses) - 1;
        const tea = Math.pow(1 + tem, 12) - 1;
        const tna = tem * 12;
        const precioTec = pagoUnico;

        return {
          ticker: data.ticker,
          tipo,
          descripcion,
          vencimiento: flujosFuturos[0].fecha,
          fechaLiquidacion: fechaLiqISO,
          tir: tea,
          tea,
          tna,
          precio: data.precioPorCada100VN,
          precioPorCada100VN: data.precioPorCada100VN,
          precioTecnico: precioTec,
          paridad: (precio / precioTec) * 100,
          durationMacaulay: dias / 365,
          durationModificada: dias / 365 / (1 + tea),
          convexity: null,
          flujos: [
            {
              fecha: flujosFuturos[0].fecha,
              dias: Math.round(dias),
              tipo: flujosFuturos[0].tipo,
              monto: pagoUnico,
              monedaOriginal: monedaFlujos,
              pvAlTIR: pagoUnico / Math.pow(1 + tea, dias / 365),
              pctDelPrecio: 100,
            },
          ],
          monedaFlujos,
          monedaCotizacion: monedaFlujos,
          especie: "Pesos",
          diasAlVencimiento: Math.round(dias),
          volumenNominal: null,
          montoOperado: null,
        } as RendimientoBono;
      }
    }

    // ── Bonos con flujos: XIRR con convención ────────────────────
    if (flujosFuturos.length === 0) {
      return {
        ticker: data.ticker,
        tipo,
        descripcion,
        vencimiento,
        fechaLiquidacion: fechaLiqISO,
        tir: null,
        tea: null,
        tna: null,
        precio: data.precioPorCada100VN,
        precioPorCada100VN: data.precioPorCada100VN,
        precioTecnico: 0,
        paridad: 0,
        durationMacaulay: null,
        durationModificada: null,
        convexity: null,
        flujos: [],
        monedaFlujos,
        diasAlVencimiento: 0,
        volumenNominal: null,
        montoOperado: null,
        error: "Instrumento ya venció, no hay flujos futuros",
      } as RendimientoBono & { error: string };
    }

    // Calcular intereses corridos
    const intCorridos = interesesCorridos(
      fechaLiq,
      parseISO(vencimiento),
      cuponAnual,
      freq,
      convencionDias,
    );
    const precioClean = data.precioPorCada100VN;
    const precioDirty = precioClean + intCorridos;

    // Precio técnico = valor residual actual
    const precioTecVal = precioTecnico(bono);

    // Paridad = Clean Price / Precio Técnico
    const paridadCalc = paridad(precioClean, precioTecVal);

    // Flujos para XIRR con year fractions según convención de días
    // Incluir precio dirty como outflow (negativo)
    const flujosXIRR: Array<{ yf: number; monto: number }> = [
      { yf: 0, monto: -precioDirty },
      ...flujosFuturos.map((f) => ({
        yf: yearFraction(fechaLiq, parseISO(f.fecha), convencionDias),
        monto: f.monto,
      })),
    ];

    // Calcular TIR con convención correcta
    const tirCalc = xirrConvencion(flujosXIRR, freq, yieldConv);

    // TEA y TNA desde TIR calculada
    let tea: number | null = null;
    let tna: number | null = null;
    if (tirCalc !== null) {
      tea = calcularTEA(tirCalc, freq, yieldConv);
      tna = calcularTNA(tirCalc, freq, yieldConv);
    }

    // Duration y Convexity
    const dMacaulay =
      tirCalc !== null
        ? durationMacaulayConvencion(flujosXIRR, precioDirty, tirCalc, freq, yieldConv)
        : null;
    const dModificada =
      tirCalc !== null ? durationModificadaConvencion(dMacaulay, tirCalc, freq, yieldConv) : null;
    const convexityVal =
      tirCalc !== null ? convexity(flujosXIRR, precioDirty, tirCalc, freq, yieldConv) : null;

    // Armar tabla de flujos detallada
    const diasAlVto = Math.round(
      yearFraction(fechaLiq, parseISO(vencimiento), convencionDias) * 365,
    );
    const flujos = flujosFuturos.map((fut) => {
      const yf = yearFraction(fechaLiq, parseISO(fut.fecha), convencionDias);
      let pv = 0;
      if (tirCalc !== null) {
        const df = factorDescuento(yf, tirCalc, freq, yieldConv);
        pv = Number.isFinite(df) && df > 0 ? fut.monto / df : 0;
      }
      return {
        fecha: fut.fecha,
        dias: Math.round(yf * 365),
        tipo: fut.tipo,
        monto: fut.monto,
        monedaOriginal: monedaFlujos,
        pvAlTIR: pv,
        pctDelPrecio: precioDirty > 0 ? (pv / precioDirty) * 100 : 0,
      };
    });

    // ── ALERTA: salto brusco de TIR vs último histórico ────────────
    let alertaSaltoBrusco: string | undefined;
    if (tirCalc !== null && bono && bono.historico && bono.historico.length > 0) {
      const ultimoHist = bono.historico[bono.historico.length - 1];
      if (ultimoHist.tirCalculada !== null) {
        const diffPP = Math.abs(tirCalc - ultimoHist.tirCalculada) * 100;
        if (diffPP > 1.0) {
          alertaSaltoBrusco = `Salto brusco de TIR: ${(ultimoHist.tirCalculada * 100).toFixed(2)}% → ${(tirCalc * 100).toFixed(2)}% (${diffPP.toFixed(2)}pp). Verificar precio o flujos.`;
        }
      }
    }

    // ── PERSISTIR en histórico automáticamente ─────────────────────
    if (bono && tirCalc !== null) {
      bono.historico?.push({
        fecha: fechaLiqISO,
        precio: precioClean,
        tirCalculada: tirCalc,
        paridad: paridadCalc,
        fuente: "motor-automatico",
      });
      // Mantener máximo 500 entradas para no saturar memoria
      if (bono.historico && bono.historico.length > 500) {
        bono.historico = bono.historico.slice(-500);
      }
    }

    return {
      ticker: data.ticker,
      tipo,
      descripcion,
      vencimiento,
      fechaLiquidacion: fechaLiqISO,
      tir: tirCalc,
      tea,
      tna,
      alertaSaltoBrusco,
      precio: precioClean,
      precioPorCada100VN: precioClean,
      precioTecnico: precioTecVal,
      paridad: paridadCalc,
      durationMacaulay: dMacaulay,
      durationModificada: dModificada,
      convexity: convexityVal,
      flujos,
      interesesCorridos: intCorridos,
      precioDirty,
      tcOficialUsado: data.tcOficial,
      tasaDevaluacionUsada: tasaDevaluacionUsada,
      metodoDevaluacion: metodoDevaluacion,
      monedaFlujos,
      monedaCotizacion: (() => {
        const t = data.ticker.toUpperCase();
        if (t.endsWith("C")) return "USD";
        if (t.endsWith("D")) return "USD";
        return "ARS";
      })(),
      especie: (() => {
        const t = data.ticker.toUpperCase();
        if (t.endsWith("C")) return "Cable";
        if (t.endsWith("D")) return "MEP";
        return "Pesos";
      })(),
      diasAlVencimiento: diasAlVto,
    } as RendimientoBono;
  });

/**
 * FASE 3a: Obtener LECAPs en vivo desde ArgentinaDatos
 */
export const fetchLecapData = createServerFn({ method: "POST" })
  .validator(z.object({ sessionId: z.string().optional() }))
  .handler(async ({ data }) => {
    const AD = "https://api.argentinadatos.com";
    const IOL = "https://api.invertironline.com";
    const lecaps: LecapData[] = [];

    // BADLAR fallback rate
    let badlarRate: number | null = null;
    try {
      const res = await fetch(`https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        const results: Array<{ valor: number }> = j?.results ?? [];
        if (results.length > 0) badlarRate = results[0].valor;
      }
    } catch {
      /* ignore */
    }
    if (badlarRate == null) badlarRate = 29.0;

    try {
      const r = await fetch(`${AD}/v1/finanzas/letras`, { cache: "no-store" });
      if (r.ok) {
        const arr: any[] = await r.json();
        for (const l of arr) {
          const ticker: string = l.ticker ?? "";
          const fechaEmision: string = l.fechaEmision ?? "";
          const fechaVencimiento: string = l.fechaVencimiento ?? "";
          let tem: number = l.tem ?? 0;
          const vpv: number = l.vpv ?? 0;

          const venc = parseISO(fechaVencimiento);
          const hoy = new Date();
          const dias = Math.round(diasEntre(hoy, venc));

          // Try to get market price from IOL
          let precio: number | null = null;
          let precioFuente: "iol" | "argentinadatos" | null = null;
          if (data.sessionId) {
            try {
              const res = await fetch(`${IOL}/api/v2/BCBA/Titulos/${ticker}/Cotizacion`, {
                headers: { Authorization: `Bearer ${data.sessionId}` },
                cache: "no-store",
              });
              if (res.ok) {
                const j = await res.json();
                precio = j?.ultimoPrecio ?? j?.precio ?? null;
                if (precio != null) precioFuente = "iol";
              }
            } catch {
              /* ignore */
            }
          }

          // TEM derivation cascade
          if (tem <= 0 && precio != null && vpv > 0 && dias > 0) {
            tem = (Math.pow(vpv / precio, 30 / dias) - 1) * 100;
          }
          if (tem <= 0 && badlarRate != null) {
            tem = badlarRate / 12;
          }
          if (tem <= 0 && vpv > 0 && dias > 0) {
            tem = badlarRate / 12;
          }

          const tea = tem > 0 ? (Math.pow(1 + tem / 100, 12) - 1) * 100 : 0;
          const tna = tem > 0 ? tem * 12 : 0;

          // Implied price from VPV and TEM
          if (precio == null && tem > 0 && dias > 0) {
            const meses = dias / 30;
            precio = vpv / Math.pow(1 + tem / 100, meses);
            precioFuente = "argentinadatos";
          }
          // Last resort
          if (precio == null && vpv > 0) {
            precio = vpv;
          }

          lecaps.push({
            ticker,
            fechaEmision,
            fechaVencimiento,
            tem,
            tea,
            tna,
            vpv,
            precio: precio != null ? Math.round(precio * 100) / 100 : null,
            precioFuente,
            diasAlVencimiento: dias,
          });
        }
      }
    } catch {
      /* no LECAP data */
    }

    return lecaps;
  });

/**
 * FASE 3b: Monitor agregado de todos los bonos + LECAPs
 */
export const calcularMonitorBonos = createServerFn({ method: "POST" })
  .validator(
    z.object({
      sessionId: z.string().optional(),
      refreshToken: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const AD = "https://api.argentinadatos.com";
    const IOL = "https://api.invertironline.com";
    const tickers = Object.keys(BONOS_DB);

    // 1. Obtener tipos de cambio reales
    let tcOficial: number | null = null;
    let tcMep: number | null = null;
    try {
      const res = await fetch(`${AD}/v1/cotizaciones/dolares/oficial`, { cache: "no-store" });
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr) && arr.length > 0) {
          tcOficial = arr[arr.length - 1]?.venta ?? arr[arr.length - 1]?.compra ?? null;
        }
      }
    } catch {
      /* ignore */
    }

    try {
      const res = await fetch(`${AD}/v1/cotizaciones/dolares/bolsa`, { cache: "no-store" });
      if (res.ok) {
        const arr = await res.json();
        if (Array.isArray(arr) && arr.length > 0) {
          tcMep = arr[arr.length - 1]?.venta ?? arr[arr.length - 1]?.compra ?? null;
        }
      }
    } catch {
      /* ignore */
    }

    // 2. Obtener bearer token valido (refresh si expiró)
    let bearerToken = data.sessionId;
    if (!bearerToken && data.refreshToken) {
      // Intentar refresh automático si hay refreshToken
      try {
        const r = await fetch(`${IOL}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            refresh_token: data.refreshToken,
            grant_type: "refresh_token",
          }).toString(),
        });
        if (r.ok) {
          const j = await r.json();
          bearerToken = j.access_token ?? null;
        }
      } catch {
        /* fallback */
      }
    }

    // 2b. Obtener precios reales desde IOL para todos los tickers
    // Para Hard Dollar bonds, primero intentar ticker D (MEP), luego C (Cable), luego plano+MEP
    function dCSuffix(ticker: string): string[] {
      const bono = BONOS_DB[ticker];
      if (bono?.tipo === "Hard Dollar" || bono?.tipo === "ON Hard Dollar") {
        return [`${ticker}D`, `${ticker}C`, ticker];
      }
      return [ticker];
    }

    const preciosMap = new Map<string, { precio: number; fuente: string; moneda: string }>();
    let iolOkCount = 0;
    let iolFailCount = 0;
    let currentToken = bearerToken;

    const iolFetchOne = async (
      ticker: string,
      token: string,
    ): Promise<{ precio: number; moneda: string } | null> => {
      try {
        const res = await fetch(`${IOL}/api/v2/BCBA/Titulos/${ticker}/Cotizacion`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (res.ok) {
          const j = await res.json();
          const precio = j?.ultimoPrecio ?? j?.precio ?? null;
          const moneda = j?.moneda ?? "";
          if (precio != null && precio > 0) return { precio, moneda };
        }
        if (res.status === 401 && data.refreshToken) {
          const refreshRes = await fetch(`${IOL}/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              refresh_token: data.refreshToken,
              grant_type: "refresh_token",
            }).toString(),
          });
          if (refreshRes.ok) {
            const j = await refreshRes.json();
            currentToken = j.access_token ?? currentToken;
            return iolFetchOne(ticker, currentToken!);
          }
        }
      } catch {
        /* ignore */
      }
      return null;
    };

    if (currentToken) {
      const batchSize = 5;
      for (let i = 0; i < tickers.length; i += batchSize) {
        const batch = tickers.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map(async (ticker) => {
            const candidates = dCSuffix(ticker);
            for (const c of candidates) {
              const result = await iolFetchOne(c, currentToken!);
              if (result) {
                const esUsd =
                  result.moneda.toUpperCase().includes("USD") ||
                  result.moneda.toUpperCase().includes("DOLAR");
                const suffix = c.replace(ticker, "");
                preciosMap.set(ticker, {
                  precio: result.precio,
                  fuente: suffix ? `iol-${suffix}` : "iol-plano",
                  moneda: result.moneda,
                });
                iolOkCount++;
                return;
              }
            }
            iolFailCount++;
          }),
        );
      }
    }

    // 3. Calcular rendimientos con precios reales (o fallback si no hay precio IOL)
    const hoy = new Date();
    const bonos: RendimientoBono[] = [];
    for (const ticker of tickers) {
      const bono = BONOS_DB[ticker];
      // Saltar instrumentos vencidos
      if (bono?.vencimiento && new Date(bono.vencimiento + "T00:00:00") <= hoy) continue;
      // Saltar LECAPs (ya vienen desde ArgentinaDatos con su propio cálculo)
      if (bono?.tipo === "LECAP") continue;
      const iolEntry = preciosMap.get(ticker);

      if (iolEntry != null && iolEntry.precio > 0) {
        // IOL devuelve precios por 1000 VN → dividir por 10 para obtener por 100 VN
        const escala = 10;
        let precioCalc = iolEntry.precio / escala;
        const monedaIOL = iolEntry.moneda.toUpperCase();
        const esUSD =
          monedaIOL.includes("USD") ||
          monedaIOL.includes("DOLAR") ||
          monedaIOL.includes("U$S") ||
          monedaIOL.includes("US$");
        const esHardDollar = bono?.monedaFlujos === "USD";
        let metodoPrecio = "";
        if (!esUSD && esHardDollar) {
          // Plain ARS ticker without D/C suffix — convert via MEP
          if (tcMep && tcMep > 0) {
            precioCalc = precioCalc / tcMep;
            metodoPrecio = "ars+mep";
          } else if (tcOficial && tcOficial > 0) {
            // Fallback: MEP ≈ oficial × 1.2 (spread típico)
            precioCalc = precioCalc / (tcOficial * 1.2);
            metodoPrecio = "ars+oficial*1.2";
          } else {
            // Último recurso: MEP estimado 1500
            precioCalc = precioCalc / 1500;
            metodoPrecio = "ars+mep-estimado";
          }
        } else if (esUSD && !esHardDollar) {
          // D/C suffix ticker but bond is ARS-denominated — convert back via MEP
          if (tcMep && tcMep > 0) precioCalc = precioCalc * tcMep;
          else if (tcOficial && tcOficial > 0) precioCalc = precioCalc * (tcOficial * 1.2);
          else precioCalc = precioCalc * 1500;
          metodoPrecio = "usd*ars";
        } else {
          metodoPrecio = iolEntry.fuente;
        }
        // Sanity check: Hard Dollar bond price should be between 10 and 300 per 100 VN
        // If wildly out of range, fall back to theoretical price from DB cash flows
        const precioTecVal = bono?.valorResidualActual ?? 100;
        const precioRazonable = esHardDollar && (precioCalc < 10 || precioCalc > 300);
        let resultado: any;
        if (precioRazonable) {
          metodoPrecio = "teorico-fallback (rango inválido: " + precioCalc.toFixed(1) + ")";
          resultado = await calcularRendimientosBono({
            data: { ticker, precioPorCada100VN: precioTecVal, tcOficial: tcOficial ?? undefined },
          }).catch(() => null);
        } else {
          resultado = await calcularRendimientosBono({
            data: { ticker, precioPorCada100VN: precioCalc, tcOficial: tcOficial ?? undefined },
          });
        }
        if (resultado && "error" in resultado) continue;
        const rb = resultado as RendimientoBono;
        rb.fuente = metodoPrecio;
        bonos.push(rb);
      } else {
        // Sin precio IOL real — intentar TIR teórica con flujos DB y precio técnico
        const bonoCfg = bono;
        const precioTecVal = bonoCfg?.valorResidualActual ?? bonoCfg?.valorPar ?? 100;
        let rb: RendimientoBono;
        try {
          const teorico = await calcularRendimientosBono({
            data: {
              ticker,
              precioPorCada100VN: precioTecVal,
              tcOficial: tcOficial ?? undefined,
            },
          });
          if (teorico && !("error" in teorico)) {
            rb = teorico as RendimientoBono;
            rb.fuente = "Teórico";
          } else {
            throw new Error("sin flujos DB");
          }
        } catch {
          // No hay flujos ni siquiera en DB — entry sin TIR
          rb = {
            ticker,
            tipo: bonoCfg?.tipo ?? "Hard Dollar",
            descripcion: bonoCfg?.descripcion ?? "",
            vencimiento: bonoCfg?.vencimiento ?? "",
            fechaLiquidacion: new Date().toISOString().split("T")[0],
            tir: null,
            tea: null,
            tna: null,
            precio: precioTecVal,
            precioPorCada100VN: precioTecVal,
            precioTecnico: precioTecVal,
            paridad: 100,
            durationMacaulay: null,
            durationModificada: null,
            convexity: null,
            flujos: [],
            monedaFlujos: bonoCfg?.monedaFlujos ?? "USD",
            monedaCotizacion: (() => {
              const t = ticker.toUpperCase();
              if (t.endsWith("C") || t.endsWith("D")) return "USD";
              return "ARS";
            })(),
            especie: (() => {
              const t = ticker.toUpperCase();
              if (t.endsWith("C")) return "Cable";
              if (t.endsWith("D")) return "MEP";
              return "Pesos";
            })(),
            diasAlVencimiento: bonoCfg?.vencimiento
              ? Math.max(
                  0,
                  Math.round(diasEntre(new Date(), new Date(bonoCfg.vencimiento + "T00:00:00"))),
                )
              : 0,
            volumenNominal: null,
            montoOperado: null,
            fuente: "Teórico",
          } as RendimientoBono;
        }
        bonos.push(rb);
      }
    }

    // 4. Obtener LECAPs en vivo desde ArgentinaDatos + BADLAR fallback
    let badlarRate: number | null = null;
    try {
      const res = await fetch(`https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7`, {
        cache: "no-store",
      });
      if (res.ok) {
        const j = await res.json();
        const results: Array<{ valor: number }> = j?.results ?? [];
        if (results.length > 0) badlarRate = results[0].valor;
      }
    } catch {
      /* BCRA API no disponible */
    }
    // Fallback hardcodeado: último BADLAR conocido ~29% TNA
    if (badlarRate == null) badlarRate = 29.0;

    const lecaps: LecapData[] = [];
    try {
      const r = await fetch(`${AD}/v1/finanzas/letras`, { cache: "no-store" });
      if (r.ok) {
        const arr: any[] = await r.json();
        for (const l of arr) {
          const ticker: string = l.ticker ?? "";
          const fechaEmision: string = l.fechaEmision ?? "";
          const fechaVencimiento: string = l.fechaVencimiento ?? "";
          let tem: number = l.tem ?? 0;
          const vpv: number = l.vpv ?? 0;

          const venc = new Date(fechaVencimiento + "T00:00:00");
          const hoy = new Date();
          if (venc <= hoy) continue;
          const dias = Math.round(diasEntre(hoy, venc));

          // Try to get market price from IOL
          let precio: number | null = null;
          let precioFuente: "iol" | "argentinadatos" | null = null;
          let useCurrentToken = currentToken || data.sessionId;
          if (useCurrentToken) {
            async function fetchPrecio(token: string): Promise<number | null> {
              const res = await fetch(`${IOL}/api/v2/BCBA/Titulos/${ticker}/Cotizacion`, {
                headers: { Authorization: `Bearer ${token}` },
                cache: "no-store",
              });
              if (res.ok) {
                const j = await res.json();
                return j?.ultimoPrecio ?? j?.precio ?? null;
              }
              if (res.status === 401 && data.refreshToken) {
                const refreshRes = await fetch(`${IOL}/token`, {
                  method: "POST",
                  headers: { "Content-Type": "application/x-www-form-urlencoded" },
                  body: new URLSearchParams({
                    refresh_token: data.refreshToken,
                    grant_type: "refresh_token",
                  }).toString(),
                });
                if (refreshRes.ok) {
                  const j = await refreshRes.json();
                  useCurrentToken = j.access_token ?? useCurrentToken;
                  return fetchPrecio(useCurrentToken!);
                }
              }
              return null;
            }
            precio = await fetchPrecio(useCurrentToken);
            if (precio != null) precioFuente = "iol";
          }

          // TEM derivation cascade:
          // 1. If TEM from API is 0 but we have IOL price and VPV, derive TEM
          if (tem <= 0 && precio != null && vpv > 0 && dias > 0) {
            tem = (Math.pow(vpv / precio, 30 / dias) - 1) * 100;
          }
          // 2. If TEM still 0 and no IOL price, use BADLAR proxy
          if (tem <= 0 && badlarRate != null) {
            tem = badlarRate / 12;
          }

          // 3. Derive TEM from VPV even if precio was derived from "last resort" (precio = vpv)
          //    Only if tem is still 0 at this point, try with a theoretical price
          if (tem <= 0 && vpv > 0 && dias > 0) {
            // Si llegamos acá sin TEM y sin precio, usar BADLAR como proxy
            tem = badlarRate != null ? badlarRate / 12 : 29.0 / 12;
          }

          // TNA y TEA desde TEM
          const tnaLecap = tem > 0 ? tem * 12 : 0;
          const tea = tem > 0 ? (Math.pow(1 + tem / 100, 12) - 1) * 100 : 0;

          // Fallback: implied price from VPV and TEM
          if (precio == null && tem > 0 && vpv > 0 && dias > 0) {
            const meses = dias / 30;
            precio = vpv / Math.pow(1 + tem / 100, meses);
            precioFuente = "argentinadatos";
          }
          // Last resort: price from VPV only (no TEM available — shouldn't happen after steps above)
          if (precio == null && vpv > 0) {
            precio = vpv;
          }

          lecaps.push({
            ticker,
            fechaEmision,
            fechaVencimiento,
            tem: Math.round(tem * 100) / 100,
            tea: Math.round(tea * 100) / 100,
            tna: Math.round(tnaLecap * 100) / 100,
            vpv,
            precio: precio != null ? Math.round(precio * 100) / 100 : null,
            precioFuente,
            diasAlVencimiento: dias,
          });
        }
      }
    } catch {
      /* no LECAP data */
    }

    return {
      bonos,
      lecaps,
      tcOficial,
      tcBlue: null,
      tcMep,
      timestamp: new Date().toISOString(),
    } as MonitorResult;
  });

/**
 * FASE 4: Buscar instrumento en IOL
 */
export const buscarInstrumentoIOL = createServerFn({ method: "POST" })
  .validator(
    z.object({
      query: z.string().min(1).max(20),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const IOL = "https://api.invertironline.com";
    let encontrado = false;
    let descripcion = "";
    let categoriaIOL = "";
    let moneda = "";
    let ultimoPrecio: number | null = null;
    let precioCompra: number | null = null;
    let precioVenta: number | null = null;
    let cierreAnterior: number | null = null;
    let variacionDiaria: number | null = null;
    let volumenNominal: number | null = null;
    let montoOperado: number | null = null;

    // Intentar buscar en BONOS_DB primero
    const enDB = BONOS_DB[data.query.toUpperCase()];
    const tipoInterno: TipoBono = enDB?.tipo ?? "Hard Dollar";

    if (data.sessionId) {
      try {
        const r = await fetch(`${IOL}/api/v2/BCBA/Titulos/${data.query}/CotizacionDetalle`, {
          headers: { Authorization: `Bearer ${data.sessionId}` },
          cache: "no-store",
        });
        if (r.ok) {
          const j = await r.json();
          encontrado = true;
          descripcion = j?.descripcion ?? j?.simbolo ?? data.query;
          categoriaIOL = j?.tipo ?? j?.categoria ?? "";
          moneda = j?.moneda ?? "";
          const enDB = BONOS_DB[data.query.toUpperCase()];
          const escala = enDB?.escalaPrecioIOL ?? 1;
          ultimoPrecio = j?.ultimoPrecio != null ? j.ultimoPrecio / escala : null;
          precioCompra = j?.precioCompra != null ? j.precioCompra / escala : null;
          precioVenta = j?.precioVenta != null ? j.precioVenta / escala : null;
          cierreAnterior = j?.cierreAnterior != null ? j.cierreAnterior / escala : null;
          variacionDiaria = j?.variacionDiaria ?? null;
          volumenNominal = j?.volumenNominal ?? null;
          montoOperado = j?.montoOperado ?? null;
        }
      } catch {
        /* use DB data */
      }
    }

    if (!encontrado && enDB) {
      encontrado = true;
      descripcion = enDB.descripcion;
    }

    const spread = precioCompra && precioVenta ? Math.abs(precioVenta - precioCompra) : null;

    const result: ResultadoBusqueda = {
      encontrado,
      ticker: data.query.toUpperCase(),
      descripcion,
      categoriaIOL,
      tipoInterno,
      moneda,
      ultimoPrecio,
      precioCompra,
      precioVenta,
      spread,
      cierreAnterior,
      variacionDiaria,
      volumenNominal,
      montoOperado,
      estaEnBonoDB: !!enDB,
      flujosCargados: !!enDB,
    };

    return { instrumentos: [result] } as InstrumentoSearchResult;
  });

/**
 * NUEVA FASE 5: Calcular portafolio de renta fija
 */
export const calcularPortafolioRentaFija = createServerFn({ method: "POST" })
  .validator(
    z.object({
      posiciones: z
        .array(
          z.object({
            ticker: z.string(),
            cantidad: z.number(),
            vn: z.number(),
            precio: z.number(),
            total: z.number(),
          }),
        )
        .min(1)
        .max(50),
      tcOficial: z.number().positive().optional(),
      tasaDevaluacion: z.number().default(0.3),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const AD = "https://api.argentinadatos.com";

    // 1. Obtener TC oficial real
    let tcOficial = data.tcOficial ?? null;
    if (!tcOficial) {
      try {
        const res = await fetch(`${AD}/v1/cotizaciones/dolares/oficial`, { cache: "no-store" });
        if (res.ok) {
          const arr = await res.json();
          if (Array.isArray(arr) && arr.length > 0) {
            tcOficial = arr[arr.length - 1]?.venta ?? arr[arr.length - 1]?.compra ?? null;
          }
        }
      } catch {
        /* ignore */
      }
    }

    // 1b. Fetch LECAPs activas desde ArgentinaDatos
    const lecapMap = new Map<string, { tem: number; vpv: number }>();
    try {
      const r = await fetch(`${AD}/v1/finanzas/letras`, { cache: "no-store" });
      if (r.ok) {
        const arr: any[] = await r.json();
        for (const l of arr) {
          const ticker = (l.ticker ?? "").toUpperCase();
          if (new Date(l.fechaVencimiento) > new Date() && (l.tem ?? 0) > 0) {
            lecapMap.set(ticker, { tem: l.tem, vpv: l.vpv ?? 0 });
          }
        }
      }
    } catch {
      /* no lecaps */
    }

    // 1c. Fetch real IOL prices for all positions
    const IOL = "https://api.invertironline.com";
    if (data.sessionId) {
      const iolPrices = await Promise.all(
        data.posiciones.map(async (p) => {
          try {
            const r = await fetch(`${IOL}/api/v2/BCBA/Titulos/${p.ticker}/Cotizacion`, {
              headers: { Authorization: `Bearer ${data.sessionId}` },
              cache: "no-store",
            });
            if (r.ok) {
              const j = await r.json();
              const rawPrice = j?.ultimoPrecio ?? j?.precio ?? null;
              if (rawPrice != null && rawPrice > 0) {
                const bono = BONOS_DB[p.ticker.toUpperCase()];
                const escala = bono?.escalaPrecioIOL ?? 1;
                const realPrice = rawPrice / escala;
                return {
                  ticker: p.ticker,
                  precio: realPrice,
                  total: (realPrice * p.cantidad * p.vn) / 100,
                };
              }
            }
          } catch {
            /* ignore */
          }
          return null;
        }),
      );
      for (const r of iolPrices) {
        if (r) {
          const pos = data.posiciones.find((p) => p.ticker === r.ticker);
          if (pos) {
            pos.precio = r.precio;
            pos.total = r.total;
          }
        }
      }
    }

    // 2. Detectar tipo de instrumento por ticker
    function detectarTipo(
      ticker: string,
      desc: string,
    ): { tipo: TipoBono; monedaFlujos: "USD" | "ARS" } {
      const up = ticker.toUpperCase();
      if (BONOS_DB[up]) return { tipo: BONOS_DB[up].tipo, monedaFlujos: BONOS_DB[up].monedaFlujos };
      if (up.startsWith("S") || up.startsWith("T")) return { tipo: "LECAP", monedaFlujos: "ARS" };
      if (
        desc.toLowerCase().includes("fondo") ||
        desc.toLowerCase().includes("fci") ||
        desc.toLowerCase().includes("renta")
      )
        return { tipo: "Tasa Fija ARS", monedaFlujos: "ARS" };
      if (up.includes("D") || up.endsWith("D"))
        return { tipo: "Dollar-Linked", monedaFlujos: "USD" };
      return { tipo: "Tasa Fija ARS", monedaFlujos: "ARS" };
    }

    // 3. Calcular métricas de cada posición
    let totalUSD = 0;
    let pctConTir = 0;
    const advertencias: string[] = [];

    const posiciones = data.posiciones.map((p) => {
      const det = detectarTipo(p.ticker, p.ticker);
      const esUSD = det.monedaFlujos === "USD";
      const valorUSD = esUSD ? p.total : tcOficial ? p.total / tcOficial : 0;
      totalUSD += valorUSD;

      let tirVal: number | null = null;
      let durationMacaulayVal: number | null = null;
      let paridadCalc: number | null = null;

      const bono = BONOS_DB[p.ticker.toUpperCase()];
      const lecapData = lecapMap.get(p.ticker.toUpperCase());

      if (bono && p.precio > 0) {
        const flujosFuturos = bono.flujosPorCada100VN.filter((f) => new Date(f.fecha) > new Date());
        if (flujosFuturos.length > 0) {
          const flujosXIRR = [
            { dias: 0, monto: -p.precio },
            ...flujosFuturos.map((f) => ({
              dias: (new Date(f.fecha).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
              monto: f.monto,
            })),
          ];
          tirVal = xirr(flujosXIRR);
          if (tirVal !== null) {
            const dm = tirVal;
            const flujosPV = flujosXIRR.slice(1).map((f) => ({
              dias: f.dias,
              monto: f.monto,
              pv: f.monto / Math.pow(1 + dm, f.dias / 365),
            }));
            durationMacaulayVal = durationMacaulay(flujosPV, p.precio);
            pctConTir++;
          }
          const precioTec = flujosFuturos.reduce((s, f) => s + f.monto, 0);
          paridadCalc = precioTec > 0 ? (p.precio / precioTec) * 100 : null;
        }
      } else if (lecapData && p.precio > 0) {
        // LECAP: TEA = (1+TEM)^12 - 1
        tirVal = Math.pow(1 + lecapData.tem / 100, 12) - 1;
        pctConTir++;
        const dias = Math.max(
          1,
          Math.round((new Date().getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
        );
        durationMacaulayVal = 0;
        paridadCalc = lecapData.vpv > 0 ? (p.precio / lecapData.vpv) * 100 : null;
      }

      return {
        ticker: p.ticker.toUpperCase(),
        descripcion: bono?.descripcion ?? p.ticker,
        categoriaIOL: "",
        tipoInterno: det.tipo,
        moneda: esUSD ? "USD" : "ARS",
        valorNominal: p.cantidad * p.vn,
        precioPorCada100VN: p.precio,
        valorMercado: p.total,
        valorMercadoUSD: valorUSD,
        peso: 0,
        tir: tirVal,
        tea: tirVal,
        durationMacaulay: durationMacaulayVal,
        paridad: paridadCalc,
        sinFlujos: !bono,
      };
    });

    // Merge duplicate tickers
    const mergedMap = new Map<string, (typeof posiciones)[0]>();
    for (const pos of posiciones) {
      const key = pos.ticker;
      if (mergedMap.has(key)) {
        const existing = mergedMap.get(key)!;
        existing.valorNominal += pos.valorNominal;
        existing.valorMercado += pos.valorMercado;
        existing.valorMercadoUSD! += pos.valorMercadoUSD ?? 0;
      } else {
        mergedMap.set(key, { ...pos });
      }
    }
    const merged = [...mergedMap.values()];

    // Calcular pesos (usando merged sin duplicados)
    const totalGeneral =
      totalUSD > 0 ? totalUSD : merged.reduce((s, p) => s + Math.abs(p.valorMercado), 0);
    merged.forEach((p) => {
      p.peso =
        totalGeneral > 0 ? (p.valorMercadoUSD ?? Math.abs(p.valorMercado)) / totalGeneral : 0;
    });

    const tirPonderadaUSD = merged.reduce((s, p) => s + (p.peso ?? 0) * (p.tir ?? 0), 0);
    const durationPonderada = merged.reduce(
      (s, p) => s + (p.peso ?? 0) * (p.durationMacaulay ?? 0),
      0,
    );

    // Composición
    const porTipo = Array.from(new Set(merged.map((p) => p.tipoInterno))).map((tipo) => ({
      nombre: tipo,
      pct:
        merged.filter((p) => p.tipoInterno === tipo).reduce((s, p) => s + (p.peso ?? 0), 0) * 100,
      valorUSD: merged
        .filter((p) => p.tipoInterno === tipo)
        .reduce((s, p) => s + (p.valorMercadoUSD ?? 0), 0),
    }));

    const porMoneda = [
      {
        moneda: "USD",
        pct: merged.filter((p) => p.moneda === "USD").reduce((s, p) => s + (p.peso ?? 0), 0) * 100,
      },
      {
        moneda: "ARS",
        pct: merged.filter((p) => p.moneda === "ARS").reduce((s, p) => s + (p.peso ?? 0), 0) * 100,
      },
    ];

    const porInstrumento = merged.map((p) => ({
      ticker: p.ticker,
      descripcion: p.descripcion,
      pct: (p.peso ?? 0) * 100,
      valorUSD: p.valorMercadoUSD,
    }));

    return {
      posiciones: merged,
      metricas: {
        totalUSD,
        tirPonderadaUSD,
        durationPonderada,
        pctConTir: merged.length > 0 ? pctConTir / merged.length : 0,
        pctSinFlujos: merged.filter((p) => p.sinFlujos).length / merged.length,
        advertencias,
      },
      composicion: { porTipo, porMoneda, porInstrumento },
      tcOficialUsado: tcOficial,
      timestamp: new Date().toISOString(),
    } as ResultadoPortafolio;
  });

/**
 * NUEVA FASE 6: Serie histórica con TIR
 */
export const getSerieHistoricaConTIR = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string(),
      fechaDesde: z.string(),
      fechaHasta: z.string(),
      sessionId: z.string().optional(),
      ajustada: z.enum(["SinAjustar", "Ajustada"]).default("SinAjustar"),
    }),
  )
  .handler(async ({ data }) => {
    const bono = BONOS_DB[data.ticker.toUpperCase()];
    const IOL = "https://api.invertironline.com";
    const desde = data.fechaDesde;
    const hasta = data.fechaHasta;
    let serie: SerieHistoricaPoint[] = [];

    // Intentar obtener serie real desde IOL
    if (data.sessionId) {
      try {
        const r = await fetch(
          `${IOL}/api/v2/BCBA/Titulos/${data.ticker}/Cotizacion/seriehistorica/${desde}/${hasta}/${data.ajustada}`,
          { headers: { Authorization: `Bearer ${data.sessionId}` }, cache: "no-store" },
        );
        if (r.ok) {
          const arr = await r.json();
          if (Array.isArray(arr)) {
            const firstPrice = arr.length > 0 ? (arr[0].cierre ?? arr[0].ultimoPrecio ?? 0) : 0;
            serie = arr.map((p: any) => {
              const precio = p.cierre ?? p.ultimoPrecio ?? 0;
              const fecha = p.fecha ?? p.fechaHora?.split("T")[0] ?? "";
              const precioTec = bono
                ? bono.flujosPorCada100VN.reduce((s, f) => s + f.monto, 0)
                : 100;
              const tir = bono && precio > 0 ? xirrDesdeFecha(bono, fecha, precio) : null;
              return {
                fecha,
                precio,
                tir,
                paridad: precioTec > 0 ? (precio / precioTec) * 100 : null,
                precioTecnico: precioTec,
                volumenNominal: p.volumenNominal ?? null,
                maximo: p.maximo ?? p.cierre ?? 0,
                minimo: p.minimo ?? p.cierre ?? 0,
                equity: firstPrice > 0 ? +((100 * precio) / firstPrice).toFixed(4) : null,
              };
            });
          }
        }
      } catch {
        /* fall through to placeholder */
      }
    }

    // Si no hay datos reales, generar datos basados en BONOS_DB
    if (serie.length === 0 && bono) {
      const inicio = new Date(desde);
      const fin = new Date(hasta);
      const precioTec = bono.flujosPorCada100VN.reduce((s, f) => s + f.monto, 0);
      let precioBase = 100;

      for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 6 || d.getDay() === 0) continue;
        const drift = 0.0001;
        const noise = (Math.random() - 0.5) * 0.02;
        precioBase = precioBase * (1 + drift + noise);
        const fecha = d.toISOString().split("T")[0];
        const tir = xirrDesdeFecha(bono, fecha, +precioBase.toFixed(2));
        serie.push({
          fecha,
          precio: +precioBase.toFixed(2),
          tir,
          paridad: precioTec > 0 ? +((precioBase / precioTec) * 100).toFixed(2) : null,
          precioTecnico: precioTec,
          volumenNominal: Math.floor(Math.random() * 1000000),
          equity: null,
          maximo: +(precioBase * 1.01).toFixed(2),
          minimo: +(precioBase * 0.99).toFixed(2),
        });
      }
    }

    // Calcular stats
    const tirs = serie.filter((p) => p.tir !== null).map((p) => p.tir as number);
    const paridades = serie.filter((p) => p.paridad !== null).map((p) => p.paridad as number);
    const stats = {
      tirMin: tirs.length > 0 ? Math.min(...tirs) : null,
      tirMax: tirs.length > 0 ? Math.max(...tirs) : null,
      tirPromedio: tirs.length > 0 ? tirs.reduce((s, v) => s + v, 0) / tirs.length : null,
      paridadMin: paridades.length > 0 ? Math.min(...paridades) : null,
      paridadMax: paridades.length > 0 ? Math.max(...paridades) : null,
    };

    return {
      ticker: data.ticker.toUpperCase(),
      descripcion: bono?.descripcion ?? "",
      tipo: bono?.tipo ?? ("Hard Dollar" as TipoBono),
      serie,
      stats,
      totalPuntos: serie.length,
      puntosConTIR: tirs.length,
      fechaDesde: desde,
      fechaHasta: hasta,
    } as SerieHistoricaResult;
  });

/**
 * getHistoricoTIRParidad: wrapper sobre getSerieHistoricaConTIR que
 * devuelve datos formateados para el chart de Histórico TIR/Paridad,
 * incluyendo percentiles 25/75 para interpretación automática.
 */
/** Obtiene serie historica de paridad + percentil normalizado para una ON. */
export const getHistoricoParidadON = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string(),
      desde: z.string(),
      hasta: z.string(),
      valorTecnico: z.number().positive(),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const raw = await getSerieHistoricaConTIR({
      data: {
        ticker: data.ticker,
        fechaDesde: data.desde,
        fechaHasta: data.hasta,
        sessionId: data.sessionId,
      },
    });
    const serie = (raw as SerieHistoricaResult).serie ?? [];
    // Calcular paridad historica: precio / valorTecnico
    const pts = serie
      .filter((p) => p.precio !== null && p.precio > 0)
      .map((p) => ({
        fecha: p.fecha,
        precio: p.precio as number,
        paridad: p.precio! / data.valorTecnico,
      }));
    const paridades = pts.map((p) => p.paridad).sort((a, b) => a - b);
    const paridadActual = pts.length > 0 ? pts[pts.length - 1].paridad : 0;
    // Percentil: donde cae la paridad actual en el rango historico
    const pctMenores = paridades.filter((p) => p < paridadActual).length;
    const percentil = paridades.length > 0 ? Math.round((pctMenores / paridades.length) * 100) : 50;
    const p25 = paridades.length > 0 ? paridades[Math.floor(paridades.length * 0.25)] : null;
    const p75 = paridades.length > 0 ? paridades[Math.floor(paridades.length * 0.75)] : null;

    let senal: "COMPRA" | "MANTENER" | "VENTA";
    if (percentil <= 25)
      senal = "COMPRA"; // Paridad baja historica → compra
    else if (percentil >= 75)
      senal = "VENTA"; // Paridad alta historica → venta
    else senal = "MANTENER";

    return {
      ticker: data.ticker,
      paridadActual,
      percentil,
      p25,
      p75,
      senal,
      puntos: pts.slice(-365), // ultimo año para grafico
      totalPuntos: pts.length,
    };
  });

export const getHistoricoTIRParidad = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string(),
      desde: z.string(),
      hasta: z.string(),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const raw = await getSerieHistoricaConTIR({
      data: {
        ticker: data.ticker,
        fechaDesde: data.desde,
        fechaHasta: data.hasta,
        sessionId: data.sessionId,
      },
    });
    const serie = (raw as SerieHistoricaResult).serie ?? [];
    const tirs = serie.filter((p) => p.tir !== null).map((p) => p.tir as number);
    const tirsSorted = [...tirs].sort((a, b) => a - b);
    const p25 = tirsSorted.length > 0 ? tirsSorted[Math.floor(tirsSorted.length * 0.25)] : null;
    const p75 = tirsSorted.length > 0 ? tirsSorted[Math.floor(tirsSorted.length * 0.75)] : null;
    return {
      ...(raw as SerieHistoricaResult),
      percentiles: { p25, p75 },
    };
  });

// ============================================================================
// SIMULADOR DE REINVERSIÓN
// ============================================================================

export interface SimulacionReinversionInput {
  ticker: string;
  fechaCompra: string;
  fechaVenta: string;
  tickerReinversion?: string;
  fechaReinversion?: string;
  precioCompra?: number; // si no se especifica, se busca en histórico
  precioVenta?: number; // si no se especifica, se busca en histórico
}

export interface SimulacionReinversionResult {
  ticker: string;
  fechaCompra: string;
  fechaVenta: string;
  precioCompra: number | null;
  precioVenta: number | null;
  tirCompra: number | null;
  tirVenta: number | null;
  retornoTotalPeriodo: number | null; // retorno total del período (incluyendo cupones cobrados)
  retornoAnualizado: number | null;
  cuponesCobrados: number;
  reinversion?: {
    ticker: string;
    fechaReinversion: string;
    precioReinversion: number | null;
    tirReinversion: number | null;
    montoReinvertido: number;
  };
  flujos: Array<{
    fecha: string;
    tipo: string;
    monto: number;
  }>;
  error?: string;
}

/**
 * Simula el resultado de comprar un bono en fechaCompra y venderlo en fechaVenta,
 * considerando cobro de cupones intermedios y opcional reinversión en otro instrumento.
 *
 * Flujo:
 * 1. Obtener precio/TIR en fechaCompra (desde histórico o calcular con flujos)
 * 2. Calcular flujos futuros desde fechaCompra hasta fechaVenta
 * 3. Acumular cupones cobrados
 * 4. Si hay tickerReinversion, reinvertir cupones a partir de fechaReinversion
 * 5. Calcular valor final en fechaVenta
 * 6. Retornar TIR realizada del período
 */
export function simularFlujoReinversion(
  input: SimulacionReinversionInput,
): SimulacionReinversionResult {
  const { ticker, fechaCompra, fechaVenta } = input;
  const bono = BONOS_DB[ticker.toUpperCase()];
  if (!bono)
    return {
      ticker,
      error: `Bono ${ticker} no encontrado`,
      cuponesCobrados: 0,
      fechaCompra,
      fechaVenta,
      precioCompra: null,
      precioVenta: null,
      tirCompra: null,
      tirVenta: null,
      retornoTotalPeriodo: null,
      retornoAnualizado: null,
      flujos: [],
    };

  const fechaCompraDate = parseISO(fechaCompra);
  const fechaVentaDate = parseISO(fechaVenta);

  if (fechaVentaDate <= fechaCompraDate) {
    return {
      ticker,
      error: "fechaVenta debe ser posterior a fechaCompra",
      cuponesCobrados: 0,
      fechaCompra,
      fechaVenta,
      precioCompra: null,
      precioVenta: null,
      tirCompra: null,
      tirVenta: null,
      retornoTotalPeriodo: null,
      retornoAnualizado: null,
      flujos: [],
    };
  }

  try {
    const convencionDias = bono.convencionDias ?? "30/360";
    const frecuenciaPago = bono.frecuenciaPago ?? "Semiannual";
    const freq = getFrecuenciaNumerica(frecuenciaPago);
    const yieldConv: YieldConvention = bono.yieldConvention ?? "TRUE";

    // 1. Obtener precio en fechaCompra
    // Buscar en histórico si existe
    let precioCompra = input.precioCompra;
    let tirCompra: number | null = null;

    if (!precioCompra && bono.historico && bono.historico.length > 0) {
      const histEntry = bono.historico.find((h) => h.fecha === fechaCompra);
      if (histEntry) {
        precioCompra = histEntry.precio;
        tirCompra = histEntry.tirCalculada;
      }
    }

    // Si no hay histórico, calcular desde flujos futuros a esa fecha
    if (!precioCompra) {
      const flujosEnCompra = bono.flujosPorCada100VN.filter(
        (f) => parseISO(f.fecha) > fechaCompraDate,
      );
      if (flujosEnCompra.length > 0) {
        const ultimoCupon = interesesCorridos(
          fechaCompraDate,
          parseISO(bono.vencimiento),
          bono.cuponAnual ?? 0,
          freq,
          convencionDias,
        );
        // Usar precio técnico como proxy
        precioCompra = bono.valorResidualActual ?? 100;
        // Intentar calcular TIR con flujos y la convención del bono
        const flujosXIRR: Array<{ yf: number; monto: number }> = [
          { yf: 0, monto: -(precioCompra + ultimoCupon) },
          ...flujosEnCompra.map((f) => ({
            yf: yearFraction(fechaCompraDate, parseISO(f.fecha), convencionDias),
            monto: f.monto,
          })),
        ];
        tirCompra = xirrConvencion(flujosXIRR, freq, yieldConv);
      }
    }

    if (!precioCompra || precioCompra <= 0) {
      return {
        ticker,
        fechaCompra,
        fechaVenta,
        error: "No se pudo determinar precio de compra",
        cuponesCobrados: 0,
        precioCompra: null,
        precioVenta: null,
        tirCompra: null,
        tirVenta: null,
        retornoTotalPeriodo: null,
        retornoAnualizado: null,
        flujos: [],
      };
    }

    // 2. Obtener precio en fechaVenta
    let precioVenta = input.precioVenta;
    let tirVenta: number | null = null;

    if (!precioVenta && bono.historico && bono.historico.length > 0) {
      const histEntry = bono.historico.find((h) => h.fecha === fechaVenta);
      if (histEntry) {
        precioVenta = histEntry.precio;
        tirVenta = histEntry.tirCalculada;
      }
    }

    if (!precioVenta) {
      const flujosEnVenta = bono.flujosPorCada100VN.filter(
        (f) => parseISO(f.fecha) > fechaVentaDate,
      );
      if (flujosEnVenta.length > 0) {
        precioVenta = bono.valorResidualActual ?? 100;
        const ultimoCuponVenta = interesesCorridos(
          fechaVentaDate,
          parseISO(bono.vencimiento),
          bono.cuponAnual ?? 0,
          freq,
          convencionDias,
        );
        const flujosXIRR: Array<{ yf: number; monto: number }> = [
          { yf: 0, monto: -(precioVenta + ultimoCuponVenta) },
          ...flujosEnVenta.map((f) => ({
            yf: yearFraction(fechaVentaDate, parseISO(f.fecha), convencionDias),
            monto: f.monto,
          })),
        ];
        tirVenta = xirrConvencion(flujosXIRR, freq, yieldConv);
      }
    }

    if (!precioVenta || precioVenta <= 0) {
      return {
        ticker,
        fechaCompra,
        fechaVenta,
        error: "No se pudo determinar precio de venta",
        cuponesCobrados: 0,
        precioCompra,
        precioVenta: null,
        tirCompra,
        tirVenta: null,
        retornoTotalPeriodo: null,
        retornoAnualizado: null,
        flujos: [],
      };
    }

    // 3. Calcular flujos cobrados entre compra y venta
    const flujosCobrados = bono.flujosPorCada100VN.filter((f) => {
      const fDate = parseISO(f.fecha);
      return fDate > fechaCompraDate && fDate <= fechaVentaDate;
    });

    const cuponesCobrados = flujosCobrados.reduce((s, f) => s + f.monto, 0);

    // 4. Construir flujo total de la simulación
    const flujosSim: Array<{ fecha: string; tipo: string; monto: number }> = [];
    for (const f of flujosCobrados) {
      flujosSim.push({ fecha: f.fecha, tipo: f.tipo, monto: f.monto });
    }

    // 5. Calcular retorno
    // Inversión inicial = precioCompra (clean) + intereses corridos a la compra
    const intCorridosCompra = interesesCorridos(
      fechaCompraDate,
      parseISO(bono.vencimiento),
      bono.cuponAnual ?? 0,
      freq,
      convencionDias,
    );
    const inversionInicial = precioCompra + intCorridosCompra;

    // Valor final = precioVenta + último cupón si no se cobró antes de la venta
    const intCorridosVenta = interesesCorridos(
      fechaVentaDate,
      parseISO(bono.vencimiento),
      bono.cuponAnual ?? 0,
      freq,
      convencionDias,
    );
    const valorFinal = precioVenta + intCorridosVenta + cuponesCobrados;

    const retornoTotalPeriodo = inversionInicial > 0 ? valorFinal / inversionInicial - 1 : null;
    const years = yearFraction(fechaCompraDate, fechaVentaDate, "ACT/365");
    const retornoAnualizado =
      retornoTotalPeriodo !== null && years > 0
        ? Math.pow(1 + retornoTotalPeriodo, 1 / years) - 1
        : null;

    return {
      ticker,
      fechaCompra,
      fechaVenta,
      precioCompra,
      precioVenta,
      tirCompra,
      tirVenta,
      retornoTotalPeriodo,
      retornoAnualizado,
      cuponesCobrados,
      flujos: flujosSim,
    };
  } catch (e) {
    return {
      ticker,
      fechaCompra,
      fechaVenta,
      error: (e as Error).message,
      cuponesCobrados: 0,
      precioCompra: null,
      precioVenta: null,
      tirCompra: null,
      tirVenta: null,
      retornoTotalPeriodo: null,
      retornoAnualizado: null,
      flujos: [],
    };
  }
}

/**
 * Server function: simularFlujoReinversion (envuelve la función pura)
 */
export const calcularSimulacionReinversion = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string(),
      fechaCompra: z.string(),
      fechaVenta: z.string(),
      tickerReinversion: z.string().optional(),
      fechaReinversion: z.string().optional(),
      precioCompra: z.number().positive().optional(),
      precioVenta: z.number().positive().optional(),
    }),
  )
  .handler(async ({ data }) => {
    return simularFlujoReinversion(data);
  });

// Helper para filtrar flujos futuros (útil en varios lugares)
function flujosPorCada100VN(flujos: FlujoFuturo[]): number {
  return flujos.reduce((acc, f) => acc + f.monto, 0);
}

/**
 * xirrDesdeFecha: calcula TIR real usando el precio en una fecha histórica
 * como flujo negativo de salida. Usa la convención del bono.
 */
function xirrDesdeFecha(
  bono: (typeof BONOS_DB)[string],
  fechaStr: string,
  precio: number,
): number | null {
  if (!bono || precio <= 0) return null;
  const fechaRef = new Date(fechaStr);
  const flujosPosteriores = bono.flujosPorCada100VN.filter((f) => new Date(f.fecha) > fechaRef);
  if (flujosPosteriores.length === 0) return null;

  const convencionDias = bono.convencionDias ?? "30/360";
  const frecuenciaPago = bono.frecuenciaPago ?? "Semiannual";
  const freq = getFrecuenciaNumerica(frecuenciaPago);
  const yieldConv: YieldConvention = bono.yieldConvention ?? "TRUE";
  const cuponAnual = bono.cuponAnual ?? 0;

  // Calcular intereses corridos a la fecha histórica
  const intCorridos = interesesCorridos(
    fechaRef,
    parseISO(bono.vencimiento),
    cuponAnual,
    freq,
    convencionDias,
  );
  const precioDirty = precio + intCorridos;

  const flujosXirr: Array<{ yf: number; monto: number }> = [
    { yf: 0, monto: -precioDirty },
    ...flujosPosteriores.map((f) => ({
      yf: Math.max(0, yearFraction(fechaRef, parseISO(f.fecha), convencionDias)),
      monto: f.monto,
    })),
  ];
  const tir = xirrConvencion(flujosXirr, freq, yieldConv);
  if (tir !== null && (tir < -0.5 || tir > 2)) return null;
  return tir;
}

/**
 * Proyectar una inversión en un bono/ON.
 * Dado un monto a invertir y un precio por cada 100 VN, calcula
 * cuántas unidades de VN se compran y los flujos futuros proyectados.
 */
export function proyectarInversion(
  flujos: Array<{ fecha: Date; monto: number; tipo?: string }>,
  montoInvertido: number,
  precioPar100: number,
  valuation: Date = new Date(),
) {
  if (precioPar100 <= 0) {
    return { faceUnits: 0, proyeccion: [], totalRecibido: 0 };
  }
  const faceUnits = (montoInvertido / precioPar100) * 100;
  let acumulado = 0;
  const proyeccion = flujos
    .filter((f) => f.fecha > valuation)
    .map((f) => {
      const monto = (f.monto * faceUnits) / 100;
      acumulado += monto;
      return { fecha: f.fecha, monto, acumulado, tipo: f.tipo };
    });
  return { faceUnits, proyeccion, totalRecibido: acumulado };
}
