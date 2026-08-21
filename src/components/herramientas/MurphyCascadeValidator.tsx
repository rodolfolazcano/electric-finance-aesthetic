// @ts-nocheck
// ─── Murphy Cascade Validator — DXY → CRB → TLT → SPY ─────────
// Valida que el orden de líderes de Murphy (Cap. 1-3) se cumpla.

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  validateMurphyCascade,
  trendDirectionToArrow,
  type MurphyCascadeResult,
} from "@/lib/cycle-phase-detector";
import type { CompleteIntermarketResult } from "@/lib/intermarket-complete";

// ─── Props ───────────────────────────────────────────────────────

interface MurphyCascadeValidatorProps {
  data: CompleteIntermarketResult;
}

// ─── Helpers ─────────────────────────────────────────────────────

function ArrowIcon({ direction }: { direction: string }) {
  if (direction === "up") return <span className="text-green-400">▲</span>;
  if (direction === "down") return <span className="text-red-400">▼</span>;
  return <span className="text-muted-foreground">—</span>;
}

// ─── Componente principal ────────────────────────────────────────

export function MurphyCascadeValidator({ data }: MurphyCascadeValidatorProps) {
  const cascade: MurphyCascadeResult | null = useMemo(() => {
    const ctx = data.context;
    const ratios = data.ratios;

    // Lead-lag pairs del contexto
    const dxyDbcLL = ctx?.leadLag?.find((ll) => ll.pair === "DXY vs DBC") ?? null;
    const dbcSpyLL = ctx?.leadLag?.find((ll) => ll.pair === "DBC vs SPY") ?? null;
    const tltSpyLL = ctx?.leadLag?.find((ll) => ll.pair === "TLT vs SPY") ?? null;

    // Direcciones de cada activo
    const dxyDir = trendDirectionToArrow(ctx?.dxy?.direction ?? null);
    const commoditiesDir = trendDirectionToArrow(ctx?.commodities?.direction ?? null);
    const bondsDir = trendDirectionToArrow(ctx?.bonds?.direction ?? null);
    const stocksDir = trendDirectionToArrow(ctx?.stocks?.direction ?? null);

    return validateMurphyCascade({
      dxyDbc: dxyDbcLL
        ? { leader: dxyDbcLL.leader, lagDays: dxyDbcLL.lagDays, correlation: dxyDbcLL.correlation }
        : null,
      dbcSpy: dbcSpyLL
        ? { leader: dbcSpyLL.leader, lagDays: dbcSpyLL.lagDays, correlation: dbcSpyLL.correlation }
        : null,
      tltSpy: tltSpyLL
        ? { leader: tltSpyLL.leader, lagDays: tltSpyLL.lagDays, correlation: tltSpyLL.correlation }
        : null,
      dxyDirection: dxyDir,
      dbcDirection: commoditiesDir,
      tltDirection: bondsDir,
      spyDirection: stocksDir,
    });
  }, [data]);

  if (!cascade) return null;

  const { links, intactLinks, totalLinks, cascadeHealth, mainBreakPoint, interpretation } = cascade;

  const borderColor =
    cascadeHealth === "intacta"
      ? "border-emerald-500/30"
      : cascadeHealth === "parcial"
        ? "border-amber-500/30"
        : cascadeHealth === "rota"
          ? "border-red-500/30"
          : "border-border/40";

  const headerColor =
    cascadeHealth === "intacta"
      ? "text-emerald-400"
      : cascadeHealth === "parcial"
        ? "text-amber-400"
        : cascadeHealth === "rota"
          ? "text-red-400"
          : "text-muted-foreground";

  return (
    <Card className={cn("p-4", borderColor)}>
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">
            {cascadeHealth === "intacta"
              ? "✅"
              : cascadeHealth === "parcial"
                ? "🟡"
                : cascadeHealth === "rota"
                  ? "🔴"
                  : "⚪"}
          </span>
          <div>
            <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground">
              Paso 4 — Cascada Intermarket (Murphy Cap. 1-3)
            </div>
            <p className="text-[9px] text-muted-foreground/70 mt-0.5">
              Orden de líderes: DXY → CRB → TLT → SPY
            </p>
          </div>
        </div>
        <div
          className={cn("text-[10px] px-2 py-1 rounded font-mono font-bold border", headerColor)}
        >
          {intactLinks}/{totalLinks} intactas — {cascadeHealth.toUpperCase()}
        </div>
      </div>

      {/* ── Las 3 flechas de la cascada ─────────────────────── */}
      <div className="relative mb-4">
        {/* Barra horizontal con los 4 activos */}
        <div className="flex items-center justify-between gap-1 px-2 py-3">
          {/* DXY */}
          <div className="flex flex-col items-center z-10">
            <div
              className={cn(
                "w-14 text-center px-2 py-1.5 rounded text-[10px] font-mono font-bold border",
                "bg-cyan-500/10 border-cyan-500/30 text-cyan-400",
              )}
            >
              DXY
            </div>
            <ArrowIcon
              direction={
                data.context?.dxy?.direction === "rising"
                  ? "up"
                  : data.context?.dxy?.direction === "falling"
                    ? "down"
                    : "flat"
              }
            />
          </div>

          {/* Flecha 1 → DBC */}
          <div className="flex-1 flex items-center justify-center relative">
            <div
              className={cn(
                "h-0.5 w-full absolute",
                links[0]?.intact ? "bg-emerald-500/50" : "bg-red-500/50",
              )}
            />
            <div
              className={cn(
                "z-10 text-[7px] px-1 py-0.5 rounded font-mono border",
                links[0]?.intact
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              {links[0]?.leader ?? "?"}
              {links[0]?.lagDays != null ? ` (${links[0].lagDays}d)` : ""}
            </div>
          </div>

          {/* DBC */}
          <div className="flex flex-col items-center z-10">
            <div
              className={cn(
                "w-14 text-center px-2 py-1.5 rounded text-[10px] font-mono font-bold border",
                "bg-amber-500/10 border-amber-500/30 text-amber-400",
              )}
            >
              DBC
            </div>
            <ArrowIcon
              direction={
                data.context?.commodities?.direction === "rising"
                  ? "up"
                  : data.context?.commodities?.direction === "falling"
                    ? "down"
                    : "flat"
              }
            />
          </div>

          {/* Flecha 2 → TLT */}
          <div className="flex-1 flex items-center justify-center relative">
            <div
              className={cn(
                "h-0.5 w-full absolute",
                links[1]?.intact ? "bg-emerald-500/50" : "bg-red-500/50",
              )}
            />
            <div
              className={cn(
                "z-10 text-[7px] px-1 py-0.5 rounded font-mono border",
                links[1]?.intact
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              {links[1]?.leader ?? "?"}
            </div>
          </div>

          {/* TLT */}
          <div className="flex flex-col items-center z-10">
            <div
              className={cn(
                "w-14 text-center px-2 py-1.5 rounded text-[10px] font-mono font-bold border",
                "bg-blue-500/10 border-blue-500/30 text-blue-400",
              )}
            >
              TLT
            </div>
            <ArrowIcon
              direction={
                data.context?.bonds?.direction === "rising"
                  ? "up"
                  : data.context?.bonds?.direction === "falling"
                    ? "down"
                    : "flat"
              }
            />
          </div>

          {/* Flecha 3 → SPY */}
          <div className="flex-1 flex items-center justify-center relative">
            <div
              className={cn(
                "h-0.5 w-full absolute",
                links[2]?.intact ? "bg-emerald-500/50" : "bg-red-500/50",
              )}
            />
            <div
              className={cn(
                "z-10 text-[7px] px-1 py-0.5 rounded font-mono border",
                links[2]?.intact
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400",
              )}
            >
              {links[2]?.leader ?? "?"}
              {links[2]?.lagDays != null ? ` (${links[2].lagDays}d)` : ""}
            </div>
          </div>

          {/* SPY */}
          <div className="flex flex-col items-center z-10">
            <div
              className={cn(
                "w-14 text-center px-2 py-1.5 rounded text-[10px] font-mono font-bold border",
                "bg-green-500/10 border-green-500/30 text-green-400",
              )}
            >
              SPY
            </div>
            <ArrowIcon
              direction={
                data.context?.stocks?.direction === "rising"
                  ? "up"
                  : data.context?.stocks?.direction === "falling"
                    ? "down"
                    : "flat"
              }
            />
          </div>
        </div>

        {/* Punto de ruptura */}
        {mainBreakPoint && cascadeHealth !== "intacta" && (
          <div className="text-center mt-1">
            <span className="text-[8px] font-mono text-red-400">
              ⚠️ Ruptura en: {mainBreakPoint}
            </span>
          </div>
        )}
      </div>

      {/* ── Detalle de cada link ────────────────────────────── */}
      <div className="space-y-1.5 mb-3">
        {links.map((link, i) => (
          <div
            key={`${link.from}→${link.to}`}
            className={cn(
              "flex items-start gap-2 px-2.5 py-1.5 rounded border text-[9px]",
              link.intact
                ? "bg-emerald-500/5 border-emerald-500/15"
                : "bg-red-500/5 border-red-500/15",
            )}
          >
            <span>{link.intact ? "✅" : "❌"}</span>
            <div className="flex-1">
              <span className="font-semibold font-mono text-foreground">
                {link.from} → {link.to}
              </span>
              <span className="text-muted-foreground ml-1">
                (líder real: {link.leader ?? "sin datos"})
                {link.lagDays != null ? ` · lag: ${link.lagDays}d` : ""}
                {link.correlation != null ? ` · r: ${link.correlation.toFixed(2)}` : ""}
              </span>
              <p className="text-[7px] text-muted-foreground/50 mt-0.5 leading-relaxed">
                {link.label}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Interpretación ──────────────────────────────────── */}
      <div
        className={cn(
          "px-3 py-2 rounded-lg text-[9px] font-mono leading-relaxed border",
          cascadeHealth === "intacta"
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
            : cascadeHealth === "parcial"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-300"
              : cascadeHealth === "rota"
                ? "bg-red-500/10 border-red-500/20 text-red-300"
                : "bg-muted/10 border-border/20 text-muted-foreground",
        )}
      >
        {interpretation}
      </div>
    </Card>
  );
}
