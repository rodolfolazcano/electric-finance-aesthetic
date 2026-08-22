import type { AssetAdapter } from "./adapter.interface";
import type { PortfolioAssetInput, PositionEnriquecida, RentaVariableInfo } from "../types";
import type { Clasificacion } from "../clasificador";
import { getSemaforoBatch } from "../../finance.functions";
import { getCAPMAnalysis, AUTO_BENCHMARKS } from "../../capm.functions";
import { getYahooQuoteServer } from "../../market-data.functions";

export const rentaVariableAdapter: AssetAdapter = {
  tipo: "renta-variable",

  async enriquecer(input: PortfolioAssetInput, clasificacion: Clasificacion): Promise<PositionEnriquecida> {
    const [semafArray, capmArr, quote] = await Promise.all([
      getSemaforoBatch({ data: { tickers: [input.ticker], rango: "1A" } }).catch(() => null),
      getCAPMAnalysis({
        data: { tickers: [input.ticker], benchmarks: AUTO_BENCHMARKS, autoDetect: true },
      }).catch(() => null),
      getYahooQuoteServer({ data: { symbol: input.ticker } }).catch(() => null),
    ]);

    const semaforo = semafArray?.[0] ?? null;
    const precio = quote?.precio ?? semaforo?.price ?? 0;
    const capm = capmArr?.[0];

    if (precio <= 0) {
      return { ...base(input, clasificacion), valorizado: 0 };
    }

    const rentaVariable: RentaVariableInfo = {
      precio,
      variacionPct: semaforo?.change1d ?? quote?.variacionPct ?? 0,
      rsi: semaforo?.rsi ?? 0,
      macd: semaforo?.macd ?? 0,
      sma50: semaforo?.sma50 ?? 0,
      sma200: semaforo?.sma200 ?? 0,
      pe: semaforo?.pe ?? null,
      score: semaforo?.totalScore ?? 0,
      beta: capm?.beta ?? 0,
      alpha: capm?.annualizedAlpha ?? 0,
      rSquared: capm?.rSquared ?? 0,
    };

    return {
      ...base(input, clasificacion),
      valorizado: input.cantidad * precio,
      rentaVariable,
    };
  },
};

function base(input: PortfolioAssetInput, c: Clasificacion): PositionEnriquecida {
  return { id: input.id, ticker: input.ticker, cantidad: input.cantidad, valorizado: 0, categoriaMacro: c.categoriaMacro, subtipo: c.subtipo, pesoPct: 0 };
}
