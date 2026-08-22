import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getYahooQuoteServer } from "@/lib/market-data.functions";
import { getArgentinaContext } from "@/lib/argentina-context.functions";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CnvDisclaimer } from "@/components/shared/CnvDisclaimer";

interface GlobalTicker { symbol: string; label: string }
const GLOBAL_TICKERS: GlobalTicker[] = [
  { symbol: "^SPX", label: "S&P 500" },
  { symbol: "^IXIC", label: "NASDAQ" },
  { symbol: "^VIX", label: "VIX" },
];

function formatPrice(price: number | null | undefined, currency: "ARS" | "USD"): string {
  if (price == null) return "—";
  const prefix = currency === "ARS" ? "$" : "US$";
  return prefix + price.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompact(num: number | null | undefined): string {
  if (num == null) return "—";
  const abs = Math.abs(num);
  if (abs >= 1e9) return `${(num / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(num / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(num / 1e3).toFixed(1)}K`;
  return num.toFixed(2);
}

function ChangeBadge({
  value,
  invertColors = false,
}: {
  value: number | null | undefined;
  invertColors?: boolean;
}) {
  if (value == null) return null;
  const isUp = value > 0;
  const isNeutral = Math.abs(value) < 0.005;
  if (isNeutral) {
    return (
      <span className="inline-flex items-center gap-0.5 font-mono text-[10px] text-muted-foreground" title="vs. cierre anterior">
        <Minus className="h-2.5 w-2.5" />
        0.00%
      </span>
    );
  }
  const green = !invertColors;
  const color = isUp
    ? green
      ? "text-success"
      : "text-danger"
    : green
      ? "text-danger"
      : "text-success";
  const Icon = isUp ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] ${color}`} title="vs. cierre anterior">
      <Icon className="h-2.5 w-2.5" />
      {isUp ? "+" : ""}
      {value.toFixed(2)}%
    </span>
  );
}

function TickerRow({
  symbol,
  data,
  isLoading,
  isError,
  currency = "USD",
}: {
  symbol: string;
  data: { precio?: number; variacionPct?: number; moneda?: "ARS" | "USD" } | undefined;
  isLoading: boolean;
  isError: boolean;
  currency?: "ARS" | "USD";
}) {
  const precioStr = data?.precio != null ? formatPrice(data.precio, data.moneda ?? currency) : "";
  const varStr = data?.variacionPct != null ? `${data.variacionPct > 0 ? "+" : ""}${data.variacionPct.toFixed(2)}%` : "";
  return (
    <div
      data-ai-label={symbol} data-ai-value={`${precioStr} ${varStr}`} data-ai-section="Mercados Globales" data-ai-click
      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 backdrop-blur-md"
    >
      <span className="font-mono text-[11px] font-semibold text-foreground">{symbol}</span>
      <div className="flex items-center gap-2">
        {isLoading ? (
          <span className="font-mono text-[10px] text-muted-foreground/40">cargando...</span>
        ) : isError || !data ? (
          <span className="font-mono text-[10px] text-muted-foreground/30">sin datos</span>
        ) : (
          <>
            <span className="font-mono text-xs text-foreground/90">{precioStr}</span>
            <div className="w-[70px] text-right">
              <ChangeBadge value={data.variacionPct} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  change,
  invertColors = false,
}: {
  label: string;
  value: string;
  change?: { value: number; unit?: string } | null;
  invertColors?: boolean;
}) {
  const showBadge = change != null && change.value !== 0;
  if (!showBadge) {
    return (
      <div data-ai-label={label} data-ai-value={value} data-ai-section="Contexto Argentino" data-ai-click
        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 backdrop-blur-md"
      >
        <span className="font-mono text-[11px] font-semibold text-foreground">{label}</span>
        <span className="font-mono text-xs text-foreground/90">{value}</span>
      </div>
    );
  }

  const isUp = change.value > 0;
  const green = !invertColors;
  const color = isUp
    ? green
      ? "text-success"
      : "text-danger"
    : green
      ? "text-danger"
      : "text-success";
  const Icon = isUp ? TrendingUp : TrendingDown;
  const absStr = Math.abs(change.value).toLocaleString("es-AR", {
    maximumFractionDigits: 0,
  });

  return (
    <div data-ai-label={label} data-ai-value={`${value} ${isUp ? "+" : "-"}${absStr}${change.unit ?? ""}`} data-ai-section="Contexto Argentino" data-ai-click
      className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 backdrop-blur-md"
    >
      <span className="font-mono text-[11px] font-semibold text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs text-foreground/90">{value}</span>
        <span className={`inline-flex items-center gap-0.5 font-mono text-[10px] ${color}`}>
          <Icon className="h-2.5 w-2.5" />
          {isUp ? "+" : "-"}
          {absStr}
          {change.unit ?? ""}
        </span>
      </div>
    </div>
  );
}

function CompactCell({
  label,
  value,
  change,
  invertColors = false,
  subtitle,
}: {
  label: string;
  value: string;
  change?: { value: number; unit?: string } | null;
  invertColors?: boolean;
  subtitle?: string;
}) {
  const showBadge = change != null && change.value !== 0;
  const isUp = change?.value ? change.value > 0 : false;
  const green = !invertColors;
  const chgColor = showBadge
    ? isUp
      ? green
        ? "text-success"
        : "text-danger"
      : green
        ? "text-danger"
        : "text-success"
    : "";
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 backdrop-blur-md">
      <span className="font-mono text-[8px] uppercase tracking-wider text-muted-foreground/50">{label}</span>
      <div className="flex items-center gap-1">
        <span className="font-mono text-[11px] font-medium text-foreground/90">{value}</span>
        {showBadge && (
          <span className={`font-mono text-[8px] ${chgColor}`}>
            {isUp ? "+" : "-"}{Math.abs(change.value).toLocaleString("es-AR", { maximumFractionDigits: 0 })}{change.unit ?? ""}
          </span>
        )}
      </div>
      {subtitle && <span className="font-mono text-[7px] text-muted-foreground/40">{subtitle}</span>}
    </div>
  );
}

export function LiveMarketsPanel() {
  const yahooFn = useServerFn(getYahooQuoteServer);
  const argentinaFn = useServerFn(getArgentinaContext);

  const spx = useQuery({
    queryKey: ["hero-ticker", "^SPX"],
    queryFn: () => yahooFn({ data: { symbol: "^SPX" } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const ixic = useQuery({
    queryKey: ["hero-ticker", "^IXIC"],
    queryFn: () => yahooFn({ data: { symbol: "^IXIC" } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const vix = useQuery({
    queryKey: ["hero-ticker", "^VIX"],
    queryFn: () => yahooFn({ data: { symbol: "^VIX" } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const merv = useQuery({
    queryKey: ["hero-ticker", "^MERV"],
    queryFn: () => yahooFn({ data: { symbol: "^MERV" } }),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  const argentina = useQuery({
    queryKey: ["argentina-context"],
    queryFn: () => argentinaFn(),
    refetchInterval: 120_000,
    staleTime: 60_000,
    retry: 1,
  });

  const ctx = argentina.data;

  return (
    <div>


      {/* Mercados Globales */}
      <div className="mb-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/40">
          Mercados Globales
        </span>
      </div>
      <div className="space-y-1.5">
        {GLOBAL_TICKERS.map((t) => {
          const q =
            t.symbol === "^SPX" ? spx : t.symbol === "^IXIC" ? ixic : vix;
          return (
            <TickerRow
              key={t.symbol}
              symbol={t.label}
              data={q.data ? { ...q.data, moneda: "ARS" } : undefined}
              isLoading={q.isLoading}
              isError={q.isError}
            />
          );
        })}
      </div>

      {/* Divider */}
      <div className="my-3 border-t border-white/10" />

      {/* Contexto Argentino */}
      <div className="mb-2">
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/40">
          Contexto Argentino
        </span>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 backdrop-blur-md">
          <span className="font-mono text-[11px] font-semibold text-foreground">MERV</span>
          <div className="flex items-center gap-2">
            {merv.isLoading ? (
              <span className="font-mono text-[10px] text-muted-foreground/40">cargando...</span>
            ) : merv.isError || !merv.data?.precio ? (
              <span className="font-mono text-[10px] text-muted-foreground/30">sin datos</span>
            ) : (
              <>
                <span className="font-mono text-xs text-foreground/90">
                  {merv.data.precio.toLocaleString("es-AR", { maximumFractionDigits: 0 })} pts
                </span>
                <div className="w-[70px] text-right">
                  <ChangeBadge value={merv.data.variacionPct} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Compact grid 3×2 */}
        <div className="grid grid-cols-3 gap-1.5">
          <CompactCell
            label="R.País"
            value={ctx?.riesgoPais?.valor != null ? `${ctx.riesgoPais.valor.toLocaleString("es-AR")} pts` : argentina.isLoading ? "..." : "—"}
            change={ctx?.riesgoPais?.variacion ? { value: ctx.riesgoPais.variacion, unit: " pts" } : null}
            invertColors
          />
          <CompactCell
            label="Brecha CCL vs. Oficial"
            value={ctx?.brechaCCLPct != null ? `${ctx.brechaCCLPct.toFixed(1)}%` : argentina.isLoading ? "..." : "—"}
          />
          <CompactCell
            label="Reservas"
            value={ctx?.reservas?.nivel != null ? `US$${ctx.reservas.nivel.toLocaleString("es-AR", { maximumFractionDigits: 0 })} M` : argentina.isLoading ? "..." : "—"}
            change={ctx?.reservas?.variacionDiaria ? { value: Math.round(ctx.reservas.variacionDiaria), unit: " M" } : null}
          />
          <CompactCell
            label="Inflación"
            value={ctx?.inflacionMensual?.valor != null ? `${ctx.inflacionMensual.valor.toFixed(1)}%` : argentina.isLoading ? "..." : "—"}
            subtitle={ctx?.inflacionMensual?.fecha && ctx?.inflacionInteranual?.valor != null ? `(${ctx.inflacionMensual.fecha.slice(0, 7)}) · ${ctx.inflacionInteranual.valor.toFixed(1)}% interanual` : undefined}
          />
          <CompactCell
            label="UVA"
            value={ctx?.uva?.valor != null ? `$${ctx.uva.valor.toLocaleString("es-AR", { minimumFractionDigits: 2 })}` : argentina.isLoading ? "..." : "—"}
            subtitle={ctx?.uva?.fecha ? ctx.uva.fecha : undefined}
          />
          <CompactCell
            label="Tasa PF"
            value={ctx?.tasaPF?.tna30d != null ? `${(ctx.tasaPF.tna30d * 100).toFixed(1)}%` : argentina.isLoading ? "..." : "—"}
            subtitle="promedio mercado · TNA 30d"
          />
        </div>

        {/* Dólar rates bar */}
        <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 backdrop-blur-md">
          <span className="shrink-0 font-mono text-[8px] uppercase tracking-wider text-muted-foreground/50">Dólar</span>
          <span className="h-3 w-px bg-white/10" />
          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
            {ctx?.dolarOficial?.venta && ctx?.dolarOficial?.compra && (
              <span className="font-mono text-[10px] text-foreground/80" title={`Compra $${ctx.dolarOficial.compra} · Venta $${ctx.dolarOficial.venta}`}>
                OF <span className="text-muted-foreground/60">$</span>{ctx.dolarOficial.compra.toLocaleString("es-AR", { maximumFractionDigits: 0 })}/{ctx.dolarOficial.venta.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </span>
            )}
            {ctx?.dolarBlue?.venta && ctx?.dolarBlue?.compra && (
              <span className="font-mono text-[10px] text-foreground/80" title={`Compra $${ctx.dolarBlue.compra} · Venta $${ctx.dolarBlue.venta}`}>
                BL <span className="text-muted-foreground/60">$</span>{ctx.dolarBlue.compra.toLocaleString("es-AR", { maximumFractionDigits: 0 })}/{ctx.dolarBlue.venta.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </span>
            )}
            {ctx?.dolarMEP?.venta && ctx?.dolarMEP?.compra && (
              <span className="font-mono text-[10px] text-foreground/80" title={`Compra $${ctx.dolarMEP.compra} · Venta $${ctx.dolarMEP.venta}`}>
                MEP <span className="text-muted-foreground/60">$</span>{ctx.dolarMEP.compra.toLocaleString("es-AR", { maximumFractionDigits: 0 })}/{ctx.dolarMEP.venta.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </span>
            )}
            {ctx?.dolarCCL?.venta && ctx?.dolarCCL?.compra && (
              <span className="font-mono text-[10px] text-foreground/80" title={`Compra $${ctx.dolarCCL.compra} · Venta $${ctx.dolarCCL.venta}`}>
                CCL <span className="text-muted-foreground/60">$</span>{ctx.dolarCCL.compra.toLocaleString("es-AR", { maximumFractionDigits: 0 })}/{ctx.dolarCCL.venta.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Timestamp */}
      {ctx?.generatedAt && (
        <div className="mt-3 text-right font-mono text-[9px] text-muted-foreground/30">
          {new Date(ctx.generatedAt).toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}
      <div className="mt-2 text-center">
        <CnvDisclaimer />
      </div>
    </div>
  );
}
