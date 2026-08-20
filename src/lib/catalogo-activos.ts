/**
 * Catálogo unificado de activos operables.
 *
 * Fuente: `src/lib/data/unificado-completo.json` (paneles de sectores →
 * industrias → activos). Este módulo normaliza ese JSON y lo convierte en un
 * mapa que el agente puede consultar: por ticker, nombre, sector, industria,
 * tipo/moneda/pais, más la resolución al símbolo real de Yahoo Finance.
 *
 * Es un módulo de servidor (no se importa desde el cliente web).
 */

import catalogoJson from "@/lib/data/unificado-completo.json";

export type TipoActivo =
  | "accion"
  | "cedear"
  | "etf"
  | "fci"
  | "titulo_publico"
  | "on"
  | "bono"
  | "caucion"
  | "letra"
  | "indice"
  | "moneda"
  | "commodity"
  | "otro";

export interface ActivoCatalogo {
  ticker: string;
  nombre: string;
  tipo: TipoActivo;
  moneda: string | null;
  mercado: string | null;
  pais: string | null;
  sector: string;
  industria: string;
}

interface ActivoRaw {
  ticker?: string;
  nombre?: string;
  tipo?: string;
  moneda?: string;
  mercado?: string;
  pais?: string;
}

interface SectorRaw {
  industrias?: Record<string, ActivoRaw[]>;
  etfs?: unknown;
}

type CatalogoRaw = {
  version?: string;
  lastUpdated?: string;
  sectores?: Record<string, SectorRaw>;
};

function normalizarTipo(t: string | undefined): TipoActivo {
  const v = (t ?? "").toLowerCase().trim();
  if (!v) return "otro";
  if (v === "accion" || v === "acciones") return "accion";
  if (v === "cedear" || v === "cedears" || v.includes("cedear")) return "cedear";
  if (v === "etf" || v === "etfs" || v.includes("etf")) return "etf";
  if (v.includes("fci") || v.includes("fondo")) return "fci";
  if (v.includes("titulo_publico") || v.includes("titulos_publicos")) return "titulo_publico";
  if (v === "on" || v.includes("obligacion neg")) return "on";
  if (v === "bono" || v.includes("bono")) return "bono";
  if (v === "caucion" || v.includes("caucion")) return "caucion";
  if (v === "letra" || v.includes("letra")) return "letra";
  if (v === "indice" || v.includes("indice") || v.includes("índice")) return "indice";
  if (v === "moneda" || v.includes("moneda")) return "moneda";
  if (v.includes("commodity") || v.includes("materia")) return "commodity";
  return "otro";
}

function normalizarTicker(t: string | undefined): string {
  return (t ?? "").trim().toUpperCase();
}

/** Aplana el JSON a una lista plana de activos (sin deduplicar aún). */
function aplanar(raw: CatalogoRaw): ActivoCatalogo[] {
  const out: ActivoCatalogo[] = [];
  const sectores = raw.sectores ?? {};
  for (const [sector, sectorRaw] of Object.entries(sectores)) {
    const industrias = sectorRaw?.industrias ?? {};
    for (const [industria, lista] of Object.entries(industrias)) {
      for (const a of lista ?? []) {
        const ticker = normalizarTicker(a?.ticker);
        if (!ticker) continue;
        out.push({
          ticker,
          nombre: (a?.nombre ?? "").trim() || ticker,
          tipo: normalizarTipo(a?.tipo),
          moneda: (a?.moneda ?? "").trim().toUpperCase() || null,
          mercado: (a?.mercado ?? "").trim() || null,
          pais: (a?.pais ?? "").trim() || null,
          sector,
          industria,
        });
      }
    }
    // ETFs de nivel sector (campo etfs, casi siempre vacío)
    const etfs = sectorRaw?.etfs;
    if (Array.isArray(etfs)) {
      for (const e of etfs as ActivoRaw[]) {
        const ticker = normalizarTicker(e?.ticker);
        if (!ticker) continue;
        out.push({
          ticker,
          nombre: (e?.nombre ?? "").trim() || ticker,
          tipo: normalizarTipo(e?.tipo) === "otro" ? "etf" : normalizarTipo(e?.tipo),
          moneda: (e?.moneda ?? "").trim().toUpperCase() || null,
          mercado: (e?.mercado ?? "").trim() || null,
          pais: (e?.pais ?? "").trim() || null,
          sector,
          industria: "ETFs del sector",
        });
      }
    }
  }
  return out;
}

/** Peso de "completitud" para elegir la entrada más rica por ticker. */
function completitud(a: ActivoCatalogo): number {
  let n = 0;
  if (a.nombre) n += 2;
  if (a.tipo !== "otro") n += 3;
  if (a.moneda) n += 2;
  if (a.mercado) n += 2;
  if (a.pais) n += 1;
  return n;
}

interface IndiceActivo {
  porTicker: Map<string, ActivoCatalogo>;
  lista: ActivoCatalogo[];
  porSector: Map<string, ActivoCatalogo[]>;
  porIndustria: Map<string, ActivoCatalogo[]>;
}

let cache: IndiceActivo | null = null;

function indice(): IndiceActivo {
  if (cache) return cache;
  const lista = aplanar(catalogoJson as CatalogoRaw);
  const porTicker = new Map<string, ActivoCatalogo>();
  for (const a of lista) {
    const actual = porTicker.get(a.ticker);
    if (!actual || completitud(a) > completitud(actual)) porTicker.set(a.ticker, a);
  }
  const porSector = new Map<string, ActivoCatalogo[]>();
  const porIndustria = new Map<string, ActivoCatalogo[]>();
  for (const a of lista) {
    const ss = porSector.get(a.sector);
    if (ss) ss.push(a);
    else porSector.set(a.sector, [a]);
    const ii = porIndustria.get(a.industria);
    if (ii) ii.push(a);
    else porIndustria.set(a.industria, [a]);
  }
  cache = { porTicker, lista, porSector, porIndustria };
  return cache;
}

function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Lista completa de activos (deduplicada por ticker, entrada más rica). */
export function todosLosActivos(): ActivoCatalogo[] {
  return [...indice().porTicker.values()];
}

/** Activo por ticker exacto (mayúsculas/acentos-insensibles). */
export function activoPorTicker(ticker: string): ActivoCatalogo | null {
  const t = normalizarTicker(ticker);
  return indice().porTicker.get(t) ?? null;
}

/** Sectores disponibles. */
export function listarSectores(): { sector: string; cantidad: number }[] {
  return [...indice().porSector.entries()]
    .map(([sector, lista]) => ({ sector, cantidad: lista.length }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

/** Industrias de un sector. */
export function porSector(sector: string): ActivoCatalogo[] {
  const s = normText(sector).trim();
  if (!s) return [];
  const exacto = indice().porSector.get(sector);
  if (exacto) return exacto;
  return [...indice().porSector.entries()].find(([nombre]) => normText(nombre) === s)?.[1] ?? [];
}

/** Activos de una industria puntual. */
export function porIndustria(industria: string): ActivoCatalogo[] {
  return indice().porIndustria.get(industria) ?? [];
}

/**
 * Búsqueda flexible en el catálogo: por ticker, por nombre, por sector o por
 * industria (substring, sin acentos). Devuelve hasta `limite` resultados.
 */
export function buscarEnCatalogo(
  criterio: string,
  limite = 40,
): {
  ticker: ActivoCatalogo[];
  nombre: ActivoCatalogo[];
  sector: ActivoCatalogo[];
} {
  const q = normText(criterio).trim();
  if (!q) return { ticker: [], nombre: [], sector: [] };
  const rTicker: ActivoCatalogo[] = [];
  const rNombre: ActivoCatalogo[] = [];
  const rSector: ActivoCatalogo[] = [];
  const seen = new Set<string>();
  const lista = todosLosActivos();
  for (const a of lista) {
    if (rTicker.length + rNombre.length + rSector.length >= limite * 3) break;
    const key = a.ticker;
    if (seen.has(key)) continue;
    if (normText(a.ticker) === q || normText(a.ticker).startsWith(q)) {
      rTicker.push(a);
      seen.add(key);
      continue;
    }
    if (normText(a.nombre).includes(q)) rNombre.push(a);
    if (normText(a.sector).includes(q) || normText(a.industria).includes(q)) {
      rSector.push(a);
    }
  }
  return {
    ticker: rTicker.slice(0, limite),
    nombre: rNombre.slice(0, limite),
    sector: rSector.slice(0, limite),
  };
}

/** Quita el sufijo .BA si existe. */
function sinSufijo(t: string): string {
  return t.endsWith(".BA") ? t.slice(0, -3) : t;
}

/**
 * Resuelve el símbolo REAL de Yahoo Finance para operar (histórico, quote,
 * beta, etc.) a partir de un ticker del catálogo:
 *
 * - CEDEARs locales (moneda ARS, mercado BCBA) → subyacente (ej. 'GGAL' →
 *   'GGAL.BA'; 'AAPL' → 'AAPL.BA').
 * - CEDEARs en USD o acciones locales listadas en BCBA → `${base}.BA`.
 * - Acciones de EE.UU. (NYSE/NASDAQ) → el ticker tal cual.
 * - Símbolos ya formados (^GSPC, AAPL, SPY, BTC-USD) → se respetan.
 */
export function simboloYahoo(ticker: string): string {
  const t = normalizarTicker(ticker);
  if (!t) return t;
  if (/^[\^=]/.test(t) || t === "MERVAL") return t.startsWith("MERVAL") ? "^MERV" : t;
  if (t.includes("-") || t.includes("=")) return t;
  const a = activoPorTicker(t);
  const base = sinSufijo(t);
  if (!a) {
    // Sin entrada rica: si termina en .BA queda; si es CEDEAR D (ej. HOND,
    // MMMD, LMTD) el subyacente es sin la D final.
    if (t.endsWith(".BA")) return t;
    if (/^[A-Z0-9]+D$/.test(t) && t.length > 3) return `${t}.BA`;
    return t;
  }
  if (a.mercado && /NYSE|NASDAQ|NYSE\/NASDAQ/.test(a.mercado)) return base;
  if (a.pais && !/Argentina/i.test(a.pais) && a.tipo === "cedear") return base;
  if (a.tipo === "cedear") {
    return `${base}.BA`;
  }
  if (a.mercado === "BCBA" || a.pais === "Argentina") return `${base}.BA`;
  return base;
}

/** Subyacente de mercado de un CEDEAR local (para beta vs benchmarks). */
export function subyacenteYahoo(ticker: string): string {
  const t = normalizarTicker(ticker);
  if (!t.endsWith(".BA")) return simboloYahoo(t);
  const base = sinSufijo(t);
  const a = activoPorTicker(t) ?? activoPorTicker(base);
  if (a?.tipo === "cedear") {
    if (/^[A-Z0-9]+D$/.test(base) && base.length > 3) return base.slice(0, -1);
    return base;
  }
  return base;
}

/** Aliases usados por el agente para nombres técnicos. */
export function aliasActivo(consulta: string): string | null {
  const q = normText(consulta).trim();
  if (!q) return null;
  const a = activoPorTicker(consulta);
  if (a) return a.ticker;
  const enC = buscarEnCatalogo(consulta, 1);
  const cand = enC.ticker[0] ?? enC.nombre[0] ?? enC.sector[0];
  return cand?.ticker ?? null;
}
