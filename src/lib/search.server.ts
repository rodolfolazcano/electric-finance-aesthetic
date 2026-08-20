const INSTANCES = ["https://searx.be", "https://baresearch.org", "https://priv.au"];

export type Result = { title: string; snippet: string; url: string };

async function searxng(query: string): Promise<Result[]> {
  for (const base of INSTANCES) {
    try {
      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json&language=es&safesearch=1`;
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { results?: Array<Record<string, unknown>> };
      const results: Result[] = (data.results ?? []).slice(0, 5).map((r) => ({
        title: String(r["title"] ?? ""),
        snippet: String(r["content"] ?? "").slice(0, 400),
        url: String(r["url"] ?? ""),
      }));
      if (results.length) return results;
    } catch {
      /* siguiente instancia */
    }
  }
  return [];
}

// Cotizaciones del dólar y otras monedas en Argentina (API pública, sin key)
async function cotizaciones(query: string): Promise<Result[]> {
  const q = query.toLowerCase();
  if (!/(dolar|dólar|blue|mep|ccl|cotiza|tipo de cambio|euro|real)/.test(q)) return [];
  try {
    const res = await fetch("https://dolarapi.com/v1/dolares", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      nombre?: string;
      compra?: number;
      venta?: number;
      fechaActualizacion?: string;
    }>;
    const linea = data
      .map((d) => `${d.nombre}: compra $${d.compra} / venta $${d.venta}`)
      .join(" · ");
    if (!linea) return [];
    return [
      {
        title: "Cotizaciones del dólar en Argentina (DolarAPI)",
        snippet: `${linea}. Última actualización: ${data[0]?.fechaActualizacion ?? "s/d"}.`,
        url: "https://dolarapi.com",
      },
    ];
  } catch {
    return [];
  }
}

// Titulares recientes vía Google Noticias RSS
async function noticias(query: string): Promise<Result[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es-419&gl=AR&ceid=AR:es-419`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = xml.split("<item>").slice(1, 6);
    const pick = (block: string, tag: string) => {
      const m = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(block);
      return (m?.[1] ?? "")
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();
    };
    return items
      .map((block) => ({
        title: pick(block, "title"),
        snippet: `${pick(block, "source")} · ${pick(block, "pubDate")}`.slice(0, 400),
        url: pick(block, "link"),
      }))
      .filter((r) => r.title);
  } catch {
    return [];
  }
}

// DuckDuckGo HTML (sin API key) — respaldo robusto cuando las instancias SearXNG fallan
async function duckduckgo(query: string): Promise<Result[]> {
  const limpiar = (s: string) =>
    s
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const desenvolver = (href: string) => {
    try {
      const u = new URL(href, "https://html.duckduckgo.com");
      const real = u.searchParams.get("uddg");
      return real ? real : u.toString();
    } catch {
      return href;
    }
  };
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=ar-es&safesearch=moderate`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        "Accept-Language": "es-AR,es;q=0.9",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const bloques = html.split('class="result__body"').slice(1, 7);
    const results: Result[] = [];
    for (const b of bloques) {
      const link = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(b);
      if (!link) continue;
      const snip = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/.exec(b);
      results.push({
        title: limpiar(link[2] ?? ""),
        snippet: limpiar(snip?.[1] ?? "").slice(0, 400),
        url: desenvolver(link[1] ?? ""),
      });
    }
    return results.filter((r) => r.title && r.url.startsWith("http"));
  } catch {
    return [];
  }
}

// Wikipedia en español (API pública sin key) — para definiciones y personas/entidades
async function wikipedia(query: string): Promise<Result[]> {
  try {
    const url = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      query,
    )}&format=json&srlimit=2&origin=*`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    };
    return (data.query?.search ?? []).map((s) => ({
      title: `${s.title ?? ""} — Wikipedia`,
      snippet: String(s.snippet ?? "")
        .replace(/<[^>]+>/g, "")
        .slice(0, 400),
      url: `https://es.wikipedia.org/wiki/${encodeURIComponent((s.title ?? "").replace(/ /g, "_"))}`,
    }));
  } catch {
    return [];
  }
}

export async function buscar(query: string): Promise<Result[]> {
  const q = query.trim().slice(0, 300);
  if (!q) return [];
  const [cot, searx, ddg] = await Promise.all([cotizaciones(q), searxng(q), duckduckgo(q)]);
  const vistos = new Set<string>();
  let results = [...cot, ...searx, ...ddg].filter((r) => {
    if (!r.url || vistos.has(r.url)) return false;
    vistos.add(r.url);
    return true;
  });
  if (results.length < 3) {
    const [news, wiki] = await Promise.all([noticias(q), wikipedia(q)]);
    results = [...results, ...news, ...wiki];
  }
  return results.slice(0, 6);
}

/** Descarga una página y extrae su texto principal (best effort). */
export async function extraerTexto(url: string, maxChars = 2500): Promise<string> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; CintiaBoosBot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return "";
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html") && !type.includes("text")) return "";
    const html = await res.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, maxChars);
  } catch {
    return "";
  }
}

export function dominio(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
