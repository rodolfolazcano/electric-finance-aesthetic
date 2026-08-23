// @ts-nocheck
// Herramientas para el agente autónomo. Server-only.
// Cada herramienta recibe parámetros y devuelve string (resultado legible).
import "./env.server";

import { searchWeb, readWebPage, buildWebBlock } from "./web.server";
import { runSandbox } from "./sandbox.server";
import { searchLibrary } from "./context-library.server";
import {
  sendTelegramMessage as _sendTelegramMessage,
  sendTelegramSignal as _sendTelegramSignal,
  sendSenalInstitucional as _sendSenalInstitucional,
  formatSenalInstitucional as _formatSenalInstitucional,
  telegramGetBotInfo as _telegramGetBotInfo,
  telegramGetUpdates as _telegramGetUpdates,
} from "@/lib/telegram.server";
import {
  ejecutarComparacionFinanciera as _ejecutarComparacionFinanciera,
  tasaRealFisher as _tasaRealFisher,
  capitalizacion as _capitalizacion,
  valorActualRenta as _valorActualRenta,
  perpetuidad as _perpetuidad,
  perpetuidadCreciente as _perpetuidadCreciente,
} from "@/lib/math/calculo-financiero.functions";

const IS_WIN = process.platform === "win32";
const MAX_OUT = 8_000;

// --- run_command -------------------------------------------------------------

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

// --- read_file ---------------------------------------------------------------

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

// --- write_file --------------------------------------------------------------

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

// --- browse_filesystem -------------------------------------------------------

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
      let s = e.isDirectory() ? "??" : "??";
      try {
        const st = fs.statSync(full);
        s += e.isDirectory() ? "" : ` (${st.size.toLocaleString()} B)`;
      } catch {}
      return `  ${s} ${e.name}`;
    });
    return `?? ${base}\n${lines.slice(0, 120).join("\n")}${entries.length > 120 ? `\n  ... y ${entries.length - 120} más` : ""}`;
  } catch (e: any) {
    return `[ERROR explorando]: ${e.message ?? String(e)}`;
  }
}

// --- supabase_storage_list ---------------------------------------------------

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

// --- supabase_storage_text ---------------------------------------------------

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

// --- web_search --------------------------------------------------------------

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

// --- web_read_page -----------------------------------------------------------

export type ToolWebReadArgs = { url: string; maxChars?: number };

export async function toolWebReadPage(args: ToolWebReadArgs): Promise<string> {
  try {
    return await readWebPage(args.url, args.maxChars ?? 10_000);
  } catch (e: any) {
    return `[ERROR leyendo página]: ${e.message ?? String(e)}`;
  }
}

// --- sandbox -----------------------------------------------------------------

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

// --- context_library_search --------------------------------------------------

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

// --- financial_query -----------------------------------------------------------
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

// --- telegram — coronar_inversiones_bot ------------------------------------------------

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

export type ToolGenerarSenalArgs = { ticker: string; enviarTelegram?: boolean; chatId?: string };

export async function toolGenerarSenalUnificada(args: ToolGenerarSenalArgs): Promise<string> {
  const ticker = args.ticker?.trim().toUpperCase();
  if (!ticker) return "[ERROR] ticker es obligatorio (ej: META, GGAL.BA, AAPL)";
  try {
    const { generarSenalUnificada } = await import("@/lib/senales/motor-unificado");
    const s = await generarSenalUnificada(ticker);
    const texto = _formatSenalInstitucional({
      ticker: s.ticker,
      senal: s.senal,
      precio: s.precio,
      variacion1d: s.variacion1d,
      scoreTotal: s.scoreTotal,
      scores: s.scores,
      tecnica: s.tecnica,
      motivo: s.motivo.slice(0, 220),
      confianza: s.confianza,
    });
    const detalle4capas = [
      `I=${s.scores.intermarket.toFixed(1)} F=${s.scores.fundamental.toFixed(1)} T=${s.scores.tecnico.toFixed(1)} C=${s.scores.cuantitativo.toFixed(1)} → Total ${s.scoreTotal.toFixed(1)}/10`,
      s.tecnica.entrada != null ? `Entrada ${s.tecnica.entrada.toFixed(2)} SL ${s.tecnica.sl?.toFixed(2)} (${s.tecnica.slPct}%) TP1 ${s.tecnica.tp1?.toFixed(2)} R/R ${s.tecnica.rrr}` : "",
    ].filter(Boolean).join(" | ");
    let out = texto + "\n\n[DETALLE 4 CAPAS] " + detalle4capas;
    if (args.enviarTelegram) {
      const envio = await _sendSenalInstitucional({
        ticker: s.ticker,
        senal: s.senal,
        precio: s.precio,
        variacion1d: s.variacion1d,
        scoreTotal: s.scoreTotal,
        scores: s.scores,
        tecnica: s.tecnica,
        motivo: s.motivo.slice(0, 180),
        confianza: s.confianza,
        chatId: args.chatId,
      });
      out += "\n\n[TELEGRAM] " + envio;
      try {
        const { fetchYahooChart } = await import("@/lib/yahoo-http");
        const { buildQuickChartUrl } = await import("@/lib/telegram.server");
        const chart = await fetchYahooChart(ticker, "1y", "1d").catch(()=>null);
        const closes: number[] = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
        if (closes.length > 20) {
          const serie = closes.slice(-90).map((v,i)=> ({f: String(i), v: Number(v)} )).filter(p=> isFinite(p.v));
          const url = buildQuickChartUrl(`${ticker} — ${s.senal} ${s.scoreTotal.toFixed(1)}/10`, serie, "USD");
          out += `\n[GRAFICO] ${url} — TradingView: https://www.tradingview.com/chart/?symbol=${encodeURIComponent(ticker)}`;
        }
      } catch {}
    }
    return out;
  } catch (e: any) {
    return `[ERROR generar_senal_unificada ${ticker}]: ${e.message ?? String(e)}`;
  }
}

export type ToolOrquestarSectorialArgs = { topN?: number; enviarTelegram?: boolean; filtro?: string };

export async function toolOrquestarSectorial(args: ToolOrquestarSectorialArgs): Promise<string> {
  try {
    const { orquestarSectorial } = await import("@/lib/senales/orquestador-sectorial.server");
    const res = await orquestarSectorial({ topN: args.topN ?? 6, filtro: (args.filtro as any) ?? "todos" });
    const header = `ORQUESTADOR SECTORIAL 5 FASES — ${res.fecha}\nF1 Contexto: ${res.fase1.razonamiento.slice(0,400)}\nF2 Sectores fav: ${res.fase2.sectoresFavorecidos.join(", ")}\nF3 Tickers: ${res.fase3.tickersDesplegados.length}\nF4 Aprobados: ${res.fase4.aprobados.length}\nF5 Señales: ${res.fase5.senales.length}`;
    const senalesTxt = res.fase5.senales.map(s=> `${s.ticker} ${s.senal} ${s.scoreTotal.toFixed(1)}/10 Entrada ${s.tecnica.entrada?.toFixed(2)} SL ${s.tecnica.sl?.toFixed(2)} TP1 ${s.tecnica.tp1?.toFixed(2)}`).join("\n");
    let out = header + "\n\n" + res.fase5.resumen + "\n" + senalesTxt;
    if (args.enviarTelegram && res.fase5.senales.length) {
      const { sendSenalInstitucional } = await import("@/lib/telegram.server");
      for (const s of res.fase5.senales.slice(0,4)) {
        const r = await sendSenalInstitucional({ ticker: s.ticker, senal: s.senal, precio: s.precio, variacion1d: s.variacion1d, scoreTotal: s.scoreTotal, scores: s.scores, tecnica: s.tecnica, motivo: s.motivo.slice(0,150), confianza: s.confianza });
        out += `\n[TELEGRAM ${s.ticker}] ${r}`;
      }
    }
    return out;
  } catch (e:any) { return `[ERROR orquestar_sectorial]: ${e.message ?? String(e)}`; }
}

export type ToolCalculoFinancieroArgs = {
  operacion: "capitalizacion" | "tasa_real" | "va_renta" | "perpetuidad" | "perpetuidad_creciente" | "comparar";
  Co?: number; TNA?: number; m?: number; t?: number;
  ia?: number; pi?: number;
  A?: number; i?: number; n?: number; g?: number;
  alternativaA?: any; alternativaB?: any; tasaDescuento?: number;
};

export async function toolCalculoFinanciero(args: ToolCalculoFinancieroArgs): Promise<string> {
  try {
    switch (args.operacion) {
      case "capitalizacion": {
        const Co = args.Co ?? 100000; const TNA = args.TNA ?? 0.6; const m = args.m ?? 12; const t = args.t ?? 1;
        const res = _capitalizacion(Co, TNA, m, t);
        return `Capitalización: Co=${Co} TNA=${(TNA*100).toFixed(2)}% m=${m} t=${t}a → Cf=${res.toFixed(2)}`;
      }
      case "tasa_real": {
        const ia = args.ia ?? 0.6, pi = args.pi ?? 0.3;
        const r = _tasaRealFisher(ia, pi);
        return `Fisher ${r.metodo}: ia=${(ia*100).toFixed(1)}% π=${(pi*100).toFixed(1)}% → real=${(r.real*100).toFixed(2)}%`;
      }
      case "va_renta": {
        const A = args.A ?? 10000, i = args.i ?? 0.05, n = args.n ?? 12;
        return `VA renta: A=${A} i=${(i*100).toFixed(2)}% n=${n} → VA=${_valorActualRenta(A,i,n).toFixed(2)}`;
      }
      case "perpetuidad": return `Perpetuidad: A=${args.A} i=${args.i} → V=${_perpetuidad(args.A??1000, args.i??0.1).toFixed(2)}`;
      case "perpetuidad_creciente": return `Gordon: A=${args.A} g=${args.g} i=${args.i} → V=${_perpetuidadCreciente(args.A??1000, args.g??0.03, args.i??0.1).toFixed(2)}`;
      case "comparar": {
        if (!args.alternativaA || !args.alternativaB) return "[ERROR] comparar requiere alternativaA y alternativaB";
        const res = _ejecutarComparacionFinanciera(args.alternativaA, args.alternativaB, args.tasaDescuento ?? 0.5);
        return `${res.detalle}\nGanador: ${res.ganador}\n${res.recomendacion}`;
      }
      default: return `[ERROR] operacion desconocida`;
    }
  } catch (e:any) { return `[ERROR calculo-financiero]: ${e.message ?? String(e)}`; }
}

// --- fetch_stock_data ----------------------------------------------------------
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

// --- Mapa de herramientas ----------------------------------------------------
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
    description: "ENVIA una senal de trading/analisis a Telegram via @Coronarinversiones777_bot (CANAL SENALES AUTOMATICAS, token hardcodeado 8984569191). USAR cuando el usuario pide 'envia senal de X'. JAMAS pidas chat_id al usuario: si chatId no se pasa, usa automaticamente 8179198652 hardcodeado. Solo ticker y senal obligatorios. Ejecuta directo sin pedir confirmacion. Sin emojis.",
    params: {
      ticker: { type: "string", description: "Ticker (ej: META, GGAL.BA, AAPL, SPY)" },
      senal: { type: "string", description: "Senal: COMPRA, COMPRA CON CAUTELA, MANTENER, REDUCIR, VENTA u otra descripcion" },
      precio: { type: "number", description: "Precio actual opcional" },
      variacion1d: { type: "number", description: "Variacion % 1 dia opcional (ej: 2.5)" },
      motivo: { type: "string", description: "Motivo breve opcional (ej: Score 82/100, RSI sobreventa)" },
      nivel: { type: "string", description: "Nivel de confianza o horizonte opcional" },
      chatId: { type: "string", description: "Chat ID opcional — NO PEDIR AL USUARIO, si se omite usa 8179198652 automaticamente" },
    },
    required: ["ticker", "senal"],
    run: (a) => toolTelegramSignal(a as ToolTelegramSignalArgs),
  },
  {
    name: "telegram_enviar_mensaje",
    description: "ENVIA un mensaje libre a Telegram via @Coronarinversiones777_bot (hardcodeado). USAR para notificaciones. JAMAS pidas chat_id: usa 8179198652 si no se especifica. HTML permitido.",
    params: {
      text: { type: "string", description: "Texto del mensaje (max 4000 chars, HTML permitido: <b>, <i>, <code>)" },
      chatId: { type: "string", description: "Chat ID opcional — NO pedir al usuario" },
    },
    required: ["text"],
    run: (a) => toolTelegramMessage(a as ToolTelegramMessageArgs),
  },
  {
    name: "telegram_estado",
    description: "CONSULTA el estado del bot de Telegram @Coronarinversiones777_bot y @fpxbs777_bot (hardcodeados): verifica tokens, muestra info del bot y ultimos chat_ids via getUpdates.",
    params: {},
    required: [],
    run: () => toolTelegramInfo(),
  },
  {
    name: "generar_senal_unificada",
    description: "GENERA señal 4 capas CORONAR (Intermarket Pring 15% → Fundamental Pascale gate 40% → Técnico semáforo 25% → Cuantitativo Sharpe/VaR/CAPM 20%) con SL/TP y R/R. Usa corpus PT y skills. Si enviarTelegram=true envía formato institucional limpio a @Coronarinversiones777_bot + URL gráfico. Para interpretar señal, USAR ESTA TOOL PRIMERO.",
    params: {
      ticker: { type: "string", description: "Ticker a analizar (ej: META, GGAL.BA, AAPL)" },
      enviarTelegram: { type: "boolean", description: "Si true, envía a Telegram automáticamente (default false)" },
      chatId: { type: "string", description: "Chat ID opcional — NO pedir al usuario" },
    },
    required: ["ticker"],
    run: (a) => toolGenerarSenalUnificada(a as ToolGenerarSenalArgs),
  },
  {
    name: "orquestar_senales_sectoriales",
    description: "ORQUESTA 5 FASES sectorial: Geopolítico→Intermarket→Sectores→Tickers→Fundamental Value→Técnica. Mapea unificado_completo.json y filtra por sectores favorecidos Pring/Murphy. Envía top con SL/TP y grafico.",
    params: {
      topN: { type: "integer", description: "Top N (default 6)" },
      enviarTelegram: { type: "boolean", description: "Si true envía a Telegram" },
      filtro: { type: "string", description: "todos o solo_compras" },
    },
    required: [],
    run: (a) => toolOrquestarSectorial(a as ToolOrquestarSectorialArgs),
  },
  {
    name: "calculo_financiero",
    description: "CÁLCULO FINANCIERO Dumrauf: capitalizacion, tasa real Fisher exacta, VA renta, perpetuidad Gordon, comparar contado vs cuotas por VA. Usar operacion=comparar con alternativaA/B.",
    params: {
      operacion: { type: "string", description: "capitalizacion | tasa_real | va_renta | perpetuidad | perpetuidad_creciente | comparar" },
      Co: { type: "number", description: "Capital inicial" },
      TNA: { type: "number", description: "TNA decimal" },
      m: { type: "number", description: "Capitalizaciones por año" },
      t: { type: "number", description: "Años" },
      ia: { type: "number", description: "Tasa aparente" },
      pi: { type: "number", description: "Inflación" },
      A: { type: "number", description: "Cuota" },
      i: { type: "number", description: "Tasa periódica" },
      n: { type: "number", description: "Periodos" },
      g: { type: "number", description: "Crecimiento" },
      alternativaA: { type: "object", description: "Alternativa A" },
      alternativaB: { type: "object", description: "Alternativa B" },
      tasaDescuento: { type: "number", description: "TEA descuento" },
    },
    required: ["operacion"],
    run: (a) => toolCalculoFinanciero(a as ToolCalculoFinancieroArgs),
  },
  {
    name: "fetch_stock_data",
    description: "OBTIENE datos actuales de una accion/ETF desde Yahoo Finance directamente (sin depender del servidor Flask). USAR para consultar precio, variacion, P/E, market cap, beta, ROE, revenue growth, target precio, consenso de analistas. NO requiere servidor Flask. Recibe ticker (ej: AAPL, MSFT, SPY, GGAL.BA).",
    params: { ticker: { type: "string", description: "Ticker a consultar (ej: AAPL, MSFT, SPY, GGAL.BA)" }, period: { type: "string", description: "Periodo opcional (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max)" } },
    required: ["ticker"],
    run: (a) => toolStockData(a as ToolStockDataArgs),
  },
  {
    name: "consultar_principios_etico",
    description: "CONSULTA los principios éticos y de asesoramiento financiero basados en manuales AFC 2022 (Códigos IAEF/IEAF, Ética Manual, Asesoramiento Financiero). Devuelve principios por categoría: integridad, independencia, conflictos de interés, confidencialidad, cumplimiento normativo, conocimiento del cliente, asesoramiento financiero. El agente debe actuar siempre bajo estos principios.",
    params: { categoria: { type: "string", description: "Categoría opcional (ej: 'Integridad y Honestidad', 'Independencia y Objetividad'). Si no se especifica, devuelve todos." } },
    required: [],
    run: (a) => toolConsultarPrincipiosEtico(a as ToolConsultarPrincipiosEticoArgs),
  },
  {
    name: "verificar_cumplimiento_etico",
    description: "VERIFICA si una recomendación del agente cumple con los principios éticos del asesoramiento financiero. Detecta violaciones como promesas de rendimiento garantizado, falta de advertencia de riesgos, falta de consideración del perfil del cliente, o conflicto de intereses. El agente debe usar esta herramienta antes de emitir recomendaciones de inversión.",
    params: { recomendacion: { type: "string", description: "Texto de la recomendación o respuesta del agente a verificar" } },
    required: ["recomendacion"],
    run: (a) => toolVerificarCumplimientoEtico(a as ToolVerificarCumplimientoEticoArgs),
  },
  {
    name: "obtener_guia_comportamiento",
    description: "OBTIENE la guía completa de comportamiento ético para el agente, con instrucciones específicas sobre cómo aplicar cada principio ético en la práctica. El agente debe consultar esta guía para asegurar que su comportamiento y respuestas cumplen con los estándares profesionales del asesoramiento financiero según manuales AFC 2022.",
    params: {},
    required: [],
    run: (a) => toolObtenerGuiaComportamiento(a as ToolObtenerGuiaComportamientoArgs),
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
    description: "GENERA una imagen a partir de texto (text-to-image). Ejecuta el pipeline obligatorio: router ? cascada (nemotron-cascade-2) ? mejorador de prompt (Ollama) ? generador. Devuelve la URL del asset. El prompt se arma server-side.",
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
];

// --- Modelos locales (Ollama) ------------------------------------------------

export type ToolLocalModelsArgs = { query?: string };

export async function toolLocalModels(_args: ToolLocalModelsArgs): Promise<string> {
  return "[Modelos locales deshabilitados] La aplicación usa modelos cloud (NVIDIA).";
}

/** Ejecuta el pipeline completo: router ? cascada ? mejorador ? generador. */
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
      `  Tarea: ${decision.task} · Modalidad: ${decision.modalidad ?? ""}`,
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

// --- Ética y Asesoramiento Financiero ---------------------------------------

export type ToolConsultarPrincipiosEticoArgs = { categoria?: string };

export async function toolConsultarPrincipiosEtico(args: ToolConsultarPrincipiosEticoArgs): Promise<string> {
  try {
    const {
      obtenerPrincipiosPorCategoria,
      obtenerCategorias,
      PRINCIPIOS_ETICOS,
    } = await import("@/lib/principios-eticos");
    
    if (args.categoria) {
      const principios = obtenerPrincipiosPorCategoria(args.categoria);
      if (principios.length === 0) {
        return `[ERROR] Categoría no encontrada: ${args.categoria}. Categorías disponibles: ${obtenerCategorias().join(", ")}`;
      }
      const lines = [`## ${args.categoria.toUpperCase()}\n`];
      principios.forEach((p) => {
        lines.push(`### ${p.titulo}`);
        lines.push(`**Descripción:** ${p.descripcion}`);
        lines.push(`**Aplicación del agente:** ${p.aplicacionAgente}\n`);
      });
      return lines.join("\n");
    }
    
    // Devolver todos los principios organizados por categoría
    const categorias = obtenerCategorias();
    const lines = ["PRINCIPIOS ÉTICOS DEL ASESORAMIENTO FINANCIERO (AFC 2022)\n"];
    categorias.forEach((cat) => {
      lines.push(`## ${cat.toUpperCase()}\n`);
      const principios = obtenerPrincipiosPorCategoria(cat);
      principios.forEach((p) => {
        lines.push(`- ${p.titulo}`);
        lines.push(`  Aplicación: ${p.aplicacionAgente}`);
      });
      lines.push("");
    });
    return lines.join("\n");
  } catch (e: any) {
    return `[ERROR consultando principios éticos]: ${e.message ?? String(e)}`;
  }
}

export type ToolVerificarCumplimientoEticoArgs = { recomendacion: string };

export async function toolVerificarCumplimientoEtico(args: ToolVerificarCumplimientoEticoArgs): Promise<string> {
  try {
    const { verificarCumplimientoEtico } = await import("@/lib/principios-eticos");
    const resultado = verificarCumplimientoEtico(args.recomendacion);
    
    if (resultado.cumple) {
      return `[OK] La recomendación cumple con los principios éticos del asesoramiento financiero.`;
    }
    
    const lines = [`[ALERTA] La recomendación viola principios éticos:\n`];
    resultado.alertas.forEach((alerta, i) => {
      lines.push(`${i + 1}. ${alerta}`);
    });
    lines.push("\nPor favor, revise la recomendación para asegurar que:");
    lines.push("- No prometa rendimientos garantizados");
    lines.push("- Advierta sobre los riesgos de inversión");
    lines.push("- Considere el perfil del inversor");
    lines.push("- Declare cualquier conflicto de interés potencial");
    
    return lines.join("\n");
  } catch (e: any) {
    return `[ERROR verificando cumplimiento ético]: ${e.message ?? String(e)}`;
  }
}

export type ToolObtenerGuiaComportamientoArgs = Record<string, never>;

export async function toolObtenerGuiaComportamiento(args: ToolObtenerGuiaComportamientoArgs): Promise<string> {
  try {
    const { generarGuiaComportamiento } = await import("@/lib/principios-eticos");
    return generarGuiaComportamiento();
  } catch (e: any) {
    return `[ERROR obteniendo guía de comportamiento]: ${e.message ?? String(e)}`;
  }
}

// --- CRM: clientes ---------------------------------------------------------

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
      `  ${c.nombre} ${c.apellido ?? ""} | ${c.email ?? ""} | ${c.perfil_inversor ?? ""} | Activos: ${(c.activos ?? []).join(", ") || ""} | Creado: ${c.created_at?.slice(0, 10)}`
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
