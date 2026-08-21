// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "./cache";

export interface MacroTrendPoint {
  fecha: string;
  valor: number;
}

export interface VariacionPeriodo {
  valorActual: number;
  variacionDiariaPct: number | null;
  variacionSemanalPct: number | null;
  variacionMensualPct: number | null;
}

function diasEntre(f1: string, f2: string): number {
  const d1 = new Date(f1).getTime();
  const d2 = new Date(f2).getTime();
  return (d2 - d1) / (1000 * 60 * 60 * 24);
}

export function calcularVariaciones(
  serie: { fecha: string; valor: number }[],
): VariacionPeriodo | null {
  if (serie.length < 2) return null;
  const actual = serie[serie.length - 1];
  const hace1d = serie[serie.length - 2];
  const hace7d = serie.find((p) => diasEntre(p.fecha, actual.fecha) >= 7);
  const hace30d = serie.find((p) => diasEntre(p.fecha, actual.fecha) >= 30);

  return {
    valorActual: actual.valor,
    variacionDiariaPct:
      hace1d && hace1d.valor !== 0 ? ((actual.valor - hace1d.valor) / hace1d.valor) * 100 : null,
    variacionSemanalPct:
      hace7d && hace7d.valor !== 0 ? ((actual.valor - hace7d.valor) / hace7d.valor) * 100 : null,
    variacionMensualPct:
      hace30d && hace30d.valor !== 0
        ? ((actual.valor - hace30d.valor) / hace30d.valor) * 100
        : null,
  };
}

export interface InflacionConVariacion {
  mensual: number | null;
  interanual: number | null;
  acumuladaAnual: number | null;
  aceleracion: number | null;
  historico: MacroTrendPoint[];
}

export interface TipoCambioSerie {
  oficial: VariacionPeriodo | null;
  mep: VariacionPeriodo | null;
  ccl: VariacionPeriodo | null;
}

export interface MacroTrendsResult {
  riesgoPais: MacroTrendPoint[];
  reservas: MacroTrendPoint[];
  inflacion: InflacionConVariacion;
  tasas: {
    badlar: number | null;
    tm20: number | null;
    badlarSerie: MacroTrendPoint[];
    tm20Serie: MacroTrendPoint[];
  };
  tiposCambio: TipoCambioSerie;
  variaciones: {
    riesgoPais: VariacionPeriodo | null;
    reservas: VariacionPeriodo | null;
    badlar: VariacionPeriodo | null;
    tm20: VariacionPeriodo | null;
  };
  timestamp: string;
}

interface ArgentinaDatosItem {
  valor: number;
  fecha: string;
}

interface DolarItem {
  compra: number;
  venta: number;
  fecha: string;
}

interface BcraItem {
  d: string;
  v: number;
}

async function fetchJson<T>(url: string, timeout = 8000, useToken = false): Promise<T | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const headers: Record<string, string> = {};
    if (useToken) {
      const token = process.env.BCRA_API_TOKEN;
      if (token) headers["Authorization"] = `Bearer ${token}`;
    }
    const r = await fetch(url, { cache: "no-store", signal: controller.signal, headers });
    clearTimeout(timer);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

const CACHE_TRENDS_KEY = "macro-trends-v2";
const CACHE_DOLAR_KEY = "macro-dolar-historico";

export const getMacroTrends = createServerFn({ method: "GET" }).handler(
  async (): Promise<MacroTrendsResult> => {
    const cached = getCached<MacroTrendsResult>(CACHE_TRENDS_KEY, 5 * 60 * 1000);
    if (cached) return cached;

    const AD = "https://api.argentinadatos.com";
    const BCRA = "https://api.estadisticasbcra.com";

    const [rpHistorico, inflacionArr, inflacionInteranualArr, reservasArr, badlarArr, tm20Arr] =
      await Promise.all([
        fetchJson<ArgentinaDatosItem[]>(`${AD}/v1/finanzas/indices/riesgo-pais`),
        fetchJson<ArgentinaDatosItem[]>(`${AD}/v1/finanzas/indices/inflacion`),
        fetchJson<ArgentinaDatosItem[]>(`${AD}/v1/finanzas/indices/inflacionInteranual`),
        fetchJson<BcraItem[]>(`${BCRA}/reservas`, 8000, true),
        fetchJson<BcraItem[]>(`${BCRA}/badlar`, 8000, true),
        fetchJson<BcraItem[]>(`${BCRA}/tm20`, 8000, true),
      ]);

    const riesgoPais: MacroTrendPoint[] = (rpHistorico ?? [])
      .filter((d) => d.valor != null && d.fecha != null)
      .map((d) => ({ fecha: d.fecha, valor: d.valor }));

    const reservas: MacroTrendPoint[] = (reservasArr ?? [])
      .filter((d) => d.v != null && d.d != null)
      .map((d) => ({ fecha: d.d, valor: d.v / 1000 }));

    const badlarSerie: MacroTrendPoint[] = (badlarArr ?? [])
      .filter((d) => d.v != null && d.d != null)
      .map((d) => ({ fecha: d.d, valor: d.v }));

    const tm20Serie: MacroTrendPoint[] = (tm20Arr ?? [])
      .filter((d) => d.v != null && d.d != null)
      .map((d) => ({ fecha: d.d, valor: d.v }));

    const riesgoPaisVar = calcularVariaciones(riesgoPais);
    const reservasVar = calcularVariaciones(reservas);
    const badlarVar = calcularVariaciones(badlarSerie);
    const tm20Var = calcularVariaciones(tm20Serie);

    const inflacionHistorico: MacroTrendPoint[] = (inflacionArr ?? [])
      .filter((d) => d.valor != null && d.fecha != null)
      .map((d) => ({ fecha: d.fecha, valor: d.valor }));

    const mensual =
      inflacionHistorico.length > 0
        ? inflacionHistorico[inflacionHistorico.length - 1].valor
        : null;

    const interanual =
      Array.isArray(inflacionInteranualArr) && inflacionInteranualArr.length > 0
        ? (inflacionInteranualArr[inflacionInteranualArr.length - 1]?.valor ?? null)
        : null;

    let acumuladaAnual: number | null = null;
    if (inflacionHistorico.length > 0) {
      const currentYear = new Date().getFullYear().toString();
      const yearData = inflacionHistorico.filter((d) => d.fecha.startsWith(currentYear));
      if (yearData.length > 0) {
        acumuladaAnual = yearData.reduce((acc, d) => acc * (1 + d.valor / 100), 1) - 1;
        acumuladaAnual = Math.round(acumuladaAnual * 10000) / 100;
      }
    }

    const aceleracion =
      inflacionHistorico.length >= 2
        ? Math.round(
            (inflacionHistorico[inflacionHistorico.length - 1].valor -
              inflacionHistorico[inflacionHistorico.length - 2].valor) *
              100,
          ) / 100
        : null;

    const badlar =
      Array.isArray(badlarArr) && badlarArr.length > 0
        ? (badlarArr[badlarArr.length - 1]?.v ?? null)
        : null;

    const tm20 =
      Array.isArray(tm20Arr) && tm20Arr.length > 0
        ? (tm20Arr[tm20Arr.length - 1]?.v ?? null)
        : null;

    // Tipo de cambio histórico
    const dolarCache = getCached<TipoCambioSerie>(CACHE_DOLAR_KEY, 60 * 60 * 1000);
    let tiposCambio: TipoCambioSerie;
    if (dolarCache) {
      tiposCambio = dolarCache;
    } else {
      const [tcOficialArr, tcMepArr, tcCclArr] = await Promise.all([
        fetchJson<DolarItem[]>(`${AD}/v1/cotizaciones/dolares/oficial`),
        fetchJson<DolarItem[]>(`${AD}/v1/cotizaciones/dolares/mep`),
        fetchJson<DolarItem[]>(`${AD}/v1/cotizaciones/dolares/ccl`),
      ]);

      const toSerie = (arr: DolarItem[] | null): MacroTrendPoint[] =>
        (arr ?? [])
          .filter((d) => d.venta != null && d.fecha != null)
          .map((d) => ({ fecha: d.fecha, valor: d.venta }));

      tiposCambio = {
        oficial: calcularVariaciones(toSerie(tcOficialArr)),
        mep: calcularVariaciones(toSerie(tcMepArr)),
        ccl: calcularVariaciones(toSerie(tcCclArr)),
      };
      setCache(CACHE_DOLAR_KEY, tiposCambio);
    }

    const result: MacroTrendsResult = {
      riesgoPais,
      reservas,
      inflacion: {
        mensual,
        interanual,
        acumuladaAnual,
        aceleracion,
        historico: inflacionHistorico,
      },
      tasas: {
        badlar,
        tm20,
        badlarSerie,
        tm20Serie,
      },
      tiposCambio,
      variaciones: {
        riesgoPais: riesgoPaisVar,
        reservas: reservasVar,
        badlar: badlarVar,
        tm20: tm20Var,
      },
      timestamp: new Date().toISOString(),
    };

    setCache(CACHE_TRENDS_KEY, result);
    return result;
  },
);
