// @ts-nocheck
/**
 * Unified cache for historical price data.
 * - In-memory L1 cache (instant)
 * - Supabase L2 persistence (survives restarts)
 * - Incremental updates: only fetches missing date ranges
 * - Shared across all functions via getHistory / getHistories
 */

import { supabase } from "./supabase-stub";

//  Types 

interface HistoryPayload {
  data: { date: string; close: number }[];
  lastDate: string | null;
  lastUpdated: string; // ISO timestamp
}

//  Yahoo Finance singleton 

let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try {
    _yf = typeof YF === "function" ? new YF() : YF;
  } catch {
    _yf = YF;
  }
  try {
    _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
  } catch {}
  return _yf;
}

//  In-memory cache (L1) 

const memCache = new Map<string, { payload: HistoryPayload; expiresAt: number }>();
const MEM_TTL_MS = 5 * 60 * 1000; // 5 min in-memory before re-checking Supabase

//  Supabase helpers (L2) 

const CACHE_TTL_SECONDS = 30 * 86400; // 30 days — historical data rarely changes

function cacheKey(ticker: string, days: number): string {
  return `history:${ticker}:${days}d`;
}

async function supabaseGet(key: string): Promise<HistoryPayload | null> {
  if (!supabase || typeof supabase.from !== "function") return null;
  try {
    const { data, error } = await supabase
      .from("api_cache")
      .select("payload")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    return data.payload as unknown as HistoryPayload;
  } catch {
    return null;
  }
}

async function supabaseSet(key: string, payload: HistoryPayload): Promise<void> {
  if (!supabase || typeof supabase.from !== "function") return;
  try {
    await supabase.from("api_cache").upsert(
      {
        cache_key: key,
        fuente: "yahoo",
        payload,
        fetched_at: new Date().toISOString(),
        ttl_seconds: CACHE_TTL_SECONDS,
      },
      { onConflict: "cache_key" },
    );
  } catch {
    // silent
  }
}

//  Incremental fetch from Yahoo 

async function fetchRange(
  ticker: string,
  period1: Date,
  period2: Date,
): Promise<{ date: string; close: number }[]> {
  const yf = await getYF();
  try {
    const rows = await yf.chart(ticker, { period1, period2, interval: "1d" });
    return (rows?.quotes ?? [])
      .filter((q: any) => q.date != null && q.close != null)
      .map((q: any) => ({ date: q.date.toISOString().slice(0, 10), close: q.close as number }));
  } catch {
    return [];
  }
}

async function fetchFullHistory(ticker: string, days: number): Promise<HistoryPayload> {
  const period2 = new Date();
  const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const data = await fetchRange(ticker, period1, period2);
  if (data.length === 0) {
    return { data: [], lastDate: null, lastUpdated: new Date().toISOString() };
  }
  data.sort((a, b) => a.date.localeCompare(b.date));
  return {
    data,
    lastDate: data[data.length - 1].date,
    lastUpdated: new Date().toISOString(),
  };
}

//  Public API 

/**
 * Get historical daily closes for a ticker.
 * - Returns cached data when available and fresh enough
 * - Only fetches missing days from Yahoo (incremental)
 * - Persists to Supabase for cross-session reuse
 */
export async function getHistory(
  ticker: string,
  days: number = 365,
): Promise<{ date: string; close: number }[]> {
  const key = cacheKey(ticker, days);

  // 1. Check in-memory cache (L1)
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.payload.data;
  }

  // 2. Check Supabase (L2)
  const supabaseHit = await supabaseGet(key);

  if (supabaseHit && supabaseHit.data.length > 0) {
    const neededPoints = Math.ceil(days * 0.5);
    const hasEnoughData = supabaseHit.data.length >= neededPoints;

    if (hasEnoughData) {
      // Check if incremental update is needed
      const lastDate = supabaseHit.lastDate;
      const today = new Date().toISOString().slice(0, 10);

      if (lastDate && lastDate < today) {
        const lastDt = new Date(lastDate);
        const diffDays = Math.floor((Date.now() - lastDt.getTime()) / 86400000);
        if (diffDays > 1) {
          // Fetch only the missing range
          const newData = await fetchRange(ticker, lastDt, new Date());
          if (newData.length > 0) {
            const existingDates = new Set(supabaseHit.data.map((d) => d.date));
            for (const entry of newData) {
              if (!existingDates.has(entry.date)) {
                supabaseHit.data.push(entry);
              }
            }
            supabaseHit.data.sort((a, b) => a.date.localeCompare(b.date));
            supabaseHit.lastDate = supabaseHit.data[supabaseHit.data.length - 1].date;
            supabaseHit.lastUpdated = new Date().toISOString();
            // Persist back to Supabase (fire & forget)
            supabaseSet(key, supabaseHit);
          }
        }
      }
    }

    // Update in-memory
    memCache.set(key, { payload: supabaseHit, expiresAt: Date.now() + MEM_TTL_MS });
    return supabaseHit.data;
  }

  // 3. Full fetch
  const fresh = await fetchFullHistory(ticker, days);
  if (fresh.data.length > 0) {
    memCache.set(key, { payload: fresh, expiresAt: Date.now() + MEM_TTL_MS });
    supabaseSet(key, fresh);
  }
  return fresh.data;
}

/**
 * Fetch history for multiple tickers in parallel (batched).
 * Each ticker uses its own cache entry.
 */
export async function getHistories(
  tickers: string[],
  days: number = 365,
): Promise<Record<string, { date: string; close: number }[]>> {
  const unique = [...new Set(tickers)];
  const results: Record<string, { date: string; close: number }[]> = {};
  const BATCH_SIZE = 10;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const entries = await Promise.all(
      batch.map(async (t) => {
        const data = await getHistory(t, days);
        return [t, data] as const;
      }),
    );
    for (const [t, data] of entries) {
      results[t] = data;
    }
  }
  return results;
}

//  Quote cache (live prices, short TTL) 

const QUOTE_TTL_MS = 5 * 60 * 1000;
const _quoteCache = new Map<string, { data: any; timestamp: number }>();

export async function getQuote(ticker: string): Promise<any> {
  const cached = _quoteCache.get(ticker);
  if (cached && Date.now() - cached.timestamp < QUOTE_TTL_MS) {
    return cached.data;
  }
  const yf = await getYF();
  try {
    const quote = await yf.quote(ticker);
    if (quote) {
      _quoteCache.set(ticker, { data: quote, timestamp: Date.now() });
    }
    return quote;
  } catch {
    return cached?.data ?? null;
  }
}

export async function getQuotes(tickers: string[]): Promise<Record<string, any>> {
  const unique = [...new Set(tickers)];
  const results: Record<string, any> = {};
  const BATCH_SIZE = 10;
  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const batch = unique.slice(i, i + BATCH_SIZE);
    const entries = await Promise.all(
      batch.map(async (t) => {
        const data = await getQuote(t);
        return [t, data] as const;
      }),
    );
    for (const [t, data] of entries) results[t] = data;
  }
  return results;
}
