// @ts-nocheck
/**
 * QUANT LAB CRYPTO — port de coronar_bbinance_telegram/metodologias/:
 *  - mm_inventory.py: Market-Making con control de inventario (Avellaneda-Stoikov
 *    / Fodra-Labadie simplificado a klines 1m). Precio de reserva
 *    r = S·(1+Δ)·(1 − skew·q·σ²), spread ψ_bps = ψ_min + 2α + 50·|q|·σ/100,
 *    fills si la vela toca bid/ask.
 *  - optimal_execution.py: Almgren-Chriss (IS) vs TWAP vs naive.
 *    Impacto h(v) = σ·√steps·(v/V)^γ en bps; métrica Implementation Shortfall.
 */
import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { fetchKlinesRange } from "./backtest.functions"

function pctChange(v: number[]): number[] {
  const out = [0]
  for (let i = 1; i < v.length; i++) out.push(v[i - 1] > 0 ? v[i] / v[i - 1] - 1 : 0)
  return out
}

function rollingStd(v: number[], w: number): number[] {
  const out: number[] = Array(v.length).fill(0)
  for (let i = 0; i < v.length; i++) {
    const lo = Math.max(0, i - w + 1)
    let m = 0
    for (let j = lo; j <= i; j++) m += v[j]
    const n = i - lo + 1
    m /= n
    let ss = 0
    for (let j = lo; j <= i; j++) ss += (v[j] - m) ** 2
    out[i] = Math.sqrt(ss / Math.max(1, n - 1))
  }
  return out
}

function ewm(v: number[], span: number): number[] {
  const k = 2 / (span + 1)
  const out = [v[0]]
  for (let i = 1; i < v.length; i++) out.push(v[i] * k + out[i - 1] * (1 - k))
  return out
}

function toKlines(raw: any[]) {
  return raw.map((k: any) => ({
    datetime: k[0], open: parseFloat(k[1]), high: parseFloat(k[2]), low: parseFloat(k[3]),
    close: parseFloat(k[4]), volume: parseFloat(k[5]),
  }))
}

// ---------------------------------------------------------------------------
// MARKET-MAKING con control de inventario (mm_inventory.py)
// ---------------------------------------------------------------------------

export interface MMParamsT {
  qtyUsdt: number; maxInventory: number; psiMinBps: number; invSkew: number
  makerFeeBps: number; volWindow: number; emaFast: number; emaSlow: number; deltaCoef: number
}

const MM_DEFAULTS: MMParamsT = {
  qtyUsdt: 500, maxInventory: 6, psiMinBps: 5, invSkew: 0.5,
  makerFeeBps: 2, volWindow: 60, emaFast: 10, emaSlow: 120, deltaCoef: 0,
}

function simulateMM(kl: any[], p: MMParamsT) {
  const closes = kl.map((k) => k.close)
  const rets = pctChange(closes)
  const stdRaw = rollingStd(rets, p.volWindow)
  const firstNonZero = stdRaw.find((v) => v > 0) ?? 1e-6
  const sigmaPct = stdRaw.map((v) => Math.max((v > 0 ? v : firstNonZero) * 100, 1e-6))
  const emaF = ewm(closes, p.emaFast)
  const emaS = ewm(closes, p.emaSlow)

  let qLots = 0
  let cash = 0
  let nBuy = 0, nSell = 0, blocked = 0
  const equity: number[] = []

  for (let i = 0; i < kl.length; i++) {
    const s = closes[i]
    const sig = sigmaPct[i]
    const delta = p.deltaCoef * (emaS[i] !== 0 ? emaF[i] / emaS[i] - 1 : 0)
    const r = s * (1 + delta) * (1 - ((p.invSkew * sig * sig) / 100) * qLots)
    const psiBps = p.psiMinBps + 2 * p.makerFeeBps + (50 * Math.abs(qLots) * sig) / 100
    const psi = (s * psiBps) / 1e4
    const bid = r - psi / 2
    const ask = r + psi / 2

    if (kl[i].low <= bid) {
      if (qLots < p.maxInventory) { cash -= p.qtyUsdt * (1 + p.makerFeeBps / 1e4); qLots++; nBuy++ }
      else blocked++
    }
    if (kl[i].high >= ask) {
      if (qLots > -p.maxInventory) { cash += p.qtyUsdt * (1 - p.makerFeeBps / 1e4); qLots--; nSell++ }
      else blocked++
    }
    equity.push(cash + qLots * p.qtyUsdt)
  }

  const diffs: number[] = []
  for (let i = 1; i < equity.length; i++) diffs.push(equity[i] - equity[i - 1])
  const md = diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length)
  const sd = diffs.length > 1 ? Math.sqrt(diffs.reduce((s, v) => s + (v - md) ** 2, 0) / (diffs.length - 1)) : 0
  const sharpe = sd > 0 ? (md / sd) * Math.sqrt(1440) : 0
  let peak = -Infinity, dd = 0
  for (const e of equity) { if (e > peak) peak = e; if (peak - e > dd) dd = peak - e }
  const fills = nBuy + nSell
  const pnl = equity[equity.length - 1] ?? 0
  return { fills, nBuy, nSell, finalQ: qLots, pnlUsdt: pnl, pnlPerFillUsdt: fills ? pnl / fills : 0, sharpeMin: sharpe, maxDdUsdt: dd, blocked }
}

export const runMMInventory = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    days: z.number().default(10),
    grid: z.boolean().default(false),
  }).parse(d))
  .handler(async ({ data }) => {
    const raw = await fetchKlinesRange(data.symbol, "1m", data.days)
    if (raw.length < 2000) throw new Error("Sin datos suficientes (se requieren ≥2000 velas 1m)")
    const kl = toKlines(raw)
    if (!data.grid) {
      const m = simulateMM(kl, MM_DEFAULTS)
      return { symbol: data.symbol, velas: kl.length, modo: "base", base: m }
    }
    // GRID sobre TRAIN 60% -> TEST OOS 40% con mejores params por PnL (mm_inventory.py grid_search)
    const cut = Math.floor(kl.length * 0.6)
    const train = kl.slice(0, cut)
    const test = kl.slice(cut)
    const resultados: Array<{ p: MMParamsT; m: ReturnType<typeof simulateMM> }> = []
    for (const psi of [3, 5, 8, 12]) {
      for (const skew of [0.2, 0.5, 1, 2]) {
        for (const dc of [0, 3]) {
          for (const maxi of [4, 8]) {
            const p: MMParamsT = { ...MM_DEFAULTS, psiMinBps: psi, invSkew: skew, deltaCoef: dc, maxInventory: maxi }
            resultados.push({ p, m: simulateMM(train, p) })
          }
        }
      }
    }
    const validos = resultados.filter((r) => r.m.fills >= 200)
    const pool = validos.length ? validos : resultados
    pool.sort((a, b) => b.m.pnlUsdt - a.m.pnlUsdt)
    const best = pool[0]
    const oos = simulateMM(test, best.p)
    return {
      symbol: data.symbol, velas: kl.length, modo: "grid",
      bestParams: best.p,
      top5: pool.slice(0, 5).map((r) => ({ psi: r.p.psiMinBps, skew: r.p.invSkew, dc: r.p.deltaCoef, maxQ: r.p.maxInventory, pnl: r.m.pnlUsdt, fills: r.m.fills, sharpe: r.m.sharpeMin })),
      train: best.m,
      oos,
    }
  })

// ---------------------------------------------------------------------------
// FODRA-LABADIE HJB §2-§4 — Market-Making con OU Δ + intensidad Poisson + MC
// ---------------------------------------------------------------------------
export interface MMHJBParams {
  source?: "binance" | "yahoo"; // default binance
  k?: number; A?: number; z?: number; eta?: number; nu?: number; epsilon?: number; alphaFee?: number;
  maxQ?: number; nPaths?: number;
}

export const runMMHJB = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    days: z.number().default(20),
    source: z.enum(["binance","yahoo"]).default("binance"),
    k: z.number().default(1), A: z.number().default(100), z: z.number().default(0.5),
    eta: z.number().default(1), nu: z.number().default(1), epsilon: z.number().default(0.001),
    alphaFee: z.number().default(0.05), maxQ: z.number().default(50), nPaths: z.number().default(200),
  }).parse(d))
  .handler(async ({ data }) => {
    // — fetch mid-price path(s)
    const closes: number[] = [];
    if (data.source === "yahoo") {
      const { fetchYahooChart } = await import("@/lib/yahoo-http");
      const ch: any = await fetchYahooChart(data.symbol, "3mo", "1d");
      const c: number[] = ch?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
      for (const v of c) if (isFinite(v) && v > 0) closes.push(v);
    } else {
      const raw = await fetchKlinesRange(data.symbol, "1m", data.days);
      closes.push(...raw.map((k: any) => parseFloat(k[4])));
    }
    if (closes.length < 100) throw new Error("Sin datos suficientes para Fodra-Labadie (≥100 cierres)");
    const { fitOrnsteinUhlenbeck, quotesFL, runMonteCarloFL } = await import("@/lib/labadie/market-making");
    const { simularEulerSDE } = await import("@/lib/statarb.math");
    const ouFit = fitOrnsteinUhlenbeck(closes, 1/1440);
    const mid0 = closes[closes.length-1]!;
    // quotes ejemplo sobre último precio
    const tau = 1; // horizon 1 day
    const qExample = quotesFL({ s: mid0, q: 0, t: 0, T: tau, k: data.k, A: data.A, z: data.z, sigma: ouFit?.sigma ?? 0.5, eta: data.eta, nu: data.nu, epsilon: data.epsilon, alphaFee: data.alphaFee, ouFit });
    const qWithInv = quotesFL({ s: mid0, q: 5, t: 0, T: tau, k: data.k, A: data.A, z: data.z, sigma: ouFit?.sigma ?? 0.5, eta: data.eta, nu: data.nu, epsilon: data.epsilon, alphaFee: data.alphaFee, ouFit });
    // quotePath sobre closes reales (muestra cada ~ n/100 puntos)
    const { simulateMMIntensity } = await import("@/lib/labadie/market-making");
    const simReal = simulateMMIntensity(closes.slice(-Math.min(closes.length, 500)), ouFit, { k: data.k, A: data.A, z: data.z, eta: data.eta, nu: data.nu, epsilon: data.epsilon, alphaFee: data.alphaFee, maxQ: data.maxQ, dtHours: 1/60, T: tau });
    const step = Math.max(1, Math.floor(simReal.steps.length / 100));
    const quotePath = simReal.steps.filter((_,i)=> i%step===0).map(s=> ({ t: s.t, mid: s.s, bid: s.bid, ask: s.ask, q: s.q }));
    // sensibilidad ε×α grid 3×3 (q=0)
    const epsGrid=[0.0005,0.001,0.003], alphaGrid=[0,0.05,0.2];
    const sensitivity = epsGrid.map(eps=> ({ eps, row: alphaGrid.map(al=> { const q=quotesFL({ s: mid0, q:0, t:0, T:tau, k:data.k, A:data.A, z:data.z, sigma: ouFit?.sigma ?? 0.5, eta:data.eta, nu:data.nu, epsilon:eps, alphaFee:al, ouFit }); return { alpha: al, psiFee: q.psiFee, rStar: q.rStar, gain: q.gainPerSpread }; }) }));
    // MC: OU paths vs martingale baseline
    const genOU = (seed: number) => {
      const a = ouFit?.a ?? 0.1; const mu = ouFit?.mu ?? mid0; const sig = ouFit?.sigma ?? 0.5;
      return simularEulerSDE(mid0, a, sig, tau, Math.min(closes.length, 1000), "ou", mu);
    };
    const mc = runMonteCarloFL(Math.min(data.nPaths, 300), genOU, ouFit, { k: data.k, A: data.A, z: data.z, eta: data.eta, nu: data.nu, epsilon: data.epsilon, alphaFee: data.alphaFee, maxQ: data.maxQ, dtHours: 1/60, T: tau });
    return { symbol: data.symbol, source: data.source, n: closes.length, ouFit, quotes: { flat: qExample, withInventory: qWithInv }, mc, quotePath, sensitivity };
  })

export const runMMHJBMulti = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    symbols: z.array(z.string()).min(2).max(4),
    source: z.enum(["binance","yahoo"]).default("binance"),
    days: z.number().default(20),
    k: z.number().default(1), A: z.number().default(100), z: z.number().default(0.5),
    eta: z.number().default(1), nu: z.number().default(1), epsilon: z.number().default(0.001),
    alphaFee: z.number().default(0.05), cLevel: z.number().default(2),
  }).parse(d))
  .handler(async ({ data }) => {
    const closesPer: number[][] = [];
    for(const sym of data.symbols){
      const arr:number[]=[];
      if(data.source==="yahoo"){
        const { fetchYahooChart } = await import("@/lib/yahoo-http");
        const ch:any = await fetchYahooChart(sym, "3mo","1d"); const c:number[]=ch?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
        for(const v of c) if(isFinite(v)&&v>0) arr.push(v);
      } else { const raw=await fetchKlinesRange(sym,"1m",data.days); arr.push(...raw.map((k:any)=>parseFloat(k[4]))); }
      closesPer.push(arr);
    }
    const lens = closesPer.map(a=>a.length); if(lens.some(l=>l<50)) throw new Error("Datos insuficientes multi-activo");
    // covarianza Lambda proxy: correlación de retornos
    const retsPer = closesPer.map(c=> c.slice(1).map((v,i)=> (v-c[i]!)/c[i]!));
    const minLen = Math.min(...retsPer.map(r=>r.length));
    const trimmed = retsPer.map(r=> r.slice(-minLen));
    const M=data.symbols.length;
    const Lambda:number[][] = Array.from({length:M}, (_,i)=> Array.from({length:M}, (_,j)=>{
      if(i===j) return trimmed[i]!.reduce((s,v)=>s+v*v,0)/minLen;
      const mi=trimmed[i]!.reduce((s,v)=>s+v,0)/minLen, mj=trimmed[j]!.reduce((s,v)=>s+v,0)/minLen;
      let cov=0; for(let t=0;t<minLen;t++) cov+=(trimmed[i]![t]!-mi)*(trimmed[j]![t]!-mj); cov/=minLen;
      return cov;
    }));
    const midPer = closesPer.map(c=> c[c.length-1]!);
    const { fitOrnsteinUhlenbeck } = await import("@/lib/labadie/market-making");
    const fits = closesPer.map(c=> fitOrnsteinUhlenbeck(c, 1/1440));
    const { multiAssetQuotes, isoRiskEllipse } = await import("@/lib/labadie/market-making");
    const assets = data.symbols.map((sym,i)=> ({ s: midPer[i]!, q: 0, k: data.k, A: data.A, z: data.z, sigma: fits[i]?.sigma ?? 0.5, alphaFee: data.alphaFee, ouFit: fits[i] }));
    const Omega = Lambda.map((row,i)=> row.map((_,j)=> i===j? 0.5 : 0.2*Lambda[i]![j]! / Math.sqrt((Lambda[i]![i]??1)*(Lambda[j]![j]??1))));
    const { perAsset, piTilde } = multiAssetQuotes({ assets, Omega, Lambda, t:0, T:1, eta:data.eta, nu:data.nu, epsilon:data.epsilon });
    const ellipse0 = isoRiskEllipse({ Omega, c: data.cLevel, rhoOverride: 0 });
    const rhoAvg = M>=2? Omega[0]![1]! / Math.sqrt((Omega[0]![0]??1)*(Omega[1]![1]??1)) : 0;
    const ellipseRho = isoRiskEllipse({ Omega, c: data.cLevel, rhoOverride: rhoAvg });
    return { symbols: data.symbols, fits, perAsset, piTilde, Lambda, Omega, ellipse0, ellipseRho, cLevel: data.cLevel };
  })

// ---------------------------------------------------------------------------
// EJECUCIÓN ÓPTIMA (optimal_execution.py): AC vs TWAP vs naive, IS en bps
// ---------------------------------------------------------------------------

const HALF_SPREAD_BPS = 1.0
const KAPPA_GRID = [0.005, 0.01, 0.02, 0.05, 0.1]
const GAMMA = 0.5

function impactBps(vShare: number, sigmaStepPct: number, steps: number): number {
  if (vShare <= 0) return 0
  return sigmaStepPct * Math.sqrt(steps) * Math.pow(vShare, GAMMA) * 100
}

function isBpsBuy(avgExec: number, arrival: number): number {
  return (avgExec / arrival - 1) * 1e4
}

function runNaive(prices: number[], vShare: number, sigmaStep: number, steps: number): number {
  const p0 = prices[0]
  const avg = p0 * (1 + (HALF_SPREAD_BPS + impactBps(vShare, sigmaStep, steps)) / 1e4)
  return isBpsBuy(avg, p0)
}

function runTwap(prices: number[], vShare: number): number {
  const n = prices.length
  let acc = 0
  for (const p of prices) acc += p * (1 + (HALF_SPREAD_BPS + impactBps(vShare / n, 0, 1)) / 1e4)
  const avg = acc / n
  return isBpsBuy(avg, prices[0])
}

/** x_n = X·sinh(κ(T−t_n))/sinh(κT) -> pesos v_n = x_{n-1} − x_n normalizados */
function acCurve(n: number, kappa: number): number[] {
  const t = Array.from({ length: n + 1 }, (_, i) => i)
  const x = t.map((ti) => Math.sinh(kappa * (n - ti)) / Math.sinh(kappa * n))
  const v: number[] = []
  for (let i = 1; i < x.length; i++) v.push(x[i - 1] - x[i])
  const total = v.reduce((a, b) => a + b, 0)
  return v.map((w) => w / total)
}

function runAc(prices: number[], kappa: number, vShare: number): number {
  const v = acCurve(prices.length, kappa)
  let imp = 0
  let acc = 0
  for (let i = 0; i < v.length; i++) {
    imp += v[i] * impactBps(vShare * v[i], 0, 1)
    acc += v[i] * prices[i]
  }
  const avg = acc * (1 + (HALF_SPREAD_BPS + imp) / 1e4)
  return isBpsBuy(avg, prices[0])
}

export const runOptimalExecution = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({
    symbol: z.string().default("BTCUSDT"),
    days: z.number().default(20),
    horizonMin: z.number().default(60),
    notionalUsdt: z.number().default(100000),
  }).parse(d))
  .handler(async ({ data }) => {
    const raw = await fetchKlinesRange(data.symbol, "1m", data.days)
    if (raw.length < data.horizonMin * 3) throw new Error("Sin datos para las ventanas pedidas")
    const closesAll = raw.map((k: any) => parseFloat(k[4]))
    const volsAll = raw.map((k: any) => parseFloat(k[5]))
    const retsAll = pctChange(closesAll)
    const H = Math.max(5, Math.round(data.horizonMin))
    const nWindows = Math.floor(closesAll.length / H)
    const rows: Array<{ win: number; naive: number; twap: number; ac: number | null; kappa: number | null }> = []
    let prevSeg: number[] | null = null
    for (let w = 0; w < nWindows; w++) {
      const lo = w * H
      const seg = closesAll.slice(lo, lo + H)
      if (seg.length < H) break
      const Vh = volsAll.slice(lo, lo + H).reduce((a, b) => a + b, 0)
      const notionalShares = data.notionalUsdt / seg[0]
      const vShare = Math.min(notionalShares / Math.max(Vh, 1e-9), 5)
      const meanR = retsAll.slice(lo, lo + H).reduce((a, b) => a + b, 0) / H
      const sigmaStep = Math.sqrt(retsAll.slice(lo, lo + H).reduce((s, v) => s + (v - meanR) ** 2, 0) / H) * 100
      const naive = runNaive(seg, vShare, sigmaStep, H)
      const twap = runTwap(seg, vShare)
      let ac: number | null = null
      let kappa: number | null = null
      if (prevSeg) {
        let bestK = KAPPA_GRID[2], bestIs: number | null = null
        for (const k of KAPPA_GRID) {
          const ik = runAc(prevSeg, k, vShare)
          if (bestIs == null || ik < bestIs) { bestIs = ik; bestK = k }
        }
        kappa = bestK
        ac = runAc(seg, bestK, vShare)
      }
      rows.push({ win: w, naive, twap, ac, kappa })
      prevSeg = seg
    }
    const out = rows.filter((r) => r.ac != null) as Array<{ win: number; naive: number; twap: number; ac: number; kappa: number }>
    if (!out.length) throw new Error("Sin ventanas evaluables")
    const stat = (xs: number[]) => {
      const m = xs.reduce((a, b) => a + b, 0) / xs.length
      const v = xs.length > 1 ? xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1) : 0
      return { mean: m, std: Math.sqrt(v), j: m + 0.5 * v }
    }
    const sN = stat(out.map((r) => r.naive))
    const sT = stat(out.map((r) => r.twap))
    const sA = stat(out.map((r) => r.ac))
    const beatTwap = (out.filter((r) => r.twap < r.naive).length / out.length) * 100
    const beatAc = (out.filter((r) => r.ac < r.naive).length / out.length) * 100
    const savTwap = out.reduce((s, r) => s + (r.naive - r.twap), 0) / out.length
    const savAc = out.reduce((s, r) => s + (r.naive - r.ac), 0) / out.length
    const rentable = savTwap > 0 && beatTwap >= 70 && savAc >= savTwap - 1.0
    return {
      symbol: data.symbol, horizonMin: H, notionalUsdt: data.notionalUsdt,
      ventanas: out.length, gamma: GAMMA, halfSpreadBps: HALF_SPREAD_BPS,
      resumen: {
        naive: sN, twap: sT, ac: sA,
        ahorroTwapBps: savTwap, ahorroAcBps: savAc,
        beatTwapPct: beatTwap, beatAcPct: beatAc,
        veredicto: rentable ? "RENTABLE como ejecutor (ahorro consistente)" : "NO SUPERA al naive",
      },
      ventanasMuestra: out.slice(-24),
    }
  })
