// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  monto: z.number().min(1),
  tasaAnual: z.number().min(0).max(100),
  plazoMeses: z.number().min(1).max(480),
  sistema: z.enum(["frances", "aleman"]),
});

export type HipotecaInput = z.infer<typeof InputSchema>;

export type CuotaRow = {
  cuota: number;
  capital: number;
  interes: number;
  saldo: number;
};

export type HipotecaResult = {
  cuota: number;
  tabla: CuotaRow[];
  totalIntereses: number;
  totalPagado: number;
  cuotaMaxima: number;
};

export const calcularHipoteca = createServerFn({ method: "POST" })
  .inputValidator((input: HipotecaInput) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<HipotecaResult> => {
    const i = data.tasaAnual / 100 / 12;
    const n = data.plazoMeses;
    const tabla: CuotaRow[] = [];
    let saldo = data.monto;
    let totalIntereses = 0;
    let cuotaMaxima = 0;

    if (data.sistema === "frances") {
      const cuota = (data.monto * i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
      for (let k = 1; k <= n; k++) {
        const interes = saldo * i;
        const capital = cuota - interes;
        saldo -= capital;
        totalIntereses += interes;
        cuotaMaxima = Math.max(cuotaMaxima, cuota);
        tabla.push({
          cuota: Math.round(cuota * 100) / 100,
          capital: Math.round(capital * 100) / 100,
          interes: Math.round(interes * 100) / 100,
          saldo: Math.round(Math.max(saldo, 0) * 100) / 100,
        });
      }
      return {
        cuota: Math.round(cuota * 100) / 100,
        tabla,
        totalIntereses: Math.round(totalIntereses * 100) / 100,
        totalPagado: Math.round(cuota * n * 100) / 100,
        cuotaMaxima,
      };
    }

    // Sistema alemán
    const amortizacionFija = data.monto / n;
    for (let k = 1; k <= n; k++) {
      const interes = saldo * i;
      const cuota = amortizacionFija + interes;
      saldo -= amortizacionFija;
      totalIntereses += interes;
      cuotaMaxima = Math.max(cuotaMaxima, cuota);
      tabla.push({
        cuota: Math.round(cuota * 100) / 100,
        capital: Math.round(amortizacionFija * 100) / 100,
        interes: Math.round(interes * 100) / 100,
        saldo: Math.round(Math.max(saldo, 0) * 100) / 100,
      });
    }
    return {
      cuota: Math.round(tabla[0].cuota * 100) / 100,
      tabla,
      totalIntereses: Math.round(totalIntereses * 100) / 100,
      totalPagado: Math.round((data.monto + totalIntereses) * 100) / 100,
      cuotaMaxima,
    };
  });
