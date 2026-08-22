import { z } from "zod";

export const HumorMercadoSchema = z.enum(["risk-on", "risk-off", "mixto"]);

export const InformeMatutinoIASchema = z.object({
  fecha: z.string(),
  humorMercado: HumorMercadoSchema,
  resumenEjecutivo: z.string(),
  radarInternacional: z.object({
    titular: z.string(),
    bullets: z.array(z.string()).max(5),
  }),
  radarLocal: z.object({
    titular: z.string(),
    bullets: z.array(z.string()).max(5),
  }),
  agendaDelDia: z.array(
    z.object({
      hora: z.string(),
      evento: z.string(),
      relevancia: z.enum(["alta", "media", "baja"]),
    }),
  ),
  oportunidadesDelDia: z.array(
    z.object({ activo: z.string(), motivo: z.string() }),
  ).max(5),
  recomendacionPorPerfil: z.array(
    z.object({
      perfil: z.string(),
      claseActivo: z.string(),
      motivo: z.string(),
    }),
  ).min(7).max(7),
  herramientasSugeridas: z.array(
    z.object({
      tab: z.enum(["analisis", "cuantitativo", "renta-fija", "cripto", "contexto", "arbitrador", "sectores"]),
      motivo: z.string(),
    }),
  ).max(4),
});

export type InformeMatutinoIA = z.infer<typeof InformeMatutinoIASchema>;
