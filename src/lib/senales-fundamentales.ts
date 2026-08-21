// @ts-nocheck
// src/lib/senales-fundamentales.ts
// Catálogo de señales fundamentales con protección point-in-time.
//
// ADVERTENCIA: el input `reportesHistoricos` DEBE contener la fecha REAL
// de publicación de cada reporte (fecha en que el dato estuvo disponible
// al mercado), NO la fecha del período fiscal. Usar la fecha del período
// fiscal introduce look-ahead bias porque el dato se conocería "antes de
// tiempo" en el backtest.

export const UMBRALES_FUNDAMENTALES = {
  EARNINGS_BEAT_PCT: 0.05,
  EARNINGS_MISS_PCT: -0.05,
  UPGRADE_NIVELES: 2,
  DOWNGRADE_NIVELES: 2,
  SCORE_MEJORA_PCT: 0.10,
  SCORE_DETERIORO_PCT: -0.10,
  PE_PERCENTIL_BAJO: 25,
  PE_PERCENTIL_ALTO: 75,
} as const;

export type TipoSenalFundamental =
  | "earnings_beat"
  | "earnings_miss"
  | "upgrade_analista"
  | "downgrade_analista"
  | "mejora_score_fundamental"
  | "deterioro_score_fundamental"
  | "revalorizacion_pe"
  | "sobrevaluacion_pe";

export interface SenalFundamental {
  tipo: TipoSenalFundamental;
  fechaPublicacion: string;
  precioCierre: number;
  valorIndicador: number;
  descripcion: string;
}

export interface ReporteTrimestral {
  fechaPublicacion: string;
  periodoFiscal: string;
  epsActual: number;
  epsEstimado: number | null;
  ingresoActual: number;
  ingresoEstimado: number | null;
}

export interface ScoreFundamentalSnapshot {
  fecha: string;
  scoreCompuesto: number;
  roe: number | null;
  revenueGrowth: number | null;
  fcfYield: number | null;
  profitMargin: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pePercentil: number | null;
  recomendacion: number | null;
}

export function detectarSenalesFundamentales(
  reportes: ReporteTrimestral[],
  scores: ScoreFundamentalSnapshot[],
  umbrales?: Partial<typeof UMBRALES_FUNDAMENTALES>,
): SenalFundamental[] {
  const u = { ...UMBRALES_FUNDAMENTALES, ...umbrales };
  const senales: SenalFundamental[] = [];

  // Earnings beat/miss
  for (const r of reportes) {
    if (r.epsEstimado == null || r.epsEstimado === 0) continue;
    const sorpresa = (r.epsActual - r.epsEstimado) / Math.abs(r.epsEstimado);

    if (sorpresa >= u.EARNINGS_BEAT_PCT) {
      senales.push({
        tipo: "earnings_beat",
        fechaPublicacion: r.fechaPublicacion,
        precioCierre: 0,
        valorIndicador: sorpresa,
        descripcion: `EPS sorpresa +${(sorpresa * 100).toFixed(1)}% (estimado ${r.epsEstimado}, real ${r.epsActual})`,
      });
    } else if (sorpresa <= u.EARNINGS_MISS_PCT) {
      senales.push({
        tipo: "earnings_miss",
        fechaPublicacion: r.fechaPublicacion,
        precioCierre: 0,
        valorIndicador: sorpresa,
        descripcion: `EPS sorpresa ${(sorpresa * 100).toFixed(1)}% (estimado ${r.epsEstimado}, real ${r.epsActual})`,
      });
    }
  }

  // Mejora/deterioro de score fundamental (requiere 2+ snapshots)
  for (let i = 1; i < scores.length; i++) {
    const ant = scores[i - 1];
    const act = scores[i];
    const cambio = ant.scoreCompuesto > 0 ? (act.scoreCompuesto - ant.scoreCompuesto) / ant.scoreCompuesto : 0;

    if (cambio >= u.SCORE_MEJORA_PCT) {
      senales.push({
        tipo: "mejora_score_fundamental",
        fechaPublicacion: act.fecha,
        precioCierre: 0,
        valorIndicador: cambio,
        descripcion: `Score fundamental mejoró ${(cambio * 100).toFixed(1)}% (${ant.scoreCompuesto} → ${act.scoreCompuesto})`,
      });
    } else if (cambio <= u.SCORE_DETERIORO_PCT) {
      senales.push({
        tipo: "deterioro_score_fundamental",
        fechaPublicacion: act.fecha,
        precioCierre: 0,
        valorIndicador: cambio,
        descripcion: `Score fundamental empeoró ${(cambio * 100).toFixed(1)}% (${ant.scoreCompuesto} → ${act.scoreCompuesto})`,
      });
    }
  }

  // Revalorización/sobrevaluación por P/E percentil
  for (const s of scores) {
    if (s.pePercentil == null) continue;

    if (s.pePercentil <= u.PE_PERCENTIL_BAJO) {
      senales.push({
        tipo: "revalorizacion_pe",
        fechaPublicacion: s.fecha,
        precioCierre: 0,
        valorIndicador: s.pePercentil,
        descripcion: `P/E en percentil ${s.pePercentil.toFixed(0)} — barato histórico (${s.trailingPE?.toFixed(1) ?? "—"}x)`,
      });
    } else if (s.pePercentil >= u.PE_PERCENTIL_ALTO) {
      senales.push({
        tipo: "sobrevaluacion_pe",
        fechaPublicacion: s.fecha,
        precioCierre: 0,
        valorIndicador: s.pePercentil,
        descripcion: `P/E en percentil ${s.pePercentil.toFixed(0)} — caro histórico (${s.trailingPE?.toFixed(1) ?? "—"}x)`,
      });
    }
  }

  // Ordenar por fecha ascendente
  senales.sort((a, b) => a.fechaPublicacion.localeCompare(b.fechaPublicacion));

  return senales;
}
