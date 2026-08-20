import { createFileRoute } from "@tanstack/react-router";
import { buscar, type Result } from "@/lib/search.server";

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let query = "";
        try {
          const body = (await request.json()) as { query?: string };
          query = (body.query ?? "").trim().slice(0, 300);
        } catch {
          return Response.json({ results: [] as Result[] }, { status: 400 });
        }
        if (!query) return Response.json({ results: [] as Result[] });
        return Response.json({ results: await buscar(query) });
      },
    },
  },
});
