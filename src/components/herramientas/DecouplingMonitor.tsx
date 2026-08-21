// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getDecouplingMonitor,
  type DecouplingSignal,
  type DecouplingLevel,
  type CompositeScore,
  type YieldCurveData,
} from "@/lib/sectores/decoupling-monitor.functions";

// ─── Helpers ──────────────────────────────────────────────────────────────

const NIVEL_CONFIG: Record<
  DecouplingLevel,
  { label: string; color: string; bg: string; border: string; icon: string }
> = {
  bajo: {
    label: "Bajo",
    color: "text-green-400",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
    icon: "",
  },
  moderado: {
    label: "Moderado",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    icon: "",
  },
  alto: {
    label: "Alto",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    icon: "",
  },
  critico: {
    label: "Crítico",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: "",
  },
};

function fmtNum(n: number | null | undefined, dp = 4): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toFixed(dp);
}

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${(n * 100).toFixed(dp)}%`;
}

// ─── Score Gauge ──────────────────────────────────────────────────────────

function ScoreGauge({ score }: { score: CompositeScore | undefined | null }) {
  if (!score) {
    return (
      <Card className="border-border/40 bg-background/40/40 p-3.5">
        <span className="text-[9px] text-muted-foreground">Score compuesto no disponible</span>
      </Card>
    );
  }
  const cfg = NIVEL_CONFIG[score.nivel] ?? NIVEL_CONFIG.bajo;
  const pct = score.score;
  return (
    <Card className={cn("border-2", cfg.border, cfg.bg)}>
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{cfg.icon}</span>
          <div>
            <div className="flex items-center gap-2">
              <span className={cn("text-lg font-bold font-mono tracking-wide", cfg.color)}>
                Riesgo de Desacople: {cfg.label}
              </span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {score.senalesActivas}/{score.totalSenales} señales activas
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground/80 mt-0.5">
              Score compuesto: {pct}% &mdash; cruzando 4 señales (correlación bonos/acciones,
              CRB/Bonds, curva de rendimientos, consumo defensivo vs cíclico)
            </p>
          </div>
        </div>
      </div>
      <div className="relative h-3 mx-4 mb-4 rounded-full bg-border/30">
        <div
          className={cn(
            "absolute left-0 top-0 h-full rounded-full transition-all",
            cfg.color.replace("text-", "bg-"),
          )}
          style={{ width: `${pct}%` }}
        />
        {[25, 50, 75].map((t) => (
          <div
            key={t}
            className="absolute top-0 h-full w-px bg-border/50"
            style={{ left: `${t}%` }}
          />
        ))}
      </div>
    </Card>
  );
}

// ─── Signal Card ──────────────────────────────────────────────────────────

function SignalCard({ signal }: { signal: DecouplingSignal | undefined | null }) {
  if (!signal) {
    return (
      <Card className="border-border/40 bg-background/40/40 p-3.5">
        <span className="text-[9px] text-muted-foreground">Señal no disponible</span>
      </Card>
    );
  }
  const cfg = NIVEL_CONFIG[signal.nivel] ?? NIVEL_CONFIG.bajo;
  return (
    <Card className="border-border/40 bg-background/40/40 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">
          {signal.label}
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[8px] font-mono border",
            cfg.color,
            cfg.border,
            cfg.bg,
          )}
        >
          {cfg.icon} {cfg.label}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">Valor</span>
          <span
            className={cn(
              "text-[11px] font-mono",
              signal.valor != null ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {fmtNum(signal.valor)}
          </span>
        </div>
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">Umbral</span>
          <span className="text-[9px] font-mono text-muted-foreground">{signal.umbral}</span>
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground/70 leading-relaxed">{signal.detalle}</p>
      <span className="text-[7px] font-mono text-muted-foreground/40 block mt-1">
        {signal.fuente}
      </span>
    </Card>
  );
}

// ─── Yield Curve Detail ───────────────────────────────────────────────────

function YieldCurveDetail({
  yieldCurve,
}: {
  yieldCurve: (YieldCurveData & { senal: DecouplingSignal }) | undefined | null;
}) {
  if (!yieldCurve || !yieldCurve.senal) {
    return (
      <Card className="border-border/40 bg-background/40/40 p-3.5">
        <span className="text-[9px] text-muted-foreground">
          Curva de rendimientos no disponible
        </span>
      </Card>
    );
  }
  const cfg = NIVEL_CONFIG[yieldCurve.senal.nivel] ?? NIVEL_CONFIG.bajo;
  return (
    <Card className="border-border/40 bg-background/40/40 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">
          Curva de Rendimientos
        </span>
        <span
          className={cn(
            "rounded px-1.5 py-0.5 text-[8px] font-mono border",
            cfg.color,
            cfg.border,
            cfg.bg,
          )}
        >
          {cfg.icon} {yieldCurve.invertida ? "INVERTIDA" : cfg.label}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2 mb-2">
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">10Y (^TNX)</span>
          <span className="text-[11px] font-mono text-foreground">
            {yieldCurve.ust10y != null ? `${yieldCurve.ust10y.toFixed(2)}%` : "\u2014"}
          </span>
        </div>
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">5Y (^FVX)</span>
          <span className="text-[11px] font-mono text-foreground">
            {yieldCurve.ust5y != null ? `${yieldCurve.ust5y.toFixed(2)}%` : "\u2014"}
          </span>
        </div>
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">3M (^IRX)</span>
          <span className="text-[11px] font-mono text-foreground">
            {yieldCurve.irx3m != null ? `${yieldCurve.irx3m.toFixed(2)}%` : "\u2014"}
          </span>
        </div>
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">Spread 10Y-2Y</span>
          <span
            className={cn(
              "text-[11px] font-mono",
              yieldCurve.invertida ? "text-red-400" : "text-green-400",
            )}
          >
            {yieldCurve.spread10y2y != null ? `${yieldCurve.spread10y2y.toFixed(2)}%` : "\u2014"}
          </span>
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground/70 leading-relaxed">
        {yieldCurve.senal.detalle}
      </p>
    </Card>
  );
}

// ─── Tabla Resumen ────────────────────────────────────────────────────────

function ResumenTable({
  correlacion,
  crb,
  cons,
}: {
  correlacion: DecouplingSignal;
  crb: DecouplingSignal;
  cons: DecouplingSignal;
}) {
  const rows = [
    {
      var: "Correlación SPY vs TLT",
      api: "getBenchmarksMatrix",
      behavior: "Negativa (Bonds ↑ / Stocks ↓)",
      actual: `${fmtNum(correlacion.valor)}`,
      nivel: correlacion.nivel,
    },
    {
      var: "Precio de Commodities",
      api: "getYahooQuoteServer",
      behavior: "Tendencia Bajista (Cobre/Oro)",
      actual: `${fmtPct(crb.valor)}`,
      nivel: crb.nivel,
    },
    {
      var: "Yield 10Y Treasury",
      api: "getSerieHistoricaConTIR",
      behavior: "Mínimos históricos",
      actual: "\u2014",
      nivel: "bajo" as DecouplingLevel,
    },
    {
      var: "Ratio Staples / Cyclicals",
      api: "SectoresPage",
      behavior: "STAPLES lideran (inversores buscan defensivos)",
      actual: `${fmtNum(cons.valor)}`,
      nivel: cons.nivel,
    },
  ];

  return (
    <Card className="border-border/40 bg-background/40/40 p-3.5">
      <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground block mb-2">
        Resumen de Variables a Monitorear
      </span>
      <div className="overflow-x-auto">
        <table className="w-full text-[9px] font-mono">
          <thead>
            <tr className="text-muted-foreground/60 border-b border-border/20">
              <th className="text-left py-1.5 pr-2">Variable</th>
              <th className="text-left py-1.5 pr-2">API / Fuente</th>
              <th className="text-left py-1.5 pr-2">Comportamiento Deflacionario</th>
              <th className="text-right py-1.5 pr-2">Actual</th>
              <th className="text-right py-1.5">Nivel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const nc = NIVEL_CONFIG[r.nivel];
              return (
                <tr key={r.var} className="border-b border-border/10 hover:bg-background/20/20">
                  <td className="py-1.5 pr-2 text-foreground">{r.var}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground/70">{r.api}</td>
                  <td className="py-1.5 pr-2 text-muted-foreground/70">{r.behavior}</td>
                  <td className="py-1.5 pr-2 text-right text-foreground">{r.actual}</td>
                  <td className="py-1.5 text-right">
                    <span className={cn("rounded px-1 py-0.5 text-[8px]", nc.color, nc.bg)}>
                      {nc.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[8px] text-muted-foreground/50 mt-2 leading-relaxed">
        Conclusión: Las APIs no darán un mensaje "estamos en deflación", pero al cruzar bonos al
        alza con commodities a la baja mediante las Server Functions, el dashboard muestra
        visualmente el régimen macroeconómico actual según Murphy.
      </p>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function DecouplingMonitor() {
  const fn = useServerFn(getDecouplingMonitor);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["decoupling-monitor"],
    queryFn: () => fn(),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-[10px] text-danger">
        Error al cargar monitor de desacople.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScoreGauge score={data.compuesto} />

      <div className="grid gap-3 sm:grid-cols-2">
        <SignalCard signal={data.correlacionTLTSPY} />
        <SignalCard signal={data.ratioCRBBonds} />
        <YieldCurveDetail yieldCurve={data.yieldCurve} />
        <SignalCard signal={data.consumerCyclical} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SignalCard signal={data.argentinaIPC} />
        <ResumenTable
          correlacion={data.correlacionTLTSPY}
          crb={data.ratioCRBBonds}
          cons={data.consumerCyclical}
        />
      </div>

      <p className="text-[8px] text-muted-foreground/40 font-mono text-right">
        Última actualización: {new Date(data.generatedAt).toLocaleString("es-AR")}
      </p>
    </div>
  );
}
