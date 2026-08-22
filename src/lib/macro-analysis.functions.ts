import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "./cache";
import { yahooChartCloses, yahooChartOHLCV } from "./yahoo-chart";

export interface MacroGlobalData {
  dxy: number | null;
  ust10y: number | null;
  irx3m: number | null;  // PASO 14 — T-Bill 13-week yield (^IRX)
  sp500: number | null;
  sp500Var: number | null;
  nasdaq: number | null;
  nasdaqVar: number | null;
  fedRate: number | null;
  fedRateDate: string | null;
}

export interface MacroArgentinaData {
  reservas: number | null;
  baseMonetaria: number | null;
  tipoCambioOficial: number | null;
  tipoCambioMEP: number | null;
  tipoCambioCCL: number | null;
  brechaCambiaria: number | null;
  riesgoPais: number | null;
  inflacionMensual: number | null;
  inflacionInteranual: number | null;
  tasaPoliticaMonetaria: number | null;
}

export interface MicroMervalData {
  topGainers: Array<{ ticker: string; variacion: number; precio: number }>;
  topLosers: Array<{ ticker: string; variacion: number; precio: number }>;
  mervalIndex: number | null;
  mervalVar: number | null;
}

export interface MacroAnalysisResult {
  global: MacroGlobalData;
  argentina: MacroArgentinaData;
  micro: MicroMervalData;
  timestamp: string;
}

const MERVAL_PANEL = [
  "GGAL.BA",
  "YPFD.BA",
  "PAMP.BA",
  "BMA.BA",
  "TXAR.BA",
  "ALUA.BA",
  "CRES.BA",
  "SUPV.BA",
  "COME.BA",
  "TGSU2.BA",
  "BBAR.BA",
  "CEPU.BA",
  "LOMA.BA",
  "MIRG.BA",
  "TECO2.BA",
  "VALO.BA",
];

async function yahooCurrentPrice(
  symbol: string,
): Promise<{ precio: number; variacionPct: number } | null> {
  try {
    const bars = await yahooChartOHLCV(symbol, "5d", "1d");
    if (bars.length < 2) return null;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const variacionPct = prev.close > 0 ? ((last.close - prev.close) / prev.close) * 100 : 0;
    return { precio: last.close, variacionPct };
  } catch {
    return null;
  }
}

async function fetchBCRAVariable(id: number): Promise<number | null> {
  try {
    const headers: Record<string, string> = {};
    const token = process.env.BCRA_API_TOKEN;
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(
      `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${id}?Limit=1`,
      { signal: AbortSignal.timeout(5000), headers },
    );
    if (!res.ok) return null;
    const json = await res.json();
    const results: any[] = json?.results ?? json ?? [];
    if (!Array.isArray(results) || results.length === 0) return null;
    const detalle: any[] = results[0]?.detalle ?? [];
    return Array.isArray(detalle) && detalle.length > 0 ? (detalle[0]?.valor ?? null) : null;
  } catch {
    return null;
  }
}

async function fetchArgentinaDatos<T>(endpoint: string): Promise<T | null> {
  try {
    const res = await fetch(`https://api.argentinadatos.com/v1/${endpoint}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const getMacroMicroAnalysis = createServerFn({ method: "GET" }).handler(
  async (): Promise<MacroAnalysisResult> => {
    const CACHE_KEY = "macro-analysis";
    const cached = getCached<MacroAnalysisResult>(CACHE_KEY, 10 * 60 * 1000);
    if (cached) return cached;

    // Global — Yahoo direct
    const [dxyData, tnxData, spyData, qqqData, irxData] = await Promise.allSettled([
      yahooCurrentPrice("DX-Y.NYB"),
      yahooCurrentPrice("^TNX"),
      yahooCurrentPrice("SPY"),
      yahooCurrentPrice("QQQ"),
      yahooCurrentPrice("^IRX"),
    ]);

    const dxy = dxyData.status === "fulfilled" ? (dxyData.value?.precio ?? null) : null;
    const ust10y = tnxData.status === "fulfilled" ? (tnxData.value?.precio ?? null) : null;
    const irx3m = irxData.status === "fulfilled" ? (irxData.value?.precio ?? null) : null;
    const sp500 = spyData.status === "fulfilled" ? (spyData.value?.precio ?? null) : null;
    const sp500Var = spyData.status === "fulfilled" ? (spyData.value?.variacionPct ?? null) : null;
    const nasdaq = qqqData.status === "fulfilled" ? (qqqData.value?.precio ?? null) : null;
    const nasdaqVar = qqqData.status === "fulfilled" ? (qqqData.value?.variacionPct ?? null) : null;

    // Fed rate — via Treasury API
    let fedRate: number | null = null;
    let fedRateDate: string | null = null;
    try {
      const fedRes = await fetch(
        "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?filter=record_date:gte:2026-01-01&sort=-record_date&page[size]=1",
        { signal: AbortSignal.timeout(5000) },
      );
      if (fedRes.ok) {
        const fj = await fedRes.json();
        const d = fj?.data?.[0];
        if (d) {
          fedRate = parseFloat(d.avg_interest_rate_amt) ?? null;
          fedRateDate = d.record_date ?? null;
        }
      }
    } catch {
      // keep null
    }

    // Argentina — BCRA + ArgentinaDatos
    const [reservas, baseMonetaria, tasaPM, riesgoPaisData, inflacionData, tcOficialData] =
      await Promise.allSettled([
        fetchBCRAVariable(1),
        fetchBCRAVariable(7),
        fetchBCRAVariable(6),
        fetchArgentinaDatos<{ valor: number }>("finanzas/indices/riesgo-pais/ultimo"),
        fetchArgentinaDatos<Array<{ valor: number; fecha: string }>>("finanzas/indices/inflacion"),
        fetchArgentinaDatos<{ compra: number; venta: number }>(
          "finanzas/tipos-cambio/oficial/ultimo",
        ),
      ]);

    const reservasVal = reservas.status === "fulfilled" ? reservas.value : null;
    const baseMonetariaVal = baseMonetaria.status === "fulfilled" ? baseMonetaria.value : null;
    const tasaPMVal = tasaPM.status === "fulfilled" ? tasaPM.value : null;
    const riesgoPais =
      riesgoPaisData.status === "fulfilled" ? (riesgoPaisData.value?.valor ?? null) : null;

    let inflacionMensual: number | null = null;
    let inflacionInteranual: number | null = null;
    if (
      inflacionData.status === "fulfilled" &&
      Array.isArray(inflacionData.value) &&
      inflacionData.value.length > 0
    ) {
      const sorted = inflacionData.value.sort(
        (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );
      inflacionMensual = sorted[0]?.valor ?? null;
      if (sorted.length >= 12) {
        inflacionInteranual = sorted.slice(0, 12).reduce((s, m) => s + (m.valor ?? 0), 0);
      }
    }

    let tcOficial: number | null = null;
    if (tcOficialData.status === "fulfilled" && tcOficialData.value) {
      tcOficial = tcOficialData.value.venta ?? tcOficialData.value.compra ?? null;
    }

    // MEP y CCL
    const [mepData, cclData] = await Promise.allSettled([
      fetchArgentinaDatos<{ compra: number; venta: number }>("finanzas/tipos-cambio/mep/ultimo"),
      fetchArgentinaDatos<{ compra: number; venta: number }>("finanzas/tipos-cambio/ccl/ultimo"),
    ]);

    const tcMEP =
      mepData.status === "fulfilled"
        ? (mepData.value?.venta ?? mepData.value?.compra ?? null)
        : null;
    const tcCCL =
      cclData.status === "fulfilled"
        ? (cclData.value?.venta ?? cclData.value?.compra ?? null)
        : null;

    let brechaCambiaria: number | null = null;
    if (tcOficial && tcOficial > 0 && tcCCL && tcCCL > 0) {
      brechaCambiaria = ((tcCCL - tcOficial) / tcOficial) * 100;
      brechaCambiaria = Math.round(brechaCambiaria * 100) / 100;
    }

    // Micro — Merval panel via Yahoo direct
    const mervalResults = await Promise.allSettled(MERVAL_PANEL.map((t) => yahooCurrentPrice(t)));

    const mervalQuotes: Array<{ ticker: string; precio: number; variacion: number }> = [];
    for (let i = 0; i < MERVAL_PANEL.length; i++) {
      const r = mervalResults[i];
      if (r.status === "fulfilled" && r.value) {
        mervalQuotes.push({
          ticker: MERVAL_PANEL[i],
          precio: r.value.precio,
          variacion: r.value.variacionPct,
        });
      }
    }

    mervalQuotes.sort((a, b) => b.variacion - a.variacion);
    const topGainers = mervalQuotes.slice(0, 5).map((q) => ({
      ticker: q.ticker,
      variacion: q.variacion,
      precio: q.precio,
    }));
    const topLosers = mervalQuotes
      .slice(-5)
      .reverse()
      .map((q) => ({ ticker: q.ticker, variacion: q.variacion, precio: q.precio }));

    // Merval index
    let mervalIndex: number | null = null;
    let mervalVar: number | null = null;
    const mervalQuote = await yahooCurrentPrice("^MERV");
    if (mervalQuote) {
      mervalIndex = mervalQuote.precio;
      mervalVar = mervalQuote.variacionPct;
    }

    const result: MacroAnalysisResult = {
      global: {
        dxy,
        ust10y,
        irx3m,
        sp500,
        sp500Var,
        nasdaq,
        nasdaqVar,
        fedRate,
        fedRateDate,
      },
      argentina: {
        reservas: reservasVal,
        baseMonetaria: baseMonetariaVal,
        tipoCambioOficial: tcOficial,
        tipoCambioMEP: tcMEP,
        tipoCambioCCL: tcCCL,
        brechaCambiaria,
        riesgoPais,
        inflacionMensual,
        inflacionInteranual,
        tasaPoliticaMonetaria: tasaPMVal,
      },
      micro: { topGainers, topLosers, mervalIndex, mervalVar },
      timestamp: new Date().toISOString(),
    };

    setCache(CACHE_KEY, result);
    return result;
  },
);

// ─── Datos auxiliares para Panorama (PASO 11/14) — server-side, evita CORS ───

export interface PanoramaAuxData {
  irx3m: number | null;
  dbcCloses: { date: string; close: number }[];
  tltCloses: { date: string; close: number }[];
}

export const getPanoramaAuxData = createServerFn({ method: "GET" }).handler(
  async (): Promise<PanoramaAuxData> => {
    const CACHE_KEY = "panorama-aux";
    const cached = getCached<PanoramaAuxData>(CACHE_KEY, 10 * 60 * 1000);
    if (cached) return cached;

    const [irxData, dbcData, tltData] = await Promise.allSettled([
      yahooChartCloses("^IRX", "6mo"),
      yahooChartCloses("DBC", "6mo"),
      yahooChartCloses("TLT", "6mo"),
    ]);

    const result: PanoramaAuxData = {
      irx3m: irxData.status === "fulfilled" && irxData.value.length > 0
        ? irxData.value[irxData.value.length - 1].close
        : null,
      dbcCloses: dbcData.status === "fulfilled" ? dbcData.value : [],
      tltCloses: tltData.status === "fulfilled" ? tltData.value : [],
    };

    setCache(CACHE_KEY, result);
    return result;
  },
);
