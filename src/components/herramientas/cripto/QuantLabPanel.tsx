// @ts-nocheck
import { useState, useEffect } from "react"
import { useServerFn } from "@tanstack/react-start"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { runMMInventory, runOptimalExecution, runMMHJB, runMMHJBMulti } from "@/lib/cripto/quant-lab.functions"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from "recharts"

function fmt(n: number|null|undefined, d=2){ if(n==null||!isFinite(n)) return "—"; return n.toFixed(d) }

export function QuantLabPanel(){
  const [tab,setTab]=useState("mm")
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">Quant Lab — metodologías HFT Labadie sobre futuros Binance <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">1m · Demo</span></h3>
        <p className="text-[11px] text-muted-foreground">Market-Making con control de inventario (Avellaneda-Stoikov/Fodra-Labadie) y Ejecución Óptima Almgren-Chriss vs TWAP vs naive. Port de metodologias/mm_inventory.py y optimal_execution.py. Nuevo: HJB Fodra-Labadie 1303.7177v2 (OU Δ + intensidad Poisson + MC — Binance/Yahoo).</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="mm" className="text-[11px]">MM Inventario</TabsTrigger>
          <TabsTrigger value="hjb" className="text-[11px]">Fodra-Labadie HJB</TabsTrigger>
          <TabsTrigger value="ejecucion" className="text-[11px]">Ejecución Óptima</TabsTrigger>
        </TabsList>
        <TabsContent value="mm" className="mt-3"><MMTab /></TabsContent>
        <TabsContent value="hjb" className="mt-3"><HJBTab /></TabsContent>
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

function histBins(paths: number[], bins=12){ if(!paths?.length) return []; const min=Math.min(...paths), max=Math.max(...paths); const w=(max-min)/bins||1; const c=Array.from({length:bins},(_,i)=>({bin: min+w*i, count:0, label: `${(min+w*i).toFixed(0)}`})); for(const v of paths){ const idx=Math.min(bins-1, Math.max(0, Math.floor((v-min)/w))); c[idx].count++; } return c; }
function HJBTab(){
  const [symbol,setSymbol]=useState("BTCUSDT")
  const [source,setSource]=useState<"binance"|"yahoo">("binance")
  const [data,setData]=useState<any>(null); const [loading,setLoading]=useState(false); const [err,setErr]=useState<string|null>(null)
  const fn=useServerFn(runMMHJB)
  const run=async()=>{ setLoading(true); setErr(null); try{ setData(await fn({data:{symbol, source, days:20}})) } catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{run()},[])
  return (<div className="space-y-3">
    <Card className="border-border/40 bg-background/30"><CardContent className="p-3 flex flex-wrap gap-3 items-end">
      <div className="flex flex-col gap-1"><Label className="text-[10px]">Fuente</Label><select value={source} onChange={e=>setSource(e.target.value as any)} className="h-7 rounded border bg-background px-2 text-xs"><option value="binance">Binance</option><option value="yahoo">Yahoo</option></select></div>
      <div className="flex flex-col gap-1"><Label className="text-[10px]">Símbolo</Label><Input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} className="h-7 text-xs w-36" placeholder="BTCUSDT o GGAL.BA" /></div>
      <Button onClick={run} disabled={loading} className="h-7 text-xs">{loading?"Calculando…":"Calcular HJB"}</Button>
    </CardContent></Card>
    {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
    {loading && <Skeleton className="h-40 w-full" />}
    {data && (<>
      <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Fodra-Labadie HJB — {data.symbol} ({data.source}) n={data.n} · OU {data.ouFit? `a=${fmt(data.ouFit.a,4)} µ=${fmt(data.ouFit.mu,1)} halfLife=${fmt(data.ouFit.halfLife,1)}d` : "martingala (no fiteable)"}</CardTitle></CardHeader><CardContent className="font-mono text-[11px] space-y-1">
        <div>q=0: ψ={fmt(data.quotes.flat.psiFee,4)} (ψ*={fmt(data.quotes.flat.psiStar,4)}+2α) · r*={fmt(data.quotes.flat.rStar,2)} · π̃={fmt(data.quotes.flat.piTilde,5)} · gain/spread {fmt(data.quotes.flat.gainPerSpread,4)} {data.quotes.flat.scalable?"· SCALPING":""}</div>
        <div>q=5: ψ={fmt(data.quotes.withInventory.psiFee,4)} r*={fmt(data.quotes.withInventory.rStar,2)} (tilde {fmt(data.quotes.withInventory.rStar - data.quotes.flat.rStar,2)})</div>
      </CardContent></Card>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Monte Carlo — martingala (Δ≡0)</CardTitle></CardHeader><CardContent className="font-mono text-[11px] space-y-0.5"><div>mean {fmt(data.mc.martingale.mean,2)}</div><div>VaR95 {fmt(data.mc.martingale.var95,2)}</div><div>Sharpe {fmt(data.mc.martingale.sharpe,2)}</div><div>skew {fmt(data.mc.martingale.skew,2)} kurt {fmt(data.mc.martingale.kurt,2)}</div></CardContent></Card>
        <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Monte Carlo — OU drift (Δ≠0)</CardTitle></CardHeader><CardContent className="font-mono text-[11px] space-y-0.5"><div>mean {fmt(data.mc.ouDrift.mean,2)}</div><div>VaR95 {fmt(data.mc.ouDrift.var95,2)}</div><div>Sharpe {fmt(data.mc.ouDrift.sharpe,2)}</div><div>skew {fmt(data.mc.ouDrift.skew,2)} kurt {fmt(data.mc.ouDrift.kurt,2)}</div></CardContent></Card>
      </div>
      {data.quotePath?.length ? <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Cotizaciones vs tiempo (mid/bid/ask — trayectoria real con inventario)</CardTitle></CardHeader><CardContent className="h-44"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.quotePath} margin={{top:5,right:5,left:0,bottom:0}}><CartesianGrid strokeDasharray="3 3" stroke="rgba(100,100,100,0.2)" /><XAxis dataKey="t" tick={{fontSize:9}} tickFormatter={(v:any)=> Number(v).toFixed(1)} /><YAxis tick={{fontSize:9}} domain={['auto','auto']} /><Tooltip /><Line type="monotone" dataKey="mid" stroke="#8884d8" dot={false} strokeWidth={1.2} /><Line type="monotone" dataKey="bid" stroke="#82ca9d" dot={false} strokeWidth={1} /><Line type="monotone" dataKey="ask" stroke="#ff7300" dot={false} strokeWidth={1} /></LineChart></ResponsiveContainer></CardContent></Card> : null}
      {data.mc?.pnlPaths?.length || data.mc?.martingalePaths?.length ? <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Hist PnL martingala</CardTitle></CardHeader><CardContent className="h-36"><ResponsiveContainer width="100%" height="100%"><BarChart data={histBins(data.mc.martingalePaths??[],12)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" tick={{fontSize:8}} /><YAxis tick={{fontSize:9}} /><Tooltip /><Bar dataKey="count" fill="#8884d8" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Hist PnL OU drift</CardTitle></CardHeader><CardContent className="h-36"><ResponsiveContainer width="100%" height="100%"><BarChart data={histBins(data.mc.pnlPaths??[],12)}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" tick={{fontSize:8}} /><YAxis tick={{fontSize:9}} /><Tooltip /><Bar dataKey="count" fill="#82ca9d" /></BarChart></ResponsiveContainer></CardContent></Card>
      </div> : null}
      {data.sensitivity?.length ? <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Sensibilidad ε×α (ψ_fee y r* con q=0)</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-[10px] font-mono"><thead className="text-muted-foreground"><tr><th>ε \ α</th>{data.sensitivity[0].row.map((c:any)=><th key={c.alpha}>α={c.alpha}</th>)}</tr></thead><tbody>{data.sensitivity.map((r:any)=><tr key={r.eps} className="border-t border-border/10"><td className="font-semibold">{r.eps}</td>{r.row.map((c:any)=><td key={c.alpha} className={c.psiFee<=0?"text-red-400":""}>ψ{c.psiFee.toFixed(2)} r{c.rStar.toFixed(1)}</td>)}</tr>)}</tbody></table></CardContent></Card> : null}
      <p className="text-[10px] text-muted-foreground">Paper §2-§4: δ±*=1/k±Δ, ψ*=2/k, π̃=ηz+νσ²τ; fee ψ_α*=ψ*+2α (gain constante); OU Δ=(µ−s)(1−e^(−aτ)). El OU drift aumenta PnL medio pero también colas.</p>
    </>)}
  </div>)
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
