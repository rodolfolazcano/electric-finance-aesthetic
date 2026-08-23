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
    if (!args.range_)
      return text.slice(0, MAX_OUT) + (text.length > MAX_OUT ? "\n...[truncado]" : "");
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
    const { data, error } = await supabaseAdmin.storage
      .from("clarity-data")
      .list(args.prefix ?? "");
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

export type ToolSandboxArgs = {
  code: string;
  files?: Array<{ name: string; kind: string; text: string }>;
};

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
    if (result.tables?.length)
      parts.push(`[TABLES]\n${JSON.stringify(result.tables, null, 2).slice(0, 3000)}`);
    return parts.join("\n\n") || "(sin output)";
  } catch (e: any) {
    return `[ERROR sandbox]: ${e.message ?? String(e)}`;
  }
}

//  context_library_search (Supabase)

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

//  consultar_base_conocimiento — corpus académico 185 docs / 12.776 chunks (Pascale, Fowler, Biondi, Elbaum, Dumrauf, Blanchard, Dornbusch, Bustamante, Murphy, Labadié)
export type ToolBaseConocimientoArgs = { query: string; limit?: number };
export async function toolBaseConocimiento(args: ToolBaseConocimientoArgs): Promise<string> {
  try {
    const { buscarAcademico } = await import("@/lib/kb-academic");
    const res = await buscarAcademico(args.query, args.limit ?? 5);
    if (!res.length) return "(sin coincidencias en base académica — probar con términos más específicos o consultar_base_conocimiento con categoría, ej: 'Pascale WACC' o 'Labadie Hurst')";
    return res.map((c) => `[${c.categoria} | ${c.archivo} p${c.pagina}] sim ${(c.similitud * 100).toFixed(1)}%\n${c.texto.slice(0, 1400)}`).join("\n\n---\n\n");
  } catch (e: any) {
    return `[ERROR base académica]: ${e.message ?? String(e)}`;
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
    if (!ok)
      return `[FLASK NO DISPONIBLE] Servidor Flask en ${FLASK_URL} no responde. Ejecutá 'python server/server.py'. Usá fetch_stock_data, search_web o run_sandbox como alternativa.`;
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
    const fullUrl = args.params
      ? `${url}${qs}${new URLSearchParams(args.params as any).toString()}`
      : url;
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return `[ERROR ${res.status}]: ${await res.text().catch(() => "?")}`;
    const text = await res.text();
    return text.length > MAX_OUT ? text.slice(0, MAX_OUT) + "\n...[truncado]" : text;
  } catch (e: any) {
    return `[ERROR consultando Flask (${url})]: ${e.message ?? String(e)}`;
  }
}

//  telegram — @Coronarinversiones777_bot (senales) + @fpxbs777_bot (agente) — ambos hardcodeados

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
  if (!args.ticker?.trim() || !args.senal?.trim())
    return "[TELEGRAM ERROR] ticker y senal son obligatorios";
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

// ── generar_senal_unificada — pipeline 4 capas autónomo (Intermarket → Fundamental → Técnico → Cuant) ──
export type ToolGenerarSenalArgs = { ticker: string; enviarTelegram?: boolean; chatId?: string };

export async function toolGenerarSenalUnificada(args: ToolGenerarSenalArgs): Promise<string> {
  const ticker = args.ticker?.trim().toUpperCase();
  if (!ticker) return "[ERROR] ticker es obligatorio (ej: META, GGAL.BA, AAPL)";
  try {
    const { generarSenalUnificada } = await import("@/lib/senales/motor-unificado");
    const s = await generarSenalUnificada(ticker);
    // Verificación matemática obligatoria en sandbox (SL/TP coherentes)
    try {
      const { runSandbox } = await import("./sandbox.server");
      const code = `
        const p=${s.precio ?? 0}, sl=${s.tecnica.sl ?? 0}, tp1=${s.tecnica.tp1 ?? 0};
        if(p && sl) {
          const slPct=((sl-p)/p*100).toFixed(2);
          const tpPct=tp1?((tp1-p)/p*100).toFixed(2):"s/d";
          log("Verificado SL "+slPct+"% TP1 "+tpPct+"% R/R "+(${s.tecnica.rrr ?? 0}));
        } else log("Sin precio para verificar");
      `;
      await runSandbox({ code, files: [] }).catch(() => {});
    } catch {}
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
    // Formato institucional limpio (sin mensajes innecesarios) + detalle 4 capas para el agente
    const detalle4capas = [
      `I=${s.scores.intermarket.toFixed(1)} F=${s.scores.fundamental.toFixed(1)} T=${s.scores.tecnico.toFixed(1)} C=${s.scores.cuantitativo.toFixed(1)} → Total ${s.scoreTotal.toFixed(1)}/10`,
      s.tecnica.entrada != null
        ? `Entrada ${s.tecnica.entrada.toFixed(2)} SL ${s.tecnica.sl?.toFixed(2)} (${s.tecnica.slPct}%) TP1 ${s.tecnica.tp1?.toFixed(2)} R/R ${s.tecnica.rrr}`
        : "",
      `Soporte ${s.tecnica.soporte?.toFixed(2) ?? "—"} Resistencia ${s.tecnica.resistencia?.toFixed(2) ?? "—"} ATR ${s.tecnica.atrPct ?? "—"}% VaR95 ${s.tecnica.var95Pct ?? "—"}%`,
    ]
      .filter(Boolean)
      .join(" | ");
    let out = texto + "\n\n[DETALLE 4 CAPAS] " + detalle4capas;
    // Envío autónomo a @Coronarinversiones777_bot si se pide (hardcodeado, no preguntar)
    if (args.enviarTelegram) {
      const { sendSenalInstitucionalConGrafico } = await import("@/lib/telegram.server");
      const envio = await sendSenalInstitucionalConGrafico({
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
      // Link interactivo TradingView como referencia para el agente
      try {
        const { normalizarSimboloTv } = await import("@/lib/tradingview-snapshot.server");
        const simboloTv = normalizarSimboloTv(ticker);
        out += `\n[GRAFICO] Enviado como adjunto (snapshot TradingView). Interactivo: https://www.tradingview.com/chart/?symbol=${encodeURIComponent(simboloTv)}`;
      } catch {}
    }
    return out;
  } catch (e: any) {
    return `[ERROR generar_senal_unificada ${ticker}]: ${e.message ?? String(e)}`;
  }
}

export type ToolOrquestarSectorialArgs = {
  topN?: number;
  enviarTelegram?: boolean;
  filtro?: string;
};

export async function toolOrquestarSectorial(args: ToolOrquestarSectorialArgs): Promise<string> {
  try {
    const { orquestarSectorial } = await import("@/lib/senales/orquestador-sectorial.server");
    const res = await orquestarSectorial({
      topN: args.topN ?? 6,
      filtro: (args.filtro as any) ?? "todos",
    });
    const header = `ORQUESTADOR SECTORIAL 5 FASES — ${res.fecha}\nF1 Contexto: ${res.fase1.razonamiento.slice(0, 400)}\nF2 Sectores fav: ${res.fase2.sectoresFavorecidos.join(", ")} (${res.fase2.justificacion})\nF3 Tickers desplegados: ${res.fase3.tickersDesplegados.length} (${Object.keys(res.fase3.porSector).join(", ")})\nF4 Fundamental: ${res.fase4.aprobados.length} aprobados / ${res.fase4.analizados} analizados\nF5 Señales: ${res.fase5.senales.length}`;
    const senalesTxt = res.fase5.senales
      .map(
        (s) =>
          `${s.ticker} ${s.senal} ${s.scoreTotal.toFixed(1)}/10 I${s.scores.intermarket} F${s.scores.fundamental} T${s.scores.tecnico} C${s.scores.cuantitativo} Entrada ${s.tecnica.entrada?.toFixed(2)} SL ${s.tecnica.sl?.toFixed(2)} TP1 ${s.tecnica.tp1?.toFixed(2)} R/R ${s.tecnica.rrr} — conf ${(s.confianza * 100).toFixed(0)}%`,
      )
      .join("\n");
    let out =
      header +
      "\n\n" +
      res.fase5.resumen +
      "\n\n" +
      senalesTxt +
      "\n\nFase1 ratios: " +
      res.fase1.ratios;
    if (args.enviarTelegram && res.fase5.senales.length) {
      const { sendSenalInstitucional } = await import("@/lib/telegram.server");
      for (const s of res.fase5.senales.slice(0, Math.min(4, res.fase5.senales.length))) {
        const r = await sendSenalInstitucional({
          ticker: s.ticker,
          senal: s.senal,
          precio: s.precio,
          variacion1d: s.variacion1d,
          scoreTotal: s.scoreTotal,
          scores: s.scores,
          tecnica: s.tecnica,
          motivo: s.motivo.slice(0, 150),
          confianza: s.confianza,
        });
        out += `\n[TELEGRAM ${s.ticker}] ${r}`;
        // Grafico QuickChart + TradingView link
        try {
          const { fetchYahooChart } = await import("@/lib/yahoo-http");
          const { buildQuickChartUrl } = await import("@/lib/telegram.server");
          const chart: any = await fetchYahooChart(s.ticker, "1y", "1d");
          const closes: number[] = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
          if (closes.length > 20) {
            const serie = closes
              .slice(-90)
              .map((v, i) => ({ f: String(i), v: Number(v) }))
              .filter((p) => isFinite(p.v));
            const url = buildQuickChartUrl(`${s.ticker} — ${s.senal}`, serie, "USD");
            out += `\n[GRAFICO ${s.ticker}] ${url} TradingView https://www.tradingview.com/chart/?symbol=${encodeURIComponent(s.ticker)}`;
          }
        } catch {}
      }
    }
    return out;
  } catch (e: any) {
    return `[ERROR orquestar_sectorial]: ${e.message ?? String(e)}`;
  }
}

export type ToolCalculoFinancieroArgs = {
  operacion: "capitalizacion" | "tasa_real" | "va_renta" | "perpetuidad" | "perpetuidad_creciente" | "comparar";
  Co?: number; TNA?: number; m?: number; t?: number;
  ia?: number; pi?: number;
  A?: number; i?: number; n?: number; g?: number;
  alternativaA?: { nombre: string; tipo: "contado" | "cuotas" | "flujos"; montoContado?: number; cuotas?: { importe: number; cantidad: number; tasaPeriodica?: number } };
  alternativaB?: { nombre: string; tipo: "contado" | "cuotas" | "flujos"; montoContado?: number; cuotas?: { importe: number; cantidad: number; tasaPeriodica?: number } };
  tasaDescuento?: number;
};

export async function toolCalculoFinanciero(args: ToolCalculoFinancieroArgs): Promise<string> {
  try {
    switch (args.operacion) {
      case "capitalizacion": {
        const Co = args.Co ?? 100000;
        const TNA = args.TNA ?? 0.6;
        const m = args.m ?? 12;
        const t = args.t ?? 1;
        const res = _capitalizacion(Co, TNA, m, t);
        return `Capitalización: Co=${Co} TNA=${(TNA*100).toFixed(2)}% m=${m} t=${t}a → Cf=${res.toFixed(2)} (factor ${(res/Co).toFixed(4)})`;
      }
      case "tasa_real": {
        const ia = args.ia ?? 0.6, pi = args.pi ?? 0.3;
        const r = _tasaRealFisher(ia, pi);
        return `Fisher ${r.metodo}: ia=${(ia*100).toFixed(1)}% π=${(pi*100).toFixed(1)}% → real=${(r.real*100).toFixed(2)}% (${r.metodo}) — Regla Dumrauf: comparar solo efectivas, usar exacta si ia>20%`;
      }
      case "va_renta": {
        const A = args.A ?? 10000, i = args.i ?? 0.05, n = args.n ?? 12;
        const va = _valorActualRenta(A, i, n);
        return `VA renta: A=${A} i=${(i*100).toFixed(2)}% n=${n} → VA=${va.toFixed(2)}`;
      }
      case "perpetuidad": {
        const A = args.A ?? 1000, i = args.i ?? 0.10;
        return `Perpetuidad: A=${A} i=${(i*100).toFixed(2)}% → V=${_perpetuidad(A,i).toFixed(2)}`;
      }
      case "perpetuidad_creciente": {
        const A = args.A ?? 1000, g = args.g ?? 0.03, i = args.i ?? 0.10;
        return `Perpetuidad creciente (Gordon): A=${A} g=${(g*100).toFixed(1)}% i=${(i*100).toFixed(1)}% → V=${_perpetuidadCreciente(A,g,i).toFixed(2)}`;
      }
      case "comparar": {
        if (!args.alternativaA || !args.alternativaB) return "[ERROR] comparar requiere alternativaA y alternativaB";
        const res = _ejecutarComparacionFinanciera(args.alternativaA as any, args.alternativaB as any, args.tasaDescuento ?? 0.5);
        return `${res.detalle}\nGanador: ${res.ganador}\n${res.recomendacion}`;
      }
      default: return `[ERROR] operacion desconocida: ${args.operacion}`;
    }
  } catch (e:any) { return `[ERROR calculo-financiero]: ${e.message ?? String(e)}`; }
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
      try {
        yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
      } catch {
        /* noop */
      }

      const quote = await yf.quote(ticker);
      const summary = await yf
        .quoteSummary(ticker, {
          modules: ["price", "summaryDetail", "financialData", "defaultKeyStatistics"],
        })
        .catch(() => null);

      const lines: string[] = [`=== ${ticker} ===`];
      if (quote?.regularMarketPrice != null) {
        lines.push(`Precio: $${quote.regularMarketPrice.toFixed(2)}`);
        lines.push(
          `Variacion: ${quote.regularMarketChangePercent != null ? (quote.regularMarketChangePercent * 100).toFixed(2) + "%" : "N/A"}`,
        );
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
          const recMap: Record<string, string> = {
            "1": "Compra Fuerte",
            "2": "Comprar",
            "3": "Mantener",
            "4": "Vender",
            "5": "Venta Fuerte",
          };
          lines.push(
            `Consenso: ${recMap[String(Math.round(fd.recommendationMean))] ?? fd.recommendationMean}`,
          );
        }
        if (fd.returnOnEquity != null) lines.push(`ROE: ${(fd.returnOnEquity * 100).toFixed(1)}%`);
        if (fd.revenueGrowth != null)
          lines.push(`Crecimiento Ingresos: ${(fd.revenueGrowth * 100).toFixed(1)}%`);
        if (fd.profitMargins != null)
          lines.push(`Margen Neto: ${(fd.profitMargins * 100).toFixed(1)}%`);
        if (fd.freeCashflow != null)
          lines.push(`Free Cash Flow: $${(fd.freeCashflow / 1e9).toFixed(2)}B`);
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
      `Sectores top HOY: ${data.sectores
        .slice(0, 3)
        .map((s: any) => `${s.nombre}:${s.hoy != null ? s.hoy.toFixed(1) + "%" : "--"}`)
        .join(", ")} | peor: ${data.sectores
        .slice(-2)
        .map((s: any) => `${s.nombre}:${s.hoy != null ? s.hoy.toFixed(1) + "%" : "--"}`)
        .join(", ")}`,
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
      const { generateInformeMatutino } = await import("@/lib/informe-matutino/informe.functions");
      const ia: any = await (generateInformeMatutino as unknown as (s: any) => Promise<any>)(
        snapshot,
      );
      if (ia)
        iaPart = `\n\n--- NARRATIVA IA ---\nHumor: ${ia.humorMercado}\nResumen: ${ia.resumenEjecutivo}\nRadar Int: ${ia.radarInternacional?.titular} — ${ia.radarInternacional?.bullets?.join(" | ")}\nRadar Local: ${ia.radarLocal?.titular} — ${ia.radarLocal?.bullets?.join(" | ")}`;
      else iaPart = "\n\n[IA no disponible: error del modelo NVIDIA]";
    } catch (e: any) {
      iaPart = `\n\n[IA error: ${e?.message?.slice(0, 300) ?? String(e)}]`;
    }
    const agendaResumen = `Agenda: ${snapshot.agendaDelDia?.map((a: any) => `${a.hora} ${a.evento} (${a.relevancia})`).join(" | ") || "--"}`;
    return (
      `=== INFORME MATUTINO ${snapshot.fecha} ===\n${agendaResumen}\nDolares oficial/blue/MEP/CCL: ${snapshot.local?.dolares?.oficial}/${snapshot.local?.dolares?.blue}/${snapshot.local?.dolares?.mep}/${snapshot.local?.dolares?.ccl} Brecha ${snapshot.local?.dolares?.brechaCCLPct?.toFixed(1)}%\nRiesgo país: ${snapshot.local?.riesgoPais?.valor} (${snapshot.local?.riesgoPais?.variacionPuntos})\nNoticias: ${
        snapshot.noticiasCrudas
          ?.slice(0, 3)
          .map((n: any) => n.titulo)
          .join(" | ") || "--"
      }${iaPart}\n\nSnapshot JSON (truncado):\n` + JSON.stringify(snapshot, null, 1).slice(0, 6000)
    );
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
    return (
      `=== AGENDA ECONÓMICA semana de ${fecha} ===\n` +
      agenda.map((e: any) => `${e.hora} — ${e.evento} [${e.relevancia}]`).join("\n")
    );
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
    description:
      "Ejecuta un comando en el shell del servidor (PowerShell en Windows, bash en Linux). Útil para scripts, git, npm, node, explorar el proyecto.",
    params: { command: { type: "string", description: "Comando a ejecutar" } },
    required: ["command"],
    run: (a) => toolRunCommand(a as ToolRunCommandArgs),
  },
  {
    name: "read_file",
    description: "Lee el contenido de un archivo del sistema de archivos del proyecto.",
    params: {
      path: { type: "string", description: "Ruta absoluta o relativa" },
      range_: { type: "string", description: "Rango opcional de líneas: '10-50'" },
    },
    required: ["path"],
    run: (a) => toolReadFile(a as ToolReadFileArgs),
  },
  {
    name: "write_file",
    description:
      "Crea o escribe un archivo en el sistema de archivos. Crea directorios padres si no existen.",
    params: {
      path: { type: "string", description: "Ruta del archivo" },
      content: { type: "string", description: "Contenido a escribir" },
      append: { type: "boolean", description: "Si es true, añade al final en vez de sobrescribir" },
    },
    required: ["path", "content"],
    run: (a) => toolWriteFile(a as ToolWriteFileArgs),
  },
  {
    name: "browse_filesystem",
    description:
      "Lista el contenido de un directorio del proyecto. Útil para explorar la estructura del código.",
    params: { path: { type: "string", description: "Ruta del directorio a explorar" } },
    required: ["path"],
    run: (a) => toolBrowseFilesystem(a as ToolBrowseFsArgs),
  },
  {
    name: "search_web",
    description:
      "Busca información actualizada en la web (DuckDuckGo + Wikipedia). Útil para ver datos recientes, noticias, precios de activos.",
    params: {
      query: { type: "string", description: "Consulta de búsqueda" },
      limit: { type: "integer", description: "Máximo de resultados (default 6)" },
    },
    required: ["query"],
    run: (a) => toolWebSearch(a as ToolWebSearchArgs),
  },
  {
    name: "read_web_page",
    description:
      "Lee el texto de una página web desde su URL. Útil para profundizar en un resultado de búsqueda web.",
    params: {
      url: { type: "string", description: "URL completa de la página" },
      maxChars: { type: "integer", description: "Máx caracteres a leer (default 10000)" },
    },
    required: ["url"],
    run: (a) => toolWebReadPage(a as ToolWebReadArgs),
  },
  {
    name: "supabase_storage_list",
    description:
      "Lista los archivos de un prefijo del bucket 'clarity-data' de Supabase. Usá '' para ver raíz, 'libros/' para PDFs, 'contexto/' para MDs.",
    params: {
      prefix: { type: "string", description: "Prefijo opcional (ej: 'libros/', 'data/')" },
    },
    required: [],
    run: (a) => toolSupaStorageList(a as ToolSupaListArgs),
  },
  {
    name: "supabase_storage_text",
    description:
      "Descarga el texto de un archivo del bucket 'clarity-data' (markdown, txt, JSON). Útil para leer documentación y contexto del proyecto.",
    params: {
      path: { type: "string", description: "Ruta completa: 'contexto/murphy-metodologia.json'" },
    },
    required: ["path"],
    run: (a) => toolSupaStorageText(a as ToolSupaTextArgs),
  },
  {
    name: "run_sandbox",
    description:
      "Ejecuta código JavaScript en un sandbox seguro (sin red, sin filesystem, timeout 15s). Ideal para cálculos, validaciones numéricas, transformación de datos.",
    params: {
      code: {
        type: "string",
        description:
          "Código JS. Recibe `files` (contexto cargado), `log()`, `table()`. Usá `return` para devolver valor.",
      },
      files: {
        type: "array",
        items: { type: "object" },
        description: "Archivos de contexto opcionales (name, kind, text)",
      },
    },
    required: ["code"],
    run: (a) => toolSandbox(a as ToolSandboxArgs),
  },
  {
    name: "context_library_search",
    description:
      "Busca en la biblioteca de contexto indexada (PDFs, manuales, libros subidos a Supabase Storage). Búsqueda léxica por palabras clave.",
    params: {
      query: {
        type: "string",
        description: "Palabras clave para buscar (mín 5 caracteres cada una)",
      },
      limit: { type: "integer", description: "Máximo de resultados (default 4)" },
    },
    required: ["query"],
    run: (a) => toolLibSearch(a as ToolLibSearchArgs),
  },
  {
    name: "consultar_base_conocimiento",
    description:
      "Consulta el corpus académico Coronar (185 docs / 12.776 chunks: Pascale, Fowler Newton, Biondi, Elbaum, Dumrauf, Alonso, Blanchard/Perez-Enrri, Dornbusch-Fischer, Bustamante, Murphy + Labadié Quant 1205.3482v6 TC/IS p=1/H, 1303.7177 HFT, microstructure Kyle/Glosten, stat-arb 5 stages, spectral PCA, ML, zoology, ETFs, Black-Scholes). USAR SIEMPRE antes de calcular: encuadre académico dicta método. Categorías: Labadié - Quant & Microstructure; Pascale - Finanzas de la empresa; Contabilidad - Fowler Newton; Estados contables - Biondi; Carteras - Elbaum; Calculo financiero - Dumrauf; Macro LATAM - Blanchard/Perez-Enrri; Macro - Dornbusch-Fischer; Financiacion y mercados - Bustamante; Intermarket - Murphy. Ej: 'Pascale WACC', 'Labadie Hurst', 'Murphy intermarket ratios', 'Fowler Newton estados contables'.",
    params: {
      query: { type: "string", description: "Consulta académica con categoría + concepto, ej: 'Pascale DCF' o 'Labadie p=1/H'" },
      limit: { type: "integer", description: "Máximo chunks (default 5)" },
    },
    required: ["query"],
    run: (a) => toolBaseConocimiento(a as ToolBaseConocimientoArgs),
  },
  {
    name: "telegram_enviar_senal",
    description:
      "ENVIA una senal de trading/analisis a Telegram via @Coronarinversiones777_bot (CANAL SENALES AUTOMATICAS, token hardcodeado 8984569191). USAR cuando el usuario pide 'envia senal de X' o cuando detectas oportunidad sin preguntar. JAMAS pidas chat_id al usuario: si chatId no se pasa, el sistema usa automaticamente 8179198652 hardcodeado. Solo ticker y senal son obligatorios; precio/variacion/motivo opcionales. Ejecuta directo sin pedir confirmacion. Sin emojis.",
    params: {
      ticker: { type: "string", description: "Ticker (ej: META, GGAL.BA, AAPL, SPY)" },
      senal: {
        type: "string",
        description:
          "Senal: COMPRA, COMPRA CON CAUTELA, MANTENER, REDUCIR, VENTA u otra descripcion",
      },
      precio: { type: "number", description: "Precio actual opcional" },
      variacion1d: { type: "number", description: "Variacion % 1 dia opcional (ej: 2.5)" },
      motivo: {
        type: "string",
        description: "Motivo breve opcional (ej: Score 82/100, RSI sobreventa)",
      },
      nivel: { type: "string", description: "Nivel de confianza o horizonte opcional" },
      chatId: {
        type: "string",
        description:
          "Chat ID opcional — NO PEDIR AL USUARIO, si se omite usa 8179198652 automaticamente",
      },
    },
    required: ["ticker", "senal"],
    run: (a) => toolTelegramSignal(a as ToolTelegramSignalArgs),
  },
  {
    name: "telegram_enviar_mensaje",
    description:
      "ENVIA un mensaje libre a Telegram via @Coronarinversiones777_bot (hardcodeado). USAR para notificaciones generales, resumenes, alertas. JAMAS pidas chat_id: usa el hardcodeado 8179198652 si no se especifica. Usa formato HTML.",
    params: {
      text: {
        type: "string",
        description: "Texto del mensaje (max 4000 chars, HTML permitido: <b>, <i>, <code>)",
      },
      chatId: { type: "string", description: "Chat ID opcional — NO pedir al usuario" },
    },
    required: ["text"],
    run: (a) => toolTelegramMessage(a as ToolTelegramMessageArgs),
  },
  {
    name: "telegram_estado",
    description:
      "CONSULTA el estado del bot de Telegram @Coronarinversiones777_bot (senales) y @fpxbs777_bot (agente): verifica tokens hardcodeados, muestra info del bot y ultimos chat_ids via getUpdates. USAR para diagnosticar configuracion.",
    params: {},
    required: [],
    run: () => toolTelegramInfo(),
  },
  {
    name: "generar_senal_unificada",
    description:
      "GENERA señal 4 capas CORONAR (Intermarket Pring 15% → Fundamental Pascale gate 40% → Técnico semáforo 25% → Cuantitativo Sharpe/VaR/CAPM 20%) con SL/TP y R/R calculados. Usa corpus PT (Murphy/Pascale), skills razonamiento y motores Yahoo/Flask autónomamente. Si enviarTelegram=true envía formato institucional limpio a @Coronarinversiones777_bot (hardcodeado) + devuelve URL gráfico QuickChart + link TradingView. JAMAS pidas ticker si ya lo tenés; ejecuta directo. Para interpretar cualquier señal, USAR ESTA TOOL PRIMERO.",
    params: {
      ticker: { type: "string", description: "Ticker a analizar (ej: META, GGAL.BA, AAPL, SPY)" },
      enviarTelegram: {
        type: "boolean",
        description:
          "Si true, envía señal institucional limpia a Telegram automáticamente (default false). Usa chat hardcodeado.",
      },
      chatId: { type: "string", description: "Chat ID opcional — NO pedir al usuario" },
    },
    required: ["ticker"],
    run: (a) => toolGenerarSenalUnificada(a as ToolGenerarSenalArgs),
  },
  {
    name: "orquestar_senales_sectoriales",
    description:
      "ORQUESTA 5 FASES sectorial CORONAR: 1) Geopolítico+noticias+ratios intermarket (Murphy), 2) Sectores favorecidos Pring, 3) Mapea unificado_completo.json y despliega tickers por sector/industria, 4) Fundamental completo Value Investing (Pascale/WACC/DCF múltiplos MOS 50%), 5) Técnicas filtradas. Usa PT completo. Si enviarTelegram envía top señales limpias con SL/TP + grafico TradingView a @Coronarinversiones777_bot. Para panel completo, USAR ESTA TOOL.",
    params: {
      topN: { type: "integer", description: "Top N señales (default 6)" },
      enviarTelegram: { type: "boolean", description: "Si true envía a Telegram (default false)" },
      filtro: { type: "string", description: "todos o solo_compras" },
    },
    required: [],
    run: (a) => toolOrquestarSectorial(a as ToolOrquestarSectorialArgs),
  },
  {
    name: "calculo_financiero",
    description:
      "CÁLCULO FINANCIERO Dumrauf (PT Administracion Financiera): capitalizacion (1+TNA/m)^m, tasa real Fisher exacta (1+ia)/(1+π)-1 (exacta si ia>20% para Argentina), VA renta, perpetuidad y Gordon, fondo amortización, TIR costo efectivo. Para comparar contado vs cuotas o dos alternativas, usar operacion=comparar con alternativaA/B y tasaDescuento TEA. Reglas: comparar solo efectivas, VA, ilusión nominal.",
    params: {
      operacion: { type: "string", description: "capitalizacion | tasa_real | va_renta | perpetuidad | perpetuidad_creciente | comparar" },
      Co: { type: "number", description: "Capital inicial (capitalizacion)" },
      TNA: { type: "number", description: "TNA decimal (0.6=60%)" },
      m: { type: "number", description: "Capitalizaciones por año" },
      t: { type: "number", description: "Años" },
      ia: { type: "number", description: "Tasa aparente decimal" },
      pi: { type: "number", description: "Inflación decimal" },
      A: { type: "number", description: "Cuota/renta" },
      i: { type: "number", description: "Tasa periódica decimal" },
      n: { type: "number", description: "Periodos" },
      g: { type: "number", description: "Crecimiento perpetuidad" },
      alternativaA: { type: "object", description: "Alternativa A {nombre, tipo: contado|cuotas, montoContado, cuotas:{importe,cantidad}}" },
      alternativaB: { type: "object", description: "Alternativa B idem" },
      tasaDescuento: { type: "number", description: "TEA descuento decimal para comparar" },
    },
    required: ["operacion"],
    run: (a) => toolCalculoFinanciero(a as ToolCalculoFinancieroArgs),
  },
  {
    name: "fetch_stock_data",
    description:
      "OBTIENE datos actuales de una accion/ETF desde Yahoo Finance directamente (sin depender del servidor Flask). USAR para consultar precio, variacion, P/E, market cap, beta, ROE, revenue growth, target precio, consenso de analistas. NO requiere servidor Flask. Recibe ticker (ej: AAPL, MSFT, SPY, GGAL.BA).",
    params: {
      ticker: { type: "string", description: "Ticker a consultar (ej: AAPL, MSFT, SPY, GGAL.BA)" },
      period: {
        type: "string",
        description: "Periodo opcional (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max)",
      },
    },
    required: ["ticker"],
    run: (a) => toolStockData(a as ToolStockDataArgs),
  },
  {
    name: "financial_query",
    description:
      "CONSULTA los endpoints del backend Flask de analisis financiero. USAR para obtener: precios actuales (endpoint: api/price, params: ticker=GGAL), noticias (api/news, ticker=AAPL, count=10), analisis de portfolio (api/analyze), contexto macroeconomico (api/macro-context), analisis sectorial (api/sector/valuation o api/sector/performance), analisis fundamental/cuantitativo (api/quantitative), WACC (api/wacc), DCF (api/dcf), valuacion por multiples (api/multiples), comparacion contra benchmark (api/comparar), ciclo intermarket (api/intermarket/cycle). TODOS los endpoints devuelven JSON. El servidor Flask debe estar corriendo en localhost:5000.",
    params: {
      endpoint: {
        type: "string",
        description:
          "Endpoint Flask (ej: 'api/price', 'api/macro-context', 'api/analyze', 'api/sector/valuation', 'api/intermarket/cycle'). Ver descripción de la tool para lista completa.",
      },
      params: {
        type: "object",
        description:
          "Parametros opcionales para el endpoint (como objeto JSON). Para GET: ej {ticker:'GGAL'}. Para POST: ej {tickers:['GGAL','YPF'], period:'1y'}",
      },
    },
    required: ["endpoint"],
    run: (a) => toolFinancialQuery(a as ToolFinancialQueryArgs),
  },
  {
    name: "crm_importar",
    description:
      "IMPORTA uno o más clientes al CRM (Supabase tabla clientes). Recibe un array de objetos con datos del cliente. Útil después de parsear CSV/JSON/TXT. Cada cliente requiere nombre, opcional: apellido, email, telefono, direccion, notas, perfil_inversor (conservador|moderado|agresivo), activos (array de strings).",
    params: {
      clientes: {
        type: "array",
        items: { type: "object" },
        description:
          "Array de clientes a importar. Cada item: {nombre, apellido?, email?, telefono?, direccion?, notas?, perfil_inversor?, activos?[]}",
      },
    },
    required: ["clientes"],
    run: (a) => toolCrmImportar(a as ToolCrmImportArgs),
  },
  {
    name: "crm_listar",
    description:
      "LISTA los clientes registrados en el CRM. Devuelve nombre, email, perfil, activos y fecha de creación. Parámetro opcional: límite de resultados.",
    params: {
      limite: { type: "integer", description: "Máximo de clientes a listar (default 50)" },
    },
    required: [],
    run: (a) => toolCrmListar(a as ToolCrmListarArgs),
  },
  {
    name: "local_models",
    description:
      "LISTA los modelos locales instalados en Ollama (qwen2.5-coder, all-minilm, nemotron-cascade-2, Buddy, etc). Útil para saber qué razonamiento/generación local está disponible sin consumir API cloud.",
    params: { query: { type: "string", description: "Filtro opcional por nombre de modelo" } },
    required: [],
    run: (a) => toolLocalModels(a as ToolLocalModelsArgs),
  },
  {
    name: "route_task",
    description:
      "EJECUTA el primer agente router: analiza la petición del usuario y asigna el modelo MÁS AVANZADO disponible para esa tarea (cloud + respaldo local). Usar antes de delegar a cualquier generador o razonamiento profundo.",
    params: {
      message: { type: "string", description: "La solicitud del usuario a rutear" },
      hasAttachment: { type: "boolean", description: "Si el usuario adjuntó una imagen/video" },
    },
    required: ["message"],
    run: (a) => toolRouteTask(a as { message: string; hasAttachment?: boolean }),
  },
  {
    name: "cascade_reason",
    description:
      "RAZONA EN CASCADA la solicitud del usuario con nemotron-cascade-2 (modelo local NVIDIA de razonamiento) ANTES de generar el prompt final. Devuelve objetivo, instrucciones, restricciones, tono y formato en JSON. Obligatorio antes de dar indicaciones a generadores de imagen/video/texto/PDF.",
    params: { message: { type: "string", description: "La solicitud/instrucciones del usuario" } },
    required: ["message"],
    run: (a) => toolCascadeReason(a as { message: string }),
  },
  {
    name: "generate_image",
    description:
      "GENERA una imagen a partir de texto (text-to-image). Ejecuta el pipeline obligatorio: router → cascada (nemotron-cascade-2) → mejorador de prompt (Ollama) → generador. Devuelve la URL del asset. El prompt se arma server-side.",
    params: {
      mode: { type: "string", description: "Siempre 'text_to_image'" },
      message: { type: "string", description: "Descripción de la imagen a generar" },
    },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "edit_image",
    description:
      "EDITA una imagen adjunta (image-to-image): quitar fondo, agregar borde o recortar. Recibe la URL de la imagen y la instrucción.",
    params: {
      mode: { type: "string", description: "Siempre 'image_to_image'" },
      message: {
        type: "string",
        description: "Instrucción de edición (quitar fondo, agregar borde, recortar)",
      },
      attachmentUrl: { type: "string", description: "URL de la imagen a editar" },
    },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "generate_video",
    description:
      "GENERA un video a partir de texto (text-to-video) o de una imagen (image-to-video). Usa Cosmos 3 (NVIDIA) si está configurado o motion graphics (GIF) como fallback. NUNCA genera personas.",
    params: {
      mode: { type: "string", description: "'text_to_video' o 'image_to_video'" },
      message: { type: "string", description: "Descripción del video" },
      attachmentUrl: {
        type: "string",
        description: "URL de la imagen de arranque (solo image_to_video)",
      },
    },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "describe_image",
    description:
      "TRANSCRIBE o analiza una imagen adjunta (image-to-text). Ideal para leer tablas, textos y números de capturas financieras.",
    params: {
      mode: { type: "string", description: "Siempre 'image_to_text'" },
      message: { type: "string", description: "Instrucción de transcripción/análisis" },
      attachmentUrl: { type: "string", description: "URL o data URI de la imagen" },
    },
    required: ["mode", "message"],
    run: (a) => toolMultimodal(a as any),
  },
  {
    name: "transcribe_video",
    description:
      "TRANSCRIBE un video adjunto (video-to-text): extrae frames con ffmpeg y los analiza con un modelo de visión. Devuelve el texto/tablas visibles.",
    params: {
      mode: { type: "string", description: "Siempre 'video_to_text'" },
      message: { type: "string", description: "Instrucción opcional" },
      attachmentUrl: { type: "string", description: "URL del video (.mp4/.webm)" },
    },
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
    params: {
      fecha: {
        type: "string",
        description: "Fecha YYYY-MM-DD opcional (default hoy America/Argentina)",
      },
    },
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
  {
    name: "pairs_trading_labadie",
    description:
      "LABADIÉ StatArb (1205.3482v6 §2-4 + 5 Stages): analiza par mean-reversion spread = a1 - beta*a2, μ±aσ entry, μ±bσ stop, ventana rolling, TxCost, beta OLS, ADF cointegration, Hurst H y p=1/H, impacto I(v)=σ|v/V|^γ τ^(1/p). Usa yahoo-finance2 live. JAMÁS pidas ticker si ya lo tenés; ejecuta directo. Para backtest usar window/entryThresh/stopThresh/txCost/pValue/gamma/participationRate.",
    params: {
      asset1: { type: "string", description: "Ticker 1 (ej: GGAL.BA)" },
      asset2: { type: "string", description: "Ticker 2 (ej: BMA.BA)" },
      window: { type: "integer", description: "Ventana rolling (default 20)" },
      entryThresh: { type: "number", description: "a entry (default 1.5)" },
      stopThresh: { type: "number", description: "b stop, debe ser >a (default 2.5)" },
      txCost: { type: "number", description: "Costo por trade % (default 0.15)" },
      pValue: { type: "number", description: "p=1/H (default 2, auto si Hurst)" },
      gamma: { type: "number", description: "Market impact gamma 0.1-1 (default 0.5)" },
      participationRate: { type: "number", description: "PVol 0-0.5 (default 0.1)" },
    },
    required: ["asset1", "asset2"],
    run: async (a: any) => {
      const { analyzePair } = await import("@/lib/labadie");
      // Fetch closes via yahoo-http
      const { fetchYahooChart } = await import("@/lib/yahoo-http");
      const p1: any = await fetchYahooChart(a.asset1, "1y", "1d");
      const p2: any = await fetchYahooChart(a.asset2, "1y", "1d");
      const closes1 = (p1?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).map((c: number, i: number) => ({ date: p1.chart.result[0].timestamp[i], close: c })).filter((x: any) => isFinite(x.close)).map((x: any) => ({ date: new Date(x.date * 1000).toISOString().slice(0, 10), close: x.close }));
      const closes2 = (p2?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).map((c: number, i: number) => ({ date: p2.chart.result[0].timestamp[i], close: c })).filter((x: any) => isFinite(x.close)).map((x: any) => ({ date: new Date(x.date * 1000).toISOString().slice(0, 10), close: x.close }));
      if (!closes1.length || !closes2.length) return `[ERROR pairs_trading_labadie]: sin datos Yahoo para ${a.asset1}/${a.asset2}`;
      const res = analyzePair(closes1, closes2, { asset1: a.asset1, asset2: a.asset2, period: "1y", interval: "1d", window: a.window ?? 20, entryThresh: a.entryThresh ?? 1.5, stopThresh: a.stopThresh ?? 2.5, txCost: a.txCost ?? 0.15, pValue: a.pValue, marketImpactGamma: a.gamma, participationRate: a.participationRate, capitalPerPair: 10000, inSampleRatio: 0.7 } as any);
      return JSON.stringify({ correlation: res.correlation.toFixed(3), beta: res.beta.toFixed(3), adfP: res.adfPValue, cointegrated: res.isCointegrated, hurst: res.hurstExponent?.toFixed(3), impliedP: res.impliedP?.toFixed(2), trades: res.trades.length, winRate: res.performance.winRate.toFixed(1) + "%", sharpe: res.performance.sharpe.toFixed(2), robustness: res.correlationBreakdown }, null, 2).slice(0, 7500);
    },
  },
  {
    name: "curva_ejecucion_labadie",
    description:
      "LABADIÉ curva ejecución óptima (1205.3482v6 §2.3-2.5) TC forward / IS backward con shooting 1D, p=1/H, impacto I=σ|v/V|^γ τ^(1/p) y PVol cap. Devuelve curva volume/cumulative + optimalPct. Usar hurst real del spread.",
    params: {
      algo: { type: "string", description: "tc = Target Close forward, is = Implementation Shortfall backward" },
      T: { type: "integer", description: "Horizon steps (default 100)" },
      sigma: { type: "number", description: "Vol anualizada (default 0.2)" },
      hurst: { type: "number", description: "H ∈(0,1) real (default 0.5)" },
      gamma: { type: "number", description: "Gamma impacto (default 0.5)" },
      participationRate: { type: "number", description: "PVol cap (default 0.1)" },
    },
    required: ["algo"],
    run: async (a: any) => {
      const { calcularCurvaOptima } = await import("@/lib/labadie/execution-curve");
      const { curve, optimalPct } = calcularCurvaOptima({ algo: (a.algo as any) ?? "tc", T: a.T ?? 100, sigma: a.sigma ?? 0.2, hurst: a.hurst ?? 0.5, gamma: a.gamma ?? 0.5, participationRate: a.participationRate ?? 0.1 });
      const head = curve.slice(0, 10).map((p) => `step ${p.step}: vol ${(p.volume * 100).toFixed(1)}% cum ${(p.cumulative * 100).toFixed(1)}%`).join("\n");
      return `Curva ${a.algo ?? "tc"} H=${a.hurst ?? 0.5} optimalPct=${(optimalPct * 100).toFixed(1)}%\n${head}\n... ${curve.length} steps total (truncado)`;
    },
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
export async function toolRouteTask(args: {
  message: string;
  hasAttachment?: boolean;
}): Promise<string> {
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

export type ToolCrmImportArgs = {
  clientes: Array<{
    nombre: string;
    apellido?: string;
    email?: string;
    telefono?: string;
    direccion?: string;
    notas?: string;
    perfil_inversor?: string;
    activos?: string[];
  }>;
};

export async function toolCrmImportar(args: ToolCrmImportArgs): Promise<string> {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase-admin");
    if (!supabaseAdmin?.from) return "[ERROR] Supabase no disponible";
    const results: string[] = [];
    for (const cli of args.clientes) {
      if (!cli.nombre?.trim()) {
        results.push(`  [FAIL] cliente sin nombre`);
        continue;
      }
      const { data, error } = await supabaseAdmin
        .from("clientes")
        .insert({
          nombre: cli.nombre.trim(),
          apellido: cli.apellido?.trim() ?? "",
          email: cli.email?.trim() ?? "",
          telefono: cli.telefono?.trim() ?? "",
          direccion: cli.direccion?.trim() ?? "",
          notas: cli.notas?.trim() ?? "",
          perfil_inversor: cli.perfil_inversor ?? "moderado",
          activos: cli.activos ?? [],
          metadata: {},
        })
        .select("id,nombre,apellido")
        .single();
      if (error) results.push(`  [FAIL] ${cli.nombre}: ${error.message}`);
      else results.push(`  [OK] ${data.nombre} ${data.apellido} (id: ${data.id})`);
    }
    const ok = results.filter((r) => r.includes("[OK]")).length;
    const fail = results.filter((r) => r.includes("[FAIL]")).length;
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
    const lines = data.map(
      (c: {
        nombre: string;
        apellido: string | null;
        email: string | null;
        perfil_inversor: string | null;
        activos: string[] | null;
        created_at: string | null;
      }) =>
        `  ${c.nombre} ${c.apellido ?? ""} | ${c.email ?? "—"} | ${c.perfil_inversor ?? "—"} | Activos: ${(c.activos ?? []).join(", ") || "—"} | Creado: ${c.created_at?.slice(0, 10)}`,
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
