// @ts-nocheck
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getOportunidadesOrquestadas } from "@/lib/herramientas/oportunidades-orquestadas.functions";
import sectoresData from "@/lib/herramientas/sectores.json";

const SECTORES = Object.keys(sectoresData).sort().filter((s) => s !== "No disponible");

export function OportunidadesOrquestadasTab({ sectorFilter }: { sectorFilter?: string } = {}) {
  const [sector, setSector] = useState(sectorFilter ?? "");
  const [cohorte, setCohorte] = useState<"BCBA_ARS" | "CEDear_ARS" | "CEDear_USD" | "US_USD" | "">("");
  const fn = useServerFn(getOportunidadesOrquestadas);
  const q = useQuery({
    queryKey: ["oportunidades-orquestadas", sector, cohorte],
    queryFn: () => fn({ data: { sector: sector || undefined, cohorte: cohorte || undefined, topN: 8, maxTickers: 30 } }),
    staleTime: 15 * 60_000,
    // Recarga SIEMPRE al cambiar sector/cohorte (nueva key) o al volver al tab
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  const data: any = q.data;
  const fase1 = data?.fase1;
  const fase2 = data?.fase2;
  const fase3 = data?.fase3;
  const fase4 = data?.fase4;
  const fase5 = data?.fase5;

  return (
    <div className="space-y-6 w-full">
      {/* Header metodológico */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="font-display text-lg font-semibold">Oportunidades — Panel de análisis financiero orquestado</h3>
        <p className="text-[13px] text-muted-foreground mt-1">
          Datos en vivo Yahoo Finance, IOL, BCRA, ArgentinaDatos y CriptoYa. Máx 50 tickers por corrida.
          Flujo: <span className="font-mono">Intermarket (Murphy)</span> → Sectores favorecidos (Pring/Schvarz) → Activos por sector → Cuantitativo vs factor mayor R² (CAPM/Labadie) → Fundamental (Pascale 6D) + Técnico → Oportunidades.
        </p>
        <p className="text-[11px] text-muted-foreground mt-1">Metodologías: Murphy intermarket, Pring 6 etapas, Bustamante 5 pasos, Fowler Newton moneda homogénea, Pascale valuación, Elbaum carteras/Markowitz, Labadie p=1/H & spectral, Dumrauf Fisher exacta.</p>
      </div>

      {/* Controles */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Sector</label>
            <select value={sector} onChange={(e) => { setSector(e.target.value); q.refetch(); }} className="mt-1 w-64 rounded border bg-background px-2 py-1.5 text-[12px]">
              <option value="">Auto (sectores favorecidos por Intermarket)</option>
              {SECTORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Cohorte homogénea</label>
            <select value={cohorte} onChange={(e) => { setCohorte(e.target.value as any); q.refetch(); }} className="mt-1 w-48 rounded border bg-background px-2 py-1.5 text-[12px]">
              <option value="">Auto (más numerosa)</option>
              <option value="BCBA_ARS">BCBA ARS</option>
              <option value="CEDear_ARS">CEDEAR ARS</option>
              <option value="CEDear_USD">CEDEAR USD</option>
              <option value="US_USD">EE.UU. USD</option>
            </select>
          </div>
          <Button onClick={() => q.refetch()} disabled={q.isFetching} size="sm" className="ml-auto">
            {q.isFetching ? "Actualizando..." : "Re-ejecutar (15m cache)"}
          </Button>
        </CardContent>
      </Card>

      {q.isPending && <Skeleton className="h-64 w-full" />}
      {q.isError && (
        <Card>
          <CardContent className="p-6 text-[13px] text-muted-foreground">Error: {(q.error as Error).message}</CardContent>
        </Card>
      )}

      {data && (
        <>
          {/* Fase 1 — Intermarket */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px] flex items-center gap-2">Fase 1 — Contexto de mercado (Intermarket Murphy + BCRA)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12px] leading-relaxed">
              <p className="text-muted-foreground">{fase1?.razonamiento?.slice(0, 600) ?? "Contexto no disponible"}</p>
              <div className="flex flex-wrap gap-2 font-mono text-[11px]">
                <Badge variant="outline">Ciclo Pring: {fase1?.ciclo?.stage ?? "?"} {fase1?.ciclo?.label ?? ""}</Badge>
                <Badge variant="outline">Macro: {fase1?.macro?.regimen_macro ?? "?"} score {fase1?.macro?.score_macro ?? "?"}</Badge>
                <Badge variant="outline">Riesgo país: {fase1?.macro?.riesgo_pais ?? "?"}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Ratios: {fase1?.ratios?.slice(0, 300) ?? "s/d"}</p>
              {/* Orden de ejecución del scoring — jerarquía pt */}
              {data?.pipeline && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-mono">
                  <span className="uppercase tracking-widest text-muted-foreground mr-1">Scoring:</span>
                  {data.pipeline.map((p: any, i: number) => (
                    <span key={i} className={"rounded border px-1.5 py-0.5 " + (p.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-400")}>
                      {p.ok ? "OK" : "X"} {p.fase}
                    </span>
                  ))}
                  {data.regimenMacro === "ADVERSO" && (
                    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-amber-400">Gate macro ADVERSO −0.5</span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fase 2 — Sectores favorecidos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px]">Fase 2 — Sectores favorecidos</CardTitle>
            </CardHeader>
            <CardContent className="text-[12px]">
              <div className="flex flex-wrap gap-2">
                {(fase2?.sectoresFavorecidos ?? []).map((s: string) => (
                  <Badge key={s} className="bg-primary/15 text-primary border-primary/20">
                    {s}
                  </Badge>
                ))}
              </div>
              <p className="text-muted-foreground mt-2 text-[11px]">{fase2?.justificacion ?? "Sin justificación"}</p>
            </CardContent>
          </Card>

          {/* Fase 3 — Despliegue activos */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px]">Fase 3 — Activos desplegados ({data.tickersFiltrados?.length ?? fase3?.tickersDesplegados?.length ?? 0} / máx 50)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-[12px]">
              <p className="text-muted-foreground">Cohorte: {data.cohorte ?? fase2?.sectoresFavorecidos?.join(", ") ?? "auto"} · Universo sectores: {fase3?.totalUniverso ?? "?"}</p>
              <div className="flex flex-wrap gap-1 font-mono text-[11px]">
                {(data.tickersFiltrados ?? fase3?.tickersDesplegados ?? []).slice(0, 50).map((tk: string) => (
                  <span key={tk} className="rounded border bg-background px-1.5 py-0.5">
                    {tk}
                  </span>
                ))}
              </div>
              {Object.entries(data.porSectorFiltrado ?? fase3?.porSector ?? {}).length > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  {Object.entries(data.porSectorFiltrado ?? fase3?.porSector).map(([sec, arr]: any) => (
                    <div key={sec}>
                      <span className="font-semibold">{sec}:</span> {(arr as string[]).slice(0, 8).join(", ")}
                      {(arr as string[]).length > 8 ? ` +${(arr as string[]).length - 8}` : ""}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fase 4 — Cuantitativo vs factor mayor R2 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px]">Fase 4 — Cuantitativo: activo vs factor mayor R² (CAPM/Labadie)</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {fase4?.tickerBestBenchmarks?.length ? (
                <table className="w-full text-[12px]">
                  <thead className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="text-left py-1">Ticker</th>
                      <th className="text-left">Factor (mayor R²)</th>
                      <th className="text-right">R²</th>
                      <th className="text-right">Corr</th>
                      <th className="text-right">Beta</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {fase4.tickerBestBenchmarks.slice(0, 12).map((r: any) => (
                      <tr key={r.ticker} className="border-t border-border/20">
                        <td className="py-1 font-semibold">{r.ticker}</td>
                        <td className="text-muted-foreground">{r.bestBenchmark ?? r.factor ?? r.benchmark ?? "—"}</td>
                        <td className="text-right">{(r.rSquared ?? r.r2 ?? 0).toFixed(3)}</td>
                        <td className="text-right">{(r.correlation ?? 0).toFixed(3)}</td>
                        <td className="text-right">{(r.beta ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  {fase4?.cuantitativoRaw?.error ?? "Cuantitativo en cálculo — se usa fallback CAPM. Los tickers se ordenan luego por R² ponderado con score técnico."}
                </p>
              )}
              {fase4?.industryBestBenchmark && (
                <p className="text-[11px] text-muted-foreground mt-2">
                  Industria mejor factor: <span className="font-semibold">{fase4.industryBestBenchmark.bestBenchmark}</span> R² {fase4.industryBestBenchmark.rSquared?.toFixed(3)} Beta {fase4.industryBestBenchmark.beta?.toFixed(2)}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Fase 5 — Fundamental + Técnico → Oportunidades */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-[13px]">Fase 5 — Oportunidades (Pascale 6D + Técnico, filtradas)</CardTitle>
              <p className="text-[11px] text-muted-foreground">Fundamental gate 5.0 + margen seguridad 50/35/20 + alertas &lt;2 rojas + upside ≥ MOS → Técnico score ≥3.5 y R/R ≥1.1</p>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {fase5?.senales?.length ? (
                <table className="w-full text-[12px]">
                  <thead className="text-[11px] uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="text-left">Ticker</th>
                      <th className="text-left">Señal</th>
                      <th className="text-right">Score</th>
                      <th className="text-right">Upside</th>
                      <th className="text-right">R/R</th>
                      <th className="text-left">Factor R²</th>
                      <th className="text-left">Vía BCBA (equivalente)</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {fase5.senales.map((s: any) => {
                      const r2 = fase4?.tickerBestBenchmarks?.find((t: any) => t.ticker?.toUpperCase() === s.ticker?.toUpperCase())?.rSquared ?? null;
                      return (
                        <tr key={s.ticker} className="border-t border-border/20">
                          <td className="py-1 font-semibold">{s.ticker}</td>
                          <td>
                            <Badge className={s.senal?.includes("COMPRA") ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}>{s.senal}</Badge>
                          </td>
                          <td className="text-right">{s.scoreTotal?.toFixed(1)}</td>
                          <td className="text-right">{s.detalles?.ficha?.margen_seguridad?.upside_pct?.toFixed(1) ?? "—"}%</td>
                          <td className="text-right">{s.tecnica?.rrr?.toFixed(2) ?? "—"}</td>
                          <td className="text-right text-muted-foreground">{r2 != null ? r2.toFixed(3) : "—"}</td>
                          <td className="text-[11px] font-mono">
                            {s.operableBCBA?.ars || s.operableBCBA?.usd ? (
                              <>
                                {s.operableBCBA.ars && (
                                  <span className="mr-1 rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-primary">{s.operableBCBA.ars} (ARS)</span>
                                )}
                                {s.operableBCBA.usd && (
                                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-400">{s.operableBCBA.usd} (USD)</span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted-foreground">cuenta EE.UU.</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-[11px] text-muted-foreground">Sin oportunidades filtradas en esta corrida (fundamental gate o técnico). Ajustar sector/cohorte o re-ejecutar.</p>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">{fase5?.resumen ?? ""}</p>
              {fase4?.rechazados?.length > 0 && (
                <details className="mt-2 text-[11px]">
                  <summary className="cursor-pointer text-muted-foreground">Rechazados fundamental ({fase4.rechazados.length})</summary>
                  <ul className="list-disc pl-4 mt-1">
                    {fase4.rechazados.slice(0, 10).map((r: any) => (
                      <li key={r.ticker}>
                        {r.ticker}: {r.motivo}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
