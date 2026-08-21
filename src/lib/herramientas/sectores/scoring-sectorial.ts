/**
 * Motor sectorial puro — portado de clarity-dashboard (src/lib/scoring/sectorial.ts).
 * Fórmulas, pesos, bandas por sector y bonuses Graham/Amat idénticos.
 * El bonus Graham+Amat puede superar 100 → se clampea a 100 y el valor sin
 * clamp se guarda en detalle["valorConBonusSinClamp"].
 *
 * Flujo: input con fundamentales → mapear sector EN → SECTOR_CONFIG[sector].metricas
 * → puntuarMetrica por bandas → Graham bonus + Amat bonus → clamp 0-100.
 */

import { isCedear } from "./sector-mapping";

export interface SubScore {
  valor: number;
  raw?: number;
  detalle: Record<string, number>;
  fuente: string;
  disponible: boolean;
}

export interface MetricaSectorialConfig {
  campo: keyof SectorialInput;
  peso: number;
  direccion: "mayor_mejor" | "menor_mejor";
  bandas: [number, number, number];
  etiqueta: string;
}

interface SectorConfig {
  sectorEn: string;
  metricas: MetricaSectorialConfig[];
}

export interface SectorialInput {
  symbol: string;
  sector: string | null;
  esETF: boolean;
  currentPrice: number | null;
  trailingPE: number | null;
  totalStockholderEquity: number | null;
  sharesOutstanding: number | null;
  totalAssets: number | null;
  healthScoreHistory: { year: number; score: number }[];
  // métricas usadas por SECTOR_CONFIG
  rdToRevenuePct: number | null;
  operatingMargin: number | null;
  revenueGrowth: number | null;
  returnOnEquity: number | null;
  fcfYield: number | null;
  profitMargin: number | null;
  debtToEquityRaw: number | null;
  freeCashflowM: number | null;
  totalCashFromOperatingActivities: number | null;
  payoutRatio: number | null;
  interestCoverageRatio: number | null;
  workingCapital: number | null;
  returnOnAssets: number | null;
  currentRatio: number | null;
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
  // Alias en inglés (assetProfile.sector de Yahoo) para robustez
  Energy: "Energy",
  "Communication Services": "Communication Services",
  "Financial Services": "Financial Services",
  "Consumer Defensive": "Consumer Defensive",
  "Real Estate": "Real Estate",
  Healthcare: "Healthcare",
  Utilities: "Utilities",
  "Basic Materials": "Basic Materials",
  "Consumer Cyclical": "Consumer Cyclical",
  Industrials: "Industrials",
  Technology: "Technology",
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

/** Config sectorial para un sector en español (según sectores.json). Solo lectura interna/tests. */
export function configParaSector(sectorEs: string): SectorConfig | null {
  const sectorEn = SECTOR_EN_KEY[sectorEs] ?? null;
  return sectorEn ? (SECTOR_CONFIG[sectorEn] ?? null) : null;
}

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

function extraerValor(ticker: SectorialInput, campo: keyof SectorialInput): number | null {
  const v = ticker[campo];
  if (typeof v === "number" && isFinite(v)) return v;
  return null;
}

export function calcularSectorial(input: SectorialInput): SubScore {
  const detalle: Record<string, number> = {};

  // CEDEARs: excluidos tal como el original
  if (isCedear(input.symbol)) {
    return {
      valor: 50,
      detalle: {},
      fuente: "sectores/scoring-sectorial.ts",
      disponible: false,
    };
  }

  if (input.esETF || !input.sector) {
    return {
      valor: 50,
      detalle: {},
      fuente: "sectores/scoring-sectorial.ts",
      disponible: false,
    };
  }

  const sectorEn = SECTOR_EN_KEY[input.sector] ?? null;
  const config = sectorEn ? SECTOR_CONFIG[sectorEn] : null;
  if (!config) {
    return {
      valor: 50,
      detalle: {},
      fuente: "sectores/scoring-sectorial.ts",
      disponible: false,
    };
  }

  let sumaPonderada = 0;
  let pesoDisponible = 0;

  for (const m of config.metricas) {
    const valor = extraerValor(input, m.campo);
    const noDisponible = valor == null;

    let puntaje: number | null = null;
    if (!noDisponible && valor != null) {
      // debtToEquityRaw se almacena como porcentaje (20.03 = 20.03%), bandas usan decimal (0.30)
      const valorNormalizado = m.campo === "debtToEquityRaw" ? valor / 100 : valor;
      puntaje = puntuarMetrica(valorNormalizado, m.direccion, m.bandas);
      sumaPonderada += puntaje * m.peso;
      pesoDisponible += m.peso;
    }

    if (puntaje != null) detalle[m.campo as string] = puntaje;
  }

  if (pesoDisponible === 0) {
    return {
      valor: 50,
      detalle: {},
      fuente: "sectores/scoring-sectorial.ts",
      disponible: false,
    };
  }

  // ─── Graham: Margen de Seguridad (BONUS) ─────────────
  let grahamBonus = 0;
  const epsGraham =
    input.currentPrice && input.trailingPE && input.trailingPE > 0
      ? input.currentPrice / input.trailingPE
      : null;
  const bvps =
    input.totalStockholderEquity && input.sharesOutstanding && input.sharesOutstanding > 0
      ? input.totalStockholderEquity / input.sharesOutstanding
      : null;
  if (
    epsGraham &&
    epsGraham > 0 &&
    bvps &&
    bvps > 0 &&
    input.currentPrice &&
    input.currentPrice > 0
  ) {
    const grahamNumber = Math.sqrt(22.5 * epsGraham * bvps);
    const mos = (grahamNumber - input.currentPrice) / input.currentPrice;
    const grahamPuntaje = mos > 0.3 ? 100 : mos > 0.15 ? 75 : mos > 0 ? 50 : 25;
    grahamBonus = grahamPuntaje * 0.15; // 15% de peso relativo al score base
    detalle["grahamMos"] = Math.round(mos * 10000) / 100;
    detalle["grahamBonus"] = grahamBonus;
  }

  // ─── Amat: Solvencia Patrimonial (BONUS) ─────────────
  let amatBonus = 0;
  if (input.totalStockholderEquity && input.totalAssets && input.totalAssets > 0) {
    const solvencyRatio = input.totalStockholderEquity / input.totalAssets;
    const solPuntaje =
      solvencyRatio >= 0.5 ? 100 : solvencyRatio >= 0.4 ? 75 : solvencyRatio >= 0.25 ? 50 : 25;
    amatBonus = solPuntaje * 0.1; // 10% de peso relativo al score base
    detalle["amatSolvencia"] = Math.round(solvencyRatio * 10000) / 100;
    detalle["amatBonus"] = amatBonus;
  }

  // FIX: el original clarity multiplicaba por 100 sobre puntajes 0-100 con pesos
  // que suman 100 (doble escala → siempre clampeaba a 100). El promedio ponderado
  // correcto vive en 0-100 sin re-escalar.
  const scoreSectorial = sumaPonderada / pesoDisponible;
  let scoreFinal = scoreSectorial + grahamBonus + amatBonus;

  // Sector-specific bonus (Consumer Defensive, healthScore estable)
  if (
    sectorEn === "Consumer Defensive" &&
    input.healthScoreHistory &&
    input.healthScoreHistory.length >= 3
  ) {
    const scores = input.healthScoreHistory.map((h) => h.score).filter((s) => s > 0);
    if (scores.length >= 3) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv < 0.15) {
        scoreFinal = Math.min(100, scoreFinal + 5);
        detalle["bonusEstabilidadConsumidor"] = 5;
      }
    }
  }

  if (!Number.isFinite(scoreFinal)) {
    return { valor: 50, detalle: {}, fuente: "sectores/scoring-sectorial.ts", disponible: false };
  }

  detalle["coberturaDatos"] = Math.round((pesoDisponible / 100) * 100);
  // Clamp del valor final a 0-100; el sin-clamp va al detalle.
  detalle["valorConBonusSinClamp"] = Math.round(scoreFinal * 100) / 100;
  const valor = Math.min(100, Math.max(0, Math.round(scoreFinal)));

  return {
    valor,
    raw: Math.round(scoreSectorial * 100) / 100,
    detalle,
    fuente: "sectores/scoring-sectorial.ts",
    disponible: true,
  };
}
