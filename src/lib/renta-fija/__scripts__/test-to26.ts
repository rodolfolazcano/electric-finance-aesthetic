import { BONOS_DB, getFrecuenciaNumerica } from "../../bonos-data";
import {
  interesesCorridos,
  yearFraction,
  xirrConvencion,
  calcularTEA,
  calcularTNA,
  durationMacaulayConvencion,
  durationModificadaConvencion,
  convexity,
  paridad,
  precioTecnico,
  parseISO,
  toISO,
} from "../../renta-fija.functions";
import type { YieldConvention } from "../../bonos-data";

const ticker = "TO26";
const bono = BONOS_DB[ticker];
if (!bono) {
  console.error("TO26 not found in BONOS_DB");
  process.exit(1);
}

const precioClean = 101.35;
const fechaLiq = new Date("2026-07-10T00:00:00");
const freq = getFrecuenciaNumerica(bono.frecuenciaPago ?? "Semiannual");
const conv: YieldConvention = (bono.yieldConvention ?? "TRUE") as YieldConvention;
const convDias = bono.convencionDias ?? "30/360";
const cuponAnual = bono.cuponAnual ?? 0;

const flujosFuturos = bono.flujosPorCada100VN.filter((f) => parseISO(f.fecha) > fechaLiq);
console.log("Flujos futuros:", flujosFuturos.length, flujosFuturos);

if (flujosFuturos.length === 0) {
  console.error("No future flows");
  process.exit(1);
}

const intCorridos = interesesCorridos(
  fechaLiq,
  parseISO(bono.vencimiento),
  cuponAnual,
  freq,
  convDias,
);
const precioDirty = precioClean + intCorridos;
const precioTecVal = precioTecnico(bono);
const paridadCalc = paridad(precioClean, precioTecVal);
const vencimiento = flujosFuturos[flujosFuturos.length - 1].fecha;
const diasAlVto = Math.round(yearFraction(fechaLiq, parseISO(vencimiento), convDias) * 365);

const flujosXIRR: Array<{ yf: number; monto: number }> = [
  { yf: 0, monto: -precioDirty },
  ...flujosFuturos.map((f) => ({
    yf: yearFraction(fechaLiq, parseISO(f.fecha), convDias),
    monto: f.monto,
  })),
];

console.log(`\n=== TO26 Test ===`);
console.log(`Liquidacion: ${fechaLiq.toISOString().split("T")[0]}`);
console.log(`Precio Clean: ${precioClean}`);
console.log(`Int. Corridos: ${intCorridos}`);
console.log(`Precio Dirty: ${precioDirty}`);
console.log(`Valor Tecnico: ${precioTecVal}`);
console.log(`Paridad: ${paridadCalc}`);
console.log(`Yield Convention: ${conv}`);
console.log(`Convencion Dias: ${convDias}`);
console.log(`Freq: ${freq}`);
console.log(`Flujos XIRR:`, flujosXIRR.map(f => `yf=${f.yf} monto=${f.monto}`));

const tirCalc = xirrConvencion(flujosXIRR, freq, conv);
const teaCalc = tirCalc !== null ? calcularTEA(tirCalc, freq, conv) : null;
const tnaCalc = tirCalc !== null ? calcularTNA(tirCalc, freq, conv) : null;
const dMacaulay = tirCalc !== null
  ? durationMacaulayConvencion(flujosXIRR, precioDirty, tirCalc, freq, conv)
  : null;
const dModificada = tirCalc !== null
  ? durationModificadaConvencion(dMacaulay!, tirCalc, freq, conv)
  : null;
const convexityVal = tirCalc !== null
  ? convexity(flujosXIRR, precioDirty, tirCalc, freq, conv)
  : null;

console.log(`\n=== RESULTS ===`);
console.log(`TIR: ${tirCalc !== null ? (tirCalc * 100).toFixed(6) + "%" : "null"}`);
console.log(`TEA: ${teaCalc !== null ? (teaCalc * 100).toFixed(6) + "%" : "null"}`);
console.log(`TNA: ${tnaCalc !== null ? (tnaCalc * 100).toFixed(6) + "%" : "null"}`);
console.log(`Duration Macaulay: ${dMacaulay !== null ? dMacaulay.toFixed(6) : "null"}`);
console.log(`Duration Modificada: ${dModificada !== null ? dModificada.toFixed(6) : "null"}`);
console.log(`Convexity: ${convexityVal !== null ? convexityVal.toFixed(6) : "null"}`);
console.log(`Paridad: ${paridadCalc !== null ? paridadCalc.toFixed(6) : "null"}`);
console.log(`Valor Tecnico: ${precioTecVal}`);
console.log(`Dias al Vto: ${diasAlVto}`);

console.log(`\n=== Reference Values ===`);
console.log(`TIR esperada: 26.43%`);
console.log(`TNA esperada: 24.88%`);
console.log(`Paridad esperada: 0.977312`);
console.log(`Valor tecnico esperado: 1.037028`);
console.log(`Int. acumulados esperados: 0.037028`);
console.log(`Duration esperada: 0.206527`);
console.log(`Macaulay esperado: 0.261111`);
console.log(`Convexity esperada: 0.206008`);

if (tirCalc !== null) {
  const errTIR = Math.abs(tirCalc * 100 - 26.43);
  console.log(`\nError TIR: ${errTIR.toFixed(4)}pp`);
  console.log(`Match: ${errTIR < 0.15 ? "YES" : "NO"}`);
}

if (dMacaulay !== null) {
  const errMac = Math.abs(dMacaulay - 0.261111);
  console.log(`Error Macaulay: ${errMac.toFixed(6)}`);
}

if (paridadCalc !== null) {
  const errPar = Math.abs(paridadCalc - 0.977312);
  console.log(`Error Paridad: ${errPar.toFixed(6)}`);
}
