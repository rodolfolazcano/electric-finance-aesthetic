// @ts-nocheck
import type {
  HedgeResult,
  PlainLanguagePlan,
  PlainLanguageStep,
  HedgeOrderConsolidada,
} from "./capm-hedge.types";
import { fmtUSD, betaExplicacion, r2Explicacion } from "./plain-language-utils";

export function generatePlainLanguagePlan(
  result: HedgeResult,
  availableCash: number,
  portfolioValorizado: number,
): PlainLanguagePlan {
  const pasos: PlainLanguageStep[] = [];
  const ordenes = result.ordenesConsolidadas ?? [];

  // Resumen general
  const posicionesCubiertas = result.results.length;
  const posicionesFallidas = result.failedPositions?.length ?? 0;
  const posicionesExcluidas = result.excludedTickers?.length ?? 0;
  const totalPerdida = result.results
    .filter((r) => r.position.alpha < 0)
    .reduce((s, r) => s + Math.abs(r.position.alpha), 0);

  let resumenGeneral = `Tenés ${fmtUSD(portfolioValorizado)} invertidos`;
  if (posicionesCubiertas > 0) {
    resumenGeneral += `, de los cuales ${fmtUSD(result.totalCosto)} están en posiciones que se pueden cubrir`;
  }
  if (totalPerdida > 0) {
    resumenGeneral += `. Las posiciones cubiertas tienen un alpha negativo promedio de ${((totalPerdida / Math.max(1, posicionesCubiertas)) * 100).toFixed(1)}%`;
  }
  resumenGeneral += ".";

  if (posicionesFallidas > 0) {
    resumenGeneral += ` No se pudo calcular cobertura para ${posicionesFallidas} posición(es).`;
  }
  if (posicionesExcluidas > 0) {
    resumenGeneral += ` ${posicionesExcluidas} ticker(s) se excluyeron por datos insuficientes.`;
  }

  // Situación del saldo
  const algunaNoEjecutable = result.results.some((r) => !r.postHedge.ejecutable);
  const depositoMaximoNecesario = Math.max(
    0,
    ...result.results.map((r) => r.postHedge.depositoMinimoSugerido),
    0,
  );

  let situacionSaldoMensaje: string;
  let montoNecesarioDepositar: number | null = null;

  if (result.coberturaParcial) {
    situacionSaldoMensaje = `Con ${fmtUSD(availableCash)} disponibles, solo podés cubrir el ${result.coberturaPct}% del total necesario (${fmtUSD(result.totalCosto)}).`;
    montoNecesarioDepositar = result.totalCosto - availableCash;
    situacionSaldoMensaje += ` Necesitás depositar al menos ${fmtUSD(montoNecesarioDepositar)} más para cubrir todo.`;
  } else if (algunaNoEjecutable) {
    situacionSaldoMensaje = `Con ${fmtUSD(availableCash)} disponibles, la cobertura es viable en términos de saldo, pero algunos instrumentos requieren montos mínimos mayores.`;
    if (depositoMaximoNecesario > 0) {
      montoNecesarioDepositar = depositoMaximoNecesario;
      situacionSaldoMensaje += ` Necesitás al menos ${fmtUSD(depositoMaximoNecesario)} para que todas las órdenes sean ejecutables.`;
    }
  } else {
    situacionSaldoMensaje = `Con ${fmtUSD(availableCash)} disponibles, podés ejecutar esta cobertura.`;
  }

  // Generar pasos desde órdenes consolidadas
  for (let i = 0; i < ordenes.length; i++) {
    const o = ordenes[i];
    const positionRef = result.results.find((r) =>
      r.hedgeAssets.some((a) => a.ticker === o.ticker),
    );
    const bestBenchmark = positionRef?.position.bestBenchmark ?? "";
    const r2Valor = positionRef?.position.bestBenchmarkR2 ?? 0;
    const confiabilidad = positionRef?.position.bestBenchmarkConfiabilidad ?? "baja";

    const cubreA = o.posicionesQueLoUsan.join(", ");
    const betaVal = positionRef?.position.beta ?? 1;

    let motivoSimple = `Esto reduce el riesgo de que si ${bestBenchmark} cae, ${cubreA} caiga con él. `;
    motivoSimple += `${cubreA} tiene una beta de ${betaVal.toFixed(2)}, lo que significa que ${betaExplicacion(betaVal)}.`;
    motivoSimple += ` La correlación con ${bestBenchmark} es ${r2Explicacion(r2Valor)} (R²: ${r2Valor.toFixed(2)}).`;

    let advertencia: string | undefined;
    if (confiabilidad === "baja") {
      advertencia = `Ojo: la correlación entre ${cubreA} y ${bestBenchmark} es débil (R²: ${r2Valor.toFixed(2)}). Esta cobertura no es muy precisa.`;
    } else if (confiabilidad === "media") {
      advertencia = `La correlación entre ${cubreA} y ${bestBenchmark} es moderada (R²: ${r2Valor.toFixed(2)}). La cobertura reduce el riesgo parcialmente.`;
    }

    if (o.cantidadTotal === 0) {
      advertencia =
        (advertencia ? advertencia + " " : "") +
        `No se pudo calcular una cantidad ejecutable para ${o.ticker} con el saldo actual.`;
    }

    const paso: PlainLanguageStep = {
      orden: i + 1,
      accion: "COMPRAR",
      instrumento: o.ticker,
      cantidad: o.cantidadTotal,
      montoAproximadoUSD: o.montoUSDTotal,
      mercado: o.mercadoEjecucion,
      motivoSimple,
      confiabilidad,
      advertencia,
    };

    pasos.push(paso);
  }

  // Si no hay órdenes, agregar paso de espera
  if (pasos.length === 0) {
    pasos.push({
      orden: 1,
      accion: "ESPERAR",
      instrumento: "",
      cantidad: 0,
      montoAproximadoUSD: 0,
      mercado: "",
      motivoSimple: "No hay instrumentos de cobertura viables con los parámetros actuales.",
      confiabilidad: "baja",
      advertencia: "Revisá los benchmarks seleccionados o aumentá el saldo disponible.",
    });
  }

  // Resumen de costo
  const saldoQueTeQuedaria = Math.max(0, availableCash - result.totalCosto);
  const esViable = !result.coberturaParcial && !algunaNoEjecutable;

  return {
    resumenGeneral,
    situacionSaldo: {
      mensaje: situacionSaldoMensaje,
      montoNecesarioDepositar,
    },
    pasos,
    resumenCosto: {
      costoTotalEstimado: result.totalCosto,
      saldoQueTeQuedaria,
      esViable,
    },
  };
}
