// @ts-nocheck
// Búsqueda web con APIs gratuitas y sin key.
// 1) DuckDuckGo HTML (scraping liviano)  2) Wikipedia API como respaldo.
// Lectura de página: r.jina.ai (texto plano, gratuito).

export type WebResult = {
  title: string;
  url: string;
  source: string;
  snippet: string;
};

function decodeEntities(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "web";
  }
}

function normalizeDuckUrl(href: string): string {
  try {
    if (href.startsWith("//")) href = `https:${href}`;
    const url = new URL(href, "https://duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch {
    return href;
  }
}

async function duckduckgo(query: string, limit: number): Promise<WebResult[]> {
  const res = await fetch(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=ar-es`,
    {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      body: `q=${encodeURIComponent(query)}`,
    },
  );
  if (!res.ok) return [];
  const html = await res.text();

  const out: WebResult[] = [];
  const blockRe =
    /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)(?=<a[^>]+class="[^"]*result__a|<\/body>)/g;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(html)) && out.length < limit) {
    const url = normalizeDuckUrl(match[1]);
    const title = decodeEntities(match[2]);
    const snippetMatch = /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/.exec(match[3]);
    if (!title || !url.startsWith("http")) continue;
    out.push({
      title,
      url,
      source: hostOf(url),
      snippet: snippetMatch ? decodeEntities(snippetMatch[1]).slice(0, 400) : "",
    });
  }
  return out;
}

async function wikipedia(query: string, limit: number): Promise<WebResult[]> {
  const res = await fetch(
    `https://es.wikipedia.org/w/api.php?action=query&list=search&format=json&origin=*&srlimit=${limit}&srsearch=${encodeURIComponent(
      query,
    )}`,
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { search?: Array<{ title: string; snippet: string }> };
  };
  return (data.query?.search ?? []).map((item) => ({
    title: item.title,
    url: `https://es.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, "_"))}`,
    source: "es.wikipedia.org",
    snippet: decodeEntities(item.snippet),
  }));
}

/** Busca en la web con proveedores gratuitos, en cascada. */
export async function searchWeb(query: string, limit = 6): Promise<WebResult[]> {
  const providers = [duckduckgo, wikipedia];
  for (const provider of providers) {
    try {
      const results = await provider(query, limit);
      if (results.length) return results.slice(0, limit);
    } catch (error) {
      console.error("[web] proveedor falló", error);
    }
  }
  return [];
}

/** Descarga una página y devuelve texto legible (servicio gratuito r.jina.ai). */
export async function readWebPage(url: string, maxChars = 20_000): Promise<string> {
  const target = url.replace(/^https?:\/\//, "");
  const res = await fetch(`https://r.jina.ai/https://${target}`, {
    headers: { accept: "text/plain" },
  });
  if (!res.ok) throw new Error(`No pude leer la página (${res.status}).`);
  const text = await res.text();
  return text.slice(0, maxChars);
}

/** Bloque de contexto para el modelo a partir de resultados web. */
export function buildWebBlock(results: WebResult[]): string {
  if (!results.length) return "";
  return results
    .map((r, i) => `[${i + 1}] ${r.title} — ${r.source}\n${r.url}\n${r.snippet}`)
    .join("\n\n");
}
