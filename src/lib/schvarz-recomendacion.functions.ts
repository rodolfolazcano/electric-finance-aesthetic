// @ts-nocheck
// src/lib/schvarz-recomendacion.functions.ts
// Motor de recomendaciones basado en la metodología de Hernán Schvarz:
// - Análisis fundamental (cash-flow, valor intrínseco WACC/APV, múltiplos, valor técnico de activos)
// - Análisis técnico (semáforo)
// - Ventaja competitiva / moat simplificado
// - Diversificación por perfiles de riesgo (conservador / moderado / agresivo)

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCached, setCache } from "./cache";
import type { FundamentalAFResult } from "./fundamental-af.functions";
import type { SemaforoResult } from "./finance.functions";
import {
  calcularAPV,
  calcularMultiplosImplicitos,
  calcularValorTecnicoActivos,
  calcularWACC,
} from "./valuacion.functions";
import { getUniversoSchvarz, perfilPorTipoDeActivo } from "./schvarz-universo";
import { sincronizarUniversoSchvarz } from "./schvarz-sync.functions";
import {
  detectarDivergenciaMetodosValuacion,
  type Contradiccion,
} from "./scoring-unificado";

export type PerfilSchvarz = "conservador" | "moderado" | "agresivo";

export interface ValuacionSchvarz {
  waccMargen: number | null;
  apvMargen: number | null;
  multiplosMargen: number | null;
  activosMargen: number | null;
  margenSeguridadPromedio: number | null;
  /** BLOQUE 3 — alerta metodológica si WACC y APV divergen > umbral (Pascale 13.4) */
  divergenciaMetodos: Contradiccion | null;
}

export interface RecomendacionSchvarz {
  ticker: string;
  nombre: string;
  sector: string | null;
  industria: string | null;
  tipo: string | null;
  moneda: string | null;
  mercado: string | null;
  pais: string | null;
  perfil: PerfilSchvarz;
  scoreSchvarz: number;
  clasificacion: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER";
  price: number | null;
  technical: {
    clasificacion: SemaforoResult["clasificacionJerarquica"];
    recommendation: SemaforoResult["recommendation"];
    rsi: number | null;
  };
  valuation: ValuacionSchvarz;
  moatScore: number;
  moatLabel: string;
  reasoning: string;
}

export interface RecomendacionesSchvarzResult {
  lastUpdated: string;
  conservador: RecomendacionSchvarz[];
  moderado: RecomendacionSchvarz[];
  agresivo: RecomendacionSchvarz[];
  diversificacion: {
    perfil: PerfilSchvarz;
    allocations: { clase: string; pct: number; nota: string }[];
  }[];
  universo: {
    total: number;
    porSector: { sector: string; cantidad: number }[];
    porMercado: { mercado: string; cantidad: number }[];
  };
}

const CACHE_KEY = "recomendaciones-schvarz-v2";
const CACHE_TTL = 15 * 60 * 1000; // 15 min

const WACC_INPUTS = {
  rf: 4.5,
  erp: 5.5,
  incluirCRP: false,
  gTerminal: 2.5,
};

const MULTIPLES_REF = {
  pe: 18,
  evEbitda: 12,
  mktCapEbitda: null as number | null,
  pb: 2.5,
  ps: 2.0,
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function safeFinite(n: number | null | undefined): number | null {
  return n != null && Number.isFinite(n) ? n : null;
}

function normalizeMargin(ms: number | null): number {
  const v = safeFinite(ms);
  if (v == null) return 0;
  // Normalizar: ±50% de margen = ±1 en score
  return clamp(v / 50, -1, 1);
}

function technicalScore(tec: SemaforoResult): number {
  switch (tec.clasificacionJerarquica) {
    case "COMPRA":
      return 1;
    case "COMPRA CON CAUTELA":
      return 0.5;
    case "MANTENER":
      return 0;
    case "REDUCIR":
      return -0.5;
    case "VENTA":
      return -1;
    default:
      return 0;
  }
}

function fundamentalQualityScore(f: FundamentalAFResult): number {
  let score = 0;
  if (f.profitMargin != null) {
    if (f.profitMargin > 0.2) score += 0.3;
    else if (f.profitMargin > 0.1) score += 0.15;
    else if (f.profitMargin <= 0) score -= 0.2;
  }
  if (f.returnOnEquity != null) {
    if (f.returnOnEquity > 0.15) score += 0.3;
    else if (f.returnOnEquity > 0.1) score += 0.15;
    else if (f.returnOnEquity <= 0) score -= 0.2;
  }
  if (f.revenueGrowth != null) {
    if (f.revenueGrowth > 0.15) score += 0.2;
    else if (f.revenueGrowth > 0) score += 0.1;
    else score -= 0.1;
  }
  if (f.debtToEquityRaw != null) {
    // BLOQUE 5 — el riesgo real no es la deuda aislada sino el leverage combinado
    // (Pascale 18.4: L.C. = L.O. × L.F.). Ajuste como multiplicador sobre el score
    // de D/E existente (no lo reemplaza):
    //   - L.C. alto → se amplifica el castigo por deuda alta y se modera el premio
    //     por deuda baja (estructura de costos rígida + intereses = riesgo mayor).
    //   - L.C. bajo → estructura con costos mayormente variables: la deuda pesa menos.
    const lc = f.leverage?.disponible ? f.leverage.lc : null;
    const factorRiesgo =
      lc != null ? Math.min(2, Math.max(0.5, lc / 2.5)) : 1;
    if (f.debtToEquityRaw < 50) {
      score += 0.2 * (lc != null && lc > 3 ? 0.5 : 1);
    } else if (f.debtToEquityRaw > 100) {
      score -= 0.2 * factorRiesgo;
    }
  }
  return clamp(score, -1, 1);
}

// FASE 6: exportado para que motor-unificado.ts (Fase 5) reutilice la copia
// canónica del original y se elimine la copia local en FASE 7.
export function calcularMoatSimplificado(f: FundamentalAFResult): { score: number; label: string } {
  let score = 0;
  if (f.profitMargin != null && f.profitMargin > 0.15) score += 25;
  else if (f.profitMargin != null && f.profitMargin > 0.1) score += 15;

  if (f.returnOnEquity != null && f.returnOnEquity > 0.15) score += 25;
  else if (f.returnOnEquity != null && f.returnOnEquity > 0.1) score += 15;

  if (f.revenueGrowth != null && f.revenueGrowth > 0.1) score += 15;

  if (f.debtToEquityRaw != null && f.debtToEquityRaw < 80) score += 15;

  if (f.freeCashflowM != null && f.freeCashflowM > 0) score += 20;

  if (f.operatingMargin != null && f.operatingMargin > 0.15) score += 10;

  // BLOQUE 8 — criterio de devengamiento (Fowler Newton, Cap. 9, punto 9.5).
  // Base contable (income statement, devengado) y base caja (cash flow) pueden
  // divergir por diseño: una utilidad devengada alta con FCF bajo/negativo es
  // señal de resultados "de papel" que no se convierten en caja.
  //   calidadDevengamiento = freeCashflowM * 1e6 / netIncomeFromIS
  // Si el ratio es bajo o negativo mientras el margen es alto, RESTA al moat.
  const ni = f.netIncomeFromIS;
  const fcfUsd = f.freeCashflowM != null ? f.freeCashflowM * 1e6 : null;
  if (
    ni != null &&
    ni > 0 &&
    fcfUsd != null &&
    f.profitMargin != null &&
    f.profitMargin > 0.1
  ) {
    const calidadDevengamiento = fcfUsd / ni;
    if (calidadDevengamiento < 0.5) {
      score -= calidadDevengamiento <= 0 ? 15 : 8;
    }
  }

  score = Math.min(100, score);

  let label = "Sin Moat Claro";
  if (score >= 70) label = "Moat Fuerte";
  else if (score >= 45) label = "Moat Moderado";

  return { score, label };
}

function calcularValuacionSchvarz(f: FundamentalAFResult): ValuacionSchvarz {
  const wacc = calcularWACC(f, WACC_INPUTS);
  const apv = calcularAPV(f, WACC_INPUTS);
  const mult = calcularMultiplosImplicitos(f, MULTIPLES_REF);
  const activos = calcularValorTecnicoActivos(f);

  const waccMargen = safeFinite(wacc.margenSeguridad);
  const apvMargen = safeFinite(apv.margenSeguridad);
  const multiplosMargen = safeFinite(mult.margenSeguridad);
  const activosMargen = safeFinite(activos.margenSeguridad);

  const margs = [waccMargen, apvMargen, multiplosMargen, activosMargen].filter(
    (v): v is number => v != null,
  );
  const avg = margs.length > 0 ? margs.reduce((a, b) => a + b, 0) / margs.length : null;

  const divergenciaMetodos = detectarDivergenciaMetodosValuacion(waccMargen, apvMargen);

  return {
    waccMargen,
    apvMargen,
    multiplosMargen,
    activosMargen,
    margenSeguridadPromedio: safeFinite(avg),
    divergenciaMetodos,
  };
}

function asignarPerfil(
  f: FundamentalAFResult,
  valuation: ValuacionSchvarz,
  tipoBase: PerfilSchvarz,
): PerfilSchvarz {
  const beta = safeFinite(f.beta);
  const ms = valuation.margenSeguridadPromedio ?? 0;
  const moat = calcularMoatSimplificado(f).score;
  const growth = f.revenueGrowth ?? 0;

  // Si no hay métricas fundamentales confiables, se respeta el perfil
  // sugerido por tipo de activo (sector + instrumento + mercado).
  if (beta == null && moat === 0 && ms === 0) return tipoBase;

  // Conservador: beta contenido, moat sólido o margen de seguridad alto, crecimiento no agresivo
  if (
    (beta != null && beta < 0.9 && growth < 0.2) ||
    (moat >= 70 && ms > 10) ||
    (ms > 20 && beta != null && beta < 1.1)
  ) {
    return "conservador";
  }

  // Agresivo: alta beta, crecimiento elevado, o situaciones de recuperación con alto upside
  if (
    (beta != null && beta > 1.3) ||
    growth > 0.25 ||
    (f.profitMargin != null && f.profitMargin < 0.05 && ms > 0)
  ) {
    return "agresivo";
  }

  // Neutro: se respeta el sesgo estructural del tipo de activo (defensivo vs crecimiento)
  return tipoBase;
}

function scoreSchvarz(
  f: FundamentalAFResult,
  tec: SemaforoResult,
  valuation: ValuacionSchvarz,
  moat: { score: number },
): number {
  const tScore = technicalScore(tec) * 0.25;
  const vScore = normalizeMargin(valuation.margenSeguridadPromedio) * 0.35;
  const fScore = fundamentalQualityScore(f) * 0.15;
  const mScore = (moat.score / 100) * 0.25;
  return clamp(tScore + vScore + fScore + mScore, -1, 1);
}

function construirRazonamiento(
  f: FundamentalAFResult,
  tec: SemaforoResult,
  valuation: ValuacionSchvarz,
  moat: { score: number; label: string },
  score: number,
): string {
  const partes: string[] = [];

  partes.push(`Técnico: ${tec.clasificacionJerarquica}.`);

  const ms = valuation.margenSeguridadPromedio;
  if (ms != null) {
    partes.push(`Valuación: margen de seguridad promedio ${ms >= 0 ? "+" : ""}${ms.toFixed(1)}%.`);
  } else {
    partes.push("Valuación: sin margen de seguridad disponible.");
  }

  partes.push(`Moat: ${moat.label} (${moat.score}/100).`);

  if (score > 0.65) {
    partes.push("Alineación sólida entre precio, fundamental y técnico.");
  } else if (score > 0.35) {
    partes.push("Alineación parcial; conviene monitorear entrada.");
  } else {
    partes.push("Señales mixtas; priorizar gestión de riesgo.");
  }

  return partes.join(" ");
}

function clasificarSchvarz(score: number): RecomendacionSchvarz["clasificacion"] {
  if (score > 0.65) return "COMPRA";
  if (score > 0.35) return "COMPRA CON CAUTELA";
  return "MANTENER";
}

const DIVERSIFICACION_SCHVARZ: RecomendacionesSchvarzResult["diversificacion"] = [
  {
    perfil: "conservador",
    allocations: [
      { clase: "Renta Variable local / acciones", pct: 10, nota: "Pocos picks de calidad" },
      {
        clase: "CEDEARs diversificadores (SPY/DJ/Global)",
        pct: 35,
        nota: "Diversificación internacional en pesos",
      },
      {
        clase: "Renta Fija / Bonos CER",
        pct: 35,
        nota: "Protección contra inflación y volatilidad",
      },
      { clase: "Caución / Liquidez", pct: 20, nota: "Reserva de oportunidades" },
    ],
  },
  {
    perfil: "moderado",
    allocations: [
      { clase: "Renta Variable local / acciones", pct: 20, nota: "Balance crecimiento-valor" },
      { clase: "CEDEARs diversificadores (SPY/DJ/Global)", pct: 30, nota: "Core global en pesos" },
      { clase: "Renta Fija / Bonos CER", pct: 30, nota: "Estabilidad de cartera" },
      { clase: "Caución / Liquidez", pct: 20, nota: "Dry powder" },
    ],
  },
  {
    perfil: "agresivo",
    allocations: [
      {
        clase: "Renta Variable local / acciones",
        pct: 30,
        nota: "Mayor peso a oportunidades de valor",
      },
      { clase: "CEDEARs diversificadores (SPY/DJ/Global)", pct: 25, nota: "Core más ligero" },
      { clase: "Renta Fija / Bonos CER", pct: 30, nota: "Ancla de riesgo" },
      { clase: "Caución / Liquidez", pct: 15, nota: "Para recomprar correcciones" },
    ],
  },
];

// Límites de diversificación por sector/industria (topN = cantidad pedida)
function maxPorSector(perfil: PerfilSchvarz): number {
  // Conservador: máxima diversificación → 1 por sector en los primeros picks.
  if (perfil === "conservador") return 1;
  if (perfil === "moderado") return 2;
  return 3; // agresivo puede concentrar más
}

function maxPorIndustria(perfil: PerfilSchvarz): number {
  return perfil === "conservador" ? 1 : 2;
}

/** Selecciona el topN de un perfil aplicando topes de diversificación por sector/industria. */
function seleccionarDiversificado(
  lista: RecomendacionSchvarz[],
  topN: number,
  perfil: PerfilSchvarz,
): RecomendacionSchvarz[] {
  const orden = [...lista].sort((a, b) => b.scoreSchvarz - a.scoreSchvarz);
  const porSector = new Map<string, number>();
  const porIndustria = new Map<string, number>();
  const elegidos: RecomendacionSchvarz[] = [];
  const capSector = maxPorSector(perfil);
  const capIndustria = maxPorIndustria(perfil);

  for (const r of orden) {
    if (elegidos.length >= topN) break;
    const sec = r.sector ?? "Sin sector";
    const ind = r.industria ?? sec;
    if ((porSector.get(sec) ?? 0) >= capSector) continue;
    if ((porIndustria.get(ind) ?? 0) >= capIndustria) continue;
    porSector.set(sec, (porSector.get(sec) ?? 0) + 1);
    porIndustria.set(ind, (porIndustria.get(ind) ?? 0) + 1);
    elegidos.push(r);
  }
  return elegidos;
}

export const getRecomendacionesSchvarz = createServerFn({ method: "POST" })
  .inputValidator((d: { topN?: number }) =>
    z.object({ topN: z.number().min(1).max(20).optional().default(5) }).parse(d),
  )
  .handler(async ({ data }): Promise<RecomendacionesSchvarzResult> => {
    const fallback = (): RecomendacionesSchvarzResult => ({
      lastUpdated: new Date().toISOString(),
      conservador: [],
      moderado: [],
      agresivo: [],
      diversificacion: DIVERSIFICACION_SCHVARZ,
      universo: {
        total: getUniversoSchvarz().length,
        porSector: [],
        porMercado: [],
      },
    });

    try {
      const cached = getCached<RecomendacionesSchvarzResult>(CACHE_KEY, CACHE_TTL);
      if (cached) return cached;

      // 1) Sincronización INCREMENTAL y persistente (memoria + Supabase):
      //    lee el último guardado, y solo actualiza los datos no obtenidos/vencidos
      //    en una única pasada en paralelo por lotes (semaforo 20, fundamental 50).
      //    Guarda de nuevo cada resultado obtenido.
      const sync = await sincronizarUniversoSchvarz();
      const { datos } = sync;

      // 2) Universo expandido con metadata (sector/industria/tipo/moneda/mercado/pais)
      const activos = getUniversoSchvarz();
      const universoMap = new Map(activos.map((a) => [a.ticker, a]));

      const recomendaciones: RecomendacionSchvarz[] = [];

      for (const activo of activos) {
        const tec = datos.semaforos.get(activo.ticker);
        const f = datos.fundamentales.get(activo.ticker);
        if (!tec || !f || f.error) continue;

        const valuation = calcularValuacionSchvarz(f);
        const moat = calcularMoatSimplificado(f);
        const score = scoreSchvarz(f, tec, valuation, moat);

        // Solo recomendar activos con score positivo y alguna señal de compra
        if (score <= 0.15) continue;
        if (
          tec.clasificacionJerarquica !== "COMPRA" &&
          tec.clasificacionJerarquica !== "COMPRA CON CAUTELA"
        )
          continue;

        // Perfil base según tipo de activo (sector/instrumento/mercado) y ajuste
        // por beta, moat y margen de seguridad del análisis fundamental.
        const tipoBase = perfilPorTipoDeActivo(activo);
        const perfil = asignarPerfil(f, valuation, tipoBase);
        const clasificacion = clasificarSchvarz(score);

        recomendaciones.push({
          ticker: activo.ticker,
          nombre: f.companyName || tec.name || activo.nombre,
          sector: activo.sector,
          industria: activo.industria,
          tipo: activo.tipo,
          moneda: activo.moneda,
          mercado: activo.mercado,
          pais: activo.pais,
          perfil,
          scoreSchvarz: Math.round(score * 100) / 100,
          clasificacion,
          price: safeFinite(tec.price ?? f.currentPrice),
          technical: {
            clasificacion: tec.clasificacionJerarquica,
            recommendation: tec.recommendation,
            rsi: safeFinite(tec.rsi),
          },
          valuation,
          moatScore: moat.score,
          moatLabel: moat.label,
          reasoning: construirRazonamiento(f, tec, valuation, moat, score),
        });
      }

      // 3) Distribuir por perfil y seleccionar topN con diversificación
      const byProfile: Record<PerfilSchvarz, RecomendacionSchvarz[]> = {
        conservador: [],
        moderado: [],
        agresivo: [],
      };

      for (const r of recomendaciones) {
        byProfile[r.perfil].push(r);
      }

      const resultadoPerfiles = {
        conservador: seleccionarDiversificado(byProfile.conservador, data.topN, "conservador"),
        moderado: seleccionarDiversificado(byProfile.moderado, data.topN, "moderado"),
        agresivo: seleccionarDiversificado(byProfile.agresivo, data.topN, "agresivo"),
      };

      // 4) Resumen del universo analizado (para la UI)
      const conteoSector = new Map<string, number>();
      const conteoMercado = new Map<string, number>();
      for (const a of activos) {
        conteoSector.set(a.sector, (conteoSector.get(a.sector) ?? 0) + 1);
        conteoMercado.set(a.mercado, (conteoMercado.get(a.mercado) ?? 0) + 1);
      }

      const result: RecomendacionesSchvarzResult = {
        lastUpdated: new Date().toISOString(),
        conservador: resultadoPerfiles.conservador,
        moderado: resultadoPerfiles.moderado,
        agresivo: resultadoPerfiles.agresivo,
        diversificacion: DIVERSIFICACION_SCHVARZ,
        universo: {
          total: activos.length,
          porSector: [...conteoSector.entries()]
            .map(([sector, cantidad]) => ({ sector, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad || a.sector.localeCompare(b.sector)),
          porMercado: [...conteoMercado.entries()]
            .map(([mercado, cantidad]) => ({ mercado, cantidad }))
            .sort((a, b) => b.cantidad - a.cantidad),
        },
      };

      setCache(CACHE_KEY, result);
      return result;
    } catch {
      return fallback();
    }
  });
