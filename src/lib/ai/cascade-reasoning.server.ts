// Razonamiento en cascada. Server-only.
//
// ANTES de generar el prompt final con el mejorador/generador, este módulo
// razona sobre la solicitud, instrucciones y contexto del usuario con un
// modelo cloud NVIDIA.
//
// Pipeline del chat IA:
//   usuario → ROUTER (router-agent) → CASCADA (este módulo, interpreta la
//   intención/instrucciones) → MEJORADOR (improve-prompt) → GENERADOR
//
// El resultado de la cascada es una interpretación estructurada de la
// solicitud: objetivo, instrucciones clave, restricciones, tono y formato.
// Si ningún modelo cloud responde, se devuelve una interpretación derivada
// del texto original (fallback determinístico), nunca corta el flujo.
import { resilientJson } from "./providers.server";
import { SHORT_NARRATIVE_CHAIN } from "./model-catalog";

export const CASCADE_MODEL = "z-ai/glm-5.2";

export type CascadeInterpretation = {
  /** Resumen del objetivo del usuario (1-2 frases). */
  objetivo: string;
  /** Instrucciones clave detectadas, en orden de prioridad. */
  instrucciones: string[];
  /** Restricciones/reglas que el generador debe respetar. */
  restricciones: string[];
  /** Tono de la pieza (formal, directo, persuasivo, educativo…). */
  tono: string;
  /** Formato de salida esperado (imagen, video, texto, pdf, pptx…). */
  formato: string;
  /** Extras que enriquecen el prompt (datos, referencias, estilo). */
  extras: string[];
  /** Si la interpretación vino del modelo (true) o del fallback (false). */
  origenModelo: boolean;
  /** Modelo que razonó (nemotron-cascade-2 o "fallback"). */
  modelo: string;
};

const CASCADE_SYSTEM = `Sos el módulo de razonamiento en cascada de un asistente financiero (Coronar Inversiones).
Recibís la solicitud cruda del usuario y debés interpretarla en instrucciones
accionables para un generador de contenido (imagen, video, texto o PDF).
NO generes el contenido final: solo INTERPRETÁ y estructurá la solicitud.
Reglas:
- Objetivo: una o dos frases que resumen lo que el usuario quiere lograr.
- Instrucciones: pasos concretos y accionables, en orden de prioridad.
- Restricciones: todo lo que NO debe hacerse (sin personas, sin logos, sin
  promesas de rendimiento, datos verificados, formato argentino de números).
- Tono: una palabra o frase corta.
- Formato: uno de imagen | video | texto | pdf | pptx | audio | código | consulta.
- Extras: datos, referencias, estilo o contexto adicional que mejoren el prompt.
Devolvé SOLO JSON válido sin markdown:
{"objetivo":"...","instrucciones":["..."],"restricciones":["..."],"tono":"...","formato":"...","extras":["..."]}`;

/** Razonamiento determinístico de respaldo (sin modelo). */
export function fallbackInterpretation(message: string): CascadeInterpretation {
  const m = message.trim();
  return {
    objetivo: m.slice(0, 240),
    instrucciones: m.split(/[.;\n]+/).filter((s) => s.trim().length > 8).map((s) => s.trim()).slice(0, 6),
    restricciones: [
      "Cifras en formato argentino (punto de miles, coma decimal)",
      "Ningún dato inventado: usar solo el contexto provisto",
      "Sin promesas de rendimiento garantizado",
    ],
    tono: "profesional, directo, español rioplatense",
    formato: detectFormato(m),
    extras: [],
    origenModelo: false,
    modelo: "fallback",
  };
}

function detectFormato(m: string): string {
  const lower = m.toLowerCase();
  if (/\b(video|clip|animaci|gif|reel)\b/.test(lower)) return "video";
  if (/\b(imagen|fondo|arte|ilustraci)\b/.test(lower)) return "imagen";
  if (/\b(pdf|informe|reporte|documento)\b/.test(lower)) return "pdf";
  if (/\b(pptx|slides|pieza|placa|post|story)\b/.test(lower)) return "pptx";
  if (/\b(audio|narraci|voz)\b/.test(lower)) return "audio";
  if (/\b(codigo|script|function)\b/.test(lower)) return "código";
  return "consulta";
}

function toInterpretation(raw: unknown, message: string): CascadeInterpretation {
  const o = (raw ?? {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : [];
  const str = (v: unknown, def = ""): string =>
    typeof v === "string" && v.trim() ? v.trim() : def;
  return {
    objetivo: str(o.objetivo, message.slice(0, 240)),
    instrucciones: arr(o.instrucciones),
    restricciones: arr(o.restricciones),
    tono: str(o.tono, "profesional, directo"),
    formato: str(o.formato, detectFormato(message)),
    extras: arr(o.extras),
    origenModelo: true,
    modelo: CASCADE_MODEL,
  };
}

/**
 * Razonamiento en cascada sobre la solicitud del usuario. Intenta con un
 * modelo cloud; si falla, usa el fallback determinístico.
 * `contexto` opcional: archivos/UI/contexto de sesión para razonar con más data.
 */
export async function cascadeReason(
  message: string,
  contexto?: string,
): Promise<CascadeInterpretation> {
  try {
    const userPrompt = `SOLICITUD DEL USUARIO:\n${message}${contexto ? `\n\nCONTEXTO DISPONIBLE:\n${contexto.slice(0, 6000)}` : ""}`;
    const result = await resilientJson<CascadeInterpretation>(
      SHORT_NARRATIVE_CHAIN,
      [
        { role: "system", content: CASCADE_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      { maxTokens: 1500, temperature: 0.2 },
    );
    if (result.provider === "fallback") return fallbackInterpretation(message);
    return toInterpretation(result.value, message);
  } catch {
    return fallbackInterpretation(message);
  }
}

/** Convierte la interpretación en un bloque de instrucciones para el generador. */
export function cascadeBlock(interp: CascadeInterpretation): string {
  const lines: string[] = [
    "INTERPRETACIÓN EN CASCADA DE LA SOLICITUD (respetala al generar):",
    `- Objetivo: ${interp.objetivo}`,
    `- Formato: ${interp.formato}`,
    `- Tono: ${interp.tono}`,
  ];
  if (interp.instrucciones.length)
    lines.push(`- Instrucciones:\n${interp.instrucciones.map((i) => `  · ${i}`).join("\n")}`);
  if (interp.restricciones.length)
    lines.push(`- Restricciones:\n${interp.restricciones.map((r) => `  · ${r}`).join("\n")}`);
  if (interp.extras.length) lines.push(`- Extras: ${interp.extras.join("; ")}`);
  return lines.join("\n");
}
