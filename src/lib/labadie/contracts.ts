// src/lib/labadie/contracts.ts — Contrato cross-session A↔B + Contexto snapshots
// Dueño: A1 crea base, B quant añade clamp/quant, B contexto añade snapshots micro/intermarket.
// Fallbacks null-safe: si A aún no mergeó, B usa hedgeCandidatesFallback / snapshot null.

import { SECTOR_ETF_BY_SECTOR_KEY } from "../benchmarks-master";

// ── Clamps canónicos Labadié §4.3 ──
export const CLAMP_H = [0.25, 0.91] as const;
export const CLAMP_P = [1.1, 4] as const;
export function clampH(h: number): number {
  return Math.min(CLAMP_H[1], Math.max(CLAMP_H[0], h));
}
export function clampP(p: number): number {
  return Math.min(CLAMP_P[1], Math.max(CLAMP_P[0], p));
}
export function clampHOrNeutral(h: number, n: number): number {
  return n < 100 ? 0.5 : clampH(h);
}
export const riskFreeFallback = 0.05;

// ── Hedge ──
export type CohorteKey = "BCBA_ARS" | "CEDear_ARS" | "CEDear_USD" | "US_USD";
export interface HedgeCandidate {
  ticker: string;
  cohorte: CohorteKey;
  beta: number;
  alpha: number;
  r2: number;
  vol: number;
}
function resolverSectorKeyLocal(input: string): string | null {
  const q = input.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!q) return null;
  const map = SECTOR_ETF_BY_SECTOR_KEY as Record<string, string>;
  if (map[q]) return q;
  if (q.includes("financ")) return "financial-services";
  if (q.includes("tecnolog") || q === "tech") return "technology";
  if (q.includes("salud") || q.includes("health")) return "healthcare";
  if (q.includes("energia") || q.includes("energy")) return "energy";
  return null;
}
function etfDeSectorLocal(input: string): string | null {
  const k = resolverSectorKeyLocal(input);
  return k ? (SECTOR_ETF_BY_SECTOR_KEY as Record<string, string>)[k] ?? null : null;
}
export function hedgeCandidatesFallback(sectorKey: string): HedgeCandidate[] {
  const etf = etfDeSectorLocal(sectorKey);
  if (!etf) return [];
  return [{ ticker: etf, cohorte: "US_USD", beta: 1, alpha: 0, r2: 1, vol: 0.18 }];
}

// ── Quant signals fallback ──
export interface QuantSignals {
  hurst: number | null;
  betaP: number | null;
  vol: number | null;
  pValue: number | null;
}
export function quantSignalsFallback(): QuantSignals {
  return { hurst: null, betaP: null, vol: null, pValue: null };
}
export const QUANT_FALLBACK: QuantSignals = { hurst: null, betaP: null, vol: null, pValue: null };

// ── Contexto snapshots (null-safe) ──
export interface IntermarketRegime {
  stage: string;
  confianza: number;
  regimenDolar: string;
  regimenTasas: string;
  riesgoActivo: string;
  sectoresFavorecidos: Array<{ sector: string; etf: string; ret20: number | null }>;
  rotacionDetectada: string;
  curvaSpreads?: number[];
  dowSignal?: string;
}
export interface MacroARSnapshot {
  dolarBlue: number | null;
  dolarMEP: number | null;
  dolarCCL: number | null;
  dolarOficial: number | null;
  riesgoPais: number | null;
  inflacionMensual: number | null;
  inflacionYTD: number | null;
  badlar: number | null;
  tasaPolitica: number | null;
  reservas: number | null;
  baseMonetaria: number | null;
  circulante: number | null;
  tc90d: number[];
  fisherReal: number | null;
  warnings: string[];
}
export interface MicroLocalSnapshot {
  spreadMedioAcciones: number | null;
  spreadMedioCedears: number | null;
  spreadMedioON: number | null;
  spreadMedio: number | null;
  topPeoresSpreads: Array<{ ticker: string; spread: number; panel: string; ask: number; bid: number }>;
  kyleLambdaProxy: number | null;
  caucionTasa7d: number | null;
  liquidezFlag: "ok" | "alerta";
  timestamp: string;
  warnings: string[];
}
export interface AperturaCierreSnapshot {
  futures: Array<{ ticker: string; varPct: number }>;
  adrsOvernight: Array<{ ticker: string; varPct: number }>;
  cclImplicito: number | null;
  cclReal: number | null;
  gapPct: number | null;
  gapLabel: "alcista" | "bajista" | "neutro";
  topMovers?: Array<{ ticker: string; varPct: number }>;
}

// Fallbacks null-safe (NUNCA throw)
export function intermarketFallback(): IntermarketRegime | null { return null; }
export function macroFallback(): MacroARSnapshot | null { return null; }
export function microFallback(): MicroLocalSnapshot {
  return {
    spreadMedioAcciones: null,
    spreadMedioCedears: null,
    spreadMedioON: null,
    spreadMedio: null,
    topPeoresSpreads: [],
    kyleLambdaProxy: null,
    caucionTasa7d: null,
    liquidezFlag: "ok",
    timestamp: new Date().toISOString(),
    warnings: ["sin token IOL — fallback nulls"],
  };
}
