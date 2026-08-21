// @ts-nocheck
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getOnsForLadder,
  getDashboardDiario,
  type DashboardRow,
} from "@/lib/dashboard-diario.functions";
import { BONOS_LIST } from "@/lib/bonos-data";

interface OnsLadderPanelProps {
  accessToken: string | null;
  onAddTickers: (tickers: string[]) => void;
  existingTickers: string[];
}

export function OnsLadderPanel({
  accessToken,
  onAddTickers,
  existingTickers,
}: OnsLadderPanelProps) {
  const [showManual, setShowManual] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [ladderMode, setLadderMode] = useState(false);
  const [minVol, setMinVol] = useState(0);
  const [minTir, setMinTir] = useState(5);
  const [ladderResults, setLadderResults] = useState<DashboardRow[]>([]);
  const [loadingLadder, setLoadingLadder] = useState(false);
  const [selectedLadder, setSelectedLadder] = useState<Set<string>>(new Set());
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const fnLadder = useServerFn(getOnsForLadder);

  const availableOnTickers = useMemo(() => {
    return BONOS_LIST.filter(
      (b) =>
        (b.tipo === "ON Hard Dollar" ||
          b.tipo === "ON CER" ||
          b.tipo === "ON Badlar" ||
          b.tipo === "ON Tasa Fija") &&
        !existingTickers.includes(b.ticker),
    ).sort((a, b) => a.ticker.localeCompare(b.ticker));
  }, [existingTickers]);

  function handleManualAdd() {
    const tickers = manualInput
      .split(/[,;\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tickers.length > 0) {
      onAddTickers(tickers);
      setManualInput("");
    }
  }

  async function handleLadderSearch() {
    if (!dateRange.start) return;
    setLoadingLadder(true);
    try {
      const start = new Date(dateRange.start);
      const end = dateRange.end
        ? new Date(dateRange.end)
        : new Date(start.getFullYear() + 5, start.getMonth(), start.getDate());

      // Generate monthly dates in range
      const fechasFaltantes: string[] = [];
      const current = new Date(start);
      while (current <= end) {
        fechasFaltantes.push(current.toISOString().slice(0, 10));
        current.setMonth(current.getMonth() + 1);
      }

      const result = await fnLadder({
        data: {
          fechasFaltantes,
          minVolumen: minVol,
          minTir: minTir / 100,
          bearerToken: accessToken ?? undefined,
        },
      });
      setLadderResults(result);
    } catch {
      /* ignore */
    }
    setLoadingLadder(false);
  }

  function toggleLadderSelection(ticker: string) {
    setSelectedLadder((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }

  function addSelectedToDashboard() {
    if (selectedLadder.size > 0) {
      onAddTickers([...selectedLadder]);
      setSelectedLadder(new Set());
    }
  }

  return (
    <div className="glass p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Selector de ONs</div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowManual(!showManual)}
            className={`mono rounded-md border px-2 py-1 text-[11px] transition-colors ${
              showManual
                ? "bg-primary/20 text-primary border-primary/40"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {showManual ? "Ocultar manual" : "Añadir ticker manual"}
          </button>
          <button
            onClick={() => setLadderMode(!ladderMode)}
            className={`mono rounded-md border px-2 py-1 text-[11px] transition-colors ${
              ladderMode
                ? "bg-primary/20 text-primary border-primary/40"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {ladderMode ? "Cerrar escalera" : "Escalera automática"}
          </button>
        </div>
      </div>

      {/*  Manual ticker selector  */}
      {showManual && (
        <div className="space-y-2 p-3 bg-muted/20 rounded-md">
          <div className="text-[11px] text-muted-foreground">
            Ingresá tickers separados por coma, espacio o punto y coma
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualAdd();
              }}
              placeholder="Ej: BF40O, YM34O, PQCSO"
              className="flex-1 bg-muted/30 border border-border/60 rounded px-2 py-1 text-[12px] font-mono outline-none focus:border-primary/50"
            />
            <button
              onClick={handleManualAdd}
              disabled={!manualInput.trim()}
              className="mono rounded-md bg-primary/20 text-primary border border-primary/30 px-3 py-1 text-[11px] hover:bg-primary/30 disabled:opacity-40"
            >
              Añadir
            </button>
          </div>
          <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
            {availableOnTickers.slice(0, 50).map((b) => (
              <button
                key={b.ticker}
                onClick={() => {
                  onAddTickers([b.ticker]);
                }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                title={`${b.descripcion} - ${b.tipo}`}
              >
                {b.ticker}
              </button>
            ))}
          </div>
        </div>
      )}

      {/*  Automatic ladder mode  */}
      {ladderMode && (
        <div className="space-y-3 p-3 bg-muted/20 rounded-md">
          <div className="text-[11px] text-muted-foreground">
            Buscar ONs que paguen cupón en fechas específicas, filtradas por volumen y TIR
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] text-muted-foreground uppercase">Desde</label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange((p) => ({ ...p, start: e.target.value }))}
                className="bg-muted/30 border border-border/60 rounded px-2 py-1 text-[11px] font-mono outline-none"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] text-muted-foreground uppercase">Hasta</label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange((p) => ({ ...p, end: e.target.value }))}
                className="bg-muted/30 border border-border/60 rounded px-2 py-1 text-[11px] font-mono outline-none"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] text-muted-foreground uppercase">Vol. min</label>
              <input
                type="number"
                value={minVol}
                onChange={(e) => setMinVol(Number(e.target.value))}
                className="w-20 bg-muted/30 border border-border/60 rounded px-2 py-1 text-[11px] font-mono outline-none"
              />
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-[9px] text-muted-foreground uppercase">TIR min %</label>
              <input
                type="number"
                value={minTir}
                onChange={(e) => setMinTir(Number(e.target.value))}
                className="w-16 bg-muted/30 border border-border/60 rounded px-2 py-1 text-[11px] font-mono outline-none"
              />
            </div>
            <button
              onClick={handleLadderSearch}
              disabled={!dateRange.start || loadingLadder}
              className="mono rounded-md bg-primary/20 text-primary border border-primary/30 px-3 py-1 text-[11px] hover:bg-primary/30 disabled:opacity-40"
            >
              {loadingLadder ? "Buscando..." : "Buscar ONs"}
            </button>
          </div>

          {ladderResults.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">
                  {ladderResults.length} ONs encontradas
                </span>
                {selectedLadder.size > 0 && (
                  <button
                    onClick={addSelectedToDashboard}
                    className="mono rounded-md bg-green-900/30 text-green-400 border border-green-800/50 px-2 py-0.5 text-[10px]"
                  >
                    Añadir {selectedLadder.size} seleccionadas
                  </button>
                )}
              </div>
              <div className="overflow-x-auto max-h-60 overflow-y-auto">
                <table className="mono w-full text-[10px]">
                  <thead className="text-[8px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/60">
                      {selectedLadder.size > 0 && <th className="px-1 py-1"></th>}
                      <th className="px-1 py-1 text-left">Ticker</th>
                      <th className="px-1 py-1 text-left">Sector</th>
                      <th className="px-1 py-1 text-right">TIR</th>
                      <th className="px-1 py-1 text-right">Vol</th>
                      <th className="px-1 py-1 text-right">Paridad</th>
                      <th className="px-1 py-1 text-right">DM</th>
                      <th className="px-1 py-1 text-left">Mod</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ladderResults.map((row) => (
                      <tr
                        key={row.ticker}
                        className={`border-b border-border/10 hover:bg-muted/20 transition-colors cursor-pointer ${
                          selectedLadder.has(row.ticker) ? "bg-primary/10" : ""
                        }`}
                        onClick={() => toggleLadderSelection(row.ticker)}
                      >
                        {selectedLadder.size > 0 && (
                          <td className="px-1 py-1">
                            <input
                              type="checkbox"
                              checked={selectedLadder.has(row.ticker)}
                              onChange={() => toggleLadderSelection(row.ticker)}
                              className="accent-primary"
                            />
                          </td>
                        )}
                        <td className="px-1 py-1 font-semibold">{row.ticker}</td>
                        <td className="px-1 py-1 text-muted-foreground">{row.sector || "-"}</td>
                        <td
                          className={`px-1 py-1 text-right ${
                            row.yieldVal != null
                              ? row.yieldVal > 10
                                ? "text-red-400"
                                : row.yieldVal > 6
                                  ? "text-amber-400"
                                  : "text-green-400"
                              : ""
                          }`}
                        >
                          {row.yieldVal != null ? `${row.yieldVal.toFixed(2)}%` : "-"}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {row.volumen != null ? row.volumen.toLocaleString() : "-"}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {row.paridad != null ? `${row.paridad.toFixed(2)}%` : "-"}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {row.modDuration != null ? row.modDuration.toFixed(2) : "-"}
                        </td>
                        <td className="px-1 py-1">
                          <span
                            className={`rounded px-1 py-0.5 text-[8px] ${
                              row.modality === "Hard Dollar"
                                ? "bg-green-900/30 text-green-300"
                                : row.modality === "Dólar Linked"
                                  ? "bg-blue-900/30 text-blue-300"
                                  : row.modality === "UVA / CER"
                                    ? "bg-yellow-900/30 text-yellow-300"
                                    : "bg-muted/30"
                            }`}
                          >
                            {row.modality ? row.modality.slice(0, 8) : "-"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {ladderResults.length === 0 && !loadingLadder && dateRange.start && (
            <div className="text-[11px] text-muted-foreground text-center py-4">
              No se encontraron ONs que paguen cupón en las fechas seleccionadas.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
