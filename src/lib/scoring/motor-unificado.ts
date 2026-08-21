// @ts-nocheck
// FASE 5 — Orquestador del motor unificado.
// Único punto de entrada que combina los 6 sub-motores (Fases 2-4) + moat/Schvarz
// + contradicciones + coherencia de señal, aplicando los pesos de Fase 1 (pesos.ts).
// # REVISAR: calcularMoatSimplificado es privado en schvarz-recomendacion.functions.ts.
// Bajo la restricción "crear solo motor-unificado.ts" se replica aquí la lógica
// exacta; en FASE 6 conviene exportarla desde el original y borrar la copia local.
// # REVISAR: detectarContradiccion (scoring-unificado.ts) espera el técnico en su
// escala original (-2.5/+2.5) → se pasa tecnico.raw; y el fundamental en -10..+10
// → se convierte (valor-50)/5. No se fuerza la conversión inversa del técnico.

import type { SubScore, TipoActivo, Contradiccion, ScoreUnificado } from "./types";
import { PESOS_UNIFICADOS } from "./pesos";
import { calcularTecnico } from "./tecnico";
import { calcularFundamental } from "./fundamental";
import { calcularCuantitativo } from "./cuantitativo";
import { calcularSectorial } from "./sectorial";
import { calcularScoreNoticias } from "./noticias";
import { calcularScoreMacroContexto } from "./macro-contexto";
import { detectarContradiccion } from "../scoring-unificado";
import { resolverSenalCoherente } from "../coherencia-senal";
import { getSemaforo } from "../finance.functions";
import { getRiesgoAnalysis, type DistribStats } from "../riesgo.functions";
import { getCAPMAnalysis, AUTO_BENCHMARKS, type CAPMResult } from "../capm.functions";
import { fetchFundamentalAF, type FundamentalAFResult } from "../fundamental-af.functions";
import { getNoticiasPorTicker } from "../news-scoring.functions";

// BLOQUE 10 — Indicadores Macro-Mercado: Criterios de Jerarquización.
// Fuente: Elbaum/IFACI, Unidad 3, Cap. 5, punto 5.1. Tres criterios para decidir
// qué peso darle a un indicador económico:
//   1. Relevancia para la economía en conjunto (ej. ventas minoristas ≈ 2/3 de la
//      actividad económica de EE.UU.).
//   2. Timing de la información (algunos indicadores informan del mes recién
//      cerrado casi de inmediato; el PBI trimestral llega "añejo", 3 meses tarde).
//   3. Confiabilidad de los datos (tamaño de la muestra, si son revisados, etc.).
// El paper define los criterios sin fórmula explícita → se usa decaimiento
// exponencial estándar por antigüedad (documentado como tal, no inventado):
//   factorFrescura = 2^(-edadDias / 30)   (vida media ≈ 30 días)
//   valorPonderado = 50 + (valor - 50) * factorFrescura
// Un dato recién publicado (edad≈0) conserva su valor (factor→1); uno viejo se
// arrastra hacia el neutro 50 (pierde poder de decisión). La fecha llega en el
// contrato de /api/macro-context (riesgoPais.fecha, inflacion.fecha, timestamp).
// Relevancia y confiabilidad quedan documentadas como pesos por indicador para la
// integración futura del contrato completo; este bloque implementa el timing.
export function ponderarPorFrescura(
  valor: number,
  fecha: string,
  hoy: Date = new Date(),
): { valorPonderado: number; factorFrescura: number } {
  const t = Date.parse(fecha);
  if (Number.isNaN(t)) return { valorPonderado: valor, factorFrescura: 1 };
  const edadDias = Math.max(0, (hoy.getTime() - t) / 86400000);
  const factorFrescura = Math.pow(2, -edadDias / 30);
  const valorPonderado = Math.round(50 + (valor - 50) * factorFrescura);
  return { valorPonderado, factorFrescura: +factorFrescura.toFixed(3) };
}

// Subconjunto estructural de SemaforoResult que este orquestador consume.
// SemaforoResult es asignable a este tipo (inclusión estructural); permite
// inyectar datos deterministas en tests sin construir el objeto completo.
export interface SemaforoInyectado {
  price: number;
  sma50: number;
  sma200: number | null;
  rsi: number;
  macd: number;
  macdSignal: number;
  history: { date: string; close: number }[];
  esETF: boolean;
  soportes?: { precio: number; fecha: string; vecesTocado: number; esEstimado?: boolean }[];
  resistencias?: { precio: number; fecha: string; vecesTocado: number; esEstimado?: boolean }[];
  distanciaSoporte?: number;
  distanciaResistencia?: number;
}

export interface DatosMotorUnificado {
  semaforo?: SemaforoInyectado | null;
  riesgos?: DistribStats | null;
  capm?: CAPMResult | null;
  fund?: Partial<FundamentalAFResult> | null;
  titulares?: string[] | null;
  macroContexto?: SubScore | null;
  /** Fecha (ISO) del dato macro más antiguo usado (contrato /api/macro-context). Opcional — si falta, no hay decaimiento por frescura. */
  macroFecha?: string | null;
}

async function capturar<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch {
    return null;
  }
}

// ─── Moat (copia de calcularMoatSimplificado, schvarz-recomendacion.functions.ts:135) ──

function calcularMoatSimplificado(
  f: Partial<FundamentalAFResult> | null,
): { score: number; label: string } | null {
  if (!f) return null;
  let score = 0;
  if (f.profitMargin != null && f.profitMargin > 0.15) score += 25;
  else if (f.profitMargin != null && f.profitMargin > 0.1) score += 15;

  if (f.returnOnEquity != null && f.returnOnEquity > 0.15) score += 25;
  else if (f.returnOnEquity != null && f.returnOnEquity > 0.1) score += 15;

  if (f.revenueGrowth != null && f.revenueGrowth > 0.1) score += 15;

  if (f.debtToEquityRaw != null && f.debtToEquityRaw < 80) score += 15;

  if (f.freeCashflowM != null && f.freeCashflowM > 0) score += 20;

  if (f.operatingMargin != null && f.operatingMargin > 0.15) score += 10;

  // BLOQUE 8 — criterio de devengamiento (Fowler Newton, Cap. 9, punto 9.5).
  // Igual que en schvarz-recomendacion.functions.ts:166 (ambas copias sincronizadas).
  const ni = f.netIncomeFromIS;
  const fcfUsd = f.freeCashflowM != null ? f.freeCashflowM * 1e6 : null;
  if (ni != null && ni > 0 && fcfUsd != null && f.profitMargin != null && f.profitMargin > 0.1) {
    const calidadDevengamiento = fcfUsd / ni;
    if (calidadDevengamiento < 0.5) {
      score -= calidadDevengamiento <= 0 ? 15 : 8;
    }
  }

  score = Math.min(100, score);

  let label = "Sin Moat Claro";
  if (score >= 70) label = "Moat Fuerte";
  else if (score >= 45) label = "Moat Moderado";

  return { score, label };
}

function construirSr(semaforo: SemaforoInyectado | null): {
  soportes: {
    tipo: "soporte";
    precio: number;
    fecha: string;
    vecesTocado: number;
    esEstimado?: boolean;
  }[];
  resistencias: {
    tipo: "resistencia";
    precio: number;
    fecha: string;
    vecesTocado: number;
    esEstimado?: boolean;
  }[];
  soporteMasCercano: {
    tipo: "soporte";
    precio: number;
    fecha: string;
    vecesTocado: number;
    esEstimado?: boolean;
  } | null;
  resistenciaMasCercana: {
    tipo: "resistencia";
    precio: number;
    fecha: string;
    vecesTocado: number;
    esEstimado?: boolean;
  } | null;
  distanciaSoportePct: number;
  distanciaResistenciaPct: number;
} {
  const soportes = (semaforo?.soportes ?? []).map((s) => ({
    tipo: "soporte" as const,
    precio: s.precio,
    fecha: s.fecha,
    vecesTocado: s.vecesTocado,
    esEstimado: s.esEstimado,
  }));
  const resistencias = (semaforo?.resistencias ?? []).map((s) => ({
    tipo: "resistencia" as const,
    precio: s.precio,
    fecha: s.fecha,
    vecesTocado: s.vecesTocado,
    esEstimado: s.esEstimado,
  }));
  return {
    soportes,
    resistencias,
    soporteMasCercano: soportes[0] ?? null,
    resistenciaMasCercana: resistencias[0] ?? null,
    distanciaSoportePct: semaforo?.distanciaSoporte ?? 0,
    distanciaResistenciaPct: semaforo?.distanciaResistencia ?? 0,
  };
}

function clasificarScoreFinal(score: number): ScoreUnificado["clasificacion"] {
  if (score > 80) return "COMPRA";
  if (score > 60) return "COMPRA_CAUTELA";
  if (score > 40) return "MANTENER";
  if (score > 20) return "REDUCIR";
  return "VENTA";
}

type SubScoresBase = Omit<ScoreUnificado["subScores"], "calidadMoat">;

async function obtenerScores(
  ticker: string,
  tipoActivo: TipoActivo,
  datos?: DatosMotorUnificado,
): Promise<{
  subScores: SubScoresBase;
  calidadMoat: SubScore | null;
  coherenciaSenal: string;
  contradicciones: Contradiccion[];
}> {
  const esInyectado = datos != null;

  const semaforo =
    esInyectado && datos!.semaforo !== undefined
      ? datos!.semaforo
      : await capturar(getSemaforo({ data: { ticker, rango: "1A" } }));
  const riesgos =
    esInyectado && datos!.riesgos !== undefined
      ? datos!.riesgos
      : await capturar(getRiesgoAnalysis({ data: { tickers: [ticker] } }).then((r) => r[0]));
  const capm =
    esInyectado && datos!.capm !== undefined
      ? datos!.capm
      : await capturar(
          getCAPMAnalysis({
            data: { tickers: [ticker], benchmarks: AUTO_BENCHMARKS, autoDetect: true },
          }).then((r) => r[0]),
        );
  const fund =
    esInyectado && datos!.fund !== undefined
      ? datos!.fund
      : await capturar(
          fetchFundamentalAF({ data: { symbol: ticker } }).then((r) => (r && !r.error ? r : null)),
        );

  let titulares: string[] = [];
  if (esInyectado && datos!.titulares !== undefined) {
    titulares = datos!.titulares ?? [];
  } else {
    const noticias = await capturar(getNoticiasPorTicker(ticker));
    titulares = (noticias?.noticiasRelevantes ?? []).map((n) => n.titulo);
  }

  const tecnico: SubScore =
    semaforo != null
      ? calcularTecnico({
          current: semaforo.price,
          sma50: semaforo.sma50,
          sma200: semaforo.sma200,
          rsi: semaforo.rsi,
          macd: semaforo.macd,
          macdSignal: semaforo.macdSignal,
          closes: semaforo.history.map((h) => h.close),
          sr: construirSr(semaforo),
        })
      : { valor: 50, detalle: {}, fuente: "scoring/tecnico.ts", disponible: false };

  const fundamental = calcularFundamental({
    trailingPE: fund?.trailingPE ?? null,
    forwardPE: fund?.forwardPE ?? null,
    sectorPE: null,
    priceToBook: fund?.priceToBook ?? null,
    debtToEquity: fund?.debtToEquityRaw ?? null,
    returnOnEquity: fund?.returnOnEquity ?? null,
    revenueGrowth: fund?.revenueGrowth ?? null,
    earningsGrowth: fund?.earningsGrowth ?? null,
    fcfYield: fund?.fcfYield ?? null,
    evToEbitda: fund?.evToEbitda ?? null,
    recommendationMean: fund?.recommendationMean ?? null,
    marketCap: fund?.marketCapM ?? null,
    pePercentile: fund?.pePercentile ?? null,
    totalLiabilities: fund?.totalLiabilities ?? null,
    totalStockholderEquity: fund?.totalStockholderEquity ?? null,
    ebit: fund?.ebit ?? null,
    totalAssets: fund?.totalAssets ?? null,
    wacc: null,
  });

  const cuantitativo = calcularCuantitativo({
    sharpeRatio: riesgos?.sharpeRatio ?? null,
    beta: capm?.beta ?? null,
    rSquared: capm?.rSquared ?? null,
    var95: riesgos?.var95 ?? null,
    cicloConversion: fund?.cicloConversion?.score ?? null,
  });

  const sectorial = calcularSectorial({
    symbol: ticker,
    sector: fund?.sector ?? null,
    esETF: fund?.esETF ?? semaforo?.esETF ?? false,
    currentPrice: fund?.currentPrice ?? semaforo?.price ?? null,
    trailingPE: fund?.trailingPE ?? null,
    totalStockholderEquity: fund?.totalStockholderEquity ?? null,
    sharesOutstanding: fund?.sharesOutstanding ?? null,
    totalAssets: fund?.totalAssets ?? null,
    healthScoreHistory: fund?.healthScoreHistory ?? [],
    rdToRevenuePct: null,
    operatingMargin: fund?.operatingMargin ?? null,
    revenueGrowth: fund?.revenueGrowth ?? null,
    returnOnEquity: fund?.returnOnEquity ?? null,
    fcfYield: fund?.fcfYield ?? null,
    profitMargin: fund?.profitMargin ?? null,
    debtToEquityRaw: fund?.debtToEquityRaw ?? null,
    freeCashflowM: fund?.freeCashflowM ?? null,
    totalCashFromOperatingActivities: fund?.totalCashFromOperatingActivities ?? null,
    payoutRatio: fund?.payoutRatio ?? null,
    interestCoverageRatio: fund?.interestCoverageRatio ?? null,
    workingCapital: fund?.workingCapital ?? null,
    returnOnAssets: fund?.returnOnAssets ?? null,
    currentRatio: fund?.currentRatio ?? null,
  });

  const noticias = await calcularScoreNoticias(ticker, titulares);

  const macroContexto0 =
    esInyectado && datos!.macroContexto !== undefined
      ? datos!.macroContexto
      : await calcularScoreMacroContexto(ticker, fund?.sector ?? tipoActivo);

  // BLOQUE 10 — decaimiento por frescura (Elbaum/IFACI U3 C5.1, criterio timing).
  // Si se inyecta la fecha del dato macro, el score se arrastra hacia el neutro 50
  // cuanto más viejo sea el dato; el factor queda registrado en detalle para auditoría.
  const macroContexto: SubScore =
    macroContexto0 && datos?.macroFecha
      ? (() => {
          const { valorPonderado, factorFrescura } = ponderarPorFrescura(
            macroContexto0.valor,
            datos.macroFecha,
          );
          return {
            ...macroContexto0,
            valor: valorPonderado,
            detalle: { ...macroContexto0.detalle, factorFrescura },
          };
        })()
      : macroContexto0;

  const moat = calcularMoatSimplificado(fund);
  const calidadMoat: SubScore | null = moat
    ? {
        valor: moat.score,
        detalle: {},
        fuente: "schvarz/calcularMoatSimplificado",
        disponible: true,
      }
    : null;

  // Contradicción técnico vs fundamental. Autocorrección FASE 5: se pasa
  // tecnico.raw (escala -2.5/+2.5) y el fundamental convertido a -10..+10
  // ((valor-50)/5). Si el técnico no tiene raw, se salta la detección.
  let contradicciones: Contradiccion[] = [];
  if (tecnico.raw != null) {
    const detectada = detectarContradiccion(tecnico.raw, (fundamental.valor - 50) / 5);
    if (detectada) {
      contradicciones = [
        {
          direccion: "tecnico_vs_fundamental",
          descripcion: detectada.descripcion,
          severidad: detectada.severidad,
        },
      ];
    }
  }

  const senal = resolverSenalCoherente(
    fundamental.valor,
    null,
    fund?.revenueGrowth ?? null,
    fund?.upsidePct ?? null,
    fund?.recommendationMean ?? null,
  );
  const coherenciaSenal = `${senal.plazo} — ${senal.accion}${senal.nota ? `. ${senal.nota}` : ""}`;

  return {
    subScores: { tecnico, fundamental, cuantitativo, sectorial, noticias, macroContexto },
    calidadMoat,
    coherenciaSenal,
    contradicciones,
  };
}

export async function calcularScoreUnificado(
  ticker: string,
  tipoActivo: TipoActivo,
  datos?: DatosMotorUnificado,
): Promise<ScoreUnificado> {
  const { subScores, calidadMoat, coherenciaSenal, contradicciones } = await obtenerScores(
    ticker,
    tipoActivo,
    datos,
  );

  const subScoresFinal: ScoreUnificado["subScores"] = calidadMoat
    ? { ...subScores, calidadMoat }
    : subScores;

  // Pesos de FASE 1: se aplican solo los no nulos (sectorial/calidadMoat en 0 se omiten; la fila suma 1.0)
  const pesos = PESOS_UNIFICADOS[tipoActivo] ?? PESOS_UNIFICADOS.OTRO;
  let acc = 0;
  for (const entry of Object.entries(pesos) as [keyof ScoreUnificado["subScores"], number][]) {
    const [k, w] = entry;
    const sub = (subScoresFinal as Record<string, SubScore>)[k];
    if (w > 0 && sub && Number.isFinite(sub.valor)) acc += sub.valor * w;
  }
  const scoreFinal = Math.max(0, Math.min(100, Math.round(acc)));

  return {
    ticker,
    scoreFinal,
    clasificacion: clasificarScoreFinal(scoreFinal),
    subScores: subScoresFinal,
    contradicciones,
    coherenciaSenal,
    timestamp: new Date().toISOString(),
  };
}
