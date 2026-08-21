import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const DeudaSchema = z.object({
  nombre: z.string().min(1).max(100),
  monto: z.number().min(0),
  tasa: z.number().min(0).max(100),
  cuotaMinima: z.number().min(0),
});

const InputSchema = z.object({
  deudas: z.array(DeudaSchema).min(1),
  pagoMensual: z.number().min(0),
  estrategia: z.enum(["avalancha", "bola-nieve"]),
});

export type PasivosInput = z.infer<typeof InputSchema>;
export type DeudaInput = z.infer<typeof DeudaSchema>;

export type PagoRow = {
  mes: number;
  deuda: string;
  monto: number;
  saldoRestante: number;
};

export type PasivosResult = {
  estrategia: string;
  mesesTotal: number;
  interesTotal: number;
  cronograma: PagoRow[];
  resumenPorDeuda: { nombre: string; meses: number; interes: number }[];
};

export const calcularPasivos = createServerFn({ method: "POST" })
  .inputValidator((input: PasivosInput) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<PasivosResult> => {
    const deudas = data.deudas.map((d) => ({ ...d, saldo: d.monto, interesPagado: 0 }));
    const cronograma: PagoRow[] = [];
    const resumenPorDeuda: PasivosResult["resumenPorDeuda"] = [];
    let mes = 0;
    let interesTotal = 0;

    while (deudas.some((d) => d.saldo > 0.01)) {
      mes++;
      let disponible = data.pagoMensual;

      if (data.estrategia === "avalancha") {
        deudas.sort((a, b) => b.tasa - a.tasa);
      } else {
        deudas.sort((a, b) => b.monto - a.monto);
      }

      for (const d of deudas) {
        if (d.saldo <= 0.01) continue;
        const interes = (d.saldo * d.tasa) / 100 / 12;
        d.interesPagado += interes;
        interesTotal += interes;
        const pagoCapital = Math.min(disponible - interes, d.saldo);
        const pago = interes + pagoCapital;
        if (pago > disponible) break;
        d.saldo -= pagoCapital;
        disponible -= pago;
        cronograma.push({
          mes,
          deuda: d.nombre,
          monto: Math.round(pago * 100) / 100,
          saldoRestante: Math.round(Math.max(d.saldo, 0) * 100) / 100,
        });
        if (d.saldo <= 0.01 && !resumenPorDeuda.find((r) => r.nombre === d.nombre)) {
          resumenPorDeuda.push({
            nombre: d.nombre,
            meses: mes,
            interes: Math.round(d.interesPagado * 100) / 100,
          });
        }
      }

      if (mes > 600) break;
    }

    return {
      estrategia:
        data.estrategia === "avalancha"
          ? "Avalancha (mayor tasa primero)"
          : "Bola de nieve (mayor deuda primero)",
      mesesTotal: mes,
      interesTotal: Math.round(interesTotal * 100) / 100,
      cronograma,
      resumenPorDeuda,
    };
  });
