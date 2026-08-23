/**
 * Nemo Retriever adapter — RAG inteligente para electric-finance-aesthetic
 * Skills: rag-blueprint, nemo-retriever, nemotron-retrieval-recipes
 *
 * Envuelve la base existente (buscarEnBase / buscarAcademico) con:
 * - hybrid search (BM25-like + embedding rerank simulado)
 * - topK tuning
 * - query rewriting
 */

import { buscarEnBase } from "@/lib/knowledge-base";
import { buscarAcademico } from "@/lib/kb-academic";
import { instrumentTool, recordEvent, getCurrentScope } from "@/lib/nemo-relay";

export type RetrieverOpts = {
  topK?: number;
  enableRerank?: boolean;
  enableQueryRewrite?: boolean;
  baseUrl?: string;
};

function rewriteQuery(q: string): string {
  // Regla simple rag-blueprint/query-and-conversation: expandir acrónimos financieros
  const map: Record<string, string> = {
    "caucion": "caución bursátil tasa",
    "mep": "dólar MEP bolsa",
    "ccl": "dólar CCL contado con liquidación",
    "cedear": "CEDEAR certificado depósito argentino",
    "fcI": "FCI fondo común inversión",
  };
  let r = q;
  for (const [k, v] of Object.entries(map)) {
    if (new RegExp(`\\b${k}\\b`, "i").test(r)) r += ` ${v}`;
  }
  return r;
}

function scoreRelevance(text: string, query: string): number {
  const qTokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  const t = text.toLowerCase();
  let s = 0;
  for (const tok of qTokens) if (t.includes(tok)) s += 1;
  // bonus por categoría académica
  if (text.includes("pág.")) s += 0.5;
  if (text.includes("CNV") || text.includes("BCRA")) s += 0.3;
  return s / Math.max(qTokens.length, 1);
}

export async function retrieveHybrid(query: string, opts: RetrieverOpts = {}) {
  const topK = opts.topK ?? 6;
  const enableRerank = opts.enableRerank ?? true;
  const q = opts.enableQueryRewrite ? rewriteQuery(query) : query;
  const scope = getCurrentScope();

  const [sitio, academico] = await Promise.all([
    instrumentTool("nemo_retriever:site", () => buscarEnBase(q), { scopeName: "retriever:site" }),
    instrumentTool("nemo_retriever:academic", () => buscarAcademico(q, 8, opts.baseUrl), { scopeName: "retriever:academic" }),
  ]);

  const combined = [...sitio, ...academico].map((r: any) => ({
    ...r,
    _score: scoreRelevance(r.texto ?? "", query),
  }));

  if (enableRerank) {
    combined.sort((a, b) => b._score - a._score);
  }

  const top = combined.slice(0, topK);
  if (scope) {
    recordEvent({
      scopeId: scope.id,
      scopeName: scope.name,
      kind: "adaptive",
      name: "retriever:hybrid",
      status: "success",
      payload: { query, rewritten: q, topK, returned: top.length, scores: top.map((x: any) => x._score.toFixed(2)) },
    });
  }
  return top;
}
