import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchYahooSearchNews } from "./yahoo-http";

export const searchYahooNews = createServerFn({ method: "GET" })
  .inputValidator((input: { q: string; count?: number }) =>
    z
      .object({ q: z.string().min(1), count: z.number().int().min(1).max(10).default(1) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const news = await fetchYahooSearchNews(data.q, data.count);
    return news.map((n) => ({
      ticker: data.q,
      title: n.title,
      link: n.link,
    }));
  });
