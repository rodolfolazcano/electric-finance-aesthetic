import { createFileRoute } from "@tanstack/react-router";
import { autenticar, obtenerTasaCaucion } from "@/lib/opciones-bcba/iol";

export const Route = createFileRoute("/api/iol/status")({
  server: {
    handlers: {
      GET: async () => {
        const token = await autenticar();
        if (!token) {
          return Response.json({ disponible: false, autenticado: false }, { status: 200 });
        }
        const tasa = await obtenerTasaCaucion(token);
        return Response.json({ disponible: true, autenticado: true, tasaCaucion: tasa });
      },
    },
  },
});
