// ─── GWR Validation — tabla de claims vs realidad ───────────────
// Conecta los claims del research semanal GWR#63 con datos reales.

import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "../cache";
import type { GwrSummary, GwrClaim, GwrVeredicto } from "./types";
import type { MacroSnapshot } from "./types";

// ─── Claims maestros GWR#63 ─────────────────────────────────────

// En producción esto vendría de una DB o JSON persistido.
// Por ahora usamos claims hardcodeados que reflejan el research semanal.
const GWR_CLAIMS_BASE: Omit<GwrClaim, "veredicto" | "fechaValidacion" | "evidencia" | "datosRespaldo">[] = [
  {
    id: "GWR#63-1",
    claim: "La Fed mantendrá tasas sin cambios en la reunión de julio",
    fechaClaim: "2026-07-14",
    fuente: "GWR#63 — Research Semanal",
  },
  {
    id: "GWR#63-2",
    claim: "El Riesgo País argentino seguirá comprimiéndose hacia 400pts",
    fechaClaim: "2026-07-14",
    fuente: "GWR#63 — Research Semanal",
  },
  {
    id: "GWR#63-3",
    claim: "El S&P 500 se mantendrá en rango lateral (5400-5600) sin ruptura",
    fechaClaim: "2026-07-14",
    fuente: "GWR#63 — Research Semanal",
  },
  {
    id: "GWR#63-4",
    claim: "El petróleo (WTI) operará entre 75-85 USD/barril",
    fechaClaim: "2026-07-14",
    fuente: "GWR#63 — Research Semanal",
  },
  {
    id: "GWR#63-5",
    claim: "El oro se mantendrá sobre USD 2300/oz",
    fechaClaim: "2026-07-14",
    fuente: "GWR#63 — Research Semanal",
  },
  {
    id: "GWR#63-6",
    claim: "La inflación núcleo PCE continuará desacelerándose hacia 2.5%",
    fechaClaim: "2026-07-14",
    fuente: "GWR#63 — Research Semanal",
  },
  {
    id: "GWR#63-7",
    claim: "El DXY se mantendrá débil por debajo de 101",
    fechaClaim: "2026-07-14",
    fuente: "GWR#63 — Research Semanal",
  },
  {
    id: "GWR#63-8",
    claim: "El MERVAL superará los 2.100.000 puntos",
    fechaClaim: "2026-07-14",
    fuente: "GWR#63 — Research Semanal",
  },
];

// ─── Evaluación de claims contra datos reales ────────────────────

function evaluarClaim(
  claim: Omit<GwrClaim, "veredicto" | "fechaValidacion" | "evidencia" | "datosRespaldo">,
  macro: MacroSnapshot,
): GwrClaim {
  const hoy = new Date().toISOString().slice(0, 10);
  // Default: pendiente (el claim es sobre el futuro)
  let veredicto: GwrVeredicto = "pendiente";
  let evidencia = "Claim publicado recientemente — evaluación pendiente.";
  let datosRespaldo: GwrClaim["datosRespaldo"] = undefined;

  switch (claim.id) {
    case "GWR#63-1": {
      // Fed mantiene tasas — chequeamos T-Bill yield como proxy
      if (macro.irx.valor != null && macro.sgov.valor != null) {
        const tbillEstable =
          macro.irx.variacion1mPct != null && Math.abs(macro.irx.variacion1mPct) < 0.5;
        veredicto = tbillEstable ? "acertado" : "fallido";
        evidencia = tbillEstable
          ? `T-Bill 13W yield en ${macro.irx.valor.toFixed(2)}% — estable respecto al mes anterior (${macro.irx.variacion1mPct?.toFixed(2)}%). Sin señales de cambio de tasa.`
          : `T-Bill 13W yield se movió ${macro.irx.variacion1mPct?.toFixed(2)}% en el mes — inconsistente con la proyección de tasas estables.`;
        datosRespaldo = { metric: "T-Bill 13W Yield (^IRX)", valorActual: macro.irx.valor, valorAnterior: macro.irx.valor != null && macro.irx.variacion1mPct != null ? macro.irx.valor / (1 + macro.irx.variacion1mPct / 100) : macro.irx.valor ?? 0 };
      }
      break;
    }
    case "GWR#63-2": {
      // Riesgo País ← no está en MacroSnapshot, lo dejamos pendiente
      veredicto = "pendiente";
      evidencia = "Requiere dato de Riesgo País desde API ArgentinaDatos — pendiente de integración.";
      break;
    }
    case "GWR#63-3": {
      // S&P 500 lateral — usamos DXY como proxy de contexto
      if (macro.dxy.valor != null) {
        veredicto = "pendiente";
        evidencia = `DXY en ${macro.dxy.valor.toFixed(2)} — monitorear ruptura del rango 5400-5600 en SPX.`;
      }
      break;
    }
    case "GWR#63-4": {
      // Petróleo 75-85
      if (macro.oil.valor != null) {
        const dentroRango = macro.oil.valor >= 75 && macro.oil.valor <= 85;
        veredicto = dentroRango ? "acertado" : "fallido";
        evidencia = dentroRango
          ? `WTI en USD ${macro.oil.valor.toFixed(2)} — dentro del rango proyectado 75-85.`
          : `WTI en USD ${macro.oil.valor.toFixed(2)} — fuera del rango proyectado 75-85.`;
        datosRespaldo = { metric: "Petróleo WTI (CL=F)", valorActual: macro.oil.valor, valorAnterior: macro.oil.valor != null && macro.oil.variacion1mPct != null ? macro.oil.valor / (1 + macro.oil.variacion1mPct / 100) : macro.oil.valor ?? 0 };
      }
      break;
    }
    case "GWR#63-5": {
      // Oro >2300
      if (macro.gold.valor != null) {
        veredicto = macro.gold.valor >= 2300 ? "acertado" : "fallido";
        evidencia = macro.gold.valor >= 2300
          ? `Oro en USD ${macro.gold.valor.toFixed(2)} — se mantiene sobre los 2300.`
          : `Oro en USD ${macro.gold.valor.toFixed(2)} — perforó el soporte de 2300.`;
        datosRespaldo = { metric: "Oro (GC=F)", valorActual: macro.gold.valor, valorAnterior: macro.gold.valor != null && macro.gold.variacion1mPct != null ? macro.gold.valor / (1 + macro.gold.variacion1mPct / 100) : macro.gold.valor ?? 0 };
      }
      break;
    }
    case "GWR#63-6": {
      // Inflación PCE — no está en MacroSnapshot directamente
      veredicto = "pendiente";
      evidencia = "Requiere dato de inflación PCE (Bureau of Economic Analysis) — pendiente de integración.";
      break;
    }
    case "GWR#63-7": {
      // DXY < 101
      if (macro.dxy.valor != null) {
        veredicto = macro.dxy.valor < 101 ? "acertado" : "fallido";
        evidencia = macro.dxy.valor < 101
          ? `DXY en ${macro.dxy.valor.toFixed(2)} — se mantiene débil por debajo de 101.`
          : `DXY en ${macro.dxy.valor.toFixed(2)} — superó el nivel de 101.`;
        datosRespaldo = { metric: "Dólar Index (DXY)", valorActual: macro.dxy.valor, valorAnterior: macro.dxy.valor != null && macro.dxy.variacion1mPct != null ? macro.dxy.valor / (1 + macro.dxy.variacion1mPct / 100) : macro.dxy.valor ?? 0 };
      }
      break;
    }
    case "GWR#63-8": {
      // MERVAL — no está en MacroSnapshot
      veredicto = "pendiente";
      evidencia = "Requiere cotización del MERVAL — pendiente de integración.";
      break;
    }
    default:
      veredicto = "indeterminado";
      evidencia = "Claim no reconocido en el validador.";
  }

  return {
    ...claim,
    veredicto,
    fechaValidacion: hoy,
    evidencia,
    datosRespaldo,
  };
}

// ─── Server function ─────────────────────────────────────────────

export const buildGwrValidation = createServerFn({ method: "GET" })
  .handler(async (): Promise<GwrSummary> => {
    const CACHE_KEY = "phase1-gwr-validation-v1";
    const cached = getCached<GwrSummary>(CACHE_KEY, 5 * 60 * 1000);
    if (cached) return cached;

    // Necesitamos el macro snapshot para evaluar los claims
    // Import dinámico para evitar circular dependency
    const { fetchMacroSnapshot } = await import("./macro-snapshot.functions");
    const macro = await fetchMacroSnapshot();

    const claims = GWR_CLAIMS_BASE.map((c) => evaluarClaim(c, macro));

    const total = claims.length;
    const acertados = claims.filter((c) => c.veredicto === "acertado").length;
    const fallidos = claims.filter((c) => c.veredicto === "fallido").length;
    const pendientes = claims.filter((c) => c.veredicto === "pendiente").length;
    const resueltos = acertados + fallidos;
    const tasaAcierto = resueltos > 0 ? Math.round((acertados / resueltos) * 100) : 0;

    const result: GwrSummary = {
      total, acertados, fallidos, pendientes,
      tasaAcierto,
      claims,
      ultimaActualizacion: new Date().toISOString(),
    };

    setCache(CACHE_KEY, result);
    return result;
  });
