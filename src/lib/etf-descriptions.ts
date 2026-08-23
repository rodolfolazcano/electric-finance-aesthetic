/**
 * ETF descripciones Labadié — lectures_2017_unam_etf_v4 (replication, tracking error, basis risk)
 * Full replication = minimal tracking error (índices líquidos, ej XLI 70 stocks)
 * Optimised sampling = sub-sample con tracking error target 10% (índices amplios)
 * Synthetic = swaps LIBOR+fee vs retorno índice (riesgo crédito)
 */

export interface EtfMeta {
  ticker: string;
  nombre: string;
  subcategoria: string;
  replication: "Full" | "Optimised sampling" | "Synthetic" | "Leveraged/Inverse";
  trackingErrorBajo: string; // ej "0.10-0.15%"
  expense: string;
  descripcion: string;
  pros: string;
  cons: string;
}

export const ETF_DESCRIPTIONS: Record<string, Omit<EtfMeta, "ticker">> = {
  // Sector SPDR — physically backed, full/optimised
  XLI: { nombre: "Industrial Select Sector SPDR", subcategoria: "Sector - Industrials", replication: "Full", trackingErrorBajo: "0.12-0.18%", expense: "0.10%", descripcion: "70+ industriales US (CAT, HON, UPS, BA). Replica física completa. Basis risk bajo vs Industriales puros.", pros: "Alta liquidez, spread estrecho, hedge beta-neutral directo", cons: "Exposición concentrada en large caps, no cubre small industrials" },
  XLK: { nombre: "Technology Select Sector SPDR", subcategoria: "Sector - Technology", replication: "Full", trackingErrorBajo: "0.10-0.15%", expense: "0.10%", descripcion: "AAPL, MSFT, NVDA. Full replication tech.", pros: "Replica exacta NASDAQ tech", cons: "Top 3 >30% peso" },
  XLF: { nombre: "Financial Select Sector SPDR", subcategoria: "Sector - Financials", replication: "Full", trackingErrorBajo: "0.12%", expense: "0.10%", descripcion: "JPM, BRK.B, BAC. Bancos + seguros.", pros: "Hedge financiero", cons: "Sensibilidad tasas" },
  XLE: { nombre: "Energy Select Sector SPDR", subcategoria: "Sector - Energy", replication: "Full", trackingErrorBajo: "0.15%", expense: "0.10%", descripcion: "XOM, CVX. Energía.", pros: "Correlación petróleo", cons: "Volatilidad crudo" },
  XLV: { nombre: "Health Care Select Sector SPDR", subcategoria: "Sector - Health Care", replication: "Full", trackingErrorBajo: "0.11%", expense: "0.10%", descripcion: "JNJ, UNH, PFE", pros: "Defensivo", cons: "Regulatorio" },
  XLP: { nombre: "Consumer Staples Select Sector SPDR", subcategoria: "Sector - Consumer Staples", replication: "Full", trackingErrorBajo: "0.10%", expense: "0.10%", descripcion: "PG, COST, WMT", pros: "Bajo beta", cons: "Crecimiento limitado" },
  XLY: { nombre: "Consumer Discretionary Select Sector SPDR", subcategoria: "Sector - Consumer Discretionary", replication: "Full", trackingErrorBajo: "0.13%", expense: "0.10%", descripcion: "AMZN, TSLA", pros: "Cíclico", cons: "Alta beta" },
  XLB: { nombre: "Materials Select Sector SPDR", subcategoria: "Sector - Materials", replication: "Full", trackingErrorBajo: "0.14%", expense: "0.10%", descripcion: "LIN, APD", pros: "Cíclico", cons: "Commodity" },
  XLU: { nombre: "Utilities Select Sector SPDR", subcategoria: "Sector - Utilities", replication: "Full", trackingErrorBajo: "0.10%", expense: "0.10%", descripcion: "NEE, DUK", pros: "Defensivo yield", cons: "Sensibilidad tasas" },
  XLC: { nombre: "Communication Select Sector SPDR", subcategoria: "Sector - Communication", replication: "Full", trackingErrorBajo: "0.13%", expense: "0.10%", descripcion: "META, GOOGL", pros: "Growth", cons: "Concentrado" },
  XLRE: { nombre: "Real Estate Select Sector SPDR", subcategoria: "Sector - Real Estate", replication: "Full", trackingErrorBajo: "0.12%", expense: "0.10%", descripcion: "AMT, PLD", pros: "Yield", cons: "Cíclico" },
  XAR: { nombre: "SPDR S&P Aerospace & Defense", subcategoria: "Sector - Industrials / Defense", replication: "Optimised sampling", trackingErrorBajo: "0.40%", expense: "0.35%", descripcion: "LMT, RTX, BA. Defensa. Sampling optimizado.", pros: "Nicho defensa", cons: "Menor liquidez, tracking error mayor" },
  // Broad
  SPY: { nombre: "SPDR S&P 500", subcategoria: "Broad - US Large", replication: "Full", trackingErrorBajo: "0.03%", expense: "0.09%", descripcion: "500 large caps. Full replication. Menor tracking error mercado.", pros: "Benchmark universal", cons: "No sectorial" },
  DIA: { nombre: "SPDR Dow Jones Industrial Average", subcategoria: "Broad - Dow 30", replication: "Full", trackingErrorBajo: "0.05%", expense: "0.16%", descripcion: "30 blue chips price-weighted. Replica 1:1.", pros: "Precio ponderado", cons: "Solo 30 nombres" },
  QQQ: { nombre: "Invesco QQQ NASDAQ 100", subcategoria: "Broad - NASDAQ", replication: "Full", trackingErrorBajo: "0.10%", expense: "0.20%", descripcion: "100 NASDAQ. Full.", pros: "Tech tilt", cons: "Concentrado" },
  IWM: { nombre: "iShares Russell 2000", subcategoria: "Small Caps", replication: "Optimised sampling", trackingErrorBajo: "0.25%", expense: "0.19%", descripcion: "2000 small caps. Sampling (no todos líquidos).", pros: "Small cap", cons: "Tracking error mayor, spread amplio" },
  // Factors
  QUAL: { nombre: "iShares MSCI USA Quality Factor", subcategoria: "Factor - Quality", replication: "Optimised sampling", trackingErrorBajo: "0.30%", expense: "0.15%", descripcion: "Factor calidad", pros: "Smart beta", cons: "Backtest dependent" },
  MTUM: { nombre: "iShares MSCI USA Momentum", subcategoria: "Factor - Momentum", replication: "Optimised sampling", trackingErrorBajo: "0.35%", expense: "0.15%", descripcion: "Momentum", pros: "Trend", cons: "Rotación alta" },
  SIZE: { nombre: "iShares MSCI USA Size Factor", subcategoria: "Factor - Size", replication: "Optimised sampling", trackingErrorBajo: "0.30%", expense: "0.15%", descripcion: "Small size factor", pros: "Small tilt", cons: "Similar a IWM" },
  USMV: { nombre: "iShares MSCI USA Min Vol", subcategoria: "Factor - Min Vol", replication: "Optimised sampling", trackingErrorBajo: "0.28%", expense: "0.15%", descripcion: "Min volatilidad", pros: "Defensivo", cons: "Tracking error" },
  IVE: { nombre: "iShares S&P 500 Value", subcategoria: "Factor - Value", replication: "Full", trackingErrorBajo: "0.15%", expense: "0.18%", descripcion: "Value 500", pros: "Value", cons: "Growth tilt inverso" },
  IVW: { nombre: "iShares S&P 500 Growth", subcategoria: "Factor - Growth", replication: "Full", trackingErrorBajo: "0.15%", expense: "0.18%", descripcion: "Growth 500", pros: "Growth", cons: "Value tilt inverso" },
  // Bonds
  IEF: { nombre: "iShares 7-10 Year Treasury", subcategoria: "Bonds - 7-10Y", replication: "Optimised sampling", trackingErrorBajo: "0.15%", expense: "0.15%", descripcion: "Bonos Tesoro 7-10Y", pros: "Duration media", cons: "Tasa" },
  TLT: { nombre: "iShares 20+ Year Treasury", subcategoria: "Bonds - 20Y+", replication: "Optimised sampling", trackingErrorBajo: "0.18%", expense: "0.15%", descripcion: "Bonos largos", pros: "Hedge deflación", cons: "Volatilidad" },
  // Commodities
  GLD: { nombre: "SPDR Gold Shares", subcategoria: "Commodity - Oro", replication: "Synthetic", trackingErrorBajo: "0.05%", expense: "0.40%", descripcion: "Oro físico (custodia) / synthetic", pros: "Refugio", cons: "Sin yield, costo custodia" },
  SLV: { nombre: "iShares Silver Trust", subcategoria: "Commodity - Plata", replication: "Synthetic", trackingErrorBajo: "0.08%", expense: "0.50%", descripcion: "Plata", pros: "Industrial+monetario", cons: "Volatilidad" },
  USO: { nombre: "United States Oil Fund", subcategoria: "Commodity - Petróleo WTI", replication: "Synthetic", trackingErrorBajo: "0.80%", expense: "0.85%", descripcion: "Futuros WTI rolling. Synthetic.", pros: "Exposición crudo", cons: "Contango decay, tracking error alto" },
  UNG: { nombre: "United States Natural Gas Fund", subcategoria: "Commodity - Gas", replication: "Synthetic", trackingErrorBajo: "1.20%", expense: "1.06%", descripcion: "Futuros gas", pros: "Gas", cons: "Contango fuerte, no replica spot" },
  // Countries
  EEM: { nombre: "iShares MSCI Emerging Markets", subcategoria: "Countries - Emergentes", replication: "Optimised sampling", trackingErrorBajo: "0.45%", expense: "0.68%", descripcion: "Emergentes", pros: "Diversificación", cons: "China >30%" },
  EFA: { nombre: "iShares MSCI EAFE", subcategoria: "Countries - Desarrollados ex-US", replication: "Optimised sampling", trackingErrorBajo: "0.35%", expense: "0.32%", descripcion: "Desarrollados", pros: "Europe/Japan", cons: "No US" },
  EWW: { nombre: "iShares MSCI Mexico", subcategoria: "Countries - México", replication: "Optimised sampling", trackingErrorBajo: "0.40%", expense: "0.50%", descripcion: "México", pros: "Latam", cons: "Concentrado" },
  EWZ: { nombre: "iShares MSCI Brazil", subcategoria: "Countries - Brasil", replication: "Optimised sampling", trackingErrorBajo: "0.45%", expense: "0.58%", descripcion: "Brasil", pros: "Latam beta", cons: "Concentrado Vale/Petrobras" },
  FXI: { nombre: "iShares China Large-Cap", subcategoria: "Countries - China", replication: "Optimised sampling", trackingErrorBajo: "0.50%", expense: "0.74%", descripcion: "China 50", pros: "China", cons: "VIE risk" },
  INDA: { nombre: "iShares MSCI India", subcategoria: "Countries - India", replication: "Optimised sampling", trackingErrorBajo: "0.55%", expense: "0.65%", descripcion: "India", pros: "India", cons: "Liquidez" },
};

export function getEtfMeta(ticker: string): EtfMeta | null {
  const m = ETF_DESCRIPTIONS[ticker.toUpperCase()];
  if (!m) return null;
  return { ticker: ticker.toUpperCase(), ...m };
}

export function interpretarFitLabdie(r: { correlation: number; rSquared: number; beta: number }): { nivel: "excelente" | "moderado" | "debil" | "nulo"; trackingErrorProxy: string; basisRisk: string; texto: string; hedgeEjemplo: string } {
  const R2 = r.rSquared ?? 0;
  const corr = r.correlation ?? 0;
  const beta = r.beta ?? 1;
  const trackingError = ((1 - R2) * 100).toFixed(1); // proxy % varianza no explicada
  if (R2 >= 0.65 && corr >= 0.80 && Math.abs(beta - 1) < 0.20) {
    return {
      nivel: "excelente",
      trackingErrorProxy: `${trackingError}%`,
      basisRisk: "Bajo — basis risk <5% (Labadie Ex.1 market neutral: (40.18-38.03)/40.18=5.35%)",
      texto: `Replica excelente: R²=${R2.toFixed(3)} explica ${(R2*100).toFixed(1)}% de la varianza. Full replication, tracking error mínimo. Usable como hedge perfecto o substitution directa (basis risk bajo).`,
      hedgeEjemplo: `Hedge beta-neutral: beta ${beta.toFixed(2)} → nocional ETF = sector_exposure / ${beta.toFixed(2)} (Ex.4 Labadie)`,
    };
  }
  if (R2 >= 0.25) {
    return {
      nivel: "moderado",
      trackingErrorProxy: `${trackingError}%`,
      basisRisk: "Moderado — optimised sampling target 10% (paper p.13)",
      texto: `Replica moderada: R²=${R2.toFixed(3)} (${(R2*100).toFixed(1)}% varianza explicada). Optimised sampling, tracking error ~${trackingError}%. Basis risk moderado — usar con ajuste beta o como proxy con cautela (Ex.2 same notional / Ex.3 same vol).`,
      hedgeEjemplo: `Same volatility: sector_nocional * sector_vol% = ETF_nocional * ${((1/beta)*100).toFixed(0)}% → ajustar por vol`,
    };
  }
  if (R2 >= 0.08) {
    return {
      nivel: "debil",
      trackingErrorProxy: `${trackingError}%`,
      basisRisk: "Alto — >70% varianza no explicada, correlation risk",
      texto: `Replica débil: R²=${R2.toFixed(3)} solo ${(R2*100).toFixed(1)}% explicado, corr ${corr.toFixed(2)}. Basis risk alto, tracking error ${trackingError}%. No usar como substitution; solo como referencia beta o para análisis intermarket (Ex.4 beta neutral con cautela).`,
      hedgeEjemplo: `Beta ${beta.toFixed(2)} inestable — recalibrar frecuentemente (Labadie 5 Principios: patterns decaen)`,
    };
  }
  return {
    nivel: "nulo",
    trackingErrorProxy: `${trackingError}%`,
    basisRisk: "Muy alto — sin replica, ningún ETF explica el sector",
    texto: `Sin replica: R²=${R2.toFixed(3)} (<8% explicado), corr ${corr.toFixed(2)}. Ningún ETF del universo 47 replica este sector — basis risk >90%. No hedgeable con ETF existente. Requiere Markowitz completo (Ex.5) o basket propio. Ejemplo Acciones Industriales heterogéneo (muchos tickers chicos AR + cedears) explica R² 0.02-0.03.`,
    hedgeEjemplo: `Construir basket propio o usar sampling optimizado con target tracking error 10% (paper p.13)`,
  };
}
