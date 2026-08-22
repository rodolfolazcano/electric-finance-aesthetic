import { createServerFn } from "@tanstack/react-start";

/**
 * Parser autónomo para paste IOL (como el pegado por el usuario)
 * Detecta ticker, cantidad, precio, montos y clasifica por tipo/moneda/mercado
 * replica logica de clarity-dashboard diagnostico/clasificador.ts
 */

export type ActivoPaste = {
  tickerRaw: string;
  tickerNorm: string; // ej PAMP, AMZN, PAMP.BA
  cantidad: number | null;
  ultimoOperado: number | null;
  precioPromedio: number | null;
  variacion24h: number | null;
  montoARS: number | null;
  rendimientoPct: number | null;
  seccion?: "acciones" | "cedears" | "otros";
  textoBloque?: string;
};

export type ActivoClasificado = ActivoPaste & {
  tipo: "cedear" | "accion" | "adr" | "etf" | "bono" | "on" | "letra" | "fci";
  subtipo: string;
  categoriaMacro: "RentaVariable" | "RentaFija";
  mercado: "BCBA" | "NYSE/NASDAQ";
  moneda: "ARS" | "USD" | "USD.C";
  fuentePrecio: "IOL" | "Yahoo" | "ArgentinaDatos";
  nombre: string | null;
};

// Carga lazy de JSONs (unificado + cedears)
let SECTORES: any = null;
let CEDEARS_UNIVERSE: any = null;
let BONOS_DB: any = null;

async function loadDbs() {
  if (SECTORES) return;
  try {
    const [sectoresMod, cedearsMod, bonosMod] = await Promise.all([
      import("@/data/unificado_completo.json"),
      import("@/data/cedears-universe.json"),
      import("@/data/bonos.json"),
    ]);
    SECTORES = (sectoresMod as any).default ?? sectoresMod;
    CEDEARS_UNIVERSE = (cedearsMod as any).default ?? cedearsMod;
    BONOS_DB = (bonosMod as any).default ?? bonosMod;
  } catch {
    // fallback a lib
    try {
      const [s2, c2] = await Promise.all([
        import("@/lib/sectores.json"),
        import("@/lib/bcba-cedears.json"),
      ]);
      SECTORES = (s2 as any).default ?? s2;
      CEDEARS_UNIVERSE = { ARS: [], USD: [] };
    } catch {}
  }
}

function buscarEnSectores(ticker: string): any | null {
  if (!SECTORES) return null;
  // SECTORES puede ser { sectores: { ... } } o plano
  const root = SECTORES.sectores ?? SECTORES;
  const tk = ticker.toUpperCase();
  for (const sec of Object.values(root) as any[]) {
    const inds = (sec as any).industrias ?? sec;
    for (const lista of Object.values(inds) as any[]) {
      if (!Array.isArray(lista)) continue;
      const found = (lista as any[]).find((t: any) => t.ticker?.toUpperCase() === tk || t.ticker?.toUpperCase() === tk + ".BA");
      if (found) return found;
    }
  }
  return null;
}

function clasificar(tickerRaw: string, contexto?: { seccionCedears?: boolean }): { tipo: ActivoClasificado["tipo"]; subtipo: string; categoriaMacro: ActivoClasificado["categoriaMacro"]; mercado: ActivoClasificado["mercado"]; moneda: ActivoClasificado["moneda"]; fuentePrecio: ActivoClasificado["fuentePrecio"]; nombre: string | null } {
  const t = tickerRaw.toUpperCase().trim();
  const clean = t.replace(".BA", "");
  // bonos
  if (BONOS_DB && BONOS_DB[t]) {
    const b = BONOS_DB[t];
    if (b.tipo?.startsWith("ON")) return { tipo: "on", subtipo: "ON", categoriaMacro: "RentaFija", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: b.nombre ?? null };
    return { tipo: "bono", subtipo: "Bono", categoriaMacro: "RentaFija", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: b.nombre ?? null };
  }
  if (/^[ST]\d{2}[A-Z][A-Z0-9]?$/i.test(t)) {
    return { tipo: "letra", subtipo: "Letra", categoriaMacro: "RentaFija", mercado: "BCBA", moneda: "ARS", fuentePrecio: "ArgentinaDatos", nombre: null };
  }
  // RAZONAMIENTO POR SECCION Y MAPEO: replica Optimizador tab (sin text.contains)
  // Si el ticker aparece bajo sección Cedears, el modelo razona que es CEDEAR BCBA ARS
  // y lo valida contra unificado_completo.json (tipo + mercado), no contra substring del header
  if (contexto?.seccionCedears === true) {
    const foundAccionLocal = buscarEnSectores(t) ?? buscarEnSectores(clean);
    if (foundAccionLocal && foundAccionLocal.tipo === "accion" && foundAccionLocal.pais === "Argentina") {
      return { tipo: "accion", subtipo: "Accion", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: foundAccionLocal.nombre ?? null };
    }
    if (/^[A-Z]{1,5}$/.test(clean)) {
      const found = buscarEnSectores(clean) ?? buscarEnSectores(t);
      if (found && found.tipo === "accion" && found.pais === "EE.UU.") {
        return { tipo: "cedear", subtipo: "CEDEAR", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: found.nombre ?? null };
      }
      const etfsCedear = new Set(["SPY", "SMH", "URA", "XLE"]);
      if (etfsCedear.has(clean)) return { tipo: "cedear", subtipo: "CEDEAR-ETF", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: found?.nombre ?? null };
      return { tipo: "cedear", subtipo: "CEDEAR", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: found?.nombre ?? clean };
    }
  }
  // cedears sets (validación normal)
  const cedearsARS = new Set<string>((CEDEARS_UNIVERSE?.ARS ?? []).map((x: string) => x.toUpperCase() + ".BA"));
  const cedearsUSD = new Set<string>((CEDEARS_UNIVERSE?.USD ?? []).map((x: string) => x.toUpperCase()));
  if (cedearsARS.has(t) || cedearsARS.has(t + ".BA") || cedearsUSD.has(clean)) {
    const found = buscarEnSectores(clean) ?? buscarEnSectores(t);
    return { tipo: "cedear", subtipo: "CEDEAR", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: found?.nombre ?? null };
  }
  // buscar en sectores
  const found = buscarEnSectores(t) ?? buscarEnSectores(clean);
  if (found) {
    if (found.tipo === "cedear") return { tipo: "cedear", subtipo: "CEDEAR", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: found.moneda === "USD" ? "USD" : "ARS", fuentePrecio: "IOL", nombre: found.nombre ?? null };
    if (found.tipo === "accion" && found.pais === "EE.UU.") return { tipo: "adr", subtipo: "ADR", categoriaMacro: "RentaVariable", mercado: "NYSE/NASDAQ", moneda: "USD", fuentePrecio: "Yahoo", nombre: found.nombre ?? null };
    if (found.tipo === "accion") return { tipo: "accion", subtipo: t.endsWith(".BA") ? "Accion" : "Accion", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: found.nombre ?? null };
  }
  // fallback ETFs / US tickers conocidos (solo si no es sección Cedears)
  const etfs = new Set(["SPY", "SMH", "URA", "XLE", "QQQ", "IWM", "DIA"]);
  if (etfs.has(clean) && contexto?.seccionCedears !== true) return { tipo: "etf", subtipo: "ETF", categoriaMacro: "RentaVariable", mercado: "NYSE/NASDAQ", moneda: "USD", fuentePrecio: "Yahoo", nombre: null };
  if (/^[A-Z]{1,5}$/.test(clean)) {
    if (t.endsWith(".BA")) return { tipo: "accion", subtipo: "Accion", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: null };
    return { tipo: "adr", subtipo: "ADR", categoriaMacro: "RentaVariable", mercado: "NYSE/NASDAQ", moneda: "USD", fuentePrecio: "Yahoo", nombre: null };
  }
  return { tipo: "accion", subtipo: "Accion", categoriaMacro: "RentaVariable", mercado: "BCBA", moneda: "ARS", fuentePrecio: "IOL", nombre: null };
}

function parseARS(s: string | null): number | null {
  if (!s) return null;
  const clean = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(clean);
  return Number.isFinite(n) ? n : null;
}

export function parsePortfolioPaste(text: string): { activos: ActivoPaste[]; resumen: { patrimonioTotal?: number; montoEnActivos?: number; saldoARS?: number; saldoUSD?: number } } {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const activos: ActivoPaste[] = [];
  let patrimonioTotal: number | null = null;
  let montoEnActivos: number | null = null;

  // detectar patrimonio
  for (const l of lines) {
    if (l.includes("Patrimonio total") || l.includes("ARS 25.712")) {
      const m = l.match(/ARS\s*([\d\.\,]+)/);
      if (m) patrimonioTotal = parseARS(m[1]);
    }
    if (l.includes("Monto en activos")) {
      const idx = lines.indexOf(l);
      const next = lines[idx + 1] ?? "";
      const m2 = next.match(/ARS\s*([\d\.\,]+)/) ?? l.match(/ARS\s*([\d\.\,]+)/);
      if (m2) montoEnActivos = parseARS(m2[1]);
    }
  }

  // Tracking de sección: Cedears vs Acciones (para razonar moneda)
  let seccionActual: "acciones" | "cedears" | "otros" = "otros";
  const seccionPorIndice = new Map<number, typeof seccionActual>();
  for (let idx = 0; idx < lines.length; idx++) {
    const l = lines[idx].toLowerCase();
    if (l.includes("cedears")) seccionActual = "cedears";
    else if (l.includes("acciones") && !l.includes("cedears")) seccionActual = "acciones";
    else if (l.includes("dólares") || l.includes("pesos") || l.includes("dolar")) seccionActual = "otros";
    seccionPorIndice.set(idx, seccionActual);
  }

  // cada activo viene en bloque: TICKER ... ARS ... cantidad ... variacion
  // patrón simplificado: línea con ticker solo (ej "PAMP") seguida de detalles
  const tickerLine = /^[A-Z]{2,5}(\.BA)?$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!tickerLine.test(line)) continue;
    // es posible que sea un ticker válido
    const tickerRaw = line;
    const seccion = seccionPorIndice.get(i) ?? "otros";
    // buscar bloque siguiente de 6 líneas para extraer datos
    const windowArr = lines.slice(i + 1, i + 12);
    const window = windowArr.join(" | ");
    // cantidad: número entero pequeño (ej 74, 209)
    let cantidad: number | null = null;
    const cantMatch = window.match(/\|\s*(\d{1,4})\s*\|\s*[\d,\-]+\s*%\s*↗?↘?/);
    if (cantMatch) cantidad = parseInt(cantMatch[1], 10);
    // variación 24h
    let variacion: number | null = null;
    const varMatch = window.match(/([\-]?\d+[\.,]\d+)\s*%\s*↗|↘/);
    if (varMatch) variacion = parseFloat(varMatch[1].replace(",", "."));
    // último operado ARS X.XXX,XX
    let ultimo: number | null = null;
    const ultMatch = window.match(/ARS\s*([\d\.\,]+)\s*\|\s*ARS/);
    if (ultMatch) ultimo = parseARS(ultMatch[1]);
    // monto ARS final (ej ARS 375.550,00)
    let monto: number | null = null;
    const montoMatch = window.match(/ARS\s*([\d\.\,]+)\s*$/);
    if (montoMatch) monto = parseARS(montoMatch[1]);

    // solo agregar si parece activo real (tiene cantidad o monto)
    if (cantidad != null || monto != null || ultimo != null) {
      activos.push({
        tickerRaw,
        tickerNorm: tickerRaw.toUpperCase(),
        cantidad,
        ultimoOperado: ultimo,
        precioPromedio: null, // se extrae si hay 2 valores ARS seguidos
        variacion24h: variacion,
        montoARS: monto,
        rendimientoPct: null,
        seccion,
        textoBloque: window,
      });
    }
  }

  // fallback: si no detectó nada, buscar cualquier línea con "| CEDEAR" o "| Pampa"
  if (activos.length === 0) {
    for (const l of lines) {
      const m = l.match(/^([A-Z]{2,5})\s+\([\d\.]+%\)\s*\|\s*(.+)/);
      if (m) {
        activos.push({
          tickerRaw: m[1],
          tickerNorm: m[1],
          cantidad: null,
          ultimoOperado: null,
          precioPromedio: null,
          variacion24h: null,
          montoARS: null,
          rendimientoPct: null,
        });
      }
    }
  }

  return { activos, resumen: { patrimonioTotal: patrimonioTotal ?? undefined, montoEnActivos: montoEnActivos ?? undefined } };
}

export const analizarPortfolioPegado = createServerFn({ method: "POST" })
  .inputValidator((d: { texto: string }) => d)
  .handler(async ({ data }): Promise<{ clasificados: ActivoClasificado[]; resumen: any; tablaMarkdown: string }> => {
    await loadDbs();
    const { activos, resumen } = parsePortfolioPaste(data.texto);
    const clasificados: ActivoClasificado[] = activos.map((a) => {
      const c = clasificar(a.tickerRaw, { seccionCedears: a.seccion === "cedears" });
      return { ...a, ...c };
    });

    // construir tabla markdown para chat
    const header = `| Ticker | Tipo | Mercado | Moneda | Cant | Ultimo ARS | Monto ARS | Var24h | Fuente |`;
    const sep = `|---|---|---|---|---|---|---|---|---|`;
    const rows = clasificados.map((c) => {
      const ult = c.ultimoOperado != null ? `ARS ${c.ultimoOperado.toLocaleString("es-AR")}` : "--";
      const monto = c.montoARS != null ? `ARS ${c.montoARS.toLocaleString("es-AR")}` : "--";
      const vari = c.variacion24h != null ? `${c.variacion24h >= 0 ? "+" : ""}${c.variacion24h.toFixed(2)}%` : "--";
      return `| ${c.tickerRaw} | ${c.tipo}/${c.subtipo} | ${c.mercado} | ${c.moneda} | ${c.cantidad ?? "--"} | ${ult} | ${monto} | ${vari} | ${c.fuentePrecio} |`;
    });
    const tablaMarkdown = [header, sep, ...rows].join("\n") + `\n\nPatrimonio: ${resumen.patrimonioTotal ? `ARS ${resumen.patrimonioTotal.toLocaleString("es-AR")}` : "--"} | Clasificados: ${clasificados.length} activos`;

    return { clasificados, resumen, tablaMarkdown };
  });
