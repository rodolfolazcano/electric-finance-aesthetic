import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";
import { calcularPresupuesto, type PresupuestoInput, type PresupuestoResult } from "@/lib/planificacion/presupuesto.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PIE_COLORS = ["#10b981", "#fbbf24", "#ef4444", "#a855f7", "#3b82f6", "#f97316", "#06b6d4", "#ec4899", "#84cc16", "#14b8a6"];

interface GastoRow { nombre: string; monto: number; }

export function CalculadoraPresupuesto() {
  const fn = useServerFn(calcularPresupuesto);
  const [ingresos, setIngresos] = useState(500000);
  const [gastos, setGastos] = useState<GastoRow[]>([{ nombre: "Alquiler", monto: 150000 }, { nombre: "Servicios", monto: 50000 }, { nombre: "Alimentación", monto: 100000 }]);
  const [result, setResult] = useState<PresupuestoResult | null>(null);
  const [loading, setLoading] = useState(false);

  const addGasto = useCallback(() => setGastos((prev) => [...prev, { nombre: "", monto: 0 }]), []);
  const removeGasto = useCallback((i: number) => setGastos((prev) => prev.filter((_, idx) => idx !== i)), []);
  const updateGasto = useCallback((i: number, field: keyof GastoRow, value: string | number) => {
    setGastos((prev) => prev.map((g, idx) => idx === i ? { ...g, [field]: field === "monto" ? Number(value) : value } : g));
  }, []);

  const handleCalc = async () => {
    if (gastos.length === 0) return;
    setLoading(true);
    const r = await fn({ data: { ingresos, gastos: gastos.filter((g) => g.nombre.trim() && g.monto > 0) } });
    setResult(r);
    setLoading(false);
    PLANNED_EVENTS.calculatorUsed("presupuesto");
  };

  const handleExport = useCallback(async () => {
    PLANNED_EVENTS.calculatorExport("presupuesto");
    const { exportPresupuestoXLSX } = await import("@/lib/export/planificacion-export");
    exportPresupuestoXLSX({ ingresos, gastos: gastos.filter((g) => g.nombre.trim() && g.monto > 0) }, result!);
  }, [ingresos, gastos, result]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="glass p-5 space-y-4">
        <h3 className="mono text-[11px] uppercase tracking-[0.18em] text-foreground">Ingresos</h3>
        <div><label className="text-xs text-muted-foreground">Ingresos mensuales ($)</label><Input type="number" value={ingresos} onChange={(e) => setIngresos(Number(e.target.value))} className="h-8 text-xs mt-1" /></div>
        <div className="flex items-center justify-between"><h3 className="mono text-[11px] uppercase tracking-[0.18em] text-foreground">Gastos</h3><button onClick={addGasto} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"><Plus className="h-3 w-3" /> Agregar</button></div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {gastos.map((g, i) => (
            <div key={i} className="flex gap-2 items-start">
              <Input value={g.nombre} onChange={(e) => updateGasto(i, "nombre", e.target.value)} placeholder="Categoría" className="h-8 text-xs flex-1" />
              <Input type="number" value={g.monto} onChange={(e) => updateGasto(i, "monto", e.target.value)} placeholder="Monto" className="h-8 text-xs w-24" />
              <button onClick={() => removeGasto(i)} className="mt-1 text-muted-foreground hover:text-danger transition-colors"><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <Button onClick={handleCalc} disabled={loading} className="w-full">{loading ? "Calculando…" : "Analizar presupuesto"}</Button>
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Ingresos</div><div className="mono text-lg text-success">${result.totalIngresos.toLocaleString()}</div></div>
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Gastos</div><div className={`mono text-lg ${result.alerta ? "text-danger" : "text-foreground"}`}>${result.totalGastos.toLocaleString()}</div></div>
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</div><div className={`mono text-lg ${result.balance >= 0 ? "text-success" : "text-danger"}`}>${result.balance.toLocaleString()}</div></div>
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Tasa ahorro</div><div className={`mono text-lg ${result.tasaAhorro > 0 ? "text-success" : "text-danger"}`}>{result.tasaAhorro}%</div></div>
            </div>

            {result.alerta && (
              <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger text-center">Tus gastos superan tus ingresos. Revisá las categorías para ajustar.</div>
            )}

            <div className="glass p-5">
              <div className="mono mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Distribución de gastos</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={result.distribucion} dataKey="monto" nameKey="nombre" cx="50%" cy="50%" outerRadius={80} label={({ nombre, porcentaje }) => `${nombre} ${porcentaje}%`} labelLine={false}>
                      {result.distribucion.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#141a28", border: "1px solid #2b3242", borderRadius: 8, fontSize: 11 }} formatter={(v: number) => [`$${v.toLocaleString()}`, "Monto"]} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
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
      </div>
    </div>
  );
}
