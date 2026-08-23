// Snapshot del gráfico TradingView descargable como PNG (server-only).
// Estrategia en cascada:
//   1) chart-img.com — API de imágenes reales de TradingView (clave HARDCODEADA abajo,
//      decisión del propietario: repo privado, deploy Vercel sin variables de entorno).
//      Soporta overlays (líneas horizontales Entrada/SL/TP) via parámetro drawings.
//   2) Puppeteer headless sobre el widgetembed (solo si está instalado; opcional).
//   3) Fallback QuickChart: línea de cierres + líneas horizontales de niveles.
//
// Env opcional (solo modo, NO credenciales):
//   TRADINGVIEW_SNAPSHOT=auto   (auto|chartimg|quickchart — default auto)

export const CHARTIMG_API_KEY = "WDYtGyPp1X4oUhcjNRR9k67zovEBdjM1c65FWckj"; // chart-img.com — plan señales CORONAR

export type TvLevelLine = { price: number; label?: string; color?: string };

export type TvSnapshotArgs = {
  ticker: string;
  interval?: string;
  width?: number;
  height?: number;
  lines?: TvLevelLine[];
  serieCierre?: Array<{ f: string; v: number }>;
  moneda?: string;
};

export type TvSnapshotResult = {
  ok: boolean;
  buffer?: Buffer;
  fuente?: "chart-img" | "widgetembed" | "quickchart";
  error?: string;
};

/** Normaliza un ticker a formato exchange:symbol de TradingView. */
export function normalizarSimboloTv(tickerRaw: string): string {
  const t = (tickerRaw || "").trim().toUpperCase();
  if (!t) return "NASDAQ:AAPL";
  if (/^[A-Z0-9.]+:[A-Z0-9.]+$/.test(t)) return t;
  if (t.endsWith(".BA")) return `BCBA:${t}`;
  const CRIPTO = new Set([
    "BTC",
    "ETH",
    "SOL",
    "BNB",
    "XRP",
    "ADA",
    "DOGE",
    "AVAX",
    "MATIC",
    "DOT",
    "LINK",
  ]);
  if (CRIPTO.has(t)) return `BINANCE:${t}USDT`;
  if (/^(USDT|USD)/.test(t)) return `BINANCE:${t.replace(/USDT?$/, "")}USDT`;
  return `NASDAQ:${t}`;
}

function intervaloTv(iv?: string): string {
  const v = (iv || "1D").toUpperCase().replace("M", "").replace("H", "");
  if (["1", "5", "15", "30", "60", "120", "240"].includes(v)) return v === "60" ? "60" : v;
  return "1D";
}

function entorno(name: string): string | undefined {
  const v = process.env[name];
  if (v && String(v).trim()) return String(v).trim();
  const ie = (import.meta as unknown as { env?: Record<string, unknown> }).env?.[name];
  if (typeof ie === "string" && ie.trim()) return ie.trim();
  return undefined;
}

// Límites del plan chart-img contratado (free): 50 imgs/día, 1 req/seg,
// máx 3 parámetros por request (GET), resolución máx 800x600, con filigrana.
const CHARTIMG_MAX_W = 800;
const CHARTIMG_MAX_H = 600;
let ultimoLlamadoChartImg = 0;

async function respetarRateLimitChartImg(): Promise<void> {
  const ahora = Date.now();
  const espera = ultimoLlamadoChartImg + 1100 - ahora;
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  ultimoLlamadoChartImg = Date.now();
}

function dibujarNiveles(lines?: TvLevelLine[]): unknown[] {
  return (lines ?? [])
    .filter((l) => isFinite(l.price))
    .map((l) => ({
      tool: "horizontal_line",
      points: [{ price: Number(l.price.toFixed(4)) }],
      text: l.label ?? "",
      override: { lineColor: l.color ?? "#f59e0b", lineWidth: 2, fontsize: 12 },
    }));
}

async function pedirImagenChartImg(url: string, init?: RequestInit): Promise<TvSnapshotResult> {
  await respetarRateLimitChartImg();
  const res = await fetch(url, { signal: AbortSignal.timeout(20000), ...init });
  if (!res.ok) return { ok: false, error: `chart-img HTTP ${res.status}` };
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("image")) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `chart-img respuesta no-imagen: ${body.slice(0, 120)}` };
  }
  return { ok: true, buffer: Buffer.from(await res.arrayBuffer()), fuente: "chart-img" };
}

async function viaChartImg(args: TvSnapshotArgs): Promise<TvSnapshotResult | null> {
  if (!CHARTIMG_API_KEY) return null;
  const symbol = normalizarSimboloTv(args.ticker);
  const interval = intervaloTv(args.interval);
  const width = Math.min(args.width ?? CHARTIMG_MAX_W, CHARTIMG_MAX_W);
  const height = Math.min(args.height ?? CHARTIMG_MAX_H, CHARTIMG_MAX_H);
  const drawings = dibujarNiveles(args.lines);

  // Intento A: POST con body JSON (los campos del body no cuentan como query params)
  try {
    const post = await pedirImagenChartImg("https://chart-img.com/v1/tradingview/advanced-chart", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: CHARTIMG_API_KEY,
        symbol,
        interval,
        theme: "dark",
        style: "candles",
        width,
        height,
        timezone: "Etc/UTC",
        ...(drawings.length ? { drawings } : {}),
      }),
    });
    if (post.ok) return post;
  } catch {
    // cae al intento B
  }

  // Intento B: GET con exactamente 3 parámetros (límite del plan free)
  try {
    const params = new URLSearchParams({ key: CHARTIMG_API_KEY, symbol, interval });
    return await pedirImagenChartImg(
      `https://chart-img.com/v1/tradingview/advanced-chart?${params.toString()}`,
    );
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

interface PvPage {
  setViewport(viewport: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  }): Promise<void>;
  goto(url: string, options?: unknown): Promise<unknown>;
  screenshot(options: unknown): Promise<unknown>;
}
interface PvBrowser {
  newPage(): Promise<PvPage>;
  close(): Promise<unknown>;
}

async function viaWidgetEmbed(args: TvSnapshotArgs): Promise<TvSnapshotResult | null> {
  try {
    // Import dinámico por nombre variable: puppeteer es opcional (no declarado en deps)
    const nombre = ["puppet", "eer"].join("");
    const mod = (await import(/* @vite-ignore */ /* webpackIgnore: true */ nombre).catch(
      () => null,
    )) as { default: { launch(options: unknown): Promise<PvBrowser> } } | null;
    if (!mod?.default) return null;
    const symbol = normalizarSimboloTv(args.ticker);
    const url =
      `https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(symbol)}` +
      `&interval=${intervaloTv(args.interval)}&theme=dark&style=1&timezone=Etc%2FUTC` +
      `&withdateranges=1&hide_side_toolbar=1&allow_symbol_change=0&save_image=1&locale=es`;
    const browser = await mod.default.launch({ headless: true, args: ["--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setViewport({
        width: args.width ?? 1280,
        height: args.height ?? 720,
        deviceScaleFactor: 1.5,
      });
      await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });
      await new Promise((r) => setTimeout(r, 3500));
      const shot = await page.screenshot({ type: "png" });
      return {
        ok: true,
        buffer: Buffer.from(shot instanceof Uint8Array ? shot : new Uint8Array(0)),
        fuente: "widgetembed",
      };
    } finally {
      await browser.close().catch(() => undefined);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function viaQuickChart(args: TvSnapshotArgs): Promise<TvSnapshotResult> {
  let serie = args.serieCierre?.filter((p) => isFinite(p.v)) ?? [];
  if (serie.length < 20) {
    try {
      const { fetchYahooChart } = await import("@/lib/yahoo-http");
      const chart: unknown = await fetchYahooChart(args.ticker, "6mo", "1d").catch(() => null);
      const r0 = (
        chart as {
          chart?: {
            result?: Array<{
              indicators?: { quote?: Array<{ close?: unknown[] }> };
              timestamp?: number[];
            }>;
          };
        }
      )?.chart?.result?.[0];
      const closes = (r0?.indicators?.quote?.[0]?.close ?? []) as number[];
      const ts = r0?.timestamp ?? [];
      serie = ts
        .map((t, i) => ({
          f: new Date(t * 1000).toISOString().slice(0, 10),
          v: closes[i] as number,
        }))
        .filter((p) => isFinite(p.v));
    } catch {
      // sin serie externa: se usa solo la provista por el llamador
    }
  }
  if (serie.length < 20) return { ok: false, error: "sin serie para fallback quickchart" };
  const muestra = serie.slice(-120);
  const labels = muestra.map((p) => p.f);
  const data = muestra.map((p) => Number(p.v.toFixed(2)));
  const colores = { entrada: "#38bdf8", sl: "#ef4444", tp: "#22c55e" };
  const datasets: Array<Record<string, unknown>> = [
    {
      label: args.ticker.toUpperCase(),
      data,
      borderColor: "rgb(14,165,233)",
      fill: false,
      pointRadius: 0,
    },
  ];
  (args.lines ?? []).forEach((l) => {
    if (!isFinite(l.price)) return;
    datasets.push({
      label: l.label ?? "",
      data: labels.map(() => Number(l.price.toFixed(2))),
      borderColor:
        l.color ??
        (l.label?.toUpperCase().includes("SL")
          ? colores.sl
          : l.label?.toUpperCase().startsWith("TP")
            ? colores.tp
            : colores.entrada),
      borderDash: [6, 4],
      pointRadius: 0,
      fill: false,
    });
  });
  const cfg = {
    type: "line",
    data: { labels, datasets },
    options: {
      title: {
        display: true,
        text: `${args.ticker.toUpperCase()}${args.moneda ? " (" + args.moneda + ")" : ""} — CORONAR`,
      },
      legend: {
        display: Boolean(args.lines?.length),
        position: "bottom",
        labels: { fontSize: 10 },
      },
      scales: { xAxes: [{ display: false }] },
    },
  };
  const url = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(cfg))}&width=1100&height=600&backgroundColor=rgba(10,14,25,1)&version=2`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, error: `quickchart HTTP ${res.status}` };
    return { ok: true, buffer: Buffer.from(await res.arrayBuffer()), fuente: "quickchart" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Descarga la imagen del gráfico TradingView del ticker.
 * lines: niveles horizontales a dibujar (Entrada / SL / TP1 / TP2).
 */
export async function fetchTradingViewSnapshot(args: TvSnapshotArgs): Promise<TvSnapshotResult> {
  const modo = (entorno("TRADINGVIEW_SNAPSHOT") ?? "auto").toLowerCase();
  const intentos: Array<() => Promise<TvSnapshotResult | null>> = [];
  if (modo !== "quickchart") intentos.push(() => viaChartImg(args));
  if (modo === "auto") intentos.push(() => viaWidgetEmbed(args));
  intentos.push(() => viaQuickChart(args));
  for (const intento of intentos) {
    const r = await intento();
    if (r?.ok && r.buffer) return r;
  }
  return { ok: false, error: "todas las estrategias fallaron" };
}
