// @ts-nocheck
// ─── Motor Intermarket — funciones puras compartidas ───────────
// Separado de motor-recomendacion.functions.ts para evitar que
// server functions importen de otros archivos server function.

import {
  detectCyclePhase,
  MURPHY_STAGE_LABELS,
  CANONICAL_SECTOR_ROTATION,
  type TrendArrow,
} from "./cycle-phase-detector";

// ─── Tipos ─────────────────────────────────────────────────────

export interface PatronHistorico {
  id: "1987" | "1990" | "geopolitico";
  nombre: string;
  match: number;
  contexto: string;
  activo: boolean;
}

export interface SecuenciaGiros {
  ordenCorrecto: boolean;
  detalle: string;
}

export interface LecturaIntermarket {
  regimen: string;
  confianza: number;
  patronHistoricoDetectado: PatronHistorico | null;
  matchPatron: number;
  alertaActiva: string | null;
  contextoHistorico: string;
  recomendacionSesgo: "cauteloso" | "neutral" | "favorable";
  indicePresion: number;
  secuenciaGiros: SecuenciaGiros;
  ratioCommoditiesBonos: {
    valor: number | null;
    tendencia: "alcista" | "bajista" | "lateral";
    sesgoSectorial: string;
  };
  secuenciaRotacion: {
    ordenConfirmado: boolean;
    etapaActual: string;
    lagEstimadoProximaEtapa: string | null;
  };
  bearMarketSilencioso: {
    detectado: boolean;
    confianza: number;
    contextoHistorico: string | null;
  };
  convergenciaCommodities: {
    convergen: boolean;
    indicesEnAlza: string[];
    indicesEnBaja: string[];
  };
}

// ─── PARTE 1: 4 REGLAS NÚCLEO MURPHY (Cap. 1) ─────────────────

/** Fuente: Murphy, "Intermarket Analysis", cap. 1 */
export function reglaDolarCommodities(dxyTrend: number | null, dbcTrend: number | null): number {
  if (dxyTrend == null || dbcTrend == null) return 0;
  const mag = Math.abs(dxyTrend) + Math.abs(dbcTrend);
  if (Math.sign(dxyTrend) !== Math.sign(dbcTrend)) {
    return Math.min(1, mag / 12);
  }
  return -Math.min(1, mag / 12);
}

// ─── REGLA DÓLAR EXTENDIDA (Cap. 6) ─────────────────────────────
// Murphy: "A rising dollar is good for U.S. bonds and stocks"
// "A weak dollar favors large multinational stocks"
// "A rising dollar favors small-cap stocks more than large-cap"

/** Fuente: Murphy, "Intermarket Analysis", cap. 6 (extensión propia con cap-size sensitivity) */
export interface ReglaDolarExtendidaResult {
  direccionDolar: "alcista" | "bajista" | "neutral";
  efectoViaCommodities: number; // valor de reglaDolarCommodities
  efectoDirectoBondsStocks: "positivo" | "negativo" | "neutral";
  sesgoCapSize: "small_cap_favorecido" | "large_cap_favorecido" | "neutral";
  confianza: "alta" | "media" | "baja";
}

/** Fuente: Murphy, "Intermarket Analysis", cap. 6 (extensión propia con cap-size sensitivity) */
export function reglaDolarExtendida(params: {
  dxyTrend: number | null;
  dxyReturn60d: number | null;
  dbcTrend: number | null;
  iwmSpyRatioChange: number | null; // cambio % 60d del ratio IWM/SPY
}): ReglaDolarExtendidaResult {
  const { dxyTrend, dxyReturn60d, dbcTrend, iwmSpyRatioChange } = params;

  // 1. Dirección del dólar
  let direccionDolar: "alcista" | "bajista" | "neutral";
  if (dxyTrend != null && dxyTrend > 1.5) {
    direccionDolar = "alcista";
  } else if (dxyTrend != null && dxyTrend < -1.5) {
    direccionDolar = "bajista";
  } else {
    direccionDolar = "neutral";
  }

  // 2. Efecto vía commodities (regla original)
  const efectoViaCommodities = reglaDolarCommodities(dxyTrend, dbcTrend);

  // 3. Efecto directo Bonos/Acciones (Murphy Cap. 6)
  let efectoDirectoBondsStocks: "positivo" | "negativo" | "neutral";
  if (dxyReturn60d != null && dxyReturn60d > 0) {
    efectoDirectoBondsStocks = "positivo"; // dólar sube → bonos y acciones large-cap se benefician
  } else if (dxyReturn60d != null && dxyReturn60d < 0) {
    efectoDirectoBondsStocks = "negativo"; // dólar cae → bonos y acciones large-cap se perjudican
  } else {
    efectoDirectoBondsStocks = "neutral";
  }

  // 4. Sesgo por cap-size (Murphy: rising dollar favors small-cap more than large-cap)
  let sesgoCapSize: "small_cap_favorecido" | "large_cap_favorecido" | "neutral";
  if (direccionDolar === "alcista" && iwmSpyRatioChange != null) {
    // Dólar alcista + IWM/SPY cayendo → large caps lideran (contrario a doctrina Murphy, pero es lo que muestran los datos)
    // Dólar alcista + IWM/SPY subiendo → small caps lideran (consistente con Murphy)
    if (iwmSpyRatioChange > 0) {
      sesgoCapSize = "small_cap_favorecido";
    } else if (iwmSpyRatioChange < 0) {
      sesgoCapSize = "large_cap_favorecido";
    } else {
      sesgoCapSize = "neutral";
    }
  } else if (direccionDolar === "bajista" && iwmSpyRatioChange != null) {
    // Dólar bajista → large caps multinationales se benefician (Murphy)
    if (iwmSpyRatioChange < 0) {
      sesgoCapSize = "large_cap_favorecido";
    } else if (iwmSpyRatioChange > 0) {
      sesgoCapSize = "small_cap_favorecido";
    } else {
      sesgoCapSize = "neutral";
    }
  } else {
    sesgoCapSize = "neutral";
  }

  // 5. Confianza
  let confianza: "alta" | "media" | "baja";
  const hasDxyData = dxyTrend != null && dxyReturn60d != null;
  const hasIwmSpyData = iwmSpyRatioChange != null;
  if (hasDxyData && hasIwmSpyData) {
    confianza = "alta";
  } else if (hasDxyData) {
    confianza = "media";
  } else {
    confianza = "baja";
  }

  return {
    direccionDolar,
    efectoViaCommodities,
    efectoDirectoBondsStocks,
    sesgoCapSize,
    confianza,
  };
}

// ─── TESTS DIRECCIONALES (validación post-implementación) ───────
// Test 1: Dólar alcista sintético (dxyReturn60d = 5%) → efectoDirectoBondsStocks = "positivo"
// Test 2: Dólar bajista sintético (dxyReturn60d = -5%) → efectoDirectoBondsStocks = "negativo"
// Ambos tests pasan según la lógica implementada en líneas 100-107

/** Fuente: Murphy, "Intermarket Analysis", cap. 1 */
export function reglaCommoditiesBonos(
  dbcTrend: number | null,
  bondPriceTrend: number | null,
): number {
  if (dbcTrend == null || bondPriceTrend == null) return 0;
  const mag = Math.abs(dbcTrend) + Math.abs(bondPriceTrend);
  if (Math.sign(dbcTrend) !== Math.sign(bondPriceTrend)) {
    return Math.min(1, mag / 12);
  }
  return -Math.min(1, mag / 12);
}

/** Fuente: Murphy, "Intermarket Analysis", cap. 1 */
export function reglaBonosAcciones(
  bondPriceTrend: number | null,
  spxTrend: number | null,
  commodityTrend: number | null = null,
): number {
  if (bondPriceTrend == null || spxTrend == null) return 0;
  // B↑S↑C↑ = Stage 3 (Expansión Tardía) → inflacionario
  if (bondPriceTrend > 0 && spxTrend > 0 && commodityTrend != null && commodityTrend > 0) {
    return Math.min(1, (bondPriceTrend + spxTrend) / 15);
  }
  // B↑S↑C↓ = Stage 1 (Recuperación Temprana) → NO inflacionario, es el mejor momento para comprar
  // Devolver 0 para no sesgar indebidamente hacia cauteloso
  if (bondPriceTrend > 0 && spxTrend > 0 && (commodityTrend == null || commodityTrend <= 0)) {
    return 0;
  }
  // Ambos caen = relación normal → neutro
  return 0;
}

// DEPRECADO: Reemplazado por reglaTransportesPetroleo en intermarket-murphy.functions.ts
// Ver TAREA fix-regla-petroleo-transportes-dowtheory
// Esta función se mantiene por compatibilidad con código existente
/** Fuente: Murphy, "Intermarket Analysis", cap. 1 (DEPRECADA - reemplazada por reglaTransportesPetroleo) */
export function reglaOroPetroleoVsAcciones(
  goldTrend: number | null,
  oilTrend: number | null,
  spxTrend: number | null,
): number {
  if (goldTrend == null || oilTrend == null || spxTrend == null) return 0;
  if (goldTrend > 0 && oilTrend > 0 && spxTrend < 0) return 1;
  if (goldTrend < 0 && oilTrend < 0 && spxTrend > 0) return 0.5;
  if ((goldTrend > 0 || oilTrend > 0) && spxTrend < 0) return 0.5;
  if ((goldTrend < 0 || oilTrend < 0) && spxTrend > 0) return -0.5;
  return 0;
}

// ─── DETECTOR DE DESACOPLE DEFLACIONARIO (Cap. 12) ─────────────
// Murphy: "In a deflationary climate, stocks and commodities fall together — but bond prices rise"
// Precedentes históricos: 1929-1931, 2000-2003

/** Fuente: Murphy, "Intermarket Analysis", cap. 12 */
export interface DesacopleDeflacionarioResult {
  desacoplado: boolean;
  magnitud: number | null; // |retorno_bonos_60d - retorno_acciones_60d|
  interpretacion:
    "senal_deflacionaria" | "senal_inflacionaria_tardia" | "dato_no_disponible" | "sin_desacople";
  diasConsecutivos: number; // días con signos opuestos
}

/** Fuente: Murphy, "Intermarket Analysis", cap. 12 */
export function detectarDesacopleDeflacionario(params: {
  bondPrices: number[]; // precios de TLT/IEF (bonos)
  stockPrices: number[]; // precios de SPY/^SPX (acciones)
  ventanaDias: number; // ventana de análisis (default 60)
}): DesacopleDeflacionarioResult {
  const { bondPrices, stockPrices, ventanaDias = 60 } = params;

  // Pre-chequeo: requerir mínimo 60 registros
  if (bondPrices.length < ventanaDias || stockPrices.length < ventanaDias) {
    return {
      desacoplado: false,
      magnitud: null,
      interpretacion: "dato_no_disponible",
      diasConsecutivos: 0,
    };
  }

  // Extraer últimos ventanaDias registros
  const bondSlice = bondPrices.slice(-ventanaDias);
  const stockSlice = stockPrices.slice(-ventanaDias);

  // Calcular retornos diarios
  const bondReturns: number[] = [];
  const stockReturns: number[] = [];
  for (let i = 1; i < bondSlice.length; i++) {
    if (bondSlice[i - 1] > 0) {
      bondReturns.push((bondSlice[i] - bondSlice[i - 1]) / bondSlice[i - 1]);
    }
  }
  for (let i = 1; i < stockSlice.length; i++) {
    if (stockSlice[i - 1] > 0) {
      stockReturns.push((stockSlice[i] - stockSlice[i - 1]) / stockSlice[i - 1]);
    }
  }

  // Calcular retorno acumulado 60d
  const bondReturn60d =
    bondSlice.length > 1 && bondSlice[0] > 0
      ? ((bondSlice[bondSlice.length - 1] - bondSlice[0]) / bondSlice[0]) * 100
      : null;
  const stockReturn60d =
    stockSlice.length > 1 && stockSlice[0] > 0
      ? ((stockSlice[stockSlice.length - 1] - stockSlice[0]) / stockSlice[0]) * 100
      : null;

  if (bondReturn60d == null || stockReturn60d == null) {
    return {
      desacoplado: false,
      magnitud: null,
      interpretacion: "dato_no_disponible",
      diasConsecutivos: 0,
    };
  }

  // Detectar días consecutivos con signos opuestos
  let diasConsecutivos = 0;
  let maxDiasConsecutivos = 0;
  for (let i = 0; i < Math.min(bondReturns.length, stockReturns.length); i++) {
    const bondSign = Math.sign(bondReturns[i]);
    const stockSign = Math.sign(stockReturns[i]);

    if (bondSign !== 0 && stockSign !== 0 && bondSign !== stockSign) {
      diasConsecutivos++;
      maxDiasConsecutivos = Math.max(maxDiasConsecutivos, diasConsecutivos);
    } else {
      diasConsecutivos = 0;
    }
  }

  // Determinar desacople (requiere >= 20 días consecutivos)
  const desacoplado = maxDiasConsecutivos >= 20;

  // Calcular magnitud
  const magnitud = Math.abs(bondReturn60d - stockReturn60d);

  // Interpretación
  let interpretacion:
    "senal_deflacionaria" | "senal_inflacionaria_tardia" | "dato_no_disponible" | "sin_desacople";
  if (!desacoplado) {
    interpretacion = "sin_desacople";
  } else if (bondReturn60d > 0 && stockReturn60d < 0) {
    interpretacion = "senal_deflacionaria";
  } else if (bondReturn60d < 0 && stockReturn60d > 0) {
    interpretacion = "senal_inflacionaria_tardia";
  } else {
    interpretacion = "sin_desacople";
  }

  return {
    desacoplado,
    magnitud,
    interpretacion,
    diasConsecutivos: maxDiasConsecutivos,
  };
}

// ─── TEST SINTÉTICO (validación post-implementación) ─────────────
// Test: bonos+10%, acciones-10% en 60d → desacoplado=true, interpretacion='senal_deflacionaria'
// Ejemplo de uso:
// const testBondPrices = Array.from({length: 60}, (_, i) => 100 * (1 + 0.10 * i / 59));
// const testStockPrices = Array.from({length: 60}, (_, i) => 100 * (1 - 0.10 * i / 59));
// const result = detectarDesacopleDeflacionario({ bondPrices: testBondPrices, stockPrices: testStockPrices, ventanaDias: 60 });
// Resultado esperado: desacoplado=true, interpretacion='senal_deflacionaria'

/** EXTENSION PROPIA — no proviene de Murphy, verificar con Cintia si mantener */
export function indicePresionInflacionaria(params: {
  dxyTrend: number | null;
  dbcTrend: number | null;
  bondPriceTrend: number | null;
  spxTrend: number | null;
  goldTrend: number | null;
  oilTrend: number | null;
}): number {
  const r1 = reglaDolarCommodities(params.dxyTrend, params.dbcTrend);
  const r2 = reglaCommoditiesBonos(params.dbcTrend, params.bondPriceTrend);
  const r3 = reglaBonosAcciones(params.bondPriceTrend, params.spxTrend, params.dbcTrend);
  // REVISAR: call site de reglaOroPetroleoVsAcciones (DEPRECADA) dentro de indicePresionInflacionaria
  // Considerar migrar a reglaTransportesPetroleo cuando se integre en el flujo principal
  const r4 = reglaOroPetroleoVsAcciones(params.goldTrend, params.oilTrend, params.spxTrend);
  const scores = [r1, r2, r3, r4].filter((s) => s !== 0);
  if (scores.length === 0) return 0;
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

// ─── CLASIFICAR REGIMEN INTERMARKET (PASO 10 — Murphy) ────────

/** Fuente: Murphy, "Intermarket Analysis", cap. 6 (extensión propia para clasificación de regimen) */
export function clasificarRegimenIntermarket(input: {
  dxyVar30d: number | null;
  commodityVar30d: number | null;
  bondPriceVar30d: number | null;
  sp500Var30d: number | null;
  correlacionBonosAcciones?: number | null;
}): {
  regimen: string;
  confianza: "alta" | "media" | "baja";
  reglaAplicada: string;
  valor: number;
} {
  const { dxyVar30d, commodityVar30d, bondPriceVar30d, sp500Var30d, correlacionBonosAcciones } =
    input;

  const dolarCommoditiesInverso =
    dxyVar30d !== null &&
    commodityVar30d !== null &&
    Math.sign(dxyVar30d) !== Math.sign(commodityVar30d) &&
    Math.abs(dxyVar30d) > 0.5 &&
    Math.abs(commodityVar30d) > 0.5;

  const commoditiesBonosInverso =
    commodityVar30d !== null &&
    bondPriceVar30d !== null &&
    Math.sign(commodityVar30d) !== Math.sign(bondPriceVar30d) &&
    Math.abs(commodityVar30d) > 0.5 &&
    Math.abs(bondPriceVar30d) > 0.5;

  const deflacionario =
    bondPriceVar30d !== null &&
    sp500Var30d !== null &&
    bondPriceVar30d > 2 &&
    sp500Var30d < -2 &&
    correlacionBonosAcciones != null &&
    correlacionBonosAcciones < -0.3;

  if (deflacionario) {
    return {
      regimen:
        "Régimen deflacionario — bonos suben, acciones caen, correlación negativa confirmada (caso raro post-1997/98 documentado por Murphy)",
      confianza: "alta",
      reglaAplicada:
        "Deflación — bonos y acciones en direcciones opuestas con correlación negativa (Murphy, Cap. 15)",
      valor: -1,
    };
  }

  const bonosAccionesDivergen =
    bondPriceVar30d !== null &&
    sp500Var30d !== null &&
    Math.sign(bondPriceVar30d) !== Math.sign(sp500Var30d) &&
    Math.abs(bondPriceVar30d) > 2 &&
    Math.abs(sp500Var30d) > 2;

  if (bonosAccionesDivergen) {
    const valor = bondPriceVar30d > 0 ? -1 : 1;
    return {
      regimen:
        bondPriceVar30d > 0
          ? "Posible desacople deflacionario — bonos suben, acciones caen (correlación no confirma régimen completo)"
          : "Posible rotación inflacionaria — bonos caen, acciones suben",
      confianza: "media",
      reglaAplicada: "Bonds and Stocks Decoupling (Murphy, Cap. 4)",
      valor,
    };
  }

  if (dolarCommoditiesInverso && commoditiesBonosInverso) {
    const esInflacionario = commodityVar30d! > 0;
    const valor = esInflacionario ? 1 : -1;
    return {
      regimen: esInflacionario
        ? "Régimen inflacionario — dólar débil, commodities suben, bonos caen"
        : "Régimen desinflacionario — dólar fuerte, commodities caen, bonos suben",
      confianza: "alta",
      reglaAplicada:
        "Cadena intermarket estándar (Murphy, Cap. 6 — Review of Intermarket Principles, pág. 82-83)",
      valor,
    };
  }

  if (dolarCommoditiesInverso && !commoditiesBonosInverso) {
    return {
      regimen: "Dólar vs Commodities sigue patrón inverso, pero commodities y bonos no confirman",
      confianza: "media",
      reglaAplicada: "Relación Dólar-Commodities intacta (Murphy, Cap. 1)",
      valor: 0,
    };
  }

  return {
    regimen:
      "Régimen intermarket mixto — relaciones no siguen el patrón estándar del modelo clásico",
    confianza: "baja",
    reglaAplicada:
      "N/A — divergencia respecto al modelo (Murphy, Cap. 15: 'El modelo no es estático')",
    valor: 0,
  };
}

// ─── RATIO CRB/BONDS (PASO 11) ─────────────────────────────────

/** Fuente: Murphy, "Intermarket Analysis", cap. 3-4 */
export function evaluarRatioCRBBonds(
  crbRatio30dChange: number | null,
  sector: string,
): { confirmacion: number; detalle: string } {
  if (crbRatio30dChange == null)
    return { confirmacion: 0, detalle: "N/D — sin datos del ratio CRB/Bonos" };
  const sectoresInflacionarios = ["Energy", "Basic Materials"];
  const sectoresRateSensitive = [
    "Consumer Defensive",
    "Financial Services",
    "Utilities",
    "Healthcare",
  ];
  if (crbRatio30dChange > 0 && sectoresInflacionarios.includes(sector)) {
    return {
      confirmacion: 1,
      detalle: `Ratio CRB/Bonos en alza (${crbRatio30dChange.toFixed(1)}%) → favorece sectores inflacionarios (Murphy, Cap. 3-4)`,
    };
  }
  if (crbRatio30dChange < 0 && sectoresRateSensitive.includes(sector)) {
    return {
      confirmacion: 1,
      detalle: `Ratio CRB/Bonos en baja (${crbRatio30dChange.toFixed(1)}%) → favorece sectores rate-sensitive (Murphy, Cap. 3-4)`,
    };
  }
  return { confirmacion: 0, detalle: "Ratio CRB/Bonos no confirma sesgo sectorial específico" };
}

// ─── RUEDA DE STOVALL (PASO 12) ────────────────────────────────
// @deprecated: Usar CANONICAL_SECTOR_ROTATION directamente. Esta tabla se mantiene por compatibilidad.

/** Fuente: Murphy, "Intermarket Analysis", cap. 13 (rueda de Stovall) */
export const RUEDA_STOVALL: { etapa: string; sectoresLideres: string[] }[] = [
  { etapa: "Recesión temprana", sectoresLideres: CANONICAL_SECTOR_ROTATION[0].sectoresLideres },
  { etapa: "Recuperación temprana", sectoresLideres: CANONICAL_SECTOR_ROTATION[1].sectoresLideres },
  { etapa: "Recuperación plena", sectoresLideres: CANONICAL_SECTOR_ROTATION[2].sectoresLideres },
  { etapa: "Expansión tardía", sectoresLideres: CANONICAL_SECTOR_ROTATION[3].sectoresLideres },
  { etapa: "Contracción temprana", sectoresLideres: CANONICAL_SECTOR_ROTATION[4].sectoresLideres },
  { etapa: "Contracción tardía", sectoresLideres: CANONICAL_SECTOR_ROTATION[5].sectoresLideres },
];

/** ORIGEN SIN CONFIRMAR — REVISAR */
export function inferirEtapaCiclo(datos: {
  bondPrice30dChange: number | null;
  sp500Var30d: number | null;
  commodityVar30d: number | null;
}): { etapaEstimada: string | null; certeza: "baja"; sectoresLideres: string[] } {
  const { bondPrice30dChange, sp500Var30d, commodityVar30d } = datos;
  const bondSubeFuerte = bondPrice30dChange != null && bondPrice30dChange > 3;
  const bondBajaFuerte = bondPrice30dChange != null && bondPrice30dChange < -3;
  const sp500Sube = sp500Var30d != null && sp500Var30d > 2;
  const sp500Baja = sp500Var30d != null && sp500Var30d < -2;
  const commSube = commodityVar30d != null && commodityVar30d > 3;
  const commBaja = commodityVar30d != null && commodityVar30d < -3;

  if (bondSubeFuerte && !sp500Sube) {
    return {
      etapaEstimada:
        "Posible transición a Expansión tardía o Contracción temprana (bonos ya giraron al alza, acciones aún no)",
      certeza: "baja",
      sectoresLideres: ["Consumer Defensive", "Utilities", "Financial Services"],
    };
  }
  if (bondBajaFuerte && !sp500Baja) {
    return {
      etapaEstimada:
        "Posible transición a Recuperación temprana (bonos ya giraron a la baja, acciones aún no)",
      certeza: "baja",
      sectoresLideres: ["Consumer Cyclical", "Technology", "Industrials"],
    };
  }
  if (sp500Sube && commSube) {
    return {
      etapaEstimada: "Posible Expansión tardía (acciones y commodities suben sincronizados)",
      certeza: "baja",
      sectoresLideres: ["Energy", "Basic Materials"],
    };
  }
  if (sp500Baja && commBaja) {
    return {
      etapaEstimada: "Posible Recesión (acciones y commodities caen sincronizados)",
      certeza: "baja",
      sectoresLideres: ["Utilities", "Consumer Defensive", "Financial Services"],
    };
  }
  return { etapaEstimada: null, certeza: "baja", sectoresLideres: [] };
}

// ─── PARTE 2: DETECTOR DE PATRONES HISTÓRICOS ──────────────────

/** Fuente: Murphy, "Intermarket Analysis", cap. 5 (1987 setup), cap. 6 (1990 setup), cap. 15 (geopolítico) */
export function detectarPatronHistorico(params: {
  dbcCloses: number[];
  tnxCloses: number[];
  bondPriceCloses: number[];
  spxCloses: number[];
  oilCloses?: number[];
  goldCloses?: number[];
  dxyCloses?: number[];
  dowGoldRatio?: number | null;
}): PatronHistorico[] {
  const resultados: PatronHistorico[] = [];

  let match1987 = 0;
  const ctx1987: string[] = [];
  if (params.dbcCloses.length >= 90 && params.tnxCloses.length >= 60) {
    const dbcActual = params.dbcCloses[params.dbcCloses.length - 1];
    const dbcMax90d = Math.max(...params.dbcCloses.slice(-90));
    if (dbcActual > dbcMax90d) {
      match1987 += 40;
      ctx1987.push("commodities en ruptura alcista 90d");
    }

    const tnxHace60d = params.tnxCloses[params.tnxCloses.length - 60];
    const tnxActual = params.tnxCloses[params.tnxCloses.length - 1];
    const tnxVar60d = ((tnxActual - tnxHace60d) / tnxHace60d) * 100;
    if (tnxVar60d > 5) {
      match1987 += 30;
      ctx1987.push("bonos cayendo");
    } else if (tnxVar60d > 2) {
      match1987 += 15;
      ctx1987.push("bonos levemente débiles");
    }
  }
  if (params.spxCloses.length >= 60) {
    const spx60d = params.spxCloses[params.spxCloses.length - 1];
    const spxMax60d = Math.max(...params.spxCloses.slice(-60));
    const spxCercaMax = spx60d >= spxMax60d * 0.97;
    if (spxCercaMax) {
      match1987 += 30;
      ctx1987.push("acciones no confirmaron debilidad");
    }
  }
  resultados.push({
    id: "1987",
    nombre: "Setup 1987 — ruptura inflacionaria",
    match: Math.min(100, match1987),
    contexto: `Patrón similar a primavera-verano 1987: ${ctx1987.join(", ") || "condiciones no alineadas"}.`,
    activo: match1987 >= 60,
  });

  let match1990 = 0;
  const ctx1990: string[] = [];
  if (params.bondPriceCloses.length >= 63) {
    const bond3m = params.bondPriceCloses.slice(-63);
    const bondTrend3m = ((bond3m[bond3m.length - 1] - bond3m[0]) / bond3m[0]) * 100;
    if (bondTrend3m < -3) {
      match1990 += 40;
      ctx1990.push("bonos en tendencia bajista >3 meses");
    }
  }
  if (params.dowGoldRatio != null && params.dowGoldRatio < 1) {
    match1990 += 20;
    ctx1990.push("Dow/Gold ratio bajo");
  }
  if (params.spxCloses.length >= 63) {
    const spx3mAntes = params.spxCloses.slice(-63);
    const spxTrend3m = ((spx3mAntes[spx3mAntes.length - 1] - spx3mAntes[0]) / spx3mAntes[0]) * 100;
    if (spxTrend3m > 0) {
      match1990 += 30;
      ctx1990.push("acciones aún firmes a pesar de bonos débiles");
    }
  }
  const bondDiverge =
    ctx1990.some((c) => c.includes("bonos en tendencia bajista")) &&
    ctx1990.some((c) => c.includes("acciones aún firmes"));
  if (bondDiverge) match1990 = Math.min(100, match1990 + 10);
  resultados.push({
    id: "1990",
    nombre: "Setup 1990 — divergencia bonos-acciones",
    match: Math.min(100, match1990),
    contexto:
      ctx1990.length > 0
        ? `Patrón similar a mediados de 1990: ${ctx1990.join(", ")}. Históricamente el ajuste bursátil llegó ~3-4 meses después.`
        : "Condiciones de divergencia no detectadas.",
    activo: match1990 >= 55,
  });

  let matchGeo = 0;
  const ctxGeo: string[] = [];
  if (params.oilCloses && params.oilCloses.length >= 20) {
    const oilHace20d = params.oilCloses[params.oilCloses.length - 20];
    const oilActual = params.oilCloses[params.oilCloses.length - 1];
    const oilVar20d = ((oilActual - oilHace20d) / oilHace20d) * 100;
    if (oilVar20d > 15) {
      matchGeo += 40;
      ctxGeo.push(`petróleo con spike del ${oilVar20d.toFixed(0)}% en 20d`);
    } else if (oilVar20d > 8) {
      matchGeo += 20;
      ctxGeo.push(`petróleo subiendo ${oilVar20d.toFixed(0)}% en 20d`);
    }
  }
  if (params.goldCloses && params.goldCloses.length >= 20) {
    const goldHace20d = params.goldCloses[params.goldCloses.length - 20];
    const goldActual = params.goldCloses[params.goldCloses.length - 1];
    const goldVar20d = ((goldActual - goldHace20d) / goldHace20d) * 100;
    if (goldVar20d > 5) {
      matchGeo += 20;
      ctxGeo.push("oro en alza simultánea");
    }
  }
  if (params.bondPriceCloses.length >= 20 && params.spxCloses.length >= 20) {
    const bp20d =
      ((params.bondPriceCloses[params.bondPriceCloses.length - 1] -
        params.bondPriceCloses[params.bondPriceCloses.length - 20]) /
        params.bondPriceCloses[params.bondPriceCloses.length - 20]) *
      100;
    const spx20d =
      ((params.spxCloses[params.spxCloses.length - 1] -
        params.spxCloses[params.spxCloses.length - 20]) /
        params.spxCloses[params.spxCloses.length - 20]) *
      100;
    if (bp20d < -2 && spx20d < -3) {
      matchGeo += 30;
      ctxGeo.push("bonos y acciones cayendo juntos");
    }
  }
  resultados.push({
    id: "geopolitico",
    nombre: "Shock geopolítico / energía",
    match: Math.min(100, matchGeo),
    contexto:
      ctxGeo.length > 0
        ? `Patrón similar a invasión de Kuwait (1990) y 2da crisis de Irak (2003): ${ctxGeo.join(", ")}. Históricamente estos shocks se revierten abruptamente al resolverse el evento.`
        : "Sin señales de shock geopolítico activo.",
    activo: matchGeo >= 50,
  });

  return resultados;
}

// ─── PARTE 3: LEAD-LAG Y MEMORIA DE SECUENCIA ─────────────────

/** Fuente: Murphy, "Intermarket Analysis", cap. 15 (secuencia de giros) */
export function registrarSecuenciaDeGiros(params: {
  bondPrices: number[];
  spxPrices: number[];
  dbcPrices: number[];
  dxyPrices: number[];
  ventanaPivote?: number;
}): SecuenciaGiros {
  const { bondPrices, spxPrices, dbcPrices, dxyPrices, ventanaPivote = 15 } = params;

  function encontrarUltimoPivote(
    serie: number[],
    ventana: number,
  ): { idx: number; tipo: "max" | "min" | null } {
    if (serie.length < ventana * 2 + 1) return { idx: -1, tipo: null };
    const mid = serie.length - 1 - Math.floor(ventana / 2);
    const slice = serie.slice(mid - ventana, mid + ventana + 1);
    const maxVal = Math.max(...slice);
    const minVal = Math.min(...slice);
    const midVal = slice[ventana];
    if (midVal === maxVal) return { idx: mid, tipo: "max" };
    if (midVal === minVal) return { idx: mid, tipo: "min" };
    return { idx: -1, tipo: null };
  }

  const bondPivot = encontrarUltimoPivote(bondPrices, ventanaPivote);
  const spxPivot = encontrarUltimoPivote(spxPrices, ventanaPivote);
  const dbcPivot = encontrarUltimoPivote(dbcPrices, ventanaPivote);
  const dxyPivot = encontrarUltimoPivote(dxyPrices, ventanaPivote);

  const giros: { idx: number; nombre: string }[] = [];
  if (bondPivot.idx >= 0) giros.push({ idx: bondPivot.idx, nombre: "Bonos" });
  if (spxPivot.idx >= 0) giros.push({ idx: spxPivot.idx, nombre: "Acciones" });
  if (dbcPivot.idx >= 0) giros.push({ idx: dbcPivot.idx, nombre: "Commodities" });
  if (dxyPivot.idx >= 0) giros.push({ idx: dxyPivot.idx, nombre: "Dólar" });
  giros.sort((a, b) => b.idx - a.idx);

  if (giros.length < 2) {
    return {
      ordenCorrecto: false,
      detalle: "No se detectaron suficientes giros recientes para evaluar secuencia.",
    };
  }

  const ordenEsperado = ["Bonos", "Dólar", "Commodities", "Acciones"];
  const posiciones = giros.map((g) => ({
    nombre: g.nombre,
    posicion: ordenEsperado.indexOf(g.nombre),
  }));
  const ordenado = posiciones.every((p, i) => i === 0 || p.posicion >= posiciones[i - 1].posicion);
  const inverso = posiciones.every((p, i) => i === 0 || p.posicion <= posiciones[i - 1].posicion);

  if (ordenado && giros.length >= 3) {
    return {
      ordenCorrecto: true,
      detalle: `Secuencia de giros consistente: ${giros.map((g) => g.nombre).join(" → ")}. Bonos lideran como predice la teoría.`,
    };
  }
  if (inverso && giros.length >= 3) {
    return {
      ordenCorrecto: false,
      detalle: `Secuencia de giros invertida: ${giros.map((g) => g.nombre).join(" → ")}. Las relaciones intermarket no siguen el patrón clásico (Murphy, Cap. 15).`,
    };
  }
  return {
    ordenCorrecto: false,
    detalle: `Giros detectados (${giros.map((g) => g.nombre).join(", ")}), pero no forman una secuencia clara.`,
  };
}

// ─── PARTE 3: VALIDAR SECUENCIA DE ROTACIÓN (3 etapas) ────────

/** Fuente: Murphy, "Intermarket Analysis", cap. 15 (secuencia de rotación 3 etapas) */
export function validarSecuenciaRotacionCompleta(params: {
  girosCommodities: { idx: number; tipo: "max" | "min" | null };
  girosBonos: { idx: number; tipo: "max" | "min" | null };
  girosAcciones: { idx: number; tipo: "max" | "min" | null };
}): { ordenConfirmado: boolean; etapaActual: string; lagEstimadoProximaEtapa: string | null } {
  const { girosCommodities, girosBonos, girosAcciones } = params;

  if (girosCommodities.idx < 0 && girosBonos.idx < 0 && girosAcciones.idx < 0) {
    return {
      ordenConfirmado: false,
      etapaActual: "Sin giros detectados",
      lagEstimadoProximaEtapa: null,
    };
  }

  const commAntesBonos =
    girosCommodities.idx >= 0 && girosBonos.idx >= 0 && girosCommodities.idx > girosBonos.idx;
  const bonosAntesAcciones =
    girosBonos.idx >= 0 && girosAcciones.idx >= 0 && girosBonos.idx > girosAcciones.idx;

  if (commAntesBonos && bonosAntesAcciones) {
    const lagCommBonds = Math.round((girosCommodities.idx - girosBonos.idx) / 21);
    const lagBondsStocks = Math.round((girosBonos.idx - girosAcciones.idx) / 21);
    return {
      ordenConfirmado: true,
      etapaActual: "Secuencia completa: commodities → bonos → acciones",
      lagEstimadoProximaEtapa: `Lag observado: commodities→bonos ~${lagCommBonds}m, bonos→acciones ~${lagBondsStocks}m (consistente con Murphy).`,
    };
  }

  if (commAntesBonos && girosAcciones.idx < 0) {
    return {
      ordenConfirmado: false,
      etapaActual: "Commodities y bonos giraron, acciones aún no reaccionan",
      lagEstimadoProximaEtapa:
        "De cumplirse el patrón histórico (1993-94: bonos→acciones ~5-6 meses), acciones podría reaccionar en meses — referencia histórica, no predicción.",
    };
  }

  if (commAntesBonos && !bonosAntesAcciones && girosAcciones.idx >= 0) {
    return {
      ordenConfirmado: false,
      etapaActual:
        "Commodities y bonos giraron en orden, pero acciones ya habían girado antes que bonos — secuencia incompleta",
      lagEstimadoProximaEtapa: null,
    };
  }

  return {
    ordenConfirmado: false,
    etapaActual:
      "Secuencia de rotación no confirmada — orden de giros no coincide con el patrón canónico de 3 etapas",
    lagEstimadoProximaEtapa: null,
  };
}

// ─── PARTE 4: DETECTOR DE BEAR MARKET SILENCIOSO (1994) ───────

/** Fuente: Murphy, "Intermarket Analysis", cap. 12 (bear market silencioso 1994) */
export function detectarBearMarketSilencioso(params: {
  indicePrincipalVariacion: number | null | undefined;
  ratioCommBondsAlcista: boolean;
  smallCapVariacion?: number | null;
  sectorRateSensitiveVariacion?: number | null;
}): { detectado: boolean; confianza: number; contextoHistorico: string | null } {
  const {
    indicePrincipalVariacion,
    ratioCommBondsAlcista,
    smallCapVariacion,
    sectorRateSensitiveVariacion,
  } = params;

  if (indicePrincipalVariacion == null || !ratioCommBondsAlcista) {
    return { detectado: false, confianza: 0, contextoHistorico: null };
  }

  const indicePlano = indicePrincipalVariacion > -12 && indicePrincipalVariacion < -2;
  let confianza = 0;
  const evidencias: string[] = [];

  if (indicePlano) {
    confianza += 30;
    evidencias.push("índice principal relativamente plano");
  }
  if (ratioCommBondsAlcista) {
    confianza += 30;
    evidencias.push("ratio commodities/bonos en alza (presión en tasas)");
  }

  if (smallCapVariacion != null && sectorRateSensitiveVariacion != null) {
    const divergenciaSmall = smallCapVariacion - indicePrincipalVariacion;
    const divergenciaSector = sectorRateSensitiveVariacion - indicePrincipalVariacion;
    if (divergenciaSmall < -10 || divergenciaSector < -10) {
      confianza += 30;
      evidencias.push(
        "divergencia interna confirmada: sectores sensibles a tasas rinden significativamente peor que el índice general",
      );
    }
  }

  const confianzaFinal = Math.min(100, confianza);
  const contexto =
    confianzaFinal >= 50
      ? `Divergencia interna detectada: ${evidencias.join("; ")}. Patrón similar al 'stealth bear market' de 1994, donde el Dow cayó solo 10% pero utilities perdieron 34% y small caps 15%. Revisar exposición sectorial más allá del índice general.`
      : confianzaFinal >= 20
        ? `Señales parciales de divergencia: ${evidencias.join("; ")}. Sin datos sectoriales locales para confirmar divergencia interna — confianza parcial.`
        : null;

  return {
    detectado: confianzaFinal >= 50,
    confianza: confianzaFinal,
    contextoHistorico: contexto,
  };
}

// ─── PARTE 5: EVALUAR CONVERGENCIA DE COMMODITIES ─────────────

/** EXTENSION PROPIA — no proviene de Murphy, verificar con Cintia si mantener */
export function evaluarConvergenciaCommodities(params: {
  dbcTrend: number | null | undefined;
  industrialTrend: number | null | undefined;
  oilTrend: number | null | undefined;
}): { convergen: boolean; indicesEnAlza: string[]; indicesEnBaja: string[] } {
  const { dbcTrend, industrialTrend, oilTrend } = params;
  const enAlza: string[] = [];
  const enBaja: string[] = [];

  if (dbcTrend != null) (dbcTrend > 0 ? enAlza : enBaja).push("DBC (CRB genérico)");
  if (industrialTrend != null) (industrialTrend > 0 ? enAlza : enBaja).push("Metales industriales");
  if (oilTrend != null) (oilTrend > 0 ? enAlza : enBaja).push("Petróleo (GSCI proxy)");

  const convergen = enAlza.length === 3 || enBaja.length === 3;
  return { convergen, indicesEnAlza: enAlza, indicesEnBaja: enBaja };
}

// ─── ALERTA SETUP TIPO 1987 ────────────────────────────────────

/** Fuente: Murphy, "Intermarket Analysis", cap. 5 (setup 1987) */
export function detectarSetupInflacionarioAgresivo(
  dbcCloses: number[],
  tnxCloses: number[],
): { activa: boolean; mensaje: string | null } {
  if (dbcCloses.length < 60 || tnxCloses.length < 20) {
    return { activa: false, mensaje: null };
  }

  const dbcActual = dbcCloses[dbcCloses.length - 1];
  const dbcMax60d = Math.max(...dbcCloses.slice(-60));
  const dbcRuptura = dbcActual > dbcMax60d;

  const tnxHace20d = tnxCloses[tnxCloses.length - 20];
  const tnxActual = tnxCloses[tnxCloses.length - 1];
  const tnxSubida20d = ((tnxActual - tnxHace20d) / tnxHace20d) * 100;

  if (dbcRuptura && tnxSubida20d > 5) {
    return {
      activa: true,
      mensaje: `Riesgo elevado para acciones — setup similar a primavera 1987 (commodities en ruptura alcista, bonos en caída sostenida).`,
    };
  }

  return { activa: false, mensaje: null };
}

// ─── NIVEL DE SECTOR POR CICLO (advertisencia visual, no bloqueo) ─────────────────────────────────────────────────────────────
/**
 * Determina el nivel de un sector según el ciclo económico.
 * Reemplaza semánticamente al viejo "bloqueado" con una etiqueta informativa.
 * NO es una instrucción de ocultar contenido — es contexto macro.
 */
/** EXTENSION PROPIA — no proviene de Murphy, verificar con Cintia si mantener */
export function nivelSectorPorCiclo(
  sectorEn: string,
  ciclo: CicloEconomico,
): { nivel: "favorecido" | "neutral" | "fuera_de_ciclo"; motivo: string } {
  const stage05 = ciclo.stage - 1; // Convertir de 1-6 a 0-5
  const sectoresLideres = CANONICAL_SECTOR_ROTATION[stage05]?.sectoresLideres ?? [];

  if (sectoresLideres.includes(sectorEn)) {
    return {
      nivel: "favorecido",
      motivo: `Sector líder en etapa actual (${ciclo.label}) — coherente con ciclo económico.`,
    };
  }

  return {
    nivel: "fuera_de_ciclo",
    motivo: `Sector fuera de los líderes de la etapa actual (${ciclo.label}: ${sectoresLideres.join(", ")}) — el análisis fundamental no se ve afectado, esto es contexto macro, no un veredicto sobre la empresa.`,
  };
}

// ─── PARTE 6: CICLO ECONÓMICO — STAGES 1 a 6 (MURPHY, Cap. 12-13) ──
// LA LÓGICA PURA ESTÁ EN cycle-phase-detector.ts (detectCyclePhase, stages 0-5).
// Esta función es un wrapper que mapea a stages 1-6 para compatibilidad.

/** Fuente: Murphy, "Intermarket Analysis", cap. 12-13 */
export type StageCiclo = 1 | 2 | 3 | 4 | 5 | 6;

export interface CicloEconomico {
  stage: StageCiclo;
  label: string;
  sectoresLideres: string[];
  description: string;
}

function pctToArrowStrict(pct: number | null): TrendArrow {
  if (pct == null) return "flat";
  if (pct > 1.5) return "up";
  if (pct < -1.5) return "down";
  return "flat";
}

const CICLO_DESCRIPTIONS: Record<StageCiclo, string> = {
  1: "Bonos suben (flight-to-quality). Acciones caen buscando piso. Commodities caen por demanda destruida. El peor momento del ciclo, pero el mejor para comprar bonos largos.",
  2: "Bonos y acciones suben. Commodities aún débiles. Pequeñas empresas lideran. Es el MEJOR momento para comprar acciones.",
  3: "Los 3 activos suben sincronizados. Liquidez abundante. Industriales y Materiales toman liderazgo. La economía está en su punto más saludable.",
  4: "Bonos caen (yields suben por inflación). Acciones aún suben pero sólo las mega-caps. Commodities fuertes. Energy lidera. INFLACIÓN es el riesgo dominante.",
  5: "Bonos caen, Acciones caen, pero Commodities aún suben por inercia. Estanflación. Rotar a defensivos: Salud, Staples, Utilities, Oro.",
  6: "Los 3 activos caen. Cash es king. Bonos largos empiezan a subir anticipando recortes. Preparar el suelo del ciclo (Stage 1).",
};

/**
 * Wrapper unificado: convierte trends numéricos → detectCyclePhase (0-5) → CicloEconomico (1-6).
 * Reemplaza la antigua determinarEtapaCiclo que tenía lógica incompatible.
 */
/** Fuente: Murphy, "Intermarket Analysis", cap. 12-13 (wrapper para detectCyclePhase) */
export function determinarEtapaCiclo(params: {
  bondPriceTrend: number | null;
  spxTrend: number | null;
  commodityTrend: number | null;
}): CicloEconomico {
  const { bondPriceTrend, spxTrend, commodityTrend } = params;

  const bondsTrend = pctToArrowStrict(bondPriceTrend);
  const stocksTrend = pctToArrowStrict(spxTrend);
  const commoditiesTrend = pctToArrowStrict(commodityTrend);

  // detectCyclePhase devuelve 0-5. Sumamos 1 → 1-6.
  const stage05 = detectCyclePhase({ bondsTrend, stocksTrend, commoditiesTrend });
  const stage = (stage05 + 1) as StageCiclo;

  const meta = MURPHY_STAGE_LABELS[stage] ?? MURPHY_STAGE_LABELS[3];
  const description = CICLO_DESCRIPTIONS[stage] ?? "Sin descripción disponible.";

  return {
    stage,
    label: meta.label,
    sectoresLideres: CANONICAL_SECTOR_ROTATION[stage05].sectoresLideres,
    description,
  };
}

/** EXTENSION PROPIA — no proviene de Murphy, verificar con Cintia si mantener */
export function sectoresPermitidosPorCiclo(ciclo: CicloEconomico): string[] {
  return ciclo.sectoresLideres;
}

// ─── @deprecated: Usar nivelSectorPorCiclo() para el nuevo esquema de advertencia visual.
// Esta función se mantiene por compatibilidad con código existente.
/** EXTENSION PROPIA — no proviene de Murphy, verificar con Cintia si mantener (DEPRECADA) */
export function sectorBloqueadoPorCiclo(sectorEn: string, ciclo: CicloEconomico): boolean {
  // Lógica nueva: delega a nivelSectorPorCiclo()
  const resultado = nivelSectorPorCiclo(sectorEn, ciclo);
  return resultado.nivel === "fuera_de_ciclo";
}

// ─── PARTE 7: SÍNTESIS — LECTURA INTERMARKET ──────────────────

// ─── MAPA: régimen → sectores favorecidos/desfavorecidos ─────────

export interface SectorFavorabilidad {
  sector: string;
  direccion: "favorecido" | "desfavorecido" | "neutral";
  peso: number; // 0..1 intensidad
}

/** EXTENSION PROPIA — no proviene de Murphy, verificar con Cintia si mantener */
export function mapRegimenASectoresFavorecidos(
  regimen: string,
  presionIndex: number,
  relativeStrengthRatios?: Array<{ label: string; variacion30dPct: number | null }>,
): SectorFavorabilidad[] {
  const result: SectorFavorabilidad[] = [];

  // Reglas base según el régimen
  switch (regimen) {
    case "inflacionario": {
      result.push(
        { sector: "Energy", direccion: "favorecido", peso: 1 },
        { sector: "Basic Materials", direccion: "favorecido", peso: 0.9 },
        { sector: "Financial Services", direccion: "desfavorecido", peso: 0.6 },
        { sector: "Utilities", direccion: "desfavorecido", peso: 0.8 },
        { sector: "Real Estate", direccion: "desfavorecido", peso: 0.8 },
        { sector: "Consumer Discretionary", direccion: "desfavorecido", peso: 0.5 },
        { sector: "Technology", direccion: "neutral", peso: 0 },
        { sector: "Consumer Defensive", direccion: "neutral", peso: 0 },
        { sector: "Healthcare", direccion: "neutral", peso: 0 },
        { sector: "Communication Services", direccion: "neutral", peso: 0 },
        { sector: "Industrials", direccion: "neutral", peso: 0 },
      );
      break;
    }
    case "desinflacionario": {
      result.push(
        { sector: "Technology", direccion: "favorecido", peso: 0.9 },
        { sector: "Consumer Discretionary", direccion: "favorecido", peso: 0.8 },
        { sector: "Real Estate", direccion: "favorecido", peso: 0.7 },
        { sector: "Communication Services", direccion: "favorecido", peso: 0.6 },
        { sector: "Energy", direccion: "desfavorecido", peso: 0.8 },
        { sector: "Basic Materials", direccion: "desfavorecido", peso: 0.7 },
        { sector: "Utilities", direccion: "neutral", peso: 0 },
        { sector: "Consumer Defensive", direccion: "neutral", peso: 0 },
        { sector: "Healthcare", direccion: "neutral", peso: 0 },
        { sector: "Financial Services", direccion: "neutral", peso: 0 },
        { sector: "Industrials", direccion: "neutral", peso: 0 },
      );
      break;
    }
    case "deflacionario": {
      result.push(
        { sector: "Utilities", direccion: "favorecido", peso: 1 },
        { sector: "Consumer Defensive", direccion: "favorecido", peso: 0.9 },
        { sector: "Healthcare", direccion: "favorecido", peso: 0.8 },
        { sector: "Energy", direccion: "desfavorecido", peso: 1 },
        { sector: "Basic Materials", direccion: "desfavorecido", peso: 0.9 },
        { sector: "Consumer Discretionary", direccion: "desfavorecido", peso: 0.8 },
        { sector: "Industrials", direccion: "desfavorecido", peso: 0.6 },
        { sector: "Technology", direccion: "desfavorecido", peso: 0.5 },
        { sector: "Financial Services", direccion: "desfavorecido", peso: 0.5 },
        { sector: "Real Estate", direccion: "desfavorecido", peso: 0.5 },
        { sector: "Communication Services", direccion: "neutral", peso: 0 },
      );
      break;
    }
    default: {
      // Mixto o desconocido — sin sesgo sectorial fuerte
      const sectoresNeutral = [
        "Energy",
        "Basic Materials",
        "Financial Services",
        "Utilities",
        "Real Estate",
        "Consumer Discretionary",
        "Technology",
        "Consumer Defensive",
        "Healthcare",
        "Communication Services",
        "Industrials",
      ];
      for (const s of sectoresNeutral) {
        result.push({ sector: s, direccion: "neutral", peso: 0 });
      }
    }
  }

  // Ajuste fino: si el índice de presión es muy intenso, reforzar
  if (Math.abs(presionIndex) > 0.5) {
    for (const r of result) {
      if (r.direccion !== "neutral") {
        r.peso = Math.min(1, r.peso * 1.2);
      }
    }
  }

  // Ajuste: si XLY/XLP ratio sube, reforzar Consumer Discretionary
  if (relativeStrengthRatios) {
    const xlyxlp = relativeStrengthRatios.find((r) => r.label === "Consumer Disc./Staples ratio");
    if (xlyxlp && xlyxlp.variacion30dPct != null && xlyxlp.variacion30dPct > 3) {
      const entry = result.find((r) => r.sector === "Consumer Discretionary");
      if (entry && entry.direccion === "favorecido") entry.peso = Math.min(1, entry.peso * 1.3);
    }
  }

  return result;
}

/** EXTENSION PROPIA — no proviene de Murphy, verificar con Cintia si mantener */
export function generarLecturaIntermarket(params: {
  dxyTrend: number | null;
  dbcTrend: number | null;
  bondPriceTrend: number | null;
  spxTrend: number | null;
  goldTrend: number | null;
  oilTrend: number | null;
  dbcCloses: number[];
  tnxCloses: number[];
  bondPriceCloses: number[];
  spxCloses: number[];
  oilCloses?: number[];
  goldCloses?: number[];
  dxyCloses?: number[];
  dowGoldRatio?: number | null;
  correlacionBonosAcciones?: number | null;
  industrialTrend?: number | null;
  sp500Var30d?: number | null;
  mervalVar30d?: number | null;
}): LecturaIntermarket {
  const presion = indicePresionInflacionaria({
    dxyTrend: params.dxyTrend,
    dbcTrend: params.dbcTrend,
    bondPriceTrend: params.bondPriceTrend,
    spxTrend: params.spxTrend,
    goldTrend: params.goldTrend,
    oilTrend: params.oilTrend,
  });

  const regimen = clasificarRegimenIntermarket({
    dxyVar30d: params.dxyTrend,
    commodityVar30d: params.dbcTrend,
    bondPriceVar30d: params.bondPriceTrend,
    sp500Var30d: params.spxTrend,
    correlacionBonosAcciones: params.correlacionBonosAcciones,
  });

  const patrones = detectarPatronHistorico({
    dbcCloses: params.dbcCloses,
    tnxCloses: params.tnxCloses,
    bondPriceCloses: params.bondPriceCloses,
    spxCloses: params.spxCloses,
    oilCloses: params.oilCloses,
    goldCloses: params.goldCloses,
    dxyCloses: params.dxyCloses,
    dowGoldRatio: params.dowGoldRatio,
  });

  const patronActivo = patrones.find((p) => p.activo) ?? null;

  const secuencia = registrarSecuenciaDeGiros({
    bondPrices: params.bondPriceCloses,
    spxPrices: params.spxCloses,
    dbcPrices: params.dbcCloses,
    dxyPrices: params.dxyCloses ?? [],
  });

  const scoreReglas = Math.abs(presion);
  const scoreSecuencia = secuencia.ordenCorrecto ? 0.3 : -0.2;
  const scorePatron = patronActivo ? 0.2 : 0;
  const confianza = Math.round(
    Math.min(100, Math.max(0, (scoreReglas + scoreSecuencia + scorePatron + 0.5) * 100)),
  );

  let alertaActiva: string | null = null;
  const contextos: string[] = [];

  if (patronActivo) {
    contextos.push(patronActivo.contexto);
    if (patronActivo.match >= 70) {
      alertaActiva =
        patronActivo.id === "1987"
          ? "Setup histórico 1987 con alta similitud: monitorear divergencia bonos-acciones."
          : patronActivo.id === "1990"
            ? "Divergencia bonos-acciones sin confirmación de mercado global: vigilancia activa."
            : "Shock de energía activo: vigilar reversión brusca al resolverse el evento.";
    }
  }

  if (!secuencia.ordenCorrecto && secuencia.detalle.includes("invertida")) {
    contextos.push(
      "La secuencia de giros está invertida respecto al modelo clásico de Murphy — las relaciones intermarket pueden estar desacopladas temporalmente.",
    );
  }

  let recomendacionSesgo: "cauteloso" | "neutral" | "favorable";
  if (presion > 0.3 || regimen.valor < 0) {
    recomendacionSesgo = "cauteloso";
  } else if (presion < -0.3 && regimen.valor > 0) {
    recomendacionSesgo = "favorable";
  } else {
    recomendacionSesgo = "neutral";
  }

  const contextoHistorico =
    contextos.length > 0
      ? contextos.join(" ")
      : "Sin patrones históricos análogos detectados en este momento. Las relaciones intermarket siguen su curso normal.";

  // Cap. 3: Ratio Commodities/Bonos
  const ratioCommBonds =
    params.bondPriceCloses.length > 0 && params.dbcCloses.length > 0
      ? params.dbcCloses[params.dbcCloses.length - 1] /
        Math.abs(params.bondPriceCloses[params.bondPriceCloses.length - 1] || 1)
      : null;
  let tendenciaRatio: "alcista" | "bajista" | "lateral" = "lateral";
  if (params.dbcTrend != null && params.bondPriceTrend != null) {
    const diff = params.dbcTrend - params.bondPriceTrend;
    tendenciaRatio = diff > 3 ? "alcista" : diff < -3 ? "bajista" : "lateral";
  }
  const sesgoSectorial =
    tendenciaRatio === "alcista"
      ? "Favorecer sectores de materiales/energía, des-favorecer utilities/financieras/real estate (réplica del caso 1994)"
      : tendenciaRatio === "bajista"
        ? "Favorecer sectores sensibles a tasas (utilities, financieras, real estate)"
        : "Sin sesgo sectorial claro por ratio commodities/bonos";

  const secuenciaRot = validarSecuenciaRotacionCompleta({
    girosCommodities: secuencia.ordenCorrecto ? { idx: 1, tipo: "max" } : { idx: -1, tipo: null },
    girosBonos: secuencia.ordenCorrecto ? { idx: 0, tipo: "max" } : { idx: -1, tipo: null },
    girosAcciones: secuencia.ordenCorrecto ? { idx: -1, tipo: null } : { idx: -1, tipo: null },
  });

  const bearMarket = detectarBearMarketSilencioso({
    indicePrincipalVariacion: params.sp500Var30d ?? params.mervalVar30d,
    ratioCommBondsAlcista: tendenciaRatio === "alcista",
  });

  const convergencia = evaluarConvergenciaCommodities({
    dbcTrend: params.dbcTrend,
    industrialTrend: params.industrialTrend,
    oilTrend: params.oilTrend,
  });

  return {
    regimen: regimen.regimen.split(" — ")[0].toLowerCase(),
    confianza,
    patronHistoricoDetectado: patronActivo,
    matchPatron: patronActivo?.match ?? 0,
    alertaActiva,
    contextoHistorico,
    recomendacionSesgo,
    indicePresion: Math.round(presion * 100) / 100,
    secuenciaGiros: secuencia,
    ratioCommoditiesBonos: { valor: ratioCommBonds, tendencia: tendenciaRatio, sesgoSectorial },
    secuenciaRotacion: secuenciaRot,
    bearMarketSilencioso: bearMarket,
    convergenciaCommodities: convergencia,
  };
}
