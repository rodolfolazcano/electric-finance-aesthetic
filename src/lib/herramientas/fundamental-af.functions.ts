// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getFlatTickerList } from "./universos";
import { resolverSenalCoherente } from "./coherencia-senal";
import { computeBeta } from "./yahoo-coronar.functions";
import { yahooChartCloses, yahooChartOHLCV } from "./yahoo-chart";
import { AUTO_BENCHMARKS, FACTORS_MASTER_LIST } from "./benchmarks-master";
import { fetchYahooQuoteSummaryJson } from "./yahoo-http";
import type { AssetProfile } from "@/lib/yahoo-types";
import { getOrFetch } from "./cache/api-cache.server";
import { TTL_POR_TIPO } from "./cache/types";
import { isCedear } from "./sectores/sector-mapping";

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

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

function num(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v !== null && v !== undefined && typeof v === "object") {
    const raw = (v as Record<string, unknown>).raw;
    if (typeof raw === "number" && isFinite(raw)) return raw;
  }
  return null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout ${label} after ${ms}ms`)), ms),
    ),
  ]);
}

function numDate(v: unknown): number | null {
  if (typeof v === "number") return v;
  if (v !== null && v !== undefined && typeof v === "object") {
    // Old format: {raw: number, fmt: string}
    const raw = (v as Record<string, unknown>).raw;
    if (typeof raw === "number") return raw;
    // New format: Date object (e.g. "2025-09-30T00:00:00.000Z") from incomeStatementHistory
    if (v instanceof Date) return Math.floor(v.getTime() / 1000);
  }
  // New format: ISO date string (e.g. "2025-09-30T00:00:00.000Z")
  if (typeof v === "string") {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return Math.floor(d.getTime() / 1000);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tipos exportados
// ---------------------------------------------------------------------------

export interface PeHistoryPoint {
  year: number;
  pe: number;
  eps: number;
  peg?: number;
}

export interface InsiderTxRow {
  fecha: string;
  filerName: string;
  transactionText: string;
  shares: number;
  value: number;
}

export interface RatingChangeRow {
  fecha: string;
  firm: string;
  toGrade: string;
  fromGrade: string;
  action: string;
}

export interface FilingRow {
  date: string;
  type: string;
  url: string;
  description: string;
}

export interface ScoreDetail {
  metric: string;
  valor: string;
  pts: number;
  maxPts: number;
}

export interface FundamentalAFResult {
  symbol: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  pegImpliedGrowthRate: number | null;
  currentPrice: number | null;
  marketCapM: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  returnOnEquity: number | null;
  returnOnAssets: number | null;
  profitMargin: number | null;
  operatingMargin: number | null;
  grossMargin: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  debtToEquityRaw: number | null;
  /** BLOQUE 5 — leverage operativo/financiero/combinado aproximado (Pascale 18.2-18.4) */
  leverage: LeverageResult | null;
  /** BLOQUE 9.1 — ciclo de conversión de efectivo y salud operativa de corto plazo 0-100 */
  cicloConversion: CicloConversionEfectivoResult | null;
  currentRatio: number | null;
  quickRatio: number | null;
  freeCashflowM: number | null;
  fcfYield: number | null;
  dividendYield: number | null;
  payoutRatio: number | null;
  targetMeanPrice: number | null;
  targetLowPrice: number | null;
  targetHighPrice: number | null;
  recommendationMean: number | null;
  numberOfAnalystOpinions: number | null;
  upsidePct: number | null;
  beta: number | null;
  recommendationTrend: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  } | null;
  betaAnomalo: boolean;
  betaPropio: number | null;
  betaR2: number | null;
  betaBenchmarkUsado: "SPY" | "MERVAL" | null;
  betaAdvertencia: string | null;
  revisionEstimadosPct: number | null;
  revisionEstimadosDetalle: string | null;
  insiderNetActivityPct: number | null;
  insiderNetActivityInterpretacion: string | null;
  secFilings: FilingRow[];
  benchmarkPrice: number | null;
  benchmarkMarketCapM: number | null;
  benchmarkBeta: number | null;
  benchmarkName: string | null;
  sharesOutstanding: number | null;
  min10y: number | null;
  max10y: number | null;
  avg10y: number | null;
  pricePercentile10y: number | null;
  peHistory: PeHistoryPoint[];
  pePercentile: number | null;
  pegPercentile: number | null;
  fundScore: number;
  fundScoreRaw: number;
  fundScoreAbsolute: number;
  dataCoverage: number;
  metricsAvailable: number;
  metricsTotal: number;
  rawPts: number;
  maxPts: number;
  scoreDetails: ScoreDetail[];
  healthScoreHistory: { year: number; score: number }[];
  plazo: string;
  accion: string;
  error: string | null;
  // PASO 1 â€” Nuevos campos de balance, cash flow, income statement
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalStockholderEquity: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  cashAndEquivalents: number | null;
  totalDebtBalance: number | null;
  workingCapital: number | null;
  currentRatioCheck: number | null;
  currentRatioWarning: string | null;
  totalCashFromOperatingActivities: number | null;
  capitalExpenditures: number | null;
  dividendsPaid: number | null;
  fcfCalculadoManual: number | null;
  fcfWarning: string | null;
  incomeBeforeTax: number | null;
  incomeTaxExpense: number | null;
  ebit: number | null;
  interestExpense: number | null;
  effectiveTaxRate: number | null;
  interestCoverageRatio: number | null;
  // Insider / Institutional ownership
  insidersPercentHeld: number | null;
  institutionsPercentHeld: number | null;
  insiderTransactions: InsiderTxRow[];
  // Rating changes
  ratingChanges: RatingChangeRow[];
  // Governance — company officers & risk scores (desde assetProfile)
  companyOfficers: {
    nombre: string;
    cargo: string;
    edad: number | null;
    compensacionAnual: number | null;
  }[];
  governanceRiskScores: {
    auditRisk: number | null;
    boardRisk: number | null;
    compensationRisk: number | null;
    shareHolderRightsRisk: number | null;
    overallRisk: number | null;
  };
  governanceRiskLabel: string | null;
  governanceEpochDate: string | null;
  // Internos para cÃ¡lculos en valuacion.functions
  totalRevenue: number | null;
  researchDevelopment: number | null;
  rdToRevenuePct: number | null;
  netIncomeFromIS: number | null;
  netReceivables: number | null;
  inventory: number | null;
  accountsPayable: number | null;
  costOfRevenue: number | null;
  retainedEarnings: number | null;
  dilutedAverageShares: number | null;
  trailingEps: number | null;
  freeCashflowRaw: number | null;
  _riesgoPaisPct: number;
  longBusinessSummary: string | null;
  quoteType: string | null;
  esETF: boolean;
}

// ---------------------------------------------------------------------------
// Server function principal
// ---------------------------------------------------------------------------

const AF_MODULES = [
  "assetProfile",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
  "earnings",
  "earningsTrend",
  "recommendationTrend",
  "upgradeDowngradeHistory",
  "institutionOwnership",
  "insiderTransactions",
  "majorHoldersBreakdown",
  "incomeStatementHistory",
  "balanceSheetHistory",
  "cashflowStatementHistory",
  "incomeStatementHistoryQuarterly",
  "balanceSheetHistoryQuarterly",
  "cashflowStatementHistoryQuarterly",
  "earningsHistory",
  "calendarEvents",
];

// ─── Mapas de traducción Yahoo (inglés) → JSON (español) ──────────

const YAHOO_SECTOR_TO_ES: Record<string, string> = {
  Technology: "Tecnología",
  "Communication Services": "Servicios de comunicación",
  "Consumer Cyclical": "Consumo cíclico",
  "Consumer Defensive": "Defensiva del Consumidor",
  Healthcare: "Cuidado de la salud",
  "Financial Services": "Servicios financieros",
  Energy: "Energía",
  "Basic Materials": "Materiales Básicos",
  Industrials: "Acciones industriales",
  Utilities: "Utilidades",
  "Real Estate": "Bienes raíces",
};

const YAHOO_INDUSTRY_TO_ES: Record<string, string> = {
  Semiconductors: "Semiconductores",
  "Software—Infrastructure": "Software - Infraestructura",
  "Software - Infrastructure": "Software - Infraestructura",
  "Software—Application": "Software - Aplicación",
  "Software - Application": "Software - Aplicación",
  "Information Technology Services": "Servicios de tecnología de la información",
  "Computer Hardware": "Hardware de computadora",
  "Consumer Electronics": "Electrónica de Consumo",
  "Communication Equipment": "Equipo de comunicación",
  "Semiconductor Equipment & Materials": "Equipos y materiales semiconductores",
  Solar: "Solar",
  "Electronic Components": "Componentes electrónicos",
  "Internet Content & Information": "Contenido e información de Internet",
  Entertainment: "Entretenimiento",
  "Electronic Gaming & Multimedia": "Juegos electrónicos y multimedia",
  "Telecom Services": "Servicios de telecomunicaciones",
  "Internet Retail": "Venta minorista por Internet",
  "Auto Manufacturers": "Fabricantes de automóviles",
  Restaurants: "Restaurantes",
  "Footwear & Accessories": "Calzado y accesorios",
  "Resorts & Casinos": "Resorts y casinos",
  "Auto & Truck Dealerships": "Concesionarios de automóviles",
  "Apparel Retail": "Venta al por menor de ropa",
  "Travel Services": "Servicios de viaje",
  "Home Improvement Retail": "Venta minorista de mejoras para el hogar",
  "Recreational Vehicles": "Vehículos recreativos",
  "Auto Parts": "Autopartes",
  "Packaging & Containers": "Embalajes y contenedores",
  "Oil & Gas E&P": "Exploración y producción de petróleo y gas",
  "Oil & Gas Integrated": "Petróleo y Gas Integrados",
  "Oil & Gas Midstream": "Midstream de petróleo y gas",
  "Oil & Gas Equipment & Services": "Equipos y servicios de petróleo y gas",
  Uranium: "Uranio",
  "Banks—Regional": "Bancos - Regionales",
  "Banks - Regional": "Bancos - Regionales",
  "Banks—Diversified": "Bancos - Diversificados",
  "Banks - Diversified": "Bancos - Diversificados",
  "Capital Markets": "Mercados de capitales",
  "Financial Data & Stock Exchanges": "Datos financieros y bolsas de valores",
  "Credit Services": "Servicios de crédito",
  "Insurance—Diversified": "Seguros - Diversificados",
  "Insurance - Diversified": "Seguros - Diversificados",
  "Insurance Brokers": "Corredores de seguros",
  "Aerospace & Defense": "Aeroespacial y Defensa",
  "Farm & Heavy Construction Machinery": "Maquinaria agrícola y de construcción pesada",
  Airlines: "Aerolíneas",
  Conglomerates: "Conglomerados",
  "Rental & Leasing Services": "Servicios de alquiler y arrendamiento",
  "Integrated Freight & Logistics": "Transporte y logística integrados",
  "Airports & Air Services": "Aeropuertos y servicios aéreos",
  "Beverages—Non-Alcoholic": "Bebidas - No Alcohólicas",
  "Beverages - Non-Alcoholic": "Bebidas - No Alcohólicas",
  "Beverages—Non Alcoholic": "Bebidas - No Alcohólicas",
  "Discount Stores": "Tiendas de descuento",
  "Household & Personal Products": "Productos personales y para el hogar",
  Tobacco: "Tabaco",
  Confectioners: "Pasteleros",
  "Beverages—Wineries & Distilleries": "Bebidas - Bodegas y Destilerías",
  "Beverages - Wineries & Distilleries": "Bebidas - Bodegas y Destilerías",
  "Beverages—Brewers": "Bebidas - Cerveceros",
  "Beverages - Brewers": "Bebidas - Cerveceros",
  "Utilities—Independent Power Producers":
    "Servicios públicos: productores de energía independientes",
  "Utilities - Independent Power Producers":
    "Servicios públicos: productores de energía independientes",
  "Utilities—Regulated Electric": "Servicios públicos: electricidad regulada",
  "Utilities - Regulated Electric": "Servicios públicos: electricidad regulada",
  "Other Industrial Metals & Mining": "Otros metales industriales y minería",
  Gold: "Oro",
  "Agricultural Inputs": "Insumos agrícolas",
  "Other Precious Metals & Mining": "Otros metales preciosos y minería",
  Copper: "Cobre",
  Steel: "Acero",
  Chemicals: "Químicos",
  "Building Materials": "Materiales de construcción",
  "Specialty Chemicals": "Productos químicos especiales",
  "Drug Manufacturers—General": "Fabricantes de medicamentos - General",
  "Drug Manufacturers - General": "Fabricantes de medicamentos - General",
  "Drug Manufacturers—Specialty & Generic":
    "Fabricantes de medicamentos: especializados y genéricos",
  "Drug Manufacturers - Specialty & Generic":
    "Fabricantes de medicamentos: especializados y genéricos",
  "Healthcare Plans": "Planes de salud",
  "Medical Instruments & Supplies": "Instrumentos y suministros médicos",
  Biotechnology: "Biotecnología",
  "Medical Devices": "Dispositivos médicos",
  "Diagnostics & Research": "Diagnóstico e investigación",
  "Health Information Services": "Servicios de información de salud",
  "Medical Distribution": "Distribución médica",
  "Asset Management": "Gestión de activos",
  "Tools & Accessories": "Herramientas y accesorios",
  "Specialty Industrial Machinery": "Maquinaria Industrial Especializada",
  Railroads: "Ferrocarriles",
  "Consulting Services": "Servicios de consultoría",
  "Building Products & Equipment": "Productos y equipos de construcción",
  "Scientific & Technical Instruments": "Instrumentos científicos y técnicos",
  "Oil & Gas Refining & Marketing": "Refinación y comercialización de petróleo y gas",
  "REIT—Retail": "REIT - Comercio minorista",
  "REIT - Retail": "REIT - Comercio minorista",
  "Farm Products": "Productos agrícolas",
  "Food Distribution": "Distribución de alimentos",
  "Paper & Paper Products": "Papel y productos de papel",
  "Utilities—Renewable": "Utilidades - Renovables",
  "Utilities - Renewable": "Utilidades - Renovables",
  "Utilities—Regulated Water": "Servicios Públicos - Agua Regulada",
  "Utilities - Regulated Water": "Servicios Públicos - Agua Regulada",
};

function normalizarSector(yahooSector: string): string {
  return YAHOO_SECTOR_TO_ES[yahooSector] ?? yahooSector;
}

function normalizarIndustria(yahooIndustry: string): string {
  return YAHOO_INDUSTRY_TO_ES[yahooIndustry] ?? yahooIndustry;
}

export const fetchFundamentalAF = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string }) =>
    z
      .object({
        symbol: z
          .string()
          .min(1)
          .max(20)
          .transform((s) => s.trim().toUpperCase()),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<FundamentalAFResult> => {
    const symbol = data.symbol;
    const cacheKey = `fundamental:${symbol}:v1`;
    return getOrFetch(cacheKey, "yahoo", TTL_POR_TIPO.fundamentals, () =>
      computeFundamentalAF(symbol),
    );
  });

// Compute fundamental analysis (extracted for caching)
async function computeFundamentalAF(symbol: string): Promise<FundamentalAFResult> {
  const empty: FundamentalAFResult = {
    symbol,
    companyName: null,
    sector: null,
    industry: null,
    country: null,
    pegImpliedGrowthRate: null,
    currentPrice: null,
    marketCapM: null,
    trailingPE: null,
    forwardPE: null,
    pegRatio: null,
    priceToBook: null,
    evToEbitda: null,
    returnOnEquity: null,
    returnOnAssets: null,
    profitMargin: null,
    operatingMargin: null,
    grossMargin: null,
    revenueGrowth: null,
    earningsGrowth: null,
    debtToEquityRaw: null,
    leverage: null,
    cicloConversion: null,
    currentRatio: null,
    quickRatio: null,
    freeCashflowM: null,
    fcfYield: null,
    dividendYield: null,
    payoutRatio: null,
    targetMeanPrice: null,
    targetLowPrice: null,
    targetHighPrice: null,
    recommendationMean: null,
    numberOfAnalystOpinions: null,
    upsidePct: null,
    beta: null,
    recommendationTrend: null,
    betaAnomalo: false,
    betaPropio: null,
    betaR2: null,
    betaBenchmarkUsado: null,
    betaAdvertencia: null,
    revisionEstimadosPct: null,
    revisionEstimadosDetalle: null,
    insiderNetActivityPct: null,
    insiderNetActivityInterpretacion: null,
    secFilings: [],
    benchmarkPrice: null,
    benchmarkMarketCapM: null,
    benchmarkBeta: null,
    benchmarkName: null,
    sharesOutstanding: null,
    min10y: null,
    max10y: null,
    avg10y: null,
    pricePercentile10y: null,
    peHistory: [],
    pePercentile: null,
    pegPercentile: null,
    fundScore: 0,
    fundScoreRaw: 0,
    fundScoreAbsolute: 0,
    dataCoverage: 0,
    metricsAvailable: 0,
    metricsTotal: 7,
    rawPts: 0,
    maxPts: 0,
    scoreDetails: [],
    healthScoreHistory: [],
    plazo: "",
    accion: "",
    error: null,
    totalAssets: null,
    totalLiabilities: null,
    totalStockholderEquity: null,
    totalCurrentAssets: null,
    totalCurrentLiabilities: null,
    cashAndEquivalents: null,
    totalDebtBalance: null,
    workingCapital: null,
    currentRatioCheck: null,
    currentRatioWarning: null,
    totalCashFromOperatingActivities: null,
    capitalExpenditures: null,
    dividendsPaid: null,
    fcfCalculadoManual: null,
    fcfWarning: null,
    incomeBeforeTax: null,
    incomeTaxExpense: null,
    ebit: null,
    interestExpense: null,
    effectiveTaxRate: null,
    interestCoverageRatio: null,
    insidersPercentHeld: null,
    institutionsPercentHeld: null,
    insiderTransactions: [],
    ratingChanges: [],
    companyOfficers: [],
    governanceRiskScores: {
      auditRisk: null,
      boardRisk: null,
      compensationRisk: null,
      shareHolderRightsRisk: null,
      overallRisk: null,
    },
    governanceRiskLabel: null,
    governanceEpochDate: null,
    totalRevenue: null,
    researchDevelopment: null,
    rdToRevenuePct: null,
    netIncomeFromIS: null,
    netReceivables: null,
    inventory: null,
    accountsPayable: null,
    costOfRevenue: null,
    retainedEarnings: null,
    dilutedAverageShares: null,
    trailingEps: null,
    freeCashflowRaw: null,
    _riesgoPaisPct: 0,
    longBusinessSummary: null,
    quoteType: null,
    esETF: false,
  };

  try {
    const yf = await getYF();
    const chartKey = `yahoo:chart:${symbol}:10y:1mo`;
    const qsKey = `yahoo:quoteSummary:${symbol}:full`;

    const [chartRows, qs] = await Promise.all([
      getOrFetch(chartKey, "yahoo", TTL_POR_TIPO.fundamentals, () =>
        yf
          .chart(symbol, {
            period1: new Date(Date.now() - 10 * 365 * 24 * 60 * 60 * 1000),
            period2: new Date(),
            interval: "1mo",
          })
          .catch(() => null),
      ),
      getOrFetch(qsKey, "yahoo", TTL_POR_TIPO.fundamentals, () =>
        yf
          .quoteSummary(symbol, {
            modules: [
              "assetProfile",
              "summaryDetail",
              "defaultKeyStatistics",
              "price",
              "financialData",
              "earnings",
              "earningsTrend",
              "recommendationTrend",
              "upgradeDowngradeHistory",
              "institutionOwnership",
              "insiderTransactions",
              "majorHoldersBreakdown",
              "insiderHolders",
              "incomeStatementHistory",
              "balanceSheetHistory",
              "cashflowStatementHistory",
              "incomeStatementHistoryQuarterly",
              "balanceSheetHistoryQuarterly",
              "cashflowStatementHistoryQuarterly",
              "earningsHistory",
              "calendarEvents",
              "netSharePurchaseActivity",
              "secFilings",
            ],
          })
          .catch(() => null),
      ),
    ]);

    if (!qs || Object.keys(qs).length === 0) {
      return {
        ...empty,
        error:
          "No se encontraron datos para el simbolo ingresado. Verificar que sea un ticker valido de Yahoo Finance.",
      };
    }

    const ap = qs.assetProfile as AssetProfile | undefined;
    const sd = qs.summaryDetail as Record<string, unknown> | undefined;
    const fd = qs.financialData as Record<string, unknown> | undefined;
    const ks = qs.defaultKeyStatistics as Record<string, unknown> | undefined;
    const ish = qs.incomeStatementHistory as { incomeStatementHistory?: unknown[] } | undefined;

    const companyName = ap?.longName
      ? String(ap.longName)
      : ap?.shortName
        ? String(ap.shortName)
        : null;
    const sector = ap?.sector ? normalizarSector(String(ap.sector)) : null;
    const industry = ap?.industry ? normalizarIndustria(String(ap.industry)) : null;
    const country = ap?.country ? String(ap.country) : null;
    const longBusinessSummary = ap?.longBusinessSummary ? String(ap.longBusinessSummary) : null;

    const qsPrice = qs.price as Record<string, unknown> | undefined;
    const currentPrice =
      num(qsPrice?.regularMarketPrice) ?? num(fd?.currentPrice) ?? num(sd?.regularMarketPrice);
    const marketCapRaw = num(qsPrice?.marketCap) ?? num(ks?.marketCap) ?? num(sd?.marketCap);
    const marketCapM = marketCapRaw !== null ? marketCapRaw / 1_000_000 : null;

    // Detectar si es CEDEAR de empresa extranjera
    const esCedear = isCedear(symbol);
    let cedearWarning: string | null = null;

    let trailingPE = num(sd?.trailingPE) ?? num(ks?.trailingPE);
    let forwardPE = num(sd?.forwardPE) ?? num(ks?.forwardPE);
    let pegRatio = num(ks?.pegRatio);
    let priceToBook = num(sd?.priceToBook) ?? num(ks?.priceToBook);
    let evToEbitda = num(ks?.enterpriseToEbitda);
    const beta = num(ks?.beta) ?? num(sd?.beta);
    const betaAnomalo = beta !== null && (beta < 0.3 || beta > 3.5);
    const sharesOutstanding = num(ks?.sharesOutstanding);

    // Para CEDEARs, los múltiplos de Yahoo Finance no son confiables porque
    // dividen precio ARS por métricas USD sin aplicar ratio de conversión ni FX
    if (esCedear) {
      cedearWarning =
        "Este ticker es un CEDEAR. Los múltiplos (P/E, P/B, EV/EBITDA) calculados por Yahoo Finance no son confiables porque no aplican el ratio de conversión del CEDEAR ni el tipo de cambio ARS/USD. Se recomienda analizar el ticker subyacente en USD para valuación precisa.";
      trailingPE = null;
      forwardPE = null;
      pegRatio = null;
      priceToBook = null;
      evToEbitda = null;
    }

    const returnOnEquity = num(fd?.returnOnEquity);
    const returnOnAssets = num(fd?.returnOnAssets);
    const profitMargin = num(fd?.profitMargins) ?? num(ks?.profitMargins);
    const operatingMargin = num(fd?.operatingMargins);
    const grossMargin = num(fd?.grossMargins);

    const revenueGrowth = num(fd?.revenueGrowth);
    const earningsGrowth = num(fd?.earningsGrowth);

    const debtToEquityRaw = num(fd?.debtToEquity);
    const currentRatio = num(fd?.currentRatio);
    const quickRatio = num(fd?.quickRatio);
    const freeCashflowRaw = num(fd?.freeCashflow);
    const freeCashflowM = freeCashflowRaw !== null ? freeCashflowRaw / 1_000_000 : null;
    const fcfYield =
      freeCashflowRaw !== null && marketCapRaw !== null && marketCapRaw > 0
        ? freeCashflowRaw / marketCapRaw
        : null;
    const trailingEps = num(ks?.trailingEps);

    const dividendYield = num(sd?.dividendYield) ?? num(sd?.trailingAnnualDividendYield);
    const payoutRatio = num(sd?.payoutRatio);

    const targetMeanPrice = num(fd?.targetMeanPrice);
    const targetLowPrice = num(fd?.targetLowPrice);
    const targetHighPrice = num(fd?.targetHighPrice);
    const recommendationMean = num(fd?.recommendationMean);
    const numberOfAnalystOpinions = num(fd?.numberOfAnalystOpinions);
    const upsidePct =
      targetMeanPrice !== null && currentPrice !== null && currentPrice > 0
        ? ((targetMeanPrice - currentPrice) / currentPrice) * 100
        : null;

    // PASO 1 â€” Balance sheet
    const bsh = qs.balanceSheetHistory as
      { balanceSheetStatements?: Record<string, unknown>[] } | undefined;
    const bs0 = bsh?.balanceSheetStatements?.[0];
    const totalAssets = num(bs0?.totalAssets);
    const totalLiabilities = num(bs0?.totalLiab);
    const totalStockholderEquity = num(bs0?.totalStockholderEquity);
    const totalCurrentAssets = num(bs0?.totalCurrentAssets);
    const totalCurrentLiabilities = num(bs0?.totalCurrentLiabilities);
    const cashAndEquivalents = num(bs0?.cash);
    const shortLongTermDebt = num(bs0?.shortLongTermDebt);
    const longTermDebt = num(bs0?.longTermDebt);
    const totalDebtBalance =
      shortLongTermDebt != null || longTermDebt != null
        ? (shortLongTermDebt ?? 0) + (longTermDebt ?? 0)
        : null;
    const inventory = num(bs0?.inventory);
    const netReceivables = num(bs0?.netReceivables);
    const accountsPayable = num(bs0?.accountsPayable);
    const retainedEarnings = num(bs0?.retainedEarnings);

    const workingCapital =
      totalCurrentAssets != null && totalCurrentLiabilities != null
        ? totalCurrentAssets - totalCurrentLiabilities
        : null;
    const currentRatioCheck =
      totalCurrentAssets != null && totalCurrentLiabilities != null && totalCurrentLiabilities > 0
        ? Math.round((totalCurrentAssets / totalCurrentLiabilities) * 100) / 100
        : null;
    let currentRatioWarning: string | null = null;
    if (currentRatio != null && currentRatioCheck != null) {
      const diff =
        Math.abs(currentRatio - currentRatioCheck) / ((currentRatio + currentRatioCheck) / 2);
      if (diff > 0.1)
        currentRatioWarning = `Diferencia >10% entre currentRatio de financialData (${currentRatio.toFixed(2)}) y del balance (${currentRatioCheck.toFixed(2)}) â€” verificar perÃ­odo fiscal`;
    }

    // PASO 1 â€” Cash flow statement
    const cfh = qs.cashflowStatementHistory as
      { cashflowStatements?: Record<string, unknown>[] } | undefined;
    const cf0 = cfh?.cashflowStatements?.[0];
    const totalCashFromOperatingActivities = num(cf0?.totalCashFromOperatingActivities);
    const capitalExpenditures = num(cf0?.capitalExpenditures);
    const dividendsPaid = num(cf0?.dividendsPaid);
    let fcfCalculadoManual: number | null = null;
    let fcfWarning: string | null = null;
    if (totalCashFromOperatingActivities != null) {
      const capexAbs = capitalExpenditures != null ? Math.abs(capitalExpenditures) : 0;
      fcfCalculadoManual = totalCashFromOperatingActivities - capexAbs;
      if (freeCashflowRaw != null && fcfCalculadoManual != null) {
        const ratio =
          Math.abs(freeCashflowRaw) > 0
            ? Math.abs(fcfCalculadoManual - freeCashflowRaw) / Math.abs(freeCashflowRaw)
            : 0;
        if (ratio > 0.2) {
          fcfWarning = `FCF de financialData ($${(freeCashflowRaw / 1e6).toFixed(0)}M) difiere del calculado manual ($${(fcfCalculadoManual / 1e6).toFixed(0)}M) â€” source: financialData.freeCashflow vs CFO - Capex del cash flow statement`;
        }
      }
    }

    // PASO 1 â€” Income statement additional fields
    const incomeRows2 = (ish?.incomeStatementHistory ?? []) as Record<string, unknown>[];
    const is0 = incomeRows2[0] ?? {};

    // BLOQUE 5 — leverage operativo/financiero/combinado aproximado (Pascale 18.2-18.4).
    // Reutiliza la serie que YA trae incomeStatementHistory (totalRevenue, operatingIncome, netIncome).
    const leverage = calcularLeverageAproximado(
      (incomeRows2 as Record<string, unknown>[]).map((r) => ({
        totalRevenue: num(r.totalRevenue),
        operatingIncome: num(r.operatingIncome),
        netIncome: num(r.netIncome),
      })),
    );

    // BLOQUE 9.1 — ciclo de conversión de efectivo (Alonso/Sapetnitzky, PyMEs, secc. 4-5).
    // Reutiliza los campos ya derivados del balance/income (puntuales, no promedio móvil).
    const cicloConversion = calcularCicloConversionEfectivo({
      revenue: totalRevenue,
      costOfRevenue,
      inventory,
      netReceivables,
      accountsPayable,
    });
    const incomeBeforeTax = num(is0?.incomeBeforeTax);
    const incomeTaxExpense = num(is0?.incomeTaxExpense);
    const ebit = num(is0?.ebit);
    const interestExpense = num(is0?.interestExpense);
    const totalRevenue = num(is0?.totalRevenue);
    let researchDevelopment: number | null = num(is0?.researchDevelopment);
    const netIncomeFromIS = num(is0?.netIncome);
    const costOfRevenue = num(is0?.costOfRevenue);
    const dilutedAverageShares = num(is0?.dilutedAverageShares);

    let effectiveTaxRate: number | null = null;
    if (incomeBeforeTax != null && incomeBeforeTax > 0 && incomeTaxExpense != null) {
      effectiveTaxRate = Math.round((incomeTaxExpense / incomeBeforeTax) * 10000) / 100;
    }
    let rdToRevenuePct: number | null = null;
    if (researchDevelopment != null && totalRevenue != null && totalRevenue > 0) {
      rdToRevenuePct = Math.round((researchDevelopment / totalRevenue) * 10000) / 100;
    }

    let interestCoverageRatio: number | null = null;
    if (ebit != null && interestExpense != null && interestExpense !== 0) {
      interestCoverageRatio = Math.round((ebit / Math.abs(interestExpense)) * 100) / 100;
    }

    // fundamentalsTimeSeries: suplementa researchDevelopment si quoteSummary no lo trae
    if (researchDevelopment == null) {
      try {
        const fts: any = await yf.fundamentalsTimeSeries(symbol, {
          period1: "2020-01-01",
          type: "annual",
          module: "financials",
        });
        const last = fts?.length > 0 ? fts[fts.length - 1] : null;
        if (last) {
          const rdFts = last.researchDevelopment ?? last.researchAndDevelopment ?? null;
          if (rdFts != null && typeof rdFts === "number" && isFinite(rdFts)) {
            researchDevelopment = rdFts;
            if (totalRevenue != null && totalRevenue > 0) {
              rdToRevenuePct = Math.round((rdFts / totalRevenue) * 10000) / 100;
            }
          }
        }
      } catch {
        /* fundamentalsTimeSeries no disponible, se queda en null */
      }
    }

    // Shares outstanding for t-1 (dilutedAverageShares from income statement)
    const incomeRowsPrev = incomeRows2[1] ?? {};
    const dilutedAvgSharesPrev = num(incomeRowsPrev?.dilutedAverageShares);

    // PASO 1 â€” Governance
    const mhb = qs.majorHoldersBreakdown as Record<string, unknown> | undefined;
    const insidersPercentHeld =
      mhb?.insidersPercentHeld != null
        ? Math.round(num(mhb.insidersPercentHeld)! * 100) / 100
        : null;
    const institutionsPercentHeld =
      mhb?.institutionsPercentHeld != null
        ? Math.round(num(mhb.institutionsPercentHeld)! * 100) / 100
        : null;

    // Insider transactions
    const insiderTxRaw = qs.insiderTransactions as
      { transactions?: Record<string, unknown>[] } | undefined;
    const insiderTransactions: InsiderTxRow[] = (insiderTxRaw?.transactions ?? [])
      .slice(0, 5)
      .map((tx) => ({
        fecha: ((tx?.startDate as Record<string, unknown> | undefined)?.fmt as string) ?? "",
        filerName: String(tx?.filerName ?? ""),
        transactionText: String(tx?.transactionText ?? ""),
        shares: num(tx?.shares) ?? 0,
        value: num(tx?.value) ?? 0,
      }));

    // Rating changes
    const udh = qs.upgradeDowngradeHistory as { history?: Record<string, unknown>[] } | undefined;
    const ratingChanges: RatingChangeRow[] = (udh?.history ?? []).slice(0, 5).map((h) => ({
      fecha: (h?.epochGradeDate as number)
        ? new Date((h.epochGradeDate as number) * 1000).toISOString().split("T")[0]
        : "",
      firm: String(h?.firm ?? ""),
      toGrade: String(h?.toGrade ?? ""),
      fromGrade: String(h?.fromGrade ?? ""),
      action: String(h?.action ?? ""),
    }));

    // Governance — company officers & risk scores (desde assetProfile)
    const companyOfficers = (ap?.companyOfficers ?? []).slice(0, 5).map((o) => ({
      nombre: o.name ?? "—",
      cargo: o.title ?? "—",
      edad: o.age ?? null,
      compensacionAnual: o.totalPay?.raw ?? null,
    }));
    const governanceRiskScores = {
      auditRisk: ap?.auditRisk ?? null,
      boardRisk: ap?.boardRisk ?? null,
      compensationRisk: ap?.compensationRisk ?? null,
      shareHolderRightsRisk: ap?.shareHolderRightsRisk ?? null,
      overallRisk: ap?.overallRisk ?? null,
    };
    const or = governanceRiskScores.overallRisk;
    const governanceRiskLabel = or != null ? (or <= 3 ? "Bajo" : or <= 7 ? "Medio" : "Alto") : null;
    const governanceEpochDate = ap?.governanceEpochDate?.fmt ?? null;

    // ── Beta propio contrastado (3-6 meses) ──────────────────────────────
    let betaPropio: number | null = null;
    let betaR2: number | null = null;
    let betaBenchmarkUsado: "SPY" | "MERVAL" | null = null;
    let betaAdvertencia: string | null = null;
    try {
      console.error(`[fetchFundamentalAF] ${symbol} fetching chart data…`);
      const [assetCloses, spyCloses, mervCloses] = await Promise.all([
        withTimeout(yahooChartCloses(symbol, "6mo"), 20000, `chart:${symbol}`),
        withTimeout(yahooChartCloses("SPY", "6mo"), 20000, "chart:SPY"),
        withTimeout(yahooChartCloses("^MERV", "6mo"), 20000, "chart:MERV"),
      ]);
      console.error(
        `[fetchFundamentalAF] ${symbol} chart data: asset=${assetCloses?.length ?? 0}, spy=${spyCloses?.length ?? 0}, merv=${mervCloses?.length ?? 0}`,
      );
      const {
        beta: b,
        r2,
        benchmark,
      } = computeBeta(
        assetCloses.map((c) => c.close),
        spyCloses.map((c) => c.close),
        mervCloses.map((c) => c.close),
      );
      betaPropio = b;
      betaR2 = r2;
      betaBenchmarkUsado = benchmark as "SPY" | "MERVAL" | null;
      if (betaPropio != null && beta != null && Math.abs(betaPropio - beta) > 0.5) {
        betaAdvertencia = `Beta de Yahoo Finance (${beta.toFixed(2)}) difiere significativamente del beta calculado con datos propios (${betaPropio.toFixed(2)}, R²=${r2?.toFixed(2) ?? "N/A"}) — usar con cautela en WACC/DCF.`;
      }
    } catch {
      // beta propio no disponible — continuar con nulls
    }

    // ── Earnings Trend: momentum de revisiones de analistas ─────────────
    let revisionEstimadosPct: number | null = null;
    let revisionEstimadosDetalle: string | null = null;
    const et = qs.earningsTrend as { trend?: Record<string, unknown>[] } | undefined;
    if (et?.trend && Array.isArray(et.trend) && et.trend.length > 0) {
      try {
        const t0 = et.trend[0];
        const ee = t0?.epsEstimate;

        // Yahoo-finance2 normaliza epsEstimate a number (current estimate).
        // Si es objeto con sub-campos, extraemos current/30d/90d del raw.
        let currentVal: number | null = null;
        let val30: number | null = null;
        let val90: number | null = null;

        if (typeof ee === "number") {
          currentVal = ee;
        } else if (ee && typeof ee === "object") {
          currentVal = num((ee as Record<string, unknown>).current);
          val30 = num((ee as Record<string, unknown>)["30daysAgo"]);
          val90 = num((ee as Record<string, unknown>)["90daysAgo"]);
        }

        if (currentVal != null && currentVal !== 0) {
          if (val90 != null && val90 !== 0) {
            revisionEstimadosPct =
              Math.round(((currentVal - val90) / Math.abs(val90)) * 10000) / 100;
          } else if (val30 != null && val30 !== 0) {
            revisionEstimadosPct =
              Math.round(((currentVal - val30) / Math.abs(val30)) * 10000) / 100;
          }
          if (revisionEstimadosPct != null) {
            const dir =
              revisionEstimadosPct > 0
                ? "al alza"
                : revisionEstimadosPct < 0
                  ? "a la baja"
                  : "sin cambios";
            revisionEstimadosDetalle = `Revisiones de EPS ${dir} en los últimos ${val90 != null ? "90" : "30"} días: ${revisionEstimadosPct > 0 ? "+" : ""}${revisionEstimadosPct}%.`;
          }
        }
      } catch {
        // earnings trend parsing failed — leave nulls
      }
    }

    // ── Recommendation Trend (tendencia de recomendaciones de analistas) ──
    let recommendationTrend: {
      strongBuy: number;
      buy: number;
      hold: number;
      sell: number;
      strongSell: number;
    } | null = null;
    const rt = qs.recommendationTrend as { trend?: Record<string, unknown>[] } | undefined;
    if (rt?.trend && Array.isArray(rt.trend) && rt.trend.length > 0) {
      try {
        const latest = rt.trend[0];
        const strongBuy = num(latest?.strongBuy) ?? 0;
        const buy = num(latest?.buy) ?? 0;
        const hold = num(latest?.hold) ?? 0;
        const sell = num(latest?.sell) ?? 0;
        const strongSell = num(latest?.strongSell) ?? 0;
        const total = strongBuy + buy + hold + sell + strongSell;
        if (total > 0) {
          recommendationTrend = { strongBuy, buy, hold, sell, strongSell };
        }
      } catch {
        // recommendation trend parsing failed
      }
    }

    // ── Net Share Purchase Activity (insiders) ─────────────────────────
    let insiderNetActivityPct: number | null = null;
    let insiderNetActivityInterpretacion: string | null = null;
    const nsp = qs.netSharePurchaseActivity as Record<string, unknown> | undefined;
    if (nsp) {
      const buyShares = num(nsp.buyInfoShares) ?? 0;
      const sellShares = num(nsp.sellInfoShares) ?? 0;
      const total = buyShares + sellShares;
      if (total > 0) {
        insiderNetActivityPct = Math.round(((buyShares - sellShares) / total) * 10000) / 100;
        if (buyShares > 0 && buyShares > sellShares * 1.5) {
          insiderNetActivityInterpretacion = `Compra neta de insiders (${insiderNetActivityPct > 0 ? "+" : ""}${insiderNetActivityPct}% del volumen transado) — señal positiva. Las compras de insiders son una señal fuerte y menos ambigua que las ventas.`;
        } else if (sellShares > buyShares * 3) {
          insiderNetActivityInterpretacion = `Venta neta de insiders (${insiderNetActivityPct}% del volumen). Las ventas pueden deberse a diversificación o ejercicio de opciones; no son automáticamente negativas. Monitorear consistencia.`;
        } else {
          insiderNetActivityInterpretacion = `Actividad de insiders balanceada (compras ${buyShares > 0 ? ((buyShares / total) * 100).toFixed(0) : "0"}% del volumen). Sin sesgo direccional claro.`;
        }
      }
    }

    // ── SEC Filings ────────────────────────────────────────────────────
    const sf = qs.secFilings as { filings?: Record<string, unknown>[] } | undefined;
    const secFilings: FilingRow[] = (sf?.filings ?? [])
      .filter((f: Record<string, unknown>) => {
        const type = String(f?.type ?? "").toUpperCase();
        return type.includes("10-K") || type.includes("10-Q");
      })
      .slice(0, 3)
      .map((f: Record<string, unknown>) => ({
        date: (f?.filingDate as Record<string, unknown> | undefined)?.fmt
          ? String((f.filingDate as Record<string, unknown>).fmt)
          : String(f?.filingDate ?? "").slice(0, 10),
        type: String(f?.type ?? ""),
        url: String(f?.edgarUrl ?? f?.edgarLink ?? ""),
        description: String(f?.title ?? f?.description ?? "").slice(0, 200),
      }));

    // 10y price stats from chart data
    const chartQuotes =
      (chartRows?.quotes as Array<{ date?: Date | null; close?: number | null }> | undefined) ?? [];
    const timestamps: number[] = [];
    const closes: number[] = [];
    for (const q of chartQuotes) {
      if (typeof q.close === "number" && isFinite(q.close) && q.close > 0) {
        closes.push(q.close);
        if (q.date) timestamps.push(q.date.getTime() / 1000);
      }
    }

    let min10y: number | null = null;
    let max10y: number | null = null;
    let avg10y: number | null = null;
    let pricePercentile10y: number | null = null;

    if (closes.length > 0) {
      min10y = closes.reduce((a, b) => Math.min(a, b), closes[0]);
      max10y = closes.reduce((a, b) => Math.max(a, b), closes[0]);
      avg10y = closes.reduce((a, b) => a + b, 0) / closes.length;
      const ref = currentPrice ?? closes[closes.length - 1];
      const range = max10y - min10y;
      pricePercentile10y =
        range > 0 ? Math.max(0, Math.min(100, ((ref - min10y) / range) * 100)) : 50;
    }

    // P/E historico
    const incomeRows = (ish?.incomeStatementHistory ?? []) as Record<string, unknown>[];
    const peHistory: PeHistoryPoint[] = [];

    console.log(
      `[PE-HISTORY] ${symbol}: incomeRows=${incomeRows.length} chartTimestamps=${timestamps.length} closes=${closes.length} sharesOutstanding=${sharesOutstanding}`,
    );

    if (incomeRows.length > 0 && timestamps.length > 0) {
      if (incomeRows[0]?.endDate) {
        const raw = incomeRows[0].endDate;
        console.log(
          `[PE-HISTORY] ${symbol}: first endDate type=${typeof raw} value=${JSON.stringify(raw)}`,
        );
        console.log(
          `[PE-HISTORY] ${symbol}: chart range ${new Date(timestamps[0] * 1000).toISOString().slice(0, 10)} to ${new Date(timestamps[timestamps.length - 1] * 1000).toISOString().slice(0, 10)}`,
        );
      }
    }

    if (
      sharesOutstanding !== null &&
      sharesOutstanding > 0 &&
      incomeRows.length > 0 &&
      timestamps.length > 0
    ) {
      let matchedCount = 0;
      let skippedNoPE = 0;
      let skippedNegEPS = 0;
      let skippedDupYear = 0;
      for (const row of incomeRows) {
        const endDateTs = numDate(row.endDate);
        const netIncome = num(row.netIncome);
        if (!endDateTs || netIncome === null || netIncome <= 0) {
          console.log(
            `[PE-HISTORY] ${symbol}: skip row: endDateTs=${endDateTs} netIncome=${netIncome}`,
          );
          continue;
        }
        const eps = netIncome / sharesOutstanding;
        if (eps <= 0) {
          skippedNegEPS++;
          continue;
        }
        const endDate = new Date(endDateTs * 1000);
        const endYear = endDate.getFullYear();
        const targetTs = endDateTs;
        let bestIdx = -1;
        let bestDiff = Infinity;
        for (let i = 0; i < timestamps.length; i++) {
          const diff = Math.abs(timestamps[i] - targetTs);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i;
          }
        }
        const diffDays = bestDiff / 86400;
        const bestDate =
          bestIdx >= 0 ? new Date(timestamps[bestIdx] * 1000).toISOString().slice(0, 10) : "N/A";
        console.log(
          `[PE-HISTORY] ${symbol} FY${endYear} end=${endDate.toISOString().slice(0, 10)} ni=$${(netIncome / 1e6).toFixed(0)}M eps=$${eps.toFixed(2)} closestChart=${bestDate} diff=${diffDays.toFixed(0)}d price=$${bestIdx >= 0 ? closes[bestIdx].toFixed(2) : "N/A"}`,
        );
        if (bestIdx >= 0) {
          const price = closes[bestIdx];
          const pe = price / eps;
          if (pe > 0 && pe < 500) {
            if (!peHistory.find((x) => x.year === endYear)) {
              peHistory.push({ year: endYear, pe: Math.round(pe * 10) / 10, eps });
              matchedCount++;
              console.log(`[PE-HISTORY] ${symbol} FY${endYear} ➜ PE=${Math.round(pe * 10) / 10} ✓`);
            } else {
              skippedDupYear++;
            }
          } else {
            skippedNoPE++;
            console.log(
              `[PE-HISTORY] ${symbol} FY${endYear} ➜ PE=${pe?.toFixed(1)} fuera de rango (0-500) ✗`,
            );
          }
        } else {
          console.log(`[PE-HISTORY] ${symbol} FY${endYear} ➜ no matching chart timestamp ✗`);
        }
      }
      peHistory.sort((a, b) => a.year - b.year);
      console.log(
        `[PE-HISTORY] ${symbol} final: ${peHistory.length} points (matched=${matchedCount} skippedNegEPS=${skippedNegEPS} skippedNoPE=${skippedNoPE} skippedDupYear=${skippedDupYear})`,
      );
      console.log(
        `[PE-HISTORY] ${symbol} P/E values: [${peHistory.map((p) => `${p.year}:${p.pe}`).join(", ")}]`,
      );
    } else {
      console.log(
        `[PE-HISTORY] ${symbol}: skipped entirely. sharesOutstanding=${sharesOutstanding} incomeRows=${incomeRows.length} timestamps=${timestamps.length}`,
      );
    }

    let pePercentile: number | null = null;
    if (trailingPE !== null && peHistory.length >= 2) {
      const values = peHistory.map((x) => x.pe);
      const below = values.filter((v) => v <= trailingPE).length;
      pePercentile = Math.round((below / values.length) * 100);
    }

    // PEG historico
    const pegValues: number[] = [];
    for (let i = 1; i < peHistory.length; i++) {
      const prev = peHistory[i - 1];
      const curr = peHistory[i];
      if (prev.eps > 0 && curr.pe > 0) {
        const epsGrowth = (curr.eps - prev.eps) / Math.abs(prev.eps);
        if (epsGrowth > 0) {
          const peg = curr.pe / (epsGrowth * 100);
          if (peg > 0 && peg < 50) {
            pegValues.push(Math.round(peg * 100) / 100);
            curr.peg = Math.round(peg * 100) / 100;
          }
        }
      }
    }
    let pegPercentile: number | null = null;
    if (pegRatio !== null && pegValues.length >= 2) {
      const below = pegValues.filter((v) => v <= pegRatio).length;
      pegPercentile = Math.round((below / pegValues.length) * 100);
    }

    // Health Score historico (aÃ±o por aÃ±o)
    const healthScoreHistory: { year: number; score: number }[] = [];
    const balRows = (bsh?.balanceSheetStatements ?? []) as Record<string, unknown>[];

    if (incomeRows.length > 0) {
      let prevRevenue: number | null = null;
      let prevEarnings: number | null = null;

      for (let ri = 0; ri < incomeRows.length; ri++) {
        const row = incomeRows[ri];
        const netInc = num(row.netIncome);
        const rev = num(row.totalRevenue);
        const endTs = numDate(row.endDate);
        if (!endTs || netInc === null || rev === null || rev <= 0) continue;
        const year = new Date(endTs * 1000).getFullYear();

        let yearScore = 0;
        let yearMax = 0;

        // Net margin (max 30 pts)
        const nm = (netInc / rev) * 100;
        yearMax += 30;
        if (nm >= 20) yearScore += 30;
        else if (nm >= 10) yearScore += 20;
        else if (nm >= 5) yearScore += 10;
        else if (nm > 0) yearScore += 5;

        // ROE from matching balance sheet (max 25 pts)
        const balRow = balRows.find((b) => {
          const bEndTs = numDate(b.endDate);
          return bEndTs && Math.abs((bEndTs - endTs) / 86400) < 400;
        });
        const equity = balRow ? num(balRow.totalStockholderEquity) : null;
        yearMax += 25;
        if (equity !== null && equity > 0) {
          const roe = (netInc / equity) * 100;
          if (roe >= 20) yearScore += 25;
          else if (roe >= 12) yearScore += 18;
          else if (roe >= 5) yearScore += 10;
          else if (roe > 0) yearScore += 3;
        } else if (nm > 0) {
          // fallback: usar net margin como proxy
          yearScore += Math.min(15, Math.round(nm));
        }

        // Revenue growth vs prev year (max 25 pts)
        yearMax += 25;
        if (prevRevenue !== null && prevRevenue > 0) {
          const rg = ((rev - prevRevenue) / prevRevenue) * 100;
          if (rg >= 15) yearScore += 25;
          else if (rg >= 8) yearScore += 18;
          else if (rg >= 0) yearScore += 10;
          else if (rg > -10) yearScore += 3;
        }
        prevRevenue = rev;

        // Earnings growth vs prev year (max 20 pts)
        yearMax += 20;
        if (prevEarnings !== null && prevEarnings > 0) {
          const eg = ((netInc - prevEarnings) / prevEarnings) * 100;
          if (eg >= 15) yearScore += 20;
          else if (eg >= 8) yearScore += 14;
          else if (eg >= 0) yearScore += 8;
          else if (eg > -15) yearScore += 3;
        }
        prevEarnings = netInc;

        const finalScore = yearMax > 0 ? Math.round((yearScore / yearMax) * 100) : 0;
        healthScoreHistory.push({ year, score: finalScore });
      }
      healthScoreHistory.sort((a, b) => a.year - b.year);
    }

    // Benchmark data (SPY)
    let benchmarkPrice: number | null = null;
    let benchmarkMarketCapM: number | null = null;
    let benchmarkBeta: number | null = null;
    let benchmarkName: string | null = null;
    try {
      const spyBatch1 = yf
        .quoteSummary("SPY", { modules: ["price", "summaryDetail", "defaultKeyStatistics"] })
        .catch(() => null);
      const spyBatch2 = yf.quoteSummary("SPY", { modules: ["financialData"] }).catch(() => null);
      const [spyQs1, spyQs2] = await Promise.all([spyBatch1, spyBatch2]);
      const spyQs = spyQs1 ?? spyQs2;
      if (spyQs) {
        const spySd = spyQs1?.summaryDetail as Record<string, unknown> | undefined;
        const spyPr = spyQs1?.price as Record<string, unknown> | undefined;
        const spyKs = spyQs1?.defaultKeyStatistics as Record<string, unknown> | undefined;
        const spyFd = spyQs2?.financialData as Record<string, unknown> | undefined;
        benchmarkPrice =
          num(spyFd?.currentPrice) ??
          num(spySd?.regularMarketPrice) ??
          num(spyPr?.regularMarketPrice);
        const bmCapRaw =
          num(spyKs?.marketCap) ||
          num(spySd?.marketCap) ||
          num(spyPr?.marketCap) ||
          num(spyFd?.totalAssets) ||
          num(spyKs?.totalNetAssets) ||
          num(spySd?.totalNetAssets) ||
          (() => {
            // Last resort: try price.regularMarketPreviousClose * sharesOutstanding for ETFs
            const close = num(spyPr?.regularMarketPreviousClose);
            const shares = num(spyKs?.sharesOutstanding);
            return close != null && shares != null ? close * shares : null;
          })();
        benchmarkMarketCapM = bmCapRaw !== null ? bmCapRaw / 1_000_000 : null;
        benchmarkBeta = num(spyKs?.beta) ?? num(spySd?.beta);
        benchmarkName = "SPY";
      }
    } catch {
      /* benchmark fetch is optional */
    }

    // PEG implied growth rate (tasa que Yahoo usa para el cálculo)
    const pegImpliedGrowthRate =
      pegRatio !== null && pegRatio > 0 && trailingPE !== null && trailingPE > 0
        ? trailingPE / pegRatio / 100 // e.g. PEG=2.49, PE=37.3 → growth=14.98%
        : null;

    // Scoring fundamental (0-100) — pesos fijos que suman 100
    const SCORE_WEIGHTS = {
      roe: 20,
      revGrowth: 20,
      fcfYield: 10,
      pe: 10,
      de: 15,
      margenNeto: 15,
      upside: 0,
      earningsGrowth: 10,
    }; // suma = 100 (upside se elimina por Riquelme — no usar precios objetivo de analistas)

    const scoreDetails: ScoreDetail[] = [];

    if (returnOnEquity !== null) {
      const roe = returnOnEquity * 100;
      const pts =
        roe >= 100
          ? SCORE_WEIGHTS.roe
          : roe >= 50
            ? 18
            : roe >= 20
              ? 15
              : roe >= 12
                ? 10
                : roe >= 5
                  ? 5
                  : 0;
      scoreDetails.push({
        metric: "ROE",
        valor: `${roe.toFixed(1)}%`,
        pts,
        maxPts: SCORE_WEIGHTS.roe,
      });
    }
    if (revenueGrowth !== null) {
      const g = revenueGrowth * 100;
      const pts =
        g >= 80
          ? SCORE_WEIGHTS.revGrowth
          : g >= 50
            ? 18
            : g >= 15
              ? 15
              : g >= 8
                ? 10
                : g >= 0
                  ? 5
                  : 0;
      scoreDetails.push({
        metric: "Crecimiento ingresos",
        valor: `${g.toFixed(1)}%`,
        pts,
        maxPts: SCORE_WEIGHTS.revGrowth,
      });
    }
    if (fcfYield !== null) {
      const fy = fcfYield * 100;
      const pts = fy >= 6 ? SCORE_WEIGHTS.fcfYield : fy >= 3 ? 7 : fy >= 0 ? 3 : 0;
      scoreDetails.push({
        metric: "FCF Yield",
        valor: `${fy.toFixed(1)}%`,
        pts,
        maxPts: SCORE_WEIGHTS.fcfYield,
      });
    }
    if (trailingPE !== null) {
      const pts =
        trailingPE < 15
          ? SCORE_WEIGHTS.pe
          : trailingPE < 25
            ? 8
            : trailingPE < 35
              ? 5
              : trailingPE < 50
                ? 3
                : 1;
      scoreDetails.push({
        metric: "P/E Trailing",
        valor: `${trailingPE.toFixed(1)}x`,
        pts,
        maxPts: SCORE_WEIGHTS.pe,
      });
    }
    if (debtToEquityRaw !== null) {
      const pts =
        debtToEquityRaw < 50
          ? SCORE_WEIGHTS.de
          : debtToEquityRaw < 100
            ? 10
            : debtToEquityRaw < 200
              ? 5
              : 0;
      scoreDetails.push({
        metric: "Deuda / Patrimonio",
        valor: `${(debtToEquityRaw / 100).toFixed(2)}x`,
        pts,
        maxPts: SCORE_WEIGHTS.de,
      });
    }
    if (profitMargin !== null) {
      const pm = profitMargin * 100;
      const pts = pm >= 20 ? SCORE_WEIGHTS.margenNeto : pm >= 10 ? 10 : pm >= 0 ? 5 : 0;
      scoreDetails.push({
        metric: "Margen neto",
        valor: `${pm.toFixed(1)}%`,
        pts,
        maxPts: SCORE_WEIGHTS.margenNeto,
      });
    }
    // Upside de analistas excluido — Riquelme: no usar precios objetivo de terceros para valor intrinseco propio
    if (earningsGrowth !== null) {
      const eg = earningsGrowth * 100;
      const pts =
        eg >= 80
          ? SCORE_WEIGHTS.earningsGrowth
          : eg >= 50
            ? 9
            : eg >= 20
              ? 7
              : eg >= 10
                ? 5
                : eg >= 0
                  ? 3
                  : 0;
      scoreDetails.push({
        metric: "Crecimiento ganancias",
        valor: `${eg.toFixed(1)}%`,
        pts,
        maxPts: SCORE_WEIGHTS.earningsGrowth,
      });
    }

    const earnedPts = scoreDetails.reduce((s, d) => s + d.pts, 0);
    const maxPossible = scoreDetails.reduce((s, d) => s + d.maxPts, 0);
    const fundScoreRaw = maxPossible > 0 ? Math.round((earnedPts / maxPossible) * 100) : 0;
    const fundScoreAbsolute = earnedPts; // sobre base fija 100, métricas sin dato = 0
    const metricsAvailable = scoreDetails.length;
    const dataCoverage = metricsAvailable / 7;

    const esETF = (qs.price as Record<string, unknown> | undefined)?.quoteType === "ETF";

    // SeÃ±al de inversion — consolidada en coherencia-senal.ts
    let plazo: string, accion: string;
    if (esETF) {
      plazo = "—";
      accion = "Ver Análisis Técnico";
    } else {
      const senal = resolverSenalCoherente(
        fundScoreRaw,
        pricePercentile10y,
        revenueGrowth,
        upsidePct,
        recommendationMean,
        pePercentile,
      );
      plazo = senal.plazo;
      accion = senal.accion;
    }

    return {
      symbol,
      companyName,
      sector,
      industry,
      country,
      pegImpliedGrowthRate,
      currentPrice,
      marketCapM,
      trailingPE: esETF ? null : trailingPE,
      forwardPE: esETF ? null : forwardPE,
      pegRatio: esETF ? null : pegRatio,
      priceToBook: esETF ? null : priceToBook,
      evToEbitda: esETF ? null : evToEbitda,
      returnOnEquity: esETF ? null : returnOnEquity,
      returnOnAssets,
      profitMargin: esETF ? null : profitMargin,
      operatingMargin,
      grossMargin,
      revenueGrowth: esETF ? null : revenueGrowth,
      earningsGrowth: esETF ? null : earningsGrowth,
      debtToEquityRaw: esETF ? null : debtToEquityRaw,
      leverage,
      cicloConversion,
      currentRatio,
      quickRatio,
      freeCashflowM,
      fcfYield,
      dividendYield,
      payoutRatio,
      targetMeanPrice: esETF ? null : targetMeanPrice,
      targetLowPrice: esETF ? null : targetLowPrice,
      targetHighPrice: esETF ? null : targetHighPrice,
      recommendationMean: esETF ? null : recommendationMean,
      numberOfAnalystOpinions: esETF ? null : numberOfAnalystOpinions,
      upsidePct: esETF ? null : upsidePct,
      beta,
      betaAnomalo,
      betaPropio,
      betaR2,
      betaBenchmarkUsado,
      betaAdvertencia,
      revisionEstimadosPct,
      revisionEstimadosDetalle,
      insiderNetActivityPct,
      insiderNetActivityInterpretacion,
      recommendationTrend,
      secFilings,
      benchmarkPrice,
      benchmarkMarketCapM,
      benchmarkBeta,
      benchmarkName,
      sharesOutstanding,
      min10y,
      max10y,
      avg10y,
      pricePercentile10y,
      peHistory: esETF ? [] : peHistory,
      pePercentile: esETF ? null : pePercentile,
      pegPercentile,
      fundScore: esETF ? 0 : fundScoreRaw,
      fundScoreRaw: esETF ? 0 : fundScoreRaw,
      fundScoreAbsolute: esETF ? 0 : fundScoreAbsolute,
      dataCoverage: esETF ? 0 : dataCoverage,
      metricsAvailable: esETF ? 0 : metricsAvailable,
      metricsTotal: 7,
      rawPts: esETF ? 0 : earnedPts,
      maxPts: esETF ? 0 : maxPossible,
      scoreDetails: esETF ? [] : scoreDetails,
      healthScoreHistory: esETF ? [] : healthScoreHistory,
      longBusinessSummary,
      quoteType: (qs.price as Record<string, unknown> | undefined)?.quoteType
        ? String((qs.price as Record<string, unknown>).quoteType)
        : null,
      esETF,
      plazo,
      accion,
      error: null,
      totalAssets,
      totalLiabilities,
      totalStockholderEquity,
      totalCurrentAssets,
      totalCurrentLiabilities,
      cashAndEquivalents,
      totalDebtBalance,
      workingCapital,
      currentRatioCheck,
      currentRatioWarning,
      totalCashFromOperatingActivities,
      capitalExpenditures,
      dividendsPaid,
      fcfCalculadoManual,
      fcfWarning,
      incomeBeforeTax,
      incomeTaxExpense,
      ebit,
      interestExpense,
      effectiveTaxRate,
      interestCoverageRatio,
      totalRevenue,
      researchDevelopment,
      rdToRevenuePct,
      netIncomeFromIS: netIncomeFromIS,
      netReceivables,
      inventory,
      accountsPayable,
      costOfRevenue,
      retainedEarnings,
      dilutedAverageShares,
      trailingEps,
      freeCashflowRaw,
      _riesgoPaisPct: 0,
      insidersPercentHeld,
      institutionsPercentHeld,
      insiderTransactions,
      ratingChanges,
      companyOfficers,
      governanceRiskScores,
      governanceRiskLabel,
      governanceEpochDate,
    };
  } catch (e) {
    return {
      ...empty,
      error: e instanceof Error ? e.message : "Error desconocido al consultar Yahoo Finance",
    };
  }
}

// ─── fetchFundamentalAFBatch (usa fetchYahooQuoteSummaryJson directo — patrón market-insights-hub-main) ─

const BATCH_MODULES = [
  "assetProfile",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
  "price",
  "earnings",
  "recommendationTrend",
  "majorHoldersBreakdown",
  "institutionOwnership",
];

async function fetchOneFund(symbol: string): Promise<FundamentalAFResult> {
  const empty: FundamentalAFResult = {
    symbol,
    error: null,
    companyName: null,
    sector: null,
    industry: null,
    country: null,
    pegImpliedGrowthRate: null,
    currentPrice: null,
    marketCapM: null,
    trailingPE: null,
    forwardPE: null,
    pegRatio: null,
    priceToBook: null,
    evToEbitda: null,
    returnOnEquity: null,
    returnOnAssets: null,
    profitMargin: null,
    operatingMargin: null,
    grossMargin: null,
    revenueGrowth: null,
    earningsGrowth: null,
    debtToEquityRaw: null,
    leverage: null,
    cicloConversion: null,
    currentRatio: null,
    quickRatio: null,
    freeCashflowM: null,
    fcfYield: null,
    dividendYield: null,
    payoutRatio: null,
    targetMeanPrice: null,
    targetLowPrice: null,
    targetHighPrice: null,
    recommendationMean: null,
    numberOfAnalystOpinions: null,
    upsidePct: null,
    beta: null,
    recommendationTrend: null,
    betaAnomalo: false,
    betaPropio: null,
    betaR2: null,
    betaBenchmarkUsado: null,
    betaAdvertencia: null,
    revisionEstimadosPct: null,
    revisionEstimadosDetalle: null,
    insiderNetActivityPct: null,
    insiderNetActivityInterpretacion: null,
    secFilings: [],
    benchmarkPrice: null,
    benchmarkMarketCapM: null,
    benchmarkBeta: null,
    benchmarkName: null,
    sharesOutstanding: null,
    min10y: null,
    max10y: null,
    avg10y: null,
    pricePercentile10y: null,
    peHistory: [],
    pePercentile: null,
    pegPercentile: null,
    fundScore: 0,
    fundScoreRaw: 0,
    fundScoreAbsolute: 0,
    dataCoverage: 0,
    metricsAvailable: 0,
    metricsTotal: 7,
    rawPts: 0,
    maxPts: 0,
    scoreDetails: [],
    healthScoreHistory: [],
    plazo: "",
    accion: "",
    totalAssets: null,
    totalLiabilities: null,
    totalStockholderEquity: null,
    totalCurrentAssets: null,
    totalCurrentLiabilities: null,
    cashAndEquivalents: null,
    totalDebtBalance: null,
    workingCapital: null,
    currentRatioCheck: null,
    currentRatioWarning: null,
    totalCashFromOperatingActivities: null,
    capitalExpenditures: null,
    dividendsPaid: null,
    fcfCalculadoManual: null,
    fcfWarning: null,
    incomeBeforeTax: null,
    incomeTaxExpense: null,
    ebit: null,
    interestExpense: null,
    effectiveTaxRate: null,
    interestCoverageRatio: null,
    insidersPercentHeld: null,
    institutionsPercentHeld: null,
    insiderTransactions: [],
    ratingChanges: [],
    companyOfficers: [],
    governanceRiskScores: {
      auditRisk: null,
      boardRisk: null,
      compensationRisk: null,
      shareHolderRightsRisk: null,
      overallRisk: null,
    },
    governanceRiskLabel: null,
    governanceEpochDate: null,
    totalRevenue: null,
    researchDevelopment: null,
    rdToRevenuePct: null,
    netIncomeFromIS: null,
    netReceivables: null,
    inventory: null,
    accountsPayable: null,
    costOfRevenue: null,
    retainedEarnings: null,
    dilutedAverageShares: null,
    trailingEps: null,
    freeCashflowRaw: null,
    _riesgoPaisPct: 0,
    longBusinessSummary: null,
    quoteType: null,
    esETF: false,
  };
  try {
    const resp = await fetchYahooQuoteSummaryJson<any>(symbol, BATCH_MODULES);
    if (!resp.json?.quoteSummary?.result?.[0]) {
      return {
        ...empty,
        error: resp.json?.quoteSummary?.error?.description ?? `Yahoo ${resp.status}`,
      };
    }
    const r = resp.json.quoteSummary.result[0];
    const ap = r.assetProfile ?? {};
    const sd = r.summaryDetail ?? {};
    const fd = r.financialData ?? {};
    const dks = r.defaultKeyStatistics ?? {};
    const pr = r.price ?? {};
    const mh = r.majorHoldersBreakdown ?? {};

    const n = (v: unknown) => {
      if (typeof v === "number" && isFinite(v)) return v;
      if (v && typeof v === "object") {
        const x = (v as any).raw;
        if (typeof x === "number" && isFinite(x)) return x;
      }
      return null;
    };
    const p = (o: any, ...ks: string[]) => {
      if (!o) return null;
      for (const k of ks) {
        const v = n(o[k]);
        if (v != null) return v;
      }
      return null;
    };

    const currentPrice =
      n(pr.regularMarketPrice) ?? n(fd.currentPrice) ?? p(sd, "regularMarketPrice");
    const marketCap = n(pr.marketCap) ?? n(fd.marketCap) ?? p(sd, "marketCap");
    const trailingPE = p(sd, "trailingPE") ?? p(dks, "trailingPE") ?? p(fd, "trailingPE");
    const forwardPE = p(sd, "forwardPE") ?? p(dks, "forwardPE") ?? p(fd, "forwardPE");
    const priceToBook = p(sd, "priceToBook") ?? p(dks, "priceToBook");
    const roe = n(fd.returnOnEquity);
    const profitMargin = n(fd.profitMargins);
    const revGrowth = n(fd.revenueGrowth);
    const earnGrowth = n(fd.earningsGrowth);
    const dte = n(fd.debtToEquity);
    const fcf = n(fd.freeCashflow) ?? n(dks.freeCashflow);
    const divYield = n(sd.dividendYield) ?? n(fd.dividendYield);
    const targetPrice = n(fd.targetMeanPrice);
    const recMean = n(fd.recommendationMean);
    const numAnalysts = n(fd.numberOfAnalystOpinions) ?? n(dks.numberOfAnalystEstimates);
    const sharesOut = n(sd.sharesOutstanding) ?? n(dks.sharesOutstanding);

    // Recommendation trend from recommendationTrend module
    let recommendationTrend: {
      strongBuy: number;
      buy: number;
      hold: number;
      sell: number;
      strongSell: number;
    } | null = null;
    const rt = r.recommendationTrend as { trend?: Record<string, unknown>[] } | undefined;
    if (rt?.trend && Array.isArray(rt.trend) && rt.trend.length > 0) {
      try {
        const latest = rt.trend[0];
        const strongBuy = n(latest?.strongBuy) ?? 0;
        const buy = n(latest?.buy) ?? 0;
        const hold = n(latest?.hold) ?? 0;
        const sell = n(latest?.sell) ?? 0;
        const strongSell = n(latest?.strongSell) ?? 0;
        const total = strongBuy + buy + hold + sell + strongSell;
        if (total > 0) {
          recommendationTrend = { strongBuy, buy, hold, sell, strongSell };
        }
      } catch {
        // recommendation trend parsing failed
      }
    }

    const peg =
      trailingPE != null && earnGrowth != null && earnGrowth > 0
        ? Math.round((trailingPE / (earnGrowth * 100)) * 100) / 100
        : null;
    const upside =
      targetPrice != null && currentPrice != null && currentPrice > 0
        ? (targetPrice - currentPrice) / currentPrice
        : null;

    return {
      ...empty,
      companyName: pr.longName ?? ap.longName ?? null,
      sector: ap.sector ?? null,
      industry: ap.industry ?? null,
      country: ap.country ?? null,
      longBusinessSummary: ap.longBusinessSummary ?? null,
      currentPrice,
      marketCapM: marketCap != null ? Math.round(marketCap / 1_000_000) : null,
      trailingPE: trailingPE != null ? Math.round(trailingPE * 100) / 100 : null,
      forwardPE: forwardPE != null ? Math.round(forwardPE * 100) / 100 : null,
      pegRatio: peg,
      priceToBook: priceToBook != null ? Math.round(priceToBook * 100) / 100 : null,
      evToEbitda: n(fd.enterpriseToEbitda) ?? n(dks.enterpriseToEbitda) ?? null,
      returnOnEquity: roe != null ? Math.round(roe * 10000) / 100 : null,
      profitMargin: profitMargin != null ? Math.round(profitMargin * 10000) / 100 : null,
      revenueGrowth: revGrowth != null ? Math.round(revGrowth * 10000) / 100 : null,
      earningsGrowth: earnGrowth != null ? Math.round(earnGrowth * 10000) / 100 : null,
      debtToEquityRaw: dte != null ? Math.round(dte * 100) / 100 : null,
      freeCashflowM: fcf != null ? Math.round(fcf / 1_000_000) : null,
      fcfYield: n(dks.freeCashflowYield) ?? null,
      dividendYield: divYield,
      targetMeanPrice: targetPrice,
      recommendationMean: recMean,
      numberOfAnalystOpinions: numAnalysts,
      upsidePct: upside,
      recommendationTrend,
      sharesOutstanding: sharesOut,
      totalRevenue: n(fd.totalRevenue),
      ebit: n(fd.ebitda),
      totalDebtBalance: n(fd.totalDebt),
      totalCash: n(fd.totalCash),
      insidersPercentHeld: n(mh.insiderPercentHeld) ?? n((mh as any).insidersPercentHeld) ?? null,
      institutionsPercentHeld:
        n(mh.institutionPercentHeld) ?? n((mh as any).institutionsPercentHeld) ?? null,
      quoteType: pr.quoteType ?? null,
      esETF: pr.quoteType === "ETF",
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Error al consultar Yahoo" };
  }
}

export const fetchFundamentalAFBatch = createServerFn({ method: "POST" })
  .inputValidator((d: { symbols: string[]; batchSize?: number }) =>
    z
      .object({
        symbols: z.array(z.string().min(1).max(20)).min(1).max(50),
        batchSize: z.number().min(1).max(10).optional().default(4),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<FundamentalAFResult[]> => {
    const { symbols, batchSize } = data;
    const results: FundamentalAFResult[] = [];
    for (let i = 0; i < symbols.length; i += batchSize) {
      const slice = symbols.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(slice.map(fetchOneFund));
      for (const r of batchResults) {
        if (r.status === "fulfilled" && r.value) results.push(r.value);
      }
    }
    return results;
  });

// ─── findBestBenchmark ─────────────────────────────────────────────

export interface BenchmarkMatch {
  ticker: string;
  name: string;
  cat: string;
  sub: string;
  r2: number;
  beta: number;
}

export const findBestBenchmark = createServerFn({ method: "GET" })
  .inputValidator((d: { ticker: string }) =>
    z.object({ ticker: z.string().min(1).max(24) }).parse(d),
  )
  .handler(async ({ data }): Promise<BenchmarkMatch[]> => {
    const assetCloses = await yahooChartCloses(data.ticker, "6mo").catch(() => []);
    if (assetCloses.length < 20) return [];

    const assetPrices = assetCloses.map((c) => c.close);
    const assetReturns = (() => {
      const r: number[] = [];
      for (let i = 1; i < assetPrices.length; i++) {
        if (assetPrices[i - 1] > 0)
          r.push((assetPrices[i] - assetPrices[i - 1]) / assetPrices[i - 1]);
      }
      return r;
    })();

    const results: BenchmarkMatch[] = [];
    const BATCH_SIZE = 15;

    for (let i = 0; i < AUTO_BENCHMARKS.length; i += BATCH_SIZE) {
      const batch = AUTO_BENCHMARKS.slice(i, i + BATCH_SIZE);
      const charts = await Promise.allSettled(batch.map((t) => yahooChartCloses(t, "6mo")));
      for (let j = 0; j < batch.length; j++) {
        const chart = charts[j];
        if (chart.status !== "fulfilled" || chart.value.length < 20) continue;
        const benchPrices = chart.value.map((c) => c.close);
        const benchReturns = (() => {
          const r: number[] = [];
          for (let k = 1; k < benchPrices.length; k++) {
            if (benchPrices[k - 1] > 0)
              r.push((benchPrices[k] - benchPrices[k - 1]) / benchPrices[k - 1]);
          }
          return r;
        })();
        const n = Math.min(assetReturns.length, benchReturns.length);
        if (n < 20) continue;
        const a = assetReturns.slice(0, n);
        const b = benchReturns.slice(0, n);
        const ma = a.reduce((s, v) => s + v, 0) / n;
        const mb = b.reduce((s, v) => s + v, 0) / n;
        let cov = 0,
          va = 0,
          vb = 0;
        for (let k = 0; k < n; k++) {
          cov += (a[k] - ma) * (b[k] - mb);
          va += (a[k] - ma) ** 2;
          vb += (b[k] - mb) ** 2;
        }
        cov /= n - 1;
        va /= n - 1;
        vb /= n - 1;
        if (va === 0 || vb === 0) continue;
        const corr = cov / Math.sqrt(va * vb);
        const r2 = corr * corr;
        const beta = cov / va;
        const info = FACTORS_MASTER_LIST[batch[j]];
        results.push({
          ticker: batch[j],
          name: info?.name ?? batch[j],
          cat: info?.cat ?? "",
          sub: info?.sub ?? "",
          r2: Math.round(r2 * 10000) / 10000,
          beta: Math.round(beta * 100) / 100,
        });
      }
    }

    results.sort((a, b) => b.r2 - a.r2);
    return results.slice(0, 10);
  });

// ─── getSectorPeers ────────────────────────────────────────────────

async function fetchYfIndustry(ticker: string): Promise<string | null> {
  try {
    const yf = await getYF();
    const q = await yf.quoteSummary(ticker, { modules: ["assetProfile"] });
    const ap = q.assetProfile ?? {};
    return ap?.industry ? String(ap.industry) : null;
  } catch {
    return null;
  }
}

export const getSectorPeers = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      sector: string;
      industria: string;
      tickerActual: string;
      ambito?: "industria" | "sector";
    }) =>
      z
        .object({
          sector: z.string().min(1),
          industria: z.string().min(1),
          tickerActual: z.string().min(1).max(24),
          ambito: z.enum(["industria", "sector"]).optional(),
        })
        .parse(d),
  )
  .handler(
    async ({
      data,
    }): Promise<{
      peers: string[];
      criterioUsado: "industria" | "sector";
      totalEncontrados: number;
    }> => {
      const all = getFlatTickerList();
      const sectorEs = normalizarSector(data.sector);
      const industriaEs = normalizarIndustria(data.industria);

      const MAX_PEERS = 50;

      const industriaPeers = all
        .filter((t) => t.industria === industriaEs && t.ticker !== data.tickerActual)
        .map((t) => t.ticker);

      // If ambito is explicitly "sector", skip industry match and go straight to sector
      if (data.ambito !== "sector" && industriaPeers.length >= 1) {
        return {
          peers: industriaPeers.slice(0, MAX_PEERS),
          criterioUsado: "industria",
          totalEncontrados: industriaPeers.length,
        };
      }

      const sectorPeers = all
        .filter((t) => t.sector === sectorEs && t.ticker !== data.tickerActual)
        .map((t) => t.ticker);

      // If ambito is explicitly "sector", return all sector peers directly (no dynamic detection)
      if (data.ambito === "sector") {
        return {
          peers: sectorPeers.slice(0, MAX_PEERS),
          criterioUsado: "sector",
          totalEncontrados: sectorPeers.length,
        };
      }

      // If ambito is explicitly "industria" but no industry peers found, return empty
      if (data.ambito === "industria") {
        return { peers: [], criterioUsado: "industria", totalEncontrados: 0 };
      }

      // Dynamic detection: fetch Yahoo Finance industry for sector peers (solo cuando NO hay ambito explícito)
      try {
        const BATCH = 5;
        const MAX_CHECK = Math.min(sectorPeers.length, 25);
        const industryGroups = new Map<string, string[]>();

        for (let i = 0; i < MAX_CHECK; i += BATCH) {
          const batch = sectorPeers.slice(i, i + BATCH);
          const results = await Promise.allSettled(
            batch.map(async (t) => ({ ticker: t, industry: await fetchYfIndustry(t) })),
          );
          for (const r of results) {
            if (r.status === "fulfilled" && r.value.industry) {
              const ind = normalizarIndustria(r.value.industry);
              if (!industryGroups.has(ind)) industryGroups.set(ind, []);
              industryGroups.get(ind)!.push(r.value.ticker);
            }
          }
        }

        if (industryGroups.has(industriaEs)) {
          const exact = industryGroups.get(industriaEs)!;
          return {
            peers: exact.slice(0, MAX_PEERS),
            criterioUsado: "sector",
            totalEncontrados: exact.length,
          };
        }

        const sorted = [...industryGroups.entries()]
          .filter(([_, ts]) => ts.length >= 2)
          .sort((a, b) => b[1].length - a[1].length);
        if (sorted.length > 0) {
          return {
            peers: sorted[0][1].slice(0, MAX_PEERS),
            criterioUsado: "sector",
            totalEncontrados: sorted[0][1].length,
          };
        }
      } catch {
        // Dynamic detection failed; fall through to return all sector peers
      }

      return {
        peers: sectorPeers.slice(0, MAX_PEERS),
        criterioUsado: "sector",
        totalEncontrados: sectorPeers.length,
      };
    },
  );

// ─── Periodo historico detallado (anual / trimestral) ──────────

export interface PeriodoHistoricoRow {
  label: string;
  endDate: string;
  revenue: number | null;
  revenuePrev: number | null;
  revenueChgPct: number | null;
  netIncome: number | null;
  netIncomePrev: number | null;
  netIncomeChgPct: number | null;
  eps: number | null;
  epsPrev: number | null;
  epsChgPct: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  ebit: number | null;
  interestExpense: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  // ── Detalle de balance (para análisis de razones financieras) ──
  currentAssets: number | null;
  currentLiabilities: number | null;
  inventory: number | null;
  netReceivables: number | null;
  netFixedAssets: number | null;
  cash: number | null;
  totalDebt: number | null;
  cashFromOps: number | null;
  capex: number | null;
  fcf: number | null;
  earningsDate: string | null;
}

// ─── BLOQUE 5 — Leverage operativo, financiero y combinado ───────────
// Fuente: Pascale, Cap. 18, puntos 18.2, 18.3 y 18.4.
//   L.O. = %Δ GAII / %Δ Ventas = [Q(p-cv)] / [Q(p-cv) - CF]
//   L.F. = %Δ UPA   / %Δ GAII  = [Q(p-cv)-CF] / [Q(p-cv)-CF-I]
//   L.C. = L.O. × L.F.          = [Q(p-cv)] / [Q(p-cv)-CF-I]
// Como Yahoo Finance no expone Q, p, cv, CF desagregados, se aproxima con
// sensibilidades sobre la serie histórica de estados de resultados:
//   L.O. ≈ %Δ operatingIncome / %Δ totalRevenue  (requiere >= 2 períodos)
//   L.F. ≈ %Δ netIncome        / %Δ operatingIncome

export interface LeverageResult {
  /** L.O. aproximado: sensibilidad del EBIT a las ventas (>= 1 = costos fijos relevantes) */
  lo: number | null;
  /** L.F. aproximado: sensibilidad de la utilidad neta al EBIT (>= 1 = deuda/intereses relevantes) */
  lf: number | null;
  /** L.C. combinado = L.O. × L.F., clamp a [0.5, 15] */
  lc: number | null;
  disponible: boolean;
  /** Cantidad de transiciones usadas (N períodos - 1) */
  conteoPeriodos: number;
  advertencia: string | null;
}

export function calcularLeverageAproximado(
  rows: {
    totalRevenue: number | null | undefined;
    operatingIncome: number | null | undefined;
    netIncome: number | null | undefined;
  }[],
): LeverageResult {
  // Filtrar filas con datos útiles y ordenar por fecha ascendente (más antigua primero):
  // la serie de Yahoo viene descendente (más reciente primero), por eso se invierte.
  const util: { revenue: number; ebit: number; ni: number }[] = [];
  for (const r of rows) {
    const revenue = num(r.totalRevenue);
    const ebit = num(r.operatingIncome);
    const ni = num(r.netIncome);
    if (revenue != null && ebit != null && ni != null && revenue !== 0 && ebit !== 0) {
      util.push({ revenue, ebit, ni });
    }
  }
  // Yahoo incomeStatementHistory: más reciente primero → invertir para serie ascendente.
  util.reverse();

  const advertencia: string | null = null;
  const save = (v: number): number | null => (isFinite(v) ? v : null);

  const ratiosLO: number[] = [];
  const ratiosLF: number[] = [];

  for (let i = 1; i < util.length; i++) {
    const cur = util[i];
    const prev = util[i - 1];
    if (prev.revenue === 0 || prev.ebit === 0) continue;

    const dRev = (cur.revenue - prev.revenue) / Math.abs(prev.revenue);
    const dEbit = (cur.ebit - prev.ebit) / Math.abs(prev.ebit);
    const dNi = (cur.ni - prev.ni) / Math.abs(prev.ni);

    if (dRev !== 0) {
      const lo = save(dEbit / dRev);
      if (lo != null && Math.abs(lo) <= 100) ratiosLO.push(lo);
    }
    if (dEbit !== 0) {
      const lf = save(dNi / dEbit);
      if (lf != null && Math.abs(lf) <= 100) ratiosLF.push(lf);
    }
  }

  if (ratiosLO.length === 0 || ratiosLF.length === 0) {
    return {
      lo: null,
      lf: null,
      lc: null,
      disponible: false,
      conteoPeriodos: 0,
      advertencia:
        "Serie insuficiente para aproximar leverage (>1 transición de revenue/EBIT/netIncome válida requerida)",
    };
  }

  const lo = Math.round((ratiosLO.reduce((a, b) => a + b, 0) / ratiosLO.length) * 1000) / 1000;
  const lf = Math.round((ratiosLF.reduce((a, b) => a + b, 0) / ratiosLF.length) * 1000) / 1000;
  const lcRaw = lo * lf;
  const lc = Math.round(Math.min(15, Math.max(0.5, Math.abs(lcRaw))) * 1000) / 1000;

  return {
    lo,
    lf,
    lc,
    disponible: true,
    conteoPeriodos: util.length - 1,
    advertencia,
  };
}

// ─── BLOQUE 9.1 — Necesidad de Capital de Trabajo Neto (CTN) y ciclo de conversión ──
// Fuente: Alonso/Sapetnitzky, "Administración Financiera de las Organizaciones",
// capítulo sobre PyMEs, secciones 4 y 5. CTN = Σε - Σγ; cada componente en días de
// venta (Ic = Cc · VC/VT · IMD, Cc = 360/Rotación). Acá se aproxima el ciclo de
// conversión de efectivo con datos que ya trae el balance/income:
//   CCC = DIO + DSO - DPO, con score normalizado: CCC<=0 -> 100, CCC>=120 -> 0.

export interface CicloConversionEfectivoResult {
  dio: number | null;
  dso: number | null;
  dpo: number | null;
  ccc: number | null;
  score: number | null;
  disponible: boolean;
  advertencia: string | null;
}

export function calcularCicloConversionEfectivo(input: {
  revenue: number | null | undefined;
  costOfRevenue: number | null | undefined;
  inventory: number | null | undefined;
  netReceivables: number | null | undefined;
  accountsPayable: number | null | undefined;
}): CicloConversionEfectivoResult {
  const revenue = num(input.revenue);
  const cogs = num(input.costOfRevenue);
  const inventory = num(input.inventory);
  const netRec = num(input.netReceivables);
  const ap = num(input.accountsPayable);

  if (revenue == null || cogs == null || revenue <= 0 || cogs <= 0) {
    return {
      dio: null,
      dso: null,
      dpo: null,
      ccc: null,
      score: null,
      disponible: false,
      advertencia: "Faltan revenue o costOfRevenue para el ciclo de conversión",
    };
  }

  const advertencia: string | null = null;
  const dio =
    inventory != null && inventory > 0 ? Math.round((360 / (cogs / inventory)) * 100) / 100 : null;
  const dso =
    netRec != null && netRec > 0 ? Math.round((360 / (revenue / netRec)) * 100) / 100 : null;
  const dpo = ap != null && ap > 0 ? Math.round((360 / (cogs / ap)) * 100) / 100 : null;

  let ccc: number | null = null;
  if (dio != null && dso != null && dpo != null) ccc = Math.round((dio + dso - dpo) * 100) / 100;

  let score: number | null = null;
  if (ccc != null) score = Math.round(Math.min(100, Math.max(0, 100 - (ccc / 120) * 100)));

  return { dio, dso, dpo, ccc, score, disponible: ccc != null, advertencia };
}

export const fetchHistoricoDetallado = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string; granularidad: "anual" | "trimestral" }) =>
    z
      .object({
        symbol: z
          .string()
          .min(1)
          .max(20)
          .transform((s) => s.trim().toUpperCase()),
        granularidad: z.enum(["anual", "trimestral"]),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ periods: PeriodoHistoricoRow[] }> => {
    const { symbol, granularidad } = data;
    const cacheKey = `historico:${symbol}:${granularidad}:v1`;
    return getOrFetch(cacheKey, "yahoo", TTL_POR_TIPO.fundamentals, () =>
      computeHistoricoDetallado(symbol, granularidad),
    );
  });

// Compute historical income/balance/cash-flow periods (extracted for caching)
async function computeHistoricoDetallado(
  symbol: string,
  granularidad: "anual" | "trimestral",
): Promise<{ periods: PeriodoHistoricoRow[] }> {
  try {
    console.error(`[fetchFundamentalAF] START ${symbol}`);
    const yf = await getYF();
    const isKey =
      granularidad === "anual" ? "incomeStatementHistory" : "incomeStatementHistoryQuarterly";
    const bsKey = granularidad === "anual" ? "balanceSheetHistory" : "balanceSheetHistoryQuarterly";
    const cfKey =
      granularidad === "anual" ? "cashflowStatementHistory" : "cashflowStatementHistoryQuarterly";

    const qs = await yf
      .quoteSummary(symbol, {
        modules: [isKey, bsKey, cfKey, "earningsHistory", "defaultKeyStatistics"],
      })
      .catch(() => null);

    if (!qs) return { periods: [] };

    const ish = (qs as any)[isKey]?.incomeStatementHistory ?? (qs as any)[isKey]?.statements ?? [];
    const bsh = (qs as any)[bsKey]?.balanceSheetStatements ?? (qs as any)[bsKey]?.statements ?? [];
    const cfh = (qs as any)[cfKey]?.cashflowStatements ?? (qs as any)[cfKey]?.statements ?? [];
    const earningsHist = (qs as any)?.earningsHistory?.history ?? [];
    const sharesOutstanding = num((qs as any)?.defaultKeyStatistics?.sharesOutstanding);

    const incomeRows = (Array.isArray(ish) ? ish : []) as Record<string, unknown>[];
    const balRows = (Array.isArray(bsh) ? bsh : []) as Record<string, unknown>[];
    const cfRows = (Array.isArray(cfh) ? cfh : []) as Record<string, unknown>[];

    // Build earnings date map: periodo -> fecha
    const earningsDateMap = new Map<string, string>();
    for (const eh of earningsHist) {
      const period = (eh?.period as string) ?? "";
      const eDate =
        ((eh?.earningsDate?.fmt as string) ?? eh?.earningsDate?.raw)
          ? new Date((eh.earningsDate.raw as number) * 1000).toISOString().slice(0, 10)
          : null;
      if (period && eDate) earningsDateMap.set(period, eDate);
    }

    const periods: PeriodoHistoricoRow[] = [];

    for (let i = 0; i < incomeRows.length; i++) {
      const row = incomeRows[i];
      const prev = incomeRows[i + 1] ?? null;

      const endDateTs = numDate(row.endDate);
      if (!endDateTs) continue;
      const endDate = new Date(endDateTs * 1000).toISOString().slice(0, 10);

      const rev = num(row.totalRevenue);
      const ni = num(row.netIncome);
      const ebitV = (() => {
        const e = num(row.ebit);
        if (e != null && e !== 0) return e;
        const o = num(row.operatingIncome);
        if (o != null) return o;
        const ibt = num(row.incomeBeforeTax);
        const ie = num(row.interestExpense);
        return ibt != null && ie != null ? ibt + Math.abs(ie) : null;
      })();
      const intExp = num(row.interestExpense);
      const cosRev = num(row.costOfRevenue);
      const sga = num(row.sellingGeneralAdministrative);
      const rd = num(row.researchAndDevelopment);

      // Balance matching
      const balRow = balRows.find((b) => {
        const bEnd = numDate(b.endDate);
        return bEnd && Math.abs(bEnd - endDateTs) < 400 * 86400;
      });
      const ta = balRow ? num(balRow.totalAssets) : null;
      const tl = balRow ? num(balRow.totalLiab) : null;
      const te = balRow ? num(balRow.totalStockholderEquity) : null;
      // ── Detalle de balance para razones de actividad/liquidez ──
      const curAssets = balRow ? num(balRow.totalCurrentAssets) : null;
      const curLiab = balRow ? num(balRow.totalCurrentLiabilities) : null;
      const inventory = balRow ? num(balRow.inventory) : null;
      // netReceivables suele venir en "netReceivables"; fallback a netTradeCCReceivables
      const netRec =
        balRow != null ? (num(balRow.netReceivables) ?? num(balRow.netTradeCCReceivables)) : null;
      // Activos fijos netos = PP&E neto (netPPE / propertyPlantEquipment); fallback a grossPPE - accumulatedDepreciation
      const netFixe = (() => {
        if (!balRow) return null;
        const netPpe = num(balRow.netPPE);
        if (netPpe != null) return netPpe;
        const grossPpe = num(balRow.grossPPE);
        const accDep = num(balRow.accumulatedDepreciation);
        if (grossPpe != null) return accDep != null ? grossPpe + Math.abs(accDep) : grossPpe;
        return num(balRow.propertyPlantAndEquipment) ?? num(balRow.totalPropertyPlantAndEquipment);
      })();
      const cash = balRow ? (num(balRow.cash) ?? num(balRow.cashAndCashEquivalents)) : null;
      // Deuda total = deuda corriente + no corriente; fallback totalDebt
      const totalDebt = (() => {
        if (!balRow) return null;
        const st = num(balRow.sTDebt) ?? num(balRow.shortLongTermDebt) ?? 0;
        const lt = num(balRow.longTermDebt) ?? num(balRow.longTermDebtTotal) ?? 0;
        return st !== 0 || lt !== 0 || balRow.totalDebt != null
          ? (num(balRow.totalDebt) ?? st + lt)
          : null;
      })();

      // CF matching
      const cfRow = cfRows.find((c) => {
        const cEnd = numDate(c.endDate);
        return cEnd && Math.abs(cEnd - endDateTs) < 400 * 86400;
      });
      const cfo = cfRow ? num(cfRow.totalCashFromOperatingActivities) : null;
      const capex = cfRow ? num(cfRow.capitalExpenditures) : null;
      const fcf = cfo != null ? cfo - (capex ? Math.abs(capex) : 0) : null;

      // Prev period metrics
      const revPrev = prev ? num(prev.totalRevenue) : null;
      const niPrev = prev ? num(prev.netIncome) : null;
      const epsPrevVal =
        prev && sharesOutstanding ? num(prev.netIncome)! / sharesOutstanding : null;

      const eps = sharesOutstanding && ni != null ? ni / sharesOutstanding : null;
      const grossMargin = rev && cosRev ? (rev - cosRev) / rev : null;
      const operatingMarginVal = rev && ebitV ? ebitV / rev : null;
      const netMargin = rev && ni ? ni / rev : null;

      const label =
        granularidad === "anual"
          ? `FY${new Date(endDateTs * 1000).getFullYear()}`
          : `Q${Math.ceil((new Date(endDateTs * 1000).getMonth() + 1) / 3)} ${new Date(endDateTs * 1000).getFullYear()}`;

      periods.push({
        label,
        endDate,
        revenue: rev,
        revenuePrev: revPrev,
        revenueChgPct:
          rev != null && revPrev != null && revPrev > 0 ? (rev - revPrev) / revPrev : null,
        netIncome: ni,
        netIncomePrev: niPrev,
        netIncomeChgPct: ni != null && niPrev != null && niPrev > 0 ? (ni - niPrev) / niPrev : null,
        eps,
        epsPrev: epsPrevVal,
        epsChgPct:
          eps != null && epsPrevVal != null && epsPrevVal > 0
            ? (eps - epsPrevVal) / epsPrevVal
            : null,
        grossMargin,
        operatingMargin: operatingMarginVal,
        netMargin,
        ebit: ebitV,
        interestExpense: intExp,
        totalAssets: ta,
        totalLiabilities: tl,
        totalEquity: te,
        currentAssets: curAssets,
        currentLiabilities: curLiab,
        inventory,
        netReceivables: netRec,
        netFixedAssets: netFixe,
        cash,
        totalDebt,
        cashFromOps: cfo,
        capex,
        fcf,
        earningsDate: earningsDateMap.get(label) ?? null,
      });
    }

    return { periods };
  } catch {
    return { periods: [] };
  }
}

// ─── Busqueda de noticias por ticker y ventana de fechas ──────

export interface NewsItem {
  title: string;
  publisher: string;
  link: string;
  publishedDate: string;
  summary: string;
}

export const fetchNoticiasTicker = createServerFn({ method: "GET" })
  .inputValidator((d: { symbol: string; desde: string; hasta: string; maxResults?: number }) =>
    z
      .object({
        symbol: z
          .string()
          .min(1)
          .max(20)
          .transform((s) => s.trim().toUpperCase()),
        desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        maxResults: z.number().min(1).max(20).default(10),
      })
      .parse(d),
  )
  .handler(
    async ({ data }): Promise<{ news: NewsItem[]; totalFetched: number; apiError: boolean }> => {
      const { symbol, desde, hasta, maxResults } = data;
      const news: NewsItem[] = [];

      // 1. Try Flask endpoint (yfinance news)
      try {
        const NEWS_API = process.env.NEWS_API_URL || "http://localhost:5000";
        const url = `${NEWS_API}/api/news?ticker=${encodeURIComponent(symbol)}&count=${Math.min(maxResults, 10)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) {
          const json = await response.json();
          const rawNews: any[] = json.news ?? [];
          for (const n of rawNews) {
            news.push({
              title: n.title ?? "Sin titulo",
              publisher: n.publisher ?? "",
              link: n.link ?? "#",
              publishedDate: new Date((n.providerPublishTime ?? 0) * 1000)
                .toISOString()
                .slice(0, 10),
              summary: n.summary ?? n.content ?? "",
            });
          }
        }
      } catch {
        /* Flask not available, continue to fallback */
      }

      // 2. Fallback: Yahoo Finance search API (works for most tickers without auth)
      if (news.length === 0) {
        try {
          const searchSymbol = symbol.replace(/\.BA$/, "");
          const res = await fetch(
            `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(searchSymbol)}&quotesCount=0&newsCount=${Math.min(maxResults, 10)}`,
            {
              headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
              signal: AbortSignal.timeout(5000),
            },
          );
          if (res.ok) {
            const json = await res.json();
            const rawNews: any[] = json.news ?? [];
            for (const n of rawNews) {
              const title = n.title ?? "";
              if (title.length > 10) {
                news.push({
                  title,
                  publisher: n.publisher ?? n.provider?.displayName ?? "Yahoo Finance",
                  link: n.link ?? `https://finance.yahoo.com/news/${searchSymbol}`,
                  publishedDate: n.providerPublishTime
                    ? new Date(n.providerPublishTime * 1000).toISOString().slice(0, 10)
                    : desde,
                  summary: n.summary ?? n.content ?? "",
                });
              }
            }
          }
        } catch {
          /* Yahoo search fallback failed */
        }
      }

      return { news, totalFetched: news.length, apiError: news.length === 0 };
    },
  );

// ─── Timeline cronológico de eventos (earnings + noticias) ─────

interface TimelineEvent {
  date: string;
  type: "earnings" | "news";
  summary: string;
  link?: string;
}

function acortarTitulo(title: string): string {
  const words = title.trim().split(/\s+/);
  return words.length <= 15 ? title : words.slice(0, 12).join(" ") + "…";
}

function construirLineaTiempoEventos(
  historico: PeriodoHistoricoRow[],
  noticias: NewsItem[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  for (const p of historico) {
    if (!p.earningsDate) continue;
    const partes: string[] = [];
    if (p.eps != null) partes.push(`EPS $${p.eps.toFixed(2)}`);
    if (p.revenue != null) partes.push(`ingresos $${(p.revenue / 1e6).toFixed(0)}M`);
    if (p.netMargin != null) partes.push(`margen ${(p.netMargin * 100).toFixed(1)}%`);
    events.push({
      date: p.earningsDate,
      type: "earnings",
      summary: `Resultados ${p.label}: ${partes.join(", ")}.`,
    });
  }
  for (const n of noticias) {
    events.push({
      date: n.publishedDate,
      type: "news",
      summary: acortarTitulo(n.title),
      link: n.link,
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

// ─── Generador de informe narrativo ───────────────────────────

const SECTOR_MARGIN_THRESHOLDS_INTERP: Record<string, number> = {
  Technology: 0.2,
  "Financial Services": 0.3,
  Healthcare: 0.2,
  "Consumer Defensive": 0.15,
  Energy: 0.15,
  Industrials: 0.12,
  "Basic Materials": 0.15,
  Utilities: 0.15,
  "Communication Services": 0.2,
  "Consumer Cyclical": 0.12,
};

export function generarInformeFundamental(
  result: FundamentalAFResult,
  historico: PeriodoHistoricoRow[],
  noticias: NewsItem[],
  periodoIdx: number,
): {
  contexto: string;
  quePaso: string;
  porQuePaso: string;
  queSignifica: string;
  senal: string;
  senalLabel: string;
} {
  const r = result;
  let currentPeriod =
    periodoIdx >= 0 && periodoIdx < historico.length ? historico[periodoIdx] : null;
  if (!currentPeriod && historico.length > 0) currentPeriod = historico[0];
  const isETF =
    r.quoteType === "ETF" ||
    (r.longBusinessSummary != null &&
      /^(the fund|this etf|seeks to track|the investment seeks)/i.test(r.longBusinessSummary));

  // ── Contexto top-down ──
  let contexto = "";
  const isBA = r.symbol.endsWith(".BA");
  if (isBA) {
    contexto = `Contexto Argentina: el analisis de ${r.symbol} debe considerar el entorno de inflacion y tipo de cambio. `;
  }
  if (isETF) {
    contexto += `${r.symbol} es un ETF (fondo cotizado) que brinda exposicion al sector/indice que replica. `;
    if (r.longBusinessSummary) {
      contexto += `${r.longBusinessSummary.slice(0, 300)}... `;
    }
  } else if (r.sector) {
    const marginThr = SECTOR_MARGIN_THRESHOLDS_INTERP[r.sector] ?? 0.12;
    const sectorMarginOk = r.profitMargin != null && r.profitMargin >= marginThr;
    contexto += `Sector ${r.sector}: las empresas con margen neto superior al ${(marginThr * 100).toFixed(0)}% se consideran solidas en este sector. ${r.symbol} presenta un margen TTM de ${r.profitMargin != null ? (r.profitMargin * 100).toFixed(1) : "N/D"}%. `;
  }

  // ── Consistencia de márgenes y ROE en el tiempo ──
  if (!isETF && historico.length >= 3) {
    const validMargins = historico
      .filter((p) => p.netMargin != null)
      .map((p) => p.netMargin!)
      .slice(0, 5);
    const validRoes = historico
      .filter((p) => p.netIncome != null && p.totalEquity != null && p.totalEquity > 0)
      .map((p) => p.netIncome! / p.totalEquity!)
      .slice(0, 5);
    const calcCV = (vals: number[]): number | null => {
      if (vals.length < 3) return null;
      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      if (Math.abs(mean) < 0.001) return null;
      const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
      return Math.sqrt(variance) / Math.abs(mean);
    };
    const cvMargin = calcCV(validMargins);
    const cvRoe = calcCV(validRoes);
    if (cvMargin != null && cvMargin < 0.35 && cvRoe != null && cvRoe < 0.35) {
      contexto += `Márgenes y ROE consistentes en el tiempo — modelo de negocio predecible, dentro de lo que Graham llamaría círculo de competencia razonable de evaluar. `;
    } else if ((cvMargin != null && cvMargin > 0.5) || (cvRoe != null && cvRoe > 0.5)) {
      contexto += `Márgenes/ROE volátiles entre períodos — requiere mayor análisis cualitativo antes de asumir ventaja competitiva estable. `;
    }
  }

  // ── Que paso (numeros) ──
  let quePaso = "";
  if (currentPeriod) {
    quePaso = `En ${currentPeriod.label} (cierre: ${currentPeriod.endDate}), `;
    if (isETF) {
      const partsEtf: string[] = [];
      if (r.totalAssets != null)
        partsEtf.push(`activos totales del fondo por $${(r.totalAssets / 1e6).toFixed(0)}M`);
      if (r.marketCapM != null)
        partsEtf.push(`capitalizacion bursatil de $${r.marketCapM.toFixed(0)}M`);
      if (r.currentPrice != null) partsEtf.push(`cotiza en $${r.currentPrice.toFixed(2)}`);
      quePaso += partsEtf.join("; ") + ". ";
    } else {
      const parts: string[] = [];
      if (currentPeriod.revenue != null) {
        parts.push(`ingresos de $${(currentPeriod.revenue / 1e6).toFixed(0)}M`);
        if (currentPeriod.revenueChgPct != null) {
          parts.push(
            `${currentPeriod.revenueChgPct >= 0 ? "subieron" : "cayeron"} un ${(Math.abs(currentPeriod.revenueChgPct) * 100).toFixed(1)}% vs el periodo anterior`,
          );
        }
      }
      if (currentPeriod.eps != null) {
        parts.push(`EPS de $${currentPeriod.eps.toFixed(2)}`);
        if (currentPeriod.epsChgPct != null) {
          parts.push(
            `(${currentPeriod.epsChgPct >= 0 ? "+" : ""}${(currentPeriod.epsChgPct * 100).toFixed(1)}% vs periodo anterior)`,
          );
        }
      }
      if (currentPeriod.netMargin != null) {
        const labelFY =
          granularidad === "anual"
            ? `FY${new Date((currentPeriod.endDate as string) ? new Date(currentPeriod.endDate).getFullYear() : "N/A")}`
            : currentPeriod.label;
        parts.push(`margen neto ${labelFY} de ${(currentPeriod.netMargin * 100).toFixed(1)}%`);
      }
      if (currentPeriod.fcf != null) {
        parts.push(`FCF de $${(currentPeriod.fcf / 1e6).toFixed(0)}M`);
      }
      quePaso += parts.join("; ") + ". ";
      // Calidad del FCF vs ganancias reportadas
      if (
        currentPeriod.revenueChgPct != null &&
        currentPeriod.revenueChgPct > 0 &&
        currentPeriod.epsChgPct != null &&
        currentPeriod.epsChgPct > 0 &&
        currentPeriod.fcf != null &&
        currentPeriod.fcf > 0
      ) {
        const curIdx = historico.indexOf(currentPeriod);
        const prevFcf =
          curIdx >= 0 && curIdx < historico.length - 1 ? historico[curIdx + 1]?.fcf : null;
        if (prevFcf != null && prevFcf > 0 && currentPeriod.fcf < prevFcf * 0.95) {
          quePaso += `Ingresos y ganancias crecieron, pero el flujo de caja libre no acompañó ese crecimiento — la calidad de las ganancias merece revisión. `;
        }
      }
    }
  } else {
    if (isETF) {
      const partsEtf2: string[] = [];
      if (r.currentPrice != null) partsEtf2.push(`Precio: $${r.currentPrice.toFixed(2)}`);
      if (r.totalAssets != null) partsEtf2.push(`AUM: $${(r.totalAssets / 1e6).toFixed(0)}M`);
      if (r.marketCapM != null) partsEtf2.push(`Market cap: $${r.marketCapM.toFixed(0)}M`);
      quePaso = `Resumen actual del ETF: ${partsEtf2.join("; ")}. `;
    } else {
      const parts2: string[] = [];
      if (r.currentPrice != null) parts2.push(`Precio actual: $${r.currentPrice.toFixed(2)}`);
      if (r.trailingPE != null) parts2.push(`P/E trailing: ${r.trailingPE.toFixed(1)}x`);
      if (r.returnOnEquity != null) parts2.push(`ROE: ${(r.returnOnEquity * 100).toFixed(1)}%`);
      if (r.revenueGrowth != null)
        parts2.push(`Crecimiento ingresos: ${(r.revenueGrowth * 100).toFixed(1)}%`);
      quePaso = `Resumen actual: ${parts2.join("; ")}. `;
    }
  }

  // ── Por que paso (timeline cronologico: earnings + noticias) ──
  let porQuePaso = "";
  const timeline = !isETF ? construirLineaTiempoEventos(historico, noticias) : [];
  if (timeline.length > 0) {
    const formatear = (d: string) =>
      new Date(d + "T12:00:00Z").toLocaleDateString("es-AR", {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      });
    for (const ev of timeline) {
      if (ev.type === "news") {
        porQuePaso += `${formatear(ev.date)} — ${ev.summary}.${ev.link ? ` Fuente: ${ev.link}.` : ""} `;
      } else {
        porQuePaso += `${formatear(ev.date)} — ${ev.summary} `;
      }
    }
  } else if (currentPeriod) {
    porQuePaso =
      "No se encontraron noticias en la ventana de este periodo; el analisis se basa exclusivamente en los datos financieros reportados. ";
  }

  // Divergencia FCF vs EPS
  if (
    currentPeriod?.fcf != null &&
    currentPeriod?.netIncome != null &&
    currentPeriod.netIncome > 0
  ) {
    const fcfVsNi = (currentPeriod.fcf - currentPeriod.netIncome) / currentPeriod.netIncome;
    if (Math.abs(fcfVsNi) > 0.2) {
      porQuePaso += `Divergencia significativa entre FCF y ganancias netas: el FCF ($${(currentPeriod.fcf / 1e6).toFixed(0)}M) representa un ${(fcfVsNi * 100).toFixed(0)}% del net income ($${(currentPeriod.netIncome / 1e6).toFixed(0)}M). `;
      if (currentPeriod.capex != null && Math.abs(currentPeriod.capex) > 0) {
        porQuePaso += `El capex de $${(Math.abs(currentPeriod.capex) / 1e6).toFixed(0)}M explica parte de esta divergencia. `;
      }
    }
  }

  // ── Que significa (valuacion, margen seguridad, VCS) ──
  let queSignifica = "";
  if (isETF) {
    queSignifica = `Como ETF, su rendimiento sigue la evolucion del indice/subyacente que replica. `;
    if (r.upsidePct != null) {
      queSignifica += `Upside (target analistas) de ${r.upsidePct.toFixed(1)}% segun precio objetivo promedio. `;
    }
  } else {
    // 1. Valor Intrínseco vs Precio
    // Metodología Value Investing: usar la MEDIANA del P/E histórico (robusta a outliers)
    // en lugar del promedio simple. Años con EPS deprimido por cargos puntuales
    // disparan el P/E (ej. 77x) e inflan el promedio, distorsionando el valor intrínseco.
    const epsVI = r.trailingEps;
    const peHistoryVals = r.peHistory?.map((p) => p.pe).filter((p) => p > 0) ?? [];
    const medianaPE = (vals: number[]): number | null => {
      if (vals.length < 2) return null;
      const sorted = [...vals].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    const avgPeVI = peHistoryVals.length >= 2 ? medianaPE(peHistoryVals) : null;
    if (
      epsVI != null &&
      epsVI > 0 &&
      avgPeVI != null &&
      r.currentPrice != null &&
      r.currentPrice > 0
    ) {
      const valorIntrinsecoAprox = epsVI * avgPeVI;
      const margenSeguridadPct =
        ((valorIntrinsecoAprox - r.currentPrice) / valorIntrinsecoAprox) * 100;
      if (margenSeguridadPct > 0) {
        queSignifica = `Valor intrínseco aproximado de $${valorIntrinsecoAprox.toFixed(2)} (EPS TTM $${epsVI.toFixed(2)} × P/E mediano histórico ${avgPeVI.toFixed(1)}x). El precio actual de $${r.currentPrice.toFixed(2)} implica un margen de seguridad (Graham) del ${margenSeguridadPct.toFixed(1)}% — cotiza por debajo de su valor histórico (subvaluada). `;
      } else {
        queSignifica = `Valor intrínseco aproximado de $${valorIntrinsecoAprox.toFixed(2)} (EPS TTM $${epsVI.toFixed(2)} × P/E mediano histórico ${avgPeVI.toFixed(1)}x). El precio actual de $${r.currentPrice.toFixed(2)} supera este valor en un ${Math.abs(margenSeguridadPct).toFixed(1)}% — cotiza por encima (sobrevaluada). `;
      }
      // 2. Margen de Seguridad
      if (margenSeguridadPct > 0 && margenSeguridadPct < 15) {
        queSignifica += `El margen de seguridad es bajo (${margenSeguridadPct.toFixed(1)}%): poco colchón ante un error de estimación en el P/E histórico o el EPS reportado. `;
      } else if (margenSeguridadPct <= 0) {
        queSignifica += `Margen de seguridad negativo: se está pagando una prima sobre el valor intrínseco histórico. Cuanto mayor sea la prima, más depende la tesis de inversión de que el crecimiento futuro justifique el precio actual. `;
      }
    }

    // 3. ROE — ventaja competitiva
    if (r.returnOnEquity != null && r.returnOnEquity * 100 > 20) {
      queSignifica += `ROE elevado (${(r.returnOnEquity * 100).toFixed(1)}%) sugiere ventaja competitiva en generacion de rentabilidad sobre capital. `;
    }

    // 4. Deuda
    if (r.debtToEquityRaw != null) {
      if (r.debtToEquityRaw < 50) {
        queSignifica += `Bajo apalancamiento (D/E ${(r.debtToEquityRaw / 100).toFixed(2)}x) reduce riesgo financiero. `;
      } else if (r.debtToEquityRaw > 200) {
        queSignifica += `Alto apalancamiento (D/E ${(r.debtToEquityRaw / 100).toFixed(2)}x) — monitorear capacidad de servicio de deuda. `;
      }
    }
  }

  // ── Senal (delegada a resolverSenalCoherente, fuente única de verdad) ──
  let senalLabel = "";
  let senal = "";
  if (isETF) {
    senalLabel = "N/A (ETF)";
    senal =
      "Al tratarse de un ETF, la señal de inversion se define por la estrategia de asset allocation (peso sectorial/geografico) mas que por analisis fundamental individual.";
  } else {
    senalLabel = r.accion || "Cautela";
    const fundScore = r.fundScore;
    const upside = r.upsidePct ?? 0;
    const growthPct = (r.revenueGrowth ?? 0) * 100;
    const pricePct = r.pricePercentile10y ?? 50;

    if (r.accion === "Acumular") {
      senal = `Score fundamental ${fundScore}/100, crecimiento positivo y upside (target analistas) de ${upside.toFixed(1)}% (≥50% margen de seguridad Riquelme) — la combinacion sugiere acumular a largo plazo ignorando el ruido de precio de corto plazo.`;
    } else if (r.accion === "Acumular gradualmente") {
      senal = `Score ${fundScore}/100 con upside positivo — sugiere acumulacion gradual.`;
    } else if (r.accion === "Mantener") {
      senal = `Score ${fundScore}/100 — mantener posicion existente a la espera de mejor margen de seguridad.`;
    } else {
      senal = `Sin definicion clara con los datos disponibles — monitorear metricas en proximos periodos.`;
    }

    if (r.plazo) {
      senal += ` (plazo: ${r.plazo})`;
    }
  }

  const senalFinal = `${senalLabel}: ${senal}`;

  return {
    contexto,
    quePaso,
    porQuePaso,
    queSignifica,
    senal: senalFinal,
    senalLabel,
  };
}
