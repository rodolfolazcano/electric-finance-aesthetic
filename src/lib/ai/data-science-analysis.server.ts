/**
 * Data Science Analysis - Procesa resultados de UI, tablas, gráficos
 * y ejecuta análisis profundo con ALIENTELLIGENCE/aidatascientistv2
 *
 * Pipeline: Captura datos UI → Formato estructurado → Model (vision para gráficos)
 *           → Análisis (tendencias, anomalías, correlaciones) → Recomendaciones
 */

import { resilientChat, type ChatMessage, type ChainOptions } from "./providers.server";
import { DATA_SCIENCE_CHAIN, ANALYTICS_CHAIN, chainWithPreference } from "./model-catalog";
import type { ModelPrefs, ModelRef } from "./model-catalog";

export type DataInput = {
  /** Descripción de qué se está analizando */
  description: string;
  /** Datos tabulares: array de objetos */
  data?: Record<string, any>[];
  /** Datos JSON estructurados */
  json?: Record<string, any>;
  /** Base64 o URL de imagen/gráfico capturado */
  imageData?: string;
  /** Mime type de la imagen */
  imageMime?: string;
  /** Contexto adicional: qué busca el usuario */
  userQuestion?: string;
  /** Tipo de análisis requerido */
  analysisType?: "deep" | "quick" | "anomaly" | "trend" | "correlation" | "recommendation";
  /** Si es true, usa el modelo rápido de analytics en vez de data_science */
  quickMode?: boolean;
};

export type AnalysisResult = {
  summary: string;
  keyFindings: string[];
  anomalies?: string[];
  trends?: string[];
  correlations?: string[];
  recommendations?: string[];
  metrics?: Record<string, number | string>;
  rawResponse: string;
  model: string;
};

/**
 * Formatea datos tabulares en texto legible para el modelo
 */
function formatTableData(data: Record<string, any>[]): string {
  if (!data || data.length === 0) return "";
  const rows = data.slice(0, 50); // limita a 50 filas para evitar context overflow
  let csv = "";
  if (rows.length > 0) {
    const headers = Object.keys(rows[0]);
    csv = headers.join("\t") + "\n";
    csv += rows
      .map((row) =>
        headers
          .map((h) => {
            const v = row[h];
            return typeof v === "number" ? v.toFixed(2) : String(v || "");
          })
          .join("\t")
      )
      .join("\n");
  }
  return csv;
}

/**
 * Formatea JSON estructurado de forma legible
 */
function formatJsonData(obj: Record<string, any>): string {
  return JSON.stringify(obj, null, 2);
}

/**
 * Construye el prompt para análisis de datos
 */
function buildDataSciencePrompt(input: DataInput): string {
  let prompt = `Eres un experto en ciencia de datos y análisis financiero.

CONTEXTO: ${input.description}`;

  if (input.userQuestion) {
    prompt += `\n\nPREGUNTA DEL USUARIO: ${input.userQuestion}`;
  }

  if (input.analysisType) {
    prompt += `\n\nTIPO DE ANÁLISIS REQUERIDO: ${input.analysisType}`;
  }

  prompt += "\n\nDATOS A ANALIZAR:";

  if (input.data) {
    prompt += "\n\nTABLA DE DATOS:\n" + formatTableData(input.data);
  }

  if (input.json) {
    prompt += "\n\nDATOS ESTRUCTURADOS:\n" + formatJsonData(input.json);
  }

  if (input.imageData) {
    prompt += "\n\nIMAGEN/GRÁFICO PROPORCIONADO (analizar visualmente)";
  }

  prompt += `\n\nTAREAS:
1. Resume los hallazgos clave en máx 3-5 frases
2. Identifica anomalías, patrones anómalos, valores fuera de rango
3. Detecta tendencias (crecimiento, caída, estabilidad)
4. Calcula correlaciones si hay múltiples series
5. Proporciona 2-3 recomendaciones accionables

FORMATO DE RESPUESTA:
<summary>Resumen ejecutivo (máx 5 frases)</summary>
<findings>Lista de hallazgos clave separados por newline</findings>
<anomalies>Anomalías detectadas o "None"</anomalies>
<trends>Tendencias identificadas o "None"</trends>
<correlations>Correlaciones interesantes o "None"</correlations>
<recommendations>Recomendaciones separadas por newline</recommendations>`;

  return prompt;
}

/**
 * Ejecuta análisis de datos con ALIENTELLIGENCE/aidatascientistv2
 */
export async function analyzeData(
  input: DataInput,
  modelPrefs?: ModelPrefs | null
): Promise<AnalysisResult> {
  const baseChain = input.quickMode ? ANALYTICS_CHAIN : DATA_SCIENCE_CHAIN;
  // Aplicar preferencias de modelo si existen
  const taskPref = input.quickMode ? modelPrefs?.analytics : modelPrefs?.data_science;
  const chain = taskPref 
    ? chainWithPreference(baseChain, taskPref)
    : baseChain;
  
  const prompt = buildDataSciencePrompt(input);

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: prompt,
    },
  ];

  // Si hay imagen, intentar agregar como content adicional (solo para modelos vision)
  // Nota: La mayoría de modelos no soportan multimodal en content array, por lo que
  // incluimos la imagen en el prompt en base64 como fallback
  if (input.imageData && input.imageMime) {
    // Append image info al prompt en lugar de usar content array
    const imagePrompt = `\n\n[IMAGEN ADJUNTA: ${input.imageMime}]\nBase64: ${input.imageData.startsWith("data:") ? input.imageData.split(",")[1] : input.imageData}`;
    messages[0] = {
      role: "user",
      content: prompt + imagePrompt,
    };
  }

  try {
    const opts: ChainOptions = {
      maxTokens: input.quickMode ? 4000 : 8000,
    };
    
    const response = await resilientChat(chain, messages, opts);

    if (!response) {
      return {
        summary: "No se pudo completar el análisis",
        keyFindings: [],
        rawResponse: "",
        model: "unknown",
      };
    }

    // Parsear respuesta estructurada
    const result = parseAnalysisResponse(response.value);

    return {
      ...result,
      rawResponse: response.value,
      model: response.model,
    };
  } catch (error) {
    console.error("Data science analysis failed:", error);
    return {
      summary: `Error en análisis: ${error instanceof Error ? error.message : "unknown"}`,
      keyFindings: [],
      rawResponse: "",
      model: "error",
    };
  }
}

/**
 * Parsea la respuesta estructurada XML-like
 */
function parseAnalysisResponse(response: string): Omit<AnalysisResult, "rawResponse" | "model"> {
  const extract = (tag: string): string[] => {
    const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, "g");
    const matches = response.match(regex);
    if (!matches) return [];
    return matches
      .map((m) => m.replace(new RegExp(`</?${tag}>`, "g"), "").trim())
      .flatMap((m) => (m.includes("\n") ? m.split("\n").map((x) => x.trim()).filter(Boolean) : [m]))
      .filter(Boolean);
  };

  const summaryMatch = response.match(/<summary>([\s\S]*?)<\/summary>/);
  const summary = summaryMatch ? summaryMatch[1].trim() : "";

  return {
    summary: summary || "Análisis completado sin resumen estructurado",
    keyFindings: extract("findings"),
    anomalies: extract("anomalies"),
    trends: extract("trends"),
    correlations: extract("correlations"),
    recommendations: extract("recommendations"),
  };
}

/**
 * Análisis rápido para cuando solo necesitas un sumario
 */
export async function quickAnalytics(
  description: string,
  data: Record<string, any>[],
  question?: string
): Promise<string> {
  const result = await analyzeData(
    {
      description,
      data,
      userQuestion: question,
      analysisType: "quick",
      quickMode: true,
    },
    null
  );
  return result.summary;
}

/**
 * Detecta anomalías en serie de datos
 */
export async function detectAnomalies(
  description: string,
  data: Record<string, any>[],
  metric: string
): Promise<AnalysisResult> {
  return analyzeData(
    {
      description,
      data,
      userQuestion: `¿Hay valores anómalos en la métrica "${metric}"?`,
      analysisType: "anomaly",
    },
    null
  );
}

/**
 * Analiza tendencias en datos temporales
 */
export async function analyzeTrends(
  description: string,
  data: Record<string, any>[],
  metric: string
): Promise<AnalysisResult> {
  return analyzeData(
    {
      description,
      data,
      userQuestion: `Identifica las tendencias en "${metric}"`,
      analysisType: "trend",
    },
    null
  );
}

/**
 * Genera recomendaciones basadas en análisis
 */
export async function generateRecommendations(
  description: string,
  data: Record<string, any>[],
  context?: string
): Promise<string[]> {
  const result = await analyzeData(
    {
      description,
      data,
      userQuestion: context,
      analysisType: "recommendation",
    },
    null
  );
  return result.recommendations ?? [];
}
