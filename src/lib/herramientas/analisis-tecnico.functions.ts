/**
 * Análisis técnico completo — portado de insight-hub terminal.server.ts
 * (analisisTecnico) al proyecto, autocontenido sobre fetchYahooChart.
 *
 * Indicadores: precio/variación, MA20/50/200, EMA9, RSI14, MACD(12,26,9),
 * soporte/resistencia por pivotes, volatilidad anualizada, rango 52 semanas,
 * serie de 120 cierres e interpretación textual.
 */

import { fetchYahooChart } from "@/lib/yahoo-http";

/** Fallback propio: chart directo sin cookie/crumb probando ambos hosts. */
async function chartDirecto(
  simbolo: string,
): Promise<{ fechas: string[]; cierres: number[]; meta: Record<string, unknown> } | null> {
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const res = await fetch(
        `https://${host}/v8/finance/chart/${encodeURIComponent(simbolo)}?range=1y&interval=1d`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; AnalisisTecnico/1.0)",
            Accept: "application/json",
          },
        },
      );
      if (!res.ok) continue;
      const json = (await res.json()) as {
        chart?: { result?: Array<Record<string, unknown>> };
      };
      const r0 = json.chart?.result?.[0];
      if (!r0) continue;
      const ts = (r0["timestamp"] as number[] | undefined) ?? [];
      const closesRaw = ((
        r0["indicators"] as { quote?: Array<{ close?: (number | null)[] }> } | undefined
      )?.quote?.[0]?.close ?? []) as (number | null)[];
      const fechas: string[] = [];
      const cierres: number[] = [];
      for (let i = 0; i < ts.length; i++) {
        const c = closesRaw[i];
        if (typeof c === "number" && isFinite(c)) {
          fechas.push(new Date(ts[i]! * 1000).toISOString().slice(0, 10));
          cierres.push(c);
        }
      }
      if (cierres.length >= 30)
        return { fechas, cierres, meta: (r0["meta"] as Record<string, unknown>) ?? {} };
    } catch {
      /* siguiente host */
    }
  }
  return null;
}

export interface AnalisisTecnico {
  simbolo: string;
  nombre: string;
  moneda: string;
  precio: number;
  variacion: number;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  ema9: number | null;
  rsi14: number | null;
  macd: { macd: number; signal: number; hist: number } | null;
  soporte: number;
  resistencia: number;
  volatilidadAnual: number | null;
  maximo52: number | null;
  minimo52: number | null;
  serie: { fecha: string; cierre: number }[];
  interpretacion: string;
}

function sma(cierres: number[], periodo: number): number | null {
  if (cierres.length < periodo) return null;
  const slice = cierres.slice(-periodo);
  return slice.reduce((a, b) => a + b, 0) / periodo;
}

function ema(cierres: number[], periodo: number): number | null {
  if (cierres.length < periodo) return null;
  const k = 2 / (periodo + 1);
  let prev = cierres.slice(0, periodo).reduce((a, b) => a + b, 0) / periodo;
  for (let i = periodo; i < cierres.length; i++) {
    prev = cierres[i]! * k + prev * (1 - k);
  }
  return prev;
}

function rsi(cierres: number[], periodo = 14): number | null {
  if (cierres.length < periodo + 1) return null;
  let ganancias = 0;
  let perdidas = 0;
  for (let i = cierres.length - periodo; i < cierres.length; i++) {
    const d = cierres[i]! - cierres[i - 1]!;
    if (d >= 0) ganancias += d;
    else perdidas -= d;
  }
  const pg = ganancias / periodo;
  const pp = perdidas / periodo;
  if (pp === 0) return 100;
  const rs = pg / pp;
  return 100 - 100 / (1 + rs);
}

function macd(cierres: number[]): { macd: number; signal: number; hist: number } | null {
  if (cierres.length < 35) return null;
  const emaN = (arr: number[], p: number): number[] => {
    const k = 2 / (p + 1);
    const out: number[] = [];
    let prev = arr.slice(0, p).reduce((a, b) => a + b, 0) / p;
    out.push(prev);
    for (let i = p; i < arr.length; i++) {
      prev = arr[i]! * k + prev * (1 - k);
      out.push(prev);
    }
    return out;
  };
  const ema12 = emaN(cierres, 12);
  const ema26 = emaN(cierres, 26);
  const offset = ema26.length - ema12.length;
  const linea = ema12.slice(offset).map((v, i) => v - ema26[i]!);
  const signalArr = linea.slice(-9);
  const signal = signalArr.reduce((a, b) => a + b, 0) / signalArr.length;
  const macdVal = linea[linea.length - 1]!;
  return { macd: macdVal, signal, hist: macdVal - signal };
}

/** Soporte/resistencia por pivotes de fractales (mínimos/máximos locales de 5 velas). */
function soporteResistencia(cierres: number[]): { soporte: number; resistencia: number } {
  const precio = cierres[cierres.length - 1]!;
  const ventana = cierres.slice(-120);
  const soportes: number[] = [];
  const resistencias: number[] = [];
  for (let i = 2; i < ventana.length - 2; i++) {
    const a = ventana[i]!;
    if (a < ventana[i - 1]! && a < ventana[i - 2]! && a < ventana[i + 1]! && a < ventana[i + 2]!) {
      soportes.push(a);
    }
    if (a > ventana[i - 1]! && a > ventana[i - 2]! && a > ventana[i + 1]! && a > ventana[i + 2]!) {
      resistencias.push(a);
    }
  }
  const debajo = soportes.filter((s) => s < precio);
  const arriba = resistencias.filter((r) => r > precio);
  return {
    soporte: debajo.length ? Math.max(...debajo) : Math.min(...ventana),
    resistencia: arriba.length ? Math.min(...arriba) : Math.max(...ventana),
  };
}

function volatilidadAnual(cierres: number[]): number | null {
  if (cierres.length < 30) return null;
  const rets: number[] = [];
  for (let i = 1; i < cierres.length; i++) {
    if (cierres[i - 1]! > 0) rets.push((cierres[i]! - cierres[i - 1]!) / cierres[i - 1]!);
  }
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varianza = rets.reduce((s, x) => s + (x - m) ** 2, 0) / (rets.length - 1);
  return Math.sqrt(varianza) * Math.sqrt(252) * 100;
}

function interpretarTecnico(d: {
  precio: number;
  ma20: number | null;
  ma50: number | null;
  ma200: number | null;
  rsi: number | null;
  hist: number | null;
}): string {
  const partes: string[] = [];
  const { precio, ma20, ma50, ma200, rsi, hist } = d;
  if (ma20 != null && ma50 != null) {
    partes.push(
      ma20 > ma50
        ? "tendencia de corto plazo alcista (MA20 sobre MA50)"
        : "tendencia de corto plazo bajista (MA20 bajo MA50)",
    );
  }
  if (ma200 != null) {
    partes.push(
      precio > ma200
        ? "opera sobre su media de 200 (sesgo estructural positivo)"
        : "opera bajo su media de 200 (sesgo estructural negativo)",
    );
  }
  if (rsi != null) {
    if (rsi >= 70) partes.push(`RSI ${rsi.toFixed(0)} en zona de sobrecompra`);
    else if (rsi <= 30) partes.push(`RSI ${rsi.toFixed(0)} en zona de sobreventa`);
    else partes.push(`RSI ${rsi.toFixed(0)} neutral`);
  }
  if (hist != null)
    partes.push(
      hist > 0
        ? "histograma MACD positivo (momentum alcista)"
        : "histograma MACD negativo (momentum bajista)",
    );
  return partes.join("; ") + ".";
}

export async function analisisTecnico(simbolo: string): Promise<AnalisisTecnico | null> {
  const limpio = simbolo.trim();
  // 1) Helper raíz (con reintentos); 2) fallback directo sin sesión.
  const chart = await fetchYahooChart(limpio, "1y", "1d");
  let res = chart?.chart?.result?.[0];
  let ts = res?.timestamp ?? [];
  let closesRaw = res?.indicators?.quote?.[0]?.close ?? [];
  if (!ts.length || !closesRaw.some((c) => typeof c === "number")) {
    const alt = await chartDirecto(limpio);
    if (!alt) return null;
    ts = alt.fechas.map((f) => Date.parse(f) / 1000);
    closesRaw = alt.cierres;
    res = { meta: alt.meta } as typeof res;
  }
  const fechas: string[] = [];
  const cierres: number[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = closesRaw[i];
    if (typeof c === "number" && isFinite(c)) {
      fechas.push(new Date(ts[i]! * 1000).toISOString().slice(0, 10));
      cierres.push(c);
    }
  }
  if (cierres.length < 30) return null;

  const precio = cierres[cierres.length - 1]!;
  const cierreAnterior = cierres[cierres.length - 2] ?? precio;
  const sr = soporteResistencia(cierres);
  const macdv = macd(cierres);
  const ma20 = sma(cierres, 20);
  const ma50 = sma(cierres, 50);
  const ma200 = cierres.length >= 200 ? sma(cierres, 200) : null;
  const r = rsi(cierres, 14);
  const ventana52 = cierres.slice(-252);

  return {
    simbolo: res?.meta?.symbol ?? simbolo.toUpperCase(),
    nombre: res?.meta?.longName || res?.meta?.shortName || simbolo.toUpperCase(),
    moneda: res?.meta?.currency ?? "",
    precio,
    variacion: cierreAnterior ? ((precio - cierreAnterior) / cierreAnterior) * 100 : 0,
    ma20,
    ma50,
    ma200,
    ema9: ema(cierres, 9),
    rsi14: r,
    macd: macdv,
    soporte: sr.soporte,
    resistencia: sr.resistencia,
    volatilidadAnual: volatilidadAnual(cierres),
    maximo52: Math.max(...ventana52),
    minimo52: Math.min(...ventana52),
    serie: fechas.map((f, i) => ({ fecha: f, cierre: cierres[i]! })).slice(-120),
    interpretacion: interpretarTecnico({
      precio,
      ma20,
      ma50,
      ma200,
      rsi: r,
      hist: macdv?.hist ?? null,
    }),
  };
}
