export interface HedgePosition {
  ticker: string;
  description: string;
  cantidad: number;
  precioPromedio: number;
  ultimoPrecio: number;
  valorUSD: number;
  valorARS: number;
  moneda: string;
  plPct: number;
  plUSD: number;
  selected: boolean;
  mercadoOrigen?: "BCBA-LOCAL" | "BCBA-CEDEAR" | "NYSE" | "NASDAQ";
}

export type Confiabilidad = "alta" | "media" | "baja";

export interface HedgeBenchmarkResult {
  benchmark: string;
  beta: number;
  alpha: number;
  r2: number;
  pValue: number;
  correlation: number;
  observations: number;
}

export interface HedgeUniverseAsset {
  ticker: string;
  nombre: string;
  tipo: "BYMA" | "CEDEAR" | "ETF";
  beta: number;
  correlation: number;
  r2: number;
  selected: boolean;
  ratio?: number;
  cclImplicito?: number;
  shortDisponible?: boolean;
}

export interface HedgeOptimizationResult {
  position: {
    ticker: string;
    description: string;
    valorUSD: number;
    bestBenchmark: string;
    bestBenchmarkR2: number;
    bestBenchmarkConfiabilidad: Confiabilidad;
    beta: number;
    deltaUSD: number;
    betaUSD: number;
    alpha: number;
    pValue: number;
    observations: number;
    equityCurve?: { date: string; position: number; benchmark: number }[];
  };
  hedgeAssets: Array<{
    ticker: string;
    nombre: string;
    tipo: string;
    montoUSD: number;
    beta: number;
    correlation: number;
    cantidadOperar?: number;
    mercadoEjecucion?: "BYMA" | "NYSE" | "NASDAQ";
    noEjecutable?: boolean;
  }>;
  postHedge: {
    deltaNeto: number;
    betaNeto: number;
    deltaReductionPct: number;
    betaReductionPct: number;
    totalCostoUSD: number;
    saldoRestante: number;
    leverageBruto: number;
    leverageNeto: number;
    ejecutable: boolean;
    depositoMinimoSugerido: number;
    costoFinanciamiento?: number;
  };
}

export interface HedgeOrderConsolidada {
  ticker: string;
  montoUSDTotal: number;
  cantidadTotal: number;
  tipo: string;
  mercadoEjecucion: string;
  posicionesQueLoUsan: string[];
}

export interface HedgeErrorPosicion {
  ticker: string;
  motivo: string;
}

export interface HedgeResult {
  results: HedgeOptimizationResult[];
  universoTabla: HedgeUniverseAsset[];
  totalCosto: number;
  totalSaldoDisponible: number;
  coberturaParcial: boolean;
  coberturaPct: number;
  excludedTickers?: string[];
  failedPositions?: HedgeErrorPosicion[];
  ordenesConsolidadas?: HedgeOrderConsolidada[];
  portfolioEquityCurve?: { date: string; portfolio: number; benchmark: number }[];
  alphaDisclaimer?: string;
}

export type HedgeSource = "iol" | "manual" | "sector";
export type HedgeType = "delta-neutral" | "beta-neutral" | "ambas";
export type HedgeUniverseType = "todo-byma" | "solo-cedears" | "solo-etfs" | "manual";
export type HedgePeriod = 90 | 180 | 365 | 730;

export interface HedgeConfig {
  benchmarks: string[];
  universe: HedgeUniverseType;
  manualUniverseTickers: string;
  period: HedgePeriod;
  lambda: number;
  availableCash: number;
  hedgeType: HedgeType;
  tasaCaucionAnual?: number;
}

export interface IOLPositionRaw {
  ticker: string;
  description: string;
  cantidad: number;
  precioPromedio: number;
  ultimoPrecio: number;
  valorizado: number;
  moneda: string;
  gananciaPorcentaje: number;
  gananciaDinero: number;
}

export interface PlainLanguageStep {
  orden: number;
  accion: "COMPRAR" | "VENDER" | "ESPERAR" | "NO HACER NADA";
  instrumento: string;
  cantidad: number;
  montoAproximadoUSD: number;
  mercado: string;
  motivoSimple: string;
  confiabilidad: Confiabilidad;
  advertencia?: string;
}

export interface PlainLanguagePlan {
  resumenGeneral: string;
  situacionSaldo: {
    mensaje: string;
    montoNecesarioDepositar: number | null;
  };
  pasos: PlainLanguageStep[];
  resumenCosto: {
    costoTotalEstimado: number;
    saldoQueTeQuedaria: number;
    esViable: boolean;
  };
}

export const DEFAULT_HEDGE_CONFIG: HedgeConfig = {
  benchmarks: ["^MERV", "^SPX", "XLK", "XLF", "IWM", "EEM"],
  universe: "todo-byma",
  manualUniverseTickers: "",
  period: 365,
  lambda: 0.1,
  availableCash: 1,
  hedgeType: "ambas",
  tasaCaucionAnual: 0.35,
};

export const ETF_HEDGE_UNIVERSE = [
  "SPY",
  "QQQ",
  "XLK",
  "XLF",
  "XLE",
  "XLV",
  "XLI",
  "XLB",
  "XLC",
  "XLY",
  "XLP",
  "XLRE",
  "XLU",
  "IWM",
  "EEM",
  "GLD",
  "TLT",
];

/**
 * Ratios de conversión ADR / CEDEAR (BYMA) vigentes.
 * ratio = cantidad de acciones locales / CEDEARs equivalentes a 1 acción/ADR subyacente.
 * Fuente única: @/data/arbitrador.json (mantenido con los ratios reales de BYMA/CNV).
 *
 * Incluye tanto ADRs argentinos como CEDEARs internacionales listados en BYMA.
 */
import arbitrajeData from "@/data/arbitrador.json";

const _arbData = arbitrajeData as {
  dolarSymbol: string;
  adrs: { nyse: string; bcba: string; nombre: string; ratio: number }[];
  cedears: { nyse: string; bcba: string; nombre: string; ratio: number }[];
};

const _buildRatios = (): Record<string, number> => {
  const map: Record<string, number> = {};
  for (const a of _arbData.adrs) map[a.nyse] = a.ratio;
  for (const c of _arbData.cedears) map[c.nyse] = c.ratio;
  return map;
};

export const CEDEAR_RATIOS: Record<string, number> = _buildRatios();
/** @deprecated Use CEDEAR_RATIOS / Object.keys(CEDEAR_RATIOS) instead */
export const CEDEAR_HEDGE_TICKERS = Object.keys(CEDEAR_RATIOS);

/**
 * Acciones locales BYMA (ARS) para cobertura de posiciones en pesos.
 * Componentes de alta liquidez del Merval.
 */
export const BYMA_HEDGE_TICKERS: string[] = [
  "GGAL.BA",
  "YPFD.BA",
  "PAMP.BA",
  "BMA.BA",
  "TECO2.BA",
  "EDN.BA",
  "TXAR.BA",
  "ALUA.BA",
  "CRES.BA",
  "CEPU.BA",
  "TRAN.BA",
  "COME.BA",
  "CTIO.BA",
  "LOMA.BA",
  "MIRG.BA",
  "METR.BA",
  "SUPV.BA",
  "VALO.BA",
  "HARG.BA",
  "CGPA2.BA",
  "DSX.BA",
  "INVJ.BA",
  "LEDE.BA",
  "LONG.BA",
  "OEST.BA",
  "PATA.BA",
  "RIGO.BA",
  "SAMI.BA",
  "SEMI.BA",
  "BHIP.BA",
  "BOLT.BA",
  "BPAT.BA",
  "BYMA.BA",
  "CECO2.BA",
  "DGCU2.BA",
  "FERR.BA",
  "GCLA.BA",
  "GRIM.BA",
  "HAVA.BA",
  "IRSA.BA",
  "MOLA.BA",
  "MORI.BA",
  "MTR.BA",
  "PGR.BA",
  "PLAR.BA",
  "POLL.BA",
  "ROSE.BA",
  "SALO.BA",
  "TGLT.BA",
  "TOMY.BA",
];

import cedearsUniverse from "@/data/cedears-universe.json";

const CEDEARS_ARS = (cedearsUniverse as { ARS: string[]; USD: string[] }).ARS.map((t) => t + ".BA");
const CEDEARS_USD = (cedearsUniverse as { ARS: string[]; USD: string[] }).USD.map((t) => t + ".BA");

export const CEDEARS_ARS_LIST = [...CEDEARS_ARS];
export const CEDEARS_USD_LIST = [...CEDEARS_USD];

export function getHedgeUniverseByCurrency(
  moneda: "ARS" | "USD",
  universeMode: HedgeUniverseType,
): string[] {
  if (universeMode === "manual") return [];
  if (universeMode === "solo-etfs") {
    return moneda === "USD" ? [...ETF_HEDGE_UNIVERSE] : [];
  }
  if (universeMode === "solo-cedears") {
    if (moneda === "ARS") return [...CEDEARS_ARS];
    return [...CEDEARS_USD];
  }
  if (moneda === "ARS") return [...BYMA_HEDGE_TICKERS];
  return [...ETF_HEDGE_UNIVERSE, ...CEDEAR_HEDGE_TICKERS];
}

export function detectarMonedaPosiciones(
  positions: Array<{ moneda?: string }>,
): "ARS" | "USD" | "mixto" {
  const monedas = new Set(positions.map((p) => p.moneda ?? "USD"));
  if (monedas.size === 1) {
    const m = monedas.values().next().value;
    return m === "ARS" ? "ARS" : "USD";
  }
  const hasARS = monedas.has("ARS") || monedas.has("ar$");
  const hasUSD = monedas.has("USD") || monedas.size === 0;
  if (hasARS && hasUSD) return "mixto";
  return hasARS ? "ARS" : "USD";
}

// ─── Factor clustering types ────────────────────────────────────────

export interface FactorFit {
  factor: string;
  factorName: string;
  beta: number;
  correlation: number;
  r2: number; // correlation² (univariado)
  alpha: number; // intercepto de regresión CAPM vs factor
  alphaPValue: number;
  observations: number;
}

export interface TickerCluster {
  ticker: string;
  bestFactor: string;
  bestFactorName: string;
  bestR2: number;
  bestBeta: number;
  bestAlpha: number;
  bestAlphaPValue: number;
  fits: FactorFit[]; // top-N fits (configurable)
}

export interface FactorClusterGroup {
  factor: string;
  factorName: string;
  tickers: string[];
  avgR2: number;
  size: number;
}

// ─── Hedge mode ─────────────────────────────────────────────────────

export type HedgeMode = "pure" | "alpha";

// ─── Broker metadata (para Portafolio Manual multi-broker) ──────────

export type BrokerId = "ninguno" | "iol" | "balanz" | "ppi" | "inviu" | "otro";

export interface ManualRow {
  ticker: string;
  cantidad: number;
  precioPromedio?: number; // opcional: si se provee, se calcula plPct real
  broker?: BrokerId;
}

// ─── Updated HedgeConfig ────────────────────────────────────────────

export interface HedgeConfigV2 extends HedgeConfig {
  hedgeMode: HedgeMode;
  gamma: number; // peso del término de alfa en Modo 2 (default 0)
  plFilterEnabled: boolean; // si true, solo posiciones con plPct < 0
}

export const DEFAULT_HEDGE_CONFIG_V2: HedgeConfigV2 = {
  ...DEFAULT_HEDGE_CONFIG,
  hedgeMode: "pure",
  gamma: 0,
  plFilterEnabled: true,
};

// ─── Updated HedgeResult ────────────────────────────────────────────

export interface HedgeResultV2 extends HedgeResult {
  clusters?: FactorClusterGroup[];
  tickerClusters?: TickerCluster[];
  plFilteredOut?: HedgePosition[]; // posiciones filtradas por P&L
  alphaDisclaimer?: string; // CNV disclaimer para Modo 2
}

export { FACTORS_MASTER_LIST } from "./benchmarks-master";
