// @ts-nocheck
import { rsiWilder, bollingerBands, atr, rollingQuantile } from "./indicators"

export interface ScalpParams {
  bbPeriod: number
  bbStd: number
  rsiPeriod: number
  rsiOverbought: number
  rsiOversold: number
  rsiOverboughtMax: number
  rsiDynamic: boolean
  rsiWindow: number
  tpPct: number
  slAccountPct: number
  capitalPct: number
  leverage: number
  dcaLevels: number
  dcaStepPct: number
  dcaDynamic: boolean
  comision: number
}

export const defaultScalpParams: ScalpParams = {
  bbPeriod: 20, bbStd: 2.0, rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30, rsiOverboughtMax: 80,
  rsiDynamic: false, rsiWindow: 100, tpPct: 1.0, slAccountPct: 10.0, capitalPct: 10.0, leverage: 10,
  dcaLevels: 3, dcaStepPct: 0.5, dcaDynamic: true, comision: 0.0004,
}

export interface KlineBB {
  datetime: number
  open: number; high: number; low: number; close: number; volume: number
}

export interface Trade {
  side: "LONG" | "SHORT"
  entryIdx: number; exitIdx: number
  entryTime: number; exitTime: number
  avgEntry: number; exitPrice: number
  pnlPct: number // net sobre notional
  pnlAccountPct: number
  reason: string
  nDca: number
  rsiEntry: number | null
  bbWidthEntry: number | null
}

function slPriceFromAvg(avg: number, side: string, slAccountPct: number, deployedPct: number, leverage: number) {
  if (deployedPct <= 0 || leverage <= 0) return side === "LONG" ? avg * 0.9 : avg * 1.1
  let slPct = (slAccountPct / (deployedPct * leverage)) * 100
  slPct = Math.max(0.5, Math.min(15, slPct))
  return side === "LONG" ? avg * (1 - slPct / 100) : avg * (1 + slPct / 100)
}

export function backtestBBRSI(klines: KlineBB[], params: ScalpParams = defaultScalpParams): Trade[] {
  const n = klines.length
  if (n < params.bbPeriod + params.rsiPeriod + 5) return []
  const closes = klines.map(k => k.close)
  const rsi = rsiWilder(closes, params.rsiPeriod)
  const bb = bollingerBands(closes, params.bbPeriod, params.bbStd)
  const atrArr = atr(klines as any, 14)
  const atrPct = atrArr.map((v, i) => v != null ? (v / closes[i]) * 100 : null)
  let rsiP85: (number | null)[] = Array(n).fill(null)
  let rsiP15: (number | null)[] = Array(n).fill(null)
  if (params.rsiDynamic) {
    rsiP85 = rollingQuantile(rsi, params.rsiWindow, 0.85)
    rsiP15 = rollingQuantile(rsi, params.rsiWindow, 0.15)
  }

  const trades: Trade[] = []
  let i = Math.max(params.bbPeriod, params.rsiPeriod) + 2
  let inPos = false
  let side: "LONG" | "SHORT" | null = null
  let entries: number[] = []
  let qtys: number[] = []
  let entryIdx: number | null = null
  let entryRsi: number | null = null
  let entryBbWidth: number | null = null

  while (i < n) {
    const rowRsi = rsi[i]
    const up = bb.upper[i], lo = bb.lower[i], width = bb.width[i]
    if (rowRsi == null || up == null || lo == null || width == null) { i++; continue }

    if (!inPos) {
      let rsiOb: number, rsiOs: number, rsiObMax: number
      if (params.rsiDynamic && rsiP85[i] != null && rsiP15[i] != null) {
        rsiOb = rsiP85[i]!; rsiOs = rsiP15[i]!
        if ((width * 100) > 0.6) { rsiOb = Math.min(78, rsiOb + 2); rsiOs = Math.max(22, rsiOs - 2) }
        rsiObMax = rsiOb + 8
      } else {
        rsiOb = params.rsiOverbought; rsiOs = params.rsiOversold; rsiObMax = params.rsiOverboughtMax
      }
      const close = closes[i]
      const isShort = close > up && rowRsi >= rsiOb && rowRsi <= rsiObMax
      const isLong = close < lo && rowRsi <= rsiOs
      if (isLong) { inPos = true; side = "LONG"; entries = [close]; qtys = [1]; entryIdx = i; entryRsi = rowRsi; entryBbWidth = width }
      else if (isShort) { inPos = true; side = "SHORT"; entries = [close]; qtys = [1]; entryIdx = i; entryRsi = rowRsi; entryBbWidth = width }
      i++; continue
    } else {
      const totalQty = qtys.reduce((a, b) => a + b, 0)
      const avgEntry = entries.reduce((s, p, idx) => s + p * qtys[idx], 0) / totalQty
      let dcaStep = params.dcaStepPct
      if (params.dcaDynamic) {
        const bw = (width * 100)
        const atrp = atrPct[i] ?? 0
        dcaStep = Math.max(params.dcaStepPct, bw * 0.35, atrp * 0.9)
        dcaStep = Math.max(0.4, Math.min(2.5, dcaStep))
        if (atrp > 1.2 && entries.length >= 4) dcaStep = 999
      }
      const deployedPct = params.capitalPct * entries.length
      const tpPrice = side === "LONG" ? avgEntry * (1 + params.tpPct / 100) : avgEntry * (1 - params.tpPct / 100)
      const slPrice = slPriceFromAvg(avgEntry, side!, params.slAccountPct, deployedPct, params.leverage)
      const high = klines[i].high, low = klines[i].low
      const hitTp = side === "LONG" ? high >= tpPrice : low <= tpPrice
      const hitSl = side === "LONG" ? low <= slPrice : high >= slPrice
      if (hitTp || hitSl) {
        const exitPrice = hitTp ? tpPrice : slPrice
        const reason = hitTp ? "TP_1PCT" : "SL_DINAMICO"
        const gross = side === "LONG" ? (exitPrice - avgEntry) / avgEntry : (avgEntry - exitPrice) / avgEntry
        const net = gross - params.comision * entries.length - params.comision
        const pnlAccount = net * params.leverage * (deployedPct / 100)
        trades.push({
          side: side!, entryIdx: entryIdx!, exitIdx: i, entryTime: klines[entryIdx!].datetime, exitTime: klines[i].datetime,
          avgEntry, exitPrice, pnlPct: net, pnlAccountPct: pnlAccount, reason, nDca: entries.length - 1, rsiEntry: entryRsi, bbWidthEntry: entryBbWidth
        })
        inPos = false; side = null; entries = []; qtys = []; entryIdx = null; i++; continue
      }
      const lastPrice = closes[i]
      const adverse = side === "LONG" ? (avgEntry - lastPrice) / avgEntry * 100 : (lastPrice - avgEntry) / avgEntry * 100
      if (adverse >= dcaStep && entries.length < params.dcaLevels + 1) {
        entries.push(lastPrice); qtys.push(1)
      }
      i++
    }
  }
  return trades
}

export function tradeMetrics(trades: Trade[], pnlKey: "pnlPct" | "pnlAccountPct" = "pnlPct") {
  if (!trades.length) return { trades: 0, winRate: 0, profitFactor: 0, returnPct: 0, maxDrawdownPct: 0, expectancyPct: 0, sharpe: 0, equity: [] as number[], tradesData: [] as Trade[] }
  const pnls = trades.map(t => t[pnlKey])
  const equity: number[] = []
  let cur = 1
  for (const p of pnls) { cur *= (1 + p); equity.push(cur) }
  const wins = pnls.filter(p => p > 0)
  const losses = pnls.filter(p => p <= 0)
  const winRate = wins.length / pnls.length * 100
  const lossSum = Math.abs(losses.reduce((a, b) => a + b, 0))
  const profitFactor = lossSum > 0 ? wins.reduce((a, b) => a + b, 0) / lossSum : 999
  const returnPct = (equity[equity.length - 1] - 1) * 100
  let maxDd = 0, peak = 1
  for (const e of equity) { if (e > peak) peak = e; const dd = (e - peak) / peak * 100; if (dd < maxDd) maxDd = dd }
  const expectancyPct = pnls.reduce((a, b) => a + b, 0) / pnls.length * 100
  const mean = pnls.reduce((a, b) => a + b, 0) / pnls.length
  const variance = pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / pnls.length
  const std = Math.sqrt(variance)
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(pnls.length) : 0
  return { trades: pnls.length, winRate, profitFactor, returnPct, maxDrawdownPct: maxDd, expectancyPct, sharpe, equity, tradesData: trades }
}
