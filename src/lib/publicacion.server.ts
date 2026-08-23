/**
 * Publicaciones CORONAR para el bot de publicaciones (@coronar_inversiones_bot).
 *
 * Pipeline completo con las funciones de la app:
 *   datos de mercado (yahoo-http, cache disco) + noticias del día (Yahoo Search)
 *   + ratio de Sharpe calculado sobre cierres reales
 *   → slide PNG profesional 1080x1080 (satori + resvg, sin IA)
 *   → texto editorial largo estilo informe
 *   → sendPhoto + sendMessage al bot de publicaciones.
 */

type Noticia = { titulo: string; fuente?: string; link?: string; hace?: string };

export type DatosPublicacion = {
  ticker: string;
  symbolTv: string;
  nombre?: string;
  moneda?: string;
  precio: number | null;
  var1d: number | null;
  var1m: number | null;
  max52: number | null;
  min52: number | null;
  sharpe: number | null;
  volAnual: number | null;
  peForward: number | null;
  roe: number | null;
  beta: number | null;
  marketCap: number | null;
  upsideAnalistas: number | null;
  epsProximoEst: number | null;
  fechaProximoBalance: string | null;
  sparkline: Array<{ f: string; v: number }>;
  noticias: Noticia[];
};

// ── Sharpe y helpers ────────────────────────────────────────────────────────

function retornosDiarios(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1]!;
    const b = closes[i]!;
    if (a > 0 && isFinite(b)) out.push((b - a) / a);
  }
  return out;
}

/** Ratio de Sharpe anualizado sobre cierres diarios (rf fija configurable, default 4% nominal EE.UU.). */
export function calcularSharpe(closes: number[], rfAnual = 0.04): { sharpe: number | null; volAnual: number | null } {
  const r = retornosDiarios(closes);
  if (r.length < 30) return { sharpe: null, volAnual: null };
  const media = r.reduce((a, b) => a + b, 0) / r.length;
  const varianza = r.reduce((s, x) => s + (x - media) ** 2, 0) / (r.length - 1);
  const desvio = Math.sqrt(varianza);
  if (!desvio) return { sharpe: null, volAnual: null };
  const rfDiaria = rfAnual / 252;
  const sharpe = ((media - rfDiaria) / desvio) * Math.sqrt(252);
  return { sharpe: isFinite(sharpe) ? sharpe : null, volAnual: desvio * Math.sqrt(252) };
}

function fmtMoneda(v: number | null, moneda = "USD"): string {
  if (v == null || !isFinite(v)) return "N/D";
  const sufijo = moneda === "USD" ? "USD " : "";
  if (Math.abs(v) >= 1e12) return `${sufijo}${(v / 1e12).toFixed(2)}B`;
  if (Math.abs(v) >= 1e9) return `${sufijo}${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `${sufijo}${(v / 1e6).toFixed(1)}M`;
  return `${sufijo}${v.toFixed(2)}`;
}

function pctStr(v: number | null, decimales = 1): string {
  if (v == null || !isFinite(v)) return "N/D";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(decimales)}%`;
}

function pctNumStr(v: number | null, sufijo = "%"): string {
  if (v == null || !isFinite(v)) return "N/D";
  return `${v.toFixed(1)}${sufijo}`;
}

// ── Recolección de datos (funciones existentes de la app) ──────────────────

async function cerrarSerie(ticker: string): Promise<{ serie: Array<{ f: string; v: number }>; moneda?: string }> {
  try {
    const { fetchYahooChart } = await import("@/lib/yahoo-http");
    const chart: unknown = await fetchYahooChart(ticker, "6mo", "1d");
    const r0 = (
      chart as {
        chart?: {
          result?: Array<{
            meta?: { currency?: string };
            timestamp?: number[];
            indicators?: { quote?: Array<{ close?: unknown[] }> };
          }>;
        };
      }
    )?.chart?.result?.[0];
    const closes = (r0?.indicators?.quote?.[0]?.close ?? []) as unknown[];
    const ts = r0?.timestamp ?? [];
    const serie = ts
      .map((t: number, i: number) => ({
        f: new Date(t * 1000).toISOString().slice(0, 10),
        v: Number(closes[i]),
      }))
      .filter((p) => isFinite(p.v));
    return { serie, moneda: r0?.meta?.currency };
  } catch {
    return { serie: [] };
  }
}

async function quoteRapido(ticker: string): Promise<{ precio: number | null; var1d: number | null }> {
  try {
    const { fetchYahooQuote } = await import("@/lib/yahoo-http");
    const q: unknown = await fetchYahooQuote(ticker);
    const r = (q as { quoteResponse?: { result?: Array<Record<string, unknown>> } })?.quoteResponse?.result?.[0];
    const precio = (r?.regularMarketPrice ?? null) as number | null;
    const var1d = (r?.regularMarketChangePercent ?? null) as number | null;
    return { precio: typeof precio === "number" ? precio : null, var1d: typeof var1d === "number" ? var1d : null };
  } catch {
    return { precio: null, var1d: null };
  }
}

async function fundamentosRapidos(ticker: string): Promise<{
  nombre?: string;
  peForward: number | null;
  roe: number | null;
  beta: number | null;
  marketCap: number | null;
  upsideAnalistas: number | null;
}> {
  try {
    const { fetchYahooQuoteSummaryJson } = await import("@/lib/yahoo-http");
    const res = await fetchYahooQuoteSummaryJson<{
      quoteSummary?: {
        result?: Array<{
          assetProfile?: { longName?: string; shortName?: string };
          summaryDetail?: { forwardPE?: number; beta?: number };
          financialData?: {
            currentPrice?: number;
            targetMeanPrice?: number;
            returnOnEquity?: number;
          };
          defaultKeyStatistics?: { forwardPE?: number };
          price?: { marketCap?: number };
          calendarEvents?: { earnings?: { earningsDate?: number[] } };
          earningsTrend?: { trend?: Array<{ period?: string; earningsEstimate?: { avg?: number } }> };
        }>;
      };
    }>(ticker, ["assetProfile", "summaryDetail", "financialData", "defaultKeyStatistics", "price"]);
    const r = res.json?.quoteSummary?.result?.[0];
    if (!r) return { peForward: null, roe: null, beta: null, marketCap: null, upsideAnalistas: null };
    const precio = r.financialData?.currentPrice ?? null;
    const target = r.financialData?.targetMeanPrice ?? null;
    const upside = precio && target && precio > 0 ? ((target - precio) / precio) * 100 : null;
    return {
      nombre: r.assetProfile?.longName ?? r.assetProfile?.shortName,
      peForward: (r.summaryDetail?.forwardPE ?? r.defaultKeyStatistics?.forwardPE ?? null) as number | null,
      roe: (r.financialData?.returnOnEquity ?? null) as number | null,
      beta: (r.summaryDetail?.beta ?? null) as number | null,
      marketCap: (r.price?.marketCap ?? null) as number | null,
      upsideAnalistas: upside != null && isFinite(upside) ? upside : null,
    };
  } catch {
    return { peForward: null, roe: null, beta: null, marketCap: null, upsideAnalistas: null };
  }
}

async function noticiasDelDia(query: string, count = 4): Promise<Noticia[]> {
  try {
    const { fetchYahooSearchNews } = await import("@/lib/yahoo-http");
    const items = await fetchYahooSearchNews(query, count);
    return items.map((n) => ({
      titulo: n.title,
      fuente: n.publisher,
      link: n.link,
      hace: new Date(n.providerPublishTime * 1000).toLocaleDateString("es-AR"),
    }));
  } catch {
    return [];
  }
}

/** Reúne TODO para la publicación en paralelo (rápido: cada dato es independiente). */
export async function obtenerDatosPublicacion(tickerRaw: string): Promise<DatosPublicacion> {
  const ticker = tickerRaw.trim().toUpperCase();
  let symbolTv = `NASDAQ:${ticker}`;
  try {
    const { normalizarSimboloTv } = await import("@/lib/tradingview-snapshot.server");
    symbolTv = normalizarSimboloTv(ticker);
  } catch { /* default */ }

  const [serieRes, quote, fund, noticias] = await Promise.all([
    cerrarSerie(ticker),
    quoteRapido(ticker),
    fundamentosRapidos(ticker),
    noticiasDelDia(ticker, 4),
  ]);

  const closes = serieRes.serie.map((p) => p.v);
  const { sharpe, volAnual } = calcularSharpe(closes);

  // var 1D desde la serie si no vino el quote
  let var1d = quote.var1d;
  if (var1d == null && closes.length >= 2) {
    const a = closes[closes.length - 2]!;
    const b = closes[closes.length - 1]!;
    var1d = a > 0 ? ((b - a) / a) * 100 : null;
  }
  // var 1M (~21 velas)
  let var1m: number | null = null;
  if (closes.length >= 22) {
    const a = closes[closes.length - 22]!;
    const b = closes[closes.length - 1]!;
    var1m = a > 0 ? ((b - a) / a) * 100 : null;
  }
  // 52w aproximado con lo disponible (6mo)
  const max52 = closes.length ? Math.max(...closes) : null;
  const min52 = closes.length ? Math.min(...closes) : null;

  return {
    ticker,
    symbolTv,
    nombre: fund.nombre,
    moneda: serieRes.moneda ?? "USD",
    precio: quote.precio ?? (closes.length ? closes[closes.length - 1]! : null),
    var1d,
    var1m,
    max52,
    min52,
    sharpe,
    volAnual,
    peForward: fund.peForward,
    roe: fund.roe != null ? fund.roe * 100 : null,
    beta: fund.beta,
    marketCap: fund.marketCap,
    upsideAnalistas: fund.upsideAnalistas,
    epsProximoEst: null,
    fechaProximoBalance: null,
    sparkline: serieRes.serie.slice(-90),
    noticias,
  };
}

// ── Slide PNG profesional (satori + resvg) ─────────────────────────────────

async function cargarFuente(): Promise<{ name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[]> {
  const fs = await import("node:fs");
  const candidatos: Array<[string, 400 | 700]> = [
    ["C:/Windows/Fonts/segoeuib.ttf", 700],
    ["C:/Windows/Fonts/arialbd.ttf", 700],
    ["C:/Windows/Fonts/segoeui.ttf", 400],
    ["C:/Windows/Fonts/arial.ttf", 400],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 700],
    ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 400],
  ];
  const fuentes: { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" }[] = [];
  for (const [p, weight] of candidatos) {
    try {
      const data = fs.readFileSync(p);
      fuentes.push({
        name: "Sans",
        data: data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
        weight,
        style: "normal",
      });
    } catch { /* siguiente */ }
    if (fuentes.length >= 2) break;
  }
  if (!fuentes.length) throw new Error("sin fuentes de sistema para satori");
  return fuentes;
}

function sparklineDataUri(serie: Array<{ v: number }>, w = 1000, h = 180): string {
  const pts = serie.map((p) => p.v).filter((v) => isFinite(v));
  if (pts.length < 5) return "";
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = w / (pts.length - 1);
  const coords = pts.map((v, i) => `${(i * stepX).toFixed(1)},${(h - 12 - ((v - min) / span) * (h - 24)).toFixed(1)}`);
  const subio = pts[pts.length - 1]! >= pts[0]!;
  const color = subio ? "#22c55e" : "#ef4444";
  const fill = subio ? "rgba(34,197,94,0.10)" : "rgba(239,68,68,0.10)";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><polygon points="0,${h} ${coords.join(" ")} ${w},${h}" fill="${fill}"/><polyline points="${coords.join(" ")}" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

const C = {
  bg: "#0A0E17",
  panel: "#101827",
  borde: "#1F2A44",
  texto: "#EDF2FB",
  gris: "#8CA0BF",
  verde: "#22C55E",
  rojo: "#EF4444",
  acento: "#38BDF8",
  ambar: "#F59E0B",
};

/** Genera el slide PNG 1080x1080 moderno y profesional. */
export async function generarSlidePng(d: DatosPublicacion): Promise<Buffer> {
  const { default: satori } = await import(/* @vite-ignore */ "satori");
  const { html: toVNode } = await import(/* @vite-ignore */ "satori-html");
  const { Resvg } = await import(/* @vite-ignore */ "@resvg/resvg-js");

  const W = 1080;
  const H = 1080;
  const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" });
  const subio = (d.var1d ?? 0) >= 0;
  const colorVar = subio ? C.verde : C.rojo;
  const spark = sparklineDataUri(d.sparkline);
  const scoreAprox = d.sharpe != null ? Math.max(0, Math.min(10, (d.sharpe + 0.5) * 2.2)) : null;

  const stat = (label: string, valor: string, color = C.texto): string =>
    `<div style="display:flex;flex-direction:column;background:${C.panel};border:1px solid ${C.borde};border-radius:16px;padding:18px 20px;width:308px;">
      <div style="font-size:20px;color:${C.gris};letter-spacing:2px;">${label}</div>
      <div style="font-size:34px;font-weight:700;color:${color};margin-top:6px;">${valor}</div>
    </div>`;

  const noti = d.noticias.slice(0, 3)
    .map(
      (n) => `<div style="display:flex;margin-top:14px;">
        <div style="width:8px;height:8px;border-radius:8px;background:${C.acento};margin-top:12px;"></div>
        <div style="margin-left:14px;display:flex;flex-direction:column;">
          <div style="font-size:26px;line-height:1.35;color:${C.texto};">${escapeHtml(n.titulo.slice(0, 110))}</div>
          <div style="font-size:20px;color:${C.gris};margin-top:4px;">${escapeHtml(n.fuente ?? "")}${n.hace ? " · " + n.hace : ""}</div>
        </div>
      </div>`,
    )
    .join("");

  const markup = `
<div style="width:${W}px;height:${H}px;display:flex;flex-direction:column;background:${C.bg};padding:48px;font-family:Sans;">
  <!-- header -->
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;align-items:center;">
      <div style="width:14px;height:14px;border-radius:14px;background:${C.verde};"></div>
      <div style="font-size:28px;font-weight:700;color:${C.texto};letter-spacing:4px;margin-left:14px;">CORONAR</div>
      <div style="font-size:22px;color:${C.gris};margin-left:16px;">· PUBLICACIÓN DE MERCADO</div>
    </div>
    <div style="font-size:24px;color:${C.gris};">${fecha}</div>
  </div>

  <!-- ticker -->
  <div style="display:flex;align-items:flex-end;margin-top:40px;">
    <div style="font-size:96px;font-weight:700;color:${C.texto};line-height:1;">${escapeHtml(d.ticker)}</div>
    ${d.nombre ? `<div style="font-size:26px;color:${C.gris};margin-left:22px;margin-bottom:10px;">${escapeHtml(d.nombre.slice(0, 26))}</div>` : ""}
  </div>
  <div style="display:flex;align-items:center;margin-top:16px;">
    <div style="font-size:56px;font-weight:700;color:${C.texto};">${fmtMoneda(d.precio, d.moneda === "ARS" ? "ARS" : "USD").startsWith("USD") ? "$" : "$"}${d.precio != null ? d.precio.toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "N/D"}</div>
    <div style="font-size:32px;font-weight:700;color:${colorVar};background:${subio ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)"};border-radius:12px;padding:6px 16px;margin-left:22px;">${pctNumStr(d.var1d)}</div>
    ${d.var1m != null ? `<div style="font-size:24px;color:${C.gris};margin-left:18px;">1M ${pctNumStr(d.var1m)}</div>` : ""}
  </div>

  <!-- sparkline -->
  ${spark ? `<div style="margin-top:26px;"><img src="${spark}" width="${W - 96}" height="170" style="border-radius:14px;" /></div>` : ""}

  <!-- stats -->
  <div style="display:flex;flex-wrap:wrap;margin-top:26px;">
    ${stat("SHARPE (6M)", d.sharpe != null ? d.sharpe.toFixed(2) : "N/D", d.sharpe != null && d.sharpe > 1 ? C.verde : d.sharpe != null && d.sharpe < 0 ? C.rojo : C.ambar)}
    ${stat("VOLATILIDAD ANUAL", pctNumStr(d.volAnual != null ? d.volAnual * 100 : null))}
    ${stat("BETA", d.beta != null ? d.beta.toFixed(2) : "N/D")}
    ${stat("P/E FORWARD", d.peForward != null ? d.peForward.toFixed(1) : "N/D")}
    ${stat("ROE", pctNumStr(d.roe))}
    ${stat("UPSIDE ANALISTAS", pctNumStr(d.upsideAnalistas))}
  </div>

  ${scoreAprox != null ? `<div style="margin-top:24px;">
    <div style="font-size:22px;color:${C.gris};letter-spacing:2px;">CALIDAD RIESGO-RETORNO</div>
    <div style="height:16px;background:${C.panel};border-radius:10px;margin-top:10px;position:relative;">
      <div style="width:${Math.round(scoreAprox * 10)}%;height:16px;border-radius:10px;background:linear-gradient(90deg,#38BDF8,#22C55E);"></div>
    </div>
  </div>` : ""}

  <!-- noticias -->
  <div style="flex:1;"></div>
  <div style="background:${C.panel};border:1px solid ${C.borde};border-radius:20px;padding:26px 28px;">
    <div style="font-size:22px;font-weight:700;color:${C.acento};letter-spacing:3px;">NOTICIAS DEL DÍA</div>
    ${noti || `<div style="font-size:24px;color:${C.gris};margin-top:12px;">Sin titulares verificados hoy.</div>`}
  </div>

  <!-- footer -->
  <div style="display:flex;justify-content:space-between;margin-top:22px;">
    <div style="font-size:20px;color:#5B6B87;">Educativo — no es recomendación personalizada. DYOR.</div>
    <div style="font-size:20px;color:#5B6B87;">${escapeHtml(d.symbolTv)}</div>
  </div>
</div>`.trim();

  const vnode = toVNode(markup) as unknown as Parameters<typeof satori>[0];
  const fuentes = await cargarFuente();
  const svg = await satori(vnode, { width: W, height: H, fonts: fuentes });
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: W } });
  return Buffer.from(resvg.render().asPng());
}

function escapeHtml(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Texto editorial (formato publicación larga) ────────────────────────────

export function armarTextoPublicacion(d: DatosPublicacion, senal?: string, motivo?: string): string {
  const fecha = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" });
  const lineas: string[] = [];
  lineas.push(`<b>${escapeHtml(d.ticker)}${d.nombre ? " — " + escapeHtml(d.nombre) : ""}: ${senal ?? "lectura de mercado"} al ${fecha}</b>`);
  lineas.push("");
  lineas.push(
    `La acción opera en <b>${fmtMoneda(d.precio)}</b>${d.var1d != null ? ` con una variación de <b>${pctNumStr(d.var1d)}</b> en la jornada` : ""}${d.var1m != null ? ` y <b>${pctNumStr(d.var1m)}</b> en el último mes` : ""}. El ratio de Sharpe de los últimos seis meses se ubica en <b>${d.sharpe != null ? d.sharpe.toFixed(2) : "N/D"}</b>, con volatilidad anualizada de ${pctNumStr(d.volAnual != null ? d.volAnual! * 100 : null)} y beta ${d.beta != null ? d.beta.toFixed(2) : "N/D"} frente al mercado.`,
  );
  if (d.peForward != null || d.roe != null || d.upsideAnalistas != null) {
    lineas.push("");
    lineas.push(
      `🔹 <b>Fundamentales.</b> P/E forward ${d.peForward != null ? d.peForward.toFixed(1) : "N/D"}, ROE ${pctNumStr(d.roe)}, capitalización ${fmtMoneda(d.marketCap)}${d.upsideAnalistas != null ? `, precio objetivo de analistas implica un upside de <b>${pctNumStr(d.upsideAnalistas)}</b>` : ""}.`,
    );
  }
  if (d.noticias.length) {
    lineas.push("");
    lineas.push(`🔹 <b>Lo que se está leyendo hoy.</b>`);
    for (const n of d.noticias.slice(0, 3)) {
      lineas.push(`— ${escapeHtml(n.titulo)} (<i>${escapeHtml(n.fuente ?? "fuente")}</i>).`);
    }
  }
  if (motivo) {
    lineas.push("");
    lineas.push(`✅ <b>Síntesis.</b> ${escapeHtml(motivo)}`);
  }
  lineas.push("");
  lineas.push(`<i>Educativo — no recomendación personalizada. Verificá en tu broker. Fuente: Yahoo Finance / TradingView.</i>`);
  return lineas.join("\n");
}

// ── Formato OPORTUNIDADES (🚀 estilo editorial corto) ─────────────────────

export type ItemOportunidad = { ticker: string; nombre?: string; descripcion: string; razon: string; varYtd?: number | null };

/** Arma la publicación en el formato 🚀 exacto del bot de publicaciones. */
export function formatoOportunidades(o: {
  titulo: string;
  items: ItemOportunidad[];
  porQue: string;
  cierre?: string;
}): string {
  const L: string[] = [];
  L.push(`🚀 ${o.titulo}`);
  L.push("");
  L.push(`📊 Los ${o.items.length} recomendados:`);
  for (const it of o.items) {
    const nombre = it.nombre ? ` (${it.nombre})` : "";
    L.push(`* ${it.ticker}${nombre}: ${it.descripcion} ➡️ ${it.razon}`);
  }
  L.push(`💡 ¿Por qué sumar estos activos a tu estrategia?`);
  L.push(o.porQue);
  if (o.cierre) {
    L.push("");
    L.push(o.cierre);
  }
  return L.join("\n").slice(0, 3800);
}

// Descripciones curadas para universos frecuentes (fallback genérico si no está).
const CATALOGO_OPORTUNIDADES: Record<string, { descripcion: string; razon: string }> = {
  IBIT: { descripcion: "ETF de Bitcoin (BlackRock)", razon: "Seguimiento directo a BTC" },
  ETHA: { descripcion: "ETF de Ethereum", razon: "Exposición a la red líder de contratos inteligentes" },
  COIN: { descripcion: "Coinbase", razon: "El exchange más grande de EE. UU. captura el volumen de operaciones" },
  HOOD: { descripcion: "Robinhood", razon: "Se beneficia por mayor actividad minorista" },
  MSTR: { descripcion: "Strategy (MicroStrategy)", razon: "Tesla corporativo del bitcoin: balance respaldado en BTC" },
  NVDA: { descripcion: "NVIDIA", razon: "Motor del capex en IA global" },
  MSFT: { descripcion: "Microsoft", razon: "Azure + OpenAI: nube y IA empresarial" },
  AAPL: { descripcion: "Apple", razon: "Ecosistema, buybacks y calidad riesgo-retorno" },
  MELI: { descripcion: "MercadoLibre", razon: "E-commerce + fintech líder de LatAm" },
  GGAL: { descripcion: "Grupo Financiero Galicia", razon: "Banca argentina con exposición a la normalización crediticia" },
  YPF: { descripcion: "YPF", razon: "Vaca Muerta y el shale como driver de largo plazo" },
  PAMP: { descripcion: "Pampa Energía", razon: "Energía integrada: gas, electricidad y upstream" },
};

function itemDesdeCatalogo(ticker: string): ItemOportunidad {
  const c = CATALOGO_OPORTUNIDADES[ticker.toUpperCase()];
  return {
    ticker: ticker.toUpperCase(),
    descripcion: c?.descripcion ?? "",
    razon: c?.razon ?? "Oportunidad detectada por el motor multi-capa CORONAR",
  };
}

/** Escanea el universo (motor unificado para BA + momentum Yahoo para US) y rankea oportunidades. */
export async function buscarOportunidades(opts: { tema?: string; max?: number; universo?: string[] }): Promise<ItemOportunidad[]> {
  const max = Math.max(2, Math.min(8, opts.max ?? 4));
  const tema = (opts.tema ?? "auto").toLowerCase();

  // 1) Motor unificado de la app (señales 4 capas sobre universo argentino/global)
  let delMotor: ItemOportunidad[] = [];
  try {
    const { generarSenalesUnificadas } = await import("@/lib/senales/motor-unificado");
    const { senales } = await (generarSenalesUnificadas as unknown as (
      s: string[],
      o: { topN: number; filtro: string },
    ) => Promise<{ senales: Array<Record<string, unknown>> }>)(opts.universo ?? [], { topN: 10, filtro: "todos" });
    delMotor = senales
      .filter((s) => typeof s.scoreTotal === "number")
      .sort((a, b) => Number(b.scoreTotal) - Number(a.scoreTotal))
      .map((s) => {
        const t = String(s.ticker ?? "").toUpperCase();
        const base = itemDesdeCatalogo(t);
        return {
          ticker: t,
          nombre: base.nombre,
          descripcion: base.descripcion || `${t}`,
          razon: `${base.razon} · score ${Number(s.scoreTotal).toFixed(1)}/10`,
          varYtd: null,
        };
      });
  } catch { /* motor no disponible → solo curados */ }

  // 2) Universo curado según tema
  const cripto = ["IBIT", "ETHA", "COIN", "HOOD"];
  const us = ["NVDA", "MSFT", "AAPL"];
  const ba = ["GGAL", "YPF", "PAMP", "MELI"];
  let candidatos: string[] = opts.universo?.length ? opts.universo : [...cripto, ...us];
  if (!opts.universo?.length && tema === "cripto") candidatos = cripto;
  else if (!opts.universo?.length && tema === "cedears") candidatos = [...cripto, ...us];
  else if (!opts.universo?.length && tema === "argentina") candidatos = ba;

  // 3) Datos vivos (var % día) en paralelo con tolerancia a fallos
  const vivos = await Promise.all(
    candidatos.map(async (tk) => {
      try {
        const { fetchYahooQuote } = await import("@/lib/yahoo-http");
        const q: unknown = await fetchYahooQuote(tk);
        const r = (q as { quoteResponse?: { result?: Array<{ regularMarketChangePercent?: number }> } })?.quoteResponse?.result?.[0];
        return { tk, var1d: (r?.regularMarketChangePercent ?? null) as number | null };
      } catch {
        return { tk, var1d: null as number | null };
      }
    }),
  );
  const varMap = new Map(vivos.map((v) => [v.tk, v.var1d]));

  // 4) Merge: motor primero, luego curados que falten; corta a max
  const vistos = new Set<string>();
  const items: ItemOportunidad[] = [];
  for (const it of delMotor) {
    if (items.length >= max) break;
    if (vistos.has(it.ticker)) continue;
    vistos.add(it.ticker);
    items.push({ ...it, varYtd: varMap.get(it.ticker) ?? null });
  }
  for (const tk of candidatos) {
    if (items.length >= max) break;
    if (vistos.has(tk)) continue;
    vistos.add(tk);
    const base = itemDesdeCatalogo(tk);
    const varD = varMap.get(tk);
    items.push({
      ...base,
      ticker: tk,
      razon: varD != null ? `${base.razon}${varD >= 0 ? ` · ${varD >= 0 ? "+" : ""}${varD.toFixed(1)}% hoy` : ` · ${varD.toFixed(1)}% hoy`}` : base.razon,
      varYtd: varD,
    });
  }
  return items;
}

/**
 * El agente RAZONA oportunidades y publica al bot de publicaciones en formato 🚀.
 * args: { tema?: cripto|cedears|argentina|auto, universo?: string[], max?: number,
 *         titulo?: string, porQue?: string, chatId?: string, conSlide?: boolean }
 */
export async function publicarOportunidades(argsRaw: string): Promise<{ ok: boolean; texto: string }> {
  let a: { tema?: string; universo?: string[]; max?: number; titulo?: string; porQue?: string; chatId?: string; conSlide?: boolean } = {};
  try {
    a = JSON.parse(argsRaw || "{}") as typeof a;
  } catch {
    return { ok: false, texto: "[ERROR] JSON inválido para publicar_oportunidades" };
  }

  // 1) Razonamiento de oportunidad: escaneo + ranking
  const items = await buscarOportunidades({ tema: a.tema, max: a.max ?? 4, universo: a.universo });
  if (!items.length) return { ok: false, texto: "[ERROR] sin oportunidades detectadas para ese universo" };

  const tituloPorTema: Record<string, string> = {
    cripto: "¡Oportunidad Crypto en CEDEARs!",
    cedears: "¡Oportunidades en CEDEARs internacionales!",
    argentina: "¡Oportunidades del mercado argentino!",
    auto: "¡Oportunidades del día para tu cartera!",
  };

  const pub = formatoOportunidades({
    titulo: a.titulo ?? tituloPorTema[(a.tema ?? "auto").toLowerCase()] ?? tituloPorTema.auto!,
    items,
    porQue:
      a.porQue ??
      "Son la puerta de entrada regulada para capturar los drivers del momento —rally crypto, IA, energía— con liquidez y sin cuentas externas",
    cierre: `<i>Educativo — no recomendación personalizada. Verificá disponibilidad en tu broker.</i>`,
  });

  // 2) Slide PNG del primer activo (opcional, no bloquea si falla)
  let png: Buffer | null = null;
  if (a.conSlide !== false) {
    try {
      const datosTop = await obtenerDatosPublicacion(items[0]!.ticker);
      png = await generarSlidePng(datosTop).catch(() => null);
    } catch { /* sin slide */ }
  }

  // 3) Envío AMBOS con prioridad: bot de publicaciones (@Coronarinversiones777_bot) → fallback agente
  const tg = await import("@/lib/telegram.server");
  const cfgPub = tg.getTelegramConfig();
  const cfgAgente = tg.getAgentBotConfig();
  const targetsPub = a.chatId ? [a.chatId] : cfgPub.chatIds;
  const detalles: string[] = [];
  let enviados = 0;

  const enviarPub = async (): Promise<boolean> => {
    if (!cfgPub.token || !targetsPub.length) {
      detalles.push("publicaciones: sin token/chats");
      return false;
    }
    let okAny = false;
    for (const cid of targetsPub) {
      let fotoOk = false;
      if (png) fotoOk = await tg.sendSignalsPhotoBuffer(cid, png, { caption: items.map((i) => i.ticker).join(" · ").slice(0, 200) });
      const msgOk = await tg.sendTelegramMessage({ text: pub, chatId: cid, parseMode: "HTML" }).then(() => true).catch(() => false);
      detalles.push(`publicaciones→${cid}: foto=${fotoOk ? "OK" : "-"} msg=${msgOk ? "OK" : "FAIL"}`);
      if (fotoOk || msgOk) { okAny = true; enviados++; }
    }
    return okAny;
  };

  const enviarAgente = async (): Promise<boolean> => {
    if (!cfgAgente.token || !cfgAgente.allowedChats.length) return false;
    let okAny = false;
    for (const cid of cfgAgente.allowedChats) {
      let fotoOk = false;
      if (png) fotoOk = await tg.sendAgentPhotoBuffer(cid, png, { caption: items.map((i) => i.ticker).join(" · ").slice(0, 200) });
      await tg.sendAgentMessage(cid, pub);
      detalles.push(`agente→${cid}: foto=${fotoOk ? "OK" : "-"}`);
      okAny = true; enviados++;
    }
    return okAny;
  };

  const okPub = await enviarPub();
  if (!okPub) await enviarAgente();

  const tickers = items.map((i) => i.ticker).join(", ");
  const resumen = `Publicación de oportunidades (${tickers}) enviada a ${enviados} chat(s). ${detalles.join(" | ")}`;
  return { ok: enviados > 0, texto: enviados > 0 ? resumen : `[ERROR] ${resumen} Texto generado:\n${pub.slice(0, 600)}` };
}

// ── Envío al bot de publicaciones ──────────────────────────────────────────

/** Publica slide PNG + texto en el bot de publicaciones; fallback agente. */
export async function publicarSlideMercado(argsRaw: string): Promise<{ ok: boolean; texto: string }> {
  let a: { ticker?: string; senal?: string; motivo?: string; caption?: string; chatId?: string } = {};
  try {
    a = JSON.parse(argsRaw || "{}") as typeof a;
  } catch {
    return { ok: false, texto: "[ERROR] JSON inválido para publicar_slide_mercado" };
  }
  const ticker = String(a.ticker ?? "").trim();
  if (!ticker) return { ok: false, texto: "[ERROR] publicar_slide_mercado requiere ticker (ej. AAPL)" };

  // 1) Datos completos en paralelo
  const datos = await obtenerDatosPublicacion(ticker);

  // 2) Slide PNG + texto editorial en paralelo
  const [png, textoPub] = await Promise.all([
    generarSlidePng(datos).catch((e) => {
      console.error("[publicar_slide] render fallo:", e instanceof Error ? e.message : e);
      return null as Buffer | null;
    }),
    Promise.resolve(armarTextoPublicacion(datos, a.senal, a.motivo)),
  ]);
  const captionBase = String(a.caption ?? a.motivo ?? "").trim();

  // 3) Envío AMBOS con prioridad: bot de publicaciones primero; fallback agente.
  const { getTelegramConfig, sendTelegramMessage, getAgentBotConfig, sendAgentPhotoBuffer, sendAgentMessage } =
    await import("@/lib/telegram.server");
  const cfgPub = getTelegramConfig();
  const cfgAgente = getAgentBotConfig();
  const targetsPub = a.chatId ? [a.chatId] : cfgPub.chatIds;
  const detalles: string[] = [];
  let enviados = 0;

  const enviarAPub = async (): Promise<boolean> => {
    if (!cfgPub.token || !targetsPub.length) {
      detalles.push("publicaciones: sin token/chats");
      return false;
    }
    let okAny = false;
    for (const cid of targetsPub) {
      let fotoOk = false;
      if (png) {
        const { sendSignalsPhotoBuffer } = await import("@/lib/telegram.server");
        fotoOk = await sendSignalsPhotoBuffer(cid, png, { caption: (captionBase || `${datos.ticker} · Sharpe ${datos.sharpe?.toFixed(2) ?? "N/D"}`).slice(0, 1024) });
      }
      const msgOk = await sendTelegramMessage({ text: textoPub, chatId: cid, parseMode: "HTML" }).then(() => true).catch(() => false);
      detalles.push(`publicaciones→${cid} foto=${fotoOk ? "OK" : "SKIP"} msg=${msgOk ? "OK" : "FAIL"}`);
      if (fotoOk || msgOk) { okAny = true; enviados++; }
    }
    return okAny;
  };

  const enviarAAgente = async (): Promise<boolean> => {
    if (!cfgAgente.token || !cfgAgente.allowedChats.length) {
      detalles.push("agente: sin token/chats");
      return false;
    }
    let okAny = false;
    for (const cid of cfgAgente.allowedChats) {
      let fotoOk = false;
      if (png) {
        fotoOk = await sendAgentPhotoBuffer(cid, png, { caption: (captionBase || `${datos.ticker} · Sharpe ${datos.sharpe?.toFixed(2) ?? "N/D"}`).slice(0, 1024) });
      }
      await sendAgentMessage(cid, textoPub);
      detalles.push(`agente→${cid} foto=${fotoOk ? "OK" : "SKIP"}`);
      okAny = true; enviados++;
    }
    return okAny;
  };

  const okPub = await enviarAPub();
  if (!okPub) await enviarAAgente();

  const resumen =
    `Publicación generada para ${datos.ticker} (${datos.symbolTv}): precio ${fmtMoneda(datos.precio)}, ` +
    `Sharpe 6M ${datos.sharpe != null ? datos.sharpe.toFixed(2) : "N/D"}, vol anual ${pctNumStr(datos.volAnual != null ? datos.volAnual! * 100 : null)}, ` +
    `P/E fwd ${datos.peForward?.toFixed(1) ?? "N/D"}, ROE ${pctNumStr(datos.roe)}, ${datos.noticias.length} noticia(s) incluida(s), ` +
    `slide PNG ${png ? `${png.length} bytes` : "no disponible"}. Enviado a ${enviados} chat(s). ${detalles.join(" | ")}`;
  return { ok: enviados > 0, texto: enviados > 0 ? resumen : `[ERROR] ${resumen}` };
}
