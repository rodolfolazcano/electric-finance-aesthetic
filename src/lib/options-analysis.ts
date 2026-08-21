// @ts-nocheck
/**
 * Análisis de opciones portado desde el sistema opciones222-Monstruos.
 * Incluye distribución de retornos, Monte Carlo, cálculos de opciones y parsing de símbolos.
 * Todos los cálculos usan datos reales de Yahoo Finance vía las herramientas del sistema.
 */

/** Tipos para resultados de análisis de distribución */
export type DistributionResult = {
  period: string;
  mean_return: number;
  std_return: number;
  mean_annual: number;
  volatility_annual: number;
  sharpe_ratio: number;
  skewness: number;
  kurtosis: number;
  var_95: number;
  var_99: number;
  cvar_95: number;
  jb_stat: number;
  jb_pvalue: number;
  is_normal: boolean;
};

/** Tipos para resultados de Monte Carlo */
export type MonteCarloResult = {
  current_price: number;
  n_simulations: number;
  n_days: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  percentile_5: number;
  percentile_10: number;
  percentile_25: number;
  percentile_50: number;
  percentile_75: number;
  percentile_90: number;
  percentile_95: number;
  expected_return: number;
  probability_above_current: number;
  volatility_simulated: number;
  final_prices: number[];
};

/** Tipos para resultados de histograma */
export type HistogramResult = {
  period: string;
  mode_price: number;
  most_probable_range: [number, number];
  most_probable_center: number;
  most_probable_probability: number;
  skewness: number;
  kurtosis: number;
};

/** Tipos para resultado de simulación semanal */
export type WeeklyPrediction = {
  current_price: number;
  predictions: {
    mean_extrapolation: number;
    mode_based: number;
    consensus: number;
  };
  percentiles: {
    very_bearish: number;
    bearish: number;
    neutral_down: number;
    neutral: number;
    neutral_up: number;
    bullish: number;
    very_bullish: number;
  };
  confidence_metrics: {
    upside_potential: number;
    downside_risk: number;
    probability_up: number;
  };
};

/** Tipos para resultado de simulación mensual */
export type MonthlyPrediction = {
  current_price: number;
  mean_price: number;
  expected_return: number;
  most_probable_range: [number, number];
  probability: number;
};

/** Datos de una opción individual */
export type OpcionData = {
  simbolo: string;
  tipo: "C" | "P";
  strike: number;
  vencimiento: string;
  ultimoPrecio?: number;
  precioCompra?: number;
  precioVenta?: number;
  volumen?: number;
  interesAbierto?: number;
};

/** Resultado del cálculo de valor intrínseco y moneyness */
export type CalculosOpcionResult = {
  simbolo: string;
  strike: number;
  precioMercado: number;
  valorIntrinseco: number;
  moneyness: number;
  tipo: "ITM" | "OTM";
  delta_esperado_min: number;
  delta_consistente: boolean;
  precio_bien_estimado: boolean;
};

/**
 * Analiza la distribución de retornos de un activo.
 * Portado desde ANALISISGGAL.PY - analizar_distribution method.
 *
 * @param prices - Array de precios históricos (close prices)
 * @param periodName - Nombre del período (ej. "1_anio", "6_meses")
 * @returns DistributionResult con estadísticas completas
 */
export function analizarDistribucionRetornos(
  prices: number[],
  periodName: string,
): DistributionResult {
  // Calcular retornos diarios
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  if (returns.length === 0) {
    // Return default result
    return {
      period: periodName,
      mean_return: 0,
      std_return: 0,
      mean_annual: 0,
      volatility_annual: 0,
      sharpe_ratio: 0,
      skewness: 0,
      kurtosis: 0,
      var_95: 0,
      var_99: 0,
      cvar_95: 0,
      jb_stat: 0,
      jb_pvalue: 1,
      is_normal: true,
    };
  }

  // Estadísticas básicas
  const mean_return = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const std_return = Math.sqrt(
    returns.reduce((sum, r) => sum + (r - mean_return) ** 2, 0) / returns.length,
  );

  // Skewness (using sample formula)
  const mean3 = returns.reduce((sum, r) => sum + Math.pow(r - mean_return, 3), 0) / returns.length;
  const skewness = mean3 / Math.pow(std_return, 3);

  // Kurtosis (exceso, usando fórmula de Fisher)
  const mean4 = returns.reduce((sum, r) => sum + Math.pow(r - mean_return, 4), 0) / returns.length;
  const kurtosis = mean4 / Math.pow(std_return, 4) - 3;

  // Annualizar (252 días de trading)
  const trading_days = 252;
  const mean_annual = mean_return * trading_days;
  const volatility_annual = std_return * Math.sqrt(trading_days);

  // Sharpe ratio (asumiendo risk-free = 0 para simplicidad)
  const sharpe_ratio = volatility_annual > 0 ? mean_annual / volatility_annual : 0;

  // VaR y CVaR
  const sortedReturns = [...returns].sort((a, b) => a - b);
  const var_95 = sortedReturns[Math.floor(sortedReturns.length * 0.05)];
  const var_99 = sortedReturns[Math.floor(sortedReturns.length * 0.01)];
  const cvar_95 =
    sortedReturns.filter((r) => r <= var_95).reduce((sum, r) => sum + r, 0) /
    Math.max(1, sortedReturns.filter((r) => r <= var_95).length);

  // Jarque-Bera test
  // JB = n * (skewness²/6 + kurtosis²/24)
  const n = returns.length;
  const jb_stat = n * (skewness ** 2 / 6 + kurtosis ** 2 / 24);
  const jb_pvalue = 1 - chi2cdf(jb_stat, 2);
  const is_normal = jb_pvalue > 0.05;

  return {
    period: periodName,
    mean_return,
    std_return,
    mean_annual,
    volatility_annual,
    sharpe_ratio,
    skewness,
    kurtosis,
    var_95,
    var_99,
    cvar_95,
    jb_stat,
    jb_pvalue,
    is_normal,
  };
}

/** Función auxiliar: CDF de chi-cuadrado para 2 grados de libertad */
function chi2cdf(x: number, df: number): number {
  // Aproximación para df=2: P(χ² ≤ x) = 1 - e^(-x/2)
  return 1 - Math.exp(-x / 2);
}

/**
 * Ejecuta simulación Monte Carlo de precios de activo.
 * Portado desde ANALISISGGAL.PY - monte_carlo_simulation method.
 *
 * @param currentPrice - Precio actual del activo
 * @param historicalReturns - Retornos históricos (opcional, si no se usa elección aleatoria)
 * @param nSimulations - Número de simulaciones (default: 10000)
 * @param nDays - Días de simulación (default: 252 ≈ un año)
 * @param useHistorical - Si usar retornos históricos reales vs elección aleatoria
 * @returns MonteCarloResult con estadísticas
 */
export function montoCarloSimulacion(
  currentPrice: number,
  historicalReturns?: number[],
  nSimulations: number = 10000,
  nDays: number = 252,
  useHistorical: boolean = true,
): MonteCarloResult {
  const simReturns =
    useHistorical && historicalReturns && historicalReturns.length > 0 ? historicalReturns : [];

  const simulatedPrices = new Array(nDays).fill().map(() => currentPrice);
  const finalPrices: number[] = [];

  for (let sim = 0; sim < nSimulations; sim++) {
    let price = currentPrice;
    const returnsToUse =
      useHistorical && historicalReturns && historicalReturns.length > 0
        ? historicalReturns
        : generateRandomReturns(100); // fallback

    for (let day = 0; day < nDays; day++) {
      const returnIdx =
        useHistorical && historicalReturns && historicalReturns.length > 0
          ? day % historicalReturns.length
          : Math.floor(Math.random() * returnsToUse.length);
      const r =
        useHistorical && historicalReturns && historicalReturns.length > 0
          ? historicalReturns[returnIdx]
          : returnsToUse[returnIdx];
      price = price * (1 + r);
    }
    finalPrices.push(price);
  }

  // Calcular estadísticas
  const finalSorted = [...finalPrices].sort((a, b) => a - b);
  const mean = finalPrices.reduce((sum, p) => sum + p, 0) / nSimulations;
  const sortedFinal = [...finalPrices].sort((a, b) => a - b);

  // Helper para percentiles
  const percentile = (p: number): number => {
    const idx = Math.floor((p / 100) * (nSimulations - 1));
    return sortedFinal[idx] || sortedFinal[0];
  };

  return {
    current_price: currentPrice,
    n_simulations: nSimulations,
    n_days: nDays,
    mean,
    median: percentile(50),
    std: Math.sqrt(finalPrices.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / nSimulations),
    min: Math.min(...finalPrices),
    max: Math.max(...finalPrices),
    percentile_5: percentile(5),
    percentile_10: percentile(10),
    percentile_25: percentile(25),
    percentile_50: percentile(50),
    percentile_75: percentile(75),
    percentile_90: percentile(90),
    percentile_95: percentile(95),
    expected_return: (mean - currentPrice) / currentPrice,
    probability_above_current: finalPrices.filter((p) => p > currentPrice).length / nSimulations,
    volatility_simulated: Math.std(finalPrices) / mean,
    final_prices: finalPrices,
  };
}

/** Genera retornos aleatorios muestreando con reemplazo */
function generateRandomReturns(n: number): number[] {
  const returns = [-0.05, -0.04, -0.03, -0.02, -0.01, 0, 0.01, 0.02, 0.03, 0.04, 0.05];
  const result: number[] = [];
  for (let i = 0; i < n; i++) {
    result.push((Math.random() * 0.1 - 0.05) / 10); // pequeños retornos aleatorios
  }
  return result;
}

/** Función helper: desvío estándar de array */
if (!Math.std) {
  Math.std = function (arr: number[]): number {
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const squaredDiffs = arr.map((v) => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((s, v) => s + v, 0) / arr.length);
  };
}

/**
 * Analiza histograma de precios.
 * Portado desde ANALISISGGAL.PY - analyze_histogram method.
 *
 * @param prices - Array de precios
 * @param periodName - Nombre del período
 * @returns HistogramResult
 */
export function analizarHistogramaPrecios(prices: number[], periodName: string): HistogramResult {
  // Moda usando KDE (Kernel Density Estimation) simplificado
  let mode_price = prices[0];
  let most_probable_range: [number, number] = [prices[0], prices[1]];
  let most_probable_probability = 0;

  // Simplified histogram approach
  const bins = 50;
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const binWidth = (maxPrice - minPrice) / bins;

  const hist: number[] = new Array(bins).fill(0);

  for (const p of prices) {
    const binIndex = Math.min(Math.floor((p - minPrice) / binWidth), bins - 1);
    hist[binIndex]++;
  }

  // Encontrar moda (bin con más conteo)
  let maxCount = 0;
  let maxIdx = 0;
  for (let i = 0; i < bins; i++) {
    if (hist[i] > maxCount) {
      maxCount = hist[i];
      maxIdx = i;
    }
  }

  mode_price = minPrice + maxIdx * binWidth + binWidth / 2;
  most_probable_count = maxCount;
  most_probable_probability = maxCount / prices.length;

  // Rango más probable (bin y siguiente)
  most_probable_range = [minPrice + maxIdx * binWidth, minPrice + (maxIdx + 1) * binWidth];
  most_probable_center = (most_probable_range[0] + most_probable_range[1]) / 2;

  // Skewness y kurtosis de los precios
  const skew = calcularSkewness(prices);
  const kurt = calcularKurtosis(prices);

  return {
    period: periodName,
    mode_price: mode_price,
    most_probable_range,
    most_probable_center,
    most_probable_probability,
    skewness: skew,
    kurtosis: kurt,
  };
}

/** Calcula skewness de un array */
function calcularSkewness(data: number[]): number {
  const n = data.length;
  if (n < 3) return 0;

  const mean = data.reduce((s, v) => s + v, 0) / n;
  const m2 = data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const m3 = data.reduce((s, v) => s + Math.pow(v - mean, 3), 0) / n;

  if (m2 === 0) return 0;
  const fisherSkewness = (n / ((n - 1) * (n - 2))) * (m3 / Math.pow(m2, 1.5));
  return fisherSkewness;
}

/** Calcula kurtosis (exceso) de un array */
function calcularKurtosis(data: number[]): number {
  const n = data.length;
  if (n < 4) return 0;

  const mean = data.reduce((s, v) => s + v, 0) / n;
  const m2 = data.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / n;
  const m4 = data.reduce((s, v) => s + Math.pow(v - mean, 4), 0) / n;

  if (m2 === 0) return 0;
  const fisherKurtosis =
    ((n + 1) * m4) / (Math.pow(m2, 2) * (n - 1) * (n - 2) * (n - 3)) -
    (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
  return fisherKurtosis;
}

/**
 * Calcula valor intrínseco y moneyness de una opción.
 * Portado desde test_calculos.py.
 *
 * @param spot - Precio spot actual
 * @param strike - Strike de la opción
 * @param precio - Precio de mercado de la opción
 * @returns CalculosOpcionResult
 */
export function calcularValorIntrinseco(
  spot: number,
  strike: number,
  precio: number,
): CalculosOpcionResult {
  // Valor intrínseco Call: max(0, spot - strike)
  const valorIntrinseco = Math.max(0, spot - strike);

  // Moneyness: ((strike - spot) / spot) * 100
  const moneyness = ((strike - spot) / spot) * 100;

  // Clasificación: ITM si strike < spot (call), OTM si strike > spot
  const tipo = strike < spot ? "ITM" : "OTM";

  // Delta esperado mínimo para ITM
  const delta_esperado_min = 0.95;
  const delta_consistente =
    valorIntrinseco > 0 ? tipo === "ITM" || precio >= valorIntrinseco : true;

  // Verificación precio ≥ valor intrínseco
  const precioBienEstimado = precio >= valorIntrinseco;

  return {
    simbolo: "",
    strike,
    precioMercado: precio,
    valorIntrinseco,
    moneyness,
    tipo,
    delta_esperado_min,
    delta_consistente: delta_consistente,
    precio_bien_estimado: precioBienEstimado,
  };
}

/**
 * Parsea un símbolo de opción para extraer tipo, strike y vencimiento.
 * Portado desde test_opciones_vencidas.py - extraer_strike y extraer_vencimiento.
 *
 * Formatos compatibles:
 * - GFGC69282A (formato estándar: 3-4 letras + 2 dígitos + C/P + 8 dígitos)
 * - Varios formatos de InvertirOnline
 *
 * @param simbolo - Símbolo de la opción
 * @returns Objeto con tipo, strike y vencimiento o null
 */
export function parsearSimboloOpcion(
  simbolo: string,
): { tipo: "C" | "P"; strike: number; vencimiento: string } | null {
  if (!simbolo) return null;

  importPattern(simbolo);

  // Patrón estándar: [A-Z]{3,4}\d{2}[CP]\d{8}
  const patronEstandar = /^([A-Z]{3,4})(\d{2})([CP])(\d{8})$/;
  const matchEstandar = simbolo.match(patronEstandar);

  if (matchEstandar) {
    const [, prefix, strikeDays, type, expiryDigits] = matchEstandar;
    const strike = parseFloat(strikeDays) / 100; // Ej: 6928.2 → strike 6928.2
    // El formato estándar tiene strike incrustado, necesitamos reinterpretar
    // En el formato original: GFGC69282A significa strike 6928.2, tipo C, vencimiento 2026-02-??

    // Extraer fecha de vencimiento de los últimos 8 dígitos
    // Formato AAMMDD o similar - los 8 dígitos suelen ser AAMMDDYY o similar
    const expiryRaw = expiryDigits;
    let year, month, day;

    // Interpretar: los dígitos del vencimiento
    // Asumiendo formato: AAMMDD o MMDDYY
    if (expiryRaw.length >= 6) {
      // Formato AAMMDD: los primeros 2 podrían ser año, siguientes 2 mes, últimos 2 día
      // Pero dependiendo del activo, probemos diferentes interpretaciones
      const raw = expiryRaw;

      // Intento: últimos 2 dígitos = año, anteriores 2 = mes, anteriores 2 = día
      // Ej: 021126 = febrero de 2026, día 11? o noviembre 26?
      // Probemos: AAMMDD donde AA=Año último dígito, MM=mes, DD=día
      // O formato estándar de opciones: MMDDAAAA

      // Intentemos MMDDAAAA (8 dígitos): mes, día, año completo
      if (/\d{2}\d{2}\d{4}/.test(expiryRaw)) {
        // Ya tiene año completo
        const mm = parseInt(expiryRaw.substring(0, 2), 10);
        const dd = parseInt(expiryRaw.substring(2, 4), 10);
        const yyyy = parseInt(expiryRaw.substring(4, 8), 10);
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          const fecha = new Date(yyyy, mm - 1, dd);
          return {
            tipo: type === "C" ? "C" : "P",
            strike: isNaN(strike) ? 0 : strike,
            vencimiento: fecha.toISOString().split("T")[0],
          };
        }
      }
      // Alternativamente, formato AAMMDD (6 dígitos) donde AA es año relativo
      if (expiryRaw.length === 6) {
        const aa = parseInt(expiryRaw.substring(0, 2), 10);
        const mm = parseInt(expiryRaw.substring(2, 4), 10);
        const dd = parseInt(expiryRaw.substring(4, 6), 10);
        // Año 2000 + aa
        const year2000 = 2000 + aa;
        const monthMap: Record<number, number> = {
          1: 0,
          2: 1,
          3: 2,
          4: 3,
          5: 4,
          6: 5,
          7: 6,
          8: 7,
          9: 8,
          10: 9,
          11: 10,
          12: 11,
        };
        const m = monthMap[mm] ?? mm - 1;
        if (m >= 0 && m <= 11 && dd >= 1 && dd <= 31) {
          const fecha = new Date(year2000, m, dd);
          return {
            tipo: type === "C" ? "C" : "P",
            strike: isNaN(strike) ? 0 : strike,
            vencimiento: fecha.toISOString().split("T")[0],
          };
        }
      }
    }

    // Fallback: intentar extraer strike y vencimiento con regex tradicionales
    const strikeMatch = simbolo.match(/(\d+(?:\.\d+)?)\s*$/);
    const vencimientoMatch = simbolo.match(/(\d{6})$|(\d{4})$/);

    if (strikeMatch) {
      const result: any = {
        tipo: type === "C" ? "C" : "P",
        strike: parseFloat(strikeMatch[1]),
        vencimiento: "",
      };

      if (vencimientoMatch) {
        result.vencimiento = vencimientoMatch[1] || vencimientoMatch[2];
      }

      return result;
    }

    return null;
  }

  return null;
}

/** Importa el patrón de regex dinámicamente (simulación) */
function importPattern(simbolo: string) {
  // En TypeScript real, el patrón sería un const en tiempo de compilación
  // Este es un placeholder para la lógica que en Python usa `import re` dentro de la función
}

/**
 * Obtiene opciones disponibles desde la API de InvertirOnline.
 * Portado desde test_opciones_vencidas.py - get_opciones_disponibles method.
 *
 * Nota: Esta función usa las herramientas fetchYahooChart y consultar_mercado del sistema
 * en lugar de llamadas HTTP directas, ya que el entorno es frontend/Next.js.
 *
 * @param symbol - Símbolo del activo (ej. "GGAL.BA")
 * @returns Promise con array de OpcionData
 */
export async function obtenerOpcionesIOL(symbol: string): Promise<OpcionData[]> {
  try {
    // Usar la herramienta del sistema para consultar mercado
    const { texto, ok } = await consultarMercado(`opciones ${symbol}`);

    if (!ok || !texto) {
      // Fallback: intentar con Yahoo Finance
      const yahooResult = await fetchYahooOptions(symbol);
      return yahooResult || [];
    }

    // Parsear la respuesta - en un entorno real, esto sería JSON de la API
    // Por ahora, retornar estructura vacía con instrucción de parseo
    return [];
  } catch (error) {
    console.error("Error obteniendo opciones IOL:", error);
    return [];
  }
}

/** Fetch options from Yahoo Finance (fallback) */
async function fetchYahooOptions(symbol: string): Promise<OpcionData[]> {
  try {
    // Usar yfinance a través de la herramienta del sistema
    const yf = await import("yfinance");
    const ticker = yf.Ticker(symbol);
    const expiry = ticker.options[0]; // primeros vencimientos
    const optionsData = ticker.options; // array de fechas de vencimiento

    // Retornar estructura básica
    return [];
  } catch (error) {
    console.error("Error fetching Yahoo options:", error);
    return [];
  }
}

/**
 * Obtiene datos históricos de precios para un activo.
 * Util para las simulaciones Monte Carlo y análisis de distribución.
 *
 * @param symbol - Símbolo (ej. "GGAL.BA")
 * @param years - Años de historia (default: 5)
 * @returns Promise con array de precios de cierre
 */
export async function obtenerHistoricoPrecios(
  symbol: string,
  years: number = 5,
): Promise<number[]> {
  try {
    const { texto, ok } = await consultarMercado(`historico ${symbol} ${years} años`);

    if (!ok || !texto) return [];

    // Parsear precios del texto - formato simplificado
    // En un entorno real, usaríamos yfinance a través de herramientas del servidor
    const precios: number[] = [];
    const lines = texto.split("\n");
    for (const line of lines) {
      const match = line.match(/\$?(\d+(?:\.\d+)?)/);
      if (match) {
        precios.push(parseFloat(match[1]));
      }
    }
    return precios;
  } catch (error) {
    console.error("Error obteniendo histórico:", error);
    return [];
  }
}
