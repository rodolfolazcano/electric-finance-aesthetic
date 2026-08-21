import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  activos: z.object({
    liquidos: z.number().min(0),
    inversiones: z.number().min(0),
    inmuebles: z.number().min(0),
    otros: z.number().min(0),
  }),
  pasivos: z.object({
    deudas: z.number().min(0),
  }),
});

export type PatrimonioNetoInput = z.infer<typeof InputSchema>;

export type PatrimonioNetoResult = {
  totalActivos: number;
  totalPasivos: number;
  patrimonioNeto: number;
  distribucionActivos: { nombre: string; monto: number; porcentaje: number }[];
  saludFinanciera: {
    ratio: number;
    label: string;
    color: string;
  };
};

export const calcularPatrimonioNeto = createServerFn({ method: "POST" })
  .inputValidator((input: PatrimonioNetoInput) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<PatrimonioNetoResult> => {
    const totalActivos =
      data.activos.liquidos +
      data.activos.inversiones +
      data.activos.inmuebles +
      data.activos.otros;
    const totalPasivos = data.pasivos.deudas;
    const patrimonioNeto = totalActivos - totalPasivos;

    const distribucionActivos = [
      {
        nombre: "Líquidos",
        monto: data.activos.liquidos,
        porcentaje:
          totalActivos > 0 ? Math.round((data.activos.liquidos / totalActivos) * 10000) / 100 : 0,
      },
      {
        nombre: "Inversiones",
        monto: data.activos.inversiones,
        porcentaje:
          totalActivos > 0
            ? Math.round((data.activos.inversiones / totalActivos) * 10000) / 100
            : 0,
      },
      {
        nombre: "Inmuebles",
        monto: data.activos.inmuebles,
        porcentaje:
          totalActivos > 0 ? Math.round((data.activos.inmuebles / totalActivos) * 10000) / 100 : 0,
      },
      {
        nombre: "Otros",
        monto: data.activos.otros,
        porcentaje:
          totalActivos > 0 ? Math.round((data.activos.otros / totalActivos) * 10000) / 100 : 0,
      },
    ].filter((a) => a.monto > 0);

    const ratio =
      totalPasivos > 0 ? Math.round((totalActivos / totalPasivos) * 100) / 100 : Infinity;
    let label: string;
    let color: string;
    if (ratio >= 3) {
      label = "Saludable";
      color = "text-success";
    } else if (ratio >= 1.5) {
      label = "Aceptable";
      color = "text-warning";
    } else if (ratio > 0) {
      label = "Precaución";
      color = "text-danger";
    } else {
      label = "Crítico";
      color = "text-danger";
    }

    return {
      totalActivos: Math.round(totalActivos * 100) / 100,
      totalPasivos: Math.round(totalPasivos * 100) / 100,
      patrimonioNeto: Math.round(patrimonioNeto * 100) / 100,
      distribucionActivos,
      saludFinanciera: { ratio, label, color },
    };
  });
