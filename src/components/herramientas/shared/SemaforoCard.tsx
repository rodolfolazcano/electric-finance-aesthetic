// @ts-nocheck
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SemaforoResult } from "@/lib/herramientas/finance.functions";
import { GRID_STROKE, Metric, ScorePill, ChartTip } from "./chart-constants";
import { fmtNum, fmtPct, fmtCap, lightColor } from "./formatters";

export function SemaforoCard({
  data,
  onNavigateToFundamental,
}: {
  data: SemaforoResult;
  onNavigateToFundamental?: (ticker: string) => void;
}) {
  const chartData = useMemo(() => data.history.map((h) => ({ d: h.date, p: h.close })), [data]);
  const [expandedSignal, setExpandedSignal] = useState<number | null>(null);
  const scores = data.scoreTecnicoDetalle;

  return (
    <div className="rounded-md border border-border/40 bg-background/40 min-w-0 overflow-hidden p-4">
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="mono truncate text-xl font-semibold">{data.ticker}</h3>
            {data.clasificacionJerarquica ? (
              <span
                className={`rounded-full border px-2 py-0.5 text-[13px] font-medium ${
                  data.clasificacionJerarquica === "COMPRA" ||
                  data.clasificacionJerarquica === "COMPRA CON CAUTELA"
                    ? "border-success/40 bg-success/10 text-success"
                    : data.clasificacionJerarquica === "MANTENER"
                      ? "border-warning/40 bg-warning/10 text-warning"
                      : "border-danger/40 bg-danger/10 text-danger"
                }`}
              >
                {data.clasificacionJerarquica}
              </span>
            ) : (
              <span
                className={`rounded-full border px-2 py-0.5 text-[13px] font-medium uppercase tracking-wider ${lightColor(data.light)}`}
              >
                {data.recommendation}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {data.name} · {data.sector ?? "\u2014"}
            {data.lastUpdated && (
              <span className="ml-2 text-muted-foreground/60">
                · Actualizado:{" "}
                {new Date(data.lastUpdated).toLocaleString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
            {data.extended?.fechaProximoEarnings && (
              <span className="ml-2 text-warning">
                · Próximo earnings: {data.extended.fechaProximoEarnings}
              </span>
            )}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground/60">
            {data.dataSource === "yahoo" ? "Yahoo Finance (delay 15-20 min)" : "IOL (tiempo real)"}
            {data.lastUpdated && (
              <> · Actualizado: {new Date(data.lastUpdated).toLocaleString("es-AR")}</>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="mono text-2xl font-light">
            {fmtNum(data.price)}{" "}
            <span className="text-xs text-muted-foreground">{data.currency}</span>
          </div>
          <div className={`mono text-xs ${data.change1d >= 0 ? "text-success" : "text-danger"}`}>
            {fmtPct(data.change1d)}
          </div>
        </div>
      </div>

      <div className="mt-5 h-44 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID_STROKE} vertical={false} />
            <XAxis dataKey="d" hide />
            <YAxis domain={["dataMin", "dataMax"]} hide />
            <Tooltip content={<ChartTip prefix={data.currency + " "} />} />
            <Area
              type="monotone"
              dataKey="p"
              stroke="var(--color-primary)"
              strokeWidth={1.5}
              fill="url(#g1)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5">
        <Metric label="RSI(14)" value={fmtNum(data.rsi, 1)} />
        <Metric label="SMA50" value={fmtNum(data.sma50)} />
        <Metric label="SMA200" value={fmtNum(data.sma200)} />
        <Metric
          label="MACD"
          value={fmtNum(data.macd, 3)}
          sub={`sig ${fmtNum(data.macdSignal, 3)} · ${data.macd > data.macdSignal ? "alcista" : "bajista"}`}
        />
        <Metric label="52w bajo" value={fmtNum(data.low52)} />
        <Metric label="52w alto" value={fmtNum(data.high52)} />
        <Metric label="P/E" value={data.pe != null ? fmtNum(data.pe, 1) : "\u2014"} />
        <Metric
          label="P/E Perc"
          value={data.pePercentile != null ? `${data.pePercentile.toFixed(0)}/100` : "\u2014"}
          sub={
            data.pePercentile == null && data.pePercentileReason
              ? data.pePercentileReason
              : undefined
          }
        />
        <Metric label="Market cap" value={fmtCap(data.marketCap)} />
      </div>

      {/* Scores */}
      <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
        <ScorePill label="Score técnico" value={data.techScore} />
        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
          <span className="text-xs text-muted-foreground">Score jerárquico</span>
          <span
            className={`mono text-base ${
              data.clasificacionJerarquica === "COMPRA" ||
              data.clasificacionJerarquica === "COMPRA CON CAUTELA"
                ? "text-success"
                : data.clasificacionJerarquica === "MANTENER"
                  ? "text-warning"
                  : "text-danger"
            }`}
          >
            {data.totalScore > 0 ? "+" : ""}
            {data.totalScore.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Tendencia + Momentum + Soporte/Resistencia labels */}
      {scores && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[13px] text-muted-foreground">
            {scores.tendencia.label}
          </span>
          {data.soportes && data.soportes.length > 0 && (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[13px] text-muted-foreground">
              Soporte ${data.soportes[0].precio.toFixed(2)} ({data.distanciaSoporte?.toFixed(1)}%)
              {data.soportes[0].esEstimado ? " — estimado por mínimo 52 semanas" : ""}
            </span>
          )}
          {data.resistencias && data.resistencias.length > 0 && (
            <span className="rounded-md border border-border bg-muted/40 px-2 py-1 text-[13px] text-muted-foreground">
              Resistencia ${data.resistencias[0].precio.toFixed(2)} (+
              {data.distanciaResistencia?.toFixed(1)}%)
              {data.resistencias[0].esEstimado ? " — estimado por máximo 52 semanas" : ""}
            </span>
          )}
        </div>
      )}

      {/* Extended data: Consenso analistas + Ownership */}
      {data.extended && (data.extended.consensoAnalistas || data.extended.ownership) && (
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.extended.consensoAnalistas && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="mb-1.5 text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
                Consenso de analistas
              </div>
              <div className="flex gap-2 text-[13px] font-mono">
                <span className="text-success">{data.extended.consensoAnalistas.strongBuy} SB</span>
                <span className="text-success/70">{data.extended.consensoAnalistas.buy} B</span>
                <span className="text-muted-foreground">
                  {data.extended.consensoAnalistas.hold} H
                </span>
                <span className="text-danger/70">{data.extended.consensoAnalistas.sell} S</span>
                <span className="text-danger">{data.extended.consensoAnalistas.strongSell} SS</span>
              </div>
            </div>
          )}
          {data.extended.ownership && (
            <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="mb-1.5 text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
                Quién sostiene esto
              </div>
              {data.extended.ownership.porcentajeInstitucional == null &&
              data.extended.ownership.porcentajeInsiders == null ? (
                <div className="text-[13px] text-muted-foreground">Dato no disponible</div>
              ) : (
                <div className="flex gap-3 text-[13px] font-mono">
                  <span className="text-foreground">
                    Inst:{" "}
                    {data.extended.ownership.porcentajeInstitucional != null
                      ? `${data.extended.ownership.porcentajeInstitucional.toFixed(1)}%`
                      : "—"}
                  </span>
                  <span className="text-foreground">
                    Insiders:{" "}
                    {data.extended.ownership.porcentajeInsiders != null
                      ? `${data.extended.ownership.porcentajeInsiders.toFixed(1)}%`
                      : "—"}
                  </span>
                  {data.extended.ownership.comprasRecientesInsiders != null &&
                    data.extended.ownership.ventasRecientesInsiders != null && (
                      <span className="text-muted-foreground">
                        {data.extended.ownership.comprasRecientesInsiders === 0 &&
                        data.extended.ownership.ventasRecientesInsiders === 0
                          ? "Sin actividad registrada"
                          : data.extended.ownership.comprasRecientesInsiders >
                              data.extended.ownership.ventasRecientesInsiders
                            ? "Comprando"
                            : "Vendiendo"}
                      </span>
                    )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sorpresa de earnings */}
      {data.extended?.sorpresaPromedioPct != null && (
        <div className="mt-3">
          <span
            className={`rounded-md border px-2 py-1 text-[13px] ${
              data.extended.sorpresaPromedioPct > 0
                ? "border-success/40 bg-success/10 text-success"
                : "border-danger/40 bg-danger/10 text-danger"
            }`}
          >
            Sorpresa earnings promedio: {data.extended.sorpresaPromedioPct > 0 ? "+" : ""}
            {data.extended.sorpresaPromedioPct.toFixed(2)}%
            {Math.abs(data.extended.sorpresaPromedioPct) > 100
              ? " — valor distorsionado por base baja"
              : ""}
          </span>
        </div>
      )}

      {/* Interpretaciones expandibles */}
      <div className="mt-5">
        <div className="mb-2 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
          Señales
        </div>
        <div className="flex flex-wrap gap-1.5">
          {data.signals.map((s, i) => (
            <span
              key={i}
              onClick={() => setExpandedSignal(expandedSignal === i ? null : i)}
              className={`cursor-pointer rounded-md border px-2 py-1 text-[14px] transition-all ${
                s.tone === "good"
                  ? "border-success/40 bg-success/10 text-success hover:bg-success/20"
                  : s.tone === "bad"
                    ? "border-danger/40 bg-danger/10 text-danger hover:bg-danger/20"
                    : "border-border bg-muted/40 text-muted-foreground hover:bg-muted/60"
              } ${expandedSignal === i ? "ring-1 ring-primary/30" : ""}`}
              title={s.lectura}
            >
              {s.label}
            </span>
          ))}
        </div>
        {/* Lecturas expandidas */}
        {expandedSignal != null && data.signals[expandedSignal]?.lectura && (
          <div className="mt-2 rounded-md border border-border/40 bg-muted/10 p-3 text-[14px] leading-relaxed">
            <p className="text-foreground">{data.signals[expandedSignal].lectura}</p>
            {data.signals[expandedSignal].implicancia && (
              <p className="mt-1 text-muted-foreground border-t border-border/20 pt-1">
                {data.signals[expandedSignal].implicancia}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Cierre interpretativo */}
      {data.cierreInterpretacion && (
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3">
          <p className="text-[14px] leading-relaxed text-foreground">{data.cierreInterpretacion}</p>
        </div>
      )}

      {/* Botón de navegación a análisis fundamental (solo para acciones/CEDEARs/ADRs/ETFs) */}
      {data.infoActivo?.soportaFundamental && onNavigateToFundamental && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-[13px] text-muted-foreground">
            {data.infoActivo.descripcion} ·{" "}
            {data.infoActivo.soportaFundamental
              ? "Con análisis fundamental disponible"
              : "Solo análisis técnico"}
          </div>
          <button
            onClick={() => onNavigateToFundamental(data.ticker)}
            className="rounded-md bg-accent/15 border border-accent/30 px-3 py-1.5 text-[14px] text-accent hover:bg-accent/25 transition-colors"
          >
            Ver análisis fundamental
          </button>
        </div>
      )}

      {/* Score unificado (si está disponible) */}
      {data.scoreUnificado && (
        <div className="mt-4 rounded-md border border-border/40 bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] uppercase tracking-[0.16em] text-muted-foreground">
              Score unificado{" "}
              {data.infoActivo?.soportaFundamental ? "(técnico + fundamental)" : "(técnico)"}
            </span>
            <span
              className={`mono text-base font-semibold ${
                data.scoreUnificado.total > 1.5
                  ? "text-success"
                  : data.scoreUnificado.total < -1.5
                    ? "text-danger"
                    : "text-warning"
              }`}
            >
              {data.scoreUnificado.total >= 0 ? "+" : ""}
              {data.scoreUnificado.total.toFixed(1)}
            </span>
          </div>
          {data.scoreUnificado.contradiccion && (
            <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 p-2">
              <p className="text-[13px] text-warning">
                {data.scoreUnificado.contradiccion.descripcion}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
