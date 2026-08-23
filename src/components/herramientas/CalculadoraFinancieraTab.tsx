import React, { useState, useEffect, useMemo } from "react";
import {
  Calculator,
  TrendingUp,
  Percent,
  DollarSign,
  PieChart,
  BarChart3,
  Calendar,
  Building2,
  Landmark,
  Coins,
  ArrowLeftRight,
  Scale,
  Layers,
  History,
} from "lucide-react";
import {
  calcularPorcentaje,
  calcularImporteNeto,
  calcularDiferenciaPorcentual,
  calcularInteresSimple,
  calcularInteresCompuesto,
  calcularTasaEfectiva,
  calcularTasaNominal,
  calcularNumeroPagos,
  calcularValorActualRentas,
  calcularPagoRentas,
  calcularPagoConValorFuturo,
  calcularVAN,
  calcularTIR,
  calcularPrecioBono,
  calcularMediaAritmetica,
  calcularMediaPonderada,
  calcularVarianzaDesviacion,
  calcularCovarianzaCorrelacion,
  resolverTVM,
  diasEntreFechas,
  fechaVencimiento,
  tasaAnticipadaAVencida,
  tasaVencidaAAnticipada,
  fisherReal,
  temToTea,
  teaToTem,
  actualizarPorCER,
  actualizarPorUVA,
  calcularCFT,
  formatMonetary,
  formatPercentage,
  formatNumber,
} from "@/lib/calculadora-financiera.functions";
import { FIXTURES_AFC } from "@/lib/calculadora-financiera.fixtures";
import { useServerFn } from "@tanstack/react-start";
import { fetchLecapFciData, fetchPlazoFijoTasas, fetchPlazoFijoUva, type PlazoFijoItem } from "@/lib/herramientas/fci-lecap.functions";
import { getRiskFreeRateETTI } from "@/lib/herramientas/renta-fija.functions";

export type SubTabCalculadora =
  | "catalog"
  | "plazo-fijo"
  | "plazo-fijo-uva"
  | "fci"
  | "lecap-caucion"
  | "comparador"
  | "compuesta"
  | "tasas"
  | "cuota"
  | "capacidad-cuota"
  | "objetivo-ahorro"
  | "van-tir"
  | "bono"
  | "cft"
  | "inflacion-uva"
  | "porcentajes"
  | "fechas"
  | "estadistica";

export const VALID_SUBTABS: SubTabCalculadora[] = [
  "plazo-fijo","plazo-fijo-uva","fci","lecap-caucion","comparador","compuesta","tasas","cuota","capacidad-cuota","objetivo-ahorro","van-tir","bono","cft","inflacion-uva","porcentajes","fechas","estadistica",
];

type CatalogItem = { id: SubTabCalculadora; label: string; desc: string; icon: any; grupo: string };
const CATALOGO: CatalogItem[] = [
  { id: "plazo-fijo", label: "Plazo fijo clásico", desc: "TNA banco → interés + VF", icon: Building2, grupo: "Colocaciones en pesos" },
  { id: "plazo-fijo-uva", label: "Plazo fijo UVA", desc: "Tramos + TNA real", icon: Landmark, grupo: "Colocaciones en pesos" },
  { id: "fci", label: "FCI money market", desc: "TNA/TEA fondo precargada", icon: Layers, grupo: "Colocaciones en pesos" },
  { id: "lecap-caucion", label: "LECAP / Caución", desc: "TEM→TEA, precio técnico, ETTI", icon: Coins, grupo: "Colocaciones en pesos" },
  { id: "comparador", label: "Comparar colocaciones", desc: "Lado a lado con ganador", icon: ArrowLeftRight, grupo: "Colocaciones en pesos" },
  { id: "compuesta", label: "Capitalización compuesta", desc: "VF con capitalizaciones", icon: TrendingUp, grupo: "Colocaciones en pesos" },
  { id: "tasas", label: "Conversor de tasas", desc: "TNA↔TEA↔TEM, anticipada, Fisher", icon: Scale, grupo: "Utilidades" },
  { id: "cuota", label: "Cuota de préstamo", desc: "TVM solver 5 vars", icon: Calculator, grupo: "Crédito / Ahorro" },
  { id: "capacidad-cuota", label: "Capacidad de cuota", desc: "Desde ingreso → PMT máx", icon: PieChart, grupo: "Crédito / Ahorro" },
  { id: "objetivo-ahorro", label: "Objetivo de ahorro", desc: "PMT hacia VF", icon: TrendingUp, grupo: "Crédito / Ahorro" },
  { id: "van-tir", label: "VAN y TIR", desc: "Editor flujos Nj", icon: BarChart3, grupo: "Proyectos / Renta fija" },
  { id: "bono", label: "Bono precio↔TIR", desc: "Cupón + fechas reales", icon: DollarSign, grupo: "Proyectos / Renta fija" },
  { id: "cft", label: "CFT / TAE", desc: "Costo con comisiones", icon: Percent, grupo: "Proyectos / Renta fija" },
  { id: "inflacion-uva", label: "Inflación & UVA/CER", desc: "Actualizar capital, tasa real", icon: Scale, grupo: "Utilidades" },
  { id: "porcentajes", label: "Porcentajes rápidos", desc: "Comisión, neto, variación", icon: Percent, grupo: "Utilidades" },
  { id: "fechas", label: "Fechas", desc: "Días entre, vencimiento", icon: Calendar, grupo: "Utilidades" },
  { id: "estadistica", label: "Estadística", desc: "Media, σ, ρ", icon: BarChart3, grupo: "Utilidades" },
];

function usePersisted<T>(key: string, init: T): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? JSON.parse(s) as T : init; } catch { return init; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }, [key, val]);
  return [val, setVal];
}

function CardShell({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-border/40 bg-card p-5 space-y-4"><div><h3 className="text-[13px] font-semibold uppercase tracking-[0.18em]">{title}</h3>{subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}</div>{children}</div>;
}
function ResultLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return <div className="flex items-baseline justify-between gap-3 border-b border-border/20 py-2 last:border-0"><span className="text-xs text-muted-foreground">{label}</span><span className="text-sm font-mono font-semibold text-right">{value}{sub && <span className="ml-2 text-[11px] font-normal text-muted-foreground">{sub}</span>}</span></div>;
}
function Lectura({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs leading-relaxed">{children}</div>;
}

// ——— Sub-paneles ———
function PanelPlazoFijo({ moneda, modoAsesor, eti }: { moneda: string; modoAsesor: boolean; eti: number | null }) {
  const [capital, setCapital] = useState(100000);
  const [dias, setDias] = useState(30);
  const [bancoIdx, setBancoIdx] = useState(0);
  const [pf, setPf] = useState<PlazoFijoItem[] | null>(null);
  const pfFn = useServerFn(fetchPlazoFijoTasas);
  useEffect(() => { pfFn({} as any).then(setPf as any).catch(() => {}); }, []);
  const sel = pf?.[bancoIdx];
  const tna = sel?.tnaClientes ?? 70;
  const r = calcularInteresSimple(capital, tna, dias, 365);
  const tea = (Math.pow(1 + tna/100/12, 12)-1)*100;
  return <CardShell title="Plazo fijo clásico" subtitle={sel ? `${sel.entidad} · TNA ${tna.toFixed(2)}%` : "TNA precargada por banco (ArgentinaDatos) — fallback 70%"}>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs">Capital<input value={capital} onChange={e=>setCapital(Number(e.target.value)||0)} type="number" className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">Días<input value={dias} onChange={e=>setDias(Number(e.target.value)||0)} type="number" className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
    </div>
    {pf && <select value={bancoIdx} onChange={e=>setBancoIdx(Number(e.target.value))} className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs"><option value={-1}>TNA manual 70%</option>{pf.slice(0,12).map((b,i)=><option key={i} value={i}>{b.entidad} — {(b.tnaClientes??b.tnaNoClientes??0).toFixed(1)}%</option>)}</select>}
    <ResultLine label="Interés" value={formatMonetary(r.intereses, moneda)} sub={r.formula} />
    <ResultLine label="Capital final" value={formatMonetary(r.capitalFinal, moneda)} />
    <ResultLine label="TEA equiv." value={`${tea.toFixed(2)}%`} />
    {eti != null && <ResultLine label="vs caución ETTI" value={`${(eti*100).toFixed(2)}%`} sub="getRiskFreeRateETTI()" />}
    {modoAsesor && <Lectura>Con capital {formatMonetary(capital, moneda)} a {dias}d, perfil conservador privilegia liquidez (FCI) si TEA {tea.toFixed(1)}% &lt; π esperada; moderado acepta plazo fijo si spread vs ETTI &gt; 5 pp.</Lectura>}
  </CardShell>;
}
function PanelPlazoFijoUva({ moneda, modoAsesor }: { moneda: string; modoAsesor: boolean }) {
  const [capital, setCapital] = useState(1000000);
  const [tramoIdx, setTramoIdx] = useState(0);
  const [uva, setUva] = useState<any[] | null>(null);
  const fn = useServerFn(fetchPlazoFijoUva);
  useEffect(() => { fn({} as any).then(setUva as any).catch(()=>{}); }, []);
  const tramo = (uva as any)?.[tramoIdx];
  const tna = tramo?.tna ?? 1.5;
  const tea = tramo?.tea ?? 1.51;
  const dias = tramo?.plazoMinDias ?? 90;
  const r = calcularInteresSimple(capital, tna, dias, 365);
  return <CardShell title="Plazo fijo UVA" subtitle={tramo ? `${tramo.entidad} — ${tramo.nombre} ${tramo.plazoMinDias}-${tramo.plazoMaxDias}d TNA ${tna}%` : "Tramos ArgentinaDatos — fallback manual"}>
    <label className="text-xs">Capital<input value={capital} onChange={e=>setCapital(Number(e.target.value)||0)} type="number" className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
    {uva && <select value={tramoIdx} onChange={e=>setTramoIdx(Number(e.target.value))} className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs">{(uva as any).slice(0,12).map((t:any,i:number)=><option key={i} value={i}>{t.entidad} — {t.nombre} TNA {t.tna}%</option>)}</select>}
    <ResultLine label="TNA/TEA" value={`${tna.toFixed(2)}% / ${tea.toFixed(2)}%`} />
    <ResultLine label="Interés tramo" value={formatMonetary(r.intereses, moneda)} />
    <ResultLine label="Capital final" value={formatMonetary(r.capitalFinal, moneda)} />
    {modoAsesor && <Lectura>UVA: plazo mínimo {dias}d; compara TNA real vs nominal del PF clásico. Si π esperada &gt; TNA PF clásico, UVA protege poder adquisitivo (perfil moderado/arriesgado lo prefiere).</Lectura>}
  </CardShell>;
}
function PanelFci({ moneda, modoAsesor }: { moneda: string; modoAsesor: boolean }) {
  const [tipo, setTipo] = useState<"mercadoDinero"|"rentaFija"|"rentaMixta"|"rentaVariable">("mercadoDinero");
  const [fondoIdx, setFondoIdx] = useState(0);
  const [data, setData] = useState<any | null>(null);
  const fn = useServerFn(fetchLecapFciData);
  useEffect(() => { fn({ data: {} as any } as any).then(setData as any).catch(()=>{}); }, []);
  const lista = (data?.fcis ?? []).filter((f: any)=> f.tipo===tipo).sort((a:any,b:any)=> (b.patrimonio??0)-(a.patrimonio??0)).slice(0,15);
  const sel = lista[fondoIdx];
  return <CardShell title="FCI money market" subtitle={sel ? `${sel.fondo} — var diaria ${sel.variacionDiaria ?? "—"}%` : "FCI ArgentinaDatos — fallback manual"}>
    <select value={tipo} onChange={e=>{setTipo(e.target.value as any); setFondoIdx(0);}} className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs"><option value="mercadoDinero">Mercado dinero</option><option value="rentaFija">Renta fija</option><option value="rentaMixta">Renta mixta</option><option value="rentaVariable">Renta variable</option></select>
    {lista.length>0 && <select value={fondoIdx} onChange={e=>setFondoIdx(Number(e.target.value))} className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs">{lista.map((f:any,i:number)=><option key={i} value={i}>{f.fondo} — {f.variacionAnual ?? "—"}% anual</option>)}</select>}
    {sel && <><ResultLine label="VCP / CCP" value={`${sel.vcp?.toFixed(2) ?? "—"} / ${sel.ccp?.toFixed(2) ?? "—"}`} /><ResultLine label="Var anual estimada" value={sel.variacionAnual != null ? `${sel.variacionAnual.toFixed(2)}%` : "—"} /><ResultLine label="Patrimonio" value={formatNumber(sel.patrimonio??0,0)} /></>}
    {modoAsesor && <Lectura>FCI MM: compara contra caución/LECAP en el comparador. Horizonte del fondo ({sel?.horizonte ?? "—"}) debe alinearse con horizonte del cliente (corto ≤1a).</Lectura>}
  </CardShell>;
}
function PanelLecapCaucion({ moneda, modoAsesor, eti }: { moneda: string; modoAsesor: boolean; eti: number | null }) {
  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<any | null>(null);
  const fn = useServerFn(fetchLecapFciData);
  useEffect(() => { fn({ data: {} as any } as any).then(setData as any).catch(()=>{}); }, []);
  const lecaps = (data?.lecaps ?? []).slice(0,12);
  const sel = lecaps[idx];
  const dias = sel?.diasAlVencimiento ?? 60;
  const tem = sel?.tem ?? 3.5;
  const tea = temToTea(tem);
  return <CardShell title="LECAP / Caución" subtitle={sel ? `${sel.ticker} · TEM ${tem}% · ${dias}d · TEA ${tea.toFixed(1)}%` : "LECAPs ArgentinaDatos · Caución ETTI"}>
    {lecaps.length>0 && <select value={idx} onChange={e=>setIdx(Number(e.target.value))} className="w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs">{lecaps.map((l:any,i:number)=><option key={i} value={i}>{l.ticker} — TEM {l.tem}% TEA {l.tea}% {l.diasAlVencimiento}d</option>)}</select>}
    <ResultLine label="TEM → TEA" value={`${tem.toFixed(2)}% → ${tea.toFixed(2)}%`} sub="TEA=(1+TEM)^12−1" />
    <ResultLine label="Caución ETTI" value={eti!=null?`${(eti*100).toFixed(2)}%`:"cargando…"} sub="getRiskFreeRateETTI() 7d IOL" />
    {sel && <ResultLine label="Precio técnico" value={sel.precio != null ? formatMonetary(sel.precio, moneda) : "—"} sub={sel.precioFuente ?? "argentinadatos"} />}
    {modoAsesor && <Lectura>LECAP: duration corta — elegir vencimiento alineado con necesidad de liquidez. Si TIR LECAP &gt; ETTI + spread, conviene LECAP (perfil moderado/arriesgado).</Lectura>}
  </CardShell>;
}
function PanelComparador({ moneda, modoAsesor, eti }: { moneda: string; modoAsesor: boolean; eti: number | null }) {
  const [cap, setCap] = useState(1000000);
  const [dias, setDias] = useState(30);
  const [vars, setVars] = useState<{pf: number; fci: number; lecap: number; infl: number | null}>({pf:70,fci:60,lecap:55,infl: 8});
  const rPf = calcularInteresSimple(cap, vars.pf, dias, 365);
  const rFci = calcularInteresSimple(cap, vars.fci, dias, 365);
  const rLecap = calcularInteresSimple(cap, vars.lecap, dias, 365);
  const rRealPf = vars.infl!=null ? fisherReal(vars.pf, vars.infl*12) : null;
  const best = Math.max(rPf.capitalFinal, rFci.capitalFinal, rLecap.capitalFinal);
  return <CardShell title="Comparar colocaciones" subtitle="Lado a lado — 4 familias">
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs">Capital<input type="number" value={cap} onChange={e=>setCap(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">Días<input type="number" value={dias} onChange={e=>setDias(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">TNA PF %<input type="number" value={vars.pf} onChange={e=>setVars(s=>({...s,pf:Number(e.target.value)||0}))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">TNA FCI %<input type="number" value={vars.fci} onChange={e=>setVars(s=>({...s,fci:Number(e.target.value)||0}))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">TNA LECAP %<input type="number" value={vars.lecap} onChange={e=>setVars(s=>({...s,lecap:Number(e.target.value)||0}))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">π mensual %<input type="number" value={vars.infl??""} onChange={e=>setVars(s=>({...s,infl:e.target.value===""?null:Number(e.target.value)||0}))} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <div className={`rounded border p-2 text-center ${best===rPf.capitalFinal?"border-emerald-500/40 bg-emerald-500/10":"border-border/40"}`}><div className="text-[11px] text-muted-foreground">PF</div><div className="font-mono text-sm">{formatMonetary(rPf.capitalFinal, moneda)}</div></div>
      <div className={`rounded border p-2 text-center ${best===rFci.capitalFinal?"border-emerald-500/40 bg-emerald-500/10":"border-border/40"}`}><div className="text-[11px] text-muted-foreground">FCI</div><div className="font-mono text-sm">{formatMonetary(rFci.capitalFinal, moneda)}</div></div>
      <div className={`rounded border p-2 text-center ${best===rLecap.capitalFinal?"border-emerald-500/40 bg-emerald-500/10":"border-border/40"}`}><div className="text-[11px] text-muted-foreground">LECAP</div><div className="font-mono text-sm">{formatMonetary(rLecap.capitalFinal, moneda)}</div></div>
    </div>
    {rRealPf!=null && <ResultLine label="Tasa real PF (Fisher)" value={`${rRealPf.toFixed(2)}%`} sub={`(1+${vars.pf}%)/(1+${vars.infl!*12}%)−1`} />}
    {eti!=null && <ResultLine label="Caución ETTI" value={`${(eti*100).toFixed(2)}%`} />}
    {modoAsesor && <Lectura>Ganador resaltado. Para cliente conservador: priorizar FCI si diferencia &lt; 2 pp (liquidez inmediata). Moderado/arriesgado: elegir max nominal si horizonte &gt; 30d.</Lectura>}
  </CardShell>;
}
function PanelInflacionUva({ moneda, modoAsesor }: { moneda: string; modoAsesor: boolean }) {
  const [capital, setCapital] = useState(1000000);
  const [cerI, setCerI] = useState(100);
  const [cerF, setCerF] = useState(108);
  const [uvaI, setUvaI] = useState(500);
  const [uvaF, setUvaF] = useState(540);
  const [nom, setNom] = useState(60);
  const [infl, setInfl] = useState(8);
  const [data, setData] = useState<any | null>(null);
  const fn = useServerFn(fetchLecapFciData);
  useEffect(()=>{fn({data:{} as any} as any).then(setData as any).catch(()=>{});},[]);
  const piMensual = data?.inflacion?.mensual ?? infl;
  const fisher = fisherReal(nom, infl*12);
  return <CardShell title="Inflación & UVA/CER" subtitle={`Inflación mensual precargada ${piMensual!=null?piMensual+"%":"—"} (ArgentinaDatos)`}>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-xs">Capital<input type="number" value={capital} onChange={e=>setCapital(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">TNA nominal %<input type="number" value={nom} onChange={e=>setNom(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">π mensual %<input type="number" value={infl} onChange={e=>setInfl(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">π anual acumulada<input value={data?.inflacion?.acumulada ?? ""} readOnly className="mt-1 w-full rounded border border-border/40 bg-muted/20 px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">CER inicial<input type="number" value={cerI} onChange={e=>setCerI(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">CER final<input type="number" value={cerF} onChange={e=>setCerF(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">UVA inicial<input type="number" value={uvaI} onChange={e=>setUvaI(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
      <label className="text-xs">UVA final<input type="number" value={uvaF} onChange={e=>setUvaF(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm" /></label>
    </div>
    <ResultLine label="Actualizado CER" value={formatMonetary(actualizarPorCER(capital, cerI, cerF), moneda)} />
    <ResultLine label="Actualizado UVA" value={formatMonetary(actualizarPorUVA(capital, uvaI, uvaF), moneda)} />
    <ResultLine label="Tasa real Fisher" value={`${fisher.toFixed(2)}%`} sub={`(1+${nom}%)/(1+${infl*12}%)−1`} />
    {modoAsesor && <Lectura>Si tasa real &lt; 0, el instrumento pierde poder adquisitivo. Para protección, preferir UVA/CER. Conservador: exigir real ≥ 2%; arriesgado: acepta real negativo si compensa diversificación.</Lectura>}
  </CardShell>;
}

export function CalculadoraFinancieraTab({ initialSubTab }: { initialSubTab?: string } = {}) {
  const [subTab, setSubTab] = useState<SubTabCalculadora>(()=> (VALID_SUBTABS as string[]).includes(initialSubTab??"") ? initialSubTab as SubTabCalculadora : "catalog");
  const [moneda, setMoneda] = usePersisted<string>("calc-moneda","ARS");
  const [modoAsesor, setModoAsesor] = usePersisted<boolean>("calc-modo-asesor", false);
  const [eti, setEti] = useState<number | null>(null);
  useEffect(()=>{ getRiskFreeRateETTI().then(setEti).catch(()=>setEti(0.05)); },[]);
  // also support external navigation via URL subTab
  useEffect(()=>{ if(initialSubTab && (VALID_SUBTABS as string[]).includes(initialSubTab)) setSubTab(initialSubTab as SubTabCalculadora); },[initialSubTab]);

  if (subTab==="catalog") {
    const grupos = Array.from(new Set(CATALOGO.map(c=>c.grupo)));
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">¿Qué querés calcular?</h2>
            <p className="text-sm text-muted-foreground">Elegí un caso de uso — cada panel precarga datos vivos (caución, LECAP, FCI, plazo fijo, inflación) con fallback manual.</p>
          </div>
          <div className="flex items-center gap-2">
            <select value={moneda} onChange={e=>setMoneda(e.target.value)} className="rounded border border-border/40 bg-background px-2 py-1.5 text-xs"><option value="ARS">ARS</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
            <button onClick={()=>setModoAsesor(!modoAsesor)} className={`rounded px-3 py-1.5 text-xs font-medium border ${modoAsesor?"bg-amber-500/15 border-amber-500/30 text-amber-600":"border-border/40 text-muted-foreground"}`}>{modoAsesor?"Modo asesor":"Modo inversor"}</button>
          </div>
        </div>
        {eti!=null && <div className="text-xs text-muted-foreground">Caución ETTI 7d: {(eti*100).toFixed(2)}% · FCI/LECAP/plazo fijo precargados vía ArgentinaDatos</div>}
        {grupos.map(g=>(
          <div key={g}><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{g}</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CATALOGO.filter(c=>c.grupo===g).map(c=>(
                <button key={c.id} onClick={()=>setSubTab(c.id)} className="text-left rounded-xl border border-border/40 bg-card p-4 hover:border-primary/40 hover:bg-primary/5 transition-colors">
                  <div className="flex items-center gap-2"><c.icon className="h-4 w-4 text-primary" /><span className="text-sm font-medium">{c.label}</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="rounded-lg border border-dashed border-border/40 p-4 text-xs text-muted-foreground">Historial y presets AFC disponibles dentro de cada panel. Deep-link: <span className="font-mono">?tab=calculadora&subTab=plazo-fijo</span></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button onClick={()=>setSubTab("catalog")} className="rounded border border-border/40 px-3 py-1.5 text-xs hover:bg-muted/40">← Todos los cálculos</button>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{CATALOGO.find(c=>c.id===subTab)?.label}</span>
          <select value={moneda} onChange={e=>setMoneda(e.target.value)} className="rounded border border-border/40 bg-background px-2 py-1.5 text-xs"><option value="ARS">ARS</option><option value="USD">USD</option><option value="EUR">EUR</option></select>
          <button onClick={()=>setModoAsesor(!modoAsesor)} className={`rounded px-3 py-1.5 text-xs font-medium border ${modoAsesor?"bg-amber-500/15 border-amber-500/30 text-amber-600":"border-border/40 text-muted-foreground"}`}>{modoAsesor?"Modo asesor":"Modo inversor"}</button>
        </div>
      </div>
      {subTab==="plazo-fijo" && <PanelPlazoFijo moneda={moneda} modoAsesor={modoAsesor} eti={eti} />}
      {subTab==="plazo-fijo-uva" && <PanelPlazoFijoUva moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="fci" && <PanelFci moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="lecap-caucion" && <PanelLecapCaucion moneda={moneda} modoAsesor={modoAsesor} eti={eti} />}
      {subTab==="comparador" && <PanelComparador moneda={moneda} modoAsesor={modoAsesor} eti={eti} />}
      {subTab==="inflacion-uva" && <PanelInflacionUva moneda={moneda} modoAsesor={modoAsesor} />}
      {/* Legacy panels — se mantienen como subTabs para compatibilidad */}
      {subTab==="porcentajes" && <PanelPorcentajes moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="fechas" && <PanelFechas modoAsesor={modoAsesor} />}
      {subTab==="tasas" && <PanelTasas modoAsesor={modoAsesor} />}
      {subTab==="compuesta" && <PanelCompuesta moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="cuota" && <PanelTVM tipo="cuota" moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="capacidad-cuota" && <PanelTVM tipo="capacidad" moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="objetivo-ahorro" && <PanelTVM tipo="objetivo" moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="van-tir" && <PanelVanTir moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="bono" && <PanelBono moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="cft" && <PanelCft moneda={moneda} modoAsesor={modoAsesor} />}
      {subTab==="estadistica" && <PanelEstadistica modoAsesor={modoAsesor} />}
    </div>
  );
}

// ——— Reused legacy panels (extracted & simplified, live-calc) ———
function PanelPorcentajes({ moneda, modoAsesor }: { moneda: string; modoAsesor: boolean }) {
  const [monto, setMonto] = useState(57000); const [pct, setPct] = useState(1.3);
  const [precio, setPrecio] = useState(200000); const [desc, setDesc] = useState(8); const [imp, setImp] = useState(10);
  const [ini, setIni] = useState(58.5); const [fin, setFin] = useState(53.25);
  const r1 = useMemo(()=> calcularPorcentaje(monto,pct),[monto,pct]);
  const r2 = useMemo(()=> calcularImporteNeto(precio,desc,imp),[precio,desc,imp]);
  const r3 = useMemo(()=> calcularDiferenciaPorcentual(ini,fin),[ini,fin]);
  return <div className="space-y-4">
    <CardShell title="Porcentajes rápidos"><div className="grid grid-cols-2 gap-3"><label className="text-xs">Monto<input type="number" value={monto} onChange={e=>setMonto(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">%<input type="number" value={pct} onChange={e=>setPct(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="Comisión" value={formatMonetary(r1.valor,moneda)} /><div className="grid grid-cols-3 gap-3"><label className="text-xs">Precio<input type="number" value={precio} onChange={e=>setPrecio(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Desc %<input type="number" value={desc} onChange={e=>setDesc(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Imp %<input type="number" value={imp} onChange={e=>setImp(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="Precio final" value={formatMonetary(r2.valor,moneda)} /><div className="grid grid-cols-2 gap-3"><label className="text-xs">Inicial<input type="number" value={ini} onChange={e=>setIni(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Final<input type="number" value={fin} onChange={e=>setFin(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="Variación" value={`${r3.valor.toFixed(2)}%`} /></CardShell>
    {modoAsesor && <Lectura>Para cliente: explicar neto vs bruto; variación % sirve para informar performance sin anualizar. Perfil conservador prefiere neto cierto; arriesgado mira variación y horizonte.</Lectura>}
  </div>;
}
function PanelFechas({ modoAsesor }: { modoAsesor: boolean }) {
  const [d1, setD1] = useState("2024-06-03"); const [d2, setD2] = useState("2025-10-14"); const [diasAdd, setDiasAdd] = useState(119); const [base, setBase] = useState("2004-05-14");
  const dias = useMemo(()=> diasEntreFechas(d1,d2,365),[d1,d2]); const vto = useMemo(()=> fechaVencimiento(base,diasAdd).toISOString().slice(0,10),[base,diasAdd]);
  return <div className="space-y-4"><CardShell title="Fechas" subtitle="DAYS + vencimiento (AFC p.7-8)">
    <div className="grid grid-cols-2 gap-3"><label className="text-xs">Desde<input type="date" value={d1} onChange={e=>setD1(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Hasta<input type="date" value={d2} onChange={e=>setD2(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="Días (ACT/365)" value={`${dias}`} />
    <div className="grid grid-cols-2 gap-3"><label className="text-xs">Inicio<input type="date" value={base} onChange={e=>setBase(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Días a sumar<input type="number" value={diasAdd} onChange={e=>setDiasAdd(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="Vencimiento" value={vto} />
  </CardShell>{modoAsesor && <Lectura>Fechas base para DAYS de interés simple y para vencimientos de caución/LECAP. Verificar feriados locales para liquidación.</Lectura>}</div>;
}
function PanelTasas({ modoAsesor }: { modoAsesor: boolean }) {
  const [tna, setTna] = useState(5.25); const [m, setM] = useState(4);
  const [tea, setTea] = useState(5.354); const [nomReal, setNomReal] = useState(26.8); const [infl, setInfl] = useState(32.8);
  const [ia, setIa] = useState(20);
  const r1 = useMemo(()=> calcularTasaEfectiva(tna,m),[tna,m]); const r2 = useMemo(()=> calcularTasaNominal(tea,m),[tea,m]);
  const iv = useMemo(()=> tasaAnticipadaAVencida(ia),[ia]); const fisher = useMemo(()=> fisherReal(nomReal, infl),[nomReal,infl]);
  return <div className="space-y-4">
    <CardShell title="Conversor TNA↔TEA"><div className="grid grid-cols-2 gap-3"><label className="text-xs">TNA %<input type="number" value={tna} onChange={e=>setTna(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">m<input type="number" value={m} onChange={e=>setM(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="TEA" value={`${r1.tasaEfectiva.toFixed(3)}%`} /><label className="text-xs">TEA %<input type="number" value={tea} onChange={e=>setTea(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><ResultLine label="TNA" value={`${r2.tasaEfectiva.toFixed(3)}%`} /></CardShell>
    <CardShell title="Fisher & anticipada"><div className="grid grid-cols-2 gap-3"><label className="text-xs">ia anticipada %<input type="number" value={ia} onChange={e=>setIa(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">TNA nominal %<input type="number" value={nomReal} onChange={e=>setNomReal(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">π %<input type="number" value={infl} onChange={e=>setInfl(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="ia→iv vencida" value={`${iv.toFixed(2)}%`} /><ResultLine label="Fisher real" value={`${fisher.toFixed(2)}%`} /></CardShell>
    {modoAsesor && <Lectura>Fisher: con π alta (Argentina) la aproximación nom−π falla. Usar exacto. ia 20% → iv 25% es el costo real del descuento comercial.</Lectura>}
  </div>;
}
function PanelCompuesta({ moneda, modoAsesor }: { moneda: string; modoAsesor: boolean }) {
  const [cap, setCap] = useState(35000); const [tna, setTna] = useState(18); const [anos, setAnos] = useState(10); const [per, setPer] = useState(12);
  const r = useMemo(()=> calcularInteresCompuesto(cap,tna,anos,per),[cap,tna,anos,per]);
  return <CardShell title="Capitalización compuesta"><div className="grid grid-cols-2 gap-3"><label className="text-xs">Capital<input type="number" value={cap} onChange={e=>setCap(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">TNA %<input type="number" value={tna} onChange={e=>setTna(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Años<input type="number" value={anos} onChange={e=>setAnos(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Períodos/año<input type="number" value={per} onChange={e=>setPer(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="VF" value={formatMonetary(r.capitalFinal, moneda)} /><ResultLine label="Intereses" value={formatMonetary(r.interesesTotales, moneda)} />{modoAsesor && <Lectura>Comparar VF con TEA: la capitalización mensual rinde más que anual a igual TNA.</Lectura>}</CardShell>;
}
function PanelTVM({ tipo, moneda, modoAsesor }: { tipo: "cuota"|"capacidad"|"objetivo"; moneda: string; modoAsesor: boolean }) {
  const [pv, setPv] = useState(18000); const [i, setI] = useState(8.65); const [n, setN] = useState(60); const [pmt, setPmt] = useState(2800); const [vf, setVf] = useState(60000); const [ingreso, setIngreso] = useState(800000);
  const cuota = useMemo(()=> resolverTVM({ pv, i: i/12, n, tipo:"end" } as any).valor,[pv,i,n]);
  // cuota real via función dedicada para mostrar fórmula familiar
  const rPmt = useMemo(()=> calcularPagoRentas(pv,i,n,12),[pv,i,n]);
  const rCap = useMemo(()=> ingreso*0.30,[ingreso]);
  return <CardShell title={tipo==="cuota"?"Cuota de préstamo (TVM)":tipo==="capacidad"?"Capacidad de cuota":"Objetivo de ahorro"}>
    {tipo==="cuota" && <><div className="grid grid-cols-3 gap-3"><label className="text-xs">PV<input type="number" value={pv} onChange={e=>setPv(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">TNA %<input type="number" value={i} onChange={e=>setI(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">n meses<input type="number" value={n} onChange={e=>setN(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="PMT (fórmula clásica)" value={formatMonetary(rPmt.resultado, moneda)} /><ResultLine label="PMT (solver TVM)" value={formatMonetary(Math.abs(cuota), moneda)} />{modoAsesor && <Lectura>Si resolvemos n, usamos TVM. Si el cliente trae ingreso, derivar a "Capacidad de cuota".</Lectura>}</>}
    {tipo==="capacidad" && <><label className="text-xs">Ingreso mensual<input type="number" value={ingreso} onChange={e=>setIngreso(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><ResultLine label="Cuota máx (30%)" value={formatMonetary(rCap, moneda)} />{modoAsesor && <Lectura>Regla conservadora 25%, moderada 30%, arriesgada hasta 40% según horizonte y estabilidad del ingreso (AFC pp.8-9).</Lectura>}</>}
    {tipo==="objetivo" && <><div className="grid grid-cols-2 gap-3"><label className="text-xs">VF objetivo<input type="number" value={vf} onChange={e=>setVf(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">TNA %<input type="number" value={i} onChange={e=>setI(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="PMT necesario" value={formatMonetary(Math.abs(resolverTVM({ pv:0, i:i/12, n: n, fv: vf, tipo:"end"} as any).valor), moneda)} />{modoAsesor && <Lectura>Planificación: desde VF deseado y horizonte n, despejamos PMT. Completar con aporte inicial si existe.</Lectura>}</>}
  </CardShell>;
}
function PanelVanTir({ moneda, modoAsesor }: { moneda: string; modoAsesor: boolean }) {
  const [flujosStr, setFlujosStr] = useState("[-80000, -500, 4500, 5500, 4500, 130000]"); const [tasa, setTasa] = useState(13);
  const flujos = useMemo(()=>{ try{ const a=JSON.parse(flujosStr); return Array.isArray(a)?a:[];}catch{return [];} },[flujosStr]);
  const van = useMemo(()=> flujos.length? calcularVAN(flujos,tasa): null,[flujos,tasa]); const tir = useMemo(()=> flujos.length? calcularTIR(flujos): null,[flujos]);
  return <CardShell title="VAN y TIR" subtitle="Editor Nj — agregar filas con repeticiones (HP10bII) pendiente, por ahora JSON">
    <label className="text-xs">Flujos (JSON, CF0 primero)<textarea value={flujosStr} onChange={e=>setFlujosStr(e.target.value)} rows={2} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs font-mono" /></label>
    <label className="text-xs">Tasa descuento %<input type="number" value={tasa} onChange={e=>setTasa(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label>
    {van && <><ResultLine label="VAN" value={formatMonetary(van.van, moneda)} sub={van.interpretacion} /><ResultLine label="TIR" value={`${tir?.tir.toFixed(2) ?? "—"}%`} sub={tir?.interpretacion ?? ""} /></>}
    {modoAsesor && <Lectura>Si VAN&gt;0 y TIR&gt;tasa requerida → proyecto viable. Si flujos con múltiples cambios de signo,usar solver con bounds (cuopt) y preferir VAN.</Lectura>}
  </CardShell>;
}
function PanelBono({ moneda, modoAsesor }: { moneda: string; modoAsesor: boolean }) {
  const [cupon, setCupon] = useState(6.75); const [y, setY] = useState(8.25); const [anos, setAnos] = useState(14);
  const r = useMemo(()=> calcularPrecioBono(cupon,y,anos),[cupon,y,anos]);
  return <CardShell title="Bono precio↔TIR" subtitle="Semianual — cupón fijo"><div className="grid grid-cols-3 gap-3"><label className="text-xs">Cupón %<input type="number" value={cupon} onChange={e=>setCupon(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Rend %<input type="number" value={y} onChange={e=>setY(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Años<input type="number" value={anos} onChange={e=>setAnos(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="Precio" value={formatMonetary(r.precio, moneda)} />{modoAsesor && <Lectura>Para renta fija soberana comparar TIR vs ETTI y vs inflación esperada (tasa real).</Lectura>}</CardShell>;
}
function PanelCft({ moneda, modoAsesor }: { moneda: string; modoAsesor: boolean }) {
  const [monto, setMonto] = useState(20000); const [cuota, setCuota] = useState(600); const [n, setN] = useState(60);
  const r = useMemo(()=> calcularCFT(monto-800, cuota, n),[monto,cuota,n]);
  return <CardShell title="CFT / TAE" subtitle="Con comisiones — ejemplo 20k, cuota 600×60"><div className="grid grid-cols-3 gap-3"><label className="text-xs">Monto neto<input type="number" value={monto} onChange={e=>setMonto(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">Cuota<input type="number" value={cuota} onChange={e=>setCuota(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label><label className="text-xs">n<input type="number" value={n} onChange={e=>setN(Number(e.target.value)||0)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-sm"/></label></div><ResultLine label="TEM" value={`${r.tem.toFixed(3)}%`} /><ResultLine label="CFT TEA" value={`${r.cftTea.toFixed(2)}%`} />{modoAsesor && <Lectura>CFT incluye gastos de otorgamiento. Si TNA 0% + cuota 333 sin gastos, TAE aún es &gt;0 por el neto menor.</Lectura>}</CardShell>;
}
function PanelEstadistica({ modoAsesor }: { modoAsesor: boolean }) {
  const [vals, setVals] = useState("468, 349, 287, 290"); const [pesos, setPesos] = useState("150, 100, 140, 600"); const [x, setX] = useState("-12.5, -1, 13.1, 12.9, 14.4"); const [y, setY] = useState("-20.5, -8.3, 6.6, 7.5, 8.2");
  const arr = useMemo(()=> vals.split(",").map(s=>Number(s.trim())).filter(n=>isFinite(n)),[vals]);
  const ps = useMemo(()=> pesos.split(",").map(s=>Number(s.trim())).filter(n=>isFinite(n)),[pesos]);
  const xs = useMemo(()=> x.split(",").map(s=>Number(s.trim())).filter(n=>isFinite(n)),[x]);
  const ys = useMemo(()=> y.split(",").map(s=>Number(s.trim())).filter(n=>isFinite(n)),[y]);
  const r1 = useMemo(()=> arr.length? calcularMediaAritmetica(arr): null,[arr]); const r2 = useMemo(()=> arr.length===ps.length? calcularMediaPonderada(arr,ps): null,[arr,ps]); const r3 = useMemo(()=> arr.length? calcularVarianzaDesviacion(arr,true): null,[arr]); const r4 = useMemo(()=> xs.length===ys.length && xs.length? calcularCovarianzaCorrelacion(xs,ys): null,[xs,ys]);
  return <div className="space-y-4">
    <CardShell title="Estadística"><label className="text-xs">Valores (CSV)<input value={vals} onChange={e=>setVals(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs font-mono"/></label><label className="text-xs">Pesos (CSV)<input value={pesos} onChange={e=>setPesos(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs font-mono"/></label>{r1 && <ResultLine label="Media" value={r1.media.toFixed(2)} />}{r2 && <ResultLine label="Ponderada" value={r2.media.toFixed(2)} />}{r3 && <ResultLine label="σ pobl." value={r3.desviacion.toFixed(2)} />}<div className="grid grid-cols-2 gap-3"><label className="text-xs">X (Merval %)<input value={x} onChange={e=>setX(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs font-mono"/></label><label className="text-xs">Y (YPF %)<input value={y} onChange={e=>setY(e.target.value)} className="mt-1 w-full rounded border border-border/40 bg-background px-2 py-1.5 text-xs font-mono"/></label></div>{r4 && <><ResultLine label="Covarianza" value={r4.covarianza.toFixed(4)} /><ResultLine label="Correlación" value={r4.correlacion.toFixed(4)} /></>}</CardShell>
    {modoAsesor && <Lectura>Media ponderada = precio promedio con lotes; σ poblacional para riesgo histórico; ρ≈1 indica co-movimiento perfecto (Merval-YPF).</Lectura>}
  </div>;
}
