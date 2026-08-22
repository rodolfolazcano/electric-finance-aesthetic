import { getIOLPortafolio } from "../iol-portfolio.functions";
import { getSemaforoBatch } from "../finance.functions";
import type { SemaforoResult } from "../finance.functions";

/**
 * Calcula el análisis semáforo sobre los tickers del portafolio IOL activo.
 *
 * Este resultado NUNCA pasa por Gemini. Se calcula en cada carga de la Home
 * (o se cachea con TTL corto, 15-30 min).
 *
 * @param tokens - Opcional. Si no se proveen, devuelve null (cliente no conectado).
 *   Los tokens se obtienen desde el IOLProvider en el cliente y se pasan
 *   desde el componente Home (ver Fase 8 — integración con getInformeDelDia).
 */
export async function calcularMiPortafolioHoy(
  tokens?: { accessToken: string; refreshToken: string | null },
): Promise<SemaforoResult[] | null> {
  if (!tokens?.accessToken) return null;

  try {
    const portafolio = await getIOLPortafolio({
      data: {
        token: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      },
    });

    const tickers = portafolio.data
      .filter((p) => p.simbolo && p.cantidad > 0)
      .map((p) => p.simbolo);

    if (tickers.length === 0) return null;

    return await getSemaforoBatch({ data: { tickers, rango: "6M" } });
  } catch (err) {
    console.error("calcularMiPortafolioHoy: error", err);
    return null;
  }
}
