import { createFileRoute } from "@tanstack/react-router";
import { blackScholes, binomial } from "@/lib/opciones-bcba/black-scholes.functions";

export const Route = createFileRoute("/api/opciones/precio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          tipo?: string;
          S?: number;
          K?: number;
          T?: number;
          r?: number;
          sigma?: number;
          q?: number;
          binomial?: boolean;
          pasos?: number;
          americana?: boolean;
        };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "body JSON inválido" }, { status: 400 });
        }
        const tipo = body.tipo === "Put" ? "Put" : "Call";
        const { S, K, T, sigma } = body;
        if (![S, K, T, sigma].every((v) => typeof v === "number" && Number.isFinite(v))) {
          return Response.json(
            { error: "S, K, T y sigma son numéricos obligatorios" },
            { status: 400 },
          );
        }
        const r = typeof body.r === "number" ? body.r : 0.05;
        const q = typeof body.q === "number" ? body.q : 0;
        const greeks = blackScholes(
          tipo,
          S as number,
          K as number,
          T as number,
          r,
          sigma as number,
          q,
        );
        if (!greeks)
          return Response.json(
            { error: "parámetros fuera de dominio (T>0, sigma>0)" },
            { status: 400 },
          );
        const salida: Record<string, unknown> = { tipo, ...greeks };
        if (body.binomial === true) {
          salida.binomialAmericana = binomial(
            tipo,
            S as number,
            K as number,
            T as number,
            r,
            sigma as number,
            Math.min(body.pasos ?? 100, 500),
            q,
            body.americana !== false,
          );
        }
        return Response.json(salida);
      },
    },
  },
});
