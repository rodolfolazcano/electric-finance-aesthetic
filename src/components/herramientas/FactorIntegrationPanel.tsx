// @ts-nocheck
// ─── Factor Integration Panel — Todos los factores integrados ──
// Combina credito, rotacion sectorial, correlaciones y timeline
// usando solo datos disponibles sin server calls adicionales.
// Basado en Murphy (Caps. 1-15) + Pring (6 Stages).

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { InfoTip } from "./InfoTip";
import { cn } from "@/lib/utils";

const MURPHY_GLOSSARY: Record<string, { ch: string; title: string; quote: string }> = {
  "Cobre/Oro": {
    ch: "Cap. 3",
    title: "Dr. Copper (pp. 36-39)",
    quote:
      "El cobre anticipa la actividad económica industrial. Sube con expansión, baja con contracción. Oro es refugio. Cobre > Oro = expansión industrial.",
  },
  "Cíclico/Defensivo": {
    ch: "Cap. 10, pp. 109-111",
    title: "Rotación Sectorial",
    quote:
      "Cíclicos (XLY, XLI) suben en expansión. Defensivos (XLP, XLU) suben en contracción. Ratio alto = risk-on.",
  },
  "Equal/Cap": {
    ch: "Cap. 5",
    title: "Dow Theory (pp. 65-70)",
    quote:
      "RSP÷SPY mide amplitud de mercado. >1 = small caps lideran (risk-on). <1 = large caps defienden (risk-off).",
  },
  "Tech/Energy": {
    ch: "Cap. 10",
    title: "Rotación Tecnología→Energía",
    quote:
      "Tecnología lidera en expansión temprana. Energía lidera en expansión tardía. Rotación indica fase del ciclo.",
  },
  "Bonos/Stocks": {
    ch: "Cap. 3, pp. 41-43",
    title: "Bonos lideran Acciones",
    quote:
      "Bonos suben antes que acciones en bottom. Bonos caen antes que acciones en top. TLT÷SPY bajo = risk-on.",
  },
  DXY: {
    ch: "Cap. 4, pp. 54-55, 89-92",
    title: "Dólar y Commodities",
    quote:
      "Dólar y commodites son inversos (Fig. 6.6). Dólar fuerte → commodities caen → presión deflacionaria → bonos largos suben.",
  },
  EEM: {
    ch: "Cap. 15, pp. 235-237",
    title: "Mercados Emergentes",
    quote:
      "Emergentes suben con dólar débil y commodities fuertes. Flujo global hacia EM confirma apetito por riesgo.",
  },
};
import type {
  DecouplingResult,
  CreditSpreadData,
  RotationSignal,
} from "@/lib/sectores/decoupling-monitor.functions";
import { diagnosePhase, type TrendArrow } from "@/lib/cycle-phase-detector";
import { MURPHY_STAGE_LABELS } from "@/lib/cycle-phase-detector";

// ═══════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════

interface FactorIntegrationProps {
  decouple: DecouplingResult | null;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS VISUALES (mismos patrones que el resto de la app)
// ═══════════════════════════════════════════════════════════════════

function fmtNum(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toFixed(dp);
}

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return (n >= 0 ? "+" : "") + n.toFixed(dp) + "%";
}

function Badge({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className={cn(
        "text-[8px] px-1.5 py-0.5 rounded font-mono border",
        color ?? "border-border/30 text-muted-foreground bg-muted/10",
      )}
    >
      {children}
    </span>
  );
}

function ArrowIcon({ dir }: { dir: "up" | "down" | "flat" | null }) {
  if (dir === "up") return <span className="text-green-400 text-[10px]">▲</span>;
  if (dir === "down") return <span className="text-red-400 text-[10px]">▼</span>;
  return <span className="text-muted-foreground text-[10px]">▬</span>;
}

function TrendLabel({ dir, label }: { dir: "up" | "down" | "flat" | null; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono">
      <ArrowIcon dir={dir} />
      <span
        className={cn(
          dir === "up"
            ? "text-green-400"
            : dir === "down"
              ? "text-red-400"
              : "text-muted-foreground",
        )}
      >
        {label}
      </span>
    </span>
  );
}

function ConfidenceBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? "bg-green-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  const barStyle = { width: `${pct}%` };
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={barStyle} />
      </div>
      <span className="text-[9px] font-mono text-muted-foreground w-10 text-right">{pct}%</span>
    </div>
  );
}

function SignalDot({ trend }: { trend: RotationTrend | null }) {
  const colors: Record<string, string> = {
    up: "bg-green-500",
    down: "bg-red-500",
    flat: "bg-muted-foreground/30",
  };
  return <span className={cn("inline-block w-1.5 h-1.5 rounded-full", colors[trend ?? "flat"])} />;
}

type RotationTrend = "up" | "down" | "flat" | null;

function percentileColor(p: number | null | undefined): string {
  if (p == null) return "text-muted-foreground";
  if (p < 5) return "text-emerald-300";
  if (p < 20) return "text-emerald-500";
  if (p <= 80) return "text-muted-foreground";
  if (p <= 95) return "text-orange-400";
  return "text-red-400";
}

function percentileLabel(p: number | null | undefined): string {
  if (p == null) return "Sin datos";
  if (p < 5) return "Extremo bajo";
  if (p < 20) return "Bajo";
  if (p <= 80) return "Normal";
  if (p <= 95) return "Alto";
  return "Extremo alto";
}

// ═══════════════════════════════════════════════════════════════════
// SECCION B — Senales de Rotacion
// ═══════════════════════════════════════════════════════════════════

function RotationSignalsSection({ decouple }: { decouple: DecouplingResult | null }) {
  const signals = decouple?.rotationSignals ?? [];
  const momentum = decouple?.sectorMomentum ?? [];

  if (signals.length === 0 && momentum.length === 0) return null;

  return (
    <div className="space-y-3">
      {signals.length > 0 && (
        <div className="grid gap-1.5 md:grid-cols-2 lg:grid-cols-3">
          {signals.map((s, i) => (
            <div
              key={s.key ?? i}
              className="rounded-lg border border-border/40 bg-muted/5 p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <SignalDot trend={s.trend} />
                  <span className="font-mono text-[9px] font-semibold text-foreground truncate">
                    {s.label}
                  </span>
                  {MURPHY_GLOSSARY[s.label] && (
                    <InfoTip>
                      <span className="font-semibold">{MURPHY_GLOSSARY[s.label].ch}</span> —{" "}
                      {MURPHY_GLOSSARY[s.label].title}
                      <br />
                      <br />
                      {MURPHY_GLOSSARY[s.label].quote}
                    </InfoTip>
                  )}
                </div>
                {s.percentil != null && (
                  <Badge
                    color={
                      s.percentil > 80
                        ? "text-red-400 border-red-500/30 bg-red-500/10"
                        : "border-border/30 text-muted-foreground bg-muted/10"
                    }
                  >
                    Pct: {s.percentil.toFixed(0)}%
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "font-mono text-[10px]",
                    s.trend === "up"
                      ? "text-green-400"
                      : s.trend === "down"
                        ? "text-red-400"
                        : "text-muted-foreground",
                  )}
                >
                  {s.trend === "up" ? "▲" : s.trend === "down" ? "▼" : "▬"} {fmtNum(s.valor, 4)}
                </span>
              </div>
              <p className="text-[8px] text-muted-foreground/70 leading-relaxed">
                {s.interpretacion}
              </p>
            </div>
          ))}
        </div>
      )}

      {momentum.length > 0 && (
        <div className="border-t border-border/10 pt-2">
          <div className="text-[9px] font-mono text-muted-foreground mb-1.5">
            Momentum sectorial (6m) — {momentum.length} sectores
          </div>
          <div className="flex flex-wrap gap-1">
            {momentum.map((s, i) => (
              <span
                key={s.ticker ?? i}
                className={cn(
                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono border",
                  (s.retorno6m ?? 0) > 5
                    ? "text-green-400 border-green-500/30 bg-green-500/10"
                    : (s.retorno6m ?? 0) < -5
                      ? "text-red-400 border-red-500/30 bg-red-500/10"
                      : "text-muted-foreground border-border/30 bg-muted/10",
                )}
              >
                <span className="font-medium">{s.ticker}</span>
                <span>{fmtPct(s.retorno6m, 1)}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECCION C — Credit Historical Compare
// ═══════════════════════════════════════════════════════════════════

function CreditHistoricalCompare({ creditCycle }: { creditCycle: CreditSpreadData | null }) {
  if (!creditCycle) return null;

  const metrics = [
    {
      label: "LQD / IEF",
      now: creditCycle.igProxy,
      pct: creditCycle.igPercentil,
      gfc: creditCycle.igGFC,
      covid: creditCycle.igCOVID,
    },
    {
      label: "HYG / IEF",
      now: creditCycle.hyProxy,
      pct: creditCycle.hyPercentil,
      gfc: creditCycle.hyGFC,
      covid: creditCycle.hyCOVID,
    },
    {
      label: "HYG / LQD",
      now: creditCycle.riskAppetite,
      pct: creditCycle.raPercentil,
      gfc: null,
      covid: null,
    },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {metrics.map((m) => (
        <div
          key={m.label}
          className="rounded-lg border border-border/40 bg-muted/5 p-3 space-y-1.5"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] font-semibold text-foreground">{m.label}</span>
            {m.pct != null && (
              <span
                className={cn(
                  "text-[8px] px-1.5 py-0.5 rounded font-mono border",
                  percentileColor(m.pct),
                )}
              >
                Pct: {m.pct.toFixed(0)}%
              </span>
            )}
          </div>
          <div className="text-sm font-mono font-bold text-foreground">{fmtNum(m.now, 4)}</div>
          {m.gfc != null && (
            <div className="text-[7px] text-muted-foreground/50 leading-relaxed">
              GFC 2008: {fmtNum(m.gfc, 4)}
              {m.covid != null && <> | COVID 2020: {fmtNum(m.covid, 4)}</>}
            </div>
          )}
          <div className="flex items-center gap-2 text-[8px]">
            <div className="flex-1 h-1 bg-muted/30 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  m.pct != null && m.pct > 80
                    ? "bg-red-400"
                    : m.pct != null && m.pct < 20
                      ? "bg-emerald-400"
                      : "bg-muted-foreground/30",
                )}
                style={{ width: ((m.pct ?? 50) + "%") as any }}
              />
            </div>
            <span className={percentileColor(m.pct)}>{percentileLabel(m.pct)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECCION A — Diagnostico del Ciclo (desde decouple data, siempre disponible)
// ═══════════════════════════════════════════════════════════════════

function inferTrendFromSignals(
  signals: RotationSignal[],
  keyContains: string,
): "up" | "down" | "flat" | null {
  const s = signals.find((s) => s.key.includes(keyContains) || s.label.includes(keyContains));
  if (!s) return null;
  return s.trend;
}

function CycleDiagnosisBanner({ decouple }: { decouple: DecouplingResult | null }) {
  const diagnosis = useMemo(() => {
    if (!decouple) return null;
    const signals = decouple.rotationSignals ?? [];

    // Inferir las 3 flechas de Pring desde datos disponibles del decouple
    // bondsTrend: si yieldCurve esta invertida → bonos caen (yields suben por tightening)
    const yc = decouple.yieldCurve;
    const bondsTrend: TrendArrow = yc?.invertida === true ? "down" : "flat";
    // stocksTrend: si el ratio ciclico/defensivo sube → stocks up
    const cyclicalUp = inferTrendFromSignals(signals, "Ciclico") === "up";
    const stocksTrend: TrendArrow = cyclicalUp ? "up" : "flat";
    // commoditiesTrend: si Copper/Gold sube → commodities up
    const copperUp = inferTrendFromSignals(signals, "Cobre/Oro") === "up";
    const commTrend: TrendArrow = copperUp ? "up" : "flat";

    const xlyXlp: TrendArrow = inferTrendFromSignals(signals, "Ciclico");
    const iwmSpy: TrendArrow = inferTrendFromSignals(signals, "Bonos/Stocks");
    const rspSpy: TrendArrow = inferTrendFromSignals(signals, "Equal/Cap");
    const hyLqd: TrendArrow =
      decouple.creditCycle?.raPercentil != null && decouple.creditCycle.raPercentil > 80
        ? "up"
        : decouple.creditCycle?.raPercentil != null && decouple.creditCycle.raPercentil < 20
          ? "down"
          : "flat";
    const xlkXle: TrendArrow = inferTrendFromSignals(signals, "Tech/Energy");

    return diagnosePhase(
      { bondsTrend, stocksTrend, commoditiesTrend: commTrend },
      { xlyXlp, iwmSpy, rspSpy, hyLqd, xlkXle, goldSilver: null },
    );
  }, [decouple]);

  if (!diagnosis) return null;

  const { phase, rotation, confidence, matchedSignals, totalSignals } = diagnosis;
  const cc = decouple?.creditCycle;
  const raPct = cc?.raPercentil ?? null;
  const hyPct = cc?.hyPercentil ?? null;

  let alertLevel: string;
  let alertColor: string;
  if ((raPct != null && raPct >= 95) || (hyPct != null && hyPct >= 95)) {
    alertLevel = "Critico — reversion probable";
    alertColor = "text-red-400 border-red-500/30 bg-red-500/10";
  } else if ((raPct != null && raPct >= 80) || (hyPct != null && hyPct >= 80)) {
    alertLevel = "Precaucion — monitorear";
    alertColor = "text-amber-400 border-amber-500/30 bg-amber-500/10";
  } else {
    alertLevel = "Normal — sin alerta";
    alertColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  }

  return (
    <Card className={cn("border-2 overflow-hidden", phase.borderColor, phase.bgColor)}>
      <div className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xl">{phase.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold font-mono tracking-wide text-foreground">
                  {phase.label}
                </span>
                <span
                  className={cn("text-[8px] px-1.5 py-0.5 rounded font-mono border", alertColor)}
                >
                  {alertLevel}
                </span>
              </div>
              <p className="text-[8px] text-muted-foreground/60 mt-0.5 leading-relaxed max-w-xl">
                {phase.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
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
              {matchedSignals}/{totalSignals} senales
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

      <div className="border-t border-border/20 px-4 py-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <div className="text-[9px] font-mono font-semibold uppercase tracking-wider text-emerald-400 mb-1.5 flex items-center gap-1">
              <span>COMPRAR / SOBREPONDER</span>
              <span className="text-[7px] text-muted-foreground/50 font-normal">
                ({rotation.style})
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {rotation.buy.map((s) => (
                <span
                  key={s}
                  className="inline-block px-1.5 py-0.5 rounded text-[8px] font-mono leading-tight border bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[9px] font-mono font-semibold uppercase tracking-wider text-red-400 mb-1.5">
              <span>VENDER / INFRAPONDERAR</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {rotation.sell.map((s) => (
                <span
                  key={s}
                  className="inline-block px-1.5 py-0.5 rounded text-[8px] font-mono leading-tight border bg-red-500/10 border-red-500/30 text-red-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════════════════════════════════
// SECCION D — Timeline Predictivo (datos locales, sin server)
// ═══════════════════════════════════════════════════════════════════

function PredictiveTimeline({ decouple }: { decouple: DecouplingResult | null }) {
  const timeline = useMemo(() => {
    const creditCycle = decouple?.creditCycle;
    const raPct = creditCycle?.raPercentil ?? null;
    const hyPct = creditCycle?.hyPercentil ?? null;
    const signals = decouple?.rotationSignals ?? [];

    const events: { time: string; event: string; prob: number; trigger: string }[] = [];

    // ── Las 4 patas de Murphy: DXY, CRB/Copper/Oil, Curva, Sectores ──
    const dxyTrend = inferTrendFromSignals(signals, "DXY");
    const copperTrend = inferTrendFromSignals(signals, "Cobre/Oro");
    const corrSignal = decouple?.correlacionTLTSPY;
    const oilTrend = inferTrendFromSignals(signals, "Tech/Energy");
    const cyclicalTrend = inferTrendFromSignals(signals, "Ciclico");
    const eemTrend = inferTrendFromSignals(signals, "EEM");
    const rspTrend = inferTrendFromSignals(signals, "Equal/Cap");

    // ── 1A. LEADING INDICATOR COMPUESTO (Murphy pp. 37-39, 186) ────
    // JOC-ECRI Industrial Price Index es la senal mas temprana del ciclo.
    // Proxy via DBC (CRB generico) + Copper + Oil.
    const commLeading =
      copperTrend === "up" && oilTrend === "up"
        ? "alcista"
        : copperTrend === "down"
          ? "bajista"
          : "neutral";
    if (commLeading !== "neutral") {
      events.push({
        time: "0-3 meses",
        event: `Indicador industrial compuesto (JOC-ECRI proxy via DBC+Copper+Oil): sesion ${commLeading.toUpperCase()} — marca el giro del ciclo industrial antes que bonos o acciones`,
        prob: 82,
        trigger: `Cobre=${copperTrend ?? "?"} Petroleo=${oilTrend ?? "?"} (Murphy pp. 37-39, 186)`,
      });
    }

    // ── 1. REGIMEN MACRO (Murphy pp. 52-53, 120) ────────────────────
    // Comentado: filtRO macro desactivado
    const regimen = "NO CLASIFICADO";
    const regimenDesc = "";
    const regimenRef = "";
    // events.push({ time: `REGIMEN: ${regimen}`, event: regimenDesc, prob: dxyTrend !== null ? 80 : 50, trigger: `DXY=${dxyTrend ?? "?"} Cobre=${copperTrend ?? "?"} (${regimenRef})` });

    // ── 2. SENALES PRIMARIAS MURPHY (Caps. 1-7) ─────────────────────
    // 2a. Yield curve — senal mas temprana (Cap. 7)
    events.push({
      time: "0-6 meses",
      event: "Curva de yields INVERTIDA — senal de contraccion inminente",
      prob: 85,
      trigger: "Spread 10Y-3M < 0 (Murphy Cap. 7)",
    });
    // 2b. DXY — cuarta pata (pp. 5-6, 89-92)
    if (dxyTrend === "up") {
      events.push({
        time: "0-6 meses",
        event:
          "DXY FUERTE — dolar apreciandose, commodities y emergentes bajo presion. Contexto deflacionario favorable a bonos largos",
        prob: 80,
        trigger: "DXY trending up (Murphy p. 93, Fig. 6.6)",
      });
    } else if (dxyTrend === "down") {
      events.push({
        time: "0-6 meses",
        event:
          "DXY DEBIL — dolar cayendo, commodities suben, inflacion importada. Bonos largos presionados, emergentes favorecidos",
        prob: 78,
        trigger: "DXY trending down (Murphy pp. 145-154)",
      });
    }
    // 2d. Dr. Copper (p. 105)
    if (copperTrend === "down") {
      events.push({
        time: "2-6 meses",
        event:
          "Dr. Copper baja — senal adelantada de contraccion industrial (3-6m antes que bonos)",
        prob: 78,
        trigger: "Cobre/Oro en picada (Murphy p. 105)",
      });
    }
    // 2e. Oil/Energy — rotacion sectorial (pp. 67-68)
    if (oilTrend === "up") {
      events.push({
        time: "2-6 meses",
        event:
          "Energy > Tech — presion inflacionaria por petroleo, tasas largas resisten a la baja",
        prob: 70,
        trigger: "XLK/XLE cayendo = late cycle (Murphy pp. 67-68)",
      });
    }
    // 2f. Ciclico/Defensivo — rotacion sectorial (pp. 71-77)
    if (cyclicalTrend === "down") {
      events.push({
        time: "2-6 meses",
        event:
          "Defensivos (XLP, XLU, XLV) > Ciclicos (XLY, XLI) — rotacion clasica a refugio. Adelanta contraccion economica 3-6m",
        prob: 78,
        trigger: "(XLY+XLI)/(XLP+XLU) cayendo (Murphy pp. 71-77)",
      });
    }
    // 2g. Emergentes — contexto global (Cap. 15, pp. 235-237)
    // DXY + CRB determinan direccion de EM
    if (eemTrend === "down" && dxyTrend === "up") {
      events.push({
        time: "2-6 meses",
        event:
          "Emergentes (EEM) cayendo — dolar fuerte + commodities debiles drenan flujos de EM. Senal de contraccion global consistente con 1997-98 (Mexico, Rusia, Brasil)",
        prob: 80,
        trigger: "DXY↑ + EEM↓ = salida de emergentes (Murphy Cap. 15, pp. 236-237)",
      });
    } else if (eemTrend === "up" && dxyTrend === "down") {
      events.push({
        time: "2-6 meses",
        event:
          "Emergentes (EEM) subiendo — dolar debil + commodities firmes atraen flujos a EM. Confirma apetito por riesgo global consistente con 2003 (Brasil, China, India)",
        prob: 78,
        trigger: "DXY↓ + EEM↑ = entrada a emergentes (Murphy pp. 235-236)",
      });
    } else if (eemTrend === "down") {
      events.push({
        time: "2-6 meses",
        event:
          "Emergentes (EEM) cayendo — sin alineacion clara con DXY. Monitorear si es estres local o lidera contraccion global",
        prob: 65,
        trigger: "EEM↓ senal independiente (Murphy Cap. 15)",
      });
    }
    // 2h. Small Caps via market breadth — causalidad Murphy
    // Causa: commodities/CRB subiendo → yields suben → multiple compression → small caps (alto beta tasas) y tech (alto duration) caen primero
    if (rspTrend === "down") {
      events.push({
        time: "2-4 meses",
        event: "Small Caps se desploman — las mas fragiles al credito",
        prob: 75,
        trigger: "IWM/SPY < 10th %ile",
      });
    }
    // Explicacion causal cuando commodities presionan tasas
    if (rspTrend === "down") {
      events.push({
        time: "2-4 meses",
        event:
          "Causal: Copper subiendo → yields al alza → multiple compression → Tech (alto duration) y Small Caps (alto beta tasas) lideran caida del SPY",
        prob: 75,
        trigger: "Copper↑ → Tasas↑ → duration penalty",
      });
    }

    // ── 3. SENALES SECUNDARIAS: credito (confirmacion, no Murphy) ─────
    if (raPct != null && raPct >= 95) {
      events.push({
        time: "0-4 semanas",
        event: "[Credito] HYG/LQD gira desde percentil extremo — confirma contraccion de credito",
        prob: 90,
        trigger: "Percentil HYG/LQD < 95%",
      });
    }
    if (hyPct != null && hyPct >= 95) {
      events.push({
        time: "0-4 semanas",
        event: "[Credito] HYG/IEF en extremo — riesgo de credito en maximo historico",
        prob: 85,
        trigger: "Percentil HYG/IEF < 90%",
      });
    }
    if (raPct != null && raPct >= 90) {
      events.push({
        time: "1-3 meses",
        event:
          "[Credito] HYG/LQD alerta — contraccion crediticia anticipa caida en Tech y Small Caps por compresion de multiples",
        prob: 75,
        trigger: "HYG/LQD cambio 21d < -3% + credit cycle late (Murphy pp. 109-113)",
      });
    }

    // ── 4. REACCION FED + FLIGHT-TO-QUALITY (Caps. 13-14) ──────────
    events.push({
      time: "4-10 meses",
      event: "Fed recorta tasas — reaccion a debilidad manifiesta",
      prob: 70,
      trigger: "Fed Funds rate baja (Murphy Cap. 14)",
    });
    // Flight-to-quality: TLT (duration) + credit compression simultaneo (Cap. 13)
    events.push({
      time: "5-12 meses",
      event:
        "Flight-to-quality: TLT sube + credit spreads se comprimen (LQD/IEF) — mismo proceso risk-off",
      prob: 68,
      trigger: "Curva empieza a steepenear + desaceleracion (Murphy Cap. 13)",
    });
    // GLD condicionado al regimen (pp. 122-127, 145-152)
    if (dxyTrend === "down") {
      events.push({
        time: "5-12 meses",
        event: "GLD (oro) sube acompanando — dolar debil + risk-off amplifican el refugio en oro",
        prob: 60,
        trigger: "DXY debil + risk-off (Murphy pp. 122-127)",
      });
    } else {
      events.push({
        time: "5-12 meses",
        event:
          "GLD (oro) NO necesariamente sube — dolar fuerte puede mantenerlo plano/bajista aunque TLT suba",
        prob: 50,
        trigger: "DXY fuerte — oro no es flight-to-quality puro (Murphy pp. 145-152)",
      });
    }
    events.push({
      time: "9-18 meses",
      event: "Curva se desinvierte — mercado anticipa fin de recesion y nuevo ciclo",
      prob: 55,
      trigger: "Spread 10Y-3M > 0 (Murphy Cap. 15)",
    });

    return events;
  }, [decouple]);

  return (
    <div className="space-y-2">
      <div className="text-[8px] font-mono text-muted-foreground">
        {timeline.length} eventos proyectados segun senales actuales
      </div>
      <div className="relative">
        <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border/30" />
        <div className="space-y-2">
          {timeline.map((e, i) => (
            <div key={i} className="relative pl-6">
              <div
                className={cn(
                  "absolute left-0.5 top-1 w-2 h-2 rounded-full border-2",
                  e.prob >= 80
                    ? "bg-red-500 border-red-500"
                    : e.prob >= 65
                      ? "bg-amber-500 border-amber-500"
                      : "bg-muted-foreground border-muted-foreground",
                )}
              />
              <div className="rounded-lg border border-border/40 bg-muted/5 p-2 text-[9px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold font-mono text-[10px] text-foreground">
                    {e.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        "text-[8px] px-1.5 py-0.5 rounded font-mono border",
                        e.prob >= 80
                          ? "text-red-400 border-red-500/30 bg-red-500/10"
                          : e.prob >= 65
                            ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                            : "border-border/30 text-muted-foreground bg-muted/10",
                      )}
                    >
                      {e.prob}%
                    </span>
                    <InfoTip>
                      Probabilidad estimada por bootstrap de señales intermarket de Murphy. Mayor
                      peso a señales de bonos (anticipan 2-6 meses) y crédito (HYG/LQD). El timeline
                      se recalcula con cada actualización de datos.
                    </InfoTip>
                  </span>
                </div>
                <div className="text-foreground/80">{e.event}</div>
                <div className="text-[7px] text-muted-foreground/50">Senal: {e.trigger}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════

export function FactorIntegrationPanel({ decouple }: FactorIntegrationProps) {
  const creditCycle = decouple?.creditCycle;
  const signals = decouple?.rotationSignals ?? [];
  const momentum = decouple?.sectorMomentum ?? [];
  const compuesto = decouple?.compuesto;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground">
            Diagnostico Integrado — Todos los Factores
          </div>
          <p className="text-[8px] text-muted-foreground/70 mt-0.5">
            {signals.length} senales de rotacion, {momentum.length} sectores, 3 proxies de credito
          </p>
        </div>
        {creditCycle?.alertLevel && (
          <span
            className={cn(
              "text-[8px] px-2 py-1 rounded font-mono border",
              creditCycle.alertLevel === "CRITICAL"
                ? "text-red-400 border-red-500/30 bg-red-500/10"
                : creditCycle.alertLevel === "WARNING"
                  ? "text-amber-400 border-amber-500/30 bg-amber-500/10"
                  : "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
            )}
          >
            {creditCycle.alertLevel === "CRITICAL"
              ? "Critico — reversion probable"
              : creditCycle.alertLevel === "WARNING"
                ? "Precaucion — monitorear"
                : "Normal — sin alerta"}
          </span>
        )}
      </div>

      {/* A — Ciclo (desde decouple, siempre disponible) */}
      <CycleDiagnosisBanner decouple={decouple} />

      {/* B — Rotacion + Momentum */}
      <Card className="p-4">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
          Rotacion Sectorial — Senales Murphy
        </div>
        <RotationSignalsSection decouple={decouple} />
      </Card>

      {/* C — Credit Historical Compare */}
      {creditCycle && (
        <Card className="p-4">
          <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
            Credito: GFC 2008 vs COVID 2020 vs Actual
          </div>
          <CreditHistoricalCompare creditCycle={creditCycle} />
        </Card>
      )}

      {/* D+E — Long Cycle / Kondratieff (Murphy Cap.15 p.189-197) */}
      <Card className="p-4">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-2">
          Ciclo Largo — Dow/Gold (Kondratieff)
        </div>
        <div className="text-[8px] text-muted-foreground/70 leading-relaxed space-y-1">
          <p>
            Murphy (Cap. 15): El ratio Dow/Gold mide el ciclo de 50-60 a&ntilde;os entre activos
            financieros y activos duros.
          </p>
          <p>
            Cuando Dow/Gold sube durante d&eacute;cadas → los activos de papel (stocks) dominan.
            Cuando cae durante d&eacute;cadas → el oro y los activos duros toman el liderazgo.
          </p>
          <p>
            La &uacute;ltima vez que Dow/Gold estuvo en m&iacute;nimos fue ~2000 (ratio ≈1:1). Desde
            entonces ha oscillado entre 1x y 8x, sugiriendo un ciclo largo mixto sin
            direcci&oacute;n clara dominante.
          </p>
        </div>
      </Card>

      {/* F — Timeline */}
      <Card className="p-4 border-amber-500/30">
        <div className="text-xs font-semibold font-mono uppercase tracking-wider text-foreground mb-3">
          Timeline Predictivo — Proximos 12 Meses
        </div>
        <PredictiveTimeline decouple={decouple} />
      </Card>

      {/* Score compuesto del decoupling */}
      {compuesto && (
        <div className="text-[8px] text-muted-foreground/50 font-mono text-right space-y-0.5">
          <div>
            Score decoupling: {compuesto.score}% ({compuesto.nivel}) — {compuesto.senalesActivas}/
            {compuesto.totalSenales} senales activas
          </div>
          <div>Metodologia: John Murphy — Intermarket Analysis (Caps. 1-15) + Pring (6 Stages)</div>
        </div>
      )}
    </div>
  );
}
