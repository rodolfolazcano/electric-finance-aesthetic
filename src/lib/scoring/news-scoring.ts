import { resilientJson } from "@/lib/ai/providers.server";
import { JSON_CHAIN } from "@/lib/ai/model-catalog";
import type { ChatMessage } from "@/lib/ai/providers.server";
import { z } from "zod";

const NewsSentimientoSchema = z.object({
  ticker: z.string(),
  sentimiento: z.enum(["positivo", "neutral", "negativo"]),
  intensidad: z.number(),
  motivoBreve: z.string(),
});

const NEWS_SYSTEM_PROMPT = `Clasificá el sentimiento de las siguientes noticias financieras para el ticker indicado. 
NO es una recomendación de compra/venta. Solo clasificá el tono de lo que está escrito.
Devolvé un JSON con: ticker, sentimiento ("positivo"|"neutral"|"negativo"), intensidad (0-100), motivoBreve.`;

export interface NewsSentimiento {
  ticker: string;
  sentimiento: "positivo" | "neutral" | "negativo";
  intensidad: number;
  motivoBreve: string;
}

export async function clasificarSentimientoNoticias(
  ticker: string,
  titulares: string[],
): Promise<NewsSentimiento | null> {
  if (titulares.length === 0) return null;

  try {
    const messages: ChatMessage[] = [
      { role: "system", content: NEWS_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify({ ticker, noticias: titulares }) },
    ];

    const result = await resilientJson(JSON_CHAIN, messages, {
      schema: NewsSentimientoSchema,
      temperature: 0.2,
    });

    if (!result.ok) return null;

    return {
      ticker: result.data.ticker ?? ticker,
      sentimiento: result.data.sentimiento ?? "neutral",
      intensidad: Math.min(100, Math.max(0, result.data.intensidad ?? 50)),
      motivoBreve: result.data.motivoBreve ?? "",
    };
  } catch {
    return null;
  }
}

export function sentimientoAScore(sentimiento: NewsSentimiento | null): number | null {
  if (!sentimiento) return null;

  switch (sentimiento.sentimiento) {
    case "positivo":
      return 50 + Math.round(sentimiento.intensidad * 0.5);
    case "negativo":
      return 50 - Math.round(sentimiento.intensidad * 0.5);
    case "neutral":
      return 50;
  }
}
