/**
 * Cliente HTTP de bajo nivel para Yahoo Finance
 * Maneja sesiones, cookies, crumb, cache, y concurrencia limitada
 */

import { getCached, setCache } from "./cache";

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface YahooSession {
  cookie: string;
  crumb: string;
  expiresAt: number;
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

  async function tryCrumb(
    host: string,
    cookieJar: string,
  ): Promise<{ cookie: string; crumb: string } | null> {
    const crumbRes = await fetchWithRetry(`https://${host}/v1/test/getcrumb`, {
      headers: {
        "User-Agent": YAHOO_UA,
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
        "User-Agent": YAHOO_UA,
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
  if (r1) return { ...r1, expiresAt: now + 20 * 60 * 1000 };

  const r2 = await tryCrumb("query1.finance.yahoo.com", "");
  if (r2) return { ...r2, expiresAt: now + 20 * 60 * 1000 };

  const seed = await fetchWithRetry("https://fc.yahoo.com", {
    headers: { "User-Agent": YAHOO_UA, Accept: "text/html", "Accept-Language": "en-US,en;q=0.9" },
    redirect: "manual",
  });
  if (seed && seed.ok) {
    const cookie = getSetCookies(seed.headers)
      .map((v) => v.split(";")[0])
      .filter(Boolean)
      .join("; ");
    const r3 = await tryCrumb("query2.finance.yahoo.com", cookie);
    if (r3) return { ...r3, expiresAt: now + 20 * 60 * 1000 };
  }

  const r4 = await tryPage("https://finance.yahoo.com");
  if (r4) return { ...r4, expiresAt: now + 20 * 60 * 1000 };

  const r5 = await tryPage("https://finance.yahoo.com/quote/AAPL");
  if (r5) return { ...r5, expiresAt: now + 20 * 60 * 1000 };

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
            "User-Agent": YAHOO_UA,
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
            "User-Agent": YAHOO_UA,
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
      "User-Agent": YAHOO_UA,
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
