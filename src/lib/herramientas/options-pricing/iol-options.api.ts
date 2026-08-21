import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { IOLOptionResponse, OptionContract, CaucionData } from "./options.types";
import { timeToExpiry } from "./market-calendar";

//  Opciones desde IOL 

export const fetchOpcionesIOL = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        simbolo: z.string().min(1).max(20),
        mercado: z.string().default("BCBA"),
        bearerToken: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<OptionContract[]> => {
    const { simbolo, mercado, bearerToken } = data;

    try {
      // Try IOL API first if token available
      if (bearerToken) {
        const url = `https://api.invertironline.com/api/v2/${mercado}/Titulos/${simbolo}/Opciones`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${bearerToken}` },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const json: IOLOptionResponse[] = await res.json();
          if (Array.isArray(json)) {
            return json.map(mapperIOLtoContract(simbolo));
          }
        }
      }

      // Fallback: try public IOL endpoint
      const fallbackUrl = `https://api.invertironline.com/api/v2/${mercado}/Titulos/${simbolo}/Opciones`;
      const fallbackRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(5000) });
      if (fallbackRes.ok) {
        const json: IOLOptionResponse[] = await fallbackRes.json();
        if (Array.isArray(json)) return json.map(mapperIOLtoContract(simbolo));
      }

      return [];
    } catch {
      return [];
    }
  });

function mapperIOLtoContract(simbolo: string) {
  return (item: IOLOptionResponse): OptionContract => {
    const cotiz = item.cotizacion ?? {};
    const precio = parseFloat(String(cotiz.ultimoPrecio ?? 0));
    const bid = parseFloat(String(cotiz.bid ?? 0));
    const ask = parseFloat(String(cotiz.ask ?? 0));
    const T = timeToExpiry(item.fechaVencimiento);

    // Extract strike from descripcion (e.g., "GGAL CE 24000 17/10" -> 24000)
    let strike = 0;
    const parts = item.descripcion?.split(/\s+/) ?? [];
    const strikePart = parts.find((p) => /^\d+$/.test(p.replace(/,/g, "")));
    if (strikePart) {
      strike = parseFloat(strikePart.replace(/,/g, ""));
    }

    return {
      simbolo: item.simbolo,
      descripcion: item.descripcion ?? "",
      tipoOpcion: item.tipoOpcion === "Put" ? "Put" : "Call",
      strike,
      fechaVencimiento: item.fechaVencimiento,
      T,
      precioOpcion: precio,
      bid: bid || precio * 0.95,
      ask: ask || precio * 1.05,
      volumen: parseInt(String(cotiz.volumen ?? 0)),
      montoOperado: parseFloat(String(cotiz.montoOperado ?? 0)),
      precioSubyacente: 0, // filled later
      openInterest: parseInt(String(cotiz.openInterest ?? 0)),
    };
  };
}

//  Caución (tasa libre de riesgo) 

export const fetchCauciones = createServerFn({ method: "GET" }).handler(
  async (): Promise<CaucionData | null> => {
    try {
      const res = await fetch(
        "https://api.invertironline.com/api/v2/Cotizaciones/Cauciones/Todas/Argentina",
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return null;
      const json = await res.json();
      const titulos = json?.titulos ?? [];
      if (!Array.isArray(titulos) || titulos.length === 0) return null;

      // Find 7-day caucion or shortest available
      titulos.sort((a: any, b: any) => (a.plazo ?? 999) - (b.plazo ?? 999));
      const best = titulos.find((t: any) => t.plazo === 7) ?? titulos[0];

      return {
        plazo: best.plazo ?? 0,
        tasaPromedio: (best.tasaPromedio ?? 0) / 100,
        tasaMinima: (best.tasaMinima ?? 0) / 100,
        tasaMaxima: (best.tasaMaxima ?? 0) / 100,
      };
    } catch {
      return null;
    }
  },
);

//  Resolver subyacentes disponibles 

export const OPCIONES_SUBYACENTES = ["COME", "GGAL", "YPFD", "PAMP", "BMA"] as const;

export type OpcionSubyacente = (typeof OPCIONES_SUBYACENTES)[number];
