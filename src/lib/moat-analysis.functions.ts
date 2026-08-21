// @ts-nocheck
import type { FundamentalAFResult } from "@/lib/herramientas/fundamental-af.functions";
import type { PeriodoHistoricoRow } from "@/lib/herramientas/fundamental-af.functions";

export interface VentajaCompetitiva {
  score: number;
  maxPuntosPosibles: number; // Para renormalización: X/90 en lugar de X/100 cuando FCF no disponible
  clasificacion:
    | "Moat Fuerte"
    | "Moat Moderado"
    | "Sin Moat Claro"
    | "Datos Insuficientes"
    | "Requiere revision manual";
  desglose: { criterio: string; puntos: number; maxPuntos: number; detalle: string }[];
  aniosAnalizados: number;
  componentesExcluidos: string[]; // Lista de componentes excluidos por falta de datos
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

export function calcularVentajaCompetitiva(
  result: FundamentalAFResult,
  periodos: PeriodoHistoricoRow[],
): VentajaCompetitiva {
  const desglose: { criterio: string; puntos: number; maxPuntos: number; detalle: string }[] = [];

  //  1. Profitability Consistency (30 pts) 
  // Usa netMargin histórico (disponible en incomeStatementHistory) + ROE actual como validación cruzada
  const profitPeriods = periodos.filter((p) => p.netMargin != null);
  const profitValues = profitPeriods.map((p) => p.netMargin!);
  const aniosAnalizados = profitPeriods.length;
  const avgProfit = aniosAnalizados > 0 ? mean(profitValues) : 0;
  const stdProfit = aniosAnalizados >= 2 ? stdDev(profitValues) : 999;
  const currentRoe = result.returnOnEquity;

  let profitPts = 0;
  let profitDetalle = "";
  if (aniosAnalizados < 3) {
    profitDetalle = `Solo ${aniosAnalizados} año(s) con datos de margen neto — se requieren mínimo 3`;
  } else if (avgProfit >= 0.15 && stdProfit < 0.05 && currentRoe != null && currentRoe >= 0.15) {
    profitPts = 30;
    profitDetalle = `Margen neto promedio ${(avgProfit * 100).toFixed(1)}% con baja variación (σ=${(stdProfit * 100).toFixed(1)}pp) y ROE actual de ${(currentRoe * 100).toFixed(1)}% — rentabilidad alta y consistente`;
  } else if (avgProfit >= 0.1 && stdProfit < 0.05) {
    profitPts = 20;
    profitDetalle = `Margen neto promedio ${(avgProfit * 100).toFixed(1)}% con baja variación (σ=${(stdProfit * 100).toFixed(1)}pp) — rentabilidad moderada pero estable`;
  } else if (avgProfit >= 0.15) {
    profitPts = 18;
    profitDetalle = `Margen neto promedio ${(avgProfit * 100).toFixed(1)}% pero con variación alta (σ=${(stdProfit * 100).toFixed(1)}pp) — rentabilidad alta pero inconsistente`;
  } else if (profitValues.every((m) => m > 0)) {
    profitPts = 10;
    profitDetalle = `Margen neto promedio ${(avgProfit * 100).toFixed(1)}% — margen positivo en todos los años pero sin alcanzar umbrales de ventaja`;
  } else {
    profitDetalle = `Margen neto promedio ${(avgProfit * 100).toFixed(1)}% — rentabilidad insuficiente o años con pérdidas`;
  }
  desglose.push({
    criterio: "Rentabilidad (margen neto + ROE)",
    puntos: profitPts,
    maxPuntos: 30,
    detalle: profitDetalle,
  });

  //  Early return si < 3 años 
  if (aniosAnalizados < 3) {
    const detalleAnios = `Se analizaron ${aniosAnalizados} año(s) de datos financieros. Se requieren al menos 3 ejercicios completos con income statement disponibles en Yahoo Finance para calcular el moat.`;
    return {
      score: 0,
      clasificacion: "Datos Insuficientes",
      desglose: [{ criterio: "Años analizados", puntos: 0, maxPuntos: 100, detalle: detalleAnios }],
      aniosAnalizados,
      maxPuntosPosibles: 100,
      componentesExcluidos: [
        "Rentabilidad (margen neto + ROE)",
        "Estabilidad Margen Neto",
        "Intensidad de Deuda",
        "Crecimiento Ingresos",
        "FCF Consistency",
      ],
    };
  }

  //  2. Net Margin Stability (25 pts) 
  let marginPts = 0;
  let marginDetalle = "";
  if (profitValues.length >= 2) {
    const allAbove15 = profitValues.every((m) => m >= 0.15);
    let interanualDrop = false;
    for (let i = 1; i < profitValues.length; i++) {
      if (profitValues[i] < profitValues[i - 1] * 0.8) {
        interanualDrop = true;
        break;
      }
    }
    const anyNegative = profitValues.some((m) => m < 0);

    if (anyNegative) {
      marginDetalle =
        "Margen neto negativo en al menos un ejercicio — ventaja competitiva no confirmada";
    } else if (allAbove15 && !interanualDrop) {
      marginPts = 25;
      marginDetalle =
        "Margen neto ≥15% en todos los años sin caídas interanuales >20% — estabilidad de pricing power";
    } else {
      marginPts = 12;
      marginDetalle =
        "Margen neto positivo en todos los años pero con volatilidad — poder de fijación de precio presente pero no óptimo";
    }
  } else {
    marginDetalle = "Datos insuficientes de margen neto histórico";
  }
  desglose.push({
    criterio: "Estabilidad Margen Neto",
    puntos: marginPts,
    maxPuntos: 25,
    detalle: marginDetalle,
  });

  //  3. Debt Intensity (20 pts) 
  const de = result.debtToEquityRaw;
  let dePts = 0;
  let deDetalle = "";
  if (de == null) {
    deDetalle = "Datos de deuda no disponibles";
  } else if (de < 50) {
    dePts = 20;
    deDetalle = `D/E de ${de.toFixed(0)}% — deuda baja, estructura financiera conservadora`;
  } else if (de <= 100) {
    dePts = 10;
    deDetalle = `D/E de ${de.toFixed(0)}% — nivel de deuda moderado`;
  } else {
    deDetalle = `D/E de ${de.toFixed(0)}% — nivel de deuda elevado, riesgo financiero`;
  }
  desglose.push({
    criterio: "Intensidad de Deuda",
    puntos: dePts,
    maxPuntos: 20,
    detalle: deDetalle,
  });

  //  4. Revenue Growth Consistency (15 pts) 
  const growthPeriods = periodos.filter((p) => p.revenueChgPct != null);
  const growthValues = growthPeriods.map((p) => p.revenueChgPct!);
  let growthPts = 0;
  let growthDetalle = "";
  if (growthValues.length >= 2) {
    const allPositive = growthValues.every((g) => g > 0);
    const positiveCount = growthValues.filter((g) => g > 0).length;
    const pctPositive = positiveCount / growthValues.length;

    if (allPositive) {
      growthPts = 15;
      growthDetalle = `Crecimiento de ingresos positivo en todos los años disponibles — demanda sostenida`;
    } else if (pctPositive > 0.6) {
      growthPts = 8;
      growthDetalle = `Crecimiento positivo en ${positiveCount}/${growthValues.length} años — mayormente consistente`;
    } else {
      growthDetalle = "Crecimiento de ingresos errático o negativo en la mayoría de los años";
    }
  } else {
    growthDetalle = "Datos insuficientes de crecimiento histórico";
  }
  desglose.push({
    criterio: "Crecimiento Ingresos",
    puntos: growthPts,
    maxPuntos: 15,
    detalle: growthDetalle,
  });

  //  5. FCF Consistency (10 pts) 
  const fcfPeriods = periodos.filter((p) => p.fcf != null);
  const fcfValues = fcfPeriods.map((p) => p.fcf!);

  // Log para diagnóstico: cuántos años de FCF llegan realmente
  console.log(
    `[Moat Analysis] ${aniosAnalizados} años de datos históricos, ${fcfValues.length} con FCF disponible`,
  );

  let fcfPts = 0;
  let fcfDetalle = "";
  const fcfDisponible = fcfValues.length >= 2; // FCF solo se evalúa si hay ≥2 años de datos

  if (fcfDisponible) {
    const allPositive = fcfValues.every((v) => v > 0);
    const avgFcf = mean(fcfValues);

    if (allPositive) {
      fcfPts = 10;
      fcfDetalle = `FCF positivo en todos los años (${fcfValues.length} disponibles) — generación de caja consistente`;
    } else if (avgFcf > 0) {
      fcfPts = 5;
      fcfDetalle = `FCF positivo en promedio pero con años negativos (${fcfValues.length} años) — generación de caja volátil`;
    } else {
      fcfDetalle = `FCF promedio negativo (${fcfValues.length} años) — la empresa no genera caja suficiente para sostenerse sin financiamiento externo`;
    }
  } else {
    fcfDetalle = `Datos insuficientes de flujo de caja libre histórico (solo ${fcfValues.length} año(s) con dato). Yahoo Finance provee hasta 4 años de estados financieros en quoteSummary - se requiere fuente histórica extendida para análisis más profundo. Componente excluido del cálculo del score total.`;
  }
  desglose.push({
    criterio: "FCF Consistency",
    puntos: fcfPts,
    maxPuntos: 10,
    detalle: fcfDetalle,
  });

  //  Total Score (excluyendo componentes sin datos suficientes) 
  const componentesExcluidos: string[] = [];

  // Verificar qué componentes tienen datos suficientes
  const rentabilidadDisponible = aniosAnalizados >= 3;
  const estabilidadMarginDisponible = profitValues.length >= 2;
  const intensidadDeudaDisponible = de != null;
  const crecimientoIngresosDisponible = growthValues.length >= 2;

  // Marcar componentes excluidos
  if (!rentabilidadDisponible) componentesExcluidos.push("Rentabilidad");
  if (!estabilidadMarginDisponible) componentesExcluidos.push("Estabilidad Margen Neto");
  if (!intensidadDeudaDisponible) componentesExcluidos.push("Intensidad de Deuda");
  if (!crecimientoIngresosDisponible) componentesExcluidos.push("Crecimiento Ingresos");
  if (!fcfDisponible) componentesExcluidos.push("FCF Consistency");

  // Calcular maxPuntosPosibles excluyendo componentes sin datos
  const maxPuntosPosibles = desglose.reduce((s, d) => {
    const criterio = d.criterio;
    if (criterio === "Rentabilidad (margen neto + ROE)" && !rentabilidadDisponible) return s;
    if (criterio === "Estabilidad Margen Neto" && !estabilidadMarginDisponible) return s;
    if (criterio === "Intensidad de Deuda" && !intensidadDeudaDisponible) return s;
    if (criterio === "Crecimiento Ingresos" && !crecimientoIngresosDisponible) return s;
    if (criterio === "FCF Consistency" && !fcfDisponible) return s;
    return s + d.maxPuntos;
  }, 0);

  // Calcular score normalizado sobre componentes disponibles
  const totalScoreRaw = desglose.reduce((s, d) => s + d.puntos, 0);
  const totalScore =
    maxPuntosPosibles > 0 ? Math.round((totalScoreRaw / maxPuntosPosibles) * 100) / 100 : 0;

  // Si FCF fue excluido por datos insuficientes y el resto del score es alto, pedir revisión manual
  const fcfInsuficiente = !fcfDisponible;
  const restoScore = fcfInsuficiente ? totalScoreRaw : 0;
  const restoMax = fcfInsuficiente ? maxPuntosPosibles : 0;
  const restoPct = restoMax > 0 ? (restoScore / restoMax) * 100 : 0;

  let clasificacion: VentajaCompetitiva["clasificacion"];
  if (fcfInsuficiente && restoPct >= 70) {
    clasificacion = "Requiere revision manual";
  } else if (totalScore >= 70) clasificacion = "Moat Fuerte";
  else if (totalScore >= 40) clasificacion = "Moat Moderado";
  else clasificacion = "Sin Moat Claro";

  return {
    score: totalScore,
    maxPuntosPosibles,
    clasificacion,
    desglose,
    aniosAnalizados,
    componentesExcluidos,
  };
}
