// @ts-nocheck
// Biblioteca de contexto de solo lectura alojada en un bucket público externo.
// No se migra nada: se lee por HTTP y se cachea troceado en `context_library`.
// Server-only.

const BUCKET = "clarity-data";

/** Documentos que se inyectan SIEMPRE como bloque fijo del system prompt. */
export const FIXED_CONTEXT_PATHS = [
  "contexto/murphy-metodologia.json",
  "contexto/metodologia-plan-mode-agente-coronar-ai.md",
] as const;

/** PDFs y textos largos: se trocean y se cachean bajo demanda. */
export const LIBRARY_DOCS: Array<{ path: string; title: string }> = [
  { path: "libros/manual-negociacion-libro.pdf", title: "Manual de Negociación" },
  { path: "libros/gwr-62-cuello-botella.pdf", title: "GWR #62 — economía cuello de botella" },
  { path: "libros/gwr-63-liquidez-spreads.pdf", title: "GWR #63 — liquidez y spreads" },
  { path: "libros/informe-renta-fija-100726.pdf", title: "Informe renta fija 10/07" },
  { path: "libros/informe-renta-fija-140726.pdf", title: "Informe renta fija 14/07" },
  { path: "contexto/contabilidad-finanzas-completo.txt", title: "Contabilidad y Finanzas" },
];

function baseUrl(): string | null {
  const raw = process.env.CONTEXT_LIBRARY_SUPABASE_URL?.trim();
  if (!raw) return null;
  return `${raw.replace(/\/+$/, "")}/storage/v1/object/public/${BUCKET}`;
}

export function isLibraryConfigured(): boolean {
  return baseUrl() !== null;
}

async function fetchLibrary(path: string, timeoutMs = 45_000): Promise<Response | null> {
  const base = baseUrl();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}/${path}`, { signal: controller.signal });
    return res.ok ? res : null;
  } catch (error) {
    console.error("[context-library] fallo al traer", path, error);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLibraryText(path: string): Promise<string | null> {
  const res = await fetchLibrary(path);
  return res ? res.text() : null;
}

export async function fetchLibraryBytes(path: string): Promise<Uint8Array | null> {
  const res = await fetchLibrary(path);
  return res ? new Uint8Array(await res.arrayBuffer()) : null;
}

// --- Bloque fijo de metodología --------------------------------------------

type MurphyChapter = { n?: number | string; titulo?: string; reglaClave?: string };

function renderMurphy(raw: string): string {
  try {
    const data = JSON.parse(raw) as {
      capitulos?: MurphyChapter[];
      divergenciasDetectables?: string[];
    };
    const chapters = (data.capitulos ?? [])
      .map((c) => `Cap. ${c.n} — ${c.titulo}: ${c.reglaClave}`)
      .join("\n");
    const divergences = (data.divergenciasDetectables ?? []).map((d) => `- ${d}`).join("\n");
    return `${chapters}${divergences ? `\n\nDivergencias detectables:\n${divergences}` : ""}`;
  } catch {
    return raw.slice(0, 8000);
  }
}

let methodologyCache: { value: string; at: number } | null = null;
const METHODOLOGY_TTL_MS = 30 * 60 * 1000;

/** Marco Murphy + metodología plan-mode, cacheado en memoria del worker. */
export async function getMethodologyBlock(): Promise<string> {
  if (methodologyCache && Date.now() - methodologyCache.at < METHODOLOGY_TTL_MS) {
    return methodologyCache.value;
  }
  if (!isLibraryConfigured()) return "";

  const [murphyRaw, planMode] = await Promise.all([
    fetchLibraryText(FIXED_CONTEXT_PATHS[0]),
    fetchLibraryText(FIXED_CONTEXT_PATHS[1]),
  ]);

  const parts: string[] = [];
  if (murphyRaw) {
    parts.push(`MARCO INTERMARKET (John Murphy — 15 capítulos) [contexto:murphy]:\n${renderMurphy(murphyRaw)}`);
  }
  if (planMode) {
    parts.push(
      `METODOLOGÍA PLAN-MODE CORONAR AI [contexto:metodologia]:\n${planMode.slice(0, 12_000)}`,
    );
  }
  const value = parts.join("\n\n");
  methodologyCache = { value, at: Date.now() };
  return value;
}

// --- Indexado troceado de los PDFs / textos largos --------------------------

const CHUNK_CHARS = 6_000;

function chunk(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) out.push(text.slice(i, i + CHUNK_CHARS));
  return out.slice(0, 120);
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes, useWorkerFetch: false })
    .promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: unknown) => (item && typeof item === "object" && "str" in item ? String((item as { str: string }).str) : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(text);
  }
  return pages.join("\n\n");
}

/**
 * Trae el documento, lo trocea y lo guarda en `context_library`. Si ya está
 * cacheado no vuelve a pegarle al bucket.
 */
export async function ensureLibraryDocIndexed(path: string, title: string): Promise<number> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { count } = await supabaseAdmin
    .from("context_library")
    .select("id", { count: "exact", head: true })
    .like("path", `${path}#%`);
  if ((count ?? 0) > 0) return count ?? 0;

  let text: string | null = null;
  if (path.toLowerCase().endsWith(".pdf")) {
    const bytes = await fetchLibraryBytes(path);
    if (bytes) text = await extractPdfText(bytes);
  } else {
    text = await fetchLibraryText(path);
  }
  if (!text) return 0;

  const rows = chunk(text).map((piece, index) => ({
    path: `${path}#${index}`,
    title,
    kind: path.split("/")[0] ?? "doc",
    text_content: piece,
    token_estimate: Math.ceil(piece.length / 4),
    chunk_index: index,
  }));
  if (!rows.length) return 0;
  const { error } = await supabaseAdmin.from("context_library").upsert(rows, { onConflict: "path" });
  if (error) {
    console.error("[context-library] no se pudo cachear", path, error.message);
    return 0;
  }
  return rows.length;
}

export async function indexLibrary(): Promise<Array<{ title: string; chunks: number }>> {
  if (!isLibraryConfigured()) return [];
  const out: Array<{ title: string; chunks: number }> = [];
  for (const doc of LIBRARY_DOCS) {
    try {
      out.push({ title: doc.title, chunks: await ensureLibraryDocIndexed(doc.path, doc.title) });
    } catch (error) {
      console.error("[context-library] indexado falló", doc.path, error);
      out.push({ title: doc.title, chunks: 0 });
    }
  }
  return out;
}

/** Búsqueda léxica simple sobre los fragmentos cacheados. */
export async function searchLibrary(query: string, limit = 4): Promise<
  Array<{ title: string; path: string; text: string }>
> {
  const terms = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 4)
    .slice(0, 6);
  if (!terms.length) return [];

  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const { data, error } = await supabaseAdmin
    .from("context_library")
    .select("path, title, text_content")
    .or(terms.map((t) => `text_content.ilike.%${t}%`).join(","))
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({ title: row.title, path: row.path, text: row.text_content }));
}
