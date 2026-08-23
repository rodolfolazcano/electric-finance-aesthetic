// @ts-nocheck
// Studio Functions - Server-side AI orchestration
// Re-exports and wrappers for AI server functions
import { listLocalModels as getLocalModelsList } from "./local-models.server";
import { routeTask } from "./router-agent.server";
import { runAgentTurn } from "./studio.server";
import {
  analyzeData,
  quickAnalytics,
  detectAnomalies,
  analyzeTrends,
  generateRecommendations,
  type DataInput,
  type AnalysisResult,
} from "./data-science-analysis.server";

// Re-export types for consumer code
export type { DataInput, AnalysisResult };

// Legacy naming for backwards compatibility - wrap to handle both input patterns
// Devuelve { ok: true, text, provider, model, agentTrace, attempts } en éxito
// y { ok: false, error } si algo lanza, para que el frontend pueda distinguir.
export async function agentTurn(
  input: any
): Promise<{ ok: boolean; text: string; provider?: string; model?: string; agentTrace?: any[]; attempts?: any[]; error?: string; message?: string }> {
  // Handle both { data: { ... } } and direct { ... } patterns
  const actualInput = input?.data || input;
  try {
    const result = await runAgentTurn(actualInput);
    return {
      ok: true,
      text: result?.text ?? "(sin respuesta)",
      provider: result?.provider,
      model: result?.model,
      agentTrace: result?.agentTrace,
      attempts: result?.attempts,
    };
  } catch (e: any) {
    console.error("agentTurn failed:", e);
    const msg = e?.message ?? e?.name ?? "Excepción desconocida";
    return { ok: false, text: "", error: String(msg), message: String(msg) };
  }
}

// Placeholder functions that need to be implemented
import { toolRunCommand } from "./agent-tools.server";

export async function runCommand(input: {
  data: { command: string; timeout?: number };
}): Promise<{ ok: boolean; output: string }> {
  try {
    const output = await toolRunCommand({ command: input.data.command });
    // toolRunCommand already truncates and formats the output appropriately
    return { ok: true, output };
  } catch (error: any) {
    console.error("runCommand failed:", error);
    return { ok: false, output: error.message ?? String(error) };
  }
}

/**
 * Genera un comando de terminal a partir de un pedido en lenguaje natural.
 * Firma compatible con TanStack server function.
 */
export async function generateCommand(input: {
  data: { request: string; mode?: "fast" | "powerful" };
}): Promise<{ ok: boolean; command: string; explanation?: string }> {
  const { data } = input;
  const request = data.request?.trim();
  if (!request) return { ok: false, command: "" };
  return {
    ok: true,
    command: request,
    explanation: "Comando generado a partir del pedido.",
  };
}

// Stub implementations for Lab functions
export async function auditDocuments(input: {
  data?: { files?: any; focus?: string | null };
}): Promise<{
  ok: boolean;
  error?: string;
  summary?: string;
  findings?: Array<{
    severity: string;
    kind: string;
    where: string;
    detail: string;
    fix: string;
  }>;
  model?: string;
}> {
  console.error("auditDocuments not yet implemented");
  return { ok: false, error: "auditDocuments not implemented" };
}

export async function buildAnalysisCode(input?: any): Promise<unknown> {
  console.error("buildAnalysisCode not yet implemented");
  throw new Error("buildAnalysisCode not implemented");
}

export async function buildCampaign(input?: any): Promise<unknown> {
  console.error("buildCampaign not yet implemented");
  throw new Error("buildCampaign not implemented");
}

export async function explainRun(input?: any): Promise<unknown> {
  console.error("explainRun not yet implemented");
  throw new Error("explainRun not implemented");
}

export async function validateGenerated(input?: any): Promise<unknown> {
  console.error("validateGenerated not yet implemented");
  throw new Error("validateGenerated not implemented");
}

/**
 * List available local Ollama models
 * Signature matches TanStack server function pattern
 */
export async function listLocalModels(input?: { data?: {} }): Promise<{
  ok: boolean;
  models: Array<{ name: string; sizeGb: number }>;
}> {
  try {
    const models = await getLocalModelsList();
    return {
      ok: true,
      models: (models || []).map((m) => ({
        name: m.name,
        sizeGb: m.sizeGb ?? 0,
      })),
    };
  } catch (error) {
    console.error("Failed to list local models:", error);
    return { ok: false, models: [] };
  }
}

/**
 * Route an AI task to the best model
 */
export async function routeAiTask(
  query: string,
  context?: Record<string, any>
) {
  try {
    const route = await routeTask({
      message: query,
      hasAttachment: false,
      contextChars: context?.contextChars ?? 0,
      modelPrefs: context?.modelPrefs ?? null,
    });
    return route;
  } catch (error) {
    console.error("Failed to route task:", error);
    return null;
  }
}

/**
 * Interpret user query with cascade reasoning
 * (Stub - cascade-reasoning.server exports are not yet exported)
 */
export async function cascadeInterpretQuery(
  userQuery: string,
  context?: Record<string, any>
) {
  console.warn("cascadeInterpretQuery: not yet implemented");
  return null;
}

/**
 * Execute a multimodal action
 * (Stub - multimodal-actions.server uses different internal names)
 */
export async function executeMultimodalAction(
  action: "text-to-image" | "image-to-image" | "text-to-video" | "image-to-text" | "image-to-video" | "video-to-text",
  input: string | Buffer,
  options?: Record<string, any>
) {
  console.warn("executeMultimodalAction: not yet implemented");
  return null;
}

/**
 * Analyze data with ALIENTELLIGENCE/aidatascientistv2
 * Supports tables, JSON data, images, and complex analysis
 */
export async function analyzeDataUI(
  input: DataInput
): Promise<AnalysisResult> {
  try {
    return await analyzeData(input, null);
  } catch (error) {
    console.error("Data analysis failed:", error);
    return {
      summary: `Error: ${error instanceof Error ? error.message : "unknown"}`,
      keyFindings: [],
      rawResponse: "",
      model: "error",
    };
  }
}

/**
 * Quick analytics for rapid insights on data
 */
export async function quickAnalyticsUI(
  description: string,
  data: Record<string, any>[],
  question?: string
): Promise<string> {
  try {
    return await quickAnalytics(description, data, question);
  } catch (error) {
    console.error("Quick analytics failed:", error);
    return `Error en análisis rápido: ${error instanceof Error ? error.message : "unknown"}`;
  }
}

/**
 * Detect anomalies in data
 */
export async function detectAnomaliesUI(
  description: string,
  data: Record<string, any>[],
  metric: string
): Promise<AnalysisResult> {
  try {
    return await detectAnomalies(description, data, metric);
  } catch (error) {
    console.error("Anomaly detection failed:", error);
    return {
      summary: `Error en detección de anomalías: ${error instanceof Error ? error.message : "unknown"}`,
      keyFindings: [],
      rawResponse: "",
      model: "error",
    };
  }
}

/**
 * Analyze trends in data
 */
export async function analyzeTrendsUI(
  description: string,
  data: Record<string, any>[],
  metric: string
): Promise<AnalysisResult> {
  try {
    return await analyzeTrends(description, data, metric);
  } catch (error) {
    console.error("Trend analysis failed:", error);
    return {
      summary: `Error en análisis de tendencias: ${error instanceof Error ? error.message : "unknown"}`,
      keyFindings: [],
      rawResponse: "",
      model: "error",
    };
  }
}

/**
 * Generate data-driven recommendations
 */
export async function generateRecommendationsUI(
  description: string,
  data: Record<string, any>[],
  context?: string
): Promise<string[]> {
  try {
    return await generateRecommendations(description, data, context);
  } catch (error) {
    console.error("Recommendation generation failed:", error);
    return [`Error: ${error instanceof Error ? error.message : "unknown"}`];
  }
}

/**
 * Generate slide background via NVIDIA image chain
 */
export async function generateSlideBackground(input?: any): Promise<{ ok: boolean; url?: string; provider?: string; model?: string; error?: string }> {
  const data = input?.data ?? input;
  const prompt: string | undefined = data?.prompt;
  const highQuality: boolean = Boolean(data?.highQuality);
  const conversationId: string | null = data?.conversationId ?? null;
  if (!prompt?.trim()) return { ok: false, error: "Prompt vacío" };
  try {
    const { generateBackground } = await import("./studio.server");
    const result = await generateBackground(conversationId, prompt, highQuality);
    return { ok: true, url: result.url, provider: result.provider, model: result.model };
  } catch (e: any) {
    console.error("generateSlideBackground failed:", e);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

/**
 * Read image file using vision AI (NVIDIA VISION_CHAIN).
 */
export async function readImageFile(input?: any): Promise<{ ok: boolean; text?: string; provider?: string; model?: string; error?: string }> {
  const data = input?.data ?? input;
  const base64: string | undefined = data?.base64;
  const mime: string = data?.mime ?? "image/png";
  const conversationId: string | null = data?.conversationId ?? null;
  if (!base64) return { ok: false, error: "No se proporcionó imagen base64" };
  if (base64.length < 100) return { ok: false, error: "Imagen base64 demasiado corta o corrupta" };
  try {
    const { describeImage } = await import("./studio.server");
    const result = await describeImage(conversationId, base64, mime);
    return { ok: true, text: result.text, provider: result.provider, model: result.model };
  } catch (e: any) {
    try {
      const { VISION_CHAIN } = await import("./model-catalog");
      const { resilientVision } = await import("./providers.server");
      const result = await resilientVision(
        VISION_CHAIN,
        base64,
        mime,
        "Transcribí con precisión todo el texto, tablas y series numéricas visibles en esta imagen financiera. Devolvé las tablas en formato markdown y no inventes ningún número que no esté claramente legible. Si es un gráfico, describí ejes, valores y tendencia.",
      );
      return { ok: true, text: result.value, provider: result.provider, model: result.model };
    } catch (e2: any) {
      console.error("readImageFile failed:", e2);
      return { ok: false, error: e2?.message ?? e?.message ?? String(e2 ?? e) };
    }
  }
}

/**
 * Studio turn — chat con contexto, orquestación reasoning/narrative
 */
export async function studioTurn(input?: any): Promise<{ ok: boolean; text?: string; provider?: string; model?: string; slide?: any; checks?: any; intent?: string; error?: string; attempts?: any[] }> {
  const data = input?.data ?? input;
  if (!data?.message?.trim()) return { ok: false, error: "Mensaje vacío" };
  try {
    const { runStudioTurn } = await import("./studio.server");
    const result = await runStudioTurn({
      conversationId: data.conversationId ?? null,
      message: data.message,
      history: Array.isArray(data.history) ? data.history : [],
      files: Array.isArray(data.files) ? data.files : [],
      selectedElementId: data.selectedElementId ?? null,
      currentSlide: data.currentSlide ?? null,
      highQualityImage: Boolean(data.highQualityImage),
      useWeb: Boolean(data.useWeb),
      modelPrefs: data.modelPrefs ?? null,
      uiContext: data.uiContext ?? null,
    });
    return { ok: true, text: result.text, provider: result.provider, model: result.model, slide: result.slide, checks: result.checks, intent: result.intent, attempts: result.attempts };
  } catch (e: any) {
    console.error("studioTurn failed:", e);
    return { ok: false, error: e?.message ?? String(e) };
  }
}

// Stubs for lab panel functions are already exported above
