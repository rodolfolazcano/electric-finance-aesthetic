/**
 * Simuladores — lógica financiera compartida para los 2 flagship tools.
 * Reexporta utilidades de calculadora-financiera y añade generadores de series
 * y perfil VAN/tasa. Todo puro, sin servidor.
 */

export const COLORS = [
  "hsl(var(--primary))",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(199 89% 48%)",
  "hsl(262 83% 58%)",
] as const;

export function fisherReal(nominalPct: number, inflacionPct: number): number {
  return ((1 + nominalPct / 100) / (1 + inflacionPct / 100) - 1) * 100;
}
export function tnaToTea(tnaPct: number, m = 12): number {
  return (Math.pow(1 + tnaPct / 100 / m, m) - 1) * 100;
}
export function temToTea(temPct: number): number {
  return (Math.pow(1 + temPct / 100, 12) - 1) * 100;
}
export function teaToTem(teaPct: number): number {
  return (Math.pow(1 + teaPct / 100, 1 / 12) - 1) * 100;
}
export function teaToTna(teaPct: number, m = 12): number {
  return ((Math.pow(1 + teaPct / 100, 1 / m) - 1) * m * 100);
}
function tnaToTeaDiaria(tnaPct: number): number {
  return (Math.pow(1 + tnaPct / 100 / 365, 365) - 1) * 100;
}

// ---------- Colocaciones ----------

export type InstrKind = "pf" | "uva" | "fci" | "lecap" | "caucion" | "custom";
export type InstrConfig = {
  id: string;
  kind: InstrKind;
  label: string;
  enabled: boolean;
  // tasa base que el usuario ve/edita
  tna: number; // para pf/uva/custom; para fci/lecap se deriva de tea/tem pero se guarda como tna equivalente
  tem: number | null; // solo lecap/custom cuando el input es tem
  color: string;
};

export type EvolPoint = {
  mes: number;
  label: string;
  [key: string]: number | string;
};

export function buildEvolucion(
  capital: number,
  meses: number,
  instrumentos: InstrConfig[],
  inflacionMensualPct: number | null,
): { puntos: EvolPoint[]; resumen: { id: string; vfNominal: number; vfReal: number | null; tea: number; interes: number; tasaRealDirecta: number | null }[] } {
  const n = Math.max(1, Math.min(360, Math.round(meses)));
  const puntos: EvolPoint[] = [];
  const inflM = inflacionMensualPct != null && isFinite(inflacionMensualPct) ? inflacionMensualPct / 100 : null;
  const porInstr = instrumentos.filter((x) => x.enabled).map((inst) => {
    let tea: number;
    if (inst.kind === "lecap" && inst.tem != null) tea = temToTea(inst.tem);
    else if (inst.kind === "caucion") tea = tnaToTeaDiaria(inst.tna);
    else tea = tnaToTea(inst.tna, 12);
    return { inst, tea };
  });

  for (let m = 0; m <= n; m++) {
    const p: EvolPoint = { mes: m, label: m === 0 ? "0" : `${m}m` };
    for (const { inst, tea } of porInstr) {
      let factor = Math.pow(1 + tea / 100, 1 / 12);
      // UVA/CER: la TNA ya es real — el capital además se ajusta por inflación (VF nominal correcto)
      if (inst.kind === "uva" && inflM != null) factor *= 1 + inflM;
      // Caución: renovación mensual a TNA constante (aprox diaria para TEA)
      const vf = capital * Math.pow(factor, m);
      p[inst.id] = Math.round(vf);
      if (inflM != null) {
        const deflactor = Math.pow(1 + inflM, m);
        p[inst.id + "_real"] = Math.round(vf / deflactor);
      }
    }
    puntos.push(p);
  }

  const resumen = porInstr.map(({ inst, tea }) => {
    let factor = Math.pow(1 + tea / 100, 1 / 12);
    if (inst.kind === "uva" && inflM != null) factor *= 1 + inflM;
    const vfNominal = capital * Math.pow(factor, n);
    const deflactor = inflM != null ? Math.pow(1 + inflM, n) : 1;
    const vfReal = inflM != null ? vfNominal / deflactor : null;
    // UVA: su TNA YA es la tasa real (no defactar de nuevo en la columna Fisher)
    const tasaRealDirecta = inst.kind === "uva" ? inst.tna : null;
    return { id: inst.id, vfNominal: Math.round(vfNominal), vfReal: vfReal != null ? Math.round(vfReal) : null, tea, interes: Math.round(vfNominal - capital), tasaRealDirecta };
  });

  return { puntos, resumen };
}

// ---------- Planificador ----------

export type PlanModo = "meta" | "retiro" | "flujos";

export function pmtMetaAhorro(vfObjetivo: number, aporteInicial: number, meses: number, temPct: number, anticipada: boolean): number {
  const r = temPct / 100;
  const n = Math.max(1, meses);
  if (Math.abs(r) < 1e-9) return (vfObjetivo - aporteInicial) / n;
  const factorVFInicial = Math.pow(1 + r, n);
  const vfRestante = vfObjetivo - aporteInicial * factorVFInicial;
  const denom = anticipada ? (1 + r) * (Math.pow(1 + r, n) - 1) / r : (Math.pow(1 + r, n) - 1) / r;
  if (denom <= 0) return 0;
  return Math.max(0, vfRestante / denom);
}

export function vfConAportes(aporteInicial: number, pmt: number, meses: number, temPct: number, anticipada: boolean): number {
  const r = temPct / 100;
  const n = Math.max(0, meses);
  if (Math.abs(r) < 1e-9) return aporteInicial + pmt * n;
  const ax = anticipada ? 1 + r : 1;
  return aporteInicial * Math.pow(1 + r, n) + pmt * ax * (Math.pow(1 + r, n) - 1) / r;
}

export function mesesHastaMeta(vfObjetivo: number, aporteInicial: number, pmt: number, temPct: number, anticipada: boolean): number | null {
  if (pmt <= 0 && aporteInicial < vfObjetivo) return null;
  const r = temPct / 100;
  if (Math.abs(r) < 1e-9) {
    if (pmt <= 0) return aporteInicial >= vfObjetivo ? 0 : null;
    return Math.ceil((vfObjetivo - aporteInicial) / pmt);
  }
  const ax = anticipada ? 1 + r : 1;
  // resolver n en: vf = P*(1+r)^n + PMT*ax*((1+r)^n -1)/r
  // sea A=(1+r)^n → vf = P*A + PMT*ax*(A-1)/r → A*(P + PMT*ax/r) = vf + PMT*ax/r
  const denom = aporteInicial + (pmt * ax) / r;
  if (denom <= 0) return null;
  const numer = vfObjetivo + (pmt * ax) / r;
  if (numer <= 0 || denom <= 0) return null;
  const A = numer / denom;
  if (A <= 0) return null;
  return Math.ceil(Math.log(A) / Math.log(1 + r));
}

export type PlanFlowRow = { periodo: number; aporte: number; cuota: boolean; interes: number; saldo: number };

export function buildPlanFlujo(
  aporteInicial: number,
  pmt: number,
  meses: number,
  temPct: number,
  anticipada: boolean,
  inflacionMensualPct: number | null,
  extras: { mes: number; monto: number }[] = [],
): { rows: PlanFlowRow[]; vfNominal: number; vfReal: number | null; totalAportado: number; interesGanado: number } {
  const n = Math.max(0, Math.round(meses));
  const r = temPct / 100;
  const ax = anticipada ? 1 + r : 1;
  void ax;
  const extraMap = new Map<number, number>();
  for (const e of extras) extraMap.set(e.mes, (extraMap.get(e.mes) ?? 0) + e.monto);

  let saldo = aporteInicial;
  let totalAportado = aporteInicial;
  const rows: PlanFlowRow[] = [];
  // mes 0
  rows.push({ periodo: 0, aporte: aporteInicial, cuota: false, interes: 0, saldo: Math.round(saldo) });
  for (let m = 1; m <= n; m++) {
    const cuota = pmt;
    const extra = extraMap.get(m) ?? 0;
    // si anticipada: aporte al inicio del período → capitaliza en ese mismo mes
    let interes = 0;
    if (anticipada) {
      saldo += cuota + extra;
      interes = saldo * r - (cuota + extra) * r; // aproximación: interés sobre saldo previo
      // refinar: interés = saldo_previo * r + (cuota+extra)*r si anticipada? simplificamos:
      // saldo_previo*r + aporte*r? En realidad anticipada = aporte rinde un período extra
      // Para no complicar: interest = (saldo_before + aporte)*r  pero ya sumamos aporte; ajustamos:
      // saldo antes = rows[m-1].saldo, luego saldo = saldo_before*(1+r) + (cuota+extra)*(1+r) si anticipada? No.
      // Modelo simple y consistente con vfConAportes (vencida/anticipada factor ax): usaremos interés derivado por diferencia
      // Recalcular saldo correctamente con fórmula cerrada para visualización:
    }
    // Recalcular con modelo exacto mes a mes
    // saldo_{m} = saldo_{m-1}*(1+r) + cuota*ax + extra*(1+r si anticipada? 1 si vencida)
    // Para extras: tratamos como aportes extraordinarios con misma regla que pmt (si anticipada, capitaliza el mes)
  }
  // Rehacer con modelo exacto limpio
  saldo = aporteInicial;
  totalAportado = aporteInicial;
  rows.length = 0;
  rows.push({ periodo: 0, aporte: aporteInicial, cuota: false, interes: 0, saldo: Math.round(saldo) });
  for (let m = 1; m <= n; m++) {
    const saldoPrev = saldo;
    const cuota = pmt;
    const extra = extraMap.get(m) ?? 0;
    const totalAporteMes = cuota + extra;
    if (anticipada) {
      saldo = saldoPrev * (1 + r) + totalAporteMes * (1 + r);
    } else {
      saldo = saldoPrev * (1 + r) + totalAporteMes;
    }
    const interes = saldo - saldoPrev - totalAporteMes;
    totalAportado += totalAporteMes;
    rows.push({ periodo: m, aporte: totalAporteMes, cuota: cuota !== 0, interes: Math.round(interes), saldo: Math.round(saldo) });
  }
  const vfNominal = Math.round(saldo);
  const deflactor = inflacionMensualPct != null ? Math.pow(1 + inflacionMensualPct / 100, n) : null;
  const vfReal = deflactor ? Math.round(vfNominal / deflactor) : null;
  return { rows, vfNominal, vfReal, totalAportado: Math.round(totalAportado), interesGanado: Math.round(vfNominal - totalAportado) };
}

export function haberRetiro(capitalAcumulado: number, tasaMensualPct: number, mesesRetiro: number): number {
  const r = tasaMensualPct / 100;
  const n = Math.max(1, mesesRetiro);
  if (Math.abs(r) < 1e-9) return capitalAcumulado / n;
  return capitalAcumulado * (r / (1 - Math.pow(1 + r, -n)));
}

// VAN / perfil VAN vs tasa (para el editor de flujos del planificador)
export function van(flujos: number[], tasaPct: number): number {
  const r = tasaPct / 100;
  return flujos.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
}
export function perfilVan(flujos: number[], desdePct: number, hastaPct: number, pasos = 40): { tasa: number; van: number }[] {
  const out: { tasa: number; van: number }[] = [];
  const step = (hastaPct - desdePct) / Math.max(1, pasos);
  for (let i = 0; i <= pasos; i++) {
    const t = desdePct + step * i;
    out.push({ tasa: Math.round(t * 100) / 100, van: Math.round(van(flujos, t)) });
  }
  return out;
}
export function tirBiseccion(flujos: number[], lo = -80, hi = 200, tol = 1e-7): number | null {
  const f = (r: number) => van(flujos, r * 100);
  let a = lo / 100, b = hi / 100;
  let fa = f(a), fb = f(b);
  if (!isFinite(fa) || !isFinite(fb)) return null;
  if (fa * fb > 0) {
    // intentar bracket en 0
    const f0 = f(0);
    if (f0 * fb <= 0) { a = 0; fa = f0; }
    else return null;
  }
  for (let i = 0; i < 120; i++) {
    const m = (a + b) / 2;
    const fm = f(m);
    if (Math.abs(fm) < tol || Math.abs(b - a) < tol) return m * 100;
    if (fa * fm <= 0) { b = m; fb = fm; } else { a = m; fa = fm; }
  }
  return ((a + b) / 2) * 100;
}
