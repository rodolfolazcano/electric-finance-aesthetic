import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getMacroMicroAnalysis } from "@/lib/macro-analysis.functions";

function fmtNum(n: number | null, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function IndicatorCard({
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/40/40 p-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-sm font-semibold font-mono ${color}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function MacroMicroPanel() {
  const getAnalysis = useServerFn(getMacroMicroAnalysis);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["macro-analysis"],
    queryFn: () => getAnalysis(),
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
        Error al cargar análisis macro. Intente nuevamente.
      </div>
    );
  }

  const { global, argentina, micro } = data;

  const readings: string[] = [];
  if (argentina.brechaCambiaria != null) {
    readings.push(
      `Brecha cambiaria: ${argentina.brechaCambiaria.toFixed(1)}% — ${argentina.brechaCambiaria > 20 ? "elevada respecto al promedio histórico reciente" : "en niveles moderados"}.`,
    );
  }
  if (argentina.riesgoPais != null) {
    readings.push(
      `Riesgo País: ${argentina.riesgoPais} bps — ${argentina.riesgoPais > 1500 ? "nivel elevado que refleja incertidumbre soberana" : argentina.riesgoPais > 800 ? "nivel moderado-alto" : "nivel reducido relativo al histórico argentino"}.`,
    );
  }
  if (micro.mervalVar != null) {
    readings.push(
      `Merval: ${micro.mervalVar >= 0 ? "+" : ""}${micro.mervalVar.toFixed(2)}% — ${micro.mervalVar > 0 ? "rendimiento positivo en la sesión" : "presión vendedora en la sesión"}.`,
    );
  }
  if (global.sp500Var != null) {
    readings.push(
      `S&P 500: ${global.sp500Var >= 0 ? "+" : ""}${global.sp500Var.toFixed(2)}% — ${global.sp500Var > 0 ? "sesión alcista en Wall Street" : "corrección en mercados externos"}.`,
    );
  }
  if (argentina.reservas != null) {
    readings.push(
      `Reservas BCRA: USD ${fmtNum(argentina.reservas, 0)} — indicador de solvencia del balance del banco central.`,
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Global */}
        <div className="space-y-3">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Contexto Global
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <IndicatorCard
              label="DXY (Dólar)"
              value={global.dxy != null ? fmtNum(global.dxy, 2) : "\u2014"}
            />
            <IndicatorCard
              label="UST 10Y"
              value={global.ust10y != null ? fmtPct(global.ust10y, 2) : "\u2014"}
            />
            <IndicatorCard
              label="S&P 500"
              value={global.sp500 != null ? fmtNum(global.sp500, 0) : "\u2014"}
              sub={global.sp500Var != null ? fmtPct(global.sp500Var) : undefined}
              color={
                global.sp500Var != null && global.sp500Var >= 0 ? "text-success" : "text-danger"
              }
            />
            <IndicatorCard
              label="Nasdaq (QQQ)"
              value={global.nasdaq != null ? fmtNum(global.nasdaq, 0) : "\u2014"}
              sub={global.nasdaqVar != null ? fmtPct(global.nasdaqVar) : undefined}
              color={
                global.nasdaqVar != null && global.nasdaqVar >= 0 ? "text-success" : "text-danger"
              }
            />
            <IndicatorCard
              label="Tasa Fed"
              value={global.fedRate != null ? fmtPct(global.fedRate * 100, 2) : "\u2014"}
              sub={global.fedRateDate ? `actualizado: ${global.fedRateDate}` : undefined}
            />
          </div>
        </div>

        {/* Argentina */}
        <div className="space-y-3">
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Argentina
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <IndicatorCard
              label="Reservas BCRA"
              value={argentina.reservas != null ? `USD ${fmtNum(argentina.reservas, 0)}` : "\u2014"}
            />
            <IndicatorCard
              label="Base Monetaria"
              value={
                argentina.baseMonetaria != null
                  ? `$${fmtNum(argentina.baseMonetaria, 0)}`
                  : "\u2014"
              }
            />
            <IndicatorCard
              label="Tasa Pol. Monetaria"
              value={
                argentina.tasaPoliticaMonetaria != null
                  ? fmtPct(argentina.tasaPoliticaMonetaria, 1)
                  : "\u2014"
              }
            />
            <IndicatorCard
              label="Riesgo País"
              value={
                argentina.riesgoPais != null ? `${fmtNum(argentina.riesgoPais, 0)} bps` : "\u2014"
              }
            />
            <IndicatorCard
              label="Inflación Mensual"
              value={
                argentina.inflacionMensual != null
                  ? fmtPct(argentina.inflacionMensual, 1)
                  : "\u2014"
              }
              sub={
                argentina.inflacionInteranual != null
                  ? `interanual: ${argentina.inflacionInteranual.toFixed(1)}%`
                  : undefined
              }
            />
            <IndicatorCard
              label="TC Oficial"
              value={
                argentina.tipoCambioOficial != null
                  ? `$${fmtNum(argentina.tipoCambioOficial, 2)}`
                  : "\u2014"
              }
            />
            <IndicatorCard
              label="TC MEP"
              value={
                argentina.tipoCambioMEP != null
                  ? `$${fmtNum(argentina.tipoCambioMEP, 2)}`
                  : "\u2014"
              }
            />
            <IndicatorCard
              label="TC CCL"
              value={
                argentina.tipoCambioCCL != null
                  ? `$${fmtNum(argentina.tipoCambioCCL, 2)}`
                  : "\u2014"
              }
            />
            <IndicatorCard
              label="Brecha Cambiaria"
              value={
                argentina.brechaCambiaria != null ? fmtPct(argentina.brechaCambiaria, 1) : "\u2014"
              }
              color={
                argentina.brechaCambiaria != null && argentina.brechaCambiaria > 20
                  ? "text-warning"
                  : "text-success"
              }
            />
          </div>
        </div>
      </div>

      {/* Micro - Merval movers */}
      <Card className="border-border/40 bg-background/40/40 p-4">
        <h3 className="mb-3 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Panel Líder Merval · Merval:{" "}
          {micro.mervalIndex != null ? fmtNum(micro.mervalIndex, 0) : "\u2014"}{" "}
          {micro.mervalVar != null ? `(${fmtPct(micro.mervalVar)})` : ""}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-2 text-[10px] font-mono uppercase text-success">Top 5 Subas</div>
            <div className="space-y-1">
              {micro.topGainers.map((g) => (
                <div
                  key={g.ticker}
                  className="flex items-center justify-between rounded border border-border/30 bg-muted/10 px-2 py-1 text-xs"
                >
                  <span className="font-mono font-medium">{g.ticker}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">${fmtNum(g.precio)}</span>
                    <span className="font-mono text-success">{fmtPct(g.variacion)}</span>
                  </div>
                </div>
              ))}
              {micro.topGainers.length === 0 && (
                <span className="text-xs text-muted-foreground">Sin datos</span>
              )}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[10px] font-mono uppercase text-danger">Top 5 Bajas</div>
            <div className="space-y-1">
              {micro.topLosers.map((g) => (
                <div
                  key={g.ticker}
                  className="flex items-center justify-between rounded border border-border/30 bg-muted/10 px-2 py-1 text-xs"
                >
                  <span className="font-mono font-medium">{g.ticker}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground">${fmtNum(g.precio)}</span>
                    <span className="font-mono text-danger">{fmtPct(g.variacion)}</span>
                  </div>
                </div>
              ))}
              {micro.topLosers.length === 0 && (
                <span className="text-xs text-muted-foreground">Sin datos</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Lectura combinada */}
      <Card className="border-border/40 bg-background/40/40 p-4">
        <h3 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Lectura Combinada
        </h3>
        <ul className="space-y-1.5">
          {readings.map((r, i) => (
            <li key={i} className="text-xs text-muted-foreground leading-relaxed">
              {r}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
