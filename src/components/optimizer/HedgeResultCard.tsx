// @ts-nocheck
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { HedgeOptimizationResult } from "@/lib/capm-hedge.types";

interface Props {
  result: HedgeOptimizationResult;
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass p-2 text-xs font-mono space-y-0.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name}>
          <span style={{ color: p.color }}>{p.name}: </span>
          <span>{p.value.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function confiabilidadColor(c: string) {
  if (c === "alta") return "border-success/40 bg-success/10 text-success";
  if (c === "media") return "border-warning/40 bg-warning/10 text-warning";
  return "border-danger/40 bg-danger/10 text-danger";
}

function confiabilidadLabel(c: string) {
  if (c === "alta") return "Alta confianza";
  if (c === "media") return "Confianza media";
  return "Correlación débil — cobertura parcial";
}

export function HedgeResultCard({ result }: Props) {
  const { position, hedgeAssets, postHedge } = result;
  const isBetaNeutral = Math.abs(postHedge.betaNeto) < 0.1;
  const leverageBruto = postHedge.leverageBruto ?? 0;
  const leverageNeto = postHedge.leverageNeto ?? 0;
  const leverageAlerta = leverageBruto > 3;

  return (
    <div className="space-y-3 rounded-lg border border-border/40 bg-muted/5 p-4">
      <div className="flex items-center justify-between border-b border-border/20 pb-2">
        <h4 className="font-mono text-xs font-semibold text-foreground">
          {position.ticker}
          <span className="ml-2 font-normal text-muted-foreground">— {position.description}</span>
        </h4>
        <div className="flex items-center gap-2">
          {isBetaNeutral && (
            <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 font-mono text-[10px] text-success">
              Beta &lt; 0.1 — neutra
            </span>
          )}
          {!postHedge.ejecutable && (
            <span className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 font-mono text-[10px] text-danger">
              No ejecutable
            </span>
          )}
          {leverageBruto > 0 && (
            <span
              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] group relative ${
                leverageAlerta
                  ? "border-warning/40 bg-warning/10 text-warning"
                  : "border-border/40 text-muted-foreground"
              }`}
              title={`Leverage bruto: ${leverageBruto.toFixed(2)}x (exposición total / saldo)\nLeverage neto: ${leverageNeto.toFixed(2)}x (exposición menos costos / saldo)`}
            >
              Leverage: {leverageBruto.toFixed(1)}x{leverageAlerta && " >3x"}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <div className="space-y-0.5">
          <span className="font-mono text-[10px] text-muted-foreground">Benchmark activo</span>
          <p className="font-mono text-xs text-foreground">
            {position.bestBenchmark}
            <span className="ml-1 text-muted-foreground">
              (R²: {position.bestBenchmarkR2.toFixed(2)})
            </span>
          </p>
          {position.bestBenchmarkConfiabilidad && (
            <span
              className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[9px] ${confiabilidadColor(position.bestBenchmarkConfiabilidad)}`}
              title={
                position.bestBenchmarkConfiabilidad === "baja"
                  ? "Correlación débil — esta cobertura reduce el riesgo solo parcialmente"
                  : undefined
              }
            >
              {confiabilidadLabel(position.bestBenchmarkConfiabilidad)}
            </span>
          )}
        </div>
        <div className="space-y-0.5">
          <span className="font-mono text-[10px] text-muted-foreground">Beta posición</span>
          <p className="font-mono text-xs text-foreground">{position.beta.toFixed(4)}</p>
        </div>
        <div className="space-y-0.5">
          <span className="font-mono text-[10px] text-muted-foreground">Delta USD</span>
          <p className="font-mono text-xs text-foreground">${position.deltaUSD.toFixed(2)}</p>
        </div>
        <div className="space-y-0.5">
          <span className="font-mono text-[10px] text-muted-foreground">Beta USD</span>
          <p className="font-mono text-xs text-foreground">${position.betaUSD.toFixed(2)}</p>
        </div>
        <div className="space-y-0.5">
          <span className="font-mono text-[10px] text-muted-foreground">Observaciones</span>
          <p className="font-mono text-xs text-foreground">{position.observations}</p>
        </div>
      </div>

      {position.equityCurve && position.equityCurve.length > 0 && (
        <div className="h-48">
          <div className="mono mb-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Evolución histórica — {position.ticker} vs {position.bestBenchmark}
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={position.equityCurve}
              margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="posGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="benchGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis dataKey="date" hide />
              <YAxis
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
                width={36}
              />
              <Tooltip content={<ChartTip />} />
              <Area
                type="monotone"
                dataKey="position"
                stroke="#10b981"
                strokeWidth={1.5}
                fill="url(#posGrad)"
                name={position.ticker}
              />
              <Area
                type="monotone"
                dataKey="benchmark"
                stroke="#f59e0b"
                strokeWidth={1.5}
                fill="url(#benchGrad)"
                name={position.bestBenchmark}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {hedgeAssets.length > 0 && (
        <>
          <div className="border-t border-border/20 pt-2">
            <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Cobertura propuesta
            </span>
            <div className="mt-1.5 overflow-x-auto">
              <table className="w-full text-left font-mono text-[11px]">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-1">Instrumento</th>
                    <th className="px-2 py-1">Tipo</th>
                    <th className="px-2 py-1 text-right">Monto USD</th>
                    <th className="px-2 py-1 text-right">Cantidad</th>
                    <th className="px-2 py-1 text-right">Mercado</th>
                    <th className="px-2 py-1 text-right">β hedge</th>
                    <th className="px-2 py-1 text-right">Corr.</th>
                  </tr>
                </thead>
                <tbody>
                  {hedgeAssets.map((a) => (
                    <tr key={a.ticker} className="border-b border-border/10">
                      <td className="px-2 py-1 font-semibold text-foreground">
                        {a.ticker}
                        {a.noEjecutable && (
                          <span className="ml-1 text-danger" title="Cantidad a operar = 0"></span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-muted-foreground">{a.tipo}</td>
                      <td className="px-2 py-1 text-right text-danger">
                        -${a.montoUSD.toFixed(2)}
                      </td>
                      <td
                        className={`px-2 py-1 text-right ${a.noEjecutable ? "text-danger" : "text-foreground"}`}
                      >
                        {a.noEjecutable ? "0 (monto insuficiente)" : (a.cantidadOperar ?? "-")}
                      </td>
                      <td className="px-2 py-1 text-right text-muted-foreground">
                        {a.mercadoEjecucion ?? "-"}
                      </td>
                      <td className="px-2 py-1 text-right text-muted-foreground">
                        {a.beta.toFixed(3)}
                      </td>
                      <td className="px-2 py-1 text-right text-muted-foreground">
                        {a.correlation.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-md border border-border/30 bg-muted/10 p-3 sm:grid-cols-4">
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] text-muted-foreground">Delta neto</span>
              <p
                className={`font-mono text-xs ${Math.abs(postHedge.deltaNeto) < 0.1 ? "text-success" : "text-foreground"}`}
              >
                ${postHedge.deltaNeto.toFixed(2)}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  (↓{postHedge.deltaReductionPct.toFixed(0)}%)
                </span>
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] text-muted-foreground">Beta neto</span>
              <p
                className={`font-mono text-xs ${Math.abs(postHedge.betaNeto) < 0.1 ? "text-success" : "text-foreground"}`}
              >
                ${postHedge.betaNeto.toFixed(2)}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  (↓{postHedge.betaReductionPct.toFixed(0)}%)
                </span>
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] text-muted-foreground">Costo total</span>
              <p className="font-mono text-xs text-foreground">
                ${postHedge.totalCostoUSD.toFixed(2)}
              </p>
            </div>
            <div className="space-y-0.5">
              <span className="font-mono text-[10px] text-muted-foreground">Saldo restante</span>
              {postHedge.ejecutable ? (
                <p className="font-mono text-xs text-foreground">
                  ${postHedge.saldoRestante.toFixed(2)}
                </p>
              ) : (
                <p className="font-mono text-xs text-danger">
                  Cobertura no ejecutable con el saldo actual — se necesitan al menos $
                  {postHedge.depositoMinimoSugerido.toFixed(2)} USD
                </p>
              )}
            </div>
            {leverageBruto > 0 && (
              <div className="space-y-0.5 group relative">
                <span className="font-mono text-[10px] text-muted-foreground">Leverage bruto</span>
                <p
                  className={`font-mono text-xs ${leverageAlerta ? "text-warning" : "text-foreground"}`}
                  title="Exposición total de la cobertura dividida el saldo disponible"
                >
                  {leverageBruto.toFixed(2)}x
                </p>
              </div>
            )}
            {leverageNeto > 0 && (
              <div className="space-y-0.5 group relative">
                <span className="font-mono text-[10px] text-muted-foreground">Leverage neto</span>
                <p
                  className="font-mono text-xs text-foreground"
                  title="Exposición neta (descontando costos) dividida el saldo disponible"
                >
                  {leverageNeto.toFixed(2)}x
                </p>
              </div>
            )}
            {(postHedge.costoFinanciamiento ?? 0) > 0 && (
              <div className="space-y-0.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                  Costo financ. (cauc.)
                </span>
                <p className="font-mono text-xs text-warning">
                  ${postHedge.costoFinanciamiento?.toFixed(2)}/año
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {hedgeAssets.filter((a) => a.montoUSD < 0).length > 0 && (
        <div className="space-y-1 rounded-md border border-border/20 bg-muted/5 p-3">
          <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Nota — Asimetría del short
          </span>
          {hedgeAssets
            .filter((a) => a.montoUSD < 0)
            .map((a) => (
              <p
                key={a.ticker}
                className="font-mono text-[10px] leading-relaxed text-muted-foreground"
              >
                {a.ticker}: si sube X%, la pérdida es -X% - costo de préstamo; si baja X%, la
                ganancia es solo +X% - costo de préstamo.
              </p>
            ))}
        </div>
      )}

      {hedgeAssets.length === 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 px-3 py-2 font-mono text-[11px] text-warning">
          No se encontraron activos de cobertura adecuados para esta posición.
        </div>
      )}
    </div>
  );
}
