// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getValidToken } from "./iol-auth";
import { getYahooSession } from "./yahoo-http";
import { getRiskFreeRateSync } from "./risk-free-rate";

type InstrumentoTipo =
  | "accion_us"
  | "cedear_o_accion_ba"
  | "bono_titulo_publico"
  | "obligacion_negociable"
  | "caucion"
  | "desconocido";

const BONOS_PREFIJOS = ["AL", "GD", "AE", "PR", "TX", "TV", "TZV", "S", "P", "T"];
const BONOS_PATRON = new RegExp(`^(${BONOS_PREFIJOS.join("|")})\\d+[A-Z]?[0-9]*$`, "i");

export function clasificarInstrumento(ticker: string): InstrumentoTipo {
  const t = ticker.toUpperCase().trim();
  if (t.endsWith(".BA")) return "cedear_o_accion_ba";
  if (BONOS_PATRON.test(t) || t.includes("LECAP") || t.includes("BONCAP"))
    return "bono_titulo_publico";
  if (/^[A-Z]{1,5}$/.test(t)) return "accion_us";
  return "desconocido";
}

function esARS(ticker: string): boolean {
  return ticker.endsWith(".BA") || clasificarInstrumento(ticker) === "bono_titulo_publico";
}

// ============================================================================
// TIPOS
// ============================================================================

export interface CuantitativoResult {
  ticker: string;
  source: "yfinance" | "iol";
  currentPrice: number;
  n: number;
  meanAnnual: number;
  volatilityAnnual: number;
  sharpeRatio: number;
  var95: number;
  skewness: number;
  kurtosis: number;
  jbStat: number;
  pValue: number;
  isNormal: boolean;
  maxLoss: number;
  expectedLoss: number;
  expectedGain: number;
  maxGain: number;
  mostProbable: number;
  priceHistory: { date: string; close: number }[];
  returnsHistogram: { bin: number; count: number }[];
  instrumentType: InstrumentoTipo;
  necesitaIOL: boolean;
  error: string | null;
}

// ============================================================================
// HELPERS MATEMÁTICOS
// ============================================================================

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1));
}

function percentile(arr: number[], p: number): number {
  const sorted = [...arr].sort((a, b) => a - b);
  if (p <= 0) return sorted[0];
  if (p >= 100) return sorted[sorted.length - 1];
  const idx = (p / 100) * (sorted.length - 1);
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  if (low === high) return sorted[low];
  return sorted[low] + (idx - low) * (sorted[high] - sorted[low]);
}

function median(arr: number[]): number {
  return percentile(arr, 50);
}

function computeDistributionStats(closes: number[], currentPrice: number) {
  if (closes.length < 30) {
    return {
      error: `Datos insuficientes para un análisis estadístico confiable (mínimo 30 observaciones, se obtuvieron ${closes.length}).`,
    };
  }

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] <= 0) continue;
    returns.push(closes[i] / closes[i - 1] - 1);
  }

  if (returns.length < 30) {
    return {
      error: `Datos insuficientes tras filtrar valores inválidos (${returns.length} observaciones válidas).`,
    };
  }

  const n = returns.length;
  const m = mean(returns);
  const std = stdDev(returns);
  const factor = 252;
  const meanAnnual = m * factor;
  const volAnnual = std * Math.sqrt(factor);
  const sharpe = volAnnual > 0 ? (meanAnnual - getRiskFreeRateSync("USD")) / volAnnual : 0;
  const var95 = percentile(returns, 5);

  // skewness = m3 / m2^1.5
  const m2 = returns.reduce((s, v) => s + (v - m) ** 2, 0) / n;
  const m3 = returns.reduce((s, v) => s + (v - m) ** 3, 0) / n;
  const m4 = returns.reduce((s, v) => s + (v - m) ** 4, 0) / n;
  const skewness = m2 > 0 ? m3 / Math.pow(m2, 1.5) : 0;
  const kurtosis = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;
  const jbStat = (n / 6) * (skewness ** 2 + kurtosis ** 2 / 4);
  const pValue = Math.exp(-jbStat / 2);
  const isNormal = pValue > 0.05;

  const maxLoss = currentPrice * var95;
  const negReturns = returns.filter((r) => r < 0);
  const posReturns = returns.filter((r) => r > 0);
  const expectedLoss = negReturns.length > 0 ? currentPrice * mean(negReturns) : 0;
  const expectedGain = posReturns.length > 0 ? currentPrice * mean(posReturns) : 0;
  const maxGain = currentPrice * Math.max(...returns);
  const mostProbable = currentPrice * median(returns);

  // Histograma
  const minR = Math.min(...returns);
  const maxR = Math.max(...returns);
  const bins = 50;
  const binW = (maxR - minR) / bins || 0.001;
  const histogram: { bin: number; count: number }[] = [];
  for (let i = 0; i < bins; i++) {
    const lo = minR + i * binW;
    const hi = lo + binW;
    histogram.push({
      bin: +(lo * 100).toFixed(2),
      count: returns.filter((r) => r >= lo && r < hi).length,
    });
  }

  return {
    error: null,
    stats: {
      n,
      meanAnnual,
      volatilityAnnual: volAnnual,
      sharpeRatio: sharpe,
      var95,
      skewness,
      kurtosis,
      jbStat,
      pValue,
      isNormal,
      maxLoss,
      expectedLoss,
      expectedGain,
      maxGain,
      mostProbable,
      returnsHistogram: histogram,
    },
  };
}

// ============================================================================
// SERVER FUNCTION
// ============================================================================

export const getCuantitativo = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string().min(1).max(20),
      source: z.enum(["yfinance", "iol"]).default("yfinance"),
      market: z
        .enum(["bCBA", "bNYSE", "bNASDAQ", "bROFX", "BCBA", "NYSE", "NASDAQ", "ROFX"])
        .default("BCBA"),
      adjusted: z.enum(["SinAjustar", "Ajustada"]).default("SinAjustar"),
      years: z.union([z.literal(1), z.literal(3), z.literal(5)]).default(3),
      sessionId: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const tipo = clasificarInstrumento(data.ticker);

    if (data.source === "iol") {
      if (!data.sessionId) {
        return {
          ticker: data.ticker,
          source: "iol" as const,
          error: "Sesión IOL no válida o expirada. Volvé a iniciar sesión en el panel principal.",
          necesitaIOL: true,
        } as CuantitativoResult;
      }
      const token = getValidToken(data.sessionId);
      if (!token) {
        return {
          ticker: data.ticker,
          source: "iol" as const,
          error: "Sesión IOL no válida o expirada. Volvé a iniciar sesión en el panel principal.",
          necesitaIOL: true,
        } as CuantitativoResult;
      }

      // Auto-detect IOL market based on ticker type (API v2 format: NASDAQ, NYSE, BCBA, ROFX)
      const iolMarkets = (() => {
        if (tipo === "accion_us") return ["NASDAQ", "NYSE"] as const;
        if (tipo === "cedear_o_accion_ba") return ["BCBA"] as const;
        if (tipo === "bono_titulo_publico") return ["BCBA"] as const;
        return ["BCBA"] as const;
      })();

      const ahora = new Date();
      const desde = new Date(ahora);
      desde.setFullYear(desde.getFullYear() - data.years);
      const fechaDesde = desde.toISOString().split("T")[0];
      const fechaHasta = ahora.toISOString().split("T")[0];

      let lastError: string | null = null;
      for (const mkt of iolMarkets) {
        try {
          const url = `https://api.invertironline.com/api/v2/${mkt}/Titulos/${encodeURIComponent(data.ticker)}/Cotizacion/seriehistorica/${fechaDesde}/${fechaHasta}/${data.adjusted}`;
          const res = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            cache: "no-store",
          });

          if (res.status === 401) {
            return {
              ticker: data.ticker,
              source: "iol" as const,
              error: "Sesión IOL expirada. Volvé a iniciar sesión en el panel principal.",
              necesitaIOL: true,
            } as CuantitativoResult;
          }
          if (!res.ok) {
            lastError = `No se encontraron datos para ${data.ticker} en IOL (${mkt}).`;
            continue;
          }

          const arr = await res.json();
          if (!Array.isArray(arr) || arr.length === 0) {
            lastError = `No se encontraron datos para ${data.ticker} en IOL (${mkt}).`;
            continue;
          }

          const closes: number[] = [];
          const history: { date: string; close: number }[] = [];
          for (const p of arr) {
            const price = p.ultimoPrecio ?? p.cierreAnterior ?? p.cierre ?? null;
            const date = p.fecha ?? p.fechaHora?.split("T")[0] ?? "";
            if (price != null && date) {
              closes.push(price);
              history.push({ date, close: price });
            }
          }

          const result = computeDistributionStats(closes, closes[closes.length - 1]);
          if (result.error) {
            return {
              ticker: data.ticker,
              source: "iol" as const,
              error: result.error,
              necesitaIOL: false,
            } as CuantitativoResult;
          }

          return {
            ticker: data.ticker,
            source: "iol" as const,
            currentPrice: closes[closes.length - 1],
            ...result.stats,
            priceHistory: history.slice(-252),
            instrumentType: tipo,
            necesitaIOL: false,
            error: null,
          } as CuantitativoResult;
        } catch (err) {
          lastError = (err as Error).message;
        }
      }

      return {
        ticker: data.ticker,
        source: "iol" as const,
        error:
          lastError ??
          `No se encontraron datos para ${data.ticker} en IOL. Probá con otra fuente o verificá el símbolo.`,
        necesitaIOL: false,
      } as CuantitativoResult;
    }

    // yfinance: fetch desde Yahoo chart API (con o sin cookie/crumb)
    const rangeMap: Record<number, string> = { 1: "1y", 3: "3y", 5: "5y" };
    const range = rangeMap[data.years];
    const UA =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    async function doFetch(rangeOverride?: string, attempt = 0): Promise<CuantitativoResult> {
      let fetchUrl: string;
      let fetchHeaders: Record<string, string>;
      const rng = rangeOverride ?? range;

      const session = await getYahooSession(attempt > 0);
      if (session) {
        fetchUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(data.ticker)}?range=${rng}&interval=1d&crumb=${encodeURIComponent(session.crumb)}`;
        fetchHeaders = { Cookie: session.cookie, "User-Agent": UA };
      } else {
        fetchUrl = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(data.ticker)}?range=${rng}&interval=1d`;
        fetchHeaders = { "User-Agent": UA };
      }

      const res = await fetch(fetchUrl, { headers: fetchHeaders, cache: "no-store" });
      if (!res.ok) {
        if (res.status === 429 && attempt < 3) {
          const delay = Math.pow(3, attempt) * 1000 + Math.random() * 2000;
          await new Promise((r) => setTimeout(r, delay));
          return doFetch(rng, attempt + 1);
        }
        return {
          ticker: data.ticker,
          source: "yfinance" as const,
          error: `Yahoo ${res.status}: no se encontraron datos para ${data.ticker}.`,
          necesitaIOL: tipo !== "accion_us" && tipo !== "cedear_o_accion_ba",
        } as CuantitativoResult;
      }

      const j = await res.json();
      const result = j?.chart?.result?.[0];
      if (!result) {
        if (rng !== "1mo") return doFetch("1mo", attempt);
        return {
          ticker: data.ticker,
          source: "yfinance" as const,
          error: `No se encontraron datos para ${data.ticker} en yfinance.`,
          necesitaIOL: tipo !== "accion_us" && tipo !== "cedear_o_accion_ba",
        } as CuantitativoResult;
      }

      const closes = (result.indicators?.quote?.[0]?.close ?? []).filter(
        (c: any) => c != null && c > 0,
      ) as number[];
      const timestamps = (result.timestamp as number[]) ?? [];

      if (closes.length < 30) {
        if (rng !== "1mo") return doFetch("1mo", attempt);
        return {
          ticker: data.ticker,
          source: "yfinance" as const,
          error: `Datos insuficientes (${closes.length} días — probá IOL o un ticker de USA).`,
          necesitaIOL: tipo !== "accion_us",
        } as CuantitativoResult;
      }

      const history = timestamps
        .map((t: number, i: number) => ({
          date: new Date(t * 1000).toISOString().split("T")[0],
          close: closes[i] ?? 0,
        }))
        .filter((h) => h.close > 0);

      const statResult = computeDistributionStats(closes, closes[closes.length - 1]);
      if (statResult.error) {
        return {
          ticker: data.ticker,
          source: "yfinance" as const,
          error: statResult.error,
          necesitaIOL: false,
        } as CuantitativoResult;
      }

      return {
        ticker: data.ticker,
        source: "yfinance" as const,
        currentPrice: closes[closes.length - 1],
        ...statResult.stats,
        priceHistory: history.slice(-252),
        instrumentType: tipo,
        necesitaIOL: tipo !== "accion_us" && tipo !== "cedear_o_accion_ba",
        error: null,
      } as CuantitativoResult;
    }

    try {
      return await doFetch();
    } catch (err) {
      return {
        ticker: data.ticker,
        source: "yfinance" as const,
        error: (err as Error).message,
        necesitaIOL: false,
      } as CuantitativoResult;
    }
  });
