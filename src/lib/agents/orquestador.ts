/**
 * Orquestador núcleo del agente: ejecución de herramientas (ejecutarTool),
 * llamada al modelo NVIDIA (llamarModelo), detección de skills por intención
 * (detectarIntencionSkill) y tipos compartidos.
 *
 * Los flujos de turno viven en directo.ts (vía rápida/manual) y autonomo.ts
 * (modo automático plan->ejecuta->valida->sintetiza).
 */
import { MemoriaDeSesion } from "@/lib/agents/memory";
import { TOOLS, estadoDeHerramienta, type ToolSpec } from "@/lib/agents/herramientas";
import { instrumentTool as relayInstrumentTool, instrumentLLM as relayInstrumentLLM } from "@/lib/nemo-relay";
import {
  ejecutarMercado,
  ejecutarNoticias,
  ejecutarBaseConocimiento,
  ejecutarDCF,
  ejecutarValorIntrinseco,
  ejecutarEstimacionesEarnings,
  ejecutarSemaforo,
  ejecutarBusqueda,
  validarDCFEnWeb,
  esAcademico,
  ejecutarDistribucion,
  ejecutarOptimizarPortafolio,
  ejecutarFactores,
  ejecutarCAPM,
  ejecutarMatrizCAPM,
  ejecutarSectores,
  ejecutarCobertura,
  ejecutarCatalogo,
  ejecutarRiesgo,
  ejecutarFundamental,
  ejecutarWacc,
  ejecutarValorMetodos,
  ejecutarFichaDecision,
  ejecutarAnalisisCompleto,
  ejecutarValidarAnalisis,
  ejecutarContextoMacro,
  ejecutarCicloEconomico,
  ejecutarPerformanceSectorial,
  ejecutarValuacionSectorial,
  ejecutarOptimizacionAvanzada,
  ejecutarBacktestOptimizacion,
  ejecutarDistribucionRiesgo,
  ejecutarCapmAuto,
  ejecutarAnalisisIndustria,
  ejecutarRankingValuacion,
  ejecutarOportunidadesDiarias,
  ejecutarMatrizBenchmarks,
  ejecutarIolLogin,
  ejecutarIolCuenta,
  ejecutarIolMercado,
  ejecutarIolOperar,
  ejecutarIolAsesor,
  ejecutarAnalisisTecnico,
  ejecutarDatosFinancieros,
  ejecutarGraficoChat,
  ejecutarGenerarInforme,
  ejecutarPairsTradingLabadie,
  ejecutarCurvaEjecucionLabadie,
  ejecutarPrediccionSubyacente,
  ejecutarCadenaOpcionesBCBA,
  ejecutarCierreMercado,
  ejecutarInformeMatutino,
  ejecutarAgendaEconomica,
  type EventoChat,
  type ResultadoConocimiento,
} from "@/lib/agents/ejecutores";
import type { ConfiguracionOrquestacion } from "@/lib/model-orchestration";
import { MODELO_POR_DEFECTO } from "@/lib/model-registry";
import { construirPromptSkills } from "@/lib/skills";
import { iolSesionActiva } from "@/lib/iol.server";
import type { FuenteMercado } from "@/lib/mercado.server";

export type Msg = { role: "user" | "assistant"; content: string };
export type ApiMsg = {
  role: string;
  content: string;
  tool_calls?: unknown;
  tool_call_id?: string;
  name?: string;
};

export type Enviar = (obj: unknown) => void;

export type ResultadoTurno = {
  final: string;
  fuentes: FuenteMercado[];
  /** Si la valoración en vivo falló: texto determinístico honesto para el usuario. */
  textoValoracionFallida?: string;
};

export type OpcionesOrquestador = {
  pregunta: string;
  historial: Msg[];
  memoria: MemoriaDeSesion;
  orquestacion: ConfiguracionOrquestacion;
  apiKey: string;
  baseUrl: string | undefined;
  enviar: Enviar;
  systemPrompt: string;
  siteContext: string;
  ragMsg?: ApiMsg;
  /** Id de sesión del chat: clave de la sesión IOL y de la memoria persistente. */
  sessionId?: string;
};


/** Quita tildes/diacríticos para comparar sin acentos. */
function normalizarSinAcentos(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function detectarCredencialesIOL(
  pregunta: string,
): { usuario: string; password: string } | null {
  const p = (pregunta ?? "").trim();
  if (!p || p.length > 600) return null;
  // Formato etiquetado.
  const u = p.match(/(?:usuario|user|email|mail)\s*[:=]\s*([^\s,;]+)/i);
  const c = p.match(/(?:password|contrase[ñn]a|clave|pass)\s*[:=]\s*([^\s,;]+)/i);
  if (u?.[1] && c?.[1]) return { usuario: u[1], password: c[1] };
  // Formato libre: mención de IOL/login seguida de un email y un token.
  if (/iol|invertir\s*online|inici[ae][a-z]*\s+sesi[óo]n|loguea|login/i.test(p)) {
    const email = p.match(/([\w.+-]+@[\w-]+\.[\w.-]+)/);
    if (email?.[1]) {
      const resto = p.slice((email.index ?? 0) + email[0].length).trim();
      const pass = resto.split(/[\s,;]+/)[0];
      if (pass && pass.length >= 4 && !/^(y|and|para|password|contrase[ñn]a)$/i.test(pass)) {
        return { usuario: email[1], password: pass };
      }
    }
  }
  return null;
}

/** Preguntas de VERIFICACIÓN de entidades/brokers en el registro de la CNV. */


/**
 * VÍA RÁPIDA: detecta consultas PUNTUALES que una única herramienta
 * determinística resuelve completa (ej. "calcula la TIR del AL30", "dólar blue hoy").
 * Esas consultas NO deben pasar por multi-agente + coordinador + redacción
 * multi-ronda (1-3 minutos): se ejecuta la tool y se redacta una vez (~segundos).
 * Devuelve null si la consulta es compuesta, analítica o conceptual.
 */


/**
 * Detector de intención para elegir las SKILLS que se inyectan al prompt del
 * modelo en cada turno (marco metodológico específico por tipo de análisis).
 */
function detectarIntencionSkill(pregunta: string): string[] {
  const p = pregunta.toLowerCase();
  const skills: string[] = [];

  if (
    /sem[aá]foro|rsi|macd|sma|indicador t[eé]cnico|soporte|resistencia|an[aá]lisis t[eé]cnico/.test(
      p,
    )
  ) {
    skills.push("analisis-tecnico-senal");
  }
  if (
    /fundamental|moat|porter|gobierno corporativo|ventaja competitiva|management|modelo de negocio/.test(
      p,
    )
  ) {
    skills.push("analisis-fundamental-6d");
  }
  if (/raz[oó]n financiera|ratio|dupont|liquidez|endeudamiento|rentabilidad|roe|roa/.test(p)) {
    skills.push("razones-financieras-dupont");
  }
  if (
    /planificaci[oó]n|presupuesto|flujo de caja|proyecci[oó]n financiera|objetivo financiero/.test(
      p,
    )
  ) {
    skills.push("planificacion-financiera");
  }
  if (/backtest|desempe[ñn]o pasado|se[ñn]ales pasadas|rendimiento hist[oó]rico/.test(p)) {
    skills.push("backtesting-senales");
  }
  //  Metodologías cuantitativas de Labadie 
  if (
    /pairs?\s*trading|arbitraje\s+estad[íi]stico|spread\s+entre|cointegraci[oó]n|cointegrad|z-?score\s+del\s+spread|par\s+(de\s+)?(acciones|activos)|estatarb|stat\s*arb/.test(
      p,
    )
  ) {
    skills.push("statarb-labadie");
  }
  if (
    /ejecuci[oó]n\s+[oó]ptima|curva\s+de\s+(trading|ejecuci[oó]n)|algren|almgren|target\s+close|implementation\s+shortfall|impacto\s+de\s+mercado|pvol|participaci[oó]n\s+m[aá]xima|p-?varianza|tiempo\s+[oó]ptimo\s+de\s+(inicio|parada)/.test(
      p,
    )
  ) {
    skills.push("ejecucion-optima-labadie");
  }
  if (
    /market[-\s]?mak|market\s+maker|creador\s+de\s+mercado|avellaneda|hjb|hamilton[-\s]jacobi|intensidad\s+de\s+ejecuci[oó]n|inventario\s+del?\s*(market|mm)/.test(
      p,
    )
  ) {
    skills.push("market-making-labadie");
  }
  if (
    /microestructura|libro\s+de\s+[oó]rdenes|\blob\b|order\s+book|glosten|kyle\s+1985|selecci[oó]n\s+adversa.*spread|spoofing|momentum\s+ignition|twap|vwap\b|pov\b|smart\s+order|routing|flash\s+crash|knight\s+capital|makers?\s+y\s+takers?|alta\s+frecuencia|hft/.test(
      p,
    )
  ) {
    skills.push("microestructura-trading-labadie");
  }
  if (
    /iol|invertir\s*online|mi\s+portafolio|mi\s+cuenta|mis\s+operaciones|estadocuenta|estado\s+de\s+cuenta|comprar\s+\w+\s+en\s+iol|vender\s+\w+\s+en\s+iol/.test(
      p,
    ) ||
    /grafic|chart|tradingview|velas|candel|visualiz|serie\s+(de\s+)?(precio|tiempo)/.test(p) ||
    /informe|reporte|resumen\s+ejecutivo|pdf|descargable/.test(p) ||
    /yfinance|yahoo\s+finance|argentinadatos|criptoya|bcra.*(cambiaria|monetaria)|estadisticas\s+cambiarias|estadisticas\s+monetarias/.test(
      p,
    )
  ) {
    skills.push("orquestacion-fuentes-datos");
  }

  // Metodologías del corpus académico (pt/) y funcionalidades portadas.
  // Los acrónimos (VAN, TIR, PER...) se chequean sobre el texto original porque
  // el lowercase colisiona con palabras españolas comunes ("van").
  if (
    /valuaci[oó]n|cu[aá]nto vale|valor intr[ií]nseco|goodwill|flujo descontado|m[uú]ltiplos|ev\/ebitda|precio objetivo|valor por acci[oó]n/.test(p) ||
    /\b(PER|EVA)\b/.test(pregunta)
  ) {
    skills.push("metodo-pascale-valuacion");
  }
  if (
    /estados contables|\bbalance\b|patrimonio neto|flujo de fondos|calidad contable|an[aá]lisis (vertical|horizontal)|ajuste por inflaci[oó]n|contabilidad|\bicon\b|\bconii\b/.test(p)
  ) {
    skills.push("analisis-estados-contables");
  }
  if (
    /cartera|portafolio|diversific|rebalanceo|asignaci[oó]n de activos|perfil de riesgo|d[oó]nde invierto|en qu[eé] invierto|fondos comunes/.test(p)
  ) {
    skills.push("carteras-elbaum");
  }
  if (
    /tasa efectiva|tasa nominal|capitalizaci[oó]n|equivalencia de tasas|curva de (tasas|tipos)|duraci[oó]n de bonos?|bonos?|amortizaci[oó]n|cauci[oó]n|valor presente|valor futuro|int[eé]r[eé]s compuesto|descuento de flujos?/.test(p) ||
    /\b(VAN|TIR|TEA|CFT|ETTI|BADLAR)\b/.test(pregunta)
  ) {
    skills.push("calculo-financiero-dumrauf");
  }
  if (
    /macroeconom|inflaci[oó]n|recesi[oó]n|devaluaci[oó]n|riesgo pa[íi]s|ciclo econ[oó]mico|pol[íi]tica monetaria|pol[íi]tica fiscal|base monetaria|\bleliq\b|d[eé]ficit fiscal|demanda agregada|tipo de cambio real/.test(p)
  ) {
    skills.push("macro-latam-ciclo");
  }
  if (
    /se[ñn]ales?\b|cedears?\b|\bbcba\b|panel l[ií]der|l[ií]quidos?\b|movers|noticias hoy|qu[eé] (compro|comprar|vendo|vender)( hoy)?/.test(p)
  ) {
    skills.push("cedear-signals");
  }
  // Motor unificado CORONAR: señal 4 capas intermarket→fundamental→tecnico→cuantitativo
  if (
    /se[ñn]al\s+unificada|se[ñn]ales\s+unificadas|motor\s+unificado|qu[eé]\s+compro\s+hoy|qu[eé]\s+comprar|top\s+se[ñn]ales|se[ñn]al\s+de\s+(compra|venta)\b.*(?:unificad|completa|4\s*capas)|analiz[aá]\s+(?:complet[ao]|unificad)/i.test(p) ||
    /generar.*se[ñn]al|comprar\s+o\s+vender\s+.*(?:ggal|ypf|pamp|aapl|meli)/i.test(p)
  ) {
    skills.push("senal-unificada");
  }
  if (
    /opci[oó]n(es)?\b|\bstrikes?\b|\bprimas?\b|griegas?|\bdelta\b|\bgamma\b|\btheta\b|\bvega\b|volatilidad impl[ií]cita|monte ?carlo|\bitm\b|black.?scholes|sonrisa de (la )?volatilidad/.test(p)
  ) {
    skills.push("options-analysis");
  }
  if (
    /patrimonio total|mis tenencias|pegu[eé] mi (portafolio|cartera|cuenta)/.test(p)
  ) {
    skills.push("portfolio-paste-parser");
  }
  if (
    /capital de trabajo|tesorer[íi]a|financiamiento|cr[eé]dito comercial|ciclo de conversi[oó]n|inventario eoq|scoring tesorer[íi]a|d[oó]nde invertir caja|colocar excedentes|costo efectivo financiamiento|pol[íi]tica de cr[eé]dito|punto de reorden/.test(p)
  ) {
    skills.push("alonso-capital-trabajo");
  }
  if (
    /bono|renta fija|duration|convexidad|dv01|curva spot|forward|ipd|spread de equilibrio|covenants|an[aá]lisis de bono|ytm|tir.*bono|riesgo pa[íi]s.*cuadro|cuadro de signos|probabilidad de default|gs-ess|curva argentina|bootstrapping/.test(p)
  ) {
    skills.push("elbaum-renta-fija");
  }
  if (
    /analisis\s+completo|an[áa]lisis\s+integral|ficha\s+coronar|coronar\s+bases|valuaci[óo]n\s+integral|jerarqu[íi]a\s+metodol[óo]gica|f0.*f10|pipeline\s+maestro/i.test(p)
  ) {
    skills.push("razonamiento-profundo");
    skills.push("analisis-completo-f0-f10");
    skills.push("analisis-fundamental-6d");
    skills.push("analisis-tecnico-senal");
    skills.push("razonamiento-autonomo-financiero");
    skills.push("metodo-pascale-valuacion");
    skills.push("analisis-estados-contables");
    skills.push("calculo-financiero-dumrauf");
    skills.push("carteras-elbaum");
    skills.push("macro-latam-ciclo");
  }
  // Skills huérfanas conectadas (antes sin selector)
  if (/predicci[oó]n|probabilidad de subida|sube o baja|direcci[oó]n de .*(acci[oó]n|ticker)|call o put/.test(p)) {
    skills.push("ml-prediccion-labadie");
  }
  if (/opciones.*(bcba|argentinas?)|cadena de opciones.*(ggal|ypfd|pamp|come|bma)|lanzar cubierta|covered call/i.test(p)) {
    skills.push("opciones-bcja");
  }
  if (/pairs?.*(crypto|cripto)|stat.?arb.*(crypto|cripto)|cointegra.*(btc|eth|binance)|arbitraje.*(binance|cripto)/i.test(p)) {
    skills.push("crypto-statarb-labadie");
  }
  if (/sectorial|an[aá]lisis de sector|roic.*sector|margen.*sector|bustamante/i.test(p)) {
    skills.push("analisis-sectorial-bustamante");
  }

  if (
    /postura\s+(integrada|del\s+mercado)|d[óo]nde\s+posicionarse?|diagn[oó]stico\s+(intermarket|integrado|del\s+mercado)|risk.?-?on|risk.?-?off|en qu[eé]\s+fase\s+del\s+ciclo/i.test(p)
  ) {
    skills.push("postura-integrada");
  }

  return skills;
}

export { detectarIntencionSkill };

const URL_COMPLETIONS = "https://integrate.api.nvidia.com/v1/chat/completions";

function esperar(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * POST resiliente a chat completions: reintenta fallos de red y 429,
 * y en el peor caso devuelve un Response "no ok" sin lanzar.
 * Así un problema transitorio del modelo no interrumpe el turno completo.
 */
async function postCompletionsResiliente(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  let ultimoError: unknown = null;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const res = await fetch(URL_COMPLETIONS, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (res.status === 429 && intento < 2) {
        await esperar(600 * (intento + 1));
        continue;
      }
      return res;
    } catch (err) {
      ultimoError = err;
      if (intento < 2) await esperar(500 * (intento + 1));
    }
  }
  return new Response(
    JSON.stringify({
      error: ultimoError instanceof Error ? ultimoError.message : String(ultimoError),
    }),
    { status: 502, statusText: "Gateway Error" },
  );
}

export async function llamarModelo(
  apiKey: string,
  modelId: string,
  messages: ApiMsg[],
  tools: string[] | null,
  opts: { maxTokens?: number; enableThinking?: boolean; reasoningBudget?: number } = {},
) {
  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: 0.3,
    top_p: 0.95,
    chat_template_kwargs: { enable_thinking: opts.enableThinking ?? false },
    stream: false,
  };
  if (opts.enableThinking && opts.reasoningBudget) {
    body["reasoning_budget"] = opts.reasoningBudget;
  }
  if (tools && tools.length) {
    const disponibles = TOOLS.filter((t) => tools.includes(t.function.name));
    if (disponibles.length) {
      body["tools"] = disponibles;
      body["tool_choice"] = "auto";
    }
  }
  return relayInstrumentLLM(modelId, () => postCompletionsResiliente(apiKey, body));
}

function extraerDatosTool(argsRaw: string): { query: string; periodo: string; simbolo: string } {
  let query = "";
  let periodo = "";
  let simbolo = "";
  try {
    const args = JSON.parse(argsRaw) as {
      query?: string;
      periodo?: string;
      simbolo?: string;
    };
    query = String(args.query ?? "");
    periodo = String(args.periodo ?? "");
    simbolo = String(args.simbolo ?? "");
  } catch {
    /* sin args */
  }
  return { query, periodo, simbolo };
}

export async function ejecutarTool(
  name: string,
  argsRaw: string,
  baseUrl?: string,
  sessionId = "anon",
): Promise<{ texto: string; fuentes: FuenteMercado[]; ok: boolean; eventos?: EventoChat[] }> {
  return relayInstrumentTool(name, async () => {
  const { query, periodo, simbolo } = extraerDatosTool(argsRaw);
  // Nunca volcar credenciales de IOL al log del servidor.
  const argsParaLog = name === "iol_login" ? "<credenciales ocultas>" : argsRaw.slice(0, 220);
  console.log(`[TOOL] ${name} ${argsParaLog}`); // TEMP PASO4
  switch (name) {
    case "consultar_mercado":
      return { ...(await ejecutarMercado(query)), ok: true };
    case "predecir_direccion": {
      const res = await ejecutarPrediccionSubyacente(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "cadena_opciones_bcba": {
      const res = await ejecutarCadenaOpcionesBCBA(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "buscar_noticias":
      return { ...(await ejecutarNoticias(query, periodo)), ok: true };
    case "consultar_base_conocimiento":
      return { ...(await ejecutarBaseConocimiento(query, baseUrl)), ok: true };
    case "calcular_dcf":
      return { ...(await ejecutarDCF(argsRaw)), ok: true };
    case "valor_intrinseco_real": {
      const res = await ejecutarValorIntrinseco(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "estimaciones_earnings": {
      const res = await ejecutarEstimacionesEarnings(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "analizar_semaforo": {
      const res = await ejecutarSemaforo(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "estadisticas_retornos": {
      const res = await ejecutarDistribucion(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "optimizar_portafolio": {
      const res = await ejecutarOptimizarPortafolio(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "analizar_factores": {
      const res = await ejecutarFactores(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "analizar_capm": {
      const res = await ejecutarCAPM(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "matriz_capm": {
      const res = await ejecutarMatrizCAPM(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "analizar_sectores": {
      const res = await ejecutarSectores(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "calcular_cobertura": {
      const res = await ejecutarCobertura(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "consultar_catalogo": {
      const res = await ejecutarCatalogo(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "analizar_riesgo": {
      const res = await ejecutarRiesgo(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "analizar_fundamental": {
      const res = await ejecutarFundamental(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "calcular_wacc": {
      const res = await ejecutarWacc(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "valor_por_metodos": {
      const res = await ejecutarValorMetodos(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "ficha_de_decision": {
      const res = await ejecutarFichaDecision(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "contexto_macro": {
      const res = await ejecutarContextoMacro();
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "ciclo_economico": {
      const res = await ejecutarCicloEconomico();
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "performance_sectorial": {
      const res = await ejecutarPerformanceSectorial(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "valuacion_sectorial": {
      const res = await ejecutarValuacionSectorial(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "optimizar_cartera_avanzada": {
      const res = await ejecutarOptimizacionAvanzada(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "backtest_optimizacion": {
      const res = await ejecutarBacktestOptimizacion(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "distribucion_riesgo": {
      const res = await ejecutarDistribucionRiesgo(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "capm_auto": {
      const res = await ejecutarCapmAuto(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "analisis_industria": {
      const res = await ejecutarAnalisisIndustria(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "ranking_valuacion_sectores": {
      const res = await ejecutarRankingValuacion();
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "oportunidades_diarias": {
      const res = await ejecutarOportunidadesDiarias();
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "matriz_benchmarks": {
      const res = await ejecutarMatrizBenchmarks();
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
    case "iol_login":
      return await ejecutarIolLogin(argsRaw, sessionId);
    case "iol_cuenta":
      return await ejecutarIolCuenta(argsRaw, sessionId);
    case "iol_mercado":
      return await ejecutarIolMercado(argsRaw, sessionId);
    case "iol_operar":
      return await ejecutarIolOperar(argsRaw, sessionId);
    case "iol_asesor":
      return await ejecutarIolAsesor(argsRaw, sessionId);
    case "analisis_tecnico":
    case "analizar_portafolio_clarity": {
      const mod = await import("@/lib/herramientas/clara.functions");
      const fn =
        name === "analisis_tecnico" ? mod.analisisTecnicoFn : mod.analizarPortafolioClarityFn;
      try {
        const data =
          name === "analisis_tecnico"
            ? await (fn as typeof mod.analisisTecnicoFn)({ data: { ticker: simbolo || query } })
            : await (fn as typeof mod.analizarPortafolioClarityFn)({
                data: {
                  ...(argsRaw.trim() ? (JSON.parse(argsRaw) as Record<string, unknown>) : {}),
                  sessionId,
                },
              });
        return {
          texto: `Datos reales de ${name}:\n\n${JSON.stringify(data, null, 1).slice(0, 6000)}`,
          fuentes: [],
          ok: true,
        };
      } catch (e) {
        return {
          texto: `SIN RESULTADOS: ${name} falló (${e instanceof Error ? e.message : "error"}).`,
          fuentes: [],
          ok: false,
        };
      }
    }
    case "score_sectorial": {
      const mod = await import("@/lib/herramientas/score-sectorial.functions");
      try {
        const args = argsRaw.trim() ? (JSON.parse(argsRaw) as Record<string, unknown>) : {};
        const data = await mod.scoreSectorialFn({
          data: {
            ticker: String(args["simbolo"] ?? simbolo ?? query ?? "").trim(),
            ...(typeof args["peersMax"] === "number" ? { peersMax: args["peersMax"] } : {}),
          },
        });
        const S = data.score;
        const L = [
          `Score sectorial de ${data.ticker}${data.nombre ? ` (${data.nombre})` : ""}:`,
          `- Sector universo: ${data.sectorUniverso ?? "N/D"} · Industria: ${data.industriaUniverso ?? "N/D"} | Yahoo: ${data.sectorYahoo ?? "N/D"} / ${data.industriaYahoo ?? "N/D"}`,
          `- Perfil sectorial (${data.perfil.sector}${data.perfil.esDefault ? ", DEFAULT" : ""}): sensibilidad tasas ${data.perfil.sensibilidadTasas}, commodities ${data.perfil.sensibilidadCommodity}. ${data.perfil.justificacion}`,
          `- SCORE SECTORIAL: ${S.disponible ? `${S.valor}/100 (base ${S.raw ?? "N/D"})` : `no disponible (valor neutro ${S.valor})`}`,
        ];
        if (S.disponible && S.detalle && Object.keys(S.detalle).length) {
          const d = Object.entries(S.detalle)
            .map(([k, v]) => `${k}=${v}`)
            .join(" · ");
          L.push(`- Detalle: ${d}`);
        }
        L.push(`- Resumen ejecutivo: ${data.interpretacion.resumenEjecutivo}`);
        for (const f of data.interpretacion.fortalezas) L.push(`- Fortaleza: ${f}`);
        for (const dd of data.interpretacion.debilidades) L.push(`- Debilidad: ${dd}`);
        if (data.interpretacion.mejorAlternativaSector)
          L.push(`- Mejor alternativa del sector: ${data.interpretacion.mejorAlternativaSector}`);
        for (const a of data.interpretacion.advertencias) L.push(`- Advertencia: ${a}`);
        for (const a of data.advertenciasDatos) L.push(`- Nota de datos: ${a}`);
        if (data.pares.length) {
          L.push(
            `- Pares comparados: ${data.pares
              .slice(0, 10)
              .map(
                (p) =>
                  `${p.ticker} (fs ${p.fundScore ?? "N/D"}, P/E ${p.trailingPE != null ? p.trailingPE.toFixed(1) : "N/D"})`,
              )
              .join("; ")}`,
          );
        }
        return { texto: L.join("\n"), fuentes: [], ok: true };
      } catch (e) {
        return {
          texto: `SIN RESULTADOS: score_sectorial falló (${e instanceof Error ? e.message : "error"}).`,
          fuentes: [],
          ok: false,
        };
      }
    }
    case "datos_financieros":
      return await ejecutarDatosFinancieros(argsRaw);
    case "grafico_chat":
      return await ejecutarGraficoChat(argsRaw);
    case "generar_informe":
      return await ejecutarGenerarInforme(argsRaw);
    case "pairs_trading_labadie": {
      const res = await ejecutarPairsTradingLabadie(argsRaw);
      return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
    }
      case "curva_ejecucion_labadie": {
        const res = await ejecutarCurvaEjecucionLabadie(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
      }
      case "implied_p_labadie": {
        const { ejecutarImpliedPLabadie } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarImpliedPLabadie(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
      }
      case "consultar_cierre_mercado": {
        const res = await ejecutarCierreMercado();
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
      }
      case "generar_informe_matutino": {
        const res = await ejecutarInformeMatutino(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok, eventos: (res as any).eventos };
      }
      case "consultar_agenda_economica": {
        const res = await ejecutarAgendaEconomica(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
      }
      case "generar_senales_cedear": {
        const { ejecutarSenalesCedear } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarSenalesCedear(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
      }
      case "analizar_portfolio_pegado": {
        const { ejecutarPortfolioPegado } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarPortfolioPegado(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok, eventos: (res as any).eventos };
      }
      case "analizar_opciones_completo": {
        const { ejecutarOpcionesCompleto } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarOpcionesCompleto(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok, eventos: (res as any).eventos };
      }
      case "generar_senal_unificada": {
        const { ejecutarSenalUnificada } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarSenalUnificada(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok, eventos: (res as any).eventos };
      }
      case "generar_senales_unificadas": {
        const { ejecutarSenalesUnificadas } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarSenalesUnificadas(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok, eventos: (res as any).eventos };
      }
      case "telegram_enviar_senal": {
        let a: { ticker?: string; senal?: string; precio?: number; variacion1d?: number; motivo?: string; chatId?: string } = {};
        try {
          a = JSON.parse(argsRaw || "{}");
        } catch {}
        if (!a.ticker)
          return { texto: "[ERROR] telegram_enviar_senal requiere ticker", fuentes: [], ok: false };
        // Sin señal explícita: genera la unificada 4 capas y publica con gráfico TradingView adjunto.
        if (!a.senal) {
          const { toolGenerarSenalUnificada } = await import("@/lib/ai/agent-tools.server");
          const out = await toolGenerarSenalUnificada({
            ticker: a.ticker,
            enviarTelegram: true,
            chatId: a.chatId,
          });
          return { texto: out, fuentes: [], ok: !out.startsWith("[ERROR") };
        }
        const { sendTelegramSignal } = await import("@/lib/telegram.server");
        const out = await sendTelegramSignal({
          ticker: a.ticker,
          senal: a.senal,
          precio: a.precio,
          variacion1d: a.variacion1d,
          motivo: a.motivo,
          chatId: a.chatId,
        });
        return { texto: out, fuentes: [], ok: !out.includes("[FAIL") && !out.includes("[ERROR") };
      }
      case "telegram_enviar_mensaje": {
        let a: { text?: string; chatId?: string } = {};
        try {
          a = JSON.parse(argsRaw || "{}");
        } catch {}
        if (!a.text)
          return { texto: "[ERROR] telegram_enviar_mensaje requiere text", fuentes: [], ok: false };
        const { sendTelegramMessage } = await import("@/lib/telegram.server");
        const out = await sendTelegramMessage({ text: a.text, chatId: a.chatId, parseMode: "HTML" });
        return { texto: out, fuentes: [], ok: !out.includes("[FAIL") && !out.includes("[ERROR") };
      }
      case "telegram_enviar_grafico": {
        const { enviarGraficoTradingviewTelegram } = await import("@/lib/telegram-grafico.server");
        const out = await enviarGraficoTradingviewTelegram(argsRaw);
        return { texto: out.texto, fuentes: [], ok: out.ok };
      }
      case "telegram_estado": {
        const { getTelegramConfig, agentGetMe } = await import("@/lib/telegram.server");
        const cfg = getTelegramConfig();
        const me = await agentGetMe().catch((e: unknown) => `[ERROR] ${e instanceof Error ? e.message : String(e)}`);
        return {
          texto: `ESTADO TELEGRAM (bot señales):\n- enabled=${cfg.enabled} token=${cfg.token ? "configurado" : "FALTA"} chatIds=${cfg.chatIds.join(",") || "(ninguno)"}\n- getMe: ${me}`,
          fuentes: [],
          ok: true,
        };
      }
      case "diagnostico_integrado": {
        const { getDiagnosticoIntegrado } = await import(
          "@/lib/herramientas/sectores/postura-integrada.functions"
        );
        const r = await (getDiagnosticoIntegrado as any)();
        return { texto: r?.texto ?? "SIN RESULTADOS", fuentes: [], ok: Boolean(r?.ok) };
      }
      case "publicar_slide_mercado": {
        const { publicarSlideMercado } = await import("@/lib/publicacion.server");
        const out = await publicarSlideMercado(argsRaw);
        return { texto: out.texto, fuentes: [], ok: out.ok };
      }
      case "publicar_oportunidades": {
        const { publicarOportunidades } = await import("@/lib/publicacion.server");
        const out = await publicarOportunidades(argsRaw);
        return { texto: out.texto, fuentes: [], ok: out.ok };
      }
      case "calcular_ytm_bono": {
        const { ejecutarYTM } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarYTM(argsRaw, sessionId);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok, eventos: (res as any).eventos };
      }
      case "consultar_curva_etti": {
        try {
          const { getCurvaETTI } = await import("@/lib/herramientas/etti.functions");
          const args = argsRaw.trim() ? JSON.parse(argsRaw) as any : {};
          const res: any = await (getCurvaETTI as any)({ data: { tickers: args.tickers, sessionId, fechaLiquidacion: args.fechaLiquidacion } });
          const r = res as any;
          // Si es Response, intentar json
          const data = r?.puntos ? r : r;
          const txt = [
            `Curva ETTI spot soberana al ${data.fechaLiquidacion ?? ""} — forma ${data.forma} (${data.justificacionForma})`,
            ...data.puntos.map((p: any) => `${p.ticker} ${p.vencimiento} (${p.diasAlVencimiento}d) spot TEA ${(p.spotTEA!=null?(p.spotTEA*100).toFixed(2)+"%":"N/D")} TIR ${(p.tir!=null?(p.tir*100).toFixed(2)+"%":"N/D")} precio ${p.precioClean ?? "N/D"}`),
            ...data.forwards.map((f: any) => `Forward ${f.desde}→${f.hasta} ${f.diasForward}d ${f.forwardTEA!=null?(f.forwardTEA*100).toFixed(2)+"%":"N/D"} (${f.formula})`),
            ...(data.advertencias?.length ? [`Advertencias: ${data.advertencias.join("; ")}`] : []),
          ].join("\n");
          return { texto: txt, fuentes: [], ok: true };
        } catch (e) {
          return { texto: `SIN RESULTADOS: consultar_curva_etti falló (${e instanceof Error ? e.message : String(e)})`, fuentes: [], ok: false };
        }
      }
      case "calcular_yield_call": {
        try {
          const { calcularYieldToCall } = await import("@/lib/herramientas/bonos-callable.functions");
          const args = argsRaw.trim() ? JSON.parse(argsRaw) as any : {};
          const res: any = await (calcularYieldToCall as any)({ data: { ticker: args.ticker, precioPorCada100VN: args.precioPorCada100VN, sessionId, fechaLiquidacion: args.fechaLiquidacion, calls: args.calls } });
          const r = res as any;
          const txt = [
            `YTC/YTM ${r.ticker} ${r.descripcion} vto ${r.vencimiento} liq ${r.fechaLiquidacion} precio ${r.precioClean}`,
            `YTM TEA ${r.teaVencimiento!=null?(r.teaVencimiento*100).toFixed(2)+"%":"N/D"} TIR ${r.tirVencimiento!=null?(r.tirVencimiento*100).toFixed(2)+"%":"N/D"}`,
            ...r.ytc.map((y: any) => `YTC call ${y.fechaCall} @${y.precioCall} ${y.diasAlCall}d TEA ${y.teaCall!=null?(y.teaCall*100).toFixed(2)+"%":"N/D"}`),
            `Yield to Worst ${r.yieldToWorst.tipo} ${r.yieldToWorst.fecha ?? ""} ${(r.yieldToWorst.valor!=null?(r.yieldToWorst.valor*100).toFixed(2)+"%":"N/D")}`,
            ...(r.advertencias?.length ? [`Notas: ${r.advertencias.join("; ")}`] : []),
          ].join("\n");
          return { texto: txt, fuentes: [], ok: true };
        } catch (e) {
          return { texto: `SIN RESULTADOS: calcular_yield_call falló (${e instanceof Error ? e.message : String(e)})`, fuentes: [], ok: false };
        }
      }
      case "calcular_total_return": {
        try {
          const { calcularTotalReturn } = await import("@/lib/herramientas/bonos-callable.functions");
          const args = argsRaw.trim() ? JSON.parse(argsRaw) as any : {};
          const res: any = await (calcularTotalReturn as any)({ data: { ticker: args.ticker, horizonteDias: args.horizonteDias ?? 365, precioPorCada100VN: args.precioPorCada100VN, tasaReinversionTEA: args.tasaReinversionTEA, sessionId, fechaLiquidacion: args.fechaLiquidacion } });
          const r = res as any;
          const txt = [
            `Total Return ${r.ticker} horizonte ${r.horizonteDias}d → ${r.horizonteFecha} liq ${r.fechaLiquidacion} precioIni ${r.precioInicial}`,
            `Precio teórico al horizonte ${r.precioFinalTeorico ?? "N/D"} cupones ${r.cuponesCobrados} reinversión ${r.reinversionAcumulada.toFixed(2)} (TEA ${(r.tasaReinversion*100).toFixed(2)}%)`,
            `Valor total ${r.valorTotal.toFixed(2)} TR ${(r.totalReturn!=null?(r.totalReturn*100).toFixed(2)+"%":"N/D")} anualizado ${(r.totalReturnAnualizado!=null?(r.totalReturnAnualizado*100).toFixed(2)+"%":"N/D")}`,
            ...r.detalleFlujos.slice(0,8).map((d: any) => `  ${d.fecha} ${d.monto} → reinv ${d.reinvertido.toFixed(2)} (${d.dias}d)`),
          ].join("\n");
          return { texto: txt, fuentes: [], ok: true };
        } catch (e) {
          return { texto: `SIN RESULTADOS: calcular_total_return falló (${e instanceof Error ? e.message : String(e)})`, fuentes: [], ok: false };
        }
      }
      case "calcular_stripped_yield": {
        try {
          const { calcularStrippedYield } = await import("@/lib/herramientas/bonos-callable.functions");
          const args = argsRaw.trim() ? JSON.parse(argsRaw) as any : {};
          const res: any = await (calcularStrippedYield as any)({ data: { ticker: args.ticker, precioPorCada100VN: args.precioPorCada100VN, sessionId, fechaLiquidacion: args.fechaLiquidacion } });
          const r = res as any;
          const txt = [
            `Stripped yield ${r.ticker} liq ${r.fechaLiquidacion} precio ${r.precioClean}`,
            ...r.stripped.map((s: any) => `${s.fecha} t=${s.anos.toFixed(2)}y zero TEA ${s.zeroTEA!=null?(s.zeroTEA*100).toFixed(2)+"%":"N/D"}`),
            ...(r.advertencias?.length ? [`Notas: ${r.advertencias.join("; ")}`] : []),
          ].join("\n");
          return { texto: txt, fuentes: [], ok: true };
        } catch (e) {
          return { texto: `SIN RESULTADOS: calcular_stripped_yield falló (${e instanceof Error ? e.message : String(e)})`, fuentes: [], ok: false };
        }
      }
      case "consultar_semaforo_riesgo_bono": {
        try {
          const { getSemaforoRiesgoBono } = await import("@/lib/herramientas/riesgo-bono.functions");
          const args = argsRaw.trim() ? JSON.parse(argsRaw) as any : {};
          const res: any = await (getSemaforoRiesgoBono as any)({ data: { ticker: args.ticker, sessionId, precioPorCada100VN: args.precioPorCada100VN } });
          const r = res as any;
          const txt = [
            `Semáforo riesgos ${r.ticker} ${r.descripcion} vto ${r.vencimiento} precio ${r.precio} TIR ${(r.tir!=null?(r.tir*100).toFixed(2)+"%":"N/D")} Dur.Mod ${r.durationMod?.toFixed(2) ?? "N/D"} — ${r.semaforo} (score ${r.scoreProm}/5)`,
            ...r.factores.map((f: any) => `${f.nombre}: ${f.nivel}/5 ${f.valor ?? ""} — ${f.justificacion}`),
          ].join("\n");
          return { texto: txt, fuentes: [], ok: true };
        } catch (e) {
          return { texto: `SIN RESULTADOS: semáforo riesgo bono falló (${e instanceof Error ? e.message : String(e)})`, fuentes: [], ok: false };
        }
      }
      case "calcular_tir_portafolio": {
        try {
          const { calcularTIRPortafolio } = await import("@/lib/herramientas/portafolio-tir.functions");
          const args = argsRaw.trim() ? JSON.parse(argsRaw) as any : {};
          const res: any = await (calcularTIRPortafolio as any)({ data: { posiciones: args.posiciones, sessionId, horizonteDias: args.horizonteDias, tasaReinversionTEA: args.tasaReinversionTEA } });
          const r = res as any;
          const txt = [
            `TIR portafolio RF total USD ${r.totalValor.toFixed(2)} pctConTIR ${(r.pctConTIR*100).toFixed(1)}%`,
            `Agregados TEA ${(r.agregados.teaPonderada!=null?(r.agregados.teaPonderada*100).toFixed(2)+"%":"N/D")} TIR ${(r.agregados.tirPonderada!=null?(r.agregados.tirPonderada*100).toFixed(2)+"%":"N/D")} Dur ${r.agregados.durationPonderada?.toFixed(2) ?? "N/D"}`,
            ...r.posiciones.map((p: any) => `${p.ticker} ${p.cantidad} VN peso ${(p.peso*100).toFixed(1)}% TIR ${(p.tir!=null?(p.tir*100).toFixed(2)+"%":"N/D")} precio ${p.precio}`),
            `Composición por tipo: ${r.composicion.porTipo.map((x: any)=>`${x.nombre} ${(x.pct*100).toFixed(1)}%`).join(", ")}`,
          ].join("\n");
          return { texto: txt, fuentes: [], ok: true };
        } catch (e) {
          return { texto: `SIN RESULTADOS: TIR portafolio falló (${e instanceof Error ? e.message : String(e)})`, fuentes: [], ok: false };
        }
      }
      case "analisis_completo": {
        const res = await ejecutarAnalisisCompleto(argsRaw, sessionId);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok, eventos: (res as any).eventos };
      }
      case "validar_analisis": {
        const res = await ejecutarValidarAnalisis(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: res.ok };
      }
      case "walkforward_bb_rsi": {
        const { ejecutarWalkForwardBbRsi } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarWalkForwardBbRsi(argsRaw)) };
      }
      case "mm_inventario_sim": {
        const { ejecutarMMInventario } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarMMInventario(argsRaw)) };
      }
      case "mm_hjb_sim": {
        const { ejecutarMMHJB } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarMMHJB(argsRaw)) };
      }
      case "ejecucion_optima_crypto": {
        const { ejecutarEjecucionOptimaCrypto } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarEjecucionOptimaCrypto(argsRaw)) };
      }
      case "pairs_crypto_scan": {
        const { ejecutarPairsCryptoScan } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarPairsCryptoScan(argsRaw)) };
      }
      case "pairs_crypto_analizar": {
        const { ejecutarPairsCryptoAnalizar } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarPairsCryptoAnalizar(argsRaw)) };
      }
      case "interpretar_oportunidades": {
        const { ejecutarInterpretarOportunidades } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarInterpretarOportunidades(argsRaw)) };
      }
      case "analizar_opciones": {
        const { ejecutarCadenaOpciones } = await import("@/lib/agents/ejecutores");
        const res = await ejecutarCadenaOpciones(argsRaw);
        return { texto: res.texto, fuentes: res.fuentes, ok: true };
      }
      case "calcular_tir_bono": {
        // Alias real de YTM (antes caía al default de búsqueda web con query vacía).
        const { ejecutarYTM } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarYTM(argsRaw, sessionId)) };
      }
      case "consultar_principios_etico": {
        const { ejecutarEtica } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarEtica(argsRaw, "principios")) };
      }
      case "verificar_cumplimiento_etico": {
        const { ejecutarEtica } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarEtica(argsRaw, "verificar")) };
      }
      case "obtener_guia_comportamiento": {
        const { ejecutarEtica } = await import("@/lib/agents/ejecutores");
        return { ...(await ejecutarEtica(argsRaw, "guia")) };
      }
      default:
      return { ...(await ejecutarBusqueda(query)), ok: true };
  }
  });
}

/** Envía al chat los eventos (gráficos / informes) que produjo una herramienta. */


/** Extrae el "enfoque" del JSON final del coordinador (tolera texto envolvente). */

/** Extrae un ticker o nombre de empresa de una pregunta de valoración. */

/** Extrae el activo/tema de una pregunta de movimiento de mercado. */

/** True si un texto de herramienta trae contenido real (no el marcador de vacío). */

/** Ejecuta el turno completo del sistema multi-agente. */
/**
 * COMPUERTA DE RAZONAMIENTO PREVIO.
 * Única llamada con thinking ON que interpreta el lenguaje natural humano
 * ANTES de enrutar o ejecutar cualquier tool: intención real, entidades,
 * inventario de adjuntos (con estado de visión), roles y herramientas
 * sugeridas, y un prompt enriquecido para el resto del pipeline.
 * Fail-open: ante cualquier error devuelve null y el flujo sigue como siempre.
 */
