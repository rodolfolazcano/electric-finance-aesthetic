/** Búsqueda semántica sobre el corpus académico (55 PDFs / 11 categorías) con
 *  embeddings NVIDIA precomputados por scripts/build-kb-index.mjs.
 *
 *  El índice se sirve como asset externo (vectores Float16 base64 +
 *  texto + metadata). Se carga una sola vez por proceso y se cachea.
 */

import academicIndexAsset from "./academic-index.asset.json";

export interface ChunkAcademico {
  texto: string;
  similitud: number;
  categoria: string;
  archivo: string;
  pagina: number;
  offset: number;
}

interface IndiceAcademico {
  modelo: string;
  dims: number;
  fecha: string;
  chunks: Array<{
    categoria: string;
    archivo: string;
    pagina: number;
    offset: number;
    texto: string;
    v: string;
  }>;
}

const EMBED_URL = "https://integrate.api.nvidia.com/v1/embeddings";
const EMBED_MODEL = "nvidia/nemotron-3-embed-1b";
const NVIDIA_API_KEY =
  process.env["NVIDIA_API_KEY"] ??
  "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";

let indiceCache: { indice: IndiceAcademico; vectores: Float32Array[] } | null = null;

async function generarEmbedding(texto: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + NVIDIA_API_KEY,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texto }),
  });
  if (!res.ok) throw new Error("embedding error " + res.status);
  const data = (await res.json()) as { data?: Array<{ embedding?: number[] }> };
  const emb = data.data?.[0]?.embedding;
  if (!emb) throw new Error("embedding vacío");
  return emb;
}

// Decodifica base64 de Float16Array (Uint16) a Float32Array.
function decodificarF16(b64: string, dims: number): Float32Array {
  const bin = atob(b64);
  const u16 = new Uint16Array(dims);
  for (let i = 0; i < dims; i++) {
    const hi = bin.charCodeAt(i * 2 + 1) ?? 0;
    const lo = bin.charCodeAt(i * 2) ?? 0;
    u16[i] = lo | (hi << 8);
  }
  const out = new Float32Array(dims);
  for (let i = 0; i < dims; i++) {
    out[i] = float16ToFloat32(u16[i] ?? 0);
  }
  return out;
}

function float16ToFloat32(h: number): number {
  const sign = h & 0x8000 ? -1 : 1;
  const exp = (h >> 10) & 0x1f;
  const mant = h & 0x3ff;
  if (exp === 0) return sign * mant * Math.pow(2, -24);
  if (exp === 31) return mant ? NaN : sign * Infinity;
  return sign * (1 + mant / 1024) * Math.pow(2, exp - 15);
}

function normalizar(v: number[]): Float32Array {
  const f = Float32Array.from(v);
  const norma = Math.sqrt(f.reduce((s, x) => s + x * x, 0)) || 1;
  for (let i = 0; i < f.length; i++) f[i] = (f[i] ?? 0) / norma;
  return f;
}

function coseno(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i]! * b[i]!;
  return s;
}

/** Carga el índice precomputado (desde /kb/academic-index.json o el filesystem en dev).
 *  `baseUrl` opcional: origin del request (funciona en Cloudflare Workers y en dev). */
async function cargarIndice(baseUrl?: string): Promise<{
  indice: IndiceAcademico;
  vectores: Float32Array[];
} | null> {
  if (indiceCache) return indiceCache;
  let json: IndiceAcademico | null = null;

  // 1) fetch desde el asset externo (usa baseUrl si está disponible; si no, ruta relativa)
  try {
    const path = academicIndexAsset.url;
    const url = baseUrl ? new URL(path, baseUrl).toString() : path;
    const res = await fetch(url);
    if (res.ok) json = (await res.json()) as IndiceAcademico;
  } catch {
    /* sin índice */
  }

  // 2) fallback local: índice generado por scripts/build-kb-index.mjs (public/kb/)
  if (!json || !json.chunks?.length) {
    try {
      const url = baseUrl
        ? new URL("/kb/academic-index.json", baseUrl).toString()
        : "/kb/academic-index.json";
      const res = await fetch(url);
      if (res.ok) json = (await res.json()) as IndiceAcademico;
    } catch {
      /* sin índice local */
    }
  }

  if (!json || !json.chunks?.length) return null;
  const dims = json.dims || 2048;
  indiceCache = {
    indice: json,
    vectores: json.chunks.map((c) => decodificarF16(c.v, dims)),
  };
  return indiceCache;
}

const STOPWORDS = new Set(
  "que,el,la,los,las,con,por,para,una,un,uno,saber,quiere,como,cómo,cuál,cual,es,son,hay,debería,puedo,se,su,de,del,y,o,a,en,al,no,me,te,mi,tu,lo,esto,esta,este".split(
    ",",
  ),
);

/** Busca los chunks académicos más relevantes por similitud coseno. Si el índice
 *  o el embedding fallan, cae a coincidencia por palabras.
 *  `baseUrl` opcional: origin del request actual para localizar el índice estático. */
export async function buscarAcademico(
  query: string,
  topK = 5,
  baseUrl?: string,
): Promise<ChunkAcademico[]> {
  const q = query.toLowerCase();
  const cache = await cargarIndice(baseUrl);

  if (cache) {
    try {
      const qv = normalizar(await generarEmbedding(query));
      const scored = cache.indice.chunks
        .map((c, i) => ({
          texto: c.texto,
          similitud: coseno(qv, cache.vectores[i]!),
          categoria: c.categoria,
          archivo: c.archivo,
          pagina: c.pagina,
          offset: c.offset,
        }))
        .sort((a, b) => b.similitud - a.similitud)
        .slice(0, topK);
      if (scored.some((s) => s.similitud > 0.2)) return scored;
    } catch {
      /* caer al fallback */
    }
  }

  // Fallback keyword sobre el texto del índice (si está cargado) o vacío.
  if (cache) {
    const terms = q.split(/\s+/).filter((t) => t.length > 3 && !STOPWORDS.has(t));
    return cache.indice.chunks
      .map((c) => {
        const t = c.texto.toLowerCase();
        const coincidencias = terms.reduce((n, term) => n + (t.includes(term) ? 1 : 0), 0);
        return {
          texto: c.texto,
          similitud: coincidencias / Math.max(1, terms.length),
          categoria: c.categoria,
          archivo: c.archivo,
          pagina: c.pagina,
          offset: c.offset,
        };
      })
      .filter((r) => r.similitud > 0)
      .sort((a, b) => b.similitud - a.similitud)
      .slice(0, topK);
  }
  return [];
}

export function resetIndiceCache() {
  indiceCache = null;
}
