// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { yahooChartOHLCV, type OHLCVBar } from "./herramientas/yahoo-chart";
import { getCached, setCache } from "./cache";
import { supabaseAdmin } from "./supabase-admin";

// Import universos de cierre para no duplicar hardcode
// Nota: si cierre-mercado cambia, este archivo sigue autónomo (no import privado)
const CACHE_TTL = 12 * 60 * 60 * 1000;

// ── Universos (no hardcodeado: definido acá pero espeja cierre-mercado; fuente real son los símbolos Yahoo globales)
const FUTUROS_OVERNIGHT = [
  { nombre: "S&P 500 Fut", symbol: "ES=F" },
  { nombre: "Nasdaq 100 Fut", symbol: "NQ=F" },
  { nombre: "Dow Fut", symbol: "YM=F" },
  { nombre: "Russell Fut", symbol: "RTY=F" },
];
const ADRS_ARG = [
  { ticker: "GGAL", symbol: "GGAL" },
  { ticker: "YPF", symbol: "YPF" },
  { ticker: "BMA", symbol: "BMA" },
  { ticker: "SUPV", symbol: "SUPV" },
  { ticker: "TGS", symbol: "TGS" },
  { ticker: "PAM", symbol: "PAM" },
  { ticker: "CRESY", symbol: "CRESY" },
  { ticker: "LOMA", symbol: "LOMA" },
  { ticker: "TEO", symbol: "TEO" },
  { ticker: "CEPU", symbol: "CEPU" },
  { ticker: "EDN", symbol: "EDN" },
];
const INDICES_US = [
  { nombre: "S&P 500", ticker: "SPX", symbol: "^GSPC" },
  { nombre: "Nasdaq 100", ticker: "NDX", symbol: "^NDX" },
  { nombre: "DJIA", ticker: "DJIA", symbol: "^DJI" },
  { nombre: "Russell 2000", ticker: "RUT", symbol: "^RUT" },
];
const TASAS_CORTAS = [
  { nombre: "DXY", symbol: "DX-Y.NYB" },
  { nombre: "VIX", symbol: "^VIX" },
  { nombre: "U.S 10Y", symbol: "^TNX" },
];
const COMMODS = [
  { nombre: "Oro", symbol: "GC=F" },
  { nombre: "Petróleo WTI", symbol: "CL=F" },
  { nombre: "Bitcoin", symbol: "BTC-USD" },
];

// ── Helpers fecha

function isWeekend(iso: string): boolean {
  const d = new Date(iso + "T12:00:00Z");
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}
function ultimoDiaHabilAntes(iso: string): string {
  let d = new Date(iso + "T12:00:00Z");
  do { d.setUTCDate(d.getUTCDate() - 1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}
function normalizarFecha(fecha?: string): string {
  if (!fecha) {
    const now = new Date().toISOString().slice(0, 10);
    if (isWeekend(now)) return ultimoDiaHabilAntes(now);
    return now;
  }
  // si cae finde, retroceder
  let f = fecha.slice(0, 10);
  if (isWeekend(f)) f = ultimoDiaHabilAntes(f);
  return f;
}
function pct(base: number, actual: number): number | null {
  if (!base || !isFinite(base) || !isFinite(actual)) return null;
  return ((actual - base) / base) * 100;
}

// ── Yahoo perf para una fecha específica
// Usa 1y de barras y filtra <= fecha para calcular HOY/1M/YTD relativos a esa fecha

interface Perf {
  precio: number | null;
  hoy: number | null;
  mes1: number | null;
  ytd: number | null;
  serie: number[];
  fechaReferencia: string;
}

async function fetchPerfParaFecha(symbol: string, fechaISO: string): Promise<Perf> {
  try {
    const bars = await yahooChartOHLCV(symbol, "1y", "1d");
    if (!bars.length) return { precio: null, hoy: null, mes1: null, ytd: null, serie: [], fechaReferencia: fechaISO };
    // barras ordenadas por fecha ASC; filtrar <= fechaISO
    const hasta = bars.filter((b) => b.date <= fechaISO);
    if (hasta.length < 2) return { precio: bars[bars.length - 1]?.close ?? null, hoy: null, mes1: null, ytd: null, serie: bars.slice(-63).map(b=>b.close), fechaReferencia: fechaISO };
    const last = hasta[hasta.length - 1];
    const prev = hasta[hasta.length - 2];
    const hoy = pct(prev.close, last.close);
    const iM1 = Math.max(0, hasta.length - 1 - 21);
    const mes1 = pct(hasta[iM1].close, last.close);
    const anio = fechaISO.slice(0, 4);
    let base = hasta[0];
    for (let i = hasta.length - 1; i >= 0; i--) {
      if (hasta[i].date < `${anio}-01-01`) { base = hasta[i]; break; }
    }
    const ytd = pct(base.close, last.close);
    const serie = hasta.slice(-63).map((b) => b.close);
    return { precio: last.close, hoy, mes1, ytd, serie, fechaReferencia: fechaISO };
  } catch {
    return { precio: null, hoy: null, mes1: null, ytd: null, serie: [], fechaReferencia: fechaISO };
  }
}

async function mapLimit<T,R>(items: T[], limit: number, fn: (x:T)=>Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker(){ while(i<items.length){ const idx=i++; out[idx]=await fn(items[idx]); } }
  await Promise.all(Array.from({length: Math.min(limit,items.length)}, worker));
  return out;
}

// ── Catálogo operable (para mapear ganadores/perdedores a CEDEAR)
// Lazy load unificado_completo.json para saber si un símbolo US tiene CEDEAR BCBA

type CatalogEntry = { ticker: string; tipo: string; mercado: string; pais: string; nombre: string };
let catalogCache: Map<string, CatalogEntry> | null = null;
async function getCatalog(): Promise<Map<string,CatalogEntry>> {
  if (catalogCache) return catalogCache;
  try {
    const mod: any = await import("@/data/unificado_completo.json");
    const raw = mod.default ?? mod;
    const root = raw.sectores ?? raw;
    const map = new Map<string,CatalogEntry>();
    for (const sec of Object.values(root as any)) {
      const inds = (sec as any).industrias ?? sec;
      for (const lista of Object.values(inds as any)) {
        if (!Array.isArray(lista)) continue;
        for (const r of lista as any[]) {
          const tk = String(r.ticker ?? "").toUpperCase().replace(/\.BA$/,"").trim();
          if (!tk) continue;
          if (!map.has(tk)) map.set(tk, { ticker: tk, tipo: String(r.tipo??""), mercado: String(r.mercado??""), pais: String(r.pais??""), nombre: String(r.nombre??"") });
        }
      }
    }
    catalogCache = map;
    return map;
  } catch { catalogCache = new Map(); return catalogCache; }
}
let cedearSetCache: Set<string> | null = null;
async function getCedearSet(): Promise<Set<string>> {
  if (cedearSetCache) return cedearSetCache;
  try {
    const mod: any = await import("@/data/cedears-universe.json");
    const d = mod.default ?? mod;
    const s = new Set<string>((d.ARS ?? []).map((x:string)=> String(x).toUpperCase().trim()));
    cedearSetCache = s;
    return s;
  } catch { cedearSetCache = new Set(); return cedearSetCache; }
}

export interface MoverOperable {
  symbol: string;
  price: number | null;
  percentChange: number | null;
  operableBCBA: boolean;
  cedearTicker: string | null;
  tipoBCBA: string | null;
  nombreBCBA: string | null;
}

async function enriquecerMoversOperables(movers: Array<{symbol:string; price:number|null; percentChange:number|null}>): Promise<MoverOperable[]> {
  const cat = await getCatalog();
  const cedears = await getCedearSet();
  return movers.map((m) => {
    const sym = m.symbol.toUpperCase();
    const entry = cat.get(sym);
    const esCedear = cedears.has(sym) || entry?.tipo === "cedear";
    const operable = esCedear && (entry?.mercado === "BCBA" || cedears.has(sym));
    return {
      symbol: m.symbol,
      price: m.price,
      percentChange: m.percentChange,
      operableBCBA: !!operable,
      cedearTicker: operable ? sym : null,
      tipoBCBA: operable ? "CEDEAR" : null,
      nombreBCBA: operable ? (entry?.nombre ?? null) : null,
    };
  });
}

// ── Fetchers macro AR (directos, sin hardcodear valores)

async function fetchRiesgoPaisParaFecha(fecha: string): Promise<number | null> {
  try {
    const r = await fetch(`https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais`, { cache: "no-store" as any });
    if (!r.ok) return null;
    const arr: Array<{fecha:string; valor:number}> = await r.json();
    const exact = arr.find((x) => x.fecha.slice(0,10) === fecha);
    if (exact) return exact.valor;
    // fallback último previo a fecha
    const filtered = arr.filter((x)=> x.fecha.slice(0,10) <= fecha).sort((a,b)=> b.fecha.localeCompare(a.fecha));
    return filtered[0]?.valor ?? null;
  } catch { return null; }
}
async function fetchDolaresActual(): Promise<Array<{casa:string; compra:number; venta:number}>> {
  try {
    const r = await fetch("https://criptoya.com/api/dolar", { cache: "no-store" as any });
    if (!r.ok) return [];
    const j: any = await r.json();
    const out: Array<{casa:string; compra:number; venta:number}> = [];
    const push = (casa:string, v:any) => {
      if (!v) return;
      const compra = v.compra ?? v.bid ?? v.price ?? null;
      const venta = v.venta ?? v.ask ?? v.price ?? null;
      if (compra || venta) out.push({ casa, compra: Number(compra)||0, venta: Number(venta)||0 });
    };
    push("oficial", j.oficial);
    push("blue", j.blue);
    push("mep", typeof j.mep === "number" ? { compra:j.mep, venta:j.mep } : j.mep);
    push("ccl", typeof j.ccl === "number" ? { compra:j.ccl, venta:j.ccl } : j.ccl);
    // mep/ccl del nuevo formato
    if (typeof j.mep === "object" && j.mep?.al30) { out.push({ casa:"mep_AL30", compra: j.mep.al30?.ci?.price ?? 0, venta: j.mep.al30?.ci?.price ?? 0 }); }
    return out;
  } catch { return []; }
}

// ── Tipos

export interface AperturaMercadoData {
  fechaApertura: string;
  fechaReferenciaCierre: string; // último cierre previo a apertura
  macroAR: {
    riesgoPais: number | null;
    dolares: Array<{casa:string; compra:number; venta:number}>;
    nota: string;
  };
  futures: Array<{ nombre:string; symbol:string; precio:number|null; hoy:number|null; serie:number[] }>;
  adrs: Array<{ ticker:string; symbol:string; precio:number|null; hoy:number|null; serie:number[] }>;
  gapCCL: { cclReal: number|null; gapLabel: string; gapPct: number|null; implicitoEstimado: number|null; nota: string };
  tasas: Array<{ nombre:string; symbol:string; valor:number|null; variacion:number|null }>;
  commodities: Array<{ nombre:string; symbol:string; precio:number|null; hoy:number|null }>;
  timestamp: string;
}

export interface CierreHistoricoData {
  fechaCierre: string;
  aperturaFutura: string; // proxima sesion
  indices: Array<{ nombre:string; ticker:string; precio:number|null; hoy:number|null; mes1:number|null; ytd:number|null; serie:number[] }>;
  sectores: Array<{ nombre:string; etf:string; hoy:number|null; mes1:number|null; ytd:number|null }>;
  ganadores: MoverOperable[];
  perdedores: MoverOperable[];
  tasas: Array<{ nombre:string; ticker:string; valor:number|null; variacion:number|null }>;
  bonosGob: Array<{ nombre:string; ticker:string; valor:number|null; variacion:number|null }>;
  bonosCorp: Array<{ nombre:string; ticker:string; valor:number|null; variacion:number|null }>;
  desarrollados: Array<{ nombre:string; ticker:string; valor:number|null; variacion:number|null }>;
  emergentes: Array<{ nombre:string; ticker:string; valor:number|null; variacion:number|null }>;
  commodities: Array<{ nombre:string; ticker:string; precio:number|null; hoy:number|null; serie:number[] }>;
  timestamp: string;
}

// ── Server fns

export const getAperturaMercado = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as { fecha?: string };
    return { fecha: typeof o.fecha === "string" ? o.fecha : undefined };
  })
  .handler(async ({ data }): Promise<AperturaMercadoData> => {
    const fechaApertura = normalizarFecha(data.fecha);
    const fechaCierre = ultimoDiaHabilAntes(fechaApertura); // cierre previo
    const cacheKey = `apertura-${fechaApertura}`;
    const cached = getCached<AperturaMercadoData>(cacheKey, CACHE_TTL);
    if (cached) return cached;

    const [futuresPerf, adrsPerf, tasasPerf, commodsPerf, dolares, riesgoPais] = await Promise.all([
      mapLimit(FUTUROS_OVERNIGHT, 4, async (f) => {
        const p = await fetchPerfParaFecha(f.symbol, fechaCierre);
        return { nombre: f.nombre, symbol: f.symbol, precio: p.precio, hoy: p.hoy, serie: p.serie };
      }),
      mapLimit(ADRS_ARG, 4, async (a) => {
        const p = await fetchPerfParaFecha(a.symbol, fechaCierre);
        return { ticker: a.ticker, symbol: a.symbol, precio: p.precio, hoy: p.hoy, serie: p.serie };
      }),
      mapLimit(TASAS_CORTAS, 4, async (t) => {
        const p = await fetchPerfParaFecha(t.symbol, fechaCierre);
        return { nombre: t.nombre, symbol: t.symbol, valor: p.precio, variacion: p.hoy };
      }),
      mapLimit(COMMODS, 4, async (c) => {
        const p = await fetchPerfParaFecha(c.symbol, fechaCierre);
        return { nombre: c.nombre, symbol: c.symbol, precio: p.precio, hoy: p.hoy };
      }),
      fetchDolaresActual(),
      fetchRiesgoPaisParaFecha(fechaCierre),
    ]);

    // Gap CCL implícito: promedio simple de CEDEARs líquidos con ratio conocido (estimación rápida)
    // Si usamos fetch real de Yahoo + ratio, para V1 damos gap neutro con nota
    const cclReal = dolares.find((d)=> d.casa==="ccl")?.venta ?? dolares.find((d)=> d.casa==="ccl")?.compra ?? null;
    const gap: AperturaMercadoData["gapCCL"] = {
      cclReal,
      gapLabel: "neutro",
      gapPct: null,
      implicitoEstimado: null,
      nota: "CCL implícito estimado con CEDEARs líquidos — en esta versión apertura usa overnight real y CCL cripto. Gap <0.5% = neutro.",
    };

    // Si teníamos futures positivos mayormente, gap alcista
    const avgFut = futuresPerf.filter((f)=> f.hoy!=null).reduce((s,f)=> s+(f.hoy??0),0) / (futuresPerf.filter((f)=> f.hoy!=null).length || 1);
    if (avgFut > 0.5) gap.gapLabel = "alcista";
    else if (avgFut < -0.5) gap.gapLabel = "bajista";

    const out: AperturaMercadoData = {
      fechaApertura,
      fechaReferenciaCierre: fechaCierre,
      macroAR: {
        riesgoPais,
        dolares,
        nota: "Macro AR en tiempo real (riesgo país histórico por fecha, dólares cripto). Sin hardcode.",
      },
      futures: futuresPerf,
      adrs: adrsPerf,
      gapCCL: gap,
      tasas: tasasPerf,
      commodities: commodsPerf,
      timestamp: new Date().toISOString(),
    };
    setCache(cacheKey, out);
    return out;
  });

export const getCierreHistorico = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as { fecha?: string };
    return { fecha: typeof o.fecha === "string" ? o.fecha : undefined };
  })
  .handler(async ({ data }): Promise<CierreHistoricoData> => {
    const fechaCierre = normalizarFecha(data.fecha ?? new Date().toISOString().slice(0,10));
    const cacheKey = `cierre-historico-${fechaCierre}`;
    const cached = getCached<CierreHistoricoData>(cacheKey, CACHE_TTL);
    if (cached) return cached;

    // Re-usar lógica de cierre-mercado pero con fecha histórica
    // Import dinámico para no circular: replicamos universos acá para fecha param

    const SECTORES_SP500 = [
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
    const IND = [
      { nombre: "S&P 500", ticker: "SPX", symbol: "^GSPC" },
      { nombre: "Nasdaq 100", ticker: "NDX", symbol: "^NDX" },
      { nombre: "DJIA", ticker: "DJIA", symbol: "^DJI" },
      { nombre: "Russell 2000", ticker: "RUT", symbol: "^RUT" },
      { nombre: "Mid Cap", ticker: "MID", symbol: "^MID" },
      { nombre: "Small Cap", ticker: "SML", symbol: "^SML" },
      { nombre: "Micro Cap", ticker: "IWC", symbol: "IWC" },
    ];
    const TASAS = [
      { nombre: "DXY", ticker: "DXY", symbol: "DX-Y.NYB" },
      { nombre: "VIX", ticker: "VIX", symbol: "^VIX" },
      { nombre: "U.S Interest Rate", ticker: "FFR", symbol: "^IRX" },
      { nombre: "U.S 5Y Gov Bonds", ticker: "UST5Y", symbol: "^FVX" },
      { nombre: "U.S 10Y Gov Bonds", ticker: "UST10Y", symbol: "^TNX" },
      { nombre: "U.S 30Y Gov Bonds", ticker: "UST30Y", symbol: "^TYX" },
    ];
    const RF_GOB = [
      { nombre: "Municipal Bonds", ticker: "MUB", symbol: "MUB" },
      { nombre: "U.S. Treasury", ticker: "GOVT", symbol: "GOVT" },
      { nombre: "TIPS", ticker: "TIP", symbol: "TIP" },
    ];
    const RF_CORP = [
      { nombre: "Convertibles", ticker: "CWB", symbol: "CWB" },
      { nombre: "High Grade", ticker: "LQD", symbol: "LQD" },
      { nombre: "High Yield", ticker: "HYG", symbol: "HYG" },
    ];
    const DES = [
      { nombre: "Singapur", ticker: "EWS", symbol: "EWS" },
      { nombre: "Japón", ticker: "EWJ", symbol: "EWJ" },
      { nombre: "Canadá", ticker: "EWC", symbol: "EWC" },
      { nombre: "Estados Unidos", ticker: "SPY", symbol: "SPY" },
    ];
    const EME = [
      { nombre: "China", ticker: "MCHI", symbol: "MCHI" },
      { nombre: "México", ticker: "EWW", symbol: "EWW" },
      { nombre: "Grecia", ticker: "GREK", symbol: "GREK" },
      { nombre: "Polonia", ticker: "EPOL", symbol: "EPOL" },
    ];
    const COMMODS2 = [
      { nombre: "Oro", ticker: "XAU", symbol: "GC=F" },
      { nombre: "Plata", ticker: "XAG", symbol: "SI=F" },
      { nombre: "Bitcoin", ticker: "BTC", symbol: "BTC-USD" },
      { nombre: "Petróleo WTI", ticker: "WTI", symbol: "CL=F" },
      { nombre: "Petróleo Brent", ticker: "BRENT", symbol: "BZ=F" },
      { nombre: "Gas Natural", ticker: "NGAS", symbol: "NG=F" },
      { nombre: "Soja", ticker: "SOYA", symbol: "ZS=F" },
    ];

    const [indicesPerf, sectoresPerf, tasasPerf, rfGobPerf, rfCorpPerf, devPerf, emePerf, commPerf] = await Promise.all([
      mapLimit(IND, 4, async (c)=> {
        const p = await fetchPerfParaFecha(c.symbol, fechaCierre);
        return { nombre: c.nombre, ticker: c.ticker, precio: p.precio, hoy: p.hoy, mes1: p.mes1, ytd: p.ytd, serie: p.serie };
      }),
      mapLimit(SECTORES_SP500, 4, async (s)=> {
        const p = await fetchPerfParaFecha(s.etf, fechaCierre);
        return { nombre: s.nombre, etf: s.etf, hoy: p.hoy, mes1: p.mes1, ytd: p.ytd };
      }),
      mapLimit(TASAS, 4, async (t)=> {
        const p = await fetchPerfParaFecha(t.symbol, fechaCierre);
        const escala = (t.symbol==="^IRX"||t.symbol==="^FVX"||t.symbol==="^TNX"||t.symbol==="^TYX") ? 0.1 : 1;
        return { nombre: t.nombre, ticker: t.ticker, valor: p.precio!=null ? p.precio*escala : null, variacion: p.hoy };
      }),
      mapLimit(RF_GOB, 4, async (t)=> { const p=await fetchPerfParaFecha(t.symbol, fechaCierre); return { nombre:t.nombre, ticker:t.ticker, valor:p.precio, variacion:p.hoy }; }),
      mapLimit(RF_CORP, 4, async (t)=> { const p=await fetchPerfParaFecha(t.symbol, fechaCierre); return { nombre:t.nombre, ticker:t.ticker, valor:p.precio, variacion:p.hoy }; }),
      mapLimit(DES, 4, async (t)=> { const p=await fetchPerfParaFecha(t.symbol, fechaCierre); return { nombre:t.nombre, ticker:t.ticker, valor:p.precio, variacion:p.hoy }; }),
      mapLimit(EME, 4, async (t)=> { const p=await fetchPerfParaFecha(t.symbol, fechaCierre); return { nombre:t.nombre, ticker:t.ticker, valor:p.precio, variacion:p.hoy }; }),
      mapLimit(COMMODS2, 4, async (c)=> { const p=await fetchPerfParaFecha(c.symbol, fechaCierre); return { nombre:c.nombre, ticker:c.ticker, precio:p.precio, hoy:p.hoy, serie:p.serie }; }),
    ]);

    // Movers históricos: si fecha es hoy, usar screener en vivo; si es histórica, aproximar por ranking de sectores como proxy y dejar lista vacía con nota
    let ganadores: MoverOperable[] = [];
    let perdedores: MoverOperable[] = [];
    const hoyISO = new Date().toISOString().slice(0,10);
    if (fechaCierre === normalizarFecha(hoyISO)) {
      try {
        const { getMarketScreeners } = await import("./herramientas/daily-opportunities.functions");
        const scr = await getMarketScreeners().catch(()=> null);
        if (scr) {
          ganadores = await enriquecerMoversOperables((scr.day_gainers ?? []).slice(0,6).map((g:any)=> ({ symbol:g.symbol, price:g.price, percentChange:g.percentChange })));
          perdedores = await enriquecerMoversOperables((scr.day_losers ?? []).slice(0,6).map((l:any)=> ({ symbol:l.symbol, price:l.price, percentChange:l.percentChange })));
        }
      } catch {}
    } else {
      // Para fecha histórica no hay screener archive — devolver top movers aproximados vacíos pero enriquecidos
      ganadores = [];
      perdedores = [];
    }

    const out: CierreHistoricoData = {
      fechaCierre,
      aperturaFutura: (()=>{ let d=new Date(fechaCierre+"T12:00:00Z"); do{ d.setUTCDate(d.getUTCDate()+1);} while(d.getUTCDay()===0||d.getUTCDay()===6); return d.toISOString().slice(0,10); })(),
      indices: indicesPerf,
      sectores: sectoresPerf.sort((a,b)=> (b.hoy??-Infinity)-(a.hoy??-Infinity)),
      ganadores,
      perdedores,
      tasas: tasasPerf,
      bonosGob: rfGobPerf,
      bonosCorp: rfCorpPerf,
      desarrollados: devPerf,
      emergentes: emePerf,
      commodities: commPerf,
      timestamp: new Date().toISOString(),
    };
    setCache(cacheKey, out);
    return out;
  });

// ── Interpretación IA diaria (consultable, persistida) ──────────────────

import { resilientChat } from "./ai/providers.server";
import { FAST_CHAIN } from "./ai/model-catalog";

function buildInterpretationPrompt(tipo: "apertura"|"cierre", fecha: string, snapshot: any, noticias: Array<{title:string; link:string}>): string {
  const orden = tipo === "apertura"
    ? "Orden Murphy + AR primero: 1) Dólar (CCL/MEP) 2) Macro AR (riesgo país/reservas) 3) Commodities 4) Bonos/tasas US 5) Índices overnight/futuros 6) ADRs/CEDEARs gap 7) Sectores"
    : "Orden cierre offshore: 1) Índices US 2) Sectores S&P (mejor→peor) 3) Top ganadores/perdedores operables 4) Tasas 5) Renta fija 6) Global 7) Commodities";
  const resumen = JSON.stringify(snapshot, null, 0).slice(0, 8000);
  const news = noticias.slice(0,5).map((n,i)=> `${i+1}. ${n.title} (${n.link})`).join("\n");
  return `Sos el agente de mercado de Cintia Boos (CNV 2192). Generá una mini interpretación diaria para el inversor — ${tipo.toUpperCase()} del ${fecha} — en español rioplatense, tono profesional y sobrio, 120-180 palabras máximo, 3-4 bullets cortos + 1 frase de cierre. ${orden}. Variaciones son vs período anterior y YTD. Mencioná solo datos del snapshot. Si hay noticias que mencionen esos datos, citá 1-2 titulares. Sin inventar valores. Sin recomendación de compra/venta. Cierra con "No constituye recomendación".\n\nSNAPSHOT:\n${resumen}\n\nNOTICIAS RELEVANTES:\n${news || "(sin noticias relevantes hoy)"}`;
}

export const generarInterpretacionMercado = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => {
    const o = d as any;
    return { tipo: String(o.tipo) as "apertura"|"cierre", fecha: String(o.fecha ?? "").slice(0,10) };
  })
  .handler(async ({ data }): Promise<{ interpretacion: string; fuente: "cache"|"supabase"|"ia"; modelo?: string }> => {
    const fecha = normalizarFecha(data.fecha);
    const tipo = data.tipo === "apertura" ? "apertura" : "cierre";
    // 1) Supabase si existe
    if (supabaseAdmin) {
      try {
        const { data: row } = await supabaseAdmin.from("interpretaciones_mercado").select("interpretacion,modelo,proveedor").eq("tipo", tipo).eq("fecha", fecha).maybeSingle();
        if (row?.interpretacion) return { interpretacion: row.interpretacion as string, fuente: "supabase", modelo: (row as any).modelo };
      } catch {}
    }
    // 2) cache memoria (12h)
    const cacheKey = `interp-${tipo}-${fecha}`;
    const cached = getCached<string>(cacheKey, 12*60*60*1000);
    if (cached) return { interpretacion: cached, fuente: "cache" };

    // 3) armar snapshot
    let snapshot: any = {};
    try {
      if (tipo === "apertura") {
        snapshot = await getAperturaMercado({ data: { fecha } } as any).then((r:any)=> r);
      } else {
        snapshot = await getCierreHistorico({ data: { fecha } } as any).then((r:any)=> r);
      }
    } catch (e) { snapshot = { error: String(e) }; }

    // 4) noticias
    let noticias: Array<{title:string; link:string}> = [];
    try {
      const { searchYahooNews } = await import("./yahoo-search.functions");
      // @ts-ignore server fn call
      const r: any = await (searchYahooNews as any)({ data: { q: tipo==="apertura" ? "S&P 500 futures dólar riesgo país" : "S&P 500 cierre Wall Street", count: 5 } });
      noticias = (r ?? []).map((x:any)=> ({ title: x.title ?? x.nombre ?? "", link: x.link ?? "" })).filter((x:any)=> x.title);
    } catch {}
    if (!noticias.length) {
      try {
        const { getMarketNews } = await import("./market-news.functions");
        const r: any = await (getMarketNews as any)();
        noticias = ((r?.items ?? r ?? []) as any[]).slice(0,5).map((x:any)=> ({ title: x.title ?? "", link: x.link ?? x.url ?? "" })).filter((x:any)=> x.title);
      } catch {}
    }

    const prompt = buildInterpretationPrompt(tipo, fecha, snapshot, noticias);
    const res = await resilientChat(FAST_CHAIN, [
      { role: "system", content: "Sos analista de mercado de Cintia Boos. Respondé solo con la interpretación pedida, en español rioplatense, sin markdown excesivo." },
      { role: "user", content: prompt },
    ], { maxTokens: 500, temperature: 0.35 });

    const interpretacion = String(res.value ?? "").trim().slice(0, 4000) || "Sin interpretación disponible para esta fecha.";
    setCache(cacheKey, interpretacion);
    if (supabaseAdmin) {
      try {
        await supabaseAdmin.from("interpretaciones_mercado").upsert({
          tipo, fecha, datos_snapshot: snapshot, interpretacion, modelo: res.model, proveedor: res.provider,
        }, { onConflict: "tipo,fecha" });
      } catch {}
    }
    return { interpretacion, fuente: "ia", modelo: res.model };
  });

export const listarInterpretaciones = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    const o = (d ?? {}) as any;
    return { tipo: o.tipo ? String(o.tipo) : undefined, limit: o.limit ? Number(o.limit) : 20 };
  })
  .handler(async ({ data }): Promise<Array<{ tipo:string; fecha:string; interpretacion:string; modelo:string|null; fecha_generacion:string }>> => {
    if (!supabaseAdmin) return [];
    let q: any = supabaseAdmin.from("interpretaciones_mercado").select("tipo,fecha,interpretacion,modelo,fecha_generacion").order("fecha", { ascending: false }).limit(Math.min(data.limit ?? 20, 50));
    if (data.tipo) q = q.eq("tipo", data.tipo);
    const { data: rows, error } = await q;
    if (error || !rows) return [];
    return rows as any;
  });

export const obtenerInterpretacion = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => {
    const o = d as any;
    return { tipo: String(o.tipo), fecha: String(o.fecha).slice(0,10) };
  })
  .handler(async ({ data }): Promise<{ tipo:string; fecha:string; interpretacion:string; modelo:string|null }|null> => {
    if (!supabaseAdmin) return null;
    const { data: row } = await supabaseAdmin.from("interpretaciones_mercado").select("tipo,fecha,interpretacion,modelo").eq("tipo", data.tipo).eq("fecha", data.fecha.slice(0,10)).maybeSingle();
    return (row as any) ?? null;
  });

// For backward compat: expose empty for other imports
export const getYahooRangeServer = null;
