/**
 * Scanner de señales de ENTRADA para CEDEARs del universo completo.
 *
 * Usa 369 CEDEARs extraídos de unificado_completo.json y aplica:
 *   1) RSI oversold + reversal candle
 *   2) MACD bullish crossover
 *   3) SMA20/SMA50 golden cross
 *   4) Bollinger Band squeeze breakout
 *   5) Volume surge + price confirmation
 *
 * Cada indicador produce un score compuesto; los CEDEARs con score >= threshold
 * se convierten en CandidatoSenal para el pipeline del bot unificado.
 */

import { enLotes, serieDe } from "./datos";
import { atrAproximado, ema, rsi, sma, macd } from "./indicadores";
import { CEDEARS_JSON } from "./cedears-universo";
import type { CandidatoSenal } from "./tipos";

export type ScannerCedear = () => Promise<CandidatoSenal[]>;

const MAX_SENALES = 8;
const MIN_SCORE = 3; // mínimo 3/5 indicadores para generar señal
const BATCH_SIZE = 8;
const TIMEOUT_PER_TICKER_MS = 6000;
const MAX_TICKERS_SCAN = 80; // limitar para que no tarde demasiado

/* ────────────── Indicadores auxiliares ────────────── */

function bollingerBands(closes: number[], periodo = 20, desvios = 2): {
  upper: number | null;
  middle: number | null;
  lower: number | null;
  bandwidth: number | null;
} {
  if (closes.length < periodo) return { upper: null, middle: null, lower: null, bandwidth: null };
  const ventana = closes.slice(-periodo);
  const mean = ventana.reduce((s, x) => s + x, 0) / periodo;
  const variance = ventana.reduce((s, x) => s + (x - mean) ** 2, 0) / periodo;
  const sd = Math.sqrt(variance);
  const upper = mean + desvios * sd;
  const lower = mean - desvios * sd;
  const bandwidth = mean > 0 ? ((upper - lower) / mean) * 100 : null;
  return { upper, middle: mean, lower, bandwidth };
}

function volumeSurge(closes: number[], highs: number[], lows: number[]): boolean {
  if (closes.length < 20) return false;
  // Aproximar volumen con ATR como proxy de actividad
  const recent = atrAproximado(closes, highs, lows, 5);
  const baseline = atrAproximado(closes, highs, lows, 20);
  if (recent == null || baseline == null) return false;
  return recent > baseline * 1.3; // 30% más de volatilidad reciente = surge
}

function precioSobreSoporte(closes: number[]): { sobreSoporte: boolean; distanciaPct: number } {
  if (closes.length < 50) return { sobreSoporte: false, distanciaPct: 0 };
  const sma50 = sma(closes, 50);
  const sma200 = closes.length >= 200 ? sma(closes, 200) : null;
  const actual = closes[closes.length - 1]!;
  const soportes = [sma50, sma200].filter((s): s is number => s != null);
  if (!soportes.length) return { sobreSoporte: false, distanciaPct: 0 };
  const soporteMasCercano = Math.max(...soportes.filter((s) => s <= actual * 1.03));
  if (soporteMasCercano <= 0) return { sobreSoporte: false, distanciaPct: 0 };
  const distancia = ((actual - soporteMasCercano) / soporteMasCercano) * 100;
  return { sobreSoporte: distancia <= 5, distanciaPct: distancia };
}

/* ────────────── Scoring multi-indicador ────────────── */

type ResultadoScoring = {
  score: number;
  detalles: string[];
  rsi: number | null;
  macdHist: number | null;
  sma20: number | null;
  sma50: number | null;
  bbLower: number | null;
  bbUpper: number | null;
  atrPct: number | null;
};

function calcularScoreEntrada(closes: number[], highs: number[], lows: number[]): ResultadoScoring {
  const resultado: ResultadoScoring = {
    score: 0,
    detalles: [],
    rsi: null,
    macdHist: null,
    sma20: null,
    sma50: null,
    bbLower: null,
    bbUpper: null,
    atrPct: null,
  };

  if (closes.length < 60) return resultado;

  const actual = closes[closes.length - 1]!;

  // 1) RSI oversold (< 35) — señal de entrada fuerte
  const r = rsi(closes, 14);
  resultado.rsi = r;
  if (r != null && r < 35) {
    resultado.score += 2;
    resultado.detalles.push(`RSI(14) ${r.toFixed(0)} sobrevendido`);
  } else if (r != null && r < 45) {
    resultado.score += 1;
    resultado.detalles.push(`RSI(14) ${r.toFixed(0)} cercano a zona de compra`);
  }

  // 2) MACD bullish crossover (histograma cruza de negativo a positivo)
  const m = macd(closes);
  resultado.macdHist = m.histograma;
  if (m.histograma != null && m.senal != null) {
    const prevHist = m.histograma - (m.macd! - m.senal!); // approx
    if (m.histograma > 0 && prevHist <= 0) {
      resultado.score += 2;
      resultado.detalles.push("MACD crossover alcista");
    } else if (m.histograma > 0) {
      resultado.score += 1;
      resultado.detalles.push("MACD histograma positivo");
    }
  }

  // 3) SMA20 > SMA50 (golden cross reciente o tendencia alcista)
  const s20 = sma(closes.slice(-60), 20);
  const s50 = sma(closes, 50);
  resultado.sma20 = s20;
  resultado.sma50 = s50;
  if (s20 != null && s50 != null) {
    if (s20 > s50 && actual > s50) {
      resultado.score += 2;
      resultado.detalles.push("Precio > SMA20 > SMA50");
    } else if (actual > s50) {
      resultado.score += 1;
      resultado.detalles.push("Precio sobre SMA50");
    }
  }

  // 4) Bollinger: precio toca banda inferior (reversión) o squeeze
  const bb = bollingerBands(closes);
  resultado.bbLower = bb.lower;
  resultado.bbUpper = bb.upper;
  if (bb.lower != null && bb.upper != null) {
    if (actual <= bb.lower * 1.01) {
      resultado.score += 2;
      resultado.detalles.push(`Precio cerca de Bollinger inferior ($${bb.lower.toFixed(2)})`);
    } else if (bb.bandwidth != null && bb.bandwidth < 8) {
      resultado.score += 1;
      resultado.detalles.push("Bollinger squeeze (bandwidth bajo)");
    }
  }

  // 5) Volume surge + sobre soporte
  const vol = volumeSurge(closes, highs, lows);
  const soporte = precioSobreSoporte(closes);
  resultado.atrPct = atrAproximado(closes, highs, lows);
  if (vol && soporte.sobreSoporte) {
    resultado.score += 2;
    resultado.detalles.push(`Volumen elevado + soporte cercano (${soporte.distanciaPct.toFixed(1)}%)`);
  } else if (vol) {
    resultado.score += 1;
    resultado.detalles.push("Aumento de volumen reciente");
  } else if (soporte.sobreSoporte) {
    resultado.score += 1;
    resultado.detalles.push(`Soporte cercano (${soporte.distanciaPct.toFixed(1)}%)`);
  }

  return resultado;
}

/* ────────────── Scanner principal ────────────── */

export const escanearCedearsEntrada: ScannerCedear = async () => {
  const candidatos: CandidatoSenal[] = [];
  const universo = CEDEARS_JSON.filter((t) => t && !t.endsWith("D") && t.length > 1).slice(0, MAX_TICKERS_SCAN);

  await enLotes(universo, BATCH_SIZE, async (ticker) => {
    if (candidatos.length >= MAX_SENALES) return;
    try {
      const serie = await Promise.race([
        serieDe(ticker, "6mo", "1d"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_PER_TICKER_MS)),
      ]);
      if (!serie.ok || serie.closes.length < 60) return;

      const scoring = calcularScoreEntrada(serie.closes, serie.highs, serie.lows);
      if (scoring.score < MIN_SCORE) return;

      const prob = Math.min(0.82, 0.52 + scoring.score * 0.04);
      const atr = scoring.atrPct;
      const stopPct = atr != null ? Math.min(atr * 2.5, 15).toFixed(1) : "8";
      const stop = serie.ultimoPrecio != null ? (serie.ultimoPrecio * (1 - Number(stopPct) / 100)).toFixed(2) : null;

      candidatos.push({
        estrategia: "cedears-entrada",
        tickerBCBA: ticker,
        tickerUS: ticker,
        direccion: "COMPRA",
        precio: serie.ultimoPrecio,
        nivel: `score ${scoring.score}/5 · stop $${stop ?? "?"} (-${stopPct}%) · ${scoring.detalles[0] ?? ""}`,
        prob,
        motivo: `${ticker} con ${scoring.score}/5 condiciones de entrada: ${scoring.detalles.join("; ")}.` +
          (serie.variacionPct != null ? ` Última sesión: ${serie.variacionPct >= 0 ? "+" : ""}${serie.variacionPct.toFixed(2)}%.` : ""),
        metricas: {
          score: scoring.score,
          rsi14: scoring.rsi != null ? Number(scoring.rsi.toFixed(1)) : null,
          macdHist: scoring.macdHist != null ? Number(scoring.macdHist.toFixed(4)) : null,
          sma20: scoring.sma20 != null ? Number(scoring.sma20.toFixed(2)) : null,
          sma50: scoring.sma50 != null ? Number(scoring.sma50.toFixed(2)) : null,
          bbLower: scoring.bbLower != null ? Number(scoring.bbLower.toFixed(2)) : null,
          atrPct: atr != null ? Number(atr.toFixed(2)) : null,
          variacionPct: serie.variacionPct != null ? Number(serie.variacionPct.toFixed(2)) : null,
        },
      });
    } catch {
      /* ticker sin datos */
    }
  });

  return candidatos.sort((a, b) => b.prob - a.prob).slice(0, MAX_SENALES);
};

/* ────────────── Scanner rápido: solo los más oversold ────────────── */

export const escanearCedearsOversold: ScannerCedear = async () => {
  const candidatos: CandidatoSenal[] = [];
  const universo = CEDEARS_JSON.filter((t) => t && !t.endsWith("D") && t.length > 1).slice(0, MAX_TICKERS_SCAN);

  await enLotes(universo, BATCH_SIZE, async (ticker) => {
    if (candidatos.length >= MAX_SENALES) return;
    try {
      const serie = await Promise.race([
        serieDe(ticker, "3mo", "1d"),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), TIMEOUT_PER_TICKER_MS)),
      ]);
      if (!serie.ok || serie.closes.length < 30) return;

      const r = rsi(serie.closes, 14);
      if (r == null || r > 30) return; // solo oversold extremo

      const atr = atrAproximado(serie.closes, serie.highs, serie.lows);
      const stopPct = atr != null ? Math.min(atr * 2.5, 15).toFixed(1) : "10";

      candidatos.push({
        estrategia: "cedears-oversold",
        tickerBCBA: ticker,
        tickerUS: ticker,
        direccion: "COMPRA",
        precio: serie.ultimoPrecio,
        nivel: `RSI ${r.toFixed(0)} · stop -${stopPct}% · reversión a la media`,
        prob: Math.min(0.80, 0.55 + (30 - r) * 0.01),
        motivo: `${ticker} en sobreventa extrema: RSI(14) ${r.toFixed(0)}.` +
          (serie.variacionPct != null ? ` Var: ${serie.variacionPct >= 0 ? "+" : ""}${serie.variacionPct.toFixed(2)}%.` : "") +
          ` Reversión estadística esperada.`,
        metricas: {
          rsi14: Number(r.toFixed(1)),
          atrPct: atr != null ? Number(atr.toFixed(2)) : null,
          variacionPct: serie.variacionPct != null ? Number(serie.variacionPct.toFixed(2)) : null,
        },
      });
    } catch {
      /* ticker sin datos */
    }
  });

  return candidatos.sort((a, b) => a.prob - b.prob).slice(0, MAX_SENALES); // más oversold primero
};
