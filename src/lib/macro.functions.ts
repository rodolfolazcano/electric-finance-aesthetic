import { createServerFn } from "@tanstack/react-start";

type DolarSet = {
  oficial?: number | null;
  mep?: number | null;
  ccl?: number | null;
  blue?: number | null;
  cripto?: number | null;
};

export const getMacroIndicators = createServerFn({ method: "GET" }).handler(async () => {
  const out: any = {
    timestamp: new Date().toISOString(),
    dolar: {},
    embi: null,
    ipc: null,
    badlar: null,
    lecaps: [],
    uva: null,
    tasas: {},
  };

  const AD = "https://api.argentinadatos.com";
  const BCRA = "https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias";

  // 1. Cotizaciones dólar desde ArgentinaDatos (cada casa por separado)
  const casas = ["oficial", "blue", "bolsa", "contadoconliqui", "cripto", "mayorista"];
  const dolarData: Record<string, number> = {};
  await Promise.all(
    casas.map(async (casa) => {
      try {
        const r = await fetch(`${AD}/v1/cotizaciones/dolares/${casa}`, { cache: "no-store" });
        if (!r.ok) return;
        const arr = await r.json();
        if (Array.isArray(arr) && arr.length > 0) {
          const ultimo = arr[arr.length - 1];
          dolarData[casa === "bolsa" ? "mep" : casa === "contadoconliqui" ? "ccl" : casa] =
            ultimo?.venta ?? ultimo?.compra ?? null;
        }
      } catch {
        // ignore
      }
    }),
  );
  out.dolar = {
    oficial: dolarData.oficial ?? null,
    mep: dolarData.mep ?? null,
    ccl: dolarData.ccl ?? null,
    blue: dolarData.blue ?? null,
    cripto: dolarData.cripto ?? null,
    mayorista: dolarData.mayorista ?? null,
  };

  // 2. EMBI (riesgo país)
  try {
    const res = await fetch(`${AD}/v1/finanzas/indices/riesgo-pais/ultimo`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      out.embi = j?.valor ?? null;
    }
  } catch {
    // ignore
  }

  // 3. Inflación mensual (último valor del array)
  try {
    const res = await fetch(`${AD}/v1/finanzas/indices/inflacion`, { cache: "no-store" });
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length > 0) {
        const ultimo = arr[arr.length - 1];
        out.ipc = { mensual: ultimo?.valor ?? null, fecha: ultimo?.fecha ?? null };
        if (arr.length >= 12) {
          const ultimos12 = arr.slice(-12);
          const anual =
            ultimos12.reduce((acc: number, m: any) => acc * (1 + (m.valor ?? 0) / 100), 1) - 1;
          out.ipc.interanual = +(anual * 100).toFixed(2);
        }
      }
    }
  } catch {
    // ignore
  }

  // 4. BADLAR (BCRA id=17)
  try {
    const res = await fetch(`${BCRA}/17`, { cache: "no-store" });
    if (res.ok) {
      const j = await res.json();
      const results = j?.results ?? j;
      if (Array.isArray(results) && results.length) {
        const ultimo = results[results.length - 1];
        out.badlar = ultimo?.valor ?? null;
      }
    }
  } catch {
    // ignore
  }

  // 5. LECAPs activas desde ArgentinaDatos
  try {
    const res = await fetch(`${AD}/v1/finanzas/letras`, { cache: "no-store" });
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr)) {
        out.lecaps = arr.map((l: any) => ({
          ticker: l.ticker,
          fechaEmision: l.fechaEmision,
          fechaVencimiento: l.fechaVencimiento,
          tem: l.tem,
          vpv: l.vpv,
        }));
      }
    }
  } catch {
    // ignore
  }

  // 6. UVA
  try {
    const res = await fetch(`${AD}/v1/finanzas/indices/uva`, { cache: "no-store" });
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length > 0) {
        out.uva = arr[arr.length - 1]?.valor ?? null;
      }
    }
  } catch {
    // ignore
  }

  return out;
});

// Minimal RSS parser: pull items titles, link, pubDate
function parseRss(text: string, limit = 8) {
  const items: any[] = [];
  try {
    const itemRe = /<item[\s\S]*?<\/item>/gi;
    const matches = text.match(itemRe) || [];
    for (let i = 0; i < Math.min(matches.length, limit); i++) {
      const it = matches[i];
      const title = (it.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "")
        .replace(/<[^>]+>/g, "")
        .trim();
      const link =
        it.match(/<link>([\s\S]*?)<\/link>/i)?.[1] ||
        (it.match(/href=\"([^\"]+)\"/) || [])[1] ||
        null;
      const pub = it.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || null;
      const desc = (it.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "")
        .replace(/<[^>]+>/g, "")
        .trim();
      items.push({ title, link, pubDate: pub, summary: desc });
    }
  } catch (e) {
    console.error("parseRss error", e);
  }
  return items;
}

export const getMarketNews = createServerFn({ method: "GET" }).handler(async ({ data }) => {
  // data?: { limit?: number }
  const limit = (data as any)?.limit ?? 8;
  const sources = [
    { name: "Ámbito Financiero", url: "https://www.ambito.com/rss/finanzas.xml" },
    { name: "El Cronista", url: "https://www.cronista.com/rss/economia/" },
    { name: "InfoBae Economía", url: "https://www.infobae.com/feeds/america-economia.xml" },
  ];
  const out: any[] = [];
  await Promise.all(
    sources.map(async (s) => {
      try {
        const r = await fetch(s.url, { cache: "no-store" });
        if (!r.ok) return;
        const txt = await r.text();
        const items = parseRss(txt, limit);
        for (const it of items) out.push({ source: s.name, ...it });
      } catch (e) {
        console.error("fetch rss", s.url, e);
      }
    }),
  );
  // sort by pubDate if present
  out.sort((a, b) => {
    const da = a.pubDate ? Date.parse(a.pubDate) : 0;
    const db = b.pubDate ? Date.parse(b.pubDate) : 0;
    return db - da;
  });
  return out.slice(0, limit);
});
