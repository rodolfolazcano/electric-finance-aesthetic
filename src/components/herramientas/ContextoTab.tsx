import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Activity, ArrowDownRight, ArrowUpRight, Compass, Globe2, RefreshCw, DollarSign, TrendingUp, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
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

  if (q.isPending) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (q.isError || !q.data)
    return (
      <div className="glass rounded-2xl p-6 text-[15px] text-muted-foreground">
        No se pudo cargar el contexto macro. Intentá de nuevo.
      </div>
    );

  const d = q.data;
  return (
    <div className="glass overflow-hidden rounded-2xl w-full">
      <div className="flex flex-row items-center justify-between pb-3 border-b border-border/20 px-6 pt-6">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold">
          <Globe2 className="h-5 w-5 text-primary" />
          Contexto macro argentino
        </h3>
        <Badge variant="outline" className={cn("font-mono text-[15px] px-2.5 py-1", regimenColor(d.regimen_macro))}>
          {d.regimen_macro}
        </Badge>
      </div>
      <div className="grid w-full grid-cols-2 gap-4 md:grid-cols-3 p-6 w-full">
        <Dato etiqueta="Riesgo país" valor={d.riesgo_pais != null ? `${d.riesgo_pais.toFixed(0)} bps` : "s/d"} />
        <Dato etiqueta="Inflación mensual" valor={d.inflacion_mensual != null ? `${d.inflacion_mensual.toFixed(1)}%` : "s/d"} />
        <Dato etiqueta="Tasa pasiva BCRA" valor={d.tasa_pasiva != null ? `${d.tasa_pasiva.toFixed(1)}% TEM` : "s/d"} />
        <Dato etiqueta="Tasa real Fisher (anual)" valor={d.tasa_real_anual_fisher != null ? `${d.tasa_real_anual_fisher.toFixed(1)}%` : "s/d"} />
        <Dato etiqueta="Dólar oficial" valor={dolar(d.dolar_oficial)} />
        <Dato etiqueta="Dólar blue" valor={dolar(d.dolar_blue)} />
        <Dato etiqueta="Dólar MEP" valor={dolar(d.dolar_mep)} />
        <Dato etiqueta="Dólar CCL" valor={dolar(d.dolar_ccl)} />
        <Dato etiqueta="Tasa libre de riesgo local" valor={d.tasa_libre_riesgo_local != null ? `${d.tasa_libre_riesgo_local.toFixed(2)}%` : "s/d"} />
      </div>
      {d.senal_regimen.length > 0 && (
        <div className="border-t border-border/20 bg-muted/20 pt-3 px-6">
          <ul className="space-y-1.5 text-[15px] text-muted-foreground">
            {d.senal_regimen.map((s, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="border-t border-border/20 bg-muted/10 px-4 py-2.5 flex flex-wrap gap-5 text-[15px] text-muted-foreground">
        <span>Fuentes: <span className="text-foreground">BCRA</span> · <span className="text-foreground">IOL</span> · <span className="text-foreground">ArgentinaDatos</span></span>
        <span className="ml-auto">Actualizado: {new Date().toLocaleString("es-AR")} · Delay 15’</span>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="surface-card rounded-xl p-5 w-full">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{etiqueta}</div>
      <div className="font-mono text-[16px] font-semibold mt-1 tabular-nums">{valor}</div>
    </div>
  );
}

const ETAPA_LABEL = ["", "Inicio", "Expansión", "Auge", "Alerta", "Defensa", "Contracción"];

function CicloBanner() {
  const fn = useServerFn(cicloEconomicoFn);
  const q = useQuery({
    queryKey: ["clara-ciclo"],
    queryFn: () => fn(),
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (q.isPending) return <Skeleton className="h-44 w-full rounded-2xl" />;
  if (q.isError || !q.data)
    return (
      <div className="glass rounded-2xl p-6 text-[15px] text-muted-foreground">
        Ciclo económico no disponible en este momento.
      </div>
    );

  const d = q.data;
  return (
    <div className="glass overflow-hidden rounded-2xl w-full">
      <div className="pb-3 border-b border-border/20 px-6 pt-6">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold">
          <Compass className="h-5 w-5 text-primary" />
          Ciclo económico intermarket
          <span className="font-mono text-[14px] font-normal text-muted-foreground">
            Pring / Stovall · 6 etapas
          </span>
        </h3>
      </div>
      <div className="space-y-6 p-6">
        <div className="flex items-baseline gap-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-[15px] font-bold text-primary">{d.stage}</span>
          <div>
            <div className="font-semibold text-[17px]">
              Etapa {d.stage} — {d.label}
            </div>
            <div className="text-[13px] text-muted-foreground capitalize">{d.categoria} · {ETAPA_LABEL[d.stage] ?? ""}</div>
          </div>
        </div>
        <div className="grid w-full gap-4 text-[15px] md:grid-cols-3 w-full">
          <Lista titulo="Activos favorecidos" items={d.activosFavorecidos} />
          <Lista titulo="Sectores favorecidos" items={d.sectoresFavorecidos} />
          <Lista titulo="Riesgos" items={d.riesgos} />
        </div>
      </div>
      <div className="border-t border-border/20 bg-muted/10 px-4 py-2.5 text-[15px] text-muted-foreground">
        Fuente: <span className="text-foreground">Intermarket · Pring</span> · Metodología Stovall
      </div>
    </div>
  );
}

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div className="surface-card rounded-xl p-5 w-full">
      <div className="mb-2 eyebrow !text-muted-foreground !tracking-[0.14em]">
        {titulo}
      </div>
      <ul className="space-y-1 text-[15px] leading-relaxed">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2"><span className="text-primary">•</span>{it}</li>
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

  if (q.isPending) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (q.isError || !q.data)
    return (
      <div className="glass rounded-2xl p-6 text-[15px] text-muted-foreground">
        Performance sectorial no disponible.
      </div>
    );

  const max = Math.max(...q.data.items.map((i) => Math.abs(i.changePercent ?? 0)), 0.01);
  return (
    <div className="glass overflow-hidden rounded-2xl w-full">
      <div className="flex flex-row items-center justify-between pb-3 border-b border-border/20 px-6 pt-6">
        <h3 className="flex items-center gap-2 text-[16px] font-semibold">
          <Activity className="h-5 w-5 text-primary" />
          Performance sectorial EE.UU. (5 días)
        </h3>
        <Button variant="ghost" size="icon" onClick={() => void q.refetch()} aria-label="Refrescar">
          <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
        </Button>
      </div>
      <div className="space-y-2.5 p-6 w-full">
        {q.data.items.map((it) => {
          const v = it.changePercent ?? 0;
          const positivo = v >= 0;
          const ancho = Math.max(6, (Math.abs(v) / max) * 100);
          return (
            <div key={it.etf} className="flex items-center gap-4 text-[15px]">
              <div className="w-44 shrink-0 truncate text-muted-foreground text-[14px]">{it.sector}</div>
              <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted/30">
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded",
                    positivo ? "bg-emerald-500/30" : "bg-red-500/30",
                  )}
                  style={{ width: `${ancho}%` }}
                />
              </div>
              <div className={cn("flex w-24 shrink-0 items-center justify-end gap-1 font-mono text-[14px]", positivo ? "text-emerald-400" : "text-red-400")}>
                {positivo ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {fmtPct(it.changePercent)}
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border/20 bg-muted/10 px-4 py-2.5 text-[15px] text-muted-foreground">
        Fuente: <span className="text-foreground">Yahoo Finance</span> · ETFs SPDR XLB/XLE/XLF/XLI/XLK/XLP/XLU · 5 días
      </div>
    </div>
  );
}

function DivisasTasasPanel() {
  const fn = useServerFn(contextoMacroFn);
  const q = useQuery({ queryKey: ["clara-macro-divisas"], queryFn: () => fn(), staleTime: 15 * 60_000 });
  if (q.isPending) return <Skeleton className="h-64 w-full rounded-2xl" />;
  if (q.isError || !q.data) return <div className="glass rounded-2xl p-6 text-[15px] text-muted-foreground">Divisas no disponibles.</div>;
  const d = q.data;
  const items = [
    { label: "Dólar Oficial", value: dolar(d.dolar_oficial), sub: "BCRA · BYMA" },
    { label: "Dólar Blue", value: dolar(d.dolar_blue), sub: "Ámbito · Informal" },
    { label: "Dólar MEP", value: dolar(d.dolar_mep), sub: "BYMA MEP" },
    { label: "Dólar CCL", value: dolar(d.dolar_ccl), sub: "BYMA CCL" },
    { label: "Tasa Pasiva", value: d.tasa_pasiva != null ? `${d.tasa_pasiva.toFixed(2)}% TEM` : "s/d", sub: "BCRA" },
    { label: "Tasa Real Fisher", value: d.tasa_real_anual_fisher != null ? `${d.tasa_real_anual_fisher.toFixed(1)}%` : "s/d", sub: "Fisher anual" },
    { label: "Riesgo País", value: d.riesgo_pais != null ? `${d.riesgo_pais.toFixed(0)} bps` : "s/d", sub: "EMBI" },
    { label: "Tasa Libre Riesgo", value: d.tasa_libre_riesgo_local != null ? `${d.tasa_libre_riesgo_local.toFixed(2)}%` : "s/d", sub: "Local" },
  ];
  return (
    <div className="grid w-full gap-4 md:grid-cols-2 lg:grid-cols-4 w-full">
      {items.map((it) => (
        <div key={it.label} className="glass overflow-hidden rounded-2xl w-full flex flex-col">
          <div className="p-6 flex-1">
            <div className="eyebrow !tracking-[0.14em] !text-muted-foreground flex items-center gap-1.5"><DollarSign className="h-4 w-4 text-primary" />{it.label}</div>
            <div className="font-mono text-[17px] font-semibold mt-2 tabular-nums">{it.value}</div>
            <div className="text-[13px] text-muted-foreground mt-1">{it.sub}</div>
          </div>
          <div className="border-t border-border/20 bg-muted/10 px-4 py-1.5 text-[13px] text-muted-foreground">Fuente: {it.sub}</div>
        </div>
      ))}
    </div>
  );
}

export function ContextoTab() {
  return (
    <div className="space-y-8 w-full">
      <div>
        <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-tight tracking-tight">Contexto de mercado</h2>
        <p className="text-[17px] leading-relaxed text-muted-foreground mt-1 lg:text-[19px]">
          Régimen macro argentino, ciclo intermarket y rotación sectorial — <span className="text-foreground">Fuentes: BCRA · IOL · Yahoo Finance · ArgentinaDatos · CriptoYa · Delay 15-20’</span>
        </p>
        <div aria-hidden className="electric-line mt-6 max-w-3xl" />
      </div>

      <Tabs defaultValue="tendencias" className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1 bg-muted/20 rounded-lg w-full justify-start">
          <TabsTrigger value="tendencias" className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><TrendingUp className="h-4 w-4 mr-1.5" />Tendencias</TabsTrigger>
          <TabsTrigger value="performance" className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary"><BarChart3 className="h-4 w-4 mr-1.5" />Sectores</TabsTrigger>
          <TabsTrigger value="noticias" className="text-[14px] px-4 py-2 rounded-md data-[state=active]:bg-primary/10 data-[state=active]:text-primary">Noticias</TabsTrigger>
        </TabsList>

        <TabsContent value="tendencias" className="mt-4 w-full">
          <TendenciasMacroPanel />
        </TabsContent>

        <TabsContent value="performance" className="mt-4 w-full">
          <PerformanceSectorial />
        </TabsContent>

        <TabsContent value="noticias" className="mt-4 w-full">
          <MarketNewsPanel />
        </TabsContent>
      </Tabs>

      <div className="glass rounded-2xl border border-dashed p-6 text-[15px] leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Fuentes y metodología:</span> BCRA (tasa pasiva, FX oficial), IOL (MEP/CCL, caución), Yahoo Finance (ETFs SPDR, performance 5d), ArgentinaDatos/CriptoYa (blue, riesgo país). Delay 15-20’. No constituye recomendación de inversión. <span className="text-foreground">Verificar en cada fuente.</span>
      </div>
    </div>
  );
}
