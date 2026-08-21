// @ts-nocheck
import { useState } from "react";
import { SECTOR_DISPLAY } from "@/lib/sectores/sector-display-map";
import { simulateSectorImpact, type SectorImpactRow } from "@/lib/sectores/sector-impact.functions";
import { useServerFn } from "@tanstack/react-start";
import { SectorPerformanceBars } from "./SectorPerformanceBars";

export function SectorImpactSimulator() {
  const [baseSectorKey, setBaseSectorKey] = useState<string>(SECTOR_DISPLAY[0].key);
  const [movePercent, setMovePercent] = useState(5);
  const [rangeDays, setRangeDays] = useState("1y");
  const [data, setData] = useState<{ base: SectorImpactRow; results: SectorImpactRow[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const simFn = useServerFn(simulateSectorImpact);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const result = await simFn({ data: { baseSectorKey, movePercent, rangeDays } });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al simular impacto");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col text-xs text-muted-foreground">
          Sector base
          <select
            value={baseSectorKey}
            onChange={(e) => setBaseSectorKey(e.target.value)}
            className="bg-background border border-border/40 rounded px-2 py-1 text-sm font-mono text-foreground"
          >
            {SECTOR_DISPLAY.map((s) => (
              <option key={s.key} value={s.key}>{s.label} ({s.etf})</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Movimiento (%)
          <input
            type="number"
            step={0.1}
            value={movePercent}
            onChange={(e) => setMovePercent(Number(e.target.value))}
            className="bg-background border border-border/40 rounded px-2 py-1 text-sm font-mono text-foreground w-24"
          />
        </label>
        <label className="flex flex-col text-xs text-muted-foreground">
          Ventana histórica
          <select
            value={rangeDays}
            onChange={(e) => setRangeDays(e.target.value)}
            className="bg-background border border-border/40 rounded px-2 py-1 text-sm font-mono text-foreground"
          >
            <option value="3mo">3 meses</option>
            <option value="6mo">6 meses</option>
            <option value="1y">1 año</option>
            <option value="2y">2 años</option>
          </select>
        </label>
        <button
          onClick={run}
          disabled={loading}
          className="bg-primary/20 border border-primary/40 text-primary rounded px-4 py-1.5 text-sm font-mono hover:bg-primary/30 disabled:opacity-40 transition-colors"
        >
          {loading ? "Calculando\u2026" : "Simular impacto"}
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded p-3">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="text-xs text-muted-foreground mb-1">
            Impacto proyectado si <strong className="text-foreground">{data.base.label}</strong> se mueve <strong className="text-foreground">{data.base.movimientoProyectado != null ? (data.base.movimientoProyectado >= 0 ? "+" : "") : ""}{data.base.movimientoProyectado?.toFixed(1).replace(".", ",")}%</strong> (ventana {rangeDays})
          </div>
          <SectorPerformanceBars
            rows={data.results.map((r) => ({
              label: r.label,
              etf: r.etf,
              dot: r.dot,
              value: r.movimientoProyectado,
            }))}
          />
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-left font-mono text-[11px]">
              <thead className="border-b border-border/40 text-[9px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5">Sector</th>
                  <th className="px-2 py-1.5 text-right">Beta</th>
                  <th className="px-2 py-1.5 text-right">R²</th>
                  <th className="px-2 py-1.5 text-right">Correlación</th>
                  <th className="px-2 py-1.5 text-right">Mov. Proyectado</th>
                  <th className="px-2 py-1.5 text-right">Fiabilidad</th>
                </tr>
              </thead>
              <tbody>
                {data.results.map((r) => (
                  <tr key={r.key} className="border-b border-border/20 last:border-0 hover:bg-muted/10">
                    <td className="px-2 py-1">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.dot }} />
                        {r.label} ({r.etf})
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right">{r.beta != null ? r.beta.toFixed(2) : "\u2014"}</td>
                    <td className="px-2 py-1 text-right">{r.r2 != null ? (r.r2 * 100).toFixed(0) + "%" : "\u2014"}</td>
                    <td className="px-2 py-1 text-right">{r.correlacion != null ? r.correlacion.toFixed(2) : "\u2014"}</td>
                    <td className={`px-2 py-1 text-right font-semibold ${r.movimientoProyectado != null ? (r.movimientoProyectado >= 0 ? "text-emerald-400" : "text-red-400") : ""} ${!r.fiable ? "opacity-60" : ""}`}>
                      {r.movimientoProyectado != null
                        ? (r.movimientoProyectado >= 0 ? "+" : "") + r.movimientoProyectado.toFixed(1).replace(".", ",") + "%"
                        : "\u2014"}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {r.beta == null ? (
                        <span className="text-muted-foreground">Datos insuficientes</span>
                      ) : r.fiable ? (
                        <span className="text-emerald-400/80">Beta fiable (R² {(r.r2! * 100).toFixed(0)}%)</span>
                      ) : (
                        <span className="text-amber-400/80" title="R² bajo — poco fiable para predecir movimientos">
                          R² bajo ({(r.r2! * 100).toFixed(0)}%) — poco fiable
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
