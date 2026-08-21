// @ts-nocheck
//  Inflation Diagnosis — Demanda vs Oferta (Murphy Cap. 3, 8, 10) 
// Muestra si la inflación es por demanda (buena) o por oferta (mala).

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  diagnoseInflationType,
  trendDirectionToArrow,
  type InflationDiagnosisResult,
} from "@/lib/cycle-phase-detector";
import type { CompleteIntermarketResult } from "@/lib/intermarket-complete";

//  Props 

interface InflationDiagnosisProps {
  data: CompleteIntermarketResult;
}

//  Helpers 

function SignalRow({
  label,
  trend,
  expected,
}: {
  label: string;
  trend: string | null;
  expected: string;
}) {
  const isUp = trend === "up";
  const isDown = trend === "down";
  const isGood = expected === "up" ? isUp : isDown;
  const icon = isGood ? "[OK]" : trend === null ? "" : isUp || isDown ? "[ERROR]" : "";
  const arrow = isUp ? "" : isDown ? "" : "—";

  return (
    <div className="flex items-center gap-2 text-[13px] font-mono">
      <span>{icon}</span>
      <span
        className={cn(
          "font-medium",
          isGood ? "text-green-400" : trend === null ? "text-muted-foreground" : "text-red-400",
        )}
      >
        {label}
      </span>
      <span className="text-muted-foreground/60">{arrow}</span>
      <span className="text-muted-foreground/40 text-[7px]">
        (esperado {expected === "up" ? "" : ""})
      </span>
    </div>
  );
}

function SectorTags({ sectors, type }: { sectors: string[]; type: "buy" | "sell" }) {
  if (sectors.length === 0) return <span className="text-[12px] text-muted-foreground/50">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {sectors.map((s) => (
        <span
          key={s}
          className={cn(
            "px-1.5 py-0.5 rounded text-[12px] font-mono border leading-tight",
            type === "buy"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-red-500/10 border-red-500/30 text-red-400",
          )}
        >
          {s}
        </span>
      ))}
    </div>
  );
}

//  Componente principal 

export function InflationDiagnosis({ data }: InflationDiagnosisProps) {
  const diagnosis: InflationDiagnosisResult | null = useMemo(() => {
    const ratios = data.ratios;

    const getTrend = (id: string) => {
      const r = ratios.find((x) => x.id === id);
      return trendDirectionToArrow(r?.signal?.direction ?? null);
    };

    return diagnoseInflationType({
      crbBondsTrend: getTrend("CRB_BONDS"),
      copperGoldTrend: getTrend("COPPER_GOLD"),
      goldOilTrend: getTrend("GOLD_OIL"),
      dxyTrend: trendDirectionToArrow(data.context?.dxy?.direction ?? null),
      hyLqdTrend: getTrend("HYG_LQD"),
      xlyXlpTrend: getTrend("XLY_XLP"),
    });
  }, [data]);

  if (!diagnosis || diagnosis.type === "no_inflacionario") return null;

  const {
    type,
    label,
    icon,
    color,
    confidence,
    description,
    signals,
    buySectors,
    sellSectors,
    chapterRef,
  } = diagnosis;

  const borderColor =
    type === "demanda"
      ? "border-green-500/30"
      : type === "oferta"
        ? "border-red-500/30"
        : "border-amber-500/30";

  const bgColor =
    type === "demanda" ? "bg-green-500/5" : type === "oferta" ? "bg-red-500/5" : "bg-amber-500/5";

  return (
    <Card className={cn("p-4", borderColor, bgColor)}>
      {/*  Header  */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">{icon}</span>
          <div>
            <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground">
              Paso 3 — Tipo de Inflación:{" "}
              {type === "demanda" ? "Demanda" : type === "oferta" ? "Oferta" : "Mixta"}
            </div>
            <p className="text-[13px] text-muted-foreground/70 mt-0.5">{chapterRef}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-[13px] px-1.5 py-0.5 rounded font-mono border", color)}>
            {label}
          </span>
          <span
            className={cn(
              "text-[12px] px-1.5 py-0.5 rounded font-mono border",
              confidence === "alta"
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400",
            )}
          >
            {confidence === "alta" ? "Alta confianza" : "Confianza media"}
          </span>
        </div>
      </div>

      {/*  Señales  */}
      <div className="mb-3 space-y-1 px-1">
        <div className="text-[12px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-1">
          Señales de diagnóstico:
        </div>
        <SignalRow label="Copper/Gold (Dr. Copper)" trend={signals.copperGoldTrend} expected="up" />
        <SignalRow label="Gold/Oil (Incertidumbre)" trend={signals.goldOilTrend} expected="down" />
        <SignalRow label="DXY (Dólar)" trend={signals.dxyTrend} expected="down" />
        <SignalRow label="HYG/LQD (Crédito)" trend={signals.hyLqdTrend} expected="up" />
        <SignalRow label="XLY/XLP (Consumidor)" trend={signals.xlyXlpTrend} expected="up" />
      </div>

      {/*  Descripción  */}
      <div
        className={cn(
          "mb-3 px-3 py-2 rounded-lg text-[13px] font-mono leading-relaxed border",
          type === "demanda"
            ? "bg-green-500/10 border-green-500/20 text-green-300"
            : type === "oferta"
              ? "bg-red-500/10 border-red-500/20 text-red-300"
              : "bg-amber-500/10 border-amber-500/20 text-amber-300",
        )}
      >
        {description}
      </div>

      {/*  Sectores  */}
      <div className="grid w-full gap-2 md:grid-cols-2">
        <div>
          <div className="text-[13px] font-mono font-semibold uppercase tracking-wider text-emerald-400 mb-1.5">
            [OK] Comprar en este escenario
          </div>
          <SectorTags sectors={buySectors} type="buy" />
        </div>
        <div>
          <div className="text-[13px] font-mono font-semibold uppercase tracking-wider text-red-400 mb-1.5">
            [ERROR] Vender / Evitar en este escenario
          </div>
          <SectorTags sectors={sellSectors} type="sell" />
        </div>
      </div>
    </Card>
  );
}
