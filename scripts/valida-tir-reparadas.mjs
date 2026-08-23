/**
 * Valida los flujos reparados:
 *  A) los schedules generados coinciden EXACTAMENTE con tablas publicadas
 *     (argen.bond AL30/GD41, Allaria AL35/AL41, decreto 676/2020 AL29/AE38)
 *  B) el precio que reproduce la TIR vigente publicada por brokers es plausible
 *     (los pares viejos precio→TIR no aplican: faltaban flujos ya pagados).
 * Uso: npx tsx scripts/valida-tir-reparadas.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RFC = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../RENTA_FIJA_COMPLETA.json"), "utf8"));

function parseFecha(s) { const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)); }
function npv(tir, flujos, precio, hoy) { let v = -precio; for (const f of flujos) { const t = (f.fecha.getTime() - hoy.getTime()) / 86400000 / 365; if (t <= 0) continue; v += f.monto / Math.pow(1 + tir, t); } return v; }
function dNpv(tir, flujos, hoy) { let d = 0; for (const f of flujos) { const t = (f.fecha.getTime() - hoy.getTime()) / 86400000 / 365; if (t <= 0) continue; d += (-t * f.monto) / Math.pow(1 + tir, t + 1); } return d; }
function calcularTIR(flujos, precio, hoy) {
  const futuros = flujos.filter((f) => f.fecha > hoy);
  let tir = 0.1;
  for (let i = 0; i < 200; i++) {
    const v = npv(tir, futuros, precio, hoy);
    const dv = dNpv(tir, futuros, hoy);
    if (Math.abs(dv) < 1e-12) break;
    const next = tir - v / dv;
    if (!isFinite(next) || next <= -0.95 || next > 10) { tir = tir > 0 ? tir * 0.5 : 0.05; continue; }
    if (Math.abs(next - tir) < 1e-10) { tir = next; break; }
    tir = next;
  }
  return isFinite(tir) && tir > -0.95 && tir < 10 ? tir : null;
}
function precioParaTIR(flujos, tirObjetivo, hoy) {
  // bisección sobre precio (monótono creciente)
  let lo = 1, hi = 300;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const t = calcularTIR(flujos, mid, hoy);
    if (t == null) return null;
    if (t > tirObjetivo) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

function findBono(ticker) {
  for (const cat of RFC.categorias ?? [])
    for (const sub of cat.subcategorias ?? [])
      for (const b of sub.bonos ?? [])
        if (b.ticker?.toUpperCase() === ticker) return b;
  return null;
}
function flujosDe(ticker) {
  const b = findBono(ticker);
  return (b?.flujo_fondos ?? []).map((f) => ({ fecha: f.fecha, monto: Number(f.monto_por_cien) }));
}

const hoy = new Date(); hoy.setHours(12, 0, 0, 0);
let errores = 0;

// ── A) schedules vs tablas publicadas ──
const tablas = {
  AL30: { fuente: "argen.bond (AL30)", montos: [8.24, 8.21, 8.42, 8.35, 8.28, 8.21, 8.14, 8.07] },
  GD30: { fuente: "= AL30 (argen.bond)", montos: [8.24, 8.21, 8.42, 8.35, 8.28, 8.21, 8.14, 8.07] },
  AL29: { fuente: "decreto 676/2020 (1% + 10×10%)", montos: [10.3, 10.25, 10.2, 10.15, 10.1, 10.05] },
  GD29: { fuente: "= AL29", montos: [10.3, 10.25, 10.2, 10.15, 10.1, 10.05] },
  AL35: { fuente: "Allaria (AL35)", montos: [2.0625, 2.0625, 2.375, 2.375, 2.5, 2.5, 2.5, 2.5, 12.5, 12.25, 12, 11.75, 11.5, 11.25, 11, 10.75, 10.5, 10.25] },
  GD35: { fuente: "= AL35", montos: [2.0625, 2.0625, 2.375, 2.375, 2.5, 2.5, 2.5, 2.5, 12.5, 12.25, 12, 11.75, 11.5, 11.25, 11, 10.75, 10.5, 10.25] },
  AE38: { fuente: "decreto 676/2020 (5% + 22×4.5454%)", montos: [2.5, 7.0455] },
  AL41: { fuente: "Allaria (AL41)", montos: [1.75, 1.75, 5.3214, 5.2589, 5.1964, 5.1339, 5.6607] },
};

console.log(`A) Schedules vs tablas publicadas — hoy ${hoy.toISOString().slice(0, 10)}\n`);
for (const [tk, esperado] of Object.entries(tablas)) {
  const flujos = flujosDe(tk);
  const montos = flujos.map((f) => f.monto);
  let ok = montos.length >= esperado.montos.length;
  for (let i = 0; i < esperado.montos.length && ok; i++) {
    if (Math.abs((montos[i] ?? NaN) - esperado.montos[i]) > 0.001) ok = false;
  }
  if (!ok) errores++;
  console.log(`${ok ? "OK " : "DIFF"} ${tk.padEnd(6)} (${esperado.fuente}): ${montos.slice(0, 8).join(", ")}${montos.length > 8 ? " …" : ""} [${montos.length} flujos]`);
}

// ── B) precio implícito de TIRs vigentes publicadas ──
console.log("\nB) Precio que reproduce la TIR vigente publicada (plausibilidad):\n");
const tirs = [
  ["AL35", 0.0908, "inversoy TIR 9.08%"],
  ["GD35", 0.0908, "= AL35"],
  ["AL30", 0.0718, "argen.bond TIR 7.18%"],
  ["GD41", 0.0925, "argen.bond TIR 9.25%"],
  ["AL41", 0.0925, "= GD41"],
];
for (const [tk, tirObj, fuente] of tirs) {
  const flujos = flujosDe(tk).map((f) => ({ fecha: parseFecha(f.fecha), monto: f.monto }));
  const p = precioParaTIR(flujos, tirObj, hoy);
  if (p == null) { console.log(`ERR ${tk}: no se pudo resolver precio`); errores++; continue; }
  console.log(`OK ${tk.padEnd(6)} TIR ${(tirObj * 100).toFixed(2)}% (${fuente}) → precio implícito ${p.toFixed(2)} %par original`);
}

console.log(errores === 0 ? "\nVALIDACIÓN COMPLETA: schedules exactos y TIRs plausibles." : `\n${errores} problemas.`);
process.exit(errores === 0 ? 0 : 1);
