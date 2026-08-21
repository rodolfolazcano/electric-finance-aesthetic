// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  getIntermarketRatios,
  type RatioSignal,
  type ArrowsPhase,
} from "@/lib/sectores/internarket-ratios.functions";

// ─── Helpers ──────────────────────────────────────────────────────────────

const SIGNAL_LABELS: Record<string, string> = {
  INFLACION: "Inflacionario",
  DESINFLACION: "Desinflacionario",
  FLIGHT_TO_QUALITY: "Flight-to-Quality",
  RISK_ON: "Risk-On",
  PAPER_ASSETS_STRONG: "Papel > Oro",
  TANGIBLE_ASSETS_STRONG: "Oro > Papel",
  DEFENSIVE_BIAS: "Defensivo",
  CYCLICAL_BIAS: "Cíclico",
  NEUTRAL: "Neutral",
};

const SIGNAL_COLORS: Record<string, string> = {
  INFLACION: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  DESINFLACION: "bg-green-500/20 text-green-400 border-green-500/30",
  FLIGHT_TO_QUALITY: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  RISK_ON: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  PAPER_ASSETS_STRONG: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  TANGIBLE_ASSETS_STRONG: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  DEFENSIVE_BIAS: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  CYCLICAL_BIAS: "bg-pink-500/20 text-pink-400 border-pink-500/30",
  NEUTRAL: "bg-muted/20 text-muted-foreground border-border/30",
};

const STAGE_CONFIG: Record<number, { color: string; bg: string; border: string }> = {
  0: { color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30" },
  1: { color: "text-green-400", bg: "bg-green-500/10", border: "border-green-500/30" },
  2: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  3: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" },
  4: { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" },
  5: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" },
};

const STAGE_ICONS: Record<number, string> = {
  0: "🔴",
  1: "🟢",
  2: "🟢",
  3: "🟡",
  4: "🟠",
  5: "🔴🔴",
};

function TrendArrow({ trend }: { trend: string | null | undefined }) {
  if (trend === "up") return <span className="text-green-400 text-xs">▲</span>;
  if (trend === "down") return <span className="text-red-400 text-xs">▼</span>;
  return <span className="text-muted-foreground text-xs">◆</span>;
}

function fmtNum(n: number | null | undefined, dp = 4): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toFixed(dp);
}

function fmtPctStr(n: number | null | undefined, dp = 1): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return (n >= 0 ? "+" : "") + n.toFixed(dp) + "%";
}

function ConfianzaBar({ nivel }: { nivel: number }) {
  const color =
    nivel >= 70 ? "bg-green-500" : nivel >= 40 ? "bg-yellow-500" : "bg-muted-foreground/30";
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative h-1.5 w-full max-w-[60px] rounded-full bg-border/30">
        <div
          className={cn("absolute left-0 top-0 h-full rounded-full", color)}
          style={{ width: nivel + "%" }}
        />
      </div>
      <span className="text-[9px] font-mono text-muted-foreground">{nivel}%</span>
    </div>
  );
}

// ─── Ratio Card ───────────────────────────────────────────────────────────

function RatioCard({ ratio }: { ratio: RatioSignal }) {
  const signalColor = SIGNAL_COLORS[ratio.signal] ?? SIGNAL_COLORS.NEUTRAL;
  return (
    <Card className="border-border/40 bg-background/40/40 p-3.5">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <TrendArrow trend={ratio.trend} />
          <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground">
            {ratio.label}
          </span>
        </div>
        <span className={cn("rounded px-1.5 py-0.5 text-[8px] font-mono border", signalColor)}>
          {SIGNAL_LABELS[ratio.signal] ?? ratio.signal}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-2">
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">Ratio</span>
          <span className="text-[11px] font-mono text-foreground">{fmtNum(ratio.ratioActual)}</span>
        </div>
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">1m</span>
          <span
            className={cn(
              "text-[11px] font-mono",
              (ratio.changePct1m ?? 0) > 0
                ? "text-green-400"
                : ratio.changePct1m != null && ratio.changePct1m < 0
                  ? "text-red-400"
                  : "text-muted-foreground",
            )}
          >
            {fmtPctStr(ratio.changePct1m)}
          </span>
        </div>
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">3m</span>
          <span
            className={cn(
              "text-[11px] font-mono",
              (ratio.changePct3m ?? 0) > 0
                ? "text-green-400"
                : ratio.changePct3m != null && ratio.changePct3m < 0
                  ? "text-red-400"
                  : "text-muted-foreground",
            )}
          >
            {fmtPctStr(ratio.changePct3m)}
          </span>
        </div>
        <div>
          <span className="text-[8px] font-mono text-muted-foreground block">Percentil</span>
          <span
            className={cn(
              "text-[11px] font-mono",
              ratio.percentil != null
                ? ratio.percentil >= 90
                  ? "text-red-400"
                  : ratio.percentil >= 70
                    ? "text-orange-400"
                    : ratio.percentil <= 10
                      ? "text-green-400"
                      : "text-muted-foreground"
                : "",
            )}
          >
            {ratio.percentil != null ? `${ratio.percentil}%` : "\u2014"}
          </span>
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground/70 leading-relaxed mb-2">
        {ratio.interpretacion}
      </p>

      {ratio.sectoresFavorecidos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          <span className="text-[8px] font-mono text-muted-foreground/50 mr-0.5">→</span>
          {ratio.sectoresFavorecidos.map((s) => (
            <span
              key={s}
              className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2">
        <ConfianzaBar nivel={ratio.nivelConfianza} />
      </div>
    </Card>
  );
}

// ─── 3 Flechas Card ───────────────────────────────────────────────────────

function ArrowsCard({ arrows }: { arrows: ArrowsPhase }) {
  const cfg = STAGE_CONFIG[arrows.stage] ?? STAGE_CONFIG[2];
  return (
    <Card className={cn("border-2", cfg.border, cfg.bg)}>
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{STAGE_ICONS[arrows.stage] ?? "◆"}</span>
            <div>
              <span className={cn("text-sm font-bold font-mono tracking-wide", cfg.color)}>
                {arrows.shortLabel}
              </span>
              <p className="text-[9px] text-muted-foreground/80 mt-0.5">
                Pring 3-Arrows · Confianza {arrows.confianza}
              </p>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-foreground/80 leading-relaxed mb-4">{arrows.description}</p>

        {/* 3 flechas */}
        <div className="flex gap-4 mb-4 text-center justify-center">
          {[
            { label: "Bonos (TLT)", arrow: arrows.bondsArrow },
            { label: "Acciones (SPY)", arrow: arrows.stocksArrow },
            { label: "Commodities (DBC)", arrow: arrows.commoditiesArrow },
          ].map((a) => (
            <div key={a.label} className="flex flex-col items-center gap-1">
              <TrendArrow trend={a.arrow} />
              <span className="text-[9px] font-mono text-muted-foreground">{a.label}</span>
              <span className="text-[8px] font-mono text-muted-foreground/60">
                {a.arrow ?? "—"}
              </span>
            </div>
          ))}
        </div>

        {/* Buy / Sell */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="text-[8px] font-mono uppercase tracking-wider text-green-400 block mb-1">
              Comprar
            </span>
            <ul className="space-y-0.5">
              {arrows.buy.map((item) => (
                <li key={item} className="text-[9px] text-foreground/70 font-mono">
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <span className="text-[8px] font-mono uppercase tracking-wider text-red-400 block mb-1">
              Vender
            </span>
            <ul className="space-y-0.5">
              {arrows.sell.map((item) => (
                <li key={item} className="text-[9px] text-foreground/70 font-mono">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-3 pt-3 border-t border-border/20">
          <span className="text-[8px] font-mono text-muted-foreground/60">{arrows.estilo}</span>
        </div>
      </div>
    </Card>
  );
}

// ─── Pricing Power / Backlogs Section ─────────────────────────────────────

function PricingPowerSection() {
  return (
    <Card className="border-border/40 bg-background/40/40 p-4">
      <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-foreground block mb-2">
        Pricing Power & Backlogs (2026)
      </span>
      <p className="text-[9px] text-muted-foreground/70 leading-relaxed mb-3">
        Empresas con backlogs plurianuales (contratos cerrados a 2–3 años) anulan el riesgo de
        demanda. Sectores con pricing power — capacidad de trasladar inflación de costos sin perder
        volumen — son claves en contextos inflacionarios. Buscar en infraestructura física (PAVE),
        ingeniería nuclear (RARE), redes eléctricas, semiconductores y defensa (XAR).
      </p>
      <div className="flex flex-wrap gap-2">
        <span className="text-[8px] font-mono px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
          PAVE — Infraestructura
        </span>
        <span className="text-[8px] font-mono px-2 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
          RARE — Uranio/Nuclear
        </span>
        <span className="text-[8px] font-mono px-2 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
          XAR — Defensa
        </span>
        <span className="text-[8px] font-mono px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          SOXX — Semiconductores
        </span>
        <span className="text-[8px] font-mono px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
          XLU — Utilities (Redes)
        </span>
      </div>
    </Card>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export function IntermarketRatiosPanel() {
  const fn = useServerFn(getIntermarketRatios);
  const [solapa, setSolapa] = useState<"ratios" | "ciclo">("ratios");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["intermarket-ratios"],
    queryFn: () => fn(),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48 rounded" />
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-[10px] text-danger">
        Error al cargar ratios intermarket.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Solapas */}
      <div className="flex gap-1 border-b border-border/40 pb-2">
        {[
          { key: "ratios" as const, label: "Ratios Intermarket" },
          { key: "ciclo" as const, label: "Ciclo Económico (Pring/Stovall)" },
        ].map((s) => (
          <button
            key={s.key}
            onClick={() => setSolapa(s.key)}
            className={cn(
              "text-[10px] font-mono px-3 py-1.5 rounded-t transition-colors",
              solapa === s.key
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {solapa === "ratios" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.ratios.map((r) => (
              <RatioCard key={r.ratioKey} ratio={r} />
            ))}
          </div>
          <PricingPowerSection />
        </>
      )}

      {solapa === "ciclo" && (
        <div className="space-y-4">
          <ArrowsCard arrows={data.arrows} />
          <PricingPowerSection />
        </div>
      )}
    </div>
  );
}
