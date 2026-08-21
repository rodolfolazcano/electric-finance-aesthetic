// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTokens } from "./iol-auth";
import { fetchHistoryIOL } from "./iol-history";
import { getCached, setCache } from "./cache";
import { resolveDraftTickerFromIOL } from "./draft-asset-iol-resolver";
import type { IOLTitulo } from "./iol-portfolio.functions";

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ IOL Operaciones (trades) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

interface IOLOperacionRaw {
  numero?: number;
  tipo?: string;
  estado?: string;
  mercado?: string;
  simbolo?: string;
  cantidad?: number;
  cantidadOperada?: number;
  precio?: number;
  precioOperado?: number;
  monto?: number;
  montoOperado?: number;
  fechaOperada?: string;
  fechaOrden?: string;
  plazo?: string;
  modalidad?: string;
}

async function iolFetch<T>(
  url: string,
  token: string,
  refreshToken: string | null,
): Promise<{ data: T; newToken?: string; newRefreshToken?: string }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401 && refreshToken) {
    // IOL no soporta refresh_token. Si falla, devolvemos error claro.
    try {
      const tokens = await fetchTokens({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      if (!("error" in tokens)) {
        const retry = await fetch(url, {
          headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
        });
        if (retry.ok) {
          return {
            data: (await retry.json()) as T,
            newToken: tokens.accessToken,
            newRefreshToken: tokens.refreshToken,
          };
        }
      }
    } catch {
      // Ignorar error de refresh
    }
    throw new Error(
      "SesiÃƒÂ³n IOL expirada. IniciÃƒÂ¡ sesiÃƒÂ³n nuevamente desde el botÃƒÂ³n superior derecho.",
    );
  }
  if (!res.ok) throw new Error(`IOL error ${res.status}: ${await res.text().catch(() => "")}`);
  return { data: (await res.json()) as T };
}

async function fetchOperaciones(
  token: string,
  refreshToken: string | null,
  clienteId?: number,
  pais = "argentina",
  fechaDesde?: string,
  fechaHasta?: string,
): Promise<IOLOperacionRaw[]> {
  const cacheKey = `operaciones_${clienteId ?? "propio"}_${pais}_${fechaDesde}_${fechaHasta}`;
  const cached = getCached<IOLOperacionRaw[]>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams();
  params.set("filtro.estado", "Terminadas");
  params.set("filtro.pais", pais);
  if (fechaDesde) params.set("filtro.fechaDesde", fechaDesde);
  if (fechaHasta) params.set("filtro.fechaHasta", fechaHasta);
  if (clienteId) params.set("filtro.numero", String(clienteId));

  const url = `https://api.invertironline.com/api/v2/operaciones?${params.toString()}`;
  const result = await iolFetch<IOLOperacionRaw[]>(url, token, refreshToken);
  const data = result.data ?? [];

  setCache(cacheKey, data);
  return data;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Price fetching Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

import { getHistory } from "./history-cache.server";

async function fetchHistoryYahoo(
  ticker: string,
  days = 365 * 2,
): Promise<{ date: string; close: number }[]> {
  try {
    return await getHistory(ticker, days);
  } catch {
    return [];
  }
}

async function fetchPricesForTickers(
  tickers: string[],
  days: number,
  token?: string | null,
): Promise<Map<string, Map<string, number>>> {
  const priceMap = new Map<string, Map<string, number>>();

  const results = await Promise.all(
    tickers.map(async (t) => {
      const isLocal = t.endsWith(".BA");
      let rows: { date: string; close: number }[];
      if (isLocal && token) {
        const mercado = "bCBA";
        rows = await fetchHistoryIOL(t.replace(/\.BA$/i, ""), mercado, token, null, days).catch(
          () => [],
        );
      } else {
        rows = await fetchHistoryYahoo(t, days).catch(() => []);
      }
      return { ticker: t, rows };
    }),
  );

  for (const { ticker, rows } of results) {
    if (rows.length < 2) continue;
    const dateMap = new Map<string, number>();
    for (const r of rows) dateMap.set(r.date, r.close);
    priceMap.set(ticker, dateMap);
  }

  return priceMap;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Trade parsing Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

interface Trade {
  fecha: string;
  simbolo: string;
  tipo: "compra" | "venta";
  cantidad: number;
  precio: number;
  monto: number;
  mercado: string;
}

function parseTrades(raw: IOLOperacionRaw[]): Trade[] {
  const trades: Trade[] = [];

  for (const op of raw) {
    const tipo = (op.tipo ?? "").toLowerCase().trim();
    if (tipo !== "compra" && tipo !== "venta") continue;

    const simbolo = (op.simbolo ?? "").toUpperCase().trim();
    if (!simbolo) continue;

    const cantidad = op.cantidadOperada ?? op.cantidad ?? 0;
    const precio = op.precioOperado ?? op.precio ?? 0;
    const monto = op.montoOperado ?? op.monto ?? 0;
    const fecha = (op.fechaOperada ?? op.fechaOrden ?? "").split("T")[0];
    if (!fecha || cantidad <= 0) continue;

    trades.push({
      fecha,
      simbolo,
      tipo: tipo as "compra" | "venta",
      cantidad,
      precio,
      monto,
      mercado: (op.mercado ?? "").toUpperCase(),
    });
  }

  trades.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return trades;
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Holdings reconstruction (lot tracking) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

interface Holding {
  simbolo: string;
  cantidad: number;
}

interface ComposicionFecha {
  fecha: string;
  holdings: Holding[];
}

function reconstruirTenenciasDiarias(
  trades: Trade[],
  fechaDesde: string,
  fechaHasta: string,
): {
  composiciones: ComposicionFecha[];
  advertencias: string[];
} {
  const advertencias: string[] = [];
  const sorted = [...trades].sort((a, b) => a.fecha.localeCompare(b.fecha));

  const cantidadMap = new Map<string, number>();

  const tradeDateSet = new Set(sorted.map((t) => t.fecha));
  const allDates = new Set<string>();
  const start = new Date(fechaDesde);
  const end = new Date(fechaHasta);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    allDates.add(d.toISOString().split("T")[0]);
  }

  let tradeIdx = 0;
  const composiciones: ComposicionFecha[] = [];

  const datesSorted = [...allDates].sort();
  for (const fecha of datesSorted) {
    // Apply trades that happened on this date
    while (tradeIdx < sorted.length && sorted[tradeIdx].fecha === fecha) {
      const t = sorted[tradeIdx];
      const current = cantidadMap.get(t.simbolo) ?? 0;

      if (t.tipo === "compra") {
        cantidadMap.set(t.simbolo, current + t.cantidad);
      } else {
        if (t.cantidad > current) {
          advertencias.push(
            `Venta de ${t.simbolo} por ${t.cantidad} supera tenencia (${current}) al ${fecha} Ã¢â‚¬â€ posible operaciÃƒÂ³n fuera del rango de historial`,
          );
          cantidadMap.set(t.simbolo, 0);
        } else {
          cantidadMap.set(t.simbolo, current - t.cantidad);
        }
      }
      tradeIdx++;
    }

    // Snapshot for this date
    const holdings: Holding[] = [];
    for (const [simbolo, cantidad] of cantidadMap) {
      if (cantidad > 0) holdings.push({ simbolo, cantidad });
    }
    composiciones.push({ fecha, holdings });
  }

  if (sorted.length === 0) {
    advertencias.push("No hay operaciones en el perÃƒÂ­odo seleccionado.");
  }

  return { composiciones, advertencias };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ TWR Calculation with rotation splitting Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function calcularTWRConRotacion(
  composiciones: ComposicionFecha[],
  precios: Map<string, Map<string, number>>,
): {
  twrTotal: number | null;
  twrAnualizado: number | null;
  serieTWR: { fecha: string; valorIndexado: number }[];
  eventosRotacion: { fecha: string; tipo: "compra" | "venta"; simbolo: string; cantidad: number }[];
  composicionPorFecha: { fecha: string; pesos: Record<string, number> }[];
  advertencias: string[];
} {
  const advertencias: string[] = [];
  if (composiciones.length < 2) {
    return {
      twrTotal: null,
      twrAnualizado: null,
      serieTWR: [],
      eventosRotacion: [],
      composicionPorFecha: [],
      advertencias: ["PerÃƒÂ­odo demasiado corto para calcular TWR."],
    };
  }

  // Find dates where composition changes (rotation events)
  const rotationDates: string[] = [];
  let prevHoldings = new Map<string, number>();
  for (const comp of composiciones) {
    const currentHoldings = new Map<string, number>();
    for (const h of comp.holdings) currentHoldings.set(h.simbolo, h.cantidad);

    if (rotationDates.length === 0) {
      rotationDates.push(comp.fecha);
      prevHoldings = currentHoldings;
      continue;
    }

    // Check if composition changed
    let changed = false;
    if (currentHoldings.size !== prevHoldings.size) {
      changed = true;
    } else {
      for (const [sym, qty] of currentHoldings) {
        if ((prevHoldings.get(sym) ?? 0) !== qty) {
          changed = true;
          break;
        }
      }
    }

    if (changed) rotationDates.push(comp.fecha);
    prevHoldings = currentHoldings;
  }

  // Build sub-periods between rotation dates
  const subPeriodos: { inicio: string; fin: string }[] = [];
  for (let i = 0; i < rotationDates.length - 1; i++) {
    subPeriodos.push({ inicio: rotationDates[i], fin: rotationDates[i + 1] });
  }
  // Last sub-period: from last rotation to end
  const lastFecha = composiciones[composiciones.length - 1].fecha;
  if (rotationDates.length > 0 && rotationDates[rotationDates.length - 1] !== lastFecha) {
    subPeriodos.push({ inicio: rotationDates[rotationDates.length - 1], fin: lastFecha });
  }

  if (subPeriodos.length === 0) {
    // No rotations Ã¢â‚¬â€ single sub-period
    subPeriodos.push({
      inicio: composiciones[0].fecha,
      fin: composiciones[composiciones.length - 1].fecha,
    });
  }

  // Map fecha -> holdings for quick lookup
  const fechaToHoldings = new Map<string, Map<string, number>>();
  for (const comp of composiciones) {
    const hm = new Map<string, number>();
    for (const h of comp.holdings) hm.set(h.simbolo, h.cantidad);
    fechaToHoldings.set(comp.fecha, hm);
  }

  // Collect all unique symbols across all dates
  const allSymbols = new Set<string>();
  for (const comp of composiciones) {
    for (const h of comp.holdings) allSymbols.add(h.simbolo);
  }

  // Build events list
  const eventosRotacion: {
    fecha: string;
    tipo: "compra" | "venta";
    simbolo: string;
    cantidad: number;
  }[] = [];

  const serieTWR: { fecha: string; valorIndexado: number }[] = [];
  let valorAcumulado = 100;
  let twrAcumulado = 1;
  let startDate: string | null = null;

  for (const sp of subPeriodos) {
    const hStart = fechaToHoldings.get(sp.inicio);
    const hEnd = fechaToHoldings.get(sp.fin);
    if (!hStart || !hEnd) {
      advertencias.push(`Sin tenencias en sub-perÃƒÂ­odo ${sp.inicio} - ${sp.fin}`);
      continue;
    }

    const pStart = precios.get(sp.inicio);
    const pEnd = precios.get(sp.fin);
    if (!pStart || !pEnd) {
      advertencias.push(`Sin precios en sub-perÃƒÂ­odo ${sp.inicio} - ${sp.fin}`);
      continue;
    }

    // Value at start (using START holdings valued at START prices)
    let valorInicio = 0;
    for (const [sym, qty] of hStart) {
      const price = pStart.get(sym);
      if (price != null) valorInicio += qty * price;
    }

    // Value at end (using SAME START holdings valued at END prices)
    let valorFinMismoActivos = 0;
    for (const [sym, qty] of hStart) {
      const price = pEnd.get(sym);
      if (price != null) valorFinMismoActivos += qty * price;
    }

    if (valorInicio <= 0) {
      advertencias.push(`Valor inicial cero en sub-perÃƒÂ­odo ${sp.inicio} - ${sp.fin}`);
      continue;
    }

    const retornoSub = valorFinMismoActivos / valorInicio;
    twrAcumulado *= retornoSub;

    if (!startDate) startDate = sp.inicio;

    // Also record actual value at end using END holdings
    let valorFinReal = 0;
    for (const [sym, qty] of hEnd) {
      const price = pEnd.get(sym);
      if (price != null) valorFinReal += qty * price;
    }

    valorAcumulado = 100 * twrAcumulado;
    serieTWR.push({
      fecha: sp.fin,
      valorIndexado: Math.round(valorAcumulado * 100) / 100,
    });

    // Detect events for this sub-period
    const tradedSymbols = new Set([...hStart.keys(), ...hEnd.keys()]);
    for (const sym of tradedSymbols) {
      const qStart = hStart.get(sym) ?? 0;
      const qEnd = hEnd.get(sym) ?? 0;
      if (qEnd > qStart) {
        eventosRotacion.push({
          fecha: sp.fin,
          tipo: "compra",
          simbolo: sym,
          cantidad: qEnd - qStart,
        });
      } else if (qStart > qEnd) {
        eventosRotacion.push({
          fecha: sp.fin,
          tipo: "venta",
          simbolo: sym,
          cantidad: qStart - qEnd,
        });
      }
    }
  }

  if (serieTWR.length === 0) {
    return {
      twrTotal: null,
      twrAnualizado: null,
      serieTWR: [],
      eventosRotacion: [],
      composicionPorFecha: [],
      advertencias: [...advertencias, "No se pudo calcular TWR."],
    };
  }

  const twrTotal = Math.round((twrAcumulado - 1) * 10000) / 10000;

  // Annualize
  const totalDays =
    (new Date(composiciones[composiciones.length - 1].fecha).getTime() -
      new Date(composiciones[0].fecha).getTime()) /
    (1000 * 60 * 60 * 24);
  let twrAnualizado: number | null = null;
  if (totalDays > 0 && twrAcumulado > 0) {
    twrAnualizado = Math.round((Math.pow(twrAcumulado, 365 / totalDays) - 1) * 10000) / 10000;
  }

  // Build composicionPorFecha
  const composicionPorFecha: { fecha: string; pesos: Record<string, number> }[] = [];
  for (const comp of composiciones) {
    const prices = precios.get(comp.fecha);
    if (!prices) continue;
    let totalValor = 0;
    const valores: Record<string, number> = {};
    for (const h of comp.holdings) {
      const price = prices.get(h.simbolo);
      if (price != null) {
        const val = h.cantidad * price;
        valores[h.simbolo] = val;
        totalValor += val;
      }
    }
    if (totalValor > 0) {
      const pesos: Record<string, number> = {};
      for (const [sym, val] of Object.entries(valores)) {
        pesos[sym] = Math.round((val / totalValor) * 10000) / 100;
      }
      composicionPorFecha.push({ fecha: comp.fecha, pesos });
    }
  }

  return {
    twrTotal,
    twrAnualizado,
    serieTWR,
    eventosRotacion,
    composicionPorFecha,
    advertencias,
  };
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Main exported server function Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

export interface RendimientoRealResult {
  twrTotal: number | null;
  twrAnualizado: number | null;
  serieTWR: { fecha: string; valorIndexado: number }[];
  eventosRotacion: { fecha: string; tipo: "compra" | "venta"; simbolo: string; cantidad: number }[];
  composicionPorFecha: { fecha: string; pesos: Record<string, number> }[];
  advertencias: string[];
  totalOperaciones: number;
  fechaDesde: string;
  fechaHasta: string;
}

export const getRendimientoRealPortafolio = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      token: string;
      refreshToken: string | null;
      clienteId?: number;
      pais?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    }) =>
      z
        .object({
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
          clienteId: z.number().optional(),
          pais: z.string().default("argentina"),
          fechaDesde: z.string().optional(),
          fechaHasta: z.string().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }): Promise<RendimientoRealResult> => {
    const fechaHasta = data.fechaHasta ?? new Date().toISOString().split("T")[0];
    const fechaDesde =
      data.fechaDesde ??
      new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    // 1. Fetch raw trades (extend window 1yr backward for opening holdings)
    const lookbackDesde =
      data.fechaDesde ??
      new Date(Date.now() - 365 * 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const rawOps = await fetchOperaciones(
      data.token,
      data.refreshToken,
      data.clienteId,
      data.pais,
      lookbackDesde,
      fechaHasta,
    );

    if (rawOps.length === 0) {
      return {
        twrTotal: null,
        twrAnualizado: null,
        serieTWR: [],
        eventosRotacion: [],
        composicionPorFecha: [],
        advertencias: ["No hay operaciones en el perÃƒÂ­odo seleccionado."],
        totalOperaciones: 0,
        fechaDesde,
        fechaHasta,
      };
    }

    // 2. Parse trades
    const trades = parseTrades(rawOps);
    if (trades.length === 0) {
      return {
        twrTotal: null,
        twrAnualizado: null,
        serieTWR: [],
        eventosRotacion: [],
        composicionPorFecha: [],
        advertencias: ["No se encontraron operaciones de compra/venta en el perÃƒÂ­odo."],
        totalOperaciones: rawOps.length,
        fechaDesde,
        fechaHasta,
      };
    }

    // 3. Reconstruct daily holdings
    const { composiciones, advertencias: holdWarnings } = reconstruirTenenciasDiarias(
      trades,
      fechaDesde,
      fechaHasta,
    );

    if (composiciones.length === 0) {
      return {
        twrTotal: null,
        twrAnualizado: null,
        serieTWR: [],
        eventosRotacion: [],
        composicionPorFecha: [],
        advertencias: [...holdWarnings, "No se pudieron reconstruir tenencias."],
        totalOperaciones: rawOps.length,
        fechaDesde,
        fechaHasta,
      };
    }

    // 4. Collect all unique symbols for price fetching
    const allSymbols = new Set<string>();
    for (const comp of composiciones) {
      for (const h of comp.holdings) allSymbols.add(h.simbolo);
    }

    // Resolve local tickers for Yahoo (usando classifier centralizado)
    const localTickers = new Set<string>();
    const yahooTickers = new Set<string>();
    for (const sym of allSymbols) {
      const titulo: IOLTitulo = {
        simbolo: sym,
        descripcion: "",
        pais: "argentina",
        mercado: "bCBA",
        tipo: "ACCION",
        plazo: "t0",
        moneda: "peso_Argentino",
      };
      const resolved = resolveDraftTickerFromIOL(titulo);
      if (resolved.canUseYahoo && resolved.analysisSymbol) {
        yahooTickers.add(resolved.analysisSymbol);
      } else {
        localTickers.add(sym);
      }
    }

    // 5. Fetch prices
    const yahooSymbols = [...yahooTickers];
    const days = Math.round(
      (new Date(fechaHasta).getTime() - new Date(fechaDesde).getTime()) / 86400000,
    );
    const prices = await fetchPricesForTickers(yahooSymbols, days, data.token);

    // 6. Map prices back to original symbols
    const priceMap = new Map<string, Map<string, number>>();
    for (const sym of allSymbols) {
      const titulo: IOLTitulo = {
        simbolo: sym,
        descripcion: "",
        pais: "argentina",
        mercado: "bCBA",
        tipo: "ACCION",
        plazo: "t0",
        moneda: "peso_Argentino",
      };
      const resolved = resolveDraftTickerFromIOL(titulo);
      const yahooSym = resolved.canUseYahoo ? resolved.analysisSymbol : null;
      if (yahooSym && prices.has(yahooSym)) {
        priceMap.set(sym, prices.get(yahooSym)!);
      }
    }

    // 7. Compute TWR with price data
    const result = calcularTWRConRotacion(composiciones, priceMap);

    return {
      twrTotal: result.twrTotal,
      twrAnualizado: result.twrAnualizado,
      serieTWR: result.serieTWR,
      eventosRotacion: result.eventosRotacion,
      composicionPorFecha: result.composicionPorFecha,
      advertencias: [...holdWarnings, ...result.advertencias],
      totalOperaciones: rawOps.length,
      fechaDesde,
      fechaHasta,
    };
  });
