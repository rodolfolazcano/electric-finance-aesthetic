import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getYahooQuoteServer } from "@/lib/market-data.functions";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const WATCH_TICKERS = ["SPY", "QQQ", "AAPL", "^MERV"];

function TickerCard({ symbol }: { symbol: string }) {
  const fn = useServerFn(getYahooQuoteServer);
  const { data, isError } = useQuery({
    queryKey: ["hero-ticker", symbol],
    queryFn: () => fn({ data: { symbol } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  const varPct = data?.variacionPct ?? null;
  const direction = varPct === null ? "neutral" : varPct > 0 ? "up" : varPct < 0 ? "down" : "neutral";
  const color =
    direction === "up"
      ? "text-success"
      : direction === "down"
        ? "text-danger"
        : "text-muted-foreground";
  const Icon =
    direction === "up" ? TrendingUp : direction === "down" ? TrendingDown : Minus;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2.5 backdrop-blur-md">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[11px] font-semibold text-foreground">{symbol}</div>
        {isError || !data ? (
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground/50">
            {isError ? "sin datos" : "cargando…"}
          </div>
        ) : (
          <div className="mt-0.5 flex items-center gap-2">
            <span className="font-mono text-xs font-medium text-foreground">
              {data.moneda === "ARS" ? "$" : "US$"}
              {data.precio?.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—"}
            </span>
            <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] ${color}`}>
              <Icon className="h-2.5 w-2.5" />
              {varPct != null ? `${varPct > 0 ? "+" : ""}${varPct.toFixed(2)}%` : "—"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function LiveTickerPanel() {
  return (
    <div className="flex flex-wrap gap-2">
      {WATCH_TICKERS.map((sym) => (
        <TickerCard key={sym} symbol={sym} />
      ))}
    </div>
  );
}
