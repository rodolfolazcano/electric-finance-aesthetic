import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Grid3x3, Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getMatrizUniverso,
  type MatrizUniversoResult,
} from "@/lib/herramientas/sectores/matriz-universo.functions";
import {
  getFlatTickerList,
  getIndustriasBySector,
  getUniqueSectores,
  type TickerInfo,
} from "@/lib/herramientas/universos";

type Nivel = "activos" | "industrias" | "sectores";
type Metric = "correlation" | "beta" | "alpha" | "r2";
type Agrupacion = "sector" | "industria" | "plano";

const MAX_ACTIVOS = 40;
const MAX_MIEMBROS_AGREG = 10;
const MAX_FETCH = 60;

const METRIC_LABELS: Record<Metric, string> = {
  correlation: "Correlación",
  beta: "Beta",
  alpha: "Alpha",
  r2: "R²",
};

function heatColor(val: number, metric: Metric): string | undefined {
  if (metric === "correlation") {
    if (val >= 0.7) return `rgba(34,197,94,${0.2 + val * 0.4})`;
    if (val >= 0.4) return `rgba(251,191,36,${0.1 + val * 0.3})`;
    return `rgba(107,114,128,${0.05 + Math.abs(val) * 0.15})`;
  }
  if (metric === "beta") {
    if (val > 1.2) return `rgba(239,68,68,${Math.min((val - 1) * 1.5, 0.3)})`;
    if (val < 0.8) return `rgba(16,185,129,${Math.min((0.8 - val) * 1.5, 0.3)})`;
    return "rgba(107,114,128,0.05)";
  }
  if (metric === "alpha") {
    if (val > 0) return `rgba(16,185,129,${Math.min(val * 5, 0.3)})`;
    if (val < 0) return `rgba(239,68,68,${Math.min(Math.abs(val) * 5, 0.3)})`;
    return undefined;
  }
  if (metric === "r2") return `rgba(59,130,246,${val * 0.4})`;
  return undefined;
}

/** Mismo método que BenchmarksPanel: regresión sobre retornos semanales alineados a la cola */
function computePairwise(x: number[], y: number[], metric: Metric): number {
  const n = Math.min(x.length, y.length);
  if (n < 10) return 0;
  const xs = x.slice(-n);
  const ys = y.slice(-n);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let cov = 0;
  let vx = 0;
  let vy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    cov += dx * dy;
    vx += dx * dx;
    vy += dy * dy;
  }
  if (metric === "correlation") return Math.sqrt(vx * vy) > 0 ? cov / Math.sqrt(vx * vy) : 0;
  const beta = vy > 0 ? cov / vy : 0;
  if (metric === "beta") return beta;
  if (metric === "alpha") return mx - beta * my;
  const r = Math.sqrt(vx * vy) > 0 ? cov / Math.sqrt(vx * vy) : 0;
  return r * r;
}

/** Serie agregada: promedio alineado a la cola de los miembros */
function promedioSeries(series: number[][]): number[] {
  const validas = series.filter((s) => s.length >= 20).slice(0, MAX_MIEMBROS_AGREG);
  if (validas.length === 0) return [];
  const len = Math.min(...validas.map((s) => s.length));
  const out: number[] = [];
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const s of validas) sum += s[s.length - len + i];
    out.push(sum / validas.length);
  }
  return out;
}

interface NodoMatriz {
  key: string;
  label: string;
  sublabel: string;
  grupo: string;
  returns: number[];
}

export function MatrizUniversoPanel({ sectorFilter, cohorteFiltro }: { sectorFilter?: string; cohorteFiltro?: (ticker: string) => string } = {}) {
  const fn = useServerFn(getMatrizUniverso);
  const sectores = useMemo(() => getUniqueSectores(), []);
  const flat = useMemo(() => getFlatTickerList(), []);

  const [nivel, setNivel] = useState<Nivel>("activos");
  const [agrupacion, setAgrupacion] = useState<Agrupacion>("sector");
  const [metric, setMetric] = useState<Metric>("correlation");
  const [sectoresSel, setSectoresSel] = useState<string[]>(
    sectorFilter && sectores.includes(sectorFilter) ? [sectorFilter] : sectores.slice(0, 1),
  );
  const [benchmark, setBenchmark] = useState<string>("SPY");
  const [activado, setActivado] = useState(false);

  const toggleSector = (s: string) =>
    setSectoresSel((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Plan de nodos según nivel/selección
  const plan = useMemo(() => {
    const nodos: NodoMatriz[] = [];
    const tickersNecesarios = new Set<string>();

    if (nivel === "activos") {
      for (const sec of sectoresSel) {
        const activos = flat.filter(
          (t) =>
            t.sector === sec &&
            !/Nombre no encontrado/i.test(t.nombre) &&
            // Cohorte homogénea: nunca mezclar tipo/moneda/mercado en la matriz
            (!cohorteFiltro ||
              cohorteFiltro(t.ticker) === cohorteFiltro(sectorFilter ?? "")) &&
            !nodos.some((n) => n.key === t.ticker),
        );
        for (const a of activos.slice(0, MAX_ACTIVOS)) {
          nodos.push({
            key: a.ticker,
            label: a.ticker,
            sublabel: a.nombre,
            grupo: agrupacion === "industria" ? a.industria : sec,
            returns: [],
          });
          tickersNecesarios.add(a.ticker);
        }
      }
    } else if (nivel === "industrias") {
      for (const sec of sectoresSel) {
        for (const ind of getIndustriasBySector(sec)) {
          const miembros = [
            ...new Map(
              flat
                .filter(
                  (t) =>
                    t.sector === sec &&
                    t.industria === ind &&
                    !/Nombre no encontrado/i.test(t.nombre),
                )
                .map((t) => [t.ticker, t]),
            ).values(),
          ];
          if (miembros.length < 2) continue;
          nodos.push({
            key: `${sec}::${ind}`,
            label: ind,
            sublabel: `${miembros.length} activos`,
            grupo: sec,
            returns: [],
          });
          for (const m of miembros.slice(0, MAX_MIEMBROS_AGREG)) tickersNecesarios.add(m.ticker);
        }
      }
    } else {
      for (const sec of sectoresSel) {
        const miembros = [
          ...new Map(
            flat
              .filter((t) => t.sector === sec && !/Nombre no encontrado/i.test(t.nombre))
              .map((t) => [t.ticker, t]),
          ).values(),
        ];
        if (miembros.length < 2) continue;
        nodos.push({
          key: sec,
          label: sec,
          sublabel: `${miembros.length} activos`,
          grupo: "",
          returns: [],
        });
        for (const m of miembros.slice(0, MAX_MIEMBROS_AGREG)) tickersNecesarios.add(m.ticker);
      }
    }

    return { nodos, lista: [...tickersNecesarios].slice(0, MAX_FETCH) };
  }, [nivel, sectoresSel, agrupacion, flat]);

  const truncado = plan.lista.length >= MAX_FETCH;

  const q = useQuery({
    queryKey: ["matriz-universo", plan.lista.join(",")],
    queryFn: (): Promise<MatrizUniversoResult> => fn({ data: { tickers: plan.lista } }),
    enabled: activado && plan.lista.length >= 2,
    staleTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });

  /** Nodos con series resueltas: individuales (activos) o promediadas (industrias/sectores) */
  const nodosResueltos = useMemo<NodoMatriz[]>(() => {
    if (!q.data?.returns) return [];
    const rets = q.data.returns;
    const infoDe = new Map<string, TickerInfo>();
    for (const t of flat) if (!infoDe.has(t.ticker)) infoDe.set(t.ticker, t);

    return plan.nodos
      .map((n) => {
        if (nivel === "activos") return { ...n, returns: rets[n.key] ?? [] };
        const miembros =
          nivel === "industrias"
            ? [...infoDe.values()]
                .filter(
                  (t) =>
                    t.sector === sectoresSel.find((s) => n.key.startsWith(`${s}::`)) &&
                    `${t.sector}::${t.industria}` === n.key,
                )
                .map((t) => t.ticker)
                .filter((tk) => plan.lista.includes(tk))
            : [...infoDe.values()]
                .filter((t) => t.sector === n.key && plan.lista.includes(t.ticker))
                .map((t) => t.ticker);
        const series = miembros.map((m) => rets[m]).filter((r): r is number[] => !!r);
        return { ...n, returns: promedioSeries(series) };
      })
      .filter((n) => n.returns.length >= 20);
  }, [q.data, plan, nivel, sectoresSel, flat]);

  const benchmarkReturns = q.data?.returns[benchmark] ?? [];

  // Cache de pares por métrica (se reinicia si cambian datos o métrica)
  const pairwiseCache = useMemo(() => new Map<string, number>(), [q.data, metric]);
  const getVal = (a: NodoMatriz, b: NodoMatriz): number => {
    if (a.key === b.key) {
      if (metric === "correlation" || metric === "r2") return 1;
      if (metric === "beta") return 1;
      return 0;
    }
    const ck = `${a.key}:${b.key}`;
    const cached = pairwiseCache.get(ck);
    if (cached != null) return cached;
    const contra = metric === "correlation" ? b.returns : benchmarkReturns;
    const val = computePairwise(a.returns, contra, metric);
    pairwiseCache.set(ck, val);
    return val;
  };

  const fmtVal = (v: number) =>
    metric === "alpha" ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : v.toFixed(2);

  // Separadores visuales por grupo (sector o industria), en orden de aparición
  const gruposVisuales = useMemo(() => {
    if (agrupacion === "plano" || nivel === "sectores") return [];
    const groups: { nombre: string; keys: Set<string> }[] = [];
    for (const n of nodosResueltos) {
      const last = groups[groups.length - 1];
      if (last && last.nombre === n.grupo) last.keys.add(n.key);
      else groups.push({ nombre: n.grupo, keys: new Set([n.key]) });
    }
    return groups.filter((g) => g.nombre);
  }, [nodosResueltos, agrupacion, nivel]);

  const colorGrupo = (g: string) => {
    let h = 0;
    for (let i = 0; i < g.length; i++) h = (h * 31 + g.charCodeAt(i)) % 360;
    return `hsl(${h},70%,55%)`;
  };

  const puedeCalcular = sectoresSel.length > 0 && plan.lista.length >= 2;

  return (
    <div className="space-y-4">
      {/* Controles dinámicos */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground">
              Nivel
            </span>
            {(["activos", "industrias", "sectores"] as Nivel[]).map((nv) => (
              <button
                key={nv}
                onClick={() => setNivel(nv)}
                className={`font-mono text-[11px] px-3 py-1 rounded-md border transition-colors capitalize ${
                  nivel === nv
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {nv}
              </button>
            ))}
            {nivel === "activos" && (
              <>
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground ml-2">
                  Agrupar
                </span>
                {(["sector", "industria", "plano"] as Agrupacion[]).map((ag) => (
                  <button
                    key={ag}
                    onClick={() => setAgrupacion(ag)}
                    className={`font-mono text-[11px] px-3 py-1 rounded-md border transition-colors capitalize ${
                      agrupacion === ag
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ag}
                  </button>
                ))}
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {sectores.map((s) => (
              <button
                key={s}
                onClick={() => toggleSector(s)}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                  sectoresSel.includes(s)
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => setActivado(true)}
              disabled={!puedeCalcular || q.isFetching}
              size="sm"
              className="h-8 text-[11px]"
            >
              {q.isFetching ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}{" "}
              Calcular matriz
            </Button>
            {!activado && (
              <span className="text-[10px] text-muted-foreground">
                {plan.nodos.length} nodos · {plan.lista.length} series a descargar
              </span>
            )}
            {truncado && (
              <span className="text-[10px] text-amber-400">
                Límite de {MAX_FETCH} series alcanzado — seleccioná menos sectores.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {q.isPending && activado && <Skeleton className="h-72 w-full" />}

      {q.isError && (
        <Card>
          <CardContent className="p-4 text-sm text-danger">
            Error: {(q.error as Error)?.message ?? "intente nuevamente"}
          </CardContent>
        </Card>
      )}

      {q.data && nodosResueltos.length >= 2 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-[14px]">
              <Grid3x3 className="h-4 w-4 text-primary" />
              Matriz — {METRIC_LABELS[metric]} · nivel {nivel}
            </CardTitle>
            <p className="text-[13px] text-muted-foreground">
              Retornos semanales 2Y ·{" "}
              {q.data.faltantes.length > 0 && `${q.data.faltantes.length} sin datos · `}
              {nodosResueltos.length} nodos
              {metric === "correlation" ? (
                " · par a par"
              ) : (
                <>
                  {" "}
                  · vs{" "}
                  <select
                    value={benchmark}
                    onChange={(e) => setBenchmark(e.target.value)}
                    className="bg-background border border-border/60 rounded px-1 py-0.5 text-[11px]"
                  >
                    {[...nodosResueltos.map((n) => n.label), ...Object.keys(q.data.returns)]
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .map((tk) => (
                        <option key={tk} value={tk}>
                          {tk}
                        </option>
                      ))}
                  </select>
                </>
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1.5">
                {(["correlation", "beta", "alpha", "r2"] as Metric[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={`font-mono text-[10px] px-2 py-1 rounded-md border transition-colors ${
                      metric === m
                        ? "border-primary/60 bg-primary/10 text-foreground"
                        : "border-border/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {METRIC_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto w-full">
              <table
                className="font-mono text-[11px]"
                style={{ borderCollapse: "collapse", width: "100%" }}
              >
                <thead>
                  <tr className="border-b border-border/30">
                    <th className="px-1 py-0.5 text-left text-[9px] uppercase tracking-wider text-muted-foreground/60 w-14">
                      vs
                    </th>
                    {nodosResueltos.map((n) => (
                      <th
                        key={n.key}
                        className="px-1 py-0.5 text-center text-[9px] font-medium"
                        title={`${n.label} — ${n.sublabel}`}
                      >
                        <div>{n.label}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {nodosResueltos.map((rowNode, ri) => {
                    const sepAntes =
                      ri > 0 &&
                      gruposVisuales.length > 0 &&
                      rowNode.grupo !== nodosResueltos[ri - 1].grupo;
                    return (
                      <tr
                        key={rowNode.key}
                        style={
                          sepAntes
                            ? { borderTop: `2px solid ${colorGrupo(rowNode.grupo)}` }
                            : undefined
                        }
                      >
                        <th className="px-1 py-0.5 text-left align-top">
                          <div className="flex items-center gap-1">
                            {gruposVisuales.length > 0 && (
                              <span
                                className="inline-block h-3 w-1 rounded"
                                style={{ background: colorGrupo(rowNode.grupo) }}
                              />
                            )}
                            <span title={rowNode.sublabel}>{rowNode.label}</span>
                          </div>
                        </th>
                        {nodosResueltos.map((colNode) => {
                          const v = getVal(rowNode, colNode);
                          const diag = rowNode.key === colNode.key;
                          return (
                            <td
                              key={colNode.key}
                              className="px-1 py-0.5 text-center"
                              style={{
                                background: diag ? "transparent" : heatColor(v, metric),
                                opacity: diag ? undefined : 1,
                                fontWeight: diag ? 600 : 400,
                              }}
                              title={`${rowNode.label} vs ${colNode.label}: ${fmtVal(v)}`}
                            >
                              {diag ? "—" : fmtVal(v)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {gruposVisuales.length > 0 && (
              <p className="text-[10px] text-muted-foreground">
                Filas separadas y coloreadas por {nivel === "industrias" ? "sector" : agrupacion}.
              </p>
            )}
            {metric !== "correlation" && (
              <p className="text-[10px] text-muted-foreground">
                Beta/Alpha/R² se calculan de cada nodo contra el benchmark elegido ({benchmark}).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {q.data && nodosResueltos.length < 2 && (
        <Card>
          <CardContent className="p-6 text-[13px] text-muted-foreground">
            Datos insuficientes para este universo (se necesitan al menos 2 nodos con ≥20 semanas de
            historia). Probá otro sector o nivel.
          </CardContent>
        </Card>
      )}

      {!activado && (
        <p className="text-[12px] text-muted-foreground">
          Elegí nivel, sectores y presioná <span className="text-foreground">Calcular matriz</span>.
          En nivel <b>activos</b> cada celda compara activos individuales; en <b>industrias</b> y{" "}
          <b>sectores</b> los valores de sus activos se promedian para comparar grupos entre sí
          (incluyendo industrias de distintos sectores).
        </p>
      )}
    </div>
  );
}
