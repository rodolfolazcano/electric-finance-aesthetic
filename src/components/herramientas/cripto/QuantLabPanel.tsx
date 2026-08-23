// @ts-nocheck
import { useState, useEffect } from "react"
import { useServerFn } from "@tanstack/react-start"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { runMMInventory, runOptimalExecution } from "@/lib/cripto/quant-lab.functions"

function fmt(n: number|null|undefined, d=2){ if(n==null||!isFinite(n)) return "—"; return n.toFixed(d) }

export function QuantLabPanel(){
  const [tab,setTab]=useState("mm")
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">Quant Lab — metodologías HFT Labadie sobre futuros Binance <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">1m · Demo</span></h3>
        <p className="text-[11px] text-muted-foreground">Market-Making con control de inventario (Avellaneda-Stoikov/Fodra-Labadie) y Ejecución Óptima Almgren-Chriss vs TWAP vs naive. Port de metodologias/mm_inventory.py y optimal_execution.py.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="mm" className="text-[11px]">MM Inventario</TabsTrigger>
          <TabsTrigger value="ejecucion" className="text-[11px]">Ejecución Óptima</TabsTrigger>
        </TabsList>
        <TabsContent value="mm" className="mt-3"><MMTab /></TabsContent>
        <TabsContent value="ejecucion" className="mt-3"><EjecucionTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function MMTab(){
  const [symbol,setSymbol]=useState("BTCUSDT")
  const [days,setDays]=useState(10)
  const [grid,setGrid]=useState(false)
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const fn=useServerFn(runMMInventory)
  const run=async()=>{ setLoading(true); setErr(null); try{ setData(await fn({data:{symbol,days,grid}})) } catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{run()},[])
  const m = data ? (data.modo==="grid" ? data.oos : data.base) : null
  return (
    <div className="space-y-3">
      <Card className="border-border/40 bg-background/30"><CardContent className="p-3 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Símbolo</Label><Input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} className="h-7 text-xs w-28" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Días 1m</Label><select value={days} onChange={e=>setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs"><option value={5}>5d</option><option value={10}>10d</option><option value={20}>20d</option><option value={30}>30d</option></select></div>
        <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)} /> Grid 64 combos (train 60% → OOS 40%)</label>
        <Button onClick={run} disabled={loading} className="h-7 text-xs">{loading?"Simulando…":"Simular MM"}</Button>
      </CardContent></Card>
      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}
      {data && m && (
        <>
          <div className={`rounded border p-3 text-xs ${m.pnlUsdt>0?"bg-emerald-500/10 border-emerald-500/20":"bg-red-500/10 border-red-500/20"}`}>
            VEREDICTO: <b>{m.pnlUsdt>0?"RENTABLE":"NO RENTABLE"}</b> — PnL {fmt(m.pnlUsdt,2)} USDT en {data.velas} velas 1m
            {data.modo==="grid" && <> · params óptimos train: ψ_min {data.bestParams.psiMinBps}bps · skew {data.bestParams.invSkew} · Δ {data.bestParams.deltaCoef} · maxQ {data.bestParams.maxInventory}</>}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">{data.modo==="grid"?"OOS Test (40%)":"Resultado base"}</CardTitle></CardHeader><CardContent className="font-mono text-[11px] space-y-0.5">
              <div>PnL total: {fmt(m.pnlUsdt,+2)} USDT</div>
              <div>Fills: {m.fills} (buy {m.nBuy} / sell {m.nSell})</div>
              <div>PnL/fill: {fmt(m.pnlPerFillUsdt,4)} USDT ({fmt(m.qtyUsdt? (m.pnlPerFillUsdt/(data.bestParams?.qtyUsdt??500))*1e4 : 0,3)} bps)</div>
              <div>Sharpe(1m, anualizado): {fmt(m.sharpeMin,2)}</div>
              <div>MaxDD: {fmt(m.maxDdUsdt,2)} USDT</div>
              <div>Inventario final: {m.finalQ} lotes · bloqueos tope: {m.blocked}</div>
            </CardContent></Card>
            <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Top grid (TRAIN por PnL)</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-[10px] font-mono"><thead className="text-muted-foreground"><tr><th>ψ_min</th><th>skew</th><th>Δ</th><th>maxQ</th><th>PnL USDT</th><th>fills</th><th>Sharpe</th></tr></thead><tbody>{(data.top5||[]).map((r:any,i:number)=>(<tr key={i} className="border-t border-border/10"><td>{r.psi}</td><td>{r.skew}</td><td>{r.dc}</td><td>{r.maxQ}</td><td className={r.pnl>=0?"text-emerald-400":"text-red-400"}>{fmt(r.pnl,2)}</td><td>{r.fills}</td><td>{fmt(r.sharpe,2)}</td></tr>))}{!data.top5 && <tr><td colSpan={7} className="text-muted-foreground">Modo base: sin grid</td></tr>}</tbody></table></CardContent></Card>
          </div>
          <p className="text-[10px] text-muted-foreground">Modelo: bid=r−ψ/2, ask=r+ψ/2 con r=S(1+Δ)(1−skew·q·σ²), fills si low≤bid / high≥ask, fee maker 2bps. La rentabilidad esperada es spread capturado menos selección adversa; si el fee sube, el spread óptimo crece.</p>
        </>
      )}
    </div>
  )
}

function EjecucionTab(){
  const [symbol,setSymbol]=useState("BTCUSDT")
  const [days,setDays]=useState(20)
  const [horizon,setHorizon]=useState(60)
  const [notional,setNotional]=useState(100000)
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const fn=useServerFn(runOptimalExecution)
  const run=async()=>{ setLoading(true); setErr(null); try{ setData(await fn({data:{symbol,days,horizonMin:horizon,notionalUsdt:notional}})) } catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{run()},[])
  const r=data?.resumen
  return (
    <div className="space-y-3">
      <Card className="border-border/40 bg-background/30"><CardContent className="p-3 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Símbolo</Label><Input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} className="h-7 text-xs w-28" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Días 1m</Label><select value={days} onChange={e=>setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs"><option value={10}>10d</option><option value={20}>20d</option><option value={30}>30d</option></select></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Horizonte (min)</Label><Input type="number" value={horizon} onChange={e=>setHorizon(parseInt(e.target.value)||60)} className="h-7 text-xs w-24" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Notional USDT</Label><Input type="number" value={notional} onChange={e=>setNotional(parseFloat(e.target.value)||100000)} className="h-7 text-xs w-32" /></div>
        <Button onClick={run} disabled={loading} className="h-7 text-xs">{loading?"Calculando…":"Comparar ejecutores"}</Button>
      </CardContent></Card>
      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}
      {data && r && (
        <>
          <div className={`rounded border p-3 text-xs ${r.veredicto.startsWith("RENTABLE")?"bg-emerald-500/10 border-emerald-500/20":"bg-red-500/10 border-red-500/20"}`}>{r.veredicto}</div>
          <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Implementation Shortfall (COMPRA de {fmt(data.notionalUsdt,0)} USDT en {data.horizonMin}min) — menor es mejor, en bps</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-[11px] font-mono"><thead className="text-muted-foreground"><tr><th className="text-left">Ejecutor</th><th>IS medio</th><th>std</th><th>J(λ=0.5)</th><th>Ahorro vs naive</th><th>Gana a naive</th></tr></thead><tbody>
            <tr className="border-t border-border/10"><td>NAIVE (1 market order)</td><td>{fmt(r.naive.mean,3)}</td><td>{fmt(r.naive.std,3)}</td><td>{fmt(r.naive.j,3)}</td><td>—</td><td>—</td></tr>
            <tr className="border-t border-border/10"><td>TWAP</td><td>{fmt(r.twap.mean,3)}</td><td>{fmt(r.twap.std,3)}</td><td>{fmt(r.twap.j,3)}</td><td className={r.ahorroTwapBps>0?"text-emerald-400":""}>{fmt(r.ahorroTwapBps,3)} bps</td><td>{fmt(r.beatTwapPct,0)}%</td></tr>
            <tr className="border-t border-border/10"><td>ALMGREN-CHRISS</td><td>{fmt(r.ac.mean,3)}</td><td>{fmt(r.ac.std,3)}</td><td>{fmt(r.ac.j,3)}</td><td className={r.ahorroAcBps>0?"text-emerald-400":""}>{fmt(r.ahorroAcBps,3)} bps</td><td>{fmt(r.beatAcPct,0)}%</td></tr>
          </tbody></table></CardContent></Card>
          <p className="text-[10px] text-muted-foreground">Impacto h(v)=σ·√steps·(v/V)^γ (γ=0.5 empírico) · spread {data.halfSpreadBps} bps · κ elegido por ventana del grid (0.005–0.1). El paper: la ejecución renta minimizando impacto+riesgo, no genera alpha direccional.</p>
        </>
      )}
    </div>
  )
}
