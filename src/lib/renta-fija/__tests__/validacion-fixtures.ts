/**
 * validacion-fixtures.ts
 *
 * Script de validación contra fixtures del broker.
 * Corre el pipeline completo para cada fixture y reporta desviaciones.
 *
 * Uso: npx tsx src/lib/renta-fija/__tests__/validacion-fixtures.ts
 */

import { BONOS_DB, getFrecuenciaNumerica } from "../../bonos-data";
import type { YieldConvention } from "../../bonos-data";
import {
  interesesCorridos,
  yearFraction,
  xirrConvencion,
  paridad,
  precioTecnico,
  parseISO,
} from "../../renta-fija.functions";
import fixtures from "../__fixtures__/casos-referencia.json";

type FixtureEntry = {
  fechaSnapshot: string;
  precioIOL: number;
  escalaPrecioIOL: number | null;
  publicado: Record<string, number | null>;
  datosConfirmados: Record<string, unknown>;
};

interface ResultadoValidacion {
  ticker: string;
  pasaTIR: boolean;
  pasaParidad: boolean;
  pasaDuration: boolean;
  pasaMacaulay: boolean;
  pasaCurrentYield: boolean;
  desviaciones: string[];
  sospechas: string[];
}

function validarFixture(ticker: string, fixture: FixtureEntry): ResultadoValidacion {
  const { fechaSnapshot, precioIOL, escalaPrecioIOL, publicado } = fixture;
  const bono = BONOS_DB[ticker];
  const desviaciones: string[] = [];
  const sospechas: string[] = [];

  if (!bono) {
    return {
      ticker,
      pasaTIR: false,
      pasaParidad: false,
      pasaDuration: false,
      pasaMacaulay: false,
      pasaCurrentYield: false,
      desviaciones: [`Bono ${ticker} no encontrado en BONOS_DB`],
      sospechas: [],
    };
  }

  const factor = escalaPrecioIOL ?? 10;
  const precioClean = precioIOL / factor;
  const fechaLiq = parseISO(fechaSnapshot);
  const freq = getFrecuenciaNumerica(bono.frecuenciaPago ?? "Semiannual");
  const conv: YieldConvention = (bono.yieldConvention ?? "TRUE") as YieldConvention;
  const convDias = bono.convencionDias ?? "30/360";
  const cuponAnual = bono.cuponAnual ?? 0;

  const flujosFuturos = bono.flujosPorCada100VN.filter((f) => parseISO(f.fecha) > fechaLiq);
  const intCorridos = interesesCorridos(fechaLiq, parseISO(bono.vencimiento), cuponAnual, freq, convDias);
  const precioDirty = precioClean + intCorridos;
  const precioTecVal = precioTecnico(bono);

  const flujosXIRR: Array<{ yf: number; monto: number }> = [
    { yf: 0, monto: -precioDirty },
    ...flujosFuturos.map((f) => ({
      yf: yearFraction(fechaLiq, parseISO(f.fecha), convDias),
      monto: f.monto,
    })),
  ];

  const tirCalc = xirrConvencion(flujosXIRR, freq, conv);
  const paridadCalc = paridad(precioClean, precioTecVal);

  // Comparar métricas
  const TOL_TIR = 0.15;      // pp
  const TOL_PARIDAD = 0.5;   // pp
  const TOL_DURATION = 0.02;
  const TOL_CY = 0.1;         // pp

  let pasaTIR = true;
  let pasaParidad = true;
  let pasaDuration = true;
  let pasaMacaulay = true;
  let pasaCurrentYield = true;
  let hayError = false;

  if (publicado.tir != null) {
    const diff = Math.abs((tirCalc ?? 0) - publicado.tir) * 100;
    if (diff >= TOL_TIR) {
      pasaTIR = false;
      hayError = true;
      desviaciones.push(`TIR: calculada ${((tirCalc ?? 0) * 100).toFixed(2)}% vs publicada ${(publicado.tir * 100).toFixed(2)}% → diff ${diff.toFixed(3)}pp`);
    }
  }

  if (publicado.paridad != null) {
    const diff = Math.abs(paridadCalc - publicado.paridad);
    if (diff >= TOL_PARIDAD) {
      pasaParidad = false;
      hayError = true;
      desviaciones.push(`Paridad: calculada ${paridadCalc.toFixed(4)} vs publicada ${publicado.paridad} → diff ${diff.toFixed(4)}`);
    }
  }

  if (publicado.currentYield != null && precioClean > 0) {
    const cyCalc = cuponAnual / precioClean;
    const diff = Math.abs(cyCalc - publicado.currentYield) * 100;
    if (diff >= TOL_CY) {
      pasaCurrentYield = false;
      hayError = true;
      desviaciones.push(`Current Yield: calculada ${(cyCalc * 100).toFixed(2)}% vs publicada ${(publicado.currentYield * 100).toFixed(2)}% → diff ${diff.toFixed(3)}pp`);
    }
  }

  // Diagnosticar paso sospechoso
  if (hayError) {
    if (!pasaTIR) sospechas.push("Paso 7 (XIRR) o Paso 1 (escala de precio)");
    if (!pasaParidad) sospechas.push("Paso 6 (precio técnico / valor residual)");
    if (!pasaDuration) sospechas.push("Paso 8 (day count convention)");
    if (sospechas.length === 0) sospechas.push("Revisar flujos (Paso 2) o intereses corridos (Paso 5)");
  }

  return {
    ticker,
    pasaTIR,
    pasaParidad,
    pasaDuration,
    pasaMacaulay,
    pasaCurrentYield,
    desviaciones,
    sospechas,
  };
}

function main() {
  console.log("=== Validación contra fixtures del broker ===\n");

  const totales = { pasan: 0, fallan: 0, total: 0 };

  for (const [ticker, raw] of Object.entries(fixtures)) {
    const fixture = raw as FixtureEntry;
    const resultado = validarFixture(ticker, fixture);
    totales.total++;

    console.log(`[${resultado.pasaTIR && resultado.pasaParidad && resultado.pasaCurrentYield ? "✓" : "✗"}] ${ticker}`);

    if (resultado.desviaciones.length > 0) {
      totales.fallan++;
      resultado.desviaciones.forEach((d) => console.log(`     Desviación: ${d}`));
      resultado.sospechas.forEach((s) => console.log(`     → Sospechar de: ${s}`));
    } else {
      totales.pasan++;
      console.log("     Todas las métricas dentro de tolerancia.");
    }
    console.log("");
  }

  console.log(`=== Resumen: ${totales.pasan}/${totales.total} pasan, ${totales.fallan} fallan ===`);
}

main();
