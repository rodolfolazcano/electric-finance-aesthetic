// @ts-nocheck
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useCallback } from "react";
import { ArrowDownRight, ArrowUpRight, Layers, Loader2, Search, Sparkles, BarChart3, Grid3x3, TrendingUp, Target, Activity, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getSectorAnalysis, getSectorEtfFit } from "@/lib/herramientas/sector-analysis.functions";
import type { SectorAnalysisResult, EtfFitResult } from "@/lib/herramientas/sector-analysis.functions";
import { getSectorValuationRanking } from "@/lib/herramientas/sector-valuation-ranking.functions";
import type { SectorValuationRow } from "@/lib/herramientas/sector-valuation-ranking.functions";
import { getSectorDailyPerformance } from "@/lib/herramientas/sector-performance.functions";
import type { SectorDailyPerf } from "@/lib/herramientas/sector-performance.functions";
import { getMarketScreeners, type MarketScreenersResult } from "@/lib/herramientas/daily-opportunities.functions";
import { getSectorValuationByTicker } from "@/lib/herramientas/sector-valuation.functions";
import sectoresData from "@/lib/herramientas/sectores.json";
import { cn } from "@/lib/utils";
// Sector components (Clarity parity)
import { SectorPerformanceBars } from "@/components/sectores/SectorPerformanceBars";
import { SectorRelStrengthPanel } from "@/components/sectores/SectorRelStrengthPanel";
import { MurphyIntermarketPanel } from "@/components/sectores/MurphyIntermarketPanel";
import { SectorImpactSimulator } from "@/components/sectores/SectorImpactSimulator";
import { DecouplingMonitor } from "@/components/herramientas/DecouplingMonitor";
import { IntermarketRatiosPanel } from "@/components/herramientas/IntermarketRatiosPanel";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";

function fmtPct(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

// ── Shared selector state hook (extracted from Clarity SectoresPage) ──
type TickerJson = { ticker: string; nombre: string; tipo?: string; moneda?: string; mercado?: string };
type SectoresJson = Record<string, Record<string, TickerJson[]>>;
const SECTORES_DATA = sectoresData as unknown as SectoresJson;
const SECTORES = Object.keys(SECTORES_DATA).sort();

// ── Performance (live 5d) + SectorImpact + RelStrength ──
function PerformanceFullPanel({ sectorFilter, tickersFromFilter }: { sectorFilter: string; tickersFromFilter: TickerJson[] }) {
  const fn = useServerFn(getSectorDailyPerformance);
  const q = useQuery({ queryKey: ["sect-perf-diaria"], queryFn: () => fn(), staleTime: 5 * 60_000 });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-[14px]"><Layers className="h-4 w-4 text-primary" /> Performance sectorial (ETFs SPDR, 5 días)</CardTitle><p className="text-[13px] text-muted-foreground">Fuente: Yahoo Finance · ETFs XLB/XLE/XLF/XLI/XLK/XLP/XLU etc. · Delay 15’ · Barras normalizadas por maxAbs</p></CardHeader>
        <CardContent>
          {q.isPending ? <Skeleton className="h-64 w-full" /> : q.isError || !q.data ? <p className="text-[13px] text-muted-foreground">Performance no disponible.</p> : (() => {
            const items = (q.data as { items: SectorDailyPerf[] }).items;
            const max = Math.max(...items.map((i) => Math.abs(i.changePercent ?? 0)), 0.01);
            return (
              <div className="space-y-2">
                {items.map((it) => {
                  const v = it.changePercent ?? 0;
                  const positivo = v >= 0;
                  return (
                    <div key={it.key ?? it.etf} className="flex items-center gap-5 text-[13px]">
                      <div className="w-48 shrink-0 truncate text-muted-foreground flex items-center gap-1.5 justify-end"><span>{it.label}</span><span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: (it as any).dot ?? "#888" }} /></div>
                      <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/30"><div className={cn("absolute inset-y-0 left-0 rounded", positivo ? "bg-emerald-500" : "bg-red-500")} style={{ width: `${Math.max(6, (Math.abs(v) / max) * 100)}%` }} /></div>
                      <div className={cn("flex w-20 shrink-0 items-center justify-end gap-1 font-mono text-[13px]", positivo ? "text-emerald-400" : "text-red-400")}>{positivo ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}{fmtPct(it.changePercent)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-[14px]"><Activity className="h-4 w-4 text-primary" /> Fuerza relativa vs SPY (multi-timeframe)</CardTitle><p className="text-[13px] text-muted-foreground">Ratio sector/SPY · Pendiente por regresión lineal 20/60/120d · Fuente: Yahoo Finance</p></CardHeader>
        <CardContent><SectorRelStrengthPanel /></CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-[14px]"><Zap className="h-4 w-4 text-primary" /> Simulador de impacto sectorial (β)</CardTitle><p className="text-[13px] text-muted-foreground">Si un sector se mueve X%, ¿cuánto se moverían los demás? Basado en beta y R² (ventana 1Y/2Y). Metodología John Murphy.</p></CardHeader>
        <CardContent><SectorImpactSimulator /></CardContent>
      </Card>
    </div>
  );
}

// ── Panel análisis sector/industria + normalized chart + comparación ──
function PanelFull({ sectorFilter, setSectorFilter, industryFilter, setIndustryFilter, result, loading, error, handleRun, tickersFromFilter, sectorList, industryList, periodoNorm, setPeriodoNorm, normChartData, periodColors, comparacionSectores, setComparacionSectores, comparacionData, comparacionLoading, comparacionError, handleCompararSectores }: any) {
  return (
    <div className="space-y-4">
      {result && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-[14px]">{result.sector} · {result.industry} — {result.tickers.length} tickers</CardTitle><p className="text-[13px] text-muted-foreground">Fuente: Yahoo Finance · Fundamentales trailing · Score 0-100 · Percentiles intra-sector</p></CardHeader>
            <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ticker</TableHead><TableHead className="text-right">Precio</TableHead><TableHead className="text-right">P/E</TableHead><TableHead className="text-right">ROE</TableHead><TableHead className="text-right">Margen</TableHead><TableHead className="text-right">Score</TableHead><TableHead>Industria</TableHead></TableRow></TableHeader><TableBody>{(result.tickers ?? []).map((t: any) => (<TableRow key={t.ticker}><TableCell className="font-mono font-medium">{t.ticker}</TableCell><TableCell className="text-right font-mono">{t.price?.toFixed(2) ?? "s/d"}</TableCell><TableCell className="text-right font-mono">{t.trailingPE?.toFixed(1) ?? "s/d"}</TableCell><TableCell className="text-right font-mono">{t.returnOnEquity != null ? `${(t.returnOnEquity * 100).toFixed(1)}%` : "s/d"}</TableCell><TableCell className="text-right font-mono">{t.profitMargin != null ? `${(t.profitMargin * 100).toFixed(1)}%` : "s/d"}</TableCell><TableCell className="text-right font-mono">{t.fundScore?.toFixed(1) ?? "s/d"}</TableCell><TableCell className="text-[11px] text-muted-foreground">{t.industry ?? result.industry}</TableCell></TableRow>))}</TableBody></Table></div></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between"><CardTitle className="text-[14px] flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Caminos normalizados ({periodoNorm}) — base 100</CardTitle>
              <select value={periodoNorm} onChange={(e) => setPeriodoNorm(e.target.value)} className="rounded border bg-background px-2 py-1 text-[11px]"><option value="1Y">1Y</option><option value="2Y">2Y</option><option value="5Y">5Y</option><option value="10Y">10Y</option></select>
            </CardHeader>
            <CardContent>
              {normChartData.length === 0 ? <p className="text-[13px] text-muted-foreground">Sin datos de caminos normalizados.</p> : (
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={normChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" minTickGap={40} />
                      <YAxis tick={{ fontSize: 9 }} domain={["auto","auto"]} />
                      <Tooltip contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {result.tickers.slice(0, 10).map((t: any, i: number) => (
                        <Line key={t.ticker} type="monotone" dataKey={t.ticker} stroke={periodColors[i % periodColors.length]} dot={false} strokeWidth={1.5} />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {Object.keys(comparacionData).length >= 2 && (
        <Card>
          <CardHeader><CardTitle className="text-[14px]">Comparación entre sectores</CardTitle></CardHeader>
          <CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Sector</TableHead><TableHead className="text-right">Tickers</TableHead><TableHead className="text-right">Avg P/E</TableHead><TableHead className="text-right">Avg ROE</TableHead><TableHead className="text-right">Score medio</TableHead></TableRow></TableHeader><TableBody>{Object.entries(comparacionData).map(([sec, d]: any) => d && (<TableRow key={sec}><TableCell className="font-medium">{sec}</TableCell><TableCell className="text-right font-mono">{d.tickers.length}</TableCell><TableCell className="text-right font-mono">{d.avgPE?.toFixed?.(1) ?? (d.tickers.reduce((s: number, t: any)=>s+(t.trailingPE ?? 0),0)/d.tickers.length).toFixed(1)}</TableCell><TableCell className="text-right font-mono">{(d.avgROE != null ? (d.avgROE*100).toFixed(1)+"%" : "s/d")}</TableCell><TableCell className="text-right font-mono">{d.avgScore?.toFixed?.(1) ?? "s/d"}</TableCell></TableRow>))}</TableBody></Table></div>{comparacionError && <p className="text-[11px] text-amber-400 mt-2">{comparacionError}</p>}</CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-[13px]">Fuerza relativa sectorial (contexto)</CardTitle></CardHeader>
        <CardContent><SectorRelStrengthPanel /></CardContent>
      </Card>
    </div>
  );
}

// ── Matriz con selector métrica ──
function MatrizPanelFull({ sectorFilter }: { sectorFilter: string }) {
  const [sector, setSector] = useState(SECTORES[0] ?? "Technology");
  const [metric, setMetric] = useState<"correlation" | "beta" | "rSquared">("correlation");
  useEffect(()=>{ if(sectorFilter) setSector(sectorFilter); }, [sectorFilter]);
  const tickers = useMemo(() => {
    const data = SECTORES_DATA[sector] ?? {};
    const all: TickerJson[] = [];
    for (const ind of Object.keys(data)) for (const t of data[ind]) if (!all.find((x) => x.ticker === t.ticker)) all.push(t);
    return all.slice(0, 12);
  }, [sector]);
  const fn = useServerFn(getSectorEtfFit);
  const q = useQuery({ queryKey: ["matriz-etf-fit", sector], queryFn: () => fn({ data: { sector, tickers } }), enabled: tickers.length >= 2, staleTime: 30 * 60_000 });
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <Card><CardContent className="p-6 text-[13px] text-muted-foreground">Matriz no disponible.</CardContent></Card>;
  const rows = (q.data as any)?.etfResults as EtfFitResult[] | undefined;
  if (!rows || rows.length === 0) return <Card><CardContent className="p-6 text-[13px] text-muted-foreground">Sin datos.</CardContent></Card>;
  return (
    <Card><CardHeader className="flex flex-row items-center justify-between"><div><CardTitle className="text-[14px] flex items-center gap-2"><Grid3x3 className="h-4 w-4 text-primary" /> Matriz — {sector}</CardTitle><p className="text-[13px] text-muted-foreground">Corr/Beta/R² vs ETFs sectoriales · 1Y retornos diarios</p></div>
      <select value={metric} onChange={(e)=>setMetric(e.target.value as any)} className="rounded border bg-background px-2 py-1 text-[11px]"><option value="correlation">Correlación</option><option value="beta">Beta</option><option value="rSquared">R²</option></select>
      </CardHeader>
      <CardContent><select value={sector} onChange={(e)=>setSector(e.target.value)} className="mb-3 w-full max-w-xs rounded border bg-background px-2 py-1.5 text-[12px]">{SECTORES.map((s)=><option key={s} value={s}>{s}</option>)}</select><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ETF</TableHead><TableHead className="text-right">Corr</TableHead><TableHead className="text-right">Beta</TableHead><TableHead className="text-right">R²</TableHead><TableHead>Nombre</TableHead></TableRow></TableHeader><TableBody>{rows.slice(0,12).map((r)=> (<TableRow key={r.etf}><TableCell className="font-mono font-medium">{r.etf}</TableCell><TableCell className={cn("text-right font-mono", metric==="correlation" && "bg-primary/10")}>{r.correlation?.toFixed(3) ?? "s/d"}</TableCell><TableCell className={cn("text-right font-mono", metric==="beta" && "bg-primary/10")}>{r.beta?.toFixed(2) ?? "s/d"}</TableCell><TableCell className={cn("text-right font-mono", metric==="rSquared" && "bg-primary/10")}>{r.rSquared?.toFixed(3) ?? "s/d"}</TableCell><TableCell className="text-[11px] text-muted-foreground">{(r as any).name ?? r.etf}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>
  );
}

function ValuacionPanel() {
  const fn = useServerFn(getSectorValuationRanking);
  const q = useQuery({ queryKey: ["sect-valuacion-ranking"], queryFn: () => fn(), staleTime: 30 * 60_000 });
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data) return <Card><CardContent className="p-6 text-[13px] text-muted-foreground">Ranking no disponible.</CardContent></Card>;
  const rows = (q.data as { rows: SectorValuationRow[] }).rows;
  return (<Card><CardHeader><CardTitle className="text-[14px]">Valuación relativa por sector</CardTitle><p className="text-[13px] text-muted-foreground">P/E forward vs percentil histórico · Fuente: Yahoo Finance</p></CardHeader><CardContent><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Sector</TableHead><TableHead className="text-right">Tickers</TableHead><TableHead className="text-right">P/E fwd</TableHead><TableHead className="text-right">P/E trail</TableHead><TableHead className="text-right">Pctil</TableHead></TableRow></TableHeader><TableBody>{rows.map((r) => (<TableRow key={r.sector}><TableCell className="text-[13px] font-medium">{r.sector}</TableCell><TableCell className="text-right font-mono text-[13px]">{r.tickerCount}</TableCell><TableCell className="text-right font-mono text-[13px]">{r.avgForwardPE?.toFixed(1) ?? "s/d"}</TableCell><TableCell className="text-right font-mono text-[13px]">{r.avgTrailingPE?.toFixed(1) ?? "s/d"}</TableCell><TableCell className="text-right font-mono text-[13px]">{r.medianPEPercentile?.toFixed(0) ?? "s/d"}</TableCell></TableRow>))}</TableBody></Table></div></CardContent></Card>);
}

function OportunidadesPanel2() {
  const fn = useServerFn(getMarketScreeners);
  const q = useQuery({ queryKey: ["sect-screeners"], queryFn: () => fn(), staleTime: 15 * 60_000 });
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data) return <Card><CardContent className="p-6 text-[13px] text-muted-foreground">Screener no disponible.</CardContent></Card>;
  const d = q.data as MarketScreenersResult;
  const grupos = [{ key: "day_gainers", label: "Mayores alzas" }, { key: "day_losers", label: "Mayores bajas" }, { key: "most_actives", label: "Más operados" }] as const;
  return (<div className="grid gap-6 lg:grid-cols-3">{grupos.map((g) => (<Card key={g.key}><CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-[14px]"><Sparkles className="h-4 w-4 text-primary" /> {g.label}</CardTitle></CardHeader><CardContent><ul className="space-y-2">{(d[g.key] ?? []).slice(0, 8).map((it) => (<li key={it.symbol} className="flex items-baseline justify-between gap-2 text-[13px]"><span className="font-mono font-medium">{it.symbol}</span><span className="flex items-baseline gap-2"><span className="font-mono text-muted-foreground text-[11px]">{it.price != null ? `$${it.price.toFixed(2)}` : ""}</span><span className={cn("w-16 text-right font-mono text-[13px]", (it.percentChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtPct(it.percentChange)}</span></span></li>))}</ul></CardContent></Card>))}</div>);
}

function BenchmarksPanel() {
  const benchmarks = [
    { etf: "SPY", name: "S&P 500" },
    { etf: "QQQ", name: "Nasdaq 100" },
    { etf: "DIA", name: "Dow Jones" },
    { etf: "IWM", name: "Russell 2000" },
    { etf: "EEM", name: "Emergentes" },
    { etf: "EWZ", name: "Brasil" },
  ];
  return (<Card><CardHeader><CardTitle className="flex items-center gap-2 text-[14px]"><BarChart3 className="h-4 w-4 text-primary" /> Benchmarks principales</CardTitle><p className="text-[13px] text-muted-foreground">SPY/QQQ/DIA + ETFs regionales · Ver Matriz/ETF Fit para correlación</p></CardHeader><CardContent><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{benchmarks.map((b)=>(<div key={b.etf} className="rounded-xl border bg-muted/10 p-6"><p className="font-mono text-[13px] font-semibold">{b.etf}</p><p className="text-[11px] text-muted-foreground">{b.name}</p><p className="text-[11px] text-muted-foreground mt-2">Matriz: correlación 1Y · Benchmarks: factors Value/Size/Momentum</p></div>))}</div></CardContent></Card>);
}

function EtfFitPanel({ sectorFilter }: { sectorFilter: string }) {
  const [sector, setSector] = useState(SECTORES[0] ?? "Technology");
  useEffect(()=>{ if(sectorFilter) setSector(sectorFilter); },[sectorFilter]);
  const tickers = useMemo(() => { const data = SECTORES_DATA[sector] ?? {}; const all: TickerJson[] = []; for (const ind of Object.keys(data)) for (const t of data[ind]) if (!all.find((x)=>x.ticker===t.ticker)) all.push(t); return all.slice(0,10); }, [sector]);
  const fn = useServerFn(getSectorEtfFit);
  const q = useQuery({ queryKey: ["etf-fit", sector], queryFn: () => fn({ data: { sector, tickers } }), enabled: tickers.length >=2, staleTime: 30*60_000 });
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError) return <Card><CardContent className="p-6 text-[13px] text-muted-foreground">ETF Fit no disponible.</CardContent></Card>;
  const rows: EtfFitResult[] = (q.data as any)?.etfResults ?? [];
  return (<Card><CardHeader><CardTitle className="flex items-center gap-2 text-[14px]"><Target className="h-4 w-4 text-primary" /> ETF Fit — {sector}</CardTitle><p className="text-[13px] text-muted-foreground">Qué ETF replica mejor el comportamiento del sector · Correlación y tracking</p></CardHeader><CardContent><select value={sector} onChange={(e)=>setSector(e.target.value)} className="mb-4 w-full max-w-xs rounded border bg-background px-2 py-1.5 text-[12px]">{SECTORES.map((s)=><option key={s} value={s}>{s}</option>)}</select>{rows.length===0 ? <p className="text-[13px] text-muted-foreground">Sin resultados.</p> : (<div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>ETF</TableHead><TableHead className="text-right">Corr</TableHead><TableHead className="text-right">R²</TableHead><TableHead className="text-right">Beta</TableHead></TableRow></TableHeader><TableBody>{rows.slice(0,10).map((r)=>(<TableRow key={r.etf}><TableCell className="font-mono font-medium">{r.etf}</TableCell><TableCell className="text-right font-mono">{r.correlation?.toFixed(3) ?? "s/d"}</TableCell><TableCell className="text-right font-mono">{r.rSquared?.toFixed(3) ?? "s/d"}</TableCell><TableCell className="text-right font-mono">{r.beta?.toFixed(2) ?? "s/d"}</TableCell></TableRow>))}</TableBody></Table></div>)}</CardContent></Card>);
}

function IntermarketFull() {
  const [tab, setTab] = useState<"murphy"|"ratios"|"decoupling">("murphy");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border/40 pb-2 flex-wrap">
        {[{k:"murphy",l:"Murphy 12 ratios + Yield + Ciclo"},{k:"ratios",l:"Ratios Pring/Stovall"},{k:"decoupling",l:"Decoupling Monitor"}].map((t)=>(<button key={t.k} onClick={()=>setTab(t.k as any)} className={cn("text-[11px] font-mono px-3 py-1.5 rounded-t", tab===t.k ? "bg-primary/15 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground")}>{t.l}</button>))}
      </div>
      {tab==="murphy" && <MurphyIntermarketPanel />}
      {tab==="ratios" && <IntermarketRatiosPanel />}
      {tab==="decoupling" && <DecouplingMonitor />}
    </div>
  );
}

export function SectoresTab({ initialTab }: { initialTab?: string } = {}) {
  const valid = ["panel","matriz","valuacion","oportunidades","benchmarks","etf-fit","performance","intermarket"];
  const [tab, setTab] = useState(valid.includes(initialTab || "") ? initialTab! : "panel");
  useEffect(() => { if (initialTab && valid.includes(initialTab) && initialTab !== tab) setTab(initialTab); }, [initialTab]);
  // Shared sector state (Clarity parity)
  const [sectorFilter, setSectorFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [result, setResult] = useState<SectorAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fn = useServerFn(getSectorAnalysis);
  const sectorList = useMemo(()=> Object.keys(SECTORES_DATA).sort(), []);
  const industryList = useMemo(()=> { if(!sectorFilter) return []; const d=(SECTORES_DATA as any)[sectorFilter]; return d ? Object.keys(d).sort() : []; }, [sectorFilter]);
  const tickersFromFilter = useMemo(()=> {
    if(!sectorFilter) return [];
    const data=(SECTORES_DATA as any)[sectorFilter];
    if(!data) return [];
    if(industryFilter) return data[industryFilter] ?? [];
    const all: TickerJson[]=[];
    for(const ind of Object.keys(data)) for(const t of data[ind]) if(!all.find((x)=>x.ticker===t.ticker)) all.push(t);
    return all;
  }, [sectorFilter, industryFilter]);

  const handleRun = useCallback(async()=>{
    if(tickersFromFilter.length<2) return;
    setLoading(true); setError(""); setResult(null);
    try{ const data= await fn({ data:{ sector: sectorFilter, industry: industryFilter || "Todas las industrias", tickers: tickersFromFilter } as any }); setResult(data as any);
    } catch(e){ setError((e as Error).message);} finally{ setLoading(false);}
  }, [tickersFromFilter, fn, sectorFilter, industryFilter]);

  useEffect(()=>{ if(tickersFromFilter.length<2){ setResult(null); setError(""); return;} handleRun(); }, [sectorFilter, industryFilter]);

  const [periodoNorm, setPeriodoNorm]=useState<"1Y"|"2Y"|"5Y"|"10Y">("2Y");
  const normPathKey=`normPath${periodoNorm}` as "normPath1Y"|"normPath2Y"|"normPath5Y"|"normPath10Y";
  const normChartData=useMemo(()=>{
    if(!result) return [];
    const paths=result.tickers.map((t:any)=>t[normPathKey]).filter((p:any)=>p?.length>0);
    if(paths.length===0) return [];
    const dateSet=new Set<string>(); for(const p of paths) for(const pt of p) dateSet.add(pt.date);
    const sorted=[...dateSet].sort();
    const valuesByDate=new Map<string, Record<string,number>>();
    for(const d of sorted){ const row: Record<string,number>={ dateIdx:0 } as any; for(let i=0;i<result.tickers.length;i++){ const pt=result.tickers[i][normPathKey]?.find((x:any)=>x.date===d); if(pt) row[result.tickers[i].ticker]=pt.value; } valuesByDate.set(d,row); }
    return sorted.map((d,idx)=>{ const row=valuesByDate.get(d)!; (row as any).dateIdx=idx; return { date:d, ...row }; });
  }, [result, normPathKey]);
  const periodColors=["#3b82f6","#a855f7","#22c55e","#f59e0b","#ef4444","#06b6d4","#ec4899","#14b8a6","#f97316","#8b5cf6","#10b981","#eab308","#6366f1"];

  // Comparación
  const [comparacionSectores, setComparacionSectores]=useState<string[]>([]);
  const [comparacionData, setComparacionData]=useState<Record<string,SectorAnalysisResult|null>>({});
  const [comparacionLoading, setComparacionLoading]=useState(false);
  const [comparacionError, setComparacionError]=useState("");
  const handleCompararSectores=useCallback(async()=>{
    if(comparacionSectores.length<2) return;
    setComparacionLoading(true); setComparacionError("");
    try{
      const results=await Promise.allSettled(comparacionSectores.map(async(sector)=>{
        const tickers: TickerJson[]=[]; const secData=(SECTORES_DATA as any)[sector];
        if(secData){ const seen=new Set<string>(); for(const ind of Object.keys(secData)) for(const t of secData[ind]) if(!seen.has(t.ticker)){ seen.add(t.ticker); tickers.push(t);} }
        if(tickers.length<2) return { sector, data:null };
        const r=await fn({ data:{ sector, industry:"Todas las industrias", tickers } as any }); return { sector, data:r as any };
      }));
      const comp: Record<string,SectorAnalysisResult|null>={}; for(const r of results) if(r.status==="fulfilled") comp[r.value.sector]=r.value.data;
      setComparacionData(comp);
      const errs=results.filter((r)=>r.status==="rejected").map((r)=>(r as any).reason?.message).filter(Boolean);
      if(errs.length) setComparacionError(errs.join("; "));
    } catch(e){ setComparacionError((e as Error).message);} finally{ setComparacionLoading(false);}
  }, [comparacionSectores, fn]);

  return (
    <div className="space-y-5 w-full">
      <div>
        <h2 className="font-display text-[clamp(1.6rem,2.5vw,2rem)] font-semibold tracking-tight">Análisis sectorial</h2>
        <p className="text-[13px] text-muted-foreground mt-1">Rotación sectorial con ETFs SPDR, valuación relativa, correlaciones, benchmarks y screeners. Fuentes: Yahoo Finance · BCRA · Delay 15-20’ · Metodología John Murphy / Pring</p>
      </div>

      {/* Selector compartido Clarity parity */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="glass p-3 flex-1 min-w-[220px] border rounded-lg bg-background/40">
          <div className="flex flex-wrap items-center gap-2">
            <select value={sectorFilter} onChange={(e)=>{ setSectorFilter(e.target.value); setIndustryFilter(""); setResult(null);}} className="flex-1 min-w-[160px] bg-background border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5">
              <option value="">Seleccionar sector</option>
              {sectorList.filter((s)=>s!=="No disponible").map((s)=><option key={s} value={s}>{s}</option>)}
            </select>
            {sectorFilter && (<select value={industryFilter} onChange={(e)=>{ setIndustryFilter(e.target.value); setResult(null);}} className="flex-1 min-w-[160px] bg-background border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5"><option value="">Todas las industrias (sector completo)</option>{industryList.map((ind)=><option key={ind} value={ind}>{ind}</option>)}</select>)}
            {tickersFromFilter.length>=2 && (<Button onClick={handleRun} disabled={loading} size="sm" className="h-8 text-[11px]">{loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />} Analizar</Button>)}
            {loading && <span className="text-[11px] text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin"/>Analizando…</span>}
          </div>
          {tickersFromFilter.length>0 && (<div className="mt-2 flex flex-wrap gap-1">{tickersFromFilter.slice(0,30).map((t)=><span key={t.ticker} className="font-mono text-[10px] px-2 py-0.5 rounded border border-primary/20 bg-primary/5">{t.ticker}</span>)}{tickersFromFilter.length>30 && <span className="text-[10px] text-muted-foreground">+{tickersFromFilter.length-30} más</span>}</div>)}
          {error && <div className="mt-2 p-2 rounded bg-danger/10 border border-danger/30 text-xs text-danger">{error}</div>}
        </div>
        <div className="glass p-3 flex-1 min-w-[220px] border rounded-lg bg-background/40">
          <div className="flex flex-wrap items-center gap-2"><span className="text-[11px] uppercase tracking-widest text-muted-foreground">Comparar</span>
            <select multiple value={comparacionSectores} onChange={(e)=> setComparacionSectores(Array.from(e.target.selectedOptions, (o)=>o.value))} className="flex-1 min-w-[120px] bg-background border border-border/60 text-[11px] rounded px-2 py-1.5" size={3}>
              {sectorList.filter((s)=>s!=="No disponible").map((s)=><option key={s} value={s}>{s}</option>)}
            </select>
            <Button onClick={handleCompararSectores} disabled={comparacionSectores.length<2 || comparacionLoading} size="sm" className="h-8 text-[11px]">{comparacionLoading ? "Cargando…" : `Comparar (${comparacionSectores.length})`}</Button>
          </div>
          {comparacionError && <p className="text-[10px] text-amber-400 mt-1">{comparacionError}</p>}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex-wrap h-auto gap-1 p-1 w-full justify-start">
          <TabsTrigger value="panel" className="text-[12px] px-3 py-1.5">Panel</TabsTrigger>
          <TabsTrigger value="matriz" className="text-[12px] px-3 py-1.5">Matriz</TabsTrigger>
          <TabsTrigger value="valuacion" className="text-[12px] px-3 py-1.5">Valuación</TabsTrigger>
          <TabsTrigger value="oportunidades" className="text-[12px] px-3 py-1.5">Oportunidades</TabsTrigger>
          <TabsTrigger value="benchmarks" className="text-[12px] px-3 py-1.5">Benchmarks</TabsTrigger>
          <TabsTrigger value="etf-fit" className="text-[12px] px-3 py-1.5">ETF Fit</TabsTrigger>
          <TabsTrigger value="performance" className="text-[12px] px-3 py-1.5">Performance</TabsTrigger>
          <TabsTrigger value="intermarket" className="text-[12px] px-3 py-1.5">Intermarket</TabsTrigger>
        </TabsList>

        <TabsContent value="panel" className="mt-4">
          {!result && !loading && (<Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Seleccioná un sector e industria para ver el análisis. Incluye tabla fundamentales, caminos normalizados 1Y/2Y/5Y/10Y, fuerza relativa y comparación.</CardContent></Card>)}
          {loading && <Skeleton className="h-64 w-full" />}
          {result && <PanelFull sectorFilter={sectorFilter} setSectorFilter={setSectorFilter} industryFilter={industryFilter} setIndustryFilter={setIndustryFilter} result={result} loading={loading} error={error} handleRun={handleRun} tickersFromFilter={tickersFromFilter} sectorList={sectorList} industryList={industryList} periodoNorm={periodoNorm} setPeriodoNorm={setPeriodoNorm} normChartData={normChartData} periodColors={periodColors} comparacionSectores={comparacionSectores} setComparacionSectores={setComparacionSectores} comparacionData={comparacionData} comparacionLoading={comparacionLoading} comparacionError={comparacionError} handleCompararSectores={handleCompararSectores} />}
        </TabsContent>

        <TabsContent value="matriz" className="mt-4"><MatrizPanelFull sectorFilter={sectorFilter} /></TabsContent>
        <TabsContent value="valuacion" className="mt-4"><ValuacionPanel /></TabsContent>
        <TabsContent value="oportunidades" className="mt-4"><OportunidadesPanel2 /></TabsContent>
        <TabsContent value="benchmarks" className="mt-4"><BenchmarksPanel /></TabsContent>
        <TabsContent value="etf-fit" className="mt-4"><EtfFitPanel sectorFilter={sectorFilter} /></TabsContent>
        <TabsContent value="performance" className="mt-4"><PerformanceFullPanel sectorFilter={sectorFilter} tickersFromFilter={tickersFromFilter} /></TabsContent>
        <TabsContent value="intermarket" className="mt-4"><IntermarketFull /></TabsContent>
      </Tabs>
    </div>
  );
}
