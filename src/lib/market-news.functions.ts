// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";

//  Original Dashboard Interfaces 

export type NewsCategory =
  "acciones" | "bonos" | "cedears" | "cripto" | "fx" | "macro" | "commodities";

export interface MarketNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
  category: NewsCategory;
  imageUrl?: string;
  isArgentina?: boolean;
  region?: string;
}

export interface MarketNewsResult {
  items: MarketNewsItem[];
  sourcesOk: string[];
  timestamp: string;
}

//  Compass-style RSS Feed Types 

export interface NewsItem {
  title: string;
  link: string;
  source: string;
  pubDate: string;
  description: string;
}

//  RSS Feed Parsers (compass) 

const FEEDS: { name: string; url: string }[] = [
  { name: "Ámbito Financiero", url: "https://www.ambito.com/rss/pages/finanzas.xml" },
  { name: "Ámbito Economía", url: "https://www.ambito.com/rss/pages/economia.xml" },
  { name: "Cronista Finanzas", url: "https://www.cronista.com/files/rss/finanzas-mercados.xml" },
  { name: "Infobae Economía", url: "https://www.infobae.com/economia/rss.xml" },
];

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extract(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

function parseFeed(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const re = /<item[\s\S]*?<\/item>/gi;
  const matches = xml.match(re) ?? [];
  for (const raw of matches.slice(0, 8)) {
    const title = extract(raw, "title");
    const link = extract(raw, "link");
    const pubDate = extract(raw, "pubDate");
    const description = extract(raw, "description").slice(0, 220);
    if (title && link) {
      items.push({ title, link, source, pubDate, description });
    }
  }
  return items;
}

//  Server Functions 

export const getMarketNews = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketNewsResult> => {
    // Try RSS feeds first
    try {
      const results = await Promise.allSettled(
        FEEDS.map(async ({ name, url }) => {
          const res = await fetch(url, {
            headers: { "user-agent": "Mozilla/5.0 CoronarInversiones/1.0" },
          });
          if (!res.ok) throw new Error(`${name}: ${res.status}`);
          const xml = await res.text();
          return parseFeed(xml, name);
        }),
      );
      const all: NewsItem[] = [];
      for (const r of results) if (r.status === "fulfilled") all.push(...r.value);
      all.sort((a, b) => {
        const da = new Date(a.pubDate).getTime() || 0;
        const db = new Date(b.pubDate).getTime() || 0;
        return db - da;
      });

      const items: MarketNewsItem[] = all.slice(0, 20).map((n, i) => ({
        id: `rss-${i}`,
        title: n.title,
        summary: n.description,
        source: n.source,
        url: n.link,
        publishedAt: n.pubDate,
        category: inferCategory(n.title + " " + n.description),
        isArgentina: true,
      }));

      const fulfilledSources = results
        .map((r, i) => (r.status === "fulfilled" ? FEEDS[i].name : null))
        .filter(Boolean) as string[];
      return { items, sourcesOk: fulfilledSources, timestamp: new Date().toISOString() };
    } catch {
      // Fallback: return empty
      return { items: [], sourcesOk: [] as string[], timestamp: new Date().toISOString() };
    }
  },
);

function inferCategory(text: string): NewsCategory {
  const lower = text.toLowerCase();
  if (/\b(bitcoin|ethereum|cripto|blockchain|binance|crypto)\b/.test(lower)) return "cripto";
  if (/\b(dólar|dolar|usd|fx|tipo de cambio|moneda|blue|mep|ccl)\b/.test(lower)) return "fx";
  if (/\b(bono|lecap|boncap|tir|renta fija|tasa|interés|interest|yield)\b/.test(lower))
    return "bonos";
  if (/\b(oro|petróleo|petroleo|commodity|soja|maíz|trigo)\b/.test(lower)) return "commodities";
  if (/\b(pib|inflación|inflacion|bcra|fmi|recesión|macroeconómico|macro)\b/.test(lower))
    return "macro";
  if (/\b(cedear|adr|argentina|byma)\b/.test(lower)) return "cedears";
  return "acciones";
}
