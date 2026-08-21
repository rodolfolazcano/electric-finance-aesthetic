import type { AnalisisCualitativoSemiAutomaticoResult } from "@/lib/analisis-cualitativo-semiautomatico.functions";
import type { FuerzaSenal } from "@/lib/costos-de-cambio.functions";

interface SenalItem {
  nombre: string;
  fuerza: FuerzaSenal;
  detalle: string;
  comparadoConSector?: boolean;
}

function SenalesList({ senales }: { senales: SenalItem[] }) {
  if (senales.length === 0)
    return <p className="text-[13px] text-muted-foreground">Sin datos disponibles.</p>;
  return (
    <div className="space-y-1.5">
      {senales.map((s, i) => {
        const icono =
          s.fuerza === "positiva"
            ? ""
            : s.fuerza === "mixta"
              ? "≈"
              : s.fuerza === "negativa"
                ? ""
                : "—";
        const color =
          s.fuerza === "positiva"
            ? "text-emerald-400"
            : s.fuerza === "mixta"
              ? "text-amber-400"
              : s.fuerza === "negativa"
                ? "text-red-400"
                : "text-muted-foreground";
        return (
          <div key={i} className="rounded border border-border/20 bg-muted/10 p-2">
            <div className="flex items-center gap-2">
              <span className={`text-[14px] font-bold ${color}`}>{icono}</span>
              <span className="text-[13px] font-semibold text-foreground">{s.nombre}</span>
              {s.comparadoConSector === false && (
                <span className="text-[7px] text-muted-foreground/60 border border-border/30 rounded px-1 py-0.5">
                  sin benchmark sectorial
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">{s.detalle}</p>
          </div>
        );
      })}
    </div>
  );
}

function badgeColor(conclusion: string): string {
  if (
    conclusion.includes("Alta") ||
    conclusion === "Altos" ||
    conclusion === "Favorable" ||
    conclusion === "Alto"
  )
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  if (conclusion === "Evidencia insuficiente" || conclusion === "No concluyente")
    return "border-muted-foreground/30 bg-muted/10 text-muted-foreground";
  if (conclusion.includes("Desfavorable") || conclusion === "Bajos" || conclusion === "Bajo")
    return "border-red-500/30 bg-red-500/10 text-red-400";
  return "border-amber-500/30 bg-amber-500/10 text-amber-400";
}

export function AnalisisCualitativoSemiAutomaticoCard({
  data,
}: {
  data: AnalisisCualitativoSemiAutomaticoResult;
}) {
  if (data.esETF) {
    return (
      <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
        <p className="text-[13px] uppercase tracking-widest text-muted-foreground">
          Análisis Cualitativo
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">No aplica para ETFs.</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border/40 bg-background/40/60 p-4">
      <p className="text-[13px] uppercase tracking-widest text-muted-foreground mb-3">
        Análisis Cualitativo (Señales Cuantitativas)
      </p>
      <p className="text-[12px] text-muted-foreground/60 leading-relaxed mb-3 border border-border/20 rounded bg-muted/5 p-2">
        Estas secciones son señales cuantitativas derivadas de datos financieros públicos. No
        reemplazan la lectura de fuentes cualitativas (10-K, noticias, informes de la empresa) para
        entender la causa de estos patrones.
      </p>

      {/* Ventaja Competitiva */}
      {data.ventajaCompetitiva && (
        <details className="mb-2" open>
          <summary className="text-[13px] font-mono font-semibold text-foreground cursor-pointer hover:text-primary transition-colors select-none flex items-center gap-2">
            <span className="text-[12px]"></span>
            Ventaja Competitiva Cuantitativa
            <span
              className={`text-[12px] font-mono px-1.5 py-0.5 rounded border ${badgeColor(data.ventajaCompetitiva.conclusion)}`}
            >
              {data.ventajaCompetitiva.conclusion}
            </span>
          </summary>
          <div className="mt-2 space-y-1.5">
            <SenalesList
              senales={data.ventajaCompetitiva.senales.map((s) => ({
                nombre: s.nombre,
                fuerza: s.fuerza,
                detalle: s.detalle,
                comparadoConSector: s.comparadoConSector,
              }))}
            />
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground/60 border-t border-border/20 pt-1.5 mt-1.5">
              <span>
                Positivas: {data.ventajaCompetitiva.senalesPositivas}/
                {data.ventajaCompetitiva.senalesEvaluadas}
              </span>
              <span>
                Peers con I+D: {data.ventajaCompetitiva.coberturaDatos.peersConRdData}/
                {data.ventajaCompetitiva.coberturaDatos.peersTotal}
              </span>
            </div>
          </div>
        </details>
      )}

      {/* Costos de Cambio */}
      {data.costosDeCambio && (
        <details className="mb-2">
          <summary className="text-[13px] font-mono font-semibold text-foreground cursor-pointer hover:text-primary transition-colors select-none flex items-center gap-2">
            <span className="text-[12px]"></span>
            Costos de Cambio (Switching Costs)
            <span
              className={`text-[12px] font-mono px-1.5 py-0.5 rounded border ${badgeColor(data.costosDeCambio.conclusion)}`}
            >
              {data.costosDeCambio.conclusion}
            </span>
          </summary>
          <div className="mt-2 space-y-1.5">
            <SenalesList
              senales={[
                {
                  nombre: "Resiliencia de margen",
                  fuerza: data.costosDeCambio.resilienciaMargen.fuerza,
                  detalle: data.costosDeCambio.resilienciaMargen.detalle,
                },
              ]}
            />
            <div className="flex items-center gap-3 text-[12px] text-muted-foreground/60 border-t border-border/20 pt-1.5 mt-1.5">
              <span>
                Clasif. sectorial: {data.costosDeCambio.clasificacionSectorEstatica.nivel}
              </span>
              <span>Períodos: {data.costosDeCambio.periodosUsados}</span>
            </div>
          </div>
        </details>
      )}

      {/* Gobierno Corporativo */}
      {data.gobiernoCorporativo && (
        <details className="mb-2">
          <summary className="text-[13px] font-mono font-semibold text-foreground cursor-pointer hover:text-primary transition-colors select-none flex items-center gap-2">
            <span className="text-[12px]"></span>
            Gobierno Corporativo
            <span
              className={`text-[12px] font-mono px-1.5 py-0.5 rounded border ${badgeColor(data.gobiernoCorporativo.conclusion)}`}
            >
              {data.gobiernoCorporativo.conclusion}
            </span>
          </summary>
          <div className="mt-2 space-y-1.5">
            <SenalesList
              senales={[
                {
                  nombre: "Riesgo ISS (accionistas minoritarios)",
                  fuerza: data.gobiernoCorporativo.riesgoISS.fuerza,
                  detalle: data.gobiernoCorporativo.riesgoISS.detalle,
                },
                {
                  nombre: "Dilución vs creación de valor",
                  fuerza: data.gobiernoCorporativo.dilucionVsValor.fuerza,
                  detalle: data.gobiernoCorporativo.dilucionVsValor.detalle,
                },
                {
                  nombre: "Compensación ejecutiva vs performance",
                  fuerza: data.gobiernoCorporativo.compensacionVsPerformance.fuerza,
                  detalle: data.gobiernoCorporativo.compensacionVsPerformance.detalle,
                },
              ]}
            />
          </div>
        </details>
      )}

      {/* Predictibilidad de Ingresos */}
      {data.predictibilidadIngresos && (
        <details className="mb-2">
          <summary className="text-[13px] font-mono font-semibold text-foreground cursor-pointer hover:text-primary transition-colors select-none flex items-center gap-2">
            <span className="text-[12px]"></span>
            Predictibilidad de Ingresos
          </summary>
          <div className="mt-2">
            <div className="rounded border border-border/20 bg-muted/10 p-2">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[14px] font-bold ${
                    data.predictibilidadIngresos.fuerza === "positiva"
                      ? "text-emerald-400"
                      : data.predictibilidadIngresos.fuerza === "mixta"
                        ? "text-amber-400"
                        : "text-red-400"
                  }`}
                >
                  {data.predictibilidadIngresos.fuerza === "positiva"
                    ? ""
                    : data.predictibilidadIngresos.fuerza === "mixta"
                      ? "≈"
                      : ""}
                </span>
                <span className="text-[13px] font-semibold text-foreground">
                  Coeficiente de variación de ingresos
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-muted-foreground leading-relaxed">
                {data.predictibilidadIngresos.detalle}
              </p>
              <p className="mt-1 text-[13px] text-foreground/80 italic">
                {data.predictibilidadIngresos.interpretacion}
              </p>
            </div>
          </div>
        </details>
      )}

      {/* Poder de Fijación de Precios */}
      {data.poderFijacionPrecios && (
        <details className="mb-2">
          <summary className="text-[13px] font-mono font-semibold text-foreground cursor-pointer hover:text-primary transition-colors select-none flex items-center gap-2">
            <span className="text-[12px]"></span>
            Poder de Fijación de Precios
            <span
              className={`text-[12px] font-mono px-1.5 py-0.5 rounded border ${badgeColor(data.poderFijacionPrecios.conclusion)}`}
            >
              {data.poderFijacionPrecios.conclusion}
            </span>
          </summary>
          <div className="mt-2 space-y-1.5">
            <SenalesList
              senales={[
                {
                  nombre: "Resiliencia de margen",
                  fuerza: data.poderFijacionPrecios.resilienciaMargen.fuerza,
                  detalle: data.poderFijacionPrecios.resilienciaMargen.detalle,
                },
                {
                  nombre: "Crecimiento vs costo de ventas",
                  fuerza: data.poderFijacionPrecios.crecimientoIngresosVsCosto.fuerza,
                  detalle: data.poderFijacionPrecios.crecimientoIngresosVsCosto.detalle,
                },
              ]}
            />
          </div>
        </details>
      )}
    </div>
  );
}
