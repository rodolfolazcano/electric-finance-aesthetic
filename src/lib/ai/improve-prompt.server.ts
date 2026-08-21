// Mejora de prompts con modelos de Ollama (texto→imagen, texto→video,
// texto→texto y texto→PDF). Reescribe el prompt con más detalle para mejores
// resultados de generación.
// Modelos soportados:
// - gnokit/improve-prompt (default, "rewrite"): reescribe el prompt.
// - goonsai/qwen2.5-1.5B-goonsai-nsfw-10k y goonsai/qwen2.5-3B-goonsai-nsfw-100k
//   ("completion"): autocompletan la idea inicial con el resto del prompt.
// - advancedistroadmin/buddy ("rewrite"): asiste en tareas de texto y PDF.
// El modelo se puede seleccionar por tarea desde la UI (modelPrefs.prompt_image,
// modelPrefs.prompt_video, modelPrefs.prompt_text, modelPrefs.prompt_pdf); si no
// hay preferencia, se usa el env fallback.
//
// Guarda de contenido: el estudio genera contenido financiero para un asesor
// CNV con reglas duras (sin personas/rostros, sin texto, sin logos). Todo
// output del improver que contenga términos de personas o NSFW se descarta y
// se usa el prompt original. Si Ollama no está disponible, fallback silencioso
// al prompt original: nunca corta la generación.

import type { ModelPrefs } from "./model-catalog";

const MAX_IMPROVED_CHARS = 1400;

/** Lee un flag de habilitación: "false" / "0" / "" → apagado. */
function isEnabled(raw: string | undefined): boolean {
  return raw !== "false" && raw !== "0" && raw !== "";
}

/** Si la mejora de prompt de imagen está habilitada (default: sí). */
export function isPromptImproverEnabled(): boolean {
  return isEnabled(process.env.OLLAMA_PROMPT_IMPROVER_ENABLED);
}

/** Si la mejora de prompt de video está habilitada (default: sí). */
export function isVideoPromptImproverEnabled(): boolean {
  return isEnabled(process.env.OLLAMA_VIDEO_PROMPT_ENABLED);
}

/** Si la mejora de prompt de texto está habilitada (default: sí). */
export function isTextPromptImproverEnabled(): boolean {
  return isEnabled(process.env.OLLAMA_TEXT_PROMPT_ENABLED);
}

/** Si la mejora de prompt de PDF está habilitada (default: sí). */
export function isPdfPromptImproverEnabled(): boolean {
  return isEnabled(process.env.OLLAMA_PDF_PROMPT_ENABLED);
}

type ImproverMode = "rewrite" | "completion";

/** Los modelos "completion" se detectan por nombre (legacy, ya no aplica). */
const COMPLETION_MODELS = /goonsai/i;

/**
 * Resuelve el modelo cloud para el mejorador desde las preferencias por tarea.
 * El pref guarda "provider/model"; si no hay preferencia se usa el default.
 */
function improverModelFromPrefs(
  prefs: ModelPrefs | null | undefined,
  task: "prompt_image" | "prompt_video" | "prompt_text" | "prompt_pdf",
  fallback: string,
): string {
  const pref = prefs?.[task];
  if (pref && pref !== "auto") {
    const idx = pref.indexOf("/");
    const name = (idx >= 0 ? pref.slice(idx + 1) : pref).trim();
    if (name) return name;
  }
  return fallback;
}

/**
 * Resuelve el modo de mejora. Sin modelos goonsai el modo es "rewrite".
 */
function improverMode(model: string): ImproverMode {
  return COMPLETION_MODELS.test(model) ? "completion" : "rewrite";
}

/**
 * Términos bloqueados por la guarda de contenido: personas/rostros y NSFW.
 * Mismo criterio que las reglas duras del estudio (video: no people/faces;
 * imágenes financieras sin personas). Las restricciones de texto/logos/números
 * se agregan DESPUÉS por el llamador.
 */
const BLOCKED_RE =
  /\b(people|person|woman|women|man|men|girl|boy|child|children|human|figure|portrait|selfie|face|faces|body|bodies|skin|hair|hands|legs|eyes|nude|naked|nsfw|sex|sexual|porn|erotic|bikini|swimsuit|underwear|lingerie|cleavage|breast|breasts|nipple|butt|buttocks|explicit|masturbat|intercourse)\b/i;

function isBlocked(text: string): boolean {
  return BLOCKED_RE.test(text);
}

/**
 * Combina la respuesta del modelo según el modo y aplica la guarda de
 * contenido + tope de longitud. Devuelve `null` si la mejora queda bloqueada.
 */
function finalizeImprovement(prompt: string, raw: string, mode: ImproverMode): string | null {
  // completion: el modelo autocompleta la idea; combinamos original + resto.
  const improved = mode === "completion" && raw ? `${prompt.trim()}. ${raw}`.trim() : raw;
  if (!improved || isBlocked(improved)) return null;
  return improved.length > MAX_IMPROVED_CHARS ? improved.slice(0, MAX_IMPROVED_CHARS) : improved;
}

/**
 * Llama a un modelo cloud de NVIDIA en modo "rewrite" con una consigna
 * neutral. Devuelve la mejora ya procesada (modo completion + guarda + tope),
 * o `null` si falla o queda bloqueada. Ollama ya no se usa.
 */
async function callImprover(
  prompt: string,
  instruction: string,
  mode: ImproverMode,
): Promise<string | null> {
  try {
    const { PROMPT_IMPROVER_CHAIN } = await import("./model-catalog");
    const { resilientChat } = await import("./providers.server");
    const result = await resilientChat(
      PROMPT_IMPROVER_CHAIN,
      [
        {
          role: "system",
          content: `SOS UN MEJORADOR DE PROMPTS. Reescribís la consigna del usuario con más detalle para un generador (imagen/video/texto/PDF). No inventes contenido: solo enriquecés la descripción.`,
        },
        { role: "user", content: `${instruction}\n${prompt}` },
      ],
      { maxTokens: 900, temperature: 0.6 },
    );
    if (result.provider === "fallback") return null;
    const improved = finalizeImprovement(prompt, result.value.trim(), mode);
    if (improved === null) {
      console.warn(
        "[improve-prompt] mejora bloqueada por la guarda de contenido: uso el prompt original",
      );
    }
    return improved;
  } catch (error) {
    console.error("[improve-prompt] falló, uso el prompt original", error);
    return null;
  }
}

/**
 * Mejora un prompt descriptivo de imagen con un modelo cloud.
 * Devuelve siempre un string válido: el prompt mejorado si pasa la guarda de
 * contenido, o el original si algo falla. `prefs.prompt_image` elige el modelo.
 */
export async function improvePrompt(prompt: string, prefs?: ModelPrefs | null): Promise<string> {
  const clean = prompt?.trim();
  if (!clean || !isPromptImproverEnabled()) return prompt;

  const model = improverModelFromPrefs(prefs, "prompt_image", "deepseek-ai/deepseek-v4-flash");
  const improved = await callImprover(
    clean,
    "Reescribí el siguiente prompt de generación de imagen con más detalle: ",
    improverMode(model),
  );
  return improved && improved.length > clean.length ? improved : prompt;
}

/**
 * Mejora un prompt de video con un modelo cloud.
 * Útil como reintento cuando el motor de video falla: da un prompt alternativo
 * para el siguiente intento. `prefs.prompt_video` elige el modelo. Devuelve el
 * prompt original si nada responde o la mejora queda bloqueada.
 */
export async function improveVideoPrompt(
  prompt: string,
  prefs?: ModelPrefs | null,
): Promise<string> {
  const clean = prompt?.trim();
  if (!clean || !isVideoPromptImproverEnabled()) return prompt;

  const model = improverModelFromPrefs(prefs, "prompt_video", "deepseek-ai/deepseek-v4-flash");
  const improved = await callImprover(
    clean,
    "Reescribí el siguiente prompt de generación de video financiero con más detalle: ",
    improverMode(model),
  );
  return improved && improved.length > clean.length ? improved : prompt;
}

/**
 * Mejora genérica de prompts: texto→texto y texto→PDF.
 * `task` elige el modelo (prompt_text / prompt_pdf) y su flag de habilitación.
 * Devuelve el prompt original si nada responde o la mejora queda bloqueada.
 */
async function improvePromptFor(
  prompt: string,
  task: "prompt_text" | "prompt_pdf",
  prefs: ModelPrefs | null | undefined,
  instruction: string,
): Promise<string> {
  const clean = prompt?.trim();
  const enabledVar = task === "prompt_text" ? "OLLAMA_TEXT_PROMPT_ENABLED" : "OLLAMA_PDF_PROMPT_ENABLED";
  if (!clean || !isEnabled(process.env[enabledVar])) return prompt;

  const model = improverModelFromPrefs(prefs, task, "deepseek-ai/deepseek-v4-flash");
  const improved = await callImprover(clean, instruction, improverMode(model));
  return improved && improved.length > clean.length ? improved : prompt;
}

/** Mejora un prompt de generación de texto (copy, informes, guiones). */
export async function improveTextPrompt(
  prompt: string,
  prefs?: ModelPrefs | null,
): Promise<string> {
  return improvePromptFor(
    prompt,
    "prompt_text",
    prefs,
    "Mejorá el siguiente prompt de generación de texto con más detalle, estructura y estilo: ",
  );
}

/** Mejora un prompt de generación de documentos/PDF (informes, research). */
export async function improvePdfPrompt(
  prompt: string,
  prefs?: ModelPrefs | null,
): Promise<string> {
  return improvePromptFor(
    prompt,
    "prompt_pdf",
    prefs,
    "Mejorá el siguiente prompt de generación de documento/PDF con estructura, secciones y detalle profesional: ",
  );
}

/** Despacha el mejorador según el tipo de generador (obligatorio antes de generar). */
export async function improvePromptForGenerator(
  prompt: string,
  generator: "image" | "video" | "text" | "pdf",
  prefs?: ModelPrefs | null,
): Promise<string> {
  switch (generator) {
    case "image":
      return improvePrompt(prompt, prefs);
    case "video":
      return improveVideoPrompt(prompt, prefs);
    case "text":
      return improveTextPrompt(prompt, prefs);
    case "pdf":
      return improvePdfPrompt(prompt, prefs);
    default:
      return prompt;
  }
}
