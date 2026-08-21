"use client";
import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExchangeCotizacion } from "@/lib/cripto.types";

function fmtNum(n: number, dp = 2) {
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function ArbitrajeCalculadora({
  exchanges,
  usdtExchanges,
}: {
  exchanges: ExchangeCotizacion[];
  usdtExchanges: Record<
    string,
    { bid: number; ask: number; totalAsk: number; totalBid: number }
  > | null;
}) {
  const [capital, setCapital] = useState(100000);
  const [compraEn, setCompraEn] = useState("mexc");
  const [ventaEn, setVentaEn] = useState("eluter");

  function getRealFee(exchange: string, side: "buy" | "sell"): number {
    const ex = usdtExchanges?.[exchange];
    if (!ex || !ex.totalAsk || !ex.totalBid) return 0;
    if (side === "buy") return Math.max(0, (ex.totalAsk - ex.ask) / ex.ask);
    return Math.max(0, (ex.bid - ex.totalBid) / ex.bid);
  }

  const compra = exchanges.find((e) => e.exchange === compraEn);
  const venta = exchanges.find((e) => e.exchange === ventaEn);

  if (exchanges.length === 0) return null;

  const feeCompra = getRealFee(compraEn, "buy");
  const feeVenta = getRealFee(ventaEn, "sell");
  const usdts = compra ? capital / compra.compra : 0;
  const arsRecibidos = venta ? usdts * venta.venta : 0;
  const gananciaBruta = arsRecibidos - capital;
  const gananciaPct = capital > 0 ? (gananciaBruta / capital) * 100 : 0;
  const costosCompra = capital * feeCompra;
  const costosVenta = arsRecibidos * feeVenta;
  const costos = costosCompra + costosVenta;
  const gananciaNeta = gananciaBruta - costos;
  const gananciaNetaPct = capital > 0 ? (gananciaNeta / capital) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
        Calculadora de Arbitraje
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div>
          <Label className="text-[10px] text-muted-foreground">Capital (ARS)</Label>
          <Input
            type="number"
            value={capital}
            onChange={(e) => setCapital(parseFloat(e.target.value) || 0)}
            className="mt-1 h-7 text-[11px] bg-background/40 border-border/60 font-mono"
          />
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Comprar USDT en</Label>
          <select
            value={compraEn}
            onChange={(e) => setCompraEn(e.target.value)}
            className="mt-1 w-full h-7 text-[11px] bg-background/40 border border-border/60 rounded-md text-foreground font-mono px-2"
          >
            {exchanges
              .sort((a, b) => a.compra - b.compra)
              .map((e) => (
                <option key={e.exchange} value={e.exchange}>
                  {e.exchange} (${fmtNum(e.compra)}, fee{" "}
                  {fmtNum(getRealFee(e.exchange, "buy") * 100, 3)}%)
                </option>
              ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Vender USDT en</Label>
          <select
            value={ventaEn}
            onChange={(e) => setVentaEn(e.target.value)}
            className="mt-1 w-full h-7 text-[11px] bg-background/40 border border-border/60 rounded-md text-foreground font-mono px-2"
          >
            {exchanges
              .sort((a, b) => b.venta - a.venta)
              .map((e) => (
                <option key={e.exchange} value={e.exchange}>
                  {e.exchange} (${fmtNum(e.venta)}, fee{" "}
                  {fmtNum(getRealFee(e.exchange, "sell") * 100, 3)}%)
                </option>
              ))}
          </select>
        </div>
        <div>
          <Label className="text-[10px] text-muted-foreground">Cotizaciones</Label>
          <div className="mt-1 h-7 flex items-center text-[11px] font-mono text-muted-foreground bg-background/40 border border-border/60 rounded-md px-2">
            {compra && venta ? `$${fmtNum(compra.compra)} → $${fmtNum(venta.venta)}` : "\u2014"}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono sm:grid-cols-4">
        <div className="rounded-md bg-background/40 border border-border/60 p-2">
          <span className="text-muted-foreground">Bruto: </span>
          <span className={gananciaBruta >= 0 ? "text-green-400" : "text-red-400"}>
            ${fmtNum(gananciaBruta)} ({fmtNum(gananciaPct, 2)}%)
          </span>
        </div>
        <div className="rounded-md bg-background/40 border border-border/60 p-2">
          <span className="text-muted-foreground">
            Fee Compra ({fmtNum(feeCompra * 100, 3)}%):{" "}
          </span>
          <span className="text-yellow-400">${fmtNum(costosCompra)}</span>
        </div>
        <div className="rounded-md bg-background/40 border border-border/60 p-2">
          <span className="text-muted-foreground">Fee Venta ({fmtNum(feeVenta * 100, 3)}%): </span>
          <span className="text-orange-400">${fmtNum(costosVenta)}</span>
        </div>
        <div className="rounded-md bg-background/40 border border-border/60 p-2">
          <span className="text-muted-foreground">Neta: </span>
          <span
            className={gananciaNeta >= 0 ? "text-green-400 text-base" : "text-red-400 text-base"}
          >
            ${fmtNum(gananciaNeta)} ({fmtNum(gananciaNetaPct, 2)}%)
          </span>
        </div>
      </div>
    </div>
  );
}
