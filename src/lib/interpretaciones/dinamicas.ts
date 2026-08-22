// ─── Módulo: Interpretaciones Dinámicas — Análisis Fundamental y Salud Sectorial ───
// Determinístico, auditable. No reemplaza números — los lee.
// Cumple reglas CNV: no "conviene comprar", no "es una oportunidad", no "recomendamos".

// ─── Tipos de entrada ───────────────────────────────────────────────────────────

export interface TickerInput {
  ticker: string;
  price: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  pbRatio: number | null;
  evEbitda: number | null;
  returnOnEquity: number | null;
  profitMargin: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  deRatio: number | null;
  fcfYield: number | null;
  dividendYield: number | null;
  upsideAnalistas: number | null;
  recomendacion: string | null;
  beta: number | null;
  pePercentilHistorico: number | null;
  industry: string | null;
}

export interface TickerInterpretacion {
  ticker: string;
  industry: string | null;
  percentiles: Record<string, number | null>;
  flags: Flag[];
  interpretacion: string;
}

export interface SectorInterpretacion {
  sector: string;
  tickers: TickerInterpretacion[];
  saludSectorial: SaludSectorial;
  sintesis: string;
}

export interface SaludSectorial {
  zScores: Record<string, number>;
  compuesto: number;
  metricasEvaluadas: number;
}

export interface Flag {
  codigo: string;
  mensaje: string;
  tipo: "atencion" | "informativo";
}

// ─── Dirección de métricas ─────────────────────────────────────────────────────

const DIRECCION: Record<string, "higher-better" | "lower-better" | "ambiguous"> = {
  returnOnEquity: "higher-better",
  profitMargin: "higher-better",
  revenueGrowth: "higher-better",
  earningsGrowth: "higher-better",
  fcfYield: "higher-better",
  dividendYield: "higher-better",
  upsideAnalistas: "higher-better",
  trailingPE: "lower-better",
  forwardPE: "lower-better",
  pegRatio: "lower-better",
  pbRatio: "lower-better",
  evEbitda: "lower-better",
  deRatio: "lower-better",
  beta: "ambiguous",
  pePercentilHistorico: "ambiguous",
};

const METRICAS_RENTABILIDAD = ["returnOnEquity", "profitMargin", "fcfYield"] as const;
const METRICAS_DIRECCIONALES = Object.entries(DIRECCION)
  .filter(([_, d]) => d !== "ambiguous")
  .map(([k]) => k);

// ─── Helpers ────────────────────────────────────────────────────────────────────

function extraer(m: TickerInput, metrica: string): number | null {
  const v = (m as any)[metrica];
  if (v == null || v === "" || v === "N/D") return null;
  if (typeof v === "number" && !Number.isFinite(v)) return null;
  return v;
}

function esValido(m: TickerInput, metrica: string): boolean {
  const v = extraer(m, metrica);
  if (v == null) return false;
  // Casos especiales 1.4
  if (metrica === "pegRatio" && (extraer(m, "forwardPE") == null || extraer(m, "forwardPE")! <= 0)) return false;
  if (metrica === "evEbitda" && v <= 0) return false;
  if (metrica === "returnOnEquity") {
    // ROE con patrimonio negativo ≈ D/E extremo o desbalance contable
    const de = extraer(m, "deRatio");
    if (de != null && de > 5) return false;
  }
  return true;
}

function direccion(metrica: string): "higher-better" | "lower-better" | "ambiguous" {
  return DIRECCION[metrica] ?? "ambiguous";
}

function esMejor(a: number, b: number, metrica: string): boolean {
  const dir = direccion(metrica);
  if (dir === "higher-better") return a > b;
  if (dir === "lower-better") return a < b;
  return false;
}

// ─── 1.2 Percentil relativo cross-sectional ──────────────────────────────────

export function calcularPercentilesRelativos(
  tickers: TickerInput[],
  metricas: string[] = METRICAS_DIRECCIONALES,
): Map<string, Record<string, number | null>> {
  const result = new Map<string, Record<string, number | null>>();
  const N = tickers.length;

  for (const t of tickers) {
    result.set(t.ticker, {});
  }

  if (N < 4) {
    for (const t of tickers) {
      const row: Record<string, number | null> = {};
      for (const m of metricas) row[m] = null;
      result.set(t.ticker, row);
    }
    return result;
  }

  for (const m of metricas) {
    const validos = tickers.filter((t) => esValido(t, m)).map((t) => ({
      ticker: t.ticker,
      valor: extraer(t, m)!,
    }));

    for (const t of tickers) {
      const v = extraer(t, m);
      if (v == null || !esValido(t, m)) {
        result.get(t.ticker)![m] = null;
        continue;
      }
      // percentil = cantidad de tickers del set con valor "peor" / (N - 1)
      const peores = validos.filter((o) => o.ticker !== t.ticker && esMejor(o.valor, v, m)).length;
      const denom = Math.max(validos.length - 1, 1);
      result.get(t.ticker)![m] = Math.round((peores / denom) * 10000) / 10000;
    }
  }

  return result;
}

// ─── 1.5 Z-score y Salud Sectorial Compuesta ─────────────────────────────────

export function calcularSaludSectorial(
  tickers: TickerInput[],
): SaludSectorial {
  const zScores: Record<string, number> = {};
  let metricasEvaluadas = 0;

  if (tickers.length < 4) {
    return { zScores: {}, compuesto: 0, metricasEvaluadas: 0 };
  }

  for (const m of METRICAS_DIRECCIONALES) {
    const validos = tickers.map((t) => extraer(t, m)).filter((v): v is number => v != null);
    if (validos.length < 4) continue;

    const media = validos.reduce((a, b) => a + b, 0) / validos.length;
    const std = Math.sqrt(validos.reduce((a, v) => a + (v - media) ** 2, 0) / validos.length);

    // Guarda: desvío = 0
    if (std === 0) {
      zScores[m] = 0;
      continue;
    }

    // Z-score promedio del sector (el promedio de los z-scores individuales)
    let sumZ = 0;
    let countZ = 0;
    for (const t of tickers) {
      const v = extraer(t, m);
      if (v == null) continue;
      const z = (v - media) / std;
      // z-score negativo = peor que el sector SIEMPRE
      sumZ += z;
      countZ++;
    }
    zScores[m] = countZ > 0 ? sumZ / countZ : 0;
    metricasEvaluadas++;
  }

  // Promedio simple truncado a [-2, +2]
  const vals = Object.values(zScores);
  const crudo = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const compuesto = Math.max(-2, Math.min(2, crudo));

  return { zScores, compuesto, metricasEvaluadas };
}

// ─── 1.6 Detección de divergencias ──────────────────────────────────────────

export function detectarFlags(t: TickerInput, percentiles: Record<string, number | null>): Flag[] {
  const flags: Flag[] = [];

  // a) Upside negativo + Recomendación "Compra" o "Compra fuerte"
  const upside = extraer(t, "upsideAnalistas");
  const rec = t.recomendacion?.toLowerCase() ?? "";
  if (upside != null && upside < 0 && (rec.includes("compra") || rec.includes("buy") || rec.includes("strong"))) {
    flags.push({
      codigo: "UPSIDE_NEGATIVO_COMPRA",
      mensaje: "recomendación de consenso desactualizada vs. precio objetivo",
      tipo: "atencion",
    });
  }

  // b) PEG fuera de rango confiable
  if (t.pegRatio != null && t.pegRatio > 0) {
    if (!esValido(t, "pegRatio")) {
      flags.push({
        codigo: "PEG_NO_CONFIABLE",
        mensaje: "PEG no confiable, no usar para valuación",
        tipo: "atencion",
      });
    }
  }

  // c) Percentil ≥ 0.8 en TODAS las métricas de rentabilidad simultáneamente
  const pctRentab = METRICAS_RENTABILIDAD.map((m) => percentiles[m]);
  if (pctRentab.every((p) => p != null && p >= 0.8)) {
    flags.push({
      codigo: "RENTABILIDAD_CONSISTENTE",
      mensaje: "rentabilidad consistentemente por encima del set comparado",
      tipo: "informativo",
    });
  }

  // d) Percentil ≤ 0.2 en D/E Y percentil ≤ 0.2 en Crec. Ingresos simultáneamente
  const pctDE = percentiles["deRatio"];
  const pctCrec = percentiles["revenueGrowth"];
  if (pctDE != null && pctCrec != null && pctDE <= 0.2 && pctCrec <= 0.2) {
    flags.push({
      codigo: "DEFENSIVO_REZAGADO",
      mensaje: "apalancamiento y crecimiento ambos por debajo del set comparado — perfil más defensivo/rezagado, no necesariamente negativo",
      tipo: "informativo",
    });
  }

  // e) Beta > 2 y percentil de Upside ≤ 0.3
  const beta = extraer(t, "beta");
  const pctUpside = percentiles["upsideAnalistas"];
  if (beta != null && beta > 2 && pctUpside != null && pctUpside <= 0.3) {
    flags.push({
      codigo: "ALTA_VOLATILIDAD_SIN_UPSIDE",
      mensaje: "alta volatilidad relativa sin compensación de upside visible en el consenso actual",
      tipo: "atencion",
    });
  }

  return flags;
}

// ─── 2. Síntesis en lenguaje natural ─────────────────────────────────────────

const LABELS: Record<string, string> = {
  returnOnEquity: "ROE",
  profitMargin: "margen neto",
  revenueGrowth: "crecimiento de ingresos",
  earningsGrowth: "crecimiento de ganancias",
  fcfYield: "FCF yield",
  dividendYield: "dividend yield",
  upsideAnalistas: "upside",
  trailingPE: "P/E trailing",
  forwardPE: "P/E forward",
  pegRatio: "PEG",
  pbRatio: "P/B",
  evEbitda: "EV/EBITDA",
  deRatio: "D/E",
};

function pctLabel(p: number | null): string {
  if (p == null) return "—";
  const pp = Math.round(p * 100);
  if (pp >= 80) return `percentil ${pp}`;
  if (pp >= 60) return `percentil ${pp}`;
  if (pp >= 40) return `percentil ${pp}`;
  return `percentil ${pp}`;
}

function mejorMetrica(t: TickerInput, percentiles: Record<string, number | null>): { metrica: string; pct: number } | null {
  let best: { metrica: string; pct: number } | null = null;
  for (const m of METRICAS_DIRECCIONALES) {
    const p = percentiles[m];
    if (p == null) continue;
    if (!best || p > best.pct) best = { metrica: m, pct: p };
  }
  return best;
}

function peorMetrica(t: TickerInput, percentiles: Record<string, number | null>): { metrica: string; pct: number } | null {
  let worst: { metrica: string; pct: number } | null = null;
  for (const m of METRICAS_DIRECCIONALES) {
    const p = percentiles[m];
    if (p == null) continue;
    if (!worst || p < worst.pct) worst = { metrica: m, pct: p };
  }
  return worst;
}

export function sintetizarInterpretacion(
  t: TickerInput,
  percentiles: Record<string, number | null>,
  flags: Flag[],
): string {
  const partes: string[] = [];

  // Percentil de rentabilidad y crecimiento
  const pctROE = percentiles["returnOnEquity"];
  const pctCrec = percentiles["revenueGrowth"];
  const pctMargen = percentiles["profitMargin"];

  if (pctROE != null || pctCrec != null || pctMargen != null) {
    const rents: string[] = [];
    if (pctROE != null) rents.push(`ROE en ${pctLabel(pctROE)}`);
    if (pctMargen != null) rents.push(`margen en ${pctLabel(pctMargen)}`);
    if (pctCrec != null) rents.push(`crecimiento en ${pctLabel(pctCrec)}`);
    if (rents.length > 0) {
      partes.push(`${t.ticker} se ubica con ${rents.join(", ")} dentro del set comparado.`);
    }
  }

  // Mejor y peor métrica
  const mejor = mejorMetrica(t, percentiles);
  const peor = peorMetrica(t, percentiles);
  if (mejor && mejor.pct >= 0.6) {
    const label = LABELS[mejor.metrica] ?? mejor.metrica;
    partes.push(`Su métrica más destacada es ${label} (${pctLabel(mejor.pct)}).`);
  }
  if (peor && peor.pct <= 0.4) {
    const label = LABELS[peor.metrica] ?? peor.metrica;
    partes.push(`Su métrica más rezagada es ${label} (${pctLabel(peor.pct)}).`);
  }

  // Flags
  for (const f of flags) {
    partes.push(f.mensaje.charAt(0).toUpperCase() + f.mensaje.slice(1) + ".");
  }

  return partes.join(" ");
}

export function sintetizarSaludSectorial(
  sector: string,
  interpretaciones: TickerInterpretacion[],
  salud: SaludSectorial,
): string {
  const partes: string[] = [];

  const roeZ = salud.zScores["returnOnEquity"];
  const crecZ = salud.zScores["revenueGrowth"];
  const margenZ = salud.zScores["profitMargin"];

  if (roeZ != null || crecZ != null) {
    const items: string[] = [];
    if (roeZ != null) items.push(`ROE de z=${roeZ.toFixed(2)}`);
    if (crecZ != null) items.push(`crecimiento de ingresos de z=${crecZ.toFixed(2)}`);
    partes.push(`El sector ${sector} muestra, en promedio, ${items.join(" y ")} dentro del set analizado.`);
  }

  if (salud.metricasEvaluadas > 0) {
    const label = salud.compuesto > 0.3 ? "por encima" : salud.compuesto < -0.3 ? "por debajo" : "en línea con";
    partes.push(`El conjunto se posiciona ${label} del promedio de mercado en ${salud.metricasEvaluadas} métricas evaluadas (salud sectorial compuesta: ${salud.compuesto.toFixed(2)}).`);
  }

  return partes.join(" ");
}

// ─── Orquestador principal ──────────────────────────────────────────────────

/**
 * Interpreta un conjunto de tickers (ej. los de un sector o industria).
 * Devuelve interpretaciones individuales + salud sectorial.
 */
export function interpretarSet(
  tickers: TickerInput[],
  sector?: string,
): { individual: TickerInterpretacion[]; sectorial: SectorInterpretacion | null } {
  const N = tickers.length;
  const sinComparables = N < 4;

  const percentilesMap = sinComparables
    ? new Map<string, Record<string, number | null>>(tickers.map((t) => [t.ticker, {}]))
    : calcularPercentilesRelativos(tickers);

  const salud = calcularSaludSectorial(tickers);

  const individual: TickerInterpretacion[] = tickers.map((t) => {
    const pcts = percentilesMap.get(t.ticker) ?? {};
    const flags = sinComparables ? [] : detectarFlags(t, pcts);
    const interpretacion = sinComparables
      ? "Comparables insuficientes para percentilar (N<4)."
      : sintetizarInterpretacion(t, pcts, flags);
    return {
      ticker: t.ticker,
      industry: t.industry,
      percentiles: pcts,
      flags,
      interpretacion,
    };
  });

  let sectorial: SectorInterpretacion | null = null;
  if (sector) {
    const sintesis = sintetizarSaludSectorial(sector, individual, salud);
    sectorial = { sector, tickers: individual, saludSectorial: salud, sintesis };
  }

  return { individual, sectorial };
}
