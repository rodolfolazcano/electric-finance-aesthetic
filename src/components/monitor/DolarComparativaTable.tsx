"use client";
import { useMemo } from "react";
import type { CotizacionDolar } from "@/lib/api/criptoya";
import { cn } from "@/lib/utils";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number | null | undefined, d = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function colorVar(n: number | null | undefined, inverse = false): string {
  if (n == null) return "text-muted-foreground/50";
  if (n > 0) return inverse ? "text-red-400" : "text-green-400";
  if (n < 0) return inverse ? "text-green-400" : "text-red-400";
  return "text-muted-foreground/50";
}

// ─── Label mapping ───────────────────────────────────────────────────────────

const CASA_LABEL: Record<string, string> = {
  oficial: "Oficial",
  mayorista: "Mayorista",
  blue: "Blue",
  mep: "MEP",
  ccl: "CCL",
  cripto: "Cripto",
  tarjeta: "Tarjeta",
  ahorro: "Ahorro",
};

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  dolares: CotizacionDolar[];
  loading?: boolean;
}

export function DolarComparativaTable({ dolares, loading }: Props) {
  // Ordenar del más barato (menor venta) al más caro (mayor venta)
  const sorted = useMemo(() => {
    return [...dolares].sort((a, b) => {
      const va = a.venta ?? a.compra ?? 999999;
      const vb = b.venta ?? b.compra ?? 999999;
      return va - vb;
    });
  }, [dolares]);

  if (loading && dolares.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-6 animate-shimmer rounded bg-muted/20" />
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="mono w-full text-[10px]">
        <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
          <tr>
            <th className="text-left font-medium py-1.5 pr-3">Tipo de Cambio</th>
            <th className="text-right font-medium py-1.5 px-2">Compra</th>
            <th className="text-right font-medium py-1.5 px-2">Venta</th>
            <th className="text-right font-medium py-1.5 px-2">Var% Diaria</th>
            <th className="text-right font-medium py-1.5 px-2">Var% YTD</th>
            <th className="text-right font-medium py-1.5 px-2">Var% Anual</th>
            <th className="text-right font-medium py-1.5 pl-2">Brecha vs Oficial</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((d, i) => {
            const label = CASA_LABEL[d.casa] ?? d.casa;
            const precioRef = d.venta ?? d.compra;
            return (
              <tr
                key={d.casa}
                className={cn(
                  "border-b border-border/20 hover:bg-muted/20 transition-colors",
                  i === 0 && sorted.length > 1 && "bg-green-950/10",
                  i === sorted.length - 1 && sorted.length > 1 && "bg-red-950/10",
                )}
              >
                <td className="py-1.5 pr-3 font-semibold text-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    {label}
                    {d.casa === "oficial" && (
                      <span className="text-[8px] text-amber-400 font-normal">(referencia)</span>
                    )}
                  </span>
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums">
                  {d.compra != null ? `$${fmtNum(d.compra, 2)}` : "—"}
                </td>
                <td className="py-1.5 px-2 text-right tabular-nums font-medium">
                  {d.venta != null ? `$${fmtNum(d.venta, 2)}` : "—"}
                </td>
                <td className={cn("py-1.5 px-2 text-right tabular-nums", colorVar(d.variacion))}>
                  {fmtPct(d.variacion)}
                </td>
                <td className={cn("py-1.5 px-2 text-right tabular-nums", colorVar(d.variacion_ytd))}>
                  {fmtPct(d.variacion_ytd)}
                </td>
                <td className={cn("py-1.5 px-2 text-right tabular-nums", colorVar(d.variacion_anual))}>
                  {fmtPct(d.variacion_anual)}
                </td>
                <td
                  className={cn(
                    "py-1.5 pl-2 text-right tabular-nums",
                    d.brecha_oficial != null
                      ? d.brecha_oficial > 20
                        ? "text-red-400"
                        : d.brecha_oficial > 5
                          ? "text-amber-400"
                          : "text-green-400"
                      : "text-muted-foreground/50",
                  )}
                >
                  {d.brecha_oficial != null ? fmtPct(d.brecha_oficial) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
