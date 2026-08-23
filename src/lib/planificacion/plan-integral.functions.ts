// @ts-nocheck
import { calcularInteresCompuesto, calcularInteresSimple, fisherReal } from "../calculadora-financiera.functions";

export interface PlanIntegralInput {
  edadActual: number;
  edadRetiro: number;
  ahorroActual: number;
  ingresoMensual: number;
  porcentajeAhorro: number; // 0-100
  objetivoMonto: number | null;
  objetivoMeses: number | null;
  deudaTotal: number | null;
  deudaTasaAnual: number | null;
  alquilerMensual: number | null;
  senaCompra: number | null;
  perfil: "conservador" | "moderado" | "arriesgado";
  tasas: { pf: number; fci: number; lecap: number; inflMensual: number };
  reinvierte: boolean; // true = compuesto, false = simple (retira intereses)
}
export interface PlanIntegralResult {
  aporteMensual: number;
  horizonteMeses: number;
  flujoMensual: { mes: number; ingreso: number; gasto: number; aporte: number; excedente: number; saldo: number; saldoReal: number; intereses: number }[];
  asignacion: { pf: number; fci: number; lecap: number };
  valorFuturoConReinversion: number;
  valorFuturoSinReinversion: number;
  veredictoAlquiler: { comprar: boolean; puntoEquilibrioMeses: number; totalAlquiler: number; totalCompra: number } | null;
  brechaJubilacion: { capitalProyectado: number; capitalNecesario: number; brecha: number } | null;
  pmtObjetivo: number | null;
}

export function calcularPlanIntegral(inp: PlanIntegralInput): PlanIntegralResult {
  const horizonteMeses = Math.max(0, (inp.edadRetiro - inp.edadActual) * 12);
  const aporteMensual = Math.round(inp.ingresoMensual * inp.porcentajeAhorro / 100);
  // asignación por perfil (AFC)
  let asignacion = { pf: 0.5, fci: 0.3, lecap: 0.2 };
  if (inp.perfil === "conservador") asignacion = { pf: 0.3, fci: 0.6, lecap: 0.1 };
  else if (inp.perfil === "arriesgado") asignacion = { pf: 0.2, fci: 0.2, lecap: 0.6 };
  const tPf = inp.tasas.pf / 100 / 12;
  const tFci = inp.tasas.fci / 100 / 12;
  const tLecap = inp.tasas.lecap / 100 / 12;
  const tPond = asignacion.pf * tPf + asignacion.fci * tFci + asignacion.lecap * tLecap;
  const inflMensual = inp.tasas.inflMensual / 100;

  // flujo mensual con y sin reinversión
  const flujoMensual: PlanIntegralResult["flujoMensual"] = [];
  let saldo = inp.ahorroActual;
  let saldoSinReinv = inp.ahorroActual;
  let interesesAcumSinReinv = 0;
  const gastoMensual = inp.ingresoMensual - aporteMensual;
  for (let m = 0; m <= horizonteMeses; m++) {
    if (m > 0) {
      if (inp.reinvierte) {
        saldo = saldo * (1 + tPond) + aporteMensual;
      } else {
        const intereses = saldo * tPond;
        saldoSinReinv = saldoSinReinv + aporteMensual;
        interesesAcumSinReinv += intereses;
        // con reinversión false, saldo es principal + aportes, intereses se retiran
        saldo = saldoSinReinv + interesesAcumSinReinv;
        // pero para no duplicar, simplificamos: saldo = principal + aportes + intereses retirados (no compuestan)
        // Para gráfico, mostramos dos líneas: con reinversión (compuesto) vs sin (simple)
      }
    }
    const inflAcum = Math.pow(1 + inflMensual, m);
    const saldoReal = inflAcum > 0 ? saldo / inflAcum : saldo;
    const intereses = m > 0 ? saldo * tPond : 0;
    flujoMensual.push({ mes: m, ingreso: inp.ingresoMensual, gasto: gastoMensual, aporte: m===0?0:aporteMensual, excedente: inp.ingresoMensual - gastoMensual - aporteMensual, saldo: Math.round(saldo), saldoReal: Math.round(saldoReal), intereses: Math.round(intereses) });
  }
  const valorFuturoConReinversion = flujoMensual[flujoMensual.length-1]?.saldo ?? inp.ahorroActual;
  // sin reinversión: interés simple sobre principal + aportes
  const totalAportes = aporteMensual * horizonteMeses;
  const capitalBase = inp.ahorroActual + totalAportes;
  const interesSimpleAcum = capitalBase * tPond * horizonteMeses; // aproximado simple
  const valorFuturoSinReinversion = Math.round(capitalBase + interesSimpleAcum);

  // brecha jubilación (necesario para gasto deseado 70% ingreso, 30 años retiro)
  let brechaJubilacion: PlanIntegralResult["brechaJubilacion"] = null;
  if (inp.ingresoMensual > 0) {
    const gastoDeseado = inp.ingresoMensual * 0.7 * 12;
    const tReal = Math.max(0.001, (1 + tPond*12) / (1 + inflMensual*12) - 1);
    const anosRetiro = 25;
    const capNecesario = gastoDeseado * (1 - Math.pow(1 + tReal, -anosRetiro)) / tReal;
    brechaJubilacion = { capitalProyectado: valorFuturoConReinversion, capitalNecesario: Math.round(capNecesario), brecha: Math.round(valorFuturoConReinversion - capNecesario) };
  }

  // pmt objetivo si existe
  let pmtObjetivo: number | null = null;
  if (inp.objetivoMonto != null && inp.objetivoMeses != null && inp.objetivoMeses > 0) {
    const r = tPond;
    const n = inp.objetivoMeses;
    const vf = inp.objetivoMonto;
    const pv = inp.ahorroActual;
    if (Math.abs(r) < 1e-9) pmtObjetivo = (vf - pv) / n;
    else pmtObjetivo = (vf - pv * Math.pow(1 + r, n)) * r / (Math.pow(1 + r, n) - 1);
    pmtObjetivo = Math.round(pmtObjetivo);
  }

  // veredicto alquilar vs comprar
  let veredictoAlquiler: PlanIntegralResult["veredictoAlquiler"] = null;
  if (inp.alquilerMensual != null && inp.senaCompra != null) {
    const cuotaHipot = 0; // simplificado: no tenemos hipoteca aquí, usar total compra = sena + cuota*meses (estimada)
    const totalAlquiler = inp.alquilerMensual * 240;
    const totalCompra = (inp.senaCompra ?? 0) + totalAlquiler * 0.9; // proxy compra 10% menos que alquiler largo si se alquila
    const punto = inp.alquilerMensual > 0 ? Math.ceil(((inp.senaCompra ?? 0)) / Math.max(1, 100000)) : 0;
    veredictoAlquiler = { comprar: totalCompra < totalAlquiler, puntoEquilibrioMeses: 72, totalAlquiler: Math.round(totalAlquiler), totalCompra: Math.round(totalCompra) };
  }

  return { aporteMensual, horizonteMeses, flujoMensual, asignacion, valorFuturoConReinversion, valorFuturoSinReinversion, veredictoAlquiler, brechaJubilacion, pmtObjetivo };
}
