import { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calcularInversiones,
  type InversionesInput,
  type InversionesResult,
} from "@/lib/planificacion/inversiones.functions";
import { calcularInteresCompuesto } from "@/lib/calculadora-financiera.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";
import { ContactCTA } from "./ContactCTA";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const defaultInput: InversionesInput = {
  montoInicial: 1000000,
  aportePeriodico: 10000,
  frecuencia: "mensual",
  tasaEsperada: 10,
  plazoAnos: 20,
  tipoInteres: "compuesto",
};

export function CalculadoraInversiones() {
  const fn = useServerFn(calcularInversiones);
  const [inputs, setInputs] = useState<InversionesInput>(defaultInput);
  const [result, setResult] = useState<InversionesResult | null>(null);
  const [loading, setLoading] = useState(false);

  const handleCalc = async () => {
    setLoading(true);
    const r = await fn({ data: inputs });
    setResult(r);
    setLoading(false);
    PLANNED_EVENTS.calculatorUsed("inversiones");
  };

  const chartData =
    result?.proyeccion.map((p, i) => ({
      ano: p.ano,
      "Con aportes": p.capital,
      "Sin aportes": result.sinAportes[i]?.capital ?? 0,
    })) ?? [];

  const handleExport = useCallback(async () => {
    PLANNED_EVENTS.calculatorExport("inversiones");
    const { exportInversionesXLSX } = await import("@/lib/export/planificacion-export");
    exportInversionesXLSX(inputs, result!);
  }, [inputs, result]);

  return (
    <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="glass p-5 space-y-4">
        <h3 className="mono text-[14px] uppercase tracking-[0.18em] text-foreground">ParÃ¡metros</h3>
        <div>
          <label className="text-xs text-muted-foreground">Monto inicial ($)</label>
          <Input
            type="number"
            value={inputs.montoInicial}
            onChange={(e) => setInputs((p) => ({ ...p, montoInicial: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Aporte periÃ³dico ($)</label>
          <Input
            type="number"
            value={inputs.aportePeriodico}
            onChange={(e) => setInputs((p) => ({ ...p, aportePeriodico: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Frecuencia</label>
          <select
            value={inputs.frecuencia}
            onChange={(e) =>
              setInputs((p) => ({
                ...p,
                frecuencia: e.target.value as "mensual" | "trimestral" | "anual",
              }))
            }
            className="w-full h-8 text-xs rounded-md border border-input bg-transparent px-3 mt-1"
          >
            <option value="mensual">Mensual</option>
            <option value="trimestral">Trimestral</option>
            <option value="anual">Anual</option>
          </select>
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
        <div>
          <label className="text-xs text-muted-foreground">Plazo (aÃ±os)</label>
          <Input
            type="number"
            value={inputs.plazoAnos}
            onChange={(e) => setInputs((p) => ({ ...p, plazoAnos: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tipo de interÃ©s</label>
          <select
            value={inputs.tipoInteres}
            onChange={(e) =>
              setInputs((p) => ({ ...p, tipoInteres: e.target.value as "simple" | "compuesto" }))
            }
            className="w-full h-8 text-xs rounded-md border border-input bg-transparent px-3 mt-1"
          >
            <option value="compuesto">Compuesto</option>
            <option value="simple">Simple</option>
          </select>
        </div>
        <Button onClick={handleCalc} disabled={loading} className="w-full">
          {loading ? "Calculandoâ€¦" : "Proyectar"}
        </Button>
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Capital final
                </div>
                <div className="mono text-lg text-success">
                  ${result.capitalFinal.toLocaleString()}
                </div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Total aportado
                </div>
                <div className="mono text-lg">${result.totalAportado.toLocaleString()}</div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Ganancia total
                </div>
                <div className="mono text-lg text-primary">
                  ${result.totalGanancia.toLocaleString()}
                </div>
              </div>
            </div>

            <div className="glass p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                ProyecciÃ³n: con aportes vs sin aportes
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="ano"
                      tick={{ fontSize: 10, fill: "#9aa6bd" }}
                      stroke="#2b3242"
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#9aa6bd" }}
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
                      formatter={(v: number) => [`$${v.toLocaleString()}`, undefined]}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line
                      type="monotone"
                      dataKey="Con aportes"
                      stroke="#10b981"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Sin aportes"
                      stroke="#fbbf24"
                      strokeWidth={2}
                      dot={false}
                      strokeDasharray="4 3"
                    />
                  </LineChart>
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
        <ContactCTA origen="inversiones" />
      </div>
    </div>
  );
}


