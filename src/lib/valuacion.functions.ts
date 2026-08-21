// @ts-nocheck
import type { FundamentalAFResult } from "./fundamental-af.functions";

// ─── Tipos ─────────────────────────────────────────────────────────────

export interface DuPontResult {
  margenNeto: number | null;
  rotacionActivos: number | null;
  multiplicadorPatrimonio: number | null;
  roeDupont: number | null;
  roeDupont5: number | null;
  cargaFiscal: number | null;
  cargaFinanciera: number | null;
  margenOperativo: number | null;
  advertencia: string | null;
}

export interface CCCResult {
  rotacionInventario: number | null;
  diasInventario: number | null;
  rotacionCxC: number | null;
  diasCobro: number | null;
  rotacionCxP: number | null;
  diasPago: number | null;
  cicloConversionCaja: number | null;
  interpretacion: string | null;
  notaBalance: string | null;
}

export interface AltmanZResult {
  x1: number | null;
  x2: number | null;
  x3: number | null;
  x4: number | null;
  x5: number | null;
  zScore: number | null;
  zona: string | null;
}

export interface PiotroskiResult {
  puntaje: number | null;
  puntosPosibles: number;
  desglose: { item: number; nombre: string; ok: boolean | null }[];
  interpretacion: string | null;
}

export interface DilucionResult {
  sharesActual: number | null;
  sharesHistoria: number | null;
  variacionPct: number | null;
  interpretacion: string | null;
}

export interface RatiosAmatResult {
  /** Ratio de endeudamiento = Pasivo / (Patrimonio + Pasivo) — umbral general 0.6 */
  endeudamiento: number | null;
  /** Ratio de calidad de la deuda = Pasivo corriente / Pasivo total — menor = mejor */
  calidadDeuda: number | null;
  /** Ratio de liquidez = Activo corriente / Pasivo corriente — ideal 1.5-2 */
  liquidez: number | null;
  /** Ratio de rotación del activo = Ventas / Activo total — mayor = mejor */
  rotacionActivo: number | null;
  /** Apalancamiento financiero favorable: ROA > coste de deuda (Kd) */
  apalancamientoFavorable: boolean | null;
  /** Punto de equilibrio estimado (en % de ventas actuales) — proxy con costos fijos */
  puntoEquilibrioPctVentas: number | null;
  /** Interpretación contextual por sector (metodología Amat) */
  interpretacionSectorial: string[];
  /** Clasificación del sector para interpretación */
  tipoSector:
    "industrial" | "comercial" | "tecnologia" | "financiero" | "salud" | "utilidades" | "otro";
}

export interface ValuacionResult {
  grahamNumber: number | null;
  margenSeguridadGraham: number | null;
  valorIntrinsecoDCF: number | null;
  margenSeguridadDCF: number | null;
  wacc: number | null;
  ke: number | null;
  kd: number | null;
  advertencias: string[];
  dupont: DuPontResult | null;
  ccc: CCCResult | null;
  altmanZ: AltmanZResult | null;
  piotroski: PiotroskiResult | null;
  dilucion: DilucionResult | null;
  ratiosAmat: RatiosAmatResult | null;
}

// ─── Helpers ────────────────────────────────────────────────────────────

function safeNum(v: number | null | undefined): number | null {
  return v != null && isFinite(v) ? v : null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ─── BLOQUE 4 — Costo de nuevas emisiones y utilidades retenidas ────
// Fuente: Pascale, Cap. 13, Apéndice. DOCUMENTACIÓN ONLY — no implementado
// (ajuste fino, no prioritario para el ciclo actual). No perder la fuente.
//
//   kne = k / (1 - F)               rendimiento requerido para NUEVA EMISIÓN
//                                    de capital (F = costo de flotación, %)
//   kr  = k · (1 - td) · (1 - c)    rendimiento requerido de UTILIDADES RETENIDAS
//                                    (td = tasa impositiva sobre dividendos,
//                                    c = costo de colocación)
//
// donde k = costo de fondos propios (ke del Bloque 1, ya ajustado por Hamada).
//
// Uso futuro: distinguir el costo de fondos propios según la fuente de
// financiamiento cuando el motor detecte una ampliación de capital reciente.
// Dato disponible: netSharePurchaseActivity (Yahoo Finance) — si es negativo,
// hubo emisión (kne aplicable); si es positivo, hubo recompra/utilidades
// retenidas (kr aplicable). Si se implementa, como funciones puras en este
// mismo archivo:
//   export function costoNuevaEmision(k: number, flotacion: number): number
//     // kne = k / (1 - flotacion)  — flotacion en decimal (ej: 0.05 = 5%)
//   export function costoUtilidadesRetenidas(k: number, td: number, c: number): number
//     // kr = k * (1 - td) * (1 - c) — td y c en decimal
// Fórmula literal de Pascale (no inventada); pendiente de decisión de alcance.

// ─── BLOQUE 1 — CAPM + Beta apalancado (Hamada) ─────────────────────
// Fuente: Pascale, Cap. 13, "El rendimiento requerido para las inversiones", 13.2.
//   ke = rf + [rm - rf]·βE        con  βE = β·[1 + (D/S)(1 - t)]
// Yahoo Finance trae β ya apalancada con la estructura contable actual;
// estas funciones permiten desapalancar (riesgo puro operativo) y
// reapalancar a cualquier estructura objetivo (mercado, sector, peer).

export interface BetaHamadaResult {
  /** β desapalancada: solo riesgo operativo (beta de activos) */
  betaDesapalancada: number | null;
  /** β apalancada a la estructura provista (o la observada si D/E es null) */
  betaApalancada: number | null;
  /** D/S en decimales (ej: 0.6 = 60%) */
  debtToEquity: number | null;
  /** t en decimales (ej: 0.25 = 25%) */
  taxRate: number | null;
  /** De dónde salió el beta observado: yahoo | propia | null */
  fuente: "yahoo" | "propia" | null;
}

/** β = βE / [1 + (D/S)(1 - t)] — desapalanca un beta observado (Hamada inverso) */
export function desapalancarBeta(
  betaObservado: number | null | undefined,
  debtToEquity: number | null | undefined,
  taxRate: number | null | undefined,
): number | null {
  if (betaObservado == null || !isFinite(betaObservado)) return null;
  if (debtToEquity == null || !isFinite(debtToEquity) || debtToEquity < 0) return null;
  const t = taxRate == null || !isFinite(taxRate) ? 0 : taxRate;
  const denominador = 1 + debtToEquity * (1 - t);
  if (denominador <= 0) return null;
  return betaObservado / denominador;
}

/** βE = β·[1 + (D/S)(1 - t)] — reapalanca a una estructura objetivo (Hamada directo) */
export function reapalancarBeta(
  betaDesapalancado: number | null | undefined,
  debtToEquityObjetivo: number | null | undefined,
  taxRate: number | null | undefined,
): number | null {
  if (betaDesapalancado == null || !isFinite(betaDesapalancado)) return null;
  if (debtToEquityObjetivo == null || !isFinite(debtToEquityObjetivo) || debtToEquityObjetivo < 0) {
    return null;
  }
  const t = taxRate == null || !isFinite(taxRate) ? 0 : taxRate;
  return betaDesapalancado * (1 + debtToEquityObjetivo * (1 - t));
}

/**
 * Beta pura de negocio a partir de un FundamentalAFResult ya circulante.
 * Usa r.beta (Yahoo, apalancado) con fallback a r.betaPropio (regresión interna).
 */
export function betaPuraAF(r: FundamentalAFResult): BetaHamadaResult {
  const betaObservado = safeNum(r.beta) ?? safeNum(r.betaPropio);
  const fuente: BetaHamadaResult["fuente"] =
    safeNum(r.beta) != null ? "yahoo" : safeNum(r.betaPropio) != null ? "propia" : null;
  const dE =
    safeNum(r.debtToEquityRaw) != null ? (safeNum(r.debtToEquityRaw) as number) / 100 : null;
  const effectiveTax = safeNum(r.effectiveTaxRate);
  const t = effectiveTax != null ? effectiveTax / 100 : 0.25;
  const betaDesapalancada = desapalancarBeta(betaObservado, dE, t);
  const betaApalancada =
    betaDesapalancada != null && dE != null
      ? reapalancarBeta(betaDesapalancada, dE, t)
      : betaObservado;
  return { betaDesapalancada, betaApalancada, debtToEquity: dE, taxRate: t, fuente };
}

// ─── PASO 9 — DuPont ──────────────────────────────────────────────────

export function calcularDuPont(r: FundamentalAFResult): DuPontResult {
  const totalRevenue = safeNum(r.totalRevenue);
  const netIncome = safeNum(r.netIncomeFromIS);
  const ebit = safeNum(r.ebit);
  const incomeBeforeTax = safeNum(r.incomeBeforeTax);
  const totalAssets = safeNum(r.totalAssets);
  const equity = safeNum(r.totalStockholderEquity);

  if (!totalRevenue || !totalAssets || !equity || !netIncome) {
    return {
      margenNeto: null,
      rotacionActivos: null,
      multiplicadorPatrimonio: null,
      roeDupont: null,
      roeDupont5: null,
      cargaFiscal: null,
      cargaFinanciera: null,
      margenOperativo: null,
      advertencia:
        "N/D — datos insuficientes (totalRevenue, netIncome, totalAssets, equity requeridos)",
    };
  }

  const margenNeto = Math.round((netIncome / totalRevenue) * 10000) / 100;
  const rotacionActivos = Math.round((totalRevenue / totalAssets) * 100) / 100;
  const multiplicadorPatrimonio = Math.round((totalAssets / equity) * 100) / 100;
  const roeDupont = Math.round(margenNeto * rotacionActivos * multiplicadorPatrimonio * 100) / 100;

  let advertencia: string | null = null;
  if (r.returnOnEquity != null && roeDupont != null) {
    const diff = Math.abs(r.returnOnEquity * 100 - roeDupont);
    if (diff > 2) {
      advertencia = `ROE recompuesto (${roeDupont.toFixed(1)}%) difiere >2pp del ROE financialData (${(r.returnOnEquity * 100).toFixed(1)}%) — verificar período fiscal de cada fuente`;
    }
  }

  // DuPont 5 factores
  let roeDupont5: number | null = null;
  let cargaFiscal: number | null = null;
  let cargaFinanciera: number | null = null;
  let margenOperativo: number | null = null;

  if (incomeBeforeTax != null && ebit != null && incomeBeforeTax > 0 && ebit !== 0) {
    cargaFiscal = Math.round((netIncome / incomeBeforeTax) * 10000) / 100;
    cargaFinanciera = Math.round((incomeBeforeTax / ebit) * 10000) / 100;
    margenOperativo = Math.round((ebit / totalRevenue) * 10000) / 100;
    roeDupont5 =
      Math.round(
        cargaFiscal *
          cargaFinanciera *
          margenOperativo *
          rotacionActivos *
          multiplicadorPatrimonio *
          100,
      ) / 100;
  }

  return {
    margenNeto,
    rotacionActivos,
    multiplicadorPatrimonio,
    roeDupont,
    roeDupont5,
    cargaFiscal,
    cargaFinanciera,
    margenOperativo,
    advertencia,
  };
}

// ─── PASO 10 — CCC ────────────────────────────────────────────────────

export function calcularCCC(r: FundamentalAFResult): CCCResult {
  const inventory = safeNum(r.inventory);
  const netReceivables = safeNum(r.netReceivables);
  const accountsPayable = safeNum(r.accountsPayable);
  const costOfRevenue = safeNum(r.costOfRevenue);
  const totalRevenue = safeNum(r.totalRevenue);

  if (!totalRevenue || !costOfRevenue) {
    return {
      rotacionInventario: null,
      diasInventario: null,
      rotacionCxC: null,
      diasCobro: null,
      rotacionCxP: null,
      diasPago: null,
      cicloConversionCaja: null,
      interpretacion: null,
      notaBalance: "N/D — faltan totalRevenue o costOfRevenue",
    };
  }

  const notaBalance = "cálculo con balance puntual, no promedio (solo un año disponible)";

  // DIO
  let diasInventario: number | null = null;
  let rotacionInventario: number | null = null;
  if (inventory != null && inventory > 0) {
    rotacionInventario = Math.round((costOfRevenue / inventory) * 100) / 100;
    diasInventario =
      rotacionInventario > 0 ? Math.round((365 / rotacionInventario) * 100) / 100 : null;
  }

  // DSO
  let diasCobro: number | null = null;
  let rotacionCxC: number | null = null;
  if (netReceivables != null && netReceivables > 0) {
    rotacionCxC = Math.round((totalRevenue / netReceivables) * 100) / 100;
    diasCobro = rotacionCxC > 0 ? Math.round((365 / rotacionCxC) * 100) / 100 : null;
  }

  // DPO
  let diasPago: number | null = null;
  let rotacionCxP: number | null = null;
  if (accountsPayable != null && accountsPayable > 0) {
    rotacionCxP = Math.round((costOfRevenue / accountsPayable) * 100) / 100;
    diasPago = rotacionCxP > 0 ? Math.round((365 / rotacionCxP) * 100) / 100 : null;
  }

  let cicloConversionCaja: number | null = null;
  if (diasInventario != null && diasCobro != null && diasPago != null) {
    cicloConversionCaja = Math.round((diasInventario + diasCobro - diasPago) * 100) / 100;
  } else if (diasCobro != null && diasPago != null && diasInventario == null) {
    cicloConversionCaja = Math.round((diasCobro - diasPago) * 100) / 100;
  }

  let interpretacion: string | null = null;
  if (cicloConversionCaja != null) {
    if (cicloConversionCaja < 0) {
      interpretacion =
        "CCC negativo: la empresa cobra antes de pagar a proveedores — financia operaciones con capital ajeno gratuito (ej: retail/marketplace)";
    } else if (cicloConversionCaja > 90) {
      interpretacion =
        "CCC positivo alto (>90d): requiere capital de trabajo propio significativo, mayor sensibilidad a restricciones de crédito";
    } else {
      interpretacion = "CCC normal para la mayoría de sectores productivos";
    }
  }

  return {
    rotacionInventario,
    diasInventario,
    rotacionCxC,
    diasCobro,
    rotacionCxP,
    diasPago,
    cicloConversionCaja,
    interpretacion,
    notaBalance,
  };
}

// ─── PASO 11 — Altman Z-Score ─────────────────────────────────────────

export function calcularAltmanZ(r: FundamentalAFResult): AltmanZResult {
  const totalAssets = safeNum(r.totalAssets);
  const totalLiabilities = safeNum(r.totalLiabilities);
  const equity = safeNum(r.totalStockholderEquity);
  const workingCapital = safeNum(r.workingCapital);
  const retainedEarnings = safeNum(r.retainedEarnings);
  const ebit = safeNum(r.ebit);
  const marketCapM = safeNum(r.marketCapM);
  const totalRevenue = safeNum(r.totalRevenue);

  if (!totalAssets || totalAssets <= 0 || !totalRevenue) {
    return { x1: null, x2: null, x3: null, x4: null, x5: null, zScore: null, zona: null };
  }

  const totalLiab = totalLiabilities ?? totalAssets - (equity ?? 0);

  const x1 =
    workingCapital != null ? Math.round((workingCapital / totalAssets) * 10000) / 10000 : 0;
  const x2 =
    retainedEarnings != null ? Math.round((retainedEarnings / totalAssets) * 10000) / 10000 : null;
  const x3 = ebit != null ? Math.round((ebit / totalAssets) * 10000) / 10000 : null;
  const x4 =
    marketCapM != null && totalLiab > 0
      ? Math.round(((marketCapM * 1e6) / totalLiab) * 10000) / 10000
      : null;
  const x5 = Math.round((totalRevenue / totalAssets) * 10000) / 10000;

  if (x2 == null || x3 == null || x4 == null) {
    return {
      x1,
      x2,
      x3,
      x4,
      x5,
      zScore: null,
      zona: "N/D — faltan retainedEarnings, ebit o marketCap",
    };
  }

  const z = Math.round((1.2 * x1 + 1.4 * x2 + 3.3 * x3 + 0.6 * x4 + 1.0 * x5) * 10000) / 10000;
  let zona: string;
  if (z > 2.99) zona = "Zona segura";
  else if (z >= 1.81) zona = "Zona gris — monitorear";
  else zona = "Zona de riesgo de insolvencia";

  return { x1, x2, x3, x4, x5, zScore: z, zona };
}

// ─── PASO 12 — Piotroski F-Score ──────────────────────────────────────

export function calcularPiotroski(
  r: FundamentalAFResult,
  incomeRows?: Record<string, unknown>[],
  bsRows?: Record<string, unknown>[],
): PiotroskiResult {
  const hasHist = (incomeRows?.length ?? 0) >= 2;
  if (!hasHist) {
    return {
      puntaje: null,
      puntosPosibles: 9,
      desglose: [{ item: 0, nombre: "Historial insuficiente (<2 ejercicios)", ok: null }],
      interpretacion: "N/D — historial insuficiente",
    };
  }

  const t = incomeRows![0];
  const t_1 = incomeRows![1];
  const bsT = bsRows?.[0] ?? {};
  const bsT_1 = bsRows?.[1] ?? {};

  const ni = (v: Record<string, unknown>, key: string) => {
    const raw = v[key];
    if (typeof raw === "number" && isFinite(raw)) return raw;
    if (raw && typeof raw === "object") {
      const rawVal = (raw as Record<string, unknown>).raw;
      if (typeof rawVal === "number" && isFinite(rawVal)) return rawVal;
    }
    return null;
  };

  const netIncome_t = ni(t, "netIncome");
  const netIncome_t1 = ni(t_1, "netIncome");
  const totalAssets_t = ni(bsT, "totalAssets") ?? r.totalAssets;
  const totalAssets_t1 = ni(bsT_1, "totalAssets") ?? totalAssets_t;
  const cfo_t = r.totalCashFromOperatingActivities;
  const longTermDebt_t = ni(bsT, "longTermDebt") ?? 0;
  const longTermDebt_t1 = ni(bsT_1, "longTermDebt") ?? 0;
  const currRatio_t =
    r.currentRatioCheck ??
    (ni(bsT, "totalCurrentAssets") != null && ni(bsT, "totalCurrentLiabilities")
      ? ni(bsT, "totalCurrentAssets")! / ni(bsT, "totalCurrentLiabilities")!
      : r.currentRatio);
  const currRatio_t1 =
    ni(bsT_1, "totalCurrentAssets") != null && ni(bsT_1, "totalCurrentLiabilities")
      ? ni(bsT_1, "totalCurrentAssets")! / ni(bsT_1, "totalCurrentLiabilities")!
      : currRatio_t;
  const grossProfit_t = ni(t, "grossProfit");
  const grossProfit_t1 = ni(t_1, "grossProfit");
  const rev_t = ni(t, "totalRevenue");
  const rev_t1 = ni(t_1, "totalRevenue");

  const roa_t = netIncome_t != null && totalAssets_t ? netIncome_t / totalAssets_t : null;
  const roa_t1 = netIncome_t1 != null && totalAssets_t1 ? netIncome_t1 / totalAssets_t1 : null;

  const desglose: { item: number; nombre: string; ok: boolean | null }[] = [];

  // 1. ROA > 0
  const r1 = roa_t != null && roa_t > 0;
  desglose.push({ item: 1, nombre: "ROA positivo", ok: r1 });

  // 2. CFO > 0
  const r2 = cfo_t != null && cfo_t > 0;
  desglose.push({ item: 2, nombre: "CFO positivo", ok: r2 });

  // 3. ROA mejorando
  const r3 = roa_t != null && roa_t1 != null && roa_t > roa_t1;
  desglose.push({ item: 3, nombre: "ROA mejorando vs año anterior", ok: r3 });

  // 4. CFO > Net Income
  const r4 = cfo_t != null && netIncome_t != null && cfo_t > netIncome_t;
  desglose.push({ item: 4, nombre: "CFO > Utilidad Neta (calidad earnings)", ok: r4 });

  // 5. Deuda LP / Activos reduciendo
  const ratioDeb_t = totalAssets_t ? longTermDebt_t / totalAssets_t : 0;
  const ratioDeb_t1 = totalAssets_t1 ? longTermDebt_t1 / totalAssets_t1 : 0;
  const r5 = ratioDeb_t < ratioDeb_t1;
  desglose.push({ item: 5, nombre: "Apalancamiento reduciendo (deuda LP/activos)", ok: r5 });

  // 6. Current ratio mejorando
  const r6 = currRatio_t != null && currRatio_t1 != null && currRatio_t > currRatio_t1;
  desglose.push({ item: 6, nombre: "Liquidez mejorando (current ratio)", ok: r6 });

  // 7. No dilución
  const r7 =
    r.sharesOutstanding != null && r.dilutedAverageShares != null
      ? r.sharesOutstanding <= r.dilutedAverageShares
      : null;
  desglose.push({ item: 7, nombre: "Sin dilución de acciones", ok: r7 });

  // 8. Margen bruto mejorando
  const margen_t = rev_t && grossProfit_t ? grossProfit_t / rev_t : null;
  const margen_t1 = rev_t1 && grossProfit_t1 ? grossProfit_t1 / rev_t1 : null;
  const r8 = margen_t != null && margen_t1 != null && margen_t > margen_t1;
  desglose.push({ item: 8, nombre: "Margen bruto mejorando", ok: r8 });

  // 9. Rotación activos mejorando
  const rot_t = rev_t && totalAssets_t ? rev_t / totalAssets_t : null;
  const rot_t1 = rev_t1 && totalAssets_t1 ? rev_t1 / totalAssets_t1 : null;
  const r9 = rot_t != null && rot_t1 != null && rot_t > rot_t1;
  desglose.push({ item: 9, nombre: "Rotación activos mejorando", ok: r9 });

  const puntos = desglose.filter((d) => d.ok === true).length;
  const noData = desglose.filter((d) => d.ok === null).length;
  const puntosPosibles = 9 - noData;
  const puntaje = puntosPosibles > 0 ? Math.round((puntos / puntosPosibles) * 9) : null;

  let interpretacion: string | null = null;
  if (puntaje != null) {
    if (puntaje >= 7) interpretacion = "Fundamentals sólidos (filtro Piotroski)";
    else if (puntaje <= 2) interpretacion = "Fundamentals débiles — señal de alerta";
    else interpretacion = "Fundamentals mixtos";
  }

  return { puntaje, puntosPosibles: 9, desglose, interpretacion };
}

// ─── PASO 13 — Dilución vs Buyback ────────────────────────────────────

export function calcularDilucion(r: FundamentalAFResult): DilucionResult {
  const sharesActual = safeNum(r.sharesOutstanding);
  const sharesHist = safeNum(r.dilutedAverageShares);

  if (!sharesActual || !sharesHist) {
    return {
      sharesActual,
      sharesHistoria: null,
      variacionPct: null,
      interpretacion:
        "N/D — requiere dilutedAverageShares del income statement (no disponible en módulos actuales)",
    };
  }

  const variacionPct = Math.round(((sharesActual - sharesHist) / sharesHist) * 10000) / 100;
  let interpretacion: string;
  if (variacionPct < -0.5) {
    interpretacion = "Recompra neta de acciones (buyback) — favorable para accionista existente";
  } else if (variacionPct > 0.5) {
    interpretacion =
      "Dilución neta — nuevas acciones emitidas, revisar motivo (M&A, stock comp, ampliación de capital)";
  } else {
    interpretacion = "Estable — sin cambios significativos en estructura accionaria";
  }

  return { sharesActual, sharesHistoria: sharesHist, variacionPct, interpretacion };
}

// ─── PASO 13.5 — Ratios de balance y cuenta de resultados (Oriol Amat) ────

/**
 * Calcula los ratios de la metodología de Oriol Amat ("Contabilidad y Finanzas
 * para Dummies"), con interpretación contextual por sector/industria.
 *
 * Regla de oro de Amat: un ratio por sí solo no dice nada — debe compararse
 * contra pares del mismo sector, dimensión y zona geográfica, y/o contra la
 * propia evolución histórica de la empresa.
 */
export function calcularRatiosAmat(r: FundamentalAFResult): RatiosAmatResult {
  const advertenciasInterpretacion: string[] = [];
  const totalAssets = safeNum(r.totalAssets);
  const totalLiabilities = safeNum(r.totalLiabilities);
  const totalEquity = safeNum(r.totalStockholderEquity);
  const currentAssets = safeNum(r.totalCurrentAssets);
  const currentLiabilities = safeNum(r.totalCurrentLiabilities);
  const totalRevenue = safeNum(r.totalRevenue);
  const ebit = safeNum(r.ebit);
  const interestExpense = safeNum(r.interestExpense);

  // ── Ratios brutos ──

  // 1) Endeudamiento = Pasivo / (Patrimonio + Pasivo) — umbral general ≤ 0.6
  let endeudamiento: number | null = null;
  if (totalLiabilities != null && totalEquity != null && totalLiabilities + totalEquity > 0) {
    endeudamiento =
      Math.round((totalLiabilities / (totalLiabilities + totalEquity)) * 10000) / 10000;
  }

  // 2) Calidad de la deuda = Pasivo corriente / Pasivo total — menor = mejor
  let calidadDeuda: number | null = null;
  if (currentLiabilities != null && totalLiabilities != null && totalLiabilities > 0) {
    calidadDeuda = Math.round((currentLiabilities / totalLiabilities) * 10000) / 10000;
  }

  // 3) Liquidez = Activo corriente / Pasivo corriente — ideal 1.5-2
  let liquidez: number | null = null;
  if (currentAssets != null && currentLiabilities != null && currentLiabilities > 0) {
    liquidez = Math.round((currentAssets / currentLiabilities) * 100) / 100;
  }

  // 4) Rotación del activo = Ventas / Activo total — mayor = mejor
  let rotacionActivo: number | null = null;
  if (totalRevenue != null && totalAssets != null && totalAssets > 0) {
    rotacionActivo = Math.round((totalRevenue / totalAssets) * 100) / 100;
  }

  // 5) Apalancamiento financiero favorable: ROA > coste de deuda (Kd aproximado)
  //    Si no hay datos para comparar, devolver null.
  let apalancamientoFavorable: boolean | null = null;
  const roa = ebit != null && totalAssets != null && totalAssets > 0 ? ebit / totalAssets : null;
  if (roa != null && interestExpense != null && totalLiabilities != null && totalLiabilities > 0) {
    const kdAprox = interestExpense / totalLiabilities;
    apalancamientoFavorable = roa > kdAprox;
  }

  // 6) Punto de equilibrio (proxy): Costos fijos / (1 - Costos variables/Ventas)
  //    Costos variables ≈ COGS (costOfRevenue). Costos fijos ≈ OpEx (SG&A) — no siempre disponible.
  //    Proxy conservador: margen operativo → punto de equilibrio ≈ 1/margenoperativo% de ventas
  //    (devuelve el % de ventas actual que cubre costos fijos).
  let puntoEquilibrioPctVentas: number | null = null;
  const costOfRevenue = safeNum(r.costOfRevenue);
  const operatingMargin = safeNum(r.operatingMargin);
  if (operatingMargin != null && operatingMargin > 0) {
    // Punto muerto ≈ costos fijos / margen contribución — proxy con opex total
    // Si el margen operativo es X%, el punto de equilibrio está en (1 - X) de las ventas
    // Como share: ventas - costos = margen → punto de equilibrio = costos fijos / margen unitario
    // Aproximación: 100% - (margen operativo * 100) nos da el % de ventas que cubre costos
    puntoEquilibrioPctVentas = Math.round((1 - operatingMargin) * 10000) / 100;
  } else if (costOfRevenue != null && totalRevenue != null && totalRevenue > 0) {
    const margenContribucion = (totalRevenue - costOfRevenue) / totalRevenue;
    if (margenContribucion > 0) {
      puntoEquilibrioPctVentas = Math.round((1 - margenContribucion) * 10000) / 100;
    }
  }

  // ── Interpretación sectorial (metodología Amat) ──

  const sector = r.sector ?? "";
  const industry = r.industry ?? "";
  const tipoSector = clasificarSectorAmat(sector, industry);
  const interp = interpretarRatiosAmat({
    endeudamiento,
    calidadDeuda,
    liquidez,
    rotacionActivo,
    apalancamientoFavorable,
    tipoSector,
    sector,
    industry,
  });

  return {
    endeudamiento,
    calidadDeuda,
    liquidez,
    rotacionActivo,
    apalancamientoFavorable,
    puntoEquilibrioPctVentas,
    interpretacionSectorial: interp,
    tipoSector,
  };
}

/** Clasifica el sector en una categoría para aplicar las reglas interpretativas de Amat */
function clasificarSectorAmat(sector: string, industry: string): RatiosAmatResult["tipoSector"] {
  const s = sector.toLowerCase();
  const i = industry.toLowerCase();
  // Sectores financieros e inmobiliarios
  if (
    s.includes("financial") ||
    s.includes("real estate") ||
    i.includes("bank") ||
    i.includes("insurance") ||
    i.includes("reit")
  ) {
    return "financiero";
  }
  // Utilidades (electricidad, gas, agua) — flujos predecibles
  if (
    s.includes("utilities") ||
    i.includes("electric") ||
    i.includes("gas") ||
    i.includes("water")
  ) {
    return "utilidades";
  }
  // Salud (farmacéuticas, hospitales, dispositivos)
  if (
    s.includes("healthcare") ||
    i.includes("drug") ||
    i.includes("hospital") ||
    i.includes("medical") ||
    i.includes("biotech")
  ) {
    return "salud";
  }
  // Tecnología y comunicaciones (software, semiconductores, internet)
  if (
    s.includes("technology") ||
    s.includes("communication") ||
    i.includes("software") ||
    i.includes("semiconductor") ||
    i.includes("internet") ||
    i.includes("telecom")
  ) {
    return "tecnologia";
  }
  // Consumo cíclico y defensivo (retail, restaurantes, alimentos)
  const comerciosKeywords = [
    "retail",
    "discount",
    "restaurant",
    "food",
    "beverage",
    "supermarket",
    "apparel",
    "footwear",
    "internet retail",
    "auto",
    "consumer",
  ];
  if (s.includes("consumer") || comerciosKeywords.some((k) => i.includes(k))) {
    return "comercial";
  }
  // Industriales, materiales, energía — activos pesados
  if (
    s.includes("industrials") ||
    s.includes("basic materials") ||
    s.includes("energy") ||
    i.includes("machinery") ||
    i.includes("construction") ||
    i.includes("steel") ||
    i.includes("aluminum")
  ) {
    return "industrial";
  }
  return "otro";
}

/** Genera interpretaciones contextuales según el sector (reglas de Amat) */
function interpretarRatiosAmat(params: {
  endeudamiento: number | null;
  calidadDeuda: number | null;
  liquidez: number | null;
  rotacionActivo: number | null;
  apalancamientoFavorable: boolean | null;
  tipoSector: RatiosAmatResult["tipoSector"];
  sector: string;
  industry: string;
}): string[] {
  const out: string[] = [];
  const {
    endeudamiento,
    calidadDeuda,
    liquidez,
    rotacionActivo,
    apalancamientoFavorable,
    tipoSector,
    sector,
    industry,
  } = params;

  // ── Ratio de endeudamiento (umbral general 0.6, sector-dependiente) ──
  if (endeudamiento != null) {
    const umbralEndeudamiento =
      tipoSector === "utilidades" || tipoSector === "financiero" ? 0.75 : 0.6;
    if (tipoSector === "financiero") {
      out.push(
        `Endeudamiento ${(endeudamiento * 100).toFixed(1)}%: en servicios financieros el pasivo es materia prima (depósitos/financiación automática), por lo que niveles elevados son estructurales y no necesariamente señal de descapitalización.`,
      );
    } else if (tipoSector === "utilidades" && endeudamiento > 0.6) {
      out.push(
        `Endeudamiento ${(endeudamiento * 100).toFixed(1)}% supera el umbral general del 60%, pero en utilidades (flujos predecibles por regulación) es aceptable operar con mayor apalancamiento.`,
      );
    } else if (endeudamiento > umbralEndeudamiento) {
      out.push(
        `⚠️ Endeudamiento ${(endeudamiento * 100).toFixed(1)}% supera el umbral del ${(umbralEndeudamiento * 100).toFixed(0)}% — riesgo de descapitalización. Verificar si la deuda financia activos productivos y no se usa para cubrir gastos corrientes.`,
      );
    } else if (endeudamiento <= 0.5) {
      out.push(
        `Endeudamiento ${(endeudamiento * 100).toFixed(1)}% ≤ 50%: empresa bien capitalizada con independencia financiera preservada.`,
      );
    } else {
      out.push(
        `Endeudamiento ${(endeudamiento * 100).toFixed(1)}% en zona correcta (≤ ${(umbralEndeudamiento * 100).toFixed(0)}%) — equilibrio entre capitalización y rentabilidad.`,
      );
    }
  }

  // ── Calidad de la deuda (menor = mejor, pasivo corriente = baja calidad) ──
  if (calidadDeuda != null) {
    if (tipoSector === "financiero") {
      out.push(
        `Calidad deuda ${(calidadDeuda * 100).toFixed(1)}% de pasivo corriente: en banca, vigilar la proporción de depósitos exigibles — un ratio muy elevado indica vulnerabilidad a corridas bancarias.`,
      );
    } else if (calidadDeuda > 0.75) {
      out.push(
        `⚠️ Calidad deuda ${(calidadDeuda * 100).toFixed(1)}% — la mayor parte del pasivo es a corto plazo (baja calidad), riesgo de renovación/refinanciación.`,
      );
    } else if (calidadDeuda < 0.4) {
      out.push(
        `Calidad deuda ${(calidadDeuda * 100).toFixed(1)}% — predominio de deuda a largo plazo (alta calidad), estructura financiera estable.`,
      );
    } else {
      out.push(
        `Calidad deuda ${(calidadDeuda * 100).toFixed(1)}% — composición mixta de deuda corriente y no corriente.`,
      );
    }
  }

  // ── Liquidez (ideal 1.5-2, excepto comerciales con rotación rápida) ──
  if (liquidez != null) {
    if (tipoSector === "comercial" && liquidez < 1) {
      const industriaMsg = industry || "este sector";
      out.push(
        `Liquidez ${liquidez.toFixed(2)} < 1: en ${industriaMsg} (rotación rápida de existencias + cobro al contado) es normal operar con activo corriente menor al pasivo corriente — la financiación proviene de proveedores, no indica problemas de tesorería.`,
      );
    } else if (tipoSector === "industrial" && liquidez < 1.2) {
      out.push(
        `⚠️ Liquidez ${liquidez.toFixed(2)} < 1.2 en industria con activos pesados — vigilar que no se financie activo no corriente con deuda a corto plazo (financiación desequilibrada).`,
      );
    } else if (liquidez > 2.5) {
      out.push(
        `Liquidez ${liquidez.toFixed(2)} elevada (>2.5): posible infrautilización de recursos corrientes — el activo corriente es más del doble del pasivo corriente, podría destinarse a inversión productiva.`,
      );
    } else if (liquidez >= 1.5 && liquidez <= 2) {
      out.push(
        `Liquidez ${liquidez.toFixed(2)} en rango ideal (1.5-2): holgura suficiente para pagos inmediatos sin exceso de capital ocioso.`,
      );
    } else if (liquidez < 1) {
      out.push(
        `⚠️ Liquidez ${liquidez.toFixed(2)} < 1: el activo corriente no cubre el pasivo corriente — riesgo potencial de tesorería.`,
      );
    } else {
      out.push(
        `Liquidez ${liquidez.toFixed(2)}: dentro de límites aceptables, aunque conviene reducir pasivo corriente para mayor holgura.`,
      );
    }
  }

  // ── Rotación del activo (mayor = mejor, vigilancia sectorial) ──
  if (rotacionActivo != null) {
    if (tipoSector === "industrial") {
      out.push(
        `Rotación activos ${rotacionActivo.toFixed(2)}x: en sectores industriales (maquinaria, siderurgia) suele ser baja por la inversión en activos fijos — vigilar que no caiga año tras año (capacidad ociosa o activos obsoletos).`,
      );
    } else if (tipoSector === "tecnologia") {
      out.push(
        `Rotación activos ${rotacionActivo.toFixed(2)}x: en tecnología se espera alta productividad del activo — gran parte del valor es intangible (fondos de comercio, patentes), comparar contra pares del sector.`,
      );
    } else if (tipoSector === "comercial") {
      out.push(
        `Rotación activos ${rotacionActivo.toFixed(2)}x: en comercios con rotación rápida de existencias este ratio debe ser elevado — cuanto mayor, mejor gestión del activo para generar ventas.`,
      );
    } else {
      out.push(
        `Rotación activos ${rotacionActivo.toFixed(2)}x — comparar contra pares del mismo sector y dimensión, y contra la evolución histórica de la empresa.`,
      );
    }
  }

  // ── Apalancamiento financiero favorable (ROA > Kd) ──
  if (apalancamientoFavorable != null) {
    if (apalancamientoFavorable) {
      out.push(
        `✓ Apalancamiento financiero favorable: el rendimiento del activo (ROA) supera el coste de la deuda — la deuda amplifica la rentabilidad del accionista sin destruir valor.`,
      );
    } else {
      out.push(
        `⚠️ Apalancamiento financiero desfavorable: el coste de la deuda supera el rendimiento del activo (ROA < Kd) — cada unidad de deuda destruye valor, conviene desapalancar.`,
      );
    }
  }

  return out;
}

// ─── Valuación completa ────────────────────────────────────────────────

export function calcularValuacionCompleta(
  r: FundamentalAFResult,
  incomeRowsRaw?: Record<string, unknown>[],
  bsRowsRaw?: Record<string, unknown>[],
): ValuacionResult {
  const advertencias: string[] = [];
  const currentPrice = safeNum(r.currentPrice);

  // Graham Number
  const eps = safeNum(
    r.trailingEps ?? (r.trailingPE != null && currentPrice ? currentPrice / r.trailingPE : null),
  );
  const bookValuePerShare =
    safeNum(r.totalStockholderEquity) && safeNum(r.sharesOutstanding)
      ? safeNum(r.totalStockholderEquity)! / safeNum(r.sharesOutstanding)!
      : null;
  let grahamNumber: number | null = null;
  let margenSeguridadGraham: number | null = null;
  if (eps != null && eps > 0 && bookValuePerShare != null && bookValuePerShare > 0) {
    grahamNumber = Math.round(Math.sqrt(22.5 * eps * bookValuePerShare) * 100) / 100;
    if (currentPrice && grahamNumber > 0) {
      margenSeguridadGraham =
        Math.round(((grahamNumber - currentPrice) / grahamNumber) * 10000) / 100;
    }
  }

  // DCF placeholder — requires manual Rf, ERP inputs
  // Full DCF calculated in the UI component with user inputs

  return {
    grahamNumber: grahamNumber,
    margenSeguridadGraham,
    valorIntrinsecoDCF: null,
    margenSeguridadDCF: null,
    wacc: null,
    ke: null,
    kd: null,
    advertencias,
    dupont: calcularDuPont(r),
    ccc: calcularCCC(r),
    altmanZ: calcularAltmanZ(r),
    piotroski: calcularPiotroski(r, incomeRowsRaw, bsRowsRaw),
    dilucion: calcularDilucion(r),
    ratiosAmat: calcularRatiosAmat(r),
  };
}

// ─── DCF completo (requiere inputs manuales del usuario) ───────────────

export interface DCFInputs {
  rf: number; // Risk-free rate (UST10Y), %
  erp: number; // Equity Risk Premium, %
  incluirRP: boolean; // Include Country Risk Premium?
  gTerminal: number; // Terminal growth rate, %
}

export function calcularDCF(
  r: FundamentalAFResult,
  inputs: DCFInputs,
): {
  valorIntrinseco: number | null;
  margenSeguridad: number | null;
  wacc: number | null;
  ke: number | null;
  kd: number | null;
  advertencias: string[];
} {
  const advertencias: string[] = [];
  const currentPrice = safeNum(r.currentPrice);
  const fcf0 = safeNum(
    r.freeCashflowRaw ?? (r.freeCashflowM != null ? r.freeCashflowM * 1e6 : null),
  );
  const beta = safeNum(r.beta);
  const marketCapM = safeNum(r.marketCapM);
  const totalDebt = safeNum(r.totalDebtBalance);
  const cash = safeNum(r.cashAndEquivalents);
  const shares = safeNum(r.sharesOutstanding);
  const revenueGrowth = safeNum(r.revenueGrowth);
  const interestCov = safeNum(r.interestCoverageRatio);
  const effectiveTax = safeNum(r.effectiveTaxRate);

  if (!fcf0 || fcf0 <= 0) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      wacc: null,
      ke: null,
      kd: null,
      advertencias: ["DCF no disponible: FCF0 es negativo o nulo"],
    };
  }
  if (!beta) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      wacc: null,
      ke: null,
      kd: null,
      advertencias: ["DCF no disponible: beta no disponible"],
    };
  }

  //  BLOQUE 1 — Hamada: desapalancar beta observada y reapalancarla a la
  //  estructura de mercado actual (coherente con los pesos E/V y D/V del WACC).
  //  Fuente: Pascale, Cap. 13, 13.2 — βE = β·[1 + (D/S)(1 - t)]
  const taxRateDCF = effectiveTax != null ? effectiveTax / 100 : 0.25;
  const debtToEquityRaw = safeNum(r.debtToEquityRaw);
  const deBook = debtToEquityRaw != null ? debtToEquityRaw / 100 : null;
  const betaDesapalancada = desapalancarBeta(beta, deBook, taxRateDCF);
  let betaUsada = beta;
  if (betaDesapalancada != null && marketCapM != null && marketCapM > 0) {
    const E = marketCapM * 1e6;
    const D = totalDebt != null && totalDebt >= 0 ? totalDebt : 0;
    if (E > 0) {
      const deMercado = D / E;
      const betaReapalancada = reapalancarBeta(betaDesapalancada, deMercado, taxRateDCF);
      if (betaReapalancada != null) {
        betaUsada = betaReapalancada;
        if (Math.abs(betaReapalancada - beta) > 0.01) {
          advertencias.push(
            `Beta reapalancada a estructura de mercado (Hamada): ${beta.toFixed(2)} → ${betaReapalancada.toFixed(2)} ` +
              `(D/E mercado=${deMercado.toFixed(2)}x, t=${taxRateDCF.toFixed(2)})`,
          );
        }
      }
    }
  }

  //  Bounds check: beta anómalo distorsiona Ke y WACC
  const betaClamp = betaUsada;
  if (betaUsada < 0.3 || betaUsada > 3.5) {
    betaUsada = betaUsada < 0.3 ? 0.3 : 3.5;
    advertencias.push(
      `Beta de ${betaClamp.toFixed(2)} fuera del rango plausible [0.3, 3.5] — se usó ${betaUsada.toFixed(2)} como proxy. ` +
        `Beta anómalo suele deberse a baja liquidez del ADR, quiebres estructurales en la muestra de regresión, ` +
        `o datos de Yahoo Finance con ventana inadecuada.`,
    );
  }

  if (!shares) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      wacc: null,
      ke: null,
      kd: null,
      advertencias: ["DCF no disponible: shares outstanding no disponible"],
    };
  }

  // Ke = Rf + Beta*ERP + CRP
  let crp = 0;
  if (inputs.incluirRP) {
    crp = r._riesgoPaisPct ?? 0;
  }
  const ke = Math.round((inputs.rf + betaUsada * inputs.erp + crp) * 100) / 100;
  if (ke <= 0) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      wacc: null,
      ke: null,
      kd: null,
      advertencias: ["Ke <= 0, revisar inputs"],
    };
  }

  // Kd via synthetic rating (Damodaran)
  let kd: number | null = null;
  if (interestCov != null) {
    let spread: number;
    if (interestCov > 8.5) spread = 1.0;
    else if (interestCov >= 6.5) spread = 1.5;
    else if (interestCov >= 4.0) spread = 2.0;
    else if (interestCov >= 2.5) spread = 3.0;
    else if (interestCov >= 1.0) spread = 5.0;
    else spread = 8.0;
    kd = Math.round((inputs.rf + spread) * 100) / 100;
  } else {
    advertencias.push(
      "DCF calculado sin Kd (falta interestCoverageRatio) — usando solo Ke como tasa de descuento",
    );
  }

  const taxRate =
    effectiveTax != null
      ? effectiveTax / 100
      : (() => {
          advertencias.push("tasa efectiva no disponible, se usó 25% referencial");
          return 0.25;
        })();
  const kdAfterTax = kd != null ? Math.round(kd * (1 - taxRate) * 100) / 100 : null;

  // WACC
  let wacc: number | null = null;
  if (marketCapM != null && totalDebt != null) {
    const E = marketCapM * 1e6;
    const D = totalDebt;
    const V = E + D;
    if (V > 0) {
      const waccEq = (E / V) * ke;
      const waccDebt = kdAfterTax != null ? (D / V) * kdAfterTax : 0;
      wacc = Math.round((waccEq + waccDebt) * 100) / 100;
    }
  }
  if (wacc == null) {
    wacc = ke;
    if (kdAfterTax != null) advertencias.push("WACC aproximado = Ke (sin datos de deuda)");
  }

  const discountRate = wacc / 100;
  if (discountRate <= inputs.gTerminal / 100) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      wacc,
      ke,
      kd,
      advertencias: [
        ...advertencias,
        "WACC <= g_terminal — denominador negativo, VT no calculable",
      ],
    };
  }

  // Growth rate for projections
  const g = revenueGrowth != null ? clamp(revenueGrowth, 0, 0.15) : 0.03;
  const gTerm = inputs.gTerminal / 100;

  // Project FCF 5 years
  const fcfProjections: number[] = [];
  for (let n = 1; n <= 5; n++) {
    fcfProjections.push(fcf0 * Math.pow(1 + g, n));
  }

  // PV of FCFs
  let pvFcfSum = 0;
  for (let n = 0; n < 5; n++) {
    pvFcfSum += fcfProjections[n] / Math.pow(1 + discountRate, n + 1);
  }

  // Terminal value
  const fcf5 = fcfProjections[4];
  const tv = (fcf5 * (1 + gTerm)) / (discountRate - gTerm);
  const pvTv = tv / Math.pow(1 + discountRate, 5);

  const enterpriseValue = pvFcfSum + pvTv;
  const debt = totalDebt ?? 0;
  const cashVal = cash ?? 0;
  const equityValue = enterpriseValue - debt + cashVal;
  const valorIntrinseco = Math.round((equityValue / shares) * 100) / 100;

  let margenSeguridad: number | null = null;
  if (currentPrice && valorIntrinseco > 0) {
    margenSeguridad =
      Math.round(((valorIntrinseco - currentPrice) / valorIntrinseco) * 10000) / 100;
  }

  return { valorIntrinseco, margenSeguridad, wacc, ke, kd, advertencias };
}

// ─── PASO 14 — WACC standalone ────────────────────────────────────────────

export interface WACCResult {
  ke: number | null;
  kdPretax: number | null;
  kdAfterTax: number | null;
  wacc: number | null;
  equityWeight: number | null;
  debtWeight: number | null;
  beta: number | null;
  betaUnlevered: number | null;
  taxRate: number | null;
  // Pasos 5 y 6: valor actual de flujos netos descontados al WACC
  valorIntrinseco: number | null;
  margenSeguridad: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  pvFcf: number | null;
  pvTerminal: number | null;
  fcfProyectadoAnio1: number | null;
  deudaMercado: number | null;
  efectivo: number | null;
  advertencias: string[];
}

export function calcularWACC(
  r: FundamentalAFResult,
  inputs: {
    rf: number;
    erp: number;
    incluirCRP: boolean;
    gTerminal: number;
  },
): WACCResult {
  const advertencias: string[] = [];
  const beta = safeNum(r.beta);
  const marketCapM = safeNum(r.marketCapM);
  // totalDebtBalance from balance sheet; fallback: approximated from totalLiabilities - equity
  let totalDebt = safeNum(r.totalDebtBalance);
  if (totalDebt == null && r.totalLiabilities != null && r.totalStockholderEquity != null) {
    totalDebt = Math.max(0, r.totalLiabilities - r.totalStockholderEquity);
    advertencias.push(
      "Deuda de balance no disponible, se usó Pasivo - Patrimonio como aproximación",
    );
  }
  const interestCov = safeNum(r.interestCoverageRatio);
  // FCF: try freeCashflowRaw, then freeCashflowM, then fcfCalculadoManual
  let fcf0 = safeNum(r.freeCashflowRaw ?? (r.freeCashflowM != null ? r.freeCashflowM * 1e6 : null));
  if (fcf0 == null && r.fcfCalculadoManual != null) {
    fcf0 = safeNum(r.fcfCalculadoManual);
    if (fcf0 != null) advertencias.push("FCF de Yahoo no disponible, se usó CFO - Capex como FCF");
  }
  let cash = safeNum(r.cashAndEquivalents);
  if (cash == null && r.totalCurrentAssets != null && r.totalCurrentLiabilities != null) {
    const wc = r.totalCurrentAssets - r.totalCurrentLiabilities;
    cash = wc > 0 ? wc : null;
  }
  const shares = safeNum(r.sharesOutstanding);
  const revenueGrowth = safeNum(r.revenueGrowth);
  const currentPrice = safeNum(r.currentPrice);

  if (!beta) {
    return {
      ke: null,
      kdPretax: null,
      kdAfterTax: null,
      wacc: null,
      equityWeight: null,
      debtWeight: null,
      beta: null,
      betaUnlevered: null,
      taxRate: null,
      valorIntrinseco: null,
      margenSeguridad: null,
      enterpriseValue: null,
      equityValue: null,
      pvFcf: null,
      pvTerminal: null,
      fcfProyectadoAnio1: null,
      deudaMercado: null,
      efectivo: null,
      advertencias: ["Beta no disponible"],
    };
  }

  //  BLOQUE 1+2 — Hamada: desapalancar beta observada y reapalancarla a la
  //  estructura de mercado actual (coherente con los pesos E/V y D/V del WACC).
  //  Fuente: Pascale, Cap. 13, 13.2 — βE = β·[1 + (D/S)(1 - t)]
  const taxRateHamada = r.effectiveTaxRate != null ? r.effectiveTaxRate / 100 : 0.25;
  const dERaw = safeNum(r.debtToEquityRaw);
  const deBook = dERaw != null ? dERaw / 100 : null;
  const betaDesapalancada = desapalancarBeta(beta, deBook, taxRateHamada);
  let betaUsada = beta;
  if (betaDesapalancada != null && marketCapM != null && marketCapM > 0 && totalDebt != null) {
    const E = marketCapM * 1e6;
    const D = totalDebt >= 0 ? totalDebt : 0;
    if (E > 0) {
      const deMercado = D / E;
      const betaReapalancada = reapalancarBeta(betaDesapalancada, deMercado, taxRateHamada);
      if (betaReapalancada != null) {
        betaUsada = betaReapalancada;
        if (Math.abs(betaReapalancada - beta) > 0.01) {
          advertencias.push(
            `Beta reapalancada a estructura de mercado (Hamada): ${beta.toFixed(2)} → ${betaReapalancada.toFixed(2)} ` +
              `(D/E mercado=${deMercado.toFixed(2)}x, t=${taxRateHamada.toFixed(2)})`,
          );
        }
      }
    }
  }

  //  Bounds check: beta anómalo (negativo, extremadamente bajo/alto) distorsiona Ke y WACC
  const betaClamp = betaUsada;
  if (betaUsada < 0.3 || betaUsada > 3.5) {
    betaUsada = betaUsada < 0.3 ? 0.3 : 3.5;
    advertencias.push(
      `Beta de ${betaClamp.toFixed(2)} fuera del rango plausible [0.3, 3.5] — se usó ${betaUsada.toFixed(2)} como proxy. ` +
        `Beta anómalo suele deberse a baja liquidez del ADR, quiebres estructurales en la muestra de regresión, ` +
        `o datos de Yahoo Finance con ventana inadecuada.`,
    );
  }

  let crp = 0;
  if (inputs.incluirCRP) {
    crp = r._riesgoPaisPct ?? 0;
  }
  const ke = Math.round((inputs.rf + betaUsada * inputs.erp + crp) * 100) / 100;
  if (ke <= 0) {
    return {
      ke: null,
      kdPretax: null,
      kdAfterTax: null,
      wacc: null,
      equityWeight: null,
      debtWeight: null,
      beta: null,
      betaUnlevered: null,
      taxRate: null,
      valorIntrinseco: null,
      margenSeguridad: null,
      enterpriseValue: null,
      equityValue: null,
      pvFcf: null,
      pvTerminal: null,
      fcfProyectadoAnio1: null,
      deudaMercado: null,
      efectivo: null,
      advertencias: ["Ke <= 0, revisar inputs"],
    };
  }

  let kdPretax: number | null = null;
  if (interestCov != null) {
    let spread: number;
    if (interestCov > 8.5) spread = 1.0;
    else if (interestCov >= 6.5) spread = 1.5;
    else if (interestCov >= 4.0) spread = 2.0;
    else if (interestCov >= 2.5) spread = 3.0;
    else if (interestCov >= 1.0) spread = 5.0;
    else spread = 8.0;
    kdPretax = Math.round((inputs.rf + spread) * 100) / 100;
  }

  const taxRate =
    r.effectiveTaxRate != null
      ? Math.round(r.effectiveTaxRate * 10000) / 10000
      : (() => {
          advertencias.push("Tasa efectiva no disponible, se usó 25% referencial");
          return 0.25;
        })();
  const kdAfterTax = kdPretax != null ? Math.round(kdPretax * (1 - taxRate) * 100) / 100 : null;

  let equityWeight: number | null = null;
  let debtWeight: number | null = null;
  let wacc: number | null = null;
  if (marketCapM != null && totalDebt != null) {
    const E = marketCapM * 1e6;
    const D = totalDebt;
    const V = E + D;
    if (V > 0) {
      equityWeight = Math.round((E / V) * 10000) / 100;
      debtWeight = Math.round((D / V) * 10000) / 100;
      const waccEq = (E / V) * ke;
      const waccDebt = kdAfterTax != null ? (D / V) * kdAfterTax : 0;
      wacc = Math.round((waccEq + waccDebt) * 100) / 100;
    }
  }
  if (wacc == null) {
    wacc = ke;
    advertencias.push("WACC = Ke (sin datos de deuda)");
  }

  // Governance risk premium (Riquelme: governance >7/10 incrementa el riesgo)
  const govRisk = r.governanceRiskScores?.overallRisk;
  if (wacc != null && govRisk != null && govRisk > 7) {
    const premium = govRisk >= 9 ? 3.0 : govRisk >= 8 ? 2.0 : 1.0;
    wacc = Math.round((wacc + premium) * 100) / 100;
    advertencias.push(
      `Governance (${govRisk}/10) > 7 — se añadió prima de ${premium.toFixed(1)}pp al WACC como penalización por riesgo de gobierno corporativo`,
    );
  }

  // Unlevered beta
  const totalEquity = safeNum(r.totalStockholderEquity);
  const totalDebtVal = totalDebt;
  const totalEquityVal = totalEquity ?? (marketCapM != null ? marketCapM * 1e6 : null);
  let betaUnlevered: number | null = null;
  if (
    beta != null &&
    totalDebtVal != null &&
    totalDebtVal > 0 &&
    totalEquityVal != null &&
    totalEquityVal > 0
  ) {
    const dE = totalDebtVal / totalEquityVal;
    betaUnlevered = Math.round((betaUsada / (1 + (1 - taxRate) * dE)) * 10000) / 10000;
  }

  // ─── Paso 5: Valor actual de flujos netos descontados al WACC ──────────
  let valorIntrinseco: number | null = null;
  let margenSeguridad: number | null = null;
  let enterpriseValue: number | null = null;
  let equityValue: number | null = null;
  let pvFcf: number | null = null;
  let pvTerminal: number | null = null;
  let fcfProyectadoAnio1: number | null = null;

  if (fcf0 && fcf0 > 0 && shares && shares > 0 && wacc != null) {
    const discountRate = wacc / 100;
    const gTerm = inputs.gTerminal / 100;

    if (discountRate > gTerm) {
      const g = revenueGrowth != null ? clamp(revenueGrowth, 0, 0.15) : 0.03;

      // Project FCF 5 years
      const fcfProjections: number[] = [];
      for (let n = 1; n <= 5; n++) {
        fcfProjections.push(fcf0 * Math.pow(1 + g, n));
      }
      fcfProyectadoAnio1 = Math.round(fcfProjections[0] * 100) / 100;

      // PV of FCFs
      let pvFcfSum = 0;
      for (let n = 0; n < 5; n++) {
        pvFcfSum += fcfProjections[n] / Math.pow(1 + discountRate, n + 1);
      }
      pvFcf = Math.round(pvFcfSum * 100) / 100;

      // Terminal value
      const fcf5 = fcfProjections[4];
      const tv = (fcf5 * (1 + gTerm)) / (discountRate - gTerm);
      pvTerminal = Math.round((tv / Math.pow(1 + discountRate, 5)) * 100) / 100;

      enterpriseValue = Math.round((pvFcfSum + tv / Math.pow(1 + discountRate, 5)) * 100) / 100;
      const debtVal = totalDebt;
      const cashVal = cash;

      // ─── Paso 6: Deducir valor de mercado de la deuda ─────────────────
      if (debtVal != null && cashVal != null) {
        equityValue = Math.round((enterpriseValue - debtVal + cashVal) * 100) / 100;
        valorIntrinseco = Math.round((equityValue / shares) * 100) / 100;
        if (currentPrice && valorIntrinseco > 0) {
          margenSeguridad =
            Math.round(((valorIntrinseco - currentPrice) / valorIntrinseco) * 10000) / 100;
        }
      } else {
        advertencias.push(
          "Paso 6 no disponible: faltan datos de deuda o efectivo del balance general — Equity Value y valor intrinseco no pueden calcularse sin ambos componentes.",
        );
      }
    } else {
      advertencias.push("WACC <= g_terminal — valor terminal no calculable");
    }
  } else {
    if (!fcf0 || fcf0 <= 0) advertencias.push("Paso 5 no disponible: FCF0 es negativo o nulo");
    if (!shares) advertencias.push("Paso 5 no disponible: acciones en circulación no disponibles");
  }

  return {
    ke,
    kdPretax,
    kdAfterTax,
    wacc,
    equityWeight,
    debtWeight,
    beta: Math.round(betaUsada * 100) / 100,
    betaUnlevered,
    taxRate,
    valorIntrinseco,
    margenSeguridad,
    enterpriseValue,
    equityValue,
    pvFcf,
    pvTerminal,
    fcfProyectadoAnio1,
    deudaMercado: totalDebt,
    efectivo: cash,
    advertencias,
  };
}

// ─── BLOQUE 9.3/9.4 — PERT y ajuste de tasa por riesgo (documentación only) ──
// Fuente: Alonso/Sapetnitzky, "Administración Financiera de las Organizaciones",
// capítulo sobre PyMEs, secciones 4 y 5.
//
//   E'(U) = 1/3 [2m + 1/2(Op + Pe)]     valor esperado ponderado (distribución Beta)
//   D'(desvío) = (Op - Pe) / 6
//   donde m = moda, Op = optimista, Pe = pesimista.
//
//   Ajuste de tasa por riesgo: h = f(tipo de decisión, sector), no un número fijo
//   (reemplazo < incremento de capacidad < nuevo producto; ganadería < agricultura <
//   agroindustria).
//
// MEJORA FUTURA (sin romper firma actual): agregar a calcularAPV()/calcularWACC()
// un parámetro opcional de escenarios, ej:
//   scenarios?: { pesimista: Partial<DCFInputs>; medio: Partial<DCFInputs>; optimista: Partial<DCFInputs> } | null
//   // default (null): un solo escenario con los inputs actuales, como hoy.
//   // Con escenarios: E'(U) del WACC/margen con fórmula PERT arriba, y costo de
//   // capital ajustado: k_ajustado = k + h(tipoDecision, sector).
// no se implementa acá — se documenta para el Paso 10 (robustecer la valuación con
// hipótesis optimista/pesimista/media en vez de un solo flujo esperado).

// ─── BLOQUE 3 — APV y comparación de métodos ─────────────────────────

export interface APVResult {
  valorIntrinseco: number | null;
  margenSeguridad: number | null;
  ku: number | null; // Cost of unlevered equity
  ke: number | null; // Cost of levered equity
  betaUnlevered: number | null;
  pvFcf: number | null;
  pvTerminal: number | null;
  pvTaxShield: number | null;
  enterpriseValue: number | null;
  equityValue: number | null;
  advertencias: string[];
}

export function calcularAPV(
  r: FundamentalAFResult,
  inputs: {
    rf: number;
    erp: number;
    incluirCRP: boolean;
    gTerminal: number;
  },
): APVResult {
  const advertencias: string[] = [];
  const currentPrice = safeNum(r.currentPrice);
  let fcf0 = safeNum(r.freeCashflowRaw ?? (r.freeCashflowM != null ? r.freeCashflowM * 1e6 : null));
  if (fcf0 == null && r.fcfCalculadoManual != null) {
    fcf0 = safeNum(r.fcfCalculadoManual);
    if (fcf0 != null) advertencias.push("FCF de Yahoo no disponible, se usó CFO - Capex como FCF");
  }
  const beta = safeNum(r.beta);
  const marketCapM = safeNum(r.marketCapM);
  let totalDebt = safeNum(r.totalDebtBalance);
  if (totalDebt == null && r.totalLiabilities != null && r.totalStockholderEquity != null) {
    totalDebt = Math.max(0, r.totalLiabilities - r.totalStockholderEquity);
    advertencias.push(
      "Deuda de balance no disponible, se usó Pasivo - Patrimonio como aproximación",
    );
  }
  let cash = safeNum(r.cashAndEquivalents);
  if (cash == null && r.totalCurrentAssets != null && r.totalCurrentLiabilities != null) {
    const wc = r.totalCurrentAssets - r.totalCurrentLiabilities;
    cash = wc > 0 ? wc : null;
  }
  const shares = safeNum(r.sharesOutstanding);
  const revenueGrowth = safeNum(r.revenueGrowth);
  const effectiveTax = safeNum(r.effectiveTaxRate);
  const interestExpense = safeNum(r.interestExpense);

  if (!fcf0 || fcf0 <= 0) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      ku: null,
      ke: null,
      betaUnlevered: null,
      pvFcf: null,
      pvTerminal: null,
      pvTaxShield: null,
      enterpriseValue: null,
      equityValue: null,
      advertencias: ["APV no disponible: FCF es negativo o nulo"],
    };
  }
  if (!beta) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      ku: null,
      ke: null,
      betaUnlevered: null,
      pvFcf: null,
      pvTerminal: null,
      pvTaxShield: null,
      enterpriseValue: null,
      equityValue: null,
      advertencias: ["APV no disponible: beta no disponible"],
    };
  }

  //  Bounds check: beta anómalo distorsiona Ke, Ku y el DCF
  let betaUsada = beta;
  if (beta < 0.3 || beta > 3.5) {
    betaUsada = beta < 0.3 ? 0.3 : 3.5;
    advertencias.push(
      `Beta de ${beta.toFixed(2)} fuera del rango plausible [0.3, 3.5] — se usó ${betaUsada.toFixed(2)} como proxy. ` +
        `Beta anómalo suele deberse a baja liquidez del ADR, quiebres estructurales en la muestra de regresión, ` +
        `o datos de Yahoo Finance con ventana inadecuada.`,
    );
  }

  if (!shares) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      ku: null,
      ke: null,
      betaUnlevered: null,
      pvFcf: null,
      pvTerminal: null,
      pvTaxShield: null,
      enterpriseValue: null,
      equityValue: null,
      advertencias: ["APV no disponible: shares outstanding no disponible"],
    };
  }

  const taxRate = effectiveTax ?? 0.25;

  // Levered Ke
  let crp = 0;
  if (inputs.incluirCRP) {
    crp = r._riesgoPaisPct ?? 0;
  }
  const ke = Math.round((inputs.rf + betaUsada * inputs.erp + crp) * 100) / 100;
  if (ke <= 0) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      ku: null,
      ke: null,
      betaUnlevered: null,
      pvFcf: null,
      pvTerminal: null,
      pvTaxShield: null,
      enterpriseValue: null,
      equityValue: null,
      advertencias: ["Ke <= 0, revisar inputs"],
    };
  }

  // Unlevered beta + Ku
  const totalEquity = safeNum(r.totalStockholderEquity);
  const totalDebtVal = totalDebt;
  const totalEquityVal = totalEquity ?? (marketCapM != null ? marketCapM * 1e6 : null);
  let betaUnlevered: number | null = null;
  let ku: number | null = null;
  if (totalDebtVal != null && totalDebtVal > 0 && totalEquityVal != null && totalEquityVal > 0) {
    const dE = totalDebtVal / totalEquityVal;
    betaUnlevered = Math.round((betaUsada / (1 + (1 - taxRate) * dE)) * 10000) / 10000;
    ku = Math.round((inputs.rf + betaUnlevered * inputs.erp + crp) * 100) / 100;
  } else {
    ku = ke;
    betaUnlevered = beta;
    advertencias.push("Sin deuda: Ku = Ke");
  }

  if (!ku || ku <= 0) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      ku: null,
      ke,
      betaUnlevered,
      pvFcf: null,
      pvTerminal: null,
      pvTaxShield: null,
      enterpriseValue: null,
      equityValue: null,
      advertencias: ["Ku <= 0, revisar inputs"],
    };
  }

  const discountRate = ku / 100;
  if (discountRate <= inputs.gTerminal / 100) {
    return {
      valorIntrinseco: null,
      margenSeguridad: null,
      ku,
      ke,
      betaUnlevered,
      pvFcf: null,
      pvTerminal: null,
      pvTaxShield: null,
      enterpriseValue: null,
      equityValue: null,
      advertencias: ["Ku <= g_terminal — VT no calculable"],
    };
  }

  // Growth for projections
  const g = revenueGrowth != null ? clamp(revenueGrowth, 0, 0.15) : 0.03;
  const gTerm = inputs.gTerminal / 100;

  // Project FCF 5 years
  const fcfProjections: number[] = [];
  for (let n = 1; n <= 5; n++) {
    fcfProjections.push(fcf0 * Math.pow(1 + g, n));
  }

  // PV of FCFs at Ku
  let pvFcf = 0;
  for (let n = 0; n < 5; n++) {
    pvFcf += fcfProjections[n] / Math.pow(1 + discountRate, n + 1);
  }

  // Terminal value at Ku
  const fcf5 = fcfProjections[4];
  const tv = (fcf5 * (1 + gTerm)) / (discountRate - gTerm);
  const pvTerminal = tv / Math.pow(1 + discountRate, 5);

  // PV of Tax Shield
  let pvTaxShield = 0;
  if (interestExpense != null && interestExpense > 0 && totalDebtVal != null && totalDebtVal > 0) {
    const annualTaxShield = interestExpense * taxRate;
    // Assume debt stays constant → perpetuity at Kd
    // Use Kd (cost of debt) as discount rate for tax shield
    const interestCov = safeNum(r.interestCoverageRatio);
    let kd: number;
    if (interestCov != null) {
      let spread: number;
      if (interestCov > 8.5) spread = 1.0;
      else if (interestCov >= 6.5) spread = 1.5;
      else if (interestCov >= 4.0) spread = 2.0;
      else if (interestCov >= 2.5) spread = 3.0;
      else if (interestCov >= 1.0) spread = 5.0;
      else spread = 8.0;
      kd = inputs.rf + spread;
    } else {
      kd = inputs.rf + 3.0;
      advertencias.push("Kd estimado con spread default 3% (falta interestCoverageRatio)");
    }
    const kdRate = kd / 100;
    if (kdRate > 0) {
      // Perpetuity: Tax Shield / Kd
      pvTaxShield = annualTaxShield / kdRate;
    }
  }

  const enterpriseValue = pvFcf + pvTerminal + pvTaxShield;
  const debtVal = totalDebt;
  const cashVal = cash;
  let equityValue: number | null = null;
  let valorIntrinseco: number | null = null;
  let margenSeguridad: number | null = null;
  if (debtVal != null && cashVal != null) {
    equityValue = enterpriseValue - debtVal + cashVal;
    valorIntrinseco = Math.round((equityValue / shares) * 100) / 100;
    if (currentPrice && valorIntrinseco > 0) {
      margenSeguridad =
        Math.round(((valorIntrinseco - currentPrice) / valorIntrinseco) * 10000) / 100;
    }
  } else {
    advertencias.push(
      "Equity Value y valor intrinseco no disponibles: faltan datos de deuda o efectivo del balance general.",
    );
  }

  return {
    valorIntrinseco,
    margenSeguridad,
    ku: Math.round(ku * 100) / 100,
    ke: Math.round(ke * 100) / 100,
    betaUnlevered,
    pvFcf: Math.round(pvFcf * 100) / 100,
    pvTerminal: Math.round(pvTerminal * 100) / 100,
    pvTaxShield: Math.round(pvTaxShield * 100) / 100,
    enterpriseValue: Math.round(enterpriseValue * 100) / 100,
    equityValue: equityValue != null ? Math.round(equityValue * 100) / 100 : null,
    advertencias,
  };
}

// ─── PASO 16 — Múltiplos implícitos (valuación relativa) ────────────────────

export interface MultiplosImplicitosResult {
  valorPE: number | null;
  valorEVEBITDA: number | null;
  valorMktCapEBITDA: number | null;
  valorPB: number | null;
  valorPS: number | null;
  valorPromedio: number | null;
  margenSeguridad: number | null;
  peMultipleUsado: number | null;
  evEbitdaMultipleUsado: number | null;
  mktCapEbitdaMultipleUsado: number | null;
  pbMultipleUsado: number | null;
  psMultipleUsado: number | null;
  ebitdaCalculado: number | null;
  advertencias: string[];
}

export function calcularMultiplosImplicitos(
  r: FundamentalAFResult,
  multiplesReferencia: {
    pe: number | null;
    evEbitda: number | null;
    mktCapEbitda: number | null;
    pb: number | null;
    ps: number | null;
  },
): MultiplosImplicitosResult {
  const advertencias: string[] = [];
  const currentPrice = safeNum(r.currentPrice);
  const trailingPE = safeNum(r.trailingPE);
  const evToEbitda = safeNum(r.evToEbitda);
  const priceToBook = safeNum(r.priceToBook);
  const trailingEps = safeNum(r.trailingEps);
  const shares = safeNum(r.sharesOutstanding);
  const totalRevenue = safeNum(r.totalRevenue);
  const totalStockholderEquity = safeNum(r.totalStockholderEquity);
  const marketCapM = safeNum(r.marketCapM);
  const totalDebt = safeNum(r.totalDebtBalance);
  const cash = safeNum(r.cashAndEquivalents);

  // Derive EBITDA from EV/EBITDA multiple: EBITDA = EV / (EV/EBITDA ratio)
  // EV = MarketCap + Debt - Cash
  const mktCap = marketCapM != null ? marketCapM * 1e6 : 0;
  const dbt = totalDebt;
  const csh = cash;
  const evActual = mktCap + (dbt ?? 0) - (csh ?? 0);
  let ebitdaCalculado: number | null = null;
  if (evToEbitda != null && evToEbitda > 0) {
    ebitdaCalculado = Math.round((evActual / evToEbitda) * 100) / 100;
  }
  if (ebitdaCalculado != null && (dbt == null || csh == null)) {
    advertencias.push(
      "EBITDA derivado de EV/EBITDA aproximado: faltan datos de deuda o efectivo del balance general.",
    );
  }

  let valorPE: number | null = null;
  let valorEVEBITDA: number | null = null;
  let valorMktCapEBITDA: number | null = null;
  let valorPB: number | null = null;
  let valorPS: number | null = null;

  // P/E based
  if (
    multiplesReferencia.pe != null &&
    multiplesReferencia.pe > 0 &&
    trailingEps != null &&
    trailingEps > 0
  ) {
    valorPE = Math.round(trailingEps * multiplesReferencia.pe * 100) / 100;
  } else if (multiplesReferencia.pe != null) {
    advertencias.push(
      "Valuación por P/E no disponible: faltan EPS o múltiplo de referencia inválido",
    );
  }

  // EV/EBITDA based
  if (
    multiplesReferencia.evEbitda != null &&
    multiplesReferencia.evEbitda > 0 &&
    ebitdaCalculado != null &&
    ebitdaCalculado > 0 &&
    shares != null &&
    shares > 0 &&
    dbt != null &&
    csh != null
  ) {
    const impliedEV = ebitdaCalculado * multiplesReferencia.evEbitda;
    const impliedEquity = impliedEV - dbt + csh;
    valorEVEBITDA = Math.round((impliedEquity / shares) * 100) / 100;
  } else if (multiplesReferencia.evEbitda != null && (dbt == null || csh == null)) {
    advertencias.push(
      "Valuación por EV/EBITDA no disponible: faltan datos de deuda o efectivo del balance general.",
    );
  }

  // Market Cap / EBITDA based (equity-level multiple — más simple, no requiere ajuste de deuda)
  if (
    multiplesReferencia.mktCapEbitda != null &&
    multiplesReferencia.mktCapEbitda > 0 &&
    ebitdaCalculado != null &&
    ebitdaCalculado > 0 &&
    shares != null &&
    shares > 0
  ) {
    // Market Cap / EBITDA = ratio → Valor = EBITDA × ratio
    const impliedMktCap = ebitdaCalculado * multiplesReferencia.mktCapEbitda;
    valorMktCapEBITDA = Math.round((impliedMktCap / shares) * 100) / 100;
  }

  // P/B based
  if (
    multiplesReferencia.pb != null &&
    multiplesReferencia.pb > 0 &&
    priceToBook != null &&
    priceToBook > 0 &&
    totalStockholderEquity != null &&
    shares != null &&
    shares > 0
  ) {
    const bvPerShare = totalStockholderEquity / shares;
    valorPB = Math.round(bvPerShare * multiplesReferencia.pb * 100) / 100;
  }

  // P/S based
  if (
    multiplesReferencia.ps != null &&
    multiplesReferencia.ps > 0 &&
    totalRevenue != null &&
    shares != null &&
    shares > 0
  ) {
    const revPerShare = totalRevenue / shares;
    valorPS = Math.round(revPerShare * multiplesReferencia.ps * 100) / 100;
  }

  const valores = [valorPE, valorEVEBITDA, valorMktCapEBITDA, valorPB, valorPS].filter(
    (v): v is number => v != null,
  );
  const valorPromedio =
    valores.length > 0
      ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 100) / 100
      : null;

  let margenSeguridad: number | null = null;
  if (currentPrice && valorPromedio != null && valorPromedio > 0) {
    margenSeguridad = Math.round(((valorPromedio - currentPrice) / valorPromedio) * 10000) / 100;
  }

  return {
    valorPE,
    valorEVEBITDA,
    valorMktCapEBITDA,
    valorPB,
    valorPS,
    valorPromedio,
    margenSeguridad,
    peMultipleUsado: multiplesReferencia.pe,
    evEbitdaMultipleUsado: multiplesReferencia.evEbitda,
    mktCapEbitdaMultipleUsado: multiplesReferencia.mktCapEbitda,
    pbMultipleUsado: multiplesReferencia.pb,
    psMultipleUsado: multiplesReferencia.ps,
    ebitdaCalculado,
    advertencias,
  };
}

// ─── PASO 17 — Valor técnico de activos neto de deudas operativas ──────────

export interface ValorTecnicoActivosResult {
  valorActivosNetos: number | null;
  valorPorAccion: number | null;
  margenSeguridad: number | null;
  activosTotales: number | null;
  pasivosTotales: number | null;
  pasivosOperativos: number | null;
  efectivo: number | null;
  deudaTotal: number | null;
  deudaFinanciera: number | null;
  patrimonioNeto: number | null;
  metodos: {
    descripcion: string;
    valor: number | null;
    etiqueta: string;
  }[];
  advertencias: string[];
}

export function calcularValorTecnicoActivos(r: FundamentalAFResult): ValorTecnicoActivosResult {
  const advertencias: string[] = [];
  const currentPrice = safeNum(r.currentPrice);
  const totalAssets = safeNum(r.totalAssets);
  const totalLiabilities = safeNum(r.totalLiabilities);
  const totalEquity = safeNum(r.totalStockholderEquity);
  const cash = safeNum(r.cashAndEquivalents);
  const totalDebt = safeNum(r.totalDebtBalance);
  const shares = safeNum(r.sharesOutstanding);
  const workingCapital = safeNum(r.workingCapital);
  const totalCurrentAssets = safeNum(r.totalCurrentAssets);
  const totalCurrentLiabilities = safeNum(r.totalCurrentLiabilities);
  const netReceivables = safeNum(r.netReceivables);
  const inventory = safeNum(r.inventory);
  const ppeEstimado =
    totalAssets != null && totalCurrentAssets != null ? totalAssets - totalCurrentAssets : null;

  if (!shares || shares <= 0) {
    return {
      valorActivosNetos: null,
      valorPorAccion: null,
      margenSeguridad: null,
      activosTotales: null,
      pasivosTotales: null,
      pasivosOperativos: null,
      efectivo: null,
      deudaTotal: null,
      deudaFinanciera: null,
      patrimonioNeto: null,
      metodos: [],
      advertencias: ["Acciones en circulación no disponibles"],
    };
  }

  const metodos: { descripcion: string; valor: number | null; etiqueta: string }[] = [];
  const deudaFinanciera = totalDebt ?? 0;
  const pasivosOperativos = totalLiabilities != null ? totalLiabilities - deudaFinanciera : null;

  // Método 1: Valor contable (Book Value)
  if (totalEquity != null) {
    const v = Math.round((totalEquity / shares) * 100) / 100;
    metodos.push({
      descripcion: "Valor contable (Patrimonio Neto / Acciones)",
      valor: v,
      etiqueta: "Valor Libro",
    });
  }

  // Método 2: NAV simple = Activos totales - Pasivos totales
  if (totalAssets != null && totalLiabilities != null) {
    const v = Math.round(((totalAssets - totalLiabilities) / shares) * 100) / 100;
    metodos.push({
      descripcion: "NAV simple (Activos - Pasivos) / Acciones",
      valor: v,
      etiqueta: "NAV Simple",
    });
  }

  // Método 3: Valor técnico neto de deudas operativas (activos - pasivos operativos)
  // Los pasivos operativos excluyen la deuda financiera
  if (totalAssets != null && pasivosOperativos != null) {
    const v = Math.round(((totalAssets - pasivosOperativos) / shares) * 100) / 100;
    metodos.push({
      descripcion: "Activos totales neto de deudas operativas (excluye deuda financiera)",
      valor: v,
      etiqueta: "Valor Técnico",
    });
  }

  // Método 4: Activo corriente neto de pasivo no corriente
  if (totalCurrentAssets != null && totalCurrentLiabilities != null && totalLiabilities != null) {
    const nonCurrentLiab = totalLiabilities - totalCurrentLiabilities;
    const netValor = totalCurrentAssets - nonCurrentLiab;
    const v = Math.round((netValor / shares) * 100) / 100;
    metodos.push({
      descripcion: "Activo corriente neto de pasivo no corriente (criterio conservador)",
      valor: v,
      etiqueta: "Valor Corriente Neto",
    });
  }

  // Método 5: Valor de liquidación ajustado
  if (totalLiabilities != null) {
    const cashVal = cash ?? 0;
    const arVal = netReceivables != null ? netReceivables * 0.85 : 0;
    const invVal = inventory != null ? inventory * 0.7 : 0;
    const ppeVal = ppeEstimado != null ? ppeEstimado * 0.5 : 0;
    const realizationValue = cashVal + arVal + invVal + ppeVal - totalLiabilities;
    const v = Math.round((realizationValue / shares) * 100) / 100;
    metodos.push({
      descripcion:
        "Valor de realización técnica (Cash + 85% AR + 70% Inventario + 50% PPE - Pasivos)",
      valor: v,
      etiqueta: "Valor Liquidación Técnico",
    });
  }

  const valores = metodos.filter((m) => m.valor != null).map((m) => m.valor!);
  const valorPorAccion =
    valores.length > 0
      ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 100) / 100
      : null;

  let margenSeguridad: number | null = null;
  if (currentPrice && valorPorAccion != null && valorPorAccion > 0) {
    margenSeguridad = Math.round(((valorPorAccion - currentPrice) / valorPorAccion) * 10000) / 100;
  }

  return {
    valorActivosNetos: valorPorAccion,
    valorPorAccion,
    margenSeguridad,
    activosTotales: totalAssets,
    pasivosTotales: totalLiabilities,
    pasivosOperativos,
    efectivo: cash,
    deudaTotal: totalDebt,
    deudaFinanciera,
    patrimonioNeto: totalEquity,
    metodos,
    advertencias,
  };
}

// ─── BLOQUE 7 — Duration de bonos (Macaulay + modifcada) ────────────
// Fuente: Elbaum/IFACI, Unidad 4, Cap. 10, puntos 10.10-10.11.
// El paper da tres interpretaciones conceptuales de la duration (plazo del cupón
// cero equivalente; punto de recuperación de mitad de la inversión ajustada por
// valor tiempo del dinero; "punto de balance" del flujo de fondos en VP). No trae
// fórmula matemática explícita en el fragmento, así que se usa la fórmula estándar
// de Macaulay — consistente con esas tres interpretaciones — marcada como tal.
//
//   D    = Σ [t · CFt / (1+y)^t] / P          (Macaulay duration, en períodos)
//   Dmod = D / (1+y)                          (duration modificada)
//   % Δ Precio ≈ -Dmod · Δy                    (sensibilidad, punto 10.10.2)
//
// CFt = flujo (cupón + capital si corresponde) en el período t; y = TIR/yield por
// período (decimal); P = precio actual = Σ CFt/(1+y)^t (se recalcula acá si no se
// pasa precio, la función lo devuelve por coherencia).

export interface FlujoBono {
  /** Período t (años si la TIR es anual, semestre si es semestral, etc.) */
  t: number;
  /** Flujo CFt: cupón, y en el último período cupón + valor nominal */
  cf: number;
}

export interface DurationResult {
  /** Macaulay duration, en las mismas unidades de t (períodos/años) */
  duration: number | null;
  /** Duration modificada = D / (1+y) */
  durationMod: number | null;
  /** Precio calculado = Σ CFt/(1+y)^t (coherente con la D) */
  precio: number | null;
  /** Variación % aproximada del precio por Δy dado (en decimal, ej: 0.01 = +1pp) */
  deltaPrecioPct: number | null;
  available: boolean;
  advertencia: string | null;
}

/** DEFAULT — usa la fórmula estándar de Macaulay (ver cabecera), marcada como tal. */
export function calcularDuration(
  flujos: FlujoBono[],
  yieldTIR: number | null | undefined,
  precio?: number | null,
): DurationResult {
  if (!flujos || flujos.length === 0) {
    return {
      duration: null,
      durationMod: null,
      precio: null,
      deltaPrecioPct: null,
      available: false,
      advertencia: "Sin flujos de fondos para calcular duration",
    };
  }
  if (yieldTIR == null || !isFinite(yieldTIR)) {
    return {
      duration: null,
      durationMod: null,
      precio: null,
      deltaPrecioPct: null,
      available: false,
      advertencia: "TIR/yield inválida",
    };
  }
  if (yieldTIR <= -1) {
    return {
      duration: null,
      durationMod: null,
      precio: null,
      deltaPrecioPct: null,
      available: false,
      advertencia: "TIR/yield menor o igual a -100% — flujos no valorizables",
    };
  }

  const y = yieldTIR;
  let pvSum = 0;
  let weightedSum = 0;
  for (const f of flujos) {
    if (f.cf == null || f.t == null || !isFinite(f.cf) || !isFinite(f.t) || f.cf === 0) continue;
    const pv = f.cf / Math.pow(1 + y, f.t);
    pvSum += pv;
    weightedSum += f.t * pv;
  }

  if (pvSum <= 0 || !isFinite(pvSum)) {
    return {
      duration: null,
      durationMod: null,
      precio: null,
      deltaPrecioPct: null,
      available: false,
      advertencia: "Precio (Σ flujos descontados) no positivo — duration indefinida",
    };
  }

  const p = precio != null && isFinite(precio) && precio > 0 ? precio : pvSum;
  const duration = weightedSum / p;
  const durationMod = duration / (1 + y);

  return {
    duration: Math.round(duration * 10000) / 10000,
    durationMod: Math.round(durationMod * 10000) / 10000,
    precio: Math.round(p * 10000) / 10000,
    deltaPrecioPct: null, // requiere Δy explícito: usar calcularVariacionPrecio
    available: true,
    advertencia:
      p !== pvSum
        ? `Precio provisto (${p.toFixed(2)}) difiere del precio por flujos descontados (${pvSum.toFixed(2)}) — duration usada sobre el precio provisto`
        : null,
  };
}

/** % Δ Precio ≈ -Dmod · Δy (Pascale-técnica, punto 10.10.2 del paper Elbaum/IFACI) */
export function calcularVariacionPrecio(
  durationMod: number | null | undefined,
  deltaYield: number | null | undefined,
): number | null {
  if (
    durationMod == null ||
    deltaYield == null ||
    !isFinite(durationMod) ||
    !isFinite(deltaYield)
  ) {
    return null;
  }
  // deltaYield en decimal (ej: 0.01 = +1pp). Devuelve variación % del precio.
  return Math.round(-durationMod * deltaYield * 10000) / 100;
}
