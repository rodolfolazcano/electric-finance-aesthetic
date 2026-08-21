// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { computePearsonCorrelation } from "../intermarket-complete";

//  MASTER FACTOR LIST (macro, sectores, smart-beta, países) 

export const FACTOR_META: Record<string, { name: string; cat: string; sub: string }> = {
  // MACRO & DIVISAS
  "DX-Y.NYB": { name: "Dólar Index (DXY)", cat: "Macro", sub: "Currency" },
  "^TNX": { name: "Yield 10Y Tesoro", cat: "Macro", sub: "Rates" },
  "^VIX": { name: "Índice de Volatilidad", cat: "Macro", sub: "Risk" },
  "TIP": { name: "TIPS (Inflación)", cat: "Macro", sub: "Inflation" },
  // BONOS
  "SHY": { name: "Bonos 1-3Y", cat: "Bonds", sub: "Yield" },
  "IEF": { name: "Bonos 7-10Y", cat: "Bonds", sub: "Yield" },
  "TLT": { name: "Bonos 20+Y", cat: "Bonds", sub: "Yield" },
  "HYG": { name: "High Yield Corp.", cat: "Bonds", sub: "Risk" },
  "LQD": { name: "Corp. Investment Grade", cat: "Bonds", sub: "Risk" },
  "BNDX": { name: "Bonos Int. Total", cat: "Bonds", sub: "Global" },
  // COMMODITIES
  "USO": { name: "Petróleo WTI", cat: "Commodities", sub: "Energy" },
  "UNG": { name: "Gas Natural", cat: "Commodities", sub: "Energy" },
  "GLD": { name: "Oro", cat: "Commodities", sub: "Precious" },
  "SLV": { name: "Plata", cat: "Commodities", sub: "Precious" },
  "COPX": { name: "Cobre", cat: "Commodities", sub: "Industrial" },
  "DBC": { name: "Comm. (CRB)", cat: "Commodities", sub: "Broad" },
  "DBA": { name: "Agricultura", cat: "Commodities", sub: "Agri" },
  "LIT": { name: "Litio", cat: "Commodities", sub: "Strategic" },
  // SECTORES EE.UU.
  "XLK": { name: "Tecnología", cat: "Sectors", sub: "US" },
  "XLF": { name: "Finanzas", cat: "Sectors", sub: "US" },
  "XLV": { name: "Salud", cat: "Sectors", sub: "US" },
  "XLE": { name: "Energía", cat: "Sectors", sub: "US" },
  "XLC": { name: "Comunicación", cat: "Sectors", sub: "US" },
  "XLY": { name: "Consumo Discrecional", cat: "Sectors", sub: "US" },
  "XLP": { name: "Consumo Básico", cat: "Sectors", sub: "US" },
  "XLI": { name: "Industrial", cat: "Sectors", sub: "US" },
  "XLB": { name: "Materiales", cat: "Sectors", sub: "US" },
  "XLRE": { name: "Inmobiliario", cat: "Sectors", sub: "US" },
  "XLU": { name: "Utilities", cat: "Sectors", sub: "US" },
  "XAR": { name: "Aero-Defensa", cat: "Sectors", sub: "US" },
  // SMART BETA / FACTORES
  "MTUM": { name: "Momentum", cat: "Factors", sub: "Alpha" },
  "QUAL": { name: "Calidad", cat: "Factors", sub: "Alpha" },
  "SIZE": { name: "Small Caps", cat: "Factors", sub: "Style" },
  "USMV": { name: "Min. Volatilidad", cat: "Factors", sub: "Risk" },
  "IVE": { name: "Value", cat: "Factors", sub: "Style" },
  "IVW": { name: "Growth", cat: "Factors", sub: "Style" },
  "IWM": { name: "Russell 2000", cat: "Factors", sub: "Market" },
  // PAÍSES Y REGIONES
  "ARGT": { name: "MSCI Argentina", cat: "Countries", sub: "Latam" },
  "EWZ": { name: "MSCI Brasil", cat: "Countries", sub: "Latam" },
  "EWW": { name: "MSCI México", cat: "Countries", sub: "Latam" },
  "ECH": { name: "MSCI Chile", cat: "Countries", sub: "Latam" },
  "EEM": { name: "Emergentes", cat: "Countries", sub: "Global" },
  "VWO": { name: "Emerging Vanguard", cat: "Countries", sub: "Global" },
  "FXI": { name: "China Large Caps", cat: "Countries", sub: "Asia" },
  "INDA": { name: "MSCI India", cat: "Countries", sub: "Asia" },
  "EFA": { name: "Desarrollados ex-US", cat: "Countries", sub: "Global" },
  "EWG": { name: "MSCI Alemania", cat: "Countries", sub: "Europe" },
  "EWJ": { name: "MSCI Japón", cat: "Countries", sub: "Asia" },
  // MARKET INDICES
  "SPY": { name: "S&P 500", cat: "Market", sub: "US" },
  "QQQ": { name: "NASDAQ 100", cat: "Market", sub: "US" },
  "DIA": { name: "Dow Jones", cat: "Market", sub: "US" },
};

// All tickers (optimized set: remove currency pairs, keep everything else)
const ALL_TICKERS = Object.keys(FACTOR_META);

const ETF_SECTOR_MAP: Record<string, string> = {};
for (const [t, m] of Object.entries(FACTOR_META)) {
  ETF_SECTOR_MAP[t] = `${m.cat} — ${m.sub}`;
}
ETF_SECTOR_MAP.SPY = "S&P 500";
ETF_SECTOR_MAP.QQQ = "NASDAQ 100";
ETF_SECTOR_MAP.DIA = "Dow Jones";
ETF_SECTOR_MAP.IWM = "Russell 2000";

//  Types 

export type CRBBondsTrend = "rising" | "falling" | "neutral" | null;

export interface MacroFilterResult {
  crbBondsRatio: number | null;
  crbBondsTrend: CRBBondsTrend;
  crbBondsChange1m: number | null;
  regimeLabel: string;
  sectoresFavorecidos: string[];
  sectoresDesfavorecidos: string[];
}

export interface CuelloBotellaSector {
  sectorKey: string;
  label: string;
  justificacion: string;
  tienePricingPower: boolean;
  esEstructural: boolean;
}

export interface BenchMatrixRow {
  etfA: string;
  etfB: string;
  sectorA: string;
  sectorB: string;
  correlation: number;
}

export interface BenchBetaRow {
  etf: string;
  sector: string;
  /** Beta contra SPY (para comparación estandarizada) */
  betaVsSPY: number;
  alpha: number;
  /** R² contra SPY */
  r2: number;
  perfil: "Defensivo" | "Neutral" | "Agresivo/Cíclico";
  /** Mejor benchmark (mayor R² de toda la factor list) */
  bestBenchmark: string;
  bestBenchmarkName: string;
  /** Beta contra ese mejor benchmark */
  bestBeta: number;
  /** R² contra ese mejor benchmark */
  bestR2: number;
  /** Perfil contra el mejor benchmark */
  bestPerfil: string;
}

export interface BenchMultiBeta {
  benchmark: string;
  benchmarkName: string;
  entries: { etf: string; beta: number; alpha: number; r2: number; perfil: string }[];
}

const CUELLOS_BOTELLA: CuelloBotellaSector[] = [
  { sectorKey: "Utilities", label: "Servicios Públicos", justificacion: "Redes eléctricas, transmisión y distribución regulada con demanda inelástica. Inversión en infraestructura de redes inteligentes.", tienePricingPower: true, esEstructural: true },
  { sectorKey: "Energy", label: "Energía", justificacion: "Ingeniería nuclear, generación eléctrica de base. Ciclo de rearme nuclear global. Oferta limitada por regulación ambiental.", tienePricingPower: true, esEstructural: true },
  { sectorKey: "Industrials", label: "Industriales", justificacion: "Fabricación de transformadores, turbinas, equipos de transmisión. Cuello de botella global por reshoring y electrificación.", tienePricingPower: false, esEstructural: true },
  { sectorKey: "Basic Materials", label: "Materiales", justificacion: "Minería de cobre, litio, tierras raras. Demanda estructural por electrificación y energías limpias.", tienePricingPower: true, esEstructural: true },
  { sectorKey: "Technology", label: "Tecnología", justificacion: "Semiconductores (SMH), infraestructura de data centers, chips de IA. Cuello de botella en capacidad de fabricación 3nm/5nm.", tienePricingPower: true, esEstructural: true },
];

export interface BenchmarksMatrixResult {
  matrix: BenchMatrixRow[];
  betas: BenchBetaRow[];
  mejoresParaDiversificar: BenchMatrixRow[];
  masRedundantes: BenchMatrixRow[];
  multiBetas: BenchMultiBeta[];
  returns: Record<string, number[]>;
  macroFilter: MacroFilterResult;
  cuellosBotella: CuelloBotellaSector[];
}

//  Helpers 

function computeCRBBondsTrend(closesMap: Map<string, number[]>): MacroFilterResult {
  const dbc = closesMap.get("DBC");
  const tlt = closesMap.get("TLT");
  if (!dbc || !tlt || dbc.length < 30 || tlt.length < 30) {
    return { crbBondsRatio: null, crbBondsTrend: null, crbBondsChange1m: null, regimeLabel: "Sin datos", sectoresFavorecidos: [], sectoresDesfavorecidos: [] };
  }
  const minLen = Math.min(dbc.length, tlt.length);
  const ratios: number[] = [];
  for (let i = 0; i < minLen; i++) ratios.push(dbc[i] / tlt[i]);
  const lastRatio = ratios[ratios.length - 1];
  const idx4w = Math.max(0, ratios.length - 5);
  const prevRatio = ratios[idx4w];
  const change1m = prevRatio > 0 ? (lastRatio - prevRatio) / prevRatio : 0;
  const idx12w = Math.max(0, ratios.length - 13);
  const prevRatio3m = ratios[idx12w];
  const change3m = prevRatio3m > 0 ? (lastRatio - prevRatio3m) / prevRatio3m : 0;

  const trend: CRBBondsTrend = change3m > 0.03 ? "rising" : change3m < -0.03 ? "falling" : "neutral";

  let regimeLabel: string;
  let sectoresFavorecidos: string[];
  let sectoresDesfavorecidos: string[];

  if (trend === "rising") {
    regimeLabel = "Inflación / Commodities";
    sectoresFavorecidos = ["Energía", "Materiales"];
    sectoresDesfavorecidos = ["Consumo Básico", "Salud", "Utilities"];
  } else if (trend === "falling") {
    regimeLabel = "Desinflación / Tasas";
    sectoresFavorecidos = ["Financieras", "Servicios Públicos", "Consumo Básico"];
    sectoresDesfavorecidos = ["Energía", "Materiales"];
  } else {
    regimeLabel = "Neutral";
    sectoresFavorecidos = [];
    sectoresDesfavorecidos = [];
  }

  return {
    crbBondsRatio: Math.round(lastRatio * 10000) / 10000,
    crbBondsTrend: trend,
    crbBondsChange1m: Math.round(change1m * 10000) / 10000,
    regimeLabel,
    sectoresFavorecidos,
    sectoresDesfavorecidos,
  };
}

let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try { _yf = typeof YF === "function" ? new YF() : YF; } catch { _yf = YF; }
  try { _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]); } catch { /* noop */ }
  return _yf;
}

async function fetchWeeklyClosesBatch(tickers: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  try {
    const yf = await getYF();
    const period2 = new Date();
    const period1 = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

    // yahoo-finance2 chart accepts one ticker; batch via Promise.allSettled
    const results = await Promise.allSettled(
      tickers.map(async (t) => {
        const rows = await yf.chart(t, { period1, period2, interval: "1wk" });
        const closes: number[] = (rows?.quotes ?? [])
          .map((q: any) => q.close as number)
          .filter((c: number | null): c is number => c != null && c > 0);
        return { ticker: t, closes };
      }),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.closes.length >= 30) {
        map.set(r.value.ticker, r.value.closes);
      }
    }
  } catch { /* partial data is ok */ }
  return map;
}

function weeklyReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) out.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }
  return out;
}

// pearsonR unificado via computePearsonCorrelation (intermarket-complete)

export function computeBeta(x: number[], y: number[]): { beta: number; alpha: number; r2: number } {
  const n = Math.min(x.length, y.length);
  if (n < 10) return { beta: 0, alpha: 0, r2: 0 };
  const xs = x.slice(-n), ys = y.slice(-n);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; cov += dx * dy; vx += dx * dx; vy += dy * dy; }
  const beta = vy > 0 ? cov / vy : 0;
  const alpha = mx - beta * my;
  const r = computePearsonCorrelation(xs, ys) ?? 0;
  return { beta, alpha, r2: r * r };
}

function perfilLabel(beta: number): string {
  if (beta < 0.8) return "Defensivo";
  if (beta > 1.2) return "Agresivo";
  return "Neutral";
}

//  Main function 

export const getBenchmarksMatrix = createServerFn({ method: "GET" }).handler(async (): Promise<BenchmarksMatrixResult> => {
  const closesMap = await fetchWeeklyClosesBatch(ALL_TICKERS);
  const etfs = [...closesMap.keys()];
  const returnsMap = new Map<string, number[]>();
  for (const etf of etfs) returnsMap.set(etf, weeklyReturns(closesMap.get(etf)!));

  //  Matriz de correlación entre todos los pares 
  const matrix: BenchMatrixRow[] = [];
  for (let i = 0; i < etfs.length; i++) {
    for (let j = i + 1; j < etfs.length; j++) {
      const corr = computePearsonCorrelation(returnsMap.get(etfs[i])!, returnsMap.get(etfs[j])!) ?? 0;
      matrix.push({
        etfA: etfs[i], etfB: etfs[j],
        sectorA: ETF_SECTOR_MAP[etfs[i]] ?? etfs[i],
        sectorB: ETF_SECTOR_MAP[etfs[j]] ?? etfs[j],
        correlation: Math.round(corr * 10000) / 10000,
      });
    }
  }
  const sorted = [...matrix].sort((a, b) => a.correlation - b.correlation);
  const mejoresParaDiversificar = sorted.slice(0, 3);
  const masRedundantes = sorted.slice(-3).reverse();

  //  Betas: para CADA activo, encontrar el mejor benchmark (mayor R²) 
  const spyRet = returnsMap.get("SPY") ?? [];
  const allBenchmarkRetMap = new Map(returnsMap); // all tickers as potential benchmarks

  const betas: BenchBetaRow[] = etfs
    .filter((e) => e !== "SPY")
    .map((e) => {
      const retE = returnsMap.get(e)!;

      // Beta vs SPY (estandarizada)
      const { beta: bSpy, alpha, r2: r2Spy } = spyRet.length >= 10 ? computeBeta(retE, spyRet) : { beta: 0, alpha: 0, r2: 0 };

      // Buscar el mejor benchmark de TODA la lista (excluyéndose a sí mismo)
      let bestBenchmark = "SPY";
      let bestBeta = bSpy;
      let bestR2 = r2Spy;
      for (const [bm, retBm] of allBenchmarkRetMap) {
        if (bm === e || retBm.length < 20) continue;
        const { beta: bBeta, r2: bR2 } = computeBeta(retE, retBm);
        if (bR2 > bestR2) {
          bestR2 = bR2;
          bestBeta = bBeta;
          bestBenchmark = bm;
        }
      }

      const meta = FACTOR_META[bestBenchmark];
      const bestBenchmarkName = meta ? `${meta.name} (${meta.cat})` : bestBenchmark;

      return {
        etf: e,
        sector: ETF_SECTOR_MAP[e] ?? e,
        betaVsSPY: Math.round(bSpy * 10000) / 10000,
        alpha: Math.round(alpha * 100000) / 100000,
        r2: Math.round(r2Spy * 10000) / 10000,
        perfil: bSpy < 0.8 ? "Defensivo" : bSpy > 1.2 ? "Agresivo/Cíclico" : "Neutral",
        bestBenchmark,
        bestBenchmarkName,
        bestBeta: Math.round(bestBeta * 10000) / 10000,
        bestR2: Math.round(bestR2 * 10000) / 10000,
        bestPerfil: perfilLabel(bestBeta),
      };
    });

  //  Multi-benchmark (QQQ, DIA, IWM) para compatibilidad descendente 
  const multiBenchmarks = ["QQQ", "DIA", "IWM"];
  const multiBetas: BenchMultiBeta[] = [];
  for (const bm of multiBenchmarks) {
    const bmRet = returnsMap.get(bm);
    if (!bmRet || bmRet.length < 20) continue;
    const entries = etfs
      .filter((e) => e !== bm && e !== "SPY")
      .map((e) => {
        const { beta, alpha, r2 } = computeBeta(returnsMap.get(e)!, bmRet);
        return {
          etf: e,
          beta: Math.round(beta * 10000) / 10000,
          alpha: Math.round(alpha * 100000) / 100000,
          r2: Math.round(r2 * 10000) / 10000,
          perfil: perfilLabel(beta),
        };
      });
    multiBetas.push({ benchmark: bm, benchmarkName: FACTOR_META[bm]?.name ?? bm, entries });
  }

  const returns: Record<string, number[]> = {};
  for (const [etf, rets] of returnsMap) returns[etf] = rets;

  const macroFilter = computeCRBBondsTrend(closesMap);
  const cuellosBotella = CUELLOS_BOTELLA;

  return { matrix, betas, mejoresParaDiversificar, masRedundantes, multiBetas, returns, macroFilter, cuellosBotella };
});
