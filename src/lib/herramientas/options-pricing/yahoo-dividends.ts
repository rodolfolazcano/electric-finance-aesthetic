import type { DividendInfo } from "./options.types";

/**
 * Obtiene dividendos y calcula la tasa de dividendos anualizada
 * desde Yahoo Finance (equivalente a obtener_dividendos_splits).
 *
 * Usa el endpoint /v8/finance/chart con events=dividends.
 */
export async function fetchYahooDividends(
  symbol: string,
): Promise<{ dividendos: DividendInfo[]; tasaAnual: number }> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d&events=dividends`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { dividendos: [], tasaAnual: 0 };

    const json = await res.json();
    const events = json?.chart?.result?.[0]?.events?.dividends;
    if (!events) return { dividendos: [], tasaAnual: 0 };

    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const dividendos: DividendInfo[] = [];
    let sumaUltimoAno = 0;

    for (const key of Object.keys(events)) {
      const ev = events[key];
      const fechaMs = ev.date * 1000;
      const fecha = new Date(fechaMs).toISOString().slice(0, 10);
      const monto = ev.amount ?? 0;
      dividendos.push({ fecha, monto });
      if (fechaMs >= oneYearAgo && fechaMs <= now) {
        sumaUltimoAno += monto;
      }
    }

    dividendos.sort((a, b) => a.fecha.localeCompare(b.fecha));
    return { dividendos, tasaAnual: sumaUltimoAno };
  } catch {
    return { dividendos: [], tasaAnual: 0 };
  }
}

/**
 * Calcula la tasa de dividendos como porcentaje del spot.
 * Equivalente a: tasa_dividendos = total_dividendos_anual / precio_spot
 */
export function calcularTasaDividendos(dividendosAnuales: number, spot: number): number {
  if (spot <= 0 || dividendosAnuales <= 0) return 0;
  return dividendosAnuales / spot;
}
