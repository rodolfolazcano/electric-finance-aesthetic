/**
 * Indicadores Económicos y Riesgo País — Elbaum Cap 5 (Unidad_3.pdf)
 * Metodología editorial del Global Weekly Report. Cuadro de signos del riesgo país.
 *
 * Reutiliza: informe-matutino/indec.functions.ts, agenda-economica.ts, stats.ts::pearsonR
 * APIs: BCRA v4 (reservas, base), ArgentinaDatos (PBI, inflación, TC), yfinance ^TNX/^TYX (tasa USA).
 *
 * Reglas Elbaum críticas:
 * - Cuadro de signos del riesgo país: impacto de variables macro en riesgo país.
 * - Criterios de calidad de indicador: relevancia/timing/confiabilidad.
 * - Reglas de política monetaria: PBI anualizado >3% → expansiva, <2% → contractiva.
 */

import { pearsonR } from "../math/stats";

// ============================================================================
// 1. CUADRO DE SIGNOS DEL RIESGO PAÍS (Tabla 5-3)
// ============================================================================

export interface IndicadorRiesgoPais {
  variable: string;
  valor: number;
  signo: "+" | "-" | "0";
  peso: number; // relevancia del indicador
  umbral: number; // umbral para determinar signo
  fuente: string;
}

export interface CuadroSignosResult {
  indicadores: IndicadorRiesgoPais[];
  scoreTotal: number;
  interpretacion: string;
  fecha: string;
}

/**
 * Cuadro de signos del riesgo país según Elbaum Tabla 5-3.
 * Variables: crecimiento, inflación, déficit comercial, déficit fiscal, desempleo, reservas, tasa USA.
 */
export function cuadroSignosRiesgoPais(
  crecimiento: number, // % anual PBI
  inflacion: number, // % anual IPC
  deficitComercial: number, // % PBI
  deficitFiscal: number, // % PBI
  desempleo: number, // % tasa
  reservas: number, // USD millones
  tasaUSA: number // % Treasury 10y
): CuadroSignosResult {
  const indicadores: IndicadorRiesgoPais[] = [
    {
      variable: "Crecimiento PBI",
      valor: crecimiento,
      signo: crecimiento > 3 ? "+" : crecimiento < 2 ? "-" : "0",
      peso: 3,
      umbral: 3,
      fuente: "INDEC/ArgentinaDatos"
    },
    {
      variable: "Inflación IPC",
      valor: inflacion,
      signo: inflacion > 50 ? "-" : inflacion < 20 ? "+" : "0",
      peso: 4,
      umbral: 50,
      fuente: "INDEC"
    },
    {
      variable: "Déficit Comercial",
      valor: deficitComercial,
      signo: deficitComercial > 2 ? "-" : deficitComercial < -1 ? "+" : "0",
      peso: 2,
      umbral: 2,
      fuente: "INDEC comercio exterior"
    },
    {
      variable: "Déficit Fiscal",
      valor: deficitFiscal,
      signo: deficitFiscal > 3 ? "-" : deficitFiscal < 1 ? "+" : "0",
      peso: 3,
      umbral: 3,
      fuente: "Ministerio Economía"
    },
    {
      variable: "Desempleo",
      valor: desempleo,
      signo: desempleo > 10 ? "-" : desempleo < 6 ? "+" : "0",
      peso: 2,
      umbral: 10,
      fuente: "INDEC"
    },
    {
      variable: "Reservas Internacionales",
      valor: reservas,
      signo: reservas < 20000 ? "-" : reservas > 40000 ? "+" : "0",
      peso: 4,
      umbral: 20000,
      fuente: "BCRA"
    },
    {
      variable: "Tasa USA (10y)",
      valor: tasaUSA,
      signo: tasaUSA > 4 ? "-" : tasaUSA < 2 ? "+" : "0",
      peso: 2,
      umbral: 4,
      fuente: "yfinance ^TNX"
    }
  ];

  // Calcular score total ponderado
  let scoreTotal = 0;
  for (const ind of indicadores) {
    const valorSigno = ind.signo === "+" ? 1 : ind.signo === "-" ? -1 : 0;
    scoreTotal += valorSigno * ind.peso;
  }

  const scoreMax = indicadores.reduce((sum, ind) => sum + ind.peso, 0);
  const scoreNormalizado = scoreTotal / scoreMax;

  let interpretacion = "";
  if (scoreNormalizado > 0.3) {
    interpretacion = "Riesgo país BAJO: indicadores mayormente favorables.";
  } else if (scoreNormalizado < -0.3) {
    interpretacion = "Riesgo país ALTO: indicadores mayormente desfavorables.";
  } else {
    interpretacion = "Riesgo país MODERADO: mix de indicadores favorables y desfavorables.";
  }

  return {
    indicadores,
    scoreTotal,
    interpretacion,
    fecha: new Date().toISOString().slice(0, 10)
  };
}

// ============================================================================
// 2. IMPACTO DEL RIESGO PAÍS CON CRITERIOS DE CALIDAD
// ============================================================================

export interface MetadatosIndicador {
  relevancia: number; // 1-10
  timing: number; // 1-10 (frecuencia/actualidad)
  confiabilidad: number; // 1-10 (fuente/metodología)
}

export interface ImpactoRiesgoPaisResult {
  impacto: "positivo" | "negativo" | "neutro";
  score: number;
  metadatos: MetadatosIndicador;
  justificacion: string;
}

/**
 * Calcula impacto del riesgo país con criterios de calidad.
 * Relevancia: importancia económica del indicador.
 * Timing: frecuencia de publicación y actualidad.
 * Confiabilidad: calidad de la fuente y metodología.
 */
export function impactoRiesgoPais(
  variable: string,
  valor: number,
  umbral: number,
  metadatos: MetadatosIndicador
): ImpactoRiesgoPaisResult {
  const calidadPromedio = (metadatos.relevancia + metadatos.timing + metadatos.confiabilidad) / 30; // normalizado 0-1
  const delta = valor - umbral;
  const impactoRaw = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  const score = impactoRaw * calidadPromedio * 10;

  let impacto: "positivo" | "negativo" | "neutro";
  if (score > 2) impacto = "positivo";
  else if (score < -2) impacto = "negativo";
  else impacto = "neutro";

  const justificacion = `${variable}: valor ${valor} vs umbral ${umbral}. Calidad del indicador: relevancia ${metadatos.relevancia}/10, timing ${metadatos.timing}/10, confiabilidad ${metadatos.confiabilidad}/10.`;

  return { impacto, score, metadatos, justificacion };
}

// ============================================================================
// 3. REGLAS DE POLÍTICA MONETARIA
// ============================================================================

export interface PoliticaMonetariaResult {
  postura: "expansiva" | "contractiva" | "neutra";
  justificacion: string;
  pbiAnualizado: number;
}

/**
 * Reglas de política monetaria según Elbaum:
 * PBI anualizado >3% → expansiva
 * PBI anualizado <2% → contractiva
 * Entre 2% y 3% → neutra
 */
export function politicaMonetaria(pbiTrimestral: number, pbiTrimestralAnterior: number): PoliticaMonetariaResult {
  const crecimientoAnualizado = Math.pow(pbiTrimestral / pbiTrimestralAnterior, 4) - 1;
  const pbiAnualizado = crecimientoAnualizado * 100;

  let postura: "expansiva" | "contractiva" | "neutra";
  if (pbiAnualizado > 3) {
    postura = "expansiva";
  } else if (pbiAnualizado < 2) {
    postura = "contractiva";
  } else {
    postura = "neutra";
  }

  const justificacion = `PBI anualizado ${pbiAnualizado.toFixed(2)}% → postura ${postura.toUpperCase()}. Regla Elbaum: >3% expansiva, <2% contractiva, 2-3% neutra.`;

  return { postura, justificacion, pbiAnualizado };
}

// ============================================================================
// 4. MATRIZ DE CONTAGIO (PEARSON R)
// ============================================================================

export interface MatrizContagioResult {
  correlaciones: Array<{ variable1: string; variable2: string; r: number; interpretacion: string }>;
  resumen: string;
}

/**
 * Matriz de contagio usando correlación de Pearson.
 * Útil para analizar propagación de shocks entre mercados.
 */
export function calcularMatrizContagio(
  datos: Record<string, number[]>
): MatrizContagioResult {
  const variables = Object.keys(datos);
  const correlaciones: Array<{ variable1: string; variable2: string; r: number; interpretacion: string }> = [];

  for (let i = 0; i < variables.length; i++) {
    for (let j = i + 1; j < variables.length; j++) {
      const v1 = variables[i];
      const v2 = variables[j];
      const r = pearsonR(datos[v1], datos[v2]);
      
      let interpretacion = "";
      if (Math.abs(r) > 0.7) {
        interpretacion = r > 0 ? "Fuerte correlación positiva (contagio directo)" : "Fuerte correlación negativa (contagio inverso)";
      } else if (Math.abs(r) > 0.4) {
        interpretacion = r > 0 ? "Correlación moderada positiva" : "Correlación moderada negativa";
      } else {
        interpretacion = "Correlación débil (bajo contagio)";
      }

      correlaciones.push({ variable1: v1, variable2: v2, r, interpretacion });
    }
  }

  const fuertes = correlaciones.filter(c => Math.abs(c.r) > 0.7).length;
  const resumen = `Matriz de contagio: ${fuertes} pares con correlación fuerte (>0.7). ${fuertes > 0 ? "Riesgo de contagio significativo detectado." : "Bajo riesgo de contagio."}`;

  return { correlaciones, resumen };
}

// ============================================================================
// 5. EJECUTOR PRINCIPAL: CONTEXTO MACRO SEMANAL
// ============================================================================

export interface ContextoMacroInput {
  crecimiento: number;
  inflacion: number;
  deficitComercial: number;
  deficitFiscal: number;
  desempleo: number;
  reservas: number;
  tasaUSA: number;
  pbiTrimestral: number;
  pbiTrimestralAnterior: number;
  datosContagio?: Record<string, number[]>;
}

export interface ContextoMacroResult {
  cuadroSignos: CuadroSignosResult;
  politicaMonetaria: PoliticaMonetariaResult;
  matrizContagio?: MatrizContagioResult;
  resumenEjecutivo: string;
  recomendaciones: string[];
}

export function ejecutarContextoMacroSemana(input: ContextoMacroInput): ContextoMacroResult {
  const { crecimiento, inflacion, deficitComercial, deficitFiscal, desempleo, reservas, tasaUSA, pbiTrimestral, pbiTrimestralAnterior, datosContagio } = input;

  // 1. Cuadro de signos del riesgo país
  const cuadroSignos = cuadroSignosRiesgoPais(
    crecimiento, inflacion, deficitComercial, deficitFiscal, desempleo, reservas, tasaUSA
  );

  // 2. Política monetaria
  const politica = politicaMonetaria(pbiTrimestral, pbiTrimestralAnterior);

  // 3. Matriz de contagio (opcional)
  let matrizContagio: MatrizContagioResult | undefined;
  if (datosContagio) {
    matrizContagio = calcularMatrizContagio(datosContagio);
  }

  // 4. Resumen ejecutivo
  const resumenEjecutivo = `Contexto macro semanal según Elbaum Cap 5. Riesgo país: ${cuadroSignos.interpretacion} (score ${cuadroSignos.scoreTotal}). Política monetaria: ${politica.postura.toUpperCase()} (${politica.justificacion}). ${matrizContagio ? matrizContagio.resumen : ""}`;

  // 5. Recomendaciones
  const recomendaciones: string[] = [];
  
  if (cuadroSignos.scoreTotal < -5) {
    recomendaciones.push("ALERTA: Riesgo país elevado. Monitorear reservas y déficit fiscal.");
  }
  
  if (inflacion > 50) {
    recomendaciones.push("ALERTA: Inflación alta. Expectativas de devaluación y tasas altas.");
  }
  
  if (reservas < 20000) {
    recomendaciones.push("ALERTA: Reservas bajas. Riesgo de restricción externa.");
  }
  
  if (politica.postura === "expansiva" && inflacion > 30) {
    recomendaciones.push("CONTRADICCIÓN: Política expansiva con inflación alta. Riesgo de sobrecalentamiento.");
  }

  if (matrizContagio && matrizContagio.correlaciones.some(c => Math.abs(c.r) > 0.7)) {
    recomendaciones.push("ALERTA: Alta correlación detectada. Riesgo de contagio entre mercados.");
  }

  if (recomendaciones.length === 0) {
    recomendaciones.push("Contexto macro estable. Sin alertas mayores.");
  }

  return {
    cuadroSignos,
    politicaMonetaria: politica,
    matrizContagio,
    resumenEjecutivo,
    recomendaciones
  };
}
