// @ts-nocheck
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { getOportunidadesDelDia } from "@/lib/oportunidades-dia.functions";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

function fmtNum(n: number | null, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("es-AR", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function fmtPct(n: number | null | undefined, dp = 2): string {
  if (n == null || !Number.isFinite(n)) return "\u2014";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function clasificarMagnitudZ(absZ: number): { label: string; color: string } {
  if (absZ > 2.5)
    return { label: "significativo", color: "border-amber-800/40 bg-amber-950/40 text-amber-400" };
  if (absZ > 1.5)
    return { label: "moderado", color: "border-amber-800/20 bg-amber-950/20 text-amber-300" };
  if (absZ > 1)
    return { label: "leve", color: "border-border/40 bg-muted/20 text-muted-foreground" };
  return { label: "normal", color: "border-border/30 bg-muted/10 text-muted-foreground" };
}

function magnitudeBadge(absZ: number) {
  const { label, color } = clasificarMagnitudZ(absZ);
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[13px] font-mono ${color}`}>{label}</span>
  );
}

function SectorBadge({
  sector,
  favorabilidad,
  regimen,
}: {
  sector: string;
  favorabilidad: "favorecido" | "desfavorecido" | "neutral" | null;
  regimen: string;
}) {
  if (!sector) return <span className="text-[13px] text-muted-foreground">\u2014</span>;

  let color = "border-border/40 bg-muted/20 text-muted-foreground";
  const label = sector;

  if (favorabilidad === "favorecido") {
    color = "border-emerald-800/40 bg-emerald-950/40 text-emerald-400";
  } else if (favorabilidad === "desfavorecido") {
    color = "border-red-800/40 bg-red-950/40 text-red-400";
  }

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`rounded border px-1.5 py-0.5 text-[13px] font-mono ${color}`}>
            {label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-[13px] leading-relaxed">
          {favorabilidad === "favorecido"
            ? `Sector favorecido por régimen actual: ${regimen}`
            : favorabilidad === "desfavorecido"
              ? `Sector desfavorecido por régimen actual: ${regimen}`
              : `Sector neutral para el régimen actual: ${regimen}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function NoticiaBadge({
  noticias,
}: {
  noticias: { scoreNoticias: number; resumenTextual: string } | null;
}) {
  if (!noticias) return <span className="text-[13px] text-muted-foreground">\u2014</span>;

  const icono = noticias.scoreNoticias > 0.2 ? "" : noticias.scoreNoticias < -0.2 ? "" : "";
  const color =
    noticias.scoreNoticias > 0.2
      ? "border-emerald-800/40 bg-emerald-950/40 text-emerald-400"
      : noticias.scoreNoticias < -0.2
        ? "border-red-800/40 bg-red-950/40 text-red-400"
        : "border-border/40 bg-muted/20 text-muted-foreground";

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`rounded border px-1.5 py-0.5 text-[13px] font-mono cursor-help ${color}`}
          >
            {icono} {noticias.scoreNoticias.toFixed(1)}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[250px] text-[13px] leading-relaxed">
          {noticias.resumenTextual}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SpeculativoBadge() {
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="rounded border border-orange-800/40 bg-orange-950/40 px-1.5 py-0.5 text-[13px] font-mono text-orange-400">
            {""} Especulativo
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[220px] text-[13px] leading-relaxed">
          La señal técnica no tiene respaldo fundamental (ROE negativo, deuda alta o ingresos
          decrecientes). Evaluar con cautela.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ScoreBar({ score, maxScore }: { score: number; maxScore: number }) {
  const pct = Math.max(0, Math.min(100, ((score + Math.abs(maxScore)) / (maxScore * 2)) * 100));
  const color = score >= 2 ? "bg-emerald-500" : score >= 0 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-12 rounded-full bg-border/30">
        <div className={`h-1 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-[13px] font-mono ${score >= 0 ? "text-emerald-400" : "text-red-400"}`}>
        {score.toFixed(1)}
      </span>
    </div>
  );
}

function ForkRentaFijaBanner({
  activo,
  mensaje,
  confianza,
}: {
  activo: boolean;
  mensaje: string;
  confianza: number;
}) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  if (!activo) return null;

  return (
    <Card className="border border-warning/40 bg-warning/5">
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2 text-[13px] font-mono text-warning">
          <span>{""}</span>
          <span>{mensaje}</span>
          <span className="text-muted-foreground">(confianza {confianza}%)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => navigate({ to: "/herramientas", search: { tab: "renta-fija" } as any })}
            className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-[13px] font-mono text-warning hover:bg-warning/20 transition-colors"
          >
            Ir a Renta Fija
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-muted-foreground hover:text-foreground text-[13px]"
          >
            {collapsed ? "\u25BC" : "\u25B2"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="px-4 pb-3 text-[13px] text-muted-foreground leading-relaxed">
          Las oportunidades de equity se muestran igual pero con confianza reducida. Evalúe su
          perfil de riesgo antes de decidir.
        </div>
      )}
    </Card>
  );
}

export function OportunidadesDiaPanel({ periodo: propPeriodo }: { periodo?: "dia" | "mes" } = {}) {
  const getOportunidades = useServerFn(getOportunidadesDelDia);
  const periodo = propPeriodo ?? "dia";
  const [noticiaExpandida, setNoticiaExpandida] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["oportunidades", periodo],
    queryFn: () => getOportunidades({ data: { periodo } }),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  const resultados = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      items: data.items.slice(0, 15),
    };
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Banner renta fija condicional */}
      {data && (
        <ForkRentaFijaBanner
          activo={data.forkRentaFija.activo}
          mensaje={data.forkRentaFija.mensaje}
          confianza={data.forkRentaFija.confianza}
        />
      )}

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
          <Skeleton className="h-8 w-full rounded-lg" />
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-danger/40 bg-danger/10 p-4 text-sm text-danger">
          Error al cargar activos con movimientos relevantes.
        </div>
      )}

      {resultados && resultados.items.length === 0 && (
        <div className="glass flex min-h-[160px] items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No se detectaron activos con movimientos significativos en esta sesión.
          </p>
        </div>
      )}

      {resultados && resultados.items.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-muted-foreground">
              {resultados.totalAnalizados ?? 0} activos analizados — mostrando{" "}
              {resultados.items.length} con mejor score compuesto
              <span className="ml-2 text-[13px] text-muted-foreground/60">
                (régimen: {resultados.regimenActual})
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border/40">
            <Table className="w-full">
              <TableHeader>
                <TableRow className="border-border/30 text-[13px] uppercase tracking-wider text-muted-foreground">
                  <TableHead className="px-3 py-2">Ticker</TableHead>
                  <TableHead className="px-3 py-2 text-right">Precio</TableHead>
                  <TableHead className="px-3 py-2 text-right">Var.</TableHead>
                  <TableHead className="px-3 py-2 text-right">Vol.Rel</TableHead>
                  <TableHead className="px-3 py-2 text-right">Z-Score</TableHead>
                  <TableHead className="px-3 py-2">Magnitud</TableHead>
                  <TableHead className="px-3 py-2">Sector</TableHead>
                  <TableHead className="px-3 py-2 text-right">P/E</TableHead>
                  <TableHead className="px-3 py-2 text-right">FCF Yield</TableHead>
                  <TableHead className="px-3 py-2 text-right">ROE</TableHead>
                  <TableHead className="px-3 py-2 text-right">Upside (analistas)</TableHead>
                  <TableHead className="px-3 py-2 text-right">Score</TableHead>
                  <TableHead className="px-3 py-2">Noticias</TableHead>
                  <TableHead className="px-3 py-2">Contexto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultados.items.map((item) => (
                  <TableRow
                    key={item.ticker}
                    className={`border-border/20 text-xs hover:bg-muted/10 ${item.favorabilidadSector === "desfavorecido" ? "opacity-80" : ""}`}
                  >
                    <TableCell className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium">{item.ticker}</span>
                        {item.esEspeculativo && <SpeculativoBadge />}
                        <span className="text-[12px] text-muted-foreground font-mono">
                          {item.tipo}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono">
                      ${fmtNum(item.precio)}
                    </TableCell>
                    <TableCell
                      className={`px-3 py-2 text-right font-mono ${item.variacion >= 0 ? "text-success" : "text-danger"}`}
                    >
                      {fmtPct(item.variacion)}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono">
                      {item.volumenRelativo.toFixed(1)}x
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono">
                      {item.zscore.toFixed(2)}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      {magnitudeBadge(Math.abs(item.zscore))}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <SectorBadge
                        sector={item.sector}
                        favorabilidad={item.favorabilidadSector}
                        regimen={resultados.regimenActual}
                      />
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {item.pe != null ? fmtNum(item.pe, 1) : "\u2014"}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {item.fcfYield != null ? (item.fcfYield * 100).toFixed(1) + "%" : "\u2014"}
                    </TableCell>
                    <TableCell className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {item.roe != null ? (item.roe * 100).toFixed(1) + "%" : "\u2014"}
                    </TableCell>
                    <TableCell
                      className={`px-3 py-2 text-right font-mono ${item.upsideAnalistas != null && item.upsideAnalistas > 0 ? "text-success" : "text-muted-foreground"}`}
                    >
                      {item.upsideAnalistas != null ? fmtPct(item.upsideAnalistas, 1) : "\u2014"}
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help">
                              <ScoreBar score={item.scoreFinal} maxScore={6} />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent
                            side="left"
                            className="max-w-[220px] text-[13px] font-mono leading-relaxed space-y-1"
                          >
                            <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                              Desglose del score
                            </div>
                            <div className="flex justify-between">
                              <span>Técnico (A):</span>
                              <span
                                className={item.scoreA >= 0 ? "text-emerald-400" : "text-red-400"}
                              >
                                {item.scoreA.toFixed(1)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Sectorial (B):</span>
                              <span
                                className={item.scoreB >= 0 ? "text-emerald-400" : "text-red-400"}
                              >
                                {item.scoreB.toFixed(1)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Fundamental (C):</span>
                              <span
                                className={item.scoreC >= 0 ? "text-emerald-400" : "text-red-400"}
                              >
                                {item.scoreC.toFixed(1)}
                              </span>
                            </div>
                            <div className="flex justify-between border-t border-border/30 pt-1 mt-1">
                              <span className="font-semibold">Total:</span>
                              <span
                                className={
                                  item.scoreFinal >= 0
                                    ? "text-emerald-400 font-semibold"
                                    : "text-red-400 font-semibold"
                                }
                              >
                                {item.scoreFinal.toFixed(1)}
                              </span>
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell className="px-3 py-2">
                      <NoticiaBadge noticias={item.noticias} />
                    </TableCell>
                    <TableCell className="px-3 py-2 max-w-[200px] text-[13px] text-muted-foreground leading-relaxed">
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="cursor-help line-clamp-2">{item.justificacion}</span>
                          </TooltipTrigger>
                          <TooltipContent
                            side="bottom"
                            className="max-w-[300px] text-[13px] leading-relaxed space-y-1"
                          >
                            <div className="text-[13px] uppercase tracking-wider text-muted-foreground">
                              Detalle del score
                            </div>
                            {item.detalleA && (
                              <p>
                                <span className="text-muted-foreground">A (Téc):</span>{" "}
                                {item.detalleA}
                              </p>
                            )}
                            {item.detalleB && (
                              <p>
                                <span className="text-muted-foreground">B (Sect):</span>{" "}
                                {item.detalleB}
                              </p>
                            )}
                            {item.detalleC && (
                              <p>
                                <span className="text-muted-foreground">C (Fund):</span>{" "}
                                {item.detalleC}
                              </p>
                            )}
                            {item.detalleD && (
                              <p>
                                <span className="text-muted-foreground">D (News):</span>{" "}
                                {item.detalleD}
                              </p>
                            )}
                            {item.beta != null && (
                              <p>
                                <span className="text-muted-foreground">
                                  Beta vs {item.benchmarkUsado ?? "SPY"}:
                                </span>{" "}
                                {item.beta.toFixed(2)}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
