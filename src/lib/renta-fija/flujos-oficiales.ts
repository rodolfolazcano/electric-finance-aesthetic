/**
 * Términos financieros oficiales (canje de deuda 2020) y generador de flujos
 * para las series soberanas USD. Fuentes:
 *  - Decreto 676/2020 Anexo IV + rectificatorio 701/2020 (infoleg)
 *  - Resolución 381/2020 (AL30 ley Argentina)
 *  - CABSA / matbarofex / Allaria / argen.bond (tablas de flujo verificadoras)
 *
 * Convención legal 30/360, pagos semestrales el 9 de enero y 9 de julio.
 * Todas las especies (AL30/AL30D/AL30C/GD30/GD30D/GD30C, etc.) comparten
 * los mismos términos económicos por serie.
 */

export type FlujoOficial = {
  fecha: string;
  tipo: "Cupon" | "Cupon+Amortizacion";
  monto_por_cien: number;
};

type TramoTasa = { hastaPagoInclusive: string; tasaAnual: number };

export type TerminosSerie = {
  nombre: string;
  vencimiento: string;
  /** El tramo con hastaPagoInclusive >= fecha de pago define la tasa del período que se cobra en esa fecha. */
  tasas: TramoTasa[];
  amortizacion: {
    inicio: string;
    cuotas: number;
    /** AL30: primera cuota 4% y las restantes 8%; si no se define, todas iguales (100/cuotas). */
    primeraDistintaPct?: number;
  };
  cuponDetalle: string;
  amortizacionDetalle: string;
};

export const SERIES_OFICIALES: Record<string, TerminosSerie> = {
  AL29: {
    nombre: "Bonar 2029",
    vencimiento: "2029-07-09",
    tasas: [{ hastaPagoInclusive: "2099-12-31", tasaAnual: 1.0 }],
    amortizacion: { inicio: "2025-01-09", cuotas: 10 },
    cuponDetalle: "1.00% anual fijo",
    amortizacionDetalle: "10 cuotas semestrales del 10% (ene-2025 a jul-2029)",
  },
  AL30: {
    nombre: "Bonar 2030",
    vencimiento: "2030-07-09",
    tasas: [
      { hastaPagoInclusive: "2027-07-09", tasaAnual: 0.75 },
      { hastaPagoInclusive: "2099-12-31", tasaAnual: 1.75 },
    ],
    amortizacion: { inicio: "2024-07-09", cuotas: 13, primeraDistintaPct: 4 },
    cuponDetalle: "0.75% anual hasta jul-2027, luego 1.75% anual",
    amortizacionDetalle: "13 cuotas semestrales: 4% en jul-2024 y 12×8% (hasta jul-2030)",
  },
  AL35: {
    nombre: "Bonar 2035",
    vencimiento: "2035-07-09",
    tasas: [
      { hastaPagoInclusive: "2027-07-09", tasaAnual: 4.125 },
      { hastaPagoInclusive: "2028-07-09", tasaAnual: 4.75 },
      { hastaPagoInclusive: "2099-12-31", tasaAnual: 5.0 },
    ],
    amortizacion: { inicio: "2031-01-09", cuotas: 10 },
    cuponDetalle: "4.125% anual hasta jul-2027, 4.75% hasta jul-2028, luego 5.00% anual",
    amortizacionDetalle: "10 cuotas semestrales del 10% (ene-2031 a jul-2035)",
  },
  AE38: {
    nombre: "Bonar/Global 2038",
    vencimiento: "2038-01-09",
    tasas: [{ hastaPagoInclusive: "2099-12-31", tasaAnual: 5.0 }],
    amortizacion: { inicio: "2027-07-09", cuotas: 22 },
    cuponDetalle: "0.125%/2.00%/3.875%/4.25% históricos, 5.00% anual desde jul-2024",
    amortizacionDetalle: "22 cuotas semestrales iguales de 4.5454% (jul-2027 a ene-2038)",
  },
  AL41: {
    nombre: "Bonar 2041",
    vencimiento: "2041-07-09",
    tasas: [
      { hastaPagoInclusive: "2029-07-09", tasaAnual: 3.5 },
      { hastaPagoInclusive: "2099-12-31", tasaAnual: 4.875 },
    ],
    amortizacion: { inicio: "2028-01-09", cuotas: 28 },
    cuponDetalle: "3.50% anual hasta jul-2029, luego 4.875% anual",
    amortizacionDetalle: "28 cuotas semestrales iguales de 3.5714% (ene-2028 a jul-2041)",
  },
};

/** Ticker base de serie para cualquier especie (AL35D → AL35, GD30C → AL30). */
export const ESPECIE_POR_SERIE: Record<string, string> = {
  AL29: "AL29", AL29D: "AL29", GD29: "AL29", GD29D: "AL29",
  AL30: "AL30", AL30D: "AL30", AL30C: "AL30", GD30: "AL30", GD30D: "AL30", GD30C: "AL30",
  AL35: "AL35", AL35D: "AL35", GD35: "AL35", GD35D: "AL35",
  AE38: "AE38", GD38: "AE38",
  AL41: "AL41", GD41: "AL41", GD41D: "AL41",
};

function pagosSemestrales(vencimiento: string): string[] {
  const anioFin = Number(vencimiento.slice(0, 4));
  const fechas: string[] = [];
  for (let a = 2021; a <= anioFin; a++) {
    fechas.push(`${a}-01-09`, `${a}-07-09`);
  }
  return fechas.filter((f) => f >= "2021-07-09" && f <= vencimiento);
}

function tasaParaPago(tasas: TramoTasa[], fechaPago: string): number {
  for (const t of tasas) {
    if (fechaPago <= t.hastaPagoInclusive) return t.tasaAnual;
  }
  return tasas[tasas.length - 1]!.tasaAnual;
}

function round4(v: number): number {
  return Math.round(v * 10000) / 10000;
}

type FlujoInterno = FlujoOficial & { amortizacionPct: number; interesPct: number };

/** Genera TODOS los flujos (incluye pasados) con desglose de amortización e interés. */
function generarFlujosCompletos(t: TerminosSerie): FlujoInterno[] {
  const pagos = pagosSemestrales(t.vencimiento);
  const fechasAmort = pagos.filter((f) => f >= t.amortizacion.inicio);
  const n = t.amortizacion.cuotas;
  if (fechasAmort.length !== n) {
    throw new Error(`Serie ${t.nombre}: cuotas de amortización (${fechasAmort.length}) ≠ ${n}`);
  }
  const primera = t.amortizacion.primeraDistintaPct;
  const cuotaRestante = (100 - (primera ?? 0)) / (n - (primera != null ? 1 : 0));
  const flujos: FlujoInterno[] = [];
  let amortAcum = 0;
  for (const d of pagos) {
    const amortiza = fechasAmort.includes(d);
    const amortPct = amortiza ? (d === t.amortizacion.inicio && primera != null ? primera : cuotaRestante) : 0;
    const interes = ((100 - amortAcum) * tasaParaPago(t.tasas, d)) / 200;
    flujos.push({
      fecha: d,
      tipo: amortiza ? "Cupon+Amortizacion" : "Cupon",
      monto_por_cien: round4(amortPct + interes),
      amortizacionPct: round4(amortPct),
      interesPct: round4(interes),
    });
    amortAcum += amortPct;
  }
  return flujos;
}

/** Tasa anual vigente (la del período en curso). */
export function tasaVigente(serieBase: string, hoyIso: string): number {
  const t = SERIES_OFICIALES[serieBase];
  const proximo = pagosSemestrales(t.vencimiento).find((f) => f > hoyIso);
  return proximo ? tasaParaPago(t.tasas, proximo) : tasaParaPago(t.tasas, t.vencimiento);
}

/** Flujos FUTUROS (> hoyIso) por cada 100 de valor nominal. */
export function generarFlujosSerie(serieBase: string, hoyIso: string): FlujoOficial[] {
  const t = SERIES_OFICIALES[serieBase];
  if (!t) throw new Error(`Serie sin términos oficiales: ${serieBase}`);
  return generarFlujosCompletos(t)
    .filter((f) => f.fecha > hoyIso)
    .map(({ fecha, tipo, monto_por_cien }) => ({ fecha, tipo, monto_por_cien }));
}

/** % del nominal ya amortizado a la fecha (para valorResidualActual). */
export function residualAPct(serieBase: string, hoyIso: string): number {
  const t = SERIES_OFICIALES[serieBase];
  const completos = generarFlujosCompletos(t);
  let amort = 0;
  for (const f of completos) {
    if (f.fecha <= hoyIso) amort += f.amortizacionPct;
  }
  return round4(100 - amort);
}

/** Valida que la amortización total sea 100 y que los flujos sean coherentes. */
export function validarSerie(serieBase: string): { ok: boolean; detalle: string } {
  const t = SERIES_OFICIALES[serieBase];
  const completos = generarFlujosCompletos(t);
  const amortTotal = completos.reduce((s, f) => s + f.amortizacionPct, 0);
  const ok = Math.abs(amortTotal - 100) < 0.01;
  return {
    ok,
    detalle: `${serieBase}: amortización total ${amortTotal.toFixed(4)} (esperado 100), ${completos.length} flujos hasta ${t.vencimiento}`,
  };
}
