import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const enviarSenalCripto = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        tipo: z.string(),
        descripcion: z.string(),
        spreadNeto: z.number(),
        precioCompra: z.number().optional(),
        precioVenta: z.number().optional(),
        exchangeCompra: z.string().optional(),
        exchangeVenta: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { sendTelegramSignal } = await import("@/lib/telegram.server");
      const viable = data.spreadNeto > 0.5;
      if (!viable) return { ok: false, reason: "Spread no viable (<0.5%)" };
      const ticker = `USDT/ARS ${data.tipo}`;
      const senal = viable ? "ARBITRAJE VIABLE" : "ARBITRAJE";
      const motivo = `${data.descripcion} · Neto ${(data.spreadNeto * 100).toFixed(2)}% · ${data.exchangeCompra ?? ""} ${data.precioCompra ? `$${data.precioCompra.toFixed(0)}` : ""} → ${data.exchangeVenta ?? ""} ${data.precioVenta ? `$${data.precioVenta.toFixed(0)}` : ""} (CriptoYa)`;
      const res = await sendTelegramSignal({
        ticker,
        senal: `${senal} — ${data.tipo}`,
        precio: data.precioVenta ?? data.precioCompra ?? null,
        variacion1d: data.spreadNeto * 100,
        motivo,
        nivel: "oportunidad",
      });
      return { ok: true, telegram: res };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });
