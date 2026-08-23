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
import { ColaDeTareas } from "@/lib/agents/queue";
import { getAdaptiveHint } from "@/lib/nemo-relay";

// AMBOS con prioridad y fallback: NeMo Relay adaptive (más importante) → AGENTES_PARALELOS → AUTONOMO_PARALELAS → 5
// Toma el máximo entre el hint adaptativo y el env, así se respeta el más performante sin perder fallback.
function paralelismoAutonomo(): number {
  let hintPar: number | undefined;
  try {
    const h = getAdaptiveHint();
    if (h?.maxParallel && isFinite(h.maxParallel) && h.maxParallel >= 2) hintPar = Math.min(h.maxParallel, 8);
  } catch { /* sin relay en este contexto */ }
  let envPar: number | undefined;
  let envAutoPar: number | undefined;
  try {
    if (typeof process !== "undefined") {
      const rawA = String(process.env.AGENTES_PARALELOS ?? "").trim();
      const vA = Number(rawA);
      if (isFinite(vA) && vA >= 2 && vA <= 10) envPar = vA;
      const rawB = String(process.env.AUTONOMO_PARALELAS ?? "").trim();
      const vB = Number(rawB);
      if (isFinite(vB) && vB >= 2 && vB <= 10) envAutoPar = vB;
    }
  } catch { /* ignora */ }
  // AMBOS: prioriza el mayor entre hint y env (más paralelismo = más importante para velocidad)
  const candidatos = [hintPar, envPar, envAutoPar].filter((v): v is number => typeof v === "number");
  if (candidatos.length) return Math.max(...candidatos);
  return 5;
}

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

/**
 * Detecta saludos o mensajes sin tarea accionable (hola, ¿qué pods hacer?, etc.).
 * Con Modo Automático activado, estos NO deben entrar al pipeline plan→ejecutar:
 * obligarlos por la estructura de síntesis genera alucinaciones para "llenar el molde".
 */
export function esSmallTalkOConsultaSinMeta(pregunta: string): boolean {
  const p = (pregunta ?? "").trim();
  if (!p || p.length > 140) return false;
  const n = p.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const saludoPuro =
    /^(hola+|holis|buenas(\s+(tardes|noches|dias|dia))?|buen\s*dia|buenos\s*dias|hey|hi|hello|que\s*tal\??|como\s+andas?\??|todo\s+bien\??|chau|hasta\s+luego)[\s!.?¿¡]*$/;
  if (saludoPuro.test(n)) return true;
  // Consultas de capacidades sin ningún activo/ticker/dato detectable
  const capacidad =
    /(que\s+(podes|puedes|hace[sz])\s+hacer|quien\s+sos|que\s+es\s+(esto|el\s+(chat|agente))|como\s+funciona(s)?\s+(esto|el\s+(chat|agente|modo))|para\s+que\s+servis|necesito\s+ayuda|^ayuda$|^help$)/.test(
      n,
    );
  const hayActivo =
    /\b(ggal|ypf|ypfd|pamp|meli|bma|alua|come|txar|aapl|msft|nvda|tsla|amzn|googl|meta|spy|qqq|al30|gd30|al35|gd35|ae38|gd38|tx26|lecap|boncap)\b|\b[a-z]{1,5}\.ba\b|\b\d+\s*(usd|ars|pesos|dolares?)\b|dolar|blue\b|mep\b|ccl\b|uva\b|inflacion|riesgo pais|portafolio|cartera|bono|cedear|accion|opcion|fci|caucion/i.test(
      p,
    );
  return capacidad && !hayActivo;
}

const JERARQUIA_METODOLOGICA = `
Jerarquía metodológica del análisis financiero completo (orden recomendado):
F0 Macro: contexto_macro, ciclo_economico
F1-F3 Contable/valuación: analizar_fundamental, calcular_wacc, calcular_dcf, valor_por_metodos, valor_intrinseco_real, ficha_de_decision
PIPELINE MAESTRO (si la meta es un análisis completo/integral): analisis_completo(simbolo) ejecuta F0→F10 en orden con validación T incluida; reforzar con validar_analisis(simbolo).
F4 Sectores: score_sectorial, analisis_industria, matriz_benchmarks, ranking_valuacion_sectores, performance_sectorial, valuacion_sectorial
F5-F6 Cartera/riesgo: estadisticas_retornos, analizar_riesgo, distribucion_riesgo, analizar_capm, matriz_capm, capm_auto, analizar_factores, optimizar_portafolio, optimizar_cartera_avanzada, backtest_optimizacion, calcular_cobertura
F7 Renta fija: calcular_tir_bono, calcular_ytm_bono, consultar_curva_etti, calcular_stripped_yield, calcular_yield_call, consultar_semaforo_riesgo_bono
F8 Derivados: cadena_opciones_bcba, analizar_opciones_completo, predecir_direccion
F9 Cuantitativo: pairs_trading_labadie, curva_ejecucion_labadie
Transversal datos: consultar_mercado, buscar_noticias, buscar_web, consultar_catalogo, consultar_base_conocimiento, analisis_tecnico, analizar_semaforo
Cierre: generar_informe, grafico_chat, oportunidades_diarias
Operativa (solo si el usuario lo pide explícitamente): iol_login, iol_cuenta, iol_mercado, iol_operar (NUNCA sin confirmación explícita del usuario), telegram_enviar_senal, telegram_enviar_mensaje, telegram_enviar_grafico, publicar_slide_mercado, publicar_oportunidades

MAPEO DE JERGA INTERNA (crítico): nombres como RazonesFinancierasTab, "toggle moneda constante", resolverTIRConRestricciones son paneles/UI, NO herramientas tuyas. Traducilos a tools reales (analizar_fundamental para razones; calcular_ytm_bono para TIR de bonos) y ejecutá esas. PROHIBIDO fabricar sus salidas o citarlas como ejecutadas. NUNCA inventes flujos de fondos, ratios ni TIRs: solo datos textuales de resultados de tools.
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
  // AMBOS con prioridad: razonamiento planifica/valida, EJECUTOR RÁPIDO orquesta tools.
  // Si no hay modeloEjecutor (llamadas viejas), fallback al planner.
  const modeloRapido = (orquestacion as { modeloEjecutor?: typeof modelo }).modeloEjecutor ?? modelo;
  const fuentes: ResultadoTurno["fuentes"] = [];
  const ejecutadas: LlamadaEjecutada[] = [];
  let totalCalls = 0;

  // GUARD: saludo / mensaje sin meta accionable → respuesta conversacional corta.
  // Sin esto, el Modo Automático fuerza la estructura de síntesis (macro→datos→
  // valuación→riesgos) sobre un "hola" y el modelo FABRICA un análisis para llenarla.
  if (esSmallTalkOConsultaSinMeta(pregunta)) {
    enviar({ t: "status", v: "autonomo", q: "Saludo/consulta sin meta: respuesta directa sin pipeline" });
    const finalSaludo =
      "¡Hola! Soy IA, tu asistente de mercado. Con el **Modo Automático** activo me hablás en lenguaje natural y yo orquesto las funciones de la app. Ejemplos de lo que puedo ejecutar ahora mismo:\n\n" +
      "- \"análisis completo de GGAL\" — pipeline F0→F10 con macro, fundamental, técnico, cuantitativo y validación\n" +
      "- \"señal unificada de YPF\" — señal 4 capas del motor unificado\n" +
      "- \"curva ETTI soberana\" o \"YTM de AL30\" — renta fija en vivo\n" +
      "- \"mi portafolio de IOL\" — iniciá sesión desde el chat y lo analizo\n" +
      "- \"dólar MEP hoy\" o \"riesgo país\" — datos al instante con fuente\n\n" +
      "¿Qué analizamos?";
    return { final: finalSaludo, fuentes };
  }

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
        // EJECUCIÓN con el modelo RÁPIDO (sin thinking): latencia mínima por ronda.
        salida = await respuestaModelo(
          apiKey,
          modeloRapido.id,
          messages,
          NOMBRE_HERRAMIENTAS,
          modeloRapido.maxTokens,
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

      // --- Ejecución paralela de todas las tool_calls de la ronda ---
      // Mantiene el orden lógico para el historial LLM vinculando por tool_call_id.
      const calls = salida.tool_calls.slice(0, Math.max(0, MAX_TOOL_CALLS - totalCalls));
      const cola = new ColaDeTareas(paralelismoAutonomo());
      // Pre-anunciar estado para cada call (sin bloquear carga)
      for (const c of calls) {
        if (!c.name || !NOMBRE_HERRAMIENTAS.includes(c.name)) continue;
        enviar({ t: "status", v: estadoDeHerramienta(c.name), q: pregunta.slice(0, 40) });
      }
      pasoAutonomo(`Ronda ${ronda + 1}: ejecutando ${calls.length} herramientas en paralelo…`);

      type ResCall = { idx: number; call: (typeof calls)[number]; texto: string; ok: boolean; fuentes: ResultadoTurno["fuentes"]; eventos?: unknown[]; invalida?: boolean };
      const resultados: ResCall[] = await Promise.all(
        calls.map((call, idx) =>
          cola.enqueue(async (): Promise<ResCall> => {
            if (!call.name || !NOMBRE_HERRAMIENTAS.includes(call.name)) {
              return { idx, call, texto: "Herramienta inexistente. Usá exactamente uno de los nombres disponibles.", ok: false, fuentes: [], invalida: true };
            }
            const bloqueo = await protegerOperacionReal(call.name, call.arguments, sessionId, baseUrl);
            if (bloqueo) return { idx, call, texto: bloqueo.texto, ok: false, fuentes: [] };
            try {
              const ej = await ejecutarTool(call.name, call.arguments, baseUrl, sessionId);
              return { idx, call, texto: ej.texto, ok: ej.ok, fuentes: ej.fuentes, eventos: ej.eventos as unknown[] };
            } catch (err) {
              return { idx, call, texto: `ERROR ejecutando ${call.name}: ${String(err).slice(0, 300)}`, ok: false, fuentes: [] };
            }
          }),
        ),
      );
      // Reensamblar en orden original de la ronda (requisito LLM tool_call_id)
      resultados.sort((a, b) => a.idx - b.idx);
      for (const r of resultados) {
        if (r.invalida) {
          messages.push({ role: "tool", tool_call_id: r.call.id, name: r.call.name || "desconocida", content: r.texto });
          continue;
        }
        totalCalls++;
        fuentes.push(...r.fuentes);
        if (r.fuentes.length) enviar({ t: "sources", v: r.fuentes });
        enviarEventosInternos(enviar, r.eventos as never[]);
        ejecutadas.push({ name: r.call.name, args: r.call.arguments, ok: r.ok, resumen: r.texto.slice(0, 600) });
        console.log(`[AUTONOMO][ronda ${ronda}] ${r.call.name} ok=${r.ok}`);
        messages.push({ role: "tool", tool_call_id: r.call.id, name: r.call.name, content: `Resultado real de ${r.call.name}:\n\n${r.texto}` });
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
        "Sos el redactor final del análisis financiero en MODO AUTOMÁTICO. Recibís la meta del usuario (en lenguaje natural humano) y los datos REALES obtenidos por las herramientas orquestadas autónomamente (ya validados por un agente validador). Razonás la instrucción como humano: inferís intención, activo, horizonte y preguntas implícitas. Asumís el rol de la base de conocimiento (55 PDFs Pascale/Fowler Newton/Dumrauf/Blanchard/Biondi + corpus Labadie + regulación CNV/BCRA) y sabés qué rol asignarte (Mercado/Valoración/Semáforo/Cuantitativo/Conocimiento/Motor Unificado) según la instrucción; si hay múltiples capas, orquestás y citás todas. Redactás la respuesta definitiva en español rioplatense, formato markdown de chat: directo, con cifras citadas tal cual fueron obtenidas, señalando explícitamente qué falló o no pudo obtenerse (honestidad ante todo). Al cierre, proponé SIEMPRE 2-3 instrucciones siguientes inteligentes en lenguaje natural humano como sugerencias para que el usuario haga clic. PROHIBIDO inventar cifras o prometer rendimientos. No repitas el plan técnico ni nombres de herramientas.\n\n[ESTRUCTURA CONDICIONAL — NO ES UN MOLDE OBLIGATORIO]\nLa estructura 'contexto macro → datos clave → valuación → riesgos → conclusión' SOLO aplica si hay DATOS REALES de herramientas sobre un activo/tema concreto en DATOS REALES OBTENIDOS. Si el bloque viene vacío o '(no se obtuvieron datos)': respondé BREVE y conversacional reconociendo que no pudiste ejecutar nada, pedí el dato que falta o sugerí qué analizar; NUNCA rellenes la estructura con un análisis inventado, ni cambies de tema para justificar el molde.\n\n[ATRIBUCIONES — PROHIBIDO FABRICAR FUENTES INSTITUCIONALES]\nNunca atribuyas 'estudios', datos ni conclusiones a Cintia Boos, universidades (ej. Universidad de La Plata), institutos ni organismos si esa atribución no aparece textualmente en los resultados de herramientas de este turno. El corpus académico es tu marco metodológico interno para INTERPRETAR resultados: citá el documento/archivo cuando aporte teoría, jamás como fuente numérica de un activo puntual.\n\nREGLA ANTI-ALUCINACIÓN TERMINANTE: el bloque DATOS REALES OBTENIDOS es tu ÚNICA fuente de cifras. Si la meta pide algo que no está en ese bloque (ej. flujos de fondos proyectados, TIR con restricciones, razones en moneda constante sin datos IPC), NO lo fabriques ni armes ejemplos ilustrativos con números inventados: declará explícitamente 'no se pudo calcular X con datos confirmados en este turno'.",
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
