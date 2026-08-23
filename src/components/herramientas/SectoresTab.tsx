// @ts-nocheck
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  Layers,
  Loader2,
  Search,
  Sparkles,
  BarChart3,
  Grid3x3,
  TrendingUp,
  Target,
  Activity,
  Zap,
  ChevronDown,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { getSectorAnalysis, getSectorEtfFit } from "@/lib/herramientas/sector-analysis.functions";
import type {
  SectorAnalysisResult,
  EtfFitResult,
} from "@/lib/herramientas/sector-analysis.functions";
import { getSectorValuationRanking } from "@/lib/herramientas/sector-valuation-ranking.functions";
import type { SectorValuationRow } from "@/lib/herramientas/sector-valuation-ranking.functions";
import { getSectorDailyPerformance } from "@/lib/herramientas/sector-performance.functions";
import type { SectorDailyPerf } from "@/lib/herramientas/sector-performance.functions";
import {
  getMarketScreeners,
  type MarketScreenersResult,
} from "@/lib/herramientas/daily-opportunities.functions";
import { getSectorValuationByTicker } from "@/lib/herramientas/sector-valuation.functions";
import { getBenchmarksMatrix } from "@/lib/sectores/benchmarks-matrix.functions";
import type { BenchmarksMatrixResult } from "@/lib/sectores/benchmarks-matrix.functions";
import BENCHMARKS_COMPLETE from "@/lib/sectores/benchmarks-complete.json";
import ETF_NAMES from "@/lib/sectores/etf-names.json";
import { getMatrizCAPM } from "@/lib/herramientas/capm.functions";
import type { MatrizCAPMResult } from "@/lib/herramientas/capm.functions";
import sectoresData from "@/lib/herramientas/sectores.json";
import { cn } from "@/lib/utils";
import { getFlatTickerList } from "@/lib/universos";

// ── Cohortes homogéneas (nunca comparar tipo/moneda/mercado distintos) ────────
// Guía: unificado_completo.json (tipo: accion|cedear · moneda: ARS|USD ·
// mercado: BCBA|NYSE/NASDAQ). Fowler Newton: moneda homogénea. Pascale:
// comparables homogéneos. Un CEDEAR replica al subyacente: NO es comparable
// con la acción local ni con la acción US original.
type CohorteKey = "BCBA_ARS" | "CEDear_ARS" | "CEDear_USD" | "US_USD";
const COHORTES: Record<CohorteKey, { label: string; corto: string }> = {
  BCBA_ARS: { label: "Acciones BCBA · ARS", corto: "BCBA ARS" },
  CEDear_ARS: { label: "CEDEARs BCBA · ARS", corto: "CEDEAR ARS" },
  CEDear_USD: { label: "CEDEARs BCBA · USD", corto: "CEDEAR USD" },
  US_USD: { label: "Acciones EE.UU. · USD", corto: "EE.UU. USD" },
};

// Meta por ticker desde unificado_completo.json (una sola vez)
const META_TICKER = new Map<string, { tipo?: string; moneda?: string; mercado?: string }>(
  getFlatTickerList().map((t) => [t.ticker.toUpperCase(), { tipo: t.tipo, moneda: t.moneda, mercado: t.mercado }]),
);

export function clasificarCohorte(ticker: string): CohorteKey {
  const tk = ticker.toUpperCase();
  const meta = META_TICKER.get(tk);
  if (meta?.mercado === "BCBA") {
    if (meta.tipo === "cedear") return meta.moneda === "USD" ? "CEDear_USD" : "CEDear_ARS";
    return "BCBA_ARS";
  }
  if (meta?.mercado === "NYSE/NASDAQ") return "US_USD";
  // Fallback determinístico si no está en el mapa
  if (tk.endsWith(".BA")) return "BCBA_ARS";
  if (/^[A-Z0-9]{1,6}D$/.test(tk)) return "CEDear_USD"; // sufijo D = dólar CED
  return "US_USD";
}

const ORDEN_COHORTES: CohorteKey[] = ["BCBA_ARS", "CEDear_ARS", "CEDear_USD", "US_USD"];
// Sector components (Clarity parity)
import { SectorPerformanceBars } from "@/components/sectores/SectorPerformanceBars";
import { SectorRelStrengthPanel } from "@/components/sectores/SectorRelStrengthPanel";
import { MurphyIntermarketPanel } from "@/components/sectores/MurphyIntermarketPanel";
import { SectorImpactSimulator } from "@/components/sectores/SectorImpactSimulator";
import { DecouplingMonitor } from "@/components/herramientas/DecouplingMonitor";
import { IntermarketRatiosPanel } from "@/components/herramientas/IntermarketRatiosPanel";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

function fmtPct(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

// ── Shared selector state hook (extracted from Clarity SectoresPage) ──
type TickerJson = {
  ticker: string;
  nombre: string;
  tipo?: string;
  moneda?: string;
  mercado?: string;
  pais?: string;
};
type SectoresJson = Record<string, Record<string, TickerJson[]>>;
const SECTORES_DATA = sectoresData as unknown as SectoresJson;
const SECTORES = Object.keys(SECTORES_DATA).sort();

function enriquecerTicker(t: TickerJson): Required<TickerJson> {
  const tk = t.ticker.toUpperCase();
  let tipo = (t.tipo || "").toLowerCase();
  let moneda = (t.moneda || "").toUpperCase();
  let mercado = (t.mercado || "").toUpperCase();
  let pais = t.pais || "";
  if (!tipo)
    tipo = tk.includes(".BA")
      ? "cedear"
      : tk.length <= 5 && /^[A-Z]+$/.test(tk)
        ? "accion"
        : "accion";
  if (!moneda)
    moneda = tk.endsWith("D") && !tk.includes(".") ? "USD" : tk.includes(".BA") ? "ARS" : "USD";
  if (!mercado) mercado = tk.includes(".BA") || moneda === "ARS" ? "BCBA" : "NYSE/NASDAQ";
  if (!pais)
    pais =
      mercado === "BCBA" && moneda === "USD"
        ? "EE.UU."
        : mercado === "BCBA"
          ? "Argentina"
          : "EE.UU.";
  return { ticker: t.ticker, nombre: t.nombre || "—", tipo, moneda, mercado, pais };
}
function badgeTipo(tipo: string) {
  const t = tipo.toLowerCase();
  if (t === "cedear") return "bg-violet-500/20 text-violet-300 border-violet-500/30";
  if (t === "accion") return "bg-blue-500/20 text-blue-300 border-blue-500/30";
  if (t === "etf") return "bg-emerald-500/20 text-emerald-300 border-emerald-500/30";
  if (t.includes("bono") || t.includes("on"))
    return "bg-amber-500/20 text-amber-300 border-amber-500/30";
  return "bg-zinc-500/20 text-zinc-300 border-zinc-500/30";
}
function badgeMoneda(moneda: string) {
  return moneda === "ARS"
    ? "bg-orange-500/15 text-orange-300 border-orange-500/30"
    : "bg-green-500/15 text-green-300 border-green-500/30";
}

// ── Performance (live 5d) + SectorImpact + RelStrength ──
function PerformanceFullPanel({
  sectorFilter,
  tickersFromFilter,
}: {
  sectorFilter: string;
  tickersFromFilter: TickerJson[];
}) {
  const fn = useServerFn(getSectorDailyPerformance);
  const q = useQuery({
    queryKey: ["sect-perf-diaria"],
    queryFn: () => fn(),
    staleTime: 5 * 60_000,
  });
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Layers className="h-4 w-4 text-primary" /> Performance sectorial (ETFs SPDR, 5 días)
          </CardTitle>
          <p className="text-[13px] text-muted-foreground">
            Fuente: Yahoo Finance · ETFs XLB/XLE/XLF/XLI/XLK/XLP/XLU etc. · Delay 15’ · Barras
            normalizadas por maxAbs
          </p>
        </CardHeader>
        <CardContent>
          {q.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : q.isError || !q.data ? (
            <p className="text-[13px] text-muted-foreground">Performance no disponible.</p>
          ) : (
            (() => {
              const items = (q.data as { items: SectorDailyPerf[] }).items;
              const max = Math.max(...items.map((i) => Math.abs(i.changePercent ?? 0)), 0.01);
              return (
                <div className="space-y-2">
                  {items.map((it) => {
                    const v = it.changePercent ?? 0;
                    const positivo = v >= 0;
                    return (
                      <div key={it.key ?? it.etf} className="flex items-center gap-5 text-[13px]">
                        <div className="w-48 shrink-0 truncate text-muted-foreground flex items-center gap-1.5 justify-end">
                          <span>{it.label}</span>
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: (it as any).dot ?? "#888" }}
                          />
                        </div>
                        <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/30">
                          <div
                            className={cn(
                              "absolute inset-y-0 left-0 rounded",
                              positivo ? "bg-emerald-500" : "bg-red-500",
                            )}
                            style={{ width: `${Math.max(6, (Math.abs(v) / max) * 100)}%` }}
                          />
                        </div>
                        <div
                          className={cn(
                            "flex w-20 shrink-0 items-center justify-end gap-1 font-mono text-[13px]",
                            positivo ? "text-emerald-400" : "text-red-400",
                          )}
                        >
                          {positivo ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          )}
                          {fmtPct(it.changePercent)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Activity className="h-4 w-4 text-primary" /> Fuerza relativa vs SPY (multi-timeframe)
          </CardTitle>
          <p className="text-[13px] text-muted-foreground">
            Ratio sector/SPY · Pendiente por regresión lineal 20/60/120d · Fuente: Yahoo Finance
          </p>
        </CardHeader>
        <CardContent>
          <SectorRelStrengthPanel />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <Zap className="h-4 w-4 text-primary" /> Simulador de impacto sectorial (β)
          </CardTitle>
          <p className="text-[13px] text-muted-foreground">
            Si un sector se mueve X%, ¿cuánto se moverían los demás? Basado en beta y R² (ventana
            1Y/2Y). Metodología John Murphy.
          </p>
        </CardHeader>
        <CardContent>
          <SectorImpactSimulator />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Panel análisis sector/industria + normalized chart + comparación ──
function PanelFull({
  sectorFilter,
  setSectorFilter,
  industryFilter,
  setIndustryFilter,
  result,
  loading,
  error,
  handleRun,
  tickersFromFilter,
  sectorList,
  industryList,
  periodoNorm,
  setPeriodoNorm,
  normChartData,
  periodColors,
  comparacionSectores,
  setComparacionSectores,
  comparacionData,
  comparacionLoading,
  comparacionError,
  handleCompararSectores,
}: any) {
  return (
    <div className="space-y-4">
      {result && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-[14px]">
                {result.sector} · {result.industry} — {result.tickers.length} tickers
              </CardTitle>
              <p className="text-[13px] text-muted-foreground">
                Fuente: Yahoo Finance · Fundamentales trailing · Score 0-100 · Percentiles
                intra-sector
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead className="text-right">Precio</TableHead>
                      <TableHead className="text-right">P/E</TableHead>
                      <TableHead className="text-right">ROE</TableHead>
                      <TableHead className="text-right">Margen</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Industria</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(result.tickers ?? []).map((t: any) => (
                      <TableRow key={t.ticker}>
                        <TableCell className="font-mono font-medium">{t.ticker}</TableCell>
                        <TableCell className="text-right font-mono">
                          {t.price?.toFixed(2) ?? "s/d"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {t.trailingPE?.toFixed(1) ?? "s/d"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {t.returnOnEquity != null
                            ? `${(t.returnOnEquity * 100).toFixed(1)}%`
                            : "s/d"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {t.profitMargin != null ? `${(t.profitMargin * 100).toFixed(1)}%` : "s/d"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {t.fundScore?.toFixed(1) ?? "s/d"}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {t.industry ?? result.industry}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-[14px] flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Caminos normalizados ({periodoNorm})
                — base 100
              </CardTitle>
              <select
                value={periodoNorm}
                onChange={(e) => setPeriodoNorm(e.target.value)}
                className="rounded border bg-background px-2 py-1 text-[11px]"
              >
                <option value="1Y">1Y</option>
                <option value="2Y">2Y</option>
                <option value="5Y">5Y</option>
                <option value="10Y">10Y</option>
              </select>
            </CardHeader>
            <CardContent>
              {normChartData.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">
                  Sin datos de caminos normalizados.
                </p>
              ) : (
                <div className="h-[320px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={normChartData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="hsl(var(--border))"
                        opacity={0.3}
                      />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 9 }}
                        interval="preserveStartEnd"
                        minTickGap={40}
                      />
                      <YAxis tick={{ fontSize: 9 }} domain={["auto", "auto"]} />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {result.tickers.slice(0, 10).map((t: any, i: number) => (
                        <Line
                          key={t.ticker}
                          type="monotone"
                          dataKey={t.ticker}
                          stroke={periodColors[i % periodColors.length]}
                          dot={false}
                          strokeWidth={1.5}
                        />
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
          <CardHeader>
            <CardTitle className="text-[14px]">Comparación entre sectores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sector</TableHead>
                    <TableHead className="text-right">Tickers</TableHead>
                    <TableHead className="text-right">Avg P/E</TableHead>
                    <TableHead className="text-right">Avg ROE</TableHead>
                    <TableHead className="text-right">Score medio</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(comparacionData).map(
                    ([sec, d]: any) =>
                      d && (
                        <TableRow key={sec}>
                          <TableCell className="font-medium">{sec}</TableCell>
                          <TableCell className="text-right font-mono">{d.tickers.length}</TableCell>
                          <TableCell className="text-right font-mono">
                            {d.avgPE?.toFixed?.(1) ??
                              (
                                d.tickers.reduce(
                                  (s: number, t: any) => s + (t.trailingPE ?? 0),
                                  0,
                                ) / d.tickers.length
                              ).toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {d.avgROE != null ? (d.avgROE * 100).toFixed(1) + "%" : "s/d"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {d.avgScore?.toFixed?.(1) ?? "s/d"}
                          </TableCell>
                        </TableRow>
                      ),
                  )}
                </TableBody>
              </Table>
            </div>
            {comparacionError && (
              <p className="text-[11px] text-amber-400 mt-2">{comparacionError}</p>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[13px]">Fuerza relativa sectorial (contexto)</CardTitle>
        </CardHeader>
        <CardContent>
          <SectorRelStrengthPanel />
        </CardContent>
      </Card>
    </div>
  );
}

// ── Matriz con selector métrica ──
function MatrizPanelFull({ sectorFilter }: { sectorFilter: string }) {
  const [sector, setSector] = useState(SECTORES[0] ?? "Technology");
  const [metric, setMetric] = useState<"correlation" | "beta" | "rSquared">("correlation");
  useEffect(() => {
    if (sectorFilter) setSector(sectorFilter);
  }, [sectorFilter]);
  const tickers = useMemo(() => {
    const data = SECTORES_DATA[sector] ?? {};
    const all: TickerJson[] = [];
    for (const ind of Object.keys(data))
      for (const t of data[ind]) if (!all.find((x) => x.ticker === t.ticker)) all.push(t);
    return all.slice(0, 12);
  }, [sector]);
  const fn = useServerFn(getSectorEtfFit);
  const q = useQuery({
    queryKey: ["matriz-etf-fit", sector],
    queryFn: () => fn({ data: { sector, tickers } }),
    enabled: tickers.length >= 2,
    staleTime: 30 * 60_000,
  });
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError)
    return (
      <Card>
        <CardContent className="p-6 text-[13px] text-muted-foreground">
          Matriz no disponible.
        </CardContent>
      </Card>
    );
  const rows = (q.data as any)?.etfResults as EtfFitResult[] | undefined;
  if (!rows || rows.length === 0)
    return (
      <Card>
        <CardContent className="p-6 text-[13px] text-muted-foreground">Sin datos.</CardContent>
      </Card>
    );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-[14px] flex items-center gap-2">
            <Grid3x3 className="h-4 w-4 text-primary" /> Matriz — {sector}
          </CardTitle>
          <p className="text-[13px] text-muted-foreground">
            Corr/Beta/R² vs ETFs sectoriales · 1Y retornos diarios
          </p>
        </div>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as any)}
          className="rounded border bg-background px-2 py-1 text-[11px]"
        >
          <option value="correlation">Correlación</option>
          <option value="beta">Beta</option>
          <option value="rSquared">R²</option>
        </select>
      </CardHeader>
      <CardContent>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="mb-3 w-full max-w-xs rounded border bg-background px-2 py-1.5 text-[12px]"
        >
          {SECTORES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ETF</TableHead>
                <TableHead className="text-right">Corr</TableHead>
                <TableHead className="text-right">Beta</TableHead>
                <TableHead className="text-right">R²</TableHead>
                <TableHead>Nombre</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.slice(0, 12).map((r) => (
                <TableRow key={r.etf}>
                  <TableCell className="font-mono font-medium">{r.etf}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      metric === "correlation" && "bg-primary/10",
                    )}
                  >
                    {r.correlation?.toFixed(3) ?? "s/d"}
                  </TableCell>
                  <TableCell
                    className={cn("text-right font-mono", metric === "beta" && "bg-primary/10")}
                  >
                    {r.beta?.toFixed(2) ?? "s/d"}
                  </TableCell>
                  <TableCell
                    className={cn("text-right font-mono", metric === "rSquared" && "bg-primary/10")}
                  >
                    {r.rSquared?.toFixed(3) ?? "s/d"}
                  </TableCell>
                  <TableCell className="text-[11px] text-muted-foreground">
                    {(r as any).name ?? r.etf}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ValuacionPanel() {
  const fn = useServerFn(getSectorValuationRanking);
  const q = useQuery({
    queryKey: ["sect-valuacion-ranking"],
    queryFn: () => fn(),
    staleTime: 30 * 60_000,
  });
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data)
    return (
      <Card>
        <CardContent className="p-6 text-[13px] text-muted-foreground">
          Ranking no disponible.
        </CardContent>
      </Card>
    );
  const rows = (q.data as { rows: SectorValuationRow[] }).rows;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-[14px]">Valuación relativa por sector</CardTitle>
        <p className="text-[13px] text-muted-foreground">
          P/E forward vs percentil histórico · Fuente: Yahoo Finance
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sector</TableHead>
                <TableHead className="text-right">Tickers</TableHead>
                <TableHead className="text-right">P/E fwd</TableHead>
                <TableHead className="text-right">P/E trail</TableHead>
                <TableHead className="text-right">Pctil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.sector}>
                  <TableCell className="text-[13px] font-medium">{r.sector}</TableCell>
                  <TableCell className="text-right font-mono text-[13px]">
                    {r.tickerCount}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px]">
                    {r.avgForwardPE?.toFixed(1) ?? "s/d"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px]">
                    {r.avgTrailingPE?.toFixed(1) ?? "s/d"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px]">
                    {r.medianPEPercentile?.toFixed(0) ?? "s/d"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function OportunidadesPanel2() {
  const fn = useServerFn(getMarketScreeners);
  const q = useQuery({ queryKey: ["sect-screeners"], queryFn: () => fn(), staleTime: 15 * 60_000 });
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data)
    return (
      <Card>
        <CardContent className="p-6 text-[13px] text-muted-foreground">
          Screener no disponible.
        </CardContent>
      </Card>
    );
  const d = q.data as MarketScreenersResult;
  const grupos = [
    { key: "day_gainers", label: "Mayores alzas" },
    { key: "day_losers", label: "Mayores bajas" },
    { key: "most_actives", label: "Más operados" },
  ] as const;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {grupos.map((g) => (
        <Card key={g.key}>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <Sparkles className="h-4 w-4 text-primary" /> {g.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(d[g.key] ?? []).slice(0, 8).map((it) => (
                <li
                  key={it.symbol}
                  className="flex items-baseline justify-between gap-2 text-[13px]"
                >
                  <span className="font-mono font-medium">{it.symbol}</span>
                  <span className="flex items-baseline gap-2">
                    <span className="font-mono text-muted-foreground text-[11px]">
                      {it.price != null ? `$${it.price.toFixed(2)}` : ""}
                    </span>
                    <span
                      className={cn(
                        "w-16 text-right font-mono text-[13px]",
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

const ETF_TO_SECTOR_REV: Record<string, string> = {
  Technology: "XLK",
  "Financial Services": "XLF",
  Energy: "XLE",
  Healthcare: "XLV",
  "Consumer Defensive": "XLP",
  "Consumer Cyclical": "XLY",
  "Basic Materials": "XLB",
  Industrials: "XLI",
  Utilities: "XLU",
  "Communication Services": "XLC",
  "Real Estate": "XLRE",
};

function BenchmarksPanel({ sectorFilter }: { sectorFilter?: string } = {}) {
  const fn = useServerFn(getBenchmarksMatrix);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["benchmarks-matrix"],
    queryFn: () => fn(),
    staleTime: 60 * 60 * 1000,
  });
  const [matrixMetric, setMatrixMetric] = useState<"correlation" | "beta" | "alpha" | "r2">(
    "correlation",
  );
  const [selectedBenchmark, setSelectedBenchmark] = useState("SPY");
  const metricLabels: Record<string, string> = {
    correlation: "Correlación",
    beta: "Beta",
    alpha: "Alpha",
    r2: "R²",
  };
  const BM_LIST = BENCHMARKS_COMPLETE as Record<string, { name: string; cat: string; sub: string }>;
  const benchmarkOptions = (
    data?.returns
      ? Object.entries(BM_LIST)
          .filter(([ticker]) => data.returns[ticker]?.length > 0 || ticker === "SPY")
          .map(([ticker, info]) => ({ ticker, name: info.name, cat: info.cat, sub: info.sub }))
      : [{ ticker: "SPY", name: "S&P 500", cat: "Market", sub: "US" }]
  ).sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  if (!benchmarkOptions.some((b) => b.ticker === "SPY"))
    benchmarkOptions.unshift({ ticker: "SPY", name: "S&P 500", cat: "Market", sub: "US" });
  const etfs = data
    ? sectorFilter
      ? data.betas.filter((b) => b.etf === (ETF_TO_SECTOR_REV[sectorFilter] ?? ""))
      : data.betas
    : [];
  const etfName = (ticker: string) => (ETF_NAMES as Record<string, string>)[ticker] ?? ticker;

  if (isLoading)
    return (
      <Card>
        <CardContent className="p-10 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Calculando matriz de benchmarks…</p>
        </CardContent>
      </Card>
    );
  if (isError || !data)
    return (
      <Card>
        <CardContent className="p-10 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No hay datos disponibles. Reintente más tarde.
          </p>
        </CardContent>
      </Card>
    );

  const getBetaForBM = (etfTicker: string) => {
    if (selectedBenchmark === "SPY") {
      const b = data.betas.find((x) => x.etf === etfTicker);
      return b ? { beta: b.betaVsSPY, alpha: b.alpha, r2: b.r2, perfil: b.perfil } : null;
    }
    const multi = data.multiBetas?.find((m) => m.benchmark === selectedBenchmark);
    if (multi) {
      const e = multi.entries.find((x) => x.etf === etfTicker);
      if (e) return { beta: e.beta, alpha: e.alpha, r2: e.r2, perfil: e.perfil };
    }
    const bmRet = data.returns[selectedBenchmark];
    const assetRet = data.returns[etfTicker];
    if (!bmRet || !assetRet || bmRet.length < 10 || assetRet.length < 10) return null;
    const n = Math.min(assetRet.length, bmRet.length);
    const x = assetRet.slice(-n),
      y = bmRet.slice(-n);
    const mx = x.reduce((s, v) => s + v, 0) / n,
      my = y.reduce((s, v) => s + v, 0) / n;
    let cov = 0,
      vx = 0,
      vy = 0;
    for (let k = 0; k < n; k++) {
      const dx = x[k] - mx,
        dy = y[k] - my;
      cov += dx * dy;
      vx += dx * dx;
      vy += dy * dy;
    }
    const beta = vy > 0 ? cov / vy : 0;
    const alpha = mx - beta * my;
    const r = Math.sqrt(vx * vy) > 0 ? cov / Math.sqrt(vx * vy) : 0;
    return {
      beta: Math.round(beta * 100) / 100,
      alpha: Math.round(alpha * 10000) / 10000,
      r2: Math.round(r * r * 100) / 100,
      perfil: beta < 0.8 ? "Defensivo" : beta > 1.2 ? "Agresivo/Cíclico" : "Neutral",
    };
  };

  const corrLookup = new Map<string, number>();
  for (const row of data.matrix) {
    corrLookup.set(`${row.etfA}:${row.etfB}`, row.correlation);
    corrLookup.set(`${row.etfB}:${row.etfA}`, row.correlation);
  }
  const pairwiseCache = new Map<string, { beta: number; alpha: number; r2: number }>();
  const getPairwise = (a: string, b: string) => {
    const key = `${a}:${b}`;
    const cached = pairwiseCache.get(key);
    if (cached) return cached;
    const rA = data.returns[a],
      rB = data.returns[b];
    if (!rA || !rB || rA.length < 10 || rB.length < 10) {
      const e = { beta: 0, alpha: 0, r2: 0 };
      pairwiseCache.set(key, e);
      return e;
    }
    const n = Math.min(rA.length, rB.length);
    const x = rA.slice(-n),
      y = rB.slice(-n);
    const mx = x.reduce((s, v) => s + v, 0) / n,
      my = y.reduce((s, v) => s + v, 0) / n;
    let cov = 0,
      vx = 0,
      vy = 0;
    for (let k = 0; k < n; k++) {
      const dx = x[k] - mx,
        dy = y[k] - my;
      cov += dx * dy;
      vx += dx * dx;
      vy += dy * dy;
    }
    const beta = vy > 0 ? cov / vy : 0;
    const alpha = mx - beta * my;
    const r = Math.sqrt(vx * vy) > 0 ? cov / Math.sqrt(vx * vy) : 0;
    const res = {
      beta: Math.round(beta * 100) / 100,
      alpha: Math.round(alpha * 10000) / 10000,
      r2: Math.round(r * r * 100) / 100,
    };
    pairwiseCache.set(key, res);
    pairwiseCache.set(`${b}:${a}`, res);
    return res;
  };
  const getVal = (a: string, b: string) => {
    if (a === b) return matrixMetric === "correlation" ? 1 : matrixMetric === "beta" ? 1 : 0;
    if (matrixMetric === "correlation") return corrLookup.get(`${a}:${b}`) ?? 0;
    if (matrixMetric === "beta") return getPairwise(a, b).beta;
    if (matrixMetric === "alpha") return getPairwise(a, b).alpha;
    if (matrixMetric === "r2") return getPairwise(a, b).r2;
    return null;
  };
  const heatColor = (val: number, metric: string) => {
    if (metric === "correlation") {
      if (val >= 0.7) return `rgba(34,197,94,${0.2 + val * 0.4})`;
      if (val >= 0.4) return `rgba(251,191,36,${0.1 + val * 0.3})`;
      return `rgba(107,114,128,${0.05 + val * 0.15})`;
    }
    if (metric === "beta")
      return val > 1.2
        ? `rgba(239,68,68,${Math.min((val - 1) * 1.5, 0.3)})`
        : val < 0.8
          ? `rgba(16,185,129,${Math.min((0.8 - val) * 1.5, 0.3)})`
          : `rgba(107,114,128,0.05)`;
    if (metric === "alpha")
      return val > 0
        ? `rgba(16,185,129,${Math.min(val * 5, 0.3)})`
        : val < 0
          ? `rgba(239,68,68,${Math.min(Math.abs(val) * 5, 0.3)})`
          : "transparent";
    if (metric === "r2") return `rgba(59,130,246,${val * 0.4})`;
    return "transparent";
  };
  const fmtVal = (val: number, metric: string) => {
    if (metric === "alpha") return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
    return val.toFixed(2);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[14px]">
            <BarChart3 className="h-4 w-4 text-primary" /> Benchmarks principales
          </CardTitle>
          <p className="text-[13px] text-muted-foreground">
            Correlación 2Y semanal · {data.betas.length} activos · Régimen:{" "}
            <span className="font-medium text-foreground">{data.macroFilter.regimeLabel}</span>{" "}
            {data.macroFilter.crbBondsTrend &&
              `· CRB/Bonds ${(data.macroFilter.crbBondsChange1m! * 100).toFixed(1)}% (1M)`}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {(["correlation", "beta", "alpha", "r2"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMatrixMetric(m)}
                  className={`font-mono text-[10px] px-2 py-1 rounded-md border transition-colors ${matrixMetric === m ? "border-primary/60 bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
                >
                  {metricLabels[m]}
                </button>
              ))}
            </div>
            {matrixMetric !== "correlation" && (
              <div className="flex items-center gap-1.5 ml-2">
                <span className="text-[9px] text-muted-foreground">vs</span>
                <select
                  value={selectedBenchmark}
                  onChange={(e) => setSelectedBenchmark(e.target.value)}
                  className="bg-background border border-border/60 text-foreground text-[10px] rounded-md px-1.5 py-1"
                >
                  {benchmarkOptions.map((b) => (
                    <option key={b.ticker} value={b.ticker}>
                      {b.name} ({b.ticker})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="overflow-x-auto w-full">
            <table
              className="font-mono text-[11px]"
              style={{ borderCollapse: "collapse", width: "100%" }}
            >
              <thead>
                <tr className="border-b border-border/30">
                  <th className="px-1 py-0.5 text-left text-[9px] uppercase tracking-wider text-muted-foreground/60 w-14">
                    vs
                  </th>
                  {etfs.map((b) => (
                    <th
                      key={b.etf}
                      className="px-1 py-0.5 text-center text-[9px] font-medium"
                      title={`${b.etf} - ${etfName(b.etf)}`}
                    >
                      <div>{b.etf}</div>
                      <div className="text-[6px] text-muted-foreground/50 font-normal">
                        {etfName(b.etf)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {etfs.map((b1) => (
                  <tr key={b1.etf} className="border-b border-border/10">
                    <td className="px-1 py-0.5 text-right text-[9px] font-medium whitespace-nowrap">
                      {b1.etf}
                      <div className="text-[6px] text-muted-foreground/50 font-normal">
                        {etfName(b1.etf)}
                      </div>
                    </td>
                    {etfs.map((b2) => {
                      const val = b1.etf === b2.etf ? null : getVal(b1.etf, b2.etf);
                      const bg =
                        b1.etf === b2.etf ? "transparent" : heatColor(val ?? 0, matrixMetric);
                      return (
                        <td
                          key={b2.etf}
                          className="px-1 py-0.5 text-center font-mono text-[10px]"
                          style={{ background: bg }}
                        >
                          {b1.etf === b2.etf ? (
                            <span className="text-muted-foreground/30">—</span>
                          ) : (
                            fmtVal(val ?? 0, matrixMetric)
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-[14px]">
              Beta vs{" "}
              {benchmarkOptions.find((b) => b.ticker === selectedBenchmark)?.name ??
                selectedBenchmark}{" "}
              por sector
            </CardTitle>
            <select
              value={selectedBenchmark}
              onChange={(e) => setSelectedBenchmark(e.target.value)}
              className="bg-background border border-border/60 text-foreground text-[10px] rounded-md px-1.5 py-1"
            >
              {benchmarkOptions.map((b) => (
                <option key={b.ticker} value={b.ticker}>
                  {b.name} ({b.ticker})
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ETF</TableHead>
                <TableHead>Sector</TableHead>
                <TableHead className="text-right">Beta</TableHead>
                <TableHead className="text-right">Alpha</TableHead>
                <TableHead className="text-right">R²</TableHead>
                <TableHead className="text-center">Perfil</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {etfs.map((b) => {
                const bm = getBetaForBM(b.etf);
                if (!bm) return null;
                const betaColor =
                  bm.beta > 1.2 ? "text-amber-400" : bm.beta < 0.8 ? "text-emerald-400" : "";
                return (
                  <TableRow key={b.etf}>
                    <TableCell className="font-mono font-medium">{b.etf}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground">
                      {etfName(b.etf)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${betaColor}`}>
                      {bm.beta.toFixed(2)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono ${bm.alpha >= 0 ? "text-emerald-400" : "text-red-400"}`}
                    >
                      {(bm.alpha * 100).toFixed(2)}%
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.min(bm.r2 * 100, 100)}%` }}
                          />
                        </div>
                        <span>{bm.r2.toFixed(2)}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`inline-block rounded border px-1.5 py-0.5 text-[9px] ${bm.perfil === "Defensivo" ? "border-emerald-800/40 bg-emerald-950/30 text-emerald-400" : bm.perfil === "Neutral" ? "border-border/40 bg-muted/20 text-muted-foreground" : "border-amber-800/40 bg-amber-950/30 text-amber-400"}`}
                      >
                        {bm.perfil}
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="mt-2 text-[9px] text-muted-foreground/60 leading-relaxed">
            <strong>Beta &lt; 0.8</strong> defensivo · <strong>0.8–1.2</strong> neutral ·{" "}
            <strong>&gt; 1.2</strong> agresivo. <strong>R²</strong> = % de movimientos explicados
            por el benchmark.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[12px] text-emerald-400">
              Menos correlacionados — mejores para diversificar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.mejoresParaDiversificar.map((r) => (
              <div
                key={`${r.etfA}-${r.etfB}`}
                className="flex items-center justify-between text-[12px]"
              >
                <span className="font-mono">
                  {r.etfA} <span className="text-muted-foreground">↔</span> {r.etfB}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {r.sectorA} / {r.sectorB}
                </span>
                <span className="font-mono text-emerald-400">{r.correlation.toFixed(2)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[12px] text-amber-400">
              Más redundantes — evitar duplicar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {data.masRedundantes.map((r) => (
              <div
                key={`${r.etfA}-${r.etfB}`}
                className="flex items-center justify-between text-[12px]"
              >
                <span className="font-mono">
                  {r.etfA} <span className="text-muted-foreground">↔</span> {r.etfB}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {r.sectorA} / {r.sectorB}
                </span>
                <span className="font-mono text-amber-400">{r.correlation.toFixed(2)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {data.macroFilter.sectoresFavorecidos.length > 0 && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <p className="text-[12px] font-medium">
              Régimen {data.macroFilter.regimeLabel} · Favorecidos:{" "}
              <span className="text-emerald-400">
                {data.macroFilter.sectoresFavorecidos.join(", ")}
              </span>{" "}
              · Desfavorecidos:{" "}
              <span className="text-amber-400">
                {data.macroFilter.sectoresDesfavorecidos.join(", ")}
              </span>
            </p>
          </CardContent>
        </Card>
      )}
      {data.cuellosBotella.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-[12px]">Cuellos de botella estructurales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.cuellosBotella.map((c) => (
              <div key={c.sectorKey} className="rounded border border-border/20 bg-muted/10 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium">{c.label}</span>
                  <span
                    className={`text-[9px] px-1 py-0.5 rounded border ${c.tienePricingPower ? "border-emerald-800/40 text-emerald-400" : "border-border/30 text-muted-foreground"}`}
                  >
                    {c.tienePricingPower ? "pricing power" : "sin pricing"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{c.justificacion}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function EtfFitPanel({ sectorFilter }: { sectorFilter: string }) {
  const [sector, setSector] = useState(SECTORES[0] ?? "Technology");
  useEffect(() => {
    if (sectorFilter) setSector(sectorFilter);
  }, [sectorFilter]);
  const tickers = useMemo(() => {
    const data = SECTORES_DATA[sector] ?? {};
    const all: TickerJson[] = [];
    for (const ind of Object.keys(data))
      for (const t of data[ind]) if (!all.find((x) => x.ticker === t.ticker)) all.push(t);
    return all.slice(0, 10);
  }, [sector]);
  const fn = useServerFn(getSectorEtfFit);
  const q = useQuery({
    queryKey: ["etf-fit", sector],
    queryFn: () => fn({ data: { sector, tickers } }),
    enabled: tickers.length >= 2,
    staleTime: 30 * 60_000,
  });
  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError)
    return (
      <Card>
        <CardContent className="p-6 text-[13px] text-muted-foreground">
          ETF Fit no disponible.
        </CardContent>
      </Card>
    );
  const rows: EtfFitResult[] = (q.data as any)?.etfResults ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[14px]">
          <Target className="h-4 w-4 text-primary" /> ETF Fit — {sector}
        </CardTitle>
        <p className="text-[13px] text-muted-foreground">
          Qué ETF replica mejor el comportamiento del sector · Correlación y tracking
        </p>
      </CardHeader>
      <CardContent>
        <select
          value={sector}
          onChange={(e) => setSector(e.target.value)}
          className="mb-4 w-full max-w-xs rounded border bg-background px-2 py-1.5 text-[12px]"
        >
          {SECTORES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Sin resultados.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ETF</TableHead>
                  <TableHead className="text-right">Corr</TableHead>
                  <TableHead className="text-right">R²</TableHead>
                  <TableHead className="text-right">Beta</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, 10).map((r) => (
                  <TableRow key={r.etf}>
                    <TableCell className="font-mono font-medium">{r.etf}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.correlation?.toFixed(3) ?? "s/d"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.rSquared?.toFixed(3) ?? "s/d"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {r.beta?.toFixed(2) ?? "s/d"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IntermarketFull() {
  const [tab, setTab] = useState<"murphy" | "ratios" | "decoupling">("murphy");
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-border/40 pb-2 flex-wrap">
        {[
          { k: "murphy", l: "Murphy 12 ratios + Yield + Ciclo" },
          { k: "ratios", l: "Ratios Pring/Stovall" },
          { k: "decoupling", l: "Decoupling Monitor" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k as any)}
            className={cn(
              "text-[11px] font-mono px-3 py-1.5 rounded-t",
              tab === t.k
                ? "bg-primary/15 text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.l}
          </button>
        ))}
      </div>
      {tab === "murphy" && <MurphyIntermarketPanel />}
      {tab === "ratios" && <IntermarketRatiosPanel />}
      {tab === "decoupling" && <DecouplingMonitor />}
    </div>
  );
}

export function SectoresTab({ initialTab }: { initialTab?: string } = {}) {
  // Reorden metodológico (corpus pt): Panorama Murphy → Análisis Pascale →
  // Valuación relativa → Estructura Bustamante → Cartera Elbaum
  const valid = ["panorama", "analisis", "valuacion", "estructura", "cartera"];
  const LEGACY_MAP: Record<string, string> = {
    performance: "panorama",
    intermarket: "panorama",
    panel: "analisis",
    etfFit: "analisis",
    "etf-fit": "analisis",
    matriz: "cartera",
    benchmarks: "cartera",
    valuacion: "valuacion",
    oportunidades: "valuacion",
  };
  const inicial = initialTab ? (LEGACY_MAP[initialTab] ?? (valid.includes(initialTab) ? initialTab : undefined)) : undefined;
  const [tab, setTab] = useState(inicial ?? "panorama");
  useEffect(() => {
    if (initialTab) {
      const mapped = LEGACY_MAP[initialTab] ?? initialTab;
      if (valid.includes(mapped) && mapped !== tab) setTab(mapped);
    }
  }, [initialTab]);
  // Shared sector state (Clarity parity)
  const [sectorFilter, setSectorFilter] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [result, setResult] = useState<SectorAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fn = useServerFn(getSectorAnalysis);
  const sectorList = useMemo(() => Object.keys(SECTORES_DATA).sort(), []);
  const industryList = useMemo(() => {
    if (!sectorFilter) return [];
    const d = (SECTORES_DATA as any)[sectorFilter];
    return d ? Object.keys(d).sort() : [];
  }, [sectorFilter]);
  const tickersFromFilter = useMemo(() => {
    if (!sectorFilter) return [];
    const data = (SECTORES_DATA as any)[sectorFilter];
    if (!data) return [];
    if (industryFilter) return data[industryFilter] ?? [];
    const all: TickerJson[] = [];
    for (const ind of Object.keys(data))
      for (const t of data[ind]) if (!all.find((x) => x.ticker === t.ticker)) all.push(t);
    return all;
  }, [sectorFilter, industryFilter]);

  // Segmentación en cohortes homogéneas — cada cohorte se analiza por separado
  const cohortes = useMemo(() => {
    const grupos = new Map<CohorteKey, TickerJson[]>();
    for (const t of tickersFromFilter) {
      const k = clasificarCohorte(t.ticker);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k)!.push(t);
    }
    return ORDEN_COHORTES.filter((k) => (grupos.get(k)?.length ?? 0) > 0).map((k) => ({
      key: k,
      label: COHORTES[k].label,
      corto: COHORTES[k].corto,
      tickers: grupos.get(k)!,
    }));
  }, [tickersFromFilter]);

  const [cohorteActiva, setCohorteActiva] = useState<string | null>(null);
  // Cohorte efectiva: la elegida o, por defecto, la más numerosa
  useEffect(() => {
    if (!cohortes.length) { setCohorteActiva(null); return; }
    if (!cohortes.find((c) => c.key === cohorteActiva)) {
      const mayor = [...cohortes].sort((a, b) => b.tickers.length - a.tickers.length)[0];
      setCohorteActiva(mayor.key);
    }
  }, [cohortes]);
  const cohorteSel = cohortes.find((c) => c.key === cohorteActiva) ?? null;
  const tickersHomogeneos = useMemo(
    () => (cohorteSel ? tickersFromFilter.filter((t) => clasificarCohorte(t.ticker) === cohorteSel.key) : []),
    [cohorteSel, tickersFromFilter],
  );

  const handleRun = useCallback(async () => {
    if (tickersHomogeneos.length < 2) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const data = await fn({
        data: {
          sector: sectorFilter,
          industry: industryFilter || "Todas las industrias",
          tickers: tickersHomogeneos,
        } as any,
      });
      setResult(data as any);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [tickersHomogeneos, fn, sectorFilter, industryFilter]);

  useEffect(() => {
    if (tickersHomogeneos.length < 2) {
      setResult(null);
      setError("");
      return;
    }
    handleRun();
  }, [sectorFilter, industryFilter, cohorteActiva]);

  const [periodoNorm, setPeriodoNorm] = useState<"1Y" | "2Y" | "5Y" | "10Y">("2Y");
  const normPathKey = `normPath${periodoNorm}` as
    "normPath1Y" | "normPath2Y" | "normPath5Y" | "normPath10Y";
  const normChartData = useMemo(() => {
    if (!result) return [];
    const paths = result.tickers.map((t: any) => t[normPathKey]).filter((p: any) => p?.length > 0);
    if (paths.length === 0) return [];
    const dateSet = new Set<string>();
    for (const p of paths) for (const pt of p) dateSet.add(pt.date);
    const sorted = [...dateSet].sort();
    const valuesByDate = new Map<string, Record<string, number>>();
    for (const d of sorted) {
      const row: Record<string, number> = { dateIdx: 0 } as any;
      for (let i = 0; i < result.tickers.length; i++) {
        const pt = result.tickers[i][normPathKey]?.find((x: any) => x.date === d);
        if (pt) row[result.tickers[i].ticker] = pt.value;
      }
      valuesByDate.set(d, row);
    }
    return sorted.map((d, idx) => {
      const row = valuesByDate.get(d)!;
      (row as any).dateIdx = idx;
      return { date: d, ...row };
    });
  }, [result, normPathKey]);
  const periodColors = [
    "#3b82f6",
    "#a855f7",
    "#22c55e",
    "#f59e0b",
    "#ef4444",
    "#06b6d4",
    "#ec4899",
    "#14b8a6",
    "#f97316",
    "#8b5cf6",
    "#10b981",
    "#eab308",
    "#6366f1",
  ];

  // Comparación
  const [comparacionAbierta, setComparacionAbierta] = useState(false);
  const [comparacionSectores, setComparacionSectores] = useState<string[]>([]);
  const [comparacionData, setComparacionData] = useState<
    Record<string, SectorAnalysisResult | null>
  >({});
  const [comparacionLoading, setComparacionLoading] = useState(false);
  const [comparacionError, setComparacionError] = useState("");
  const handleCompararSectores = useCallback(async () => {
    if (comparacionSectores.length < 2) return;
    setComparacionLoading(true);
    setComparacionError("");
    try {
      const results = await Promise.allSettled(
        comparacionSectores.map(async (sector) => {
          const tickers: TickerJson[] = [];
          const secData = (SECTORES_DATA as any)[sector];
          if (secData) {
            const seen = new Set<string>();
            for (const ind of Object.keys(secData))
              for (const t of secData[ind])
                // Comparación solo intra-cohorte: misma moneda, tipo y mercado
                if (!seen.has(t.ticker) && clasificarCohorte(t.ticker) === cohorteActiva) {
                  seen.add(t.ticker);
                  tickers.push(t);
                }
          }
          if (tickers.length < 2) return { sector, data: null };
          const r = await fn({
            data: { sector, industry: "Todas las industrias", tickers } as any,
          });
          return { sector, data: r as any };
        }),
      );
      const comp: Record<string, SectorAnalysisResult | null> = {};
      for (const r of results) if (r.status === "fulfilled") comp[r.value.sector] = r.value.data;
      setComparacionData(comp);
      const errs = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as any).reason?.message)
        .filter(Boolean);
      if (errs.length) setComparacionError(errs.join("; "));
    } catch (e) {
      setComparacionError((e as Error).message);
    } finally {
      setComparacionLoading(false);
    }
  }, [comparacionSectores, fn, cohorteActiva]);

  return (
    <div className="space-y-8 w-full">
      <div>
        <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight">
          Análisis sectorial
        </h2>
        <p className="text-[17px] leading-relaxed text-muted-foreground mt-1 lg:text-[19px]">
          Rotación sectorial con ETFs SPDR, valuación relativa, correlaciones, benchmarks y
          screeners. Fuentes: Yahoo Finance · BCRA · Delay 15-20’ · Metodología John Murphy / Pring
        </p>
        <div aria-hidden className="electric-line mt-6 max-w-3xl" />
      </div>

      {/* Selector compartido Clarity parity */}
      <div className="flex flex-wrap items-start gap-3">
        <div className="glass p-3 flex-1 min-w-[220px] border rounded-lg bg-background/40">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sectorFilter}
              onChange={(e) => {
                setSectorFilter(e.target.value);
                setIndustryFilter("");
                setResult(null);
              }}
              className="flex-1 min-w-[160px] bg-background border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5"
            >
              <option value="">Seleccionar sector</option>
              {sectorList
                .filter((s) => s !== "No disponible")
                .map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
            </select>
            {sectorFilter && (
              <select
                value={industryFilter}
                onChange={(e) => {
                  setIndustryFilter(e.target.value);
                  setResult(null);
                }}
                className="flex-1 min-w-[160px] bg-background border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5"
              >
                <option value="">Todas las industrias (sector completo)</option>
                {industryList.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            )}
            {tickersFromFilter.length >= 2 && (
              <Button onClick={handleRun} disabled={loading} size="sm" className="h-8 text-[11px]">
                {loading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Search className="h-3 w-3" />
                )}{" "}
                Analizar
              </Button>
            )}
            {loading && (
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Analizando…
              </span>
            )}
          </div>
          {tickersFromFilter.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {tickersFromFilter.slice(0, 30).map((t) => (
                <span
                  key={t.ticker}
                  className="font-mono text-[10px] px-2 py-0.5 rounded border border-primary/20 bg-primary/5"
                >
                  {t.ticker}
                </span>
              ))}
              {tickersFromFilter.length > 30 && (
                <span className="text-[10px] text-muted-foreground">
                  +{tickersFromFilter.length - 30} más
                </span>
              )}
            </div>
          )}
          {error && (
            <div className="mt-2 p-2 rounded bg-danger/10 border border-danger/30 text-xs text-danger">
              {error}
            </div>
          )}
        </div>
        <div className="glass p-3 flex-1 min-w-[220px] border rounded-lg bg-background/40">
          <button
            onClick={() => setComparacionAbierta((v) => !v)}
            aria-expanded={comparacionAbierta}
            className="w-full flex items-center justify-between gap-2 rounded-md px-2 py-1.5 -mx-2 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
          >
            <span className="flex items-center gap-2">
              Comparar
              {comparacionSectores.length > 0 && (
                <span className="font-mono text-[10px] normal-case tracking-normal rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5">
                  {comparacionSectores.length} seleccionado
                  {comparacionSectores.length === 1 ? "" : "s"}
                </span>
              )}
            </span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${comparacionAbierta ? "rotate-180" : ""}`}
            />
          </button>
          {comparacionAbierta && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select
                multiple
                value={comparacionSectores}
                onChange={(e) =>
                  setComparacionSectores(Array.from(e.target.selectedOptions, (o) => o.value))
                }
                className="flex-1 min-w-[120px] bg-background border border-border/60 text-[11px] rounded px-2 py-1.5"
                size={3}
              >
                {sectorList
                  .filter((s) => s !== "No disponible")
                  .map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
              </select>
              <Button
                onClick={handleCompararSectores}
                disabled={comparacionSectores.length < 2 || comparacionLoading}
                size="sm"
                className="h-8 text-[11px]"
              >
                {comparacionLoading ? "Cargando…" : `Comparar (${comparacionSectores.length})`}
              </Button>
              {comparacionError && (
                <p className="text-[10px] text-amber-400 mt-1 w-full">{comparacionError}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Segmentación por cohorte homogénea — nunca cruzar tipo/moneda/mercado */}
      {cohortes.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Cohorte homogénea:
            </span>
            {cohortes.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCohorteActiva(c.key)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-mono transition-colors",
                  c.key === cohorteActiva
                    ? "border-primary/60 bg-primary/15 text-primary"
                    : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground",
                )}
              >
                {c.corto} · {c.tickers.length}
              </button>
            ))}
          </div>
          {cohorteSel && cohortes.length > 1 && (
            <p className="text-[11px] leading-relaxed text-amber-400/90">
              ⚠️ El sector mezcla activos de distinto tipo, moneda y mercado. Por coherencia
              metodológica (Fowler Newton: moneda homogénea · Pascale: comparables homogéneos) el
              análisis y la comparación corren <b>solo</b> sobre{" "}
              <b>{cohorteSel.label}</b> ({cohorteSel.tickers.length} activos). Un CEDEAR replica a su
              subyacente: no es comparable ni con la acción local ni con la original de EE.UU.
            </p>
          )}
          {cohorteSel && tickersHomogeneos.length > 0 && (
            <p className="font-mono text-[10px] text-muted-foreground">
              Analizando: {tickersHomogeneos.map((t) => t.ticker).slice(0, 24).join(" · ")}
              {tickersHomogeneos.length > 24 ? ` · +${tickersHomogeneos.length - 24} más` : ""}
            </p>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="flex-wrap h-auto gap-1 p-1 w-full justify-start">
          <TabsTrigger value="panorama" className="text-[12px] px-3 py-1.5">
            1 · Panorama
          </TabsTrigger>
          <TabsTrigger value="analisis" className="text-[12px] px-3 py-1.5">
            2 · Análisis
          </TabsTrigger>
          <TabsTrigger value="valuacion" className="text-[12px] px-3 py-1.5">
            3 · Valuación
          </TabsTrigger>
          <TabsTrigger value="estructura" className="text-[12px] px-3 py-1.5">
            4 · Estructura
          </TabsTrigger>
          <TabsTrigger value="cartera" className="text-[12px] px-3 py-1.5">
            5 · Cartera
          </TabsTrigger>
        </TabsList>

        {/* 1 · PANORAMA — Murphy intermarket: rotación, fuerza relativa, régimen */}
        <TabsContent value="panorama" className="mt-4 space-y-6">
          <PerformanceFullPanel sectorFilter={sectorFilter} tickersFromFilter={tickersFromFilter} />
          <IntermarketFull />
        </TabsContent>

        {/* 2 · ANÁLISIS — Pascale U4: fundamentales comparables + caminos + ETF fit */}
        <TabsContent value="analisis" className="mt-4 space-y-6">
          {!result && !loading && (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Seleccioná un sector e industria para ver el análisis. Incluye tabla fundamentales,
                caminos normalizados 1Y/2Y/5Y/10Y, fuerza relativa y comparación.
              </CardContent>
            </Card>
          )}
          {loading && <Skeleton className="h-64 w-full" />}
          {result && (
            <PanelFull
              sectorFilter={sectorFilter}
              setSectorFilter={setSectorFilter}
              industryFilter={industryFilter}
              setIndustryFilter={setIndustryFilter}
              result={result}
              loading={loading}
              error={error}
              handleRun={handleRun}
              tickersFromFilter={tickersFromFilter}
              sectorList={sectorList}
              industryList={industryList}
              periodoNorm={periodoNorm}
              setPeriodoNorm={setPeriodoNorm}
              normChartData={normChartData}
              periodColors={periodColors}
              comparacionSectores={comparacionSectores}
              setComparacionSectores={setComparacionSectores}
              comparacionData={comparacionData}
              comparacionLoading={comparacionLoading}
              comparacionError={comparacionError}
              handleCompararSectores={handleCompararSectores}
            />
          )}
          <EtfFitPanel sectorFilter={sectorFilter} />
        </TabsContent>

        {/* 3 · VALUACIÓN — Pascale: múltiplos relativos + oportunidades screener */}
        <TabsContent value="valuacion" className="mt-4 space-y-6">
          <ValuacionPanel />
          <OportunidadesPanel2 />
        </TabsContent>

        {/* 4 · ESTRUCTURA — Bustamante: capa cualitativa industrial */}
        <TabsContent value="estructura" className="mt-4">
          <EstructuraPanel
            sectorFilter={sectorFilter}
            onIrAnalisis={() => setTab("analisis")}
          />
        </TabsContent>

        {/* 5 · CARTERA — Elbaum: correlaciones/benchmarks como diversificación */}
        <TabsContent value="cartera" className="mt-4 space-y-6">
          <BenchmarksPanel sectorFilter={sectorFilter} />
          <MatrizPanelFull sectorFilter={sectorFilter} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Panel ESTRUCTURA (metodología Bustamante, corpus pt) ──────────────────────
// Capa cualitativa previa a la valuación: modelo de ingresos → estructura de
// mercado → mapa regulatorio → capa tecnológica → implicancia en múltiplos.
function EstructuraPanel({ sectorFilter, onIrAnalisis }: { sectorFilter: string; onIrAnalisis: () => void }) {
  const MARCO = [
    { n: 1, titulo: "Modelo de ingresos", detalle: "¿Cómo gana plata el sector? Publicidad / suscripción / tarifas reguladas / volumen-precio / mixto. Define la calidad y recurrencia del flujo." },
    { n: 2, titulo: "Estructura competitiva", detalle: "Oligopolio / monopolio natural / fragmentado. Cuanto más concentrado, más poder de fijación de precios y más vale un EBITDA equivalente." },
    { n: 3, titulo: "Mapa regulatorio", detalle: "Quién fija precios o autoriza entrada (ENACOM/CNV/BCRA vs SEC/FCC). La regulación puede ser motor de precio o techo estructural." },
    { n: 4, titulo: "Capa tecnológica y disrupción", detalle: "Intensidad de capex, obsolescencia, entrantes digitales. Riesgo de destrucción del modelo vigente." },
    { n: 5, titulo: "Implicancia de valuación", detalle: "Conclusión: el mismo EV/EBITDA NO vale lo mismo según 1-4. Ajustar múltiplo objetivo y margen de seguridad." },
  ];
  const sector = sectorFilter || "(seleccioná un sector arriba)";
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-[14px]">Auditoría estructural del sector — metodología Bustamante (corpus pt)</CardTitle>
          <p className="text-[13px] text-muted-foreground">
            Capa cualitativa que ANTECEDE a la valuación: caracterizar la industria en 5 pasos antes de confiar en un múltiplo. Sector activo:{" "}
            <span className="font-mono text-foreground">{sector}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          {MARCO.map((m) => (
            <div key={m.n} className="rounded-lg border border-border/50 bg-background/40 p-3">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-primary">PASO {m.n}</span>
                <span className="text-sm font-semibold">{m.titulo}</span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{m.detalle}</p>
            </div>
          ))}
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-[13px] text-amber-300">
            Regla del corpus: PROHIBIDO recomendar sin identificar primero el modelo de ingresos y el
            regulador dominante. El mismo EBITDA vale distinto según la estructura (pasos 1-4).
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={onIrAnalisis} disabled={!sectorFilter}>
              Ir al análisis cuantitativo del sector →
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Esta capa es de razonamiento (no cálculo). Combinar con la pestaña Análisis para los
            números y con el agente IA (skill analisis-sectorial-bustamante) para profundizar un
            caso puntual.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
