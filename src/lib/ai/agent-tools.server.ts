// Herramientas para el agente autónomo. Server-only.
// Cada herramienta recibe parámetros y devuelve string (resultado legible).
import "./env.server";

import { searchWeb, readWebPage, buildWebBlock } from "./web.server";
import { runSandbox } from "./sandbox.server";
import { searchLibrary } from "./context-library.server";
import {
  sendTelegramMessage as _sendTelegramMessage,
  sendTelegramSignal as _sendTelegramSignal,
  telegramGetBotInfo as _telegramGetBotInfo,
  telegramGetUpdates as _telegramGetUpdates,
} from "@/lib/telegram.server";

const IS_WIN = process.platform === "win32";
const MAX_OUT = 8_000;

//  run_command 

export type ToolRunCommandArgs = { command: string };

export async function toolRunCommand(args: ToolRunCommandArgs): Promise<string> {
  try {
    const { execSync } = await import("node:child_process");
    const stdout = execSync(args.command, {
      encoding: "utf-8",
      timeout: 60_000,
      shell: IS_WIN ? "powershell" : "/bin/bash",
      maxBuffer: MAX_OUT * 2,
    });
    const result = stdout || "(sin salida)";
    return result.length > MAX_OUT ? result.slice(0, MAX_OUT) + "\n...[truncado]" : result;
  } catch (e: any) {
    if (e.stdout) return `[OK, pero con warnings]:\n${e.stdout.slice(0, MAX_OUT)}`;
    return `[ERROR]: ${e.message?.slice(0, 500) ?? String(e)}`;
  }
}

//  read_file 

export type ToolReadFileArgs = { path: string; range_?: string };

export async function toolReadFile(args: ToolReadFileArgs): Promise<string> {
  try {
    const fs = await import("node:fs");
    if (!fs.existsSync(args.path)) return `[ERROR: no existe: ${args.path}]`;
    const text = fs.readFileSync(args.path, "utf-8");
    if (!args.range_) return text.slice(0, MAX_OUT) + (text.length > MAX_OUT ? "\n...[truncado]" : "");
    const [s, e] = args.range_.split("-").map(Number);
    const lines = text.split("\n");
    const snippet = lines.slice((s || 1) - 1, e || lines.length).join("\n");
    return snippet || "(rango vacío)";
  } catch (e: any) {
    return `[ERROR leyendo archivo]: ${e.message ?? String(e)}`;
  }
}

//  write_file 

export type ToolWriteFileArgs = { path: string; content: string; append?: boolean };

export async function toolWriteFile(args: ToolWriteFileArgs): Promise<string> {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.dirname(args.path);
    if (dir) fs.mkdirSync(dir, { recursive: true });
    if (args.append) {
      fs.appendFileSync(args.path, args.content, "utf-8");
      return `[OK: ${args.content.length} chars añadidos a ${args.path}]`;
    }
    fs.writeFileSync(args.path, args.content, "utf-8");
    return `[OK: ${args.content.length} chars escritos en ${args.path}]`;
  } catch (e: any) {
    return `[ERROR escribiendo archivo]: ${e.message ?? String(e)}`;
  }
}

//  browse_filesystem 

export type ToolBrowseFsArgs = { path: string };

export async function toolBrowseFilesystem(args: ToolBrowseFsArgs): Promise<string> {
  try {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const base = path.resolve(args.path);
    if (!fs.existsSync(base)) return `[ERROR: no existe: ${base}]`;
    const stat = fs.statSync(base);
    if (!stat.isDirectory()) {
      return `[FILE] ${base} (${stat.size} bytes)`;
    }
    const entries = fs.readdirSync(base, { withFileTypes: true });
    const lines = entries.map((e) => {
      const full = path.join(base, e.name);
      let s = e.isDirectory() ? "" : "";
      try {
        const st = fs.statSync(full);
        s += e.isDirectory() ? "" : ` (${st.size.toLocaleString()} B)`;
      } catch {}
      return `  ${s} ${e.name}`;
    });
    return ` ${base}\n${lines.slice(0, 120).join("\n")}${entries.length > 120 ? `\n  ... y ${entries.length - 120} más` : ""}`;
  } catch (e: any) {
    return `[ERROR explorando]: ${e.message ?? String(e)}`;
  }
}

//  supabase_storage_list 

export type ToolSupaListArgs = { prefix?: string };

export async function toolSupaStorageList(args: ToolSupaListArgs): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    const { data, error } = await supabaseAdmin.storage.from("clarity-data").list(args.prefix ?? "");
    if (error) return `[ERROR]: ${error.message}`;
    if (!data?.length) return "(sin archivos)";
    return data
      .map((f: any) => `  ${f.name.padEnd(55)} ${(f.metadata?.size ?? 0).toLocaleString()} B`)
      .join("\n");
  } catch (e: any) {
    return `[ERROR]: ${e.message ?? String(e)}`;
  }
}

//  supabase_storage_text 

export type ToolSupaTextArgs = { path: string };

export async function toolSupaStorageText(args: ToolSupaTextArgs): Promise<string> {
  try {
    const supaUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    if (!supaUrl) return "[ERROR: SUPABASE_URL no configurada]";
    const pubBase = `${supaUrl.replace(/\/+$/, "")}/storage/v1/object/public/clarity-data`;
    const res = await fetch(`${pubBase}/${args.path}`, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) return `[ERROR HTTP ${res.status}]: ${await res.text().catch(() => "?")}`;
    const text = await res.text();
    return text.length > MAX_OUT ? text.slice(0, MAX_OUT) + "\n...[truncado]" : text;
  } catch (e: any) {
    return `[ERROR descargando ${args.path}]: ${e.message ?? String(e)}`;
  }
}

//  web_search 

export type ToolWebSearchArgs = { query: string; limit?: number };

export async function toolWebSearch(args: ToolWebSearchArgs): Promise<string> {
  try {
    const results = await searchWeb(args.query, args.limit ?? 6);
    if (!results?.length) return "(sin resultados)";
    return buildWebBlock(results);
  } catch (e: any) {
    return `[ERROR buscando web]: ${e.message ?? String(e)}`;
  }
}

//  web_read_page 

export type ToolWebReadArgs = { url: string; maxChars?: number };

export async function toolWebReadPage(args: ToolWebReadArgs): Promise<string> {
  try {
    return await readWebPage(args.url, args.maxChars ?? 10_000);
  } catch (e: any) {
    return `[ERROR leyendo página]: ${e.message ?? String(e)}`;
  }
}

//  sandbox 

export type ToolSandboxArgs = { code: string; files?: Array<{ name: string; kind: string; text: string }> };

export async function toolSandbox(args: ToolSandboxArgs): Promise<string> {
  try {
    const result = await runSandbox({
      code: args.code,
      files: args.files ?? [],
      language: "javascript",
    });
    if (!result.ok) return `[SANDBOX ERROR]: ${result.error}`;
    const parts: string[] = [];
    if (result.logs?.length) parts.push(`[LOGS]\n${result.logs.join("\n").slice(0, 3000)}`);
    if (result.output) parts.push(`[OUTPUT]\n${result.output.slice(0, 3000)}`);
    if (result.tables?.length) parts.push(`[TABLES]\n${JSON.stringify(result.tables, null, 2).slice(0, 3000)}`);
    return parts.join("\n\n") || "(sin output)";
  } catch (e: any) {
    return `[ERROR sandbox]: ${e.message ?? String(e)}`;
  }
}

//  context_library_search 

export type ToolLibSearchArgs = { query: string; limit?: number };

export async function toolLibSearch(args: ToolLibSearchArgs): Promise<string> {
  try {
    const results = await searchLibrary(args.query, args.limit ?? 4);
    if (!results?.length) return "(sin coincidencias en la biblioteca de contexto)";
    return results
      .slice(0, args.limit ?? 4)
      .map((r) => `[${r.title}] (${r.path})\n${r.text.slice(0, 1200)}`)
      .join("\n\n---\n\n");
  } catch (e: any) {
    return `[ERROR buscando en biblioteca]: ${e.message ?? String(e)}`;
  }
}

//  financial_query 
// Consulta los endpoints del backend Flask de análisis financiero.
// Flask corre en http://localhost:5000, sirve datos de yfinance, IOL, BCRA, etc.

const FLASK_URL = process.env.FLASK_API_URL || "http://localhost:5000";
let flaskOk: boolean | null = null; // cache de health check por sesion
let flaskChecking = false;
let flaskCheckProm: Promise<boolean> | null = null;

async function checkFlask(): Promise<boolean> {
  if (flaskOk !== null) return flaskOk;
  if (flaskChecking && flaskCheckProm) return flaskCheckProm;
  flaskChecking = true;
  flaskCheckProm = (async () => {
    try {
      await fetch(`${FLASK_URL}/health`, { signal: AbortSignal.timeout(1_500) });
      flaskOk = true;
    } catch {
      flaskOk = false;
    }
    flaskChecking = false;
    return flaskOk;
  })();
  return flaskCheckProm;
}

export type ToolFinancialQueryArgs = {
  endpoint: string;
  params?: Record<string, any>;
};

export async function toolFinancialQuery(args: ToolFinancialQueryArgs): Promise<string> {
  const endpoint = args.endpoint.replace(/^\//, "");
  const url = `${FLASK_URL}/${endpoint}`;
  try {
    // Health check cacheado (solo 1 vez por sesion, 1.5s)
    const ok = await checkFlask();
    if (!ok) return `[FLASK NO DISPONIBLE] Servidor Flask en ${FLASK_URL} no responde. Ejecutá 'python server/server.py'. Usá fetch_stock_data, search_web o run_sandbox como alternativa.`;
    if (args.params && Object.keys(args.params).length > 0) {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(args.params),
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return `[ERROR ${res.status}]: ${await res.text().catch(() => "?")}`;
      const text = await res.text();
      return text.length > MAX_OUT ? text.slice(0, MAX_OUT) + "\n...[truncado]" : text;
    }
    const qs = endpoint.includes("?") ? "" : "?";
    const fullUrl = args.params ? `${url}${qs}${new URLSearchParams(args.params as any).toString()}` : url;
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return `[ERROR ${res.status}]: ${await res.text().catch(() => "?")}`;
    const text = await res.text();
    return text.length > MAX_OUT ? text.slice(0, MAX_OUT) + "\n...[truncado]" : text;
  } catch (e: any) {
    return `[ERROR consultando Flask (${url})]: ${e.message ?? String(e)}`;
  }
}

//  telegram — coronar_inversiones_bot

export type ToolTelegramSignalArgs = {
  ticker: string;
  senal: string;
  precio?: number;
  variacion1d?: number;
  motivo?: string;
  nivel?: string;
  chatId?: string;
};

export async function toolTelegramSignal(args: ToolTelegramSignalArgs): Promise<string> {
  if (!args.ticker?.trim() || !args.senal?.trim()) return "[TELEGRAM ERROR] ticker y senal son obligatorios";
  return _sendTelegramSignal({
    ticker: args.ticker,
    senal: args.senal,
    precio: args.precio ?? null,
    variacion1d: args.variacion1d ?? null,
    motivo: args.motivo,
    nivel: args.nivel,
    chatId: args.chatId,
  });
}

export type ToolTelegramMessageArgs = { text: string; chatId?: string };

export async function toolTelegramMessage(args: ToolTelegramMessageArgs): Promise<string> {
  if (!args.text?.trim()) return "[TELEGRAM ERROR] text es obligatorio";
  return _sendTelegramMessage({ text: args.text, chatId: args.chatId, parseMode: "HTML" });
}

export async function toolTelegramInfo(): Promise<string> {
  const info = await _telegramGetBotInfo();
  const updates = await _telegramGetUpdates();
  return `${info}\n---\n${updates}`;
}

//  fetch_stock_data 
// Obtiene datos de Yahoo Finance directamente (sin depender del servidor Flask).

export type ToolStockDataArgs = { ticker: string; period?: string };

export async function toolStockData(args: ToolStockDataArgs): Promise<string> {
  try {
    const ticker = args.ticker.toUpperCase().trim();
    // Intentar con yahoo-finance2 si está instalado
    try {
      const yfMod = await import("yahoo-finance2");
      const yf = typeof yfMod.default === "function" ? new (yfMod.default as any)() : yfMod;
      try { yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]); } catch { /* noop */ }

      const quote = await yf.quote(ticker);
      const summary = await yf.quoteSummary(ticker, {
        modules: ["price", "summaryDetail", "financialData", "defaultKeyStatistics"],
      }).catch(() => null);

      const lines: string[] = [`=== ${ticker} ===`];
      if (quote?.regularMarketPrice != null) {
        lines.push(`Precio: $${quote.regularMarketPrice.toFixed(2)}`);
        lines.push(`Variacion: ${quote.regularMarketChangePercent != null ? (quote.regularMarketChangePercent * 100).toFixed(2) + "%" : "N/A"}`);
        lines.push(`Volumen: ${quote.regularMarketVolume?.toLocaleString() ?? "N/A"}`);
      }
      if (summary?.summaryDetail) {
        const sd = summary.summaryDetail;
        lines.push(`Maximo 52sem: $${sd.fiftyTwoWeekHigh ?? "N/A"}`);
        lines.push(`Minimo 52sem: $${sd.fiftyTwoWeekLow ?? "N/A"}`);
        if (sd.trailingPE) lines.push(`P/E: ${sd.trailingPE.toFixed(2)}`);
        if (sd.forwardPE) lines.push(`P/E Forward: ${sd.forwardPE.toFixed(2)}`);
        if (sd.marketCap) lines.push(`Market Cap: $${(sd.marketCap / 1e9).toFixed(2)}B`);
        if (sd.beta) lines.push(`Beta: ${sd.beta.toFixed(2)}`);
        if (sd.dividendYield) lines.push(`Dividend Yield: ${(sd.dividendYield * 100).toFixed(2)}%`);
      }
      if (summary?.financialData) {
        const fd = summary.financialData;
        if (fd.targetMeanPrice) lines.push(`Target Precio: $${fd.targetMeanPrice.toFixed(2)}`);
        if (fd.recommendationMean) {
          const recMap: Record<string, string> = { "1": "Compra Fuerte", "2": "Comprar", "3": "Mantener", "4": "Vender", "5": "Venta Fuerte" };
          lines.push(`Consenso: ${recMap[String(Math.round(fd.recommendationMean))] ?? fd.recommendationMean}`);
        }
        if (fd.returnOnEquity != null) lines.push(`ROE: ${(fd.returnOnEquity * 100).toFixed(1)}%`);
        if (fd.revenueGrowth != null) lines.push(`Crecimiento Ingresos: ${(fd.revenueGrowth * 100).toFixed(1)}%`);
        if (fd.profitMargins != null) lines.push(`Margen Neto: ${(fd.profitMargins * 100).toFixed(1)}%`);
        if (fd.freeCashflow != null) lines.push(`Free Cash Flow: $${(fd.freeCashflow / 1e9).toFixed(2)}B`);
      }
      return lines.join("\n");
    } catch {
      // Fallback: fetch directo de Yahoo Finance API
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1mo&interval=1d`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) return `[ERROR]: Yahoo Finance no responde para ${ticker}`;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (!meta) return `[ERROR]: no se encontraron datos para ${ticker}`;
      return [
        `=== ${ticker} ===`,
        `Precio actual: $${meta.regularMarketPrice?.toFixed(2) ?? "N/A"}`,
        `Previo cierre: $${meta.previousClose?.toFixed(2) ?? "N/A"}`,
        `Maximo: $${meta.chartPreviousClose?.toFixed(2) ?? "N/A"}`,
      ].join("\n");
    }
  } catch (e: any) {
    return `[ERROR obteniendo datos de ${args.ticker}]: ${e.message?.slice(0, 300) ?? String(e)}`;
  }
}

export async function toolCierreMercado(): Promise<string> {
  try {
    const { getCierreMercadoDashboard } = await import("@/lib/cierre-mercado.functions");
    const data: any = await (getCierreMercadoDashboard as unknown as () => Promise<any>)();
    const resumen = [
      `=== CIERRE ${data.fechaCierre} (${data.timestamp.slice(0, 10)}) ===`,
      `Indices: ${data.indices.map((i: any) => `${i.ticker} ${i.hoy != null ? (i.hoy > 0 ? "+" : "") + i.hoy.toFixed(2) + "%" : "--"}`).join(" | ")}`,
      `Sectores top HOY: ${data.sectores.slice(0, 3).map((s: any) => `${s.nombre}:${s.hoy != null ? s.hoy.toFixed(1) + "%" : "--"}`).join(", ")} | peor: ${data.sectores.slice(-2).map((s: any) => `${s.nombre}:${s.hoy != null ? s.hoy.toFixed(1) + "%" : "--"}`).join(", ")}`,
      `Ganadores: ${data.ganadores.map((g: any) => `${g.symbol}(${g.percentChange != null ? g.percentChange.toFixed(1) + "%" : "--"})`).join(", ") || "--"}`,
      `Perdedores: ${data.perdedores.map((p: any) => `${p.symbol}(${p.percentChange != null ? p.percentChange.toFixed(1) + "%" : "--"})`).join(", ") || "--"}`,
      `Tasas: ${data.tasas.map((t: any) => `${t.ticker}:${t.valor != null ? t.valor.toFixed(2) : "--"}(${t.variacion != null ? t.variacion.toFixed(1) + "%" : "--"})`).join(" | ")}`,
      `Commodities: ${data.commodities.map((c: any) => `${c.ticker}:${c.hoy != null ? c.hoy.toFixed(1) + "%" : "--"}`).join(", ")}`,
    ].join("\n");
    return resumen + "\n\nJSON (truncado):\n" + JSON.stringify(data, null, 1).slice(0, 7500);
  } catch (e: any) {
    return `[ERROR cierre_mercado]: ${e?.message?.slice(0, 500) ?? String(e)}`;
  }
}

export async function toolInformeMatutino(args: { fecha?: string }): Promise<string> {
  try {
    const { buildMarketSnapshot } = await import("@/lib/informe-matutino/snapshot.functions");
    const snapshot: any = await (buildMarketSnapshot as unknown as () => Promise<any>)();
    let iaPart = "";
    try {
      const { generateInformeMatutino } = await import("@/lib/informe-matutino/gemini.functions");
      const ia: any = await (generateInformeMatutino as unknown as (s: any) => Promise<any>)(snapshot);
      if (ia) iaPart = `\n\n--- NARRATIVA IA ---\nHumor: ${ia.humorMercado}\nResumen: ${ia.resumenEjecutivo}\nRadar Int: ${ia.radarInternacional?.titular} — ${ia.radarInternacional?.bullets?.join(" | ")}\nRadar Local: ${ia.radarLocal?.titular} — ${ia.radarLocal?.bullets?.join(" | ")}`;
      else iaPart = "\n\n[IA no disponible: falta GEMINI_API_KEY o error del modelo]";
    } catch (e: any) {
      iaPart = `\n\n[IA error: ${e?.message?.slice(0, 300) ?? String(e)}]`;
    }
    const agendaResumen = `Agenda: ${snapshot.agendaDelDia?.map((a: any) => `${a.hora} ${a.evento} (${a.relevancia})`).join(" | ") || "--"}`;
    return `=== INFORME MATUTINO ${snapshot.fecha} ===\n${agendaResumen}\nDolares oficial/blue/MEP/CCL: ${snapshot.local?.dolares?.oficial}/${snapshot.local?.dolares?.blue}/${snapshot.local?.dolares?.mep}/${snapshot.local?.dolares?.ccl} Brecha ${snapshot.local?.dolares?.brechaCCLPct?.toFixed(1)}%\nRiesgo país: ${snapshot.local?.riesgoPais?.valor} (${snapshot.local?.riesgoPais?.variacionPuntos})\nNoticias: ${snapshot.noticiasCrudas?.slice(0, 3).map((n: any) => n.titulo).join(" | ") || "--"}${iaPart}\n\nSnapshot JSON (truncado):\n` + JSON.stringify(snapshot, null, 1).slice(0, 6000);
  } catch (e: any) {
    return `[ERROR informe_matutino]: ${e?.message?.slice(0, 500) ?? String(e)}`;
  }
}

export async function toolAgendaEconomica(args: { fecha?: string }): Promise<string> {
  try {
    const fecha = args.fecha || new Date().toISOString().slice(0, 10);
    const { getAgendaSemana } = await import("@/lib/informe-matutino/agenda-economica");
    const agenda: any = (getAgendaSemana as unknown as (f: string) => any)(fecha);
    if (!agenda || agenda.length === 0) return `Agenda vacía para la semana de ${fecha}.`;
    return `=== AGENDA ECONÓMICA semana de ${fecha} ===\n` + agenda.map((e: any) => `${e.hora} — ${e.evento} [${e.relevancia}]`).join("\n");
  } catch (e: any) {
    return `[ERROR agenda]: ${e?.message?.slice(0, 400) ?? String(e)}`;
  }
}

//  Mapa de herramientas 
// Esquemas para OpenAI tool-calling y enrutador a implementación.

export type ToolRecord = {
  name: string;
  description: string;
  params: Record<string, any>;
  required: string[];
  run: (args: Record<string, any>) => Promise<string>;
};

export const AGENT_TOOLS: ToolRecord[] = [
  {
    name: "run_command",
    description: "Ejecuta un comando en el shell del servidor (PowerShell en Windows, bash en Linux). Útil para scripts, git, npm, node, explorar el proyecto.",
    params: { command: { type: "string", description: "Comando a ejecutar" } },
    required: ["command"],
    run: (a) => toolRunCommand(a as ToolRunCommandArgs),
  },
  {
    name: "read_file",
    description: "Lee el contenido de un archivo del sistema de archivos del proyecto.",
    params: { path: { type: "string", description: "Ruta absoluta o relativa" }, range_: { type: "string", description: "Rango opcional de líneas: '10-50'" } },
    required: ["path"],
    run: (a) => toolReadFile(a as ToolReadFileArgs),
  },
  {
    name: "write_file",
    description: "Crea o escribe un archivo en el sistema de archivos. Crea directorios padres si no existen.",
    params: { path: { type: "string", description: "Ruta del archivo" }, content: { type: "string", description: "Contenido a escribir" }, append: { type: "boolean", description: "Si es true, añade al final en vez de sobrescribir" } },
    required: ["path", "content"],
    run: (a) => toolWriteFile(a as ToolWriteFileArgs),
  },
  {
    name: "browse_filesystem",
    description: "Lista el contenido de un directorio del proyecto. Útil para explorar la estructura del código.",
    params: { path: { type: "string", description: "Ruta del directorio a explorar" } },
    required: ["path"],
    run: (a) => toolBrowseFilesystem(a as ToolBrowseFsArgs),
  },
  {
    name: "search_web",
    description: "Busca información actualizada en la web (DuckDuckGo + Wikipedia). Útil para ver datos recientes, noticias, precios de activos.",
    params: { query: { type: "string", description: "Consulta de búsqueda" }, limit: { type: "integer", description: "Máximo de resultados (default 6)" } },
    required: ["query"],
    run: (a) => toolWebSearch(a as ToolWebSearchArgs),
  },
  {
    name: "read_web_page",
    description: "Lee el texto de una página web desde su URL. Útil para profundizar en un resultado de búsqueda web.",
    params: { url: { type: "string", description: "URL completa de la página" }, maxChars: { type: "integer", description: "Máx caracteres a leer (default 10000)" } },
    required: ["url"],
    run: (a) => toolWebReadPage(a as ToolWebReadArgs),
  },
  {
    name: "supabase_storage_list",
    description: "Lista los archivos de un prefijo del bucket 'clarity-data' de Supabase. Usá '' para ver raíz, 'libros/' para PDFs, 'contexto/' para MDs.",
    params: { prefix: { type: "string", description: "Prefijo opcional (ej: 'libros/', 'data/')" } },
    required: [],
    run: (a) => toolSupaStorageList(a as ToolSupaListArgs),
  },
  {
    name: "supabase_storage_text",
    description: "Descarga el texto de un archivo del bucket 'clarity-data' (markdown, txt, JSON). Útil para leer documentación y contexto del proyecto.",
    params: { path: { type: "string", description: "Ruta completa: 'contexto/murphy-metodologia.json'" } },
    required: ["path"],
    run: (a) => toolSupaStorageText(a as ToolSupaTextArgs),
  },
  {
    name: "run_sandbox",
    description: "Ejecuta código JavaScript en un sandbox seguro (sin red, sin filesystem, timeout 15s). Ideal para cálculos, validaciones numéricas, transformación de datos.",
    params: { code: { type: "string", description: "Código JS. Recibe `files` (contexto cargado), `log()`, `table()`. Usá `return` para devolver valor." }, files: { type: "array", items: { type: "object" }, description: "Archivos de contexto opcionales (name, kind, text)" } },
    required: ["code"],
    run: (a) => toolSandbox(a as ToolSandboxArgs),
  },
  {
    name: "context_library_search",
    description: "Busca en la biblioteca de contexto indexada (PDFs, manuales, libros subidos a Supabase Storage). Búsqueda léxica por palabras clave.",
    params: { query: { type: "string", description: "Palabras clave para buscar (mín 5 caracteres cada una)" }, limit: { type: "integer", description: "Máximo de resultados (default 4)" } },
    required: ["query"],
    run: (a) => toolLibSearch(a as ToolLibSearchArgs),
  },
  {
    name: "telegram_enviar_senal",
    description: "ENVIA una senal de trading/analisis a Telegram via @coronar_inversiones_bot. USAR cuando el usuario pide que las senales se envien a Telegram, o cuando detectas una oportunidad/valor intrinseco/score que el usuario quiere notificar. Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID configurados en .env (obtenidos de @BotFather). ticker y senal son obligatorios; precio/variacion/motivo opcionales. Sin emojis en el mensaje.",
    params: {
      ticker: { type: "string", description: "Ticker (ej: GGAL.BA, AAPL, SPY)" },
      senal: { type: "string", description: "Senal: COMPRA, COMPRA CON CAUTELA, MANTENER, REDUCIR, VENTA u otra descripcion" },
      precio: { type: "number", description: "Precio actual opcional" },
      variacion1d: { type: "number", description: "Variacion % 1 dia opcional (ej: 2.5)" },
      motivo: { type: "string", description: "Motivo breve opcional (ej: Score 82/100, RSI sobreventa)" },
      nivel: { type: "string", description: "Nivel de confianza o horizonte opcional" },
      chatId: { type: "string", description: "Chat ID opcional (si no se pasa usa TELEGRAM_CHAT_ID)" },
    },
    required: ["ticker", "senal"],
    run: (a) => toolTelegramSignal(a as ToolTelegramSignalArgs),
  },
  {
    name: "telegram_enviar_mensaje",
    description: "ENVIA un mensaje libre a Telegram via @coronar_inversiones_bot. USAR para notificaciones generales, resumenes de cartera, alertas de ciclo u otro texto. Requiere TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en .env. Usa formato HTML.",
    params: {
      text: { type: "string", description: "Texto del mensaje (max 4000 chars, HTML permitido: <b>, <i>, <code>)" },
      chatId: { type: "string", description: "Chat ID opcional" },
    },
    required: ["text"],
    run: (a) => toolTelegramMessage(a as ToolTelegramMessageArgs),
  },
  {
    name: "telegram_estado",
    description: "CONSULTA el estado del bot de Telegram @coronar_inversiones_bot: verifica token, muestra info del bot (username, id) y ultimos chat_ids via getUpdates. USAR para diagnosticar si el bot esta configurado correctamente.",
    params: {},
    required: [],
    run: () => toolTelegramInfo(),
  },
  {
    name: "fetch_stock_data",
    description: "OBTIENE datos actuales de una accion/ETF desde Yahoo Finance directamente (sin depender del servidor Flask). USAR para consultar precio, variacion, P/E, market cap, beta, ROE, revenue growth, target precio, consenso de analistas. NO requiere servidor Flask. Recibe ticker (ej: AAPL, MSFT, SPY, GGAL.BA).",
    params: { ticker: { type: "string", description: "Ticker a consultar (ej: AAPL, MSFT, SPY, GGAL.BA)" }, period: { type: "string", description: "Periodo opcional (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max)" } },
    required: ["ticker"],
    run: (a) => toolStockData(a as ToolStockDataArgs),
  },
  {
    name: "financial_query",
    description: "CONSULTA los endpoints del backend Flask de analisis financiero. USAR para obtener: precios actuales (endpoint: api/price, params: ticker=GGAL), noticias (api/news, ticker=AAPL, count=10), analisis de portfolio (api/analyze), contexto macroeconomico (api/macro-context), analisis sectorial (api/sector/valuation o api/sector/performance), analisis fundamental/cuantitativo (api/quantitative), WACC (api/wacc), DCF (api/dcf), valuacion por multiples (api/multiples), comparacion contra benchmark (api/comparar), ciclo intermarket (api/intermarket/cycle). TODOS los endpoints devuelven JSON. El servidor Flask debe estar corriendo en localhost:5000.",
    params: {
      endpoint: { type: "string", description: "Endpoint Flask (ej: 'api/price', 'api/macro-context', 'api/analyze', 'api/sector/valuation', 'api/intermarket/cycle'). Ver descripción de la tool para lista completa." },
      params: { type: "object", description: "Parametros opcionales para el endpoint (como objeto JSON). Para GET: ej {ticker:'GGAL'}. Para POST: ej {tickers:['GGAL','YPF'], period:'1y'}" },
    },
    required: ["endpoint"],
    run: (a) => toolFinancialQuery(a as ToolFinancialQueryArgs),
  },
  {
    name: "crm_importar",
    description: "IMPORTA uno o más clientes al CRM (Supabase tabla clientes). Recibe un array de objetos con datos del cliente. Útil después de parsear CSV/JSON/TXT. Cada cliente requiere nombre, opcional: apellido, email, telefono, direccion, notas, perfil_inversor (conservador|moderado|agresivo), activos (array de strings).",
    params: { clientes: { type: "array", items: { type: "object" }, description: "Array de clientes a importar. Cada item: {nombre, apellido?, email?, telefono?, direccion?, notas?, perfil_inversor?, activos?[]}" } },
    required: ["clientes"],
    run: (a) => toolCrmImportar(a as ToolCrmImportArgs),
  },
  {
    name: "crm_listar",
    description: "LISTA los clientes registrados en el CRM. Devuelve nombre, email, perfil, activos y fecha de creación. Parámetro opcional: límite de resultados.",
    params: { limite: { type: "integer", description: "Máximo de clientes a listar (default 50)" } },
    required: [],
    run: (a) => toolCrmListar(a as ToolCrmListarArgs),
  },
  {
    name: "local_models",
    description: "LISTA los modelos locales instalados en Ollama (qwen2.5-coder, all-minilm, nemotron-cascade-2, Buddy, etc). Útil para saber qué razonamiento/generación local está disponible sin consumir API cloud.",
    params: { query: { type: "string", description: "Filtro opcional por nombre de modelo" } },
    required: [],
    run: (a) => toolLocalModels(a as ToolLocalModelsArgs),
  },
  {
    name: "route_task",
    description: "EJECUTA el primer agente router: analiza la petición del usuario y asigna el modelo MÁS AVANZADO disponible para esa tarea (cloud + respaldo local). Usar antes de delegar a cualquier generador o razonamiento profundo.",
    params: { message: { type: "string", description: "La solicitud del usuario a rutear" }, hasAttachment: { type: "boolean", description: "Si el usuario adjuntó una imagen/video" } },
    required: ["message"],
    run: (a) => toolRouteTask(a as { message: string; hasAttachment?: boolean }),
  },
  {
    name: "cascade_reason",
    description: "RAZONA EN CASCADA la solicitud del usuario con nemotron-cascade-2 (modelo local NVIDIA de razonamiento) ANTES de generar el prompt final. Devuelve objetivo, instrucciones, restricciones, tono y formato en JSON. Obligatorio antes de dar indicaciones a generadores de imagen/video/texto/PDF.",
    params: { message: { type: "string", description: "La solicitud/instrucciones del usuario" } },
    required: ["message"],
    run: (a) => toolCascadeReason(a as { message: string }),
  },
  {
    name: "generate_image",
    description: "GENERA una imagen a partir de texto (text-to-image). Ejecuta el pipeline obligatorio: router → cascada (nemotron-cascade-2) → mejorador de prompt (Ollama) → generador. Devuelve la URL del asset. El prompt se arma server-side.",
    params: { mode: { type: "string", description: "Siempre 'text_to_image'" }, message: { type: "string", description: "Descripción de la imagen a generar" } },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "edit_image",
    description: "EDITA una imagen adjunta (image-to-image): quitar fondo, agregar borde o recortar. Recibe la URL de la imagen y la instrucción.",
    params: { mode: { type: "string", description: "Siempre 'image_to_image'" }, message: { type: "string", description: "Instrucción de edición (quitar fondo, agregar borde, recortar)" }, attachmentUrl: { type: "string", description: "URL de la imagen a editar" } },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "generate_video",
    description: "GENERA un video a partir de texto (text-to-video) o de una imagen (image-to-video). Usa Cosmos 3 (NVIDIA) si está configurado o motion graphics (GIF) como fallback. NUNCA genera personas.",
    params: { mode: { type: "string", description: "'text_to_video' o 'image_to_video'" }, message: { type: "string", description: "Descripción del video" }, attachmentUrl: { type: "string", description: "URL de la imagen de arranque (solo image_to_video)" } },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "describe_image",
    description: "TRANSCRIBE o analiza una imagen adjunta (image-to-text). Ideal para leer tablas, textos y números de capturas financieras.",
    params: { mode: { type: "string", description: "Siempre 'image_to_text'" }, message: { type: "string", description: "Instrucción de transcripción/análisis" }, attachmentUrl: { type: "string", description: "URL o data URI de la imagen" } },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "transcribe_video",
    description: "TRANSCRIBE un video adjunto (video-to-text): extrae frames con ffmpeg y los analiza con un modelo de visión. Devuelve el texto/tablas visibles.",
    params: { mode: { type: "string", description: "Siempre 'video_to_text'" }, message: { type: "string", description: "Instrucción opcional" }, attachmentUrl: { type: "string", description: "URL del video (.mp4/.webm)" } },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "consultar_cierre_mercado",
    description:
      "Reporte de CIERRE DE MERCADO automático (EE.UU. + global) con datos en vivo Yahoo Finance: índices, sectores SPDR, Top 6 ganadores/perdedores, DXY/VIX/tasas, renta fija y commodities con sparkline. Cacheado al último cierre Wall Street 16:15 ET. Usar para 'cierre de hoy', 'cómo cerró el mercado'.",
    params: {},
    required: [],
    run: () => toolCierreMercado(),
  },
  {
    name: "generar_informe_matutino",
    description:
      "INFORME MATUTINO completo: snapshot de mercado + agenda económica + narrativa IA (humor risk-on/off/mixto, resumen ejecutivo, radar internacional/local, oportunidades por perfil CNV). Reutiliza snapshot Yahoo/ArgentinaDatos. Parámetro fecha opcional YYYY-MM-DD.",
    params: { fecha: { type: "string", description: "Fecha YYYY-MM-DD opcional (default hoy America/Argentina)" } },
    required: [],
    run: (a) => toolInformeMatutino(a as { fecha?: string }),
  },
  {
    name: "consultar_agenda_economica",
    description:
      "Agenda ECONÓMICA curada (BCRA LECAP, INDEC IPC/EMAE, FOMC, Tesoro USA, vencimientos) con hora y relevancia alta/media/baja para la semana de la fecha pedida. Usar para 'agenda de hoy', 'eventos de la semana'.",
    params: { fecha: { type: "string", description: "Fecha YYYY-MM-DD opcional (default hoy)" } },
    required: [],
    run: (a) => toolAgendaEconomica(a as { fecha?: string }),
  },
];

//  Modelos locales (Ollama) 

export type ToolLocalModelsArgs = { query?: string };

export async function toolLocalModels(_args: ToolLocalModelsArgs): Promise<string> {
  return "[Modelos locales deshabilitados] La aplicación usa modelos cloud (NVIDIA).";
}

/** Ejecuta el pipeline completo: router → cascada → mejorador → generador. */
export async function toolMultimodal(args: {
  mode: string;
  message: string;
  attachmentUrl?: string;
  attachmentBase64?: string;
  mime?: string;
}): Promise<string> {
  try {
    const { runMultimodal } = await import("./multimodal-actions.server");
    const mode = args.mode as
      | "text_to_image"
      | "image_to_image"
      | "text_to_video"
      | "image_to_text"
      | "image_to_video"
      | "video_to_text";
    const out = await runMultimodal({
      mode,
      message: args.message,
      attachment: {
        url: args.attachmentUrl,
        base64: args.attachmentBase64,
        mime: args.mime,
      },
    });
    const lines = [out.text];
    if (out.assetUrl) lines.push(`Asset: ${out.assetUrl}`);
    if (out.cascade?.origenModelo) lines.push(`Cascada: ${out.cascade.modelo}`);
    return lines.join("\n");
  } catch (e: any) {
    return `[ERROR multimodal]: ${e?.message?.slice(0, 500) ?? String(e)}`;
  }
}

/** Rutea la petición con el primer agente y devuelve el modelo asignado. */
export async function toolRouteTask(args: { message: string; hasAttachment?: boolean }): Promise<string> {
  try {
    const { routeTask } = await import("./router-agent.server");
    const decision = await routeTask({
      message: args.message,
      hasAttachment: args.hasAttachment ?? false,
    });
    return [
      `[ROUTER] ${decision.rationale}`,
      `  Modelo asignado: ${decision.assignedModel}`,
      decision.localBackup ? `  Respaldo local: ${decision.localBackup}` : "",
      `  Tarea: ${decision.task} · Modalidad: ${decision.modalidad ?? "—"}`,
    ]
      .filter(Boolean)
      .join("\n");
  } catch (e: any) {
    return `[ERROR router]: ${e?.message?.slice(0, 300) ?? String(e)}`;
  }
}

/** Razonamiento en cascada con nemotron-cascade-2 sobre la solicitud. */
export async function toolCascadeReason(args: { message: string }): Promise<string> {
  try {
    const { cascadeReason, cascadeBlock } = await import("./cascade-reasoning.server");
    const interp = await cascadeReason(args.message);
    return `${cascadeBlock(interp)}\n(Modelo: ${interp.modelo})`;
  } catch (e: any) {
    return `[ERROR cascada]: ${e?.message?.slice(0, 300) ?? String(e)}`;
  }
}

/** Convierte AGENT_TOOLS al formato de función-calling de OpenAI */
export function buildToolsSchema(): Record<string, any>[] {
  return AGENT_TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object",
        properties: t.params,
        required: t.required,
      },
    },
  }));
}

//  CRM: clientes 

export type ToolCrmImportArgs = { clientes: Array<{
  nombre: string; apellido?: string; email?: string; telefono?: string;
  direccion?: string; notas?: string; perfil_inversor?: string; activos?: string[];
}> };

export async function toolCrmImportar(args: ToolCrmImportArgs): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin?.from) return "[ERROR] Supabase no disponible";
    const results: string[] = [];
    for (const cli of args.clientes) {
      if (!cli.nombre?.trim()) { results.push(`  [FAIL] cliente sin nombre`); continue; }
      const { data, error } = await supabaseAdmin.from("clientes").insert({
        nombre: cli.nombre.trim(),
        apellido: cli.apellido?.trim() ?? "",
        email: cli.email?.trim() ?? "",
        telefono: cli.telefono?.trim() ?? "",
        direccion: cli.direccion?.trim() ?? "",
        notas: cli.notas?.trim() ?? "",
        perfil_inversor: cli.perfil_inversor ?? "moderado",
        activos: cli.activos ?? [],
        metadata: {},
      }).select("id,nombre,apellido").single();
      if (error) results.push(`  [FAIL] ${cli.nombre}: ${error.message}`);
      else results.push(`  [OK] ${data.nombre} ${data.apellido} (id: ${data.id})`);
    }
    const ok = results.filter(r => r.includes("[OK]")).length;
    const fail = results.filter(r => r.includes("[FAIL]")).length;
    return `CRM Import: ${ok} ok, ${fail} fail\n${results.join("\n")}`;
  } catch (e: any) {
    return `[ERROR CRM import]: ${e.message?.slice(0, 500) ?? String(e)}`;
  }
}

export type ToolCrmListarArgs = { limite?: number };

export async function toolCrmListar(args: ToolCrmListarArgs): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin?.from) return "[ERROR] Supabase no disponible";
    const { data, error } = await supabaseAdmin
      .from("clientes")
      .select("id,nombre,apellido,email,telefono,perfil_inversor,activos,created_at")
      .order("created_at", { ascending: false })
      .limit(args.limite ?? 50);
    if (error) return `[ERROR] ${error.message}`;
    if (!data?.length) return "CRM: no hay clientes registrados.";
    const lines = data.map((c: { nombre: string; apellido: string | null; email: string | null; perfil_inversor: string | null; activos: string[] | null; created_at: string | null }) =>
      `  ${c.nombre} ${c.apellido ?? ""} | ${c.email ?? "—"} | ${c.perfil_inversor ?? "—"} | Activos: ${(c.activos ?? []).join(", ") || "—"} | Creado: ${c.created_at?.slice(0, 10)}`
    );
    return `CRM: ${data.length} clientes\n${lines.join("\n")}`;
  } catch (e: any) {
    return `[ERROR CRM listar]: ${e.message?.slice(0, 500) ?? String(e)}`;
  }
}

/** Enruta un tool_call a la implementación */
export async function executeToolCall(name: string, args: Record<string, any>): Promise<string> {
  const tool = AGENT_TOOLS.find((t) => t.name === name);
  if (!tool) return `[ERROR: herramienta desconocida '${name}']`;
  return tool.run(args);
}
