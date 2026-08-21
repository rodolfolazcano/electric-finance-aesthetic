// @ts-nocheck
//  Módulo: Interpretación Sectorial Inteligente 
// Capa de interpretación sobre la comparación sectorial existente.
// No emite recomendaciones de compra/venta — describe posicionamiento relativo.
// Cumple reglas CNV: lenguaje descriptivo, no imperativo.

import type { FundamentalAFResult } from "./fundamental-af.functions";
import { percentile } from "@/lib/herramientas/math/stats";
import {
  getEscasezPerfil,
  getBottleneckWarning,
} from "@/lib/herramientas/sectores/escasez-taxonomia";

//  Tipos públicos 

export interface PosicionRelativa {
  posicion:
    | "Líder del sector"
    | "Por encima de la mediana"
    | "En línea con el sector"
    | "Por debajo de la mediana"
    | "Rezagado del sector";
  percentilAprox: number;
  interpretacion: string;
}

export interface UmbralesMetrica {
  menorMejor: boolean;
  toleranciaPct: number;
}

export interface ConclusionSectorialInteligente {
  resumenEjecutivo: string;
  fortalezas: string[];
  debilidades: string[];
  mejorAlternativaSector: string | null;
  advertencias: string[];
}

//  Dirección de métricas (mismo criterio que dinámicas.ts) 

const METRIC_DIRECTION: Record<string, "menor_mejor" | "mayor_mejor"> = {
  trailingPE: "menor_mejor",
  forwardPE: "menor_mejor",
  pegRatio: "menor_mejor",
  priceToBook: "menor_mejor",
  evToEbitda: "menor_mejor",
  debtToEquityRaw: "menor_mejor",
  returnOnEquity: "mayor_mejor",
  returnOnAssets: "mayor_mejor",
  profitMargin: "mayor_mejor",
  operatingMargin: "mayor_mejor",
  revenueGrowth: "mayor_mejor",
  earningsGrowth: "mayor_mejor",
  fcfYield: "mayor_mejor",
  dividendYield: "mayor_mejor",
  upsidePct: "mayor_mejor",
};

const METRIC_LABELS: Record<string, string> = {
  trailingPE: "P/E trailing",
  forwardPE: "P/E forward",
  pegRatio: "PEG",
  priceToBook: "P/B",
  evToEbitda: "EV/EBITDA",
  debtToEquityRaw: "D/E",
  returnOnEquity: "ROE",
  returnOnAssets: "ROA",
  profitMargin: "margen neto",
  operatingMargin: "margen operativo",
  revenueGrowth: "crecimiento de ingresos",
  earningsGrowth: "crecimiento de ganancias",
  fcfYield: "FCF yield",
  dividendYield: "dividend yield",
  upsidePct: "upside según consenso",
};

//  Helpers internos 

function extraerValores(peers: FundamentalAFResult[], key: keyof FundamentalAFResult): number[] {
  return peers.map((p) => p[key] as number).filter((v) => v != null && Number.isFinite(v));
}

function mediana(arr: number[]): number | null {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

//  1. Clasificar posición relativa con p25/p75 

export function clasificarPosicionRelativa(
  valorTicker: number,
  medianaSector: number,
  p25: number,
  p75: number,
  direccionDeseada: "menor_mejor" | "mayor_mejor",
  toleranciaPct?: number,
): PosicionRelativa {
  // Percentil aproximado interpolando posición en distribución [0–100]
  let percentilAprox: number;
  const iqr = p75 - p25;
  if (iqr <= 0) {
    percentilAprox = valorTicker < medianaSector ? 25 : valorTicker > medianaSector ? 75 : 50;
  } else if (valorTicker <= p25) {
    const limiteInferior = p25 - iqr;
    const dist = iqr > 0 ? (valorTicker - limiteInferior) / iqr : 0.5;
    percentilAprox = Math.max(0, Math.min(25, dist * 25));
  } else if (valorTicker >= p75) {
    const dist = iqr > 0 ? (valorTicker - p75) / iqr : 0.5;
    percentilAprox = Math.min(100, 75 + Math.min(dist, 1) * 25);
  } else {
    percentilAprox = 25 + (50 * (valorTicker - p25)) / iqr;
  }
  percentilAprox = Math.round(percentilAprox * 100) / 100;

  // Banda "en línea" ajustable por tolerancia sectorial
  const tolerancia = toleranciaPct != null ? Math.max(0, Math.min(100, toleranciaPct)) : 0;
  const bandaLinea = iqr > 0 ? iqr * (tolerancia / 100) : 0;

  // Clasificación en 5 bandas según posición y dirección
  let posicion: PosicionRelativa["posicion"];
  if (direccionDeseada === "menor_mejor") {
    if (valorTicker <= p25) posicion = "Líder del sector";
    else if (valorTicker < medianaSector - bandaLinea) posicion = "Por encima de la mediana";
    else if (valorTicker <= medianaSector + bandaLinea) posicion = "En línea con el sector";
    else if (valorTicker <= p75) posicion = "Por debajo de la mediana";
    else posicion = "Rezagado del sector";
  } else {
    if (valorTicker >= p75) posicion = "Líder del sector";
    else if (valorTicker > medianaSector + bandaLinea) posicion = "Por encima de la mediana";
    else if (valorTicker >= medianaSector - bandaLinea) posicion = "En línea con el sector";
    else if (valorTicker >= p25) posicion = "Por debajo de la mediana";
    else posicion = "Rezagado del sector";
  }

  const esFavorable =
    direccionDeseada === "menor_mejor" ? valorTicker < medianaSector : valorTicker > medianaSector;

  const dirLabel = direccionDeseada === "menor_mejor" ? "bajo" : "alto";
  const opuesto = direccionDeseada === "menor_mejor" ? "alto" : "bajo";

  let interpretacion: string;
  if (posicion === "Líder del sector") {
    interpretacion = esFavorable
      ? `Valor ${dirLabel} vs el sector (percentil ~${percentilAprox}) — se ubica en el cuartil superior en la dirección favorable.`
      : `Valor ${opuesto} vs el sector (percentil ~${percentilAprox}) — se destaca pero en dirección desfavorable, requiere contexto adicional.`;
  } else if (posicion === "Por encima de la mediana") {
    interpretacion = esFavorable
      ? `Por encima de la mediana del sector (percentil ~${percentilAprox}) — posición favorable relativa.`
      : `Por encima de la mediana del sector (percentil ~${percentilAprox}) — aunque ${dirLabel}, dentro del rango intercuartil.`;
  } else if (posicion === "En línea con el sector") {
    interpretacion = `En línea con la mediana del sector (percentil ~${percentilAprox}) — sin desvío significativo respecto al grupo comparable.`;
  } else if (posicion === "Por debajo de la mediana") {
    interpretacion = esFavorable
      ? `Por debajo de la mediana del sector (percentil ~${percentilAprox}) — aunque ${dirLabel}, dentro del rango esperable para el grupo.`
      : `Por debajo de la mediana del sector (percentil ~${percentilAprox}) — posición desfavorable dentro del rango intercuartil.`;
  } else {
    interpretacion = esFavorable
      ? `Valor ${dirLabel} respecto al sector (percentil ~${percentilAprox}) — podría indicar infravaloración relativa si los fundamentos acompañan.`
      : `Valor ${opuesto} respecto al sector (percentil ~${percentilAprox}) — significativamente por fuera del rango típico del grupo comparable.`;
  }

  return { posicion, percentilAprox, interpretacion };
}

//  2. Ajustar umbrales por sector 

const SECTOR_UMBRALES_BASE: Record<string, UmbralesMetrica> = {
  trailingPE: { menorMejor: true, toleranciaPct: 25 },
  forwardPE: { menorMejor: true, toleranciaPct: 25 },
  pegRatio: { menorMejor: true, toleranciaPct: 30 },
  priceToBook: { menorMejor: true, toleranciaPct: 30 },
  evToEbitda: { menorMejor: true, toleranciaPct: 30 },
  debtToEquityRaw: { menorMejor: true, toleranciaPct: 40 },
  returnOnEquity: { menorMejor: false, toleranciaPct: 20 },
  returnOnAssets: { menorMejor: false, toleranciaPct: 20 },
  profitMargin: { menorMejor: false, toleranciaPct: 25 },
  operatingMargin: { menorMejor: false, toleranciaPct: 25 },
  revenueGrowth: { menorMejor: false, toleranciaPct: 30 },
  earningsGrowth: { menorMejor: false, toleranciaPct: 30 },
  fcfYield: { menorMejor: false, toleranciaPct: 30 },
  dividendYield: { menorMejor: false, toleranciaPct: 30 },
  upsidePct: { menorMejor: false, toleranciaPct: 30 },
};

/**
 * Ajusta umbrales según sector/industria.
 * Sectores con dinámicas particulares modifican la tolerancia y dirección de métricas clave.
 */
export function ajustarUmbralesPorSector(
  sector: string,
  industria?: string,
): Record<string, UmbralesMetrica> {
  const umbrales = { ...SECTOR_UMBRALES_BASE };
  const s = (sector ?? "").toLowerCase();
  const ind = (industria ?? "").toLowerCase();

  // Financial Services: márgenes altos son estructurales, D/E alto es normal por apalancamiento bancario
  if (s.includes("financial") || s.includes("financial services")) {
    umbrales.profitMargin = { menorMejor: false, toleranciaPct: 40 };
    umbrales.debtToEquityRaw = { menorMejor: true, toleranciaPct: 80 };
    umbrales.returnOnEquity = { menorMejor: false, toleranciaPct: 25 };
  }

  // Utilities: D/E alto es normal por inversión en infraestructura regulada
  if (s.includes("utilities") || s.includes("utility")) {
    umbrales.debtToEquityRaw = { menorMejor: true, toleranciaPct: 100 };
    umbrales.profitMargin = { menorMejor: false, toleranciaPct: 30 };
    umbrales.revenueGrowth = { menorMejor: false, toleranciaPct: 50 };
  }

  // Retail / Consumer Cyclical: márgenes bajos por naturaleza (volumen alto)
  if (s.includes("consumer cyclical") || s.includes("consumer defensive") || s.includes("retail")) {
    umbrales.profitMargin = { menorMejor: false, toleranciaPct: 50 };
    umbrales.operatingMargin = { menorMejor: false, toleranciaPct: 50 };
  }

  // Technology / Software: márgenes altos típicos, P/E puede ser elevado por crecimiento
  if (s.includes("technology")) {
    umbrales.profitMargin = { menorMejor: false, toleranciaPct: 30 };
    umbrales.trailingPE = { menorMejor: true, toleranciaPct: 35 };
    umbrales.forwardPE = { menorMejor: true, toleranciaPct: 35 };
    umbrales.revenueGrowth = { menorMejor: false, toleranciaPct: 35 };
    umbrales.pegRatio = { menorMejor: true, toleranciaPct: 35 };
  }

  // Energy: alta volatilidad por ciclo de commodities
  if (s.includes("energy") || s.includes("oil") || s.includes("gas")) {
    umbrales.profitMargin = { menorMejor: false, toleranciaPct: 60 };
    umbrales.revenueGrowth = { menorMejor: false, toleranciaPct: 60 };
    umbrales.earningsGrowth = { menorMejor: false, toleranciaPct: 60 };
  }

  // Healthcare / Biotech
  if (s.includes("healthcare") || ind.includes("biotech") || ind.includes("pharmaceutical")) {
    umbrales.trailingPE = { menorMejor: true, toleranciaPct: 50 };
    umbrales.forwardPE = { menorMejor: true, toleranciaPct: 40 };
    umbrales.profitMargin = { menorMejor: false, toleranciaPct: 40 };
    umbrales.revenueGrowth = { menorMejor: false, toleranciaPct: 40 };
  }

  // Real Estate: FFO/NAV más relevantes que P/E
  if (s.includes("real estate") || ind.includes("reit")) {
    umbrales.trailingPE = { menorMejor: true, toleranciaPct: 50 };
    umbrales.debtToEquityRaw = { menorMejor: true, toleranciaPct: 80 };
  }

  // Semiconductors (sub-industria de Technology con dinámica propia)
  if (ind.includes("semiconductor")) {
    umbrales.profitMargin = { menorMejor: false, toleranciaPct: 25 };
    umbrales.trailingPE = { menorMejor: true, toleranciaPct: 20 };
    umbrales.forwardPE = { menorMejor: true, toleranciaPct: 20 };
    umbrales.revenueGrowth = { menorMejor: false, toleranciaPct: 30 };
    umbrales.earningsGrowth = { menorMejor: false, toleranciaPct: 35 };
  }

  return umbrales;
}

//  3. Conclusión sectorial inteligente 

const METRICAS_EVALUAR: (keyof FundamentalAFResult)[] = [
  "trailingPE",
  "forwardPE",
  "pegRatio",
  "priceToBook",
  "evToEbitda",
  "returnOnEquity",
  "profitMargin",
  "operatingMargin",
  "revenueGrowth",
  "earningsGrowth",
  "debtToEquityRaw",
  "fcfYield",
  "dividendYield",
  "upsidePct",
];

/**
 * Genera un análisis sectorial completo con resumen ejecutivo,
 * fortalezas, debilidades, mejor alternativa dentro del set y advertencias.
 */
export function generarConclusionSectorialInteligente(
  ticker: FundamentalAFResult,
  peers: FundamentalAFResult[],
  sector: string,
  industria: string,
): ConclusionSectorialInteligente {
  const advertencias: string[] = [];
  const fortalezas: string[] = [];
  const debilidades: string[] = [];

  // Validar muestra
  const peersValidos = peers.filter((p) => !p.error);
  const muestraInsuficiente = peersValidos.length < 3;
  if (muestraInsuficiente) {
    advertencias.push(
      `Muestra insuficiente: solo ${peersValidos.length} pares válidos. Las conclusiones sobre posicionamiento sectorial tienen baja significación estadística. Los bullets de fortalezas/debilidades incluyen el marcador " dato preliminar" para indicar baja confianza.`,
    );
  }

  // Advertencia para sectores cíclicos
  const s = (sector ?? "").toLowerCase();
  const ind = (industria ?? "").toLowerCase();
  const esCiclico =
    s.includes("energy") || s.includes("basic materials") || s.includes("oil") || s.includes("gas");
  if (esCiclico) {
    advertencias.push(
      "Sector de alta volatilidad cíclica: las métricas de un solo período pueden no reflejar el desempeño normalizado. Se sugiere promediar 3-5 años.",
    );
  }

  // Si biotech/healthcare pre-revenue, advertir sobre P/E
  if (
    (s.includes("healthcare") || ind.includes("biotech")) &&
    ticker.trailingPE == null &&
    ticker.forwardPE == null
  ) {
    advertencias.push(
      "Empresa sin P/E válido (posible pre-revenue o con ganancias negativas). Las métricas de rentabilidad y valuación tradicionales pueden no ser aplicables. Priorizar análisis de cash runway y pipeline.",
    );
  }

  if (peersValidos.length === 0) {
    return {
      resumenEjecutivo: "No hay datos de pares disponibles para generar una comparación sectorial.",
      fortalezas: [],
      debilidades: [],
      mejorAlternativaSector: null,
      advertencias: ["Sin datos de pares del sector para comparar."],
    };
  }

  const umbrales = ajustarUmbralesPorSector(sector, industria);

  // Calcular mediana, p25, p75 para cada métrica
  const metricasAnalizadas: {
    key: keyof FundamentalAFResult;
    label: string;
    valor: number | null;
    mediana: number | null;
    p25: number | null;
    p75: number | null;
    direccion: "menor_mejor" | "mayor_mejor";
  }[] = [];

  for (const key of METRICAS_EVALUAR) {
    const valores = extraerValores(peersValidos, key);
    if (valores.length < 2) continue;
    const valorTicker = ticker[key] as number | null;
    if (valorTicker == null || !Number.isFinite(valorTicker)) continue;

    const m = mediana(valores);
    const p25v = percentile(valores, 25);
    const p75v = percentile(valores, 75);
    if (m == null) continue;

    const direccion = METRIC_DIRECTION[key as string] ?? "mayor_mejor";
    metricasAnalizadas.push({
      key,
      label: METRIC_LABELS[key as string] ?? key,
      valor: valorTicker,
      mediana: m,
      p25: p25v,
      p75: p75v,
      direccion,
    });
  }

  // Clasificar cada métrica con umbrales ajustados por sector
  const clasificaciones: { label: string; posicion: PosicionRelativa }[] = [];
  for (const m of metricasAnalizadas) {
    if (m.valor == null || m.mediana == null || m.p25 == null || m.p75 == null) continue;
    const umbralMetrica = umbrales[m.key as string];
    const tolerancia = umbralMetrica?.toleranciaPct;
    const pos = clasificarPosicionRelativa(
      m.valor,
      m.mediana,
      m.p25,
      m.p75,
      m.direccion,
      tolerancia,
    );
    clasificaciones.push({ label: m.label, posicion: pos });
  }

  // Separar fortalezas y debilidades (lógica determinística: no depende de strings de interpretación)
  const prefijoMuestra = muestraInsuficiente
    ? ` dato preliminar (n=${peersValidos.length}): `
    : "";

  for (const c of clasificaciones) {
    switch (c.posicion.posicion) {
      case "Líder del sector":
      case "Por encima de la mediana":
        fortalezas.push(
          `${prefijoMuestra}${c.label}: ${c.posicion.posicion} (percentil ~${c.posicion.percentilAprox}).`,
        );
        break;
      case "Por debajo de la mediana":
      case "Rezagado del sector":
        debilidades.push(
          `${prefijoMuestra}${c.label}: ${c.posicion.posicion} (percentil ~${c.posicion.percentilAprox}).`,
        );
        break;
    }
  }

  // Generar resumen ejecutivo
  let resumenEjecutivo = "";
  const sectorLabel = industria || sector || "el sector";
  const tickerName = ticker.companyName || ticker.symbol;

  // Identificar métricas destacadas (fortaleza) y débiles (debilidad) — determinístico por posición
  const metricasFavorables = clasificaciones.filter(
    (c) =>
      c.posicion.posicion === "Líder del sector" ||
      c.posicion.posicion === "Por encima de la mediana",
  );
  const metricasDesfavorables = clasificaciones.filter(
    (c) =>
      c.posicion.posicion === "Rezagado del sector" ||
      c.posicion.posicion === "Por debajo de la mediana",
  );

  if (metricasFavorables.length > 0 && metricasDesfavorables.length > 0) {
    const topFav = metricasFavorables
      .slice(0, 2)
      .map((c) => c.label)
      .join(" y ");
    const topDes = metricasDesfavorables
      .slice(0, 2)
      .map((c) => c.label)
      .join(" y ");
    resumenEjecutivo = `Dentro de ${sectorLabel}, ${tickerName} muestra fortaleza en ${topFav}, mientras que su posicionamiento es más débil en ${topDes}. Esta combinación sugiere un perfil con ventajas específicas pero también áreas de atención dentro del grupo comparable.`;
  } else if (metricasFavorables.length > 0) {
    const topFav = metricasFavorables.map((c) => c.label).join(", ");
    resumenEjecutivo = `Dentro de ${sectorLabel}, ${tickerName} se destaca en ${topFav}, ubicándose consistentemente por encima de la mediana del grupo comparable en las métricas clave evaluadas.`;
  } else if (metricasDesfavorables.length > 0) {
    const topDes = metricasDesfavorables.map((c) => c.label).join(", ");
    resumenEjecutivo = `Dentro de ${sectorLabel}, ${tickerName} presenta posicionamiento por debajo de la mediana del grupo en ${topDes}. Se sugiere evaluar si las expectativas de cambio o las características particulares del negocio justifican esta diferencia antes de extraer conclusiones.`;
  } else if (clasificaciones.length > 0) {
    resumenEjecutivo = `Dentro de ${sectorLabel}, ${tickerName} se alinea con los valores centrales del grupo comparable en la mayoría de las métricas evaluadas, sin desvíos significativos respecto a la mediana del sector.`;
  } else {
    resumenEjecutivo = `No se pudieron establecer comparaciones métricas suficientes entre ${tickerName} y sus pares de ${sectorLabel}.`;
  }

  // Mejor alternativa dentro del set: candidatos con fundScore comparable al líder, menor P/E gana
  let mejorAlternativaSector: string | null = null;
  if (peersValidos.length >= 2) {
    const candidatos = peersValidos
      .map((p) => ({
        ticker: p.symbol,
        score: p.fundScore ?? 0,
        pe: p.trailingPE,
      }))
      .filter((p) => p.ticker !== ticker.symbol);

    if (candidatos.length > 0) {
      const maxScore = Math.max(...candidatos.map((c) => c.score));
      // Filtrar los que estén dentro de 10pts del líder; relajar a 15 si nadie pasa
      let umbral = 10;
      let finalistas = candidatos.filter((c) => c.score >= maxScore - umbral);
      if (finalistas.length === 0) {
        umbral = 15;
        finalistas = candidatos.filter((c) => c.score >= maxScore - umbral);
      }
      if (finalistas.length > 0) {
        // Entre los finalistas, elegir el de menor P/E (excluir PE null/negativo si hay alternativa)
        const conPE = finalistas.filter((f) => f.pe != null && f.pe > 0);
        const elegido =
          conPE.length > 0
            ? conPE.sort((a, b) => a.pe! - b.pe!)[0]
            : finalistas.sort((a, b) => b.score - a.score)[0];
        mejorAlternativaSector = `${elegido.ticker} (fundScore ${elegido.score}/100, P/E ${elegido.pe != null && elegido.pe > 0 ? elegido.pe.toFixed(1) + "x" : "N/D"}) — dentro de los candidatos con score comparable al líder del sector, presenta el múltiplo más bajo.`;
      }
    }
  }

  //  Cuello de Botella Estructural + Riesgo Geopolítico 
  const escasez = getEscasezPerfil(sector);
  if (escasez.tipoEscasez === "estructural" || escasez.leadTimeYears >= 5) {
    advertencias.push(
      `Cuello de botella ESTRUCTURAL: ${escasez.bottleneckFactor} — lead time de oferta ~${escasez.leadTimeYears} años. La escasez no es resoluble en el corto plazo, lo que da soporte estructural al precio.`,
    );
    if (escasez.riesgoGeopolitico === "alto") {
      advertencias.push(
        `Riesgo geopolítico ALTO: dependencia crítica de ${escasez.dependenciaImportaciones.join(", ")}. Cualquier disrupción impacta directamente la cadena de oferta.`,
      );
    }
  } else if (escasez.riesgoGeopolitico === "alto") {
    advertencias.push(
      `Riesgo geopolítico ALTO: ${escasez.bottleneckFactor}. Dependencia de ${escasez.dependenciaImportaciones.join(", ")}.`,
    );
  }

  if (escasez.tipoEscasez !== "n/a" && escasez.leadTimeYears > 0) {
    fortalezas.push(
      `Ventaja estructural: lead time de oferta de ~${escasez.leadTimeYears} años (${escasez.tipoEscasez}). Las barreras de entrada protegen a los incumbentes.`,
    );
  }

  // Limitar outputs largos
  const FORTALEZAS_MAX = 5;
  const DEBILIDADES_MAX = 4;
  const ADVERTENCIAS_MAX = 5;

  return {
    resumenEjecutivo,
    fortalezas: fortalezas.slice(0, FORTALEZAS_MAX),
    debilidades: debilidades.slice(0, DEBILIDADES_MAX),
    mejorAlternativaSector,
    advertencias: advertencias.slice(0, ADVERTENCIAS_MAX),
  };
}
