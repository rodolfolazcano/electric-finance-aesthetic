/**
 * Cliente HTTP de bajo nivel para Yahoo Finance
 * Maneja sesiones, cookies, crumb, cache, y concurrencia limitada
 */

import { getCached, setCache } from "./cache";

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Pool de User-Agents: Yahoo limita por fingerprint de UA; si uno se quema
 *  (429 persistente), la siguiente sesión rota al siguiente. */
const YAHOO_UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.2903.86",
  YAHOO_UA,
];
let uaRotador = Math.floor(Math.random() * YAHOO_UAS.length);

interface YahooSession {
  cookie: string;
  crumb: string;
  expiresAt: number;
  ua: string;
}

let sessionCache: YahooSession | null = null;
let sessionPromise: Promise<YahooSession | null> | null = null;

// ─── Concurrency limiter (max 3 parallel requests to Yahoo) ─────────
let activeRequests = 0;
const MAX_CONCURRENT = 3;
const pendingQueue: Array<() => void> = [];

async function acquireSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT) {
    activeRequests++;
    return;
  }
  return new Promise<void>((resolve) => {
    pendingQueue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseSlot(): void {
  activeRequests--;
  if (pendingQueue.length > 0) {
    const next = pendingQueue.shift();
    next?.();
  }
}

async function withConcurrencyLimit<T>(fn: () => Promise<T>): Promise<T> {
  await acquireSlot();
  try {
    return await fn();
  } finally {
    releaseSlot();
  }
}

// ─── Cache helpers ──────────────────────────────────────────────────
const YAHOO_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function yahooCacheKey(prefix: string, symbol: string, ...args: string[]): string {
  return `yahoo:${prefix}:${symbol}:${args.join(":")}`;
}

// ─── Session management ─────────────────────────────────────────────
function getSetCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = withGetSetCookie.getSetCookie?.();
  if (setCookies?.length) return setCookies;
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 429) {
        if (attempt < maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          await new Promise((r) => setTimeout(r, delay));
        }
        continue;
      }
      return res;
    } catch {
      if (attempt === maxRetries - 1) return null;
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return null;
}

export async function getYahooSession(forceRefresh = false): Promise<YahooSession | null> {
  const now = Date.now();
  if (!forceRefresh && sessionCache && sessionCache.expiresAt > now) return sessionCache;

  if (sessionPromise) return sessionPromise;

  sessionPromise = getYahooSessionInner();
  try {
    const session = await sessionPromise;
    if (session) sessionCache = session;
    return session;
  } finally {
    sessionPromise = null;
  }
}

async function getYahooSessionInner(): Promise<YahooSession | null> {
  const now = Date.now();
  // UA elegido POR ADQUISICIÓN: cookie+crumb quedan ligados a ese fingerprint.
  // Si un UA está quemado (429), el próximo refresh rota al siguiente.
  const ua = YAHOO_UAS[uaRotador++ % YAHOO_UAS.length]!;

  async function tryCrumb(
    host: string,
    cookieJar: string,
  ): Promise<{ cookie: string; crumb: string } | null> {
    const crumbRes = await fetchWithRetry(`https://${host}/v1/test/getcrumb`, {
      headers: {
        "User-Agent": ua,
        Accept: "text/plain",
        ...(cookieJar ? { Cookie: cookieJar } : {}),
      },
    });
    if (crumbRes && crumbRes.ok) {
      const crumb = (await crumbRes.text()).trim();
      if (crumb && !crumb.startsWith("{")) return { cookie: cookieJar, crumb };
    }
    return null;
  }

  async function tryPage(url: string): Promise<{ cookie: string; crumb: string } | null> {
    const res = await fetchWithRetry(url, {
      headers: {
        "User-Agent": ua,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "manual",
    });
    if (!res || !res.ok) return null;
    const cookie = getSetCookies(res.headers)
      .map((v) => v.split(";")[0])
      .filter(Boolean)
      .join("; ");
    const html = await res.text();
    const m = html.match(/"crumb":"([^"]+)"/);
    if (m && m[1]) return { cookie, crumb: m[1] };
    return tryCrumb("query2.finance.yahoo.com", cookie);
  }

  const r1 = await tryCrumb("query2.finance.yahoo.com", "");
  if (r1) return { ...r1, expiresAt: now + 20 * 60 * 1000, ua };

  const r2 = await tryCrumb("query1.finance.yahoo.com", "");
  if (r2) return { ...r2, expiresAt: now + 20 * 60 * 1000, ua };

  const seed = await fetchWithRetry("https://fc.yahoo.com", {
    headers: { "User-Agent": ua, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "manual",
  });
  if (seed && seed.ok) {
    const cookie = getSetCookies(seed.headers)
      .map((v) => v.split(";")[0])
      .filter(Boolean)
      .join("; ");
    const r3 = await tryCrumb("query2.finance.yahoo.com", cookie);
    if (r3) return { ...r3, expiresAt: now + 20 * 60 * 1000, ua };
  }

  const r4 = await tryPage("https://finance.yahoo.com");
  if (r4) return { ...r4, expiresAt: now + 20 * 60 * 1000, ua };

  const r5 = await tryPage("https://finance.yahoo.com/quote/AAPL");
  if (r5) return { ...r5, expiresAt: now + 20 * 60 * 1000, ua };

  return null;
}

// ─── quoteSummary con cache + rate-limit controlada ─────────────────
async function yahooQuoteSummaryInner<T>(
  symbol: string,
  modules: string[],
  cacheKey: string,
  forceRefresh: boolean,
  attempt: number,
): Promise<{ status: number; json: T | null; errorText: string | null }> {
  const hosts = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
  let lastError: string | null = null;

  for (const host of hosts) {
    for (let retry = 0; retry < 3; retry++) {
      try {
        const session = await getYahooSession(forceRefresh);
        const hasSession = session != null;
        const params = new URLSearchParams({
          modules: modules.join(","),
          corsDomain: "finance.yahoo.com",
          formatted: "false",
          ...(hasSession ? { crumb: session.crumb } : {}),
        });
        const url = `https://${host}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?${params}`;
        const qsController = new AbortController();
        const qsTimeoutId = setTimeout(() => qsController.abort(), 20000);
        const res = await fetch(url, {
          signal: qsController.signal,
          headers: {
            "User-Agent": session?.ua ?? YAHOO_UA,
            Accept: "application/json",
            ...(hasSession && session.cookie ? { Cookie: session.cookie } : {}),
          },
        });
        clearTimeout(qsTimeoutId);
        if (res.status === 401 && !forceRefresh) {
          sessionCache = null;
          return yahooQuoteSummaryInner<T>(symbol, modules, cacheKey, true, attempt);
        }
        if (res.status === 429) {
          const delay = Math.pow(3, retry) * 1000 + Math.random() * 2000;
          await new Promise((r) => setTimeout(r, delay));
          forceRefresh = true;
          continue;
        }
        if (!res.ok) {
          lastError = `Yahoo quoteSummary error: ${res.status}`;
          break;
        }
        const json = (await res.json()) as T;
        const result = { status: res.status, json, errorText: null };
        setCache(cacheKey, result);
        return result;
      } catch (e) {
        lastError = (e as Error).message;
        if (retry < 2) {
          const delay = Math.pow(2, retry) * 1000 + Math.random() * 1000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }

  // All hosts and retries exhausted — return error, DO NOT cache
  return { status: 0, json: null, errorText: lastError ?? "Yahoo quoteSummary error" };
}

export async function fetchYahooQuoteSummaryJson<T>(
  symbol: string,
  modules: string[],
  forceSessionRefresh = false,
  attempt = 0,
): Promise<{ status: number; json: T | null; errorText: string | null }> {
  const cacheKey = yahooCacheKey("qs", symbol, modules.join(","));
  const cached = getCached<{ status: number; json: T | null; errorText: string | null }>(
    cacheKey,
    YAHOO_CACHE_TTL,
  );
  if (cached) return cached;

  return withConcurrencyLimit(() =>
    yahooQuoteSummaryInner<T>(symbol, modules, cacheKey, forceSessionRefresh, attempt),
  );
}

// ─── Chart data con cache + concurrencia ────────────────────────────
async function yahooChartInner(
  symbol: string,
  range: string,
  interval: string,
  cacheKey: string,
  forceRefresh: boolean,
): Promise<any> {
  const session = await getYahooSession(forceRefresh);
  const hosts = ["query1.finance.yahoo.com", "query2.finance.yahoo.com"];
  let lastError: string | null = null;

  for (const host of hosts) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}&crumb=${encodeURIComponent(session?.crumb ?? "")}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": session?.ua ?? YAHOO_UA,
            Accept: "application/json",
            ...(session?.cookie ? { Cookie: session.cookie } : {}),
          },
        });
        clearTimeout(timeoutId);
        if (res.status === 401 && session) {
          sessionCache = null;
          return yahooChartInner(symbol, range, interval, cacheKey, true);
        }
        if (res.status === 429) {
          const delay = Math.pow(3, attempt) * 1000 + Math.random() * 2000;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        if (!res.ok) {
          lastError = `Yahoo chart error: ${res.status}`;
          break;
        }
        const json = await res.json();
        setCache(cacheKey, json);
        return json;
      } catch (e) {
        lastError = (e as Error).message;
        if (attempt < 2) {
          const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
  }
  throw new Error(lastError ?? "Yahoo chart error");
}

export async function fetchYahooChart(
  symbol: string,
  range: string,
  interval = "1d",
): Promise<any> {
  const cacheKey = yahooCacheKey("chart", symbol, range, interval);
  const cached = getCached<any>(cacheKey, YAHOO_CACHE_TTL);
  if (cached) return cached;

  // Capa disco: histórico completo local + merge incremental del delta.
  // Solo para intervalos diarios/semanales/mensuales (no intradía corto).
  const usaDisco = !/^(1m|2m|5m|15m|30m|60m|90m|1h)$/.test(interval) && /^(1d|1wk|1mo)$/.test(interval);
  if (usaDisco) {
    try {
      const { obtenerChartConDisco } = await import("./cache/historico-disco.server");
      const disco = await obtenerChartConDisco(symbol, range, interval, (r, iv) =>
        withConcurrencyLimit(() => yahooChartInner(symbol, r, iv, yahooCacheKey("chart", symbol, r, iv), false)),
      );
      if (disco) {
        setCache(cacheKey, disco);
        return disco;
      }
    } catch {
      // cae al fetch directo
    }
  }

  return withConcurrencyLimit(() => yahooChartInner(symbol, range, interval, cacheKey, false));
}

export function yahooHeaders(): HeadersInit {
  return { "User-Agent": YAHOO_UA, Accept: "application/json" };
}

// ─── Yahoo Finance Search / News ──────────────────────────────────
export interface YahooNewsItem {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  summary: string;
  relatedTickers: string[];
  providerPublishTime: number;
  type: string;
}

export async function fetchYahooSearchNews(query: string, newsCount = 5): Promise<YahooNewsItem[]> {
  const session = await getYahooSession();
  const params = new URLSearchParams({
    q: query,
    newsCount: String(newsCount),
    crumb: session?.crumb ?? "",
    corsDomain: "finance.yahoo.com",
  });
  const url = `https://query1.finance.yahoo.com/v1/finance/search?${params}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": YAHOO_UA,
      Accept: "application/json",
      ...(session?.cookie ? { Cookie: session.cookie } : {}),
    },
  });
  if (res.status === 401 && session) {
    sessionCache = null;
    return fetchYahooSearchNews(query, newsCount);
  }
  if (!res.ok) return [];
  const json = await res.json();
  return (json.news ?? []) as YahooNewsItem[];
}

export const YAHOO_RANGE_MAP = {
  "1M": { range: "1mo", interval: "1d" },
  "3M": { range: "3mo", interval: "1d" },
  "6M": { range: "6mo", interval: "1d" },
  "1A": { range: "1y", interval: "1d" },
  "2A": { range: "2y", interval: "1wk" },
  "5A": { range: "5y", interval: "1wk" },
} as const;

/** Normaliza rangos en español/variantes del usuario a valores Yahoo válidos. */
export function normalizarRangoYahoo(raw: string): string {
  const s = (raw ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
  const map: Record<string, string> = {
    "1 dia": "1d",
    "1d": "1d",
    "1 mes": "1mo",
    "1m": "1mo",
    "1mo": "1mo",
    "3 meses": "3mo",
    "3m": "3mo",
    "3mo": "3mo",
    "6 meses": "6mo",
    "6m": "6mo",
    "6mo": "6mo",
    "1 ano": "1y",
    "1 anio": "1y",
    "1a": "1y",
    "1y": "1y",
    "1ytd": "1y",
    "2 anos": "2y",
    "2 anios": "2y",
    "2a": "2y",
    "2y": "2y",
    "5 anos": "5y",
    "5 anios": "5y",
    "5a": "5y",
    "5y": "5y",
    "max": "max",
    "historico": "max",
    "historico completo": "max",
  };
  if (map[s]) return map[s];
  // Patrones "1 año", "3M", "6M", "1A"
  if (/^1\s*a/.test(s)) return "1y";
  if (/^3\s*m/.test(s)) return "3mo";
  if (/^6\s*m/.test(s)) return "6mo";
  if (/^5\s*a/.test(s)) return "5y";
  if (/^2\s*a/.test(s)) return "2y";
  // Ya es valor Yahoo valido
  if (["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "max"].includes(s)) return s;
  return "1y";
}

async function yahooQuoteInner(
  symbol: string,
  cacheKey: string,
  forceRefresh: boolean,
): Promise<any> {
  const session = await getYahooSession(forceRefresh);
  const params = new URLSearchParams({
    symbols: symbol,
    crumb: session?.crumb ?? "",
    formatted: "false",
    corsDomain: "finance.yahoo.com",
  });
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?${params}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": session?.ua ?? YAHOO_UA,
      Accept: "application/json",
      ...(session?.cookie ? { Cookie: session.cookie } : {}),
    },
  });
  if (res.status === 401 && session) {
    sessionCache = null;
    return yahooQuoteInner(symbol, cacheKey, true);
  }
  if (!res.ok) throw new Error(`Yahoo quote error: ${res.status}`);
  const json = await res.json();
  setCache(cacheKey, json);
  return json;
}

export async function fetchYahooQuote(symbol: string): Promise<any> {
  const cacheKey = yahooCacheKey("quote", symbol);
  const cached = getCached<any>(cacheKey, YAHOO_CACHE_TTL);
  if (cached) return cached;

  return withConcurrencyLimit(() => yahooQuoteInner(symbol, cacheKey, false));
}

/** Sesión AUTOCONTENIDA para el batch: secuencia mínima fc.yahoo.com → getcrumb.
 *  Independiente de getYahooSession (cuya danza completa puede fallar en algunos
 *  runtimes de SSR y devolver null silenciosamente). */
let sesionBatch: YahooSession | null = null;
async function obtenerSesionBatch(force = false): Promise<YahooSession | null> {
  if (!force && sesionBatch && sesionBatch.expiresAt > Date.now()) return sesionBatch;
  for (let intento = 0; intento < 2; intento++) {
    const ua = YAHOO_UAS[uaRotador++ % YAHOO_UAS.length]!;
    try {
      const seed = await fetch("https://fc.yahoo.com", {
        headers: { "User-Agent": ua, Accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(8_000),
      });
      const cookie = getSetCookies(seed.headers)
        .map((v) => v.split(";")[0])
        .filter(Boolean)
        .join("; ");
      const cRes = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
        headers: { "User-Agent": ua, Accept: "text/plain", ...(cookie ? { Cookie: cookie } : {}) },
        signal: AbortSignal.timeout(8_000),
      });
      const crumb = (await cRes.text()).trim();
      if (cRes.ok && crumb && !crumb.startsWith("{")) {
        sesionBatch = { cookie, crumb, expiresAt: Date.now() + 20 * 60 * 1000, ua };
        return sesionBatch;
      }
    } catch {
      /* probar siguiente UA */
    }
  }
  return null;
}

/** Quote BATCH (multi-símbolo, hasta ~50 por llamada) — usado por el calendario
 *  de earnings para mapear el universo con pocas llamadas. Devuelve los quotes
 *  crudos de v7/finance/quote (incluye marketCap y earningsTimestampStart/End).
 *  Bajo rate limit abandona RÁPIDO (máx 2 intentos totales, sin re-danzar sesión). */
let ultimo429Batch = 0;
export async function fetchYahooQuotesBatch(symbols: string[]): Promise<any[]> {
  if (!symbols.length) return [];
  const lista = symbols.slice(0, 60).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const cacheKey = yahooCacheKey("quotebatch-v2", lista.length.toString(), lista.join(","));
  const cached = getCached<any[]>(cacheKey, YAHOO_CACHE_TTL);
  if (cached) return cached;

  // Circuit breaker: si el último 429 fue hace <60s, ni intentar (falla en O(1)).
  if (Date.now() - ultimo429Batch < 60_000) return [];

  let lastError: Error | null = null;
  let intentos429 = 0;
  outer: for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    for (let intento = 0; intento < 2; intento++) {
      try {
        const session = await obtenerSesionBatch(intento > 0);
        const params = new URLSearchParams({
          symbols: lista.join(","),
          crumb: session?.crumb ?? "",
          formatted: "false",
          fields: "regularMarketVolume,regularMarketPrice,volume,earningsTimestamp,earningsTimestampStart,earningsTimestampEnd",
          corsDomain: "finance.yahoo.com",
        });
        const url = `https://${host}/v7/finance/quote?${params}`;
        const res = await fetch(url, {
          signal: AbortSignal.timeout(12_000),
          headers: {
            "User-Agent": session?.ua ?? YAHOO_UA,
            Accept: "application/json",
            ...(session?.cookie ? { Cookie: session.cookie } : {}),
          },
        });
        if (res.status === 401 && session) {
          sessionCache = null;
          continue;
        }
        if (res.status === 429 || res.status === 403) {
          ultimo429Batch = Date.now();
          intentos429++;
          // 429 con esta sesión → UA quemado: invalidar para rotar al siguiente.
          sesionBatch = null;
          sessionCache = null;
          lastError = new Error(`Yahoo quote batch ${res.status}`);
          if (intentos429 >= 2) break outer; // IP bloqueada: no insistir
          await new Promise((r) => setTimeout(r, 800 + Math.random() * 700));
          continue;
        }
        if (!res.ok) throw new Error(`Yahoo quote batch error: ${res.status}`);
        const json = (await res.json()) as any;
        const quotes: any[] = json?.quoteResponse?.result ?? [];
        setCache(cacheKey, quotes);
        return quotes;
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
  }
  console.error("[yahoo-http] quote batch fallo:", lastError?.message);
  return [];
}

// ─── Compat: mercado.ts importaba fetchYahooSearch (alias histórico) ───
export interface YahooSearchResult {
  quotes?: Array<{
    symbol?: string;
    shortname?: string;
    longname?: string;
    exchange?: string;
    quoteType?: string;
    exchDisp?: string;
  }>;
  news?: unknown[];
}

export async function fetchYahooSearch(query: string): Promise<YahooSearchResult | null> {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=8&newsCount=0`;
  try {
    const res = await fetch(url, { headers: yahooHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as YahooSearchResult;
  } catch {
    return null;
  }
}

export function resetYahooSessionCache(): void {
  sessionCache = null;
  sessionPromise = null;
}

// ─── Gap 2: Perfil de volumen intradiario (U-shape) ─────────────────────
// Promedia volumen por franja horaria de los últimos 5 días en 15m y normaliza.
// Retorna perfil relativo V(n) de longitud Nsteps, Σ=1. Fallback uniforme si falla.
export async function fetchVolumeProfile(symbol: string, Nsteps = 26): Promise<number[]> {
  const fallback = new Array(Nsteps).fill(1 / Nsteps);
  try {
    const json: any = await fetchYahooChart(symbol, "5d", "15m");
    const result = json?.chart?.result?.[0];
    const timestamps: number[] = result?.timestamp ?? [];
    const volumes: (number | null)[] = result?.indicators?.quote?.[0]?.volume ?? [];
    if (!timestamps.length || !volumes.length) return fallback;
    // Agrupar por hora del día (0-23) con minuto para granularidad 15m
    const bucketCount = Nsteps;
    const buckets = new Array(bucketCount).fill(0);
    const counts = new Array(bucketCount).fill(0);
    // Mapear cada vela a un bucket por posición intradía (hora*60+min) normalizada
    // Yahoo 15m para 5d puede tener gaps; distribuimos uniformemente por índice si no hay hora confiable
    for (let i = 0; i < timestamps.length; i++) {
      const vol = volumes[i];
      if (vol == null || !isFinite(vol) || vol <= 0) continue;
      const d = new Date(timestamps[i] * 1000);
      const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
      // Normalizar mins 0-1440 a bucket
      const idx = Math.min(bucketCount - 1, Math.max(0, Math.floor((mins / 1440) * bucketCount)));
      buckets[idx] += vol;
      counts[idx] += 1;
    }
    // Promedio por bucket; si un bucket quedó vacío, interpolar
    const avg = buckets.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));
    const hasData = avg.some((v) => v > 0);
    if (!hasData) return fallback;
    // Interpolar vacíos linealmente
    for (let i = 0; i < avg.length; i++) {
      if (avg[i] === 0) {
        let l = i - 1; while (l >= 0 && avg[l] === 0) l--;
        let r = i + 1; while (r < avg.length && avg[r] === 0) r++;
        const lv = l >= 0 ? avg[l] : avg[r] ?? 0;
        const rv = r < avg.length ? avg[r] : avg[l] ?? 0;
        avg[i] = (lv + rv) / 2;
      }
    }
    const sum = avg.reduce((s, x) => s + x, 0);
    if (sum <= 0) return fallback;
    return avg.map((x) => x / sum);
  } catch {
    return fallback;
  }
}
