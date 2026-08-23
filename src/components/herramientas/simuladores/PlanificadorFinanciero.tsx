import { useMemo, useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine, LineChart, Line,
} from "recharts";
import { CHART_TOOLTIP_STYLE, AXIS_TICK } from "@/routes/herramientas/shared/chart-constants";
import { fmtNum } from "@/routes/herramientas/shared/formatters";
import {
  buildPlanFlujo, fisherReal, haberRetiro, mesesHastaMeta, perfilVan, pmtMetaAhorro, temToTea, tirBiseccion, van,
  type PlanModo,
} from "@/lib/simuladores.functions";
import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getSimuladorFuentes } from "@/lib/simuladores-fuentes.functions";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PlanVista = "proyeccion" | "flujo" | "analisis";
type Moneda = "ARS" | "USD";

function formatARS(n: number, moneda: Moneda) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(n);
}

function SectionShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-border/30 bg-muted/15 p-3 sm:p-4 space-y-3">{children}</div>;
}

export function PlanificadorFinanciero() {
  const [modo, setModo] = useState<PlanModo>("meta");
  const [vista, setVista] = useState<PlanVista>("proyeccion");
  const [moneda, setMoneda] = useState<Moneda>("ARS");

  // Comunes — precargadas desde fuentes vivas (promedio mercado)
  const [aporteInicial, setAporteInicial] = useState(500_000);
  const [aporteMensual, setAporteMensual] = useState(80_000);
  const [anticipada, setAnticipada] = useState(false);
  const [tna, setTna] = useState(42);
  const [inflMensual, setInflMensual] = useState<number | null>(null);
  const [conCuotas, setConCuotas] = useState(true);
  const [fuentesHint, setFuentesHint] = useState<string | null>(null);
  const [fuentes, setFuentes] = useState<any>(null);
  const fuentesFn = useServerFn(getSimuladorFuentes);
  useEffect(() => {
    fuentesFn().then((res: any) => {
      setFuentes(res);
      const avgPf = res?.pf?.promedio;
      const avgFci = res?.fciMM?.promedio; // TEA
      // convertir TEA FCI a TNA aprox para el input TNA
      let suggested: number | null = null;
      if (avgFci != null && avgFci > 0 && avgFci < 200) suggested = (Math.pow(1 + avgFci / 100, 1 / 12) - 1) * 12 * 100;
      else if (avgPf != null) suggested = avgPf;
      if (suggested != null && suggested > 0 && suggested < 200) setTna(Math.round(suggested * 10) / 10);
      if (res?.inflacion?.mensual != null) setInflMensual(res.inflacion.mensual);
      if (avgPf != null || avgFci != null) setFuentesHint(`TNA sugerida ${suggested != null ? suggested.toFixed(1) + "%" : "—"} · promedio mercado · ${res?.inflacion?.fuente ?? "ArgentinaDatos"}`);
    }).catch(() => {});
  }, []);

  // Meta
  const [vfObjetivo, setVfObjetivo] = useState(15_000_000);
  const [mesesMeta, setMesesMeta] = useState(36);
  const [modoMeta, setModoMeta] = useState<"pmt" | "fecha">("pmt");

  // Retiro
  const [edadActual, setEdadActual] = useState(32);
  const [edadRetiro, setEdadRetiro] = useState(60);
  const [esperanzaVida, setEsperanzaVida] = useState(85);

  // Flujos VAN/TIR
  const [flujos, setFlujos] = useState<number[]>([-2_000_000, 300_000, 500_000, 700_000, 900_000, 1_200_000]);
  const [tasaDescuento, setTasaDescuento] = useState(18);
  const [liveRates, setLiveRates] = useState<{ caucion7d?: number; lecapProm?: number; fciTEA?: number }>({});
  useEffect(() => {
    fuentesFn().then((res: any) => {
      const avgFci = res?.fciMM?.promedio;
      const avgPf = res?.pf?.promedio;
      const lecapProm = res?.lecap?.promedio;
      const caucion7d = res?.caucion?.opciones?.find((o: any) => /7\s*d/.test(o.detalle ?? ""))?.tna
        ?? res?.caucion?.opciones?.[0]?.tna;
      setLiveRates({
        caucion7d: caucion7d != null ? +caucion7d.toFixed(2) : undefined,
        lecapProm: lecapProm != null ? +lecapProm.toFixed(2) : undefined,
        fciTEA: avgFci != null ? +((Math.pow(1 + avgFci / 100, 1 / 12) - 1) * 12 * 100).toFixed(2) : undefined,
      });
    }).catch(() => {});
  }, []);

  // Extras (aportes extraordinarios)
  const [extras, setExtras] = useState<{ mes: number; monto: number }[]>([]);

  const tea = useMemo(() => {
    // tna mensual compuesta
    const m = 12;
    return (Math.pow(1 + tna / 100 / m, m) - 1) * 100;
  }, [tna]);
  const tem = useMemo(() => (Math.pow(1 + tea / 100, 1 / 12) - 1) * 100, [tea]);
  const realAnual = useMemo(() => inflMensual != null ? fisherReal(tea, inflMensual * 12) : null, [tea, inflMensual]);

  // Cálculos según modo
  const planMeses = modo === "meta" ? mesesMeta : modo === "retiro" ? Math.max(1, (edadRetiro - edadActual) * 12) : flujos.length > 0 ? flujos.length - 1 : 12;
  const pmtEfectivo = conCuotas ? aporteMensual : 0;
  const pmtCalculado = useMemo(() => {
    if (modo !== "meta" || modoMeta !== "pmt") return null;
    return pmtMetaAhorro(vfObjetivo, aporteInicial, planMeses, tem, anticipada);
  }, [modo, modoMeta, vfObjetivo, aporteInicial, planMeses, tem, anticipada]);
  const mesesCalculados = useMemo(() => {
    if (modo !== "meta" || modoMeta !== "fecha") return null;
    return mesesHastaMeta(vfObjetivo, aporteInicial, pmtEfectivo, tem, anticipada);
  }, [modo, modoMeta, vfObjetivo, aporteInicial, pmtEfectivo, tem, anticipada]);

  const flujoPlan = useMemo(() => {
    if (modo === "flujos") return null;
    const pmt = modo === "meta" && modoMeta === "pmt" && pmtCalculado != null ? pmtCalculado : pmtEfectivo;
    return buildPlanFlujo(aporteInicial, pmt, planMeses, tem, anticipada, inflMensual, extras);
  }, [modo, modoMeta, pmtCalculado, pmtEfectivo, aporteInicial, planMeses, tem, anticipada, inflMensual, extras]);

  const retiroHaber = useMemo(() => {
    if (modo !== "retiro" || !flujoPlan) return null;
    const mesesJubilado = Math.max(1, (esperanzaVida - edadRetiro) * 12);
    return Math.round(haberRetiro(flujoPlan.vfNominal, tem, mesesJubilado));
  }, [modo, flujoPlan, tem, esperanzaVida, edadRetiro]);

  // Para gráficos de proyección del plan
  const proyData = useMemo(() => {
    if (!flujoPlan) return [];
    // sparse cada ~ mes si muchos, más detalle si pocos
    const step = flujoPlan.rows.length > 60 ? Math.ceil(flujoPlan.rows.length / 60) : 1;
    return flujoPlan.rows.filter((_, i) => i % step === 0 || i === flujoPlan.rows.length - 1).map((r) => ({
      periodo: r.periodo,
      label: r.periodo === 0 ? "0" : `${r.periodo}m`,
      saldo: r.saldo,
      aportado: (() => {
        let acc = aporteInicial;
        for (let k = 1; k <= r.periodo; k++) acc += flujoPlan.rows[k]?.aporte ?? 0;
        return acc;
      })(),
      interesAcum: (() => {
        let s = 0;
        for (let k = 1; k <= r.periodo; k++) s += flujoPlan.rows[k]?.interes ?? 0;
        return s;
      })(),
    }));
  }, [flujoPlan, aporteInicial]);

  const vanVal = useMemo(() => (modo === "flujos" ? van(flujos, tasaDescuento) : null), [modo, flujos, tasaDescuento]);
  const tirVal = useMemo(() => (modo === "flujos" ? tirBiseccion(flujos) : null), [modo, flujos]);
  const perfil = useMemo(() => (modo === "flujos" ? perfilVan(flujos, Math.max(-10, (tirVal ?? tasaDescuento) - 20), (tirVal ?? tasaDescuento) + 20, 48) : []), [modo, flujos, tirVal, tasaDescuento]);

  return (
    <div className="space-y-5">
      {/* Header + modo */}
      <div className="rounded-xl border border-border/40 bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em]">Mi plan financiero</h2>
            <p className="mt-1 max-w-[56ch] text-xs leading-relaxed text-muted-foreground">
              Metas y retiro con flujo de fondos. Con cuotas (aportes periódicos) o sin cuotas (aporte único). Vista de proyección, flujo y análisis.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} className="rounded-lg border border-border/40 bg-background px-2.5 py-1.5 text-xs">
              <option value="ARS">ARS</option><option value="USD">USD</option>
            </select>
            <div className="flex items-center gap-1 rounded-full border border-border/40 p-1">
              {(["proyeccion", "flujo", "analisis"] as PlanVista[]).map((v) => (
                <button key={v} onClick={() => setVista(v)} className={`rounded-full px-3 py-1 text-xs font-medium ${vista === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {v === "proyeccion" ? "Proyección" : v === "flujo" ? "Flujo de fondos" : "Análisis"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-full border border-border/30 bg-muted/20 p-1 w-fit">
          {(["meta", "retiro", "flujos"] as PlanModo[]).map((m) => (
            <button key={m} onClick={() => { setModo(m); setVista("proyeccion"); }}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${modo === m ? "bg-card border border-border/40 shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {m === "meta" ? "Meta de ahorro" : m === "retiro" ? "Jubilación / Retiro" : "Proyecto (VAN/TIR)"}
            </button>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          {/* Panel inputs */}
          <div className="space-y-4">
            {/* Comunes */}
            <SectionShell title="Parámetros base">
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">Aporte inicial {conCuotas ? "(sin cuotas → 0 mensual)" : ""}</span>
                  <Input type="number" value={aporteInicial} onChange={(e) => setAporteInicial(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">TNA % (capitalizable mensual)</span>
                  <Input type="number" step={0.1} value={tna} onChange={(e) => setTna(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" />
                  <span className="text-[11px] text-muted-foreground">TEA {tea.toFixed(2)}% · TEM {tem.toFixed(3)}%{realAnual != null ? ` · Real ${realAnual.toFixed(2)}%` : ""}{fuentesHint ? ` · ${fuentesHint}` : ""}</span>
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/20 bg-card p-2.5">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={conCuotas} onCheckedChange={setConCuotas} />
                  Con cuotas (aporte mensual)
                </label>
                {conCuotas && (
                  <>
                    <Input type="number" value={aporteMensual} onChange={(e) => setAporteMensual(Number(e.target.value) || 0)} className="h-7 w-[7rem] text-xs font-mono" />
                    <label className="flex items-center gap-1.5 text-xs">
                      <Switch checked={anticipada} onCheckedChange={setAnticipada} />
                      Anticipada
                    </label>
                  </>
                )}
              </div>
              {!conCuotas && <p className="text-[11px] text-muted-foreground">Sin cuotas: solo capitaliza el aporte inicial (renta única). Con cuotas: elegí vencida (fin de mes) o anticipada (inicio, capitaliza un período extra).</p>}
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">Inflación esperada % mensual (para términos reales)</span>
                <Input type="number" step={0.1} value={inflMensual ?? ""} onChange={(e) => setInflMensual(e.target.value === "" ? null : Number(e.target.value) || 0)} className="h-8 text-xs font-mono" placeholder="ej. 4.5" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Anual ≈ {inflMensual != null ? `${((Math.pow(1 + inflMensual / 100, 12) - 1) * 100).toFixed(1)}%` : "—"}</span>
                  {fuentes?.inflacion?.mensual != null && (
                    <button onClick={() => setInflMensual(fuentes!.inflacion!.mensual!)} className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">Usar oficial {fuentes!.inflacion!.mensual!.toFixed(2)}%</button>
                  )}
                </div>
              </label>
              {modo !== "flujos" && (
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setExtras((p) => [...p, { mes: Math.max(1, planMeses), monto: 200_000 }])} className="rounded-full border border-border/40 px-3 py-1 text-xs hover:bg-muted/40">+ Aporte extraordinario</button>
                  {extras.length > 0 && <button onClick={() => setExtras([])} className="rounded-full border border-border/40 px-3 py-1 text-xs hover:bg-muted/40">Limpiar extras</button>}
                </div>
              )}
              {extras.length > 0 && (
                <div className="space-y-1">
                  {extras.map((ex, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Mes</span>
                      <Input type="number" value={ex.mes} onChange={(e) => setExtras((p) => p.map((x, k) => k === i ? { ...x, mes: Number(e.target.value) || 1 } : x))} className="h-7 w-20 font-mono text-xs" />
                      <span className="text-muted-foreground">$</span>
                      <Input type="number" value={ex.monto} onChange={(e) => setExtras((p) => p.map((x, k) => k === i ? { ...x, monto: Number(e.target.value) || 0 } : x))} className="h-7 flex-1 font-mono text-xs" />
                      <button onClick={() => setExtras((p) => p.filter((_, k) => k !== i))} className="rounded border border-border/40 px-2 py-1 text-xs">×</button>
                    </div>
                  ))}
                </div>
              )}
            </SectionShell>

            {modo === "meta" && (
              <SectionShell title="Meta">
                <div className="flex gap-1 rounded-full border border-border/30 bg-muted/20 p-1 w-fit">
                  {(["pmt", "fecha"] as const).map((m) => (
                    <button key={m} onClick={() => setModoMeta(m)} className={`rounded-full px-3 py-1 text-xs ${modoMeta === m ? "bg-card border border-border/40 shadow-sm" : "text-muted-foreground"}`}>{m === "pmt" ? "¿Cuánto por mes?" : "¿Cuándo llego?"}</button>
                  ))}
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs text-muted-foreground">Objetivo (VF)</span>
                  <Input type="number" value={vfObjetivo} onChange={(e) => setVfObjetivo(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" />
                </label>
                {modoMeta === "pmt" ? (
                  <>
                    <div>
                      <div className="flex items-center justify-between"><Label className="text-xs">Plazo</Label><span className="font-mono text-xs">{mesesMeta} meses · {(mesesMeta / 12).toFixed(1)} años</span></div>
                      <Slider value={[mesesMeta]} min={3} max={360} step={1} onValueChange={([v]) => setMesesMeta(v)} className="mt-2" />
                    </div>
                    <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Cuota necesaria {anticipada ? "(anticipada)" : "(vencida)"}</div>
                      <div className="font-mono text-lg font-semibold">{pmtCalculado != null ? formatARS(Math.round(pmtCalculado), moneda) : "—"} <span className="text-xs font-normal text-muted-foreground">/ mes</span></div>
                      {!conCuotas && <p className="text-[11px] text-amber-600">Activá “Con cuotas” para calcular la cuota.</p>}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Llegás en</div>
                      <div className="font-mono text-lg font-semibold">{mesesCalculados != null ? `${mesesCalculados} meses · ${(mesesCalculados / 12).toFixed(1)} años · ~${new Date(Date.now() + mesesCalculados * 30.4375 * 86400000).toLocaleDateString("es-AR")}` : "— no se alcanza con esos aportes"}</div>
                    </div>
                    {conCuotas && <p className="text-[11px] text-muted-foreground">Con {formatARS(aporteMensual, moneda)}/mes {anticipada ? "anticipada" : "vencida"}.</p>}
                  </>
                )}
              </SectionShell>
            )}

            {modo === "retiro" && (
              <SectionShell title="Jubilación">
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1"><span className="text-xs text-muted-foreground">Edad actual</span><Input type="number" value={edadActual} onChange={(e) => setEdadActual(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" /></label>
                  <label className="space-y-1"><span className="text-xs text-muted-foreground">Retiro</span><Input type="number" value={edadRetiro} onChange={(e) => setEdadRetiro(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" /></label>
                  <label className="space-y-1"><span className="text-xs text-muted-foreground">Vida hasta</span><Input type="number" value={esperanzaVida} onChange={(e) => setEsperanzaVida(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" /></label>
                </div>
                <p className="text-[11px] text-muted-foreground">Horizonte {(edadRetiro - edadActual)} años · Retiro {(esperanzaVida - edadRetiro)} años · {planMeses} meses aportando.</p>
                <div className="rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5 space-y-1">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Capital al retiro</div>
                  <div className="font-mono text-base font-semibold">{flujoPlan ? formatARS(flujoPlan.vfNominal, moneda) : "—"}{flujoPlan?.vfReal != null && <span className="ml-2 text-xs font-normal text-muted-foreground">real {formatARS(flujoPlan.vfReal, moneda)}</span>}</div>
                  <div className="text-xs">Haber mensual estimado: <b className="font-mono">{retiroHaber != null ? formatARS(retiroHaber, moneda) : "—"}</b> <span className="text-muted-foreground">durante {(esperanzaVida - edadRetiro)} años</span></div>
                </div>
              </SectionShell>
            )}

            {modo === "flujos" && (
              <SectionShell title="Flujos del proyecto">
                <p className="text-[11px] leading-relaxed text-muted-foreground">CF0 negativo = inversión inicial. Positivos = ingresos. Editá la tabla; se recalcula VAN/TIR al instante.</p>
                <div className="max-h-[260px] overflow-auto rounded-lg border border-border/30">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-muted/40 text-[11px] uppercase text-muted-foreground"><tr><th className="px-2 py-1.5">#</th><th className="px-2 py-1.5">Flujo</th><th className="px-2 py-1.5 w-10"></th></tr></thead>
                    <tbody className="divide-y divide-border/20 font-mono">
                      {flujos.map((v, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 text-muted-foreground">{i === 0 ? "CF0" : `CF${i}`}</td>
                          <td className="px-2 py-1"><Input type="number" value={v} onChange={(e) => setFlujos((p) => p.map((x, k) => k === i ? Number(e.target.value) || 0 : x))} className="h-7 text-xs font-mono" /></td>
                          <td className="px-2 py-1"><button onClick={() => setFlujos((p) => p.filter((_, k) => k !== i))} className="rounded border border-border/30 px-1.5 py-1 text-[11px]">×</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setFlujos((p) => [...p, 0])} className="rounded-full border border-border/40 px-3 py-1 text-xs hover:bg-muted/30">+ Período</button>
                  <button onClick={() => setFlujos([-2_000_000, 300_000, 500_000, 700_000, 900_000, 1_200_000])} className="rounded-full border border-border/40 px-3 py-1 text-xs hover:bg-muted/30">Ejemplo</button>
                </div>
                <label className="block space-y-1.5">
                  <span className="text-xs text-muted-foreground">Tasa de descuento %</span>
                  <Input type="number" step={0.1} value={tasaDescuento} onChange={(e) => setTasaDescuento(Number(e.target.value) || 0)} className="h-8 text-xs font-mono" />
                  <div className="flex flex-wrap gap-1.5">
                    {liveRates.caucion7d != null && (
                      <button onClick={() => setTasaDescuento(liveRates.caucion7d!)} className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">Caución 7d {liveRates.caucion7d}%</button>
                    )}
                    {liveRates.lecapProm != null && (
                      <button onClick={() => setTasaDescuento(liveRates.lecapProm!)} className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">LECAP prom. {liveRates.lecapProm}%</button>
                    )}
                    {liveRates.fciTEA != null && (
                      <button onClick={() => setTasaDescuento(liveRates.fciTEA!)} className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">FCI MM {liveRates.fciTEA}%</button>
                    )}
                  </div>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div className={`rounded-lg border p-2.5 ${vanVal != null && vanVal >= 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/30 bg-amber-500/10"}`}>
                    <div className="text-[11px] uppercase text-muted-foreground">VAN</div>
                    <div className="font-mono text-sm font-semibold">{vanVal != null ? formatARS(Math.round(vanVal), moneda) : "—"}</div>
                    <div className="text-[11px] text-muted-foreground">{vanVal != null && vanVal >= 0 ? "Viable (VAN ≥ 0)" : "No viable"}</div>
                  </div>
                  <div className="rounded-lg border border-border/30 bg-muted/20 p-2.5">
                    <div className="text-[11px] uppercase text-muted-foreground">TIR</div>
                    <div className="font-mono text-sm font-semibold">{tirVal != null ? `${tirVal.toFixed(2)}%` : "— sin TIR en rango"}</div>
                    <div className="text-[11px] text-muted-foreground">{tirVal != null && tirVal > tasaDescuento ? "TIR > tasa → aceptar" : "—"}</div>
                  </div>
                </div>
              </SectionShell>
            )}
          </div>

          {/* Panel derecho: métricas + visualización */}
          <div className="space-y-4">
            {modo !== "flujos" && flujoPlan && (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/30 bg-card p-3"><div className="text-[11px] uppercase text-muted-foreground">Capital final</div><div className="font-mono text-sm font-semibold">{formatARS(flujoPlan.vfNominal, moneda)}</div>{flujoPlan.vfReal != null && <div className="text-[11px] text-muted-foreground">Real {formatARS(flujoPlan.vfReal, moneda)}</div>}</div>
                <div className="rounded-xl border border-border/30 bg-card p-3"><div className="text-[11px] uppercase text-muted-foreground">Total aportado</div><div className="font-mono text-sm font-semibold">{formatARS(flujoPlan.totalAportado, moneda)}</div><div className="text-[11px] text-muted-foreground">{conCuotas ? `${planMeses} cuotas` : "Sin cuotas"}</div></div>
                <div className="rounded-xl border border-border/30 bg-card p-3"><div className="text-[11px] uppercase text-muted-foreground">Interés ganado</div><div className="font-mono text-sm font-semibold text-emerald-600">{formatARS(flujoPlan.interesGanado, moneda)}</div><div className="text-[11px] text-muted-foreground">{flujoPlan.totalAportado > 0 ? `${((flujoPlan.interesGanado / flujoPlan.totalAportado) * 100).toFixed(1)}% sobre aportado` : ""}</div></div>
              </div>
            )}

            {/* Vistas */}
            <div className="rounded-xl border border-border/40 bg-card p-4">
              {vista === "proyeccion" && (
                modo === "flujos" ? (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Perfil del VAN vs tasa</h3>
                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={perfil} margin={{ left: 8, right: 16, top: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                          <XAxis dataKey="tasa" tick={AXIS_TICK} tickFormatter={(v: number) => `${v}%`} />
                          <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => fmtNum(v, 0)} width={72} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatARS(v, moneda)} labelFormatter={(v: number) => `Tasa ${v}%`} />
                          <Line type="monotone" dataKey="van" name="VAN" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />
                          {tirVal != null && <ReferenceLine x={Math.round(tirVal * 100) / 100} stroke="hsl(142 76% 36%)" strokeDasharray="4 4" label={{ value: `TIR ${tirVal.toFixed(1)}%`, fontSize: 10, fill: "hsl(142 76% 36%)" }} />}
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-muted-foreground">La TIR es donde la curva corta el eje. Si hay múltiples cambios de signo, preferí el VAN para rankear.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Proyección acumulada</h3>
                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={proyData} margin={{ left: 8, right: 16, top: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                          <XAxis dataKey="label" tick={AXIS_TICK} />
                          <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => fmtNum(v, 0)} width={72} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatARS(v, moneda)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Area type="monotone" dataKey="aportado" name="Total aportado" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.14} dot={false} strokeWidth={1.5} />
                          <Area type="monotone" dataKey="saldo" name="Capital (con interés)" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.18} dot={false} strokeWidth={2} />
                          {modo === "meta" && <ReferenceLine y={vfObjetivo} stroke="hsl(38 92% 50%)" strokeDasharray="6 4" label={{ value: "Meta", fontSize: 10, fill: "hsl(38 92% 50%)" }} />}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    {modo === "retiro" && retiroHaber != null && <p className="text-xs text-muted-foreground">Al jubilarte, ese capital financia <b className="font-mono text-foreground">{formatARS(retiroHaber, moneda)}/mes</b> por {(esperanzaVida - edadRetiro)} años (renta vencida, misma TEM).</p>}
                  </div>
                )
              )}

              {vista === "flujo" && (
                modo === "flujos" ? (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Flujos del proyecto</h3>
                    <div className="h-[280px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={flujos.map((v, i) => ({ periodo: i, flujo: v, label: i === 0 ? "CF0" : `${i}` }))} margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                          <XAxis dataKey="label" tick={AXIS_TICK} />
                          <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => fmtNum(v, 0)} width={72} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatARS(v, moneda)} />
                          <Area type="monotone" dataKey="flujo" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} dot />
                          <ReferenceLine y={0} stroke="var(--color-border)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="overflow-auto rounded-lg border border-border/30">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-muted/30 text-[11px] uppercase text-muted-foreground"><tr><th className="px-3 py-2">Período</th><th className="px-3 py-2 text-right">Flujo</th><th className="px-3 py-2 text-right">VA ({tasaDescuento}%)</th></tr></thead>
                        <tbody className="divide-y divide-border/20 font-mono">
                          {flujos.map((cf, i) => {
                            const va = cf / Math.pow(1 + tasaDescuento / 100, i);
                            return <tr key={i}><td className="px-3 py-1.5">{i === 0 ? "CF0" : `${i}`}</td><td className={`px-3 py-1.5 text-right ${cf < 0 ? "text-amber-600" : "text-emerald-600"}`}>{formatARS(cf, moneda)}</td><td className="px-3 py-1.5 text-right text-muted-foreground">{formatARS(Math.round(va), moneda)}</td></tr>;
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : flujoPlan ? (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Flujo de fondos mes a mes</h3>
                    <div className="max-h-[380px] overflow-auto rounded-lg border border-border/30">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-muted/40 text-[11px] uppercase text-muted-foreground"><tr><th className="px-2.5 py-2">Mes</th><th className="px-2.5 py-2 text-right">Aporte</th><th className="px-2.5 py-2 text-right">Interés</th><th className="px-2.5 py-2 text-right">Saldo</th></tr></thead>
                        <tbody className="divide-y divide-border/20 font-mono">
                          {flujoPlan.rows.map((r) => (
                            <tr key={r.periodo} className={r.periodo === 0 ? "bg-muted/20" : ""}>
                              <td className="px-2.5 py-1.5">{r.periodo}</td>
                              <td className="px-2.5 py-1.5 text-right">{r.aporte ? formatARS(r.aporte, moneda) : "—"}</td>
                              <td className="px-2.5 py-1.5 text-right text-emerald-600">{r.interes ? formatARS(r.interes, moneda) : "—"}</td>
                              <td className="px-2.5 py-1.5 text-right font-semibold">{formatARS(r.saldo, moneda)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Interés del período = saldo previo × TEM {tem.toFixed(3)}%{anticipada ? " + aporte anticipado capitaliza el mes" : ""}. Con y sin cuotas se ve el efecto compuesto.</p>
                  </div>
                ) : null
              )}

              {vista === "analisis" && (
                modo === "flujos" ? (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sensibilidad del VAN a la tasa</h3>
                    <p className="text-xs text-muted-foreground">Movés la tasa y ves cómo cambia el VAN. Útil para comparar contra tu costo de oportunidad.</p>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={perfil} margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                          <XAxis dataKey="tasa" tick={AXIS_TICK} tickFormatter={(v: number) => `${v}%`} />
                          <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => fmtNum(v, 0)} width={72} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatARS(v, moneda)} />
                          <Line type="monotone" dataKey="van" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                          <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ) : flujoPlan ? (
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Sensibilidad del capital final a la tasa</h3>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={Array.from({ length: 25 }, (_, i) => {
                            const tnaI = Math.max(5, tna - 15 + i * 1.5);
                            const teaI = (Math.pow(1 + tnaI / 100 / 12, 12) - 1) * 100;
                            const temI = (Math.pow(1 + teaI / 100, 1 / 12) - 1) * 100;
                            const pmt = modo === "meta" && modoMeta === "pmt" && pmtCalculado != null ? pmtCalculado : pmtEfectivo;
                            const rows = buildPlanFlujo(aporteInicial, pmt, planMeses, temI, anticipada, null, extras);
                            return { tna: Math.round(tnaI * 10) / 10, vf: rows.vfNominal };
                          })}
                          margin={{ left: 8, right: 16 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                          <XAxis dataKey="tna" tick={AXIS_TICK} tickFormatter={(v: number) => `${v}%`} />
                          <YAxis tick={AXIS_TICK} tickFormatter={(v: number) => fmtNum(v, 0)} width={72} />
                          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatARS(v, moneda)} labelFormatter={(v: number) => `TNA ${v}%`} />
                          <Line type="monotone" dataKey="vf" name="Capital final" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                          <ReferenceLine x={tna} stroke="hsl(38 92% 50%)" strokeDasharray="4 4" label={{ value: `Actual ${tna}%`, fontSize: 10, fill: "hsl(38 92% 50%)" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <p className="text-[11px] text-muted-foreground">Cada punto recalcula todo el flujo con esa TNA (capitalización mensual). Sirve para ver cuánto cambia tu plan si la tasa baja/sube.</p>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
