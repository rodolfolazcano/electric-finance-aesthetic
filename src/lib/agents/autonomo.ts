/**
 * Modo Autónomo del agente: planifica, ejecuta y valida una tarea completa
 * hablada en lenguaje natural, sin informes programados ni menús.
 *
 * Flujo:
 * 1. PLANIFICACIÓN: el modelo de razonamiento recibe la meta del usuario más
 *    la jerarquía metodológica (macro → contable → cálculo → valuación →
 *    sectores → cartera → riesgo → renta fija → derivados → cuant → cierre)
 *    y devuelve un plan ordenado de pasos con herramientas concretas.
 * 2. EJECUCIÓN: loop agéntico con TODAS las herramientas registradas
 *    (sin filtro por rol), tool_choice auto, hasta N rondas / M llamadas.
 * 3. VALIDACIÓN: un agente validador re-reasona sobre lo obtenido vs. la meta;
 *    si detecta huecos, reinyecta los pasos faltantes y vuelve a ejecutar.
 * 4. SÍNTESIS: redacción final citando solo datos reales de las tools.
 */

import {
  ejecutarTool,
  llamarModelo,
  type ApiMsg,
  type Enviar,
  type OpcionesOrquestador,
  type ResultadoTurno,
} from "@/lib/agents/orquestador";
import { estadoDeHerramienta, NOMBRE_HERRAMIENTAS } from "@/lib/agents/herramientas";

const MAX_RONDAS_EJECUCION = 14;
const MAX_RONDAS_POST_VALIDACION = 8;
const MAX_TOOL_CALLS = 40;
const MAX_CICLOS_VALIDACION = 2;

/** Detecta pedidos de flujo completo en lenguaje natural (chat UI o Telegram). */
export function esTareaAutonoma(pregunta: string): boolean {
  const p = (pregunta ?? "").toLowerCase();
  return /\b(an[aá]lisis|analisis|informe|reporte|revisi[oó]n|estudio)\s+(completo|completa|integral|total|profundo|exhaustivo|de punta a punta)|\b(todo el|todo un)\s+(flujo|an[aá]lisis|proceso|análisis)|\b(de principio a fin|punta a punta|de arriba abajo)\b|\bmodo\s+(aut[oó]nomo|autonomo|agente)\b|\bhac[eé](me)?\s+todo\b|\bejecut[aá]\s+(todo|el flujo|el an[aá]lisis)\b|\bflujo completo\b|\binvestig[aá].*(fondo|completo)\b|\banaliz[aá].*(completo|integral|a fondo)\b/.test(
    p,
  );
}

const JERARQUIA_METODOLOGICA = `
Jerarquía metodológica del análisis financiero completo (orden recomendado):
F0 Macro: contexto_macro, ciclo_economico
F1-F3 Contable/valuación: analizar_fundamental, calcular_wacc, calcular_dcf, valor_por_metodos, valor_intrinseco_real, ficha_de_decision
F4 Sectores: score_sectorial, analisis_industria, matriz_benchmarks, ranking_valuacion_sectores, performance_sectorial, valuacion_sectorial
F5-F6 Cartera/riesgo: estadisticas_retornos, analizar_riesgo, distribucion_riesgo, analizar_capm, matriz_capm, capm_auto, analizar_factores, optimizar_portafolio, optimizar_cartera_avanzada, backtest_optimizacion, calcular_cobertura
F7 Renta fija: calcular_tir_bono, calcular_ytm_bono, consultar_curva_etti, calcular_stripped_yield, calcular_yield_call, consultar_semaforo_riesgo_bono
F8 Derivados: cadena_opciones_bcba, analizar_opciones_completo, predecir_direccion
F9 Cuantitativo: pairs_trading_labadie, curva_ejecucion_labadie
Transversal datos: consultar_mercado, buscar_noticias, buscar_web, consultar_catalogo, consultar_base_conocimiento, analisis_tecnico, analizar_semaforo
Cierre: generar_informe, grafico_chat, oportunidades_diarias
Operativa (solo si el usuario lo pide explícitamente): iol_login, iol_cuenta, iol_mercado, iol_operar (NUNCA sin confirmación explícita del usuario), telegram_enviar_senal, telegram_enviar_mensaje
`;

const PROMPT_PLANIFICADOR = `Sos el agente autónomo de análisis financiero. El usuario te dio una META en lenguaje natural.
${JERARQUIA_METODOLOGICA}
Devolvé SOLO un objeto JSON válido, sin markdown ni explicaciones:
{"objetivo":"<meta reformulada>","pasos":[{"n":1,"herramienta":"<nombre_exacto>","argumentos":{},"proposito":"<por qué este paso ahora>"}]}
Reglas:
- Ordená los pasos según la jerarquía metodológica (macro primero, operativa/cierre al final).
- Solo pasos que aporten a ESTA meta; entre 3 y 10 pasos.
- Los argumentos deben ser objetos JSON válidos según los parámetros de cada herramienta (ticker/simbolo/query/periodo/rango, etc.). Extraé el activo de la meta del usuario.`;

const PROMPT_AGENTE_AUTONOMO = `Sos el agente autónomo de análisis financiero en modo ejecución. Tenés TODAS las herramientas disponibles.
${JERARQUIA_METODOLOGICA}
Estás ejecutando el plan contra la meta del usuario. Reglas:
- Ejecutá las herramientas necesarias SIN pedir permiso y sin anunciar búsquedas vacías: llamá a la tool y seguí.
- Un paso por herramienta; si una tool falla o devuelve vacío, probá una alternativa equivalente antes de rendirte.
- Cuando ya tenés todos los datos para la meta, dejá de llamar tools y devolvé texto plano con el resumen intermedio de lo obtenido (sin markdown largo, la síntesis final viene después).
- PROHIBIDO inventar cifras: todo número debe venir de un resultado de herramienta de este turno.`;

const PROMPT_VALIDADOR = `Sos el agente VALIDADOR de un sistema multi-agente financiero. Recibís la meta original, el plan y los resultados reales obtenidos por las herramientas.
Tu trabajo es razonar sobre los RESULTADOS (no sobre el plan): verificar consistencia interna (cifras coherentes entre tools, ticker correcto, moneda correcta), completitud respecto a la meta y honestidad (¿algún dato parece placeholder o error de API?).
Devolvé SOLO un objeto JSON válido, sin markdown:
{"completo":true|false,"observaciones":"<hallazgos de validación, máx 400 chars>","faltantes":[{"herramienta":"<nombre_exacto>","argumentos":{},"motivo":"<qué falta validar/completar>"}]}
Si la meta está cubierta con datos reales y consistentes, completo=true y faltantes=[]. No inventes pasos nuevos que no aporten a la meta.`;

type PasoPlan = { n?: number; herramienta?: string; argumentos?: Record<string, unknown>; proposito?: string; motivo?: string };
type PlanAutonomo = { objetivo?: string; pasos?: PasoPlan[] };
type LlamadaEjecutada = { name: string; args: string; ok: boolean; resumen: string };

function extraerJson(texto: string): unknown | null {
  const inicio = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fin + 1));
  } catch {
    return null;
  }
}

function parsearPlan(texto: string): PlanAutonomo {
  const j = extraerJson(texto);
  if (j && typeof j === "object") return j as PlanAutonomo;
  return {};
}

/** Bloquea órdenes reales de IOL sin confirmación explícita del usuario. */
async function protegerOperacionReal(
  name: string,
  argsRaw: string,
  sessionId: string,
  baseUrl: string | undefined,
): Promise<{ texto: string; ok: boolean; bloqueado: boolean } | null> {
  if (name !== "iol_operar") return null;
  let confirmado = false;
  try {
    confirmado = Boolean((JSON.parse(argsRaw) as { confirmar?: boolean }).confirmar);
  } catch {
    /* args inválidos */
  }
  if (confirmado) return null;
  return {
    ok: false,
    bloqueado: true,
    texto:
      "BLOQUEADO por seguridad: iol_operar requiere confirmar:true explícito. No ejecutes la orden; preguntale al usuario una confirmación puntual (activo, cantidad, precio) y esperá su respuesta antes de volver a intentar.",
  };
}

async function respuestaModelo(
  apiKey: string,
  modelId: string,
  messages: ApiMsg[],
  tools: string[] | null,
  maxTokens: number,
  enableThinking: boolean,
  reasoningBudget?: number,
): Promise<{ content: string; tool_calls: Array<{ id: string; name: string; arguments: string }> }> {
  const res = await llamarModelo(apiKey, modelId, messages, tools, {
    maxTokens,
    enableThinking,
    reasoningBudget,
  });
  if (!res.ok) return { content: "", tool_calls: [] };
  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
      };
    }>;
  };
  const msg = data.choices?.[0]?.message;
  return {
    content: msg?.content ?? "",
    tool_calls: (msg?.tool_calls ?? []).map((c, i) => ({
      id: c.id ?? `auto_${i}_${Date.now()}`,
      name: c.function?.name ?? "",
      arguments: c.function?.arguments ?? "{}",
    })),
  };
}

/**
 * Turno autónomo completo: plan → ejecución → validación con razonamiento → síntesis.
 * Misma interfaz de entrada/salida que orquestarTurno (drop-in desde chat y Telegram).
 */
export async function orquestarTurnoAutonomo(opts: OpcionesOrquestador): Promise<ResultadoTurno> {
  const {
    pregunta,
    historial,
    orquestacion,
    apiKey,
    baseUrl,
    enviar,
    siteContext,
    ragMsg,
    sessionId = "anon",
  } = opts;

  const modelo = orquestacion.modeloPlanner;
  const fuentes: ResultadoTurno["fuentes"] = [];
  const ejecutadas: LlamadaEjecutada[] = [];
  let totalCalls = 0;

  // ---------- FASE 1: PLANIFICACIÓN ----------
  const pasoAutonomo = (texto: string) => enviar({ t: "status", v: "autonomo", q: texto });
  pasoAutonomo("Planificando el análisis completo (jerarquía metodológica F0→F10)…");
  const mensajesPlan: ApiMsg[] = [
    { role: "system", content: PROMPT_PLANIFICADOR },
    ...(ragMsg ? [ragMsg] : []),
    ...historial.slice(-4).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `META DEL USUARIO: ${pregunta}` },
  ];
  let plan: PlanAutonomo = {};
  try {
    const rPlan = await respuestaModelo(
      apiKey,
      modelo.id,
      mensajesPlan,
      null,
      Math.min(modelo.maxTokens, 2048),
      modelo.enableThinking,
      modelo.reasoningBudget,
    );
    plan = parsearPlan(rPlan.content);
  } catch {
    plan = {};
  }
  const pasos = (plan.pasos ?? []).filter((p) => p.herramienta && NOMBRE_HERRAMIENTAS.includes(p.herramienta));
  console.log(`[AUTONOMO] objetivo="${(plan.objetivo ?? "").slice(0, 120)}" pasos=${pasos.length}`);

  // ---------- FASE 2: EJECUCIÓN AGÉNTICA ----------
  const guionPlan = pasos.length
    ? `Plan aprobado (${pasos.length} pasos):\n${pasos
        .map((p) => `${p.n ?? "?"}. ${p.herramienta}(${JSON.stringify(p.argumentos ?? {})}) — ${p.proposito ?? ""}`)
        .join("\n")}`
    : "No se pudo pre-planificar: deducí vos los pasos necesarios siguiendo la jerarquía metodológica.";
  const messages: ApiMsg[] = [
    { role: "system", content: PROMPT_AGENTE_AUTONOMO },
    { role: "system", content: siteContext },
    ...(ragMsg ? [ragMsg] : []),
    ...historial.slice(-6).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: `META DEL USUARIO: ${pregunta}\n\n${guionPlan}\n\nComenzá la ejecución ahora.` },
  ];

  const ejecutarRondas = async (maxRondas: number): Promise<void> => {
    for (let ronda = 0; ronda < maxRondas && totalCalls < MAX_TOOL_CALLS; ronda++) {
      let salida;
      try {
        salida = await respuestaModelo(
          apiKey,
          modelo.id,
          messages,
          NOMBRE_HERRAMIENTAS,
          modelo.maxTokens,
          false,
          undefined,
        );
      } catch {
        break;
      }
      if (!salida.tool_calls.length) break;

      const msgAsistente: ApiMsg = {
        role: "assistant",
        content: salida.content ?? "",
        tool_calls: salida.tool_calls.map((c) => ({
          id: c.id,
          function: { name: c.name, arguments: c.arguments },
        })),
      };
      messages.push(msgAsistente);

      for (const call of salida.tool_calls) {
        if (totalCalls >= MAX_TOOL_CALLS) break;
        if (!call.name || !NOMBRE_HERRAMIENTAS.includes(call.name)) {
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: call.name || "desconocida",
            content: "Herramienta inexistente. Usá exactamente uno de los nombres disponibles.",
          });
          continue;
        }
        totalCalls++;
        const idxPaso = Math.min(ejecutadas.length + 1, pasos.length || ejecutadas.length + 1);
        pasoAutonomo(
          `Paso ${idxPaso}${pasos.length ? `/${pasos.length}` : ""}: ejecutando ${call.name}…`,
        );
        enviar({ t: "status", v: estadoDeHerramienta(call.name), q: pregunta.slice(0, 40) });

        const bloqueo = await protegerOperacionReal(call.name, call.arguments, sessionId, baseUrl);
        let resultadoTexto = "";
        let okCall = true;
        if (bloqueo) {
          resultadoTexto = bloqueo.texto;
          okCall = false;
        } else {
          try {
            const ej = await ejecutarTool(call.name, call.arguments, baseUrl, sessionId);
            resultadoTexto = ej.texto;
            okCall = ej.ok;
            fuentes.push(...ej.fuentes);
            if (ej.fuentes.length) enviar({ t: "sources", v: ej.fuentes });
            enviarEventosInternos(enviar, ej.eventos);
          } catch (err) {
            resultadoTexto = `ERROR ejecutando ${call.name}: ${String(err).slice(0, 300)}`;
            okCall = false;
          }
        }
        ejecutadas.push({ name: call.name, args: call.arguments, ok: okCall, resumen: resultadoTexto.slice(0, 600) });
        console.log(`[AUTONOMO][ronda ${ronda}] ${call.name} ok=${okCall}`);
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name: call.name,
          content: `Resultado real de ${call.name}:\n\n${resultadoTexto}`,
        });
      }
      enviar({ t: "status", v: "autonomo", q: `Ronda ${ronda + 1} completa · ${totalCalls} herramientas ejecutadas` });
    }
  };

  await ejecutarRondas(MAX_RONDAS_EJECUCION);

  // ---------- FASE 3: VALIDACIÓN CON RAZONAMIENTO ----------
  const resumenEjecucion = ejecutadas
    .map((e, i) => `${i + 1}. ${e.name}(${e.args.slice(0, 160)}) ok=${e.ok}\n   ↳ ${e.resumen.replace(/\s+/g, " ").slice(0, 420)}`)
    .join("\n");

  for (let ciclo = 0; ciclo < MAX_CICLOS_VALIDACION; ciclo++) {
    pasoAutonomo(`Validando resultados con razonamiento (ciclo ${ciclo + 1}/${MAX_CICLOS_VALIDACION})…`);
    const mensajesValidacion: ApiMsg[] = [
      { role: "system", content: PROMPT_VALIDADOR },
      {
        role: "user",
        content: `META: ${pregunta}\n\nPLAN:\n${guionPlan}\n\nRESULTADOS REALES OBTENIDOS:\n${resumenEjecucion || "(ninguno)"}`,
      },
    ];
    let validacion: { completo?: boolean; observaciones?: string; faltantes?: PasoPlan[] } = {};
    try {
      const rVal = await respuestaModelo(
        apiKey,
        modelo.id,
        mensajesValidacion,
        null,
        Math.min(modelo.maxTokens, 1536),
        modelo.enableThinking,
        modelo.reasoningBudget,
      );
      validacion = (extraerJson(rVal.content) as typeof validacion) ?? {};
    } catch {
      validacion = { completo: true };
    }
    const faltantes = (validacion.faltantes ?? []).filter(
      (f) => f.herramienta && NOMBRE_HERRAMIENTAS.includes(f.herramienta),
    );
    console.log(`[AUTONOMO][validacion ${ciclo + 1}] completo=${Boolean(validacion.completo)} faltantes=${faltantes.length} obs="${(validacion.observaciones ?? "").slice(0, 200)}"`);
    if (validacion.completo || !faltantes.length || totalCalls >= MAX_TOOL_CALLS) break;

    messages.push({
      role: "user",
      content: `El agente validador revisó los resultados y detectó huecos: ${(validacion.observaciones ?? "").slice(0, 400)}
Pasos pendientes obligatorios:
${faltantes.map((f) => `- ${f.herramienta}(${JSON.stringify(f.argumentos ?? {})}) — ${f.motivo ?? ""}`).join("\n")}
Ejecutá estos pasos ahora con las herramientas y continuá.`,
    });
    await ejecutarRondas(MAX_RONDAS_POST_VALIDACION);
  }

  // ---------- FASE 4: SÍNTESIS FINAL ----------
  pasoAutonomo("Redactando informe final con los datos validados…");
  const resumenFinal = ejecutadas
    .map((e, i) => `${i + 1}. [${e.ok ? "OK" : "FALLÓ"}] ${e.name}\nArgs: ${e.args.slice(0, 240)}\nDatos: ${e.resumen}`)
    .join("\n\n");
  const mensajesSintesis: ApiMsg[] = [
    {
      role: "system",
      content:
        "Sos el redactor final del análisis financiero en MODO AUTOMÁTICO. Recibís la meta del usuario (en lenguaje natural humano) y los datos REALES obtenidos por las herramientas orquestadas autónomamente (ya validados por un agente validador). Razonás la instrucción como humano: inferís intención, activo, horizonte y preguntas implícitas. Asumís el rol de la base de conocimiento (55 PDFs Pascale/Fowler Newton/Dumrauf/Blanchard/Biondi + corpus Labadie + regulación CNV/BCRA) y sabés qué rol asignarte (Mercado/Valoración/Semáforo/Cuantitativo/Conocimiento/Motor Unificado) según la instrucción; si hay múltiples capas, orquestás y citás todas. Redactás la respuesta definitiva en español rioplatense, formato markdown de chat: directo, con cifras citadas tal cual fueron obtenidas, señalando explícitamente qué falló o no pudo obtenerse (honestidad ante todo). Estructura: contexto macro breve → datos clave del activo/tema → valuación/cuantitativo si corresponde → riesgos → conclusión práctica y próximo paso. Al cierre, proponé SIEMPRE 2-3 instrucciones siguientes inteligentes en lenguaje natural humano como sugerencias (ej. '¿Querés que lo compare con YPF y PAMP?', '¿Te armo un gráfico TradingView con soportes?', '¿Lo envío a Telegram?') para que el usuario haga clic. PROHIBIDO inventar cifras o prometer rendimientos. No repitas el plan técnico ni nombres de herramientas.",
    },
    ...historial.slice(-4).map((m) => ({ role: m.role, content: m.content })),
    {
      role: "user",
      content: `META: ${pregunta}\n\nDATOS REALES OBTENIDOS (fuente única de verdad):\n${resumenFinal || "(no se obtuvieron datos; comunicalo con honestidad)"}`,
    },
  ];
  let final = "";
  try {
    const rFin = await respuestaModelo(
      apiKey,
      orquestacion.modeloSalida?.id ?? modelo.id,
      mensajesSintesis,
      null,
      orquestacion.modeloSalida?.maxTokens ?? modelo.maxTokens,
      false,
      undefined,
    );
    final = rFin.content.trim();
  } catch {
    final = "";
  }

  if (!final) {
    final =
      ejecutadas.length > 0
        ? `Terminé el flujo (${ejecutadas.filter((e) => e.ok).length}/${ejecutadas.length} pasos OK) pero no pude redactar el informe final en este momento. Los datos quedaron en pantalla como estados de progreso; volvé a pedirme el resumen y te lo armo al toque.`
        : "No pude ejecutar ninguna herramienta para esa meta en este momento (posible caída temporal del proveedor IA). Reintentá en unos segundos.";
  }

  console.log(`[AUTONOMO] fin: calls=${totalCalls} ok=${ejecutadas.filter((e) => e.ok).length}/${ejecutadas.length} final=${final.length} chars`);
  return { final, fuentes };
}

/** Puente tipado hacia los eventos NDJSON existentes (chart/informe/etc.). */
function enviarEventosInternos(enviar: Enviar, eventos?: unknown[]): void {
  if (!eventos?.length) return;
  for (const ev of eventos) enviar(ev);
}
