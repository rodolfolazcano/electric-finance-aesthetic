import type { QuoteData } from "@/lib/herramientas/market-data.types";
import { cn } from "@/lib/utils";

export default function PriceCard({ quote }: { quote: QuoteData }) {
  const esPosi = quote.variacionPct >= 0;
  const formatPrecio = (v: number) =>
    new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: quote.moneda,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);

  const formatVol = (v: number | null) =>
    v == null ? "-" : new Intl.NumberFormat("es-AR", { notation: "compact" }).format(v);

  return (
    <div className="space-y-3 p-3 rounded-md bg-background/40 border border-border/60">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-muted-foreground text-xs uppercase tracking-wide font-mono">
            {quote.ticker}
          </p>
          <p className="text-foreground text-3xl font-mono font-semibold">
            {formatPrecio(quote.precio)}
          </p>
        </div>
        <div className={cn("text-right", esPosi ? "text-primary" : "text-[#ff4757]")}>
          <p className="text-lg font-mono font-semibold">
            {esPosi ? "+" : ""}
            {quote.variacionPct.toFixed(2)}%
          </p>
          <p className="text-sm font-mono">
            {esPosi ? "+" : ""}
            {formatPrecio(quote.variacion)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Apertura", value: quote.apertura != null ? formatPrecio(quote.apertura) : "-" },
          { label: "Máximo", value: quote.maximo != null ? formatPrecio(quote.maximo) : "-" },
          { label: "Mínimo", value: quote.minimo != null ? formatPrecio(quote.minimo) : "-" },
          { label: "Volumen", value: formatVol(quote.volumen) },
        ].map(({ label, value }) => (
          <div key={label} className="space-y-1">
            <p className="text-muted-foreground/40 text-xs uppercase tracking-wide">{label}</p>
            <p className="text-foreground text-sm font-mono">{value}</p>
          </div>
        ))}
      </div>

      <p className="text-muted-foreground/40 text-xs font-mono">
        {new Date(quote.fechaHora).toLocaleString("es-AR", {
          timeZone: "America/Argentina/Buenos_Aires",
          dateStyle: "short",
          timeStyle: "short",
        })}
        {" \u00B7 "}
        {quote.source === "yahoo" ? "Yahoo Finance" : "InvertirOnline"}
        {" \u00B7 "}
        {quote.moneda}
      </p>
    </div>
  );
}
