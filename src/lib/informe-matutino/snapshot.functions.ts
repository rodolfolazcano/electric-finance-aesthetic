import { createServerFn } from "@tanstack/react-start";
import { getYahooQuoteServer } from "../market-data.functions";
import { getArgentinaContext } from "../argentina-context.functions";
import { getMarketScreeners, getMacroContextAR } from "../daily-opportunities.functions";
import { getMarketNews } from "../market-news.functions";
import { getCached, setCache } from "../cache";
import type {
  MarketContextSnapshot,
  Cierre,
  Commodity,
  Tasa,
  NoticiaCruda,
} from "./types";
import type { QuoteData } from "../market-data.types";
import type { MarketNewsItem } from "../market-news.functions";
import { getAgendaSemana } from "./agenda-economica";

function settledTicker(
  r: PromiseSettledResult<QuoteData>,
  ticker: string,
): Cierre | null {
  if (r.status === "rejected" || !r.value.precio) return null;
  return { ticker, precio: r.value.precio, variacionPct: r.value.variacionPct };
}

function settledCommodity(
  r: PromiseSettledResult<QuoteData>,
  ticker: string,
  nombre: string,
): Commodity | null {
  if (r.status === "rejected" || !r.value.precio) return null;
  return { ticker, nombre, precio: r.value.precio, variacionPct: r.value.variacionPct };
}

function settledTasa(
  r: PromiseSettledResult<QuoteData>,
  nombre: string,
): Tasa | null {
  if (r.status === "rejected" || r.value.precio == null) return null;
  return { nombre, valor: r.value.precio };
}

function normalizarNoticia(n: MarketNewsItem): NoticiaCruda {
  return {
    titulo: n.title,
    fuente: n.source,
    resumen: n.summary ?? "",
    url: n.url,
  };
}

const CACHE_KEY = "informe-snapshot";
const CACHE_TTL = 15 * 60 * 1000;

export const buildMarketSnapshot = createServerFn({ method: "GET" })
  .handler(async (): Promise<MarketContextSnapshot> => {
    const cached = getCached<MarketContextSnapshot>(CACHE_KEY, CACHE_TTL);
    if (cached) return cached;

    const [
      spy, qqq, dia, vix,
      n225, hsi, gdaxi, ibex,
      cl, gc,
      tnx,
      mervalRes,
      argentinaContext,
      screeners,
      macroAR,
      noticias,
    ] = await Promise.allSettled([
      getYahooQuoteServer({ data: { symbol: "SPY" } }),
      getYahooQuoteServer({ data: { symbol: "QQQ" } }),
      getYahooQuoteServer({ data: { symbol: "DIA" } }),
      getYahooQuoteServer({ data: { symbol: "^VIX" } }),
      getYahooQuoteServer({ data: { symbol: "^N225" } }),
      getYahooQuoteServer({ data: { symbol: "^HSI" } }),
      getYahooQuoteServer({ data: { symbol: "^GDAXI" } }),
      getYahooQuoteServer({ data: { symbol: "^IBEX" } }),
      getYahooQuoteServer({ data: { symbol: "CL=F" } }),
      getYahooQuoteServer({ data: { symbol: "GC=F" } }),
      getYahooQuoteServer({ data: { symbol: "^TNX" } }),
      getYahooQuoteServer({ data: { symbol: "^MERV" } }),
      getArgentinaContext(),
      getMarketScreeners(),
      getMacroContextAR(),
      getMarketNews(),
    ]);

    const cn = argentinaContext.status === "fulfilled" ? argentinaContext.value : null;

    const snapshot: MarketContextSnapshot = {
      fecha: new Date().toISOString().slice(0, 10),
      generadoEn: new Date().toISOString(),

      internacional: {
        cierreEEUU: [spy, qqq, dia, vix]
          .map((r, i) => settledTicker(r, (["SPY", "QQQ", "DIA", "^VIX"] as const)[i]))
          .filter((x): x is Cierre => x != null),

        asiaEuropa: [n225, hsi, gdaxi, ibex]
          .map((r, i) => settledTicker(r, (["^N225", "^HSI", "^GDAXI", "^IBEX"] as const)[i]))
          .filter((x): x is Cierre => x != null),

        commodities: [
          settledCommodity(cl, "Petróleo WTI", "Petróleo"),
          settledCommodity(gc, "Oro", "Oro"),
        ].filter((x): x is Commodity => x != null),

        tasas: [settledTasa(tnx, "UST 10Y")].filter((x): x is Tasa => x != null),
      },

      local: {
        dolares: cn && cn.dolarOficial?.venta
          ? {
              oficial: cn.dolarOficial.venta,
              blue: cn.dolarBlue?.venta ?? 0,
              mep: cn.dolarMEP?.venta ?? 0,
              ccl: cn.dolarCCL?.venta ?? 0,
              brechaCCLPct: cn.brechaCCLPct ?? 0,
            }
          : { oficial: 0, blue: 0, mep: 0, ccl: 0, brechaCCLPct: 0 },

        riesgoPais: cn?.riesgoPais
          ? { valor: cn.riesgoPais.valor, variacionPuntos: cn.riesgoPais.variacion }
          : { valor: 0, variacionPuntos: 0 },

        reservas: cn?.reservas
          ? { valorUSD: cn.reservas.nivel, variacionUSD: cn.reservas.variacionDiaria }
          : { valorUSD: 0, variacionUSD: 0 },

        inflacion: cn?.inflacionMensual
          ? {
              mensualPct: cn.inflacionMensual.valor,
              interanualPct: cn.inflacionInteranual?.valor ?? 0,
              fechaDato: cn.inflacionMensual.fecha,
            }
          : { mensualPct: 0, interanualPct: 0, fechaDato: "" },

        uva: { valor: cn?.uva?.valor ?? 0 },

        tasaPlazoFijo: {
          promedioTNA: cn?.tasaPF?.tna30d ? cn.tasaPF.tna30d * 100 : 0,
        },

        merval: (() => {
          const merv = mervalRes.status === "fulfilled" ? mervalRes.value : null;
          const ccl = cn?.dolarCCL?.venta;
          return {
            puntos: merv?.precio ?? 0,
            variacionPct: merv?.variacionPct ?? 0,
            enUSD: merv?.precio && ccl ? +(merv.precio / ccl).toFixed(0) : 0,
          };
        })(),
      },

      agendaDelDia: getAgendaSemana(new Date().toISOString().slice(0, 10)),

      screeners: screeners.status === "fulfilled"
        ? screeners.value
        : await getMarketScreeners().catch(() => ({
            day_gainers: [], day_losers: [], most_actives: [],
            most_shorted: [], undervalued: [], generatedAt: new Date().toISOString(),
          })),

      macroContextoAR: macroAR.status === "fulfilled"
        ? macroAR.value
        : { dolarCCL: null, dolarMEP: null, dolarBlue: null, riesgoPais: null, generatedAt: new Date().toISOString() },

      noticiasCrudas: noticias.status === "fulfilled"
        ? noticias.value.items.slice(0, 10).map(normalizarNoticia)
        : [],

      clienteActivo: null,
    };

    setCache(CACHE_KEY, snapshot);
    return snapshot;
  });
