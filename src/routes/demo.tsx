import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import MarketDataInput from "@/components/market-data/MarketDataInput";
import type { QuoteData, HistoricalBar } from "@/lib/market-data.types";
import { createMeta } from "@/lib/seo/meta";

export const Route = createFileRoute("/demo")({
  head: () => {
    const { meta, links } = createMeta({
      title: "Demo · MarketDataInput",
      description: "Componente reutilizable para cotizaciones y series históricas.",
      path: "/demo",
      robots: "noindex, nofollow",
    });
    return { meta, links };
  },
  component: DemoPage,
});

function DemoPage() {
  const [lastQuote, setLastQuote] = useState<QuoteData | null>(null);
  const [barCount, setBarCount] = useState(0);

  return (
    <div className="min-h-screen bg-background/40 p-6 space-y-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-foreground text-xl font-semibold">MarketDataInput Demo</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Componente reutilizable para series historicas y cotizaciones. Fuente: Yahoo Finance
            (.BA para acciones AR) o InvertirOnline (bCBA / NYSE / NASDAQ).
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Uso basico</p>
          <MarketDataInput
            defaultTicker="GGAL"
            defaultSource="yahoo"
            defaultMercado="bCBA"
            onQuoteReceived={(q) => setLastQuote(q)}
            onHistoricalReceived={(bars) => setBarCount(bars.length)}
          />
        </div>

        {(lastQuote || barCount > 0) && (
          <div className="p-3 rounded-md bg-surface border border-border/60 font-mono text-xs space-y-1">
            <p className="text-muted-foreground uppercase tracking-wide">Datos recibidos por callback</p>
            {lastQuote && (
              <p className="text-foreground">
                Quote: {lastQuote.ticker} - {lastQuote.precio} {lastQuote.moneda} -{" "}
                {lastQuote.variacionPct.toFixed(2)}%
              </p>
            )}
            {barCount > 0 && (
              <p className="text-foreground">Serie historica: {barCount} velas recibidas</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Solo cotizacion (sin grafico)
          </p>
          <MarketDataInput
            defaultTicker="SPY"
            defaultSource="yahoo"
            defaultMercado="NYSE"
            showChart={false}
          />
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Fuente IOL (requiere credenciales)
          </p>
          <MarketDataInput
            defaultTicker="AL30"
            defaultSource="iol"
            defaultMercado="bCBA"
            chartHeight={200}
          />
        </div>

        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Solo grafico (sin cotizacion)
          </p>
          <MarketDataInput
            defaultTicker="NVDA"
            defaultSource="yahoo"
            defaultMercado="NASDAQ"
            showQuoteCard={false}
            chartHeight={200}
          />
        </div>
      </div>
    </div>
  );
}
