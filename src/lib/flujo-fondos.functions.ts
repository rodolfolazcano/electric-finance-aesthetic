import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BONOS_DB } from "@/lib/bonos-data";
import { yahooChartCloses } from "@/lib/yahoo-chart";

export interface TickerCashFlow {
  ticker: string;
  nombre: string;
  price: number | null;
  priceSource: string;
  tir: number | null;
  tea: number | null;
  duration: number | null;
  flows: { fecha: string; monto: number; residual: number }[];
}

export interface AggregatedMonth {
  mes: string;
  total: number;
  porTicker: { ticker: string; monto: number }[];
}

// Inline Docta API calls to avoid createServerFn-in-createServerFn issues
async function fetchDoctaCashFlows(ticker: string): Promise<{ payment_date: string; cash_flow: number; residual_value: number }[] | null> {
  try {
    const res = await fetch(`https://api.doctacapital.com.ar/api/v1/bonds/analytics/${ticker}/cashflow?nominal_units=100`, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.data ?? []).map((d: any) => ({
      payment_date: d.payment_date,
      cash_flow: d.cash_flow,
      residual_value: d.residual_value,
    }));
  } catch {
    return null;
  }
}

export const getFlujoFondos = createServerFn({ method: "POST" })
  .inputValidator((d: { tickers: string[]; nominales: Record<string, number> }) =>
    z.object({
      tickers: z.array(z.string().min(1)).min(1).max(20),
      nominales: z.record(z.string(), z.number().positive()),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ tickers: TickerCashFlow[]; mensual: AggregatedMonth[] }> => {
    const results: TickerCashFlow[] = [];
    for (const ticker of data.tickers) {
      const up = ticker.toUpperCase();
      const nominal = data.nominales[up] ?? 100;
      const factor = nominal / 100;
      const dbEntry = BONOS_DB[up];

      // Try Docta API first (live data, supports any ticker)
      try {
        const doctaFlows = await fetchDoctaCashFlows(up);
        if (doctaFlows && doctaFlows.length > 0) {
          const price = dbEntry?.valorResidualActual ?? null;
          const flows = doctaFlows.map((d) => ({
            fecha: d.payment_date,
            monto: d.cash_flow * factor,
            residual: d.residual_value,
          }));
          results.push({
            ticker: up,
            nombre: dbEntry?.descripcion ?? up,
            price,
            priceSource: price != null ? "json" : "n/d",
            tir: null,
            tea: null,
            duration: null,
            flows,
          });
          continue;
        }
      } catch {
        // fall through
      }

      // Fallback to bonos.json
      if (dbEntry && dbEntry.flujosPorCada100VN && dbEntry.flujosPorCada100VN.length > 0) {
        const flows = dbEntry.flujosPorCada100VN
          .filter((f) => new Date(f.fecha) > new Date())
          .map((f) => ({
            fecha: f.fecha,
            monto: (f.monto ?? 0) * factor,
            residual: 0,
          }));
        results.push({
          ticker: up,
          nombre: dbEntry.descripcion ?? up,
          price: dbEntry.valorResidualActual ?? null,
          priceSource: "json",
          tir: null,
          tea: null,
          duration: null,
          flows,
        });
      } else {
        results.push({
          ticker: up,
          nombre: up,
          price: null,
          priceSource: "n/d",
          tir: null,
          tea: null,
          duration: null,
          flows: [],
        });
      }
    }

    // Aggregate by month
    const monthMap = new Map<string, Map<string, number>>();
    for (const r of results) {
      for (const f of r.flows) {
        const mes = f.fecha.slice(0, 7);
        if (!monthMap.has(mes)) monthMap.set(mes, new Map());
        const tickerMap = monthMap.get(mes)!;
        tickerMap.set(r.ticker, (tickerMap.get(r.ticker) ?? 0) + f.monto);
      }
    }

    const mensual: AggregatedMonth[] = [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, tickerMap]) => ({
        mes,
        total: [...tickerMap.values()].reduce((s, v) => s + v, 0),
        porTicker: [...tickerMap.entries()].map(([ticker, monto]) => ({ ticker, monto: Math.round(monto * 100) / 100 })),
      }));

    return { tickers: results, mensual };
  });
