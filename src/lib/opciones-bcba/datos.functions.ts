/**
 * Datos OHLCV para opciones/predicción — usa el endpoint chart de Yahoo
 * con el patrón de headers de yahoo-http.ts (funciona en Vercel).
 */

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.38";

export interface VelasResultado {
  ok: boolean;
  error?: string;
  velas: import("./prediccion.functions").Vela[];
  spot: number | null;
}

interface YChartResponse {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

/** Historial diario OHLCV de un ticker (.BA o US). */
export async function obtenerVelas(tickerRaw: string, rango = "2y"): Promise<VelasResultado> {
  const ticker = tickerRaw.trim().toUpperCase();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    ticker,
  )}?range=${encodeURIComponent(rango)}&interval=1d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": YAHOO_UA, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { ok: false, error: `Yahoo ${res.status}`, velas: [], spot: null };
    const json = (await res.json()) as YChartResponse;
    const r = json.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (!r?.timestamp || !q?.close) {
      return {
        ok: false,
        error: json.chart?.error?.description ?? "respuesta sin series",
        velas: [],
        spot: null,
      };
    }
    const velas: VelasResultado["velas"] = [];
    for (let i = 0; i < r.timestamp.length; i++) {
      const c = q.close[i];
      if (c == null || !Number.isFinite(c)) continue;
      velas.push({
        fecha: new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10),
        high: q.high?.[i] ?? c,
        low: q.low?.[i] ?? c,
        close: c,
        volume: q.volume?.[i] ?? 0,
      });
    }
    const spot = velas.length > 0 ? velas[velas.length - 1].close : null;
    return { ok: true, velas, spot };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "fetch error",
      velas: [],
      spot: null,
    };
  }
}

/** Retornos log diarios de una serie de cierres. */
export function retornosLog(cierres: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < cierres.length; i++) {
    if (cierres[i - 1] > 0 && Number.isFinite(cierres[i]))
      out.push(Math.log(cierres[i] / cierres[i - 1]));
  }
  return out;
}
