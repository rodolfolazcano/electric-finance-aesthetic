import type { PlanificacionFinancieraResult } from "./planificacion-financiera.functions";

// ---------------------------------------------------------------------------
// Informe sobre análisis económico-financiero — metodología Biondi (Cap. 7)
// Estructura tipo del informe profesional:
//   1. Estados contables objeto del análisis
//   2. Alcance del informe
//   3. Aclaraciones previas
//   4. Situación económica
//   5. Situación financiera
// Incluye comparación real vs. preestablecido con variación % y recomendaciones.
// ---------------------------------------------------------------------------

export interface ItemInforme {
  concepto: string;
  real: number | null;
  preestablecido: number | null;
  variacionPct: number | null;
  recomendacion: string;
}

export interface InformeEconomicoFinanciero {
  denominacion: string;
  empresa: string;
  alcance: string[];
  aclaraciones: string[];
  situacionEconomica: string[];
  situacionFinanciera: string[];
  tablaComparativa: ItemInforme[];
  conclusiones: string[];
  recomendaciones: string[];
  fecha: string;
}

function pctParam(real: number | null, pre: number): number | null {
  if (real == null) return null;
  return Math.round(((real - pre) / Math.abs(pre)) * 100 * 100) / 100;
}

export function generarInforme(
  resultado: PlanificacionFinancieraResult,
  empresa?: string,
): InformeEconomicoFinanciero {
  const rf = resultado.ratiosForward;
  const empresaUso = empresa ?? resultado.inputs.nombreEmpresa;

  const items: ItemInforme[] = [
    {
      concepto: "Liquidez corriente",
      real: rf.liquidez.razonCirculante,
      preestablecido: 1.5,
      variacionPct: pctParam(rf.liquidez.razonCirculante, 1.5),
      recomendacion:
        rf.liquidez.razonCirculante != null && rf.liquidez.razonCirculante < 1.5
          ? "Aumentar holgura de corto plazo; controlar pasivo corriente."
          : "Nivel adecuado.",
    },
    {
      concepto: "Liquidez ácida",
      real: rf.liquidez.razonRapida,
      preestablecido: 1.0,
      variacionPct: pctParam(rf.liquidez.razonRapida, 1.0),
      recomendacion:
        rf.liquidez.razonRapida != null && rf.liquidez.razonRapida < 1.0
          ? "Vigilar la dependencia de inventarios para la cobertura inmediata."
          : "Cobertura inmediata aceptable.",
    },
    {
      concepto: "Rotación de inventarios (x)",
      real: rf.actividad.rotacionInventarios,
      preestablecido: 3.0,
      variacionPct: pctParam(rf.actividad.rotacionInventarios, 3.0),
      recomendacion: "Revisar la política de stocks contra el promedio industrial.",
    },
    {
      concepto: "DSO (días)",
      real: rf.actividad.dso,
      preestablecido: 60,
      variacionPct: pctParam(rf.actividad.dso, 60),
      recomendacion:
        rf.actividad.dso != null && rf.actividad.dso > 60
          ? "Acortar el plazo de cobro a clientes para liberar capital de trabajo."
          : "Política de cobranza razonable.",
    },
    {
      concepto: "Endeudamiento (deuda/patrimonio, x)",
      real: rf.endeudamiento.deudaPatrimonio,
      preestablecido: 1.0,
      variacionPct: pctParam(rf.endeudamiento.deudaPatrimonio, 1.0),
      recomendacion: "Analizar la capacidad de servicio de la deuda con los flujos proyectados.",
    },
    {
      concepto: "ROE proyectado (%)",
      real: rf.rentabilidad.roe != null ? rf.rentabilidad.roe * 100 : null,
      preestablecido: 15,
      variacionPct: rf.rentabilidad.roe != null ? pctParam(rf.rentabilidad.roe * 100, 15) : null,
      recomendacion:
        rf.rentabilidad.roe != null && rf.rentabilidad.roe * 100 < 15
          ? "Escasa rentabilidad para capitalizar; revisar estructura de costos."
          : "Rentabilidad del capital propio aceptable.",
    },
    {
      concepto: "Margen de utilidad neta (%)",
      real: rf.rentabilidad.margenUtilidad != null ? rf.rentabilidad.margenUtilidad * 100 : null,
      preestablecido: 10,
      variacionPct:
        rf.rentabilidad.margenUtilidad != null
          ? pctParam(rf.rentabilidad.margenUtilidad * 100, 10)
          : null,
      recomendacion: "Vigilar la evolución de costos variables y fijos respecto de las ventas.",
    },
  ];

  const situacionEconomica: string[] = [];
  const roe = rf.rentabilidad.roe;
  if (roe != null) {
    situacionEconomica.push(
      `La rentabilidad proyectada del capital propio es de ${(roe * 100).toFixed(1)}%.`,
    );
    situacionEconomica.push(
      roe * 100 >= 15
        ? "Dentro de parámetros aceptables para este tipo de actividad."
        : "Por debajo del parámetro de referencia — tendencia a revisar.",
    );
  }
  if (rf.endeudamiento.deudaPatrimonio != null) {
    situacionEconomica.push(
      `La utilización del capital ajeno resulta ${
        rf.endeudamiento.deudaPatrimonio <= 1 ? "conveniente" : "elevada"
      } (deuda/patrimonio ${rf.endeudamiento.deudaPatrimonio.toFixed(2)}x).`,
    );
  }
  if (rf.dupont.roeDupont != null) {
    situacionEconomica.push(
      `Descomposición DuPont (ROE = margen × rotación × multiplicador): ${rf.dupont.roeDupont.toFixed(1)}%.`,
    );
  }

  const situacionFinanciera: string[] = [];
  const rc = rf.liquidez.razonCirculante;
  if (rc != null) {
    situacionFinanciera.push(
      `Liquidez corriente proyectada: ${rc.toFixed(2)}, lo cual implica ${
        rc >= 1.5 ? "fluidez" : rc >= 1 ? "cobertura ajustada" : "pesadez"
      } para atender las obligaciones de corto plazo.`,
    );
  }
  if (rf.actividad.dso != null) {
    situacionFinanciera.push(
      `Ciclo operativo (proxy DSO): ${rf.actividad.dso.toFixed(0)} días — considerado ${
        rf.actividad.dso > 90 ? "excesivo" : rf.actividad.dso > 45 ? "normal" : "corto"
      }.`,
    );
  }

  const conclusiones: string[] = [];
  conclusiones.push(
    `El presupuesto de corto plazo proyecta una utilidad neta de ${resultado.per.gananciaNeta.toFixed(0)} sobre ventas de ${resultado.per.ventas.toLocaleString()}.`,
  );
  if (rf.endeudamiento.tie != null) {
    conclusiones.push(
      `La cobertura de intereses (TIE) proyectada es de ${rf.endeudamiento.tie.toFixed(1)}x.`,
    );
  }

  return {
    denominacion: "Informe sobre análisis económico-financiero",
    empresa: empresaUso,
    aclaraciones: [
      "Las cifras se expresan a valores constantes al cierre del ejercicio proyectado.",
      "La comparación se realiza contra parámetros de referencia generales; se recomienda contrastar con promedios del sector y de la propia empresa.",
      "Las opiniones no constituyen recomendaciones de auditoría operativa (Biondi, Cap. 7).",
    ],
    alcance: [
      "Presupuesto de ventas, producción, inversiones y plan financiero (Pascale, Cap. 37).",
      "Estados proyectados: Presupuesto del fluir de caja (PFC), Presupuesto del estado de resultados (PER) y Presupuesto del estado de situación (PES).",
      "Cálculo de razones forward sobre los estados proyectados.",
    ],
    situacionEconomica,
    situacionFinanciera,
    tablaComparativa: items,
    conclusiones,
    recomendaciones: resultado.observaciones,
    fecha: new Date().toISOString().slice(0, 10),
  };
}
