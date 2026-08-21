"use client";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    TradingView: any;
  }
}

function toTVSymbol(ticker: string): string {
  const t = ticker.toUpperCase().trim();
  if (t.endsWith(".BA")) return `BCBA:${t.slice(0, -3)}`;
  if (!t.includes(":")) return t;
  return t;
}

interface Props {
  asset1: string;
  asset2: string;
  interval?: "1" | "3" | "5" | "15" | "30" | "60" | "120" | "240" | "D" | "W" | "M";
  height?: number;
}

export function TradingViewCompareWidget({ asset1, asset2, interval = "D", height = 420 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window.TradingView !== "undefined") {
      setReady(true);
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://s3.tradingview.com/tv.js"]',
    );
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!ready || !containerRef.current || !window.TradingView) return;
    if (widgetRef.current) {
      try {
        widgetRef.current.remove();
      } catch {}
      widgetRef.current = null;
    }

    const id = `tvc-${Math.random().toString(36).slice(2, 9)}`;
    containerRef.current.id = id;

    widgetRef.current = new window.TradingView.widget({
      container_id: id,
      symbol: toTVSymbol(asset1),
      interval,
      timezone: "America/Argentina/Buenos_Aires",
      theme: "dark",
      style: "1",
      locale: "es",
      toolbar_bg: "#141a28",
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false,
      studies: ["RSI@tv-basicstudies"],
      studies_overrides: { "RSI.length": 14 },
      compare_symbols: [toTVSymbol(asset2)],
      show_popup_button: true,
      autosize: true,
    });

    return () => {
      if (widgetRef.current) {
        try {
          widgetRef.current.remove();
        } catch {}
        widgetRef.current = null;
      }
    };
  }, [ready, asset1, asset2, interval, height]);

  if (!asset1 || !asset2) return null;

  return (
    <div className="relative w-full overflow-hidden rounded-lg border border-border/40">
      <div ref={containerRef} className="w-full" style={{ height }} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/40">
          <p className="text-xs text-muted-foreground">Cargando gráfico TradingView…</p>
        </div>
      )}
    </div>
  );
}
