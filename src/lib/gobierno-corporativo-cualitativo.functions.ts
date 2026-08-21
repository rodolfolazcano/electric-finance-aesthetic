// @ts-nocheck
import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import { calcularDilucion } from "./valuacion.functions";
import type { FuerzaSenal } from "./costos-de-cambio.functions";

export interface SenalGobierno {
  fuerza: FuerzaSenal;
  detalle: string;
  valorOriginal?: number | null;
}

export interface GobiernoCorporativoCualitativoResult {
  symbol: string;
  riesgoISS: SenalGobierno;
  dilucionVsValor: SenalGobierno;
  compensacionVsPerformance: SenalGobierno;
  conclusion: "Favorable" | "Mixto" | "Desfavorable" | "Evidencia insuficiente";
  advertenciaMetodologica: string;
}

function obtenerCeo(
  result: FundamentalAFResult,
): { nombre: string; compensacion: number | null } | null {
  if (!result.companyOfficers || result.companyOfficers.length === 0) return null;
  const ceo = result.companyOfficers.find(
    (o) => o.cargo?.includes("Chief Executive") || o.cargo?.includes("CEO"),
  );
  const target = ceo ?? result.companyOfficers[0];
  return { nombre: target.nombre, compensacion: target.compensacionAnual };
}

export function calcularGobiernoCorporativoCualitativo(
  result: FundamentalAFResult,
  historico: PeriodoHistoricoRow[] | null,
): GobiernoCorporativoCualitativoResult {
  if (result.esETF) {
    return {
      symbol: result.symbol,
      riesgoISS: { fuerza: "no_disponible", detalle: "No aplica para ETFs." },
      dilucionVsValor: { fuerza: "no_disponible", detalle: "No aplica para ETFs." },
      compensacionVsPerformance: { fuerza: "no_disponible", detalle: "No aplica para ETFs." },
      conclusion: "Evidencia insuficiente",
      advertenciaMetodologica: "No aplica para ETFs.",
    };
  }

  //  Señal 1: Riesgo ISS (trato a minoritarios) 
  const sr = result.governanceRiskScores?.shareHolderRightsRisk;
  let riesgoISS: SenalGobierno;
  if (sr == null) {
    riesgoISS = {
      fuerza: "no_disponible",
      detalle:
        "Yahoo Finance no reporta governanceRiskScores para este ticker (común fuera de EE.UU.).",
      valorOriginal: null,
    };
  } else {
    const fuerza: FuerzaSenal = sr <= 3 ? "positiva" : sr <= 7 ? "mixta" : "negativa";
    const label = sr <= 3 ? "Bajo" : sr <= 7 ? "Medio" : "Alto";
    riesgoISS = {
      fuerza,
      detalle: `Riesgo de derechos de accionistas minoritarios según ISS: puntaje ${sr}/10 (${label}). Metodología ISS sobre dual-class shares, poison pills y derechos de voto.`,
      valorOriginal: sr,
    };
  }

  //  Señal 2: Dilución vs creación de valor 
  let dilucionVsValor: SenalGobierno;
  const dilucion = calcularDilucion(result);
  if (dilucion.variacionPct == null) {
    dilucionVsValor = {
      fuerza: "no_disponible",
      detalle: "Sin datos de dilutedAverageShares para calcular dilución.",
    };
  } else {
    const roe = result.returnOnEquity;
    const ni = result.netIncomeFromIS;
    const diluye = dilucion.variacionPct > 0.5;
    const creaValor = (roe != null && roe > 0.12) || (ni != null && ni > 0);

    if (!diluye) {
      dilucionVsValor = {
        fuerza: "positiva",
        detalle: `Sin dilución neta (variación de acciones: ${dilucion.variacionPct > 0 ? "+" : ""}${dilucion.variacionPct}%) — estructura accionaria estable.${dilucion.interpretacion ? " " + dilucion.interpretacion : ""}`,
      };
    } else if (creaValor) {
      dilucionVsValor = {
        fuerza: "mixta",
        detalle: `Dilución neta del ${dilucion.variacionPct > 0 ? "+" : ""}${dilucion.variacionPct}% acompañada de ${roe != null ? `ROE de ${(roe * 100).toFixed(1)}%` : "resultado positivo"} — posiblemente emisión para crecimiento, requiere verificar uso de fondos.`,
      };
    } else {
      dilucionVsValor = {
        fuerza: "negativa",
        detalle: `Dilución neta del ${dilucion.variacionPct > 0 ? "+" : ""}${dilucion.variacionPct}% sin evidencia de creación de valor proporcional — posible licuación al accionista sin contrapartida.`,
      };
    }
  }

  //  Señal 3: Compensación ejecutiva vs performance 
  let compensacionVsPerformance: SenalGobierno;
  const ceo = obtenerCeo(result);

  if (!ceo || ceo.compensacion == null) {
    compensacionVsPerformance = {
      fuerza: "no_disponible",
      detalle: "Sin datos de compensación ejecutiva disponibles en Yahoo Finance.",
    };
  } else {
    const periodos = (historico ?? []).filter((p) => p.netMargin != null).length;
    const roeOk = result.returnOnEquity != null && result.returnOnEquity > 0.1;
    const perfLabel = roeOk
      ? "rentabilidad sobre patrimonio positiva (>10%)"
      : "rentabilidad moderada o negativa";

    const baseDetalle = `CEO${ceo.nombre !== "—" ? " (" + ceo.nombre + ")" : ""} con compensación anual de USD ${(ceo.compensacion / 1_000_000).toFixed(1)}M. Performance de la empresa: ${perfLabel}.`;
    const debilidad =
      " Señal débil: un solo punto de dato de compensación, sin serie histórica de pago ejecutivo disponible en Yahoo Finance.";

    if (roeOk) {
      compensacionVsPerformance = { fuerza: "mixta", detalle: baseDetalle + debilidad };
    } else {
      compensacionVsPerformance = { fuerza: "negativa", detalle: baseDetalle + debilidad };
    }
  }

  //  Conclusión 
  const fuerzas = [
    riesgoISS.fuerza,
    dilucionVsValor.fuerza,
    compensacionVsPerformance.fuerza,
  ].filter((f) => f !== "no_disponible");
  const positivas = fuerzas.filter((f) => f === "positiva").length;
  const negativas = fuerzas.filter((f) => f === "negativa").length;

  let conclusion: GobiernoCorporativoCualitativoResult["conclusion"];
  if (fuerzas.length === 0) {
    conclusion = "Evidencia insuficiente";
  } else if (positivas >= 2 && negativas === 0) {
    conclusion = "Favorable";
  } else if (negativas >= 2) {
    conclusion = "Desfavorable";
  } else {
    conclusion = "Mixto";
  }

  return {
    symbol: result.symbol,
    riesgoISS,
    dilucionVsValor,
    compensacionVsPerformance,
    conclusion,
    advertenciaMetodologica:
      "Combina un dato de tercero (ISS) con 2 proxies financieros propios. No reemplaza la lectura de proxy statements (DEF 14A) reales para decisiones puntuales de gobierno corporativo.",
  };
}
