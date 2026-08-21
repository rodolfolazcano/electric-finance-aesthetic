import type { VentajaCompetitiva } from "@/lib/moat-analysis.functions";

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function scoreTextColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-red-400";
}

function clasificacionBadge(clasificacion: string): string {
  if (clasificacion === "Moat Fuerte")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (clasificacion === "Moat Moderado")
    return "border-amber-500/30 bg-amber-500/10 text-amber-400";
  if (clasificacion === "Sin Moat Claro") return "border-red-500/30 bg-red-500/10 text-red-400";
  return "border-muted-foreground/30 bg-muted/10 text-muted-foreground";
}

function CriterionBar({
  puntos,
  maxPuntos,
  color,
}: {
  puntos: number;
  maxPuntos: number;
  color: string;
}) {
  const pct = maxPuntos > 0 ? (puntos / maxPuntos) * 100 : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-border/20">
      <div
        className={`h-1.5 rounded-full ${color} transition-all duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function MoatDashboard({
  moat,
  loading,
}: {
  moat: VentajaCompetitiva | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
          Ventaja Competitiva (Moat)
        </p>
        <p className="text-[13px] text-muted-foreground">Calculando ventaja competitiva...</p>
      </div>
    );
  }

  if (!moat) return null;

  const isInsufficient = moat.clasificacion === "Datos Insuficientes";
  const hasComponentesExcluidos = moat.componentesExcluidos && moat.componentesExcluidos.length > 0;
  const maxPuntosDisplay = moat.maxPuntosPosibles || 100;

  return (
    <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
      <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-1">
        Ventaja Competitiva (Moat)
      </p>
      <p className="text-[12px] text-muted-foreground/70 mb-3">
        Consistencia histórica de rentabilidad y estructura financiera ({moat.aniosAnalizados} años)
      </p>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground">
          Ventaja Competitiva
        </p>
        <span
          className={`text-[12px] font-mono px-1.5 py-0.5 rounded border ${clasificacionBadge(moat.clasificacion)}`}
        >
          {moat.clasificacion}
        </span>
      </div>

      {/* Score general */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <div className="h-2 w-full rounded-full bg-border/20">
            <div
              className={`h-2 rounded-full ${scoreColor(moat.score)} transition-all duration-500`}
              style={{ width: `${moat.score}%` }}
            />
          </div>
        </div>
        <span className={`text-[16px] font-bold font-mono ${scoreTextColor(moat.score)}`}>
          {moat.score}
          <span className="text-[13px] text-muted-foreground font-normal">
            /{maxPuntosDisplay}
            {hasComponentesExcluidos && (
              <span className="text-[12px] text-amber-400 ml-1">
                ({moat.componentesExcluidos.join(", ")} no disponible
                {moat.componentesExcluidos.length > 1 ? "s" : ""})
              </span>
            )}
          </span>
        </span>
      </div>

      {!isInsufficient && (
        <p className="text-[13px] text-muted-foreground mb-3">
          Basado en {moat.aniosAnalizados} años de datos financieros
        </p>
      )}

      {/* Desglose */}
      <div className="space-y-2">
        {moat.desglose.map((d) => {
          if (d.maxPuntos === 0) return null;
          const isExcluido =
            moat.componentesExcluidos && moat.componentesExcluidos.includes(d.criterio);
          const pct = d.maxPuntos > 0 ? d.puntos / d.maxPuntos : 0;
          const barColor =
            pct >= 0.7 ? "bg-emerald-500" : pct >= 0.4 ? "bg-amber-500" : "bg-red-500";
          return (
            <div key={d.criterio} className={isExcluido ? "opacity-50" : ""}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[13px] text-muted-foreground truncate pr-2">
                  {d.criterio}
                  {isExcluido && (
                    <span className="text-[12px] text-amber-400 ml-1">
                      (excluido por falta de datos)
                    </span>
                  )}
                </span>
                <span
                  className={`text-[13px] font-mono font-semibold ${isExcluido ? "text-muted-foreground" : scoreTextColor((d.puntos / d.maxPuntos) * 100)}`}
                >
                  {d.puntos}/{d.maxPuntos}
                </span>
              </div>
              <CriterionBar
                puntos={d.puntos}
                maxPuntos={d.maxPuntos}
                color={isExcluido ? "bg-muted" : barColor}
              />
              <p className="text-[13px] text-muted-foreground/70 leading-relaxed mt-0.5">
                {d.detalle}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
