// Catálogo de modelos y cadenas de failover.
// Este archivo es data pura: no contiene keys ni llamadas de red.

export type ProviderId =
  | "nvidia"
  | "together"
  | "ollama"
  | "cache"
  | "fallback";

export type ModelRef = {
  provider: ProviderId;
  model: string;
  /** Techo de tokens propio del modelo. */
  maxTokens?: number;
  /** Activa el modo "thinking" del modelo cuando lo soporta. */
  thinking?: boolean;
  /** Presupuesto de razonamiento (solo modelos nemotron con reasoning). */
  reasoningBudget?: number;
  /** Semilla fija para reproducibilidad en tareas de cálculo. */
  seed?: number;
  /** El modelo no acepta response_format json_object. */
  noJsonMode?: boolean;
  /** Nivel de reasoning explícito (modelos mistral). */
  reasoningEffort?: "low" | "medium" | "high";

};

export type TaskId =
  | "reasoning"
  | "narrative"
  | "json"
  | "code"
  | "audit"
  | "image"
  | "vision"
  | "data_science"
  | "analytics";

/** Tareas que el usuario puede configurar por separado (incluye "design"). */
export type TaskIdOrDesign =
  | TaskId
  | "design"
  | "prompt_image"
  | "prompt_video"
  | "prompt_text"
  | "prompt_pdf";

/** Preferencias de modelos por tarea: task → id "provider/model" (primario). */
export type ModelPrefs = Partial<Record<TaskIdOrDesign, string>>;

export const TEXT_TIMEOUT_MS = 20_000;
export const IMAGE_TIMEOUT_MS = 30_000;
export const CHAIN_TIMEOUT_MS = 25_000;

/**
 * Razonamiento profundo: estrategia, cruce de datos, intención compleja.
 * Arranca por los modelos frontier de NVIDIA con thinking activado.
 * Solo NVIDIA - sin otros proveedores.
 */
export const REASONING_CHAIN: ModelRef[] = [
  {
    provider: "nvidia",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    maxTokens: 16384,
    thinking: true,
    reasoningBudget: 16384,
  },
  {
    provider: "nvidia",
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    maxTokens: 16384,
    thinking: true,
    reasoningBudget: 16384,
  },
  { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 16384, seed: 42 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 8192 },
  { provider: "nvidia", model: "thinkingmachines/inkling", maxTokens: 8192 },
  { provider: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1.5", maxTokens: 8192 },
  { provider: "nvidia", model: "meta/llama-3.3-70b-instruct", maxTokens: 8192 },
];

/** Narrativa: copy de captación, posts, informes, guiones. Solo NVIDIA. */
export const NARRATIVE_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 8192, seed: 42 },
  { provider: "nvidia", model: "stepfun-ai/step-3.7-flash", maxTokens: 8192 },
  { provider: "nvidia", model: "google/gemma-4-31b-it", maxTokens: 8192 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 8192 },
  { provider: "nvidia", model: "thinkingmachines/inkling", maxTokens: 8192 },
  { provider: "nvidia", model: "meta/llama-3.3-70b-instruct", maxTokens: 4096 },
];

/** Extracción estructurada / JSON forzado. Solo NVIDIA. */
export const JSON_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 8192 },
  { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 8192 },
  { provider: "nvidia", model: "mistralai/mistral-nemotron", maxTokens: 4096 },
  { provider: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1.5", maxTokens: 8192 },
];

/** Escritura y depuración de código ejecutable. Solo NVIDIA. */
export const CODE_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "poolside/laguna-xs-2.1", maxTokens: 16384 },
  { provider: "nvidia", model: "nvidia/nemotron-3-super-120b-a12b", maxTokens: 16384 },
  { provider: "nvidia", model: "deepseek-ai/deepseek-v4-flash", maxTokens: 16384 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 8192 },
];

/** Auditoría: errores de cálculo, lógica rota, incoherencias entre documentos. Solo NVIDIA. */
export const AUDIT_CHAIN: ModelRef[] = [
  {
    provider: "nvidia",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    maxTokens: 16384,
    thinking: true,
    reasoningBudget: 16384,
  },
  {
    provider: "nvidia",
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    maxTokens: 16384,
    thinking: true,
    reasoningBudget: 16384,
  },
  { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 16384, seed: 42 },
  { provider: "nvidia", model: "poolside/laguna-xs-2.1", maxTokens: 8192 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 8192 },
];

/**
 * Análisis de datos y ciencia de datos: tablas, gráficos, resultados de UI,
 * KPIs, anomalías, tendencias, correlaciones, recomendaciones.
 * ALIENTELLIGENCE/aidatascientistv2 como primario (128K context).
 * Solo NVIDIA.
 */
export const DATA_SCIENCE_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 8192 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 8192 },
  { provider: "nvidia", model: "nvidia/llama-3.3-nemotron-super-49b-v1.5", maxTokens: 8192 },
];

/**
 * Análisis rápido de tablas/gráficos (analytics): interpretación veloz,
 * sumarios, reporte de hallazgos sin análisis profundo.
 * Solo NVIDIA.
 */
export const ANALYTICS_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 4096 },
  { provider: "nvidia", model: "google/gemma-4-31b-it", maxTokens: 4096 },
];

/** Imágenes de fondo para slides y banners. Solo NVIDIA. */
export const IMAGE_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "black-forest-labs/flux.1-schnell" },
  { provider: "nvidia", model: "black-forest-labs/flux.1-dev" },
  { provider: "nvidia", model: "stabilityai/sdxl-turbo" },
];

/** Imágenes priorizando calidad. Solo NVIDIA. */
export const IMAGE_CHAIN_HQ: ModelRef[] = [
  { provider: "nvidia", model: "black-forest-labs/flux.1-dev" },
  { provider: "nvidia", model: "black-forest-labs/flux.1-schnell" },
  { provider: "nvidia", model: "stabilityai/sdxl-turbo" },
];

/** Visión: leer gráficos, tablas y documentos escaneados. Solo NVIDIA. */
export const VISION_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning", maxTokens: 8192 },
  { provider: "nvidia", model: "thinkingmachines/inkling", maxTokens: 8192 },
];

/** Router ultrarrápido para clasificación de intenciones (< 50ms). */
export const ROUTER_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "nvidia/llama-3.1-nemotron-nano-8b-v1", maxTokens: 2048 },
  { provider: "nvidia", model: "deepseek-ai/deepseek-v4-flash", maxTokens: 2048 },
];

/** Marketing & copywriting (generación de textos para comunicación). */
export const MARKETING_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "stepfun-ai/step-3.7-flash", maxTokens: 8192 },
  { provider: "nvidia", model: "google/gemma-4-31b-it", maxTokens: 8192 },
];

/** Auditoría financiera y cálculo exacto de datos numéricos. */
export const FINANCIAL_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "google/gemma-4-31b-it", maxTokens: 8192 },
];

/**
 * Dirección visual (design_direction): un modelo de texto barato devuelve
 * 2-3 direcciones en JSON (paleta, tipografía, mood) ANTES de generar imagen.
 * Nunca se renderiza nada en este paso: solo se proponen opciones.
 */
export const DESIGN_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 4096 },
  { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 4096 },
];

/**
 * Narrativa corta / razonamiento liviano (salida esperada < 500 tokens):
 * Gemma vía NVIDIA primero (barato) y Gemini flash como primer fallback.
 */
export const SHORT_NARRATIVE_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 4096, seed: 42 },
  { provider: "nvidia", model: "thinkingmachines/inkling", maxTokens: 4096 },
  { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 4096, seed: 42 },
];

/**
 * Mejora de prompts de imagen. Solo NVIDIA, sin Ollama.
 * La selección primaria por tarea se guarda en `modelPrefs.prompt_image`.
 */
export const PROMPT_IMPROVER_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "deepseek-ai/deepseek-v4-flash", maxTokens: 4096 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 4096 },
];

/** Mejora de prompts de video. */
export const VIDEO_PROMPT_IMPROVER_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "deepseek-ai/deepseek-v4-flash", maxTokens: 4096 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 4096 },
];

/** Mejora de prompts de texto. */
export const TEXT_PROMPT_IMPROVER_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "deepseek-ai/deepseek-v4-flash", maxTokens: 4096 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 4096 },
];

/** Mejora de prompts de PDF/documentos. */
export const PDF_PROMPT_IMPROVER_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "deepseek-ai/deepseek-v4-flash", maxTokens: 4096 },
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 4096 },
];

export const CHAIN_BY_TASK: Record<TaskId, ModelRef[]> = {
  reasoning: REASONING_CHAIN,
  narrative: NARRATIVE_CHAIN,
  json: JSON_CHAIN,
  code: CODE_CHAIN,
  audit: AUDIT_CHAIN,
  image: IMAGE_CHAIN,
  vision: VISION_CHAIN,
  data_science: DATA_SCIENCE_CHAIN,
  analytics: ANALYTICS_CHAIN,
};

export const PROVIDER_LABEL: Record<ProviderId, string> = {
  nvidia: "NVIDIA NIM",
  together: "Together",
  ollama: "Ollama",
  cache: "Cache",
  fallback: "Fallback",
};

// ---------------------------------------------------------------------------
// Selección de modelo primario por tarea (preferencias del usuario).
// ---------------------------------------------------------------------------

export const TASK_LABEL: Record<TaskIdOrDesign, string> = {
  reasoning: "Razonamiento",
  narrative: "Narrativa",
  json: "JSON / extracción",
  code: "Código",
  audit: "Auditoría",
  image: "Imagen",
  vision: "Visión",
  design: "Dirección visual",
  prompt_image: "Prompt imagen",
  prompt_video: "Prompt video",
  prompt_text: "Prompt texto",
  prompt_pdf: "Prompt PDF",
  data_science: "Ciencia de Datos",
  analytics: "Analytics",
};

/** Fusión de dos ModelRef del mismo modelo: conserva el config más completo. */
function mergeRef(a: ModelRef, b: ModelRef): ModelRef {
  return {
    provider: a.provider,
    model: a.model,
    maxTokens: Math.max(a.maxTokens ?? 0, b.maxTokens ?? 0) || undefined,
    thinking: a.thinking || b.thinking,
    reasoningBudget: a.reasoningBudget ?? b.reasoningBudget,
    seed: a.seed ?? b.seed,
    noJsonMode: a.noJsonMode || b.noJsonMode,
    reasoningEffort: a.reasoningEffort ?? b.reasoningEffort,
  };
}

/** Registro de todos los modelos conocidos (conserva maxTokens, thinking…). */
let _knownRegistry: ModelRef[] | null = null;
function knownRegistry(): ModelRef[] {
  if (!_knownRegistry) {
    const map = new Map<string, ModelRef>();
    for (const chain of [
      REASONING_CHAIN,
      NARRATIVE_CHAIN,
      DESIGN_CHAIN,
      SHORT_NARRATIVE_CHAIN,
      JSON_CHAIN,
      CODE_CHAIN,
      AUDIT_CHAIN,
      IMAGE_CHAIN,
      IMAGE_CHAIN_HQ,
      VISION_CHAIN,
      ROUTER_CHAIN,
      MARKETING_CHAIN,
      FINANCIAL_CHAIN,
      PROMPT_IMPROVER_CHAIN,
      VIDEO_PROMPT_IMPROVER_CHAIN,
      TEXT_PROMPT_IMPROVER_CHAIN,
      PDF_PROMPT_IMPROVER_CHAIN,
      REASONING_POOL,
      FAST_CHAIN,
    ]) {
      for (const ref of chain) {
        const key = `${ref.provider}/${ref.model}`;
        const existing = map.get(key);
        map.set(key, existing ? mergeRef(existing, ref) : { ...ref });
      }
    }
    _knownRegistry = Array.from(map.values());
  }
  return _knownRegistry;
}

/** Id "provider/model" de un modelo (formato de las preferencias). */
export function prefIdOf(ref: Pick<ModelRef, "provider" | "model">): string {
  return `${ref.provider}/${ref.model}`;
}

/** Convierte un id "provider/model" a un ModelRef (con su config conocida). */
export function prefToRef(prefId?: string | null): ModelRef | null {
  if (!prefId) return null;
  const idx = prefId.indexOf("/");
  if (idx <= 0) return null;
  const provider = prefId.slice(0, idx) as ProviderId;
  const model = prefId.slice(idx + 1);
  if (!model) return null;
  const known = knownRegistry().find((m) => m.provider === provider && m.model === model);
  return known ? { ...known } : { provider, model };
}

/** Reordena la cadena: el modelo elegido pasa al frente del failover. */
export function chainWithPreference(base: ModelRef[], prefId?: string | null): ModelRef[] {
  const ref = prefToRef(prefId);
  if (!ref) return base;
  if (base[0]?.provider === ref.provider && base[0]?.model === ref.model) return base;
  const rest = base.filter((r) => !(r.provider === ref.provider && r.model === ref.model));
  return [ref, ...rest];
}

const DEFAULT_CHAIN_BY_TASK: Record<TaskIdOrDesign, ModelRef[]> = {
  reasoning: REASONING_CHAIN,
  narrative: NARRATIVE_CHAIN,
  json: JSON_CHAIN,
  code: CODE_CHAIN,
  audit: AUDIT_CHAIN,
  image: IMAGE_CHAIN,
  vision: VISION_CHAIN,
  design: DESIGN_CHAIN,
  prompt_image: PROMPT_IMPROVER_CHAIN,
  prompt_video: VIDEO_PROMPT_IMPROVER_CHAIN,
  prompt_text: TEXT_PROMPT_IMPROVER_CHAIN,
  prompt_pdf: PDF_PROMPT_IMPROVER_CHAIN,
  data_science: DATA_SCIENCE_CHAIN,
  analytics: ANALYTICS_CHAIN,
};

export const TASKS = Object.keys(DEFAULT_CHAIN_BY_TASK) as TaskIdOrDesign[];

/**
 * Cadena a usar para una tarea dado el mapa de preferencias del usuario.
 * `baseOverride` permite usar otra cadena (ej. IMAGE_CHAIN_HQ) sin cambiar task.
 */
export function resolveChain(
  task: TaskIdOrDesign,
  prefs?: ModelPrefs | null,
  baseOverride?: ModelRef[],
): ModelRef[] {
  const base = baseOverride ?? DEFAULT_CHAIN_BY_TASK[task];
  return chainWithPreference(base, prefs?.[task]);
}

/** Opciones selectables para la UI, agrupadas por tarea. */
export function selectableForTask(
  task: TaskIdOrDesign,
  extra: ModelRef[] = [],
): Array<{ id: string; provider: ProviderId; model: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; provider: ProviderId; model: string; label: string }> = [];
  const add = (ref: ModelRef) => {
    const id = prefIdOf(ref);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ id, provider: ref.provider, model: ref.model, label: shortModelLabel(ref.model) });
  };
  for (const ref of [...extra, ...DEFAULT_CHAIN_BY_TASK[task]]) add(ref);
  return out;
}

/** Nombre corto y legible de un modelo para la UI. */
export function shortModelLabel(model: string): string {
  const tail = model.split("/").at(-1) ?? model;
  const named = tail
    .replace(/:(free|hq|raw)$/i, "")
    .replace(/-(instruct|vision|it)$/i, "")
    .replace(/-\d+\.?\d*b$/i, "");
  return named
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Clasificación por velocidad y helpers de ruteo rápido/lento.
// ---------------------------------------------------------------------------

export type Speed = "fast" | "balanced" | "reasoning";

export const MODEL_SPEED: Record<string, Speed> = {
  "advancedistroadmin/Buddy": "fast",
  "VibeManGeo/zen-5-coder:q4_K_M": "reasoning",
  "minimaxai/minimax-m3": "fast",
  "thinkingmachines/inkling": "fast",
  "poolside/laguna-xs-2.1": "fast",
  "google/diffusiongemma-26b-a4b-it": "balanced",
  "meta/llama-3.3-70b-instruct": "balanced",
  "z-ai/glm-5.2": "balanced",
  "moonshotai/kimi-k2.6": "balanced",
  "mistralai/mistral-medium-3.5-128b": "reasoning",
  "deepseek-ai/deepseek-v4-pro": "reasoning",
  "nvidia/nemotron-3.5-lightning-30b-a3b": "reasoning",
  "nvidia/nemotron-3-ultra-550b-a55b": "reasoning",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": "reasoning",
  "nvidia/ising-calibration-1.5-31b": "reasoning",
};

export function speedOf(ref: ModelRef): Speed {
  return MODEL_SPEED[ref.model] ?? "balanced";
}

/** Ventana de contexto aproximada (tokens) para decidir escalados. */
export const CONTEXT_WINDOW: Record<string, number> = {
  "advancedistroadmin/Buddy": 128_000,
  "VibeManGeo/zen-5-coder:q4_K_M": 256_000,
  "nvidia/nemotron-3.5-lightning-30b-a3b": 1_000_000,
  "nvidia/nemotron-3-ultra-550b-a55b": 256_000,
  "moonshotai/kimi-k2.6": 256_000,
  "z-ai/glm-5.2": 200_000,
  "minimaxai/minimax-m3": 128_000,
  "mistralai/mistral-medium-3.5-128b": 128_000,
  "deepseek-ai/deepseek-v4-pro": 128_000,
  "nvidia/ising-calibration-1.5-31b": 128_000,
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning": 128_000,
  "thinkingmachines/inkling": 64_000,
  "poolside/laguna-xs-2.1": 64_000,
  "meta/llama-3.3-70b-instruct": 128_000,
};

export function contextWindowOf(ref: ModelRef): number {
  return CONTEXT_WINDOW[ref.model] ?? 32_000;
}

/**
 * Modelos reasoning adicionales disponibles en NVIDIA que no forman parte de
 * las cadenas base pero se usan para verificación cruzada y arbitraje.
 */
export const REASONING_POOL: ModelRef[] = [
  {
    provider: "nvidia",
    model: "nvidia/nemotron-3.5-lightning-30b-a3b",
    maxTokens: 16384,
    thinking: true,
    reasoningBudget: 16384,
  },
  {
    provider: "nvidia",
    model: "nvidia/nemotron-3-ultra-550b-a55b",
    maxTokens: 16384,
    thinking: true,
    reasoningBudget: 16384,
  },
  {
    provider: "nvidia",
    model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    maxTokens: 16384,
    reasoningBudget: 16384,
  },
  { provider: "nvidia", model: "mistralai/mistral-medium-3.5-128b", maxTokens: 16384, reasoningEffort: "high" },
  { provider: "nvidia", model: "nvidia/ising-calibration-1.5-31b", maxTokens: 16384 },
];

/** Cadena barata usada para clasificar intención/complejidad y armar handoffs. */
export const FAST_CHAIN: ModelRef[] = [
  { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 2048 },
  { provider: "nvidia", model: "thinkingmachines/inkling", maxTokens: 2048 },
  { provider: "nvidia", model: "meta/llama-3.3-70b-instruct", maxTokens: 2048 },
];

/**
 * Reordena una cadena según la complejidad de la tarea, sin perder ningún
 * modelo: los descartados del frente quedan igual como fallback más atrás.
 */
export function orderChainBySpeed(chain: ModelRef[], mode: "fast" | "deep"): ModelRef[] {
  const rank: Record<Speed, number> =
    mode === "fast" ? { fast: 0, balanced: 1, reasoning: 2 } : { reasoning: 0, balanced: 1, fast: 2 };
  return [...chain]
    .map((ref, index) => ({ ref, index }))
    .sort((a, b) => rank[speedOf(a.ref)] - rank[speedOf(b.ref)] || a.index - b.index)
    .map((entry) => entry.ref);
}

/** Cadena para tareas profundas: reasoning pool primero, luego la cadena base. */
export function deepChain(chain: ModelRef[]): ModelRef[] {
  const seen = new Set<string>();
  const out: ModelRef[] = [];
  for (const ref of [...REASONING_POOL, ...orderChainBySpeed(chain, "deep")]) {
    if (seen.has(ref.model)) continue;
    seen.add(ref.model);
    out.push(ref);
  }
  return out;
}

// 
// MODEL_TIERS — cadenas por nivel del clasificador
// 

export const MODEL_TIERS: Record<string, ModelRef[]> = {
  fast: [
    {
      provider: "nvidia",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      maxTokens: 16384,
      thinking: true,
      reasoningBudget: 16384,
    },
    { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 4096, seed: 42 },
    { provider: "nvidia", model: "meta/llama-3.3-70b-instruct", maxTokens: 4096 },
    { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 4096 },
  ],
  context_locked: [
    {
      provider: "nvidia",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      maxTokens: 16384,
      thinking: true,
      reasoningBudget: 16384,
    },
    { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 8192 },
    { provider: "nvidia", model: "thinkingmachines/inkling", maxTokens: 8192 },
    { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 8192, seed: 42 },
  ],
  quant_senior: [
    {
      provider: "nvidia",
      model: "nvidia/nemotron-3.5-lightning-30b-a3b",
      maxTokens: 16384,
      thinking: true,
      reasoningBudget: 16384,
    },
    { provider: "nvidia", model: "minimaxai/minimax-m3", maxTokens: 8192 },
    { provider: "nvidia", model: "thinkingmachines/inkling", maxTokens: 8192 },
    { provider: "nvidia", model: "z-ai/glm-5.2", maxTokens: 8192, seed: 42 },
  ],
};
