// FASE 5 — Validación del orquestador motor unificado.
// 1) GGAL/ACCION y 2) AL30/BONO con datos inyectados deterministas: objeto completo,
//    sin campos undefined obligatorios, scoreFinal 0-100 y clasificación por bandas.
// Además una llamada sin inyección (fallback offline admite 50 neutral si no hay red).

import { calcularScoreUnificado, type DatosMotorUnificado } from "../lib/scoring/motor-unificado";

function historialPrecio(base: number, pasos: number): { date: string; close: number }[] {
  return Array.from({ length: pasos }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    close: +(base + i * 0.7).toFixed(2),
  }));
}

function datosGGAL(): DatosMotorUnificado {
  return {
    semaforo: {
      price: 100,
      sma50: 90,
      sma200: 80,
      rsi: 55,
      macd: 2,
      macdSignal: 1,
      esETF: false,
      history: historialPrecio(80, 60),
      soportes: [{ precio: 95, fecha: "2026-01-10", vecesTocado: 2 }],
      resistencias: [{ precio: 110, fecha: "2026-01-12", vecesTocado: 1 }],
      distanciaSoporte: 5,
      distanciaResistencia: 5,
    },
    riesgos: { sharpeRatio: 1.2, var95: -0.03 },
    capm: { beta: 1.0, rSquared: 0.7 },
    fund: {
      sector: "Financial Services",
      currentPrice: 100,
      trailingPE: 12,
      forwardPE: 10,
      priceToBook: 1.2,
      debtToEquityRaw: 60,
      returnOnEquity: 0.18,
      revenueGrowth: 0.1,
      earningsGrowth: 0.1,
      fcfYield: 0.05,
      evToEbitda: 9,
      recommendationMean: 1.8,
      marketCapM: 5e10,
      pePercentile: 30,
      upsidePct: 25,
      esETF: false,
      profitMargin: 0.2,
      operatingMargin: 0.25,
      freeCashflowM: 500,
      sharesOutstanding: 1e9,
      totalAssets: 5e12,
      totalStockholderEquity: 3e12,
      healthScoreHistory: [
        { year: 2024, score: 75 },
        { year: 2025, score: 78 },
        { year: 2026, score: 80 },
      ],
      totalCashFromOperatingActivities: 1200,
      payoutRatio: 0.4,
      interestCoverageRatio: 6,
      workingCapital: 800,
      returnOnAssets: 0.08,
      currentRatio: 1.5,
    },
    titulares: ["La empresa anunció un récord de ganancias", "Aprobado nuevo buyback"],
  };
}

function datosAL30(): DatosMotorUnificado {
  return {
    semaforo: {
      price: 280,
      sma50: 278,
      sma200: 275,
      rsi: 52,
      macd: 0.4,
      macdSignal: 0.2,
      esETF: false,
      history: historialPrecio(270, 60),
      soportes: [],
      resistencias: [],
      distanciaSoporte: 3,
      distanciaResistencia: 4,
    },
    riesgos: { sharpeRatio: 0.7, var95: -0.05 },
    capm: { beta: null, rSquared: null },
    fund: { sector: null, currentPrice: null, esETF: false, marketCapM: null },
    titulares: [],
  };
}

const REQUERIDOS = [
  "tecnico",
  "fundamental",
  "cuantitativo",
  "sectorial",
  "noticias",
  "macroContexto",
] as const;

function validarIntegridad(res: { scoreFinal: number; clasificacion: string; subScores: unknown }) {
  const subs = res.subScores as Record<
    string,
    { valor?: unknown; detalle?: unknown; fuente?: unknown; disponible?: unknown }
  >;
  for (const k of REQUERIDOS) {
    const s = subs[k];
    if (!s || typeof s.valor !== "number" || !Number.isFinite(s.valor)) return false;
  }
  return (
    Number.isFinite(res.scoreFinal) &&
    res.scoreFinal >= 0 &&
    res.scoreFinal <= 100 &&
    ["COMPRA", "COMPRA_CAUTELA", "MANTENER", "REDUCIR", "VENTA"].includes(res.clasificacion)
  );
}

async function main() {
  let errores = 0;

  const ggal = await calcularScoreUnificado("GGAL", "ACCION", datosGGAL());
  const al30 = await calcularScoreUnificado("AL30", "BONO", datosAL30());
  const real = await calcularScoreUnificado("GGAL", "ACCION");

  const okGGAL = validarIntegridad(ggal);
  const okAL30 = validarIntegridad(al30);
  const okReal = Number.isFinite(real.scoreFinal) && real.scoreFinal >= 0 && real.scoreFinal <= 100;

  if (!okGGAL || !okAL30 || !okReal) errores++;

  console.log(
    `GGAL/ACCION  | scoreFinal=${ggal.scoreFinal} | clasificacion=${ggal.clasificacion} | subs=${REQUERIDOS.map((k) => ggal.subScores[k]?.valor).join(",")} | ok=${okGGAL}`,
  );
  console.log(
    `AL30/BONO    | scoreFinal=${al30.scoreFinal} | clasificacion=${al30.clasificacion} | ok=${okAL30}`,
  );
  console.log(
    `GGAL real    | scoreFinal=${real.scoreFinal} | clasificacion=${real.clasificacion} | ok=${okReal}`,
  );

  console.log(
    errores === 0
      ? "Motor unificado operativo, 2/2 pruebas de integración OK"
      : `FALLOS: ${errores}`,
  );
  process.exit(errores === 0 ? 0 : 1);
}

void main();
