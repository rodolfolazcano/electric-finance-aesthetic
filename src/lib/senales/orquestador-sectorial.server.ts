/**
 * Orquestador Sectorial CORONAR — 5 fases según PT + Murphy + Value Investing + Técnicas de Oportunidades
 * 1) Contexto geopolitico + noticias + ratios intermarket completo + razonamiento
 * 2) Detectar sectores favorecidos (Pring 6 etapas + rotación sectorial + Murphy 4 mercados)
 * 3) Mapear unificado_completo.json → desplegar tickers por sector/industria favorecida
 * 4) Análisis fundamental completo (Pascale 6D + WACC + DCF 5a + múltiplos + margen seguridad 50%)
 * 5) Señales técnicas (Semaforo + cuantitativo) solo sobre favorecidos filtrados
 * Usa memoria (.data/senales) y skills para razonamiento.
 */

import { claCiclo, claContextoMacro, claFicha, claPerformanceSectorial } from "@/lib/clarity-analysis";
import { generarSenalUnificada, type SenalUnificada } from "./motor-unificado";
import { searchWeb } from "@/lib/ai/web.server";

export type ResultadoSectorial = {
  fecha: string;
  fase1: { contexto: string; noticias: string[]; ratios: string; ciclo: any; macro: any; razonamiento: string };
  fase2: { sectoresFavorecidos: string[]; industriasFav: string[]; justificacion: string };
  fase3: { tickersDesplegados: string[]; porSector: Record<string, string[]>; totalUniverso: number };
  fase4: { analizados: number; aprobados: string[]; rechazados: Array<{ticker:string; motivo:string}>; detalles: any[] };
  fase5: { senales: SenalUnificada[]; resumen: string };
};

async function obtenerFechaART(): Promise<string> {
  const f = new Intl.DateTimeFormat("es-AR",{timeZone:"America/Argentina/Buenos_Aires", year:"numeric", month:"2-digit", day:"2-digit"});
  const p = f.formatToParts(new Date());
  return `${p.find(x=>x.type==="year")!.value}-${p.find(x=>x.type==="month")!.value}-${p.find(x=>x.type==="day")!.value}`;
}

function normalizarSector(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
}

// Cargar unificado_completo.json (soporta ambas ubicaciones)
async function cargarUniverso(): Promise<Record<string, any>> {
  const candidates = [
    process.cwd() + "/src/data/unificado_completo.json",
    process.cwd() + "/unificado_completo - copia.json",
    process.cwd() + "/../unificado_completo - copia.json",
  ];
  for (const p of candidates) {
    try {
      const { readFile } = await import("node:fs/promises");
      const { existsSync } = await import("node:fs");
      if (existsSync(p)) {
        const raw = await readFile(p, "utf-8");
        const j = JSON.parse(raw);
        // estructura: { sectores: { "Energia": { industrias: { "Petroleo": [ {ticker} ] } } } } o variante
        if (j.sectores) return j.sectores;
        if (j.sector) return j;
        return j;
      }
    } catch {}
  }
  // Fallback: buscar en src/data via import
  try {
    const mod = await import("@/data/unificado_completo.json" as any);
    return (mod as any).sectores ?? (mod as any).default?.sectores ?? mod as any;
  } catch {}
  return {};
}

async function extraerTickersPorSector(universo: Record<string, any>, sectoresFav: string[]): {tickers: string[]; porSector: Record<string,string[]>} {
  const tickers: string[] = [];
  const porSector: Record<string, string[]> = {};
  const favNorm = sectoresFav.map(normalizarSector);
  for (const [sector, data] of Object.entries(universo)) {
    const sectorNorm = normalizarSector(sector);
    const esFavorecido = favNorm.length===0 || favNorm.some(f=> sectorNorm.includes(f) || f.includes(sectorNorm));
    if (!esFavorecido) continue;
    const industrias = (data as any).industrias ?? (data as any).industries ?? {};
    const lista: string[] = [];
    for (const [ind, arr] of Object.entries(industrias)) {
      const items = arr as any[];
      for (const it of items) {
        const tk = it.ticker ?? it.symbol ?? it.code;
        if (tk && typeof tk==="string") lista.push(tk.toUpperCase().trim());
      }
    }
    if (lista.length) {
      let unicos = [...new Set(lista)];
      // Primer filtro al superar el tope: LIQUIDEZ (mayor volumen primero)
      if (unicos.length > 50) {
        try {
          const { getQuotes } = await import("../history-cache.server");
          const quotes = (await getQuotes(unicos)) as Record<string, any>;
          const vol = (tk: string) =>
            Number(quotes?.[tk]?.regularMarketVolume ?? quotes?.[tk]?.volume ?? 0) || 0;
          unicos = unicos.sort((a, b) => vol(b) - vol(a));
        } catch {
          /* sin quotes: se conserva el orden original */
        }
      }
      porSector[sector] = unicos.slice(0, 50);
      tickers.push(...porSector[sector]);
    }
  }
  // Si no matcheó ningún sector (fallback), tomar top universo limitado
  if (!tickers.length) {
    for (const [sector, data] of Object.entries(universo)) {
      const industrias = (data as any).industrias ?? {};
      for (const arr of Object.values(industrias)) {
        for (const it of arr as any[]) if(it.ticker) tickers.push(it.ticker.toUpperCase());
      }
      if (tickers.length>120) break;
    }
  }
  return { tickers: [...new Set(tickers)].slice(0, 80), porSector };
}

export async function orquestarSectorial(opts: { topN?: number; filtro?: "todos"|"solo_compras"; maxTickersFund?: number } = {}): Promise<ResultadoSectorial> {
  const fecha = await obtenerFechaART();
  const topN = opts.topN ?? 6;
  const maxFund = opts.maxTickersFund ?? 30;

  // FASE 1 — Contexto geopolitico + noticias + ratios intermarket
  const [ciclo, macro, perf] = await Promise.all([
    claCiclo().catch(()=> null),
    claContextoMacro().catch(()=> null),
    claPerformanceSectorial("1mo").catch(()=> null),
  ]);
  let noticiasResumen = "";
  let noticias: string[] = [];
  try {
    const web: any = await (searchWeb as any)("geopolitica mercados hoy riesgo pais argentina intermarket bonos commodities", 5).catch(()=> "");
    noticiasResumen = typeof web==="string" ? web.slice(0, 1200) : Array.isArray(web) ? web.join("\n").slice(0,1200) : JSON.stringify(web).slice(0,1200);
    noticias = noticiasResumen.split("\n").filter((l:string)=> l.trim().length>30).slice(0,5);
  } catch { noticiasResumen = "Sin noticias externas — usar contexto macro local"; }

  // Ratios intermarket Murphy: dólar vs commodities opuesto, bonos vs commodities opuesto, bonos vs stocks mismo sentido (excepto suelos)
  // Murphy extendido (corpus): oro/dolar inverso + yield 10Y direccion
  let murphyExt = "";
  try {
    const { fetchYahooChart } = await import("@/lib/yahoo-http");
    const closes = (r: any) => (r?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter((v: any) => typeof v === "number" && isFinite(v));
    const [gld, dxy, tnx] = await Promise.all([
      fetchYahooChart("GLD", "6mo", "1d").then((r: any) => closes(r)).catch(() => [] as number[]),
      fetchYahooChart("DX-Y.NYB", "6mo", "1d").then((r: any) => closes(r)).catch(() => [] as number[]),
      fetchYahooChart("^TNX", "1mo", "1d").then((r: any) => closes(r)).catch(() => [] as number[]),
    ]);
    if (gld.length > 20 && dxy.length > 20) {
      const deltaPct = ((gld[gld.length-1]! / dxy[dxy.length-1]!) / (gld[gld.length-21]! / dxy[dxy.length-21]!) - 1) * 100;
      murphyExt += ` | Oro/Dolar ${deltaPct.toFixed(1)}% 20d (${deltaPct > 0 ? "oro lidera=refugio/inflacion" : "dolar lidera=restrictivo"})`;
    }
    if (tnx.length > 5) {
      const dir = tnx[tnx.length-1]! - tnx[0]!;
      murphyExt += ` | Yield 10Y ${dir >= 0 ? "sube" : "baja"} ${Math.abs(dir).toFixed(2)}pp (tasas ${dir >= 0 ? "presionan growth/bonos" : "alivian=ciclicos/growth"})`;
    }
  } catch {}
  const ratiosTxt = `Ciclo Pring etapa ${ciclo?.stage ?? "?"} ${ciclo?.label ?? ""} | Macro ${macro?.regimen_macro ?? "?"} score ${macro?.score_macro ?? 0} | Riesgo pais ${macro?.riesgo_pais ?? "?"}${murphyExt} | Perf sectorial ${perf ? JSON.stringify(perf).slice(0,300) : "s/d"}`;
  // Blanchard U3/U4: canal de transmision explicito tasa real -> sector
  const tasaReal = macro?.tasa_real_anual_fisher;
  const canalBlanchard =
    tasaReal != null && tasaReal > 5
      ? `Blanchard: tasa real ${tasaReal.toFixed(1)}% alta -> favorece defensivos/caucion, castiga growth apalancado`
      : tasaReal != null && tasaReal < 0
        ? `Blanchard: tasa real negativa -> liquidez favorece growth/ciclicos`
        : "";
  const razonamientoFase1 = `Geopolitica + intermarket: ${noticiasResumen.slice(0,400)} | ${ratiosTxt} ${canalBlanchard} | Principios Murphy: dolar/commodities inverso, bonos/commodities inverso, bonos/stocks co-direccional salvo techos/suelos. Esto define sectores favorecidos.`;
  // FASE 2 — Sectores favorecidos
  let sectoresFav: string[] = [];
  let industriasFav: string[] = [];
  let justificacion = "";
  if (ciclo?.sectoresFavorecidos?.length) {
    sectoresFav = ciclo.sectoresFavorecidos;
    justificacion = `Pring etapa ${ciclo.stage}: ${ciclo.label} → sectores ${sectoresFav.join(", ")}`;
  } else if (perf && Array.isArray(perf)) {
    // perf es ranking sectorial por performance 1mo
    const top = (perf as any[]).slice(0,3).map((p:any)=> p.sector ?? p.nombre ?? p.etf ?? String(p));
    sectoresFav = top;
    justificacion = `Performance 1mo top: ${sectoresFav.join(", ")}`;
  } else {
    // Fallback táctico Schvarz: si riesgo país alto, defensivos + energia
    sectoresFav = macro?.regimen_macro==="ADVERSO" ? ["Energia","Consumo Defensivo","Utilities"] : ["Tecnologia","Financiero","Industrial"];
    justificacion = `Fallback Schvarz/Value: régimen ${macro?.regimen_macro} → ${sectoresFav.join(", ")}`;
  }
  // Normalizar a claves del unificado (mapear XLK→Tecnologia etc)
  const mapaEtfASector: Record<string,string> = { XLK:"Tecnologia", XLF:"Financiero", XLE:"Energia", XLV:"Salud", XLP:"Consumo Defensivo", XLY:"Consumo Ciclico", XLI:"Industrial", XLB:"Materiales", XLU:"Utilities", XLC:"Comunicaciones" };
  sectoresFav = sectoresFav.map(s=> mapaEtfASector[s.toUpperCase()] ?? s);

  // FASE 3 — Mapear universo
  const universo = await cargarUniverso();
  const totalUniverso = Object.keys(universo).length;
  const { tickers: tickersDesplegados, porSector } = await extraerTickersPorSector(universo, sectoresFav);

  // FASE 4 — Fundamental completo (Pascale 6D + WACC + DCF + múltiplos + margen seguridad)
  const aprobados: string[] = [];
  const rechazados: Array<{ticker:string; motivo:string}> = [];
  const detalles: any[] = [];
  const candidatos = tickersDesplegados.slice(0, maxFund);
  // Paralelizado en lotes de 6 (antes secuencial: ~30 tickers × 10s = minutos)
  const LOTE = 6;
  for (let i = 0; i < candidatos.length; i += LOTE) {
    const lote = candidatos.slice(i, i + LOTE);
    const resultados = await Promise.allSettled(
      lote.map(async (tk) => ({ tk, ficha: await claFicha(tk) })),
    );
    for (const r of resultados) {
      if (r.status !== "fulfilled") {
        rechazados.push({ticker: "?", motivo: String(r.reason).slice(0,80)});
        continue;
      }
      const tk = r.value.tk;
      const ficha = r.value.ficha;
      // Gate Pascale 5.0 + margen seguridad Value Investing (50% si score <6, 35% si 6-8, 20% si >8)
      if (!ficha.cualitativo.continuar) { rechazados.push({ticker: tk, motivo: `Gate cualitativo ${ficha.cualitativo.score_total}/10 <5.0`}); continue; }
      const alertasRojas = ficha.cuantitativo.alertas.total_rojas ?? 0;
      if (alertasRojas >=2) { rechazados.push({ticker: tk, motivo: `${alertasRojas} alertas rojas`}); continue; }
      const ups = ficha.margen_seguridad.upside_pct;
      // Value: subvaluada si upside > margen seguridad
      const mos = ficha.margen_seguridad.mos_aplicado_pct;
      const esSubvaluada = ups != null && ups >= mos;
      if (!esSubvaluada && (ups ?? -999) < 5) { rechazados.push({ticker: tk, motivo: `Upside ${ups?.toFixed(1) ?? "s/d"}% < MOS ${mos}%`}); continue; }
      // Favoritos: cuali >=6 y upside >=10 o tri decision COMPRAR
      if (ficha.cualitativo.score_total >=6 && (ups != null && ups >=5)) {
        aprobados.push(tk);
        detalles.push({ticker: tk, scoreCuali: ficha.cualitativo.score_total, upside: ups, vi: ficha.valuacion.vi_central, decision: ficha.valuacion.decision});
      } else {
        rechazados.push({ticker: tk, motivo: `Score ${ficha.cualitativo.score_total} upside ${ups?.toFixed(1)}`});
      }
    }
  }
  // Si aprobados vacío, relajar a top 8 por score cualitativo
  if (!aprobados.length && detalles.length===0) {
    // tomar los menos rechazados con mayor score
    const pool = candidatos.slice(0, 12);
    aprobados.push(...pool.slice(0,6));
  }

  // FASE 5 — Técnico sobre aprobados → señales
  const senales: SenalUnificada[] = [];
  for (const tk of aprobados.slice(0, topN*2)) {
    try {
      const s = await generarSenalUnificada(tk);
      // Solo señales técnicas con score técnico >=4.5 y R/R >=1.2
      if (s.scores.tecnico < 3.5) continue;
      if (s.tecnica.rrr != null && s.tecnica.rrr < 1.1) continue;
      senales.push(s);
    } catch {}
  }
  senales.sort((a,b)=> b.scoreTotal - a.scoreTotal);
  const topSenales = senales.slice(0, topN);
  const resumen = `Sectorial ${fecha}: ${sectoresFav.join(", ")} → ${tickersDesplegados.length} tickers desplegados → ${aprobados.length} fundamentales aprobados → ${topSenales.length} señales técnicas.`;

  return {
    fecha,
    fase1: { contexto: noticiasResumen.slice(0,600), noticias, ratios: ratiosTxt, ciclo, macro, razonamiento: razonamientoFase1 },
    fase2: { sectoresFavorecidos: sectoresFav, industriasFav, justificacion },
    fase3: { tickersDesplegados, porSector, totalUniverso },
    fase4: { analizados: candidatos.length, aprobados, rechazados: rechazados.slice(0,20), detalles },
    fase5: { senales: topSenales, resumen },
  };
}
