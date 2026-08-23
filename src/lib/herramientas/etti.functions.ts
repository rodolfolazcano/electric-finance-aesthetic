// src/lib/herramientas/etti.functions.ts
// ETTI — Estructura Temporal de Tipos de Interés (curva spot soberana + forwards)
// Metodología IFACI/Elbaum U4: curva spot con AL30/GD30/AE38/GD35/AL35/GD38..., clasificación de formas y forwards implícitos.
// Fuente datos: BONOS_DB + precios IOL (escalaPrecioIOL) + yahoo-coronar no requerido para este MVP.
// Sin GPU, FREE — cálculo local puro.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BONOS_DB, getFrecuenciaNumerica } from "./bonos-data";
import {
  calcularTplus1,
  parseISO,
  toISO,
  yearFraction,
  xirrConvencion,
  calcularTEA,
  diasEntre,
  getBonoPrecioYTCOficial,
} from "./renta-fija.functions";
import { fetchYahooChart } from "@/lib/yahoo-http";

// Curva spot soberana — soberanos Hard Dollar con vencimiento > hoy
const SOBERANOS_CANDIDATOS = [
  "AL30",
  "GD30",
  "AL35",
  "GD35",
  "AE38",
  "GD38",
  "AL41",
  "GD41",
  "GD46",
] as const;

export type SpotPoint = {
  ticker: string;
  vencimiento: string;
  diasAlVencimiento: number;
  anos: number;
  precioClean: number | null;
  tir: number | null; // nominal según convención
  spotTEA: number | null; // TEA efectiva anual (usada como spot)
  duration: number | null;
  fuente: string;
  ustYield: number | null; // UST interpolado a misma madurez (yfinance ^TNX etc.)
  spreadVsUST_bps: number | null; // EMBI proxy spread en bps
};

export type ForwardPoint = {
  desde: string;
  hasta: string;
  diasForward: number;
  anosForward: number;
  forwardTEA: number | null;
  formula: string;
};

export type CurvaETTIResult = {
  fechaLiquidacion: string;
  puntos: SpotPoint[];
  forwards: ForwardPoint[];
  forma: "normal" | "plana" | "invertida" | "jorobada" | "oscilante";
  justificacionForma: string;
  tcOficial: number | null;
  ustCurva: Array<{ ticker: string; anos: number; yield: number | null }> | null;
  timestamp: string;
  advertencias: string[];
};

function clasificarForma(puntos: SpotPoint[]): { forma: CurvaETTIResult["forma"]; justificacion: string } {
  const spots = puntos.filter((p) => p.spotTEA != null).map((p) => p.spotTEA as number);
  if (spots.length < 2) return { forma: "plana", justificacion: "Menos de 2 puntos con TIR válida" };
  const diffs = spots.slice(1).map((v, i) => v - (spots[i] as number));
  const avgDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  const tieneSubida = diffs.some((d) => d > 0.002);
  const tieneBajada = diffs.some((d) => d < -0.002);
  const max = Math.max(...spots);
  const min = Math.min(...spots);
  const rango = max - min;
  if (rango < 0.005) return { forma: "plana", justificacion: `Rango ${ (rango*100).toFixed(2)}pp < 0.5pp → curva anómala plana` };
  if (tieneSubida && tieneBajada) {
    // joroba si hay un pico intermedio
    const picoInd = spots.indexOf(max);
    if (picoInd > 0 && picoInd < spots.length - 1) {
      return { forma: "jorobada", justificacion: `Pico en ${puntos[picoInd].ticker} con subidas y bajadas → joroba por incertidumbre` };
    }
    return { forma: "oscilante", justificacion: "Subidas y bajadas sin pico central claro → oscilante" };
  }
  if (avgDiff > 0) return { forma: "normal", justificacion: `Pendiente positiva avg +${(avgDiff*100).toFixed(2)}pp → creciente (expectativas de suba de tasas)` };
  return { forma: "invertida", justificacion: `Pendiente negativa avg ${(avgDiff*100).toFixed(2)}pp → invertida (expectativa de baja)` };
}

// UST via yfinance (api yfinance.txt: Ticker.history) — ^IRX 3M, ^FVX 5Y, ^TNX 10Y, ^TYX 30Y
// Yahoo devuelve yield*10 (ej 4.25% → 42.5), se divide por 10 y por 100 → 0.0425
async function fetchUSTCurve(): Promise<Array<{ ticker: string; anos: number; yield: number | null }>> {
  const mapping: Array<{ ticker: string; anos: number }> = [
    { ticker: "^IRX", anos: 0.25 },
    { ticker: "^FVX", anos: 5 },
    { ticker: "^TNX", anos: 10 },
    { ticker: "^TYX", anos: 30 },
  ];
  const out: Array<{ ticker: string; anos: number; yield: number | null }> = [];
  for (const m of mapping) {
    try {
      const chart: any = await fetchYahooChart(m.ticker, "5d", "1d");
      const closes: number[] = chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: any) => c != null && isFinite(c)) ?? [];
      const ultimo = closes.length ? closes[closes.length - 1] : null;
      // Yahoo ^TNX etc. viene como 4.25 → 42.5 ; dividir por 1000? No, /10/100 = /1000? 42.5/10=4.25% → 0.0425
      // Ver market-data.ts: ultimo/10 → 4.25 ; luego /100 → 0.0425
      let y: number | null = null;
      if (ultimo != null && isFinite(ultimo)) {
        y = ultimo / 10 / 100;
        if (y > 0.2) y = y / 10; // fallback si viene *100
      }
      out.push({ ticker: m.ticker, anos: m.anos, yield: y });
    } catch {
      out.push({ ticker: m.ticker, anos: m.anos, yield: null });
    }
  }
  return out;
}

function interpUST(anos: number, ust: Array<{ anos: number; yield: number | null }>): number | null {
  const pts = ust.filter((p) => p.yield != null).sort((a, b) => a.anos - b.anos) as Array<{ anos: number; yield: number }>;
  if (pts.length === 0) return null;
  if (anos <= pts[0].anos) return pts[0].yield;
  if (anos >= pts[pts.length - 1].anos) return pts[pts.length - 1].yield;
  for (let i = 1; i < pts.length; i++) {
    if (anos <= pts[i].anos) {
      const a = pts[i - 1];
      const b = pts[i];
      const t = (anos - a.anos) / (b.anos - a.anos);
      return a.yield + t * (b.yield - a.yield);
    }
  }
  return null;
}

export const getCurvaETTI = createServerFn({ method: "POST" })
  .validator(
    z.object({
      tickers: z.array(z.string()).optional(),
      sessionId: z.string().optional(),
      fechaLiquidacion: z.string().optional(),
    })
  )
  .handler(async ({ data }): Promise<CurvaETTIResult> => {
    const fechaLiq = data.fechaLiquidacion ? parseISO(data.fechaLiquidacion) : calcularTplus1();
    const fechaLiqISO = toISO(fechaLiq);
    const tickers = (data.tickers && data.tickers.length > 0 ? data.tickers : [...SOBERANOS_CANDIDATOS]).map((t) => t.toUpperCase());

    // Precios vivos vía IOL/ArgentinaDatos (reusa handler existente)
    let preciosMap: Record<string, { precio: number | null }> = {};
    let tcOficial: number | null = null;
    const advertencias: string[] = [];
    try {
      const res: any = await (getBonoPrecioYTCOficial as any)({ data: { tickers, sessionId: data.sessionId } });
      // getBonoPrecioYTCOficial retorna { precios: Record<string,{precio}>, tcOficial, ... }
      if (res && res.precios) {
        preciosMap = res.precios;
        tcOficial = res.tcOficial ?? null;
      } else if (res && typeof res === "object") {
        // fallback si es Response-like
        const j = res as any;
        if (j.precios) preciosMap = j.precios;
        if (j.tcOficial) tcOficial = j.tcOficial;
      }
    } catch (e) {
      advertencias.push(`No se pudo obtener precios vivos: ${String(e).slice(0,120)} — se usa último conocido`);
    }

    const puntos: SpotPoint[] = [];
    for (const ticker of tickers) {
      const bono = (BONOS_DB as any)[ticker];
      if (!bono) {
        advertencias.push(`${ticker} no está en BONOS_DB`);
        continue;
      }
      const venc = bono.vencimiento as string;
      const dias = Math.round(diasEntre(fechaLiq, parseISO(venc)));
      if (dias <= 0) {
        advertencias.push(`${ticker} vencido (${venc})`);
        continue;
      }
      const precioClean = preciosMap[ticker]?.precio ?? null;
      const precioParaCalc = precioClean != null && precioClean > 0 ? precioClean : 55; // fallback razonable Hard Dollar ~55/100
      if (precioClean == null) advertencias.push(`${ticker} sin precio vivo, se usa fallback ${precioParaCalc}`);

      // Calcular TIR con flujos futuros
      const convencionDias = bono.convencionDias ?? "30/360";
      const freq = getFrecuenciaNumerica(bono.frecuenciaPago ?? "Semiannual");
      const yieldConv = bono.yieldConvention ?? "STREET";
      const flujosFuturos: Array<{ fecha: string; monto: number }> = (bono.flujosPorCada100VN ?? [])
        .filter((f: any) => parseISO(f.fecha) > fechaLiq)
        .map((f: any) => ({ fecha: f.fecha, monto: f.monto }));

      if (flujosFuturos.length === 0) {
        advertencias.push(`${ticker} sin flujos futuros`);
        continue;
      }

      // Intereses corridos simple para precio dirty
      // Usa yf desde vencimiento hacia atrás (aprox)
      const yf0 = 0;
      const flujosXIRR: Array<{ yf: number; monto: number }> = [
        { yf: yf0, monto: -precioParaCalc },
        ...flujosFuturos.map((f) => ({
          yf: yearFraction(fechaLiq, parseISO(f.fecha), convencionDias),
          monto: f.monto,
        })),
      ];

      let tir: number | null = null;
      let tea: number | null = null;
      try {
        tir = xirrConvencion(flujosXIRR, freq, yieldConv as any);
        if (tir != null) tea = calcularTEA(tir, freq, yieldConv as any);
      } catch {
        tir = null;
        tea = null;
      }

      puntos.push({
        ticker,
        vencimiento: venc,
        diasAlVencimiento: dias,
        anos: dias / 365,
        precioClean,
        tir,
        spotTEA: tea,
        duration: null,
        fuente: precioClean != null ? "IOL/vivo" : "fallback",
        ustYield: null,
        spreadVsUST_bps: null,
      });
    }

    // Ordenar por vencimiento ascendente
    puntos.sort((a, b) => a.diasAlVencimiento - b.diasAlVencimiento);

    // UST via yfinance + EMBI proxy spread (reciclaje api yfinance.txt)
    let ustCurva: Array<{ ticker: string; anos: number; yield: number | null }> | null = null;
    try {
      ustCurva = await fetchUSTCurve();
      for (const p of puntos) {
        const y = interpUST(p.anos, ustCurva);
        p.ustYield = y;
        if (y != null && p.spotTEA != null) {
          p.spreadVsUST_bps = Math.round((p.spotTEA - y) * 10000);
        }
      }
    } catch (e) {
      advertencias.push(`UST yfinance no disponible: ${String(e).slice(0,80)}`);
      ustCurva = null;
    }

    // Forwards implícitos entre tramos consecutivos: (1+spot_n)^t_n / (1+spot_m)^t_m ^(1/(t_n - t_m)) -1
    const forwards: ForwardPoint[] = [];
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1];
      const b = puntos[i];
      if (a.spotTEA == null || b.spotTEA == null || a.spotTEA <= -0.99 || b.spotTEA <= -0.99) {
        forwards.push({
          desde: a.ticker,
          hasta: b.ticker,
          diasForward: b.diasAlVencimiento - a.diasAlVencimiento,
          anosForward: (b.diasAlVencimiento - a.diasAlVencimiento) / 365,
          forwardTEA: null,
          formula: "spot faltante",
        });
        continue;
      }
      const tA = a.anos;
      const tB = b.anos;
      const dt = tB - tA;
      if (dt <= 0) {
        forwards.push({ desde: a.ticker, hasta: b.ticker, diasForward: 0, anosForward: 0, forwardTEA: null, formula: "dt<=0" });
        continue;
      }
      const num = Math.pow(1 + (b.spotTEA as number), tB);
      const den = Math.pow(1 + (a.spotTEA as number), tA);
      const fwd = Math.pow(num / den, 1 / dt) - 1;
      forwards.push({
        desde: a.ticker,
        hasta: b.ticker,
        diasForward: b.diasAlVencimiento - a.diasAlVencimiento,
        anosForward: dt,
        forwardTEA: Number.isFinite(fwd) ? fwd : null,
        formula: `(1+spot_${b.ticker})^${tB.toFixed(2)}/(1+spot_${a.ticker})^${tA.toFixed(2)}^(1/${dt.toFixed(2)})-1`,
      });
    }

    const { forma, justificacion } = clasificarForma(puntos);

    return {
      fechaLiquidacion: fechaLiqISO,
      puntos,
      forwards,
      forma,
      justificacionForma: justificacion,
      tcOficial,
      ustCurva,
      timestamp: new Date().toISOString(),
      advertencias,
    };
  });
