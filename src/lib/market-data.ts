/** Datos de mercado con datos reales de Yahoo Finance (wrapper sobre `yahoo-http`).
 *  Funciona en Node (tests y server functions); no depende de TanStack Start. */

import { fetchYahooChart, fetchYahooQuoteSummaryJson, fetchYahooSearch } from "./yahoo-http";
import type { QuoteSummaryResult, FinancialStatementRow } from "./yahoo-types";
import { computeBeta, returns, ultimoCierre } from "./stats";
import { obtenerFundamentalesFinviz, obtenerForecastAnalistas } from "./fundamentals-fallback";

export interface Fundamentales {
  symbol: string;
  nombre: string | null;
  precio: number | null;
  moneda: string | null;
  fechaDatos: string | null;
  marketCap: number | null;
  fcf: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  beta: number | null;
  betaR2: number | null;
  benchmark: string | null;
  betaMuestras: number | null;
  deudaNeta: number | null;
  deudaTotal: number | null;
  cajaTotal: number | null;
  deudaBrutaTotal: number | null;
  accionesCirculacion: number | null;
  rd: number | null;
  sector: string | null;
  industria: string | null;
  ebitda: number | null;
  targetMeanPrice: number | null;
  numeroAnalistas: number | null;
  esEmergente: boolean | null;
  origen: string | null;
  error: string | null;
}

export interface SeriePrecios {
  symbol: string;
  closes: number[];
  fechas: string[];
  rango: string;
  error: string | null;
}

export interface CreimientoAnalistas {
  symbol: string;
  crecimientoActual: number | null;
  crecimientoAnoProximo: number | null;
  numeroAnalistas: number | null;
  targetMeanPrice: number | null;
  error: string | null;
}

const MODULOS_FUNDAMENTALES = [
  "assetProfile",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
  "price",
  "cashflowStatementHistory",
  "balanceSheetHistory",
  "incomeStatementHistory",
  "earningsTrend",
];

const FORMATO_FECHA = new Intl.DateTimeFormat("es-AR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function hoyIso(): string {
  return FORMATO_FECHA.format(new Date());
}

function numero(o: unknown): number | null {
  if (typeof o === "number" && isFinite(o)) return o;
  if (o && typeof o === "object" && "raw" in (o as object)) {
    const raw = (o as { raw?: unknown }).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
  }
  return null;
}

function valorEnEstado(
  rows: FinancialStatementRow[] | undefined,
  ...claves: string[]
): number | null {
  if (!rows?.length) return null;
  const fila = rows[0];
  if (!fila) return null;
  for (const k of claves) {
    const v = numero(fila[k]);
    if (v != null) return v;
    // algunos campos llegan como número directo dentro del objeto
    if (typeof fila[k] === "number") return fila[k] as number;
  }
  return null;
}

interface YQuoteSummaryEnvelope {
  quoteSummary?: {
    result?: QuoteSummaryResult[];
    error?: { description?: string } | null;
  };
}

/** Extrae el FCF del estado de flujos (fila "Free Cash Flow") cuando el módulo
 *  financialData no lo trae. */
function fcfDesdeEstado(r: QuoteSummaryResult | undefined): number | null {
  const rows = r?.cashflowStatementHistory?.cashflowStatements ?? [];
  const directo = valorEnEstado(rows, "Free Cash Flow", "freeCashFlow");
  if (directo != null) return directo;
  const op = valorEnEstado(
    rows,
    "Operating Cash Flow",
    "totalCashFromOperatingActivities",
    "netIncomeFromContinuingOperations",
  );
  const cap = valorEnEstado(
    rows,
    "Capital Expenditure",
    "capitalExpenditures",
    "capitalExpenditure",
  );
  if (op != null && cap != null) return op + cap; // cap suele venir negativo
  return null;
}

function deudaTotales(r: QuoteSummaryResult | undefined): {
  deudaTotal: number | null;
  cajaTotal: number | null;
  deudaBrutaTotal: number | null;
} {
  const rows = r?.balanceSheetHistory?.balanceSheetStatements ?? [];
  const deudaTotal = valorEnEstado(rows, "Total Debt", "totalDebt");
  const deudaBrutaTotal = valorEnEstado(rows, "Long Term Debt", "longTermDebt");
  const cajaTotal = valorEnEstado(
    rows,
    "Cash And Cash Equivalents",
    "cashAndCashEquivalents",
    "Cash",
  );
  return { deudaTotal, cajaTotal, deudaBrutaTotal };
}

function costoDeuda(r: QuoteSummaryResult | undefined, deudaTotal: number | null): number | null {
  if (!deudaTotal || deudaTotal <= 0) return null;
  const rows = r?.incomeStatementHistory?.incomeStatementHistory ?? [];
  const interes = valorEnEstado(rows, "Interest Expense", "Net Interest Income");
  if (interes != null && Math.abs(interes) > 0 && deudaTotal > 0) {
    const rd = Math.abs(interes) / deudaTotal;
    return rd > 0 && rd < 0.5 ? rd : null;
  }
  return null;
}

function esEmergentePorSitio(symbol: string, r: QuoteSummaryResult | undefined): boolean {
  const s = symbol.toUpperCase();
  if (s.endsWith(".BA") || s.endsWith(".MX") || s.endsWith(".SA") || s.endsWith(".BV")) return true;
  const moneda = r?.price?.currency ?? r?.summaryDetail?.currency ?? null;
  if (moneda && moneda !== "USD") return true;
  const pais = r?.assetProfile?.country ?? null;
  if (
    pais &&
    !/united states|united kingdom|germany|japan|canada|france|switzerland|netherlands|sweden|australia/i.test(
      pais,
    )
  ) {
    return true;
  }
  return false;
}

/** Fundamentales de un símbolo (+ beta calculada 3 años vs SPY/MERVAL y RF).
 *  Fuente primaria: Yahoo quoteSummary. Si Yahoo está bloqueado/limitado,
 *  cae a Finviz snapshot (FCF vía P/FCF, deuda vía Debt/Eq, caja vía Cash/sh). */
export async function obtenerFundamentales(simbolo: string): Promise<Fundamentales> {
  const out: Fundamentales = {
    symbol: simbolo,
    nombre: null,
    precio: null,
    moneda: null,
    fechaDatos: hoyIso(),
    marketCap: null,
    fcf: null,
    revenueGrowth: null,
    earningsGrowth: null,
    beta: null,
    betaR2: null,
    benchmark: null,
    betaMuestras: null,
    deudaNeta: null,
    deudaTotal: null,
    cajaTotal: null,
    deudaBrutaTotal: null,
    accionesCirculacion: null,
    rd: null,
    sector: null,
    industria: null,
    ebitda: null,
    targetMeanPrice: null,
    numeroAnalistas: null,
    esEmergente: null,
    origen: null,
    error: null,
  };
  try {
    // Precios del activo y benchmarks para beta SIEMPRE (chart no requiere crumb).
    const [spy, merv, propios] = await Promise.all([
      fetchYahooChart("SPY", "3y", "1d"),
      fetchYahooChart("^MERV", "3y", "1d"),
      fetchYahooChart(simbolo, "3y", "1d"),
    ]);
    const closesPropios = propios?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const closesSpy = spy?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const closesMerv = merv?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];

    let resp: YQuoteSummaryEnvelope | null = null;
    let respStatus = 0;
    try {
      const res = await fetchYahooQuoteSummaryJson<YQuoteSummaryEnvelope>(
        simbolo,
        MODULOS_FUNDAMENTALES,
      );
      respStatus = res.status;
      resp = res.json;
    } catch {
      resp = null; // sesión/crumb de Yahoo falló (bloqueado/limitado)
    }
    const r = resp?.quoteSummary?.result?.[0];
    if (r && resp?.quoteSummary?.error == null) {
      out.nombre = r.price?.longName ?? r.price?.shortName ?? null;
      out.precio = numero(r.financialData?.currentPrice) ?? numero(r.price?.regularMarketPrice);
      out.moneda = r.price?.currency ?? r.summaryDetail?.currency ?? null;
      out.marketCap = numero(r.price?.marketCap);
      out.fcf = numero(r.financialData?.freeCashflow) ?? fcfDesdeEstado(r);
      out.revenueGrowth = numero(r.financialData?.revenueGrowth);
      out.earningsGrowth = numero(r.financialData?.earningsGrowth);
      out.ebitda = null;
      {
        const ev = numero(r.defaultKeyStatistics?.enterpriseValue);
        const evEbitda = numero(r.defaultKeyStatistics?.enterpriseToEbitda);
        if (ev != null && evEbitda != null && evEbitda !== 0) out.ebitda = ev / evEbitda;
      }
      out.sector = r.assetProfile?.sector ?? null;
      out.industria = r.assetProfile?.industry ?? null;
      out.targetMeanPrice = numero(r.financialData?.targetMeanPrice);
      out.numeroAnalistas = numero(r.financialData?.numberOfAnalystOpinions);
      out.accionesCirculacion =
        numero(r.defaultKeyStatistics?.sharesOutstanding) ??
        numero(r.summaryDetail?.sharesOutstanding) ??
        (out.marketCap && out.precio ? out.marketCap / out.precio : null);

      const { deudaTotal, cajaTotal, deudaBrutaTotal } = deudaTotales(r);
      out.deudaTotal = deudaTotal ?? numero(r.financialData?.totalDebt);
      out.deudaBrutaTotal = deudaBrutaTotal;
      out.cajaTotal = cajaTotal ?? numero(r.financialData?.totalCash);
      if (out.deudaTotal != null && out.cajaTotal != null) {
        out.deudaNeta = out.deudaTotal - out.cajaTotal;
      }
      out.rd = costoDeuda(r, out.deudaTotal);
      out.esEmergente = esEmergentePorSitio(simbolo, r);
      out.origen = "Yahoo Finance (quoteSummary)";
    } else if (!r) {
      // Yahoo bloqueado/limitado o sin resultado → fallback Finviz.
      const fin = await obtenerFundamentalesFinviz(simbolo);
      if (!fin || (fin.precio == null && fin.marketCap == null)) {
        out.error = `No pude obtener datos reales de ${simbolo}: Yahoo ${respStatus || "auth block"}${resp?.quoteSummary?.error?.description ? ` (${resp.quoteSummary.error.description})` : ""} y sin fuente alternativa disponible.`;
        return out;
      }
      out.nombre = fin.nombre;
      out.precio = fin.precio;
      out.moneda = fin.moneda;
      out.marketCap = fin.marketCap;
      out.fcf = fin.fcf;
      out.revenueGrowth = fin.revenueGrowth;
      out.earningsGrowth = fin.earningsGrowth;
      out.ebitda = fin.ebitda;
      out.deudaTotal = fin.deudaTotal;
      out.cajaTotal = fin.cajaTotal;
      if (out.deudaTotal != null && out.cajaTotal != null) {
        out.deudaNeta = out.deudaTotal - out.cajaTotal;
      }
      out.accionesCirculacion = fin.accionesCirculacion;
      out.sector = fin.sector;
      out.industria = fin.industria;
      out.esEmergente = fin.esEmergente;
      out.origen = "Finviz (snapshot) + chart Yahoo";
      if (fin.beta != null) {
        out.beta = fin.beta;
        out.benchmark = "Finviz";
      }
      if (out.moneda == null) out.moneda = "USD";
    } else {
      out.error = `Yahoo ${respStatus || "error"} o sin datos`;
      return out;
    }

    // Beta por regresión 3 años; fallback a beta de fuente (Yahoo o Finviz).
    if (closesPropios.length >= 60) {
      const nb = computeBeta(
        closesPropios.filter((c): c is number => typeof c === "number"),
        closesSpy.filter((c): c is number => typeof c === "number"),
        closesMerv.filter((c): c is number => typeof c === "number"),
      );
      if (nb.beta != null) {
        out.beta = nb.beta;
        out.betaR2 = nb.r2;
        out.benchmark = nb.benchmark;
        out.betaMuestras = nb.muestras;
      }
    }
    if (out.beta == null && r) {
      const b = numero(r.defaultKeyStatistics?.beta);
      if (b != null) {
        out.beta = b;
        out.benchmark = "Yahoo (defaultKeyStatistics)";
      }
    }
    // Precio en vivo del chart como refinamiento cuando el snapshot es cierre anterior.
    const ultimoPrecioChart = propios?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
    if (ultimoPrecioChart != null && isFinite(ultimoPrecioChart) && ultimoPrecioChart > 0) {
      out.precio = ultimoPrecioChart;
    }
    return out;
  } catch (e) {
    out.error = e instanceof Error ? e.message : "error inesperado";
    return out;
  }
}

/** Histórico de precios de cierre de un símbolo. */
export async function obtenerHistoricoPrecios(
  simbolo: string,
  rango = "3y",
): Promise<SeriePrecios> {
  const out: SeriePrecios = { symbol: simbolo, closes: [], fechas: [], rango, error: null };
  try {
    const chart = await fetchYahooChart(simbolo, rango, "1d");
    const res = chart?.chart?.result?.[0];
    if (!res) {
      out.error = "sin datos de precios";
      return out;
    }
    const closes = res.indicators?.quote?.[0]?.close ?? [];
    out.closes = closes.filter((c): c is number => typeof c === "number");
    out.fechas = (res.timestamp ?? []).map((t) => {
      const d = new Date(t * 1000);
      return FORMATO_FECHA.format(d);
    });
    return out;
  } catch (e) {
    out.error = e instanceof Error ? e.message : "error";
    return out;
  }
}

/** Estimaciones de crecimiento de analistas (earningsTrend) y precio objetivo.
 *  Si Yahoo falla, cae a stockanalysis.com forecast (precio objetivo y nº analistas). */
export async function obtenerCrecimientoAnalistas(simbolo: string): Promise<CreimientoAnalistas> {
  const out: CreimientoAnalistas = {
    symbol: simbolo,
    crecimientoActual: null,
    crecimientoAnoProximo: null,
    numeroAnalistas: null,
    targetMeanPrice: null,
    error: null,
  };
  try {
    let r: QuoteSummaryResult | undefined;
    let errorDesc: string | null = null;
    try {
      const resp = await fetchYahooQuoteSummaryJson<YQuoteSummaryEnvelope>(simbolo, [
        "earningsTrend",
        "financialData",
      ]);
      r = resp.json?.quoteSummary?.result?.[0];
      errorDesc = resp.json?.quoteSummary?.error?.description ?? null;
    } catch {
      r = undefined; // auth de Yahoo bloqueado/limitado
    }
    if (r) {
      const trend = r.earningsTrend?.trend ?? [];
      const free = trend.filter((t) => !t.period?.includes("+q"));
      const c0 = free.find((t) => t.period === "0y");
      const c1 = free.find((t) => t.period === "+1y");
      out.crecimientoActual = numero(c0?.earningsEstimate?.growth);
      out.crecimientoAnoProximo = numero(c1?.earningsEstimate?.growth);
      out.numeroAnalistas = numero(c0?.earningsEstimate?.numberOfAnalysts);
      out.targetMeanPrice = numero(r.financialData?.targetMeanPrice);
      return out;
    }
    // Fallback a stockanalysis.com forecast.
    const fc = await obtenerForecastAnalistas(simbolo);
    if (fc) {
      out.targetMeanPrice = fc.targetMeanPrice;
      out.numeroAnalistas = fc.numeroAnalistas;
      return out;
    }
    out.error = errorDesc ?? "sin datos de analistas";
    return out;
  } catch (e) {
    out.error = e instanceof Error ? e.message : "error";
    return out;
  }
}

/** Resuelve una consulta (nombre o ticker) a un símbolo de Yahoo Finance.
 *  Mantiene tickers bien formados, y CEDEARs/consultas de nombre vía búsqueda. */
export async function resolverSimbolo(consulta: string): Promise<string | null> {
  const c = (consulta ?? "").trim();
  if (!c) return null;
  if (/^[A-Z0-9.\-^]+$/i.test(c)) {
    const upper = c.toUpperCase();
    if (/[A-Z0-9.]/i.test(upper)) return upper;
  }
  const resp = await fetchYahooSearch(c);
  const quotes = resp?.quotes ?? [];
  if (!quotes.length) return null;
  const sugiereArgentina =
    /galicia|banco|bbva|ypf|pampa|transener|alta|mirgor|cement|tcb|telecom|argentina/i.test(c);
  const equipos = quotes.filter((q) => q.quoteType === "EQUITY" && q.symbol);
  const eq = equipos.find((q) =>
    sugiereArgentina ? /\.BA$/.test(q.symbol ?? "") : !/\.\w{2}$/.test(q.symbol ?? ""),
  );
  return eq?.symbol ?? equipos[0]?.symbol ?? quotes[0]?.symbol ?? null;
}

export interface TasaLibreRiesgo {
  tasa: number;
  fuente: string;
  obtenida: boolean;
}

/** Tasa libre de riesgo: 10Y Treasury (^TNX) para US; para emergentes, default
 *  documentado de Bonar/referencia cuando no hay dato en vivo. */
export async function obtenerTasaLibreRiesgo(esEmergente: boolean): Promise<TasaLibreRiesgo> {
  try {
    const chart = await fetchYahooChart("^TNX", "5d", "1d");
    const closes = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const ultimo = ultimoCierre(closes);
    if (ultimo != null && isFinite(ultimo) && ultimo > 0) {
      const tasa = ultimo / 10;
      if (esEmergente) {
        return {
          tasa: tasa + 0.06,
          fuente: `10Y Treasury ${tasa.toFixed(2)}% + prima emergente 6pp (estimación)`,
          obtenida: true,
        };
      }
      return { tasa, fuente: "10Y Treasury (^TNX, Yahoo Finance)", obtenida: true };
    }
  } catch {
    /* fallo a default */
  }
  return {
    tasa: esEmergente ? 10.5 : 4.1,
    fuente: esEmergente
      ? "Default documentado: Bonar 2030 / tesoro emergente de referencia"
      : "Default documentado: 10Y Treasury de referencia",
    obtenida: false,
  };
}

/** Conveniencia: serie de retornos diarios de un símbolo. */
export async function obtenerReturnsHistoricos(simbolo: string, rango = "3y"): Promise<number[]> {
  const serie = await obtenerHistoricoPrecios(simbolo, rango);
  return returns(serie.closes);
}
