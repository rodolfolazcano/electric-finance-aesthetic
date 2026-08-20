/** API del Asesor de Inversiones: expone el pipeline como server function. */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { analisisValorIntrinseco, textoAnalisis, type AnalisisCompleto } from "./valuation-pipeline";

export interface RespuestaValor {
  analisis: AnalisisCompleto;
  texto: string;
}

export const analizarValor = createServerFn({ method: "POST" })
  .inputValidator((d: { simbolo?: string; tema?: string }) =>
    z
      .object({
        simbolo: z.string().min(1).max(40),
        tema: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<RespuestaValor> => {
    const tema = data.tema?.trim() || "DCF Flujo de Caja Descontado";
    const analisis = await analisisValorIntrinseco(data.simbolo, tema);
    return { analisis, texto: textoAnalisis(analisis) };
  });
