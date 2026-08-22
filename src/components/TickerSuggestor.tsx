"use client";
import { useState, useMemo } from "react";
import sectores from "@/lib/sectores.json";

interface TickerItem {
  ticker: string;
  nombre: string;
}

interface TickerSuggestorProps {
  onSelect: (ticker: string) => void;
  visible?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
}

export default function TickerSuggestor({ onSelect, visible = true, onVisibilityChange }: TickerSuggestorProps) {
  const [sector, setSector] = useState("");
  const [industry, setIndustry] = useState("");

  if (!visible) {
    return (
      <div className="glass min-w-0 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Sugeridos por sector
          </div>
          <button
            onClick={() => onVisibilityChange?.(true)}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Mostrar
          </button>
        </div>
      </div>
    );
  }

  const sectorList = useMemo(() => Object.keys(sectores).sort(), []);

  const industryList = useMemo(() => {
    if (!sector) return [];
    const data = (sectores as Record<string, Record<string, TickerItem[]>>)[sector];
    return data ? Object.keys(data).sort() : [];
  }, [sector]);

  const tickers = useMemo(() => {
    if (!sector || !industry) return [];
    const data = (sectores as Record<string, Record<string, TickerItem[]>>)[sector];
    return data?.[industry] ?? [];
  }, [sector, industry]);

  return (
    <div className="glass min-w-0 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          Sugeridos por sector
        </div>
        <button
          onClick={() => onVisibilityChange?.(false)}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Ocultar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          value={sector}
          onChange={(e) => {
            setSector(e.target.value);
            setIndustry("");
          }}
          className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none"
        >
          <option value="">Sector</option>
          {sectorList.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          disabled={!sector}
          className="bg-background/40 border border-border/60 text-foreground text-xs rounded-md px-2 py-1.5 focus:border-primary outline-none disabled:opacity-40"
        >
          <option value="">Industria</option>
          {industryList.map((ind) => (
            <option key={ind} value={ind}>
              {ind}
            </option>
          ))}
        </select>
      </div>

      {tickers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tickers.map((item) => (
            <button
              key={item.ticker}
              onClick={() => onSelect(item.ticker)}
              className="group rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground font-mono"
              title={item.nombre}
            >
              {item.ticker}
              <span className="hidden group-hover:inline ml-1 text-[9px] text-muted-foreground font-sans">
                {item.nombre}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
