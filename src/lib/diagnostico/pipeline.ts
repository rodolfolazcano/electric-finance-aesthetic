import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { PortfolioAssetInput, PositionEnriquecida, PipelineContext } from "./types";
import { clasificar } from "./clasificador";
import { getAdapter } from "./adapters/index";
import { agregarPortfolio } from "./agregador";
import type { PortfolioSummary } from "./types";

const AssetInputSchema = z.object({
  id: z.string(),
  ticker: z.string(),
  cantidad: z.number().nonnegative(),
  fuente: z.enum(["IOL", "ArgentinaDatos", "Yahoo"]),
  tipoDeclarado: z.enum(["bono", "on", "letra", "fci", "cedear", "accion", "adr"]).optional(),
});

const PipelineInputSchema = z.object({
  activos: z.array(AssetInputSchema),
  iolToken: z.string().optional(),
  iolRefreshToken: z.string().optional(),
});

export const diagnosticarPortfolio = createServerFn({ method: "POST" })
  .validator((input: unknown) => PipelineInputSchema.parse(input))
  .handler(async ({ data }): Promise<PortfolioSummary> => {
    const inputs = data.activos as PortfolioAssetInput[];
    const ctx: PipelineContext = {
      iolToken: data.iolToken,
      iolRefreshToken: data.iolRefreshToken,
    };

    const clasificaciones = inputs.map((input) => ({
      input,
      clasificacion: clasificar(input),
    }));

    const results = await Promise.allSettled(
      clasificaciones.map(async ({ input, clasificacion }) => {
        const adapter = getAdapter(clasificacion.tipo);
        return adapter.enriquecer(input, clasificacion, ctx);
      }),
    );

    const posiciones: PositionEnriquecida[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") {
        posiciones.push(r.value);
      }
    }

    return agregarPortfolio(posiciones);
  });
