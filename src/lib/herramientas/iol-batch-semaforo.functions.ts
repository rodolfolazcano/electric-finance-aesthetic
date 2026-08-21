// @ts-nocheck
/**
 * IOL Batch Semaphore Analysis
 * Fetches historical data from IOL API for assets not available on Yahoo (bonos, etc.)
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTokens } from "./iol-auth";
import { rsi as rsiFn, sma, macd as macdFn } from "./optimizer";

const TickerSchema = z.string().min(1).max(30);

export interface IOLSemaforoResult {
  ticker: string;
  price: number;
  change1d: number;
  sma50: number | null;
  sma200: number | null;
  rsi: number;
  macd: number;
  macdSignal: number;
  totalScore: number;
  clasificacionJerarquica: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA";
  recommendation: "COMPRA" | "MANTENER" | "VENTA";
  light: "green" | "yellow" | "red";
  history: { date: string; close: number }[];
}

async function iolFetchRaw<T>(
  url: string,
  token: string,
): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchIOLHistory(
  ticker: string,
  mercado: string,
  token: string,
  refreshToken: string | null,
  days = 730,
): Promise<{ date: string; close: number }[]> {
  const hoy = new Date();
  const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fd = desde.toISOString().split("T")[0];
  const fh = hoy.toISOString().split("T")[0];
  const m = mercado === "bCBA" ? "BCBA" : mercado;

  const url = `https://api.invertironline.com/api/v2/${m}/Titulos/${ticker}/Cotizacion/seriehistorica/${fd}/${fh}/SinAjustar`;
  let data = await iolFetchRaw<Array<{ fecha: string; cierre: number }>>(url, token);
  if (!data && refreshToken) {
    const tokens = await fetchTokens({ refresh_token: refreshToken, grant_type: "refresh_token" });
    if (!("error" in tokens)) {
      data = await iolFetchRaw<Array<{ fecha: string; cierre: number }>>(url, tokens.accessToken);
    }
  }
  if (!data) return [];
  return data.filter((r) => r.fecha && r.cierre > 0).map((r) => ({ date: r.fecha, close: r.cierre }));
}

function computeClasificacion(total: number): {
  clasificacionJerarquica: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA";
  recommendation: "COMPRA" | "MANTENER" | "VENTA";
  light: "green" | "yellow" | "red";
} {
  const clasificacionJerarquica: any =
    total >= 5 ? "COMPRA" :
    total >= 2 ? "COMPRA CON CAUTELA" :
    total >= 0 ? "MANTENER" :
    total >= -3 ? "REDUCIR" :
    "VENTA";
  const light: any = clasificacionJerarquica === "COMPRA" || clasificacionJerarquica === "COMPRA CON CAUTELA"
    ? "green" : clasificacionJerarquica === "MANTENER" ? "yellow" : "red";
  const recommendation: any = light === "green" ? "COMPRA" : light === "yellow" ? "MANTENER" : "VENTA";
  return { clasificacionJerarquica, recommendation, light };
}

export const getIOLSemaforoBatch = createServerFn({ method: "POST" })
  .inputValidator(
    (input: unknown) =>
      z.object({
        tickers: z.array(z.object({
          simbolo: z.string(),
          mercado: z.string().default("bCBA"),
          moneda: z.string().default("ARS"),
        })).min(1).max(20),
        token: z.string().min(1),
        refreshToken: z.string().nullable(),
        days: z.number().default(730),
      }).parse(input),
  )
  .handler(async ({ data }): Promise<IOLSemaforoResult[]> => {
    const results: IOLSemaforoResult[] = [];
    for (const t of data.tickers) {
      try {
        const hist = await fetchIOLHistory(t.simbolo, t.mercado, data.token, data.refreshToken, data.days);
        if (hist.length < 30) continue;
        const closes = hist.map((h) => h.close);
        const current = closes[closes.length - 1];
        const prev = closes[closes.length - 2] ?? current;
        const change1d = ((current - prev) / prev) * 100;
        const sma50Val = sma(closes, 50);
        const sma200Val = closes.length >= 200 ? sma(closes, 200) : null;
        const rsiVal = rsiFn(closes);
        const { macd: macdVal, signal: macdS } = macdFn(closes);

        let tech = 0;
        if (current > sma50Val) tech += 1; else tech -= 1;
        if (sma200Val != null && sma50Val > sma200Val) tech += 1;
        else if (sma200Val != null && sma50Val < sma200Val) tech -= 1;
        if (rsiVal < 30) tech += 2;
        else if (rsiVal > 70) tech -= 2;
        if (macdVal > macdS) tech += 1; else tech -= 1;

        const trendBoost = sma200Val != null && sma50Val > sma200Val ? 1 : sma50Val > current ? -1 : 0;
        const { clasificacionJerarquica, recommendation, light } = computeClasificacion(tech + trendBoost);

        results.push({
          ticker: t.simbolo,
          price: current,
          change1d,
          sma50: sma50Val,
          sma200: sma200Val,
          rsi: rsiVal,
          macd: macdVal,
          macdSignal: macdS,
          totalScore: tech + trendBoost,
          clasificacionJerarquica,
          recommendation,
          light,
          history: hist,
        });
      } catch {
        continue;
      }
    }
    return results;
  });
