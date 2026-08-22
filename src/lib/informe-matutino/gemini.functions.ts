import { GoogleGenAI } from "@google/genai";
import { InformeMatutinoIASchema } from "./schema";
import type { MarketContextSnapshot, InformeMatutinoIA } from "./types";

const SYSTEM_PROMPT = `
Sos el redactor del informe matutino de Coronar Inversiones, una plataforma
de análisis financiero para inversores argentinos. Vas a recibir un JSON con
datos de mercado reales del día. Tu única tarea es redactar un resumen claro
y estructurado a partir de ESOS datos, en el formato JSON exacto que se te
pide.

REGLAS ABSOLUTAS — su incumplimiento invalida la respuesta:

1. DATOS: Usá exclusivamente los números y hechos presentes en el JSON de
   entrada. Si un campo no está presente o es null, no lo menciones, no lo
   estimes, no lo completes con conocimiento general. Prohibido inventar
   cifras, porcentajes, fechas o eventos que no estén en el input.

2. NOTICIAS: Si usás información de "noticiasCrudas", parafraseá siempre en
   tus propias palabras. Nunca copies frases textuales de más de 10 palabras
   seguidas. Citá la fuente por nombre cuando corresponda (ej: "según
   Infobae").

3. RECOMENDACIONES: Nunca recomiendes comprar o vender un ticker o activo
   individual específico. Hablá únicamente en términos de clase de activo
   (ej: "bonos ajustados por CER", "letras cortas en pesos", "acciones
   defensivas", "cripto de alta capitalización"). Esto es un límite
   regulatorio, no una preferencia de estilo.

4. TONO: Español rioplatense formal, sin anglicismos innecesarios, sin
   muletillas de IA ("es importante destacar que", "en este sentido", "cabe
   señalar"). Oraciones cortas. Sin exclamaciones. Sin emojis salvo los que
   ya vienen definidos en el schema (humorMercado no lleva emoji, es un
   enum).

5. PERFILES: Para "recomendacionPorPerfil" usá siempre estos 7 perfiles CNV
   en este orden: Conservador, Moderado-Conservador, Moderado,
   Moderado-Agresivo, Agresivo, Muy Agresivo, Especulativo. Sugerí clase de
   activo coherente con el contexto de mercado del día (ej: si sube el
   riesgo país y la brecha, un perfil conservador debería inclinarse a
   instrumentos cortos en pesos, no a bonos largos en dólares).

6. FORMATO: Respondé ÚNICAMENTE el JSON solicitado. Sin texto antes, sin
   texto después, sin bloques de código markdown, sin comentarios.

7. Si el JSON de entrada viene con muy pocos datos (por ejemplo, sin datos
   locales), generá igual una respuesta completa pero mencionando solo lo
   disponible — nunca dejes un campo de texto vacío, y nunca rellenes con
   contenido genérico no vinculado al input real.
`;

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    fecha: { type: "string" as const },
    humorMercado: {
      type: "string" as const,
      enum: ["risk-on", "risk-off", "mixto"],
    },
    resumenEjecutivo: { type: "string" as const },
    radarInternacional: {
      type: "object" as const,
      properties: {
        titular: { type: "string" as const },
        bullets: {
          type: "array" as const,
          items: { type: "string" as const },
          maxItems: 5,
        },
      },
      required: ["titular", "bullets"],
    },
    radarLocal: {
      type: "object" as const,
      properties: {
        titular: { type: "string" as const },
        bullets: {
          type: "array" as const,
          items: { type: "string" as const },
          maxItems: 5,
        },
      },
      required: ["titular", "bullets"],
    },
    agendaDelDia: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          hora: { type: "string" as const },
          evento: { type: "string" as const },
          relevancia: {
            type: "string" as const,
            enum: ["alta", "media", "baja"],
          },
        },
        required: ["hora", "evento", "relevancia"],
      },
    },
    oportunidadesDelDia: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          activo: { type: "string" as const },
          motivo: { type: "string" as const },
        },
        required: ["activo", "motivo"],
      },
      maxItems: 5,
    },
    recomendacionPorPerfil: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          perfil: { type: "string" as const },
          claseActivo: { type: "string" as const },
          motivo: { type: "string" as const },
        },
        required: ["perfil", "claseActivo", "motivo"],
      },
      minItems: 7,
      maxItems: 7,
    },
    herramientasSugeridas: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          tab: {
            type: "string" as const,
            enum: [
              "analisis",
              "cuantitativo",
              "renta-fija",
              "cripto",
              "contexto",
              "arbitrador",
              "sectores",
            ],
          },
          motivo: { type: "string" as const },
        },
        required: ["tab", "motivo"],
      },
      maxItems: 4,
    },
  },
  required: [
    "fecha",
    "humorMercado",
    "resumenEjecutivo",
    "radarInternacional",
    "radarLocal",
    "agendaDelDia",
    "oportunidadesDelDia",
    "recomendacionPorPerfil",
    "herramientasSugeridas",
  ],
};

export async function generateInformeMatutino(
  snapshot: MarketContextSnapshot,
): Promise<InformeMatutinoIA | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Informe matutino: falta GEMINI_API_KEY");
    return null;
  }

  try {
    const client = new GoogleGenAI({ apiKey });

    const result = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: JSON.stringify(snapshot) }] }],
      config: {
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("Informe matutino: respuesta vacía de Gemini");
      return null;
    }

    const raw = JSON.parse(text);
    const parsed = InformeMatutinoIASchema.safeParse(raw);

    if (!parsed.success) {
      console.error("Informe matutino: validación Zod fallida", parsed.error);
      return null;
    }

    return parsed.data;
  } catch (err) {
    console.error("Informe matutino: fallo llamada a Gemini", err);
    return null;
  }
}
