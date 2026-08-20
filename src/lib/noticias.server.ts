export type FuenteNoticia = { dominio: string; url: string; title: string };

export type Noticia = {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: string;
};

const FEEDS = [
  { name: "Ámbito Financiero", url: "https://www.ambito.com/rss/pages/finanzas.xml" },
  { name: "Ámbito Economía", url: "https://www.ambito.com/rss/pages/economia.xml" },
  { name: "El Cronista", url: "https://www.cronista.com/files/rss/finanzas-mercados.xml" },
  { name: "Infobae Economía", url: "https://www.infobae.com/economia/rss.xml" },
] as const;

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const PALABRAS_IRRELEVANTES = new Set([
  "noticias",
  "noticia",
  "que",
  "paso",
  "paso",
  "hay",
  "hoy",
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
  "en",
  "sobre",
  "contar",
  "cuentame",
  "buscar",
  "busca",
  "busco",
  "novedades",
  "novedad",
  "ultimas",
  "ultima",
  "ultimos",
  "ultimo",
  "informacion",
  "informacion",
  "semana",
  "mes",
  "ano",
  "dia",
  "cuanto",
  "cual",
  "para",
  "por",
  "con",
  "un",
  "una",
  "al",
  "a",
  "se",
  "mas",
  "y",
  "e",
  "o",
  "u",
]);

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
    .replace(/\s+/g, " ")
    .trim();
}

function extract(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? decodeEntities(m[1] ?? "") : "";
}

function parseFeed(xml: string, source: string): Noticia[] {
  const items: Noticia[] = [];
  for (const raw of xml.match(/<item[\s\S]*?<\/item>/gi) ?? []) {
    const title = extract(raw, "title");
    const link = extract(raw, "link");
    const pubDate = extract(raw, "pubDate");
    const description = extract(raw, "description").slice(0, 220);
    const ts = Date.parse(pubDate);
    if (title && link && !isNaN(ts)) {
      items.push({
        id: `rss-${source}-${link}`,
        title,
        summary: description,
        source,
        url: link,
        publishedAt: new Date(ts).toISOString(),
      });
    }
  }
  return items;
}

function parseGoogleNews(xml: string): Noticia[] {
  return parseFeed(xml, "Google News").map((n) => {
    const fuente = n.source === "Google News" ? "Google Noticias" : n.source;
    return { ...n, source: fuente };
  });
}

async function obtenerRss(url: string, parse: (xml: string) => Noticia[]): Promise<Noticia[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 CoronarInversiones/1.0" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    return parse(await res.text());
  } catch {
    return [];
  }
}

function inicioDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function sumarDias(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function parseFechaLocal(fecha: string): Date | null {
  const m = fecha.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let anio = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (anio < 100) anio += 2000;
  const d = new Date(anio, mes - 1, dia);
  return isNaN(d.getTime()) ? null : d;
}

function mesNumero(nombre: string): number | null {
  const n = (nombre ?? "").toLowerCase();
  const idx = MESES.indexOf(n);
  if (idx >= 0) return idx + 1;
  const abrev = [
    "ene",
    "feb",
    "mar",
    "abr",
    "may",
    "jun",
    "jul",
    "ago",
    "sep",
    "sept",
    "oct",
    "nov",
    "dic",
  ];
  const idxAbr = abrev.indexOf(n);
  return idxAbr >= 0 ? idxAbr + 1 : null;
}

type Rango = { desde: Date; hasta: Date; etiqueta: string };

/** Interpreta un período en español ("hoy", "última semana", "de marzo", "de 2025", "del 1/6 al 15/6"...). */
export function parsePeriodo(raw: string, ref = new Date()): Rango {
  const s = (raw ?? "").trim().toLowerCase();
  const ahora = ref;
  const hoy = inicioDia(ahora);
  const atras = (nDias: number) => sumarDias(hoy, -nDias);

  if (!s) return { desde: atras(7), hasta: ahora, etiqueta: "últimos 7 días" };

  if (/^(hoy|este\s+d[íi]a|dia\s+de\s+hoy)$/.test(s))
    return { desde: atras(1), hasta: ahora, etiqueta: "hoy" };
  if (/^(ayer)$/.test(s)) return { desde: atras(1), hasta: hoy, etiqueta: "ayer" };
  if (/^[uú]ltim[oa]s?\s+(?:24(?:\s+horas?|\s+hs)?|d[íi]a)$/.test(s))
    return { desde: atras(1), hasta: ahora, etiqueta: "últimas 24 horas" };

  const nDias = s.match(/^(\d+)\s*d[íi]as?$/);
  if (nDias)
    return { desde: atras(Number(nDias[1])), hasta: ahora, etiqueta: `últimos ${nDias[1]} días` };
  const nSem = s.match(/^(\d+)\s*semanas?$/);
  if (nSem)
    return {
      desde: atras(Number(nSem[1]) * 7),
      hasta: ahora,
      etiqueta: `últimas ${nSem[1]} semanas`,
    };
  const nMes = s.match(/^(\d+)\s*mes(?:es)?$/);
  if (nMes)
    return {
      desde: new Date(ahora.getFullYear(), ahora.getMonth() - Number(nMes[1]) + 1, 1),
      hasta: ahora,
      etiqueta: `últimos ${nMes[1]} meses`,
    };
  const nAnio = s.match(/^(\d+)\s*a[nñ]os?$/);
  if (nAnio)
    return {
      desde: new Date(ahora.getFullYear() - Number(nAnio[1]) + 1, 0, 1),
      hasta: ahora,
      etiqueta: `últimos ${nAnio[1]} años`,
    };

  const nRelativo = s.match(/^[uú]ltim[oa]s?\s+(\d+)\s*(d[íi]as?|semanas?|mes(?:es)?|a[nñ]os?)$/);
  if (nRelativo) {
    const n = Number(nRelativo[1]);
    const unidad = nRelativo[2] ?? "";
    if (/d[íi]a/.test(unidad))
      return { desde: atras(n), hasta: ahora, etiqueta: `últimos ${n} días` };
    if (/seman/.test(unidad))
      return { desde: atras(n * 7), hasta: ahora, etiqueta: `últimas ${n} semanas` };
    if (/mes/.test(unidad))
      return {
        desde: new Date(ahora.getFullYear(), ahora.getMonth() - n, ahora.getDate()),
        hasta: ahora,
        etiqueta: `últimos ${n} meses`,
      };
    return {
      desde: new Date(ahora.getFullYear() - n, ahora.getMonth(), ahora.getDate()),
      hasta: ahora,
      etiqueta: `últimos ${n} años`,
    };
  }

  if (/^([uú]ltim[oa]\s+trimestre|[uú]ltim[oa]s?\s+3\s+meses)$/.test(s))
    return {
      desde: new Date(ahora.getFullYear(), ahora.getMonth() - 2, 1),
      hasta: ahora,
      etiqueta: "último trimestre",
    };
  if (/^([uú]ltim[oa]\s+cuatrimestre|[uú]ltim[oa]s?\s+4\s+meses)$/.test(s))
    return {
      desde: new Date(ahora.getFullYear(), ahora.getMonth() - 3, 1),
      hasta: ahora,
      etiqueta: "último cuatrimestre",
    };
  if (/^([uú]ltim[oa]\s+semana|[uú]ltim[oa]s?\s+7\s+d[íi]as|est[ao]\s+semana)$/.test(s))
    return { desde: atras(7), hasta: ahora, etiqueta: "última semana" };
  if (/^([uú]ltim[oa]\s+mes|[uú]ltim[oa]s?\s+30\s+d[íi]as|est[ao]\s+mes)$/.test(s))
    return { desde: atras(30), hasta: ahora, etiqueta: "último mes" };
  if (
    /^([uú]ltim[oa]\s+a[nñ]o|[uú]ltim[oa]s?\s+12\s+meses|[uú]ltim[oa]s?\s+365\s+d[íi]as|est[ao]\s+a[nñ]o)$/i.test(
      s,
    )
  )
    return { desde: atras(365), hasta: ahora, etiqueta: "último año" };

  const rango = s.match(
    /^(?:del|desde)\s+(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)\s*(?:al|hasta)\s+(\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?)$/,
  );
  if (rango) {
    const d1 = parseFechaLocal(rango[1] ?? "");
    const d2 = parseFechaLocal(rango[2] ?? "");
    if (d1 && d2)
      return {
        desde: inicioDia(d1),
        hasta: new Date(d2.getFullYear(), d2.getMonth(), d2.getDate(), 23, 59, 59),
        etiqueta: `del ${rango[1]} al ${rango[2]}`,
      };
  }

  const rangoMes = s.match(
    /^del\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?\s+(?:al|hasta)\s+(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?$/,
  );
  if (rangoMes) {
    const m1 = mesNumero(rangoMes[2] ?? "");
    const m2 = mesNumero(rangoMes[5] ?? "");
    if (m1 && m2) {
      const a1 = rangoMes[3] ? Number(rangoMes[3]) : ahora.getFullYear();
      const a2 = rangoMes[6] ? Number(rangoMes[6]) : a1;
      const d1 = new Date(a1, m1 - 1, Number(rangoMes[1]));
      const d2 = new Date(a2, m2 - 1, Number(rangoMes[4]), 23, 59, 59);
      if (!isNaN(d1.getTime()) && !isNaN(d2.getTime()))
        return {
          desde: d1,
          hasta: d2,
          etiqueta: `del ${rangoMes[1]} de ${rangoMes[2]} al ${rangoMes[4]} de ${rangoMes[5]}`,
        };
    }
  }

  for (let i = 0; i < MESES.length; i++) {
    const nombre = MESES[i];
    if (i === 4 && !/(^|[^a-z])mayo([^a-z]|$)/.test(s)) continue;
    if (!nombre || !s.includes(nombre)) continue;
    const m = s.match(new RegExp(`^(?:de\\s+|en\\s+)?${nombre}\\s*(?:de\\s+)?(\\d{4})?$`));
    const anio = m?.[1] ? Number(m[1]) : ahora.getFullYear();
    const desde = new Date(anio, i, 1);
    const hasta = new Date(anio, i + 1, 0, 23, 59, 59);
    const etiqueta = `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${anio}`.trim();
    if (hasta.getTime() > ahora.getTime()) return { desde, hasta: ahora, etiqueta };
    return { desde, hasta, etiqueta };
  }

  const anio = s.match(/^(?:de|en|durante)\s+(?:el\s+a[nñ]o\s+)?(19\d{2}|20\d{2})$/);
  if (anio) {
    const y = Number(anio[1]);
    return {
      desde: new Date(y, 0, 1),
      hasta: new Date(y, 11, 31, 23, 59, 59),
      etiqueta: `año ${y}`,
    };
  }

  return { desde: atras(7), hasta: ahora, etiqueta: "últimos 7 días" };
}

const PATRONES_PERIODO: RegExp[] = [
  /(?:desde|del)\s+\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?\s+(?:al|hasta)\s+\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?/i,
  /(?:desde|del)\s+\d{1,2}\s+de\s+[a-záéíóúñ]+(?:\s+de\s+\d{4})?\s+(?:al|hasta)\s+\d{1,2}\s+de\s+[a-záéíóúñ]+/i,
  /(?:de|en|durante)\s+(?:el\s+)?(?:mes\s+de\s+|meses?\s+)?(?:de\s+)?[a-záéíóúñ]+\s+(19|20)\d{2}/i,
  /\d+\s+(?:d[íi]as?|semanas?|mes(?:es)?|a[nñ]os?|horas?)/i,
  /(?:[uú]ltim[oa]|[uú]ltim[oa]s?)\s+(?:\d+\s+)?(?:d[íi]as?|semanas?|mes(?:es)?|a[nñ]os?|horas?|24|trimestre|cuatrimestre)/i,
  /(?:est[oa]|este)\s+(?:semana|mes|a[nñ]o|trimestre)/i,
  /(?:hoy|ayer|este\s+d[íi]a|dia\s+de\s+hoy|[uú]ltim[oa]\s+d[íi]a)/i,
  /(?:de|en|durante)\s+(?:el\s+a[nñ]o\s+)?(?:19|20)\d{2}/i,
];

/** Extrae la mención de período del texto de la consulta y deja el resto como tema. */
function separarPeriodo(query: string): { tema: string; periodo: string } {
  const q = query.trim();
  if (!q) return { tema: "", periodo: "" };
  let mejor: { from: number; to: number } | null = null;
  for (const p of PATRONES_PERIODO) {
    const m = p.exec(q);
    if (!m) continue;
    const largo = m[0].length;
    if (
      !mejor ||
      largo > q.slice(mejor.from, mejor.to).length ||
      (largo === q.slice(mejor.from, mejor.to).length && m.index < mejor.from)
    ) {
      mejor = { from: m.index, to: m.index + largo };
    }
  }
  if (!mejor) return { tema: q, periodo: "" };
  const periodo = q.slice(mejor.from, mejor.to).trim();
  const tema = `${q.slice(0, mejor.from)} ${q.slice(mejor.to)}`.replace(/\s+/g, " ").trim();
  return { tema, periodo };
}

function fechaCorta(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "s/d";
  const ahora = new Date();
  const p = (x: number) => String(x).padStart(2, "0");
  const hora = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (inicioDia(d).getTime() === inicioDia(ahora).getTime()) return `hoy ${hora}`;
  const ayer = inicioDia(sumarDias(ahora, -1));
  if (inicioDia(d).getTime() === inicioDia(ayer).getTime()) return `ayer ${hora}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Busca noticias por tema y período usando fuentes públicas sin API key.
 * Por defecto trae las noticias más recientes (últimos 7 días).
 */
export async function consultarNoticias(
  queryRaw: string,
  periodoRaw: string,
): Promise<{ texto: string; fuentes: FuenteNoticia[]; etiqueta: string }> {
  const { tema, periodo } = separarPeriodo(`${queryRaw ?? ""} ${periodoRaw ?? ""}`.trim());
  const rango = parsePeriodo(periodo, new Date());
  const desdeTs = rango.desde.getTime();
  const hastaTs = rango.hasta.getTime();

  const palabras = tema
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && w.length > 1 && !PALABRAS_IRRELEVANTES.has(w));

  const enRango = (n: Noticia) => {
    const ts = Date.parse(n.publishedAt);
    return !isNaN(ts) && ts >= desdeTs && ts <= hastaTs;
  };
  const coincideTema = (n: Noticia) => {
    if (!palabras.length) return true;
    const texto = `${n.title} ${n.summary}`.toLowerCase();
    return palabras.some((w) => texto.includes(w));
  };

  const termino = palabras.length ? palabras.join(" ") : tema.trim() || "mercado argentino";
  const ventanaDias = Math.max(1, Math.ceil((hastaTs - desdeTs) / 86400000));
  const conWhen = ventanaDias <= 60 ? ` ${termino} when:${ventanaDias}d` : ` ${termino}`;
  const gUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    conWhen.trim(),
  )}&hl=es-419&gl=AR&ceid=AR:es-419`;

  const [itemsFeeds, itemsGoogle] = await Promise.all([
    Promise.all(FEEDS.map((f) => obtenerRss(f.url, (xml) => parseFeed(xml, f.name)))).then((a) =>
      a.flat(),
    ),
    obtenerRss(gUrl, parseGoogleNews),
  ]);

  const vistos = new Set<string>();
  const unicas = [...itemsFeeds, ...itemsGoogle]
    .filter((n) => enRango(n) && coincideTema(n))
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .filter((n) => {
      const key = n.url.split("?")[0] ?? n.url;
      if (vistos.has(key)) return false;
      vistos.add(key);
      return true;
    })
    .slice(0, 12);

  const mapaFuentes = new Map<string, FuenteNoticia>();
  for (const n of unicas) {
    let dominio = "";
    try {
      dominio = new URL(n.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (!mapaFuentes.has(dominio))
      mapaFuentes.set(dominio, { dominio, url: n.url, title: n.title });
  }

  if (!unicas.length) {
    return {
      texto: `SIN RESULTADOS: no encontré noticias sobre "${termino}" en el período ${rango.etiqueta}. Podés probar con otro tema o ampliar el período.`,
      fuentes: [...mapaFuentes.values()],
      etiqueta: rango.etiqueta,
    };
  }

  const lineas = [
    `Noticias${palabras.length ? ` sobre "${termino}"` : ""} (período: ${rango.etiqueta}):`,
    ...unicas.map(
      (n) =>
        `- [${fechaCorta(n.publishedAt)}] ${n.title} (${n.source})${
          n.summary ? `\n  ${n.summary}` : ""
        }`,
    ),
    "",
    "Fuentes externas: RSS de Ámbito, El Cronista e Infobae Economía, y Google Noticias. La fecha corresponde a la publicación de la nota.",
  ];
  return {
    texto: lineas.join("\n"),
    fuentes: [...mapaFuentes.values()].slice(0, 4),
    etiqueta: rango.etiqueta,
  };
}
