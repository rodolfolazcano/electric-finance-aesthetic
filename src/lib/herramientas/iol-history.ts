// @ts-nocheck
import { fetchTokens } from "./iol-auth";

async function tryFetch(
  ticker: string,
  mercado: string,
  token: string,
  fechaDesde: string,
  fechaHasta: string,
): Promise<Array<{ fecha: string; cierre: number }> | null> {
  const m = mercado === "bCBA" ? "BCBA" : mercado;
  const url = `https://api.invertironline.com/api/v2/${m}/Titulos/${ticker}/Cotizacion/seriehistorica/${fechaDesde}/${fechaHasta}/SinAjustar`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`IOL history error: ${res.status} ${body}`);
    return null;
  }
  const json = await res.json();
  if (!Array.isArray(json)) {
    console.error(`IOL history: response not array`, json);
    return null;
  }
  return json as Array<{ fecha: string; cierre: number }>;
}

export async function fetchHistoryIOL(
  ticker: string,
  mercado: string,
  token: string,
  refreshToken: string | null,
  days = 730,
): Promise<{ date: string; close: number }[]> {
  const hoy = new Date();
  const desde = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const fechaDesde = desde.toISOString().split("T")[0];
  const fechaHasta = hoy.toISOString().split("T")[0];

  let result = await tryFetch(ticker, mercado, token, fechaDesde, fechaHasta);
  if (result)
    return result
      .filter((r) => r.fecha && r.cierre > 0)
      .map((r) => ({ date: r.fecha, close: r.cierre }));

  if (refreshToken) {
    const tokens = await fetchTokens({ refresh_token: refreshToken, grant_type: "refresh_token" });
    if (!("error" in tokens)) {
      result = await tryFetch(ticker, mercado, tokens.accessToken, fechaDesde, fechaHasta);
      if (result)
        return result
          .filter((r) => r.fecha && r.cierre > 0)
          .map((r) => ({ date: r.fecha, close: r.cierre }));
    }
  }

  return [];
}
