// @ts-nocheck
import { useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { scanPairsCrypto, analyzePairCrypto, optimizePairCrypto } from "@/lib/cripto/pairs-crypto.functions"

function fmt(n: number|null|undefined, d=2){ if(n==null||!isFinite(n)) return "—"; return n.toFixed(d) }

export function PairsCryptoPanel(){
  const [tab,setTab]=useState("scan")
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold">Pairs Trading Crypto — Arbitraje Estadístico sobre perps Binance</h3>
        <p className="text-[11px] text-muted-foreground">Motor unificado (port de pairs_trading/engine.py): hedge ratio <code>rolling_ratio_mean</code> | <code>cointegration_static</code> (Engle-Granger: OLS + ADF residuos) × salidas <code>zscore_band</code> | <code>mean_cross_with_stop</code>. Validación IS/OOS 70/30.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="scan" className="text-[11px]">Escáner cointegración</TabsTrigger>
          <TabsTrigger value="par" className="text-[11px]">Analizar par</TabsTrigger>
          <TabsTrigger value="opt" className="text-[11px]">Optimizar par</TabsTrigger>
        </TabsList>
        <TabsContent value="scan" className="mt-3"><ScanTab /></TabsContent>
        <TabsContent value="par" className="mt-3"><ParTab /></TabsContent>
        <TabsContent value="opt" className="mt-3"><OptTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function ScanTab(){
  const [topN,setTopN]=useState(15)
  const [interval,setInterval]=useState("1h")
  const [days,setDays]=useState(30)
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const fn=useServerFn(scanPairsCrypto)
  const run=async()=>{ setLoading(true); setErr(null); try{ setData(await fn({data:{topN,interval,days}})) } catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  return (
    <div className="space-y-3">
      <Card className="border-border/40 bg-background/30"><CardContent className="p-3 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Top perps por volumen</Label><select value={topN} onChange={e=>setTopN(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs"><option value={10}>10</option><option value={15}>15</option><option value={20}>20</option></select></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Intervalo</Label><select value={interval} onChange={e=>setInterval(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs"><option value="15m">15m</option><option value="1h">1h</option></select></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Días</Label><select value={days} onChange={e=>setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs"><option value={14}>14d</option><option value={30}>30d</option></select></div>
        <Button onClick={run} disabled={loading} className="h-7 text-xs">{loading?"Escaneando pares…":"Escanear"}</Button>
      </CardContent></Card>
      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-64 w-full" />}
      {data && (
        <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Top cointegrados — {data.scanned} símbolos, {data.pairs} pares testeados ({data.interval}, {data.days}d)</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-[10px] font-mono"><thead className="text-muted-foreground"><tr><th>Par</th><th>Corr retornos</th><th>ADF stat</th><th>p-value EG</th><th>Beta hedge</th><th>Cointegrado 5%</th></tr></thead><tbody>{data.top.map((r:any,i:number)=>(<tr key={i} className="border-t border-border/10"><td>{r.a}/{r.b}</td><td>{fmt(r.corr,3)}</td><td>{fmt(r.adfStat,2)}</td><td className={r.pValue<0.05?"text-emerald-400":"text-muted-foreground"}>{fmt(r.pValue,4)}</td><td>{fmt(r.beta,4)}</td><td>{r.pValue<0.05?"✅":"—"}</td></tr>))}</tbody></table><p className="text-[10px] text-muted-foreground mt-1">Usar la tab "Analizar par" para backtest y validación OOS del par elegido.</p></CardContent></Card>
      )}
    </div>
  )
}

function ParTab(){
  const [a,setA]=useState("BTCUSDT")
  const [b,setB]=useState("ETHUSDT")
  const [interval,setInterval]=useState("1h")
  const [days,setDays]=useState(60)
  const [method,setMethod]=useState("rolling_ratio_mean")
  const [exitM,setExitM]=useState("zscore_band")
  const [entryZ,setEntryZ]=useState(2.0)
  const [exitZ,setExitZ]=useState(0.5)
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const fn=useServerFn(analyzePairCrypto)
  const run=async()=>{ setLoading(true); setErr(null); try{ setData(await fn({data:{simboloA:a,simboloB:b,interval,days,hedgeRatioMethod:method,exitMethod:exitM,entryZscore:entryZ,exitZscore:exitZ}})) } catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  useEffect(()=>{run()},[])
  return (
    <div className="space-y-3">
      <Card className="border-border/40 bg-background/30"><CardContent className="p-3 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Par A</Label><Input value={a} onChange={e=>setA(e.target.value.toUpperCase())} className="h-7 text-xs w-28" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Par B</Label><Input value={b} onChange={e=>setB(e.target.value.toUpperCase())} className="h-7 text-xs w-28" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">TF</Label><select value={interval} onChange={e=>setInterval(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs"><option value="15m">15m</option><option value="1h">1h</option></select></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Días</Label><select value={days} onChange={e=>setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs"><option value={30}>30d</option><option value={60}>60d</option><option value={90}>90d</option></select></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Hedge ratio</Label><select value={method} onChange={e=>setMethod(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs"><option value="rolling_ratio_mean">rolling_ratio_mean</option><option value="cointegration_static">cointegration_static</option></select></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Salida</Label><select value={exitM} onChange={e=>setExitM(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs"><option value="zscore_band">zscore_band</option><option value="mean_cross_with_stop">mean_cross+stop</option></select></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Entry z</Label><Input type="number" step={0.1} value={entryZ} onChange={e=>setEntryZ(parseFloat(e.target.value)||2)} className="h-7 text-xs w-20" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Exit z</Label><Input type="number" step={0.1} value={exitZ} onChange={e=>setExitZ(parseFloat(e.target.value)||0.5)} className="h-7 text-xs w-20" /></div>
        <Button onClick={run} disabled={loading} className="h-7 text-xs">{loading?"Analizando…":"Analizar"}</Button>
      </CardContent></Card>
      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}
      {data && (
        <>
          <div className={`rounded border p-3 text-xs ${data.cointegrado?"bg-emerald-500/10 border-emerald-500/20":"bg-red-500/10 border-red-500/20"}`}>
            {data.par}: ADF {fmt(data.adfStat,2)} · p-value {fmt(data.pValue,4)} → {data.cointegrado?"COINTEGRADO 5%":"NO cointegrado"} · β hedge {fmt(data.beta,4)} ({data.metodo})
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Backtest completo</CardTitle></CardHeader><CardContent className="font-mono text-[11px] space-y-0.5">
              <div>Trades: {data.metricas.trades}</div>
              <div>WR: {fmt(data.metricas.winRate,1)}%</div>
              <div>PF: {fmt(data.metricas.profitFactor,2)}</div>
              <div>Expectancy: {fmt(data.metricas.expectancyPct,4)}%</div>
              <div>PnL total ($1000): {fmt(data.metricas.totalPnlUsd,2)} USD</div>
              <div>MaxDD: {fmt(data.metricas.maxDrawdownUsd,2)} USD</div>
            </CardContent></Card>
            <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">In-Sample 70%</CardTitle></CardHeader><CardContent className="font-mono text-[11px] space-y-0.5">
              <div>Trades: {data.is.trades}</div>
              <div>WR: {fmt(data.is.winRate,1)}%</div>
              <div>Exp: {fmt(data.is.expectancyPct,4)}%</div>
            </CardContent></Card>
            <Card className={`border-border/40 ${data.robusto?"bg-emerald-500/5":"bg-red-500/5"}`}><CardHeader className="py-2"><CardTitle className="text-[12px]">Out-of-Sample 30% {data.robusto?"✅":"⚠️"}</CardTitle></CardHeader><CardContent className="font-mono text-[11px] space-y-0.5">
              <div>Trades: {data.oos.trades}</div>
              <div>WR: {fmt(data.oos.winRate,1)}%</div>
              <div>Exp: {fmt(data.oos.expectancyPct,4)}%</div>
              {!data.robusto && <div className="text-red-400 text-[10px] pt-1">La expectancia NO se sostiene fuera de muestra.</div>}
            </CardContent></Card>
          </div>
          <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[11px]">Últimos trades</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-[10px] font-mono"><thead className="text-muted-foreground"><tr><th>Lado</th><th>Z entry</th><th>Z exit</th><th>Motivo</th><th>PnL %</th></tr></thead><tbody>{data.trades.slice().reverse().map((t:any,i:number)=>(<tr key={i} className="border-t border-border/10"><td className={t.side==="LONG"?"text-emerald-400":"text-red-400"}>{t.side}</td><td>{fmt(t.zEntry,2)}</td><td>{fmt(t.zExit,2)}</td><td>{t.exitReason}</td><td className={t.pnlPct>=0?"text-emerald-400":"text-red-400"}>{fmt(t.pnlPct*100,3)}%</td></tr>))}</tbody></table></CardContent></Card>
        </>
      )}
    </div>
  )
}

function OptTab(){
  const [a,setA]=useState("BTCUSDT")
  const [b,setB]=useState("ETHUSDT")
  const [interval,setInterval]=useState("1h")
  const [days,setDays]=useState(60)
  const [method,setMethod]=useState("rolling_ratio_mean")
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const fn=useServerFn(optimizePairCrypto)
  const run=async()=>{ setLoading(true); setErr(null); try{ setData(await fn({data:{simboloA:a,simboloB:b,interval,days,hedgeRatioMethod:method}})) } catch(e:any){ setErr(e.message)} finally{ setLoading(false)} }
  return (
    <div className="space-y-3">
      <Card className="border-border/40 bg-background/30"><CardContent className="p-3 flex flex-wrap gap-3 items-end">
        <Input value={a} onChange={e=>setA(e.target.value.toUpperCase())} className="h-7 text-xs w-28" />
        <span className="text-muted-foreground text-xs">/</span>
        <Input value={b} onChange={e=>setB(e.target.value.toUpperCase())} className="h-7 text-xs w-28" />
        <select value={interval} onChange={e=>setInterval(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs"><option value="15m">15m</option><option value="1h">1h</option></select>
        <select value={days} onChange={e=>setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs"><option value={60}>60d</option><option value={90}>90d</option></select>
        <select value={method} onChange={e=>setMethod(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs"><option value="rolling_ratio_mean">rolling_ratio_mean</option><option value="cointegration_static">cointegration_static</option></select>
        <Button onClick={run} disabled={loading} className="h-7 text-xs">{loading?"Grid en curso…":"Optimizar grid 18 combos"}</Button>
      </CardContent></Card>
      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-48 w-full" />}
      {data && (
        <>
          {data.mejor && (
            <div className="rounded border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-400">
              Mejor combo por expectancy OOS: entry z {data.mejor.entryZscore} · exit z {data.mejor.exitZscore} · {data.mejor.exitMethod} → OOS exp {fmt(data.mejor.oosExp,4)}% ({data.mejor.oosTrades} trades, WR {fmt(data.mejor.oosWr,1)}%)
            </div>
          )}
          <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[11px]">Grid ordenado por expectancy OOS ({data.combos} combos evaluados)</CardTitle></CardHeader><CardContent className="overflow-x-auto max-h-[420px]"><table className="w-full text-[10px] font-mono"><thead className="text-muted-foreground sticky top-0 bg-background"><tr><th>Entry z</th><th>Exit z</th><th>Salida</th><th>IS T</th><th>IS WR%</th><th>IS Exp%</th><th>OOS T</th><th>OOS WR%</th><th>OOS Exp%</th></tr></thead><tbody>{data.mejores.map((g:any,i:number)=>(<tr key={i} className="border-t border-border/10"><td>{g.entryZscore}</td><td>{g.exitZscore}</td><td>{g.exitMethod==="zscore_band"?"band":"cross+stop"}</td><td>{g.isTrades}</td><td>{fmt(g.isWr,1)}</td><td>{fmt(g.isExp,3)}</td><td>{g.oosTrades}</td><td className={g.oosWr>=50?"text-emerald-400":""}>{fmt(g.oosWr,1)}</td><td className={g.oosExp>=0?"text-emerald-400":"text-red-400"}>{fmt(g.oosExp,3)}</td></tr>))}</tbody></table></CardContent></Card>
          <p className="text-[10px] text-muted-foreground">Anti-overfitting: se optimiza en el primer 70% y la métrica mostrada es out-of-sample del 30% final. Si el OOS se derrumba respecto al IS, descartá el combo.</p>
        </>
      )}
    </div>
  )
}
