// @ts-nocheck
// FASE 6 — Clasificador Gemini compartido (leaf).
// No tiene core que delegar: es la fuente de clasificación por IA que usan
// src/lib/scoring/noticias.ts (Fase 3) y scoring-engine.ts. El motor unificado
// lo consume vía calcularScoreNoticias. Sin cambios funcionales.
import { GoogleGenAI } from "@google/genai";

const NEWS_SCHEMA = {
  type: "object",
  properties: {
    ticker: { type: "string" },
    sentimiento: { type: "string", enum: ["positivo", "neutral", "negativo"] },
    intensidad: { type: "number" },
    motivoBreve: { type: "string" },
  },
  required: ["ticker", "sentimiento", "intensidad", "motivoBreve"],
};

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

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new GoogleGenAI({ apiKey });

    const result = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: JSON.stringify({ ticker, noticias: titulares }) }],
        },
      ],
      config: {
        systemInstruction: { role: "system", parts: [{ text: NEWS_SYSTEM_PROMPT }] },
        responseMimeType: "application/json",
        responseSchema: NEWS_SCHEMA,
        temperature: 0.2,
      },
    });

    const text = result.text;
    if (!text) return null;

    const raw = JSON.parse(text);
    return {
      ticker: raw.ticker ?? ticker,
      sentimiento: raw.sentimiento ?? "neutral",
      intensidad: Math.min(100, Math.max(0, raw.intensidad ?? 50)),
      motivoBreve: raw.motivoBreve ?? "",
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
