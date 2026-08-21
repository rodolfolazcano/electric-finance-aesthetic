// Capacidades avanzadas: auditoría de documentos/scripts, ejecución de código
// analítico, validación contra la web y generación de contenido de captación.
// Server-only.
import { AUDIT_CHAIN, CODE_CHAIN, JSON_CHAIN, NARRATIVE_CHAIN, REASONING_CHAIN } from "./model-catalog";
import { resilientChat, resilientJson, type CallAttempt, type ChatMessage } from "./providers.server";
import { BASE_SYSTEM_PROMPT } from "./prompts.server";
import { buildContextBlock, fetchMarketNews, logCalls, type ContextFile } from "./studio.server";

export type Finding = {
  severity: "alta" | "media" | "baja";
  kind: "calculo" | "logica" | "incoherencia" | "dato_faltante" | "riesgo";
  where: string;
  detail: string;
  fix: string;
};

export type AuditResult = {
  summary: string;
  findings: Finding[];
  provider: string;
  model: string;
};

/** Auditoría profunda: errores de cálculo, lógica rota e incoherencias. */
export async function auditContext(input: {
  conversationId?: string | null;
  files: ContextFile[];
  focus?: string | null;
}): Promise<AuditResult> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${BASE_SYSTEM_PROMPT}

TAREA: auditoría técnica. Revisás documentos, planillas y scripts buscando:
- errores de cálculo (sumas, TIR, tasas, prorrateos, conversiones de moneda, capitalización)
- errores de lógica (condiciones invertidas, off-by-one, división por cero, unidades mezcladas, fechas mal ordenadas)
- incoherencias entre documentos (mismo concepto con cifras distintas, totales que no cierran, supuestos contradictorios)
- datos faltantes que invalidan una conclusión

Recalculá vos mismo antes de afirmar que algo está mal. Citá SIEMPRE el archivo y la línea/fila/celda o el fragmento textual. No inventes hallazgos: si todo cierra, devolvés findings vacío.

Devolvés EXCLUSIVAMENTE JSON:
{"summary":"2-4 líneas con el veredicto","findings":[{"severity":"alta|media|baja","kind":"calculo|logica|incoherencia|dato_faltante|riesgo","where":"[archivo] fila/línea/fragmento","detail":"qué está mal y el número correcto recalculado","fix":"cómo corregirlo"}]}`,
    },
    {
      role: "user",
      content: `${input.focus ? `FOCO PEDIDO: ${input.focus}\n\n` : ""}MATERIAL A AUDITAR:\n${buildContextBlock(input.files)}`,
    },
  ];

  const result = await resilientJson<{ summary?: string; findings?: Finding[] }>(
    AUDIT_CHAIN,
    messages,
    { maxTokens: 6000 },
  );
  await logCalls(input.conversationId, "audit", result.attempts);
  return {
    summary: result.value.summary ?? "Auditoría completada.",
    findings: Array.isArray(result.value.findings) ? result.value.findings.slice(0, 40) : [],
    provider: result.provider,
    model: result.model,
  };
}

export type GeneratedCode = {
  code: string;
  explanation: string;
  provider: string;
  model: string;
};

/**
 * Escribe JavaScript puro que se ejecuta en el navegador dentro de un Worker
 * aislado. El código recibe `files` (archivos activos) y usa `log()` / `result`.
 */
export async function writeAnalysisCode(input: {
  conversationId?: string | null;
  request: string;
  files: ContextFile[];
  previousCode?: string | null;
  previousError?: string | null;
}): Promise<GeneratedCode> {
  // Armar muestra de archivos para el prompt: primeros 20K chars total
  const contextBlock = buildContextBlock(input.files);
  const muestra = contextBlock.length > 20000
    ? contextBlock.slice(0, 16000) + "\n\n[... archivos truncados en el prompt, pero en el sandbox TENÉS los archivos COMPLETOS en files[] ...]\n\n" + contextBlock.slice(-4000)
    : contextBlock;

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${BASE_SYSTEM_PROMPT}

TAREA: escribir JavaScript ejecutable para análisis cuantitativo.

ENTORNO DE EJECUCIÓN (Web Worker aislado, sin red, sin DOM):
- Variable disponible: files -> Array<{ name: string, kind: string, text: string }> con los archivos COMPLETOS cargados por el usuario.
- Función disponible: log(...args) para imprimir en consola.
- Función disponible: table(rows) donde rows es un array de objetos, para mostrar tabla.
- Devolvés el valor final con: return <valor>  (el código corre dentro de una función async).
- NO uses fetch, import, require, document ni window: no existen.

REGLAS OBLIGATORIAS:
- LEÉ los datos REALES desde files[].text adentro del código. No hardcodees cifras.
- Si files[0].name termina en .json, parseá con JSON.parse(files[0].text) para obtener los datos completos.
- Si files[0].name termina en .csv, parseá fila por fila con split.
- Recorré los datos con lógica real (for, map, filter, reduce). No asumas estructura que no viste.
- Incluí verificación: recalculá totales, imprimí con log() los pasos intermedios.
- Código completo, sin placeholders, listo para correr.
- Usá return para devolver el resultado final.

Devolvés EXCLUSIVAMENTE JSON: {"explanation":"qué hace el script en 2 líneas","code":"<javascript>"}`,
    },
    {
      role: "user",
      content: `PEDIDO: ${input.request}

ARCHIVOS DISPONIBLES (muestra parcial — en el sandbox los tenés COMPLETOS via files[]):
${muestra}${
        input.previousError
          ? `\n\nEL INTENTO ANTERIOR FALLÓ.\nCódigo:\n${input.previousCode ?? ""}\n\nError:\n${input.previousError}\n\nCorregilo.`
          : ""
      }`,
    },
  ];

  const result = await resilientJson<{ code?: string; explanation?: string }>(
    CODE_CHAIN,
    messages,
    { maxTokens: 6000 },
  );
  await logCalls(input.conversationId, "code", result.attempts);
  if (!result.value.code) throw new Error("El modelo no devolvió código ejecutable");
  return {
    code: result.value.code,
    explanation: result.value.explanation ?? "",
    provider: result.provider,
    model: result.model,
  };
}

/** Interpreta la salida real de la ejecución del código. */
export async function interpretRun(input: {
  conversationId?: string | null;
  request: string;
  code: string;
  logs: string[];
  output: string;
  error?: string | null;
}): Promise<{ text: string; provider: string; model: string }> {
  const result = await resilientChat(
    REASONING_CHAIN,
    [
      {
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}\n\nTAREA: interpretar el resultado real de una ejecución de código. Trabajás SOLO con los números que efectivamente devolvió la corrida. Si hubo error, explicá la causa raíz y cómo arreglarlo. Si el resultado es incoherente con lo pedido, decilo.`,
      },
      {
        role: "user",
        content: `PEDIDO ORIGINAL: ${input.request}\n\nCÓDIGO:\n${input.code.slice(0, 6000)}\n\nCONSOLA:\n${input.logs.join("\n").slice(0, 8000)}\n\nRESULTADO:\n${input.output.slice(0, 8000)}${input.error ? `\n\nERROR:\n${input.error}` : ""}`,
      },
    ],
    { maxTokens: 2000, temperature: 0.25 },
  );
  await logCalls(input.conversationId, "code-interpret", result.attempts);
  return { text: result.value, provider: result.provider, model: result.model };
}

export type ClaimVerdict = {
  claim: string;
  verdict: "respaldado" | "parcial" | "sin_respaldo" | "contradicho";
  reason: string;
  sources: string[];
};

export type ValidationResult = {
  summary: string;
  claims: ClaimVerdict[];
  news: Array<{ title: string; url: string; source: string; snippet?: string }>;
  provider: string;
  model: string;
};

/** Valida afirmaciones del contenido generado contra noticias y los archivos. */
export async function validateContent(input: {
  conversationId?: string | null;
  content: string;
  files: ContextFile[];
  query?: string | null;
}): Promise<ValidationResult> {
  const attempts: CallAttempt[] = [];

  // 1) Extraer afirmaciones verificables + términos de búsqueda.
  const extracted = await resilientJson<{ claims?: string[]; queries?: string[] }>(
    JSON_CHAIN,
    [
      {
        role: "system",
        content:
          'Extraés afirmaciones verificables (datos, cifras, hechos de mercado) de un texto. Devolvés SOLO JSON: {"claims":["..."],"queries":["búsqueda corta para noticias"]}. Máximo 8 claims y 4 queries.',
      },
      { role: "user", content: input.content.slice(0, 12000) },
    ],
    { maxTokens: 1500 },
  );
  attempts.push(...extracted.attempts);

  const queries = (extracted.value.queries ?? []).slice(0, 4);
  if (input.query) queries.unshift(input.query);
  const news = (
    await Promise.all(queries.slice(0, 4).map((q) => fetchMarketNews(q).catch(() => [])))
  ).flat();

  const uniqueNews = Array.from(new Map(news.map((n) => [n.url, n])).values()).slice(0, 12);

  // 2) Contrastar con noticias + archivos cargados.
  const verdicts = await resilientJson<{ summary?: string; claims?: ClaimVerdict[] }>(
    AUDIT_CHAIN,
    [
      {
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}

TAREA: validar afirmaciones. Para cada claim decidís si está respaldado por (a) los archivos cargados o (b) las noticias recuperadas. Si no hay evidencia, es "sin_respaldo": no lo maquilles. Nunca inventes fuentes; usá solo las URLs listadas.

Devolvés SOLO JSON: {"summary":"veredicto general en 2 líneas","claims":[{"claim":"...","verdict":"respaldado|parcial|sin_respaldo|contradicho","reason":"por qué","sources":["url o [archivo]"]}]}`,
      },
      {
        role: "user",
        content: `CONTENIDO:\n${input.content.slice(0, 10000)}\n\nCLAIMS DETECTADOS:\n${(extracted.value.claims ?? []).join("\n")}\n\nNOTICIAS RECUPERADAS:\n${uniqueNews
          .map((n) => `- ${n.title} (${n.source}) ${n.url}\n  ${n.snippet ?? ""}`)
          .join("\n")}\n\nARCHIVOS EN CONTEXTO:\n${buildContextBlock(input.files).slice(0, 10000)}`,
      },
    ],
    { maxTokens: 5000 },
  );
  attempts.push(...verdicts.attempts);
  await logCalls(input.conversationId, "validate", attempts);

  return {
    summary: verdicts.value.summary ?? "Validación completada.",
    claims: Array.isArray(verdicts.value.claims) ? verdicts.value.claims.slice(0, 20) : [],
    news: uniqueNews,
    provider: verdicts.provider,
    model: verdicts.model,
  };
}

export type CampaignPiece = {
  channel: string;
  hook: string;
  body: string;
  cta: string;
  compliance: string;
};

export type CampaignResult = {
  strategy: string;
  pieces: CampaignPiece[];
  provider: string;
  model: string;
};

/** Contenido de captación de nuevos clientes inversores, multicanal. */
export async function generateCampaign(input: {
  conversationId?: string | null;
  brief: string;
  audience?: string | null;
  channels?: string[];
  files: ContextFile[];
}): Promise<CampaignResult> {
  const channels = input.channels?.length
    ? input.channels
    : ["Instagram", "LinkedIn", "WhatsApp", "Email", "Newsletter"];

  const result = await resilientJson<{ strategy?: string; pieces?: CampaignPiece[] }>(
    NARRATIVE_CHAIN,
    [
      {
        role: "system",
        content: `${BASE_SYSTEM_PROMPT}

TAREA: generar contenido de CAPTACIÓN DE NUEVOS CLIENTES INVERSORES.

REGLAS DE CUMPLIMIENTO (obligatorias)
- Prohibido prometer o insinuar rendimientos garantizados.
- Todo número usado sale de los archivos cargados y se cita como [archivo]. Si no hay dato duro, se habla en términos cualitativos.
- Incluir siempre una línea de disclaimer apropiada al canal (riesgo, perfil del inversor, matrícula CNV 2192).
- Español rioplatense, profesional, sin clickbait vacío.

Devolvés SOLO JSON: {"strategy":"ángulo y a quién le habla, 3 líneas","pieces":[{"channel":"...","hook":"primera línea que frena el scroll","body":"cuerpo listo para publicar","cta":"llamado a la acción","compliance":"disclaimer"}]}`,
      },
      {
        role: "user",
        content: `BRIEF: ${input.brief}\nAUDIENCIA: ${input.audience ?? "inversores minoristas argentinos que hoy están en plazo fijo o dólar quieto"}\nCANALES: ${channels.join(", ")}\n\nDATOS DISPONIBLES:\n${buildContextBlock(input.files).slice(0, 12000)}`,
      },
    ],
    { maxTokens: 6000 },
  );
  await logCalls(input.conversationId, "campaign", result.attempts);

  return {
    strategy: result.value.strategy ?? "",
    pieces: Array.isArray(result.value.pieces) ? result.value.pieces.slice(0, 8) : [],
    provider: result.provider,
    model: result.model,
  };
}
