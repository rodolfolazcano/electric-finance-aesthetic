"use client";
import type { Signal } from "@/lib/cripto.types";

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
function fmtNum(n: number, dp = 2) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

const statusColors: Record<string, string> = {
  abierta: "text-blue-400",
  tp: "text-green-400",
  sl: "text-red-400",
  cancelada: "text-muted-foreground",
};

export function SignalsTable({ signals, feePct }: { signals: Signal[]; feePct?: number }) {
  if (signals.length === 0) return null;
  const fee = feePct ?? 0.001;

  const reversed = [...signals].reverse().slice(0, 50);

  return (
    <div>
      <div className="mono mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Señales Generadas
      </div>
      <div className="overflow-x-auto">
        <table className="mono w-full text-[10px]">
          <thead className="uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-2 py-1 text-left">Hora</th>
              <th className="px-2 py-1 text-left">Tipo</th>
              <th className="px-2 py-1 text-right">Entrada</th>
              <th className="px-2 py-1 text-right">SL</th>
              <th className="px-2 py-1 text-right">TP</th>
              <th className="px-2 py-1 text-right">P&L $</th>
              <th className="px-2 py-1 text-right">P&L %</th>
              <th className="px-2 py-1 text-right">Z-Score</th>
              <th className="px-2 py-1 text-right">OBI</th>
              <th className="px-2 py-1 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {reversed.map((s, i) => {
              const pnl = s.pnl ?? 0;
              const pnlPct = s.pnlPct ?? 0;
              const grossPnl = pnl;
              const feeCost = Math.abs(grossPnl * fee);
              const netPnl = grossPnl - feeCost;
              return (
                <tr key={i} className="border-b border-border/30">
                  <td className="px-2 py-1">{fmtTime(s.timestamp)}</td>
                  <td
                    className={`px-2 py-1 font-medium ${s.type === "LONG" ? "text-green-400" : "text-red-400"}`}
                  >
                    {s.type === "LONG" ? "COMPRA" : "VENTA"}
                  </td>
                  <td className="px-2 py-1 text-right">{fmtNum(s.entryPrice)}</td>
                  <td className="px-2 py-1 text-right text-red-400">{fmtNum(s.sl)}</td>
                  <td className="px-2 py-1 text-right text-green-400">{fmtNum(s.tp)}</td>
                  <td
                    className={`px-2 py-1 text-right ${netPnl >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {netPnl >= 0 ? "+" : ""}
                    {fmtNum(netPnl, 2)}
                  </td>
                  <td
                    className={`px-2 py-1 text-right ${pnlPct >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {pnlPct >= 0 ? "+" : ""}
                    {fmtNum(pnlPct, 2)}%
                  </td>
                  <td className="px-2 py-1 text-right">{fmtNum(s.zScore, 2)}</td>
                  <td className="px-2 py-1 text-right">{fmtNum(s.obi, 3)}</td>
                  <td className={`px-2 py-1 ${statusColors[s.status]}`}>
                    {s.status === "tp"
                      ? "TP "
                      : s.status === "sl"
                        ? "SL "
                        : s.status === "abierta"
                          ? "● Abierta"
                          : "Cancelada"}
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
