// @ts-nocheck
export interface BenchmarkEntry {
  ticker: string;
  name: string;
  cat: string;
  sub: string;
}

const ENTRIES: BenchmarkEntry[] = [
  // ── Macro ────────────────────────────────────────────────────────
  { ticker: "DX-Y.NYB", name: "Dólar Index (DXY)", cat: "Macro", sub: "Currency" },
  { ticker: "EURUSD=X", name: "Euro/Dólar", cat: "Macro", sub: "Currency" },
  { ticker: "^TNX", name: "Yield 10Y Tesoro", cat: "Macro", sub: "Rates" },
  { ticker: "^VIX", name: "Índice de Volatilidad (Miedo)", cat: "Macro", sub: "Risk" },
  { ticker: "TIP", name: "TIPS (Inflación)", cat: "Macro", sub: "Inflation" },
  // ── Bonds ────────────────────────────────────────────────────────
  { ticker: "SHY", name: "Bonos 1-3Y (Corto)", cat: "Bonds", sub: "Yield" },
  { ticker: "IEF", name: "Bonos 7-10Y (Medio)", cat: "Bonds", sub: "Yield" },
  { ticker: "TLT", name: "Bonos 20+Y (Largo)", cat: "Bonds", sub: "Yield" },
  { ticker: "HYG", name: "High Yield (Corporativo)", cat: "Bonds", sub: "Risk" },
  { ticker: "LQD", name: "Corp. Investment Grade", cat: "Bonds", sub: "Risk" },
  { ticker: "BNDX", name: "Bonos Int. Total", cat: "Bonds", sub: "Global" },
  // ── Commodities ──────────────────────────────────────────────────
  { ticker: "USO", name: "Petróleo WTI", cat: "Commodities", sub: "Energy" },
  { ticker: "UNG", name: "Gas Natural", cat: "Commodities", sub: "Energy" },
  { ticker: "GLD", name: "Oro", cat: "Commodities", sub: "Precious" },
  { ticker: "SLV", name: "Plata", cat: "Commodities", sub: "Precious" },
  { ticker: "COPX", name: "Cobre", cat: "Commodities", sub: "Industrial" },
  { ticker: "DBA", name: "Agricultura", cat: "Commodities", sub: "Agri" },
  { ticker: "SOYB", name: "Soja", cat: "Commodities", sub: "Agri" },
  { ticker: "CORN", name: "Maíz", cat: "Commodities", sub: "Agri" },
  { ticker: "LIT", name: "Litio", cat: "Commodities", sub: "Strategic" },
  // ── US Sectors ───────────────────────────────────────────────────
  { ticker: "XLK", name: "Tecnología", cat: "Sectors", sub: "US" },
  { ticker: "XLF", name: "Finanzas", cat: "Sectors", sub: "US" },
  { ticker: "XLV", name: "Salud", cat: "Sectors", sub: "US" },
  { ticker: "XLE", name: "Energía", cat: "Sectors", sub: "US" },
  { ticker: "XLC", name: "Comunicación", cat: "Sectors", sub: "US" },
  { ticker: "XLY", name: "Consumo Discrecional", cat: "Sectors", sub: "US" },
  { ticker: "XLP", name: "Consumo Básico", cat: "Sectors", sub: "US" },
  { ticker: "XLI", name: "Industrial", cat: "Sectors", sub: "US" },
  { ticker: "XAR", name: "Aeroespacial y Defensa", cat: "Sectors", sub: "US" },
  { ticker: "ITA", name: "Aeroespacial y Defensa (IT)", cat: "Sectors", sub: "US" },
  { ticker: "SMH", name: "Semiconductores", cat: "Sectors", sub: "US" },
  { ticker: "IBB", name: "Biotecnología", cat: "Sectors", sub: "US" },
  { ticker: "GDX", name: "Mineras de Oro", cat: "Sectors", sub: "US" },
  { ticker: "XME", name: "Metales y Minería", cat: "Sectors", sub: "US" },
  { ticker: "CIBR", name: "Ciberseguridad", cat: "Sectors", sub: "US" },
  { ticker: "ARKK", name: "Innovación Disruptiva", cat: "Sectors", sub: "US" },
  { ticker: "URA", name: "Uranio", cat: "Sectors", sub: "US" },
  { ticker: "ICLN", name: "Energía Limpia", cat: "Sectors", sub: "US" },
  { ticker: "XLB", name: "Materiales", cat: "Sectors", sub: "US" },
  { ticker: "XLRE", name: "Inmobiliario", cat: "Sectors", sub: "US" },
  { ticker: "XLU", name: "Utilities", cat: "Sectors", sub: "US" },
  // ── Factors / Smart Beta ────────────────────────────────────────
  { ticker: "MTUM", name: "Momentum", cat: "Factors", sub: "Alpha" },
  { ticker: "QUAL", name: "Calidad", cat: "Factors", sub: "Alpha" },
  { ticker: "SIZE", name: "Small Caps", cat: "Factors", sub: "Style" },
  { ticker: "USMV", name: "Min. Volatilidad", cat: "Factors", sub: "Risk" },
  { ticker: "IVE", name: "Value", cat: "Factors", sub: "Style" },
  { ticker: "IVW", name: "Growth", cat: "Factors", sub: "Style" },
  { ticker: "IWM", name: "Russell 2000", cat: "Factors", sub: "Market" },
  { ticker: "SPY", name: "SPDR S&P 500 ETF", cat: "Factors", sub: "Market" },
  { ticker: "QQQ", name: "Invesco QQQ Trust", cat: "Factors", sub: "Market" },
  { ticker: "RSP", name: "S&P 500 Equal Weight", cat: "Factors", sub: "Market" },
  { ticker: "SPHQ", name: "S&P 500 Calidad", cat: "Factors", sub: "Alpha" },
  { ticker: "VIG", name: "Dividend Growth", cat: "Factors", sub: "Style" },
  { ticker: "ESGU", name: "ESG EE.UU.", cat: "Factors", sub: "Alpha" },
  { ticker: "IJH", name: "S&P Mid-Cap 400", cat: "Factors", sub: "Market" },
  { ticker: "DIA", name: "Dow Jones Industrial", cat: "Factors", sub: "Market" },
  { ticker: "ACWI", name: "ACWI Global", cat: "Factors", sub: "Market" },
  { ticker: "IEMG", name: "Emergentes Integral", cat: "Factors", sub: "Market" },
  { ticker: "VEA", name: "Desarrollados FTSE", cat: "Factors", sub: "Market" },
  { ticker: "IEUR", name: "Europa", cat: "Factors", sub: "Market" },
  { ticker: "EWY", name: "MSCI Corea", cat: "Factors", sub: "Asia" },
  { ticker: "ILF", name: "Latam", cat: "Factors", sub: "Latam" },
  { ticker: "PSQ", name: "Short QQQ", cat: "Factors", sub: "Hedge" },
  { ticker: "SH", name: "Short S&P 500", cat: "Factors", sub: "Hedge" },
  { ticker: "SPXL", name: "S&P 500 3x Long", cat: "Factors", sub: "Leveraged" },
  { ticker: "TQQQ", name: "Nasdaq 3x Long", cat: "Factors", sub: "Leveraged" },
  { ticker: "VXX", name: "VIX Short-Term", cat: "Factors", sub: "Risk" },
  // ── Countries / Regions ──────────────────────────────────────────
  { ticker: "ARGT", name: "MSCI Argentina", cat: "Countries", sub: "Latam" },
  { ticker: "EWZ", name: "MSCI Brasil", cat: "Countries", sub: "Latam" },
  { ticker: "EWW", name: "MSCI México", cat: "Countries", sub: "Latam" },
  { ticker: "ECH", name: "MSCI Chile", cat: "Countries", sub: "Latam" },
  { ticker: "EEM", name: "Emerging Markets", cat: "Countries", sub: "Global" },
  { ticker: "VWO", name: "Emerging Vanguard", cat: "Countries", sub: "Global" },
  { ticker: "FXI", name: "China Large Caps", cat: "Countries", sub: "Asia" },
  { ticker: "INDA", name: "MSCI India", cat: "Countries", sub: "Asia" },
  { ticker: "EFA", name: "Desarrollados ex-US", cat: "Countries", sub: "Global" },
  { ticker: "EWG", name: "MSCI Alemania", cat: "Countries", sub: "Europe" },
  { ticker: "EWJ", name: "MSCI Japón", cat: "Countries", sub: "Asia" },
  { ticker: "^GDAXI", name: "DAX Alemania", cat: "Countries", sub: "Europe" },
  { ticker: "^N225", name: "Nikkei 225", cat: "Countries", sub: "Asia" },
  // ── Market Indices ───────────────────────────────────────────────
  { ticker: "^SPX", name: "S&P 500", cat: "Market", sub: "US" },
  { ticker: "^GSPC", name: "S&P 500 (alt)", cat: "Market", sub: "US" },
  { ticker: "^IXIC", name: "NASDAQ", cat: "Market", sub: "US" },
  { ticker: "^DJI", name: "Dow Jones", cat: "Market", sub: "US" },
  { ticker: "^RUT", name: "Russell 2000", cat: "Market", sub: "US" },
  { ticker: "^MERV", name: "MERVAL", cat: "Market", sub: "Argentina" },
  { ticker: "^FTSE", name: "FTSE 100", cat: "Market", sub: "Europe" },
  { ticker: "^HSI", name: "Hang Seng", cat: "Market", sub: "Asia" },
  { ticker: "^MXX", name: "IPC México", cat: "Market", sub: "Latam" },
  { ticker: "^STOXX", name: "STOXX Europa 600", cat: "Market", sub: "Europe" },
  { ticker: "^FCHI", name: "CAC 40", cat: "Market", sub: "Europe" },
  // ── ARCA / BCBA ETFs ────────────────────────────────────────────
  { ticker: "SPY", name: "S&P 500 (cotización CCL)", cat: "Argentina", sub: "BCBA" },
  // ── Crypto ───────────────────────────────────────────────────────
  { ticker: "BTC-USD", name: "Bitcoin USD", cat: "Crypto", sub: "Crypto" },
  { ticker: "ETHA", name: "Ethereum Trust", cat: "Crypto", sub: "Crypto" },
  // ── Real Estate ──────────────────────────────────────────────────
  { ticker: "REET", name: "Real Estate Total", cat: "RealEstate", sub: "Global" },
  { ticker: "ICF", name: "Real Estate US", cat: "RealEstate", sub: "US" },
  // ── Thematic ─────────────────────────────────────────────────────
  { ticker: "ROKT", name: "Robótica e IA", cat: "Thematic", sub: "Innovation" },
  { ticker: "BOTZ", name: "Robótica Global", cat: "Thematic", sub: "Innovation" },
  { ticker: "AIQ", name: "IA Global", cat: "Thematic", sub: "Innovation" },
  { ticker: "DRIV", name: "Vehiculos Autónomos", cat: "Thematic", sub: "Innovation" },
  { ticker: "CLOU", name: "Cloud Computing", cat: "Thematic", sub: "Tech" },
  { ticker: "SKYY", name: "Cloud 5G", cat: "Thematic", sub: "Tech" },
  { ticker: "FINX", name: "Fintech", cat: "Thematic", sub: "Finance" },
  { ticker: "ARKF", name: "Fintech Disruptiva", cat: "Thematic", sub: "Finance" },
  { ticker: "ARKG", name: "Genómica", cat: "Thematic", sub: "Healthcare" },
  { ticker: "XBI", name: "Biotecnología SPDR", cat: "Thematic", sub: "Healthcare" },
  { ticker: "PICK", name: "Minería Global", cat: "Thematic", sub: "Materials" },
  { ticker: "WOOD", name: "Forestal", cat: "Thematic", sub: "Materials" },
  { ticker: "CUT", name: "Maderas", cat: "Thematic", sub: "Materials" },
  // ── Fixed Income Argentina ──────────────────────────────────────
  { ticker: "GD30D.BA", name: "Bonos Argentina USD", cat: "Argentina", sub: "Sovereign" },
  { ticker: "AL30D.BA", name: "Bonos Argentina USD (AL)", cat: "Argentina", sub: "Sovereign" },
];

const byTicker = new Map<string, BenchmarkEntry>();
for (const e of ENTRIES) byTicker.set(e.ticker, e);

export const BENCHMARKS_MASTER = [...byTicker.values()];

export const AUTO_BENCHMARKS = BENCHMARKS_MASTER.map((e) => e.ticker);
export const FACTORS_MASTER_LIST: Record<string, { name: string; cat: string; sub: string }> = {};
for (const e of BENCHMARKS_MASTER) FACTORS_MASTER_LIST[e.ticker] = { name: e.name, cat: e.cat, sub: e.sub };
export const BENCHMARKS_CLASIFICACION: { ticker: string; name: string }[] = BENCHMARKS_MASTER.map((e) => ({
  ticker: e.ticker,
  name: e.name,
}));
