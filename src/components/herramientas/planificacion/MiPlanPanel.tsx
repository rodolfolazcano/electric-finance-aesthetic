import { useState, useEffect, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FieldHelp } from "./FieldHelp";
import { usePerfilAfc } from "./PerfilAfcWizard";
import { getTasasVivasPlanificacion } from "@/lib/planificacion/tasas-vivas.functions";
import { calcularPlanIntegral } from "@/lib/planificacion/plan-integral.functions";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar } from "recharts";

export function MiPlanPanel() {
  const [perfil] = usePerfilAfc();
  const [edadActual, setEdadActual] = useState(30);
  const [edadRetiro, setEdadRetiro] = useState(65);
  const [ingreso, setIngreso] = useState(800000);
  const [pctAhorro, setPctAhorro] = useState(20);
  const [ahorroActual, setAhorroActual] = useState(1000000);
  const [objetivoMonto, setObjetivoMonto] = useState(50000000);
  const [objetivoMeses, setObjetivoMeses] = useState(120);
  const [alquiler, setAlquiler] = useState(450000);
  const [sena, setSena] = useState(15000000);
  const [reinvierte, setReinvierte] = useState(true);
  const [deuda, setDeuda] = useState(0);
  const [tasas, setTasas] = useState<any | null>(null);
  const tasasFn = useServerFn(getTasasVivasPlanificacion);
  useEffect(()=>{ tasasFn({} as any).then(setTasas as any).catch(()=>{});},[]);
  const pf = tasas?.mejorPF?.tna ?? 70;
  const fci = tasas?.fciMM?.teaAnual ?? 60;
  const lecap = tasas?.lecapTea ?? 75;
  const infl = tasas?.inflacionMensual ?? 2.5;
  const result = useMemo(()=> calcularPlanIntegral({
    edadActual, edadRetiro, ahorroActual, ingresoMensual: ingreso, porcentajeAhorro: pctAhorro,
    objetivoMonto, objetivoMeses, deudaTotal: deuda>0?deuda:null, deudaTasaAnual: null,
    alquilerMensual: alquiler, senaCompra: sena, perfil,
    tasas: { pf, fci, lecap, inflMensual: infl },
    reinvierte
  }), [edadActual, edadRetiro, ingreso, pctAhorro, ahorroActual, objetivoMonto, objetivoMeses, deuda, alquiler, sena, perfil, pf,fci,lecap,infl,reinvierte]);

  const chartData = result.flujoMensual.filter((_,i)=> i%12===0).map(r=> ({ ano: 2025 + Math.floor(r.mes/12), saldo: r.saldo, saldoReal: r.saldoReal }));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <h3 className="text-sm font-semibold">Mi Plan Financiero — un solo formulario, todas las respuestas</h3>
        <p className="text-xs text-muted-foreground mt-1">Completá tus 10 datos una vez. Abajo ves jubilación, crecimiento, objetivo, vivienda y flujo de fondos — todo en vivo con tus tasas reales y tu perfil {perfil}. El toggle reinversión muestra la magia del interés compuesto (Dumrauf) vs cobrar intereses.</p>
      </div>

      <div className="glass p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="mono text-[12px] uppercase tracking-[0.18em]">Tus datos base</h4>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={reinvierte} onChange={e=>setReinvierte(e.target.checked)} /> Reinvertir intereses (compuesto ON)</label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><FieldHelp label="Edad actual" help="Tu edad hoy. Define tu etapa AFC y horizonte (corto ≤1a, medio 1-3a, largo >3a)." /><Input type="number" value={edadActual} onChange={e=>setEdadActual(Number(e.target.value)||0)} className="h-8 text-xs mt-1" /></div>
          <div><FieldHelp label="Edad de retiro" help="¿Cuándo querés dejar de aportar y vivir de rentas? Ej. 65. Horizonte = retiro − actual." /><Input type="number" value={edadRetiro} onChange={e=>setEdadRetiro(Number(e.target.value)||0)} className="h-8 text-xs mt-1" /></div>
          <div><FieldHelp label="Ingreso mensual" help="Lo que entra por mes (sueldo + extras). Base para ahorro y capacidad de cuota." /><Input type="number" value={ingreso} onChange={e=>setIngreso(Number(e.target.value)||0)} className="h-8 text-xs mt-1" /></div>
          <div><FieldHelp label="% que ahorrás" help="Qué % de tu ingreso podés destinar a invertir. Conservador ≤25%, arriesgado hasta 40% con horizonte largo." /><Input type="number" value={pctAhorro} onChange={e=>setPctAhorro(Number(e.target.value)||0)} className="h-8 text-xs mt-1" /><p className="text-[11px] text-muted-foreground">Aporte: ${result.aporteMensual.toLocaleString()}/mes</p></div>
          <div><FieldHelp label="Ahorro ya invertido" help="Tu colchón actual (FCI, PF, dólares). Si es 0 arrancás de cero." /><Input type="number" value={ahorroActual} onChange={e=>setAhorroActual(Number(e.target.value)||0)} className="h-8 text-xs mt-1" /></div>
          <div><FieldHelp label="Objetivo puntual ($)" help="¿Un monto con fecha? Ej. vivienda 50MM en 120 meses. Lo usamos para calcular la cuota extra necesaria." /><Input type="number" value={objetivoMonto} onChange={e=>setObjetivoMonto(Number(e.target.value)||0)} className="h-8 text-xs mt-1" /></div>
          <div><FieldHelp label="Plazo objetivo (meses)" help="¿En cuántos meses querés ese objetivo? Ej. 120 = 10 años." /><Input type="number" value={objetivoMeses} onChange={e=>setObjetivoMeses(Number(e.target.value)||0)} className="h-8 text-xs mt-1" /></div>
          <div><FieldHelp label="Alquiler mensual de referencia" help="¿Cuánto pagás o pagarías de alquiler? Lo comparamos con la cuota hipotecaria + costo oportunidad de la seña al FCI." /><Input type="number" value={alquiler} onChange={e=>setAlquiler(Number(e.target.value)||0)} className="h-8 text-xs mt-1" /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="glass p-4 text-center"><div className="text-[11px] text-muted-foreground uppercase">Capital a retiro (con reinversión)</div><div className="font-mono text-lg text-emerald-400">${(result.valorFuturoConReinversion/1000000).toFixed(1)}M</div><div className="text-[11px] text-muted-foreground">sin reinversión: ${(result.valorFuturoSinReinversion/1000000).toFixed(1)}M</div></div>
        <div className="glass p-4 text-center"><div className="text-[11px] text-muted-foreground uppercase">Brecha jubilación</div><div className={`font-mono text-lg ${result.brechaJubilacion && result.brechaJubilacion.brecha>=0?"text-emerald-400":"text-red-400"}`}>{result.brechaJubilacion ? `${result.brechaJubilacion.brecha>=0?"+":""}${(result.brechaJubilacion.brecha/1000000).toFixed(1)}M` : "—"}</div><div className="text-[11px] text-muted-foreground">necesario ${(result.brechaJubilacion?.capitalNecesario??0/1000000).toFixed(1)}M</div></div>
        <div className="glass p-4 text-center"><div className="text-[11px] text-muted-foreground uppercase">PMT objetivo</div><div className="font-mono text-lg">${result.pmtObjetivo?.toLocaleString() ?? "—"}/mes</div><div className="text-[11px] text-muted-foreground">para {objetivoMonto.toLocaleString()} en {objetivoMeses}m</div></div>
        <div className="glass p-4 text-center"><div className="text-[11px] text-muted-foreground uppercase">Alquilar vs comprar</div><div className="font-mono text-sm">{result.veredictoAlquiler?.comprar ? "Comprar" : "Alquilar"} conviene</div><div className="text-[11px] text-muted-foreground">eq ~{result.veredictoAlquiler?.puntoEquilibrioMeses} meses</div></div>
      </div>

      <div className="glass p-4">
        <div className="mono mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Flujo de fondos — saldo nominal vs real (ajustado inflación {infl}%)</div>
        <div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{top:4,right:4,bottom:0,left:0}}><CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false}/><XAxis dataKey="ano" tick={{fontSize:10,fill:"#9aa6bd"}}/><YAxis tick={{fontSize:10,fill:"#9aa6bd"}} tickFormatter={v=>`$${(v/1000000).toFixed(0)}M`}/><Tooltip contentStyle={{background:"#141a28",border:"1px solid #2b3242",borderRadius:8,fontSize:11}} formatter={(v:number)=>[`$${v.toLocaleString()}`,undefined]} /><Area type="monotone" dataKey="saldo" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Nominal"/><Area type="monotone" dataKey="saldoReal" stroke="#f59e0b" fillOpacity={0} strokeDasharray="4 3" name="Real"/></AreaChart></ResponsiveContainer></div>
        <p className="mt-2 text-[11px] text-muted-foreground">Asignación por perfil {perfil}: PF {(result.asignacion.pf*100).toFixed(0)}% · FCI {(result.asignacion.fci*100).toFixed(0)}% · LECAP {(result.asignacion.lecap*100).toFixed(0)}% (TNA PF {pf.toFixed(1)}% · FCI {fci.toFixed(1)}% · LECAP {lecap.toFixed(1)}% · π {infl}%) — toggle reinversión muestra el poder del compuesto.</p>
      </div>

      <div className="glass p-4 overflow-x-auto">
        <div className="mono mb-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Tabla anual — flujo de fondos</div>
        <table className="w-full text-xs font-mono">
          <thead><tr className="border-b border-border/40 text-muted-foreground"><th className="text-left py-1">Año</th><th className="text-right py-1">Saldo</th><th className="text-right py-1">Saldo real</th><th className="text-right py-1">Intereses</th><th className="text-right py-1">Aporte año</th></tr></thead>
          <tbody>{chartData.slice(0,12).map(r=>(<tr key={r.ano} className="border-b border-border/20"><td className="py-1">{r.ano}</td><td className="text-right">${r.saldo.toLocaleString()}</td><td className="text-right">${r.saldoReal.toLocaleString()}</td><td className="text-right">${(result.flujoMensual.find(f=> f.mes/12=== r.ano-2025)?.intereses ?? 0).toLocaleString()}</td><td className="text-right">${(result.aporteMensual*12).toLocaleString()}</td></tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}
