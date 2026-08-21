import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calcularPatrimonioNeto,
  type PatrimonioNetoInput,
  type PatrimonioNetoResult,
} from "@/lib/planificacion/patrimonio-neto.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";
import { ContactCTA } from "./ContactCTA";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

const PIE_COLORS = ["#10b981", "#3b82f6", "#fbbf24", "#a855f7"];

export function CalculadoraPatrimonioNeto() {
  const fn = useServerFn(calcularPatrimonioNeto);
  const [inputs, setInputs] = useState<PatrimonioNetoInput>({
    activos: { liquidos: 2000000, inversiones: 5000000, inmuebles: 30000000, otros: 1000000 },
    pasivos: { deudas: 5000000 },
  });
  const [result, setResult] = useState<PatrimonioNetoResult | null>(null);
  const [loading, setLoading] = useState(false);

  const setActivo = (key: keyof PatrimonioNetoInput["activos"], value: number) =>
    setInputs((p) => ({ ...p, activos: { ...p.activos, [key]: value } }));
  const setPasivo = (value: number) => setInputs((p) => ({ ...p, pasivos: { deudas: value } }));

  const handleCalc = async () => {
    setLoading(true);
    const r = await fn({ data: inputs });
    setResult(r);
    setLoading(false);
    PLANNED_EVENTS.calculatorUsed("patrimonio-neto");
  };

  return (
    <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="glass p-5 space-y-4">
        <h3 className="mono text-[14px] uppercase tracking-[0.18em] text-foreground">Activos</h3>
        <div>
          <label className="text-xs text-muted-foreground">Líquidos (efectivo, cuentas)</label>
          <Input
            type="number"
            value={inputs.activos.liquidos}
            onChange={(e) => setActivo("liquidos", Number(e.target.value))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Inversiones (acciones, fondos)</label>
          <Input
            type="number"
            value={inputs.activos.inversiones}
            onChange={(e) => setActivo("inversiones", Number(e.target.value))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Inmuebles</label>
          <Input
            type="number"
            value={inputs.activos.inmuebles}
            onChange={(e) => setActivo("inmuebles", Number(e.target.value))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Otros activos</label>
          <Input
            type="number"
            value={inputs.activos.otros}
            onChange={(e) => setActivo("otros", Number(e.target.value))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <h3 className="mono text-[14px] uppercase tracking-[0.18em] text-foreground mt-4">
          Pasivos
        </h3>
        <div>
          <label className="text-xs text-muted-foreground">Deudas totales</label>
          <Input
            type="number"
            value={inputs.pasivos.deudas}
            onChange={(e) => setPasivo(Number(e.target.value))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <Button onClick={handleCalc} disabled={loading} className="w-full">
          {loading ? "Calculando…" : "Calcular patrimonio"}
        </Button>
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Total activos
                </div>
                <div className="mono text-lg text-success">
                  ${result.totalActivos.toLocaleString()}
                </div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Total pasivos
                </div>
                <div className="mono text-lg text-danger">
                  ${result.totalPasivos.toLocaleString()}
                </div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Patrimonio neto
                </div>
                <div
                  className={`mono text-lg ${result.patrimonioNeto >= 0 ? "text-success" : "text-danger"}`}
                >
                  ${result.patrimonioNeto.toLocaleString()}
                </div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Salud
                </div>
                <div className={`mono text-lg ${result.saludFinanciera.color}`}>
                  {result.saludFinanciera.label}
                </div>
              </div>
            </div>

            <div className="glass p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Distribución de activos
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={result.distribucionActivos}
                      dataKey="monto"
                      nameKey="nombre"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ nombre, porcentaje }) => `${nombre} ${porcentaje}%`}
                      labelLine={false}
                    >
                      {result.distribucionActivos.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "#141a28",
                        border: "1px solid #2b3242",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [`$${v.toLocaleString()}`, "Monto"]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
        <ContactCTA origen="patrimonio-neto" />
      </div>
    </div>
  );
}
