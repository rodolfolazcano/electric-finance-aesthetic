// @ts-nocheck
import type { HedgeUniverseAsset } from "@/lib/capm-hedge.types";

interface Props {
  assets: HedgeUniverseAsset[];
  selectedTickers: Set<string>;
  onToggle: (ticker: string) => void;
}

export function HedgeUniverseTable({ assets, selectedTickers, onToggle }: Props) {
  if (assets.length === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="font-mono text-xs font-medium text-foreground">
        Ranking del Universo de Cobertura
        <span className="ml-2 text-[10px] font-normal text-muted-foreground">
          ({assets.length} activos)
        </span>
      </h3>
      <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border/40">
        <table className="w-full text-left font-mono text-[11px]">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2">Ticker</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2 text-right">Correlación</th>
              <th className="px-3 py-2 text-right">Beta</th>
              <th className="px-3 py-2 text-right">R²</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => {
              const isSel = selectedTickers.has(a.ticker);
              return (
                <tr
                  key={a.ticker}
                  className={`border-b border-border/10 transition-colors hover:bg-muted/10 ${
                    isSel ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="px-3 py-1.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggle(a.ticker)}
                      className="h-3 w-3 accent-primary"
                    />
                  </td>
                  <td className="px-3 py-1.5 font-semibold text-foreground">{a.ticker}</td>
                  <td className="max-w-[160px] truncate px-3 py-1.5 text-muted-foreground">
                    {a.nombre}
                  </td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        a.tipo === "ETF"
                          ? "bg-blue-500/10 text-blue-400"
                          : a.tipo === "CEDEAR"
                            ? "bg-purple-500/10 text-purple-400"
                            : "bg-amber-500/10 text-amber-400"
                      }`}
                    >
                      {a.tipo}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right ${
                      Math.abs(a.correlation) > 0.7
                        ? "text-success"
                        : Math.abs(a.correlation) > 0.4
                          ? "text-warning"
                          : "text-muted-foreground"
                    }`}
                  >
                    {a.correlation.toFixed(3)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {a.beta.toFixed(3)}
                  </td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">
                    {a.r2.toFixed(3)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
