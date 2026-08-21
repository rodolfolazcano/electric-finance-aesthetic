// @ts-nocheck
// src/lib/senales-tecnicas.ts
// Detección de señales basada en el semáforo combinado (score técnico + fundamental).
// Reutiliza calcularScoreTecnico de semaforo-tecnico.ts para calcular el score
// en cada ventana histórica y detecta cambios de clasificación.

import { calcularScoreTecnico } from "./semaforo-tecnico";
import { analizarSoportesResistencias } from "./soportes-resistencias";
import { rsi, macd, sma } from "./optimizer";

export interface VelaOHLC {
  fecha: string;
  apertura: number;
  maximo: number;
  minimo: number;
  cierre: number;
}

// Orden de clasificaciones para detectar mejora/empeoramiento
const ORDEN_CLASIFICACION = [
  "VENTA",
  "REDUCIR",
  "MANTENER",
  "COMPRA CON CAUTELA",
  "COMPRA",
] as const;

export type Clasificacion = (typeof ORDEN_CLASIFICACION)[number];

export interface SenalSemaforo {
  fecha: string;
  precio: number;
  scoreAnterior: number;
  scoreActual: number;
  clasificacionAnterior: string;
  clasificacionActual: string;
  tipo: "mejora" | "empeora";
  descripcion: string;
}

// Calcula score del semáforo en cada punto de la serie histórica
export function calcularSerieSemaforo(
  velas: VelaOHLC[],
): { fecha: string; precio: number; score: number; clasificacion: string }[] {
  if (velas.length < 220) return [];
  const prices = velas.map((v) => v.cierre);
  const resultado: { fecha: string; precio: number; score: number; clasificacion: string }[] = [];

  for (let i = 219; i < velas.length; i++) {
    const window = prices.slice(0, i + 1);
    const current = prices[i];
    const history = velas.slice(0, i + 1).map((v) => ({ date: v.fecha, close: v.cierre }));

    const rsiVal = rsi(window);
    const macdVal = macd(window);
    const sma50Val = sma(window, 50);
    const sma200Val = sma(window, 200);

    const sr = analizarSoportesResistencias(history, 5, 0.02);

    const result = calcularScoreTecnico({
      current,
      sma50: sma50Val,
      sma200: sma200Val,
      rsi: rsiVal,
      macd: macdVal.macd,
      macdSignal: macdVal.signal,
      closes: window,
      sr,
    });

    resultado.push({
      fecha: velas[i].fecha,
      precio: current,
      score: result.scoreFinal,
      clasificacion: result.clasificacion,
    });
  }

  return resultado;
}

// Detecta cambios de clasificación en la serie
export function detectarSenalesSemaforo(
  serie: { fecha: string; precio: number; score: number; clasificacion: string }[],
): SenalSemaforo[] {
  const senales: SenalSemaforo[] = [];

  for (let i = 1; i < serie.length; i++) {
    const ant = serie[i - 1];
    const act = serie[i];

    const idxAnt = ORDEN_CLASIFICACION.indexOf(ant.clasificacion as Clasificacion);
    const idxAct = ORDEN_CLASIFICACION.indexOf(act.clasificacion as Clasificacion);

    if (idxAnt === -1 || idxAct === -1) continue;

    if (idxAct > idxAnt) {
      senales.push({
        fecha: act.fecha,
        precio: act.precio,
        scoreAnterior: ant.score,
        scoreActual: act.score,
        clasificacionAnterior: ant.clasificacion,
        clasificacionActual: act.clasificacion,
        tipo: "mejora",
        descripcion: `Semáforo mejoró: ${ant.clasificacion} → ${act.clasificacion} (score ${ant.score.toFixed(2)} → ${act.score.toFixed(2)})`,
      });
    } else if (idxAct < idxAnt) {
      senales.push({
        fecha: act.fecha,
        precio: act.precio,
        scoreAnterior: ant.score,
        scoreActual: act.score,
        clasificacionAnterior: ant.clasificacion,
        clasificacionActual: act.clasificacion,
        tipo: "empeora",
        descripcion: `Semáforo empeoró: ${ant.clasificacion} → ${act.clasificacion} (score ${ant.score.toFixed(2)} → ${act.score.toFixed(2)})`,
      });
    }
  }

  return senales;
}

// Re-exportar calcularScoreTecnico para que los backtests puedan usarlo directamente
export { calcularScoreTecnico, analizarSoportesResistencias, rsi, macd, sma };
