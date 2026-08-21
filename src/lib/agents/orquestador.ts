/**
 * Orquestador del sistema multi-agente de IA.
 *
 * Flujo:
 * 1. Router: detecta qué agentes especializados corresponden a la pregunta.
 * 2. Cola de tareas: despacha a los agentes en paralelo (respuesta rápida).
 *    Cada agente ejecuta sus herramientas y deja una nota en la pizarra
 *    compartida (interacción entre agentes).
 * 3. Coordinador: razona sobre las notas y los resultados, ejecuta lo que
 *    falte (red de seguridad) y deja el enfoque de redacción.
 * 4. Redactor: redacta la respuesta final con memoria, pizarra y enfoque.
 */

import { ColaDeTareas } from "@/lib/agents/queue";
import { MemoriaDeSesion } from "@/lib/agents/memory";
import { AGENTES, obtenerAgente, type RolAgente } from "@/lib/agents/registry";
import { TOOLS, estadoDeHerramienta, NOMBRE_HERRAMIENTAS } from "@/lib/agents/herramientas";
import {
  ejecutarMercado,
  ejecutarNoticias,
  ejecutarBaseConocimiento,
  ejecutarDCF,
  ejecutarValorIntrinseco,
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
  ejecutarDatosFinancieros,
  ejecutarGraficoChat,
  ejecutarGenerarInforme,
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
  plannerPrompt: string;
  siteContext: string;
  ragMsg?: ApiMsg;
  /** Id de sesión del chat: clave de la sesión IOL y de la memoria persistente. */
  sessionId?: string;
};

const MODELO_AGENTES = MODELO_POR_DEFECTO; // rapidez: los especialistas responden al toque.

/** Quita tildes/diacríticos para comparar sin acentos. */
function normalizarSinAcentos(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function esPreguntaDeCausa(pregunta: string): boolean {
  return /(?:por\s*qu[eé]|cu[aá]l\s*(?:es\s*)?(?:la\s*)?causa|qu[eé]\s*pas[oó]\s*(?:con)?)\s*.*?(?:cay[oó]|subi[oó]|baj[oó]|se\s+mov[ií]o|se\s+derrumb[oó]|se\s+hund[ií]o|se\s+dispar[oó]|salt[oó]|rebot[oó]|perdi[oó]|gan[oó])|qu[eé]\s*pas[oó]\s+con/i.test(
    pregunta,
  );
}

function esPreguntaValoracion(pregunta: string): boolean {
  return /(?:valor\s+intr[íi]nsec|cu[aá]nto\s+vale|cu[aá]l\s+es\s+el\s+valor|analiz[aá]\s+el\s+valor|dcf\s+de\s+|flujo\s+de\s+caja\s+descontad|valuaci[oó]n|valorar\s+la\s+empresa|valor\s+de\s+la\s+empresa|valor\s+por\s+acci[oó]n)/i.test(
    pregunta,
  );
}

function esPreguntaSemaforo(pregunta: string): boolean {
  const p = pregunta.toLowerCase();
  // Preguntas educativas o conceptuales NO activan el semáforo (las cubre el agente de conocimiento).
  if (
    /qu[eé]\s+es|qu[eé]\s+son|explic[ae]|defin[ií]|significa|curso|aprender|qu[eé]\s+es\s+un|qu[eé]\s+es\s+una|para\s+qu[eé]\s+sirve/.test(
      p,
    )
  ) {
    return false;
  }
  const conTarget =
    /(?:rsi|macd|medias?\s+m[óo]viles|indicadores?\s+t[eé]cnicos|soportes?\s+y\s+resistencias|soporte\s+y\s+resistencia|t[eé]cnico)\s+(?:de\s+|del\s+|de\s+la\s+)/.test(
      p,
    );
  return (
    /sem[áa]foro/.test(p) ||
    /an[áa]lisis\s+t[eé]cnico/.test(p) ||
    /an[áa]lisis\s+t[eé]cnico\s+y\s+fundamental/.test(p) ||
    /indicadores\s+t[eé]cnicos/.test(p) ||
    /soportes?\s+y\s+resistencias|soporte\s+y\s+resistencia/.test(p) ||
    /conviene\s+(?:comprar|vender)|comprar\s+o\s+vender|se[nñ]al\s+de\s+(?:compra|venta)|qu[eé]\s+me\s+conviene/.test(
      p,
    ) ||
    /an[áa]lisis\s+fundamental\s+de/.test(p) ||
    conTarget
  );
}

/** Preguntas de análisis cuantitativo: beta/CAPM, matriz, sectores, distribución, portafolio, factores, hedge. */
function esPreguntaCuantitativa(pregunta: string): boolean {
  const p = pregunta.toLowerCase();
  return (
    /beta|capm|coeficiente\s+beta|riesgo\s+sistem[aá]tico/.test(p) ||
    /matriz\s+de\s+(?:beta|correlaci[oó]n)/.test(p) ||
    /correlaci[oó]n|correlaciones|qu[eé]\s+tan\s+relacionad/.test(p) ||
    /a\s+qu[eé]\s+sector|perfil\s+sectorial|benchmark\s+sectorial/.test(p) ||
    /distribuci[oó]n\s+de\s+retornos|es\s+normal\b|normalidad|es\s+as[íi]m[ée]tric|jarque|skewness|curtosis|sesgo\b|asimetr[íi]a|cola\s+gruesa|var\s*95|sharpe\b|volatilidad\s+anual/.test(
      p,
    ) ||
    /desv[íi]o\b|desviaci[oó]n\b|volatilidad\b|sigma\b|riesgo\s+de\s+[a-zñáéíóú]+|riesgo\s+del\s+[a-zñáéíóú]+|estandar\b|std\b|drawdown|c[aá]lcula\s+el\s+riesgo|m[aá]ximo\s+drawdown|var\s*99|cvar\b/.test(
      p,
    ) ||
    /optimiz[aá].*portafolio|optimiz[aá].*cartera|m[ií]nima\s+varianza|min.{0,3}variance|frontera\s+eficiente|pesos\s+de\s+(?:la\s+)?cartera|c[oó]mo\s+distribuyo|qu[eé]\s+ponderaci[oó]n|covarianza|matriz\s+de\s+covarianza|markowitz|pca|componentes\s+principales/.test(
      p,
    ) ||
    /cobertura|hedge|cubr\w*\s+(?:la\s+|el\s+|mi\s+)?(?:cartera|portafolio|posiciones?|exposici[oó]n)|neutraliz|hedging/.test(
      p,
    ) ||
    /factores\s+maestros|qu[eé]\s+factores|a\s+qu[eé]\s+se\s+correlaciona|estilo\s+de\s+/.test(p) ||
    /rebalanceo|ponderaci[oó]n\s+de\s+activos/.test(p)
  );
}

/**
 * Detecta credenciales de IOL escritas en el mensaje del usuario, en los
 * formatos más comunes:
 *  - "inicia sesión en iol usuario@gmail.com mipassword"
 *  - "usuario: X password: Y" / "mi usuario es X y mi contraseña Y"
 * Devuelve null si no hay credenciales reconocibles.
 */
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
function esPreguntaVerificacionCNV(pregunta: string): boolean {
  const p = pregunta.toLowerCase();
  const mencionaCNV =
    /cnv|comisi[oó]n\s+nacional\s+de\s+valores|registro\s+p[úu]blico(\s+de\s+agentes|\s+de\s+productores)?/.test(
      p,
    );
  if (!mencionaCNV) return false;
  return /matr[íi]cula|regulad|registr|verific|br[oó]?ker|agente\s+de\s+mercado|entidad|habilitad|autorizad|intermedi|inscript|listad|es\s+de\s+confianza/.test(
    p,
  );
}

/** Router: qué agentes especializados corresponden a la pregunta. */
export function enrutar(pregunta: string): Set<RolAgente> {
  const p = pregunta.toLowerCase();
  const activos = new Set<RolAgente>();
  if (
    /d[óo]lar|riesgo\s+pa[íi]s|uva|inflaci[óo]n|lecap|boncap|plazo\s+fijo|fci|fondo\s+com[úu]n|euro|cotizaci[óo]n|tasa|badlar|leliq|tm20|pases\b|cauci[óo]n|cotiza/.test(
      p,
    )
  ) {
    activos.add("mercado");
  }
  if (
    esPreguntaDeCausa(pregunta) ||
    /notici|novedad|qu[eé]\s*pas[oó]|mercado\s+hoy|actualidad|última\s+hora/.test(p)
  ) {
    activos.add("noticias");
  }
  if (
    /qu[eé]\s*es|qu[eé]\s*son|c[oó]mo\s+funciona|qu[eé]\s*es\s+un|c[oó]mo\s+.*invertir|c[oó]mo\s+empiezo|servicio|instrumento|broker|cedear|adr|bono|acci[oó]n|obligaci[oó]n\s+negociable|perfil\s+de\s+riesgo|estafa|matr[íi]cula|cnv|diferencia\s+entre|portafolio|cartera/.test(
      p,
    )
  ) {
    activos.add("conocimiento");
  }
  if (esPreguntaValoracion(pregunta)) {
    activos.add("valoracion");
  }
  if (esPreguntaSemaforo(pregunta)) {
    activos.add("semaforo");
  }
  if (esPreguntaCuantitativa(pregunta)) {
    activos.add("cuantitativo");
  }
  if (activos.size === 0) {
    activos.add("conocimiento");
  }
  return activos;
}

/**
 * Detector complementario de intención para elegir las SKILLS que se inyectan
 * al prompt del redactor/planner (NO reemplaza a enrutar()).
 * - enrutar() decide qué AGENTES trabajan (y por ende qué herramientas se ejecutan).
 * - detectarIntencionSkill() decide qué framework de razonamiento se usa para
 *   interpretar esos resultados (marco metodológico específico por tipo de análisis).
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

  return skills;
}

export { detectarIntencionSkill };

type AgentResult = {
  rol: RolAgente;
  texto: string;
  fuentes: FuenteMercado[];
};

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
  if (tools && tools.length) {
    const disponibles = TOOLS.filter((t) => tools.includes(t.function.name));
    if (disponibles.length) {
      body["tools"] = disponibles;
      body["tool_choice"] = "auto";
    }
  }
  return postCompletionsResiliente(apiKey, body);
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
  const { query, periodo, simbolo } = extraerDatosTool(argsRaw);
  // Nunca volcar credenciales de IOL al log del servidor.
  const argsParaLog = name === "iol_login" ? "<credenciales ocultas>" : argsRaw.slice(0, 220);
  console.log(`[TOOL] ${name} ${argsParaLog}`); // TEMP PASO4
  switch (name) {
    case "consultar_mercado":
      return { ...(await ejecutarMercado(query)), ok: true };
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
    case "datos_financieros":
      return await ejecutarDatosFinancieros(argsRaw);
    case "grafico_chat":
      return await ejecutarGraficoChat(argsRaw);
    case "generar_informe":
      return await ejecutarGenerarInforme(argsRaw);
    default:
      return { ...(await ejecutarBusqueda(query)), ok: true };
  }
}

/** Envía al chat los eventos (gráficos / informes) que produjo una herramienta. */
function enviarEventos(enviar: Enviar, eventos?: EventoChat[]): void {
  for (const ev of eventos ?? []) enviar(ev);
}

/** Un agente especializado: modelo rápido + sus herramientas + nota en la pizarra. */
async function trabajarAgente(
  rol: RolAgente,
  pregunta: string,
  historial: Msg[],
  apiKey: string,
  baseUrl: string | undefined,
  enviar: Enviar,
  siteContext: string,
  memoria: MemoriaDeSesion,
  orquestacion: ConfiguracionOrquestacion,
  ragMsg?: ApiMsg,
  sessionId = "anon",
): Promise<AgentResult> {
  const agente = obtenerAgente(rol);
  enviar({ t: "status", v: agente.status, q: pregunta });
  const esAnalisis = rol === "valoracion" || rol === "semaforo" || rol === "noticias";
  const modeloAgente = esAnalisis ? orquestacion.modeloPlanner : MODELO_AGENTES;
  const mensajes: ApiMsg[] = [
    { role: "system", content: agente.sistema },
    { role: "system", content: siteContext },
  ];
  const reglaUniversalRazonamiento = construirPromptSkills([]);
  if (reglaUniversalRazonamiento) {
    mensajes.push({ role: "system", content: reglaUniversalRazonamiento });
  }
  const ctxMemoria = memoria.contextoMemoria();
  if (ctxMemoria) mensajes.push({ role: "system", content: ctxMemoria });
  if (ragMsg) mensajes.push(ragMsg);
  mensajes.push(...historial.map((m) => ({ role: m.role, content: m.content })), {
    role: "user",
    content: pregunta,
  });

  let nota = "";
  let fuentes: FuenteMercado[] = [];
  const limite = esAnalisis ? 3 : 2;
  for (let ronda = 0; ronda < limite; ronda++) {
    const opciones: Record<string, number | boolean> = {
      maxTokens: esAnalisis ? modeloAgente.maxTokens : 2048,
      enableThinking: esAnalisis && modeloAgente.enableThinking,
    };
    if (esAnalisis) opciones["reasoningBudget"] = 4096;
    const res = await llamarModelo(
      apiKey,
      modeloAgente.id,
      mensajes,
      agente.herramientas,
      opciones,
    );
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error(`[agente ${rol}] error`, res.status, detalle.slice(0, 300));
      nota = "";
      break;
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };
    const msg = data.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (!calls.length) {
      nota = (msg?.content ?? "").trim();
      break;
    }
    mensajes.push({ role: "assistant", content: msg?.content ?? "", tool_calls: calls });
    for (const call of calls) {
      const name = call.function?.name ?? "buscar_web";
      const argsRaw = call.function?.arguments ?? "";
      const ejecucion = await ejecutarTool(name, argsRaw, baseUrl, sessionId);
      fuentes = [...fuentes, ...ejecucion.fuentes];
      if (ejecucion.fuentes.length) enviar({ t: "sources", v: ejecucion.fuentes });
      enviarEventos(enviar, ejecucion.eventos);
      mensajes.push({
        role: "tool",
        tool_call_id: call.id ?? "0",
        name,
        content: `Datos reales de ${name} (fuentes externas):\n\n${ejecucion.texto}`,
      });
      enviar({ t: "status", v: agente.status, q: pregunta });
    }
  }
  if (nota) memoria.escribirPizarra({ desde: rol, hacia: "coord", texto: nota });
  return { rol, texto: nota, fuentes };
}

/** Extrae el "enfoque" del JSON final del coordinador (tolera texto envolvente). */
function parsearPlan(texto: string): { enfoque: string } {
  const fallback = { enfoque: "" };
  try {
    const inicio = texto.indexOf("{");
    const fin = texto.lastIndexOf("}");
    if (inicio === -1 || fin === -1 || fin <= inicio) return fallback;
    const obj = JSON.parse(texto.slice(inicio, fin + 1));
    if (typeof obj !== "object" || obj === null) return fallback;
    return { enfoque: typeof obj["enfoque"] === "string" ? obj["enfoque"] : "" };
  } catch {
    return fallback;
  }
}

/** Extrae un ticker o nombre de empresa de una pregunta de valoración. */
function extraerTickerPregunta(pregunta: string): string | null {
  const RUIDOS = new Set([
    "EL",
    "LA",
    "LOS",
    "LAS",
    "CON",
    "DE",
    "DEL",
    "AL",
    "PARA",
    "ES",
    "SON",
    "VALOR",
    "INTRINSECO",
    "DCF",
    "IA",
    "CNV",
    "USO",
    "POR",
    "QUE",
    "CUANTO",
    "CUAL",
    "UNA",
    "UN",
    "METODOLOGIA",
    "ANALIZA",
    "ANALIZAR",
    "PRECIO",
    "ACCION",
    "EMPRESA",
    "WACC",
    "CAPM",
    "BETA",
    "RSI",
    "MACD",
    "SMA",
    "EMA",
    "STOCH",
    "SOBRE",
    "INDICADOR",
    "INDICADORES",
    "TENDENCIA",
    "MOMENTUM",
    "SEMAFORO",
    "SOPORTES",
    "SOPORTE",
    "RESISTENCIAS",
    "RESISTENCIA",
    "COMPRA",
    "VENTA",
    "CALCUALO",
    "CALCULALO",
    "CALCULA",
    "CALCULE",
    "ME",
    "TENES",
    "TENE",
    "QUIERES",
    "USANDO",
    "COMO",
    "SE",
    "HACE",
    "HACER",
    "EXPLICA",
    "EXPLICAR",
    "SABER",
    "PODES",
    "PUEDO",
    "METODO",
    "FORMULA",
    "CALCULAR",
    "DECIME",
    "ESA",
    "ESO",
    "ESTA",
    "EMPREZA",
  ]);
  const limpio = normalizarSinAcentos(pregunta).replace(/[¿?¡!.,;:()]/g, " ");
  const tokens = limpio.match(/\b([A-Z][A-Z0-9]{0,7}(?:\.[A-Z]{1,4})?)\b/g) ?? [];
  const candidatos = tokens.filter((t) => !RUIDOS.has(t));
  const conSufijo = candidatos.find((c) => c.includes("."));
  const simbolo = conSufijo ?? candidatos[0] ?? null;
  if (!simbolo) return null;
  return simbolo.length <= 24 ? simbolo : null;
}

/** Extrae el activo/tema de una pregunta de movimiento de mercado. */
function extraerActivo(pregunta: string): string {
  const limpio = pregunta.toLowerCase().replace(/[?¿¡!.,;:]/g, " ");
  const partes = limpio.split(
    /(?:por\s*qu[eé]|qu[eé]\s*pas[oó]\s*con|cu[aá]l\s*(?:es\s*)?(?:la\s*)?causa\s*(?:del|de)\s*)/,
  );
  const resto = partes[partes.length - 1] ?? "";
  const palabras = resto
    .split(/\s+/)
    .filter(
      (w) =>
        !/^(hoy|ayer|anoche|ya|el|la|los|las|de|del|en|al|y|o|a|se|su|sus|por|para|con|esta|este|estos|estas|semana|mes|a[nñ]o|dia|d[í]a|mercado|bolsa|cay[oó]|subi[oó]|baj[oó]|mov[ií]o|derrumb[oó]|hund[ií]o|dispar[oó]|salt[oó]|rebot[oó]|perdi[oó]|gan[oó])$/i.test(
          w,
        ),
    )
    .slice(0, 3)
    .join(" ");
  return palabras.trim() || "mercado argentino";
}

/** True si un texto de herramienta trae contenido real (no el marcador de vacío). */
function esTextoConDato(texto: string): boolean {
  const limpio = (texto ?? "").trim();
  return limpio.length > 0 && !/^SIN RESULTADOS/i.test(limpio);
}

/** Ejecuta el turno completo del sistema multi-agente. */
export async function orquestarTurno(opts: OpcionesOrquestador): Promise<ResultadoTurno> {
  const {
    pregunta,
    historial,
    memoria,
    orquestacion,
    apiKey,
    baseUrl,
    enviar,
    systemPrompt,
    plannerPrompt,
    siteContext,
    ragMsg,
    sessionId = "anon",
  } = opts;

  const fuentes: FuenteMercado[] = [];
  // Registra si en este turno se obtuvo contenido REAL de noticias (no el
  // marcador "SIN RESULTADOS"). Sin esto, una pregunta de causa no se puede
  // responder con honestidad y se fuerza el fallback determinístico.
  let huboDatoNoticias = false;
  const cola = new ColaDeTareas(3);

  // 1) Router: qué agentes convocar.
  const activos = enrutar(pregunta);
  const roles = [...activos] as RolAgente[];

  // 2) Despacho en paralelo a través de la cola de tareas.
  if (roles.length > 1) enviar({ t: "status", v: "cola", q: roles.length });
  const agentes: AgentResult[] = [];
  const agentResultados: AgentResult[] = [];
  await Promise.all(
    roles.map((rol) =>
      cola.enqueue(() =>
        trabajarAgente(
          rol,
          pregunta,
          historial,
          apiKey,
          baseUrl,
          enviar,
          siteContext,
          memoria,
          orquestacion,
          ragMsg,
          sessionId,
        ),
      ),
    ),
  ).then((resultados) => {
    for (const r of resultados) {
      agentResultados.push(r);
      if (r.texto) agentes.push(r);
      fuentes.push(...r.fuentes);
    }
  });
  // El agente de noticias solo trae fuentes cuando encontró titulares reales.
  if (agentResultados.some((r) => r.rol === "noticias" && r.fuentes.length > 0)) {
    huboDatoNoticias = true;
  }

  const notasPizarra = memoria.leerPizarra();
  const notasTexto = notasPizarra
    .map((e) => `[${e.desde}] ${e.texto.replace(/\n/g, " ")}`)
    .join("\n\n");

  // 3) Coordinador: razona sobre las notas y ejecuta la red de seguridad.
  const agentMessages: ApiMsg[] = [
    { role: "system", content: plannerPrompt },
    { role: "system", content: siteContext },
  ];
  const promptSkillsPlanner = orquestacion.promptSkillsPlanner;
  if (promptSkillsPlanner) agentMessages.push({ role: "system", content: promptSkillsPlanner });
  if (notasTexto) {
    agentMessages.push({
      role: "system",
      content: `Notas de los agentes especializados (ya tienen datos reales con fuentes; usalos para decidir si falta algo):\n${notasTexto}`,
    });
  }
  if (ragMsg) agentMessages.push(ragMsg);
  agentMessages.push(...historial.map((m) => ({ role: m.role, content: m.content })));

  // Mensajes del redactor (copia base: crece con tool results y enfoque).
  const messages: ApiMsg[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: siteContext },
  ];
  const promptSkillsSalida = orquestacion.promptSkillsSalida;
  if (promptSkillsSalida) messages.push({ role: "system", content: promptSkillsSalida });
  const ctxMemoria = memoria.contextoMemoria();
  if (ctxMemoria) messages.push({ role: "system", content: ctxMemoria });
  if (notasTexto) {
    messages.push({
      role: "system",
      content: `Resultados de los agentes especializados (usar los datos con sus fuentes):\n${notasTexto}`,
    });
  }
  if (ragMsg) messages.push(ragMsg);
  messages.push(...historial.map((m) => ({ role: m.role, content: m.content })));

  let enfoque = "";
  let causaVerificada = false;
  let valoracionCalculada = false;
  let valoracionFallida = false;
  let textoValoracionFallida = "";
  let semaforoCalculado = false;
  let semaforoFallido = false;
  let semaforoFallidoDetalle = "";
  let asesorFallido = false;
  let asesorDetalle = "";
  let dcfEmpresa = "";
  let dcfValidadoWeb = false;
  const modeloPlanner = orquestacion.modeloPlanner;

  try {
    for (let ronda = 0; ronda < 4; ronda++) {
      const body: Record<string, unknown> = {
        model: modeloPlanner.id,
        messages: agentMessages,
        max_tokens: modeloPlanner.maxTokens,
        temperature: 0.2,
        chat_template_kwargs: { enable_thinking: modeloPlanner.enableThinking },
        stream: false,
      };
      if (modeloPlanner.enableThinking && modeloPlanner.reasoningBudget) {
        body["reasoning_budget"] = modeloPlanner.reasoningBudget;
      }
      body["tools"] = TOOLS;
      body["tool_choice"] = "auto";
      const planRes = await postCompletionsResiliente(apiKey, body);
      if (!planRes.ok) break;
      const planData = (await planRes.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
            tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
          };
        }>;
      };
      const planMsg = planData.choices?.[0]?.message;
      const planCalls = planMsg?.tool_calls ?? [];
      if (!planCalls.length) {
        enfoque = parsearPlan(planMsg?.content ?? "").enfoque;
        break;
      }
      const agentCallMsg: ApiMsg = {
        role: "assistant",
        content: planMsg?.content ?? "",
        tool_calls: planCalls,
      };
      agentMessages.push(agentCallMsg);
      messages.push(agentCallMsg);
      for (const call of planCalls) {
        const name = call.function?.name ?? "buscar_web";
        const argsRaw = call.function?.arguments ?? "";
        const { query, periodo } = extraerDatosTool(argsRaw);
        const esMercado = name === "consultar_mercado";
        const esNoticias = name === "buscar_noticias";
        const esBase = name === "consultar_base_conocimiento";
        const esDcf = name === "calcular_dcf";
        const esValoracion = name === "valor_intrinseco_real";
        const esSemaforo = name === "analizar_semaforo";
        enviar({
          t: "status",
          v: estadoDeHerramienta(name),
          q:
            esMercado || esNoticias
              ? query
              : esValoracion || esSemaforo
                ? extraerDatosTool(argsRaw).simbolo
                : query,
        });
        const ejecucion = await ejecutarTool(name, argsRaw, baseUrl, sessionId);
        fuentes.push(...ejecucion.fuentes);
        if (name === "buscar_noticias" && esTextoConDato(ejecucion.texto)) {
          huboDatoNoticias = true;
        }
        if (ejecucion.fuentes.length) enviar({ t: "sources", v: ejecucion.fuentes });
        enviarEventos(enviar, ejecucion.eventos);
        if (name === "iol_asesor" && !ejecucion.ok) {
          asesorFallido = true;
          asesorDetalle = ejecucion.texto.slice(0, 400);
        }
        if (!ejecucion.ok && esValoracion) {
          valoracionFallida = true;
          textoValoracionFallida = `No se pudo completar la valoración con datos reales en este momento.`;
        }
        if (!ejecucion.ok && esSemaforo) {
          semaforoFallido = true;
          semaforoFallidoDetalle = `No se pudo completar el semáforo técnico + fundamental con datos reales en este momento.`;
        }
        if (esPreguntaDeCausa(pregunta) && esNoticias) causaVerificada = true;
        if (esValoracion) valoracionCalculada = true;
        if (esSemaforo) semaforoCalculado = true;
        if (esDcf) {
          try {
            dcfEmpresa = String((JSON.parse(argsRaw) as { empresa?: string }).empresa ?? "");
          } catch {
            /* sin empresa */
          }
        }
        const toolMsg: ApiMsg = {
          role: "tool",
          tool_call_id: call.id ?? "0",
          name,
          content: `Datos reales de ${
            esMercado
              ? "las cotizaciones consultadas"
              : esNoticias
                ? `las noticias sobre "${query}"${periodo ? ` (período: ${periodo})` : ""}`
                : esBase
                  ? `la información interna del sitio sobre "${query}"`
                  : esDcf
                    ? "la valoración DCF calculada con los supuestos indicados"
                    : esValoracion
                      ? `la valoración con datos reales de Yahoo Finance, metodología del paper y noticias de sustento (fuentes externas). Interpretá el resultado comparando precio actual, valor calculado y consenso de analistas, y validalo con las noticias y la validación web adjuntas; señalá si el valor difiere del precio de mercado y por qué. No inventes cifras: si algo no está en estos datos, decilo con honestidad.`
                      : esSemaforo
                        ? `el semáforo técnico + fundamental con datos reales de Yahoo Finance (RSI, MACD, SMA, soportes/resistencias, anomalía, métricas fundamentales) y noticias de validación (fuentes externas). Presentá los indicadores y métricas tal cual figuran, explicá la coherencia entre la señal técnica y la fundamental, y aclará que es un análisis educativo y no una recomendación de inversión. No inventes cifras: si algo no está en estos datos, decilo con honestidad.`
                        : `la búsqueda "${query}"`
          } (fuentes externas):\n\n${ejecucion.texto}`,
        };
        agentMessages.push(toolMsg);
        messages.push(toolMsg);
      }
      enviar({ t: "status", v: "searching" });
    }
  } catch {
    /* si falla el coordinador, se sigue con lo que haya */
  }

  const MARKET_DOMINIOS = [
    "criptoya.com",
    "api.argentinadatos.com",
    "api.bcra.gob.ar",
    "mercados.ambito.com",
    "www.portfoliopersonal.com",
    "byma",
  ];

  // ---- Red de seguridad 0: pregunta de datos de mercado sin dato obtenido ----
  const esPreguntaMercado =
    roles.includes("mercado") &&
    /d[óo]lar|blue|mep|ccl|riesgo\s+pa[íi]s|uva|inflaci[óo]n|lecap|boncap|letra|plazo\s+fijo|fci|fondo\s+com[úu]n|tasa|badlar|leliq|tm20|pase|cauci[óo]n|euro|cotizaci[óo]n/.test(
      pregunta.toLowerCase(),
    );
  const yaHayDatoMercado = fuentes.some((f) =>
    MARKET_DOMINIOS.some((d) => f.dominio?.toLowerCase().includes(d)),
  );
  if (esPreguntaMercado && !yaHayDatoMercado) {
    const callId = `mercado_forzado_${Date.now()}`;
    const args = JSON.stringify({ query: pregunta });
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [{ id: callId, function: { name: "consultar_mercado", arguments: args } }],
    });
    enviar({ t: "status", v: "mercado", q: pregunta });
    console.log(`[TOOL] consultar_mercado (red-seguridad) ${args.slice(0, 160)}`); // TEMP PASO4
    const resultado = await ejecutarMercado(pregunta);
    fuentes.push(...resultado.fuentes);
    if (resultado.fuentes.length) enviar({ t: "sources", v: resultado.fuentes });
    messages.push({
      role: "tool",
      tool_call_id: callId,
      name: "consultar_mercado",
      content: `Datos reales de consultar_mercado (fuentes externas):\n\n${resultado.texto}`,
    });
    enviar({ t: "status", v: "searching" });
  }

  // ---- Red de seguridad 1: causa de movimiento no verificada ----
  if (esPreguntaDeCausa(pregunta) && !causaVerificada) {
    causaVerificada = true;
    const activo = extraerActivo(pregunta);
    const callId = `causa_${Date.now()}`;
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: callId,
          function: {
            name: "buscar_noticias",
            arguments: JSON.stringify({ query: activo, periodo: "hoy" }),
          },
        },
      ],
    });
    enviar({ t: "status", v: "noticias", q: activo });
    console.log(`[TOOL] buscar_noticias (red-seguridad) query=${activo} periodo=hoy`); // TEMP PASO4
    const noticias = await ejecutarNoticias(activo, "hoy");
    if (esTextoConDato(noticias.texto)) huboDatoNoticias = true;
    fuentes.push(...noticias.fuentes);
    if (noticias.fuentes.length) enviar({ t: "sources", v: noticias.fuentes });
    messages.push({
      role: "tool",
      tool_call_id: callId,
      name: "buscar_noticias",
      content: `Datos reales de las noticias sobre "${activo}" (período: hoy) (fuentes externas):\n\n${noticias.texto}`,
    });
    enviar({ t: "status", v: "searching" });
  }

  // ---- Red de seguridad 2: DCF sin validación web ----
  if (dcfEmpresa && !dcfValidadoWeb) {
    const callId = `dcf_validacion_${Date.now()}`;
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: callId,
          function: {
            name: "buscar_web",
            arguments: JSON.stringify({
              query: `${dcfEmpresa} acción cotización precio actual valor de mercado`,
            }),
          },
        },
      ],
    });
    enviar({ t: "status", v: "searching", q: dcfEmpresa });
    const valida = await validarDCFEnWeb(dcfEmpresa).catch(() => null);
    if (valida && valida.fuentes.length) {
      fuentes.push(...valida.fuentes);
      enviar({ t: "sources", v: valida.fuentes });
    }
    messages.push({
      role: "tool",
      tool_call_id: callId,
      name: "buscar_web",
      content: `Datos reales de mercado para validar el DCF de "${dcfEmpresa}" (fuentes externas):\n\n${
        valida?.texto ?? "SIN RESULTADOS: no se pudo validar el valor de mercado en la web."
      }`,
    });
    dcfValidadoWeb = true;
    enviar({ t: "status", v: "searching" });
  }

  // ---- Red de seguridad 3: valoración pedida pero no calculada ----
  if (esPreguntaValoracion(pregunta) && !valoracionCalculada) {
    const simboloExtraido = extraerTickerPregunta(pregunta);
    if (simboloExtraido) {
      valoracionCalculada = true;
      const callId = `valor_intrinseco_${Date.now()}`;
      const argsVal = JSON.stringify({ simbolo: simboloExtraido });
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [
          { id: callId, function: { name: "valor_intrinseco_real", arguments: argsVal } },
        ],
      });
      enviar({ t: "status", v: "valoracion", q: simboloExtraido });
      console.log(`[TOOL] valor_intrinseco_real (red-seguridad) ${argsVal.slice(0, 160)}`); // TEMP PASO4
      const resultado = await ejecutarValorIntrinseco(argsVal);
      if (!resultado.ok) {
        valoracionFallida = true;
        textoValoracionFallida = resultado.textoUsuario;
      }
      fuentes.push(...resultado.fuentes);
      if (resultado.fuentes.length) enviar({ t: "sources", v: resultado.fuentes });
      messages.push({
        role: "tool",
        tool_call_id: callId,
        name: "valor_intrinseco_real",
        content: `Valoración con datos reales de Yahoo Finance, metodología del paper y noticias de sustento (fuentes externas). Interpretá el resultado comparando precio actual, valor calculado y consenso de analistas, y validalo con las noticias y la validación web adjuntas; señalá si el valor difiere del precio de mercado y por qué. No inventes cifras:\n\n${resultado.texto}`,
      });
      enviar({ t: "status", v: "searching" });
    }
  }

  // ---- Red de seguridad 4: semáforo pedido pero no calculado ----
  if (esPreguntaSemaforo(pregunta) && !semaforoCalculado) {
    const simboloSemaforo = extraerTickerPregunta(pregunta);
    if (simboloSemaforo) {
      semaforoCalculado = true;
      const callId = `semaforo_${Date.now()}`;
      const argsSem = JSON.stringify({ simbolo: simboloSemaforo });
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [{ id: callId, function: { name: "analizar_semaforo", arguments: argsSem } }],
      });
      enviar({ t: "status", v: "semaforo", q: simboloSemaforo });
      console.log(`[TOOL] analizar_semaforo (red-seguridad) ${argsSem.slice(0, 160)}`); // TEMP PASO4
      const resultado = await ejecutarSemaforo(argsSem);
      if (!resultado.ok) {
        semaforoFallido = true;
        semaforoFallidoDetalle = resultado.textoUsuario;
      }
      fuentes.push(...resultado.fuentes);
      if (resultado.fuentes.length) enviar({ t: "sources", v: resultado.fuentes });
      messages.push({
        role: "tool",
        tool_call_id: callId,
        name: "analizar_semaforo",
        content: `Semáforo técnico + fundamental con datos reales de Yahoo Finance (RSI, MACD, SMA, soportes/resistencias, anomalía, métricas fundamentales) y noticias de validación (fuentes externas). Presentá los indicadores y métricas tal cual figuran, explicá la coherencia entre la señal técnica y la fundamental, y aclará que es un análisis educativo y no una recomendación de inversión. No inventes cifras:\n\n${resultado.texto}`,
      });
      enviar({ t: "status", v: "searching" });
    }
  }

  // ---- Red de seguridad 5: verificación de brokers/entidades en la CNV ----
  if (esPreguntaVerificacionCNV(pregunta)) {
    const yaVerificado = fuentes.some((f) => f.dominio?.toLowerCase().includes("cnv.gov.ar"));
    if (!yaVerificado) {
      const callId = `cnv_verificacion_${Date.now()}`;
      const argsCnv = JSON.stringify({
        query: `registro público de agentes y productores de la CNV matrícula ${pregunta}`.slice(
          0,
          300,
        ),
      });
      messages.push({
        role: "assistant",
        content: "",
        tool_calls: [{ id: callId, function: { name: "buscar_web", arguments: argsCnv } }],
      });
      enviar({ t: "status", v: "searching", q: pregunta });
      const verificacion = await ejecutarBusqueda(
        `registro público de agentes y productores de la CNV matrícula ${pregunta}`,
      ).catch(() => null);
      if (verificacion && verificacion.fuentes.length) {
        fuentes.push(...verificacion.fuentes);
        enviar({ t: "sources", v: verificacion.fuentes });
      }
      messages.push({
        role: "tool",
        tool_call_id: callId,
        name: "buscar_web",
        content: `Datos reales del Registro Público de la CNV (fuentes externas). Usalos para verificar matrículas/regulación: respondé SOLO con lo que aparece acá y citá la fuente.\n\n${
          verificacion?.texto ??
          "SIN RESULTADOS: no se pudo verificar la matrícula/regulación en el registro público. Decí que el dato no está confirmado y sugerí verificarlo en cnv.gov.ar."
        }`,
      });
      enviar({ t: "status", v: "searching" });
    }
  }

  // ---- Red de seguridad 6: credenciales de IOL en el mensaje → login forzado ----
  // Si el usuario escribió usuario+contraseña de IOL (en cualquier formato razonable),
  // el login se EJECUTA acá, sin depender de que el modelo decida invocar la herramienta.
  const credencialesIOL = detectarCredencialesIOL(pregunta);
  let loginIolForzadoOk = false;
  if (credencialesIOL && !iolSesionActiva(sessionId)) {
    const callId = `iol_login_forzado_${Date.now()}`;
    const argsLogin = JSON.stringify({
      usuario: credencialesIOL.usuario,
      password: credencialesIOL.password,
    });
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [{ id: callId, function: { name: "iol_login", arguments: argsLogin } }],
    });
    enviar({ t: "status", v: "iol", q: "inicio de sesión IOL" });
    console.log("[TOOL] iol_login (red-seguridad) <credenciales ocultas>");
    const loginRes = await ejecutarIolLogin(argsLogin, sessionId);
    loginIolForzadoOk = loginRes.ok;
    if (loginRes.fuentes.length) enviar({ t: "sources", v: loginRes.fuentes });
    messages.push({
      role: "tool",
      tool_call_id: callId,
      name: "iol_login",
      content: loginRes.ok
        ? `${loginRes.texto}\n\n${
            /(portafolio|cartera|posiciones|tenencia|saldo|estado de cuenta|operaciones|mis accion|mis bono|mis cedear)/i.test(
              pregunta,
            )
              ? "El usuario pidió ver sus datos: invocá AHORA iol_cuenta con la acción que corresponda (portafolio y/o estadocuenta) y presentá los resultados en una tabla."
              : "Informale al usuario que la sesión quedó activa y ofrecé qué puede consultar (portafolio, estado de cuenta, operaciones)."
          }`
        : `El inicio de sesión en IOL FALLÓ: ${loginRes.texto} Informalo con honestidad y no inventes datos de la cuenta.`,
    });
    enviar({ t: "status", v: "searching" });
  }

  // ---- Red de seguridad 7: sesión IOL activa + pide su portafolio/cuenta → datos forzados ----
  if (
    !credencialesIOL &&
    iolSesionActiva(sessionId) &&
    /(portafolio|cartera|posiciones|tenencia|saldo|estado de cuenta|estadocuenta|mis operaciones)/i.test(
      pregunta,
    ) &&
    !fuentes.some((f) => f.dominio?.includes("invertironline")) &&
    !notasTexto.includes("Portafolio IOL") &&
    !notasTexto.includes("Estado de cuenta IOL")
  ) {
    const callId = `iol_cuenta_forzado_${Date.now()}`;
    const accion = /saldo|estado de cuenta|estadocuenta/i.test(pregunta)
      ? "estadocuenta"
      : "portafolio";
    messages.push({
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: callId,
          function: {
            name: "iol_cuenta",
            arguments: JSON.stringify({ accion, pais: "argentina" }),
          },
        },
      ],
    });
    enviar({ t: "status", v: "iol", q: accion });
    const cuentaRes = await ejecutarIolCuenta(
      JSON.stringify({ accion, pais: "argentina" }),
      sessionId,
    );
    if (cuentaRes.fuentes.length) enviar({ t: "sources", v: cuentaRes.fuentes });
    messages.push({
      role: "tool",
      tool_call_id: callId,
      name: "iol_cuenta",
      content: cuentaRes.ok
        ? `Datos reales de la cuenta IOL del usuario:\n\n${cuentaRes.texto}`
        : `No se pudo obtener ${accion} de IOL: ${cuentaRes.texto}`,
    });
    enviar({ t: "status", v: "searching" });
  }

  // El enfoque del coordinador llega al redactor como guía.
  if (enfoque.trim()) {
    messages.push({ role: "user", content: `[Guía del análisis previo] ${enfoque.trim()}` });
  }

  // Valoración fallida: respuesta determinística honesta.
  if (valoracionFallida) {
    const texto =
      textoValoracionFallida ||
      "No se pudo completar la valoración con datos reales en este momento.";
    return {
      final: texto,
      fuentes,
      ...(textoValoracionFallida ? { textoValoracionFallida } : {}),
    };
  }

  // Semáforo fallido: respuesta determinística honesta.
  if (semaforoFallido) {
    return {
      final: semaforoFallidoDetalle || "No se pudo completar el análisis en este momento.",
      fuentes,
    };
  }

  // Módulo asesor rechazado por IOL (sin rol Asesor / sin comitentes vinculados):
  // respuesta determinística honesta, sin dejar que el modelo improvise.
  if (asesorFallido) {
    return {
      final:
        asesorDetalle ||
        "IOL rechazó la consulta del módulo asesor. La cuenta probablemente no tiene el rol de Asesor habilitado ni cuentas asesoradas vinculadas.",
      fuentes,
    };
  }

  // 4) Redactor: respuesta final, con acceso a las mismas herramientas.
  // Para preguntas que enrutaron al agente de noticias (causa / "qué pasó con X"),
  // se usa el modelo de razonamiento (planner): disciplina de tool calling y
  // anti-alucinación aunque el dato sea ambiguo.
  const modeloSalida = roles.includes("noticias")
    ? orquestacion.modeloPlanner
    : orquestacion.modeloSalida;
  let final = "";
  for (let intento = 0; intento < 3; intento++) {
    const opcionesInfladas: Record<string, number | boolean> = {
      maxTokens: modeloSalida.maxTokens,
      enableThinking: modeloSalida.enableThinking,
    };
    if (modeloSalida.reasoningBudget !== undefined) {
      opcionesInfladas["reasoningBudget"] = modeloSalida.reasoningBudget;
    }
    const res = await llamarModelo(
      apiKey,
      modeloSalida.id,
      messages,
      NOMBRE_HERRAMIENTAS,
      opcionesInfladas,
    );
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      console.error("AI gateway error", res.status, detalle.slice(0, 500));
      if (res.status === 429) {
        return {
          final: "Hay muchas consultas en este momento. Esperá unos segundos y volvé a intentar.",
          fuentes,
        };
      }
      return {
        final:
          "El asistente no está disponible ahora mismo. Podés escribirle directo a Cintia por WhatsApp.",
        fuentes,
      };
    }
    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
        };
      }>;
    };
    const msg = data.choices?.[0]?.message;
    const calls = msg?.tool_calls ?? [];
    if (calls.length && intento < 2) {
      messages.push({ role: "assistant", content: msg?.content ?? "", tool_calls: calls });
      for (const call of calls) {
        const name = call.function?.name ?? "buscar_web";
        const argsRaw = call.function?.arguments ?? "";
        const ejecucion = await ejecutarTool(name, argsRaw, baseUrl, sessionId);
        fuentes.push(...ejecucion.fuentes);
        if (name === "buscar_noticias" && esTextoConDato(ejecucion.texto)) {
          huboDatoNoticias = true;
        }
        if (ejecucion.fuentes.length) enviar({ t: "sources", v: ejecucion.fuentes });
        enviarEventos(enviar, ejecucion.eventos);
        messages.push({
          role: "tool",
          tool_call_id: call.id ?? "0",
          name,
          content: `Datos reales de ${name} (fuentes externas):\n\n${ejecucion.texto}`,
        });
        enviar({ t: "status", v: estadoDeHerramienta(name) });
      }
      continue;
    }
    final = (msg?.content ?? "").trim();
    if (final) break;
  }

  const ROTULOS_ESTRUCTURA =
    /PARTE\s*\(\s*[abc]\)|\bDatos\s+concretos\b|\bConexi[oó]n\s+con\s+el\s+servicio\b|\bCierre\s+suave\b/i;
  if (final && ROTULOS_ESTRUCTURA.test(final)) final = "";

  // ---- Red de seguridad: causa sin dato real de noticias → honestidad forzada ----
  // Si la pregunta es "qué pasó/por qué se movió X" y en TODO el turno no se
  // obtuvo contenido real de noticias (SIN RESULTADOS o búsqueda vacía), no se
  // deja que el modelo improvise una causa sobre el historial/RAG: se devuelve
  // un texto determinístico honesto (mismo patrón que valoración/semáforo).
  if (esPreguntaDeCausa(pregunta) && !huboDatoNoticias) {
    const activo = extraerActivo(pregunta);
    final = `Busqué en las fuentes de noticias y no encontré una razón puntual confirmada para ${activo} en las últimas horas. No te voy a inventar una causa. Si querés, puedo ampliar el período, consultarte por otro activo o pasarte el contacto de Cintia por WhatsApp para revisarlo en detalle.`;
  }

  if (!final) {
    final =
      "No pude generar una respuesta confiable para eso. Podés escribirle directo a Cintia por WhatsApp.";
  }

  return { final, fuentes };
}
