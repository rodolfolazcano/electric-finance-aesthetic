// @ts-nocheck
// Orquestación del estudio. Server-only.
import "./env.server";
import { IMAGE_CHAIN_HQ, NARRATIVE_CHAIN, resolveChain, type ModelPrefs } from "./model-catalog";
import {
  resilientChat,
  resilientImage,
  resilientJson,
  resilientVision,
  type CallAttempt,
  type ChatMessage,
} from "./providers.server";
import { BASE_SYSTEM_PROMPT, SLIDE_JSON_INSTRUCTIONS, buildSystemPrompt } from "./prompts.server";
import { searchLibrary } from "./context-library.server";
import {
  chainFor,
  classifyComplexity,
  crossVerify,
  verificationNote,
  type Complexity,
  type CrossVerification,
} from "./orchestration.server";
import {
  TEMPLATES,
  buildTemplateBlock,
  classifySlideContentType,
  logoSlotFor,
  pickTemplate,
  type SlideTemplate,
} from "./templates";
import { verifySlide } from "@/lib/validation/math-check";
import { improvePrompt } from "./improve-prompt.server";
import { SITE } from "@/lib/seo/site";
import {
  buildImagePrompt,
  buildPptx,
  designDirection,
  designDirectionBlock,
  pickDesignForTemplate,
} from "./multimodal.server";
import type {
  DesignDirection,
  Intent,
  MathCheck,
  SlideSpec,
  ToolCallTrace,
  TurnAttachment,
} from "@/lib/types";
import { z } from "zod";

export type ContextFile = {
  name: string;
  kind: string;
  text: string;
  /** "reference" = plantillas/estilos a replicar. "data" = datos para razonar. */
  segment?: "reference" | "data";
};

export type TurnInput = {
  conversationId?: string | null;
  message: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  files: ContextFile[];
  selectedElementId?: string | null;
  currentSlide?: SlideSpec | null;
  highQualityImage?: boolean;
  /** Habilita la habilidad de búsqueda web del agente para este turno. */
  useWeb?: boolean;
  /** Modelo primario elegido por el usuario para cada tarea. */
  modelPrefs?: ModelPrefs | null;
  /** Contexto de la UI: tab activo, panel visible, datos mostrados, errores detectados */
  uiContext?: string | null;
};


export type TurnOutput = {
  text: string;
  intent: Intent;
  provider: string;
  model: string;
  slide?: SlideSpec | null;
  checks?: MathCheck[];
  /** Nivel de complejidad detectado; define qué cadena de modelos se usó. */
  complexity?: Complexity;
  /** Historia de verificación cruzada, si aplicó. */
  verification?: CrossVerification;
  handoffSummary?: string | null;
  attempts: CallAttempt[];
  /** Traza de tool_calls ejecutados por el agente. */
  agentTrace?: ToolCallTrace[];
  /** Dirección visual elegida por `design_direction` (paso previo a imagen). */
  design?: DesignDirection | null;
  /** Adjunto exportado (pptx/png/pdf/video/audio). */
  attachment?: TurnAttachment | null;
};

const MAX_CHARS_PER_FILE = 14_000;

/** Schema zod estricto del resultado de una pieza. Se usa para validar y
 * reintentar con feedback automático antes de aceptar la respuesta. */
const slideResultSchema = z.object({
  narrative: z.string().optional(),
  verification: z.object({ ok: z.boolean().optional(), notes: z.string().optional() }).optional(),
  slide: z
    .object({
      title: z.string(),
      format: z.enum(["square", "story", "banner", "report"]),
      palette: z.enum(["green", "red", "neutral"]).optional(),
      background: z.object({
        prompt: z.string().optional(),
        imageUrl: z.string().optional(),
        overlay: z.number(),
      }),
      elements: z.array(
        z.object({
          id: z.string(),
          type: z.enum(["label", "title", "text", "metric", "chart"]),
          text: z.string().optional(),
          label: z.string().optional(),
          value: z.string().optional(),
          chartType: z.enum(["ladder", "line", "bar"]).optional(),
          series: z.array(z.object({ label: z.string(), value: z.number() })).optional(),
          unit: z.string().optional(),
          x: z.number(),
          y: z.number(),
          w: z.number(),
          h: z.number().optional(),
          size: z.number().optional(),
          align: z.enum(["left", "center", "right"]).optional(),
          tone: z.enum(["positive", "negative", "neutral"]).optional(),
        }),
      ),
    })
    .nullish(),
});

/** Chunking simple: cabeza + cola cuando el documento es largo. */
function trimForContext(text: string): string {
  if (text.length <= MAX_CHARS_PER_FILE) return text;
  const head = text.slice(0, MAX_CHARS_PER_FILE * 0.7);
  const tail = text.slice(-MAX_CHARS_PER_FILE * 0.3);
  return `${head}\n\n[... sección intermedia omitida por longitud ...]\n\n${tail}`;
}

export function buildContextBlock(files: ContextFile[]): string {
  if (!files.length) return "No hay material en contexto activo.";
  const render = (list: ContextFile[]) =>
    list
      .map((file) => {
        const tag = file.kind === "image" ? "?? IMAGEN (transcripción generada por IA)" : file.kind;
        const content = file.kind === "image" && !file.text?.trim()
          ? "(imagen aún no procesada)" : trimForContext(file.text) || "(sin contenido)";
        return `### [${file.name}] (${tag})\n${content}`;
      })
      .join("\n\n");

  const reference = files.filter((f) => f.segment === "reference");
  const data = files.filter((f) => f.segment !== "reference");

  const parts: string[] = [];
  if (reference.length) {
    parts.push(
      `## MATERIAL DE REFERENCIA (formatos, plantillas, estilos e imágenes a replicar; NO son datos para calcular):\n${render(reference)}`,
    );
  }
  if (data.length) {
    parts.push(
      `## DATOS E INFORMACIÓN PARA RAZONAR (única fuente de números y hechos):\n${render(data)}`,
    );
  }
  return parts.join("\n\n");
}


const SLIDE_RE =
  /\b(slide|placa|pieza|instagram|whatsapp|historia|story|banner|posteo|post|dise(ñ|n)o|fondo( de imagen| foto)?|imagen(es)? de fondo|foto(s)? de fondo|portada|identidad|marca personal|perfil profesional|minimal(ista)?|dark minimal)\b/i;
const REPORT_RE = /\b(informe|reporte|research|documento|paper|resumen ejecutivo)\b/i;
const MARKETING_RE = /\b(marketing|linkedin|campa|copy|publicaci|difusi|canal)\b/i;
const CROSS_RE = /\b(cruz|comparar|compará|combinar|entre archivos|vs\.?)\b/i;
const EDIT_RE =
  /\b(edit(?:a|ar|á|e)?|cambi(?:a|á|ar)?|modific(?:a|á|ar)?|más grande|mas grande|más chico|mas chico|reemplaz(?:a|á|ar)?|correg(?:í|i|í)?|ajust(?:a|á|ar)?)\b/i;

/** Router de intención liviano: heurística primero, sin gastar el modelo caro. */
export function classifyIntent(
  message: string,
  hasSelection: boolean,
  hasCurrentSlide: boolean,
): Intent {
  if (hasSelection && EDIT_RE.test(message)) return "edit";
  // "edita/rediseñá el slide actual" = edición aunque no haya elemento seleccionado.
  if (hasCurrentSlide && /\b(edit|cambi|rediseñ|modific)/i.test(message)) return "edit";
  if (SLIDE_RE.test(message)) return "slide";
  if (REPORT_RE.test(message)) return "report";
  if (MARKETING_RE.test(message)) return "marketing";
  if (CROSS_RE.test(message)) return "crossdata";
  return "question";
}

export async function logCalls(
  conversationId: string | null | undefined,
  task: string,
  attempts: CallAttempt[],
) {
  if (!attempts.length) return;
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    await supabaseAdmin.from("model_calls_log").insert(
      attempts.map((attempt) => ({
        conversation_id: conversationId ?? null,
        task,
        provider: attempt.provider,
        model: attempt.model,
        ok: attempt.ok,
        latency_ms: attempt.latencyMs,
        error: attempt.error ?? null,
      })),
    );
  } catch (error) {
    console.error("[studio] no se pudo registrar el log de modelos", error);
  }
}

async function recentLearning(): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data } = await supabaseAdmin
      .from("learning_notes")
      .select("prompt, answer")
      .order("created_at", { ascending: false })
      .limit(6);
    if (!data?.length) return "";
    return data
      .map(
        (note: { prompt: string | null; answer: string }) =>
          `- Pedido: ${(note.prompt ?? "").slice(0, 300)}\n  Respuesta aprobada: ${note.answer.slice(0, 900)}`,
      )
      .join("\n\n");
  } catch {
    return "";
  }
}

async function baseMessages(input: TurnInput, extra: string): Promise<ChatMessage[]> {
  const [system, library, learning] = await Promise.all([
    buildSystemPrompt(input.conversationId, extra),
    searchLibrary(input.message).catch(() => []),
    recentLearning(),
  ]);

  const messages: ChatMessage[] = [
    { role: "system", content: system },
    {
      role: "system",
      content: `CONTEXTO CARGADO POR EL USUARIO:\n${buildContextBlock(input.files)}`,
    },
  ];
  if (learning) {
    messages.push({
      role: "system",
      content: `MEMORIA DE APRENDIZAJE (respuestas que el usuario aprobó antes; imitá su criterio, tono y formato):\n${learning}`,
    });
  }
  if (input.useWeb) {
    try {
      const { searchWeb, buildWebBlock } = await import("./web.server");
      const results = await searchWeb(input.message, 6);
      if (results.length) {
        messages.push({
          role: "system",
          content: `RESULTADOS DE BÚSQUEDA WEB (citá la fuente con su dominio y URL cuando los uses; si contradicen los datos del usuario, avisalo):\n${buildWebBlock(results)}`,
        });
      }
    } catch (error) {
      console.error("[studio] búsqueda web falló", error);
    }
  }
  if (library.length) {
    messages.push({
      role: "system",
      content: `BIBLIOTECA DE REFERENCIA (material propio; citá el título cuando lo uses):\n${library
        .map((doc) => `### ${doc.title}\n${doc.text}`)
        .join("\n\n")}`,
    });
  }

  for (const turn of input.history.slice(-6)) {
    messages.push({ role: turn.role, content: turn.content });
  }
  messages.push({ role: "user", content: input.message });
  return messages;
}

/**
 * Post-proceso determinístico del slide generado por el modelo (sin IA):
 *   - asigna el templateId de la plantilla elegida
 *   - aplica el slot del logo de la plantilla (posición % y URL del sitio)
 *   - si la plantilla reutiliza fondos cacheados y no hay fondo, no fuerza prompt
 */
async function enrichSlide(
  slide: SlideSpec,
  templateId: number,
  reuseBackground: boolean,
): Promise<SlideSpec> {
  const template = TEMPLATES.find((t) => t.id === templateId);
  const enriched: SlideSpec = {
    ...slide,
    templateId,
    background: { ...slide.background },
    logo: slide.logo ?? null,
  };
  if (template) {
    const slot = logoSlotFor(template);
    enriched.logo = { url: SITE.logo, x: slot.x, y: slot.y, w: slot.w, maxSize: slot.maxSize };
  }
  return enriched;
}


export async function runStudioTurn(input: TurnInput): Promise<TurnOutput> {
  const intent = classifyIntent(
    input.message,
    Boolean(input.selectedElementId),
    Boolean(input.currentSlide),
  );
  // "edita el slide actual" sin slide previo = generar pieza nueva siguiendo la
  // instrucción, no responder como consulta.
  const effectiveIntent: Intent = intent === "edit" && !input.currentSlide ? "slide" : intent;
  const wantsPiece =
    effectiveIntent === "slide" || effectiveIntent === "report" || effectiveIntent === "marketing";
  const isEdit = effectiveIntent === "edit" && input.currentSlide;

  if (isEdit) {
    const result = await resilientJson<{ narrative?: string; slide?: SlideSpec }>(
      resolveChain("json", input.modelPrefs),
      [
        {
          role: "system",
          content: `${BASE_SYSTEM_PROMPT}\n\nEstás editando UN elemento de una pieza existente. Devolvés JSON: {"narrative":"qué cambiaste","slide": <spec completo con el cambio aplicado>}. No inventes datos nuevos: solo modificá el elemento indicado. Mantené intactos el resto de los elementos.\n\n${SLIDE_JSON_INSTRUCTIONS}`,
        },
        {
          role: "user",
          content: `SPEC ACTUAL:\n${JSON.stringify(input.currentSlide)}\n\nELEMENTO SELECCIONADO: ${input.selectedElementId}\n\nINSTRUCCIÓN: ${input.message}`,
        },
      ],
      { maxTokens: 3000 },
    );
    await logCalls(input.conversationId, "edit", result.attempts);
    const slide = result.value.slide ?? input.currentSlide ?? null;
    return {
      text: result.value.narrative ?? "Elemento actualizado.",
      intent,
      provider: result.provider,
      model: result.model,
      slide,
      checks: slide ? verifySlide(slide) : undefined,
      attempts: result.attempts,
    };
  }

  if (wantsPiece) {
    const formatHint =
      effectiveIntent === "report"
        ? 'Formato "report": resumen ejecutivo, cuerpo, tablas/series, conclusión.'
        : effectiveIntent === "marketing"
          ? 'Formato según plataforma: "square" para Instagram/WhatsApp, "story" para historias, "banner" para LinkedIn. Texto corto y con gancho, sin promesas de rendimiento.'
          : 'Formato "square" (1:1) salvo que el usuario pida otro.';

    // Etapa 1  Plantilla: tipo de contenido detectado por heurística + plantilla.
    const contentType = classifySlideContentType(input.message, input.files.length);
    const template = pickTemplate(contentType, input.message);
    // Etapa 2  design_direction: PASO OBLIGATORIO antes de generar imágenes.
    // El modelo propone 2-3 direcciones (paleta/tipografía/mood) y se auto-elige
    // la que matchea la plantilla de la familia correspondiente.
    const wantsPresentation = /\b(presentaci(ó|o)n|ppt|powerpoint|diapositivas|decks)\b/i.test(
      input.message,
    );
    let design: DesignDirection | null = null;
    let designAttempts: CallAttempt[] = [];
    try {
      const designResult = await designDirection(
        `Tipo de pieza: ${contentType}. Plantilla: ${template.name} (familia ${template.family}, paleta ${template.palette}).\nPedido: ${input.message}`,
        "",
        input.modelPrefs,
      );
      designAttempts = designResult.attempts;
      design = pickDesignForTemplate(designResult.options, template.palette);
    } catch (error) {
      console.error("[studio] design_direction falló", error);
    }

    // Etapa 3  reasoning + generación del spec (con la dirección visual elegida).
    const result = await resilientJson<{
      narrative?: string;
      verification?: { ok?: boolean; notes?: string };
      slide?: SlideSpec | null;
    }>(
      resolveChain("reasoning", input.modelPrefs),
      await baseMessages(
        input,
        `${formatHint}\n\n${templateBlock}\n\n${
          design ? designDirectionBlock(design) : ""
        }\n\nAntes de emitir el JSON, recalculá todos los números y verificá que la suma de las series coincida con los totales que declares. El fondo (background.prompt) debe respetar la dirección visual elegida.\n\n${SLIDE_JSON_INSTRUCTIONS}`,
      ),
      { maxTokens: 4000, schema: slideResultSchema },
    );
    await logCalls(input.conversationId, effectiveIntent, [...designAttempts, ...result.attempts]);

    const slide = result.value.slide ?? null;
    const checks = slide ? verifySlide(slide) : [];
    const failed = checks.filter((c) => !c.ok);

    if (!slide) {
      return {
        text:
          result.value.narrative ??
          result.value.verification?.notes ??
          "No pude verificar los números necesarios para armar la pieza. Pasame los datos faltantes.",
        intent: effectiveIntent,
        provider: result.provider,
        model: result.model,
        slide: null,
        checks,
        attempts: result.attempts,
      };
    }

    if (failed.length) {
      return {
        text: `Freno la generación: la verificación matemática no cierra.\n\n${failed
          .map((c) => ` ${c.label}: ${c.detail}`)
          .join(
            "\n",
          )}\n\nRevisá los datos de origen o confirmame el número correcto y la regenero.`,
        intent: effectiveIntent,
        provider: result.provider,
        model: result.model,
        slide: null,
        checks,
        attempts: result.attempts,
      };
    }

    // Etapa 4  Post-proceso determinístico: plantilla + logo + fondo (no IA).
    const enriched = await enrichSlide(slide, template.id, template.reuseBackground);
    if (design && enriched.background.prompt) {
      enriched.background.prompt = buildImagePrompt(enriched.background.prompt, design);
    }

    // Etapa 6  build_pptx si el usuario pidió "presentación" en vez de placa 1:1.
    let attachment: TurnAttachment | null = null;
    if (wantsPresentation) {
      try {
        const pptx = await buildPptx([enriched]);
        attachment = {
          kind: "pptx",
          filePath: pptx.filePath,
          url: pptx.url,
          label: "Presentación .pptx",
        };
      } catch (error) {
        console.error("[studio] build_pptx falló", error);
      }
    }

    return {
      text: `${result.value.narrative ?? "Pieza generada y verificada."}${
        attachment ? `\n\n?? ${attachment.label}: ${attachment.url}` : ""
      }`,
      intent: effectiveIntent,
      provider: result.provider,
      model: result.model,
      slide: enriched,
      checks,
      design,
      attachment,
      attempts: result.attempts,
    };
  }

  // --- Consulta / cruce de datos: ruteo por complejidad + doble chequeo ----
  const contextChars = input.files.reduce((acc, f) => acc + f.text.length, 0);
  const complexity = classifyComplexity({
    message: input.message,
    contextChars,
    fileCount: input.files.length,
    historyLength: input.history.length,
  });

  const baseChain =
    effectiveIntent === "crossdata"
      ? resolveChain("reasoning", input.modelPrefs)
      : resolveChain("narrative", input.modelPrefs);
  const chain = chainFor(baseChain, complexity);
  const messages = await baseMessages(
    input,
    effectiveIntent === "crossdata"
      ? "El usuario pide cruzar datos entre archivos. Dejá explícito de qué archivo sale cada cifra."
      : "Respondé la consulta con el contexto disponible.",
  );

  let text: string;
  let attempts: any[] = [];
  let verification: CrossVerification | undefined;
  let provider = "fallback";
  let model = "fallback";
  const handoffSummaries: string[] = [];

  try {
    const result = await resilientChat(chain, messages, {
      maxTokens: complexity === "complex" ? 3200 : 1800,
      temperature: complexity === "complex" ? 0.25 : 0.35,
      handoff: {
        task: input.message.slice(0, 160),
        onSummary: (summary) => handoffSummaries.push(summary),
      },
    });
    attempts = [...result.attempts];
    text = result.value;
    provider = result.provider;
    model = result.model;

    // Doble chequeo solo cuando la consulta lo amerita
    if (complexity === "complex" || effectiveIntent === "crossdata") {
      const system = messages.find((m) => m.role === "system")?.content ?? BASE_SYSTEM_PROMPT;
      const cross = await crossVerify({
        conversationId: input.conversationId,
        task: effectiveIntent,
        system,
        question: input.message,
        draft: text,
        authorModel: result.model,
        context: buildContextBlock(input.files).slice(0, 24_000),
      });
      attempts.push(...cross.attempts);
      verification = cross.result;
      text = `${cross.result.answer}${verificationNote(cross.result)}`;
    }
  } catch (e: any) {
    // Fallback cuando las API keys no funcionan
    const msg = input.message.toLowerCase();
    if (input.files?.length) {
      text =
        `Tengo ${input.files.length} archivo(s) en contexto. ` +
        (msg.includes("slide") || msg.includes("placa") || msg.includes("informe")
          ? "Para generar un slide necesito que las API keys de IA esten configuradas. Agregalas en el .env y reinicia el servidor."
          : "Puedo ayudarte con informacion sobre los archivos cargados. ¿Que necesitas saber?");
    } else if (msg.includes("hola") || msg.length < 5) {
      text =
        "Hola! Carga archivos en el explorador de contexto (Referencias o Datos) y pedime un analisis, un slide o un informe.";
    } else {
      text = `[Modelos no disponibles: ${e.message ?? "API keys no configuradas"}]. Agrega NVIDIA_API_KEY en el .env.`;
    }
  }

  await logCalls(input.conversationId, effectiveIntent, attempts);
  return {
    text,
    intent,
    complexity,
    provider,
    model,
    verification,
    handoffSummary: handoffSummaries.at(-1) ?? null,
    attempts,
  };
}


export async function generateBackground(
  conversationId: string | null | undefined,
  prompt: string,
  highQuality: boolean,
): Promise<{ url: string; provider: string; model: string }> {
  const enriched = `${prompt}. Real financial photography, dark moody lighting, deep charcoal blue tones, subtle depth of field, cinematic, professional research desk aesthetic, no text, no logos, no watermark.`;
  const result = await resilientImage(highQuality ? IMAGE_CHAIN_HQ : IMAGE_CHAIN, enriched);
  await logCalls(conversationId, "image", result.attempts);

  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  const bytes = Uint8Array.from(atob(result.value.base64), (c) => c.charCodeAt(0));
  const path = `backgrounds/${crypto.randomUUID()}.png`;
  const { error } = await supabaseAdmin.storage
    .from("studio-files")
    .upload(path, bytes, { contentType: result.value.mime, upsert: true });
  if (error) throw new Error(`No se pudo guardar el fondo: ${error.message}`);

  const { data } = await supabaseAdmin.storage
    .from("studio-files")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (!data?.signedUrl) throw new Error("No se pudo firmar la URL del fondo");

  return { url: data.signedUrl, provider: result.provider, model: result.model };
}

export async function describeImage(
  conversationId: string | null | undefined,
  base64: string,
  mime: string,
): Promise<{ text: string; provider: string; model: string }> {
  const result = await resilientVision(
    VISION_CHAIN,
    base64,
    mime,
    "Transcribí con precisión todo el texto, tablas y series numéricas visibles en esta imagen financiera. Devolvé las tablas en formato markdown y no inventes ningún número que no esté claramente legible.",
  );
  await logCalls(conversationId, "vision", result.attempts);
  return { text: result.value, provider: result.provider, model: result.model };
}

export async function fetchMarketNews(query: string): Promise<
  Array<{ title: string; url: string; source: string; snippet?: string }>
> {
  const out: Array<{ title: string; url: string; source: string; snippet?: string }> = [];
  const tavilyKey = (typeof process !== "undefined" ? (process as any).env?.TAVILY_API_KEY : undefined) ?? (import.meta as any).env?.TAVILY_API_KEY;

  if (tavilyKey) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: `${query} mercado argentino finanzas`,
          max_results: 6,
          search_depth: "basic",
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          results?: Array<{ title: string; url: string; content?: string }>;
        };
        for (const item of data.results ?? []) {
          out.push({
            title: item.title,
            url: item.url,
            source: new URL(item.url).hostname.replace("www.", ""),
            snippet: item.content?.slice(0, 220),
          });
        }
      }
    } catch (error) {
      console.error("[studio] tavily falló", error);
    }
  }

  if (out.length < 4) {
    try {
      const rss = await fetch(
        `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=es-419&gl=AR&ceid=AR:es-419`,
      );
      if (rss.ok) {
        const xml = await rss.text();
        const items = xml.split("<item>").slice(1, 8);
        for (const item of items) {
          const title = item.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/s)?.[1];
          const link = item.match(/<link>(.*?)<\/link>/s)?.[1];
          const source = item.match(/<source[^>]*>(.*?)<\/source>/s)?.[1];
          if (title && link) out.push({ title, url: link, source: source ?? "Google News" });
        }
      }
    } catch (error) {
      console.error("[studio] rss falló", error);
    }
  }

  return out.slice(0, 8);
}

// -----------------------------------------------------------------------------
// AGENTE AUTÓNOMO CON TOOL-CALLING
// -----------------------------------------------------------------------------

import { buildToolsSchema, executeToolCall } from "./agent-tools.server";
import { resilientAgentTurn } from "./providers.server";
import { heuristicClassify } from "./classifier.server";
import { getSessionContext } from "./session-context.server";
import { MODEL_TIERS } from "./model-catalog";
import { shouldSkipClassifier, updateConversationState, getConversationState } from "./session-state.server";

// --- Prompts por nivel (completos del markdown de orquestación multi-modelo) ---

const PROMPTS_POR_NIVEL: Record<string, string> = {
  fast: `AHORA SOS EL ASISTENTE RAPIDO del estudio Coronar Inversiones.
Tono: profesional, directo, espaniol rioplatense, respuestas breves.

Tu funcion: responder preguntas simples, hacer exploracion inicial liviana de
archivos/contexto, o derivar mentalmente si la tarea necesita mas profundidad.

REGLAS DURAS (no negociables en ningun nivel):
1. NUNCA alucines cifras. Si no tenes el dato, decilo y buscalo con la herramienta correspondiente.
2. NUNCA mezcles datos de archivos/fuentes distintas sin citar [fuente].
3. Cifras en formato argentino (punto de miles, coma decimal).
4. Si la consulta implica analisis financiero, cruce de datos, deteccion de incoherencias o recomendacion de inversion -> NO la respondas vos, devolve "REQUIERE_ESCALAMIENTO:" seguido de un resumen de lo que ya exploraste para que el nivel quant_senior no tenga que re-hacerlo.
5. TERMINACION: produci una respuesta final ni bien tengas datos suficientes. NO sigas llamando herramientas si ya podes responder. Cada tool call adicional innecesaria es un error grave.

HERRAMIENTAS DISPONIBLES: run_command, read_file, browse_filesystem, search_web (liviano), supabase_storage_list.`,

  context_locked: `AHORA SOS EL OPERADOR TECNICO del estudio Coronar Inversiones. Ejecutas comandos,
editas archivos y corres scripts DENTRO del proyecto, con precision y sin
gastar tokens re-explorando lo que ya esta en SESSION_CONTEXT.

REGLAS DURAS: mismas 1-3 del nivel fast.
5. TERMINACION: produci una respuesta final ni bien tengas datos suficientes. NO sigas llamando herramientas.

REGLA DE EFICIENCIA:
- Antes de llamar read_file/browse_filesystem/supabase_storage_text, revisa
  el bloque CONTEXTO YA CARGADO. Si el dato esta ahi, usalo. Si no esta o
  esta desactualizado (dato de mercado > 2 min), recien ahi explora.
- Flujo de script: leer script -> ejecutar -> si error -> corregir -> re-ejecutar,
  MAXIMO 5 iteraciones de correccion antes de escalar el problema al usuario.
- Todo cambio de archivo se guarda con write_file Y se reporta en el chat
  que se cambio, por que, y que archivo/linea.

HERRAMIENTAS: run_command, read_file, write_file, browse_filesystem,
search_web, read_web_page, run_sandbox, supabase_storage_list,
supabase_storage_text, crm_importar, crm_listar.`,

  quant_senior: `IDENTIDAD
Sos el analista cuantitativo senior del estudio Coronar Inversiones:
Asesor financiero certificado CNV (Agente Productor, Matricula 2192, AF IEAF),
matematico, analista cuantitativo senior y market maker.

Tono profesional, directo, sin relleno, espaniol rioplatense.

MARCO METODOLOGICO OBLIGATORIO
Antes de emitir cualquier juicio de mercado, busca en context_library_search
y/o supabase_storage_text la metodologia indexada (Murphy - analisis
intermarket, Amat - analisis fundamental). Fundamenta tu analisis citando
[archivo.pdf, capitulo/seccion] cuando uses un criterio de esos textos.

REGLAS DURAS (heredadas + ampliadas)
1. NUNCA alucines cifras. Toda cifra que uses viene de: (a) SESSION_CONTEXT,
   (b) una tool call en este turno, o (c) un calculo que vos mismo hiciste
   con run_sandbox y mostras el resultado. Nunca de memoria.
2. NUNCA mezcles datos de archivos/fuentes distintas sin citar [fuente].
3. VERIFICACION MATEMATICA OBLIGATORIA: todo calculo se recalcula en
   run_sandbox antes de usarlo en la respuesta, aunque parezca correcto.
4. Distingui siempre dato duro (de fuente verificada) de estimacion/proyeccion
   (etiquetada como tal).
5. No des recomendacion de inversion sin aclarar perfil del inversor
   (conservador/moderado/agresivo) al que aplica.
6. Cifras en formato argentino.
7. TERMINACION: produci una respuesta final ni bien tengas datos suficientes. NO sigas llamando herramientas si ya podes responder. Cada tool call innecesaria es un error.

MODULO DE DETECCION DE INCOHERENCIAS (UI vs motor de calculo):
Cuando el usuario pida revisar datos de la interfaz:
a. Trae el valor UI (de supabase_storage_text/read_file que el usuario indique).
b. Recalcula el mismo valor de forma independiente con run_sandbox, usando
   la formula exacta (TIR, paridad, duration, convexity, beta, R2, etc.
   busca la formula exacta en context_library_search si no estas 100% seguro).
c. Compara: si difieren mas de 0.5%, reporta:
   - que campo/tab de la UI tiene el problema
   - valor UI vs valor recalculado vs diferencia
   - hipotesis de causa raiz
   - propone el fix concreto (diff o write_file)
d. Si encontras contradiccion logica entre fuentes (ej. ratio de liquidez sano
   pero flujo de caja operativo negativo), seniala como incoherencia de
   logica financiera, no solo como diferencia numerica.

CIERRE DE CADA RESPUESTA DE ANALISIS:
- Fuentes usadas (archivos/endpoints/PDFs citados)
- Nivel de confianza del dato (alto/medio/estimado)
- Si aplica: perfil de inversor al que corresponde la lectura

HERRAMIENTAS: TODAS las disponibles (run_command, read_file, write_file,
browse_filesystem, search_web, read_web_page, supabase_storage_list,
supabase_storage_text, run_sandbox, context_library_search,
crm_importar, crm_listar, fetch_stock_data, financial_query).`,

};

const AGENT_MAX_ITERS = 6;

/**
 * Loop agente: llama al modelo con herramientas, ejecuta tool_calls,
 * alimenta resultados de vuelta, hasta que el modelo responde sin tools.
 */
export async function runAgentTurn(input: TurnInput): Promise<TurnOutput> {
  const toolsSchema = buildToolsSchema();
  const trace: ToolCallTrace[] = [];
  const sessionId = input.conversationId ?? "default";
  const sessionCtx = getSessionContext(sessionId);

  // 0. Verificar si podemos saltar el clasificador (mismo topico, sesion activa)
  const { skip, estadoAnterior } = shouldSkipClassifier(sessionId, input.message);
  let nivel: string;
  let requiereExploracion: boolean;

  if (skip && estadoAnterior) {
    nivel = estadoAnterior.nivel;
    requiereExploracion = !estadoAnterior.requiereContexto;
  } else {
    // 1. Clasificar nivel (heurística rápida, sin llamada LLM)
    const clasificacion = heuristicClassify(input.message, !!sessionCtx.getResumen().length);
    nivel = clasificacion.nivel;
    requiereExploracion = clasificacion.requiere_exploracion_nueva;
  }

  // Actualizar estado de sesion para proximos turnos
  updateConversationState(sessionId, input.message, nivel as any);

  // 2. Elegir tools según nivel
  const TOOLS_POR_NIVEL: Record<string, Record<string, any>[]> = {
    fast: toolsSchema.filter((t: any) =>
      ["run_command","read_file","browse_filesystem","search_web","supabase_storage_list","supabase_storage_text","fetch_stock_data","financial_query"].includes(t.function?.name ?? "")
    ),
    context_locked: toolsSchema,
    quant_senior: toolsSchema,
  };
  const nivelTools = TOOLS_POR_NIVEL[nivel] ?? toolsSchema;

  // 3. Armar system prompt
  const systemBase = await buildSystemPrompt(input.conversationId);
  const nivelPrompt = PROMPTS_POR_NIVEL[nivel] ?? PROMPTS_POR_NIVEL.fast;

  // Inyectar SessionContext si no requiere re-exploración
  let contextoBloque = "";
  if (!requiereExploracion) {
    const relevante = sessionCtx.filtrarRelevante(input.message);
    if (relevante) {
      contextoBloque = `\n\nCONTEXTO YA CARGADO EN ESTA SESION (NO RE-EXPLORES, USALO DIRECTO):\n${relevante}\n\nREGLA: si necesitas un dato que NO esta en este bloque, ahi si llama a la herramienta. Si YA esta, usalo tal cual y NO vuelvas a leer el archivo/bucket/web.`;
    }
  }

  // Inyectar contexto de UI si está disponible
  let uiBloque = "";
  if (input.uiContext) {
    uiBloque = `\n\nCONTEXTO DE LA INTERFAZ ACTUAL:\n${input.uiContext}\n\nINSTRUCCIONES PARA RESPONDER:\n- Identificá en qué página está el usuario y qué herramientas tiene disponibles.\n- Si pregunta "cómo uso esto", explicá las herramientas específicas de esa página.\n- Si ves datos visibles (precios, indicadores, tablas), analizalos.\n- Si ves errores o APIs caídas, reportalos.\n- Si el usuario quiere ejecutar una acción (crear cliente, analizar ticker, etc.), guialo paso a paso.\n- Respondé específico a la página actual, no genérico.`;
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${systemBase}

${nivelPrompt}${contextoBloque}${uiBloque}`,
    },
    {
      role: "user",
      content: `CONTEXTO CARGADO POR EL USUARIO:\n${buildContextBlock(input.files)}`,
    },
    ...input.history.slice(-6).map((t) => ({ role: t.role as "user" | "assistant", content: t.content })),
    { role: "user", content: input.message },
  ];

  // Fast path: seguimiento con tools (mismo topico, nivel fast, menos iteraciones)
  if (skip && nivel === "fast") {
    try {
      const directo = await resilientAgentTurn(MODEL_TIERS["fast"] ?? NARRATIVE_CHAIN, messages, {
        maxTokens: 1500, temperature: 0.5, tools: nivelTools,
      });
      const msg = directo.value;
      const toolCalls = msg.tool_calls;
      if (!toolCalls?.length) {
        const respuesta = msg.content ?? "(sin respuesta)";
        return { text: respuesta, intent: "question", provider: directo.provider, model: directo.model, agentTrace: trace, attempts: directo.attempts };
      }
      // Si hay tool_calls, seguimos con el loop normal abajo
      messages.push({ role: "assistant", content: msg.content, tool_calls: toolCalls });
      const toolResults = await Promise.allSettled(toolCalls.map(async (tc) => {
        try {
          const args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
          const result = await executeToolCall(tc.function.name, args);
          return { id: tc.id, content: result.slice(0, 8000) };
        } catch (e: any) {
          return { id: tc.id, content: `[ERROR]: ${e.message ?? String(e)}` };
        }
      }));
      for (const tr of toolResults) {
        if (tr.status === "fulfilled") messages.push({ role: "tool", tool_call_id: tr.value.id, content: tr.value.content });
      }
    } catch (e: any) {
      // Fallback inteligente: responde segun el mensaje del usuario usando patrones
      const msg = input.message.toLowerCase().trim();
      const pagina = input.uiContext?.match(/Pagina: (.+)/)?.[1] ?? "";
      const herramientas = input.uiContext?.match(/Herramientas disponibles[^]*?(?=\n\n|$)/)?.[0] ?? "";

      // Detectar intencion del usuario por palabras clave
      if (msg.includes("hola") || msg.includes("buen") || msg.length <= 3) {
        return { text: `¡Hola! Estas en **${pagina || "Coronar Inversiones"}**. ${herramientas ? "En esta pagina podes: " + herramientas.replace("Herramientas disponibles en esta pagina: ", "").trim() : "Decime que necesitas y te ayudo."}`, intent: "question", provider: "context", model: "page-aware", agentTrace: trace, attempts: [] };
      }
      if (msg.includes("crear") || msg.includes("nuev") || msg.includes("guardar") || msg.includes("registr")) {
        return { text: `Para crear un nuevo elemento en **${pagina || "Coronar Inversiones"}**, completa el formulario que ves en pantalla y hace clic en "Guardar". Si necesitas ayuda con algún campo en particular, decime cual.`, intent: "question", provider: "context", model: "page-aware", agentTrace: trace, attempts: [] };
      }
      if (msg.includes("como") || msg.includes("que es") || msg.includes("ayuda") || msg.includes("funcion")) {
        return { text: `En **${pagina || "Coronar Inversiones"}** podes realizar las siguientes acciones:\n${herramientas ? herramientas.replace("Herramientas disponibles en esta pagina: ", "").trim() : "Navega usando el menu lateral para acceder a las diferentes secciones."}\n\n¿Que accion queres realizar?`, intent: "question", provider: "context", model: "page-aware", agentTrace: trace, attempts: [] };
      }
      if (msg.includes("gestion") || msg.includes("client") || msg.includes("crm")) {
        return { text: `Para gestionar clientes en CRM:\n1. Completa el formulario "Nuevo Cliente" con nombre, apellido, email, etc.\n2. Selecciona el perfil de inversor (Conservador/Moderado/Agresivo)\n3. Ingresa los activos en cartera separados por coma\n4. Hace clic en "Guardar"\n\nLos clientes guardados apareceran en la lista de abajo. Luego podes hacer backtesting de recomendaciones en las otras pestanas.`, intent: "question", provider: "context", model: "page-aware", agentTrace: trace, attempts: [] };
      }
      if (msg.includes("analiz") || msg.includes("recomend") || msg.includes("invers")) {
        return { text: `En la pestana "Backtesting Recomendaciones" podes registrar recomendaciones de compra/venta para cada cliente. En "Vender / Mantener / Comprar" podes evaluar decisiones. ¿Que te gustaria hacer?`, intent: "question", provider: "context", model: "page-aware", agentTrace: trace, attempts: [] };
      }
      // Respuesta generica contextual
      return { text: `Estas en **${pagina || "Coronar Inversiones"}**. ${herramientas ? "Acciones disponibles: " + herramientas.replace("Herramientas disponibles en esta pagina: ", "").trim() : "Usa el menu lateral para navegar."}\n\n¿Que queres hacer?`, intent: "question", provider: "context", model: "page-aware", agentTrace: trace, attempts: [] };
    }
  }

  const startTime = Date.now();
  const MAX_ELAPSED_MS = 30_000;
  let ultimoError = "";
  for (let iter = 0; iter < AGENT_MAX_ITERS; iter++) {
    if (Date.now() - startTime > MAX_ELAPSED_MS) break;
    let resp;
    try {
      resp = await resilientAgentTurn(MODEL_TIERS[nivel] ?? NARRATIVE_CHAIN, messages, {
        maxTokens: nivel === "quant_senior" ? 3000 : 1500,
        temperature: 0.3,
        tools: nivelTools,
      });
    } catch (e: any) {
      ultimoError = e.message ?? "Todos los modelos de la cadena fallaron";
      break;
    }

    // Fallback cloud: si la cadena primaria devolvió "API no disponible",
    // reintentamos con otra cadena cloud (sin Ollama).
    if (resp.provider === "fallback" || resp.provider === "cache") {
      // Ollama deshabilitado: solo NVIDIA/cloud.
      const cloudFallback = await resilientAgentTurn(NARRATIVE_CHAIN, messages, {
        maxTokens: nivel === "quant_senior" ? 3000 : 1500,
        temperature: 0.3,
        tools: nivelTools,
      });
      if (cloudFallback.provider !== "fallback") {
        return {
          text: cloudFallback.value.content ?? "(sin respuesta)",
          intent: "question",
          provider: cloudFallback.provider,
          model: cloudFallback.model,
          agentTrace: trace,
          attempts: resp.attempts,
        };
      }
    }

    const msg = resp.value;
    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      // Escalamiento: fast pide pasar a quant_senior
      const respuesta = msg.content ?? "";
      if (nivel === "fast" && respuesta.includes("REQUIERE_ESCALAMIENTO")) {
        // Re-despachar a quant_senior con el resumen
        const resumenEscalado = respuesta.replace("REQUIERE_ESCALAMIENTO:", "").trim();
        input.history.push({ role: "assistant", content: `[Exploracion inicial - resumen para escalar]: ${resumenEscalado}` });
        return runAgentTurn({ ...input, message: `Continua el analisis. Resumen de exploracion ya hecha:\n${resumenEscalado}\n\nTarea original del usuario: ${input.message}` });
      }
      return {
        text: respuesta,
        intent: "question",
        provider: resp.provider,
        model: resp.model,
        agentTrace: trace,
        attempts: resp.attempts,
      };
    }

    messages.push({ role: "assistant", content: msg.content, tool_calls: toolCalls });

    // Ejecutar tool_calls en PARALELO
    const toolResults = await Promise.allSettled(toolCalls.map(async (tc) => {
      try {
        const args = typeof tc.function.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function.arguments;
        const result = await executeToolCall(tc.function.name, args);
        const traceEntry: ToolCallTrace = { tool: tc.function.name, args: JSON.stringify(args), result: result.slice(0, 3000) };
        trace.push(traceEntry);
        sessionCtx.registrarToolCall(traceEntry);
        return { id: tc.id, content: result.slice(0, 8000) };
      } catch (e: any) {
        trace.push({ tool: tc.function.name, args: "{}", result: `[ERROR]: ${e.message ?? String(e)}` });
        return { id: tc.id, content: `[ERROR]: ${e.message ?? String(e)}` };
      }
    }));
    for (const tr of toolResults) {
      if (tr.status === "fulfilled") {
        messages.push({ role: "tool", tool_call_id: tr.value.id, content: tr.value.content });
      }
    }
  }

  if (ultimoError) {
    return { text: `[${ultimoError}]. Verificá que NVIDIA_API_KEY esté configurada en el .env.`, intent: "question", provider: "fallback", model: "none", agentTrace: trace, attempts: [] };
  }
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  return {
    text: last?.content ?? "[El agente alcanzó el máximo de iteraciones]",
    intent: "question",
    provider: "agent-loop",
    model: `tool-calling/${nivel}`,
    agentTrace: trace,
    attempts: [],
  };
}
