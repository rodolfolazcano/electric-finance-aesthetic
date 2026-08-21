// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BONOS_DB } from "./bonos-data";
import { calcularRendimientosBono, type RendimientoBono } from "./renta-fija.functions";
import { calcularRendimientosON } from "./renta-fija/ons-tir-engine";
import {
  getSector,
  getPaymentModality,
  getFrecuenciaNumerica,
} from "./renta-fija/ons-classification";
import {
  COMPLETE_ONS_WITH_FLOWS,
  COMPLETE_ONS_ALL_WITH_FLOWS,
} from "./renta-fija/ons-complete-data";
import { fetchLivePricesRaw } from "./iol-cotizaciones";

interface BondMeta {
  ticker: string;
  emisor: string;
  vencimiento: string;
  tipoCupon: string;
  frecuencia: string;
  isin: string;
}

const BONDS_META: BondMeta[] = [
  {
    ticker: "BPA7D",
    emisor: "BCRA",
    vencimiento: "31/10/2027",
    tipoCupon: "Fixed",
    frecuencia: "Semiannually",
    isin: "AR0684877571",
  },
  {
    ticker: "BPB7D",
    emisor: "BCRA",
    vencimiento: "31/10/2027",
    tipoCupon: "Fixed",
    frecuencia: "Semiannually",
    isin: "AR0772251226",
  },
  {
    ticker: "BPC7D",
    emisor: "BCRA",
    vencimiento: "31/10/2027",
    tipoCupon: "Fixed",
    frecuencia: "Semiannually",
    isin: "AR0763285209",
  },
  {
    ticker: "BPD7D",
    emisor: "BCRA",
    vencimiento: "31/10/2027",
    tipoCupon: "Fixed",
    frecuencia: "Semiannually",
    isin: "AR0314171247",
  },
  {
    ticker: "BPA8D",
    emisor: "BCRA",
    vencimiento: "31/10/2028",
    tipoCupon: "Fixed",
    frecuencia: "Semiannually",
    isin: "AR0029227748",
  },
  {
    ticker: "BPB8D",
    emisor: "BCRA",
    vencimiento: "31/10/2028",
    tipoCupon: "Fixed",
    frecuencia: "Semiannually",
    isin: "AR0868821510",
  },
  {
    ticker: "GD29",
    emisor: "ARGENTINA",
    vencimiento: "9/7/2029",
    tipoCupon: "Fixed",
    frecuencia: "Semiannually",
    isin: "US040114HX11",
  },
  {
    ticker: "GD30",
    emisor: "ARGENTINA",
    vencimiento: "9/7/2030",
    tipoCupon: "Multi-coupon",
    frecuencia: "Semiannually",
    isin: "US040114HS26",
  },
  {
    ticker: "GD35",
    emisor: "ARGENTINA",
    vencimiento: "9/7/2035",
    tipoCupon: "Multi-coupon",
    frecuencia: "Semiannually",
    isin: "US040114HT09",
  },
  {
    ticker: "GD38",
    emisor: "ARGENTINA",
    vencimiento: "9/1/2038",
    tipoCupon: "Multi-coupon",
    frecuencia: "Semiannually",
    isin: "US040114HU71",
  },
  {
    ticker: "GD41",
    emisor: "ARGENTINA",
    vencimiento: "9/7/2041",
    tipoCupon: "Multi-coupon",
    frecuencia: "Semiannually",
    isin: "US040114HV54",
  },
  {
    ticker: "GD46",
    emisor: "ARGENTINA",
    vencimiento: "9/7/2046",
    tipoCupon: "Multi-coupon",
    frecuencia: "Semiannually",
    isin: "US040114HW38",
  },
];

export interface DashboardRow {
  ticker: string;
  emisor: string;
  vencimiento: string;
  tipoCupon: string;
  frecuencia: string;
  tasaCupon: number;
  proxPago: string;
  precio: number | null;
  precioAnterior: number | null;
  variacion: number | null;
  yieldVal: number | null;
  tea: number | null;
  tna: number | null;
  modDuration: number | null;
  paridad: number | null;
  currentYield: number | null;
  volumen: number | null;
  moneda: string;
  isin: string;
  fuente: "iol" | "estimado";
  tipoInstrumento: string;
  sector?: string;
  modality?: string;
  outstanding?: number | null;
}

interface IOLTituloRaw {
  simbolo: string;
  ultimoPrecio?: number;
  precio?: number;
  cierre?: number;
  cierreAnterior?: number;
  precioAnterior?: number;
  volumen?: number;
  variacionPorcentual?: number;
}

const ON_TICKERS = Object.values(BONOS_DB)
  .filter(
    (b) =>
      b.tipo === "ON Hard Dollar" ||
      b.tipo === "ON CER" ||
      b.tipo === "ON Badlar" ||
      b.tipo === "ON Tasa Fija",
  )
  .map((b) => b.ticker);

function parseIOLDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const [m, d, y] = parts;
    return new Date(+y, +m - 1, +d);
  }
  return new Date(dateStr);
}

export const getDashboardDiario = createServerFn({ method: "POST" })
  .validator(
    z.object({
      bearerToken: z.string().optional(),
      tickersManual: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }): Promise<DashboardRow[]> => {
    const preciosIOL = new Map<
      string,
      { precio: number; cierre: number | null; volumen: number | null }
    >();
    const seenTickers = new Set<string>();

    if (data.bearerToken) {
      try {
        const res = await fetch(
          "https://api.invertironline.com/api/v2/Cotizaciones/titulosPublicos/argentina/Todos",
          {
            headers: { Accept: "application/json", Authorization: `Bearer ${data.bearerToken}` },
            cache: "no-store",
          },
        );
        if (res.ok) {
          const jsonData = await res.json();
          const titulos: IOLTituloRaw[] = jsonData.titulos || [];
          for (const t of titulos) {
            const simbolo = (t.simbolo || "").toUpperCase();
            const precio = t.ultimoPrecio ?? t.precio ?? null;
            const cierre = t.cierre ?? t.cierreAnterior ?? t.precioAnterior ?? null;
            const vol = t.volumen ?? null;
            if (precio != null && precio > 0) {
              preciosIOL.set(simbolo, {
                precio,
                cierre: cierre != null && cierre > 0 ? cierre : null,
                volumen: vol,
              });
            }
          }
        }
      } catch {
        /* ignore */
      }
    }

    const tickersAPedir = new Set([
      ...ON_TICKERS,
      ...(data.tickersManual ?? []),
      ...BONDS_META.map((m) => m.ticker),
    ]);

    if (data.bearerToken) {
      for (const ticker of tickersAPedir) {
        if (preciosIOL.has(ticker)) continue;
        if (seenTickers.has(ticker)) continue;
        seenTickers.add(ticker);
        try {
          const url = `https://api.invertironline.com/api/v2/bCBA/Titulos/${ticker}/Cotizacion`;
          const resp = await fetch(url, {
            headers: { Accept: "application/json", Authorization: `Bearer ${data.bearerToken}` },
            cache: "no-store",
          });
          if (resp.ok) {
            const t = await resp.json();
            const precio = t.ultimoPrecio ?? t.precio ?? null;
            const cierre = t.cierre ?? t.cierreAnterior ?? t.precioAnterior ?? null;
            const vol = t.volumen ?? null;
            if (precio != null && precio > 0) {
              preciosIOL.set(ticker.toUpperCase(), {
                precio,
                cierre: cierre != null && cierre > 0 ? cierre : null,
                volumen: vol,
              });
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    const results: DashboardRow[] = [];

    function buildRow(
      ticker: string,
      meta: {
        emisor: string;
        vencimiento: string;
        tipoCupon: string;
        frecuencia: string;
        isin: string;
        tasaCupon: number;
        proxPago: string;
        moneda: string;
        valorResidual: number;
        freq: number;
        flujos: Array<{ fecha: Date; monto: number }>;
      },
    ): DashboardRow {
      const iolEntry = preciosIOL.get(ticker) ?? preciosIOL.get(ticker.replace(/[DC]$/, ""));
      const fuente: "iol" | "estimado" = iolEntry ? "iol" : "estimado";
      const escala = BONOS_DB[ticker]?.escalaPrecioIOL ?? 1;
      const precio = iolEntry ? iolEntry.precio / escala : meta.valorResidual;
      const precioAnterior = iolEntry && iolEntry.cierre ? iolEntry.cierre / escala : null;
      const volumen = iolEntry?.volumen ?? null;

      let variacion: number | null = null;
      if (precioAnterior != null && precioAnterior > 0) {
        variacion = ((precio - precioAnterior) / precioAnterior) * 100;
      }

      let yieldVal: number | null = null;
      let tea: number | null = null;
      let tna: number | null = null;
      let modDuration: number | null = null;
      let paridad: number | null = null;
      let currentYield: number | null = null;

      if (precio > 0 && meta.flujos.length > 0) {
        const result = calcularRendimientosON(meta.flujos, precio, meta.valorResidual, meta.freq);
        if (result.tir != null) {
          yieldVal = result.tir * 100;
          tea = result.tea;
          tna = result.tna;
          modDuration = result.durationModificada;
          paridad = result.paridad;
        }
        currentYield = meta.tasaCupon > 0 && precio > 0 ? (meta.tasaCupon / precio) * 100 : null;
      }

      const bonoDb = BONOS_DB[ticker] ?? BONOS_DB[ticker.replace(/[DC]$/, "")];
      const sector =
        bonoDb &&
        (bonoDb.tipo === "ON Hard Dollar" ||
          bonoDb.tipo === "ON CER" ||
          bonoDb.tipo === "ON Badlar" ||
          bonoDb.tipo === "ON Tasa Fija")
          ? getSector(ticker)
          : undefined;
      const modality = sector ? getPaymentModality(ticker) : undefined;

      return {
        ticker,
        emisor: meta.emisor,
        vencimiento: meta.vencimiento,
        tipoCupon: meta.tipoCupon,
        frecuencia: meta.frecuencia,
        tasaCupon: meta.tasaCupon,
        proxPago: meta.proxPago,
        precio: precio > 0 ? precio : null,
        precioAnterior,
        variacion,
        yieldVal,
        tea,
        tna,
        modDuration,
        paridad,
        currentYield,
        volumen,
        moneda: meta.moneda,
        isin: meta.isin,
        fuente,
        tipoInstrumento: sector ? "ON" : meta.emisor === "BCRA" ? "BOPREAL" : "SOBERANO",
        sector,
        modality,
      };
    }

    // ─── Process BONDS_META ────────────────────────────────────────
    for (const meta of BONDS_META) {
      const baseTicker = meta.ticker.replace(/[DC]$/, "");
      const bono = BONOS_DB[meta.ticker] ?? BONOS_DB[baseTicker];
      const freq = bono ? getFrecuenciaNumerica(bono.frecuenciaPago) : 2;
      const flows = bono
        ? bono.flujosPorCada100VN
            .filter((f) => new Date(f.fecha) > new Date())
            .map((f) => ({ fecha: new Date(f.fecha + "T00:00:00Z"), monto: f.monto }))
        : [];

      results.push(
        buildRow(meta.ticker, {
          emisor: meta.emisor,
          vencimiento: meta.vencimiento,
          tipoCupon: meta.tipoCupon,
          frecuencia: meta.frecuencia,
          isin: meta.isin,
          tasaCupon: bono?.cuponAnual ?? 0,
          proxPago: flows.length > 0 ? flows[0].fecha.toISOString().slice(0, 10) : "-",
          moneda: bono?.monedaPago ?? bono?.moneda ?? "USD",
          valorResidual: bono?.valorResidualActual ?? 100,
          freq,
          flujos: flows,
        }),
      );
    }

    // ─── Process ONs from BONOS_DB ─────────────────────────────────
    for (const ticker of ON_TICKERS) {
      const bono = BONOS_DB[ticker];
      if (!bono) continue;

      const flows = bono.flujosPorCada100VN
        .filter((f) => new Date(f.fecha) > new Date())
        .map((f) => ({ fecha: new Date(f.fecha + "T00:00:00Z"), monto: f.monto }));

      results.push(
        buildRow(ticker, {
          emisor:
            bono.descripcion?.split("-").map((s) => s.trim())[0] ||
            bono.descripcion?.slice(0, 30) ||
            ticker,
          vencimiento: bono.vencimiento,
          tipoCupon: bono.tipoCupon ?? "Fixed",
          frecuencia: bono.frecuenciaPago ?? "Semiannual",
          isin: bono.isin ?? "",
          tasaCupon: bono.cuponAnual ?? 0,
          proxPago: flows.length > 0 ? flows[0].fecha.toISOString().slice(0, 10) : "-",
          moneda: bono.monedaPago ?? bono.moneda ?? "USD",
          valorResidual: bono.valorResidualActual ?? 100,
          freq: getFrecuenciaNumerica(bono.frecuenciaPago),
          flujos: flows,
        }),
      );
    }

    // ─── Process manually added tickers ─────────────────────────────
    if (data.tickersManual) {
      for (const ticker of data.tickersManual) {
        const upper = ticker.toUpperCase();
        if (results.some((r) => r.ticker === upper)) continue;
        const bono = BONOS_DB[upper];
        if (!bono) {
          results.push({
            ticker: upper,
            emisor: "Manual",
            vencimiento: "-",
            tipoCupon: "-",
            frecuencia: "-",
            tasaCupon: 0,
            proxPago: "-",
            precio: null,
            precioAnterior: null,
            variacion: null,
            yieldVal: null,
            tea: null,
            tna: null,
            modDuration: null,
            paridad: null,
            currentYield: null,
            volumen: null,
            moneda: "USD",
            isin: "",
            fuente: "estimado",
            tipoInstrumento: "MANUAL",
          });
          continue;
        }
        const flows = bono.flujosPorCada100VN
          .filter((f) => new Date(f.fecha) > new Date())
          .map((f) => ({ fecha: new Date(f.fecha + "T00:00:00Z"), monto: f.monto }));
        results.push(
          buildRow(upper, {
            emisor: bono.descripcion?.slice(0, 30) || upper,
            vencimiento: bono.vencimiento,
            tipoCupon: bono.tipoCupon ?? "Fixed",
            frecuencia: bono.frecuenciaPago ?? "Semiannual",
            isin: bono.isin ?? "",
            tasaCupon: bono.cuponAnual ?? 0,
            proxPago: flows.length > 0 ? flows[0].fecha.toISOString().slice(0, 10) : "-",
            moneda: bono.monedaPago ?? bono.moneda ?? "USD",
            valorResidual: bono.valorResidualActual ?? 100,
            freq: getFrecuenciaNumerica(bono.frecuenciaPago),
            flujos: flows,
          }),
        );
      }
    }

    return results;
  });

// ─── Server fn: ONs que pagan cupón en fechas específicas ─────────────
// Busca en BONOS_DB + RENTA_FIJA_COMPLETA.json (534+ ONs con flujo de fondos)
// También incluye especies D (MEP) y C (CCL) sintéticas con precios en vivo IOL
export const getOnsForLadder = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fechasFaltantes: z.array(z.string()),
      minVolumen: z.number().default(0),
      minTir: z.number().default(0),
      bearerToken: z.string().optional(),
      invertirEn: z.enum(["ARS", "MEP", "CCL"]).optional().default("ARS"),
    }),
  )
  .handler(async ({ data }): Promise<DashboardRow[]> => {
    // ── 1a. Fetch live MEP/CCL prices in bulk for synthetic species ──
    const livePriceMap = new Map<string, number>();
    try {
      const livePrices = await fetchLivePricesRaw();
      for (const lp of livePrices) {
        if (lp.precioUsdMep != null) livePriceMap.set(lp.ticker + "_MEP", lp.precioUsdMep);
        if (lp.precioCcl != null) livePriceMap.set(lp.ticker + "_CCL", lp.precioCcl);
        if (lp.precioArs != null) livePriceMap.set(lp.ticker, lp.precioArs);
      }
    } catch {
      /* live prices unavailable, use fallbacks */
    }

    // ── 1. Fetch IOL prices for all known ON tickers ──────────────
    const preciosIOL = new Map<
      string,
      { precio: number; cierre: number | null; volumen: number | null }
    >();
    const allOnTickers = new Set([
      ...ON_TICKERS,
      ...COMPLETE_ONS_ALL_WITH_FLOWS.map((o) => o.ticker),
    ]);

    if (data.bearerToken) {
      for (const ticker of allOnTickers) {
        try {
          const url = `https://api.invertironline.com/api/v2/bCBA/Titulos/${ticker}/Cotizacion`;
          const resp = await fetch(url, {
            headers: { Accept: "application/json", Authorization: `Bearer ${data.bearerToken}` },
            cache: "no-store",
          });
          if (resp.ok) {
            const t = await resp.json();
            const precio = t.ultimoPrecio ?? t.precio ?? null;
            const cierre = t.cierre ?? t.cierreAnterior ?? t.precioAnterior ?? null;
            const vol = t.volumen ?? null;
            if (precio != null && precio > 0) {
              preciosIOL.set(ticker.toUpperCase(), {
                precio,
                cierre: cierre != null && cierre > 0 ? cierre : null,
                volumen: vol,
              });
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    // ── 2. Match by month (YYYY-MM) ─────────────────────────────
    const monthSet = new Set(data.fechasFaltantes.map((f) => f.slice(0, 7)));
    const candidates: Array<{ ticker: string; matchCount: number; row: DashboardRow }> = [];
    const processed = new Set<string>();

    // ── 3. Process ONs from BONOS_DB ────────────────────────────
    for (const ticker of ON_TICKERS) {
      processed.add(ticker);
      const bono = BONOS_DB[ticker];
      if (!bono || !bono.flujosPorCada100VN.length) continue;

      const iolEntry = preciosIOL.get(ticker);
      const escala = bono.escalaPrecioIOL ?? 1;
      const precio = iolEntry ? iolEntry.precio / escala : (bono.valorResidualActual ?? 100);
      const volumen = iolEntry?.volumen ?? 0;

      const flows = bono.flujosPorCada100VN
        .filter((f) => new Date(f.fecha) > new Date())
        .map((f) => ({ fecha: new Date(f.fecha + "T00:00:00Z"), monto: f.monto }));

      const freq = getFrecuenciaNumerica(bono.frecuenciaPago);
      const result = calcularRendimientosON(flows, precio, bono.valorResidualActual ?? 100, freq);
      const tirPct = result.tir != null ? result.tir * 100 : 0;

      if (tirPct < data.minTir) continue;
      if (volumen < data.minVolumen) continue;

      const matchCount = bono.flujosPorCada100VN.filter((f) =>
        monthSet.has(f.fecha.slice(0, 7)),
      ).length;

      if (matchCount > 0) {
        candidates.push({
          ticker,
          matchCount,
          row: {
            ticker,
            emisor: bono.descripcion?.slice(0, 30) || ticker,
            vencimiento: bono.vencimiento,
            tipoCupon: bono.tipoCupon ?? "Fixed",
            frecuencia: bono.frecuenciaPago ?? "Semiannual",
            tasaCupon: bono.cuponAnual ?? 0,
            proxPago: flows.length > 0 ? flows[0].fecha.toISOString().slice(0, 10) : "-",
            precio: precio > 0 ? precio : null,
            precioAnterior: iolEntry?.cierre ? iolEntry.cierre / escala : null,
            variacion: null,
            yieldVal: tirPct > 0 ? tirPct : null,
            tea: result.tea,
            tna: result.tna,
            modDuration: result.durationModificada,
            paridad: result.paridad,
            currentYield:
              bono.cuponAnual != null && bono.cuponAnual > 0 && precio > 0
                ? (bono.cuponAnual / precio) * 100
                : null,
            volumen,
            moneda: bono.monedaPago ?? bono.moneda ?? "USD",
            isin: bono.isin ?? "",
            fuente: iolEntry ? "iol" : "estimado",
            tipoInstrumento: "ON",
            sector: getSector(ticker),
            modality: getPaymentModality(ticker),
          },
        });
      }
    }

    // ── 4. Process ONs from RENTA_FIJA_COMPLETA.json + synthetic D/C species ──
    for (const on of COMPLETE_ONS_ALL_WITH_FLOWS) {
      if (processed.has(on.ticker)) continue;
      processed.add(on.ticker);
      if (on.flujos.length === 0) continue;

      const suffix = on.ticker.slice(-1).toUpperCase();
      const isD = suffix === "D";
      const isC = suffix === "C";

      // For D/C species: use live IOL USD price (MEP for D, CCL for C)
      let precio: number;
      let fuente: "iol" | "estimado";
      if (isD || isC) {
        const oTicker = on.ticker.slice(0, -1) + "O";
        const liveKey = isD ? oTicker + "_MEP" : oTicker + "_CCL";
        const livePrice = livePriceMap.get(liveKey);
        if (livePrice != null && livePrice > 0) {
          precio = livePrice;
          fuente = "iol";
        } else {
          // Fallback: try IOL direct price, then fallback to FS price * MEP proxy
          const iolEntry = preciosIOL.get(on.ticker) ?? preciosIOL.get(oTicker);
          precio = iolEntry ? iolEntry.precio : 100;
          fuente = iolEntry ? "iol" : "estimado";
        }
      } else {
        const iolEntry = preciosIOL.get(on.ticker);
        precio = iolEntry ? iolEntry.precio : on.precioArs > 0 ? on.precioArs : 100;
        fuente = iolEntry ? "iol" : "estimado";
      }

      const volumen = preciosIOL.get(on.ticker)?.volumen ?? on.volumen;
      const freq = getFrecuenciaNumerica(on.frecuencia);
      const result = calcularRendimientosON(on.flujos, precio, 100, freq);
      const tirPct = result.tir != null ? result.tir * 100 : 0;

      if (tirPct < data.minTir) continue;
      if (volumen < data.minVolumen) continue;

      const matchCount = on.rawFlujos.filter((f) => monthSet.has(f.fecha.slice(0, 7))).length;

      if (matchCount > 0) {
        candidates.push({
          ticker: on.ticker,
          matchCount,
          row: {
            ticker: on.ticker,
            emisor: on.emisor.slice(0, 30) || on.ticker,
            vencimiento: on.vencimiento,
            tipoCupon: "Fixed",
            frecuencia: on.frecuencia || "Semiannual",
            tasaCupon: on.cuponTasa,
            proxPago: on.flujos.length > 0 ? on.flujos[0].fecha.toISOString().slice(0, 10) : "-",
            precio: precio > 0 ? precio : null,
            precioAnterior: null,
            variacion: null,
            yieldVal: tirPct > 0 ? tirPct : null,
            tea: result.tea,
            tna: result.tna,
            modDuration: result.durationModificada,
            paridad: result.paridad,
            currentYield: on.cuponTasa > 0 && precio > 0 ? (on.cuponTasa / precio) * 100 : null,
            volumen,
            moneda: isD || isC ? "USD" : on.moneda || "USD",
            isin: "",
            fuente,
            tipoInstrumento: "ON",
            sector: on.sector || getSector(on.ticker),
            modality: on.modality || getPaymentModality(on.ticker),
          },
        });
      }
    }

    // ── 5. Filter by investment currency mode if specified ──────
    const filtered = candidates.filter((c) => {
      const s = c.ticker.slice(-1).toUpperCase();
      if (data.invertirEn === "MEP") return s === "D" || c.row.moneda === "USD";
      if (data.invertirEn === "CCL") return s === "C";
      return s === "O" || (!s.endsWith("D") && !s.endsWith("C"));
    });

    // ── 6. Sort: most matches first, then by volume desc, then by TIR desc ──
    filtered.sort((a, b) => {
      if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount;
      const volA = a.row.volumen ?? 0;
      const volB = b.row.volumen ?? 0;
      if (volB !== volA) return volB - volA;
      return (b.row.yieldVal ?? 0) - (a.row.yieldVal ?? 0);
    });

    return filtered.map((c) => c.row);
  });
