import { createFileRoute } from "@tanstack/react-router";
import { ejecutarPrediccion } from "@/lib/opciones-bcba/prediccion.functions";
import { obtenerVelas } from "@/lib/opciones-bcba/datos.functions";

export const Route = createFileRoute("/api/prediccion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { simbolo?: string; horizonte?: number };
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        const simbolo = String(body.simbolo ?? "GGAL")
          .toUpperCase()
          .replace(/[^A-Z0-9.]/g, "")
          .slice(0, 14);
        const horizonte =
          typeof body.horizonte === "number" && body.horizonte >= 1 && body.horizonte <= 60
            ? Math.floor(body.horizonte)
            : 5;

        const subyacente = await obtenerVelas(
          simbolo.endsWith(".BA") ? simbolo : `${simbolo}.BA`,
          "2y",
        );
        if (!subyacente.ok || subyacente.velas.length < 120) {
          return Response.json(
            {
              error: `Sin historial suficiente para ${simbolo}`,
              detalle: subyacente.error,
              velas: subyacente.velas.length,
            },
            { status: 404 },
          );
        }

        const resultado = ejecutarPrediccion(subyacente.velas, simbolo, horizonte);
        if (resultado.error) {
          return Response.json(resultado, { status: 400 });
        }
        return Response.json({
          ...resultado,
          spot: Number((subyacente.spot ?? 0).toFixed(2)),
          velasAnalizadas: subyacente.velas.length,
          disclaimer:
            "Modelo estadístico con datos históricos. Probabilidad no es certeza; walk-forward bajo (<55%) indica ausencia de ventaja verificable.",
        });
      },
    },
  },
});
