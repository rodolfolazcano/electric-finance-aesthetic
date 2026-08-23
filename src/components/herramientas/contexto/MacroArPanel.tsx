// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServerFn } from "@tanstack/react-start";
const getMacroMock = createServerFn({ method: "GET" }).handler(async () => {
  return {
    dolarBlue: 1350,
    dolarMEP: 1320,
    dolarCCL: 1340,
    dolarOficial: 980,
    riesgoPais: 1450,
    inflacionMensual: 4.2,
    inflacionYTD: 68.5,
    badlar: 42.5,
    tasaPolitica: 45,
    reservas: 28500,
    baseMonetaria: 12500,
    circulante: 8900,
    tc90d: Array.from({ length: 90 }, (_, i) => 1000 + Math.sin(i/10)*20 + i*0.5),
    fisherReal: 2.3,
    fisherNominal: 45,
    fisherInfl: 42.7,
    warnings: [],
  };
});
function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/80 backdrop-blur-sm px-3 py-2">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="font-mono text-[13px] text-foreground">{value}</div>
    </div>
  );
}
export function MacroArPanel() {
  const fn = useServerFn(getMacroMock);
  const q = useQuery({ queryKey: ["ctx-macro"], queryFn: () => fn(), staleTime: 10 * 60_000, refetchOnWindowFocus: false });
  if (q.isPending) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (q.isError || !q.data) return <div className="p-4 text-[13px] text-muted-foreground">Sin datos macro — fallback</div>;
  const d: any = q.data;
  const spark = d.tc90d?.slice(-30) ?? [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Chip label="Blue" value={`$${d.dolarBlue ?? "--"}`} />
        <Chip label="MEP" value={`$${d.dolarMEP ?? "--"}`} />
        <Chip label="CCL" value={`$${d.dolarCCL ?? "--"}`} />
        <Chip label="Oficial" value={`$${d.dolarOficial ?? "--"}`} />
        <Chip label="Riesgo país" value={`${d.riesgoPais ?? "--"} pb`} />
        <Chip label="Inflación mensual" value={`${d.inflacionMensual ?? "--"}%`} />
        <Chip label="Badlar" value={`${d.badlar ?? "--"}%`} />
        <Chip label="Tasa política" value={`${d.tasaPolitica ?? "--"}%`} />
        <Chip label="Reservas" value={`${d.reservas ?? "--"} M`} />
        <Chip label="Base" value={`${d.baseMonetaria ?? "--"}`} />
        <Chip label="YTD" value={`${d.inflacionYTD ?? "--"}%`} />
        <Chip label="Circulante" value={`${d.circulante ?? "--"}`} />
      </div>
      <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
        <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">TC 90d sparkline</CardTitle></CardHeader>
        <CardContent>
          <svg width="100%" height="40" viewBox="0 0 300 40" className="overflow-visible">
            <polyline fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5" points={spark.map((v: number, i: number) => `${(i/spark.length)*300},${40 - ((v - Math.min(...spark))/(Math.max(...spark)-Math.min(...spark) || 1))*30}`).join(" ")} />
          </svg>
        </CardContent>
      </Card>
      <Card className="border-border/40 bg-background/80 backdrop-blur-sm">
        <CardHeader className="pb-2"><CardTitle className="text-[12px] font-mono">Régimen Fisher (nominal/infl/real exacta)</CardTitle></CardHeader>
        <CardContent className="text-[12px] font-mono">
          Nominal {d.fisherNominal}% − Infl {d.fisherInfl}% → Real {d.fisherReal}% · <span className="text-muted-foreground">Tasa real positiva: sesgo contractivo</span>
        </CardContent>
      </Card>
      {d.warnings?.length > 0 && <div className="text-[11px] text-amber-400">{d.warnings.join(" · ")}</div>}
    </div>
  );
}
