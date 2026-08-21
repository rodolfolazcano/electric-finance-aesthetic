// src/lib/politica-asignacion.ts
// Política de asignación estratégica por perfil inversor (CNV).
// DATA ESTÁTICA — no se genera por IA, no se recalcula automáticamente.
// Ajustar manualmente cuando cambie la estrategia de la firma/compliance.

export type PerfilInversor =
  | "Conservador"
  | "Moderado-Conservador"
  | "Moderado"
  | "Moderado-Agresivo"
  | "Agresivo"
  | "Muy Agresivo"
  | "Especulativo";

export interface PoliticaAsignacion {
  perfil: PerfilInversor;
  rangoRentaFija: { min: number; max: number };
  rangoRentaVariable: { min: number; max: number };
  rangoLiquidez: { min: number; max: number };
  durationMaxRF: number;
  estrategiaOptimizador:
    "min-variance" | "equal-weight" | "max-sharpe" | "inverse-vol" | "markowitz";
  maxActivosPorSleeve: number;
  toleranciaContexto: number;
}

export const POLITICA_ASIGNACION: PoliticaAsignacion[] = [
  {
    perfil: "Conservador",
    rangoRentaFija: { min: 70, max: 90 },
    rangoRentaVariable: { min: 5, max: 20 },
    rangoLiquidez: { min: 5, max: 15 },
    durationMaxRF: 2,
    estrategiaOptimizador: "min-variance",
    maxActivosPorSleeve: 6,
    toleranciaContexto: 0.3,
  },
  {
    perfil: "Moderado-Conservador",
    rangoRentaFija: { min: 55, max: 75 },
    rangoRentaVariable: { min: 15, max: 35 },
    rangoLiquidez: { min: 5, max: 15 },
    durationMaxRF: 4,
    estrategiaOptimizador: "min-variance",
    maxActivosPorSleeve: 8,
    toleranciaContexto: 0.4,
  },
  {
    perfil: "Moderado",
    rangoRentaFija: { min: 40, max: 60 },
    rangoRentaVariable: { min: 30, max: 50 },
    rangoLiquidez: { min: 5, max: 15 },
    durationMaxRF: 6,
    estrategiaOptimizador: "max-sharpe",
    maxActivosPorSleeve: 10,
    toleranciaContexto: 0.5,
  },
  {
    perfil: "Moderado-Agresivo",
    rangoRentaFija: { min: 25, max: 45 },
    rangoRentaVariable: { min: 45, max: 65 },
    rangoLiquidez: { min: 5, max: 15 },
    durationMaxRF: 8,
    estrategiaOptimizador: "max-sharpe",
    maxActivosPorSleeve: 12,
    toleranciaContexto: 0.6,
  },
  {
    perfil: "Agresivo",
    rangoRentaFija: { min: 10, max: 30 },
    rangoRentaVariable: { min: 60, max: 85 },
    rangoLiquidez: { min: 5, max: 10 },
    durationMaxRF: 10,
    estrategiaOptimizador: "markowitz",
    maxActivosPorSleeve: 14,
    toleranciaContexto: 0.7,
  },
  {
    perfil: "Muy Agresivo",
    rangoRentaFija: { min: 5, max: 20 },
    rangoRentaVariable: { min: 75, max: 90 },
    rangoLiquidez: { min: 0, max: 10 },
    durationMaxRF: 12,
    estrategiaOptimizador: "markowitz",
    maxActivosPorSleeve: 16,
    toleranciaContexto: 0.8,
  },
  {
    perfil: "Especulativo",
    rangoRentaFija: { min: 0, max: 10 },
    rangoRentaVariable: { min: 85, max: 100 },
    rangoLiquidez: { min: 0, max: 5 },
    durationMaxRF: 15,
    estrategiaOptimizador: "max-sharpe",
    maxActivosPorSleeve: 20,
    toleranciaContexto: 1.0,
  },
];

export function getPolitica(perfil: PerfilInversor): PoliticaAsignacion {
  const p = POLITICA_ASIGNACION.find((x) => x.perfil === perfil);
  if (!p) throw new Error(`Perfil no encontrado: ${perfil}`);
  return p;
}

// Tilt táctico: ajusta el peso objetivo dentro del rango según el humor de mercado
export function calcularPesosObjetivo(
  perfil: PerfilInversor,
  humorMercado: "risk-on" | "risk-off" | "mixto" | null,
): { rentaFija: number; rentaVariable: number; liquidez: number } {
  const p = getPolitica(perfil);

  const puntoMedioRF = (p.rangoRentaFija.min + p.rangoRentaFija.max) / 2;
  const puntoMedioRV = (p.rangoRentaVariable.min + p.rangoRentaVariable.max) / 2;
  const puntoMedioLiq = (p.rangoLiquidez.min + p.rangoLiquidez.max) / 2;

  let tiltRF = 0;
  let tiltRV = 0;
  let tiltLiq = 0;

  if (humorMercado === "risk-off") {
    // Flight to quality: +RF, +liquidez, -RV
    const factor = 1 * p.toleranciaContexto;
    const maxTiltRF = (p.rangoRentaFija.max - puntoMedioRF) * factor;
    const maxTiltLiq = (p.rangoLiquidez.max - puntoMedioLiq) * factor;
    const maxTiltRV = (puntoMedioRV - p.rangoRentaVariable.min) * factor;
    tiltRF = maxTiltRF;
    tiltLiq = maxTiltLiq;
    tiltRV = -maxTiltRV;
  } else if (humorMercado === "risk-on") {
    // Risk appetite: +RV, -RF
    const factor = 1 * p.toleranciaContexto;
    const maxTiltRV = (p.rangoRentaVariable.max - puntoMedioRV) * factor;
    const maxTiltRF = (puntoMedioRF - p.rangoRentaFija.min) * factor;
    tiltRV = maxTiltRV;
    tiltRF = -maxTiltRF;
  }

  const rf = clamp(puntoMedioRF + tiltRF, p.rangoRentaFija.min, p.rangoRentaFija.max);
  const rv = clamp(puntoMedioRV + tiltRV, p.rangoRentaVariable.min, p.rangoRentaVariable.max);
  const liq = clamp(puntoMedioLiq + tiltLiq, p.rangoLiquidez.min, p.rangoLiquidez.max);

  // Normalizar a 100%
  const total = rf + rv + liq;
  return {
    rentaFija: (rf / total) * 100,
    rentaVariable: (rv / total) * 100,
    liquidez: (liq / total) * 100,
  };
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}
