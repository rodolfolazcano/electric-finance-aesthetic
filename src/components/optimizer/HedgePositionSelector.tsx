// @ts-nocheck
import { useMemo } from "react";
import type { HedgePosition } from "@/lib/capm-hedge.types";

interface Props {
  positions: HedgePosition[];
  onToggle: (ticker: string) => void;
  onSelectAllNegative: () => void;
  source: "iol" | "manual" | "sector";
}

export function HedgePositionSelector({ positions, onToggle, onSelectAllNegative, source }: Props) {
  const totalValorUSD = useMemo(() => positions.reduce((s, p) => s + p.valorUSD, 0), [positions]);
  const negCount = useMemo(() => positions.filter((p) => p.plPct < 0).length, [positions]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-medium text-foreground">
          {source === "iol"
            ? "Posiciones del Portafolio IOL"
            : source === "manual"
              ? "Posiciones Manuales"
              : "Posiciones por Sector"}
        </h3>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[14px] text-muted-foreground">
            Total: <span className="text-foreground">${totalValorUSD.toFixed(2)} USD</span>
          </span>
          {negCount > 0 && (
            <button
              onClick={onSelectAllNegative}
              className="rounded border border-danger/40 bg-danger/10 px-2.5 py-1 font-mono text-[14px] text-danger transition-colors hover:bg-danger/20"
            >
              Seleccionar todas las negativas ({negCount})
            </button>
          )}
        </div>
      </div>
      {positions.some((p) => p.valorARS > 0) && (
        <div className="text-[13px] font-mono text-muted-foreground/60 px-1">
          * Valores ARS convertidos a USD aprox. (tipo de cambio referencial)
        </div>
      )}

      {positions.length === 0 ? (
        <div className="rounded-lg border border-border/40 bg-muted/20 px-4 py-8 text-center font-mono text-xs text-muted-foreground">
          {source === "iol"
            ? "Cargando posiciones desde IOL..."
            : "Ingrese tickers en la configuración para ver posiciones"}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          <table className="w-full text-left font-mono text-[14px]">
            <thead>
              <tr className="border-b border-border/40 bg-muted/20 text-[13px] uppercase tracking-wider text-muted-foreground">
                <th className="w-8 px-3 py-2"></th>
                <th className="px-3 py-2">Ticker</th>
                <th className="px-3 py-2">Descripción</th>
                <th className="px-3 py-2 text-right">Valor USD</th>
                <th className="px-3 py-2 text-right">P&L %</th>
                <th className="px-3 py-2 text-right">P&L USD</th>
                <th className="px-3 py-2 text-right">Cant.</th>
                <th className="px-3 py-2 text-right">Pprome.</th>
                <th className="px-3 py-2 text-right">Último</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((pos) => {
                const isNeg = pos.plPct < -0.01;
                return (
                  <tr
                    key={pos.ticker}
                    className={`border-b border-border/20 transition-colors hover:bg-muted/10 ${
                      isNeg ? "bg-danger/5" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={pos.selected}
                        onChange={() => onToggle(pos.ticker)}
                        className="h-3.5 w-3.5 cursor-pointer accent-primary"
                      />
                    </td>
                    <td
                      className={`px-3 py-2 font-semibold ${isNeg ? "text-danger" : "text-foreground"}`}
                    >
                      {pos.ticker}
                    </td>
                    <td className="max-w-[180px] truncate px-3 py-2 text-muted-foreground">
                      {pos.description}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${isNeg ? "text-danger" : "text-foreground"}`}
                    >
                      {pos.valorUSD.toFixed(2)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${isNeg && pos.plPct !== 0 ? "text-danger" : pos.plPct > 0 ? "text-success" : "text-muted-foreground"}`}
                    >
                      {pos.precioPromedio > 0
                        ? `${pos.plPct >= 0 ? "+" : ""}${pos.plPct.toFixed(2)}%`
                        : "N/D"}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${isNeg && pos.plUSD !== 0 ? "text-danger" : pos.plUSD > 0 ? "text-success" : "text-muted-foreground"}`}
                    >
                      {pos.precioPromedio > 0
                        ? `${pos.plUSD >= 0 ? "+" : ""}${pos.plUSD.toFixed(2)}`
                        : "N/D"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {pos.cantidad > 0 ? pos.cantidad.toLocaleString() : "N/D"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {pos.precioPromedio > 0 ? `$${pos.precioPromedio.toFixed(2)}` : "N/D"}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {pos.ultimoPrecio > 0 ? `$${pos.ultimoPrecio.toFixed(2)}` : "N/D"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
