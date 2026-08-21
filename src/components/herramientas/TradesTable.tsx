import type { Trade } from "@/lib/statarb.types";

interface Props {
  trades: Trade[];
  txCost?: number;
  asset1?: string;
  asset2?: string;
  selectedIdx?: number;
  onSelectTrade?: (idx: number) => void;
}

export function TradesTable({
  trades,
  txCost = 0.1,
  asset1 = "activo1",
  asset2 = "activo2",
  selectedIdx,
  onSelectTrade,
}: Props) {
  if (trades.length === 0) {
    return (
      <div className="rounded-lg border border-border/40 px-4 py-6 text-center font-mono text-xs text-muted-foreground">
        No se generaron trades
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-medium text-foreground">
          Trades ejecutados
          <span className="ml-2 text-[10px] font-normal text-muted-foreground">
            ({trades.length} trades)
          </span>
        </h3>
        <span className="text-[9px] text-muted-foreground font-mono">Comisión: {txCost}%</span>
      </div>
      <div className="max-h-[350px] overflow-y-auto rounded-lg border border-border/40">
        <table className="w-full text-left font-mono text-[11px]">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2">#</th>
              <th className="px-2 py-2">Entrada</th>
              <th className="px-2 py-2">Salida</th>
              <th className="px-2 py-2">Tipo</th>
              <th className="px-2 py-2">Acción</th>
              <th className="px-2 py-2 text-right">P&L %</th>
              <th className="px-2 py-2 text-right">Neto ± com.</th>
              <th className="px-2 py-2 text-right">P&L Acum</th>
              <th className="px-2 py-2 text-right">Duración</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => {
              const pnlNeto = t.pnl - txCost * 2;
              const isSelected = selectedIdx === i;
              return (
                <tr
                  key={i}
                  onClick={() => onSelectTrade?.(i)}
                  className={`cursor-pointer border-b border-border/10 transition-colors hover:bg-muted/20 ${
                    isSelected ? "bg-primary/10 outline outline-1 outline-primary/40" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-1.5 text-foreground">{t.entryDate}</td>
                  <td className="px-2 py-1.5 text-foreground">{t.exitDate}</td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        t.type === "long"
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger"
                      }`}
                    >
                      {t.type === "long" ? "LONG" : "SHORT"}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {t.type === "long" ? (
                      <span className="text-[9px] font-mono">
                        <span className="text-success">+COMPRA</span> {asset1},
                        <span className="text-danger"> -VENTA</span> {asset2}
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono">
                        <span className="text-danger">-VENTA</span> {asset1},
                        <span className="text-success"> +COMPRA</span> {asset2}
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${t.pnl >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {t.pnl >= 0 ? "+" : ""}
                    {t.pnl.toFixed(2)}%
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${pnlNeto >= 0 ? "text-success/70" : "text-danger/70"}`}
                  >
                    {pnlNeto >= 0 ? "+" : ""}
                    {pnlNeto.toFixed(2)}%
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right ${t.pnlCum >= 0 ? "text-success" : "text-danger"}`}
                  >
                    {t.pnlCum >= 0 ? "+" : ""}
                    {t.pnlCum.toFixed(2)}%
                  </td>
                  <td className="px-2 py-1.5 text-right text-muted-foreground">{t.duration}d</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
