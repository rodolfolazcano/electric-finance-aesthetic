// @ts-nocheck
/**
 * Módulo de análisis cuantitativo de distribuciones financieras
 * Basado en MARKET_DATA.txt - Cálculos y análisis de distribuciones
 * Traduce la lógica de Python (scipy.stats) a TypeScript
 */

import pkg from "jstat";
const { jStat } = pkg;

/**
 * Estadísticas de distribución para un activo
 */
export interface DistributionStats {
  ticker: string;
  currentPrice: number;
  meanAnnual: number; // Media anualizada de retornos
  volatilityAnnual: number; // Volatilidad anualizada
  sharpeRatio: number; // Ratio de Sharpe
  var95: number; // Value at Risk al 95% (percentil 5)
  skewness: number; // Asimetría de la distribución
  kurtosis: number; // Curtosis (cola gruesa)
  jbStat: number; // Estadístico de Jarque-Bera
  pValue: number; // p-value del test Jarque-Bera
  isNormal: boolean; // ¿Sigue distribución normal?
  maxLoss: number; // Pérdida máxima esperada
  expectedLoss: number; // Pérdida esperada (media de retornos negativos)
  expectedGain: number; // Ganancia esperada (media de retornos positivos)
  maxGain: number; // Ganancia máxima
  mostProbable: number; // Retorno más probable (mediana)
  dataPoints: number; // Cantidad de datos analizados
}

/**
 * Información de series temporales sincronizadas
 */
export interface SyncedTimeseries {
  date: Date[];
  closeX: number[]; // Precios del benchmark
  closeY: number[]; // Precios del activo
  returnX: number[]; // Retornos del benchmark
  returnY: number[]; // Retornos del activo
}

/**
 * Calcula el skewness (asimetría) de un array
 */
function calculateSkewness(data: number[]): number {
  if (data.length < 3) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  const m3 = data.reduce((a, b) => a + ((b - mean) / stdDev) ** 3, 0) / data.length;
  return m3;
}

/**
 * Calcula el kurtosis (curtosis) de un array
 */
function calculateKurtosis(data: number[]): number {
  if (data.length < 4) return 0;
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / data.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev === 0) return 0;
  const m4 = data.reduce((a, b) => a + ((b - mean) / stdDev) ** 4, 0) / data.length;
  return m4 - 3; // Exceso de curtosis (normal = 0)
}

/**
 * Calcula percentil de un array
 */
function calculatePercentile(data: number[], p: number): number {
  if (data.length === 0) return 0;
  const sorted = [...data].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Test de Jarque-Bera para normalidad
 * Retorna { jbStat, pValue }
 */
function jarqueBeraTest(data: number[]): {
  jbStat: number;
  pValue: number;
} {
  const n = data.length;
  if (n < 3) return { jbStat: 0, pValue: 1 };

  const skew = calculateSkewness(data);
  const kurt = calculateKurtosis(data);

  const jbStat = (n / 6) * (skew ** 2 + kurt ** 2 / 4);

  // Aproximación: chi-square con 2 grados de libertad
  // p-value = 1 - CDF(jbStat)
  const pValue = 1 - jStat.chisquare.cdf(jbStat, 2);

  return { jbStat, pValue };
}

/**
 * Clase principal para análisis de distribuciones
 */
export class Distribution {
  ticker: string;
  returns: number[];
  currentPrice: number;
  factor: number; // Factor de anualización (default 252 días)

  constructor(ticker: string, returns: number[], currentPrice: number, factor = 252) {
    this.ticker = ticker;
    this.returns = returns.filter((r) => !isNaN(r) && isFinite(r));
    this.currentPrice = currentPrice;
    this.factor = factor;
  }

  /**
   * Calcula todas las estadísticas
   */
  computeStats(): DistributionStats {
    const data = this.returns;
    if (data.length < 2) {
      return this.getEmptyStats();
    }

    // Media y volatilidad
    const mean = data.reduce((a, b) => a + b, 0) / data.length;
    const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / (data.length - 1);
    const stdDev = Math.sqrt(Math.max(0, variance));

    const meanAnnual = mean * this.factor;
    const volatilityAnnual = stdDev * Math.sqrt(this.factor);
    const sharpeRatio = volatilityAnnual > 0 ? meanAnnual / volatilityAnnual : 0;

    // Percentiles y valores extremos
    const var95 = calculatePercentile(data, 5);
    const skewness = calculateSkewness(data);
    const kurtosis = calculateKurtosis(data);
    const { jbStat, pValue } = jarqueBeraTest(data);
    const isNormal = pValue > 0.05;

    // Escenarios de inversión
    const negativeReturns = data.filter((r) => r < 0);
    const positiveReturns = data.filter((r) => r > 0);

    const maxLoss = this.currentPrice * var95;
    const expectedLoss =
      negativeReturns.length > 0
        ? this.currentPrice * (negativeReturns.reduce((a, b) => a + b, 0) / negativeReturns.length)
        : 0;
    const expectedGain =
      positiveReturns.length > 0
        ? this.currentPrice * (positiveReturns.reduce((a, b) => a + b, 0) / positiveReturns.length)
        : 0;
    const maxGain = this.currentPrice * Math.max(...data);
    const mostProbable = this.currentPrice * calculatePercentile(data, 50); // Mediana

    return {
      ticker: this.ticker,
      currentPrice: this.currentPrice,
      meanAnnual,
      volatilityAnnual,
      sharpeRatio,
      var95,
      skewness,
      kurtosis,
      jbStat,
      pValue,
      isNormal,
      maxLoss,
      expectedLoss,
      expectedGain,
      maxGain,
      mostProbable,
      dataPoints: data.length,
    };
  }

  /**
   * Diagnostica si es favorable invertir
   */
  diagnoseInvestment(stats: DistributionStats): string {
    if (
      stats.meanAnnual > 0 &&
      stats.sharpeRatio > 1 &&
      stats.volatilityAnnual < 0.2 &&
      stats.var95 > -0.2
    ) {
      return "Favorable: Media positiva, Sharpe > 1, volatilidad baja, riesgo controlado.";
    } else if (stats.meanAnnual > 0 && stats.sharpeRatio > 0) {
      return "Moderado: Media positiva pero Sharpe bajo o volatilidad alta.";
    } else if (stats.meanAnnual < 0) {
      return "Desfavorable: Media de retornos negativa en el período analizado.";
    } else {
      return "Análisis inconcluso: Revisar datos y horizonte de inversión.";
    }
  }

  private getEmptyStats(): DistributionStats {
    return {
      ticker: this.ticker,
      currentPrice: this.currentPrice,
      meanAnnual: 0,
      volatilityAnnual: 0,
      sharpeRatio: 0,
      var95: 0,
      skewness: 0,
      kurtosis: 0,
      jbStat: 0,
      pValue: 0,
      isNormal: false,
      maxLoss: 0,
      expectedLoss: 0,
      expectedGain: 0,
      maxGain: 0,
      mostProbable: 0,
      dataPoints: 0,
    };
  }
}

/**
 * Utilidad para sincronizar series temporales de múltiples activos
 */
export class TimeseriesSynchronizer {
  /**
   * Sincroniza retornos de múltiples RICs por fechas comunes
   */
  static synchronizeReturns(data: Record<string, { date: Date[]; returns: number[] }>): {
    dates: Date[];
    returns: Record<string, number[]>;
  } {
    if (Object.keys(data).length === 0) {
      return { dates: [], returns: {} };
    }

    const tickers = Object.keys(data);
    const dateArrays = tickers.map((t) => new Set(data[t].date.map((d) => d.getTime())));

    // Encontrar fechas comunes
    let commonDates = dateArrays[0];
    for (let i = 1; i < dateArrays.length; i++) {
      commonDates = new Set([...commonDates].filter((d) => dateArrays[i].has(d)));
    }

    const sortedDates = Array.from(commonDates)
      .sort((a, b) => a - b)
      .map((t) => new Date(t));

    const result: Record<string, number[]> = {};
    for (const ticker of tickers) {
      const tickerData = data[ticker];
      const syncedReturns: number[] = [];

      for (const targetDate of sortedDates) {
        const idx = tickerData.date.findIndex((d) => d.getTime() === targetDate.getTime());
        if (idx >= 0) {
          syncedReturns.push(tickerData.returns[idx]);
        }
      }

      result[ticker] = syncedReturns;
    }

    return { dates: sortedDates, returns: result };
  }
}
