import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getMEPRate = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ compra: number; venta: number; fuente: string }> => {
    // Try ArgentinaDatos API first (public, no auth needed)
    try {
      const res = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa");
      if (res.ok) {
        const json = await res.json();
        if (json.length > 0) {
          const latest = json[json.length - 1];
          return { compra: latest.compra, venta: latest.venta, fuente: "argentinadatos" };
        }
      }
    } catch {
      /* fall through */
    }

    // Fallback: try dolarapi.com
    try {
      const res = await fetch("https://dolarapi.com/v1/dolares/bolsa");
      if (res.ok) {
        const json = await res.json();
        return { compra: json.compra, venta: json.venta, fuente: "dolarapi" };
      }
    } catch {
      /* fall through */
    }

    return { compra: 0, venta: 0, fuente: "none" };
  });

export const estimarVentaMep = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        monto: z.number().positive(),
        token: z.string().min(1),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
    }): Promise<
      | { montoPesos: number; montoBrutoDolar: number; montoNetoDolar: number; comision: number }
      | { error: string }
    > => {
      try {
        const url = `https://api.invertironline.com/api/v2/OperatoriaSimplificada/VentaMepSimple/MontosEstimados/${data.monto}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${data.token}`, Accept: "application/json" },
        });
        if (!res.ok) return { error: `IOL error: ${res.status}` };
        const json = await res.json();
        return {
          montoPesos: json.montoPesos ?? 0,
          montoBrutoDolar: json.montoBrutoDolar ?? 0,
          montoNetoDolar: json.montoNetoDolar ?? 0,
          comision: (json.comisionCompra ?? 0) + (json.comisionVenta ?? 0),
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  );
