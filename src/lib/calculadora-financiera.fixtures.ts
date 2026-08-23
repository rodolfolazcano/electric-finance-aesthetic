/**
 * Fixtures dorados AFC 2022 — casos literales del manual para regresión.
 * Todos los valores están en la página indicada del PDF.
 */
export interface Fixture {
  caso: string;
  fuente: string;
  inputs: Record<string, any>;
  esperado: Record<string, number>;
  toleranciaPct?: number; // tolerancia relativa % por redondeo
}

export const FIXTURES_AFC: Fixture[] = [
  // p.4 — Porcentajes comisión
  { caso: "Comisión 1,3% s/57.000", fuente: "Conceptos Básicos p.4", inputs: { monto: 57000, pct: 1.3 }, esperado: { valor: 741 } },
  // p.5 — Importe neto (corregido: el PDF muestra 184000 base + 10% impuesto = 202400; el OCR trae 6% por error. Tomamos 10% como especifica el enunciado)
  { caso: "Neto 200.000 −8% +10%", fuente: "p.5", inputs: { precio: 200000, desc: 8, imp: 10 }, esperado: { precioFinal: 202400 } },
  // p.6 — Diferencia porcentual
  { caso: "Variación 58,5→53,25", fuente: "p.6", inputs: { ini: 58.5, fin: 53.25 }, esperado: { varPct: -8.974 }, toleranciaPct: 0.2 },
  // p.9 — Interés simple 38k 25% 92d b365
  { caso: "IS 38k 25% 92d b365", fuente: "p.9", inputs: { capital: 38000, tasa: 25, dias: 92, base: 365 }, esperado: { interes: 2394.52, capitalFinal: 40394.52 }, toleranciaPct: 0.1 },
  // p.11 — Compuesto 35k 18% nominal cap mensual 10 años
  { caso: "IC 35k 18% 120m", fuente: "p.11", inputs: { capital: 35000, tasa: 18, anos: 10, m: 12 }, esperado: { capitalFinal: 208926.30 }, toleranciaPct: 0.2 },
  // p.12 — TNA 5,25% trim → TEA
  { caso: "TNA 5,25 trim→TEA", fuente: "p.12", inputs: { tna: 5.25, m: 4 }, esperado: { tea: 5.354 }, toleranciaPct: 0.1 },
  // p.16 — Cuota 18k 8,65% 60m
  { caso: "Cuota 18k 8,65% 60m", fuente: "p.16", inputs: { pv: 18000, tasa: 8.65, n: 60, m: 12 }, esperado: { pmt: 370.60 }, toleranciaPct: 0.5 },
  // p.17 — PMT con VF 60k (3.200 inicial, 9,75% sem)
  { caso: "PMT VF 60k sem", fuente: "p.17", inputs: { vf: 60000, pv: 3200, tasa: 9.75, n: 30, m: 2 }, esperado: { pmt: 717.44 }, toleranciaPct: 0.5 },
  // p.19 — VAN dúplex
  { caso: "VAN dúplex 13%", fuente: "p.19", inputs: { flujos: [-80000, -500, 4500, 5500, 4500, 130000], tasa: 13 }, esperado: { van: 212.18 }, toleranciaPct: 5 },
  { caso: "TIR dúplex", fuente: "p.19", inputs: { flujos: [-80000, -500, 4500, 5500, 4500, 130000] }, esperado: { tir: 13.0628 }, toleranciaPct: 1 },
  // Instructivo HP10bII p.83 — IRR 12,49% con CF0 -28000
  { caso: "IRR HP10bII 12,49%", fuente: "Instructivo p.83", inputs: { flujos: [-28000, 0, 0, 0, 5000, 5000, 5000, 7500, 10000] }, esperado: { tir: 12.49 }, toleranciaPct: 1 },
  // p.22 — Bono 6,75% cupón / 8,25% rend semi → precio 87,62
  { caso: "Bono 6,75/8,25 semi", fuente: "p.22", inputs: { cupon: 6.75, y: 8.25, anos: 14, m: 2 }, esperado: { precio: 87.62 }, toleranciaPct: 1 },
  // pp.23-26 — Estadística
  { caso: "Media 468,349,287,290", fuente: "p.23", inputs: { vals: [468, 349, 287, 290] }, esperado: { media: 348.5 } },
  { caso: "Ponderada 322,50", fuente: "p.24", inputs: { vals: [468, 349, 287, 290], pesos: [150, 100, 140, 600] }, esperado: { mediaPond: 322.5 } },
  { caso: "Correlación 0,9994", fuente: "p.26", inputs: { x: [-12.5, -1, 13.1, 12.9, 14.4], y: [-20.5, -8.3, 6.6, 7.5, 8.2] }, esperado: { corr: 0.9994 }, toleranciaPct: 0.5 },
  // Nuevos — TEM→TEA, interés banco, Fisher
  { caso: "TEM 4,11%→TEA", fuente: "LECAP", inputs: { tem: 4.11 }, esperado: { tea: 62.2 }, toleranciaPct: 1 },
  { caso: "Interés simple banco 200k 80% 180d b365", fuente: "Ej. capitalización p.31", inputs: { capital: 200000, tasa: 80, dias: 180, base: 365 }, esperado: { interes: 39452 }, toleranciaPct: 1 },
  { caso: "Fisher Argentina 26,8% nom vs 32,8% infl → real -4,52%", fuente: "Transparencias p.52", inputs: { nominal: 26.8, infl: 32.8 }, esperado: { real: -4.52 }, toleranciaPct: 0.5 },
];

export function validarFixture(f: Fixture, got: Record<string, number>): { ok: boolean; diffs: string[] } {
  const diffs: string[] = [];
  let ok = true;
  for (const [k, exp] of Object.entries(f.esperado)) {
    const g = got[k];
    if (g == null || !isFinite(g)) { ok = false; diffs.push(`${k}: falta`); continue; }
    const tol = (f.toleranciaPct ?? 0.5) / 100;
    const rel = exp !== 0 ? Math.abs(g - exp) / Math.abs(exp) : Math.abs(g - exp);
    if (rel > tol) { ok = false; diffs.push(`${k}: got ${g} exp ${exp} rel ${(rel*100).toFixed(2)}% > tol ${(tol*100).toFixed(1)}%`); }
  }
  return { ok, diffs };
}
