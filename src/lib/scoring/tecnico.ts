// @ts-nocheck
// Motor técnico puro migrado de src/lib/semaforo-tecnico.ts (Fase 2).
// Las fórmulas, pesos y umbrales son idénticos al original; solo se envuelve
// el resultado en SubScore (0-100) y se corrige la normalización de rango.

import type { SubScore } from "./types";
import type { AnalisisSR } from "../soportes-resistencias";

interface TendenciaInfo {
  direccion: "alcista" | "bajista" | "lateral";
  score: number;
  label: string;
}

interface MomentumInfo {
  score: number;
  label: string;
}

interface AnomaliaPrecioInfo {
  score: number;
  label: string;
}

export interface TecnicoInput {
  current: number;
  sma50: number;
  sma200: number | null;
  rsi: number;
  macd: number;
  macdSignal: number;
  closes: number[];
  sr: AnalisisSR;
}

export interface ScoreTecnicoRaw {
  scoreBruto: number;
  scoreVol: number;
  scoreFinal: number;
  tendenciaScore: number;
  momentumScore: number;
  srScore: number;
  anomaliaScore: number;
  clasificacion: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA";
}

function analizarTendencia(
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
      return {
        direccion: "alcista",
        score: 1.5,
        label: "Cruce dorado — tendencia alcista incipiente",
      };
    }
    if (sma50Prev < sma200Prev && current < sma50) {
      return {
        direccion: "bajista",
        score: -1.5,
        label: "Cruce de la muerte — tendencia bajista incipiente",
      };
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

function analizarMomentum(
  rsi: number,
  macd: number,
  macdSignal: number,
  tendencia: TendenciaInfo,
): MomentumInfo {
  let score = 0;
  const partes: string[] = [];

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

  return { score, label: partes.join(". ") };
}

function analizarSoporteResistencia(sr: AnalisisSR): { score: number; label: string } {
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

function analizarAnomaliaPrecio(
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

function calcularScoreTecnicoInterno(params: TecnicoInput): ScoreTecnicoRaw {
  const tendencia = analizarTendencia(params.current, params.sma50, params.sma200, params.closes);
  const momentum = analizarMomentum(params.rsi, params.macd, params.macdSignal, tendencia);
  const srResult = analizarSoporteResistencia(params.sr);
  const anomaliaPrecio = analizarAnomaliaPrecio(
    params.closes.map((c) => ({ close: c })),
    params.closes.map((c) => ({ close: c })),
  );

  // Pesos normalizados que suman 1.0: tendencia 0.4, momentum 0.3, sr 0.2, anomaliaPrecio 0.1
  const scoreBruto = tendencia.score * 0.4 + momentum.score * 0.3 + srResult.score * 0.2;
  const scoreVol = anomaliaPrecio.score * 0.1;
  const scoreFinal = scoreBruto + scoreVol;

  let clasificacion: ScoreTecnicoRaw["clasificacion"];
  if (scoreFinal > 1.5) clasificacion = "COMPRA";
  else if (scoreFinal > 0.3) clasificacion = "COMPRA CON CAUTELA";
  else if (scoreFinal > -0.3) clasificacion = "MANTENER";
  else if (scoreFinal > -1.5) clasificacion = "REDUCIR";
  else clasificacion = "VENTA";

  return {
    scoreBruto: +scoreBruto.toFixed(3),
    scoreVol: +scoreVol.toFixed(3),
    scoreFinal: +scoreFinal.toFixed(3),
    tendenciaScore: tendencia.score,
    momentumScore: momentum.score,
    srScore: srResult.score,
    anomaliaScore: anomaliaPrecio.score,
    clasificacion,
  };
}

/**
 * Normaliza un score técnico crudo (rango REAL -2.5..+2.5) a 0-100.
 * FIX: el original (normalizarScoreSemaforo en scoring-engine.ts) usaba
 * divisor 10 con rango -5..+5, pero el score real del motor es -2.5..+2.5,
 * lo que comprimía el resultado a la mitad (ej. +2.5 daba 75 en vez de 100).
 * Corregido a divisor 5 sobre el rango real.
 */
export function normalizarScoreTecnico(scoreFinal: number): number {
  return Math.max(0, Math.min(100, ((scoreFinal + 2.5) / 5) * 100));
}

export function calcularTecnico(input: TecnicoInput): SubScore {
  let raw: ScoreTecnicoRaw;
  try {
    raw = calcularScoreTecnicoInterno(input);
  } catch {
    return { valor: 50, detalle: {}, fuente: "scoring/tecnico.ts", disponible: false };
  }

  if (!Number.isFinite(raw.scoreFinal)) {
    return { valor: 50, detalle: {}, fuente: "scoring/tecnico.ts", disponible: false };
  }

  return {
    valor: normalizarScoreTecnico(raw.scoreFinal),
    raw: raw.scoreFinal,
    detalle: {
      scoreBruto: raw.scoreBruto,
      scoreVol: raw.scoreVol,
      tendenciaScore: raw.tendenciaScore,
      momentumScore: raw.momentumScore,
      srScore: raw.srScore,
      anomaliaScore: raw.anomaliaScore,
    },
    fuente: "scoring/tecnico.ts",
    disponible: true,
  };
}
