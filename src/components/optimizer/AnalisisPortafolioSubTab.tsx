// @ts-nocheck
import { useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  analizarPortafolio,
  type AnalisisPortafolioResult,
} from "@/lib/analisis-portafolio.functions";
import { useIOLPortafolio } from "@/lib/use-iol-portafolio";
import type { IOLActivo } from "@/lib/iol-portfolio.functions";

const fmt = (n: number, d = 2) =>
  n.toLocaleString("es-AR", { minimumFractionDigits: d, maximumFractionDigits: d });

let uidCounter = 0;
function genId() {
  return `ap-${++uidCounter}-${Date.now()}`;
}

type Row = { id: string; ticker: string; cantidad: number };

const SECTOR_COLORS = [
  "#10B981",
  "#E8B25A",
  "#6EA8FE",
  "#8B5CF6",
  "#E8735A",
  "#EC4899",
  "#06B6D4",
  "#F59E0B",
];

export function AnalisisPortafolioSubTab() {
  const fn = useServerFn(analizarPortafolio);
  const iol = useIOLPortafolio();

  const [rows, setRows] = useState<Row[]>([{ id: genId(), ticker: "", cantidad: 0 }]);
  const [loading, setLoading] = useState(false);
  const [loadingIOL, setLoadingIOL] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalisisPortafolioResult | null>(null);

  useEffect(() => {
    if (iol.accessToken && iol.esAsesor === null) iol.loadClientes();
  }, [iol.accessToken, iol.esAsesor, iol.loadClientes, iol]);

  const updateRow = (id: string, field: keyof Row, value: string | number) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, { id: genId(), ticker: "", cantidad: 0 }]);
  const removeRow = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));

  const cargarDesdeIOL = useCallback(async () => {
    if (!iol.accessToken) {
      setError("Iniciá sesión en IOL para cargar el portafolio.");
      return;
    }
    setLoadingIOL(true);
    setError("");
    try {
      if (iol.esAsesor === null) await iol.loadClientes();
      const activos = (await iol.loadPortfolio(
        iol.esAsesor && iol.clienteId ? iol.clienteId : undefined,
      )) as IOLActivo[];
      const validos = activos
        .filter((a) => a?.cantidad > 0 && a?.titulo?.simbolo)
        .map((a) => ({ id: genId(), ticker: a.titulo.simbolo, cantidad: a.cantidad }));
      if (validos.length === 0) {
        setError("No hay posiciones con cantidad > 0 en el portafolio IOL.");
        return;
      }
      setRows(validos);
      setResult(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar el portafolio IOL.");
    } finally {
      setLoadingIOL(false);
    }
  }, [iol]);

  const handleAnalizar = async () => {
    const valid = rows.filter((r) => r.ticker.trim() && r.cantidad > 0);
    if (valid.length === 0) {
      setError("Ingresá al menos un ticker con cantidad.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fn({
        data: {
          items: valid.map((r) => ({
            ticker: r.ticker.trim().toUpperCase(),
            cantidad: r.cantidad,
          })),
          period: 365,
        },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar el portafolio.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        Análisis del Portafolio — pesos normalizados con precio real de cotización
      </div>

      {/* Input */}
      <div className="rounded-lg border border-border/40 p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            Composición actual (ticker + cantidad)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={cargarDesdeIOL}
              disabled={loadingIOL}
              className="mono text-[10px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-md hover:bg-blue-500/20 disabled:opacity-50"
            >
              {loadingIOL ? "Cargando IOL…" : "Cargar portafolio IOL"}
            </button>
            <button
              onClick={addRow}
              className="mono text-[10px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-md hover:bg-emerald-500/20"
            >
              + Agregar
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-[11px]">
            <thead className="text-[9px] uppercase tracking-wider text-muted-foreground bg-muted/10">
              <tr>
                <th className="px-2 py-1.5">Ticker</th>
                <th className="px-2 py-1.5 text-right">Cantidad</th>
                <th className="px-2 py-1.5 text-right w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border/10">
                  <td className="px-2 py-1">
                    <input
                      value={row.ticker}
                      onChange={(e) => updateRow(row.id, "ticker", e.target.value.toUpperCase())}
                      placeholder="GGAL / AMZND / AAPL.BA"
                      className="w-36 bg-background/40 border border-border/40 rounded px-1.5 py-1 text-[11px] outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={0}
                      value={row.cantidad || ""}
                      onChange={(e) => updateRow(row.id, "cantidad", +e.target.value || 0)}
                      className="w-24 text-right bg-background/40 border border-border/40 rounded px-1.5 py-1 text-[11px] outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    {rows.length > 1 && (
                      <button
                        onClick={() => removeRow(row.id)}
                        className="text-red-400/60 hover:text-red-400 text-xs"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[9px] text-muted-foreground">
            CEDEARs con D-especie (ej. AMZND, MSFTD) o instrumentos ARS directos (ej. GGAL, AL30).
            Soporta tickers con sufijo .BA.
          </p>
          <button
            onClick={handleAnalizar}
            disabled={loading}
            className="mono text-xs uppercase tracking-wider bg-primary/10 text-primary border border-primary/30 px-4 py-1.5 rounded-md hover:bg-primary/20 disabled:opacity-50"
          >
            {loading ? "Analizando…" : "Analizar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400 font-mono">
          {error}
        </div>
      )}

      {result && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-1 rounded-lg border border-border/40 overflow-hidden bg-border/40">
            <div className="bg-background/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Valor total
              </div>
              <div className="text-xl font-bold font-mono">${fmt(result.totalValorizado, 0)}</div>
              <div className="text-[10px] text-muted-foreground">
                {result.activos.length} activos
              </div>
            </div>
            <div className="bg-background/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                En ARS
              </div>
              <div className="text-xl font-bold font-mono">${fmt(result.capitalARS, 0)}</div>
              <div className="text-[10px] text-muted-foreground">
                {result.totalValorizado > 0
                  ? ((result.capitalARS / result.totalValorizado) * 100).toFixed(1)
                  : "0"}
                % del total
              </div>
            </div>
            <div className="bg-background/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                En USD
              </div>
              <div className="text-xl font-bold font-mono">${fmt(result.capitalUSD, 0)}</div>
              <div className="text-[10px] text-muted-foreground">
                {result.totalValorizado > 0
                  ? ((result.capitalUSD / result.totalValorizado) * 100).toFixed(1)
                  : "0"}
                % del total
              </div>
            </div>
            <div className="bg-background/40 p-4">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Activos con precio
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {result.activos.filter((a) => a.precio != null).length}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {result.activos.filter((a) => a.error).length} sin cotización
              </div>
            </div>
          </div>

          {/* Composition table */}
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground px-4 py-3 bg-muted/10 border-b border-border/40">
              Composición · pesos normalizados
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-[10px]">
                <thead className="text-[8px] uppercase tracking-wider text-muted-foreground bg-muted/10">
                  <tr>
                    <th className="px-3 py-2">Ticker</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                    <th className="px-3 py-2 text-right">Precio</th>
                    <th className="px-3 py-2 text-right">Var %</th>
                    <th className="px-3 py-2 text-right">Valorizado</th>
                    <th className="px-3 py-2 text-right">Peso %</th>
                    <th className="px-3 py-2 text-center">Mon</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2 text-right">Retorno anual</th>
                    <th className="px-3 py-2 text-right">Vol anual</th>
                  </tr>
                </thead>
                <tbody>
                  {result.activos.map((a) => (
                    <tr key={a.ticker} className="border-b border-border/10 hover:bg-muted/10">
                      <td className="px-3 py-2 font-semibold">
                        {a.ticker}
                        {a.error && (
                          <span className="ml-1 text-amber-400" title={a.error}>
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{a.cantidad}</td>
                      <td className="px-3 py-2 text-right">
                        {a.precio != null ? "$" + fmt(a.precio, 0) : "—"}
                      </td>
                      <td
                        className={`px-3 py-2 text-right ${a.variacionPorcentual != null ? (a.variacionPorcentual >= 0 ? "text-emerald-400" : "text-red-400") : ""}`}
                      >
                        {a.variacionPorcentual != null
                          ? (a.variacionPorcentual >= 0 ? "+" : "") +
                            a.variacionPorcentual.toFixed(2) +
                            "%"
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">${fmt(a.valorizado, 0)}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-border/20 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
                              style={{ width: Math.min(100, a.pesoPct) + "%" }}
                            />
                          </div>
                          <span className="font-semibold">{a.pesoPct.toFixed(1)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-[9px]">{a.moneda}</td>
                      <td className="px-3 py-2 text-[9px] text-muted-foreground">{a.subtipo}</td>
                      <td
                        className={`px-3 py-2 text-right ${a.retornoAnual != null ? (a.retornoAnual >= 0 ? "text-emerald-400" : "text-red-400") : ""}`}
                      >
                        {a.retornoAnual != null
                          ? (a.retornoAnual >= 0 ? "+" : "") + a.retornoAnual.toFixed(1) + "%"
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {a.volatilidadAnual != null ? a.volatilidadAnual.toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border/40 bg-muted/10">
                  <tr>
                    <td className="px-3 py-2 text-[10px] font-bold">TOTAL</td>
                    <td colSpan={3}></td>
                    <td className="px-3 py-2 text-right text-[10px] font-bold">
                      ${fmt(result.totalValorizado, 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-[10px] font-bold">100%</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Category breakdown */}
          {result.porCategoria.length > 0 && (
            <div className="rounded-lg border border-border/40 p-4">
              <div className="mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                Por categoría
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {result.porCategoria.map((c, i) => (
                  <div key={c.nombre} className="border border-border/40 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                      />
                      <span className="font-semibold">{c.nombre}</span>
                      <span className="ml-auto font-mono text-[10px]">{c.pesoPct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1 rounded-full bg-border/20 overflow-hidden mt-2">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: Math.min(100, c.pesoPct) + "%",
                          background: SECTOR_COLORS[i % SECTOR_COLORS.length],
                        }}
                      />
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-1 font-mono">
                      ${fmt(c.monto, 0)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
