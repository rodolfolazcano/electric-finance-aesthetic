// Datos oficiales del INDEC via API de series de tiempo de datos.gob.ar.
//
//   GET https://apis.datos.gob.ar/series/api/series/?ids=<series>&last=N
//
// Series usadas (catalogo SSPM, fuente INDEC, verificadas 2026-08):
//   - EMAE nivel original mensual:      143.3_NO_PR_2004_A_21
//   - EMAE variacion % interanual:      143.3_ICE_SERVIA_2004_A_25
//   - Exportaciones totales (M USD):    74.3_IET_0_M_16
//   - Importaciones totales (M USD):    74.3_IIT_0_M_25
//   - Saldo comercial (M USD):          74.3_ISC_0_M_19
//
// Todas las funciones son tolerantes a fallo: devuelven null si la API
// no responde, para que el informe salga igual con el resto de los datos.

import { getCached, setCache } from "../cache";

export interface IndecEmae {
  indice: number;
  varMensualPct: number;
  varInteranualPct: number;
  fechaDato: string; // "2026-06"
}

export interface IndecComercioExterior {
  exportacionesUSD: number;
  importacionesUSD: number;
  saldoUSD: number;
  varExportacionesInteranualPct: number;
  varImportacionesInteranualPct: number;
  saldoAcumuladoAnioUSD: number;
  fechaDato: string; // "2026-07"
}

export interface IndecDatos {
  emae: IndecEmae | null;
  comercioExterior: IndecComercioExterior | null;
}

const BASE = "https://apis.datos.gob.ar/series/api/series";
const CACHE_KEY = "indec-datos";
const CACHE_TTL = 60 * 60 * 1000; // 1 h — son series mensuales

const SERIE_EMAE = "143.3_NO_PR_2004_A_21";
const SERIE_EMAE_IA = "143.3_ICE_SERVIA_2004_A_25";
const SERIE_EXPO = "74.3_IET_0_M_16";
const SERIE_IMPO = "74.3_IIT_0_M_25";
const SERIE_SALDO = "74.3_ISC_0_M_19";

interface SerieRespuesta {
  data: [string, ...(number | null)[]][];
  meta?: unknown[];
}

async function fetchSeries(ids: string[], last = 14): Promise<SerieRespuesta | null> {
  try {
    const url = `${BASE}/?ids=${ids.join(",")}&last=${last}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as SerieRespuesta;
  } catch {
    return null;
  }
}

function col(resp: SerieRespuesta, idx: number): { fecha: string; valor: number }[] {
  const out: { fecha: string; valor: number }[] = [];
  for (const fila of resp.data ?? []) {
    const v = fila[idx + 1];
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push({ fecha: String(fila[0]), valor: v });
    }
  }
  return out;
}

function pct(actual: number, previo: number): number | null {
  if (!previo) return null;
  return +(((actual - previo) / Math.abs(previo)) * 100).toFixed(1);
}

function mesDeFecha(fechaISO: string): string {
  return fechaISO.slice(0, 7); // "2026-06-01" -> "2026-06"
}

async function fetchEmae(): Promise<IndecEmae | null> {
  const resp = await fetchSeries([SERIE_EMAE, SERIE_EMAE_IA], 14);
  if (!resp?.data?.length) return null;

  const nivel = col(resp, 0);
  const ia = col(resp, 1);
  if (nivel.length < 2) return null;

  const actual = nivel[nivel.length - 1];
  const anterior = nivel[nivel.length - 2];
  const varMensual = pct(actual.valor, anterior.valor);
  const varInteranualSerie = ia.length ? ia[ia.length - 1].valor : null;

  return {
    indice: +actual.valor.toFixed(1),
    varMensualPct: varMensual ?? 0,
    varInteranualPct:
      varInteranualSerie != null ? +(varInteranualSerie as number).toFixed(1) : (varMensual ?? 0),
    fechaDato: mesDeFecha(actual.fecha),
  };
}

async function fetchComercioExterior(): Promise<IndecComercioExterior | null> {
  const resp = await fetchSeries([SERIE_EXPO, SERIE_IMPO, SERIE_SALDO], 13);
  if (!resp?.data?.length) return null;

  const expo = col(resp, 0);
  const impo = col(resp, 1);
  const saldo = col(resp, 2);
  if (expo.length < 2 || impo.length < 2 || saldo.length < 2) return null;

  const e = expo[expo.length - 1];
  const i = impo[impo.length - 1];
  const s = saldo[saldo.length - 1];

  const doceAtras = (arr: { fecha: string; valor: number }[]) => {
    for (let k = arr.length - 2; k >= 0; k--) {
      if (mesesEntre(arr[k].fecha, arr[arr.length - 1].fecha) === 12) return arr[k].valor;
    }
    return null;
  };

  const expoPrev = doceAtras(expo);
  const impoPrev = doceAtras(impo);

  const acumulado = saldo
    .filter((p) => p.fecha.slice(0, 4) === s.fecha.slice(0, 4))
    .reduce((acc, p) => acc + p.valor, 0);

  return {
    exportacionesUSD: Math.round(e.valor),
    importacionesUSD: Math.round(i.valor),
    saldoUSD: Math.round(s.valor),
    varExportacionesInteranualPct: expoPrev != null ? (pct(e.valor, expoPrev) ?? 0) : 0,
    varImportacionesInteranualPct: impoPrev != null ? (pct(i.valor, impoPrev) ?? 0) : 0,
    saldoAcumuladoAnioUSD: Math.round(acumulado),
    fechaDato: mesDeFecha(s.fecha),
  };
}

function mesesEntre(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth());
}

/** Punto de entrada: EMAE + intercambio comercial en una sola llamada cacheada. */
export async function getIndecDatos(): Promise<IndecDatos> {
  const cached = getCached<IndecDatos>(CACHE_KEY, CACHE_TTL);
  if (cached) return cached;

  const [emae, comercioExterior] = await Promise.allSettled([fetchEmae(), fetchComercioExterior()]);

  const datos: IndecDatos = {
    emae: emae.status === "fulfilled" ? emae.value : null,
    comercioExterior: comercioExterior.status === "fulfilled" ? comercioExterior.value : null,
  };
  if (datos.emae || datos.comercioExterior) setCache(CACHE_KEY, datos);
  return datos;
}
