// @ts-nocheck
import { useState } from "react";
import type { HedgeResult, PlainLanguagePlan } from "@/lib/capm-hedge.types";
import { generatePlainLanguagePlan } from "@/lib/hedge-plain-language";
import { fmtUSD, confiabilidadSemforo, accionIcono } from "@/lib/plain-language-utils";

interface Props {
  result: HedgeResult;
  availableCash: number;
  portfolioValorizado: number;
}

export function HedgePlainLanguagePanel({ result, availableCash, portfolioValorizado }: Props) {
  const [simpleMode, setSimpleMode] = useState(true);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  const plan: PlainLanguagePlan = generatePlainLanguagePlan(
    result,
    availableCash,
    portfolioValorizado,
  );

  if (!simpleMode) return null;

  return (
    <div className="space-y-4 rounded-lg border border-border/40 bg-muted/5 p-5">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="font-mono text-xs font-medium text-foreground">
          Explicación simple de la cobertura
        </h3>
        <button
          onClick={() => setSimpleMode(false)}
          className="rounded border border-border/40 px-2 py-1 font-mono text-[13px] text-muted-foreground hover:text-foreground"
        >
          Ver detalle técnico →
        </button>
      </div>

      {/* Resumen general */}
      <div className="rounded-md border border-border/20 bg-muted/10 p-3">
        <p className="font-mono text-[14px] leading-relaxed text-foreground">
          {plan.resumenGeneral}
        </p>
      </div>

      {/* Situación del saldo */}
      {plan.situacionSaldo.montoNecesarioDepositar != null &&
      plan.situacionSaldo.montoNecesarioDepositar > 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm"></span>
            <p className="font-mono text-[14px] text-warning">{plan.situacionSaldo.mensaje}</p>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-success/40 bg-success/10 p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm"></span>
            <p className="font-mono text-[14px] text-success">{plan.situacionSaldo.mensaje}</p>
          </div>
        </div>
      )}

      {/* Pasos */}
      {plan.pasos.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-mono text-[13px] uppercase tracking-wider text-muted-foreground">
            Pasos a seguir ({plan.pasos.length})
          </h4>
          <div className="space-y-2">
            {plan.pasos.map((paso) => {
              const semaforo = confiabilidadSemforo(paso.confiabilidad);
              const isExpanded = expandedStep === paso.orden;
              return (
                <div
                  key={paso.orden}
                  className="cursor-pointer rounded-md border border-border/30 bg-muted/5 p-3 transition-colors hover:bg-muted/10"
                  onClick={() => setExpandedStep(isExpanded ? null : paso.orden)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2 min-w-0">
                      <span className="mt-0.5 text-sm">{accionIcono(paso.accion)}</span>
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-medium text-foreground">
                          {paso.accion} {paso.instrumento}
                          {paso.cantidad > 0 && (
                            <span className="ml-1 text-muted-foreground">× {paso.cantidad}</span>
                          )}
                        </div>
                        <div className="font-mono text-[13px] text-muted-foreground">
                          {paso.mercado && `${paso.mercado} · `}~{fmtUSD(paso.montoAproximadoUSD)}
                        </div>
                      </div>
                    </div>
                    <span className={`shrink-0 font-mono text-[13px] ${semaforo.color}`}>
                      {semaforo.icono} {semaforo.label}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="mt-3 space-y-2 border-t border-border/20 pt-2">
                      <p className="font-mono text-[13px] leading-relaxed text-foreground">
                        {paso.motivoSimple}
                      </p>
                      {paso.advertencia && (
                        <div className="rounded border border-danger/30 bg-danger/5 p-2">
                          <p className="font-mono text-[13px] text-danger">{paso.advertencia}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resumen de costo */}
      <div className="rounded-md border border-border/20 bg-muted/10 p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[13px] text-muted-foreground">Costo estimado total</span>
          <span className="font-mono text-xs font-semibold text-foreground">
            {fmtUSD(plan.resumenCosto.costoTotalEstimado)}
          </span>
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono text-[13px] text-muted-foreground">Saldo restante</span>
          <span className="font-mono text-xs text-foreground">
            {fmtUSD(plan.resumenCosto.saldoQueTeQuedaria)}
          </span>
        </div>
        <div className="mt-2 pt-2 border-t border-border/20">
          {plan.resumenCosto.esViable ? (
            <p className="font-mono text-[13px] text-success">
              Esto te va a costar aproximadamente {fmtUSD(plan.resumenCosto.costoTotalEstimado)} y
              te van a quedar {fmtUSD(plan.resumenCosto.saldoQueTeQuedaria)} disponibles.
            </p>
          ) : (
            <p className="font-mono text-[13px] text-warning">
              No podés ejecutar esto todavía. Te faltan{" "}
              {fmtUSD(plan.situacionSaldo.montoNecesarioDepositar ?? 0)}.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
