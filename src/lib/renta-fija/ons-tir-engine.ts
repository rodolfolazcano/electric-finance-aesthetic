export interface Flow {
  fecha: Date;
  monto: number;
  tipo?: string;
}

export interface RawFlow {
  fecha: string;
  tipo?: string;
  monto_por_cien?: number;
  cupon_pct?: number;
  amort_pct?: number;
  moneda?: string;
}

export interface TirResult {
  tir: number | null;
  tea: number | null;
  tna: number | null;
  precioUsdPar100: number;
  durationMacaulay: number | null;
  durationModificada: number | null;
  paridad: number;
  flujos: Array<{ fecha: string; dias: number; monto: number; pv: number }>;
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export function normalizarFlujo(f: RawFlow): Flow {
  const [y, m, d] = f.fecha.split("-").map(Number);
  const fecha = new Date(Date.UTC(y, m - 1, d));
  const monto =
    f.cupon_pct !== undefined || f.amort_pct !== undefined
      ? (f.cupon_pct ?? 0) + (f.amort_pct ?? 0)
      : (f.monto_por_cien ?? 0);
  return { fecha, monto, tipo: f.tipo };
}

export function npv(flows: Flow[], r: number, valuation: Date): number {
  let total = 0;
  for (const f of flows) {
    if (f.fecha <= valuation) continue;
    const t = daysBetween(valuation, f.fecha) / 365;
    total += f.monto / Math.pow(1 + r, t);
  }
  return total;
}

export function calcularTIR(
  flows: Flow[],
  precioUsdPar100: number,
  valuation: Date = new Date(),
): number | null {
  const future = flows.filter((f) => f.fecha > valuation);
  if (future.length === 0) return null;
  const f = (r: number) => npv(future, r, valuation) - precioUsdPar100;

  let lo = -0.9;
  let hi = 5.0;
  let flo = f(lo);
  let fhi = f(hi);
  if (flo * fhi > 0) return null;

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (Math.abs(fmid) < 1e-10 || (hi - lo) / 2 < 1e-10) return mid;
    if (flo * fmid < 0) {
      hi = mid;
      fhi = fmid;
    } else {
      lo = mid;
      flo = fmid;
    }
  }
  return (lo + hi) / 2;
}

export function precioAUsdPar100(
  precioArs: number,
  fxMep: number,
  precioUsdDirecto?: number | null,
): number {
  if (precioUsdDirecto != null) return precioUsdDirecto;
  return (precioArs * 100) / fxMep;
}

export function calcularTEA(tir: number | null, freq: number): number | null {
  if (tir == null) return null;
  return Math.pow(1 + tir / freq, freq) - 1;
}

export function calcularTNA(tir: number | null, freq: number): number | null {
  if (tir == null) return null;
  return tir;
}

export function durationMacaulay(
  flows: Flow[],
  tir: number,
  valuation: Date,
): number | null {
  const future = flows.filter((f) => f.fecha > valuation);
  if (future.length === 0) return null;
  let sumPV = 0;
  let sumTPV = 0;
  for (const f of future) {
    const t = daysBetween(valuation, f.fecha) / 365;
    const pv = f.monto / Math.pow(1 + tir, t);
    sumPV += pv;
    sumTPV += t * pv;
  }
  if (sumPV <= 0) return null;
  return sumTPV / sumPV;
}

export function durationModificada(
  dMacaulay: number | null,
  tir: number | null,
  freq: number,
): number | null {
  if (dMacaulay == null || tir == null || tir <= -1) return null;
  return dMacaulay / (1 + tir / freq);
}

export function calcularRendimientosON(
  flows: Flow[],
  precio: number,
  valorResidual: number = 100,
  freq: number = 2,
  valuation: Date = new Date(),
): TirResult {
  const precioUsdPar100 = precio;
  const tir = calcularTIR(flows, precioUsdPar100, valuation);
  const tea = calcularTEA(tir, freq);
  const tna = calcularTNA(tir, freq);
  const dMac = tir != null ? durationMacaulay(flows, tir, valuation) : null;
  const dMod = durationModificada(dMac, tir, freq);
  const paridad = valorResidual > 0 ? (precio / valorResidual) * 100 : 0;

  const flujos = flows
    .filter((f) => f.fecha > valuation)
    .map((f) => {
      const dias = daysBetween(valuation, f.fecha);
      const t = dias / 365;
      const pv = tir != null ? f.monto / Math.pow(1 + tir, t) : 0;
      return {
        fecha: f.fecha.toISOString().slice(0, 10),
        dias,
        monto: f.monto,
        pv,
      };
    });

  return { tir, tea, tna, precioUsdPar100, durationMacaulay: dMac, durationModificada: dMod, paridad, flujos };
}

// ============================================================================
// ELBAUM CAP 10: RENTA FIJA COMPLETA (Extensiones)
// ============================================================================

export interface ConvexidadResult {
  convexidad: number | null;
  formula: string;
  explicacion: string;
}

/**
 * Convexidad: Σ t(t+1)·PVCF/(1+y/k)^(t+2)/(k²·P)
 * mide la curvatura de la relación precio-tasa
 */
export function convexidad(
  flows: Flow[],
  tir: number,
  valuation: Date,
  freq: number = 2
): ConvexidadResult {
  const future = flows.filter((f) => f.fecha > valuation);
  if (future.length === 0 || tir <= -1) {
    return { convexidad: null, formula: "N/A", explicacion: "Datos insuficientes o TIR inválida" };
  }

  const k = freq;
  const y = tir;
  let sumTPV = 0;
  let sumPV = 0;

  for (const f of future) {
    const t = daysBetween(valuation, f.fecha) / 365 * k; // períodos
    const pv = f.monto / Math.pow(1 + y / k, t);
    sumPV += pv;
    sumTPV += t * (t + 1) * pv;
  }

  if (sumPV <= 0) {
    return { convexidad: null, formula: "N/A", explicacion: "Precio total no positivo" };
  }

  const convexidad = sumTPV / (Math.pow(1 + y / k, 2) * Math.pow(k, 2) * sumPV);

  return {
    convexidad,
    formula: `Convexidad = Σ t(t+1)·PVCF/(1+y/k)^(t+2)/(k²·P) = ${convexidad.toFixed(4)}`,
    explicacion: "Convexidad mide la curvatura precio-tasa. Valores más altos indican menor sensibilidad a cambios grandes en tasas."
  };
}

export interface VariacionTotalResult {
  variacionPorcentual: number;
  componenteDuration: number;
  componenteConvexidad: number;
  formula: string;
}

/**
 * Variación total del precio: ΔP/P ≈ -Dmod·Δy + 0.5·Convexidad·(Δy)²
 * PVM (Price Value of a Basis Point)
 */
export function variacionTotal(
  dMod: number | null,
  convexidadVal: number | null,
  deltaY: number
): VariacionTotalResult {
  if (dMod == null || convexidadVal == null) {
    return {
      variacionPorcentual: 0,
      componenteDuration: 0,
      componenteConvexidad: 0,
      formula: "N/A"
    };
  }

  const componenteDuration = -dMod * deltaY;
  const componenteConvexidad = 0.5 * convexidadVal * Math.pow(deltaY, 2);
  const variacionTotal = componenteDuration + componenteConvexidad;

  return {
    variacionPorcentual: variacionTotal * 100,
    componenteDuration: componenteDuration * 100,
    componenteConvexidad: componenteConvexidad * 100,
    formula: `ΔP/P = -${dMod.toFixed(4)}·${deltaY} + 0.5·${convexidadVal.toFixed(4)}·${deltaY}² = ${(variacionTotal * 100).toFixed(2)}%`
  };
}

export interface DV01Result {
  dv01: number;
  formula: string;
}

/**
 * DV01 (Dollar Value of 01): P·Dmod·0.0001
 * Cambio en precio por 1bp de cambio en tasa
 */
export function dv01(precio: number, dMod: number): DV01Result {
  const dv01Val = precio * dMod * 0.0001;
  return {
    dv01: dv01Val,
    formula: `DV01 = ${precio} × ${dMod} × 0.0001 = ${dv01Val.toFixed(4)}`
  };
}

export interface ArbitrajeDV01Result {
  ratio: number;
  nominalesHedge: { bono1: number; bono2: number };
  formula: string;
}

/**
 * Ratio DV01 para arbitraje: DV01_1 / DV01_2
 * Nominales para hedge: N2 = N1 × (DV01_1 / DV01_2)
 */
export function arbitrajeDV01(
  dv01_1: number,
  dv01_2: number,
  nominal1: number = 1000000
): ArbitrajeDV01Result {
  const ratio = dv01_1 / dv01_2;
  const nominal2 = nominal1 * ratio;

  return {
    ratio,
    nominalesHedge: { bono1: nominal1, bono2: nominal2 },
    formula: `Ratio = ${dv01_1}/${dv01_2} = ${ratio.toFixed(4)}. Hedge: $${nominal1.toLocaleString()} bono1 ↔ $${nominal2.toLocaleString()} bono2`
  };
}

export interface BootstrappingResult {
  tasasSpot: number[];
  tasasForward: number[][];
  formula: string;
}

/**
 * Bootstrapping de curva spot desde bonos cupón cero
 * z1..zn: tasas spot por período
 */
export function bootstrapCurva(bonos: { precio: number; cupones: number[]; vencimiento: number }[]): BootstrappingResult {
  const tasasSpot: number[] = [];
  const tasasForward: number[][] = [];

  for (let i = 0; i < bonos.length; i++) {
    const bono = bonos[i];
    let sumaDescuentos = 0;

    // Sumar descuentos de cupones anteriores usando tasas spot ya calculadas
    for (let j = 0; j < bono.cupones.length - 1; j++) {
      if (tasasSpot[j]) {
        sumaDescuentos += bono.cupones[j] / Math.pow(1 + tasasSpot[j], j + 1);
      }
    }

    // Calcular tasa spot para este vencimiento
    const cuponFinal = bono.cupones[bono.cupones.length - 1];
    const precioNeto = bono.precio - sumaDescuentos;
    const n = bono.vencimiento;
    const tasaSpot = Math.pow(cuponFinal / precioNeto, 1 / n) - 1;
    tasasSpot.push(tasaSpot);

    // Calcular tasas forward implícitas
    const forwards: number[] = [];
    for (let j = 0; j < tasasSpot.length - 1; j++) {
    const t1 = j + 1;
    const t2 = j + 2;
    const forward = Math.pow((1 + tasasSpot[t2 - 1]) ** t2 / (1 + tasasSpot[t1 - 1]) ** t1, 1 / (t2 - t1)) - 1;
    forwards.push(forward);
    }
    tasasForward.push(forwards);
  }

  return {
    tasasSpot,
    tasasForward,
    formula: `Bootstrapping: ${tasasSpot.map((t, i) => `z${i + 1}=${(t * 100).toFixed(2)}%`).join(", ")}`
  };
}

export interface IPDResult {
  probabilidadDefault: number;
  spread: number;
  tasaLibreRiesgo: number;
  recupero: number;
  formula: string;
}

/**
 * IPD (Implicit Probability of Default): [S(1+r)]/[S(1+r)+(1+r-R)]
 * S = spread, r = tasa libre de riesgo, R = tasa de recupero
 * Recupero Argentina post-default ≈ 20.8%
 */
export function ipd(
  spread: number,
  tasaLibreRiesgo: number,
  recupero: number = 0.208
): IPDResult {
  const numerador = spread * (1 + tasaLibreRiesgo);
  const denominador = spread * (1 + tasaLibreRiesgo) + (1 + tasaLibreRiesgo - recupero);
  const probabilidadDefault = numerador / denominador;

  return {
    probabilidadDefault,
    spread,
    tasaLibreRiesgo,
    recupero,
    formula: `IPD = [${spread}×(1+${tasaLibreRiesgo})]/[${spread}×(1+${tasaLibreRiesgo})+(1+${tasaLibreRiesgo}-${recupero})] = ${(probabilidadDefault * 100).toFixed(2)}%`
  };
}

export interface GSESSResult {
  spreadEquilibrio: number;
  spreadActual: number;
  clasificacion: "caro" | "barato" | "fair";
  formula: string;
}

/**
 * GS-ESS spread de equilibrio (regresión Elbaum)
 * Spread = -691.3·GROWTH + 165·DEFAULT + ...
 * Coeficientes simplificados para Argentina
 */
export function gseessSpreadEquilibrio(
  crecimiento: number,
  defaultProb: number,
  spreadActual: number
): GSESSResult {
  // Coeficientes del libro (simplificados)
  const spreadEquilibrio = -691.3 * crecimiento + 165 * defaultProb + 500; // +500 como base
  const clasificacion = spreadActual > spreadEquilibrio + 100 ? "caro" : spreadActual < spreadEquilibrio - 100 ? "barato" : "fair";

  return {
    spreadEquilibrio,
    spreadActual,
    clasificacion,
    formula: `Spread eq = -691.3×${crecimiento} + 165×${defaultProb} + 500 = ${spreadEquilibrio.toFixed(0)}bps. Actual: ${spreadActual}bps → ${clasificacion.toUpperCase()}`
  };
}

export interface CurvaArgentinaResult {
  a: number;
  b: number;
  r2: number;
  formula: string;
}

/**
 * Curva argentina: TIR = a + b·ln(Duration)
 * Regresión log-lin sobre títulos agrupados (pesos/Globales/provinciales)
 */
export function curvaArgentina(titulos: { tir: number; duration: number }[]): CurvaArgentinaResult {
  if (titulos.length < 3) {
    return { a: 0, b: 0, r2: 0, formula: "Insuficientes datos" };
  }

  // Regresión lineal: TIR = a + b·ln(Duration)
  const x = titulos.map(t => Math.log(t.duration));
  const y = titulos.map(t => t.tir);

  const n = x.length;
  const sumX = x.reduce((s, v) => s + v, 0);
  const sumY = y.reduce((s, v) => s + v, 0);
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0);
  const sumX2 = x.reduce((s, v) => s + v * v, 0);
  const sumY2 = y.reduce((s, v) => s + v * v, 0);

  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;

  // R²
  const yPred = x.map(xi => a + b * xi);
  const ssRes = y.reduce((s, v, i) => s + Math.pow(v - yPred[i], 2), 0);
  const ssTot = y.reduce((s, v) => s + Math.pow(v - sumY / n, 2), 0);
  const r2 = 1 - ssRes / ssTot;

  return {
    a,
    b,
    r2,
    formula: `TIR = ${a.toFixed(2)} + ${b.toFixed(2)}·ln(Duration). R² = ${r2.toFixed(3)}`
  };
}

export interface CovenantResult {
  ratio: number;
  umbral: number;
  cumplimiento: "ok" | "warning" | "alerta";
  explicacion: string;
}

export interface CovenantsResult {
  ebitdaDeuda: CovenantResult;
  coberturaInteres: CovenantResult;
  liquidez: CovenantResult;
  resumen: string;
}

/**
 * Evaluación de covenants según Elbaum
 * EBITDA/Deuda ≤ 6.5×, Cobertura ≥ 1.75×, Liquidez ≥ 1×
 */
export function evaluarCovenants(
  ebitda: number,
  deudaTotal: number,
  ebit: number,
  gastoInteres: number,
  activoCorriente: number,
  pasivoCorriente: number
): CovenantsResult {
  // EBITDA/Deuda
  const ratioEbitdaDeuda = deudaTotal > 0 ? ebitda / deudaTotal : 0;
  const ebitdaDeuda: CovenantResult = {
    ratio: ratioEbitdaDeuda,
    umbral: 6.5,
    cumplimiento: ratioEbitdaDeuda >= 6.5 ? "ok" : ratioEbitdaDeuda >= 4 ? "warning" : "alerta",
    explicacion: `EBITDA/Deuda = ${ratioEbitdaDeuda.toFixed(2)}x (umbral 6.5x)`
  };

  // Cobertura de interés
  const ratioCobertura = gastoInteres > 0 ? ebit / gastoInteres : 0;
  const coberturaInteres: CovenantResult = {
    ratio: ratioCobertura,
    umbral: 1.75,
    cumplimiento: ratioCobertura >= 1.75 ? "ok" : ratioCobertura >= 1.25 ? "warning" : "alerta",
    explicacion: `Cobertura = ${ratioCobertura.toFixed(2)}x (umbral 1.75x)`
  };

  // Liquidez
  const ratioLiquidez = pasivoCorriente > 0 ? activoCorriente / pasivoCorriente : 0;
  const liquidez: CovenantResult = {
    ratio: ratioLiquidez,
    umbral: 1,
    cumplimiento: ratioLiquidez >= 1 ? "ok" : ratioLiquidez >= 0.8 ? "warning" : "alerta",
    explicacion: `Liquidez = ${ratioLiquidez.toFixed(2)}x (umbral 1x)`
  };

  const alertas = [ebitdaDeuda, coberturaInteres, liquidez].filter(c => c.cumplimiento === "alerta").length;
  const warnings = [ebitdaDeuda, coberturaInteres, liquidez].filter(c => c.cumplimiento === "warning").length;

  let resumen = "";
  if (alertas > 0) {
    resumen = `ALERTA: ${alertas} covenant(s) en rojo. Riesgo de refinanciación.`;
  } else if (warnings > 0) {
    resumen = `WARNING: ${warnings} covenant(s) en amarillo. Monitorear.`;
  } else {
    resumen = "Todos los covenants cumplidos. Situación financiera saludable.";
  }

  return { ebitdaDeuda, coberturaInteres, liquidez, resumen };
}

// ============================================================================
// EJECUTOR PRINCIPAL: ANÁLISIS DE RENTA FIJA
// ============================================================================

export interface AnalisisRentaFijaInput {
  ticker: string;
  flujos: Flow[];
  precio: number;
  valorResidual?: number;
  freq?: number;
  valuation?: Date;
  spread?: number;
  tasaLibreRiesgo?: number;
  covenants?: {
    ebitda?: number;
    deudaTotal?: number;
    ebit?: number;
    gastoInteres?: number;
    activoCorriente?: number;
    pasivoCorriente?: number;
  };
  otrosTitulos?: { tir: number; duration: number }[]; // para curva argentina
}

export interface AnalisisRentaFijaResult {
  ticker: string;
  rendimientos: TirResult;
  sensibilidad: {
    convexidad: ConvexidadResult;
    dv01: DV01Result;
    variacion100bps: VariacionTotalResult;
  };
  riesgo?: {
    ipd?: IPDResult;
    gseess?: GSESSResult;
  };
  covenants?: CovenantsResult;
  curva?: CurvaArgentinaResult;
  recomendacion: string;
  alertas: string[];
}

/**
 * Ejecutor principal de análisis de renta fija según Elbaum Cap 10.
 * Integra cálculo de rendimientos, sensibilidad, riesgo y covenants.
 */
export function ejecutarAnalisisRentaFija(input: AnalisisRentaFijaInput): AnalisisRentaFijaResult {
  const { ticker, flujos, precio, valorResidual = 100, freq = 2, valuation = new Date(), spread, tasaLibreRiesgo = 0.04, covenants, otrosTitulos } = input;

  // 1. Rendimientos básicos (TIR, TEA, TNA, duration)
  const rendimientos = calcularRendimientosON(flujos, precio, valorResidual, freq, valuation);

  // 2. Sensibilidad (convexidad, DV01, variación)
  const convexidadResult = convexidad(flujos, rendimientos.tir ?? 0, valuation, freq);
  const dv01Result = dv01(precio, rendimientos.durationModificada ?? 0);
  const variacionResult = variacionTotal(rendimientos.durationModificada, convexidadResult.convexidad, 0.01); // ±100bps

  const sensibilidad = {
    convexidad: convexidadResult,
    dv01: dv01Result,
    variacion100bps: variacionResult
  };

  // 3. Riesgo (IPD, GS-ESS) si hay spread
  let riesgo: { ipd?: IPDResult; gseess?: GSESSResult } | undefined;
  if (spread != null) {
    const ipdResult = ipd(spread, tasaLibreRiesgo);
    const gseessResult = gseessSpreadEquilibrio(0.02, ipdResult.probabilidadDefault, spread * 10000); // spread en bps
    riesgo = { ipd: ipdResult, gseess: gseessResult };
  }

  // 4. Covenants si hay datos contables
  let covenantsResult: CovenantsResult | undefined;
  if (covenants?.ebitda && covenants?.deudaTotal && covenants?.ebit && covenants?.gastoInteres && covenants?.activoCorriente && covenants?.pasivoCorriente) {
    covenantsResult = evaluarCovenants(
      covenants.ebitda,
      covenants.deudaTotal,
      covenants.ebit,
      covenants.gastoInteres,
      covenants.activoCorriente,
      covenants.pasivoCorriente
    );
  }

  // 5. Curva argentina si hay otros títulos
  let curvaResult: CurvaArgentinaResult | undefined;
  if (otrosTitulos && otrosTitulos.length >= 3) {
    curvaResult = curvaArgentina(otrosTitulos);
  }

  // 6. Recomendación y alertas
  const alertas: string[] = [];

  if (rendimientos.tir != null && rendimientos.tir > 0.15) {
    alertas.push(`TIR alta (${(rendimientos.tir * 100).toFixed(2)}%): verificar riesgo de default.`);
  }

  if (riesgo?.ipd && riesgo.ipd.probabilidadDefault > 0.5) {
    alertas.push(`IPD alto (${(riesgo.ipd.probabilidadDefault * 100).toFixed(2)}%): riesgo de default significativo.`);
  }

  if (riesgo?.gseess && riesgo.gseess.clasificacion === "caro") {
    alertas.push(`Spread caro vs equilibrio: considerar vender o evitar.`);
  }

  if (covenantsResult && covenantsResult.resumen.includes("ALERTA")) {
    alertas.push(`Covenants en rojo: riesgo de refinanciación.`);
  }

  if (rendimientos.durationModificada != null && rendimientos.durationModificada > 10) {
    alertas.push(`Duration alta (${rendimientos.durationModificada.toFixed(2)} años): alta sensibilidad a tasas.`);
  }

  let recomendacion = "";
  if (alertas.length === 0) {
    recomendacion = `RECOMENDACIÓN: ${ticker} presenta perfil de riesgo-retorno equilibrado. TIR ${(rendimientos.tir ?? 0 * 100).toFixed(2)}%, duration ${(rendimientos.durationModificada ?? 0).toFixed(2)} años. Sin alertas mayores.`;
  } else if (alertas.length >= 3) {
    recomendacion = `RECOMENDACIÓN: ${ticker} presenta múltiples alertas. Considerar reducir exposición o evitar.`;
  } else {
    recomendacion = `RECOMENDACIÓN: ${ticker} presenta algunas alertas. Monitorear estrechamente antes de invertir.`;
  }

  return {
    ticker,
    rendimientos,
    sensibilidad,
    riesgo,
    covenants: covenantsResult,
    curva: curvaResult,
    recomendacion,
    alertas
  };
}

// Re-export proyectarInversion from the main TIR engine (renta-fija.functions.ts)
// This consolidates both TIR engines while maintaining backward compatibility
export { proyectarInversion } from "../renta-fija.functions";
