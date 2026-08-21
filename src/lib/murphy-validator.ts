// ─── Murphy Validator — 25+ validaciones contra los 15 capítulos de John Murphy ───
// Módulo puro: sin fetching, sin side effects. Recibe datos estructurados y produce
// un reporte capítulo-por-capítulo con scoring, señales e interpretaciones.
// ─────────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS DE ENTRADA — datos puros que necesita el validador
// ═══════════════════════════════════════════════════════════════════════════════

export interface RatioData {
  value: number | null;
  changePct1m: number | null;
  changePct3m: number | null;
  changePct6m: number | null;
  trend: "rising" | "falling" | "flat" | null;
}

export interface BondStockRelationData {
  tltReturn1m: number | null;
  tltReturn3m: number | null;
  spyReturn1m: number | null;
  spyReturn3m: number | null;
  correlacion60d: number | null;
  correlacion250d: number | null;
}

export interface YieldCurveData {
  spread10y2y: number | null;
  spread10y3m: number | null;
  inverted: boolean | null; // true = curva invertida (10Y-2Y < 0)
  steepness: "steepening" | "flattening" | "inverted" | "normal" | null;
  longTermAvg10y2y: number | null; // promedio histórico para contexto
}

export interface DowTheoryData {
  industrialsReturn: number | null; // % cambio 2m
  transportsReturn: number | null;
  industrialsTrend: "up" | "down" | "flat" | null;
  transportsTrend: "up" | "down" | "flat" | null;
  confirmed: boolean | null;
  divergence: "bullish" | "bearish" | null;
}

export interface DollarData {
  dxyReturn1m: number | null;
  dxyReturn3m: number | null;
  dxyTrend: "rising" | "falling" | "flat" | null;
}

export interface SectorRotationData {
  technologyReturn3m: number | null; // XLK
  financialsReturn3m: number | null; // XLF
  energyReturn3m: number | null; // XLE
  materialsReturn3m: number | null; // XLB
  utilitiesReturn3m: number | null; // XLU
  consumerCyclical3m: number | null; // XLY
  consumerDefensive3m: number | null; // XLP
  healthcareReturn3m: number | null; // XLV
  realEstateReturn3m: number | null; // XLRE
}

export interface InternationalData {
  efaReturn1m: number | null;
  eemReturn1m: number | null;
  efaReturn3m: number | null;
  eemReturn3m: number | null;
  efaEemRatio: number | null;
}

export interface CreditMarketData {
  hygReturn1m: number | null;
  lqdReturn1m: number | null;
  hygLqdRatio: number | null;
  hygLqdTrend: "rising" | "falling" | "flat" | null;
}

export interface CycleStageData {
  bondsReturn42d: number | null;
  stocksReturn42d: number | null;
  commoditiesReturn42d: number | null;
  bondsTrend42d: "up" | "down" | "flat" | null;
  stocksTrend42d: "up" | "down" | "flat" | null;
  commoditiesTrend42d: "up" | "down" | "flat" | null;
  detectedStage: 1 | 2 | 3 | 4 | 5 | 6 | null;
  stageConfidence: "alta" | "media" | "baja" | null;
}

export interface LeadLagData {
  dollarLeadsCommodities: string | null; // "DXY" | "DBC" | "Sincrónico" | null
  bondsLeadStocks: string | null; // "TLT" | "SPY" | "Sincrónico" | null
  commoditiesLeadStocks: string | null; // "DBC" | "SPY" | "Sincrónico" | null
  copperLeadIndustrials: string | null;
}

export interface FedMonetaryData {
  currentRate: number | null;
  cyclePhase: "tightening" | "cutting" | "pause" | "neutral" | null;
  fedVsSpread10y3m: number | null; // Fed rate minus 10Y-3M spread
  fedAbove10y3m: boolean | null;
}

export interface MurphyValidationData {
  // Cap 1: Commodities → Bonds
  crbBonds: RatioData;
  // Cap 2: Commodities → Stocks
  commoditiesStocks: RatioData;
  // Cap 3: Bonds → Stocks
  bondsStocks: BondStockRelationData;
  // Cap 4: Dollar → Commodities
  goldOil: RatioData;
  copperGold: RatioData;
  dollar: DollarData;
  crbData: { value: number | null; return1m: number | null; return3m: number | null };
  // Cap 4/7b: Oil vs Oil Shares divergence (Murphy p.29, 71-72)
  oilVsOilShares: {
    oilReturn1m: number | null;
    oilSharesReturn1m: number | null;
    divergence: "bullish" | "bearish" | null;
  };
  // Cap 5: Dow Theory
  dowTheory: DowTheoryData;
  // Cap 6: Consumer Cyclical vs Defensive
  xlyXlp: RatioData;
  // Cap 8: Yield Curve
  yieldCurve: YieldCurveData;
  // Cap 9: International
  international: InternationalData;
  // Cap 9b: Japan leading (EWJ/SPY) — Murphy p.84-87
  ewjSpy: RatioData;
  // Cap 10: Sector Rotation
  sectorRotation: SectorRotationData;
  // Cap 10b: Gold stocks confirmation (GDX/GLD) — Murphy p.125-127
  gdxGld: RatioData;
  // Cap 11: Growth vs Value
  growthValue: RatioData;
  iwmSpy: RatioData; // Small vs Large (also Cap 10)
  ndxSpx: RatioData; // Tech vs Market
  // Cap 12: Credit Markets
  creditMarket: CreditMarketData;
  // Cap 13: Monetary Policy
  fedMonetary: FedMonetaryData;
  // Cap 14: Inverted Yield Curve
  yieldCurveInversion: YieldCurveData; // same shape as yieldCurve, can share
  // Cap 15: Complete Cycle
  cycleStage: CycleStageData;
  // Lead-lag (cross-chapter)
  leadLag: LeadLagData;
  // Historical context
  sp500OneYearReturn: number | null;
  vixLevel: number | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS DE RESULTADO
// ═══════════════════════════════════════════════════════════════════════════════

export type ValidationSignal = "bullish" | "bearish" | "neutral" | "warning";
export type ConfidenceLevel = "alta" | "media" | "baja";

export interface ValidationResult {
  ruleId: string;
  chapter: number; // 1-15
  passed: boolean;
  signal: ValidationSignal;
  score: number; // -1 .. +1 (negativo = bajista, positivo = alcista)
  confianza: ConfidenceLevel;
  detalle: string;
  evidencia: string; // qué datos concretos sustentan la validación
  murphyReference: string; // referencia al capítulo/sección del libro
}

export interface ChapterSummary {
  chapter: number;
  title: string;
  rulesCount: number;
  passedCount: number;
  compositeScore: number; // -1 .. +1
  signal: ValidationSignal;
  confianza: ConfidenceLevel;
  reglaClave: string; // la regla más importante del capítulo
}

export interface MurphyReport {
  generatedAt: string;
  totalRules: number;
  totalPassed: number;
  overallScore: number; // -1 .. +1
  overallSignal: ValidationSignal;
  overallConfianza: ConfidenceLevel;
  chapters: ChapterSummary[];
  rules: ValidationResult[];
  divergencias: string[]; // contradicciones detectadas entre capítulos
  resumenEjecutivo: string;
  sectoresFavorecidos: string[];
  sectoresEvitar: string[];
  detectedStage: number | null; // etapa del ciclo detectada (1-6)
}

// ═══════════════════════════════════════════════════════════════════════════════
// UTILIDADES INTERNAS
// ═══════════════════════════════════════════════════════════════════════════════

function trendToSignal(
  trend: "rising" | "falling" | "flat" | null,
  bullish: "rising" | "falling",
): ValidationSignal {
  if (trend === null) return "neutral";
  if (trend === bullish) return "bullish";
  if (trend === "flat") return "neutral";
  return "bearish";
}

function trendStrictToSignal(
  trend: "up" | "down" | "flat" | null,
  bullish: "up" | "down",
): ValidationSignal {
  if (trend === null) return "neutral";
  if (trend === bullish) return "bullish";
  if (trend === "flat") return "neutral";
  return "bearish";
}

function scoreFromChange(pct: number | null, threshold: number = 1.5): number {
  if (pct == null) return 0;
  if (pct > threshold) return 1;
  if (pct < -threshold) return -1;
  return Math.round((pct / threshold) * 10) / 10;
}

function confidenceFromAbs(pct: number | null): ConfidenceLevel {
  if (pct == null) return "baja";
  const abs = Math.abs(pct);
  if (abs > 5) return "alta";
  if (abs > 2) return "media";
  return "baja";
}

function isStrongTrend(changePct: number | null, minAbs: number = 2): boolean {
  return changePct != null && Math.abs(changePct) >= minAbs;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 1 — Commodities → Bonos (CRB/Bonds Ratio)
// Regla: CRB sube → Bonos caen (inflación/growth). CRB cae → Bonos suben (desinflación/fear).
// ═══════════════════════════════════════════════════════════════════════════════

const CAP1_TITLE = "Cap. 1 — Commodities Lideran Bonos";

function validateCap1Rule1(crbBonds: RatioData): ValidationResult {
  // CRB/Bonds ratio trending up = commodities outperforming bonds = inflationary
  const signal = trendToSignal(crbBonds.trend, "rising");
  const passed = signal !== "neutral";
  return {
    ruleId: "C1-R1",
    chapter: 1,
    passed,
    signal,
    score: scoreFromChange(crbBonds.changePct3m, 3),
    confianza: confidenceFromAbs(crbBonds.changePct3m),
    detalle:
      crbBonds.trend === "rising"
        ? "CRB/Bonds en alza: commodities superan a bonos. Señal inflacionaria o de crecimiento fuerte. Rotar a Energy, Materials."
        : crbBonds.trend === "falling"
          ? "CRB/Bonds en baja: bonos superan a commodities. Señal desinflacionaria o flight-to-quality. Rotar a Utilities, Consumer Defensive."
          : "CRB/Bonds sin tendencia clara.",
    evidencia: `Ratio CRB/Bonds cambio 3m: ${crbBonds.changePct3m?.toFixed(2) ?? "N/A"}%, tendencia: ${crbBonds.trend ?? "N/A"}`,
    murphyReference:
      "Murphy Cap. 1: 'Commodity prices lead bond prices by several months. A rising CRB signals inflation ahead, which is negative for bonds.'",
  };
}

function validateCap1Rule2(crbBonds: RatioData): ValidationResult {
  // CRB itself rising → bonds falling (inverse relationship)
  const commoditiesRising = crbBonds.changePct3m != null && crbBonds.changePct3m > 2;
  const bondsShouldUnderperform = crbBonds.changePct3m != null && crbBonds.changePct3m > 2;
  const passed = commoditiesRising !== bondsShouldUnderperform; // always true when data is coherent
  const signal: ValidationSignal = commoditiesRising ? "bearish" : "bullish";
  return {
    ruleId: "C1-R2",
    chapter: 1,
    passed,
    signal,
    score: scoreFromChange(crbBonds.changePct1m, 2),
    confianza: confidenceFromAbs(crbBonds.changePct1m),
    detalle: commoditiesRising
      ? "Commodities subiendo fuerte → presión inflacionaria. Bonos deberían bajar (yields subir)."
      : "Commodities sin presión inflacionaria significativa. Bonos en zona cómoda.",
    evidencia: `CRB cambio 3m: ${crbBonds.changePct3m?.toFixed(2) ?? "N/A"}%. Relación inversa CRB→Bonos es la señal más temprana del ciclo.`,
    murphyReference:
      "Murphy Cap. 1: 'The commodity/bond ratio is the single most important intermarket relationship. It is the earliest indicator of inflationary/deflationary trends.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 2 — Commodities → Stocks (CRB/SPY Ratio)
// Regla: CRB supera a SPY = régimen inflacionario (malo para stocks growth).
//        SPY supera a CRB = régimen de crecimiento real (bueno para stocks).
// ═══════════════════════════════════════════════════════════════════════════════

const CAP2_TITLE = "Cap. 2 — Commodities y Stocks";

function validateCap2Rule1(commoditiesStocks: RatioData): ValidationResult {
  const signal = trendToSignal(commoditiesStocks.trend, "falling");
  const passed = signal !== "neutral";
  return {
    ruleId: "C2-R1",
    chapter: 2,
    passed,
    signal,
    score: -scoreFromChange(commoditiesStocks.changePct3m, 3), // inverted: falling = bullish for stocks
    confianza: confidenceFromAbs(commoditiesStocks.changePct3m),
    detalle:
      commoditiesStocks.trend === "falling"
        ? "Commodities/Stocks en baja: stocks superan a commodities. Régimen de crecimiento real. Favorecer Technology, Consumer Cyclical."
        : commoditiesStocks.trend === "rising"
          ? "Commodities/Stocks en alza: commodities superan a stocks. Régimen inflacionario. Favorecer Energy, Materials."
          : "Commodities/Stocks sin dirección clara.",
    evidencia: `Ratio Commodities/Stocks cambio 3m: ${commoditiesStocks.changePct3m?.toFixed(2) ?? "N/A"}%`,
    murphyReference:
      "Murphy Cap. 2: 'When commodities outperform stocks, it signals an inflationary environment that is bearish for stocks. When stocks outperform commodities, it signals real economic growth.'",
  };
}

function validateCap2Rule2(commoditiesStocks: RatioData): ValidationResult {
  // Commodities lead stocks by 2-4 months (via rising input costs → margin compression)
  const commRisingFast = commoditiesStocks.changePct6m != null && commoditiesStocks.changePct6m > 5;
  const signal: ValidationSignal = commRisingFast ? "bearish" : "bullish";
  return {
    ruleId: "C2-R2",
    chapter: 2,
    passed: commRisingFast
      ? commoditiesStocks.changePct1m != null && commoditiesStocks.changePct1m < 0
      : true,
    signal,
    score: commRisingFast ? -0.5 : 0.3,
    confianza: commRisingFast ? "media" : "baja",
    detalle: commRisingFast
      ? "Commodities subiendo +6m sostenido → presión sobre márgenes corporativos. Mercerados de stocks en riesgo a 2-4 meses vista."
      : "Commodities sin presión extrema. Márgenes corporativos no amenazados por inputs.",
    evidencia: `Commodities/Stocks cambio 6m: ${commoditiesStocks.changePct6m?.toFixed(2) ?? "N/A"}%. Murphy: CRB lidera SPY por 2-4 meses.`,
    murphyReference:
      "Murphy Cap. 2: 'A sustained rise in commodity prices eventually hurts corporate profits and stock prices, typically with a 2-4 month lag.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 3 — Bonos → Stocks (Bonds/Stocks Relationship)
// Regla: Normalmente relación inversa. Cuando se mueven juntos = régimen monetario.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP3_TITLE = "Cap. 3 — Bonos y Stocks";

function validateCap3Rule1(bondsStocks: BondStockRelationData): ValidationResult {
  const risingTogether = (bondsStocks.tltReturn1m ?? 0) > 0 && (bondsStocks.spyReturn1m ?? 0) > 0;
  const fallingTogether = (bondsStocks.tltReturn1m ?? 0) < 0 && (bondsStocks.spyReturn1m ?? 0) < 0;
  const inverse = (bondsStocks.tltReturn1m ?? 0) > 0 !== (bondsStocks.spyReturn1m ?? 0) > 0;

  let signal: ValidationSignal = "neutral";
  let detalle = "";
  if (inverse && (bondsStocks.correlacion60d ?? 0) < -0.3) {
    signal = "bullish"; // normal regime
    detalle =
      "Bonos y acciones en relación inversa clásica (correlación negativa). Régimen normal de mercado. Señales intermarket confiables.";
  } else if (risingTogether) {
    signal = (bondsStocks.correlacion60d ?? 0) > 0 ? "bullish" : "neutral";
    detalle =
      (bondsStocks.correlacion60d ?? 0) > 0.3
        ? "Bonos y acciones subiendo JUNTOS con correlación positiva → Expansión monetaria / bajada de tasas. Régimen de liquidez."
        : "Bonos y acciones subiendo sin correlación fuerte.";
  } else if (fallingTogether) {
    signal = (bondsStocks.correlacion60d ?? 0) > 0 ? "bearish" : "neutral";
    detalle =
      (bondsStocks.correlacion60d ?? 0) > 0.3
        ? "Bonos y acciones cayendo JUNTOS → Estrés de liquidez o contracción monetaria. Cash es king."
        : "Bonos y acciones cayendo sin correlación fuerte.";
  } else {
    signal = "neutral";
    detalle = "Relación sin señal clara en el periodo actual.";
  }

  const score = signal === "bullish" ? 0.5 : signal === "bearish" ? -0.5 : 0;
  return {
    ruleId: "C3-R1",
    chapter: 3,
    passed: true,
    signal,
    score,
    confianza: Math.abs(bondsStocks.correlacion60d ?? 0) > 0.3 ? "alta" : "media",
    detalle,
    evidencia: `Correlación 60d: ${(bondsStocks.correlacion60d ?? 0).toFixed(3)}. TLT 1m: ${(bondsStocks.tltReturn1m ?? 0).toFixed(2)}%, SPY 1m: ${(bondsStocks.spyReturn1m ?? 0).toFixed(2)}%`,
    murphyReference:
      "Murphy Cap. 3: 'Bonds and stocks normally move in opposite directions. When they move together, it signals a monetary regime change.'",
  };
}

function validateCap3Rule2(bondsStocks: BondStockRelationData): ValidationResult {
  // Bonds lead stocks at major turning points
  const tltLead6m = bondsStocks.tltReturn3m ?? 0;
  const spyLead6m = bondsStocks.spyReturn3m ?? 0;
  const bondsTurnedFirst = Math.sign(tltLead6m) !== Math.sign(spyLead6m);
  const signal: ValidationSignal = bondsTurnedFirst ? "warning" : "neutral";
  return {
    ruleId: "C3-R2",
    chapter: 3,
    passed: bondsTurnedFirst,
    signal,
    score: bondsTurnedFirst ? -0.3 : 0.2,
    confianza: "media",
    detalle: bondsTurnedFirst
      ? "⚠️ Bonos y stocks divergen en tendencia a 3m. Posible giro importante. Bonos suelen adelantarse 2-6 meses a las acciones en puntos de inflexión."
      : "Bonos y stocks alineados direccionalmente. Sin divergencia en puntos de giro.",
    evidencia: `TLT 3m: ${(tltLead6m * 100).toFixed(2)}%, SPY 3m: ${(spyLead6m * 100).toFixed(2)}%. Divergencia: ${bondsTurnedFirst}`,
    murphyReference:
      "Murphy Cap. 7: 'Bonds lead stocks at major market turning points by 2-6 months.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 4 — Dólar → Commodities (Inverse Relationship)
// Regla: USD fuerte → Commodities débiles. USD débil → Commodities fuertes.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP4_TITLE = "Cap. 4 — El Dólar y las Commodities";

function validateCap4Rule1(
  dollar: DollarData,
  crbData: { value: number | null; return1m: number | null; return3m: number | null },
): ValidationResult {
  const dxyUp = (dollar.dxyReturn1m ?? 0) > 1;
  const dxyDown = (dollar.dxyReturn1m ?? 0) < -1;
  const crbUp = (crbData.return1m ?? 0) > 1;
  const crbDown = (crbData.return1m ?? 0) < -1;
  const inverseConfirmed = (dxyUp && crbDown) || (dxyDown && crbUp);
  const sameDirection = (dxyUp && crbUp) || (dxyDown && crbDown);

  let signal: ValidationSignal = "neutral";
  let detalle = "";
  let score = 0;
  if (inverseConfirmed) {
    signal = "bullish";
    score = 0.7;
    detalle =
      "Relación inversa Dólar/Commodities CONFIRMADA. USD y commodities moviéndose en direcciones opuestas. Mecanismo clásico funcionando.";
  } else if (sameDirection) {
    signal = "warning";
    score = -0.5;
    detalle =
      "⚠️ Dólar y commodities moviéndose en la MISMA dirección. Anomalía intermarket. Posible intervención, crisis o régimen atípico.";
  } else {
    signal = "neutral";
    score = 0;
    detalle = "Dólar y commodities sin movimiento direccional claro en el periodo.";
  }

  return {
    ruleId: "C4-R1",
    chapter: 4,
    passed: inverseConfirmed,
    signal,
    score,
    confianza: inverseConfirmed ? "alta" : sameDirection ? "alta" : "baja",
    detalle,
    evidencia: `DXY 1m: ${(dollar.dxyReturn1m ?? 0).toFixed(2)}%, CRB 1m: ${(crbData.return1m ?? 0).toFixed(2)}%. Inversa: ${inverseConfirmed}.`,
    murphyReference:
      "Murphy Cap. 4: 'A rising dollar is bearish for commodities; a falling dollar is bullish. This is the most consistent intermarket relationship.'",
  };
}

function validateCap4Rule2(
  goldOil: RatioData,
  copperGold: RatioData,
  oilVsOilShares?: {
    oilReturn1m: number | null;
    oilSharesReturn1m: number | null;
    divergence: "bullish" | "bearish" | null;
  },
): ValidationResult {
  // Gold/Oil ratio: gold rising vs oil shows inflation type (geopolitical fear vs demand)
  // Copper/Gold: copper rising = industrial demand growth
  // Oil vs Oil Shares: Murphy p.29, 71-72 — if oil rises but oil shares don't follow → bearish divergence
  const goldOilTrend = goldOil.trend;
  const copperGoldTrend = copperGold.trend;
  let signal: ValidationSignal = "neutral";
  let detalle = "";
  let score = 0;

  if (goldOilTrend === "rising") {
    signal = "bearish"; // gold beating oil = fear/uncertainty
    score = -0.4;
    detalle =
      "Gold/Oil en alza: oro supera al petróleo. Inflación de incertidumbre/geopolítica (no de demanda). Refugio en defensivos.";
  } else if (goldOilTrend === "falling") {
    signal = "bullish";
    score = 0.4;
    detalle =
      "Gold/Oil en baja: petróleo supera al oro. Inflación de demanda genuina. Crecimiento real. Favorecer Energy, Industrials.";
  }

  if (copperGoldTrend === "rising") {
    signal = signal === "bearish" ? "neutral" : "bullish";
    score += 0.3;
    detalle +=
      " | Copper/Gold en alza: Dr. Copper confirma demanda industrial. Señal de expansión.";
  } else if (copperGoldTrend === "falling") {
    score -= 0.3;
    detalle += " | Copper/Gold en baja: Dr. Copper señala desaceleración industrial.";
  }

  // Oil vs Oil Shares divergence (Murphy p.29, 71-72)
  if (oilVsOilShares) {
    const o = oilVsOilShares.oilReturn1m;
    const s = oilVsOilShares.oilSharesReturn1m;
    if (o != null && s != null && o > 3 && s < 1) {
      signal = "bearish";
      score -= 0.5;
      detalle +=
        " | ⚠️ DIVERGENCIA OIL vs OIL SHARES: petróleo sube (" +
        o.toFixed(1) +
        "%) pero XLE no confirma (" +
        s.toFixed(1) +
        "%). Murphy: señal de venta para Energy.";
    } else if (o != null && s != null && o > 2 && s > 2) {
      signal = signal === "bearish" ? "neutral" : "bullish";
      score += 0.2;
      detalle += " | Oil y Oil Shares alineados: suben juntos. Rally energético confirmado.";
    }
  }

  return {
    ruleId: "C4-R2",
    chapter: 4,
    passed: true,
    signal,
    score: Math.max(-1, Math.min(1, score)),
    confianza: Math.abs(score) > 0.5 ? "alta" : "media",
    detalle,
    evidencia: `Gold/Oil trend: ${goldOilTrend ?? "N/A"}. Copper/Gold trend: ${copperGoldTrend ?? "N/A"}. Oil 1m: ${(oilVsOilShares?.oilReturn1m ?? 0).toFixed(1)}%, XLE 1m: ${(oilVsOilShares?.oilSharesReturn1m ?? 0).toFixed(1)}%.`,
    murphyReference:
      "Murphy Cap. 4, 10 & p.29, 71-72: 'Gold/Oil ratio reveals inflation type. Copper/Gold = Dr. Copper. Oil vs Oil Shares divergence is a major bearish signal.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 5 — Dow Theory (Industriales y Transportes)
// Regla: Ambos deben moverse en la misma dirección para confirmar tendencia.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP5_TITLE = "Cap. 5 — Dow Theory";

function validateCap5Rule1(dowTheory: DowTheoryData): ValidationResult {
  const confirmed = dowTheory.confirmed === true;
  const diverging = dowTheory.divergence != null;
  const signal: ValidationSignal = confirmed ? "bullish" : diverging ? "warning" : "neutral";
  const trendUp = dowTheory.industrialsTrend === "up";
  const trendDown = dowTheory.industrialsTrend === "down";
  const score = confirmed ? (trendUp ? 0.8 : trendDown ? -0.8 : 0) : diverging ? -0.5 : 0;
  return {
    ruleId: "C5-R1",
    chapter: 5,
    passed: confirmed || diverging, // always signals something
    signal,
    score,
    confianza: confirmed ? "alta" : diverging ? "alta" : "baja",
    detalle: confirmed
      ? `Dow Theory CONFIRMADA — ambos índices en tendencia ${dowTheory.industrialsTrend}. La tendencia actual está validada.`
      : dowTheory.divergence === "bearish"
        ? `⚠️ Dow Theory con DIVERGENCIA BAJISTA. Industriales (^DJI) en ${dowTheory.industrialsTrend} pero Transportes (^DJT) no confirman. Señal clásica de debilidad inminente.`
        : dowTheory.divergence === "bullish"
          ? `⚠️ Dow Theory con DIVERGENCIA ALCISTA. Industriales (^DJI) en ${dowTheory.industrialsTrend} pero Transportes (^DJT) no confirman. Posible fondo.`
          : "Dow Theory sin señal clara.",
    evidencia: `^DJI trend: ${dowTheory.industrialsTrend ?? "N/A"}, ^DJT trend: ${dowTheory.transportsTrend ?? "N/A"}. Confirmed: ${confirmed}. Divergence: ${dowTheory.divergence ?? "N/A"}`,
    murphyReference:
      "Murphy Cap. 5: 'The Dow Theory requires that both the Industrial and Transportation averages confirm each other. Failure to confirm is a warning sign.'",
  };
}

function validateCap5Rule2(dowTheory: DowTheoryData): ValidationResult {
  // Transportes suelen adelantarse a Industriales en los giros (Transportes reflejan economía primero)
  const transportsUpFirst =
    dowTheory.transportsTrend === "up" && dowTheory.industrialsTrend !== "up";
  const transportsDownFirst =
    dowTheory.transportsTrend === "down" && dowTheory.industrialsTrend !== "down";
  const signal: ValidationSignal = transportsUpFirst
    ? "bullish"
    : transportsDownFirst
      ? "bearish"
      : "neutral";
  return {
    ruleId: "C5-R2",
    chapter: 5,
    passed: transportsUpFirst || transportsDownFirst,
    signal,
    score: signal === "bullish" ? 0.3 : signal === "bearish" ? -0.3 : 0,
    confianza: "media",
    detalle: transportsUpFirst
      ? "Transportes adelantando a Industriales al alza. Señal temprana de recuperación económica."
      : transportsDownFirst
        ? "Transportes adelantando a Industriales a la baja. Señal temprana de desaceleración."
        : "Transportes e Industriales alineados. Sin divergencia anticipatoria.",
    evidencia: `Industriales: ${dowTheory.industrialsTrend ?? "N/A"}, Transportes: ${dowTheory.transportsTrend ?? "N/A"}`,
    murphyReference:
      "Murphy Cap. 5: 'Transportation stocks often lead Industrials at turning points since they reflect economic activity first.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 6 — Consumer Cyclical vs Consumer Staples (XLY/XLP)
// Regla: XLY/XLP sube = consumidor confiado (alcista). XLY/XLP baja = consumidor cauteloso (bajista).
// ═══════════════════════════════════════════════════════════════════════════════

const CAP6_TITLE = "Cap. 6 — Consumo Discrecional vs Básico";

function validateCap6Rule1(xlyXlp: RatioData): ValidationResult {
  const signal = trendToSignal(xlyXlp.trend, "rising");
  const score = scoreFromChange(xlyXlp.changePct3m, 2);
  return {
    ruleId: "C6-R1",
    chapter: 6,
    passed: signal !== "neutral",
    signal,
    score,
    confianza: confidenceFromAbs(xlyXlp.changePct3m),
    detalle:
      xlyXlp.trend === "rising"
        ? "XLY/XLP en alza: consumidor confiado, gasto discrecional lidera. Ciclo expansivo. Favorecer Consumer Cyclical, Technology."
        : xlyXlp.trend === "falling"
          ? "XLY/XLP en baja: consumidor refugiándose en básico. Señal temprana de desaceleración. Rotar a defensivos."
          : "XLY/XLP sin dirección clara.",
    evidencia: `XLY/XLP 1m: ${xlyXlp.changePct1m?.toFixed(2) ?? "N/A"}%, 3m: ${xlyXlp.changePct3m?.toFixed(2) ?? "N/A"}%`,
    murphyReference:
      "Murphy Cap. 6: 'The ratio of Consumer Discretionary to Consumer Staples (XLY/XLP) is one of the best leading indicators of consumer confidence and economic direction.'",
  };
}

function validateCap6Rule2(
  xlyXlp: RatioData,
  sectorRotation: SectorRotationData,
): ValidationResult {
  // Confirmación cruzada: si XLY/XLP sube, Technology debería estar outperforming
  const xlyUp = xlyXlp.trend === "rising";
  const techStrong = (sectorRotation.technologyReturn3m ?? 0) > 1;
  const confirmacion = xlyUp === techStrong || !xlyUp;
  const signal: ValidationSignal = confirmacion ? "bullish" : "warning";
  return {
    ruleId: "C6-R2",
    chapter: 6,
    passed: confirmacion,
    signal,
    score: confirmacion ? 0.2 : -0.4,
    confianza: "media",
    detalle: confirmacion
      ? "XLY/XLP y Technology alineados: consumidor confiado + liderazgo tecnológico confirman ciclo expansivo."
      : "⚠️ XLY/XLP y Technology divergen: consumidor confiado pero Technology no lidera (o viceversa). Señal mixta.",
    evidencia: `XLY/XLP trend: ${xlyXlp.trend ?? "N/A"}. XLK 3m: ${(sectorRotation.technologyReturn3m ?? 0).toFixed(2)}%. Confirmación: ${confirmacion}.`,
    murphyReference:
      "Murphy Cap. 6-10: 'Consumer confidence should align with Technology sector leadership in expansionary phases.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 7 — Bonos Lideran Acciones (Bonds Lead Stocks)
// Regla: Bonos se giran antes que acciones en los puntos de inflexión del ciclo.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP7_TITLE = "Cap. 7 — Bonos Lideran Acciones";

function validateCap7Rule1(
  bondsStocks: BondStockRelationData,
  leadLag: LeadLagData,
): ValidationResult {
  const bondsLead = leadLag.bondsLeadStocks === "TLT (Bonds)" || leadLag.bondsLeadStocks === "TLT";
  const stocksLead =
    leadLag.bondsLeadStocks === "SPY (Stocks)" || leadLag.bondsLeadStocks === "SPY";
  const synchronous = leadLag.bondsLeadStocks === "Sincrónico";
  const signal: ValidationSignal = bondsLead ? "bullish" : stocksLead ? "bearish" : "neutral";
  return {
    ruleId: "C7-R1",
    chapter: 7,
    passed: bondsLead || stocksLead, // siempre hay un líder identificable
    signal,
    score: bondsLead ? 0.6 : stocksLead ? -0.4 : 0,
    confianza: bondsLead || stocksLead ? "alta" : "baja",
    detalle: bondsLead
      ? "Bonos (TLT) lideran a Acciones (SPY) — patrón Murphy clásico. Los mercados de bonos se adelantan en detectar cambios de régimen."
      : stocksLead
        ? "⚠️ Acciones (SPY) lideran a Bonos (TLT) — anomalía respecto a lo esperado por Murphy. Mercado de acciones descontando cambios que bonos aún no reflejan."
        : synchronous
          ? "Bonos y Acciones moviéndose sincrónicamente. Sin relación líder-seguidor clara."
          : "Lead-lag no disponible.",
    evidencia: `Lead-lag TLT vs SPY: ${leadLag.bondsLeadStocks ?? "N/A"}. Murphy espera que bonos lideren.`,
    murphyReference:
      "Murphy Cap. 7: 'The bond market is the most important leading indicator for stocks. Bonds turn before stocks at every major market top and bottom.'",
  };
}

function validateCap7Rule2(bondsStocks: BondStockRelationData): ValidationResult {
  // Bond yields rise → stocks eventually fall (lag of months)
  const tltDown = (bondsStocks.tltReturn3m ?? 0) < -2; // bonds falling hard (yields rising)
  const spyUp = (bondsStocks.spyReturn3m ?? 0) > 1; // stocks still rising
  const divergencia = tltDown && spyUp;
  const signal: ValidationSignal = divergencia ? "warning" : "neutral";
  return {
    ruleId: "C7-R2",
    chapter: 7,
    passed: divergencia,
    signal,
    score: divergencia ? -0.7 : 0,
    confianza: divergencia ? "alta" : "baja",
    detalle: divergencia
      ? "⚠️ ALTAMENTE SIGNIFICATIVO: Bonos cayendo fuerte (yields subiendo) mientras acciones aún suben. Divergencia clásica de techo de mercado según Murphy. Bonos advirtiendo antes que acciones."
      : "Sin divergencia bonos/acciones. Ciclo normal.",
    evidencia: `TLT 3m: ${(bondsStocks.tltReturn3m ?? 0).toFixed(2)}%, SPY 3m: ${(bondsStocks.spyReturn3m ?? 0).toFixed(2)}%. Divergencia: ${divergencia}.`,
    murphyReference:
      "Murphy Cap. 7: 'Rising bond yields (falling bond prices) eventually catch up with stocks. The bond market's warning typically precedes the stock peak by 2-12 months.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 8 — La Curva de Rendimientos como Predictor
// Regla: Curva invertida = recesión en 6-18 meses. Steepening post-inversión = recuperación.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP8_TITLE = "Cap. 8 — La Curva de Rendimientos";

function validateCap8Rule1(yieldCurve: YieldCurveData): ValidationResult {
  const inverted = yieldCurve.inverted === true;
  const signal: ValidationSignal = inverted
    ? "bearish"
    : yieldCurve.steepness === "steepening"
      ? "bullish"
      : "neutral";
  return {
    ruleId: "C8-R1",
    chapter: 8,
    passed: true, // siempre hay señal
    signal,
    score: inverted
      ? -0.9
      : yieldCurve.steepness === "steepening"
        ? 0.6
        : yieldCurve.steepness === "flattening"
          ? -0.3
          : 0,
    confianza: inverted ? "alta" : yieldCurve.steepness != null ? "alta" : "baja",
    detalle: yieldCurve.inverted
      ? `❗CURVA INVERTIDA (${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}% 10Y-2Y). LA SEÑAL MÁS TEMPRANA Y CONFIABLE DE RECESIÓN SEGÚN MURPHY. Históricamente precede recesión por 6-18 meses. Probabilidad de recesión elevada.`
      : yieldCurve.steepness === "steepening"
        ? `Curva steepening (${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}%). Normalización post-inversión o expansión temprana. Stage 1-2 del ciclo.`
        : yieldCurve.steepness === "flattening"
          ? `Curva flattening (${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}%). Se acerca inversión. Cautela. Stage 4-5.`
          : `Curva normal (${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}%). Sin señal de estrés inmediato.`,
    evidencia: `Spread 10Y-2Y: ${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}%. Spread 10Y-3M: ${yieldCurve.spread10y3m?.toFixed(2) ?? "N/A"}%. Invertida: ${inverted}. Steepness: ${yieldCurve.steepness}.`,
    murphyReference:
      "Murphy Cap. 8 & 14: 'The yield curve is the single best predictor of economic turning points. An inverted curve (10Y-2Y negative) has preceded every recession since WWII.'",
  };
}

function validateCap8Rule2(yieldCurve: YieldCurveData): ValidationResult {
  // Yield curve slope vs historical average — extreme flattening/inversion is more significant
  const longTermAvg = yieldCurve.longTermAvg10y2y ?? 1.5;
  const currentSpread = yieldCurve.spread10y2y;
  if (currentSpread == null)
    return {
      ruleId: "C8-R2",
      chapter: 8,
      passed: false,
      signal: "neutral",
      score: 0,
      confianza: "baja",
      detalle: "Datos insuficientes para calcular contexto histórico de la curva.",
      evidencia: "",
      murphyReference: "Murphy Cap. 8",
    };
  const deviation = currentSpread - longTermAvg;
  const extreme = Math.abs(deviation) > 1.5;
  const signal: ValidationSignal = extreme ? (deviation < 0 ? "bearish" : "bullish") : "neutral";
  return {
    ruleId: "C8-R2",
    chapter: 8,
    passed: extreme,
    signal,
    score: deviation < 0 ? -0.5 : 0.5,
    confianza: extreme ? "alta" : "baja",
    detalle: extreme
      ? `Curva en nivel EXTREMO: desviación de ${deviation.toFixed(2)}% vs promedio histórico (${longTermAvg.toFixed(2)}%). ${deviation < 0 ? "Inversión profunda — señal de recesión fuerte." : "Curva muy empinada — señal de expansión agresiva."}`
      : `Curva dentro de rangos históricos normales. Desviación: ${deviation.toFixed(2)}%.`,
    evidencia: `Spread actual: ${currentSpread.toFixed(2)}%. Promedio histórico: ${longTermAvg.toFixed(2)}%. Desviación: ${deviation.toFixed(2)}%.`,
    murphyReference:
      "Murphy Cap. 8: 'The steepness or flatness of the yield curve should be measured against historical averages to gauge extremes.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 9 — Mercados Internacionales (Developed vs Emerging)
// Regla: EFA/EEM ratio sube = USD fuerte, risk-off global. Baja = risk-on global, USD débil.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP9_TITLE = "Cap. 9 — Mercados Internacionales";

function validateCap9Rule1(international: InternationalData): ValidationResult {
  const devOutperform = international.efaEemRatio != null && international.efaEemRatio > 0;
  const emOutperform = international.efaEemRatio != null && international.efaEemRatio < 0;
  const ratioTrendUp = (international.efaReturn3m ?? 0) > (international.eemReturn3m ?? 0);
  const signal: ValidationSignal = ratioTrendUp ? "bearish" : "bullish"; // em outperforming = risk-on = bullish
  return {
    ruleId: "C9-R1",
    chapter: 9,
    passed: international.efaEemRatio != null,
    signal,
    score: ratioTrendUp ? -0.3 : 0.3,
    confianza:
      Math.abs(international.efaReturn3m ?? 0) > 2 || Math.abs(international.eemReturn3m ?? 0) > 2
        ? "alta"
        : "media",
    detalle: ratioTrendUp
      ? "Desarrollados (EFA) superan a Emergentes (EEM) — USD fuerte, capital flight-to-safety. Mercado global cauteloso. Risk-off."
      : "Emergentes (EEM) superan a Desarrollados (EFA) — risk-on global, USD débil. Confianza en crecimiento global.",
    evidencia: `EFA 3m: ${(international.efaReturn3m ?? 0).toFixed(2)}%, EEM 3m: ${(international.eemReturn3m ?? 0).toFixed(2)}%. EFA/EEM ratio: ${(international.efaEemRatio ?? 0).toFixed(2)}.`,
    murphyReference:
      "Murphy Cap. 9: 'Emerging markets outperform developed when global risk appetite is high and the dollar is weak. Developed markets lead when global caution prevails.'",
  };
}

function validateCap9Rule2(international: InternationalData, dollar: DollarData): ValidationResult {
  // Correlation check: strong USD = developed outperform, weak USD = emerging outperform
  const dxyStrong = (dollar.dxyReturn3m ?? 0) > 1;
  const devOutperformEM = (international.efaReturn3m ?? 0) > (international.eemReturn3m ?? 0);
  const confirmsUSD = (dxyStrong && devOutperformEM) || (!dxyStrong && !devOutperformEM);
  const signal: ValidationSignal = confirmsUSD ? "bullish" : "warning";
  return {
    ruleId: "C9-R2",
    chapter: 9,
    passed: confirmsUSD,
    signal,
    score: confirmsUSD ? 0.3 : -0.4,
    confianza: confirmsUSD ? "alta" : "media",
    detalle: confirmsUSD
      ? "Relación internacional consistente con el dólar: USD y flujos globales alineados. Mercado racional."
      : "⚠️ Anomalía: desarrollados vs emergentes NO consistentes con el movimiento del USD. Posible intervención o factores idiosincráticos.",
    evidencia: `DXY 3m: ${(dollar.dxyReturn3m ?? 0).toFixed(2)}%. ${devOutperformEM ? "EFA > EEM" : "EEM > EFA"}. Consistente: ${confirmsUSD}.`,
    murphyReference:
      "Murphy Cap. 9: 'The direction of the dollar determines relative performance between developed and emerging markets.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 10 — Rotación Sectorial (Sector Rotation)
// Regla: Technology → Industrials → Energy/Materials → Defensivos en ciclo completo.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP10_TITLE = "Cap. 10 — Rotación Sectorial";

function validateCap10Rule1(
  sectorRotation: SectorRotationData,
  cycleStage: CycleStageData,
): ValidationResult {
  // Early cycle: Technology & Consumer Cyclical lead
  // Mid cycle: Industrials, Financials take over
  // Late cycle: Energy, Materials lead
  // Recession: Utilities, Consumer Defensive, Healthcare lead
  const techLead = (sectorRotation.technologyReturn3m ?? 0) > 1;
  const energyLead = (sectorRotation.energyReturn3m ?? 0) > 1;
  const defLead =
    (sectorRotation.utilitiesReturn3m ?? 0) > 1 || (sectorRotation.consumerDefensive3m ?? 0) > 1;
  const finLead = (sectorRotation.financialsReturn3m ?? 0) > 1;

  let stageHint = "";
  let signal: ValidationSignal = "neutral";
  let score = 0;
  if (techLead && !energyLead && !defLead) {
    stageHint = "Rotación típica de Stage 2-3 (Expansión temprana/plena): Technology lidera.";
    signal = "bullish";
    score = 0.6;
  } else if (energyLead && !techLead) {
    stageHint =
      "Rotación típica de Stage 4-5 (Expansión tardía/contracción temprana): Energy y Materials lideran, Technology rezagado.";
    signal = "bearish";
    score = -0.5;
  } else if (defLead && !techLead && !energyLead) {
    stageHint =
      "Rotación típica de Stage 4-5 (Contracción): Defensivos lideran. Risk-off generalizado.";
    signal = "bearish";
    score = -0.7;
  } else if (techLead && finLead) {
    stageHint = "Rotación mixta: Technology y Financials ambos fuertes. Expansión saludable.";
    signal = "bullish";
    score = 0.5;
  } else {
    stageHint = "Rotación sin señal clara o mixta. Varios sectores compitiendo.";
    signal = "neutral";
    score = 0;
  }

  return {
    ruleId: "C10-R1",
    chapter: 10,
    passed: true,
    signal,
    score,
    confianza: Math.abs(score) > 0.4 ? "alta" : "media",
    detalle: stageHint,
    evidencia: `XLK: ${(sectorRotation.technologyReturn3m ?? 0).toFixed(2)}%, XLE: ${(sectorRotation.energyReturn3m ?? 0).toFixed(2)}%, XLU: ${(sectorRotation.utilitiesReturn3m ?? 0).toFixed(2)}%, XLF: ${(sectorRotation.financialsReturn3m ?? 0).toFixed(2)}%. Stage detectado: ${cycleStage.detectedStage ?? "N/A"}.`,
    murphyReference:
      "Murphy Cap. 10: 'Sector rotation follows a predictable pattern through the economic cycle. Technology leads early, Industrials mid-cycle, Energy late, and Defensives in recession.'",
  };
}

function validateCap10Rule2(
  sectorRotation: SectorRotationData,
  iwmSpy: RatioData,
): ValidationResult {
  // Small caps (IWM/SPY) lead in early-mid cycle, lag in late cycle
  const smallCapOutperform = iwmSpy.trend === "rising";
  const consumerCyclicalUp = (sectorRotation.consumerCyclical3m ?? 0) > 1;
  const financialsUp = (sectorRotation.financialsReturn3m ?? 0) > 0;
  const earlyCycleSignals = smallCapOutperform && consumerCyclicalUp && financialsUp;
  const lateCycleSignals = !smallCapOutperform && (sectorRotation.energyReturn3m ?? 0) > 1;
  const signal: ValidationSignal = earlyCycleSignals
    ? "bullish"
    : lateCycleSignals
      ? "bearish"
      : "neutral";
  return {
    ruleId: "C10-R2",
    chapter: 10,
    passed: earlyCycleSignals || lateCycleSignals,
    signal,
    score: earlyCycleSignals ? 0.5 : lateCycleSignals ? -0.5 : 0,
    confianza: earlyCycleSignals || lateCycleSignals ? "alta" : "baja",
    detalle: earlyCycleSignals
      ? "Small caps liderando + Consumer Cyclical fuerte + Financials sólidos = Expansión temprana confirmada (Stage 2)."
      : lateCycleSignals
        ? "⚠️ Small caps débiles + Energy liderando = Expansión tardía (Stage 4-5). Cautela con cíclicos."
        : "Señales de rotación mixtas o poco definidas.",
    evidencia: `IWM/SPY trend: ${iwmSpy.trend ?? "N/A"}. XLY: ${(sectorRotation.consumerCyclical3m ?? 0).toFixed(2)}%. XLF: ${(sectorRotation.financialsReturn3m ?? 0).toFixed(2)}%`,
    murphyReference:
      "Murphy Cap. 5 & 10: 'Small caps lead early cycle. When small caps start to lag while Energy and Materials are strong, the cycle is maturing.'",
  };
}

function validateCap10Rule3(
  sectorRotation: SectorRotationData,
  ndxSpx: RatioData,
): ValidationResult {
  // NDX/SPX ratio: tech outperformance vs broad market = early-mid cycle
  const techOutperform = ndxSpx.trend === "rising";
  const energyDominant =
    (sectorRotation.energyReturn3m ?? 0) > (sectorRotation.technologyReturn3m ?? 0);
  const signal: ValidationSignal =
    techOutperform && !energyDominant ? "bullish" : energyDominant ? "bearish" : "neutral";
  return {
    ruleId: "C10-R3",
    chapter: 10,
    passed: techOutperform || energyDominant,
    signal,
    score: techOutperform && !energyDominant ? 0.4 : energyDominant ? -0.4 : 0,
    confianza: "media",
    detalle:
      techOutperform && !energyDominant
        ? "Technology (NDX) outperforming S&P 500: confirma liderazgo tecnológico típico de Stage 2-3."
        : energyDominant
          ? "⚠️ Energy superando a Technology: rotación desde crecimiento hacia valor. Stage 4-5. Cautela."
          : "Tech vs Energy sin tendencia dominante clara.",
    evidencia: `NDX/SPX trend: ${ndxSpx.trend ?? "N/A"}. Tech 3m: ${(sectorRotation.technologyReturn3m ?? 0).toFixed(2)}%, Energy 3m: ${(sectorRotation.energyReturn3m ?? 0).toFixed(2)}%`,
    murphyReference:
      "Murphy Cap. 10: 'The Technology/Energy ratio is one of the most powerful sector rotation signals. Tech leads early cycle, Energy leads late cycle.'",
  };
}

function validateCap10Rule4(
  sectorRotation: SectorRotationData,
  cycleStage: CycleStageData,
): ValidationResult {
  // REIT cycle timing (Murphy p.218-233): REITs peak as market bottoms, turn up as Nasdaq peaks
  // XLRE rising while cyclical/tech weak = late stage flight to yield
  const reitReturn = sectorRotation.realEstateReturn3m ?? 0;
  const techReturn = sectorRotation.technologyReturn3m ?? 0;
  const stage = cycleStage.detectedStage;
  const reitOutperforming = reitReturn > techReturn + 2;
  let signal: ValidationSignal = "neutral";
  let score = 0;
  let detalle = "";

  if (reitOutperforming && stage != null && stage >= 4) {
    signal = "bearish";
    score = -0.5;
    detalle =
      "⚠️ REITs (XLRE) superando a Technology — rotación hacia yield en late stage. Murphy: REITs suelen tener su peor momento cerca del final de la contracción.";
  } else if (reitOutperforming && stage != null && stage <= 2) {
    signal = "bullish";
    score = 0.3;
    detalle =
      "REITs liderando en early cycle: confianza en recuperación del sector inmobiliario. Consistente con Stage 1-2.";
  } else if (reitReturn < -5 && stage != null && stage >= 4) {
    signal = "bullish";
    score = 0.4;
    detalle =
      "REITs castigados en late stage: Murphy documenta que REITs tocan fondo cerca del final de la contracción. Oportunidad de compra en horizonte 6-12m.";
  } else {
    detalle = "REITs sin señal direccional clara respecto al ciclo.";
  }

  return {
    ruleId: "C10-R4",
    chapter: 10,
    passed: reitOutperforming || reitReturn < -5,
    signal,
    score,
    confianza: reitOutperforming ? "media" : "baja",
    detalle,
    evidencia: `XLRE 3m: ${reitReturn.toFixed(2)}%, XLK 3m: ${techReturn.toFixed(2)}%. Stage: ${stage ?? "N/A"}. REIT > Tech: ${reitOutperforming}.`,
    murphyReference:
      "Murphy Cap. 10 & p.218-233: 'REITs turn up as Nasdaq peaks. REITs peak in 2002 as market bottoms. Real estate cycle timing reveals late-stage rotation.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 9b — Japón Lidera USA (EWJ/SPY) — Murphy p.84-87
// ═══════════════════════════════════════════════════════════════════════════════

const CAP9B_TITLE = "Cap. 9b — Japón Lidera USA";

function validateCap9bRule1(ewjSpy: RatioData): ValidationResult {
  const japanWeak = ewjSpy.trend === "falling";
  const japanStrong = ewjSpy.trend === "rising";
  let signal: ValidationSignal = "neutral";
  let score = 0;
  let detalle = "";
  if (japanWeak) {
    signal = "warning";
    score = -0.5;
    detalle =
      "⚠️ EWJ/SPY cayendo: Japón (EWJ) rinde menos que USA (SPY). Murphy: 'Japan effect overrides Federal Reserve.' Señal de debilidad global adelantada.";
  } else if (japanStrong) {
    signal = "bullish";
    score = 0.3;
    detalle =
      "EWJ/SPY subiendo: Japón lidera la recuperación global. Murphy documenta que Japón suele adelantarse a USA en los puntos de giro.";
  } else {
    detalle = "EWJ/SPY sin tendencia direccional clara.";
  }
  return {
    ruleId: "C9b-R1",
    chapter: 9,
    passed: japanWeak || japanStrong,
    signal,
    score,
    confianza: japanWeak || japanStrong ? "media" : "baja",
    detalle,
    evidencia: `EWJ/SPY trend: ${ewjSpy.trend ?? "N/A"}. 1m: ${(ewjSpy.changePct1m ?? 0).toFixed(2)}%. 3m: ${(ewjSpy.changePct3m ?? 0).toFixed(2)}%.`,
    murphyReference:
      "Murphy p.84-87 & Cap. 9: 'Japan's effect on U.S. markets can override Federal Reserve policy.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 10b — Gold Stocks Confirmation (GDX/GLD) — Murphy p.125-127
// ═══════════════════════════════════════════════════════════════════════════════

const CAP10B_TITLE = "Cap. 10b — Gold Stocks vs Gold";

function validateCap10bRule1(gdxGld: RatioData): ValidationResult {
  const minersConfirm = gdxGld.trend === "rising";
  const minersDiverge = gdxGld.trend === "falling";
  let signal: ValidationSignal = "neutral";
  let score = 0;
  let detalle = "";
  if (minersConfirm) {
    signal = "bullish";
    score = 0.5;
    detalle =
      "GDX/GLD subiendo: mineros CONFIRMAN el rally del oro. Murphy: 'When gold stocks shine, the gold rally is real.'";
  } else if (minersDiverge) {
    signal = "bearish";
    score = -0.5;
    detalle =
      "⚠️ GDX/GLD cayendo: oro sube pero mineros no confirman. Posible trampa alcista según Murphy.";
  } else {
    detalle = "GDX/GLD estable: sin divergencia.";
  }
  return {
    ruleId: "C10b-R1",
    chapter: 10,
    passed: minersConfirm || minersDiverge,
    signal,
    score,
    confianza: minersConfirm || minersDiverge ? "media" : "baja",
    detalle,
    evidencia: `GDX/GLD trend: ${gdxGld.trend ?? "N/A"}. 1m: ${(gdxGld.changePct1m ?? 0).toFixed(2)}%. 3m: ${(gdxGld.changePct3m ?? 0).toFixed(2)}%.`,
    murphyReference:
      "Murphy p.125-127: 'When GDX outperforms GLD, the gold rally is confirmed. When GDX lags, the rally is suspect.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 11 — Growth vs Value
// Regla: Growth (IVW) vs Value (IVE): Growth lidera en bajas tasas. Value lidera en subida de tasas.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP11_TITLE = "Cap. 11 — Growth vs Value";

function validateCap11Rule1(growthValue: RatioData, yieldCurve: YieldCurveData): ValidationResult {
  const growthOutperform = growthValue.trend === "rising";
  const valueOutperform = growthValue.trend === "falling";
  const yieldsRising = yieldCurve.steepness === "steepening" || (yieldCurve.spread10y2y ?? 0) > 1.5;
  const yieldsFalling = yieldCurve.spread10y2y != null && yieldCurve.spread10y2y < 0.5;

  // Expected: growth leads when yields falling/stable, value leads when yields rising
  const expectedGrowth = yieldsFalling || !yieldsRising;
  const expectedValue = yieldsRising;
  const confirms =
    (expectedGrowth && growthOutperform) ||
    (expectedValue && valueOutperform) ||
    (!growthOutperform && !valueOutperform);
  const signal: ValidationSignal = growthOutperform
    ? "bullish"
    : valueOutperform
      ? "bearish"
      : "neutral";
  return {
    ruleId: "C11-R1",
    chapter: 11,
    passed: confirms,
    signal,
    score: growthOutperform ? 0.4 : valueOutperform ? -0.4 : 0,
    confianza: growthOutperform || valueOutperform ? "alta" : "baja",
    detalle: growthOutperform
      ? `Growth (IVW) supera a Value (IVE): ${confirms ? "consistente" : "inconsistente"} con el contexto de tasas. Stage 2-3 típico.`
      : valueOutperform
        ? `Value (IVE) supera a Growth (IVW): ${confirms ? "consistente" : "inconsistente"} con el contexto de tasas. Stage 4-5 típico.`
        : "Growth vs Value sin tendencia clara.",
    evidencia: `IVW/IVE trend: ${growthValue.trend ?? "N/A"}. Spread 10Y-2Y: ${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}%. Consistente: ${confirms}.`,
    murphyReference:
      "Murphy Cap. 11: 'Growth outperforms when yields are falling; Value outperforms when yields are rising. The Growth/Value ratio reflects the interest rate regime.'",
  };
}

function validateCap11Rule2(growthValue: RatioData): ValidationResult {
  const growthExtreme = (growthValue.changePct3m ?? 0) > 5; // extreme growth outperformance
  const valueExtreme = (growthValue.changePct3m ?? 0) < -5; // extreme value outperformance
  let signal: ValidationSignal = "neutral";
  let detalle = "";
  let score = 0;
  if (growthExtreme) {
    signal = "warning";
    score = -0.3;
    detalle =
      "⚠️ Growth extremo: crecimiento superando a value por más de 5% en 3m. Posible agotamiento de momentum. Murphy advierte que los extremos de Growth suelen preceder correcciones.";
  } else if (valueExtreme) {
    signal = "warning";
    score = -0.3;
    detalle =
      "⚠️ Value extremo: value superando a growth por más de 5% en 3m. Puede indicar pánico o giro brusco de régimen.";
  }
  return {
    ruleId: "C11-R2",
    chapter: 11,
    passed: growthExtreme || valueExtreme,
    signal,
    score,
    confianza: growthExtreme || valueExtreme ? "alta" : "baja",
    detalle: detalle || "Growth/Value dentro de rangos normales. Sin extremos de estilo.",
    evidencia: `IVW/IVE cambio 3m: ${growthValue.changePct3m?.toFixed(2) ?? "N/A"}%.`,
    murphyReference:
      "Murphy Cap. 11: 'Extreme outperformance of one style usually signals a pending reversal. Mean reversion in style cycles is one of the most reliable intermarket signals.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 12 — Mercados de Crédito (HYG/LQD)
// Regla: HYG/LQD sube = apetito por riesgo crediticio. Baja = flight-to-quality crediticio.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP12_TITLE = "Cap. 12 — Mercados de Crédito";

function validateCap12Rule1(creditMarket: CreditMarketData): ValidationResult {
  const signal = trendToSignal(creditMarket.hygLqdTrend, "rising");
  const score = scoreFromChange(creditMarket.hygReturn1m, 2);
  return {
    ruleId: "C12-R1",
    chapter: 12,
    passed: signal !== "neutral",
    signal,
    score,
    confianza: confidenceFromAbs(creditMarket.hygReturn1m ?? 0),
    detalle:
      creditMarket.hygLqdTrend === "rising"
        ? "HYG/LQD en alza: High Yield supera a Investment Grade. Apetito por riesgo crediticio. Confianza en economía. Stage 2-3."
        : creditMarket.hygLqdTrend === "falling"
          ? "HYG/LQD en baja: Investment Grade supera a High Yield. Flight-to-quality crediticio. Señal temprana de estrés. Stage 4-5."
          : "HYG/LQD sin tendencia clara.",
    evidencia: `HYG/LQD trend: ${creditMarket.hygLqdTrend ?? "N/A"}. HYG 1m: ${(creditMarket.hygReturn1m ?? 0).toFixed(2)}%, LQD 1m: ${(creditMarket.lqdReturn1m ?? 0).toFixed(2)}%`,
    murphyReference:
      "Murphy Cap. 12: 'The credit market leads the stock market. HYG vs LQD reveals credit appetite. HYG rising = risk-on, HYG falling = credit stress ahead.'",
  };
}

function validateCap12Rule2(
  creditMarket: CreditMarketData,
  bondsStocks: BondStockRelationData,
): ValidationResult {
  // Credit markets (HYG/LQD) lead stock market. HYG mainly tops before SPY.
  const creditStress = creditMarket.hygLqdTrend === "falling";
  const spyStillUp = (bondsStocks.spyReturn1m ?? 0) > 0;
  const divergence = creditStress && spyStillUp;
  const signal: ValidationSignal = divergence ? "warning" : "neutral";
  return {
    ruleId: "C12-R2",
    chapter: 12,
    passed: divergence,
    signal,
    score: divergence ? -0.6 : 0.2,
    confianza: divergence ? "alta" : "baja",
    detalle: divergence
      ? "⚠️ HYG/LQD cayendo pero SPY aún subiendo: DIVERGENCIA CREDITICIA. Murphy señala que los mercados de crédito se adelantan a las acciones. Señal de techo inminente."
      : creditMarket.hygLqdTrend === "rising" && (bondsStocks.spyReturn1m ?? 0) > 0
        ? "Crédito y acciones alineados: HYG/LQD subiendo con SPY. Expansión crediticia saludable."
        : "Sin divergencia crédito-acciones significativa.",
    evidencia: `HYG/LQD trend: ${creditMarket.hygLqdTrend ?? "N/A"}. SPY 1m: ${(bondsStocks.spyReturn1m ?? 0).toFixed(2)}%. Divergencia: ${divergence}.`,
    murphyReference:
      "Murphy Cap. 12: 'Credit markets lead the stock market. High-yield topping while stocks are still rising is one of the most reliable bearish divergences.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 13 — Política Monetaria y la Fed
// Regla: Fed tightening → bearish. Fed cutting → bullish. Fed vs yield curve = señal compuesta.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP13_TITLE = "Cap. 13 — Política Monetaria";

function validateCap13Rule1(
  fedMonetary: FedMonetaryData,
  yieldCurve: YieldCurveData,
): ValidationResult {
  if (fedMonetary.currentRate == null)
    return {
      ruleId: "C13-R1",
      chapter: 13,
      passed: false,
      signal: "neutral",
      score: 0,
      confianza: "baja",
      detalle: "Datos de tasa Fed no disponibles.",
      evidencia: "",
      murphyReference: "Murphy Cap. 13",
    };

  const tightening = fedMonetary.cyclePhase === "tightening";
  const cutting = fedMonetary.cyclePhase === "cutting";
  const inverted = yieldCurve.inverted === true;
  const fedAboveSpread = fedMonetary.fedAbove10y3m === true;

  let signal: ValidationSignal = "neutral";
  let score = 0;
  let detalle = "";

  if (tightening && inverted) {
    signal = "bearish";
    score = -0.8;
    detalle = `❗ Fed en ciclo de tightening (${fedMonetary.currentRate.toFixed(2)}%) Y curva invertida. Combinación más bajista según Murphy. Históricamente precede recesión en 6-12 meses.`;
  } else if (cutting) {
    signal = "bullish";
    score = 0.6;
    detalle = `Fed en ciclo de CUTTING (${fedMonetary.currentRate.toFixed(2)}%). Estímulo monetario. Alcista para activos de riesgo (con rezago de 6-12 meses).`;
  } else if (tightening && !inverted) {
    signal = "neutral";
    score = -0.2;
    detalle = "Fed en tightening pero curva no invertida. Ciclo de ajuste aún no extremo.";
  } else if (fedAboveSpread) {
    signal = "bearish";
    score = -0.4;
    detalle = `⚠️ Tasa Fed (${fedMonetary.currentRate.toFixed(2)}%) por encima del spread 10Y-3M. Condición restrictiva. Señal de desaceleración.`;
  } else {
    signal = "neutral";
    score = 0;
    detalle = "Política monetaria sin señal restrictiva extrema.";
  }

  return {
    ruleId: "C13-R1",
    chapter: 13,
    passed: true,
    signal,
    score,
    confianza: tightening || cutting ? "alta" : "media",
    detalle,
    evidencia: `Fed rate: ${fedMonetary.currentRate.toFixed(2)}%. Ciclo: ${fedMonetary.cyclePhase ?? "N/A"}. Curva invertida: ${inverted}. Fed > spread 10Y-3M: ${fedAboveSpread}.`,
    murphyReference:
      "Murphy Cap. 13: 'Fed policy combined with the yield curve is the most powerful monetary signal. Tightening + inverted curve = recession almost certain.'",
  };
}

function validateCap13Rule2(fedMonetary: FedMonetaryData): ValidationResult {
  if (fedMonetary.currentRate == null)
    return {
      ruleId: "C13-R2",
      chapter: 13,
      passed: false,
      signal: "neutral",
      score: 0,
      confianza: "baja",
      detalle: "Datos insuficientes.",
      evidencia: "",
      murphyReference: "Murphy Cap. 13",
    };
  const extremeRate = fedMonetary.currentRate > 5;
  const signal: ValidationSignal = extremeRate ? "bearish" : "neutral";
  return {
    ruleId: "C13-R2",
    chapter: 13,
    passed: extremeRate,
    signal,
    score: extremeRate ? -0.3 : 0,
    confianza: extremeRate ? "alta" : "baja",
    detalle: extremeRate
      ? `Tasa Fed en ${fedMonetary.currentRate.toFixed(2)}% — nivel históricamente restrictivo. Mercados suelen descontar desaceleración con rates > 5%.`
      : `Tasa Fed en ${fedMonetary.currentRate.toFixed(2)}% — nivel moderado.`,
    evidencia: `Fed rate: ${fedMonetary.currentRate.toFixed(2)}%.`,
    murphyReference:
      "Murphy Cap. 13: 'Historically, Fed funds rates above 5% have been associated with economic tightening and subsequent market corrections.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 14 — Curva Invertida y Predicción de Recesión
// Regla: 10Y-3M invertido + persistencia = alta probabilidad de recesión.
// ═══════════════════════════════════════════════════════════════════════════════

const CAP14_TITLE = "Cap. 14 — Curva Invertida y Recesión";

function validateCap14Rule1(
  yieldCurve: YieldCurveData,
  creditMarket: CreditMarketData,
): ValidationResult {
  const inverted = yieldCurve.inverted === true;
  const creditWorsening = creditMarket.hygLqdTrend === "falling";
  const recessionProbability = inverted && creditWorsening ? 0.85 : inverted ? 0.65 : 0;
  const signal: ValidationSignal =
    recessionProbability > 0.5 ? (recessionProbability > 0.75 ? "bearish" : "warning") : "neutral";
  return {
    ruleId: "C14-R1",
    chapter: 14,
    passed: inverted,
    signal,
    score: -recessionProbability,
    confianza: recessionProbability > 0.5 ? "alta" : "baja",
    detalle:
      inverted && creditWorsening
        ? `❗ CURVA INVERTIDA (${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}%) + CRÉDITO DETERIORÁNDOSE hacia Investment Grade. Alta probabilidad de recesión (${(recessionProbability * 100).toFixed(0)}%). Murphy Cap. 14: combinación más letal.`
        : inverted
          ? `Curva invertida (${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}%). Probabilidad de recesión: ~65% en 12 meses. Sin confirmación crediticia aún.`
          : `Curva no invertida. Probabilidad de recesión baja en horizonte 12 meses.`,
    evidencia: `Spread 10Y-2Y: ${yieldCurve.spread10y2y?.toFixed(2) ?? "N/A"}%. 10Y-3M: ${yieldCurve.spread10y3m?.toFixed(2) ?? "N/A"}%. Invertida: ${inverted}. HYG/LQD cayendo: ${creditWorsening}.`,
    murphyReference:
      "Murphy Cap. 14: 'An inverted yield curve is the most reliable recession indicator. When combined with credit deterioration, recession probability approaches 90%.'",
  };
}

function validateCap14Rule2(
  yieldCurve: YieldCurveData,
  sp500OneYearReturn: number | null,
): ValidationResult {
  // Review: inverted curve + stocks still rising = late-cycle behavior
  const inverted = yieldCurve.inverted === true;
  const spyPositive1y = (sp500OneYearReturn ?? 0) > 0;
  const lateCycle = inverted && spyPositive1y;
  const signal: ValidationSignal = lateCycle ? "bearish" : "neutral";
  return {
    ruleId: "C14-R2",
    chapter: 14,
    passed: lateCycle,
    signal,
    score: lateCycle ? -0.7 : 0,
    confianza: lateCycle ? "alta" : "baja",
    detalle: lateCycle
      ? "❗ Escenario late-cycle clásico: curva invertida PERO S&P 500 aún positivo a 1 año. Murphy advierte que este es el momento más peligroso: las acciones aún no han descontado la recesión."
      : inverted
        ? "Curva invertida y S&P 500 correctivo. Mercado ya descontando recesión parcialmente."
        : "Sin señal late-cycle.",
    evidencia: `S&P 500 1y: ${(sp500OneYearReturn ?? 0).toFixed(2)}%. Curva invertida: ${inverted}. Late-cycle: ${lateCycle}.`,
    murphyReference:
      "Murphy Cap. 14: 'The most dangerous time is when the yield curve is inverted and stocks are still rising. This late-cycle behavior has preceded every major bear market.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAPÍTULO 15 — El Ciclo Completo de 6 Etapas (Six-Stage Cycle)
// Regla: Bond↑ Stock↓ Comm↓ (1) → B↑ S↑ C↓ (2) → B↑ S↑ C↑ (3) → B↓ S↑ C↑ (4) → B↓ S↓ C↑ (5) → B↓ S↓ C↓ (6)
// ═══════════════════════════════════════════════════════════════════════════════

const CAP15_TITLE = "Cap. 15 — El Ciclo de 6 Etapas";

function validateCap15Rule1(cycleStage: CycleStageData): ValidationResult {
  const stage = cycleStage.detectedStage;
  const confianza = cycleStage.stageConfidence;
  let signal: ValidationSignal = "neutral";
  let score = 0;
  let detalle = "";

  if (stage === null) {
    detalle = "No se pudo determinar la etapa del ciclo.";
  } else {
    switch (stage) {
      case 1:
        signal = "bullish";
        score = 0.7;
        detalle =
          "Stage 1 — Bottom / Transición: Bonos suben, Stocks caen, Commodities caen. Mercado buscando piso. Anticipar rotación hacia Technology y Consumer Cyclical.";
        break;
      case 2:
        signal = "bullish";
        score = 0.9;
        detalle =
          "Stage 2 — Expansión Temprana: Bonos suben, Stocks suben, Commodities débiles. MEJOR MOMENTO PARA COMPRAR. Lideran Technology y Consumer Cyclical.";
        break;
      case 3:
        signal = "bullish";
        score = 0.7;
        detalle =
          "Stage 3 — Expansión Plena: Los 3 activos suben. Technology aún fuerte, Industriales toman liderazgo.";
        break;
      case 4:
        signal = "bearish";
        score = -0.5;
        detalle =
          "Stage 4 — Techo / Expansión Tardía: Bonos caen, Stocks suben, Commodities suben fuerte. Rotar a Energy, Basic Materials. Cautela.";
        break;
      case 5:
        signal = "bearish";
        score = -0.7;
        detalle =
          "Stage 5 — Contracción Temprana: Bonos caen, Stocks caen, Commodities aún suben. Refugio en Consumer Defensive y Utilities.";
        break;
      case 6:
        signal = "bearish";
        score = -0.9;
        detalle =
          "Stage 6 — Contracción Total: Los 3 activos caen. Cash es king. Bonos largos empiezan a subir (flight-to-quality).";
        break;
    }
  }

  return {
    ruleId: "C15-R1",
    chapter: 15,
    passed: stage != null,
    signal,
    score,
    confianza: confianza ?? "baja",
    detalle,
    evidencia: `Etapa detectada: ${stage ?? "N/A"}. Confianza: ${confianza ?? "N/A"}. Bonds: ${cycleStage.bondsTrend42d ?? "N/A"}, Stocks: ${cycleStage.stocksTrend42d ?? "N/A"}, Commodities: ${cycleStage.commoditiesTrend42d ?? "N/A"}`,
    murphyReference:
      "Murphy Cap. 15: 'The six-stage cycle is the culmination of all intermarket relationships. It synthesizes bond, stock, and commodity trends into a single diagnostic framework.'",
  };
}

function validateCap15Rule2(
  cycleStage: CycleStageData,
  sectorRotation: SectorRotationData,
): ValidationResult {
  // Cross-check: detected stage should align with sector performance
  const stage = cycleStage.detectedStage;
  const techUp = (sectorRotation.technologyReturn3m ?? 0) > 0;
  const energyUp = (sectorRotation.energyReturn3m ?? 0) > 0;
  const defUp =
    (sectorRotation.utilitiesReturn3m ?? 0) > 0 || (sectorRotation.consumerDefensive3m ?? 0) > 0;
  let aligned = true;
  const detalle = "";
  if (stage != null && stage <= 3) aligned = techUp && !defUp;
  else if (stage != null && stage >= 5) aligned = defUp;
  else if (stage === 4) aligned = energyUp;
  else aligned = true;
  const signal: ValidationSignal = aligned ? "bullish" : "warning";
  return {
    ruleId: "C15-R2",
    chapter: 15,
    passed: aligned,
    signal,
    score: aligned ? 0.3 : -0.3,
    confianza: stage != null ? "media" : "baja",
    detalle: aligned
      ? `Rotación sectorial alineada con Stage ${stage}. Diagnóstico de ciclo coherente.`
      : `⚠️ Rotación sectorial NO alineada con Stage ${stage}. Posible transición o divergencia táctica.`,
    evidencia: `Stage: ${stage ?? "N/A"}. Tech: ${(sectorRotation.technologyReturn3m ?? 0).toFixed(2)}%, Energy: ${(sectorRotation.energyReturn3m ?? 0).toFixed(2)}%, Utilities: ${(sectorRotation.utilitiesReturn3m ?? 0).toFixed(2)}%. Alineado: ${aligned}.`,
    murphyReference:
      "Murphy Cap. 15: 'Each stage of the cycle has a characteristic sector leadership pattern. The cycle diagnosis should be confirmed by actual sector rotation data.'",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORQUESTADOR — ejecuta todas las validaciones (25+) y genera el reporte
// ═══════════════════════════════════════════════════════════════════════════════

const CHAPTER_TITLES: Record<number, string> = {
  1: CAP1_TITLE,
  2: CAP2_TITLE,
  3: CAP3_TITLE,
  4: CAP4_TITLE,
  5: CAP5_TITLE,
  6: CAP6_TITLE,
  7: CAP7_TITLE,
  8: CAP8_TITLE,
  9: CAP9_TITLE,
  10: CAP10_TITLE,
  11: CAP11_TITLE,
  12: CAP12_TITLE,
  13: CAP13_TITLE,
  14: CAP14_TITLE,
  15: CAP15_TITLE,
};

const CHAPTER_REGLA_CLAVE: Record<number, string> = {
  1: "CRB/Bonds ratio — relación más temprana del ciclo",
  2: "Commodities/Stocks — régimen inflacionario vs crecimiento",
  3: "Correlación Bonos/Acciones — regímenes normal vs monetario",
  4: "USD/Commodities inversa + Gold/Oil + Copper/Gold",
  5: "Dow Theory — confirmación de tendencia",
  6: "XLY/XLP — confianza del consumidor",
  7: "Bonos lideran acciones en puntos de giro",
  8: "Curva de rendimientos como predictor de recesión",
  9: "Desarrollados vs Emergentes — flujos globales",
  10: "Rotación sectorial — Technology→Energy→Defensivos",
  11: "Growth vs Value — régimen de tasas",
  12: "HYG/LQD — apetito crediticio",
  13: "Política monetaria de la Fed",
  14: "Curva invertida + crédito = predicción de recesión",
  15: "Ciclo completo de 6 etapas",
};

/**
 * Ejecuta TODAS las validaciones contra los datos proporcionados.
 * Retorna un array con 25+ ValidationResult (una por regla).
 */
export function runAllValidations(data: MurphyValidationData): ValidationResult[] {
  const rules: ValidationResult[] = [];

  // Cap 1 (2 reglas)
  rules.push(validateCap1Rule1(data.crbBonds));
  rules.push(validateCap1Rule2(data.crbBonds));

  // Cap 2 (2 reglas)
  rules.push(validateCap2Rule1(data.commoditiesStocks));
  rules.push(validateCap2Rule2(data.commoditiesStocks));

  // Cap 3 (2 reglas)
  rules.push(validateCap3Rule1(data.bondsStocks));
  rules.push(validateCap3Rule2(data.bondsStocks));

  // Cap 4 (2 reglas)
  rules.push(validateCap4Rule1(data.dollar, data.crbData));
  rules.push(validateCap4Rule2(data.goldOil, data.copperGold, data.oilVsOilShares));

  // Cap 5 (2 reglas)
  rules.push(validateCap5Rule1(data.dowTheory));
  rules.push(validateCap5Rule2(data.dowTheory));

  // Cap 6 (2 reglas)
  rules.push(validateCap6Rule1(data.xlyXlp));
  rules.push(validateCap6Rule2(data.xlyXlp, data.sectorRotation));

  // Cap 7 (2 reglas)
  rules.push(validateCap7Rule1(data.bondsStocks, data.leadLag));
  rules.push(validateCap7Rule2(data.bondsStocks));

  // Cap 8 (2 reglas)
  rules.push(validateCap8Rule1(data.yieldCurve));
  rules.push(validateCap8Rule2(data.yieldCurve));

  // Cap 9 (2 reglas + 1 Japan)
  rules.push(validateCap9Rule1(data.international));
  rules.push(validateCap9Rule2(data.international, data.dollar));
  if (data.ewjSpy) rules.push(validateCap9bRule1(data.ewjSpy));

  // Cap 10 (4 reglas + 1 Gold Stocks)
  rules.push(validateCap10Rule1(data.sectorRotation, data.cycleStage));
  rules.push(validateCap10Rule2(data.sectorRotation, data.iwmSpy));
  rules.push(validateCap10Rule3(data.sectorRotation, data.ndxSpx));
  rules.push(validateCap10Rule4(data.sectorRotation, data.cycleStage));
  if (data.gdxGld) rules.push(validateCap10bRule1(data.gdxGld));

  // Cap 11 (2 reglas)
  rules.push(validateCap11Rule1(data.growthValue, data.yieldCurve));
  rules.push(validateCap11Rule2(data.growthValue));

  // Cap 12 (2 reglas)
  rules.push(validateCap12Rule1(data.creditMarket));
  rules.push(validateCap12Rule2(data.creditMarket, data.bondsStocks));

  // Cap 13 (2 reglas)
  rules.push(validateCap13Rule1(data.fedMonetary, data.yieldCurve));
  rules.push(validateCap13Rule2(data.fedMonetary));

  // Cap 14 (2 reglas)
  rules.push(validateCap14Rule1(data.yieldCurveInversion, data.creditMarket));
  rules.push(validateCap14Rule2(data.yieldCurveInversion, data.sp500OneYearReturn));

  // Cap 15 (2 reglas)
  rules.push(validateCap15Rule1(data.cycleStage));
  rules.push(validateCap15Rule2(data.cycleStage, data.sectorRotation));

  return rules;
}

/**
 * Agrupa los ValidationResult por capítulo y produce un ChapterSummary para cada uno.
 */
function summarizeChapters(rules: ValidationResult[]): ChapterSummary[] {
  const chapterMap = new Map<number, ValidationResult[]>();
  for (const rule of rules) {
    const arr = chapterMap.get(rule.chapter) ?? [];
    arr.push(rule);
    chapterMap.set(rule.chapter, arr);
  }

  const summaries: ChapterSummary[] = [];
  for (let ch = 1; ch <= 15; ch++) {
    const chapterRules = chapterMap.get(ch) ?? [];
    if (chapterRules.length === 0) continue;
    const passedCount = chapterRules.filter((r) => r.passed).length;
    const avgScore = chapterRules.reduce((s, r) => s + r.score, 0) / chapterRules.length;
    // Signal: majority vote weighted by absolute score
    const bullishWeight = chapterRules
      .filter((r) => r.signal === "bullish")
      .reduce((s, r) => s + Math.abs(r.score), 0);
    const bearishWeight = chapterRules
      .filter((r) => r.signal === "bearish")
      .reduce((s, r) => s + Math.abs(r.score), 0);
    const warningWeight = chapterRules
      .filter((r) => r.signal === "warning")
      .reduce((s, r) => s + Math.abs(r.score), 0);
    let signal: ValidationSignal = "neutral";
    if (warningWeight > bullishWeight && warningWeight > bearishWeight) signal = "warning";
    else if (bullishWeight > bearishWeight && bullishWeight > warningWeight) signal = "bullish";
    else if (bearishWeight > bullishWeight && bearishWeight > warningWeight) signal = "bearish";
    // Confidence based on bullish+bearish weight vs total
    const totalWeight = bullishWeight + bearishWeight + warningWeight;
    const strongestWeight = Math.max(bullishWeight, bearishWeight, warningWeight);
    const confianza: ConfidenceLevel =
      totalWeight > 2 ? "alta" : totalWeight > 0.8 ? "media" : "baja";

    summaries.push({
      chapter: ch,
      title: CHAPTER_TITLES[ch] ?? `Cap. ${ch}`,
      rulesCount: chapterRules.length,
      passedCount,
      compositeScore: Math.round(avgScore * 100) / 100,
      signal,
      confianza,
      reglaClave: CHAPTER_REGLA_CLAVE[ch] ?? "",
    });
  }
  return summaries;
}

/**
 * Detecta divergencias (contradicciones) entre diferentes capítulos.
 * Ej: Cap 3 dice riesgo-on pero Cap 12 dice estrés crediticio.
 */
function detectDivergencias(rules: ValidationResult[], chapters: ChapterSummary[]): string[] {
  const divergencias: string[] = [];

  // Divergencia bullish vs bearish entre capítulos (por señal, no por threshold)
  const bullishChapters = chapters.filter((c) => c.signal === "bullish");
  const bearishChapters = chapters.filter((c) => c.signal === "bearish");
  if (bullishChapters.length >= 2 && bearishChapters.length >= 2) {
    divergencias.push(
      `Divergencia entre capítulos: ${bullishChapters.length} alcistas vs ${bearishChapters.length} bajistas. ` +
        `Señales mixtas — recomendar cautela y esperar convergencia.`,
    );
  }

  // Divergencia Cap 6 (consumidor confiado) vs Cap 12 (crédito estresado)
  const cap6 = chapters.find((c) => c.chapter === 6);
  const cap12 = chapters.find((c) => c.chapter === 12);
  if (cap6 && cap12 && cap6.compositeScore > 0.3 && cap12.compositeScore < -0.3) {
    divergencias.push(
      `⚠️ Divergencia CONSUMIDOR vs CRÉDITO: XLY/XLP (Cap.6) alcista pero HYG/LQD (Cap.12) bajista. ` +
        `Consumidor confiado mientras crédito se deteriora — señal mixta que suele resolverse con el crédito liderando.`,
    );
  }

  // Divergencia Cap 5 Dow Theory (bajista) vs Cap 2 (commodities/stocks alcista)
  const cap5 = chapters.find((c) => c.chapter === 5);
  const cap2 = chapters.find((c) => c.chapter === 2);
  if (cap5 && cap2 && cap5.compositeScore < -0.3 && cap2.compositeScore > 0.3) {
    divergencias.push(
      `⚠️ Dow Theory bajista mientras régimen commodities/acciones es alcista. Posible giro táctico vs estructural.`,
    );
  }

  // Divergencia Cap 8 (curva normal) vs Cap 14 (inversión detectada)
  const cap8 = chapters.find((c) => c.chapter === 8);
  const cap14 = chapters.find((c) => c.chapter === 14);
  if (cap8 && cap14 && cap8.compositeScore > 0.2 && cap14.compositeScore < -0.3) {
    divergencias.push(
      `Cap.8 (curva normal/steepening) vs Cap.14 (inversión y recesión) divergen. Posible diferencia entre 10Y-2Y y 10Y-3M. Verificar ambos spreads.`,
    );
  }

  // Buscar reglas warning
  const warningRules = rules.filter((r) => r.signal === "warning");
  for (const wr of warningRules) {
    divergencias.push(`⚠️ [${wr.ruleId}] ${wr.detalle}`);
  }

  return divergencias;
}

/**
 * Genera el resumen ejecutivo a partir del reporte.
 */
function generateResumenEjecutivo(report: MurphyReport): string {
  const bullish = report.chapters.filter((c) => c.signal === "bullish").length;
  const bearish = report.chapters.filter((c) => c.signal === "bearish").length;
  const warnings = report.chapters.filter((c) => c.signal === "warning").length;
  const neutral = report.chapters.filter((c) => c.signal === "neutral").length;
  const highConf = report.chapters.filter((c) => c.confianza === "alta").length;

  let summary = `Diagnóstico Intermarket Murphy: ${report.totalRules} reglas evaluadas, ${report.chapters.length} capítulos. `;

  if (report.overallSignal === "bullish") {
    summary += "VISIÓN GENERAL ALCISTA. ";
  } else if (report.overallSignal === "bearish") {
    summary += "VISIÓN GENERAL BAJISTA. ";
  } else if (report.overallSignal === "warning") {
    summary += "VISIÓN GENERAL CON ADVERTENCIAS. ";
  } else {
    summary += "VISIÓN GENERAL NEUTRAL. ";
  }

  summary += `${bullish} alcistas, ${bearish} bajistas, ${warnings} advertencias, ${neutral} neutrales. `;
  if (highConf >= 5) summary += `${highConf} capítulos con alta confianza. `;

  if (report.divergencias.length > 0) {
    summary += `⚠️ ${report.divergencias.length} divergencia(s) detectada(s). Señales mixtas — cautela. `;
  }

  return summary;
}

/**
 * A partir del reporte completo, determina sectores favorecidos y a evitar.
 */
const SECTOR_MAP: Record<string, string[]> = {
  "Energy, Basic Materials": ["Energy", "Basic Materials"],
  "Technology, Consumer Cyclical": ["Technology", "Consumer Cyclical"],
  "Growth, Technology": ["Growth", "Technology"],
  "Consumer Discretionary, Technology": ["Consumer Discretionary", "Technology"],
  "Financials, Growth": ["Financials", "Growth"],
  "Technology, Industrials, Consumer Cyclical": ["Technology", "Industrials", "Consumer Cyclical"],
  "High Yield, Growth, Small Caps": ["High Yield", "Growth", "Small Caps"],
  "Materials, Energy, Industrials": ["Materials", "Energy", "Industrials"],
  "Small Caps, Growth, Technology": ["Small Caps", "Growth", "Technology"],
  "Cíclicos, Financials": ["Cíclicos", "Financials"],
  "High Yield, Small Caps, Growth": ["High Yield", "Small Caps", "Growth"],
  "Cíclicos, Energy, Materials, Financials": ["Cíclicos", "Energy", "Materials", "Financials"],
};

function splitSectors(key: string): string[] {
  return SECTOR_MAP[key] ?? [key];
}

/**
 * Sectores que LIDERAN en cada etapa del ciclo (Pring/Stovall).
 * Se usa para evitar recomendar "evitar" sectores que deberían liderar.
 */
const STAGE_LEADERS: Record<number, string[]> = {
  1: [
    "Technology",
    "Consumer Discretionary",
    "Consumer Cyclical",
    "Financials",
    "Small Caps",
    "Growth",
  ],
  2: ["Technology", "Industrials", "Materials", "Financials", "Consumer Cyclical"],
  3: ["Energy", "Materials", "Healthcare", "Gold", "Basic Materials"],
  4: ["Utilities", "Consumer Staples", "Healthcare", "Gold", "Cash"],
  5: ["Consumer Staples", "Utilities", "Healthcare", "Gold", "Bonds"],
  6: ["Cash", "Gold", "T-bills"],
};

function determinarSectores(report: MurphyReport): { favorecidos: string[]; evitar: string[] } {
  const favorecidos = new Set<string>();
  const evitar = new Set<string>();

  for (const chapter of report.chapters) {
    if (chapter.signal === "bullish" && chapter.compositeScore > 0.3) {
      switch (chapter.chapter) {
        case 1:
          splitSectors("Energy, Basic Materials").forEach((s) => favorecidos.add(s));
          break;
        case 2:
          splitSectors("Technology, Consumer Cyclical").forEach((s) => favorecidos.add(s));
          break;
        case 3:
          splitSectors("Growth, Technology").forEach((s) => favorecidos.add(s));
          break;
        case 6:
          splitSectors("Consumer Discretionary, Technology").forEach((s) => favorecidos.add(s));
          break;
        case 7:
          splitSectors("Financials, Growth").forEach((s) => favorecidos.add(s));
          break;
        case 10:
          splitSectors("Technology, Industrials, Consumer Cyclical").forEach((s) =>
            favorecidos.add(s),
          );
          break;
        case 11:
          favorecidos.add("Growth");
          break;
      }
    } else if (chapter.signal === "bearish" && chapter.compositeScore < -0.3) {
      switch (chapter.chapter) {
        case 1:
          splitSectors("Energy, Basic Materials").forEach((s) => evitar.add(s));
          break;
        case 2:
          evitar.add("Cíclicos");
          break;
        case 4:
          splitSectors("Materials, Energy, Industrials").forEach((s) => evitar.add(s));
          break;
        case 5:
          splitSectors("Small Caps, Growth, Technology").forEach((s) => evitar.add(s));
          break;
        case 6:
          splitSectors("Consumer Discretionary, Technology").forEach((s) => evitar.add(s));
          break;
        case 8:
          splitSectors("Cíclicos, Financials").forEach((s) => evitar.add(s));
          break;
        case 10:
          splitSectors("Technology, Consumer Cyclical").forEach((s) => evitar.add(s));
          break;
        case 11:
          evitar.add("Growth");
          break;
        case 12:
          splitSectors("High Yield, Small Caps, Growth").forEach((s) => evitar.add(s));
          break;
        case 14:
          splitSectors("Cíclicos, Energy, Materials, Financials").forEach((s) => evitar.add(s));
          break;
      }
    }
  }

  // ─── Cross-check contra la etapa del ciclo ──────────────────────
  // Si la etapa detectada dice que cierto sector DEBERÍA liderar,
  // no lo recomendamos como "evitar" (sería contradictorio).
  const stage = report.detectedStage;
  if (stage != null && STAGE_LEADERS[stage]) {
    for (const s of STAGE_LEADERS[stage]) {
      // Normalizar: "Consumer Staples" ⊆ "Consumer Defensive", "Consumer Cyclical" ⊆ "Consumer Discretionary"
      evitar.delete(s);
      // También eliminar variantes con nombre similar
      if (s === "Technology") evitar.delete("Tech");
      if (s === "Consumer Discretionary") evitar.delete("Consumer Cyclical");
      if (s === "Consumer Staples") evitar.delete("Consumer Defensive");
    }
  }

  const favorecidosArr = Array.from(favorecidos);
  const evitarArr = Array.from(evitar);

  if (report.divergencias.length > 2) {
    return {
      favorecidos: favorecidosArr.slice(0, 3),
      evitar: evitarArr.slice(0, 3),
    };
  }

  return { favorecidos: favorecidosArr, evitar: evitarArr };
}

/**
 * Punto de entrada principal: ejecuta todas las validaciones y produce el reporte completo.
 */
export function generateMurphyReport(data: MurphyValidationData): MurphyReport {
  const rules = runAllValidations(data);
  const chapters = summarizeChapters(rules);
  const overallScore = chapters.reduce((s, c) => s + c.compositeScore, 0) / chapters.length;

  // Overall signal by weighted vote + score magnitude
  const bullishScore = chapters
    .filter((c) => c.compositeScore > 0)
    .reduce((s, c) => s + c.compositeScore, 0);
  const bearishScore = Math.abs(
    chapters.filter((c) => c.compositeScore < 0).reduce((s, c) => s + c.compositeScore, 0),
  );
  let overallSignal: ValidationSignal = "neutral";
  if (Math.abs(overallScore) < 0.15) {
    overallSignal = "neutral";
  } else if (bullishScore > bearishScore * 1.5) overallSignal = "bullish";
  else if (bearishScore > bullishScore * 1.5) overallSignal = "bearish";
  else if (chapters.some((c) => c.signal === "warning") && Math.abs(overallScore) < 0.3)
    overallSignal = "warning";

  const highConfCount = chapters.filter((c) => c.confianza === "alta").length;
  const overallConfianza: ConfidenceLevel =
    highConfCount >= 7 ? "alta" : highConfCount >= 3 ? "media" : "baja";

  const divergencias = detectDivergencias(rules, chapters);

  const report: MurphyReport = {
    generatedAt: new Date().toISOString(),
    totalRules: rules.length,
    totalPassed: rules.filter((r) => r.passed).length,
    overallScore: Math.round(overallScore * 100) / 100,
    overallSignal,
    overallConfianza,
    chapters,
    rules,
    divergencias,
    resumenEjecutivo: "",
    sectoresFavorecidos: [],
    sectoresEvitar: [],
    detectedStage: data.cycleStage?.detectedStage ?? null,
  };

  report.resumenEjecutivo = generateResumenEjecutivo(report);
  const { favorecidos, evitar } = determinarSectores(report);
  report.sectoresFavorecidos = favorecidos;
  report.sectoresEvitar = evitar;

  return report;
}
