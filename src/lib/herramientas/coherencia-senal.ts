// FASE 6 — Fuente compartida (leaf). resolverSenalCoherente es consumida por
// motor-unificado.ts (Fase 5, campo coherenciaSenal). Sin core que delegar.
// Coherencia entre Señal de Inversión, Score Fundamental y Consenso de Analistas
// Toda interpretación es determinística basada en los números ya calculados.

export interface SenalCoherente {
  plazo: string;
  accion: string;
  nota: string | null; // texto adicional si hay contradicción
}

/**
 * Resuelve la señal de inversión de forma determinística.
 * Única fuente de verdad para los 4 buckets de señal fundamental.
 * Si hay contradicción entre el consenso de analistas y el upside,
 * se agrega una "nota" que no altera la señal.
 */
export function resolverSenalCoherente(
  fundScore: number,
  _pricePercentile10y: number | null,
  revenueGrowth: number | null,
  upsidePct: number | null,
  recommendationMean: number | null,
  _pePercentile?: number | null,
): SenalCoherente {
  const growthPct = (revenueGrowth ?? 0) * 100;
  const upside = upsidePct ?? 0;

  let plazo = "";
  let accion = "";

  // Riquelme: Condición de Compra: Precio ≤ Valor Intrínseco * (1 - 50%)
  // Se ignora el precio de mercado a corto plazo (pricePct eliminado)
  // El upside >= 50% es el Margen de Seguridad del 50%
  if (fundScore >= 65 && growthPct > 0 && upside >= 50) {
    plazo = "Largo plazo";
    accion = "Acumular";
  } else if (fundScore >= 55 && upside > 8) {
    plazo = "Mediano plazo";
    accion = "Acumular gradualmente";
  } else if (fundScore >= 45) {
    plazo = "Mediano plazo";
    accion = "Mantener";
  } else {
    plazo = "Sin definicion clara";
    accion = "Cautela - monitorear metricas";
  }

  // Nota de coherencia: si los analistas dicen "compra" pero el upside es negativo
  let nota: string | null = null;
  if (upsidePct != null && upsidePct < 0 && recommendationMean != null && recommendationMean <= 2) {
    nota =
      "El consenso de analistas recomienda compra, pero el precio objetivo promedio ya fue superado por la cotizacion actual. Esto no es necesariamente un error — puede reflejar que las recomendaciones no se actualizaron a la misma velocidad que el precio — pero es una senal de que conviene revisar el research mas reciente antes de operar.";
  }

  return { plazo, accion, nota };
}
