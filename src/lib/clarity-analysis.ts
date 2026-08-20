/**
 * Motor de análisis portado de la app "clarity-dashboard" (server.py).
 *
 * Ejecuta las capas de análisis de decisión con datos REALES en vivo
 * (Yahoo Finance + BCRA + ArgentinaDatos + CriptoYa) replicando la lógica
 * y las fórmulas del backend Flask original de Clarity:
 *   - Cualitativo (6 dimensiones, score ponderado, gate >= 5.0)
 *   - Cuantitativo (15 métricas M1..M15 + alertas)
 *   - WACC (CAPM + riesgo país + tamaño)
 *   - DCF por proyección de márgenes (FCFF 5 años + valor terminal)
 *   - Múltiplos (EV/EBITDA, P/E, P/BV, EV/Revenue + mediana sectorial)
 *   - Valor libro ajustado + APV
 *   - Triangulación de los 3 métodos
 *   - Ficha de decisión completa (macro + cuali + cuanti + wacc + valuación)
 *   - Contexto macro, ciclo económico intermarket y análisis sectorial.
 *
 * Es un análisis educativo: NO es recomendación de inversión.
 */

import { fetchYahooChart, fetchYahooQuoteSummaryJson } from "./yahoo-http";
import type { QuoteSummaryResult, FinancialStatementRow } from "./yahoo-types";
import { ultimoCierre } from "./stats";

const MODULOS_CLARITY = [
  "assetProfile",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
  "price",
  "incomeStatementHistory",
  "balanceSheetHistory",
  "cashflowStatementHistory",
  "institutionOwnership",
];

const DECIMALS = 4;
const SECTOR_ETF_MAP: Record<string, string> = {
  Technology: "XLK",
  Healthcare: "XLV",
  "Financial Services": "XLF",
  Energy: "XLE",
  "Consumer Defensive": "XLP",
  "Consumer Cyclical": "XLY",
  Industrials: "XLI",
  "Basic Materials": "XLB",
  Utilities: "XLU",
  "Communication Services": "XLC",
  "Real Estate": "XLRE",
};

const SECTOR_MULTIPLOS_DEFAULT = { ev_ebitda: 12, pe: 18, pbv: 2, ev_revenue: 2.5 };

const SECTOR_MULTIPLOS: Record<string, { ev_ebitda: number; pe: number; pbv: number; ev_revenue: number }> = {
  technology: { ev_ebitda: 18, pe: 25, pbv: 6, ev_revenue: 4 },
  healthcare: { ev_ebitda: 16, pe: 22, pbv: 4, ev_revenue: 3 },
  "financial services": { ev_ebitda: 12, pe: 15, pbv: 1.5, ev_revenue: 3 },
  "consumer defensive": { ev_ebitda: 14, pe: 20, pbv: 3, ev_revenue: 2 },
  "consumer cyclical": { ev_ebitda: 10, pe: 18, pbv: 2.5, ev_revenue: 1.5 },
  energy: { ev_ebitda: 6, pe: 12, pbv: 1.5, ev_revenue: 1.5 },
  "basic materials": { ev_ebitda: 8, pe: 14, pbv: 1.8, ev_revenue: 1.5 },
  industrials: { ev_ebitda: 12, pe: 18, pbv: 3, ev_revenue: 1.8 },
  utilities: { ev_ebitda: 10, pe: 16, pbv: 1.5, ev_revenue: 2.5 },
  "real estate": { ev_ebitda: 18, pe: 20, pbv: 1.2, ev_revenue: 6 },
  "communication services": { ev_ebitda: 12, pe: 18, pbv: 2.5, ev_revenue: 3 },
};

const SECTOR_TICKERS_FALLBACK: Record<string, string[]> = {
  XLK: ["AAPL", "MSFT", "NVDA", "AVGO", "CRM", "ADBE", "CSCO", "ACN", "INTC", "AMD", "IBM", "NOW", "QCOM", "TXN", "AMAT", "ADI", "MU", "FIS", "ADP"],
  XLV: ["UNH", "JNJ", "PFE", "ABBV", "MRK", "TMO", "ABT", "BMY", "DHR", "LLY", "AMGN", "MDT", "SYK", "BSX", "ISRG", "GILD", "REGN", "VRTX", "HUM", "CI"],
  XLF: ["JPM", "BAC", "WFC", "C", "GS", "MS", "AXP", "V", "MA", "BLK", "SCHW", "SPGI", "CB", "MMC", "BK", "PNC", "USB", "COF", "TROW", "MET"],
  XLE: ["XOM", "CVX", "COP", "EOG", "SLB", "OXY", "MPC", "VLO", "PSX", "HAL", "WMB", "HES", "DVN", "OKE", "KMI", "MRO", "FANG", "CTRA", "APA"],
  XLP: ["PG", "KO", "PEP", "WMT", "COST", "MO", "PM", "CL", "KMB", "MDLZ", "SYY", "GIS", "ADM", "CAG", "KHC", "CPB", "CLX", "HRL", "K", "SJM"],
  XLY: ["AMZN", "TSLA", "HD", "MCD", "NKE", "SBUX", "LOW", "BKNG", "TJX", "MAR", "GM", "F", "ROST", "DHI", "LEN", "HLT", "AZO", "ORLY", "EBAY", "YUM"],
  XLI: ["UPS", "HON", "UNP", "CAT", "BA", "GE", "RTX", "MMM", "CSX", "NSC", "DE", "LMT", "ITW", "EMR", "NXPI", "GD", "CARR", "OTIS", "ETN", "PH"],
  XLB: ["LIN", "SHW", "APD", "ECL", "NEM", "FCX", "DOW", "DD", "PPG", "NUE", "CTVA", "FMC", "EMN", "IP", "ALB", "CE", "CF", "IFF"],
  XLU: ["NEE", "DUK", "SO", "D", "AEP", "SRE", "EXC", "XEL", "PEG", "ED", "WEC", "AWK", "ES", "DTE", "AEE", "PPL", "CMS", "CNP", "EIX", "ATO"],
  XLC: ["META", "GOOGL", "GOOG", "NFLX", "DIS", "CMCSA", "VZ", "T", "CHTR", "TMUS", "EA", "TTWO", "FOXA", "FOX", "WBD", "PARA", "OMC", "IPG", "TME"],
  XLRE: ["PLD", "AMT", "CCI", "EQIX", "SPG", "PSA", "WELL", "DLR", "O", "AVB", "EQR", "ELS", "HST", "ARE", "MAA", "ESS", "UDR", "VICI", "IRM", "INVH"],
};

/** Rounded helper: redondea a `DECIMALS` como lo hace el original (None -> null). */
function red(v: unknown, d = DECIMALS): number | null {
  if (typeof v !== "number" || !isFinite(v)) return null;
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as object)) {
    const raw = (v as { raw?: unknown }).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
  }
  return null;
}

interface Envelope {
  quoteSummary?: { result?: QuoteSummaryResult[]; error?: { description?: string } | null };
}

/** Devuelve la primera clave de fila cuyo nombre (en minúsculas) contiene algún matcher. */
function buscarCampo(rows: FinancialStatementRow[], matchers: string[]): string | null {
  for (const r of rows) {
    for (const key of Object.keys(r)) {
      const k = key.toLowerCase();
      if (matchers.some((m) => k.includes(m))) return key;
      if ("fmt" in (r[key] as object) || "raw" in (r[key] as object)) {
        // cont.
      }
    }
  }
  return null;
}

/** Valor del periodo más reciente (rows[0]) para un campo fuzzy. */
function valorCampo(rows: FinancialStatementRow[], matchers: string[]): number | null {
  const key = buscarCampo(rows, matchers);
  if (!key || !rows[0]) return null;
  return num(rows[0][key]);
}

/** Serie histórica (más reciente primero) de un campo fuzzy sobre las filas anuales. */
function historialCampo(rows: FinancialStatementRow[], matchers: string[]): number[] {
  const key = buscarCampo(rows, matchers);
  if (!key) return [];
  const out: number[] = [];
  for (const r of rows) {
    const v = num(r[key]);
    if (v != null) out.push(v);
  }
  return out;
}

/** Media simple. */
function media(a: number[]): number {
  if (!a.length) return 0;
  return a.reduce((s, x) => s + x, 0) / a.length;
}

/** Desvío estándar muestral. */
function desvio(a: number[]): number {
  if (a.length < 2) return 0;
  const m = media(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / (a.length - 1));
}

/** Fetches a JSON resource con timeout y headers por defecto; devuelve null si falla. */
async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/** Último valor de una serie BCRA (results[-1].valor). */
async function bcraUltimo(url: string): Promise<number | null> {
  const data = (await fetchJson(url)) as { results?: Array<{ valor?: number | string }> } | null;
  const results = data?.results ?? [];
  if (!results.length) return null;
  const v = results[results.length - 1]?.valor;
  return typeof v === "number" ? v : typeof v === "string" ? parseFloat(v) : null;
}

/** Retornos logarítmicos de una serie de cierres. */
function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const p = closes[i - 1];
    const c = closes[i];
    if (p != null && c != null && p > 0 && c > 0) out.push(Math.log(c / p));
  }
  return out;
}

/** Alinea dos conjuntos (fechas ISO + cierres) por fecha común y devuelve cierres emparejados. */
function alinear(
  a: { fechas: string[]; closes: number[] },
  b: { fechas: string[]; closes: number[] },
): { a: number[]; b: number[] } {
  const mapaB = new Map<string, number>();
  for (let i = 0; i < b.fechas.length; i++) {
    const f = b.fechas[i];
    const c = b.closes[i];
    if (f != null && typeof c === "number" && isFinite(c) && !mapaB.has(f)) mapaB.set(f, c);
  }
  const av: number[] = [];
  const bv: number[] = [];
  for (let i = 0; i < a.fechas.length; i++) {
    const f = a.fechas[i];
    const ca = a.closes[i];
    const cb = f != null ? mapaB.get(f) : undefined;
    if (typeof ca === "number" && isFinite(ca) && typeof cb === "number" && isFinite(cb)) {
      av.push(ca);
      bv.push(cb);
    }
  }
  return { a: av, b: bv };
}

/** Descarga cierres + fechas de un ticker para un rango. */
async function cierresDe(simbolo: string, rango = "1y"): Promise<{ fechas: string[]; closes: number[] }> {
  const chart = await fetchYahooChart(simbolo, rango, "1d");
  const res = chart?.chart?.result?.[0];
  if (!res) return { fechas: [], closes: [] };
  const ts = res.timestamp ?? [];
  const closes = res.indicators?.quote?.[0]?.close ?? [];
  const fechas: string[] = [];
  const cc: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closes[i];
    if (typeof c === "number" && isFinite(c)) {
      fechas.push(new Date(ts[i]! * 1000).toISOString().slice(0, 10));
      cc.push(c);
    }
  }
  return { fechas, closes: cc };
}

export interface DatosClarity {
  simbolo: string;
  r: QuoteSummaryResult | null;
  precio: number | null;
  marketCap: number | null;
  acciones: number | null;
  moneda: string | null;
  sector: string | null;
  industria: string | null;
  nombre: string | null;
  income: FinancialStatementRow[];
  balance: FinancialStatementRow[];
  cashflow: FinancialStatementRow[];
  instOwn: number;
  error: string | null;
}

async function extraerDatos(simbolo: string): Promise<DatosClarity> {
  const [chart, resp] = await Promise.all([
    fetchYahooChart(simbolo, "1y", "1d"),
    fetchYahooQuoteSummaryJson<Envelope>(simbolo, MODULOS_CLARITY),
  ]);
  const r = resp.json?.quoteSummary?.result?.[0] ?? null;
  const precioChart = chart?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
  const precio =
    (precioChart != null && isFinite(precioChart) && precioChart > 0
      ? precioChart
      : num(r?.financialData?.currentPrice)) ?? num(r?.price?.regularMarketPrice) ?? null;
  const marketCap = num(r?.price?.marketCap) ?? num(r?.summaryDetail?.marketCap);
  const acciones =
    num(r?.defaultKeyStatistics?.sharesOutstanding) ??
    num(r?.summaryDetail?.sharesOutstanding) ??
    (precio && marketCap ? marketCap / precio : null);
  let instOwn = 0;
  for (const h of r?.institutionOwnership?.ownershipList ?? []) {
    const p = num((h as { pctHeld?: unknown }).pctHeld);
    if (p != null && p > 0) instOwn = Math.min(1, instOwn + p);
  }
  return {
    simbolo,
    r,
    precio,
    marketCap,
    acciones,
    moneda: r?.price?.currency ?? r?.summaryDetail?.currency ?? null,
    sector: r?.assetProfile?.sector ?? null,
    industria: r?.assetProfile?.industry ?? null,
    nombre: r?.price?.longName ?? r?.price?.shortName ?? null,
    income: r?.incomeStatementHistory?.incomeStatementHistory ?? [],
    balance: r?.balanceSheetHistory?.balanceSheetStatements ?? [],
    cashflow: r?.cashflowStatementHistory?.cashflowStatements ?? [],
    instOwn,
    error:
      (!r && !precioChart)
        ? `No hay datos de ${simbolo} (Yahoo ${resp.status || "auth solo"}${resp.json?.quoteSummary?.error?.description ? ` — ${resp.json.quoteSummary.error.description}` : ""})`
        : null,
  };
}

// ─────────────────────────── Capa Cualitativa ───────────────────────────

export interface ResultadoCualitativo {
  ticker: string;
  dimensiones: Record<string, { score: number; peso: number }>;
  score_total: number;
  continuar: boolean;
  sector: string;
  industry: string;
  empresa: string;
}

export async function claCualitativo(simbolo: string): Promise<ResultadoCualitativo> {
  const d = await extraerDatos(simbolo);
  const sector = (d.sector ?? "").toLowerCase();
  const industry = (d.industria ?? "").toLowerCase();
  const dimensiones: ResultadoCualitativo["dimensiones"] = {};

  // D1 Modelo de negocio (20%)
  let d1 = 5.0;
  if (["software", "insurance", "healthcare", "utilities"].some((k) => industry.includes(k))) d1 = 7.0;
  else if (["technology", "healthcare", "consumer defensive"].some((k) => sector.includes(k))) d1 = 6.5;
  else if (["financial services"].some((k) => sector.includes(k))) d1 = 6.0;
  const revs = historialCampo(d.income, ["total revenue", "revenue", "operating revenue"]);
  const revUlt = revs[revs.length - 1];
  const revPri = revs[0];
  if (revPri != null && revUlt != null && revUlt !== 0 && revPri !== 0) {
    const growth = revPri / revUlt - 1;
    if (growth > 0.1) d1 = Math.min(10, d1 + 1.5);
    else if (growth > 0) d1 = Math.min(10, d1 + 0.5);
    else if (growth < -0.1) d1 = Math.max(0, d1 - 1.5);
  }
  dimensiones["modelo_negocio"] = { score: red(d1, 1) ?? 0, peso: 0.2 };

  // D2 Management (25%)
  let d2 = 5.0;
  const pns = historialCampo(d.balance, ["stockholders equity", "total equity", "shareholders equity"]);
  const nis = historialCampo(d.income, ["net income common", "net income"]);
  const deudas = historialCampo(d.balance, ["total debt", "long term debt"]);
  if (pns.length >= 2 && nis.length >= 2) {
    const len = Math.min(pns.length, nis.length);
    const roes = nis.slice(0, len).map((ni, i) => (pns[i]! !== 0 ? ni / pns[i]! : 0));
    if (roes.length) {
      const ult = roes[roes.length - 1]!;
      if (ult > 0.15) d2 += 2;
      else if (ult > 0.1) d2 += 1;
      else if (ult < 0) d2 -= 2;
      if (roes.length >= 3 && roes[roes.length - 1]! > roes[0]!) d2 += 1;
    }
    if (deudas.length) {
      const de = deudas[0]! / pns[0]! !== 0 ? deudas[0]! / pns[0]! : 999;
      if (de < 0.5) d2 += 1;
      else if (de > 2) d2 -= 1.5;
    }
  }
  dimensiones["management"] = { score: red(Math.min(10, Math.max(0, d2)), 1) ?? 0, peso: 0.25 };

  // D3 Ventaja competitiva / Moat (30%)
  let d3 = 5.0;
  const ebitdas = historialCampo(d.income, ["ebitda"]);
  const revsMoat = historialCampo(d.income, ["total revenue", "revenue"]);
  if (ebitdas.length && revsMoat.length) {
    const margin = revsMoat[0]! !== 0 ? ebitdas[0]! / revsMoat[0]! : 0;
    if (margin > 0.3) d3 = 8.0;
    else if (margin > 0.2) d3 = 7.0;
    else if (margin > 0.1) d3 = 6.0;
    else if (margin < 0) d3 = 2.0;
  }
  dimensiones["ventaja_competitiva"] = { score: red(Math.min(10, Math.max(0, d3)), 1) ?? 0, peso: 0.3 };

  // D4 Gobierno corporativo (15%)
  let d4 = 5.0;
  if (d.instOwn > 0.3) d4 += 1;
  else if (d.instOwn > 0.5) d4 += 1.5;
  dimensiones["gobierno_corporativo"] = { score: red(Math.min(10, Math.max(0, d4)), 1) ?? 0, peso: 0.15 };

  // D5 Porter (10%)
  const porterMap: Record<string, number> = {
    technology: 4.0,
    "communication services": 4.5,
    healthcare: 5.0,
    "financial services": 5.5,
    "consumer defensive": 4.5,
    "consumer cyclical": 6.0,
    energy: 5.5,
    "basic materials": 6.0,
    industrials: 5.5,
    utilities: 4.0,
    "real estate": 5.0,
  };
  let d5 = 5.0;
  for (const [k, v] of Object.entries(porterMap)) {
    if (sector.includes(k)) {
      d5 = v;
      break;
    }
  }
  dimensiones["porter"] = { score: red(d5, 1) ?? 0, peso: 0.1 };

  const pesos: Record<string, number> = {
    modelo_negocio: 0.2,
    management: 0.25,
    ventaja_competitiva: 0.3,
    gobierno_corporativo: 0.15,
    porter: 0.1,
  };
  let total = 0;
  for (const k of Object.keys(pesos)) {
    const dim = dimensiones[k];
    if (dim) total += dim.score * pesos[k]!;
  }
  return {
    ticker: simbolo,
    dimensiones,
    score_total: red(total, 2) ?? 0,
    continuar: total >= 5.0,
    sector: sector,
    industry: industry,
    empresa: d.nombre ?? simbolo,
  };
}

// ──────────────────────────── Capa Cuantitativa ────────────────────────────

export interface MetricasCuantitativas {
  M1_ingresos_netos?: number;
  M2_ebitda?: number;
  M3_resultado_neto?: number;
  M4_eps?: number;
  M5_margen_ebitda?: number;
  M6_margen_neto?: number;
  M7_activo?: number;
  M8_pasivo?: number;
  M9_patrimonio?: number;
  M10_deuda_financiera_neta?: number;
  M11_capital_trabajo?: number;
  M12_roe?: number;
  M13_roa?: number;
  M14_deuda_ebitda?: number;
  M15_pe?: number;
  ev_ebitda?: number;
}

export interface ResultadoCuantitativo {
  ticker: string;
  metricas: MetricasCuantitativas;
  alertas: {
    rojas: string[];
    amarillas: string[];
    total_rojas: number;
    total_amarillas: number;
  };
  precio_actual: number | null;
  market_cap: number | null;
  empresa: string;
}

export async function claCuantitativo(simbolo: string): Promise<ResultadoCuantitativo> {
  const d = await extraerDatos(simbolo);
  const m: Record<string, number> = {};
  const rojas: string[] = [];
  const amarillas: string[] = [];

  const precio = d.precio ?? 0;
  const shares = d.acciones ?? 0;
  const mkt = d.marketCap ?? 0;

  const incRows = d.income;
  const bsRows = d.balance;
  const cfRows = d.cashflow;

  const revHist = historialCampo(incRows, ["total revenue", "revenue"]);
  const niHist = historialCampo(incRows, ["net income common", "net income"]);
  const ebitdaHist = historialCampo(incRows, ["ebitda"]);
  const opHist = historialCampo(incRows, ["operating income", "operating income/loss"]);
  const daHist = historialCampo(incRows, ["depreciation and amortization", "depreciation & amortization"]);

  const rev = revHist.length ? revHist[0]! : null;
  let ni = niHist.length ? niHist[0]! : null;
  let ebitda = ebitdaHist.length ? ebitdaHist[0]! : null;
  if (ebitda == null && opHist.length && daHist.length) ebitda = opHist[0]! + daHist[0]!;

  if (rev != null) m["M1_ingresos_netos"] = rev;
  if (ebitda != null) m["M2_ebitda"] = ebitda;
  if (ni != null) m["M3_resultado_neto"] = ni;

  if (ni != null && shares > 0) m["M4_eps"] = red(ni / shares, 4) ?? 0;
  else if (precio > 0) {
    const pe = num(d.r?.summaryDetail?.trailingPE);
    if (pe != null && pe > 0) m["M4_eps"] = red(precio / pe, 4) ?? 0;
  }

  if (rev && rev !== 0) {
    if (m["M2_ebitda"] != null) m["M5_margen_ebitda"] = red(m["M2_ebitda"]! / rev, 4) ?? 0;
    if (ni != null) m["M6_margen_neto"] = red(ni / rev, 4) ?? 0;
  }

  const activo = valorCampo(bsRows, ["total assets"]);
  const pasivo = valorCampo(bsRows, ["total liabilities"]);
  let pn = valorCampo(bsRows, ["total equity", "stockholders equity"]);
  if (pn == null && activo != null && pasivo != null) pn = activo - pasivo;
  const deuda = valorCampo(bsRows, ["total debt"]);
  const caja = valorCampo(bsRows, ["cash and cash equivalents"]);
  const ca = valorCampo(bsRows, ["total current assets"]);
  const cl = valorCampo(bsRows, ["total current liabilities"]);

  if (activo != null) m["M7_activo_total"] = activo;
  if (pasivo != null) m["M8_pasivo_total"] = pasivo;
  if (pn != null) m["M9_patrimonio_neto"] = pn;
  const dfn = (deuda ?? 0) - (caja ?? 0);
  m["M10_deuda_financiera_neta"] = red(dfn, 2) ?? 0;
  if (ca != null && cl != null) m["M11_capital_trabajo"] = red(ca - cl, 2) ?? 0;
  if (ni != null && pn != null && pn !== 0) m["M12_roe"] = red(ni / pn, 4) ?? 0;
  if (ni != null && activo != null && activo !== 0) m["M13_roa"] = red(ni / activo, 4) ?? 0;
  if (dfn != null && m["M2_ebitda"] != null && m["M2_ebitda"] !== 0)
    m["M14_deuda_ebitda"] = red(dfn / m["M2_ebitda"]!, 4) ?? 0;
  if (precio > 0 && m["M4_eps"] != null && m["M4_eps"] !== 0) m["M15_pe"] = red(precio / m["M4_eps"]!, 2) ?? 0;

  if (mkt && m["M2_ebitda"] != null && m["M2_ebitda"] !== 0) {
    const ev = mkt + dfn;
    m["ev_ebitda"] = red(ev / m["M2_ebitda"]!, 2) ?? 0;
  }

  const dE = m["M14_deuda_ebitda"];
  if (dE != null && dE > 4) rojas.push(`Deuda/EBITDA ${dE} x > 4x — Apalancamiento excesivo`);
  if (pn != null && pn < 0) rojas.push("Patrimonio Neto negativo — Riesgo de default técnico");
  const mn = m["M6_margen_neto"];
  if (mn != null && mn < 0) rojas.push(`Margen neto ${(mn * 100)}% — Pérdida neta`);
  const ct = m["M11_capital_trabajo"];
  if (ct != null && ct < 0) rojas.push("Capital de trabajo negativo — Problemas de liquidez");
  if (revHist.length >= 2 && revHist[1] !== 0) {
    const caida = revHist[0]! / revHist[1]! - 1;
    if (caida < -0.1) amarillas.push(`Caída de ingresos ${(caida * 100).toFixed(0)}% interanual`);
  }

  return {
    ticker: simbolo,
    metricas: m,
    alertas: { rojas, amarillas, total_rojas: rojas.length, total_amarillas: amarillas.length },
    precio_actual: precio || null,
    market_cap: mkt || null,
    empresa: d.nombre ?? simbolo,
  };
}

// ───────────────────────────── Capa WACC ─────────────────────────────

export interface ResultadoWacc {
  ticker: string;
  rf_ust_10y: number | null;
  beta: number | null;
  benchmark: string;
  prima_riesgo_mercado: number;
  riesgo_pais_pct: number | null;
  size_premium: number;
  ke_capm: number | null;
  kd: number | null;
  tasa_impositiva: number;
  peso_equity: number | null;
  peso_deuda: number | null;
  wacc_usd: number | null;
  devaluacion_esperada_anual: number | null;
  wacc_nominal_ars: number | null;
}

export async function claWacc(simbolo: string): Promise<ResultadoWacc> {
  const d = await extraerDatos(simbolo);
  const isBa = simbolo.toUpperCase().endsWith(".BA");

  let rf = 4.5;
  try {
    const tnx = await cierresDe("^TNX", "5d");
    const c = ultimoCierre(tnx.closes);
    if (c != null && isFinite(c) && c > 0) rf = c > 30 ? c / 10 : c;
  } catch {
    /* fallback */
  }

  let beta = 1.0;
  let benchmark = isBa ? "MERVAL" : "S&P 500";
  try {
    const benchTicker = isBa ? "^MERV" : "SPY";
    const [activo, bench] = await Promise.all([
      cierresDe(simbolo, "1y"),
      cierresDe(benchTicker, "1y"),
    ]);
    const al = alinear(activo, bench);
    if (al.a.length > 20 && al.b.length > 20) {
      const ra = logReturns(al.a);
      const rb = logReturns(al.b);
      const n = Math.min(ra.length, rb.length);
      if (n > 20) {
        const ma = media(ra.slice(-n));
        const mb = media(rb.slice(-n));
        let cov = 0;
        let varB = 0;
        for (let i = 0; i < n; i++) {
          cov += (ra[ra.length - n + i]! - ma) * (rb[rb.length - n + i]! - mb);
          varB += (rb[rb.length - n + i]! - mb) * (rb[rb.length - n + i]! - mb);
        }
        cov /= n - 1;
        varB /= n - 1;
        if (varB > 0) beta = cov / varB;
      }
    }
  } catch {
    /* fallback beta 1.0 */
  }

  const premio = isBa ? 6.0 : 5.5;

  let riesgoPais = 0;
  const rpData = (await fetchJson(
    "https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo",
  )) as { valor?: number } | null;
  if (rpData && typeof rpData.valor === "number") riesgoPais = rpData.valor / 100;

  let ke = rf / 100 + beta * (premio / 100) + riesgoPais / 100;
  let sizePrem = 0;
  const mkt = d.marketCap ?? 0;
  if (mkt && mkt < 300_000_000) {
    if (mkt < 50_000_000) sizePrem = 0.03;
    else if (mkt < 150_000_000) sizePrem = 0.02;
    else sizePrem = 0.015;
  }
  ke += sizePrem;

  let kd = rf / 100 + 0.02;
  try {
    const deudaV = valorCampo(d.balance, ["total debt"]);
    const intCol = valorCampo(d.income, ["interest expense", "net interest income"]);
    if (deudaV != null && deudaV !== 0 && intCol != null) kd = Math.abs(intCol / deudaV);
    kd = Math.max(0.03, kd);
  } catch {
    /* fallback */
  }

  const t = isBa ? 0.35 : 0.25;

  let e = mkt || 1;
  let dd = 0;
  try {
    const deudaV = valorCampo(d.balance, ["total debt"]);
    const cajaV = valorCampo(d.balance, ["cash and cash equivalents"]);
    if (deudaV != null) {
      dd = Math.abs(deudaV);
      if (cajaV != null) dd = Math.max(0, dd - Math.abs(cajaV));
    }
  } catch {
    /* fallback deuda 0 */
  }
  const v = e + dd;
  const we = e / v;
  const wd = dd / v;
  const waccUsd = we * ke + wd * kd * (1 - t);

  let devaluacionAnual: number | null = null;
  let waccArs: number | null = null;
  if (isBa) {
    let inflacionArs = 0.03;
    const pi = await bcraUltimo("https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/variacionIPC");
    if (pi != null) inflacionArs = pi / 100;
    const devaluacion = (1 + inflacionArs) / (1 + 0.0025) - 1;
    devaluacionAnual = Math.pow(1 + devaluacion, 12) - 1;
    waccArs = (1 + waccUsd) * (1 + devaluacionAnual) - 1;
  }

  return {
    ticker: simbolo,
    rf_ust_10y: red(rf, 2),
    beta,
    benchmark,
    prima_riesgo_mercado: premio,
    riesgo_pais_pct: red(riesgoPais, 2),
    size_premium: red(sizePrem * 100, 2) ?? 0,
    ke_capm: red(ke * 100, 2),
    kd: red(kd * 100, 2),
    tasa_impositiva: t,
    peso_equity: red(we, 4),
    peso_deuda: red(wd, 4),
    wacc_usd: red(waccUsd * 100, 2),
    devaluacion_esperada_anual: red(devaluacionAnual != null ? devaluacionAnual * 100 : null, 2),
    wacc_nominal_ars: red(waccArs != null ? waccArs * 100 : null, 2),
  };
}

// ────────────────────────────── Capa DCF ──────────────────────────────

export interface ResultadoDcf {
  ticker: string;
  wacc_usado: number;
  g_corto: number;
  g_largo: number;
  margen_neto_promedio: number;
  proyecciones: Array<{
    año: number;
    crecimiento: number;
    ingresos: number;
    resultado_neto: number;
    da: number;
    capex: number;
    fcff: number;
  }>;
  valor_terminal: number;
  enterprise_value: number;
  equity_value: number;
  valor_intrinseco: number;
  precio_actual: number | null;
  margen_seguridad_pct: number | null;
  decision: string;
  deuda_neta: number;
  caja: number;
  acciones: number;
}

export async function claDcf(simbolo: string): Promise<ResultadoDcf> {
  const d = await extraerDatos(simbolo);
  const waccData = await claWacc(simbolo);
  const wacc = (waccData.wacc_usd ?? 10) / 100;

  const ingresosHist = historialCampo(d.income, ["total revenue", "revenue"]);
  const ingresosBase = ingresosHist.length ? ingresosHist[0]! : null;
  if (ingresosBase == null || ingresosBase <= 0) {
    throw new Error("No se pudieron obtener ingresos históricos para DCF.");
  }

  let gCorto = 0.05;
  if (ingresosHist.length >= 3 && ingresosHist[ingresosHist.length - 1]! > 0) {
    const cagr =
      Math.pow(ingresosHist[0]! / ingresosHist[ingresosHist.length - 1]!, 1 / Math.max(1, ingresosHist.length - 1)) - 1;
    gCorto = Math.max(0.01, Math.min(cagr, 0.3));
  }

  let gLargo = Math.max(wacc * 0.5, 0.025);
  gLargo = Math.min(gLargo, wacc - 0.01);

  let margenNetoProm = 0.1;
  const niHist = historialCampo(d.income, ["net income common", "net income"]);
  if (niHist.length && ingresosHist.length) {
    const len = Math.min(niHist.length, ingresosHist.length);
    const margenes: number[] = [];
    for (let i = 0; i < len; i++) {
      margenes.push(ingresosHist[i] !== 0 ? niHist[i]! / ingresosHist[i]! : 0);
    }
    if (margenes.length) margenNetoProm = media(margenes);
  }

  let capexPct = 0.05;
  let daPct = 0.03;
  const capexVals = historialCampo(d.cashflow, ["capital expenditure", "capex"]);
  const depreciacionVals = historialCampo(d.cashflow, ["depreciation and amortization", "depreciation & amortization"]);
  if (capexVals.length) capexPct = Math.abs(capexVals[0]!) / ingresosBase;
  if (depreciacionVals.length) daPct = Math.abs(depreciacionVals[0]!) / ingresosBase;

  let deudaNeta = 0;
  let caja = 0;
  const deudaV = valorCampo(d.balance, ["total debt"]);
  const cajaV = valorCampo(d.balance, ["cash and cash equivalents"]);
  if (deudaV != null) deudaNeta = Math.abs(deudaV);
  if (cajaV != null) caja = Math.abs(cajaV);
  deudaNeta = Math.max(0, deudaNeta - caja);

  const shares = d.acciones ?? 0;
  const precio = d.precio ?? 0;

  const tasas = [gCorto, gCorto, gCorto, gCorto + (gLargo - gCorto) * 0.5, gLargo];
  const proyecciones: ResultadoDcf["proyecciones"] = [];
  let ingAnterior = ingresosBase;
  const fcffVals: number[] = [];
  for (let i = 0; i < tasas.length; i++) {
    const g = tasas[i]!;
    const ing = ingAnterior * (1 + g);
    const niProy = ing * margenNetoProm;
    const daProy = ing * daPct;
    const capexProy = ing * capexPct;
    const varCt = ing * 0.02;
    const fcff = niProy + daProy - capexProy - varCt;
    proyecciones.push({
      año: i + 1,
      crecimiento: red(g * 100, 2) ?? 0,
      ingresos: red(ing, 2) ?? 0,
      resultado_neto: red(niProy, 2) ?? 0,
      da: red(daProy, 2) ?? 0,
      capex: red(capexProy, 2) ?? 0,
      fcff: red(fcff, 2) ?? 0,
    });
    fcffVals.push(fcff);
    ingAnterior = ing;
  }

  const vt = wacc > gLargo ? (fcffVals[4]! * (1 + gLargo)) / (wacc - gLargo) : fcffVals[4]! * 15;
  let evVal = 0;
  for (let i = 0; i < 5; i++) evVal += fcffVals[i]! / Math.pow(1 + wacc, i + 1);
  evVal += vt / Math.pow(1 + wacc, 5);

  const equityValue = evVal - deudaNeta + caja;
  const vi = shares > 0 ? equityValue / shares : 0;

  let margen: number | null = null;
  let decision = "INSUFICIENTES DATOS";
  if (precio > 0 && vi > 0) {
    margen = ((vi - precio) / vi) * 100;
    if (margen >= 30) decision = "COMPRAR";
    else if (margen >= 10) decision = "MANTENER / ACUMULAR";
    else if (margen > -10) decision = "MANTENER";
    else decision = "VENDER / EVITAR";
  }

  return {
    ticker: simbolo,
    wacc_usado: red(wacc * 100, 2) ?? 0,
    g_corto: red(gCorto * 100, 2) ?? 0,
    g_largo: red(gLargo * 100, 2) ?? 0,
    margen_neto_promedio: red(margenNetoProm * 100, 2) ?? 0,
    proyecciones,
    valor_terminal: red(vt, 2) ?? 0,
    enterprise_value: red(evVal, 2) ?? 0,
    equity_value: red(equityValue, 2) ?? 0,
    valor_intrinseco: red(vi, 2) ?? 0,
    precio_actual: precio || null,
    margen_seguridad_pct: red(margen != null ? margen : null, 2),
    decision,
    deuda_neta: red(deudaNeta, 2) ?? 0,
    caja: red(caja, 2) ?? 0,
    acciones: Math.round(shares),
  };
}

// ───────────────────────────── Capa Múltiplos ─────────────────────────────

export interface ResultadoMultiples {
  ticker: string;
  enterprise_value: number;
  ev_ebitda: number | null;
  pe: number | null;
  pbv: number | null;
  ev_revenue: number | null;
  sector: string;
  industry: string;
  multiples_sector: { ev_ebitda: number; pe: number; pbv: number; ev_revenue: number };
  valor_intrinseco_multi: number | null;
  rango_multi: { min: number; max: number } | null;
  sector_key: string | null;
}

export async function claMultiples(simbolo: string): Promise<ResultadoMultiples> {
  const d = await extraerDatos(simbolo);
  const precio = d.precio ?? 0;
  const mkt = d.marketCap ?? 0;
  const shares = d.acciones ?? 0;

  const ebitdaV = valorCampo(d.income, ["ebitda"]);
  let deudaNeta = 0;
  let caja = 0;
  const deudaV = valorCampo(d.balance, ["total debt"]);
  const cajaV = valorCampo(d.balance, ["cash and cash equivalents"]);
  if (deudaV != null) deudaNeta = Math.abs(deudaV);
  if (cajaV != null) caja = Math.abs(cajaV);
  deudaNeta = Math.max(0, deudaNeta - caja);

  const ev = mkt + deudaNeta;
  const evEbitda = ebitdaV && ebitdaV !== 0 ? red(ev / ebitdaV, 2) : null;

  let pe: number | null = null;
  const tpe = num(d.r?.summaryDetail?.trailingPE);
  if (tpe != null && tpe > 0) pe = red(tpe, 2);

  let pbv: number | null = null;
  const pn = valorCampo(d.balance, ["total equity", "stockholders equity"]);
  if (pn != null && pn !== 0) pbv = red(mkt / pn, 2);

  let evRevenue: number | null = null;
  const rev = valorCampo(d.income, ["total revenue", "revenue"]);
  if (rev != null && rev !== 0) evRevenue = red(ev / rev, 2);

  const sector = d.sector ?? "";
  const industry = d.industria ?? "";
  const sectorKey = d.r?.assetProfile?.sectorKey ?? null;
  const med = SECTOR_MULTIPLOS[sector.toLowerCase()] ?? SECTOR_MULTIPLOS_DEFAULT;

  let viMulti = 0;
  if (ebitdaV && ebitdaV > 0 && med.ev_ebitda) {
    const evImplied = ebitdaV * med.ev_ebitda;
    const eqImplied = evImplied - deudaNeta;
    viMulti = shares > 0 ? eqImplied / shares : 0;
  } else if (evRevenue && evRevenue !== 0 && med.ev_revenue) {
    const revReal = ev / evRevenue;
    const evImplied = revReal * med.ev_revenue;
    const eqImplied = evImplied - deudaNeta;
    viMulti = shares > 0 ? eqImplied / shares : 0;
  }

  return {
    ticker: simbolo,
    enterprise_value: red(ev, 2) ?? 0,
    ev_ebitda: evEbitda,
    pe,
    pbv,
    ev_revenue: evRevenue,
    sector,
    industry,
    multiples_sector: med,
    valor_intrinseco_multi: viMulti ? red(viMulti, 2) : null,
    rango_multi: viMulti ? { min: red(viMulti * 0.8, 2) ?? 0, max: red(viMulti * 1.2, 2) ?? 0 } : null,
    sector_key: sectorKey,
  };
}

// ───────────────────────────── Capa Valor Libro / APV ─────────────────────────────

export interface ResultadoBookValue {
  ticker: string;
  valor_libro: number;
  valor_libro_por_accion: number;
  ratio_precio_valor_libro: number | null;
  senal_subvaluacion: string | null;
  van_unlevered: number;
  pv_tax_shield: number;
  apv: number;
  valor_intrinseco_apv: number;
}

export async function claBookValue(simbolo: string): Promise<ResultadoBookValue> {
  const d = await extraerDatos(simbolo);
  const mkt = d.marketCap ?? 0;
  const shares = d.acciones ?? 0;
  const precio = d.precio ?? 0;

  let activo = 0;
  let pasivo = 0;
  let pn = valorCampo(d.balance, ["total equity", "stockholders equity"]) ?? 0;
  const deuda = valorCampo(d.balance, ["total debt"]) ?? 0;
  const caja = valorCampo(d.balance, ["cash and cash equivalents"]) ?? 0;
  activo = valorCampo(d.balance, ["total assets"]) ?? 0;
  pasivo = valorCampo(d.balance, ["total liabilities"]) ?? 0;
  if (pn === 0) pn = activo - pasivo;

  const vlAjustado = pn;
  const viLibro = shares > 0 ? vlAjustado / shares : 0;
  let ratio: number | null = null;
  let senal: string | null = null;
  if (precio > 0 && viLibro > 0) {
    ratio = red(precio / viLibro, 2);
    senal = ratio != null && ratio < 1 ? "Precio < Valor Libro — cotiza bajo liquidación" : null;
  }

  const waccData = await claWacc(simbolo);
  const ke = (waccData.ke_capm ?? 10) / 100;
  const kd = (waccData.kd ?? 6) / 100;
  const t = waccData.tasa_impositiva ?? 0.25;

  const ni = valorCampo(d.income, ["net income common", "net income"]);
  const vanUnlevered = ni && ke > 0 ? ni / ke : 0;
  const pvTaxShield = kd > 0 && deuda > 0 && ke > 0 ? (kd * deuda * t) / ke : 0;
  const apv = vanUnlevered + pvTaxShield;
  const viApv = shares > 0 ? apv / shares : 0;

  return {
    ticker: simbolo,
    valor_libro: red(pn, 2) ?? 0,
    valor_libro_por_accion: red(viLibro, 2) ?? 0,
    ratio_precio_valor_libro: ratio,
    senal_subvaluacion: senal,
    van_unlevered: red(vanUnlevered, 2) ?? 0,
    pv_tax_shield: red(pvTaxShield, 2) ?? 0,
    apv: red(apv, 2) ?? 0,
    valor_intrinseco_apv: red(viApv, 2) ?? 0,
  };
}

// ─────────────────────────────── Triangulación ───────────────────────────────

export interface ResultadoTriangulacion {
  ticker: string;
  valor_dcf: number;
  valor_multi: number;
  valor_libro: number;
  precio_actual: number | null;
  perfil: string;
  pesos: { dcf: number; multi: number; book: number };
  valor_intrinseco_ponderado: number;
  rango_final: { min: number; max: number; central: number } | null;
  margen_seguridad_pct: number | null;
  decision_final: string;
  dcf: ResultadoDcf;
  multiples: ResultadoMultiples;
  book_value: ResultadoBookValue;
}

export async function claTriangulacion(simbolo: string): Promise<ResultadoTriangulacion> {
  const [dcf, multi, book] = await Promise.all([
    claDcf(simbolo),
    claMultiples(simbolo),
    claBookValue(simbolo),
  ]);
  const d = await extraerDatos(simbolo);
  const precio = d.precio ?? 0;

  const viDcf = dcf.valor_intrinseco || 0;
  const viMulti = multi.valor_intrinseco_multi || 0;
  const viLibro = book.valor_libro_por_accion || 0;

  const sector = (d.sector ?? "").toLowerCase();
  const industry = (d.industria ?? "").toLowerCase();
  const isGrowth =
    ["technology"].some((k) => sector.includes(k)) ||
    ["software", "internet", "biotechnology"].some((k) => industry.includes(k));
  const isDistress =
    dcf.decision === "VENDER / EVITAR" || (viDcf <= 0 && viMulti <= 0);

  let wDcf: number, wMulti: number, wBook: number, perfil: string;
  if (isDistress) {
    wDcf = 0.2;
    wMulti = 0.3;
    wBook = 0.5;
    perfil = "reestructuración / distress";
  } else if (isGrowth) {
    wDcf = 0.4;
    wMulti = 0.5;
    wBook = 0.1;
    perfil = "crecimiento";
  } else {
    wDcf = 0.5;
    wMulti = 0.3;
    wBook = 0.2;
    perfil = "madura / flujos estables";
  }

  const viPond = wDcf * viDcf + wMulti * viMulti + wBook * viLibro;

  const valores = [viDcf, viMulti, viLibro].filter((v) => v > 0);
  let rangoFinal: ResultadoTriangulacion["rango_final"] = null;
  if (valores.length) {
    rangoFinal = {
      min: red(Math.min(...valores), 2) ?? 0,
      max: red(Math.max(...valores), 2) ?? 0,
      central: red(viPond, 2) ?? 0,
    };
  }

  let margen: number | null = null;
  let decision = "DATOS INSUFICIENTES";
  if (precio > 0 && viPond > 0) {
    margen = ((viPond - precio) / viPond) * 100;
    if (margen >= 30) decision = "COMPRAR";
    else if (margen >= 10) decision = "MANTENER / ACUMULAR";
    else if (margen >= 0) decision = "MANTENER";
    else if (margen > -20) decision = "REDUCIR";
    else decision = "VENDER";
  }

  return {
    ticker: simbolo,
    valor_dcf: red(viDcf, 2) ?? 0,
    valor_multi: red(viMulti, 2) ?? 0,
    valor_libro: red(viLibro, 2) ?? 0,
    precio_actual: precio || null,
    perfil,
    pesos: { dcf: wDcf, multi: wMulti, book: wBook },
    valor_intrinseco_ponderado: red(viPond, 2) ?? 0,
    rango_final: rangoFinal,
    margen_seguridad_pct: red(margen != null ? margen : null, 2),
    decision_final: decision,
    dcf,
    multiples: multi,
    book_value: book,
  };
}

// ───────────────────────────── Contexto Macro ─────────────────────────────

export interface ResultadoMacro {
  timestamp: string;
  inflacion_mensual: number | null;
  tipo_cambio_oficial: number | null;
  tasa_pasiva: number | null;
  riesgo_pais: number | null;
  dolar_oficial: { compra: number | null; venta: number | null } | null;
  dolar_blue: { compra: number | null; venta: number | null } | null;
  dolar_mep: { compra: number | null; venta: number | null } | null;
  dolar_ccl: { compra: number | null; venta: number | null } | null;
  tasa_real_mensual_fisher: number | null;
  tasa_real_anual_fisher: number | null;
  spread_soberano: number | null;
  regimen_macro: string;
  score_macro: number;
  senal_regimen: string[];
  tasa_libre_riesgo_local: number | null;
}

export async function claContextoMacro(): Promise<ResultadoMacro> {
  const macro = {
    tim: Date.now(),
    inflacion_mensual: null as number | null,
    tipo_cambio_oficial: null as number | null,
    tasa_pasiva: null as number | null,
    riesgo_pais: null as number | null,
    dolar_oficial: null as { compra: number | null; venta: number | null } | null,
    dolar_blue: null as { compra: number | null; venta: number | null } | null,
    dolar_mep: null as { compra: number | null; venta: number | null } | null,
    dolar_ccl: null as { compra: number | null; venta: number | null } | null,
  };

  macro.inflacion_mensual = await bcraUltimo("https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/variacionIPC");
  macro.tipo_cambio_oficial = await bcraUltimo(
    "https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/tipoCambioReferencia",
  );
  macro.tasa_pasiva = await bcraUltimo("https://api.bcra.gob.ar/estadisticas/v3.0/monetarias/tasaPasivaBancaria");

  const rpData = (await fetchJson("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo")) as {
    valor?: number;
  } | null;
  if (rpData && typeof rpData.valor === "number") macro.riesgo_pais = rpData.valor;

  const dol = (await fetchJson("https://criptoya.com/api/dolar")) as Record<string, { bid?: number; ask?: number }>;
  if (dol) {
    const toCompra = (v: { bid?: number; ask?: number }) => ({
      compra: typeof v?.bid === "number" ? v.bid : null,
      venta: typeof v?.ask === "number" ? v.ask : null,
    });
    macro.dolar_oficial = dol["oficial"] ? toCompra(dol["oficial"]) : null;
    macro.dolar_blue = dol["blue"] ? toCompra(dol["blue"]) : null;
    macro.dolar_mep = dol["mep"] ? toCompra(dol["mep"]) : null;
    macro.dolar_ccl = dol["ccl"] ? toCompra(dol["ccl"]) : null;
  }

  let precioTnx: number | null = null;
  let variacionTnx: number | null = null;
  let variacionDxy: number | null = null;
  try {
    for (const sym of ["SPY", "DX-Y.NYB", "^TNX"]) {
      const s = await cierresDe(sym, "5d");
      const closes = s.closes;
      if (!closes.length) continue;
      if (closes.length > 1) {
        const v = ((closes[closes.length - 1]! - closes[closes.length - 2]!) / closes[closes.length - 2]!) * 100;
        if (sym === "^TNX") variacionTnx = v;
        if (sym === "DX-Y.NYB") variacionDxy = v;
      }
      if (sym === "^TNX") {
        const c = ultimoCierre(closes);
        precioTnx = c != null && c > 30 ? c / 10 : c;
      }
    }
  } catch {
    /* macro Yahoo no disponible */
  }

  let tasaRealMensual: number | null = null;
  let tasaRealAnual: number | null = null;
  const tem = macro.tasa_pasiva;
  const pi = macro.inflacion_mensual;
  if (tem != null && pi != null && pi < 100) {
    const temMensual = tem / 100;
    const piMensual = pi / 100;
    tasaRealMensual = ((1 + temMensual) / (1 + piMensual) - 1) * 100;
    const tea = Math.pow(1 + temMensual, 12) - 1;
    const inflacionAcumulada = Math.pow(1 + piMensual, 12) - 1;
    tasaRealAnual = ((1 + tea) / (1 + inflacionAcumulada) - 1) * 100;
  }

  let spreadSoberano: number | null = null;
  if (macro.riesgo_pais != null && precioTnx != null) {
    spreadSoberano = macro.riesgo_pais / 100 + precioTnx;
  }

  const senales: string[] = [];
  if (pi != null) {
    if (pi > 5) senales.push("Inflación alta (>5% mensual) — riesgo de devaluación latente");
    else if (pi > 3) senales.push("Inflación elevada");
  }
  if (macro.riesgo_pais != null) {
    if (macro.riesgo_pais > 1000) senales.push("Riesgo país >1000bps — descuento adicional en WACC");
  }
  if (variacionDxy != null) {
    if (variacionDxy > 0) senales.push("DXY alcista — presión sobre emergentes");
    else if (variacionDxy < -0.5) senales.push("DXY bajista — alivio para emergentes");
  }

  let score = 0;
  if (pi != null && pi <= 3) score += 1;
  else if (pi != null && pi > 5) score -= 2;
  if (macro.riesgo_pais != null && macro.riesgo_pais < 500) score += 1;
  else if (macro.riesgo_pais != null && macro.riesgo_pais > 1000) score -= 2;
  if (variacionDxy != null && variacionDxy < -0.5) score += 1;
  else if (variacionDxy != null && variacionDxy > 1) score -= 1;

  const regimen = score >= 1 ? "FAVORABLE" : score <= -1 ? "ADVERSO" : "NEUTRO";

  let tasaLocal: number | null = null;
  if (precioTnx != null) {
    tasaLocal = macro.riesgo_pais != null ? precioTnx + macro.riesgo_pais / 100 : precioTnx;
  }

  return {
    timestamp: new Date(macro.tim).toISOString(),
    inflacion_mensual: macro.inflacion_mensual,
    tipo_cambio_oficial: macro.tipo_cambio_oficial,
    tasa_pasiva: macro.tasa_pasiva,
    riesgo_pais: macro.riesgo_pais,
    dolar_oficial: macro.dolar_oficial,
    dolar_blue: macro.dolar_blue,
    dolar_mep: macro.dolar_mep,
    dolar_ccl: macro.dolar_ccl,
    tasa_real_mensual_fisher: red(tasaRealMensual != null ? tasaRealMensual : null, 4),
    tasa_real_anual_fisher: red(tasaRealAnual != null ? tasaRealAnual : null, 4),
    spread_soberano: red(spreadSoberano != null ? spreadSoberano : null, 2),
    regimen_macro: regimen,
    score_macro: score,
    senal_regimen: senales,
    tasa_libre_riesgo_local: red(tasaLocal != null ? tasaLocal : null, 2),
  };
}

// ─────────────────────────────── Ficha de Decisión ───────────────────────────────

export interface ResultadoFicha {
  ticker: string;
  fecha: string;
  precio_actual: number | null;
  macro: { score_macro: string; tasa_libre_riesgo_local: number | null; riesgo_pais_bps: number | null };
  cualitativo: { score_total: number; dimensiones: Record<string, { score: number; peso: number }>; continuar: boolean; sector: string; industry: string };
  cuantitativo: { metricas: MetricasCuantitativas; alertas: ResultadoCuantitativo["alertas"] };
  wacc: { wacc_usd: number | null; ke: number | null; kd: number | null; beta: number | null };
  valuacion: {
    vi_dcf: number;
    vi_multi: number;
    vi_libro: number;
    vi_central: number;
    rango: ResultadoTriangulacion["rango_final"];
    perfil: string;
    decision: string;
  };
  margen_seguridad: {
    mos_aplicado_pct: number;
    precio_max_entrada: number;
    precio_target: number;
    upside_pct: number | null;
  };
  decision_final: string;
  bloqueado_por_cualitativo: boolean;
  notas_consistencia: string[];
  resumen: { ticker: string; precio: number | null; vi_central: number; upside: number | null; decision: string; score_cualitativo: number; score_macro: string };
  empresa: string;
}

export async function claFicha(simbolo: string): Promise<ResultadoFicha> {
  const [cuali, cuanti, wacc, tri, macro] = await Promise.all([
    claCualitativo(simbolo),
    claCuantitativo(simbolo),
    claWacc(simbolo),
    claTriangulacion(simbolo),
    claContextoMacro(),
  ]);
  const precio = tri.precio_actual ?? cuanti.precio_actual ?? null;
  const viCentral = tri.valor_intrinseco_ponderado || 0;
  const viDcf = tri.valor_dcf || 0;
  const viMulti = tri.valor_multi || 0;
  const viLibro = tri.valor_libro || 0;
  const scoreCuali = cuali.score_total ?? 5.0;

  let mos: number;
  if (scoreCuali >= 8.0) mos = 0.2;
  else if (scoreCuali >= 6.0) mos = 0.35;
  else mos = 0.5;

  const pMax = viCentral > 0 ? viCentral * (1 - mos) : 0;
  const upside = precio && precio > 0 && viCentral > 0 ? (viCentral / precio - 1) * 100 : null;

  let decisionFinal: string;
  let bloqueado = false;
  let notas: string[] = [];
  if (!cuali.continuar) {
    decisionFinal =
      "NO ANALIZAR — Score cualitativo insuficiente. No comprar lo que no se entiende (Buffett).";
    bloqueado = true;
  } else if (!precio || precio <= 0 || viCentral <= 0) {
    decisionFinal = "DATOS INSUFICIENTES";
  } else {
    if (upside != null && upside >= mos * 100) decisionFinal = "COMPRAR";
    else if (precio <= viCentral) decisionFinal = "ESPERAR / MANTENER";
    else decisionFinal = "NO COMPRAR / EVALUAR VENTA";
    notas = [
      "Fisher usado para tasa real — nunca resta simple",
      "El valor libro es el piso, no el objetivo",
      simbolo.toUpperCase().endsWith(".BA")
        ? "Múltiplos ajustados por riesgo país si aplica"
        : "Múltiplos comparables de mercado USA",
      cuali.continuar
        ? "Score cualitativo >= 5.0 — análisis cuantitativo habilitado"
        : "Score cualitativo < 5.0 — análisis bloqueado",
    ];
  }

  return {
    ticker: simbolo,
    fecha: new Date().toISOString().slice(0, 10),
    precio_actual: precio,
    macro: {
      score_macro: macro.regimen_macro,
      tasa_libre_riesgo_local: macro.tasa_libre_riesgo_local,
      riesgo_pais_bps: macro.riesgo_pais,
    },
    cualitativo: {
      score_total: scoreCuali,
      dimensiones: cuali.dimensiones,
      continuar: cuali.continuar,
      sector: cuali.sector,
      industry: cuali.industry,
    },
    cuantitativo: { metricas: cuanti.metricas, alertas: cuanti.alertas },
    wacc: {
      wacc_usd: wacc.wacc_usd,
      ke: wacc.ke_capm,
      kd: wacc.kd,
      beta: wacc.beta,
    },
    valuacion: {
      vi_dcf: viDcf,
      vi_multi: viMulti,
      vi_libro: viLibro,
      vi_central: red(viCentral, 2) ?? 0,
      rango: tri.rango_final,
      perfil: tri.perfil,
      decision: tri.decision_final,
    },
    margen_seguridad: {
      mos_aplicado_pct: red(mos * 100, 1) ?? 0,
      precio_max_entrada: red(pMax, 2) ?? 0,
      precio_target: red(viCentral, 2) ?? 0,
      upside_pct: red(upside != null ? upside : null, 2),
    },
    decision_final: decisionFinal,
    bloqueado_por_cualitativo: bloqueado,
    notas_consistencia: notas,
    resumen: {
      ticker: simbolo,
      precio,
      vi_central: red(viCentral, 2) ?? 0,
      upside: red(upside != null ? upside : null, 2),
      decision: decisionFinal,
      score_cualitativo: scoreCuali,
      score_macro: macro.regimen_macro,
    },
    empresa: cuanti.empresa ?? simbolo,
  };
}

// ───────────────────────────── Ciclo Económico (Intermarket) ─────────────────────────────

export interface ResultadoCiclo {
  stage: number;
  label: string;
  categoria: string;
  ratios: Record<string, { ratio: number | null; ma200: number | null; slope: number | null; trend: string }>;
  activosFavorecidos: string[];
  sectoresFavorecidos: string[];
  riesgos: string[];
}

async function descargar(tickers: string[], rango = "2y"): Promise<Map<string, { fechas: string[]; closes: number[] }>> {
  const mapa = new Map<string, { fechas: string[]; closes: number[] }>();
  for (const t of tickers) {
    const s = await cierresDe(t, rango);
    mapa.set(t, s);
  }
  return mapa;
}

function mediaVentana(arr: number[], window: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < arr.length; i++) {
    acc += arr[i]!;
    if (i >= window) acc -= arr[i - window]!;
    out.push(i >= window - 1 ? acc / window : NaN);
  }
  return out;
}

export async function claCiclo(): Promise<ResultadoCiclo> {
  const tickers = ["DBC", "TLT", "SPY", "DIA", "GLD", "XLP", "XLY"];
  const datos = await descargar(tickers);

  const ratios: ResultadoCiclo["ratios"] = {};
  const pares: Array<[string, string, string]> = [
    ["DBC", "TLT", "CRB_BOND"],
    ["TLT", "SPY", "BOND_SPX"],
    ["DIA", "GLD", "DOW_GOLD"],
    ["XLP", "XLY", "CONS_CYCL"],
  ];
  for (const [a, b, key] of pares) {
    const A = datos.get(a);
    const B = datos.get(b);
    if (!A || !B || !A.closes.length || !B.closes.length) continue;
    const al = alinear(A, B);
    if (!al.a.length) continue;
    const ratioSerie = al.a.map((v, i) => (al.b[i]! !== 0 ? v / al.b[i]! : NaN)).filter((v) => isFinite(v));
    if (!ratioSerie.length) continue;
    const ratioVal = ratioSerie[ratioSerie.length - 1]!;
    const ma = mediaVentana(ratioSerie, 200);
    const maUlt = isFinite(ma[ma.length - 1]!) ? ma[ma.length - 1]! : null;
    let slope: number | null = null;
    if (maUlt != null && ma.length >= 201 && isFinite(ma[ma.length - 201]!) && ma[ma.length - 201]! > 0) {
      slope = maUlt / ma[ma.length - 201]! - 1;
    }
    const trend = slope != null ? (slope > 0.005 ? "bullish" : slope < -0.005 ? "bearish" : "neutral") : "neutral";
    ratios[key] = { ratio: red(ratioVal, 4), ma200: red(maUlt, 4), slope: red(slope, 4), trend };
  }

  const computeAssetTrend = (t: string): "bullish" | "bearish" | "neutral" => {
    const s = datos.get(t);
    if (!s || !s.closes.length || s.closes.length < 200) return "neutral";
    const ma = mediaVentana(s.closes, 200);
    if (ma.length < 201 || !isFinite(ma[ma.length - 1]!) || !isFinite(ma[ma.length - 201]!) || ma[ma.length - 201]! <= 0)
      return "neutral";
    const slope = ma[ma.length - 1]! / ma[ma.length - 201]! - 1;
    return slope > 0.005 ? "bullish" : slope < -0.005 ? "bearish" : "neutral";
  };

  const crb = computeAssetTrend("DBC");
  const bond = computeAssetTrend("TLT");
  const spx = computeAssetTrend("SPY");
  const gold = computeAssetTrend("GLD");

  let stage: number, label: string, cat: string;
  let activos: string[], sectores: string[], riesgos: string[];

  if (bond === "bullish" && spx !== "bullish" && crb !== "bullish") {
    stage = 1; label = "Recuperación Inicial"; cat = "recovery";
    activos = ["TLT (Bonos largos)", "SPY (S&P 500 gradual)"];
    sectores = ["XLK (Tecnología)", "XLY (Consumo Discrecional)", "XLF (Financieras)"];
    riesgos = ["Salir muy temprano", "No reconocer el cambio de régimen"];
  } else if (spx === "bullish" && gold !== "bearish" && crb !== "bearish") {
    stage = 2; label = "Expansión Temprana"; cat = "expansion";
    activos = ["SPY", "QQQ", "IWM (Small Caps)"];
    sectores = ["XLI (Industriales)", "XLB (Materiales)", "XLK (Tecnología)"];
    riesgos = ["Subestimar inflación rezagada", "Sobreponderar defensivos"];
  } else if (crb === "bullish" && bond === "bearish" && spx === "bullish") {
    stage = 3; label = "Expansión Tardía (Inflacionaria)"; cat = "expansion";
    activos = ["DBC (Commodities)", "XLE (Energía)", "GLD (Oro)"];
    sectores = ["XLE (Energía)", "XLB (Materiales)", "XLV (Healthcare)"];
    riesgos = ["Inflación fuera de control", "Fin de ciclo alcista"];
  } else if (gold === "bullish" && spx !== "bullish" && crb !== "bearish") {
    stage = 4; label = "Pico / Euforia"; cat = "peak";
    activos = ["GLD (Oro)", "SLV (Plata)", "Cash"];
    sectores = ["XLU (Utilities)", "XLP (Consumo Básico)", "XLV (Healthcare)"];
    riesgos = ["Máximos de mercado", "Corrección inminente"];
  } else if (bond === "bullish" && spx === "bearish" && crb !== "bullish") {
    stage = 5; label = "Contracción / Flight-to-Quality"; cat = "contraction";
    activos = ["TLT (Bonos)", "GLD (Oro)", "XLP (Defensivos)"];
    sectores = ["XLP (Cons. Básico)", "XLU (Utilities)", "XLV (Healthcare)"];
    riesgos = ["Vender en pánico", "Perder el rebote"];
  } else if (spx === "bearish" && crb === "bearish" && gold !== "bullish") {
    stage = 6; label = "Recesión Plena"; cat = "recession";
    activos = ["Cash", "GLD (Oro)", "SHY (Corto plazo)"];
    sectores = ["Ninguno — preservación de capital"];
    riesgos = ["Quedarse fuera del rebound"];
  } else {
    stage = 2; label = "Expansión Temprana"; cat = "expansion";
    activos = ["SPY", "QQQ"];
    sectores = ["Tecnología (XLK)", "Industriales (XLI)"];
    riesgos = ["Falsas señales", "Cambio abrupto de régimen"];
  }

  return {
    stage,
    label,
    categoria: cat,
    ratios,
    activosFavorecidos: activos,
    sectoresFavorecidos: sectores,
    riesgos,
  };
}

// ───────────────────────────── Performance Sectorial ─────────────────────────────

export interface ResultadoPerformanceSectorial {
  items: Array<{ sector: string; etf: string; period: string; changePercent: number | null; trendScore: number; currentPrice: number | null }>;
  period: string;
}

const PERIODO_MAP: Record<string, string> = {
  "1d": "5d",
  "5d": "5d",
  "1mo": "1mo",
  "3mo": "3mo",
  "6mo": "6mo",
  "1y": "1y",
  "2y": "2y",
};

export async function claPerformanceSectorial(periodo = "5d"): Promise<ResultadoPerformanceSectorial> {
  const yfPeriod = PERIODO_MAP[periodo] ?? "5d";
  const items: ResultadoPerformanceSectorial["items"] = [];
  for (const [sector, etf] of Object.entries(SECTOR_ETF_MAP)) {
    try {
      const s = await cierresDe(etf, yfPeriod);
      if (s.closes.length < 2) continue;
      const first = s.closes[0]!;
      const last = s.closes[s.closes.length - 1]!;
      const changePct = first > 0 ? ((last - first) / first) * 100 : null;
      let trendScore = 0;
      if (s.closes.length >= 5) {
        const sma5 = s.closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
        trendScore = last > sma5 ? 1 : -1;
      }
      items.push({
        sector,
        etf,
        period: periodo,
        changePercent: red(changePct, 2),
        trendScore,
        currentPrice: red(last, 2),
      });
    } catch {
      /* sector sin datos: se omite */
    }
  }
  items.sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  return { items, period: periodo };
}

// ───────────────────────────── Valuation Sectorial ─────────────────────────────

interface FundSectorial {
  errores: string | null;
  price: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  profitMargin: number | null;
  operatingMargin: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  debtToEquity: number | null;
  freeCashflow: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  totalRevenue: number | null;
  netIncome: number | null;
  operatingCashflow: number | null;
  currentRatio: number | null;
  ebitda: number | null;
  sector: string | null;
  industry: string | null;
  name: string | null;
}

const MODULOS_SECTOR = [
  "assetProfile",
  "price",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
  "balanceSheetHistory",
];

async function fundamentosTicker(t: string): Promise<FundSectorial> {
  const resp = await fetchYahooQuoteSummaryJson<Envelope>(t, MODULOS_SECTOR);
  const r = resp.json?.quoteSummary?.result?.[0];
  if (!r) return { errores: `No data for ${t}` } as FundSectorial;
  return {
    errores: null,
    price: num(r.price?.regularMarketPrice) ?? num(r.financialData?.currentPrice),
    marketCap: num(r.price?.marketCap),
    trailingPE: num(r.summaryDetail?.trailingPE),
    forwardPE: num(r.summaryDetail?.forwardPE),
    priceToBook: num(r.summaryDetail?.priceToBook),
    dividendYield: num(r.summaryDetail?.trailingAnnualDividendYield),
    returnOnEquity: num(r.financialData?.returnOnEquity),
    returnOnAssets: num(r.financialData?.returnOnAssets),
    profitMargin: num(r.financialData?.profitMargins),
    operatingMargin: num(r.financialData?.operatingMargins),
    revenueGrowth: num(r.financialData?.revenueGrowth),
    earningsGrowth: num(r.financialData?.earningsGrowth),
    debtToEquity: num(r.financialData?.debtToEquity),
    freeCashflow: num(r.financialData?.freeCashflow),
    totalAssets: num(r.balanceSheetHistory?.balanceSheetStatements?.[0]?.["Total Assets"]),
    totalDebt: num(r.balanceSheetHistory?.balanceSheetStatements?.[0]?.["Total Debt"]),
    totalRevenue: num(r.financialData?.totalRevenue),
    netIncome:
      num(r.balanceSheetHistory?.balanceSheetStatements?.[0]?.["Net Income"]) ??
      num(r.cashflowStatementHistory?.cashflowStatements?.[0]?.["Net Income"]),
    operatingCashflow: num(r.financialData?.operatingCashflow),
    currentRatio: num(r.financialData?.currentRatio),
    ebitda: num(r.cashflowStatementHistory?.cashflowStatements?.[0]?.["EBITDA"]),
    sector: r.assetProfile?.sector ?? null,
    industry: r.assetProfile?.industry ?? null,
    name: r.price?.longName ?? r.price?.shortName ?? null,
  };
}

function percentilDe(valor: number | null, conjunto: number[]): number | null {
  if (valor == null || valor <= 0) return null;
  const n = conjunto.length;
  if (!n) return null;
  const below = conjunto.filter((v) => v <= valor).length;
  return red((below / n) * 100, 1);
}

export interface ResultadoValuacionSectorial {
  sector: string;
  etf: string | null;
  metricas: { avgTrailingPE: number | null; avgPriceToBook: number | null; totalMarketCap: number | null };
  solvencia: { averageSolvency: number | null; healthyCount: number; totalTickers: number; fragileSector: boolean | null };
  wacc: { averageWacc: number | null; averageSpread: number | null };
  tickers: Array<{
    ticker: string;
    price: number | null;
    marketCap: number | null;
    trailingPE: number | null;
    forwardPE: number | null;
    priceToBook: number | null;
    dividendYield: number | null;
    pePercentile: number | null;
    pbPercentile: number | null;
    solvency: number | null;
    healthy: boolean;
    wacc: number | null;
    roa: number | null;
    spread: number | null;
  }>;
  error: string | null;
}

export async function claValuacionSectorial(sector: string, _periodo = "1y"): Promise<ResultadoValuacionSectorial> {
  const etf = SECTOR_ETF_MAP[sector.trim()];
  if (!etf) return { sector, etf: null, error: `Sector "${sector}" no reconocido. Usar: ${Object.keys(SECTOR_ETF_MAP).join(", ")}` } as ResultadoValuacionSectorial;
  const tickerList = (SECTOR_TICKERS_FALLBACK[etf] ?? []).slice(0, 10);
  if (!tickerList.length) return { sector, etf, error: "Sin componentes para el sector" } as ResultadoValuacionSectorial;

  const fundamentals = new Map<string, FundSectorial>();
  await Promise.all(
    tickerList.map(async (t) => {
      try {
        fundamentals.set(t, await fundamentosTicker(t));
      } catch {
        fundamentals.set(t, { errores: `No data for ${t}` } as FundSectorial);
      }
    }),
  );

  const peVals: number[] = [];
  const pbVals: number[] = [];
  const mcapVals: number[] = [];
  const waccData: Array<{ ticker: string; wacc: number; spread: number | null; roa: number }> = [];
  const solvencias: Array<{ ticker: string; solvency: number; healthy: boolean }> = [];

  for (const [t, f] of fundamentals) {
    if (f.errores) continue;
    if (f.trailingPE != null && f.trailingPE > 0) peVals.push(f.trailingPE);
    if (f.priceToBook != null && f.priceToBook > 0) pbVals.push(f.priceToBook);
    if (f.marketCap != null) mcapVals.push(f.marketCap);

    const ta = f.totalAssets;
    const td = f.totalDebt;
    if (ta != null && ta > 0) {
      const equity = td != null ? ta - td : ta;
      const solvency = ta > 0 ? equity / ta : 0;
      const roe = equity > 0 && f.netIncome != null ? f.netIncome / equity : 0;
      const mcap = f.marketCap;
      const ev = mcap && td ? mcap + td : ta;
      const eRatio = ev > 0 ? equity / ev : 1;
      const dRatio = td != null && ev > 0 ? td / ev : 0;
      const re = 0.045 + 1.0 * 0.055;
      const rd = 0.045 + 0.02;
      const tax = 0.25;
      const wacc = eRatio * re + dRatio * rd * (1 - tax);
      const roa = f.netIncome != null ? f.netIncome / ta : 0;
      waccData.push({
        ticker: t,
        wacc,
        roa,
        spread: wacc > 0 ? roa - wacc : null,
      });
      solvencias.push({ ticker: t, solvency, healthy: solvency >= 0.4 });
    }
  }

  const tickers = tickerList
    .filter((t) => fundamentals.get(t)?.errores == null)
    .map((t) => {
      const f = fundamentals.get(t)!;
      const w = waccData.find((x) => x.ticker === t);
      const s = solvencias.find((x) => x.ticker === t);
      return {
        ticker: t,
        price: f.price,
        marketCap: f.marketCap,
        trailingPE: f.trailingPE,
        forwardPE: f.forwardPE,
        priceToBook: f.priceToBook,
        dividendYield: f.dividendYield,
        pePercentile: percentilDe(f.trailingPE, peVals),
        pbPercentile: percentilDe(f.priceToBook, pbVals),
        solvency: s ? red(s.solvency, 4) : null,
        healthy: s?.healthy ?? false,
        wacc: w ? red(w.wacc, 4) : null,
        roa: w ? red(w.roa, 4) : null,
        spread: w ? red(w.spread, 4) : null,
      };
    });

  const avgPe = peVals.length ? red(media(peVals), 2) : null;
  const avgPb = pbVals.length ? red(media(pbVals), 2) : null;
  const totalMcap = mcapVals.length ? red(mcapVals.reduce((a, b) => a + b, 0), 2) : null;
  const avgSolvency = solvencias.length ? red(media(solvencias.map((s) => s.solvency)), 4) : null;
  const healthyCount = solvencias.filter((s) => s.healthy).length;
  const avgWacc = waccData.length ? red(media(waccData.map((w) => w.wacc)), 4) : null;
  const spreads = waccData.map((w) => w.spread).filter((v): v is number => v != null);
  const avgSpread = spreads.length ? red(media(spreads), 4) : null;

  return {
    sector: sector.trim(),
    etf,
    metricas: { avgTrailingPE: avgPe, avgPriceToBook: avgPb, totalMarketCap: totalMcap },
    solvencia: {
      averageSolvency: avgSolvency,
      healthyCount,
      totalTickers: tickers.length,
      fragileSector: avgSolvency != null ? avgSolvency < 0.4 : null,
    },
    wacc: { averageWacc: avgWacc, averageSpread: avgSpread },
    tickers: tickers.filter((x) => x.price != null || x.trailingPE != null).slice(0, 10),
    error: null,
  };
}

// ───────────────────────────── Formateo de texto ─────────────────────────────

const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function toUSD(v: number | null | undefined, moneda?: string | null): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${moneda === "ARS" ? "ARS " : "USD "}${nf0.format(v)}`;
}

export function textoCuantitativo(r: ResultadoCuantitativo): string {
  const L: string[] = [];
  L.push(`Métricas cuantitativas de ${r.empresa} (${r.ticker}):`);
  L.push(`- Ingresos netos: ${toUSD(r.metricas.M1_ingresos_netos)}`);
  L.push(`- EBITDA: ${toUSD(r.metricas.M2_ebitda)}`);
  L.push(`- Resultado neto: ${toUSD(r.metricas.M3_resultado_neto)}`);
  L.push(`- EPS: ${r.metricas.M4_eps != null ? r.metricas.M4_eps.toFixed(2) : "s/d"}`);
  L.push(
    `- Margen EBITDA: ${r.metricas.M5_margen_ebitda != null ? (r.metricas.M5_margen_ebitda * 100).toFixed(1) + "%" : "s/d"} · Margen neto: ${r.metricas.M6_margen_neto != null ? (r.metricas.M6_margen_neto * 100).toFixed(1) + "%" : "s/d"}`,
  );
  L.push(
    `- ROE: ${r.metricas.M12_roe != null ? (r.metricas.M12_roe * 100).toFixed(1) + "%" : "s/d"} · ROA: ${r.metricas.M13_roa != null ? (r.metricas.M13_roa * 100).toFixed(1) + "%" : "s/d"}`,
  );
  L.push(
    `- Deuda financiera neta: ${toUSD(r.metricas.M10_deuda_financiera_neta)} · Deuda/EBITDA: ${r.metricas.M14_deuda_ebitda != null ? r.metricas.M14_deuda_ebitda.toFixed(2) + "x" : "s/d"}`,
  );
  L.push(
    `- Capital de trabajo: ${toUSD(r.metricas.M11_capital_trabajo)} · P/E: ${r.metricas.M15_pe != null ? r.metricas.M15_pe.toFixed(2) : "s/d"}`,
  );
  if (r.metricas.ev_ebitda != null) L.push(`- EV/EBITDA: ${r.metricas.ev_ebitda.toFixed(2)}`);
  if (r.alertas.rojas.length) {
    L.push(`\nAlertas ROJAS (${r.alertas.total_rojas}):`);
    for (const al of r.alertas.rojas) L.push(`- 🔴 ${al}`);
  }
  if (r.alertas.amarillas.length) {
    L.push(`\nAlertas amarillas (${r.alertas.total_amarillas}):`);
    for (const al of r.alertas.amarillas) L.push(`- 🟡 ${al}`);
  }
  if (!r.alertas.rojas.length && !r.alertas.amarillas.length) L.push(`\nSin alertas de riesgo detectadas.`);
  L.push(`\nPrecio actual: ${toUSD(r.precio_actual)} · Cap. de mercado: ${toUSD(r.market_cap)}`);
  return L.join("\n");
}

export function textoCualitativo(r: ResultadoCualitativo): string {
  const nom = { modelo_negocio: "Modelo de negocio", management: "Management", ventaja_competitiva: "Ventaja competitiva", gobierno_corporativo: "Gobierno corporativo", porter: "Porter (5 fuerzas)" } as Record<string, string>;
  const L: string[] = [`Score cualitativo de ${r.empresa} (${r.ticker}) — sector: ${r.sector || "s/d"} / ${r.industry || "s/d"}:`];
  for (const k of Object.keys(r.dimensiones)) {
    const dim = r.dimensiones[k]!;
    L.push(`- ${nom[k] ?? k}: ${dim.score.toFixed(1)}/10 (peso ${(dim.peso * 100).toFixed(0)}%)`);
  }
  L.push(`\nScore total ponderado: ${r.score_total.toFixed(2)}/10`);
  L.push(
    r.continuar
      ? `-> Círculo de competencia: SI. Score >= 5.0 — EL ANÁLISIS CUANTITATIVO ESTÁ HABILITADO.`
      : `-> Círculo de competencia: SI. Score < 5.0 — ANÁLISIS BLOQUEADO (no comprar lo que no se entiende).`,
  );
  return L.join("\n");
}

export function textoWacc(r: ResultadoWacc): string {
  const L: string[] = [];
  L.push(`WACC de ${r.ticker} (CAPM + riesgo país):`);
  L.push(`- RF UST 10Y: ${r.rf_ust_10y != null ? r.rf_ust_10y.toFixed(2) + "%" : "s/d"} · Beta: ${(r.beta ?? 1).toFixed(2)} vs ${r.benchmark} · Prima mercado: ${r.prima_riesgo_mercado.toFixed(1)}%`);
  L.push(`- Riesgo país: ${r.riesgo_pais_pct != null ? r.riesgo_pais_pct.toFixed(2) + "%" : "s/d"} · Size premium: ${r.size_premium.toFixed(2)}%`);
  L.push(`- Ke (CAPM): ${r.ke_capm != null ? r.ke_capm.toFixed(2) + "%" : "s/d"} · Kd: ${r.kd != null ? r.kd.toFixed(2) + "%" : "s/d"} · Impuestos: ${(r.tasa_impositiva * 100).toFixed(0)}%`);
  L.push(`- Pesos E/D: ${(r.peso_equity ?? 0).toFixed(2)} / ${(r.peso_deuda ?? 0).toFixed(2)}`);
  L.push(`- WACC USD: ${r.wacc_usd != null ? r.wacc_usd.toFixed(2) + "%" : "s/d"}`);
  if (r.wacc_nominal_ars != null) L.push(`- Devaluación esperada anual: ${r.devaluacion_esperada_anual?.toFixed(2) ?? "s/d"}% · WACC nominal ARS: ${r.wacc_nominal_ars.toFixed(2)}%`);
  return L.join("\n");
}

export function textoDcf(r: ResultadoDcf): string {
  const L: string[] = [];
  L.push(`DCF por proyección de márgenes de ${r.ticker} · WACC ${r.wacc_usado.toFixed(2)}% · g corto ${r.g_corto.toFixed(2)}% → g largo ${r.g_largo.toFixed(2)}%`);
  for (const p of r.proyecciones) {
    L.push(`- Año ${p.año}: ${toUSD(p.ingresos)} ingresos · ${toUSD(p.fcff)} FCFF (crec. ${p.crecimiento.toFixed(1)}%)`);
  }
  L.push(`- Valor terminal: ${toUSD(r.valor_terminal)} · Enterprise Value: ${toUSD(r.enterprise_value)}`);
  L.push(`- Equity Value: ${toUSD(r.equity_value)} (deuda neta ${toUSD(r.deuda_neta)})`);
  L.push(`- Valor intrínseco: ${toUSD(r.valor_intrinseco)} vs precio ${toUSD(r.precio_actual)}`);
  L.push(`- Margen de seguridad: ${r.margen_seguridad_pct != null ? r.margen_seguridad_pct.toFixed(1) + "%" : "s/d"} -> ${r.decision}`);
  return L.join("\n");
}

export function textoMultiples(r: ResultadoMultiples): string {
  const L: string[] = [];
  L.push(`Valuación por múltiplos de ${r.ticker} (${r.sector || "s/d"} / ${r.industry || "s/d"}):`);
  L.push(`- EV/EBITDA: ${r.ev_ebitda != null ? r.ev_ebitda.toFixed(2) : "s/d"} · P/E: ${r.pe != null ? r.pe.toFixed(2) : "s/d"} · P/BV: ${r.pbv != null ? r.pbv.toFixed(2) : "s/d"} · EV/Revenue: ${r.ev_revenue != null ? r.ev_revenue.toFixed(2) : "s/d"}`);
  L.push(`- Medianas sectoriales proxy: EV/EBITDA ${r.multiples_sector.ev_ebitda}, P/E ${r.multiples_sector.pe}, P/BV ${r.multiples_sector.pbv}, EV/Rev ${r.multiples_sector.ev_revenue}`);
  L.push(`- Valor intrínseco por múltiplos: ${toUSD(r.valor_intrinseco_multi)}${r.rango_multi ? ` (rango ${toUSD(r.rango_multi.min)}–${toUSD(r.rango_multi.max)})` : ""}`);
  return L.join("\n");
}

export function textoBookValue(r: ResultadoBookValue): string {
  const L: string[] = [];
  L.push(`Valor libro ajustado + APV de ${r.ticker}:`);
  L.push(`- Valor libro: ${toUSD(r.valor_libro)} · por acción: ${toUSD(r.valor_libro_por_accion)} · P/BV: ${r.ratio_precio_valor_libro != null ? r.ratio_precio_valor_libro.toFixed(2) : "s/d"}`);
  if (r.senal_subvaluacion) L.push(`- ${r.senal_subvaluacion}`);
  L.push(`- APV: ${toUSD(r.apv)} = VAN unlevered ${toUSD(r.van_unlevered)} + PV(escudo fiscal) ${toUSD(r.pv_tax_shield)}`);
  L.push(`- Valor intrínseco APV: ${toUSD(r.valor_intrinseco_apv)}`);
  return L.join("\n");
}

export function textoTriangulacion(r: ResultadoTriangulacion): string {
  const L: string[] = [];
  L.push(`Triangulación de valoración de ${r.ticker} (perfil: ${r.perfil}):`);
  L.push(`- DCF: ${toUSD(r.valor_dcf)} · Múltiplos: ${toUSD(r.valor_multi)} · Valor libro: ${toUSD(r.valor_libro)}`);
  L.push(`- Pesos aplicados: DCF ${(r.pesos.dcf * 100).toFixed(0)}% / Múltiplos ${(r.pesos.multi * 100).toFixed(0)}% / Libro ${(r.pesos.book * 100).toFixed(0)}%`);
  L.push(`- Valor intrínseco ponderado: ${toUSD(r.valor_intrinseco_ponderado)}${r.rango_final ? ` · Rango ${toUSD(r.rango_final.min)}–${toUSD(r.rango_final.max)}` : ""}`);
  L.push(`- Margen de seguridad: ${r.margen_seguridad_pct != null ? r.margen_seguridad_pct.toFixed(1) + "%" : "s/d"} -> ${r.decision_final}`);
  return L.join("\n");
}

export function textoFicha(r: ResultadoFicha): string {
  const L: string[] = [];
  L.push(`FICHA DE DECISIÓN — ${r.empresa} (${r.ticker}) — ${r.fecha}`);
  L.push(`Precio actual: ${toUSD(r.precio_actual)}`);
  L.push(`\nCapa 1 · MACRO: régimen ${r.macro.score_macro} · riesgo país ${r.macro.riesgo_pais_bps != null ? r.macro.riesgo_pais_bps.toFixed(0) + "bps" : "s/d"} · tasa libre local ${r.macro.tasa_libre_riesgo_local != null ? r.macro.tasa_libre_riesgo_local.toFixed(2) + "%" : "s/d"}`);
  L.push(`\nCapa 3 · CUALITATIVO: ${r.cualitativo.score_total.toFixed(2)}/10 (${r.cualitativo.continuar ? "habilitado" : "BLOQUEADO"})`);
  for (const k of Object.keys(r.cualitativo.dimensiones)) {
    const dim = r.cualitativo.dimensiones[k]!;
    L.push(`  - ${k.replace(/_/g, " ")}: ${dim.score.toFixed(1)}`);
  }
  L.push(`\nCapa 4 · CUANTITATIVO:`);
  L.push(`  - ROE ${r.cuantitativo.metricas.M12_roe != null ? (r.cuantitativo.metricas.M12_roe * 100).toFixed(1) + "%" : "s/d"} · margen neto ${r.cuantitativo.metricas.M6_margen_neto != null ? (r.cuantitativo.metricas.M6_margen_neto * 100).toFixed(1) + "%" : "s/d"} · Deuda/EBITDA ${r.cuantitativo.metricas.M14_deuda_ebitda != null ? r.cuantitativo.metricas.M14_deuda_ebitda.toFixed(2) + "x" : "s/d"} · P/E ${r.cuantitativo.metricas.M15_pe != null ? r.cuantitativo.metricas.M15_pe.toFixed(2) : "s/d"}`);
  if (r.cuantitativo.alertas.rojas.length) L.push(`  - ${r.cuantitativo.alertas.total_rojas} alerta(s) ROJA(s): ${r.cuantitativo.alertas.rojas.join(" · ")}`);
  L.push(`\nCapa 5 · WACC: ${r.wacc.wacc_usd != null ? r.wacc.wacc_usd.toFixed(2) + "%" : "s/d"} (Ke ${r.wacc.ke != null ? r.wacc.ke.toFixed(2) + "%" : "s/d"} · Kd ${r.wacc.kd != null ? r.wacc.kd.toFixed(2) + "%" : "s/d"} · beta ${r.wacc.beta?.toFixed(2) ?? "s/d"})`);
  L.push(`\nCapa 6-9 · VALUACIÓN:`);
  L.push(`  - DCF: ${toUSD(r.valuacion.vi_dcf)} · Múltiplos: ${toUSD(r.valuacion.vi_multi)} · Libro: ${toUSD(r.valuacion.vi_libro)}`);
  L.push(`  - Valor central ponderado: ${toUSD(r.valuacion.vi_central)} · perfil ${r.valuacion.perfil}${r.valuacion.rango ? ` · rango ${toUSD(r.valuacion.rango.min)}–${toUSD(r.valuacion.rango.max)}` : ""}`);
  L.push(`\nPaso 10 · MARGEN DE SEGURIDAD calibrado: MOS ${r.margen_seguridad.mos_aplicado_pct.toFixed(0)}%`);
  L.push(`  - Precio máximo de entrada: ${toUSD(r.margen_seguridad.precio_max_entrada)} · target: ${toUSD(r.margen_seguridad.precio_target)} · upside: ${r.margen_seguridad.upside_pct != null ? r.margen_seguridad.upside_pct.toFixed(1) + "%" : "s/d"}`);
  L.push(`\nDECISIÓN FINAL: ${r.decision_final}`);
  if (r.bloqueado_por_cualitativo) L.push(`(Bloqueado por score cualitativo insuficiente.)`);
  if (r.notas_consistencia.length) {
    L.push(`\nNotas de consistencia:`);
    for (const n of r.notas_consistencia) L.push(`- ${n}`);
  }
  return L.join("\n");
}

export function textoMacro(r: ResultadoMacro): string {
  const L: string[] = [];
  L.push(`Contexto macro (${new Date(r.timestamp).toLocaleString("es-AR")}):`);
  L.push(`- Régimen: ${r.regimen_macro} (score ${r.score_macro})`);
  L.push(`- Inflación mensual: ${r.inflacion_mensual != null ? r.inflacion_mensual.toFixed(2) + "%" : "s/d"} · Riesgo país: ${r.riesgo_pais != null ? r.riesgo_pais.toFixed(0) + "bps" : "s/d"}`);
  L.push(`- Tasa pasiva BCRA: ${r.tasa_pasiva != null ? r.tasa_pasiva.toFixed(2) + "%" : "s/d"} · Tasa real Fisher (mensual): ${r.tasa_real_mensual_fisher != null ? r.tasa_real_mensual_fisher.toFixed(2) + "%" : "s/d"}`);
  const dol = (label: string, v: { compra: number | null; venta: number | null } | null) =>
    `  - ${label}: ${v?.compra != null ? "$" + v.compra.toFixed(2) : "s/d"} / ${v?.venta != null ? "$" + v.venta.toFixed(2) : "s/d"}`;
  L.push(`Dólares (compra/venta):`);
  L.push(dol("Oficial", r.dolar_oficial));
  L.push(dol("Blue", r.dolar_blue));
  L.push(dol("MEP", r.dolar_mep));
  L.push(dol("CCL", r.dolar_ccl));
  L.push(`- Spread soberano implícito: ${r.spread_soberano != null ? r.spread_soberano.toFixed(2) : "s/d"} · Tasa libre local: ${r.tasa_libre_riesgo_local != null ? r.tasa_libre_riesgo_local.toFixed(2) + "%" : "s/d"}`);
  if (r.senal_regimen.length) L.push(`\nSeñales de régimen:\n${r.senal_regimen.map((s) => `- ${s}`).join("\n")}`);
  return L.join("\n");
}

export function textoCiclo(r: ResultadoCiclo): string {
  const L: string[] = [];
  L.push(`Ciclo económico intermarket (Pring/Stovall 6-stage):`);
  L.push(`ETAPA ${r.stage} — ${r.label} (${r.categoria})`);
  L.push(`\nActivos favorecidos: ${r.activosFavorecidos.join(", ")}`);
  L.push(`Sectores favorecidos: ${r.sectoresFavorecidos.join(", ")}`);
  L.push(`Riesgos: ${r.riesgos.join(" · ")}`);
  L.push(`\nRatios intermarket (200d):`);
  for (const [k, v] of Object.entries(r.ratios)) {
    L.push(`- ${k}: ratio ${v.ratio ?? "s/d"} · MA200 ${v.ma200 ?? "s/d"} · pendiente ${v.slope ?? "s/d"} — ${v.trend}`);
  }
  return L.join("\n");
}

export function textoPerformanceSectorial(r: ResultadoPerformanceSectorial): string {
  const L: string[] = [`Performance sectorial EE.UU. (${r.period}):`];
  for (const it of r.items) {
    L.push(`- ${it.sector} (${it.etf}): ${it.changePercent != null ? (it.changePercent >= 0 ? "+" : "") + it.changePercent.toFixed(2) + "%" : "s/d"} · precio ${toUSD(it.currentPrice)}${it.trendScore === 1 ? " · tendencia +" : it.trendScore === -1 ? " · tendencia -" : ""}`);
  }
  return L.join("\n");
}

export function textoValuacionSectorial(r: ResultadoValuacionSectorial): string {
  if (r.error) return `SIN RESULTADOS: ${r.error}`;
  const L: string[] = [];
  L.push(`Valuación sectorial — ${r.sector} (${r.etf}):`);
  L.push(`- P/E promedio: ${r.metricas.avgTrailingPE != null ? r.metricas.avgTrailingPE.toFixed(1) : "s/d"} · P/BV promedio: ${r.metricas.avgPriceToBook != null ? r.metricas.avgPriceToBook.toFixed(1) : "s/d"} · Cap total: ${toUSD(r.metricas.totalMarketCap)}`);
  L.push(`- WACC promedio estimado: ${r.wacc.averageWacc != null ? (r.wacc.averageWacc * 100).toFixed(1) + "%" : "s/d"} · Spread (ROA-WACC): ${r.wacc.averageSpread != null ? (r.wacc.averageSpread * 100).toFixed(1) + "%" : "s/d"}`);
  L.push(`- Solvencia promedio: ${r.solvencia.averageSolvency != null ? (r.solvencia.averageSolvency * 100).toFixed(1) + "%" : "s/d"} · saludables: ${r.solvencia.healthyCount}/${r.solvencia.totalTickers}${r.solvencia.fragileSector ? " · SECTOR FRÁGIL (<40%)" : ""}`);
  L.push(`\nTickers:`);
  for (const t of r.tickers) {
    L.push(`- ${t.ticker}: P/E ${t.trailingPE != null ? t.trailingPE.toFixed(1) : "s/d"} (pct ${t.pePercentile ?? "s/d"}) · P/BV ${t.priceToBook != null ? t.priceToBook.toFixed(1) : "s/d"} (pct ${t.pbPercentile ?? "s/d"}) · solvencia ${t.solvency != null ? (t.solvency * 100).toFixed(0) + "%" : "s/d"} · WACC ${t.wacc != null ? (t.wacc * 100).toFixed(1) + "%" : "s/d"}`);
  }
  return L.join("\n");
}