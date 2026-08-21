// src/lib/schvarz-store.server.ts
// Almacén persistente (memoria + Supabase api_cache) para el motor Schvarz.
//
// Diseño (requisitos):
//   - Una única sincronización en paralelo por lotes (semaforo: chunks de 20,
//     fundamentales: chunks de 50).
//   - Almacena TODO el histórico (serie de cierres diarios por ticker) en cache
//     o Supabase.
//   - Incremental: solo actualiza los datos no obtenidos / vencidos a partir del
//     último guardado (TTL por fuente), evitando re-fetch masivo.
//   - Guarda de nuevo cada resultado obtenido (memoria + persistencia L2).

import { supabase } from "@/lib/supabase";
import type { SemaforoResult } from "./finance.functions";
import type { FundamentalAFResult } from "./fundamental-af.functions";

//  TTL por fuente 

export const SCHVARZ_TTL = {
  semaforoMs: 15 * 60 * 1000, // 15 min (acorde al refetch del tab)
  semaforoSeconds: 15 * 60,
  fundamentalMs: 24 * 60 * 60 * 1000, // 24 h — fundamentales cambian lento
  fundamentalSeconds: 24 * 60 * 60,
  historicoSeconds: 30 * 24 * 60 * 60, // 30 días — serie histórica
} as const;

export interface PuntoHistorico {
  date: string;
  close: number;
}

export interface DatosCacheSchvarz {
  semaforos: Map<string, SemaforoResult>;
  fundamentales: Map<string, FundamentalAFResult>;
  historicos: Map<string, PuntoHistorico[]>;
}

interface CacheEntrada {
  payload: unknown;
  fetchedAt: number; // ms epoch
}

//  Capa 1: memoria 

const memCache = new Map<string, CacheEntrada>();
const MEM_TTL_MS = 60 * 1000; // 1 min antes de re-verificar Supabase

function keySemaforo(t: string): string {
  return `schvarz:semaforo:${t.toUpperCase()}`;
}
function keyFundamental(t: string): string {
  return `schvarz:fundamental:${t.toUpperCase()}`;
}
function keyHistorico(t: string): string {
  return `schvarz:historico:${t.toUpperCase()}`;
}

//  Capa 2: Supabase (api_cache) 

interface SupabaseRow {
  cache_key: string;
  payload: unknown;
  fetched_at: string;
  ttl_seconds: number;
}

async function supabaseReadMany(keys: string[]): Promise<Map<string, SupabaseRow>> {
  const out = new Map<string, SupabaseRow>();
  if (!supabase || typeof supabase.from !== "function" || keys.length === 0) return out;
  try {
    // Lectura en un solo round-trip
    const { data, error } = await supabase
      .from("api_cache")
      .select("cache_key, payload, fetched_at, ttl_seconds")
      .in("cache_key", keys);
    if (error || !data) return out;
    for (const row of data as SupabaseRow[]) out.set(row.cache_key, row);
  } catch {
    // fallback silencioso
  }
  return out;
}

async function supabaseWrite(
  key: string,
  source: string,
  ttlSeconds: number,
  payload: unknown,
): Promise<void> {
  if (!supabase || typeof supabase.from !== "function") return;
  try {
    await supabase.from("api_cache").upsert(
      {
        cache_key: key,
        fuente: source,
        payload,
        fetched_at: new Date().toISOString(),
        ttl_seconds: ttlSeconds,
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // silencioso — no debe tumbar la sincronización
  }
}

//  Helpers de lectura/escritura por capa 

function memGet<T>(key: string): T | null {
  const e = memCache.get(key);
  if (e && Date.now() - e.fetchedAt < MEM_TTL_MS) return e.payload as T;
  return null;
}

function memSet(key: string, payload: unknown): void {
  memCache.set(key, { payload, fetchedAt: Date.now() });
}

function isFreshFromRow(row: SupabaseRow, ttlMs: number): boolean {
  return Date.now() - new Date(row.fetched_at).getTime() < ttlMs;
}

//  Lectura consolidada por ticker 

interface EstadoTicker {
  ticker: string;
  semaforo?: SemaforoResult;
  fundamental?: FundamentalAFResult;
  historico?: PuntoHistorico[];
  /** true si el semaforo está vencido o ausente */
  necesitaSemaforo: boolean;
  /** true si los fundamentales están vencidos o ausentes */
  necesitaFundamental: boolean;
}

export interface LecturaSchvarz {
  datos: DatosCacheSchvarz;
  semaforoPendientes: string[];
  fundamentalPendientes: string[];
}

/** Lee cache (L1 memoria → L2 Supabase) y marca cuáles tickers faltan/vencieron. */
export async function leerCacheSchvarz(tickers: string[]): Promise<LecturaSchvarz> {
  const datos: DatosCacheSchvarz = {
    semaforos: new Map(),
    fundamentales: new Map(),
    historicos: new Map(),
  };

  const pendSem = new Set<string>();
  const pendFund = new Set<string>();

  // 1. Memoria (instantánea)
  for (const t of tickers) {
    const tk = t.toUpperCase();
    const sem = memGet<SemaforoResult>(keySemaforo(tk));
    if (sem) datos.semaforos.set(tk, sem);
    else pendSem.add(tk);

    const fund = memGet<FundamentalAFResult>(keyFundamental(tk));
    if (fund) datos.fundamentales.set(tk, fund);
    else pendFund.add(tk);

    const hist = memGet<PuntoHistorico[]>(keyHistorico(tk));
    if (hist) datos.historicos.set(tk, hist);
  }

  // 2. Persistencia L2 solo para los faltantes en memoria
  const faltanSem = [...pendSem];
  const faltanFund = [...pendFund];
  const faltanHist = tickers.filter((t) => !datos.historicos.has(t.toUpperCase()));

  const rowsSem =
    faltanSem.length > 0 ? await supabaseReadMany(faltanSem.map(keySemaforo)) : new Map();
  const rowsFund =
    faltanFund.length > 0 ? await supabaseReadMany(faltanFund.map(keyFundamental)) : new Map();
  const rowsHist =
    faltanHist.length > 0 ? await supabaseReadMany(faltanHist.map(keyHistorico)) : new Map();

  for (const t of faltanSem) {
    const tk = t.toUpperCase();
    const row = rowsSem.get(keySemaforo(tk));
    if (row && isFreshFromRow(row, SCHVARZ_TTL.semaforoMs) && row.payload) {
      const payload =
        (row.payload as { data?: SemaforoResult; result?: SemaforoResult }).data ??
        (row.payload as { result?: SemaforoResult }).result ??
        (row.payload as SemaforoResult);
      const sem = (payload as SemaforoResult)?.ticker ? (payload as SemaforoResult) : undefined;
      if (sem) {
        datos.semaforos.set(tk, sem);
        memSet(keySemaforo(tk), sem);
        pendSem.delete(tk);
      }
    }
  }

  for (const t of faltanFund) {
    const tk = t.toUpperCase();
    const row = rowsFund.get(keyFundamental(tk));
    if (row && isFreshFromRow(row, SCHVARZ_TTL.fundamentalMs) && row.payload) {
      const fund = (row.payload as { data?: FundamentalAFResult }).data ?? row.payload;
      const f = fund as FundamentalAFResult;
      if (f && (f.symbol || f.error)) {
        datos.fundamentales.set(tk, f);
        memSet(keyFundamental(tk), f);
        pendFund.delete(tk);
      }
    }
  }

  for (const t of faltanHist) {
    const tk = t.toUpperCase();
    const row = rowsHist.get(keyHistorico(tk));
    if (row && row.payload) {
      const points =
        (row.payload as { points?: PuntoHistorico[] }).points ?? (row.payload as PuntoHistorico[]);
      if (Array.isArray(points) && points.length > 0) {
        datos.historicos.set(tk, points);
        memSet(keyHistorico(tk), points);
      }
    }
  }

  return {
    datos,
    semaforoPendientes: [...pendSem],
    fundamentalPendientes: [...pendFund],
  };
}

//  Guardado (memoria + Supabase) 

export async function guardarSemaforo(ticker: string, sem: SemaforoResult): Promise<void> {
  const tk = ticker.toUpperCase();
  memSet(keySemaforo(tk), sem);
  await supabaseWrite(keySemaforo(tk), "yahoo", SCHVARZ_TTL.semaforoSeconds, { data: sem });
}

export async function guardarFundamental(ticker: string, fund: FundamentalAFResult): Promise<void> {
  const tk = ticker.toUpperCase();
  memSet(keyFundamental(tk), fund);
  await supabaseWrite(keyFundamental(tk), "yahoo", SCHVARZ_TTL.fundamentalSeconds, { data: fund });
}

/** Fusiona los puntos históricos nuevos con los guardados (sin duplicados). */
export async function guardarHistorico(ticker: string, points: PuntoHistorico[]): Promise<void> {
  const tk = ticker.toUpperCase();
  const key = keyHistorico(tk);
  const previos = memGet<PuntoHistorico[]>(key) ?? [];

  const mapa = new Map<string, number>();
  for (const p of [...previos, ...points])
    if (p?.date && Number.isFinite(p.close)) mapa.set(p.date, p.close);
  const fusion = [...mapa.entries()]
    .map(([date, close]) => ({ date, close }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const recorte = fusion.slice(-800); // ventana razonable de serie

  memSet(key, recorte);
  await supabaseWrite(key, "yahoo", SCHVARZ_TTL.historicoSeconds, { points: recorte });
}
