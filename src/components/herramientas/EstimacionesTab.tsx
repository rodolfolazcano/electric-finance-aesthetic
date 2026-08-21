// @ts-nocheck
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  getEarningsEstimates,
  type EarningsEstimateResult,
} from "@/lib/estimaciones-earnings.server";

function fmtPct(n: number | null | undefined, dp = 1) {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function probLabel(prob: number | null): string {
  if (prob == null) return "S/D";
  if (prob >= 0.9) return "[OK] " + (prob * 100).toFixed(1) + "%";
  if (prob >= 0.75) return " " + (prob * 100).toFixed(1) + "%";
  if (prob >= 0.6) return " " + (prob * 100).toFixed(1) + "%";
  if (prob >= 0.4) return "[ADVERTENCIA] " + (prob * 100).toFixed(1) + "%";
  return "[ERROR] " + (prob * 100).toFixed(1) + "%";
}

export function EstimacionesTab() {
  const [input, setInput] = useState("AAPL, MSFT, NVDA");
  const [tickers, setTickers] = useState<string[]>([]);
  const fn = useServerFn(getEarningsEstimates);

  const query = useQuery({
    queryKey: ["earnings-estimates", tickers.join(",")],
    queryFn: () => fn({ data: { tickers } }),
    enabled: tickers.length > 0,
  });

  const handleAnalyze = () => {
    const tks = input
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tks.length > 0) setTickers(tks);
  };

  return (
    <div className="space-y-4">
      <div className="mono text-[14px] uppercase tracking-[0.22em] text-primary/80">
        Estimaciones de Earnings
      </div>
      <h2 className="text-2xl font-medium tracking-tight">
        Probabilidad de batir estimados — Bootstrap no paramétrico
      </h2>
      <p className="text-xs text-muted-foreground">
        Modelo bootstrap que remuestrea la distribución empírica de sorpresas históricas sin asumir
        normalidad. P(S&gt;0) = prob de sorpresa positiva. P(μ&gt;0) = prob de tendencia positiva.
      </p>

      {/* Input */}
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
          placeholder="AAPL, MSFT, NVDA..."
          className="flex-1 rounded-md border border-border/40 bg-background px-3 py-2 text-sm font-mono outline-none focus:border-primary/60"
        />
        <button
          onClick={handleAnalyze}
          disabled={query.isFetching || !input.trim()}
          className="rounded-md bg-primary/10 px-4 py-2 text-sm font-mono text-primary hover:bg-primary/20 disabled:opacity-50"
        >
          {query.isFetching ? "Analizando..." : "Analizar"}
        </button>
      </div>

      {/* Results */}
      {query.data && query.data.map((r) => <EarningsCard key={r.ticker} result={r} />)}

      {query.isError && (
        <div className="rounded-md border border-danger/30 bg-danger/5 p-3 text-xs text-danger">
          Error al obtener datos
        </div>
      )}
    </div>
  );
}

function EarningsCard({ result }: { result: EarningsEstimateResult }) {
  const [showAll, setShowAll] = useState(false);
  const [periodos, setPeriodos] = useState<number>(0); // 0 = todos
  const isError = result.historial.length === 0;

  const filteredHistory = useMemo(() => {
    const sorted = [...result.historial].sort((a, b) => a.fecha.localeCompare(b.fecha));
    if (periodos > 0 && sorted.length > periodos) return sorted.slice(-periodos);
    return sorted;
  }, [result.historial, periodos]);

  const historyForProb = useMemo(() => {
    return filteredHistory.map((h) => h.sorpresaPct);
  }, [filteredHistory]);

  // Recalculate stats for visible window
  const visibleStats = useMemo(() => {
    const arr = historyForProb;
    if (arr.length < 2) return null;
    const n = arr.length;
    const hits = arr.filter((s) => s > 0).length;
    const avg = arr.reduce((a, b) => a + b, 0) / n;
    const std = n > 1 ? Math.sqrt(arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1)) : 0;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const cohenD = std > 0 ? avg / std : 0;
    // Bootstrap P(S>0)
    let probS = 0;
    for (let i = 0; i < 10000; i++) {
      const idx = Math.floor(Math.random() * arr.length);
      if (arr[idx] > 0) probS++;
    }
    probS /= 10000;
    // Bootstrap P(μ>0)
    let probT = 0;
    for (let i = 0; i < 10000; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += arr[Math.floor(Math.random() * arr.length)];
      if (s / n > 0) probT++;
    }
    probT /= 10000;
    // IC 90%
    const medias: number[] = [];
    for (let i = 0; i < 10000; i++) {
      let s = 0;
      for (let j = 0; j < n; j++) s += arr[Math.floor(Math.random() * arr.length)];
      medias.push(s / n);
    }
    medias.sort((a, b) => a - b);
    return {
      n,
      hits,
      avg,
      std,
      min,
      max,
      cohenD,
      probS,
      probT,
      icInf: medias[Math.floor(medias.length * 0.05)],
      icSup: medias[Math.floor(medias.length * 0.95)],
    };
  }, [historyForProb]);

  const options = [
    { value: 0, label: `Todo (${result.historial.length}Q)` },
    { value: 4, label: "4Q" },
    { value: 8, label: "8Q" },
    { value: 12, label: "12Q" },
  ];

  return (
    <div className="rounded-lg border border-border/40 bg-background/40 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="font-mono text-lg font-semibold">{result.ticker}</span>
          <span className="ml-2 text-xs text-muted-foreground">{result.companyName}</span>
        </div>
        {result.proximoReporte && (
          <span className="text-xs font-mono bg-primary/10 px-2 py-1 rounded">
            {result.proximoReporte}{" "}
            {result.diasHastaProximo != null &&
              (result.diasHastaProximo <= 0 ? " HOY" : ` en ${result.diasHastaProximo}d`)}
          </span>
        )}
      </div>

      {isError ? (
        <div className="text-xs text-muted-foreground">{result.companyName}</div>
      ) : (
        <>
          {/* Period selector */}
          <div className="flex gap-1">
            {options.map((o) => (
              <button
                key={o.value}
                onClick={() => setPeriodos(o.value)}
                className={`text-[13px] px-2 py-0.5 rounded border transition-colors ${
                  periodos === o.value
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {/* Probabilities (recalculated for visible window) */}
          <div className="grid w-full grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricBox
              label="P(S>0)"
              value={visibleStats ? probLabel(visibleStats.probS) : probLabel(result.probSPositiva)}
            />
            <MetricBox
              label="P(μ>0)"
              value={visibleStats ? probLabel(visibleStats.probT) : probLabel(result.probTendencia)}
            />
            <MetricBox
              label="Histórico"
              value={
                visibleStats
                  ? `${((visibleStats.hits / visibleStats.n) * 100).toFixed(0)}% (${visibleStats.hits}/${visibleStats.n})`
                  : `${(result.tasaHistorica * 100).toFixed(0)}% (${result.hits}/${result.nTrimestres})`
              }
            />
            <MetricBox
              label="d Cohen"
              value={
                visibleStats
                  ? visibleStats.cohenD.toFixed(2)
                  : result.cohenD != null
                    ? result.cohenD.toFixed(2)
                    : "S/D"
              }
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Sorpresa promedio: {fmtPct(visibleStats?.avg ?? result.avgSorpresa)} | σ:{" "}
            {fmtPct(visibleStats?.std ?? result.stdSorpresa)} | Min:{" "}
            {fmtPct(visibleStats?.min ?? result.minSorpresa)} | Max:{" "}
            {fmtPct(visibleStats?.max ?? result.maxSorpresa)}
            {(visibleStats?.icInf ?? result.icInf) != null && (
              <>
                {" "}
                | IC 90%: [{(visibleStats?.icInf ?? result.icInf)?.toFixed(1)}%,{" "}
                {(visibleStats?.icSup ?? result.icSup)?.toFixed(1)}%]
              </>
            )}
          </div>

          {result.epsEstimadoProximo != null && (
            <div className="text-xs">
              <span className="text-muted-foreground">Próximo EPS estimado: </span>
              <span className="font-mono font-semibold">
                ${result.epsEstimadoProximo.toFixed(2)}
              </span>
            </div>
          )}

          {/* History toggle */}
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-muted-foreground hover:text-foreground underline decoration-dotted"
          >
            {showAll ? "Ocultar" : "Mostrar"} historial ({filteredHistory.length} trimestres)
          </button>
          {showAll && (
            <div className="overflow-x-auto w-full">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-border/40 text-muted-foreground">
                    <th className="px-2 py-1 text-left">Fecha</th>
                    <th className="px-2 py-1 text-right">Estimado</th>
                    <th className="px-2 py-1 text-right">Real</th>
                    <th className="px-2 py-1 text-right">Sorpresa</th>
                    <th className="px-2 py-1 text-right">Sorpresa%</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filteredHistory].reverse().map((h) => (
                    <tr key={h.fecha} className="border-b border-border/10">
                      <td className="px-2 py-1">{h.fecha}</td>
                      <td className="px-2 py-1 text-right">${h.epsEstimado.toFixed(2)}</td>
                      <td className="px-2 py-1 text-right">${h.epsReal.toFixed(2)}</td>
                      <td
                        className={`px-2 py-1 text-right ${h.sorpresa >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {h.sorpresa >= 0 ? "+" : ""}${h.sorpresa.toFixed(2)}
                      </td>
                      <td
                        className={`px-2 py-1 text-right ${h.sorpresaPct >= 0 ? "text-success" : "text-danger"}`}
                      >
                        {fmtPct(h.sorpresaPct)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MetricBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/40 bg-background/40 p-2">
      <div className="text-[13px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-semibold">{value}</div>
    </div>
  );
}
