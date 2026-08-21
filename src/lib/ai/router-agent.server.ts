// PRIMER AGENTE — router inteligente. Server-only.
// Es el punto de entrada de los chats IA de la app (Studio + agente lateral).
// Analiza lo que pide el usuario y asigna el modelo MÁS AVANZADO para esa
// tarea, equilibrando rapidez, eficacia y calidad:
//   1. Detecta la modalidad (texto/imagen/video/PDF/código/consulta…).
//   2. Detecta la complejidad (simple/media/compleja).
//   3. Asigna la cadena de modelos óptima: cloud avanzado primero, local de
//      respaldo (Ollama) si el cloud falla o no está configurado.
//   4. El resultado alimenta a los generadores SIEMPRE pasando antes por el
//      mejorador de prompts (improve-prompt.server).
import "./env.server";
import {
  AUDIT_CHAIN,
  CODE_CHAIN,
  JSON_CHAIN,
  NARRATIVE_CHAIN,
  REASONING_CHAIN,
  VISION_CHAIN,
  DATA_SCIENCE_CHAIN,
  ANALYTICS_CHAIN,
  chainWithPreference,
  type ModelRef,
  type ModelPrefs,
  type ProviderId,
} from "./model-catalog";

export type MultimodalMode =
  | "text_to_image"
  | "image_to_image"
  | "text_to_video"
  | "image_to_text"
  | "image_to_video"
  | "video_to_text";

export type RouterIntent =
  | "generate_image"
  | "edit_image"
  | "generate_video"
  | "describe_image"
  | "generate_audio"
  | "build_pptx"
  | "render_pdf"
  | "write_text"
  | "code"
  | "audit"
  | "reasoning"
  | "json"
  | "data_science"
  | "analytics"
  | "question";

export type RouterDecision = {
  intent: RouterIntent;
  modalidad?: MultimodalMode;
  complejidad: "simple" | "media" | "compleja";
  /** Tarea del catálogo a usar (para resolver la cadena). */
  task: "reasoning" | "narrative" | "json" | "code" | "audit" | "image" | "vision" | "design";
  /** Modelo avanzado recomendado (primer modelo de la cadena asignada). */
  assignedModel: string;
  provider: ProviderId;
  /** Modelo local de respaldo si hay Ollama disponible. */
  localBackup?: string;
  /** Razonamiento legible del ruteo. */
  rationale: string;
};

//  Detección por patrones (0ms, sin modelo) 

const T2I_RE =
  /\b(gener(á|a|ar)?|cre(á|a|ar)?|dibuj(á|a|ar)?|imagen|ilustraci|ilustr(á|a)|imagen(es)?|fondo|arte|arte de|banner|thumb|miniatur|portada|wallpaper)\b/i;
const I2I_RE =
  /\b(edit(á|a|ar)?|modific(á|a|ar)?|cambi(á|a|ar)?|transform(á|a|ar)?|borr(á|a|ar)? el fondo|quit(á|a|ar)? fondo|redimension|estiliz(á|a|ar)?)\b/i;
const T2V_RE =
  /\b(video|clip|animaci|anim(á|a|ar)?|reel|gif|timelapse|motion)\b/i;
const I2T_RE = /\b(le(é|e|er|eme)?|transcrib(í|i|ir)?|describe|descripci|que dice|que muestra|analiz(á|a|ar)? esta imagen)\b/i;
const V2T_RE =
  /\b(transcrib(í|i|ir)? el video|que dice el video|resum(í|i|ir)? el video|que muestra el video|subtitul)\b/i;
const AUDIO_RE = /\b(audio|voz|narraci|podcast|locuci|tts)\b/i;
const PPTX_RE = /\b(pptx|powerpoint|presentaci|slides|pieza|placa|story|historia|post|posteo|publicaci)\b/i;
const PDF_RE = /\b(pdf|informe|reporte|documento|research|paper|resumen ejecutivo)\b/i;
const CODE_RE =
  /\b(codigo|código|script|function|función|bug|error|depur|compil|build|escribi|cre(á|a|ar)? un archivo|typescript|python|jsx|tsx)\b/i;
const AUDIT_RE =
  /\b(revis(á|a|ar)?|audit|detect(á|a|ar)? errores|incoherenci|valid(á|a|ar)?|verific(á|a|ar)?|cheque(á|a|ar)?|compar(á|a|ar)?)\b/i;
const JSON_RE = /\b(json|estructur(á|a|ar)?|tabla|extra(é|e|er)? datos|parse|schema)\b/i;
const REASONING_RE =
   /\b(analiz(á|a|ar)?|estrategi|recomend|proyecc|escenario|valuaci|riesgo|que hago|como invierto|tendencia|mercado|trading)\b/i;
const DATA_SCIENCE_RE = 
   /\b(dato|datos|tabla|gráfico|gr(á|a)fico|chart|plot|serie|correl|anomal|outlier|trend|tendencia|análisi(s|s de) de dato|kpi|métrica|estadístic)\b/i;
const ANALYTICS_RE = 
   /\b(resum(í|i|ir)? (los datos|la tabla|el gráfico)|que (muestra|dice) (esta|esa) tabla|interpreta (la|esta) tabla|análisis rápido|quick insight)\b/i;

/** Detecta la modalidad multimodal de la petición (si aplica). */
export function detectModalidad(message: string, hasAttachment: boolean): MultimodalMode | undefined {
  const m = message.toLowerCase();
  if (hasAttachment && (V2T_RE.test(m) || (m.includes("video") && m.includes("transcrib"))))
    return "video_to_text";
  if (hasAttachment && I2T_RE.test(m)) return "image_to_text";
  if (hasAttachment && m.includes("video") && (m.includes("anim") || m.includes("editar") || m.includes("convert")))
    return "image_to_video";
  if (hasAttachment && (I2I_RE.test(m) || m.includes("imagen"))) return "image_to_image";
  if (T2V_RE.test(m) && !I2T_RE.test(m)) return "text_to_video";
  if (T2I_RE.test(m)) return "text_to_image";
  return undefined;
}

/** Detecta la intención principal del turno. */
export function detectIntent(message: string, modalidad?: MultimodalMode): RouterIntent {
  if (modalidad) {
    switch (modalidad) {
      case "text_to_image":
        return "generate_image";
      case "image_to_image":
        return "edit_image";
      case "text_to_video":
      case "image_to_video":
        return "generate_video";
      case "image_to_text":
      case "video_to_text":
        return "describe_image";
    }
  }
  const m = message.toLowerCase();
  if (ANALYTICS_RE.test(m)) return "analytics";
  if (DATA_SCIENCE_RE.test(m)) return "data_science";
  if (CODE_RE.test(m) && (m.includes("error") || m.includes("bug") || m.includes("depur") || m.includes("revis")))
    return "audit";
  if (CODE_RE.test(m)) return "code";
  if (AUDIO_RE.test(m)) return "generate_audio";
  if (PDF_RE.test(m) && (m.includes("informe") || m.includes("reporte") || m.includes("pdf"))) return "render_pdf";
  if (PPTX_RE.test(m) && !m.includes("video")) return "build_pptx";
  if (JSON_RE.test(m)) return "json";
  if (AUDIT_RE.test(m)) return "audit";
  if (REASONING_RE.test(m)) return "reasoning";
  return "question";
}

/** Heurística de complejidad (0ms). */
export function detectComplejidad(message: string, contextChars = 0): "simple" | "media" | "compleja" {
  const m = message.trim();
  if (m.length < 40 && contextChars < 4_000) return "simple";
  if (m.length > 220 || contextChars > 25_000 || /\?\s*[A-Z¿]|,|;/.test(m)) return "compleja";
  return "media";
}

//  Mapeo intención → tarea del catálogo 

const INTENT_TO_TASK: Record<RouterIntent, RouterDecision["task"]> = {
  generate_image: "image",
  edit_image: "vision",
  generate_video: "reasoning",
  describe_image: "vision",
  generate_audio: "narrative",
  build_pptx: "reasoning",
  render_pdf: "reasoning",
  write_text: "narrative",
  code: "code",
  audit: "audit",
  reasoning: "reasoning",
  json: "json",
  data_science: "data_science",
  analytics: "analytics",
  question: "narrative",
};

const INTENT_TO_CHAIN: Record<RouterIntent, ModelRef[]> = {
  generate_image: REASONING_CHAIN,
  edit_image: VISION_CHAIN,
  generate_video: REASONING_CHAIN,
  describe_image: VISION_CHAIN,
  generate_audio: NARRATIVE_CHAIN,
  build_pptx: REASONING_CHAIN,
  render_pdf: REASONING_CHAIN,
  write_text: NARRATIVE_CHAIN,
  code: CODE_CHAIN,
  audit: AUDIT_CHAIN,
  reasoning: REASONING_CHAIN,
  json: JSON_CHAIN,
  data_science: DATA_SCIENCE_CHAIN,
  analytics: ANALYTICS_CHAIN,
  question: NARRATIVE_CHAIN,
};

export type RouteInput = {
  message: string;
  /** Si el usuario adjuntó un archivo/imagen/video en el turno. */
  hasAttachment?: boolean;
  contextChars?: number;
  modelPrefs?: ModelPrefs | null;
};

/**
 * Router principal: clasifica la petición y asigna el mejor modelo.
 * No llama modelos para rutear (heurística rápida + preferencias del usuario);
 * el "primer agente" más inteligente es la combinación de esta heurística con
 * el mejorador de prompts (improve-prompt) que corre antes de cada generador.
 */
export async function routeTask(input: RouteInput): Promise<RouterDecision> {
  const modalidad = detectModalidad(input.message, input.hasAttachment ?? false);
  const intent = detectIntent(input.message, modalidad);
  const complejidad = detectComplejidad(input.message, input.contextChars ?? 0);

  const task = INTENT_TO_TASK[intent];
  const base = INTENT_TO_CHAIN[intent];
  const prefs = input.modelPrefs ?? null;
  const prefId = prefs?.[task];
  const chain = chainWithPreference(base, prefId);
  const lead = chain[0];

  let localBackup: string | undefined;
  // Ollama deshabilitado: solo cloud (NVIDIA).

  const rationale = `intención=${intent}, modalidad=${modalidad ?? "—"}, complejidad=${complejidad}. Modelo asignado: ${lead?.provider}/${lead?.model}.`;

  return {
    intent,
    modalidad,
    complejidad,
    task,
    assignedModel: `${lead?.provider}/${lead?.model}`,
    provider: lead?.provider ?? "fallback",
    localBackup,
    rationale,
  };
}

/** Convierte la decisión en un array de ModelRef con el respaldo local al final. */
export async function chainForDecision(
  decision: RouterDecision,
): Promise<{ cloud: ModelRef[]; local?: ModelRef }> {
  const base = INTENT_TO_CHAIN[decision.intent];
  return { cloud: base };
}
