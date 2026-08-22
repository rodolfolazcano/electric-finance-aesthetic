import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { diagnosticarPortfolio } from "./pipeline";
import type { PortfolioAssetInput, DiagnosticoHibridoResult, PositionEnriquecida, ClasificacionExtendida, AlertaDiagnostico } from "./types";
import { getSemaforoBatch } from "../finance.functions";
import sectoresData from "../sectores.json";

const ActivoSchema = z.object({
  ticker: z.string(),
  cantidad: z.number(),
  fuente: z.enum(["IOL", "Yahoo", "ArgDatos"]),
});

const InputSchema = z.object({
  activos: z.array(ActivoSchema),
  iolToken: z.string().optional(),
  iolRefreshToken: z.string().optional(),
});

function clasificarGeografia(ticker: string): ClasificacionExtendida {
  const tk = ticker.toUpperCase().replace(/\.BA$/, "");
  const isBA = ticker.toUpperCase().endsWith(".BA") || /^[A-Z0-9]{1,5}D$/.test(ticker);
  const esArgentina = ticker.toUpperCase().endsWith(".BA") || ticker.toUpperCase().endsWith("D");

  for (const [, industrias] of Object.entries(sectoresData as Record<string, Record<string, { ticker: string; nombre: string; moneda?: string; mercado?: string; pais?: string }[]>>)) {
    for (const tickers of Object.values(industrias)) {
      const found = tickers.find((t) => t.ticker.toUpperCase() === ticker.toUpperCase() || t.ticker.toUpperCase() === tk + ".BA");
      if (found) {
        const mercado = found.mercado ?? (esArgentina ? "BCBA" : "NYSE/NASDAQ");
        if (found.pais === "Argentina" || mercado === "BCBA" || ticker.endsWith(".BA")) {
          return { geografia: "Argentina", moneda: (found.moneda === "USD" ? "USD" : "ARS") as "ARS" | "USD", mercado };
        }
        return { geografia: "EEUU", moneda: (found.moneda === "ARS" ? "ARS" : "USD") as "ARS" | "USD", mercado };
      }
    }
  }
  if (isBA) return { geografia: "Argentina", moneda: "ARS" as const, mercado: "BCBA" };
  return { geografia: "EEUU", moneda: "USD" as const, mercado: "NYSE/NASDAQ" };
}

const TICKERS_BOTELLA = new Set(["URA", "URNM", "CCJ", "UEC", "NUE", "STLD", "X", "CAT", "PWR", "EMR", "GEV", "SMR", "OKLO", "TLT", "TECK", "FCX", "SCCO"]);

export const getDiagnosticoHibrido = createServerFn({ method: "POST" })
  .validator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<DiagnosticoHibridoResult> => {
    const inputs: PortfolioAssetInput[] = data.activos.map((a) => ({
      id: a.ticker + "_" + Date.now(),
      ticker: a.ticker,
      cantidad: a.cantidad,
      fuente: a.fuente === "ArgDatos" ? "ArgentinaDatos" as const : a.fuente as "IOL" | "Yahoo",
    }));

    const portfolio = await diagnosticarPortfolio({
      data: { activos: inputs, iolToken: data.iolToken, iolRefreshToken: data.iolRefreshToken },
    }).catch(() => null);

    const activos = portfolio?.activos ?? [];

    const rvTickers = activos.filter((a) => a.categoriaMacro === "RentaVariable").map((a) => a.ticker);
    const semaforos = rvTickers.length > 0
      ? await getSemaforoBatch({ data: { tickers: rvTickers, rango: "1A" } }).catch(() => null)
      : null;
    const semaforoMap = new Map((semaforos ?? []).map((s) => [s.ticker, s]));

    const total = portfolio?.totalValorizado ?? activos.reduce((s, a) => s + a.valorizado, 0);

    let sumArg = 0, sumUS = 0, sumOtro = 0;
    let sumRF = 0, sumRV = 0, sumLiq = 0;
    let sumARS = 0, sumUSD = 0;
    let sumBeta = 0, betaCount = 0;
    const alertas: AlertaDiagnostico[] = [];
    let tieneInfraestructura = false;

    const activosEnriquecidos = activos.map((a) => {
      const geo = clasificarGeografia(a.ticker);
      if (geo.geografia === "Argentina") sumArg += a.valorizado;
      else if (geo.geografia === "EEUU") sumUS += a.valorizado;
      else sumOtro += a.valorizado;
      if (a.categoriaMacro === "RentaFija") sumRF += a.valorizado;
      else if (a.categoriaMacro === "RentaVariable") sumRV += a.valorizado;
      else sumLiq += a.valorizado;
      if (geo.moneda === "ARS") sumARS += a.valorizado;
      else sumUSD += a.valorizado;

      if (a.rentaVariable?.beta != null) { sumBeta += a.rentaVariable.beta; betaCount++; }
      if (TICKERS_BOTELLA.has(a.ticker)) tieneInfraestructura = true;

      const sem = semaforoMap.get(a.ticker);
      if (sem && sem.rsi > 70) alertas.push({ tipo: "sobrecompra", mensaje: `${a.ticker} en sobrecompra (RSI ${sem.rsi.toFixed(1)})`, ticker: a.ticker, severidad: "alta" });
      if (sem && sem.rsi < 30) alertas.push({ tipo: "sobreventa", mensaje: `${a.ticker} en sobreventa (RSI ${sem.rsi.toFixed(1)})`, ticker: a.ticker, severidad: "media" });

      const fcfYield = sem?.extended?.fcfYield ?? null;
      const fundamentalScore = sem?.fundScore ?? null;

      return { ...a, ...geo, fcfYield, fundamentalScore };
    });

    const totVal = total || 1;
    const tirPromRF = activos.filter((a) => a.rentaFija).reduce((s, a) => s + (a.rentaFija?.tir ?? 0) * a.valorizado, 0) / (activos.filter((a) => a.rentaFija).reduce((s, a) => s + a.valorizado, 0) || 1);

    for (const a of activos) {
      if (a.rentaFija && a.rentaFija.tir > 0.05) {
        alertas.push({ tipo: "tir_competitiva", mensaje: `${a.ticker} con TIR ${(a.rentaFija.tir * 100).toFixed(1)}% — competitiva`, ticker: a.ticker, severidad: "media" });
      }
      const ae = activosEnriquecidos.find((x) => x.id === a.id);
      if (ae?.fcfYield != null && ae.fcfYield >= 6) {
        alertas.push({ tipo: "fcf_destacado", mensaje: `${a.ticker} FCF Yield ${ae.fcfYield.toFixed(1)}% — solidez fundamental (+15 pts)`, ticker: a.ticker, severidad: "baja" });
      }
    }

    if (activos.length > 0) {
      const pesos = activos.map((a) => a.valorizado / totVal);
      const hhi = pesos.reduce((s, p) => s + p * p, 0);
      if (hhi > 0.3) alertas.push({ tipo: "concentracion", mensaje: `Alta concentración (HHI ${(hhi * 100).toFixed(0)}%). Considerar diversificar.`, severidad: "alta" });
    }

    return {
      activos: activosEnriquecidos,
      totalValorizado: total,
      composicion: {
        argentinaVsEeuu: { argentina: +(sumArg / totVal * 100).toFixed(1), eeuu: +(sumUS / totVal * 100).toFixed(1), otro: +(sumOtro / totVal * 100).toFixed(1) },
        rentaFijaVsVariable: { rentaFija: +(sumRF / totVal * 100).toFixed(1), rentaVariable: +(sumRV / totVal * 100).toFixed(1), liquidez: +(sumLiq / totVal * 100).toFixed(1) },
        moneda: { ars: +(sumARS / totVal * 100).toFixed(1), usd: +(sumUSD / totVal * 100).toFixed(1) },
      },
      metrics: {
        betaPromedio: betaCount > 0 ? +(sumBeta / betaCount).toFixed(2) : 0,
        tirPromedioRF: tirPromRF > 0 ? +(tirPromRF * 100).toFixed(2) : null,
        margenSeguridad: null,
        riesgoCuelloBotella: tieneInfraestructura,
      },
      alertas,
    };
  });
