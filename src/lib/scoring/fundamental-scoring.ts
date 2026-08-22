// FASE 6 — Wrapper fino del motor unificado.
// El core de scoring (fórmulas, pesos y umbrales) vive ahora en
// src/lib/scoring/fundamental.ts (Fase 2), que es el sub-motor que
// motor-unificado.ts usa internamente (subScores.fundamental).
// Este archivo conserva la firma pública original y delega 1:1.
// # REVISAR: no se llama a calcularScoreUnificado (motor-unificado) porque
// esta función recibe datos puros sin ticker/tipoActivo: es exactamente uno
// de los sub-cores del motor. Fórmulas idénticas al original (verificado en
// Fase 2), incluido maxScore === 0 → 50, por lo que el valor 0-100 no cambia.

import { calcularFundamental, type FundamentalInput } from "./fundamental";

export type { FundamentalInput };

export function calcularScoreFundamental(data: FundamentalInput): number {
  return calcularFundamental(data).valor;
}