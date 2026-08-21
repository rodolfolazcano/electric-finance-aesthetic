/**
 * Herramienta Sectores — flujo completo portado de clarity-dashboard:
 * ticker → sector/perfil (sectores.json + sectores-bcba.json)
 * → fundamentales Yahoo → calcularSectorial (score 0-100 con Graham/Amat)
 * → pares del sector → generarConclusionSectorialInteligente.
 *
 * Adaptaciones: balance/cashflow/income vía fundamentalsTimeSeries (el módulo
 * quoteSummary de estados fue deprecado en Yahoo); healthScoreHistory no
 * disponible → el bonus de estabilidad Consumer Defensive queda inactivo;
 * fundScore 0-100 propio por bandas determinísticas para comparar pares.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  buscarEntradaPorTicker,
  getTickersByIndustry,
  getTickersBySector,
  isCedear,
  type TickerEntry,
} from "./sectores/sector-mapping";
import { buscarPerfilPorTicker } from "./sectores/perfiles-sector";
import {
  calcularSectorial,
  type SectorialInput,
  type SubScore,
} from "./sectores/scoring-sectorial";
import {
  generarConclusionSectorialInteligente,
  type ConclusionSectorialInteligente,
  type ParFundamental,
} from "./sectores/interpretacion-sectorial";

const inputSchema = z.object({
  ticker: z.string().min(1).max(20),
  peersMax: z.number().min(3).max(20).optional().default(10),
});

export interface ScoreSectorialResult {
  ticker: string;
  nombre: string | null;
  esCedear: boolean;
  esETF: boolean;
  sectorUniverso: string | null;
  industriaUniverso: string | null;
  sectorYahoo: string | null;
  industriaYahoo: string | null;
  perfil: {
    sector: string;
    esDefault: boolean;
    sensibilidadTasas: string;
    sensibilidadCommodity: string;
    justificacion: string;
    pesosFundamentales: Record<string, number>;
    pesosTecnicos: Record<string, number>;
  };
  score: SubScore;
  fundamentales: ParFundamental & {
    currentPrice: number | null;
    marketCapM: number | null;
  };
  interpretacion: ConclusionSectorialInteligente;
  pares: {
    ticker: string;
    nombre: string | null;
    fundScore: number | null;
    trailingPE: number | null;
  }[];
  advertenciasDatos: string[];
}

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

type Num = number | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function num(v: any): Num {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "object" && typeof v.raw === "number") return isFinite(v.raw) ? v.raw : null;
  return null;
}

/** Fila más reciente de fundamentalsTimeSeries como diccionario plano key→raw. */
async function serieAnual(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  yf: any,
  ticker: string,
  tipo: string,
): Promise<Record<string, number> | null> {
  try {
    const fts = await yf.fundamentalsTimeSeries(ticker, {
      period: "annual",
      types: [tipo],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = (fts?.result ?? []).find((r: any) => r?.type === tipo);
    if (!row) return null;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === "type" || k === "symbol") continue;
      const n = num(v);
      if (n != null) out[k] = n;
    }
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

interface QuoteCompleto {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  qs: any;
  balance: Record<string, number> | null;
  cashflow: Record<string, number> | null;
  income: Record<string, number> | null;
}

async function fetchQuoteCompleto(
  ticker: string,
  conEstados: boolean,
): Promise<QuoteCompleto | null> {
  try {
    const yf = await getYF();
    const qs = await yf.quoteSummary(ticker, {
      modules: ["price", "summaryDetail", "defaultKeyStatistics", "financialData", "assetProfile"],
    });
    if (!qs) return null;
    if (!conEstados) return { qs, balance: null, cashflow: null, income: null };
    const [balance, cashflow, income] = await Promise.all([
      serieAnual(yf, ticker, "balanceSheetHistory"),
      serieAnual(yf, ticker, "cashflowStatementHistory"),
      serieAnual(yf, ticker, "incomeStatementHistory"),
    ]);
    return { qs, balance, cashflow, income };
  } catch {
    return null;
  }
}

/** Puntaje por techos ascendentes [límiteSuperiorInclusive, puntaje]; encima del último → 0. */
function puntajePorTecho(valor: number, techos: [number, number][]): number {
  for (const [techo, pts] of techos) {
    if (valor <= techo) return pts;
  }
  return 0;
}

/**
 * fundScore 0-100 determinístico por bandas (proxy propio para comparar pares
 * dentro del set; pesos suman 100). Métricas "mayor es mejor": ≤0 → 0 puntos.
 */
function fundScoreProxy(p: ParFundamental): number | null {
  const definicion: [Num, number, (v: number) => number][] = [
    [
      p.trailingPE,
      15,
      (v) =>
        v <= 0
          ? 0
          : puntajePorTecho(v, [
              [12, 100],
              [18, 75],
              [28, 50],
              [45, 25],
            ]),
    ],
    [
      p.forwardPE,
      10,
      (v) =>
        v <= 0
          ? 0
          : puntajePorTecho(v, [
              [11, 100],
              [16, 75],
              [25, 50],
              [40, 25],
            ]),
    ],
    [
      p.returnOnEquity,
      15,
      (v) =>
        v <= 0
          ? 0
          : puntajePorTecho(v, [
              [0.25, 100],
              [0.15, 75],
              [0.08, 50],
              [Number.MAX_VALUE, 25],
            ]),
    ],
    [
      p.profitMargin,
      10,
      (v) =>
        v <= 0
          ? 0
          : puntajePorTecho(v, [
              [0.2, 100],
              [0.1, 75],
              [0.04, 50],
              [Number.MAX_VALUE, 25],
            ]),
    ],
    [
      p.operatingMargin,
      10,
      (v) =>
        v <= 0
          ? 0
          : puntajePorTecho(v, [
              [0.2, 100],
              [0.12, 75],
              [0.05, 50],
              [Number.MAX_VALUE, 25],
            ]),
    ],
    [
      p.revenueGrowth,
      15,
      (v) =>
        v <= 0
          ? 0
          : puntajePorTecho(v, [
              [0.2, 100],
              [0.1, 75],
              [0.03, 50],
              [Number.MAX_VALUE, 25],
            ]),
    ],
    [
      p.earningsGrowth,
      10,
      (v) =>
        v <= 0
          ? 0
          : puntajePorTecho(v, [
              [0.2, 100],
              [0.1, 75],
              [Number.MAX_VALUE, 50],
            ]),
    ],
    [
      p.fcfYield,
      15,
      (v) =>
        v <= 0
          ? 0
          : puntajePorTecho(v, [
              [0.06, 100],
              [0.04, 75],
              [0.02, 50],
              [Number.MAX_VALUE, 25],
            ]),
    ],
  ];
  let suma = 0;
  let peso = 0;
  for (const [valor, pesoMetrica, regla] of definicion) {
    if (valor == null || !Number.isFinite(valor)) continue;
    suma += regla(valor) * pesoMetrica;
    peso += pesoMetrica;
  }
  if (peso === 0) return null;
  return Math.round(suma / peso);
}

function construirParFundamental(symbol: string, q: QuoteCompleto): ParFundamental {
  const { qs } = q;
  const price = qs?.price;
  const sd = qs?.summaryDetail;
  const ks = qs?.defaultKeyStatistics;
  const fd = qs?.financialData;

  const currentPrice = num(price?.regularMarketPrice) ?? num(fd?.currentPrice);
  const marketCapRaw = num(price?.marketCap) ?? num(ks?.marketCap);

  const trailingPE = num(sd?.trailingPE) ?? num(ks?.trailingPE);
  const forwardPE = num(sd?.forwardPE) ?? num(ks?.forwardPE);
  const pegRatio = num(ks?.pegRatio);
  const priceToBook = num(sd?.priceToBook) ?? num(ks?.priceToBook);
  const evToEbitda = num(ks?.enterpriseToEbitda);

  const freeCashflowRaw = num(fd?.freeCashflow);
  const fcfYield =
    freeCashflowRaw != null && marketCapRaw != null && marketCapRaw > 0
      ? freeCashflowRaw / marketCapRaw
      : null;

  const targetMeanPrice = num(fd?.targetMeanPrice);
  const upsidePct =
    targetMeanPrice != null && currentPrice != null && currentPrice > 0
      ? ((targetMeanPrice - currentPrice) / currentPrice) * 100
      : null;

  const par: ParFundamental = {
    symbol,
    companyName: (qs?.price?.longName ?? qs?.price?.shortName ?? null) as string | null,
    fundScore: null,
    trailingPE,
    forwardPE,
    pegRatio,
    priceToBook,
    evToEbitda,
    returnOnEquity: num(fd?.returnOnEquity),
    profitMargin: num(fd?.profitMargins),
    operatingMargin: num(fd?.operatingMargins),
    revenueGrowth: num(fd?.revenueGrowth),
    earningsGrowth: num(fd?.earningsGrowth),
    debtToEquityRaw: num(fd?.debtToEquity),
    fcfYield,
    dividendYield: num(sd?.dividendYield) ?? num(sd?.trailingAnnualDividendYield),
    upsidePct,
  };
  par.fundScore = fundScoreProxy(par);
  return par;
}

export const scoreSectorialFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }): Promise<ScoreSectorialResult> => {
    const ticker = data.ticker.trim().toUpperCase();
    const advertenciasDatos: string[] = [];

    const entrada = buscarEntradaPorTicker(ticker);
    const { perfil, sector: sectorPerfil, esDefault } = buscarPerfilPorTicker(ticker);
    if (esDefault) {
      advertenciasDatos.push(
        `El ticker ${ticker} no figura en el universo sectorial (sectores.json/BCBA) — se usa el perfil DEFAULT.`,
      );
    }

    const q = await fetchQuoteCompleto(ticker, true);
    if (!q) throw new Error(`Sin datos de Yahoo Finance para ${ticker}.`);
    const { qs } = q;
    const ap = qs?.assetProfile;
    const price = qs?.price;
    const sd = qs?.summaryDetail;
    const ks = qs?.defaultKeyStatistics;
    const fd = qs?.financialData;

    const esETF = String(price?.quoteType ?? "") === "ETF";
    const esCedear = isCedear(ticker);
    if (esCedear) {
      advertenciasDatos.push(
        `${ticker} es un CEDEAR: los múltiplos (P/E, P/B, EV/EBITDA) de Yahoo no aplican ratio de conversión ni FX. El score sectorial se marca no disponible; analizar el subyacente en USD.`,
      );
    }

    // ─── Fundamentales del ticker ───
    const currentPrice = num(price?.regularMarketPrice) ?? num(fd?.currentPrice);
    const marketCapRaw = num(price?.marketCap) ?? num(ks?.marketCap);
    const trailingPE = num(sd?.trailingPE) ?? num(ks?.trailingPE);
    const sharesOutstanding = num(ks?.sharesOutstanding);
    const freeCashflowRaw = num(fd?.freeCashflow);
    const fcfYield =
      freeCashflowRaw != null && marketCapRaw != null && marketCapRaw > 0
        ? freeCashflowRaw / marketCapRaw
        : null;

    const bs = q.balance;
    const cf = q.cashflow;
    const inc = q.income;

    const totalStockholderEquity =
      bs?.["totalStockholderEquity"] != null ? bs["totalStockholderEquity"] : null;
    const totalAssets = bs?.["totalAssets"] != null ? bs["totalAssets"] : null;
    const workingCapital =
      bs?.["totalCurrentAssets"] != null && bs?.["totalCurrentLiabilities"] != null
        ? bs["totalCurrentAssets"] - bs["totalCurrentLiabilities"]
        : null;

    const totalCashFromOperatingActivities =
      cf?.["totalCashFromOperatingActivities"] != null
        ? cf["totalCashFromOperatingActivities"]
        : null;
    // I+D sobre ingresos (%) y cobertura de intereses desde el estado de resultados
    let rdToRevenuePct: Num = null;
    if (
      inc?.["researchAndDevelopmentExpense"] != null &&
      inc?.["totalRevenue"] != null &&
      inc["totalRevenue"] > 0
    ) {
      rdToRevenuePct = (inc["researchAndDevelopmentExpense"] / inc["totalRevenue"]) * 100;
    }
    let interestCoverageRatio: Num = null;
    if (inc?.["ebit"] != null && inc?.["interestExpense"] != null && inc["interestExpense"] !== 0) {
      interestCoverageRatio = Math.abs(inc["ebit"] / inc["interestExpense"]);
    }

    if (!bs)
      advertenciasDatos.push(
        "Balance anual no disponible (Amat/solvencia y capital de trabajo sin datos).",
      );
    if (!cf)
      advertenciasDatos.push("Flujo de caja anual no disponible (flujo operativo sin datos).");
    if (!inc)
      advertenciasDatos.push(
        "Estado de resultados anual no disponible (I+D y cobertura de intereses sin datos).",
      );

    const input: SectorialInput = {
      symbol: ticker,
      sector: entrada?.sector ?? ap?.sector ?? null,
      esETF,
      currentPrice,
      trailingPE: esCedear ? null : trailingPE,
      totalStockholderEquity,
      sharesOutstanding,
      // Bandas de SECTOR_CONFIG están expresadas en millones (etiquetas "(M)")
      totalAssets: totalAssets != null ? totalAssets / 1_000_000 : null,
      healthScoreHistory: [],
      rdToRevenuePct,
      operatingMargin: num(fd?.operatingMargins),
      revenueGrowth: num(fd?.revenueGrowth),
      returnOnEquity: num(fd?.returnOnEquity),
      fcfYield,
      profitMargin: num(fd?.profitMargins),
      debtToEquityRaw: num(fd?.debtToEquity),
      freeCashflowM: freeCashflowRaw != null ? freeCashflowRaw / 1_000_000 : null,
      totalCashFromOperatingActivities:
        totalCashFromOperatingActivities != null
          ? totalCashFromOperatingActivities / 1_000_000
          : null,
      payoutRatio: num(sd?.payoutRatio),
      interestCoverageRatio,
      workingCapital: workingCapital != null ? workingCapital / 1_000_000 : null,
      returnOnAssets: num(fd?.returnOnAssets),
      currentRatio: num(fd?.currentRatio),
    };

    const score = calcularSectorial(input);

    // ─── Pares del mismo sector/industria del universo ───
    const peersMax = data.peersMax ?? 10;
    let candidatos: TickerEntry[] = [];
    if (entrada) {
      candidatos = getTickersByIndustry(entrada.sector, entrada.industry).filter(
        (e) => e.ticker !== ticker && !e.ticker.endsWith(".BA"),
      );
      if (candidatos.length < 4) {
        const extra = getTickersBySector(entrada.sector).filter(
          (e) =>
            e.ticker !== ticker &&
            !e.ticker.endsWith(".BA") &&
            !candidatos.some((c) => c.ticker === e.ticker),
        );
        candidatos = [...candidatos, ...extra];
      }
    }
    candidatos = candidatos.slice(0, peersMax);

    const paresFund: ParFundamental[] = [];
    const paresResumen: ScoreSectorialResult["pares"] = [];
    for (const c of candidatos) {
      const qp = await fetchQuoteCompleto(c.ticker, false);
      if (!qp) {
        paresFund.push({
          symbol: c.ticker,
          companyName: c.nombre,
          fundScore: null,
          error: "sin datos",
          trailingPE: null,
          forwardPE: null,
          pegRatio: null,
          priceToBook: null,
          evToEbitda: null,
          returnOnEquity: null,
          profitMargin: null,
          operatingMargin: null,
          revenueGrowth: null,
          earningsGrowth: null,
          debtToEquityRaw: null,
          fcfYield: null,
          dividendYield: null,
          upsidePct: null,
        });
        continue;
      }
      const par = construirParFundamental(c.ticker, qp);
      paresFund.push(par);
      paresResumen.push({
        ticker: par.symbol,
        nombre: par.companyName,
        fundScore: par.fundScore,
        trailingPE: par.trailingPE,
      });
    }

    // ─── Interpretación sectorial inteligente ───
    const parTicker = construirParFundamental(ticker, q);
    if (esCedear) {
      parTicker.trailingPE = null;
      parTicker.forwardPE = null;
      parTicker.pegRatio = null;
      parTicker.priceToBook = null;
      parTicker.evToEbitda = null;
    }
    const interpretacion = generarConclusionSectorialInteligente(
      parTicker,
      paresFund,
      ap?.sector ?? entrada?.sector ?? "",
      ap?.industry ?? entrada?.industry ?? "",
    );

    return {
      ticker,
      nombre: (parTicker.companyName ?? entrada?.nombre ?? null) as string | null,
      esCedear,
      esETF,
      sectorUniverso: entrada?.sector ?? null,
      industriaUniverso: entrada?.industry ?? null,
      sectorYahoo: (ap?.sector ?? null) as string | null,
      industriaYahoo: (ap?.industry ?? null) as string | null,
      perfil: {
        sector: sectorPerfil,
        esDefault,
        sensibilidadTasas: perfil.sensibilidadTasas,
        sensibilidadCommodity: perfil.sensibilidadCommodity,
        justificacion: perfil.justificacion,
        pesosFundamentales: perfil.fundamental,
        pesosTecnicos: perfil.tecnico,
      },
      score,
      fundamentales: {
        ...parTicker,
        currentPrice,
        marketCapM: marketCapRaw != null ? marketCapRaw / 1_000_000 : null,
      },
      interpretacion,
      pares: paresResumen,
      advertenciasDatos,
    };
  });
