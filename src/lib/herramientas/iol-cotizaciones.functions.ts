// @ts-nocheck
/**
 * Obtención de cotizaciones desde IOL API
 * Requiere autenticación previa
 */

import { createServerFn } from "@tanstack/react-start";

/**
 * Estructura de una cotización IOL
 */
export interface IOLCotizacion {
  simbolo: string;
  nombre: string;
  precio: number;
  puntas: {
    compra: number;
    venta: number;
  };
  cierre: number;
  variacion: number;
  variacionPct: number;
  volumen: number;
  plazo?: string;
  tipo?: string;
}

/**
 * Tipos de instrumentos disponibles
 */
type InstrumentoTipo =
  | "acciones"
  | "adrs"
  | "titulosPublicos"
  | "obligacionesNegociables"
  | "cedears"
  | "cauciones"
  | "fondosComunesInversion";

type PaisTipo = "argentina" | "estados_unidos" | "brasil";

/**
 * Server Function: Obtener cotizaciones de un instrumento
 */
export const iolObtenerCotizaciones = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { bearerToken: string; instrumento: InstrumentoTipo; pais: PaisTipo }) => {
      if (!input.bearerToken) throw new Error("Token requerido");
      if (!input.instrumento) throw new Error("Instrumento requerido");
      return input;
    },
  )
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      cotizaciones: IOLCotizacion[];
      error: string | null;
    }> => {
      try {
        const url = `https://api.invertironline.com/api/v2/Cotizaciones/${data.instrumento}/${data.pais}/Todos`;

        const response = await fetch(url, {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${data.bearerToken}`,
          },
        });

        if (!response.ok) {
          return {
            success: false,
            cotizaciones: [],
            error: `Error ${response.status} al obtener cotizaciones`,
          };
        }

        const jsonData = await response.json();
        const titulos = jsonData.titulos || [];

        const cotizaciones: IOLCotizacion[] = titulos.map((t: any): IOLCotizacion => ({
          simbolo: t.simbolo || "",
          nombre: t.descripcion || t.nombre || t.simbolo || "",
          precio: t.ultimoPrecio || t.precio || 0,
          puntas: {
            compra: t.puntas?.compra || t.compra || 0,
            venta: t.puntas?.venta || t.venta || 0,
          },
          cierre: t.cierre || 0,
          variacion: (t.ultimoPrecio || 0) - (t.cierre || 0),
          variacionPct:
            t.cierre && t.cierre > 0 ? (((t.ultimoPrecio || 0) - t.cierre) / t.cierre) * 100 : 0,
          volumen: t.volumen || 0,
          plazo: t.plazo,
          tipo: data.instrumento,
        }));

        return {
          success: true,
          cotizaciones,
          error: null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        console.error("IOL cotizaciones error:", message);
        return {
          success: false,
          cotizaciones: [],
          error: message,
        };
      }
    },
  );

/**
 * Server Function: Obtener cotizaciones de acciones argentina específicamente
 */
export const iolAccionesArgentina = createServerFn({ method: "POST" })
  .inputValidator((input: { bearerToken: string }) => {
    if (!input.bearerToken) throw new Error("Token requerido");
    return input;
  })
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      acciones: IOLCotizacion[];
      error: string | null;
    }> => {
      try {
        const response = await fetch(
          "https://api.invertironline.com/api/v2/Cotizaciones/acciones/argentina/Todos",
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${data.bearerToken}`,
            },
          },
        );

        if (!response.ok) {
          return {
            success: false,
            acciones: [],
            error: `Error ${response.status}`,
          };
        }

        const jsonData = await response.json();
        const titulos = jsonData.titulos || [];

        const acciones: IOLCotizacion[] = titulos.map((t: any): IOLCotizacion => ({
          simbolo: t.simbolo || "",
          nombre: t.descripcion || t.nombre || t.simbolo || "",
          precio: t.ultimoPrecio || t.precio || 0,
          puntas: {
            compra: t.puntas?.compra || t.compra || 0,
            venta: t.puntas?.venta || t.venta || 0,
          },
          cierre: t.cierre || 0,
          variacion: (t.ultimoPrecio || 0) - (t.cierre || 0),
          variacionPct:
            t.cierre && t.cierre > 0 ? (((t.ultimoPrecio || 0) - t.cierre) / t.cierre) * 100 : 0,
          volumen: t.volumen || 0,
          tipo: "acciones",
        }));

        return {
          success: true,
          acciones,
          error: null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        return {
          success: false,
          acciones: [],
          error: message,
        };
      }
    },
  );

/**
 * Server Function: Obtener títulos públicos argentina
 */
export const iolTitulosPublicos = createServerFn({ method: "POST" })
  .inputValidator((input: { bearerToken: string }) => {
    if (!input.bearerToken) throw new Error("Token requerido");
    return input;
  })
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      bonos: IOLCotizacion[];
      error: string | null;
    }> => {
      try {
        const response = await fetch(
          "https://api.invertironline.com/api/v2/Cotizaciones/titulosPublicos/argentina/Todos",
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${data.bearerToken}`,
            },
          },
        );

        if (!response.ok) {
          return {
            success: false,
            bonos: [],
            error: `Error ${response.status}`,
          };
        }

        const jsonData = await response.json();
        const titulos = jsonData.titulos || [];

        const bonos: IOLCotizacion[] = titulos.map((t: any): IOLCotizacion => ({
          simbolo: t.simbolo || "",
          nombre: t.descripcion || t.nombre || t.simbolo || "",
          precio: t.ultimoPrecio || t.precio || 0,
          puntas: {
            compra: t.puntas?.compra || t.compra || 0,
            venta: t.puntas?.venta || t.venta || 0,
          },
          cierre: t.cierre || 0,
          variacion: (t.ultimoPrecio || 0) - (t.cierre || 0),
          variacionPct:
            t.cierre && t.cierre > 0 ? (((t.ultimoPrecio || 0) - t.cierre) / t.cierre) * 100 : 0,
          volumen: t.volumen || 0,
          tipo: "titulosPublicos",
        }));

        return {
          success: true,
          bonos,
          error: null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        return {
          success: false,
          bonos: [],
          error: message,
        };
      }
    },
  );

/**
 * Server Function: Obtener Obligaciones Negociables
 */
export const iolObligacionesNegociables = createServerFn({ method: "POST" })
  .inputValidator((input: { bearerToken: string }) => {
    if (!input.bearerToken) throw new Error("Token requerido");
    return input;
  })
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      ons: IOLCotizacion[];
      error: string | null;
    }> => {
      try {
        const response = await fetch(
          "https://api.invertironline.com/api/v2/Cotizaciones/obligacionesNegociables/argentina/Todos",
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${data.bearerToken}`,
            },
          },
        );

        if (!response.ok) {
          return {
            success: false,
            ons: [],
            error: `Error ${response.status}`,
          };
        }

        const jsonData = await response.json();
        const titulos = jsonData.titulos || [];

        let ons: IOLCotizacion[] = titulos.map((t: any): IOLCotizacion => {
          const cierre = t.cierre ?? t.cierreAnterior ?? t.precioAnterior ?? 0;
          const ultimoPrecio = t.ultimoPrecio ?? t.precio ?? 0;
          return {
            simbolo: t.simbolo || "",
            nombre: t.descripcion || t.nombre || t.simbolo || "",
            precio: ultimoPrecio,
            puntas: {
              compra: t.puntas?.compra ?? t.compra ?? t.precioCompra ?? 0,
              venta: t.puntas?.venta ?? t.venta ?? t.precioVenta ?? 0,
            },
            cierre,
            variacion: ultimoPrecio - cierre,
            variacionPct: cierre > 0 ? ((ultimoPrecio - cierre) / cierre) * 100 : 0,
            volumen: t.volumen ?? t.volumenNominal ?? t.montoOperado ?? t.monto ?? 0,
            tipo: "obligacionesNegociables",
          };
        });

        // Filtrar ONs sin actividad (donde todos los campos numéricos son 0)
        ons = ons.filter(
          (o) =>
            o.precio > 0 ||
            o.puntas.compra > 0 ||
            o.puntas.venta > 0 ||
            o.cierre > 0 ||
            o.volumen > 0,
        );

        const token = data.bearerToken;

        // Obtener detalle individual para ONs activas que aún no tienen puntas/cierre/volumen
        const necesitaEnriquecer = ons.filter(
          (o) =>
            o.precio > 0 &&
            (o.puntas.compra === 0 || o.puntas.venta === 0 || o.cierre === 0 || o.volumen === 0),
        );

        if (necesitaEnriquecer.length > 0) {
          const enriquecer = async (simbolo: string): Promise<Partial<IOLCotizacion> | null> => {
            try {
              const res = await fetch(
                `https://api.invertironline.com/api/v2/Cotizaciones/obligacionesNegociables/argentina/${encodeURIComponent(simbolo)}`,
                {
                  headers: {
                    Accept: "application/json",
                    Authorization: `Bearer ${token}`,
                  },
                },
              );
              if (!res.ok) return null;
              const d = await res.json();
              const cierre = d.cierre ?? d.cierreAnterior ?? d.precioAnterior ?? 0;
              return {
                puntas: {
                  compra: d.puntas?.compra ?? d.compra ?? d.precioCompra ?? 0,
                  venta: d.puntas?.venta ?? d.venta ?? d.precioVenta ?? 0,
                },
                cierre,
                variacion: (d.ultimoPrecio ?? d.precio ?? 0) - cierre,
                variacionPct:
                  cierre > 0 ? (((d.ultimoPrecio ?? d.precio ?? 0) - cierre) / cierre) * 100 : 0,
                volumen: d.volumen ?? d.volumenNominal ?? d.montoOperado ?? d.monto ?? 0,
              };
            } catch {
              return null;
            }
          };

          const CONCURRENCIA = 10;
          const results: (Partial<IOLCotizacion> | null)[] = [];
          for (let i = 0; i < necesitaEnriquecer.length; i += CONCURRENCIA) {
            const batch = necesitaEnriquecer.slice(i, i + CONCURRENCIA);
            const enriched = await Promise.allSettled(batch.map((o) => enriquecer(o.simbolo)));
            results.push(...enriched.map((r) => (r.status === "fulfilled" ? r.value : null)));
          }

          const enriquecidos = new Map<string, Partial<IOLCotizacion>>();
          results.forEach((r, idx) => {
            if (r) enriquecidos.set(necesitaEnriquecer[idx].simbolo, r);
          });

          ons = ons.map((o) => {
            const extra = enriquecidos.get(o.simbolo);
            if (!extra) return o;
            return {
              ...o,
              puntas: {
                compra: extra.puntas?.compra ?? o.puntas.compra,
                venta: extra.puntas?.venta ?? o.puntas.venta,
              },
              cierre: extra.cierre ?? o.cierre,
              variacion: extra.variacion ?? o.variacion,
              variacionPct: extra.variacionPct ?? o.variacionPct,
              volumen: extra.volumen ?? o.volumen,
            };
          });
        }

        return {
          success: true,
          ons,
          error: null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        return {
          success: false,
          ons: [],
          error: message,
        };
      }
    },
  );

/**
 * Server Function: Obtener CEDEARs
 */
export const iolCedears = createServerFn({ method: "POST" })
  .inputValidator((input: { bearerToken: string }) => {
    if (!input.bearerToken) throw new Error("Token requerido");
    return input;
  })
  .handler(
    async ({
      data,
    }): Promise<{
      success: boolean;
      cedears: IOLCotizacion[];
      error: string | null;
    }> => {
      try {
        const response = await fetch(
          "https://api.invertironline.com/api/v2/Cotizaciones/cedears/argentina/Todos",
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${data.bearerToken}`,
            },
          },
        );

        if (!response.ok) {
          return {
            success: false,
            cedears: [],
            error: `Error ${response.status}`,
          };
        }

        const jsonData = await response.json();
        const titulos = jsonData.titulos || [];

        const cedears: IOLCotizacion[] = titulos.map((t: any): IOLCotizacion => ({
          simbolo: t.simbolo || "",
          nombre: t.descripcion || t.nombre || t.simbolo || "",
          precio: t.ultimoPrecio || t.precio || 0,
          puntas: {
            compra: t.puntas?.compra || t.compra || 0,
            venta: t.puntas?.venta || t.venta || 0,
          },
          cierre: t.cierre || 0,
          variacion: (t.ultimoPrecio || 0) - (t.cierre || 0),
          variacionPct:
            t.cierre && t.cierre > 0 ? (((t.ultimoPrecio || 0) - t.cierre) / t.cierre) * 100 : 0,
          volumen: t.volumen || 0,
          tipo: "cedears",
        }));

        return {
          success: true,
          cedears,
          error: null,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error desconocido";
        return {
          success: false,
          cedears: [],
          error: message,
        };
      }
    },
  );
