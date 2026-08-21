// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getIntermarketMurphyIndicators, type IntermarketMurphyResult } from "@/lib/sectores/intermarket-murphy.functions";

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtPct(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(dp)}%`;
}

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toFixed(dp);
}

function TrendBadge({ trend, label }: { trend: string | null | undefined; label?: string }) {
  if (!trend) return null;
  const colorMap: Record<string, string> = {
    rising: "bg-green-500/20 text-green-400 border-green-500/30",
    falling: "bg-red-500/20 text-red-400 border-red-500/30",
    flat: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    up: "bg-green-500/20 text-green-400 border-green-500/30",
    down: "bg-red-500/20 text-red-400 border-red-500/30",
    bonds_lideran: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    stocks_lideran: "bg-green-500/20 text-green-400 border-green-500/30",
    ambos_suben: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    ambos_bajan: "bg-red-500/20 text-red-400 border-red-500/30",
    incierto: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    inverted: "bg-red-500/20 text-red-400 border-red-500/30",
    steepening: "bg-green-500/20 text-green-400 border-green-500/30",
    flattening: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    normal: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    bullish: "bg-green-500/20 text-green-400 border-green-500/30",
    bearish: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  const labels: Record<string, string> = {
    rising: "\u25B2 Alza", falling: "\u25BC Baja", flat: "\u2014 Estable",
    up: "\u25B2 Sube", down: "\u25BC Baja",
    bonds_lideran: "Bonos lideran", stocks_lideran: "Acciones lideran",
    ambos_suben: "Expansi\u00f3n", ambos_bajan: "Contracci\u00f3n", incierto: "Sin se\u00f1al",
    inverted: "Invertida", steepening: "Steepening", flattening: "Flattening", normal: "Normal",
  };
  return (
    <span className={cn("rounded border px-1.5 py-0.5 text-[9px] font-mono font-medium", colorMap[trend] ?? "bg-muted/20 text-muted-foreground")}>
      {label ?? labels[trend] ?? trend}
    </span>
  );
}

function StageBadge({ stage }: { stage: number }) {
  const colors: Record<number, string> = {
    1: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    2: "bg-green-500/20 text-green-400 border-green-500/30",
    3: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    4: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    5: "bg-orange-500/20 text-orange-400 border-orange-500/30",
    6: "bg-red-500/20 text-red-400 border-red-500/30",
  };
  return <span className={cn("rounded border px-2 py-0.5 text-[10px] font-mono font-bold", colors[stage] ?? "")}>Stage {stage}</span>;
}

function RatioCard({ data, title, subtitle }: { data: IntermarketMurphyResult[keyof IntermarketMurphyResult] & { ratio?: number | null; changePct1m?: number | null; trend?: string | null; interpretacion?: string; favoreceSectores?: string[] }; title?: string; subtitle?: string }) {
  const d = data as any;
  if (!d) return null;
  return (
    <Card className="border-border/40 bg-background/40/40 p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">{title ?? d.label}</span>
        <TrendBadge trend={d.trend} />
      </div>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-lg font-bold font-mono text-foreground">{fmtNum(d.ratio, 3)}</span>
        {d.changePct1m != null && (
          <span className={cn("text-[10px] font-mono", (d.changePct1m ?? 0) > 0 ? "text-green-400" : "text-red-400")}>
            {fmtPct(d.changePct1m / 100, 1)} 1m
          </span>
        )}
      </div>
      {subtitle && <p className="text-[8px] text-muted-foreground/60 font-mono mb-1">{subtitle}</p>}
      <p className="text-[9px] text-muted-foreground leading-relaxed">{d.interpretacion}</p>
      {d.favoreceSectores && d.favoreceSectores.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {d.favoreceSectores.map((s: string) => (
            <span key={s} className="rounded border border-border/30 bg-border/10 px-1.5 py-0.5 text-[8px] font-mono text-foreground">{s}</span>
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Yield Curve Card ─────────────────────────────────────────────────

function YieldCurveCard({ data }: { data: IntermarketMurphyResult["yieldCurve"] }) {
  return (
    <Card className="border-border/40 bg-background/40/40 p-3 col-span-full lg:col-span-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          Curva de Yields (Murphy Cap. 14) — Señal más temprana del ciclo
        </span>
        <TrendBadge trend={data.steepness} />
      </div>
      <div className="grid grid-cols-3 gap-3 mb-2">
        <div className="rounded border border-border/30 bg-background/30 p-2">
          <p className="text-[8px] text-muted-foreground/60 font-mono">10Y-2Y Spread</p>
          <p className={cn("text-sm font-mono font-bold", (data.valor10y2y ?? 0) < 0 ? "text-red-400" : "text-green-400")}>
            {fmtNum(data.valor10y2y, 2)}%
          </p>
        </div>
        <div className="rounded border border-border/30 bg-background/30 p-2">
          <p className="text-[8px] text-muted-foreground/60 font-mono">10Y-3M Spread</p>
          <p className={cn("text-sm font-mono font-bold", (data.valor10y3m ?? 0) < 0 ? "text-red-400" : "text-green-400")}>
            {fmtNum(data.valor10y3m, 2)}%
          </p>
        </div>
        <div className="rounded border border-border/30 bg-background/30 p-2">
          <p className="text-[8px] text-muted-foreground/60 font-mono">Estado</p>
          <p className={cn("text-sm font-mono font-bold",
            data.steepness === "inverted" ? "text-red-400" :
            data.steepness === "steepening" ? "text-green-400" :
            data.steepness === "flattening" ? "text-yellow-400" : "text-blue-400")}>
            {data.invertida ? "INVERTIDA" : data.steepness === "steepening" ? "Steepening" : data.steepness === "flattening" ? "Flattening" : "Normal"}
          </p>
        </div>
      </div>
      <div className={cn("rounded border px-2 py-1.5 text-[9px] font-mono leading-relaxed",
        data.invertida ? "border-red-500/30 bg-red-500/10 text-red-400" :
        data.steepness === "flattening" ? "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" :
        data.steepness === "steepening" ? "border-green-500/30 bg-green-500/10 text-green-400" :
        "border-border/30 bg-muted/10 text-muted-foreground")}>
        {data.interpretacion}
      </div>
    </Card>
  );
}

// ─── Cycle Diagnosis Card ────────────────────────────────────────────

function CycleCard({ data }: { data: IntermarketMurphyResult["cycle"] }) {
  return (
    <Card className="border-border/40 bg-background/40/40 p-3 col-span-full lg:col-span-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          Ciclo de Pring — Diagnóstico Intermarket (3 Flechas)
        </span>
        <div className="flex items-center gap-1.5">
          <StageBadge stage={data.stage} />
          <span className={cn("text-[8px] font-mono px-1.5 py-0.5 rounded", data.confianza === "alta" ? "text-green-400" : data.confianza === "media" ? "text-yellow-400" : "text-muted-foreground")}>
            {data.confianza}
          </span>
        </div>
      </div>
      <p className="text-[11px] font-semibold text-foreground mb-1">{data.label}</p>
      <p className="text-[9px] text-muted-foreground mb-2 leading-relaxed">{data.description}</p>

      {/* 3 Arrows visual */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {[
          { label: "Bonos", trend: data.bondsTrend },
          { label: "Acciones", trend: data.stocksTrend },
          { label: "Commodities", trend: data.commoditiesTrend },
        ].map((a) => (
          <div key={a.label} className="rounded border border-border/30 bg-background/30 p-2 text-center">
            <p className="text-[8px] text-muted-foreground/60 font-mono">{a.label}</p>
            <p className={cn("text-sm font-mono font-bold mt-0.5",
              a.trend === "up" ? "text-green-400" : a.trend === "down" ? "text-red-400" : "text-yellow-400")}>
              {a.trend === "up" ? "\u2191" : a.trend === "down" ? "\u2193" : "\u2192"}
            </p>
          </div>
        ))}
      </div>

      {/* Sectores */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[8px] text-green-400/80 font-mono mb-1">Lideran:</p>
          <div className="flex flex-wrap gap-1">
            {data.sectoresLideres.map((s) => (
              <span key={s} className="rounded border border-green-500/20 bg-green-500/10 px-1.5 py-0.5 text-[8px] font-mono text-green-400">{s}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[8px] text-red-400/80 font-mono mb-1">Evitar:</p>
          <div className="flex flex-wrap gap-1">
            {data.sectoresEvitar.map((s) => (
              <span key={s} className="rounded border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[8px] font-mono text-red-400">{s}</span>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── Dow Theory Card ─────────────────────────────────────────────────

function DowTheoryCard({ data }: { data: IntermarketMurphyResult["dowTheory"] }) {
  return (
    <Card className="border-border/40 bg-background/40/40 p-3 col-span-full lg:col-span-1">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          Dow Theory (Murphy Cap. 5)
        </span>
        {data.divergence && <TrendBadge trend={data.divergence} label={data.divergence === "bullish" ? "Div. Alcista" : "Div. Bajista"} />}
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <p className="text-[8px] text-muted-foreground/60 font-mono">Industriales (^DJI)</p>
          <p className={cn("text-sm font-mono font-bold", data.industrialsTrend === "up" ? "text-green-400" : data.industrialsTrend === "down" ? "text-red-400" : "text-yellow-400")}>
            {data.industrialsTrend === "up" ? "\u2191 Alza" : data.industrialsTrend === "down" ? "\u2193 Baja" : "\u2192 Lateral"}
          </p>
        </div>
        <div>
          <p className="text-[8px] text-muted-foreground/60 font-mono">Transportes (^DJT)</p>
          <p className={cn("text-sm font-mono font-bold", data.transportsTrend === "up" ? "text-green-400" : data.transportsTrend === "down" ? "text-red-400" : "text-yellow-400")}>
            {data.transportsTrend === "up" ? "\u2191 Alza" : data.transportsTrend === "down" ? "\u2193 Baja" : "\u2192 Lateral"}
          </p>
        </div>
      </div>
      {data.confirmed && <div className="rounded border border-green-500/30 bg-green-500/10 px-2 py-1 text-[9px] font-mono text-green-400 mb-1">CONFIRMADA</div>}
      <p className="text-[9px] text-muted-foreground leading-relaxed">{data.interpretacion}</p>
    </Card>
  );
}

// ─── Bonds/Stocks Card ───────────────────────────────────────────────

function BondsStocksCard({ data }: { data: IntermarketMurphyResult["bondsStocks"] }) {
  return (
    <Card className="border-border/40 bg-background/40/40 p-3 col-span-full lg:col-span-2">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          Relación Bonos / Stocks (Murphy Cap. 13)
        </span>
        <TrendBadge trend={data.trend} />
      </div>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <div>
          <span className="text-[8px] text-muted-foreground/60 font-mono">TLT (60d)</span>
          <div className={cn("text-sm font-mono font-semibold", (data.tltReturn60d ?? 0) > 0 ? "text-green-400" : "text-red-400")}>{fmtPct(data.tltReturn60d)}</div>
        </div>
        <div>
          <span className="text-[8px] text-muted-foreground/60 font-mono">SPY (60d)</span>
          <div className={cn("text-sm font-mono font-semibold", (data.spyReturn60d ?? 0) > 0 ? "text-green-400" : "text-red-400")}>{fmtPct(data.spyReturn60d)}</div>
        </div>
        <div>
          <span className="text-[8px] text-muted-foreground/60 font-mono">Correlación 60d</span>
          <div className="text-sm font-mono font-semibold text-foreground">{fmtNum(data.correlacion60d, 2)}</div>
        </div>
      </div>
      <div className={cn("rounded border px-2 py-1.5 mb-2 text-[9px] font-mono",
        data.escenario?.includes("DEFLACIÓN") ? "border-blue-500/30 bg-blue-500/10 text-blue-400" :
        data.escenario?.includes("CRECIMIENTO") ? "border-green-500/30 bg-green-500/10 text-green-400" :
        data.escenario?.includes("EXPANSIÓN") ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
        data.escenario?.includes("CONTRACCIÓN") ? "border-red-500/30 bg-red-500/10 text-red-400" :
        "border-border/30 bg-muted/10 text-muted-foreground")}>
        {data.escenario}
      </div>
      <p className="text-[9px] text-muted-foreground leading-relaxed">{data.interpretacion}</p>
    </Card>
  );
}

// ─── Lead/Lag Card ───────────────────────────────────────────────────

function LeadLagCard({ data }: { data: IntermarketMurphyResult["leadLag"] }) {
  return (
    <Card className="border-border/40 bg-background/40/40 p-3 col-span-full lg:col-span-1">
      <div className="mb-2 text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">Lead-Lag Analysis</div>
      <div className="space-y-1">
        {data.map((ll, i) => (
          <div key={i} className="border-b border-border/10 pb-1 last:border-0">
            <p className="text-[9px] font-mono text-foreground">{ll.pair}</p>
            <p className="text-[8px] text-muted-foreground">{ll.leader}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Cross-Asset Card ───────────────────────────────────────────────

function CrossAssetCard({ data }: { data: IntermarketMurphyResult["crossAssetCorrelations"] }) {
  return (
    <Card className="border-border/40 bg-background/40/40 p-3 col-span-full lg:col-span-2">
      <div className="mb-2 text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">Matriz Cross-Asset: DXY vs Sectores</div>
      <p className="mb-2 text-[8px] text-muted-foreground/70 leading-relaxed">Correlación Pearson. Negativa = USD fuerte presiona al sector.</p>
      <div className="space-y-0.5">
        {data.map((c) => (
          <div key={c.pair} className="flex items-center gap-2 border-b border-border/10 py-0.5 text-[9px]">
            <span className="w-28 shrink-0 font-medium text-foreground">{c.assetB}</span>
            <span className={cn("font-mono w-12 text-right",
              c.correlation60d != null && c.correlation60d < -0.3 ? "text-red-400" :
              c.correlation60d != null && c.correlation60d > 0.3 ? "text-green-400" : "text-muted-foreground")}>
              {fmtNum(c.correlation60d, 2)}
            </span>
            <span className="text-[8px] text-muted-foreground w-6">60d</span>
            <span className="font-mono w-12 text-right text-muted-foreground">{fmtNum(c.correlation250d, 2)}</span>
            <span className="text-[8px] text-muted-foreground w-6">250d</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function MurphyIntermarketPanel() {
  const fn = useServerFn(getIntermarketMurphyIndicators);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["intermarket-murphy-v2"],
    queryFn: () => fn(),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-[10px] text-danger">
        Error al cargar indicadores intermarket. Verificar conexión a datos de mercado.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
            Análisis Intermarket Completo — Metodología John Murphy
          </p>
          <p className="text-[8px] text-muted-foreground/60 font-mono mt-0.5">
            Actualizado: {new Date(data.generatedAt).toLocaleString("es-AR")} · Datos: Yahoo Finance
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[8px] text-muted-foreground/60 font-mono">12 ratios · 18+ indicadores</span>
        </div>
      </div>

      {/* ═══════ CYCLE DIAGNOSIS (Principal) ═══════ */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        <CycleCard data={data.cycle} />
        <BondsStocksCard data={data.bondsStocks} />
        <YieldCurveCard data={data.yieldCurve} />
      </div>

      {/* ═══════ DOW THEORY + LEAD/LAG ═══════ */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        <DowTheoryCard data={data.dowTheory} />
        <LeadLagCard data={data.leadLag} />
        {/* Quick summary */}
        <Card className="border-border/40 bg-background/40/40 p-3 col-span-full lg:col-span-1">
          <div className="mb-2 text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">Resumen Rápido</div>
          <div className="space-y-1 text-[9px]">
            <p>Stage: <span className="font-bold text-foreground">{data.cycle.stage}</span> — {data.cycle.label.split("—")[0].trim()}</p>
            <p>Curva: <span className={cn("font-bold", data.yieldCurve.invertida ? "text-red-400" : "text-green-400")}>
              {data.yieldCurve.invertida ? "INVERTIDA" : data.yieldCurve.steepness === "steepening" ? "Steepening" : data.yieldCurve.steepness === "flattening" ? "Flattening" : "Normal"}
            </span></p>
            <p>Bonds/Stocks: <span className="font-bold text-foreground">{data.bondsStocks.escenario}</span></p>
            <p>Confianza: <span className={cn("font-bold", data.cycle.confianza === "alta" ? "text-green-400" : data.cycle.confianza === "media" ? "text-yellow-400" : "text-muted-foreground")}>{data.cycle.confianza}</span></p>
          </div>
        </Card>
      </div>

      {/* ═══════ CORE RATIOS GRID ═══════ */}
      <div>
        <p className="text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground mb-2">Ratios Clave Intermarket</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <RatioCard data={data.crbBonds} title="CRB / Bonds" subtitle="DBC ÷ TLT — Régimen inflación vs desinflación (Cap. 1)" />
          <RatioCard data={data.commoditiesStocks} title="Commodities / Stocks" subtitle="DBC ÷ SPY — Inflación vs Crecimiento" />
          <RatioCard data={data.goldOil} title="Gold / Oil" subtitle="GLD ÷ USO — Incertidumbre vs Demanda (Cap. 4)" />
          <RatioCard data={data.copperGold} title="Copper / Gold (Dr. Copper)" subtitle="HG=F ÷ GLD — Demanda industrial real" />
          <RatioCard data={data.xlyXlp} title="XLY / XLP (Consumo)" subtitle="Disc./Staples — Confianza consumidor (Cap. 6)" />
          <RatioCard data={data.iwmSpy} title="IWM / SPY" subtitle="Small vs Large Caps — Rotación riesgo (Cap. 5)" />
          <RatioCard data={data.ndxSpx} title="NDX / SPX" subtitle="Tech vs Mercado — Liderazgo sectores" />
          <RatioCard data={data.dowGold} title="Dow / Gold" subtitle="Papel vs Activos duros — Ciclo largo (Cap. 11)" />
          <RatioCard data={data.efaEem} title="EFA / EEM" subtitle="Desarrollados vs Emergentes — Riesgo global (Cap. 9)" />
          <RatioCard data={data.growthValue} title="Growth / Value" subtitle="IVW ÷ IVE — Estilo dominante" />
          <RatioCard data={data.hyglqd} title="HYG / LQD (Crédito)" subtitle="High Yield vs IG — Estrés crediticio (Cap. 12)" />
          <RatioCard data={data.tipsSpread} title="TIPS Spread" subtitle="TIP ÷ TNX — Inflación implícita" />
        </div>
      </div>

      {/* ═══════ CROSS-ASSET CORRELATIONS ═══════ */}
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-3">
        <CrossAssetCard data={data.crossAssetCorrelations} />
        <Card className="border-border/40 bg-background/40/40 p-3 col-span-full lg:col-span-1">
          <div className="mb-2 text-[9px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">Secuencia de Murphy</div>
          <div className="space-y-1 text-[9px] font-mono">
            <p className="text-muted-foreground">El orden canónico de los giros:</p>
            <p className="text-foreground">1. Dólar (DXY) <span className="text-muted-foreground">→</span></p>
            <p className="text-foreground">2. Bonos (TLT) <span className="text-muted-foreground">→</span></p>
            <p className="text-foreground">3. Commodities (DBC) <span className="text-muted-foreground">→</span></p>
            <p className="text-foreground">4. Acciones (SPY)</p>
            <p className="text-muted-foreground mt-2">Cuando el orden se rompe, las relaciones intermarket están desacopladas.</p>
          </div>
        </Card>
      </div>
    </div>
  );
}