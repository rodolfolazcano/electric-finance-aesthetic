// @ts-nocheck
// Capa resiliente multi-proveedor con rotación de API keys.
// Solo corre en el servidor: las keys nunca salen de acá.
import { envReady } from "./env.server";
import {
  FAST_CHAIN,
  IMAGE_TIMEOUT_MS,
  TEXT_TIMEOUT_MS,
  CHAIN_TIMEOUT_MS,
  type ModelRef,
  type ProviderId,
} from "./model-catalog";
import { HANDOFF_INSTRUCTIONS, BASE_SYSTEM_PROMPT } from "./prompts.server";
import type { ZodType } from "zod";


export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type CallAttempt = {
  provider: ProviderId;
  model: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type ResilientResult<T> = {
  value: T;
  provider: ProviderId;
  model: string;
  attempts: CallAttempt[];
  /** tool_calls si el modelo invocó herramientas (solo en agent mode). */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

/**
 * Pool de keys por proveedor. NVIDIA admite hasta 6 keys rotativas: si una
 * está sin cuota, rate-limiteada o vencida, se pasa automáticamente a la
 * siguiente sin cortar la respuesta al usuario.
 */
/**
 * Lee las keys directo de .env/.env.local en disco (sincrónico, sin depender
 * de que envReady haya corrido en este proceso). Solo se usa como último
 * recurso SI process.env e import.meta.env ya no tienen la var.
 */
let fileKeysCache: Record<string, string> | null = null;

function loadKeysFromFileSync(): Record<string, string> {
  if (fileKeysCache) return fileKeysCache;
  const out: Record<string, string> = {};
  try {
    const fs = (process as unknown as { getBuiltinModule?: (m: string) => unknown }).getBuiltinModule;
    const modFs = fs?.("node:fs") as { existsSync?: (p: string) => boolean; readFileSync?: (p: string, e: string) => string } | undefined;
    const modPath = fs?.("node:path") as { dirname?: (p: string) => string; isAbsolute?: (p: string) => boolean } | undefined;
    const dirname = modPath?.dirname;
    if (modFs?.readFileSync && dirname) {
      const cwd = process.cwd();
      const roots = new Set<string>([cwd]);
      const p1 = dirname(cwd);
      if (p1 !== cwd) roots.add(p1);
      const p2 = dirname(p1);
      if (p2 !== p1) roots.add(p2);
      for (const root of roots) {
        for (const file of [`.env`, `.env.local`]) {
          const full = `${root}\\${file}`;
          try {
            if (!modFs.existsSync?.(full)) continue;
            const text = modFs.readFileSync(full, "utf8");
            for (const rawLine of text.split(/\r?\n/)) {
              const line = rawLine.trim();
              if (!line || line.startsWith("#")) continue;
              const eq = line.indexOf("=");
              if (eq <= 0) continue;
              const k = line.slice(0, eq).trim();
              let v = line.slice(eq + 1).trim();
              v = v.replace(/^["']|["']$/g, "");
              if (k && !(k in out) && v) out[k] = v;
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  fileKeysCache = out;
  return out;
}

function envVal(key: string): string | undefined {
  const p = process.env[key];
  if (p) return p;
  const ie = (import.meta as unknown as { env?: Record<string, unknown> }).env?.[key];
  if (typeof ie === "string" && ie) return ie;
  return loadKeysFromFileSync()[key] || undefined;
}

function keysFor(provider: ProviderId): string[] {
  const raw =
    provider === "nvidia"
      ? [
          envVal("NVIDIA_API_KEY"),
          envVal("NVIDIA_API_KEY_2"),
          envVal("NVIDIA_API_KEY_3"),
          envVal("NVIDIA_API_KEY_4"),
          envVal("NVIDIA_API_KEY_5"),
          envVal("NVIDIA_API_KEY_6"),
        ]
      : provider === "together"
        ? [envVal("TOGETHER_API_KEY")]
        : provider === "ollama"
          ? [envVal("OLLAMA_URL") ?? "ollama-local"]
          : [];

  const seen = new Set<string>();
  const keys: string[] = [];
  for (const key of raw) {
    const trimmed = key?.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      keys.push(trimmed);
    }
  }
  return keys;
}

/**
 * Keys específicas por modelo (en vez de por proveedor). Útil cuando un modelo
 * tiene una key dedicada (ej. NVIDIA Build genera una key por modelo) que debe
 * usarse ANTES que las keys genéricas del pool.
 */
function modelSpecificKey(model: string): string | undefined {
  return envVal(`NVIDIA_API_KEY_MODEL_${model.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`)?.trim() || undefined;
}

/** Keys a probar para un modelo: primero la específica del modelo, luego el pool del proveedor. */
function orderedKeys(ref: { provider: ProviderId; model: string }): string[] {
  const specific = modelSpecificKey(ref.model);
  const pool = keysFor(ref.provider);
  const all = specific ? [specific, ...pool] : pool;
  if (all.length <= 1) return all;
  const start = (rotationCursor[ref.provider] ?? 0) % all.length;
  return [...all.slice(start), ...all.slice(0, start)];
}

/** Índice de arranque rotativo por proveedor: reparte carga entre keys. */
const rotationCursor: Partial<Record<ProviderId, number>> = {};
const warnedNoKeys = new Set<string>();

function markKeyWorked(provider: ProviderId, key: string) {
  const keys = keysFor(provider);
  const index = keys.indexOf(key);
  if (index >= 0) rotationCursor[provider] = (index + 1) % keys.length;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const CHAT_ENDPOINT: Record<string, string> = {
  nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
  together: "https://api.together.xyz/v1/chat/completions",
  ollama: `${process.env.OLLAMA_URL ?? "http://localhost:11434"}/v1/chat/completions`,
};

// Caché simple de respuestas: clave = chain+primeros80chars del prompt
const responseCache = new Map<string, { value: any; ts: number }>();
const CACHE_TTL_MS = 60_000;

function getCached<T>(chain: ModelRef[], messages: ChatMessage[]): T | null {
  const key = `${chain[0]?.model ?? ""}|${messages.find(m => m.role === "user" || m.role === "system")?.content?.slice(0, 80) ?? ""}`;
  const entry = responseCache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.value as T;
  if (entry) responseCache.delete(key);
  return null;
}

function setCache(chain: ModelRef[], messages: ChatMessage[], value: any) {
  const model = chain[0]?.model ?? "";
  const prefix = messages.find(m => m.role === "user" || m.role === "system")?.content?.slice(0, 80) ?? "";
  const key = `${model}|${prefix}`;
  if (responseCache.size > 500) responseCache.delete(responseCache.keys().next().value!);
  responseCache.set(key, { value, ts: Date.now() });
}

/**
 * Recorre modelos de la cadena y, dentro de cada modelo, rota las keys del
 * proveedor. Devuelve el primer resultado válido.
 */
async function runChain<T>(
  chain: ModelRef[],
  attempts: CallAttempt[],
  run: (ref: ModelRef, apiKey: string) => Promise<T>,
  hooks: {
    /** Se ejecuta antes de saltar al siguiente modelo de la cadena. */
    beforeNextModel?: (info: {
      failed: ModelRef;
      next: ModelRef;
      error: string;
      contextOverflow: boolean;
    }) => Promise<void>;
  } = {},
): Promise<ResilientResult<T>> {
  // Garantiza que .env esté poblado en process.env antes de leer keys (server fn
  // puede ejecutarse en un entry que no pasa por server.ts). Una vez resuelta, el
  // await es prácticamente gratis (promise ya cumplida).
  await envReady;
  const providerBlocked: Partial<Record<ProviderId, boolean>> = {};
  const startedChain = Date.now();

  for (let i = 0; i < chain.length; i += 1) {
    if (Date.now() - startedChain > CHAIN_TIMEOUT_MS) break;

    const ref = chain[i];
    if (providerBlocked[ref.provider]) {
      attempts.push({
        provider: ref.provider, model: ref.model, ok: false, latencyMs: 0,
        error: `provider ${ref.provider} saltado por fallo de autenticación`,
      });
      continue;
    }

    let lastError = "sin API key configurada";
    const keys = orderedKeys(ref);
    if (!keys.length) {
      const tag = `no-keys:${ref.model}`;
      if (!warnedNoKeys.has(tag)) {
        warnedNoKeys.add(tag);
        const pro = (k: string) => (process.env[k] ? "process" : import.meta?.env?.[k] ? "import.meta.env" : "AUSENTE");
        console.warn(`[providers] ${ref.model}: sin keys. cwd=${process.cwd()} | NVIDIA_API_KEY=${pro("NVIDIA_API_KEY")}, modelo-specific=${pro(`NVIDIA_API_KEY_MODEL_${ref.model.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "")}`)}`);
      }
      attempts.push({
        provider: ref.provider, model: ref.model, ok: false, latencyMs: 0, error: lastError,
      });
      continue;
    }
    for (const apiKey of keys) {
      const started = Date.now();
      try {
        const value = await run(ref, apiKey);
        markKeyWorked(ref.provider, apiKey);
        attempts.push({
          provider: ref.provider, model: ref.model, ok: true, latencyMs: Date.now() - started,
        });
        return { value, provider: ref.provider, model: ref.model, attempts };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        lastError = message;
        attempts.push({
          provider: ref.provider, model: ref.model, ok: false,
          latencyMs: Date.now() - started, error: message,
        });
        // 400 = payload inválido: no reintentar con otra key
        if (/\b400\b/.test(message)) break;
        // 401/403 = auth error: toda las keys de este provider van a fallar
        if (/\b(401|403)\b/.test(message)) {
          providerBlocked[ref.provider] = true;
          break;
        }
      }
    }

    if (Date.now() - startedChain > CHAIN_TIMEOUT_MS) break;
    const next = chain[i + 1];
    if (next && hooks.beforeNextModel) {
      try {
        await hooks.beforeNextModel({
          failed: ref, next, error: lastError,
          contextOverflow: isContextOverflow(lastError),
        });
      } catch (error) {
        console.error("[providers] handoff falló", error);
      }
    }
  }
  throw Object.assign(new Error("Todos los modelos de la cadena fallaron"), { attempts });
}

/** Detecta cortes por límite de ventana de contexto. */
export function isContextOverflow(message: string): boolean {
  return /context[_ ]?length|maximum context|too many tokens|token limit|context window|reduce the length/i.test(
    message,
  );
}


export type ChainOptions = {
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  handoff?: HandoffOptions;
  /** Esquema de tools para function-calling (OpenAI format). */
  tools?: Record<string, unknown>[];
};

/** Inyecta tools en el body si están definidas. */
function buildChatBody(
  ref: ModelRef,
  messages: ChatMessage[],
  opts: ChainOptions,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: ref.model,
    messages,
    temperature: opts.temperature ?? 0.3,
    top_p: 0.95,
    max_tokens: Math.min(opts.maxTokens ?? 2400, ref.maxTokens ?? 8192),
  };
  if (opts.json && !ref.noJsonMode) body.response_format = { type: "json_object" };
  if (typeof ref.seed === "number") body.seed = ref.seed;
  if (ref.reasoningEffort) body.reasoning_effort = ref.reasoningEffort;
  if (ref.thinking) {
    body.chat_template_kwargs = { enable_thinking: true };
    if (ref.reasoningBudget) body.reasoning_budget = ref.reasoningBudget;
  }
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = "auto";
  }
  return body;
}

async function callOpenAICompatible(
  ref: ModelRef,
  apiKey: string,
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number; temperature?: number },
): Promise<string> {
  const endpoint = CHAT_ENDPOINT[ref.provider as ProviderId] ?? "https://integrate.api.nvidia.com/v1/chat/completions";
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(buildChatBody(ref, messages, opts)),
    },
    TEXT_TIMEOUT_MS,
  );

  if (!res.ok) {
    throw new Error(`${ref.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string; reasoning_content?: string } }>;
  };
  const message = data.choices?.[0]?.message;
  const text = (message?.content ?? message?.reasoning_content ?? "").trim();
  if (!text) throw new Error(`${ref.provider}: respuesta vacía`);
  return text;
}

export type HandoffOptions = {
  /** Título/tema de la tarea, para que el resumen sea accionable. */
  task?: string;
  /** Recibe cada resumen generado (para persistirlo en `messages`). */
  onSummary?: (summary: string) => void;
};

/**
 * Genera el resumen de handoff con un modelo barato y reescribe los mensajes:
 * el siguiente modelo arranca del estado resuelto, no del historial crudo.
 */
async function applyHandoff(
  working: ChatMessage[],
  info: { failed: ModelRef; next: ModelRef; error: string; contextOverflow: boolean },
  handoff: HandoffOptions,
): Promise<void> {
  const systemBlocks = working.filter((m) => m.role === "system");
  const conversation = working.filter((m) => m.role !== "system");
  const lastUser = [...conversation].reverse().find((m) => m.role === "user");

  let summary = "";
  try {
    const result = await runChain(FAST_CHAIN, [], (ref, apiKey) =>
      callOpenAICompatible(
        ref,
        apiKey,
        [
          { role: "system", content: HANDOFF_INSTRUCTIONS },
          {
            role: "user",
            content: `TAREA: ${handoff.task ?? "tarea del estudio"}\nMODELO QUE FALLÓ: ${info.failed.model} (${info.error.slice(0, 200)})\n\nESTADO DE LA CONVERSACIÓN:\n${conversation
              .slice(-8)
              .map((m) => `${m.role.toUpperCase()}: ${(m.content ?? "").slice(0, 3000)}`)
              .join("\n\n")}`,
          },
        ],
        { json: true, temperature: 0.1, maxTokens: 900 },
      ),
    );
    const parsed = JSON.parse(extractJsonSlice(result.value)) as {
      title?: string;
      decided?: string;
      verified?: string;
      pending?: string;
    };
    summary = `RESUMEN DE HANDOFF (continuá desde acá, no reinicies la tarea)\n- Tarea: ${parsed.title ?? handoff.task ?? "-"}\n- Decidido: ${parsed.decided ?? "-"}\n- Verificado: ${parsed.verified ?? "-"}\n- Pendiente: ${parsed.pending ?? "-"}`;
  } catch {
    summary = `RESUMEN DE HANDOFF (continuá desde acá, no reinicies la tarea)\n- Tarea: ${handoff.task ?? "tarea del estudio"}\n- Estado: el modelo anterior (${info.failed.model}) cortó por ${info.contextOverflow ? "límite de contexto" : "error"}. Continuá con el último pedido del usuario usando el contexto disponible.`;
  }

  handoff.onSummary?.(summary);

  // Reescribe el working set: system + resumen + últimos mensajes relevantes.
  // Con corte por contexto se recorta más agresivo.
  const keep = info.contextOverflow ? 2 : 4;
  const tail = conversation.slice(-keep);
  working.length = 0;
  working.push(
    { role: "system", content: BASE_SYSTEM_PROMPT },
    ...systemBlocks,
    { role: "system", content: summary },
    ...tail,
  );
  if (lastUser && !tail.includes(lastUser)) working.push(lastUser);
}

/** Texto con failover de modelo + rotación de key + handoff de contexto. */
export async function resilientChat(
  chain: ModelRef[],
  messages: ChatMessage[],
  opts: ChainOptions = {},
): Promise<ResilientResult<string>> {
  const cached = getCached<string>(chain, messages);
  if (cached) return { value: cached, provider: "cache", model: "cache", attempts: [] };

  const working = [...messages];
  try {
    const result = await runChain(
      chain, [],
      (ref, apiKey) => callOpenAICompatible(ref, apiKey, working, opts),
      opts.handoff
        ? { beforeNextModel: (info) => applyHandoff(working, info, opts.handoff!) }
        : {},
    );
    setCache(chain, messages, result.value);
    return result;
  } catch (e) {
    const err = e as any;
    const a = err?.attempts ?? [];
    const det = a.filter((x: any) => !x.ok).map((x: any) => `${x.provider}/${x.model}: ${(x.error??"").slice(0,60)}`).join("; ");
    return {
      value: `[API no disponible] Modelos sin respuesta. ${det ? `${det}. ` : ""}Verificá NVIDIA_API_KEY en el .env.`,
      provider: "fallback", model: "fallback", attempts: a,
    };
  }
}

function extractJsonSlice(raw: string): string {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");
  if (objStart >= 0 && objEnd > objStart) return cleaned.slice(objStart, objEnd + 1);
  return cleaned;
}

/** JSON forzado con limpieza de markdown y bloques de thinking.
 * Si se pasa `schema` (zod), valida el resultado y reintenta una vez con el
 * error de validación pegado en el mensaje antes de ceder el turno al
 * siguiente modelo de la cadena. */
export async function resilientJson<T>(
  chain: ModelRef[],
  messages: ChatMessage[],
  opts: {
    maxTokens?: number;
    temperature?: number;
    handoff?: HandoffOptions;
    /** Schema zod de validación. Si falla, reintenta una vez con feedback. */
    schema?: ZodType<T>;
    /** Cantidad de reintentos con feedback de validación (default 1). */
    schemaRetries?: number;
  } = {},
): Promise<ResilientResult<T>> {
  const attempts: CallAttempt[] = [];
  const working = [...messages];
  const temperature = opts.temperature ?? 0.15;
  const retries = opts.schema ? (opts.schemaRetries ?? 1) : 0;

  const result = await runChain(
    chain,
    attempts,
    async (ref, apiKey) => {
      const localMessages = [...working];
      let lastRaw: string | null = null;
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        const raw = await callOpenAICompatible(ref, apiKey, localMessages, {
              json: true,
              temperature,
              maxTokens: opts.maxTokens,
            });
        lastRaw = raw;

        let parsed: T;
        try {
          parsed = JSON.parse(extractJsonSlice(raw)) as T;
        } catch (error) {
          if (attempt >= retries)
            throw new Error(`JSON inválido tras ${retries + 1} intentos: ${String(error)}`);
          localMessages.push({
            role: "user",
            content: `Tu respuesta anterior NO es JSON válido (lo que respondiste:\n${raw.slice(0, 1200)}\n). Devolvé SOLO un objeto JSON válido, sin markdown ni texto extra.`,
          });
          continue;
        }

        if (opts.schema) {
          const checked = opts.schema.safeParse(parsed);
          if (!checked.success) {
            if (attempt >= retries) {
              throw new Error(
                `Schema no cumple tras ${retries + 1} intentos: ${checked.error.issues
                  .map((i) => `${i.path.join(".")}: ${i.message}`)
                  .slice(0, 6)
                  .join("; ")}`,
              );
            }
            localMessages.push({
              role: "user",
              content: `Tu respuesta anterior NO cumple el schema esperado. Errores de validación:\n- ${checked.error.issues
                .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
                .slice(0, 8)
                .join(
                  "\n- ",
                )}\n\nCorregí el JSON y devolvé SOLO el objeto válido, respetando tipos y claves exactas. No cambies nombres de clave ni agregues campos extras.`,
            });
            continue;
          }
          parsed = checked.data as T;
        }
        return parsed;
      }
      throw new Error(`No se pudo obtener JSON válido (último intento: ${lastRaw?.slice(0, 300)})`);
    },
    opts.handoff ? { beforeNextModel: (info) => applyHandoff(working, info, opts.handoff!) } : {},
  );
  return result;
}


/** Imagen con failover NVIDIA. Devuelve base64 puro (PNG/JPEG). */
export async function resilientImage(
  chain: ModelRef[],
  prompt: string,
): Promise<ResilientResult<{ base64: string; mime: string }>> {
  return runChain(chain, [], async (ref, apiKey) => {
    let base64: string | undefined;
    let mime = "image/png";

    if (ref.provider === "nvidia") {
      const res = await fetchWithTimeout(
        `https://ai.api.nvidia.com/v1/genai/${ref.model}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            prompt,
            width: 1024,
            height: 1024,
            steps: ref.model.includes("schnell") ? 4 : 30,
            cfg_scale: 3.5,
            seed: Math.floor(Math.random() * 1_000_000),
          }),
        },
        IMAGE_TIMEOUT_MS,
      );
      if (!res.ok) {
        throw new Error(`nvidia ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        artifacts?: Array<{ base64?: string }>;
        image?: string;
        images?: string[];
      };
      base64 = data.artifacts?.[0]?.base64 ?? data.image ?? data.images?.[0];
    }

    if (!base64) throw new Error(`${ref.provider}: sin imagen en la respuesta`);
    return { base64, mime };
  });
}

/** Visión: transcribe/analiza una imagen en base64. */
export async function resilientVision(
  chain: ModelRef[],
  base64: string,
  mime: string,
  instruction: string,
): Promise<ResilientResult<string>> {
  return runChain(chain, [], async (ref, apiKey) => {
    let text: string | undefined;
    const res = await fetchWithTimeout(
      CHAT_ENDPOINT[ref.provider as ProviderId],
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: ref.model,
          max_tokens: ref.maxTokens ?? 1800,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: instruction },
                { type: "image_url", image_url: { url: `data:${mime};base64,${base64}` } },
              ],
            },
          ],
        }),
      },
      TEXT_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`${ref.provider} ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    text = data.choices?.[0]?.message?.content ?? undefined;
    if (!text) throw new Error(`${ref.provider}: sin texto`);
    return text;
  });
}

// 
// AGENTE: variant con tool-calling (devuelve content + tool_calls)
// 

/** Tipado del mensaje completo del asistente para el agente. */
export type AgentResponse = {
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

/**
 * Loop del agente: llama al modelo con tools=, extrae tool_calls,
 * devuelve el mensaje completo. Recorre proveedores/keys como resilientChat.
 */
export async function resilientAgentTurn(
  chain: ModelRef[],
  messages: ChatMessage[],
  opts: ChainOptions = {},
): Promise<ResilientResult<AgentResponse>> {
  const cached = getCached<AgentResponse>(chain, messages);
  if (cached) return { value: cached, provider: "cache", model: "cache", attempts: [] };

  const working = [...messages];
  try {
    const result = await runChain(
    chain,
    [],
    async (ref, apiKey): Promise<AgentResponse> => {
      const endpoint = CHAT_ENDPOINT[ref.provider as ProviderId];
      const body = buildChatBody(ref, working, opts);
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json",
            authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        },
        TEXT_TIMEOUT_MS,
      );
      if (!res.ok) {
        throw new Error(`${ref.provider} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null; tool_calls?: Array<any> } }>;
      };
      const msg = data.choices?.[0]?.message;
      if (!msg) throw new Error(`${ref.provider}: respuesta vacía o mal formada`);
      const content = msg.content ?? null;
      const tool_calls = msg.tool_calls?.length
        ? msg.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          }))
        : undefined;
      return { content, tool_calls };
    },
    opts.handoff
      ? { beforeNextModel: (info) => applyHandoff(working as ChatMessage[], info, opts.handoff!) }
      : {},
  );
    setCache(chain, messages, result.value);
    return result;
  } catch (e) {
    const err = e as any;
    const a = err?.attempts ?? [];
    const det = a.filter((x: any) => !x.ok).map((x: any) => `${x.provider}/${x.model}: ${(x.error??"").slice(0,60)}`).join("; ");
    return {
      value: { content: `[API no disponible] Modelos sin respuesta. ${det ? `${det}. ` : ""}Verificá NVIDIA_API_KEY en el .env.`, tool_calls: undefined },
      provider: "fallback", model: "fallback", attempts: a,
    };
  }
}
