import type { MarketNewsItem } from "./market-news.functions";
import type { ArgentinaContext } from "./argentina-context.functions";

export interface EnrichedNewsItem extends MarketNewsItem {
  topicLabel: string | null;
  relevanceScore: number;
  hasLiveMatch: boolean;
}

interface ContextRule {
  topic: string | null;
  keywords: string[];
  weight: number;
  contextFields: Array<keyof ArgentinaContext>;
}

const CONTEXT_RULES: ContextRule[] = [
  {
    topic: "Riesgo país",
    keywords: ["riesgo país", "riesgo-pais", "embi", "jp morgan"],
    weight: 5,
    contextFields: ["riesgoPais"],
  },
  {
    topic: "BCRA",
    keywords: ["bcra", "autoridad monetaria", "política monetaria", "badlar"],
    weight: 4,
    contextFields: ["reservas"],
  },
  {
    topic: "Reservas",
    keywords: ["reservas"],
    weight: 4,
    contextFields: ["reservas"],
  },
  {
    topic: "Tipo de cambio",
    keywords: ["dólar", "dolar", "tipo de cambio", "ccl", "mep", "blue", "brecha"],
    weight: 3,
    contextFields: ["brechaCCLPct", "brechaMEPPct", "dolarOficial"],
  },
  {
    topic: "FMI",
    keywords: ["fmi", "fondo monetario", "staff", "acuerdo fondo", "deuda externa"],
    weight: 3,
    contextFields: ["riesgoPais"],
  },
  {
    topic: "Gobierno",
    keywords: ["gobierno", "caputo", "milei", "ministerio economía", "medidas económicas"],
    weight: 2,
    contextFields: [],
  },
  {
    topic: null,
    keywords: ["inflación", "inflacion", "precios", "ipc"],
    weight: 2,
    contextFields: [],
  },
];

function topicMatch(text: string): { topicLabel: string | null; weight: number; matchedRule: ContextRule | null } {
  let best: { topicLabel: string | null; weight: number; matchedRule: ContextRule | null } = {
    topicLabel: null,
    weight: 0,
    matchedRule: null,
  };
  for (const rule of CONTEXT_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) {
        if (rule.weight > best.weight) {
          best = { topicLabel: rule.topic, weight: rule.weight, matchedRule: rule };
        }
        break;
      }
    }
  }
  return best;
}

function hasContextValue(ctx: ArgentinaContext, field: keyof ArgentinaContext): boolean {
  const val = ctx[field];
  if (val == null) return false;
  if (typeof val === "object") {
    return Object.values(val as Record<string, unknown>).some((v) => v != null);
  }
  return true;
}

const AR_REGION_SOURCES = new Set(["Ámbito", "Cronista", "Infobae", "BCRA"]);
const AR_RELEVANCE_THRESHOLD = 5;

export function enrichNewsWithContext(
  items: MarketNewsItem[],
  ctx?: ArgentinaContext | null,
): EnrichedNewsItem[] {
  const enriched: EnrichedNewsItem[] = [];

  for (const item of items) {
    const text = (item.title + " " + item.summary).toLowerCase();
    const { topicLabel, weight, matchedRule } = topicMatch(text);

    let region = item.region;
    const relevanceScore = weight;
    if (relevanceScore >= AR_RELEVANCE_THRESHOLD && region === "internacional") {
      region = "argentina";
    }

    const hasLiveMatch =
      ctx != null && matchedRule != null
        ? matchedRule.contextFields.some((f) => hasContextValue(ctx, f))
        : false;

    enriched.push({ ...item, region, topicLabel, relevanceScore, hasLiveMatch });
  }

  enriched.sort((a, b) => {
    const aGroup = a.region === "argentina" ? 0 : 1;
    const bGroup = b.region === "argentina" ? 0 : 1;
    if (aGroup !== bGroup) return aGroup - bGroup;
    if (aGroup === 0) return b.relevanceScore - a.relevanceScore;
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  return enriched;
}
