/** Cliente HTTP de bajo nivel para la API pública de Yahoo Finance
 *  (seed de cookie + crumb, quoteSummary, chart y search). No depende de
 *  TanStack Start ni de servidores específicos: funciona con `fetch` global. */

const YAHOO_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface YahooSession {
  cookie: string;
  crumb: string;
  expiresAt: number;
}

let sessionCache: YahooSession | null = null;

function getSetCookies(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = withGetSetCookie.getSetCookie?.();
  if (setCookies?.length) return setCookies;
  const single = headers.get("set-cookie");
  return single ? [single] : [];
}

const CRUMB_HOSTS = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];
const QUOTE_HOSTS = ["query2.finance.yahoo.com", "query1.finance.yahoo.com"];

async function getYahooSession(forceRefresh = false): Promise<YahooSession> {
  const now = Date.now();
  if (!forceRefresh && sessionCache && sessionCache.expiresAt > now) return sessionCache;

  let ultimoStatus = 0;
  let ultimoError: unknown = null;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const seed = await fetch("https://fc.yahoo.com", {
        headers: { "User-Agent": YAHOO_UA, Accept: "text/html" },
        redirect: "manual",
      });
      const cookie = getSetCookies(seed.headers)
        .map((value) => value.split(";")[0])
        .filter(Boolean)
        .join("; ");

      for (const host of CRUMB_HOSTS) {
        const crumbRes = await fetch(`https://${host}/v1/test/getcrumb`, {
          headers: {
            "User-Agent": YAHOO_UA,
            Accept: "text/plain",
            ...(cookie ? { Cookie: cookie } : {}),
          },
        });
        if (crumbRes.ok) {
          const crumb = (await crumbRes.text()).trim();
          if (crumb && !crumb.startsWith("{")) {
            sessionCache = { cookie, crumb, expiresAt: now + 20 * 60 * 1000 };
            return sessionCache;
          }
          break;
        }
        ultimoStatus = crumbRes.status;
      }
    } catch (e) {
      ultimoError = e;
    }
    if (intento < 2) await new Promise((r) => setTimeout(r, 400 * (intento + 1)));
  }
  throw new Error(
    ultimoError instanceof Error
      ? `Yahoo auth ${ultimoError.message}`
      : `Yahoo auth ${ultimoStatus || "no session"}`,
  );
}

export interface YahooQuoteSummaryResponse<T> {
  status: number;
  json: T | null;
  errorText: string | null;
}

/** Consulta `quoteSummary` de un símbolo con los módulos pedidos (rota entre hosts y refresca sesión en 401). */
export async function fetchYahooQuoteSummaryJson<T>(
  symbol: string,
  modules: string[],
  forceSessionRefresh = false,
): Promise<YahooQuoteSummaryResponse<T>> {
  const session = await getYahooSession(forceSessionRefresh);
  const params = new URLSearchParams({
    modules: modules.join(","),
    corsDomain: "finance.yahoo.com",
    formatted: "false",
    crumb: session.crumb,
  });
  const enc = encodeURIComponent(symbol);
  let ultimaRespuesta: YahooQuoteSummaryResponse<T> = {
    status: 429,
    json: null,
    errorText: "rate limit en todos los hosts",
  };
  for (const host of QUOTE_HOSTS) {
    const url = `https://${host}/v10/finance/quoteSummary/${enc}?${params}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": YAHOO_UA,
        Accept: "application/json",
        ...(session.cookie ? { Cookie: session.cookie } : {}),
      },
    });
    if (res.status === 401 && !forceSessionRefresh) {
      sessionCache = null;
      return fetchYahooQuoteSummaryJson<T>(symbol, modules, true);
    }
    ultimaRespuesta = res.ok
      ? { status: res.status, json: (await res.json()) as T, errorText: null }
      : { status: res.status, json: null, errorText: await res.text().catch(() => null) };
    if (res.ok || res.status !== 429) break;
  }
  return ultimaRespuesta;
}

export interface YahooChartResult {
  chart?: {
    result?: Array<{
      meta?: {
        symbol?: string;
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        chartPreviousClose?: number;
        exchangeName?: string;
        shortName?: string;
        longName?: string;
      };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

/** Histórico de velas de `query1.../v8/finance/chart`. Sin cookie/crumb. */
export async function fetchYahooChart(
  symbol: string,
  range = "1y",
  interval = "1d",
): Promise<YahooChartResult | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;
  try {
    const res = await fetch(url, { headers: yahooHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as YahooChartResult;
  } catch {
    return null;
  }
}

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

/** Búsqueda de tickers por nombre/consulta. */
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

export function yahooHeaders(): HeadersInit {
  return { "User-Agent": YAHOO_UA, Accept: "application/json" };
}

export function resetYahooSessionCache(): void {
  sessionCache = null;
}
