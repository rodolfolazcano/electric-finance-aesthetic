/**
 * Registro de modelos disponibles para el asistente IA.
 *
 * Seleccionados del catálogo público de NVIDIA (build.nvidia.com) descartando
 * los modelos deprecated. Cada modelo define su categoría, una mini descripción
 * de las tareas que orquesta y las skills oficiales que se le inyectan.
 *
 * Categorías:
 * - "rapidez":      entienden instrucciones rápido y responden directo.
 * - "razonamiento": análisis profundo, valoración y respuestas complejas.
 */

export type ModelCategory = "rapidez" | "razonamiento";

export type AgentModel = {
  /** ID que se envía a la API de NVIDIA (chat completions). */
  id: string;
  /** Nombre corto para mostrar en el dropdown. */
  nombre: string;
  /** Editorial / publisher del modelo. */
  editor: string;
  categoria: ModelCategory;
  /** Mini descripción de las tareas que realiza. */
  descripcion: string;
  /** Skills oficiales replicadas que orquesta este modelo. */
  skills: string[];
  /** Habilita el modo thinking / razonamiento del proveedor. */
  enableThinking: boolean;
  /** Budget de razonamiento (solo cuando enableThinking es true). */
  reasoningBudget?: number;
  /** Puede actuar como agente planner (decide y ejecuta herramientas). */
  puedePlanear: boolean;
  /** Tokens máximos de salida recomendados. */
  maxTokens: number;
};

const RAPIDEZ: AgentModel[] = [
  {
    id: "nvidia/nemotron-3.5-lightning-30b-a3b",
    nombre: "Nemotron Lightning",
    editor: "NVIDIA",
    categoria: "rapidez",
    descripcion:
      "El 30B A3B MoE más rápido del catálogo: sigue instrucciones al toque y resuelve tareas agénticas con alta precisión.",
    skills: ["instruccion-rapida", "redaccion", "herramientas", "analisis-cuantitativo"],
    enableThinking: false,
    puedePlanear: false,
    maxTokens: 2048,
  },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b",
    nombre: "Nemotron Nano 30B",
    editor: "NVIDIA",
    categoria: "rapidez",
    descripcion:
      "Equilibrio velocidad/precisión para chat, tool calling y seguimiento de instrucciones. Es el modelo por defecto.",
    skills: ["instruccion-rapida", "chat", "herramientas", "analisis-cuantitativo"],
    enableThinking: false,
    puedePlanear: false,
    maxTokens: 2048,
  },
  {
    id: "nvidia/nvidia-nemotron-nano-9b-v2",
    nombre: "Nemotron Nano 9B v2",
    editor: "NVIDIA",
    categoria: "rapidez",
    descripcion:
      "SLM híbrido Transformer-Mamba muy eficiente: razonamiento ágil y tareas agénticas ligeras en segundos.",
    skills: ["instruccion-rapida", "razonamiento-ligero", "analisis-cuantitativo"],
    enableThinking: false,
    puedePlanear: false,
    maxTokens: 2048,
  },
  {
    id: "nvidia/llama-3.1-nemotron-nano-8b-v1",
    nombre: "Llama Nemotron Nano 8B",
    editor: "NVIDIA",
    categoria: "rapidez",
    descripcion:
      "Precisión de razonamiento y agente en edge: rápido y confiable para consultas puntuales del día a día.",
    skills: ["instruccion-rapida", "razonamiento-ligero", "analisis-cuantitativo"],
    enableThinking: false,
    puedePlanear: false,
    maxTokens: 2048,
  },
  {
    id: "meta/llama-3.2-3b-instruct",
    nombre: "Llama 3.2 3B",
    editor: "Meta",
    categoria: "rapidez",
    descripcion: "SLM pequeño y veloz para chat, comprensión de lenguaje y preguntas directas.",
    skills: ["instruccion-rapida", "chat", "analisis-cuantitativo"],
    enableThinking: false,
    puedePlanear: false,
    maxTokens: 1024,
  },
  {
    id: "meta/llama-3.1-8b-instruct",
    nombre: "Llama 3.1 8B",
    editor: "Meta",
    categoria: "rapidez",
    descripcion: "Chat veloz con buena comprensión contextual y generación de texto fluida.",
    skills: ["instruccion-rapida", "chat", "analisis-cuantitativo"],
    enableThinking: false,
    puedePlanear: false,
    maxTokens: 1536,
  },
];

const RAZONAMIENTO: AgentModel[] = [
  {
    id: "nvidia/nemotron-3-ultra-550b-a55b",
    nombre: "Nemotron Ultra 550B",
    editor: "NVIDIA",
    categoria: "razonamiento",
    descripcion:
      "Agente de razonamiento con 1M de contexto: planifica, encadena herramientas y analiza en profundidad. Planner por defecto.",
    skills: [
      "razonamiento-profundo",
      "analisis-dcf",
      "portfolio",
      "planificacion",
      "herramientas",
      "analisis-cuantitativo",
    ],
    enableThinking: true,
    reasoningBudget: 16384,
    puedePlanear: true,
    maxTokens: 8192,
  },
  {
    id: "nvidia/nemotron-3-super-120b-a12b",
    nombre: "Nemotron Super 120B",
    editor: "NVIDIA",
    categoria: "razonamiento",
    descripcion:
      "MoE híbrido Mamba-Transformer con 1M de contexto para razonamiento agéntico, planificación y tool calling.",
    skills: [
      "razonamiento-profundo",
      "analisis-dcf",
      "planificacion",
      "herramientas",
      "analisis-cuantitativo",
    ],
    enableThinking: true,
    reasoningBudget: 12288,
    puedePlanear: true,
    maxTokens: 8192,
  },
  {
    id: "openai/gpt-oss-120b",
    nombre: "GPT-OSS 120B",
    editor: "OpenAI",
    categoria: "razonamiento",
    descripcion:
      "MoE de razonamiento para análisis, matemática financiera y tareas de investigación profundas.",
    skills: ["razonamiento-profundo", "analisis-dcf", "portfolio", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 12288,
    puedePlanear: true,
    maxTokens: 8192,
  },
  {
    id: "openai/gpt-oss-20b",
    nombre: "GPT-OSS 20B",
    editor: "OpenAI",
    categoria: "razonamiento",
    descripcion:
      "Razonamiento y matemática eficientes en un MoE compacto; ideal para análisis de datos financieros.",
    skills: ["razonamiento-profundo", "analisis-dcf", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 6144,
  },
  {
    id: "google/gemma-4-31b-it",
    nombre: "Gemma 4 31B",
    editor: "Google",
    categoria: "razonamiento",
    descripcion: "Modelo denso de frontera para razonamiento, workflows agénticos y análisis fino.",
    skills: ["razonamiento-profundo", "planificacion", "herramientas", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 6144,
  },
  {
    id: "meta/llama-3.3-70b-instruct",
    nombre: "Llama 3.3 70B",
    editor: "Meta",
    categoria: "razonamiento",
    descripcion:
      "LLM grande: razonamiento, matemática, conocimiento general y function calling para respuestas completas.",
    skills: ["razonamiento-profundo", "analisis-dcf", "portfolio", "chat", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 6144,
  },
  {
    id: "meta/llama-3.1-70b-instruct",
    nombre: "Llama 3.1 70B",
    editor: "Meta",
    categoria: "razonamiento",
    descripcion: "Conversaciones complejas con contexto superior, razonamiento y generación rica.",
    skills: ["razonamiento-profundo", "analisis-dcf", "chat", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 6144,
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    nombre: "Llama Nemotron Super 49B v1.5",
    editor: "NVIDIA",
    categoria: "razonamiento",
    descripcion:
      "Razonamiento preciso, tool calling y chat con alta eficiencia y muy buena precisión.",
    skills: ["razonamiento-profundo", "herramientas", "planificacion", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 6144,
  },
  {
    id: "mistralai/mistral-nemotron",
    nombre: "Mistral Nemotron",
    editor: "Mistral AI",
    categoria: "razonamiento",
    descripcion:
      "Construido para workflows agénticos: instrucciones, function calling y análisis estructurado.",
    skills: ["razonamiento-profundo", "herramientas", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 6144,
  },
  {
    id: "z-ai/glm-5.2",
    nombre: "GLM 5.2",
    editor: "Z.ai",
    categoria: "razonamiento",
    descripcion:
      "Flagship agéntico: razonamiento de horizonte largo y tareas de análisis extensas.",
    skills: ["razonamiento-profundo", "planificacion", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 8192,
  },
  {
    id: "minimaxai/minimax-m3",
    nombre: "MiniMax M3",
    editor: "MiniMax",
    categoria: "razonamiento",
    descripcion:
      "MoE multimodal con fuerte razonamiento, coding y tool calling para análisis robusto.",
    skills: ["razonamiento-profundo", "herramientas", "analisis-cuantitativo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 6144,
  },
  {
    id: "stepfun-ai/step-3.7-flash",
    nombre: "Step 3.7 Flash",
    editor: "StepFun AI",
    categoria: "razonamiento",
    descripcion:
      "MoE multimodal esparso para razonamiento enterprise, agéntico y tareas de análisis.",
    skills: ["razonamiento-profundo"],
    enableThinking: true,
    reasoningBudget: 8192,
    puedePlanear: true,
    maxTokens: 6144,
  },
];

/** Modelos internos usados por el sistema (fuera del selector de chat). */
export const MODELOS_INTERNOS = {
  EMBEDDINGS: "nvidia/nemotron-3-embed-1b",
} as const;

/** Todos los modelos disponibles para el usuario. */
export const MODELOS_DISPONIBLES: AgentModel[] = [...RAPIDEZ, ...RAZONAMIENTO];

export const MODELO_POR_DEFECTO: AgentModel = RAPIDEZ[1]!; // nemotron-3-nano-30b-a3b

export const MODELO_PLANNER_POR_DEFECTO: AgentModel = RAZONAMIENTO[0]!; // nemotron-3-ultra-550b-a55b

const POR_ID = new Map(MODELOS_DISPONIBLES.map((m) => [m.id, m]));

export function obtenerModelo(id: string | undefined): AgentModel {
  if (id) {
    const m = POR_ID.get(id);
    if (m) return m;
  }
  return MODELO_POR_DEFECTO;
}

export function obtenerModelosPorCategoria(categoria: ModelCategory): AgentModel[] {
  return MODELOS_DISPONIBLES.filter((m) => m.categoria === categoria);
}

export const CATEGORIA_RAPIDEZ_LABEL = "Rapidez · Instrucciones";
export const CATEGORIA_RAZONAMIENTO_LABEL = "Razonamiento · Análisis";
