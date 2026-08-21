/**
 * Fuentes de datos financieras genéricas para el agente ejecutor del chat:
 * - yfinance (Yahoo Finance: quoteSummary, chart, search, news) — método AF
 *   (cookie + crumb de src/lib/yahoo-http.ts).
 * - ArgentinaDatos (API pública v1).
 * - CriptoYa (dólar y exchanges cripto).
 * - BCRA Estadísticas Cambiarias v1.0.
 * - BCRA Estadísticas Monetarias v4.0.
 *
 * Cada función devuelve texto compacto para el modelo + fuentes citables, y
 * opcionalmente una serie numérica lista para graficar en el chat.
 */

import {
  fetchYahooQuoteSummaryJson,
  fetchYahooChart,
  fetchYahooSearch,
  yahooHeaders,
} from "@/lib/yahoo-http";
import { FUENTE_IOL, type FuenteIOL } from "@/lib/iol.server";

export type FuenteMercado = { dominio: string; url: string; title: string };

export type SeriePunto = { f: string; v: number };

export type ResultadoFuente = {
  texto: string;
  fuentes: FuenteMercado[];
  serie?: { titulo: string; unidad?: string | undefined; puntos: SeriePunto[] } | undefined;
};

const FUENTE_YF: FuenteMercado = {
  dominio: "finance.yahoo.com",
  url: "https://finance.yahoo.com",
  title: "Yahoo Finance",
};
const FUENTE_AD: FuenteMercado = {
  dominio: "api.argentinadatos.com",
  url: "https://api.argentinadatos.com/v1",
  title: "ArgentinaDatos API",
};
const FUENTE_CY: FuenteMercado = {
  dominio: "criptoya.com",
  url: "https://criptoya.com/api",
  title: "CriptoYa API",
};
const FUENTE_BCRA_CAMB: FuenteMercado = {
  dominio: "api.bcra.gob.ar",
  url: "https://api.bcra.gob.ar/estadisticascambiarias/v1.0",
  title: "BCRA — Estadísticas Cambiarias",
};
const FUENTE_BCRA_MON: FuenteMercado = {
  dominio: "api.bcra.gob.ar",
  url: "https://api.bcra.gob.ar/estadisticas/v4.0",
  title: "BCRA — Estadísticas Monetarias v4",
};

async function jsonConTimeout<T>(
  url: string,
  headers?: HeadersInit,
  timeout = 9000,
): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0", ...(headers ?? {}) },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function nf(n: number | null | undefined, dec = 2): string {
  return typeof n === "number" && isFinite(n)
    ? new Intl.NumberFormat("es-AR", { maximumFractionDigits: dec }).format(n)
    : "s/d";
}

// ---------------------------------------------------------------------------
// yfinance (método AF: cookie + crumb)
// ---------------------------------------------------------------------------

const MODULOS_VALIDOS = new Set([
  "assetProfile",
  "summaryDetail",
  "financialData",
  "defaultKeyStatistics",
  "price",
  "incomeStatementHistory",
  "balanceSheetHistory",
  "cashflowStatementHistory",
  "earnings",
  "earningsHistory",
  "earningsTrend",
  "calendarEvents",
  "recommendationTrend",
  "upgradeDowngradeHistory",
  "majorHoldersBreakdown",
  "institutionOwnership",
  "insiderHolders",
  "insiderTransactions",
  "secFilings",
]);

type YSummary = {
  quoteSummary?: {
    result?: Array<Record<string, unknown>>;
    error?: { description?: string } | null;
  };
};

/** Aplana un valor estilo Yahoo ({raw,fmt}) a número o string legible. */
function plano(v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    const raw = o["raw"];
    if (typeof raw === "number" || typeof raw === "string") return raw;
    const fmt = o["fmt"];
    if (typeof fmt === "string") return fmt;
  }
  return v;
}

export async function yfinanceConsulta(simbolo: string, modulo: string): Promise<ResultadoFuente> {
  const sym = simbolo.trim().slice(0, 24);
  if (!sym) return { texto: "SIN RESULTADOS: falta el símbolo.", fuentes: [FUENTE_YF] };

  if (modulo === "search") {
    const r = await fetchYahooSearch(sym);
    const quotes = r?.quotes?.slice(0, 8) ?? [];
    if (!quotes.length)
      return { texto: `SIN RESULTADOS de búsqueda para "${sym}".`, fuentes: [FUENTE_YF] };
    return {
      texto: `Resultados de búsqueda Yahoo Finance para "${sym}":\n${quotes
        .map(
          (q) =>
            `- ${q.symbol} · ${q.longname || q.shortname || "s/d"} · ${q.quoteType ?? ""} ${q.exchDisp ?? q.exchange ?? ""}`,
        )
        .join("\n")}`,
      fuentes: [FUENTE_YF],
    };
  }

  if (modulo === "news") {
    type YNews = { news?: Array<{ title?: string; publisher?: string; link?: string }> };
    const r = await jsonConTimeout<YNews>(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=0&newsCount=8`,
      yahooHeaders(),
    );
    const items = r?.news?.slice(0, 8) ?? [];
    if (!items.length)
      return {
        texto: `SIN RESULTADOS: sin noticias de Yahoo para "${sym}".`,
        fuentes: [FUENTE_YF],
      };
    return {
      texto: `Noticias de Yahoo Finance sobre ${sym}:\n${items
        .map(
          (n) =>
            `- ${n.title ?? "s/d"} (${n.publisher ?? "s/d"}) ${n.link ? `[link](${n.link})` : ""}`,
        )
        .join("\n")}`,
      fuentes: [FUENTE_YF],
    };
  }

  if (modulo === "history" || modulo === "chart") {
    const chart = await fetchYahooChart(sym, "6mo", "1d");
    const res = chart?.chart?.result?.[0];
    const closes = (res?.indicators?.quote?.[0]?.close ?? []).filter(
      (c): c is number => typeof c === "number",
    );
    const ts = res?.timestamp ?? [];
    if (!closes.length)
      return {
        texto: `SIN RESULTADOS: sin histórico de precios para "${sym}".`,
        fuentes: [FUENTE_YF],
      };
    const meta = res?.meta ?? {};
    const puntos: SeriePunto[] = ts
      .map((t, i) => ({
        f: new Date(t * 1000).toISOString().slice(0, 10),
        v: closes[i]!,
      }))
      .filter((p) => typeof p.v === "number");
    const ultimo = closes[closes.length - 1]!;
    const previo = meta.chartPreviousClose ?? closes[0];
    const varPct = previo ? ((ultimo - previo) / previo) * 100 : 0;
    return {
      texto: `Histórico ${sym} (Yahoo Finance, 6 meses, cierre diario): último ${nf(ultimo)}, variación del período ${nf(varPct)}%, mínimo ${nf(Math.min(...closes))}, máximo ${nf(Math.max(...closes))}, moneda ${meta.currency ?? "s/d"}.`,
      fuentes: [FUENTE_YF],
      serie: {
        titulo: `${meta.longName || meta.shortName || sym}`,
        ...(meta.currency ? { unidad: meta.currency } : {}),
        puntos,
      },
    };
  }

  // quoteSummary por módulo(s)
  const modulos = modulo
    .split(",")
    .map((m) => m.trim())
    .filter((m) => MODULOS_VALIDOS.has(m));
  const lista = modulos.length ? modulos.slice(0, 4) : ["price", "summaryDetail", "financialData"];
  const r = await fetchYahooQuoteSummaryJson<YSummary>(sym, lista);
  if (!r.json)
    return {
      texto: `SIN RESULTADOS: Yahoo no devolvió datos para "${sym}" (HTTP ${r.status}).`,
      fuentes: [FUENTE_YF],
    };
  const result = r.json.quoteSummary?.result?.[0];
  if (!result)
    return {
      texto: `SIN RESULTADOS: ${r.json.quoteSummary?.error?.description ?? "sin datos"} para "${sym}".`,
      fuentes: [FUENTE_YF],
    };
  const lineas: string[] = [`Datos de Yahoo Finance para ${sym} (módulos: ${lista.join(", ")}):`];
  for (const [clave, valor] of Object.entries(result)) {
    if (!valor || typeof valor !== "object") continue;
    const entradas = Object.entries(valor as Record<string, unknown>)
      .slice(0, 18)
      .map(([k, v]) => {
        const p = plano(v);
        const val =
          typeof p === "number"
            ? nf(p, Math.abs(p) < 10 ? 4 : 2)
            : typeof p === "string"
              ? p
              : Array.isArray(p)
                ? `[${p.length} ítems]`
                : "—";
        return `  · ${k}: ${val}`;
      });
    lineas.push(`- ${clave}:\n${entradas.join("\n")}`);
  }
  return { texto: lineas.join("\n").slice(0, 6000), fuentes: [FUENTE_YF] };
}

// ---------------------------------------------------------------------------
// ArgentinaDatos
// ---------------------------------------------------------------------------

const AD_PATHS = [
  /^\/v1\/feriados\/\d{4}$/,
  /^\/v1\/cotizaciones\/dolares$/,
  /^\/v1\/cotizaciones\/dolares\/(oficial|blue|bolsa|contadoconliqui|cripto|mayorista|solidario|turista)$/,
  /^\/v1\/cotizaciones\/dolares\/(oficial|blue|bolsa|contadoconliqui|cripto|mayorista|solidario|turista)\/[\d/]{8,10}$/,
  /^\/v1\/eventos\/presidenciales$/,
  /^\/v1\/finanzas\/indices\/inflacion$/,
  /^\/v1\/finanzas\/indices\/inflacionInteranual$/,
  /^\/v1\/finanzas\/indices\/uva$/,
  /^\/v1\/finanzas\/indices\/riesgo-pais$/,
  /^\/v1\/finanzas\/indices\/riesgo-pais\/ultimo$/,
  /^\/v1\/finanzas\/tasas\/plazoFijo$/,
  /^\/v1\/finanzas\/tasas\/plazoFijoUvaPagoPeriodico$/,
  /^\/v1\/finanzas\/tasas\/depositos30Dias$/,
  /^\/v1\/finanzas\/criptopesos$/,
  /^\/v1\/finanzas\/letras$/,
  /^\/v1\/finanzas\/creditos\/hipotecariosUva$/,
  /^\/v1\/finanzas\/fci\/(mercadoDinero|rentaVariable|rentaFija|rentaMixta|otros)\/(ultimo|penultimo|\d{4}\/\d{2}\/\d{2})$/,
  /^\/v1\/finanzas\/rendimientos$/,
  /^\/v1\/finanzas\/rendimientos\/(nexo|fiwind|letsbit|belo|lemoncash|ripio|satoshitango|lucamoney|decrypto)$/,
  /^\/v1\/presidentes$/,
  /^\/v1\/estado$/,
];

export async function argentinaDatosConsulta(path: string): Promise<ResultadoFuente> {
  const ruta = path.startsWith("/") ? path : `/${path}`;
  if (!AD_PATHS.some((re) => re.test(ruta))) {
    return {
      texto: `SIN RESULTADOS: el endpoint "${ruta}" no está en la lista blanca de ArgentinaDatos. Endpoints válidos: cotizaciones/dolares[/casa][/fecha], finanzas/indices/{inflacion,inflacionInteranual,uva,riesgo-pais[,/ultimo]}, finanzas/tasas/{plazoFijo,plazoFijoUvaPagoPeriodico,depositos30Dias}, finanzas/criptopesos, finanzas/letras, finanzas/creditos/hipotecariosUva, finanzas/fci/{mercadoDinero,rentaVariable,rentaFija,rentaMixta,otros}/{ultimo|penultimo|YYYY/MM/DD}, finanzas/rendimientos[/entidad], feriados/{año}.`,
      fuentes: [FUENTE_AD],
    };
  }
  const data = await jsonConTimeout<unknown>(`https://api.argentinadatos.com${ruta}`);
  if (data == null)
    return {
      texto: `SIN RESULTADOS: ArgentinaDatos no respondió para ${ruta}.`,
      fuentes: [FUENTE_AD],
    };

  // Series numéricas [{fecha, valor}] → texto + serie para graficar.
  if (Array.isArray(data) && data.length && typeof data[0] === "object") {
    const arr = data as Array<Record<string, unknown>>;
    const conValor = arr.filter((x) => typeof x["valor"] === "number");
    if (conValor.length > 3) {
      const puntos: SeriePunto[] = conValor
        .map((x) => ({ f: String(x["fecha"] ?? ""), v: x["valor"] as number }))
        .slice(-180);
      const ult = puntos[puntos.length - 1]!;
      const ant = puntos[puntos.length - 2];
      return {
        texto: `ArgentinaDatos ${ruta}: último valor ${nf(ult.v)}${ult.f ? ` (${ult.f})` : ""}${ant ? `, anterior ${nf(ant.v)}` : ""}. Total ${conValor.length} observaciones.`,
        fuentes: [FUENTE_AD],
        serie: { titulo: ruta.split("/").filter(Boolean).join(" "), puntos },
      };
    }
  }
  const texto = JSON.stringify(data).slice(0, 5000);
  return { texto: `ArgentinaDatos ${ruta}:\n${texto}`, fuentes: [FUENTE_AD] };
}

// ---------------------------------------------------------------------------
// CriptoYa
// ---------------------------------------------------------------------------

export async function criptoyaConsulta(recurso: string): Promise<ResultadoFuente> {
  const limpio = recurso.replace(/^\/+/, "").trim();
  if (!limpio || limpio.length > 120 || !/^[\w\d\-/]+$/.test(limpio)) {
    return {
      texto:
        'SIN RESULTADOS: recurso CriptoYa inválido. Ejemplos válidos: "dolar", "dolar/blue", "belo/BTC/ARS", "lemoncash/USDT/ARS", "ripio/ETH/USD".',
      fuentes: [FUENTE_CY],
    };
  }
  const data = await jsonConTimeout<unknown>(`https://criptoya.com/api/${limpio}`);
  if (data == null)
    return { texto: `SIN RESULTADOS: CriptoYa no respondió para ${limpio}.`, fuentes: [FUENTE_CY] };
  const texto = JSON.stringify(data).slice(0, 4000);
  return { texto: `CriptoYa ${limpio}:\n${texto}`, fuentes: [FUENTE_CY] };
}

// ---------------------------------------------------------------------------
// BCRA Estadísticas Cambiarias v1.0
// ---------------------------------------------------------------------------

export async function bcraCambiariasConsulta(
  accion: string,
  params: {
    codMoneda?: string | undefined;
    fechaDesde?: string | undefined;
    fechaHasta?: string | undefined;
    limit?: number | undefined;
  } = {},
): Promise<ResultadoFuente> {
  let url = "";
  if (accion === "divisas") {
    url = "https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Maestros/Divisas";
  } else if (accion === "cotizaciones") {
    const p = new URLSearchParams();
    if (params.fechaDesde) p.set("fechaDesde", params.fechaDesde);
    if (params.fechaHasta) p.set("fechaHasta", params.fechaHasta);
    if (params.limit) p.set("limit", String(params.limit));
    url = `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones${p.toString() ? `?${p}` : ""}`;
  } else if (accion === "cotizacion_moneda" && params.codMoneda) {
    const p = new URLSearchParams();
    if (params.fechaDesde) p.set("fechaDesde", params.fechaDesde);
    if (params.fechaHasta) p.set("fechaHasta", params.fechaHasta);
    if (params.limit) p.set("limit", String(params.limit));
    url = `https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones/${encodeURIComponent(params.codMoneda.toUpperCase())}${p.toString() ? `?${p}` : ""}`;
  } else {
    return {
      texto:
        'SIN RESULTADOS: acción inválida. Usá "divisas" (maestro de monedas), "cotizaciones" (todas a una fecha) o "cotizacion_moneda" con codMoneda (ej. USD, EUR).',
      fuentes: [FUENTE_BCRA_CAMB],
    };
  }

  const data = await jsonConTimeout<{
    status?: number;
    results?: unknown;
    errorMessages?: string[];
  }>(url);
  if (data == null)
    return { texto: "SIN RESULTADOS: la API del BCRA no respondió.", fuentes: [FUENTE_BCRA_CAMB] };
  if (data.errorMessages?.length)
    return {
      texto: `SIN RESULTADOS: BCRA respondió: ${data.errorMessages.join("; ")}`,
      fuentes: [FUENTE_BCRA_CAMB],
    };

  // Serie histórica de una moneda → texto + gráfico.
  const results = data.results as
    | Array<{
        fecha?: string;
        detalle?: Array<{ codigoMoneda?: string; tipoCotizacion?: number; descripcion?: string }>;
      }>
    | undefined;
  if (Array.isArray(results) && results.length && results[0]?.detalle) {
    const puntos: SeriePunto[] = [];
    const lineas: string[] = [];
    for (const r of results.slice(-90)) {
      for (const d of r.detalle ?? []) {
        if (typeof d.tipoCotizacion === "number") {
          puntos.push({ f: String(r.fecha ?? ""), v: d.tipoCotizacion });
          lineas.push(`- ${r.fecha}: ${d.codigoMoneda ?? ""} $${nf(d.tipoCotizacion, 2)}`);
        }
      }
    }
    const ult = puntos[puntos.length - 1];
    return {
      texto: `BCRA Estadísticas Cambiarias (${params.codMoneda ?? "todas"}):\n${
        ult ? `Última cotización: $${nf(ult.v, 2)} al ${ult.f}.` : lineas.slice(0, 20).join("\n")
      }\n${lineas.slice(-12).join("\n")}`,
      fuentes: [FUENTE_BCRA_CAMB],
      ...(puntos.length > 3
        ? {
            serie: { titulo: `Cotización ${params.codMoneda ?? ""} (BCRA)`, unidad: "ARS", puntos },
          }
        : {}),
    };
  }

  return {
    texto: `BCRA Estadísticas Cambiarias:\n${JSON.stringify(data.results ?? data).slice(0, 4000)}`,
    fuentes: [FUENTE_BCRA_CAMB],
  };
}

// ---------------------------------------------------------------------------
// BCRA Estadísticas Monetarias v4.0
// ---------------------------------------------------------------------------

export async function bcraMonetariasConsulta(
  accion: string,
  params: {
    idVariable?: number | undefined;
    desde?: string | undefined;
    hasta?: string | undefined;
    limit?: number | undefined;
    categoria?: string | undefined;
  } = {},
): Promise<ResultadoFuente> {
  const token = process.env["BCRA_TOKEN"];
  const headers: HeadersInit | undefined = token ? { Authorization: `BEARER ${token}` } : undefined;

  if (accion === "principales_variables" || accion === "variables") {
    const data = await jsonConTimeout<{
      status?: number;
      results?: Array<{
        idVariable?: number;
        descripcion?: string;
        categoria?: string;
        periodicidad?: string;
        ultValorInformado?: number;
        ultFechaInformada?: string;
      }>;
    }>("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias?limit=300", headers);
    const vars = data?.results ?? [];
    if (!vars.length)
      return {
        texto:
          "SIN RESULTADOS: la API de variables monetarias del BCRA no devolvió datos (si tu IP requiere token, configurá BCRA_TOKEN).",
        fuentes: [FUENTE_BCRA_MON],
      };
    const filtro = params.categoria?.toLowerCase().trim();
    const filtradas = filtro
      ? vars.filter(
          (v) =>
            v.descripcion?.toLowerCase().includes(filtro) ||
            v.categoria?.toLowerCase().includes(filtro),
        )
      : vars;
    const top = (filtradas.length ? filtradas : vars).slice(0, 40);
    return {
      texto: `Variables monetarias BCRA v4 (${filtradas.length ? `${filtradas.length} coincidencias de` : "primeras"} ${vars.length}):\n${top
        .map(
          (v) =>
            `- [${v.idVariable}] ${v.descripcion} · ${v.categoria ?? ""} · último ${nf(v.ultValorInformado)} (${v.ultFechaInformada ?? "s/d"})`,
        )
        .join(
          "\n",
        )}\nPara la serie histórica usá bcra_monetarias con acción "datos" y el idVariable.`,
      fuentes: [FUENTE_BCRA_MON],
    };
  }

  if (accion === "datos" && params.idVariable != null) {
    const p = new URLSearchParams();
    if (params.desde) p.set("Desde", params.desde);
    if (params.hasta) p.set("Hasta", params.hasta);
    p.set("Limit", String(params.limit ?? 200));
    const data = await jsonConTimeout<{
      status?: number;
      results?: Array<{ idVariable?: number; detalle?: Array<{ fecha?: string; valor?: number }> }>;
      errorMessages?: string[];
    }>(
      `https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${params.idVariable}?${p.toString()}`,
      headers,
    );
    if (data == null)
      return { texto: "SIN RESULTADOS: la API del BCRA no respondió.", fuentes: [FUENTE_BCRA_MON] };
    if (data.errorMessages?.length)
      return {
        texto: `SIN RESULTADOS: BCRA respondió: ${data.errorMessages.join("; ")}`,
        fuentes: [FUENTE_BCRA_MON],
      };
    const detalle = data.results?.[0]?.detalle ?? [];
    if (!detalle.length)
      return {
        texto: `SIN RESULTADOS: sin datos para la variable ${params.idVariable}.`,
        fuentes: [FUENTE_BCRA_MON],
      };
    const puntos: SeriePunto[] = detalle
      .filter((d) => typeof d.valor === "number")
      .map((d) => ({ f: String(d.fecha ?? ""), v: d.valor as number }));
    const ult = puntos[puntos.length - 1]!;
    return {
      texto: `Serie BCRA variable ${params.idVariable}: último valor ${nf(ult.v)} (${ult.f}). ${puntos.length} observaciones.`,
      fuentes: [FUENTE_BCRA_MON],
      serie: { titulo: `Variable BCRA ${params.idVariable}`, puntos },
    };
  }

  return {
    texto:
      'SIN RESULTADOS: acción inválida. Usá "principales_variables" (listado con idVariable) o "datos" con idVariable.',
    fuentes: [FUENTE_BCRA_MON],
  };
}

export { FUENTE_IOL as fuenteIOLCompartida };
