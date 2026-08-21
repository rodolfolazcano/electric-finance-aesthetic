// @ts-nocheck
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  fetchFundamentalAF,
  fetchFundamentalAFBatch,
  getSectorPeers,
  fetchHistoricoDetallado,
  fetchNoticiasTicker,
  generarInformeFundamental,
  findBestBenchmark,
} from "@/lib/fundamental-af.functions";
import type {
  FundamentalAFResult,
  ScoreDetail,
  PeHistoryPoint,
  PeriodoHistoricoRow,
  NewsItem,
  BenchmarkMatch,
} from "@/lib/fundamental-af.functions";
import { resolverSenalCoherente } from "@/lib/coherencia-senal";
import {
  getFlatTickerList,
  getTickersBySector,
  getTickersBySectorAndIndustry,
} from "@/lib/universos";
import { getExplicacion } from "@/lib/explicaciones-fundamental";
import type { SeccionExplicacion } from "@/lib/explicaciones-fundamental";
import { getCicloEconomico } from "@/lib/intermarket-analysis.functions";
import type { CicloEconomico } from "@/lib/intermarket-engine";
import { fetchDesempenioHistorico } from "@/lib/desempenio-historico.functions";
import { getMatrizCAPM, type MatrizCAPMResult } from "@/lib/capm.functions";
import type {
  DesempenioHistoricoResult,
  PeriodoDesempenio,
} from "@/lib/desempenio-historico.functions";
import { generarConclusionSectorialInteligente } from "@/lib/interpretacion-sectorial.functions";
import type { ConclusionSectorialInteligente } from "@/lib/interpretacion-sectorial.functions";
import { calcularScoreSectorial } from "@/lib/score-sectorial.functions";
import type { ScoreSectorialResult } from "@/lib/score-sectorial.functions";
import { calcularVentajaCompetitiva } from "@/lib/moat-analysis.functions";
import type { VentajaCompetitiva } from "@/lib/moat-analysis.functions";
import { calcularAnalisisCualitativoSemiAutomatico } from "@/lib/analisis-cualitativo-semiautomatico.functions";
import type { AnalisisCualitativoSemiAutomaticoResult } from "@/lib/analisis-cualitativo-semiautomatico.functions";
import {
  calcularWACC,
  calcularAPV,
  calcularMultiplosImplicitos,
  calcularValorTecnicoActivos,
  calcularRatiosAmat,
} from "@/lib/valuacion.functions";
import type {
  WACCResult,
  APVResult,
  MultiplosImplicitosResult,
  ValorTecnicoActivosResult,
  RatiosAmatResult,
} from "@/lib/valuacion.functions";
import { MoatDashboard } from "@/components/herramientas/MoatDashboard";
import { AnalisisCualitativoSemiAutomaticoCard } from "@/components/herramientas/AnalisisCualitativoSemiAutomaticoCard";
import { ScoreFundamentalHeatmap } from "@/components/herramientas/ScoreFundamentalHeatmap";
import { FundamentalMetricsDataframe } from "@/components/herramientas/FundamentalMetricsDataframe";
import { GovernanceSection } from "@/components/herramientas/GovernanceSection";
import { DataSourceToggle } from "@/components/shared/DataSourceToggle";
import type { DataSourceMode } from "@/components/shared/DataSourceToggle";
import { CnvDisclaimer } from "@/components/shared/CnvDisclaimer";

import { PortafolioFundamentalGrid } from "@/components/fundamental/PortafolioFundamentalGrid";
import { PortafolioFundamentalFull } from "@/components/fundamental/PortafolioFundamentalFull";

// Helper para determinar mercado y moneda
function getMarketInfo(
  ticker: string,
  country: string | null,
): { market: string; currency: string } {
  const isBa = ticker.endsWith(".BA");
  const isUs = country === "United States" || country === "USA";

  if (isBa) {
    return { market: "BCBA", currency: "ARS" };
  }
  if (isUs) {
    return { market: "NYSE/NASDAQ", currency: "USD" };
  }
  // Default para otros mercados
  return { market: country || "OTC", currency: isBa ? "ARS" : "USD" };
}
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function f(v: number | null, dec = 2): string {
  if (v === null) return "--";
  return v.toFixed(dec);
}

function fPct(v: number | null, alreadyPct = false): string {
  if (v === null) return "--";
  const val = alreadyPct ? v : v * 100;
  return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
}

function fPctNoSign(v: number | null, alreadyPct = false): string {
  if (v === null) return "--";
  const val = alreadyPct ? v : v * 100;
  return `${val.toFixed(1)}%`;
}

function fMarketCap(mM: number | null): string {
  if (mM === null) return "--";
  if (mM >= 1_000_000) return `USD ${(mM / 1_000_000).toFixed(2)} T`;
  if (mM >= 1_000) return `USD ${(mM / 1_000).toFixed(2)} B`;
  return `USD ${mM.toFixed(0)} M`;
}

function fPrice(v: number | null): string {
  if (v === null) return "--";
  return `USD ${v.toFixed(2)}`;
}

function recLabel(v: number | null): string {
  if (v === null) return "--";
  if (v <= 1.5) return "Compra fuerte";
  if (v < 2.5) return "Compra";
  if (v < 3.5) return "Mantener";
  if (v < 4.5) return "Venta";
  return "Venta fuerte";
}

function peLabel(pct: number | null): string {
  if (pct === null) return "--";
  if (pct <= 20) return "Historicamente barato";
  if (pct <= 40) return "Por debajo del promedio historico";
  if (pct <= 60) return "Cercano al promedio historico";
  if (pct <= 80) return "Por encima del promedio historico";
  return "Historicamente caro";
}

function priceRangeLabel(pct: number | null): string {
  if (pct === null) return "--";
  if (pct <= 20) return "Cerca del minimo historico (10a)";
  if (pct <= 40) return "En zona baja del rango historico (10a)";
  if (pct <= 60) return "En zona media del rango historico (10a)";
  if (pct <= 80) return "En zona alta del rango historico (10a)";
  return "Cerca del maximo historico (10a)";
}

function signalColor(accion: string): string {
  const a = accion.toLowerCase();
  if (a.includes("acumular")) return "text-emerald-400";
  if (a.includes("mantener")) return "text-amber-400";
  if (a.includes("reduccion") || a.includes("cautela")) return "text-red-400";
  return "text-muted-foreground";
}

function metricColor(value: number | null, good: "high" | "low"): string {
  if (value === null) return "text-muted-foreground";
  return "text-foreground";
}

function pctColor(v: number | null, alreadyPct = false): string {
  if (v === null) return "text-muted-foreground";
  const val = alreadyPct ? v : v * 100;
  if (val >= 0) return "text-emerald-400";
  return "text-red-400";
}

function formatearValorMetrica(valor: number, campo: string): string {
  // D/E se almacena como porcentaje (20.03 = 20.03%), mostrar como ratio decimal
  if (campo === "debtToEquityRaw") return (valor / 100).toFixed(2) + "x";
  // Ya es porcentaje (rdToRevenuePct = 6 → "6.0%")
  if (campo === "rdToRevenuePct") return valor.toFixed(1) + "%";
  // Decimal < 1 → mostrar como porcentaje multiplicado ×100
  if (Math.abs(valor) < 1) return (valor * 100).toFixed(1) + "%";
  // Valores grandes con separadores de miles
  return Number.isInteger(valor) ? valor.toLocaleString() : valor.toFixed(2);
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function MetricRow({
  label,
  value,
  colorClass,
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <tr className="border-b border-border/20 last:border-0">
      <td className="py-1.5 pr-4 text-[10px] text-muted-foreground whitespace-nowrap">{label}</td>
      <td className={`py-1.5 text-[10px] font-mono text-right ${colorClass ?? "text-foreground"}`}>
        {value}
      </td>
    </tr>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={2}
        className="pt-3 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60"
      >
        {label}
      </td>
    </tr>
  );
}

function PriceBar({
  min,
  max,
  current,
  avg,
}: {
  min: number;
  max: number;
  current: number;
  avg: number | null;
}) {
  const range = max - min;
  if (range <= 0) return null;
  const pct = Math.max(0, Math.min(100, ((current - min) / range) * 100));
  const avgPct = avg !== null ? Math.max(0, Math.min(100, ((avg - min) / range) * 100)) : null;
  return (
    <div className="mt-2 mb-1">
      <div className="relative h-2 w-full rounded-full bg-border/30">
        {avgPct !== null && (
          <div className="absolute top-0 h-2 w-px bg-amber-400/60" style={{ left: `${avgPct}%` }} />
        )}
        <div
          className="absolute top-0 h-2 w-1 -translate-x-0.5 rounded-full bg-emerald-400"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex justify-between text-[9px] font-mono text-muted-foreground">
        <span>Min {fPrice(min)}</span>
        {avgPct !== null && <span className="text-amber-400/70">Prom {fPrice(avg)}</span>}
        <span>Max {fPrice(max)}</span>
      </div>
    </div>
  );
}

function ScoreBar({ score, rawPts, maxPts }: { score: number; rawPts?: number; maxPts?: number }) {
  const color = score >= 65 ? "bg-emerald-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-border/30">
          <div
            className={`h-1.5 rounded-full ${color} transition-all`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className={`text-[11px] font-bold font-mono ${color.replace("bg-", "text-")}`}>
          {score}
        </span>
      </div>
      {rawPts !== undefined && maxPts !== undefined && maxPts > 0 && (
        <p className="mt-1 text-[8px] text-muted-foreground">
          {rawPts}/{maxPts} pts disponibles de componentes con dato
        </p>
      )}
    </div>
  );
}

function ScoreDetailTable({ details }: { details: ScoreDetail[] }) {
  if (details.length === 0) return null;
  return (
    <table className="w-full mt-2">
      <tbody>
        {details.map((d) => (
          <tr key={d.metric} className="border-b border-border/10 last:border-0">
            <td className="py-1 text-[9px] text-muted-foreground">{d.metric}</td>
            <td className="py-1 text-[9px] font-mono text-right text-foreground">{d.valor}</td>
            <td className="py-1 text-[9px] font-mono text-right w-12">
              <span
                className={
                  d.pts >= d.maxPts * 0.67
                    ? "text-emerald-400"
                    : d.pts > 0
                      ? "text-amber-400"
                      : "text-red-400"
                }
              >
                {d.pts}/{d.maxPts}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PeHistoryTable({
  history,
  currentPE,
  percentile,
}: {
  history: PeHistoryPoint[];
  currentPE: number | null;
  percentile: number | null;
}) {
  if (history.length === 0)
    return (
      <p className="text-[9px] text-muted-foreground mt-1">
        Datos insuficientes para calcular percentil historico de P/E. Se requieren al menos 2
        ejercicios con EPS positivo disponibles en Yahoo Finance.
      </p>
    );
  return (
    <table className="w-full mt-2">
      <thead>
        <tr className="border-b border-border/30">
          <th className="py-1 text-left text-[9px] font-medium text-muted-foreground">
            Año fiscal
          </th>
          <th className="py-1 text-right text-[9px] font-medium text-muted-foreground">
            P/E calculado
          </th>
        </tr>
      </thead>
      <tbody>
        {history.map((h) => (
          <tr key={h.year} className="border-b border-border/10 last:border-0">
            <td className="py-1 text-[10px] text-muted-foreground">{h.year}</td>
            <td className="py-1 text-[10px] font-mono text-right text-foreground">
              {h.pe.toFixed(1)}x
            </td>
          </tr>
        ))}
        {currentPE !== null && (
          <tr className="border-t border-border/30 bg-border/10">
            <td className="py-1 text-[10px] font-semibold text-foreground">Actual (trailing)</td>
            <td className="py-1 text-[10px] font-mono font-semibold text-right text-foreground">
              {currentPE.toFixed(1)}x
              {percentile !== null && (
                <span
                  className={`ml-2 text-[9px] font-normal ${percentile >= 70 ? "text-red-400" : percentile <= 30 ? "text-emerald-400" : "text-amber-400"}`}
                >
                  pct {percentile}
                </span>
              )}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

// ─── Health Score Histórico (gráfico de barras año por año) ─────

function HealthScoreChart({ history }: { history: { year: number; score: number }[] }) {
  if (history.length < 2) return null;
  const barSize = Math.max(20, Math.min(50, 300 / history.length));
  return (
    <div className="mt-3">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={history} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fontSize: 9, fill: "#9aa6bd" }}
            stroke="#2b3242"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 8, fill: "#9aa6bd" }}
            stroke="#2b3242"
            axisLine={false}
            tickLine={false}
            width={30}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "#141a28",
              border: "1px solid #2b3242",
              borderRadius: 8,
              fontSize: 10,
              fontFamily: "monospace",
            }}
            formatter={(value: number) => [`${value}/100`, "Health Score"]}
            labelFormatter={(year: number) => `Año fiscal ${year}`}
          />
          <Bar dataKey="score" radius={[2, 2, 0, 0]} barSize={barSize}>
            {history.map((entry, idx) => (
              <Cell
                key={idx}
                fill={entry.score >= 65 ? "#22c55e" : entry.score >= 40 ? "#f59e0b" : "#ef4444"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="flex items-center justify-end gap-3 mt-1">
        <span className="flex items-center gap-1 text-[8px] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#22c55e]" /> Sólido (≥65)
        </span>
        <span className="flex items-center gap-1 text-[8px] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#f59e0b]" /> Medio (40-64)
        </span>
        <span className="flex items-center gap-1 text-[8px] text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#ef4444]" /> Débil (&lt;40)
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal del tab
// ---------------------------------------------------------------------------

type Props = {
  tickerFromSearch?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  onContextualMessage?: (msg: string | null) => void;
};

export function AnalisisFundamentalTab({
  tickerFromSearch,
  accessToken,
  onContextualMessage,
}: Props = {}) {
  const [ticker, setTicker] = useState(tickerFromSearch ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<FundamentalAFResult | null>(null);
  const [multiResults, setMultiResults] = useState<FundamentalAFResult[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const autoSearched = useRef(false);
  const [peersLoading, setPeersLoading] = useState(false);
  const [peersInfo, setPeersInfo] = useState<{ totalEncontrados: number; criterio: string } | null>(
    null,
  );
  const peersFn = useServerFn(getSectorPeers);
  const perfFn = useServerFn(fetchDesempenioHistorico);
  const [modoGuiado, setModoGuiado] = useState(false);
  const [desempenio, setDesempenio] = useState<DesempenioHistoricoResult | null>(null);
  const [desempenioLoading, setDesempenioLoading] = useState(false);

  const [mode, setMode] = useState<DataSourceMode>("manual");

  // 🔹 Historico detallado + noticias + informe narrativo
  const histFn = useServerFn(fetchHistoricoDetallado);
  const newsFn = useServerFn(fetchNoticiasTicker);
  const [historico, setHistorico] = useState<PeriodoHistoricoRow[]>([]);
  const [historicoLoading, setHistoricoLoading] = useState(false);
  const [historicoGranularidad, setHistoricoGranularidad] = useState<"anual" | "trimestral">(
    "anual",
  );
  const [selectedPeriodIdx, setSelectedPeriodIdx] = useState(-1);
  const [noticiasPeriodo, setNoticiasPeriodo] = useState<NewsItem[]>([]);
  const [noticiasLoading, setNoticiasLoading] = useState(false);
  const [informeNarrativo, setInformeNarrativo] = useState<ReturnType<
    typeof generarInformeFundamental
  > | null>(null);
  const [moat, setMoat] = useState<VentajaCompetitiva | null>(null);
  const [moatLoading, setMoatLoading] = useState(false);
  const [ratiosAmat, setRatiosAmat] = useState<RatiosAmatResult | null>(null);
  const [analisisCualitativoSA, setAnalisisCualitativoSA] =
    useState<AnalisisCualitativoSemiAutomaticoResult | null>(null);

  // ── Contexto macro (Murphy, ciclo económico) ──
  const [ciclo, setCiclo] = useState<CicloEconomico | null>(null);
  const cicloFn = useServerFn(getCicloEconomico);
  useEffect(() => {
    cicloFn()
      .then((r) => setCiclo(r.ciclo))
      .catch(() => {});
  }, []);

  // ─── Valuación state ──────────────────────────────────────────────
  const [valInputRf, setValInputRf] = useState("4.5");
  const [valInputErp, setValInputErp] = useState("5.5");
  const [valInputG, setValInputG] = useState("2.5");
  const [valIncluirCRP, setValIncluirCRP] = useState(false);
  const [valRefPE, setValRefPE] = useState("18");
  const [valRefEVEBITDA, setValRefEVEBITDA] = useState("12");
  const [valRefPB, setValRefPB] = useState("2.5");
  const [valRefPS, setValRefPS] = useState("2.0");
  const [valWACC, setValWACC] = useState<WACCResult | null>(null);
  const [valAPV, setValAPV] = useState<APVResult | null>(null);
  const [valMultiplos, setValMultiplos] = useState<MultiplosImplicitosResult | null>(null);
  const [valActivos, setValActivos] = useState<ValorTecnicoActivosResult | null>(null);
  const [valActiveTab, setValActiveTab] = useState<string>("wacc");
  const newsCache = useRef<Map<string, NewsItem[]>>(new Map());
  const [multiNarrativos, setMultiNarrativos] = useState<
    Record<
      string,
      {
        informe: ReturnType<typeof generarInformeFundamental>;
        noticias: NewsItem[];
        earningsDate: string | null;
      }
    >
  >({});
  const [multiNarrativosLoading, setMultiNarrativosLoading] = useState(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [sectorComparacion, setSectorComparacion] = useState<{
    symbol: string;
    sector: string;
    industria: string;
    peers: { ticker: string; data: FundamentalAFResult | null }[];
    loading: boolean;
    error?: string;
  } | null>(null);
  const [sectorConclusion, setSectorConclusion] = useState<ConclusionSectorialInteligente | null>(
    null,
  );
  const [scoreSectorial, setScoreSectorial] = useState<ScoreSectorialResult | null>(null);
  const [ambitoComparacion, setAmbitoComparacion] = useState<"industria" | "sector">("industria");
  const [bestBenchmarks, setBestBenchmarks] = useState<BenchmarkMatch[] | null>(null);
  const [bestBenchmarksLoading, setBestBenchmarksLoading] = useState(false);
  const bestBenchmarkFn = useServerFn(findBestBenchmark);
  const ambitoRef = useRef(ambitoComparacion);
  ambitoRef.current = ambitoComparacion;

  const matrizFn = useServerFn(getMatrizCAPM);
  const [matrizData, setMatrizData] = useState<MatrizCAPMResult | null>(null);
  const [matrizLoading, setMatrizLoading] = useState(false);
  const [matrizMetric, setMatrizMetric] = useState<"correlation" | "beta" | "alpha" | "rSquared">(
    "rSquared",
  );
  const [comparisonView, setComparisonView] = useState<"tabla" | "matriz">("tabla");
  const [sortByR2, setSortByR2] = useState<"desc" | "asc" | null>(null);
  const [showAllTickers, setShowAllTickers] = useState(false);
  const [allSectorTickers, setAllSectorTickers] = useState<string[]>([]);

  const fetchSectorComparacion = useCallback(
    async (
      symbol: string,
      sector: string,
      industria: string,
      exclude: string[],
      ambitoOverride?: "industria" | "sector",
    ) => {
      const amb = ambitoOverride ?? ambitoRef.current;
      setSectorComparacion({ symbol, sector, industria, peers: [], loading: true });
      let cancelled = false;
      const cancel = () => {
        cancelled = true;
      };
      try {
        const res = await peersFn({
          data: { sector, industria, tickerActual: symbol, ambito: amb },
        });
        const peersToFetch = res.peers.filter((p) => !exclude.includes(p));
        if (peersToFetch.length === 0) {
          if (!cancelled)
            setSectorComparacion({
              symbol,
              sector,
              industria,
              peers: [],
              loading: false,
              error: "No se encontraron pares fuera del input actual",
            });
          return cancel;
        }
        const peerResults = await Promise.allSettled(
          peersToFetch.map(async (sym) => {
            try {
              const data = await fetchFundamentalAF({ data: { symbol: sym } });
              return { ticker: sym, data };
            } catch {
              return { ticker: sym, data: null };
            }
          }),
        );
        if (!cancelled)
          setSectorComparacion({
            symbol,
            sector,
            industria,
            peers: peerResults.map((r) =>
              r.status === "fulfilled" ? r.value : { ticker: "error", data: null },
            ),
            loading: false,
          });
      } catch {
        if (!cancelled)
          setSectorComparacion((prev) =>
            prev
              ? { ...prev, loading: false, error: "Error al obtener comparación sectorial" }
              : null,
          );
      }
      return cancel;
    },
    [peersFn],
  );

  // Trigger sector comparison for first valid multi-ticker result
  useEffect(() => {
    setSectorComparacion(null);
    const valid = multiResults.filter((r) => !r.error);
    if (valid.length === 0) return;
    const first = valid[0];
    if (!first.sector || !first.industry) return;
    // Pasar exclude = [] para que el fetch incluya todos los peers del sector (multiResults se agregan en el render)
    const cancel = fetchSectorComparacion(first.symbol, first.sector, first.industry, []);
    return () => {
      cancel.then((fn) => fn());
    };
  }, [multiResults, fetchSectorComparacion]);

  // Auto-trigger sector comparison when single result is available or ambito changes
  useEffect(() => {
    if (!result || !result.sector || !result.industry) return;
    const cancel = fetchSectorComparacion(result.symbol, result.sector, result.industry, []);
    setSectorComparacion(null);
    return () => {
      cancel.then((fn) => fn());
    };
  }, [result, result?.sector, result?.industry, ambitoComparacion]);

  // Fetch best benchmark lazily — para single result o primer multi-ticker
  const benchmarkKey =
    result && !result.error ? result.symbol : (multiResults.find((r) => !r.error)?.symbol ?? null);
  useEffect(() => {
    if (!benchmarkKey) {
      setBestBenchmarks(null);
      return;
    }
    setBestBenchmarksLoading(true);

    // Timeout de 15 segundos para evitar que quede colgado
    const timeoutPromise = new Promise<BenchmarkMatch[]>((_, reject) => {
      setTimeout(() => reject(new Error("Timeout buscando benchmark")), 15000);
    });

    bestBenchmarkFn({ data: { ticker: benchmarkKey } })
      .then((res) => {
        if (res.length > 0) setBestBenchmarks(res);
        else setBestBenchmarks(null);
      })
      .catch((error) => {
        console.error("Error buscando mejor benchmark:", error);
        setBestBenchmarks(null);
      })
      .finally(() => setBestBenchmarksLoading(false));
  }, [benchmarkKey, bestBenchmarkFn]);

  // Compute sector conclusion when peers finish loading
  useEffect(() => {
    if (!sectorComparacion || sectorComparacion.loading || sectorComparacion.peers.length === 0) {
      setSectorConclusion(null);
      return;
    }
    const validPeers = sectorComparacion.peers
      .filter((p) => p.data && !p.data.error)
      .map((p) => p.data!);
    if (validPeers.length < 2) {
      setSectorConclusion(null);
      return;
    }
    // Find the current ticker's own result in the peers list or use the local result
    const ownResult =
      validPeers.find((p) => p.symbol === sectorComparacion.symbol) ??
      (result && !result.error ? result : null);
    if (!ownResult) {
      setSectorConclusion(null);
      return;
    }
    const conclusion = generarConclusionSectorialInteligente(
      ownResult,
      validPeers.filter((p) => p.symbol !== sectorComparacion.symbol),
      sectorComparacion.sector,
      sectorComparacion.industria,
    );
    setSectorConclusion(conclusion);
  }, [sectorComparacion, result]);

  // Score sectorial (per-sector weighted metrics)
  useEffect(() => {
    if (!result || result.error || result.esETF) {
      setScoreSectorial(null);
      return;
    }
    const peers =
      sectorComparacion && !sectorComparacion.loading
        ? sectorComparacion.peers
            .map((p) => p.data)
            .filter((d): d is FundamentalAFResult => d != null && !d.error)
        : null;
    const ss = calcularScoreSectorial(result, peers);
    setScoreSectorial(ss);
  }, [result, sectorComparacion]);

  // Fetch historico when result changes
  useEffect(() => {
    if (!result || result.error || !result.symbol) {
      setHistorico([]);
      setSelectedPeriodIdx(-1);
      setInformeNarrativo(null);
      return;
    }
    setHistoricoLoading(true);
    histFn({ data: { symbol: result.symbol, granularidad: historicoGranularidad } })
      .then((d) => {
        setHistorico(d.periods);
        if (d.periods.length > 0) setSelectedPeriodIdx(0);
      })
      .catch(() => setHistorico([]))
      .finally(() => setHistoricoLoading(false));
  }, [result?.symbol, historicoGranularidad, histFn]);

  // Compute moat when result + historico are available (solo datos anuales)
  useEffect(() => {
    if (!result || result.error || !result.symbol || historico.length === 0) {
      setMoat(null);
      return;
    }
    if (historicoGranularidad !== "anual") return;
    setMoatLoading(true);
    const moatResult = calcularVentajaCompetitiva(result, historico);
    setMoat(moatResult);
    setMoatLoading(false);
  }, [result, historico, historicoGranularidad]);

  // Compute ratios Amat (metodología Oriol Amat: ratios de balance + interpretación sectorial)
  useEffect(() => {
    if (!result || result.error) {
      setRatiosAmat(null);
      return;
    }
    setRatiosAmat(calcularRatiosAmat(result));
  }, [result]);

  // Compute all qualitative signals when result + sector + historico are ready
  useEffect(() => {
    if (!result || result.error) {
      setAnalisisCualitativoSA(null);
      return;
    }
    const peersConDato = sectorComparacion?.peers
      ? sectorComparacion.peers.filter((p) => p.data && !p.data.error).map((p) => p.data!)
      : [];
    const sc =
      peersConDato.length >= 2 && sectorComparacion
        ? {
            peers: peersConDato,
            sector: sectorComparacion.sector,
            industria: sectorComparacion.industria,
          }
        : null;
    const ac = calcularAnalisisCualitativoSemiAutomatico(
      result,
      sc,
      sectorConclusion ?? null,
      historico,
    );
    setAnalisisCualitativoSA(ac);
  }, [result, sectorComparacion, sectorConclusion, historico]);

  // Load all tickers from the sector/industry universe for the complete list
  useEffect(() => {
    if (!result || result.error || !result.sector) {
      setAllSectorTickers([]);
      return;
    }
    try {
      const allTickers =
        ambitoComparacion === "industria" && result.industry
          ? getTickersBySectorAndIndustry(result.sector, result.industry)
          : getTickersBySector(result.sector);
      setAllSectorTickers(allTickers);
    } catch {
      setAllSectorTickers([]);
    }
  }, [result?.sector, result?.industry, ambitoComparacion]);

  // Fetch pairwise matrix (R², corr, alpha, beta) when sectorComparacion tickers are available
  useEffect(() => {
    if (!sectorComparacion || sectorComparacion.loading) {
      setMatrizData(null);
      return;
    }
    const validTickers = [
      sectorComparacion.symbol,
      ...sectorComparacion.peers.filter((p) => p.data && !p.data.error).map((p) => p.ticker),
    ];
    if (validTickers.length < 2) {
      setMatrizData(null);
      return;
    }
    setMatrizLoading(true);
    matrizFn({ data: { tickers: validTickers } })
      .then(setMatrizData)
      .catch(() => setMatrizData(null))
      .finally(() => setMatrizLoading(false));
  }, [sectorComparacion, sectorComparacion?.symbol, sectorComparacion?.loading]);

  // Fetch news + generate informe when period changes
  useEffect(() => {
    if (!result || historico.length === 0) {
      setNoticiasPeriodo([]);
      setInformeNarrativo(null);
      return;
    }
    let desde: string, hasta: string, cacheKey: string;
    if (selectedPeriodIdx < 0) {
      hasta = new Date().toISOString().slice(0, 10);
      desde = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
      cacheKey = `${result.symbol}_resumen_actual`;
    } else {
      const period = historico[selectedPeriodIdx];
      if (!period || !period.endDate) return;
      const end = new Date(period.endDate + "T12:00:00Z");
      desde = new Date(end.getTime() - 10 * 86400 * 1000).toISOString().slice(0, 10);
      hasta = new Date(end.getTime() + 5 * 86400 * 1000).toISOString().slice(0, 10);
      cacheKey = `${result.symbol}_${period.endDate}`;
    }

    if (newsCache.current.has(cacheKey)) {
      const cached = newsCache.current.get(cacheKey)!;
      setNoticiasPeriodo(cached);
      setInformeNarrativo(generarInformeFundamental(result, historico, cached, selectedPeriodIdx));
      return;
    }

    setNoticiasLoading(true);
    newsFn({ data: { symbol: result.symbol, desde, hasta, maxResults: 50 } })
      .then((d) => {
        if (d.apiError)
          console.warn(
            `[NOTICIAS] ${result.symbol}: API error, retornando ${d.totalFetched} noticias`,
          );
        newsCache.current.set(cacheKey, d.news);
        setNoticiasPeriodo(d.news);
        setInformeNarrativo(
          generarInformeFundamental(result, historico, d.news, selectedPeriodIdx),
        );
      })
      .catch(() => {
        setNoticiasPeriodo([]);
        setInformeNarrativo(generarInformeFundamental(result, historico, [], selectedPeriodIdx));
      })
      .finally(() => setNoticiasLoading(false));
  }, [selectedPeriodIdx, historico, result, newsFn]);

  // Fetch narratives for multi-ticker results
  const multiNarrativosFetched = useRef<Set<string>>(new Set());
  useEffect(() => {
    const valid = multiResults.filter((r) => !r.error);
    if (valid.length === 0) {
      setMultiNarrativos({});
      setExpandedSymbol(null);
      multiNarrativosFetched.current.clear();
      return;
    }
    const needFetch = valid.filter((r) => !multiNarrativosFetched.current.has(r.symbol));
    if (needFetch.length === 0) return;
    setMultiNarrativosLoading(true);
    const concurrency = 4;
    (async () => {
      const narrativos: Record<
        string,
        {
          informe: ReturnType<typeof generarInformeFundamental>;
          noticias: NewsItem[];
          earningsDate: string | null;
        }
      > = {};
      for (let i = 0; i < needFetch.length; i += concurrency) {
        const batch = needFetch.slice(i, i + concurrency);
        const batchResults = await Promise.allSettled(
          batch.map(async (r) => {
            let periods: PeriodoHistoricoRow[] = [];
            let noticias: NewsItem[] = [];
            let earningsDate: string | null = null;
            // Retry once on failure
            for (let attempt = 0; attempt < 2; attempt++) {
              try {
                const histData = await histFn({
                  data: { symbol: r.symbol, granularidad: "anual" },
                });
                periods = histData.periods;
                if (periods.length > 0 && periods[0].endDate) {
                  earningsDate = periods[0].earningsDate ?? null;
                  const end = new Date(periods[0].endDate + "T12:00:00Z");
                  const desde = new Date(end.getTime() - 10 * 86400 * 1000)
                    .toISOString()
                    .slice(0, 10);
                  const hasta = new Date(end.getTime() + 5 * 86400 * 1000)
                    .toISOString()
                    .slice(0, 10);
                  const newsData = await newsFn({
                    data: { symbol: r.symbol, desde, hasta, maxResults: 50 },
                  });
                  noticias = newsData.news;
                }
                break; // success, exit retry loop
              } catch {
                if (attempt === 0) await new Promise((r) => setTimeout(r, 500)); // wait before retry
              }
            }
            const informe = generarInformeFundamental(
              r,
              periods,
              noticias,
              periods.length > 0 ? 0 : -1,
            );
            multiNarrativosFetched.current.add(r.symbol);
            return { symbol: r.symbol, informe, noticias, earningsDate };
          }),
        );
        batchResults.forEach((entry) => {
          if (entry.status === "fulfilled") {
            narrativos[entry.value.symbol] = {
              informe: entry.value.informe,
              noticias: entry.value.noticias,
              earningsDate: entry.value.earningsDate,
            };
          }
        });
      }
      setMultiNarrativos((prev) => ({ ...prev, ...narrativos }));
      setMultiNarrativosLoading(false);
    })();
  }, [multiResults, histFn, newsFn]);

  // Auto-search from navigation (PASO 8 — cross-tab desde Contexto de Mercado)
  useEffect(() => {
    if (tickerFromSearch && !autoSearched.current) {
      autoSearched.current = true;
      const sym = tickerFromSearch.toUpperCase();
      setTicker(sym);
      setLoading(true);
      setFetchError(null);
      setResult(null);
      setMultiResults([]);
      fetchFundamentalAF({ data: { symbol: sym } })
        .then((data) => {
          if (data.error) setFetchError(data.error);
          else setResult(data);
        })
        .catch((e) =>
          setFetchError(e instanceof Error ? e.message : "Error al consultar Yahoo Finance"),
        )
        .finally(() => setLoading(false));
    }
  }, [tickerFromSearch]);

  const handleSearch = async () => {
    const raw = ticker.trim().toUpperCase();
    if (!raw) return;
    const symbols = raw.split(/[\s,]+/).filter(Boolean);
    setLoading(true);
    setFetchError(null);
    setResult(null);
    setMultiResults([]);
    if (symbols.length === 1) {
      try {
        const data = await fetchFundamentalAF({ data: { symbol: symbols[0] } });
        if (data.error) setFetchError(data.error);
        else setResult(data);
      } catch (e) {
        setFetchError(e instanceof Error ? e.message : "Error al consultar Yahoo Finance");
      } finally {
        setLoading(false);
      }
    } else {
      const results = await fetchFundamentalAFBatch({ data: { symbols, batchSize: 4 } });
      setMultiResults(results);
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleComparePeers = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (!result || !result.sector || !result.industry) return;
    setPeersLoading(true);
    setPeersInfo(null);
    try {
      const res = await peersFn({
        data: { sector: result.sector, industria: result.industry, tickerActual: result.symbol },
      });
      setPeersInfo({ totalEncontrados: res.totalEncontrados, criterio: res.criterioUsado });
      if (res.peers.length === 0) return;
      const symbols = [result.symbol, ...res.peers];
      setFetchError(null);
      const results = await fetchFundamentalAFBatch({ data: { symbols, batchSize: 4 } });
      setMultiResults(results);
      setTicker(symbols.join(", "));
      // La comparación sectorial se mostrará automáticamente porque multiResults tiene datos
    } catch {
      setFetchError("Error al buscar pares del sector");
    } finally {
      setPeersLoading(false);
    }
  };

  // ─── Recalcular valuación cuando cambian inputs o resultado ──────
  useEffect(() => {
    if (!result || result.error) {
      setValWACC(null);
      setValAPV(null);
      setValMultiplos(null);
      setValActivos(null);
      return;
    }
    const rf = parseFloat(valInputRf);
    const erp = parseFloat(valInputErp);
    const gTerm = parseFloat(valInputG);
    if (isNaN(rf) || isNaN(erp) || isNaN(gTerm)) return;

    setValWACC(calcularWACC(result, { rf, erp, incluirCRP: valIncluirCRP, gTerminal: gTerm }));
    setValAPV(calcularAPV(result, { rf, erp, incluirCRP: valIncluirCRP, gTerminal: gTerm }));
    setValMultiplos(
      calcularMultiplosImplicitos(result, {
        pe: parseFloat(valRefPE) || null,
        evEbitda: parseFloat(valRefEVEBITDA) || null,
        mktCapEbitda: null,
        pb: parseFloat(valRefPB) || null,
        ps: parseFloat(valRefPS) || null,
      }),
    );
    setValActivos(calcularValorTecnicoActivos(result));
  }, [
    result,
    valInputRf,
    valInputErp,
    valInputG,
    valIncluirCRP,
    valRefPE,
    valRefEVEBITDA,
    valRefPB,
    valRefPS,
  ]);

  // Fetch historical performance for single ticker view
  useEffect(() => {
    if (!result || result.error || !result.symbol) {
      setDesempenio(null);
      return;
    }
    setDesempenioLoading(true);
    perfFn({ data: { symbol: result.symbol } })
      .then((d) => setDesempenio(d))
      .catch(() => setDesempenio(null))
      .finally(() => setDesempenioLoading(false));
  }, [result?.symbol, perfFn]);

  const handleSelectFromPortfolio = async (ticker: string) => {
    setMode("manual");
    setTicker(ticker);
    setFetchError(null);
    setResult(null);
    setLoading(true);
    try {
      const data = await fetchFundamentalAF({ data: { symbol: ticker } });
      if (data.error) {
        setFetchError(data.error);
      } else {
        setResult(data);
      }
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Error al consultar Yahoo Finance");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <CnvDisclaimer />

      {/* Toggle Manual / Portafolio IOL */}
      <DataSourceToggle
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          setFetchError(null);
          if (m === "manual") onContextualMessage?.(null);
        }}
        disabled={!accessToken}
      />

      {/* Banner de navegación cruzada (PASO 8) */}
      {tickerFromSearch && mode === "manual" && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-2 text-[9px] text-primary/80 font-mono">
          Llegaste desde Contexto de Mercado — análisis autocompletado para{" "}
          <strong>{tickerFromSearch}</strong>. Usá el buscador de abajo para consultar otro activo.
        </div>
      )}

      {/* Buscador (solo en modo manual) */}
      {mode === "manual" && (
        <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
          <p className="text-[10px] text-muted-foreground mb-2">
            Ingresar el ticker de Yahoo Finance. Para acciones argentinas usar sufijo .BA (ej:
            GGAL.BA). Para CEDEARs ingresar el ticker del subyacente en USA (ej: AAPL, MSFT, GOOGL).
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              onKeyDown={handleKey}
              placeholder="AAPL, GGAL.BA, MSFT (separados por coma)"
              maxLength={100}
              className="flex-1 rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[11px] font-mono text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-emerald-500/50"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !ticker.trim()}
              className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Consultando..." : "Analizar"}
            </button>
          </div>
        </div>
      )}

      {/* Portafolio IOL view */}
      {mode === "portafolio-iol" && <PortafolioFundamentalFull />}

      {/* Error */}
      {fetchError && (
        <div className="rounded-md border border-red-500/30 bg-red-500/5 px-4 py-3 text-[10px] text-red-400">
          {fetchError}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="rounded-md border border-border/40 bg-background/40/60 px-4 py-6 text-center text-[10px] text-muted-foreground">
          Consultando Yahoo Finance y calculando metricas...
        </div>
      )}

      {/* Resultados */}
      {result && !loading && (
        <div className="space-y-4">
          {/* Identidad de la empresa */}
          <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {result.companyName ?? result.symbol}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {[result.sector, result.industry, result.country].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] font-mono font-semibold text-foreground">
                  {fPrice(result.currentPrice)}
                </p>
                <p className="text-[9px] text-muted-foreground">
                  {result.esETF ? "AUM" : "Market cap"}: {fMarketCap(result.marketCapM)}
                </p>
                {result.beta !== null && (
                  <p className="text-[9px] text-muted-foreground">
                    Beta: {result.beta.toFixed(2)}
                    {result.beta > 1.5 && ciclo?.stage != null && ciclo.stage >= 4 && (
                      <span className="text-amber-400/80 ml-1"></span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Gobierno Corporativo */}
          <GovernanceSection result={result} />

          {/* Benchmark de referencia — mejor R² de factores disponibles */}
          {result.benchmarkName && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <div className="mono mb-2 text-[9px] uppercase tracking-[0.18em] text-muted-foreground flex items-center gap-2">
                Benchmark ·
                {bestBenchmarksLoading ? (
                  <span className="text-[8px] font-normal normal-case text-muted-foreground animate-pulse">
                    buscando mejor R²…
                  </span>
                ) : bestBenchmarks && bestBenchmarks.length > 0 ? (
                  <select
                    value={bestBenchmarks[0].ticker}
                    onChange={(e) => {
                      const sel = e.target.value;
                      setBestBenchmarks((prev) => {
                        if (!prev) return prev;
                        const idx = prev.findIndex((b) => b.ticker === sel);
                        if (idx < 0) return prev;
                        const copy = [...prev];
                        [copy[0], copy[idx]] = [copy[idx], copy[0]];
                        return copy;
                      });
                    }}
                    className="text-[10px] font-mono bg-transparent border border-border/40 rounded px-1 py-0.5 text-foreground cursor-pointer hover:border-primary/50"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {bestBenchmarks.map((b) => (
                      <option key={b.ticker} value={b.ticker}>
                        {b.ticker} (R² {b.r2.toFixed(3)})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] font-normal normal-case">
                    {result.benchmarkName}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px]">
                <div>
                  <span className="text-muted-foreground">Precio: </span>
                  <span className="font-mono text-foreground">{fPrice(result.currentPrice)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {result.benchmarkName === "SPY" ? "AUM" : "Market cap"}:{" "}
                  </span>
                  <span className="font-mono text-foreground">
                    {fMarketCap(result.benchmarkMarketCapM)}
                  </span>
                </div>
                {result.benchmarkBeta !== null && (
                  <div>
                    <span className="text-muted-foreground">Beta: </span>
                    <span className="font-mono text-foreground">
                      {result.benchmarkBeta.toFixed(2)}
                    </span>
                  </div>
                )}
                {bestBenchmarks && bestBenchmarks.length > 0 && (
                  <div>
                    <span className="text-muted-foreground">
                      R² vs {bestBenchmarks[0].ticker}:{" "}
                    </span>
                    <span className="font-mono text-foreground">
                      {bestBenchmarks[0].r2.toFixed(4)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Contexto Macro — Murphy TOP-DOWN ── */}
          {ciclo && !result.esETF && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Contexto Macro · Ciclo Económico
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px]">
                <div>
                  <span className="text-muted-foreground">Etapa: </span>
                  <span className="font-semibold text-foreground">{ciclo.label}</span>
                  <span className="text-muted-foreground/60 ml-1">(Stage {ciclo.stage})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Sectores líderes: </span>
                  <span className="text-foreground">{ciclo.sectoresLideres.join(", ")}</span>
                </div>
              </div>
              {(() => {
                const sectorMap: Record<string, string> = {
                  Tecnología: "Technology",
                  "Servicios de comunicación": "Communication Services",
                  "Servicios financieros": "Financial Services",
                  "Defensiva del Consumidor": "Consumer Defensive",
                  "Bienes raíces": "Real Estate",
                  "Cuidado de la salud": "Healthcare",
                  Utilidades: "Utilities",
                  "Materiales Básicos": "Basic Materials",
                  "Consumo cíclico": "Consumer Cyclical",
                  "Acciones industriales": "Industrials",
                  Energía: "Energy",
                };
                const sectorEn = result.sector ? (sectorMap[result.sector] ?? null) : null;
                const bloqueado = sectorEn
                  ? !ciclo.sectoresLideres.includes(sectorEn) && ciclo.stage >= 5
                  : false;
                return (
                  <div
                    className={`mt-2 text-[10px] ${bloqueado ? "text-red-400 border border-red-500/20 bg-red-500/5" : "text-emerald-400 border border-emerald-500/20 bg-emerald-500/5"} rounded p-2`}
                  >
                    {bloqueado
                      ? ` Bloqueado: El sector "${result.sector}" no pertenece a los sectores líderes de la etapa ${ciclo.label}. Según Murphy, este sector no está alineado con el ciclo actual.`
                      : `✓ Aprobado: El sector "${result.sector}" está alineado con el ciclo económico actual.`}
                  </div>
                );
              })()}
              {result.beta !== null && result.beta > 1.5 && ciclo.stage >= 4 && (
                <div className="mt-1 text-[9px] text-amber-400/80 border border-amber-500/20 bg-amber-500/5 rounded p-1.5">
                  Beta alto ({result.beta.toFixed(2)}): en etapa de {ciclo.label}, una beta &gt;1.5
                  implica que la acción podría caer más del doble que el índice.
                </div>
              )}
            </div>
          )}

          {/* Señal de inversion — bloque principal */}
          {result.esETF ? (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
                Señal de inversion
              </p>
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <p className="text-[9px] text-muted-foreground">Horizonte</p>
                  <p className="text-[12px] font-semibold text-muted-foreground">—</p>
                </div>
                <div className="h-6 w-px bg-border/30" />
                <div>
                  <p className="text-[9px] text-muted-foreground">Acción sugerida</p>
                  <p className="text-[14px] font-bold text-yellow-400">Ver Análisis Técnico</p>
                </div>
              </div>
            </div>
          ) : (
            (() => {
              const senal = resolverSenalCoherente(
                result.fundScore,
                result.pricePercentile10y,
                result.revenueGrowth,
                result.upsidePct,
                result.recommendationMean,
                result.pePercentile,
              );
              return (
                <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3">
                    Señal de inversion
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div>
                      <p className="text-[9px] text-muted-foreground">Horizonte</p>
                      <p className="text-[12px] font-semibold text-foreground">{senal.plazo}</p>
                    </div>
                    <div className="h-6 w-px bg-border/30" />
                    <div>
                      <p className="text-[9px] text-muted-foreground">Accion sugerida</p>
                      <p className={`text-[14px] font-bold ${signalColor(senal.accion)}`}>
                        {senal.accion}
                      </p>
                    </div>
                  </div>
                  {senal.nota && (
                    <p className="mt-2 text-[9px] text-amber-400/80 leading-relaxed border border-amber-500/20 bg-amber-500/5 rounded p-2">
                      {senal.nota}
                    </p>
                  )}
                  <details className="mt-2">
                    <summary className="text-[9px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                      Ver fórmula de la señal
                    </summary>
                    <div className="mt-1 text-[9px] text-muted-foreground leading-relaxed border border-border/30 rounded p-2 bg-muted/20 space-y-1">
                      <p>
                        Esta señal resulta del <strong>score fundamental</strong> (
                        {result.fundScore}/100) combinado con el <strong>crecimiento</strong> de
                        ingresos y el <strong>upside</strong> al valor intrínseco. Siguiendo a
                        Riquelme (Value Investing), el percentil de precio histórico se ignora para
                        decisiones de largo plazo — el precio de mercado a corto plazo no debe
                        influir en la valuación fundamental.
                      </p>
                      <p>Reglas utilizadas (Riquelme + Amat):</p>
                      <ul className="list-disc list-inside space-y-0.5">
                        <li>
                          Score ≥ 65 + crecimiento &gt; 0 + upside ≥ 50% → <strong>Acumular</strong>{" "}
                          (largo plazo — margen de seguridad del 50%)
                        </li>
                        <li>
                          Score ≥ 55 + upside &gt; 8% → <strong>Acumular gradualmente</strong>{" "}
                          (mediano plazo)
                        </li>
                        <li>
                          Score ≥ 45 → <strong>Mantener</strong> (mediano plazo)
                        </li>
                        <li>
                          Resto → <strong>Cautela</strong>
                        </li>
                      </ul>
                      <p className="text-[8px] text-muted-foreground/60 mt-1">
                        No constituye una recomendacion formal de inversion.
                      </p>
                    </div>
                  </details>
                  {modoGuiado && (
                    <p className="mt-2 text-[9px] text-muted-foreground/70 leading-relaxed italic border-t border-border/20 pt-2">
                      {getExplicacion("senal-inversion")}
                    </p>
                  )}
                </div>
              );
            })()
          )}

          {/* 🔹 Subtabs: Resumen Actual / Por Año / Por Trimestre */}
          <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
            <div className="flex gap-1.5 border-b border-border/40 pb-2 mb-3">
              {(["actual", "anual", "trimestral"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    if (t === "actual") {
                      setHistoricoGranularidad("anual");
                      setSelectedPeriodIdx(-1);
                    } else {
                      setHistoricoGranularidad(t);
                      setSelectedPeriodIdx(0);
                    }
                  }}
                  className={`font-mono text-[10px] px-2.5 py-1 rounded border transition-colors ${
                    (t === "actual" && selectedPeriodIdx < 0) ||
                    (t === historicoGranularidad && selectedPeriodIdx >= 0)
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400"
                      : "border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t === "actual" ? "Resumen Actual" : t === "anual" ? "Por Año" : "Por Trimestre"}
                </button>
              ))}
            </div>

            {/* Periodo selector (navegacion entre periodos) */}
            {selectedPeriodIdx >= 0 && historico.length > 0 && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-[9px] text-muted-foreground font-mono">Periodo:</span>
                <select
                  value={selectedPeriodIdx}
                  onChange={(e) => setSelectedPeriodIdx(Number(e.target.value))}
                  className="bg-background/40 border border-border/60 text-foreground text-[10px] rounded px-2 py-1 font-mono outline-none focus:border-emerald-500/50"
                >
                  {historico.map((p, i) => (
                    <option key={p.endDate} value={i}>
                      {p.label} ({p.endDate})
                    </option>
                  ))}
                </select>
                {historicoLoading && (
                  <span className="text-[9px] text-muted-foreground font-mono">Cargando...</span>
                )}
              </div>
            )}

            {/* Alerta para CEDEARs/ADRs sobre múltiplos de valuación */}
            {result.symbol.endsWith(".BA") && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 mb-4">
                <p className="text-[9px] text-amber-400 font-semibold mb-1">
                  ⚠️ Advertencia: Múltiplos de valuación para CEDEARs
                </p>
                <p className="text-[8px] text-amber-200/80 leading-relaxed">
                  Los múltiplos (P/E, P/B, EV/EBITDA, etc.) para tickers .BA pueden ser incorrectos
                  porque no incluyen el ratio de conversión del CEDEAR ni el tipo de cambio. Los
                  cálculos actuales usan precio en ARS dividido por métricas financieras en USD sin
                  ajustes. Úsese con precaución y preferiblemente analice el ticker subyacente en
                  USD para valuación precisa.
                </p>
              </div>
            )}

            {/* Informe narrativo */}
            {informeNarrativo && (
              <div className="space-y-2 text-[10px] leading-relaxed">
                {informeNarrativo.contexto && (
                  <div>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Contexto
                    </span>
                    <p className="text-foreground/80">{informeNarrativo.contexto}</p>
                  </div>
                )}
                <div>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Qué pasó
                  </span>
                  <p className="text-foreground/80">{informeNarrativo.quePaso}</p>
                </div>
                {informeNarrativo.porQuePaso && (
                  <div>
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Por qué pasó
                    </span>
                    <p className="text-foreground/80">{informeNarrativo.porQuePaso}</p>
                  </div>
                )}
                <div>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Qué significa para la inversión
                  </span>
                  <p className="text-foreground/80">{informeNarrativo.queSignifica}</p>
                </div>
                <div>
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Señal
                  </span>
                  <p className={`font-semibold ${signalColor(informeNarrativo.senalLabel)}`}>
                    {informeNarrativo.senal}
                  </p>
                </div>
              </div>
            )}

            {/* Period detail table */}
            {selectedPeriodIdx >= 0 && historico[selectedPeriodIdx] && (
              <details className="mt-3" open>
                <summary className="text-[9px] text-muted-foreground cursor-pointer hover:text-foreground font-mono mb-2">
                  Datos del período seleccionado
                </summary>
                <div className="mb-2 text-[8px] text-muted-foreground italic">
                  * Estos datos corresponden al cierre del ejercicio fiscal (FY) seleccionado. Los
                  márgenes en "Métricas Fundamentales" son TTM (Trailing Twelve Months).
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-[10px]">
                    <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                      <tr>
                        <th className="px-2 py-1">Métrica</th>
                        <th className="px-2 py-1 text-right">Valor</th>
                        <th className="px-2 py-1 text-right">Var. vs ant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const p = historico[selectedPeriodIdx];
                        const rows: { label: string; val: string; chg: string | null }[] = [];
                        if (p.revenue != null)
                          rows.push({
                            label: "Ingresos",
                            val: `$${(p.revenue / 1e6).toFixed(0)}M`,
                            chg:
                              p.revenueChgPct != null
                                ? `${(p.revenueChgPct * 100).toFixed(1)}%`
                                : null,
                          });
                        if (p.netIncome != null)
                          rows.push({
                            label: "Utilidad neta",
                            val: `$${(p.netIncome / 1e6).toFixed(0)}M`,
                            chg:
                              p.netIncomeChgPct != null
                                ? `${(p.netIncomeChgPct * 100).toFixed(1)}%`
                                : null,
                          });
                        if (p.eps != null)
                          rows.push({
                            label: "EPS (FY)",
                            val: `$${p.eps.toFixed(2)}`,
                            chg: p.epsChgPct != null ? `${(p.epsChgPct * 100).toFixed(1)}%` : null,
                          });
                        if (p.grossMargin != null)
                          rows.push({
                            label: "Margen bruto",
                            val: `${(p.grossMargin * 100).toFixed(1)}%`,
                            chg: null,
                          });
                        if (p.netMargin != null)
                          rows.push({
                            label: "Margen neto (FY)",
                            val: `${(p.netMargin * 100).toFixed(1)}%`,
                            chg: null,
                          });
                        if (p.ebit != null)
                          rows.push({
                            label: "EBIT",
                            val: `$${(p.ebit / 1e6).toFixed(0)}M`,
                            chg: null,
                          });
                        if (p.fcf != null)
                          rows.push({
                            label: "FCF",
                            val: `$${(p.fcf / 1e6).toFixed(0)}M`,
                            chg: null,
                          });
                        if (p.totalAssets != null)
                          rows.push({
                            label: "Activos totales",
                            val: `$${(p.totalAssets / 1e6).toFixed(0)}M`,
                            chg: null,
                          });
                        if (p.totalEquity != null)
                          rows.push({
                            label: "Patrimonio neto",
                            val: `$${(p.totalEquity / 1e6).toFixed(0)}M`,
                            chg: null,
                          });
                        return rows.map((r) => (
                          <tr key={r.label} className="border-b border-border/10">
                            <td className="px-2 py-1 text-muted-foreground">{r.label}</td>
                            <td className="px-2 py-1 text-right text-foreground">{r.val}</td>
                            <td
                              className={`px-2 py-1 text-right ${r.chg ? (parseFloat(r.chg) >= 0 ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"}`}
                            >
                              {r.chg ?? "—"}
                            </td>
                          </tr>
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
                {noticiasPeriodo.length > 0 && (
                  <div className="mt-2">
                    <p className="text-[9px] text-muted-foreground font-mono mb-1">
                      Noticias del período:
                    </p>
                    <div className="space-y-1">
                      {noticiasPeriodo.slice(0, 3).map((n, i) => (
                        <p key={i} className="text-[9px] text-muted-foreground">
                          <span className="text-foreground">{n.publisher}:</span> {n.title}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </details>
            )}
          </div>

          {/* Score + posicion en rango */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Score fundamental */}
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p
                className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1"
                title="Score actual compuesto por 7 metricas con pesos fijos (100 pts total). Se usa para la señal de inversion. Difiere del Health Score histórico, que usa solo 4 metricas y se calcula para cada año fiscal individual."
              >
                Score fundamental detallado
              </p>
              <p className="text-[8px] text-muted-foreground/70 mb-2">
                Valuación y salud financiera actual (7 métricas en tiempo real)
              </p>
              {result.esETF ? (
                <p className="text-[10px] text-muted-foreground py-2">
                  Sin score fundamental (ETF)
                </p>
              ) : (
                <>
                  <ScoreBar
                    score={result.fundScore}
                    rawPts={result.rawPts}
                    maxPts={result.maxPts}
                  />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
                      {result.metricsAvailable}/{result.metricsTotal} métricas
                    </span>
                  </div>
                  <ScoreDetailTable details={result.scoreDetails} />
                </>
              )}
              <details className="mt-2">
                <summary className="text-[9px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Ver bandas de puntaje por métrica
                </summary>
                <div className="mt-1 text-[8px] text-muted-foreground leading-relaxed border border-border/30 rounded p-2 bg-muted/20 space-y-0.5">
                  <p>
                    <strong>ROE</strong> (15 pts): ≥20%=15 | ≥12%=10 | ≥5%=5 | &lt;5%=0
                  </p>
                  <p>
                    <strong>Crec. ingresos</strong> (15 pts): ≥15%=15 | ≥8%=10 | ≥0%=5 | &lt;0%=0
                  </p>
                  <p>
                    <strong>FCF Yield</strong> (10 pts): ≥6%=10 | ≥3%=7 | ≥0%=3 | &lt;0%=0
                  </p>
                  <p>
                    <strong>P/E Trailing</strong> (10 pts): &lt;15x=10 | &lt;25x=7 | &lt;35=3 |
                    ≥35=0
                  </p>
                  <p>
                    <strong>Deuda/Patrimonio</strong> (15 pts): &lt;50%=15 | &lt;100%=10 |
                    &lt;200%=5 | ≥200%=0
                  </p>
                  <p>
                    <strong>Margen neto</strong> (15 pts): ≥20%=15 | ≥10%=10 | ≥0%=5 | &lt;0%=0
                  </p>
                  <p>
                    <strong>Upside analistas</strong> (10 pts): ≥25%=10 | ≥15%=7 | ≥5%=3 | &lt;5%=0
                  </p>
                  <p>
                    <strong>Crec. ganancias</strong> (10 pts): ≥20%=10 | ≥10%=7 | ≥0%=3 | &lt;0%=0
                  </p>
                  <p>
                    Score calculado sobre métricas disponibles. Si un dato no existe, no se incluye.
                  </p>
                </div>
              </details>
            </div>

            {/* Score sectorial (per-sector weighted) */}
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Score sectorial
              </p>
              {scoreSectorial && scoreSectorial.aplica ? (
                <>
                  <ScoreBar score={Math.round(scoreSectorial.scoreSectorial ?? 0)} />
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">
                      {scoreSectorial.coberturaDatos}% cobertura
                    </span>
                    <span className="text-[9px] text-muted-foreground/40">|</span>
                    <span className="text-[9px] text-muted-foreground/60">
                      {scoreSectorial.sector}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {scoreSectorial.metricas
                      .filter((m) => !m.noDisponible)
                      .map((m) => {
                        const color =
                          (m.puntaje ?? 0) >= 75
                            ? "text-emerald-500"
                            : (m.puntaje ?? 0) >= 50
                              ? "text-amber-500"
                              : "text-red-500";
                        return (
                          <div key={m.campo as string} className="flex justify-between text-[9px]">
                            <span className="text-muted-foreground truncate">{m.etiqueta}</span>
                            <span className={`font-mono ${color}`}>
                              {m.valor != null
                                ? formatearValorMetrica(m.valor, m.campo as string) +
                                  " (" +
                                  (m.puntaje ?? "—") +
                                  ")"
                                : "— (—)"}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  {scoreSectorial.alertas.length > 0 && (
                    <div className="mt-2 space-y-0.5">
                      {scoreSectorial.alertas.map((a, i) => (
                        <p key={i} className="text-[8px] leading-tight text-muted-foreground">
                          {a}
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-[10px] text-muted-foreground py-2">
                  {result.esETF ? "Sin score sectorial (ETF)" : "No disponible para este sector"}
                </p>
              )}
            </div>
          </div>

          {/* ─── Beta Propio (calculado vs benchmark) ───────────────── */}
          {(result.betaPropio != null || result.beta != null) && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Beta &mdash; Yahoo vs propio
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
                {result.beta != null && (
                  <div className="rounded border border-border/20 bg-muted/10 p-2">
                    <p className="text-[8px] text-muted-foreground">Beta Yahoo Finance</p>
                    <p className="text-[11px] font-mono font-semibold text-foreground">
                      {result.beta.toFixed(2)}
                    </p>
                  </div>
                )}
                {result.betaPropio != null && (
                  <div className="rounded border border-border/20 bg-muted/10 p-2">
                    <p className="text-[8px] text-muted-foreground">
                      Beta propio
                      {bestBenchmarks && bestBenchmarks.length > 0
                        ? ` (vs ${bestBenchmarks[0].ticker})`
                        : bestBenchmarksLoading
                          ? " (buscando...)"
                          : " (vs SPY/MERVAL)"}
                    </p>
                    <p className="text-[11px] font-mono font-semibold text-foreground">
                      {bestBenchmarks && bestBenchmarks.length > 0
                        ? bestBenchmarks[0].beta.toFixed(2)
                        : result.betaPropio.toFixed(2)}
                    </p>
                  </div>
                )}
                {(bestBenchmarks && bestBenchmarks.length > 0
                  ? bestBenchmarks[0].r2 != null
                  : result.betaR2 != null) && (
                  <div className="rounded border border-border/20 bg-muted/10 p-2">
                    <p className="text-[8px] text-muted-foreground">R&sup2;</p>
                    <p className="text-[11px] font-mono font-semibold text-foreground">
                      {bestBenchmarks && bestBenchmarks.length > 0
                        ? bestBenchmarks[0].r2.toFixed(4)
                        : (result.betaR2?.toFixed(3) ?? "—")}
                    </p>
                  </div>
                )}
                {bestBenchmarks && bestBenchmarks.length > 0 ? (
                  <div className="rounded border border-border/20 bg-muted/10 p-2">
                    <p className="text-[8px] text-muted-foreground">
                      Mejor benchmark (103 factores)
                    </p>
                    <p className="text-[11px] font-mono font-semibold text-foreground">
                      {bestBenchmarks[0].ticker} ({bestBenchmarks[0].name})
                    </p>
                  </div>
                ) : bestBenchmarksLoading ? (
                  <div className="rounded border border-border/20 bg-muted/10 p-2">
                    <p className="text-[8px] text-muted-foreground">Buscando mejor benchmark</p>
                    <p className="text-[11px] font-mono text-muted-foreground animate-pulse">
                      entre 103 factores…
                    </p>
                  </div>
                ) : result.betaBenchmarkUsado != null ? (
                  <div className="rounded border border-border/20 bg-muted/10 p-2">
                    <p className="text-[8px] text-muted-foreground">Benchmark elegido</p>
                    <p className="text-[11px] font-mono font-semibold text-foreground">
                      {result.betaBenchmarkUsado}
                    </p>
                  </div>
                ) : null}
              </div>
              {result.betaAdvertencia && (
                <p className="text-[8px] text-amber-400/80 leading-relaxed border border-amber-500/20 bg-amber-500/5 rounded p-2">
                  {result.betaAdvertencia}
                </p>
              )}
              <p className="mt-1 text-[8px] text-muted-foreground/60">
                {bestBenchmarks && bestBenchmarks.length > 0
                  ? `Beta propio recalculado contra ${bestBenchmarks[0].ticker} (${bestBenchmarks[0].name}, R² ${bestBenchmarks[0].r2.toFixed(4)}), el de mayor correlación entre los 103 factores evaluados.`
                  : bestBenchmarksLoading
                    ? "Evaluando correlación contra los 103 factores de la lista completa de benchmarks para seleccionar el de mayor R²…"
                    : "Beta propio calculado con 6 meses de datos diarios contra SPY y MERVAL. Se elige el benchmark con mayor R²."}
              </p>
            </div>
          )}

          {/* ─── Revisiones de estimados de analistas ────────────────── */}
          {result.revisionEstimadosPct != null && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Momentum de revisiones de analistas
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <p
                  className={`text-[13px] font-bold font-mono ${result.revisionEstimadosPct >= 0 ? "text-emerald-400" : "text-red-400"}`}
                >
                  {result.revisionEstimadosPct >= 0 ? "+" : ""}
                  {result.revisionEstimadosPct}%
                </p>
                <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${result.revisionEstimadosPct >= 5 ? "bg-emerald-400" : result.revisionEstimadosPct <= -5 ? "bg-red-400" : "bg-amber-400"}`}
                  />
                  {result.revisionEstimadosPct >= 5
                    ? "Al alza"
                    : result.revisionEstimadosPct <= -5
                      ? "A la baja"
                      : "Estable"}
                </span>
              </div>
              {result.revisionEstimadosDetalle && (
                <p className="mt-1 text-[9px] text-muted-foreground leading-relaxed">
                  {result.revisionEstimadosDetalle}
                </p>
              )}
            </div>
          )}

          {/* ─── Actividad de insiders ───────────────────────────────── */}
          {result.insiderNetActivityPct != null && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Actividad de insiders (neto)
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <p
                  className={`text-[13px] font-bold font-mono ${result.insiderNetActivityPct >= 10 ? "text-emerald-400" : result.insiderNetActivityPct <= -10 ? "text-red-400" : "text-amber-400"}`}
                >
                  {result.insiderNetActivityPct >= 0 ? "+" : ""}
                  {result.insiderNetActivityPct}%
                </p>
                <span className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${result.insiderNetActivityPct >= 30 ? "bg-emerald-400" : result.insiderNetActivityPct <= -30 ? "bg-red-400" : "bg-amber-400"}`}
                  />
                  {result.insiderNetActivityPct >= 30
                    ? "Compra neta significativa"
                    : result.insiderNetActivityPct <= -30
                      ? "Venta neta significativa"
                      : "Actividad balanceada"}
                </span>
              </div>
              {result.insiderNetActivityInterpretacion && (
                <p className="mt-1 text-[9px] text-muted-foreground leading-relaxed">
                  {result.insiderNetActivityInterpretacion}
                </p>
              )}
            </div>
          )}

          {/* ─── SEC Filings ─────────────────────────────────────────── */}
          {result.secFilings && result.secFilings.length > 0 && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2">
                Presentaciones SEC (&uacute;ltimas)
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-[10px]">
                  <thead className="text-[8px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                    <tr>
                      <th className="px-2 py-1">Fecha</th>
                      <th className="px-2 py-1">Tipo</th>
                      <th className="px-2 py-1">Descripci&oacute;n</th>
                      <th className="px-2 py-1">Enlace</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.secFilings.slice(0, 5).map((f, i) => (
                      <tr key={i} className="border-b border-border/10 last:border-0">
                        <td className="px-2 py-1 text-muted-foreground">{f.date ?? "—"}</td>
                        <td className="px-2 py-1 font-semibold text-foreground">{f.type ?? "—"}</td>
                        <td className="px-2 py-1 text-muted-foreground max-w-[200px] truncate">
                          {f.description ?? "—"}
                        </td>
                        <td className="px-2 py-1">
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 text-[9px]"
                            >
                              Ver
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[8px] text-muted-foreground/60">
                S&oacute;lo se muestran los &uacute;ltimos 5 filings 10-K y 10-Q disponibles en
                Yahoo Finance.
              </p>
            </div>
          )}

          {/* Moat Analysis */}
          <MoatDashboard moat={moat} loading={moatLoading} />

          {/* Análisis Cualitativo Semiautomático (orquestador único) */}
          {analisisCualitativoSA && !analisisCualitativoSA.esETF && (
            <AnalisisCualitativoSemiAutomaticoCard data={analisisCualitativoSA} />
          )}

          {/* Métricas Fundamentales - Dataframe Segmentado */}
          <FundamentalMetricsDataframe
            result={result}
            historico={historico}
            historicoGranularidad={historicoGranularidad}
            onGranularidadChange={setHistoricoGranularidad}
          />

          {/* P/E historico */}
          {!result.esETF && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1">
                Historial de P/E por año fiscal
              </p>
              <p className="text-[9px] text-muted-foreground mb-2">
                P/E calculado usando el precio de cierre de diciembre de cada año fiscal y el EPS
                derivado de la utilidad neta anual dividida las acciones en circulacion. Yahoo
                Finance provee hasta 4 años de estados de resultados.
                {result.pePercentile !== null && (
                  <span
                    className={`ml-1 font-medium ${result.pePercentile >= 70 ? "text-red-400" : result.pePercentile <= 30 ? "text-emerald-400" : "text-amber-400"}`}
                  >
                    Percentil actual: {result.pePercentile} — {peLabel(result.pePercentile)}.
                  </span>
                )}
              </p>
              <PeHistoryTable
                history={result.peHistory}
                currentPE={result.trailingPE}
                percentile={result.pePercentile}
              />
            </div>
          )}

          {/* Health Score histórico */}
          {!result.esETF && result.healthScoreHistory && result.healthScoreHistory.length >= 2 && (
            <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
              <p
                className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1"
                title="Score HECHO (histórico) — calculado con solo 4 metricas (margen neto, ROE, crec. ingresos, crec. ganancias) disponibles en los estados financieros de cada año. Es distinto del Score fundamental detallado actual (7 metricas) que se muestra arriba y que usa datos en tiempo real del modulo financialData de Yahoo Finance."
              >
                Evolución del Health Score (histórico anual)
              </p>
              <p className="text-[9px] text-muted-foreground mb-2">
                Score compuesto calculado a partir de: margen neto (30 pts), ROE (25 pts),
                crecimiento de ingresos (25 pts) y crecimiento de ganancias (20 pts) disponibles en
                los estados financieros históricos de Yahoo Finance.
                {result.healthScoreHistory.length >= 2 && (
                  <span className="ml-1 text-muted-foreground">
                    Último score:{" "}
                    {result.healthScoreHistory[result.healthScoreHistory.length - 1].score}/100.
                  </span>
                )}
              </p>
              <HealthScoreChart history={result.healthScoreHistory} />
            </div>
          )}

          {/* Checklist cualitativo — preguntas pendientes (solo concentración) */}
          <details className="rounded-md border border-border/40 bg-background/40/60 p-4">
            <summary className="text-[9px] uppercase tracking-widest text-muted-foreground cursor-pointer hover:text-foreground select-none">
              Preguntas cualitativas pendientes
            </summary>
            <div className="mt-2 space-y-2">
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                Estas preguntas no se responden con datos de mercado — requieren que investigues el
                negocio. Las primeras 6 ya tienen señales cuantitativas en la sección "Análisis
                Cualitativo" de arriba.
              </p>
              <ul className="space-y-1.5 text-[10px] text-muted-foreground leading-relaxed list-disc list-inside">
                <li>
                  ¿La empresa depende de pocos clientes o proveedores concentrados? (riesgo de
                  concentracion) — pendiente de implementación
                </li>
              </ul>
            </div>
          </details>
        </div>
      )}

      {/* PASO 2 — Botón comparar con pares del sector/industria */}
      {result && !loading && !multiResults.length && result.sector && result.industry && (
        <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
          {peersInfo && peersInfo.totalEncontrados === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              No se encontraron pares en el universo cargado para {result.industry}.
            </p>
          ) : (
            <button
              onClick={handleComparePeers}
              disabled={peersLoading}
              className="w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-[11px] text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono"
            >
              {peersLoading
                ? "Buscando pares..."
                : `Comparar con ${result.industry}${peersInfo ? ` (${peersInfo.totalEncontrados} encontrados)` : ""}`}
            </button>
          )}
        </div>
      )}

      {/* Multi-ticker comparison — companies as rows, metrics as columns */}
      {multiResults.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-border/40">
          {(() => {
            const validResults = multiResults.filter((r) => !(r as any).error);
            if (validResults.length === 0) {
              const firstErr = multiResults.find((r) => (r as any).error);
              return (
                <div className="p-4 text-center">
                  <p className="text-[10px] text-muted-foreground">
                    {firstErr
                      ? (firstErr as any).error
                      : "No hay datos disponibles para mostrar la comparación."}
                  </p>
                  {firstErr && (
                    <p className="mt-1 text-[9px] text-muted-foreground/60">
                      {multiResults.length} ticker(s) consultados, todos fallaron.
                    </p>
                  )}
                </div>
              );
            }
            const metrics = [
              { label: "Precio", key: "currentPrice" as const, fmt: (v: any) => fPrice(v) },
              { label: "Market Cap", key: "marketCapM" as const, fmt: (v: any) => fMarketCap(v) },
              {
                label: "P/E Trailing",
                key: "trailingPE" as const,
                fmt: (v: any) => (v != null ? v.toFixed(1) + "x" : "--"),
              },
              {
                label: "P/E Forward",
                key: "forwardPE" as const,
                fmt: (v: any) => (v != null ? v.toFixed(1) + "x" : "--"),
              },
              {
                label: "PEG",
                key: "pegRatio" as const,
                fmt: (v: any) => (v != null ? v.toFixed(2) : "--"),
              },
              {
                label: "P/B",
                key: "priceToBook" as const,
                fmt: (v: any) => (v != null ? v.toFixed(1) + "x" : "--"),
              },
              {
                label: "EV/EBITDA",
                key: "evToEbitda" as const,
                fmt: (v: any) => (v != null ? v.toFixed(1) + "x" : "--"),
              },
              { label: "ROE", key: "returnOnEquity" as const, fmt: (v: any) => fPct(v) },
              {
                label: "Margen Neto (TTM Yahoo)",
                key: "profitMargin" as const,
                fmt: (v: any) => fPct(v),
              },
              { label: "Crec. Ingresos", key: "revenueGrowth" as const, fmt: (v: any) => fPct(v) },
              {
                label: "Crec. Ganancias",
                key: "earningsGrowth" as const,
                fmt: (v: any) => fPct(v),
              },
              {
                label: "D/E",
                key: "debtToEquityRaw" as const,
                fmt: (v: any) => (v != null ? (v / 100).toFixed(2) + "x" : "--"),
              },
              { label: "FCF Yield", key: "fcfYield" as const, fmt: (v: any) => fPct(v) },
              {
                label: "Dividend Yield",
                key: "dividendYield" as const,
                fmt: (v: any) => (v != null ? (v * 100).toFixed(2) + "%" : "--"),
              },
              {
                label: "Upside (Analistas)",
                key: "upsidePct" as const,
                fmt: (v: any) => {
                  const r = fPct(v, true);
                  if (typeof v === "number" && Math.abs(v) > 300)
                    console.warn(`Upside sospechoso: ${v.toFixed(1)}% para este ticker`);
                  return r;
                },
              },
              {
                label: "Recomendacion",
                key: "recommendationMean" as const,
                fmt: (v: any) => (v != null ? `${v.toFixed(1)} (${recLabel(v)})` : "--"),
              },
              {
                label: "Analistas",
                key: "numberOfAnalystOpinions" as const,
                fmt: (v: any) => (v != null ? v.toString() : "--"),
              },
              {
                label: "Beta",
                key: "beta" as const,
                fmt: (v: any) => (v != null ? v.toFixed(2) : "--"),
              },
              {
                label: "P/E Perc. Hist.",
                key: "pePercentile" as const,
                fmt: (v: any) => (v != null ? `${v}%` : "N/D"),
              },
            ] as const;
            return (
              <>
                <table className="w-full text-left font-mono text-[11px]">
                  <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b-2 border-border/60">
                    <tr>
                      <th className="px-2 py-1.5 text-left sticky left-0 bg-surface z-10">
                        Métrica
                      </th>
                      {validResults.map((rec) => (
                        <th key={rec.symbol} className="px-2 py-1.5 text-right">
                          {rec.symbol}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.map((metric) => {
                      const isPE =
                        metric.key === "trailingPE" ||
                        metric.key === "forwardPE" ||
                        metric.key === "pegRatio" ||
                        metric.key === "pePercentile";
                      const isComp = metric.key === "priceToBook" || metric.key === "evToEbitda";
                      const isRent =
                        metric.key === "returnOnEquity" ||
                        metric.key === "profitMargin" ||
                        metric.key === "revenueGrowth" ||
                        metric.key === "earningsGrowth";
                      const isDeuda =
                        metric.key === "debtToEquityRaw" ||
                        metric.key === "fcfYield" ||
                        metric.key === "dividendYield" ||
                        metric.key === "upsidePct";
                      const seccion = isPE
                        ? "valuacion"
                        : isComp
                          ? "comparables"
                          : isRent
                            ? "rentabilidad"
                            : isDeuda
                              ? "deuda"
                              : "otro";
                      const sectionColors: Record<string, string> = {
                        valuacion: "border-l-2 border-l-blue-500/30",
                        comparables: "border-l-2 border-l-purple-500/30",
                        rentabilidad: "border-l-2 border-l-emerald-500/30",
                        deuda: "border-l-2 border-l-amber-500/30",
                        otro: "",
                      };
                      return (
                        <tr
                          key={metric.key}
                          className={`border-b border-border/20 hover:bg-muted/10 ${sectionColors[seccion] ?? ""}`}
                        >
                          <td className="px-2 py-1 text-muted-foreground whitespace-nowrap sticky left-0 bg-surface z-10">
                            {metric.label}
                          </td>
                          {validResults.map((rec) => {
                            const val = (rec as any)[metric.key];
                            const isError = (rec as any).error;
                            let color = "text-foreground";
                            if (metric.key === "pePercentile") {
                              color =
                                val == null
                                  ? "text-muted-foreground"
                                  : val >= 70
                                    ? "text-red-400"
                                    : val <= 30
                                      ? "text-emerald-400"
                                      : "text-amber-400";
                            } else if (metric.key === "upsidePct") {
                              color =
                                val != null
                                  ? val >= 15
                                    ? "text-emerald-400"
                                    : val >= 0
                                      ? "text-amber-400"
                                      : "text-red-400"
                                  : "text-muted-foreground";
                            } else if (
                              metric.key === "returnOnEquity" ||
                              metric.key === "profitMargin"
                            ) {
                              color =
                                val != null
                                  ? val >= 0.2
                                    ? "text-emerald-400"
                                    : val >= 0.1
                                      ? "text-amber-400"
                                      : "text-muted-foreground"
                                  : "text-muted-foreground";
                            } else if (
                              metric.key === "revenueGrowth" ||
                              metric.key === "earningsGrowth"
                            ) {
                              color =
                                val != null
                                  ? val >= 0.15
                                    ? "text-emerald-400"
                                    : val >= 0.05
                                      ? "text-amber-400"
                                      : "text-muted-foreground"
                                  : "text-muted-foreground";
                            } else if (metric.key === "debtToEquityRaw") {
                              color =
                                val != null
                                  ? val < 50
                                    ? "text-emerald-400"
                                    : val < 100
                                      ? "text-amber-400"
                                      : "text-red-400"
                                  : "text-muted-foreground";
                            } else if (metric.key === "fcfYield") {
                              color =
                                val != null
                                  ? val >= 0.04
                                    ? "text-emerald-400"
                                    : val >= 0
                                      ? "text-amber-400"
                                      : "text-red-400"
                                  : "text-muted-foreground";
                            } else if (metric.key === "recommendationMean") {
                              color =
                                val != null
                                  ? val <= 1.5
                                    ? "text-emerald-400"
                                    : val <= 2.5
                                      ? "text-amber-400"
                                      : "text-red-400"
                                  : "text-muted-foreground";
                            }
                            return (
                              <td
                                key={rec.symbol}
                                className={`px-2 py-1 text-right font-mono ${isError ? "text-red-400" : color}`}
                              >
                                {isError ? "N/D" : metric.fmt(val)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="p-2 text-[8px] text-muted-foreground border-t border-border/20">
                  Datos de Yahoo Finance. Multiples tickers separados por coma o espacio.
                </div>
              </>
            );
          })()}
          {/* Anotaciones de consistencia entre metricas */}
          {multiResults.filter((r) => !(r as any).error).length > 0 &&
            (() => {
              const notas: string[] = [];
              for (const r of multiResults) {
                const rec = r as any;
                if (rec.error) continue;
                if (
                  rec.upsidePct != null &&
                  rec.upsidePct < 0 &&
                  rec.recommendationMean != null &&
                  rec.recommendationMean < 2.5
                ) {
                  notas.push(
                    `${rec.symbol}: Upside negativo (${rec.upsidePct.toFixed(1)}%) contrasta con recomendacion "${recLabel(rec.recommendationMean)}" (${rec.recommendationMean.toFixed(1)}). El precio objetivo promedio ya fue superado por el precio actual.`,
                  );
                }
                if (rec.pegRatio != null && rec.pegRatio > 0 && rec.earningsGrowth == null) {
                  notas.push(
                    `${rec.symbol}: PEG de ${rec.pegRatio.toFixed(2)} calculado con estimaciones forward; no hay dato historico de crecimiento de ganancias para verificar.`,
                  );
                }
              }
              if (notas.length === 0) return null;
              return (
                <div className="px-3 py-2 space-y-1">
                  {notas.map((n, i) => (
                    <p key={i} className="text-[8px] text-amber-400/80 leading-relaxed">
                      {" "}
                      {n}
                    </p>
                  ))}
                </div>
              );
            })()}
        </div>
      )}

      {/* ── Score Fundamental Heatmap ── */}
      {multiResults.filter((r) => !r.error).length > 0 && (
        <ScoreFundamentalHeatmap results={multiResults.filter((r) => !r.error)} />
      )}

      {/* ── Sector comparison ── */}
      {sectorComparacion &&
        !sectorComparacion.loading &&
        !sectorComparacion.error &&
        sectorComparacion.peers.length > 0 &&
        (() => {
          const sc = sectorComparacion;
          // Buscar en multiResults primero, luego en result si no está en multiResults
          const mainData =
            multiResults.find((r) => r.symbol === sc.symbol && !r.error) ??
            (result?.symbol === sc.symbol && !result.error ? result : null);
          if (!mainData) return null;
          // Armar allEntries: anchor + peers del fetch (excluyendo los que ya están en multiResults)
          const peerSet = new Set(
            sc.peers.filter((p) => p.data && !p.data.error).map((p) => p.ticker),
          );
          const allEntries = [
            { ticker: sc.symbol, data: mainData },
            ...sc.peers.filter((p) => p.data && !p.data.error),
          ] as { ticker: string; data: FundamentalAFResult }[];
          // Si hay multiResults, agregar los que pertenezcan al mismo sector/industria y no estén ya en allEntries
          if (multiResults.length > 0) {
            const existingTickers = new Set(allEntries.map((e) => e.ticker));
            const ambitoActual = ambitoComparacion === "industria" ? sc.industria : sc.sector;
            for (const mr of multiResults) {
              if (mr.error || !mr.symbol || existingTickers.has(mr.symbol)) continue;
              const mrAmbito = ambitoComparacion === "industria" ? mr.industry : mr.sector;
              if (mrAmbito === ambitoActual) {
                allEntries.push({ ticker: mr.symbol, data: mr });
                existingTickers.add(mr.symbol);
              }
            }
          }
          if (allEntries.length < 2) return null;
          // Build options for anchor selector (incluir result actual si no está en multiResults)
          const anchorOptions = (multiResults.length > 0 ? multiResults : [result]).filter(
            (r) => r && !r.error && r.sector && r.industry,
          );
          const metrics: {
            label: string;
            key: keyof FundamentalAFResult;
            fmt: (v: any) => string;
            color?: (v: any) => string | undefined;
          }[] = [
            { label: "Market Cap", key: "marketCapM", fmt: (v) => fMarketCap(v) },
            {
              label: "P/E Trailing",
              key: "trailingPE",
              fmt: (v) => (v != null ? v.toFixed(1) + "x" : "--"),
            },
            {
              label: "P/E Forward",
              key: "forwardPE",
              fmt: (v) => (v != null ? v.toFixed(1) + "x" : "--"),
            },
            { label: "PEG", key: "pegRatio", fmt: (v) => (v != null ? v.toFixed(2) : "--") },
            {
              label: "P/B",
              key: "priceToBook",
              fmt: (v) => (v != null ? v.toFixed(1) + "x" : "--"),
            },
            {
              label: "EV/EBITDA",
              key: "evToEbitda",
              fmt: (v) => (v != null ? v.toFixed(1) + "x" : "--"),
            },
            { label: "ROE", key: "returnOnEquity", fmt: (v) => fPct(v) },
            { label: "Margen Neto (TTM)", key: "profitMargin", fmt: (v) => fPct(v) },
            {
              label: "Crec. Ingresos",
              key: "revenueGrowth",
              fmt: (v, ticker) => {
                const isARS = ticker.endsWith(".BA");
                const formatted = fPct(v);
                return isARS ? `${formatted} (nominal, no ajustado por inflación)` : formatted;
              },
            },
            {
              label: "Crec. Ganancias",
              key: "earningsGrowth",
              fmt: (v, ticker) => {
                const isARS = ticker.endsWith(".BA");
                const formatted = fPct(v);
                return isARS ? `${formatted} (nominal, no ajustado por inflación)` : formatted;
              },
            },
            {
              label: "D/E",
              key: "debtToEquityRaw",
              fmt: (v) => (v != null ? (v / 100).toFixed(2) + "x" : "--"),
            },
            { label: "FCF Yield", key: "fcfYield", fmt: (v) => fPct(v) },
            {
              label: "Dividend Yield",
              key: "dividendYield",
              fmt: (v) => (v != null ? (v * 100).toFixed(2) + "%" : "--"),
            },
            { label: "Upside (target analistas)", key: "upsidePct", fmt: (v) => fPct(v, true) },
            {
              label: "Beta",
              key: "beta",
              fmt: (v, ticker) => {
                const formatted = v != null ? v.toFixed(2) : "--";
                const isARS = ticker.endsWith(".BA");
                const benchmark = isARS ? "vs MERVAL" : "vs SPY";
                return v != null ? `${formatted} (${benchmark})` : "--";
              },
            },
          ];
          return (
            <div className="space-y-3 rounded-lg border border-border/40 bg-background/30 p-4">
              <details open>
                <summary className="cursor-pointer font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors list-none flex items-center gap-1">
                  <span className="text-[8px]">▼</span>
                  Comparación sectorial:
                  <select
                    value={sc.symbol}
                    onChange={(e) => {
                      const sym = e.target.value;
                      const found =
                        multiResults.length > 0
                          ? multiResults.find((r) => r.symbol === sym && !r.error)
                          : result?.symbol === sym && !result.error
                            ? result
                            : null;
                      if (found && found.sector && found.industry) {
                        fetchSectorComparacion(sym, found.sector, found.industry, []);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[10px] font-mono bg-transparent border border-border/40 rounded px-1 py-0.5 text-foreground cursor-pointer hover:border-primary/50"
                  >
                    {anchorOptions.map((o) =>
                      o && o.symbol ? (
                        <option key={o.symbol} value={o.symbol}>
                          {o.symbol}
                        </option>
                      ) : null,
                    )}
                  </select>
                  <div className="flex items-center gap-1 ml-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAmbitoComparacion("industria");
                      }}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                        ambitoComparacion === "industria"
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/30 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Industria
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setAmbitoComparacion("sector");
                      }}
                      className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                        ambitoComparacion === "sector"
                          ? "border-primary/60 bg-primary/10 text-primary"
                          : "border-border/30 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Sector
                    </button>
                    <span className="font-normal normal-case text-muted-foreground ml-1">
                      vs {ambitoComparacion === "industria" ? sc.industria : sc.sector}
                    </span>
                  </div>
                </summary>

                {/* View mode toggle: Tabla | Matriz */}
                <div className="flex items-center gap-1 mt-2 mb-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setComparisonView("tabla");
                    }}
                    className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                      comparisonView === "tabla"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Tabla
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setComparisonView("matriz");
                    }}
                    className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                      comparisonView === "matriz"
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border-border/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Matriz
                  </button>
                  {/* R² sort controls in Tabla mode */}
                  {comparisonView === "tabla" && matrizData && (
                    <div className="flex items-center gap-1 ml-auto">
                      <span className="text-[8px] text-muted-foreground">Ordenar por R²:</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSortByR2(sortByR2 === "desc" ? null : "desc");
                        }}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                          sortByR2 === "desc"
                            ? "border-blue-500/60 bg-blue-500/10 text-blue-400"
                            : "border-border/30 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Mayor
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSortByR2(sortByR2 === "asc" ? null : "asc");
                        }}
                        className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                          sortByR2 === "asc"
                            ? "border-blue-500/60 bg-blue-500/10 text-blue-400"
                            : "border-border/30 text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Menor
                      </button>
                    </div>
                  )}
                </div>

                {/* ── TABLA view: fundamental comparison table ── */}
                {comparisonView === "tabla" && (
                  <>
                    {/* Build sorted entries by R² if matrix data available */}
                    {(() => {
                      const displayEntries = [...allEntries];
                      if (sortByR2 && matrizData) {
                        const anchorIdx = matrizData.tickers.indexOf(sc.symbol);
                        if (anchorIdx >= 0) {
                          const r2Map = new Map<string, number>();
                          for (let i = 0; i < matrizData.tickers.length; i++) {
                            r2Map.set(matrizData.tickers[i], matrizData.rSquared[anchorIdx][i]);
                          }
                          displayEntries.sort((a, b) => {
                            const ra = r2Map.get(a.ticker) ?? 0;
                            const rb = r2Map.get(b.ticker) ?? 0;
                            return sortByR2 === "desc" ? rb - ra : ra - rb;
                          });
                        }
                      }
                      return (
                        <div className="mt-2 overflow-x-auto">
                          <table className="w-full text-left font-mono text-[11px]">
                            <thead className="text-[9px] uppercase tracking-wider text-muted-foreground border-b border-border/40">
                              <tr>
                                <th className="px-2 py-1 text-left">Métrica</th>
                                {displayEntries.map((e) => {
                                  const marketInfo = getMarketInfo(e.ticker, e.data?.country);
                                  return (
                                    <th
                                      key={e.ticker}
                                      className={`px-2 py-1 text-right ${e.ticker === sc.symbol ? "text-primary" : ""}`}
                                    >
                                      <div className="flex flex-col items-end">
                                        <span className="font-semibold">{e.ticker}</span>
                                        <span className="text-[8px] text-muted-foreground">
                                          {marketInfo.market} · {marketInfo.currency}
                                        </span>
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {metrics.map((m) => (
                                <tr
                                  key={m.key}
                                  className="border-b border-border/20 last:border-0 hover:bg-muted/10"
                                >
                                  <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                                    {m.label}
                                  </td>
                                  {displayEntries.map((e) => {
                                    const val = (e.data as any)[m.key];
                                    const isMain = e.ticker === sc.symbol;
                                    return (
                                      <td
                                        key={e.ticker}
                                        className={`px-2 py-1 text-right font-mono ${isMain ? "text-primary font-semibold" : "text-foreground"} ${m.color ? (m.color(val) ?? "") : ""}`}
                                      >
                                        {m.fmt(val, e.ticker)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}

                    {/* Complete ticker list from universe */}
                    {allSectorTickers.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAllTickers(!showAllTickers);
                          }}
                          className="text-[9px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                        >
                          <span
                            className={`text-[8px] transition-transform ${showAllTickers ? "rotate-90" : ""}`}
                          >
                            ▶
                          </span>
                          Todos los tickers del {ambitoComparacion} ({allSectorTickers.length})
                        </button>
                        {showAllTickers && (
                          <div className="mt-1 flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                            {allSectorTickers.map((t) => {
                              const hasData = allEntries.some((e) => e.ticker === t);
                              return (
                                <span
                                  key={t}
                                  className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                                    hasData
                                      ? "border-primary/30 bg-primary/10 text-foreground"
                                      : "border-border/20 text-muted-foreground/50"
                                  }`}
                                >
                                  {t}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* ── MATRIZ view: pairwise R² / corr / alpha / beta ── */}
                {comparisonView === "matriz" && (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap gap-1">
                      {(["rSquared", "correlation", "beta", "alpha"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMatrizMetric(m);
                          }}
                          className={`text-[9px] px-2 py-0.5 rounded border transition-colors ${
                            matrizMetric === m
                              ? "border-primary/60 bg-primary/10 text-primary"
                              : "border-border/30 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {m === "rSquared" ? "R²" : m.charAt(0).toUpperCase() + m.slice(1)}
                        </button>
                      ))}
                      {matrizLoading && (
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                          <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          Calculando...
                        </span>
                      )}
                    </div>
                    {matrizData &&
                      matrizData.tickers.length >= 2 &&
                      (() => {
                        const labels = matrizData.tickers;
                        const vn = labels.length;
                        const matrix = matrizData[matrizMetric];
                        const cellColor = (val: number, metric: string): string => {
                          switch (metric) {
                            case "alpha":
                              return val > 0
                                ? `rgba(16,185,129,${Math.min(Math.abs(val) * 20, 0.7)})`
                                : val < 0
                                  ? `rgba(239,68,68,${Math.min(Math.abs(val) * 20, 0.7)})`
                                  : "transparent";
                            case "beta":
                              return val > 1
                                ? `rgba(239,68,68,${Math.min((val - 1) * 3, 0.7)})`
                                : val < 1
                                  ? `rgba(16,185,129,${Math.min((1 - val) * 3, 0.7)})`
                                  : "transparent";
                            case "correlation":
                              return `rgba(16,185,129,${Math.abs(val) * 0.6})`;
                            case "rSquared":
                              return `rgba(59,130,246,${val * 0.65})`;
                            default:
                              return "transparent";
                          }
                        };
                        return (
                          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
                            <table className="w-full text-left font-mono text-[10px]">
                              <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur">
                                <tr>
                                  <th className="px-1.5 py-1 text-left text-[9px] uppercase text-muted-foreground"></th>
                                  {labels.map((l) => (
                                    <th
                                      key={l}
                                      className={`px-1.5 py-1 text-right text-[9px] uppercase ${l === sc.symbol ? "text-primary" : "text-muted-foreground"}`}
                                    >
                                      {l}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {labels.map((rowLabel, i) => (
                                  <tr
                                    key={rowLabel}
                                    className="border-b border-border/10 hover:bg-muted/5"
                                  >
                                    <td
                                      className={`px-1.5 py-1 text-right font-semibold whitespace-nowrap ${rowLabel === sc.symbol ? "text-primary" : "text-foreground"}`}
                                    >
                                      {rowLabel}
                                    </td>
                                    {labels.map((colLabel, j) => {
                                      const val = matrix[i][j];
                                      const isSelf = i === j;
                                      return (
                                        <td
                                          key={colLabel}
                                          className="px-1.5 py-1 text-right font-mono whitespace-nowrap"
                                          style={{
                                            backgroundColor: isSelf
                                              ? "rgba(255,255,255,0.05)"
                                              : cellColor(val, matrizMetric),
                                          }}
                                        >
                                          {isSelf ? "-" : val.toFixed(4)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    {!matrizLoading && (!matrizData || matrizData.tickers.length < 2) && (
                      <p className="text-[10px] text-muted-foreground">
                        No hay suficientes datos para calcular la matriz.
                      </p>
                    )}
                  </div>
                )}

                {/* Conclusión inteligente */}
                {sectorConclusion && (
                  <div className="mt-3 border-t border-border/20 pt-3 space-y-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Conclusión sectorial
                    </p>
                    <p className="text-[10px] text-foreground leading-relaxed">
                      {sectorConclusion.resumenEjecutivo}
                    </p>
                    {sectorConclusion.fortalezas.length > 0 && (
                      <div>
                        <p className="text-[9px] text-emerald-400 font-medium mb-1">Fortalezas</p>
                        <ul className="list-disc list-inside text-[9px] text-muted-foreground space-y-0.5">
                          {sectorConclusion.fortalezas.map((f, i) => (
                            <li key={i}>{f}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {sectorConclusion.debilidades.length > 0 && (
                      <div>
                        <p className="text-[9px] text-red-400 font-medium mb-1">Debilidades</p>
                        <ul className="list-disc list-inside text-[9px] text-muted-foreground space-y-0.5">
                          {sectorConclusion.debilidades.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {sectorConclusion.mejorAlternativaSector && (
                      <div className="rounded border border-emerald-500/20 bg-emerald-500/5 p-2">
                        <p className="text-[9px] text-emerald-400 font-medium">
                          Mejor alternativa del sector
                        </p>
                        <p className="text-[10px] text-foreground mt-0.5">
                          {sectorConclusion.mejorAlternativaSector}
                        </p>
                      </div>
                    )}
                    {sectorConclusion.advertencias.length > 0 &&
                      sectorConclusion.advertencias.map((a, i) => (
                        <p
                          key={i}
                          className="text-[8px] text-amber-400/80 leading-relaxed border border-amber-500/20 bg-amber-500/5 rounded p-1.5"
                        >
                          {a}
                        </p>
                      ))}
                  </div>
                )}
              </details>
            </div>
          );
        })()}

      {/* Glosario de señales — visible siempre */}
    </div>
  );
}
