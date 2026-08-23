// src/lib/contexto/contracts.ts — Tipos compartidos Contexto (A ↔ B)
// Barrel del tab Contexto. Fallbacks null-safe para UI sin datos.
// No recalcular aquí — solo tipos + fallbacks.

export type Flecha = "↑" | "↓" | "→";

export interface IntermarketRegime {
  stage: number; // 0-5 canónico (cycle-phase-detector)
  stageLabel: string;
  flechas: { bonos: Flecha; acciones: Flecha; commodities: Flecha };
  curva: { spread10y2y: number | null; spread10y3m: number | null; estado: string };
  bondsStocks: { tlt60: number | null; spy60: number | null; corr60: number | null; lectura: string };
  dowTheory: { dji: string; djt: string; senal: string };
  ratios: Array<{
    nombre: string;
    valor: number | null;
    var1m: number | null;
    lectura: string;
    lidera: string[];
    evita: string[];
  }>;
  leadLag: Array<{ par: string; lagOptimo: number | null; lider: string }>;
  confianza: number | null; // 0-100
  sectoresFavorecidos: string[];
  sectoresEvitar: string[];
}

export interface MacroARSnapshot {
  dolar: { oficial: number | null; blue: number | null; mep: number | null; ccl: number | null };
  riesgoPais: number | null;
  inflacionMensual: number | null;
  inflacionYTD: number | null;
  badlar: number | null;
  tasaPoliticaMonetaria: number | null;
  reservasUSD: number | null;
  baseMonetaria: number | null;
  circulante: number | null;
  tcSerie90d: Array<{ fecha: string; valor: number }>;
  regimenFisher: { realExacta: number | null; nominal: number | null; inflImpl: number | null };
  timestamp: string;
}

export interface MicroLocalSnapshot {
  spreadRelativoMedio: number | null;
  kyleLambdaProxy: number | null;
  caucionTasa7d: number | null;
  topSpreads: Array<{ ticker: string; spreadPct: number }>;
  liquidezFlag: "ok" | "alerta";
  timestamp: string;
}

export interface AperturaCierreSnapshot {
  modo: "apertura" | "cierre";
  futuresUS: { ES: number | null; NQ: number | null; YM: number | null };
  adrsNY: Array<{ ticker: string; varOvernight: number | null }>;
  cclImplicitoADR: number | null;
  gapEsperadoBCBA: "alcista" | "bajista" | "neutro";
  cierreOffshoreRef?: unknown;
  timestamp: string;
}

// ── Fallbacks null-safe ────────────────────────────────────────────────
export function intermarketRegimeFallback(): IntermarketRegime {
  return {
    stage: 2,
    stageLabel: "Stage 2 — Expansión Plena (fallback)",
    flechas: { bonos: "→", acciones: "→", commodities: "→" },
    curva: { spread10y2y: null, spread10y3m: null, estado: "sin datos" },
    bondsStocks: { tlt60: null, spy60: null, corr60: null, lectura: "sin datos" },
    dowTheory: { dji: "→", djt: "→", senal: "sin datos" },
    ratios: [],
    leadLag: [],
    confianza: null,
    sectoresFavorecidos: [],
    sectoresEvitar: [],
  };
}

export function macroARSnapshotFallback(): MacroARSnapshot {
  return {
    dolar: { oficial: null, blue: null, mep: null, ccl: null },
    riesgoPais: null,
    inflacionMensual: null,
    inflacionYTD: null,
    badlar: null,
    tasaPoliticaMonetaria: null,
    reservasUSD: null,
    baseMonetaria: null,
    circulante: null,
    tcSerie90d: [],
    regimenFisher: { realExacta: null, nominal: null, inflImpl: null },
    timestamp: new Date().toISOString(),
  };
}

export function microLocalSnapshotFallback(): MicroLocalSnapshot {
  return {
    spreadRelativoMedio: null,
    kyleLambdaProxy: null,
    caucionTasa7d: null,
    topSpreads: [],
    liquidezFlag: "alerta",
    timestamp: new Date().toISOString(),
  };
}

export function aperturaCierreSnapshotFallback(
  modo: AperturaCierreSnapshot["modo"] = "apertura",
): AperturaCierreSnapshot {
  return {
    modo,
    futuresUS: { ES: null, NQ: null, YM: null },
    adrsNY: [],
    cclImplicitoADR: null,
    gapEsperadoBCBA: "neutro",
    timestamp: new Date().toISOString(),
  };
}
