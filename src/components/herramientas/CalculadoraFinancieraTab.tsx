import React, { useState } from "react";
import {
  Calculator,
  TrendingUp,
  Percent,
  DollarSign,
  PieChart,
  BarChart3,
  HelpCircle,
  ChevronDown,
  ChevronRight,
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
  formatMonetary,
  formatPercentage,
  formatNumber,
} from "@/lib/calculadora-financiera.functions";

type SeccionCalculadora =
  | "porcentajes"
  | "capitalizacion"
  | "tasas"
  | "rentas"
  | "van-tir"
  | "bonos"
  | "estadistica";

const SECCIONES: { id: SeccionCalculadora; label: string; icon: any }[] = [
  { id: "porcentajes", label: "Porcentajes", icon: Percent },
  { id: "capitalizacion", label: "Capitalización", icon: TrendingUp },
  { id: "tasas", label: "Tasas", icon: DollarSign },
  { id: "rentas", label: "Rentas", icon: PieChart },
  { id: "van-tir", label: "VAN y TIR", icon: BarChart3 },
  { id: "bonos", label: "Bonos", icon: Calculator },
  { id: "estadistica", label: "Estadística", icon: BarChart3 },
];

function InputField({
  label,
  value,
  onChange,
  step = 1,
  min,
  suffix = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <div className="relative">
        <input
          type="number"
          step={step}
          min={min}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[14px] font-mono text-foreground outline-none focus:border-emerald-500/50 transition-colors"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function ResultCard({
  titulo,
  valor,
  formula,
  explicacion,
  interpretacion,
}: {
  titulo: string;
  valor: string | number;
  formula: string;
  explicacion: string;
  interpretacion?: string;
}) {
  const [expandido, setExpandido] = useState(false);

  return (
    <div className="rounded-md border border-border/40 bg-background/60 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">{titulo}</span>
        <button
          onClick={() => setExpandido(!expandido)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>
      
      <div className="text-[24px] font-mono font-semibold text-emerald-400">
        {typeof valor === "number" ? formatNumber(valor, 2) : valor}
      </div>

      {expandido && (
        <div className="space-y-2 pt-2 border-t border-border/20">
          <div className="space-y-1">
            <p className="text-[12px] uppercase tracking-widest text-muted-foreground/70">
              Fórmula
            </p>
            <p className="text-[13px] font-mono text-muted-foreground bg-muted/10 p-2 rounded">
              {formula}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[12px] uppercase tracking-widest text-muted-foreground/70">
              Explicación
            </p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">{explicacion}</p>
          </div>
          {interpretacion && (
            <div className="space-y-1">
              <p className="text-[12px] uppercase tracking-widest text-muted-foreground/70">
                Interpretación
              </p>
              <p className="text-[13px] text-amber-300/90 leading-relaxed">{interpretacion}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CalculadoraFinancieraTab() {
  const [seccion, setSeccion] = useState<SeccionCalculadora>("porcentajes");

  // Porcentajes
  const [porcMonto, setPorcMonto] = useState(57000);
  const [porcTasa, setPorcTasa] = useState(1.3);
  const [netoPrecio, setNetoPrecio] = useState(200000);
  const [netoDescuento, setNetoDescuento] = useState(8);
  const [netoImpuesto, setNetoImpuesto] = useState(10);
  const [difInicial, setDifInicial] = useState(58.5);
  const [difFinal, setDifFinal] = useState(53.25);

  // Capitalización
  const [simpleCapital, setSimpleCapital] = useState(38000);
  const [simpleTasa, setSimpleTasa] = useState(25);
  const [simpleDias, setSimpleDias] = useState(92);
  const [simpleBase, setSimpleBase] = useState<360 | 365>(365);
  const [compuestoCapital, setCompuestoCapital] = useState(35000);
  const [compuestoTasa, setCompuestoTasa] = useState(18);
  const [compuestoAnios, setCompuestoAnios] = useState(10);
  const [compuestoPeriodos, setCompuestoPeriodos] = useState(12);

  // Tasas
  const [efectivaNominal, setEfectivaNominal] = useState(5.25);
  const [efectivaCapitalizaciones, setEfectivaCapitalizaciones] = useState(4);
  const [nominalEfectiva, setNominalEfectiva] = useState(5.354);
  const [nominalCapitalizaciones, setNominalCapitalizaciones] = useState(4);

  // Rentas
  const [rentasPrestamo, setRentasPrestamo] = useState(135000);
  const [rentasPago, setRentasPago] = useState(2800);
  const [rentasTasa, setRentasTasa] = useState(10.5);
  const [rentasPeriodos, setRentasPeriodos] = useState(12);
  const [vaPago, setVaPago] = useState(150);
  const [vaTasa, setVaTasa] = useState(15);
  const [vaAnios, setVaAnios] = useState(4);
  const [pmtPrestamo, setPmtPrestamo] = useState(18000);
  const [pmtTasa, setPmtTasa] = useState(8.65);
  const [pmtAnios, setPmtAnios] = useState(5);

  // VAN y TIR
  const [vanFlujos, setVanFlujos] = useState("[-80000, -500, 4500, 5500, 4500, 130000]");
  const [vanTasa, setVanTasa] = useState(13);

  // Bonos
  const [bonoCupon, setBonoCupon] = useState(6.75);
  const [bonoRendimiento, setBonoRendimiento] = useState(8.25);
  const [bonoAnios, setBonoAnios] = useState(14);
  const [bonoNominal, setBonoNominal] = useState(100);

  // Estadística
  const [statValores, setStatValores] = useState("468, 349, 287, 290");
  const [statPesos, setStatPesos] = useState("150, 100, 140, 600");
  const [statX, setStatX] = useState("-12.5, -1, 13.1, 12.9, 14.4");
  const [statY, setStatY] = useState("-20.5, -8.3, 6.6, 7.5, 8.2");

  const parseArray = (str: string): number[] => {
    try {
      const cleaned = str.replace(/\s/g, "");
      if (cleaned.startsWith("[")) {
        return JSON.parse(cleaned);
      }
      return cleaned.split(",").map((v) => parseFloat(v.trim())).filter((v) => !isNaN(v));
    } catch {
      return [];
    }
  };

  const porcResult = calcularPorcentaje(porcMonto, porcTasa);
  const netoResult = calcularImporteNeto(netoPrecio, netoDescuento, netoImpuesto);
  const difResult = calcularDiferenciaPorcentual(difInicial, difFinal);

  const simpleResult = calcularInteresSimple(simpleCapital, simpleTasa, simpleDias, simpleBase);
  const compuestoResult = calcularInteresCompuesto(
    compuestoCapital,
    compuestoTasa,
    compuestoAnios,
    compuestoPeriodos
  );

  const efectivaResult = calcularTasaEfectiva(efectivaNominal, efectivaCapitalizaciones);
  const nominalResult = calcularTasaNominal(nominalEfectiva, nominalCapitalizaciones);

  const numPagosResult = calcularNumeroPagos(rentasPrestamo, rentasPago, rentasTasa, rentasPeriodos);
  const vaResult = calcularValorActualRentas(vaPago, vaTasa, vaAnios * 12, 12);
  const pmtResult = calcularPagoRentas(pmtPrestamo, pmtTasa, pmtAnios * 12, 12);

  const vanFlujosArray = parseArray(vanFlujos);
  const vanResult = vanFlujosArray.length > 0 ? calcularVAN(vanFlujosArray, vanTasa) : null;
  const tirResult = vanFlujosArray.length > 0 ? calcularTIR(vanFlujosArray, 1) : null;

  const bonoResult = calcularPrecioBono(bonoCupon, bonoRendimiento, bonoAnios, bonoNominal);

  const statValoresArray = parseArray(statValores);
  const mediaResult = statValoresArray.length > 0 ? calcularMediaAritmetica(statValoresArray) : null;
  const varResult = statValoresArray.length > 0 ? calcularVarianzaDesviacion(statValoresArray) : null;

  const statPesosArray = parseArray(statPesos);
  const mediaPondResult =
    statValoresArray.length > 0 && statPesosArray.length > 0
      ? calcularMediaPonderada(statValoresArray, statPesosArray)
      : null;

  const statXArray = parseArray(statX);
  const statYArray = parseArray(statY);
  const covResult =
    statXArray.length > 0 && statYArray.length > 0
      ? calcularCovarianzaCorrelacion(statXArray, statYArray)
      : null;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/40 bg-background/60 p-4">
        <div className="flex items-center gap-3 mb-3">
          <Calculator className="h-5 w-5 text-emerald-400" />
          <div>
            <p className="text-[13px] uppercase tracking-widest text-muted-foreground">
              Calculadora Financiera
            </p>
            <p className="text-[13px] text-muted-foreground">
              Basada en manuales AFC 2022 · HP 12C / Casio FC-200V
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {SECCIONES.map((s) => (
            <button
              key={s.id}
              onClick={() => setSeccion(s.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
                seccion === s.id
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-muted/10 text-muted-foreground hover:bg-muted/20 border border-border/20"
              }`}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Porcentajes */}
      {seccion === "porcentajes" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Cálculo de Porcentajes
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                label="Monto"
                value={porcMonto}
                onChange={setPorcMonto}
                step={1000}
                suffix="$"
              />
              <InputField
                label="Porcentaje"
                value={porcTasa}
                onChange={setPorcTasa}
                step={0.1}
                suffix="%"
              />
              <div />
            </div>
            <ResultCard
              titulo="Comisión"
              valor={formatMonetary(porcResult.valor)}
              formula={porcResult.formula}
              explicacion={porcResult.explicacion}
            />
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Importe Neto (con descuento e impuesto)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                label="Precio"
                value={netoPrecio}
                onChange={setNetoPrecio}
                step={1000}
                suffix="$"
              />
              <InputField
                label="Descuento"
                value={netoDescuento}
                onChange={setNetoDescuento}
                step={1}
                suffix="%"
              />
              <InputField
                label="Impuesto"
                value={netoImpuesto}
                onChange={setNetoImpuesto}
                step={1}
                suffix="%"
              />
            </div>
            <ResultCard
              titulo="Precio Final"
              valor={formatMonetary(netoResult.valor)}
              formula={netoResult.formula}
              explicacion={netoResult.explicacion}
            />
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Diferencia Porcentual
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                label="Valor Inicial"
                value={difInicial}
                onChange={setDifInicial}
                step={0.01}
              />
              <InputField
                label="Valor Final"
                value={difFinal}
                onChange={setDifFinal}
                step={0.01}
              />
            </div>
            <ResultCard
              titulo="Variación"
              valor={formatPercentage(difResult.valor)}
              formula={difResult.formula}
              explicacion={difResult.explicacion}
            />
          </div>
        </div>
      )}

      {/* Capitalización */}
      {seccion === "capitalizacion" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Interés Simple
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <InputField
                label="Capital"
                value={simpleCapital}
                onChange={setSimpleCapital}
                step={1000}
                suffix="$"
              />
              <InputField
                label="Tasa Anual"
                value={simpleTasa}
                onChange={setSimpleTasa}
                step={0.5}
                suffix="%"
              />
              <InputField
                label="Días"
                value={simpleDias}
                onChange={setSimpleDias}
                step={1}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted-foreground">Base</span>
                <select
                  value={simpleBase}
                  onChange={(e) => setSimpleBase(e.target.value as 360 | 365)}
                  className="w-full rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[14px] text-foreground outline-none focus:border-emerald-500/50"
                >
                  <option value={365}>365 días</option>
                  <option value={360}>360 días</option>
                </select>
              </div>
            </div>
            <ResultCard
              titulo="Intereses"
              valor={formatMonetary(simpleResult.intereses)}
              formula={simpleResult.formula}
              explicacion={simpleResult.explicacion}
            />
            <ResultCard
              titulo="Capital Final"
              valor={formatMonetary(simpleResult.capitalFinal)}
              formula={`CF = ${simpleCapital} + ${simpleResult.intereses.toFixed(2)}`}
              explicacion="Capital inicial más los intereses generados"
            />
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Interés Compuesto
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <InputField
                label="Capital"
                value={compuestoCapital}
                onChange={setCompuestoCapital}
                step={1000}
                suffix="$"
              />
              <InputField
                label="Tasa Anual"
                value={compuestoTasa}
                onChange={setCompuestoTasa}
                step={0.5}
                suffix="%"
              />
              <InputField
                label="Años"
                value={compuestoAnios}
                onChange={setCompuestoAnios}
                step={1}
              />
              <InputField
                label="Períodos/año"
                value={compuestoPeriodos}
                onChange={setCompuestoPeriodos}
                step={1}
              />
            </div>
            <ResultCard
              titulo="Capital Final"
              valor={formatMonetary(compuestoResult.capitalFinal)}
              formula={compuestoResult.formula}
              explicacion={compuestoResult.explicacion}
            />
            <ResultCard
              titulo="Intereses Totales"
              valor={formatMonetary(compuestoResult.interesesTotales)}
              formula={`Intereses = ${compuestoResult.capitalFinal.toFixed(2)} - ${compuestoCapital}`}
              explicacion="Interés compuesto acumulado sobre el capital inicial"
            />
          </div>
        </div>
      )}

      {/* Tasas */}
      {seccion === "tasas" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Tasa Nominal → Tasa Efectiva Anual (TEA)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                label="Tasa Nominal"
                value={efectivaNominal}
                onChange={setEfectivaNominal}
                step={0.25}
                suffix="%"
              />
              <InputField
                label="Capitalizaciones/año"
                value={efectivaCapitalizaciones}
                onChange={setEfectivaCapitalizaciones}
                step={1}
              />
            </div>
            <ResultCard
              titulo="TEA"
              valor={formatPercentage(efectivaResult.tasaEfectiva)}
              formula={efectivaResult.formula}
              explicacion={efectivaResult.explicacion}
            />
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Tasa Efectiva → Tasa Nominal Anual (TNA)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InputField
                label="Tasa Efectiva"
                value={nominalEfectiva}
                onChange={setNominalEfectiva}
                step={0.25}
                suffix="%"
              />
              <InputField
                label="Capitalizaciones/año"
                value={nominalCapitalizaciones}
                onChange={setNominalCapitalizaciones}
                step={1}
              />
            </div>
            <ResultCard
              titulo="TNA"
              valor={formatPercentage(nominalResult.tasaEfectiva)}
              formula={nominalResult.formula}
              explicacion={nominalResult.explicacion}
            />
          </div>
        </div>
      )}

      {/* Rentas */}
      {seccion === "rentas" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Número de Pagos (Préstamo)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                label="Préstamo"
                value={rentasPrestamo}
                onChange={setRentasPrestamo}
                step={5000}
                suffix="$"
              />
              <InputField
                label="Pago Périódico"
                value={rentasPago}
                onChange={setRentasPago}
                step={100}
                suffix="$"
              />
              <InputField
                label="Tasa Anual"
                value={rentasTasa}
                onChange={setRentasTasa}
                step={0.5}
                suffix="%"
              />
            </div>
            <ResultCard
              titulo="Pagos Necesarios"
              valor={formatNumber(numPagosResult.resultado, 1)}
              formula={numPagosResult.formula}
              explicacion={numPagosResult.explicacion}
            />
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Valor Actual de Rentas
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                label="Pago Mensual"
                value={vaPago}
                onChange={setVaPago}
                step={10}
                suffix="$"
              />
              <InputField
                label="Tasa Anual"
                value={vaTasa}
                onChange={setVaTasa}
                step={0.5}
                suffix="%"
              />
              <InputField
                label="Años"
                value={vaAnios}
                onChange={setVaAnios}
                step={1}
              />
            </div>
            <ResultCard
              titulo="Valor Actual"
              valor={formatMonetary(vaResult.resultado)}
              formula={vaResult.formula}
              explicacion={vaResult.explicacion}
            />
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Pago de Préstamo (Cuota)
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InputField
                label="Préstamo"
                value={pmtPrestamo}
                onChange={setPmtPrestamo}
                step={1000}
                suffix="$"
              />
              <InputField
                label="Tasa Anual"
                value={pmtTasa}
                onChange={setPmtTasa}
                step={0.5}
                suffix="%"
              />
              <InputField
                label="Años"
                value={pmtAnios}
                onChange={setPmtAnios}
                step={1}
              />
            </div>
            <ResultCard
              titulo="Cuota Mensual"
              valor={formatMonetary(pmtResult.resultado)}
              formula={pmtResult.formula}
              explicacion={pmtResult.explicacion}
            />
          </div>
        </div>
      )}

      {/* VAN y TIR */}
      {seccion === "van-tir" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              VAN y TIR de Flujos de Caja
            </p>
            <div className="space-y-2 mb-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted-foreground">
                  Flujos de Caja (separados por coma o formato JSON)
                </span>
                <textarea
                  value={vanFlujos}
                  onChange={(e) => setVanFlujos(e.target.value)}
                  className="w-full rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[13px] font-mono text-foreground outline-none focus:border-emerald-500/50 min-h-[80px]"
                  placeholder="Ej: [-10000, 3000, 4000, 5000]"
                />
              </label>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
              <InputField
                label="Tasa de Descuento (%)"
                value={vanTasa}
                onChange={setVanTasa}
                step={0.5}
                suffix="%"
              />
            </div>

            {vanResult && (
              <ResultCard
                titulo="VAN"
                valor={formatMonetary(vanResult.van)}
                formula={vanResult.formula}
                explicacion={vanResult.explicacion}
                interpretacion={vanResult.interpretacion}
              />
            )}

            {tirResult && (
              <ResultCard
                titulo="TIR"
                valor={formatPercentage(tirResult.tir)}
                formula={tirResult.formula}
                explicacion={tirResult.explicacion}
                interpretacion={tirResult.interpretacion}
              />
            )}

            {!tirResult?.convergio && (
              <div className="text-[13px] text-amber-400">
                ⚠️ La TIR no convergió. Verifique que los flujos de caja tengan signos alternados.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bonos */}
      {seccion === "bonos" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Precio de Bono
            </p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <InputField
                label="Cupón Anual"
                value={bonoCupon}
                onChange={setBonoCupon}
                step={0.25}
                suffix="%"
              />
              <InputField
                label="Rendimiento Requerido"
                value={bonoRendimiento}
                onChange={setBonoRendimiento}
                step={0.25}
                suffix="%"
              />
              <InputField
                label="Años al Vencimiento"
                value={bonoAnios}
                onChange={setBonoAnios}
                step={1}
              />
              <InputField
                label="Valor Nominal"
                value={bonoNominal}
                onChange={setBonoNominal}
                step={10}
                suffix="$"
              />
            </div>
            <ResultCard
              titulo="Precio del Bono"
              valor={formatMonetary(bonoResult.precio)}
              formula={bonoResult.formula}
              explicacion={bonoResult.explicacion}
            />
          </div>
        </div>
      )}

      {/* Estadística */}
      {seccion === "estadistica" && (
        <div className="space-y-4">
          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Media Aritmética
            </p>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] text-muted-foreground">Valores (separados por coma)</span>
              <textarea
                value={statValores}
                onChange={(e) => setStatValores(e.target.value)}
                className="w-full rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[13px] font-mono text-foreground outline-none focus:border-emerald-500/50 min-h-[60px]"
              />
            </label>
            {mediaResult && (
              <ResultCard
                titulo="Media"
                valor={formatNumber(mediaResult.media, 2)}
                formula={mediaResult.formula}
                explicacion={mediaResult.explicacion}
              />
            )}
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Media Ponderada
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted-foreground">Valores</span>
                <textarea
                  value={statValores}
                  onChange={(e) => setStatValores(e.target.value)}
                  className="w-full rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[13px] font-mono text-foreground outline-none focus:border-emerald-500/50 min-h-[60px]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted-foreground">Pesos</span>
                <textarea
                  value={statPesos}
                  onChange={(e) => setStatPesos(e.target.value)}
                  className="w-full rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[13px] font-mono text-foreground outline-none focus:border-emerald-500/50 min-h-[60px]"
                />
              </label>
            </div>
            {mediaPondResult && (
              <ResultCard
                titulo="Media Ponderada"
                valor={formatNumber(mediaPondResult.media, 2)}
                formula={mediaPondResult.formula}
                explicacion={mediaPondResult.explicacion}
              />
            )}
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Varianza y Desviación Estándar
            </p>
            {varResult && (
              <>
                <ResultCard
                  titulo="Varianza"
                  valor={formatNumber(varResult.varianza, 4)}
                  formula={varResult.formula}
                  explicacion={varResult.explicacion}
                />
                <ResultCard
                  titulo="Desviación Estándar"
                  valor={formatNumber(varResult.desviacion, 4)}
                  formula={`σ = √${varResult.varianza.toFixed(4)}`}
                  explicacion="Raíz cuadrada de la varianza"
                />
              </>
            )}
          </div>

          <div className="rounded-md border border-border/40 bg-background/60 p-4">
            <p className="text-[13px] font-semibold text-foreground mb-3">
              Covarianza y Correlación
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted-foreground">Serie X</span>
                <textarea
                  value={statX}
                  onChange={(e) => setStatX(e.target.value)}
                  className="w-full rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[13px] font-mono text-foreground outline-none focus:border-emerald-500/50 min-h-[60px]"
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[13px] text-muted-foreground">Serie Y</span>
                <textarea
                  value={statY}
                  onChange={(e) => setStatY(e.target.value)}
                  className="w-full rounded-md border border-border/40 bg-background/20 px-3 py-2 text-[13px] font-mono text-foreground outline-none focus:border-emerald-500/50 min-h-[60px]"
                />
              </label>
            </div>
            {covResult && (
              <>
                <ResultCard
                  titulo="Covarianza"
                  valor={formatNumber(covResult.covarianza, 4)}
                  formula={covResult.formula}
                  explicacion={covResult.explicacion}
                />
                <ResultCard
                  titulo="Correlación"
                  valor={formatNumber(covResult.correlacion, 4)}
                  formula={`r = ${covResult.covarianza.toFixed(4)} / (σX × σY)`}
                  explicacion="Coeficiente de correlación entre -1 y 1"
                />
              </>
            )}
          </div>
        </div>
      )}

      <div className="rounded-md border border-border/40 bg-background/60 p-4">
        <div className="flex items-start gap-3">
          <HelpCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="text-[13px] font-semibold text-foreground">Guía de Uso</p>
            <ul className="space-y-1 text-[13px] text-muted-foreground">
              <li>• Seleccione una sección del menú superior para acceder a diferentes cálculos</li>
              <li>• Los resultados incluyen fórmulas y explicaciones didácticas (click en →)</li>
              <li>• Basado en los manuales AFC 2022 de calculadora financiera (HP 12C / Casio FC-200V)</li>
              <li>• Los cálculos son informativos y no constituyen recomendación de inversión</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
