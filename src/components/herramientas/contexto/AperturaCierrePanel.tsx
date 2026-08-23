// @ts-nocheck
import { useState, useMemo } from "react";
import { useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, TrendingUp, TrendingDown, Clock3, History, ExternalLink, RefreshCw } from "lucide-react";
import {
  getAperturaMercado,
  getCierreHistorico,
  generarInterpretacionMercado,
  listarInterpretaciones,
} from "@/lib/apertura-cierre.functions";

function fmtPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtNum(n: number | null | undefined, d = 2): string {
  if (n == null || !isFinite(n)) return "--";
  return n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function todayISO(): string { return new Date().toISOString().slice(0, 10); }

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${active ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-primary-foreground" : "bg-current"}`} />
      {children}
    </button>
  );
}

function Sparkline({ data, positivo }: { data: number[]; positivo: boolean }) {
  if (!data || data.length < 2) return <div className="h-8 w-full rounded bg-muted/20" />;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const W = 120, H = 32;
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * (H - 4) - 2).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={positivo ? "#34d399" : "#fb7185"} strokeWidth="1.5" />
    </svg>
  );
}

function SectionCard({ eyebrow, title, children }: { eyebrow: string; title: string; children: any }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-secondary/20">
      <div className="border-b border-border/40 bg-background/40 px-5 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{eyebrow}</p>
        <p className="font-display text-[13px] font-semibold">{title}</p>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

export function AperturaCierrePanel() {
  const search: any = (() => { try { return useSearch({ from: "/herramientas" }); } catch { return {}; } })();
  const subTab: string = search?.subTab === "cierre" ? "cierre" : search?.subTab === "apertura" ? "apertura" : "apertura";
  const isCierre = subTab === "cierre";

  const [fecha, setFecha] = useState<string>(todayISO());
  const [verHistorial, setVerHistorial] = useState(false);

  const aperturaFn = useServerFn(getAperturaMercado);
  const cierreFn = useServerFn(getCierreHistorico);
  const interpFn = useServerFn(generarInterpretacionMercado);
  const histFn = useServerFn(listarInterpretaciones);

  const qApertura = useQuery({
    queryKey: ["apertura", fecha],
    queryFn: () => aperturaFn({ data: { fecha } }),
    enabled: !isCierre && !!fecha,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const qCierre = useQuery({
    queryKey: ["cierre-hist", fecha],
    queryFn: () => cierreFn({ data: { fecha } }),
    enabled: isCierre && !!fecha,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const tipoInterp = isCierre ? "cierre" : "apertura";
  const qInterp = useQuery({
    queryKey: ["interp", tipoInterp, fecha],
    queryFn: () => interpFn({ data: { tipo: tipoInterp, fecha } }),
    enabled: !!fecha,
    staleTime: 30 * 60_000,
  });
  const qHist = useQuery({
    queryKey: ["interp-hist", tipoInterp],
    queryFn: () => histFn({ data: { tipo: tipoInterp, limit: 12 } }),
    enabled: verHistorial,
    staleTime: 60_000,
  });

  const dataA = qApertura.data as any;
  const dataC = qCierre.data as any;
  const interp = qInterp.data as any;

  return (
    <div className="space-y-6">
      {/* Header home style */}
      <div>
        <p className="eyebrow flex items-center gap-2">
          <Clock3 className="h-4 w-4 text-primary" />
          {isCierre ? "Cierre de mercado" : "Apertura de mercado"} · {fecha}
        </p>
        <h2 className="mt-2 font-display text-[clamp(1.5rem,3vw,2rem)] font-semibold leading-tight">
          {isCierre ? "Cierre offshore" : "Apertura"} <span className="italic text-primary">{isCierre ? "Wall Street + Global" : "pre-market AR + overnight"}</span>
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          {isCierre
            ? "Snapshot orden Murphy: índices → sectores → ganadores/perdedores operables (CEDEAR) → tasas → renta fija → global → commodities. Snapshot por fecha, sparklines 3M, variaciones HOY/1M/YTD."
            : "Orden Murphy AR primero: dólar/riesgo país/reservas → futures overnight → ADRs → gap CCL → tasas → commodities. Todo automático por fecha, sin hardcode."}
        </p>
      </div>

      {/* Date picker + historial */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
        <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Fecha</label>
        <input
          type="date"
          value={fecha}
          max={todayISO()}
          onChange={(e) => setFecha(e.target.value || todayISO())}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-[13px] font-mono"
        />
        <Chip active={verHistorial} onClick={() => setVerHistorial((v) => !v)}>
          <History className="h-3 w-3" /> Consultar historial IA
        </Chip>
        {(qApertura.isFetching || qCierre.isFetching) && <span className="text-[11px] text-muted-foreground">cargando…</span>}
      </div>

      {verHistorial && (
        <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Interpretaciones guardadas ({tipoInterp})</p>
          {qHist.isPending ? (
            <Skeleton className="mt-2 h-16 w-full" />
          ) : (qHist.data as any)?.length ? (
            <div className="mt-2 space-y-2">
              {(qHist.data as any[]).map((r: any) => (
                <div key={`${r.tipo}-${r.fecha}`} className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-secondary/20 px-3 py-2">
                  <div>
                    <p className="font-mono text-[12px] font-semibold">{r.fecha} · {r.tipo}</p>
                    <p className="mt-1 line-clamp-2 text-[12px] text-muted-foreground">{String(r.interpretacion).slice(0, 180)}…</p>
                  </div>
                  <button onClick={() => setFecha(r.fecha)} className="shrink-0 rounded-full border border-border px-3 py-1 text-[11px] font-semibold hover:border-primary/50">Ver</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-muted-foreground">Aún sin interpretaciones guardadas.</p>
          )}
        </div>
      )}

      {/* Interpretación IA diaria */}
      <div className="rounded-2xl border border-primary/30 bg-primary/[0.06] p-4">
        <p className="flex items-center gap-2 font-display text-[13px] font-semibold">
          <Sparkles className="h-4 w-4 text-primary" /> Interpretación IA diaria
          {qInterp.isFetching && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
          {interp?.fuente && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-primary">{interp.fuente}{interp?.modelo ? ` · ${String(interp.modelo).split("/").pop()}` : ""}</span>}
        </p>
        {qInterp.isPending ? (
          <Skeleton className="mt-2 h-16 w-full" />
        ) : (
          <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{interp?.interpretacion ?? "—"}</p>
        )}
        <p className="mt-2 text-[10px] text-muted-foreground">No constituye recomendación. Variaciones vs período anterior + YTD.</p>
      </div>

      {/* ── APERTURA ── */}
      {!isCierre && (
        <>
          {qApertura.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : qApertura.isError ? (
            <p className="rounded-xl border border-border/40 bg-secondary/20 p-4 text-[13px] text-muted-foreground">Error al cargar apertura.</p>
          ) : dataA && (
            <>
              {/* Macro AR */}
              <SectionCard eyebrow="1 · Macro AR" title={`Dólar · Riesgo país ${dataA.macroAR?.riesgoPais != null ? `${fmtNum(dataA.macroAR.riesgoPais, 0)} bps` : "--"} · Reservas`}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {(dataA.dolares ?? dataA.macroAR?.dolares ?? []).slice(0, 4).map((d: any) => (
                    <div key={d.casa} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{d.casa}</p>
                      <p className="font-mono text-[13px] font-semibold">{fmtNum(d.venta ?? d.compra)} ARS</p>
                    </div>
                  ))}
                </div>
                {dataA.macroAR?.riesgoPais == null && <p className="mt-2 text-[11px] text-muted-foreground">Riesgo país no disponible para esa fecha (API sin histórico).</p>}
              </SectionCard>

              {/* Futures overnight */}
              <SectionCard eyebrow="2 · Overnight EE.UU." title="Futures">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(dataA.futures ?? []).map((f: any) => (
                    <div key={f.symbol} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
                      <p className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">{f.symbol} · {f.nombre}</p>
                      <p className={`mt-1 font-mono text-[13px] font-semibold ${ (f.hoy ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(f.hoy)}</p>
                      <div className="mt-2"><Sparkline data={f.serie ?? []} positivo={(f.hoy ?? 0) >= 0} /></div>
                      <p className="mt-1 font-mono text-[11px] text-muted-foreground">{f.precio != null ? fmtNum(f.precio) : "--"}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* ADRs */}
              <SectionCard eyebrow="3 · ADRs argentinos (overnight US)" title="GGAL · YPF · BMA · SUPV · TGS…">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left font-mono text-[12px]">
                    <thead><tr className="border-b border-border/30 text-[10px] uppercase tracking-widest text-muted-foreground"><th className="py-1.5">Ticker</th><th className="text-right">Precio</th><th className="text-right">Hoy</th><th className="text-right">Mini (3M)</th></tr></thead>
                    <tbody>
                      {(dataA.adrs ?? []).map((a: any) => (
                        <tr key={a.symbol} className="border-b border-border/15 last:border-0">
                          <td className="py-1.5 font-semibold">{a.ticker}</td>
                          <td className="py-1.5 text-right tabular-nums">{a.precio != null ? fmtNum(a.precio) : "--"}</td>
                          <td className={`py-1.5 text-right font-semibold ${ (a.hoy ?? 0) >=0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(a.hoy)}</td>
                          <td className="py-1.5 text-right"><div className="ml-auto w-[80px]"><Sparkline data={a.serie ?? []} positivo={(a.hoy ?? 0) >=0} /></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              {/* Gap CCL */}
              <SectionCard eyebrow="4 · Gap CCL" title="CCL real vs implícito (CEDEARs)">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
                  <span>Real {dataA.gapCCL?.cclReal != null ? fmtNum(dataA.gapCCL.cclReal) : "--"}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${dataA.gapCCL?.gapLabel === "alcista" ? "bg-emerald-500/15 text-emerald-400" : dataA.gapCCL?.gapLabel === "bajista" ? "bg-rose-500/15 text-rose-400" : "bg-muted text-muted-foreground"}`}>gap {dataA.gapCCL?.gapLabel}</span>
                  {dataA.gapCCL?.gapPct != null && <span>{fmtPct(dataA.gapCCL.gapPct)}</span>}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{dataA.gapCCL?.nota}</p>
              </SectionCard>

              {/* Tasas + Commodities */}
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard eyebrow="5 · Tasas & Dólar" title="DXY · VIX · 10Y">
                  {(dataA.tasas ?? []).map((t: any) => (
                    <div key={t.symbol} className="flex items-center justify-between py-1 font-mono text-[12px]"><span>{t.nombre}</span><span className="tabular-nums">{t.valor != null ? fmtNum(t.valor) : "--"}</span></div>
                  ))}
                </SectionCard>
                <SectionCard eyebrow="6 · Commodities" title="Oro · WTI · BTC">
                  {(dataA.commodities ?? []).map((c: any) => (
                    <div key={c.symbol} className="flex items-center justify-between py-1 font-mono text-[12px]"><span>{c.nombre}</span><span className={`tabular-nums font-semibold ${(c.hoy ?? 0) >=0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(c.hoy)}</span></div>
                  ))}
                </SectionCard>
              </div>
            </>
          )}
        </>
      )}

      {/* ── CIERRE HISTÓRICO ── */}
      {isCierre && (
        <>
          {qCierre.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : qCierre.isError ? (
            <p className="rounded-xl border border-border/40 bg-secondary/20 p-4 text-[13px] text-muted-foreground">Error al cargar cierre.</p>
          ) : dataC && (
            <>
              <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                <span>Fecha cierre {dataC.fechaCierre}</span>
                <span className="text-border">·</span>
                <span>Próxima apertura {dataC.aperturaFutura}</span>
              </div>

              {/* Índices US */}
              <SectionCard eyebrow="Índices de EE.UU." title={`Precio · Hoy · 1M · YTD  —  ${dataC.fechaCierre}`}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(dataC.indices ?? []).map((r: any) => (
                    <div key={r.ticker} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
                      <p className="flex items-center justify-between font-mono text-[11px]"><span className="uppercase text-muted-foreground">{r.nombre} · {r.ticker}</span><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${(r.hoy ?? 0) >=0 ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>{fmtPct(r.hoy)}</span></p>
                      <p className="mt-1 font-mono text-[13px] font-semibold">{r.precio != null ? fmtNum(r.precio) : "--"}</p>
                      <div className="mt-1"><Sparkline data={r.serie ?? []} positivo={(r.hoy ?? 0) >=0} /></div>
                      <p className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground"><span>1M {fmtPct(r.mes1)}</span><span>YTD {fmtPct(r.ytd)}</span></p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Sectores */}
              <SectionCard eyebrow="Sectores S&P 500" title="Hoy · 1M · YTD  —  ordenado mejor → peor">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {(dataC.sectores ?? []).map((s: any) => (
                    <div key={s.etf} className={`rounded-xl border px-3 py-2 ${ (s.hoy ?? 0) >= 1 ? "border-emerald-500/30 bg-emerald-500/10" : (s.hoy ?? 0) >=0 ? "border-emerald-500/15 bg-emerald-500/[0.06]" : (s.hoy ?? 0) > -1 ? "border-border/40 bg-background/40" : "border-rose-500/30 bg-rose-500/10"}`}>
                      <p className="font-mono text-[11px] font-semibold">{s.nombre} · {s.etf}</p>
                      <p className={`mt-1 font-mono text-[13px] font-bold ${(s.hoy ?? 0) >=0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(s.hoy)}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">1M {fmtPct(s.mes1)} · YTD {fmtPct(s.ytd)}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>

              {/* Top movers con operabilidad */}
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard eyebrow="Top ganadores S&P 500" title="Operables en BCBA vía CEDEAR">
                  {(dataC.ganadores ?? []).length ? (
                    <div className="space-y-1">
                      {(dataC.ganadores ?? []).map((m: any) => (
                        <div key={m.symbol} className="flex items-center justify-between rounded-lg border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-1.5 font-mono text-[12px]">
                          <span className="font-semibold">{m.symbol}{m.operableBCBA && <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[9px] uppercase text-primary">CEDEAR {m.cedearTicker}</span>}</span>
                          <span className="font-bold text-emerald-400">+{fmtNum(m.percentChange)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-mono text-[12px] text-muted-foreground">Top movers solo para la sesión de hoy. Elegí hoy como fecha para verlos.</p>
                  )}
                </SectionCard>
                <SectionCard eyebrow="Top perdedores S&P 500" title="Operables en BCBA vía CEDEAR">
                  {(dataC.perdedores ?? []).length ? (
                    <div className="space-y-1">
                      {(dataC.perdedores ?? []).map((m: any) => (
                        <div key={m.symbol} className="flex items-center justify-between rounded-lg border border-rose-500/15 bg-rose-500/[0.06] px-3 py-1.5 font-mono text-[12px]">
                          <span className="font-semibold">{m.symbol}{m.operableBCBA && <span className="ml-1 rounded bg-primary/10 px-1 py-0.5 text-[9px] uppercase text-primary">CEDEAR {m.cedearTicker}</span>}</span>
                          <span className="font-bold text-rose-400">{fmtNum(m.percentChange)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="font-mono text-[12px] text-muted-foreground">Top movers solo para la sesión de hoy.</p>
                  )}
                </SectionCard>
              </div>

              {/* Tasas, renta fija, global, commodities */}
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard eyebrow="Tasas e índices" title="DXY · VIX · 10Y · 30Y">
                  {(dataC.tasas ?? []).map((t: any) => (
                    <div key={t.ticker} className="flex items-center justify-between py-1 font-mono text-[12px]"><span>{t.nombre}</span><span className={`tabular-nums font-semibold ${(t.variacion ?? 0) >=0 ? "text-emerald-400" : "text-rose-400"}`}>{t.valor != null ? fmtNum(t.valor) : "--"} · {fmtPct(t.variacion)}</span></div>
                  ))}
                </SectionCard>
                <SectionCard eyebrow="Renta fija" title="Gobierno & Corporativo">
                  {[...(dataC.bonosGob ?? []), ...(dataC.bonosCorp ?? [])].map((r: any) => (
                    <div key={r.ticker} className="flex items-center justify-between py-1 font-mono text-[12px]"><span>{r.nombre}</span><span className={`${(r.variacion ?? 0) >=0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(r.variacion)}</span></div>
                  ))}
                </SectionCard>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard eyebrow="Global · Desarrollados" title="EWS · EWJ · EWC · SPY">
                  {(dataC.desarrollados ?? []).map((c: any) => (
                    <div key={c.ticker} className="flex items-center justify-between py-1 font-mono text-[12px]"><span>{c.nombre}</span><span className={`${(c.variacion ?? 0) >=0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(c.variacion)}</span></div>
                  ))}
                </SectionCard>
                <SectionCard eyebrow="Global · Emergentes" title="China · México · Grecia · Polonia">
                  {(dataC.emergentes ?? []).map((c: any) => (
                    <div key={c.ticker} className="flex items-center justify-between py-1 font-mono text-[12px]"><span>{c.nombre}</span><span className={`${(c.variacion ?? 0) >=0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(c.variacion)}</span></div>
                  ))}
                </SectionCard>
              </div>
              <SectionCard eyebrow="Commodities" title="Precio · Hoy · 1M · YTD">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {(dataC.commodities ?? []).map((r: any) => (
                    <div key={r.ticker} className="rounded-xl border border-border/40 bg-background/60 px-3 py-2">
                      <p className="font-mono text-[11px] uppercase text-muted-foreground">{r.nombre} · {r.ticker}</p>
                      <p className={`mt-1 font-mono text-[12px] font-bold ${(r.hoy ?? 0) >=0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtPct(r.hoy)}</p>
                      <p className="font-mono text-[11px]">{r.precio != null ? fmtNum(r.precio) : "--"}</p>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </>
          )}
        </>
      )}

      <p className="text-center font-mono text-[10px] text-muted-foreground">Datos con fines informativos · {fecha} · Fuentes: Yahoo Finance · IOL · BCRA · ArgentinaDatos · CriptoYa · Delay 15–20′</p>
    </div>
  );
}
