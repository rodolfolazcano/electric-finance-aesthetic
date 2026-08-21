// Ruteo por complejidad + verificación cruzada con arbitraje. Server-only.
import {
  AUDIT_CHAIN,
  FAST_CHAIN,
  REASONING_POOL,
  deepChain,
  orderChainBySpeed,
  type ModelRef,
} from "./model-catalog";
import {
  resilientChat,
  resilientJson,
  type CallAttempt,
  type ChatMessage,
} from "./providers.server";

export type Complexity = "simple" | "medium" | "complex";

const HEAVY_RE =
  /\b(analiz|cruz|comparar|comparativa|proyecc|escenario|modelo|valuaci|riesgo|estrateg|informe|research|auditor|calcul|deriv|correlaci|backtest|por qué|porque|explicá por qué|implicanc)\b/i;
const TRIVIAL_RE = /^(hola|gracias|ok|dale|listo|buenas|qué tal|sí|no)\b/i;

/**
 * Clasificación barata de complejidad. No gasta un modelo: heurística sobre
 * longitud, verbos de análisis y volumen de contexto adjunto.
 */
export function classifyComplexity(input: {
  message: string;
  contextChars?: number;
  fileCount?: number;
  historyLength?: number;
}): Complexity {
  const msg = input.message.trim();
  if (TRIVIAL_RE.test(msg) && msg.length < 40) return "simple";

  let score = 0;
  if (msg.length > 220) score += 2;
  else if (msg.length > 90) score += 1;
  if (HEAVY_RE.test(msg)) score += 2;
  if ((input.fileCount ?? 0) >= 2) score += 1;
  if ((input.contextChars ?? 0) > 20_000) score += 1;
  if ((input.historyLength ?? 0) > 8) score += 1;
  if (/\?.*\?/.test(msg)) score += 1;

  if (score >= 4) return "complex";
  if (score >= 2) return "medium";
  return "simple";
}

/** Cadena efectiva a usar según la complejidad detectada. */
export function chainFor(base: ModelRef[], complexity: Complexity): ModelRef[] {
  if (complexity === "simple") return orderChainBySpeed([...FAST_CHAIN, ...base], "fast");
  if (complexity === "complex") return deepChain(base);
  return orderChainBySpeed(base, "deep");
}

// ---------------------------------------------------------------------------
// Doble chequeo: dos modelos independientes + árbitro.
// ---------------------------------------------------------------------------

export type CrossVerification = {
  verdict: "ok" | "corregido" | "conflicto";
  /** Respuesta final consensuada (o corregida por el árbitro). */
  answer: string;
  /** Discrepancias concretas encontradas entre las dos corridas. */
  discrepancies: string[];
  reviewers: string[];
  arbiter?: string;
};

function pick(pool: ModelRef[], exclude: string[], n: number): ModelRef[] {
  return pool.filter((ref) => !exclude.includes(ref.model)).slice(0, n);
}

/**
 * Corre la MISMA consigna en dos modelos reasoning distintos al del autor y,
 * si difieren en hechos o números, un tercer modelo arbitra y produce la
 * versión corregida. Todo en paralelo salvo el arbitraje.
 */
export async function crossVerify(input: {
  conversationId?: string | null;
  task: string;
  /** Prompt de sistema del autor, para que los revisores compartan reglas. */
  system: string;
  question: string;
  /** Respuesta que produjo el modelo autor. */
  draft: string;
  authorModel: string;
  context?: string;
}): Promise<{ result: CrossVerification; attempts: CallAttempt[] }> {
  const reviewers = pick(REASONING_POOL, [input.authorModel], 2);
  const attempts: CallAttempt[] = [];

  const reviewPrompt = (): ChatMessage[] => [
    {
      role: "system",
      content: `${input.system}\n\nSOS UN REVISOR INDEPENDIENTE. Revisás una respuesta ya redactada por otro modelo. Verificás cifras, sumas, fechas, atribución de fuente y afirmaciones causales. NO reescribís por estilo. Devolvés SOLO JSON:\n{"agree":true|false,"errors":["error concreto y verificable"],"corrected":"la respuesta corregida solo si agree=false, si no, cadena vacía"}`,
    },
    {
      role: "user",
      content: `${input.context ? `CONTEXTO:\n${input.context}\n\n` : ""}CONSIGNA DEL USUARIO:\n${input.question}\n\nRESPUESTA A REVISAR:\n${input.draft}`,
    },
  ];

  type Review = { agree?: boolean; errors?: string[]; corrected?: string };

  const runs = await Promise.allSettled(
    reviewers.map((ref) =>
      resilientJson<Review>([ref, ...AUDIT_CHAIN], reviewPrompt(), { maxTokens: 2200 }),
    ),
  );

  const reviews: Array<{ model: string; review: Review }> = [];
  for (const run of runs) {
    if (run.status === "fulfilled") {
      attempts.push(...run.value.attempts);
      reviews.push({ model: run.value.model, review: run.value.value });
    }
  }

  if (!reviews.length) {
    return {
      result: {
        verdict: "ok",
        answer: input.draft,
        discrepancies: [],
        reviewers: [],
      },
      attempts,
    };
  }

  const disagreeing = reviews.filter((r) => r.review.agree === false);
  const discrepancies = disagreeing.flatMap((r) =>
    (r.review.errors ?? []).map((e) => `[${r.model}] ${e}`),
  );

  if (!disagreeing.length || !discrepancies.length) {
    return {
      result: {
        verdict: "ok",
        answer: input.draft,
        discrepancies: [],
        reviewers: reviews.map((r) => r.model),
      },
      attempts,
    };
  }

  // Un solo revisor objeta y trae corrección: la aplicamos sin arbitrar.
  if (disagreeing.length === 1 && reviews.length === 1 && disagreeing[0].review.corrected) {
    return {
      result: {
        verdict: "corregido",
        answer: disagreeing[0].review.corrected,
        discrepancies,
        reviewers: reviews.map((r) => r.model),
      },
      attempts,
    };
  }

  // Arbitraje: modelo distinto a autor y revisores decide la versión final.
  const arbiterChain = [
    ...pick(REASONING_POOL, [input.authorModel, ...reviews.map((r) => r.model)], 1),
    ...AUDIT_CHAIN,
  ];
  try {
    const arbitration = await resilientJson<{ answer?: string; resolved?: boolean }>(
      arbiterChain,
      [
        {
          role: "system",
          content: `${input.system}\n\nSOS EL ÁRBITRO. Recibís una respuesta original y las objeciones de los revisores. Decidís cuáles objeciones son correctas y emitís la versión FINAL. Si un dato no se puede verificar con el contexto, decilo explícitamente en la respuesta en lugar de inventarlo. Devolvés SOLO JSON: {"answer":"respuesta final completa para el usuario","resolved":true|false}`,
        },
        {
          role: "user",
          content: `${input.context ? `CONTEXTO:\n${input.context}\n\n` : ""}CONSIGNA:\n${input.question}\n\nRESPUESTA ORIGINAL:\n${input.draft}\n\nOBJECIONES:\n${discrepancies.join("\n")}\n\nCORRECCIONES PROPUESTAS:\n${disagreeing
            .map((r) => `[${r.model}] ${r.review.corrected ?? "(sin propuesta)"}`)
            .join("\n\n")}`,
        },
      ],
      { maxTokens: 3000 },
    );
    attempts.push(...arbitration.attempts);
    return {
      result: {
        verdict: arbitration.value.resolved === false ? "conflicto" : "corregido",
        answer: arbitration.value.answer?.trim() || input.draft,
        discrepancies,
        reviewers: reviews.map((r) => r.model),
        arbiter: arbitration.model,
      },
      attempts,
    };
  } catch {
    return {
      result: {
        verdict: "conflicto",
        answer: input.draft,
        discrepancies,
        reviewers: reviews.map((r) => r.model),
      },
      attempts,
    };
  }
}

/** Nota corta para mostrarle al usuario qué pasó en la verificación. */
export function verificationNote(v: CrossVerification): string {
  if (v.verdict === "ok") return "";
  const head =
    v.verdict === "corregido"
      ? "Doble chequeo: se corrigieron datos antes de responder."
      : "Doble chequeo: los revisores no llegaron a acuerdo. Tratá estos puntos como no verificados.";
  return `\n\n---\n**${head}**\n${v.discrepancies.map((d) => `- ${d}`).join("\n")}`;
}

/** Chequeo rápido de una sola afirmación (para números sueltos). */
export async function quickFactCheck(claim: string, context: string): Promise<boolean | null> {
  try {
    const res = await resilientChat(
      AUDIT_CHAIN,
      [
        {
          role: "system",
          content:
            'Verificás una afirmación contra un contexto. Respondés una sola palabra: "SI" si el contexto la respalda, "NO" si la contradice, "NA" si no alcanza.',
        },
        { role: "user", content: `CONTEXTO:\n${context.slice(0, 12_000)}\n\nAFIRMACIÓN:\n${claim}` },
      ],
      { maxTokens: 8, temperature: 0 },
    );
    const answer = res.value.trim().toUpperCase();
    if (answer.startsWith("SI")) return true;
    if (answer.startsWith("NO")) return false;
    return null;
  } catch {
    return null;
  }
}