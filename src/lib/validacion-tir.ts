// src/lib/validacion-tir.ts
// Validación cruzada contra IOL: compara TIR y paridad calculada vs. broker
//
// Uso: import { validarTicker } from "./validacion-tir"; luego llamar con
// ticker, precio IOL, TIR IOL, paridad IOL reportados por el broker.
//
// Ejecutar manualmente cada vez que se agregue un instrumento nuevo.

export interface ResultadoValidacion {
  ticker: string;
  tirCalculada: number | null;
  tirIOL: number | null;
  diffTIR: number | null;       // pp (puntos porcentuales)
  paridadCalculada: number | null;
  paridadIOL: number | null;
  diffParidad: number | null;
  pasaTIR: boolean;             // |diff| < 0.15 pp
  pasaParidad: boolean;         // |diff| < 0.5 pp
  pasaGeneral: boolean;
  advertencias: string[];
}

const UMBRAL_TIR = 0.15;   // puntos porcentuales
const UMBRAL_PARIDAD = 0.5;

/**
 * Valida un ticker contra datos del broker.
 *
 * @param ticker - Ticker del bono (ej. "AL30")
 * @param tirIOL - TIR reportada por IOL (en decimal, ej. 0.1265 = 12.65%)
 * @param paridadIOL - Paridad reportada por IOL (en %, ej. 85.3)
 * @param tirCalculada - TIR calculada por el motor
 * @param paridadCalculada - Paridad calculada por el motor
 */
export function validarTicker(
  ticker: string,
  tirIOL: number | null,
  paridadIOL: number | null,
  tirCalculada: number | null,
  paridadCalculada: number | null,
): ResultadoValidacion {
  const advertencias: string[] = [];

  let diffTIR: number | null = null;
  let diffParidad: number | null = null;

  if (tirCalculada != null && tirIOL != null) {
    diffTIR = Math.abs(tirCalculada - tirIOL) * 100; // convertir a pp
    if (diffTIR >= UMBRAL_TIR) {
      advertencias.push(
        `TIR: |${(tirCalculada * 100).toFixed(2)}% - ${(tirIOL * 100).toFixed(2)}%| = ${diffTIR.toFixed(2)}pp ≥ ${UMBRAL_TIR}pp`,
      );
    }
  } else {
    advertencias.push("TIR: falta dato de IOL o cálculo para comparar");
  }

  if (paridadCalculada != null && paridadIOL != null) {
    diffParidad = Math.abs(paridadCalculada - paridadIOL);
    if (diffParidad >= UMBRAL_PARIDAD) {
      advertencias.push(
        `Paridad: |${paridadCalculada.toFixed(2)}% - ${paridadIOL.toFixed(2)}%| = ${diffParidad.toFixed(2)}pp ≥ ${UMBRAL_PARIDAD}pp`,
      );
    }
  } else {
    advertencias.push("Paridad: falta dato de IOL o cálculo para comparar");
  }

  return {
    ticker,
    tirCalculada,
    tirIOL,
    diffTIR,
    paridadCalculada,
    paridadIOL,
    diffParidad,
    pasaTIR: diffTIR != null && diffTIR < UMBRAL_TIR,
    pasaParidad: diffParidad != null && diffParidad < UMBRAL_PARIDAD,
    pasaGeneral: advertencias.length === 0,
    advertencias,
  };
}

/**
 * Valida múltiples tickers y devuelve resumen.
 */
export function validarLote(
  resultados: ResultadoValidacion[],
): { total: number; pasan: number; fallan: number; detalles: ResultadoValidacion[] } {
  const pasan = resultados.filter((r) => r.pasaGeneral);
  const fallan = resultados.filter((r) => !r.pasaGeneral);
  return {
    total: resultados.length,
    pasan: pasan.length,
    fallan: fallan.length,
    detalles: resultados,
  };
}
