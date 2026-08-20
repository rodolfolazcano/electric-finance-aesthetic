import { createFileRoute } from "@tanstack/react-router";
import { llamarModelo } from "@/lib/agents/orquestador";
import { NVIDIA_API_KEY } from "@/lib/agents/nvidia-key";
import { MODELO_POR_DEFECTO } from "@/lib/model-registry";
import { construirPromptSkills } from "@/lib/skills";

const PROMPT = `Sos IA, asistente del mercado de capitales argentino, el agente virtual del sitio de Cintia Boos (Agente Productora CNV, Mat. N° 2192).

Tu tarea ahora NO es responder: es GENERAR preguntas. Un visitante acaba de pasar el mouse sobre una sección de la página del sitio. Para que la conversación continúe con criterio, razoná sobre el contenido REAL de esa sección que recibís a continuación y proponé 3 preguntas que el visitante tendría sentido hacerte.

Reglas:
- Cada pregunta debe estar anclada al contenido concreto de la sección (servicios, instrumentos, brokers, FAQs, alianzas, perfil de riesgo u oferta de Cintia), no a genéricos.
- También podés sugerir preguntas que conecten esa sección con datos de mercado que el asistente puede buscar en tiempo real (dólar, plazo fijo, UVA, caución, noticias) cuando tenga sentido.
- Preguntas cortas, naturales, en español rioplatense con voseo, como las haría un cliente real.
- NO inventes personas, servicios, matrículas, brokers ni datos que no estén en el contenido provisto.
- No repitas la misma pregunta dos veces.
- Respondé ÚNICAMENTE con un array JSON de strings, sin texto fuera del JSON.`;

function extraerPreguntas(texto: string, limite = 3): string[] {
  const normalizado = (texto ?? "").trim();
  if (!normalizado) return [];
  let arreglo: unknown = null;
  const inicio = normalizado.indexOf("[");
  const fin = normalizado.lastIndexOf("]");
  if (inicio !== -1 && fin > inicio) {
    try {
      arreglo = JSON.parse(normalizado.slice(inicio, fin + 1));
    } catch {
      arreglo = null;
    }
  }
  if (!Array.isArray(arreglo)) {
    const lineas = normalizado
      .split(/\n+/)
      .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter((l) => l.length > 8 && l.length <= 220);
    return lineas.slice(0, limite);
  }
  const preguntas = arreglo
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter((p) => p.length > 5 && p.length <= 220);
  return Array.from(new Set(preguntas)).slice(0, limite);
}

export const Route = createFileRoute("/api/sugerencias")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let seccion = "";
        let contenido = "";
        try {
          const body = (await request.json()) as { seccion?: string; contenido?: string };
          seccion = String(body?.seccion ?? "").trim().slice(0, 80);
          contenido = String(body?.contenido ?? "").trim().slice(0, 8000);
        } catch {
          return Response.json({ preguntas: [] as string[] }, { status: 400 });
        }
        if (!contenido) return Response.json({ preguntas: [] as string[] });

        const skills = construirPromptSkills(MODELO_POR_DEFECTO.skills);
        const mensajes = [
          { role: "system", content: PROMPT },
          ...(skills ? [{ role: "system" as const, content: skills }] : []),
          {
            role: "user" as const,
            content: `Sección: ${seccion || "sección del sitio"}\n\n${contenido}`,
          },
        ];

        const res = await llamarModelo(NVIDIA_API_KEY, MODELO_POR_DEFECTO.id, mensajes, null, {
          maxTokens: 512,
        });
        if (!res.ok) return Response.json({ preguntas: [] as string[] }, { status: res.status });
        const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
        const texto = data.choices?.[0]?.message?.content ?? "";
        return Response.json({ preguntas: extraerPreguntas(texto) });
      },
    },
  },
});