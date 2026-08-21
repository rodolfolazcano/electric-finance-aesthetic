// @ts-nocheck
// src/lib/risk-free-rate.ts
// Tasa libre de riesgo dinámica desde APIs reales (server-side).
// USD → Yahoo Finance ^TNX (Treasury 10Y) via server function
// ARS → BCRA BADLAR via server function
// Fallback: 4.5% USD, 30% ARS
// NOTA: Las funciones async deben ser llamadas desde server functions (createServerFn)
//       para evitar CORS. El módulo exporta getters sincrónicos con cache para uso directo.

type RiskFreeCache = { tasa: number; timestamp: number };
let cacheUSD: RiskFreeCache | null = null;
let cacheARS: RiskFreeCache | null = null;
const CACHE_TTL = 3600_000; // 1 hora

async function fetchTreasuryRate(): Promise<number> {
  try {
    const r = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=1mo&interval=1d",
      { cache: "no-store" },
    );
    if (!r.ok) return 0.045;
    const j = await r.json();
    const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((c: number | null) => c != null && c > 0);
    if (valid.length === 0) return 0.045;
    return valid[valid.length - 1] / 100;
  } catch {
    return 0.045;
  }
}

async function fetchBADLARRate(): Promise<number> {
  try {
    const r = await fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7", {
      cache: "no-store",
    });
    if (!r.ok) return 0.3;
    const j = await r.json();
    const results = j?.results ?? [];
    if (results.length === 0) return 0.3;
    const last = results[results.length - 1];
    const detalles = last?.detalle ?? [];
    if (detalles.length === 0) return 0.3;
    return detalles[detalles.length - 1].valor / 100;
  } catch {
    return 0.3;
  }
}

export async function getRiskFreeRateUSD(): Promise<number> {
  if (cacheUSD && Date.now() - cacheUSD.timestamp < CACHE_TTL) {
    return cacheUSD.tasa;
  }
  const tasa = await fetchTreasuryRate();
  cacheUSD = { tasa, timestamp: Date.now() };
  return tasa;
}

export async function getRiskFreeRateARS(): Promise<number> {
  if (cacheARS && Date.now() - cacheARS.timestamp < CACHE_TTL) {
    return cacheARS.tasa;
  }
  const tasa = await fetchBADLARRate();
  cacheARS = { tasa, timestamp: Date.now() };
  return tasa;
}

export async function getRiskFreeRate(currency: "USD" | "ARS" = "USD"): Promise<number> {
  return currency === "ARS" ? getRiskFreeRateARS() : getRiskFreeRateUSD();
}

// Versión sincrónica para módulos donde async no es práctico (ej. optimizer.ts).
// Retorna el valor en caché o el default. Llamar refreshRiskFreeRate() para actualizar.
export function getRiskFreeRateSync(currency: "USD" | "ARS" = "USD"): number {
  const c = currency === "ARS" ? cacheARS : cacheUSD;
  if (c && Date.now() - c.timestamp < CACHE_TTL) return c.tasa;
  return currency === "ARS" ? 0.3 : 0.045;
}

// Inicializa la tasa al importar el módulo en server (fire-and-forget, no bloquea)
// Usamos typeof window === "undefined" para asegurar que SOLO corra server-side
// (Vite polyfillea process en dev, por lo que typeof process !== "undefined" NO es confiable)
if (typeof window === "undefined") {
  getRiskFreeRateUSD().catch(() => {});
  getRiskFreeRateARS().catch(() => {});
}

// Forzar actualización desde server functions (sin CORS)
export async function refreshRiskFreeRate(): Promise<{ usd: number; ars: number }> {
  const [usd, ars] = await Promise.all([getRiskFreeRateUSD(), getRiskFreeRateARS()]);
  return { usd, ars };
}
