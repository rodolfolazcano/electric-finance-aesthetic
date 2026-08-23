import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus } from "lucide-react";
import { calcularPasivos, type PasivosInput, type PasivosResult, type DeudaInput } from "@/lib/planificacion/pasivos.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface DeudaRow { nombre: string; monto: number; tasa: number; cuotaMinima: number; }

export function CalculadoraPasivos() {
  const fn = useServerFn(calcularPasivos);
  const [deudas, setDeudas] = useState<DeudaRow[]>([{ nombre: "Tarjeta", monto: 500000, tasa: 55, cuotaMinima: 25000 }, { nombre: "Préstamo personal", monto: 2000000, tasa: 40, cuotaMinima: 80000 }]);
  const [pagoMensual, setPagoMensual] = useState(200000);
  const [estrategia, setEstrategia] = useState<"avalancha" | "bola-nieve">("avalancha");
  const [result, setResult] = useState<PasivosResult | null>(null);
  const [loading, setLoading] = useState(false);

  const addDeuda = useCallback(() => setDeudas((prev) => [...prev, { nombre: "", monto: 0, tasa: 0, cuotaMinima: 0 }]), []);
  const removeDeuda = useCallback((i: number) => setDeudas((prev) => prev.filter((_, idx) => idx !== i)), []);
  const updateDeuda = useCallback((i: number, field: keyof DeudaRow, value: string | number) => {
    setDeudas((prev) => prev.map((d, idx) => idx === i ? { ...d, [field]: field === "nombre" ? String(value) : Number(value) } : d));
  }, []);

  const handleCalc = async () => {
    const validas = deudas.filter((d) => d.nombre.trim() && d.monto > 0);
    if (validas.length === 0) return;
    setLoading(true);
    const r = await fn({ data: { deudas: validas, pagoMensual, estrategia } });
    setResult(r);
    setLoading(false);
    PLANNED_EVENTS.calculatorUsed("pasivos");
  };

  const resumenDeudas = result?.resumenPorDeuda ?? [];

  const handleExport = useCallback(async () => {
    PLANNED_EVENTS.calculatorExport("pasivos");
    const { exportPasivosXLSX } = await import("@/lib/export/planificacion-export");
    exportPasivosXLSX({ deudas: deudas.filter((d) => d.nombre.trim() && d.monto > 0), pagoMensual, estrategia }, result!);
  }, [deudas, pagoMensual, estrategia, result]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="glass p-5 space-y-4">
        <h3 className="mono text-[11px] uppercase tracking-[0.18em] text-foreground">Deudas</h3>
        <div><label className="text-xs text-muted-foreground">Pago mensual disponible ($)</label><Input type="number" value={pagoMensual} onChange={(e) => setPagoMensual(Number(e.target.value))} className="h-8 text-xs mt-1" /></div>
        <div><label className="text-xs text-muted-foreground">Estrategia</label>
          <select value={estrategia} onChange={(e) => setEstrategia(e.target.value as "avalancha" | "bola-nieve")} className="w-full h-8 text-xs rounded-md border border-input bg-transparent px-3 mt-1">
            <option value="avalancha">Avalancha (mayor tasa)</option><option value="bola-nieve">Bola de nieve (mayor deuda)</option>
          </select>
        </div>
        <div className="flex items-center justify-between"><h3 className="mono text-[11px] uppercase tracking-[0.18em] text-foreground">Deudas</h3><button onClick={addDeuda} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"><Plus className="h-3 w-3" /> Agregar</button></div>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {deudas.map((d, i) => (
            <div key={i} className="glass p-2 space-y-1">
              <div className="flex gap-1 items-center">
                <Input value={d.nombre} onChange={(e) => updateDeuda(i, "nombre", e.target.value)} placeholder="Nombre" className="h-7 text-[10px] flex-1" />
                <button onClick={() => removeDeuda(i)} className="text-muted-foreground hover:text-danger"><X className="h-3 w-3" /></button>
              </div>
              <div className="flex gap-1">
                <Input type="number" value={d.monto} onChange={(e) => updateDeuda(i, "monto", e.target.value)} placeholder="Monto" className="h-7 text-[10px] w-[32%]" />
                <Input type="number" value={d.tasa} onChange={(e) => updateDeuda(i, "tasa", e.target.value)} placeholder="Tasa %" className="h-7 text-[10px] w-[32%]" />
                <Input type="number" value={d.cuotaMinima} onChange={(e) => updateDeuda(i, "cuotaMinima", e.target.value)} placeholder="Cuota mín." className="h-7 text-[10px] w-[32%]" />
              </div>
            </div>
          ))}
        </div>
        <Button onClick={handleCalc} disabled={loading} className="w-full">{loading ? "Calculando…" : "Calcular estrategia"}</Button>
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Estrategia</div><div className="mono text-xs text-primary mt-1">{result.estrategia}</div></div>
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Meses total</div><div className="mono text-lg">{result.mesesTotal}</div></div>
              <div className="glass p-4 text-center"><div className="text-[10px] text-muted-foreground uppercase tracking-wider">Interés total</div><div className="mono text-lg text-warning">${result.interesTotal.toLocaleString()}</div></div>
            </div>

            <div className="glass p-5">
              <div className="mono mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Resumen por deuda</div>
              <table className="mono w-full text-[11px]">
                <thead><tr className="border-b border-border/60 text-[10px] uppercase tracking-wider text-muted-foreground"><th className="px-2 py-2 text-left">Deuda</th><th className="px-2 py-2 text-right">Meses</th><th className="px-2 py-2 text-right">Interés pagado</th></tr></thead>
                <tbody>
                  {resumenDeudas.map((r, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/20"><td className="px-2 py-2">{r.nombre}</td><td className="px-2 py-2 text-right">{r.meses}</td><td className="px-2 py-2 text-right">${r.interes.toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
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
