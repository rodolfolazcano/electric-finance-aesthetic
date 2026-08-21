import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Loader2, Play, Shield, Scale, TrendingUp } from "lucide-react";
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
  optimizeAllPortfolios,
  type AllPortfoliosResult,
} from "@/lib/herramientas/finance.functions";
import {
  getRiesgoAnalysis,
  VALID_INTERVALS,
  VALID_PERIODS,
  type DistribStats,
} from "@/lib/herramientas/riesgo.functions";
import {
  getCAPMAnalysis,
  AUTO_BENCHMARKS,
  type CAPMResult,
} from "@/lib/herramientas/capm.functions";
import { CHART_TOOLTIP_STYLE, AXIS_TICK_SM, GRID_STROKE, PIE_COLORS } from "@/components/herramientas/shared/chart-constants";
import { cn } from "@/lib/utils";

const EJEMPLOS_CARTERA = "SPY, QQQ, AAPL, MSFT, KO, JPM, GLD, TLT";

function parseTickers(raw: string): string[] {
  return [...new Set(
    raw
      .split(/[,\n;]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean),
  )].slice(0, 20);
}

function fmtPct(v: number | null | undefined, dec = 1): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(dec)}%`;
}
function fmtNum2(v: number | null | undefined, dec = 2): string {
  if (v == null || !isFinite(v)) return "s/d";
  return v.toFixed(dec);
}

// ─────────────────────────── Optimizador ───────────────────────────

const ESTRATEGIAS = [
  { key: "maxSharpe", label: "Máx. Sharpe" },
  { key: "minVariance", label: "Mín. Varianza" },
  { key: "equalWeight", label: "Equi-weight" },
  { key: "inverseVol", label: "Riesgo inverso" },
  { key: "markowitz", label: "Markowitz" },
] as const;

function OptimizadorPanel() {
  const [raw, setRaw] = useState(EJEMPLOS_CARTERA);
  const fn = useServerFn(optimizeAllPortfolios);
  const m = useMutation({
    mutationFn: (tickers: string[]) =>
      fn({
        data: {
          tickers,
          notional: 15_000,
          numSimulations: 2000,
          benchmarks: ["SPY"],
          autoDetectBenchmarks: false,
          years: 2,
        },
      }),
  });

  const res = m.data as AllPortfoliosResult | undefined;
  const estrategiasActivas = res
    ? ESTRATEGIAS.map((e) => ({
        ...e,
        data: (res as unknown as Record<string, unknown>)[e.key] as never[] | undefined,
      }))
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Cartera (2 a 20 tickers separados por coma)
          </label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button onClick={() => m.mutate(parseTickers(raw))} disabled={m.isPending || parseTickers(raw).length < 2}>
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Optimizar cartera
          </Button>
          {m.isError && (
            <p className="text-sm text-red-400">
              {(m.error as Error)?.message ?? "Error al optimizar."}
            </p>
          )}
        </CardContent>
      </Card>

      {m.isPending && <Skeleton className="h-72 w-full" />}

      {res && (
        <div className="space-y-4">
          {/* Comparativa de estrategias */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Scale className="h-4 w-4 text-primary" /> Estrategias de optimización (2 años, diaria)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Estrategia</TableHead>
                    <TableHead className="text-right">Retorno anual</TableHead>
                    <TableHead className="text-right">Volatilidad</TableHead>
                    <TableHead className="text-right">Sharpe</TableHead>
                    <TableHead className="text-right">VaR 95%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {estrategiasActivas.map((e) => {
                    const d = e.data as unknown as
                      | { retornoAnual?: number; volatilidadAnual?: number; sharpe?: number; var95?: number }
                      | undefined;
                    if (!d) return null;
                    return (
                      <TableRow key={e.key}>
                        <TableCell className="font-medium">{e.label}</TableCell>
                        <TableCell className={cn("text-right font-mono", (d.retornoAnual ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                          {fmtPct(d.retornoAnual)}
                        </TableCell>
                        <TableCell className="text-right font-mono">{fmtPct(d.volatilidadAnual)}</TableCell>
                        <TableCell className="text-right font-mono">{fmtNum2(d.sharpe)}</TableCell>
                        <TableCell className="text-right font-mono text-red-400">{fmtPct(d.var95)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pesos de la mejor estrategia con datos */}
          {estrategiasActivas.filter((e) => e.data).slice(0, 5).map((e) => {
            const d = e.data as unknown as { pesos?: Record<string, number> } | undefined;
            const pesos = Object.entries(d?.pesos ?? {})
              .map(([ticker, peso]) => ({ ticker, peso: Number(peso) }))
              .filter((x) => x.peso > 0.001)
              .sort((a, b) => b.peso - a.peso);
            if (!pesos.length) return null;
            return (
              <Card key={e.key}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm">Pesos · {e.label}</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  <div style={{ height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pesos} dataKey="peso" nameKey="ticker" innerRadius={45} outerRadius={80} paddingAngle={2}>
                          {pesos.map((_, i) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="none" />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={CHART_TOOLTIP_STYLE}
                          formatter={(v: number | string) => `${(Number(v) * 100).toFixed(1)}%`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="max-h-[220px] space-y-1 overflow-auto pr-1">
                    {pesos.map((p) => (
                      <div key={p.ticker} className="flex items-center gap-2 text-xs">
                        <span className="w-16 shrink-0 font-mono">{p.ticker}</span>
                        <div className="h-2 flex-1 overflow-hidden rounded bg-accent/40">
                          <div
                            className="h-full rounded bg-primary/60"
                            style={{ width: `${Math.min(100, p.peso * 100)}%` }}
                          />
                        </div>
                        <span className="w-12 shrink-0 text-right font-mono">{(p.peso * 100).toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Riesgo ───────────────────────────

function RiesgoPanel() {
  const [raw, setRaw] = useState("SPY, QQQ, AAPL, GGAL.BA");
  const [periodo, setPeriodo] = useState<string>("2y");
  const [intervalo, setIntervalo] = useState<string>("1d");
  const fn = useServerFn(getRiesgoAnalysis);
  const m = useMutation({
    mutationFn: (opts: { tickers: string[]; period: string; interval: string }) =>
      fn({ data: { tickers: opts.tickers, period: opts.period, interval: opts.interval } }),
  });

  const resultados = (m.data ?? []) as unknown as DistribStats[];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
            <Input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Tickers separados por coma"
              className="font-mono uppercase"
            />
            <select
              value={intervalo}
              onChange={(e) => setIntervalo(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Intervalo"
            >
              {VALID_INTERVALS.map((i) => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
            <select
              value={periodo}
              onChange={(e) => setPeriodo(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-2 text-sm"
              aria-label="Período"
            >
              {VALID_PERIODS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <Button onClick={() => m.mutate({ tickers: parseTickers(raw), period: periodo, interval: intervalo })} disabled={m.isPending}>
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            Analizar riesgo
          </Button>
          {m.isError && <p className="text-sm text-red-400">{(m.error as Error)?.message ?? "Error."}</p>}
        </CardContent>
      </Card>

      {m.isPending && <Skeleton className="h-64 w-full" />}

      {resultados.length > 0 && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Shield className="h-4 w-4 text-primary" /> Distribución de retornos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Media anual</TableHead>
                    <TableHead className="text-right">Volatilidad</TableHead>
                    <TableHead className="text-right">Sharpe</TableHead>
                    <TableHead className="text-right">VaR 95%</TableHead>
                    <TableHead className="text-right">Skew</TableHead>
                    <TableHead className="text-right">Kurtosis</TableHead>
                    <TableHead className="text-right">Normal?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map((r) => (
                    <TableRow key={r.ticker}>
                      <TableCell className="font-mono font-medium">{r.ticker}</TableCell>
                      <TableCell className={cn("text-right font-mono", r.meanAnnual >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmtPct(r.meanAnnual)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtPct(r.volatilityAnnual)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum2(r.sharpeRatio)}</TableCell>
                      <TableCell className="text-right font-mono text-red-400">{fmtPct(r.var95)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum2(r.skewness)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum2(r.kurtosis)}</TableCell>
                      <TableCell className="text-right">
                        {r.isNormal ? (
                          <span className="text-emerald-400">sí (JB)</span>
                        ) : (
                          <span className="text-amber-400">colas pesadas</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            {resultados.slice(0, 4).map((r) => {
              const hist = (r.histogram ?? []).map((b) => ({
                x: (b.binStart + b.binEnd) / 2,
                freq: b.count,
              }));
              return (
                <Card key={r.ticker}>
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm">
                      Histograma de retornos · <span className="font-mono">{r.ticker}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div style={{ height: 200 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hist} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="x" tick={AXIS_TICK_SM} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
                          <YAxis tick={AXIS_TICK_SM} />
                          <Tooltip
                            contentStyle={CHART_TOOLTIP_STYLE}
                            formatter={(v: number | string) => [String(v), "frecuencia"]}
                            labelFormatter={(l: number | string) => `${(Number(l) * 100).toFixed(2)}%`}
                          />
                          <ReferenceLine x={0} stroke="#94a3b8" strokeDasharray="4 4" />
                          <Bar dataKey="freq" fill="#38bdf8" opacity={0.7} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                      <Mini label="VaR95" value={fmtPct(r.var95)} />
                      <Mini label="Pérdida máx." value={fmtPct(r.maxLoss)} />
                      <Mini label="Ganancia máx." value={fmtPct(r.maxGain)} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-2">
      <div className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

// ─────────────────────────── CAPM ───────────────────────────

function CapmPanel() {
  const [raw, setRaw] = useState("AAPL, MSFT, GGAL.BA");
  const [auto, setAuto] = useState(true);
  const [benchRaw, setBenchRaw] = useState("SPY");
  const fn = useServerFn(getCAPMAnalysis);
  const m = useMutation({
    mutationFn: (opts: { tickers: string[]; benchmarks: string[]; autoDetect: boolean }) =>
      fn({
        data: {
          tickers: opts.tickers,
          benchmarks: opts.benchmarks,
          multilinear: false,
          autoDetect: opts.autoDetect,
          source: "yahoo",
        },
      }),
  });

  const resultados = ((m.data ?? []) as unknown as CAPMResult[]) ?? [];
  const scatterData = useMemo(
    () =>
      resultados.map((r) => ({
        beta: r.beta ?? 1,
        alpha: (r.annualizedAlpha ?? 0) * 100,
        ticker: r.ticker,
      })),
    [resultados],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <Input
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder="Tickers separados por coma"
              className="font-mono uppercase"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              Benchmark automático
            </label>
          </div>
          {!auto && (
            <Input
              value={benchRaw}
              onChange={(e) => setBenchRaw(e.target.value)}
              placeholder="Benchmarks (ej. SPY, QQQ)"
              className="max-w-xs font-mono uppercase"
            />
          )}
          <Button
            onClick={() =>
              m.mutate({
                tickers: parseTickers(raw),
                benchmarks: auto ? [] : parseTickers(benchRaw),
                autoDetect: auto,
              })
            }
            disabled={m.isPending}
          >
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingUp className="h-4 w-4" />}
            Calcular CAPM
          </Button>
          {m.isError && <p className="text-sm text-red-400">{(m.error as Error)?.message ?? "Error."}</p>}
          {auto && (
            <p className="text-xs text-muted-foreground">
              Auto-detección entre {AUTO_BENCHMARKS.slice(0, 6).join(", ")}… según mejor R².
            </p>
          )}
        </CardContent>
      </Card>

      {m.isPending && <Skeleton className="h-64 w-full" />}

      {resultados.length > 0 && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Regresión CAPM (2 años, diaria)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Beta</TableHead>
                    <TableHead className="text-right">Alpha anual</TableHead>
                    <TableHead className="text-right">R²</TableHead>
                    <TableHead className="text-right">Correlación</TableHead>
                    <TableHead className="text-right">p-valor</TableHead>
                    <TableHead>Benchmark</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resultados.map((r) => (
                    <TableRow key={r.ticker}>
                      <TableCell className="font-mono font-medium">{r.ticker}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum2(r.beta)}</TableCell>
                      <TableCell className={cn("text-right font-mono", (r.annualizedAlpha ?? 0) >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {fmtPct(r.annualizedAlpha)}
                      </TableCell>
                      <TableCell className="text-right font-mono">{fmtNum2(r.rSquared, 3)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum2(r.correlation, 3)}</TableCell>
                      <TableCell className="text-right font-mono">{fmtNum2(r.pValue, 4)}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {r.benchmarkLabel ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Beta vs Alpha anualizada</CardTitle>
            </CardHeader>
            <CardContent>
              <div style={{ height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: -12 }}>
                    <CartesianGrid stroke={GRID_STROKE} strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="beta"
                      name="Beta"
                      tick={AXIS_TICK_SM}
                      domain={["dataMin - 0.2", "dataMax + 0.2"]}
                    />
                    <YAxis type="number" dataKey="alpha" name="Alpha %" tick={AXIS_TICK_SM} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number | string) => Number(v).toFixed(3)} />
                    <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 4" />
                    <ReferenceLine x={1} stroke="#94a3b8" strokeDasharray="4 4" />
                    <Scatter data={scatterData} fill="#38bdf8">
                      {scatterData.map((d, i) => (
                        <Cell key={i} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                {scatterData.map((d) => (
                  <span key={d.ticker} className="font-mono">
                    {d.ticker} (β {d.beta.toFixed(2)}, α {d.alpha.toFixed(1)}%)
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── Tab contenedor ───────────────────────────

export function CuantitativoTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Análisis cuantitativo</h2>
        <p className="text-sm text-muted-foreground">
          Optimización de carteras (Markowitz, mínima varianza, máx. Sharpe), análisis de riesgo con
          distribuciones y regresiones CAPM sobre series reales de Yahoo Finance.
        </p>
      </div>
      <Tabs defaultValue="optimizador" className="w-full">
        <TabsList>
          <TabsTrigger value="optimizador">Optimizador</TabsTrigger>
          <TabsTrigger value="riesgo">Riesgo</TabsTrigger>
          <TabsTrigger value="capm">CAPM</TabsTrigger>
        </TabsList>
        <TabsContent value="optimizador" className="mt-4">
          <OptimizadorPanel />
        </TabsContent>
        <TabsContent value="riesgo" className="mt-4">
          <RiesgoPanel />
        </TabsContent>
        <TabsContent value="capm" className="mt-4">
          <CapmPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
