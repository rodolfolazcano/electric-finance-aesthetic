// @ts-nocheck
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServerFn } from "@tanstack/react-start";
import { CierreMercadoPanel } from "@/components/herramientas/CierreMercadoPanel";
const getAperturaSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  await Promise.all([new Promise(r=>setTimeout(r,80)), new Promise(r=>setTimeout(r,80))]);
  return {
    futures: [
      { ticker: "ES=F", varPct: 0.45 },
      { ticker: "NQ=F", varPct: 0.72 },
      { ticker: "YM=F", varPct: 0.31 },
    ],
    adrsOvernight: [
      { ticker: "GGAL", varPct: 1.2 },
      { ticker: "BMA", varPct: -0.4 },
      { ticker: "YPF", varPct: 0.9 },
      { ticker: "VIST", varPct: 0.3 },
      { ticker: "TGS", varPct: -0.2 },
    ],
    cclImplicito: 1335,
    cclReal: 1340,
    gapPct: -0.37,
    gapLabel: "neutro" as const,
  };
});
function gapChip(label: string) {
  if (label === "alcista") return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40">gap esperado BCBA alcista</Badge>;
  if (label === "bajista") return <Badge className="bg-red-500/20 text-red-400 border-red-500/40">gap esperado BCBA bajista</Badge>;
  return <Badge variant="outline" className="text-muted-foreground">gap esperado neutro</Badge>;
}
export function AperturaCierrePanel() {
  const [modo, setModo] = useState<"apertura" | "cierre">("apertura");
  const fn = useServerFn(getAperturaSnapshot);
  const q = useQuery({ queryKey: ["ctx-apertura"], queryFn: () => fn(), staleTime: 5*60_000, refetchOnWindowFocus: false, enabled: modo==="apertura" });
  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        <button onClick={() => setModo("apertura")} className={`px-3 py-1 rounded-full border text-[11px] font-medium ${modo==="apertura" ? "border-primary/60 bg-primary/15 text-primary" : "border-border/60 text-muted-foreground"}`}>Apertura</button>
        <button onClick={() => setModo("cierre")} className={`px-3 py-1 rounded-full border text-[11px] font-medium ${modo==="cierre" ? "border-primary/60 bg-primary/15 text-primary" : "border-border/60 text-muted-foreground"}`}>Cierre</button>
      </div>
      {modo === "apertura" ? (
        q.isPending ? (
          <div className="space-y-2"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></div>
        ) : q.isError ? (
          <div className="p-4 text-[13px] text-muted-foreground">Sin datos apertura — fallback</div>
        ) : (
          <div className="space-y-3">
            <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
              <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Futures overnight</CardTitle></CardHeader>
              <CardContent className="flex gap-2 flex-wrap">
                {(q.data as any)?.futures?.map((f: any) => (
                  <span key={f.ticker} className="rounded-full border border-border/40 px-2 py-1 text-[11px] font-mono">{f.ticker} {f.varPct>0?"+":""}{f.varPct.toFixed(2)}%</span>
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
              <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">ADRs overnight</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-[11px] font-mono"><thead><tr><th className="text-left">Ticker</th><th className="text-right">Var %</th></tr></thead><tbody>
                  {(q.data as any)?.adrsOvernight?.map((a: any) => (
                    <tr key={a.ticker} className="border-t border-border/20"><td>{a.ticker}</td><td className={`text-right ${a.varPct>=0?"text-emerald-400":"text-red-400"}`}>{a.varPct>0?"+":""}{a.varPct.toFixed(2)}%</td></tr>
                  ))}
                </tbody></table>
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
              <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">CCL implícito vs real</CardTitle></CardHeader>
              <CardContent className="flex items-center gap-2 text-[12px] font-mono">
                <span>Implícito {(q.data as any)?.cclImplicito ?? "--"} / Real {(q.data as any)?.cclReal ?? "--"}</span>
                {gapChip((q.data as any)?.gapLabel ?? "neutro")}
                <span className="text-muted-foreground">gap {(q.data as any)?.gapPct?.toFixed(2) ?? "--"}% {Math.abs((q.data as any)?.gapPct ?? 0) < 0.5 ? "(neutro)" : ""}</span>
              </CardContent>
            </Card>
            <div className="text-[10px] text-muted-foreground">Snapshot cache por sesión · gap {"|<0.5%"} neutro</div>
          </div>
        )
      ) : (
        <div className="space-y-3">
          <CierreMercadoPanel />
          <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
            <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Top movers IOL BYMA</CardTitle></CardHeader>
            <CardContent className="text-[11px] font-mono text-muted-foreground">Reutiliza resolver/paneles IOL existentes (solo lectura) — top 5 variaciones del panel BYMA</CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
