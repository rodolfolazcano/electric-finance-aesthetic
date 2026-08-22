import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchYahooQuoteSummaryJson } from "@/lib/yahoo-http";
import type { QuoteSummaryResult } from "@/lib/yahoo-types";

// ─── Tipos ────────────────────────────────────────────────────────────────

export interface AnalisisInicialRow {
  ticker: string;
  // Flujo vs Stock
  fcfYield: number | null;          // %
  fcfYieldScore: number;            // 0–15
  fcf: number | null;               // USD
  marketCap: number | null;         // USD
  // Margen de Seguridad (Graham)
  valorIntrínseco: number | null;   // USD
  cotizacion: number | null;        // USD
  margenSeguridadPct: number | null; // %
  subvaluada: boolean | null;
  // Liquidez (Amat)
  currentRatio: number | null;
  liquidezOk: boolean | null;
  deudaPatrimonio: number | null;   // D/E
  // Pricing Power (Inviu)
  pricingPower: "Alto" | "Medio" | "Bajo" | null;
  backlogsVisibles: boolean | null;
  // Rentabilidad
  roe: number | null;               // %
  margenNeto: number | null;        // %
  // Contexto (Murphy)
  sector: string | null;
  industria: string | null;
  // Score compuesto
  scoreTotal: number;               // 0–100
  scoreLabel: "Sólido" | "Aceptable" | "Débil" | "Crítico";
}

export interface AnalisisInicialResult {
  rows: AnalisisInicialRow[];
  timestamp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

const MODULES = [
  "financialData", "defaultKeyStatistics", "assetProfile",
  "balanceSheetHistory", "cashflowStatementHistory",
  "incomeStatementHistory",
];

function safe(fn: () => number | null | undefined): number | null {
  try { const v = fn(); return v ?? null; } catch { return null; }
}

function safeStr(fn: () => string | null | undefined): string | null {
  try { return fn() ?? null; } catch { return null; }
}

function raw(r: any, field: string): number | null {
  return safe(() => r?.[field]?.raw);
}

function fmtPct(v: number | null): number | null {
  return v != null ? Math.round(v * 10000) / 100 : null;
}

// ─── Server function ──────────────────────────────────────────────────────

export const getAnalisisInicial = createServerFn({ method: "POST" })
  .validator(z.object({ tickers: z.array(z.string()).min(1).max(50) }))
  .handler(async ({ data }): Promise<AnalisisInicialResult> => {
    const rows: AnalisisInicialRow[] = [];

    for (const ticker of data.tickers) {
      try {
        const res = await fetchYahooQuoteSummaryJson<QuoteSummaryResult>(ticker, MODULES);
        const r = res.json?.quoteSummary?.result?.[0];
        if (!r) {
          rows.push(rowEmpty(ticker));
          continue;
        }

        const fd = r.financialData ?? {};
        const k = r.defaultKeyStatistics ?? {};
        const ap = r.assetProfile ?? {};
        const bs = r.balanceSheetHistory?.balanceSheetStatements ?? [];
        const cf = r.cashflowStatementHistory?.cashflowStatements ?? [];
        const ic = r.incomeStatementHistory?.incomeStatements ?? [];

        // Market cap & price
        const marketCap = raw(fd, "marketCap") ?? raw(k, "marketCap");
        const cotizacion = raw(fd, "currentPrice") ?? raw(k, "lastFiscalYearEnd");
        const sector = safeStr(() => ap.sector);
        const industria = safeStr(() => ap.industry);

        // ── FCF Yield ────────────────────────────────────────────────
        const fcfRaw = raw(fd, "freeCashflow");
        const cfoRaw = raw(cf[0], "totalCashFromOperatingActivities") ?? raw(cf[0], "operatingCashFlow");
        const capexRaw = raw(cf[0], "capitalExpenditures");
        const fcfCalc = cfoRaw != null && capexRaw != null ? cfoRaw + capexRaw : null;
        const fcf = fcfRaw ?? fcfCalc;
        const fcfYield = fcf != null && marketCap != null && marketCap > 0 ? (fcf / marketCap) : null;
        const fcfYieldScore = fcfYield != null
          ? (fcfYield >= 0.06 ? 15 : fcfYield >= 0.03 ? 10 : fcfYield >= 0 ? 5 : 0)
          : 0;

        // ── Margen de Seguridad (Graham) ─────────────────────────────
        // Graham intrinsic value = sqrt(22.5 * EPS * BVPS)
        const eps = raw(k, "trailingEps") ?? raw(fd, "earningsPerShare");
        const bvps = raw(k, "bookValue");
        const valorIntrínseco = eps != null && bvps != null && eps > 0 && bvps > 0
          ? Math.sqrt(22.5 * eps * bvps) : (eps != null && eps > 0 ? eps * 15 : null);
        const margenSeguridadPct = valorIntrínseco != null && cotizacion != null && cotizacion > 0
          ? ((valorIntrínseco - cotizacion) / valorIntrínseco) * 100 : null;
        const subvaluada = margenSeguridadPct != null && margenSeguridadPct > 0;

        // ── Liquidez (Amat) ──────────────────────────────────────────
        const curAssets = raw(bs[0], "totalCurrentAssets");
        const curLiab = raw(bs[0], "totalCurrentLiabilities");
        const currentRatio = curAssets != null && curLiab != null && curLiab > 0 ? curAssets / curLiab : null;
        const liquidezOk = currentRatio != null && currentRatio >= 1;

        const totalDebt = raw(bs[0], "totalDebt");
        const equity = raw(bs[0], "totalStockholderEquity") ?? raw(bs[0], "totalEquity");
        const deudaPatrimonio = totalDebt != null && equity != null && equity > 0 ? totalDebt / equity : null;

        // ── Pricing Power (Inviu) ────────────────────────────────────
        const margenNeto = (() => {
          const rev = raw(ic[0], "totalRevenue");
          const ni = raw(ic[0], "netIncome");
          return rev != null && ni != null && rev > 0 ? ni / rev : null;
        })();
        const roe = raw(fd, "returnOnEquity");
        // Pricing power: alto si margen neto > 15% y ROE > 15%
        let pricingPower: "Alto" | "Medio" | "Bajo" | null = null;
        let backlogsVisibles: boolean | null = null;
        if (margenNeto != null && roe != null) {
          if (margenNeto > 0.15 && roe > 0.15) pricingPower = "Alto";
          else if (margenNeto > 0.08 && roe > 0.10) pricingPower = "Medio";
          else pricingPower = "Bajo";
        }
        // Proxy de backlogs: empresas con revenue alto y márgenes estables
        const revGrowth = raw(fd, "revenueGrowth");
        backlogsVisibles = revGrowth != null && revGrowth > 0.05 && margenNeto != null && margenNeto > 0.10;

        // ── Score compuesto ──────────────────────────────────────────
        // FCF Yield: 0-15, M. Seguridad: 0-15, Liquidez: 0-10, D/E: 0-10,
        // Pricing Power: 0-10, ROE: 0-10, Margen Neto: 0-10, Revenue Growth: 0-10
        // Subvaluada bonus: 10 → total max 100
        let score = fcfYieldScore;
        if (subvaluada) score += margenSeguridadPct != null && margenSeguridadPct >= 50 ? 15 : margenSeguridadPct != null && margenSeguridadPct >= 20 ? 10 : 5;
        if (liquidezOk) score += 10;
        if (deudaPatrimonio != null && deudaPatrimonio < 1) score += 10;
        else if (deudaPatrimonio != null && deudaPatrimonio < 2) score += 5;
        if (pricingPower === "Alto") score += 10;
        else if (pricingPower === "Medio") score += 5;
        if (roe != null && roe > 0.15) score += 10;
        else if (roe != null && roe > 0.10) score += 5;
        if (margenNeto != null && margenNeto > 0.15) score += 10;
        else if (margenNeto != null && margenNeto > 0.08) score += 5;
        if (revGrowth != null && revGrowth > 0.10) score += 10;
        else if (revGrowth != null && revGrowth > 0.05) score += 5;
        score = Math.min(score, 100);

        const scoreLabel: AnalisisInicialRow["scoreLabel"] =
          score >= 70 ? "Sólido" : score >= 45 ? "Aceptable" : score >= 25 ? "Débil" : "Crítico";

        rows.push({
          ticker,
          fcfYield: fmtPct(fcfYield),
          fcfYieldScore,
          fcf: fcf != null ? Math.round(fcf) : null,
          marketCap: marketCap != null ? Math.round(marketCap) : null,
          valorIntrínseco: valorIntrínseco != null ? Math.round(valorIntrínseco * 100) / 100 : null,
          cotizacion: cotizacion != null ? Math.round(cotizacion * 100) / 100 : null,
          margenSeguridadPct: margenSeguridadPct != null ? Math.round(margenSeguridadPct * 100) / 100 : null,
          subvaluada,
          currentRatio: currentRatio != null ? Math.round(currentRatio * 100) / 100 : null,
          liquidezOk,
          deudaPatrimonio: deudaPatrimonio != null ? Math.round(deudaPatrimonio * 100) / 100 : null,
          pricingPower,
          backlogsVisibles,
          roe: fmtPct(roe),
          margenNeto: fmtPct(margenNeto),
          sector,
          industria,
          scoreTotal: score,
          scoreLabel,
        });
      } catch {
        rows.push(rowEmpty(ticker));
      }
    }

    return { rows, timestamp: new Date().toISOString() };
  });

function rowEmpty(ticker: string): AnalisisInicialRow {
  return {
    ticker,
    fcfYield: null, fcfYieldScore: 0, fcf: null, marketCap: null,
    valorIntrínseco: null, cotizacion: null, margenSeguridadPct: null, subvaluada: null,
    currentRatio: null, liquidezOk: null, deudaPatrimonio: null,
    pricingPower: null, backlogsVisibles: null,
    roe: null, margenNeto: null,
    sector: null, industria: null,
    scoreTotal: 0, scoreLabel: "Crítico",
  };
}
