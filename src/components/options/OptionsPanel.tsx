// @ts-nocheck
import { useState, useEffect, useCallback, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useIOLSession } from "@/lib/iol-context";
import {
  fetchOpcionesIOL,
  fetchCauciones,
  OPCIONES_SUBYACENTES,
  type OpcionSubyacente,
} from "@/lib/options-pricing/iol-options.api";
import { fetchYahooChartServer } from "@/lib/yahoo-fetch";
import {
  procesarOpcion,
  procesarOpciones,
  calcularSkew,
  filtrarAltaProbabilidad,
} from "@/lib/options-pricing/options-processor";
import { calcularVolatilidadCompleta, sanearVolatilidad } from "@/lib/options-pricing/volatility";
import { fetchYahooDividends, calcularTasaDividendos } from "@/lib/options-pricing/yahoo-dividends";
import type {
  OptionContract,
  ProcessedOption,
  SkewResult,
} from "@/lib/options-pricing/options.types";
import { PayoffChart } from "./PayoffChart";
import { SmileChart } from "./SmileChart";
import { GreeksSensitivity } from "./GreeksSensitivity";
import { StrategyBuilder } from "./StrategyBuilder";
import { ProbITMChart } from "./ProbITMChart";
import { VaRChart } from "./VaRChart";

const CNV_DISCLAIMER =
  "El desempeño pasado no garantiza resultados futuros. Esta información es con fines educativos e informativos y no constituye recomendación de inversión.";

function formatPct(v: number | null, decimals = 2): string {
  if (v == null) return "\u2014";
  return `${(v * 100).toFixed(decimals)}%`;
}

function formatPrice(v: number | null): string {
  if (v == null) return "\u2014";
  return `$${v.toFixed(2)}`;
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="text-muted-foreground">\u2014</span>;
  const color = delta > 0.5 ? "text-emerald-400" : delta < -0.5 ? "text-red-400" : "text-amber-400";
  return <span className={color}>{delta.toFixed(4)}</span>;
}

type VizTab = "payoff" | "smile" | "prob-itm" | "var" | "griegas" | "estrategias";

export function OptionsPanel() {
  const fetchOpciones = useServerFn(fetchOpcionesIOL);
  const fetchCauc = useServerFn(fetchCauciones);
  const fetchChart = useServerFn(fetchYahooChartServer);

  const [subyacente, setSubyacente] = useState<OpcionSubyacente>("GGAL");
  const [options, setOptions] = useState<ProcessedOption[]>([]);
  const [skew, setSkew] = useState<SkewResult | null>(null);
  const [tasaRiesgo, setTasaRiesgo] = useState(0.05);
  const [loading, setLoading] = useState(false);
  const [spotPrice, setSpotPrice] = useState<number | null>(null);
  const [volatilidad, setVolatilidad] = useState<{ hist: number; din: number } | null>(null);
  const [tasaDividendos, setTasaDividendos] = useState(0);
  const [selectedOption, setSelectedOption] = useState<ProcessedOption | null>(null);
  const [vizTab, setVizTab] = useState<VizTab>("payoff");
  const [vencimiento, setVencimiento] = useState<string>("TODOS");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const session = useIOLSession();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const cauc = await fetchCauc({});
      if (cauc) setTasaRiesgo(cauc.tasaPromedio);

      const bearerToken = session.accessToken ?? "";
      const contracts = await fetchOpciones({ data: { simbolo: subyacente, bearerToken } });

      let spot = contracts[0]?.precioSubyacente || 0;
      let volHist = 0.3,
        volDin = 0.3;

      try {
        const result = await fetchChart({
          data: { symbol: `${subyacente}.BA`, range: "1y", interval: "1d" },
        });
        const chartData = result?.chart?.chart?.result?.[0];
        const closes = chartData?.indicators?.quote?.[0]?.close ?? [];
        const validCloses = closes.filter((c: number | null): c is number => c != null);
        if (validCloses.length > 30) {
          const vc = calcularVolatilidadCompleta(validCloses, 30, 0.94);
          volHist = vc.historica;
          volDin = vc.dinamica;
        }
        if (!spot && chartData?.meta?.regularMarketPrice) {
          spot = chartData.meta.regularMarketPrice;
        }
      } catch {}
      const saneada = sanearVolatilidad(volHist, volDin);
      volHist = saneada.historica;
      volDin = saneada.dinamica;
      setVolatilidad({ hist: volHist, din: volDin });

      let q = 0;
      try {
        const { dividendos, tasaAnual } = await fetchYahooDividends(`${subyacente}.BA`);
        if (tasaAnual > 0 && spot > 0) {
          q = calcularTasaDividendos(tasaAnual, spot);
        }
      } catch {}
      setTasaDividendos(q);

      const processed = contracts.map((c) =>
        procesarOpcion({ ...c, precioSubyacente: spot }, tasaRiesgo, q, volDin),
      );
      setOptions(processed);
      setSpotPrice(spot);
      setPage(0);

      const s = calcularSkew(processed, spot);
      setSkew(s);
    } catch (e) {
      console.error("Error loading options:", e);
    }
    setLoading(false);
  }, [subyacente, tasaRiesgo, session.accessToken, fetchOpciones, fetchCauc, fetchChart]);

  useEffect(() => {
    loadData();
  }, [subyacente]);

  const highProb = filtrarAltaProbabilidad(options, 0.7);

  // Vencimientos disponibles para tabs
  const vencimientos = useMemo(() => {
    const set = new Set<string>();
    options.forEach((o) => {
      const v = o.fechaVencimiento ? o.fechaVencimiento.slice(0, 10) : "";
      if (v) set.add(v);
    });
    const sorted = Array.from(set).sort();
    return ["TODOS", ...sorted];
  }, [options]);

  const filtered = useMemo(() => {
    if (vencimiento === "TODOS") return options;
    return options.filter((o) => o.fechaVencimiento.slice(0, 10) === vencimiento);
  }, [options, vencimiento]);

  const paged = useMemo(() => filtered.slice(page * pageSize, (page + 1) * pageSize), [filtered, page]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const payoffLegs = selectedOption
    ? [
        {
          tipo: selectedOption.tipoOpcion as "Call" | "Put",
          strike: selectedOption.strike,
          prima: selectedOption.precioOpcion,
          cantidad: 1,
          compra: true,
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      {/* Header con fuentes visibles */}
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Panel de Opciones — BCBA</h2>
          <p className="text-[14px] text-muted-foreground mt-1">
            Fuente: <span className="text-foreground">BYMA</span> · <span className="text-foreground">IOL</span> · Yahoo Finance · Tasa caución BYMA · Delay 15-20’
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[14px] font-medium text-muted-foreground">Subyacente</label>
          <select
            value={subyacente}
            onChange={(e) => setSubyacente(e.target.value as OpcionSubyacente)}
            className="h-9 text-[13px] font-mono bg-background border border-border rounded-lg px-3"
          >
            {OPCIONES_SUBYACENTES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button onClick={loadData} disabled={loading} size="sm" className="h-9 text-[12px] px-4">
            {loading ? "Cargando..." : "Actualizar"}
          </Button>
        </div>
      </div>

      {/* Configurador */}
      <Card className="p-6 border border-border/40 bg-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Parámetros de valuación</h3>
          <span className="text-[13px] text-muted-foreground">BS + Binomial · Vol dinámica saneada</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
          <div className="rounded-xl border border-border/40 bg-muted/20 p-5">
            <p className="text-[14px] font-medium uppercase tracking-wide text-muted-foreground">Spot {subyacente}</p>
            <p className="text-[18px] font-mono font-semibold mt-1">{formatPrice(spotPrice)}</p>
            <p className="text-[13px] text-muted-foreground mt-1">IOL último · Yahoo .BA</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/20 p-5">
            <p className="text-[14px] font-medium uppercase tracking-wide text-muted-foreground">Vol. Dinámica</p>
            <p className="text-[18px] font-mono font-semibold mt-1">{formatPct(volatilidad?.din ?? null)}</p>
            <p className="text-[13px] text-muted-foreground mt-1">Hist {formatPct(volatilidad?.hist ?? null)} · EWMA 0.94</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/20 p-5">
            <p className="text-[14px] font-medium uppercase tracking-wide text-muted-foreground">Tasa (Caución)</p>
            <p className="text-[18px] font-mono font-semibold mt-1">{formatPct(tasaRiesgo)}</p>
            <p className="text-[13px] text-muted-foreground mt-1">BYMA caución promedio</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/20 p-5">
            <p className="text-[14px] font-medium uppercase tracking-wide text-muted-foreground">Dividend Yield</p>
            <p className="text-[18px] font-mono font-semibold mt-1">{formatPct(tasaDividendos)}</p>
            <p className="text-[13px] text-muted-foreground mt-1">Yahoo 12m / Spot</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-muted/20 p-5">
            <p className="text-[14px] font-medium uppercase tracking-wide text-muted-foreground">Skew</p>
            <p className="text-[18px] font-mono font-semibold mt-1">
              {skew ? (
                <span className={skew.interpretation === "alcista" ? "text-emerald-400" : skew.interpretation === "bajista" ? "text-red-400" : "text-amber-400"}>
                  {skew.skewPct.toFixed(1)}%
                </span>
              ) : (
                "\u2014"
              )}
            </p>
            <p className="text-[13px] text-muted-foreground mt-1 capitalize">{skew?.interpretation ?? "—"}</p>
          </div>
        </div>
      </Card>

      {/* Cadena de opciones */}
      <Card className="border border-border/40 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/20 flex flex-wrap items-center justify-between gap-5">
          <div>
            <h3 className="text-[12px] font-semibold">Cadena de opciones</h3>
            <p className="text-[14px] text-muted-foreground">Mostrando {filtered.length} de {options.length} contratos · Click en fila para graficar · Spot {formatPrice(spotPrice)}</p>
          </div>
          <label className="flex items-center gap-2 text-[14px] font-medium cursor-pointer">
            <input type="checkbox" checked={showAdvanced} onChange={(e) => setShowAdvanced(e.target.checked)} className="rounded" />
            Métricas avanzadas
          </label>
        </div>

        {!session.accessToken && (
          <div className="mx-4 mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-600 dark:text-amber-400">
            Iniciá sesión en IOL (botón IOL arriba a la derecha) para cargar cotizaciones reales.
          </div>
        )}

        {/* Tabs por vencimiento */}
        <div className="px-2 py-2 flex gap-1.5 overflow-x-auto border-b border-border/10 bg-muted/10">
          {vencimientos.map((v) => (
            <button
              key={v}
              onClick={() => { setVencimiento(v); setPage(0); }}
              className={`shrink-0 text-[14px] font-mono px-3 py-1.5 rounded-full border transition-colors ${vencimiento === v ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border/40 text-muted-foreground hover:text-foreground"}`}
            >
              {v === "TODOS" ? `Todos (${options.length})` : v}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[12px] font-mono">
            <thead className="sticky top-0 bg-muted/20 backdrop-blur">
              <tr className="text-muted-foreground border-b border-border/20 text-[14px] uppercase tracking-wide">
                <th className="text-left py-2.5 px-3">Símbolo</th>
                <th className="text-center">Tipo</th>
                <th className="text-right px-2">Strike</th>
                <th className="text-right px-2">Venc.</th>
                <th className="text-right px-2">Precio</th>
                <th className="text-right px-2">BS</th>
                <th className="text-right px-2">Vol.Imp</th>
                <th className="text-right px-2">Delta</th>
                <th className="text-right px-2">Prob ITM</th>
                {showAdvanced && (
                  <>
                    <th className="text-right px-2">Gamma</th>
                    <th className="text-right px-2">Vega</th>
                    <th className="text-right px-2">Theta</th>
                    <th className="text-right px-2">VaR</th>
                  </>
                )}
                <th className="text-right pr-3">Moneyness</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((o) => (
                <tr key={o.simbolo} onClick={() => setSelectedOption(o)} className={`border-b border-border/10 hover:bg-muted/20 cursor-pointer transition-colors ${selectedOption?.simbolo === o.simbolo ? "bg-primary/10" : ""}`}>
                  <td className="py-2 px-3 font-medium text-foreground">{o.simbolo}</td>
                  <td className="text-center">
                    <span className={`inline-flex h-5 w-5 items-center justify-center rounded text-[13px] font-bold ${o.tipoOpcion === "Call" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"}`}>{o.tipoOpcion === "Call" ? "C" : "P"}</span>
                  </td>
                  <td className="text-right px-2">{o.strike.toFixed(0)}</td>
                  <td className="text-right px-2 text-muted-foreground">{o.fechaVencimiento.slice(5, 10)}</td>
                  <td className="text-right px-2 font-medium">{o.precioOpcion.toFixed(2)}</td>
                  <td className={`text-right px-2 ${o.diffBSPct != null && Math.abs(o.diffBSPct) > 5 ? "text-amber-400" : ""}`}>{o.blackScholes?.toFixed(2) ?? "\u2014"}</td>
                  <td className="text-right px-2">{o.volatilidadImplicita != null ? formatPct(o.volatilidadImplicita) : "\u2014"}</td>
                  <td className="text-right px-2"><DeltaBadge delta={o.greeks?.delta ?? null} /></td>
                  <td className="text-right px-2">{o.probITM != null ? `${(o.probITM * 100).toFixed(1)}%` : "\u2014"}</td>
                  {showAdvanced && (
                    <>
                      <td className="text-right px-2 text-muted-foreground">{o.greeks?.gamma.toFixed(5) ?? "\u2014"}</td>
                      <td className="text-right px-2 text-muted-foreground">{o.greeks?.vega.toFixed(3) ?? "\u2014"}</td>
                      <td className="text-right px-2 text-muted-foreground">{o.greeks?.theta.toFixed(3) ?? "\u2014"}</td>
                      <td className="text-right px-2 text-muted-foreground">{o.var != null ? o.var.toFixed(3) : "\u2014"}</td>
                    </>
                  )}
                  <td className="text-right pr-3">
                    <Badge variant="outline" className={`text-[13px] h-5 px-1.5 ${o.moneyness === "ITM" ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10" : o.moneyness === "OTM" ? "border-red-500/30 text-red-400 bg-red-500/10" : "border-amber-500/30 text-amber-400 bg-amber-500/10"}`}>{o.moneyness}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación + fuentes */}
        <div className="flex flex-wrap items-center justify-between gap-5 px-4 py-3 border-t border-border/20 bg-muted/5">
          <p className="text-[14px] text-muted-foreground">Fuente: IOL · BYMA — {subyacente} · {vencimiento} · Página {page + 1} de {totalPages} · {filtered.length} contratos</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-[14px]" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Anterior</Button>
            <span className="text-[14px] font-mono">{page + 1} / {totalPages}</span>
            <Button variant="outline" size="sm" className="h-7 text-[14px]" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Siguiente</Button>
          </div>
        </div>
      </Card>

      {/* Visualizaciones */}
      <div className="flex gap-1.5 border-b border-border/20 overflow-x-auto pb-1">
        {[
          { key: "payoff" as const, label: "Payoff" },
          { key: "smile" as const, label: "Sonrisa Vol." },
          { key: "prob-itm" as const, label: "Prob. ITM" },
          { key: "var" as const, label: "VaR" },
          { key: "griegas" as const, label: "Griegas" },
          { key: "estrategias" as const, label: "Estrategias" },
        ].map((t) => (
          <button key={t.key} onClick={() => setVizTab(t.key)} className={`shrink-0 text-[12px] font-medium px-3.5 py-2 rounded-t-lg border-b-2 transition-colors ${vizTab === t.key ? "bg-primary/10 text-primary border-primary" : "text-muted-foreground hover:text-foreground border-transparent"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {vizTab === "payoff" && (
        spotPrice != null ? <PayoffChart legs={payoffLegs} spotActual={spotPrice} /> : (
          <Card className="p-8 text-center border border-dashed"><p className="text-[13px] font-medium">Seleccioná una opción de la tabla para ver el Payoff</p><p className="text-[14px] text-muted-foreground mt-1">Click en cualquier fila de la cadena</p></Card>
        )
      )}
      {vizTab === "smile" && <SmileChart options={options} spot={spotPrice ?? 0} volHist={volatilidad?.hist} volDin={volatilidad?.din} />}
      {vizTab === "prob-itm" && <ProbITMChart options={options} spot={spotPrice ?? 0} />}
      {vizTab === "var" && <VaRChart options={options} spot={spotPrice ?? 0} />}
      {vizTab === "griegas" && selectedOption && spotPrice != null && (
        <GreeksSensitivity tipo={selectedOption.tipoOpcion} strike={selectedOption.strike} T={selectedOption.T} r={tasaRiesgo} sigma={selectedOption.volatilidadImplicita ?? volatilidad?.din ?? 0.3} spotBase={spotPrice} q={tasaDividendos} />
      )}
      {vizTab === "griegas" && !selectedOption && (
        <Card className="p-10 text-center border border-dashed"><p className="text-[13px] font-medium">Seleccioná una opción para ver sensibilidad de griegas</p><p className="text-[14px] text-muted-foreground mt-1">Delta, Gamma, Vega y Theta vs. Spot</p></Card>
      )}
      {vizTab === "estrategias" && <StrategyBuilder />}

      {(highProb.itm.length > 0 || highProb.otm.length > 0) && (
        <Card className="border border-border/40 bg-card p-6">
          <h3 className="text-[12px] font-semibold uppercase tracking-wide mb-3">Alta probabilidad (&gt;70%)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {highProb.itm.length > 0 && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                <p className="text-[14px] font-semibold text-emerald-400 mb-2">ITM · {highProb.itm.length} contratos</p>
                <div className="space-y-1">
                  {highProb.itm.slice(0, 8).map((o) => (
                    <div key={o.simbolo} className="flex justify-between text-[12px] font-mono"><span>{o.simbolo} · {o.strike.toFixed(0)}</span><span className="text-emerald-400">{((o.probITM ?? 0) * 100).toFixed(1)}%</span></div>
                  ))}
                </div>
              </div>
            )}
            {highProb.otm.length > 0 && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-5">
                <p className="text-[14px] font-semibold text-red-400 mb-2">OTM · {highProb.otm.length} contratos</p>
                <div className="space-y-1">
                  {highProb.otm.slice(0, 8).map((o) => (
                    <div key={o.simbolo} className="flex justify-between text-[12px] font-mono"><span>{o.simbolo} · {o.strike.toFixed(0)}</span><span className="text-red-400">{((o.probOTM ?? 0) * 100).toFixed(1)}%</span></div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <p className="text-[14px] text-muted-foreground text-center border-t border-border/10 pt-3">{CNV_DISCLAIMER} — Fuentes: IOL · BYMA · Yahoo Finance</p>
    </div>
  );
}
