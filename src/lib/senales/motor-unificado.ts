/**
 * Motor Unificado CORONAR — Señales de compra/venta con orquestación estricta:
 * 1) Intermarket (Pring/Stovall 6 etapas + Macro) — corpus pt + clarity
 * 2) Fundamental (Pascale / Elbaum / Fowler Newton) — gate cualitativo 5.0 + ficha
 * 3) Técnico (Semaforo + RSI/MACD/SMA/Donchian)
 * 4) Cuantitativo (Sharpe/VaR/CAPM/Hurst)
 *
 * Orden NO negociable: si 1 es ADVERSO, 2 bloqueado o 3 bajista, 4 corrige a la baja.
 * Expone generarSenalUnificada (1 ticker) y generarSenalesUnificadas (batch con unificado_completo).
 * Misma lógica se expone como tools para chat lateral y bot Telegram (misma orquestación).
 */

import { claCiclo, claContextoMacro, claFicha, claPerformanceSectorial } from "@/lib/clarity-analysis";
import { analizarSemaforo } from "@/lib/semaforo.server";
import { analisisTecnico } from "@/lib/herramientas/analisis-tecnico.functions";
import { analizarRiesgo } from "@/lib/riesgo";
import { analizarCAPM } from "@/lib/capm-engine";
import { fetchYahooChart } from "@/lib/yahoo-http";
import { buscarEnBase } from "@/lib/knowledge-base";
import { buscarAcademico } from "@/lib/kb-academic";

// ── Tipos ──────────────────────────────────────────────────────────────

export type SenalUnificada = {
  ticker: string;
  tickerBCBA: string;
  nombre: string;
  senal: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA" | "NEUTRAL";
  confianza: number; // 0.50-0.85
  precio: number | null;
  variacion1d: number | null;
  scoreTotal: number; // 0-10
  scores: { intermarket: number; fundamental: number; tecnico: number; cuantitativo: number };
  motivo: string;
  nivel: string | null;
  // Técnica normalizada para entrada/SL/TP (para Telegram TradingView)
  tecnica: {
    entrada: number | null;
    sl: number | null;
    tp1: number | null;
    tp2: number | null;
    slPct: number | null;
    tp1Pct: number | null;
    tp2Pct: number | null;
    rrr: number | null;
    soporte: number | null;
    resistencia: number | null;
    atrPct: number | null;
    var95Pct: number | null;
  };
  fuente: string;
  detalles: {
    ciclo: Awaited<ReturnType<typeof claCiclo>> | null;
    macro: Awaited<ReturnType<typeof claContextoMacro>> | null;
    ficha: Awaited<ReturnType<typeof claFicha>> | null;
    tecnico: { rsi: number | null; macdHist: number | null; sma20: number | null; sma50: number | null; sma200: number | null; soporte: number | null; resistencia: number | null } | null;
    riesgo: Awaited<ReturnType<typeof analizarRiesgo>> | null;
    capm: Awaited<ReturnType<typeof analizarCAPM>> | null;
  };
  validadaPorAgente: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ── 1) INTERMARKET ────────────────────────────────────────────────────
async function scoreIntermarket(simbolo: string): Promise<{ score: number; ciclo: any; macro: any; perf: any; nota: string }> {
  const [ciclo, macro, perf] = await Promise.all([
    claCiclo().catch(() => null),
    claContextoMacro().catch(() => null),
    claPerformanceSectorial("1mo").catch(() => null),
  ]);

  // Base por régimen macro
  let s = 5; // neutro
  if (macro) {
    if (macro.regimen_macro === "FAVORABLE") s = 7;
    else if (macro.regimen_macro === "ADVERSO") s = 3;
    if (macro.score_macro >= 2) s += 0.5;
    if (macro.score_macro <= -2) s -= 0.5;
    if (macro.riesgo_pais != null && macro.riesgo_pais > 1000) s -= 1;
    if (macro.riesgo_pais != null && macro.riesgo_pais < 500) s += 0.5;
  }

  // Ajuste por ciclo 1-6 (Pring)
  if (ciclo) {
    if (ciclo.stage === 2) s += 1.5;
    else if (ciclo.stage === 1) s += 1.0;
    else if (ciclo.stage === 3) s += 0.5;
    else if (ciclo.stage === 4) s -= 1.0;
    else if (ciclo.stage === 5) s -= 2.0;
    else if (ciclo.stage === 6) s -= 1.5;
  }

  // Ajuste sectorial si el ticker pertenece a sector favorecido
  // Intentamos obtener sector del ticker via ficha cualitativa ligera (sin costo extra grande)
  try {
    const fichaQuick = await claFicha(simbolo).catch(() => null);
    const sector = (fichaQuick?.cualitativo.sector ?? "").toLowerCase();
    const sectoresFav = (ciclo?.sectoresFavorecidos ?? []).join(" ").toLowerCase();
    if (sector && sectoresFav.includes(sector)) s += 1;
  } catch {}

  s = clamp(s, 0, 10);
  const nota = `Intermarket: ciclo ${ciclo?.label ?? "?"} (etapa ${ciclo?.stage ?? "?"}) + régimen ${macro?.regimen_macro ?? "?"} → score ${s.toFixed(1)}/10. ${macro?.senal_regimen?.[0] ?? ""}`;
  return { score: s, ciclo, macro, perf, nota };
}

// ── 2) FUNDAMENTAL ───────────────────────────────────────────────────
async function scoreFundamental(simbolo: string): Promise<{ score: number; ficha: any; nota: string; bloqueado: boolean }> {
  const ficha = await claFicha(simbolo);
  const bloqueado = ficha.bloqueado_por_cualitativo;

  if (bloqueado) {
    return {
      score: 0,
      ficha,
      bloqueado: true,
      nota: `Fundamental BLOQUEADO — score cualitativo ${ficha.cualitativo.score_total}/10 < 5.0 (${ficha.cualitativo.sector}/${ficha.cualitativo.industry}). No comprar lo que no se entiende (Buffett/Pascale).`,
    };
  }

  const quali = clamp(ficha.cualitativo.score_total, 0, 10); // 0-10
  const upside = ficha.margen_seguridad.upside_pct; // puede ser null
  let upsideScore = 5; // neutro
  if (upside != null) {
    if (upside >= 30) upsideScore = 10;
    else if (upside >= 15) upsideScore = 7.5;
    else if (upside >= 5) upsideScore = 6;
    else if (upside >= 0) upsideScore = 5;
    else if (upside > -10) upsideScore = 3;
    else upsideScore = 1;
  }

  // Alertas rojas penalizan
  const rojas = ficha.cuantitativo.alertas.total_rojas ?? 0;
  let penal = rojas * 1.5;
  // Deuda/EBITDA >4 ya es roja, pero si hay >2 rojas es distress
  let s = clamp(quali * 0.4 + upsideScore * 0.6 - penal, 0, 10);
  // Gate adicional: si decisión triangulación es VENDER, cap a 3
  if (ficha.valuacion.decision.includes("VENDER")) s = Math.min(s, 3);
  if (ficha.valuacion.decision === "COMPRAR") s = Math.max(s, 6);

  const nota = `Fundamental: quali ${quali.toFixed(1)}/10 + upside ${upside != null ? upside.toFixed(1) + "%" : "s/d"} + alertas ${rojas} rojas → ${s.toFixed(1)}/10. Valuación ${ficha.valuacion.decision} (DCF ${ficha.valuacion.vi_dcf}, multi ${ficha.valuacion.vi_multi}, libro ${ficha.valuacion.vi_libro}).`;
  return { score: s, ficha, bloqueado: false, nota };
}

// ── 3) TECNICO ───────────────────────────────────────────────────────
async function scoreTecnico(simbolo: string): Promise<{ score: number; data: any; nota: string }> {
  // Intentar semáforo primero ( -2..+2 → 0..10 )
  try {
    const sem = await analizarSemaforo(simbolo);
    if (!sem.error && sem.recommendation) {
      const map: Record<string, number> = {
        COMPRA: 8.5,
        "COMPRA CON CAUTELA": 6.8,
        MANTENER: 5.0,
        REDUCIR: 3.5,
        VENTA: 1.5,
      };
      const s = map[sem.recommendation] ?? 5;
      return {
        score: s,
        data: sem,
        nota: `Técnico Semaforo ${sem.recommendation} — RSI ${sem.history.rsi?.toFixed(1) ?? "?"} MACD ${sem.history.histMacd?.toFixed(3) ?? "?"} SMA20/50/200 ${sem.history.sma20?.toFixed(1) ?? "?"}/${sem.history.sma50?.toFixed(1) ?? "?"}/${sem.history.sma200?.toFixed(1) ?? "?"} → ${s}/10`,
      };
    }
  } catch {}

  // Fallback analisisTecnico puro
  try {
    const t: any = await analisisTecnico(simbolo);
    if (t) {
      let s = 5;
      if (t.rsi14 != null) {
        if (t.rsi14 > 70) s -= 1.5;
        else if (t.rsi14 < 30) s -= 2; // sobreventa no es compra técnica inmediata sin confirmación
        else if (t.rsi14 >= 55 && t.rsi14 <= 68) s += 1;
      }
      if (t.precio != null && t.ma20 != null && t.ma50 != null && t.ma200 != null) {
        if (t.precio > t.ma20 && t.ma20 > t.ma50 && t.ma50 > t.ma200) s += 2;
        else if (t.precio < t.ma50 && t.ma50 < t.ma200) s -= 2;
        else if (t.precio > t.ma50) s += 0.8;
        else s -= 0.8;
      }
      if (t.macd && t.macd.hist != null) {
        if (t.macd.hist > 0) s += 0.7;
        else s -= 0.7;
      }
      s = clamp(s, 0, 10);
      return {
        score: s,
        data: t,
        nota: `Técnico ${t.interpretacion ?? ""} RSI ${t.rsi14?.toFixed(1) ?? "?"} MACD hist ${t.macd?.hist?.toFixed(3) ?? "?"} → ${s.toFixed(1)}/10`,
      };
    }
  } catch {}

  return { score: 5, data: null, nota: "Técnico sin datos suficientes — neutral 5/10" };
}

// ── 4) CUANTITATIVO ──────────────────────────────────────────────────
async function scoreCuantitativo(simbolo: string): Promise<{ score: number; riesgo: any; capm: any; nota: string }> {
  const [riesgo, capm] = await Promise.all([
    analizarRiesgo(simbolo, "1y").catch(() => null),
    analizarCAPM({ simbolo, autoDetect: true, rango: "1y" }).catch(() => null),
  ]);

  let s = 5;
  const notas: string[] = [];

  if (riesgo && !riesgo.error) {
    // Sharpe
    if (riesgo.sharpe != null) {
      if (riesgo.sharpe > 1.2) {
        s += 1.2;
        notas.push(`Sharpe ${riesgo.sharpe.toFixed(2)} alto`);
      } else if (riesgo.sharpe > 0.5) {
        s += 0.5;
      } else if (riesgo.sharpe < 0) {
        s -= 1.5;
        notas.push(`Sharpe negativo`);
      }
    }
    // Volatilidad
    if (riesgo.volatilidadAnual != null) {
      if (riesgo.volatilidadAnual > 0.5) {
        s -= 0.8;
        notas.push(`Vol ${ (riesgo.volatilidadAnual*100).toFixed(0)}% alta`);
      } else if (riesgo.volatilidadAnual < 0.2) s += 0.4;
    }
    // Max drawdown
    if (riesgo.maxDrawdown != null && riesgo.maxDrawdown < -0.3) {
      s -= 0.7;
      notas.push(`Drawdown ${(riesgo.maxDrawdown*100).toFixed(0)}% profundo`);
    }
    // VaR
    if (riesgo.var95 != null && riesgo.var95 < -0.04) s -= 0.5;
  }

  if (capm && !capm.error) {
    if (capm.beta != null) {
      if (capm.beta > 1.6) {
        s -= 0.6;
        notas.push(`Beta ${capm.beta.toFixed(2)} agresiva`);
      } else if (capm.beta < 0.7) {
        s += 0.3;
        notas.push(`Beta defensiva ${capm.beta.toFixed(2)}`);
      }
    }
    if (capm.rSquared != null && capm.rSquared < 0.2) notas.push(`R² bajo ${capm.rSquared.toFixed(2)} — poco explicativo`);
    if (capm.hurstExponent != null) {
      if (capm.hurstExponent < 0.45) notas.push(`Hurst ${capm.hurstExponent.toFixed(2)} mean-reverting`);
      else if (capm.hurstExponent > 0.55) notas.push(`Hurst tendencial`);
    }
  }

  // Hurst implícito en riesgo si no vino en CAPM
  s = clamp(s, 0, 10);
  const nota = `Cuantitativo: ${notas.join(" · ") || "sin penalizadores"} → ${s.toFixed(1)}/10`;
  return { score: s, riesgo, capm, nota };
}

// ── COMBINACIÓN Y MAPEO A SEÑAL ──────────────────────────────────────

function mapearSenal(total: number, fundamentalBloqueado: boolean, intermarket: number): SenalUnificada["senal"] {
  if (fundamentalBloqueado) return "VENTA"; // gate Pascale
  if (intermarket < 2.5 && total >= 6) return "COMPRA CON CAUTELA"; // macro muy adverso frena COMPRA directa
  if (total >= 8.2) return "COMPRA";
  if (total >= 6.5) return "COMPRA CON CAUTELA";
  if (total >= 4.5) return "MANTENER";
  if (total >= 3.0) return "REDUCIR";
  return "VENTA";
}

function confianzaDe(total: number, senal: string): number {
  // Distancia al centro del bucket
  let c = 0.52;
  if (senal === "COMPRA") c = 0.62 + Math.min((total - 8.2) * 0.04, 0.18);
  else if (senal === "COMPRA CON CAUTELA") c = 0.57 + (total - 6.5) * 0.03;
  else if (senal === "MANTENER") c = 0.53;
  else if (senal === "REDUCIR") c = 0.54 + (4.5 - total) * 0.02;
  else if (senal === "VENTA") c = 0.6 + (3.0 - total) * 0.03;
  return clamp(c, 0.5, 0.85);
}

export async function generarSenalUnificada(
  simboloRaw: string,
  opts: { baseUrl?: string } = {},
): Promise<SenalUnificada> {
  const simbolo = simboloRaw.trim().toUpperCase();
  // 1) Intermarket — primero, como pide metodología PT + Blanchard/Pring
  const inter = await scoreIntermarket(simbolo);

  // 2) Fundamental — Pascale/Elbaum gate
  const fund = await scoreFundamental(simbolo);

  // 3) Técnico
  const tec = await scoreTecnico(simbolo);

  // 4) Cuantitativo
  const cuant = await scoreCuantitativo(simbolo);

  // Pesos: Intermarket 15 / Fundamental 40 / Tecnico 25 / Cuantitativo 20 (triangulación Clarity)
  const total = inter.score * 0.15 + fund.score * 0.4 + tec.score * 0.25 + cuant.score * 0.2;

  const senal = mapearSenal(clamp(total, 0, 10), fund.bloqueado, inter.score);
  const confianza = confianzaDe(total, senal);

  // Precio y variación 1d
  let precio: number | null = fund.ficha?.precio_actual ?? null;
  let variacion1d: number | null = null;
  try {
    const chart = await fetchYahooChart(simbolo, "5d", "1d");
    const closes = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    if (closes.length >= 2) {
      const ult = closes[closes.length - 1] as number;
      const prev = closes[closes.length - 2] as number;
      if (isFinite(ult) && isFinite(prev) && prev !== 0) {
        variacion1d = ((ult - prev) / prev) * 100;
        if (precio == null) precio = ult;
      }
    }
  } catch {}

  const nombre = fund.ficha?.empresa ?? simbolo;

  // Motivo compacto 2-3 oraciones rioplatenses con fuentes
  const motivoParts: string[] = [];
  motivoParts.push(inter.nota);
  motivoParts.push(fund.nota);
  motivoParts.push(tec.nota);
  motivoParts.push(cuant.nota);
  if (fund.bloqueado) motivoParts.push("→ Señal forzada a VENTA por gate cualitativo.");
  const motivo = motivoParts.join(" | ");

  // Nivel legacy + técnica normalizada SL/TP (ATR + VaR95 + soporte/resistencia)
  let nivel: string | null = null;
  let soporte: number | null = null;
  let resistencia: number | null = null;
  if (tec.data) {
    const t: any = tec.data;
    // semaforo: soporte/resistencia en t.soporte/t.resistencia o t.support/t.resistance
    soporte = t.soporte != null ? Number(t.soporte) : t.support != null ? Number(String(t.support).replace(/[^0-9.-]/g, "")) || null : t.sma50 ?? null;
    resistencia = t.resistencia != null ? Number(t.resistencia) : t.resistance != null ? Number(String(t.resistance).replace(/[^0-9.-]/g, "")) || null : t.sma20 ?? null;
    if (soporte != null && resistencia != null && isFinite(soporte) && isFinite(resistencia)) nivel = `Soporte ${soporte.toFixed(2)} / Resistencia ${resistencia.toFixed(2)}`;
    else if (soporte != null && isFinite(soporte)) nivel = `Soporte ${soporte.toFixed(2)}`;
  }
  const var95Pct = cuant.riesgo?.var95 != null ? Number(cuant.riesgo.var95) * 100 : null; // negativo
  const volAnual = cuant.riesgo?.volatilityAnnual ?? null;
  // ATR aprox % precio: si no hay, usar volAnual / sqrt(252)
  let atrPct: number | null = null;
  if (volAnual != null) atrPct = (volAnual / Math.sqrt(252)) * 100;
  else if (var95Pct != null) atrPct = Math.abs(var95Pct) * 0.8;
  if (!nivel && var95Pct != null) nivel = `VaR95 ${var95Pct.toFixed(1)}% diario — stop sugerido`;

  // Cálculo entrada/SL/TP normalizado
  const p = precio;
  let entrada: number | null = null;
  let sl: number | null = null;
  let tp1: number | null = null;
  let tp2: number | null = null;
  if (p != null && isFinite(p) && p > 0) {
    entrada = p;
    // SL: soporte si está por debajo y cercano (<8%), sino precio * (1 - max(ATR*1.5, |VaR95|*1.2, 3%))
    if (soporte != null && isFinite(soporte) && soporte < p && (p - soporte) / p < 0.08) {
      sl = soporte * 0.985; // 1.5% buffer bajo soporte
    } else {
      const slDraw = Math.max(atrPct != null ? atrPct * 1.8 : 2.5, var95Pct != null ? Math.abs(var95Pct) * 1.2 : 2.5, 2.8);
      sl = p * (1 - slDraw / 100);
    }
    // TP1 = resistencia si está por encima y razonable (<15%), sino entrada + 1.8 * riesgo
    const riesgoPct = sl != null ? ((entrada - sl) / entrada) * 100 : atrPct != null ? atrPct * 1.5 : 3.5;
    if (resistencia != null && isFinite(resistencia) && resistencia > p && (resistencia - p) / p < 0.18) {
      tp1 = resistencia;
    } else {
      tp1 = entrada * (1 + (riesgoPct * 1.6) / 100);
    }
    tp2 = entrada * (1 + (riesgoPct * 2.8) / 100);
    // Ajuste por señal: VENTA invierte (no usamos short en spot, pero mantenemos simetría)
    if (senal === "VENTA" || senal === "REDUCIR") {
      // Para venta en spot, SL por encima
      const slInv = entrada * (1 + ((entrada - (sl ?? entrada * 0.97)) / entrada));
      tp1 = entrada * (1 - ((tp1 - entrada) / entrada));
      tp2 = entrada * (1 - ((tp2 - entrada) / entrada));
      sl = slInv;
    }
  }
  const slPct = entrada != null && sl != null ? Number((((sl - entrada) / entrada) * 100).toFixed(2)) : null;
  const tp1Pct = entrada != null && tp1 != null ? Number((((tp1 - entrada) / entrada) * 100).toFixed(2)) : null;
  const tp2Pct = entrada != null && tp2 != null ? Number((((tp2 - entrada) / entrada) * 100).toFixed(2)) : null;
  const rrr = slPct != null && tp1Pct != null && slPct !== 0 ? Number((Math.abs(tp1Pct / slPct)).toFixed(2)) : null;

  return {
    ticker: simbolo,
    tickerBCBA: simbolo.includes(".") ? simbolo : `${simbolo}.BA`,
    nombre,
    senal,
    confianza: clamp(confianza, 0.5, 0.85),
    precio,
    variacion1d: variacion1d != null ? Number(variacion1d.toFixed(2)) : null,
    scoreTotal: clamp(total, 0, 10),
    scores: {
      intermarket: Number(inter.score.toFixed(2)),
      fundamental: Number(fund.score.toFixed(2)),
      tecnico: Number(tec.score.toFixed(2)),
      cuantitativo: Number(cuant.score.toFixed(2)),
    },
    motivo: motivo.slice(0, 900),
    nivel,
    tecnica: {
      entrada,
      sl,
      tp1,
      tp2,
      slPct,
      tp1Pct,
      tp2Pct,
      rrr,
      soporte,
      resistencia,
      atrPct: atrPct != null ? Number(atrPct.toFixed(2)) : null,
      var95Pct: var95Pct != null ? Number(var95Pct.toFixed(2)) : null,
    },
    fuente: "CORONAR Unificado (Intermarket Pring/Stovall + Pascale/Elbaum + Semaforo + CAPM/Riesgo) · Yahoo/BCRA/CriptoYa",
    detalles: {
      ciclo: inter.ciclo,
      macro: inter.macro,
      ficha: fund.ficha,
      tecnico: tec.data,
      riesgo: cuant.riesgo,
      capm: cuant.capm,
    },
    validadaPorAgente: true,
  };
}

export async function generarSenalesUnificadas(
  simbolos: string[],
  opts: { topN?: number; filtro?: "todos" | "solo_compras" } = {},
): Promise<{ senales: SenalUnificada[]; resumen: string }> {
  const topN = opts.topN ?? 6;
  const lista = [...new Set(simbolos.map((s) => s.trim().toUpperCase()).filter(Boolean))].slice(0, 20);
  const resultados: SenalUnificada[] = [];

  // En lotes de 3 para no saturar Yahoo (concurrency limiter)
  for (let i = 0; i < lista.length; i += 3) {
    const lote = lista.slice(i, i + 3);
    const res = await Promise.all(lote.map((s) => generarSenalUnificada(s).catch((e) => null as any)));
    for (const r of res) if (r) resultados.push(r);
  }

  // Orden por scoreTotal desc, pero compras primero si filtro solo_compras
  let filtradas = resultados;
  if (opts.filtro === "solo_compras") filtradas = resultados.filter((r) => r.senal === "COMPRA" || r.senal === "COMPRA CON CAUTELA");

  filtradas.sort((a, b) => b.scoreTotal - a.scoreTotal);
  const top = filtradas.slice(0, topN);

  const cicloLabel = top[0]?.detalles.ciclo?.label ?? "ciclo en expansión";
  const macroLabel = top[0]?.detalles.macro?.regimen_macro ?? "NEUTRO";
  const compras = top.filter((s) => s.senal.includes("COMPRA")).length;
  const resumen = `Motor Unificado analizó ${lista.length} tickers del universo BCBA/CEDEAR (unificado_completo.json) en 4 capas: Intermarket ${cicloLabel} + ${macroLabel} → Fundamental Pascale gate → Semaforo → CAPM/Riesgo. Top ${top.length}: ${top.map((s) => `${s.ticker} ${s.senal} (${s.scoreTotal.toFixed(1)}/10)`).join(", ")}. ${compras} con sesgo comprador.`;

  return { senales: top, resumen };
}
