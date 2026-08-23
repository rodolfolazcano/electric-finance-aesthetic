/**
 * Cálculo Financiero Aplicado — López Dumrauf (Administración Financiera de las Organizaciones)
 * Base matemática de todo el sistema. Este módulo precede a Pascale/Murphy/Value.
 *
 * Reutiliza: src/lib/math/stats.ts (normalCDF), src/lib/renta-fija/ons-tir-engine.ts (npv, calcularTIR)
 * APIs: TNA/TEM plazos fijos (ArgentinaDatos), IPC BCRA v4, caución IOL.
 *
 * Reglas Dumrauf críticas:
 * - Comparar solo efectivas (TEA), nunca nominales.
 * - Contado vs cuotas por VA.
 * - Ilusión óptica tasa nominal en inflación alta → usar Fisher exacta.
 */

import { npv, calcularTIR, type Flow } from "../renta-fija/ons-tir-engine";

// ── 1) Capitalización ────────────────────────────────────────────────────
/** (1+TNA/m)^m — factor de capitalización periódica. Co final = Co * factor^t */
export function capitalizacionTNA(TNA: number, m: number): number {
  if (m <= 0) return 1 + TNA;
  return Math.pow(1 + TNA / m, m);
}
export function capitalizacion(Co: number, TNA: number, m: number, tAnios = 1): number {
  return Co * Math.pow(1 + TNA / m, m * tAnios);
}
export function teaDesdeTNA(TNA: number, m: number): number {
  return capitalizacionTNA(TNA, m) - 1;
}
export function tnaDesdeTEA(TEA: number, m: number): number {
  return m * (Math.pow(1 + TEA, 1 / m) - 1);
}

// ── 2) Tasa real Fisher ─────────────────────────────────────────────────
/**
 * Fisher exacta: (1+ia)/(1+π)-1. Usar exacta si ia>20% (Argentina), aprox ia-π si no.
 * ia = tasa nominal/aparente, π = inflación
 */
export function tasaRealFisherExacta(ia: number, pi: number): number {
  return (1 + ia) / (1 + pi) - 1;
}
export function tasaRealFisherAprox(ia: number, pi: number): number {
  return ia - pi;
}
export function tasaRealFisher(ia: number, pi: number, umbralExacta = 0.20): { real: number; metodo: "exacta" | "aprox"; ia: number; pi: number } {
  const metodo = Math.abs(ia) > umbralExacta || Math.abs(pi) > 0.10 ? "exacta" : "aprox";
  const real = metodo === "exacta" ? tasaRealFisherExacta(ia, pi) : tasaRealFisherAprox(ia, pi);
  return { real, metodo, ia, pi };
}

// ── 3) Rentas ───────────────────────────────────────────────────────────
/** VA de renta vencida: A * (1 - (1+i)^-n)/i */
export function valorActualRenta(A: number, i: number, n: number): number {
  if (i === 0) return A * n;
  return A * (1 - Math.pow(1 + i, -n)) / i;
}
export function valorFinalRenta(A: number, i: number, n: number): number {
  if (i === 0) return A * n;
  return A * (Math.pow(1 + i, n) - 1) / i;
}
export function perpetuidad(A: number, i: number): number {
  if (i <= 0) return Infinity;
  return A / i;
}
/** Gordon: A*(1+g)/(i-g) o A/(i-g) según si A es próximo flujo */
export function perpetuidadCreciente(A: number, g: number, i: number, proximoFlujoIncluido = true): number {
  if (i <= g) return Infinity;
  return proximoFlujoIncluido ? (A * (1 + g)) / (i - g) : A / (i - g);
}
export function fondoAmortizacion(S: number, i: number, n: number): number {
  // A = S * i / ((1+i)^n -1)
  if (i === 0) return S / n;
  return (S * i) / (Math.pow(1 + i, n) - 1);
}
export function cuotaPrestamo(P: number, i: number, n: number): number {
  // A = P * i / (1 - (1+i)^-n)
  if (i === 0) return P / n;
  return (P * i) / (1 - Math.pow(1 + i, -n));
}

// ── 4) Costo efectivo TIR ───────────────────────────────────────────────
/** TIR por tanteo de flujos [ {fecha,monto} ] vs precio. Reusa npv+calcularTIR */
export function costoEfectivoTIR(flujos: Flow[], precio: number, valuation = new Date()): number | null {
  return calcularTIR(flujos, precio, valuation);
}
export function npvFlujos(flujos: Flow[], tasa: number, valuation = new Date()): number {
  return npv(flujos, tasa, valuation);
}

// ── 5) Comparación financiera (ejecutor para agente) ───────────────────
export type AlternativaFinanciera = {
  nombre: string;
  tipo: "contado" | "cuotas" | "flujos";
  montoContado?: number;
  cuotas?: { importe: number; cantidad: number; tasaPeriodica?: number };
  flujos?: Flow[];
  precio?: number;
};

export type ResultadoComparacion = {
  ganador: string;
  va: Array<{ nombre: string; va: number; tea: number | null }>;
  detalle: string;
  recomendacion: string;
};

/**
 * Ejecutor: recibe dos alternativas y resuelve por VA (valor actual).
 * Regla Dumrauf: comparar solo efectivas, contado vs cuotas por VA, ilusión nominal.
 */
export function ejecutarComparacionFinanciera(
  altA: AlternativaFinanciera,
  altB: AlternativaFinanciera,
  tasaDescuentoAnual: number, // TEA de referencia (ej. caución o plazo fijo TEA)
): ResultadoComparacion {
  const vaDe = (alt: AlternativaFinanciera): { va: number; tea: number | null } => {
    if (alt.tipo === "contado") return { va: alt.montoContado ?? 0, tea: 0 };
    if (alt.tipo === "cuotas" && alt.cuotas) {
      const i = alt.cuotas.tasaPeriodica ?? tasaDescuentoAnual / 12;
      const va = valorActualRenta(alt.cuotas.importe, i, alt.cuotas.cantidad);
      return { va, tea: i * 12 };
    }
    if (alt.tipo === "flujos" && alt.flujos && alt.precio != null) {
      const tir = costoEfectivoTIR(alt.flujos, alt.precio);
      const va = alt.flujos.reduce((s, f) => s + f.monto / Math.pow(1 + (tir ?? tasaDescuentoAnual), 1), 0);
      return { va, tea: tir };
    }
    return { va: Infinity, tea: null };
  };
  const ra = vaDe(altA);
  const rb = vaDe(altB);
  const ganador = ra.va <= rb.va ? altA.nombre : altB.nombre;
  const detalle = `VA ${altA.nombre}: ${ra.va.toFixed(2)} (TEA ${ra.tea != null ? (ra.tea * 100).toFixed(2) + "%" : "—"}) vs ${altB.nombre}: ${rb.va.toFixed(2)} (TEA ${rb.tea != null ? (rb.tea * 100).toFixed(2) + "%" : "—"}) — Tasa descuento TEA ${(tasaDescuentoAnual * 100).toFixed(2)}%`;
  const recomendacion = `Elegir ${ganador} por menor VA. Regla Dumrauf: comparar solo efectivas; en inflación alta usar Fisher exacta.`;
  return { ganador, va: [{ nombre: altA.nombre, ...ra }, { nombre: altB.nombre, ...rb }], detalle, recomendacion };
}

// ── 6) Helpers Argentina ────────────────────────────────────────────────
export function temDesdeTNA(TNA: number): number {
  return TNA / 12;
}
export function tnaDesdeTEM(TEM: number): number {
  return TEM * 12;
}
