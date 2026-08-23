import React, { useMemo, useState } from "react";
import {
  calcularPlanificacionFinanciera,
  planificacionPorDefecto,
} from "@/lib/planificacion-financiera.functions";
import type {
  PlanificacionInputs,
  PlanificacionFinancieraResult,
} from "@/lib/planificacion-financiera.functions";
import { generarInforme } from "@/lib/informe-financiero.functions";
import type { InformeEconomicoFinanciero } from "@/lib/informe-financiero.functions";

function Num({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step ?? 1}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="rounded-md border border-border/40 bg-background/20 px-2 py-1 text-[13px] font-mono text-foreground outline-none focus:border-emerald-500/50"
      />
    </label>
  );
}

function State({ label, val1, val2 }: { label: string; val1: string; val2: string }) {
  return (
    <tr className="border-b border-border/10 last:border-0">
      <td className="py-1 pr-3 text-[13px] text-muted-foreground">{label}</td>
      <td className="py-1 text-[13px] font-mono text-right text-foreground">{val1}</td>
      <td className="py-1 text-[13px] font-mono text-right text-foreground">{val2}</td>
    </tr>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <td
        colSpan={3}
        className="pt-3 pb-1 text-[13px] font-semibold uppercase tracking-widest text-muted-foreground/60"
      >
        {children}
      </td>
    </tr>
  );
}

function fmt(v: number): string {
  if (!isFinite(v)) return "--";
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)} B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)} M`;
  return v.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

function fmt2(v: number | null): string {
  if (v == null || !isFinite(v)) return "--";
  return v.toFixed(2);
}

function fmtPct(v: number | null, alreadyPct = false): string {
  if (v == null) return "--";
  const val = alreadyPct ? v : v * 100;
  return `${val.toFixed(1)}%`;
}

export function PlanificacionFinancieraTab() {
  const [inputs, setInputs] = useState<PlanificacionInputs>(planificacionPorDefecto());
  const [empresa, setEmpresa] = useState("");

  const set = (path: (string | number)[]) => (value: number) => {
    setInputs((prev) => {
      const copy = JSON.parse(JSON.stringify(prev));
      let node: any = copy;
      for (let i = 0; i < path.length - 1; i++) node = node[path[i] as string];
      node[path[path.length - 1] as string] = value;
      return copy;
    });
  };

  const resultado = useMemo<PlanificacionFinancieraResult>(
    () => calcularPlanificacionFinanciera(inputs),
    [inputs],
  );
  const informe = useMemo<InformeEconomicoFinanciero>(
    () => generarInforme(resultado, empresa || inputs.nombreEmpresa),
    [resultado, empresa, inputs.nombreEmpresa],
  );

  const v = inputs.ventas;
  const p = inputs.produccion;
  const inv = inputs.inversiones;
  const fin = inputs.financiamiento;
  const caja = inputs.caja;
  const rp = resultado.presupuestoVentas;
  const rpp = resultado.presupuestoProduccion;
  const ri = resultado.presupuestoInversiones;
  const rf = resultado.planFinanciero;
  const rfwd = resultado.ratiosForward;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/40 bg-background/60 p-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
          Planificación financiera de corto plazo · caso Pascale (Cap. 37)
        </p>
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">
          Configure los presupuestos de ventas, producción, inversiones y el plan financiero para
          generar el Presupuesto del fluir de caja (PFC), de resultados (PER) y de situación (PES)
          proyectados, más las razones forward y el informe profesional (Biondi, Cap. 7).
        </p>

        <div className="grid w-full grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Ventas */}
          <div className="rounded border border-border/20 bg-muted/10 p-3 space-y-2">
            <p className="text-[13px] font-semibold text-foreground">Presupuesto de ventas</p>
            <Num
              label="UD/mes S1"
              value={v.unidadesMes1}
              onChange={set(["ventas", "unidadesMes1"])}
            />
            <Num
              label="Precio S1"
              value={v.precio1}
              onChange={set(["ventas", "precio1"])}
              step={0.1}
            />
            <Num
              label="UD/mes S2"
              value={v.unidadesMes2}
              onChange={set(["ventas", "unidadesMes2"])}
            />
            <Num
              label="Precio S2"
              value={v.precio2}
              onChange={set(["ventas", "precio2"])}
              step={0.1}
            />
            <Num
              label="Plazo cobro (días)"
              value={v.plazoCobroDias}
              onChange={set(["ventas", "plazoCobroDias"])}
            />
            <Num
              label="Stock inicial créditos"
              value={v.stockInicialCreditos}
              onChange={set(["ventas", "stockInicialCreditos"])}
              step={10000}
            />
          </div>
          {/* Producción */}
          <div className="rounded border border-border/20 bg-muted/10 p-3 space-y-2">
            <p className="text-[13px] font-semibold text-foreground">Producción</p>
            <Num
              label="Costo var unit S1"
              value={p.costoVariableUnit1}
              onChange={set(["produccion", "costoVariableUnit1"])}
              step={0.1}
            />
            <Num
              label="Costo var unit S2"
              value={p.costoVariableUnit2}
              onChange={set(["produccion", "costoVariableUnit2"])}
              step={0.1}
            />
            <Num
              label="Costos fijos S1"
              value={p.costosFijos1}
              onChange={set(["produccion", "costosFijos1"])}
              step={10000}
            />
            <Num
              label="Costos fijos S2"
              value={p.costosFijos2}
              onChange={set(["produccion", "costosFijos2"])}
              step={10000}
            />
            <Num
              label="Meses de stock"
              value={p.mesesStock}
              onChange={set(["produccion", "mesesStock"])}
            />
            <Num
              label="Stock inicial MP"
              value={p.stockInicialMP}
              onChange={set(["produccion", "stockInicialMP"])}
              step={10000}
            />
            <Num
              label="Stock inicial PT"
              value={p.stockInicialPT}
              onChange={set(["produccion", "stockInicialPT"])}
              step={10000}
            />
            <Num
              label="Plazo proveedores (días)"
              value={p.plazoPagoProveedoresDias}
              onChange={set(["produccion", "plazoPagoProveedoresDias"])}
            />
          </div>
          {/* Inversiones */}
          <div className="rounded-2xl border border-border/20 bg-muted/10 p-3 space-y-2">
            <p className="text-[13px] font-semibold text-foreground">Inversiones</p>
            <Num
              label="Compra activo fijo"
              value={inv.compraActivoFijo}
              onChange={set(["inversiones", "compraActivoFijo"])}
              step={10000}
            />
            <Num
              label="% contado"
              value={inv.pctContadoCompra}
              onChange={(n) => set(["inversiones", "pctContadoCompra"])(n / 100)}
              step={0.05}
            />
            <Num label="Cuotas" value={inv.cuotas} onChange={set(["inversiones", "cuotas"])} />
            <Num
              label="Tasa inter. compra"
              value={inv.tasaInteresCompra}
              onChange={(n) => set(["inversiones", "tasaInteresCompra"])(n / 100)}
              step={0.01}
            />
            <Num
              label="Venta activo fijo"
              value={inv.ventaActivoFijo}
              onChange={set(["inversiones", "ventaActivoFijo"])}
              step={10000}
            />
            <Num
              label="Depreciación"
              value={inv.depreciacion}
              onChange={set(["inversiones", "depreciacion"])}
              step={10000}
            />
          </div>
          {/* Financiamiento + caja */}
          <div className="rounded-md border border-border/20 bg-muted/10 p-3 space-y-2">
            <p className="text-[13px] font-semibold text-foreground">Financiamiento · Caja</p>
            <Num
              label="Préstamo bancario inicial"
              value={fin.prestamoBancarioInicial}
              onChange={set(["financiamiento", "prestamoBancarioInicial"])}
              step={10000}
            />
            <Num
              label="Tasa préstamo bancario"
              value={fin.tasaPrestamoBancario}
              onChange={(n) => set(["financiamiento", "tasaPrestamoBancario"])(n / 100)}
              step={0.01}
            />
            <Num
              label="Deuda LP inicial"
              value={fin.deudaLargoPlazoInicial}
              onChange={set(["financiamiento", "deudaLargoPlazoInicial"])}
              step={10000}
            />
            <Num
              label="Tasa deuda LP"
              value={fin.tasaDeudaLargoPlazo}
              onChange={(n) => set(["financiamiento", "tasaDeudaLargoPlazo"])(n / 100)}
              step={0.01}
            />
            <Num
              label="Tasa línea crédito"
              value={fin.lineaCreditoTasa}
              onChange={(n) => set(["financiamiento", "lineaCreditoTasa"])(n / 100)}
              step={0.01}
            />
            <Num
              label="Dividendos"
              value={fin.dividendosEfectivo}
              onChange={set(["financiamiento", "dividendosEfectivo"])}
              step={10000}
            />
            <Num
              label="Tasa impuesto"
              value={fin.tasaImpuesto}
              onChange={(n) => set(["financiamiento", "tasaImpuesto"])(n / 100)}
              step={0.01}
            />
            <Num
              label="Caja inicial"
              value={caja.inicial}
              onChange={set(["caja", "inicial"])}
              step={10000}
            />
            <Num
              label="Caja mínima"
              value={caja.minimo}
              onChange={set(["caja", "minimo"])}
              step={10000}
            />
          </div>
        </div>
      </div>

      {/* PER */}
      <div className="rounded-md border border-border/40 bg-background/60 p-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
          PER · Presupuesto del estado de resultados
        </p>
        <table className="w-full">
          <tbody>
            <State label="Ventas" val1={fmt(resultado.per.ventas)} val2="" />
            <State
              label="Costo de productos vendidos"
              val1={fmt(resultado.per.costoVentas)}
              val2=""
            />
            <State label="Margen bruto" val1={fmt(resultado.per.margenBruto)} val2="" />
            <State label="Gastos fijos" val1={fmt(resultado.per.costosFijos)} val2="" />
            <State
              label="Resultado venta activo fijo"
              val1={fmt(resultado.per.resultadoVentaActivoFijo)}
              val2=""
            />
            <State label="GAII (EBIT)" val1={fmt(resultado.per.gaii)} val2="" />
            <State label="Intereses" val1={fmt(resultado.per.intereses)} val2="" />
            <State label="Ganancia antes de impuestos" val1={fmt(resultado.per.gai)} val2="" />
            <State label="Impuesto" val1={fmt(resultado.per.impuesto)} val2="" />
            <State label="Ganancia neta" val1={fmt(resultado.per.gananciaNeta)} val2="" />
          </tbody>
        </table>
      </div>

      {/* PES */}
      <div className="rounded-md border border-border/40 bg-background/60 p-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
          PES · Presupuesto del estado de situación
        </p>
        <table className="w-full">
          <tbody>
            <SectionTitle>Activo</SectionTitle>
            <State label="Caja y bancos" val1={fmt(resultado.pes.caja)} val2="" />
            <State label="Créditos por ventas" val1={fmt(resultado.pes.creditos)} val2="" />
            <State label="Materias primas" val1={fmt(resultado.pes.stockMP)} val2="" />
            <State label="Productos terminados" val1={fmt(resultado.pes.stockPT)} val2="" />
            <State
              label="Total activo corriente"
              val1={fmt(resultado.pes.totalActivoCorriente)}
              val2=""
            />
            <State label="Activo fijo neto" val1={fmt(resultado.pes.activoFijoNeto)} val2="" />
            <State label="Total activo" val1={fmt(resultado.pes.totalActivo)} val2="" />
            <SectionTitle>Pasivo y Patrimonio</SectionTitle>
            <State label="Proveedores" val1={fmt(resultado.pes.proveedores)} val2="" />
            <State
              label="Préstamos bancarios"
              val1={fmt(resultado.pes.prestamosBancarios)}
              val2=""
            />
            <State label="Acreedores compra" val1={fmt(resultado.pes.acreedoresCompra)} val2="" />
            <State
              label="Otros pasivos corrientes"
              val1={fmt(resultado.pes.otrosPasivosCorrientes)}
              val2=""
            />
            <State
              label="Total pasivo corriente"
              val1={fmt(resultado.pes.totalPasivoCorriente)}
              val2=""
            />
            <State label="Deuda largo plazo" val1={fmt(resultado.pes.deudaLargoPlazo)} val2="" />
            <State
              label="Patrimonio neto final"
              val1={fmt(resultado.pes.patrimonioFinal)}
              val2=""
            />
            <State
              label="Total pasivo + patrimonio"
              val1={fmt(resultado.pes.totalPasivoPatrimonio)}
              val2=""
            />
          </tbody>
        </table>
      </div>

      {/* PFC */}
      <div className="rounded-md border border-border/40 bg-background/60 p-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
          PFC · Presupuesto del fluir de caja
        </p>
        <table className="w-full">
          <tbody>
            <State label="Cobranzas S1 / S2" val1={fmt(rp.cobranzas1)} val2={fmt(rp.cobranzas2)} />
            <State
              label="Pagos proveedores S1 / S2"
              val1={fmt(rpp.pagosProveedores1)}
              val2={fmt(rpp.pagosProveedores2)}
            />
            <State
              label="Inversiones S1 / S2"
              val1={fmt(ri.pagosInversion1)}
              val2={fmt(ri.pagosInversion2)}
            />
            <State
              label="Flujo neto S1 / S2"
              val1={fmt(resultado.pfc.flujoNeto1)}
              val2={fmt(resultado.pfc.flujoNeto2)}
            />
            <State
              label="Caja final S1 / S2"
              val1={fmt(resultado.pfc.cajaFinal1)}
              val2={fmt(resultado.pfc.cajaFinal2)}
            />
          </tbody>
        </table>
      </div>

      {/* Ratios forward */}
      <div className="rounded-md border border-border/40 bg-background/60 p-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
          Razones forward (estados proyectados)
        </p>
        <table className="w-full">
          <tbody>
            <SectionTitle>Liquidez</SectionTitle>
            <State label="Razón circulante" val1={fmt2(rfwd.liquidez.razonCirculante)} val2="" />
            <State label="Razón rápida" val1={fmt2(rfwd.liquidez.razonRapida)} val2="" />
            <State
              label="Capital de trabajo"
              val1={fmt(rfwd.liquidez.capitalTrabajo ?? 0)}
              val2=""
            />
            <SectionTitle>Actividad</SectionTitle>
            <State
              label="Rotación de inventarios (x)"
              val1={fmt2(rfwd.actividad.rotacionInventarios)}
              val2=""
            />
            <State label="DSO (días)" val1={fmt2(rfwd.actividad.dso)} val2="" />
            <State
              label="Rotación activos totales (x)"
              val1={fmt2(rfwd.actividad.rotacionActivosTotales)}
              val2=""
            />
            <SectionTitle>Endeudamiento y rentabilidad</SectionTitle>
            <State label="Razón de deuda" val1={fmtPct(rfwd.endeudamiento.razonDeuda)} val2="" />
            <State
              label="Deuda/Patrimonio (x)"
              val1={fmt2(rfwd.endeudamiento.deudaPatrimonio)}
              val2=""
            />
            <State label="TIE (x)" val1={fmt2(rfwd.endeudamiento.tie)} val2="" />
            <State
              label="Margen de utilidad"
              val1={fmtPct(rfwd.rentabilidad.margenUtilidad)}
              val2=""
            />
            <State label="ROA" val1={fmtPct(rfwd.rentabilidad.roa)} val2="" />
            <State label="ROE" val1={fmtPct(rfwd.rentabilidad.roe, true)} val2="" />
            <SectionTitle>DuPont proyectado</SectionTitle>
            <State
              label="ROE DuPont (margen × rot. × mult.)"
              val1={rfwd.dupont.roeDupont != null ? `${rfwd.dupont.roeDupont.toFixed(1)}%` : "--"}
              val2=""
            />
          </tbody>
        </table>
      </div>

      {/* Observaciones */}
      {resultado.observaciones.length > 0 && (
        <div className="rounded-md border border-border/40 bg-background/60 p-4">
          <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
            Observaciones del plan
          </p>
          <ul className="space-y-1">
            {resultado.observaciones.map((o, i) => (
              <li key={i} className="text-[13px] leading-relaxed text-muted-foreground flex gap-1.5">
                <span className="text-emerald-400/70 shrink-0">•</span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Informe (Biondi Cap. 7) */}
      <div className="rounded-md border border-border/40 bg-background/60 p-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-2">
          Informe profesional ({informe.empresa})
        </p>
        <p className="text-[13px] font-semibold text-foreground mb-1">{informe.denominacion}</p>

        <div className="text-[13px] text-muted-foreground leading-relaxed mb-3 space-y-1">
          <p>
            Fui requerido por {informe.empresa} para emitir opinión sobre la situación económica y
            financiera.
          </p>
          <p className="text-[12px]">
            1. Estados contables objeto del análisis: PER, PES y PFC proyectados (
            {informe.alcance.join(" ")})
          </p>
          <p className="text-[12px]">2. Alcance: {informe.aclaraciones[0]}</p>
          <p className="text-[12px]">{informe.aclaraciones[2]}</p>
        </div>

        <div className="mb-2">
          <p className="text-[13px] font-semibold text-foreground mb-1">Situación económica</p>
          <ul className="space-y-0.5">
            {informe.situacionEconomica.map((s, i) => (
              <li key={i} className="text-[13px] text-muted-foreground flex gap-1.5">
                <span className="text-emerald-400/70 shrink-0">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-3">
          <p className="text-[13px] font-semibold text-foreground mb-1">Situación financiera</p>
          <ul className="space-y-0.5">
            {informe.situacionFinanciera.map((s, i) => (
              <li key={i} className="text-[13px] text-muted-foreground flex gap-1.5">
                <span className="text-emerald-400/70 shrink-0">•</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Tabla comparativa real vs preestablecido */}
        <p className="text-[13px] font-semibold text-foreground mb-1">
          Comparación real vs. preestablecida (variación %)
        </p>
        <div className="overflow-x-auto mb-3">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/20">
                <th className="text-left text-[12px] text-muted-foreground py-1 pr-2">Concepto</th>
                <th className="text-right text-[12px] text-muted-foreground py-1 pr-2">Real</th>
                <th className="text-right text-[12px] text-muted-foreground py-1 pr-2">Preest.</th>
                <th className="text-right text-[12px] text-muted-foreground py-1 pr-2">Var %</th>
                <th className="text-left text-[12px] text-muted-foreground py-1">Recomendación</th>
              </tr>
            </thead>
            <tbody>
              {informe.tablaComparativa.map((it, i) => (
                <tr key={i} className="border-b border-border/10 last:border-0">
                  <td className="py-1 pr-2 text-[13px] text-muted-foreground">{it.concepto}</td>
                  <td className="py-1 pr-2 text-[13px] font-mono text-right text-foreground">
                    {it.real != null ? fmt2(it.real) : "--"}
                  </td>
                  <td className="py-1 pr-2 text-[13px] font-mono text-right text-foreground">
                    {it.preestablecido != null ? fmt2(it.preestablecido) : "--"}
                  </td>
                  <td
                    className={`py-1 pr-2 text-[13px] font-mono text-right ${it.variacionPct != null && (it.variacionPct > 20 || it.variacionPct < -20) ? "text-amber-400" : "text-foreground"}`}
                  >
                    {it.variacionPct != null
                      ? `${it.variacionPct >= 0 ? "+" : ""}${it.variacionPct.toFixed(1)}%`
                      : "--"}
                  </td>
                  <td className="py-1 text-[12px] text-muted-foreground">{it.recomendacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mb-2">
          <p className="text-[13px] font-semibold text-foreground mb-1">
            Conclusiones y recomendaciones
          </p>
          <ul className="space-y-1">
            {informe.conclusiones.map((c, i) => (
              <li key={`c${i}`} className="text-[13px] text-muted-foreground flex gap-1.5">
                <span className="text-emerald-400/70 shrink-0">•</span>
                <span>{c}</span>
              </li>
            ))}
            {informe.recomendaciones.map((r, i) => (
              <li key={`r${i}`} className="text-[13px] text-amber-300/90 flex gap-1.5">
                <span className="text-amber-400/70 shrink-0">→</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[12px] text-muted-foreground/60 mt-2 text-right">{informe.fecha}</p>
      </div>
    </div>
  );
}
