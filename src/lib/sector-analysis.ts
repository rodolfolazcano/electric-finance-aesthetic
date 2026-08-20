/**
 * Análisis sectorial de un activo: determina su sector (catálogo unificado o
 * Yahoo quoteSummary), lo compara contra el ETF sectorial de referencia y
 * contra los benchmarks maestros. Replica `sector-analysis.functions.ts`.
 */

import { fetchYahooQuoteSummaryJson } from "./yahoo-http";
import { activoPorTicker, porSector } from "./catalogo-activos";
import {
  SECTOR_ETF_BY_SECTOR_KEY,
  SECTOR_KEY_BY_ESPANOL,
  BENCHMARKS_MASTER,
} from "./benchmarks-master";
import { closesDiarios, linregress } from "./capm-engine";
import { returns, correlation } from "./stats";

export interface SectorInfo {
  catalogo: string | null;
  yahoo: string | null;
  sectorKey: string | null;
  etfSector: string | null;
  etfNombre: string | null;
}

async function sectorDeYahoo(simbolo: string): Promise<SectorInfo> {
  const out: SectorInfo = {
    catalogo: activoPorTicker(simbolo)?.sector ?? null,
    yahoo: null,
    sectorKey: null,
    etfSector: null,
    etfNombre: null,
  };
  try {
    const resp = await fetchYahooQuoteSummaryJson<{
      quoteSummary?: {
        result?: Array<{
          assetProfile?: { sector?: string; sectorKey?: string; industry?: string };
        }>;
        error?: { description?: string } | null;
      };
    }>(simbolo, ["assetProfile"]);
    const r = resp.json?.quoteSummary?.result?.[0];
    out.sectorKey = r?.assetProfile?.sectorKey ?? null;
    out.yahoo = r?.assetProfile?.sector ?? null;
  } catch {
    /* sin quoteSummary: usamos catálogo */
  }
  // Si el catálogo español tiene mapeo y Yahoo no devolvió el sectorKey.
  if (!out.sectorKey && out.catalogo) {
    const key = SECTOR_KEY_BY_ESPANOL[out.catalogo.toLowerCase()];
    if (key) out.sectorKey = key;
  }
  const etf = out.sectorKey ? (SECTOR_ETF_BY_SECTOR_KEY[out.sectorKey] ?? null) : null;
  if (etf) {
    out.etfSector = etf;
    out.etfNombre = BENCHMARKS_MASTER.find((b) => b.ticker === etf)?.name ?? etf;
  }
  return out;
}

export interface ComparacionETF {
  ticker: string;
  name: string;
  beta: number | null;
  rSquared: number | null;
  correlation: number | null;
}

/** Compara el activo contra un set de ETFs sectoriales/factores. */
export async function compararContraETFs(
  simbolo: string,
  etfs: string[],
  rango = "2y",
): Promise<ComparacionETF[]> {
  const out: ComparacionETF[] = [];
  const serie = await closesDiarios(simbolo, rango);
  if (serie.length < 20) return out;
  const ra = returns(serie);
  for (const e of etfs) {
    try {
      const closes = await closesDiarios(e, rango);
      if (closes.length < 20) continue;
      const rb = returns(closes);
      const reg = linregress(rb, ra);
      out.push({
        ticker: e,
        name: BENCHMARKS_MASTER.find((b) => b.ticker === e)?.name ?? e,
        beta: reg.beta,
        rSquared: reg.rSquared,
        correlation: reg.correlation,
      });
    } catch {
      /* ese ETF falló: se omite */
    }
  }
  return out.sort((a, b) => (b.rSquared ?? 0) - (a.rSquared ?? 0));
}

export interface AnalisisSectorial {
  simbolo: string;
  label: string;
  sector: SectorInfo;
  comparacion: ComparacionETF[];
  peers: Array<{ ticker: string; nombre: string }>;
  error: string | null;
}

/**
 * Análisis completo: sector del activo, ETF sectorial, comparación por R²/beta
 * contra los sectores US y los peers del catálogo (misma industria).
 */
export async function analisisSectorial(simbolo: string): Promise<AnalisisSectorial> {
  const out: AnalisisSectorial = {
    simbolo,
    label: activoPorTicker(simbolo)?.nombre ?? simbolo,
    sector: { catalogo: null, yahoo: null, sectorKey: null, etfSector: null, etfNombre: null },
    comparacion: [],
    peers: [],
    error: null,
  };
  try {
    const sector = await sectorDeYahoo(simbolo);
    out.sector = sector;
    const candidatosEtf = new Set<string>(Object.values(SECTOR_ETF_BY_SECTOR_KEY));
    if (sector.etfSector) candidatosEtf.add(sector.etfSector);
    out.comparacion = await compararContraETFs(simbolo, [...candidatosEtf], "2y");

    // Peers del mismo sector/industria en el catálogo unificado.
    if (sector.catalogo) {
      const lista = porSector(sector.catalogo).slice(0, 15);
      out.peers = lista.map((a) => ({ ticker: a.ticker, nombre: a.nombre }));
    }
    if (!out.comparacion.length) out.error = "no se pudieron comparar ETFs sectoriales";
  } catch (e) {
    out.error = e instanceof Error ? e.message : "error";
  }
  return out;
}

/** Correlaciones de un activo contra los benchmarks maestros (top/bottom). */
export async function correlacionesBenchmarks(
  simbolo: string,
  limite = 10,
  rango = "1y",
): Promise<{
  positivas: ComparacionETF[];
  negativas: ComparacionETF[];
  error: string | null;
}> {
  try {
    const serie = await closesDiarios(simbolo, rango);
    if (serie.length < 20) return { positivas: [], negativas: [], error: "sin datos" };
    const ra = returns(serie);
    const resultados: ComparacionETF[] = [];
    for (const b of BENCHMARKS_MASTER) {
      try {
        const closes = await closesDiarios(b.ticker, rango);
        if (closes.length < 20) continue;
        const rb = returns(closes);
        const corr = correlation(ra, rb);
        resultados.push({
          ticker: b.ticker,
          name: b.name,
          beta: null,
          rSquared: null,
          correlation: corr,
        });
      } catch {
        /* omitir */
      }
    }
    const orden = resultados.sort((a, b) => (b.correlation ?? 0) - (a.correlation ?? 0));
    return {
      positivas: orden.slice(0, limite),
      negativas: orden.slice(-limite).reverse(),
      error: null,
    };
  } catch (e) {
    return { positivas: [], negativas: [], error: e instanceof Error ? e.message : "error" };
  }
}
