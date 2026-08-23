// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { kyleLambda, spreadRelativo } from "@/lib/labadie/microstructure";
import type { MicroLocalSnapshot } from "@/lib/labadie/contracts";

let cache: { data: MicroLocalSnapshot | null; ts: number } = { data: null, ts: 0 };
const TTL = 5 * 60_000;

async function fetchYahooCloses(ticker: string, range = "3mo"): Promise<number[]> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=1d`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const j = await res.json();
    const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: number | null) => typeof c === "number" && isFinite(c)) ?? [];
    return closes as number[];
  } catch { return []; }
}
function std(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) if (prices[i-1] > 0) out.push((prices[i]-prices[i-1])/prices[i-1]);
  return out;
}

export const getMicroLocal = createServerFn({ method: "GET" })
  .inputValidator((input: { bearerToken?: string } = {}) => input)
  .handler(async ({ data }): Promise<MicroLocalSnapshot> => {
    const now = Date.now();
    if (cache.data && now - cache.ts < TTL) return cache.data;

    const token = (data as any)?.bearerToken as string | undefined;
    if (!token) {
      const fallback: MicroLocalSnapshot = {
        spreadMedioAcciones: null,
        spreadMedioCedears: null,
        spreadMedioON: null,
        spreadMedio: null,
        topPeoresSpreads: [],
        kyleLambdaProxy: null,
        caucionTasa7d: null,
        liquidezFlag: "ok",
        timestamp: new Date().toISOString(),
        warnings: ["sin token IOL — fallback nulls (spread/kyle no disponible)"],
      };
      cache = { data: fallback, ts: now };
      return fallback;
    }

    // Fetch IOL panels en paralelo
    const fetchPanel = async (instrumento: string): Promise<Array<{ ticker: string; spread: number; ask: number; bid: number; panel: string }>> => {
      try {
        const url = `https://api.invertironline.com/api/v2/Cotizaciones/${instrumento}/argentina/Todos`;
        const res = await fetch(url, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
        if (!res.ok) return [];
        const j = await res.json();
        const titulos: any[] = j.titulos || [];
        return titulos
          .map((t: any) => {
            const ask = t.puntas?.venta ?? t.venta ?? t.precioVenta ?? 0;
            const bid = t.puntas?.compra ?? t.compra ?? t.precioCompra ?? 0;
            const mid = (ask + bid) / 2;
            const spread = ask > 0 && bid > 0 && mid > 0 ? (ask - bid) / mid : 0;
            return { ticker: t.simbolo || "", spread, ask, bid, panel: instrumento };
          })
          .filter((x: any) => x.ticker && x.spread >= 0 && x.spread < 0.2);
      } catch { return []; }
    };

    const [acciones, cedears, ons] = await Promise.all([
      fetchPanel("acciones"),
      fetchPanel("cedears"),
      fetchPanel("obligacionesNegociables"),
    ]);

    const avg = (arr: Array<{ spread: number }>) => arr.length ? arr.reduce((s, x) => s + x.spread, 0) / arr.length : null;
    const spreadMedioAcciones = avg(acciones);
    const spreadMedioCedears = avg(cedears);
    const spreadMedioON = avg(ons);
    const all = [...acciones, ...cedears, ...ons];
    const spreadMedio = all.length ? all.reduce((s, x) => s + x.spread, 0) / all.length : null;
    const topPeoresSpreads = [...all].sort((a, b) => b.spread - a.spread).slice(0, 5);

    // kyleLambdaProxy: sigma0 = std retornos GGAL.BA 90d, sigmaU = volumen medio normalizado (proxy)
    let kyleLambdaProxy: number | null = null;
    try {
      const closes = await fetchYahooCloses("GGAL.BA", "3mo");
      const rets = dailyReturns(closes.slice(-90));
      const sigma0 = std(rets);
      // sigmaU proxy: volumen medio normalizado — si no hay volumen, usar 0.02
      const sigmaU = 0.02;
      if (sigma0 > 0 && sigmaU > 0) kyleLambdaProxy = kyleLambda(sigma0, sigmaU);
    } catch { kyleLambdaProxy = null; }

    // caucion 7d via PPI panel (reusa lógica simple: intenta fetch PPI cauciones)
    let caucionTasa7d: number | null = null;
    try {
      const res = await fetch("https://www.portfoliopersonal.com/Cotizaciones/Cauciones", { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) } as any);
      if (res.ok) {
        const body = await res.text();
        const m = body.match(/"ticker":"PESOS7"[\s\S]{0,400}?"lastPrice":([0-9.]+)/);
        if (m) caucionTasa7d = parseFloat(m[1] ?? "") / 100;
      }
    } catch { /* fallback null */ }

    const liquidezFlag = spreadMedio != null && spreadMedio > 0.01 ? "alerta" : "ok";
    const warnings: string[] = [];
    if (spreadMedio == null) warnings.push("spreads no disponibles");
    if (kyleLambdaProxy == null) warnings.push("kyle proxy no disponible");

    const snap: MicroLocalSnapshot = {
      spreadMedioAcciones,
      spreadMedioCedears,
      spreadMedioON,
      spreadMedio,
      topPeoresSpreads,
      kyleLambdaProxy,
      caucionTasa7d,
      liquidezFlag,
      timestamp: new Date().toISOString(),
      warnings,
    };
    cache = { data: snap, ts: now };
    return snap;
  });
