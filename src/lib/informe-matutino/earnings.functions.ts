// Resultados corporativos relevantes del día (earnings calendar).
//
// Fuente principal: Finnhub /calendar/earnings (requiere FINNHUB_API_KEY,
// tier gratuito sirve). Sin key, devuelve [] y el informe no menciona
// resultados — nunca inventa.
//
//   GET https://finnhub.io/api/v1/calendar/earnings?from=YYYY-MM-DD&to=YYYY-MM-DD&token=KEY
//
// La lista de empresas a vigilar es configurable via env:
//   EARNINGS_WATCHLIST=WMT,MCD,HD,NVDA,TSLA
// Si no está definida se usa un watchlist por defecto de referencias de
// consumo/mega caps que suelen mover el humor del mercado.

import { getCached, setCache } from "../cache";

export interface ResultadoCorporativo {
  ticker: string;
  empresa: string;
  hora: string; // "antes de la apertura" | "después del cierre" | "--"
  epsConsenso: number | null;
  ingresoConsensoUSD: number | null;
}

const CACHE_KEY = "earnings-hoy";
const CACHE_TTL = 30 * 60 * 1000;

const WATCHLIST_DEFAULT = [
  "WMT",
  "MCD",
  "HD",
  "LOW",
  "TGT",
  "KO",
  "PEP",
  "NVDA",
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "TSLA",
];

interface FinnhubEarningsItem {
  symbol?: string;
  epsAverage?: number | null;
  revenueEstimate?: number | null;
  hour?: string | null;
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function hoyISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Empresas del watchlist que reportan HOY, con consenso de EPS e ingresos. */
export async function getEarningsHoy(): Promise<ResultadoCorporativo[]> {
  const cached = getCached<ResultadoCorporativo[]>(CACHE_KEY, CACHE_TTL);
  if (cached) return cached;

  const key = process.env.FINNHUB_API_KEY;
  if (!key) return [];

  const fecha = hoyISO();
  const json = await fetchJson(
    `https://finnhub.io/api/v1/calendar/earnings?from=${fecha}&to=${fecha}&token=${key}`,
  );
  if (!json || typeof json !== "object") return [];

  const items = (json as { earningsCalendar?: FinnhubEarningsItem[] }).earningsCalendar;
  if (!Array.isArray(items)) return [];

  const watchlist = (process.env.EARNINGS_WATCHLIST ?? "")
    .split(",")
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  const lista = watchlist.length ? watchlist : WATCHLIST_DEFAULT;

  const resultados: ResultadoCorporativo[] = [];
  for (const it of items) {
    const sym = (it.symbol ?? "").toUpperCase();
    if (!sym || !lista.includes(sym)) continue;
    const horaRaw = (it.hour ?? "").toLowerCase();
    resultados.push({
      ticker: sym,
      empresa: sym,
      hora:
        horaRaw === "before"
          ? "antes de la apertura"
          : horaRaw === "after"
            ? "después del cierre"
            : "--",
      epsConsenso: typeof it.epsAverage === "number" ? +it.epsAverage.toFixed(2) : null,
      ingresoConsensoUSD:
        typeof it.revenueEstimate === "number" ? Math.round(it.revenueEstimate) : null,
    });
  }

  setCache(CACHE_KEY, resultados);
  return resultados;
}
