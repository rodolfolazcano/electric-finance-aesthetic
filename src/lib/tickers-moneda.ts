import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const IOL_MONEDA_MAP: Record<string, "ARS" | "USD"> = {
  peso_argentino: "ARS",
  pesos: "ARS",
  dolar: "USD",
  dolares: "USD",
  usd: "USD",
};

export function mapearMonedaIOL(iolMoneda: string): "ARS" | "USD" | null {
  return IOL_MONEDA_MAP[iolMoneda.toLowerCase().trim()] ?? null;
}

let _yf: any = null;
async function getYF(): Promise<any> {
  if (_yf) return _yf;
  const mod: any = await import("yahoo-finance2");
  const YF = mod.default ?? mod;
  try {
    _yf = typeof YF === "function" ? new YF() : YF;
  } catch {
    _yf = YF;
  }
  try {
    _yf.suppressNotices?.(["yahooSurvey", "ripHistorical"]);
  } catch {
    /* noop */
  }
  return _yf;
}

export const detectarMonedaTickerServer = createServerFn({
  method: "GET",
})
  .validator((data: { ticker: string }) => {
    const schema = z.object({
      ticker: z.string().min(1).max(50),
    });
    return schema.parse(data);
  })
  .handler(async ({ data }) => {
    try {
      const yf = await getYF();
      const quote = await yf.quote(data.ticker);
      const currency = quote?.currency as string | undefined;
      if (currency === "USD" || currency === "ARS") return currency;
    } catch {
      /* no disponible */
    }
    return null;
  });
