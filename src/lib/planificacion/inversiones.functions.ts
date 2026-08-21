import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  montoInicial: z.number().min(0),
  aportePeriodico: z.number().min(0),
  frecuencia: z.enum(["mensual", "trimestral", "anual"]),
  tasaEsperada: z.number().min(0).max(100),
  plazoAnos: z.number().min(1).max(80),
  tipoInteres: z.enum(["simple", "compuesto"]),
});

export type InversionesInput = z.infer<typeof InputSchema>;

export type ProyeccionRow = {
  ano: number;
  capital: number;
  aportesAcumulados: number;
  ganancia: number;
};

export type InversionesResult = {
  proyeccion: ProyeccionRow[];
  totalAportado: number;
  totalGanancia: number;
  capitalFinal: number;
  sinAportes: ProyeccionRow[];
};

function aportesPorAno(data: InversionesInput): number {
  switch (data.frecuencia) {
    case "mensual":
      return data.aportePeriodico * 12;
    case "trimestral":
      return data.aportePeriodico * 4;
    case "anual":
      return data.aportePeriodico;
  }
}

export const calcularInversiones = createServerFn({ method: "POST" })
  .inputValidator((input: InversionesInput) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<InversionesResult> => {
    const r = data.tasaEsperada / 100;
    const aporteAnual = aportesPorAno(data);
    const proyeccion: ProyeccionRow[] = [];
    const sinAportes: ProyeccionRow[] = [];

    let capital = data.montoInicial;
    let capitalSin = data.montoInicial;
    let totalAportado = 0;

    for (let a = 1; a <= data.plazoAnos; a++) {
      if (data.tipoInteres === "compuesto") {
        capital = capital * (1 + r) + aporteAnual;
        capitalSin = capitalSin * (1 + r);
      } else {
        const gananciaBase = data.montoInicial * r;
        capital = data.montoInicial + gananciaBase * a + aporteAnual * a;
        capitalSin = data.montoInicial + gananciaBase * a;
      }
      totalAportado += aporteAnual;

      proyeccion.push({
        ano: a,
        capital: Math.round(capital * 100) / 100,
        aportesAcumulados: Math.round((data.montoInicial + totalAportado) * 100) / 100,
        ganancia: Math.round((capital - data.montoInicial - totalAportado) * 100) / 100,
      });
      sinAportes.push({
        ano: a,
        capital: Math.round(capitalSin * 100) / 100,
        aportesAcumulados: Math.round(data.montoInicial * 100) / 100,
        ganancia: Math.round((capitalSin - data.montoInicial) * 100) / 100,
      });
    }

    return {
      proyeccion,
      totalAportado: Math.round((data.montoInicial + totalAportado) * 100) / 100,
      totalGanancia: Math.round((capital - data.montoInicial - totalAportado) * 100) / 100,
      capitalFinal: Math.round(capital * 100) / 100,
      sinAportes,
    };
  });
