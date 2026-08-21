import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Layers, Loader2, Search, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getSectorAnalysis,
  type SectorAnalysisResult,
} from "@/lib/herramientas/sector-analysis.functions";
import {
  getSectorValuationRanking,
  type SectorValuationRow,
} from "@/lib/herramientas/sector-valuation-ranking.functions";
import {
  getSectorDailyPerformance,
  type SectorDailyPerf,
} from "@/lib/herramientas/sector-performance.functions";
import {
  getMarketScreeners,
  type MarketScreenersResult,
} from "@/lib/herramientas/daily-opportunities.functions";
import sectoresData from "@/lib/herramientas/sectores.json";
import { cn } from "@/lib/utils";

function fmtPct(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

// ─────────────── Performance diaria sectorial ───────────────

function PerformancePanel() {
  const fn = useServerFn(getSectorDailyPerformance);
  const q = useQuery({
    queryKey: ["sect-perf-diaria"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data)
    return (
      <CardContent className="p-6 text-sm text-muted-foreground">
        Performance no disponible.
      </CardContent>
    );

  const items = (q.data as { items: SectorDailyPerf[] }).items;
  const max = Math.max(...items.map((i) => Math.abs(i.changePercent ?? 0)), 0.01);
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Layers className="h-4 w-4 text-primary" /> Performance sectorial (ETFs SPDR, 5 días)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.map((it) => {
          const v = it.changePercent ?? 0;
          const positivo = v >= 0;
          return (
            <div key={it.key ?? it.etf} className="flex items-center gap-3 text-xs">
              <div className="w-44 shrink-0 truncate text-muted-foreground">{it.label}</div>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-accent/40">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded",
                    positivo ? "bg-emerald-500/30" : "bg-red-500/30",
                  )}
                  style={{ width: `${Math.max(4, (Math.abs(v) / max) * 100)}%` }}
                />
              </div>
              <div
                className={cn(
                  "flex w-16 shrink-0 items-center justify-end gap-1 font-mono",
                  positivo ? "text-emerald-400" : "text-red-400",
                )}
              >
                {positivo ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {fmtPct(it.changePercent)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─────────────── Ranking de valuación sectorial ───────────────

function ValuacionRankingPanel() {
  const fn = useServerFn(getSectorValuationRanking);
  const q = useQuery({
    queryKey: ["sect-valuacion-ranking"],
    queryFn: () => fn(),
    staleTime: 30 * 60_000,
  });

  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data)
    return (
      <CardContent className="p-6 text-sm text-muted-foreground">
        Ranking no disponible.
      </CardContent>
    );

  const rows = (q.data as { rows: SectorValuationRow[] }).rows;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          Valuación relativa por sector (P/E forward vs percentil histórico)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sector</TableHead>
              <TableHead className="text-right">Tickers</TableHead>
              <TableHead className="text-right">P/E fwd promedio</TableHead>
              <TableHead className="text-right">P/E trailing</TableHead>
              <TableHead className="text-right">Pctil P/E mediano</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.sector}>
                <TableCell className="font-medium">{r.sector}</TableCell>
                <TableCell className="text-right font-mono">{r.tickerCount}</TableCell>
                <TableCell className="text-right font-mono">
                  {r.avgForwardPE?.toFixed(1) ?? "s/d"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.avgTrailingPE?.toFixed(1) ?? "s/d"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {r.medianPEPercentile != null ? r.medianPEPercentile.toFixed(0) : "s/d"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─────────────── Análisis por sector / industria ───────────────

type TickerJson = { ticker: string; nombre: string };
type SectoresJson = Record<string, Record<string, TickerJson[]>>;
const SECTORES_DATA = sectoresData as unknown as SectoresJson;
const SECTORES = Object.keys(SECTORES_DATA).sort();

function tickersDe(sector: string, industria: string): TickerJson[] {
  return (SECTORES_DATA[sector]?.[industria] ?? []).map((t) => ({
    ticker: t.ticker,
    nombre: t.nombre,
  }));
}

function AnalisisSectorPanel() {
  const [sector, setSector] = useState(SECTORES[0] ?? "Technology");
  const industrias = useMemo(() => Object.keys(SECTORES_DATA[sector] ?? {}).sort(), [sector]);
  const [industria, setIndustria] = useState(industrias[0] ?? "");
  const fn = useServerFn(getSectorAnalysis);
  const m = useMutation({
    mutationFn: (opts: { sector: string; industry: string }) =>
      fn({
        data: {
          sector: opts.sector,
          industry: opts.industry,
          tickers: tickersDe(opts.sector, opts.industry),
          mode: "completo",
        },
      }),
  });

  const res = m.data as SectorAnalysisResult | undefined;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select
              value={sector}
              onChange={(e) => {
                setSector(e.target.value);
                setIndustria(Object.keys(SECTORES_DATA[e.target.value] ?? {})[0] ?? "");
              }}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Sector"
            >
              {SECTORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={industria}
              onChange={(e) => setIndustria(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Industria"
            >
              {industrias.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
            <Button
              onClick={() => industria && m.mutate({ sector, industry: industria })}
              disabled={m.isPending}
            >
              {m.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Analizar
            </Button>
          </div>
          {m.isError && (
            <p className="text-sm text-red-400">{(m.error as Error)?.message ?? "Error."}</p>
          )}
        </CardContent>
      </Card>

      {m.isPending && <Skeleton className="h-64 w-full" />}

      {res && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {res.sector} · {res.industry}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead className="text-right">Precio</TableHead>
                  <TableHead className="text-right">P/E</TableHead>
                  <TableHead className="text-right">ROE</TableHead>
                  <TableHead className="text-right">Margen neto</TableHead>
                  <TableHead className="text-right">Score fund.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(res.tickers ?? []).map((t) => (
                  <TableRow key={t.ticker}>
                    <TableCell className="font-mono font-medium">{t.ticker}</TableCell>
                    <TableCell className="text-right font-mono">
                      {t.price?.toFixed(2) ?? "s/d"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {t.trailingPE?.toFixed(1) ?? "s/d"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {t.returnOnEquity != null ? `${(t.returnOnEquity * 100).toFixed(1)}%` : "s/d"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {t.profitMargin != null ? `${(t.profitMargin * 100).toFixed(1)}%` : "s/d"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {t.fundScore?.toFixed(1) ?? "s/d"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─────────────── Oportunidades del día ───────────────

function OportunidadesPanel() {
  const fnScreeners = useServerFn(getMarketScreeners);
  const q = useQuery({
    queryKey: ["sect-screeners"],
    queryFn: () => fnScreeners(),
    staleTime: 15 * 60_000,
  });

  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data)
    return (
      <CardContent className="p-6 text-sm text-muted-foreground">
        Screener no disponible.
      </CardContent>
    );

  const d = q.data as MarketScreenersResult;
  const grupos = [
    { key: "day_gainers", label: "Mayores alzas" },
    { key: "day_losers", label: "Mayores bajas" },
    { key: "most_actives", label: "Más operados" },
  ] as const;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {grupos.map((g) => (
        <Card key={g.key}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-primary" /> {g.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {(d[g.key] ?? []).slice(0, 8).map((it) => (
                <li key={it.symbol} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-mono font-medium">{it.symbol}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-muted-foreground">
                      {it.price != null ? `$${it.price.toFixed(2)}` : ""}
                    </span>
                    <span
                      className={cn(
                        "w-14 text-right font-mono",
                        (it.percentChange ?? 0) >= 0 ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {fmtPct(it.percentChange)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function SectoresTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Análisis sectorial</h2>
        <p className="text-sm text-muted-foreground">
          Rotación sectorial con ETFs SPDR, valuación relativa, fundamentales por industria y
          screeners del día.
        </p>
      </div>
      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="valuacion">Valuación</TabsTrigger>
          <TabsTrigger value="industria">Por industria</TabsTrigger>
          <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
        </TabsList>
        <TabsContent value="performance" className="mt-4">
          <PerformancePanel />
        </TabsContent>
        <TabsContent value="valuacion" className="mt-4">
          <ValuacionRankingPanel />
        </TabsContent>
        <TabsContent value="industria" className="mt-4">
          <AnalisisSectorPanel />
        </TabsContent>
        <TabsContent value="oportunidades" className="mt-4">
          <OportunidadesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
