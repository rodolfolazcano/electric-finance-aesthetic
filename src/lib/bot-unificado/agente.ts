/**
 * Agente de razonamiento headless del Bot Unificado.
 *
 * Usa EXACTAMENTE el mismo stack del chat lateral: modelos NVIDIA NIM del
 * registry, `llamarModelo` + `ejecutarTool` del orquestador multi-agente y las
 * skills académicas del corpus (Pascale, Labadie, Elbaum...). El cuant produce
 * candidatos; este agente los valida con metodología + herramientas reales y
 * redacta las señales finales.
 */

import { NVIDIA_API_KEY } from "@/lib/agents/nvidia-key";
import { ejecutarTool, llamarModelo } from "@/lib/agents/orquestador";
import { MODELO_PLANNER_POR_DEFECTO } from "@/lib/model-registry";
import { construirPromptSkills } from "@/lib/skills";
import type { CandidatoSenal, SenalFinal } from "./tipos";

const HERRAMIENTAS_BOT = [
  "buscar_noticias",
  "consultar_mercado",
  "consultar_base_conocimiento",
  "estadisticas_retornos",
  "datos_financieros",
];

const SKILLS_BOT = [
  "razonamiento-autonomo-financiero",
  "metodo-pascale-valuacion",
  "carteras-elbaum",
  "macro-latam-ciclo",
];

const MAX_ITERACIONES_TOOLS = 4;

function promptSistema(): string {
  const skills = construirPromptSkills(SKILLS_BOT);
  return `Sos el AGENTE ANALISTA DE SEÑALES del bot unificado de CORONAR INVERSIONES (Cintia Boos, CNV Mat. 2192).
Tu trabajo: recibir CANDIDATOS generados por scanners cuantitativos (con métricas reales) y producir la lista final de SEÑALES validadas para acciones BCBA y CEDEARs.

${skills}

PROTOCOLO DE VALIDACIÓN (por cada candidato):
1. Verificá coherencia metodológica usando el corpus académico si hace falta (consultar_base_conocimiento) — no revalides lo obvio.
2. Con noticias: contrastá el candidato contra buscar_noticias(ticker, "hoy") SOLO si el motivo depende de un evento o el movimiento supera ±3%.
3. Descartá candidatos contradichos por los datos o con contexto macro adverso claro; ajustá prob hacia abajo ante ruido.
4. Redactá el MOTIVO final: 1-2 oraciones en español rioplatense, con la cifra clave y la fuente del dato. Nada de relleno.

REGLAS:
- Podés ejecutar herramientas autónomamente sin pedir confirmación (máx ${MAX_ITERACIONES_TOOL_S()} llamadas en total).
- NO inventes precios ni cifras: todo sale de los candidatos o de una tool ejecutada en este turno.
- Señal permitida: COMPRA | COMPRA CON CAUTELA | MANTENER | REDUCIR | VENTA.
- confianza = probabilidad estimada 0.50-0.85.
- Compliance obligatorio al final de cada motivo: nada de promesas; es análisis educativo.

FORMATO DE SALIDA OBLIGATORIO (solo JSON válido, sin texto antes ni después):
{
  "senales": [
    {
      "estrategia": "<id original>",
      "tickerBCBA": "...",
      "tickerUS": "...",
      "senal": "COMPRA|COMPRA CON CAUTELA|MANTENER|REDUCIR|VENTA",
      "precio": <numero o null>,
      "variacion1d": <numero o null>,
      "motivo": "...",
      "nivel": "<texto corto o null>",
      "confianza": <0.50-0.85>,
      "fuente": "<yfinance / noticias RSS / corpus académico>"
    }
  ],
  "resumen": "<1-3 oraciones sobre qué vio el mercado hoy y por qué estas señales>"
}`;
}

function MAX_ITERACIONES_TOOL_S(): string {
  return String(MAX_ITERACIONES_TOOLS);
}

function extraerJson(texto: string): { senales?: any[]; resumen?: string } | null {
  if (!texto) return null;
  const limpio = texto.replace(/```json/gi, "").replace(/```/g, "").trim();
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio === -1 || fin <= inicio) return null;
  try {
    return JSON.parse(limpio.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

/** Conversión determinística de respaldo si el LLM falla o no devuelve JSON. */
function senalesDeterministicas(candidatos: CandidatoSenal[]): SenalFinal[] {
  return candidatos.map((c) => ({
    estrategia: c.estrategia,
    tickerBCBA: c.tickerBCBA,
    tickerUS: c.tickerUS,
    senal: c.direccion === "COMPRA" ? (c.prob >= 0.6 ? "COMPRA" : "COMPRA CON CAUTELA") : c.direccion === "VENTA" ? "VENTA" : "MANTENER",
    precio: c.precio,
    variacion1d: typeof c.metricas.variacionPct === "number" ? c.metricas.variacionPct : null,
    motivo: c.motivo,
    nivel: c.nivel,
    confianza: c.prob,
    fuente: `scanner cuantitativo (${c.estrategia})`,
    validadaPorAgente: false,
  }));
}

export type ResultadoAgente = { senales: SenalFinal[]; resumen: string | null; usoAgente: boolean };

export async function validarYRedactar(candidatos: CandidatoSenal[]): Promise<ResultadoAgente> {
  if (!NVIDIA_API_KEY) return { senales: senalesDeterministicas(candidatos), resumen: null, usoAgente: false };
  const modelo = process.env.BOT_UNIFICADO_MODELO?.trim() || MODELO_PLANNER_POR_DEFECTO.id;
  const mensajes: any[] = [
    { role: "system", content: promptSistema() },
    {
      role: "user",
      content: `Candidatos del ciclo (${new Date().toLocaleString("es-AR")}):\n${JSON.stringify(
        candidatos.map((c) => ({ ...c, metricas: undefined, metricasResumen: c.metricas })),
        null,
        1,
      )}`,
    },
  ];

  try {
    let contenidoFinal = "";
    for (let i = 0; i < MAX_ITERACIONES_TOOLS + 1; i++) {
      const res = await llamarModelo(NVIDIA_API_KEY, modelo, mensajes, HERRAMIENTAS_BOT, {
        maxTokens: 4096,
        enableThinking: MODELO_PLANNER_POR_DEFECTO.enableThinking,
        reasoningBudget: Math.min(12288, MODELO_PLANNER_POR_DEFECTO.reasoningBudget ?? 8192),
      });
      if (!res.ok) break;
      const data = (await res.json()) as { choices?: Array<{ message?: any }> };
      const msg = data.choices?.[0]?.message;
      if (!msg) break;

      const toolCalls: Array<{ id: string; function: { name: string; arguments: string } }> = msg.tool_calls ?? [];
      if (toolCalls.length && i < MAX_ITERACIONES_TOOLS) {
        mensajes.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
        for (const tc of toolCalls.slice(0, 4)) {
          try {
            const out = await ejecutarTool(tc.function.name, tc.function.arguments ?? "{}");
            mensajes.push({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.function.name,
              content: String(out.texto ?? "").slice(0, 5000),
            });
          } catch (e) {
            mensajes.push({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.function.name,
              content: `[tool error] ${e instanceof Error ? e.message : "fallo"}`,
            });
          }
        }
        continue;
      }
      contenidoFinal = String(msg.content ?? "");
      break;
    }

    const parsed = extraerJson(contenidoFinal);
    if (!parsed?.senales?.length) {
      return { senales: senalesDeterministicas(candidatos), resumen: null, usoAgente: false };
    }
    const senales: SenalFinal[] = parsed.senales
      .filter((s) => s && typeof s.tickerBCBA === "string")
      .map((s): SenalFinal => ({
        estrategia: String(s.estrategia ?? "agente"),
        tickerBCBA: String(s.tickerBCBA),
        tickerUS: String(s.tickerUS ?? s.tickerBCBA ?? "").replace(".BA", ""),
        senal: (["COMPRA", "COMPRA CON CAUTELA", "MANTENER", "REDUCIR", "VENTA"].includes(String(s.senal))
          ? String(s.senal)
          : "MANTENER") as SenalFinal["senal"],
        precio: typeof s.precio === "number" ? s.precio : null,
        variacion1d: typeof s.variacion1d === "number" ? s.variacion1d : null,
        motivo: String(s.motivo ?? "").slice(0, 400),
        nivel: s.nivel ? String(s.nivel).slice(0, 200) : null,
        confianza: Math.min(0.85, Math.max(0.5, Number(s.confianza) || 0.52)),
        fuente: String(s.fuente ?? "agente + scanner"),
        validadaPorAgente: true,
      }))
      .slice(0, 12);
    return { senales: senales.length ? senales : senalesDeterministicas(candidatos), resumen: parsed.resumen ? String(parsed.resumen).slice(0, 600) : null, usoAgente: true };
  } catch {
    return { senales: senalesDeterministicas(candidatos), resumen: null, usoAgente: false };
  }
}
