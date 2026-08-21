// @ts-nocheck
// ─── Cycle Phase Detector — Murphy (6 Stages) + Sector Rotation ──
// Lógica PURA: detecta la fase económica según las 3 flechas de Pring
// y devuelve la rotación sectorial correspondiente (Murphy + Stovall).
// Sin dependencias de UI, sin side effects.

// ─── TIPOS ────────────────────────────────────────────────────────

export type TrendArrow = "up" | "down" | "flat" | null;

// ─── Murphy Stage 1-6 labels (desde el Cap. 12) ──────────────────
// Mismas reglas que detectCyclePhase(0-5), re-enumeradas 1-6.
// MURPHY_STAGE_LABELS usa numeración 1-6 (igual que StageCiclo en intermarket-engine.ts).
// CYCLE_PHASES usa 0-5 (índice de array). Para una fase 0-5, sumar 1 → 1-6.

// ─── FUENTE DE VERDAD CANÓNICA: Rueda de Stovall (Murphy, Cap. 13, Fig. 13.1, pág. 200) ─────────────────────
// Mapeo de 6 stages de Pring (0-5) a los 6 sectores líderes de Stovall.
// Correspondencia Pring-stage ↔ Stovall-etapa:
//   Stage 0 (B↑S↓C↓) → Late Contraction → Financials
//   Stage 1 (B↑S↑C↓) → Early Expansion → Consumer Cyclicals, Technology
//   Stage 2 (B↑S↑C↑) → Middle Expansion → Industrials
//   Stage 3 (B↓S↑C↑) → Late Expansion → Energy, Basic Materials
//   Stage 4 (B↓S↓C↑) → Early Contraction → Consumer Defensive, Utilities
//   Stage 5 (B↓S↓C↓) → Late Contraction → Financials (cierra el círculo)

export const CANONICAL_SECTOR_ROTATION: Record<
  number,
  { sectoresLideres: string[]; fuente: string }
> = {
  0: {
    sectoresLideres: ["Financial Services"],
    fuente: "Stovall: Late Contraction — Financials (Murphy, Cap. 13, Fig. 13.1, pág. 200)",
  },
  1: {
    sectoresLideres: ["Consumer Cyclical", "Technology"],
    fuente: "Stovall: Early Expansion (Murphy, Cap. 13, pág. 200)",
  },
  2: {
    sectoresLideres: ["Industrials"],
    fuente:
      "Stovall: Middle Expansion — Capital Goods + Transportation consolidados en Industrials (Murphy, Cap. 13, Fig. 13.1, pág. 200)",
  },
  3: {
    sectoresLideres: ["Energy", "Basic Materials"],
    fuente: "Stovall: Late Expansion (Murphy, Cap. 13, pág. 200)",
  },
  4: {
    sectoresLideres: ["Consumer Defensive", "Utilities"],
    fuente: "Stovall: Early Contraction (Murphy, Cap. 13, pág. 200)",
  },
  5: {
    sectoresLideres: ["Financial Services"],
    fuente: "Stovall: Late Contraction — cierra el círculo (Murphy, Cap. 13, Fig. 13.1, pág. 200)",
  },
};

// ─── Tablas legacy (derivadas de CANONICAL_SECTOR_ROTATION) ─────────────────────────────────────────────────────────────
// @deprecated: Usar CANONICAL_SECTOR_ROTATION directamente. Estas tablas se mantienen por compatibilidad.

export const MURPHY_STAGE_LABELS: Record<number, { label: string; sectoresLideres: string[] }> = {
  1: {
    label: "Stage 1 — Recesión / Suelo",
    sectoresLideres: CANONICAL_SECTOR_ROTATION[0].sectoresLideres,
  },
  2: {
    label: "Stage 2 — Recuperación Temprana",
    sectoresLideres: CANONICAL_SECTOR_ROTATION[1].sectoresLideres,
  },
  3: {
    label: "Stage 3 — Expansión Plena",
    sectoresLideres: CANONICAL_SECTOR_ROTATION[2].sectoresLideres,
  },
  4: {
    label: "Stage 4 — Expansión Tardía",
    sectoresLideres: CANONICAL_SECTOR_ROTATION[3].sectoresLideres,
  },
  5: {
    label: "Stage 5 — Contracción Temprana",
    sectoresLideres: CANONICAL_SECTOR_ROTATION[4].sectoresLideres,
  },
  6: {
    label: "Stage 6 — Contracción Total",
    sectoresLideres: CANONICAL_SECTOR_ROTATION[5].sectoresLideres,
  },
};

export interface PhaseInput {
  bondsTrend: TrendArrow; // TLT
  stocksTrend: TrendArrow; // SPY
  commoditiesTrend: TrendArrow; // DBC / ^CRB
}

export interface CyclePhase {
  stage: number; // 0-5
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  color: string; // Tailwind text color
  bgColor: string; // Tailwind bg color
  borderColor: string; // Tailwind border color
}

export interface SectorRotation {
  stage: number;
  stageLabel: string;
  buy: string[]; // Sectores/activos a comprar
  sell: string[]; // Sectores/activos a vender
  style: string; // Estilo de inversión
  riskProfile: "aggressive_risk_on" | "moderate_risk_on" | "neutral" | "defensive" | "risk_off";
}

export interface PhaseDiagnosis {
  phase: CyclePhase;
  rotation: SectorRotation;
  confirmationSignals: {
    xlyXlp: TrendArrow;
    iwmSpy: TrendArrow;
    rspSpy: TrendArrow;
    hyLqd: TrendArrow;
    xlkXle: TrendArrow;
    goldSilver: TrendArrow;
  };
  confidence: "alta" | "media" | "baja";
  matchedSignals: number;
  totalSignals: number;
}

// ─── LAS 6 FASES DEL CICLO (Murphy + Pring) ──────────────────────

export const CYCLE_PHASES: CyclePhase[] = [
  {
    stage: 0,
    label: "Stage 0 — Recesión / Suelo",
    shortLabel: "Recesión",
    description:
      "Bonos suben (flight-to-quality). Acciones caen buscando piso. Commodities caen por demanda destruida. El peor momento del ciclo, pero el mejor para comprar bonos largos.",
    icon: "🔴",
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
  },
  {
    stage: 1,
    label: "Stage 1 — Recuperación Temprana",
    shortLabel: "Recuperación",
    description:
      "Bonos y acciones suben. Commodities aún débiles. Pequeñas empresas lideran. Es el MEJOR momento para comprar acciones. Tech, Discrecional, Small Caps.",
    icon: "🟢",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
  },
  {
    stage: 2,
    label: "Stage 2 — Expansión Plena",
    shortLabel: "Expansión",
    description:
      "Los 3 activos suben sincronizados. Liquidez abundante. Industriales y Materiales toman liderazgo. La economía está en su punto más saludable.",
    icon: "🟢",
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10",
    borderColor: "border-emerald-500/30",
  },
  {
    stage: 3,
    label: "Stage 3 — Expansión Tardía",
    shortLabel: "Tardía",
    description:
      "Bonos caen (yields suben por inflación). Acciones aún suben pero sólo las mega-caps. Commodities fuertes. Energy lidera. Mercado angosto. INFLACIÓN es el riesgo dominante.",
    icon: "🟡",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/30",
  },
  {
    stage: 4,
    label: "Stage 4 — Contracción Temprana",
    shortLabel: "Contracción",
    description:
      "Bonos caen, Acciones caen, pero Commodities aún suben por inercia. Estanflación. Es el momento de rotar a defensivos: Salud, Staples, Utilities, Oro.",
    icon: "🟠",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
  },
  {
    stage: 5,
    label: "Stage 5 — Contracción Total",
    shortLabel: "Recesión",
    description:
      "Los 3 activos caen. Cash es king. Bonos largos empiezan a subir anticipando recortes. Preparar el suelo del ciclo (Stage 0).",
    icon: "🔴🔴",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/30",
  },
];

export const PHASE_MAP: Record<number, CyclePhase> = Object.fromEntries(
  CYCLE_PHASES.map((p) => [p.stage, p]),
);

// ─── ROTACIÓN SECTORIAL POR FASE (Murphy + Stovall + Pring) ─────

export const SECTOR_ROTATION_MAP: SectorRotation[] = [
  {
    stage: 0,
    stageLabel: "Recesión / Suelo",
    buy: [
      "TLT / IEF (Bonos largos)",
      "GLD (Oro)",
      "XLP (Cons. Básico)",
      "XLU (Utilities)",
      "XLV (Salud)",
      "BIL / SGOV (T-bills)",
    ],
    sell: [
      "XLK (Tecnología)",
      "XLY (Cons. Discrecional)",
      "XLE (Energía)",
      "XLF (Finanzas)",
      "IWM (Small Caps)",
      "HYG (High Yield)",
    ],
    style: "Value defensivo / Baja Beta / Cash",
    riskProfile: "defensive",
  },
  {
    stage: 1,
    stageLabel: "Recuperación Temprana",
    buy: [
      "XLK (Tecnología)",
      "XLY (Cons. Discrecional)",
      "IWM (Small Caps)",
      "XLF (Finanzas)",
      "QQQ (Nasdaq 100)",
    ],
    sell: ["XLP (Cons. Básico)", "XLU (Utilities)", "TLT (Bonos Largos)", "GLD (Oro)"],
    style: "Growth / Small Cap / Momentum",
    riskProfile: "aggressive_risk_on",
  },
  {
    stage: 2,
    stageLabel: "Expansión Plena",
    buy: [
      "XLI (Industrial)",
      "XLB (Materiales)",
      "XLF (Finanzas)",
      "COPX / JJC (Cobre)",
      "XLE (Energía)",
    ],
    sell: ["TLT (Bonos Largos)", "XLU (Utilities)", "XLP (Cons. Básico)"],
    style: "Cíclico Industrial / Value / Commodities",
    riskProfile: "moderate_risk_on",
  },
  {
    stage: 3,
    stageLabel: "Expansión Tardía",
    buy: [
      "XLE (Energía)",
      "GLD (Oro)",
      "DBA (Agricultura)",
      "XLV (Salud)",
      "XLU (Utilities)",
      "BIL / SGOV (T-bills)",
    ],
    sell: [
      "XLK (Tecnología)",
      "XLY (Cons. Discrecional)",
      "IWM (Small Caps)",
      "LQD (IG Corp)",
      "HYG (High Yield)",
    ],
    style: "Inflación / Energía / Defensivo / Calidad",
    riskProfile: "defensive",
  },
  {
    stage: 4,
    stageLabel: "Contracción Temprana",
    buy: [
      "XLV (Salud)",
      "XLP (Cons. Básico)",
      "XLU (Utilities)",
      "GLD (Oro)",
      "TLT (Bonos Largos)",
      "BIL (T-bills)",
    ],
    sell: [
      "XLK (Tecnología)",
      "XLY (Cons. Discrecional)",
      "XLE (Energía)",
      "XLB (Materiales)",
      "HYG (High Yield)",
    ],
    style: "Defensivo / Healthcare / Oro / Cash parcial",
    riskProfile: "defensive",
  },
  {
    stage: 5,
    stageLabel: "Contracción Total",
    buy: ["TLT / IEF (Bonos Largos)", "GLD (Oro)", "BIL / SHV (Cash)", "^VIX (Hedge)"],
    sell: ["Todo: stocks, commodities, crédito corporativo"],
    style: "Cash / Bonos / Volatilidad / Máxima defensa",
    riskProfile: "risk_off",
  },
];

export const ROTATION_BY_STAGE: Record<number, SectorRotation> = Object.fromEntries(
  SECTOR_ROTATION_MAP.map((r) => [r.stage, r]),
);

// ─── DETECTOR DE FASE: REGLAS EXPLÍCITAS (no difusas) ───────────

/**
 * Detecta la fase del ciclo económico según las 3 flechas de Pring.
 * Usa reglas EXACTAS, no distancia euclidiana.
 *
 * Entrada: tendencias de TLT (bonos), SPY (acciones), DBC (commodities).
 * Salida: stage 0-5.
 */
export function detectCyclePhase(input: PhaseInput): number {
  const { bondsTrend: b, stocksTrend: s, commoditiesTrend: c } = input;

  // ─── Stage 0: B↑ S↓ C↓ (Recesión / Suelo) ───────────────────────
  if (b === "up" && s === "down" && c === "down") return 0;

  // ─── Stage 1: B↑ S↑ C↓ (Recuperación Temprana) ──────────────────
  if (b === "up" && s === "up" && c === "down") return 1;

  // ─── Stage 2: B↑ S↑ C↑ (Expansión Plena) ────────────────────────
  if (b === "up" && s === "up" && c === "up") return 2;

  // ─── Stage 3: B↓ S↑ C↑ (Expansión Tardía) ───────────────────────
  if (b === "down" && s === "up" && c === "up") return 3;

  // ─── Stage 4: B↓ S↓ C↑ (Contracción Temprana) ───────────────────
  if (b === "down" && s === "down" && c === "up") return 4;

  // ─── Stage 5: B↓ S↓ C↓ (Contracción Total) ──────────────────────
  if (b === "down" && s === "down" && c === "down") return 5;

  // ─── Casos parciales / fronterizos ───────────────────────────────
  // Si bonos suben y acciones suben → probablemente Stage 1-2
  if (b === "up" && s === "up") {
    // Si commodities también suben → Stage 2, si no → Stage 1
    return c === "up" ? 2 : 1;
  }
  // Si bonos bajan y acciones suben → Stage 3 (late expansion)
  if (b === "down" && s === "up") return 3;
  // Si bonos bajan y acciones bajan → Stage 4-5
  if (b === "down" && s === "down") {
    return c === "up" ? 4 : 5;
  }
  // B↑ S↓ C↓ → Stage 0 (transición/recesión)
  // B↑ S↓ C↑ → Stage 4 (estanflación: flight-to-quality a bonos + inflación en commodities)
  if (b === "up" && s === "down") {
    return c === "down" ? 0 : 4;
  }

  // Fallback: flat general → asumir Stage 2 (expansión neutral)
  return 2;
}

// ─── DIAGNÓSTICO COMPLETO ────────────────────────────────────────

/**
 * Diagnóstico completo: fase + rotación + señales de confirmación.
 * Es el PASO 1 del análisis Murphy: determina DÓNDE estamos.
 */
export function diagnosePhase(
  input: PhaseInput,
  confirmations: {
    xlyXlp?: TrendArrow;
    iwmSpy?: TrendArrow;
    rspSpy?: TrendArrow;
    hyLqd?: TrendArrow;
    xlkXle?: TrendArrow;
    goldSilver?: TrendArrow;
  } = {},
): PhaseDiagnosis {
  const stage = detectCyclePhase(input);
  const phase = PHASE_MAP[stage] ?? CYCLE_PHASES[2];
  const rotation = ROTATION_BY_STAGE[stage] ?? SECTOR_ROTATION_MAP[2];

  // Señales de confirmación Murphy
  const signals = {
    xlyXlp: confirmations.xlyXlp ?? null,
    iwmSpy: confirmations.iwmSpy ?? null,
    rspSpy: confirmations.rspSpy ?? null,
    hyLqd: confirmations.hyLqd ?? null,
    xlkXle: confirmations.xlkXle ?? null,
    goldSilver: confirmations.goldSilver ?? null,
  };

  // Cuántas señales de confirmación COINCIDEN con la fase detectada
  // Reglas por fase:
  // Stage 0-1: XLY/XLP↓, IWM/SPY↓, RSP/SPY↓ (todo débil)
  // Stage 1-2: XLY/XLP↑, IWM/SPY↑, XLK/XLE↑ (tech lidera)
  // Stage 2-3: RSP/SPY↓ (angosto), XLK/XLE↓ (energy > tech)
  // Stage 3-4: XLY/XLP↓, IWM/SPY↓, XLK/XLE↓
  // Stage 4-5: RSP/SPY↓, HYG/LQD↓ (credit stress)
  let matchedSignals = 0;
  let totalSignals = 0;

  const check = (actual: TrendArrow, expected: TrendArrow) => {
    totalSignals++;
    if (actual === expected) matchedSignals++;
  };

  if (stage <= 1) {
    check(signals.xlyXlp, "down");
    check(signals.iwmSpy, "down");
    check(signals.xlkXle, "down");
  } else if (stage <= 2) {
    check(signals.xlyXlp, "up");
    check(signals.iwmSpy, "up");
    check(signals.xlkXle, "up");
  } else if (stage === 3) {
    check(signals.rspSpy, "down"); // Mercado angosto
    check(signals.xlkXle, "down"); // Energy > Tech
    check(signals.iwmSpy, "down"); // Large > Small
    check(signals.goldSilver, "up"); // Miedo extremo
  } else {
    check(signals.xlyXlp, "down");
    check(signals.iwmSpy, "down");
    check(signals.xlkXle, "down");
    check(signals.hyLqd, "down"); // Credit stress
  }

  const ratio = totalSignals > 0 ? matchedSignals / totalSignals : 1;
  const confidence: "alta" | "media" | "baja" =
    ratio >= 0.75 ? "alta" : ratio >= 0.5 ? "media" : "baja";

  return {
    phase,
    rotation,
    confirmationSignals: signals,
    confidence,
    matchedSignals,
    totalSignals,
  };
}

// ─── HELPERS ──────────────────────────────────────────────────────

/** Convierte un changePct (%) a TrendArrow */
export function pctToTrend(pct: number | null, threshold = 2): TrendArrow {
  if (pct == null) return null;
  if (pct > threshold) return "up";
  if (pct < -threshold) return "down";
  return "flat";
}

/** Convierte TrendDirection de intermarket-complete a TrendArrow */
export function trendDirectionToArrow(dir: "rising" | "falling" | "flat" | null): TrendArrow {
  if (dir === "rising") return "up";
  if (dir === "falling") return "down";
  if (dir === "flat") return "flat";
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// PASO 2 — CHECKLIST DE RECESIÓN (Metodología propia — no cita textual de Murphy)
// ═══════════════════════════════════════════════════════════════════
// Esta metodología define 6 condiciones que juntas señalan recesión inminente.
// Cada condición vale 1 punto. Score ≥ 4 = alta probabilidad de recesión.

export interface RecessionCondition {
  id: string;
  label: string;
  detail: string;
  met: boolean | null; // true = condición de recesión activa
  value: string; // Valor actual para mostrar
  chapterRef: string; // Referencia al capítulo de Murphy
}

export interface RecessionChecklistResult {
  conditions: RecessionCondition[];
  score: number; // 0-6
  probability: "baja" | "moderada" | "alta" | "inminente";
  interpretation: string;
  metCount: number;
  totalCount: number;
}

/**
 * Evalúa las 6 condiciones de recesión (Metodología propia — no cita textual de Murphy).
 *
 * Datos necesarios desde CompleteIntermarketResult:
 *  - ratios[] con YIELD_CURVE, CRB_BONDS, HYG_LQD
 *  - context.dxy (dirección del dólar)
 *  - context.dowTheory (divergencia)
 *  - complementary.fedFunds (ciclo de tasas)
 */
export function checkRecessionChecklist(params: {
  yieldCurveSpread21d: number | null; // Valor actual del spread 10Y-3M
  crbBondsChange63d: number | null; // ChangePct 63d de CRB/BONDS
  dxyDirection: TrendArrow; // Tendencia del DXY
  hyLqdChange63d: number | null; // ChangePct 63d de HYG/LQD
  fedCyclePhase: string | null; // "tightening" | "cutting" | "pause" | "neutral"
  fedCurrentRate: number | null; // Tasa actual de Fed Funds
  dowTheoryConfirmed: boolean | null; // Si Dow Theory está confirmada
  dowTheoryDivergence: string | null; // "bullish" | "bearish" | null
}): RecessionChecklistResult {
  const c: RecessionCondition[] = [];

  // Condición 1: Curva de yields INVERTIDA (10Y-3M < 0)
  const yieldInverted = params.yieldCurveSpread21d != null && params.yieldCurveSpread21d < 0;
  c.push({
    id: "yield_curve",
    label: "Curva de Yields INVERTIDA",
    detail:
      "La 10Y-3M negativa es la señal más temprana y confiable de recesión. Históricamente precede recesión por 6-18 meses.",
    met: yieldInverted,
    value:
      params.yieldCurveSpread21d != null
        ? `${params.yieldCurveSpread21d.toFixed(2)}%`
        : "Sin datos",
    chapterRef: "Metodología propia — no cita textual de Murphy",
  });

  // Condición 2: CRB/Bonds CAYENDO por 3+ meses (commodities débiles vs bonos)
  const crbFalling = params.crbBondsChange63d != null && params.crbBondsChange63d < -3;
  c.push({
    id: "crb_bonds",
    label: "CRB/Bonds EN CAÍDA",
    detail:
      "Commodities cayendo vs bonos = desinflación agresiva. Señal de demanda colapsando, no de desinflación benigna.",
    met: crbFalling,
    value:
      params.crbBondsChange63d != null
        ? `${params.crbBondsChange63d.toFixed(1)}% 63d`
        : "Sin datos",
    chapterRef: "Metodología propia — no cita textual de Murphy",
  });

  // Condición 3: Dólar SUBIENDO (flight-to-quality)
  const dxyRising = params.dxyDirection === "up";
  c.push({
    id: "dollar",
    label: "Dólar en ALZA (Flight-to-Quality)",
    detail:
      "El dólar sube cuando el mundo vende activos de riesgo. USD fuerte + commodities débiles = contracción global.",
    met: dxyRising,
    value:
      params.dxyDirection === "up"
        ? "▲ Subiendo"
        : params.dxyDirection === "down"
          ? "▼ Bajando"
          : "→ Lateral",
    chapterRef: "Metodología propia — no cita textual de Murphy",
  });

  // Condición 4: HYG/LQD CAYENDO (estrés crediticio)
  const hygFalling = params.hyLqdChange63d != null && params.hyLqdChange63d < -3;
  c.push({
    id: "credit",
    label: "Crédito ESTRESADO (HYG/LQD ↓)",
    detail:
      "High yield cayendo vs investment grade = flight-to-quality en crédito. Las empresas riesgosas no consiguen financiamiento.",
    met: hygFalling,
    value: params.hyLqdChange63d != null ? `${params.hyLqdChange63d.toFixed(1)}% 63d` : "Sin datos",
    chapterRef: "Metodología propia — no cita textual de Murphy",
  });

  // Condición 5: Fed AÚN TIGHT (sin recortar, o tasa > 3%)
  const fedTight =
    params.fedCyclePhase === "tightening" ||
    (params.fedCurrentRate != null &&
      params.fedCurrentRate > 3 &&
      params.fedCyclePhase !== "cutting");
  c.push({
    id: "fed",
    label: "Fed AÚN RESTRICTIVA",
    detail:
      "Si la curva está invertida y la Fed aún no recorta (o mantiene tasas > 3%), la política monetaria sigue siendo un lastre para la economía.",
    met: fedTight,
    value:
      params.fedCyclePhase != null
        ? `${params.fedCyclePhase.toUpperCase()} (${params.fedCurrentRate?.toFixed(2) ?? "?"}%)`
        : "Sin datos",
    chapterRef: "Metodología propia — no cita textual de Murphy",
  });

  // Condición 6: Dow Theory con DIVERGENCIA BAJISTA o NO CONFIRMADA
  const dowBearish =
    params.dowTheoryDivergence === "bearish" ||
    (params.dowTheoryConfirmed === false && params.dowTheoryDivergence !== "bullish");
  c.push({
    id: "dow_theory",
    label: "Dow Theory BAJISTA",
    detail:
      "Si industriales y transports no confirman la tendencia, la tendencia NO es válida. Divergencia bajista = señal de venta clásica.",
    met: dowBearish,
    value:
      params.dowTheoryDivergence === "bearish"
        ? "🔴 Divergencia bajista"
        : params.dowTheoryConfirmed === true
          ? "🟢 Confirmada"
          : "⚪ Sin confirmación",
    chapterRef: "Murphy Cap. 4, 5",
  });

  // Cálculo de score
  const metCount = c.filter((cond) => cond.met === true).length;
  const totalCount = c.filter((cond) => cond.met !== null).length;

  let probability: RecessionChecklistResult["probability"];
  let interpretation: string;

  if (metCount >= 5) {
    probability = "inminente";
    interpretation = `⚠️⚠️ ${metCount}/6 condiciones activas — RECESIÓN INMINENTE. Murphy: cuando 5+ condiciones se alinean, la recesión es cuestión de meses. Reducir drásticamente exposición a riesgo.`;
  } else if (metCount >= 4) {
    probability = "alta";
    interpretation = `🔴 ${metCount}/6 condiciones activas — ALTA probabilidad de recesión en 6-12 meses. Postura defensiva: aumentar duration, reducir crédito y cíclicos.`;
  } else if (metCount >= 2) {
    probability = "moderada";
    interpretation = `🟡 ${metCount}/6 condiciones activas — RIESGO MODERADO de recesión. Monitorear condiciones que faltan. Postura neutral con sesgo defensivo.`;
  } else {
    probability = "baja";
    interpretation = `🟢 ${metCount}/6 condiciones activas — BAJA probabilidad de recesión inmediata. Condiciones mayormente saludables. Continuar con asignación por fase de ciclo.`;
  }

  return {
    conditions: c,
    score: metCount,
    probability,
    interpretation,
    metCount,
    totalCount,
  };
}

// ═══════════════════════════════════════════════════════════════════
// PASO 3 — DIAGNÓSTICO DE INFLACIÓN: DEMANDA vs OFERTA (Murphy Cap. 3, 8, 10)
// ═══════════════════════════════════════════════════════════════════
// Murphy distingue DOS tipos de inflación con implicaciones OPUESTAS:
//
//   DEMANDA (Monetaria/Buena):  Cobre↑ Oro→ Petróleo→ DXY↓ HY↑  → Comprar Tech, Cíclicos
//   OFERTA (Costos/Mala):       Oro↑ Cobre→ Petróleo↑ DXY↑ HY↓  → Comprar Energía, Defensivos

export type InflationType = "demanda" | "oferta" | "mixta" | "no_inflacionario" | null;

export interface InflationDiagnosisResult {
  type: InflationType;
  label: string;
  icon: string;
  color: string;
  confidence: "alta" | "media" | "baja";
  description: string;
  signals: {
    copperGoldTrend: TrendArrow;
    goldOilTrend: TrendArrow;
    dxyTrend: TrendArrow;
    hyLqdTrend: TrendArrow;
    xlyXlpTrend: TrendArrow;
  };
  buySectors: string[];
  sellSectors: string[];
  chapterRef: string;
}

/**
 * Diagnostica el tipo de inflación según Murphy.
 *
 * Reglas:
 * 1. Si CRB/Bonds NO está subiendo → no_inflacionario (no aplica)
 * 2. Si Copper/Gold ↑ + Gold/Oil ↓ + DXY ↓ + HY/LQD ↑ → INFLACIÓN DE DEMANDA (BUENA)
 * 3. Si Gold/Oil ↑ + DXY ↑ + HY/LQD ↓ → INFLACIÓN DE OFERTA (MALA)
 * 4. Casos mixtos → mixta
 */
export function diagnoseInflationType(params: {
  crbBondsTrend: TrendArrow; // Si CRB/Bonds sube = régimen inflacionario
  copperGoldTrend: TrendArrow; // Dr. Copper: demanda industrial
  goldOilTrend: TrendArrow; // Oro vs Petróleo: incertidumbre vs demanda
  dxyTrend: TrendArrow; // Dólar: débil (demanda) vs fuerte (oferta)
  hyLqdTrend: TrendArrow; // Crédito: risk-on (demanda) vs risk-off (oferta)
  xlyXlpTrend: TrendArrow; // Consumidor: confiado (demanda) vs cauto (oferta)
}): InflationDiagnosisResult {
  const { crbBondsTrend, copperGoldTrend, goldOilTrend, dxyTrend, hyLqdTrend, xlyXlpTrend } =
    params;

  // Si no hay régimen inflacionario, no aplica
  if (crbBondsTrend !== "up") {
    return {
      type: "no_inflacionario",
      label: "Sin presión inflacionaria",
      icon: "⚪",
      color: "text-muted-foreground",
      confidence: "alta",
      description:
        "CRB/Bonds no está subiendo. No hay régimen inflacionario activo. Este diagnóstico no aplica.",
      signals: { copperGoldTrend, goldOilTrend, dxyTrend, hyLqdTrend, xlyXlpTrend },
      buySectors: [],
      sellSectors: [],
      chapterRef: "Murphy Cap. 3, 8, 10",
    };
  }

  // Contar señales a favor de cada tipo
  let demandaScore = 0;
  let ofertaScore = 0;
  let totalSignals = 0;

  // Copper/Gold ↑ = demanda industrial
  totalSignals++;
  if (copperGoldTrend === "up") demandaScore++;
  else if (copperGoldTrend === "down") ofertaScore++;

  // Gold/Oil ↑ = incertidumbre (oferta)
  totalSignals++;
  if (goldOilTrend === "up") ofertaScore++;
  else if (goldOilTrend === "down") demandaScore++;

  // DXY ↓ = demanda (dólar débil), DXY ↑ = oferta (FTQ)
  totalSignals++;
  if (dxyTrend === "down") demandaScore++;
  else if (dxyTrend === "up") ofertaScore++;

  // HYG/LQD ↑ = risk-on (demanda), ↓ = stress (oferta)
  totalSignals++;
  if (hyLqdTrend === "up") demandaScore++;
  else if (hyLqdTrend === "down") ofertaScore++;

  // XLY/XLP ↑ = consumidor confiado (demanda)
  totalSignals++;
  if (xlyXlpTrend === "up") demandaScore++;
  else if (xlyXlpTrend === "down") ofertaScore++;

  // Determinar tipo
  let type: InflationType;
  let confidence: InflationDiagnosisResult["confidence"];
  const ratio = totalSignals > 0 ? Math.abs(demandaScore - ofertaScore) / totalSignals : 0;

  if (demandaScore >= 4 && ofertaScore <= 1) {
    type = "demanda";
    confidence = "alta";
  } else if (ofertaScore >= 4 && demandaScore <= 1) {
    type = "oferta";
    confidence = "alta";
  } else if (demandaScore >= ofertaScore + 1) {
    type = "demanda";
    confidence = ratio >= 0.4 ? "media" : "baja";
  } else if (ofertaScore >= demandaScore + 1) {
    type = "oferta";
    confidence = ratio >= 0.4 ? "media" : "baja";
  } else {
    type = "mixta";
    confidence = "baja";
  }

  // Labels y sectores
  let label: string;
  let icon: string;
  let color: string;
  let description: string;
  let buySectors: string[];
  let sellSectors: string[];

  if (type === "demanda") {
    label = `Inflación de DEMANDA ${confidence === "alta" ? "✅" : "⚠️"}`;
    icon = "🟢";
    color = "text-green-400";
    description =
      confidence === "alta"
        ? `Copper/Gold ↑ (${copperGoldTrend === "up" ? "✅" : "❌"}) — DXY ↓ (${dxyTrend === "down" ? "✅" : "❌"}) — HYG/LQD ↑ (${hyLqdTrend === "up" ? "✅" : "❌"}). La inflación es por CRECIMIENTO real. El cobre sube porque la industria demanda. Es el mejor escenario: expande márgenes corporativos.`
        : `Señales mayormente de demanda pero con algunas contradicciones. ${demandaScore}/${totalSignals} señales a favor de demanda. Monitorear evolución.`;
    buySectors = [
      "XLK (Tecnología) — innovación y crecimiento",
      "XLY (Cons. Discrecional) — consumidor confiado",
      "XLI (Industrial) — demanda industrial",
      "XLB (Materiales) — materias primas",
      "IWM (Small Caps) — economía doméstica",
      "XLF (Finanzas) — expansión de crédito",
    ];
    sellSectors = [
      "XLP (Cons. Básico) — no necesita refugio",
      "XLU (Utilities) — no necesita refugio",
      "TLT (Bonos largos) — yields suben con crecimiento",
      "GLD (Oro) — no hay incertidumbre",
    ];
  } else if (type === "oferta") {
    label = `Inflación de OFERTA ${confidence === "alta" ? "⚠️" : "⚠️"}`;
    icon = "🔴";
    color = "text-red-400";
    description =
      confidence === "alta"
        ? `Gold/Oil ↑ (${goldOilTrend === "up" ? "✅" : "❌"}) — DXY ↑ (${dxyTrend === "up" ? "✅" : "❌"}) — HYG/LQD ↓ (${hyLqdTrend === "down" ? "✅" : "❌"}). La inflación es por RESTRICCIÓN de oferta o incertidumbre geopolítica. El oro sube por miedo, no por demanda industrial. ES MALO para equities.`
        : `Señales mayormente de oferta pero con algunas contradicciones. ${ofertaScore}/${totalSignals} señales a favor de oferta. Monitorear evolución.`;
    buySectors = [
      "XLE (Energía) — petróleo, gas, combustibles",
      "GLD (Oro) — cobertura geopolítica",
      "XLP (Cons. Básico) — defensivo",
      "XLU (Utilities) — defensivo",
      "XLV (Salud) — defensivo",
      "BIL / SGOV (T-bills) — cash",
    ];
    sellSectors = [
      "XLK (Tecnología) — compresión de márgenes",
      "XLY (Cons. Discrecional) — consumidor golpeado",
      "XLI (Industrial) — costos de insumos suben",
      "IWM (Small Caps) — más sensibles a costos",
      "HYG (High Yield) — estrés crediticio",
    ];
  } else if (type === "mixta") {
    label = "Inflación MIXTA — señales contradictorias";
    icon = "🟡";
    color = "text-amber-400";
    description = `Demanda: ${demandaScore}/${totalSignals} | Oferta: ${ofertaScore}/${totalSignals}. Las señales están divididas. Reducir tamaño de posiciones y esperar confirmación direccional.`;
    buySectors = [
      "XLE (Energía) — funciona en ambos escenarios",
      "GLD (Oro) — funciona en ambos escenarios",
      "Cash parcial (BIL/SGOV)",
    ];
    sellSectors = [
      "HYG (High Yield) — riesgo en ambos escenarios",
      "IWM (Small Caps) — riesgo en ambos escenarios",
    ];
  } else {
    label = "Sin presión inflacionaria";
    icon = "⚪";
    color = "text-muted-foreground";
    description = "No hay régimen inflacionario activo.";
    buySectors = [];
    sellSectors = [];
  }

  return {
    type,
    label,
    icon,
    color,
    confidence,
    description,
    signals: { copperGoldTrend, goldOilTrend, dxyTrend, hyLqdTrend, xlyXlpTrend },
    buySectors,
    sellSectors,
    chapterRef: "Murphy Cap. 3, 8, 10",
  };
}

// ═══════════════════════════════════════════════════════════════════
// PASO 4 — CASCADA INTERMARKET (DXY → CRB → TLT → SPY)
// ═══════════════════════════════════════════════════════════════════
// Murphy (Cap. 6): El orden de líderes DEBE ser:
//   DXY (dólar) → CRB (commodities) → TLT (bonos) → SPY (acciones)
// Si el orden se rompe, el régimen es anómalo y el modelo no aplica.

export interface CascadeLink {
  from: string; // Activo líder esperado
  to: string; // Activo seguidor esperado
  leader: string | null; // Quién lidera realmente (del lag analysis)
  lagDays: number | null; // Días de lag
  correlation: number | null;
  intact: boolean; // true si el líder esperado es el que lidera
  label: string; // Descripción Murphy
}

export interface MurphyCascadeResult {
  links: CascadeLink[];
  totalLinks: number;
  intactLinks: number;
  cascadeIntact: boolean; // Todas las links intactas
  cascadeHealth: "intacta" | "parcial" | "rota" | "sin_datos";
  mainBreakPoint: string | null; // Dónde se rompe la cadena
  interpretation: string;
}

/**
 * Valida la cascada de liderazgo de Murphy (Cap. 6).
 *
 * La cascada NORMAL debe ser:
 *   DXY → DBC (dólar lidera commodities)
 *   DBC → TLT (commodities lideran bonos)
 *   TLT → SPY (bonos lideran acciones)
 *
 * Si DXY no lidera DBC → régimen potencialmente inflacionario atípico.
 * Si DBC no lidera TLT → la inflación no está transmitiéndose a tasas.
 * Si TLT no lidera SPY → el mercado no cree en la señal de bonos.
 */
export function validateMurphyCascade(params: {
  // Lead-lag pairs (from context.leadLag)
  dxyDbc: { leader: string | null; lagDays: number | null; correlation: number | null } | null;
  dbcSpy: { leader: string | null; lagDays: number | null; correlation: number | null } | null;
  tltSpy: { leader: string | null; lagDays: number | null; correlation: number | null } | null;
  // Fallback: directions cuando no hay lead-lag
  dxyDirection: TrendArrow;
  dbcDirection: TrendArrow;
  tltDirection: TrendArrow;
  spyDirection: TrendArrow;
}): MurphyCascadeResult {
  const links: CascadeLink[] = [];
  let intactCount = 0;
  let totalWithData = 0;

  // ─── Link 1: DXY → DBC ─────────────────────────────────────
  const l1Leader = params.dxyDbc?.leader ?? null;
  const l1Intact =
    l1Leader === "DXY" ||
    (l1Leader == null && params.dxyDirection != null && params.dbcDirection != null);
  if (l1Leader != null) totalWithData++;
  if (l1Intact) intactCount++;

  links.push({
    from: "DXY",
    to: "DBC",
    leader: l1Leader ?? (l1Intact ? (params.dxyDirection === "up" ? "DXY" : "Sincrónico") : "DBC"),
    lagDays: params.dxyDbc?.lagDays ?? null,
    correlation: params.dxyDbc?.correlation ?? null,
    intact: l1Intact,
    label:
      "Dólar lidera Commodities: el dólar fuerte ABARATA las materias primas (cotizadas en USD). Relación INVERSA clásica. Murphy: 'El dólar es el líder más temprano del ciclo.'",
  });

  // ─── Link 2: DBC → TLT ─────────────────────────────────────
  // El lead-lag de DBC→TLT no está precomputado en context.leadLag.
  // Inferimos: si DBC sube → inflación → TLT baja (yields suben).
  // Relación esperada: DBC lidera TLT con lag de 1-3 meses.
  const dbcUp = params.dbcDirection === "up";
  const tltDown = params.tltDirection === "down";
  const dbcTltIntact = dbcUp === tltDown; // Sube DBC → Baja TLT es la relación esperada

  // Intentar inferir líder:
  let dbcTltLeader: string | null = null;
  if (dbcUp && tltDown) dbcTltLeader = "DBC (inf.)";
  else if (!dbcUp && !tltDown && params.dbcDirection != null && params.tltDirection != null)
    dbcTltLeader = "Sincrónico";
  else if (params.dbcDirection != null && params.tltDirection != null)
    dbcTltLeader = "TLT (contra)";

  links.push({
    from: "DBC",
    to: "TLT",
    leader: dbcTltLeader,
    lagDays: null, // No computado aún — mejora futura
    correlation: null,
    intact: dbcTltIntact,
    label:
      "Commodities lideran Bonos: cuando DBC sube, la inflación esperada sube → TLT baja (yields suben). Murphy: 'El índice CRB es líder de tasas por 1-3 meses.'",
  });

  // ─── Link 3: TLT → SPY ─────────────────────────────────────
  const l3Leader = params.tltSpy?.leader ?? null;
  const l3Intact =
    l3Leader === "TLT" ||
    (l3Leader == null && params.tltDirection != null && params.spyDirection != null);
  if (l3Leader != null) totalWithData++;

  // Si no hay lider claro, verificar relación esperada:
  // Normalmente TLT y SPY se mueven en la MISMA dirección (positiva).
  // Pero en regímenes anómalos (deflación), TLT sube mientras SPY baja.
  const tltSpyIntactFinal = l3Intact;
  if (l3Intact) intactCount++;

  links.push({
    from: "TLT",
    to: "SPY",
    leader:
      l3Leader ??
      (params.tltDirection != null && params.spyDirection != null
        ? params.tltDirection === params.spyDirection
          ? "Sincrónico"
          : "Ver nota"
        : null),
    lagDays: params.tltSpy?.lagDays ?? null,
    correlation: params.tltSpy?.correlation ?? null,
    intact: tltSpyIntactFinal,
    label:
      "Bonos lideran Acciones: TLT baja (yields suben) → SPY eventualmente corrige. Murphy: 'Los bonos anticipan a las acciones por 1-6 meses.'",
  });

  // ─── Determinar salud de la cascada ────────────────────────
  const healthScore = totalWithData > 0 ? intactCount / totalWithData : 0;
  const breakPointIndex = links.findIndex((l) => !l.intact);

  let cascadeHealth: MurphyCascadeResult["cascadeHealth"];
  let interpretation: string;

  if (totalWithData === 0) {
    cascadeHealth = "sin_datos";
    interpretation =
      "No hay datos suficientes de lead-lag para validar la cascada. Usar direcciones como aproximación.";
  } else if (healthScore === 1) {
    cascadeHealth = "intacta";
    interpretation = `✅ Cascada MURPHY INTACTA (${intactCount}/${totalWithData} links). DXY → DBC → TLT → SPY funcionando en orden. El modelo intermarket es válido.`;
  } else if (healthScore >= 0.5) {
    cascadeHealth = "parcial";
    const broken = links
      .filter((l) => !l.intact)
      .map((l) => `${l.from}→${l.to}`)
      .join(", ");
    interpretation = `🟡 Cascada PARCIALMENTE ROTA en: ${broken}. El régimen tiene componentes anómalos. Algunas relaciones Murphy no se cumplen.`;
  } else {
    cascadeHealth = "rota";
    interpretation = `🔴 Cascada MURPHY ROTA (${intactCount}/${totalWithData} intactas). El orden líder tradicional no se cumple. Régimen ANÓMALO — las reglas normales de intermarket pueden no aplicar.`;
  }

  return {
    links,
    totalLinks: 3,
    intactLinks: intactCount,
    cascadeIntact: healthScore === 1,
    cascadeHealth,
    mainBreakPoint:
      breakPointIndex >= 0 ? `${links[breakPointIndex].from} → ${links[breakPointIndex].to}` : null,
    interpretation,
  };
}
