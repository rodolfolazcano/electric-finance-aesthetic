import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ArrowDownRight, ArrowUpRight, Compass, Globe2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  contextoMacroFn,
  cicloEconomicoFn,
  performanceSectorialFn,
} from "@/lib/herramientas/clara.functions";
import { TendenciasMacroPanel } from "@/components/herramientas/TendenciasMacroPanel";
import { MarketNewsPanel } from "@/components/herramientas/MarketNewsPanel";
import { cn } from "@/lib/utils";

function fmtPct(v: number | null | undefined, dec = 1): string {
  if (v == null || !isFinite(v)) return "s/d";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

function dolar(v: { compra: number | null; venta: number | null } | null): string {
  if (!v || (v.compra == null && v.venta == null)) return "s/d";
  const c = v.compra != null ? `$${v.compra.toFixed(2)}` : "—";
  const ve = v.venta != null ? `$${v.venta.toFixed(2)}` : "—";
  return `${c} / ${ve}`;
}

function regimenColor(regimen: string): string {
  if (regimen === "FAVORABLE") return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  if (regimen === "ADVERSO") return "text-red-400 border-red-500/40 bg-red-500/10";
  return "text-amber-400 border-amber-500/40 bg-amber-500/10";
}

function MacroCard() {
  const fn = useServerFn(contextoMacroFn);
  const q = useQuery({
    queryKey: ["clara-macro"],
    queryFn: () => fn(),
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isPending) return <Skeleton className="h-72 w-full" />;
  if (q.isError || !q.data)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No se pudo cargar el contexto macro. Intentá de nuevo.
        </CardContent>
      </Card>
    );

  const d = q.data;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe2 className="h-4 w-4 text-primary" />
          Contexto macro argentino
        </CardTitle>
        <Badge variant="outline" className={cn("font-mono", regimenColor(d.regimen_macro))}>
          {d.regimen_macro}
        </Badge>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
        <Dato
          etiqueta="Riesgo país"
          valor={d.riesgo_pais != null ? `${d.riesgo_pais.toFixed(0)} bps` : "s/d"}
        />
        <Dato
          etiqueta="Inflación mensual"
          valor={d.inflacion_mensual != null ? `${d.inflacion_mensual.toFixed(1)}%` : "s/d"}
        />
        <Dato
          etiqueta="Tasa pasiva BCRA"
          valor={d.tasa_pasiva != null ? `${d.tasa_pasiva.toFixed(1)}% TEM` : "s/d"}
        />
        <Dato
          etiqueta="Tasa real Fisher (anual)"
          valor={
            d.tasa_real_anual_fisher != null ? `${d.tasa_real_anual_fisher.toFixed(1)}%` : "s/d"
          }
        />
        <Dato etiqueta="Dólar oficial" valor={dolar(d.dolar_oficial)} />
        <Dato etiqueta="Dólar blue" valor={dolar(d.dolar_blue)} />
        <Dato etiqueta="Dólar MEP" valor={dolar(d.dolar_mep)} />
        <Dato etiqueta="Dólar CCL" valor={dolar(d.dolar_ccl)} />
        <Dato
          etiqueta="Tasa libre de riesgo local"
          valor={
            d.tasa_libre_riesgo_local != null ? `${d.tasa_libre_riesgo_local.toFixed(2)}%` : "s/d"
          }
        />
      </CardContent>
      {d.senal_regimen.length > 0 && (
        <CardContent className="border-t border-border/60 pt-3">
          <ul className="space-y-1 text-xs text-muted-foreground">
            {d.senal_regimen.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                {s}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{etiqueta}</div>
      <div className="font-mono text-sm font-medium">{valor}</div>
    </div>
  );
}

const ETAPA_ICONO = ["", "🌱", "📈", "🔥", "⚠️", "🛡️", "❄️"];

function CicloBanner() {
  const fn = useServerFn(cicloEconomicoFn);
  const q = useQuery({
    queryKey: ["clara-ciclo"],
    queryFn: () => fn(),
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isPending) return <Skeleton className="h-44 w-full" />;
  if (q.isError || !q.data)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Ciclo económico no disponible en este momento.
        </CardContent>
      </Card>
    );

  const d = q.data;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="h-4 w-4 text-primary" />
          Ciclo económico intermarket
          <span className="font-mono text-xs font-normal text-muted-foreground">
            Pring / Stovall · 6 etapas
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl">{ETAPA_ICONO[d.stage] ?? "•"}</span>
          <div>
            <div className="font-semibold">
              Etapa {d.stage} — {d.label}
            </div>
            <div className="text-xs text-muted-foreground capitalize">{d.categoria}</div>
          </div>
        </div>
        <div className="grid gap-3 text-sm md:grid-cols-3">
          <Lista titulo="Activos favorecidos" items={d.activosFavorecidos} />
          <Lista titulo="Sectores favorecidos" items={d.sectoresFavorecidos} />
          <Lista titulo="Riesgos" items={d.riesgos} />
        </div>
      </CardContent>
    </Card>
  );
}

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/50 p-3">
      <div className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {titulo}
      </div>
      <ul className="space-y-0.5 text-xs">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function PerformanceSectorial() {
  const fn = useServerFn(performanceSectorialFn);
  const q = useQuery({
    queryKey: ["clara-perf-sectorial"],
    queryFn: () => fn({ data: { periodo: "5d" } }),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError || !q.data)
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Performance sectorial no disponible.
        </CardContent>
      </Card>
    );

  const max = Math.max(...q.data.items.map((i) => Math.abs(i.changePercent ?? 0)), 0.01);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4 text-primary" />
          Performance sectorial EE.UU. (5 días)
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={() => void q.refetch()} aria-label="Refrescar">
          <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {q.data.items.map((it) => {
          const v = it.changePercent ?? 0;
          const positivo = v >= 0;
          const ancho = Math.max(4, (Math.abs(v) / max) * 100);
          return (
            <div key={it.etf} className="flex items-center gap-3 text-xs">
              <div className="w-40 shrink-0 truncate text-muted-foreground">{it.sector}</div>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-accent/40">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded",
                    positivo ? "bg-emerald-500/30" : "bg-red-500/30",
                  )}
                  style={{ width: `${ancho}%` }}
                />
              </div>
              <div
                className={cn(
                  "flex w-16 shrink-0 items-center justify-end gap-1 font-mono",
                  positivo ? "text-emerald-400" : "text-red-400",
                )}
              >
                {positivo ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {fmtPct(it.changePercent)}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function ContextoTab() {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Contexto de mercado</h2>
        <p className="text-sm text-muted-foreground">
          Régimen macro argentino, ciclo económico intermarket y rotación sectorial con datos en
          vivo (BCRA, ArgentinaDatos, CriptoYa y Yahoo Finance).
        </p>
      </div>
      <MacroCard />
      <CicloBanner />
      <PerformanceSectorial />
      <TendenciasMacroPanel />
      <MarketNewsPanel />
    </div>
  );
}
