/**
 * Motor de análisis de riesgo de un activo con series históricas REALES de
 * Yahoo Finance (equivalente a lo que la librería `yfinance` permite calcular
 * con `yf.Ticker(...).history()`: desvío estándar de retornos, volatilidad
 * anualizada, VaR, CVaR, máximo drawdown, rentabilidad y beta vs benchmarks).
 *
 * Reutiliza `yahoo-http` (cookie/crumb + chart) y las estadísticas de
 * `stats.ts` / `estadisticas.ts`, así que no depende de pandillas externas.
 */

import { fetchYahooChart } from "./yahoo-http";
import { returns, mean, variance, computeBeta, ultimoCierre } from "./stats";
import { percentile } from "./estadisticas";
import { serieDiariaConFechas } from "./portafolio";
import { activoPorTicker } from "./catalogo-activos";
import { benchmarkPorTicker } from "./benchmarks-master";

export interface RiesgoResultado {
  simbolo: string;
  label: string;
  error: string | null;

  /** Precio más reciente (Yahoo, de la serie o del meta). */
  precioActual: number | null;
  fechaInicio: string | null;
  fechaFin: string | null;
  observaciones: number;

  /** Retorno medio diario y anualizado (media simple × 252). */
  retornoDiario: number | null;
  retornoAnualizado: number | null;

  /** Desvío estándar de los retornos diarios (σ diario). */
  desvioDiario: number | null;
  /** Volatilidad anualizada (σ × √252). */
  volatilidadAnual: number | null;

  /** Sharpe anualizado (sin tasa libre de riesgo, rf=0). */
  sharpe: number | null;

  /** VaR histórico (percentil de la cola izquierda). */
  var95: number | null;
  var99: number | null;

  /** CVaR / Expected Shortfall (media de los peores retornos). */
  cvar95: number | null;
  cvar99: number | null;

  /** Máxima caída de la serie (peak-to-trough). */
  maxDrawdown: number | null;

  /** Beta / R² vs el mejor benchmark entre SPY y MERVAL. */
  beta: number | null;
  r2: number | null;
  benchmark: string | null;
  betaMuestras: number;

  /** Rango de la ventana usada (ej. "2y"). */
  rango: string;
}

function fmtPct(x: number | null, dec = 2): string {
  if (x == null || !isFinite(x)) return "s/d";
  return `${(x * 100).toFixed(dec)}%`;
}

function pctSigno(x: number | null, dec = 2): string {
  if (x == null || !isFinite(x)) return "s/d";
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(dec)}%`;
}

/** Máxima caída (peak-to-trough) de una serie de precios. */
export function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 2) return null;
  let pico = closes[0]!;
  let peor = 0;
  for (const c of closes) {
    if (c > pico) pico = c;
    const caida = (c - pico) / pico;
    if (caida < peor) peor = caida;
  }
  return peor;
}

/** CVaR (Expected Shortfall): media de los retornos ≤ al percentil p. */
export function expectedShortfall(retornos: number[], pctil: number): number | null {
  if (!retornos.length) return null;
  const umbral = percentile(retornos, pctil);
  const cola = retornos.filter((r) => r <= umbral);
  if (!cola.length) return null;
  return mean(cola);
}

/**
 * Análisis de riesgo completo de un activo con series de Yahoo Finance.
 * `rango` acepta los rangos del endpoint chart ("1y", "2y", "5y", "max"…).
 */
export async function analizarRiesgo(simbolo: string, rango = "2y"): Promise<RiesgoResultado> {
  const base: RiesgoResultado = {
    simbolo,
    label: activoPorTicker(simbolo)?.nombre ?? benchmarkPorTicker(simbolo)?.name ?? simbolo,
    error: null,
    precioActual: null,
    fechaInicio: null,
    fechaFin: null,
    observaciones: 0,
    retornoDiario: null,
    retornoAnualizado: null,
    desvioDiario: null,
    volatilidadAnual: null,
    sharpe: null,
    var95: null,
    var99: null,
    cvar95: null,
    cvar99: null,
    maxDrawdown: null,
    beta: null,
    r2: null,
    benchmark: null,
    betaMuestras: 0,
    rango,
  };
  if (!simbolo?.trim()) {
    base.error = "no se recibió símbolo";
    return base;
  }

  try {
    const pts = await serieDiariaConFechas(simbolo, rango);
    if (pts.length < 20) {
      base.error = `sin datos históricos suficientes de ${simbolo} (se obtuvieron ${pts.length} puntos)`;
      return base;
    }
    const closes = pts.map((p) => p.close);
    const retornosSerie = returns(closes);
    const factor = Math.sqrt(252);

    base.observaciones = retornosSerie.length;
    base.fechaInicio = pts[0]?.fecha ?? null;
    base.fechaFin = pts[pts.length - 1]?.fecha ?? null;
    base.precioActual = ultimoCierre(closes) ?? closes[closes.length - 1] ?? null;

    base.retornoDiario = mean(retornosSerie);
    base.retornoAnualizado = base.retornoDiario * 252;
    const sigmaDiario = Math.sqrt(variance(retornosSerie));
    base.desvioDiario = sigmaDiario;
    base.volatilidadAnual = sigmaDiario * factor;
    base.sharpe = sigmaDiario > 0 ? base.retornoAnualizado / (sigmaDiario * factor) : 0;

    base.var95 = percentile(retornosSerie, 5);
    base.var99 = percentile(retornosSerie, 1);
    base.cvar95 = expectedShortfall(retornosSerie, 5);
    base.cvar99 = expectedShortfall(retornosSerie, 1);
    base.maxDrawdown = maxDrawdown(closes);

    if (retornosSerie.length >= 20) {
      const [spy, merv] = await Promise.all([
        fetchYahooChart("SPY", rango, "1d"),
        fetchYahooChart("^MERV", rango, "1d"),
      ]);
      const closesSpy = (spy?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(
        (c): c is number => typeof c === "number" && isFinite(c),
      );
      const closesMerv = (merv?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(
        (c): c is number => typeof c === "number" && isFinite(c),
      );
      const betaInfo = computeBeta(closes, closesSpy, closesMerv);
      if (betaInfo.beta != null && isFinite(betaInfo.beta)) {
        base.beta = betaInfo.beta;
        base.r2 = betaInfo.r2;
        base.benchmark = betaInfo.benchmark;
        base.betaMuestras = betaInfo.muestras;
      }
    }
  } catch (e) {
    base.error = e instanceof Error ? e.message : "error desconocido";
  }
  return base;
}

/** Texto legible de los resultados de riesgo (para dar al redactor). */
export function textoRiesgo(r: RiesgoResultado): string {
  if (r.error) {
    return `RESULTADO DEL TOOL analizar_riesgo:\nNO se pudo calcular el riesgo de ${
      r.simbolo
    } con datos reales de Yahoo Finance: ${r.error}.\nESTÁ PROHIBIDO inventar desvíos, volatilidades, VaR, drawdowns ni betas (queda prohibido también presentar "estimaciones" o "valores aproximados" como si fueran reales). Si el dato no está disponible, decilo con honestidad y ofrecé reintentar.`;
  }
  const L: string[] = [];
  L.push(
    `Riesgo de ${r.label} (${r.simbolo}) — datos ${r.rango} · ${r.observaciones} sesiones (${r.fechaInicio} → ${r.fechaFin})`,
  );
  L.push(
    `- Precio actual: ${r.precioActual != null ? r.precioActual.toFixed(2) : "s/d"} ${r.precioActual != null ? "USD" : ""}`.trim(),
  );
  L.push(
    `- Retorno medio diario: ${pctSigno(r.retornoDiario)} · anualizado: ${pctSigno(r.retornoAnualizado)}`,
  );
  L.push(`- Desvío estándar diario de retornos (σ): ${fmtPct(r.desvioDiario)}`);
  L.push(`- Volatilidad anualizada (σ×√252): ${fmtPct(r.volatilidadAnual)}`);
  L.push(`- Sharpe anualizado (rf=0): ${r.sharpe != null ? r.sharpe.toFixed(2) : "s/d"}`);
  L.push(`- VaR 95% (diario): ${fmtPct(r.var95)} · VaR 99% (diario): ${fmtPct(r.var99)}`);
  L.push(`- CVaR / Expected Shortfall 95%: ${fmtPct(r.cvar95)} · 99%: ${fmtPct(r.cvar99)}`);
  L.push(`- Máxima caída (max drawdown): ${fmtPct(r.maxDrawdown)}`);
  if (r.beta != null) {
    L.push(
      `- Beta vs ${r.benchmark ?? "—"}: ${r.beta.toFixed(2)} (R² = ${(r.r2 ?? 0).toFixed(3)}, ${r.betaMuestras} muestras)`,
    );
  }
  return L.join("\n");
}
