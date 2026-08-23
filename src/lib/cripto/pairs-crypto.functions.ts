// @ts-nocheck
/**
 * Pairs Trading / Arbitraje Estadístico CRYPTO (Binance Futures).
 * Port de trading_bots/pairs_trading/engine.py (+scanner.py, optimizer.py,
 * scan_cointegration.py): motor único con dos métodos de hedge ratio
 * ("rolling_ratio_mean" | "cointegration_static") y dos salidas
 * ("zscore_band" | "mean_cross_with_stop").
 * La cointegración usa Engle-Granger proxy: OLS beta + ADF sobre residuos
 * (computeADF de statarb.math.ts con valores críticos MacKinnon).
 */
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { computeADF } from "@/lib/statarb.math"
import { linregress } from "@/lib/math/stats"

const FAPI = "https://fapi.binance.com"

async function fetchKlines(symbol: string, interval: string, days: number) {
  const msPerDay = 86400000
  const end = Date.now()
  let cur = end - days * msPerDay
  const all: [number, number, number][] = [] // [openTime, close, volume]
  while (cur < end && all.length < 20000) {
    const url = `${FAPI}/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${cur}&limit=1500`
    const res = await fetch(url)
    if (!res.ok) return all
    const data: any[] = await res.json()
    if (!data.length) break
    for (const k of data) all.push([k[0], parseFloat(k[4]), parseFloat(k[5])])
    cur = data[data.length - 1][0] + 1
    if (data.length < 1500) break
    await new Promise((r) => setTimeout(r, 90))
  }
  return all
}

/** Alinea dos series por openTime común. */
function alinear(a: [number, number, number][], b: [number, number, number][]) {
  const mapB = new Map(b.map((x) => [x[0], x[1]]))
  const t1: number[] = [], c1: number[] = [], c2: number[] = []
  for (const [t, c] of a) {
    const cb = mapB.get(t)
    if (cb != null && cb > 0 && c > 0) { t1.push(t); c1.push(c); c2.push(cb) }
  }
  return { times: t1, closes1: c1, closes2: c2 }
}

function mediaMovil(v: number[], w: number): (number | null)[] {
  const out: (number | null)[] = Array(v.length).fill(null)
  let acc = 0
  for (let i = 0; i < v.length; i++) {
    acc += v[i]
    if (i >= w) acc -= v[i - w]
    if (i >= w - 1) out[i] = acc / w
  }
  return out
}

function rollingStats(v: number[], w: number) {
  const mean: (number | null)[] = Array(v.length).fill(null)
  const std: (number | null)[] = Array(v.length).fill(null)
  for (let i = w - 1; i < v.length; i++) {
    let s = 0
    for (let j = i - w + 1; j <= i; j++) s += v[j]
    const m = s / w
    let ss = 0
    for (let j = i - w + 1; j <= i; j++) ss += (v[j] - m) ** 2
    mean[i] = m
    std[i] = Math.sqrt(ss / Math.max(1, w - 1)) || 1e-9
  }
  return { mean, std }
}

export interface PairTrade {
  side: "LONG" | "SHORT"
  entryIdx: number; exitIdx: number
  zEntry: number; zExit: number
  exitReason: string
  pnlPct: number // fracción neta
}

export function backtestPairCrypto(
  closes1: number[],
  closes2: number[],
  opts: {
    entryZscore?: number; exitZscore?: number; spreadWindow?: number; zscoreWindow?: number
    commission?: number; hedgeRatioMethod?: "rolling_ratio_mean" | "cointegration_static"
    exitMethod?: "zscore_band" | "mean_cross_with_stop"; stopZscore?: number; timeoutBars?: number
  } = {},
): { trades: PairTrade[]; adfStat: number | null; pValue: number | null; beta: number | null } {
  const entryZ = opts.entryZscore ?? 2.0
  const exitZ = opts.exitZscore ?? 0.5
  const sw = opts.spreadWindow ?? 20
  const zw = opts.zscoreWindow ?? 20
  const commission = opts.commission ?? 0.0004
  const method = opts.hedgeRatioMethod ?? "rolling_ratio_mean"
  const exitMethod = opts.exitMethod ?? "zscore_band"
  const stopZ = opts.stopZscore ?? 3.0
  const timeout = opts.timeoutBars ?? 20

  const n = closes1.length
  let beta: number | null = null
  let adfStat: number | null = null
  let pValue: number | null = null
  let spread: number[]

  if (method === "cointegration_static") {
    const reg = linregress(closes2, closes1)
    beta = reg.slope
    const resid = closes1.map((v, i) => v - beta! * closes2[i])
    const eg = computeADF(resid)
    adfStat = eg.stat
    pValue = eg.pValue
    spread = resid
  } else {
    const ratio = closes1.map((v, i) => (closes2[i] !== 0 ? v / closes2[i] : NaN))
    const hr = mediaMovil(ratio.map((r) => (isFinite(r) ? r : 0)), sw)
    spread = closes1.map((v, i) => (hr[i] != null ? v - closes2[i] * (hr[i] as number) : NaN))
  }

  const zs = rollingStats(spread.map((s) => (isFinite(s) ? s : 0)), zw)
  const trades: PairTrade[] = []
  const startIdx = method === "cointegration_static" ? zw * 2 : Math.max(sw, zw * 2)
  let inPos = false
  let side: "LONG" | "SHORT" | null = null
  let entryP1 = 0, entryP2 = 0
  let entryIdx = 0
  let zEntry = 0
  let lastExit = -1e9

  for (let i = startIdx; i < n; i++) {
    const z = zs.mean[i] != null ? ((spread[i] - (zs.mean[i] as number)) / (zs.std[i] as number)) : NaN
    if (!isFinite(z)) continue
    if (!inPos) {
      if (i - lastExit < 0) continue
      if (z > entryZ) { inPos = true; side = "SHORT"; entryP1 = closes1[i]; entryP2 = closes2[i]; entryIdx = i; zEntry = z }
      else if (z < -entryZ) { inPos = true; side = "LONG"; entryP1 = closes1[i]; entryP2 = closes2[i]; entryIdx = i; zEntry = z }
      continue
    }
    // salida
    let exitNow = false
    let reason = ""
    if (exitMethod === "zscore_band") {
      if (Math.abs(z) < exitZ) { exitNow = true; reason = "ZSCORE_BAND" }
    } else {
      if (side === "LONG" && z >= 0) { exitNow = true; reason = "MEAN_REVERSION" }
      else if (side === "SHORT" && z <= 0) { exitNow = true; reason = "MEAN_REVERSION" }
      else if (Math.abs(z) >= stopZ) { exitNow = true; reason = "STOP_LOSS" }
      else if (i - entryIdx >= timeout) { exitNow = true; reason = "TIMEOUT" }
    }
    if (!exitNow) continue
    const p1 = closes1[i], p2 = closes2[i]
    const r1 = side === "LONG" ? p1 / entryP1 - 1 : entryP1 / p1 - 1
    const r2 = side === "LONG" ? entryP2 / p2 - 1 : p2 / entryP2 - 1
    const pnlPct = (r1 + r2) / 2 - commission
    trades.push({ side: side!, entryIdx, exitIdx: i, zEntry, zExit: z, exitReason: reason, pnlPct })
    inPos = false; side = null
    lastExit = i
  }
  return { trades, adfStat, pValue, beta }
}

function metricsPair(trades: PairTrade[], capital: number) {
  if (!trades.length) return { trades: 0, winRate: 0, profitFactor: 0, expectancyPct: 0, totalPnlUsd: 0, maxDrawdownUsd: 0 }
  const pnls = trades.map((t) => t.pnlPct)
  const wins = pnls.filter((p) => p > 0)
  const losses = pnls.filter((p) => p <= 0)
  let cum = 0, peak = 0, maxDd = 0
  for (const p of pnls) {
    cum += p * capital
    if (cum > peak) peak = cum
    if (peak - cum > maxDd) maxDd = peak - cum
  }
  return {
    trades: pnls.length,
    winRate: (wins.length / pnls.length) * 100,
    profitFactor: losses.length ? wins.reduce((a, b) => a + b, 0) / Math.abs(losses.reduce((a, b) => a + b, 0)) : 999,
    expectancyPct: (pnls.reduce((a, b) => a + b, 0) / pnls.length) * 100,
    totalPnlUsd: cum,
    maxDrawdownUsd: maxDd,
  }
}

// ---------------------------------------------------------------------------
// ESCÁNER de cointegración sobre top perps USDT por volumen
// ---------------------------------------------------------------------------

async function topSymbols(limit: number): Promise<string[]> {
  try {
    const [infoR, tickR] = await Promise.all([
      fetch(`${FAPI}/fapi/v1/exchangeInfo`),
      fetch(`${FAPI}/fapi/v1/ticker/24hr`),
    ])
    if (!infoR.ok || !tickR.ok) return ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
    const info = await infoR.json()
    const ticks = await tickR.json()
    const valid = new Set(
      (info.symbols ?? []).filter((s: any) => s.quoteAsset === "USDT" && s.status === "TRADING" && s.contractType === "PERPETUAL").map((s: any) => s.symbol),
    )
    return (ticks as any[])
      .filter((t) => valid.has(t.symbol))
      .sort((a, b) => (b.quoteVolume ?? 0) - (a.quoteVolume ?? 0))
      .slice(0, limit)
      .map((t) => t.symbol)
  } catch {
    return ["BTCUSDT", "ETHUSDT", "BNBUSDT"]
  }
}

export const scanPairsCrypto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    topN: z.number().default(15),
    interval: z.string().default("1h"),
    days: z.number().default(30),
  }).parse(d))
  .handler(async ({ data }) => {
    const symbols = await topSymbols(data.topN)
    const series = new Map<string, Map<number, number>>()
    for (const sym of symbols) {
      const kl = await fetchKlines(sym, data.interval, data.days)
      if (kl.length >= 300) series.set(sym, new Map(kl.map(([t, c]) => [t, c])))
      await new Promise((r) => setTimeout(r, 60))
    }
    const syms = [...series.keys()]
    const resultados: Array<{ a: string; b: string; corr: number; pValue: number; adfStat: number; beta: number }> = []
    for (let i = 0; i < syms.length; i++) {
      for (let j = i + 1; j < syms.length; j++) {
        const A = series.get(syms[i])!
        const B = series.get(syms[j])!
        const t1: number[] = [], c1: number[] = [], c2: number[] = []
        for (const [t, c] of A) {
          const cb = B.get(t)
          if (cb != null) { t1.push(t); c1.push(c); c2.push(cb) }
        }
        if (t1.length < 300) continue
        const reg = linregress(c2, c1)
        const resid = c1.map((v, k) => v - reg.slope * c2[k])
        const eg = computeADF(resid)
        // correlación de retornos log
        let r1m = 0, r2m = 0
        const rl1: number[] = [], rl2: number[] = []
        for (let k = 1; k < c1.length; k++) { rl1.push(Math.log(c1[k] / c1[k - 1])); rl2.push(Math.log(c2[k] / c2[k - 1])) }
        r1m = rl1.reduce((a, b) => a + b, 0) / rl1.length
        r2m = rl2.reduce((a, b) => a + b, 0) / rl2.length
        let cov = 0, v1 = 0, v2 = 0
        for (let k = 0; k < rl1.length; k++) { cov += (rl1[k] - r1m) * (rl2[k] - r2m); v1 += (rl1[k] - r1m) ** 2; v2 += (rl2[k] - r2m) ** 2 }
        const corr = v1 > 0 && v2 > 0 ? cov / Math.sqrt(v1 * v2) : 0
        resultados.push({ a: syms[i], b: syms[j], corr, pValue: eg.pValue, adfStat: eg.stat, beta: reg.slope })
      }
    }
    resultados.sort((x, y) => x.pValue - y.pValue)
    return { scanned: syms.length, pairs: syms.length * (syms.length - 1) / 2, top: resultados.slice(0, 12), interval: data.interval, days: data.days }
  })

// ---------------------------------------------------------------------------
// ANÁLISIS de un par + OPTIMIZADOR grid IS/OOS
// ---------------------------------------------------------------------------

const PAIRS_SCHEMA = z.object({
  simboloA: z.string(),
  simboloB: z.string(),
  interval: z.string().default("1h"),
  days: z.number().default(60),
  entryZscore: z.number().default(2.0),
  exitZscore: z.number().default(0.5),
  hedgeRatioMethod: z.enum(["rolling_ratio_mean", "cointegration_static"]).default("rolling_ratio_mean"),
  exitMethod: z.enum(["zscore_band", "mean_cross_with_stop"]).default("zscore_band"),
})

function textoPar(input: z.infer<typeof PAIRS_SCHEMA>) {
  return async () => {
    const [ka, kb] = await Promise.all([
      fetchKlines(input.simboloA, input.interval, input.days),
      fetchKlines(input.simboloB, input.interval, input.days),
    ])
    const al = alinear(ka, kb)
    if (al.times.length < 300) throw new Error("Datos insuficientes para el par")
    const base = {
      entryZscore: input.entryZscore, exitZscore: input.exitZscore,
      hedgeRatioMethod: input.hedgeRatioMethod, exitMethod: input.exitMethod,
    }
    const full = backtestPairCrypto(al.closes1, al.closes2, base)
    // IS/OOS 70/30
    const split = Math.floor(al.times.length * 0.7)
    const is = backtestPairCrypto(al.closes1.slice(0, split), al.closes2.slice(0, split), base)
    const oos = backtestPairCrypto(al.closes1.slice(split), al.closes2.slice(split), base)
    const mFull = metricsPair(full.trades, 1000)
    const mIs = metricsPair(is.trades, 1000)
    const mOos = metricsPair(oos.trades, 1000)
    return {
      par: `${input.simboloA}/${input.simboloB}`, velas: al.times.length,
      metodo: input.hedgeRatioMethod, salida: input.exitMethod,
      beta: full.beta, adfStat: full.adfStat, pValue: full.pValue,
      cointegrado: full.pValue != null ? full.pValue < 0.05 : false,
      metricas: mFull, is: mIs, oos: mOos,
      robusto: mIs.expectancyPct > 0 && mOos.expectancyPct > 0,
      trades: full.trades.slice(-20),
    }
  }
}

export const analyzePairCrypto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PAIRS_SCHEMA.parse(d))
  .handler(async ({ data }) => textoPar(data)())

export const optimizePairCrypto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => PAIRS_SCHEMA.parse(d))
  .handler(async ({ data }) => {
    const [ka, kb] = await Promise.all([
      fetchKlines(data.simboloA, data.interval, data.days),
      fetchKlines(data.simboloB, data.interval, data.days),
    ])
    const al = alinear(ka, kb)
    if (al.times.length < 400) throw new Error("Datos insuficientes")
    const split = Math.floor(al.times.length * 0.7)
    const grid: any[] = []
    let best: { expOos: number; g: any } | null = null
    for (const ez of [1.5, 2.0, 2.5]) {
      for (const xz of [0.3, 0.5, 0.8]) {
        for (const xm of ["zscore_band", "mean_cross_with_stop"] as const) {
          const g = { entryZscore: ez, exitZscore: xz, exitMethod: xm, hedgeRatioMethod: data.hedgeRatioMethod }
          const isT = backtestPairCrypto(al.closes1.slice(0, split), al.closes2.slice(0, split), g)
          const mIs = metricsPair(isT.trades, 1000)
          if (mIs.trades < 4) continue
          const oosT = backtestPairCrypto(al.closes1.slice(split), al.closes2.slice(split), g)
          const mOos = metricsPair(oosT.trades, 1000)
          const row = { ...g, isTrades: mIs.trades, isWr: mIs.winRate, isExp: mIs.expectancyPct, oosTrades: mOos.trades, oosWr: mOos.winRate, oosExp: mOos.expectancyPct }
          grid.push(row)
          if (!best || mOos.expectancyPct > best.expOos) best = { expOos: mOos.expectancyPct, g: row }
        }
      }
    }
    grid.sort((a, b) => b.oosExp - a.oosExp)
    return { par: `${data.simboloA}/${data.simboloB}`, combos: grid.length, mejores: grid.slice(0, 10), mejor: best?.g ?? null }
  })
