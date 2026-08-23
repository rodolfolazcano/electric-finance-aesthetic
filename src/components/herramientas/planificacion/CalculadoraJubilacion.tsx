import { useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calcularJubilacion,
  type JubilacionInput,
  type JubilacionResult,
} from "@/lib/planificacion/jubilacion.functions";
import { calcularInteresCompuesto, fisherReal } from "@/lib/calculadora-financiera.functions";
import { getTasasVivasPlanificacion } from "@/lib/planificacion/tasas-vivas.functions";
import { FieldHelp } from "./FieldHelp";
import { PerfilAfcWizard, usePerfilAfc } from "./PerfilAfcWizard";
import { PLANNED_EVENTS } from "@/lib/analytics";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const defaultInput: JubilacionInput = {
  edadActual: 30,
  edadRetiro: 65,
  ahorroActual: 1000000,
  aporteMensual: 10000,
  tasaRetorno: 8,
  inflacion: 3,
  gastoMensualDeseado: 200000,
};

export function CalculadoraJubilacion({
  metrics,
}: {
  metrics?: { sharpe: number | null; var95: number | null };
} = {}) {
  void calcularInteresCompuesto;
  const fn = useServerFn(calcularJubilacion);
  const tasasFn = useServerFn(getTasasVivasPlanificacion);
  const [perfil] = usePerfilAfc();
  const [tasas, setTasas] = useState<any | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [inputs, setInputs] = useState<JubilacionInput>(defaultInput);
  const [result, setResult] = useState<JubilacionResult | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(()=>{
    tasasFn({} as any).then((t:any)=>{
      setTasas(t);
      // precarga inteligente según perfil (conservador→FCI MM, moderado→PF, arriesgado→LECAP)
      const tFci = t.fciMM?.teaAnual ?? null;
      const tPF = t.mejorPF?.tna ?? null;
      const tLecap = t.lecapTea ?? null;
      const pi = t.inflacionMensual ?? 3;
      let sugerido = 8;
      if (perfil==="conservador") sugerido = tFci != null ? tFci : (tPF ?? 8);
      else if (perfil==="moderado") sugerido = tPF ?? tFci ?? 8;
      else if (perfil==="arriesgado") sugerido = tLecap ?? tPF ?? 8;
      setInputs(p=> ({...p, tasaRetorno: +sugerido.toFixed(1), inflacion: pi != null ? +pi.toFixed(2) : p.inflacion }));
    }).catch(()=>{});
  },[perfil]);

  const handleCalc = async () => {
    setLoading(true);
    const r = await fn({ data: inputs });
    setResult(r);
    setLoading(false);
    PLANNED_EVENTS.calculatorUsed("jubilacion");
  };

  const chartData =
    result?.evolucion.filter((_, i) => i % 2 === 0 || i === result.evolucion.length - 1) ?? [];

  const handleExport = useCallback(async () => {
    PLANNED_EVENTS.calculatorExport("jubilacion");
    const { exportJubilacionXLSX } = await import("@/lib/export/planificacion-export");
    exportJubilacionXLSX(inputs, result!);
  }, [inputs, result]);

  return (
    <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="glass p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="mono text-[14px] uppercase tracking-[0.18em] text-foreground">Parámetros</h3>
          <button onClick={()=>setShowWizard(!showWizard)} className="text-xs border border-border/40 rounded px-2 py-1 hover:bg-muted/20">Perfil: <b className="capitalize">{perfil}</b> — cambiar</button>
        </div>
        {showWizard && <PerfilAfcWizard onClose={()=>setShowWizard(false)} />}
        <div className="text-[11px] text-muted-foreground">Ciclo vital: {inputs.edadActual < 35 ? "Acumulación (≤45) — priorizá crecimiento" : inputs.edadActual < 55 ? "Consolidación (45-65) — mixto" : "Desacumulación (65+) — preservación"} — Horizonte sugerido: {perfil==="conservador"?"corto":perfil==="moderado"?"medio":"largo"}</div>
        <div>
          <FieldHelp label="Edad actual" help="Tu edad hoy. Define horizonte = edadRetiro−edadActual y tu etapa AFC (acumulación/consolidación/retiro)." />
          <Input type="number" value={inputs.edadActual} onChange={(e)=>setInputs(p=>({...p,edadActual:Number(e.target.value)||0}))} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <FieldHelp label="Edad de retiro" help="¿Cuándo querés dejar de aportar? Ej. 65. Horizonte temporal = retiro−actual (AFC: corto ≤1a, medio 1-3a, largo >3a para renta variable)." />
          <Input type="number" value={inputs.edadRetiro} onChange={(e)=>setInputs(p=>({...p,edadRetiro:Number(e.target.value)||0}))} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <FieldHelp label="Ahorro actual ($)" help="Lo que ya tenés invertido hoy. Si es 0, arrancamos de cero. Ej. tu FCI / plazo fijo actual." />
          <Input type="number" value={inputs.ahorroActual} onChange={(e)=>setInputs(p=>({...p,ahorroActual:Number(e.target.value)||0}))} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <FieldHelp label="Aporte mensual ($)" help="Cuánto podés sumar cada mes. Regla AFC: conservador ≤25% ingreso, moderado 25-30%, arriesgado hasta 40% si el horizonte es largo." />
          <Input type="number" value={inputs.aporteMensual} onChange={(e)=>setInputs(p=>({...p,aporteMensual:Number(e.target.value)||0}))} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <FieldHelp label="Retorno esperado (% anual)" help="Rendimiento nominal que esperás. Sugerido según perfil: conservador→FCI MM, moderado→PF, arriesgado→LECAP. Podés editarlo." datoVivo={tasas ? {label: perfil==="conservador" ? `FCI ${tasas.fciMM?.fondo?.slice(0,12) ?? "MM"}` : perfil==="moderado" ? `PF ${tasas.mejorPF?.entidad?.slice(0,12) ?? "banco"}` : `LECAP`, valor: `${(perfil==="conservador"?tasas.fciMM?.teaAnual:perfil==="moderado"?tasas.mejorPF?.tna:tasas.lecapTea) ?? 8}%`} : null} onUsar={()=>{const v = perfil==="conservador"?tasas?.fciMM?.teaAnual:perfil==="moderado"?tasas?.mejorPF?.tna:tasas?.lecapTea; if(v!=null) setInputs(p=>({...p,tasaRetorno:+v.toFixed(1)}));}} />
          <Input type="number" value={inputs.tasaRetorno} onChange={(e)=>setInputs(p=>({...p,tasaRetorno:Number(e.target.value)||0}))} className="h-8 text-xs mt-1" />
          {tasas && <p className="text-[11px] text-muted-foreground mt-1">Tasa real Fisher: {fisherReal(inputs.tasaRetorno, (inputs.inflacion*12)||0).toFixed(2)}% = (1+{inputs.tasaRetorno}%)/(1+{(inputs.inflacion*12).toFixed(1)}%)−1</p>}
        </div>
        <div>
          <FieldHelp label="Inflación esperada (% anual)" help="¿Cuánto creés que suben los precios? Precargamos π mensual viva de ArgentinaDatos. Ej. 8% mensual ≈ 152% anual." datoVivo={tasas?.inflacionMensual!=null?{label:"π mensual viva", valor:`${tasas.inflacionMensual}%`}:null} onUsar={()=>{if(tasas?.inflacionMensual!=null) setInputs(p=>({...p,inflacion:tasas.inflacionMensual!}));}} />
          <Input type="number" value={inputs.inflacion} onChange={(e)=>setInputs(p=>({...p,inflacion:Number(e.target.value)||0}))} className="h-8 text-xs mt-1" />
        </div>
        <div>
          <FieldHelp label="Gasto mensual deseado ($ de hoy)" help="¿Cuánto querés gastar por mes cuando te jubiles, en pesos de hoy? Regla práctica: 70% de tu gasto actual. Ej. si hoy gastás 300k, poné 210k. Lo comparamos con un alquiler promedio como ancla real." />
          <Input type="number" value={inputs.gastoMensualDeseado} onChange={(e)=>setInputs(p=>({...p,gastoMensualDeseado:Number(e.target.value)||0}))} className="h-8 text-xs mt-1" />
          <p className="text-[11px] text-muted-foreground mt-1">Ancla real: alquiler 2amb CABA ~ $450k/mes — tu deseo {inputs.gastoMensualDeseado.toLocaleString()} equivale a {(inputs.gastoMensualDeseado/450000).toFixed(1)}× ese alquiler.</p>
        </div>
        <Button onClick={handleCalc} disabled={loading} className="w-full">
          {loading ? "Calculando…" : "Calcular proyección"}
        </Button>
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Capital proyectado
                </div>
                <div className="mono text-lg text-success">
                  ${result.capitalProyectado.toLocaleString()}
                </div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Capital necesario
                </div>
                <div className="mono text-lg">${result.capitalNecesario.toLocaleString()}</div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Brecha
                </div>
                <div
                  className={`mono text-lg ${result.brecha >= 0 ? "text-success" : "text-danger"}`}
                >
                  {result.brecha >= 0 ? "+" : ""}
                  {result.brecha.toLocaleString()}
                </div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Tasa real
                </div>
                <div className="mono text-lg">{result.tasaReal}%</div>
              </div>
              {/* A4: métricas opcionales de RiesgoPage (solo lectura). Sin datos → ocultar fila. */}
              {metrics?.sharpe != null || metrics?.var95 != null ? (
                <>
                  {metrics?.sharpe != null && (
                    <div className="glass p-4 text-center">
                      <div className="text-[13px] text-muted-foreground uppercase tracking-wider">Sharpe (RiesgoPage)</div>
                      <div className="mono text-lg">{metrics.sharpe.toFixed(2)}</div>
                    </div>
                  )}
                  {metrics?.var95 != null && (
                    <div className="glass p-4 text-center">
                      <div className="text-[13px] text-muted-foreground uppercase tracking-wider">VaR95 (RiesgoPage)</div>
                      <div className="mono text-lg">{(metrics.var95 * 100).toFixed(2)}%</div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
            {/* Comparador 3 perfiles AFC — mismo aporte, distintas tasas vivas */}
            {tasas && (
              <div className="glass p-4">
                <div className="mono mb-2 text-[12px] uppercase tracking-[0.18em] text-muted-foreground">¿Y si cambiás de perfil? (mismo aporte {inputs.aporteMensual.toLocaleString()}/mes)</div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    { label: "Conservador (FCI MM)", t: tasas.fciMM?.teaAnual ?? 60 },
                    { label: "Moderado (PF)", t: tasas.mejorPF?.tna ?? 70 },
                    { label: "Arriesgado (LECAP)", t: tasas.lecapTea ?? 75 },
                  ].map(c=>{
                    const real = fisherReal(c.t, (tasas.inflacionMensual??3)*12);
                    const esActivo = Math.abs(c.t - inputs.tasaRetorno) < 1;
                    return <div key={c.label} className={`rounded border p-2 ${esActivo?"border-primary/40 bg-primary/10":"border-border/30"}`}><div className="text-[11px] text-muted-foreground">{c.label}</div><div className="font-mono text-sm">{c.t.toFixed(1)}% nom · {real.toFixed(1)}% real</div><div className="text-[11px]">{esActivo?"← tu elección":""}</div></div>;
                  })}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">AFC: a mayor horizonte (largo &gt;3a) podés asumir más riesgo; a corto, liquidez (FCI) prima sobre nominal alto. Tu ciclo ({inputs.edadActual<35?"acumulación":inputs.edadActual<55?"consolidación":"retiro"}) sugiere <b>{perfil}</b>.</p>
              </div>
            )}

            <div className="glass p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Evolución del capital
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="jubGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="ano"
                      tick={{ fontSize: 10, fill: "#9aa6bd" }}
                      stroke="#2b3242"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#9aa6bd" }}
                      stroke="#2b3242"
                      tickFormatter={(v: number) => `$${(v / 1000000).toFixed(1)}M`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#141a28",
                        border: "1px solid #2b3242",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [`$${v.toLocaleString()}`, "Capital"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="capital"
                      stroke="#10b981"
                      strokeWidth={2}
                      fill="url(#jubGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" size="sm" className="text-[14px]">
            <svg
              className="mr-1.5 h-3.5 w-3.5"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Descargar modelo (.xlsx)
          </Button>
        </div>
      </div>
    </div>
  );
}
