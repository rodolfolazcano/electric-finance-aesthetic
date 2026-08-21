// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TAVILY_API_KEY =
  process.env.TAVILY_API_KEY ?? "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";
const TAVILY_API = "https://api.tavily.com/search";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  publishedDate?: string;
}

export interface TavilyResponse {
  results: TavilyResult[];
  query: string;
  answer?: string;
  totalResults: number;
}

export const searchTavily = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      query: z.string().min(3).max(500),
      maxResults: z.number().min(1).max(20).default(8),
      includeAnswer: z.boolean().default(true),
      searchDepth: z.enum(["basic", "advanced"]).default("advanced"),
      topic: z.enum(["general", "news"]).default("news"),
      daysBack: z.number().min(1).max(30).default(7),
    }),
  )
  .handler(async ({ data }) => {
    try {
      const res = await fetch(TAVILY_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query: data.query,
          max_results: data.maxResults,
          include_answer: data.includeAnswer,
          search_depth: data.searchDepth,
          topic: data.topic,
          days: data.daysBack,
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return {
          results: [],
          query: data.query,
          totalResults: 0,
          error: `Tavily error: ${res.status} — ${err}`,
        };
      }
      const json = await res.json();
      return {
        results: (json.results ?? []).map((r: any) => ({
          title: r.title ?? "",
          url: r.url ?? "",
          content: r.content ?? "",
          score: r.score ?? 0,
          publishedDate: r.published_date ?? r.publishedDate,
        })),
        query: data.query,
        answer: json.answer,
        totalResults: json.results?.length ?? 0,
      } as TavilyResponse;
    } catch (e: any) {
      return { results: [], query: data.query, totalResults: 0, error: e.message };
    }
  });
