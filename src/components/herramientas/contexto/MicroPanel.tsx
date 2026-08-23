// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getMicroLocal } from "@/lib/contexto/micro-local.functions";
function fmtPct(v: number | null | undefined) {
  if (v == null || !isFinite(v)) return "--";
  return (v * 100).toFixed(2) + "%";
}
export function MicroPanel() {
  const fn = useServerFn(getMicroLocal);
  const q = useQuery({
    queryKey: ["ctx-micro"],
    queryFn: () => fn({ data: {} }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  if (q.isPending) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }
  if (q.isError) return <div className="p-4 text-[13px] text-muted-foreground">Error micro — fallback</div>;
  const d: any = q.data;
  if (!d) return <div className="p-4 text-[13px] text-muted-foreground">--</div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
          <CardHeader className="pb-1"><CardTitle className="text-[11px] font-mono uppercase tracking-widest">Spread medio Acciones</CardTitle></CardHeader>
          <CardContent className="font-mono text-[13px]">{fmtPct(d.spreadMedioAcciones)} {d.spreadMedioAcciones != null && d.spreadMedioAcciones > 0.01 && <Badge variant="destructive" className="ml-2 text-[10px]">alerta &gt;1%</Badge>}</CardContent>
        </Card>
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
          <CardHeader className="pb-1"><CardTitle className="text-[11px] font-mono uppercase tracking-widest">Spread medio Cedears</CardTitle></CardHeader>
          <CardContent className="font-mono text-[13px]">{fmtPct(d.spreadMedioCedears)} {d.spreadMedioCedears != null && d.spreadMedioCedears > 0.01 && <Badge variant="destructive" className="ml-2 text-[10px]">alerta</Badge>}</CardContent>
        </Card>
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
          <CardHeader className="pb-1"><CardTitle className="text-[11px] font-mono uppercase tracking-widest">Spread medio ON</CardTitle></CardHeader>
          <CardContent className="font-mono text-[13px]">{fmtPct(d.spreadMedioON)} {d.spreadMedioON != null && d.spreadMedioON > 0.01 && <Badge variant="destructive" className="ml-2 text-[10px]">alerta</Badge>}</CardContent>
        </Card>
      </div>
      <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
        <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Top 5 peores spreads</CardTitle></CardHeader>
        <CardContent>
          {d.topPeoresSpreads?.length ? (
            <table className="w-full text-[11px] font-mono">
              <thead><tr className="text-muted-foreground"><th className="text-left">Ticker</th><th>Panel</th><th className="text-right">Spread</th><th className="text-right">Bid/Ask</th></tr></thead>
              <tbody>
                {d.topPeoresSpreads.map((r: any, i: number) => (
                  <tr key={i} className="border-t border-border/20"><td>{r.ticker}</td><td>{r.panel}</td><td className="text-right">{fmtPct(r.spread)}</td><td className="text-right">{r.bid?.toFixed(2)}/{r.ask?.toFixed(2)}</td></tr>
                ))}
              </tbody>
            </table>
          ) : <div className="text-[12px] text-muted-foreground">-- sin datos (sin token IOL)</div>}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
          <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Kyle λ proxy</CardTitle></CardHeader>
          <CardContent className="text-[12px] font-mono">
            {d.kyleLambdaProxy != null ? d.kyleLambdaProxy.toFixed(4) : "--"}
            <div className="text-[11px] text-muted-foreground mt-1">proxy no calibrado — λ = ½√(Σ0/σ²u) con Σ0=var retornos GGAL 90d</div>
          </CardContent>
        </Card>
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
          <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Caución 7d (r local real)</CardTitle></CardHeader>
          <CardContent className="font-mono text-[13px]">{d.caucionTasa7d != null ? (d.caucionTasa7d*100).toFixed(2)+"%" : "--"}</CardContent>
        </Card>
      </div>
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-400">
        Spread&gt;1% ⇒ evitar operar ese instrumento (microestructura Labadié) — {d.liquidezFlag === "alerta" ? "alerta activa" : "ok"}
      </div>
      {d.warnings?.length > 0 && <div className="text-[11px] text-muted-foreground">{d.warnings.join(" · ")}</div>}
    </div>
  );
}
