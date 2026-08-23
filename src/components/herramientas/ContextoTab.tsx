import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Compass, Search, Loader2, TrendingUp, Scale } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getDailyOportunidades,
  type DailyOportunidadesResult,
} from "@/lib/herramientas/daily-opportunities.functions";
import {
  getFlatTickerList,
  getIndustriasBySector,
  getUniqueSectores,
  type TickerInfo,
} from "@/lib/herramientas/universos";
import { Tabs } from "@/components/ui/tabs";
import { OportunidadesOrquestadasTab } from "@/components/herramientas/OportunidadesOrquestadasTab";

const MAX_TICKERS = 50; // límite de getDailyOportunidades

function scoreColor(score: number | null): string {
  if (score == null) return "text-muted-foreground";
  if (score >= 70) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function fmtNum(v: number | null, digits = 2): string {
  if (v == null || !isFinite(v)) return "--";
  return v.toLocaleString("es-AR", { maximumFractionDigits: digits });
}

function ScreenerSector() {
  const fn = useServerFn(getDailyOportunidades);
  const sectores = useMemo(() => getUniqueSectores(), []);
  const [sector, setSector] = useState("");
  const [industria, setIndustria] = useState("");
  const [universo, setUniverso] = useState<{
    tickers: string[];
    nombres: Map<string, TickerInfo>;
  } | null>(null);

  const industrias = useMemo(() => (sector ? getIndustriasBySector(sector) : []), [sector]);

  const construirUniverso = () => {
    const flat = getFlatTickerList();
    const filtrados = flat.filter(
      (t) =>
        t.sector === sector &&
        (!industria || t.industria === industria) &&
        !/Nombre no encontrado/i.test(t.nombre),
    );
    // Dedupe por ticker (el JSON repite ARS/USD y .BA)
    const map = new Map<string, TickerInfo>();
    for (const t of filtrados) if (!map.has(t.ticker)) map.set(t.ticker, t);
    return { tickers: [...map.keys()].slice(0, MAX_TICKERS), nombres: map };
  };

  const q = useQuery({
    queryKey: ["contexto-oportunidades", universo?.tickers.join(",")],
    queryFn: (): Promise<DailyOportunidadesResult> => fn({ data: { tickers: universo!.tickers } }),
    enabled: !!universo && universo.tickers.length > 0,
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => {
    if (!q.data?.rows || !universo) return [];
    return [...q.data.rows].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  }, [q.data, universo]);

  return (
    <div className="space-y-8 w-full">
      <div>
        <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight">
          Contexto de mercado
        </h2>
        <p className="mt-1 max-w-3xl text-[17px] leading-relaxed text-muted-foreground lg:text-[19px]">
          Oportunidades con datos reales (Yahoo Finance, ArgentinaDatos, BCRA) sobre el universo
          completo de CEDEARs, acciones y bonos, aplicando la metodología de detección de
          oportunidades del mercado local.
        </p>
        <div aria-hidden className="electric-line mt-6 max-w-3xl" />
      </div>

      {/* Selector de universo */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Screener de oportunidades sobre el universo real de{" "}
            <span className="font-mono text-foreground">unificado_completo.json</span>. Combina el
            análisis técnico (precio y volumen) con el fundamental (valuación y catalizadores).
            Máximo {MAX_TICKERS} tickers por corrida.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sector}
              onChange={(e) => {
                setSector(e.target.value);
                setIndustria("");
              }}
              className="flex-1 min-w-[180px] bg-background border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5"
            >
              <option value="">Seleccionar sector</option>
              {sectores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {sector && (
              <select
                value={industria}
                onChange={(e) => setIndustria(e.target.value)}
                className="flex-1 min-w-[180px] bg-background border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5"
              >
                <option value="">Todas las industrias</option>
                {industrias.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            )}
            <Button
              onClick={() => setUniverso(construirUniverso())}
              disabled={!sector}
              size="sm"
              className="h-8 text-[11px]"
            >
              {q.isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Search className="h-3 w-3" />
              )}{" "}
              Buscar oportunidades
            </Button>
            {universo && universo.tickers.length === MAX_TICKERS && (
              <span className="text-[10px] text-amber-400">
                Universo truncado a {MAX_TICKERS} tickers — afiná el filtro por industria.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {q.isPending && universo && <Skeleton className="h-72 w-full" />}

      {q.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-danger">
            Error al obtener datos: {(q.error as Error)?.message ?? "intente nuevamente"}
          </CardContent>
        </Card>
      )}

      {q.data && universo && (
        <>
          {/* Contexto macro real (ArgentinaDatos / BCRA) */}
          <div className="flex flex-wrap gap-2">
            {[
              ["Dólar CCL", q.data.macro.dolarCCL],
              ["Dólar MEP", q.data.macro.dolarMEP],
              ["Dólar Blue", q.data.macro.dolarBlue],
              ["Riesgo país", q.data.macro.riesgoPais],
            ].map(([label, val]) => (
              <span
                key={String(label)}
                className="rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[12px]"
              >
                <span className="text-muted-foreground">{label}: </span>
                <span className="font-mono text-foreground">
                  {val != null ? fmtNum(Number(val)) : "--"}
                </span>
              </span>
            ))}
          </div>

          {/* Intermarket Murphy — Fase 1 */}
          {q.data.intermarket && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <Badge variant="outline" className="font-mono">Dólar: {q.data.intermarket.regimenDolar.split(" (")[0]}</Badge>
              <Badge variant="outline" className="font-mono">Tasas: {q.data.intermarket.regimenTasas.split(" (")[0]}</Badge>
              <Badge variant={q.data.intermarket.riesgoActivo === "RIESGO-ON" ? "default" : "secondary"}>
                {q.data.intermarket.riesgoActivo}
              </Badge>
              {q.data.intermarket.sectoresFavorecidos.slice(0, 3).map((s) => (
                <Badge key={s.etf} variant="outline" className="border-emerald-500/40 text-emerald-400">
                  {s.sector} +{s.ret20?.toFixed(1)}%
                </Badge>
              ))}
              <span className="text-muted-foreground">{q.data.intermarket.rotacionDetectada}</span>
            </div>
          )}

          {/* Tabla de oportunidades */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Compass className="h-4 w-4 text-primary" /> Oportunidades detectadas (
                {rows.filter((r) => r.esOportunidad).length} de {rows.length}
                {q.data.umbral != null ? ` · umbral ${q.data.umbral}` : ""})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rows.length === 0 ? (
                <p className="p-4 text-[13px] text-muted-foreground">
                  Sin datos para este universo.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ticker</TableHead>
                        <TableHead>Precio</TableHead>
                        <TableHead>Var %</TableHead>
                        <TableHead>Rvol</TableHead>
                        <TableHead title="Clasificación α/β vs benchmark de mayor R²">Riesgo · α · RS60</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Catalizador</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.filter((r) => r.esOportunidad).map((r) => {
                        const info = universo.nombres.get(r.ticker);
                        return (
                          <TableRow key={r.ticker}>
                            <TableCell>
                              <Link
                                to="/herramientas"
                                search={{ tab: "analisis", ticker: r.ticker }}
                                className="font-mono text-[12px] font-semibold text-primary hover:underline"
                              >
                                {r.ticker}
                              </Link>
                              <div className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                                {info?.nombre ?? "--"}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-[12px]">
                              {fmtNum(r.precio)}
                            </TableCell>
                            <TableCell
                              className={`font-mono text-[12px] ${
                                (r.varPct ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"
                              }`}
                            >
                              {r.varPct != null ? `${fmtNum(r.varPct)}%` : "--"}
                            </TableCell>
                            <TableCell className="font-mono text-[12px]">
                              {fmtNum(r.rvol)}
                            </TableCell>
                            <TableCell className="font-mono text-[11px]" title={`Benchmark mayor R²: ${r.benchmarkUsado ?? "?"} · R² ${r.r2 ?? "?"}`}>
                              {r.clasificacionRiesgo ?? "S/D"}
                              <div className="text-[10px] text-muted-foreground">
                                α {r.alphaAnual != null ? `${r.alphaAnual > 0 ? "+" : ""}${fmtNum(r.alphaAnual)}%` : "--"}
                                {" · RS60 "}
                                {r.rs60 != null ? `${r.rs60 > 0 ? "+" : ""}${fmtNum(r.rs60)}pp` : "--"}
                              </div>
                            </TableCell>
                            <TableCell>
                              <span
                                className={`font-mono text-[13px] font-semibold ${scoreColor(r.score)}`}
                              >
                                {r.score != null ? r.score : "--"}
                              </span>
                              <div className="mt-0.5 flex gap-1">
                                {(["volumen", "valuacion", "momentum"] as const).map((k) => (
                                  <span
                                    key={k}
                                    title={`${k}: ${r.detalleScore[k] ?? "s/d"}`}
                                    className={`inline-block h-1 w-6 rounded-full ${
                                      r.detalleScore[k] != null
                                        ? scoreColor(r.detalleScore[k])
                                        : "bg-muted"
                                    }`}
                                    style={
                                      r.detalleScore[k] != null
                                        ? { opacity: 0.35 + (r.detalleScore[k]! / 100) * 0.65 }
                                        : undefined
                                    }
                                  />
                                ))}
                              </div>
                            </TableCell>
                            <TableCell className="max-w-[200px] text-[11px] leading-snug text-muted-foreground">
                              {r.catalizadorLabel}
                              {r.proximoEarnings && (
                                <div className="font-mono text-[10px]">
                                  Earnings: {r.proximoEarnings}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {/* Monitoreo / descartados — transparencia del umbral */}
              {rows.some((r) => !r.esOportunidad) && (
                <details className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <summary className="cursor-pointer text-[12px] text-muted-foreground">
                    Monitoreo / descartados ({rows.filter((r) => !r.esOportunidad).length}) — no
                    cumplen el umbral de oportunidad
                  </summary>
                  <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2">
                    {rows
                      .filter((r) => !r.esOportunidad)
                      .map((r) => (
                        <div key={r.ticker} className="flex items-baseline gap-2 text-[11px]">
                          <span className="font-mono font-semibold text-muted-foreground">
                            {r.ticker}
                          </span>
                          <span className="font-mono text-muted-foreground/70">
                            {r.score != null ? r.score : "--"}
                          </span>
                          <span className="truncate text-muted-foreground/70">
                            {r.motivoEstado}
                          </span>
                        </div>
                      ))}
                  </div>
                </details>
              )}

              {(q.data.errors.length > 0 || q.data.warnings.length > 0) && (
                <div className="mt-3 space-y-1">
                  {[...q.data.errors, ...q.data.warnings].slice(0, 5).map((e, i) => (
                    <p key={i} className="text-[10px] text-amber-400/80">
                      {e}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lectura metodológica */}
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardContent className="flex gap-3 p-4">
                <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Capa técnica (AT): </span>
                  precio y volumen en una fecha dada. Rvol alto indica interés del mercado; el
                  momentum y el gap muestran si el movimiento tiene fuerza. Estudiá el gráfico antes
                  de operar: no te limites a las señales armadas.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex gap-3 p-4">
                <Scale className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground">Capa fundamental (AF): </span>
                  valuación por percentil de P/E frente a su historia y catalizadores (upgrades de
                  brokers, earnings). Clave: mirar el <em>flujo</em>, no solo el EPS ni los
                  revenues. Buscá ventajas competitivas: monopolios o empresas de un solo producto.
                </p>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {!universo && !q.isPending && (
        <Card>
          <CardContent className="p-6 text-[13px] text-muted-foreground">
            Seleccioná un sector y presioná{" "}
            <span className="text-foreground">Buscar oportunidades</span> para analizar el universo
            con datos en vivo.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// -- Tab CONTEXTO: subtab Oportunidades (motor orquestado) + Screener por sector --
export function ContextoTab() {
  const [sub, setSub] = useState<string>("oportunidades");
  return (
    <Tabs value={sub} onValueChange={setSub} className="w-full">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Contexto:</span>
        {[
          { v: "oportunidades", l: "Oportunidades (orquestado)" },
          { v: "sector", l: "Screener por sector" },
        ].map((t) => (
          <button
            key={t.v}
            type="button"
            onClick={() => setSub(t.v)}
            className={
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors " +
              (sub === t.v
                ? "border-primary/60 bg-primary/15 text-primary"
                : "border-border/60 bg-background/50 text-muted-foreground hover:text-foreground")
            }
          >
            {t.l}
          </button>
        ))}
      </div>
      <div className="mt-4">
        {sub === "oportunidades" ? (
          <OportunidadesOrquestadasTab />
        ) : (
          <ScreenerSector />
        )}
      </div>
    </Tabs>
  );
}
