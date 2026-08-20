/**
 * Benchmarks maestros de factores, sectores y macro (140+ entradas) para
 * análisis CAPM, correlaciones y coberturas. Cada entrada es un ticker real de
 * Yahoo Finance (series disponibles a través del `yahoo-http`).
 */

export interface BenchmarkEntry {
  ticker: string;
  name: string;
  cat:
    | "Macro"
    | "Bonds"
    | "Commodities"
    | "Sectors"
    | "Factors"
    | "Countries"
    | "Real Estate"
    | "Thematic"
    | "Crypto"
    | "AR";
  sub: string;
}

const E: Array<[string, string, BenchmarkEntry["cat"], string]> = [
  // Macro (5)
  ["DX-Y.NYB", "DXY", "Macro", "Currency"],
  ["^TNX", "UST 10Y", "Macro", "Rates"],
  ["^TYX", "UST 30Y", "Macro", "Rates"],
  ["^FVX", "UST 5Y", "Macro", "Rates"],
  ["^VIX", "VIX", "Macro", "Risk"],
  ["^GSPC", "S&P 500", "Macro", "Index"],
  ["^IXIC", "Nasdaq Composite", "Macro", "Index"],
  ["^DJI", "Dow Jones", "Macro", "Index"],
  ["^MERV", "MERVAL AR", "Macro", "Index"],
  ["^RUT", "Russell 2000", "Macro", "Index"],
  // Bonds (7)
  ["SHY", "1-3Y Treasuries", "Bonds", "Yield"],
  ["IEF", "7-10Y Treasuries", "Bonds", "Yield"],
  ["TLT", "20+Y Treasuries", "Bonds", "Yield"],
  ["LQD", "Inv. Grade Corp", "Bonds", "Credit"],
  ["HYG", "High Yield Corp", "Bonds", "Credit"],
  ["JNK", "High Yield Bond", "Bonds", "Credit"],
  ["EMB", "EM Bonds", "Bonds", "Credit"],
  // Commodities (8)
  ["USO", "WTI Crude", "Commodities", "Energy"],
  ["BNO", "Brent Crude", "Commodities", "Energy"],
  ["GLD", "Gold", "Commodities", "Precious"],
  ["SLV", "Silver", "Commodities", "Precious"],
  ["PPLT", "Platinum", "Commodities", "Precious"],
  ["COPX", "Copper", "Commodities", "Industrial"],
  ["DBA", "Agriculture", "Commodities", "Agriculture"],
  ["UNG", "Natural Gas", "Commodities", "Energy"],
  // US Sectors (22) — SPDR sector ETFs
  ["XLK", "Tecnología", "Sectors", "US"],
  ["XLF", "Finanzas", "Sectors", "US"],
  ["XLV", "Salud", "Sectors", "US"],
  ["XLE", "Energía", "Sectors", "US"],
  ["XLC", "Comunicación", "Sectors", "US"],
  ["XLY", "Consumo Discrecional", "Sectors", "US"],
  ["XLP", "Consumo Básico", "Sectors", "US"],
  ["XLI", "Industriales", "Sectors", "US"],
  ["XLB", "Materiales", "Sectors", "US"],
  ["XLRE", "Real Estate", "Sectors", "US"],
  ["XLU", "Utilidades", "Sectors", "US"],
  ["SMH", "Semiconductores", "Sectors", "US"],
  // Smart Beta / Factors (25)
  ["MTUM", "Momentum", "Factors", "Alpha"],
  ["QUAL", "Calidad", "Factors", "Alpha"],
  ["USMV", "Min Vol", "Factors", "Risk"],
  ["IVE", "Value", "Factors", "Style"],
  ["IWF", "Growth", "Factors", "Style"],
  ["SPSM", "Small Cap", "Factors", "Size"],
  ["XLG", "Mega Cap", "Factors", "Size"],
  ["VLUE", "Value", "Factors", "Style"],
  ["SIZE", "Size", "Factors", "Size"],
  ["HDV", "Alto Dividendo", "Factors", "Dividend"],
  ["DGRO", "Dividend Growth", "Factors", "Dividend"],
  ["LOWV", "Low Vol", "Factors", "Risk"],
  ["SPLV", "Low Vol", "Factors", "Risk"],
  ["MOM", "Momentum", "Factors", "Alpha"],
  ["FLOW", "Cash Flow", "Factors", "Alpha"],
  ["MILN", "Millennials", "Factors", "Thematic"],
  ["QQQ", "Nasdaq 100", "Factors", "Growth"],
  ["SPY", "S&P 500 ETF", "Factors", "Market"],
  ["VOO", "S&P 500 Vanguard", "Factors", "Market"],
  ["DIA", "Dow ETF", "Factors", "Market"],
  ["IWM", "Russell 2000 ETF", "Factors", "Size"],
  ["VTI", "Total Market", "Factors", "Market"],
  // Countries (15)
  ["EWZ", "Brasil", "Countries", "Latam"],
  ["ARGT", "Argentina ADR", "Countries", "Latam"],
  ["EEM", "Emergentes", "Countries", "Global"],
  ["VWO", "Emergentes Vanguard", "Countries", "Global"],
  ["EWC", "Canadá", "Countries", "Developed"],
  ["EWU", "Reino Unido", "Countries", "Developed"],
  ["EWJ", "Japón", "Countries", "Developed"],
  ["EWG", "Alemania", "Countries", "Developed"],
  ["EWH", "Hong Kong", "Countries", "Developed"],
  ["EWY", "Corea", "Countries", "Developed"],
  ["FXI", "China", "Countries", "China"],
  ["KWEB", "China Internet", "Countries", "China"],
  ["INDA", "India", "Countries", "Asia"],
  ["ECH", "Chile", "Countries", "Latam"],
  ["EPU", "Perú", "Countries", "Latam"],
  // Real Estate (5)
  ["VNQ", "REITs US", "Real Estate", "REIT"],
  ["XLRE", "Real Estate SPDR", "Real Estate", "REIT"],
  ["IYR", "REITs US", "Real Estate", "REIT"],
  ["HOMZ", "Housing", "Real Estate", "Thematic"],
  // Thematic (6)
  ["ARKK", "Innovación", "Thematic", "Disruptive"],
  ["ARKW", "Next Gen", "Thematic", "Disruptive"],
  ["BOTZ", "Robótica", "Thematic", "AI"],
  ["AIQ", "IA", "Thematic", "AI"],
  ["IBB", "Biotech", "Thematic", "Biotech"],
  ["XBI", "Biotech Small", "Thematic", "Biotech"],
  // Crypto (2)
  ["BTC-USD", "Bitcoin", "Crypto", "Digital"],
  ["ETH-USD", "Ethereum", "Crypto", "Digital"],
];

export const BENCHMARKS_MASTER: BenchmarkEntry[] = E.map(([ticker, name, cat, sub]) => ({
  ticker,
  name,
  cat,
  sub,
}));

const byTicker = new Map<string, BenchmarkEntry>(BENCHMARKS_MASTER.map((e) => [e.ticker, e]));

/** Ticker base de Ethereum/Bitcoin (pares de Yahoo). */
export const FACTORS_MASTER_LIST: Record<string, { name: string; cat: string; sub: string }> = {};
for (const e of BENCHMARKS_MASTER) {
  FACTORS_MASTER_LIST[e.ticker] = { name: e.name, cat: e.cat, sub: e.sub };
}

export const AUTO_BENCHMARKS: string[] = BENCHMARKS_MASTER.map((e) => e.ticker);

export const SECTOR_ETF_BY_SECTOR_KEY: Record<string, string> = {
  technology: "XLK",
  "financial-services": "XLF",
  healthcare: "XLV",
  energy: "XLE",
  "communication-services": "XLC",
  "consumer-cyclical": "XLY",
  "consumer-defensive": "XLP",
  industrials: "XLI",
  "basic-materials": "XLB",
  "real-estate": "XLRE",
  utilities: "XLU",
};

export const SECTOR_KEY_BY_ESPANOL: Record<string, string> = {
  tecnologia: "technology",
  "servicios financieros": "financial-services",
  "cuidado de la salud": "healthcare",
  energia: "energy",
  "servicios de comunicacion": "communication-services",
  "consumo ciclico": "consumer-cyclical",
  "defensiva del consumidor": "consumer-defensive",
  "acciones industriales": "industrials",
  "materiales basicos": "basic-materials",
  "bienes raices": "real-estate",
  "real estate": "real-estate",
  utilidades: "utilities",
};

export function entradasPorCategoria(cat: BenchmarkEntry["cat"]): BenchmarkEntry[] {
  return BENCHMARKS_MASTER.filter((e) => e.cat === cat);
}

export function buscarBenchmark(consulta: string): BenchmarkEntry[] {
  const q = consulta.trim().toLowerCase();
  if (!q) return [];
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  return BENCHMARKS_MASTER.filter(
    (e) =>
      e.ticker.toLowerCase().includes(q) ||
      e.name.toLowerCase().includes(q) ||
      norm(e.name).includes(norm(q)),
  );
}

export function benchmarkPorTicker(ticker: string): BenchmarkEntry | undefined {
  return byTicker.get(ticker);
}
