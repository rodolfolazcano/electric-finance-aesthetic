import { GoogleGenAI } from "@google/genai";
import { InformeDiagnosticoSchema } from "./schema";
import type { InformeDiagnosticoIA } from "./schema";
import type { FlagCoherencia } from "../coherencia/flags";

const SYSTEM_PROMPT = `
Sos el redactor del informe de diagnóstico de portafolio de Coronar Inversiones,
una plataforma de análisis financiero para inversores argentinos.
Vas a recibir un JSON con datos estructurados de portafolio y debés generar
un informe claro en formato JSON exacto.

REGLAS ABSOLUTAS:

1. DATOS: Usá exclusivamente los números presentes en el JSON de entrada.
   Nunca inventes cifras, porcentajes, fechas o proyecciones.

2. RENDIMIENTO PASADO: El backtest es histórico condicional a señales técnicas
   pasadas. Nunca digas "vas a ganar X%" o "rendimiento esperado de X%".
   Siempre en pasado: "en el período testeado el portafolio rindió...".

3. LIMITACIONES: Las limitaciones metodológicas (limitacionesMetodologicas en
   el input) deben mencionarse textualmente, sin suavizarlas ni omitirlas.

4. FLAGS DE COHERENCIA: Explicá cada flag en lenguaje simple. No inventes
   causas que no estén en el flag. Si un flag dice "divergencia técnico-
   fundamental", no agregues "esto podría deberse a..." salvo que sea
   obvio del contexto del portafolio.

5. TONO: Español rioplatense formal, sin anglicismos innecesarios, sin
   muletillas de IA ("es importante destacar", "cabe señalar").
   Oraciones cortas. Sin exclamaciones ni emojis.

6. COMPARACIÓN: La comparación con el portafolio del usuario es objetiva.
   Si el usuario tiene mejor Sharpe pero peor drawdown, decilo sin sesgo.

7. ACCIONES: Las acciones sugeridas deben ser concretas y vinculadas a los
   datos del informe. Ej: "considerar reducir tu posición en [ticker], que
   muestra divergencia técnico-fundamental". No más de 5, no menos de 3.

8. FORMATO: Respondé ÚNICAMENTE el JSON solicitado. Sin texto antes, sin
   texto después, sin bloques de código, sin comentarios.
`;

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    resumen: { type: "string" as const },
    porQueEstePortafolio: { type: "string" as const },
    queDiceElBacktest: { type: "string" as const },
    comparacionConUsuario: { type: "string" as const },
    accionesSugeridas: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          accion: { type: "string" as const },
          motivo: { type: "string" as const },
          severidad: { type: "string" as const, enum: ["alta", "media", "baja"] as const },
        },
        required: ["accion", "motivo", "severidad"],
      },
      minItems: 3,
      maxItems: 5,
    },
    limitaciones: {
      type: "array" as const,
      items: { type: "string" as const },
      minItems: 1,
    },
  },
  required: [
    "resumen", "porQueEstePortafolio", "queDiceElBacktest",
    "comparacionConUsuario", "accionesSugeridas", "limitaciones",
  ],
};

export interface InputDiagnostico {
  perfilCliente: string;
  portafolioRecomendado: {
    posiciones: { ticker: string; pesoPct: number }[];
    metricas: Record<string, number | null>;
  };
  portafolioUsuario: {
    posiciones: { ticker: string; pesoPct: number }[];
    metricas: Record<string, number | null>;
  };
  comparacion: Record<string, { usuario: number | null; recomendado: number | null; benchmark: number | null }>;
  backtestRecomendado: { cagr: number | null; hitRate: number | null; periodoTesteado: string };
  flagsCoherencia: FlagCoherencia[];
  limitacionesMetodologicas: string[];
}

export async function generarInformeDiagnostico(
  input: InputDiagnostico,
): Promise<InformeDiagnosticoIA | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  try {
    const client = new GoogleGenAI({ apiKey });

    const result = await client.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
      config: {
        systemInstruction: { role: "system", parts: [{ text: SYSTEM_PROMPT }] },
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.4,
      },
    });

    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const raw = JSON.parse(text);
    const parsed = InformeDiagnosticoSchema.safeParse(raw);
    if (!parsed.success) return null;

    return parsed.data;
  } catch {
    return null;
  }
}
