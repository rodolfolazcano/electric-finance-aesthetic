import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calcularObjetivo,
  type ObjetivosInput,
  type ObjetivosResult,
} from "@/lib/planificacion/objetivos.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";
import { ContactCTA } from "./ContactCTA";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const defaultInput: ObjetivosInput = {
  montoObjetivo: 50000000,
  plazoMeses: 120,
  ahorroActual: 5000000,
  tasaEsperada: 8,
};

export function CalculadoraObjetivos() {
  const fn = useServerFn(calcularObjetivo);
  const [inputs, setInputs] = useState<ObjetivosInput>(defaultInput);
  const [result, setResult] = useState<ObjetivosResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalc = async () => {
    setLoading(true);
    const r = await fn({ data: inputs });
    setResult(r);
    setLoading(false);
    PLANNED_EVENTS.calculatorUsed("objetivos");
  };

  const handleExport = useCallback(async () => {
    PLANNED_EVENTS.calculatorExport("objetivos");
    const { exportObjetivosXLSX } = await import("@/lib/export/planificacion-export");
    exportObjetivosXLSX(inputs, result!);
  }, [inputs, result]);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="glass p-5 space-y-4">
        <h3 className="mono text-[11px] uppercase tracking-[0.18em] text-foreground">Parámetros</h3>
        <div>
          <label className="text-xs text-muted-foreground">Monto objetivo ($)</label>
          <Input
            type="number"
            value={inputs.montoObjetivo}
            onChange={(e) => setInputs((p) => ({ ...p, montoObjetivo: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Plazo (meses)</label>
          <Input
            type="number"
            value={inputs.plazoMeses}
            onChange={(e) => setInputs((p) => ({ ...p, plazoMeses: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Ahorro actual ($)</label>
          <Input
            type="number"
            value={inputs.ahorroActual}
            onChange={(e) => setInputs((p) => ({ ...p, ahorroActual: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tasa esperada (% anual)</label>
          <Input
            type="number"
            value={inputs.tasaEsperada}
            onChange={(e) => setInputs((p) => ({ ...p, tasaEsperada: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <Button onClick={handleCalc} disabled={loading} className="w-full">
          {loading ? "Calculando…" : "Calcular"}
        </Button>
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="glass p-4 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Aporte mensual necesario
                </div>
                <div className="mono text-lg text-primary">
                  ${result.aporteMensualNecesario.toLocaleString()}
                </div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Total a aportar
                </div>
                <div className="mono text-lg">${result.totalAportado.toLocaleString()}</div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Capital final
                </div>
                <div className="mono text-lg text-success">
                  ${result.capitalFinal.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="glass p-5">
              <div className="mono mb-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Aporte necesario según tasa de retorno
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={result.escenarios}
                    margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                  >
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="tasa"
                      tick={{ fontSize: 10, fill: "#9aa6bd" }}
                      stroke="#2b3242"
                      tickFormatter={(v: number) => `${v}%`}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#9aa6bd" }}
                      stroke="#2b3242"
                      tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#141a28",
                        border: "1px solid #2b3242",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v: number) => [`$${v.toLocaleString()}`, "Aporte mensual"]}
                      labelFormatter={(l: number) => `Tasa: ${l}%`}
                    />
                    <Bar dataKey="aporte" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline" size="sm" className="text-[11px]">
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
        <ContactCTA origen="objetivos" />
      </div>
    </div>
  );
}
