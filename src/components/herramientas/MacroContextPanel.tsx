import { useMemo } from "react";

interface IndicatorData {
  valor: number;
  variacion: number;
  variacionPorcentual: number;
}

interface TasaItem {
  valor: number | null;
}

interface TasasData {
  plazoFijo: TasaItem | null;
  badlar: TasaItem | null;
  leliq: TasaItem | null;
  inflacionMensual: TasaItem | null;
  inflacionInteranual: TasaItem | null;
  inflacionEsperada: TasaItem | null;
}

interface MacroContextPanelProps {
  riesgoPais: IndicatorData | null;
  reservasNetas: IndicatorData | null;
  dxy: IndicatorData | null;
  tnx: IndicatorData | null;
  oil: IndicatorData | null;
  copper: IndicatorData | null;
  tasasData: TasasData | null;
  loading: boolean;
}

function fmtVal(v: number | null | undefined, d = 2): string {
  if (v == null) return "\u2014";
  return v.toFixed(d);
}

function fmtPct(v: number | null | undefined): string {
  if (v == null) return "";
  return v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`;
}

function colorPct(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  return v >= 0 ? "text-green-400" : "text-red-400";
}

function badge(text: string, color: string) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>{text}</span>
  );
}

export function MacroContextPanel({
  riesgoPais, reservasNetas, dxy, tnx, oil, copper, tasasData, loading,
}: MacroContextPanelProps) {
  const rp = riesgoPais?.valor ?? null;
  const rpSignal = useMemo(() => {
    if (rp == null) return { label: "Sin datos", color: "bg-muted/30 text-muted-foreground" };
    if (rp > 1000) return { label: "Priorizar Renta Fija", color: "bg-red-900/40 text-red-300 border-red-800" };
    if (rp > 500) return { label: "Mixto", color: "bg-amber-900/40 text-amber-300 border-amber-800" };
    return { label: "Renta Variable OK", color: "bg-green-900/40 text-green-300 border-green-800" };
  }, [rp]);

  const ciclo = useMemo(() => {
    const dxyVal = dxy?.valor ?? null;
    const tnxVal = tnx?.valor ?? null;
    if (rp == null) return { label: "\u2014", color: "bg-muted/30" };
    if (rp > 1000 && dxyVal != null && dxyVal > 105) return { label: "Stress", color: "bg-red-900/40 text-red-300" };
    if (rp > 1000) return { label: "Emergente Favor", color: "bg-orange-900/40 text-orange-300" };
    if (tnxVal != null && tnxVal > 4.5) return { label: "Tasas Medias", color: "bg-yellow-900/40 text-yellow-300" };
    if (dxyVal != null && dxyVal > 105) return { label: "Dólar Fuerte", color: "bg-blue-900/40 text-blue-300" };
    return { label: "Normal", color: "bg-green-900/40 text-green-300" };
  }, [rp, dxy, tnx]);

  const tasaReal = useMemo(() => {
    if (tasasData?.badlar?.valor == null || tasasData?.inflacionMensual?.valor == null) return null;
    const badlar = tasasData.badlar.valor / 100;
    const infM = tasasData.inflacionMensual.valor / 100;
    const infA = Math.pow(1 + infM, 12) - 1;
    return ((1 + badlar) / (1 + infA) - 1) * 100;
  }, [tasasData]);

  if (loading) {
    return (
      <div className="glass p-3">
        <div className="text-[11px] text-muted-foreground animate-pulse">Cargando contexto macro\u2026</div>
      </div>
    );
  }

  function Card({ label, value, change, color, sub }: { label: string; value: string; change: string; color?: string; sub?: string }) {
    return (
      <div className="flex flex-col gap-0.5 min-w-[100px]">
        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-sm font-semibold ${color ?? "text-foreground"}`}>{value}</div>
        <div className={`text-[10px] ${colorPct(change ? parseFloat(change) : null)}`}>{change}</div>
        {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
      </div>
    );
  }

  return (
    <div className="glass p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Contexto Macroeconómico</span>
          <span className="text-[9px] text-muted-foreground">Nivel 1 — Murphy</span>
        </div>
        <div className="flex items-center gap-2">
          {badge(rpSignal.label, rpSignal.color)}
          {badge(ciclo.label, ciclo.color)}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card
          label="Reservas Netas"
          value={reservasNetas?.valor != null ? `USD ${fmtVal(reservasNetas.valor, 1)} MM` : "\u2014"}
          change={fmtPct(reservasNetas?.variacionPorcentual)}
          color={reservasNetas?.variacionPorcentual != null && reservasNetas.variacionPorcentual >= 0 ? "text-green-400" : "text-red-400"}
        />
        <Card
          label="DXY (US Dollar)"
          value={dxy?.valor != null ? fmtVal(dxy.valor, 2) : "\u2014"}
          change={fmtPct(dxy?.variacionPorcentual)}
          color={dxy?.variacionPorcentual != null && dxy.variacionPorcentual >= 0 ? "text-blue-400" : "text-amber-400"}
        />
        <Card
          label="TNX (UST 10Y)"
          value={tnx?.valor != null ? `${fmtVal(tnx.valor, 2)}%` : "\u2014"}
          change={fmtPct(tnx?.variacionPorcentual != null ? tnx.variacionPorcentual / 100 : null)}
          color={tnx?.variacionPorcentual != null && tnx.variacionPorcentual > 0 ? "text-red-400" : "text-green-400"}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card
          label="Petróleo (WTI)"
          value={oil?.valor != null ? `USD ${fmtVal(oil.valor, 2)}` : "\u2014"}
          change={fmtPct(oil?.variacionPorcentual)}
        />
        <Card
          label="Cobre (HG)"
          value={copper?.valor != null ? `USD ${fmtVal(copper.valor, 2)}` : "\u2014"}
          change={fmtPct(copper?.variacionPorcentual)}
        />
        <Card
          label="Inflación"
          value={tasasData?.inflacionMensual?.valor != null ? `${fmtVal(tasasData.inflacionMensual.valor, 2)}%` : "\u2014"}
          sub={tasasData?.inflacionInteranual?.valor != null ? `Interanual: ${fmtVal(tasasData.inflacionInteranual.valor, 2)}%` : undefined}
          change=""
        />
        <Card
          label="Tasa Real"
          value={tasaReal != null ? `${fmtVal(tasaReal, 2)}%` : "\u2014"}
          change=""
          color={tasaReal != null && tasaReal > 0 ? "text-green-400" : "text-red-400"}
          sub={tasasData?.badlar?.valor != null ? `BADLAR: ${fmtVal(tasasData.badlar.valor, 2)}%` : undefined}
        />
      </div>
    </div>
  );
}
