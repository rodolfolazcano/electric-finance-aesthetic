// @ts-nocheck
// CANONICAL: usar esta versión para todo UI nuevo (AnalisisTab, SemaforoCard). Incluye fecha/vecesTocado/esEstimado + fallback 52w.
export interface SoporteResistencia {
  tipo: "soporte" | "resistencia";
  precio: number;
  fecha: string;
  vecesTocado: number;
  esEstimado?: boolean;
}

export interface AnalisisSR {
  soportes: SoporteResistencia[];
  resistencias: SoporteResistencia[];
  soporteMasCercano: SoporteResistencia | null;
  resistenciaMasCercana: SoporteResistencia | null;
  distanciaSoportePct: number;
  distanciaResistenciaPct: number;
}

function findLocalExtrema(
  prices: { date: string; close: number }[],
  windowSize = 5,
): { minimos: number[]; maximos: number[] } {
  const minimos: number[] = [];
  const maximos: number[] = [];
  const n = prices.length;
  for (let i = windowSize; i < n - windowSize; i++) {
    const segment = prices.slice(i - windowSize, i + windowSize + 1);
    const vals = segment.map((p) => p.close);
    const mid = prices[i].close;
    if (mid === Math.min(...vals)) minimos.push(i);
    if (mid === Math.max(...vals)) maximos.push(i);
  }
  return { minimos, maximos };
}

function agruparCercanos(
  indices: number[],
  prices: { date: string; close: number }[],
  toleranciaPct = 0.02,
): SoporteResistencia[] {
  if (indices.length === 0) return [];
  const agrupados: SoporteResistencia[] = [];
  const usados = new Set<number>();
  for (let i = 0; i < indices.length; i++) {
    if (usados.has(i)) continue;
    const grupo = [i];
    usados.add(i);
    const precioBase = prices[indices[i]].close;
    for (let j = i + 1; j < indices.length; j++) {
      if (usados.has(j)) continue;
      const diff = Math.abs(prices[indices[j]].close - precioBase) / precioBase;
      if (diff <= toleranciaPct) {
        grupo.push(j);
        usados.add(j);
      }
    }
    const precioAvg = grupo.reduce((s, idx) => s + prices[indices[idx]].close, 0) / grupo.length;
    const fechaMasReciente = prices[Math.max(...grupo.map((idx) => indices[idx]))].date;
    agrupados.push({
      tipo: "soporte",
      precio: +precioAvg.toFixed(2),
      fecha: fechaMasReciente,
      vecesTocado: grupo.length,
    });
  }
  return agrupados;
}

export function analizarSoportesResistencias(
  history: { date: string; close: number }[],
  ventana = 5,
  toleranciaPct = 0.02,
  fallbackHigh52?: number,
  fallbackLow52?: number,
): AnalisisSR {
  if (history.length < 30) {
    return {
      soportes: [],
      resistencias: [],
      soporteMasCercano: null,
      resistenciaMasCercana: null,
      distanciaSoportePct: 0,
      distanciaResistenciaPct: 0,
    };
  }
  const { minimos, maximos } = findLocalExtrema(history, ventana);
  const soportesCrudos = agruparCercanos(minimos, history, toleranciaPct);
  const resistenciasCrudas = agruparCercanos(maximos, history, toleranciaPct);
  const current = history[history.length - 1].close;

  const soportes = soportesCrudos
    .filter((s) => s.precio <= current)
    .sort((a, b) => b.precio - a.precio);

  const resistencias = resistenciasCrudas
    .filter((r) => r.precio >= current)
    .sort((a, b) => a.precio - b.precio);

  // Fallback a 52w si no se detectaron niveles por extremos locales
  if (soportes.length === 0 && fallbackLow52 != null && fallbackLow52 < current) {
    soportes.push({
      tipo: "soporte",
      precio: fallbackLow52,
      fecha: history[history.length - 1].date,
      vecesTocado: 1,
      esEstimado: true,
    });
  }
  if (resistencias.length === 0 && fallbackHigh52 != null && fallbackHigh52 > current) {
    resistencias.push({
      tipo: "resistencia",
      precio: fallbackHigh52,
      fecha: history[history.length - 1].date,
      vecesTocado: 1,
      esEstimado: true,
    });
  }

  const soporteMasCercano = soportes.length > 0 ? soportes[0] : null;
  const resistenciaMasCercana = resistencias.length > 0 ? resistencias[0] : null;

  return {
    soportes,
    resistencias,
    soporteMasCercano,
    resistenciaMasCercana,
    distanciaSoportePct: soporteMasCercano
      ? +(((soporteMasCercano.precio - current) / current) * 100).toFixed(2)
      : 0,
    distanciaResistenciaPct: resistenciaMasCercana
      ? +(((resistenciaMasCercana.precio - current) / current) * 100).toFixed(2)
      : 0,
  };
}
