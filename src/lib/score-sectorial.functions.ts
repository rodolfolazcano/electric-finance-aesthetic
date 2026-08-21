// @ts-nocheck
// FASE 6 — Motor sectorial legacy conservado.
// # REVISAR: calcularScoreSectorial devuelve un shape rico
// (ScoreSectorialResult con metricas individuales, cobertura y alertas) que no
// es reconstruible desde SubScore.detalle de scoring/sectorial.ts (Fase 2, que
// motor-unificado usa como subScores.sectorial). Sin equivalente directo que
// preserve el shape -> se conserva el cálculo propio (// LEGACY). El core
// sectorial del motor unificado vive en src/lib/scoring/sectorial.ts.
import type { FundamentalAFResult } from "./fundamental-af.functions";
import { clasificarPosicionRelativa } from "./interpretacion-sectorial.functions";
import type { CicloEconomico } from "./intermarket-engine";
import { sectorBloqueadoPorCiclo, nivelSectorPorCiclo } from "./intermarket-engine";
import { isCedear } from "@/lib/herramientas/sectores/sector-mapping";

export interface MetricaSectorialConfig {
  campo: keyof FundamentalAFResult;
  peso: number;
  direccion: "mayor_mejor" | "menor_mejor";
  bandas: [number, number, number];
  etiqueta: string;
}

interface SectorConfig {
  sectorEn: string;
  metricas: MetricaSectorialConfig[];
}

export interface MetricaSectorialResult {
  campo: keyof FundamentalAFResult;
  etiqueta: string;
  valor: number | null;
  puntaje: number | null;
  peso: number;
  pesoEfectivo: number;
  noDisponible: boolean;
  direccion: "mayor_mejor" | "menor_mejor";
  alerta?: string;
}

export interface ScoreSectorialResult {
  aplica: boolean;
  sector: string | null;
  sectorEn: string | null;
  metricas: MetricaSectorialResult[];
  scoreSectorial: number | null;
  coberturaDatos: number;
  alertas: string[];
}

const SECTOR_EN_KEY: Record<string, string> = {
  Energía: "Energy",
  "Servicios de comunicación": "Communication Services",
  "Servicios financieros": "Financial Services",
  "Defensiva del Consumidor": "Consumer Defensive",
  "Bienes raíces": "Real Estate",
  "Cuidado de la salud": "Healthcare",
  Utilidades: "Utilities",
  "Materiales Básicos": "Basic Materials",
  "Consumo cíclico": "Consumer Cyclical",
  "Acciones industriales": "Industrials",
  Tecnología: "Technology",
};

const SECTOR_CONFIG: Record<string, SectorConfig> = {
  Technology: {
    sectorEn: "Technology",
    metricas: [
      {
        campo: "rdToRevenuePct",
        peso: 30,
        direccion: "mayor_mejor",
        bandas: [2, 8, 15],
        etiqueta: "I+D sobre ingresos",
      },
      {
        campo: "operatingMargin",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.12, 0.25],
        etiqueta: "Margen operativo (TTM)",
      },
      {
        campo: "revenueGrowth",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [-0.02, 0.05, 0.15],
        etiqueta: "Crecimiento de ingresos (TTM)",
      },
      {
        campo: "returnOnEquity",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.12, 0.25],
        etiqueta: "ROE (TTM)",
      },
      {
        campo: "fcfYield",
        peso: 10,
        direccion: "mayor_mejor",
        bandas: [0.02, 0.05, 0.1],
        etiqueta: "FCF Yield (TTM)",
      },
    ],
  },
  Healthcare: {
    sectorEn: "Healthcare",
    metricas: [
      {
        campo: "rdToRevenuePct",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [5, 12, 20],
        etiqueta: "I+D sobre ingresos",
      },
      {
        campo: "profitMargin",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0.03, 0.1, 0.2],
        etiqueta: "Margen neto",
      },
      {
        campo: "returnOnEquity",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.12, 0.25],
        etiqueta: "ROE",
      },
      {
        campo: "revenueGrowth",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [-0.02, 0.05, 0.12],
        etiqueta: "Crecimiento de ingresos",
      },
      {
        campo: "debtToEquityRaw",
        peso: 15,
        direccion: "menor_mejor",
        bandas: [0.3, 0.8, 1.5],
        etiqueta: "Deuda / Patrimonio",
      },
    ],
  },
  "Financial Services": {
    sectorEn: "Financial Services",
    metricas: [
      {
        campo: "returnOnEquity",
        peso: 30,
        direccion: "mayor_mejor",
        bandas: [0.06, 0.12, 0.2],
        etiqueta: "ROE",
      },
      {
        campo: "profitMargin",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.15, 0.3],
        etiqueta: "Margen neto",
      },
      {
        campo: "totalAssets",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [10000, 100000, 500000],
        etiqueta: "Activos totales (M)",
      },
      {
        campo: "debtToEquityRaw",
        peso: 15,
        direccion: "menor_mejor",
        bandas: [0.5, 1.5, 3.0],
        etiqueta: "Deuda / Patrimonio",
      },
      {
        campo: "operatingMargin",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.15, 0.3],
        etiqueta: "Margen operativo",
      },
    ],
  },
  Energy: {
    sectorEn: "Energy",
    metricas: [
      {
        campo: "freeCashflowM",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0, 500, 5000],
        etiqueta: "FCF (M)",
      },
      {
        campo: "debtToEquityRaw",
        peso: 20,
        direccion: "menor_mejor",
        bandas: [0.3, 0.8, 1.5],
        etiqueta: "Deuda / Patrimonio",
      },
      {
        campo: "returnOnEquity",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.03, 0.1, 0.2],
        etiqueta: "ROE",
      },
      {
        campo: "operatingMargin",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.15, 0.3],
        etiqueta: "Margen operativo",
      },
      {
        campo: "totalCashFromOperatingActivities",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [0, 1000, 10000],
        etiqueta: "Flujo operativo (M)",
      },
    ],
  },
  "Consumer Defensive": {
    sectorEn: "Consumer Defensive",
    metricas: [
      {
        campo: "payoutRatio",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0.2, 0.4, 0.6],
        etiqueta: "Payout ratio",
      },
      {
        campo: "fcfYield",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0.02, 0.04, 0.08],
        etiqueta: "FCF Yield",
      },
      {
        campo: "debtToEquityRaw",
        peso: 20,
        direccion: "menor_mejor",
        bandas: [0.3, 0.8, 1.5],
        etiqueta: "Deuda / Patrimonio",
      },
      {
        campo: "returnOnEquity",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [0.08, 0.15, 0.3],
        etiqueta: "ROE",
      },
      {
        campo: "profitMargin",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [0.03, 0.08, 0.15],
        etiqueta: "Margen neto",
      },
    ],
  },
  "Consumer Cyclical": {
    sectorEn: "Consumer Cyclical",
    metricas: [
      {
        campo: "returnOnEquity",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.12, 0.25],
        etiqueta: "ROE",
      },
      {
        campo: "revenueGrowth",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [-0.03, 0.05, 0.15],
        etiqueta: "Crecimiento de ingresos",
      },
      {
        campo: "operatingMargin",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.03, 0.08, 0.18],
        etiqueta: "Margen operativo",
      },
      {
        campo: "debtToEquityRaw",
        peso: 15,
        direccion: "menor_mejor",
        bandas: [0.3, 0.8, 1.5],
        etiqueta: "Deuda / Patrimonio",
      },
      {
        campo: "fcfYield",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [0.01, 0.04, 0.08],
        etiqueta: "FCF Yield",
      },
    ],
  },
  Industrials: {
    sectorEn: "Industrials",
    metricas: [
      {
        campo: "operatingMargin",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.12, 0.22],
        etiqueta: "Margen operativo",
      },
      {
        campo: "returnOnEquity",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.06, 0.12, 0.22],
        etiqueta: "ROE",
      },
      {
        campo: "interestCoverageRatio",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [1.5, 3.0, 8.0],
        etiqueta: "Cobertura de intereses",
      },
      {
        campo: "workingCapital",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [-500, 500, 5000],
        etiqueta: "Capital de trabajo (M)",
      },
      {
        campo: "debtToEquityRaw",
        peso: 15,
        direccion: "menor_mejor",
        bandas: [0.3, 0.8, 1.5],
        etiqueta: "Deuda / Patrimonio",
      },
    ],
  },
  "Basic Materials": {
    sectorEn: "Basic Materials",
    metricas: [
      {
        campo: "returnOnAssets",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0.02, 0.05, 0.12],
        etiqueta: "ROA",
      },
      {
        campo: "operatingMargin",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.12, 0.25],
        etiqueta: "Margen operativo",
      },
      {
        campo: "debtToEquityRaw",
        peso: 20,
        direccion: "menor_mejor",
        bandas: [0.3, 0.8, 1.5],
        etiqueta: "Deuda / Patrimonio",
      },
      {
        campo: "freeCashflowM",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [-100, 200, 2000],
        etiqueta: "FCF (M)",
      },
      {
        campo: "currentRatio",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [0.8, 1.2, 2.0],
        etiqueta: "Liquidez corriente",
      },
    ],
  },
  Utilities: {
    sectorEn: "Utilities",
    metricas: [
      {
        campo: "interestCoverageRatio",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [1.2, 2.5, 5.0],
        etiqueta: "Cobertura de intereses",
      },
      {
        campo: "debtToEquityRaw",
        peso: 20,
        direccion: "menor_mejor",
        bandas: [0.5, 1.2, 2.5],
        etiqueta: "Deuda / Patrimonio",
      },
      {
        campo: "returnOnEquity",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.04, 0.08, 0.15],
        etiqueta: "ROE",
      },
      {
        campo: "operatingMargin",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.08, 0.18, 0.3],
        etiqueta: "Margen operativo",
      },
      {
        campo: "totalCashFromOperatingActivities",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [100, 1000, 5000],
        etiqueta: "Flujo operativo (M)",
      },
    ],
  },
  "Communication Services": {
    sectorEn: "Communication Services",
    metricas: [
      {
        campo: "revenueGrowth",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [-0.02, 0.05, 0.15],
        etiqueta: "Crecimiento de ingresos",
      },
      {
        campo: "profitMargin",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.03, 0.1, 0.2],
        etiqueta: "Margen neto",
      },
      {
        campo: "returnOnEquity",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.05, 0.12, 0.25],
        etiqueta: "ROE",
      },
      {
        campo: "fcfYield",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.02, 0.05, 0.1],
        etiqueta: "FCF Yield",
      },
      {
        campo: "debtToEquityRaw",
        peso: 15,
        direccion: "menor_mejor",
        bandas: [0.3, 0.8, 1.5],
        etiqueta: "Deuda / Patrimonio",
      },
    ],
  },
  "Real Estate": {
    sectorEn: "Real Estate",
    metricas: [
      {
        campo: "fcfYield",
        peso: 25,
        direccion: "mayor_mejor",
        bandas: [0.03, 0.06, 0.12],
        etiqueta: "FCF Yield",
      },
      {
        campo: "debtToEquityRaw",
        peso: 25,
        direccion: "menor_mejor",
        bandas: [0.5, 1.5, 3.0],
        etiqueta: "Deuda / Patrimonio",
      },
      {
        campo: "returnOnEquity",
        peso: 20,
        direccion: "mayor_mejor",
        bandas: [0.04, 0.08, 0.15],
        etiqueta: "ROE",
      },
      {
        campo: "totalAssets",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [1000, 10000, 100000],
        etiqueta: "Activos totales (M)",
      },
      {
        campo: "operatingMargin",
        peso: 15,
        direccion: "mayor_mejor",
        bandas: [0.1, 0.25, 0.45],
        etiqueta: "Margen operativo",
      },
    ],
  },
};

function puntuarMetrica(
  valor: number,
  direccion: "mayor_mejor" | "menor_mejor",
  bandas: [number, number, number],
): number {
  const [c1, c2, c3] = bandas;
  if (direccion === "mayor_mejor") {
    if (valor >= c3) return 100;
    if (valor >= c2) return 75;
    if (valor >= c1) return 50;
    return 25;
  }
  if (valor <= c1) return 100;
  if (valor <= c2) return 75;
  if (valor <= c3) return 50;
  return 25;
}

function percentiles(arr: number[]): { p25: number; p50: number; p75: number } {
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  const p = (idx: number) => {
    const pos = idx * (n - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
  };
  return { p25: p(0.25), p50: p(0.5), p75: p(0.75) };
}

function extraerValor(
  ticker: FundamentalAFResult,
  campo: keyof FundamentalAFResult,
): number | null {
  const v = ticker[campo];
  if (typeof v === "number" && isFinite(v)) return v;
  return null;
}

//  Filtro macro top-down: el ciclo bloquea sectores enteros 
// El motor intermercado no evalúa a la empresa, evalúa el entorno.
// Su resultado se unifica bloqueando o habilitando el análisis
// fundamental posterior según la etapa del ciclo vigente.

export interface FiltroCicloResult {
  permitido: boolean; // se mantiene, pero de acá en más SIEMPRE es true
  motivo: string | null;
  nivel: "favorecido" | "neutral" | "fuera_de_ciclo"; // NUEVO
}

export function filtrarPorCicloEconomico(
  sectorEn: string | null,
  ciclo: CicloEconomico,
): FiltroCicloResult {
  if (!sectorEn) {
    return { permitido: true, motivo: null, nivel: "fuera_de_ciclo" };
  }

  // Nueva lógica: siempre permitido, pero con nivel informativo
  const resultadoNivel = nivelSectorPorCiclo(sectorEn, ciclo);

  return {
    permitido: true, // SIEMPRE true — no oculta más
    motivo: resultadoNivel.motivo,
    nivel: resultadoNivel.nivel,
  };
}

export function calcularScoreSectorial(
  result: FundamentalAFResult,
  sectorComparacion: FundamentalAFResult[] | null,
): ScoreSectorialResult {
  // Excluir CEDEARs del análisis sectorial porque sus múltiplos no son confiables
  // (precio ARS dividido por métricas USD sin ratio de conversión ni FX)
  const esCedear = isCedear(result.symbol);
  if (esCedear) {
    return {
      aplica: false,
      sector: result.sector,
      sectorEn: null,
      metricas: [],
      scoreSectorial: null,
      coberturaDatos: 0,
      alertas: [
        `Este ticker (${result.symbol}) es un CEDEAR. Los múltiplos sectoriales (P/E, P/B, EV/EBITDA, etc.) no son confiables porque Yahoo Finance no aplica el ratio de conversión del CEDEAR ni el tipo de cambio ARS/USD. Se recomienda analizar el ticker subyacente en USD para comparación sectorial precisa.`,
      ],
    };
  }

  if (result.esETF || !result.sector) {
    return {
      aplica: false,
      sector: result.sector,
      sectorEn: null,
      metricas: [],
      scoreSectorial: null,
      coberturaDatos: 0,
      alertas: [],
    };
  }

  const sectorEn = SECTOR_EN_KEY[result.sector] ?? null;
  if (!sectorEn || !SECTOR_CONFIG[sectorEn]) {
    return {
      aplica: false,
      sector: result.sector,
      sectorEn: null,
      metricas: [],
      scoreSectorial: null,
      coberturaDatos: 0,
      alertas: [],
    };
  }

  const config = SECTOR_CONFIG[sectorEn];
  const metricas: MetricaSectorialResult[] = [];
  let sumaPonderada = 0;
  let pesoDisponible = 0;
  let alertas: string[] = [];

  for (const m of config.metricas) {
    const valor = extraerValor(result, m.campo);
    const noDisponible = valor == null;

    let puntaje: number | null = null;
    if (!noDisponible) {
      // Normalizar debtToEquityRaw: se almacena como porcentaje (20.03 = 20.03%), las bandas usan decimal (0.30)
      const valorNormalizado = m.campo === "debtToEquityRaw" ? valor / 100 : valor;
      puntaje = puntuarMetrica(valorNormalizado, m.direccion, m.bandas);
      sumaPonderada += puntaje * m.peso;
      pesoDisponible += m.peso;
    }

    metricas.push({
      campo: m.campo,
      etiqueta: m.etiqueta,
      valor,
      puntaje,
      peso: m.peso,
      pesoEfectivo: 0,
      noDisponible,
      direccion: m.direccion,
    });
  }

  if (pesoDisponible === 0) {
    return {
      aplica: true,
      sector: result.sector,
      sectorEn,
      metricas: metricas.map((m) => ({ ...m, pesoEfectivo: m.peso })),
      scoreSectorial: null,
      coberturaDatos: 0,
      alertas: ["Sin datos suficientes para calcular score sectorial"],
    };
  }

  const factorRedistribucion = 100 / pesoDisponible;
  for (const m of metricas) {
    m.pesoEfectivo = m.noDisponible ? 0 : Math.round(m.peso * factorRedistribucion * 100) / 100;
  }

  // Guardar el peso base de métricas sectoriales antes de agregar Graham/Amat
  const pesoBaseSectorial = pesoDisponible;
  const sumaBaseSectorial = sumaPonderada;

  //  Graham: Margen de Seguridad (BONUS adicional) 
  const epsGraham =
    result.currentPrice && result.trailingPE && result.trailingPE > 0
      ? result.currentPrice / result.trailingPE
      : null;
  const bvps =
    result.totalStockholderEquity && result.sharesOutstanding && result.sharesOutstanding > 0
      ? result.totalStockholderEquity / result.sharesOutstanding
      : null;
  let grahamPuntaje: number | null = null;
  let grahamBonus = 0;
  if (
    epsGraham &&
    epsGraham > 0 &&
    bvps &&
    bvps > 0 &&
    result.currentPrice &&
    result.currentPrice > 0
  ) {
    const grahamNumber = Math.sqrt(22.5 * epsGraham * bvps);
    const mos = (grahamNumber - result.currentPrice) / result.currentPrice;
    grahamPuntaje = mos > 0.3 ? 100 : mos > 0.15 ? 75 : mos > 0 ? 50 : 25;
    // Graham es un bonus, no afecta el denominador base
    grahamBonus = grahamPuntaje * 0.15; // 15% de peso relativo al score base
    metricas.push({
      campo: "currentPrice" as any,
      etiqueta: "Margen de Seguridad (Graham) [BONUS]",
      valor: Math.round(mos * 10000) / 100,
      puntaje: grahamPuntaje,
      peso: 15,
      pesoEfectivo: 15,
      noDisponible: false,
      direccion: "mayor_mejor",
    });
    if (mos > 0.3)
      alertas.push(
        `Margen de Seguridad (Graham): ${(mos * 100).toFixed(0)}% — precio por debajo del Número de Graham, infravaloración potencial.`,
      );
    else if (mos < 0)
      alertas.push(
        `Margen de Seguridad (Graham): ${(mos * 100).toFixed(0)}% — precio por encima del Número de Graham, sin margen.`,
      );
  }

  //  Amat: Solvencia Patrimonial (BONUS adicional) 
  let amatBonus = 0;
  if (result.totalStockholderEquity && result.totalAssets && result.totalAssets > 0) {
    const solvencyRatio = result.totalStockholderEquity / result.totalAssets;
    const solPuntaje =
      solvencyRatio >= 0.5 ? 100 : solvencyRatio >= 0.4 ? 75 : solvencyRatio >= 0.25 ? 50 : 25;
    // Amat es un bonus, no afecta el denominador base
    amatBonus = solPuntaje * 0.1; // 10% de peso relativo al score base
    metricas.push({
      campo: "totalStockholderEquity" as any,
      etiqueta: "Solvencia (PN/Activo - Amat) [BONUS]",
      valor: Math.round(solvencyRatio * 10000) / 100,
      puntaje: solPuntaje,
      peso: 10,
      pesoEfectivo: 10,
      noDisponible: false,
      direccion: "mayor_mejor",
    });
    if (solvencyRatio < 0.4) {
      alertas.push(
        `Solvencia baja (PN/Activo=${(solvencyRatio * 100).toFixed(0)}%): umbral Amat de fragilidad financiera (<40%). Sector vulnerable ante crisis de crédito.`,
      );
    }
  }

  // Score base sectorial (sobre 100)
  const scoreSectorial =
    pesoBaseSectorial > 0 ? Math.round((sumaBaseSectorial / pesoBaseSectorial) * 100) / 100 : 0;

  // Score final con bonuses aplicados
  let scoreFinal = scoreSectorial + grahamBonus + amatBonus;

  // Sector‑specific bonuses
  if (
    sectorEn === "Consumer Defensive" &&
    result.healthScoreHistory &&
    result.healthScoreHistory.length >= 3
  ) {
    const scores = result.healthScoreHistory.map((h) => h.score).filter((s) => s > 0);
    if (scores.length >= 3) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv < 0.15) {
        scoreFinal = Math.min(100, scoreFinal + 5);
        alertas.push("Bonus +5: Estabilidad histórica comprobada (varianza <15% en healthScore)");
      }
    }
  }

  // Cobertura de datos calculada correctamente sobre el presupuesto base de 100
  const coberturaDatos = Math.round((pesoBaseSectorial / 100) * 100);

  // Alerts from sector comparison (5‑band classification)
  if (sectorComparacion && sectorComparacion.length >= 3) {
    const peers = sectorComparacion.filter((p) => p.symbol !== result.symbol);
    for (const m of metricas) {
      if (m.noDisponible || m.valor == null) continue;
      const valores = peers
        .map((p) => extraerValor(p, m.campo))
        .filter((v): v is number => v != null);
      if (valores.length < 3) continue;

      const { p25, p50, p75 } = percentiles(valores);
      const clasif = clasificarPosicionRelativa(m.valor, p50, p25, p75, m.direccion);
      m.alerta = `${m.etiqueta}: ${clasif.posicion}`;
      if (clasif.posicion.includes("Líder")) {
        alertas.push(`${m.etiqueta}: ${clasif.posicion}`);
      } else if (clasif.posicion.includes("Rezagado")) {
        alertas.push(`${m.etiqueta}: ${clasif.posicion}`);
      }
    }
  }

  alertas = [...new Set(alertas)];

  return {
    aplica: true,
    sector: result.sector,
    sectorEn,
    metricas,
    scoreSectorial: Math.round(scoreFinal * 100) / 100,
    coberturaDatos,
    alertas,
  };
}
