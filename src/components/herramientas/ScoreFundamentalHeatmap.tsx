import { useState, useMemo } from "react";
import type { FundamentalAFResult, ScoreDetail } from "@/lib/fundamental-af.functions";

type SortDir = "asc" | "desc";

interface DimInfo {
  key: string;
  label: string;
  weight: number;
  metricLabel: string;
}

const DIMENSIONS: DimInfo[] = [
  { key: "roe", label: "ROE", weight: 15, metricLabel: "ROE" },
  { key: "crecIng", label: "Crec.Ing", weight: 15, metricLabel: "Crecimiento ingresos" },
  { key: "fcf", label: "FCF Yield", weight: 10, metricLabel: "FCF Yield" },
  { key: "pe", label: "P/E", weight: 10, metricLabel: "P/E Trailing" },
  { key: "de", label: "D/E", weight: 15, metricLabel: "Deuda / Patrimonio" },
  { key: "margen", label: "Margen", weight: 15, metricLabel: "Margen neto" },
  { key: "upside", label: "Upside", weight: 10, metricLabel: "Upside (target analistas)" },
  { key: "crecGan", label: "Crec.Gan", weight: 10, metricLabel: "Crecimiento ganancias" },
];

function extractDim(
  sd: ScoreDetail[],
  metricLabel: string,
): { pts: number; maxPts: number } | null {
  for (const d of sd) {
    if (d.metric === metricLabel) return { pts: d.pts, maxPts: d.maxPts };
  }
  return null;
}

function cellColor(pts: number, maxPts: number): string {
  const ratio = maxPts > 0 ? pts / maxPts : 0;
  if (ratio >= 0.66) return "bg-emerald-500/15 text-emerald-400";
  if (ratio >= 0.33) return "bg-amber-500/15 text-amber-400";
  return "bg-red-500/15 text-red-400";
}

function scoreColor(s: number): string {
  if (s >= 65) return "bg-emerald-500/15 text-emerald-400";
  if (s >= 45) return "bg-amber-500/15 text-amber-400";
  return "bg-red-500/15 text-red-400";
}

function SortableHeader<T>({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: T;
  currentKey: T | null;
  currentDir: SortDir;
  onSort: (key: T) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = currentKey === sortKey;
  const alignClass =
    align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  return (
    <th className={`px-2 py-1.5 ${alignClass}`}>
      <button
        onClick={() => onSort(sortKey)}
        className="font-medium hover:text-foreground text-[9px] uppercase tracking-wider text-muted-foreground"
      >
        {label} {isActive && (currentDir === "asc" ? "\u2191" : "\u2193")}
      </button>
    </th>
  );
}

interface HeatmapRow {
  ticker: string;
  fundScoreAbsolute: number;
  metricsAvailable: number;
  metricsTotal: number;
  dims: Record<string, { pts: number; maxPts: number } | null>;
}

export function ScoreFundamentalHeatmap({ results }: { results: FundamentalAFResult[] }) {
  const [sortKey, setSortKey] = useState<string | null>("score");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const etfs = results.filter((r) => r.esETF);
  const nonEtfs = results.filter((r) => !r.error && !r.esETF);

  const rows: HeatmapRow[] = useMemo(() => {
    return nonEtfs.map((r) => {
      const dims: Record<string, { pts: number; maxPts: number } | null> = {};
      for (const d of DIMENSIONS) {
        dims[d.key] = extractDim(r.scoreDetails, d.metricLabel);
      }
      return {
        ticker: r.symbol,
        fundScoreAbsolute: r.fundScoreAbsolute,
        metricsAvailable: r.metricsAvailable,
        metricsTotal: r.metricsTotal,
        dims,
      };
    });
  }, [results]);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => {
      let va: number, vb: number;
      if (sortKey === "score") {
        va = a.fundScoreAbsolute;
        vb = b.fundScoreAbsolute;
      } else if (sortKey === "cobertura") {
        va = a.metricsAvailable;
        vb = b.metricsAvailable;
      } else if (sortKey === "ticker") {
        return sortDir === "asc"
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker);
      } else {
        const da = a.dims[sortKey];
        const db = b.dims[sortKey];
        va = da ? da.pts / da.maxPts : -1;
        vb = db ? db.pts / db.maxPts : -1;
      }
      if (va === -1 && vb === -1) return 0;
      if (va === -1) return 1;
      if (vb === -1) return -1;
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  if (rows.length === 0) {
    if (etfs.length === 0) return null;
    return (
      <div className="space-y-3 rounded-lg border border-border/40 bg-background/30 p-4">
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
          Score Fundamental por Dimensión
        </p>
        <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
          {etfs.map((e) => e.symbol).join(", ")} {etfs.length === 1 ? "es un ETF" : "son ETFs"} — no
          aplica score fundamental.
        </p>
        <p className="text-[8px] text-muted-foreground/40">
          Cintia Boos, Agente Productora CNV N° 2192
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/40 bg-background/30 p-4">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
        Score Fundamental por Dimensión
      </p>
      {etfs.length > 0 && (
        <p className="text-[9px] text-muted-foreground/60 leading-relaxed">
          {etfs.map((e) => e.symbol).join(", ")} {etfs.length === 1 ? "es un ETF" : "son ETFs"} — no
          aplica score fundamental.
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border border-border/40">
        <table className="w-full text-left font-mono text-[11px]">
          <thead className="border-b border-border/40">
            <tr>
              <SortableHeader
                label="Ticker"
                sortKey="ticker"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={toggleSort}
              />
              {DIMENSIONS.map((d) => (
                <SortableHeader
                  key={d.key}
                  label={`${d.label} (${d.weight})`}
                  sortKey={d.key}
                  currentKey={sortKey}
                  currentDir={sortDir}
                  onSort={toggleSort}
                  align="right"
                />
              ))}
              <SortableHeader
                label="Score"
                sortKey="score"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Cobertura"
                sortKey="cobertura"
                currentKey={sortKey}
                currentDir={sortDir}
                onSort={toggleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.ticker}
                className="border-b border-border/20 last:border-0 hover:bg-muted/10"
              >
                <td className="px-2 py-1 text-left text-foreground font-semibold">{row.ticker}</td>
                {DIMENSIONS.map((d) => {
                  const dim = row.dims[d.key];
                  return (
                    <td
                      key={d.key}
                      className={`px-2 py-1 text-right font-mono ${dim ? cellColor(dim.pts, dim.maxPts) : "text-muted-foreground/40"}`}
                    >
                      {dim ? `${dim.pts}/${dim.maxPts}` : "\u2014"}
                    </td>
                  );
                })}
                <td
                  className={`px-2 py-1 text-right font-mono font-semibold ${scoreColor(row.fundScoreAbsolute)}`}
                >
                  {row.fundScoreAbsolute}
                </td>
                <td className="px-2 py-1 text-right font-mono text-muted-foreground text-[10px]">
                  {row.metricsAvailable < 6 ? (
                    <span
                      title={`Score calculado con cobertura de datos parcial: ${row.metricsAvailable} de ${row.metricsTotal} metricas disponibles. Comparar con precaucion.`}
                      className="text-amber-400/70"
                    >
                      {row.metricsAvailable}/{row.metricsTotal} *
                    </span>
                  ) : (
                    <span>
                      {row.metricsAvailable}/{row.metricsTotal}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[8px] text-muted-foreground/60 leading-relaxed">
        Cada celda muestra puntos obtenidos / puntos máximos de esa dimensión. Verde ≥66% del máximo
        · Ámbar 33-65% · Rojo &lt;33% · — sin dato disponible. Score total calculado sobre base fija
        de 100 puntos (métricas sin dato cuentan como 0).
      </p>
      <p className="text-[8px] text-muted-foreground/40">
        Cintia Boos, Agente Productora CNV N° 2192
      </p>
    </div>
  );
}
