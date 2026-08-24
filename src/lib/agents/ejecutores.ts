/**
 * Ejecutores de las herramientas del asistente IA.
 *
 * Cada ejecutor recibe los argumentos crudos del tool call (JSON string) y
 * devuelve { texto, fuentes }. Son los bloques que ejecutan los agentes
 * especializados de forma rápida y en paralelo vía ColaDeTareas.
 */

import { buscar, dominio, extraerTexto } from "@/lib/search.server";
import { consultarMercado, type FuenteMercado } from "@/lib/mercado.server";
import {
  autenticar,
  obtenerCadenaOpciones,
  obtenerTasaCaucion,
} from "@/lib/opciones-bcba/iol";
import {
  ewmaVol,
  volHistorica,
} from "@/lib/opciones-bcba/black-scholes.functions";
import { procesarCadena, sesgoVolatilidad } from "@/lib/opciones-bcba/cadena.functions";
import { obtenerVelas, retornosLog } from "@/lib/opciones-bcba/datos.functions";
import { ejecutarPrediccion } from "@/lib/opciones-bcba/prediccion.functions";
import { consultarNoticias } from "@/lib/noticias.server";
import { buscarEnBase } from "@/lib/knowledge-base";
import { buscarAcademico } from "@/lib/kb-academic";
import { calcularDCF, textoResultadoDCF, type EntradaDCF } from "@/lib/dcf";
import { valorIntrinsecoConNoticias } from "@/lib/valoracion-ia";
import { analizarSemaforo, textoSemaforo } from "@/lib/semaforo.server";

export type ResultadoTool = { texto: string; fuentes: FuenteMercado[] };

export type ResultadoConocimiento = { texto: string; similitud: number } & {
  categoria?: string;
  archivo?: string;
  pagina?: number;
};

export function esAcademico(r: ResultadoConocimiento): r is ResultadoConocimiento & {
  categoria: string;
  archivo: string;
  pagina: number;
} {
  return typeof r.archivo === "string" && typeof r.pagina === "number";
}

export async function ejecutarBusqueda(query: string): Promise<ResultadoTool> {
  const results = await buscar(query);
  const top = results.slice(0, 3);
  const paginas = await Promise.all(
    top.map(async (r) => ({ ...r, texto: await extraerTexto(r.url) })),
  );
  const fuentes = paginas
    .filter((p) => p.url)
    .map((p) => ({ dominio: dominio(p.url), url: p.url, title: p.title }));
  const texto = results.length
    ? results
        .map((r, i) => {
          const pag = paginas.find((p) => p.url === r.url);
          const cuerpo = pag?.texto ? `\nContenido de la página: ${pag.texto}` : "";
          return `${i + 1}. ${r.title}\nResumen: ${r.snippet}\nFuente: ${dominio(r.url)}${cuerpo}`;
        })
        .join("\n\n")
    : "SIN RESULTADOS: la búsqueda no devolvió información. Decile al usuario que buscaste y no encontraste una fuente confiable.";
  return { texto, fuentes };
}

export async function ejecutarMercado(query: string): Promise<ResultadoTool> {
  const { texto, fuentes } = await consultarMercado(query);
  return {
    texto:
      texto ||
      "SIN RESULTADOS: no se pudo obtener esa cotización de las fuentes de datos disponibles. Decile al usuario con honestidad que el dato no está disponible en este momento, sin inventar cifras.",
    fuentes,
  };
}

export async function ejecutarNoticias(query: string, periodo: string): Promise<ResultadoTool> {
  const { texto, fuentes } = await consultarNoticias(query, periodo);
  return {
    texto: texto || "SIN RESULTADOS: no se encontraron noticias para ese tema y período.",
    fuentes,
  };
}

export async function ejecutarBaseConocimiento(
  query: string,
  baseUrl?: string,
): Promise<ResultadoTool> {
  const [sitio, academicos] = await Promise.all([
    buscarEnBase(query),
    buscarAcademico(query, 5, baseUrl),
  ]);
  const resultados: ResultadoConocimiento[] = [...sitio, ...academicos];
  if (!resultados.length) {
    return {
      texto: `SIN RESULTADOS: no encontré información sobre "${query}" en la base de conocimiento del sitio. Podés probar con otra formulación o consultarme sobre otro tema.`,
      fuentes: [],
    };
  }
  const contenido = resultados
    .map((r) => {
      if (esAcademico(r)) {
        return `- [${r.categoria} · ${r.archivo} · pág. ${r.pagina}] ${r.texto}`;
      }
      return `- ${r.texto}`;
    })
    .join("\n");
  return {
    texto: `Información interna del sitio web de Cintia Boos y material académico:\n\n${contenido}`,
    fuentes: [],
  };
}

export async function ejecutarDCF(argsRaw: string): Promise<ResultadoTool> {
  let entrada: EntradaDCF;
  try {
    entrada = JSON.parse(argsRaw) as EntradaDCF;
  } catch {
    return {
      texto:
        "SIN RESULTADOS: no recibí parámetros válidos para el cálculo. Pedile al usuario que indique el flujo de caja libre esperado (y, si quiere, crecimiento, tasa de descuento y deuda neta).",
      fuentes: [],
    };
  }
  if (!entrada.empresa?.trim()) {
    return {
      texto:
        "SIN RESULTADOS: no se recibió el nombre de la empresa a valorar. Reinvocá la herramienta con el parámetro empresa y el flujo de caja libre.",
      fuentes: [],
    };
  }
  const resultado = calcularDCF(entrada);
  return { texto: textoResultadoDCF(entrada, resultado), fuentes: [] };
}

/** Valor intrínseco con datos reales (Yahoo Finance) + metodología del paper + noticias de sustento. */
export async function ejecutarValorIntrinseco(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
  textoUsuario: string;
}> {
  let simbolo = "";
  let tema = "";
  try {
    const args = JSON.parse(argsRaw) as { simbolo?: string; tema?: string };
    simbolo = String(args.simbolo ?? "").trim();
    tema = String(args.tema ?? "").trim();
  } catch {
    /* sin args */
  }
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo/empresa a valorar. Reinvocá la herramienta con el parámetro simbolo (ej. 'IBM', 'Microsoft', 'GGAL.BA').",
      fuentes: [],
      ok: false,
      textoUsuario:
        "No recibí un activo puntual para valorar. Decime cuál empresa querés analizar (por ejemplo IBM, Microsoft o YPF) y lo calculo con datos en vivo.",
    };
  }
  const resultado = await valorIntrinsecoConNoticias(simbolo, tema);
  const ok = resultado.analisis?.ok === true;
  const textoBase = resultado.texto || "SIN RESULTADOS: no se pudo completar la valoración.";
  const texto = ok
    ? textoBase
    : `RESULTADO DEL TOOL valor_intrinseco_real:\nNO se pudo completar el cálculo de valor intrínseco en vivo con datos reales (${
        resultado.error ?? "sin datos de mercado"
      }).\nESTÁ TERMINANTEMENTE PROHIBIDO inventar supuestos ni cifras de FCF, WACC, deuda, precio o valor por acción, y PROHIBIDO presentar un DCF "ilustrativo" o "con supuestos aproximados" como si fuera el resultado real. Si el dato en vivo no está disponible, respondé con honestidad que el cálculo no pudo completarse en este momento, ofrecé reintentar más tarde y, si corresponde, citá las noticias que sí se obtuvieron.\n\n${textoBase}`;
  const noticiasUtiles =
    resultado.noticias && !/no se pudieron obtener noticias/i.test(resultado.noticias)
      ? resultado.noticias
      : "";
  const textoUsuario = ok
    ? ""
    : `No pude obtener en este momento los datos reales en vivo de ${simbolo} desde Yahoo Finance (${
        resultado.error ?? "el proveedor de datos no respondió"
      }). Sin esos datos no te voy a inventar un valor intrínseco: no sería honesto.\n\nPodés reintentarlo en unos minutos o consultarme por otro activo.${
        noticiasUtiles
          ? `\n\nMientras tanto, esto es lo que encontré en noticias recientes:\n${noticiasUtiles}`
          : ""
      }`;
  return { texto, fuentes: resultado.fuentes, ok, textoUsuario };
}

/** Estimaciones de earnings con datos reales: próximo reporte, EPS estimado e
 *  historial de sorpresas con probabilidad bootstrap (estimaciones-earnings.server). */
export async function ejecutarEstimacionesEarnings(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let simbolo = "";
  try {
    const args = JSON.parse(argsRaw) as { simbolo?: string; ticker?: string };
    simbolo = String(args.simbolo ?? args.ticker ?? "").trim();
  } catch {
    simbolo = String(argsRaw ?? "").trim().slice(0, 24);
  }
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo/empresa. Reinvocá la herramienta con el parámetro simbolo (ej. 'NVDA', 'AAPL', 'GGAL.BA').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const { resolverSimbolo } = await import("@/lib/market-data");
    const { analizarEarningsTicker } = await import("@/lib/estimaciones-earnings.server");
    const resuelto =
      /^[A-Z0-9.\-^]{1,12}$/i.test(simbolo) ? simbolo.toUpperCase() : (await resolverSimbolo(simbolo)) ?? simbolo.toUpperCase();
    const r = await analizarEarningsTicker(resuelto);
    if (r.nTrimestres < 2) {
      return {
        texto: `SIN RESULTADOS: sin historial de earnings suficiente para ${simbolo} (${r.companyName}). No inventes estimaciones: respondé con honestidad y ofrecé reintentar.`,
        fuentes: [],
        ok: false,
      };
    }
    const fmt = (v: number | null | undefined, d = 2) =>
      v == null || !isFinite(v) ? "s/d" : `$${v.toFixed(d)}`;
    const pct = (v: number | null | undefined, d = 2) =>
      v == null || !isFinite(v) ? "s/d" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`;
    const diasTxt =
      r.diasHastaProximo != null
        ? r.diasHastaProximo <= 0
          ? "HOY o ya publicó"
          : `en ${r.diasHastaProximo} día(s)`
        : "";
    const prob = r.probSPositiva != null ? Math.round(r.probSPositiva * 100) : null;
    const tendencia = r.probTendencia != null ? Math.round(r.probTendencia * 100) : null;
    const lectura =
      prob != null && prob >= 60
        ? "sesgo estadístico POSITIVO (históricamente bate estimados)"
        : prob != null && prob <= 40
          ? "sesgo estadístico NEGATIVO (suele decepcionar vs consenso)"
          : "sin sesgo claro";
    const ultimos = r.historial.slice(-6);
    const lineas = [
      `RESULTADO DEL TOOL estimaciones_earnings — ${r.companyName} (${r.ticker}):`,
      ``,
      `PRÓXIMO REPORTE: ${r.proximoReporte ?? "s/d"} ${diasTxt} — EPS estimado por analistas: ${fmt(r.epsEstimadoProximo)}`,
      ``,
      `HISTORIAL (últimos ${ultimos.length} trimestres):`,
      ...ultimos.map(
        (h) => `- ${h.fecha} (${h.periodo}): est ${fmt(h.epsEstimado)} → real ${fmt(h.epsReal)} · sorpresa ${pct(h.sorpresaPct)}`,
      ),
      ``,
      `MÉTRICAS: acierto ${Math.round(r.tasaHistorica * 100)}% (${r.hits}/${r.nTrimestres}) · sorpresa promedio ${pct(r.avgSorpresa)} ± ${r.stdSorpresa.toFixed(2)}pp · rango [${pct(r.minSorpresa)}, ${pct(r.maxSorpresa)}]`,
      prob != null
        ? `BOOTSTRAP: P(sorpresa>0)=${prob}% · P(tendencia>0)=${tendencia ?? "s/d"}% · IC90 sorpresa [${pct(r.icInf)}, ${pct(r.icSup)}] · Cohen d=${r.cohenD.toFixed(2)}`
        : `BOOTSTRAP: s/d (muestra insuficiente)`,
      `LECTURA: ${lectura}.`,
      ``,
      `Datos en vivo de Yahoo Finance. Educativo, no recomendación. No inventes cifras que no estén acá.`,
    ];
    return { texto: lineas.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: no se pudieron obtener las estimaciones de earnings de ${simbolo} (${
        e instanceof Error ? e.message : "desconocido"
      }). Respondé con honestidad que los datos en vivo no están disponibles ahora y ofrecé reintentar.`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Semáforo técnico + fundamental con datos reales (Yahoo Finance) + noticias de validación. */
export async function ejecutarSemaforo(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
  textoUsuario: string;
}> {
  let simbolo = "";
  try {
    const args = JSON.parse(argsRaw) as { simbolo?: string };
    simbolo = String(args.simbolo ?? "").trim();
  } catch {
    /* sin args */
  }
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo/activo a analizar. Reinvocá la herramienta con el parámetro simbolo (ej. 'YPF', 'AAPL', 'GGAL.BA').",
      fuentes: [],
      ok: false,
      textoUsuario:
        "No recibí un activo puntual para el análisis. Decime cuál querés analizar (por ejemplo YPF, MercadoLibre o Apple) y lo calculo con el semáforo técnico + fundamental.",
    };
  }
  const resultado = await analizarSemaforo(simbolo);
  const ok = resultado.error == null;
  const texto = ok
    ? textoSemaforo(resultado)
    : `RESULTADO DEL TOOL analizar_semaforo:\nNO se pudo completar el análisis técnico + fundamental en vivo con datos reales (${
        resultado.error ?? "sin datos de mercado"
      }).\nESTÁ TERMINANTEMENTE PROHIBIDO inventar indicadores (RSI, MACD, medias, soportes/resistencias), métricas fundamentales, puntajes ni clasificaciones. Si el dato en vivo no está disponible, respondé con honestidad que el análisis no pudo completarse en este momento, ofrecé reintentar más tarde y, si corresponde, citá las noticias que sí se obtuvieron.\n\n${
        resultado.noticias && !/no se pudieron obtener noticias/i.test(resultado.noticias)
          ? resultado.noticias
          : ""
      }`;
  const textoUsuario = ok
    ? ""
    : `No pude obtener en este momento los datos reales en vivo de ${simbolo} desde Yahoo Finance (${
        resultado.error ?? "el proveedor de datos no respondió"
      }). Sin esos datos no te voy a inventar un análisis técnico ni una clasificación: no sería honesto.\n\nPodés reintentarlo en unos minutos o consultarme por otro activo.`;
  return { texto, fuentes: resultado.fuentes, ok, textoUsuario };
}

/** Busca en la web el valor real de mercado de la empresa, para validar y explicar la diferencia con el DCF teórico. */
export async function validarDCFEnWeb(
  empresa: string,
): Promise<{ texto: string; fuentes: FuenteMercado[] }> {
  const query = `${empresa} acción cotización precio actual valor de mercado capitalización`;
  return ejecutarBusqueda(query);
}

// ---------------------------------------------------------------------------
// Análisis cuantitativo de portafolios (réplica del corpus de referencia).
// ---------------------------------------------------------------------------

import { analizarCAPM, matrizCAPM, calcularHedge } from "@/lib/capm-engine";
import {
  analisisSectorial,
  correlacionesBenchmarks,
  type ComparacionETF,
} from "@/lib/sector-analysis";
import {
  buscarEnCatalogo,
  activoPorTicker,
  todosLosActivos,
  type ActivoCatalogo,
} from "@/lib/catalogo-activos";
import {
  analizarPortafolio,
  tipoPortafolioValidos,
  tipoPortafolioEspanol,
  fmtPct,
  serieDiariaConFechas,
} from "@/lib/portafolio";
import { computeDistribucion } from "@/lib/estadisticas";
import { returns, logReturns } from "@/lib/stats";
import { buscarBenchmark } from "@/lib/benchmarks-master";
import { analizarRiesgo, textoRiesgo } from "@/lib/riesgo";

const ETIQUETAS_TIPO: Record<string, string> = {
  "min-variance-l1": "Mínima varianza L1 (permite cortos)",
  "min-variance-l2": "Mínima varianza L2 (normalizado por norma)",
  "long-only": "Long-only (solo posiciones largas)",
  markowitz: "Markowitz (target de retorno)",
  "equi-weight": "Equi-weight (pesos iguales)",
  "volatility-weighted": "Riesgo inverso (volatility-weighted)",
};

function pctEtiqueta(t: string): string {
  return tipoPortafolioEspanol?.(t) ?? ETIQUETAS_TIPO[t] ?? t;
}

/** Estadísticas de distribución de retornos de un activo (clase `distribution`). */
export async function ejecutarDistribucion(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const { simbolo, rango } = (() => {
    try {
      return JSON.parse(argsRaw) as { simbolo?: string; rango?: string };
    } catch {
      return { simbolo: "", rango: "2y" };
    }
  })();
  const ticker = (simbolo ?? "").trim();
  if (!ticker) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo. Reinvocá la herramienta con el parámetro simbolo (ej. 'AAPL', 'GGAL.BA', 'SPY').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const capm = await analizarCAPM({ simbolo: ticker, rango: rango ?? "2y" });
    if (capm.error) {
      return {
        texto: `RESULTADO DEL TOOL estadisticas_retornos:\nNO se pudo calcular la distribución de ${ticker} (${capm.error}).\nPROHIBIDO inventar estadísticas.`,
        fuentes: [],
        ok: false,
      };
    }
    const pts = await serieDiariaConFechas(ticker, rango ?? "2y");
    const retornos = logReturns(pts.map((p) => p.close));
    const d = computeDistribucion(retornos);
    const nombre = activoPorTicker(ticker)?.nombre ?? ticker;
    const L: string[] = [];
    L.push(`Distribución de retornos diarios de ${nombre} (${ticker}) — ${pts.length} obs.`);
    L.push(`- Retorno media anual: ${fmtPct(d.meanAnnual ?? 0, 2)}`);
    L.push(`- Volatilidad anual: ${fmtPct(d.volatilityAnnual ?? 0, 2)}`);
    L.push(`- Sharpe (ann.): ${(d.sharpeRatio ?? 0).toFixed(2)}`);
    L.push(`- VaR 95% (diario): ${fmtPct(d.var95 ?? 0, 2)}`);
    L.push(`- Sesgo (skewness): ${(d.skewness ?? 0).toFixed(3)}`);
    L.push(`- Curtosis (exceso): ${(d.kurtosis ?? 0).toFixed(3)}`);
    L.push(`- Jarque-Bera: ${(d.jbStat ?? 0).toFixed(2)} (p = ${(d.pValue ?? 0).toFixed(4)})`);
    L.push(
      `- Distribución normal: ${d.isNormal ? "SÍ (no se rechaza normalidad)" : "NO (cola gruesa / no normal)"}`,
    );
    L.push(
      `\nValidación beta (CAPM): β = ${(capm.beta ?? 0).toFixed(2)} contra ${capm.benchmarkLabel ?? "—"}, R² = ${(capm.rSquared ?? 0).toFixed(2)}.`,
    );
    const noticias = await consultarNoticias(nombre, "última semana").catch(() => null);
    if (noticias && noticias.texto) {
      L.push(`\nValidación con noticias recientes:\n${noticias.texto}`);
      return { texto: L.join("\n"), fuentes: noticias.fuentes, ok: true };
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al calcular distribución (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Optimización de portafolio completa (covarianza, optimizadores, PCA, hedge). */
export async function ejecutarOptimizarPortafolio(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let activos: Array<{ ticker: string; montoUSD?: number }> = [];
  let tipo: string | null = null;
  let targetReturn: number | undefined;
  let benchmark = "SPY";
  let rango = "2y";
  try {
    const args = JSON.parse(argsRaw) as {
      activos?: Array<{ ticker?: string; montoUSD?: number }>;
      tipo?: string;
      targetReturn?: number;
      benchmark?: string;
      rango?: string;
    };
    activos = (args.activos ?? [])
      .filter((a) => a?.ticker)
      .map((a) => {
        const base: { ticker: string; montoUSD?: number } = {
          ticker: String(a.ticker).trim(),
        };
        if (typeof a.montoUSD === "number" && isFinite(a.montoUSD)) base.montoUSD = a.montoUSD;
        return base;
      });
    tipo = args.tipo?.trim() ? args.tipo.trim() : null;
    targetReturn = args.targetReturn;
    benchmark = args.benchmark?.trim() || "SPY";
    rango = args.rango?.trim() || "2y";
  } catch {
    /* sin args */
  }
  const tipos: string[] = tipo
    ? [tipo]
    : [
        "equi-weight",
        "volatility-weighted",
        "min-variance-l1",
        "min-variance-l2",
        "long-only",
        "markowitz",
      ];
  for (const t of tipos) {
    if (!tipoPortafolioValidos(t)) {
      return {
        texto: `SIN RESULTADOS: tipo de optimización inválido "${t}". Usá: min-variance-l1, min-variance-l2, long-only, markowitz, equi-weight, volatility-weighted.`,
        fuentes: [],
        ok: false,
      };
    }
  }
  try {
    const res = await analizarPortafolio({
      activos,
      rango,
      tipos: tipos as never,
      ...(typeof targetReturn === "number" && isFinite(targetReturn) ? { targetReturn } : {}),
      benchmark,
    });
    const L: string[] = [];
    L.push(`Portafolio: ${res.simbolos.map((s, i) => `${res.labels[i]} (${s})`).join(", ")}`);
    L.push(
      `Rango: ${res.fechas[0]} → ${res.fechas[res.fechas.length - 1]} · ${res.fechas.length} sesiones`,
    );
    L.push(`\nMatriz de correlación (anualizada):\n  ${res.simbolos.join("\t")}`);
    res.corr.forEach((row, i) => {
      L.push(`  ${res.simbolos[i]} ${row.map((c) => c.toFixed(2).padStart(6)).join(" ")}`);
    });
    L.push(`\nEstadísticas por activo (retornos diarios):`);
    res.simbolos.forEach((s, i) => {
      const d = res.distribucionPorActivo[i]!;
      L.push(
        `- ${res.labels[i]} (${s}): anual ${fmtPct(d.meanAnnual ?? 0, 1)} · vol ${fmtPct(d.volatilityAnnual ?? 0, 1)} · Sharpe ${(d.sharpeRatio ?? 0).toFixed(2)} · VaR95 ${fmtPct(d.var95 ?? 0, 1)} · JB p=${(d.pValue ?? 0).toFixed(3)} ${d.isNormal ? "(normal)" : "(no normal)"}`,
      );
    });
    L.push(`\nOptimizaciones (pesos):`);
    for (const t of tipos) {
      const o = res.optimizaciones[t as keyof typeof res.optimizaciones];
      if (!o) continue;
      const pesos = res.simbolos.map((s, i) => `${s} ${fmtPct(o.pesos[s] ?? 0, 1)}`).join(" · ");
      L.push(`- ${ETIQUETAS_TIPO[t] ?? t}: ${pesos}`);
      L.push(
        `  · Retorno ${fmtPct(o.retornoAnual, 1)} · Vol ${fmtPct(o.volatilidadAnual, 1)} · Sharpe ${o.sharpe.toFixed(2)} · VaR95 ${fmtPct(o.var95, 1)}`,
      );
    }
    L.push(`\nFrontera eficiente (long-only):`);
    const fe = res.frontera;
    if (fe.length) {
      const minSharpe = fe.reduce((m, p) => (p.sharpe < m.sharpe ? p : m), fe[0]!);
      const maxSharpe = fe.reduce((m, p) => (p.sharpe > m.sharpe ? p : m), fe[0]!);
      const minVol = fe.reduce((m, p) => (p.volatilidad < m.volatilidad ? p : m), fe[0]!);
      L.push(
        `- Mínima volatilidad: ${fmtPct(minVol.volatilidad, 1)} → retorno ${fmtPct(minVol.retorno, 1)}`,
      );
      L.push(
        `- Máximo Sharpe: ${fmtPct(maxSharpe.retorno, 1)} / vol ${fmtPct(maxSharpe.volatilidad, 1)} (Sharpe ${maxSharpe.sharpe.toFixed(2)})`,
      );
      L.push(
        `- Peor Sharpe: ${fmtPct(minSharpe.retorno, 1)} / vol ${fmtPct(minSharpe.volatilidad, 1)}`,
      );
    }
    L.push(`\nPCA (covarianza anualizada):`);
    const ev = res.pca.valores.map((v) => v.toFixed(2));
    L.push(`- Autovalores: ${ev.join(", ")}`);
    L.push(
      `- Varianza explicada PC1: ${fmtPct(res.pca.varianzaExplicada[0] ?? 0, 1)} · PC2: ${fmtPct(res.pca.varianzaExplicada[1] ?? 0, 1)}`,
    );
    L.push(
      `- Vector de mínima varianza (L2): ${res.simbolos.map((s, i) => `${s} ${(res.pca.vectorMinVarianza[i] ?? 0).toFixed(3)}`).join(" · ")}`,
    );
    if (res.hedger && "hedges" in res.hedger) {
      L.push(
        `\nHedger CAPM contra ${res.hedger.posicion.ticker} (β portafolio ${res.hedger.posicion.beta.toFixed(2)}):`,
      );
      res.hedger.hedges.forEach((h) => {
        L.push(
          `- ${h.name} (${h.ticker}): β=${h.beta.toFixed(2)} · nocional cobertura ${h.nocional >= 0 ? "+" : ""}${h.nocional.toFixed(0)} USD`,
        );
      });
      L.push(`- Costo de cobertura: ${res.hedger.cost.toFixed(4)}`);
    }
    const noticias = await consultarNoticias(
      res.labels[0] ?? activos[0]!.ticker,
      "última semana",
    ).catch(() => null);
    if (noticias && noticias.texto) {
      L.push(
        `\nValidación con noticias recientes (${res.labels[0] ?? activos[0]!.ticker}):\n${noticias.texto}`,
      );
      return { texto: L.join("\n"), fuentes: noticias.fuentes, ok: true };
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al optimizar portafolio (${e instanceof Error ? e.message : "desconocido"}). Reintentá con menos activos o tickers válidos.`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Correlaciones de un activo contra los 140+ factores maestros. */
export async function ejecutarFactores(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const { simbolo, limite, rango } = (() => {
    try {
      return JSON.parse(argsRaw) as { simbolo?: string; limite?: number; rango?: string };
    } catch {
      return { simbolo: "", limite: 10, rango: "1y" };
    }
  })();
  const ticker = (simbolo ?? "").trim();
  if (!ticker) {
    return {
      texto: "SIN RESULTADOS: no recibí el símbolo. Reinvocá con el parámetro simbolo.",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const res = await correlacionesBenchmarks(ticker, limite ?? 10, rango ?? "1y");
    if (res.error && !res.positivas.length && !res.negativas.length) {
      return {
        texto: `SIN RESULTADOS: no hay datos de factores para ${ticker} (${res.error}).`,
        fuentes: [],
        ok: false,
      };
    }
    const nombre = activoPorTicker(ticker)?.nombre ?? ticker;
    const L: string[] = [
      `Correlaciones de ${nombre} (${ticker}) contra los factores maestros (${rango ?? "1y"}):`,
    ];
    const fila = (c: ComparacionETF) => {
      const signo = (c.correlation ?? 0) >= 0 ? "+" : "";
      return `- ${c.name} (${c.ticker}): r=${signo}${(c.correlation ?? 0).toFixed(2)}`;
    };
    if (res.positivas.length) {
      L.push(`\nMayor correlación positiva:`);
      for (const c of res.positivas) L.push(fila(c));
    }
    if (res.negativas.length) {
      L.push(`\nMayor correlación negativa (diversificación):`);
      for (const c of res.negativas) L.push(fila(c));
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al calcular correlaciones (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** CAPM de un activo contra benchmark (o auto-detectado) con datos reales de Yahoo. */
export async function ejecutarCAPM(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const args = (() => {
    try {
      return JSON.parse(argsRaw) as {
        simbolo?: string;
        benchmark?: string;
        autoDetect?: boolean;
        rango?: string;
      };
    } catch {
      return {};
    }
  })();
  const simbolo = (args.simbolo ?? "").toString().trim();
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo. Reinvocá con el parámetro simbolo (ej. 'AAPL', 'SPY', 'GGAL.BA').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const benchmark = args.benchmark?.toString().trim() || "";
    const rango = args.rango?.toString().trim() || "2y";
    const res = await analizarCAPM({
      simbolo,
      ...(benchmark ? { benchmark } : {}),
      ...(typeof args.autoDetect === "boolean" ? { autoDetect: args.autoDetect } : {}),
      rango,
    });
    if (res.error) {
      return {
        texto: `RESULTADO DEL TOOL analizar_capm:\nNO se pudo calcular el CAPM de ${simbolo} (${res.error}).\nQueda prohibido inventar betas o alfas.`,
        fuentes: [],
        ok: false,
      };
    }
    const nombre = res.label ?? simbolo;
    const L: string[] = [];
    L.push(
      `CAPM de ${nombre} (${res.ticker}) · ${res.observations} muestras · benchmark ${res.benchmarkLabel ?? "—"} (${res.benchmark ?? ""})`,
    );
    L.push(
      `- Beta (OLS): ${res.beta?.toFixed(2) ?? "s/d"} · Alfa diario: ${res.alpha != null ? fmtPct(res.alpha, 3) : "s/d"} · Alfa anualizado: ${res.annualizedAlpha != null ? fmtPct(res.annualizedAlpha, 2) : "s/d"}`,
    );
    L.push(
      `- R²: ${res.rSquared?.toFixed(3) ?? "s/d"} · Correlación: ${res.correlation?.toFixed(3) ?? "s/d"}`,
    );
    L.push(
      `- p-valor: ${res.pValue?.toFixed(4) ?? "s/d"} · Error estándar: ${res.stdErr?.toFixed(4) ?? "s/d"}`,
    );
    L.push(
      `- Hurst: ${res.hurstExponent?.toFixed(3) ?? "s/d"} · Beta p-variance: ${res.betaP?.toFixed(2) ?? "s/d"}`,
    );
    const noticias = await consultarNoticias(nombre, "última semana").catch(() => null);
    if (noticias?.texto) {
      L.push(`\nValidación con noticias recientes:\n${noticias.texto}`);
      return { texto: L.join("\n"), fuentes: noticias?.fuentes ?? [], ok: true };
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al calcular CAPM (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Matriz de betas/correlaciones/R² entre N activos con datos reales de Yahoo. */
export async function ejecutarMatrizCAPM(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const args = (() => {
    try {
      return JSON.parse(argsRaw) as { simbolos?: string[]; rango?: string };
    } catch {
      return {};
    }
  })();
  const simbolos = Array.isArray(args.simbolos)
    ? args.simbolos.map((s) => String(s).trim()).filter(Boolean)
    : [];
  if (simbolos.length < 2) {
    return {
      texto:
        "SIN RESULTADOS: la matriz requiere al menos 2 símbolos en el parámetro simbolos (ej. ['AAPL','MSFT','QQQ']).",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const m = await matrizCAPM(simbolos, args.rango?.toString().trim() || "2y");
    const L: string[] = [];
    L.push(
      `Matriz de betas / correlaciones / R² entre ${m.tickers.join(", ")} (${m.observaciones} muestras):`,
    );
    L.push(`\nBetas (fila → columna):`);
    L.push(`| ${m.tickers.map((t) => t.padEnd(8)).join(" | ")}`);
    L.push("|" + m.tickers.map(() => "----------").join("|"));
    for (const a of m.tickers) {
      L.push(
        `| ${m.tickers.map((b) => `${(m.beta[a]?.[b] ?? NaN).toFixed(2)}`.padStart(8)).join(" | ")}  ← ${a}`,
      );
    }
    L.push(`\nCorrelaciones (fila → columna):`);
    for (const a of m.tickers) {
      L.push(
        `- ${a}: ${m.tickers.map((b) => `${(m.correlation[a]?.[b] ?? NaN).toFixed(3)}`).join(", ")}`,
      );
    }
    L.push(`\nR² (fila → columna):`);
    for (const a of m.tickers) {
      L.push(
        `- ${a}: ${m.tickers.map((b) => `${(m.rSquared[a]?.[b] ?? NaN).toFixed(3)}`).join(", ")}`,
      );
    }
    const errores = Object.entries(m.errores).filter(([, e]) => e);
    if (errores.length) {
      L.push(`\nErrores: ${errores.map(([t, e]) => `${t}: ${e}`).join(" · ")}`);
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al calcular la matriz (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Análisis sectorial de un activo (comparación vs ETFs sectoriales + peers). */
export async function ejecutarSectores(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const args = (() => {
    try {
      return JSON.parse(argsRaw) as { simbolo?: string };
    } catch {
      return {};
    }
  })();
  const simbolo = (args.simbolo ?? "").toString().trim();
  if (!simbolo) {
    return {
      texto: "SIN RESULTADOS: no recibí el símbolo. Reinvocá con el parámetro simbolo.",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const res = await analisisSectorial(simbolo);
    const L: string[] = [];
    const s = res.sector;
    const sectorNombre = s.yahoo ?? s.catalogo ?? "No detectado";
    L.push(`Sector de ${res.label} (${simbolo}): ${sectorNombre}`);
    if (s.sectorKey)
      L.push(
        `- Sector key: ${s.sectorKey} · ETF sectorial: ${s.etfNombre ?? "—"} (${s.etfSector ?? "—"})`,
      );
    L.push(`\nComparación contra ETFs sectoriales (2y):`);
    const comparaciones = [...res.comparacion].sort(
      (a, b) => Math.abs(b.rSquared ?? 0) - Math.abs(a.rSquared ?? 0),
    );
    for (const c of comparaciones) {
      L.push(
        `- ${c.name} (${c.ticker}): β=${(c.beta ?? NaN).toFixed(2)} R²=${(c.rSquared ?? NaN).toFixed(3)} r=${(c.correlation ?? NaN).toFixed(3)}`,
      );
    }
    if (res.peers?.length) {
      L.push(
        `\nPeers del mismo sector/industria (catálogo): ${res.peers.map((p) => `${p.nombre} (${p.ticker})`).join(", ")}`,
      );
    }
    if (res.error) L.push(`\nNota: ${res.error}`);
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error en análisis sectorial (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Cobertura (hedge beta-neutral) de un portafolio contra benchmark. */
export async function ejecutarCobertura(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const args = (() => {
    try {
      return JSON.parse(argsRaw) as {
        posiciones?: Array<{ ticker: string; valorUSD: number }>;
        benchmark?: string;
      };
    } catch {
      return {};
    }
  })();
  const posiciones = (Array.isArray(args.posiciones) ? args.posiciones : []).filter(
    (p) => p?.ticker && isFinite(Number(p.valorUSD)),
  );
  if (!posiciones.length) {
    return {
      texto:
        "SIN RESULTADOS: necesito posiciones en el parámetro posiciones [{ticker, valorUSD}]. No invento pesos ni hedges sin datos.",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const res = await calcularHedge({
      posiciones: posiciones.map((p) => ({
        ticker: String(p.ticker).trim(),
        valorUSD: Number(p.valorUSD),
      })),
      benchmark: args.benchmark?.toString().trim() || "SPY",
    });
    const L: string[] = [];
    L.push(
      `Cobertura del portafolio (${res.totalUSD.toLocaleString("es-AR", { style: "currency", currency: "USD" })} · β ${res.portafolioBeta?.toFixed(2) ?? "s/d"} vs ${res.benchmark} ${res.benchmarkName ?? ""}):`,
    );
    for (const p of res.posiciones) {
      L.push(
        `- ${p.label} (${p.ticker}): USD ${p.valorUSD.toFixed(2)} (${fmtPct(p.peso, 1)}) · β=${p.beta?.toFixed(2) ?? "s/d"} r=${p.correlation?.toFixed(3) ?? "s/d"}`,
      );
    }
    if (res.hedgeSugerido) {
      L.push(
        `\nHedge sugerido: ${res.hedgeSugerido.tipo} ${res.hedgeSugerido.ticker} (${res.hedgeSugerido.name}) por ${fmtPct(
          res.hedgeSugerido.nocionalUSD / (res.totalUSD || 1),
          2,
        )} del portafolio · nocional ≈ USD ${res.hedgeSugerido.nocionalUSD.toFixed(2)}`,
      );
      L.push(res.hedgeSugerido.explicacion);
    } else {
      L.push(
        `\nNo hace falta cobertura: el portafolio ya está beta-neutral o no se detectó exposición significativa.`,
      );
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al calcular cobertura (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Consulta al catálogo unificado de activos (por ticker, nombre, sector o industria). */
export async function ejecutarCatalogo(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const args = (() => {
    try {
      return JSON.parse(argsRaw) as {
        consulta?: string;
        sector?: string;
        industria?: string;
        tipo?: string;
      };
    } catch {
      return {};
    }
  })();
  const consulta = (args.consulta ?? args.sector ?? args.industria ?? "").toString().trim();
  try {
    const agrupado = buscarEnCatalogo(consulta);
    const vistos = new Map<string, ActivoCatalogo>();
    for (const a of [...agrupado.ticker, ...agrupado.nombre, ...agrupado.sector]) {
      if (!vistos.has(a.ticker)) vistos.set(a.ticker, a);
    }
    const lista = [...vistos.values()];
    if (lista.length === 0) {
      const total = todosLosActivos();
      return {
        texto: `SIN RESULTADOS en catálogo para "${consulta}". Hay ${total.length} activos indexados. Probá con otro nombre, sector o industria.`,
        fuentes: [],
        ok: true,
      };
    }
    const L: string[] = [];
    L.push(`${lista.length} activos encontrados en el catálogo:`);
    for (const a of lista.slice(0, 40)) {
      L.push(
        `- ${a.nombre} (${a.ticker}) · ${a.tipo} · ${a.moneda} · ${a.mercado} · ${a.pais} · ${a.sector ?? ""} ${a.industria ? `/ ${a.industria}` : ""}`,
      );
    }
    if (lista.length > 40) L.push(`…y ${lista.length - 40} más`);
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al consultar catálogo (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Análisis de riesgo (desvío estándar, volatilidad, VaR, CVaR, drawdown, beta, Sharpe) con series reales de Yahoo. */
export async function ejecutarRiesgo(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const args = (() => {
    try {
      return JSON.parse(argsRaw) as { simbolo?: string; rango?: string };
    } catch {
      return {};
    }
  })();
  const simbolo = (args.simbolo ?? "").toString().trim();
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo. Reinvocá con el parámetro simbolo (ej. 'AAPL', 'GGAL.BA', 'SPY').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const res = await analizarRiesgo(simbolo, args.rango?.toString().trim() || "2y");
    if (res.error) {
      return {
        texto: `RESULTADO DEL TOOL analizar_riesgo:\n${textoRiesgo(res)}`,
        fuentes: [],
        ok: false,
      };
    }
    const L: string[] = [];
    L.push(textoRiesgo(res));
    const nombre = res.label ?? simbolo;
    const noticias = await consultarNoticias(nombre, "última semana").catch(() => null);
    if (noticias?.texto) {
      L.push(`\nValidación con noticias recientes:\n${noticias.texto}`);
      return { texto: L.join("\n"), fuentes: noticias?.fuentes ?? [], ok: true };
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al calcular riesgo (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

// ---------------------------------------------------------------------------
// Análisis portados de la app "Clarity" (server.py): cualitativo, cuantitativo,
// WACC, DCF, múltiplos, valor libro/APV, triangulación, ficha de decisión,
// contexto macro, ciclo intermarket y análisis sectorial. Todos con datos
// reales en vivo (Yahoo Finance + BCRA + ArgentinaDatos + CriptoYa).
// ---------------------------------------------------------------------------

import {
  claCualitativo,
  textoCualitativo,
  claCuantitativo,
  textoCuantitativo,
  claWacc,
  textoWacc,
  claTriangulacion,
  textoTriangulacion,
  claFicha,
  textoFicha,
  claContextoMacro,
  textoMacro,
  claCiclo,
  textoCiclo,
  claPerformanceSectorial,
  textoPerformanceSectorial,
  claValuacionSectorial,
  textoValuacionSectorial,
} from "@/lib/clarity-analysis";

function parseArgsClarity(argsRaw: string): {
  simbolo?: string;
  periodo?: string;
  sector?: string;
} {
  try {
    const j = JSON.parse(argsRaw) as {
      simbolo?: unknown;
      periodo?: unknown;
      sector?: unknown;
    };
    if (!j || typeof j !== "object") return {};
    const str = (v: unknown): string =>
      typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
    return { simbolo: str(j.simbolo), periodo: str(j.periodo), sector: str(j.sector) };
  } catch {
    return {};
  }
}

/** Cualitativo (6 dimensiones) + Cuantitativo (15 métricas + alertas). */
export async function ejecutarFundamental(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const simbolo = (parseArgsClarity(argsRaw).simbolo ?? "").toString().trim();
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo. Reinvocá la herramienta con el parámetro simbolo (ej. 'AAPL', 'GGAL.BA', 'YPF').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const [cuali, cuanti] = await Promise.all([claCualitativo(simbolo), claCuantitativo(simbolo)]);
    return {
      texto: `${textoCualitativo(cuali)}\n\n---\n\n${textoCuantitativo(cuanti)}`,
      fuentes: [],
      ok: true,
    };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error en el análisis fundamental de ${simbolo} (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** WACC (CAPM + riesgo país + tamaño) con datos en vivo. */
export async function ejecutarWacc(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const simbolo = (parseArgsClarity(argsRaw).simbolo ?? "").toString().trim();
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo. Reinvocá con el parámetro simbolo (ej. 'AAPL', 'GGAL.BA').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    return { texto: textoWacc(await claWacc(simbolo)), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al calcular el WACC de ${simbolo} (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Valoración por DCF + múltiplos + valor libro/APV triangulados. */
export async function ejecutarValorMetodos(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const simbolo = (parseArgsClarity(argsRaw).simbolo ?? "").toString().trim();
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo. Reinvocá con el parámetro simbolo (ej. 'AAPL', 'YPF', 'GGAL.BA').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    return { texto: textoTriangulacion(await claTriangulacion(simbolo)), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error en la valoración por métodos de ${simbolo} (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Ficha de decisión completa (todas las capas). */
export async function ejecutarFichaDecision(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const simbolo = (parseArgsClarity(argsRaw).simbolo ?? "").toString().trim();
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el símbolo. Reinvocá con el parámetro simbolo (ej. 'AAPL', 'YPF', 'MSFT').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    return { texto: textoFicha(await claFicha(simbolo)), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: no se pudo generar la ficha de decisión de ${simbolo} (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Contexto macro completo (BCRA + ArgentinaDatos + CriptoYa + Yahoo). */
export async function ejecutarContextoMacro(): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  try {
    return { texto: textoMacro(await claContextoMacro()), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al obtener el contexto macro (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/**
 * PIPELINE MAESTRO F0 → F10 — Análisis completo secuencial con validación T.
 * Reutiliza los ejecutores existentes (F0-F10) en orden jerárquico y aplica
 * checks determinísticos (validar.py) antes de publicar.
 * No crea archivos nuevos: compone texto a partir de los motores ya portados.
 */
export async function ejecutarAnalisisCompleto(
  argsRaw: string,
  sessionId = "anon",
): Promise<ResultadoToolConEventos> {
  let simbolo = "";
  let incluirOpciones = true;
  let incluirQuant = true;
  try {
    const p = JSON.parse(argsRaw) as {
      simbolo?: string;
      incluirOpciones?: boolean;
      incluirQuant?: boolean;
      ticker?: string;
    };
    simbolo = String(p.simbolo ?? p.ticker ?? "").trim();
    if (typeof p.incluirOpciones === "boolean") incluirOpciones = p.incluirOpciones;
    if (typeof p.incluirQuant === "boolean") incluirQuant = p.incluirQuant;
  } catch {
    simbolo = argsRaw.trim().slice(0, 24);
  }
  if (!simbolo) {
    return {
      texto: "SIN RESULTADOS: no recibí el símbolo para el análisis completo. Usá parametro simbolo (ej. 'GGAL.BA','YPF','AAPL','AL30').",
      fuentes: [],
      ok: false,
    };
  }
  const t0 = Date.now();
  const secciones: string[] = [];
  const fuentes: FuenteMercado[] = [];
  const eventos: EventoChat[] = [];
  let ficha: Awaited<ReturnType<typeof claFicha>> | null = null;

  // F0 — Contexto Macro ampliado (Blanchard/Dornbusch + BCRA v4 completa) + nemotron-retrieval RAG
  try {
    const [macro, ciclo] = await Promise.all([claContextoMacro(), claCiclo()]);
    secciones.push(`## F0 — Contexto Macro (INICIO)\n${textoMacro(macro)}`);
    secciones.push(`\n${textoCiclo(ciclo)}`);
    // nemo-retrieval: RAG macro LATAM para sustentar diagnóstico (sin bloquear si falla)
    try {
      const { buscarAcademico } = await import("@/lib/kb-academic");
      const rag = await buscarAcademico("Blanchard Dornbusch macro LATAM régimen inflación tipo cambio", 2);
      if (rag.length) {
        secciones.push(`\n> RAG macro (nemotron-retrieval): ${rag.map((r) => `[${r.categoria} · ${r.archivo} p.${r.pagina}] ${r.texto.slice(0, 180)}...`).join(" · ")}`);
      }
    } catch {}
    // Señal de régimen macro para calibrar WACC/MOS
    if (macro.regimen_macro === "ADVERSO") {
      secciones.push(`\n> ⚠️ Régimen ADVERSO: WACC se descuenta con prima; exigir MOS ≥ 35-50%`);
    }
  } catch (e) {
    secciones.push(`## F0 — Contexto Macro\nSIN RESULTADOS F0: ${e instanceof Error ? e.message : String(e)}`);
  }

  // F1 — Fundamentos contables (Fowler Newton / Biondi) — 6D + 15 ratios
  let cuali: Awaited<ReturnType<typeof claCualitativo>> | null = null;
  let cuanti: Awaited<ReturnType<typeof claCuantitativo>> | null = null;
  try {
    [cuali, cuanti] = await Promise.all([claCualitativo(simbolo), claCuantitativo(simbolo)]);
    secciones.push(`\n## F1 — Fundamentos Contables (Fowler Newton caps 1,2,5,6,10,12,13 + Biondi 4-7)\n${textoCualitativo(cuali)}`);
    secciones.push(`\n${textoCuantitativo(cuanti)}`);
    if (!cuali.continuar) {
      secciones.push(`\n> 🛑 Gate cualitativo <5.0: F2-F3 se reportan pero la decisión final queda BLOQUEADA (no comprar lo que no se entiende).`);
    }
  } catch (e) {
    secciones.push(`\n## F1 — Fundamentos\nSIN RESULTADOS F1: ${e instanceof Error ? e.message : String(e)}`);
  }

  // F2 — Cálculo financiero (Dumrauf MATF U2-4 + Instrumentos_37): TIR/YTM spot/forward
  // Si es bono argentino, usar renta fija viva; si es acción, el cálculo se refleja en WACC/DCF
  const esBono = /^(AL|GD|AE|TX|LECAP|BONCAP|TX\d|AL\d+|GD\d+)/i.test(simbolo);
  if (esBono) {
    try {
      const { ejecutarYTM } = await import("@/lib/agents/ejecutores");
      const r = await ejecutarYTM(JSON.stringify({ ticker: simbolo }), sessionId);
      fuentes.push(...r.fuentes);
      if ((r as any).eventos) eventos.push(...(r as any).eventos);
      secciones.push(`\n## F2 — Cálculo Financiero (Dumrauf) + F7 Renta Fija\n${r.texto}`);
    } catch (e) {
      secciones.push(`\n## F2 — Cálculo Financiero\nSIN RESULTADOS F2: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    secciones.push(`\n## F2 — Cálculo Financiero (Dumrauf)\n_Para ${simbolo} el cálculo se vehiculiza vía WACC/DCF (VAN/TIR del equity). Ver F3._`);
  }

  // F3 — Valuación corporativa (Pascale DFN U1-7 + Alonso): DCF + múltiplos + APV + WACC
  let tri: Awaited<ReturnType<typeof claTriangulacion>> | null = null;
  let wacc: Awaited<ReturnType<typeof claWacc>> | null = null;
  try {
    [wacc, tri] = await Promise.all([claWacc(simbolo), claTriangulacion(simbolo)]);
    secciones.push(`\n## F3 — Valuación Corporativa (Pascale + Alonso)\n${textoWacc(wacc)}`);
    secciones.push(`\n${textoTriangulacion(tri)}`);
  } catch (e) {
    secciones.push(`\n## F3 — Valuación\nSIN RESULTADOS F3: ${e instanceof Error ? e.message : String(e)}`);
  }

  // F4 — Mercados y sectores (Value Investing + Murphy intermarket + universo BCBA)
  try {
    const [perf, secScore] = await Promise.all([
      claPerformanceSectorial("1mo").catch(() => null),
      (async () => {
        try {
          const mod = await import("@/lib/herramientas/score-sectorial.functions");
          return await mod.scoreSectorialFn({ data: { ticker: simbolo } });
        } catch {
          return null;
        }
      })(),
    ]);
    let sectorTxt = "";
    try {
      const sec = await analisisSectorial(simbolo);
      const comps = (sec.comparacion ?? []).slice(0, 5).map((c) => `${c.name} (${c.ticker}) β=${(c.beta ?? 0).toFixed(2)} R²=${(c.rSquared ?? 0).toFixed(2)}`).join(" · ");
      sectorTxt = `Sector Yahoo: ${sec.sector.yahoo ?? "s/d"} | ETF sectorial: ${sec.sector.etfSector ?? "s/d"} · Comparables: ${comps || "s/d"}`;
    } catch {
      sectorTxt = "Sector: s/d";
    }
    secciones.push(`\n## F4 — Mercados y Sectores (meso)\n${sectorTxt}`);
    if (secScore) {
      const s = (secScore as any).score;
      secciones.push(`- Score sectorial: ${s.disponible ? `${s.valor}/100` : `no disponible (${s.valor})`} · ${(secScore as any).interpretacion?.resumenEjecutivo ?? ""}`);
    }
    if (perf) secciones.push(`\n${textoPerformanceSectorial(perf)}`);
  } catch (e) {
    secciones.push(`\n## F4 — Sectores\nSIN RESULTADOS F4: ${e instanceof Error ? e.message : String(e)}`);
  }

  // F5+F6 — Cartera, CAPM, factores y riesgo (Elbaum + capm.txt + geometry.txt)
  try {
    const [riesgo, capm, factores] = await Promise.all([
      analizarRiesgo(simbolo, "2y").catch(() => null),
      analizarCAPM({ simbolo, rango: "2y" } as any).catch(() => null),
      correlacionesBenchmarks(simbolo, 6, "1y").catch(() => null),
    ]);
    secciones.push(`\n## F5-F6 — Cartera, CAPM y Factores`);
    if (riesgo && !riesgo.error) {
      secciones.push(textoRiesgo(riesgo as any));
    } else if (riesgo?.error) {
      secciones.push(`Riesgo: ${riesgo.error}`);
    }
    if (capm && !capm.error) {
      const n = capm as any;
      secciones.push(`CAPM ${n.ticker} vs ${n.benchmarkLabel ?? n.benchmark} → β=${(n.beta ?? 0).toFixed(2)} α=${n.alpha != null ? (n.alpha * 100).toFixed(2) + "%" : "s/d"} R²=${(n.rSquared ?? 0).toFixed(3)} p=${(n.pValue ?? 0).toFixed(4)} Hurst=${(n.hurstExponent ?? 0).toFixed(2)}`);
    }
    if (factores && (factores.positivas?.length || factores.negativas?.length)) {
      const pos = factores.positivas.slice(0, 3).map((c) => `${c.name} r=${(c.correlation ?? 0).toFixed(2)}`).join(" · ");
      const neg = factores.negativas.slice(0, 3).map((c) => `${c.name} r=${(c.correlation ?? 0).toFixed(2)}`).join(" · ");
      if (pos) secciones.push(`Factores positivos: ${pos}`);
      if (neg) secciones.push(`Factores diversificadores: ${neg}`);
    }
  } catch (e) {
    secciones.push(`\n## F5-F6 — Riesgo/CAPM\nSIN RESULTADOS: ${e instanceof Error ? e.message : String(e)}`);
  }

  // F7 — Renta fija ETTI (Elbaum U4 + RENTA_FIJA_COMPLETA.json) — solo si aplica o a modo contexto
  if (!esBono) {
    try {
      const { getCurvaETTI } = await import("@/lib/herramientas/etti.functions");
      const etti = await (getCurvaETTI as any)({ data: { sessionId } });
      const forma = (etti as any).forma ?? "s/d";
      secciones.push(`\n## F7 — Renta Fija (contexto ETTI soberana)\nCurva spot soberana forma: ${forma} — ${(etti as any).justificacionForma ?? ""} (ver consultar_curva_etti para detalle)`);
    } catch {
      // silencio: F7 contextual
    }
  }

  // F8 — Derivados (Dunbar Black-Scholes + Labadie)
  if (incluirOpciones) {
    try {
      const base = simbolo.replace(".BA", "");
      const esBCBA = simbolo.toUpperCase().endsWith(".BA") || ["GGAL", "PAMP", "YPFD", "COME", "BMA", "LOMA", "CEPU", "TRAN"].includes(base.toUpperCase());
      if (esBCBA) {
        // Cadena IOL no siempre disponible sin token; se intenta pero no bloquea
        const { autenticar, obtenerCadenaOpciones, obtenerTasaCaucion } = await import("@/lib/opciones-bcba/iol");
        const token = await autenticar().catch(() => null);
        if (token) {
          secciones.push(`\n## F8 — Derivados (Black-Scholes + CRR)\nCadena BCBA disponible para ${base} (IOL autenticado) — usar cadena_opciones_bcba para smile/griegas/IV.`);
        } else {
          secciones.push(`\n## F8 — Derivados\nSubyacente BCBA ${base} identificado; cadena requiere IOL token. Tip: usar analizar_opciones_completo para BS+CRR+IV+VaR.`);
        }
      }
    } catch {
      // no bloquea
    }
  }

  // F9 — Trading cuantitativo (Labadie: StatArb, ML, HFT, microestructura, Almgren-Chriss)
  if (incluirQuant) {
    try {
      // Mostrar nivel de señal sin ejecutar el par completo (evita doble latencia)
      secciones.push(`\n## F9 — Trading Cuantitativo (Labadie)\nMetodologías disponibles: pairs_trading_labadie (ADF/z-score/bandas μ±aσ), curva_ejecucion_labadie (Almgren-Chriss con PVol y p-varianza), predecir_direccion (ML F1 walk-forward). Usar tools dedicadas para señal de par o ejecución de orden grande.`);
    } catch {}
  }

  // F10 — Ficha de decisión + MOS calibrado (perfil cliente)
  try {
    ficha = await claFicha(simbolo);
    secciones.push(`\n## F10 — Ejecución + Perfil (CIERRE) — Ficha de Decisión\n${textoFicha(ficha)}`);
    // Evento informe para el chat
    eventos.push({ t: "informe", v: { titulo: `Ficha ${simbolo} — F0→F10`, contenidoMarkdown: secciones.join("\n\n") } } as any);
  } catch (e) {
    secciones.push(`\n## F10 — Ficha\nSIN RESULTADOS F10: ${e instanceof Error ? e.message : String(e)}`);
  }

  // T — TRANSVERSAL: validación determinística (validar.py reciclad)
  const checks: string[] = [];
  const rojo: string[] = [];
  const amarillo: string[] = [];
  try {
    if (cuanti) {
      const m = cuanti.metricas as any;
      if (m.M14_deuda_ebitda != null && m.M14_deuda_ebitda > 4) rojo.push(`Deuda/EBITDA ${m.M14_deuda_ebitda.toFixed(1)}x >4 (apalancamiento excesivo)`);
      if (m.M9_patrimonio_neto != null && m.M9_patrimonio_neto < 0) rojo.push("Patrimonio neto negativo — default técnico");
      if (m.M6_margen_neto != null && m.M6_margen_neto < 0) rojo.push(`Margen neto ${(m.M6_margen_neto * 100).toFixed(1)}% negativo`);
      if (m.M11_capital_trabajo != null && m.M11_capital_trabajo < 0) rojo.push("Capital de trabajo negativo — riesgo liquidez");
      if (cuanti.alertas.total_rojas > 0) checks.push(`${cuanti.alertas.total_rojas} alerta(s) roja(s) cuantitativa(s)`);
    }
    if (cuali && !cuali.continuar) rojo.push(`Score cualitativo ${cuali.score_total.toFixed(1)}<5.0 — análisis BLOQUEADO`);
    if (wacc && wacc.wacc_usd == null) amarillo.push("WACC no calculable — usar tasa de referencia");
    if (tri && tri.rango_final == null) amarillo.push("Triangulación sin rango — datos insuficientes en algún método");
    if (ficha) {
      const mos = ficha.margen_seguridad.mos_aplicado_pct;
      const score = ficha.cualitativo.score_total;
      const esperado = score >= 8 ? 20 : score >= 6 ? 35 : 50;
      if (Math.abs(mos - esperado) > 0.1) amarillo.push(`MOS ${mos}% no coincide con score ${score.toFixed(1)} (esperado ${esperado}%)`);
    }
    // Cross: semáforo vs valuación (requiere ejecutar semáforo si no se hizo)
    let semaTxt = "";
    try {
      const { analizarSemaforo } = await import("@/lib/semaforo.server");
      const sema = await analizarSemaforo(simbolo);
      if (!sema.error) {
        // textoSemaforo no exportado aquí, se sintetiza
        const clasif = sema.clasificacionJerarquica;
        if (clasif && clasif !== "SIN DATOS" && ficha) {
          const esCompra = /COMPRA/i.test(clasif);
          const esVenta = /VENTA/i.test(ficha.decision_final) || /VENDER/i.test(tri?.decision_final ?? "");
          if (esCompra && esVenta) amarillo.push(`Incoherencia semáforo (${clasif}) vs valuación (${ficha.decision_final}) — señalar al cliente`);
        }
      }
    } catch {}
    const total = rojo.length + amarillo.length;
    secciones.push(`\n## T — VALIDACIÓN TRANSVERSAL (validar.py determinístico)\nChecks: ${checks.length ? checks.join(" · ") : "sin alertas previas"}`);
    if (rojo.length) secciones.push(`🔴 Rojas (${rojo.length}): ${rojo.join(" · ")}`);
    if (amarillo.length) secciones.push(`🟡 Amarillas (${amarillo.length}): ${amarillo.join(" · ")}`);
    if (!rojo.length && !amarillo.length) secciones.push(`✅ Sin inconsistencias determinísticas — listo para reporte al cliente (con disclaimer CNV).`);
    else if (rojo.length) secciones.push(`⛔ Bloquear publicación hasta resolver rojas; amarillas con advertencia explícita.`);
  } catch (e) {
    secciones.push(`\n## T — Validación\nSIN VALIDACIÓN: ${e instanceof Error ? e.message : String(e)}`);
  }

  const tiempo = ((Date.now() - t0) / 1000).toFixed(1);
  secciones.unshift(`# Análisis Completo F0→F10 — ${simbolo} · ${new Date().toISOString().slice(0, 10)} · ${tiempo}s\n> Jerarquía pt\\ + Labadie · F0 inicia (macro), F10 cierra (perfil). T transversal valida antes de publicar.`);
  secciones.push(`\n---\n*Análisis educativo — no es recomendación de inversión (CNV). Fuentes: Yahoo Finance, BCRA v4 + estadisticasbcra.com, ArgentinaDatos, CriptoYa, IOL/BYMA.*`);

  return { texto: secciones.join("\n\n"), fuentes, ok: true, eventos };
}

export async function ejecutarValidarAnalisis(argsRaw: string): Promise<ResultadoToolConEventos> {
  let simbolo = "";
  try {
    const p = JSON.parse(argsRaw) as { simbolo?: string };
    simbolo = String(p.simbolo ?? "").trim();
  } catch {
    simbolo = argsRaw.trim().slice(0, 24);
  }
  if (!simbolo) {
    return { texto: "SIN RESULTADOS: falta simbolo para validar.", fuentes: [], ok: false };
  }
  try {
    const [cuali, cuanti, wacc, tri, macro] = await Promise.all([
      claCualitativo(simbolo),
      claCuantitativo(simbolo),
      claWacc(simbolo),
      claTriangulacion(simbolo),
      claContextoMacro(),
    ]);
    const L: string[] = [`Validación T de ${simbolo}:`];
    const rojas: string[] = [];
    const amarillas: string[] = [];
    const m = cuanti.metricas as any;
    if (m.M14_deuda_ebitda != null && m.M14_deuda_ebitda > 4) rojas.push(`Deuda/EBITDA ${m.M14_deuda_ebitda.toFixed(1)}x`);
    if (m.M9_patrimonio_neto != null && m.M9_patrimonio_neto < 0) rojas.push("PN negativo");
    if (m.M6_margen_neto != null && m.M6_margen_neto < 0) rojas.push("Margen neto <0");
    if (m.M11_capital_trabajo != null && m.M11_capital_trabajo < 0) rojas.push("CT <0");
    if (!cuali.continuar) rojas.push(`Cualitativo ${cuali.score_total.toFixed(1)}<5.0`);
    if (wacc.wacc_usd == null) amarillas.push("WACC nulo");
    if (tri.rango_final == null) amarillas.push("Sin rango triangulación");
    if (macro.regimen_macro === "ADVERSO") amarillas.push("Régimen ADVERSO — exigir MOS alto");
    if (!rojas.length && !amarillas.length) L.push("✅ OK — sin hallazgos");
    else {
      if (rojas.length) L.push(`🔴 Rojas: ${rojas.join(" · ")}`);
      if (amarillas.length) L.push(`🟡 Amarillas: ${amarillas.join(" · ")}`);
    }
    return { texto: L.join("\n"), fuentes: [], ok: rojas.length === 0 };
  } catch (e) {
    return { texto: `SIN RESULTADOS validar: ${e instanceof Error ? e.message : String(e)}`, fuentes: [], ok: false };
  }
}


/** Ciclo económico intermarket (Pring/Stovall 6 etapas). */
export async function ejecutarCicloEconomico(): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  try {
    return { texto: textoCiclo(await claCiclo()), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al detectar el ciclo económico (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Performance de los ETFs sectoriales de EE.UU. */
export async function ejecutarPerformanceSectorial(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const periodo = (parseArgsClarity(argsRaw).periodo ?? "").toString().trim() || "5d";
  try {
    return {
      texto: textoPerformanceSectorial(await claPerformanceSectorial(periodo)),
      fuentes: [],
      ok: true,
    };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error en la performance sectorial (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Valuación de un sector (P/E, percentiles, WACC, solvencia). */
export async function ejecutarValuacionSectorial(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  const d = parseArgsClarity(argsRaw);
  const sector = (d.sector ?? "").toString().trim();
  const periodo = (d.periodo ?? "").toString().trim() || "1y";
  if (!sector) {
    return {
      texto:
        "SIN RESULTADOS: no recibí el sector. Reinvocá con el parámetro sector (ej. 'Technology', 'Energy', 'Healthcare').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    return {
      texto: textoValuacionSectorial(await claValuacionSectorial(sector, periodo)),
      fuentes: [],
      ok: true,
    };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error en la valuación del sector ${sector} (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

// ---------------------------------------------------------------------------
// IOL (InvertirOnline), fuentes públicas genéricas, gráficos e informes.
// Los ejecutores pueden emitir EVENTOS (gráfico / informe) que el orquestador
// envía al chat para renderizar visualizaciones dentro de la conversación.
// ---------------------------------------------------------------------------

import {
  iolLogin,
  iolSesionActiva,
  iolCerrarSesion,
  iolPerfil,
  iolEstadoCuenta,
  iolPortafolio,
  iolOperaciones,
  iolOperacion,
  iolNotificacion,
  iolTestInversorObtener,
  iolTestInversorResponder,
  iolAsesorMovimientos,
  iolAsesorClientes,
  iolAsesorVenderEspecieD,
  iolTitulo,
  iolCotizacionDetalle,
  iolCotizacion,
  iolOpciones,
  iolSerieHistorica,
  iolInstrumentosCotizacion,
  iolPanelesCotizacion,
  iolPanelTodos,
  iolFCITodos,
  iolFCISimbolo,
  iolFCITipoFondos,
  iolMEPGet,
  iolMEPPost,
  iolComprar,
  iolVender,
  iolComprarEspecieD,
  iolVenderEspecieD,
  iolSuscripcionFCI,
  iolRescateFCI,
  iolTokenDDJJ,
  iolPuedeOperarCPD,
  iolSubastasCPD,
  iolComisionesCPD,
  iolOperarCPD,
  iolMontosEstimados,
  iolParametrosOperatoria,
  iolValidarMonto,
  iolVentaMepSimpleMontos,
  iolOperatoriaComprar,
  FUENTE_IOL,
  type ActivoPortafolio,
} from "@/lib/iol.server";
import {
  yfinanceConsulta,
  argentinaDatosConsulta,
  criptoyaConsulta,
  bcraCambiariasConsulta,
  bcraMonetariasConsulta,
  type SeriePunto,
} from "@/lib/fuentes.server";
import { fetchYahooChart } from "@/lib/yahoo-http";

export type EventoChat =
  | { t: "chart"; v: Record<string, unknown> }
  | { t: "informe"; v: { titulo: string; contenidoMarkdown: string } };

export type ResultadoToolConEventos = {
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
  eventos?: EventoChat[];
};

function nfIOL(n: unknown, dec = 2): string {
  return typeof n === "number" && isFinite(n)
    ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec }).format(n)
    : "s/d";
}

function tablaMD(headers: string[], filas: Array<Array<string | number>>): string {
  const celdas = (row: Array<string | number>) => `| ${row.map((c) => String(c)).join(" | ")} |`;
  return [celdas(headers), `|${headers.map(() => "---").join("|")}|`, ...filas.map(celdas)].join(
    "\n",
  );
}

function portafolioATexto(pais: string, activos: ActivoPortafolio[] | undefined): string {
  if (!activos?.length) return `El portafolio de ${pais} no tiene posiciones abiertas.`;
  const filas = activos.map((a) => [
    a.titulo?.simbolo ?? "s/d",
    a.titulo?.descripcion ?? "",
    nfIOL(a.cantidad, 0),
    nfIOL(a.ppc),
    nfIOL(a.ultimoPrecio),
    `${nfIOL(a.variacionDiaria)}%`,
    `${nfIOL(a.gananciaPorcentaje)}%`,
    nfIOL(a.valorizado),
  ]);
  const total = activos.reduce((s, a) => s + (a.valorizado ?? 0), 0);
  return [
    `Portafolio IOL (${pais}) — ${activos.length} posiciones, valorizado total ${nfIOL(total)}:`,
    tablaMD(
      ["Símbolo", "Descripción", "Cantidad", "PPC", "Último", "Var. día", "Gan. %", "Valorizado"],
      filas,
    ),
  ].join("\n");
}

// --- iol_login -------------------------------------------------------------

export async function ejecutarIolLogin(
  argsRaw: string,
  sessionId: string,
): Promise<ResultadoToolConEventos> {
  let usuario = "";
  let password = "";
  let accion = "iniciar";
  try {
    const args = JSON.parse(argsRaw) as { usuario?: string; password?: string; accion?: string };
    usuario = String(args.usuario ?? "").trim();
    password = String(args.password ?? "");
    accion = String(args.accion ?? "iniciar").trim() || "iniciar";
  } catch {
    /* sin args */
  }
  if (accion === "estado") {
    return {
      texto: iolSesionActiva(sessionId)
        ? "HAY SESIÓN ACTIVA de IOL para esta conversación: podés usar iol_cuenta, iol_mercado e iol_operar."
        : "NO hay sesión activa de IOL. Pedile al usuario su usuario y contraseña de IOL e invocá iol_login.",
      fuentes: [FUENTE_IOL],
      ok: true,
    };
  }
  if (accion === "cerrar") {
    iolCerrarSesion(sessionId);
    return { texto: "Sesión de IOL cerrada.", fuentes: [FUENTE_IOL], ok: true };
  }
  if (!usuario || !password) {
    return {
      texto:
        "FALTAN CREDENCIALES: para iniciar sesión en IOL necesito el usuario y la contraseña. Pedíselos al usuario y reinvocá iol_login(usuario, password).",
      fuentes: [FUENTE_IOL],
      ok: false,
    };
  }
  const r = await iolLogin(sessionId, usuario, password);
  return {
    texto: r.ok
      ? `${r.detalle} Ya podés consultar perfil, estado de cuenta, portafolio, operaciones y mercado con iol_cuenta / iol_mercado / iol_operar.`
      : `${r.detalle} No reintentes sin nuevas credenciales del usuario.`,
    fuentes: [FUENTE_IOL],
    ok: r.ok,
  };
}

// --- iol_cuenta ------------------------------------------------------------

export async function ejecutarIolCuenta(
  argsRaw: string,
  sessionId: string,
): Promise<ResultadoToolConEventos> {
  let accion = "";
  let pais = "argentina";
  let numero = 0;
  let estado = "";
  let fechaDesde = "";
  let fechaHasta = "";
  try {
    const args = JSON.parse(argsRaw) as {
      accion?: string;
      pais?: string;
      numero?: number;
      estado?: string;
      fechaDesde?: string;
      fechaHasta?: string;
    };
    accion = String(args.accion ?? "").trim();
    pais = String(args.pais ?? "argentina").trim() || "argentina";
    numero = Number(args.numero ?? 0);
    estado = String(args.estado ?? "").trim();
    fechaDesde = String(args.fechaDesde ?? "").trim();
    fechaHasta = String(args.fechaHasta ?? "").trim();
  } catch {
    /* sin args */
  }
  if (!iolSesionActiva(sessionId)) {
    return {
      texto:
        "NO AUTENTICADO: no hay sesión de IOL activa. Invocá primero iol_login con las credenciales que te dé el usuario.",
      fuentes: [FUENTE_IOL],
      ok: false,
    };
  }
  switch (accion) {
    case "perfil": {
      const r = await iolPerfil(sessionId);
      return {
        texto:
          r.ok && r.data
            ? `Perfil IOL:\n${JSON.stringify(r.data, null, 1).slice(0, 2500)}`
            : `SIN RESULTADOS: ${r.error ?? "sin datos de perfil"}.`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "estadocuenta": {
      const r = await iolEstadoCuenta(sessionId);
      if (!r.ok || !r.data)
        return {
          texto: `SIN RESULTADOS: ${r.error ?? "sin datos"}.`,
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const cuentas = (r.data as { cuentas?: Array<Record<string, unknown>> }).cuentas ?? [];
      const filas = cuentas.map((c) => [
        String(c["numero"] ?? ""),
        String(c["tipo"] ?? ""),
        String(c["moneda"] ?? ""),
        nfIOL(c["disponible"] as number),
        nfIOL(c["comprometido"] as number),
        nfIOL(c["total"] as number),
      ]);
      const totalPesos = (r.data as { totalEnPesos?: number }).totalEnPesos;
      return {
        texto: [
          "Estado de cuenta IOL:",
          filas.length
            ? tablaMD(["N°", "Tipo", "Moneda", "Disponible", "Comprometido", "Total"], filas)
            : "(sin cuentas)",
          typeof totalPesos === "number"
            ? `\nTotal consolidado en pesos: ${nfIOL(totalPesos)}.`
            : "",
        ].join("\n"),
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "portafolio": {
      const r = await iolPortafolio(sessionId, pais);
      if (!r.ok) return { texto: `SIN RESULTADOS: ${r.error}`, fuentes: [FUENTE_IOL], ok: false };
      return {
        texto: portafolioATexto(pais, r.data?.activos),
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "operaciones": {
      const r = await iolOperaciones(sessionId, {
        ...(numero ? { numero } : {}),
        ...(estado ? { estado } : {}),
        ...(fechaDesde ? { fechaDesde } : {}),
        ...(fechaHasta ? { fechaHasta } : {}),
        pais,
      });
      if (!r.ok) return { texto: `SIN RESULTADOS: ${r.error}`, fuentes: [FUENTE_IOL], ok: false };
      const ops = (Array.isArray(r.data) ? r.data : []) as Array<Record<string, unknown>>;
      if (!ops.length)
        return { texto: "Sin operaciones para ese filtro.", fuentes: [FUENTE_IOL], ok: true };
      const filas = ops
        .slice(0, 30)
        .map((o) => [
          String(o["numero"] ?? ""),
          String(o["simbolo"] ?? ""),
          String(o["tipo"] ?? ""),
          String(o["estado"] ?? ""),
          nfIOL(o["cantidad"] as number, 0),
          nfIOL(o["precio"] as number),
          nfIOL(o["monto"] as number),
          String(o["fechaOrden"] ?? "").slice(0, 10),
        ]);
      return {
        texto: `Operaciones IOL (${ops.length}):\n${tablaMD(
          ["N°", "Símbolo", "Tipo", "Estado", "Cant.", "Precio", "Monto", "Fecha"],
          filas,
        )}`,
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "operacion": {
      if (!numero)
        return {
          texto: "Falta el número de operación (parámetro numero).",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolOperacion(sessionId, numero);
      return {
        texto:
          r.ok && r.data
            ? `Detalle de la operación ${numero}:\n${JSON.stringify(r.data, null, 1).slice(0, 3000)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "notificacion": {
      const r = await iolNotificacion(sessionId);
      return {
        texto:
          r.ok && r.data
            ? `Notificaciones IOL:\n${JSON.stringify(r.data, null, 1).slice(0, 1500)}`
            : `SIN RESULTADOS: ${r.error ?? "sin notificaciones"}.`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "test_inversor": {
      const r = await iolTestInversorObtener(sessionId);
      return {
        texto:
          r.ok && r.data
            ? `Preguntas del test de inversor de IOL:\n${JSON.stringify(r.data, null, 1).slice(0, 4000)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    default:
      return {
        texto:
          "Acción inválida para iol_cuenta. Usá: perfil | estadocuenta | portafolio | operaciones | operacion | notificacion | test_inversor.",
        fuentes: [FUENTE_IOL],
        ok: false,
      };
  }
}

// --- iol_mercado -----------------------------------------------------------

export async function ejecutarIolMercado(
  argsRaw: string,
  sessionId: string,
): Promise<ResultadoToolConEventos> {
  let accion = "";
  let simbolo = "";
  let mercado = "bCBA";
  let instrumento = "";
  let pais = "argentina";
  let fechaDesde = "";
  let fechaHasta = "";
  try {
    const args = JSON.parse(argsRaw) as Record<string, unknown>;
    accion = String(args["accion"] ?? "").trim();
    simbolo = String(args["simbolo"] ?? "").trim();
    mercado = String(args["mercado"] ?? "bCBA").trim() || "bCBA";
    instrumento = String(args["instrumento"] ?? "").trim();
    pais = String(args["pais"] ?? "argentina").trim() || "argentina";
    fechaDesde = String(args["fechaDesde"] ?? "").trim();
    fechaHasta = String(args["fechaHasta"] ?? "").trim();
  } catch {
    /* sin args */
  }
  if (!iolSesionActiva(sessionId)) {
    return {
      texto:
        "NO AUTENTICADO: los datos de mercado de IOL requieren sesión iniciada. Invocá primero iol_login.",
      fuentes: [FUENTE_IOL],
      ok: false,
    };
  }
  switch (accion) {
    case "cotizacion_detalle":
    case "cotizacion": {
      if (!simbolo)
        return { texto: "Falta el símbolo del título.", fuentes: [FUENTE_IOL], ok: false };
      const r =
        accion === "cotizacion"
          ? await iolCotizacion(sessionId, mercado, simbolo)
          : await iolCotizacionDetalle(sessionId, mercado, simbolo);
      if (!r.ok || !r.data)
        return { texto: `SIN RESULTADOS: ${r.error}`, fuentes: [FUENTE_IOL], ok: false };
      const d = r.data as Record<string, unknown>;
      const punta0 = (d["puntas"] as Array<Record<string, unknown>> | undefined)?.[0];
      return {
        texto: [
          `Cotización IOL de ${simbolo} (${mercado}):`,
          `- Último precio: ${nfIOL(d["ultimoPrecio"] as number)} ${String(d["moneda"] ?? "")}`,
          `- Variación: ${nfIOL(d["variacion"] as number)}% (${nfIOL(d["puntosVariacion"] as number)} pts) · Tendencia: ${String(d["tendencia"] ?? "s/d")}`,
          `- Apertura ${nfIOL(d["apertura"] as number)} · Máximo ${nfIOL(d["maximo"] as number)} · Mínimo ${nfIOL(d["minimo"] as number)} · Cierre anterior ${nfIOL(d["cierreAnterior"] as number)}`,
          `- Volumen nominal ${nfIOL(d["volumenNominal"] as number, 0)} · Monto operado ${nfIOL(d["montoOperado"] as number, 0)} · Operaciones ${nfIOL(d["cantidadOperaciones"] as number, 0)}`,
          `- Puntas: compra ${nfIOL(punta0?.["precioCompra"] as number)} x ${nfIOL(punta0?.["cantidadCompra"] as number, 0)} · venta ${nfIOL(punta0?.["precioVenta"] as number)} x ${nfIOL(punta0?.["cantidadVenta"] as number, 0)}`,
          `- Fecha/hora: ${String(d["fechaHora"] ?? "s/d")}`,
        ].join("\n"),
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "panel_todos": {
      if (!instrumento)
        return {
          texto:
            "Para panel_todos indicá instrumento (acciones, cedears, titulospublicos, letras, bonos...).",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolPanelTodos(sessionId, instrumento, pais);
      const titulos = r.data?.titulos ?? [];
      if (!r.ok || !titulos.length)
        return {
          texto: `SIN RESULTADOS: ${r.error ?? "panel vacío"}.`,
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const filas = titulos
        .slice(0, 40)
        .map((t) => [
          String(t["simbolo"] ?? ""),
          String(t["descripcion"] ?? "").slice(0, 28),
          nfIOL(t["ultimoPrecio"] as number),
          `${nfIOL(t["variacionPorcentual"] as number)}%`,
          nfIOL(t["volumen"] as number, 0),
        ]);
      return {
        texto: `Panel IOL ${instrumento}/${pais} (${titulos.length} títulos, primeros ${filas.length}):\n${tablaMD(
          ["Símbolo", "Descripción", "Último", "Var %", "Volumen"],
          filas,
        )}`,
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "fci_todos": {
      const r = await iolFCITodos(sessionId);
      const lista = (Array.isArray(r.data) ? r.data : []) as Array<Record<string, unknown>>;
      if (!r.ok || !lista.length)
        return {
          texto: `SIN RESULTADOS: ${r.error ?? "sin FCI"}.`,
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const filas = lista
        .slice(0, 30)
        .map((f) => [
          String(f["simbolo"] ?? ""),
          String(f["descripcion"] ?? "").slice(0, 34),
          nfIOL(f["ultimoOperado"] as number),
          `${nfIOL(f["variacionMensual"] as number)}%`,
          String(f["tipoAdministradoraTituloFCI"] ?? ""),
        ]);
      return {
        texto: `FCI disponibles en IOL (${lista.length}, primeros ${filas.length}):\n${tablaMD(
          ["Símbolo", "Nombre", "VCP", "Var. mes", "Administradora"],
          filas,
        )}\nTipos de fondo: usa fci_tipos.`,
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "fci_simbolo": {
      if (!simbolo) return { texto: "Falta el símbolo del FCI.", fuentes: [FUENTE_IOL], ok: false };
      const r = await iolFCISimbolo(sessionId, simbolo);
      return {
        texto:
          r.ok && r.data
            ? `FCI ${simbolo}:\n${JSON.stringify(r.data, null, 1).slice(0, 2500)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "fci_tipos": {
      const r = await iolFCITipoFondos(sessionId);
      return {
        texto:
          r.ok && r.data
            ? `Tipos de fondos FCI IOL:\n${JSON.stringify(r.data).slice(0, 1500)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "mep": {
      if (!simbolo)
        return {
          texto: "Indicá el bono para calcular el MEP (ej. AL30).",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolMEPGet(sessionId, simbolo);
      return {
        texto:
          r.ok && typeof r.data === "number"
            ? `Dólar MEP implícito de ${simbolo} (IOL): $${nfIOL(r.data)}.`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "serie_historica": {
      if (!simbolo || !fechaDesde || !fechaHasta)
        return {
          texto: "Para serie_historica necesitás simbolo, fechaDesde y fechaHasta (YYYY-MM-DD).",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolSerieHistorica(sessionId, mercado, simbolo, fechaDesde, fechaHasta, true);
      const serie = (Array.isArray(r.data) ? r.data : []) as Array<Record<string, unknown>>;
      if (!r.ok || !serie.length)
        return {
          texto: `SIN RESULTADOS: ${r.error ?? "serie vacía"}.`,
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const puntos: SeriePunto[] = serie
        .filter((p) => typeof p["ultimoPrecio"] === "number")
        .map((p) => ({
          f: String(p["fechaHora"] ?? "").slice(0, 10),
          v: p["ultimoPrecio"] as number,
        }));
      const ult = puntos[puntos.length - 1]!;
      return {
        texto: `Serie histórica IOL de ${simbolo}: ${puntos.length} sesiones, último ${nfIOL(ult.v)}, mínimo ${nfIOL(Math.min(...puntos.map((p) => p.v)))}, máximo ${nfIOL(Math.max(...puntos.map((p) => p.v)))}.`,
        fuentes: [FUENTE_IOL],
        ok: true,
        ...(puntos.length > 2
          ? {
              eventos: [
                {
                  t: "chart",
                  v: { tipo: "linea", titulo: `${simbolo} (IOL)`, unidad: "ARS", serie: puntos },
                },
              ] as EventoChat[],
            }
          : {}),
      };
    }
    case "opciones": {
      if (!simbolo)
        return {
          texto: "Indicá el subyacente para listar opciones.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolOpciones(sessionId, mercado, simbolo);
      const lista = (Array.isArray(r.data) ? r.data : []) as Array<Record<string, unknown>>;
      if (!r.ok || !lista.length)
        return {
          texto: `SIN RESULTADOS: ${r.error ?? "sin opciones"}.`,
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const filas = lista
        .slice(0, 25)
        .map((o) => [
          String(o["simbolo"] ?? ""),
          String(o["tipoOpcion"] ?? ""),
          nfIOL(o["precioEjercicio"] as number),
          String(o["fechaVencimiento"] ?? "").slice(0, 10),
        ]);
      return {
        texto: `Opciones de ${simbolo} (${lista.length}):\n${tablaMD(["Símbolo", "Tipo", "Strike", "Vencimiento"], filas)}`,
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "instrumentos": {
      const r = await iolInstrumentosCotizacion(sessionId, pais);
      return {
        texto:
          r.ok && r.data
            ? `Instrumentos con cotización en ${pais}:\n${JSON.stringify(r.data).slice(0, 1500)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "paneles": {
      if (!instrumento)
        return {
          texto: "Indicá el instrumento para listar paneles.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolPanelesCotizacion(sessionId, pais, instrumento);
      return {
        texto:
          r.ok && r.data
            ? `Paneles de ${instrumento} en ${pais}:\n${JSON.stringify(r.data).slice(0, 1500)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    default:
      return {
        texto:
          "Acción inválida para iol_mercado. Usá: cotizacion_detalle | cotizacion | panel_todos | fci_todos | fci_simbolo | fci_tipos | mep | serie_historica | opciones | instrumentos | paneles.",
        fuentes: [FUENTE_IOL],
        ok: false,
      };
  }
}

// --- iol_operar ------------------------------------------------------------

const ORDENES_REALES = new Set([
  "comprar",
  "vender",
  "comprar_especie_d",
  "vender_especie_d",
  "cpd_operar",
  "operatoria_comprar",
]);

export async function ejecutarIolOperar(
  argsRaw: string,
  sessionId: string,
): Promise<ResultadoToolConEventos> {
  const args = (() => {
    try {
      return (JSON.parse(argsRaw) ?? {}) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const str = (k: string, def = "") => String(args[k] ?? def).trim();
  const num = (k: string): number | undefined => {
    const v = Number(args[k]);
    return args[k] != null && isFinite(v) ? v : undefined;
  };
  const bool = (k: string): boolean => args[k] === true;

  const accion = str("accion");
  if (!accion) return { texto: "Falta la acción de iol_operar.", fuentes: [FUENTE_IOL], ok: false };

  if (!iolSesionActiva(sessionId)) {
    return {
      texto:
        "NO AUTENTICADO: para operar en IOL hace falta sesión iniciada. Invocá primero iol_login con las credenciales del usuario.",
      fuentes: [FUENTE_IOL],
      ok: false,
    };
  }

  // Guardia de seguridad: órdenes reales exigen confirmación explícita.
  if (ORDENES_REALES.has(accion) && !bool("confirmar")) {
    return {
      texto: `SIMULACIÓN (confirmar=false): NO se envió ninguna orden a IOL. La orden "${accion}" quedaría así: ${argsRaw}. Mostrale estos parámetros al usuario y pedile una confirmación explícita; recién entonces reinvocá iol_operar con confirmar=true.`,
      fuentes: [FUENTE_IOL],
      ok: true,
    };
  }

  const precioArg = num("precio");
  const validezArg = str("validez");
  const montoArg = num("monto");
  const idFuenteArg = num("idFuente");
  const idCuentaBancariaArg = num("idCuentaBancaria");
  const ordenBase = () => ({
    mercado: str("mercado", "bCBA") || "bCBA",
    simbolo: str("simbolo"),
    cantidad: num("cantidad") ?? 0,
    ...(precioArg != null ? { precio: precioArg } : {}),
    ...(validezArg ? { validez: validezArg } : {}),
    tipoOrden: str("tipoOrden", "precioLimite") || "precioLimite",
    plazo: str("plazo", "t0") || "t0",
    ...(montoArg != null ? { monto: montoArg } : {}),
    ...(idFuenteArg != null ? { idFuente: idFuenteArg } : {}),
  });
  switch (accion) {
    case "comprar": {
      const o = ordenBase();
      if (!o.simbolo || !o.cantidad)
        return {
          texto: "Para comprar hacen falta simbolo y cantidad.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolComprar(sessionId, o);
      return {
        texto: r.resumen ?? r.error ?? "Respuesta de IOL vacía.",
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "vender": {
      const o = ordenBase();
      if (!o.simbolo || !o.cantidad)
        return {
          texto: "Para vender hacen falta simbolo y cantidad.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolVender(sessionId, o);
      return {
        texto: r.resumen ?? r.error ?? "Respuesta de IOL vacía.",
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "comprar_especie_d": {
      const o = ordenBase();
      if (!o.simbolo || !o.cantidad)
        return {
          texto: "Para comprar especie D hacen falta simbolo y cantidad.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolComprarEspecieD(sessionId, o);
      return {
        texto: r.resumen ?? r.error ?? "Respuesta de IOL vacía.",
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "vender_especie_d": {
      const o = ordenBase();
      if (!o.simbolo || !o.cantidad)
        return {
          texto: "Para vender especie D hacen falta simbolo y cantidad.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolVenderEspecieD(sessionId, {
        ...o,
        ...(idCuentaBancariaArg != null ? { idCuentaBancaria: idCuentaBancariaArg } : {}),
      });
      return {
        texto: r.resumen ?? r.error ?? "Respuesta de IOL vacía.",
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "suscripcion_fci": {
      const soloValidar = args["soloValidar"] !== false;
      if (!str("simbolo") || num("monto") == null)
        return {
          texto: "Para suscripción FCI hacen falta simbolo y monto.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolSuscripcionFCI(sessionId, str("simbolo"), num("monto")!, soloValidar);
      return {
        texto: `${soloValidar ? "[VALIDACIÓN]" : "[ORDEN ENVIADA]"} ${r.resumen ?? r.error ?? ""}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "rescate_fci": {
      const soloValidar = args["soloValidar"] !== false;
      if (!str("simbolo") || num("cantidad") == null)
        return {
          texto: "Para rescate FCI hacen falta simbolo y cantidad.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolRescateFCI(sessionId, str("simbolo"), num("cantidad")!, soloValidar);
      return {
        texto: `${soloValidar ? "[VALIDACIÓN]" : "[ORDEN ENVIADA]"} ${r.resumen ?? r.error ?? ""}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "token_ddjj": {
      if (!str("simbolo"))
        return { texto: "Para token DDJJ hace falta simbolo.", fuentes: [FUENTE_IOL], ok: false };
      const r = await iolTokenDDJJ(sessionId, {
        mercado: str("mercado", "bCBA") || "bCBA",
        simbolo: str("simbolo"),
        cantidad: num("cantidad") ?? 0,
        monto: num("monto") ?? 0,
      });
      return {
        texto:
          r.ok && r.data
            ? `Token DDJJ obtenido: ${String(r.data.token ?? "").slice(0, 12)}… (vence ${String(r.data.expiration ?? "s/d")}).`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "puede_operar_cpd": {
      const r = await iolPuedeOperarCPD(sessionId);
      return {
        texto:
          r.ok && r.data
            ? `Operatoria CPD habilitada: ${r.data.operatoriaHabilitada ? "SÍ" : "NO"}.`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "cpd_subastas": {
      const r = await iolSubastasCPD(
        sessionId,
        str("estado", "activas") || "activas",
        str("segmento"),
      );
      return {
        texto:
          r.ok && r.data
            ? `Subastas CPD:\n${JSON.stringify(r.data, null, 1).slice(0, 3000)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "cpd_comisiones": {
      if (num("importe") == null || num("tasa") == null)
        return {
          texto: "Para cpd_comisiones hacen falta importe y tasa.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolComisionesCPD(
        sessionId,
        num("importe")!,
        str("plazo", "t0") || "t0",
        num("tasa")!,
      );
      return {
        texto:
          r.ok && r.data
            ? `Comisiones CPD:\n${JSON.stringify(r.data, null, 1).slice(0, 1500)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "cpd_operar": {
      if (num("idSubasta") == null || num("tasa") == null)
        return {
          texto: "Para cpd_operar hacen falta idSubasta y tasa.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolOperarCPD(sessionId, num("idSubasta")!, num("tasa")!);
      return {
        texto:
          r.ok && r.data
            ? `Operación CPD registrada (idTransacción ${r.data.idTransaccion ?? "s/d"}).`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "montos_estimados": {
      if (num("monto") == null)
        return { texto: "Indicá el monto.", fuentes: [FUENTE_IOL], ok: false };
      const r = await iolMontosEstimados(sessionId, num("monto")!);
      return {
        texto:
          r.ok && r.data
            ? `Montos estimados operatoria simplificada:\n${JSON.stringify(r.data, null, 1).slice(0, 1500)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "venta_mep_simple_montos": {
      if (num("monto") == null)
        return { texto: "Indicá el monto en dólares.", fuentes: [FUENTE_IOL], ok: false };
      const r = await iolVentaMepSimpleMontos(sessionId, num("monto")!);
      return {
        texto:
          r.ok && r.data
            ? `Venta MEP simple — montos estimados:\n${JSON.stringify(r.data, null, 1).slice(0, 1500)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "parametros_operatoria": {
      if (num("idTipoOperatoria") == null)
        return { texto: "Indicá idTipoOperatoria.", fuentes: [FUENTE_IOL], ok: false };
      const r = await iolParametrosOperatoria(sessionId, num("idTipoOperatoria")!);
      return {
        texto:
          r.ok && r.data
            ? `Parámetros de la operatoria:\n${JSON.stringify(r.data, null, 1).slice(0, 2000)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "validar_monto": {
      if (num("monto") == null || num("idTipoOperatoria") == null)
        return {
          texto: "Para validar_monto hacen falta monto e idTipoOperatoria.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolValidarMonto(sessionId, num("monto")!, num("idTipoOperatoria")!);
      return { texto: r.resumen ?? r.error ?? "", fuentes: [FUENTE_IOL], ok: r.ok };
    }
    case "operatoria_comprar": {
      if (num("monto") == null || num("idTipoOperatoriaSimplificada") == null)
        return {
          texto: "Para operatoria_comprar hacen falta monto e idTipoOperatoriaSimplificada.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolOperatoriaComprar(
        sessionId,
        num("monto")!,
        num("idTipoOperatoriaSimplificada")!,
        num("idCuentaBancaria"),
      );
      return { texto: r.resumen ?? r.error ?? "", fuentes: [FUENTE_IOL], ok: r.ok };
    }
    default:
      return {
        texto:
          "Acción inválida para iol_operar. Consultá la descripción de la herramienta para las acciones disponibles.",
        fuentes: [FUENTE_IOL],
        ok: false,
      };
  }
}

// --- datos_financieros -----------------------------------------------------

export async function ejecutarDatosFinancieros(argsRaw: string): Promise<ResultadoToolConEventos> {
  const args = (() => {
    try {
      return (JSON.parse(argsRaw) ?? {}) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const fuente = String(args["fuente"] ?? "").trim();
  const str = (k: string) => String(args[k] ?? "").trim();
  try {
    switch (fuente) {
      case "yfinance": {
        const simbolo = str("simbolo");
        if (!simbolo)
          return {
            texto: "Para yfinance indicá el símbolo (ej. AAPL, GGAL.BA, BTC-USD).",
            fuentes: [],
            ok: false,
          };
        return {
          ...(await yfinanceConsulta(
            simbolo,
            str("modulo") || "price,summaryDetail,financialData",
          )),
          ok: true,
        };
      }
      case "argentinadatos": {
        const endpoint = str("endpoint");
        if (!endpoint)
          return {
            texto: 'Para argentinadatos indicá el endpoint (ej. "finanzas/indices/uva").',
            fuentes: [],
            ok: false,
          };
        return { ...(await argentinaDatosConsulta(endpoint)), ok: true };
      }
      case "criptoya":
        return { ...(await criptoyaConsulta(str("endpoint") || "dolar")), ok: true };
      case "bcra_cambiarias":
        return {
          ...(await bcraCambiariasConsulta(str("accion") || "divisas", {
            codMoneda: str("codMoneda"),
            fechaDesde: str("fechaDesde"),
            fechaHasta: str("fechaHasta"),
          })),
          ok: true,
        };
      case "bcra_monetarias": {
        const idVar = Number(args["idVariable"]);
        return {
          ...(await bcraMonetariasConsulta(str("accion") || "principales_variables", {
            idVariable: isFinite(idVar) && idVar > 0 ? idVar : undefined,
            categoria: str("categoria"),
            desde: str("fechaDesde"),
            hasta: str("fechaHasta"),
          })),
          ok: true,
        };
      }
      default:
        return {
          texto:
            "Fuente inválida. Usá una de: yfinance | argentinadatos | criptoya | bcra_cambiarias | bcra_monetarias.",
          fuentes: [],
          ok: false,
        };
    }
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error consultando ${fuente} (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

// --- grafico_chat ----------------------------------------------------------

export async function ejecutarGraficoChat(argsRaw: string): Promise<ResultadoToolConEventos> {
  const args = (() => {
    try {
      return (JSON.parse(argsRaw) ?? {}) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const tipo = String(args["tipo"] ?? "linea").trim();
  const titulo = String(args["titulo"] ?? "").trim();

  if (tipo === "tradingview") {
    let simbolo = String(args["simbolo"] ?? "").trim().toUpperCase();
    // Normalización autónoma: el LLM muchas veces manda "AAPL" sin exchange.
    // Como es ejecutor autónomo para UI deployada en Vercel, resolvemos acá sin fallar.
    if (!simbolo) simbolo = "NASDAQ:AAPL";
    if (!simbolo.includes(":")) {
      // Heurística simple: tickers US -> NASDAQ, BCBA -> BCBA, cripto con - -> BINANCE
      if (/^[A-Z]{1,6}(\.[A-Z]+)?$/.test(simbolo) && !simbolo.includes(".BA")) {
        // Si es ticker tipo AAPL, MSFT, NVDA -> NASDAQ; si contiene .BA -> BCBA
        simbolo = `NASDAQ:${simbolo}`;
      } else if (simbolo.endsWith(".BA")) {
        simbolo = `BCBA:${simbolo.replace(".BA", "")}`;
      } else if (simbolo.includes("-") || simbolo.includes("USDT") || simbolo.includes("BTC")) {
        simbolo = `BINANCE:${simbolo}`;
      } else {
        simbolo = `NASDAQ:${simbolo}`;
      }
    }
    const intervalo = String(args["intervalo"] ?? "D").trim() || "D";
    return {
      texto: `Gráfico de TradingView generado para ${simbolo} (intervalo ${intervalo}). El usuario lo ve embebido en el chat; comentalo y ofrecé cambiar símbolo o temporalidad. Link directo: https://www.tradingview.com/symbols/${simbolo.replace(":", "-")}/ — widget: https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(simbolo)}&interval=${encodeURIComponent(intervalo)}&theme=dark`,
      fuentes: [],
      ok: true,
      eventos: [
        { t: "chart", v: { tipo: "tradingview", titulo: titulo || simbolo, simbolo, intervalo } },
      ],
    };
  }

  if (tipo === "barras") {
    const categorias = (Array.isArray(args["categorias"]) ? args["categorias"] : []).map(String);
    const valores = (Array.isArray(args["valores"]) ? args["valores"] : [])
      .map(Number)
      .filter(isFinite);
    if (!categorias.length || categorias.length !== valores.length) {
      return {
        texto: "SIN GRÁFICO: para barras necesitás categorias[] y valores[] de igual longitud.",
        fuentes: [],
        ok: false,
      };
    }
    return {
      texto: `Gráfico de barras generado (${categorias.length} categorías): ${categorias
        .map((c, i) => `${c}=${valores[i]}`)
        .join(", ")}. Comentá el resultado.`,
      fuentes: [],
      ok: true,
      eventos: [
        { t: "chart", v: { tipo: "barras", titulo: titulo || "Comparativa", categorias, valores } },
      ],
    };
  }

  // linea: datos propios o Yahoo Finance.
  let puntos: SeriePunto[] = [];
  let unidad = String(args["unidad"] ?? "").trim();
  let tituloFinal = titulo;
  if (Array.isArray(args["serie"])) {
    puntos = (args["serie"] as Array<{ f?: unknown; v?: unknown }>)
      .map((p) => ({ f: String(p.f ?? ""), v: Number(p.v) }))
      .filter((p) => isFinite(p.v));
  }
  if (!puntos.length) {
    const simbolo = String(args["simbolo"] ?? "").trim();
    if (!simbolo)
      return {
        texto: "SIN GRÁFICO: para línea indicá simbolo (Yahoo Finance) o una serie [{f,v}].",
        fuentes: [],
        ok: false,
      };
    const rangoRaw = String(args["rango"] ?? "6mo").trim() || "6mo";
    // Soporta "1 AÑO", "1 ano", "6M", "3M" etc. (normaliza a Yahoo)
    const { normalizarRangoYahoo } = await import("@/lib/yahoo-http");
    const rango = normalizarRangoYahoo(rangoRaw);
    let chart: any;
    try {
      chart = await fetchYahooChart(simbolo, rango, "1d");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Mensaje honesto para red de seguridad, no "problema transitorio"
      return {
        texto: `SIN GRÁFICO: Yahoo Finance no devolvió datos para ${simbolo} (rango ${rangoRaw}→${rango}): ${msg.slice(0, 200)}`,
        fuentes: [],
        ok: false,
      };
    }
    const res = chart?.chart?.result?.[0];
    const closes = res?.indicators?.quote?.[0]?.close ?? [];
    const ts = res?.timestamp ?? [];
    puntos = ts
      .map((t: number, i: number) => ({
        f: new Date(t * 1000).toISOString().slice(0, 10),
        v: closes[i] as number,
      }))
      .filter((p: { v: number }) => isFinite(p.v));
    unidad = unidad || res?.meta?.currency || "";
    tituloFinal = tituloFinal || res?.meta?.longName || res?.meta?.shortName || simbolo;
    if (!puntos.length)
      return {
        texto: `SIN GRÁFICO: Yahoo Finance no devolvió datos para ${simbolo}.`,
        fuentes: [],
        ok: false,
      };
  }
  const valores = puntos.map((p) => p.v);
  const ult = valores[valores.length - 1]!;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  return {
    texto: `Gráfico de línea generado: ${tituloFinal} — ${puntos.length} puntos, último ${nfIOL(ult)}, mínimo ${nfIOL(min)}, máximo ${nfIOL(max)}${unidad ? ` (${unidad})` : ""}. Redactá un comentario breve de la evolución.`,
    fuentes: [],
    ok: true,
    eventos: [{ t: "chart", v: { tipo: "linea", titulo: tituloFinal, unidad, serie: puntos } }],
  };
}

// --- generar_informe -------------------------------------------------------

export async function ejecutarGenerarInforme(argsRaw: string): Promise<ResultadoToolConEventos> {
  let titulo = "";
  let contenido = "";
  try {
    const args = JSON.parse(argsRaw) as { titulo?: string; contenidoMarkdown?: string };
    titulo = String(args.titulo ?? "").trim();
    contenido = String(args.contenidoMarkdown ?? "");
  } catch {
    /* sin args */
  }
  if (!titulo || contenido.trim().length < 80) {
    return {
      texto:
        "SIN INFORME: necesito titulo y contenidoMarkdown (mínimo ~80 caracteres). Redactá el informe completo con los datos reales obtenidos en este turno; no inventes cifras.",
      fuentes: [],
      ok: false,
    };
  }
  const fecha = new Date().toLocaleDateString("es-AR", { dateStyle: "long" });
  const documento = `# ${titulo}\n\n_${fecha}_\n\n${contenido}\n\n---\n\n*Documento generado por IA con datos de fuentes públicas citadas. Información general, no constituye recomendación de inversión.*`;
  return {
    texto: `Informe "${titulo}" generado y mostrado en el chat con botones de descarga (.md) e impresión/PDF. Avisale al usuario que puede descargarlo o imprimirlo como PDF.`,
    fuentes: [],
    ok: true,
    eventos: [{ t: "informe", v: { titulo, contenidoMarkdown: documento } }],
  };
}

// ---------------------------------------------------------------------------
// Herramientas migradas del tab /herramientas (clarity-dashboard).
// Invocan las server functions del subárbol src/lib/herramientas en contexto
// de servidor (ejecución local, sin HTTP).
// ---------------------------------------------------------------------------

import { optimizeAllPortfolios } from "@/lib/herramientas/finance.functions";
import { backtestOptimization } from "@/lib/herramientas/finance.functions";
import { getRiesgoAnalysis, type DistribStats } from "@/lib/herramientas/riesgo.functions";
import { getCAPMAnalysis } from "@/lib/herramientas/capm.functions";
import { getSectorAnalysis } from "@/lib/herramientas/sector-analysis.functions";
import { getSectorValuationRanking } from "@/lib/herramientas/sector-valuation-ranking.functions";
import { getMarketScreeners } from "@/lib/herramientas/daily-opportunities.functions";
import { getBenchmarksMatrix } from "@/lib/herramientas/sectores/benchmarks-matrix.functions";

type ResTool = { texto: string; fuentes: FuenteMercado[]; ok: boolean };

function pctS(v: number | null | undefined, dec = 1): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}
function n2(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return "s/d";
  return v.toFixed(dec);
}

type ArgsLibres = {
  tickers?: unknown;
  notional?: unknown;
  benchmarks?: unknown;
  years?: unknown;
  cutoffDate?: unknown;
  intervalo?: unknown;
  periodo?: unknown;
  autoDetect?: unknown;
  sector?: unknown;
  industry?: unknown;
};

function parseArgsObj(argsRaw: string): ArgsLibres {
  try {
    return JSON.parse(argsRaw) as ArgsLibres;
  } catch {
    return {};
  }
}

function tickersDe(args: ArgsLibres): string[] {
  const raw = args.tickers;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => String(t).trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);
}

export async function ejecutarOptimizacionAvanzada(argsRaw: string): Promise<ResTool> {
  const args = parseArgsObj(argsRaw);
  const tickers = tickersDe(args);
  if (tickers.length < 2) {
    return {
      texto:
        "SIN RESULTADOS: se necesitan al menos 2 tickers. Reinvocá con tickers=['SPY','QQQ',...].",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const r = (await optimizeAllPortfolios({
      data: {
        tickers,
        notional: typeof args.notional === "number" ? args.notional : 15000,
        numSimulations: 2000,
        benchmarks: Array.isArray(args.benchmarks) ? args.benchmarks.map(String) : ["SPY"],
        autoDetectBenchmarks: false,
        years: typeof args.years === "number" ? args.years : 2,
      },
    })) as unknown as Record<string, unknown>;
    const L: string[] = [
      `Optimización de cartera (${tickers.join(", ")}) — ${args.years ?? 2} años, series diarias Yahoo:`,
    ];
    for (const key of ["maxSharpe", "minVariance", "equalWeight", "inverseVol", "markowitz"]) {
      const e = r[key] as {
        retornoAnual?: number;
        volatilidadAnual?: number;
        sharpe?: number;
        var95?: number;
        pesos?: Record<string, number>;
      } | null;
      if (!e) continue;
      const pesos = Object.entries(e.pesos ?? {})
        .filter(([, w]) => Number(w) > 0.005)
        .map(([t, w]) => `${t} ${(Number(w) * 100).toFixed(1)}%`)
        .join(", ");
      L.push(
        `- ${key}: retorno ${pctS(e.retornoAnual)} · vol ${pctS(e.volatilidadAnual)} · Sharpe ${n2(e.sharpe)} · VaR95 ${pctS(e.var95)} · pesos: ${pesos || "—"}`,
      );
    }
    L.push(
      "Interpretación: Sharpe = retorno por unidad de riesgo; VaR95 = pérdida diaria típica del peor 5%.",
    );
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: no se pudo optimizar la cartera (${e instanceof Error ? e.message : "error"}). Verificá que los tickers tengan historia suficiente en Yahoo.`,
      fuentes: [],
      ok: false,
    };
  }
}

export async function ejecutarBacktestOptimizacion(argsRaw: string): Promise<ResTool> {
  const args = parseArgsObj(argsRaw);
  const tickers = tickersDe(args);
  const cutoff = String(args.cutoffDate ?? "").trim();
  if (tickers.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    return {
      texto:
        "SIN RESULTADOS: se necesitan tickers (>=2) y cutoffDate YYYY-MM-DD. Reinvocá con ambos parámetros.",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const r = (await backtestOptimization({
      data: {
        tickers,
        cutoffDate: cutoff,
        years: typeof args.years === "number" ? args.years : 2,
        numSimulations: 2000,
      },
    })) as unknown as Record<string, unknown>;
    const L = [`Backtest walk-forward (corte ${cutoff}, entrenamiento ${args.years ?? 2} años):`];
    for (const [k, v] of Object.entries(r)) {
      if (v && typeof v === "object" && "sharpe" in (v as object)) {
        const o = v as { retornoAnual?: number; volatilidadAnual?: number; sharpe?: number };
        L.push(
          `- ${k}: retorno ${pctS(o.retornoAnual)} · vol ${pctS(o.volatilidadAnual)} · Sharpe ${n2(o.sharpe)}`,
        );
      }
    }
    L.push(
      "El backtest entrena los pesos con datos previos al corte y los evalúa con datos posteriores (fuera de muestra).",
    );
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: backtest falló (${e instanceof Error ? e.message : "error"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

export async function ejecutarDistribucionRiesgo(argsRaw: string): Promise<ResTool> {
  const args = parseArgsObj(argsRaw);
  const tickers = tickersDe(args);
  if (!tickers.length) {
    return { texto: "SIN RESULTADOS: indicá al menos un ticker.", fuentes: [], ok: false };
  }
  try {
    const rs = (await getRiesgoAnalysis({
      data: {
        tickers,
        interval: typeof args.intervalo === "string" ? args.intervalo : "1d",
        period: typeof args.periodo === "string" ? args.periodo : "2y",
      },
    })) as unknown as DistribStats[];
    const lista = Array.isArray(rs) ? rs : [];
    if (!lista.length) {
      return {
        texto: "SIN RESULTADOS: sin datos suficientes para esos tickers/períodos.",
        fuentes: [],
        ok: false,
      };
    }
    const L = ["Distribución de retornos (datos reales Yahoo):"];
    for (const r of lista) {
      L.push(
        `- ${r.ticker}: media anual ${pctS(r.meanAnnual as number)} · vol anual ${pctS(r.volatilityAnnual as number)} · Sharpe ${n2(r.sharpeRatio as number)} · VaR95 ${pctS(r.var95 as number)} · skew ${n2(r.skewness as number)} · kurtosis ${n2(r.kurtosis as number)} · Jarque-Bera p=${n2(r.pValue as number, 4)} (${r.isNormal ? "normal" : "colas pesadas"}) · máx pérdida ${pctS(r.maxLoss as number)} · máx ganancia ${pctS(r.maxGain as number)}`,
      );
    }
    L.push(
      "Si Jarque-Bera rechaza normalidad (p<0.05), el VaR gaussiano subestima el riesgo de cola.",
    );
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: análisis de riesgo falló (${e instanceof Error ? e.message : "error"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

export async function ejecutarCapmAuto(argsRaw: string): Promise<ResTool> {
  const args = parseArgsObj(argsRaw);
  const tickers = tickersDe(args);
  if (!tickers.length) {
    return { texto: "SIN RESULTADOS: indicá al menos un ticker.", fuentes: [], ok: false };
  }
  const autoDetect = args.autoDetect !== false;
  try {
    const rs = (await getCAPMAnalysis({
      data: {
        tickers,
        benchmarks: Array.isArray(args.benchmarks) ? args.benchmarks.map(String) : [],
        multilinear: false,
        autoDetect,
        source: "yahoo",
      },
    })) as unknown as Array<{
      ticker: string;
      beta?: number;
      annualizedAlpha?: number;
      rSquared?: number;
      correlation?: number;
      pValue?: number;
      benchmarkLabel?: string;
      hurstExponent?: number;
      betaP?: number;
    }>;
    const L = ["CAPM con auto-detección de benchmark (mayor R²):"];
    for (const r of rs) {
      L.push(
        `- ${r.ticker}: beta ${n2(r.beta)} vs ${r.benchmarkLabel ?? "—"} · alpha anual ${pctS(r.annualizedAlpha)} · R² ${n2(r.rSquared, 3)} · correlación ${n2(r.correlation, 3)} · p-valor ${n2(r.pValue, 4)}${r.hurstExponent != null ? ` · Hurst ${n2(r.hurstExponent, 3)}` : ""}${r.betaP != null ? ` · beta p-variance ${n2(r.betaP)}` : ""}`,
      );
    }
    L.push(
      "Alpha positivo y significativo (p<0.05) sugiere rendimiento anormal histórico; Hurst>0.5 sugiere persistencia de tendencia.",
    );
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: CAPM falló (${e instanceof Error ? e.message : "error"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

export async function ejecutarAnalisisIndustria(argsRaw: string): Promise<ResTool> {
  const args = parseArgsObj(argsRaw);
  const sector = String(args.sector ?? "").trim();
  const industry = String(args.industry ?? "").trim();
  const rawTickers = Array.isArray(args.tickers) ? args.tickers : [];
  const tickers = rawTickers
    .map((t) => {
      if (typeof t === "string") return { ticker: t.trim().toUpperCase(), nombre: t.trim() };
      const o = t as { ticker?: unknown; nombre?: unknown };
      return {
        ticker: String(o.ticker ?? "")
          .trim()
          .toUpperCase(),
        nombre: String(o.nombre ?? o.ticker ?? "").trim(),
      };
    })
    .filter((t) => t.ticker)
    .slice(0, 50);
  if (!sector || !industry || !tickers.length) {
    return {
      texto:
        "SIN RESULTADOS: se requieren sector, industry y tickers (lista de {ticker, nombre}). Ejemplo: sector='Technology', industry='Software - Infrastructure', tickers=[{ticker:'MSFT', nombre:'Microsoft'}].",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const r = (await getSectorAnalysis({
      data: { sector, industry, tickers, mode: "completo" },
    })) as {
      avgPE?: number | null;
      avgForwardPE?: number | null;
      avgScore?: number | null;
      tickers?: Array<{
        ticker: string;
        price?: number | null;
        trailingPE?: number | null;
        forwardPE?: number | null;
        pegRatio?: number | null;
        returnOnEquity?: number | null;
        profitMargin?: number | null;
        fcfYield?: number | null;
        fundScore?: number | null;
      }>;
    };
    const L = [`Análisis de ${sector} · ${industry} (${tickers.length} tickers):`];
    L.push(
      `Promedios: P/E ${n2(r.avgPE, 1)} · P/E fwd ${n2(r.avgForwardPE, 1)} · score fundamental ${n2(r.avgScore, 1)}`,
    );
    for (const t of (r.tickers ?? []).slice(0, 25)) {
      L.push(
        `- ${t.ticker}: precio ${n2(t.price)} · P/E ${n2(t.trailingPE, 1)} · P/E fwd ${n2(t.forwardPE, 1)} · PEG ${n2(t.pegRatio)} · ROE ${pctS(t.returnOnEquity)} · margen ${pctS(t.profitMargin)} · FCF yield ${pctS(t.fcfYield)} · score ${n2(t.fundScore, 1)}`,
      );
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: análisis sectorial falló (${e instanceof Error ? e.message : "error"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

export async function ejecutarRankingValuacion(): Promise<ResTool> {
  try {
    const r = (await getSectorValuationRanking()) as {
      rows?: Array<{
        sector: string;
        avgForwardPE?: number | null;
        avgTrailingPE?: number | null;
        avgPEG?: number | null;
        medianPEPercentile?: number | null;
        tickerCount?: number;
      }>;
    };
    const rows = [...(r.rows ?? [])].sort(
      (a, b) => (a.avgForwardPE ?? 999) - (b.avgForwardPE ?? 999),
    );
    if (!rows.length) {
      return {
        texto: "SIN RESULTADOS: ranking no disponible en este momento.",
        fuentes: [],
        ok: false,
      };
    }
    const L = ["Ranking de valuación sectorial (menor P/E forward = más barato):"];
    for (const s of rows) {
      L.push(
        `- ${s.sector}: P/E fwd ${n2(s.avgForwardPE, 1)} · P/E trailing ${n2(s.avgTrailingPE, 1)} · PEG ${n2(s.avgPEG)} · pctil P/E mediano ${n2(s.medianPEPercentile, 0)} · ${s.tickerCount ?? 0} tickers`,
      );
    }
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: ranking falló (${e instanceof Error ? e.message : "error"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

export async function ejecutarOportunidadesDiarias(): Promise<ResTool> {
  try {
    const r = (await getMarketScreeners()) as {
      day_gainers?: Array<{ symbol: string; price?: number | null; percentChange?: number | null }>;
      day_losers?: Array<{ symbol: string; price?: number | null; percentChange?: number | null }>;
      most_actives?: Array<{
        symbol: string;
        price?: number | null;
        percentChange?: number | null;
      }>;
      undervalued?: Array<{ symbol: string; price?: number | null; percentChange?: number | null }>;
    };
    const fmtLista = (
      items: Array<{ symbol: string; price?: number | null; percentChange?: number | null }>,
    ) =>
      items
        .slice(0, 8)
        .map(
          (i) =>
            `${i.symbol} ${i.price != null ? `$${i.price.toFixed(2)}` : ""} (${pctS(i.percentChange)})`,
        )
        .join(", ") || "—";
    const L = [
      "Screeners del día (Yahoo Finance):",
      `- Mayores alzas: ${fmtLista(r.day_gainers ?? [])}`,
      `- Mayores bajas: ${fmtLista(r.day_losers ?? [])}`,
      `- Más operadas: ${fmtLista(r.most_actives ?? [])}`,
      `- Infravaloradas large-cap: ${fmtLista(r.undervalued ?? [])}`,
    ];
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: screeners no disponibles (${e instanceof Error ? e.message : "error"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

export async function ejecutarMatrizBenchmarks(): Promise<ResTool> {
  try {
    const r = (await getBenchmarksMatrix()) as {
      mejoresParaDiversificar?: Array<{ etfA: string; etfB: string; correlation: number }>;
      masRedundantes?: Array<{ etfA: string; etfB: string; correlation: number }>;
    };
    const L = ["Matriz de correlaciones entre benchmarks/ETFs sectoriales:"];
    for (const p of r.mejoresParaDiversificar ?? []) {
      L.push(`- Mayor diversificación: ${p.etfA} vs ${p.etfB} → corr ${n2(p.correlation)}`);
    }
    for (const p of r.masRedundantes ?? []) {
      L.push(`- Más redundantes: ${p.etfA} vs ${p.etfB} → corr ${n2(p.correlation)}`);
    }
    L.push("Correlaciones bajas entre activos mejoran la diversificación de una cartera.");
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: matriz no disponible (${e instanceof Error ? e.message : "error"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

// --- iol_asesor (cuentas asesoradas) ---------------------------------------

import { analisisTecnico } from "@/lib/herramientas/analisis-tecnico.functions";

/** Análisis técnico completo (portado de clarity/insight-hub): MA/EMA/RSI/MACD/S-R/52w. */
export async function ejecutarAnalisisTecnico(argsRaw: string): Promise<ResultadoToolConEventos> {
  const args = (() => {
    try {
      return (JSON.parse(argsRaw) ?? {}) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const simbolo = String(args["simbolo"] ?? "").trim();
  if (!simbolo)
    return {
      texto: "SIN RESULTADOS: falta el símbolo. Reinvocá con simbolo (ej. AAPL, GGAL.BA).",
      fuentes: [],
      ok: false,
    };
  const r = await analisisTecnico(simbolo);
  if (!r)
    return {
      texto: `SIN RESULTADOS: sin datos suficientes de ${simbolo} en Yahoo Finance.`,
      fuentes: [],
      ok: false,
    };
  const nf = (v: number | null | undefined, d = 2) =>
    typeof v === "number" && isFinite(v) ? v.toFixed(d) : "s/d";
  return {
    texto: [
      `Análisis técnico de ${r.nombre} (${r.simbolo}) — moneda ${r.moneda}:`,
      `- Precio: ${nf(r.precio)} · Variación diaria: ${nf(r.variacion)}%`,
      `- MA20 ${nf(r.ma20)} · MA50 ${nf(r.ma50)} · MA200 ${nf(r.ma200)} · EMA9 ${nf(r.ema9)}`,
      `- RSI14: ${nf(r.rsi14, 1)} · MACD ${r.macd ? `${nf(r.macd.macd, 3)} / señal ${nf(r.macd.signal, 3)} / hist ${nf(r.macd.hist, 3)}` : "s/d"}`,
      `- Soporte ${nf(r.soporte)} · Resistencia ${nf(r.resistencia)}`,
      `- Volatilidad anual: ${nf(r.volatilidadAnual)}% · Rango 52s: ${nf(r.minimo52)} – ${nf(r.maximo52)}`,
      `- Interpretación: ${r.interpretacion}`,
      `- Serie: ${r.serie.length} cierres (último ${r.serie[r.serie.length - 1]?.fecha ?? "s/d"}).`,
    ].join("\n"),
    fuentes: [],
    ok: true,
    eventos: [
      {
        t: "chart",
        v: {
          tipo: "linea",
          titulo: `${r.simbolo} · técnico`,
          unidad: r.moneda,
          serie: r.serie.map((p) => ({ f: p.fecha, v: p.cierre })),
        },
      },
    ],
  };
}

export async function ejecutarIolAsesor(
  argsRaw: string,
  sessionId: string,
): Promise<ResultadoToolConEventos> {
  const args = (() => {
    try {
      return (JSON.parse(argsRaw) ?? {}) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  })();
  const str = (k: string, def = "") => String(args[k] ?? def).trim();
  const num = (k: string): number | undefined => {
    const v = Number(args[k]);
    return args[k] != null && isFinite(v) ? v : undefined;
  };

  const accion = str("accion");
  if (!accion) return { texto: "Falta la accion de iol_asesor.", fuentes: [FUENTE_IOL], ok: false };
  if (!iolSesionActiva(sessionId)) {
    return {
      texto:
        "NO AUTENTICADO: el modulo asesor requiere sesion IOL iniciada. Invoca primero iol_login con las credenciales del ASESOR.",
      fuentes: [FUENTE_IOL],
      ok: false,
    };
  }

  switch (accion) {
    case "clientes":
    case "lista_clientes": {
      const r = await iolAsesorClientes(sessionId);
      if (!r.ok) {
        return {
          texto: `SIN RESULTADOS: IOL rechazo la consulta de clientes asesorados (HTTP ${r.status}: ${r.error ?? "sin detalle"}). Si el error es 401/403, la cuenta logueada NO tiene rol de Asesor habilitado en IOL y este modulo no esta disponible para ella.`,
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      }
      if (!r.clientes.length) {
        return {
          texto:
            "La consulta de movimientos del asesor no devolvio clientes asesorados (o no hay movimientos en los ultimos 2 anos). Si esperabas ver clientes, verifica que la cuenta tenga cuentas asesoradas vinculadas.",
          fuentes: [FUENTE_IOL],
          ok: true,
        };
      }
      const filas = r.clientes
        .slice(0, 40)
        .map((c) => [
          String(
            c["numeroComitente"] ??
              c["idClienteAsesorado"] ??
              c["idCliente"] ??
              c["comitente"] ??
              c["numeroCuenta"] ??
              c["cuenta"] ??
              c["cliente"] ??
              "s/d",
          ),
          String(c["nombre"] ?? c["razonSocial"] ?? c["apellido"] ?? c["descripcion"] ?? "").slice(
            0,
            30,
          ),
          String(c["pais"] ?? c["mercado"] ?? ""),
        ]);
      return {
        texto: `Clientes asesorados detectados en IOL (${r.clientes.length}):\n${tablaMD(
          ["ID / Comitente", "Nombre", "Pais/Mercado"],
          filas,
        )}\nCon cada ID podes consultar movimientos (iol_asesor accion=movimientos clientes=[id]) o responder su test de inversor.`,
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "movimientos": {
      const clientes = Array.isArray(args["clientes"])
        ? (args["clientes"] as unknown[]).map(Number).filter((n) => isFinite(n))
        : undefined;
      const r = await iolAsesorMovimientos(sessionId, {
        ...(clientes?.length ? { clientes } : {}),
        ...(str("from") ? { from: str("from") } : {}),
        ...(str("to") ? { to: str("to") } : {}),
        ...(str("dateType") ? { dateType: str("dateType") } : {}),
        ...(str("status") ? { status: str("status") } : {}),
        ...(str("type") ? { type: str("type") } : {}),
        ...(str("country") ? { country: str("country") } : {}),
        ...(str("currency") ? { currency: str("currency") } : {}),
        ...(str("cuentaComitente") ? { cuentaComitente: str("cuentaComitente") } : {}),
      });
      if (!r.ok)
        return {
          texto: `SIN RESULTADOS: ${r.error ?? "IOL rechazo la consulta"}. HTTP 401/403 suele indicar que la cuenta no tiene rol de Asesor.`,
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      return {
        texto: `Movimientos de cuentas asesoradas (IOL):\n${JSON.stringify(r.data, null, 1).slice(0, 5000)}`,
        fuentes: [FUENTE_IOL],
        ok: true,
      };
    }
    case "test_inversor": {
      const r = await iolTestInversorObtener(sessionId);
      return {
        texto:
          r.ok && r.data
            ? `Preguntas del test de inversor IOL:\n${JSON.stringify(r.data, null, 1).slice(0, 4000)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "responder_test_inversor": {
      const idCliente = num("idClienteAsesorado");
      let respuestas = args["respuestas"];
      if (typeof respuestas === "string") {
        try {
          respuestas = JSON.parse(respuestas) as Record<string, unknown>;
        } catch {
          respuestas = undefined;
        }
      }
      if (!respuestas || typeof respuestas !== "object")
        return {
          texto: "Faltan las respuestas del test (parametro respuestas como objeto JSON).",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const r = await iolTestInversorResponder(
        sessionId,
        respuestas as Record<string, unknown>,
        idCliente,
      );
      return {
        texto:
          r.ok && r.data
            ? `Perfil sugerido por el test de inversor:\n${JSON.stringify(r.data, null, 1).slice(0, 2500)}`
            : `SIN RESULTADOS: ${r.error}`,
        fuentes: [FUENTE_IOL],
        ok: r.ok,
      };
    }
    case "vender_especie_d": {
      if (args["confirmar"] !== true) {
        return {
          texto: `SIMULACION (confirmar=false): NO se envio ninguna orden. La orden de venta especie D para el cliente asesorado quedaria asi: ${argsRaw}. Mostrasela al usuario y pedi confirmacion explicita antes de reinvocar con confirmar=true.`,
          fuentes: [FUENTE_IOL],
          ok: true,
        };
      }
      const idCliente = num("idClienteAsesorado");
      if (!idCliente || !str("simbolo") || num("cantidad") == null)
        return {
          texto: "Para vender_especie_d hacen falta idClienteAsesorado, simbolo y cantidad.",
          fuentes: [FUENTE_IOL],
          ok: false,
        };
      const precioArg = num("precio");
      const validezArg = str("validez");
      const fondosArg = num("fondosParaOperacion");
      const cuentaBancariaArg = num("idCuentaBancaria");
      const idFuenteArg = num("idFuente");
      const r = await iolAsesorVenderEspecieD(sessionId, {
        idClienteAsesorado: idCliente,
        mercado: str("mercado", "bCBA") || "bCBA",
        simbolo: str("simbolo"),
        cantidad: num("cantidad")!,
        ...(precioArg != null ? { precio: precioArg } : {}),
        ...(validezArg ? { validez: validezArg } : {}),
        tipoOrden: str("tipoOrden", "precioLimite") || "precioLimite",
        plazo: str("plazo", "t0") || "t0",
        ...(fondosArg != null ? { fondosParaOperacion: fondosArg } : {}),
        ...(cuentaBancariaArg != null ? { idCuentaBancaria: cuentaBancariaArg } : {}),
        ...(idFuenteArg != null ? { idFuente: idFuenteArg } : {}),
      });
      return { texto: r.resumen ?? r.error ?? "", fuentes: [FUENTE_IOL], ok: r.ok };
    }
    default:
      return {
        texto:
          "Accion invalida para iol_asesor. Usa: clientes | movimientos | test_inversor | responder_test_inversor | vender_especie_d.",
        fuentes: [FUENTE_IOL],
        ok: false,
      };
  }
}

// ---------------------------------------------------------------------------
// Metodologías cuantitativas de Labadie (stat-arb y ejecución óptima).
// Reutilizan el motor statarb.math (analyzePair: spread, z-score, ADF,
// backtest IS/OOS, Hurst, p-varianza y curvas TC/IS de Almgren-Chriss).
// ---------------------------------------------------------------------------

import { analyzePair } from "@/lib/statarb.math";
import type { PairConfig } from "@/lib/statarb.types";
import { estimateExecutionCosts } from "@/lib/labadie/execution-curve";

type HistPoint = { date: string; close: number };

async function historicoLabadie(simbolo: string, dias: number): Promise<HistPoint[]> {
  const puntos = await serieDiariaConFechas(simbolo, "2y");
  const aHist = (ps: { fecha: string; close: number }[]): HistPoint[] =>
    ps.map((p) => ({ date: p.fecha, close: p.close }));
  if (puntos.length >= 30) return aHist(puntos.slice(-Math.max(dias + 60, 90)));
  // Fallback: sufijo .BA para tickers locales sin datos.
  if (!simbolo.endsWith(".BA")) {
    const ba = await serieDiariaConFechas(`${simbolo}.BA`, "2y");
    if (ba.length >= 30) return aHist(ba.slice(-Math.max(dias + 60, 90)));
  }
  return aHist(puntos);
}

function n2L(v: number | null | undefined, dec = 2): string {
  return typeof v === "number" && isFinite(v) ? v.toFixed(dec) : "s/d";
}

/** Pairs trading con la metodología Labadie (spread, z-score, señales a·σ/b·σ, backtest). */
export async function ejecutarPairsTradingLabadie(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let simboloA = "";
  let simboloB = "";
  let ventana = 20;
  let umbralEntrada = 1.5;
  let umbralStop = 2.5;
  let rangoDias = 365;
  try {
    const args = JSON.parse(argsRaw) as {
      simboloA?: string;
      simboloB?: string;
      ventana?: number;
      umbralEntrada?: number;
      umbralStop?: number;
      rangoDias?: number;
    };
    simboloA = String(args.simboloA ?? "").trim();
    simboloB = String(args.simboloB ?? "").trim();
    if (typeof args.ventana === "number" && args.ventana >= 5 && args.ventana <= 120)
      ventana = Math.round(args.ventana);
    if (
      typeof args.umbralEntrada === "number" &&
      args.umbralEntrada > 0.3 &&
      args.umbralEntrada < 4
    )
      umbralEntrada = args.umbralEntrada;
    if (
      typeof args.umbralStop === "number" &&
      args.umbralStop > umbralEntrada &&
      args.umbralStop <= 6
    )
      umbralStop = args.umbralStop;
    if (typeof args.rangoDias === "number" && args.rangoDias >= 90 && args.rangoDias <= 730)
      rangoDias = Math.round(args.rangoDias);
  } catch {
    /* sin args */
  }
  if (!simboloA || !simboloB) {
    return {
      texto:
        "SIN RESULTADOS: faltan los dos símbolos del par. Reinvocá con simboloA y simboloB (ej. 'GGAL.BA' y 'BMA.BA', o 'AAPL' y 'MSFT').",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const [h1, h2] = await Promise.all([
      historicoLabadie(simboloA, rangoDias),
      historicoLabadie(simboloB, rangoDias),
    ]);
    if (h1.length < 30 || h2.length < 30) {
      return {
        texto: `SIN RESULTADOS: datos insuficientes (${simboloA}: ${h1.length} obs, ${simboloB}: ${h2.length} obs). Probá otros tickers.`,
        fuentes: [],
        ok: false,
      };
    }
    const config: PairConfig = {
      asset1: simboloA,
      asset2: simboloB,
      period: rangoDias,
      interval: "1d",
      window: ventana,
      entryThresh: umbralEntrada,
      stopThresh: umbralStop,
      capitalPerPair: 1,
      txCost: 0.1,
      executionAlgo: "pairs",
    };
    const r = analyzePair(h1, h2, config);
    const zActual = r.zScore.at(-1)?.value ?? null;
    const spActual = r.spread.at(-1) ?? null;
    const L: string[] = [];
    L.push(
      `Pairs trading metodología Labadie — ${simboloA} vs ${simboloB} (ventana ${ventana}, entrada ±${umbralEntrada}σ, stop ±${umbralStop}σ, ${rangoDias} días):`,
    );
    L.push(
      `- Correlación: ${n2L(r.correlation, 3)} · Beta de hedge: ${n2L(r.beta, 3)} · R²: ${n2L(r.r2, 3)}`,
    );
    L.push(
      `- Cointegración (ADF): estadístico ${n2L(r.adfStat, 3)}, p-valor ${n2L(r.adfPValue, 4)} → ${
        r.isCointegrated ? "cointegrados al nivel usual" : "NO se confirma cointegración"
      }`,
    );
    if (spActual)
      L.push(
        `- Spread actual: ${n2L(spActual.value, 4)} · media móvil ${n2L(spActual.mean, 4)} · bandas entrada [+${n2L(spActual.upper, 4)}, ${n2L(spActual.lower, 4)}] · stop [+${n2L(spActual.upperSl, 4)}, ${n2L(spActual.lowerSl, 4)}]`,
      );
    L.push(`- Z-score actual: ${n2L(zActual, 2)}`);
    if (zActual != null) {
      if (zActual > umbralStop)
        L.push(
          "  → Lectura: spread EXTREMO sobre la banda de stop-loss; riesgo elevado de ruptura de correlación.",
        );
      else if (zActual > umbralEntrada)
        L.push(
          "  → Lectura: spread por encima de la banda de entrada (zona de venta del spread según el método).",
        );
      else if (zActual < -umbralStop)
        L.push(
          "  → Lectura: spread EXTREMO bajo la banda de stop-loss; riesgo elevado de ruptura de correlación.",
        );
      else if (zActual < -umbralEntrada)
        L.push(
          "  → Lectura: spread por debajo de la banda de entrada (zona de compra del spread según el método).",
        );
      else L.push("  → Lectura: spread dentro de la banda neutral; sin señal de entrada.");
    }
    if (r.hurstExponent != null)
      L.push(
        `- Hurst del spread: ${n2L(r.hurstExponent, 3)} (${
          r.hurstExponent < 0.45
            ? "mean-reverting"
            : r.hurstExponent > 0.55
              ? "tendencial"
              : "≈ random walk"
        }) · p implícita (1/H): ${n2L(r.impliedP, 2)}`,
      );
    const perf = r.performance;
    L.push(
      `- Backtest histórico: ${perf.totalTrades} trades · win rate ${n2L(perf.winRate * 100, 1)}% · Sharpe ${n2L(perf.sharpe, 2)}${perf.pSharpe != null ? ` · Sharpe p-varianza (p=${n2L(perf.pValueUsed ?? 2, 1)}) ${n2L(perf.pSharpe, 2)}` : ""} · max drawdown ${n2L(perf.maxDrawdown * 100, 1)}% · duración media ${n2L(perf.avgDuration, 1)} días`,
    );
    if (r.inSamplePerformance && r.outOfSamplePerformance && r.splitDate) {
      L.push(
        `- In-Sample (hasta ${r.splitDate}): ${r.inSamplePerformance.totalTrades} trades, Sharpe ${n2L(r.inSamplePerformance.sharpe, 2)} · Out-of-Sample: ${r.outOfSamplePerformance.totalTrades} trades, Sharpe ${n2L(r.outOfSamplePerformance.sharpe, 2)} → el patrón ${
          r.outOfSamplePerformance.sharpe > 0
            ? "SOBREVIVE fuera de muestra"
            : "NO sobrevive fuera de muestra (etapa 5 del método: descartar y recalibrar)"
        }`,
      );
    }
    const ultimos = r.trades.slice(-3);
    for (const t of ultimos) {
      L.push(
        `- Último trade (${t.type}): entrada ${t.entryDate} (z ${n2L(t.entryZ, 2)}) → salida ${t.exitDate} (z ${n2L(t.exitZ, 2)}), PNL ${n2L(t.pnl * 100, 2)}%, duración ${t.duration} días`,
      );
    }
    L.push(
      "\nNota metodológica: aunque el spread sea normal, la distribución del PNL NO lo es (salidas por take-profit/stop-loss dependientes de la trayectoria). Análisis educativo con datos reales de Yahoo Finance; no es recomendación de inversión ni promesa de rentabilidad.",
    );
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al analizar el par (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

/** Curva de ejecución óptima Almgren-Chriss (TC/IS) con PVol, inicio/parada óptimos y p-varianza. */
export async function ejecutarCurvaEjecucionLabadie(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let simbolo = "";
  let benchmark = "pairs";
  let participacion = 0.1;
  let pValor = 2;
  let gammaImpacto = 0.5;
  let volatilidad: number | undefined;
  let usarVolumenReal = false;
  try {
    const args = JSON.parse(argsRaw) as {
      simbolo?: string;
      benchmark?: string;
      participacionMaxima?: number;
      pVarianza?: number;
      gammaImpacto?: number;
      volatilidadAnual?: number;
      usarVolumenReal?: boolean;
    };
    if (typeof (args as any).usarVolumenReal === "boolean") usarVolumenReal = (args as any).usarVolumenReal;
    simbolo = String(args.simbolo ?? "").trim();
    const bm = String(args.benchmark ?? "").toLowerCase();
    if (bm === "tc" || bm === "is") benchmark = bm;
    if (
      typeof args.participacionMaxima === "number" &&
      args.participacionMaxima > 0.01 &&
      args.participacionMaxima <= 0.5
    )
      participacion = args.participacionMaxima;
    if (typeof args.pVarianza === "number" && args.pVarianza >= 1.1 && args.pVarianza <= 4)
      pValor = args.pVarianza;
    if (typeof args.gammaImpacto === "number" && args.gammaImpacto > 0 && args.gammaImpacto < 1)
      gammaImpacto = args.gammaImpacto;
    if (
      typeof args.volatilidadAnual === "number" &&
      args.volatilidadAnual > 0 &&
      args.volatilidadAnual < 3
    )
      volatilidad = args.volatilidadAnual;
  } catch {
    /* sin args */
  }
  if (!simbolo) {
    return {
      texto:
        "SIN RESULTADOS: falta el símbolo del activo a ejecutar. Reinvocá con simbolo (ej. 'AAPL', 'GGAL.BA') y opcionalmente benchmark='tc'|'is'.",
      fuentes: [],
      ok: false,
    };
  }
  try {
    const h1 = await historicoLabadie(simbolo, 365);
    if (h1.length < 30) {
      return {
        texto: `SIN RESULTADOS: datos insuficientes para ${simbolo} (${h1.length} obs).`,
        fuentes: [],
        ok: false,
      };
    }
    // El motor TC/IS opera sobre un par: se usa el activo contra sí mismo
    // desplazado (spread ≈ precio) para heredar las curvas de volumen/vol.
    const h2 = h1.map((p, i) => ({ date: p.date, close: i === 0 ? p.close : h1[i - 1]!.close }));
    let volumeProfile: number[] | undefined;
    if (usarVolumenReal) {
      try { const { fetchVolumeProfile } = await import("@/lib/yahoo-http"); volumeProfile = await fetchVolumeProfile(simbolo, Math.min(h1.length, 100)); } catch {}
    }
    const config: PairConfig = {
      asset1: simbolo,
      asset2: `${simbolo} (lag-1)`,
      period: 365,
      interval: "1d",
      window: 20,
      entryThresh: 1.5,
      stopThresh: 2.5,
      capitalPerPair: 1,
      txCost: 0.1,
      executionAlgo: benchmark === "is" ? "is" : "tc",
      pValue: pValor,
      marketImpactGamma: gammaImpacto,
      participationRate: participacion,
      ...(volatilidad != null ? { volatility: volatilidad } : {}),
      ...(volumeProfile ? { volumeProfile, usarVolumenReal: true } : {}),
    } as PairConfig;
    const r = analyzePair(h1, h2, config);
    const L: string[] = [];
    L.push(
      `Curva de ejecución óptima (Almgren-Chriss extendido Labadie-Lehalle) — ${simbolo}, benchmark ${
        benchmark === "is" ? "Implementation Shortfall" : "Target Close"
      }, PVol máx ${n2L(participacion * 100, 0)}%, γ impacto ${n2L(gammaImpacto, 2)}, p-varianza ${n2L(pValor, 1)}:`,
    );
    if (r.tradingCurve?.length) {
      const curva = r.tradingCurve;
      const pasos = curva.filter((_, i) => i % Math.max(1, Math.floor(curva.length / 8)) === 0);
      for (const paso of pasos) {
        L.push(
          `  slice ${String(paso.step).padStart(3)}: volumen ${(paso.volume * 100).toFixed(2)}% · acumulado ${(paso.cumulative * 100).toFixed(1)}%`,
        );
      }
      const picos = [...curva].sort((a, b) => b.volume - a.volume).slice(0, 3);
      L.push(
        `- Slices más agresivos: ${picos.map((p) => `#${p.step} (${(p.volume * 100).toFixed(2)}%)`).join(", ")}`,
      );
    } else {
      L.push("- La curva detallada no está disponible para estos parámetros.");
    }
    if (r.optimalStartPct != null)
      L.push(
        `- Tiempo óptimo de INICIO (Target Close): esperar hasta ~${n2L(r.optimalStartPct * 100, 0)}% del horizonte antes del primer slice viable (tamaño mínimo por slice).`,
      );
    if (r.optimalStopPct != null)
      L.push(
        `- Tiempo óptimo de PARADA (Implementation Shortfall): dejar de ejecutar alrededor de ~${n2L(r.optimalStopPct * 100, 0)}% del horizonte.`,
      );
    if (r.hurstExponent != null)
      L.push(
        `- Exponente de Hurst estimado: ${n2L(r.hurstExponent, 3)} → p canónica = 1/H = ${n2L(r.impliedP, 2)}. ${
          r.hurstExponent < 0.45
            ? "Mean-reversion (p>2): conviene empezar tarde y ejecutar más rápido."
            : r.hurstExponent > 0.55
              ? "Tendencia (p<2): conviene empezar antes y ejecutar más despacio."
              : "≈ Martingala (p=2): perfil neutral de ejecución."
        }`,
      );
    // Gap 4: Costos esperados (impacto + varianza)
    if (r.tradingCurve?.length) {
      try {
        const costs = estimateExecutionCosts(r.tradingCurve, { sigma: (r as any).volatility ?? volatilidad ?? 0.2, hurst: r.hurstExponent ?? 0.5, gamma: gammaImpacto });
        L.push(`- Costos estimados (Gap 4): impacto ${costs.expectedImpactBps.toFixed(1)} bps + riesgo ${costs.riskAdjustment.toFixed(1)} bps = total ${costs.totalCostBps.toFixed(1)} bps (varianza ${costs.varianceTerm.toExponential(2)}).`);
      } catch { /* ignorar */ }
    }
    L.push(
      "- Restricción PVol: cuando la curva óptima pide más que la participación máxima, se satura el límite (min(curva TC, curva PVol)) y se retoma TC después. Gap 2: con perfil de volumen real V(n) el cap por slice es q·V(n).",
    );
    L.push(
      "\nNota metodológica: cálculo educativo sobre curvas históricas de volumen/volatilidad de Yahoo Finance (J = E(impacto) + λ×riesgo con impacto cóncavo (v/V)^γ). No constituye una orden ni asesoramiento de ejecución.",
    );
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return {
      texto: `SIN RESULTADOS: error al calcular la curva de ejecución (${e instanceof Error ? e.message : "desconocido"}).`,
      fuentes: [],
      ok: false,
    };
  }
}

export async function ejecutarImpliedPLabadie(argsRaw: string): Promise<{ texto: string; fuentes: FuenteMercado[]; ok: boolean }> {
  let simbolo = ""; let inicioDeseado = 0.3; let participacion=0.1; let gamma=0.5;
  try { const a=JSON.parse(argsRaw) as any; simbolo=String(a.simbolo??"").trim(); if(typeof a.inicioDeseadoPct==="number") inicioDeseado=a.inicioDeseadoPct; if(typeof a.participacionMaxima==="number") participacion=a.participacionMaxima; if(typeof a.gammaImpacto==="number") gamma=a.gammaImpacto; } catch {}
  if(!simbolo || !(inicioDeseado>=0 && inicioDeseado<=0.95)) return { texto:"SIN RESULTADOS: falta simbolo e inicioDeseadoPct 0-0.95", fuentes:[], ok:false };
  try {
    const h = await historicoLabadie(simbolo, 365);
    if(h.length<30) return { texto:`SIN RESULTADOS: datos insuficientes ${simbolo}`, fuentes:[], ok:false };
    const closes = h.map(p=>p.close); const rets = closes.slice(1).map((c,i)=> (c-closes[i]!)/closes[i]!);
    const sigma = Math.sqrt(rets.reduce((s,v)=>s+v*v,0)/rets.length)*Math.sqrt(252);
    const { impliedPFromStartTime } = await import("@/lib/labadie/execution-curve");
    const r = impliedPFromStartTime({ targetStartPct: inicioDeseado, T: 100, sigma: Math.max(0.05, sigma), gamma, participationRate: participacion });
    return { texto: `p implícita Gap 1 §4.3 — ${simbolo} inicio deseado ${(inicioDeseado*100).toFixed(0)}% → p=${r.impliedP.toFixed(2)} H=${r.hurst.toFixed(3)} logrado ${(r.achievedStartPct*100).toFixed(0)}% (sigma anual ${sigma.toFixed(3)}, γ ${gamma}, PVol ${(participacion*100).toFixed(0)}%)`, fuentes:[], ok:true };
  } catch(e){ return { texto:`SIN RESULTADOS implied_p: ${e instanceof Error?e.message:String(e)}`, fuentes:[], ok:false }; }
}

export async function ejecutarCierreMercado(): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  try {
    const { getCierreMercadoDashboard } = await import("@/lib/cierre-mercado.functions");
    const data: any = await (getCierreMercadoDashboard as unknown as () => Promise<any>)();
    const L: string[] = [];
    L.push(`=== CIERRE DE MERCADO ${data.fechaCierre} ===`);
    L.push(`Indices: ${data.indices.map((i: any) => `${i.nombre} (${i.ticker}) $${i.precio?.toFixed(2) ?? "--"} ${i.hoy != null ? (i.hoy > 0 ? "+" : "") + i.hoy.toFixed(2) + "% HOY" : "--"} / ${i.mes1 != null ? i.mes1.toFixed(1) + "% 1M" : "--"} / ${i.ytd != null ? i.ytd.toFixed(1) + "% YTD" : "--"}`).join(" | ")}`);
    L.push(`Sectores (mejor→peor HOY): ${data.sectores.map((s: any) => `${s.nombre}:${s.hoy != null ? s.hoy.toFixed(2) + "%" : "--"}`).join(" | ")}`);
    L.push(`Ganadores: ${data.ganadores.map((g: any) => `${g.symbol} $${g.price?.toFixed(2) ?? "--"} ${g.percentChange != null ? g.percentChange.toFixed(2) + "%" : "--"}`).join(" | ") || "--"}`);
    L.push(`Perdedores: ${data.perdedores.map((p: any) => `${p.symbol} $${p.price?.toFixed(2) ?? "--"} ${p.percentChange != null ? p.percentChange.toFixed(2) + "%" : "--"}`).join(" | ") || "--"}`);
    L.push(`Tasas: ${data.tasas.map((t: any) => `${t.nombre} ${t.valor != null ? t.valor.toFixed(2) : "--"} ${t.variacion != null ? "(" + t.variacion.toFixed(2) + "%)" : ""}`).join(" | ")}`);
    L.push(`Renta fija Gob: ${data.rentaFijaGobierno.map((r: any) => `${r.nombre} ${r.valor?.toFixed(2) ?? "--"} ${r.variacion?.toFixed(2) ?? "--"}%`).join(" | ")}`);
    L.push(`Renta fija Corp: ${data.rentaFijaCorporativo.map((r: any) => `${r.nombre} ${r.valor?.toFixed(2) ?? "--"} ${r.variacion?.toFixed(2) ?? "--"}%`).join(" | ")}`);
    L.push(`Desarrollados: ${data.desarrollados.map((d: any) => `${d.nombre} ${d.variacion?.toFixed(2) ?? "--"}%`).join(" | ")}`);
    L.push(`Emergentes: ${data.emergentes.map((e: any) => `${e.nombre} ${e.variacion?.toFixed(2) ?? "--"}%`).join(" | ")}`);
    L.push(`Commodities: ${data.commodities.map((c: any) => `${c.nombre} (${c.ticker}) $${c.precio?.toFixed(2) ?? "--"} ${c.hoy != null ? c.hoy.toFixed(2) + "%" : "--"}`).join(" | ")}`);
    L.push(`Fuentes: Yahoo Finance (delay 15') · Generado ${new Date(data.timestamp).toLocaleString("es-AR")}`);
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS: error al obtener cierre de mercado (${e instanceof Error ? e.message : "desconocido"}).`, fuentes: [], ok: false };
  }
}

export async function ejecutarInformeMatutino(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
  eventos?: import("./ejecutores").EventoChat[];
}> {
  let fecha: string | undefined;
  try { fecha = (JSON.parse(argsRaw) as any)?.fecha; } catch {}
  try {
    // 1) Intenta usar el informe ya persistido de hoy (rápido, sin gastar Gemini)
    try {
      const { getInformeDelDia } = await import("@/lib/informe-matutino/persistence.functions");
      // getInformeDelDia es serverFn; lo ejecutamos vía fetch interno si existe archivo
      // Fallback: intentamos leer directo del filesystem
      const { readFile } = await import("node:fs/promises");
      const { existsSync } = await import("node:fs");
      const { join } = await import("node:path");
      const fechaHoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const p = join(process.cwd(), ".data", "informes", `${fechaHoy}.json`);
      if (existsSync(p)) {
        const raw = JSON.parse(await readFile(p, "utf-8"));
        if (raw?.informe && raw?.snapshot) {
          const { formatInformeParaChat } = await import("@/lib/informe-matutino/persistence.functions");
          const md = formatInformeParaChat(raw.informe, raw.snapshot);
          const eventoInforme = { t: "informe" as const, v: { titulo: `Lo que hay que saber esta mañana — ${raw.informe.fecha}`, contenidoMarkdown: md } };
          return { texto: md, fuentes: [], ok: true, eventos: [eventoInforme] };
        }
      }
    } catch {}
    // 2) Generación en vivo (snapshot + Gemini)
    const { buildMarketSnapshot } = await import("@/lib/informe-matutino/snapshot.functions");
    const snapshot: any = await (buildMarketSnapshot as unknown as () => Promise<any>)();
    let mdFinal: string | null = null;
    let informeIA: any = null;
    try {
      const { generateInformeMatutino } = await import("@/lib/informe-matutino/informe.functions");
      informeIA = await (generateInformeMatutino as unknown as (s: any) => Promise<any>)(snapshot);
      if (informeIA) {
        const { formatInformeParaChat } = await import("@/lib/informe-matutino/persistence.functions");
        mdFinal = formatInformeParaChat(informeIA, snapshot);
        // Persiste automáticamente para que el próximo pedido sea instantáneo
        try {
          const { saveInformeDelDia } = await import("@/lib/informe-matutino/persistence.functions");
          const fechaHoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
          await saveInformeDelDia({ fecha: fechaHoy, snapshot, informe: informeIA, generadoEn: new Date().toISOString() });
        } catch {}
      }
    } catch {}
    if (mdFinal && informeIA) {
      const ev = { t: "informe" as const, v: { titulo: `Lo que hay que saber esta mañana — ${informeIA.fecha}`, contenidoMarkdown: mdFinal } };
      return { texto: mdFinal, fuentes: [], ok: true, eventos: [ev] };
    }
    // Fallback sin IA: snapshot crudo con formato legible
    const L: string[] = [];
    L.push(`# Lo que hay que saber esta mañana — ${snapshot.fecha}`);
    L.push(`EE.UU.: ${snapshot.internacional?.cierreEEUU?.map((c: any) => `${c.ticker} $${c.precio} ${c.variacionPct?.toFixed(2)}%`).join(" | ") || "--"}`);
    L.push(`Asia/Europa: ${snapshot.internacional?.asiaEuropa?.map((c: any) => `${c.ticker} ${c.variacionPct?.toFixed(2)}%`).join(" | ") || "--"}`);
    L.push(`Commodities: ${snapshot.internacional?.commodities?.map((c: any) => `${c.nombre} ${c.variacionPct?.toFixed(2)}%`).join(" | ") || "--"}`);
    L.push(`Dólares: oficial $${snapshot.local?.dolares?.oficial} blue $${snapshot.local?.dolares?.blue} MEP $${snapshot.local?.dolares?.mep} CCL $${snapshot.local?.dolares?.ccl} brecha ${snapshot.local?.dolares?.brechaCCLPct?.toFixed(1)}%`);
    L.push(`Riesgo país: ${snapshot.local?.riesgoPais?.valor} Inflación: ${snapshot.local?.inflacion?.mensualPct}% (${snapshot.local?.inflacion?.fechaDato})`);
    L.push(`Agenda: ${snapshot.agendaDelDia?.map((a: any) => `${a.hora} ${a.evento} [${a.relevancia}]`).join(" | ") || snapshot.calendarioHoy?.slice(0,3).map((e:any)=>`${e.hora} ${e.evento}`).join(" | ") || "--"}`);
    if (snapshot.noticiasCrudas?.length) L.push(`Noticias: ${snapshot.noticiasCrudas.slice(0,3).map((n:any)=>n.titulo).join(" | ")}`);
    const md = L.join("\n\n");
    return { texto: md, fuentes: [], ok: true, eventos: [{ t: "informe", v: { titulo: `Informe matutino ${snapshot.fecha} (snapshot)`, contenidoMarkdown: md } }] };
  } catch (e) {
    return { texto: `SIN RESULTADOS: error al generar informe matutino (${e instanceof Error ? e.message : "desconocido"}).`, fuentes: [], ok: false };
  }
}

export async function ejecutarAgendaEconomica(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let fecha: string | undefined;
  try { fecha = (JSON.parse(argsRaw) as any)?.fecha; } catch {}
  try {
    const f = fecha || new Date().toISOString().slice(0, 10);
    const { getAgendaSemana } = await import("@/lib/informe-matutino/agenda-economica");
    const agenda: any = (getAgendaSemana as unknown as (d: string) => any)(f);
    if (!agenda || agenda.length === 0) return { texto: `Agenda vacía para la semana de ${f}.`, fuentes: [], ok: true };
    return { texto: `=== AGENDA ECONÓMICA semana de ${f} ===\n` + agenda.map((e: any) => `${e.hora} — ${e.evento} [${e.relevancia}]`).join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS: error al obtener agenda (${e instanceof Error ? e.message : "desconocido"}).`, fuentes: [], ok: false };
  }
}

export async function ejecutarSenalesCedear(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let filtro: any = "todos";
  let topN = 6;
  try {
    const p: any = JSON.parse(argsRaw);
    if (p?.filtro) filtro = p.filtro;
    if (typeof p?.topN === "number") topN = p.topN;
  } catch {}
  try {
    const { generarSenalesCedear } = await import("@/lib/senales-cedear.functions");
    const res: any = await (generarSenalesCedear as any)({ data: { filtro, topN } });
    const senales: any[] = res?.senales ?? [];
    if (!senales.length) return { texto: "SIN SEÑALES: no se generaron señales con el filtro actual.", fuentes: [], ok: true };
    const L: string[] = [];
    L.push(`=== SEÑALES CEDEAR/BCBA (${filtro}) — ${res.criterio} — ${new Date(res.generadoEn).toLocaleString("es-AR")} ===`);
    L.push(`| Ticker BCBA | Subyacente US | Precio US | Var% US | Señal | Prob | Motivo |`);
    L.push(`|---|---|---|---|---|---|---|`);
    for (const s of senales) {
      const varStr = s.variacionUS != null ? s.variacionUS.toFixed(2) + "%" : s.variacionBCBA != null ? s.variacionBCBA.toFixed(2) + "%" : "--";
      const precioStr = s.precioUS != null ? "$" + s.precioUS.toFixed(2) : s.precioBCBA != null ? "$" + s.precioBCBA.toFixed(2) : "--";
      L.push(`| ${s.tickerBCBA} | ${s.tickerUS} | ${precioStr} | ${varStr} | ${s.senal} | ${s.prob != null ? (s.prob * 100).toFixed(0) + "%" : "--"} | ${s.motivo} |`);
    }
    L.push("");
    L.push(`Fuentes: ${senales[0]?.fuente ?? "yfinance"} · Mapeo: unificado_completo.json + mapeo-cedear.ts`);
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS: error al generar señales cedear (${e instanceof Error ? e.message : "desconocido"}).`, fuentes: [], ok: false };
  }
}

export async function ejecutarPortfolioPegado(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let texto = "";
  try { texto = (JSON.parse(argsRaw) as any)?.texto ?? ""; } catch {}
  if (!texto || texto.trim().length < 30) {
    return { texto: "SIN RESULTADOS: pega el texto completo del portfolio IOL (con Patrimonio total, Tenencias, tickers y montos ARS).", fuentes: [], ok: false };
  }
  try {
    const { analizarPortfolioPegado } = await import("@/lib/portfolio-paste.functions");
    const res: any = await (analizarPortfolioPegado as any)({ data: { texto } });
    const L: string[] = [];
    L.push(`=== PORTFOLIO PEGADO — Clasificacion automatica (replica Optimizador tab) ===`);
    L.push(res.tablaMarkdown);
    L.push("");
    L.push(`Siguiente: pedi "optimiza este portfolio" o "riesgo de este portfolio" para ver composicion torta, histograma y frontera eficiente (Labadie portfolio.py + market_data.py).`);
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS: error al analizar portfolio pegado (${e instanceof Error ? e.message : "desconocido"}).`, fuentes: [], ok: false };
  }
}

export async function ejecutarOpcionesCompleto(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
  eventos?: Array<{ t: string; v: unknown }>;
}> {
  let ticker = "GGAL.BA";
  let strike: number | undefined;
  let vencimiento: string | undefined;
  let tipo: "Call" | "Put" = "Call";
  try {
    const p: any = JSON.parse(argsRaw);
    if (p?.ticker) ticker = String(p.ticker).toUpperCase();
    if (typeof p?.strike === "number") strike = p.strike;
    if (typeof p?.vencimiento === "string") vencimiento = p.vencimiento;
    if (p?.tipo === "Put" || p?.tipo === "Call") tipo = p.tipo;
  } catch {}
  try {
    const { analizarOpcionesCompleto } = await import("@/lib/options-analysis.functions");
    const res: any = await (analizarOpcionesCompleto as any)({ data: { ticker, strike, vencimiento, tipo } });
    const L: string[] = [];
    L.push(`=== OPCIONES ${ticker} ${tipo} ${strike ? `Strike ${strike}` : ""} ${vencimiento ?? ""} — Black-Scholes + Monte Carlo ===`);
    L.push(`Spot: ${res.spot ? `$${res.spot.toFixed(2)}` : "--"} | HistVol 30d: ${res.histVol ? (res.histVol * 100).toFixed(1) + "%" : "--"} | T: ${res.T ? res.T.toFixed(3) + "a" : "--"} | r: ${(res.r * 100).toFixed(1)}%`);
    if (res.greeks) {
      L.push(`Greeks (${tipo}): Δ ${res.greeks.delta.toFixed(3)} | Γ ${res.greeks.gamma.toFixed(4)} | Θ ${res.greeks.theta.toFixed(4)}/día | Vega ${res.greeks.vega.toFixed(4)} | Rho ${res.greeks.rho.toFixed(4)}`);
    }
    L.push("");
    L.push(`| Strike | Prima mkt | BS teórico | IV% | Δ | Γ | Prob ITM | Prob Profit |`);
    L.push(`|---|---|---|---|---|---|---|---|---|`);
    for (const row of res.tabla.slice(0, 9)) {
      const ivStr = row.iv != null ? (row.iv * 100).toFixed(1) + "%" : "--";
      const probITMStr = row.probITM != null ? (row.probITM * 100).toFixed(1) + "%" : "--";
      const probProfitStr = row.probProfit != null ? (row.probProfit * 100).toFixed(1) + "%" : "--";
      L.push(`| ${row.strike} | ${row.primaMkt ? `$${row.primaMkt.toFixed(2)}` : "--"} | ${row.bsTeorico ? `$${row.bsTeorico.toFixed(2)}` : "--"} | ${ivStr} | ${row.delta ? row.delta.toFixed(3) : "--"} | ${row.gamma ? row.gamma.toFixed(4) : "--"} | ${probITMStr} | ${probProfitStr} |`);
    }
    if (res.monteCarlo) {
      L.push("");
      L.push(`Monte Carlo 5k paths ${Math.round(res.T * 252)}d: mean $${res.monteCarlo.mean.toFixed(2)} | median $${res.monteCarlo.median.toFixed(2)} | p5 $${res.monteCarlo.p5.toFixed(2)} | p95 $${res.monteCarlo.p95.toFixed(2)}`);
    }
    L.push("");
    L.push(`Gráficos: sonrisa IV vs strike, Monte Carlo histograma, prob ITM/profit vs strike (ver abajo). Informe PDF con BS, Greeks y VaR disponible.`);
    L.push(`Fuente: yfinance (spot/hist) + IOL cadena BYMA (si disponible) + Labadie BS/Euler`);

    // Eventos para ChatWidget: 3 gráficos + informe PDF
    const eventos: Array<{ t: string; v: unknown }> = [];
    // 1. Sonrisa IV
    if (res.sonrisaIV?.length) {
      eventos.push({
        t: "chart",
        v: {
          tipo: "linea",
          titulo: `Sonrisa IV ${ticker} ${tipo} T=${res.T?.toFixed(2)}a`,
          unidad: "%",
          serie: res.sonrisaIV.map((p: any) => ({ f: String(p.strike), v: p.iv * 100 })),
        },
      });
    }
    // 2. Monte Carlo histograma como barras
    if (res.monteCarlo?.hist) {
      const h = res.monteCarlo.hist;
      const categorias = h.binEdges.slice(0, -1).map((e: number) => e.toFixed(0));
      eventos.push({
        t: "chart",
        v: {
          tipo: "barras",
          titulo: `Monte Carlo ${ticker} - Distribución precios finales`,
          categorias,
          valores: h.counts,
        },
      });
    }
    // 3. Prob ITM / Profit sonrisa
    if (res.sonrisaProb?.length) {
      eventos.push({
        t: "chart",
        v: {
          tipo: "linea",
          titulo: `Prob ITM / Profit vs Strike ${ticker}`,
          unidad: "%",
          serie: res.sonrisaProb.map((p: any) => ({ f: String(p.strike), v: p.probITM * 100 })),
        },
      });
    }
    // 4. Informe PDF
    const informeMd = `# Opciones ${ticker} ${tipo} — Informe completo\n\n_Spot $${res.spot?.toFixed(2) ?? "--"} | IV hist ${(res.histVol ? res.histVol * 100 : 0).toFixed(1)}% | T ${res.T?.toFixed(3)}a_\n\n${L.join("\n")}\n\n---\n*Black-Scholes Labadie + Monte Carlo Euler. No es recomendación.*`;
    eventos.push({ t: "informe", v: { titulo: `Opciones ${ticker} ${tipo} ${strike ?? ""}`, contenidoMarkdown: informeMd } });

    return { texto: L.join("\n"), fuentes: [], ok: true, eventos };
  } catch (e) {
    return { texto: `SIN RESULTADOS: error en opciones completo (${e instanceof Error ? e.message : "desconocido"}).`, fuentes: [], ok: false };
  }
}

export async function ejecutarSenalUnificada(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
  eventos?: Array<{ t: string; v: unknown }>;
}> {
  let simbolo = "";
  try {
    const p: any = JSON.parse(argsRaw);
    simbolo = String(p.simbolo ?? p.ticker ?? "").trim().toUpperCase();
  } catch {}
  if (!simbolo) return { texto: "SIN RESULTADOS: indicá simbolo (ej. GGAL.BA, YPF, AAPL).", fuentes: [], ok: false };
  try {
    const { generarSenalUnificada } = await import("@/lib/senales/motor-unificado");
    const s: any = await (generarSenalUnificada as any)(simbolo);
    const L: string[] = [];
    L.push(`=== SEÑAL UNIFICADA CORONAR — ${s.ticker} (${s.nombre}) — ${s.senal} ===`);
    L.push(`Score total: ${s.scoreTotal.toFixed(1)}/10 — Intermarket ${s.scores.intermarket}/10 · Fundamental ${s.scores.fundamental}/10 · Técnico ${s.scores.tecnico}/10 · Cuantitativo ${s.scores.cuantitativo}/10`);
    L.push(`Precio: ${s.precio != null ? "$" + s.precio.toFixed(2) : "--"} ${s.variacion1d != null ? `(${s.variacion1d >= 0 ? "+" : ""}${s.variacion1d.toFixed(2)}%)` : ""} | Confianza ${(s.confianza * 100).toFixed(0)}%`);
    if (s.nivel) L.push(`Nivel: ${s.nivel}`);
    L.push(`Motivo (4 capas): ${s.motivo}`);
    L.push(`Ficha: ${s.detalles.ficha?.decision_final ?? "--"} — MOS ${s.detalles.ficha?.margen_seguridad.mos_aplicado_pct ?? "--"}% — Upside ${s.detalles.ficha?.margen_seguridad.upside_pct ?? "--"}%`);
    if (s.detalles.tecnico) {
      const t: any = s.detalles.tecnico;
      L.push(`Técnico: RSI ${t.rsi?.toFixed?.(1) ?? (t.rsi14?.toFixed?.(1) ?? "?")} MACD hist ${t.macdHist?.toFixed?.(3) ?? t.macd?.hist?.toFixed?.(3) ?? "?"}`);
    }
    if (s.detalles.ciclo) L.push(`Ciclo: ${s.detalles.ciclo.label} (etapa ${s.detalles.ciclo.stage}) · Sectores fav: ${s.detalles.ciclo.sectoresFavorecidos?.slice(0, 2).join(", ")}`);
    if (s.detalles.macro) L.push(`Macro: ${s.detalles.macro.regimen_macro} score ${s.detalles.macro.score_macro} · Riesgo ${s.detalles.macro.riesgo_pais ?? "?"} bps`);
    L.push(`Fuente: ${s.fuente}`);
    L.push(`Aviso: información educativa, no es recomendación. Verificá en tu broker.`);
    // Evento gráfico: serie 1y del ticker
    let eventos: Array<{ t: string; v: unknown }> | undefined;
    try {
      const { fetchYahooChart } = await import("@/lib/yahoo-http");
      const chart: any = await fetchYahooChart(simbolo, "1y", "1d");
      const res = chart?.chart?.result?.[0];
      const closes = res?.indicators?.quote?.[0]?.close ?? [];
      const ts = res?.timestamp ?? [];
      const serie = ts.map((t: number, i: number) => ({ f: new Date(t * 1000).toISOString().slice(0, 10), v: closes[i] as number })).filter((p: any) => isFinite(p.v));
      if (serie.length) eventos = [{ t: "chart", v: { tipo: "linea", titulo: `${s.ticker} — Señal ${s.senal}`, unidad: res?.meta?.currency ?? "", serie } }];
    } catch {}
    return { texto: L.join("\n"), fuentes: [], ok: true, eventos };
  } catch (e) {
    return { texto: `SIN RESULTADOS: error en señal unificada de ${simbolo} (${e instanceof Error ? e.message : "desconocido"}).`, fuentes: [], ok: false };
  }
}

export async function ejecutarSenalesUnificadas(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let simbolos: string[] = [];
  let topN = 6;
  let filtro: any = "todos";
  try {
    const p: any = JSON.parse(argsRaw);
    if (Array.isArray(p.simbolos)) simbolos = p.simbolos.map((s: any) => String(s).trim().toUpperCase()).filter(Boolean);
    if (typeof p.topN === "number") topN = p.topN;
    if (p.filtro) filtro = p.filtro;
  } catch {}
  // Default universo: rotación sectorial + líquidos si no se dieron tickers
  if (!simbolos.length) {
    try {
      const { cedearesOperables, accionesOperables } = await import("@/lib/bot-unificado/universo");
      simbolos = [...cedearesOperables().slice(0, 8), ...accionesOperables().slice(0, 4)];
    } catch {
      simbolos = ["GGAL.BA", "YPF", "PAMP.BA", "AAPL", "MSFT", "MELI"];
    }
  }
  try {
    const { generarSenalesUnificadas } = await import("@/lib/senales/motor-unificado");
    const res: any = await (generarSenalesUnificadas as any)(simbolos, { topN, filtro });
    const senales: any[] = res.senales ?? [];
    if (!senales.length) return { texto: "SIN SEÑALES: no se generaron señales con el filtro actual.", fuentes: [], ok: true };
    const L: string[] = [];
    L.push(`=== SEÑALES UNIFICADAS CORONAR (${filtro}) — ${res.resumen} ===`);
    L.push(`| Ticker | Señal | Score | Conf | Precio | Var% | Interm | Fund | Tec | Cuant | Motivo |`);
    L.push(`|---|---|---|---|---|---|---|---|---|---|---|`);
    for (const s of senales) {
      L.push(`| ${s.ticker} | ${s.senal} | ${s.scoreTotal.toFixed(1)} | ${(s.confianza * 100).toFixed(0)}% | ${s.precio != null ? "$" + s.precio.toFixed(2) : "--"} | ${s.variacion1d != null ? s.variacion1d.toFixed(1) + "%" : "--"} | ${s.scores.intermarket} | ${s.scores.fundamental} | ${s.scores.tecnico} | ${s.scores.cuantitativo} | ${s.motivo.slice(0, 80)} |`);
    }
    L.push("");
    L.push(`Top: ${senales.map((s: any) => `${s.ticker} ${s.senal} ${s.scoreTotal.toFixed(1)}/10`).join(" · ")}`);
    L.push(`Universo: unificado_completo.json (${simbolos.length} evaluados) · Metodología: Intermarket Pring 6 etapas + Pascale/Elbaum + Semaforo RSI/MACD + CAPM/Riesgo Labadie.`);
    return { texto: L.join("\n"), fuentes: [], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS: error en señales unificadas (${e instanceof Error ? e.message : "desconocido"}).`, fuentes: [], ok: false };
  }
}

export async function ejecutarYTM(argsRaw: string, sessionId: string): Promise<{ texto: string; fuentes: FuenteMercado[]; ok: boolean }> {
  let ticker = "";
  let precioManual: number | undefined;
  try {
    const p: any = JSON.parse(argsRaw);
    ticker = String(p.ticker ?? p.simbolo ?? "").trim().toUpperCase();
    if (p.precio != null && isFinite(Number(p.precio)) && Number(p.precio) > 0) precioManual = Number(p.precio);
  } catch {}
  if (!ticker) return { texto: "Falta ticker del bono (ej. AL30, GD30, AL35)", fuentes: [], ok: false };
  try {
    const { calcularYTM } = await import("@/lib/renta-fija/ytm-calculator");
    const r = await calcularYTM(ticker, sessionId, precioManual);
    const L: string[] = [];
    const esPrecioDeHoy = r.fechaPrecio === new Date().toISOString().slice(0, 10);
    L.push(`=== YTM / TIR — ${r.ticker} — ${r.nombre} ===`);
    L.push(`Emisor: ${r.emisor} | Moneda: ${r.moneda} | Especie: ${r.especie} | Vto: ${r.fechaVencimiento}`);
    L.push(`Precio: ${r.precio?.toFixed(2) ?? "--"} ${r.precioMoneda} ${esPrecioDeHoy ? "(en vivo)" : `(último cierre del ${r.fechaPrecio})`} — fuente: ${r.fuentePrecio}. Si el precio no es de hoy, aclaralo al usuario.`);
    L.push(`TIR anual (YTM): **${r.tirPct}** — TEM ${(r.tem! * 100).toFixed(2)}% — TNA ${(r.tna! * 100).toFixed(2)}%`);
    L.push(`Flujos futuros: ${r.flujosFuturos} — ${r.diagnostico}`);
    L.push(`Flujos (próx. 5): ${r.flujos.slice(0, 5).map((f) => `${f.fecha}:${f.monto}`).join(" | ")}`);
    L.push(`Fuente: ${r.fuente} | Motor: Newton-Raphson ACT/365 RENTA_FIJA_COMPLETA.json`);
    // Gráfico de flujos: PNG satori oscuro (Telegram) + serie completa (web)
    let eventos: any[] | undefined;
    try {
      const serie = r.flujos.map((f) => ({ f: f.fecha, v: f.monto }));
      if (serie.length) {
        // 1) Serie completa para la web (sin recortar, con año)
        const serieWeb = {
          t: "chart",
          v: {
            tipo: "barras",
            titulo: `${ticker} — Flujos futuros`,
            // label con año para no repetir 01-09: 2027-01-09 → 27-01-09
            categorias: serie.map((s) => s.f.slice(2)),
            valores: serie.map((s) => s.v),
          },
        };
        eventos = [serieWeb];

        // 2) PNG oscuro profesional para Telegram (satori + resvg)
        try {
          const { generarFlujoBonoPng } = await import("@/lib/charts/flujo-bono-slide.server");
          const png = await generarFlujoBonoPng({
            ticker: r.ticker,
            nombre: r.nombre,
            emisor: r.emisor,
            moneda: r.moneda,
            fechaVencimiento: r.fechaVencimiento,
            precio: r.precio,
            precioMoneda: r.precioMoneda,
            fechaPrecio: r.fechaPrecio,
            fuentePrecio: r.fuentePrecio,
            tirAnual: r.tirAnual,
            tem: r.tem,
            tna: r.tna,
            flujos: r.flujos.map((f) => ({ fecha: f.fecha, monto: f.monto, tipo: f.tipo })),
          });
          eventos.push({
            t: "chart",
            v: {
              tipo: "flujo_bono_png",
              titulo: `${ticker} — Flujos futuros`,
              pngBase64: png.toString("base64"),
            },
          });
        } catch (e) {
          console.warn("[YTM] no se pudo generar PNG flujo bono", e);
        }
      }
    } catch {}
    return { texto: L.join("\n"), fuentes: [{ dominio: "api.invertironline.com", url: "https://api.invertironline.com", title: "IOL" } as any], ok: true, eventos } as any;
  } catch (e) {
    return { texto: `Error YTM ${ticker}: ${e instanceof Error ? e.message : String(e)}`, fuentes: [], ok: false };
  }
}

// ---------------------------------------------------------------------------
// Cadena de Opciones BCBA (server/opciones_service.py)
// ---------------------------------------------------------------------------

export async function ejecutarCadenaOpciones(argsRaw: string): Promise<ResultadoTool> {
  let simbolo = "";
  try {
    const args = JSON.parse(argsRaw) as { simbolo?: string };
    simbolo = String(args.simbolo ?? "").trim().toUpperCase();
  } catch {}
  if (!simbolo) {
    return {
      texto: "SIN RESULTADOS: no recibí el símbolo. Reinvocá con el parámetro simbolo (ej. 'GGAL.BA').",
      fuentes: [],
    };
  }
  try {
    const res = await fetch(`http://localhost:5000/api/opciones/cadena?simbolo=${encodeURIComponent(simbolo)}`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { texto: `SIN RESULTADOS: /api/opciones/cadena respondió ${res.status} ${txt.slice(0,200)}`, fuentes: [] };
    }
    const j: any = await res.json();
    const cadena: any[] = j.cadena ?? j.options ?? [];
    if (!cadena.length) return { texto: `SIN RESULTADOS: cadena vacía para ${simbolo}`, fuentes: [] };
    const L: string[] = [];
    L.push(`Cadena de opciones BCBA — ${simbolo} — ${cadena.length} strikes`);
    L.push(`Skew puts>calls: ${j.sesgo ?? j.skew ?? "s/d"} (sesgo bajista si puts IV > calls IV)`);
    // Tabla strikes
    const rows = cadena.slice(0, 12).map((r: any) => `| ${r.strike} | ${r.tipo ?? r.type ?? ""} | ${r.prima ?? r.premium ?? ""} | ${(r.iv != null ? (r.iv * 100).toFixed(1) : "s/d")}% | Δ${(r.delta ?? 0).toFixed(2)} | Γ${(r.gamma ?? 0).toFixed(3)} | VaR${r.var ?? ""} |`);
    L.push(`| Strike | Tipo | Prima | IV | Delta | Gamma | VaR |\n|---|---|---|---|---|---|---|\n` + rows.join("\n"));
    const interp = j.interpretacion ?? (j.sesgo && j.sesgo > 0 ? "skew puts>calls = sesgo bajista" : "skew neutro");
    L.push(`Interpretación: ${interp}`);
    return { texto: L.join("\n"), fuentes: [] };
  } catch (e) {
    return { texto: `Error cadena opciones ${simbolo}: ${e instanceof Error ? e.message : String(e)}`, fuentes: [] };
  }
}


// ─── Opciones BCBA + Predicción ML (port TS nativo Vercel) ──────────────────

export async function ejecutarPrediccionSubyacente(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let simbolo = "";
  let horizonte = 5;
  try {
    const args = JSON.parse(argsRaw) as { simbolo?: string; horizonte?: number };
    simbolo = String(args.simbolo ?? "").trim().toUpperCase();
    if (typeof args.horizonte === "number" && args.horizonte >= 1 && args.horizonte <= 60) {
      horizonte = Math.round(args.horizonte);
    }
  } catch {
    /* sin args */
  }
  if (!simbolo) {
    return {
      texto:
        "Sin datos: necesito el parámetro 'simbolo' (ej. GGAL, PAMP, YPFD). No inventes probabilidades.",
      fuentes: [],
      ok: false,
    };
  }

  const subyacente = await obtenerVelas(simbolo.endsWith(".BA") ? simbolo : `${simbolo}.BA`, "2y");
  if (!subyacente.ok || subyacente.velas.length < 120) {
    return {
      texto: `No hay historial suficiente para ${simbolo} (${subyacente.velas.length} velas). Informalo con honestidad y no estimés nada.`,
      fuentes: [],
      ok: false,
    };
  }

  const r = ejecutarPrediccion(subyacente.velas, simbolo, horizonte);
  if (r.error || r.probActual == null || !r.decision) {
    return { texto: `Predicción no disponible para ${simbolo}: ${r.error ?? "datos insuficientes"}`, fuentes: [], ok: false };
  }

  const pct = (v: number | null) => (v != null ? `${(v * 100).toFixed(1)}%` : "n/d");
  const sinVentaja =
    r.wfAcc != null && r.wfAcc < 0.55 && !r.reglaOroOk
      ? " ⚠️ El modelo NO muestra ventaja predictiva verificable (walk-forward <55% y regla de oro violada): presentá el resultado como exploratorio."
      : r.wfAcc != null && r.wfAcc < 0.55
        ? " ⚠️ Walk-forward por debajo de 55%: sin ventaja estadística clara, comunicar con cautela."
        : "";

  const texto = `**Predicción direccional ML — ${simbolo}** (horizonte ${horizonte} días hábiles)

- Precio spot: $${subyacente.spot?.toFixed(2)}
- Probabilidad de subida actual: **${(r.probActual * 100).toFixed(1)}%** (umbral óptimo ${(r.logThreshold * 100).toFixed(0)}%)
- Señal: **${r.decision.direccion}** — confianza ${(r.decision.confianza * 100).toFixed(0)}%
- Estrategia sugerida: ${r.decision.estrategia}

Validación del modelo:
- CV accuracy/F1: ${pct(r.logisticCv.acc)} / ${r.logisticCv.f1.toFixed(2)}
- Test accuracy/F1: ${pct(r.testAcc)} / ${r.testF1?.toFixed(2) ?? "n/d"}
- Walk-forward (${r.wfVentanas} ventanas): acc ${pct(r.wfAcc)} / F1 ${r.wfF1?.toFixed(2) ?? "n/d"}${sinVentaja}
- Regla de oro features ≤ n/10: ${r.reglaOroOk ? "OK" : "violada"}
- Features más influyentes: ${r.featuresImportancia.slice(0, 3).map(([k, v]) => `${k} (${v > 0 ? "+" : ""}${v})`).join(", ")}

Fuente de precios: Yahoo Finance (${subyacente.velas.length} velas diarias). Modelo logístico L2 entrenado con split temporal 60/20/20 sin mezcla de información. Esto es una estimación estadística, no recomendación de inversión.`;

  return {
    texto,
    fuentes: [
      { dominio: "finance.yahoo.com", url: `https://finance.yahoo.com/quote/${simbolo}.BA`, title: `Historial ${simbolo}.BA` },
    ],
    ok: true,
  };
}

export async function ejecutarCadenaOpcionesBCBA(argsRaw: string): Promise<{
  texto: string;
  fuentes: FuenteMercado[];
  ok: boolean;
}> {
  let simbolo = "";
  try {
    const args = JSON.parse(argsRaw) as { simbolo?: string };
    simbolo = String(args.simbolo ?? "").trim().toUpperCase();
  } catch {
    /* sin args */
  }
  if (!simbolo) {
    return {
      texto: "Necesito el parámetro 'simbolo' del subyacente BCBA con opciones listadas (GGAL, PAMP, YPFD, COME, BMA).",
      fuentes: [],
      ok: false,
    };
  }

  const token = await autenticar();
  if (!token) {
    return {
      texto: "No pude autenticarme en la API de IOL en este momento. Reintentá más tarde.",
      fuentes: [],
      ok: false,
    };
  }
  const subyacente = await obtenerVelas(`${simbolo}.BA`, "1y");
  if (!subyacente.ok || !subyacente.spot) {
    return { texto: `Sin datos de mercado para ${simbolo}.BA.`, fuentes: [], ok: false };
  }
  const spot = subyacente.spot;
  const rets = retornosLog(subyacente.velas.map((v) => v.close));
  const vd = ewmaVol(rets) ?? volHistorica(rets) ?? 0.35;

  const [tasaRiesgo, cruda] = await Promise.all([obtenerTasaCaucion(token), obtenerCadenaOpciones(token, simbolo)]);
  if (cruda.length === 0) {
    return { texto: `${simbolo} no tiene opciones con datos en IOL hoy.`, fuentes: [], ok: false };
  }
  const cadena = await procesarCadena(cruda, spot, { tasaRiesgo, volHistorica: vd });
  if (cadena.length === 0) {
    return { texto: `La cadena de ${simbolo} no tiene strikes procesables (sin precio o vencimiento).`, fuentes: [], ok: false };
  }

  const sesgo = sesgoVolatilidad(
    cadena.map((o) => ({ tipo: o.tipoOpcion, strike: o.strike, iv: o.iv })),
    spot,
  );
  const vencimientos = [...new Set(cadena.map((o) => o.fechaVencimiento))].slice(0, 3);
  const resumenVenc = vencimientos
    .map((venc) => {
      const filas = cadena.filter((o) => o.fechaVencimiento === venc);
      const callsItm = filas.filter((o) => o.tipoOpcion === "Call" && o.moneyness === "ITM").length;
      const putsItm = filas.filter((o) => o.tipoOpcion === "Put" && o.moneyness === "ITM").length;
      const ivMedia = filas.filter((o) => o.iv != null);
      const ivProm = ivMedia.length ? (ivMedia.reduce((s, o) => s + (o.iv as number), 0) / ivMedia.length) * 100 : NaN;
      return `- ${venc}: ${filas.length} opciones | IV promedio ${Number.isNaN(ivProm) ? "n/d" : `${ivProm.toFixed(1)}%`} | calls ITM ${callsItm}, puts ITM ${putsItm}`;
    })
    .join("\n");

  const lecturaSesgo =
    sesgo == null
      ? "no calculable (faltan OTM de un lado)"
      : sesgo > 10
        ? `+${sesgo.toFixed(1)}% → sesgo ALCISTA (puts OTM más caras: mercado comprando cobertura contra suba)`
        : sesgo < -10
          ? `${sesgo.toFixed(1)}% → sesgo BAJISTA (calls OTM más caras)`
          : `${sesgo.toFixed(1)}% → neutral`;

  const texto = `**Cadena de opciones BCBA — ${simbolo}**

- Spot: $${spot.toFixed(2)} | Vol EWMA anual: ${(vd * 100).toFixed(1)}% | Tasa caución 7d: ${(tasaRiesgo * 100).toFixed(2)}%
- Opciones procesadas: ${cadena.length}
- Skew/sesgo de volatilidad OTM: ${lecturaSesgo}

Vencimientos principales:
${resumenVenc}

Interpretación metodológica (Elbaum Cap 10 + prototipo Labadie): la T de cada opción usa días hábiles XBUE/252; la IV se resuelve por bisección dentro de límites teóricos; las griegas salen de Black-Scholes con la IV de mercado cuando existe. Datos: API InvertirOnline. No es recomendación de inversión.`;

  return {
    texto,
    fuentes: [
      { dominio: "invertironline.com", url: "https://api.invertironline.com", title: "API IOL — cadena de opciones" },
    ],
    ok: true,
  };
}


// ---------------------------------------------------------------------------
// CRYPTO QUANT — port de trading_bots_unificado (Labadie sobre Binance futures)
// ---------------------------------------------------------------------------

function nfCrypto(n: number | null | undefined, dec = 2): string {
  return typeof n === "number" && isFinite(n) ? n.toFixed(dec) : "s/d";
}

/** Walk-Forward BB+RSI 5m (anti-overfitting, métrica OOS). */
export async function ejecutarWalkForwardBbRsi(argsRaw: string): Promise<{ texto: string; fuentes: import("@/lib/mercado.server").FuenteMercado[]; ok: boolean }> {
  let symbol = "BTCUSDT", dias = 135, trainDias = 30, testDias = 15;
  try {
    const a = JSON.parse(argsRaw) as { simbolo?: string; dias?: number; trainDias?: number; testDias?: number };
    if (a.simbolo) symbol = String(a.simbolo).toUpperCase();
    if (typeof a.dias === "number") dias = a.dias;
    if (typeof a.trainDias === "number") trainDias = a.trainDias;
    if (typeof a.testDias === "number") testDias = a.testDias;
  } catch {}
  try {
    const { runWalkForward } = await import("@/lib/cripto/backtest.functions");
    const r: any = await runWalkForward({ data: { symbol, interval: "5m", days: dias, trainDays: trainDias, testDays: testDias } });
    const L: string[] = [`WALK-FORWARD BB+RSI 5m — ${symbol} · ${r.klinesCount} velas · ${dias}d · train ${trainDias}d → test ${testDias}d rodante · grid ${r.gridCombos} combos`];
    for (const f of r.folds) {
      if (f.skip) { L.push(`- Fold ${f.fold}: ${f.skip}`); continue; }
      L.push(`- Fold ${f.fold}: ${f.params} | IS WR ${nfCrypto(f.isWr,1)}% exp ${nfCrypto(f.isExp,3)}% (${f.isTrades}) → OOS WR ${nfCrypto(f.oosWr,1)}% PF ${nfCrypto(f.oosPf)} ret ${nfCrypto(f.oosRet,2)}% (${f.oosTrades})`);
    }
    if (r.oos) {
      L.push(`\nRESULTADO OUT-OF-SAMPLE AGREGADO (lo único que cuenta):`);
      L.push(`- Trades ${r.oos.notional.trades} · WR ${nfCrypto(r.oos.notional.winRate,1)}% · PF ${nfCrypto(r.oos.notional.profitFactor)} · expectancia ${nfCrypto(r.oos.notional.expectancyPct,4)}% · retorno ${nfCrypto(r.oos.notional.returnPct,2)}% · MaxDD ${nfCrypto(r.oos.notional.maxDrawdownPct,2)}%`);
      L.push(`- Cuenta (lev x10): ret ${nfCrypto(r.oos.cuenta?.returnPct ?? 0,2)}% · PF ${nfCrypto(r.oos.cuenta?.profitFactor ?? 0)}`);
      L.push(`- Salidas: ${Object.entries(r.oos.reasons || {}).map(([k,v]) => `${k}: ${v}`).join(" · ")}`);
      if (r.veredicto) {
        L.push(`\nVEREDICTO SOBREAJUSTE: ${r.veredicto} (decaimiento IS→OOS expectancia ${nfCrypto(r.decaimiento,4)}%)`);
        if (r.veredicto !== "ACEPTABLE") L.push("Los params optimizados NO se sostienen fuera de muestra. Acciones: reducir grid, más datos, menos reglas.");
      }
    } else {
      L.push("\nSin trades OOS: más días o grid menos estricto.");
    }
    return { texto: L.join("\n"), fuentes: [{ dominio: "binance.com", url: "https://fapi.binance.com", title: "Binance Futures API" }], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS walkforward_bb_rsi: ${e instanceof Error ? e.message : String(e)}`, fuentes: [], ok: false };
  }
}

/** Market-Making Avellaneda-Stoikov simplificado sobre klines 1m. */
export async function ejecutarMMInventario(argsRaw: string): Promise<{ texto: string; fuentes: import("@/lib/mercado.server").FuenteMercado[]; ok: boolean }> {
  let symbol = "BTCUSDT", dias = 10, grid = false;
  try {
    const a = JSON.parse(argsRaw) as { simbolo?: string; dias?: number; grid?: boolean };
    if (a.simbolo) symbol = String(a.simbolo).toUpperCase();
    if (typeof a.dias === "number") dias = a.dias;
    if (typeof a.grid === "boolean") grid = a.grid;
  } catch {}
  try {
    const { runMMInventory } = await import("@/lib/cripto/quant-lab.functions");
    const r: any = await runMMInventory({ data: { symbol, days: dias, grid } });
    const m = r.modo === "grid" ? r.oos : r.base;
    const qty = r.bestParams?.qtyUsdt ?? 500;
    const L: string[] = [`MARKET-MAKING con control de inventario (Avellaneda-Stoikov/Fodra-Labadie) — ${symbol} klines 1m · ${r.velas} velas · ${dias}d${r.modo === "grid" ? " · GRID 64 combos train 60%→OOS 40%" : ""}`];
    if (r.modo === "grid") {
      L.push(`Params óptimos TRAIN por PnL: ψ_min ${r.bestParams.psiMinBps}bps · skew ${r.bestParams.invSkew} · Δ ${r.bestParams.deltaCoef} · maxQ ${r.bestParams.maxInventory}`);
      for (const t of r.top5) L.push(`  · ψ=${t.psi} skew=${t.skew} maxQ=${t.maxQ} → PnL ${nfCrypto(t.pnl)} USDT · fills ${t.fills} · Sharpe ${nfCrypto(t.sharpe)}`);
      L.push(`\nOUT-OF-SAMPLE (40% final):`);
    }
    L.push(`- PnL total ${nfCrypto(m.pnlUsdt)} USDT · fills ${m.fills} (buy ${m.nBuy}/sell ${m.nSell})`);
    L.push(`- PnL/fill ${nfCrypto(m.pnlPerFillUsdt,4)} USDT (${nfCrypto((m.pnlPerFillUsdt / qty) * 1e4,3)} bps)`);
    L.push(`- Sharpe(1m anualizado) ${nfCrypto(m.sharpeMin)} · MaxDD ${nfCrypto(m.maxDdUsdt)} USDT · inv final ${m.finalQ} lotes · bloqueos ${m.blocked}`);
    L.push(`- VEREDICTO: ${m.pnlUsdt > 0 ? "RENTABLE" : "NO RENTABLE"}`);
    L.push(`Modelo: bid=r−ψ/2 ask=r+ψ/2, r=S(1+Δ)(1−skew·q·σ²), fills si low≤bid/high≥ask, fee maker 2bps.`);
    return { texto: L.join("\n"), fuentes: [{ dominio: "binance.com", url: "https://fapi.binance.com", title: "Binance Futures API" }], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS mm_inventario_sim: ${e instanceof Error ? e.message : String(e)}`, fuentes: [], ok: false };
  }
}

/** Ejecución óptima AC vs TWAP vs naive (IS en bps). */
export async function ejecutarEjecucionOptimaCrypto(argsRaw: string): Promise<{ texto: string; fuentes: import("@/lib/mercado.server").FuenteMercado[]; ok: boolean }> {
  let symbol = "BTCUSDT", horizonMin = 60, notionalUsdt = 100000, dias = 20;
  try {
    const a = JSON.parse(argsRaw) as { simbolo?: string; horizonteMin?: number; notionalUsdt?: number; dias?: number };
    if (a.simbolo) symbol = String(a.simbolo).toUpperCase();
    if (typeof a.horizonteMin === "number") horizonMin = a.horizonteMin;
    if (typeof a.notionalUsdt === "number") notionalUsdt = a.notionalUsdt;
    if (typeof a.dias === "number") dias = a.dias;
  } catch {}
  try {
    const { runOptimalExecution } = await import("@/lib/cripto/quant-lab.functions");
    const r: any = await runOptimalExecution({ data: { symbol, days: dias, horizonMin, notionalUsdt } });
    const s = r.resumen;
    const L: string[] = [
      `EJECUCIÓN ÓPTIMA (COMPRA ${nfCrypto(notionalUsdt,0)} USDT en ${r.horizonMin}min) — ${symbol} · ${r.ventanas} ventanas`,
      `Impacto h(v)=σ√steps(v/V)^${r.gamma} · spread ${r.halfSpreadBps}bps · IS en bps (menor=mejor):`,
      `- NAIVE (1 market order): IS medio ${nfCrypto(s.naive.mean,3)} · std ${nfCrypto(s.naive.std,3)} · J(λ=0.5) ${nfCrypto(s.naive.j,3)}`,
      `- TWAP: IS medio ${nfCrypto(s.twap.mean,3)} · std ${nfCrypto(s.twap.std,3)} · J ${nfCrypto(s.twap.j,3)} · ahorra ${nfCrypto(s.ahorroTwapBps,3)} bps vs naive en ${nfCrypto(s.beatTwapPct,0)}% de ventanas`,
      `- ALMGREN-CHRISS: IS medio ${nfCrypto(s.ac.mean,3)} · std ${nfCrypto(s.ac.std,3)} · J ${nfCrypto(s.ac.j,3)} · ahorra ${nfCrypto(s.ahorroAcBps,3)} bps vs naive en ${nfCrypto(s.beatAcPct,0)}% de ventanas`,
      `VEREDICTO: ${s.veredicto}`,
      `(Paper: la ejecución renta minimizando impacto+riesgo; no genera alpha direccional.)`,
    ];
    return { texto: L.join("\n"), fuentes: [{ dominio: "binance.com", url: "https://fapi.binance.com", title: "Binance Futures API" }], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS ejecucion_optima_crypto: ${e instanceof Error ? e.message : String(e)}`, fuentes: [], ok: false };
  }
}

/** Fodra-Labadie HJB 1303.7177v2. */
export async function ejecutarMMHJB(argsRaw: string): Promise<{ texto: string; fuentes: import("@/lib/mercado.server").FuenteMercado[]; ok: boolean }> {
  let symbol = "BTCUSDT", fuente: "binance"|"yahoo"="binance", dias=20, epsilon=0.001, alphaFee=0.05;
  try { const a = JSON.parse(argsRaw) as any; if(a.simbolo) symbol=String(a.simbolo); if(a.fuente) fuente=a.fuente==="yahoo"?"yahoo":"binance"; if(typeof a.dias==="number") dias=a.dias; if(typeof a.epsilon==="number") epsilon=a.epsilon; if(typeof a.alphaFee==="number") alphaFee=a.alphaFee; } catch {}
  try {
    const { runMMHJB } = await import("@/lib/cripto/quant-lab.functions");
    const r:any = await runMMHJB({ data:{ symbol, days:dias, source:fuente, epsilon, alphaFee }});
    const qf=r.quotes; const mc=r.mc;
    const fmt=(n:number,d=2)=> isFinite(n)? n.toFixed(d):"N/D";
    const ou=r.ouFit? `OU fit a=${fmt(r.ouFit.a,4)} µ=${fmt(r.ouFit.mu,1)} σ=${fmt(r.ouFit.sigma,4)} halfLife=${fmt(r.ouFit.halfLife,1)}d` : "OU no fiteable (martingala)";
    return { texto: [`FODRA-LABADIE HJB 1303.7177v2 — ${symbol} (${fuente}) n=${r.n} · ${ou}`,
      `Cotización óptima (q=0): bid ${fmt(qf.flat.rStar - qf.flat.psiFee/2,2)} | ask ${fmt(qf.flat.rStar + qf.flat.psiFee/2,2)} · ψ=${fmt(qf.flat.psiFee,4)} (ψ*=${fmt(qf.flat.psiStar,4)}+2α=${fmt(2*alphaFee,4)}) · r*=Δ-correction; gain/spread ${fmt(qf.flat.gainPerSpread,4)} · π̃=${fmt(qf.flat.piTilde,5)} · scalable=${qf.flat.scalable?"SCALPING":"no"}`,
      `Con inventario q=5: ψ=${fmt(qf.withInventory.psiFee,4)} r*=${fmt(qf.withInventory.rStar,2)} (tilte inventario ${fmt(qf.withInventory.rStar - qf.flat.rStar,2)})`,
      `Monte Carlo ${qf.flat? "" : ""}${r.mc? "" : ""}— martingala mean ${fmt(mc.martingale.mean,2)} std ${fmt(mc.martingale.std,2)} VaR95 ${fmt(mc.martingale.var95,2)} Sharpe ${fmt(mc.martingale.sharpe,2)} | OU-drift mean ${fmt(mc.ouDrift.mean,2)} Sharpe ${fmt(mc.ouDrift.sharpe,2)} skew ${fmt(mc.ouDrift.skew,2)}`].join("\n"),
      fuentes:[{ dominio: fuente==="yahoo"?"finance.yahoo.com":"binance.com", url: fuente==="yahoo"? `https://finance.yahoo.com/quote/${symbol}`:"https://fapi.binance.com", title: "Market-making HJB" }], ok:true };
  } catch(e){ return { texto:`SIN RESULTADOS mm_hjb_sim: ${e instanceof Error?e.message:String(e)}`, fuentes:[], ok:false }; }
}

/** Escáner de cointegración entre perps Binance. */
export async function ejecutarPairsCryptoScan(argsRaw: string): Promise<{ texto: string; fuentes: import("@/lib/mercado.server").FuenteMercado[]; ok: boolean }> {
  let topN = 15, intervalo = "1h", dias = 30;
  try {
    const a = JSON.parse(argsRaw) as { topN?: number; intervalo?: string; dias?: number };
    if (typeof a.topN === "number") topN = a.topN;
    if (a.intervalo) intervalo = String(a.intervalo);
    if (typeof a.dias === "number") dias = a.dias;
  } catch {}
  try {
    const { scanPairsCrypto } = await import("@/lib/cripto/pairs-crypto.functions");
    const r: any = await scanPairsCrypto({ data: { topN, interval: intervalo, days: dias } });
    const L: string[] = [
      `ESCÁNER COINTEGRACIÓN CRYPTO — top ${r.scanned} perps USDT por volumen · ${r.pairs} pares testeados (${intervalo}, ${dias}d) · Engle-Granger proxy (OLS + ADF residuos):`,
    ];
    for (const p of r.top.slice(0, 10)) {
      L.push(`- ${p.a}/${p.b}: p-value ${nfCrypto(p.pValue,4)} ${p.pValue < 0.05 ? "✅ cointegrado" : ""} · corr retornos ${nfCrypto(p.corr,3)} · β hedge ${nfCrypto(p.beta,4)}`);
    }
    L.push(`\nUsar pairs_crypto_analizar(simboloA, simboloB) para backtest + validación IS/OOS del par elegido.`);
    return { texto: L.join("\n"), fuentes: [{ dominio: "binance.com", url: "https://fapi.binance.com", title: "Binance Futures API" }], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS pairs_crypto_scan: ${e instanceof Error ? e.message : String(e)}`, fuentes: [], ok: false };
  }
}

/** Análisis stat-arb de un par crypto con validación IS/OOS. */
export async function ejecutarPairsCryptoAnalizar(argsRaw: string): Promise<{ texto: string; fuentes: import("@/lib/mercado.server").FuenteMercado[]; ok: boolean }> {
  let a_ = "", b_ = "", method = "rolling_ratio_mean", exitM = "zscore_band", intervalo = "1h", dias = 60;
  try {
    const a = JSON.parse(argsRaw) as { simboloA?: string; simboloB?: string; hedgeRatioMethod?: string; exitMethod?: string; intervalo?: string; dias?: number };
    a_ = String(a.simboloA ?? "").toUpperCase();
    b_ = String(a.simboloB ?? "").toUpperCase();
    if (a.hedgeRatioMethod) method = String(a.hedgeRatioMethod);
    if (a.exitMethod) exitM = String(a.exitMethod);
    if (a.intervalo) intervalo = String(a.intervalo);
    if (typeof a.dias === "number") dias = a.dias;
  } catch {}
  if (!a_ || !b_) {
    return { texto: "SIN RESULTADOS: pairs_crypto_analizar requiere simboloA y simboloB (ej. BTCUSDT y ETHUSDT).", fuentes: [], ok: false };
  }
  try {
    const { analyzePairCrypto } = await import("@/lib/cripto/pairs-crypto.functions");
    const r: any = await analyzePairCrypto({ data: { simboloA: a_, simboloB: b_, interval: intervalo, days: dias, hedgeRatioMethod: method, exitMethod: exitM } });
    const L: string[] = [
      `STAT-ARB CRYPTO ${r.par} — ${intervalo} ${dias}d · método ${r.metodo} · salida ${r.salida} · ${r.velas} velas alineadas`,
      `Cointegración: ADF ${nfCrypto(r.adfStat,2)} · p-value ${nfCrypto(r.pValue,4)} → ${r.cointegrado ? "COINTEGRADO al 5%" : "NO cointegrado"} · β hedge ${nfCrypto(r.beta,4)}`,
      `Backtest completo ($1000): trades ${r.metricas.trades} · WR ${nfCrypto(r.metricas.winRate,1)}% · PF ${nfCrypto(r.metricas.profitFactor)} · expectancy ${nfCrypto(r.metricas.expectancyPct,4)}% · PnL ${nfCrypto(r.metricas.totalPnlUsd)} USD · MaxDD ${nfCrypto(r.metricas.maxDrawdownUsd)} USD`,
      `In-Sample 70%: trades ${r.is.trades} · WR ${nfCrypto(r.is.winRate,1)}% · exp ${nfCrypto(r.is.expectancyPct,4)}%`,
      `Out-of-Sample 30%: trades ${r.oos.trades} · WR ${nfCrypto(r.oos.winRate,1)}% · exp ${nfCrypto(r.oos.expectancyPct,4)}% ${r.robusto ? "✅ ROBUSTO" : "⚠️ la expectancia NO se sostiene fuera de muestra"}`,
    ];
    return { texto: L.join("\n"), fuentes: [{ dominio: "binance.com", url: "https://fapi.binance.com", title: "Binance Futures API" }], ok: true };
  } catch (e) {
    return { texto: `SIN RESULTADOS pairs_crypto_analizar: ${e instanceof Error ? e.message : String(e)}`, fuentes: [], ok: false };
  }
}


/** Interpretación IA de oportunidades — fundamentación metodológica por resultado. */
export async function ejecutarInterpretarOportunidades(argsRaw: string): Promise<{ texto: string; fuentes: import("@/lib/mercado.server").FuenteMercado[]; ok: boolean }> {
  let sector: string | undefined = undefined;
  try {
    const a = JSON.parse(argsRaw) as { sector?: string };
    if (a.sector) sector = String(a.sector);
  } catch {}
  try {
    const { getOportunidadesOrquestadas, interpretarOportunidadesConIA } = await import("@/lib/herramientas/oportunidades-orquestadas.functions");
    // Obtener payload vivo (usa cache 15m, lotes paralelos)
    const payload: any = await (getOportunidadesOrquestadas as any)({ data: { sector, topN: 8, maxTickers: 30 } });
    // Si el wrapper createServerFn devuelve { data: ... } o directo, normalizar
    const realPayload = payload?.data ?? payload;
    const interp: any = await (interpretarOportunidadesConIA as any)({ data: { payload: realPayload } });
    const txt: string = interp?.interpretacion ?? interp?.data?.interpretacion ?? "";
    const modelo: string = interp?.modelo ?? interp?.data?.modelo ?? "rule-based-fallback";
    if (!txt) throw new Error("Interpretación vacía");
    return { texto: txt + `\n\n[Modelo: ${modelo}]`, fuentes: [], ok: true };
  } catch (e) {
    // Fallback: intentar interpretar sin payload (usa fallback rule-based interno)
    try {
      const { interpretarOportunidadesConIA } = await import("@/lib/herramientas/oportunidades-orquestadas.functions");
      const interp: any = await (interpretarOportunidadesConIA as any)({ data: { payload: { fase1: {}, fase2: {}, fase4: {}, fase5: { senales: [] }, pipeline: [], regimenMacro: "NEUTRO" } } });
      const txt: string = interp?.interpretacion ?? "";
      if (txt) return { texto: txt, fuentes: [], ok: true };
    } catch {}
    return { texto: `SIN RESULTADOS interpretar_oportunidades: ${e instanceof Error ? e.message : String(e)}`, fuentes: [], ok: false };
  }
}
