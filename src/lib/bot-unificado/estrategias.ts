/**
 * Estrategias cuantitativas del Bot Unificado (capa de CANDIDATOS).
 *
 * Cada scanner usa solo datos reales (Yahoo Finance / RSS) y produce candidatos
 * con métricas verificables; el agente de razonamiento los valida después.
 * Fuentes metodológicas: Labadie stat-arb (z-score mu±a·sigma), bot_coronar
 * legacy (RSI+ATR+trailing), Pascale/Elbaum (valuación y carteras), Blanchard
 * (ciclo macro), Fowler Newton (calidad contable).
 */

import { enLotes, fundamentalesDe, serieDe } from "./datos";
import {
  atrAproximado,
  correlacion,
  donchian,
  macd,
  media,
  rsi,
  sma,
  zScoreUltimo,
} from "./indicadores";
import { PARES_STATARB, SECTORES_ETF, accionesOperables, cedearesOperables } from "./universo";
import type { CandidatoSenal } from "./tipos";

export type Scanner = () => Promise<CandidatoSenal[]>;

const MAX_CANDIDATOS_ESTRATEGIA = 3;

function clampProb(p: number): number {
  return Math.min(0.85, Math.max(0.5, p));
}

/* ────────────────────────── 1) Stat-Arb: pares ────────────────────────── */

export const escanearPares: Scanner = async () => {
  const candidatos: CandidatoSenal[] = [];
  for (const [symA, symB, etiqueta] of PARES_STATARB) {
    try {
      const [a, b] = await Promise.all([serieDe(symA, "1y"), serieDe(symB, "1y")]);
      if (!a.ok || !b.ok) continue;
      const n = Math.min(a.closes.length, b.closes.length);
      if (n < 80) continue;
      const ca = a.closes.slice(-n);
      const cb = b.closes.slice(-n);
      const spread = ca.map((v, i) => v / (cb[i] as number));
      const corr = correlacion(ca.map(Math.log).slice(-60), cb.map(Math.log).slice(-60));
      const z = zScoreUltimo(spread, 60);
      if (z == null || corr == null || corr < 0.5) continue;
      const precioA = a.ultimoPrecio!;
      const precioB = b.ultimoPrecio!;
      // |z| >= 2: el spread se estiró — se opera hacia la media (Labadie: entrada mu±a·sigma, a=2)
      if (z >= 2 && candidatos.length < MAX_CANDIDATOS_ESTRATEGIA) {
        candidatos.push({
          estrategia: "statarb-pares",
          tickerBCBA: symB,
          tickerUS: symB.replace(".BA", ""),
          direccion: "COMPRA",
          precio: precioB,
          nivel: `par ${symA}/${symB}: stop si spread supera z=3; objetivo z=0.5`,
          prob: clampProb(0.55 + Math.min(z - 2, 1.5) * 0.06),
          motivo: `Spread ${symA}/${symB} (${etiqueta}) en z=${z.toFixed(2)} sobre su media de 60 días (corr ${(corr * 100).toFixed(0)}%): ${symB} barata relativa vs ${symA}.`,
          metricas: { zSpread: Number(z.toFixed(2)), correlacionLog: Number(corr.toFixed(2)), ratioActual: Number(spread[spread.length - 1]!.toFixed(4)) },
        });
      } else if (z <= -2 && candidatos.length < MAX_CANDIDATOS_ESTRATEGIA) {
        candidatos.push({
          estrategia: "statarb-pares",
          tickerBCBA: symA,
          tickerUS: symA.replace(".BA", ""),
          direccion: "COMPRA",
          precio: precioA,
          nivel: `par ${symA}/${symB}: stop si spread supera z=-3; objetivo z=-0.5`,
          prob: clampProb(0.55 + Math.min(-z - 2, 1.5) * 0.06),
          motivo: `Spread ${symA}/${symB} (${etiqueta}) en z=${z.toFixed(2)} bajo su media de 60 días (corr ${(corr * 100).toFixed(0)}%): ${symA} barata relativa vs ${symB}.`,
          metricas: { zSpread: Number(z.toFixed(2)), correlacionLog: Number(corr.toFixed(2)), ratioActual: Number(spread[spread.length - 1]!.toFixed(4)) },
        });
      }
    } catch {
      /* par sin datos: omitir */
    }
  }
  return candidatos;
};

/* ─────────────── 2) Basis CEDEAR↔US (arbitraje de ratio) ─────────────── */

export const escanearBasisCedearUs: Scanner = async () => {
  const lista = cedearesOperables().slice(0, 14);
  const candidatos: CandidatoSenal[] = [];
  await enLotes(lista, 4, async (cedear) => {
    if (candidatos.length >= MAX_CANDIDATOS_ESTRATEGIA) return;
    try {
      const [bcba, us] = await Promise.all([serieDe(`${cedear}.BA`, "5d"), serieDe(cedear, "5d")]);
      if (!bcba.ok || !us.ok || bcba.variacionPct == null || us.variacionPct == null) return;
      const desvio = us.variacionPct - bcba.variacionPct;
      // El subyacente ya se movió y el CEDEAR local quedó atrás (o adelantado):
      // el arbitraje tiende a cerrar el desvío en la apertura siguiente.
      if (desvio >= 2.5) {
        candidatos.push({
          estrategia: "basis-cedear-us",
          tickerBCBA: cedear,
          tickerUS: cedear,
          direccion: "VENTA",
          precio: bcba.ultimoPrecio,
          nivel: `desvío ${desvio.toFixed(1)}% a favor del CEDEAR: tomar; objetivo cierre de brecha`,
          prob: clampProb(0.54 + Math.min(desvio - 2.5, 3) * 0.03),
          motivo: `${cedear} BCBA ${bcba.variacionPct!.toFixed(1)}% vs subyacente US ${us.variacionPct!.toFixed(1)}%: el CEDEAR cotiza por encima del movimiento del subyacente.`,
          metricas: { varBCBA: Number(bcba.variacionPct!.toFixed(2)), varUS: Number(us.variacionPct!.toFixed(2)), desvioPct: Number(desvio.toFixed(2)) },
        });
      } else if (desvio <= -2.5) {
        candidatos.push({
          estrategia: "basis-cedear-us",
          tickerBCBA: cedear,
          tickerUS: cedear,
          direccion: "COMPRA",
          precio: bcba.ultimoPrecio,
          nivel: `desvío ${Math.abs(desvio).toFixed(1)}% en contra del CEDEAR: catch-up esperado`,
          prob: clampProb(0.54 + Math.min(-desvio - 2.5, 3) * 0.03),
          motivo: `${cedear} BCBA ${bcba.variacionPct!.toFixed(1)}% vs subyacente US ${us.variacionPct!.toFixed(1)}%: el CEDEAR quedó rezagado frente al subyacente.`,
          metricas: { varBCBA: Number(bcba.variacionPct!.toFixed(2)), varUS: Number(us.variacionPct!.toFixed(2)), desvioPct: Number(desvio.toFixed(2)) },
        });
      }
    } catch {
      /* sin datos */
    }
  });
  return candidatos;
};

/* ──────────────── 3) Momentum / tendencia (SMA-MACD-DON) ──────────────── */

function universoTecnico(): string[] {
  const mix = [...cedearesOperables().slice(0, 10), ...accionesOperables().slice(0, 6)];
  return [...new Set(mix)];
}

export const escanearMomentum: Scanner = async () => {
  const candidatos: CandidatoSenal[] = [];
  await enLotes(universoTecnico(), 4, async (symbol) => {
    if (candidatos.length >= MAX_CANDIDATOS_ESTRATEGIA) return;
    const s = symbol.endsWith(".BA") ? symbol : `${symbol}`;
    const serie = await serieDe(s, "1y");
    if (!serie.ok || serie.closes.length < 210) return;
    const closes = serie.closes;
    const ultimo = closes[closes.length - 1]!;
    const s20 = sma(closes.slice(-60), 20);
    const s50 = sma(closes, 50);
    const s200 = sma(closes, 200);
    const m = macd(closes);
    const don = donchian(closes, 20);
    if (s20 == null || s50 == null || s200 == null) return;
    let puntosAlcistas = 0;
    let puntosBajistas = 0;
    if (ultimo > s50) puntosAlcistas++;
    else puntosBajistas++;
    if ((s20 as number) > s50) puntosAlcistas++;
    else puntosBajistas++;
    if (m.histograma != null && m.histograma > 0) puntosAlcistas++;
    else if (m.histograma != null) puntosBajistas++;
    if (don.superior != null && ultimo >= don.superior * 0.985) puntosAlcistas++;
    if (don.inferior != null && ultimo <= don.inferior * 1.015) puntosBajistas++;
    const atr = atrAproximado(closes);
    const stopBase = atr != null ? (atr * 2).toFixed(1) : "8";
    if (puntosAlcistas >= 3 && ultimo > s200 && candidatos.length < MAX_CANDIDATOS_ESTRATEGIA) {
      candidatos.push({
        estrategia: "momentum-tendencia",
        tickerBCBA: symbol,
        tickerUS: symbol.replace(".BA", ""),
        direccion: "COMPRA",
        precio: serie.ultimoPrecio,
        nivel: `tendencia alcista confirmada; stop sugerido ${stopBase}% (ATR×2); referencia canal 20d ${don.superior?.toFixed(2) ?? "--"}`,
        prob: clampProb(0.52 + puntosAlcistas * 0.02),
        motivo: `${symbol} con tendencia alcista: precio > SMA50 > SMA200, MACD positivo y ruptura/cercanía de máximo 20 días (${puntosAlcistas}/4 condiciones).`,
        metricas: { puntos: puntosAlcistas, sma50: Number(s50.toFixed(2)), sma200: Number(s200.toFixed(2)), macdHist: m.histograma != null ? Number(m.histograma.toFixed(3)) : null, atrPct: atr != null ? Number(atr.toFixed(2)) : null },
      });
    } else if (puntosBajistas >= 3 && ultimo < s200 && candidatos.length < MAX_CANDIDATOS_ESTRATEGIA) {
      candidatos.push({
        estrategia: "momentum-tendencia",
        tickerBCBA: symbol,
        tickerUS: symbol.replace(".BA", ""),
        direccion: "VENTA",
        precio: serie.ultimoPrecio,
        nivel: `tendencia bajista confirmada; stop ${stopBase}% (ATR×2) para cortos/reduce`,
        prob: clampProb(0.52 + puntosBajistas * 0.02),
        motivo: `${symbol} con tendencia bajista: precio < SMA50 < SMA200 y MACD negativo (${puntosBajistas}/4 condiciones).`,
        metricas: { puntos: puntosBajistas, sma50: Number(s50.toFixed(2)), sma200: Number(s200.toFixed(2)), macdHist: m.histograma != null ? Number(m.histograma.toFixed(3)) : null, atrPct: atr != null ? Number(atr.toFixed(2)) : null },
      });
    }
  });
  return candidatos;
};

/* ───────────────── 4) Mean-Reversion con RSI + ATR ───────────────── */

export const escanearMeanReversion: Scanner = async () => {
  const candidatos: CandidatoSenal[] = [];
  await enLotes(universoTecnico(), 4, async (symbol) => {
    if (candidatos.length >= MAX_CANDIDATOS_ESTRATEGIA) return;
    const serie = await serieDe(symbol.endsWith(".BA") ? symbol : symbol, "1y");
    if (!serie.ok || serie.closes.length < 120) return;
    const closes = serie.closes;
    const r = rsi(closes, 14);
    if (r == null) return;
    const atr = atrAproximado(closes);
    const s50 = sma(closes, 50);
    const perf20 = s50 ? ((closes[closes.length - 1]! - closes[closes.length - 21]!) / closes[closes.length - 21]!) * 100 : null;
    if (r <= 30 && candidatos.length < MAX_CANDIDATO_SLOTS(candidatos)) {
      const stop = atr != null ? Math.max(6, Math.min(atr * 2.5, 18)).toFixed(1) : "10";
      candidatos.push({
        estrategia: "mean-reversion-atr",
        tickerBCBA: symbol,
        tickerUS: symbol.replace(".BA", ""),
        direccion: "COMPRA",
        precio: serie.ultimoPrecio,
        nivel: `RSI ${r.toFixed(0)} sobrevendido; stop ${stop}% (ATR×2.5); salir con RSI > 45`,
        prob: clampProb(0.53 + (30 - r) * 0.008),
        motivo: `${symbol} en zona de sobreventa extrema: RSI(14) ${r.toFixed(0)}${perf20 != null ? `, corrección de ${perf20.toFixed(1)}% en 20 sesiones` : ""}. Reversión a la media estadística.`,
        metricas: { rsi14: Number(r.toFixed(1)), atrPct: atr != null ? Number(atr.toFixed(2)) : null, perf20d: perf20 != null ? Number(perf20.toFixed(2)) : null },
      });
    } else if (r >= 68 && (perf20 ?? 0) > 8 && candidatos.length < MAX_CANDIDATO_SLOTS(candidatos)) {
      candidatos.push({
        estrategia: "mean-reversion-atr",
        tickerBCBA: symbol,
        tickerUS: symbol.replace(".BA", ""),
        direccion: "VENTA",
        precio: serie.ultimoPrecio,
        nivel: `RSI ${r.toFixed(0)} sobrecomprado tras rally de ${perf20!.toFixed(1)}%; tomar ganancia parcial`,
        prob: clampProb(0.53 + (r - 68) * 0.01),
        motivo: `${symbol} extendido al alza: RSI(14) ${r.toFixed(0)} con suba de ${perf20!.toFixed(1)}% en 20 sesiones; riesgo de toma de ganancias.`,
        metricas: { rsi14: Number(r.toFixed(1)), atrPct: atr != null ? Number(atr.toFixed(2)) : null, perf20d: Number(perf20!.toFixed(2)) },
      });
    }
  });
  return candidatos;
};

/** helper para no exceder cupo dentro del callback de lotes */
function MAX_CANDIDATO_SLOTS(actuales: CandidatoSenal[]): number {
  return MAX_CANDIDATOS_ESTRATEGIA - actuales.length;
}

/* ──────────────────── 5) Value fundamental (Pascale) ──────────────────── */

export const escanearFundamental: Scanner = async () => {
  const lista = cedearesOperables().slice(0, 8);
  const candidatos: CandidatoSenal[] = [];
  await enLotes(lista, 3, async (usTicker) => {
    if (candidatos.length >= 2) return;
    const f = await fundamentalesDe(usTicker);
    if (!f) return;
    let score = 0;
    if (f.forwardPE != null && f.forwardPE > 0 && f.forwardPE < 18) score += 1;
    if (f.returnOnEquity != null && f.returnOnEquity > 0.15) score += 1;
    if (f.debtToEquity != null && f.debtToEquity < 100) score += 1;
    if (f.fcfYield != null && f.fcfYield > 0.04) score += 1;
    const upside = f.upsideAnalistasPct;
    if (score >= 3 && upside != null && upside > 12 && candidatos.length < 2) {
      candidatos.push({
        estrategia: "value-fundamental",
        tickerBCBA: usTicker,
        tickerUS: usTicker,
        direccion: "COMPRA",
        precio: f.currentPrice,
        nivel: `objetivo consenso USD ${f.targetMeanPrice?.toFixed(2) ?? "--"} (+${upside.toFixed(1)}%); margen de seguridad por triangulación múltiplos`,
        prob: clampProb(0.55 + score * 0.03 + Math.min(upside, 30) * 0.003),
        motivo: `${usTicker} cumple ${score}/4 filtros value (fwdP/E ${f.forwardPE?.toFixed(1) ?? "--"}, ROE ${((f.returnOnEquity ?? 0) * 100).toFixed(0)}%, D/E ${f.debtToEquity?.toFixed(0) ?? "--"}, FCF yield ${((f.fcfYield ?? 0) * 100).toFixed(1)}%) con upside de analistas +${upside.toFixed(1)}%.`,
        metricas: { scoreValue: score, forwardPE: f.forwardPE, roe: f.returnOnEquity, debtEquity: f.debtToEquity, fcfYield: f.fcfYield, upsidePct: upside },
      });
    } else if (upside != null && upside < -12 && candidatos.length < 2) {
      candidatos.push({
        estrategia: "value-fundamental",
        tickerBCBA: usTicker,
        tickerUS: usTicker,
        direccion: "VENTA",
        precio: f.currentPrice,
        nivel: `consenso USD ${f.targetMeanPrice!.toFixed(2)} (${upside.toFixed(1)}%) por debajo del precio`,
        prob: clampProb(0.53),
        motivo: `${usTicker} cotiza muy por encima del valor objetivo de analistas (${upside.toFixed(1)}%): riesgo valuación (múltiplos fwdP/E ${f.forwardPE?.toFixed(1) ?? "--"}).`,
        metricas: { forwardPE: f.forwardPE, upsidePct: upside },
      });
    }
  });
  return candidatos;
};

/* ─────────────────── 6) Rotación sectorial (ciclo) ─────────────────── */

export const escanearRotacionSectorial: Scanner = async () => {
  const candidatos: CandidatoSenal[] = [];
  const perf: Array<{ etf: string; nombre: string; locales: string[]; perf3m: number }> = [];
  await enLotes(SECTORES_ETF, 4, async ({ etf, nombre, locales }) => {
    const s = await serieDe(etf, "6mo");
    if (!s.ok || s.closes.length < 40) return;
    const primero = media(s.closes.slice(-63, -58) || []) || s.closes[Math.max(0, s.closes.length - 63)]!;
    const ultimo = s.closes[s.closes.length - 1]!;
    perf.push({ etf, nombre, locales, perf3m: ((ultimo - primero) / primero) * 100 });
  });
  if (perf.length < 5) return [];
  perf.sort((x, y) => y.perf3m - x.perf3m);
  const lider = perf[0]!;
  const cola = perf[perf.length - 1]!;
  if (lider.perf3m > 4 && lider.locales.length) {
    candidatos.push({
      estrategia: "rotacion-sectorial",
      tickerBCBA: lider.locales[0]!,
      tickerUS: lider.locales[0]!.replace(".BA", ""),
      direccion: "COMPRA",
      precio: null,
      nivel: `sobrepeso sectorial ${lider.nombre} (ETF ${lider.etf} +${lider.perf3m.toFixed(1)}% en 3M); exposición vía ${lider.locales.join(", ")}`,
      prob: clampProb(0.54 + Math.min(lider.perf3m, 15) * 0.005),
      motivo: `Rotación sectorial: ${lider.nombre} lidera el desempeño de 3 meses (+${lider.perf3m.toFixed(1)}%). Exposición local disponible vía ${lider.locales.join(", ")}.`,
      metricas: { perf3mLider: Number(lider.perf3m.toFixed(2)), sectoresMedidos: perf.length },
    });
  }
  if (cola.perf3m < -3 && cola.locales.length && cola.etf !== lider.etf) {
    candidatos.push({
      estrategia: "rotacion-sectorial",
      tickerBCBA: cola.locales[0]!,
      tickerUS: cola.locales[0]!.replace(".BA", ""),
      direccion: "NEUTRAL",
      precio: null,
      nivel: `subrepeso sectorial ${cola.nombre} (ETF ${cola.etf} ${cola.perf3m.toFixed(1)}% en 3M)`,
      prob: 0.51,
      motivo: `Rotación sectorial: ${cola.nombre} es el más débil de 3 meses (${cola.perf3m.toFixed(1)}%). Evitar nuevas exposiciones o reducir.`,
      metricas: { perf3mCola: Number(cola.perf3m.toFixed(2)), sectoresMedidos: perf.length },
    });
  }
  return candidatos;
};

/* ─────────────────── 7) Noticias y eventos (RSS) ─────────────────── */

let cacheNoticias: { titulos: string[]; fecha: number } | null = null;

async function titulosNoticias(): Promise<string[]> {
  if (cacheNoticias && Date.now() - cacheNoticias.fecha < 10 * 60 * 1000) return cacheNoticias.titulos;
  try {
    const { getMarketNews } = await import("@/lib/market-news.functions");
    const res: any = await (getMarketNews as any)();
    const items = res?.items ?? [];
    const titulos = items.slice(0, 15).map((it: any) => String(it.title ?? ""));
    cacheNoticias = { titulos, fecha: Date.now() };
    return titulos;
  } catch {
    return [];
  }
}

export const escanearNoticiasEventos: Scanner = async () => {
  const titulos = await titulosNoticias();
  if (!titulos.length) return [];
  const universo = [...new Set([...cedearesOperables(), ...accionesOperables().map((t) => t.replace(".BA", ""))])];
  const mencionados = new Set<string>();
  for (const titulo of titulos) {
    const t = titulo.toUpperCase();
    for (const ticker of universo) {
      if (t.includes(ticker)) mencionados.add(ticker);
    }
  }
  if (!mencionados.size) return [];
  const candidatos: CandidatoSenal[] = [];
  await enLotes([...mencionados].slice(0, 6), 3, async (ticker) => {
    if (candidatos.length >= 2) return;
    const serie = await serieDe(ticker.endsWith(".BA") ? ticker : ticker, "5d");
    if (!serie.ok || serie.variacionPct == null) return;
    const v = serie.variacionPct;
    if (Math.abs(v) < 2.2) return;
    candidatos.push({
      estrategia: "noticias-eventos",
      tickerBCBA: ticker,
      tickerUS: ticker.replace(".BA", ""),
      direccion: v <= -2.2 ? "COMPRA" : "NEUTRAL",
      precio: serie.ultimoPrecio,
      nivel: v <= -2.2 ? "caída con noticia identificada: esperar confirmación de volumen antes de entrar" : "movimiento con noticia: observar",
      prob: clampProb(v <= -2.2 ? 0.55 : 0.51),
      motivo: `${ticker} movió ${v.toFixed(1)}% con noticias del día: "${titulos.find((tt) => tt.toUpperCase().includes(ticker))?.slice(0, 110) ?? "titular relevante"}".`,
      metricas: { variacionPct: Number(v.toFixed(2)), enNoticias: 1 },
    });
  });
  return candidatos;
};

/* ───────────────────────── Registro de estrategias ───────────────────────── */

export interface DefinicionEstrategia {
  id: string;
  nombre: string;
  descripcion: string;
  fuenteAcademica: string;
  cadaMinutos: number;
  desde?: string | null;
  hasta?: string | null;
  escanear: Scanner;
}

export const ESTRATEGIAS: DefinicionEstrategia[] = [
  {
    id: "statarb-pares",
    nombre: "Stat-Arb de Pares",
    descripcion: "Z-score del spread entre pares cointegrados (CEDEAR↔CEDEAR, CEDEAR↔US, misma industria). Entrada |z|>=2.",
    fuenteAcademica: "Labadie — Statistical Arbitrage (mu ± a·sigma)",
    cadaMinutos: 360,
    escanear: escanearPares,
  },
  {
    id: "basis-cedear-us",
    nombre: "Basis CEDEAR ↔ Subyacente US",
    descripcion: "Desvíos intradía entre la variación del CEDEAR en BCBA y su subyacente NYSE/NASDAQ.",
    fuenteAcademica: "Arbitraje de ratio / microestructura (Kyle)",
    cadaMinutos: 120,
    escanear: escanearBasisCedearUs,
  },
  {
    id: "momentum-tendencia",
    nombre: "Momentum / Tendencia",
    descripcion: "Precio>SMA50>SMA200 + MACD positivo + ruptura Donchian 20. Señales de continuación.",
    fuenteAcademica: "Lectures algo trading (UNAM/Labadie)",
    cadaMinutos: 240,
    desde: "11:00",
    hasta: "23:00",
    escanear: escanearMomentum,
  },
  {
    id: "mean-reversion-atr",
    nombre: "Mean-Reversion RSI+ATR",
    descripcion: "Sobreventa/sobrecompra extrema (RSI14) con stops por volatilidad (ATR×2.5).",
    fuenteAcademica: "bot_coronar legacy (RSI+MAE/MFE+ATR trailing)",
    cadaMinutos: 240,
    escanear: escanearMeanReversion,
  },
  {
    id: "value-fundamental",
    nombre: "Value Fundamental",
    descripcion: "Filtros value (fwd P/E, ROE, D/E, FCF yield) + upside de consenso. Metodología Pascale.",
    fuenteAcademica: "Pascale DFIN — valuación y rendimiento normal",
    cadaMinutos: 720,
    escanear: escanearFundamental,
  },
  {
    id: "rotacion-sectorial",
    nombre: "Rotación Sectorial",
    descripcion: "Ranking de performance 3M de ETFs sectoriales → exposición local equivalente.",
    fuenteAcademica: "Blanchard/Pérez-Enrri — ciclo y política económica",
    cadaMinutos: 720,
    escanear: escanearRotacionSectorial,
  },
  {
    id: "noticias-eventos",
    nombre: "Noticias y Eventos",
    descripcion: "Tickers mencionados en el RSS financiero con movimiento significativo confirmado.",
    fuenteAcademica: "Event-driven + confirmación técnica",
    cadaMinutos: 90,
    escanear: escanearNoticiasEventos,
  },
];

export function obtenerEstrategia(id: string): DefinicionEstrategia | undefined {
  return ESTRATEGIAS.find((e) => e.id === id);
}
