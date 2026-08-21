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
    <div className="space-y-6">
      <div className="mono text-[14px] uppercase tracking-[0.16em] text-muted-foreground">
        Análisis del Portafolio — pesos normalizados con precio real de cotización
      </div>

      {/* Selector de cliente asesor — recicla useIOLPortafolio (getIOLClientes) */}
      {iol.accessToken && (
        <div className="rounded-lg border border-border/40 bg-muted/5 p-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="mono text-[14px] uppercase tracking-[0.16em] text-muted-foreground">
              {iol.esAsesor
                ? `Clientes asesorados — ${iol.clientes.length} ${iol.loading ? "(cargando…)" : ""}`
                : iol.esAsesor === false
                  ? "Cuenta personal IOL"
                  : "Cuenta IOL"}
            </span>
            <button
              onClick={() => iol.loadClientes()}
              disabled={iol.loading}
              className="mono text-[14px] uppercase tracking-wider border border-border/40 bg-background/40 px-2 py-1 rounded-md hover:bg-muted/20 disabled:opacity-50"
            >
              {iol.loading ? "Actualizando…" : "Refrescar clientes"}
            </button>
          </div>

          {iol.error && (
            <p className="text-[14px] text-amber-400 font-mono border border-amber-500/20 bg-amber-500/5 rounded px-2 py-1">
              {iol.error}
            </p>
          )}

          {iol.esAsesor ? (
            <>
              {iol.clientes.length > 0 ? (
                <>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={iol.clienteId}
                      onChange={(e) => iol.setClienteId(Number(e.target.value))}
                      className="flex-1 bg-background/60 border border-border/40 rounded-md px-2 py-1.5 text-xs font-mono outline-none focus:border-primary/60"
                    >
                      <option value={0}>— Seleccionar cliente —</option>
                      {iol.clientes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre} {c.apellido} — #{c.id} · ${Number(c.totalCuentaValorizado ?? 0).toLocaleString("es-AR")}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={cargarDesdeIOL}
                      disabled={loadingIOL || !iol.clienteId}
                      title={!iol.clienteId ? "Seleccioná un cliente primero" : "Cargar portafolio del cliente seleccionado"}
                      className="mono text-[14px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-md hover:bg-blue-500/20 disabled:opacity-50 whitespace-nowrap"
                    >
                      {loadingIOL ? "Cargando…" : iol.clienteId ? "Cargar cliente seleccionado" : "Elegí un cliente"}
                    </button>
                  </div>

                  <div className="overflow-x-auto rounded border border-border/20 max-h-64 overflow-y-auto">
                    <table className="w-full text-left font-mono text-[14px]">
                      <thead className="sticky top-0 bg-muted/20 text-[14px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-2 py-1.5">Cliente</th>
                          <th className="px-2 py-1.5">ID</th>
                          <th className="px-2 py-1.5 text-right">Valorizado</th>
                          <th className="px-2 py-1.5 text-right"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {iol.clientes.map((c) => (
                          <tr
                            key={c.id}
                            className={`border-b border-border/10 hover:bg-muted/10 ${iol.clienteId === c.id ? "bg-primary/5" : ""}`}
                          >
                            <td className="px-2 py-1.5 font-semibold">
                              {c.nombre} {c.apellido}
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground">#{c.id}</td>
                            <td className="px-2 py-1.5 text-right">${Number(c.totalCuentaValorizado ?? 0).toLocaleString("es-AR")}</td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                onClick={async () => {
                                  iol.setClienteId(c.id);
                                  setLoadingIOL(true);
                                  setError("");
                                  try {
                                    const activos = (await iol.loadPortfolio(c.id)) as IOLActivo[];
                                    const validos = activos
                                      .filter((a) => a?.cantidad > 0 && a?.titulo?.simbolo)
                                      .map((a) => ({ id: genId(), ticker: a.titulo.simbolo, cantidad: a.cantidad }));
                                    if (validos.length === 0) {
                                      setError(`No hay posiciones con cantidad > 0 para ${c.nombre} ${c.apellido} (#${c.id}).`);
                                      return;
                                    }
                                    setRows(validos);
                                    setResult(null);
                                  } catch (e) {
                                    setError(e instanceof Error ? e.message : "Error al cargar el portafolio del cliente.");
                                  } finally {
                                    setLoadingIOL(false);
                                  }
                                }}
                                disabled={loadingIOL}
                                className={`text-[14px] px-2 py-1 rounded border disabled:opacity-50 ${iol.clienteId === c.id ? "bg-primary text-primary-foreground border-primary" : "border-border/40 hover:bg-muted/20"}`}
                              >
                                {iol.clienteId === c.id ? "Seleccionado" : "Ver"}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!iol.clienteId && (
                    <p className="text-[14px] text-amber-400/80 font-mono">
                      Seleccioná un cliente de la lista para cargar su portafolio. El botón “Cargar portafolio IOL” ahora respeta el cliente seleccionado.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground font-mono">
                  {iol.loading
                    ? "Buscando clientes asesorados…"
                    : "No se encontraron clientes asesorados. Verificá que tu usuario IOL sea de tipo Asesor."}
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground font-mono">
              Cuenta personal detectada. El botón “Cargar portafolio IOL” traerá tu portafolio propio.
            </p>
          )}
        </div>
      )}

      {/* Input */}
      <div className="rounded-lg border border-border/40 p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="mono text-[14px] uppercase tracking-[0.16em] text-muted-foreground">
            Composición actual (ticker + cantidad)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={cargarDesdeIOL}
              disabled={loadingIOL}
              className="mono text-[14px] uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2 py-1 rounded-md hover:bg-blue-500/20 disabled:opacity-50"
            >
              {loadingIOL ? "Cargando IOL…" : iol.clienteId ? "Cargar cliente seleccionado" : "Cargar portafolio IOL"}
            </button>
            <button
              onClick={addRow}
              className="mono text-[14px] uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-md hover:bg-emerald-500/20"
            >
              + Agregar
            </button>
          </div>
        </div>
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left font-mono text-[14px]">
            <thead className="text-[14px] uppercase tracking-wider text-muted-foreground bg-muted/10">
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
                      className="w-36 bg-background/40 border border-border/40 rounded px-1.5 py-1 text-[14px] outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      type="number"
                      min={0}
                      value={row.cantidad || ""}
                      onChange={(e) => updateRow(row.id, "cantidad", +e.target.value || 0)}
                      className="w-24 text-right bg-background/40 border border-border/40 rounded px-1.5 py-1 text-[14px] outline-none focus:border-primary/60"
                    />
                  </td>
                  <td className="px-2 py-1 text-center">
                    {rows.length > 1 && (
                      <button
                        onClick={() => removeRow(row.id)}
                        className="text-red-400/60 hover:text-red-400 text-xs"
                      >
                        
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-[14px] text-muted-foreground">
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
          <div className="grid w-full grid-cols-2 md:grid-cols-4 gap-1 rounded-lg border border-border/40 overflow-hidden bg-border/40">
            <div className="bg-background/40 p-6">
              <div className="text-[14px] uppercase tracking-wider text-muted-foreground">
                Valor total
              </div>
              <div className="text-xl font-bold font-mono">${fmt(result.totalValorizado, 0)}</div>
              <div className="text-[14px] text-muted-foreground">
                {result.activos.length} activos
              </div>
            </div>
            <div className="bg-background/40 p-6">
              <div className="text-[14px] uppercase tracking-wider text-muted-foreground">
                En ARS
              </div>
              <div className="text-xl font-bold font-mono">${fmt(result.capitalARS, 0)}</div>
              <div className="text-[14px] text-muted-foreground">
                {result.totalValorizado > 0
                  ? ((result.capitalARS / result.totalValorizado) * 100).toFixed(1)
                  : "0"}
                % del total
              </div>
            </div>
            <div className="bg-background/40 p-6">
              <div className="text-[14px] uppercase tracking-wider text-muted-foreground">
                En USD
              </div>
              <div className="text-xl font-bold font-mono">${fmt(result.capitalUSD, 0)}</div>
              <div className="text-[14px] text-muted-foreground">
                {result.totalValorizado > 0
                  ? ((result.capitalUSD / result.totalValorizado) * 100).toFixed(1)
                  : "0"}
                % del total
              </div>
            </div>
            <div className="bg-background/40 p-6">
              <div className="text-[14px] uppercase tracking-wider text-muted-foreground">
                Activos con precio
              </div>
              <div className="text-xl font-bold font-mono text-emerald-400">
                {result.activos.filter((a) => a.precio != null).length}
              </div>
              <div className="text-[14px] text-muted-foreground">
                {result.activos.filter((a) => a.error).length} sin cotización
              </div>
            </div>
          </div>

          {/* Composition table */}
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <div className="mono text-[14px] uppercase tracking-[0.16em] text-muted-foreground px-4 py-3 bg-muted/10 border-b border-border/40">
              Composición · pesos normalizados
            </div>
            <div className="overflow-x-auto w-full">
              <table className="w-full text-left font-mono text-[14px]">
                <thead className="text-[14px] uppercase tracking-wider text-muted-foreground bg-muted/10">
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
                      <td className="px-3 py-2 text-center text-[14px]">{a.moneda}</td>
                      <td className="px-3 py-2 text-[14px] text-muted-foreground">{a.subtipo}</td>
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
                    <td className="px-3 py-2 text-[14px] font-bold">TOTAL</td>
                    <td colSpan={3}></td>
                    <td className="px-3 py-2 text-right text-[14px] font-bold">
                      ${fmt(result.totalValorizado, 0)}
                    </td>
                    <td className="px-3 py-2 text-right text-[14px] font-bold">100%</td>
                    <td colSpan={4}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Category breakdown */}
          {result.porCategoria.length > 0 && (
            <div className="rounded-lg border border-border/40 p-6">
              <div className="mono text-[14px] uppercase tracking-[0.16em] text-muted-foreground mb-3">
                Por categoría
              </div>
              <div className="grid w-full grid-cols-1 sm:grid-cols-3 gap-2">
                {result.porCategoria.map((c, i) => (
                  <div key={c.nombre} className="border border-border/40 rounded-lg p-5">
                    <div className="flex items-center gap-2 text-[14px]">
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full"
                        style={{ background: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                      />
                      <span className="font-semibold">{c.nombre}</span>
                      <span className="ml-auto font-mono text-[14px]">{c.pesoPct.toFixed(1)}%</span>
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
                    <div className="text-[14px] text-muted-foreground mt-1 font-mono">
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
