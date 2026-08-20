/** Motor de análisis técnico del semáforo: indicadores, puntajes y clasificación.
 *  Funciones puras sobre series de precios de cierre. Cada componente devuelve
 *  un puntaje en [-2, 2] y el score técnico combina pesos:
 *  tendencia 40% / momentum 30% / soporte-resistencia 20% / anomalía 10%. */

import { analizarSoportesResistencias, type SoportesResistencias } from "./soportes-resistencias";

export function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

export const PESOS_SCORE = {
  tendencia: 0.4,
  momentum: 0.3,
  soporteResistencia: 0.2,
  anomalia: 0.1,
} as const;

export interface ComponenteScore {
  tendencia: number | null;
  momentum: number | null;
  soporteResistencia: number | null;
  anomalia: number | null;
}

export type LuzSemaforo = "green" | "yellow" | "red" | "gray";

export interface ClasificacionScore {
  clasificacion: string;
  light: LuzSemaforo;
}

export function fmtNum(x: number | null | undefined, decimales = 2): string {
  if (x == null || !isFinite(x)) return "s/d";
  return x.toLocaleString("es-AR", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/** Media móvil simple de los últimos `period` cierres. */
export function sma(closes: number[], period: number): number | null {
  if (closes.length < period || period <= 0) return null;
  let s = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    s += closes[i] ?? 0;
  }
  return s / period;
}

/** RSI de Wilder (14). */
export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let ganancia = 0;
  let perdida = 0;
  for (let i = 1; i <= period; i++) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    if (diff >= 0) ganancia += diff;
    else perdida -= diff;
  }
  let avgG = ganancia / period;
  let avgP = perdida / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = (closes[i] ?? 0) - (closes[i - 1] ?? 0);
    avgG = (avgG * (period - 1) + Math.max(diff, 0)) / period;
    avgP = (avgP * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgP === 0) return 100;
  return 100 - 100 / (1 + avgG / avgP);
}

function ema(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const out: (number | null)[] = [];
  let prev: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    const c = closes[i];
    if (c == null) {
      out.push(null);
      continue;
    }
    prev = prev == null ? c : c * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export interface ResultadoMacd {
  macd: number | null;
  senal: number | null;
  hist: number | null;
}

/** MACD (12, 26, 9) en el último cierre. */
export function macd(closes: number[], fast = 12, slow = 26, senalPeriod = 9): ResultadoMacd {
  const eFast = ema(closes, fast);
  const eSlow = ema(closes, slow);
  const linea: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    const f = eFast[i];
    const s = eSlow[i];
    if (f != null && s != null) linea.push(f - s);
  }
  if (linea.length < senalPeriod + 1)
    return { macd: null, senal: null, hist: null };
  const eSenal = ema(linea, senalPeriod);
  const macdVal = linea[linea.length - 1] ?? null;
  const senalVal = eSenal[eSenal.length - 1] ?? null;
  return {
    macd: macdVal,
    senal: senalVal,
    hist: macdVal != null && senalVal != null ? macdVal - senalVal : null,
  };
}

/** Tendencia: precio vs SMA20/SMA50/SMA200 y cruce de medias. Puntaje en [-2, 2]. */
export function analizarTendencia(closes: number[]): { score: number; detalle: string } {
  const n = closes.length;
  if (n < 20)
    return { score: 0, detalle: "sin datos suficientes para calcular la tendencia" };
  const precio = closes[n - 1] ?? 0;
  const s20 = sma(closes, 20);
  const s50 = n >= 50 ? sma(closes, 50) : null;
  const s200 = n >= 200 ? sma(closes, 200) : null;

  const partes: { ok: boolean; peso: number; texto: string }[] = [];
  if (s20 != null) partes.push({ ok: precio > s20, peso: 0.25, texto: `precio ${precio > s20 ? ">" : "<"} SMA20 (${fmtNum(s20)})` });
  if (s50 != null) partes.push({ ok: precio > s50, peso: 0.25, texto: `precio ${precio > s50 ? ">" : "<"} SMA50 (${fmtNum(s50)})` });
  if (s200 != null) partes.push({ ok: precio > s200, peso: 0.25, texto: `precio ${precio > s200 ? ">" : "<"} SMA200 (${fmtNum(s200)})` });
  if (s50 != null && s200 != null) partes.push({ ok: s50 > s200, peso: 0.25, texto: `SMA50 ${s50 > s200 ? ">" : "<"} SMA200 (${s50 > s200 ? "cruza alcista" : "cruza bajista"})` });
  if (!partes.length) return { score: 0, detalle: "sin suficientes medias móviles" };

  const sumaPesos = partes.reduce((s, p) => s + p.peso, 0);
  const bruto = partes.reduce((s, p) => s + (p.ok ? 1 : -1) * p.peso, 0) / sumaPesos;
  const direccion = bruto >= 0 ? "alcista" : "bajista";
  const fuerza = Math.abs(bruto) >= 0.5 ? " fuerte" : Math.abs(bruto) >= 0.25 ? " moderada" : " leve";
  return {
    score: clamp(bruto * 2, -2, 2),
    detalle: `tendencia ${direccion}${fuerza}: ${partes.map((p) => p.texto).join(" · ")}`,
  };
}

/** Momentum: RSI14 + MACD. Puntaje en [-2, 2]. */
export function analizarMomentum(closes: number[]): { score: number; detalle: string } {
  const r = rsi(closes, 14);
  const m = macd(closes);
  const puntos: number[] = [];
  const texto: string[] = [];
  if (r != null) {
    let v = 0;
    let etiqueta = "neutral";
    if (r < 30) {
      v = 1;
      etiqueta = "sobreventa (probable rebote)";
    } else if (r < 40) {
      v = 0.5;
      etiqueta = "rebote potencial desde zona de sobreventa";
    } else if (r < 50) {
      v = 0;
      etiqueta = "neutral";
    } else if (r < 60) {
      v = 0.5;
      etiqueta = "positivo, con margen antes de la sobrecompra";
    } else if (r < 70) {
      v = 1;
      etiqueta = "fuerte, cercano a sobrecompra";
    } else {
      v = 0.5;
      etiqueta = "sobrecompra (momentum alto con riesgo de corrección)";
    }
    puntos.push(v);
    texto.push(`RSI14 ${fmtNum(r, 1)} (${etiqueta})`);
  }
  if (m.hist != null) {
    puntos.push(m.hist > 0 ? 0.5 : -0.5);
    texto.push(`histograma MACD ${m.hist > 0 ? "positivo" : "negativo"} (${fmtNum(m.hist, 3)})`);
  }
  if (m.macd != null && m.senal != null) {
    puntos.push(m.macd > m.senal ? 0.5 : -0.5);
    texto.push(m.macd > m.senal ? "MACD por encima de su señal" : "MACD por debajo de su señal");
  }
  if (!puntos.length) return { score: 0, detalle: "sin datos suficientes para el momentum" };
  const prom = puntos.reduce((s, x) => s + x, 0) / puntos.length;
  return { score: clamp(prom * 2, -2, 2), detalle: texto.join(" · ") };
}

/** Soporte/resistencia: espacio hasta niveles detectados + posición en rango 52 semanas. */
export function analizarSoporteResistencia(
  closes: number[],
  window = 5,
  high52: number | null = null,
  low52: number | null = null,
): { score: number; detalle: string; sr: SoportesResistencias } {
  const sr = analizarSoportesResistencias(closes, window, 0.02, high52, low52);
  const precio = sr.precioActual;
  if (precio == null || (!sr.soportes.length && !sr.resistencias.length)) {
    return { score: 0, detalle: "no se detectaron niveles de soporte/resistencia", sr };
  }
  let puntos = 0;
  const texto: string[] = [];
  const sop = sr.soportes.length ? (sr.soportes[0] ?? null) : null;
  const res = sr.resistencias.length ? (sr.resistencias[0] ?? null) : null;
  if (sop != null && res != null) {
    const distSop = (precio - sop) / precio;
    const distRes = (res - precio) / precio;
    // Espacio hacia la resistencia menos el colchón hacia el soporte.
    const espacio = distRes - distSop;
    puntos += clamp(espacio / 0.1, -1, 1);
    texto.push(`soporte a ${(distSop * 100).toFixed(1)}% / resistencia a ${(distRes * 100).toFixed(1)}%`);
  }
  if (low52 != null && high52 != null && high52 > low52 && precio > 0) {
    const pos = clamp((precio - low52) / (high52 - low52), 0, 1);
    if (pos >= 0.9) {
      puntos += 1;
      texto.push("precio cerca del máximo de 52 semanas");
    } else if (pos >= 0.5) {
      puntos += 0.5;
      texto.push("precio en la mitad superior del rango de 52 semanas");
    } else if (pos >= 0.25) {
      puntos -= 0.5;
      texto.push("precio en la mitad inferior del rango de 52 semanas");
    } else {
      puntos -= 1;
      texto.push("precio cerca del mínimo de 52 semanas");
    }
  }
  if (!texto.length) texto.push("niveles detectados");
  return { score: clamp(puntos, -2, 2), detalle: texto.join(" · "), sr };
}

/** Anomalía de precio: desvío del último cierre vs la media de 30 días (z-score). */
export function analizarAnomaliaPrecio(closes: number[]): { score: number; detalle: string } {
  const n = closes.length;
  if (n < 31) return { score: 0, detalle: "sin datos suficientes para detectar anomalías" };
  const precio = closes[n - 1] ?? 0;
  const ventana = closes.slice(-31, -1);
  const m = ventana.reduce((s, x) => s + x, 0) / ventana.length;
  const varianza = ventana.reduce((s, x) => s + (x - m) * (x - m), 0) / ventana.length;
  const desv = Math.sqrt(varianza);
  let score = 0;
  const texto: string[] = [];
  if (desv > 0) {
    const z = (precio - m) / desv;
    if (Math.abs(z) >= 3) {
      score -= 1.5;
      texto.push(`precio ${z >= 0 ? "anómalo al alza" : "anómalo a la baja"} (z=${z.toFixed(1)})`);
    } else if (Math.abs(z) >= 2) {
      score -= 1;
      texto.push(`precio desviado de su media (z=${z.toFixed(1)})`);
    } else if (Math.abs(z) >= 1.5) {
      score -= 0.5;
      texto.push(`precio algo desviado de su media (z=${z.toFixed(1)})`);
    } else {
      score += 0.5;
      texto.push("sin desviación significativa frente a la media de 30 días");
    }
  } else {
    score += 0.5;
    texto.push("volatilidad demasiado baja para evaluar anomalías");
  }
  return { score: clamp(score, -2, 2), detalle: texto.join(" · ") };
}

/** Score técnico ponderado en [-2, 2]: tendencia 40%, momentum 30%, S/R 20%, anomalía 10%. */
export function calcularScoreTecnico(c: ComponenteScore): number | null {
  const partes: { v: number; p: number }[] = [];
  if (c.tendencia != null) partes.push({ v: c.tendencia, p: PESOS_SCORE.tendencia });
  if (c.momentum != null) partes.push({ v: c.momentum, p: PESOS_SCORE.momentum });
  if (c.soporteResistencia != null)
    partes.push({ v: c.soporteResistencia, p: PESOS_SCORE.soporteResistencia });
  if (c.anomalia != null) partes.push({ v: c.anomalia, p: PESOS_SCORE.anomalia });
  if (!partes.length) return null;
  const sumaPesos = partes.reduce((s, x) => s + x.p, 0);
  return clamp(partes.reduce((s, x) => s + x.v * x.p, 0) / sumaPesos, -2, 2);
}

/** Umbrales: >1.5 COMPRA · >0.3 COMPRA CON CAUTELA · >-0.3 MANTENER · >-1.5 REDUCIR · VENTA. */
export function clasificarScore(score: number | null): ClasificacionScore {
  if (score == null || !isFinite(score)) return { clasificacion: "SIN DATOS", light: "gray" };
  if (score > 1.5) return { clasificacion: "COMPRA", light: "green" };
  if (score > 0.3) return { clasificacion: "COMPRA CON CAUTELA", light: "green" };
  if (score > -0.3) return { clasificacion: "MANTENER", light: "yellow" };
  if (score > -1.5) return { clasificacion: "REDUCIR", light: "red" };
  return { clasificacion: "VENTA", light: "red" };
}

/** Score fundamental en [-2, 2] a partir de métricas disponibles. */
export interface MetricasFundamentales {
  pe: number | null;
  revenueGrowth: number | null;
  profitMargin: number | null;
  roe: number | null;
  upside: number | null;
  deudaEquity: number | null;
}

/** Score individual de una métrica fundamental en [-2, 2] (null si no hay dato). */
export function scoreMetricaFundamental(
  key: keyof MetricasFundamentales,
  value: number | null,
): number | null {
  if (value == null) return null;
  switch (key) {
    case "pe":
      if (value <= 0) return -1;
      if (value < 10) return 2;
      if (value < 18) return 1;
      if (value < 30) return 0.5;
      return -0.5;
    case "revenueGrowth":
      return value >= 0.3 ? 2 : value >= 0.15 ? 1 : value >= 0 ? 0.5 : value >= -0.1 ? -0.5 : -1;
    case "profitMargin":
      return value >= 0.3 ? 2 : value >= 0.15 ? 1 : value >= 0 ? 0.5 : -1;
    case "roe":
      return value >= 0.25 ? 2 : value >= 0.15 ? 1 : value >= 0.05 ? 0.5 : value >= 0 ? 0 : -1;
    case "upside":
      return value >= 0.3 ? 2 : value >= 0.15 ? 1 : value >= 0.05 ? 0.5 : value >= 0 ? 0 : -1;
    case "deudaEquity":
      return value <= 0.5 ? 1 : value <= 1 ? 0.5 : value <= 2 ? 0 : -1;
    default:
      return null;
  }
}

export function calcularScoreFundamental(m: MetricasFundamentales): {
  score: number | null;
  detalle: string;
} {
  const tramos: { v: number; texto: string }[] = [];

  if (m.pe != null) {
    tramos.push({ v: scoreMetricaFundamental("pe", m.pe) ?? 0, texto: `P/E ${fmtNum(m.pe, 1)}` });
  }
  if (m.revenueGrowth != null) {
    tramos.push({
      v: scoreMetricaFundamental("revenueGrowth", m.revenueGrowth) ?? 0,
      texto: `crecimiento de ingresos ${(m.revenueGrowth * 100).toFixed(1)}%`,
    });
  }
  if (m.profitMargin != null) {
    tramos.push({
      v: scoreMetricaFundamental("profitMargin", m.profitMargin) ?? 0,
      texto: `margen ${(m.profitMargin * 100).toFixed(1)}%`,
    });
  }
  if (m.roe != null) {
    tramos.push({
      v: scoreMetricaFundamental("roe", m.roe) ?? 0,
      texto: `ROE ${(m.roe * 100).toFixed(1)}%`,
    });
  }
  if (m.upside != null) {
    tramos.push({
      v: scoreMetricaFundamental("upside", m.upside) ?? 0,
      texto: `upside vs consenso ${(m.upside * 100).toFixed(1)}%`,
    });
  }
  if (m.deudaEquity != null) {
    tramos.push({
      v: scoreMetricaFundamental("deudaEquity", m.deudaEquity) ?? 0,
      texto: `deuda/patrimonio ${fmtNum(m.deudaEquity, 2)}`,
    });
  }

  if (!tramos.length)
    return { score: null, detalle: "sin métricas fundamentales disponibles" };
  const score = clamp(tramos.reduce((s, t) => s + t.v, 0) / tramos.length, -2, 2);
  return { score, detalle: tramos.map((t) => t.texto).join(" · ") };
}
