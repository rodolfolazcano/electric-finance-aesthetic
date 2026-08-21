// @ts-nocheck
//  Murphy Validation Panel — Reporte capítulo-por-capítulo 
// Muestra las 25+ validaciones contra los 15 capítulos del libro.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getMurphyValidatorReport } from "@/lib/murphy-validator.functions";
import type { MurphyReport, ChapterSummary } from "@/lib/murphy-validator";

//  Helpers visuales 

const SIGNAL_ICON: Record<string, string> = {
  bullish: "[VERDE]",
  bearish: "[ROJO]",
  neutral: "",
  warning: "[ADVERTENCIA]",
};

const SIGNAL_COLOR: Record<string, string> = {
  bullish: "text-green-400 border-green-500/30 bg-green-500/10",
  bearish: "text-red-400 border-red-500/30 bg-red-500/10",
  neutral: "text-muted-foreground border-border/30 bg-muted/10",
  warning: "text-amber-400 border-amber-500/30 bg-amber-500/10",
};

const CONFIDENCE_COLOR: Record<string, string> = {
  alta: "text-emerald-400",
  media: "text-amber-400",
  baja: "text-muted-foreground",
};

const CHAPTER_TITLES: Record<number, string> = {
  1: "CRB/Bonds — El Rey de ratios",
  2: "Commodities/Stocks — Inflación vs Crecimiento",
  3: "Bonds/Stocks — Flight-to-Quality",
  4: "Gold, Dollar, Petróleo — Monedas y Commodities",
  5: "Dow Theory — Confirmación de tendencia",
  6: "XLY/XLP — Confianza del Consumidor",
  7: "IYT/DIA — Transportes vs Industriales",
  8: "Yield Curve — Adelanto de recesión",
  9: "EFA/EEM — Rotación Global",
  10: "Sector Rotation — Late Cycle señales",
  11: "Growth/Value — Estilo de mercado",
  12: "HYG/LQD — Estrés Crediticio",
  13: "TLT/SPY correlación — Régimen anómalo",
  14: "Inversión de Curva — Alerta de recesión",
  15: "Ciclo Completo — Síntesis Murphy",
};

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(((score + 1) / 2) * 100);
  const color =
    score > 0.3
      ? "bg-green-500"
      : score > 0
        ? "bg-green-500/50"
        : score > -0.3
          ? "bg-red-500/50"
          : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", color)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[13px] font-mono text-muted-foreground w-8 text-right">
        {score.toFixed(2)}
      </span>
    </div>
  );
}

function ChapterCard({ chapter }: { chapter: ChapterSummary }) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        chapter.signal === "bullish"
          ? "border-green-500/20 bg-green-500/5"
          : chapter.signal === "bearish"
            ? "border-red-500/20 bg-red-500/5"
            : chapter.signal === "warning"
              ? "border-amber-500/20 bg-amber-500/5"
              : "border-border/20 bg-muted/5",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span>{SIGNAL_ICON[chapter.signal] ?? ""}</span>
            <span className="text-[13px] font-semibold font-mono text-foreground">
              {chapter.title}
            </span>
          </div>
          <p className="text-[12px] text-muted-foreground/50 mt-0.5">{chapter.reglaClave}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span
            className={cn(
              "text-[12px] px-1.5 py-0.5 rounded font-mono border",
              SIGNAL_COLOR[chapter.signal] ?? "",
            )}
          >
            {chapter.passedCount}/{chapter.rulesCount}
          </span>
          <span className={cn("text-[12px] font-mono", CONFIDENCE_COLOR[chapter.confianza] ?? "")}>
            {chapter.confianza}
          </span>
        </div>
      </div>
      <div className="mt-1.5">
        <ScoreBar score={chapter.compositeScore} />
      </div>
    </div>
  );
}

//  Componente principal 

export function MurphyValidationPanel() {
  const fn = useServerFn(getMurphyValidatorReport);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["murphy-validator"],
    queryFn: () => fn(),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-lg" />
        <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 15 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-[13px] text-danger">
        Error al cargar validación Murphy.
      </div>
    );
  }

  const {
    totalRules,
    totalPassed,
    overallScore,
    overallSignal,
    overallConfianza,
    chapters,
    divergencias,
    resumenEjecutivo,
    sectoresFavorecidos,
    sectoresEvitar,
  } = data;

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className={cn("p-4 border-2", SIGNAL_COLOR[overallSignal] ?? "border-border/40")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{SIGNAL_ICON[overallSignal] ?? ""}</span>
            <div>
              <div className="text-xs font-bold font-mono uppercase tracking-wider text-foreground">
                Validación Murphy — Reporte Completo
              </div>
              <p className="text-[13px] text-muted-foreground/70 mt-0.5">
                {totalRules} reglas evaluadas contra los 15 capítulos de "Intermarket Analysis"
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-[13px] px-2 py-1 rounded font-mono font-bold border",
                SIGNAL_COLOR[overallSignal] ?? "",
              )}
            >
              {overallSignal.toUpperCase()} ({overallScore.toFixed(2)})
            </span>
            <span
              className={cn(
                "text-[13px] px-2 py-1 rounded font-mono border",
                `bg-muted/10 border-border/30 ${CONFIDENCE_COLOR[overallConfianza]}`,
              )}
            >
              {totalPassed}/{totalRules} reglas cumplen
            </span>
          </div>
        </div>

        <div className="mt-3 h-2 bg-muted/30 rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              overallSignal === "bullish"
                ? "bg-green-500"
                : overallSignal === "bearish"
                  ? "bg-red-500"
                  : overallSignal === "warning"
                    ? "bg-amber-500"
                    : "bg-muted-foreground/30",
            )}
            style={{ width: `${((overallScore + 1) / 2) * 100}%` }}
          />
        </div>
      </Card>

      {/* Resumen ejecutivo */}
      <Card className="p-4 border-border/40">
        <div className="text-[13px] font-mono leading-relaxed text-foreground/80 whitespace-pre-line">
          {resumenEjecutivo}
        </div>
      </Card>

      {/* Divergencias */}
      {divergencias.length > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/5">
          <div className="text-[13px] font-mono font-semibold text-amber-400 uppercase tracking-wider mb-1.5">
            [ADVERTENCIA] Divergencias detectadas ({divergencias.length})
          </div>
          <ul className="space-y-1">
            {divergencias.map((d, i) => (
              <li key={i} className="text-[12px] font-mono text-amber-300/80">
                • {d}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Grid de 15 capítulos */}
      <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {chapters.map((ch) => (
          <ChapterCard key={ch.chapter} chapter={ch} />
        ))}
      </div>

      {/* Sectores favorecidos / evitar */}
      <div className="grid w-full gap-3 md:grid-cols-2">
        {sectoresFavorecidos.length > 0 && (
          <Card className="p-4 border-green-500/20 bg-green-500/5">
            <div className="text-[13px] font-mono font-semibold text-green-400 uppercase tracking-wider mb-1.5">
              [OK] Sectores Favorecidos
            </div>
            <div className="flex flex-wrap gap-1">
              {sectoresFavorecidos.map((s, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded text-[12px] font-mono border bg-green-500/10 border-green-500/30 text-green-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </Card>
        )}
        {sectoresEvitar.length > 0 && (
          <Card className="p-4 border-red-500/20 bg-red-500/5">
            <div className="text-[13px] font-mono font-semibold text-red-400 uppercase tracking-wider mb-1.5">
              [ERROR] Sectores a Evitar
            </div>
            <div className="flex flex-wrap gap-1">
              {sectoresEvitar.map((s, i) => (
                <span
                  key={i}
                  className="px-1.5 py-0.5 rounded text-[12px] font-mono border bg-red-500/10 border-red-500/30 text-red-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="text-[12px] font-mono text-muted-foreground/50 text-right">
        Generado: {new Date(data.generatedAt).toLocaleString("es-AR")}
      </div>
    </div>
  );
}
