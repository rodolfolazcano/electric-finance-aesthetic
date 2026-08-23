// @ts-nocheck
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getBonoPrecioYTCOficial,
  calcularRendimientosBono,
  calcularMonitorBonos,
  buscarInstrumentoIOL,
  calcularPortafolioRentaFija,
  getSerieHistoricaConTIR,
  type PreciosResult,
  type RendimientoBono,
  type MonitorResult,
  type InstrumentoSearchResult,
  type PortafolioRFResult,
  type SerieHistoricaResult,
  type SerieHistoricaPoint,
} from "@/lib/renta-fija.functions";
import { BONOS_DB, BONOS_LIST, BONOS_TICKERS, type TipoBono } from "@/lib/bonos-data";
import { searchYahooNews } from "@/lib/yahoo-search.functions";
import type { LecapData } from "@/lib/renta-fija.functions";
import { LecapFciPanel } from "@/components/sections/LecapFciPanel";
import { ComparadoresSubTab } from "@/components/renta-fija/ComparadoresSubTab";
import { FlujoFondosCalculator } from "@/components/renta-fija/FlujoFondosCalculator";
import { ONLadderSubTab } from "@/components/sections/ONLadderSubTab";
import { RebalanceadorSubTab } from "@/components/sections/RebalanceadorSubTab";
import { OnsLadderPanel } from "@/components/renta-fija/OnsLadderPanel";
import { iolTitulosPublicos, iolObligacionesNegociables } from "@/lib/iol-cotizaciones.functions";
import type { IOLCotizacion } from "@/lib/iol-cotizaciones.functions";
import { getDashboardDiario, type DashboardRow } from "@/lib/dashboard-diario.functions";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type RfGroup = "curva" | "instrumentos" | "cartera" | "comparadores";

type RfSubTab = "lecaps" | "fcis" | "titulosPublicos" | "ons" | "portafolio" | "calculadora" | "flujos" | "dashboard" | "rebalanceador";

const GROUP_TABS: { key: RfGroup; label: string }[] = [
  { key: "curva", label: "Curva de Rendimientos" },
  { key: "instrumentos", label: "Instrumentos" },
  { key: "cartera", label: "Mi Cartera" },
  { key: "comparadores", label: "Comparadores" },
];

const GROUP_SUBTABS: Record<RfGroup, { key: RfSubTab; label: string; subtitle?: string }[]> = {
  curva: [],
  instrumentos: [
    { key: "dashboard", label: "Dashboard Diario", subtitle: "Soberanos y Bopreales en Moneda Extranjera" },
    { key: "lecaps", label: "LECAPs", subtitle: "Tasa fija a corto plazo" },
    { key: "fcis", label: "FCIs", subtitle: "Fondo común diversificado" },
    { key: "titulosPublicos", label: "Títulos Públicos", subtitle: "Bonos soberanos" },
    { key: "ons", label: "ONs", subtitle: "Obligaciones Negociables corporativas" },
  ],
  cartera: [
    { key: "portafolio", label: "Portafolio" },
    { key: "calculadora", label: "¿Cuánto rinde esto?" },
    { key: "flujos", label: "Flujo de Fondos" },
    { key: "ons", label: "ONs Corporativas" },
    { key: "rebalanceador", label: "Rebalanceador", subtitle: "Smart Beta" },
  ],
  comparadores: [],
};

function getGroupForTab(tab: RfSubTab): RfGroup {
  for (const [group, tabs] of Object.entries(GROUP_SUBTABS)) {
    if (tabs.some((t) => t.key === tab)) return group as RfGroup;
  }
  return "curva";
}

interface RentaFijaPanelProps {
  accessToken?: string | null;
  refreshToken?: string | null;
  onTokenRefresh?: (token: string, refreshToken: string) => void;
}

function fmtNum(n: number, dp = 2) {
  if (!Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function formatearFecha(fechaISO: string): string {
  if (!fechaISO) return "\u2014";
  const [y, m, d] = fechaISO.split("-");
  return `${d}/${m}/${y}`;
}

function colorPorTIR(tir: number | null): string {
  if (tir === null) return "text-muted-foreground";
  if (tir > 0.12) return "text-green-400";
  if (tir > 0.06) return "text-yellow-400";
  return "text-red-400";
}

function badgeTipoBono(tipo: TipoBono): string {
  const colores: Record<TipoBono, string> = {
    "Hard Dollar": "bg-green-900/40 text-green-300 border-green-800",
    "Dollar-Linked": "bg-blue-900/40 text-blue-300 border-blue-800",
    CER: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
    LECAP: "bg-purple-900/40 text-purple-300 border-purple-800",
    "Tasa Fija ARS": "bg-orange-900/40 text-orange-300 border-orange-800",
    TAMAR: "bg-pink-900/40 text-pink-300 border-pink-800",
    "ON Hard Dollar": "bg-teal-900/40 text-teal-300 border-teal-800",
    "ON CER": "bg-amber-900/40 text-amber-300 border-amber-800",
    "ON Badlar": "bg-cyan-900/40 text-cyan-300 border-cyan-800",
    "ON Tasa Fija": "bg-indigo-900/40 text-indigo-300 border-indigo-800",
  };
  return colores[tipo] ?? "bg-muted text-muted-foreground border-border";
}

function rowColorBono(tipo: TipoBono): string {
  const c: Record<TipoBono, string> = {
    "Hard Dollar": "bg-[oklch(0.2_0.03_165)]/60",
    "Dollar-Linked": "bg-[oklch(0.2_0.03_240)]/60",
    CER: "bg-[oklch(0.2_0.03_90)]/60",
    LECAP: "bg-[oklch(0.2_0.03_280)]/60",
    "Tasa Fija ARS": "bg-[oklch(0.2_0.03_30)]/60",
    TAMAR: "bg-[oklch(0.2_0.03_330)]/60",
    "ON Hard Dollar": "bg-[oklch(0.2_0.04_180)]/60",
    "ON CER": "bg-[oklch(0.2_0.04_80)]/60",
    "ON Badlar": "bg-[oklch(0.2_0.04_200)]/60",
    "ON Tasa Fija": "bg-[oklch(0.2_0.04_250)]/60",
  };
  return c[tipo] ?? "";
}

function riesgoNivel(valor: number | null): { label: string; clase: string } | null {
  if (valor == null) return null;
  if (valor > 20) return { label: "Agresivo", clase: "bg-red-900/40 text-red-300 border-red-800" };
  if (valor > 12)
    return { label: "Moderado", clase: "bg-yellow-900/40 text-yellow-300 border-yellow-800" };
  return { label: "Conservador", clase: "bg-green-900/40 text-green-300 border-green-800" };
}

function plazoRestante(dias: number): string {
  if (dias <= 0) return "\u2014";
  if (dias < 60) return `${dias} días`;
  if (dias < 365) return `${Math.round(dias / 30)} meses`;
  const años = Math.floor(dias / 365);
  const meses = Math.round((dias % 365) / 30);
  return meses > 0 ? `${años}a ${meses}m` : `${años}a`;
}

function TooltipHeader({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <span className="group relative cursor-help border-b border-dotted border-muted-foreground/40">
      {label}
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 rounded border border-border/60 bg-surface p-1.5 text-[13px] font-normal text-muted-foreground shadow-lg z-20 pointer-events-none">
        {tooltip}
      </span>
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-muted/10 p-4 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function RentaFijaPanel({ accessToken, refreshToken, onTokenRefresh }: RentaFijaPanelProps) {
  const [rfGroupTab, setRfGroupTab] = useState<RfGroup>("curva");
  const [rfSubTab, setRfSubTab] = useState<RfSubTab>("lecaps");
  const [rfDetalleTicker, setRfDetalleTicker] = useState<string | null>(null);
  const [rfSelectedTicker, setRfSelectedTicker] = useState<string>("AL29D");
  const [rfPrecioManual, setRfPrecioManual] = useState<string>("");
  const [rfTasaDevaluacion, setRfTasaDevaluacion] = useState<string>("30");
  const [rfResultadoCalc, setRfResultadoCalc] = useState<RendimientoBono | null>(null);
  const [rfMonitor, setRfMonitor] = useState<MonitorResult | null>(null);
  const [rfMonitorLoading, setRfMonitorLoading] = useState(false);
  const [rfCalcLoading, setRfCalcLoading] = useState(false);
  const [rfPrecios, setRfPrecios] = useState<PreciosResult | null>(null);
  const [rfSortKey, setRfSortKey] = useState<string>("tir");
  const [rfSortDir, setRfSortDir] = useState<"asc" | "desc">("desc");

  const [rfPosiciones, setRfPosiciones] = useState<
    Array<{ ticker: string; cantidad: number; vn: number; precio: number; total: number }>
  >([]);
  const [rfResultadoPortafolio, setRfResultadoPortafolio] = useState<PortafolioRFResult | null>(
    null,
  );
  const [rfPortafolioLoading, setRfPortafolioLoading] = useState(false);
  const [rfBusqueda, setRfBusqueda] = useState<string>("");
  const [rfResultadoBusqueda, setRfResultadoBusqueda] = useState<InstrumentoSearchResult | null>(
    null,
  );
  const [rfBusquedaLoading, setRfBusquedaLoading] = useState(false);
  const [rfFormAgregar, setRfFormAgregar] = useState<{
    ticker: string;
    vn: string;
    precio: string;
  } | null>(null);

  const [rfHistoricoTicker, setRfHistoricoTicker] = useState<string>("AL29D");
  const [rfHistoricoDesde, setRfHistoricoDesde] = useState<string>("");
  const [rfHistoricoHasta, setRfHistoricoHasta] = useState<string>("");
  const [rfHistoricoData, setRfHistoricoData] = useState<SerieHistoricaResult | null>(null);
  const [rfHistoricoLoading, setRfHistoricoLoading] = useState(false);
  useEffect(() => {
    if (!rfHistoricoDesde) {
      setRfHistoricoDesde(new Date(Date.now() - 365 * 864e5).toISOString().split("T")[0]);
      setRfHistoricoHasta(new Date().toISOString().split("T")[0]);
    }
  }, [rfHistoricoDesde]);

  const [rfOns, setRfOns] = useState<IOLCotizacion[]>([]);
  const [rfOnsLoading, setRfOnsLoading] = useState(false);
  const [rfTPs, setRfTPs] = useState<IOLCotizacion[]>([]);
  const [rfTPsLoading, setRfTPsLoading] = useState(false);
  const [rfTPsTirMap, setRfTPsTirMap] = useState<Record<string, number | null>>({});
  const [rfDashboardData, setRfDashboardData] = useState<DashboardRow[]>([]);
  const [rfDashboardLoading, setRfDashboardLoading] = useState(false);

  const fnPrecios = useServerFn(getBonoPrecioYTCOficial);
  const fnCalc = useServerFn(calcularRendimientosBono);
  const fnMonitor = useServerFn(calcularMonitorBonos);
  const fnBuscar = useServerFn(buscarInstrumentoIOL);
  const fnPortafolio = useServerFn(calcularPortafolioRentaFija);
  const fnHistorico = useServerFn(getSerieHistoricaConTIR);
  const fnOns = useServerFn(iolObligacionesNegociables);
  const fnTPs = useServerFn(iolTitulosPublicos);
  const fnDashboard = useServerFn(getDashboardDiario);

  const sessionId = accessToken || undefined;
  const rfRefreshToken = refreshToken || undefined;

  // Calcular TIR desde precios IOL reales (bulk endpoint) para Títulos Públicos
  // El bulk endpoint devuelve precios ya por 100 VN (NO dividir por escala)
  useEffect(() => {
    if (!accessToken || rfTPs.length === 0) { setRfTPsTirMap({}); return; }
    let cancelled = false;
    (async () => {
      const map: Record<string, number | null> = {};
      // Agrupar por base ticker, prefiriendo USD (D/C) sobre ARS
      const basePrices = new Map<string, number>();
      for (const tp of rfTPs) {
        const ticker = tp.simbolo.toUpperCase();
        if (tp.precio <= 0) continue;
        const baseTicker = ticker.replace(/[DC]$/, "");
        if (!BONOS_DB[baseTicker]) continue;
        const esUsd = ticker.endsWith("D") || ticker.endsWith("C");
        const existing = basePrices.get(baseTicker);
        if (existing === undefined || esUsd) {
          basePrices.set(baseTicker, tp.precio);
        }
      }
      const batchSize = 3;
      const entries = [...basePrices.entries()];
      for (let i = 0; i < entries.length; i += batchSize) {
        if (cancelled) return;
        await Promise.allSettled(entries.slice(i, i + batchSize).map(async ([baseTicker, precio]) => {
          const bono = BONOS_DB[baseTicker];
          if (!bono) return;
          let precioPorCada100VN = precio;
          // Si cotiza en ARS y es Hard Dollar, convertir a USD
          if (bono.tipo === "Hard Dollar" || bono.tipo === "ON Hard Dollar") {
            // Si precio está en miles (ARS), convertir vía MEP
            if (precio > 300) {
              const tcEst = rfMonitor?.tcOficial ? rfMonitor.tcOficial * 1.2 : 1500;
              precioPorCada100VN = precio / tcEst;
            }
          }
          if (precioPorCada100VN <= 0 || precioPorCada100VN > 500) return;
          try {
            const result = await fnCalc({ data: { ticker: baseTicker, precioPorCada100VN } });
            if (result && !("error" in result)) {
              const rb = result as RendimientoBono;
              map[baseTicker] = rb.tir;
            }
          } catch { /* ignore */ }
        }));
      }
      if (!cancelled) setRfTPsTirMap(map);
    })();
    return () => { cancelled = true; };
  }, [rfTPs, accessToken, rfMonitor?.tcOficial]);

  function toggleSort(key: string) {
    if (rfSortKey === key) setRfSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setRfSortKey(key);
      setRfSortDir("asc");
    }
  }

  function loadMonitor() {
    if (rfMonitorLoading) return;
    setRfMonitorLoading(true);
    fnMonitor({ data: { sessionId, refreshToken: rfRefreshToken } })
      .then(setRfMonitor)
      .finally(() => setRfMonitorLoading(false));
  }

  function loadOns() {
    if (rfOnsLoading || !accessToken) return;
    setRfOnsLoading(true);
    fnOns({ data: { bearerToken: accessToken } })
      .then((r) => {
        if (r.success) setRfOns(r.ons);
      })
      .catch(() => {})
      .finally(() => setRfOnsLoading(false));
  }

  function loadTPs() {
    if (rfTPsLoading || !accessToken) return;
    setRfTPsLoading(true);
    fnTPs({ data: { bearerToken: accessToken } })
      .then((r) => {
        if (r.success) setRfTPs(r.bonos);
      })
      .catch(() => {})
      .finally(() => setRfTPsLoading(false));
  }

  function loadDashboard() {
    if (rfDashboardLoading) return;
    setRfDashboardLoading(true);
    fnDashboard({ data: { bearerToken: accessToken ?? undefined } })
      .then(setRfDashboardData)
      .catch(() => {})
      .finally(() => setRfDashboardLoading(false));
  }

  function switchGroup(group: RfGroup) {
    setRfGroupTab(group);
    setRfDetalleTicker(null);
    const subs = GROUP_SUBTABS[group];
    if (subs.length > 0) setRfSubTab(subs[0].key);
  }

  function openDetalle(ticker: string) {
    setRfSelectedTicker(ticker);
    setRfDetalleTicker(ticker);
  }

  useEffect(() => {
    if (rfGroupTab === "curva" && !rfMonitor) loadMonitor();
    if (rfSubTab === "ons" && rfOns.length === 0) loadOns();
    if (rfSubTab === "dashboard" && rfDashboardData.length === 0) loadDashboard();
    if (rfSubTab === "titulosPublicos") {
      if (rfTPs.length === 0) loadTPs();
      if (!rfMonitor) loadMonitor();
    }
  }, [rfGroupTab, rfSubTab]);

  const subs = GROUP_SUBTABS[rfGroupTab];
  const currentSub = subs.find((s) => s.key === rfSubTab);

  return (
    <div className="glass min-w-0">
      <div className="flex flex-col">
        <div className="flex items-center gap-1 border-b border-border/60 px-4 pt-3">
          {GROUP_TABS.map((g) => (
            <button
              key={g.key}
              onClick={() => switchGroup(g.key)}
              className={`mono rounded-t-md px-3 py-2 text-[14px] transition-colors ${
                rfGroupTab === g.key
                  ? "border border-border/60 border-b-transparent bg-background/40 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        {subs.length > 0 && (
          <div className="flex items-center gap-0.5 border-b border-border/20 px-4 pb-0.5 pt-1">
            {subs.map((s) => (
              <button
                key={s.key}
                onClick={() => {
                  setRfDetalleTicker(null);
                  setRfSubTab(s.key);
                }}
                className={`mono rounded-t-sm px-2 py-0.5 text-[13px] transition-colors ${
                  rfSubTab === s.key
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {currentSub?.subtitle && (
          <div className="border-b border-border/10 px-4 py-1 text-[13px] italic text-muted-foreground">
            {currentSub.subtitle}
          </div>
        )}
      </div>

      <div className="p-4">
        {rfGroupTab === "curva" ? (
          <CurvaSubTab data={rfMonitor} />
        ) : rfGroupTab === "comparadores" ? (
          <ComparadoresSubTab sessionId={sessionId} />
        ) : rfDetalleTicker ? (
          <div className="space-y-3">
            <button
              onClick={() => setRfDetalleTicker(null)}
              className="mono text-[14px] text-muted-foreground hover:text-foreground"
            >
              ← Volver
            </button>
            <DetalleSubTab
              ticker={rfDetalleTicker}
              setTicker={setRfSelectedTicker}
              resultado={rfResultadoCalc}
              setResultado={setRfResultadoCalc}
              calcLoading={rfCalcLoading}
              setCalcLoading={setRfCalcLoading}
              fnCalc={fnCalc}
              precios={rfPrecios}
              setPrecios={setRfPrecios}
              fnPrecios={fnPrecios}
              sessionId={sessionId}
            />
          </div>
        ) : (
          <>
            {rfSubTab === "calculadora" && (
              <CalculadoraSubTab
                selectedTicker={rfSelectedTicker}
                setSelectedTicker={setRfSelectedTicker}
                precioManual={rfPrecioManual}
                setPrecioManual={setRfPrecioManual}
                tasaDevaluacion={rfTasaDevaluacion}
                setTasaDevaluacion={setRfTasaDevaluacion}
                calcLoading={rfCalcLoading}
                setCalcLoading={setRfCalcLoading}
                resultado={rfResultadoCalc}
                setResultado={setRfResultadoCalc}
                precios={rfPrecios}
                setPrecios={setRfPrecios}
                fnPrecios={fnPrecios}
                fnCalc={fnCalc}
                sessionId={sessionId}
              />
            )}
            {rfSubTab === "portafolio" && (
              <PortafolioSubTab
                posiciones={rfPosiciones}
                setPosiciones={setRfPosiciones}
                resultado={rfResultadoPortafolio}
                setResultado={setRfResultadoPortafolio}
                busqueda={rfBusqueda}
                setBusqueda={setRfBusqueda}
                resultadoBusqueda={rfResultadoBusqueda}
                setResultadoBusqueda={setRfResultadoBusqueda}
                busquedaLoading={rfBusquedaLoading}
                setBusquedaLoading={setRfBusquedaLoading}
                formAgregar={rfFormAgregar}
                setFormAgregar={setRfFormAgregar}
                portafolioLoading={rfPortafolioLoading}
                setPortafolioLoading={setRfPortafolioLoading}
                fnBuscar={fnBuscar}
                fnPortafolio={fnPortafolio}
                sessionId={sessionId}
              />
            )}
            {rfSubTab === "flujos" && <FlujoFondosCalculator />}
            {rfSubTab === "rebalanceador" && <RebalanceadorSubTab />}
            {rfSubTab === "lecaps" && (
              <LecapFciPanel
                mode="lecaps"
                accessToken={accessToken}
                posiciones={rfPosiciones}
                onAdd={(item) => {
                  if (BONOS_DB[item.ticker.toUpperCase()]) {
                    const precio = parseFloat(item.precio) || 100;
                    setRfPosiciones((prev) => {
                      if (prev.some((p) => p.ticker === item.ticker)) return prev;
                      return [
                        ...prev,
                        { ticker: item.ticker, cantidad: 1, vn: 100, precio, total: precio },
                      ];
                    });
                  }
                }}
                onRemove={(ticker) =>
                  setRfPosiciones((prev) => prev.filter((p) => p.ticker !== ticker))
                }
              />
            )}
            {rfSubTab === "fcis" && (
              <LecapFciPanel
                mode="fcis"
                accessToken={accessToken}
                posiciones={rfPosiciones}
                onAdd={(item) => {
                  if (BONOS_DB[item.ticker.toUpperCase()]) {
                    const precio = parseFloat(item.precio) || 100;
                    setRfPosiciones((prev) => {
                      if (prev.some((p) => p.ticker === item.ticker)) return prev;
                      return [
                        ...prev,
                        { ticker: item.ticker, cantidad: 1, vn: 100, precio, total: precio },
                      ];
                    });
                  }
                }}
                onRemove={(ticker) =>
                  setRfPosiciones((prev) => prev.filter((p) => p.ticker !== ticker))
                }
              />
            )}
            {rfSubTab === "dashboard" && (
              <DashboardDiarioSubTab
                data={rfDashboardData}
                loading={rfDashboardLoading}
                onRefresh={loadDashboard}
                accessToken={accessToken ?? null}
              />
            )}
            {rfSubTab === "titulosPublicos" && (
              <TitulosPublicosSubTab
                data={rfTPs}
                loading={rfTPsLoading}
                onRefresh={loadTPs}
                accessToken={accessToken ?? null}
                tirMap={(() => {
                  const m: Record<string, number | null> = {};
                  // Prioridad 1: TIR calculada desde precio IOL real
                  for (const [tk, tir] of Object.entries(rfTPsTirMap)) {
                    m[tk] = tir;
                    m[`${tk}D`] = tir;
                    m[`${tk}C`] = tir;
                  }
                  // Prioridad 2: TIR del monitor (fallback)
                  if (rfMonitor?.bonos) {
                    for (const b of rfMonitor.bonos) {
                      const tk = b.ticker.toUpperCase();
                      if (m[tk] === undefined) m[tk] = b.tir;
                      if (m[`${tk}D`] === undefined) m[`${tk}D`] = b.tir;
                      if (m[`${tk}C`] === undefined) m[`${tk}C`] = b.tir;
                    }
                  }
                  return m;
                })()}
              />
            )}
            {rfSubTab === "ons" && (
              <div className="space-y-6">
                <OnsLadderPanel
                  accessToken={accessToken ?? null}
                  onAddTickers={() => {}}
                  existingTickers={[]}
                />
                <ONLadderSubTab iolData={rfOns} />
              </div>
            )}
          </>
        )}
      </div>


    </div>
  );
}

function MonitorSubTab({
  data,
  loading,
  sortKey,
  sortDir,
  onSort,
  onRefresh,
  onSelectTicker,
  onOpenChart,
}: {
  data: MonitorResult | null;
  loading: boolean;
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onRefresh: () => void;
  onSelectTicker: (ticker: string) => void;
  onOpenChart?: (ticker: string, chart: "tv" | "paridad" | "tir") => void;
}) {
  const [lecapsSortKey, setLecapsSortKey] = useState("tea");
  const [lecapsSortDir, setLecapsSortDir] = useState<"asc" | "desc">("desc");
  const toggleLecapsSort = (key: string) => {
    if (lecapsSortKey === key) setLecapsSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setLecapsSortKey(key);
      setLecapsSortDir("asc");
    }
  };

  const sortedBonos = useMemo(() => {
    if (!data?.bonos) return [];
    const list = [...data.bonos];
    const order = ["LECAP", "CER", "Hard Dollar", "Dollar-Linked", "Tasa Fija ARS", "TAMAR"];
    const tipoRank: Record<string, number> = {};
    order.forEach((t, i) => {
      tipoRank[t] = i;
    });
    list.sort((a, b) => {
      const ta = tipoRank[a.tipo] ?? 99;
      const tb = tipoRank[b.tipo] ?? 99;
      if (ta !== tb) return ta - tb;
      const tirA = a.tir ?? 0;
      const tirB = b.tir ?? 0;
      return tirB - tirA;
    });
    return list;
  }, [data]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Monitor de bonos</div>
          {data && (
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {data.bonos.length} bonos · {data.lecaps?.length ?? 0} LECAPs · TC Oficial:{" "}
              {data.tcOficial ? `ARS ${fmtNum(data.tcOficial, 2)}` : "—"} · MEP:{" "}
              {data.tcMep ? `ARS ${fmtNum(data.tcMep, 2)}` : "—"}
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="mono rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[14px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      {!data || (data.bonos.length === 0 && (!data.lecaps || data.lecaps.length === 0)) ? (
        <EmptyState text="Sin datos de bonos disponibles. Verifica la conexión a IOL." />
      ) : (
        <>
          {data.bonos.length > 0 && (
            <div className="overflow-x-auto">
              <table className="mono w-full text-xs">
                <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-2 py-2 text-left">
                      <button
                        onClick={() => onSort("ticker")}
                        className="font-medium hover:text-foreground"
                      >
                        Ticker {sortKey === "ticker" && (sortDir === "asc" ? "\u2191" : "\u2193")}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-left">Nombre</th>
                    <th className="px-2 py-2 text-right">
                      <button
                        onClick={() => onSort("precio")}
                        className="font-medium hover:text-foreground"
                      >
                        Precio {sortKey === "precio" && (sortDir === "asc" ? "\u2191" : "\u2193")}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right">
                      <button
                        onClick={() => onSort("tir")}
                        className="font-medium hover:text-foreground"
                      >
                        <TooltipHeader
                          label="TIR"
                          tooltip="Tasa Interna de Retorno: lo que ganarías si lo mantenés hasta el vencimiento"
                        />{" "}
                        {sortKey === "tir" && (sortDir === "asc" ? "\u2191" : "\u2193")}
                      </button>
                    </th>
                    <th className="px-2 py-2 text-right">Plazo</th>
                    <th className="px-2 py-2 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBonos.map((b) => (
                    <tr
                      key={b.ticker}
                      className={`border-b border-border/30 ${rowColorBono(b.tipo)}`}
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => onSelectTicker(b.ticker)}
                            className="font-medium hover:text-primary transition-colors"
                          >
                            {b.ticker}
                          </button>
                          <span
                            className={`inline-block rounded-md border px-1 py-0.5 text-[13px] ${badgeTipoBono(b.tipo)}`}
                          >
                            {b.tipo}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-muted-foreground text-[13px] max-w-[140px] truncate">
                        {BONOS_DB[b.ticker]?.descripcion?.slice(0, 35) ?? "\u2014"}
                      </td>
                      <td className="px-2 py-2 text-right">{fmtNum(b.precio, 2)}</td>
                      <td className="px-2 py-2 text-right">
                        <div className={`font-medium ${colorPorTIR(b.tir)}`}>
                          {b.tir != null ? fmtPct(b.tir * 100, 2) : "\u2014"}
                        </div>
                        {(() => {
                          const r = riesgoNivel(b.tir != null ? b.tir * 100 : null);
                          return r ? (
                            <span
                              className={`inline-block rounded border px-1 py-0.5 text-[12px] leading-tight ${r.clase}`}
                            >
                              {r.label}
                            </span>
                          ) : null;
                        })()}
                      </td>
                      <td className="px-2 py-2 text-right text-[13px]">
                        {plazoRestante(b.diasAlVencimiento)}
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onSelectTicker(b.ticker)}
                            className="rounded border border-[#C9A84C]/50 px-1.5 py-0.5 text-[13px] text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors"
                          >
                            Detalle
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.lecaps && data.lecaps.length > 0 && (
            <div className="overflow-x-auto">
              <div className="mono mb-2 text-[13px] uppercase tracking-[0.15em] text-muted-foreground">
                LECAPs en Vivo (ArgentinaDatos)
              </div>
              {(() => {
                const sortedLecaps = [...data.lecaps].sort((a, b) => {
                  let av: number, bv: number;
                  switch (lecapsSortKey) {
                    case "tem":
                      av = a.tem;
                      bv = b.tem;
                      break;
                    case "tea":
                      av = a.tea;
                      bv = b.tea;
                      break;
                    case "vpv":
                      av = a.vpv;
                      bv = b.vpv;
                      break;
                    case "precio":
                      av = a.precio ?? 0;
                      bv = b.precio ?? 0;
                      break;
                    case "dias":
                      av = a.diasAlVencimiento;
                      bv = b.diasAlVencimiento;
                      break;
                    default:
                      av = 0;
                      bv = 0;
                  }
                  return lecapsSortDir === "asc" ? av - bv : bv - av;
                });
                const lsIcon = (k: string) =>
                  lecapsSortKey === k ? (lecapsSortDir === "asc" ? "\u2191" : "\u2193") : "";
                return (
                  <table className="mono w-full text-xs">
                    <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                      <tr className="border-b border-border/60">
                        <th className="px-2 py-2 text-left">Ticker</th>
                        <th className="px-2 py-2 text-right">
                          <button
                            onClick={() => toggleLecapsSort("tea")}
                            className="font-medium hover:text-foreground"
                          >
                            TEA {lsIcon("tea")}
                          </button>
                        </th>
                        <th className="px-2 py-2 text-right">
                          <button
                            onClick={() => toggleLecapsSort("tem")}
                            className="font-medium hover:text-foreground"
                          >
                            TEM {lsIcon("tem")}
                          </button>
                        </th>
                        <th className="px-2 py-2 text-right">
                          <button
                            onClick={() => toggleLecapsSort("precio")}
                            className="font-medium hover:text-foreground"
                          >
                            Precio {lsIcon("precio")}
                          </button>
                        </th>
                        <th className="px-2 py-2 text-right">Plazo</th>
                        <th className="px-2 py-2 text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedLecaps.map((l) => (
                        <tr key={l.ticker} className="border-b border-border/30">
                          <td className="px-2 py-2">
                            <span className="inline-block rounded-md border border-purple-800 bg-purple-900/40 px-1 py-0.5 text-[13px] text-purple-300">
                              LECAP
                            </span>
                            <span className="ml-1.5 font-medium">{l.ticker}</span>
                          </td>
                          <td className="px-2 py-2 text-right text-green-400">
                            {l.tea > 0 ? fmtNum(l.tea, 2) + "%" : "\u2014"}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <div className="text-yellow-400">
                              {l.tem > 0 ? fmtNum(l.tem, 2) + "%" : "\u2014"}
                            </div>
                            {(() => {
                              const r = riesgoNivel(l.tem ?? null);
                              return r ? (
                                <span
                                  className={`inline-block rounded border px-1 py-0.5 text-[12px] leading-tight ${r.clase}`}
                                >
                                  {r.label}
                                </span>
                              ) : null;
                            })()}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {l.precio != null ? `$ ${fmtNum(l.precio, 2)}` : "\u2014"}
                            {l.precioFuente === "iol" && (
                              <span className="ml-1 text-[13px] text-cyan-400">IOL</span>
                            )}
                            {l.precioFuente === "argentinadatos" && (
                              <span className="ml-1 text-[13px] text-muted-foreground">impl.</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right text-[13px]">
                            {plazoRestante(l.diasAlVencimiento)}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              onClick={() => onSelectTicker(l.ticker)}
                              className="rounded border border-[#C9A84C]/50 px-1.5 py-0.5 text-[13px] text-[#C9A84C] hover:bg-[#C9A84C]/10 transition-colors"
                            >
                              Detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function CurvaSubTab({ data }: { data: MonitorResult | null }) {
  const [sortKey, setSortKey] = useState("dias");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filterCat, setFilterCat] = useState<string>("Todas");
  const [news, setNews] = useState<Array<{ ticker: string; title: string; link: string }>>([]);
  const fnYahooSearch = useServerFn(searchYahooNews);

  const items = useMemo(() => {
    if (!data) return {};
    const rows: Array<{
      ticker: string;
      categoria: string;
      tir: number | null;
      tem: number | null;
      paridad: number;
      precio: number;
      duration: number | null;
      dias: number;
      vencimiento: string;
      nombre: string;
    }> = [];

    for (const b of data.bonos) {
      // Dumrauf: TEM = (1+TIR)^(1/12) - 1 (metadata.motor_calculo.tem de RENTA_FIJA_COMPLETA.json)
      const temReal = b.tir != null ? Math.pow(1 + b.tir, 1 / 12) - 1 : null;
      rows.push({
        ticker: b.ticker,
        categoria: b.tipo,
        tir: b.tir,
        tem: temReal,
        paridad: b.paridad,
        precio: b.precio,
        duration: b.durationMacaulay,
        dias: b.diasAlVencimiento,
        vencimiento: b.vencimiento,
        nombre: BONOS_DB[b.ticker]?.descripcion ?? b.ticker,
      });
    }
    for (const l of data.lecaps ?? []) {
      rows.push({
        ticker: l.ticker,
        categoria: "LECAP",
        tir: l.tea != null ? l.tea / 100 : null,
        tem: l.tem,
        paridad: l.precio != null ? (l.precio / l.vpv) * 100 : 0,
        precio: l.precio ?? 0,
        duration: l.diasAlVencimiento / 365,
        dias: l.diasAlVencimiento,
        vencimiento: l.fechaVencimiento,
        nombre: "Letra del Tesoro",
      });
    }

    const grouped: Record<string, typeof rows> = {};
    for (const r of rows) {
      if (!grouped[r.categoria]) grouped[r.categoria] = [];
      grouped[r.categoria].push(r);
    }
    for (const g of Object.keys(grouped)) {
      grouped[g].sort((a, b) => a.dias - b.dias);
    }
    return grouped;
  }, [data]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const allRows = useMemo(() => {
    const order = ["Hard Dollar", "Dollar-Linked", "CER", "LECAP", "Tasa Fija ARS", "TAMAR"];
    const all: (typeof items)[string] = [];
    for (const cat of order) { if (items[cat]) all.push(...items[cat]); }
    return all;
  }, [items]);

  const sortedRows = useMemo(() => {
    return [...allRows].filter((r) => filterCat === "Todas" || r.categoria === filterCat).sort((a, b) => {
      const av = a[sortKey as keyof typeof a] ?? 0;
      const bv = b[sortKey as keyof typeof b] ?? 0;
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
  }, [allRows, filterCat, sortKey, sortDir]);

  const sortIcon = (k: string) => (sortKey === k ? (sortDir === "asc" ? "\u2191" : "\u2193") : "");

  const categorias = Object.keys(items);
  const colores: Record<string, string> = {
    "Hard Dollar": "#4ade80",
    "Dollar-Linked": "#60a5fa",
    CER: "#facc15",
    LECAP: "#c084fc",
    "Tasa Fija ARS": "#fb923c",
    TAMAR: "#f472b6",
  };

  const FILTROS = ["Todas", "Hard Dollar", "Dollar-Linked", "CER", "LECAP", "Tasa Fija ARS", "TAMAR"];

  // Obtener noticias para activos con mayor/menor TIR
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const validos = allRows.filter((r) => r.tir != null).sort((a, b) => (b.tir ?? 0) - (a.tir ?? 0));
    const top = validos.slice(0, 3);
    const bottom = validos.slice(-3);
    const targets = [...top, ...bottom];
    Promise.all(
      targets.map(async (r) => {
        try {
          const results = await fnYahooSearch({ data: { q: r.ticker, count: 1 } });
          return results?.[0] ?? null;
        } catch { return null; }
      }),
    ).then((results) => {
      if (!cancelled) setNews(results.filter(Boolean) as typeof news);
    });
    return () => { cancelled = true; };
  }, [data, allRows, fnYahooSearch]);

  if (!data) return <EmptyState text="Cargando datos del monitor..." />;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-[13px] text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">¿Qué es la curva de rendimientos?</span>{" "}
        Muestra la relación entre el tiempo al vencimiento (eje horizontal) y la tasa de rendimiento
        (eje vertical) para distintos tipos de bonos. Una curva con pendiente positiva indica que
        los bonos más largos pagan más tasa. Cada color representa una categoría de bono.
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f}
            onClick={() => setFilterCat(f)}
            className={`rounded px-2 py-1 font-mono text-[13px] transition-colors ${
              filterCat === f
                ? "border border-primary/60 bg-primary/10 text-foreground"
                : "border border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Scatter chart con tooltip mejorado */}
      <div className="rounded-lg border border-border/40 bg-background/40 p-3">
        <h3 className="mb-2 font-mono text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
          Curva de Rendimiento (TIR / TEA) por categoría
          <span className="ml-2 font-normal text-[13px] text-muted-foreground">
            ({filterCat === "Todas" ? "todos los activos" : filterCat}) &middot; {sortedRows.length} instrumentos
          </span>
        </h3>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="dias"
              tick={{ fontSize: 10, fontFamily: "monospace", fill: "#9aa6bd" }}
              stroke="#2b3242"
              label={{ value: "Días al vencimiento", position: "bottom", style: { fontSize: 10, fill: "#9aa6bd" } }}
            />
            <YAxis
              tick={{ fontSize: 10, fontFamily: "monospace", fill: "#9aa6bd" }}
              stroke="#2b3242"
              tickFormatter={(v: number) => (v * 100).toFixed(1) + "%"}
              label={{ value: "TIR / TEA", angle: -90, position: "insideLeft", style: { fontSize: 10, fill: "#9aa6bd" } }}
            />
            <Tooltip
              content={({ active, payload }: any) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload;
                if (!d) return null;
                return (
                  <div className="bg-surface border border-border/60 rounded-lg p-2.5 font-mono text-[14px] space-y-1 shadow-xl">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{d.ticker}</span>
                      <span className="text-[13px] rounded border border-current px-1" style={{ color: colores[d.categoria] ?? "#888", borderColor: (colores[d.categoria] ?? "#888") + "60" }}>
                        {d.categoria}
                      </span>
                    </div>
                    <div className="text-[13px] text-muted-foreground max-w-[200px] truncate">{d.nombre}</div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[13px]">
                      <span className="text-muted-foreground">TIR</span>
                      <span className="text-right font-semibold">{d.tir != null ? (d.tir * 100).toFixed(2) + "%" : "\u2014"}</span>
                      <span className="text-muted-foreground">Paridad</span>
                      <span className="text-right">{d.paridad != null ? d.paridad.toFixed(2) + "%" : "\u2014"}</span>
                      <span className="text-muted-foreground">Precio</span>
                      <span className="text-right">${d.precio != null ? d.precio.toFixed(2) : "\u2014"}</span>
                      <span className="text-muted-foreground">Vencimiento</span>
                      <span className="text-right text-[13px]">{d.vencimiento ?? "\u2014"}</span>
                      <span className="text-muted-foreground">Días</span>
                      <span className="text-right">{d.dias ?? "\u2014"}</span>
                      <span className="text-muted-foreground">Duration</span>
                      <span className="text-right">{d.duration != null ? d.duration.toFixed(1) + "a" : "\u2014"}</span>
                    </div>
                  </div>
                );
              }}
            />
            {categorias.filter((cat) => filterCat === "Todas" || cat === filterCat).map((cat) => (
              <Line
                key={cat}
                type="monotone"
                data={items[cat].filter((r) => r.tir != null).map((r) => ({ ...r, tirVal: r.tir }))}
                dataKey="tirVal"
                name={cat}
                stroke={colores[cat] ?? "#888"}
                dot={{ r: 5, stroke: colores[cat] ?? "#888", strokeWidth: 1.5 }}
                strokeWidth={2}
                connectNulls={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Noticias de mayor y menor TIR */}
      {news.length > 0 && (
        <div className="rounded-lg border border-border/40 bg-background/40 p-3">
          <h3 className="mb-2 font-mono text-[13px] font-medium uppercase tracking-wider text-muted-foreground">
            Noticias destacadas
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {news.map((n, i) => (
              <a
                key={i}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded border border-border/30 bg-muted/5 p-2 hover:border-primary/40 transition-colors"
              >
                <span className="text-[13px] font-mono text-primary">{n.ticker}</span>
                <p className="text-[13px] text-foreground line-clamp-2 mt-0.5">{n.title}</p>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Tabla comparativa */}
      <div className="overflow-x-auto">
        <table className="mono w-full text-xs">
          <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-2 py-2 text-left">
                <button onClick={() => toggleSort("categoria")} className="font-medium hover:text-foreground">
                  Categoría {sortIcon("categoria")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">
                <button onClick={() => toggleSort("ticker")} className="font-medium hover:text-foreground">
                  Ticker {sortIcon("ticker")}
                </button>
              </th>
              <th className="px-2 py-2 text-left">Nombre</th>
              <th className="px-2 py-2 text-right">
                <button onClick={() => toggleSort("tir")} className="font-medium hover:text-foreground">
                  <TooltipHeader label="TIR" tooltip="Tasa Interna de Retorno" /> {sortIcon("tir")}
                </button>
              </th>
              <th className="px-2 py-2 text-right">
                <button onClick={() => toggleSort("tem")} className="font-medium hover:text-foreground">
                  TEM {sortIcon("tem")}
                </button>
              </th>
              <th className="px-2 py-2 text-right">Paridad</th>
              <th className="px-2 py-2 text-right">Precio</th>
              <th className="px-2 py-2 text-right">Plazo</th>
              <th className="px-2 py-2 text-right">Riesgo</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const bonoInfo = BONOS_DB[r.ticker];
              return (
                <tr key={r.ticker} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-2 py-2">
                    <span className="inline-block rounded-md border px-1 py-0.5 text-[13px]" style={{ borderColor: colores[r.categoria] + "60", color: colores[r.categoria] }}>
                      {r.categoria}
                    </span>
                  </td>
                  <td className="px-2 py-2 font-medium">{r.ticker}</td>
                  <td className="px-2 py-2 text-muted-foreground text-[13px] max-w-[120px] truncate">
                    {bonoInfo?.descripcion?.slice(0, 30) ?? (r.categoria === "LECAP" ? "Letra del Tesoro" : "\u2014")}
                  </td>
                  <td className={`px-2 py-2 text-right ${colorPorTIR(r.tir)}`}>
                    {r.tir != null ? (r.tir * 100).toFixed(2) + "%" : "\u2014"}
                  </td>
                  <td className="px-2 py-2 text-right text-yellow-400">
                    {r.tem != null ? r.tem.toFixed(2) + "%" : "\u2014"}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">
                    {r.paridad != null ? r.paridad.toFixed(1) + "%" : "\u2014"}
                  </td>
                  <td className="px-2 py-2 text-right text-muted-foreground">
                    ${r.precio != null ? r.precio.toFixed(2) : "\u2014"}
                  </td>
                  <td className="px-2 py-2 text-right text-[13px]">{plazoRestante(r.dias)}</td>
                  <td className="px-2 py-2 text-right">
                    {(() => { const val = r.tir != null ? r.tir * 100 : r.tem; const rl = riesgoNivel(val); return rl ? <span className={`inline-block rounded border px-1 py-0.5 text-[12px] leading-tight ${rl.clase}`}>{rl.label}</span> : null; })()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ContextoMacroSubTab({ data }: { data: MonitorResult | null }) {
  const [badlar, setBadlar] = useState<number | null>(null);
  const [riesgoPais, setRiesgoPais] = useState<number | null>(null);
  const [inflacionAA, setInflacionAA] = useState<number | null>(null);
  const [inflacionMM, setInflacionMM] = useState<number | null>(null);
  const [reservas, setReservas] = useState<number | null>(null);
  const [contextoLoaded, setContextoLoaded] = useState(false);

  useEffect(() => {
    if (contextoLoaded) return;
    setContextoLoaded(true);
    Promise.allSettled([
      fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/1")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacion")
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([badlarR, reservasR, rpR, infAnualR, infMensualR]) => {
      if (badlarR.status === "fulfilled" && badlarR.value?.results?.[0]?.detalle) {
        const d = badlarR.value.results[0].detalle;
        if (d.length > 0) setBadlar(d[d.length - 1].valor);
      }
      if (reservasR.status === "fulfilled" && reservasR.value?.results?.[0]?.detalle) {
        const d = reservasR.value.results[0].detalle;
        if (d.length > 0) setReservas(d[d.length - 1].valor);
      }
      if (rpR.status === "fulfilled" && rpR.value?.valor != null) setRiesgoPais(rpR.value.valor);
      if (
        infAnualR.status === "fulfilled" &&
        Array.isArray(infAnualR.value) &&
        infAnualR.value.length > 0
      ) {
        setInflacionAA(infAnualR.value[infAnualR.value.length - 1].valor);
      }
      if (
        infMensualR.status === "fulfilled" &&
        Array.isArray(infMensualR.value) &&
        infMensualR.value.length > 0
      ) {
        setInflacionMM(infMensualR.value[infMensualR.value.length - 1].valor);
      }
    });
  }, [contextoLoaded]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-[13px] text-muted-foreground leading-relaxed">
        <span className="font-medium text-foreground">¿Por qué importa?</span> Las tasas de
        referencia, la inflación y el riesgo país determinan el rendimiento real de los bonos.
        Cuando la inflación supera la tasa que paga un bono, perdés poder adquisitivo. El riesgo
        país refleja la confianza externa en la economía argentina.
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
          <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            BADLAR
          </span>
          <p className="font-mono text-lg text-foreground mt-0.5">
            {badlar != null ? badlar.toFixed(2) + "%" : "\u2014"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">Tasa de referencia bancaria</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
          <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Riesgo País
          </span>
          <p className="font-mono text-lg text-foreground mt-0.5">
            {riesgoPais != null ? riesgoPais.toFixed(0) + " pb" : "\u2014"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">
            {riesgoPais != null && riesgoPais > 800
              ? "Elevado: financiamiento externo caro"
              : riesgoPais != null && riesgoPais > 400
                ? "Moderado: condiciones estables"
                : "Bajo: entorno favorable"}
          </p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
          <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Inflación Anual
          </span>
          <p className="font-mono text-lg text-foreground mt-0.5">
            {inflacionAA != null ? inflacionAA.toFixed(2) + "%" : "\u2014"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">Variación interanual de precios</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
          <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Inflación Mensual
          </span>
          <p className="font-mono text-lg text-foreground mt-0.5">
            {inflacionMM != null ? inflacionMM.toFixed(2) + "%" : "\u2014"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">Variación mensual de precios</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
          <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            TC Oficial
          </span>
          <p className="font-mono text-lg text-foreground mt-0.5">
            {data?.tcOficial != null ? "$" + data.tcOficial.toFixed(2) : "\u2014"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">Dólar Banco Nación</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
          <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            TC MEP
          </span>
          <p className="font-mono text-lg text-foreground mt-0.5">
            {data?.tcMep != null ? "$" + data.tcMep.toFixed(2) : "\u2014"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">Dólar bolsa (GD30)</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
          <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Reservas BCRA
          </span>
          <p className="font-mono text-lg text-foreground mt-0.5">
            {reservas != null ? "$" + (reservas / 1e6).toFixed(1) + "M" : "\u2014"}
          </p>
          <p className="text-[13px] text-muted-foreground mt-1">Reservas internacionales</p>
        </div>
        <div className="rounded-lg border border-border/40 bg-muted/5 p-3">
          <span className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Tasa Real (Fisher exacta)
          </span>
          <p className="font-mono text-lg text-foreground mt-0.5">
            {badlar != null && inflacionMM != null
              ? (((1 + badlar / 100) / (1 + (inflacionMM * 12) / 100)) * 100 - 100).toFixed(2) + "%"
              : "\u2014"}
          </p>
          <TooltipHeader
            label=""
            tooltip="Dumrauf: Fisher exacta (1+ia)/(1+π)-1. La resta simple ia−π subestima la pérdida de poder adquisitivo con inflación alta."
          />
          <p className="text-[13px] text-muted-foreground mt-1">
            {badlar != null && inflacionMM != null
              ? badlar > inflacionMM * 12
                ? "Tasa real positiva (+) preserva capital"
                : "Tasa real negativa (-) pierde poder adq."
              : "(1+BADLAR)/(1+π aa)-1 · no resta simple"}
          </p>
        </div>
      </div>
    </div>
  );
}

interface CalculadoraSubTabProps {
  selectedTicker: string;
  setSelectedTicker: (t: string) => void;
  precioManual: string;
  setPrecioManual: (v: string) => void;
  tasaDevaluacion: string;
  setTasaDevaluacion: (v: string) => void;
  calcLoading: boolean;
  setCalcLoading: (v: boolean) => void;
  resultado: RendimientoBono | null;
  setResultado: (r: RendimientoBono | null) => void;
  precios: PreciosResult | null;
  setPrecios: (p: PreciosResult | null) => void;
  fnPrecios: ReturnType<typeof useServerFn<typeof getBonoPrecioYTCOficial>>;
  fnCalc: ReturnType<typeof useServerFn<typeof calcularRendimientosBono>>;
  sessionId?: string;
}

function CalculadoraSubTab({
  selectedTicker,
  setSelectedTicker,
  precioManual,
  setPrecioManual,
  tasaDevaluacion,
  setTasaDevaluacion,
  calcLoading,
  setCalcLoading,
  resultado,
  setResultado,
  precios,
  setPrecios,
  fnPrecios,
  fnCalc,
  sessionId,
}: CalculadoraSubTabProps) {
  const bonoInfo = BONOS_DB[selectedTicker];
  const autoFetchedRef = useRef<string | null>(null);

  const autoFillPrice = useCallback(
    async (ticker?: string) => {
      const t = ticker ?? selectedTicker;
      autoFetchedRef.current = t;
      setCalcLoading(true);
      try {
        const p = await fnPrecios({ data: { tickers: [t], sessionId } });
        setPrecios(p);
        const iolPrice = p.precios[t]?.precio;
        if (iolPrice && iolPrice > 0) {
          setPrecioManual(iolPrice.toString());
          const r = await fnCalc({
            data: {
              ticker: t,
              precioPorCada100VN: iolPrice,
              tcOficial: p.tcOficial ?? undefined,
              tasaDevaluacionAnual: parseFloat(tasaDevaluacion) / 100,
            },
          });
          setResultado(r as RendimientoBono);
        }
      } finally {
        setCalcLoading(false);
      }
    },
    [selectedTicker, tasaDevaluacion, fnPrecios, fnCalc, sessionId],
  );

  // Auto-fetch price from IOL when ticker changes
  useEffect(() => {
    if (selectedTicker && autoFetchedRef.current !== selectedTicker) {
      autoFillPrice(selectedTicker);
    }
  }, [selectedTicker, autoFillPrice]);

  const handleCalcular = async () => {
    setCalcLoading(true);
    try {
      let precio = parseFloat(precioManual);
      if (!precio || precio <= 0) {
        const p = await fnPrecios({ data: { tickers: [selectedTicker], sessionId } });
        setPrecios(p);
        precio = p.precios[selectedTicker]?.precio ?? 0;
        if (precio > 0) setPrecioManual(precio.toString());
      }
      if (precio <= 0) {
        setCalcLoading(false);
        return;
      }
      const r = await fnCalc({
        data: {
          ticker: selectedTicker,
          precioPorCada100VN: precio,
          tcOficial: precios?.tcOficial ?? undefined,
          tasaDevaluacionAnual: parseFloat(tasaDevaluacion) / 100,
        },
      });
      setResultado(r as RendimientoBono);
    } finally {
      setCalcLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
        <div>
          <label className="mono text-[14px] text-muted-foreground">Bono</label>
          <select
            value={selectedTicker}
            onChange={(e) => {
              setSelectedTicker(e.target.value);
              setResultado(null);
              setPrecioManual("");
            }}
            className="mt-1 w-full rounded-md border border-border bg-input px-2 py-2 text-sm font-mono"
          >
            {BONOS_TICKERS.map((t) => (
              <option key={t} value={t}>
                {t} · {BONOS_DB[t]?.descripcion?.slice(0, 40)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mono text-[14px] text-muted-foreground">Precio (c/100 VN)</label>
          <div className="flex gap-1 mt-1">
            <input
              type="number"
              value={precioManual}
              onChange={(e) => setPrecioManual(e.target.value)}
              placeholder="Ej: 95.5"
              className="flex-1 rounded-md border border-border bg-input px-2 py-2 text-sm font-mono"
            />
            <button
              onClick={() => autoFillPrice()}
              disabled={calcLoading}
              className="shrink-0 rounded-md border border-primary/50 bg-primary/10 px-2 py-2 text-[14px] font-mono text-primary hover:bg-primary/20 disabled:opacity-50"
              title="Obtener precio desde IOL"
            >
              IOL
            </button>
          </div>
        </div>
        {bonoInfo?.tipo === "Dollar-Linked" && (
          <div>
            <label className="mono text-[14px] text-muted-foreground">Tasa deval. % (DL)</label>
            <input
              type="number"
              value={tasaDevaluacion}
              onChange={(e) => setTasaDevaluacion(e.target.value)}
              placeholder="30"
              className="mt-1 w-full rounded-md border border-border bg-input px-2 py-2 text-sm font-mono"
            />
          </div>
        )}
        <div>
          <label className="mono text-[14px] text-muted-foreground">Vencimiento</label>
          <div className="mt-1 w-full rounded-md border border-border bg-muted/30 px-2 py-2 text-sm font-mono">
            {bonoInfo ? formatearFecha(bonoInfo.vencimiento) : "\u2014"}
          </div>
        </div>
        <div className="flex items-end">
          <button
            onClick={handleCalcular}
            disabled={calcLoading}
            className="w-full rounded-md bg-[#C9A84C] px-3 py-2 text-sm font-medium text-black hover:bg-[#C9A84C]/90 disabled:opacity-50"
          >
            {calcLoading ? "Calculando…" : "Calcular TIR"}
          </button>
        </div>
      </div>

      {resultado && !("error" in resultado) && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">TIR (XIRR)</div>
              <div className={`mono mt-1 text-lg font-medium ${colorPorTIR(resultado.tir)}`}>
                {resultado.tir != null ? fmtPct(resultado.tir * 100, 2) : "\u2014"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Duration Macaulay</div>
              <div className="mono mt-1 text-lg">
                {resultado.durationMacaulay != null
                  ? fmtNum(resultado.durationMacaulay, 2) + " a"
                  : "\u2014"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Duration Mod.</div>
              <div className="mono mt-1 text-lg">
                {resultado.durationModificada != null
                  ? fmtNum(resultado.durationModificada, 2) + " a"
                  : "\u2014"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Paridad</div>
              <div className="mono mt-1 text-lg">{fmtNum(resultado.paridad, 2)}%</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Precio Técnico</div>
              <div className="mono mt-1 text-lg">{fmtNum(resultado.precioTecnico, 2)}</div>
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
            <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
              Flujo de fondos proyectado
            </div>
            <div className="overflow-x-auto">
              <table className="mono w-full text-xs">
                <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                  <tr className="border-b border-border/60">
                    <th className="px-2 py-2 text-left">Fecha</th>
                    <th className="px-2 py-2 text-right">Días</th>
                    <th className="px-2 py-2 text-left">Tipo</th>
                    <th className="px-2 py-2 text-right">Monto</th>
                    <th className="px-2 py-2 text-right">PV al TIR</th>
                    <th className="px-2 py-2 text-right">% del Precio</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.flujos.map((f, i) => (
                    <tr key={i} className="border-b border-border/30">
                      <td className="px-2 py-2">{formatearFecha(f.fecha)}</td>
                      <td className="px-2 py-2 text-right">{f.dias}</td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-block rounded px-1 py-0.5 text-[13px] ${
                            f.tipo === "cupon+amortizacion"
                              ? "bg-blue-900/30 text-blue-300"
                              : f.tipo === "amortizacion"
                                ? "bg-yellow-900/30 text-yellow-300"
                                : "bg-green-900/30 text-green-300"
                          }`}
                        >
                          {f.tipo === "cupon+amortizacion" ? "Cupón+Amort." : f.tipo}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-medium">{fmtNum(f.monto, 2)}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(f.pvAlTIR, 2)}</td>
                      <td className="px-2 py-2 text-right">{fmtNum(f.pctDelPrecio, 1)}%</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border/60 font-medium">
                    <td className="px-2 py-2" colSpan={3}>
                      Total
                    </td>
                    <td className="px-2 py-2 text-right">
                      {fmtNum(
                        resultado.flujos.reduce((s, f) => s + f.monto, 0),
                        2,
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {fmtNum(
                        resultado.flujos.reduce((s, f) => s + f.pvAlTIR, 0),
                        2,
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {fmtNum(
                        resultado.flujos.reduce((s, f) => s + f.pctDelPrecio, 0),
                        1,
                      )}
                      %
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Dynamic investment breakdown */}
          {(() => {
            const precio = resultado.precioPorCada100VN;
            const totalFlujos = resultado.flujos.reduce((s, f) => s + f.monto, 0);
            const Tecnico = resultado.precioTecnico;
            const gananciaCapital = totalFlujos - precio;
            const gananciaPct = precio > 0 ? (gananciaCapital / precio) * 100 : 0;
            const flujoAnual =
              resultado.diasAlVencimiento > 0
                ? (totalFlujos / resultado.diasAlVencimiento) * 365
                : 0;
            const rendimientoSimple = precio > 0 ? ((totalFlujos - precio) / precio) * 100 : 0;
            return (
              <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
                <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                  Resumen de inversión
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div className="rounded-md border border-border/40 bg-muted/10 p-2.5">
                    <span className="text-muted-foreground text-[13px]">Inversión</span>
                    <div className="text-base font-semibold">${fmtNum(precio, 2)}</div>
                    <div className="text-[13px] text-muted-foreground">c/100 VN</div>
                  </div>
                  <div className="rounded-md border border-border/40 bg-muted/10 p-2.5">
                    <span className="text-muted-foreground text-[13px]">Ganancia de Capital</span>
                    <div
                      className={`text-base font-semibold ${gananciaCapital >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {gananciaCapital >= 0 ? "+" : ""}${fmtNum(gananciaCapital, 2)}
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {gananciaPct >= 0 ? "+" : ""}
                      {fmtNum(gananciaPct, 1)}%
                    </div>
                  </div>
                  <div className="rounded-md border border-border/40 bg-muted/10 p-2.5">
                    <span className="text-muted-foreground text-[13px]">Cupón + Amort.</span>
                    <div className="text-base font-semibold">${fmtNum(totalFlujos, 2)}</div>
                    <div className="text-[13px] text-muted-foreground">cada $100 VN</div>
                  </div>
                  <div className="rounded-md border border-border/40 bg-muted/10 p-2.5">
                    <span className="text-muted-foreground text-[13px]">Rendimiento Simple</span>
                    <div
                      className={`text-base font-semibold ${rendimientoSimple >= 0 ? "text-green-400" : "text-red-400"}`}
                    >
                      {rendimientoSimple >= 0 ? "+" : ""}
                      {fmtNum(rendimientoSimple, 1)}%
                    </div>
                    <div className="text-[13px] text-muted-foreground">
                      {(resultado.diasAlVencimiento > 0
                        ? rendimientoSimple / (resultado.diasAlVencimiento / 365)
                        : 0
                      ).toFixed(1)}
                      % anual
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[13px] font-mono text-muted-foreground bg-muted/5 rounded-md p-2.5">
                  <span>
                    • Invertís <strong className="text-foreground">${fmtNum(precio, 2)}</strong> por
                    cada $100 VN
                  </span>
                  <span>
                    • Al vencimiento recibís{" "}
                    <strong className="text-foreground">${fmtNum(totalFlujos, 2)}</strong> en flujos
                    (cupones + amortización)
                  </span>
                  <span>
                    • Ganancia de capital:{" "}
                    <strong className={gananciaCapital >= 0 ? "text-green-400" : "text-red-400"}>
                      ${fmtNum(Math.abs(gananciaCapital), 2)}
                    </strong>
                  </span>
                  <span>
                    • Rendimiento simple:{" "}
                    <strong className={rendimientoSimple >= 0 ? "text-green-400" : "text-red-400"}>
                      {fmtNum(rendimientoSimple, 1)}%
                    </strong>
                  </span>
                  <span>
                    • TIR (XIRR):{" "}
                    <strong
                      className={
                        resultado.tir != null && resultado.tir >= 0
                          ? "text-green-400"
                          : "text-red-400"
                      }
                    >
                      {resultado.tir != null ? fmtPct(resultado.tir * 100, 2) : "—"}
                    </strong>
                  </span>
                </div>
              </div>
            );
          })()}
        </>
      )}

      {(resultado as any)?.error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {(resultado as any).error}
        </div>
      )}
    </div>
  );
}

interface DetalleSubTabProps {
  ticker: string;
  setTicker: (t: string) => void;
  resultado: RendimientoBono | null;
  setResultado: (r: RendimientoBono | null) => void;
  calcLoading: boolean;
  setCalcLoading: (v: boolean) => void;
  fnCalc: ReturnType<typeof useServerFn<typeof calcularRendimientosBono>>;
  precios: PreciosResult | null;
  setPrecios: (p: PreciosResult | null) => void;
  fnPrecios: ReturnType<typeof useServerFn<typeof getBonoPrecioYTCOficial>>;
  sessionId?: string;
}

function DetalleSubTab({
  ticker,
  setTicker,
  resultado,
  setResultado,
  calcLoading,
  setCalcLoading,
  fnCalc,
  precios,
  setPrecios,
  fnPrecios,
  sessionId,
}: DetalleSubTabProps) {
  // Si el ticker termina en D o C, usar el base para lookup en DB
  const baseTicker = ticker.replace(/[DC]$/, "");
  const bonoInfo = BONOS_DB[baseTicker] ?? BONOS_DB[ticker];

  const loadDetalle = useCallback(() => {
    if (!ticker) return;
    setResultado(null);
    setCalcLoading(true);
    const calcTicker = baseTicker.length > 0 && BONOS_DB[baseTicker] ? baseTicker : ticker;
    fnPrecios({ data: { tickers: [ticker], sessionId } })
      .then((p) => {
        setPrecios(p);
        const precioIOL = p.precios[ticker]?.precio;
        if (precioIOL && precioIOL > 0) {
          return fnCalc({ data: { ticker: calcTicker, precioPorCada100VN: precioIOL } });
        } else {
          setResultado({
            error: `Sin precio IOL en vivo para ${ticker}. Conectá IOL en el panel superior para ver cotización real.`,
          } as any);
        }
      })
      .then((r) => {
        if (r) setResultado(r as RendimientoBono);
      })
      .finally(() => setCalcLoading(false));
  }, [ticker, baseTicker, sessionId]);

  useEffect(() => {
    if (ticker) loadDetalle();
  }, [ticker, loadDetalle]);

  // Auto-refresh every 60s when a bond is selected
  useEffect(() => {
    if (!ticker) return;
    const interval = setInterval(loadDetalle, 60000);
    return () => clearInterval(interval);
  }, [ticker, loadDetalle]);

  const [detalleTab, setDetalleTab] = useState<"general" | "rendimiento" | "tecnico" | "historico">("general");
  const [historicoData, setHistoricoData] = useState<SerieHistoricaResult | null>(null);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoRange, setHistoricoRange] = useState("6M");

  const fnSerie = useServerFn(getSerieHistoricaConTIR);

  function loadHistorico() {
    if (historicoLoading || !ticker) return;
    setHistoricoLoading(true);
    const hasta = new Date().toISOString().split("T")[0];
    let desde: string;
    switch (historicoRange) {
      case "1M": desde = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]; break;
      case "3M": desde = new Date(Date.now() - 90 * 86400000).toISOString().split("T")[0]; break;
      case "6M": desde = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0]; break;
      case "1A": desde = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0]; break;
      default: desde = new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0];
    }
    fnSerie({ data: { ticker, fechaDesde: desde, fechaHasta: hasta, sessionId } })
      .then((r) => setHistoricoData(r as unknown as SerieHistoricaResult))
      .finally(() => setHistoricoLoading(false));
  }

  useEffect(() => {
    if (detalleTab === "historico" && ticker) loadHistorico();
  }, [detalleTab, ticker, historicoRange]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="sm:col-span-3">
          <label className="mono text-[14px] text-muted-foreground">Bono</label>
          <select
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-input px-2 py-2 text-sm font-mono"
          >
            {BONOS_TICKERS.map((t) => (
              <option key={t} value={t}>
                {t} · {BONOS_DB[t]?.descripcion?.slice(0, 50)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <div className="w-full space-y-1">
            <span
              className={`inline-block rounded-md border px-2 py-0.5 text-[13px] ${bonoInfo ? badgeTipoBono(bonoInfo.tipo) : ""}`}
            >
              {bonoInfo?.tipo ?? "—"}
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 border-b border-border/40 pb-1">
        {(["general", "rendimiento", "tecnico", "historico"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setDetalleTab(t)}
            className={`font-mono text-[13px] px-2.5 py-1 rounded-t border border-transparent transition-colors ${detalleTab === t ? "border-border/60 border-b-transparent bg-background/40 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "general"
              ? "Datos generales"
              : t === "rendimiento"
                ? "Rendimiento"
                : t === "tecnico"
                  ? "Datos técnicos"
                  : "Histórico TIR/Paridad"}
          </button>
        ))}
      </div>

      {calcLoading && <EmptyState text="Cargando detalles…" />}

      {bonoInfo && detalleTab === "general" && (
        <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
          <p className="text-[14px] text-muted-foreground mb-3">{bonoInfo.descripcion}</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
            {bonoInfo.isin && (
              <>
                <span className="text-muted-foreground">ISIN</span>
                <span className="text-right">{bonoInfo.isin}</span>
              </>
            )}
            {bonoInfo.jurisdiccion && (
              <>
                <span className="text-muted-foreground">Jurisdicción</span>
                <span className="text-right">{bonoInfo.jurisdiccion}</span>
              </>
            )}
            {bonoInfo.tipoCupon && (
              <>
                <span className="text-muted-foreground">Tipo de cupón</span>
                <span className="text-right">{bonoInfo.tipoCupon}</span>
              </>
            )}
            {bonoInfo.moneda && (
              <>
                <span className="text-muted-foreground">Moneda</span>
                <span className="text-right">{bonoInfo.moneda}</span>
              </>
            )}
            {bonoInfo.frecuenciaPago && (
              <>
                <span className="text-muted-foreground">Frecuencia de pago</span>
                <span className="text-right">{bonoInfo.frecuenciaPago}</span>
              </>
            )}
            {bonoInfo.convencionDias && (
              <>
                <span className="text-muted-foreground">Convención de conteo de días</span>
                <span className="text-right">{bonoInfo.convencionDias}</span>
              </>
            )}
            <span className="text-muted-foreground">Vencimiento</span>
            <span className="text-right">{formatearFecha(bonoInfo.vencimiento)}</span>
            {bonoInfo.tipoAmortizacion && (
              <>
                <span className="text-muted-foreground">Tipo de amortización</span>
                <span className="text-right">{bonoInfo.tipoAmortizacion}</span>
              </>
            )}
            {bonoInfo.montoEmision && bonoInfo.montoEmision > 0 && (
              <>
                <span className="text-muted-foreground">Monto de emisión</span>
                <span className="text-right">{fmtNum(bonoInfo.montoEmision, 0)}</span>
              </>
            )}
            {bonoInfo.cuponAnual != null && (
              <>
                <span className="text-muted-foreground">Cupón anual</span>
                <span className="text-right">{bonoInfo.cuponAnual}%</span>
              </>
            )}
            {bonoInfo.valorPar != null && (
              <>
                <span className="text-muted-foreground">Valor par</span>
                <span className="text-right">{bonoInfo.valorPar}</span>
              </>
            )}
          </div>
        </div>
      )}

      {resultado && !("error" in resultado) && detalleTab === "rendimiento" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">TIR (XIRR)</div>
              <div className={`mono mt-1 text-lg font-medium ${colorPorTIR(resultado.tir)}`}>
                {resultado.tir != null ? fmtPct(resultado.tir * 100, 2) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">TNA</div>
              <div className="mono mt-1 text-lg">
                {resultado.tna != null
                  ? fmtPct(resultado.tna * 100, 2)
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">TEA</div>
              <div className="mono mt-1 text-lg">
                {resultado.tea != null
                  ? fmtPct(resultado.tea * 100, 2)
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Precio</div>
              <div className="mono mt-1 text-lg">$ {fmtNum(resultado.precioPorCada100VN, 2)}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Paridad</div>
              <div className="mono mt-1 text-lg">{fmtNum(resultado.paridad, 2)}%</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Intereses acumulados</div>
              <div className="mono mt-1 text-lg">
                {resultado.interesesCorridos != null ? fmtNum(resultado.interesesCorridos, 4) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Current yield</div>
              <div className="mono mt-1 text-lg">
                {resultado.precioPorCada100VN > 0 && bonoInfo?.cuponAnual != null
                  ? fmtPct((bonoInfo.cuponAnual / resultado.precioPorCada100VN) * 100, 2)
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Precio dirty</div>
              <div className="mono mt-1 text-lg">
                {resultado.precioDirty != null ? "$ " + fmtNum(resultado.precioDirty, 4) : "—"}
              </div>
            </div>
          </div>
        </div>
      )}

      {resultado && !("error" in resultado) && detalleTab === "tecnico" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Duration (nominal)</div>
              <div className="mono mt-1 text-lg">
                {resultado.durationMacaulay != null ? fmtNum(resultado.durationMacaulay, 3) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Macaulay duration</div>
              <div className="mono mt-1 text-lg">
                {resultado.durationMacaulay != null ? fmtNum(resultado.durationMacaulay, 3) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Duration Mod.</div>
              <div className="mono mt-1 text-lg">
                {resultado.durationModificada != null
                  ? fmtNum(resultado.durationModificada, 3) + " a"
                  : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Convexidad</div>
              <div className="mono mt-1 text-lg">
                {resultado.convexity != null ? fmtNum(resultado.convexity, 3) : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Precio Técnico</div>
              <div className="mono mt-1">{fmtNum(resultado.precioTecnico, 4)}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Valor técnico</div>
              <div className="mono mt-1">{fmtNum(resultado.precioTecnico, 4)}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Intereses acumulados</div>
              <div className="mono mt-1">{resultado.interesesCorridos != null ? fmtNum(resultado.interesesCorridos, 4) : "—"}</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Días al Vto.</div>
              <div className="mono mt-1">{fmtNum(resultado.diasAlVencimiento, 0)} d</div>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="text-[13px] text-muted-foreground">Vencimiento</div>
              <div className="mono mt-1">{formatearFecha(resultado.vencimiento)}</div>
            </div>
          </div>
        </div>
      )}

      {detalleTab === "historico" && (
        <div className="space-y-3">
          {/* Range selector */}
          <div className="flex items-center gap-1">
            {["1M", "3M", "6M", "1A"].map((r) => (
              <button
                key={r}
                onClick={() => setHistoricoRange(r)}
                className={`mono rounded-md px-2 py-1 text-[13px] transition-colors ${
                  historicoRange === r
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "text-muted-foreground border border-border/40 hover:text-foreground"
                }`}
              >
                {r}
              </button>
            ))}
          </div>

          {historicoLoading && <EmptyState text="Cargando histórico…" />}

          {historicoData && historicoData.serie.length > 0 && (
            <div className="rounded-lg border border-border/40 bg-background/40 p-3">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={(() => {
                  const sorted = [...historicoData.serie].sort((a, b) => a.fecha.localeCompare(b.fecha));
                  return sorted.map((p) => ({
                    fecha: p.fecha,
                    tir: p.tir != null ? +(p.tir * 100).toFixed(2) : null,
                    paridad: p.paridad != null ? +p.paridad.toFixed(2) : null,
                    precio: p.precio,
                    intCorridos: p.precio,
                  }));
                })()}>
                  <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis
                    dataKey="fecha"
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v: string) => v?.slice(5, 10) ?? ""}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v: number) => `${v.toFixed(1)}%`}
                    stroke="#4ade80"
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 9 }}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                    stroke="#a855f7"
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#141a28",
                      border: "1px solid #2b3242",
                      borderRadius: 8,
                      fontSize: 11,
                      fontFamily: "monospace",
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === "TIR") return [`${value.toFixed(2)}%`, "TIR"];
                      if (name === "Paridad") return [`${value.toFixed(2)}%`, "Paridad"];
                      return [value, name];
                    }}
                    labelFormatter={(label: string) => `Fecha: ${label}`}
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="tir"
                    stroke="#4ade80"
                    dot={false}
                    strokeWidth={2}
                    name="TIR"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="paridad"
                    stroke="#a855f7"
                    dot={false}
                    strokeWidth={2}
                    name="Paridad"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {historicoData && historicoData.serie.length === 0 && !historicoLoading && (
            <EmptyState text="No hay datos históricos disponibles para este período." />
          )}

          {/* Interpretación dinámica */}
          {historicoData && historicoData.serie.length > 24 && (() => {
            const tirs = historicoData.serie
              .filter((p) => p.tir !== null)
              .map((p) => p.tir as number);
            if (tirs.length < 10) return null;
            const tirsSorted = [...tirs].sort((a, b) => a - b);
            const p25 = tirsSorted[Math.floor(tirsSorted.length * 0.25)];
            const p75 = tirsSorted[Math.floor(tirsSorted.length * 0.75)];
            const ultimaTIR = tirs[tirs.length - 1];
            const paridadActual = historicoData.serie[historicoData.serie.length - 1]?.paridad ?? 100;
            // Tendencia últimas 4 semanas (~20 trading days)
            const ultimas20 = tirs.slice(-20);
            const tendenciaBaja = ultimas20.length >= 5 && ultimas20[ultimas20.length - 1] < ultimas20[0];
            let interpretacion = "";
            if (ultimaTIR > p75) {
              interpretacion = "La TIR está en la zona más alta del período — el mercado le exige más rendimiento a este bono (precio deprimido).";
            } else if (ultimaTIR < p25) {
              interpretacion = "La TIR está en la zona más baja del período — el bono comprimió rendimiento (subió de precio).";
            } else if (paridadActual < 100 && tendenciaBaja) {
              interpretacion = "El bono cotiza bajo la par y su rendimiento viene comprimiendo — puede ser indicio de mayor apetito.";
            } else {
              interpretacion = "La TIR se mantiene en rangos normales para el período analizado.";
            }
            return (
              <div className="rounded-lg border border-border/40 bg-muted/10 p-3 text-[14px] text-muted-foreground leading-relaxed">
                <span className="font-medium text-foreground">Interpretación: </span>
                {interpretacion}
              </div>
            );
          })()}
        </div>
      )}

      {(resultado as any)?.error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
          {(resultado as any).error}
        </div>
      )}
    </div>
  );
}

interface PortafolioSubTabProps {
  posiciones: Array<{
    ticker: string;
    cantidad: number;
    vn: number;
    precio: number;
    total: number;
  }>;
  setPosiciones: React.Dispatch<
    React.SetStateAction<
      Array<{ ticker: string; cantidad: number; vn: number; precio: number; total: number }>
    >
  >;
  resultado: PortafolioRFResult | null;
  setResultado: React.Dispatch<React.SetStateAction<PortafolioRFResult | null>>;
  busqueda: string;
  setBusqueda: (v: string) => void;
  resultadoBusqueda: InstrumentoSearchResult | null;
  setResultadoBusqueda: (r: InstrumentoSearchResult | null) => void;
  busquedaLoading: boolean;
  setBusquedaLoading: (v: boolean) => void;
  formAgregar: { ticker: string; vn: string; precio: string } | null;
  setFormAgregar: (f: { ticker: string; vn: string; precio: string } | null) => void;
  portafolioLoading: boolean;
  setPortafolioLoading: (v: boolean) => void;
  fnBuscar: ReturnType<typeof useServerFn<typeof buscarInstrumentoIOL>>;
  fnPortafolio: ReturnType<typeof useServerFn<typeof calcularPortafolioRentaFija>>;
  sessionId?: string;
}

function PortafolioSubTab({
  posiciones,
  setPosiciones,
  resultado,
  setResultado,
  busqueda,
  setBusqueda,
  resultadoBusqueda,
  setResultadoBusqueda,
  busquedaLoading,
  setBusquedaLoading,
  formAgregar,
  setFormAgregar,
  portafolioLoading,
  setPortafolioLoading,
  fnBuscar,
  fnPortafolio,
  sessionId,
}: PortafolioSubTabProps) {
  // Auto-add when formAgregar is set from search results
  useEffect(() => {
    if (formAgregar && !posiciones.some((p) => p.ticker === formAgregar.ticker)) {
      const vn = parseFloat(formAgregar.vn) || 100;
      const precio = formAgregar.precio ? parseFloat(formAgregar.precio) : vn;
      setPosiciones((prev) => [
        ...prev,
        { ticker: formAgregar.ticker, cantidad: 1, vn, precio, total: precio },
      ]);
    }
    if (formAgregar) setFormAgregar(null);
  }, [formAgregar]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="text-sm font-medium">Cartera de bonos</div>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Agregá posiciones, buscá instrumentos en IOL y calculá métricas del portafolio.
        </p>

        <div className="mt-3 flex gap-2">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscá un bono (ej: AL29, LECAP)"
            className="flex-1 rounded-md border border-border bg-input px-3 py-2 text-sm"
          />
          <button
            onClick={() => {
              if (!busqueda) return;
              setBusquedaLoading(true);
              fnBuscar({ data: { query: busqueda, sessionId } })
                .then(setResultadoBusqueda)
                .finally(() => setBusquedaLoading(false));
            }}
            disabled={busquedaLoading}
            className="rounded-md border border-primary/50 bg-muted/20 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {busquedaLoading ? "Buscando…" : "Buscar"}
          </button>
        </div>

        {/* Quick-add suggested bonds */}
        <div className="mt-3">
          <div className="mono mb-2 text-[13px] uppercase tracking-[0.18em] text-muted-foreground">
            Bonos disponibles
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BONOS_LIST.filter((b) => !posiciones.some((p) => p.ticker === b.ticker)).map((b) => (
              <button
                key={b.ticker}
                onClick={() => {
                  if (!posiciones.some((p) => p.ticker === b.ticker)) {
                    const precioEst = b.valorPar != null && b.valorPar > 0 ? b.valorPar * 100 : 100;
                    setPosiciones((prev) => [
                      ...prev,
                      {
                        ticker: b.ticker,
                        cantidad: 1,
                        vn: 100,
                        precio: precioEst,
                        total: precioEst,
                      },
                    ]);
                  }
                }}
                className="font-mono text-[13px] px-2 py-1 rounded border border-border/60 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
              >
                {b.ticker}
              </button>
            ))}
          </div>
        </div>

        {resultadoBusqueda && (
          <div className="mt-3">
            {resultadoBusqueda.instrumentos.length === 0 ? (
              <EmptyState text="No se encontraron resultados." />
            ) : (
              <div className="space-y-2">
                {resultadoBusqueda.instrumentos.slice(0, 5).map((inst) => (
                  <div
                    key={inst.ticker}
                    className="flex items-center justify-between rounded-md border border-border/40 bg-muted/20 p-2 text-sm"
                  >
                    <div>
                      <div className="font-medium">{inst.ticker}</div>
                      <div className="text-[13px] text-muted-foreground">{inst.descripcion}</div>
                    </div>
                    <button
                      onClick={() =>
                        setFormAgregar({
                          ticker: inst.ticker,
                          vn: "100",
                          precio: inst.ultimoPrecio?.toString() || "",
                        })
                      }
                      className="rounded-md bg-muted/40 px-2 py-1 text-[14px] hover:bg-muted/60"
                    >
                      Agregar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
        <div className="text-sm font-medium">Posiciones actuales ({posiciones.length})</div>
        {posiciones.length === 0 ? (
          <EmptyState text="Sin posiciones. Buscá y agregá bonos a la cartera." />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="mono w-full text-xs">
              <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-2 py-2 text-left">Ticker</th>
                  <th className="px-2 py-2 text-right">Cantidad</th>
                  <th className="px-2 py-2 text-right">VN</th>
                  <th className="px-2 py-2 text-right">Precio</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {posiciones.map((p) => (
                  <tr key={p.ticker} className="border-b border-border/30">
                    <td className="px-2 py-2 font-medium group relative">
                      {p.ticker}
                      <span className="invisible group-hover:visible absolute left-0 top-full z-10 mt-1 w-64 rounded border border-border/60 bg-surface p-2 text-[13px] text-muted-foreground shadow-lg">
                        {BONOS_DB[p.ticker]?.descripcion ?? "Sin descripción"}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={p.cantidad}
                        onChange={(e) => {
                          const c = Math.max(0, parseInt(e.target.value) || 0);
                          setPosiciones((prev) =>
                            prev.map((x) =>
                              x.ticker === p.ticker
                                ? { ...x, cantidad: c, total: (c * x.vn * x.precio) / 100 }
                                : x,
                            ),
                          );
                        }}
                        className="w-14 rounded border border-border/40 bg-input px-1 py-0.5 text-right text-[14px] font-mono"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={p.vn}
                        onChange={(e) => {
                          const v = Math.max(0, parseFloat(e.target.value) || 0);
                          setPosiciones((prev) =>
                            prev.map((x) =>
                              x.ticker === p.ticker
                                ? { ...x, vn: v, total: (x.cantidad * v * x.precio) / 100 }
                                : x,
                            ),
                          );
                        }}
                        className="w-16 rounded border border-border/40 bg-input px-1 py-0.5 text-right text-[14px] font-mono"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        value={p.precio}
                        onChange={(e) => {
                          const pr = Math.max(0, parseFloat(e.target.value) || 0);
                          setPosiciones((prev) =>
                            prev.map((x) =>
                              x.ticker === p.ticker
                                ? { ...x, precio: pr, total: (x.cantidad * x.vn * pr) / 100 }
                                : x,
                            ),
                          );
                        }}
                        className="w-16 rounded border border-border/40 bg-input px-1 py-0.5 text-right text-[14px] font-mono"
                      />
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">{fmtNum(p.total, 2)}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() =>
                          setPosiciones(posiciones.filter((x) => x.ticker !== p.ticker))
                        }
                        className="text-danger hover:text-red-300"
                      >
                        &times;
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <button
        onClick={() => {
          setPortafolioLoading(true);
          fnPortafolio({ data: { posiciones, sessionId } })
            .then((r) => setResultado(r as unknown as PortafolioRFResult))
            .finally(() => setPortafolioLoading(false));
        }}
        disabled={portafolioLoading || posiciones.length === 0}
        className="w-full rounded-md bg-[#C9A84C] px-4 py-2 font-medium text-black hover:bg-[#C9A84C]/90 disabled:opacity-50"
      >
        {portafolioLoading ? "Calculando…" : "Calcular TIR del portafolio"}
      </button>

      {resultado && (
        <>
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div>
                <div className="text-[13px] text-muted-foreground">TIR Ponderada</div>
                <div
                  className={`mono mt-1 text-lg font-medium ${colorPorTIR(resultado.metricas.tirPonderadaUSD)}`}
                >
                  {resultado.metricas.tirPonderadaUSD != null
                    ? fmtPct(resultado.metricas.tirPonderadaUSD * 100, 2)
                    : "\u2014"}
                </div>
              </div>
              <div>
                <div className="text-[13px] text-muted-foreground">Total USD</div>
                <div className="mono mt-1 text-lg">
                  USD{" "}
                  {resultado.metricas.totalUSD != null
                    ? fmtNum(resultado.metricas.totalUSD, 2)
                    : "\u2014"}
                </div>
              </div>
              <div>
                <div className="text-[13px] text-muted-foreground">Duration Ponderada</div>
                <div className="mono mt-1 text-lg">
                  {resultado.metricas.durationPonderada != null
                    ? fmtNum(resultado.metricas.durationPonderada, 2) + " a"
                    : "\u2014"}
                </div>
              </div>
              <div>
                <div className="text-[13px] text-muted-foreground">Con TIR</div>
                <div className="mono mt-1 text-lg">
                  {(resultado.metricas.pctConTir * 100).toFixed(0)}%
                </div>
              </div>
            </div>
            {resultado.composicion.porTipo.length > 0 && (
              <div className="mt-3">
                <div className="text-[13px] uppercase tracking-wider text-muted-foreground mb-2">
                  Composición por tipo
                </div>
                <div className="flex flex-wrap gap-2">
                  {resultado.composicion.porTipo.map((c) => (
                    <span
                      key={c.nombre}
                      className={`inline-block rounded-md border px-2 py-1 text-[13px] ${badgeTipoBono(c.nombre as TipoBono)}`}
                    >
                      {c.nombre}: {c.pct.toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
            {resultado.composicion.porMoneda.length > 0 && (
              <div className="mt-2">
                <div className="text-[13px] uppercase tracking-wider text-muted-foreground mb-1">
                  Por moneda
                </div>
                <div className="flex flex-wrap gap-2">
                  {resultado.composicion.porMoneda.map((c) => (
                    <span
                      key={c.moneda}
                      className="inline-block rounded-md border border-border/40 bg-muted/20 px-2 py-0.5 text-[13px]"
                    >
                      {c.moneda}: {c.pct.toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Monthly cash flow chart */}
          <FlujoPorMes posiciones={posiciones} />

          {/* Enhanced metrics */}
          <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
            <div className="mono mb-2 text-[13px] uppercase tracking-[0.15em] text-muted-foreground">
              Métricas de cartera de bonos
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-border/40 bg-muted/20 p-2.5">
                <div className="text-[13px] text-muted-foreground">TIR Cartera</div>
                <div
                  className={`mono mt-0.5 text-base font-medium ${colorPorTIR(resultado.metricas.tirPonderadaUSD)}`}
                >
                  {resultado.metricas.tirPonderadaUSD != null
                    ? fmtPct(resultado.metricas.tirPonderadaUSD * 100, 2)
                    : "\u2014"}
                </div>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/20 p-2.5">
                <div className="text-[13px] text-muted-foreground">MOD Duration</div>
                <div className="mono mt-0.5 text-base font-medium">
                  {resultado.metricas.durationPonderada != null
                    ? fmtNum(
                        resultado.metricas.durationPonderada /
                          (1 + (resultado.metricas.tirPonderadaUSD ?? 0)),
                        2,
                      )
                    : "\u2014"}
                </div>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/20 p-2.5">
                <div className="text-[13px] text-muted-foreground">Convexity</div>
                <TooltipHeader label="" tooltip="Elbaum 10.13: convexidad REAL ponderada por valor de mercado sobre flujos descontados (no aproximación D²×1.5)" />
                <div className="mono mt-0.5 text-base font-medium">
                  {resultado.metricas.convexityPonderada != null && resultado.metricas.convexityPonderada > 0
                    ? fmtNum(resultado.metricas.convexityPonderada, 1)
                    : "\u2014"}
                </div>
              </div>
              <div className="rounded-md border border-border/40 bg-muted/20 p-2.5">
                <div className="text-[13px] text-muted-foreground">DV01</div>
                <TooltipHeader label="" tooltip="Elbaum 10.14: DV01 real por posición = ModDur × ValorMercado × 1bp, sumado sobre cartera" />
                <div className="mono mt-0.5 text-base font-medium">
                  USD{" "}
                  {resultado.metricas.dv01Real != null
                    ? fmtNum(resultado.metricas.dv01Real, 2)
                    : "\u2014"}
                </div>
              </div>
            </div>
          </div>

          {/* Payment calendar */}
          <CalendarioPagos posiciones={posiciones} />
        </>
      )}
    </div>
  );
}

function FlujoPorMes({
  posiciones,
}: {
  posiciones: Array<{
    ticker: string;
    cantidad: number;
    vn: number;
    precio: number;
    total: number;
  }>;
}) {
  const flujoChartData = useMemo(() => {
    const porMes: Record<string, number> = {};
    for (const p of posiciones) {
      const bono = BONOS_DB[p.ticker.toUpperCase()];
      if (!bono) continue;
      const escala = (p.cantidad * p.vn) / 100;
      for (const f of bono.flujosPorCada100VN) {
        const mes = f.fecha.slice(0, 7);
        porMes[mes] = (porMes[mes] || 0) + f.monto * escala;
      }
    }
    return Object.entries(porMes)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, monto]) => ({ mes, monto: Math.round(monto * 100) / 100 }));
  }, [posiciones]);

  if (flujoChartData.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mono mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
        Flujo de fondos proyectado por mes
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={flujoChartData}>
            <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
            <XAxis
              dataKey="mes"
              tick={{ fontSize: 9 }}
              tickFormatter={(v) => {
                const [y, m] = (v ?? "").split("-");
                return `${m}/${y.slice(2)}`;
              }}
            />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip
              contentStyle={{
                background: "#141a28",
                border: "1px solid #2b3242",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: number) => [`$${value.toFixed(2)}`, "Flujo"]}
            />
            <Bar dataKey="monto" fill="#10b981" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Detalle de cada flujo individual por instrumento */
function CalendarioPagos({
  posiciones,
}: {
  posiciones: Array<{
    ticker: string;
    cantidad: number;
    vn: number;
    precio: number;
    total: number;
  }>;
}) {
  const pagos = useMemo(() => {
    const rows: Array<{
      ticker: string;
      fecha: string;
      monto: number;
      moneda: string;
      esAmort: boolean;
    }> = [];
    for (const p of posiciones) {
      const bono = BONOS_DB[p.ticker.toUpperCase()];
      if (!bono) continue;
      const escala = (p.cantidad * p.vn) / 100;
      const moneda = bono.monedaFlujos;
      for (const f of bono.flujosPorCada100VN) {
        const esUltimo = f.fecha === bono.vencimiento;
        const esAmort =
          esUltimo &&
          f.monto >
            (bono.flujosPorCada100VN.length > 1
              ? bono.flujosPorCada100VN[bono.flujosPorCada100VN.length - 2]?.monto * 3
              : 0);
        rows.push({ ticker: p.ticker, fecha: f.fecha, monto: f.monto * escala, moneda, esAmort });
      }
    }
    return rows.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [posiciones]);

  if (pagos.length === 0) return null;

  const totalPagos = pagos.reduce((s, r) => s + r.monto, 0);

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Calendario de pagos de rentas y amortizaciones
        </div>
        <button
          onClick={() => {
            const csv =
              "Instrumento,Tipo de pago,Moneda,Monto,Fecha\n" +
              pagos
                .map(
                  (r) =>
                    `${r.ticker},${r.esAmort ? "Amortización" : "Renta"},${r.moneda},${r.monto.toFixed(2)},${r.fecha}`,
                )
                .join("\n");
            const blob = new Blob([csv], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "calendario-pagos.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}
          className="mono rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[13px] text-muted-foreground hover:text-foreground"
        >
          Descargar
        </button>
      </div>
      <div className="overflow-x-auto max-h-80 overflow-y-auto">
        <table className="mono w-full text-xs">
          <thead className="text-[13px] uppercase tracking-wider text-muted-foreground sticky top-0 bg-background/40">
            <tr className="border-b border-border/60">
              <th className="px-2 py-2 text-left">Instrumento</th>
              <th className="px-2 py-2 text-left">Tipo de pago</th>
              <th className="px-2 py-2 text-left">Moneda</th>
              <th className="px-2 py-2 text-right">Monto</th>
              <th className="px-2 py-2 text-right">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {pagos.map((r, i) => (
              <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                <td className="px-2 py-2 font-medium">{r.ticker}</td>
                <td className="px-2 py-2">
                  <span
                    className={`inline-block rounded px-1 py-0.5 text-[13px] ${r.esAmort ? "bg-yellow-900/30 text-yellow-300" : "bg-green-900/30 text-green-300"}`}
                  >
                    {r.esAmort ? "Amortización" : "Renta"}
                  </span>
                </td>
                <td className="px-2 py-2">{r.moneda}</td>
                <td className="px-2 py-2 text-right font-medium">
                  {r.moneda === "USD" ? "USD " : "$ "}
                  {fmtNum(r.monto, 2)}
                </td>
                <td className="px-2 py-2 text-right text-[13px]">{formatearFecha(r.fecha)}</td>
              </tr>
            ))}
            <tr className="border-t border-border/60 font-medium bg-muted/10">
              <td className="px-2 py-2" colSpan={3}>
                Total
              </td>
              <td className="px-2 py-2 text-right">USD {fmtNum(totalPagos, 2)}</td>
              <td className="px-2 py-2" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface HistoricoSubTabProps {
  ticker: string;
  setTicker: (t: string) => void;
  desde: string;
  setDesde: (v: string) => void;
  hasta: string;
  setHasta: (v: string) => void;
  data: SerieHistoricaResult | null;
  setData: (d: SerieHistoricaResult | null) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  fnHistorico: ReturnType<typeof useServerFn<typeof getSerieHistoricaConTIR>>;
  sessionId?: string;
}

const COMPARE_COLORS = [
  "#10b981",
  "#a855f7",
  "#f59e0b",
  "#ef4444",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-surface px-3 py-2 text-[14px] shadow-lg">
      <div className="mb-1 text-[13px] text-muted-foreground">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span>
            {p.name}: {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
            {p.name === "Precio" ? "" : "%"}
          </span>
        </div>
      ))}
    </div>
  );
}

function HistoricoSubTab({
  ticker,
  setTicker,
  desde,
  setDesde,
  hasta,
  setHasta,
  data,
  setData,
  loading,
  setLoading,
  fnHistorico,
  sessionId,
}: HistoricoSubTabProps) {
  const [compareTickers, setCompareTickers] = useState<string[]>([]);
  const [compareData, setCompareData] = useState<Map<string, SerieHistoricaResult>>(new Map());
  const [compareLoading, setCompareLoading] = useState(false);

  function loadHistorico() {
    if (loading) return;
    setLoading(true);
    fnHistorico({ data: { ticker, fechaDesde: desde, fechaHasta: hasta, sessionId } })
      .then(setData)
      .finally(() => setLoading(false));
  }

  function addCompare(t: string) {
    if (compareTickers.includes(t) || t === ticker) return;
    setCompareTickers((prev) => [...prev, t]);
    setCompareLoading(true);
    fnHistorico({ data: { ticker: t, fechaDesde: desde, fechaHasta: hasta, sessionId } })
      .then((result) => {
        setCompareData((prev) => {
          const m = new Map(prev);
          m.set(t, result);
          return m;
        });
      })
      .finally(() => setCompareLoading(false));
  }

  function removeCompare(t: string) {
    setCompareTickers((prev) => prev.filter((x) => x !== t));
    setCompareData((prev) => {
      const m = new Map(prev);
      m.delete(t);
      return m;
    });
  }

  useEffect(() => {
    if (ticker) loadHistorico();
  }, [ticker]);

  const chartData = useMemo(
    () =>
      (data?.serie || [])
        .slice()
        .sort((a, b) => a.fecha.localeCompare(b.fecha))
        .map((p) => ({
          fecha: p.fecha,
          tir: p.tir != null ? +(p.tir * 100).toFixed(2) : null,
          paridad: p.paridad != null ? +p.paridad.toFixed(2) : null,
          precio: p.precio,
        })),
    [data],
  );

  const tickFormat = useCallback((v: string) => {
    if (!v || v.length < 10) return v ?? "";
    return v.slice(0, 7);
  }, []);

  const availableComparables = BONOS_TICKERS.filter(
    (t) => t !== ticker && !compareTickers.includes(t),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        <div>
          <label className="mono text-[14px] text-muted-foreground">Bono</label>
          <select
            value={ticker}
            onChange={(e) => {
              setTicker(e.target.value);
              setCompareTickers([]);
              setCompareData(new Map());
            }}
            className="mt-1 w-full rounded-md border border-border bg-input px-2 py-2 text-sm font-mono"
          >
            {BONOS_TICKERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mono text-[14px] text-muted-foreground">Comparar con</label>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addCompare(e.target.value);
            }}
            className="mt-1 w-full rounded-md border border-border bg-input px-2 py-2 text-sm font-mono"
          >
            <option value="">+ Agregar</option>
            {availableComparables.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          {compareTickers.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {compareTickers.map((t, i) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 font-mono text-[13px] px-1.5 py-0.5 rounded border"
                  style={{ borderColor: COMPARE_COLORS[i % COMPARE_COLORS.length] }}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: COMPARE_COLORS[i % COMPARE_COLORS.length] }}
                  />
                  {t}
                  <button
                    onClick={() => removeCompare(t)}
                    className="text-muted-foreground hover:text-danger"
                  >
                    &times;
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="mono text-[14px] text-muted-foreground">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-input px-2 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mono text-[14px] text-muted-foreground">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-input px-2 py-2 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={loadHistorico}
            disabled={loading}
            className="w-full rounded-md border border-primary/50 bg-muted/20 px-3 py-2 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
          >
            {loading ? "Cargando…" : "Cargar"}
          </button>
        </div>
      </div>

      {loading && <EmptyState text="Cargando serie histórica…" />}

      {data &&
        chartData.length > 0 &&
        (() => {
          // Build combined data for all series
          const compareSeries = [...compareData.entries()].map(([t, d]) => ({
            ticker: t,
            data: d.serie.map((p) => ({
              fecha: p.fecha,
              tir: p.tir != null ? +(p.tir * 100).toFixed(2) : null,
              paridad: p.paridad != null ? +p.paridad.toFixed(2) : null,
            })),
            color: COMPARE_COLORS[compareTickers.indexOf(t) % COMPARE_COLORS.length],
          }));

          return (
            <div className="space-y-4">
              {/* TIR Chart */}
              <div className="glass p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                    Evolución TIR
                  </div>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fontSize: 9 }}
                        tickFormatter={tickFormat}
                        interval={Math.max(1, Math.floor(chartData.length / 12))}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 9 }}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => v + "%"}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 9 }}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="tir"
                        stroke="#10b981"
                        name={ticker}
                        dot={false}
                        strokeWidth={2}
                      />
                      <Area
                        yAxisId="right"
                        type="monotone"
                        dataKey="precio"
                        stroke="#06b6d4"
                        fill="#06b6d4"
                        fillOpacity={0.08}
                        name="Precio"
                        dot={false}
                        strokeWidth={1}
                      />
                      {compareSeries.map((cs) => (
                        <Line
                          key={cs.ticker}
                          yAxisId="left"
                          type="monotone"
                          data={cs.data}
                          dataKey="tir"
                          stroke={cs.color}
                          name={cs.ticker}
                          dot={false}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  <span>
                    <span className="inline-block h-2 w-2 rounded-sm bg-[#10b981] mr-1" />
                    {ticker}
                  </span>
                  <span>
                    <span className="inline-block h-2 w-2 rounded-sm bg-[#06b6d4] mr-1" />
                    Precio
                  </span>
                  {compareSeries.map((cs) => (
                    <span key={cs.ticker}>
                      <span
                        className="inline-block h-2 w-2 rounded-sm mr-1"
                        style={{ background: cs.color }}
                      />
                      {cs.ticker}
                    </span>
                  ))}
                </div>
              </div>

              {/* Paridad Chart */}
              <div className="glass p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="mono text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                    Evolución Paridad
                  </div>
                </div>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="fecha"
                        tick={{ fontSize: 9 }}
                        tickFormatter={tickFormat}
                        interval={Math.max(1, Math.floor(chartData.length / 12))}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{ fontSize: 9 }}
                        domain={["auto", "auto"]}
                        tickFormatter={(v) => v + "%"}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        tick={{ fontSize: 9 }}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip content={<ChartTooltipContent />} />
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="paridad"
                        stroke="#a855f7"
                        name={ticker}
                        dot={false}
                        strokeWidth={2}
                      />
                      <Area
                        yAxisId="right"
                        type="monotone"
                        dataKey="precio"
                        stroke="#06b6d4"
                        fill="#06b6d4"
                        fillOpacity={0.08}
                        name="Precio"
                        dot={false}
                        strokeWidth={1}
                      />
                      {compareSeries.map((cs) => (
                        <Line
                          key={cs.ticker}
                          yAxisId="left"
                          type="monotone"
                          data={cs.data}
                          dataKey="paridad"
                          stroke={cs.color}
                          name={cs.ticker}
                          dot={false}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                        />
                      ))}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
                  <span>
                    <span className="inline-block h-2 w-2 rounded-sm bg-[#a855f7] mr-1" />
                    {ticker}
                  </span>
                  <span>
                    <span className="inline-block h-2 w-2 rounded-sm bg-[#06b6d4] mr-1" />
                    Precio
                  </span>
                  {compareSeries.map((cs) => (
                    <span key={cs.ticker}>
                      <span
                        className="inline-block h-2 w-2 rounded-sm mr-1"
                        style={{ background: cs.color }}
                      />
                      {cs.ticker}
                    </span>
                  ))}
                </div>
              </div>

              <div className="glass overflow-x-auto p-4">
                <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                  Estadísticas del período
                </div>
                <table className="mono w-full text-xs">
                  <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
                    <tr className="border-b border-border/60">
                      <th className="px-2 py-2 text-left">Métrica</th>
                      <th className="px-2 py-2 text-right">{ticker}</th>
                      {compareSeries.map((cs) => (
                        <th key={cs.ticker} className="px-2 py-2 text-right">
                          {cs.ticker}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/30">
                      <td className="px-2 py-2">TIR Mínima</td>
                      <td className="px-2 py-2 text-right">
                        {data.stats?.tirMin != null ? fmtPct(data.stats.tirMin * 100, 2) : "\u2014"}
                      </td>
                      {compareSeries.map((cs) => {
                        const st = compareData.get(cs.ticker)?.stats;
                        return (
                          <td key={cs.ticker} className="px-2 py-2 text-right">
                            {st?.tirMin != null ? fmtPct(st.tirMin * 100, 2) : "\u2014"}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="px-2 py-2">TIR Máxima</td>
                      <td className="px-2 py-2 text-right">
                        {data.stats?.tirMax != null ? fmtPct(data.stats.tirMax * 100, 2) : "\u2014"}
                      </td>
                      {compareSeries.map((cs) => {
                        const st = compareData.get(cs.ticker)?.stats;
                        return (
                          <td key={cs.ticker} className="px-2 py-2 text-right">
                            {st?.tirMax != null ? fmtPct(st.tirMax * 100, 2) : "\u2014"}
                          </td>
                        );
                      })}
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="px-2 py-2">TIR Promedio</td>
                      <td className="px-2 py-2 text-right">
                        {data.stats?.tirPromedio != null
                          ? fmtPct(data.stats.tirPromedio * 100, 2)
                          : "\u2014"}
                      </td>
                      {compareSeries.map((cs) => {
                        const st = compareData.get(cs.ticker)?.stats;
                        return (
                          <td key={cs.ticker} className="px-2 py-2 text-right">
                            {st?.tirPromedio != null ? fmtPct(st.tirPromedio * 100, 2) : "\u2014"}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}

      {!loading && (!data || chartData.length === 0) && (
        <EmptyState text="Sin datos históricos disponibles para el período seleccionado." />
      )}
    </div>
  );
}

//  Títulos Públicos 

interface TitulosPublicosSubTabProps {
  data: IOLCotizacion[];
  loading: boolean;
  onRefresh: () => void;
  accessToken: string | null;
  tirMap?: Record<string, number | null>; // ticker → TIR (null si sin datos)
}

function TitulosPublicosSubTab({
  data,
  loading,
  onRefresh,
  accessToken,
  tirMap,
}: TitulosPublicosSubTabProps) {
  if (!accessToken) {
    return <EmptyState text="Iniciá sesión en IOL para ver Títulos Públicos." />;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Títulos Públicos</div>
          {data.length > 0 && (
            <p className="text-[13px] text-muted-foreground mt-0.5">
              {data.length} títulos públicos cotizados en IOL
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="mono rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[14px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      {loading && data.length === 0 ? (
        <EmptyState text="Cargando Títulos Públicos…" />
      ) : data.length === 0 ? (
        <EmptyState text="Sin datos de Títulos Públicos disponibles." />
      ) : (
        <div className="overflow-x-auto">
          <table className="mono w-full text-xs">
            <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-2 py-2 text-left">Símbolo</th>
                <th className="px-2 py-2 text-left">Nombre</th>
                <th className="px-2 py-2 text-right">Precio</th>
                <th className="px-2 py-2 text-right">TIR</th>
                <th className="px-2 py-2 text-right">Compra</th>
                <th className="px-2 py-2 text-right">Venta</th>
                <th className="px-2 py-2 text-right">Cierre</th>
                <th className="px-2 py-2 text-right">Var %</th>
                <th className="px-2 py-2 text-right">Volumen</th>
              </tr>
            </thead>
            <tbody>
              {data.map((tp) => {
                const tir = tirMap?.[tp.simbolo.toUpperCase()];
                const tirDefined = tir !== undefined && tir !== null;
                return (
                <tr key={tp.simbolo} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-2 py-2 font-medium">{tp.simbolo}</td>
                  <td
                    className="px-2 py-2 max-w-[200px] truncate text-muted-foreground"
                    title={tp.nombre}
                  >
                    {tp.nombre}
                  </td>
                  <td className="px-2 py-2 text-right">{fmtNum(tp.precio, 2)}</td>
                  <td className={`px-2 py-2 text-right ${tirDefined ? colorPorTIR(tir) : "text-muted-foreground"}`}>
                    {tirDefined ? fmtPct(tir * 100, 2) : "sin datos"}
                  </td>
                  <td className="px-2 py-2 text-right text-green-400">
                    {tp.puntas.compra > 0 ? fmtNum(tp.puntas.compra, 2) : "\u2014"}
                  </td>
                  <td className="px-2 py-2 text-right text-red-400">
                    {tp.puntas.venta > 0 ? fmtNum(tp.puntas.venta, 2) : "\u2014"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {tp.cierre > 0 ? fmtNum(tp.cierre, 2) : "\u2014"}
                  </td>
                  <td
                    className={`px-2 py-2 text-right ${tp.variacion >= 0 ? "text-green-400" : "text-red-400"}`}
                  >
                    {tp.variacionPct !== 0
                      ? `${tp.variacion >= 0 ? "+" : ""}${tp.variacionPct.toFixed(2)}%`
                      : "\u2014"}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {tp.volumen > 0 ? fmtNum(tp.volumen, 0) : "\u2014"}
                  </td>
                </tr>);
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

//  Dashboard Diario 

interface DashboardDiarioSubTabProps {
  data: DashboardRow[];
  loading: boolean;
  onRefresh: () => void;
  accessToken: string | null;
}

function DashboardDiarioSubTab({ data, loading, onRefresh, accessToken }: DashboardDiarioSubTabProps) {
  const [sortKey, setSortKey] = useState<string>("ticker");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  const sorted = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "ticker": cmp = a.ticker.localeCompare(b.ticker); break;
        case "vencimiento": cmp = a.vencimiento.localeCompare(b.vencimiento); break;
        case "precio": cmp = (a.precio ?? 0) - (b.precio ?? 0); break;
        case "yield": cmp = (a.yieldVal ?? 0) - (b.yieldVal ?? 0); break;
        case "modDuration": cmp = (a.modDuration ?? 0) - (b.modDuration ?? 0); break;
        case "paridad": cmp = (a.paridad ?? 0) - (b.paridad ?? 0); break;
        case "currentYield": cmp = (a.currentYield ?? 0) - (b.currentYield ?? 0); break;
        case "outstanding": cmp = (a.outstanding ?? 0) - (b.outstanding ?? 0); break;
        case "tasaCupon": cmp = a.tasaCupon - b.tasaCupon; break;
        default: cmp = a.ticker.localeCompare(b.ticker);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const iolCount = useMemo(() => data.filter((r) => r.fuente === "iol").length, [data]);
  const sopranos = sorted.filter((r) => r.ticker.startsWith("GD"));
  const bopreales = sorted.filter((r) => r.ticker.startsWith("BP"));

  function SortableHeader({ label, sortKey: sk, className }: { label: string; sortKey: string; className?: string }) {
    const active = sortKey === sk;
    return (
      <th
        className={`px-2 py-2 cursor-pointer select-none hover:text-foreground transition-colors ${active ? "text-foreground" : ""} ${className ?? ""}`}
        onClick={() => toggleSort(sk)}
      >
        {label}
        {active && <span className="ml-0.5">{sortDir === "asc" ? "" : ""}</span>}
      </th>
    );
  }

  function renderTable(title: string, rows: DashboardRow[], icon: string) {
    if (rows.length === 0) return null;
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span>{icon}</span>
          <span>{title}</span>
          <span className="text-[13px] text-muted-foreground font-normal">{rows.length} instrumentos</span>
        </div>
        <div className="overflow-x-auto">
          <table className="mono w-full text-[14px]">
            <thead className="text-[13px] uppercase tracking-wider text-muted-foreground">
              <tr className="border-b border-border/60">
                <SortableHeader label="Ticker" sortKey="ticker" className="text-left" />
                <SortableHeader label="Vencimiento" sortKey="vencimiento" className="text-left" />
                <th className="px-2 py-2 text-left">Emisor</th>
                <th className="px-2 py-2 text-left">Cupon</th>
                <th className="px-2 py-2 text-left">Frecuencia</th>
                <SortableHeader label="Tasa cupon" sortKey="tasaCupon" className="text-right" />
                <th className="px-2 py-2 text-right">Prox pago</th>
                <SortableHeader label="Precio" sortKey="precio" className="text-right" />
                <SortableHeader label="Yield" sortKey="yield" className="text-right" />
                <SortableHeader label="Mod duration" sortKey="modDuration" className="text-right" />
                <SortableHeader label="Paridad" sortKey="paridad" className="text-right" />
                <th className="px-2 py-2 text-right">Var %</th>
                <SortableHeader label="Outstanding" sortKey="outstanding" className="text-right" />
                <SortableHeader label="Current yield" sortKey="currentYield" className="text-right" />
                <th className="px-2 py-2 text-left">ISIN</th>
                <th className="px-2 py-2 text-center">Src</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const precio = row.precio;
                const yieldVal = row.yieldVal;
                const modDur = row.modDuration;
                const currYield = row.currentYield;
                return (
                  <tr key={row.ticker} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="px-2 py-2 font-semibold text-foreground">{row.ticker}</td>
                    <td className="px-2 py-2 text-muted-foreground">{row.vencimiento}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1 py-0.5 text-[13px] font-medium ${
                        row.emisor === "BCRA" ? "bg-blue-900/30 text-blue-300" : "bg-amber-900/30 text-amber-300"
                      }`}>
                        {row.emisor}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-muted-foreground">{row.tipoCupon}</td>
                    <td className="px-2 py-2 text-muted-foreground">{row.frecuencia === "Semiannually" ? "Semestral" : row.frecuencia}</td>
                    <td className="px-2 py-2 text-right font-medium">{row.tasaCupon.toFixed(2)}%</td>
                    <td className="px-2 py-2 text-right text-muted-foreground">{row.proxPago}</td>
                    <td className={`px-2 py-2 text-right font-medium ${precio ? "" : "text-muted-foreground"}`}>
                      {precio ? fmtNum(precio, 2) : "\u2014"}
                    </td>
                    <td className={`px-2 py-2 text-right ${yieldVal != null ? colorPorTIR(yieldVal / 100) : "text-muted-foreground"}`}>
                      {yieldVal != null ? fmtPct(yieldVal, 2) : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground">
                      {modDur != null ? modDur.toFixed(2) : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-right text-muted-foreground">
                      {row.paridad != null ? `${row.paridad.toFixed(2)}%` : "\u2014"}
                    </td>
                    <td className={`px-2 py-2 text-right font-medium ${
                      row.variacion != null ? (row.variacion >= 0 ? "text-green-400" : "text-red-400") : "text-muted-foreground"
                    }`}>
                      {row.variacion != null ? `${row.variacion >= 0 ? "+" : ""}${row.variacion.toFixed(2)}%` : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <span className="text-[13px]">{row.moneda}</span> {row.outstanding != null ? fmtNum(row.outstanding, 2) : "\u2014"}
                    </td>
                    <td className={`px-2 py-2 text-right ${currYield != null ? colorPorTIR(currYield / 100) : "text-muted-foreground"}`}>
                      {currYield != null ? fmtPct(currYield, 2) : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-[13px] text-muted-foreground max-w-[120px] truncate" title={row.isin}>
                      {row.isin || "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full ${row.fuente === "iol" ? "bg-green-400" : "bg-amber-400"}`} title={row.fuente === "iol" ? "Dato IOL" : "Referencia"} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return <EmptyState text="Iniciá sesión en IOL para ver el Dashboard Diario." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">Dashboard Diario — Renta Fija</div>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Soberanos y Bopreales en Moneda Extranjera · Fuente: Refinitiv Eikon
            {data.length > 0 && (
              <span className="ml-2">{iolCount > 0 ? `· ${iolCount} cotizaciones IOL` : "· cotizaciones de referencia"}</span>
            )}
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="mono rounded-md border border-border/60 bg-muted/30 px-2 py-1 text-[14px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
      </div>

      {loading && data.length === 0 ? (
        <EmptyState text="Cargando Dashboard Diario…" />
      ) : data.length === 0 ? (
        <EmptyState text="Sin datos disponibles. Verificá la conexión con IOL." />
      ) : (
        <>
          {renderTable("BOPREAL — BCRA", bopreales, "")}
          {renderTable("SOBERANOS — Argentina", sopranos, "")}
        </>
      )}
    </div>
  );
}
