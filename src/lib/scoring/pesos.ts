// Pesos unificados del motor de scoring (Fase 1).
// Consolidación de PESOS_POR_TIPO (scoring-unificado.ts línea 75-83)
// con pesos RVA/RF (scoring-engine.ts línea 270-297).
//
// Cada fila suma exactamente 1.0.
// sectorial y calidadMoat quedan en 0 hasta que un motor migrado los produzca
// (el puntaje sectorial se aplica como filtro/contexto en fases posteriores).

import type { SubScoreKey, TipoActivo } from "./types";

const FILA_ACCION: Record<SubScoreKey, number> = {
  tecnico: 0.3,
  fundamental: 0.3,
  cuantitativo: 0.25,
  sectorial: 0,
  noticias: 0.1,
  macroContexto: 0.05,
  calidadMoat: 0,
};

const FILA_ETF: Record<SubScoreKey, number> = {
  tecnico: 0.45,
  fundamental: 0.2,
  cuantitativo: 0.25,
  sectorial: 0,
  noticias: 0.05,
  macroContexto: 0.05,
  calidadMoat: 0,
};

// BONO/ON: valores documentados (0.10 tecnico, 0.10 fundamental, 0.45 cuantitativo,
// 0.20 noticias, 0.25 macroContexto) suman 1.10 → autocorrección mecánica:
// macroContexto 0.25 → 0.15 para forzar suma 1.0.
const FILA_BONO: Record<SubScoreKey, number> = {
  tecnico: 0.1,
  fundamental: 0.1,
  cuantitativo: 0.45,
  sectorial: 0,
  noticias: 0.2,
  macroContexto: 0.15,
  calidadMoat: 0,
};

export const PESOS_UNIFICADOS: Record<TipoActivo, Record<SubScoreKey, number>> = {
  ACCION: FILA_ACCION,
  CEDEAR: FILA_ACCION,
  ADR: FILA_ACCION,
  ETF: FILA_ETF,
  BONO: FILA_BONO,
  ON: FILA_BONO,
  OTRO: FILA_ACCION,
};

export function pesosParaTipo(tipo: TipoActivo): Record<SubScoreKey, number> {
  return PESOS_UNIFICADOS[tipo] ?? PESOS_UNIFICADOS.OTRO;
}

export function sumaPesos(fila: Record<SubScoreKey, number>): number {
  return Object.values(fila).reduce((a, b) => a + b, 0);
}
