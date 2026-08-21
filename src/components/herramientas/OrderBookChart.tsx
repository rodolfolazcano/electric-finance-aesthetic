"use client";
import type { OrderBook } from "@/lib/cripto.types";

function fmt(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function OrderBookChart({ orderBook }: { orderBook: OrderBook | null }) {
  if (!orderBook) return null;

  const allLevels = [...orderBook.asks].reverse().slice(-12);
  const bidLevels = orderBook.bids.slice(0, 12);
  const maxTotal = Math.max(
    orderBook.bids[orderBook.bids.length - 1]?.total ?? 1,
    orderBook.asks[orderBook.asks.length - 1]?.total ?? 1,
  );

  return (
    <div className="font-mono">
      {/* ASKS (sell side) */}
      <div className="space-y-0.5 mb-2">
        <div className="text-[9px] uppercase tracking-wider text-red-400/60 mb-1">
          Ofertas (Ask)
        </div>
        {allLevels.map((a, i) => (
          <div key={`a${i}`} className="flex items-center gap-1.5 h-4">
            <div className="w-[80px] text-right text-[10px] text-red-400/80 truncate shrink-0">
              {fmt(a.price)}
            </div>
            <div className="flex-1 h-3 rounded-sm bg-red-500/10 relative overflow-hidden">
              <div
                className="h-full rounded-sm bg-red-500/25 absolute right-0 transition-all duration-300"
                style={{ width: `${(a.total / maxTotal) * 100}%` }}
              />
            </div>
            <div className="w-[48px] text-left text-[9px] text-red-400/50 shrink-0">
              {fmt(a.volume, 4)}
            </div>
          </div>
        ))}
      </div>

      {/* Spread midline */}
      <div className="border-t border-b border-border/40 my-2 py-1.5 flex justify-between text-[10px] bg-background/40/40 -mx-1 px-2 rounded">
        <span className="text-green-400 font-medium">Bid: {fmt(orderBook.bestBid)}</span>
        <span className="text-muted-foreground">Spread: {fmt(orderBook.spreadPct, 3)}%</span>
        <span className="text-red-400 font-medium">Ask: {fmt(orderBook.bestAsk)}</span>
      </div>

      {/* BIDS (buy side) */}
      <div className="space-y-0.5 mt-2">
        <div className="text-[9px] uppercase tracking-wider text-green-400/60 mb-1">
          Demandas (Bid)
        </div>
        {bidLevels.map((b, i) => (
          <div key={`b${i}`} className="flex items-center gap-1.5 h-4">
            <div className="w-[80px] text-right text-[10px] text-green-400/80 truncate shrink-0">
              {fmt(b.price)}
            </div>
            <div className="flex-1 h-3 rounded-sm bg-green-500/10 relative overflow-hidden">
              <div
                className="h-full rounded-sm bg-green-500/25 absolute left-0 transition-all duration-300"
                style={{ width: `${(b.total / maxTotal) * 100}%` }}
              />
            </div>
            <div className="w-[48px] text-left text-[9px] text-green-400/50 shrink-0">
              {fmt(b.volume, 4)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
