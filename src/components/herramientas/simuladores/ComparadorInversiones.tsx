import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from "recharts";
import { getSimuladorFuentes, type FuenteOpcion } from "@/lib/simuladores-fuentes.functions";
import { CHART_TOOLTIP_STYLE, AXIS_TICK } from "@/routes/herramientas/shared/chart-constants";
import { fmtNum } from "@/routes/herramientas/shared/formatters";
import { buildEvolucion, fisherReal, type InstrConfig } from "@/lib/simuladores.functions";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { registerComparadorActions } from "./chat/registry";

type Vista = "evolucion" | "comparativa" | "tabla";
type Moneda = "ARS" | "USD";
type FuenteSel = { modo: "promedio" | "mejor" | "entidad" | "manual" | "cercana"; entidadId?: string; manualVal?: number };

const COLOR_MAP: Record<string, string> = {
  pf: "hsl(var(--primary))",
  uva: "hsl(142 76% 36%)",
  fci: "hsl(38 92% 50%)",
  lecap: "hsl(199 89% 48%)",
  caucion: "hsl(262 83% 58%)",
};

function formatARS(n: number | null, moneda: Moneda) {
  if (n == null || !isFinite(n)) return "—";
  if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)} B ${moneda}`;
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)} M ${moneda}`;
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda, maximumFractionDigits: 0 }).format(n);
}
function formatPct(v: number | null, dec = 2) {
  if (v == null || !isFinite(v)) return "—";
  return `${v.toFixed(dec)}%`;
}

type InstrMeta = { id: string; kind: "pf" | "uva" | "fci" | "lecap" | "caucion"; label: string; color: string };
const META: InstrMeta[] = [
  { id: "pf", kind: "pf", label: "Plazo fijo", color: COLOR_MAP.pf },
  { id: "uva", kind: "uva", label: "PF UVA/CER", color: COLOR_MAP.uva },
  { id: "fci", kind: "fci", label: "FCI Money Market", color: COLOR_MAP.fci },
  { id: "lecap", kind: "lecap", label: "LECAP", color: COLOR_MAP.lecap },
  { id: "caucion", kind: "caucion", label: "Caución", color: COLOR_MAP.caucion },
];

/** Extrae días de una opción de LECAP a partir de su detalle "Nd · vto dd/mm/yyyy" */
function diasFromDetalle(detalle?: string): number | null {
  if (!detalle) return null;
  const m = detalle.match(/(\d+)\s*d/);
  return m ? parseInt(m[1], 10) : null;
}

export function ComparadorInversiones() {
  const [capital, setCapital] = useState(1_000_000);
  const [dias, setDias] = useState(180);
  const [inflMensual, setInflMensual] = useState<number | null>(null);
  const [moneda, setMoneda] = useState<Moneda>("ARS");
  const [vista, setVista] = useState<Vista>("evolucion");
  const [modoReal, setModoReal] = useState(false);
  const [fuentes, setFuentes] = useState<Awaited<ReturnType<typeof getSimuladorFuentes>> | null>(null);
  const [loading, setLoading] = useState(true);
  const prevDiasRef = useRef(dias);
  const [sel, setSel] = useState<Record<string, FuenteSel & { enabled: boolean }>>({
    pf: { modo: "promedio", enabled: true },
    uva: { modo: "promedio", enabled: true },
    fci: { modo: "promedio", enabled: true },
    lecap: { modo: "cercana", enabled: true },
    caucion: { modo: "cercana", enabled: true },
  });

  const fuentesFn = useServerFn(getSimuladorFuentes);
  useEffect(() => {
    let cancelled = false;
    fuentesFn().then((res: any) => {
      if (cancelled) return;
      setFuentes(res);
      if (res?.inflacion?.mensual != null) setInflMensual(res.inflacion.mensual);
      setLoading(false);
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);



  // Auto-seleccionar entidad más cercana al plazo cuando cambia el slider
  const autoSelectCercana = useCallback((id: string, newDias: number) => {
    setSel((prev) => {
      const s = prev[id];
      if (!s || s.modo !== "cercana") return prev;
      return prev; // modo cercana ya resuelve dinámicamente
    });
  }, []);
  useEffect(() => {
    if (prevDiasRef.current !== dias) {
      autoSelectCercana("lecap", dias);
      autoSelectCercana("caucion", dias);
      prevDiasRef.current = dias;
    }
  }, [dias, autoSelectCercana]);

  const grupoFor = useCallback((kind: string) => {
    if (!fuentes) return null;
    if (kind === "pf") return fuentes.pf;
    if (kind === "uva") return fuentes.pfUva;
    if (kind === "fci") return fuentes.fciMM;
    if (kind === "lecap") return fuentes.lecap;
    if (kind === "caucion") return fuentes.caucion;
    return null;
  }, [fuentes]);

  // Para LECAP: ordenar por proximidad al plazo
  const lecapSorted = useMemo(() => {
    if (!fuentes?.lecap?.opciones) return [];
    return [...fuentes.lecap.opciones].sort((a, b) => {
      const da = Math.abs((diasFromDetalle(a.detalle) ?? 999) - dias);
      const db = Math.abs((diasFromDetalle(b.detalle) ?? 999) - dias);
      return da - db;
    });
  }, [fuentes, dias]);

  // Para Caución: ordenar por proximidad al plazo
  const caucionSorted = useMemo(() => {
    if (!fuentes?.caucion?.opciones) return [];
    return [...fuentes.caucion.opciones].sort((a, b) => {
      const da = Math.abs((diasFromDetalle(a.detalle) ?? parseInt(a.id.replace(/\D/g, "") || "99", 10)) - dias);
      const db = Math.abs((diasFromDetalle(b.detalle) ?? parseInt(b.id.replace(/\D/g, "") || "99", 10)) - dias);
      return da - db;
    });
  }, [fuentes, dias]);

  const instrs: (InstrConfig & { fuenteLabel: string })[] = useMemo(() => {
    if (!fuentes) {
      return META.map((m) => ({
        id: m.id, kind: m.kind as any, label: m.label, color: m.color, enabled: sel[m.id]?.enabled ?? true,
        tna: m.kind === "uva" ? 3.5 : m.kind === "fci" ? 42 : m.kind === "lecap" ? 42 : m.kind === "caucion" ? 42 : 42,
        tem: m.kind === "lecap" ? 3.2 : null,
        fuenteLabel: "Cargando…",
      }));
    }
    return META.map((m) => {
      const cfg = sel[m.id] ?? { modo: "promedio", enabled: true } as any;
      const group: any = grupoFor(m.kind);
      let tna: number, tem: number | null, fuenteLabel: string;

      if (cfg.modo === "manual" && cfg.manualVal != null) {
        tna = cfg.manualVal;
        tem = m.kind === "lecap" ? tna / 12 : null;
        fuenteLabel = "Manual";
      } else if (cfg.modo === "mejor" && group?.mejor != null) {
        tna = group.mejor;
        tem = m.kind === "lecap" ? group.mejor / 12 : null;
        fuenteLabel = "Mejor tasa";
        if (m.kind === "lecap") {
          const best = (group.opciones as FuenteOpcion[]).find((o) => Math.abs(o.tna - group.mejor) < 0.01);
          tem = best?.tem ?? (group.mejor / 12);
        }
      } else if (cfg.modo === "entidad" && cfg.entidadId) {
        const opt = (group?.opciones as FuenteOpcion[])?.find((o) => o.id === cfg.entidadId);
        if (opt) {
          tna = opt.tna;
          tem = opt.tem;
          fuenteLabel = opt.label.slice(0, 32);
        } else {
          tna = group?.promedio ?? 40;
          tem = m.kind === "lecap" ? tna / 12 : null;
          fuenteLabel = "Promedio";
        }
      } else if (cfg.modo === "cercana" && (m.kind === "lecap" || m.kind === "caucion")) {
        // Auto-seleccionar la opción más cercana al plazo elegido
        const sorted = m.kind === "lecap" ? lecapSorted : caucionSorted;
        const best = sorted[0] ?? null;
        if (best) {
          tna = best.tna;
          tem = best.tem;
          fuenteLabel = best.label.slice(0, 32);
        } else {
          tna = group?.promedio ?? (m.kind === "caucion" ? 42 : 42);
          tem = m.kind === "lecap" ? tna / 12 : null;
          fuenteLabel = group?.promedio != null ? "Promedio mercado" : "Sin datos";
        }
      } else {
        // promedio
        tna = group?.promedio ?? (m.kind === "uva" ? 3.5 : m.kind === "caucion" ? 42 : 42);
        tem = m.kind === "lecap" ? (group?.opciones?.[0]?.tem ?? tna / 12) : null;
        if (m.kind === "lecap" && group?.opciones?.length) {
          const tems = (group.opciones as FuenteOpcion[]).map((o) => o.tem ?? 0).filter((v) => v > 0);
          if (tems.length) tem = tems.reduce((s, v) => s + v, 0) / tems.length;
        }
        fuenteLabel = "Promedio mercado";
      }
      if (!isFinite(tna) || tna < 0 || tna > 300) tna = 40;
      if (tem != null && (!isFinite(tem) || tem < 0 || tem > 25)) tem = tna / 12;
      return { id: m.id, kind: m.kind as any, label: m.label, color: m.color, enabled: cfg.enabled, tna: Math.round(tna * 100) / 100, tem: tem != null ? Math.round(tem * 100) / 100 : null, fuenteLabel };
    });
  }, [fuentes, sel, lecapSorted, caucionSorted, grupoFor]);

  const meses = Math.max(1, Math.round(dias / 30.4375));
  const { puntos, resumen } = useMemo(() => buildEvolucion(capital, meses, instrs, inflMensual), [capital, meses, instrs, inflMensual]);
  const ranking = useMemo(() => {
    return resumen.map((r) => {
      const cfg: any = instrs.find((x) => x.id === r.id)!;
      let real: number | null = null;
      if (inflMensual != null) {
        // UVA: su TNA ya es real → mostrar directamente
        if (cfg.kind === "uva") {
          real = cfg.tna;
        } else {
          const tea = r.tea;
          if (tea != null && tea >= 0 && tea <= 300) real = fisherReal(tea, inflMensual * 12);
          if (real != null && (!isFinite(real) || Math.abs(real) > 500)) real = null;
        }
      }
      return { ...r, label: cfg.label, color: cfg.color, kind: cfg.kind, tna: cfg.tna, tem: cfg.tem, fuenteLabel: cfg.fuenteLabel, real };
    }).sort((a, b) => b.vfNominal - a.vfNominal);
  }, [resumen, instrs, inflMensual]);
  const ganador = ranking[0] ?? null;

  function updateSel(id: string, patch: Partial<FuenteSel & { enabled: boolean }>) {
    setSel((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } as any }));
  }

  useEffect(() => {
    registerComparadorActions({
      setCapital,
      setDias,
      setInflacion: setInflMensual,
      setModoReal,
      setVista,
      setInstrumentoEnabled: (id: string, enabled: boolean) => updateSel(id, { enabled } as any),
      setInstrumentoModo: (id: string, modo: string, entidadId?: string, manualVal?: number) => updateSel(id, { modo: modo as any, entidadId, manualVal } as any),
      getSnapshot: () => ({
        capital, dias, meses, inflacionMensual: inflMensual, inflacionOficial: fuentes?.inflacion?.mensual ?? null,
        ganador: ranking[0] ? { label: ranking[0].label, fuenteLabel: ranking[0].fuenteLabel, vfNominal: ranking[0].vfNominal } : null,
        vista, modoReal,
      }),
    });
    return () => registerComparadorActions(null);
  }, [capital, dias, inflMensual, fuentes, ranking, meses, vista, modoReal]);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border/40 bg-card p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.18em]">¿Dónde invierto?</h2>
            <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-muted-foreground">
              Compará colocaciones en pesos lado a lado — promedio del mercado o elegí entidad específica. Tasas vivas precargadas.
              {loading ? " Cargando…" : fuentes ? ` · ArgentinaDatos ${new Date(fuentes.pf.timestamp).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}` : ""}
              {fuentes?.caucion?.fuente && fuentes.caucion.fuente !== "sin datos" && <> · Caución {fuentes.caucion.fuente}.</>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={moneda} onChange={(e) => setMoneda(e.target.value as Moneda)} className="rounded-lg border border-border/40 bg-background px-2.5 py-1.5 text-xs">
              <option value="ARS">ARS</option><option value="USD">USD</option>
            </select>
            <div className="flex items-center gap-1.5 rounded-full border border-border/40 p-1">
              {(["evolucion", "comparativa", "tabla"] as Vista[]).map((v) => (
                <button key={v} onClick={() => setVista(v)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${vista === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                  {v === "evolucion" ? "Evolución" : v === "comparativa" ? "Barras" : "Tabla"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4 rounded-xl border border-border/30 bg-muted/20 p-4">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Capital</Label>
                <span className="font-mono text-sm font-semibold">{formatARS(capital, moneda)}</span>
              </div>
              <Slider value={[capital]} min={50_000} max={50_000_000} step={50_000} onValueChange={([v]) => setCapital(v)} className="mt-3" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[500_000, 1_000_000, 5_000_000, 10_000_000].map((v) => (
                  <button key={v} onClick={() => setCapital(v)} className={`rounded-full border px-2.5 py-1 text-[11px] ${capital === v ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground"}`}>{formatARS(v, moneda)}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Plazo</Label>
                <span className="font-mono text-sm font-semibold">{dias} días · ~{meses} meses</span>
              </div>
              <Slider value={[dias]} min={7} max={540} step={1} onValueChange={([v]) => setDias(v)} className="mt-3" />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[7, 14, 30, 90, 180, 365].map((d) => (
                  <button key={d} onClick={() => setDias(d)} className={`rounded-full border px-2.5 py-1 text-[11px] ${dias === d ? "border-primary/40 bg-primary/10 text-primary" : "border-border/40 text-muted-foreground"}`}>{d}d</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1.5">
                <span className="text-xs text-muted-foreground">Inflación esperada (% mensual)</span>
                <input type="number" step={0.1} value={inflMensual ?? ""} onChange={(e) => setInflMensual(e.target.value === "" ? null : Number(e.target.value) || 0)}
                  className="w-full rounded-lg border border-border/40 bg-background px-2.5 py-1.5 text-sm font-mono" placeholder="ej. 4.0" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-muted-foreground">Anual ≈ {inflMensual != null ? `${((Math.pow(1 + inflMensual / 100, 12) - 1) * 100).toFixed(1)}%` : "—"}</span>
                  {fuentes?.inflacion?.mensual != null && (
                    <button onClick={() => setInflMensual(fuentes.inflacion.mensual)}
                      className="rounded-full border border-border/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">Usar oficial {fuentes.inflacion.mensual.toFixed(2)}%</button>
                  )}
                </div>
              </label>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-xs">
                  <Switch checked={modoReal} onCheckedChange={setModoReal} />
                  Ver en términos reales
                </label>
                <p className="text-[11px] leading-relaxed text-muted-foreground">Fisher exacto: (1+nom)/(1+π)−1.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Instrumentos — tasa desde fuente seleccionada</p>
            {META.map((m) => {
              const cur = instrs.find((x) => x.id === m.id)!;
              const s = sel[m.id];
              const grupo: any = grupoFor(m.kind);
              const opts: FuenteOpcion[] = grupo?.opciones ?? [];
              const isLecap = m.kind === "lecap";
              const isCaucion = m.kind === "caucion";
              const sortedOpts = isLecap ? lecapSorted : isCaucion ? caucionSorted : opts;
              return (
                <div key={m.id} className={`rounded-xl border p-3 space-y-2 ${s?.enabled ? "border-border/40 bg-card" : "border-border/20 bg-muted/10 opacity-60"}`}>
                  <div className="flex items-center gap-2">
                    <Switch checked={s?.enabled ?? true} onCheckedChange={(v) => updateSel(m.id, { enabled: v })} />
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
                    <span className="text-xs font-medium">{m.label}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {cur.fuenteLabel} · {isLecap || isCaucion ? `${formatPct(cur.tem)} TEM` : `${formatPct(cur.tna)} TNA`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={s?.modo === "entidad" ? `ent:${s.entidadId}` : s?.modo ?? "promedio"}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "promedio") updateSel(m.id, { modo: "promedio", entidadId: undefined, manualVal: undefined });
                        else if (v === "mejor") updateSel(m.id, { modo: "mejor", entidadId: undefined, manualVal: undefined });
                        else if (v === "cercana") updateSel(m.id, { modo: "cercana", entidadId: undefined, manualVal: undefined });
                        else if (v === "manual") updateSel(m.id, { modo: "manual", manualVal: cur.tna, entidadId: undefined });
                        else if (v.startsWith("ent:")) updateSel(m.id, { modo: "entidad", entidadId: v.slice(4), manualVal: undefined });
                      }}
                      className="flex-1 rounded-lg border border-border/40 bg-background px-2 py-1.5 text-xs"
                      disabled={!s?.enabled}
                    >
                      {isLecap || isCaucion ? (
                        <>
                          <option value="cercana">Más cercana al plazo ({dias}d)</option>
                          <option value="mejor">Mejor TEM {grupo?.mejor != null ? `(${formatPct(grupo.mejor > 100 ? null : grupo.mejor)})` : ""}</option>
                          {sortedOpts.slice(0, 12).map((o) => {
                            const d = isLecap ? diasFromDetalle(o.detalle) : parseInt(o.id.replace(/\D/g, "") || "0", 10);
                            return <option key={o.id} value={`ent:${o.id}`}>{o.label.slice(0, 30)} {d ? `· ${d}d` : ""} — {formatPct(o.tem)}</option>;
                          })}
                          <option value="manual">Manual…</option>
                        </>
                      ) : (
                        <>
                          <option value="promedio">Promedio mercado {grupo?.promedio != null ? `(${formatPct(grupo.promedio)})` : ""}</option>
                          <option value="mejor">Mejor tasa {grupo?.mejor != null ? `(${formatPct(grupo.mejor)})` : ""}</option>
                          {opts.slice(0, 10).map((o) => (
                            <option key={o.id} value={`ent:${o.id}`}>{o.label.slice(0, 36)} — {formatPct(o.tna)}</option>
                          ))}
                          <option value="manual">Manual…</option>
                        </>
                      )}
                    </select>
                    <input
                      type="number" step={isLecap || isCaucion ? 0.05 : 0.1}
                      value={isLecap || isCaucion ? (cur.tem ?? 0) : cur.tna}
                      onChange={(e) => {
                        const v = Number(e.target.value) || 0;
                        if (s?.modo === "manual") updateSel(m.id, { manualVal: isLecap || isCaucion ? v * 12 : v } as any);
                        else updateSel(m.id, { modo: "manual", manualVal: isLecap || isCaucion ? v * 12 : v, entidadId: undefined } as any);
                      }}
                      className="w-[5.5rem] rounded-lg border border-border/40 bg-background px-2 py-1.5 text-xs font-mono"
                      disabled={!s?.enabled}
                    />
                    <span className="text-[11px] text-muted-foreground w-8">{isLecap || isCaucion ? "TEM" : "TNA"}</span>
                  </div>
                  {isCaucion && fuentes?.caucion?.fuente && fuentes.caucion.fuente !== "sin datos" && (
                    <p className="text-[10px] text-muted-foreground">Fuente: {fuentes.caucion.fuente}</p>
                  )}
                </div>
              );
            })}
            {ganador && (
              <p className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs">
                Ganador nominal: <b>{ganador.label}</b> ({ganador.fuenteLabel}) → {formatARS(ganador.vfNominal, moneda)} (+{formatARS(ganador.interes, moneda)}).
                {ganador.real != null && <> Real Fisher {ganador.real.toFixed(2)}%.</>}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/40 bg-card p-4 sm:p-5">
        {vista === "evolucion" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Evolución del capital {modoReal ? "(real, deflactado)" : "(nominal)"}</h3>
              <span className="text-[11px] text-muted-foreground">Compuesto mensual · {meses} meses</span>
            </div>
            <div className="h-[340px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={puntos} margin={{ left: 8, right: 16, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.4} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} interval={Math.ceil(puntos.length / 9)} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtNum(v, 0)} width={80} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatARS(v, moneda)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {ranking.map((r) => {
                    const key = modoReal && inflMensual != null ? r.id + "_real" : r.id;
                    return <Area key={r.id} type="monotone" dataKey={key} name={`${r.label} (${r.fuenteLabel})`} stroke={r.color} fill={r.color} fillOpacity={0.14} dot={false} strokeWidth={2} />;
                  })}
                  <ReferenceLine y={capital} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" label={{ value: "Capital inicial", position: "insideTopRight", fontSize: 10, fill: "var(--color-muted-foreground)" }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {vista === "comparativa" && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Capital final comparativo</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ranking.map((r) => ({ name: r.label, nominal: r.vfNominal, real: r.vfReal ?? 0 }))} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} tickFormatter={(v: number) => fmtNum(v, 0)} width={80} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => formatARS(v, moneda)} />
                  <Bar dataKey="nominal" name="Capital final" radius={[8, 8, 0, 0]} fill="hsl(var(--primary))" />
                  {modoReal && inflMensual != null && <Bar dataKey="real" name="Capital real" radius={[8, 8, 0, 0]} fill="hsl(142 76% 36% / 0.7)" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {ranking.map((r, idx) => (
                <div key={r.id} className={`rounded-xl border p-3 ${idx === 0 ? "border-emerald-500/30 bg-emerald-500/10" : "border-border/30 bg-muted/20"}`}>
                  <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: r.color }} /><span className="text-xs font-medium">{r.label}</span>{idx === 0 && <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Ganador</span>}</div>
                  <div className="text-[11px] text-muted-foreground">{r.fuenteLabel}</div>
                  <div className="mt-1 font-mono text-sm font-semibold">{formatARS(r.vfNominal, moneda)}</div>
                  <div className="text-[11px] text-muted-foreground">+{formatARS(r.interes, moneda)} · TEA {formatPct(r.tea)} {r.real != null ? `· Real ${formatPct(r.real)}` : ""}</div>
                  {idx > 0 && ganador && <div className="text-[11px] text-muted-foreground">Δ vs ganador −{formatARS(ganador.vfNominal - r.vfNominal, moneda)}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {vista === "tabla" && (
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Tabla de resultados · ranking por capital final</h3>
            <div className="overflow-x-auto rounded-xl border border-border/30">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                  <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Instrumento</th><th className="px-3 py-2">Fuente</th><th className="px-3 py-2 text-right">Tasa</th><th className="px-3 py-2 text-right">TEA</th><th className="px-3 py-2 text-right">Real (Fisher)</th><th className="px-3 py-2 text-right">Capital final</th><th className="px-3 py-2 text-right">Interés</th></tr>
                </thead>
                <tbody className="divide-y divide-border/20 font-mono">
                  {ranking.map((r, idx) => (
                    <tr key={r.id} className={idx === 0 ? "bg-emerald-500/10" : ""}>
                      <td className="px-3 py-2">{idx + 1}</td>
                      <td className="px-3 py-2 font-sans font-medium"><span className="mr-2 inline-block h-2 w-2 rounded-full align-middle" style={{ background: r.color }} />{r.label}</td>
                      <td className="px-3 py-2 font-sans text-[11px] text-muted-foreground">{r.fuenteLabel}</td>
                      <td className="px-3 py-2 text-right">{r.kind === "lecap" || r.kind === "caucion" ? `${formatPct(r.tem)} TEM` : `${formatPct(r.tna)} TNA`}</td>
                      <td className="px-3 py-2 text-right">{formatPct(r.tea)}</td>
                      <td className={`px-3 py-2 text-right ${r.real != null && r.real < 0 ? "text-amber-600" : r.real != null && r.real > 2 ? "text-emerald-600" : ""}`}>{r.real != null ? formatPct(r.real) : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatARS(r.vfNominal, moneda)}</td>
                      <td className="px-3 py-2 text-right">{formatARS(r.interes, moneda)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">Fuentes: PF/UVA/FCI vía ArgentinaDatos. LECAP: letras vía ArgentinaDatos (todas las disponibles). Caución: BYMA vía IOL o PPI (todos los plazos). UVA/CER: tasa real. Fisher exacto.</p>
          </div>
        )}
      </div>
    </div>
  );
}
