export interface SaludFinancieraResult {
  ticker: string;
  posicion: {
    score: number | null;
    nivel: "sólida" | "moderada" | "apalancada" | "N/D";
    detalle: { label: string; valor: string; tono: "positivo" | "neutral" | "negativo" | "sin-dato" }[];
  };
  generacion: {
    score: number | null;
    nivel: "fuerte" | "aceptable" | "débil" | "N/D";
    detalle: { label: string; valor: string; tono: "positivo" | "neutral" | "negativo" | "sin-dato" }[];
  };
  ventajaCompetitiva: boolean;
  margenSeguridad: { upside: number | null; analistas: number | null; interpretacion: string };
  interpretacionGeneral: string;
}

type Metricas = {
  debtToEquityRaw: number | null;
  priceToBook: number | null;
  currentRatioCheck: number | null;
  returnOnEquity: number | null;
  profitMargin: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  fcfYield: number | null;
  upsidePct: number | null;
  numberOfAnalystOpinions: number | null;
  sector: string | null;
};

function tonoValor(v: number | null, umbralPos: number, umbralNeg: number, invertir = false): "positivo" | "neutral" | "negativo" | "sin-dato" {
  if (v == null) return "sin-dato";
  if (invertir) return v <= umbralPos ? "positivo" : v >= umbralNeg ? "negativo" : "neutral";
  return v >= umbralPos ? "positivo" : v <= umbralNeg ? "negativo" : "neutral";
}

const SECTOR_MARGIN_THRESHOLDS: Record<string, { alto: number; medio: number }> = {
  Technology: { alto: 0.20, medio: 0.10 },
  "Financial Services": { alto: 0.30, medio: 0.15 },
  Healthcare: { alto: 0.20, medio: 0.10 },
  "Consumer Defensive": { alto: 0.15, medio: 0.08 },
  Energy: { alto: 0.15, medio: 0.08 },
  Industrials: { alto: 0.12, medio: 0.06 },
  "Basic Materials": { alto: 0.15, medio: 0.08 },
  Utilities: { alto: 0.15, medio: 0.08 },
  "Communication Services": { alto: 0.20, medio: 0.10 },
  "Consumer Cyclical": { alto: 0.12, medio: 0.06 },
};

export function calcularSaludFinanciera(ticker: string, metricas: Metricas): SaludFinancieraResult {
  // ── DIMENSIÓN 1: Posición (STOCK) ──
  const posDetalle: SaludFinancieraResult["posicion"]["detalle"] = [];
  let posPts = 0, posMax = 0;

  // D/E
  const de = metricas.debtToEquityRaw;
  if (de != null && de > 0) {
    const t = de < 25 ? "positivo" : de < 50 ? "positivo" : de < 100 ? "neutral" : "negativo";
    posDetalle.push({ label: "D/E", valor: `${de.toFixed(1)}%`, tono: t === "negativo" ? "negativo" : de < 50 ? "positivo" : "neutral" });
    if (de < 25) posPts += 40;
    else if (de < 50) posPts += 30;
    else if (de < 100) posPts += 15;
    posMax += 40;
  } else {
    posDetalle.push({ label: "D/E", valor: "N/D", tono: "sin-dato" });
  }

  // P/B
  const pb = metricas.priceToBook;
  if (pb != null && pb > 0) {
    const t = pb < 2 ? "positivo" : pb < 5 ? "neutral" : "negativo";
    posDetalle.push({ label: "P/B", valor: `${pb.toFixed(1)}x`, tono: t });
    if (pb < 1) posPts += 30;
    else if (pb < 3) posPts += 22;
    else if (pb < 5) posPts += 12;
    posMax += 30;
  } else {
    posDetalle.push({ label: "P/B", valor: "N/D", tono: "sin-dato" });
  }

  // Current Ratio
  const cr = metricas.currentRatioCheck;
  if (cr != null && cr > 0) {
    const t = cr >= 1.5 ? "positivo" : cr >= 1 ? "neutral" : "negativo";
    posDetalle.push({ label: "Liquidez", valor: cr.toFixed(2), tono: t });
    if (t === "positivo") posPts += 30;
    else if (t === "neutral") posPts += 15;
    posMax += 30;
  } else {
    posDetalle.push({ label: "Liquidez", valor: "N/D", tono: "sin-dato" });
  }

  const posScore = posMax > 0 ? Math.round((posPts / posMax) * 100) : null;
  const posNivel: SaludFinancieraResult["posicion"]["nivel"] =
    posScore == null || isNaN(posScore) ? "N/D" : posScore >= 70 ? "sólida" : posScore >= 40 ? "moderada" : "apalancada";

  // ── DIMENSIÓN 2: Generación (FLUJO) ──
  const genDetalle: SaludFinancieraResult["generacion"]["detalle"] = [];
  let genPts = 0, genMax = 0;

  // ROE
  const roe = metricas.returnOnEquity;
  if (roe != null) {
    const roePct = roe * 100;
    const t = roePct >= 20 ? "positivo" : roePct >= 10 ? "neutral" : "negativo";
    genDetalle.push({ label: "ROE", valor: `${roePct.toFixed(1)}%`, tono: t });
    if (roePct >= 40) genPts += 30;
    else if (roePct >= 20) genPts += 22;
    else if (roePct >= 10) genPts += 12;
    else if (roePct >= 0) genPts += 4;
    genMax += 30;
  } else {
    genDetalle.push({ label: "ROE", valor: "N/D", tono: "sin-dato" });
  }

  // Margen Neto (con umbrales por sector)
  const margen = metricas.profitMargin;
  if (margen != null) {
    const margenPct = margen * 100;
    const thresholds = SECTOR_MARGIN_THRESHOLDS[metricas.sector ?? ""] ?? { alto: 0.12, medio: 0.06 };
    const t = margen >= thresholds.alto ? "positivo" : margen >= thresholds.medio ? "neutral" : "negativo";
    genDetalle.push({ label: "Margen Neto", valor: `${margenPct.toFixed(1)}%`, tono: t });
    if (t === "positivo") genPts += 25;
    else if (t === "neutral") genPts += 12;
    genMax += 25;
  } else {
    genDetalle.push({ label: "Margen Neto", valor: "N/D", tono: "sin-dato" });
  }

  // Crecimiento de ingresos vs ganancias (compresión de margen)
  const revG = metricas.revenueGrowth;
  const earnG = metricas.earningsGrowth;
  if (revG != null && earnG != null) {
    const revPct = revG * 100;
    const earnPct = earnG * 100;
    if (earnPct < revPct - 10) {
      genDetalle.push({ label: "Crec. vs Gan.", valor: `Ingr: ${revPct.toFixed(1)}% / Gan: ${earnPct.toFixed(1)}%`, tono: "negativo" });
      genDetalle[genDetalle.length - 1].label = "Compresión de margen";
      genPts += 5;
    } else if (revPct > 0) {
      genDetalle.push({ label: "Crec. Ingresos", valor: `${revPct.toFixed(1)}%`, tono: revPct >= 10 ? "positivo" : "neutral" });
      genPts += revPct >= 10 ? 20 : 10;
    }
    genMax += 25;
  } else if (revG != null) {
    const revPct = revG * 100;
    genDetalle.push({ label: "Crec. Ingresos", valor: `${revPct.toFixed(1)}%`, tono: revPct >= 10 ? "positivo" : revPct >= 0 ? "neutral" : "negativo" });
    genPts += revPct >= 10 ? 20 : revPct >= 0 ? 10 : 0;
    genMax += 25;
  } else {
    genDetalle.push({ label: "Crec. Ingresos", valor: "N/D", tono: "sin-dato" });
  }

  // FCF Yield
  const fcf = metricas.fcfYield;
  if (fcf != null) {
    const fcfPct = fcf * 100;
    const t = fcfPct >= 5 ? "positivo" : fcfPct >= 0 ? "neutral" : "negativo";
    genDetalle.push({ label: "FCF Yield", valor: `${fcfPct.toFixed(1)}%`, tono: t });
    if (fcfPct >= 8) genPts += 20;
    else if (fcfPct >= 4) genPts += 15;
    else if (fcfPct >= 0) genPts += 8;
    genMax += 20;
  } else {
    genDetalle.push({ label: "FCF Yield", valor: "N/D", tono: "sin-dato" });
  }

  const genScore = genMax > 0 ? Math.round((genPts / genMax) * 100) : null;
  const genNivel: SaludFinancieraResult["generacion"]["nivel"] =
    genScore == null || isNaN(genScore) ? "N/D" : genScore >= 70 ? "fuerte" : genScore >= 40 ? "aceptable" : "débil";

  // ── VENTAJA COMPETITIVA ──
  const roeOk = roe != null && roe * 100 > 20;
  const margenOk = margen != null && (() => {
    const thr = SECTOR_MARGIN_THRESHOLDS[metricas.sector ?? ""] ?? { alto: 0.12, medio: 0.06 };
    return margen >= thr.alto;
  })();
  const deOk = de != null && de < 50;
  const ventajaCompetitiva = !!(roeOk && margenOk && deOk);

  // ── MARGEN DE SEGURIDAD ──
  const upside = metricas.upsidePct;
  const analistas = metricas.numberOfAnalystOpinions;
  let margenInterpretacion = "";
  if (upside != null && analistas != null && analistas > 0) {
    if (upside > 20) {
      margenInterpretacion = `Un upside de ${upside.toFixed(1)}% frente a ${analistas} analistas indica que el consenso del mercado ubica el valor razonable un ${upside.toFixed(0)}% por encima del precio actual — esto es una referencia externa, no un calculo propio de valor intrinseco.`;
    } else if (upside > 0) {
      margenInterpretacion = `Un upside de ${upside.toFixed(1)}% frente a ${analistas} analistas sugiere que el consenso del mercado ve el valor actual cercano a su precio objetivo.`;
    } else {
      margenInterpretacion = `El precio actual supera el precio objetivo promedio de ${analistas} analistas, lo que sugiere que el consenso del mercado no ve potencial de suba adicional en este momento.`;
    }
  } else {
    margenInterpretacion = "No hay suficiente cobertura de analistas para calcular margen de seguridad.";
  }

  // ── INTERPRETACIÓN GENERAL ──
  let interpretacionGeneral = "";
  if (posNivel === "sólida" && genNivel === "fuerte") {
    interpretacionGeneral = `${ticker} combina una posicion patrimonial solida con alta generacion de resultados.`;
  } else if (posNivel === "sólida" || posNivel === "moderada") {
    interpretacionGeneral = `${ticker} muestra una posicion patrimonial ${posNivel} y generacion ${genNivel}.`;
  } else {
    interpretacionGeneral = `${ticker} presenta una posicion patrimonial ${posNivel} con generacion ${genNivel} — esto puede reflejar desafios estructurales o una etapa de inversión.`;
  }
  if (ventajaCompetitiva) {
    interpretacionGeneral += " Presenta indicadores que sugieren una posible ventaja competitiva sostenida (ROE y margenes elevados con bajo apalancamiento).";
  }

  return {
    ticker,
    posicion: { score: posScore, nivel: posNivel, detalle: posDetalle },
    generacion: { score: genScore, nivel: genNivel, detalle: genDetalle },
    ventajaCompetitiva,
    margenSeguridad: { upside, analistas, interpretacion: margenInterpretacion },
    interpretacionGeneral,
  };
}
