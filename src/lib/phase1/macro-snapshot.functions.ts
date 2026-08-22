// ─── Macro Snapshot — server function ───────────────────────────
// Fetch: TNX, TYX, VIX, DXY, gold, oil, copper, SGOV, BIL, USFR, ^IRX

import { createServerFn } from "@tanstack/react-start";
import { yahooChartCloses } from "../yahoo-chart";
import { getCached, setCache } from "../cache";
import type { MacroSnapshot, MacroIndicator } from "./types";

// ─── Helpers ────────────────────────────────────────────────────

function buildIndicator(
  ticker: string,
  label: string,
  closes: { date: string; close: number }[],
): MacroIndicator {
  if (closes.length < 2) {
    return {
      ticker, label,
      valor: null, variacion1dPct: null, variacion1mPct: null,
      rango52wMin: null, rango52wMax: null,
      timestamp: new Date().toISOString(),
    };
  }
  const prices = closes.map((c) => c.close).filter((p) => p > 0);
  if (prices.length < 2) {
    return {
      ticker, label,
      valor: prices[prices.length - 1] ?? null,
      variacion1dPct: null, variacion1mPct: null,
      rango52wMin: null, rango52wMax: null,
      timestamp: new Date().toISOString(),
    };
  }
  const actual = prices[prices.length - 1];
  const ayer = prices.length >= 2 ? prices[prices.length - 2] : null;
  const hace1m = prices.length >= 22 ? prices[prices.length - 22] : null;
  const variacion1dPct = ayer != null && ayer > 0 ? ((actual - ayer) / ayer) * 100 : null;
  const variacion1mPct = hace1m != null && hace1m > 0 ? ((actual - hace1m) / hace1m) * 100 : null;
  const rango52wMin = Math.min(...prices);
  const rango52wMax = Math.max(...prices);

  return {
    ticker, label, valor: actual,
    variacion1dPct: variacion1dPct != null ? Math.round(variacion1dPct * 100) / 100 : null,
    variacion1mPct: variacion1mPct != null ? Math.round(variacion1mPct * 100) / 100 : null,
    rango52wMin, rango52wMax,
    timestamp: new Date().toISOString(),
  };
}

// ─── Server function ─────────────────────────────────────────────

export const fetchMacroSnapshot = createServerFn({ method: "GET" }).handler(
  async (): Promise<MacroSnapshot> => {
    const CACHE_KEY = "phase1-macro-snapshot-v1";
    const cached = getCached<MacroSnapshot>(CACHE_KEY, 5 * 60 * 1000); // 5 min TTL
    if (cached) return cached;

    // Fetch all tickers in parallel
    const tickers = [
      "^TNX", "^TYX", "^IRX",   // yields
      "SGOV", "BIL", "USFR",     // short-term treasuries
      "^VIX", "DX-Y.NYB",        // fear, dollar
      "GC=F", "CL=F", "HG=F",    // gold, oil, copper
    ] as const;

    const results = await Promise.allSettled(
      tickers.map((t) => yahooChartCloses(t, "1y").catch(() => [])),
    );

    const [
      tnxRaw, tyxRaw, irxRaw,
      sgovRaw, bilRaw, usfrRaw,
      vixRaw, dxyRaw,
      goldRaw, oilRaw, copperRaw,
    ] = results;

    const tnx = buildIndicator("^TNX", "UST 10Y Yield", tnxRaw.status === "fulfilled" ? tnxRaw.value : []);
    const tyx = buildIndicator("^TYX", "UST 30Y Yield", tyxRaw.status === "fulfilled" ? tyxRaw.value : []);
    const irx = buildIndicator("^IRX", "T-Bill 13W Yield", irxRaw.status === "fulfilled" ? irxRaw.value : []);
    const sgov = buildIndicator("SGOV", "Treasury 0-3M (SGOV)", sgovRaw.status === "fulfilled" ? sgovRaw.value : []);
    const bil = buildIndicator("BIL", "Treasury 1-3M (BIL)", bilRaw.status === "fulfilled" ? bilRaw.value : []);
    const usfr = buildIndicator("USFR", "Floating Rate (USFR)", usfrRaw.status === "fulfilled" ? usfrRaw.value : []);
    const vix = buildIndicator("^VIX", "VIX — Miedo", vixRaw.status === "fulfilled" ? vixRaw.value : []);
    const dxy = buildIndicator("DX-Y.NYB", "Dólar Index (DXY)", dxyRaw.status === "fulfilled" ? dxyRaw.value : []);
    const gold = buildIndicator("GC=F", "Oro (Gold)", goldRaw.status === "fulfilled" ? goldRaw.value : []);
    const oil = buildIndicator("CL=F", "Petróleo WTI", oilRaw.status === "fulfilled" ? oilRaw.value : []);
    const copper = buildIndicator("HG=F", "Cobre", copperRaw.status === "fulfilled" ? copperRaw.value : []);

    // Spreads
    const spread10y2y =
      tnx.valor != null && irx.valor != null
        ? Math.round((tnx.valor - irx.valor) * 100) / 100
        : null;
    const spread10y30y =
      tyx.valor != null && tnx.valor != null
        ? Math.round((tyx.valor - tnx.valor) * 100) / 100
        : null;

    const result: MacroSnapshot = {
      tnx, tyx, irx,
      sgov, bil, usfr,
      vix, dxy,
      gold, oil, copper,
      spread10y2y, spread10y30y,
    };

    setCache(CACHE_KEY, result);
    return result;
  },
);
