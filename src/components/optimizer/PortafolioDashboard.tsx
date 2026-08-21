import { useState, useEffect, useCallback } from "react";
import { PortfolioDraftPanel, type DraftAsset } from "./PortfolioDraftPanel";
import { fetchDraftAssetInfo } from "@/lib/draft-asset.functions";
import { useServerFn } from "@tanstack/react-start";

const STORAGE_KEY = "clarity-draft-portfolio";

function loadDraft(): DraftAsset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DraftAsset[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveDraft(assets: DraftAsset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
  } catch {
    /* ignore */
  }
}

export function PortafolioDashboard() {
  const [assets, setAssets] = useState<DraftAsset[]>(loadDraft);
  const [inputSymbol, setInputSymbol] = useState("");
  const [inputCurrency, setInputCurrency] = useState<"ARS" | "USD">("USD");
  const fn = useServerFn(fetchDraftAssetInfo);

  useEffect(() => {
    saveDraft(assets);
  }, [assets]);

  const onAddTicker = useCallback(
    (symbol: string, moneda: "ARS" | "USD") => {
      const sym = symbol.toUpperCase().trim();
      if (!sym) return;
      setAssets((prev) => {
        if (prev.some((a) => a.symbol === sym)) return prev;
        const entry: DraftAsset = {
          symbol: sym,
          moneda,
          cantidad: 0,
          sector: null,
          sectorKey: null,
          industry: null,
          ultimoPrecio: null,
          beta: null,
          retornoEsperadoAnual: null,
          volatilidadAnual: null,
          dailyLogReturns: [],
          longName: null,
          fetchStatus: "pending",
          fetchError: null,
        };
        fn({ data: { symbol: sym, moneda } })
          .then((res) => {
            setAssets((cur) =>
              cur.map((a) =>
                a.symbol === sym
                  ? {
                      ...a,
                      sector: res.sector,
                      sectorKey: res.sectorKey,
                      industry: res.industry,
                      ultimoPrecio: res.ultimoPrecio,
                      beta: res.beta,
                      retornoEsperadoAnual: res.retornoEsperadoAnual,
                      volatilidadAnual: res.volatilidadAnual,
                      dailyLogReturns: res.dailyLogReturns,
                      longName: res.longName,
                      fetchStatus: res.error ? "error" : "ok",
                      fetchError: res.error,
                    }
                  : a,
              ),
            );
          })
          .catch(() => {
            setAssets((cur) =>
              cur.map((a) =>
                a.symbol === sym
                  ? { ...a, fetchStatus: "error", fetchError: "Error al consultar Yahoo Finance" }
                  : a,
              ),
            );
          });
        return [...prev, entry];
      });
      setInputSymbol("");
    },
    [fn],
  );

  const onRemove = useCallback((symbol: string) => {
    setAssets((prev) => prev.filter((a) => a.symbol !== symbol));
  }, []);

  const onUpdateCantidad = useCallback((symbol: string, cantidad: number) => {
    setAssets((prev) => prev.map((a) => (a.symbol === symbol ? { ...a, cantidad } : a)));
  }, []);

  const onUpdatePesoManual = useCallback((symbol: string, peso: number) => {
    setAssets((prev) => prev.map((a) => (a.symbol === symbol ? { ...a, pesoManual: peso } : a)));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-[13px] font-mono uppercase tracking-wider text-muted-foreground">
            Agregar activo
          </label>
          <div className="flex gap-1">
            <input
              type="text"
              value={inputSymbol}
              onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddTicker(inputSymbol, inputCurrency);
              }}
              placeholder="Ticker (ej: AAPL)"
              className="w-28 h-8 rounded border border-border/40 bg-background/60 px-2 text-[14px] font-mono text-foreground outline-none focus:border-primary/60 placeholder:text-muted-foreground/40"
            />
            <select
              value={inputCurrency}
              onChange={(e) => setInputCurrency(e.target.value as "ARS" | "USD")}
              className="h-8 rounded border border-border/40 bg-background/60 px-1.5 text-[13px] font-mono text-foreground outline-none focus:border-primary/60"
            >
              <option value="USD">USD</option>
              <option value="ARS">ARS</option>
            </select>
            <button
              onClick={() => onAddTicker(inputSymbol, inputCurrency)}
              className="h-8 px-3 rounded text-[13px] font-mono font-semibold bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors"
            >
              +
            </button>
          </div>
        </div>
        {assets.length > 0 && (
          <button
            onClick={() => {
              setAssets([]);
              localStorage.removeItem(STORAGE_KEY);
            }}
            className="h-8 px-3 rounded text-[13px] font-mono text-red-400 border border-red-400/40 hover:bg-red-400/10 transition-colors"
          >
            Limpiar todo
          </button>
        )}
      </div>

      {assets.length > 0 ? (
        <PortfolioDraftPanel
          assets={assets}
          onUpdateCantidad={onUpdateCantidad}
          onUpdatePesoManual={onUpdatePesoManual}
          onRemove={onRemove}
          onAddTicker={onAddTicker}
        />
      ) : (
        <div className="flex items-center justify-center h-32 rounded border border-dashed border-border/40 text-muted-foreground text-[13px] font-mono">
          Agregá activos usando el campo de arriba para armar un portafolio de prueba
        </div>
      )}
    </div>
  );
}
