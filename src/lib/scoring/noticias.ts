// FASE 3 — Motor de noticias unificado con fallback Gemini -> keywords.
// Reutiliza la lógica existente sin cambios:
//   - Gemini: clasificarSentimientoNoticias (src/lib/scoring/news-scoring.ts) + sentimientoAScore.
//   - Keywords: keywordSentimentProvider (src/lib/news-scoring.functions.ts) -> ScoreNoticias -1..+1.
// # REVISAR: analizarNoticia/KEYWORD_RULES son privados en news-scoring.functions.ts.
// Bajo la restricción "crear solo noticias.ts" se replica aquí la tabla de regex
// para convertir titulares crudos a NoticiaAnalizada. En FASE 6 exportarlos desde el
// original y borrar la copia KEYWORD_RULES_LOCAL para eliminar la duplicación.

import type { SubScore } from "./types";
import {
  clasificarSentimientoNoticias,
  sentimientoAScore,
  type NewsSentimiento,
} from "./news-scoring";
import { keywordSentimentProvider, type NoticiaAnalizada } from "../news-scoring.functions";

// ─── Clasificador keywords (copia 1:1 de news-scoring.functions.ts:32-65) ───

interface KeywordRule {
  patron: RegExp;
  sentimiento: "positiva" | "negativa" | "neutral";
  peso: number;
}

const KEYWORD_RULES_LOCAL: KeywordRule[] = [
  { patron: /\bb(eat|ati(ó|o)n|aten)\b/i, sentimiento: "positiva", peso: 0.8 },
  { patron: /\bganan(cia|cias)\b/i, sentimiento: "positiva", peso: 0.6 },
  { patron: /\br(e|é)cord(e|es)\b/i, sentimiento: "positiva", peso: 0.5 },
  { patron: /\b(sub(e|i)|aument)(ó|o|rá|ra)\b/i, sentimiento: "positiva", peso: 0.4 },
  { patron: /\bupgrade|mejora\b/i, sentimiento: "positiva", peso: 0.5 },
  { patron: /\bbuyback|recompra\b/i, sentimiento: "positiva", peso: 0.6 },
  { patron: /\bdividend(o|os)\b/i, sentimiento: "positiva", peso: 0.3 },
  { patron: /\blanz(a|ó|amiento)\b/i, sentimiento: "positiva", peso: 0.4 },
  { patron: /\bcrecimient(o|os)\b/i, sentimiento: "positiva", peso: 0.5 },
  { patron: /\boptimismo|confianza\b/i, sentimiento: "positiva", peso: 0.3 },
  { patron: /\bexpansi(ó|o)n\b/i, sentimiento: "positiva", peso: 0.4 },

  { patron: /\bdowngrade|rebaj(a|ó)\b/i, sentimiento: "negativa", peso: 0.7 },
  { patron: /\bdemanda|juicio|mult(a|as)\b/i, sentimiento: "negativa", peso: 0.6 },
  { patron: /\bre(call|tiro|tiró)\b/i, sentimiento: "negativa", peso: 0.8 },
  { patron: /\bp(e|é)rdida(s)?\b/i, sentimiento: "negativa", peso: 0.7 },
  { patron: /\bca(í|i)(da|das?)\b/i, sentimiento: "negativa", peso: 0.5 },
  { patron: /\bdespid(o|os)|recort(e|es)\b/i, sentimiento: "negativa", peso: 0.5 },
  { patron: /\bcorrecci(ó|o)n\b/i, sentimiento: "negativa", peso: 0.4 },
  { patron: /\binvestigaci(ó|o)n\b/i, sentimiento: "negativa", peso: 0.5 },
  { patron: /\bquiebra|bancarrota\b/i, sentimiento: "negativa", peso: 1.0 },
  { patron: /\brescisi(ó|o)n\b/i, sentimiento: "negativa", peso: 0.6 },
  { patron: /\bsanci(ó|o)n\b/i, sentimiento: "negativa", peso: 0.6 },
  { patron: /\bdeuda|endeudamiento\b/i, sentimiento: "negativa", peso: 0.4 },
  { patron: /\binflaci(ó|o)n\b/i, sentimiento: "negativa", peso: 0.3 },

  { patron: /\banunci(a|ó|o)\b/i, sentimiento: "neutral", peso: 0.2 },
  { patron: /\bpresent(a|ó|o)\b/i, sentimiento: "neutral", peso: 0.1 },
  { patron: /\binform(a|ó|o)\b/i, sentimiento: "neutral", peso: 0.1 },
];

function analizarTitular(titulo: string): NoticiaAnalizada {
  const encontradas: string[] = [];
  let sentimientoFinal: "positiva" | "neutral" | "negativa" = "neutral";
  let pesoMaximo = 0;

  for (const rule of KEYWORD_RULES_LOCAL) {
    if (rule.patron.test(titulo)) {
      encontradas.push(rule.patron.source);
      if (rule.peso > pesoMaximo) {
        pesoMaximo = rule.peso;
        sentimientoFinal = rule.sentimiento;
      }
    }
  }

  return {
    titulo,
    fuente: "keywords-regex",
    url: "",
    fecha: "",
    sentimiento: sentimientoFinal,
    peso: pesoMaximo,
    keywordsEncontradas: encontradas,
  };
}

function sentimientoNumerico(s: NewsSentimiento["sentimiento"]): number {
  if (s === "positivo") return 1;
  if (s === "negativo") return -1;
  return 0;
}

export async function calcularScoreNoticias(
  ticker: string,
  titulares: string[],
): Promise<SubScore> {
  try {
    const r = await clasificarSentimientoNoticias(ticker, titulares);
    if (r) {
      const v = sentimientoAScore(r);
      if (v != null) {
        return {
          valor: v,
          detalle: { intensidad: r.intensidad, sentimiento: sentimientoNumerico(r.sentimiento) },
          fuente: "nvidia-nemotron",
          disponible: titulares.length > 0,
        };
      }
    }
  } catch (err) {
    console.error("[noticias] fallback NVIDIA->keywords por excepción:", err);
  }

  const analizadas = titulares.map(analizarTitular);
  const r = keywordSentimentProvider(analizadas);

  const positivas = analizadas.filter((n) => n.sentimiento === "positiva").length;
  const negativas = analizadas.filter((n) => n.sentimiento === "negativa").length;
  const neutras = analizadas.length - positivas - negativas;

  return {
    valor: Math.round(((r.scoreNoticias + 1) / 2) * 10000) / 100,
    raw: r.scoreNoticias,
    detalle: {
      scoreNoticias: r.scoreNoticias,
      totalAnalizadas: r.totalAnalizadas,
      positivas,
      negativas,
      neutras,
    },
    fuente: "keywords-regex",
    disponible: titulares.length > 0,
  };
}
