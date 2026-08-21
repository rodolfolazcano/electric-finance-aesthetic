// @ts-nocheck
import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useIOLSession } from "@/lib/iol-context";
import {
  getIOLClientes,
  getIOLPortafolio,
  getIOLEstadoCuenta,
} from "@/lib/iol-portfolio.functions";
import { computeHedge, fetchAverageCCL, resolveManualPositions } from "@/lib/capm-hedge.server";
import { HedgePositionSelector } from "./HedgePositionSelector";
import { HedgeConfigPanel } from "./HedgeConfigPanel";
import { HedgeResultCard } from "./HedgeResultCard";
import { HedgeUniverseTable } from "./HedgeUniverseTable";
import { HedgeScatterChart } from "./HedgeScatterChart";
import { HedgePlainLanguagePanel } from "./HedgePlainLanguagePanel";
import {
  type HedgePosition,
  type HedgeResult,
  type HedgeConfig,
  type HedgeSource,
  type HedgeMode,
  type IOLPositionRaw,
  DEFAULT_HEDGE_CONFIG,
  FACTORS_MASTER_LIST,
  CEDEAR_RATIOS,
} from "@/lib/capm-hedge.types";
import type { IOLCliente } from "@/lib/iol-portfolio.functions";

export function HedgeTab() {
  const { accessToken, refreshToken, updateTokens } = useIOLSession();

  const [source, setSource] = useState<HedgeSource>("iol");
  const [positions, setPositions] = useState<HedgePosition[]>([]);
  const [config, setConfig] = useState<HedgeConfig>({ ...DEFAULT_HEDGE_CONFIG, availableCash: 1 });
  const [result, setResult] = useState<HedgeResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [clientes, setClientes] = useState<IOLCliente[]>([]);
  const [clienteId, setClienteId] = useState<number>(0);
  const [esAsesor, setEsAsesor] = useState<boolean | null>(null);
  const [iolAvailableCash, setIolAvailableCash] = useState<number | undefined>(undefined);

  const [plFilterEnabled, setPlFilterEnabled] = useState(true);
  const [hedgeMode, setHedgeMode] = useState<HedgeMode>("pure");
  const [gamma, setGamma] = useState(0);

  const [manualRows, setManualRows] = useState<
    Array<{ ticker: string; cantidad: number; precioPromedio?: number }>
  >([
    { ticker: "GGAL.BA", cantidad: 0, precioPromedio: undefined },
    { ticker: "YPFD.BA", cantidad: 0, precioPromedio: undefined },
    { ticker: "BMA.BA", cantidad: 0, precioPromedio: undefined },
    { ticker: "PAMP.BA", cantidad: 0, precioPromedio: undefined },
  ]);
  const [manualCash, setManualCash] = useState(1);
  const [manualErrors, setManualErrors] = useState<Array<{ ticker: string; motivo: string }>>([]);
  const [resolving, setResolving] = useState(false);

  const resolveManualFn = useServerFn(resolveManualPositions);

  const hedgeFn = useServerFn(computeHedge);
  const cclFn = useServerFn(fetchAverageCCL);
  const [cclRate, setCclRate] = useState(1200);

  const losingPositions = useMemo(
    () => positions.filter((p) => p.precioPromedio > 0 && p.plPct < -0.01),
    [positions],
  );
  const unclassifiablePositions = useMemo(
    () => positions.filter((p) => p.precioPromedio <= 0),
    [positions],
  );
  const selectedPositions = useMemo(() => {
    const selected = positions.filter((p) => p.selected);
    if (!plFilterEnabled) return selected;
    // En modo filtro: solo posiciones con plPct negativo (excluir no clasificables)
    return selected.filter((p) => p.precioPromedio > 0 && p.plPct < -0.01);
  }, [positions, plFilterEnabled]);
  const portfolioValorizado = useMemo(
    () => positions.reduce((s, p) => s + p.valorUSD, 0),
    [positions],
  );

  const loadClientes = useCallback(async () => {
    if (!accessToken) {
      setError("Debe iniciar sesión en IOL primero");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await getIOLClientes({ data: { token: accessToken, refreshToken } });
      if (res.newToken && res.newRefreshToken) updateTokens(res.newToken, res.newRefreshToken);
      setClientes(res.data ?? []);
      setEsAsesor((res.data ?? []).length > 0);
      if ((res.data ?? []).length > 0) setClienteId(res.data[0].id);
    } catch (e) {
      setEsAsesor(false);
      setClientes([]);
    }
    setLoading(false);
  }, [accessToken, refreshToken, updateTokens]);

  const loadIOLPortfolio = useCallback(async () => {
    if (!accessToken) {
      setError("Debe iniciar sesión en IOL primero");
      return;
    }
    if (esAsesor === true && !clienteId) {
      setError("Seleccione un cliente IOL");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // Fetch real-time CCL rate
      let tipoCambio = 1200;
      try {
        const cclRes = await cclFn();
        if (cclRes?.ccl && cclRes.ccl > 0) {
          tipoCambio = cclRes.ccl;
          setCclRate(tipoCambio);
        }
      } catch {
        /* fallback to 1200 */
      }

      const [portRes, estadoRes] = await Promise.all([
        getIOLPortafolio({
          data: {
            token: accessToken,
            refreshToken,
            clienteId: esAsesor ? clienteId : undefined,
            pais: "Argentina",
          },
        }),
        esAsesor
          ? getIOLEstadoCuenta({ data: { token: accessToken, refreshToken, clienteId } })
          : Promise.resolve({ data: {} }),
      ]);
      if (portRes.newToken)
        updateTokens(portRes.newToken, portRes.newRefreshToken ?? refreshToken ?? "");

      // The Asesores/Portafolio endpoint returns { pais, activos: IOLActivo[] }
      // while the regular portafolio endpoint returns the array directly
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw: any = portRes.data;
      const activos: any[] = Array.isArray(raw) ? raw : (raw?.activos ?? []);

      // Extract available cash from EstadoDeCuenta (the Asesores return shape may differ)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ec: any = estadoRes.data ?? {};
      const cuentas: any[] = ec.cuentas ?? [];
      // Handle multiple currency accounts from EstadoDeCuenta
      let totalUsdCash = 0;
      for (const c of cuentas) {
        const moneda = (c.moneda ?? "").toLowerCase();
        const disp = c.disponible ?? c.saldo ?? 0;
        if (moneda.includes("dolar") || moneda.includes("usd")) {
          totalUsdCash += disp;
        } else {
          totalUsdCash += disp / tipoCambio;
        }
        if (c.saldos?.[0]?.disponibleOperar) {
          if (moneda.includes("dolar")) totalUsdCash += c.saldos[0].disponibleOperar;
          else totalUsdCash += c.saldos[0].disponibleOperar / tipoCambio;
        }
      }
      if (totalUsdCash === 0) totalUsdCash = ec.disponibleOperar ?? 0;
      setIolAvailableCash(totalUsdCash > 0 ? +totalUsdCash.toFixed(4) : undefined);

      const isArs = (m: string) => {
        const ml = (m ?? "").toLowerCase();
        return ml === "peso_argentino" || ml === "pesos" || ml === "ars";
      };
      const NYSE_LIST = new Set([
        "GGAL",
        "BMA",
        "SUPV",
        "YPF",
        "PAM",
        "EDN",
        "TEO",
        "CEPU",
        "IRS",
        "LOMA",
        "CRESY",
        "BIOX",
      ]);
      const NASDAQ_LIST = new Set(["MELI", "MERC", "DESK"]);
      const mapped: HedgePosition[] = activos
        .map((p: any) => {
          const ultimoPrecio = p.ultimoPrecio ?? 0;
          const precioPromedio = p.ppc ?? 0;
          const cantidad = p.cantidad ?? 0;
          const valorizado = p.valorizado ?? 0;
          const moneda = p.titulo?.moneda ?? p.moneda ?? "ARS";
          const plPct = p.gananciaPorcentual ?? p.gananciaPorcentaje ?? 0;
          const plVal = p.gananciaNumeraria ?? p.gananciaDinero ?? 0;
          const ticker = p.simbolo ?? p.titulo?.simbolo ?? "";
          const esArs = isArs(moneda);
          const valorUSD = esArs ? valorizado / tipoCambio : valorizado;
          const plUSD = esArs ? plVal / tipoCambio : plVal;
          const ultimoUSD = esArs ? ultimoPrecio / tipoCambio : ultimoPrecio;
          const ppcUSD = esArs ? precioPromedio / tipoCambio : precioPromedio;
          // Infer mercadoOrigen
          const hasBA = ticker.endsWith(".BA");
          const baseTicker = hasBA ? ticker.slice(0, -3) : ticker;
          let mercadoOrigen: "BCBA-LOCAL" | "BCBA-CEDEAR" | "NYSE" | "NASDAQ" = "NYSE";
          if (hasBA) {
            const ratio = CEDEAR_RATIOS[baseTicker];
            mercadoOrigen = ratio ? "BCBA-CEDEAR" : "BCBA-LOCAL";
          } else if (NASDAQ_LIST.has(baseTicker)) {
            mercadoOrigen = "NASDAQ";
          } else if (!NYSE_LIST.has(baseTicker)) {
            mercadoOrigen = "NYSE";
          }
          return {
            ticker,
            description: p.titulo?.descripcion ?? p.descripcion ?? ticker,
            cantidad,
            precioPromedio: ppcUSD,
            ultimoPrecio: ultimoUSD,
            valorUSD: +(valorUSD || cantidad * ultimoUSD).toFixed(2),
            valorARS: esArs ? +valorizado.toFixed(2) : 0,
            moneda: esArs ? "ARS" : "USD",
            plPct: +(plPct ?? 0).toFixed(2),
            plUSD: +(plUSD ?? 0).toFixed(2),
            selected: (plPct ?? 0) < -0.01,
            mercadoOrigen,
          };
        })
        .filter((p) => p.ticker);

      if (mapped.length === 0) {
        setError("No se encontraron posiciones con datos válidos en el portafolio IOL");
      } else {
        setPositions(mapped);
        setError("");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(`Error al cargar portafolio IOL: ${msg}`);
    }
    setLoading(false);
  }, [accessToken, refreshToken, clienteId, esAsesor, updateTokens, cclFn]);

  const loadManualPositions = useCallback(async () => {
    const validRows = manualRows.filter((r) => r.ticker.trim() && r.cantidad > 0);
    if (validRows.length === 0) {
      setError("Ingrese al menos un ticker con cantidad > 0");
      return;
    }
    setResolving(true);
    setError("");
    setManualErrors([]);
    try {
      const res = await resolveManualFn({
        data: {
          items: validRows.map((r) => ({
            ticker: r.ticker.toUpperCase().trim(),
            cantidad: r.cantidad,
            ...(r.precioPromedio != null && r.precioPromedio > 0
              ? { precioPromedio: r.precioPromedio }
              : {}),
          })),
        },
      });
      setManualErrors(res.errors ?? []);
      if (res.data.length > 0) {
        setPositions(res.data);
        setConfig((c) => ({ ...c, availableCash: manualCash }));
      } else {
        setError("No se pudo resolver ninguna posición. Verifique los tickers.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al resolver posiciones");
    } finally {
      setResolving(false);
    }
  }, [manualRows, manualCash, resolveManualFn]);

  useEffect(() => {
    if (accessToken && esAsesor === null) loadClientes();
  }, [accessToken, esAsesor, loadClientes]);

  const togglePosition = (ticker: string) => {
    setPositions((prev) =>
      prev.map((p) => (p.ticker === ticker ? { ...p, selected: !p.selected } : p)),
    );
  };

  const selectAllNegative = () => {
    setPositions((prev) => prev.map((p) => ({ ...p, selected: p.plPct < -0.01 })));
  };

  const m = useMutation({
    mutationFn: async () => {
      if (selectedPositions.length === 0)
        throw new Error("Seleccione al menos una posición para cubrir");
      // Resolve auto-detect: replace __AUTO__ with all FACTORS_MASTER_LIST tickers
      const resolvedBenchmarks =
        config.benchmarks.length === 1 && config.benchmarks[0] === "__AUTO__"
          ? Object.keys(FACTORS_MASTER_LIST)
          : config.benchmarks;
      const fn = await hedgeFn({
        data: {
          positions: selectedPositions.map((p) => ({
            ticker: p.ticker,
            description: p.description,
            valorUSD: p.valorUSD,
            moneda: p.moneda,
          })),
          benchmarks: resolvedBenchmarks,
          universe: config.universe,
          manualUniverseTickers: config.manualUniverseTickers,
          period: config.period,
          lambda: config.lambda,
          availableCash: config.availableCash,
          hedgeType: config.hedgeType,
          tasaCaucionAnual: config.tasaCaucionAnual ?? 0.35,
          hedgeMode,
          gamma,
        },
      });
      setResult(fn);
      return fn;
    },
    onError: (e: Error) => setError(e.message),
  });

  const selectedUniverseTickers = useMemo(() => {
    return new Set(result?.universoTabla?.filter((a) => a.selected).map((a) => a.ticker) ?? []);
  }, [result]);

  const toggleUniverseAsset = (ticker: string) => {
    if (!result) return;
    const updated = result.universoTabla.map((a) =>
      a.ticker === ticker ? { ...a, selected: !a.selected } : a,
    );
    setResult({ ...result, universoTabla: updated });
  };

  return (
    <div className="space-y-5">
      {/* Source selector */}
      <div className="flex gap-1.5 border-b border-border/40 pb-2">
        {[
          { value: "iol" as const, label: "Portafolio IOL" },
          { value: "manual" as const, label: "Portafolio Manual" },
        ].map((s) => (
          <button
            key={s.value}
            onClick={() => {
              setSource(s.value);
              setResult(null);
              setPositions([]);
              setError("");
            }}
            className={`font-mono text-[11px] px-3 py-1.5 rounded-md border transition-colors ${
              source === s.value
                ? "border-primary/60 bg-primary/10 text-foreground"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Source-specific panels */}
      {source === "iol" && (
        <div className="flex flex-wrap items-center gap-2">
          {esAsesor === null ? (
            <button
              onClick={loadClientes}
              disabled={loading || !accessToken}
              className="rounded bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {loading ? "Verificando tipo de cuenta..." : "Conectar portafolio IOL"}
            </button>
          ) : (
            <>
              {esAsesor && clientes.length > 0 && (
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(Number(e.target.value))}
                  className="rounded border border-border/40 bg-background px-2 py-1 font-mono text-[11px] outline-none"
                >
                  <option value={0}>Seleccionar cliente...</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} {c.apellido} — ${c.totalCuentaValorizado?.toLocaleString() ?? 0}
                    </option>
                  ))}
                </select>
              )}
              {!esAsesor && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  Cuenta particular — se usará tu portafolio
                </span>
              )}
              <button
                onClick={() => loadIOLPortfolio()}
                disabled={loading || (esAsesor && !clienteId)}
                className="rounded bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
              >
                {loading ? "Cargando..." : "Cargar posiciones"}
              </button>
              <button
                onClick={loadClientes}
                className="rounded border border-border/40 px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground"
              >
                Recargar
              </button>
            </>
          )}
          {!accessToken && (
            <span className="font-mono text-[11px] text-warning">
              inicie sesión IOL en el header
            </span>
          )}
        </div>
      )}

      {source === "manual" && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border/40">
            <table className="w-full text-left font-mono text-[11px]">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2">Ticker</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                  <th className="px-3 py-2 text-right">Pprome. (USD)</th>
                  <th className="w-10 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {manualRows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-border/20 transition-colors hover:bg-muted/10"
                  >
                    <td className="px-3 py-1.5">
                      <input
                        value={row.ticker}
                        onChange={(e) => {
                          const next = [...manualRows];
                          next[i] = { ...next[i], ticker: e.target.value.toUpperCase() };
                          setManualRows(next);
                        }}
                        placeholder="GGAL.BA"
                        className="w-32 rounded border border-border/40 bg-background px-2 py-1 font-mono text-[11px] outline-none focus:border-primary/60"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={row.cantidad || ""}
                        onChange={(e) => {
                          const next = [...manualRows];
                          next[i] = {
                            ...next[i],
                            cantidad: Math.max(0, parseInt(e.target.value) || 0),
                          };
                          setManualRows(next);
                        }}
                        placeholder="0"
                        className="w-24 rounded border border-border/40 bg-background px-2 py-1 font-mono text-[11px] text-right outline-none focus:border-primary/60"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={row.precioPromedio ?? ""}
                        onChange={(e) => {
                          const next = [...manualRows];
                          const val = parseFloat(e.target.value);
                          next[i] = { ...next[i], precioPromedio: isNaN(val) ? undefined : val };
                          setManualRows(next);
                        }}
                        placeholder="auto"
                        className="w-24 rounded border border-border/40 bg-background px-2 py-1 font-mono text-[11px] text-right outline-none focus:border-primary/60"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => setManualRows((prev) => prev.filter((_, j) => j !== i))}
                        className="font-mono text-[11px] text-muted-foreground hover:text-danger transition-colors"
                        title="Eliminar fila"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() =>
                setManualRows((prev) => [
                  ...prev,
                  { ticker: "", cantidad: 0, precioPromedio: undefined },
                ])
              }
              className="rounded border border-border/40 px-2.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              + Agregar fila
            </button>

            <div className="ml-auto space-y-1">
              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Saldo USD
              </label>
              <input
                type="number"
                min="0"
                step="0.1"
                value={manualCash}
                onChange={(e) => setManualCash(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-24 rounded border border-border/40 bg-background px-2 py-1.5 font-mono text-[11px] outline-none focus:border-primary/60"
              />
            </div>

            <button
              onClick={loadManualPositions}
              disabled={resolving}
              className="rounded bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-50"
            >
              {resolving ? "Resolviendo..." : "Cargar posiciones"}
            </button>
          </div>

          {manualErrors.length > 0 && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 font-mono text-[11px] text-warning">
              {manualErrors.map((e) => (
                <div key={e.ticker}>
                  <strong>{e.ticker}:</strong> {e.motivo}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 1: Position Selection */}
      {positions.length > 0 && (
        <HedgePositionSelector
          positions={positions}
          onToggle={togglePosition}
          onSelectAllNegative={selectAllNegative}
          source={source}
        />
      )}

      {/* Step 2: Config */}
      {positions.length > 0 && (
        <>
          <HedgeConfigPanel
            config={config}
            onChange={setConfig}
            source={source}
            iolAvailableCash={iolAvailableCash}
          />

          {/* P&L Filter toggle */}
          <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/20 px-3 py-2">
            <label className="flex items-center gap-2 font-mono text-[11px] cursor-pointer">
              <input
                type="checkbox"
                checked={plFilterEnabled}
                onChange={() => setPlFilterEnabled((v) => !v)}
                className="h-3.5 w-3.5 accent-primary"
              />
              Solo posiciones en pérdida (plPct &lt; 0%)
            </label>
            {plFilterEnabled && (
              <span className="font-mono text-[10px] text-muted-foreground">
                {losingPositions.length} de {positions.length} posiciones seleccionables
                {unclassifiablePositions.length > 0 &&
                  ` (${unclassifiablePositions.length} sin precioPromedio — excluidas)`}
              </span>
            )}
          </div>

          {/* Modo 2: Hedge mode + gamma */}
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border/40 bg-background/20 px-3 py-2">
            <div className="space-y-1">
              <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Modo de optimización
              </label>
              <div className="flex gap-1.5">
                {[
                  { value: "pure" as const, label: "Neutralización pura" },
                  { value: "alpha" as const, label: "Neutralización + Alfa" },
                ].map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setHedgeMode(m.value)}
                    className={`font-mono text-[11px] px-2.5 py-1 rounded border transition-colors ${
                      hedgeMode === m.value
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {hedgeMode === "alpha" && (
              <div className="space-y-1">
                <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  γ (gamma): {gamma.toFixed(2)}
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.05"
                  value={gamma}
                  onChange={(e) => setGamma(parseFloat(e.target.value))}
                  className="w-28 h-1.5 accent-primary cursor-pointer"
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Calculate button */}
      {positions.length > 0 && (
        <button
          onClick={() => m.mutate()}
          disabled={m.isPending || selectedPositions.length === 0}
          className="w-full rounded bg-primary px-4 py-2 font-mono text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {m.isPending ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
              Calculando cobertura...
            </span>
          ) : (
            `Calcular Cobertura (${selectedPositions.length} posiciones${result?.failedPositions?.length ? `, ${result.failedPositions.length} fallaron` : ""})`
          )}
        </button>
      )}

      {error && (
        <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-[11px] text-danger">
          {error}
        </div>
      )}

      {/* Step 3: Results */}
      {result && (
        <div className="space-y-5">
          {result.coberturaParcial && (
            <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 font-mono text-[11px] text-warning">
              Saldo insuficiente para cobertura total. Se calculó cobertura parcial al{" "}
              {result.coberturaPct}% (${result.totalCosto.toFixed(2)} de $
              {result.totalSaldoDisponible.toFixed(2)} disponibles)
            </div>
          )}

          {result.failedPositions && result.failedPositions.length > 0 && (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-[11px] text-danger">
              No se pudo calcular cobertura para:
              {result.failedPositions.map((f) => (
                <span key={f.ticker} className="ml-1">
                  {f.ticker} ({f.motivo})
                </span>
              ))}
            </div>
          )}

          {(result as any).alphaDisclaimer && (
            <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 font-mono text-[10px] text-warning">
              {(result as any).alphaDisclaimer}
            </div>
          )}

          {result.excludedTickers && result.excludedTickers.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/10 px-4 py-2 font-mono text-[10px] text-muted-foreground">
              Tickers excluidos por datos insuficientes: {result.excludedTickers.join(", ")}
            </div>
          )}

          <HedgePlainLanguagePanel
            result={result}
            availableCash={config.availableCash}
            portfolioValorizado={portfolioValorizado}
          />

          {/* Portfolio equity curve vs benchmark */}
          {(result as any).portfolioEquityCurve &&
            (result as any).portfolioEquityCurve.length > 0 && (
              <div className="rounded-lg border border-border/40 bg-background/20 p-3">
                <h3 className="mb-2 font-mono text-xs font-medium text-foreground">
                  Desempeño histórico — Cartera de cobertura vs Benchmark
                </h3>
                <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                  Series normalizadas a base 100. Cartera = activos recomendados ponderados por
                  monto.
                </p>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={(result as any).portfolioEquityCurve}
                      margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="grad-hedge-port" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="grad-hedge-bm" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2b3242" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={(d: string) => {
                          const dt = new Date(d + "T00:00:00");
                          return dt.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
                        }}
                        tick={{ fill: "#9aa6bd", fontSize: 9, fontFamily: "JetBrains Mono" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        domain={["auto", "auto"]}
                        tick={{ fill: "#9aa6bd", fontSize: 9, fontFamily: "JetBrains Mono" }}
                        axisLine={false}
                        tickLine={false}
                        width={50}
                      />
                      <Tooltip
                        content={({ active, payload, label }: any) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-surface border border-border/60 rounded-md p-2 text-xs font-mono space-y-1 shadow-lg">
                              <p className="text-muted-foreground">{label}</p>
                              {payload.map((p: any) => (
                                <p key={p.name} style={{ color: p.color }}>
                                  {p.name === "portfolio" ? "Cartera" : "Benchmark"}:{" "}
                                  {p.value.toFixed(2)}
                                </p>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="benchmark"
                        stroke="#6366f1"
                        strokeWidth={1}
                        fill="url(#grad-hedge-bm)"
                        dot={false}
                        name="benchmark"
                      />
                      <Area
                        type="monotone"
                        dataKey="portfolio"
                        stroke="#10b981"
                        strokeWidth={1.5}
                        fill="url(#grad-hedge-port)"
                        dot={false}
                        name="portfolio"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

          <div className="space-y-1">
            <h3 className="font-mono text-xs font-medium text-foreground">
              Resultados por posición cubierta
            </h3>
            <div className="grid grid-cols-1 gap-3">
              {result.results.map((r) => (
                <HedgeResultCard key={r.position.ticker} result={r} />
              ))}
            </div>
          </div>

          {result.ordenesConsolidadas && result.ordenesConsolidadas.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-muted/5 p-4">
              <h3 className="mb-2 font-mono text-xs font-medium text-foreground">
                Órdenes consolidadas a ejecutar
              </h3>
              <p className="mb-2 font-mono text-[10px] text-muted-foreground">
                Montos totales por instrumento sumando todas las posiciones cubiertas.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[11px]">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <th className="px-2 py-1">Instrumento</th>
                      <th className="px-2 py-1">Tipo</th>
                      <th className="px-2 py-1 text-right">Monto Total USD</th>
                      <th className="px-2 py-1 text-right">Cantidad Total</th>
                      <th className="px-2 py-1 text-right">Mercado</th>
                      <th className="px-2 py-1">Cubre a</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.ordenesConsolidadas.map((o) => (
                      <tr key={o.ticker} className="border-b border-border/10">
                        <td className="px-2 py-1 font-semibold text-foreground">{o.ticker}</td>
                        <td className="px-2 py-1 text-muted-foreground">{o.tipo}</td>
                        <td className="px-2 py-1 text-right text-danger">
                          -${o.montoUSDTotal.toFixed(2)}
                        </td>
                        <td className="px-2 py-1 text-right text-foreground">{o.cantidadTotal}</td>
                        <td className="px-2 py-1 text-right text-muted-foreground">
                          {o.mercadoEjecucion}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">
                          {o.posicionesQueLoUsan.join(", ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <HedgeScatterChart
              assets={result.universoTabla}
              selectedTickers={selectedUniverseTickers}
            />
            <HedgeUniverseTable
              assets={result.universoTabla}
              selectedTickers={selectedUniverseTickers}
              onToggle={toggleUniverseAsset}
            />
          </div>
        </div>
      )}
    </div>
  );
}
