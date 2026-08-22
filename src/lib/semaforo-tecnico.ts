// FASE 6 — Motor técnico legacy conservado.
// # REVISAR (bloqueo estructural): calcularScoreTecnico NO puede delegar en
// motor-unificado.ts: (1) recibe datos puros sin ticker/tipoActivo; (2) es
// llamado dentro de getSemaforo (finance.functions:401) y motor-unificado
// llama a getSemaforo -> recursión infinita. El equivalente unificado de este
// sub-score es src/lib/scoring/tecnico.ts (Fase 2, fórmulas idénticas, usado
// por motor-unificado como subScores.tecnico). Se conserva el cálculo porque
// el shape de retorno (tendencia/momentum/sr/anomalia con labels) no es
// reconstruible desde SubScore.detalle.
import type { AnalisisSR } from "./soportes-resistencias";

export interface TendenciaInfo {
  direccion: "alcista" | "bajista" | "lateral";
  score: number;
  label: string;
}

export interface MomentumInfo {
  score: number;
  label: string;
}

export interface AnomaliaPrecioInfo {
  score: number;
  label: string;
}

export interface ScoreTecnicoResult {
  tendencia: TendenciaInfo;
  momentum: MomentumInfo;
  soporteResistencia: { score: number; label: string };
  anomaliaPrecio: AnomaliaPrecioInfo;
  scoreBruto: number;
  scoreVol: number;
  scoreFinal: number;
  clasificacion: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA";
}

export function analizarTendencia(
  current: number | number[],
  sma50?: number,
  sma200?: number | null,
  closes?: number[],
): any {
  // Compat shim: semaforo.server.ts llama con (closes: number[])
  if (Array.isArray(current) && sma50 === undefined) {
    const arr = current as number[];
    if (arr.length < 2) return { direccion: "lateral" as const, score: 0, label: "Sin datos", detalle: "Sin datos" };
    const last = arr[arr.length - 1];
    const s50 = arr.length >= 50 ? arr.slice(-50).reduce((a, b) => a + b, 0) / 50 : last;
    const s200 = arr.length >= 200 ? arr.slice(-200).reduce((a, b) => a + b, 0) / 200 : null;
    // delega a la lógica original con valores derivados
    return analizarTendenciaInternal(last, s50, s200, arr);
  }
  return analizarTendenciaInternal(current as number, sma50 as number, sma200 as number | null, closes as number[]);
}

function analizarTendenciaInternal(
  current: number,
  sma50: number,
  sma200: number | null,
  closes: number[],
): TendenciaInfo {
  const goldenCrossThreshold = 10;
  const deathCrossThreshold = 10;

  if (sma200 != null && current > sma50 && sma50 > sma200) {
    return { direccion: "alcista", score: 2, label: "Tendencia alcista confirmada" };
  }
  if (sma200 != null && current < sma50 && sma50 < sma200) {
    return { direccion: "bajista", score: -2, label: "Tendencia bajista confirmada" };
  }

  const sma50Arr = (() => {
    const out: number[] = [];
    for (let i = Math.max(0, closes.length - 20); i < closes.length; i++) {
      const slice = closes.slice(i, i + 50);
      if (slice.length >= 50) out.push(slice.reduce((a, b) => a + b, 0) / 50);
    }
    return out;
  })();
  const sma200Arr = (() => {
    const out: number[] = [];
    for (let i = Math.max(0, closes.length - 20); i < closes.length; i++) {
      const slice = closes.slice(i, Math.min(i + 200, closes.length));
      if (slice.length >= 200) out.push(slice.reduce((a, b) => a + b, 0) / 200);
    }
    return out;
  })();

  const recentCross = closes.length >= 220 && sma50Arr.length > 0 && sma200Arr.length > 0;
  if (recentCross) {
    const last = sma50Arr.length - 1;
    const sma50Prev = sma50Arr[last];
    const sma200Prev = sma200Arr[last];
    if (sma50Prev > sma200Prev && current > sma50) {
      return { direccion: "alcista", score: 1.5, label: "Cruce dorado — tendencia alcista incipiente" };
    }
    if (sma50Prev < sma200Prev && current < sma50) {
      return { direccion: "bajista", score: -1.5, label: "Cruce de la muerte — tendencia bajista incipiente" };
    }
  }

  if (sma200 != null && sma50 > sma200) {
    return { direccion: "alcista", score: 0.5, label: "Levemente alcista (SMA50 > SMA200)" };
  }
  if (sma200 != null && sma50 < sma200) {
    return { direccion: "bajista", score: -0.5, label: "Levemente bajista (SMA50 < SMA200)" };
  }

  return { direccion: "lateral", score: 0, label: "Sin tendencia definida — mercado lateral" };
}

export function analizarMomentum(
  rsi: number | number[],
  macd?: number,
  macdSignal?: number,
  tendencia?: TendenciaInfo,
): any {
  // Shim: semaforo.server llama con (closes: number[])
  if (Array.isArray(rsi)) {
    const closes = rsi as number[];
    if (closes.length < 15) return { score: 0, label: "Sin datos de momentum", detalle: "Sin datos de momentum" };
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const diff = prev ? (last - prev) / prev : 0;
    return { score: diff > 0 ? 0.5 : diff < 0 ? -0.5 : 0, label: "Momentum (shim)", detalle: "Momentum estimado desde closes", scoreAdj: diff > 0 ? 0.5 : -0.5 };
  }
  return analizarMomentumInternal(rsi as number, macd as number, macdSignal as number, tendencia as TendenciaInfo);
}

function analizarMomentumInternal(
  rsi: number,
  macd: number,
  macdSignal: number,
  tendencia: TendenciaInfo,
): MomentumInfo {
  let score = 0;
  const partes: string[] = [];

  // RSI con contexto de tendencia
  if (rsi > 70) {
    if (tendencia.direccion === "alcista") {
      score -= 0.3;
      partes.push("RSI sobrecompra en tendencia alcista — no necesariamente señal de venta");
    } else {
      score -= 1.5;
      partes.push("RSI sobrecompra sin soporte de tendencia — alerta");
    }
  } else if (rsi < 30) {
    if (tendencia.direccion === "alcista") {
      score += 0.5;
      partes.push("RSI sobreventa en tendencia alcista — posible pullback u oportunidad");
    } else {
      score -= 1;
      partes.push("RSI sobreventa sin tendencia — cuidado con cuchillo cayendo");
    }
  } else if (rsi >= 45 && rsi <= 55) {
    partes.push("RSI neutral — sin sesgo direccional");
  } else if (rsi < 45) {
    if (tendencia.direccion === "alcista") {
      score += 0.2;
      partes.push("RSI ligeramente bajista en tendencia alcista — posible corrección temporal");
    } else {
      score -= 0.3;
      partes.push("RSI bajista consistente con la tendencia");
    }
  } else {
    if (tendencia.direccion === "bajista") {
      score -= 0.2;
      partes.push("RSI ligeramente alcista en tendencia bajista — posible rebote temporal");
    } else {
      score += 0.3;
      partes.push("RSI alcista consistente con la tendencia");
    }
  }

  // MACD
  if (macd > macdSignal && macd > 0) {
    score += 1;
    partes.push("MACD alcista confirmado (sobre señal y sobre cero)");
  } else if (macd > macdSignal && macd <= 0) {
    score += 0.5;
    partes.push("MACD cruzando al alza desde zona negativa — posible reversión temprana");
  } else if (macd <= macdSignal && macd > 0) {
    score -= 0.5;
    partes.push("MACD debilitándose — posible agotamiento de tendencia alcista");
  } else {
    score -= 1;
    partes.push("MACD bajista confirmado (bajo señal y bajo cero)");
  }

  const label = partes.join(". ");
  return { score, label };
}

export function analizarSoporteResistencia(sr: any, a?: any, b?: any, c?: any): any {
  // Shim para semaforo.server que llama con (closes, 5, high52, low52)
  if (Array.isArray(sr)) {
    const closes = sr as number[];
    const high52 = typeof c === "number" ? c : Math.max(...closes.slice(-252));
    const low52 = typeof b === "number" ? b : Math.min(...closes.slice(-252));
    const last = closes[closes.length - 1] ?? 0;
    const distHigh = high52 ? ((last - high52) / high52) * 100 : 0;
    const distLow = low52 ? ((last - low52) / low52) * 100 : 0;
    const srMock: any = { soportes: [low52], resistencias: [high52], resistenciaMasCercana: high52, soporteMasCercano: low52, distanciaResistenciaPct: distHigh, distanciaSoportePct: distLow };
    return analizarSoporteResistenciaInternal(srMock);
  }
  return analizarSoporteResistenciaInternal(sr as AnalisisSR);
}

function analizarSoporteResistenciaInternal(sr: AnalisisSR): { score: number; label: string } {
  let score = 0;
  const partes: string[] = [];

  const cercaUmbral = 0.02;
  if (sr.resistenciaMasCercana && Math.abs(sr.distanciaResistenciaPct) < cercaUmbral * 100) {
    score -= 0.5;
    partes.push("Precio cerca de resistencia — posible rechazo");
  }
  if (sr.soporteMasCercano && Math.abs(sr.distanciaSoportePct) < cercaUmbral * 100) {
    partes.push("Precio cerca de soporte — zona de decisión");
  }
  if (sr.resistencias.length > 0) {
    partes.push(`${sr.resistencias.length} nivel(es) de resistencia identificados`);
  }
  if (sr.soportes.length > 0) {
    partes.push(`${sr.soportes.length} nivel(es) de soporte identificados`);
  }

  return { score, label: partes.join(". ") };
}

// PLACEHOLDER (Hallazgo #3): este análisis NO usa volumen real, solo detecta anomalía de
// cambio de precio (>2%). Será reemplazado por RVOL real (volumen actual / promedio 20 sesiones)
// en Fase 4. Renombrado para no inducir a error en el nombre.
export function analizarAnomaliaPrecio(
  precios: any,
  history?: any,
): any {
  // Shim para semaforo.server que llama con (closes: number[])
  if (Array.isArray(precios) && typeof precios[0] === "number") {
    const closes = precios as number[];
    const arr = closes.map((c) => ({ close: c }));
    return analizarAnomaliaPrecioInternal(arr, arr);
  }
  return analizarAnomaliaPrecioInternal(precios as { close: number }[], (history ?? precios) as { close: number }[]);
}

function analizarAnomaliaPrecioInternal(
  precios: { close: number }[],
  history: { close: number }[],
): AnomaliaPrecioInfo {
  if (precios.length < 2 || history.length < 21) {
    return { score: 0, label: "Volumen insuficiente para análisis" };
  }

  const cambioActual = Math.abs(
    (precios[precios.length - 1].close - precios[precios.length - 2].close) /
      precios[precios.length - 2].close,
  );

  if (cambioActual > 0.02) {
    return {
      score: -0.5,
      label: "Movimiento de precio significativo — requiere confirmación de volumen",
    };
  }

  return { score: 0, label: "Volumen sin anomalías" };
}

// LEGACY: cálculo propio conservado — ver # REVISAR en cabecera de archivo.
export function calcularScoreTecnico(params: any): any {
  // Shim: semaforo.server llama con { tendencia, momentum, soporteResistencia, anomalia }
  if (params && typeof params.tendencia === "number") {
    const s = (params.tendencia ?? 0) * 0.4 + (params.momentum ?? 0) * 0.3 + (params.soporteResistencia ?? 0) * 0.2 + (params.anomalia ?? 0) * 0.1;
    return s;
  }
  return calcularScoreTecnicoInternal(params as {
    current: number;
    sma50: number;
    sma200: number | null;
    rsi: number;
    macd: number;
    macdSignal: number;
    closes: number[];
    sr: AnalisisSR;
  });
}

function calcularScoreTecnicoInternal(params: {
  current: number;
  sma50: number;
  sma200: number | null;
  rsi: number;
  macd: number;
  macdSignal: number;
  closes: number[];
  sr: AnalisisSR;
}): ScoreTecnicoResult {
  const tendencia = analizarTendencia(params.current, params.sma50, params.sma200, params.closes);
  const momentum = analizarMomentum(params.rsi, params.macd, params.macdSignal, tendencia);
  const srResult = analizarSoporteResistencia(params.sr);
  const anomaliaPrecio = analizarAnomaliaPrecio(
    params.closes.map((c) => ({ close: c })),
    params.closes.map((c) => ({ close: c })),
  );

  // Pesos normalizados que suman 1.0: tendencia 0.4, momentum 0.3, sr 0.2, anomaliaPrecio 0.1
  // scoreBruto = tendencia + momentum + sr (NO incluye anomaliaPrecio).
  // scoreVol = anomaliaPrecio * 0.1 se suma APARTE a scoreBruto para evitar doble conteo.
  const scoreBruto = tendencia.score * 0.4 + momentum.score * 0.3 + srResult.score * 0.2;
  const scoreVol = anomaliaPrecio.score * 0.1;
  const scoreFinal = scoreBruto + scoreVol;

  let clasificacion: ScoreTecnicoResult["clasificacion"];
  if (scoreFinal > 1.5) clasificacion = "COMPRA";
  else if (scoreFinal > 0.3) clasificacion = "COMPRA CON CAUTELA";
  else if (scoreFinal > -0.3) clasificacion = "MANTENER";
  else if (scoreFinal > -1.5) clasificacion = "REDUCIR";
  else clasificacion = "VENTA";

  return {
    tendencia,
    momentum,
    soporteResistencia: srResult,
    anomaliaPrecio,
    scoreBruto: +scoreBruto.toFixed(3),
    scoreVol: +scoreVol.toFixed(3),
    scoreFinal: +scoreFinal.toFixed(3),
    clasificacion,
  };
}

// ─── Shims para compatibilidad con semaforo.server.ts ───

export function clasificarScore(score: number | null): { clasificacion: string } {
  if (score == null || !isFinite(score)) return { clasificacion: "SIN DATOS" };
  if (score > 1.5) return { clasificacion: "COMPRA" };
  if (score > 0.3) return { clasificacion: "COMPRA CON CAUTELA" };
  if (score > -0.3) return { clasificacion: "MANTENER" };
  if (score > -1.5) return { clasificacion: "REDUCIR" };
  return { clasificacion: "VENTA" };
}

export function calcularScoreFundamental(metricas: any): { score: number | null; detalle: string } {
  // scoring simplificado: pe bajo, growth alto, margen/roe alto, upside positivo
  let s = 0;
  let count = 0;
  const partes: string[] = [];
  if (metricas.pe != null) {
    const v = metricas.pe;
    const sc = v < 12 ? 1 : v < 20 ? 0.3 : v < 30 ? -0.3 : -1;
    s += sc; count++; partes.push(`P/E ${v.toFixed(1)}`);
  }
  if (metricas.revenueGrowth != null) {
    const v = metricas.revenueGrowth * 100;
    const sc = v > 15 ? 1 : v > 5 ? 0.4 : v > 0 ? 0 : -0.8;
    s += sc; count++; partes.push(`Cre. ${v.toFixed(1)}%`);
  }
  if (metricas.profitMargin != null) {
    const v = metricas.profitMargin * 100;
    const sc = v > 15 ? 0.8 : v > 5 ? 0.2 : -0.4;
    s += sc; count++; partes.push(`Margen ${v.toFixed(1)}%`);
  }
  if (metricas.roe != null) {
    const v = metricas.roe * 100;
    const sc = v > 15 ? 0.8 : v > 8 ? 0.3 : -0.2;
    s += sc; count++; partes.push(`ROE ${v.toFixed(1)}%`);
  }
  if (metricas.upside != null) {
    const v = metricas.upside * 100;
    const sc = v > 20 ? 1 : v > 10 ? 0.5 : v > 0 ? 0.1 : -0.6;
    s += sc; count++; partes.push(`Upside ${v.toFixed(1)}%`);
  }
  if (count === 0) return { score: null, detalle: "Sin métricas fundamentales" };
  const avg = s / count;
  // clamp a [-2,2]
  const clamped = Math.max(-2, Math.min(2, avg));
  return { score: clamped, detalle: partes.join(" · ") };
}

export function scoreMetricaFundamental(key: string, value: number | null): number | null {
  if (value == null) return null;
  const m: any = {};
  m[key] = value;
  const res = calcularScoreFundamental(m);
  return res.score;
}

export function sma(prices: number[], period: number): number | null {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function rsi(prices: number[], period = 14): number | null {
  if (prices.length <= period) return null;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff; else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function macd(prices: number[]): { macd: number | null; senal: number | null; hist: number | null } {
  if (prices.length < 26) return { macd: null, senal: null, hist: null };
  const ema = (arr: number[], p: number): number => {
    const k = 2 / (p + 1);
    let e = arr[0];
    for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k);
    return e;
  };
  const m = ema(prices, 12) - ema(prices, 26);
  const signal = ema([...Array(9).fill(m)], 9);
  return { macd: m, senal: signal, hist: m - signal };
}

export function fmtNum(n: number | null | undefined, dec = 2): string {
  if (n == null || !isFinite(n)) return "—";
  return Number(n).toFixed(dec);
}
