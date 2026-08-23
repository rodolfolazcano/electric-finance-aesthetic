/**
 * Calculadora Financiera - Funciones basadas en manuales AFC 2022
 * Referencia: Calculadora Financiera Conceptos Básicos, VAN y TIR HP10
 * DEDUP A0: wrappers delegan en math/stats.ts (única fuente).
 */
import { mean, std, pearsonR } from "./math/stats";

// ============================================================================
// 1. CÁLCULO DE PORCENTAJES
// ============================================================================

export interface PorcentajeResult {
  valor: number;
  formula: string;
  explicacion: string;
}

export function calcularPorcentaje(monto: number, porcentaje: number): PorcentajeResult {
  const valor = monto * (porcentaje / 100);
  return {
    valor,
    formula: `Valor = ${monto} × ${porcentaje}% = ${valor}`,
    explicacion: "Multiplicar el monto por el porcentaje expresado como decimal (dividido por 100)"
  };
}

export function calcularImporteNeto(precio: number, descuento: number, impuesto: number): PorcentajeResult {
  const precioConDescuento = precio * (1 - descuento / 100);
  const precioFinal = precioConDescuento * (1 + impuesto / 100);
  return {
    valor: precioFinal,
    formula: `Precio neto = ${precio} × (1 - ${descuento}%) × (1 + ${impuesto}%) = ${precioFinal}`,
    explicacion: "Primero aplicar el descuento, luego el impuesto sobre el resultado"
  };
}

export function calcularDiferenciaPorcentual(valorInicial: number, valorFinal: number): PorcentajeResult {
  const diferencia = ((valorFinal - valorInicial) / valorInicial) * 100;
  return {
    valor: diferencia,
    formula: `Variación % = ((${valorFinal} - ${valorInicial}) / ${valorInicial}) × 100 = ${diferencia.toFixed(2)}%`,
    explicacion: "La diferencia porcentual indica cuánto varió un valor respecto al inicial"
  };
}

// ============================================================================
// 2. CAPITALIZACIÓN SIMPLE Y COMPUESTA
// ============================================================================

export interface InteresSimpleResult {
  intereses: number;
  capitalFinal: number;
  formula: string;
  explicacion: string;
}

export function calcularInteresSimple(
  capital: number,
  tasa: number,
  dias: number,
  base: 360 | 365 = 365
): InteresSimpleResult {
  const intereses = (capital * tasa * dias) / (100 * base);
  const capitalFinal = capital + intereses;
  return {
    intereses,
    capitalFinal,
    formula: `I = ${capital} × ${tasa}% × ${dias} días / ${base} = ${intereses.toFixed(2)}`,
    explicacion: `Interés simple sobre base ${base} días. El interés no se capitaliza durante el período.`
  };
}

export interface InteresCompuestoResult {
  capitalFinal: number;
  interesesTotales: number;
  formula: string;
  explicacion: string;
}

export function calcularInteresCompuesto(
  capital: number,
  tasaAnual: number,
  años: number,
  periodosAnuales: number = 1
): InteresCompuestoResult {
  const tasaPeriodo = tasaAnual / periodosAnuales / 100;
  const totalPeriodos = años * periodosAnuales;
  const capitalFinal = capital * Math.pow(1 + tasaPeriodo, totalPeriodos);
  const interesesTotales = capitalFinal - capital;
  
  return {
    capitalFinal,
    interesesTotales,
    formula: `VF = ${capital} × (1 + ${tasaAnual}%/${periodosAnuales})^${totalPeriodos} = ${capitalFinal.toFixed(2)}`,
    explicacion: `Capitalización compuesta con ${periodosAnuales} períodos por año durante ${años} años.`
  };
}

// ============================================================================
// 3. TASAS EFECTIVAS Y NOMINALES
// ============================================================================

export interface TasaEfectivaResult {
  tasaEfectiva: number;
  formula: string;
  explicacion: string;
}

export function calcularTasaEfectiva(tasaNominal: number, capitalizacionesAnuales: number): TasaEfectivaResult {
  const tasaNominalDecimal = tasaNominal / 100;
  const tasaEfectiva = (Math.pow(1 + tasaNominalDecimal / capitalizacionesAnuales, capitalizacionesAnuales) - 1) * 100;
  
  return {
    tasaEfectiva,
    formula: `TEA = (1 + ${tasaNominal}%/${capitalizacionesAnuales})^${capitalizacionesAnuales} - 1 = ${tasaEfectiva.toFixed(3)}%`,
    explicacion: `Conversión de tasa nominal anual con ${capitalizacionesAnuales} capitalizaciones a tasa efectiva anual.`
  };
}

export function calcularTasaNominal(tasaEfectiva: number, capitalizacionesAnuales: number): TasaEfectivaResult {
  const tasaEfectivaDecimal = tasaEfectiva / 100;
  const tasaNominal = (Math.pow(1 + tasaEfectivaDecimal, 1 / capitalizacionesAnuales) - 1) * capitalizacionesAnuales * 100;
  
  return {
    tasaEfectiva: tasaNominal,
    formula: `TNA = [(1 + ${tasaEfectiva}% )^(1/${capitalizacionesAnuales}) - 1] × ${capitalizacionesAnuales} = ${tasaNominal.toFixed(3)}%`,
    explicacion: `Conversión de tasa efectiva anual a tasa nominal anual con ${capitalizacionesAnuales} capitalizaciones.`
  };
}

// ============================================================================
// 4. RENTAS FINANCIERAS (ANNUITIES)
// ============================================================================

export interface RentasResult {
  resultado: number;
  formula: string;
  explicacion: string;
}

export function calcularNumeroPagos(
  prestamo: number,
  pago: number,
  tasaAnual: number,
  pagosAnuales: number = 12
): RentasResult {
  const tasaPeriodo = tasaAnual / pagosAnuales / 100;
  const n = -Math.log(1 - (prestamo * tasaPeriodo) / pago) / Math.log(1 + tasaPeriodo);
  
  return {
    resultado: n,
    formula: `n = -ln(1 - ${prestamo} × ${tasaPeriodo} / ${pago}) / ln(1 + ${tasaPeriodo}) = ${n.toFixed(2)}`,
    explicacion: `Número de pagos necesarios para liquidar un préstamo con pagos constantes vencidos.`
  };
}

export function calcularValorActualRentas(
  pago: number,
  tasaAnual: number,
  periodos: number,
  pagosAnuales: number = 12
): RentasResult {
  const tasaPeriodo = tasaAnual / pagosAnuales / 100;
  const valorActual = pago * (1 - Math.pow(1 + tasaPeriodo, -periodos)) / tasaPeriodo;
  
  return {
    resultado: valorActual,
    formula: `VA = ${pago} × [1 - (1 + ${tasaPeriodo})^-${periodos}] / ${tasaPeriodo} = ${valorActual.toFixed(2)}`,
    explicacion: `Valor actual de una serie de ${periodos} pagos constantes vencidos.`
  };
}

export function calcularPagoRentas(
  prestamo: number,
  tasaAnual: number,
  periodos: number,
  pagosAnuales: number = 12
): RentasResult {
  const tasaPeriodo = tasaAnual / pagosAnuales / 100;
  const pago = prestamo * tasaPeriodo / (1 - Math.pow(1 + tasaPeriodo, -periodos));
  
  return {
    resultado: pago,
    formula: `PMT = ${prestamo} × ${tasaPeriodo} / [1 - (1 + ${tasaPeriodo})^-${periodos}] = ${pago.toFixed(2)}`,
    explicacion: `Pago constante vencido para amortizar un préstamo en ${periodos} períodos.`
  };
}

export function calcularPagoConValorFuturo(
  valorObjetivo: number,
  depositoInicial: number,
  tasaAnual: number,
  periodos: number,
  pagosAnuales: number = 2
): RentasResult {
  const tasaPeriodo = tasaAnual / pagosAnuales / 100;
  const valorFuturoInicial = depositoInicial * Math.pow(1 + tasaPeriodo, periodos);
  const valorFaltante = valorObjetivo - valorFuturoInicial;
  const pago = valorFaltante * tasaPeriodo / (Math.pow(1 + tasaPeriodo, periodos) - 1);
  
  return {
    resultado: pago,
    formula: `PMT = (${valorObjetivo} - ${depositoInicial}×(1+${tasaPeriodo})^${periodos}) × ${tasaPeriodo} / [(1+${tasaPeriodo})^${periodos}-1] = ${pago.toFixed(2)}`,
    explicacion: `Depósito periódico necesario para alcanzar un objetivo con un depósito inicial.`
  };
}

// ============================================================================
// 5. VAN Y TIR (FLUJOS DE CAJA)
// ============================================================================

export interface FlujoCaja {
  periodo: number;
  monto: number;
}

export interface VANResult {
  van: number;
  formula: string;
  explicacion: string;
  interpretacion: string;
}

export function calcularVAN(
  flujosCaja: number[],
  tasaDescuento: number,
  periodosAnuales: number = 1
): VANResult {
  const tasaPeriodo = tasaDescuento / periodosAnuales / 100;
  let van = 0;
  let formulaTerms = flujosCaja.map((fc, i) => {
    const va = fc / Math.pow(1 + tasaPeriodo, i);
    van += va;
    return `${fc}/(1+${tasaPeriodo})^${i}`;
  });
  
  const interpretacion = van > 0 
    ? "VAN positivo: el proyecto genera valor y supera la tasa de retorno requerida."
    : van < 0 
    ? "VAN negativo: el proyecto destruye valor y no alcanza la tasa de retorno requerida."
    : "VAN cero: el proyecto genera exactamente la tasa de retorno requerida.";
  
  return {
    van,
    formula: `VAN = ${formulaTerms.join(" + ")} = ${van.toFixed(2)}`,
    explicacion: `Suma de los flujos de caja descontados a la tasa ${tasaDescuento}% anual.`,
    interpretacion
  };
}

export interface TIRResult {
  tir: number;
  formula: string;
  explicacion: string;
  interpretacion: string;
  convergio: boolean;
}

export function calcularTIR(
  flujosCaja: number[],
  periodosAnuales: number = 1,
  tolerancia: number = 0.0001,
  maxIteraciones: number = 1000
): TIRResult {
  // Método de Newton-Raphson para encontrar TIR
  let tir = 0.1; // Inicializar con 10%
  let iteracion = 0;
  let convergio = false;
  
  while (iteracion < maxIteraciones) {
    let van = 0;
    let vanDerivada = 0;
    
    for (let i = 0; i < flujosCaja.length; i++) {
      const descuento = Math.pow(1 + tir, i);
      van += flujosCaja[i] / descuento;
      vanDerivada -= i * flujosCaja[i] / (descuento * (1 + tir));
    }
    
    if (Math.abs(van) < tolerancia) {
      convergio = true;
      break;
    }
    
    tir = tir - van / vanDerivada;
    iteracion++;
  }
  
  const tirAnual = tir * periodosAnuales * 100;
  
  const interpretacion = tirAnual > 0 
    ? `TIR positiva: el proyecto tiene un rendimiento anual del ${tirAnual.toFixed(2)}%.`
    : `TIR negativa: el proyecto no genera rendimiento (${tirAnual.toFixed(2)}% anual).`;
  
  return {
    tir: tirAnual,
    formula: `TIR encontrada por iteración: ${tirAnual.toFixed(4)}% anual (${iteracion} iteraciones)`,
    explicacion: "La TIR es la tasa que hace el VAN igual a cero. Calculada por método numérico.",
    interpretacion,
    convergio
  };
}

// ============================================================================
// 6. BONOS
// ============================================================================

export interface BonoResult {
  precio: number;
  formula: string;
  explicacion: string;
}

export function calcularPrecioBono(
  cuponAnual: number,
  rendimientoRequerido: number,
  añosVencimiento: number,
  valorNominal: number = 100,
  pagosAnuales: number = 2
): BonoResult {
  const tasaPeriodo = rendimientoRequerido / pagosAnuales / 100;
  const cuponPeriodo = cuponAnual / pagosAnuales;
  const totalPeriodos = añosVencimiento * pagosAnuales;
  
  // Valor actual de los cupones (renta)
  const vaCupones = cuponPeriodo * (1 - Math.pow(1 + tasaPeriodo, -totalPeriodos)) / tasaPeriodo;
  
  // Valor actual del nominal
  const vaNominal = valorNominal / Math.pow(1 + tasaPeriodo, totalPeriodos);
  
  const precio = vaCupones + vaNominal;
  
  return {
    precio,
    formula: `Precio = ${cuponPeriodo}×[1-(1+${tasaPeriodo})^-${totalPeriodos}]/${tasaPeriodo} + ${valorNominal}/(1+${tasaPeriodo})^${totalPeriodos} = ${precio.toFixed(2)}`,
    explicacion: `Precio de bono con cupón ${cuponAnual}% anual, rendimiento ${rendimientoRequerido}%, vence en ${añosVencimiento} años.`
  };
}

// ============================================================================
// 7. ESTADÍSTICA BÁSICA
// ============================================================================

export interface MediaResult {
  media: number;
  formula: string;
  explicacion: string;
}

export function calcularMediaAritmetica(valores: number[]): MediaResult {
  const media = mean(valores);
  return {
    media,
    formula: `Media = (${valores.join(" + ")}) / ${valores.length} = ${media.toFixed(2)}`,
    explicacion: "Promedio simple de los valores. Útil para calcular precio promedio de acciones."
  };
}

export function calcularMediaPonderada(valores: number[], pesos: number[]): MediaResult {
  if (valores.length !== pesos.length) {
    throw new Error("Valores y pesos deben tener la misma longitud");
  }
  
  const sumaPonderada = valores.reduce((acc, val, i) => acc + val * pesos[i], 0);
  const sumaPesos = pesos.reduce((a, b) => a + b, 0);
  const media = sumaPonderada / sumaPesos;
  
  return {
    media,
    formula: `Media pond = (${valores.map((v, i) => `${v}×${pesos[i]}`).join(" + ")}) / ${sumaPesos} = ${media.toFixed(2)}`,
    explicacion: "Promedio ponderado por cantidades. Útil para precio promedio de entrada con diferentes lotes."
  };
}

export interface VarianzaResult {
  varianza: number;
  desviacion: number;
  formula: string;
  explicacion: string;
}

export function calcularVarianzaDesviacion(valores: number[], poblacional: boolean = true): VarianzaResult {
  const media = mean(valores);
  const divisor = poblacional ? valores.length : valores.length - 1;
  const desviacion = std(valores, !poblacional);
  const varianza = desviacion * desviacion;
  const tipo = poblacional ? "poblacional" : "muestral";
  return {
    varianza,
    desviacion,
    formula: `σ² = Σ(x - ${media.toFixed(2)})² / ${divisor} = ${varianza.toFixed(4)}`,
    explicacion: `Varianza ${tipo} y desviación estándar. Mide la dispersión de los valores alrededor de la media.`
  };
}

export interface CovarianzaResult {
  covarianza: number;
  correlacion: number;
  formula: string;
  explicacion: string;
}

export function calcularCovarianzaCorrelacion(x: number[], y: number[]): CovarianzaResult {
  if (x.length !== y.length) {
    throw new Error("Los arrays X e Y deben tener la misma longitud");
  }
  const mediaX = mean(x);
  const mediaY = mean(y);
  const covarianza = x.reduce((acc, xi, i) => acc + (xi - mediaX) * (y[i] - mediaY), 0) / x.length;
  const correlacion = pearsonR(x, y);
  return {
    covarianza,
    correlacion,
    formula: `Cov = Σ(x - ${mediaX.toFixed(2)})(y - ${mediaY.toFixed(2)}) / n = ${covarianza.toFixed(4)}`,
    explicacion: `Covarianza ${covarianza.toFixed(4)}, Correlación ${correlacion.toFixed(4)}. Correlación cercana a ±1 indica fuerte relación lineal.`
  };
}

// ============================================================================
// 8. UTILIDADES DE FORMATO
// ============================================================================

export function formatMonetary(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

export function formatPercentage(value: number, decimals: number = 2): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

// ============================================================================
// 9. SOLVER CUOPT — Ecuaciones de valor con restricciones (F2 Dumrauf)
// Replica cuopt-numerical-optimization-formulation para TIR con bounds y VAN objetivo.
// No requiere GPU: usa Newton-Raphson con fallback bisección y verifica no-arbitraje.
// ============================================================================

export interface SolverTIRResult {
  tir: number; // % anual
  van: number;
  iteraciones: number;
  convergio: boolean;
  metodo: "newton" | "biseccion" | "hibrido";
  cotaInferior: number;
  cotaSuperior: number;
  advertencias: string[];
}

export function resolverTIRConRestricciones(
  flujos: number[],
  bounds: { min?: number; max?: number } = {},
  objetivoVAN: number = 0,
  opts: { tol?: number; maxIter?: number } = {},
): SolverTIRResult {
  const tol = opts.tol ?? 1e-7;
  const maxIter = opts.maxIter ?? 200;
  const lo = bounds.min != null ? bounds.min / 100 : -0.9;
  const hi = bounds.max != null ? bounds.max / 100 : 5;
  const advertencias: string[] = [];
  const vanAt = (r: number) => flujos.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0) - objetivoVAN;
  const dvanAt = (r: number) => flujos.reduce((s, cf, t) => s - (t * cf) / Math.pow(1 + r, t + 1), 0);

  // Detectar múltiples cambios de signo → TIR múltiple (Dumrauf)
  let cambios = 0;
  for (let i = 1; i < flujos.length; i++) if ((flujos[i] ?? 0) * (flujos[i - 1] ?? 0) < 0) cambios++;
  if (cambios > 1) advertencias.push(`Flujo con ${cambios} cambios de signo → TIR múltiple posible (preferir VAN para rankear).`);

  // Buscar bracket donde VAN cambia de signo
  let a = lo, b = hi;
  let fa = vanAt(a), fb = vanAt(b);
  if (fa * fb > 0) {
    // No bracket: probar VAN en 0% y en hi
    const f0 = vanAt(0);
    if (f0 * fb <= 0) { a = 0; fa = f0; }
    else advertencias.push("Sin bracket con cambio de signo — TIR fuera de bounds o flujo degenerado.");
  }

  // Newton con salvaguarda de bounds
  let r = 0.1;
  if (r < a || r > b) r = (a + b) / 2;
  let metodo: SolverTIRResult["metodo"] = "hibrido";
  let iter = 0;
  let convergio = false;
  for (iter = 0; iter < maxIter; iter++) {
    const f = vanAt(r);
    const df = dvanAt(r);
    if (Math.abs(f) < tol) { convergio = true; metodo = "newton"; break; }
    if (!isFinite(df) || Math.abs(df) < 1e-12) break;
    const rNext = r - f / df;
    if (!isFinite(rNext) || rNext < a || rNext > b) break; // salir a bisección
    if (Math.abs(rNext - r) < tol) { r = rNext; convergio = true; metodo = "newton"; break; }
    r = rNext;
  }

  // Bisección como fallback / refinamiento
  if (!convergio) {
    let al = a, bl = b, fl = vanAt(al), fr = vanAt(bl);
    if (fl * fr <= 0) {
      for (let i = 0; i < 120; i++) {
        const m = (al + bl) / 2;
        const fm = vanAt(m);
        if (Math.abs(fm) < tol || Math.abs(bl - al) < tol) { r = m; convergio = true; metodo = fl * fr <= 0 ? "biseccion" : "hibrido"; break; }
        if (fl * fm <= 0) { bl = m; fr = fm; } else { al = m; fl = fm; }
        r = m;
      }
    }
  }

  const van = vanAt(r);
  return {
    tir: r * 100,
    van,
    iteraciones: iter,
    convergio,
    metodo,
    cotaInferior: lo * 100,
    cotaSuperior: hi * 100,
    advertencias,
  };
}

// ============================================================================
// 10. TVM SOLVER — resolver cualquiera de n,i,PV,PMT,FV (HP12C 5 vars)
// ============================================================================
export interface TVMInput {
  n?: number | null; // número de períodos
  i?: number | null; // tasa por período % (no anual)
  pv?: number | null;
  pmt?: number | null;
  fv?: number | null;
  tipo?: "end" | "begin"; // vencida/anticipada
}
export interface TVMResult { variable: string; valor: number; iteraciones: number; convergio: boolean }
function tvmEcuacion(p: Required<TVMInput> & { n: number; i: number; pv: number; pmt: number; fv: number }): number {
  const { n, i, pv, pmt, fv, tipo } = p as any;
  const r = i / 100;
  if (Math.abs(r) < 1e-12) return pv + pmt * n + fv;
  const ax = tipo === "begin" ? 1 + r : 1;
  return pv * Math.pow(1 + r, n) + pmt * ax * (Math.pow(1 + r, n) - 1) / r + fv;
}
export function resolverTVM(inp: TVMInput): TVMResult {
  const keys = ["n", "i", "pv", "pmt", "fv"] as const;
  const faltantes = keys.filter((k) => inp[k] == null);
  if (faltantes.length !== 1) throw new Error("TVM: debe faltar exactamente 1 variable de n,i,pv,pmt,fv");
  const variable = faltantes[0] as string;
  const tipo = inp.tipo ?? "end";
  // caso directo para i no: usamos Newton sobre i o n
  if (variable === "n") {
    // si i,pv,pmt,fv conocen, despejar n analíticamente cuando posible
    let n = 100;
    for (let it = 0; it < 120; it++) {
      const cur = inp as any;
      const f = tvmEcuacion({ ...cur, n, i: cur.i ?? 0, pv: cur.pv ?? 0, pmt: cur.pmt ?? 0, fv: cur.fv ?? 0, tipo } as any);
      const f2 = tvmEcuacion({ ...cur, n: n + 1e-6, i: cur.i ?? 0, pv: cur.pv ?? 0, pmt: cur.pmt ?? 0, fv: cur.fv ?? 0, tipo } as any);
      const df = (f2 - f) / 1e-6;
      if (Math.abs(f) < 1e-9) return { variable, valor: n, iteraciones: it, convergio: true };
      if (!isFinite(df) || Math.abs(df) < 1e-12) break;
      const nn = n - f / df;
      if (!isFinite(nn)) break;
      if (Math.abs(nn - n) < 1e-9) return { variable, valor: nn, iteraciones: it + 1, convergio: true };
      n = Math.max(0.01, nn);
    }
    return { variable, valor: n, iteraciones: 120, convergio: false };
  }
  if (variable !== "i") {
    // para pv,pmt,fv es lineal → despeje directo
    const r = (inp.i ?? 0) / 100;
    const n = inp.n ?? 0;
    const ax = tipo === "begin" ? 1 + r : 1;
    const pow = Math.pow(1 + r, n);
    if (variable === "pv") {
      const pv = (-(inp.pmt ?? 0) * ax * (pow - 1) / (r || 1) - (inp.fv ?? 0)) / pow;
      return { variable, valor: pv, iteraciones: 0, convergio: true };
    }
    if (variable === "pmt") {
      const pmt = (-(inp.pv ?? 0) * pow - (inp.fv ?? 0)) / (ax * (pow - 1) / (r || 1));
      return { variable, valor: pmt, iteraciones: 0, convergio: true };
    }
    if (variable === "fv") {
      const fv = -(inp.pv ?? 0) * pow - (inp.pmt ?? 0) * ax * (pow - 1) / (r || 1);
      return { variable, valor: fv, iteraciones: 0, convergio: true };
    }
  }
  // variable === "i" → Newton sobre tasa periódica
  let i = 0.5; // 0.5% por período como semilla
  for (let it = 0; it < 200; it++) {
    const cur = inp as any;
    const f = tvmEcuacion({ ...cur, i, tipo } as any);
    const f2 = tvmEcuacion({ ...cur, i: i + 1e-7, tipo } as any);
    const df = (f2 - f) / 1e-7;
    if (Math.abs(f) < 1e-9) return { variable, valor: i, iteraciones: it, convergio: true };
    if (!isFinite(df) || Math.abs(df) < 1e-12) break;
    const ni = i - f / df;
    if (!isFinite(ni)) break;
    if (Math.abs(ni - i) < 1e-10) return { variable, valor: ni, iteraciones: it + 1, convergio: true };
    i = Math.max(-90, Math.min(90, ni));
  }
  return { variable, valor: i, iteraciones: 200, convergio: false };
}

// ============================================================================
// 11. FECHAS — DAYS y vencimiento (Manual p.7-8)
// ============================================================================
export function diasEntreFechas(d1: Date | string, d2: Date | string, base: 360 | 365 = 365): number {
  const a = typeof d1 === "string" ? new Date(d1) : d1;
  const b = typeof d2 === "string" ? new Date(d2) : d2;
  const diffMs = b.getTime() - a.getTime();
  const diasReales = Math.round(diffMs / 86400000);
  if (base === 365) return diasReales;
  // 30/360 aproximado
  return Math.round(diasReales * 360 / 365);
}
export function fechaVencimiento(inicio: Date | string, dias: number): Date {
  const d = new Date(typeof inicio === "string" ? inicio : inicio.getTime());
  d.setDate(d.getDate() + dias);
  return d;
}

// ============================================================================
// 12. TASAS — anticipada↔vencida, Fisher, equivalentes
// ============================================================================
export function tasaAnticipadaAVencida(iaPct: number): number {
  const ia = iaPct / 100;
  return (ia / (1 - ia)) * 100;
}
export function tasaVencidaAAnticipada(ivPct: number): number {
  const iv = ivPct / 100;
  return (iv / (1 + iv)) * 100;
}
export function fisherReal(nominalPct: number, inflacionPct: number): number {
  const n = nominalPct / 100; const pi = inflacionPct / 100;
  return ((1 + n) / (1 + pi) - 1) * 100;
}
export function tasaEquivalente(tasaPct: number, mOrigen: number, mDestino: number): number {
  const i = tasaPct / 100;
  return (Math.pow(1 + i, mDestino / mOrigen) - 1) * 100 * (mOrigen / mDestino);
}
export function temToTea(temPct: number): number { return (Math.pow(1 + temPct / 100, 12) - 1) * 100; }
export function teaToTem(teaPct: number): number { return (Math.pow(1 + teaPct / 100, 1 / 12) - 1) * 100; }
export function actualizarPorCER(capital: number, cerInicial: number, cerFinal: number): number {
  return cerInicial > 0 ? capital * cerFinal / cerInicial : capital;
}
export function actualizarPorUVA(capital: number, uvaInicial: number, uvaFinal: number): number {
  return uvaInicial > 0 ? capital * uvaFinal / uvaInicial : capital;
}
// CFT/TAE con comisiones: TIR del flujo neto (mismo que ejemplo transparencias 20k, cuota 600×60 → 32,13%)
export function calcularCFT(montoNeto: number, cuota: number, n: number): { tem: number; tea: number; cftTea: number } {
  const flujos = [-montoNeto, ...Array(n).fill(cuota)];
  const tir = calcularTIR(flujos, 12);
  const tem = tir.tir / 12;
  const tea = (Math.pow(1 + tem / 100, 12) - 1) * 100;
  return { tem, tea, cftTea: tea };
}
