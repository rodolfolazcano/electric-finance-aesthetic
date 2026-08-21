// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchTokens } from "./iol-auth";
import { linregress } from "./math/stats";
import { AUTO_BENCHMARKS } from "./capm.functions";
import { classifyIOLActivo } from "./iol-asset-classifier";

async function iolFetch<T>(
  url: string,
  token: string,
  refreshToken: string | null,
): Promise<{ data: T; newToken?: string; newRefreshToken?: string }> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 401 && refreshToken) {
    // IOL no soporta grant_type=refresh_token en su endpoint /token.
    // Si el refresh falla, devolvemos un error indicando que la sesión expiró
    // sin lanzar throw, para que el caller pueda mostrar un mensaje amigable.
    try {
      const tokens = await fetchTokens({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      });
      if (!("error" in tokens)) {
        const retry = await fetch(url, {
          headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
        });
        if (retry.ok) {
          return {
            data: (await retry.json()) as T,
            newToken: tokens.accessToken,
            newRefreshToken: tokens.refreshToken,
          };
        }
      }
    } catch {
      // Ignorar error de refresh
    }
    // Refresh falló -> sesión expirada. Devolver error controlado en vez de throw.
    throw new Error(
      "Sesión IOL expirada. Iniciá sesión nuevamente desde el botón superior derecho.",
    );
  }
  if (!res.ok) throw new Error(`IOL error ${res.status}: ${await res.text().catch(() => "")}`);
  return { data: (await res.json()) as T };
}

export interface IOLCliente {
  id: number;
  nombre: string;
  apellido: string;
  totalCuentaValorizado: number;
}

export const getIOLClientes = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; refreshToken: string | null }) =>
    z.object({ token: z.string().min(1), refreshToken: z.string().nullable() }).parse(input),
  )
  .handler(async ({ data }) => {
    return iolFetch<IOLCliente[]>(
      "https://api.invertironline.com/api/v2/Asesores/Clientes",
      data.token,
      data.refreshToken,
    );
  });

export interface IOLPortfolioItem {
  simbolo: string;
  cantidad: number;
  ultimoPrecio: number;
  variacionDiaria: number;
  valorizado: number;
  ppc: number;
  gananciaPorcentual: number;
  gananciaNumeraria: number;
}

export const getIOLPortafolio = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { token: string; refreshToken: string | null; clienteId?: number; pais?: string }) =>
      z
        .object({
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
          clienteId: z.number().optional(),
          pais: z.string().default("argentina"),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const basePath = data.clienteId ? `Asesores/Portafolio/${data.clienteId}` : `portafolio`;
    const url = `https://api.invertironline.com/api/v2/${basePath}/${data.pais}`;
    return iolFetch<IOLPortfolioItem[]>(url, data.token, data.refreshToken);
  });

// ─── IOL Portfolio real API shape ────────────────────────────────────

export interface IOLTitulo {
  simbolo: string;
  descripcion: string;
  pais: string;
  mercado: string;
  tipo: string;
  plazo: string;
  moneda: string;
}

export interface IOLActivo {
  cantidad: number;
  comprometido: number;
  puntosVariacion: number;
  variacionDiaria: number;
  ultimoPrecio: number;
  ppc: number;
  gananciaPorcentaje: number;
  gananciaDinero: number;
  valorizado: number;
  titulo: IOLTitulo;
  parking?: { disponibleInmediato: number };
}

export interface IOLPortfolioRaw {
  pais: string;
  activos: IOLActivo[];
}

// ─── IOL CAPM Result types ───────────────────────────────────────────

export interface IOLCapmAssetRow {
  simbolo: string;
  descripcion: string;
  mercado: string;
  tipo: string;
  moneda: string;
  monedaSubyacente: string;
  simboloSubyacente: string;
  cantidad: number;
  ultimoPrecio: number;
  valorizado: number;
  peso: number;
  alpha: number;
  annualizedAlpha: number;
  beta: number;
  rSquared: number;
  correlation: number;
  pValue: number;
  stdErr: number;
  observations: number;
}

export interface IOLCapmPortfolioRow {
  alpha: number;
  annualizedAlpha: number;
  beta: number;
  rSquared: number;
  correlation: number;
  pValue: number;
  stdErr: number;
  observations: number;
  assets: number;
  benchmark: string;
}

export interface IOLCapmResumenGlobal {
  totalValorizado: number;
  totalARS: number;
  totalUSD: number;
  cantActivos: number;
  porRegion: Array<{ region: string; valorizado: number; pct: number }>;
  porMoneda: Array<{ moneda: string; valorizado: number; pct: number }>;
}

export interface IOLCapmResult {
  portfolio: IOLCapmPortfolioRow;
  assets: IOLCapmAssetRow[];
  totalValorizado: number;
  resumenGlobal?: IOLCapmResumenGlobal;
  warning?: string;
}

// ─── IOL CAPM Analysis ───────────────────────────────────────────────

export const getIOLCapm = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      token: string;
      refreshToken: string | null;
      benchmark: string;
      autoDetect?: boolean;
      pais?: string;
      clienteId?: number;
    }) =>
      z
        .object({
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
          benchmark: z.string().min(1),
          autoDetect: z.boolean().optional().default(false),
          pais: z.string().default("argentina"),
          clienteId: z.number().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    let latestToken = data.token;
    let latestRefresh = data.refreshToken;

    async function trackedFetch<T>(url: string): Promise<T> {
      const res = await iolFetch<T>(url, latestToken, latestRefresh);
      if (res.newToken) {
        latestToken = res.newToken;
        latestRefresh = res.newRefreshToken ?? "";
      }
      return res.data;
    }

    // 1. Fetch portfolio
    const basePath = data.clienteId ? `Asesores/Portafolio/${data.clienteId}` : `portafolio`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any = await trackedFetch<any>(
      `https://api.invertironline.com/api/v2/${basePath}/${data.pais}`,
    );
    const normalizeActivo = (a: any): IOLActivo | null => {
      if (a.cantidad <= 0) return null;
      if (a.titulo) return a as IOLActivo;
      // Old flat format → wrap into activo shape
      if (a.simbolo) {
        return {
          cantidad: a.cantidad ?? 0,
          comprometido: 0,
          puntosVariacion: 0,
          variacionDiaria: a.variacionDiaria ?? 0,
          ultimoPrecio: a.ultimoPrecio ?? 0,
          ppc: a.ppc ?? 0,
          gananciaPorcentaje: a.gananciaPorcentual ?? 0,
          gananciaDinero: a.gananciaNumeraria ?? 0,
          valorizado: a.valorizado ?? 0,
          titulo: {
            simbolo: a.simbolo,
            descripcion: a.descripcion ?? "",
            pais: "",
            mercado: a.mercado ?? "",
            tipo: a.tipo ?? "",
            plazo: "t0",
            moneda: a.moneda ?? "",
          },
        };
      }
      return null;
    };
    const activos: IOLActivo[] = (Array.isArray(raw) ? raw : (raw.activos ?? []))
      .map(normalizeActivo)
      .filter((a: IOLActivo | null): a is IOLActivo => a !== null);
    if (activos.length === 0) {
      return {
        portfolio: {
          alpha: 0,
          annualizedAlpha: 0,
          beta: 0,
          rSquared: 0,
          correlation: 0,
          pValue: 0,
          stdErr: 0,
          observations: 0,
          assets: 0,
          benchmark: data.benchmark,
        },
        assets: [],
        totalValorizado: 0,
        warning: "No hay activos con cantidad > 0 en el portafolio.",
      };
    }

    const totalValorizado = activos.reduce((s, a) => s + a.valorizado, 0);

    // Detecta el mercado (NYSE/NASDAQ) para un ticker de US
    function detectarMercadoUS(simbolo: string): string {
      // Lista de CEDEARs conocidos que cotizan en NASDAQ (vs NYSE)
      const nasdaqTickers = new Set([
        "AAPL",
        "AMZN",
        "GOOGL",
        "GOOG",
        "META",
        "MSFT",
        "NVDA",
        "TSLA",
        "NFLX",
        "AMD",
        "INTC",
        "MU",
        "CSCO",
        "ADBE",
        "CRM",
        "PYPL",
        "GILD",
        "AMGN",
        "ISRG",
        "BKNG",
        "CHTR",
        "TMUS",
        "MDLZ",
        "REGN",
        "CMCSA",
        "COST",
        "PEP",
        "QCOM",
        "TXN",
        "AVGO",
        "INTU",
        "AMAT",
        "ADI",
        "SBUX",
        "ROST",
        "MAR",
        "MELI",
        "JD",
        "BABA",
        "PDD",
        "GLOB",
        "NU",
        "MRNA",
        "BNTX",
        "ILMN",
        "VRTX",
        "CTSH",
        "LRCX",
        "KLAC",
        "ASML",
        "SNPS",
        "CDNS",
        "PANW",
        "CRWD",
        "DDOG",
        "ZM",
        "SPLK",
        "WDAY",
        "ADSK",
        "DOCU",
        "OKTA",
        "NET",
        "SQ",
        "SHOP",
        "RBLX",
        "PINS",
        "SNAP",
        "UBER",
        "LYFT",
        "DASH",
        "ABNB",
        "TWLO",
      ]);
      if (nasdaqTickers.has(simbolo.toUpperCase())) return "NASDAQ";
      return "NYSE";
    }

    // Resolve underlying ticker/currency for CAPM analysis
    function resolveSubyacente(a: IOLActivo): { simbolo: string; mercado: string; moneda: string } {
      const classified = classifyIOLActivo(a);
      const { iolCurrency, canUseYahoo, yahooPriceSymbol, category, iolSymbol, iolMarket } =
        classified;
      if (canUseYahoo && yahooPriceSymbol) {
        const isADR = category === "ACCION_BCBA_USD";
        const mercadoUS = isADR ? detectarMercadoUS(yahooPriceSymbol) : iolMarket;
        return { simbolo: yahooPriceSymbol, mercado: mercadoUS, moneda: iolCurrency };
      }
      return { simbolo: iolSymbol, mercado: iolMarket, moneda: iolCurrency };
    }

    // 2. Fetch historical prices (IOL for BCBA/ROFEX, Yahoo for NYSE/NASDAQ)
    const yf = await getYF();
    const BENCH_DAYS = 365 * 2;

    async function fetchHistory(
      ticker: string,
      mercado: string,
      tipo: string,
    ): Promise<{ date: string; close: number }[]> {
      const mercadoUp = mercado.toUpperCase();
      const tipoUp = tipo.toUpperCase();
      const isUsMarket = mercadoUp === "NYSE" || mercadoUp === "NASDAQ";
      const useYahoo = isUsMarket;
      if (useYahoo) {
        try {
          const period2 = new Date();
          const period1 = new Date(Date.now() - BENCH_DAYS * 24 * 60 * 60 * 1000);
          const rows = await yf.chart(ticker, { period1, period2, interval: "1d" });
          const quotes: Array<{ date?: Date | null; close?: number | null }> = rows?.quotes ?? [];
          return quotes
            .filter((q) => q.date != null && q.close != null)
            .map((q) => ({
              date: (q.date as Date).toISOString().slice(0, 10),
              close: q.close as number,
            }));
        } catch {
          return [];
        }
      }
      // BCBA / ROFEX (local acciones, bonos, etc.) → IOL historical series
      try {
        const hoy = new Date();
        const desde = new Date(Date.now() - BENCH_DAYS * 24 * 60 * 60 * 1000);
        const fd = desde.toISOString().split("T")[0];
        const fh = hoy.toISOString().split("T")[0];
        const url = `https://api.invertironline.com/api/v2/${mercadoUp}/Titulos/${ticker}/Cotizacion/seriehistorica/${fd}/${fh}/SinAjustar`;
        const data = await trackedFetch<Array<{ fecha: string; cierre: number }>>(url);
        return data
          .filter((r) => r.fecha && r.cierre > 0)
          .map((r) => ({ date: r.fecha, close: r.cierre }));
      } catch {
        return [];
      }
    }

    // Fetch benchmark from Yahoo (with auto-detect if enabled)
    let currentBenchmark = data.benchmark;
    let benchRows = await fetchHistory(currentBenchmark, "NYSE", "");
    if (data.autoDetect) {
      // Score all AUTO_BENCHMARKS by data availability and average R²
      const benchCandidates: { ticker: string; rows: { date: string; close: number }[] }[] = [];
      for (const bm of AUTO_BENCHMARKS) {
        const rows = await fetchHistory(bm, "NYSE", "");
        if (rows.length >= 30) benchCandidates.push({ ticker: bm, rows });
      }
      if (benchCandidates.length > 0) {
        let bestBm = currentBenchmark;
        let bestRows = benchRows;
        let bestScore = -1;
        for (const cand of benchCandidates) {
          const bmMap = new Map<string, number>();
          for (const r of cand.rows) bmMap.set(r.date, r.close);
          let r2Sum = 0,
            count = 0;
          for (const a of activos) {
            const sub = resolveSubyacente(a);
            const subRows = await fetchHistory(sub.simbolo, sub.mercado, a.titulo.tipo);
            if (subRows.length < 30) continue;
            const dates = subRows.map((r) => r.date).filter((d) => bmMap.has(d));
            if (dates.length < 30) continue;
            const assetRets: number[] = [];
            const bmRets: number[] = [];
            for (let i = 1; i < dates.length; i++) {
              const c0 = subRows.find((r) => r.date === dates[i - 1])?.close;
              const c1 = subRows.find((r) => r.date === dates[i])?.close;
              const bc0 = bmMap.get(dates[i - 1]);
              const bc1 = bmMap.get(dates[i]);
              if (c0 && c1 && bc0 && bc1) {
                assetRets.push(Math.log(c1 / c0));
                bmRets.push(Math.log(bc1 / bc0));
              }
            }
            if (assetRets.length < 30) continue;
            const lr = linregress(bmRets, assetRets);
            r2Sum += lr.r2;
            count++;
          }
          const avgR2 = count > 0 ? r2Sum / count : 0;
          if (avgR2 > bestScore) {
            bestScore = avgR2;
            bestBm = cand.ticker;
            bestRows = cand.rows;
          }
        }
        currentBenchmark = bestBm;
        benchRows = bestRows;
      }
    }
    if (benchRows.length < 30) {
      return {
        portfolio: {
          alpha: 0,
          annualizedAlpha: 0,
          beta: 0,
          rSquared: 0,
          correlation: 0,
          pValue: 0,
          stdErr: 0,
          observations: 0,
          assets: activos.length,
          benchmark: data.benchmark,
        },
        assets: [],
        totalValorizado,
        warning: `No se pudo obtener datos del benchmark ${data.benchmark}.`,
      };
    }

    const benchMap = new Map<string, number>();
    for (const r of benchRows) benchMap.set(r.date, r.close);

    // Fetch all assets in parallel
    const assetRows = await Promise.all(
      activos.map(async (a) => {
        const sub = resolveSubyacente(a);
        const rows = await fetchHistory(sub.simbolo, sub.mercado, a.titulo.tipo);
        return { activo: a, history: rows, sub };
      }),
    );

    // 3. Build aligned returns for each asset + weighted portfolio
    const assetResults: IOLCapmAssetRow[] = [];
    const commonDateSets: string[][] = [];

    for (const { activo, history, sub } of assetRows) {
      const mkRow = (obs: number) => ({
        simbolo: activo.titulo.simbolo,
        descripcion: activo.titulo.descripcion,
        mercado: activo.titulo.mercado,
        tipo: activo.titulo.tipo,
        moneda: activo.titulo.moneda,
        monedaSubyacente: sub.moneda,
        simboloSubyacente: sub.simbolo,
        cantidad: activo.cantidad,
        ultimoPrecio: activo.ultimoPrecio,
        valorizado: activo.valorizado,
        peso: totalValorizado > 0 ? activo.valorizado / totalValorizado : 0,
        alpha: 0,
        annualizedAlpha: 0,
        beta: 0,
        rSquared: 0,
        correlation: 0,
        pValue: 0,
        stdErr: 0,
        observations: obs,
      });

      if (history.length < 30) {
        assetResults.push(mkRow(0));
        commonDateSets.push([]);
        continue;
      }

      const tickerMap = new Map<string, number>();
      for (const r of history) tickerMap.set(r.date, r.close);

      // Find common dates with benchmark
      const commonDates: string[] = [];
      for (const d of benchMap.keys()) {
        if (tickerMap.has(d)) commonDates.push(d);
      }
      commonDates.sort();
      commonDateSets.push(commonDates);

      if (commonDates.length < 30) {
        assetResults.push(mkRow(0));
        continue;
      }

      // Build simple returns
      const x: number[] = [];
      const y: number[] = [];
      let prevB = benchMap.get(commonDates[0])!;
      let prevT = tickerMap.get(commonDates[0])!;
      for (let i = 1; i < commonDates.length; i++) {
        const bClose = benchMap.get(commonDates[i])!;
        const tClose = tickerMap.get(commonDates[i])!;
        x.push((bClose - prevB) / prevB);
        y.push((tClose - prevT) / prevT);
        prevB = bClose;
        prevT = tClose;
      }

      const lr = linregress(x, y);
      const correlation = Math.sqrt(lr.r2) * (lr.slope >= 0 ? 1 : -1);
      assetResults.push({
        simbolo: activo.titulo.simbolo,
        descripcion: activo.titulo.descripcion,
        mercado: activo.titulo.mercado,
        tipo: activo.titulo.tipo,
        moneda: activo.titulo.moneda,
        monedaSubyacente: sub.moneda,
        simboloSubyacente: sub.simbolo,
        cantidad: activo.cantidad,
        ultimoPrecio: activo.ultimoPrecio,
        valorizado: activo.valorizado,
        peso: totalValorizado > 0 ? activo.valorizado / totalValorizado : 0,
        alpha: Math.round(lr.intercept * 10000) / 10000,
        annualizedAlpha: Math.round(lr.intercept * 252 * 10000) / 10000,
        beta: Math.round(lr.slope * 10000) / 10000,
        rSquared: Math.round(lr.r2 * 10000) / 10000,
        correlation: Math.round(correlation * 10000) / 10000,
        pValue: Math.round(lr.pValue * 10000) / 10000,
        stdErr: Math.round(lr.stdErr * 10000) / 10000,
        observations: x.length,
      });
    }

    // 4. Weighted portfolio CAPM
    // Find dates common to ALL assets that have data AND benchmark
    let globalCommon: Set<string> | null = null;
    for (let i = 0; i < assetRows.length; i++) {
      const { history } = assetRows[i];
      if (history.length < 30) continue;
      const tickerMap = new Map<string, number>();
      for (const r of history) tickerMap.set(r.date, r.close);
      const common: string[] = [];
      for (const d of benchMap.keys()) {
        if (tickerMap.has(d)) common.push(d);
      }
      const s = new Set(common);
      if (globalCommon === null) {
        globalCommon = s;
      } else {
        const gc: Set<string> = globalCommon;
        globalCommon = new Set(Array.from(gc).filter((d) => s.has(d)));
      }
    }

    if (!globalCommon || globalCommon.size < 2) {
      return {
        portfolio: {
          alpha: 0,
          annualizedAlpha: 0,
          beta: 0,
          rSquared: 0,
          correlation: 0,
          pValue: 0,
          stdErr: 0,
          observations: 0,
          assets: activos.length,
          benchmark: data.benchmark,
        },
        assets: assetResults,
        totalValorizado,
        warning: "No hay suficientes fechas comunes entre todos los activos y el benchmark.",
      };
    }

    const alignedDates = [...globalCommon].sort();

    // Compute weighted portfolio close for each date
    const portPrices: number[] = [];
    const benchPrices: number[] = [];
    for (const d of alignedDates) {
      let weightedSum = 0;
      let hasAll = true;
      for (let i = 0; i < assetRows.length; i++) {
        const { history } = assetRows[i];
        const price = history.find((r) => r.date === d)?.close;
        if (price == null) {
          hasAll = false;
          break;
        }
        weightedSum += price * assetResults[i].peso;
      }
      if (!hasAll) continue;
      portPrices.push(weightedSum);
      benchPrices.push(benchMap.get(d)!);
    }

    if (portPrices.length < 30) {
      return {
        portfolio: {
          alpha: 0,
          annualizedAlpha: 0,
          beta: 0,
          rSquared: 0,
          correlation: 0,
          pValue: 0,
          stdErr: 0,
          observations: 0,
          assets: activos.length,
          benchmark: data.benchmark,
        },
        assets: assetResults,
        totalValorizado,
        warning: "Menos de 30 observaciones para el portafolio ponderado.",
      };
    }

    const ppx: number[] = [];
    const ppy: number[] = [];
    for (let i = 1; i < portPrices.length; i++) {
      ppx.push((benchPrices[i] - benchPrices[i - 1]) / benchPrices[i - 1]);
      ppy.push((portPrices[i] - portPrices[i - 1]) / portPrices[i - 1]);
    }

    const plr = linregress(ppx, ppy);
    const pCorr = Math.sqrt(plr.r2) * (plr.slope >= 0 ? 1 : -1);

    const portfolioRow: IOLCapmPortfolioRow = {
      alpha: Math.round(plr.intercept * 10000) / 10000,
      annualizedAlpha: Math.round(plr.intercept * 252 * 10000) / 10000,
      beta: Math.round(plr.slope * 10000) / 10000,
      rSquared: Math.round(plr.r2 * 10000) / 10000,
      correlation: Math.round(pCorr * 10000) / 10000,
      pValue: Math.round(plr.pValue * 10000) / 10000,
      stdErr: Math.round(plr.stdErr * 10000) / 10000,
      observations: ppx.length,
      assets: activos.length,
      benchmark: data.benchmark,
    };

    // 5. Resumen global del portafolio
    const resumenGlobal: IOLCapmResumenGlobal = (() => {
      const totalARS = assetResults
        .filter((a) => a.monedaSubyacente === "ARS")
        .reduce((s, a) => s + a.valorizado, 0);
      const totalUSD = totalValorizado - totalARS;
      const activosARG = assetResults.filter((a) => a.mercado === "BCBA" || a.mercado === "ROFEX");
      const activosUS = assetResults.filter((a) => a.mercado === "NYSE" || a.mercado === "NASDAQ");
      const valARG = activosARG.reduce((s, a) => s + a.valorizado, 0);
      const valUS = activosUS.reduce((s, a) => s + a.valorizado, 0);
      return {
        totalValorizado,
        totalARS,
        totalUSD,
        cantActivos: assetResults.length,
        porRegion: [
          {
            region: "Argentina",
            valorizado: valARG,
            pct: totalValorizado > 0 ? valARG / totalValorizado : 0,
          },
          {
            region: "EEUU",
            valorizado: valUS,
            pct: totalValorizado > 0 ? valUS / totalValorizado : 0,
          },
        ],
        porMoneda: [
          {
            moneda: "ARS",
            valorizado: totalARS,
            pct: totalValorizado > 0 ? totalARS / totalValorizado : 0,
          },
          {
            moneda: "USD",
            valorizado: totalUSD,
            pct: totalValorizado > 0 ? totalUSD / totalValorizado : 0,
          },
        ],
      };
    })();

    return {
      portfolio: portfolioRow,
      assets: assetResults,
      totalValorizado,
      resumenGlobal,
      newToken: latestToken !== data.token ? latestToken : undefined,
      newRefreshToken: latestRefresh !== data.refreshToken ? latestRefresh : undefined,
    };
  });

// ─── Yahoo Finance helper (same pattern as capm.functions) ────────────

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

export interface EstadoCuenta {
  disponibleOperar: number;
  disponibleComprar: number;
  totalCuentaValorizado: number;
  margenDescubierto: number;
  margenGarantia: number;
  saldoCuentaCorriente: number;
  gananciaDelDia: number;
}

export const getIOLEstadoCuenta = createServerFn({ method: "POST" })
  .inputValidator((input: { token: string; refreshToken: string | null; clienteId?: number }) =>
    z
      .object({
        token: z.string().min(1),
        refreshToken: z.string().nullable(),
        clienteId: z.number().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const basePath = data.clienteId ? `Asesores/EstadoDeCuenta/${data.clienteId}` : `estadocuenta`;
    const url = `https://api.invertironline.com/api/v2/${basePath}`;
    return iolFetch<EstadoCuenta>(url, data.token, data.refreshToken);
  });

// ─── Operaciones (Asesor) ─────────────────────────────────────────────────

export interface IOLOperacion {
  numero: number;
  simbolo: string;
  cantidad: number;
  precio: number;
  monto: number;
  fecha: string;
  estado: string;
  pais: string;
  mercado: string;
  tipo: string;
}

export const getIOLOperaciones = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      token: string;
      refreshToken: string | null;
      clienteId: number;
      estado?: string;
      pais?: string;
      fechaDesde?: string;
      fechaHasta?: string;
      numero?: number;
    }) =>
      z
        .object({
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
          clienteId: z.number(),
          estado: z.string().optional(),
          pais: z.string().optional(),
          fechaDesde: z.string().optional(),
          fechaHasta: z.string().optional(),
          numero: z.number().optional(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    let url = `https://api.invertironline.com/api/v2/Asesores/Operaciones?IdClienteAsesorado=${data.clienteId}`;
    if (data.estado) url += `&Estado=${data.estado}`;
    if (data.pais) url += `&Pais=${data.pais}`;
    if (data.fechaDesde) url += `&FechaDesde=${data.fechaDesde}`;
    if (data.fechaHasta) url += `&FechaHasta=${data.fechaHasta}`;
    if (data.numero) url += `&Numero=${data.numero}`;
    return iolFetch<IOLOperacion[]>(url, data.token, data.refreshToken);
  });

export const getIOLOperacionDetalle = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { token: string; refreshToken: string | null; clienteId: number; numero: number }) =>
      z
        .object({
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
          clienteId: z.number(),
          numero: z.number(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const url = `https://api.invertironline.com/api/v2/Asesores/Operaciones/Detalle/${data.clienteId}/${data.numero}`;
    return iolFetch<any>(url, data.token, data.refreshToken);
  });

export const getIOLBoletoOperacion = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { token: string; refreshToken: string | null; clienteId: number; numero: number }) =>
      z
        .object({
          token: z.string().min(1),
          refreshToken: z.string().nullable(),
          clienteId: z.number(),
          numero: z.number(),
        })
        .parse(input),
  )
  .handler(async ({ data }) => {
    const url = `https://api.invertironline.com/api/v2/Asesores/Operaciones/Boleto/${data.clienteId}/${data.numero}`;
    return iolFetch<any>(url, data.token, data.refreshToken);
  });
