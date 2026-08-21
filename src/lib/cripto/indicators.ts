// @ts-nocheck
// Port de trading_bots/common/indicators.py

export function rsiWilder(closes: number[], period = 14): (number | null)[] {
  const n = closes.length
  const rsi: (number | null)[] = Array(n).fill(null)
  if (n < period + 1) return rsi
  let gain = 0, loss = 0
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) gain += d
    else loss += -d
  }
  let avgGain = gain / period
  let avgLoss = loss / period
  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < n; i++) {
    const d = closes[i] - closes[i - 1]
    const g = d > 0 ? d : 0
    const l = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + g) / period
    avgLoss = (avgLoss * (period - 1) + l) / period
    rsi[i] = avgLoss === 0 ? 100 : avgGain === 0 ? 0 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return rsi
}

export function bollingerBands(closes: number[], period = 20, std = 2.0) {
  const n = closes.length
  const sma: (number | null)[] = Array(n).fill(null)
  const upper: (number | null)[] = Array(n).fill(null)
  const lower: (number | null)[] = Array(n).fill(null)
  const width: (number | null)[] = Array(n).fill(null)
  const pctB: (number | null)[] = Array(n).fill(null)
  for (let i = period - 1; i < n; i++) {
    const slice = closes.slice(i - period + 1, i + 1)
    const mean = slice.reduce((a, b) => a + b, 0) / period
    const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period
    const sd = Math.sqrt(variance)
    sma[i] = mean
    upper[i] = mean + std * sd
    lower[i] = mean - std * sd
    width[i] = mean !== 0 ? (upper[i]! - lower[i]!) / mean : 0
    pctB[i] = upper[i]! !== lower[i]! ? (closes[i] - lower[i]!) / (upper[i]! - lower[i]!) : 0.5
  }
  return { sma, upper, lower, width, pctB }
}

export function atr(klines: { high: number; low: number; close: number }[], period = 14): (number | null)[] {
  const n = klines.length
  const out: (number | null)[] = Array(n).fill(null)
  if (n < 2) return out
  const tr: number[] = Array(n).fill(0)
  for (let i = 1; i < n; i++) {
    const hl = klines[i].high - klines[i].low
    const hc = Math.abs(klines[i].high - klines[i - 1].close)
    const lc = Math.abs(klines[i].low - klines[i - 1].close)
    tr[i] = Math.max(hl, hc, lc)
  }
  let sum = 0
  for (let i = 1; i <= period; i++) sum += tr[i] ?? 0
  out[period] = sum / period
  for (let i = period + 1; i < n; i++) {
    out[i] = (out[i - 1]! * (period - 1) + tr[i]) / period
  }
  return out
}

export function rollingQuantile(arr: (number | null)[], window: number, q: number): (number | null)[] {
  const n = arr.length
  const out: (number | null)[] = Array(n).fill(null)
  for (let i = window - 1; i < n; i++) {
    const slice = arr.slice(i - window + 1, i + 1).filter((v): v is number => v != null && isFinite(v))
    if (slice.length < window * 0.8) continue
    const sorted = [...slice].sort((a, b) => a - b)
    const idx = q * (sorted.length - 1)
    const lo = Math.floor(idx), hi = Math.ceil(idx)
    out[i] = lo === hi ? sorted[lo] : sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
  }
  return out
}
