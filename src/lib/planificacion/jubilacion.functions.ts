import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  edadActual: z.number().min(18).max(80),
  edadRetiro: z.number().min(30).max(90),
  ahorroActual: z.number().min(0),
  aporteMensual: z.number().min(0),
  tasaRetorno: z.number().min(0).max(100),
  inflacion: z.number().min(0).max(100),
  gastoMensualDeseado: z.number().min(0),
});

export type JubilacionInput = z.infer<typeof InputSchema>;

export type JubilacionResult = {
  capitalProyectado: number;
  capitalNecesario: number;
  brecha: number;
  mesesRestantes: number;
  evolucion: { ano: number; capital: number; aportes: number; retiros: number }[];
  tasaReal: number;
};

export const calcularJubilacion = createServerFn({ method: "POST" })
  .inputValidator((input: JubilacionInput) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<JubilacionResult> => {
    const tasaReal = (1 + data.tasaRetorno / 100) / (1 + data.inflacion / 100) - 1;
    const meses = (data.edadRetiro - data.edadActual) * 12;
    const gastoAnualDeseado = data.gastoMensualDeseado * 12;
    const anosRetiro = 30;
    const tasaRealDecimal = Math.max(tasaReal, 0.001);

    const capitalNecesario =
      gastoAnualDeseado * ((1 - Math.pow(1 + tasaRealDecimal, -anosRetiro)) / tasaRealDecimal);

    let capital = data.ahorroActual;
    const evolucion: JubilacionResult["evolucion"] = [];
    for (let a = 0; a <= Math.ceil(meses / 12); a++) {
      const aportesAnuales = data.aporteMensual * 12;
      if (a === 0) {
        evolucion.push({
          ano: data.edadActual,
          capital: Math.round(capital),
          aportes: 0,
          retiros: 0,
        });
        continue;
      }
      capital = capital * (1 + tasaRealDecimal) + aportesAnuales;
      evolucion.push({
        ano: data.edadActual + a,
        capital: Math.round(capital),
        aportes: Math.round(aportesAnuales),
        retiros: 0,
      });
    }

    return {
      capitalProyectado: Math.round(capital),
      capitalNecesario: Math.round(capitalNecesario),
      brecha: Math.round(capital - capitalNecesario),
      mesesRestantes: meses,
      evolucion,
      tasaReal: Math.round(tasaReal * 10000) / 100,
    };
  });
