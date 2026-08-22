import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { generarSenalesCedear } from "@/lib/senales-cedear.functions";
import { useState } from "react";

type Filtro = "liquidos" | "noticias" | "movers" | "todos";

function badgeSenal(s: string) {
  if (s === "COMPRA") return "bg-emerald-950/40 text-emerald-400 border-emerald-800/40";
  if (s === "VENTA") return "bg-red-950/40 text-red-400 border-red-800/40";
  if (s === "MANTENER") return "bg-amber-950/40 text-amber-400 border-amber-800/40";
  return "bg-muted/20 text-muted-foreground border-border/30";
}

export function SenalesCedearPanel() {
  const fn = useServerFn(generarSenalesCedear);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["senales-cedear", filtro],
    queryFn: () => fn({ data: { filtro, topN: 6 } }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  return (
    <Card className="border border-border/40 bg-background/40/80 backdrop-blur-sm">
      <div className="px-4 py-3 border-b border-border/20 flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Señales CEDEARs / Acciones BCBA — Chat lateral (siempre activo)
        </h3>
        <div className="flex gap-1">
          {(["todos", "liquidos", "noticias", "movers"] as Filtro[]).map((f) => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`text-[10px] font-mono px-2 py-1 rounded border capitalize ${filtro === f ? "bg-primary text-primary-foreground border-primary" : "border-border/30 text-muted-foreground hover:bg-muted/20"}`}
            >
              {f}
            </button>
          ))}
          <button onClick={() => refetch()} className="text-[10px] font-mono px-2 py-1 rounded border border-border/30 text-muted-foreground hover:bg-muted/20">
            {isFetching ? "..." : "↻"}
          </button>
        </div>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : isError || !data ? (
          <p className="text-[12px] text-amber-400">Error al cargar señales. Reintentá.</p>
        ) : (
          <>
            <p className="text-[10px] font-mono text-muted-foreground mb-3">
              Criterio: {data.criterio} · {new Date(data.generadoEn).toLocaleString("es-AR")} · Fuente: yfinance + screeners + noticias
            </p>
            <div className="space-y-2">
              {data.senales.map((s) => (
                <div key={s.tickerBCBA + s.tickerUS} className="rounded-lg border border-border/30 bg-background/40 p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-mono font-semibold text-foreground">{s.tickerBCBA}</span>
                      <span className="ml-2 text-[11px] text-muted-foreground">→ {s.tickerUS} US</span>
                      <span className="ml-2 text-[10px] font-mono text-muted-foreground/70">{s.tipo}</span>
                    </div>
                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${badgeSenal(s.senal)}`}>{s.senal} {s.prob ? `${(s.prob * 100).toFixed(0)}%` : ""}</span>
                  </div>
                  <div className="mt-1 flex gap-3 text-[11px] font-mono">
                    <span className="text-foreground">US {s.precioUS != null ? `$${s.precioUS.toFixed(2)}` : "--"} <span className={s.variacionUS != null && s.variacionUS >= 0 ? "text-emerald-400" : "text-red-400"}>{s.variacionUS != null ? `${s.variacionUS >= 0 ? "+" : ""}${s.variacionUS.toFixed(2)}%` : "--"}</span></span>
                    <span className="text-muted-foreground">BCBA {s.precioBCBA != null ? `$${s.precioBCBA.toFixed(2)}` : "--"} {s.variacionBCBA != null ? `${s.variacionBCBA >= 0 ? "+" : ""}${s.variacionBCBA.toFixed(2)}%` : ""}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">{s.motivo}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground/60 mt-3">Información educativa. No es recomendación. Orquestado por chat lateral via <code>generar_senales_cedear</code>.</p>
          </>
        )}
      </div>
    </Card>
  );
}
