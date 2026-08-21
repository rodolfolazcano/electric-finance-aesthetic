// Clasificador de intención. Modelo barato, 1 call, sin tools.
// Decide nivel (fast / context_locked / quant_senior) y qué necesita.

import { resilientJson } from "./providers.server";
import { FAST_CHAIN } from "./model-catalog";

export type Clasificacion = {
  nivel: "fast" | "context_locked" | "quant_senior";
  requiere_exploracion_nueva: boolean;
  requiere_web: boolean;
  requiere_supabase_pdf: boolean;
  requiere_edicion_archivos: boolean;
  razon: string;
};

const CLASSIFIER_SYSTEM = `Sos un clasificador de intención. NO respondas la pregunta del usuario.
Devolvé SOLO un JSON, sin texto adicional:

{
  "nivel": "fast" | "context_locked" | "quant_senior",
  "requiere_exploracion_nueva": true | false,
  "requiere_web": true | false,
  "requiere_supabase_pdf": true | false,
  "requiere_edicion_archivos": true | false,
  "razon": "una frase"
}

CRITERIOS:
- "fast": saludo, pregunta puntual respondible con contexto ya existente,
  exploración inicial liviana (listar archivos, leer un archivo corto).
- "context_locked": el usuario pide iterar sobre algo YA explorado en este turno/sesión
  (editar el mismo archivo, correr de nuevo el mismo script, aclarar el mismo dato).
  Si ya existe contexto cargado, requiere_exploracion_nueva = false.
- "quant_senior": pide análisis financiero, detección de incoherencias, comparación
  UI vs motor de cálculo, recomendación de inversión, cruce de múltiples fuentes,
  lectura de metodología (Murphy, Amat) para fundamentar un juicio.

Si hay DUDA entre niveles, elegí el nivel más alto.`;

export function heuristicClassify(message: string, tieneContexto: boolean): Clasificacion {
  const m = message.toLowerCase();
  const palabrasFin = ["tir", "paridad", "duration", "convexity", "beta", "r2",
    "incoherencia", "inversi", "recomendaci", "renta fija", "renta variable",
    "portfolio", "cartera", "acci", "bono", "cedear", "metodologia", "murphy",
    "amat", "analisis fundamental", "analisis intermarket", "ui", "interfaz",
    "calculo", "recalcular", "flujo de fondo", "tir ", "riesgo", "volatilidad"];
  const palabrasEdit = ["edit", "modific", "cambi", "correg", "arregl", "fix",
    "actualiz", "escrib", "crea archivo", "reescrib", "renombr"];
  const palabrasExp = ["list", "mostra", "deci", "hola", "que es", "que hace",
    "donde esta", "busc", "encontr", "decime"];

  const scoreFin = palabrasFin.filter(p => m.includes(p)).length;
  const scoreEdit = palabrasEdit.filter(p => m.includes(p)).length;
  const scoreExp = palabrasExp.filter(p => m.includes(p)).length;

  if (scoreFin >= 2 || m.includes("incoherencia") || m.includes("recomendacion de inversion")) {
    return { nivel: "quant_senior", requiere_exploracion_nueva: true, requiere_web: false, requiere_supabase_pdf: false, requiere_edicion_archivos: false, razon: "heuristica: palabras financieras" };
  }
  if (scoreEdit >= 1) {
    return { nivel: "context_locked", requiere_exploracion_nueva: !tieneContexto, requiere_web: false, requiere_supabase_pdf: false, requiere_edicion_archivos: true, razon: "heuristica: edicion detectada" };
  }
  if (scoreExp >= 2 || m.length < 30) {
    return { nivel: "fast", requiere_exploracion_nueva: true, requiere_web: false, requiere_supabase_pdf: false, requiere_edicion_archivos: false, razon: "heuristica: consulta simple" };
  }
  return { nivel: "context_locked", requiere_exploracion_nueva: !tieneContexto, requiere_web: false, requiere_supabase_pdf: false, requiere_edicion_archivos: false, razon: "heuristica: default" };
}

export async function classifyIntent(
  message: string,
  contextoResumen: string,
): Promise<Clasificacion> {
  // Heuristica rapida primero (0ms, sin modelo)
  const heuristica = heuristicClassify(message, !!contextoResumen);
  // Si la heuristica es concluyente, devolver sin llamar modelo
  if (heuristica.razon.startsWith("heuristica:") && (
    heuristica.nivel === "quant_senior" ||      // palabras financieras claras
    heuristica.nivel === "fast" ||               // consulta simple
    (heuristica.nivel === "context_locked" && heuristica.requiere_edicion_archivos)  // edicion
  )) return heuristica;

  // Solo para casos dudosos, llama al modelo
  try {
    const result = await resilientJson<Clasificacion>(
      FAST_CHAIN,
      [
        { role: "system", content: CLASSIFIER_SYSTEM },
        {
          role: "user",
          content: `CONTEXTO EXISTENTE:\n${contextoResumen.slice(0, 2000) || "(sin contexto)"}\n\nMENSAJE DEL USUARIO:\n${message}`,
        },
      ],
      { maxTokens: 300 } as any,
    );
    return result.value;
  } catch {
    return heuristica;
  }
}
