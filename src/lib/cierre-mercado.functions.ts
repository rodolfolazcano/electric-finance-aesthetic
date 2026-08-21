// Dashboard de Cierre de Mercado (EE.UU. + global) — server fn agregadora.
// Reutiliza: yahooChartOHLCV (series Yahoo), getCached/setCache (TTL),
// getMarketScreeners (day gainers/losers). Snapshot por fecha de cierre:
// la cache queda keyed a la última sesión cerrada de Wall Street, así el
// reporte se "regenera automáticamente" una vez por cierre.

import { createServerFn } from "@tanstack/react-start";
import { yahooChartOHLCV, type OHLCVBar } from "./herramientas/yahoo-chart";
import { getMarketScreeners } from "./herramientas/daily-opportunities.functions";
import { getCached, setCache } from "./cache";

const CACHE_TTL = 12 * 60 * 60 * 1000; // 12h — un snapshot por cierre
const CONCURRENCIA = 6;
const BARRAS_SPARKLINE = 63; // ~3 meses de ruedas

//  Tipos exportados (los consume el panel UI)

export interface CierreRow {
  nombre: string;
  ticker: string;
  precio: number | null;
  hoy: number | null;
  mes1: number | null;
  ytd: number | null;
  serie: number[];
}

export interface CierreSector {
  nombre: string;
  etf: string;
  hoy: number | null;
  mes1: number | null;
  ytd: number | null;
}

export interface CierreSimple {
  nombre: string;
  ticker: string;
  valor: number | null;
  variacion: number | null;
}

export interface CierreMover {
  symbol: string;
  price: number | null;
  percentChange: number | null;
}

export interface CierreMercadoData {
  timestamp: string;
  fechaCierre: string; // YYYY-MM-DD última sesión cerrada de EE.UU.
  indices: CierreRow[];
  sectores: CierreSector[];
  ganadores: CierreMover[];
  perdedores: CierreMover[];
  tasas: CierreSimple[];
  rentaFijaGobierno: CierreSimple[];
  rentaFijaCorporativo: CierreSimple[];
  desarrollados: CierreSimple[];
  emergentes: CierreSimple[];
  commodities: CierreRow[];
}

//  Universos de tickers (Yahoo Finance)

interface TickerCfg {
  nombre: string;
  ticker: string;
  symbol: string;
  escala?: number; // para yields de Yahoo (^TNX etc. vienen x10)
}

const INDICES_US: TickerCfg[] = [
  { nombre: "S&P 500", ticker: "SPX", symbol: "^GSPC" },
  { nombre: "Nasdaq 100", ticker: "NDX", symbol: "^NDX" },
  { nombre: "DJIA", ticker: "DJIA", symbol: "^DJI" },
  { nombre: "Russell 2000", ticker: "RUT", symbol: "^RUT" },
  { nombre: "Mid Cap", ticker: "MID", symbol: "^MID" },
  { nombre: "Small Cap", ticker: "SML", symbol: "^SML" },
  { nombre: "Micro Cap", ticker: "IWC", symbol: "IWC" },
];

const SECTORES_SP500: Array<{ nombre: string; etf: string }> = [
  { nombre: "Consumer Discretionary", etf: "XLY" },
  { nombre: "Technology", etf: "XLK" },
  { nombre: "Materials", etf: "XLB" },
  { nombre: "Healthcare", etf: "XLV" },
  { nombre: "Utilities", etf: "XLU" },
  { nombre: "Industrials", etf: "XLI" },
  { nombre: "Communication Services", etf: "XLC" },
  { nombre: "Consumer Staples", etf: "XLP" },
  { nombre: "Financials", etf: "XLF" },
  { nombre: "Energy", etf: "XLE" },
  { nombre: "Real Estate", etf: "XLRE" },
];

const TASAS: TickerCfg[] = [
  { nombre: "DXY", ticker: "DXY", symbol: "DX-Y.NYB" },
  { nombre: "VIX", ticker: "VIX", symbol: "^VIX" },
  { nombre: "U.S Interest Rate", ticker: "FFR", symbol: "^IRX", escala: 0.1 },
  // Yahoo no publica yield index a 3 años; 5Y es el tenor corto disponible
  { nombre: "U.S 5Y Gov Bonds", ticker: "UST5Y", symbol: "^FVX", escala: 0.1 },
  { nombre: "U.S 10Y Gov Bonds", ticker: "UST10Y", symbol: "^TNX", escala: 0.1 },
  { nombre: "U.S 30Y Gov Bonds", ticker: "UST30Y", symbol: "^TYX", escala: 0.1 },
];

const RENTA_FIJA_GOBIERNO: TickerCfg[] = [
  { nombre: "Municipal Bonds", ticker: "MUB", symbol: "MUB" },
  { nombre: "U.S. Treasury", ticker: "GOVT", symbol: "GOVT" },
  { nombre: "TIPS", ticker: "TIP", symbol: "TIP" },
];

const RENTA_FIJA_CORPORATIVO: TickerCfg[] = [
  { nombre: "Convertibles", ticker: "CWB", symbol: "CWB" },
  { nombre: "High Grade", ticker: "LQD", symbol: "LQD" },
  { nombre: "High Yield", ticker: "HYG", symbol: "HYG" },
];

const DESARROLLADOS: TickerCfg[] = [
  { nombre: "Singapur", ticker: "EWS", symbol: "EWS" },
  { nombre: "Japón", ticker: "EWJ", symbol: "EWJ" },
  { nombre: "Canadá", ticker: "EWC", symbol: "EWC" },
  { nombre: "Estados Unidos", ticker: "SPY", symbol: "SPY" },
  { nombre: "Dinamarca", ticker: "EDEN", symbol: "EDEN" },
  { nombre: "Irlanda", ticker: "EIRL", symbol: "EIRL" },
  { nombre: "Israel", ticker: "EIS", symbol: "EIS" },
];

const EMERGENTES: TickerCfg[] = [
  { nombre: "Indonesia", ticker: "EIDO", symbol: "EIDO" },
  { nombre: "China", ticker: "MCHI", symbol: "MCHI" },
  { nombre: "Perú", ticker: "EPU", symbol: "EPU" },
  { nombre: "México", ticker: "EWW", symbol: "EWW" },
  { nombre: "Grecia", ticker: "GREK", symbol: "GREK" },
  { nombre: "Polonia", ticker: "EPOL", symbol: "EPOL" },
  { nombre: "Sudáfrica", ticker: "EZA", symbol: "EZA" },
  { nombre: "Emiratos Árabes", ticker: "UAE", symbol: "UAE" },
];

const COMMODITIES: TickerCfg[] = [
  { nombre: "Oro", ticker: "XAU", symbol: "GC=F" },
  { nombre: "Plata", ticker: "XAG", symbol: "SI=F" },
  { nombre: "Bitcoin", ticker: "BTC", symbol: "BTC-USD" },
  { nombre: "Petróleo WTI", ticker: "WTI", symbol: "CL=F" },
  { nombre: "Petróleo Brent", ticker: "BRENT", symbol: "BZ=F" },
  { nombre: "Gas Natural", ticker: "NGAS", symbol: "NG=F" },
  { nombre: "Soja", ticker: "SOYA", symbol: "ZS=F" },
];

//  Helpers

function pct(base: number, actual: number): number | null {
  if (!base || !isFinite(base) || !isFinite(actual)) return null;
  return ((actual - base) / base) * 100;
}

/** Última sesión cerrada de Wall Street (16:15 ET con buffer), en YYYY-MM-DD. */
function ultimoCierreUS(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date());
  const val = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dow = dowMap[val("weekday")] ?? 1;
  const hh = parseInt(val("hour"), 10) % 24;
  const mm = parseInt(val("minute"), 10);
  const pasoCierre = hh * 60 + mm >= 16 * 60 + 15;

  const fecha = new Date(Date.UTC(+val("year"), +val("month") - 1, +val("day")));
  if (!pasoCierre || dow === 0 || dow === 6) {
    do {
      fecha.setUTCDate(fecha.getUTCDate() - 1);
    } while (fecha.getUTCDay() === 0 || fecha.getUTCDay() === 6);
  }
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${p2(fecha.getUTCMonth() + 1)}-${p2(fecha.getUTCDate())}`;
}

interface Perf {
  precio: number | null;
  hoy: number | null;
  mes1: number | null;
  ytd: number | null;
  serie: number[];
}

function perfDeBars(bars: OHLCVBar[]): Perf {
  if (bars.length < 2) return { precio: null, hoy: null, mes1: null, ytd: null, serie: [] };
  const last = bars[bars.length - 1]!;
  const hoy = pct(bars[bars.length - 2]!.close, last.close);
  const iM1 = Math.max(0, bars.length - 1 - 21); // ~21 ruedas = 1 mes
  const mes1 = pct(bars[iM1]!.close, last.close);

  const anio = last.date.slice(0, 4);
  let base = bars[0]!;
  for (let i = bars.length - 1; i >= 0; i--) {
    if (bars[i]!.date < `${anio}-01-01`) {
      base = bars[i]!;
      break;
    }
  }
  const ytd = pct(base.close, last.close);
  const serie = bars.slice(-BARRAS_SPARKLINE).map((b) => b.close);
  return { precio: last.close, hoy, mes1, ytd, serie };
}

async function fetchPerf(symbol: string): Promise<Perf> {
  try {
    const bars = await yahooChartOHLCV(symbol, "1y", "1d");
    return perfDeBars(bars);
  } catch {
    return { precio: null, hoy: null, mes1: null, ytd: null, serie: [] };
  }
}

async function fetchRow(cfg: TickerCfg): Promise<CierreRow> {
  const perf = await fetchPerf(cfg.symbol);
  return { nombre: cfg.nombre, ticker: cfg.ticker, ...perf };
}

async function fetchSimple(cfg: TickerCfg): Promise<CierreSimple> {
  const perf = await fetchPerf(cfg.symbol);
  const escala = cfg.escala ?? 1;
  return {
    nombre: cfg.nombre,
    ticker: cfg.ticker,
    valor: perf.precio != null ? perf.precio * escala : null,
    variacion: perf.hoy,
  };
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx]!;
      out[idx] = await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const byHoyDesc = (a: { hoy: number | null }, b: { hoy: number | null }) =>
  (b.hoy ?? -Infinity) - (a.hoy ?? -Infinity);

//  Server function principal

export const getCierreMercadoDashboard = createServerFn({ method: "GET" }).handler(
  async (): Promise<CierreMercadoData> => {
    const fechaCierre = ultimoCierreUS();
    const cacheKey = `cierre-mercado-${fechaCierre}`;
    const cached = getCached<CierreMercadoData>(cacheKey, CACHE_TTL);
    if (cached) return cached;

    const [indices, sectoresRows, screeners, tasas, rfGob, rfCorp, dev, eme, commodities] =
      await Promise.all([
        mapLimit(INDICES_US, CONCURRENCIA, fetchRow),
        mapLimit(SECTORES_SP500, CONCURRENCIA, async (s): Promise<CierreSector> => {
          const perf = await fetchPerf(s.etf);
          return { nombre: s.nombre, etf: s.etf, hoy: perf.hoy, mes1: perf.mes1, ytd: perf.ytd };
        }),
        getMarketScreeners().catch(() => null),
        mapLimit(TASAS, CONCURRENCIA, fetchSimple),
        mapLimit(RENTA_FIJA_GOBIERNO, CONCURRENCIA, fetchSimple),
        mapLimit(RENTA_FIJA_CORPORATIVO, CONCURRENCIA, fetchSimple),
        mapLimit(DESARROLLADOS, CONCURRENCIA, fetchSimple),
        mapLimit(EMERGENTES, CONCURRENCIA, fetchSimple),
        mapLimit(COMMODITIES, CONCURRENCIA, fetchRow),
      ]);

    const data: CierreMercadoData = {
      timestamp: new Date().toISOString(),
      fechaCierre,
      indices,
      sectores: sectoresRows.sort(byHoyDesc),
      ganadores: (screeners?.day_gainers ?? []).slice(0, 6).map((g) => ({
        symbol: g.symbol,
        price: g.price,
        percentChange: g.percentChange,
      })),
      perdedores: (screeners?.day_losers ?? []).slice(0, 6).map((l) => ({
        symbol: l.symbol,
        price: l.price,
        percentChange: l.percentChange,
      })),
      tasas,
      rentaFijaGobierno: rfGob,
      rentaFijaCorporativo: rfCorp,
      desarrollados: dev,
      emergentes: eme,
      commodities,
    };

    setCache(cacheKey, data);
    return data;
  },
);
