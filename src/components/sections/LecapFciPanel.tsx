// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchLecapFciData,
  type LecapFciResult,
  type LecapItem,
  type FciItem,
  type InflacionData,
} from "@/lib/fci-lecap.functions";

function fmtNum(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
function fmtPct(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}
function fmtFecha(fecha: string): string {
  if (!fecha) return "\u2014";
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

type SortDir = "asc" | "desc";

function sortByKey<T>(arr: T[], key: keyof T, dir: SortDir): T[] {
  return [...arr].sort((a, b) => {
    const va = a[key];
    const vb = b[key];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    let cmp = 0;
    if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else if (typeof va === "string" && typeof vb === "string") {
      cmp = va.localeCompare(vb);
    } else {
      cmp = String(va).localeCompare(String(vb));
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

interface LecapFciPanelProps {
  mode: "lecaps" | "fcis";
  accessToken?: string | null;
  posiciones: Array<{
    ticker: string;
    cantidad: number;
    vn: number;
    precio: number;
    total: number;
  }>;
  onAdd: (item: { ticker: string; vn: string; precio: string }) => void;
  onRemove: (ticker: string) => void;
}

export function LecapFciPanel({
  mode,
  accessToken,
  posiciones,
  onAdd,
  onRemove,
}: LecapFciPanelProps) {
  const [data, setData] = useState<LecapFciResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState<string>("todas");
  const [filtroHorizonte, setFiltroHorizonte] = useState<string>("todos");
  const [filtroLecapMinTEM, setFiltroLecapMinTEM] = useState<string>("");
  const [filtroLecapTNAreal, setFiltroLecapTNAreal] = useState<string>("todos");
  const [badlar, setBadlar] = useState<number | null>(null);
  const [tm20, setTm20] = useState<number | null>(null);
  const [riesgoPais, setRiesgoPais] = useState<number | null>(null);
  const [riesgoPaisFecha, setRiesgoPaisFecha] = useState<string>("");

  const [lecapSortKey, setLecapSortKey] = useState<keyof LecapItem>("vpv");
  const [lecapSortDir, setLecapSortDir] = useState<SortDir>("desc");
  const [fciSortKey, setFciSortKey] = useState<keyof FciItem>("patrimonio");
  const [fciSortDir, setFciSortDir] = useState<SortDir>("desc");

  const fnData = useServerFn(fetchLecapFciData);

  function toggleLecapSort(key: keyof LecapItem) {
    if (lecapSortKey === key) setLecapSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setLecapSortKey(key);
      setLecapSortDir("desc");
    }
  }

  function toggleFciSort(key: keyof FciItem) {
    if (fciSortKey === key) setFciSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setFciSortKey(key);
      setFciSortDir("desc");
    }
  }

  const loadDataRef = useRef(false);

  function loadData() {
    if (loading || loadDataRef.current) return;
    loadDataRef.current = true;
    setLoading(true);
    const timeout = setTimeout(() => {
      setLoading(false);
    }, 30000);
    Promise.allSettled([
      fnData({ data: { sessionId: accessToken || undefined } }),
      // BCRA BADLAR (variable 7)
      fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // BCRA TM20 (variable 8)
      fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/8")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      // Riesgo País
      fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([r, badlarRes, tm20Res, rpRes]) => {
        if (r.status === "fulfilled") setData(r.value);
        if (badlarRes.status === "fulfilled" && badlarRes.value?.results?.[0]?.detalle) {
          const d = badlarRes.value.results[0].detalle;
          if (d.length > 0) setBadlar(d[d.length - 1].valor);
        }
        if (tm20Res.status === "fulfilled" && tm20Res.value?.results?.[0]?.detalle) {
          const d = tm20Res.value.results[0].detalle;
          if (d.length > 0) setTm20(d[d.length - 1].valor);
        }
        if (rpRes.status === "fulfilled" && rpRes.value?.valor != null) {
          setRiesgoPais(rpRes.value.valor);
          setRiesgoPaisFecha(rpRes.value.fecha ?? "");
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        setLoading(false);
        loadDataRef.current = false;
      });
  }

  useEffect(() => {
    loadData();
  }, []);

  const lecaps = data?.lecaps ?? [];
  const fcis = data?.fcis ?? [];
  const inflacion = data?.inflacion ?? { mensual: null, anual: null, acumulada: null };

  const fcisFiltrados = useMemo(() => {
    let filtered = fcis.filter((f) => {
      if (filtroTipo !== "todas" && f.tipo !== filtroTipo) return false;
      if (filtroHorizonte !== "todos" && f.horizonte !== filtroHorizonte) return false;
      return true;
    });
    return sortByKey(filtered, fciSortKey, fciSortDir);
  }, [fcis, filtroTipo, filtroHorizonte, fciSortKey, fciSortDir]);

  const lecapsFiltradas = useMemo(() => {
    let filtered = lecaps.filter((l) => {
      if (filtroLecapMinTEM) {
        const min = parseFloat(filtroLecapMinTEM);
        if (!isNaN(min) && l.tem < min) return false;
      }
      if (filtroLecapTNAreal === "positiva" && l.tnaReal != null && l.tnaReal <= 0) return false;
      if (filtroLecapTNAreal === "negativa" && l.tnaReal != null && l.tnaReal >= 0) return false;
      return true;
    });
    return sortByKey(filtered, lecapSortKey, lecapSortDir);
  }, [lecaps, filtroLecapMinTEM, filtroLecapTNAreal, lecapSortKey, lecapSortDir]);

  const enPortafolio = (ticker: string) => posiciones.some((p) => p.ticker === ticker);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">
            {mode === "lecaps" ? `LECAPs · ${lecaps.length} activas` : `FCIs · ${fcis.length} disponibles`}
          </div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            {mode === "lecaps"
              ? `${lecaps.length} LECAPs · ${posiciones.length} en portafolio`
              : `${fcis.length} FCIs · ${posiciones.length} en portafolio`}
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="mono rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[14px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      {data && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="mono mb-2 text-[13px] uppercase tracking-[0.15em] text-muted-foreground">
            Inflacin de referencia
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
              <span className="text-muted-foreground">Mensual: </span>
              <span className="text-yellow-400 font-mono">{fmtPct(inflacion.mensual, 2)}</span>
            </div>
            <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
              <span className="text-muted-foreground">Anual: </span>
              <span className="text-yellow-400 font-mono">{fmtPct(inflacion.anual, 2)}</span>
            </div>
            <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
              <span className="text-muted-foreground">Acum. ao: </span>
              <span className="text-yellow-400 font-mono">{fmtPct(inflacion.acumulada, 2)}</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-border/30">
            <div className="mono mb-1 text-[13px] uppercase tracking-[0.15em] text-muted-foreground">
              Tasas comparables
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
                <span className="text-muted-foreground">BADLAR: </span>
                <span className="text-cyan-400 font-mono">
                  {badlar != null ? fmtNum(badlar, 2) + "%" : "\u2014"}
                </span>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
                <span className="text-muted-foreground">TM20: </span>
                <span className="text-cyan-400 font-mono">
                  {tm20 != null ? fmtNum(tm20, 2) + "%" : "\u2014"}
                </span>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5">
                <span className="text-muted-foreground">Riesgo Pas: </span>
                <span className="text-cyan-400 font-mono">
                  {riesgoPais != null ? fmtNum(riesgoPais, 0) + " pb" : "\u2014"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {mode === "lecaps" && (
        <>
          {/* LECAPs */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Todas las LECAPs
              </div>
              <div className="flex gap-2 items-center">
                <div className="space-y-0.5">
                  <label className="text-[12px] uppercase tracking-wider text-muted-foreground">
                    TEM min
                  </label>
                  <input
                    type="number"
                    value={filtroLecapMinTEM}
                    onChange={(e) => setFiltroLecapMinTEM(e.target.value)}
                    placeholder="0"
                    className="w-14 rounded border border-border/60 bg-input px-1 py-0.5 text-[13px] font-mono"
                  />
                </div>
                <div className="space-y-0.5">
                  <label className="text-[12px] uppercase tracking-wider text-muted-foreground">
                    TNA Real
                  </label>
                  <select
                    value={filtroLecapTNAreal}
                    onChange={(e) => setFiltroLecapTNAreal(e.target.value)}
                    className="rounded border border-border/60 bg-input px-1 py-0.5 text-[13px] font-mono"
                  >
                    <option value="todos">Todas</option>
                    <option value="positiva">Positiva</option>
                    <option value="negativa">Negativa</option>
                  </select>
                </div>
              </div>
            </div>
            {lecapsFiltradas.length === 0 ? (
              <EmptyState text="Sin LECAPs para los filtros seleccionados." />
            ) : (
              <div className="overflow-x-auto">
                <table className="mono w-full text-xs">
                  <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <SortableHeader
                        label="Ticker"
                        sortKey="ticker"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                      />
                      <SortableHeader
                        label="TEM"
                        sortKey="tem"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                        align="right"
                      />
                      <SortableHeader
                        label="TEA"
                        sortKey="tea"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                        align="right"
                      />
                      <SortableHeader
                        label="TNA"
                        sortKey="tna"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                        align="right"
                      />
                      <SortableHeader
                        label="TNA Real"
                        sortKey="tnaReal"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                        align="right"
                      />
                      <SortableHeader
                        label="VPV"
                        sortKey="vpv"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Precio"
                        sortKey="precio"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Das"
                        sortKey="diasAlVencimiento"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Venc."
                        sortKey="fechaVencimiento"
                        currentKey={lecapSortKey}
                        currentDir={lecapSortDir}
                        onSort={toggleLecapSort}
                        align="right"
                      />
                      <th className="px-2 py-2 text-center">Accin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lecapsFiltradas.map((l) => {
                      const enPort = enPortafolio(l.ticker);
                      return (
                        <tr key={l.ticker} className="border-b border-border/30 hover:bg-muted/20">
                          <td className="px-2 py-2 font-medium">{l.ticker}</td>
                          <td
                            className={`px-2 py-2 text-right ${l.tem > 0 && inflacion.mensual != null ? (l.tem > inflacion.mensual ? "text-green-400" : "text-red-400") : l.tem > 0 ? "text-yellow-400" : ""}`}
                          >
                            {l.tem > 0 ? fmtNum(l.tem, 2) + "%" : "\u2014"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${l.tea >= 0 ? "text-green-400" : ""}`}
                          >
                            {l.tea >= 0 ? fmtNum(l.tea, 2) + "%" : "\u2014"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${l.tna > 0 && badlar != null ? (l.tna > badlar ? "text-green-400" : "text-orange-400") : l.tna > 0 ? "text-orange-400" : ""}`}
                          >
                            {l.tna > 0 ? fmtNum(l.tna, 2) + "%" : "\u2014"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${l.tnaReal != null ? (l.tnaReal > 0 ? "text-green-400" : "text-red-400") : ""}`}
                          >
                            {l.tnaReal != null ? fmtNum(l.tnaReal, 2) + "%" : "\u2014"}
                          </td>
                          <td className="px-2 py-2 text-right">{fmtNum(l.vpv, 2)}</td>
                          <td className="px-2 py-2 text-right">
                            {l.precio != null
                              ? `$ ${fmtNum(l.precio, 2)}`
                              : l.vpv > 0
                                ? `$ ${fmtNum(l.vpv, 2)} (VPV)`
                                : "\u2014"}
                            {l.precioFuente === "iol" && (
                              <span className="ml-1 text-[13px] text-cyan-400">IOL</span>
                            )}
                          </td>
                          <td
                            className={`px-2 py-2 text-right ${l.diasAlVencimiento <= 0 ? "text-red-400" : ""}`}
                          >
                            {l.diasAlVencimiento > 0
                              ? fmtNum(l.diasAlVencimiento, 0) + "d"
                              : l.diasAlVencimiento === 0
                                ? "Vence hoy"
                                : "Vencido"}
                          </td>
                          <td className="px-2 py-2 text-right text-[13px]">
                            {fmtFecha(l.fechaVencimiento)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {enPort ? (
                              <button
                                onClick={() => onRemove(l.ticker)}
                                className="text-[13px] text-danger hover:text-red-300 px-2 py-0.5 rounded border border-danger/40"
                              >
                                Quitar
                              </button>
                            ) : l.precio != null && l.precio > 0 ? (
                              <button
                                onClick={() =>
                                  onAdd({
                                    ticker: l.ticker,
                                    vn: l.precio!.toString(),
                                    precio: l.precio!.toString(),
                                  })
                                }
                                className="text-[13px] text-primary hover:text-green-300 px-2 py-0.5 rounded border border-primary/40"
                              >
                                Agregar
                              </button>
                            ) : (
                              <span className="text-[13px] text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      {mode === "fcis" && (
        <>
          {/* FCIs */}
          <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
            <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Todos los FCIs
            </div>

            <div className="flex gap-2 mb-3">
              <div className="space-y-1">
                <label className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  Tipo
                </label>
                <select
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                  className="rounded-md border border-border bg-input px-2 py-1 text-[14px] font-mono"
                >
                  <option value="todas">Todas</option>
                  <option value="mercadoDinero">Mercado Dinero</option>
                  <option value="rentaFija">Renta Fija</option>
                  <option value="rentaMixta">Renta Mixta</option>
                  <option value="rentaVariable">Renta Variable</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  Horizonte
                </label>
                <select
                  value={filtroHorizonte}
                  onChange={(e) => setFiltroHorizonte(e.target.value)}
                  className="rounded-md border border-border bg-input px-2 py-1 text-[14px] font-mono"
                >
                  <option value="todos">Todos</option>
                  <option value="corto">Corto</option>
                  <option value="medio">Medio</option>
                  <option value="largo">Largo</option>
                </select>
              </div>
            </div>

            {fcisFiltrados.length === 0 ? (
              <EmptyState text="No hay FCIs para los filtros seleccionados." />
            ) : (
              <div className="overflow-x-auto">
                <table className="mono w-full text-xs">
                  <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <SortableHeader
                        label="Fondo"
                        sortKey="fondo"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                      />
                      <SortableHeader
                        label="Tipo"
                        sortKey="tipo"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                      />
                      <SortableHeader
                        label="VCP"
                        sortKey="vcp"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                        align="right"
                      />
                      <SortableHeader
                        label="CCP"
                        sortKey="ccp"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Var. Diaria"
                        sortKey="variacionDiaria"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Var. Mensual"
                        sortKey="variacionMensual"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Var. Anual"
                        sortKey="variacionAnual"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Patrimonio"
                        sortKey="patrimonio"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                        align="right"
                      />
                      <SortableHeader
                        label="Horizonte"
                        sortKey="horizonte"
                        currentKey={fciSortKey}
                        currentDir={fciSortDir}
                        onSort={toggleFciSort}
                      />
                      <th className="px-2 py-2 text-center">Accin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fcisFiltrados.map((f, i) => {
                      const key = `${f.tipo}-${f.fondo}-${i}`;
                      const enPort = enPortafolio(f.fondo);
                      return (
                        <tr key={key} className="border-b border-border/30 hover:bg-muted/20">
                          <td
                            className="px-2 py-2 font-medium max-w-[180px] truncate"
                            title={f.fondo}
                          >
                            {f.fondo}
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className={`inline-block rounded px-1 py-0.5 text-[13px] ${badgeFciTipo(f.tipo)}`}
                            >
                              {f.tipo}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-right">{fmtNum(f.vcp, 4)}</td>
                          <td className="px-2 py-2 text-right">{fmtNum(f.ccp, 4)}</td>
                          <td
                            className={`px-2 py-2 text-right font-mono text-[13px] ${(f.variacionDiaria ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                          >
                            {f.variacionDiaria != null ? fmtPct(f.variacionDiaria, 2) : "\u2014"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono text-[13px] ${(f.variacionMensual ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                          >
                            {f.variacionMensual != null ? fmtPct(f.variacionMensual, 2) : "\u2014"}
                          </td>
                          <td
                            className={`px-2 py-2 text-right font-mono text-[13px] ${(f.variacionAnual ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}
                          >
                            {f.variacionAnual != null ? fmtPct(f.variacionAnual, 2) : "\u2014"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {fmtNum(f.patrimonio / 1_000_000, 1)}M
                          </td>
                          <td className="px-2 py-2">
                            <span
                              className={`inline-block rounded px-1 py-0.5 text-[13px] ${badgeHorizonte(f.horizonte)}`}
                            >
                              {f.horizonte}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {enPort ? (
                              <button
                                onClick={() => onRemove(f.fondo)}
                                className="text-[13px] text-danger hover:text-red-300 px-2 py-0.5 rounded border border-danger/40"
                              >
                                Quitar
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  onAdd({ ticker: f.fondo, vn: "1", precio: f.vcp.toString() })
                                }
                                className="text-[13px] text-primary hover:text-green-300 px-2 py-0.5 rounded border border-primary/40"
                              >
                                Agregar
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SortableHeader<T>({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align,
}: {
  label: string;
  sortKey: T;
  currentKey: T;
  currentDir: SortDir;
  onSort: (key: T) => void;
  align?: "left" | "right" | "center";
}) {
  const isActive = currentKey === sortKey;
  return (
    <th className={`px-2 py-2 text-${align ?? "left"}`}>
      <button onClick={() => onSort(sortKey)} className="font-medium hover:text-foreground">
        {label} {isActive && (currentDir === "asc" ? "\u2191" : "\u2193")}
      </button>
    </th>
  );
}

function badgeFciTipo(tipo: string): string {
  const m: Record<string, string> = {
    rentaFija: "bg-green-900/40 text-green-300 border-green-800",
    mercadoDinero: "bg-blue-900/40 text-blue-300 border-blue-800",
    rentaVariable: "bg-purple-900/40 text-purple-300 border-purple-800",
    rentaMixta: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  };
  return m[tipo] ?? "bg-muted text-muted-foreground border-border";
}

function badgeHorizonte(h: string): string {
  const m: Record<string, string> = {
    corto: "bg-blue-900/30 text-blue-300 border-blue-800",
    medio: "bg-yellow-900/30 text-yellow-300 border-yellow-800",
    largo: "bg-red-900/30 text-red-300 border-red-800",
  };
  return m[h] ?? "bg-muted text-muted-foreground border-border";
}
