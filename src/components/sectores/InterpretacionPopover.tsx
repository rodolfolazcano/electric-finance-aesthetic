// @ts-nocheck
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  interpretarPE,
  interpretarPB,
  interpretarROE,
  interpretarFCFYield,
  interpretarDE,
  interpretarUpside,
  interpretarBeta,
  interpretarScore,
  DISCLAIMER_INTERPRETACION,
  type Interpretacion,
} from "@/lib/sectores/interpretaciones.functions";
import { fetchHistoricoValuacion, type HistoricoValuacionResult } from "@/lib/sectores/historico-metricas.functions";
import type { SectorTickerValuation } from "@/lib/sector-valuation.functions";

// ─── types ─────────────────────────────────────────────────────────

interface Props {
  ticker: SectorTickerValuation;
}

function BadgeConf({ confiabilidad }: { confiabilidad: Interpretacion["confiabilidad"] }) {
  if (confiabilidad === "alta") return null;
  const styles: Record<string, string> = {
    media: "border-amber-800/40 bg-amber-950/40 text-amber-400",
    baja: "border-red-800/40 bg-red-950/40 text-red-400",
  };
  const labels: Record<string, string> = {
    media: "aproximado",
    baja: "dato histórico limitado",
  };
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-[9px] font-mono ${styles[confiabilidad] ?? ""}`}>
      {labels[confiabilidad] ?? confiabilidad}
    </span>
  );
}

function TonoIcon({ tono }: { tono: Interpretacion["tono"] }) {
  if (tono === "sin-dato") return <span className="text-muted-foreground text-[10px]">—</span>;
  if (tono === "positivo") return <span className="text-emerald-400 text-[10px]">◉</span>;
  if (tono === "negativo") return <span className="text-red-400 text-[10px]">◉</span>;
  return <span className="text-muted-foreground text-[10px]">◉</span>;
}

function BloqueInterpretacion({ label, interpretacion }: { label: string; interpretacion?: Interpretacion | null }) {
  if (!interpretacion) return null;
  return (
    <div className="space-y-1 border-b border-border/10 pb-2 last:border-0">
      <div className="flex items-center gap-1.5">
        <TonoIcon tono={interpretacion.tono} />
        <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <BadgeConf confiabilidad={interpretacion.confiabilidad} />
      </div>
      <p className="text-[11px] leading-relaxed text-foreground">{interpretacion.resumen}</p>
      {interpretacion.contexto && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">{interpretacion.contexto}</p>
      )}
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────

export function InterpretacionPopover({ ticker }: Props) {
  const [historial, setHistorial] = useState<HistoricoValuacionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = async () => {
    if (historial || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchHistoricoValuacion({ data: { yfSymbol: ticker.ticker, rango: "2y" } });
      if (res.error) {
        setError(res.error);
      } else {
        setHistorial(res);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos históricos");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) load();
  };

  // Construir interpretaciones
  const nombre = ticker.companyName ?? ticker.ticker;

  const interpPE = interpretarPE(
    ticker.trailingPE,
    historial?.percentiles.pe ?? ticker.pePercentile,
    historial?.metodologia ?? "no-aplicable",
    nombre,
  );

  const interpPB = interpretarPB(
    ticker.priceToBook,
    historial?.percentiles.pb ?? null,
    nombre,
  );

  const interpROE = interpretarROE(ticker.returnOnEquity, nombre);
  const interpFCF = interpretarFCFYield(ticker.fcfYield, nombre);
  const interpDE = interpretarDE(ticker.debtToEquity, nombre);
  const interpUpside = interpretarUpside(ticker.upsidePct, nombre);
  const interpBeta = interpretarBeta(ticker.beta, "SPY", nombre);
  const interpScore = interpretarScore(ticker.fundScore, 100, nombre);

  return (
    <Popover open={open} onOpenChange={handleOpen}>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center justify-center h-5 w-5 rounded text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors cursor-help"
          title="Ver interpretación de métricas"
        >
          ⓘ
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        className="w-[360px] max-h-[480px] overflow-y-auto bg-surface border border-border/60 p-3 space-y-3"
      >
        {loading && (
          <div className="flex items-center gap-2 py-4">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-[10px] text-muted-foreground">Cargando datos históricos...</span>
          </div>
        )}

        {error && !historial && (
          <div className="p-2 text-[10px] text-red-400">
            {error}
          </div>
        )}

        {historial?.advertencia && (
          <div className="rounded border border-amber-800/30 bg-amber-950/20 px-2 py-1.5 text-[9px] text-amber-400 leading-relaxed">
            {historial.advertencia}
          </div>
        )}

        <BloqueInterpretacion label="P/E (precio / ganancia)" interpretacion={interpPE} />
        <BloqueInterpretacion label="P/B (precio / valor contable)" interpretacion={interpPB} />
        <BloqueInterpretacion label="ROE (rentabilidad sobre patrimonio)" interpretacion={interpROE} />
        <BloqueInterpretacion label="FCF Yield (efectivo libre / precio)" interpretacion={interpFCF} />
        <BloqueInterpretacion label="Deuda / Patrimonio" interpretacion={interpDE} />
        <BloqueInterpretacion label="Upside de analistas" interpretacion={interpUpside} />
        <BloqueInterpretacion label="Beta (volatilidad vs mercado)" interpretacion={interpBeta} />
        <BloqueInterpretacion label="Score fundamental" interpretacion={interpScore} />

        <div className="text-[8px] text-muted-foreground/60 leading-relaxed pt-2 border-t border-border/20">
          {DISCLAIMER_INTERPRETACION}
        </div>
      </PopoverContent>
    </Popover>
  );
}
