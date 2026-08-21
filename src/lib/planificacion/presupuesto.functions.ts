import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CategoriaSchema = z.object({
  nombre: z.string().min(1).max(100),
  monto: z.number().min(0),
});

const InputSchema = z.object({
  ingresos: z.number().min(0),
  gastos: z.array(CategoriaSchema).min(1),
});

export type PresupuestoInput = z.infer<typeof InputSchema>;

export type PresupuestoResult = {
  totalIngresos: number;
  totalGastos: number;
  balance: number;
  alerta: boolean;
  distribucion: { nombre: string; monto: number; porcentaje: number }[];
  tasaAhorro: number;
};

export const calcularPresupuesto = createServerFn({ method: "POST" })
  .inputValidator((input: PresupuestoInput) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<PresupuestoResult> => {
    const totalGastos = data.gastos.reduce((s, g) => s + g.monto, 0);
    const balance = data.ingresos - totalGastos;
    const alerta = totalGastos > data.ingresos;
    const distribucion = data.gastos.map((g) => ({
      nombre: g.nombre,
      monto: g.monto,
      porcentaje: data.ingresos > 0 ? Math.round((g.monto / data.ingresos) * 10000) / 100 : 0,
    }));
    const tasaAhorro =
      data.ingresos > 0
        ? Math.round(((data.ingresos - totalGastos) / data.ingresos) * 10000) / 100
        : 0;

    return {
      totalIngresos: Math.round(data.ingresos * 100) / 100,
      totalGastos: Math.round(totalGastos * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      alerta,
      distribucion: distribucion.sort((a, b) => b.monto - a.monto),
      tasaAhorro,
    };
  });
