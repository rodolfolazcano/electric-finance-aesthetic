/**
 * Carga datos JSON desde Supabase Storage con caché en memoria.
 * Reemplaza los `import ... from "*.json"` estáticos para reducir el bundle.
 *
 * USO:
 *   import { loadJson } from "@/lib/supabase-loader";
 *   const data = await loadJson("unificado_completo.json");
 *
 * REQUISITO:
 *   VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env
 *
 * BUCKET: clarity-data (crear manualmente en Supabase Dashboard → Storage)
 */

import { supabase } from "./supabase";

const BUCKET = "clarity-data";

//  Caché en memoria (evita re-descargar en la misma sesión) 
const cache = new Map<string, any>();

/**
 * URL pública directa (sin autenticación) si el bucket es público.
 * Usar esta vía si el bucket está configurado como público.
 */
function publicUrl(filename: string): string {
  if (!supabase) return "";
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return data?.publicUrl ?? "";
}

/**
 * Carga un JSON desde Supabase Storage.
 * - Primero busca en caché en memoria.
 * - Si no está en caché, descarga desde Supabase.
 * - En desarrollo (sin Supabase configurado), usa el import local como fallback.
 */
export async function loadJson<T = any>(filename: string): Promise<T> {
  // 1. Caché en memoria
  const cached = cache.get(filename);
  if (cached !== undefined) return cached as T;

  // 2. Sin Supabase configurado → fallback a import dinámico local (DEV)
  if (!supabase) {
    console.warn(
      `[supabase-loader] Supabase no configurado. Usando fallback local para ${filename}`,
    );
    const data = await localFallback<T>(filename);
    cache.set(filename, data);
    return data;
  }

  // 3. Descargar desde Supabase Storage
  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(filename);
    if (error) throw error;
    const text = await data.text();
    const json = JSON.parse(text) as T;
    cache.set(filename, json);
    return json;
  } catch (err) {
    console.error(`[supabase-loader] Error al descargar ${filename}:`, err);
    // Fallback local si la descarga falla
    const fallback = await localFallback<T>(filename);
    cache.set(filename, fallback);
    return fallback;
  }
}

/**
 * Carga desde URL pública (más rápida que download, requiere bucket público).
 */
export async function loadJsonPublic<T = any>(filename: string): Promise<T> {
  const cached = cache.get(filename);
  if (cached !== undefined) return cached as T;

  if (!supabase) {
    const data = await localFallback<T>(filename);
    cache.set(filename, data);
    return data;
  }

  try {
    const url = publicUrl(filename);
    if (!url) throw new Error("No se pudo obtener URL pública");
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as T;
    cache.set(filename, json);
    return json;
  } catch (err) {
    console.error(`[supabase-loader] Error al cargar ${filename}:`, err);
    const fallback = await localFallback<T>(filename);
    cache.set(filename, fallback);
    return fallback;
  }
}

/**
 * Fallback para desarrollo: importa el JSON localmente.
 * Cuando el JSON se elimine del proyecto, esto fallará y mostrará un error claro.
 */
async function localFallback<T>(filename: string): Promise<T> {
  // Normaliza: "data/unificado_completo.json" -> "unificado_completo.json"
  const basename = filename.split("/").pop() ?? filename;
  // Mapa de archivos conocidos a sus módulos locales (solo para desarrollo)
  const LOCAL_IMPORTS: Record<string, () => Promise<any>> = {
    "unificado_completo.json": () =>
      import("@/data/unificado_completo.json").then((m) => m.default ?? m),
    "sectores.json": () => import("@/lib/sectores.json").then((m) => m.default ?? m),
    "RENTA_FIJA_COMPLETA.json": () =>
      import("@/../RENTA_FIJA_COMPLETA.json").then((m) => m.default ?? m),
    "bonos.json": () => import("@/data/bonos.json").then((m) => m.default ?? m),
    "perfiles_inversor_unificado.json": () =>
      import("@/data/perfiles_inversor_unificado.json").then((m) => m.default ?? m),
    "cedears-universe.json": () =>
      import("@/data/cedears-universe.json").then((m) => m.default ?? m),
    "arbitrador.json": () => import("@/data/arbitrador.json").then((m) => m.default ?? m),
    "benchmarks-complete.json": () =>
      import("@/lib/sectores/benchmarks-complete.json").then((m) => m.default ?? m),
    "etf-names.json": () => import("@/lib/sectores/etf-names.json").then((m) => m.default ?? m),
    "tickers-moneda.json": () => import("@/lib/tickers-moneda.json").then((m) => m.default ?? m),
    "bcba-cedears.json": () => import("@/lib/bcba-cedears.json").then((m) => m.default ?? m),
    "sectores-bcba.json": () => import("@/lib/sectores-bcba.json").then((m) => m.default ?? m),
    "cedears-base.json": () => import("@/lib/cedears-base.json").then((m) => m.default ?? m),
    "casos-referencia.json": () =>
      import("@/lib/renta-fija/__fixtures__/casos-referencia.json").then((m) => m.default ?? m),
  };

  const loader = LOCAL_IMPORTS[basename];
  if (loader) return loader();

  throw new Error(
    `[supabase-loader] No hay fallback local para "${filename}". ` +
      `Verificá que el archivo exista en Supabase Storage (bucket "${BUCKET}").`,
  );
}

/**
 * Limpia la caché (forzar recarga en el próximo acceso).
 */
export function clearJsonCache(): void {
  cache.clear();
}

/**
 * Precarga múltiples archivos en paralelo.
 */
export async function preloadJson(files: string[]): Promise<void> {
  await Promise.all(files.map((f) => loadJson(f).catch(() => null)));
}

/**
 * Carga un archivo de TEXTO (markdown, txt, csv) desde Supabase Storage.
 * Pensado para que la AI copilot cargue metodología, libros y documentación del bucket.
 * El bucket clarity-data es público: usa fetch a la URL pública (sin auth del lado cliente).
 * - filename incluye el prefijo: "contexto/CLARITY_CONTEXT.md", "contexto/murphy-metodologia.json"
 */
export async function loadText(filename: string): Promise<string> {
  const cached = cache.get(`txt:${filename}`);
  if (cached !== undefined) return cached as string;

  // Sin Supabase → string vacío (la AI usará su prompt base)
  if (!supabase) {
    cache.set(`txt:${filename}`, "");
    return "";
  }

  try {
    const { data, error } = await supabase.storage.from(BUCKET).download(filename);
    if (error) throw error;
    const text = await data.text();
    cache.set(`txt:${filename}`, text);
    return text;
  } catch (err) {
    console.error(`[supabase-loader] Error al descargar texto ${filename}:`, err);
    cache.set(`txt:${filename}`, "");
    return "";
  }
}

/**
 * Carga la metodología Murphy desde Supabase Storage (JSON con los 15 capítulos).
 * Devuelve null si no está disponible (la AI usa el BASE_SYSTEM_PROMPT hardcoded).
 */
export async function loadMurphyMetodologia(): Promise<MurphyMetodologia | null> {
  try {
    return await loadJson<MurphyMetodologia>("contexto/murphy-metodologia.json");
  } catch {
    return null;
  }
}

export interface MurphyCapitulo {
  n: number | string;
  titulo: string;
  reglaClave: string;
}
export interface MurphyMetodologia {
  fuente: string;
  totalCapitulos: number;
  descripcion: string;
  capitulos: MurphyCapitulo[];
  divergenciasDetectables: string[];
}
