// @ts-nocheck
// Modelos locales — DESHABILITADO.
// Ollama fue eliminado del stack: la app usa exclusivamente modelos cloud de
// NVIDIA. Este módulo se mantiene como stúb en
// blanco para que las importaciones existentes no rompan, pero NO realiza
// ningún llamado a red ni a Ollama.
import type { ChatMessage } from "./providers.server";
import type { ModelRef, TaskIdOrDesign } from "./model-catalog";

export type LocalModelInfo = {
  name: string;
  sizeBytes: number;
  modifiedAt: string;
  capabilities: string[];
};

export const OLLAMA_DISABLED = true;

export async function listLocalModels(_force = false): Promise<LocalModelInfo[]> {
  return [];
}

export async function isOllamaUp(): Promise<boolean> {
  return false;
}

export async function findLocalModel(_name: string): Promise<LocalModelInfo | null> {
  return null;
}

export async function installedModelNames(): Promise<string[]> {
  return [];
}

export async function localChat(
  _model: string,
  _messages: ChatMessage[],
  _opts: { maxTokens?: number; temperature?: number; json?: boolean } = {},
): Promise<string> {
  throw new Error("[Ollama deshabilitado] Usalo modelos cloud (NVIDIA).");
}

export async function localEmbed(_text: string, _model = "all-minilm"): Promise<number[]> {
  throw new Error("[Ollama deshabilitado] Sin embeddings locales.");
}

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function semanticSimilarity(_a: string, _b: string): Promise<number> {
  return 0;
}

export async function semanticSearch(
  _query: string,
  candidates: Array<{ text: string; score?: number }>,
  topK = 3,
): Promise<Array<{ text: string; score: number }>> {
  return candidates
    .map((c) => ({ text: c.text, score: c.score ?? 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

export async function bestLocalModelForTask(_task: TaskIdOrDesign): Promise<LocalModelInfo | null> {
  return null;
}

export function localModelRef(_info: LocalModelInfo): ModelRef {
  return { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 4096 };
}

export async function localChainForTask(_task: TaskIdOrDesign): Promise<ModelRef[]> {
  return [];
}
