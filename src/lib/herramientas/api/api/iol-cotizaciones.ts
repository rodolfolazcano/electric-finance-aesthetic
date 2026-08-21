// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

function resolveToken(clientToken: string | undefined | null): string | null {
  if (clientToken) return clientToken;
  const envToken = process.env.IOL_EXTERNAL_TOKEN;
  if (envToken) return envToken;
  return null;
}

export interface IOLCotizacionSimple {
  simbolo: string;
  ultimoPrecio: number | null;
  compra: number | null;
  venta: number | null;
  cierre: number | null;
  variacionPorcentual: number | null;
  volumen: number | null;
  fechaVencimiento?: string | null;
  moneda?: string;
}

export const iolCotizarSimbolo = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bearerToken: z.string().optional(),
      simbolo: z.string(),
      mercado: z.string().default("bCBA"),
    }),
  )
  .handler(async ({ data }): Promise<IOLCotizacionSimple | null> => {
    const token = resolveToken(data.bearerToken);
    if (!token) return null;
    try {
      const r = await fetch(
        `https://api.invertironline.com/api/v2/${data.mercado}/Titulos/${data.simbolo}/Cotizacion`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          cache: "no-store",
        },
      );
      if (!r.ok) return null;
      const j = await r.json();
      return {
        simbolo: j.simbolo ?? data.simbolo,
        ultimoPrecio: j.ultimoPrecio ?? j.precio ?? null,
        compra: j.puntas?.compra ?? j.compra ?? null,
        venta: j.puntas?.venta ?? j.venta ?? null,
        cierre: j.cierre ?? j.cierreAnterior ?? j.precioAnterior ?? null,
        variacionPorcentual: j.variacionPorcentual ?? j.variacion ?? null,
        volumen: j.volumen ?? j.volumenNominal ?? null,
        fechaVencimiento: j.fechaVencimiento ?? null,
        moneda: j.moneda ?? null,
      };
    } catch {
      return null;
    }
  });

export const iolCotizarMultiples = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bearerToken: z.string().optional(),
      simbolos: z.array(z.string()).min(1).max(50),
      mercado: z.string().default("bCBA"),
    }),
  )
  .handler(async ({ data }): Promise<Record<string, IOLCotizacionSimple>> => {
    const token = resolveToken(data.bearerToken);
    if (!token) return {};
    const resultados: Record<string, IOLCotizacionSimple> = {};
    const batchSize = 5;
    for (let i = 0; i < data.simbolos.length; i += batchSize) {
      const batch = data.simbolos.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(async (simbolo) => {
          try {
            const r = await fetch(
              `https://api.invertironline.com/api/v2/${data.mercado}/Titulos/${simbolo}/Cotizacion`,
              {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
                cache: "no-store",
              },
            );
            if (r.ok) {
              const j = await r.json();
              resultados[simbolo] = {
                simbolo: j.simbolo ?? simbolo,
                ultimoPrecio: j.ultimoPrecio ?? j.precio ?? null,
                compra: j.puntas?.compra ?? j.compra ?? null,
                venta: j.puntas?.venta ?? j.venta ?? null,
                cierre: j.cierre ?? j.cierreAnterior ?? j.precioAnterior ?? null,
                variacionPorcentual: j.variacionPorcentual ?? j.variacion ?? null,
                volumen: j.volumen ?? j.volumenNominal ?? null,
                fechaVencimiento: j.fechaVencimiento ?? null,
                moneda: j.moneda ?? null,
              };
            }
          } catch {
            /* ignore */
          }
        }),
      );
    }
    return resultados;
  });

export const iolFuturosOperables = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bearerToken: z.string().optional(),
      instrumento: z.string().default("futuros"),
      pais: z.string().default("argentina"),
    }),
  )
  .handler(async ({ data }): Promise<IOLCotizacionSimple[]> => {
    const token = resolveToken(data.bearerToken);
    if (!token) return [];
    try {
      const url = `https://api.invertironline.com/api/v2/cotizaciones-orleans/${data.instrumento}/${data.pais}/Operables`;
      const r = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!r.ok) return [];
      const j = await r.json();
      const titulos: any[] = j.titulos ?? [];
      return titulos.map((t: any) => ({
        simbolo: t.simbolo ?? "",
        ultimoPrecio: t.ultimoPrecio ?? t.precio ?? null,
        compra: t.puntas?.compra ?? t.compra ?? null,
        venta: t.puntas?.venta ?? t.venta ?? null,
        cierre: t.cierre ?? null,
        variacionPorcentual: t.variacionPorcentual ?? null,
        volumen: t.volumen ?? null,
        fechaVencimiento: t.fechaVencimiento ?? null,
      }));
    } catch {
      return [];
    }
  });

// ─── Metadata de título: GET /api/v2/{mercado}/Titulos/{simbolo} ───────────
// Agregado para PortfolioComposition (paso 1, única excepción de "sin fetchers nuevos").

export interface IOLTituloInfo {
  simbolo: string;
  descripcion?: string;
  pais?: string;
  mercado?: string;
  tipo?: string;
  plazo?: string;
  moneda?: string;
}

export interface IOLInstrumentoInfo {
  instrumento: string;
  pais: string;
}

export const iolObtenerTitulo = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bearerToken: z.string().optional(),
      simbolo: z.string(),
      mercado: z.string().default("bCBA"),
    }),
  )
  .handler(
    async ({ data }): Promise<{ ok: boolean; status?: number; titulo: IOLTituloInfo | null }> => {
      const token = resolveToken(data.bearerToken);
      if (!token) return { ok: false, titulo: null };
      try {
        const r = await fetch(
          `https://api.invertironline.com/api/v2/${data.mercado}/Titulos/${encodeURIComponent(data.simbolo)}`,
          {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            cache: "no-store",
          },
        );
        if (!r.ok) return { ok: false, status: r.status, titulo: null };
        const j = await r.json();
        return {
          ok: true,
          titulo: {
            simbolo: j.simbolo ?? data.simbolo,
            descripcion: j.descripcion ?? "",
            pais: j.pais ?? "",
            mercado: j.mercado ?? data.mercado,
            tipo: j.tipo ?? "",
            plazo: j.plazo ?? "",
            moneda: j.moneda ?? "",
          },
        };
      } catch {
        return { ok: false, titulo: null };
      }
    },
  );

// ─── Tipos de instrumento por país: GET /api/v2/{pais}/Titulos/Cotizacion/Instrumentos ──

export const iolInstrumentosPorPais = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bearerToken: z.string().optional(),
      pais: z.string().default("argentina"),
    }),
  )
  .handler(async ({ data }): Promise<IOLInstrumentoInfo[]> => {
    const token = resolveToken(data.bearerToken);
    if (!token) return [];
    try {
      const r = await fetch(
        `https://api.invertironline.com/api/v2/${data.pais}/Titulos/Cotizacion/Instrumentos`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          cache: "no-store",
        },
      );
      if (!r.ok) return [];
      const j = await r.json();
      if (!Array.isArray(j)) return [];
      return j
        .map((it: any) => ({ instrumento: it?.instrumento ?? "", pais: it?.pais ?? data.pais }))
        .filter((it: IOLInstrumentoInfo) => it.instrumento.length > 0);
    } catch {
      return [];
    }
  });
