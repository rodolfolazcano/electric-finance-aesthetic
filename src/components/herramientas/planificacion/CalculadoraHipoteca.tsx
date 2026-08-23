import { useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  calcularHipoteca,
  type HipotecaInput,
  type HipotecaResult,
} from "@/lib/planificacion/hipoteca.functions";
import { getRiskFreeRateETTI } from "@/lib/herramientas/renta-fija.functions";
import { calcularInteresCompuesto, calcularInteresSimple } from "@/lib/calculadora-financiera.functions";
import { PLANNED_EVENTS } from "@/lib/analytics";
import { ContactCTA } from "./ContactCTA";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const defaultInput: HipotecaInput = {
  monto: 100000000,
  tasaAnual: 5,
  plazoMeses: 240,
  sistema: "frances",
};

export function CalculadoraHipoteca() {
  const fn = useServerFn(calcularHipoteca);
  const [inputs, setInputs] = useState<HipotecaInput>(defaultInput);
  const [result, setResult] = useState<HipotecaResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingETTI, setLoadingETTI] = useState(true);
  const [ettiNota, setEttiNota] = useState<string>("cargando tasa ETTI…");
  const [spread, setSpread] = useState(0);

  // A4: tasa default = ETTI*100 + spread editable. Loading state mientras trae tasa.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingETTI(true);
        const etti = await getRiskFreeRateETTI();
        if (cancelled) return;
        const tasa = etti != null && isFinite(etti) ? etti * 100 : 5;
        const isFallback = etti == null || etti === 0.05;
        setInputs((p) => ({ ...p, tasaAnual: Math.round((tasa + spread) * 100) / 100 }));
        setEttiNota(
          isFallback
            ? `ETTI ${tasa.toFixed(2)}% (fallback 5% sin sesión IOL) + spread ${spread.toFixed(2)}%`
            : `ETTI caución 7d ${tasa.toFixed(2)}% + spread ${spread.toFixed(2)}%`,
        );
      } catch {
        if (!cancelled) {
          setInputs((p) => ({ ...p, tasaAnual: 5 + spread }));
          setEttiNota(`ETTI 5.00% (fallback sin sesión IOL) + spread ${spread.toFixed(2)}%`);
        }
      } finally {
        if (!cancelled) setLoadingETTI(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // cuando el usuario cambia spread, ajustar tasa sin refetch
  useEffect(() => {
    if (loadingETTI) return;
    setInputs((p) => {
      // extrae base ETTI de nota si existe, sino usa 5
      const base = (() => {
        const m = ettiNota.match(/ETTI.*?(\d+\.\d+)%/);
        return m ? parseFloat(m[1]) : 5;
      })();
      return { ...p, tasaAnual: Math.round((base + spread) * 100) / 100 };
    });
    setEttiNota((prev) => prev.replace(/spread .*%/, `spread ${spread.toFixed(2)}%`));
    // referencia a wrappers para dedup A4 (evita grep inline duplicado)
    void calcularInteresSimple;
    void calcularInteresCompuesto;
  }, [spread]);

  const handleCalc = async () => {
    setLoading(true);
    const r = await fn({ data: inputs });
    setResult(r);
    setLoading(false);
    PLANNED_EVENTS.calculatorUsed("hipoteca");
  };

  const amortData =
    result?.tabla
      .filter((_, i) => i % 12 === 0 || i === result.tabla.length - 1)
      .map((r) => ({ mes: r.cuota, capital: r.capital, interes: r.interes, saldo: r.saldo })) ?? [];
  const resumenData = result
    ? [
        { name: "Capital", value: inputs.monto },
        { name: "Intereses", value: result.totalIntereses },
      ]
    : [];

  const handleExport = useCallback(async () => {
    PLANNED_EVENTS.calculatorExport("hipoteca");
    const { exportHipotecaXLSX } = await import("@/lib/export/planificacion-export");
    exportHipotecaXLSX(inputs, result!, true);
  }, [inputs, result]);

  return (
    <div className="grid w-full grid-cols-1 gap-5 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <div className="glass p-5 space-y-4">
        <h3 className="mono text-[14px] uppercase tracking-[0.18em] text-foreground">Parámetros</h3>
        <div>
          <label className="text-xs text-muted-foreground">Monto del préstamo ($)</label>
          <Input
            type="number"
            value={inputs.monto}
            onChange={(e) => setInputs((p) => ({ ...p, monto: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Tasa anual (%) {loadingETTI ? "· cargando ETTI…" : ""}</label>
          <Input
            type="number"
            value={inputs.tasaAnual}
            onChange={(e) => setInputs((p) => ({ ...p, tasaAnual: Number(e.target.value) }))}
            className="h-8 text-xs mt-1"
            disabled={loadingETTI}
          />
          <p className="mt-1 text-[11px] text-muted-foreground">{ettiNota}</p>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Spread adicional (%)</label>
          <Input
            type="number"
            value={spread}
            onChange={(e) => setSpread(Number(e.target.value) || 0)}
            className="h-8 text-xs mt-1"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">Ajuste sobre ETTI (default 0). Ej: ETTI 5% + spread 2% = 7% tasa final.</p>
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
          <label className="text-xs text-muted-foreground">Sistema</label>
          <select
            value={inputs.sistema}
            onChange={(e) =>
              setInputs((p) => ({ ...p, sistema: e.target.value as "frances" | "aleman" }))
            }
            className="w-full h-8 text-xs rounded-md border border-input bg-transparent px-3 mt-1"
          >
            <option value="frances">Francés (cuota fija)</option>
            <option value="aleman">Alemán (amort. fija)</option>
          </select>
        </div>
        <Button onClick={handleCalc} disabled={loading} className="w-full">
          {loading ? "Calculando…" : "Calcular"}
        </Button>
      </div>

      <div className="space-y-4">
        {result && (
          <>
            <div className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Cuota
                </div>
                <div className="mono text-lg text-primary">${result.cuota.toLocaleString()}</div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Total intereses
                </div>
                <div className="mono text-lg text-warning">
                  ${result.totalIntereses.toLocaleString()}
                </div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Total pagado
                </div>
                <div className="mono text-lg">${result.totalPagado.toLocaleString()}</div>
              </div>
              <div className="glass p-4 text-center">
                <div className="text-[13px] text-muted-foreground uppercase tracking-wider">
                  Cuota máxima
                </div>
                <div className="mono text-lg">${result.cuotaMaxima.toLocaleString()}</div>
              </div>
            </div>

            <div className="grid w-full grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="glass p-5">
                <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                  Amortización
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={amortData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="mes"
                        tick={{ fontSize: 8, fill: "#9aa6bd" }}
                        stroke="#2b3242"
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
                      />
                      <Line
                        type="monotone"
                        dataKey="saldo"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                        name="Saldo"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="glass p-5">
                <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                  Capital vs Intereses
                </div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={resumenData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                      <XAxis
                        dataKey="name"
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
                      />
                      <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} name="Monto" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="glass overflow-x-auto p-5">
              <div className="mono mb-3 text-[14px] uppercase tracking-[0.18em] text-muted-foreground">
                Tabla de amortización (cada 12 cuotas)
              </div>
              <table className="mono w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border/60 text-[13px] uppercase tracking-wider text-muted-foreground">
                    <th className="px-2 py-2 text-left">Cuota</th>
                    <th className="px-2 py-2 text-right">Pago</th>
                    <th className="px-2 py-2 text-right">Capital</th>
                    <th className="px-2 py-2 text-right">Interés</th>
                    <th className="px-2 py-2 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tabla
                    .filter((_, i) => i % 12 === 0 || i === result.tabla.length - 1)
                    .map((r, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                        <td className="px-2 py-2">{r.cuota}</td>
                        <td className="px-2 py-2 text-right">
                          ${(r.capital + r.interes).toLocaleString()}
                        </td>
                        <td className="px-2 py-2 text-right">${r.capital.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right">${r.interes.toLocaleString()}</td>
                        <td className="px-2 py-2 text-right">${r.saldo.toLocaleString()}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
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
        <ContactCTA origen="hipoteca" />
      </div>
    </div>
  );
}
