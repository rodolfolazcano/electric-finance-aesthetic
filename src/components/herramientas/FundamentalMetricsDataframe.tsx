import { useState } from "react";
import type { FundamentalAFResult, PeriodoHistoricoRow } from "@/lib/fundamental-af.functions";

interface MetricCategory {
  nombre: string;
  prioridad: number;
  metricas: Metric[];
}

interface Metric {
  key: keyof FundamentalAFResult;
  label: string;
  formato: (v: any) => string;
  color?: (v: any) => string;
  disponibleEnHistorico: boolean;
}

interface FundamentalMetricsDataframeProps {
  result: FundamentalAFResult;
  historico: PeriodoHistoricoRow[];
  historicoGranularidad: "anual" | "trimestral";
  onGranularidadChange: (g: "anual" | "trimestral") => void;
}

export function FundamentalMetricsDataframe({
  result,
  historico,
  historicoGranularidad,
  onGranularidadChange,
}: FundamentalMetricsDataframeProps) {
  // Definición de métricas organizadas por categoría y prioridad
  const categorias: MetricCategory[] = [
    {
      nombre: "Valoración",
      prioridad: 1,
      metricas: [
        {
          key: "trailingPE",
          label: "P/E Trailing",
          formato: (v) => (v != null ? `${v.toFixed(1)}x` : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "forwardPE",
          label: "P/E Forward",
          formato: (v) => (v != null ? `${v.toFixed(1)}x` : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "pegRatio",
          label: "PEG Ratio",
          formato: (v) => (v != null ? v.toFixed(2) : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "priceToBook",
          label: "Precio / Libro",
          formato: (v) => (v != null ? `${v.toFixed(2)}x` : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "evToEbitda",
          label: "EV / EBITDA",
          formato: (v) => (v != null ? `${v.toFixed(1)}x` : "--"),
          disponibleEnHistorico: true,
        },
      ],
    },
    {
      nombre: "Rentabilidad",
      prioridad: 2,
      metricas: [
        {
          key: "returnOnEquity",
          label: "ROE",
          formato: (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "--"),
          color: (v) =>
            v != null && v * 100 >= 15
              ? "text-emerald-400"
              : v != null && v * 100 < 10
                ? "text-red-400"
                : "",
          disponibleEnHistorico: true,
        },
        {
          key: "returnOnAssets",
          label: "ROA",
          formato: (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "profitMargin",
          label: "Margen Neto (TTM Yahoo)",
          formato: (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "--"),
          color: (v) =>
            v != null && v * 100 >= 20
              ? "text-emerald-400"
              : v != null && v * 100 < 10
                ? "text-red-400"
                : "",
          disponibleEnHistorico: true,
        },
        {
          key: "operatingMargin",
          label: "Margen Operativo",
          formato: (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "grossMargin",
          label: "Margen Bruto",
          formato: (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "--"),
          disponibleEnHistorico: true,
        },
      ],
    },
    {
      nombre: "Crecimiento",
      prioridad: 3,
      metricas: [
        {
          key: "revenueGrowth",
          label: "Crecimiento Ingresos (YoY)",
          formato: (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "--"),
          color: (v) =>
            v != null && v > 0 ? "text-emerald-400" : v != null && v < 0 ? "text-red-400" : "",
          disponibleEnHistorico: true,
        },
        {
          key: "earningsGrowth",
          label: "Crecimiento Ganancias (YoY)",
          formato: (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "--"),
          color: (v) =>
            v != null && v > 0 ? "text-emerald-400" : v != null && v < 0 ? "text-red-400" : "",
          disponibleEnHistorico: true,
        },
      ],
    },
    {
      nombre: "Salud Financiera",
      prioridad: 4,
      metricas: [
        {
          key: "debtToEquityRaw",
          label: "Deuda / Patrimonio",
          formato: (v) => (v != null ? `${(v / 100).toFixed(2)}x` : "--"),
          color: (v) =>
            v != null && v / 100 > 2
              ? "text-red-400"
              : v != null && v / 100 < 1
                ? "text-emerald-400"
                : "",
          disponibleEnHistorico: true,
        },
        {
          key: "currentRatio",
          label: "Ratio Corriente",
          formato: (v) => (v != null ? v.toFixed(2) : "--"),
          color: (v) =>
            v != null && v >= 1.5 ? "text-emerald-400" : v != null && v < 1 ? "text-red-400" : "",
          disponibleEnHistorico: true,
        },
        {
          key: "quickRatio",
          label: "Ratio Rápido",
          formato: (v) => (v != null ? v.toFixed(2) : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "freeCashflowM",
          label: "Free Cash Flow",
          formato: (v) => (v != null ? `USD ${(v / 1000).toFixed(0)}B` : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "fcfYield",
          label: "FCF Yield",
          formato: (v) => (v != null ? `${(v * 100).toFixed(1)}%` : "--"),
          color: (v) => (v != null && v > 0.03 ? "text-emerald-400" : ""),
          disponibleEnHistorico: true,
        },
      ],
    },
    {
      nombre: "Dividendos",
      prioridad: 5,
      metricas: [
        {
          key: "dividendYield",
          label: "Rendimiento Dividendo",
          formato: (v) => (v != null ? `${(v * 100).toFixed(2)}%` : "--"),
          disponibleEnHistorico: true,
        },
        {
          key: "payoutRatio",
          label: "Ratio de Distribución",
          formato: (v) => (v != null ? `${(v * 100).toFixed(0)}%` : "--"),
          color: (v) => (v != null && v > 70 ? "text-amber-400" : ""),
          disponibleEnHistorico: true,
        },
      ],
    },
  ];

  // Ordenar categorías por prioridad
  const categoriasOrdenadas = [...categorias].sort((a, b) => a.prioridad - b.prioridad);

  // Obtener valor histórico de una métrica
  const getHistoricoValue = (metricKey: keyof FundamentalAFResult, periodIdx: number): string => {
    if (!historico || periodIdx < 0 || periodIdx >= historico.length) return "--";
    const periodo = historico[periodIdx];

    // Mapeo manual de métricas a campos de PeriodoHistoricoRow
    const metricMapping: Partial<Record<keyof FundamentalAFResult, keyof PeriodoHistoricoRow>> = {
      revenueGrowth: "revenueChgPct",
      earningsGrowth: "epsChgPct",
      profitMargin: "netMargin",
      operatingMargin: "operatingMargin",
      grossMargin: "grossMargin",
      freeCashflowM: "fcf",
    };

    const historicoKey = metricMapping[metricKey];
    if (historicoKey) {
      const value = (periodo as any)[historicoKey];
      const metric = categoriasOrdenadas
        .flatMap((c) => c.metricas)
        .find((m) => m.key === metricKey);
      if (!metric) return "--";
      return metric.formato(value);
    }

    // Para métricas no disponibles en histórico, mostrar "--"
    return "--";
  };

  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [metricaSeleccionada, setMetricaSeleccionada] = useState<keyof FundamentalAFResult | null>(
    null,
  );

  return (
    <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground">
          Métricas Fundamentales
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMostrarHistorico(!mostrarHistorico)}
            className={`text-[13px] px-2 py-1 rounded border transition-colors ${
              mostrarHistorico
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/30 text-muted-foreground hover:text-foreground"
            }`}
          >
            {mostrarHistorico ? "Ocultar Histórico" : "Ver Histórico"}
          </button>
          {mostrarHistorico && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onGranularidadChange("anual")}
                className={`text-[13px] px-2 py-1 rounded border transition-colors ${
                  historicoGranularidad === "anual"
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                Anual
              </button>
              <button
                onClick={() => onGranularidadChange("trimestral")}
                className={`text-[13px] px-2 py-1 rounded border transition-colors ${
                  historicoGranularidad === "trimestral"
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                Trimestral
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {categoriasOrdenadas.map((categoria) => (
          <div
            key={categoria.nombre}
            className="border-b border-border/20 pb-4 last:border-0 last:pb-0"
          >
            <p className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-2">
              {categoria.nombre}
              <span className="text-[12px] text-muted-foreground/60">
                Prioridad {categoria.prioridad}
              </span>
            </p>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left font-mono text-[14px]">
                <thead>
                  <tr className="text-[13px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <th className="px-2 py-1">Métrica</th>
                    <th className="px-2 py-1 text-right">Actual</th>
                    {mostrarHistorico && historico.length > 0 && (
                      <>
                        {historico.slice(-5).map((_, idx) => (
                          <th key={idx} className="px-2 py-1 text-right">
                            {historicoGranularidad === "anual"
                              ? `Año ${historico.length - 5 + idx}`
                              : `Q${historico.length - 5 + idx}`}
                          </th>
                        ))}
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {categoria.metricas.map((metrica) => (
                    <tr
                      key={metrica.key}
                      className="border-b border-border/10 last:border-0 hover:bg-muted/5"
                    >
                      <td className="px-2 py-1 text-[13px] text-muted-foreground">
                        {metrica.label}
                      </td>
                      <td
                        className={`px-2 py-1 text-right font-mono ${metrica.color ? metrica.color(result[metrica.key]) : ""}`}
                      >
                        {metrica.formato(result[metrica.key])}
                      </td>
                      {mostrarHistorico && historico.length > 0 && (
                        <>
                          {historico.slice(-5).map((_, idx) => {
                            const histIdx = historico.length - 5 + idx;
                            return (
                              <td key={idx} className="px-2 py-1 text-right text-muted-foreground">
                                {getHistoricoValue(metrica.key, histIdx)}
                              </td>
                            );
                          })}
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {result.esETF && (
        <p className="mt-2 text-[13px] text-muted-foreground italic">
          Algunas métricas (P/E, ROE, márgenes) no aplican para ETFs
        </p>
      )}
    </div>
  );
}
