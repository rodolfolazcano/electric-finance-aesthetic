import { z } from "zod";

export const InformeDiagnosticoSchema = z.object({
  resumen: z.string(),
  porQueEstePortafolio: z.string(),
  queDiceElBacktest: z.string(),
  comparacionConUsuario: z.string(),
  accionesSugeridas: z.array(
    z.object({
      accion: z.string(),
      motivo: z.string(),
      severidad: z.enum(["alta", "media", "baja"]),
    }),
  ).min(3).max(5),
  limitaciones: z.array(z.string()).min(1),
});

export type InformeDiagnosticoIA = z.infer<typeof InformeDiagnosticoSchema>;
