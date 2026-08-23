import { resilientJson } from "@/lib/ai/providers.server";
import { REASONING_CHAIN } from "@/lib/ai/model-catalog";
import type { ChatMessage } from "@/lib/ai/providers.server";
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

8. ESTILO DEL INFORME ("Lo que hay que saber esta mañana"): cada bullet es
   una unidad autocontenida tipo nota periodística breve: abre con un
   subtítulo temático seguido de dos puntos, presenta el dato duro y cierra
   con la implicancia para el inversor. Ejemplo del estilo esperado:

   "Lo que se viene. Hoy se publican los PMI preliminares de agosto de
   S&P Global para EE.UU.: el manufacturero se espera en 54,0 (anterior:
   53,9), ambos a las 11:45 hs."

   "Señal desde el consumo. Walmart reportó ventas comparables por debajo
   del consenso y el tráfico cayó a menos de la mitad del trimestre previo;
   como barómetro del consumo masivo estadounidense, el deterioro puede
   anticipar un enfriamiento de la demanda interna."

9. USO DE LAS SECCIONES NUEVAS DEL INPUT:
   - "calendarioHoy": eventos de HOY con consenso ("consenso"), dato
     anterior ("previo") y hora local AR. Priorizá relevancia alta/media.
     Mencioná consenso, previo y hora cuando estén disponibles.
   - "resultadosCorporativos": empresas que reportan hoy; si hay consenso
     de EPS, incluílo. Explicá brevemente por qué esa empresa funciona como
     termómetro sectorial o del consumo.
   - "indec": EMAE (variación mensual e interanual) y comercio exterior
     (exportaciones, importaciones, saldo, variaciones interanuales,
     acumulado del año). Usá estos números en el radarLocal para describir
     actividad y sector externo; indicá el mes del dato ("fechaDato").
   - "noticiasCrudas": usalas para política/economía local (medidas de
     gobierno, licitaciones, normativa) y para contexto internacional que
     no salga de los números (Fed, geopolítica, crudo).
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
  try {
    const messages: ChatMessage[] = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(snapshot) },
    ];

    const result = await resilientJson(REASONING_CHAIN, messages, {
      schema: InformeMatutinoIASchema,
      temperature: 0.4,
      maxTokens: 16384,
    });

    if (!result.ok) {
      console.error("Informe matutino: fallo NVIDIA", result.error);
      return null;
    }

    return result.data;
  } catch (err) {
    console.error("Informe matutino: fallo llamada NVIDIA", err);
    return null;
  }
}
