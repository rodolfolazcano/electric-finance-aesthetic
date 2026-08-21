import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCicloEconomico, getIntermarketAnalysis } from "@/lib/intermarket-analysis.functions";

const SECTORES_POR_REGIMEN: Record<string, string[]> = {
  Expansión: ["Tecnología", "Comunicación", "Consumo Cíclico", "Industrial"],
  Desaceleración: ["Salud", "Consumo Defensivo", "Servicios Públicos"],
  Contracción: ["Consumo Defensivo", "Salud", "Utilities", "Oro"],
  Recuperación: ["Tecnología", "Industrial", "Materiales", "Energía"],
};

export function CycleContextBanner() {
  const cicloFn = useServerFn(getCicloEconomico);
  const analysisFn = useServerFn(getIntermarketAnalysis);

  const { data: cicloData } = useQuery({
    queryKey: ["ciclo-economico-banner"],
    queryFn: () => cicloFn(),
    staleTime: 15 * 60 * 1000,
  });

  const { data: analysisData } = useQuery({
    queryKey: ["intermarket-analysis-banner"],
    queryFn: () => analysisFn(),
    staleTime: 15 * 60 * 1000,
  });

  const ciclo = cicloData?.ciclo;
  const lectura = analysisData?.lecturaIntermarket;

  if (!ciclo && !lectura) return null;

  // Determinar régimen desde el motor de intermarket (lectura.regimen)
  const regimen = lectura?.regimen ?? "";
  const sectores = SECTORES_POR_REGIMEN[regimen] ?? [];

  // Correlation summary from the same engine as Dashboard Intermarket
  const correlations = analysisData?.correlations ?? [];
  const bondStockCorr = correlations[0]?.current ?? null;
  const dollarCommCorr = correlations[1]?.current ?? null;

  return (
    <div className="rounded-md border border-border/40 bg-background/40 px-3 py-2 text-[13px] leading-relaxed">
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
        {ciclo && (
          <>
            <span className="font-semibold text-primary uppercase tracking-wider text-[13px]">
              Fase {ciclo.stage} · {ciclo.description ?? ""}
            </span>
            <span className="text-muted-foreground">|</span>
          </>
        )}
        {regimen && <span className="text-foreground">Régimen: {regimen}</span>}
        {sectores.length > 0 && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">Sectores: {sectores.join(" · ")}</span>
          </>
        )}
        {bondStockCorr != null && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className={bondStockCorr > 0.3 ? "text-warning" : "text-muted-foreground"}>
              {`Bonos/Stocks: ${bondStockCorr > 0 ? "r=" : ""}${bondStockCorr.toFixed(2)}`}
            </span>
          </>
        )}
        {dollarCommCorr != null && (
          <>
            <span className="text-muted-foreground">|</span>
            <span className={dollarCommCorr < -0.3 ? "text-success" : "text-muted-foreground"}>
              {`DXY/Comm: r=${dollarCommCorr.toFixed(2)}`}
            </span>
          </>
        )}
      </div>
      {lectura?.contextoHistorico && (
        <div className="mt-1 text-muted-foreground/70 italic leading-relaxed">
          {lectura.contextoHistorico}
        </div>
      )}
    </div>
  );
}
