"use client";
import { useState, useMemo } from "react";
import type { ExchangeCotizacion } from "@/lib/cripto.types";

function fmtNum(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

type SortKey = "exchange" | "compra" | "venta" | "spread" | "feeCompra" | "feeVenta" | "spreadNeto";

interface ExchangeRow {
  exchange: string;
  compra: number;
  venta: number;
  spread: number;
  feeCompra: number;
  feeVenta: number;
  spreadNeto: number;
}

export function ExchangeCompareTable({
  data,
}: {
  data: Record<string, { bid: number; ask: number; totalAsk: number; totalBid: number }> | null;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("venta");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const exchanges: ExchangeRow[] = useMemo(() => {
    if (!data) return [];
    return Object.entries(data)
      .filter(([_, v]) => v.bid > 0 && v.ask > 0 && v.totalAsk > 0 && v.totalBid > 0)
      .map(([exchange, v]) => {
        const feeCompra = ((v.totalAsk - v.ask) / v.ask) * 100;
        const feeVenta = ((v.bid - v.totalBid) / v.bid) * 100;
        const spread = ((v.bid - v.ask) / v.ask) * 100;
        const totalFee = feeCompra + feeVenta;
        return {
          exchange,
          compra: v.ask,
          venta: v.bid,
          spread,
          feeCompra,
          feeVenta,
          spreadNeto: spread - totalFee,
        };
      });
  }, [data]);

  const sorted = useMemo(() => {
    const arr = [...exchanges];
    arr.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
    return arr;
  }, [exchanges, sortKey, sortDir]);

  if (!data) return null;

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "exchange" ? "asc" : "asc");
    }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " " : " ";
  }

  return (
    <div>
      <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
        Comparativa Exchanges
        <span className="ml-2 text-[13px] text-muted-foreground/60">
          (clic en columna para ordenar)
        </span>
      </div>
      <div className="overflow-x-auto w-full">
        <table className="mono w-full text-[13px]">
          <thead className="uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th
                className="cursor-pointer select-none px-2 py-1 text-left hover:text-foreground"
                onClick={() => toggleSort("exchange")}
              >
                Exchange{sortArrow("exchange")}
              </th>
              <th
                className="cursor-pointer select-none px-2 py-1 text-right hover:text-foreground"
                onClick={() => toggleSort("compra")}
              >
                Compra{sortArrow("compra")}
              </th>
              <th
                className="cursor-pointer select-none px-2 py-1 text-right hover:text-foreground"
                onClick={() => toggleSort("venta")}
              >
                Venta{sortArrow("venta")}
              </th>
              <th
                className="cursor-pointer select-none px-2 py-1 text-right hover:text-foreground"
                onClick={() => toggleSort("spread")}
              >
                Spread{sortArrow("spread")}
              </th>
              <th
                className="cursor-pointer select-none px-2 py-1 text-right hover:text-foreground"
                onClick={() => toggleSort("feeCompra")}
              >
                Fee Compra{sortArrow("feeCompra")}
              </th>
              <th
                className="cursor-pointer select-none px-2 py-1 text-right hover:text-foreground"
                onClick={() => toggleSort("feeVenta")}
              >
                Fee Venta{sortArrow("feeVenta")}
              </th>
              <th
                className="cursor-pointer select-none px-2 py-1 text-right hover:text-foreground"
                onClick={() => toggleSort("spreadNeto")}
              >
                Neto{sortArrow("spreadNeto")}
              </th>
              <th className="px-2 py-1 text-left">Estado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e, i) => {
              const totalFee = e.feeCompra + e.feeVenta;
              return (
                <tr key={i} className="border-b border-border/30">
                  <td className="px-2 py-1 font-medium capitalize">{e.exchange}</td>
                  <td className="px-2 py-1 text-right">${fmtNum(e.compra)}</td>
                  <td className="px-2 py-1 text-right">${fmtNum(e.venta)}</td>
                  <td className="px-2 py-1 text-right">{fmtNum(e.spread, 2)}%</td>
                  <td className="px-2 py-1 text-right text-yellow-400">
                    {fmtNum(e.feeCompra, 3)}%
                  </td>
                  <td className="px-2 py-1 text-right text-orange-400">{fmtNum(e.feeVenta, 3)}%</td>
                  <td
                    className={`px-2 py-1 text-right font-medium ${e.spreadNeto > 0.5 ? "text-green-400" : e.spreadNeto > 0 ? "text-yellow-400" : "text-red-400"}`}
                  >
                    {e.spreadNeto > 0 ? "+" : ""}
                    {fmtNum(e.spreadNeto, 2)}%
                  </td>
                  <td className="px-2 py-1">
                    {e.spreadNeto > 0.5 ? "" : e.spreadNeto > 0 ? "" : ""}
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
