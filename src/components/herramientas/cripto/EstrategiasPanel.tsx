// @ts-nocheck
import { useState, useEffect, useRef, useMemo } from "react"
import { useServerFn } from "@tanstack/react-start"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import { runBacktest, runAnalyzer, checkLiveSignal } from "@/lib/cripto/backtest.functions"
import { notifySignal, sendTelegram } from "@/lib/notify.functions"
import { LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ScatterChart, Scatter } from "recharts"

function fmt(n: number|null|undefined, d=2) { if(n==null||!isFinite(n)) return "—"; return n.toFixed(d) }

export function EstrategiasPanel() {
  const [tab,setTab]=useState("backtest")
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-[15px] font-semibold flex items-center gap-2">Estrategias Cripto — BB+RSI Scalping 5m <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Demo Futures</span></h3>
        <p className="text-[11px] text-muted-foreground">LONG: close &lt; BB_lower + RSI≤30 · SHORT: close &gt; BB_upper + RSI 70-80 · TP 1% · DCA 3×0.5% dinámico · SL 10% cuenta x10 (igual que bb_rsi_scalper/engine.py)</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="backtest" className="text-[11px]">Backtest</TabsTrigger>
          <TabsTrigger value="analisis" className="text-[11px]">Análisis</TabsTrigger>
          <TabsTrigger value="bot" className="text-[11px]">Bot Vivo + Señales</TabsTrigger>
        </TabsList>
        <TabsContent value="backtest" className="mt-3"><BacktestTab /></TabsContent>
        <TabsContent value="analisis" className="mt-3"><AnalisisTab /></TabsContent>
        <TabsContent value="bot" className="mt-3"><BotTab /></TabsContent>
      </Tabs>
    </div>
  )
}

function BacktestTab(){
  const [symbol,setSymbol]=useState("BTCUSDT")
  const [days,setDays]=useState(60)
  const [tp,setTp]=useState(1.0)
  const [dca,setDca]=useState(3)
  const [step,setStep]=useState(0.5)
  const [dyn,setDyn]=useState(false)
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(false)
  const [err,setErr]=useState<string|null>(null)
  const fn=useServerFn(runBacktest)
  const run=async()=>{
    setLoading(true); setErr(null)
    try{ const r=await fn({ data:{ symbol, days, tpPct: tp, dcaLevels: dca, dcaStepPct: step, rsiDynamic: dyn } as any }); setData(r) } catch(e:any){ setErr(e.message) } finally{ setLoading(false) }
  }
  useEffect(()=>{ run() },[])
  const m=data?.metrics
  return (
    <div className="space-y-3">
      <Card className="border-border/40 bg-background/30"><CardContent className="p-3 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Símbolo</Label><Input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} className="h-7 text-xs w-28" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Días</Label><select value={days} onChange={e=>setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs"><option value={30}>30d</option><option value={60}>60d</option><option value={90}>90d</option></select></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">TP %</Label><Input type="number" step={0.1} value={tp} onChange={e=>setTp(parseFloat(e.target.value))} className="h-7 text-xs w-20" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">DCA niveles</Label><Input type="number" value={dca} onChange={e=>setDca(parseInt(e.target.value))} className="h-7 text-xs w-20" /></div>
        <div className="flex flex-col gap-1"><Label className="text-[10px]">DCA step %</Label><Input type="number" step={0.1} value={step} onChange={e=>setStep(parseFloat(e.target.value))} className="h-7 text-xs w-20" /></div>
        <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={dyn} onChange={e=>setDyn(e.target.checked)} /> RSI dinámico</label>
        <Button onClick={run} disabled={loading} className="h-7 text-xs">{loading?"Calculando…":"Ejecutar Backtest"}</Button>
        {data && <span className="text-[10px] text-muted-foreground">{data.klinesCount} velas 5m</span>}
      </CardContent></Card>
      {err && <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">{err}</div>}
      {loading && <Skeleton className="h-64 w-full" />}
      {data && m && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            {/* Equity Notional */}
            <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Equity Notional</CardTitle></CardHeader><CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.equityNotional}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="idx" tick={{fontSize:9}} /><YAxis tick={{fontSize:9}} domain={["auto","auto"]} /><Tooltip /><Area type="monotone" dataKey="value" stroke="#2ebd85" fill="#2ebd85" fillOpacity={0.1} strokeWidth={1.5} /></AreaChart></ResponsiveContainer>
            </CardContent></Card>
            <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Equity Cuenta (con leverage x10)</CardTitle></CardHeader><CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%"><AreaChart data={data.equityCuenta}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="idx" tick={{fontSize:9}} /><YAxis tick={{fontSize:9}} domain={["auto","auto"]} /><Tooltip /><Area type="monotone" dataKey="value" stroke="#f0b90b" fill="#f0b90b" fillOpacity={0.1} strokeWidth={1.5} /></AreaChart></ResponsiveContainer>
            </CardContent></Card>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Distribución PnL notional %</CardTitle></CardHeader><CardContent className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%"><BarChart data={(()=>{
                const buckets: Record<string, number> = {}; for(const v of data.distribution){ const k=(Math.round(v*10)/10).toFixed(1); buckets[k]=(buckets[k]||0)+1 } return Object.entries(buckets).map(([k,c])=>({ bucket: parseFloat(k), count: c })).sort((a,b)=>a.bucket-b.bucket)
              })()}><CartesianGrid strokeDasharray="3 3" opacity={0.15} /><XAxis dataKey="bucket" tick={{fontSize:9}} /><YAxis tick={{fontSize:9}} /><Tooltip /><Bar dataKey="count" fill="#4a90e2" /></BarChart></ResponsiveContainer>
            </CardContent></Card>
            <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Métricas</CardTitle></CardHeader><CardContent className="flex items-center justify-center h-[220px]">
              <div className="rounded-lg bg-[#1e2329] text-white font-mono text-[11px] leading-tight p-3 border border-white/10">
                <div>Trades: {m.notional.trades}</div>
                <div>WR: {fmt(m.notional.winRate,1)}%</div>
                <div>PF: {fmt(m.notional.profitFactor,2)}</div>
                <div>Exp: {fmt(m.notional.expectancyPct,3)}%</div>
                <div>Ret: {fmt(m.notional.returnPct,2)}%</div>
                <div>MaxDD: {fmt(m.notional.maxDrawdownPct,2)}%</div>
                <div className="text-[9px] text-white/50 mt-1">Cuenta Ret {fmt(m.cuenta.returnPct,2)}% PF {fmt(m.cuenta.profitFactor,2)}</div>
              </div>
            </CardContent></Card>
          </div>
          <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[11px]">Detalle trades (primeros 30)</CardTitle></CardHeader><CardContent className="overflow-x-auto"><table className="w-full text-[10px] font-mono"><thead className="text-muted-foreground"><tr><th className="text-left">#</th><th>Lado</th><th>Entrada</th><th>Salida</th><th>PnL</th><th>Cuenta</th><th>DCA</th><th>Motivo</th></tr></thead><tbody>{data.trades.slice(0,30).map((t:any,i:number)=>(<tr key={i} className="border-t border-border/10"><td>{i+1}</td><td className={t.side==="LONG"?"text-emerald-400":"text-red-400"}>{t.side}</td><td>{new Date(t.entryTime).toLocaleString("es-AR")}</td><td>{new Date(t.exitTime).toLocaleString("es-AR")}</td><td>{fmt(t.pnlPct*100,2)}%</td><td>{fmt(t.pnlAccountPct*100,2)}%</td><td>{t.nDca}</td><td>{t.reason}</td></tr>))}</tbody></table>{data.trades.length>30 && <p className="text-[10px] text-muted-foreground mt-1">…y {data.trades.length-30} más</p>}</CardContent></Card>
        </>
      )}
    </div>
  )
}

function AnalisisTab(){
  const [symbol,setSymbol]=useState("BTCUSDT")
  const [days,setDays]=useState(60)
  const [data,setData]=useState<any>(null)
  const [loading,setLoading]=useState(false)
  const fn=useServerFn(runAnalyzer)
  const run=async()=>{ setLoading(true); try{ const r=await fn({ data:{ symbol, days } as any }); setData(r)} catch{} finally{ setLoading(false)}}
  useEffect(()=>{run()},[])
  if(loading) return <Skeleton className="h-96 w-full" />
  if(!data) return <Button onClick={run} className="h-7 text-xs">Cargar análisis</Button>
  return (
    <div className="space-y-3">
      <div className="flex gap-2 items-end">
        <div className="flex flex-col gap-1"><Label className="text-[10px]">Símbolo</Label><Input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} className="h-7 text-xs w-28" /></div>
        <select value={days} onChange={e=>setDays(parseInt(e.target.value))} className="h-7 rounded border bg-background px-2 text-xs"><option value={30}>30d</option><option value={60}>60d</option></select>
        <Button onClick={run} className="h-7 text-xs">Actualizar</Button>
        <span className="text-[10px] text-muted-foreground">POC ${fmt(data.poc,0)}</span>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Card className="border-border/40"><CardHeader className="py-2"><CardTitle className="text-[11px]">Distribución RSI</CardTitle></CardHeader><CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.rsiHist}><CartesianGrid opacity={0.15} /><XAxis dataKey="rsi" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="count" fill="#60a5fa" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card className="border-border/40"><CardHeader className="py-2"><CardTitle className="text-[11px]">Precio + BB 20/2.0 — POC ${fmt(data.poc,0)} rojo</CardTitle></CardHeader><CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.priceBB.slice(-400)}><CartesianGrid opacity={0.15} /><XAxis dataKey="close" hide /><YAxis domain={["auto","auto"]} tick={{fontSize:8}} /><Tooltip /><Line type="monotone" dataKey="close" stroke="#10b981" dot={false} strokeWidth={1} /><Line type="monotone" dataKey="upper" stroke="#f43f5e" dot={false} strokeWidth={0.7} opacity={0.6} /><Line type="monotone" dataKey="lower" stroke="#f43f5e" dot={false} strokeWidth={0.7} opacity={0.6} /></LineChart></ResponsiveContainer></CardContent></Card>
        <Card className="border-border/40"><CardHeader className="py-2"><CardTitle className="text-[11px]">Perfil precio (50 bins) — toques por nivel</CardTitle></CardHeader><CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.histPerfil} layout="vertical"><CartesianGrid opacity={0.15} /><XAxis type="number" tick={{fontSize:8}} /><YAxis dataKey="bin" type="number" domain={["auto","auto"]} tick={{fontSize:7}} tickFormatter={v=>fmt(v,0)} width={45} /><Tooltip /><Bar dataKey="count" fill="#fbbf24" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card className="border-border/40"><CardHeader className="py-2"><CardTitle className="text-[11px]">Min entre RSI 70-80 (señal SHORT)</CardTitle></CardHeader><CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.gapHist.map((c:number,i:number)=>({ bucket:i*150, count:c }))}><CartesianGrid opacity={0.15} /><XAxis dataKey="bucket" tick={{fontSize:8}} /><YAxis tick={{fontSize:8}} /><Tooltip /><Bar dataKey="count" fill="#f87171" /></BarChart></ResponsiveContainer></CardContent></Card>
        <Card className="border-border/40"><CardHeader className="py-2"><CardTitle className="text-[11px]">RSI + percentiles rodantes (RSI dinámico)</CardTitle></CardHeader><CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.rsiDyn}><CartesianGrid opacity={0.15} /><XAxis dataKey="idx" tick={{fontSize:8}} /><YAxis domain={[0,100]} tick={{fontSize:8}} /><Tooltip /><Line type="monotone" dataKey="rsi" stroke="#93c5fd" dot={false} strokeWidth={1} /><Line type="monotone" dataKey="p80" stroke="#ef4444" dot={false} strokeWidth={1} /><Line type="monotone" dataKey="p20" stroke="#22c55e" dot={false} strokeWidth={1} /></LineChart></ResponsiveContainer></CardContent></Card>
        <Card className="border-border/40"><CardHeader className="py-2"><CardTitle className="text-[11px]">RSI vs Volatilidad (color ATR)</CardTitle></CardHeader><CardContent className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid opacity={0.15} /><XAxis dataKey="bbWidth" type="number" tick={{fontSize:8}} name="BB width %" /><YAxis dataKey="rsi" type="number" domain={[0,100]} tick={{fontSize:8}} /><Tooltip /><Scatter data={data.scatter.slice(0,3000)} fill="#6366f1" /></ScatterChart></ResponsiveContainer></CardContent></Card>
      </div>
    </div>
  )
}

function BotTab(){
  const [symbol,setSymbol]=useState("BTCUSDT")
  const [interval,setInterval]=useState("5m")
  const [dyn,setDyn]=useState(false)
  const [running,setRunning]=useState(false)
  const [log,setLog]=useState<string[]>([])
  const [lastSig,setLastSig]=useState<any>(null)
  const [tgToken,setTgToken]=useState<string>(()=>typeof window!=="undefined"?localStorage.getItem("tg_token")||"":"")
  const [tgChat,setTgChat]=useState<string>(()=>typeof window!=="undefined"?localStorage.getItem("tg_chat")||"":"")
  const checkFn=useServerFn(checkLiveSignal)
  const notifyFn=useServerFn(notifySignal)
  const tgFn=useServerFn(sendTelegram)
  const intervalRef=useRef<any>(null)
  const lastSigRef=useRef<string|null>(null)
  const pushLog=(m:string)=> setLog(prev=>[...prev.slice(-80), `[${new Date().toLocaleTimeString("es-AR")}] ${m}`])
  const start=()=>{
    if(running) return
    setRunning(true); pushLog(`Bot iniciado ${symbol} ${interval} ${dyn?"RSI dinámico":"RSI fijo 30/70"}`)
    const tick=async()=>{
      try{
        const r=await checkFn({ data:{ symbol, interval, rsiDynamic: dyn } as any })
        const sig=r?.signal
        const key=sig?`${sig}-${r.price.toFixed(1)}`:null
        setLastSig(r)
        if(sig && key!==lastSigRef.current){
          lastSigRef.current=key
          const motivo=sig==="LONG"?"close < BB_lower + RSI sobreventa":"close > BB_upper + RSI 70-80"
          pushLog(`🔔 SEÑAL ${sig} @ ${r.price.toFixed(2)} RSI ${r.rsi?.toFixed(1)} TP ${r.tp?.toFixed(2)} SL ${r.sl?.toFixed(2)}`)
          if(tgToken && tgChat){
            try{ await notifyFn({ data:{ tipo: sig, symbol, precio: r.price, rsi: r.rsi ?? 50, tp: r.tp ?? null, sl: r.sl ?? null, motivo, token: tgToken, chatId: tgChat } as any }); pushLog("→ Telegram enviado ✅") } catch(e:any){ pushLog("→ Telegram error: "+e.message) }
          } else {
            pushLog("→ Sin Telegram configurado (guardá token/chat abajo para enviar)")
          }
        } else if(!sig) {
          pushLog(`HOLD precio ${r.price.toFixed(2)} RSI ${r.rsi?.toFixed(1)} BB [${r.bbLo?.toFixed(0)} - ${r.bbUp?.toFixed(0)}]`)
        }
      } catch(e:any){ pushLog("Error: "+e.message) }
    }
    tick()
    intervalRef.current=setInterval(tick, 30000)
  }
  const stop=()=>{ if(intervalRef.current) clearInterval(intervalRef.current); intervalRef.current=null; setRunning(false); pushLog("Bot detenido") }
  useEffect(()=>()=>{ if(intervalRef.current) clearInterval(intervalRef.current) },[])
  const saveTg=()=>{ localStorage.setItem("tg_token", tgToken); localStorage.setItem("tg_chat", tgChat); pushLog("Telegram guardado") }
  const testTg=async()=>{ try{ await tgFn({ data:{ text: `✅ Test bot BB+RSI ${symbol} @ ${new Date().toLocaleString("es-AR")}`, token: tgToken, chatId: tgChat } as any }); pushLog("Test Telegram enviado ✅") } catch(e:any){ pushLog("Test TG error: "+e.message)} }
  return (
    <div className="space-y-3">
      <Card className="border-border/40 bg-background/30"><CardHeader className="py-2"><CardTitle className="text-[12px]">Bot vivo — Demo Futures (poll cada 30s)</CardTitle></CardHeader><CardContent className="space-y-3">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1"><Label className="text-[10px]">Símbolo</Label><Input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} className="h-7 text-xs w-28" /></div>
          <div className="flex flex-col gap-1"><Label className="text-[10px]">Intervalo</Label><select value={interval} onChange={e=>setInterval(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs"><option value="1m">1m</option><option value="5m">5m</option><option value="15m">15m</option></select></div>
          <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={dyn} onChange={e=>setDyn(e.target.checked)} /> RSI dinámico</label>
          {!running ? <Button onClick={start} className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700">▶ Iniciar bot</Button> : <Button onClick={stop} variant="destructive" className="h-7 text-xs">■ Detener</Button>}
          <span className={`text-[11px] px-2 py-1 rounded ${running?"bg-emerald-500/15 text-emerald-400 border border-emerald-500/20":"bg-muted/30 text-muted-foreground"}`}>{running?"● Vivo":"○ Detenido"}</span>
        </div>
        {lastSig && <div className={`rounded border p-2 text-xs ${lastSig.signal ? (lastSig.signal==="LONG"?"bg-emerald-500/10 border-emerald-500/20 text-emerald-400":"bg-red-500/10 border-red-500/20 text-red-400"):"bg-muted/10 border-border/40 text-muted-foreground"}`}>{lastSig.signal ? `SEÑAL ${lastSig.signal} @ ${fmt(lastSig.price,2)} RSI ${fmt(lastSig.rsi,1)} TP ${fmt(lastSig.tp,2)} SL ${fmt(lastSig.sl,2)}` : `HOLD @ ${fmt(lastSig.price,2)} RSI ${fmt(lastSig.rsi,1)}`}</div>}
        <div className="rounded border bg-muted/10 p-2">
          <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Config Telegram (opcional — envía cada señal)</div>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="BOT_TOKEN 8529...:AA..." value={tgToken} onChange={e=>setTgToken(e.target.value)} className="h-7 text-xs flex-1 min-w-[220px]" />
            <Input placeholder="CHAT_ID 817919..." value={tgChat} onChange={e=>setTgChat(e.target.value)} className="h-7 text-xs w-36" />
            <Button onClick={saveTg} variant="outline" className="h-7 text-xs">Guardar</Button>
            <Button onClick={testTg} variant="outline" className="h-7 text-xs">Test envío</Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Se lee también de .env TELEGRAM_BOT_TOKEN / CHAT_ID si no completás acá. WhatsApp/Email via .env CALLMEBOT_* / GMAIL_*.</p>
        </div>
        <div className="rounded bg-black/60 text-[11px] font-mono text-emerald-300 p-2 h-[220px] overflow-auto whitespace-pre-wrap border border-border/40">{log.length?log.join("\n"):"— sin logs —\nPresioná Iniciar para comenzar polling 30s"}</div>
        <div className="flex gap-2">
          <Button variant="ghost" className="h-6 text-[10px]" onClick={()=>setLog([])}>Limpiar log</Button>
          <Button variant="ghost" className="h-6 text-[10px]" onClick={()=> navigator.clipboard.writeText(log.join("\n"))}>Copiar</Button>
        </div>
      </CardContent></Card>
      <p className="text-[10px] text-muted-foreground">Estrategia cuenta reto: 10% balance x10 leverage, DCA intra-vela, SL dinámico 10% cuenta (como live_bot.py). En modo bot web solo se notifican señales; la ejecución real va por live_bot.py en servidor/demo-fapi.binance.com.</p>
    </div>
  )
}
