// @ts-nocheck
import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";

export type FuerzaSenal = "positiva" | "mixta" | "negativa" | "no_disponible";

export interface SenalCostos {
  fuerza: FuerzaSenal;
  detalle: string;
}

export interface CostosDeCambioResult {
  symbol: string;
  resilienciaMargen: SenalCostos;
  estabilidadIngresos: SenalCostos;
  clasificacionSectorEstatica: {
    nivel: "alto" | "medio" | "bajo" | "no_disponible";
    sector: string;
  };
  conclusion: "Altos" | "Moderados" | "Bajos" | "No concluyente";
  periodosUsados: number;
  advertenciaMetodologica: string;
}

const SWITCHING_COSTS_ESTIMADO_POR_SECTOR: Record<string, "alto" | "medio" | "bajo"> = {
  Tecnología: "alto",
  "Servicios de comunicación": "alto",
  "Cuidado de la salud": "alto",
  "Servicios financieros": "alto",
  "Acciones industriales": "medio",
  Utilidades: "medio",
  "Defensiva del Consumidor": "medio",
  "Bienes raíces": "medio",
  Energía: "bajo",
  "Materiales Básicos": "bajo",
  "Consumo cíclico": "bajo",
};

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function ordenarPeriodos(historico: PeriodoHistoricoRow[]): PeriodoHistoricoRow[] {
  return (historico ?? [])
    .filter((p) => p.endDate)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}

export function calcularResilienciaMargen(periodos: PeriodoHistoricoRow[]): SenalCostos {
  const ordenados = ordenarPeriodos(periodos);
  const periodosConGrowth = ordenados.filter((p) => p.revenueChgPct != null);

  if (periodosConGrowth.length < 3) {
    return {
      fuerza: "no_disponible",
      detalle: `Se requieren al menos 3 períodos con revenueChgPct disponible (hay ${periodosConGrowth.length}).`,
    };
  }

  const decelerationPeriods: { idx: number }[] = [];
  for (let i = 1; i < periodosConGrowth.length; i++) {
    const prevGrowth = periodosConGrowth[i - 1].revenueChgPct!;
    const currGrowth = periodosConGrowth[i].revenueChgPct!;
    if (currGrowth < prevGrowth * 0.98) {
      decelerationPeriods.push({ idx: i });
    }
  }

  if (decelerationPeriods.length === 0) {
    return {
      fuerza: "no_disponible",
      detalle: `Sin períodos de desaceleración de ingresos para evaluar resiliencia de margen en la ventana disponible (${periodosConGrowth.length} períodos con crecimiento estable o creciente).`,
    };
  }

  let marginResilient = 0;
  let marginCompressed = 0;
  for (const dp of decelerationPeriods) {
    const period = periodosConGrowth[dp.idx];
    const margin = period.grossMargin ?? period.netMargin;
    const prevPeriod = periodosConGrowth[dp.idx - 1];
    const prevMargin = prevPeriod.grossMargin ?? prevPeriod.netMargin;
    if (margin == null || prevMargin == null) continue;
    const marginChange = margin - prevMargin;
    if (marginChange >= -0.005) {
      marginResilient++;
    } else {
      marginCompressed++;
    }
  }

  const totalEvaluated = marginResilient + marginCompressed;
  if (totalEvaluated === 0) {
    return {
      fuerza: "no_disponible",
      detalle:
        "No hay datos de margen (grossMargin o netMargin) en los períodos de desaceleración para evaluar resiliencia.",
    };
  }

  const pctResilient = marginResilient / totalEvaluated;
  if (pctResilient >= 0.66) {
    return {
      fuerza: "positiva",
      detalle: `En ${marginResilient}/${totalEvaluated} períodos de desaceleración de ingresos el margen se sostuvo o mejoró — sugiere poder de fijación de precio y switching costs.`,
    };
  } else if (pctResilient >= 0.33) {
    return {
      fuerza: "mixta",
      detalle: `Comportamiento mixto en ${totalEvaluated} períodos de desaceleración: margen resiliente en ${marginResilient} y comprimido en ${marginCompressed}.`,
    };
  }
  return {
    fuerza: "negativa",
    detalle: `En ${marginCompressed}/${totalEvaluated} períodos de desaceleración el margen se comprimió — sugiere que la empresa compite por precio, indicio de switching costs bajos.`,
  };
}

export function calcularEstabilidadIngresos(periodos: PeriodoHistoricoRow[]): SenalCostos {
  const ordenados = ordenarPeriodos(periodos);
  const growthValues = ordenados
    .filter((p) => p.revenueChgPct != null)
    .map((p) => p.revenueChgPct!);

  if (growthValues.length < 3) {
    return {
      fuerza: "no_disponible",
      detalle: `Se requieren al menos 3 períodos (hay ${growthValues.length}).`,
    };
  }

  const avgGrowth = mean(growthValues);
  const stdGrowth = stdDev(growthValues);
  const cv = avgGrowth !== 0 ? Math.abs(stdGrowth / avgGrowth) : stdGrowth > 0 ? 99 : 0;

  if (cv < 0.5) {
    return {
      fuerza: "positiva",
      detalle: `Crecimiento de ingresos con baja dispersión (CV=${cv.toFixed(2)} sobre ${growthValues.length} períodos) — sugiere ingresos recurrentes o contractuales.`,
    };
  } else if (cv < 1.0) {
    return {
      fuerza: "mixta",
      detalle: `Crecimiento de ingresos con dispersión moderada (CV=${cv.toFixed(2)}) — patrón mixto de recurrencia.`,
    };
  }
  return {
    fuerza: "negativa",
    detalle: `Crecimiento de ingresos con alta dispersión (CV=${cv.toFixed(2)}) — sugiere dependencia de ventas puntuales o proyectos discretos.`,
  };
}

export function calcularPredictibilidadIngresos(
  result: FundamentalAFResult,
  historico: PeriodoHistoricoRow[] | null,
): { fuerza: FuerzaSenal; detalle: string; interpretacion: string } {
  if (result.esETF)
    return { fuerza: "no_disponible", detalle: "No aplica para ETFs.", interpretacion: "" };
  const base = calcularEstabilidadIngresos(historico ?? []);
  const interpretacion =
    base.fuerza === "positiva"
      ? "Ingresos con baja volatilidad histórica — mayor predictibilidad para proyecciones"
      : base.fuerza === "negativa"
        ? "Ingresos con alta volatilidad histórica — menor predictibilidad, revisar estacionalidad"
        : "Datos insuficientes para evaluar predictibilidad";
  return { ...base, interpretacion };
}

export function calcularCostosDeCambio(
  result: FundamentalAFResult,
  historico: PeriodoHistoricoRow[] | null,
): CostosDeCambioResult {
  if (result.esETF) {
    return {
      symbol: result.symbol,
      resilienciaMargen: { fuerza: "no_disponible", detalle: "No aplica para ETFs." },
      estabilidadIngresos: { fuerza: "no_disponible", detalle: "No aplica para ETFs." },
      clasificacionSectorEstatica: { nivel: "no_disponible", sector: result.sector ?? "—" },
      conclusion: "No concluyente",
      periodosUsados: 0,
      advertenciaMetodologica: "No aplica para ETFs.",
    };
  }

  const periodos = ordenarPeriodos(historico ?? []);
  const resilienciaMargen = calcularResilienciaMargen(periodos);
  // Estabilidad de ingresos eliminada aquí porque se muestra como "Predictibilidad de ingresos" con interpretación adicional
  const estabilidadIngresos = {
    fuerza: "no_disponible" as const,
    detalle: "Integrado en Predictibilidad de ingresos",
  };

  const sectorKey = result.sector ?? "";
  const nivelSector = SWITCHING_COSTS_ESTIMADO_POR_SECTOR[sectorKey] ?? "no_disponible";
  const clasificacionSectorEstatica = {
    nivel: nivelSector as "alto" | "medio" | "bajo" | "no_disponible",
    sector: sectorKey || "—",
  };

  const ambasNoDisponible =
    resilienciaMargen.fuerza === "no_disponible" && estabilidadIngresos.fuerza === "no_disponible";
  let conclusion: CostosDeCambioResult["conclusion"];
  if (ambasNoDisponible) {
    conclusion = "No concluyente";
  } else {
    const fuerzas: FuerzaSenal[] = [resilienciaMargen.fuerza, estabilidadIngresos.fuerza];
    const puntajes: number[] = [];
    for (const f of fuerzas) {
      if (f !== "no_disponible") puntajes.push(f === "positiva" ? 1 : f === "mixta" ? 0 : -1);
    }
    const suma = puntajes.reduce((s, v) => s + v, 0);
    conclusion =
      puntajes.length === 2 && suma >= 1
        ? "Altos"
        : puntajes.length === 2 && suma <= -1
          ? "Bajos"
          : "Moderados";
  }

  return {
    symbol: result.symbol,
    resilienciaMargen,
    estabilidadIngresos,
    clasificacionSectorEstatica,
    conclusion,
    periodosUsados: periodos.length,
    advertenciaMetodologica:
      "Estimación basada en proxies financieros indirectos (resiliencia de margen ante desaceleraciones y estabilidad del crecimiento). No mide contratos, renovación ni churn real. La clasificación por sector es una referencia estática general, no un cálculo sobre datos de la empresa.",
  };
}
