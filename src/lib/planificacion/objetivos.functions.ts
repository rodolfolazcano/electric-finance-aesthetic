import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  montoObjetivo: z.number().min(1),
  plazoMeses: z.number().min(1).max(600),
  ahorroActual: z.number().min(0),
  tasaEsperada: z.number().min(0).max(100),
});

export type ObjetivosInput = z.infer<typeof InputSchema>;

export type ObjetivosResult = {
  aporteMensualNecesario: number;
  capitalFinal: number;
  totalAportado: number;
  escenarios: { tasa: number; aporte: number }[];
};

export const calcularObjetivo = createServerFn({ method: "POST" })
  .inputValidator((input: ObjetivosInput) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<ObjetivosResult> => {
    const r = data.tasaEsperada / 100 / 12;
    const n = data.plazoMeses;

    const aporteMensual =
      r > 0
        ? (data.montoObjetivo - data.ahorroActual * Math.pow(1 + r, n)) /
          ((Math.pow(1 + r, n) - 1) / r)
        : (data.montoObjetivo - data.ahorroActual) / n;

    const totalAportado = data.ahorroActual + aporteMensual * n;
    const capitalFinal = data.montoObjetivo;

    const escenarios = [-2, -1, 0, 1, 2, 3].map((d) => {
      const tr = (data.tasaEsperada + d) / 100 / 12;
      if (tr <= 0)
        return {
          tasa: data.tasaEsperada + d,
          aporte: Math.round(((data.montoObjetivo - data.ahorroActual) / n) * 100) / 100,
        };
      const ap =
        (data.montoObjetivo - data.ahorroActual * Math.pow(1 + tr, n)) /
        ((Math.pow(1 + tr, n) - 1) / tr);
      return { tasa: data.tasaEsperada + d, aporte: Math.round(Math.max(ap, 0) * 100) / 100 };
    });

    return {
      aporteMensualNecesario: Math.round(Math.max(aporteMensual, 0) * 100) / 100,
      capitalFinal: Math.round(capitalFinal * 100) / 100,
      totalAportado: Math.round(totalAportado * 100) / 100,
      escenarios,
    };
  });
