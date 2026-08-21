import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTokens } from "@/lib/herramientas/iol-auth";
import { fetchYahooSearchNews, type YahooNewsItem } from "@/lib/herramientas/yahoo-http";

async function iolFetchPortfolio<T>(
  url: string,
  token: string,
  refreshToken: string | null,
): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401 && refreshToken) {
    try {
      const tokens = await fetchTokens({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      if (!("error" in tokens)) {
        const retry = await fetch(url, {
          headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
        });
        if (retry.ok) return retry.json() as Promise<T>;
      }
    } catch {
      // Ignorar error de refresh
    }
    throw new Error(
      "Sesión IOL expirada. Iniciá sesión nuevamente desde el botón superior derecho.",
    );
  }
  if (!res.ok) throw new Error(`IOL error ${res.status}: ${await res.text().catch(() => "")}`);
  return res.json() as Promise<T>;
}

export interface PortfolioNewsItem extends YahooNewsItem {
  ticker: string;
}

export interface PortfolioNewsResult {
  items: PortfolioNewsItem[];
  symbols: string[];
  totalValorizado: number;
  newToken?: string;
  newRefreshToken?: string;
}

export const getPortfolioNews = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; refreshToken: string | null; pais?: string }) =>
    z
      .object({
        token: z.string().min(1),
        refreshToken: z.string().nullable(),
        pais: z.string().default("Argentina"),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    let latestToken = data.token;
    let latestRefresh = data.refreshToken;

    async function trackedFetch<T>(url: string): Promise<T> {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${latestToken}`, Accept: "application/json" },
      });
      if (res.status === 401 && latestRefresh) {
        try {
          const tokens = await fetchTokens({
            refresh_token: latestRefresh,
            grant_type: "refresh_token",
          });
          if (!("error" in tokens)) {
            latestToken = tokens.accessToken;
            latestRefresh = tokens.refreshToken ?? "";
            const retry = await fetch(url, {
              headers: { Authorization: `Bearer ${latestToken}`, Accept: "application/json" },
            });
            if (retry.ok) return retry.json() as Promise<T>;
          }
        } catch {
          // Ignorar error de refresh
        }
        throw new Error(
          "Sesión IOL expirada. Iniciá sesión nuevamente desde el botón superior derecho.",
        );
      }
      if (!res.ok) throw new Error(`IOL error ${res.status}: ${await res.text().catch(() => "")}`);
      return res.json() as Promise<T>;
    }

    // 1. Fetch IOL portfolio
    const raw = await trackedFetch<any>(
      `https://api.invertironline.com/api/v2/portafolio/${data.pais}`,
    );

    // 2. Normalize and extract symbols with cantidad > 0
    const items: Array<{ simbolo: string; cantidad: number; valorizado: number }> = Array.isArray(
      raw,
    )
      ? (raw as Array<{ simbolo: string; cantidad: number; valorizado: number }>).filter(
          (i) => i.cantidad > 0,
        )
      : (
          (raw.activos ?? []) as Array<{
            cantidad: number;
            valorizado: number;
            titulo: { simbolo: string };
          }>
        )
          .filter((a: any) => a.cantidad > 0)
          .map((a: any) => ({
            simbolo: a.titulo?.simbolo ?? a.simbolo ?? "",
            cantidad: a.cantidad ?? 0,
            valorizado: a.valorizado ?? 0,
          }))
          .filter((i: { simbolo: string }) => i.simbolo);

    const symbols = [...new Set(items.map((i) => i.simbolo))];
    const totalValorizado = items.reduce((s, i) => s + i.valorizado, 0);

    if (symbols.length === 0) {
      return { items: [], symbols: [], totalValorizado: 0 };
    }

    // 3. Fetch Yahoo Finance news for each symbol (up to 3 at a time)
    const allNews: PortfolioNewsItem[] = [];
    const batchSize = 3;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(async (sym) => {
          try {
            const news = await fetchYahooSearchNews(sym, 3);
            return news.map((n) => ({ ...n, ticker: sym }));
          } catch {
            return [] as PortfolioNewsItem[];
          }
        }),
      );
      allNews.push(...results.flat());
    }

    // 4. Sort by publish time descending, deduplicate by uuid
    const seen = new Set<string>();
    const deduped = allNews
      .sort((a, b) => b.providerPublishTime - a.providerPublishTime)
      .filter((n) => {
        if (seen.has(n.uuid)) return false;
        seen.add(n.uuid);
        return true;
      });

    return {
      items: deduped.slice(0, 30),
      symbols,
      totalValorizado,
      newToken: latestToken !== data.token ? latestToken : undefined,
      newRefreshToken: latestRefresh !== data.refreshToken ? latestRefresh : undefined,
    };
  });
