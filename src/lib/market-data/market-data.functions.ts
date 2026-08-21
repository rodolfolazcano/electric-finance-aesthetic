// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTokens } from "@/lib/herramientas/iol-auth";
import type {
  QuoteData,
  HistoricalBar,
  MercadoIOL,
  RangoHistorico,
  IntervaloHistorico,
} from "@/lib/herramientas/market-data.types";
import { RANGO_DAYS } from "@/lib/herramientas/market-data.types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _yf: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getYF(): Promise<any> {
  if (_yf) return _yf;
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

async function yahooHistoricalBars(
  symbol: string,
  rango: RangoHistorico,
  intervalo: IntervaloHistorico = "1d",
): Promise<HistoricalBar[]> {
  const yf = await getYF();
  const period2 = new Date();
  const period1 = new Date(Date.now() - RANGO_DAYS[rango] * 24 * 60 * 60 * 1000);
  const rows = await yf.chart(symbol, { period1, period2, interval: intervalo });
  const quotes: Array<{
    date?: Date | null;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    close?: number | null;
    volume?: number | null;
  }> = rows?.quotes ?? [];
  const isIntraday = intervalo !== "1d" && intervalo !== "1wk" && intervalo !== "1mo";
  return quotes
    .filter((q) => q.date != null && q.close != null)
    .map((q) => ({
      fecha: isIntraday
        ? (q.date as Date).toISOString()
        : (q.date as Date).toISOString().slice(0, 10),
      apertura: q.open ?? 0,
      maximo: q.high ?? 0,
      minimo: q.low ?? 0,
      cierre: q.close as number,
      volumen: q.volume ?? 0,
    }));
}

/** Infiere la moneda de un símbolo cuando la API no la trae (o cae el quote).
 *  El sufijo BCBA (.BA) es autoridad absoluta → ARS; el sufijo CEDEAR D (sin punto) → USD.
 *  Solo se usa el currency que devuelve Yahoo para tickers que no tengan sufijo
 *  BCBA, de modo que un ticker extraño como "J.BA" nunca se marque como USD. */
export function inferMonedaYahoo(symbol: string, apiCurrency?: string | null): "ARS" | "USD" {
  const s = symbol.trim().toUpperCase();
  if (s.endsWith(".BA")) return "ARS";
  if (s.endsWith("D") && !s.includes(".")) return "USD";
  if (apiCurrency === "ARS" || apiCurrency === "USD") return apiCurrency;
  return "USD";
}

function buildEmptyYahooQuote(symbol: string): QuoteData {
  return {
    ticker: symbol,
    source: "yahoo",
    precio: 0,
    variacion: 0,
    variacionPct: 0,
    apertura: null,
    maximo: null,
    minimo: null,
    volumen: null,
    fechaHora: new Date().toISOString(),
    moneda: inferMonedaYahoo(symbol),
  };
}

//  YAHOO: Cotizacion actual 
export const getYahooQuoteServer = createServerFn({ method: "GET" })
  .inputValidator((input: { symbol: string }) =>
    z.object({ symbol: z.string().min(1).max(20) }).parse(input),
  )
  .handler(async ({ data }): Promise<QuoteData> => {
    try {
      const yf = await getYF();
      const qs = await yf.quoteSummary(data.symbol, { modules: ["price", "summaryDetail"] });
      const p = qs?.price ?? {};
      const sd = qs?.summaryDetail ?? {};

      if (!p.regularMarketPrice) {
        // Fallback: Yahoo Finance no devolvió precio para este símbolo.
        return buildEmptyYahooQuote(data.symbol);
      }

      return {
        ticker: data.symbol,
        source: "yahoo",
        precio: p.regularMarketPrice ?? 0,
        variacion: p.regularMarketChange ?? 0,
        variacionPct: p.regularMarketChangePercent ?? 0,
        apertura: sd.regularMarketOpen ?? null,
        maximo: sd.regularMarketDayHigh ?? null,
        minimo: sd.regularMarketDayLow ?? null,
        volumen: sd.regularMarketVolume ?? null,
        fechaHora: new Date().toISOString(),
        moneda: inferMonedaYahoo(data.symbol, p.currency),
      };
    } catch (error) {
      // Fallback defensivo: cualquier error de importación o de Yahoo Finance
      // durante el SSR no debe romper el renderizado de la página.
      console.error(`[getYahooQuoteServer] Fallback para ${data.symbol}:`, error);
      return buildEmptyYahooQuote(data.symbol);
    }
  });

//  YAHOO: Serie historica 
export const getYahooHistoricalServer = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { symbol: string; rango: RangoHistorico; intervalo?: IntervaloHistorico }) =>
      z
        .object({
          symbol: z.string().min(1).max(20),
          rango: z.enum(["1M", "3M", "6M", "1A", "2A", "5A"]),
          intervalo: z
            .enum(["1m", "5m", "15m", "30m", "1h", "1d", "1wk", "1mo"])
            .optional()
            .default("1d"),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<HistoricalBar[]> =>
    yahooHistoricalBars(data.symbol, data.rango, data.intervalo),
  );

//  IOL: helpers 
function parseIOLQuote(raw: any, ticker: string, mercado: MercadoIOL): QuoteData {
  return {
    ticker,
    source: "iol",
    precio: raw.ultimoPrecio ?? 0,
    variacion: raw.variacion ?? 0,
    variacionPct: raw.variacionPorcentual ?? 0,
    apertura: raw.apertura ?? null,
    maximo: raw.maximo ?? null,
    minimo: raw.minimo ?? null,
    volumen: raw.volumenNominal ?? null,
    fechaHora: raw.fechaHora ?? new Date().toISOString(),
    moneda: mercado === "bCBA" ? "ARS" : "USD",
  };
}

function calcularFechaDesde(rango: RangoHistorico): Date {
  const hoy = new Date();
  const meses: Record<RangoHistorico, number> = {
    "1M": 1,
    "3M": 3,
    "6M": 6,
    "1A": 12,
    "2A": 24,
    "5A": 60,
  };
  hoy.setMonth(hoy.getMonth() - meses[rango]);
  return hoy;
}

function parseIOLHistorical(raw: any[]): HistoricalBar[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((bar) => ({
      fecha: (bar.fechaHora ?? bar.fecha ?? "").split("T")[0],
      apertura: bar.apertura ?? bar.precioApertura ?? 0,
      maximo: bar.maximo ?? bar.precioMaximo ?? 0,
      minimo: bar.minimo ?? bar.precioMinimo ?? 0,
      cierre: bar.ultimoPrecio ?? bar.precioCierre ?? bar.cierre ?? 0,
      volumen: bar.volumenNominal ?? bar.volumen ?? 0,
    }))
    .filter((bar) => bar.cierre > 0 && bar.fecha)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

async function iolFetch<T>(
  url: string,
  token: string,
  refreshToken: string | null,
): Promise<{ data: T; newToken?: string; newRefreshToken?: string }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401 && refreshToken) {
    try {
      const tokens = await fetchTokens({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      if (!("error" in tokens)) {
        const retry = await fetch(url, {
          headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
        });
        if (retry.ok) {
          return {
            data: (await retry.json()) as T,
            newToken: tokens.accessToken,
            newRefreshToken: tokens.refreshToken,
          };
        }
      }
    } catch {
      // Ignorar error de refresh
    }
    throw new Error(
      "Sesión IOL expirada. Iniciá sesión nuevamente desde el botón superior derecho.",
    );
  }
  if (!res.ok) throw new Error(`IOL error: ${res.status} - ${await res.text().catch(() => "")}`);
  return { data: (await res.json()) as T };
}

type IOLResult<T> = { data: T; newToken?: string; newRefreshToken?: string };

//  IOL: Cotizacion actual 
export const getIOLQuoteServer = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { ticker: string; mercado: MercadoIOL; token: string; refreshToken: string | null }) =>
      z
        .object({
          ticker: z.string().min(1).max(20),
          mercado: z.enum(["bCBA", "NYSE", "NASDAQ"]),
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<IOLResult<QuoteData>> => {
    const mercado = data.mercado === "bCBA" ? "BCBA" : data.mercado;
    const url = `https://api.invertironline.com/api/v2/${mercado}/Titulos/${data.ticker}/Cotizacion`;
    const result = await iolFetch<any>(url, data.token, data.refreshToken);
    return { ...result, data: parseIOLQuote(result.data, data.ticker, data.mercado) };
  });

//  IOL: Serie historica 
export const getIOLHistoricalServer = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      ticker: string;
      mercado: MercadoIOL;
      token: string;
      refreshToken: string | null;
      rango: RangoHistorico;
    }) =>
      z
        .object({
          ticker: z.string().min(1).max(20),
          mercado: z.enum(["bCBA", "NYSE", "NASDAQ"]),
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
          rango: z.enum(["1M", "3M", "6M", "1A", "2A", "5A"]),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<IOLResult<HistoricalBar[]>> => {
    const hoy = new Date();
    const desde = calcularFechaDesde(data.rango);
    const fechaDesde = desde.toISOString().split("T")[0];
    const fechaHasta = hoy.toISOString().split("T")[0];
    const mercado = data.mercado === "bCBA" ? "BCBA" : data.mercado;
    const url = `https://api.invertironline.com/api/v2/${mercado}/Titulos/${data.ticker}/Cotizacion/seriehistorica/${fechaDesde}/${fechaHasta}/SinAjustar`;
    const raw = await iolFetch<any[]>(url, data.token, data.refreshToken);
    return { ...raw, data: parseIOLHistorical(raw.data) };
  });

//  IOL: Panel completo (todos los instrumentos de un tipo) 
export const getIOLPanelServer = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { instrumento: string; pais: string; token: string; refreshToken: string | null }) =>
      z
        .object({
          instrumento: z.enum([
            "acciones",
            "cedears",
            "titulosPublicos",
            "obligacionesNegociables",
            "cauciones",
            "adrs",
          ]),
          pais: z.enum(["argentina", "estados_unidos"]),
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const url = `https://api.invertironline.com/api/v2/Cotizaciones/${data.instrumento}/${data.pais}/Todos`;
    const result = await iolFetch<any>(url, data.token, data.refreshToken);
    return { ...result, data: (result.data.titulos ?? result.data ?? []) as any[] };
  });
