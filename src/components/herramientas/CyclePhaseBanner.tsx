// @ts-nocheck
// ─── Cycle Phase Banner — Fase del ciclo + Rotación sectorial ────
// Componente visual para el PASO 1 del análisis (Murphy).
// Muestra la fase económica detectada y los sectores a comprar/vender.

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  diagnosePhase,
  type TrendArrow,
  trendDirectionToArrow,
  type PhaseDiagnosis,
} from "@/lib/cycle-phase-detector";
import type { CompleteIntermarketResult } from "@/lib/intermarket-complete";

// ─── Helpers de display ──────────────────────────────────────────

function ArrowIcon({ trend }: { trend: TrendArrow }) {
  if (trend === "up") return <span className="text-green-400 text-[10px]">▲</span>;
  if (trend === "down") return <span className="text-red-400 text-[10px]">▼</span>;
  return <span className="text-muted-foreground text-[10px]">—</span>;
}

function TrendLabel({ trend, label }: { trend: TrendArrow; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-mono">
      <ArrowIcon trend={trend} />
      <span
        className={cn(
          trend === "up"
            ? "text-green-400"
            : trend === "down"
              ? "text-red-400"
              : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function SectorTag({ name, type }: { name: string; type: "buy" | "sell" }) {
  return (
    <span
      className={cn(
        "inline-block px-1.5 py-0.5 rounded text-[9px] font-mono leading-tight border",
        type === "buy"
          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
          : "bg-red-500/10 border-red-500/30 text-red-400",
      )}
    >
      {name}
    </span>
  );
}

// ─── Props ───────────────────────────────────────────────────────

interface CyclePhaseBannerProps {
  data: CompleteIntermarketResult;
}

// ─── Componente principal ────────────────────────────────────────

export function CyclePhaseBanner({ data }: CyclePhaseBannerProps) {
  const diagnosis: PhaseDiagnosis | null = useMemo(() => {
    const ctx = data.context;
    if (!ctx) return null;

    // Extraer tendencias de las 3 clases de activos core
    const bondsArrow: TrendArrow = trendDirectionToArrow(ctx.bonds?.direction ?? null);
    const stocksArrow: TrendArrow = trendDirectionToArrow(ctx.stocks?.direction ?? null);
    const commoditiesArrow: TrendArrow = trendDirectionToArrow(ctx.commodities?.direction ?? null);

    // Extraer señales de confirmación de los ratios
    const findTrend = (ratioId: string): TrendArrow => {
      const ratio = data.ratios.find((r) => r.id === ratioId);
      if (!ratio) return null;
      return trendDirectionToArrow(ratio.signal.direction);
    };

    return diagnosePhase(
      { bondsTrend: bondsArrow, stocksTrend: stocksArrow, commoditiesTrend: commoditiesArrow },
      {
        xlyXlp: findTrend("XLY_XLP"),
        iwmSpy: findTrend("IWM_SPY"),
        rspSpy: findTrend("RSP_SPY"),
        hyLqd: findTrend("HYG_LQD"),
        xlkXle: findTrend("XLK_XLE"),
        goldSilver: findTrend("GOLD_SILVER"),
      },
    );
  }, [data]);

  if (!diagnosis) return null;

  const { phase, rotation, confidence, matchedSignals, totalSignals } = diagnosis;

  return (
    <Card className={cn("border-2 overflow-hidden", phase.borderColor, phase.bgColor)}>
      {/* ── Header: fase detectada ─────────────────────────────── */}
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">{phase.icon}</span>
            <div>
              <div
                className="text-xs font-bold font-mono tracking-wide"
                style={{ color: phase.color.replace("text-", "") }}
              >
                {phase.label}
              </div>
              <p className="text-[9px] text-muted-foreground/70 mt-0.5 max-w-xl leading-relaxed">
                {phase.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-mono border",
                confidence === "alta"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : confidence === "media"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              {matchedSignals}/{totalSignals} señales
            </span>
            <span
              className={cn(
                "text-[9px] px-1.5 py-0.5 rounded font-mono border",
                confidence === "alta"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : confidence === "media"
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              Confianza {confidence}
            </span>
          </div>
        </div>
      </div>

      {/* ── 3 Flechas core (Pring) ────────────────────────────── */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-3 text-[9px] font-mono text-muted-foreground/60">
          <span className="uppercase tracking-wider">Tendencias Pring:</span>
          <TrendLabel
            trend={
              (diagnosis.confirmationSignals.xlyXlp ?? data.context.bonds?.direction === "rising")
                ? "up"
                : data.context.bonds?.direction === "falling"
                  ? "down"
                  : "flat"
            }
            label="Bonos (TLT)"
          />
          <TrendLabel
            trend={
              data.context.stocks?.direction === "rising"
                ? "up"
                : data.context.stocks?.direction === "falling"
                  ? "down"
                  : "flat"
            }
            label="Acciones (SPY)"
          />
          <TrendLabel
            trend={
              data.context.commodities?.direction === "rising"
                ? "up"
                : data.context.commodities?.direction === "falling"
                  ? "down"
                  : "flat"
            }
            label="Comm. (DBC)"
          />
        </div>
      </div>

      {/* ── Confirmaciones Murphy ─────────────────────────────── */}
      <div className="px-4 pb-2">
        <div className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground/60">
          <span className="uppercase tracking-wider">Confirmación:</span>
          <TrendLabel trend={diagnosis.confirmationSignals.xlyXlp} label="XLY/XLP" />
          <TrendLabel trend={diagnosis.confirmationSignals.iwmSpy} label="IWM/SPY" />
          <TrendLabel trend={diagnosis.confirmationSignals.rspSpy} label="RSP/SPY" />
          <TrendLabel trend={diagnosis.confirmationSignals.hyLqd} label="HYG/LQD" />
          <TrendLabel trend={diagnosis.confirmationSignals.xlkXle} label="XLK/XLE" />
          {diagnosis.confirmationSignals.goldSilver !== null && (
            <TrendLabel trend={diagnosis.confirmationSignals.goldSilver} label="GLD/SLV" />
          )}
        </div>
      </div>

      {/* ── Rotación sectorial ────────────────────────────────── */}
      <div className="border-t border-border/20 px-4 py-3">
        <div className="grid gap-2 md:grid-cols-2">
          {/* COMPRAR */}
          <div>
            <div className="text-[9px] font-mono font-semibold uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1">
              <span>✅ COMPRAR / SOBREPONDER</span>
              <span className="text-[7px] text-muted-foreground/50 font-normal">
                ({rotation.style})
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {rotation.buy.map((sector) => (
                <SectorTag key={sector} name={sector} type="buy" />
              ))}
            </div>
          </div>

          {/* VENDER */}
          <div>
            <div className="text-[9px] font-mono font-semibold uppercase tracking-wider text-red-400 mb-1.5 flex items-center gap-1">
              <span>❌ VENDER / INFRAPONDERAR</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {rotation.sell.map((sector) => (
                <SectorTag key={sector} name={sector} type="sell" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
