// FASE 6 — Motor diario (cron) conservado.
// # REVISAR: el score técnico se deriva aquí de semaforo.totalScore con
// normalizarScoreSemaforo (divisor 10, rango -5..+5), mientras el motor
// unificado usa normalizarScoreTecnico (divisor 5 sobre el rango real
// -2.5..+2.5, ver scoring/tecnico.ts Fase 2). Delegar en motor-unificado.ts
// (vía inyección de datos ya fetcheados) cambiaría los valores persistidos por
// el cron y re-fetchearía fuentes. Los pesos del compuesto RV (técnico .3,
// fund .3, cuant .25, not .1, contexto .05) coinciden 1:1 con
// PESOS_UNIFICADOS.ACCION/CEDEAR de Fase 1. El alineado fino del cron con
// scoreFinal unificado queda para FASE 7/8.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { construirUniversoCompleto } from "./universo";
import { calcularScoreFundamental } from "./fundamental-scoring";
import { calcularScoreCuantitativo } from "./cuantitativo-scoring";
import { clasificarSentimientoNoticias, sentimientoAScore } from "./news-scoring";
import { getSemaforo } from "../finance.functions";
import { getRiesgoAnalysis } from "../riesgo.functions";
import { getCAPMAnalysis, AUTO_BENCHMARKS } from "../capm.functions";
import { fetchFundamentalAF } from "../fundamental-af.functions";
import { getYahooQuoteServer } from "../market-data.functions";
import { fetchLecapFciData } from "../fci-lecap.functions";
import { getBonoPrecioYTCOficial, calcularRendimientosBono } from "../renta-fija.functions";
import type { AssetScoreDiario, ContextoDiario } from "./types";
import { SCORING_VERSION } from "./types";
import { getMarketNews } from "../market-news.functions";
import { calcularScoreMacroContexto } from "./macro-contexto";

const CONCURRENCIA = 10;

async function mapConcurrente<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  limite = CONCURRENCIA,
): Promise<R[]> {
  const resultados: R[] = [];
  for (let i = 0; i < items.length; i += limite) {
    const batch = items.slice(i, i + limite);
    const res = await Promise.allSettled(batch.map(fn));
    for (const r of res) {
      if (r.status === "fulfilled") resultados.push(r.value);
    }
  }
  return resultados;
}

function obtenerFechaART(): string {
  const ahora = new Date();
  return ahora.toISOString().slice(0, 10);
}

async function fetchContextoDiario(): Promise<ContextoDiario> {
  const fecha = obtenerFechaART();
  let brechaCCL: number | null = null;
  let riesgoPais: number | null = null;
  let vix: number | null = null;
  const mervalVariacion: number | null = null;
  const reservasBCRA: number | null = null;
  let inflacionMensual: number | null = null;
  let badlar: number | null = null;

  try {
    const [dolarOficial, dolarBlue, dolarBolsa] = await Promise.all([
      fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial").then((r) => r.json()),
      fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/blue").then((r) => r.json()),
      fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa").then((r) => r.json()),
    ]);
    const arrO = Array.isArray(dolarOficial) ? dolarOficial : [];
    const arrB = Array.isArray(dolarBlue) ? dolarBlue : [];
    const arrM = Array.isArray(dolarBolsa) ? dolarBolsa : [];
    const ofi = arrO.length > 0 ? (arrO[arrO.length - 1]?.venta ?? null) : null;
    const blue = arrB.length > 0 ? (arrB[arrB.length - 1]?.venta ?? null) : null;
    const mep = arrM.length > 0 ? (arrM[arrM.length - 1]?.venta ?? null) : null;
    if (ofi != null && mep != null && ofi > 0) brechaCCL = (mep - ofi) / ofi;
  } catch {
    /* ignore */
  }

  try {
    const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo");
    if (r.ok) {
      const j = await r.json();
      riesgoPais = j.valor ?? null;
    }
  } catch {
    /* ignore */
  }

  try {
    const quote = await getYahooQuoteServer({ data: { symbol: "^VIX" } }).catch(() => null);
    vix = quote?.precio ?? null;
  } catch {
    /* ignore */
  }

  try {
    const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacion");
    if (r.ok) {
      const arr: Array<{ fecha: string; valor: number }> = await r.json();
      if (arr.length > 0) inflacionMensual = arr[arr.length - 1].valor;
    }
  } catch {
    /* ignore */
  }

  try {
    const r = await fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7");
    if (r.ok) {
      const j = await r.json();
      badlar = j?.results?.[0]?.valor ?? null;
    }
  } catch {
    /* ignore */
  }

  return {
    fecha,
    brechaCCL,
    riesgoPais,
    vix,
    mervalVariacion,
    reservasBCRA,
    inflacionMensual,
    badlar,
    humorMercado: null,
  };
}

async function procesarActivo(
  activo: { ticker: string; categoriaMacro: string; subtipo: string; fuente: string },
  contexto: ContextoDiario,
): Promise<AssetScoreDiario | null> {
  const { ticker, categoriaMacro, subtipo } = activo;
  const esRV = categoriaMacro === "RentaVariable";
  const esRF = categoriaMacro === "RentaFija";

  let scoreFundamental: number | null = null;
  let scoreTecnico: number | null = null;
  let scoreCuantitativo = 50;
  let scoreNoticias: number | null = null;
  let precio = 0;
  let variacionPct = 0;
  let rsi: number | null = null;
  let sma50: number | null = null;
  let sma200: number | null = null;
  let macd: number | null = null;
  let pe: number | null = null;
  let beta: number | null = null;
  let rSquared: number | null = null;
  let sharpe: number | null = null;
  let var95: number | null = null;
  let tir: number | null = null;
  let tea: number | null = null;
  let duration: number | null = null;

  try {
    if (esRV) {
      const [semaforo, riesgos, capmArr] = await Promise.all([
        getSemaforo({ data: { ticker, rango: "1A" } }).catch(() => null),
        getRiesgoAnalysis({ data: { tickers: [ticker] } })
          .then((r) => r[0])
          .catch(() => null),
        getCAPMAnalysis({
          data: { tickers: [ticker], benchmarks: AUTO_BENCHMARKS, autoDetect: true },
        })
          .then((r) => r[0])
          .catch(() => null),
      ]);

      if (semaforo) {
        precio = semaforo.price;
        variacionPct = semaforo.change1d;
        rsi = semaforo.rsi;
        sma50 = semaforo.sma50;
        sma200 = semaforo.sma200 ?? 0;
        macd = semaforo.macd;
        pe = semaforo.pe;
        scoreTecnico = normalizarScoreSemaforo(semaforo.totalScore);
      }

      if (capmArr) {
        beta = capmArr.beta ?? null;
        rSquared = capmArr.rSquared ?? null;
      }

      if (riesgos) {
        sharpe = riesgos.sharpeRatio;
        var95 = riesgos.var95;
      }

      scoreCuantitativo = calcularScoreCuantitativo({ sharpeRatio: sharpe, beta, rSquared, var95 });

      const fund = await fetchFundamentalAF({ data: { symbol: ticker } }).catch(() => null);
      if (fund && !fund.error) {
        scoreFundamental = calcularScoreFundamental({
          trailingPE: fund.trailingPE,
          forwardPE: fund.forwardPE,
          sectorPE: null,
          priceToBook: fund.priceToBook,
          debtToEquity: fund.debtToEquityRaw,
          returnOnEquity: fund.returnOnEquity,
          revenueGrowth: fund.revenueGrowth,
          earningsGrowth: fund.earningsGrowth,
          fcfYield: fund.fcfYield,
          evToEbitda: fund.evToEbitda,
          recommendationMean: fund.recommendationMean,
          marketCap: fund.marketCapM,
          pePercentile: fund.pePercentile,
          totalLiabilities: null,
          totalStockholderEquity: null,
          ebit: null,
          totalAssets: null,
          wacc: null,
        });
      }
    }

    if (esRF) {
      if (
        subtipo === "Letra" ||
        subtipo === "FCI-RF" ||
        subtipo === "FCI-RV" ||
        subtipo === "FCI-Mixto"
      ) {
        const fciData = await fetchLecapFciData({ data: {} }).catch(() => null);
        if (fciData) {
          if (subtipo === "Letra") {
            const lecap = fciData.lecaps.find(
              (l) => l.ticker.toUpperCase() === ticker.toUpperCase(),
            );
            if (lecap) {
              precio = lecap.precio ?? lecap.vpv;
              tir = lecap.tna;
              tea = lecap.tea;
              duration = lecap.diasAlVencimiento / 365;
            }
          } else {
            const fci = fciData.fcis.find((f) => f.fondo.toUpperCase() === ticker.toUpperCase());
            if (fci) {
              precio = fci.ccp;
            }
          }
        }
      } else {
        const precios = await getBonoPrecioYTCOficial({ data: { tickers: [ticker] } }).catch(
          () => null,
        );
        const p = precios?.precios[ticker]?.precio ?? null;
        if (p && p > 0) {
          precio = p;
          const rend = await calcularRendimientosBono({
            data: { ticker, precioPorCada100VN: p },
          }).catch(() => null);
          if (rend) {
            tir = rend.tir ?? null;
            tea = rend.tea ?? null;
            duration = rend.durationMacaulay ?? null;
          }
        }
      }
    }
  } catch {
    return null;
  }

  // Score de noticias
  try {
    const news = await getMarketNews();
    const relevantes = news.items.filter((n) => {
      const text = (n.title + " " + (n.summary ?? "")).toLowerCase();
      return text.includes(ticker.toLowerCase());
    });
    if (relevantes.length > 0) {
      const sent = await clasificarSentimientoNoticias(
        ticker,
        relevantes.map((n) => `${n.title}: ${n.summary}`),
      );
      scoreNoticias = sentimientoAScore(sent);
    }
  } catch {
    /* noticias es opcional */
  }

  // Score de contexto — macro real (FASE 4). Reemplaza el placeholder
  // evaluarContexto (reglas-contexto.ts) que siempre devolvía 0 y forzaba 50 fijo.
  // El sector se pasa de forma temporal; el wiring fino con el sector real se hace en FASE 6.
  const scoreContexto = (await calcularScoreMacroContexto(ticker, categoriaMacro)).valor;

  // Score compuesto
  const scoreCompuesto = calcularCompuesto(
    esRV,
    scoreTecnico,
    scoreFundamental,
    scoreCuantitativo,
    scoreNoticias,
    scoreContexto,
  );

  return {
    ticker,
    fecha: obtenerFechaART(),
    scoringVersion: SCORING_VERSION,
    categoriaMacro: categoriaMacro as any,
    subtipo: subtipo as any,
    scoreFundamental,
    scoreTecnico,
    scoreCuantitativo,
    scoreNoticias,
    scoreContexto,
    scoreCompuesto,
    datosRaw: {
      precio,
      variacionPct,
      rsi,
      sma50,
      sma200,
      macd,
      pe,
      beta,
      rSquared,
      sharpe,
      var95,
      tir,
      tea,
      duration,
      valorizado: 0,
    },
  };
}

// # REVISAR (FASE 6): mismatch con normalizarScoreTecnico (scoring/tecnico.ts,
// divisor 5). Ver cabecera de archivo.
function normalizarScoreSemaforo(score: number): number {
  return Math.max(0, Math.min(100, ((score + 5) / 10) * 100));
}

function calcularCompuesto(
  esRV: boolean,
  scoreTecnico: number | null,
  scoreFundamental: number | null,
  scoreCuantitativo: number,
  scoreNoticias: number | null,
  scoreContexto: number,
): number {
  if (esRV) {
    let score = 0;
    let peso = 0;
    if (scoreTecnico != null) {
      score += 0.3 * scoreTecnico;
      peso += 0.3;
    }
    if (scoreFundamental != null) {
      score += 0.3 * scoreFundamental;
      peso += 0.3;
    }
    score += 0.25 * scoreCuantitativo;
    peso += 0.25;
    if (scoreNoticias != null) {
      score += 0.1 * scoreNoticias;
      peso += 0.1;
    }
    score += 0.05 * scoreContexto;
    peso += 0.05;
    return peso > 0 ? Math.round(score / peso) : 50;
  }

  // Renta Fija
  let score = 0;
  let peso = 0;
  score += 0.45 * scoreCuantitativo;
  peso += 0.45;
  score += 0.25 * scoreContexto;
  peso += 0.25;
  if (scoreNoticias != null) {
    score += 0.2 * scoreNoticias;
    peso += 0.2;
  }
  if (scoreTecnico != null) {
    score += 0.1 * scoreTecnico;
    peso += 0.1;
  }
  return peso > 0 ? Math.round(score / peso) : 50;
}

// Función principal (llamada por cron)
export async function ejecutarScoringDiario(): Promise<{
  ok: boolean;
  total: number;
  errores: number;
}> {
  const universo = construirUniversoCompleto();
  const contexto = await fetchContextoDiario();

  let total = 0;
  let errores = 0;

  await mapConcurrente(universo, async (activo) => {
    const result = await procesarActivo(activo, contexto);
    if (result) {
      await persistirScore(result);
      total++;
    } else {
      errores++;
    }
  });

  return { ok: true, total, errores };
}

// Server function wrapper para llamadas on-demand desde la UI
export const ejecutarScoringDiarioUI = createServerFn({ method: "POST" }).handler(async () =>
  ejecutarScoringDiario(),
);

async function persistirScore(score: AssetScoreDiario): Promise<void> {
  try {
    const { supabase } = await import("../supabase");
    await supabase.from("asset_scores_diario").insert({
      ticker: score.ticker,
      fecha: score.fecha,
      scoring_version: score.scoringVersion,
      categoria_macro: score.categoriaMacro,
      subtipo: score.subtipo,
      score_fundamental: score.scoreFundamental,
      score_tecnico: score.scoreTecnico,
      score_cuantitativo: score.scoreCuantitativo,
      score_noticias: score.scoreNoticias,
      score_contexto: score.scoreContexto,
      score_compuesto: score.scoreCompuesto,
      datos_raw: JSON.stringify(score.datosRaw),
    });
  } catch {
    // Si falla persistencia, no tumba el batch
  }
}
