import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getCierreMercadoDashboard,
  type CierreMercadoData,
  type CierreRow,
  type CierreSimple,
} from "@/lib/cierre-mercado.functions";

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "--";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function fmtPrecio(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "--";
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtFechaCierre(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function Pct({ v, className = "" }: { v: number | null; className?: string }) {
  if (v == null || !Number.isFinite(v))
    return <span className={`font-mono text-muted-foreground ${className}`}>--</span>;
  return (
    <span className={`font-mono ${v >= 0 ? "text-emerald-400" : "text-red-400"} ${className}`}>
      {fmtPct(v)}
    </span>
  );
}

function Sparkline({ data, positivo }: { data: number[]; positivo: boolean }) {
  if (!data || data.length < 2) return <div className="h-8 w-full rounded bg-muted/20" />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const W = 120;
  const H = 32;
  const pts = data
    .map(
      (v, i) =>
        `${((i / (data.length - 1)) * W).toFixed(1)},${(H - ((v - min) / span) * (H - 4) - 2).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={positivo ? "#34d399" : "#fb7185"}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="text-[14px] font-semibold uppercase tracking-[0.08em] text-muted-foreground px-4 py-3 border-b border-border/20">
      {children}
    </h3>
  );
}

//  Fila con sparkline (índices y commodities)

function RowCard({ row }: { row: CierreRow }) {
  const positivo = (row.hoy ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border/30 bg-muted/10 p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground truncate">{row.nombre}</p>
          <p className="text-[11px] font-mono text-muted-foreground">{row.ticker}</p>
        </div>
        <Pct v={row.hoy} className="text-[13px] shrink-0" />
      </div>
      <Sparkline data={row.serie} positivo={positivo} />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-mono font-semibold text-foreground tabular-nums">
          {fmtPrecio(row.precio)}
        </span>
        <div className="flex gap-3 text-[12px]">
          <span className="text-muted-foreground">
            1M <Pct v={row.mes1} />
          </span>
          <span className="text-muted-foreground">
            YTD <Pct v={row.ytd} />
          </span>
        </div>
      </div>
    </div>
  );
}

//  Tabla simple nombre / valor / % variación

function SimpleTable({ rows, showValor = true }: { rows: CierreSimple[]; showValor?: boolean }) {
  return (
    <div className="divide-y divide-border/20">
      {rows.map((r) => (
        <div key={r.ticker} className="flex items-center justify-between gap-2 px-4 py-2">
          <span className="text-[13px] text-foreground truncate">{r.nombre}</span>
          <div className="flex items-baseline gap-3 shrink-0">
            {showValor && (
              <span className="text-[13px] font-mono text-muted-foreground tabular-nums">
                {fmtPrecio(r.valor)}
              </span>
            )}
            <Pct v={r.variacion} className="text-[13px] w-16 text-right" />
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <p className="px-4 py-3 text-[13px] text-muted-foreground">Sin datos disponibles.</p>
      )}
    </div>
  );
}

//  Panel principal

export function CierreMercadoPanel() {
  const getCierreFn = useServerFn(getCierreMercadoDashboard);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["cierre-mercado"],
    queryFn: () => getCierreFn(),
    staleTime: 30 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="p-4 space-y-3">
          <Skeleton className="h-6 w-64 rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </Card>
    );
  }

  if (isError || data == null) {
    return (
      <Card className="border border-border/40 bg-card p-4">
        <p className="text-[14px] font-medium text-amber-400">
          Error al cargar el reporte de cierre de mercado.
        </p>
        <p className="text-[14px] text-muted-foreground mt-1">
          Fuente: Yahoo Finance — intente nuevamente más tarde.
        </p>
      </Card>
    );
  }

  const d = data as CierreMercadoData;

  return (
    <div className="space-y-4">
      {/* 1. Header */}
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-[clamp(1.2rem,2vw,1.5rem)] font-semibold tracking-tight text-foreground">
              Reporte de Cierre · Mercado EE.UU.
            </h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Cierre del {fmtFechaCierre(d.fechaCierre)} · Generado automáticamente al cierre de
              Wall Street
            </p>
          </div>
          <span className="text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded border border-border/30 text-muted-foreground">
            Yahoo Finance · delay 15'
          </span>
        </div>
      </Card>

      {/* 2. Índices de EE.UU. */}
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <SectionTitle>Índices de EE.UU.</SectionTitle>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {d.indices.map((r) => (
            <RowCard key={r.ticker} row={r} />
          ))}
        </div>
      </Card>

      {/* 3. Sectores S&P 500 */}
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <SectionTitle>Sectores S&P 500 — ordenados por performance HOY</SectionTitle>
        <div className="divide-y divide-border/20">
          {d.sectores.map((s, i) => (
            <div key={s.etf} className="flex items-center justify-between gap-2 px-4 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-[11px] font-mono text-muted-foreground w-5">{i + 1}</span>
                <span className="text-[13px] text-foreground truncate">{s.nombre}</span>
                <span className="text-[11px] font-mono text-muted-foreground">{s.etf}</span>
              </div>
              <div className="flex items-baseline gap-4 shrink-0 text-[13px]">
                <Pct v={s.hoy} className="w-16 text-right" />
                <span className="text-muted-foreground hidden sm:inline">
                  1M <Pct v={s.mes1} />
                </span>
                <span className="text-muted-foreground hidden sm:inline">
                  YTD <Pct v={s.ytd} />
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 4. Top Movers S&P 500 */}
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <SectionTitle>Top Movers del día — Ganadores / Perdedores</SectionTitle>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {(
            [
              { label: "Ganadores", rows: d.ganadores, color: "text-emerald-400" },
              { label: "Perdedores", rows: d.perdedores, color: "text-red-400" },
            ] as const
          ).map((g) => (
            <div key={g.label} className="rounded-xl border border-border/30 bg-muted/10 p-3">
              <p className={`text-[12px] font-mono uppercase tracking-wider mb-2 ${g.color}`}>
                {g.label}
              </p>
              <div className="space-y-1.5">
                {g.rows.map((m) => (
                  <div key={m.symbol} className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] font-mono font-medium text-foreground">
                      {m.symbol}
                    </span>
                    <div className="flex items-baseline gap-3">
                      <span className="text-[12px] font-mono text-muted-foreground tabular-nums">
                        {m.price != null ? `$${fmtPrecio(m.price)}` : "--"}
                      </span>
                      <Pct v={m.percentChange} className="text-[13px] w-16 text-right" />
                    </div>
                  </div>
                ))}
                {g.rows.length === 0 && (
                  <p className="text-[13px] text-muted-foreground">Sin datos.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 5. Tasas e Índices */}
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <SectionTitle>Tasas e Índices</SectionTitle>
        <SimpleTable rows={d.tasas} />
      </Card>

      {/* 6. Renta Fija */}
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <SectionTitle>Renta Fija</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-border/20">
          <div>
            <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground px-4 pt-3 pb-1">
              Gobierno
            </p>
            <SimpleTable rows={d.rentaFijaGobierno} />
          </div>
          <div>
            <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground px-4 pt-3 pb-1">
              Corporativo
            </p>
            <SimpleTable rows={d.rentaFijaCorporativo} />
          </div>
        </div>
      </Card>

      {/* 7 + 8. Global */}
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <SectionTitle>Global · Desarrollados / Emergentes</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-border/20">
          <div>
            <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground px-4 pt-3 pb-1">
              Desarrollados
            </p>
            <SimpleTable rows={d.desarrollados} showValor={false} />
          </div>
          <div>
            <p className="text-[12px] font-mono uppercase tracking-wider text-muted-foreground px-4 pt-3 pb-1">
              Emergentes
            </p>
            <SimpleTable rows={d.emergentes} showValor={false} />
          </div>
        </div>
      </Card>

      {/* 9. Commodities */}
      <Card className="border border-border/40 bg-background/80 backdrop-blur-sm">
        <SectionTitle>Commodities</SectionTitle>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {d.commodities.map((r) => (
            <RowCard key={r.ticker} row={r} />
          ))}
        </div>
      </Card>

      {/* 10. Footer */}
      <p className="text-[11px] leading-relaxed text-muted-foreground/70 px-1">
        Información con fines exclusivamente informativos, con demora y sin garantía de exactitud.
        No constituye recomendación de inversión ni oferta de compra o venta de valores. Fuente:
        Yahoo Finance. Reporte correspondiente al cierre del {fmtFechaCierre(d.fechaCierre)}.
      </p>
    </div>
  );
}
