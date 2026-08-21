import { useState, useEffect } from "react";

type DataSourceMode = "manual" | "portafolio-iol";

interface DataSourceToggleProps {
  mode: DataSourceMode;
  onModeChange: (mode: DataSourceMode) => void;
  disabled?: boolean;
}

export type { DataSourceMode };
export type { DataSourceToggleProps };

export function DataSourceToggle({ mode, onModeChange, disabled = false }: DataSourceToggleProps) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);

  const isDisabled = hydrated ? disabled : false;

  return (
    <div className="flex gap-1.5 border-b border-border/40 pb-2">
      <button
        onClick={() => onModeChange("manual")}
        disabled={isDisabled}
        className={`font-mono text-[11px] px-3 py-1.5 rounded-md border transition-colors ${
          mode === "manual"
            ? "border-primary/60 bg-primary/10 text-foreground"
            : "border-border/60 text-muted-foreground hover:text-foreground"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        Manual
      </button>
      <div className="relative">
        <button
          onClick={() => {
            if (!isDisabled) onModeChange("portafolio-iol");
          }}
          disabled={isDisabled}
          className={`font-mono text-[11px] px-3 py-1.5 rounded-md border transition-colors ${
            mode === "portafolio-iol"
              ? "border-primary/60 bg-primary/10 text-foreground"
              : "border-border/60 text-muted-foreground hover:text-foreground"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          Portafolio IOL
        </button>
        {isDisabled && (
          <div className="absolute left-0 top-full mt-1 w-56 rounded border border-border/40 bg-background px-2.5 py-1.5 text-[10px] text-muted-foreground shadow-lg z-10">
            Conectá tu cuenta IOL para ver tu cartera real
          </div>
        )}
      </div>
    </div>
  );
}
