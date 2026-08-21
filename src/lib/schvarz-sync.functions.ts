// @ts-nocheck
// src/lib/schvarz-sync.functions.ts
// Sincronización incremental del universo Schvarz.
//
// Cumple los requisitos de diseño:
//   - UNA única sincronización en simultáneo por lotes (semáforo chunks de 20,
//     fundamentales chunks de 50) lanzadas en paralelo.
//   - Almacena TODO el histórico (serie diaria) en cache / Supabase.
//   - Solo actualiza los datos NO OB TENIDOS o vencidos a partir del último
//     guardado (TTL por fuente).
//   - Guarda de nuevo cada resultado (memoria + Supabase).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSemaforoBatch, type SemaforoResult } from "./finance.functions";
import { fetchFundamentalAFBatch, type FundamentalAFResult } from "./fundamental-af.functions";
import { getTickersSchvarz, getUniversoSchvarz } from "./schvarz-universo";
import {
  guardarFundamental,
  guardarHistorico,
  guardarSemaforo,
  leerCacheSchvarz,
  type DatosCacheSchvarz,
  type PuntoHistorico,
} from "./schvarz-store.server";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Extrae la serie histórica diaria de un resultado de semáforo. */
function historyFromSemaforo(sem: SemaforoResult): PuntoHistorico[] {
  return (sem.history ?? []).map((h) => ({ date: h.date, close: h.close }));
}

export interface SyncSchvarzResult {
  ok: boolean;
  totalTicketers: number;
  semaforoObtenidos: number;
  semaforoPendientes: number;
  fundamentalObtenidos: number;
  fundamentalPendientes: number;
  errores: number;
  lastUpdated: string;
  datos: DatosCacheSchvarz;
  universo: {
    ticker: string;
    sector: string;
    industria: string;
    tipo: string;
    moneda: string;
    mercado: string;
    pais: string;
  }[];
}

/**
 * Sincroniza el universo Schvarz completo:
 * 1. Leer caché (memoria + Supabase) → conocer solo lo vencido/faltante.
 * 2. Fetch en lotes paralelos (semáforo 20, fundamentales 50) — una sola pasada.
 * 3. Guardar de nuevo todo lo obtenido + fusión de histórico diario.
 */
export async function sincronizarUniversoSchvarz(): Promise<SyncSchvarzResult> {
  const tickers = getTickersSchvarz();

  const lectura = await leerCacheSchvarz(tickers);
  const { datos } = lectura;

  let errores = 0;
  const semaforoObtenidos: SemaforoResult[] = [];
  const fundamentalObtenidos: FundamentalAFResult[] = [];

  // ── Paso 2: lote en paralelo de semáforos (chunks de 20) ─────────────
  if (lectura.semaforoPendientes.length > 0) {
    const chunksSem = chunk(lectura.semaforoPendientes, 20);
    const resSem = await Promise.allSettled(
      chunksSem.map((tickersChunk) =>
        getSemaforoBatch({ data: { tickers: tickersChunk, rango: "2A" } }),
      ),
    );
    for (const r of resSem) {
      if (r.status === "fulfilled") semaforoObtenidos.push(...r.value);
      else errores++;
    }
  }

  // ── Paso 3: lote en paralelo de fundamentales (chunks de 50) ─────────
  // Concurrencia acotada para no saturar Yahoo: 3 llamadas por turno.
  if (lectura.fundamentalPendientes.length > 0) {
    const chunksFund = chunk(lectura.fundamentalPendientes, 50);
    const CONCURRENTES = 3;
    for (let i = 0; i < chunksFund.length; i += CONCURRENTES) {
      const turno = chunksFund.slice(i, i + CONCURRENTES);
      const resFund = await Promise.allSettled(
        turno.map((chunkSym) =>
          fetchFundamentalAFBatch({ data: { symbols: chunkSym, batchSize: 4 } }),
        ),
      );
      for (const r of resFund) {
        if (r.status === "fulfilled") fundamentalObtenidos.push(...r.value);
        else errores++;
      }
    }
  }

  // ── Paso 4: guardar de nuevo todo lo obtenido ────────────────────────
  await Promise.all(
    semaforoObtenidos.map(async (sem) => {
      datos.semaforos.set(sem.ticker.toUpperCase(), sem);
      await guardarSemaforo(sem.ticker, sem);
      const hist = historyFromSemaforo(sem);
      if (hist.length > 0) {
        const prev = datos.historicos.get(sem.ticker.toUpperCase()) ?? [];
        datos.historicos.set(sem.ticker.toUpperCase(), prev);
        await guardarHistorico(sem.ticker, hist);
      }
    }),
  );

  await Promise.all(
    fundamentalObtenidos.map(async (f) => {
      if (!f.symbol) return;
      datos.fundamentales.set(f.symbol.toUpperCase(), f);
      await guardarFundamental(f.symbol, f);
    }),
  );

  return {
    ok: true,
    totalTicketers: tickers.length,
    semaforoObtenidos: semaforoObtenidos.length,
    semaforoPendientes: lectura.semaforoPendientes.length,
    fundamentalObtenidos: fundamentalObtenidos.length,
    fundamentalPendientes: lectura.fundamentalPendientes.length,
    errores,
    lastUpdated: new Date().toISOString(),
    datos,
    universo: getUniversoSchvarz().map((a) => ({
      ticker: a.ticker,
      sector: a.sector,
      industria: a.industria,
      tipo: a.tipo,
      moneda: a.moneda,
      mercado: a.mercado,
      pais: a.pais,
    })),
  };
}

/** Server function para invocar la sincronización on-demand (UI / cron). */
export const sincronizarUniversoSchvarzFn = createServerFn({ method: "POST" })
  .inputValidator((d: { forceAll?: boolean }) =>
    z.object({ forceAll: z.boolean().optional().default(false) }).parse(d),
  )
  .handler(async (): Promise<SyncSchvarzResult> => {
    return sincronizarUniversoSchvarz();
  });
