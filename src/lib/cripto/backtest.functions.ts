// @ts-nocheck
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { backtestBBRSI, tradeMetrics, defaultScalpParams, type ScalpParams } from "./bb-rsi-engine"
import { rsiWilder, bollingerBands, atr } from "./indicators"

async function fetchKlinesRange(symbol: string, interval: string, days: number) {
  const msPerDay = 86400000
  const end = Date.now()
  const start = end - days * msPerDay
  let cur = start
  const all: any[] = []
  while (cur < end) {
    const url = `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol.toUpperCase()}&interval=${interval}&startTime=${cur}&limit=1500`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Binance ${res.status}`)
    const data: any[] = await res.json()
    if (!data.length) break
    all.push(...data)
    cur = data[data.length - 1][0] + 1
    if (data.length < 1500) break
    // avoid hammering
    await new Promise(r => setTimeout(r, 120))
  }
  return all
}

export const runBacktest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    interval: z.string().default("5m"),
    days: z.number().default(60),
    tpPct: z.number().default(1.0),
    dcaLevels: z.number().default(3),
    dcaStepPct: z.number().default(0.5),
    rsiDynamic: z.boolean().default(false),
    rsiWindow: z.number().default(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const { symbol, interval, days, tpPct, dcaLevels, dcaStepPct, rsiDynamic, rsiWindow } = data
    const raw = await fetchKlinesRange(symbol, interval, days)
    if (!raw.length) throw new Error("Sin datos de Binance")
    const klines = raw.map((k: any) => ({
      datetime: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]),
    }))
    const params: ScalpParams = { ...defaultScalpParams, tpPct, dcaLevels, dcaStepPct, rsiDynamic, rsiWindow }
    const trades = backtestBBRSI(klines as any, params)
    const m = tradeMetrics(trades, "pnlPct")
    const mAcc = tradeMetrics(trades, "pnlAccountPct")
    // equity series for charts
    const equityNotional = m.equity.map((v, i) => ({ idx: i + 1, value: v }))
    const equityCuenta = mAcc.equity.map((v, i) => ({ idx: i + 1, value: v }))
    // distribution
    const dist = trades.map(t => t.pnlPct * 100)
    // velas recientes for debug
    return {
      symbol, interval, days, klinesCount: klines.length,
      trades,
      metrics: { notional: m, cuenta: mAcc },
      equityNotional, equityCuenta,
      distribution: dist,
      lastPrice: klines[klines.length - 1].close,
    }
  })

export const runAnalyzer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    interval: z.string().default("5m"),
    days: z.number().default(60),
  }).parse(d))
  .handler(async ({ data }) => {
    const { symbol, interval, days } = data
    const raw = await fetchKlinesRange(symbol, interval, days)
    const closes = raw.map((k: any) => parseFloat(k[4]))
    const highs = raw.map((k: any) => parseFloat(k[2]))
    const lows = raw.map((k: any) => parseFloat(k[3]))
    const vols = raw.map((k: any) => parseFloat(k[5]))
    const rsi = rsiWilder(closes, 14)
    const bb = bollingerBands(closes, 20, 2.0)
    // precio series with bb
    const priceBB = raw.slice(-500).map((k: any, i: number) => {
      const idx = raw.length - 500 + i
      return { close: parseFloat(k[4]), sma: bb.sma[idx] ?? null, upper: bb.upper[idx] ?? null, lower: bb.lower[idx] ?? null }
    })
    // perfil precio 50 bins
    const prices = closes.slice(-6000)
    const minP = Math.min(...prices), maxP = Math.max(...prices)
    const bins = 50
    const step = (maxP - minP) / bins
    const hist: { bin: number; count: number }[] = Array(bins).fill(0).map((_, i) => ({ bin: minP + step * (i + 0.5), count: 0 }))
    for (const p of prices) {
      let idx = Math.floor((p - minP) / step); if (idx >= bins) idx = bins - 1; if (idx < 0) idx = 0
      hist[idx].count++
    }
    const poc = hist.reduce((a, b) => b.count > a.count ? b : a).bin
    // distribución RSI
    const rsiValid = rsi.filter((v): v is number => v != null)
    const rsiHist: { rsi: number; count: number }[] = []
    for (let b = 5; b <= 95; b += 5) {
      const c = rsiValid.filter(v => v >= b && v < b + 5).length
      rsiHist.push({ rsi: b, count: c })
    }
    // minutos entre RSI 70-80
    const gaps: number[] = []
    let lastIdx = -9999
    for (let i = 0; i < rsi.length; i++) {
      const v = rsi[i]; if (v == null) continue
      if (v >= 70 && v <= 80) {
        if (lastIdx >= 0) gaps.push(i - lastIdx)
        lastIdx = i
      }
    }
    const gapHist = Array(12).fill(0)
    for (const g of gaps) {
      const mins = g * 5 // 5m timeframe
      let idx = Math.min(11, Math.floor(mins / 150))
      gapHist[idx]++
    }
    // RSI dinámico p80/p20 rodante
    const rsiP80: (number | null)[] = []
    const rsiP20: (number | null)[] = []
    const win = 100
    for (let i = 0; i < rsi.length; i++) {
      if (i < win) { rsiP80.push(null); rsiP20.push(null); continue }
      const slice = rsi.slice(i - win + 1, i + 1).filter((v): v is number => v != null)
      const sorted = [...slice].sort((a, b) => a - b)
      rsiP80.push(sorted[Math.floor(sorted.length * 0.8)] ?? null)
      rsiP20.push(sorted[Math.floor(sorted.length * 0.2)] ?? null)
    }
    const rsiDyn = rsi.slice(-600).map((v, i) => {
      const idx = rsi.length - 600 + i
      return { idx: idx, rsi: v, p80: rsiP80[idx] ?? null, p20: rsiP20[idx] ?? null }
    })
    // RSI vs BB width (color ATR)
    const bbWidthPct = bb.width.map(v => v != null ? v * 100 : null)
    const atrArr = atr(raw.map((k: any) => ({ high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]) })) as any, 14)
    const atrPctArr = atrArr.map((v, i) => v != null ? (v / closes[i]) * 100 : null)
    const scatter = closes.slice(-4000).map((c, i) => {
      const idx = closes.length - 4000 + i
      return { bbWidth: bbWidthPct[idx] ?? 0, rsi: rsi[idx] ?? 0, atrPct: atrPctArr[idx] ?? 0 }
    }).filter(p => p.rsi != null)

    return {
      symbol, interval, days,
      rsiHist, priceBB, histPerfil: hist, poc,
      gapHist, rsiDyn, scatter,
      lastClose: closes[closes.length - 1],
    }
  })

export const checkLiveSignal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    interval: z.string().default("5m"),
    rsiDynamic: z.boolean().default(false),
    rsiWindow: z.number().default(100),
  }).parse(d))
  .handler(async ({ data }) => {
    const { symbol, interval, rsiDynamic, rsiWindow } = data
    const raw = await fetchKlinesRange(symbol, interval, 2) // últimas 2 días para tener 500 velas 5m (~576)
    const klines = raw.slice(-600).map((k: any) => ({ datetime: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5]) }))
    const closes = klines.map(k => k.close)
    const rsi = rsiWilder(closes, 14)
    const bb = bollingerBands(closes, 20, 2.0)
    const atrArr = atr(klines as any, 14)
    const lastIdx = closes.length - 1
    const lastClose = closes[lastIdx]
    const lastRsi = rsi[lastIdx]
    const up = bb.upper[lastIdx], lo = bb.lower[lastIdx], width = bb.width[lastIdx]
    const atrPct = atrArr[lastIdx] != null ? (atrArr[lastIdx]! / lastClose) * 100 : 0.5

    let rsiOb = 70, rsiOs = 30, rsiObMax = 80
    if (rsiDynamic) {
      const slice = rsi.slice(-rsiWindow).filter((v): v is number => v != null)
      if (slice.length > 50) {
        const sorted = [...slice].sort((a, b) => a - b)
        rsiOb = sorted[Math.floor(sorted.length * 0.85)] ?? 70
        rsiOs = sorted[Math.floor(sorted.length * 0.15)] ?? 30
        if ((width ?? 0) * 100 > 0.6) { rsiOb = Math.min(78, rsiOb + 2); rsiOs = Math.max(22, rsiOs - 2) }
        rsiObMax = rsiOb + 8
      }
    }
    if (lastRsi == null || up == null || lo == null) return { signal: null, price: lastClose, rsi: lastRsi, bbUp: up, bbLo: lo, rsiOb, rsiOs }
    const isShort = lastClose > up && lastRsi >= rsiOb && lastRsi <= rsiObMax
    const isLong = lastClose < lo && lastRsi <= rsiOs
    let signal: "LONG" | "SHORT" | null = null
    if (isShort) signal = "SHORT"
    else if (isLong) signal = "LONG"
    // TP/SL est como en live_bot
    const tp = signal === "LONG" ? lastClose * 1.01 : signal === "SHORT" ? lastClose * 0.99 : null
    const slLong = lastClose * (1 - Math.max(0.005, Math.min(0.025, atrPct * 0.9)) )
    const slShort = lastClose * (1 + Math.max(0.005, Math.min(0.025, atrPct * 0.9)) )
    const sl = signal === "LONG" ? slLong : signal === "SHORT" ? slShort : null
    return { signal, price: lastClose, rsi: lastRsi, bbUp: up, bbLo: lo, rsiOb, rsiOs, rsiObMax, tp, sl, atrPct, width }
  })
