// @ts-nocheck
import { supabase } from "../supabase-stub";
import type { FuenteAPI } from "./types";

// ── In-memory fallback cache (siempre disponible, sin dependencias externas) ──
const memCache = new Map<string, { payload: unknown; expiresAt: number }>();
const MEM_CLEANUP_INTERVAL = 60_000; // cada 60s limpia entradas vencidas

// Cleanup cada 60s para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of memCache) {
    if (v.expiresAt < now) memCache.delete(k);
  }
}, MEM_CLEANUP_INTERVAL).unref?.();

async function supabaseGet<T>(key: string): Promise<{ payload: T; ttlSeconds: number } | null> {
  if (!supabase || typeof supabase.from !== "function") return null;
  try {
    const { data, error } = await supabase
      .from("api_cache")
      .select("payload, fetched_at, ttl_seconds")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    const elapsed = (Date.now() - new Date(data.fetched_at).getTime()) / 1000;
    if (elapsed >= data.ttl_seconds) return null; // stale
    return { payload: data.payload as T, ttlSeconds: data.ttl_seconds };
  } catch {
    return null;
  }
}

async function supabaseSet<T>(
  key: string,
  fuente: FuenteAPI,
  ttlSeconds: number,
  payload: T,
): Promise<void> {
  if (!supabase || typeof supabase.from !== "function") return;
  try {
    const { error } = await supabase.from("api_cache").upsert(
      {
        cache_key: key,
        fuente,
        payload,
        fetched_at: new Date().toISOString(),
        ttl_seconds: ttlSeconds,
      },
      { onConflict: "cache_key" },
    );
    if (error) console.error(`[api-cache] upsert error for ${key}:`, error.message);
  } catch (e) {
    console.error(`[api-cache] upsert error for ${key}:`, (e as Error)?.message ?? e);
  }
}

export async function getOrFetch<T>(
  key: string,
  fuente: FuenteAPI,
  ttlSeconds: number,
  fetchFn: () => Promise<T>,
): Promise<T> {
  // 1. Intentar memoria (capa 1 — instantánea)
  const mem = memCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.payload as T;

  // 2. Intentar Supabase (capa 2 — persistente entre reinicios)
  const supabaseHit = await supabaseGet<T>(key);
  if (supabaseHit) {
    // Refrescar memoria con lo que vino de Supabase
    memCache.set(key, { payload: supabaseHit.payload, expiresAt: Date.now() + ttlSeconds * 1000 });
    return supabaseHit.payload;
  }

  // 3. Miss total — ejecutar fetch real
  const fresh = await fetchFn();

  // 4. Guardar en ambas capas
  memCache.set(key, { payload: fresh, expiresAt: Date.now() + ttlSeconds * 1000 });
  supabaseSet(key, fuente, ttlSeconds, fresh); // no await — fire & forget

  return fresh;
}
