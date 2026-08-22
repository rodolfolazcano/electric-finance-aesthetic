import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { calcularJubilacion, type JubilacionInput, type JubilacionResult } from "@/lib/planificacion/jubilacion.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";
import { ContactCTA } from "./ContactCTA";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const defaultInput: JubilacionInput = {
  edadActual: 30,
  edadRetiro: 65,
  ahorroActual: 1000000,
  aporteMensual: 10000,
  tasaRetorno: 8,
  inflacion: 3,
  gastoMensualDeseado: 200000,
};

export function CalculadoraJubilacion() {
  const fn = useServerFn(calcularJubilacion);
  const [inputs, setInputs] = useState<JubilacionInput>(defaultInput);
  const [result, setResult] = useState<JubilacionResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalc = async () => {
    setLoading(true);
    const r = await fn({ data: inputs });
    setResult(r);
    setLoading(false);
    PLANNED_EVENTS.calculatorUsed("jubilacion");
  };

  const chartData = result?.evolucion.filter((_, i) => i % 2 === 0 || i === result.evolucion.length - 1) ?? [];

  const handleExport = useCallback(async () => {
    PLANNED_EVENTS.calculatorExport("jubilacion");
    const { exportJubilacionXLSX } = await import("@/lib/export/planificacion-export");
    exportJubilacionXLSX(inputs, result!);
  }, [inputs, result]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="glass p-5 space-y-4">
        <h3 className="mono text-[11px] uppercase tracking-[0.18em] text-foreground">Parámetros</h3>
        {Object.entries(defaultInput).map(([key, _]) => {
          const labelMap: Record<string, string> = {
            edadActual: "Edad actual", edadRetiro: "Edad de retiro", ahorroActual: "Ahorro actual ($)",
            aporteMensual: "Aporte mensual ($)", tasaRetorno: "Retorno esperado (% anual)",
            inflacion: "Inflación esperada (% anual)", gastoMensualDeseado: "Gasto mensual deseado ($)",
          };
          return (
            <div key={key}>
              <label className="text-xs text-muted-foreground">{labelMap[key] ?? key}</label>
              <Input
                type="number"
                value={inputs[key as keyof JubilacionInput]}
                onChange={(e) => setInputs((prev) => ({ ...prev, [key]: Number(e.target.value) }))}
                className="h-8 text-xs mt-1"
              />
            </div>
          );
        })}
        <Button onClick={handleCalc} disabled={loading} className="w-full">{loading ? "Calculando…" : "Calcular proyección"}</Button>
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Capital proyectado</div><div className="mono text-lg text-success">${result.capitalProyectado.toLocaleString()}</div></div>
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Capital necesario</div><div className="mono text-lg">${result.capitalNecesario.toLocaleString()}</div></div>
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Brecha</div><div className={`mono text-lg ${result.brecha >= 0 ? "text-success" : "text-danger"}`}>{result.brecha >= 0 ? "+" : ""}{result.brecha.toLocaleString()}</div></div>
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tasa real</div><div className="mono text-lg">{result.tasaReal}%</div></div>
            </div>

            <div className="glass p-5">
              <div className="mono mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Evolución del capital</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <defs><linearGradient id="jubGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="100%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="ano" tick={{ fontSize: 10, fill: "#9aa6bd" }} stroke="#2b3242" />
                    <YAxis tick={{ fontSize: 10, fill: "#9aa6bd" }} stroke="#2b3242" tickFormatter={(v: number) => `$${(v / 1000000).toFixed(1)}M`} />
                    <Tooltip contentStyle={{ background: "#141a28", border: "1px solid #2b3242", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Capital"]} />
                    <Area type="monotone" dataKey="capital" stroke="#10b981" strokeWidth={2} fill="url(#jubGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" size="sm" className="text-[11px]">
            <svg className="mr-1.5 h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar modelo (.xlsx)
          </Button>
        </div>
        <ContactCTA origen="jubilacion" />
      </div>
    </div>
  );
}
