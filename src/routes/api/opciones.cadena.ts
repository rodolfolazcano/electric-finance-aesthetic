import { createFileRoute } from "@tanstack/react-router";
import {
  autenticar,
  obtenerCadenaOpciones,
  obtenerTasaCaucion,
} from "@/lib/opciones-bcba/iol";
import { procesarCadena, sesgoVolatilidad } from "@/lib/opciones-bcba/cadena.functions";
import { ewmaVol, volHistorica } from "@/lib/opciones-bcba/black-scholes.functions";
import { obtenerVelas, retornosLog } from "@/lib/opciones-bcba/datos.functions";

export const Route = createFileRoute("/api/opciones/cadena")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { simbolo?: string; conBinomial?: boolean; pasos?: number };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "body JSON inválido" }, { status: 400 });
        }
        const simbolo = String(body.simbolo ?? "GGAL")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 12);
        if (!simbolo) return Response.json({ error: "simbolo requerido" }, { status: 400 });

        const token = await autenticar();
        if (!token) {
          return Response.json(
            { error: "No se pudo autenticar en IOL", iolAutenticado: false },
            { status: 502 },
          );
        }

        const subyacente = await obtenerVelas(`${simbolo}.BA`, "1y");
        if (!subyacente.ok || !subyacente.spot) {
          return Response.json(
            { error: `Sin datos del subyacente ${simbolo}.BA`, detalle: subyacente.error },
            { status: 404 },
          );
        }
        const spot = subyacente.spot;
        const rets = retornosLog(subyacente.velas.map((v) => v.close));
        const vh = volHistorica(rets) ?? 0.35;
        const vd = ewmaVol(rets) ?? vh;

        const tasaRiesgo = await obtenerTasaCaucion(token);
        const cruda = await obtenerCadenaOpciones(token, simbolo);
        const cadena = cruda.length
          ? await procesarCadena(cruda, spot, {
              tasaRiesgo,
              volHistorica: vd,
              pasosBinomial: body.pasos,
              conBinomial: body.conBinomial === true,
            })
          : [];

        const sesgo =
          cadena.length > 0
            ? sesgoVolatilidad(
                cadena.map((o) => ({ tipo: o.tipoOpcion, strike: o.strike, iv: o.iv })),
                spot,
              )
            : null;

        return Response.json({
          simbolo,
          spot: Number(spot.toFixed(2)),
          volatilidadHistorica: Number(vh.toFixed(4)),
          volatilidadDinamica: Number(vd.toFixed(4)),
          tasaCaucion: tasaRiesgo,
          iolAutenticado: true,
          sesgoVolatilidad: sesgo != null ? Number(sesgo.toFixed(2)) : null,
          lecturaSesgo:
            sesgo == null
              ? null
              : sesgo > 10
                ? "Sesgo alcista (puts OTM más caras → cobertura comprada)"
                : sesgo < -10
                  ? "Sesgo bajista (calls OTM más caras)"
                  : "Neutral",
          totalOpciones: cadena.length,
          opciones: cadena,
        });
      },
    },
  },
});
