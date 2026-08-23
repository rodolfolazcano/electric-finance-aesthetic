// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServerFn } from "@tanstack/react-start";
const getIntermarketRegimeMock = createServerFn({ method: "GET" }).handler(async () => {
  await Promise.all(Array.from({ length: 3 }, (_, i) => new Promise(r => setTimeout(r, 50 + i * 10))));
  return {
    stage: "Stage 2 — Avance",
    confianza: 68,
    regimenDolar: "Dólar débil (DXY ↓)",
    regimenTasas: "Tasas bajando (TLT ↑)",
    riesgoActivo: "RIESGO-ON",
    sectoresFavorecidos: [
      { sector: "Tecnología", etf: "XLK", ret20: 3.2 },
      { sector: "Consumo Discrecional", etf: "XLY", ret20: 2.8 },
      { sector: "Industriales", etf: "XLI", ret20: 1.9 },
    ],
    rotacionDetectada: "Rotación hacia crecimiento",
    curvaSpreads: [0.45, 0.32, 0.28],
    dowSignal: "Confirmado alcista",
    ratios: Array.from({ length: 12 }, (_, i) => ({
      nombre: `Ratio ${i+1}`,
      valor: (Math.random()*2).toFixed(2),
      var1m: (Math.random()*4-2).toFixed(2),
      lectura: i%2===0 ? "Alcista" : "Neutral",
      lidera: i%3===0 ? "Acciones" : "Bonos",
      evita: i%4===0 ? "Commodities" : "—",
    })),
    fuentes: ["Yahoo Finance (30 req paralelos)", "BCRA"],
    delay: "15m cache",
  };
});
function confianzaColor(c: number) {
  if (c >= 70) return "text-emerald-400 border-emerald-500/40 bg-emerald-500/10";
  if (c >= 40) return "text-amber-400 border-amber-500/40 bg-amber-500/10";
  return "text-red-400 border-red-500/40 bg-red-500/10";
}
export function IntermarketPanel() {
  const fn = useServerFn(getIntermarketRegimeMock);
  const q = useQuery({ queryKey: ["ctx-intermarket"], queryFn: () => fn(), staleTime: 15 * 60_000, refetchOnWindowFocus: false });
  if (q.isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (q.isError) return <div className="p-4 text-[13px] text-muted-foreground">Sin datos intermarket — fallback nulls</div>;
  const d: any = q.data;
  if (!d) return <div className="p-4 text-[13px] text-muted-foreground">--</div>;
  return (
    <div className="space-y-4">
      {d.confianza < 50 && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-400">Señales mixtas — priorizar confirmación de precios</div>}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-background/80 backdrop-blur-sm p-3">
        <Badge variant="outline" className="font-mono text-[11px]">{d.stage}</Badge>
        <span className="text-[11px]">Bonos ↗ Acciones ↗ Commodities →</span>
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] font-mono ${confianzaColor(d.confianza)}`}>{d.confianza}% confianza</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm"><CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Curva</CardTitle></CardHeader><CardContent className="text-[12px]">{d.curvaSpreads?.join(" / ") ?? "--"} · {d.stage}</CardContent></Card>
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm"><CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Bonds/Stocks</CardTitle></CardHeader><CardContent className="text-[12px]">TLT/SPY 60d corr CLAMPED · {d.regimenTasas}</CardContent></Card>
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm"><CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Dow Theory</CardTitle></CardHeader><CardContent><span className="text-[12px] text-emerald-400">{d.dowSignal}</span></CardContent></Card>
        <Card className="border-border/40 bg-background/80 backdrop-blur-sm"><CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Lead-Lag</CardTitle></CardHeader><CardContent className="text-[11px] font-mono"><table className="w-full"><thead><tr><th>Par</th><th>Lag</th><th>Líder</th></tr></thead><tbody><tr><td>SPY/TLT</td><td>12</td><td>Bonos</td></tr><tr><td>—</td><td>—</td><td>—</td></tr></tbody></table></CardContent></Card>
      </div>
      <Card className="border-border/40 bg-background/80 backdrop-blur-sm"><CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">12 Ratios Murphy</CardTitle></CardHeader><CardContent><div className="overflow-x-auto"><table className="w-full text-[11px] font-mono"><thead><tr><th>Nombre</th><th>Valor</th><th>Var 1m</th><th>Lectura</th><th>Lidera</th><th>Evita</th></tr></thead><tbody>{d.ratios?.map((r: any, i: number) => (<tr key={i} className="border-t border-border/20"><td>{r.nombre}</td><td>{r.valor}</td><td>{r.var1m}%</td><td>{r.lectura}</td><td>{r.lidera}</td><td>{r.evita}</td></tr>))}</tbody></table></div></CardContent></Card>
      <div className="text-[10px] text-muted-foreground">Fuentes: {d.fuentes?.join(", ")} · {d.delay}</div>
    </div>
  );
}
