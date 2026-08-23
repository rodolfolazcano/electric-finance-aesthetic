// ─── Phase 1 Dashboard — Wrapper del Murphy Engine ─────────────
// MacroGauge bars + regime badge + GWR validation table

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getPhase1Overview } from "@/lib/phase1/overview.functions";
import type {
  Phase1Data,
  MacroIndicator,
  GwrClaim,
  GwrSummary,
} from "@/lib/phase1/types";

// ─── Helpers ────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function colorPorValor(valor: number | null, tipo: "inverse" | "normal"): string {
  if (valor == null) return "text-muted-foreground";
  const abs = Math.abs(valor);
  if (tipo === "inverse") {
    // inverse: alto = malo (ej VIX, DXY, yields)
    if (abs > 5) return "text-red-400";
    if (abs > 2) return "text-amber-400";
    return "text-green-400";
  }
  // normal: alto = bueno
  if (abs > 5) return "text-green-400";
  if (abs > 2) return "text-amber-400";
  return "text-muted-foreground";
}

function posicionEnRango(valor: number | null, min: number | null, max: number | null): number {
  if (valor == null || min == null || max == null || max === min) return 50;
  return ((valor - min) / (max - min)) * 100;
}

function gaugeColor(pct: number, inverse = false): string {
  if (inverse) {
    if (pct > 80) return "bg-red-500";
    if (pct > 50) return "bg-amber-500";
    return "bg-green-500";
  }
  if (pct > 80) return "bg-green-500";
  if (pct > 50) return "bg-amber-500";
  return "bg-red-500";
}

// ─── MacroGauge ─────────────────────────────────────────────────

function MacroGauge({ indicator, inverse = false }: { indicator: MacroIndicator; inverse?: boolean }) {
  const pct = posicionEnRango(indicator.valor, indicator.rango52wMin, indicator.rango52wMax);

  return (
    <div className="min-w-[160px] flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground truncate">
          {indicator.label}
        </span>
        <span className="text-[9px] font-mono text-muted-foreground/50">{indicator.ticker}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
          {fmtNum(indicator.valor, indicator.valor != null && indicator.valor < 10 ? 2 : 1)}
        </span>
        <span className={cn("text-[10px] font-mono font-medium", colorPorValor(indicator.variacion1dPct, inverse ? "inverse" : "normal"))}>
          {fmtPct(indicator.variacion1dPct)}
        </span>
      </div>
      {/* Gauge bar */}
      <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", gaugeColor(pct, inverse))}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div className="flex justify-between mt-0.5">
        <span className="text-[7px] font-mono text-muted-foreground/40">{fmtNum(indicator.rango52wMin, 1)}</span>
        <span className="text-[7px] font-mono text-muted-foreground/40">{fmtNum(indicator.rango52wMax, 1)}</span>
      </div>
    </div>
  );
}

// ─── RegimeBadge ────────────────────────────────────────────────

function RegimeBadge({ regime }: { regime: Phase1Data["regime"] }) {
  const colorMap: Record<string, string> = {
    inflacionario: "bg-red-900/30 text-red-300 border-red-700/30",
    desinflacionario: "bg-green-900/30 text-green-300 border-green-700/30",
    deflacionario: "bg-blue-900/30 text-blue-300 border-blue-700/30",
    mixto: "bg-amber-900/30 text-amber-300 border-amber-700/30",
  };

  const badgeColor = colorMap[regime.classification.toLowerCase()] ?? colorMap["mixto"];

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className={cn("rounded-md border px-3 py-1.5", badgeColor)}>
        <div className="text-[10px] font-mono uppercase tracking-wider opacity-70">Régimen</div>
        <div className="text-sm font-semibold capitalize">{regime.classification}</div>
      </div>
      <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Presión</div>
        <div className="text-sm font-semibold text-foreground">{regime.inflationPressureScore}/100</div>
      </div>
      <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Confianza</div>
        <div className="text-sm font-semibold text-foreground">{regime.confianza}%</div>
      </div>
      <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-1.5">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Ciclo</div>
        <div className="text-sm font-semibold text-foreground">Stage {regime.stage} — {regime.stageLabel}</div>
      </div>
    </div>
  );
}

// ─── GWRTable ───────────────────────────────────────────────────

const VEREDICTO_COLORS: Record<string, string> = {
  acertado: "text-green-400",
  fallido: "text-red-400",
  pendiente: "text-amber-400",
  indeterminado: "text-muted-foreground",
};

const VEREDICTO_ICONS: Record<string, string> = {
  acertado: "✓",
  fallido: "✗",
  pendiente: "…",
  indeterminado: "",
};

function GwrRow({ claim }: { claim: GwrClaim }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <tr className="border-b border-border/20 hover:bg-muted/20 transition-colors">
      <td className="px-3 py-2 text-[10px] font-mono text-muted-foreground">{claim.id}</td>
      <td className="px-3 py-2 text-[11px] text-foreground max-w-[300px]">{claim.claim}</td>
      <td className="px-3 py-2 text-[10px] font-mono text-muted-foreground">{claim.fechaClaim}</td>
      <td className="px-3 py-2">
        <span className={cn("text-[11px] font-mono", VEREDICTO_COLORS[claim.veredicto])}>
          {VEREDICTO_ICONS[claim.veredicto]} {claim.veredicto}
        </span>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[9px] font-mono text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? "ocultar" : "detalle"}
        </button>
      </td>
    </tr>
  );
}

function GwrTable({ gwr }: { gwr: GwrSummary }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          GWR#63 Validation
        </span>
        <Badge variant="outline" className="text-[10px] font-mono">
          {gwr.acertados}/{gwr.total} aciertos
        </Badge>
        <Badge variant="outline" className="text-[10px] font-mono">
          {gwr.tasaAcierto}% tasa de acierto
        </Badge>
        <Badge variant="outline" className="text-[10px] font-mono text-amber-400 border-amber-700/30">
          {gwr.pendientes} pendientes
        </Badge>
      </div>
      <div className="overflow-x-auto">
        <table className="mono w-full text-[11px]">
          <thead className="text-[9px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-3 py-2 text-left">ID</th>
              <th className="px-3 py-2 text-left">Claim</th>
              <th className="px-3 py-2 text-left">Fecha</th>
              <th className="px-3 py-2 text-left">Veredicto</th>
              <th className="px-3 py-2 text-left"> </th>
            </tr>
          </thead>
          <tbody>
            {gwr.claims.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[10px] text-muted-foreground">
                  Sin claims cargados para evaluación.
                </td>
              </tr>
            ) : (
              gwr.claims.map((claim) => <GwrRow key={claim.id} claim={claim} />)
            )}
          </tbody>
        </table>
      </div>
      <div className="text-[8px] font-mono text-muted-foreground/40">
        Última actualización: {new Date(gwr.ultimaActualizacion).toLocaleString("es-AR")}
      </div>
    </div>
  );
}

// ─── MurphyMini ─────────────────────────────────────────────────

function MurphyMini({ murphy }: { murphy: Phase1Data["murphy"] }) {
  return (
    <div className="flex flex-wrap gap-4 text-[10px] font-mono">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Alerta:</span>
        <span className={murphy.alertaActiva ? "text-red-400 font-semibold" : "text-green-400"}>
          {murphy.alertaActiva ?? "Sin alertas activas"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Patrón:</span>
        <span>{murphy.patronHistorico ?? "Ninguno"}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Bear mkt silencioso:</span>
        <span className={murphy.bearMarketSilencioso ? "text-red-400" : "text-green-400"}>
          {murphy.bearMarketSilencioso ? "Sí" : "No"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Secuencia giros:</span>
        <span className={murphy.secuenciaGirosCorrecta ? "text-green-400" : "text-amber-400"}>
          {murphy.secuenciaGirosCorrecta ? "Correcta" : "Invertida/No detectada"}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Sesgo:</span>
        <span className={
          murphy.recomendacionSesgo === "cauteloso" ? "text-red-400" :
          murphy.recomendacionSesgo === "favorable" ? "text-green-400" :
          "text-muted-foreground"
        }>
          {murphy.recomendacionSesgo}
        </span>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

export function Phase1Dashboard() {
  const getPhase1 = useServerFn(getPhase1Overview);

  const { data, isLoading, isError, dataUpdatedAt } = useQuery({
    queryKey: ["phase1-overview"],
    queryFn: () => getPhase1(),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Error al cargar el dashboard Phase 1. Verificá que el servidor esté disponible.
      </div>
    );
  }

  const macro = data.macro;
  const regime = data.regime;

  return (
    <div className="space-y-4">
      {/* Timestamp + auto-refresh indicator */}
      <div className="flex items-center justify-between text-[8px] font-mono text-muted-foreground/50">
        <span>Phase 1 — Macro Dashboard</span>
        <span>Actualizado: {new Date(dataUpdatedAt ?? data.timestamp).toLocaleString("es-AR")}</span>
      </div>

      {/* Section 1: Regime Badge + Score */}
      <Card className="border-border/40 bg-background/40 p-4 space-y-3">
        <RegimeBadge regime={regime} />
        <div className="text-[10px] font-mono text-muted-foreground leading-relaxed">
          {regime.description}
        </div>
        <MurphyMini murphy={data.murphy} />
      </Card>

      {/* Section 2: MacroGauge bars */}
      <Card className="border-border/40 bg-background/40 p-4 space-y-4">
        <h3 className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          Macro Snapshot
        </h3>

        {/* US Yield Curve */}
        <div>
          <h4 className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-2">Curva de Tasas US</h4>
          <div className="flex flex-wrap gap-4">
            <MacroGauge indicator={macro.tnx} inverse />
            <MacroGauge indicator={macro.tyx} inverse />
            <MacroGauge indicator={macro.irx} inverse />
          </div>
          <div className="flex gap-4 mt-1.5 text-[9px] font-mono text-muted-foreground/50">
            <span>Spread 10Y-2Y: {macro.spread10y2y != null ? `${macro.spread10y2y.toFixed(2)} bps` : "\u2014"}</span>
            <span>Spread 10Y-30Y: {macro.spread10y30y != null ? `${macro.spread10y30y.toFixed(2)} bps` : "\u2014"}</span>
          </div>
        </div>

        {/* Short Term Treasuries */}
        <div>
          <h4 className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-2">Corto Plazo (Money Market)</h4>
          <div className="flex flex-wrap gap-4">
            <MacroGauge indicator={macro.sgov} inverse />
            <MacroGauge indicator={macro.bil} inverse />
            <MacroGauge indicator={macro.usfr} inverse />
          </div>
        </div>

        {/* Macro Global */}
        <div>
          <h4 className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-2">Macro Global</h4>
          <div className="flex flex-wrap gap-4">
            <MacroGauge indicator={macro.vix} inverse />
            <MacroGauge indicator={macro.dxy} inverse />
          </div>
        </div>

        {/* Commodities */}
        <div>
          <h4 className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-2">Commodities</h4>
          <div className="flex flex-wrap gap-4">
            <MacroGauge indicator={macro.gold} />
            <MacroGauge indicator={macro.oil} />
            <MacroGauge indicator={macro.copper} />
          </div>
        </div>
      </Card>

      {/* Section 3: GWR Validation */}
      <Card className="border-border/40 bg-background/40 p-4">
        <GwrTable gwr={data.gwr_validation} />
      </Card>
    </div>
  );
}
