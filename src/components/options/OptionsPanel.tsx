// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-mono font-semibold uppercase tracking-wider text-foreground">
          Panel de Opciones — BCBA
        </h2>
        <div className="flex gap-2">
          <select
            value={subyacente}
            onChange={(e) => setSubyacente(e.target.value as OpcionSubyacente)}
            className="h-7 text-[10px] font-mono bg-background border border-border/40 rounded px-2"
          >
            {OPCIONES_SUBYACENTES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <Button onClick={loadData} disabled={loading} size="sm" className="h-7 text-[10px]">
            {loading ? "Cargando..." : "Actualizar"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="p-3 border border-border/40 bg-background/40/80 backdrop-blur-sm">
          <p className="text-[8px] font-mono text-muted-foreground uppercase">Spot</p>
          <p className="text-lg font-mono font-semibold text-foreground">
            {formatPrice(spotPrice)}
          </p>
        </Card>
        <Card className="p-3 border border-border/40 bg-background/40/80 backdrop-blur-sm">
          <p className="text-[8px] font-mono text-muted-foreground uppercase">Vol. Dinámica</p>
          <p className="text-lg font-mono font-semibold text-foreground">
            {formatPct(volatilidad?.din ?? null)}
          </p>
        </Card>
        <Card className="p-3 border border-border/40 bg-background/40/80 backdrop-blur-sm">
          <p className="text-[8px] font-mono text-muted-foreground uppercase">Tasa (Caución)</p>
          <p className="text-lg font-mono font-semibold text-foreground">{formatPct(tasaRiesgo)}</p>
        </Card>
        <Card className="p-3 border border-border/40 bg-background/40/80 backdrop-blur-sm">
          <p className="text-[8px] font-mono text-muted-foreground uppercase">Dividend Yield</p>
          <p className="text-lg font-mono font-semibold text-foreground">
            {formatPct(tasaDividendos)}
          </p>
        </Card>
        <Card className="p-3 border border-border/40 bg-background/40/80 backdrop-blur-sm">
          <p className="text-[8px] font-mono text-muted-foreground uppercase">Skew</p>
          <p className="text-lg font-mono font-semibold text-foreground">
            {skew ? (
              <span
                className={
                  skew.interpretation === "alcista"
                    ? "text-emerald-400"
                    : skew.interpretation === "bajista"
                      ? "text-red-400"
                      : "text-amber-400"
                }
              >
                {skew.skewPct.toFixed(1)}%
              </span>
            ) : (
              "\u2014"
            )}
          </p>
        </Card>
      </div>

      {/* Options table */}
      <Card className="border border-border/40 bg-background/40/80 backdrop-blur-sm p-4">
        <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
          Opciones ({options.length})
        </h3>
        {options.length === 0 && !session.accessToken && (
          <p className="text-[10px] font-mono text-amber-400 mb-2">
            Inicie sesión en IOL (botón "IOL" en el navbar) para cargar opciones
          </p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[9px] font-mono">
            <thead>
              <tr className="text-muted-foreground border-b border-border/20">
                <th className="text-left py-1 pr-2">Símbolo</th>
                <th className="text-right px-2">Tipo</th>
                <th className="text-right px-2">Strike</th>
                <th className="text-right px-2">Venc.</th>
                <th className="text-right px-2">T (años)</th>
                <th className="text-right px-2">Precio</th>
                <th className="text-right px-2">BS</th>
                <th className="text-right px-2">Bin.</th>
                <th className="text-right px-2">Vol. Imp.</th>
                <th className="text-right px-2">Delta</th>
                <th className="text-right px-2">Gamma</th>
                <th className="text-right px-2">Vega</th>
                <th className="text-right px-2">Theta</th>
                <th className="text-right px-2">Prob ITM</th>
                <th className="text-right px-2">VaR</th>
                <th className="text-right px-2">Moneyness</th>
              </tr>
            </thead>
            <tbody>
              {options.map((o) => (
                <tr
                  key={o.simbolo}
                  onClick={() => setSelectedOption(o)}
                  className={`border-b border-border/10 hover:bg-muted/20 cursor-pointer transition-colors ${
                    selectedOption?.simbolo === o.simbolo ? "bg-primary/5" : ""
                  }`}
                >
                  <td className="py-1 pr-2 text-foreground/90">{o.simbolo}</td>
                  <td className="text-right px-2">
                    <span className={o.tipoOpcion === "Call" ? "text-emerald-400" : "text-red-400"}>
                      {o.tipoOpcion === "Call" ? "C" : "P"}
                    </span>
                  </td>
                  <td className="text-right px-2 text-foreground/80">{o.strike.toFixed(0)}</td>
                  <td className="text-right px-2 text-muted-foreground">
                    {o.fechaVencimiento.slice(5)}
                  </td>
                  <td className="text-right px-2 text-muted-foreground">{o.T.toFixed(2)}</td>
                  <td className="text-right px-2 text-foreground/90">
                    {o.precioOpcion.toFixed(2)}
                  </td>
                  <td
                    className={`text-right px-2 ${o.diffBSPct != null && Math.abs(o.diffBSPct) > 5 ? "text-amber-400" : "text-foreground/80"}`}
                  >
                    {o.blackScholes?.toFixed(2) ?? "\u2014"}
                  </td>
                  <td
                    className={`text-right px-2 ${o.diffBinPct != null && Math.abs(o.diffBinPct) > 5 ? "text-amber-400" : "text-foreground/80"}`}
                  >
                    {o.binomial?.toFixed(2) ?? "\u2014"}
                  </td>
                  <td className="text-right px-2 text-foreground/80">
                    {o.volatilidadImplicita != null ? formatPct(o.volatilidadImplicita) : "\u2014"}
                  </td>
                  <td className="text-right px-2">
                    <DeltaBadge delta={o.greeks?.delta ?? null} />
                  </td>
                  <td className="text-right px-2 text-foreground/80">
                    {o.greeks?.gamma.toFixed(6) ?? "\u2014"}
                  </td>
                  <td className="text-right px-2 text-foreground/80">
                    {o.greeks?.vega.toFixed(4) ?? "\u2014"}
                  </td>
                  <td className="text-right px-2 text-foreground/80">
                    {o.greeks?.theta.toFixed(4) ?? "\u2014"}
                  </td>
                  <td className="text-right px-2 text-foreground/80">
                    {o.probITM != null ? `${(o.probITM * 100).toFixed(1)}%` : "\u2014"}
                  </td>
                  <td className="text-right px-2 text-foreground/80">
                    {o.var != null ? o.var.toFixed(4) : "\u2014"}
                  </td>
                  <td className="text-right px-2">
                    <Badge
                      variant="outline"
                      className={`text-[7px] h-3 px-1 ${
                        o.moneyness === "ITM"
                          ? "border-emerald-500/30 text-emerald-400"
                          : o.moneyness === "OTM"
                            ? "border-red-500/30 text-red-400"
                            : "border-amber-500/30 text-amber-400"
                      }`}
                    >
                      {o.moneyness}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Visualization tabs */}
      <div className="flex gap-1 border-b border-border/20 pb-1">
        {[
          { key: "payoff" as const, label: "Payoff" },
          { key: "smile" as const, label: "Sonrisa Vol." },
          { key: "prob-itm" as const, label: "Prob. ITM" },
          { key: "var" as const, label: "VaR" },
          { key: "griegas" as const, label: "Griegas" },
          { key: "estrategias" as const, label: "Estrategias" },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setVizTab(t.key)}
            className={`text-[9px] font-mono px-2.5 py-1 rounded-t transition-colors ${
              vizTab === t.key
                ? "bg-primary/10 text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {vizTab === "payoff" && spotPrice != null && (
        <PayoffChart legs={payoffLegs} spotActual={spotPrice} />
      )}

      {vizTab === "smile" && (
        <SmileChart
          options={options}
          spot={spotPrice ?? 0}
          volHist={volatilidad?.hist}
          volDin={volatilidad?.din}
        />
      )}

      {vizTab === "prob-itm" && <ProbITMChart options={options} spot={spotPrice ?? 0} />}

      {vizTab === "var" && <VaRChart options={options} spot={spotPrice ?? 0} />}

      {vizTab === "griegas" && selectedOption && spotPrice != null && (
        <GreeksSensitivity
          tipo={selectedOption.tipoOpcion}
          strike={selectedOption.strike}
          T={selectedOption.T}
          r={tasaRiesgo}
          sigma={selectedOption.volatilidadImplicita ?? volatilidad?.din ?? 0.3}
          spotBase={spotPrice}
          q={tasaDividendos}
        />
      )}

      {vizTab === "griegas" && !selectedOption && (
        <Card className="p-4 border border-border/40 bg-background/40/80 backdrop-blur-sm">
          <p className="text-[9px] font-mono text-muted-foreground">
            Seleccione una opción en la tabla para ver sensibilidad de griegas
          </p>
        </Card>
      )}

      {vizTab === "estrategias" && <StrategyBuilder />}

      {/* High probability */}
      {(highProb.itm.length > 0 || highProb.otm.length > 0) && (
        <Card className="border border-border/40 bg-background/40/80 backdrop-blur-sm p-4">
          <h3 className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider mb-3">
            Alta probabilidad (&gt;70%)
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {highProb.itm.length > 0 && (
              <div>
                <p className="text-[8px] font-mono text-emerald-400 mb-1">ITM</p>
                {highProb.itm.map((o) => (
                  <div key={o.simbolo} className="text-[9px] font-mono text-foreground/80">
                    {o.simbolo} — Strike {o.strike.toFixed(0)} — Prob{" "}
                    {((o.probITM ?? 0) * 100).toFixed(1)}%
                  </div>
                ))}
              </div>
            )}
            {highProb.otm.length > 0 && (
              <div>
                <p className="text-[8px] font-mono text-red-400 mb-1">OTM</p>
                {highProb.otm.map((o) => (
                  <div key={o.simbolo} className="text-[9px] font-mono text-foreground/80">
                    {o.simbolo} — Strike {o.strike.toFixed(0)} — Prob OTM{" "}
                    {((o.probOTM ?? 0) * 100).toFixed(1)}%
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Disclaimer */}
      <p className="text-[8px] text-muted-foreground text-center pt-2">{CNV_DISCLAIMER}</p>
    </div>
  );
}
