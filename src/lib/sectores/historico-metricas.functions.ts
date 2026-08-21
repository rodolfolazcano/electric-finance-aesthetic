// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { yahooChartCloses } from "@/lib/yahoo-chart";
import { yahooQuoteSummary } from "@/lib/yahoo-coronar.functions";
import { getCached, setCache } from "@/lib/cache";

// ─── Types ─────────────────────────────────────────────────────────

export interface SerieHistorica {
  /** Fecha ISO (YYYY-MM-DD) */
  date: string;
  /** Precio de cierre en USD */
  close: number;
  /** PE aproximado = close / EPS_TTM */
  peAprox: number | null;
  /** Price/Book = close / bookValuePerShare */
  pbAprox: number | null;
  /** Dividend Yield aproximado = dividendoAnual / close */
  divYieldAprox: number | null;
}

export interface HistoricoValuacionResult {
  yfSymbol: string;
  nombre: string | null;
  serie: SerieHistorica[];
  metricasActuales: {
    trailingPE: number | null;
    priceToBook: number | null;
    dividendYield: number | null;
    epsTtm: number | null;
    bookValuePerShare: number | null;
    dividendoAnual: number | null;
  };
  percentiles: {
    pe: number | null;
    pb: number | null;
    divYield: number | null;
  };
  metodologia: "aproximada-eps-constante" | "no-aplicable";
  error: string | null;
  advertencia: string | null;
  fetchedAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

function numVal(v: unknown): number | null {
  if (typeof v === "number" && isFinite(v)) return v;
  if (v && typeof v === "object" && "raw" in (v as any)) return (v as any).raw;
  return null;
}

/**
 * Calcula el percentil de `valorActual` dentro de `serieHistorica`.
 * Retorna null si la serie tiene menos de 10 puntos (insuficiente para
 * un percentil estadísticamente significativo).
 */
function percentilActual(serieHistorica: number[], valorActual: number): number | null {
  const validos = serieHistorica.filter((v) => v != null && isFinite(v) && v > 0);
  if (validos.length < 10) return null;
  const menores = validos.filter((v) => v <= valorActual).length;
  return Math.round((menores / validos.length) * 100);
}

// ─── Server Function ────────────────────────────────────────────────

export const fetchHistoricoValuacion = createServerFn({ method: "GET" })
  .inputValidator(
    (d: { yfSymbol: string; rango?: "1y" | "2y" | "5y" }) =>
      z.object({
        yfSymbol: z.string().min(1).max(24),
        rango: z.enum(["1y", "2y", "5y"]).optional().default("2y"),
      }).parse(d),
  )
  .handler(async ({ data }): Promise<HistoricoValuacionResult> => {
    const cacheKey = `hist-val-${data.yfSymbol}-${data.rango}`;
    const cached = getCached<HistoricoValuacionResult>(cacheKey, 60 * 60 * 1000); // 1h
    if (cached) return cached;

    const now = new Date().toISOString();

    try {
      // 1. Precio histórico diario
      const closes = await yahooChartCloses(data.yfSymbol, data.rango);
      if (closes.length < 10) {
        const result: HistoricoValuacionResult = {
          yfSymbol: data.yfSymbol,
          nombre: null,
          serie: [],
          metricasActuales: {
            trailingPE: null, priceToBook: null, dividendYield: null,
            epsTtm: null, bookValuePerShare: null, dividendoAnual: null,
          },
          percentiles: { pe: null, pb: null, divYield: null },
          metodologia: "no-aplicable",
          error: "Datos históricos insuficientes — no se puede calcular percentil de forma confiable",
          advertencia: null,
          fetchedAt: now,
        };
        return result;
      }

      // 2. Fundamentals actuales
      const fund = await yahooQuoteSummary(data.yfSymbol);

      // 3. Derivar EPS TTM y book value por acción
      let epsTtm: number | null = null;
      if (fund.trailingPE != null && fund.trailingPE > 0 && fund.currentPrice != null && fund.currentPrice > 0) {
        epsTtm = fund.currentPrice / fund.trailingPE;
      }

      const bookValuePerShare = fund.bookValue ?? null;

      // Dividend Yield se obtiene de una segunda consulta (summaryDetail.dividendYield)
      // ya que YFSnapshot no lo expone directamente
      let dividendYield: number | null = null;
      let dividendoAnual: number | null = null;
      let trailingEpsDirect: number | null = null;
      try {
        const { fetchYahooQuoteSummaryJson } = await import("@/lib/yahoo-http");
        const raw = await fetchYahooQuoteSummaryJson<any>(data.yfSymbol, ["summaryDetail", "defaultKeyStatistics"]);
        const qs = raw?.json?.quoteSummary?.result?.[0];
        const sd = qs?.summaryDetail ?? {};
        const dks = qs?.defaultKeyStatistics ?? {};
        dividendYield = numVal(sd.dividendYield) ?? numVal(sd.trailingAnnualDividendYield) ?? null;
        if (dividendYield != null && fund.currentPrice != null) {
          dividendoAnual = dividendYield * fund.currentPrice;
        }
        trailingEpsDirect = numVal(dks.trailingEps) ?? null;
        if (epsTtm == null && trailingEpsDirect != null) {
          epsTtm = trailingEpsDirect;
        }
      } catch { /* fallback a derivación desde YFSnapshot */ }

      // 4. Construir serie histórica
      const serie: SerieHistorica[] = closes.map(({ date, close }) => {
        let peAprox: number | null = null;
        if (epsTtm != null && epsTtm > 0) {
          peAprox = close / epsTtm;
        }
        let pbAprox: number | null = null;
        if (bookValuePerShare != null && bookValuePerShare > 0) {
          pbAprox = close / bookValuePerShare;
        }
        let divYieldAprox: number | null = null;
        if (dividendoAnual != null && dividendoAnual > 0 && close > 0) {
          divYieldAprox = dividendoAnual / close;
        }
        return { date, close, peAprox, pbAprox, divYieldAprox };
      });

      // 5. Calcular percentiles
      const peSeries = serie.map((s) => s.peAprox).filter((v): v is number => v != null);
      const pbSeries = serie.map((s) => s.pbAprox).filter((v): v is number => v != null);
      const dySeries = serie.map((s) => s.divYieldAprox).filter((v): v is number => v != null);

      const precioActual = closes[closes.length - 1]?.close ?? 0;
      const peActual = epsTtm != null && epsTtm > 0 ? precioActual / epsTtm : null;
      const pbActual = bookValuePerShare != null && bookValuePerShare > 0 ? precioActual / bookValuePerShare : null;

      let advertencia: string | null = null;
      if (epsTtm != null) {
        advertencia = "PE histórico aproximado usando EPS TTM actual como constante (ver detalle)";
      }

      const result: HistoricoValuacionResult = {
        yfSymbol: data.yfSymbol,
        nombre: fund.longName ?? fund.shortName ?? null,
        serie,
        metricasActuales: {
          trailingPE: fund.trailingPE,
          priceToBook: fund.priceToBook,
          dividendYield,
          epsTtm,
          bookValuePerShare,
          dividendoAnual,
        },
        percentiles: {
          pe: peActual != null ? percentilActual(peSeries, peActual) : null,
          pb: pbActual != null ? percentilActual(pbSeries, pbActual) : null,
          divYield: dividendYield != null ? percentilActual(dySeries, dividendYield) : null,
        },
        metodologia: epsTtm != null ? "aproximada-eps-constante" : "no-aplicable",
        error: null,
        advertencia,
        fetchedAt: now,
      };

      setCache(cacheKey, result);
      return result;
    } catch (e) {
      return {
        yfSymbol: data.yfSymbol,
        nombre: null,
        serie: [],
        metricasActuales: {
          trailingPE: null, priceToBook: null, dividendYield: null,
          epsTtm: null, bookValuePerShare: null, dividendoAnual: null,
        },
        percentiles: { pe: null, pb: null, divYield: null },
        metodologia: "no-aplicable",
        error: e instanceof Error ? e.message : "Error al obtener datos históricos",
        advertencia: null,
        fetchedAt: now,
      };
    }
  });
