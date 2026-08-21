// @ts-nocheck
// FASE 4 — Motor de contexto macro real.
// Reemplaza el placeholder evaluarContexto (reglas-contexto.ts, que siempre
// retornaba 0 y forzaba scoreContexto = 50 fijo) por la combinación de las
// 4 capas ya existentes en motor-recomendacion.functions.ts:
//   evaluarIntermarketMurphy, evaluarRatioCRBBonds, evaluarMacroGlobal, evaluarStovall.
// Pesos iguales (0.25 cada una) por defecto — sin ponderación previa documentada
// para esta combinación. Si se prefiere otra ponderación en producción queda
// registrada en detalle.pesosUsados para ajuste posterior.
// # REVISAR: el fetch de datos macro replica la pipeline de getRecomendaciones
// (motor-recomendacion.functions.ts:959-1000). En una fase futura conviene
// extraerla una sola vez y compartirla entre ambos consumidores.

import type { SubScore } from "./types";
import {
  evaluarIntermarketMurphy,
  evaluarRatioCRBBonds,
  evaluarMacroGlobal,
  evaluarStovall,
  clasificarRegimenIntermarket,
} from "../motor-recomendacion.functions";
import { inferirEtapaCiclo } from "../intermarket-engine";
import { getSectorPerformanceSemanal } from "../sector-performance.functions";
import { yahooChartOHLCV } from "../yahoo-chart";
import { getCached, setCache } from "../cache";

interface RegimenIntermarket {
  regimen: string;
  confianza: string;
  valor: number;
}

interface SectorRankingItem {
  sector: string;
  variacionPromedioSemanal: number;
}

interface EtapaCiclo {
  etapaEstimada: string | null;
  sectoresLideres: string[];
}

export interface MacroContextoInput {
  regimenIntermarket?: RegimenIntermarket | null;
  crbRatio30dChange?: number | null;
  semaforoGlobal?: { scoreGlobal: number } | null;
  sectorRanking?: SectorRankingItem[] | null;
  etapaCiclo?: EtapaCiclo | null;
}

const CACHE_KEY = "macro-contexto-v1";
const CACHE_TTL = 15 * 60 * 1000;

function pct30d(closes: number[]): number | null {
  if (closes.length < 21) return null;
  const ultimo = closes[closes.length - 1];
  const previo = closes[closes.length - 21];
  if (previo === 0) return null;
  return ((ultimo - previo) / previo) * 100;
}

async function obtenerDatosMacroContexto(): Promise<MacroContextoInput | null> {
  const cached = getCached<MacroContextoInput>(CACHE_KEY, CACHE_TTL);
  if (cached) return cached;

  try {
    const [sectorRanking, dbcOHLCV, spyOHLCV, tltOHLCV, dxyOHLCV] = await Promise.all([
      getSectorPerformanceSemanal(),
      yahooChartOHLCV("DBC", "3mo", "1d"),
      yahooChartOHLCV("SPY", "3mo", "1d"),
      yahooChartOHLCV("TLT", "3mo", "1d"),
      yahooChartOHLCV("DX-Y.NYB", "3mo", "1d"),
    ]);

    const dbcCloses = dbcOHLCV.map((b) => b.close);
    const spyCloses = spyOHLCV.map((b) => b.close);
    const tltCloses = tltOHLCV.map((b) => b.close);
    const dxyCloses = dxyOHLCV.map((b) => b.close);

    const dbc30d = pct30d(dbcCloses);
    const spy30d = pct30d(spyCloses);
    const tlt30d = pct30d(tltCloses);
    const dxy30d = pct30d(dxyCloses);

    const crbRatio30dChange =
      tltCloses.length >= 21 && dbcCloses.length >= 21 && tltCloses[tltCloses.length - 21] > 0
        ? ((dbcCloses[dbcCloses.length - 1] / tltCloses[tltCloses.length - 1] -
            dbcCloses[dbcCloses.length - 21] / tltCloses[tltCloses.length - 21]) /
            (dbcCloses[dbcCloses.length - 21] / tltCloses[tltCloses.length - 21])) *
          100
        : null;

    const regimen = clasificarRegimenIntermarket({
      dxyVar30d: dxy30d,
      commodityVar30d: dbc30d,
      bondPriceVar30d: tlt30d,
      sp500Var30d: spy30d,
    });

    const etapaCiclo = inferirEtapaCiclo({
      bondPrice30dChange: tlt30d,
      sp500Var30d: spy30d,
      commodityVar30d: dbc30d,
    });

    const data: MacroContextoInput = {
      regimenIntermarket: regimen,
      crbRatio30dChange,
      semaforoGlobal: { scoreGlobal: 0 },
      sectorRanking: sectorRanking.map((s) => ({
        sector: s.sector,
        variacionPromedioSemanal: s.variacionPromedio,
      })),
      etapaCiclo,
    };

    setCache(CACHE_KEY, data);
    return data;
  } catch {
    return null;
  }
}

export async function calcularScoreMacroContexto(
  ticker: string,
  sector: string,
  datos?: MacroContextoInput,
): Promise<SubScore> {
  const data = datos ?? (await obtenerDatosMacroContexto());
  if (!data) {
    return { valor: 50, detalle: {}, fuente: "scoring/macro-contexto.ts", disponible: false };
  }

  const capas: { nombre: string; valor: number }[] = [];

  if (data.regimenIntermarket) {
    const c = evaluarIntermarketMurphy(
      sector,
      data.regimenIntermarket,
      data.crbRatio30dChange ?? null,
    );
    capas.push({ nombre: "IntermarketMurphy", valor: c.valor });
  }

  if (data.crbRatio30dChange != null) {
    const crb = evaluarRatioCRBBonds(data.crbRatio30dChange, sector);
    capas.push({ nombre: "RatioCRBBonds", valor: crb.confirmacion });
  }

  if (data.semaforoGlobal != null) {
    capas.push({ nombre: "MacroGlobal", valor: evaluarMacroGlobal(data.semaforoGlobal) });
  }

  if (data.sectorRanking && data.etapaCiclo) {
    const c = evaluarStovall(sector, data.sectorRanking, data.etapaCiclo);
    capas.push({ nombre: "Stovall", valor: c.valor });
  }

  if (capas.length === 0) {
    return { valor: 50, detalle: {}, fuente: "scoring/macro-contexto.ts", disponible: false };
  }

  // Pesos iguales con redistribución entre capas disponibles (mismo patrón que sectorial.ts)
  const pesoPorCapa = 1 / capas.length;
  let suma = 0;
  for (const c of capas) suma += c.valor * pesoPorCapa;
  suma = Math.max(-1, Math.min(1, suma));

  const valor = Math.round(((suma + 1) / 2) * 100);
  const detalle: Record<string, number> = { pesosUsados: pesoPorCapa };
  for (const c of capas) detalle[c.nombre] = c.valor;

  return {
    valor,
    raw: Math.round(suma * 100) / 100,
    detalle,
    fuente: "scoring/macro-contexto.ts",
    disponible: true,
  };
}
