/** Fallback de fundamentales cuando Yahoo quoteSummary está bloqueado/limitado.
 *  - Finviz snapshot: market cap, FCF (vía P/FCF), ventas, ingresos, deuda/patrimonio,
 *    caja/acción, beta, acciones, crecimiento (ventas/EPS), EV/EBITDA, precio.
 *  - stockanalysis.com forecast: precio objetivo de analistas y cantidad de analistas.
 *  Sin dependencias externas (regex + fetch). */

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FundamentalesFallback {
  nombre: string | null;
  precio: number | null;
  moneda: string | null;
  marketCap: number | null;
  fcf: number | null;
  revenue: number | null;
  netIncome: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  beta: number | null;
  deudaTotal: number | null;
  cajaTotal: number | null;
  accionesCirculacion: number | null;
  ebitda: number | null;
  esEmergente: boolean;
  sector: string | null;
  industria: string | null;
}

function esc(res: string): string {
  return res.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parsea un campo del snapshot de Finviz (acepta <b>valor</b> o <b><span..>valor</span></b>). */
function finvizGrab(html: string, label: string): string | null {
  const re = new RegExp(
    `snapshot-td-label">\\s*${esc(label)}\\s*</div></td><td[^>]*><div class="snapshot-td-content"><b>\\s*(?:<span[^>]*>)*\\s*([^<]+?)\\s*(?:</span>)?\\s*</b>`,
  );
  const m = html.match(re);
  const v = m?.[1];
  return v ? v.trim() : null;
}

function numeroFinviz(raw: string | null): number | null {
  if (!raw) return null;
  const s = raw.replace(/\s/g, "").replace(/−/g, "-").replace(/%$/, "");
  if (s === "-" || s === "--" || s === "N/A") return null;
  const suf = s.slice(-1);
  const cuerpo = s.slice(0, -1);
  let v: number;
  if (/[TBMK]$/.test(suf)) {
    v = parseFloat(cuerpo);
    if (isNaN(v)) return null;
    const f = { T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[suf];
    v = v * (f ?? 1);
  } else {
    v = parseFloat(s);
  }
  if (!isFinite(v)) return null;
  const esPct = raw.includes("%");
  return esPct ? v / 100 : v;
}

async function conTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  const timer = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
  return Promise.race([p, timer]);
}

/** Snapshot Finviz de un ticker (devuelve null si no está disponible). */
export async function obtenerFundamentalesFinviz(
  ticker: string,
): Promise<FundamentalesFallback | null> {
  try {
    const res = await conTimeout(
      fetch(`https://finviz.com/quote.ashx?t=${encodeURIComponent(ticker)}&p=d`, {
        headers: { "User-Agent": UA, Accept: "text/html" },
      }),
      12000,
    );
    if (!res.ok) return null;
    const html = await res.text();
    const g = (l: string) => numeroFinviz(finvizGrab(html, l));
    const precio = g("Price") ?? g("Prev Close");
    const marketCap = g("Market Cap");
    const pfcf = g("P/FCF");
    const debtEq = g("Debt/Eq");
    const bookSh = g("Book/sh");
    const cashSh = g("Cash/sh");
    const acciones = g("Shs Outstand");
    const ev = g("Enterprise Value");
    const evEbitda = g("EV/EBITDA");
    if (precio == null && marketCap == null) return null;

    const fcf = marketCap != null && pfcf != null && pfcf > 0 ? marketCap / pfcf : null;
    const equity = bookSh != null && acciones != null ? bookSh * acciones : null;
    const deudaTotal = equity != null && debtEq != null ? Math.max(0, equity * debtEq) : null;
    const cajaTotal = cashSh != null && acciones != null ? cashSh * acciones : null;
    const ebitda = ev != null && evEbitda != null && evEbitda > 0 ? ev / evEbitda : null;

    const titulo = html.match(/<title>([^<]+\s-\s[^<]+)\s-\sStock/);
    return {
      nombre: titulo?.[1]?.trim() ?? null,
      precio,
      moneda: "USD",
      marketCap,
      fcf,
      revenue: g("Sales"),
      netIncome: g("Income"),
      revenueGrowth: g("Sales Y/Y TTM") ?? g("Sales past 3/5Y"),
      earningsGrowth: g("EPS next 5Y") ?? g("EPS Y/Y TTM") ?? g("EPS past 3/5Y"),
      beta: g("Beta"),
      deudaTotal,
      cajaTotal,
      accionesCirculacion: acciones,
      ebitda,
      esEmergente: /\.(BA|MX|SA|BV)$/i.test(ticker),
      sector: null,
      industria: null,
    };
  } catch {
    return null;
  }
}

export interface ForecastAnalistas {
  targetMeanPrice: number | null;
  numeroAnalistas: number | null;
  rating: string | null;
  crecimientoLargoPlazo: number | null;
}

/** Precio objetivo, cantidad de analistas y crecimiento estimado desde stockanalysis.com forecast. */
export async function obtenerForecastAnalistas(ticker: string): Promise<ForecastAnalistas | null> {
  try {
    const res = await conTimeout(
      fetch(
        `https://stockanalysis.com/stocks/${encodeURIComponent(ticker.toLowerCase())}/forecast/`,
        {
          headers: { "User-Agent": UA, Accept: "text/html" },
        },
      ),
      12000,
    );
    if (!res.ok) return null;
    const html = await res.text();
    const mTarget = html.match(/average\s+price\s+target\s+of\s+\$([\d,.]+)/i);
    const mAnalistas = html.match(/according\s+to\s+(\d+)\s+analysts/i);
    const mRating = html.match(/consensus\s+rating\s+of\s+"([^"]+)"/i);
    return {
      targetMeanPrice: mTarget?.[1] ? parseFloat(mTarget[1].replace(/,/g, "")) : null,
      numeroAnalistas: mAnalistas?.[1] ? parseInt(mAnalistas[1], 10) : null,
      rating: mRating?.[1] ? mRating[1] : null,
      crecimientoLargoPlazo: null,
    };
  } catch {
    return null;
  }
}
