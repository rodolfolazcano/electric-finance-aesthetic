// Calendario de earnings semanales — mapea el universo de tickers del catálogo
// local (unificado_completo.json, ~5.5k símbolos US) con pocas llamadas al
// endpoint v7/finance/quote BATCH de Yahoo (devuelve marketCap y
// earningsTimestampStart/End por símbolo), filtra los que reportan en la
// ventana y por capitalización, y enriquece con la estadística de sorpresas de
// estimaciones-earnings.server.ts (bootstrap no paramétrico, estilo ESTIMACIONES.txt).
//
// Salida: mensaje HTML cronológico para Telegram con sesgo estadístico
// 🟢 positivo / 🔴 negativo / ⚪ neutro por empresa.

import { fetchYahooQuotesBatch } from "./yahoo-http";
import {
  analizarEarningsTicker,
  type EarningsEstimateResult,
} from "./estimaciones-earnings.server";

const CAP_MIN_DEFAULT = 2_000_000_000; // USD 2B
const TOP_POR_DIA_DEFAULT = 8;
const TAMANIO_BATCH = 50;
const CONCURRENCIA_ENRIQUECIMIENTO = 3;
const PRESUPUESTO_MS_SEMANAL = 240_000;
const PRESUPUESTO_MS_DIARIO = 120_000;

export type ModoEarnings = "semanal" | "diario";

export interface EmpresaEarnings {
  symbol: string;
  nombre: string;
  fecha: string; // YYYY-MM-DD (día UTC del reporte)
  horaArt: string | null;
  momento: string | null; // pre-apertura / post-cierre / s/d
  marketCap: number | null;
  epsEstimado: number | null;
  stats: EarningsEstimateResult | null;
  sesgo: "positivo" | "negativo" | "neutro";
}

export interface ResultadoEarnings {
  ok: boolean;
  modo: ModoEarnings;
  desde: string | null;
  hasta: string | null;
  empresas: EmpresaEarnings[];
  universoEscaneado: number;
  omitidasPorCap: number;
  texto: string;
}

function esHabil(d: Date): boolean {
  const dia = d.getUTCDay();
  return dia !== 0 && dia !== 6;
}

function isoFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Ventana [desde, hasta] ISO que cubre cada modo. */
export function fechasRango(modo: ModoEarnings): { desde: string; hasta: string } {
  const hoy = new Date();
  if (modo === "diario") {
    const hasta = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() + 1));
    return { desde: isoFecha(hoy), hasta: isoFecha(hasta) };
  }
  // semanal: lunes de esta semana → viernes de la próxima
  const diaSemana = (hoy.getUTCDay() + 6) % 7; // 0=lunes
  const lunes = new Date(
    Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate() - diaSemana),
  );
  const viernesProx = new Date(
    Date.UTC(lunes.getUTCFullYear(), lunes.getUTCMonth(), lunes.getUTCDate() + 11),
  ); // lunes+11 = viernes próxima semana
  return { desde: isoFecha(lunes), hasta: isoFecha(viernesProx) };
}

/** Universo US desde el catálogo local (sin .BA, sin índices ^ ni sufijos raros). */
async function cargarUniversoUs(): Promise<string[]> {
  let mod: any = null;
  try {
    mod = await import("@/data/unificado_completo.json");
  } catch (e) {
    console.error("[earnings-calendario] catálogo no disponible", e);
    return [];
  }
  const data = (mod?.default ?? mod) as any;
  const sectores = data?.sectores ?? {};
  const set = new Set<string>();
  for (const sector of Object.values<any>(sectores)) {
    const industrias = (sector as any)?.industrias ?? {};
    for (const lista of Object.values<any[]>(industrias)) {
      for (const item of lista as any[]) {
        const t = String(item?.ticker ?? "").toUpperCase();
        if (!t || t.endsWith(".BA")) continue;
        if (!/^[A-Z][A-Z0-9]{0,9}$/.test(t)) continue; // excluye ^, -, sufijos
        set.add(t);
      }
    }
  }
  return [...set];
}

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "object" && v !== null && "raw" in (v as any)) {
    const r = (v as any).raw;
    return typeof r === "number" && isFinite(r) ? r : null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    // ISO datetime ("2026-08-26T20:00:00Z")
    if (/[TZ]/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : Math.floor(d.getTime() / 1000);
    }
    const n = Number(s);
    return isFinite(n) ? n : null;
  }
  return null;
}

function clasificarSesgo(r: EarningsEstimateResult): EmpresaEarnings["sesgo"] {
  const tasaOk = r.tasaHistorica >= 0.55;
  const sorpresaOk = r.avgSorpresa > 0;
  const pos = [tasaOk, sorpresaOk].filter(Boolean).length;
  const prob = r.probSPositiva;
  if (pos === 2 || (prob != null && prob >= 0.65 && pos >= 1)) return "positivo";
  if (pos === 0 || (prob != null && prob <= 0.35 && pos <= 1)) return "negativo";
  return "neutro";
}

function horaDesdeEpoch(epochSeg: number | null): string | null {
  if (epochSeg == null) return null;
  try {
    return new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(epochSeg * 1000));
  } catch {
    return null;
  }
}

function momentoDesdeEpoch(epochSeg: number | null): string | null {
  if (epochSeg == null) return null;
  const hUtc = new Date(epochSeg * 1000).getUTCHours();
  if (hUtc <= 13) return "pre-apertura";
  if (hUtc >= 20) return "post-cierre";
  return null;
}

function fmtNum(v: number | null, dec = 2): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `$${v.toFixed(dec)}`;
}

function fmtPct(v: number | null, dec = 1): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

function fmtCap(v: number | null): string {
  if (v == null || !isFinite(v)) return "";
  if (v >= 1e12) return ` · ${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return ` · ${(v / 1e9).toFixed(0)}B`;
  if (v >= 1e6) return ` · ${(v / 1e6).toFixed(0)}M`;
  return "";
}

function emojiSesion(sesgo: EmpresaEarnings["sesgo"]): string {
  return sesgo === "positivo" ? "\u{1F7E9}" : sesgo === "negativo" ? "\u{1F7E5}" : "\u{26AA}";
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function etiquetaFecha(iso: string): string {
  const diasSemana = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const d = new Date(`${iso}T12:00:00Z`);
  return `${diasSemana[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${meses[d.getUTCMonth()]}`;
}

interface Candidato {
  symbol: string;
  fecha: string;
  tsStart: number | null;
  marketCap: number | null;
  nombreQuote: string | null;
}

/** Genera el análisis completo + mensaje HTML para el bot de señales. */
export async function generarEarnings(opts?: {
  modo?: ModoEarnings;
  topPorDia?: number;
  minCapUsd?: number;
  limiteUniverso?: number;
}): Promise<ResultadoEarnings> {
  const modo = opts?.modo ?? "semanal";
  const topPorDia = Math.min(15, Math.max(3, opts?.topPorDia ?? TOP_POR_DIA_DEFAULT));
  const minCap = opts?.minCapUsd ?? CAP_MIN_DEFAULT;
  const deadline = Date.now() + (modo === "semanal" ? PRESUPUESTO_MS_SEMANAL : PRESUPUESTO_MS_DIARIO);

  const { desde, hasta } = fechasRango(modo);
  const tsDesde = Math.floor(new Date(`${desde}T00:00:00Z`).getTime() / 1000);
  const tsHasta = Math.floor(new Date(`${hasta}T23:59:59Z`).getTime() / 1000);

  // 1) Universo + escaneo batch de quotes (marketCap + earningsTimestamp*)
  const universo0 = await cargarUniversoUs();
  const universo = opts?.limiteUniverso ? universo0.slice(0, opts.limiteUniverso) : universo0;
  if (!universo.length) {
    return vacio(modo, desde, hasta, "Catálogo de tickers no disponible.");
  }

  const candidatos = new Map<string, Candidato>();
  let escaneados = 0;
  let batchesVacios = 0;
  let omitidasPorCapScan = 0;
  const chunks: string[][] = [];
  for (let i = 0; i < universo.length; i += TAMANIO_BATCH) {
    chunks.push(universo.slice(i, i + TAMANIO_BATCH));
  }

  let chunkIdx = 0;
  let consecutivosVacios = 0;

  // Fallback B: yahoo-finance2 (sesión propia que atraviesa bloqueos donde el
  // fetch crudo recibe 429). allowAdditionalProps relaja el schema de batches.
  let _yf: any = null;
  const getYF = async (): Promise<any> => {
    if (_yf) return _yf;
    const mod: any = await import("yahoo-finance2");
    const YF = mod.default ?? mod;
    try {
      _yf = new YF({
        suppressNotices: ["yahooSurvey", "ripHistorical"],
        validation: { allowAdditionalProps: true, logErrors: false, logOptionsErrors: false },
      });
    } catch {
      _yf = typeof YF === "function" ? new YF() : YF;
    }
    return _yf;
  };
  const yfQuoteSeguro = async (parte: string[]): Promise<any[]> => {
    if (!parte.length) return [];
    const yf = await getYF();
    try {
      const res = await yf.quote(parte);
      return Array.isArray(res) ? res : [res];
    } catch {
      if (parte.length === 1) return [];
      const mid = Math.ceil(parte.length / 2);
      const [a, b] = await Promise.all([yfQuoteSeguro(parte.slice(0, mid)), yfQuoteSeguro(parte.slice(mid))]);
      return [...a, ...b];
    }
  };

  let primerError: string | null = null;
  let debugQuotes = 0; let debugConTs = 0; let debugEnVentana = 0; let debugCapOk = 0; let debugKeys = "";
  async function scanWorker(): Promise<void> {
    while (chunkIdx < chunks.length) {
      if (Date.now() > deadline) return;
      if (consecutivosVacios >= 8) return; // fallos sistemáticos: abortar ya
      const chunk = chunks[chunkIdx++]!;
      // Vía A: fetch crudo con sesión; Vía B: lib con bisect. Gana la primera que devuelva datos.
      let quotes = await fetchYahooQuotesBatch(chunk);
      if (!quotes.length) quotes = await yfQuoteSeguro(chunk);
      // Pacing: ráfagas sin pausa re-disparan el rate limit de Yahoo.
      await new Promise((r) => setTimeout(r, 180 + Math.random() * 220));
      if (!quotes.length) {
        batchesVacios++;
        consecutivosVacios++;
      } else {
        consecutivosVacios = 0;
        debugQuotes += quotes.length;
        if (!debugKeys && quotes[0]) debugKeys = Object.keys(quotes[0]).slice(0, 40).join(",");
      }
      for (const q of quotes) {
        escaneados++;
        const sym = String(q?.symbol ?? "").toUpperCase();
        if (!sym || candidatos.has(sym)) continue;
        // yf.quote devuelve ISO strings ("2026-08-26T20:00:00Z"); num() los convierte.
        const tsStart = num(q?.earningsTimestampStart) ?? num(q?.earningsTimestamp);
        const tsEnd = num(q?.earningsTimestampEnd);
        const ts = tsStart != null ? tsStart : tsEnd;
        if (ts == null) continue;
        debugConTs++;
        if (ts < tsDesde || ts > tsHasta) continue;
        debugEnVentana++;
        const cap = num(q?.marketCap);
        if (cap != null && cap < minCap) {
          omitidasPorCapScan++;
          continue;
        }
        debugCapOk++;
        candidatos.set(sym, {
          symbol: sym,
          fecha: new Date(ts * 1000).toISOString().slice(0, 10),
          tsStart: ts,
          marketCap: cap,
          nombreQuote:
            typeof q?.shortName === "string"
              ? q.shortName
              : typeof q?.longName === "string"
                ? q.longName
                : null,
        });
      }
    }
  }

  await Promise.all(Array.from({ length: 2 }, () => scanWorker()));

  if (!candidatos.size) {
    const motivo =
      batchesVacios >= 2
        ? `Yahoo Finance está limitando las consultas desde esta IP (rate limit). Reintentá en unos minutos.${primerError ? ` [debug: ${primerError}]` : ""}`
        : `No hay reportes con capitalización > USD ${Math.round(minCap / 1e9)}B en la ventana. [debugQuotes=${debugQuotes} conTs=${debugConTs} enVentana=${debugEnVentana} capOk=${debugCapOk} ventana=${desde}..${hasta} | keys: ${debugKeys}]`;
    return vacio(modo, desde, hasta, motivo);
  }

  // 2) Enriquecimiento estadístico (concurrencia limitada + deadline)
  const empresas: EmpresaEarnings[] = [];
  const lista = [...candidatos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < lista.length) {
      if (Date.now() > deadline) return;
      const c = lista[idx++]!;
      let stats: EarningsEstimateResult | null = null;

      // Cap real vía lib (v7 ya no devuelve marketCap): price del quoteSummary.
      if (c.marketCap == null) {
        try {
          const mod: any = await import("yahoo-finance2");
          const YF = mod.default ?? mod;
          const yf = new YF({ suppressNotices: ["yahooSurvey", "ripHistorical"] });
          const qsP = await yf.quoteSummary(c.symbol, { modules: ["price"] });
          if (qsP?.price?.marketCap != null) c.marketCap = Number(qsP.price.marketCap);
        } catch {
          /* cap opcional */
        }
        if (c.marketCap != null && c.marketCap < minCap) {
          omitidasPorCapScan++;
          continue;
        }
      }

      try {
        const full = await analizarEarningsTicker(c.symbol);
        if (full.nTrimestres >= 2) stats = full;
      } catch {
        /* stats opcionales */
      }
      if (stats && stats.proximoReporteEpoch != null) {
        const fechaStats = new Date(stats.proximoReporteEpoch * 1000).toISOString().slice(0, 10);
        if (fechaStats >= desde && fechaStats <= hasta) c.fecha = fechaStats;
      }
      empresas.push({
        symbol: c.symbol,
        nombre: stats?.companyName && stats.companyName !== c.symbol ? stats.companyName : c.nombreQuote ?? c.symbol,
        fecha: c.fecha,
        horaArt: horaDesdeEpoch(stats?.proximoReporteEpoch ?? c.tsStart),
        momento: momentoDesdeEpoch(stats?.proximoReporteEpoch ?? c.tsStart),
        marketCap: c.marketCap,
        epsEstimado: stats?.epsEstimadoProximo ?? null,
        stats,
        sesgo: stats ? clasificarSesgo(stats) : "neutro",
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCIA_ENRIQUECIMIENTO, lista.length) }, () => worker()),
  );

  empresas.sort((a, b) => a.fecha.localeCompare(b.fecha) || (b.marketCap ?? 0) - (a.marketCap ?? 0));

  const texto = armarMensaje(empresas, modo, desde, hasta, topPorDia);
  return {
    ok: empresas.length > 0,
    modo,
    desde,
    hasta,
    empresas,
    universoEscaneado: escaneados,
    omitidasPorCap: omitidasPorCapScan,
    texto,
  };
}

function vacio(modo: ModoEarnings, desde: string, hasta: string, motivo: string): ResultadoEarnings {
  return {
    ok: false,
    modo,
    desde,
    hasta,
    empresas: [],
    universoEscaneado: 0,
    omitidasPorCap: 0,
    texto: motivo,
  };
}

function armarMensaje(
  empresas: EmpresaEarnings[],
  modo: ModoEarnings,
  desde: string,
  hasta: string,
  topPorDia: number,
): string {
  const titulo =
    modo === "semanal"
      ? `<b>\u{1F4C5} EARNINGS — SEMANA ACTUAL Y PRÓXIMA (${escapar(etiquetaFecha(desde))} → ${escapar(etiquetaFecha(hasta))})</b>`
      : `<b>\u{1F4C5} EARNINGS DE HOY Y MAÑANA</b>`;
  const lineas: string[] = [
    titulo,
    `<i>Sesgo estadístico: \u{1F7E9} positivo · \u{1F7E5} negativo · \u{26AA} neutro (histórico ~8 trim.: % acierto vs consenso + sorpresa promedio)</i>`,
  ];

  const fechasOrden = [...new Set(empresas.map((e) => e.fecha))].sort();
  let totalMostradas = 0;
  for (const fecha of fechasOrden) {
    const delDia = empresas
      .filter((e) => e.fecha === fecha)
      .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0))
      .slice(0, topPorDia);
    if (!delDia.length) continue;
    lineas.push(`\n<b>— ${escapar(etiquetaFecha(fecha))} —</b>`);
    for (const e of delDia) {
      totalMostradas++;
      const trozos = [
        `${emojiSesion(e.sesgo)} <b>${escapar(e.symbol)}</b>${fmtCap(e.marketCap)} — ${escapar(e.nombre.slice(0, 42))}`,
      ];
      const cuando = e.horaArt ? `${e.horaArt} ART` : "hora s/d";
      trozos.push(`${escapar(cuando)}${e.momento ? ` (${e.momento})` : ""}`);
      trozos.push(`EPS est. ${fmtNum(e.epsEstimado)}`);
      if (e.stats) {
        const s = e.stats;
        trozos.push(`acierto ${Math.round(s.tasaHistorica * 100)}%`);
        trozos.push(`sorp. prom. ${fmtPct(s.avgSorpresa)}`);
        if (s.probSPositiva != null) trozos.push(`P(+)=${Math.round(s.probSPositiva * 100)}%`);
      }
      lineas.push(trozos.join(" · "));
    }
    const ocultas = empresas.filter((e) => e.fecha === fecha).length - delDia.length;
    if (ocultas > 0) lineas.push(`<i>+${ocultas} más ese día</i>`);
  }

  if (!totalMostradas) {
    lineas.push("\nNo hay reportes que cumplan el filtro de capitalización en la ventana.");
  }
  lineas.push(
    `\n<i>Educativo — no recomendación. Fuente: Yahoo Finance. Generado ${new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date())} ART.</i>`,
  );
  return lineas.join("\n");
}
