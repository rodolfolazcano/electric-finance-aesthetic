// FASE 6 — Wrapper fino del motor unificado.
// Core migrado a src/lib/scoring/cuantitativo.ts (Fase 2), sub-motor que
// motor-unificado.ts usa internamente (subScores.cuantitativo).
// Delegación 1:1 con la misma firma pública original.
// # REVISAR: idem fundamental-scoring — no llama a calcularScoreUnificado
// porque es un sub-score puro sin ticker. Fórmulas idénticas al original
// (verificado en Fase 2), incluido pesoTotal === 0 → 50.

import { calcularCuantitativo, type CuantitativoInput } from "./cuantitativo";

export type { CuantitativoInput };

export function calcularScoreCuantitativo(data: CuantitativoInput): number {
  return calcularCuantitativo(data).valor;
}