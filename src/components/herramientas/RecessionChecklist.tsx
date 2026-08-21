//  Recession Checklist — 6 condiciones de Murphy (Cap. 14) 
// Muestra el checklist de recesión con cada condición y el score total.

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  checkRecessionChecklist,
  trendDirectionToArrow,
  type RecessionChecklistResult,
} from "@/lib/cycle-phase-detector";
import type { CompleteIntermarketResult } from "@/lib/intermarket-complete";

//  Props 

interface RecessionChecklistProps {
  data: CompleteIntermarketResult;
}

//  Helpers visuales 

function metIcon(met: boolean | null): string {
  if (met === true) return "[ROJO]";
  if (met === false) return "[VERDE]";
  return "";
}

function metLabel(met: boolean | null): string {
  if (met === true) return "ACTIVA";
  if (met === false) return "Normal";
  return "Sin datos";
}

function metColor(met: boolean | null): string {
  if (met === true) return "bg-red-500/10 border-red-500/30 text-red-400";
  if (met === false) return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
  return "bg-muted/10 border-border/30 text-muted-foreground";
}

//  Componente principal 

export function RecessionChecklist({ data }: RecessionChecklistProps) {
  const checklist: RecessionChecklistResult | null = useMemo(() => {
    // Extraer datos desde CompleteIntermarketResult
    const ctx = data.context;
    const ratios = data.ratios;
    const fed = data.complementary?.fedFunds;

    // 1. Yield curve spread (21d window)
    const yieldRatio = ratios.find((r) => r.id === "YIELD_CURVE");
    const yieldSpread = yieldRatio?.stats.windows[21]?.value ?? null;

    // 2. CRB/Bonds cambio 63d
    const crbRatio = ratios.find((r) => r.id === "CRB_BONDS");
    const crbChange63d = crbRatio?.stats.windows[63]?.changePct ?? null;

    // 3. DXY direction
    const dxyDir = trendDirectionToArrow(ctx?.dxy?.direction ?? null);

    // 4. HYG/LQD cambio 63d
    const hygRatio = ratios.find((r) => r.id === "HYG_LQD");
    const hygChange63d = hygRatio?.stats.windows[63]?.changePct ?? null;

    // 5. Fed cycle
    const fedPhase = fed?.cyclePhase ?? null;
    const fedRate = fed?.currentRate ?? null;

    // 6. Dow Theory
    const dow = ctx?.dowTheory;
    const dowConfirmed = dow?.confirmed ?? null;
    const dowDivergence = dow?.divergence ?? null;

    return checkRecessionChecklist({
      yieldCurveSpread21d: yieldSpread,
      crbBondsChange63d: crbChange63d,
      dxyDirection: dxyDir,
      hyLqdChange63d: hygChange63d,
      fedCyclePhase: fedPhase,
      fedCurrentRate: fedRate,
      dowTheoryConfirmed: dowConfirmed,
      dowTheoryDivergence: dowDivergence,
    });
  }, [data]);

  if (!checklist || checklist.totalCount === 0) return null;

  const { conditions, score, probability, interpretation } = checklist;

  // Color del score
  const scoreColor =
    probability === "inminente"
      ? "text-rose-400 border-rose-500/30 bg-rose-500/10"
      : probability === "alta"
        ? "text-red-400 border-red-500/30 bg-red-500/10"
        : probability === "moderada"
          ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
          : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";

  const progressColor =
    probability === "inminente"
      ? "bg-rose-500"
      : probability === "alta"
        ? "bg-red-500"
        : probability === "moderada"
          ? "bg-amber-500"
          : "bg-emerald-500";

  return (
    <Card className="p-4 border-amber-500/30">
      {/*  Header  */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">[ADVERTENCIA]</span>
          <div>
            <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground">
              Paso 2 — Checklist de Recesión (Murphy Cap. 14)
            </div>
            <p className="text-[13px] text-muted-foreground/70 mt-0.5">
              6 condiciones que Murphy usa para anticipar recesiones
            </p>
          </div>
        </div>
        <div className={cn("text-[13px] px-2 py-1 rounded font-mono font-bold border", scoreColor)}>
          {score}/{conditions.length} — {probability.toUpperCase()}
        </div>
      </div>

      {/*  Barra de progreso  */}
      <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden mb-4">
        <div
          className={cn("h-full rounded-full transition-all duration-500", progressColor)}
          style={{ width: `${(score / conditions.length) * 100}%` }}
        />
      </div>

      {/*  Cada condición  */}
      {conditions.map((cond) => (
        <div
          key={cond.id}
          className={cn(
            "flex items-start gap-3 py-2.5 px-3 rounded-lg mb-1.5 border transition-colors",
            cond.met === true
              ? "bg-red-500/5 border-red-500/20"
              : cond.met === false
                ? "bg-emerald-500/5 border-emerald-500/20"
                : "bg-muted/5 border-border/10",
          )}
        >
          {/* Indicador */}
          <span className="text-base leading-none mt-0.5">{metIcon(cond.met)}</span>

          {/* Cuerpo */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold font-mono text-foreground">
                {cond.label}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className={cn(
                  "text-[12px] px-1.5 py-0.5 rounded font-mono border leading-tight",
                  metColor(cond.met),
                )}>
                  {metLabel(cond.met)}
                </span>
                <span className="text-[12px] font-mono text-muted-foreground/50">
                  {cond.chapterRef}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={cn(
                "text-[13px] font-mono font-medium",
                cond.met === true ? "text-red-400" : cond.met === false ? "text-emerald-400" : "text-muted-foreground",
              )}>
                {cond.value}
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground/60 mt-0.5 leading-relaxed">
              {cond.detail}
            </p>
          </div>
        </div>
      ))}

      {/*  Interpretación final  */}
      <div className={cn(
        "mt-3 px-3 py-2 rounded-lg text-[13px] font-mono leading-relaxed border",
        probability === "inminente"
          ? "bg-rose-500/10 border-rose-500/20 text-rose-300"
          : probability === "alta"
            ? "bg-red-500/10 border-red-500/20 text-red-300"
            : probability === "moderada"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
      )}>
        {interpretation}
      </div>
    </Card>
  );
}
