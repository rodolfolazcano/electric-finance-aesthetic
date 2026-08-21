import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _yf: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try {
    _yf = typeof YF === "function" ? new YF() : YF;
  } catch {
    _yf = YF;
  }
  try {
    _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
  } catch {
    /* noop */
  }
  return _yf;
}

export interface CotizacionMap {
  dolar: number | null;
  prices: Record<string, number | null>;
  errors: string[];
}

const LIQUID_CCL: { nyse: string; bcba: string; ratio: number }[] = [
  { nyse: "AAPL", bcba: "AAPL", ratio: 20 },
  { nyse: "MSFT", bcba: "MSFT", ratio: 30 },
  { nyse: "KO", bcba: "KO", ratio: 5 },
  { nyse: "GGAL", bcba: "GGAL", ratio: 10 },
];

export const getCotizacionesMasivas = createServerFn({ method: "POST" })
  .inputValidator((input: { symbols: string[]; bcbaSymbols: string[] }) =>
    z.object({ symbols: z.array(z.string()), bcbaSymbols: z.array(z.string()) }).parse(input),
  )
  .handler(async ({ data }): Promise<CotizacionMap> => {
    const errors: string[] = [];
    const yf = await getYF();
    const prices: Record<string, number | null> = {};

    // Helper: fetch prices in batches of 20 to avoid Yahoo API limits
    const BATCH_SIZE = 20;

    async function fetchBatch(symbols: string[], suffix: string): Promise<void> {
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        const batch = symbols.slice(i, i + BATCH_SIZE);
        try {
          const quotes = await yf.quote(batch);
          const arr = Array.isArray(quotes) ? quotes : [quotes];
          for (const q of arr) {
            const rawSym = ((q.symbol as string) ?? "").toUpperCase();
            const sym = rawSym.replace(/\.BA$/, "");
            // yahoo-finance2 v3 quote() puede devolver price directo o anidado
            const price = q.regularMarketPrice ?? q.price?.regularMarketPrice ?? null;
            prices[sym + suffix] = price != null ? Number(price) : null;
          }
        } catch {
          errors.push(`Error en lote de cotizaciones: ${batch.join(", ")}`);
        }
      }
    }

    // NYSE symbols
    if (data.symbols.length > 0) {
      await fetchBatch(data.symbols, "");
    }

    // BCBA symbols (with .BA suffix)
    if (data.bcbaSymbols.length > 0) {
      const baSymbols = data.bcbaSymbols.map((s) => (s.endsWith(".BA") ? s : s + ".BA"));
      await fetchBatch(baSymbols, ".BA");
    }

    // Fetch ARS=X as fallback for dollar rate
    try {
      const dq = await yf.quote("ARS=X");
      const arr = Array.isArray(dq) ? dq : [dq];
      const dolarPrice = arr[0]?.regularMarketPrice ?? arr[0]?.price?.regularMarketPrice ?? null;
      prices["_DOLAR"] = dolarPrice != null ? Number(dolarPrice) : null;
    } catch {
      prices["_DOLAR"] = null;
    }

    // Compute CCL rate from liquid CEDEAR/ADR prices instead of using Yahoo's ARS=X
    let dolar: number | null = null;
    const cclValues: number[] = [];
    for (const { nyse, bcba, ratio } of LIQUID_CCL) {
      const usPrice = prices[nyse.toUpperCase()];
      const baPrice = prices[bcba.toUpperCase() + ".BA"];
      if (usPrice != null && baPrice != null && usPrice > 0 && ratio > 0) {
        cclValues.push(baPrice / (usPrice / ratio));
      }
    }
    if (cclValues.length >= 2) {
      dolar = +(cclValues.reduce((s, v) => s + v, 0) / cclValues.length).toFixed(2);
    }
    // Fallback to Yahoo's ARS=X if CCL computation failed
    if (dolar == null) {
      dolar = prices["_DOLAR"] ?? null;
      if (dolar == null) errors.push("No se pudo obtener cotización del dólar");
    }

    return { dolar, prices, errors };
  });
