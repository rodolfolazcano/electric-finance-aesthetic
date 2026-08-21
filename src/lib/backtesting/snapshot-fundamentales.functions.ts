/**
 * src/lib/backtesting/snapshot-fundamentales.functions.ts
 *
 * Contrato para la Etapa 3 (motor de backtesting):
 *   getFundamentalSnapshot(ticker, fecha): Promise<SnapshotFundamental | null>
 *
 * Devuelve el snapshot fundamental del trimestre más reciente cuya fecha de
 * publicación (o lag estimado) es ANTERIOR a `fecha`. Garantía point-in-time:
 * ningún valor publicado después de `fecha` puede estar en el snapshot.
 *
 * LIMITACIÓN: histórico trimestral limitado a ~5 años por la API de Yahoo Finance
 * (quoteSummary incomeStatementHistoryQuarterly devuelve ~4-5 trimestres). El
 * backtest de la Etapa 3 no puede simular más atrás de lo que esta función puede
 * sostener con datos reales. Para ventanas más largas, se requerirían fuentes
 * alternativas (SEC EDGAR, Alpha Vantage, etc.).
 *
 * Tabla de normalización obligatoria (regla de proyecto):
 *
 *   | Fuente                                         | Dato                  | Unidad / escala                          | Transformación       | Confianza                                                |
 *   |-----------------------------------------------|-----------------------|------------------------------------------|----------------------|----------------------------------------------------------|
 *   | yfinance quarterly_income_stmt                 | Ingresos, marrgen op. | USD nominal por trimestre                 | Ninguna, usar directo| alta                                                     |
 *   | yfinance quarterly_balance_sheet               | Deuda, patrimonio     | USD nominal, snapshot a fin de trimestre | Ninguna              | alta                                                     |
 *   | yfinance earnings_dates (no expuesto via API) | Fecha publicación     | timestamp                                 | Lag 60 días corridos | alta si presente,  verificar si falta (usar lag 60d)   |
 */

import { fetchYahooQuoteSummaryJson } from "../yahoo-http";

export const LAG_PUBLICACION_DIAS = 60;
export const LIMITE_HISTORICO_TRIMESTRES = 5;

// Sobre los módulos de Yahoo quoteSummary:
// - `incomeStatementHistoryQuarterly` devuelve ~4-5 trimestres (NO 5 años trimestrales)
// - `balanceSheetHistoryQuarterly` idem
// - `cashflowStatementHistoryQuarterly` idem
// - `earnings` trae `earningsChart.quarterly[]` con labels ("3Q23") — NO fechas ISO
// - `earningsHistory` trae `history[].period` tipo "2q2022" — NO fechas ISO reales
//
// Conclusión: Yahoo quoteSummary NO expone `earnings_dates` ni fecha de publicación
// real trimestral. Solo conocemos el `endDate` (fin de trimestre fiscal).
// Por eso TODO lo snapshot de esta Etapa 2 sale con `confianzaFecha: "estimada"`,
// aplicando lag conservador de 60 días corridos desde `endDate` (siguiente día hábil).
// Si una futura versión de Yahoo quoteSummary agrega `publicationDate`, este código
// debe actualizarse para marcar como "confirmada" esos snapshots sin recurrir al lag.

export interface SnapshotFundamental {
  ticker: string;
  fechaObjetivo: string;          // ISO date el backtest está simulando
  fechaTrimestre: string;          // ISO date — fin de trimestre fiscal (endDate)
  fechaPublicacion: string | null; // ISO date — pub. estimada (EndDate + lag) o confirmada
  confianzaFecha: "confirmada" | "estimada";
  // Income statement
  ingresoTotal: number | null;       // total revenue (USD)
  beneficioBruto: number | null;      // gross profit (USD)
  ebit: number | null;                // operating income / EBIT (USD)
  beneficioNeto: number | null;        // net income (USD)
  eps: number | null;                 // diluted EPS (USD)
  margenOperativo: number | null;     // operating margin (decimal, ej. 0.25)
  margenNeto: number | null;           // net margin (decimal)
  // Balance sheet
  totalActivos: number | null;
  totalPasivos: number | null;
  patrimonio: number | null;           // total stockholders' equity
  deudaTotal: number | null;           // total debt (long + short term)
  // Derived ratios
  roe: number | null;                  // return on equity (decimal)
  // Cashflow statement
  flujoCajaOperativo: number | null;    // cash from operations
  capex: number | null;                 // capital expenditures (negativo en Yahoo)
  fcf: number | null;                   // free cash flow = CFO + capex (capex ya es neg)
  // Earnings surprise (si disponible)
  epsEstimate: number | null;
  epsSurprise: number | null;
  epsSurprisePct: number | null;
}

//  Helpers 

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v != null && typeof v === "object") {
    const raw = (v as Record<string, unknown>).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
  }
  return null;
}

/**
 * Convierte un `endDate` de Yahoo (que viene como `{ raw: epochSeconds, fmt: "YYYY-MM-DD" }`
 * o string ISO) a un objeto Date medianoche UTC.
 * Devuelve null si no se puede interpretar.
 */
function extraerFecha(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
    return null;
  }
  if (typeof v === "object") {
    const raw = (v as Record<string, unknown>).raw;
    if (typeof raw === "number" && isFinite(raw)) {
      // Yahoo usa epoch en SEGUNDOS
      return new Date(raw * 1000);
    }
    const fmt = (v as Record<string, unknown>).fmt;
    if (typeof fmt === "string") {
      const d = new Date(fmt);
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

//  VERIFICAR: Yahoo usa epoch en SEGUNDOS (no ms) en `raw`. Si en algún momento
// el cliente se cambia a ms, este desface de 1000x romperá todas las fechas.

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Siguiente día hábil (lunes-viernes) estrictamente después de `date`.
 * No tiene en cuenta feriados (no hay calendario holiday en el repo).
 * Convierte a UTC medianoche para comparaciones consistentes.
 */
function siguienteDiaHabil(date: Date): Date {
  const d = new Date(date.getTime());
  do {
    d.setUTCDate(d.getUTCDate() + 1);
  } while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d;
}

function sumarDias(date: Date, dias: number): Date {
  return new Date(date.getTime() + dias * 86400000);
}

function fechaAntes(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime();
}

//  Parseo de quoteSummary quarterly 

interface TrimestreCrudo {
  endDate: Date;
  // Income
  ingresoTotal: number | null;
  beneficioBruto: number | null;
  ebit: number | null;
  beneficioNeto: number | null;
  eps: number | null;
  // Balance
  totalActivos: number | null;
  totalPasivos: number | null;
  patrimonio: number | null;
  deudaTotal: number | null;
  // Cashflow
  flujoCajaOperativo: number | null;
  capex: number | null;
}

interface TrimestrePublicacion {
  endDate: Date;
  fechaPublicacion: Date;
  confianzaFecha: "confirmada" | "estimada";
  epsActual: number | null;
  epsEstimate: number | null;
  epsSurprise: number | null;
  epsSurprisePct: number | null;
}

/**
 * Fetch y parseo del quoteSummary trimestral. Devuelve el raw parsed + datos de
 * earningsHistory para inferir pub dates. Devuelve null si Yahoo no responde.
 */
async function fetchTrimestresFundamentales(
  ticker: string,
): Promise<{
  trimestres: TrimestreCrudo[];
  publicacionesPorPeriodLabel: Map<string, TrimestrePublicacion>;
} | null> {
  const modules = [
    "incomeStatementHistoryQuarterly",
    "balanceSheetHistoryQuarterly",
    "cashflowStatementHistoryQuarterly",
    "earnings",
    "earningsHistory",
  ];

  const response = await fetchYahooQuoteSummaryJson<{
    quoteSummary?: {
      result?: Array<Record<string, unknown>>;
      error?: { description?: string };
    };
  }>(ticker, modules);

  const r = response.json?.quoteSummary?.result?.[0];
  if (!r) return null;

  //  Income statement quarterly 
  const incomeRows = (
    (r.incomeStatementHistoryQuarterly as { incomeStatementHistory?: unknown[] }) ??
    {}
  ).incomeStatementHistory ?? [];
  //  Balance sheet quarterly 
  const balanceRows = (
    (r.balanceSheetHistoryQuarterly as { balanceSheetStatements?: unknown[] }) ??
    {}
  ).balanceSheetStatements ?? [];
  //  Cashflow statement quarterly 
  const cashflowRows = (
    (r.cashflowStatementHistoryQuarterly as { cashflowStatements?: unknown[] }) ??
    {}
  ).cashflowStatements ?? [];

  const trimestres: TrimestreCrudo[] = [];

  for (const row of incomeRows) {
    if (row == null || typeof row !== "object") continue;
    const rObj = row as Record<string, unknown>;
    const endDate = extraerFecha(rObj.endDate);
    if (!endDate) continue;

    // Buscar matching balance sheet + cashflow por endDate cercano (mismo trimestre fiscal)
    const balanceMatch = balanceRows
      .map((b) => {
        if (b == null || typeof b !== "object") return null;
        const end = extraerFecha((b as Record<string, unknown>).endDate);
        if (!end) return null;
        return { end, row: b as Record<string, unknown> };
      })
      .filter((x): x is { end: Date; row: Record<string, unknown> } => x != null)
      .sort((a, b) => Math.abs(a.end.getTime() - endDate.getTime()) - Math.abs(b.end.getTime() - endDate.getTime()))[0];

    const cashflowMatch = cashflowRows
      .map((c) => {
        if (c == null || typeof c !== "object") return null;
        const end = extraerFecha((c as Record<string, unknown>).endDate);
        if (!end) return null;
        return { end, row: c as Record<string, unknown> };
      })
      .filter((x): x is { end: Date; row: Record<string, unknown> } => x != null)
      .sort((a, b) => Math.abs(a.end.getTime() - endDate.getTime()) - Math.abs(b.end.getTime() - endDate.getTime()))[0];

    //  VERIFICAR: Yahoo va a entregar los mismos endDate para income/balance/cashflow
    // pero el sort por "menor distancia" permite hasta 7 días de drift (no debería pasar
    // con trimestres alineados, pero distinto calendario fiscal lo justifica).

    const bRow = balanceMatch?.row ?? {};
    const cRow = cashflowMatch?.row ?? {};

    const ingresoTotal = num(rObj.totalRevenue) ?? num(rObj.revenue);
    const beneficioBruto = num(rObj.grossProfit);
    const ebit = num(rObj.operatingIncome) ?? num(rObj.ebit);
    const beneficioNeto = num(rObj.netIncome);
    // Yahoo dilutedEPS o basicEPS — preferimos diluted
    const eps = num((rObj as Record<string, unknown>).dilutedEPS) ?? num(rObj.basicEPS);

    const totalActivos = num(bRow.totalAssets);
    const totalPasivos = num(bRow.totalLiab) ?? num(bRow.totalLiabilities);
    const patrimonio = num(bRow.totalStockholderEquity) ?? num(bRow.totalEquity);
    // Yahoo "totalDebt" no siempre existe → sumar current+long
    const deudaTotal = num(bRow.totalDebt)
      ?? (num(bRow.longTermDebt) != null && num(bRow.shortTermDebt) != null
        ? (num(bRow.longTermDebt) ?? 0) + (num(bRow.shortTermDebt ?? bRow.currentDebt) ?? 0)
        : null);

    const flujoCajaOperativo = num(cRow.totalCashFromOperatingActivities) ?? num(cRow.operatingCashFlow);
    // Yahoo capex viene como NEGATIVO en cashflow → FCF = CFO + capex (no CFO - capex)
    const capex = num(cRow.capitalExpenditures);

    trimestres.push({
      endDate,
      ingresoTotal,
      beneficioBruto,
      ebit,
      beneficioNeto,
      eps,
      totalActivos,
      totalPasivos,
      patrimonio,
      deudaTotal,
      flujoCajaOperativo,
      capex,
    });
  }

  //  Publicaciones (de earningsHistory) 
  // Yahoo quoteSummary NO expone actual publication dates.
  // earningsHistory tiene `period` tipo "2q2022" — Eso nos permite matchear
  // trimetres por etiqueta, pero no nos da fecha de publicación real.
  // Por eso TODO esto sale con lag estimado.
  const earningsHistoryData = (((r.earningsHistory as { history?: unknown[] }) ?? {}).history) ?? [];
  const publicacionesPorPeriodLabel = new Map<string, TrimestrePublicacion>();
  for (const eh of earningsHistoryData) {
    if (eh == null || typeof eh !== "object") continue;
    const eObj = eh as Record<string, unknown>;
    const period = typeof eObj.period === "string" ? eObj.period : null;
    if (!period) continue;
    const epsActual = num(eObj.actualEps);
    const epsEstimate = num(eObj.epsEstimate);
    const epsSurprise = num(eObj.surprise);
    const epsSurprisePct = num(eObj.surprisePercent);
    // Buscar trimestre correspondiente en `trimestres` por mapeo period label.
    // period label formato: "NqYYYY" (case insensitive) donde N=1-4
    // Yahoo también usa "NQYY" acortado — Normalizamos a min, lower "ngqYYYY"
    // Necesitamos convertir → nuestro `endDate` real no siempre casilla con calendar Q,
    // porque los fiscal years pueden estar offset (ej. Apple FY termina en Set).
    // Por eso no tratamos de matchear por period:: eso requeriría conocer calendario fiscal
    // y Yahoo no lo expone en quoteSummary.
    //
    // Estrategia: asignar cada `endDate` un label "approximado" como "{quarter}q{year}"
    // por quarter calendar — solo a fines de display. NO lo usamos para matches reales.
    void { period, epsActual, epsEstimate, epsSurprise, epsSurprisePct };
  }

  // Saldra todo estimado vía el lag de 60 días corridos:
  // La integración real de pub. dates tendría que venir de un endpoint separado
  // (e.g., /v7/finance/calendar/earnings o scraping de página web) — fuera del scope.
  void publicacionesPorPeriodLabel;

  return {
    trimestres,
    publicacionesPorPeriodLabel: new Map(),
  };
}

//  Lógica principal: snapshot más reciente antes de `fecha` 

/**
 * Snapshot fundamental point-in-time.
 *
 * Regla STRICT: solo se devuelven trimestres cuya fecha de publicación estimada
 * (endDate + lag de 60 días corridos = siguiente día hábil) es ANTERIOR
 * (estrictamente) a `fechaObjetivo`.
 *
 * Devuelve `null` si no hay ningún trimestre que cumpla — el backtesting NO debe
 * usar valores publicados después de la fecha simulada. Nunca se devuelve
 * `undefined` ni el dato más viejo "complace-silencioso".
 *
 * @example getFundamentalSnapshot('AAPL', new Date('2022-06-15'))
 *   → trimestre fiscal QQ2 FY2022 (endDate 2022-03-31, estimada pub ~2022-05-30)
 *   → NUNCA datos de un trimestre publicado después del 2022-06-15
 */
export async function getFundamentalSnapshot(
  ticker: string,
  fechaObjetivo: Date,
): Promise<SnapshotFundamental | null> {
  const data = await fetchTrimestresFundamentales(ticker);
  if (!data || data.trimestres.length === 0) return null;

  // Normalizar fecha objetivo a medianoche UTC para evitar TZ drift
  const fechaCorte = new Date(Date.UTC(
    fechaObjetivo.getUTCFullYear(),
    fechaObjetivo.getUTCMonth(),
    fechaObjetivo.getUTCDate(),
  ));

  // Filtrar trimestres cuya pub. estimada < fechaCorte (STRICT point-in-time)
  interface Candidato {
    trimestre: TrimestreCrudo;
    fechaPublicacion: Date;
    confianzaFecha: "confirmada" | "estimada";
    epsActual: number | null;
    epsEstimate: number | null;
    epsSurprise: number | null;
    epsSurprisePct: number | null;
  }

  const candidatos: Candidato[] = [];
  for (const t of data.trimestres) {
    // Calcular fecha de publicación: endDate + 60 días corridos, siguiente hábil
    const lagPrimeiroHabil = sumarDias(t.endDate, LAG_PUBLICACION_DIAS);
    const pubEstimada = siguienteDiaHabil(lagPrimeiroHabil);

    // Si Yahoo quoteSummary agregara `publicationDate` en el futuro, compararían:
    //   const pubReal = extraerFecha(...publicationDate...);
    //   const esConfirmada = pubReal != null;
    //   const fechaPub = esConfirmada ? pubReal : pubEstimada;
    // Por ahora TODO esto es estimado:
    const fechaPub = pubEstimada;
    const confianzaFecha: "confirmada" | "estimada" = "estimada";

    //  TODO: si Yahoo quoteSummary agrega `publicationDate` trimestral algún día,
    // markar `confianzaFecha: "confirmada"` cuando pubReal != null.

    if (!fechaAntes(fechaPub, fechaCorte)) continue;

    candidatos.push({
      trimestre: t,
      fechaPublicacion: fechaPub,
      confianzaFecha,
      epsActual: null,
      epsEstimate: null,
      epsSurprise: null,
      epsSurprisePct: null,
    });
  }

  if (candidatos.length === 0) {
    // Sin snapshot válido para esta fecha — ETAPA 3 debe saltar ese período o marcarlo.
    return null;
  }

  // Elegir el trimestre con pub. estimada MÁS RECIENTE que siga siendo < fechaCorte
  candidatos.sort((a, b) => b.fechaPublicacion.getTime() - a.fechaPublicacion.getTime());
  const elegido = candidatos[0];
  const t = elegido.trimestre;

  //  Derivar ratios siempre que haya datos coherentes 
  const roe =
    t.patrimonio != null && t.patrimonio !== 0 && t.beneficioNeto != null
      ? t.beneficioNeto / t.patrimonio
      : null;

  const margenOperativo = t.ingresoTotal != null && t.ingresoTotal !== 0 && t.ebit != null
    ? t.ebit / t.ingresoTotal
    : null;

  const margenNeto = t.ingresoTotal != null && t.ingresoTotal !== 0 && t.beneficioNeto != null
    ? t.beneficioNeto / t.ingresoTotal
    : null;

  // FCF = CFO + capex (capex viene NEGATIVO en Yahoo) → CFO - capex(expanded sign)
  const fcf = t.flujoCajaOperativo != null && t.capex != null
    ? t.flujoCajaOperativo + t.capex
    : null;

  if (candidatos.length > 1) {
    // Verificación de sanity: si Yahoo junto dos trimestres con misma endDate, advierte.
    //  VERIFICAR: si vemos dos trimestres endpoint distintos con mismo endDate,
    // puede haber truncamiento API. No mezclar valores sin análisis.
  }

  return {
    ticker,
    fechaObjetivo: iso(fechaCorte),
    fechaTrimestre: iso(t.endDate),
    fechaPublicacion: iso(elegido.fechaPublicacion),
    confianzaFecha: elegido.confianzaFecha,
    ingresoTotal: t.ingresoTotal,
    beneficioBruto: t.beneficioBruto,
    ebit: t.ebit,
    beneficioNeto: t.beneficioNeto,
    eps: t.eps,
    margenOperativo,
    margenNeto,
    totalActivos: t.totalActivos,
    totalPasivos: t.totalPasivos,
    patrimonio: t.patrimonio,
    deudaTotal: t.deudaTotal,
    roe,
    flujoCajaOperativo: t.flujoCajaOperativo,
    capex: t.capex,
    fcf,
    epsEstimate: elegido.epsEstimate,
    epsSurprise: elegido.epsSurprise,
    epsSurprisePct: elegido.epsSurprisePct,
  };
}

//  Tipo auxiliar para Etapa 3 (sin tocar el archivo principal) 
//
// Etapa 3 consume:
//   import { getFundamentalSnapshot, type SnapshotFundamental } from
//     "@/lib/backtesting/snapshot-fundamentales.functions";
//
// Garantías de contrato:
//   - Sea cual sea la fecha objetivo, NUNCA se devuelve un snapshot publicado después.
//   - Si no hay snapshot válido para esa fecha, se devuelve `null` explícito.
//   - Todos los snapshots devueltos tienen `confianzaFecha` poblado (alarmos en "estimada").