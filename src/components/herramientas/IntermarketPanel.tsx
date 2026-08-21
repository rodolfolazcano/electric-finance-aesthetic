// @ts-nocheck
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  getIntermarketAnalysis,
  type RollingCorrelation,
  type ArgentinaCorrelation,
  type RelativeStrengthRatio,
  type IntermarketResult,
} from "@/lib/intermarket-analysis.functions";
import {
  getIntermarketMurphyIndicators,
  type StovallFaseResult,
} from "@/lib/sectores/intermarket-murphy.functions";
import {
  Tooltip as UiTooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Info, ChevronDown, BookOpen, Search, CloudSun } from "lucide-react";
import { searchTavily, type TavilyResult } from "@/lib/tavily-functions";
import {
  fetchEarth2Status,
  fetchEarth2Models,
  fetchEarth2Forecast,
} from "@/lib/earth2/earth2-client";
import type { Earth2ForecastResponse } from "@/lib/earth2/earth2-types";

const INFO_TOOLTIPS: Record<string, string> = {
  "Bonos (UST 10Y) vs Acciones (S&P500)":
    "Bonos suelen liderar acciones por semanas o meses (Murphy, Cap. 1)",
  "Dólar (DXY) vs Commodities (DBC)":
    "Dólar y commodities se mueven en sentido inverso; el efecto puede demorar meses (Murphy, Cap. 1)",
  "Oro (GC=F) vs Bonos (UST 10Y)":
    "Oro y bonos inversos en entornos inflacionarios (Murphy, Cap. 2)",
  "Petróleo (CL=F) vs Dólar (DXY)":
    "Petróleo fuerte + dólar débil = presión inflacionaria (Murphy, Cap. 3)",
};

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

// ─── Componente de correlación (ampliado) ──────────────────────

function CorrelationGauge({
  value,
  label,
  interpretation,
  infoTooltip,
  leadLagText,
  correlacionEstructural,
}: {
  value: number | null;
  label: string;
  interpretation: string;
  infoTooltip?: string;
  leadLagText?: string | null;
  correlacionEstructural?: number | null;
}) {
  const pct = value != null ? ((value + 1) / 2) * 100 : 0;
  let barColor = "bg-muted-foreground/30";
  if (value != null) {
    if (value > 0.3) barColor = "bg-success";
    else if (value < -0.3) barColor = "bg-danger";
    else barColor = "bg-warning";
  }
  return (
    <Card className="border-border/40 bg-background/40/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-mono font-medium text-foreground">{label}</span>
        {infoTooltip && (
          <TooltipProvider delayDuration={300}>
            <UiTooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="ml-1 inline-flex shrink-0 cursor-help text-muted-foreground/60 hover:text-muted-foreground"
                >
                  <Info className="h-3 w-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-[10px] leading-relaxed">
                {infoTooltip}
              </TooltipContent>
            </UiTooltip>
          </TooltipProvider>
        )}
      </div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold font-mono text-foreground">
          {value != null ? fmtNum(value, 2) : "\u2014"}
        </span>
        <span className="text-[10px] text-muted-foreground">correlación</span>
        {correlacionEstructural != null && (
          <span className="ml-auto text-[9px] text-muted-foreground/60 font-mono">
            estructural (1a): {fmtNum(correlacionEstructural, 2)}
          </span>
        )}
      </div>
      <div className="relative mb-2 h-2 w-full rounded-full bg-border/30">
        <div
          className={`absolute top-0 h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
        <div className="absolute left-1/2 top-0 h-full w-px bg-muted-foreground/40" />
        <div className="absolute -left-1 -top-4 text-[9px] text-muted-foreground">-1</div>
        <div className="absolute left-1/2 -translate-x-1/2 -top-4 text-[9px] text-muted-foreground">
          0
        </div>
        <div className="absolute -right-1 -top-4 text-[9px] text-muted-foreground">+1</div>
      </div>
      <p className="text-[10px] text-muted-foreground leading-relaxed">{interpretation}</p>
      {leadLagText && (
        <div className="mt-1 rounded border border-border/30 bg-border/10 px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground/70 leading-relaxed">
          {leadLagText}
        </div>
      )}
    </Card>
  );
}

// ─── PASO 13: Relative Strength chart ──────────────────────────

function RelativeStrengthChart({ ratio }: { ratio: RelativeStrengthRatio }) {
  if (ratio.datos.length === 0) {
    return (
      <Card className="border-border/40 bg-background/40/40 p-4">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          {ratio.label}
        </div>
        <div className="mt-2 text-[10px] text-muted-foreground">Sin datos históricos</div>
      </Card>
    );
  }

  const lastVal = ratio.valorActual;
  const chartData = ratio.datos.slice(-90);

  return (
    <Card className="border-border/40 bg-background/40/40 p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Relative Strength: {ratio.label}
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-foreground">{lastVal != null ? fmtNum(lastVal, 3) : "\u2014"}</span>
          {ratio.variacion30dPct != null && (
            <span className={ratio.variacion30dPct >= 0 ? "text-success" : "text-danger"}>
              {fmtPct(ratio.variacion30dPct, 1)}
            </span>
          )}
        </div>
      </div>
      <div className="text-[9px] text-muted-foreground mb-2 leading-relaxed">
        {ratio.interpretacion}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="fecha"
            tick={{ fontSize: 8, fill: "#9aa6bd" }}
            stroke="#2b3242"
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: string) => v.slice(5, 10)}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fontSize: 8, fill: "#9aa6bd" }}
            stroke="#2b3242"
            axisLine={false}
            tickLine={false}
            width={40}
            domain={["auto", "auto"]}
          />
          <Tooltip
            contentStyle={{
              background: "#141a28",
              border: "1px solid #2b3242",
              borderRadius: 8,
              fontSize: 11,
              fontFamily: "monospace",
            }}
          />
          <Line type="monotone" dataKey="valor" stroke="#c9a84c" strokeWidth={1.5} dot={false} />
        </LineChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[8px] text-muted-foreground leading-relaxed">{ratio.descripcion}</p>
    </Card>
  );
}

// ─── Componente Lectura Intermarket (colapsable) ──────────────

function LecturaIntermarketCard({ data }: { data: NonNullable<IntermarketResult> }) {
  const li = data.lecturaIntermarket;

  const regimenColorMap: Record<string, string> = {
    inflacionario: "text-danger",
    desinflacionario: "text-success",
    desacople: "text-warning",
    mixto: "text-muted-foreground",
    deflacionario: "text-warning",
  };
  const regimenBgMap: Record<string, string> = {
    inflacionario: "bg-danger/10 border-danger/30",
    desinflacionario: "bg-success/10 border-success/30",
    desacople: "bg-warning/10 border-warning/30",
    mixto: "bg-muted/10 border-muted/30",
    deflacionario: "bg-warning/10 border-warning/30",
  };

  return (
    <Card
      className={`border ${regimenBgMap[li.regimen] ?? "bg-background/40/40 border-border/40"} bg-background/40/40 p-4`}
    >
      <Collapsible>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <BookOpen className="h-3.5 w-3.5 text-muted-foreground/80" />
            <span className="font-mono text-xs font-semibold text-foreground">
              Lectura Intermarket
            </span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${regimenColorMap[li.regimen] ?? "text-muted-foreground"} bg-current/10`}
            >
              {li.regimen}
            </span>
            <span className="font-mono text-[9px] text-muted-foreground">
              confianza {li.confianza}%
            </span>
          </div>
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform ui-open:rotate-180" />
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-3">
          {/* Barra de confianza */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted-foreground shrink-0">Confianza</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-border/30">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all ${li.confianza >= 70 ? "bg-success" : li.confianza >= 40 ? "bg-warning" : "bg-danger"}`}
                style={{ width: `${li.confianza}%` }}
              />
            </div>
            <span className="font-mono text-[9px] text-muted-foreground w-8 text-right">
              {li.confianza}%
            </span>
          </div>

          {/* Índice de presión inflacionaria */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted-foreground">
              Presión inflacionaria
            </span>
            <span
              className={`font-mono text-[10px] font-semibold ${li.indicePresion > 0.3 ? "text-danger" : li.indicePresion < -0.3 ? "text-success" : "text-muted-foreground"}`}
            >
              {fmtNum(li.indicePresion, 2)}
            </span>
          </div>

          {/* Contexto histórico */}
          {li.contextoHistorico && (
            <p className="text-[9px] text-muted-foreground/70 italic leading-relaxed">
              {li.contextoHistorico}
            </p>
          )}

          {/* Patrón histórico detectado */}
          {li.patronHistoricoDetectado && (
            <div className="rounded border border-border/30 bg-border/5 px-2 py-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-semibold text-foreground">
                  {li.patronHistoricoDetectado.nombre}
                </span>
                <span
                  className={`font-mono text-[8px] px-1 py-0.5 rounded ${li.matchPatron >= 70 ? "bg-warning/20 text-warning" : "bg-border/20 text-muted-foreground"}`}
                >
                  match {li.matchPatron}%
                </span>
              </div>
            </div>
          )}

          {/* Alerta activa */}
          {li.alertaActiva && (
            <div className="rounded border border-warning/40 bg-warning/10 px-2 py-1.5 text-[9px] font-mono text-warning leading-relaxed">
              {""} {li.alertaActiva}
            </div>
          )}

          {/* Sesgo */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted-foreground">Sesgo recomendado</span>
            <span
              className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
                li.recomendacionSesgo === "cauteloso"
                  ? "text-danger bg-danger/10"
                  : li.recomendacionSesgo === "favorable"
                    ? "text-success bg-success/10"
                    : "text-muted-foreground bg-border/20"
              }`}
            >
              {li.recomendacionSesgo}
            </span>
          </div>

          {/* Secuencia de giros */}
          <p className="text-[8px] text-muted-foreground/60 font-mono leading-relaxed">
            {li.secuenciaGiros.detalle}
          </p>

          {/* Cap. 3: Ratio Commodities/Bonos */}
          <div className="rounded border border-border/30 bg-border/5 px-2 py-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[9px] text-muted-foreground">
                Ratio Commodities/Bonos
              </span>
              <span
                className={`font-mono text-[9px] font-semibold ${
                  li.ratioCommoditiesBonos.tendencia === "alcista"
                    ? "text-warning"
                    : li.ratioCommoditiesBonos.tendencia === "bajista"
                      ? "text-success"
                      : "text-muted-foreground"
                }`}
              >
                {li.ratioCommoditiesBonos.tendencia}
              </span>
            </div>
            <p className="text-[8px] text-muted-foreground/70 font-mono mt-1 leading-relaxed">
              {li.ratioCommoditiesBonos.sesgoSectorial}
            </p>
          </div>

          {/* Cap. 3: Secuencia de rotación */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted-foreground">Rotación 3 etapas</span>
            <span
              className={`font-mono text-[9px] ${li.secuenciaRotacion.ordenConfirmado ? "text-success" : "text-muted-foreground"}`}
            >
              {li.secuenciaRotacion.ordenConfirmado ? "Confirmada" : "No confirmada"}
            </span>
          </div>
          {li.secuenciaRotacion.lagEstimadoProximaEtapa && (
            <p className="text-[8px] text-muted-foreground/60 font-mono leading-relaxed">
              {li.secuenciaRotacion.lagEstimadoProximaEtapa}
            </p>
          )}

          {/* Cap. 3: Convergencia de commodities */}
          {li.convergenciaCommodities.indicesEnAlza.length +
            li.convergenciaCommodities.indicesEnBaja.length >
            0 && (
            <div className="flex flex-wrap gap-2">
              <span className="font-mono text-[9px] text-muted-foreground">
                Convergencia commodities
              </span>
              {li.convergenciaCommodities.convergen ? (
                <span className="font-mono text-[9px] text-success">
                  Confirmada (todos los índices alineados)
                </span>
              ) : (
                <span className="font-mono text-[9px] text-muted-foreground">
                  Mixta — {li.convergenciaCommodities.indicesEnAlza.length} en alza,{" "}
                  {li.convergenciaCommodities.indicesEnBaja.length} en baja
                </span>
              )}
            </div>
          )}

          {/* Cap. 3: Bear market silencioso */}
          {li.bearMarketSilencioso.detectado && (
            <div className="rounded border border-warning/40 bg-warning/10 px-2 py-1.5">
              <p className="text-[9px] font-mono text-warning leading-relaxed">
                {""} {li.bearMarketSilencioso.contextoHistorico}
              </p>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ─── Componente principal ──────────────────────────────────────

export function IntermarketPanel() {
  const getAnalysis = useServerFn(getIntermarketAnalysis);
  const getMurphyIndicators = useServerFn(getIntermarketMurphyIndicators);
  const tavilySearch = useServerFn(searchTavily);

  // ─── Tavily ──────────────────────────────────────────
  const [tavilyQuery, setTavilyQuery] = useState("");
  const [tavilyResults, setTavilyResults] = useState<TavilyResult[]>([]);
  const [tavilyAnswer, setTavilyAnswer] = useState("");
  const [tavilyLoading, setTavilyLoading] = useState(false);
  const [tavilyError, setTavilyError] = useState("");
  const PRESET_QUERIES = [
    "Argentina economic outlook 2026 bonds BCRA",
    "S&P 500 MSCI emerging markets rotation",
    "US dollar index DXY commodities impact",
    "climate risk corn soybeans production 2026",
  ];

  const handleTavilySearch = useCallback(
    async (query: string) => {
      setTavilyLoading(true);
      setTavilyError("");
      setTavilyResults([]);
      setTavilyAnswer("");
      try {
        const res = await tavilySearch({
          data: {
            query,
            maxResults: 8,
            includeAnswer: true,
            searchDepth: "advanced",
            topic: "news",
            daysBack: 7,
          },
        });
        if ("error" in res) {
          setTavilyError(res.error as string);
        } else {
          setTavilyResults(res.results);
          setTavilyAnswer(res.answer ?? "");
        }
      } catch (e: any) {
        setTavilyError(e.message);
      } finally {
        setTavilyLoading(false);
      }
    },
    [tavilySearch],
  );

  // ─── Earth2 ──────────────────────────────────────────
  const [earth2Status, setEarth2Status] = useState<string | null>(null);
  const [earth2Models, setEarth2Models] = useState<{ id: string; name: string }[]>([]);
  const [earth2Forecast, setEarth2Forecast] = useState<Earth2ForecastResponse | null>(null);
  const [earth2Loading, setEarth2Loading] = useState(false);
  const [earth2Error, setEarth2Error] = useState("");

  const checkEarth2 = useCallback(async () => {
    setEarth2Loading(true);
    setEarth2Error("");
    try {
      const status = await fetchEarth2Status();
      setEarth2Status(status.earth2_available ? "ok" : "error");
      if (status.earth2_available) {
        const modelsData = await fetchEarth2Models();
        setEarth2Models(modelsData.models ?? []);
        const fct = await fetchEarth2Forecast({ model: "e2studio", forecast_hours: 24 });
        setEarth2Forecast(fct);
      }
    } catch (e: any) {
      setEarth2Error(e.message);
    } finally {
      setEarth2Loading(false);
    }
  }, []);

  // ─── Earth2 auto-check ───────────────────────────────
  const { data, isLoading, isError } = useQuery({
    queryKey: ["intermarket-analysis"],
    queryFn: () => getAnalysis(),
    staleTime: 15 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  // ─── Murphy Indicators (Stovall sector rotation) ───────
  const { data: murphyData, isLoading: murphyLoading } = useQuery({
    queryKey: ["intermarket-murphy"],
    queryFn: () => getMurphyIndicators(),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Error al cargar análisis intermarket.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerta 1987 condicional */}
      {data.alerta1987.activa && (
        <div className="rounded-md border border-warning/50 bg-warning/10 px-4 py-2.5 text-[10px] font-mono leading-relaxed text-warning">
          {""} {data.alerta1987.mensaje}
        </div>
      )}

      {/* Divergencia Oil/XLE condicional */}
      {data.divergenciaOilXLE.detectada && (
        <div className="rounded-md border border-warning/50 bg-warning/10 px-4 py-2.5 text-[10px] font-mono leading-relaxed text-warning">
          {""} {data.divergenciaOilXLE.mensaje}
        </div>
      )}

      {/* Sección 1: Correlaciones de Pearson */}
      <div>
        <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Correlaciones entre clases de activos (ventana 60 ruedas)
        </h3>
        <p className="mb-3 text-[8px] text-muted-foreground/50 font-mono leading-relaxed">
          * DBC utilizado como proxy del índice CRB clásico
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.correlations.map((c: RollingCorrelation) => (
            <CorrelationGauge
              key={c.label}
              value={c.current}
              label={c.label}
              interpretation={c.interpretation}
              infoTooltip={INFO_TOOLTIPS[c.label]}
              leadLagText={c.leadLagText}
              correlacionEstructural={c.correlacionEstructural}
            />
          ))}
        </div>
      </div>

      {/* Bloque Lectura Intermarket (colapsable, después de sección 1) */}
      <LecturaIntermarketCard data={data} />

      {/* Evaluación del lag del dólar */}
      {data.evaluacionLagDolar.correlacion60d != null && (
        <Card className="border-border/40 bg-background/40/40 p-4">
          <h4 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Lag del Dólar (evaluación multi-ventana)
          </h4>
          <div className="flex flex-wrap gap-3 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-[9px] text-muted-foreground">60d:</span>
              <span
                className={`font-mono text-[10px] font-semibold ${data.evaluacionLagDolar.correlacion60d != null && Math.abs(data.evaluacionLagDolar.correlacion60d) > 0.3 ? (data.evaluacionLagDolar.correlacion60d < 0 ? "text-success" : "text-danger") : "text-muted-foreground"}`}
              >
                {fmtNum(data.evaluacionLagDolar.correlacion60d, 2)}
              </span>
            </div>
            {data.evaluacionLagDolar.correlacion250d != null && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-muted-foreground">250d:</span>
                <span
                  className={`font-mono text-[10px] font-semibold ${Math.abs(data.evaluacionLagDolar.correlacion250d) > 0.3 ? (data.evaluacionLagDolar.correlacion250d < 0 ? "text-success" : "text-danger") : "text-muted-foreground"}`}
                >
                  {fmtNum(data.evaluacionLagDolar.correlacion250d, 2)}
                </span>
              </div>
            )}
            {data.evaluacionLagDolar.correlacion500d != null && (
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-muted-foreground">500d:</span>
                <span
                  className={`font-mono text-[10px] font-semibold ${Math.abs(data.evaluacionLagDolar.correlacion500d) > 0.3 ? (data.evaluacionLagDolar.correlacion500d < 0 ? "text-success" : "text-danger") : "text-muted-foreground"}`}
                >
                  {fmtNum(data.evaluacionLagDolar.correlacion500d, 2)}
                </span>
              </div>
            )}
          </div>
          <p className="text-[9px] text-muted-foreground/70 font-mono leading-relaxed">
            {data.evaluacionLagDolar.interpretacion}
          </p>
        </Card>
      )}

      {/* Sección 2: Argentina (existente) */}
      <Card className="border-border/40 bg-background/40/40 p-4">
        <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Argentina en el contexto global
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.argentina.map((a: ArgentinaCorrelation) => (
            <CorrelationGauge
              key={a.label}
              value={a.current}
              label={a.label}
              interpretation={a.interpretation}
            />
          ))}
        </div>
      </Card>

      {/* Sección 3: Relative Strength Ratios (PASO 13 — Murphy) */}
      <div>
        <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Relative Strength — ratios sectoriales (Murphy, Cap. 3, 4, 11 y 13)
        </h3>
        <p className="mb-3 text-[9px] text-muted-foreground leading-relaxed">
          A diferencia de los gauges de correlación de Pearson (arriba), estos ratios miden
          liderazgo relativo: si un ratio sube, el numerador está superando al denominador. Es la
          herramienta principal que usa John Murphy para identificar rotación sectorial y presión en
          tasas.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {data.relativeStrength.map((r: RelativeStrengthRatio) => (
            <RelativeStrengthChart key={r.label} ratio={r} />
          ))}
          {data.ratioCommoditiesBonos && (
            <RelativeStrengthChart
              key={data.ratioCommoditiesBonos.label}
              ratio={data.ratioCommoditiesBonos}
            />
          )}
        </div>
      </div>

      {/* Sección 3.5: Stovall Sector Rotation (Cap. 13) */}
      <Card className="border-border/40 bg-background/40/40 p-4">
        <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Rotación Sectorial — Modelo de Stovall (Murphy, Cap. 13)
        </h3>
        {murphyLoading ? (
          <Skeleton className="h-32 w-full rounded-md" />
        ) : murphyData ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant="secondary"
                className="text-[8px] font-mono bg-primary/20 text-primary border-primary/30"
              >
                Fase actual: {murphyData.cycle.label}
              </Badge>
              <span className="text-[8px] text-muted-foreground font-mono">
                Stage {murphyData.cycle.stage}
              </span>
            </div>
            <div className="rounded-md border border-border/30 bg-muted/20 p-3">
              <h4 className="mb-2 text-[9px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
                Sectores líderes (según ciclo)
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {murphyData.cycle.sectoresLideres.map((sector) => (
                  <Badge
                    key={sector}
                    variant="outline"
                    className="text-[8px] font-mono border-border/50"
                  >
                    {sector}
                  </Badge>
                ))}
              </div>
            </div>
            <p className="text-[8px] text-muted-foreground/70 font-mono leading-relaxed">
              {murphyData.cycle.description}
            </p>
          </div>
        ) : (
          <div className="text-[9px] text-muted-foreground">Datos no disponibles</div>
        )}
      </Card>

      {/* ─── Sección 4: Tavily AI + Clima (análisis enriquecido) ─── */}
      <Card className="border-border/40 bg-background/40/40 p-4">
        <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Análisis enriquecido — Noticias AI + Clima
        </h3>
        <Tabs defaultValue="tavily" className="w-full">
          <TabsList className="mb-3">
            <TabsTrigger value="tavily" className="text-[10px] font-mono gap-1">
              <Search className="size-3" /> Noticias AI
            </TabsTrigger>
            <TabsTrigger value="clima" className="text-[10px] font-mono gap-1">
              <CloudSun className="size-3" /> Clima
            </TabsTrigger>
          </TabsList>

          {/* ── Tavily ── */}
          <TabsContent value="tavily" className="mt-0">
            {/* Búsqueda rápida */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {PRESET_QUERIES.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setTavilyQuery(q);
                    handleTavilySearch(q);
                  }}
                  className="rounded-md border border-border/40 bg-muted/30 px-2 py-1 text-[9px] font-mono text-muted-foreground hover:bg-muted/60 transition-colors"
                >
                  {q.length > 40 ? q.slice(0, 40) + "…" : q}
                </button>
              ))}
            </div>
            {/* Input custom */}
            <div className="flex gap-2 mb-3">
              <input
                className="flex-1 rounded-md border border-border/40 bg-background px-2.5 py-1.5 text-[10px] font-mono outline-none focus:border-primary/50"
                placeholder="Buscar noticias financieras…"
                value={tavilyQuery}
                onChange={(e) => setTavilyQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tavilyQuery.trim())
                    handleTavilySearch(tavilyQuery.trim());
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={tavilyLoading || !tavilyQuery.trim()}
                onClick={() => handleTavilySearch(tavilyQuery.trim())}
                className="text-[10px] font-mono h-8"
              >
                {tavilyLoading ? "Buscando…" : "Buscar"}
              </Button>
            </div>
            {/* Error */}
            {tavilyError && (
              <div className="mb-2 rounded border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[9px] font-mono text-danger">
                {tavilyError}
              </div>
            )}
            {/* Answer */}
            {tavilyAnswer && (
              <div className="mb-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[9px] font-mono text-foreground/80 leading-relaxed">
                <span className="font-semibold text-primary text-[9px]">AI:</span> {tavilyAnswer}
              </div>
            )}
            {/* Results */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {tavilyLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))
              ) : tavilyResults.length === 0 ? (
                <p className="text-[9px] text-muted-foreground/50 font-mono italic">
                  Seleccioná un tema predefinido o escribí una búsqueda personalizada.
                </p>
              ) : (
                tavilyResults.map((r, i) => (
                  <a
                    key={i}
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md border border-border/30 bg-background/60 px-3 py-2 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-mono font-semibold text-foreground/90 leading-tight">
                        {r.title}
                      </span>
                      <Badge variant="outline" className="text-[7px] font-mono shrink-0">
                        {r.score?.toFixed(2)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-[8px] text-muted-foreground/60 font-mono line-clamp-2">
                      {r.content}
                    </p>
                  </a>
                ))
              )}
            </div>
          </TabsContent>

          {/* ── Clima ── */}
          <TabsContent value="clima" className="mt-0">
            {earth2Status === null && !earth2Loading && (
              <div className="text-center py-6">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={checkEarth2}
                  className="text-[10px] font-mono"
                >
                  Conectar con Earth2Studio
                </Button>
              </div>
            )}
            {earth2Loading && (
              <div className="space-y-2">
                <Skeleton className="h-6 w-48 rounded" />
                <Skeleton className="h-32 w-full rounded-md" />
              </div>
            )}
            {earth2Error && (
              <div className="rounded border border-danger/30 bg-danger/10 px-2.5 py-1.5 text-[9px] font-mono text-danger">
                {earth2Error}
              </div>
            )}
            {earth2Status === "ok" && earth2Forecast && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge
                    variant="secondary"
                    className="text-[8px] font-mono bg-success/20 text-success border-success/30"
                  >
                    Earth2 activo
                  </Badge>
                  <span className="text-[8px] text-muted-foreground font-mono">
                    Modelo: {earth2Forecast.forecast.model} &middot; Pasos:{" "}
                    {earth2Forecast.forecast.total_steps}
                  </span>
                </div>
                {/* Variables disponibles */}
                {earth2Forecast.forecast.steps.length > 0 && (
                  <>
                    <div className="rounded-md border border-border/30 bg-background/60 p-3">
                      <h4 className="mb-2 text-[9px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
                        Último paso — variables
                      </h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(
                          earth2Forecast.forecast.steps[earth2Forecast.forecast.steps.length - 1]
                            .data,
                        )
                          .slice(0, 8)
                          .map(([key, val]) => (
                            <div
                              key={key}
                              className="rounded border border-border/20 bg-muted/20 p-2"
                            >
                              <div className="text-[8px] font-mono text-muted-foreground/60">
                                {key}
                              </div>
                              <div className="text-[9px] font-mono font-semibold">
                                {typeof val === "number" ? val.toFixed(2) : String(val)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                    {/* Chart: primera variable */}
                    {(() => {
                      const firstVar = Object.keys(earth2Forecast.forecast.steps[0].data)[0];
                      if (!firstVar) return null;
                      const chartData = earth2Forecast.forecast.steps.map((s) => ({
                        step: s.step,
                        value: s.data[firstVar] ?? 0,
                      }));
                      return (
                        <div className="h-48">
                          <p className="mb-1 text-[8px] font-mono text-muted-foreground/60">
                            {firstVar}
                          </p>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                              <XAxis
                                dataKey="step"
                                tick={{ fontSize: 8, fontFamily: "monospace" }}
                                stroke="hsl(var(--muted-foreground))"
                              />
                              <YAxis
                                tick={{ fontSize: 8, fontFamily: "monospace" }}
                                stroke="hsl(var(--muted-foreground))"
                              />
                              <Tooltip
                                contentStyle={{
                                  fontSize: "9px",
                                  fontFamily: "monospace",
                                  background: "hsl(var(--background))",
                                  border: "1px solid hsl(var(--border))",
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="value"
                                stroke="hsl(var(--primary))"
                                dot={false}
                                strokeWidth={1.5}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </>
                )}
                {/* Financial analysis summary */}
                {earth2Forecast.analysis.summary.length > 0 && (
                  <div className="rounded-md border border-border/30 bg-muted/20 p-3">
                    <h4 className="mb-1.5 text-[9px] font-mono font-semibold text-muted-foreground uppercase tracking-wider">
                      Análisis financiero climático
                    </h4>
                    {earth2Forecast.analysis.summary.map((line, i) => (
                      <p
                        key={i}
                        className="text-[8px] font-mono text-foreground/70 leading-relaxed"
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
