/**
 * Cache server-side para datos fundamentales (FundamentalAFResult)
 * - In-memory L1 cache (instant, TTL 5 min)
 * - Supabase L2 persistence (survives restarts, TTL 24h)
 * - Permite reutilizar datos entre sesiones sin pegar a Yahoo en cada navegación
 */

import { supabase } from "@/lib/supabase";
import type { FundamentalAFResult } from "./fundamental-af.functions";

// ── Types ────────────────────────────────────────────────────────────

interface FundamentalPayload {
  data: FundamentalAFResult;
  lastUpdated: string; // ISO timestamp
}

// ── In-memory cache (L1) ─────────────────────────────────────────────

const memCache = new Map<string, { payload: FundamentalPayload; expiresAt: number }>();
const MEM_TTL_MS = 5 * 60 * 1000; // 5 min in-memory before re-checking Supabase

// ── Supabase helpers (L2) ────────────────────────────────────────────

const CACHE_TTL_SECONDS = 24 * 3600; // 24 hours — fundamentals change slowly

function cacheKey(ticker: string): string {
  return `fundamental:${ticker}`;
}

async function supabaseGet(key: string): Promise<FundamentalPayload | null> {
  if (!supabase || typeof supabase.from !== "function") return null;
  try {
    const { data, error } = await supabase
      .from("api_cache")
      .select("payload")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    return data.payload as unknown as FundamentalPayload;
  } catch {
    return null;
  }
}

async function supabaseSet(key: string, payload: FundamentalPayload): Promise<void> {
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

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get cached fundamental data for a ticker.
 * - Returns cached data when available and fresh enough
 * - Persists new data to Supabase for cross-session reuse
 */
export async function getFundamentalCache(
  ticker: string,
): Promise<FundamentalAFResult | null> {
  const key = cacheKey(ticker);

  // 1. Check in-memory cache (L1)
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    return mem.payload.data;
  }

  // 2. Check Supabase (L2)
  const supabaseHit = await supabaseGet(key);
  if (supabaseHit) {
    // Update in-memory
    memCache.set(key, { payload: supabaseHit, expiresAt: Date.now() + MEM_TTL_MS });
    return supabaseHit.data;
  }

  return null;
}

/**
 * Save fundamental data to cache (both L1 and L2).
 */
export async function setFundamentalCache(
  ticker: string,
  data: FundamentalAFResult,
): Promise<void> {
  const key = cacheKey(ticker);
  const payload: FundamentalPayload = {
    data,
    lastUpdated: new Date().toISOString(),
  };

  // Update in-memory
  memCache.set(key, { payload, expiresAt: Date.now() + MEM_TTL_MS });

  // Persist to Supabase (fire & forget)
  supabaseSet(key, payload);
}

/**
 * Clear cache for a specific ticker (useful for manual refresh).
 */
export async function clearFundamentalCache(ticker: string): Promise<void> {
  const key = cacheKey(ticker);
  memCache.delete(key);
  if (supabase && typeof supabase.from === "function") {
    try {
      await supabase.from("api_cache").delete().eq("cache_key", key);
    } catch {
      // silent
    }
  }
}
