// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "./cache";
import { fetchYahooSearchNews } from "./yahoo-http";

// ─── Tipos ─────────────────────────────────────────────────────

export interface NoticiaAnalizada {
  titulo: string;
  fuente: string;
  url: string;
  fecha: string;
  sentimiento: "positiva" | "neutral" | "negativa";
  peso: number;
  keywordsEncontradas: string[];
}

export interface ScoreNoticias {
  scoreNoticias: number; // -1 .. +1
  noticiasRelevantes: NoticiaAnalizada[];
  resumenTextual: string;
  totalAnalizadas: number;
}

// ─── Clasificador por keywords (español/inglés) ────────────────

interface KeywordRule {
  patron: RegExp;
  sentimiento: "positiva" | "negativa" | "neutral";
  peso: number;
}

// FASE 6: exportado para que src/lib/scoring/noticias.ts (Fase 3) reemplace su
// copia local KEYWORD_RULES_LOCAL en FASE 7 y no haya doble fuente de reglas.
export const KEYWORD_RULES: KeywordRule[] = [
  // Positivas
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

  // Negativas
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

  // Neutras
  { patron: /\banunci(a|ó|o)\b/i, sentimiento: "neutral", peso: 0.2 },
  { patron: /\bpresent(a|ó|o)\b/i, sentimiento: "neutral", peso: 0.1 },
  { patron: /\binform(a|ó|o)\b/i, sentimiento: "neutral", peso: 0.1 },
];

// FASE 6: exportado (idem KEYWORD_RULES) para que noticias.ts use el analizador
// canónico del original en FASE 7.
export function analizarNoticia(titulo: string, fuente: string, url: string, fecha: string): NoticiaAnalizada {
  const encontradas: string[] = [];
  let sentimientoFinal: "positiva" | "neutral" | "negativa" = "neutral";
  let pesoMaximo = 0;

  for (const rule of KEYWORD_RULES) {
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
    fuente,
    url,
    fecha,
    sentimiento: sentimientoFinal,
    peso: pesoMaximo,
    keywordsEncontradas: encontradas,
  };
}

// ─── Provider intercambiable — interfaz para futuro LLM ─────────

export type SentimentProvider = (noticias: NoticiaAnalizada[]) => ScoreNoticias;

export const keywordSentimentProvider: SentimentProvider = (noticias) => {
  let score = 0;
  let ponderacionTotal = 0;

  for (const n of noticias) {
    if (n.sentimiento === "positiva") { score += n.peso; ponderacionTotal += n.peso; }
    else if (n.sentimiento === "negativa") { score -= n.peso; ponderacionTotal += n.peso; }
    // neutras no aportan al score
  }

  const scoreFinal = ponderacionTotal > 0
    ? Math.max(-1, Math.min(1, score / ponderacionTotal))
    : 0;

  const positivas = noticias.filter((n) => n.sentimiento === "positiva").length;
  const negativas = noticias.filter((n) => n.sentimiento === "negativa").length;
  const neutras = noticias.length - positivas - negativas;

  let resumen: string;
  if (noticias.length === 0) {
    resumen = "Sin noticias relevantes en las últimas 72hs";
  } else if (positivas > negativas && positivas >= 2) {
    resumen = `${positivas} noticias positivas (${negativas} negativas, ${neutras} neutras) — tono general favorable`;
  } else if (negativas > positivas && negativas >= 2) {
    resumen = `${negativas} noticias negativas (${positivas} positivas, ${neutras} neutras) — tono general desfavorable`;
  } else {
    resumen = `${noticias.length} noticias encontradas (${positivas} positivas, ${negativas} negativas, ${neutras} neutras) — tono mixto o sin señales claras`;
  }

  return {
    scoreNoticias: Math.round(scoreFinal * 100) / 100,
    noticiasRelevantes: noticias,
    resumenTextual: resumen,
    totalAnalizadas: noticias.length,
  };
};

// ─── Función principal (usa keyword provider por defecto) ───────

export async function getNoticiasPorTicker(
  simbolo: string,
  empresaNombre?: string,
  provider: SentimentProvider = keywordSentimentProvider,
): Promise<ScoreNoticias> {
  try {
    const news = await fetchYahooSearchNews(simbolo, 8);

    // Filtrar últimas 72hs
    const hace72hs = Date.now() - 72 * 60 * 60 * 1000;
    const recientes = news.filter((n) => n.providerPublishTime * 1000 >= hace72hs);

    if (recientes.length === 0) {
      return {
        scoreNoticias: 0,
        noticiasRelevantes: [],
        resumenTextual: "Sin noticias relevantes en las últimas 72hs",
        totalAnalizadas: 0,
      };
    }

    const analizadas: NoticiaAnalizada[] = recientes.map((n) =>
      analizarNoticia(
        n.title,
        n.publisher ?? "Yahoo Finance",
        n.link,
        new Date(n.providerPublishTime * 1000).toISOString(),
      ),
    );

    return provider(analizadas);
  } catch {
    return {
      scoreNoticias: 0,
      noticiasRelevantes: [],
      resumenTextual: "Error al obtener noticias — score neutral",
      totalAnalizadas: 0,
    };
  }
}

// ─── Server function con cache ──────────────────────────────────

import { z } from "zod";

export const getNoticiasConCache = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ simbolo: z.string().min(1), empresaNombre: z.string().optional() }).parse(input),
  )
  .handler(async ({ data }): Promise<ScoreNoticias> => {
    const CACHE_KEY = `news-score-${data.simbolo}`;
    const cached = getCached<ScoreNoticias>(CACHE_KEY, 15 * 60 * 1000);
    if (cached) return cached;

    const result = await getNoticiasPorTicker(data.simbolo, data.empresaNombre);
    setCache(CACHE_KEY, result);
    return result;
  });
