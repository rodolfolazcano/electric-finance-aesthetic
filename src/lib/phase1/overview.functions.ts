// ─── Phase 1 Overview — wrapper del Murphy Engine ───────────────
// NO duplica lógica de régimen. REUTILIZA getIntermarketAnalysis().

import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "../cache";
import { getIntermarketAnalysis } from "../intermarket-analysis.functions";
import { fetchMacroSnapshot } from "./macro-snapshot.functions";
import { buildGwrValidation } from "./gwr-validation.functions";
import type { Phase1Data, Phase1Regime } from "./types";

// ─── Mapper: LecturaIntermarket → Phase1Regime ──────────────────

function mapRegime(
  lectura: import("../intermarket-engine").LecturaIntermarket | undefined,
): Phase1Regime {
  if (!lectura) {
    return {
      classification: "mixed",
      inflationPressureScore: 50,
      confianza: 0,
      stage: 2,
      stageLabel: "Sin datos",
      stageSectores: [],
      description: "Murphy Engine sin datos disponibles.",
    };
  }

  // Score 0–100 de presión inflacionaria
  // indicePresion va de -1 a 1 → lo mapeamos a 0–100
  const rawScore = (lectura.indicePresion ?? 0) * 100;
  const inflationPressureScore = Math.round(Math.max(0, Math.min(100, (rawScore + 100) / 2)));

  // Extraer stage del engine si está disponible
  let stage = 2;
  let stageLabel = "Middle Expansion";
  let stageSectores: string[] = ["Industrials"];

  return {
    classification: lectura.regimen ?? "mixed",
    inflationPressureScore,
    confianza: lectura.confianza ?? 0,
    stage,
    stageLabel,
    stageSectores,
    description: lectura.alertaActiva
      ? `${lectura.regimen} — ${lectura.alertaActiva}`
      : `Régimen ${lectura.regimen} detectado. ${lectura.recomendacionSesgo === "cauteloso" ? "Sesgo cauteloso." : lectura.recomendacionSesgo === "favorable" ? "Sesgo favorable." : "Sesgo neutral."}`,
  };
}

// ─── Server function principal ───────────────────────────────────

export const getPhase1Overview = createServerFn({ method: "GET" }).handler(
  async (): Promise<Phase1Data> => {
    const CACHE_KEY = "phase1-overview-v1";
    const cached = getCached<Phase1Data>(CACHE_KEY, 5 * 60 * 1000);
    if (cached) return cached;

    // 1. Macro snapshot (nuevo, liviano)
    const macro = await fetchMacroSnapshot();

    // 2. Régimen desde el Murphy Engine existente (NO duplicar)
    let regime: Phase1Regime;
    try {
      const murphyAnalysis = await getIntermarketAnalysis();
      regime = mapRegime(murphyAnalysis?.lecturaIntermarket);
      // Extraer stage si getCicloEconomico está disponible
      try {
        const { getCicloEconomico } = await import("../intermarket-analysis.functions");
        const ciclo = await getCicloEconomico();
        if (ciclo?.ciclo) {
          regime.stage = ciclo.ciclo.stage;
          regime.stageLabel = ciclo.ciclo.label;
          regime.stageSectores = ciclo.ciclo.sectoresLideres;
        }
      } catch { /* fallback: stage defaults */ }

      // 3. GWR Validation (nuevo)
      const gwr_validation = await buildGwrValidation();

      const result: Phase1Data = {
        timestamp: new Date().toISOString(),
        macro,
        regime,
        murphy: {
          regimen: murphyAnalysis?.lecturaIntermarket?.regimen ?? "mixed",
          confianza: murphyAnalysis?.lecturaIntermarket?.confianza ?? 0,
          indicePresion: murphyAnalysis?.lecturaIntermarket?.indicePresion ?? 0,
          alertaActiva: murphyAnalysis?.lecturaIntermarket?.alertaActiva ?? null,
          recomendacionSesgo: murphyAnalysis?.lecturaIntermarket?.recomendacionSesgo ?? "neutral",
          patronHistorico: murphyAnalysis?.lecturaIntermarket?.patronHistoricoDetectado?.nombre ?? null,
          bearMarketSilencioso: murphyAnalysis?.lecturaIntermarket?.bearMarketSilencioso?.detectado ?? false,
          secuenciaGirosCorrecta: murphyAnalysis?.lecturaIntermarket?.secuenciaGiros?.ordenCorrecto ?? false,
        },
        gwr_validation,
      };

      setCache(CACHE_KEY, result);
      return result;
    } catch (err) {
      // Si el Murphy Engine falla, devolvemos datos parciales
      const gwr_validation = await buildGwrValidation();
      const result: Phase1Data = {
        timestamp: new Date().toISOString(),
        macro,
        regime: {
          classification: "mixed",
          inflationPressureScore: 50,
          confianza: 0,
          stage: 2,
          stageLabel: "Sin datos",
          stageSectores: [],
          description: "Murphy Engine temporalmente no disponible.",
        },
        murphy: {
          regimen: "mixed",
          confianza: 0,
          indicePresion: 0,
          alertaActiva: null,
          recomendacionSesgo: "neutral",
          patronHistorico: null,
          bearMarketSilencioso: false,
          secuenciaGirosCorrecta: false,
        },
        gwr_validation,
      };
      return result;
    }
  },
);
