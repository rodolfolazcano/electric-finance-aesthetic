// src/lib/comparador.functions.ts
// Datos para comparador de inversiones con benchmarks comunes

import { createServerFn } from "@tanstack/react-start";
import { yahooChartCloses } from "./yahoo-chart";

export interface BenchmarkRate {
  key: string;
  label: string;
  annualReturn: number; // decimal, ej 0.45 = 45%
  source: string;
  note?: string;
}

export interface ComparadorData {
  benchmarks: BenchmarkRate[];
  timestamp: string;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function annualReturnFromCloses(
  closes: number[] | { date: string; close: number }[],
): number | null {
  const nums =
    closes.length && typeof closes[0] === "number"
      ? (closes as number[])
      : (closes as { date: string; close: number }[]).map((d) => d.close);
  if (nums.length < 30) return null;
  const start = nums[0];
  const end = nums[nums.length - 1];
  if (!start || !end || start <= 0) return null;
  const years = nums.length / 252; // aprox días hábiles/año
  if (years <= 0) return null;
  return Math.pow(end / start, 1 / years) - 1;
}

export const getComparadorBenchmarks = createServerFn({ method: "GET" }).handler(
  async (): Promise<ComparadorData> => {
    const AD = "https://api.argentinadatos.com";
    const benchmarks: BenchmarkRate[] = [];

    // 1. BADLAR (BCRA id=17)
    try {
      const r = await fetchJson("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/17");
      const results = r?.results ?? r;
      if (Array.isArray(results) && results.length) {
        const ultimo = results[results.length - 1];
        const valor = ultimo?.valor ?? null;
        if (typeof valor === "number" && valor > 0) {
          benchmarks.push({
            key: "badlar",
            label: "Plazo fijo (BADLAR)",
            annualReturn: valor / 100,
            source: "BCRA",
          });
        }
      }
    } catch {
      /* noop */
    }

    // 2. LECAP: mejor TEA de ArgentinaDatos
    try {
      const arr = await fetchJson(`${AD}/v1/finanzas/letras`);
      if (Array.isArray(arr)) {
        const hoy = new Date();
        let bestTea = -Infinity;
        for (const l of arr) {
          const vto = new Date(l.fechaVencimiento);
          const dias = Math.round((vto.getTime() - hoy.getTime()) / 86400000);
          if (dias <= 0) continue;
          const vpv = l.vpv ?? 100;
          let temPct = typeof l.tem === "number" && !isNaN(l.tem) ? l.tem : null;
          if (temPct == null) {
            const sym = String(l.ticker ?? "").toUpperCase();
            const months = sym.startsWith("T") ? 12 : sym.startsWith("S") ? 6 : 6;
            const temDec = Math.pow(vpv / 100, 1 / months) - 1;
            temPct = temDec * 100;
          }
          const temDec = temPct / 100;
          const tea = Math.pow(1 + temDec, 12) - 1;
          if (tea > bestTea) bestTea = tea;
        }
        if (bestTea > -Infinity && Number.isFinite(bestTea)) {
          benchmarks.push({
            key: "lecap",
            label: "LECAP (mejor TEA)",
            annualReturn: bestTea,
            source: "ArgentinaDatos",
          });
        }
      }
    } catch {
      /* noop */
    }

    // 3. Inflación interanual
    try {
      const arr = await fetchJson(`${AD}/v1/finanzas/indices/inflacion`);
      if (Array.isArray(arr) && arr.length >= 12) {
        const ultimos12 = arr.slice(-12);
        const anual =
          ultimos12.reduce((acc: number, m: any) => acc * (1 + (m.valor ?? 0) / 100), 1) - 1;
        if (anual > 0) {
          benchmarks.push({
            key: "inflacion",
            label: "Inflación (IPC)",
            annualReturn: anual,
            source: "BCRA/ArgentinaDatos",
          });
        }
      }
    } catch {
      /* noop */
    }

    // 4. Dólar blue (último 1y)
    try {
      const arr = await fetchJson(`${AD}/v1/cotizaciones/dolares/blue`);
      if (Array.isArray(arr) && arr.length >= 2) {
        const first = arr[0];
        const last = arr[arr.length - 1];
        const p0 = first?.venta ?? first?.compra ?? null;
        const p1 = last?.venta ?? last?.compra ?? null;
        if (p0 && p1 && p0 > 0) {
          const days = arr.length; // aprox
          const years = days / 365;
          const ret = Math.pow(p1 / p0, 1 / years) - 1;
          benchmarks.push({
            key: "dolar_blue",
            label: "Dólar blue",
            annualReturn: ret,
            source: "ArgentinaDatos",
          });
        }
      }
    } catch {
      /* noop */
    }

    // 5. SPY
    try {
      const spy = await yahooChartCloses("SPY", "5y");
      const ret = annualReturnFromCloses(spy);
      if (ret != null) {
        benchmarks.push({
          key: "spy",
          label: "S&P 500 (SPY)",
          annualReturn: ret,
          source: "Yahoo Finance",
        });
      }
    } catch {
      /* noop */
    }

    // 6. QQQ
    try {
      const qqq = await yahooChartCloses("QQQ", "5y");
      const ret = annualReturnFromCloses(qqq);
      if (ret != null) {
        benchmarks.push({
          key: "qqq",
          label: "Nasdaq 100 (QQQ)",
          annualReturn: ret,
          source: "Yahoo Finance",
        });
      }
    } catch {
      /* noop */
    }

    return { benchmarks, timestamp: new Date().toISOString() };
  },
);
