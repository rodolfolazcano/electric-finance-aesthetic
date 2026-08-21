import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Búsqueda web gratuita (DuckDuckGo → Wikipedia). */
export const webSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ query: z.string().min(2), limit: z.number().min(1).max(10).default(6) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const { searchWeb } = await import("./web.server");
      return { ok: true as const, results: await searchWeb(data.query, data.limit) };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "No se pudo buscar en la web",
      };
    }
  });

/** Lee una URL y devuelve texto limpio para guardarlo como fuente de contexto. */
export const webRead = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ url: z.string().url() }).parse(input))
  .handler(async ({ data }) => {
    try {
      const { readWebPage } = await import("./web.server");
      return { ok: true as const, text: await readWebPage(data.url) };
    } catch (error) {
      return {
        ok: false as const,
        error: error instanceof Error ? error.message : "No se pudo leer la página",
      };
    }
  });
