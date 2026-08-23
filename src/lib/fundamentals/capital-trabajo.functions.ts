/**
 * Capital de Trabajo y Tesorería — Alonso Unidad 3 (Administración de las Finanzas de la Empresa)
 * Gestión de capital de trabajo, crédito comercial, decisiones de tesorería y gestión de inventarios.
 *
 * Reutiliza: server/opciones_service.py::procesar_monto (formato AR), math/stats.ts::linregress
 * APIs: Tasas de fondeo/caución (IOL, ArgentinaDatos), comisiones bancarias (config).
 *
 * Reglas Alonso críticas:
 * - Antinomia rentabilidad-liquidez: no maximizar una en detrimento de la otra.
 * - Elegir por costo efectivo total, nunca tasa nominal.
 * - Costo implícito del crédito comercial como señal de tensión financiera.
 */

import { linregress } from "../math/stats";

// ============================================================================
// 1. COSTO DE FINANCIAMIENTO
// ============================================================================

export interface CostoFinanciamientoResult {
  costo: number;
  formula: string;
  explicacion: string;
}

export function costoAlternativaFinanciamiento(
  K: number,
  t: number,
  i: number
): CostoFinanciamientoResult {
  const costo = (K * t * i) / 360;
  return {
    costo,
    formula: `Costo = ${K} × ${t} días × ${i} / 360 = ${costo.toFixed(2)}`,
    explicacion: "Costo del financiamiento por el período. Usar tasa efectiva anual, no nominal."
  };
}

export function costoImplicitoCreditoComercial(
  descuento: number,
  precioContado: number,
  plazoDias: number
): CostoFinanciamientoResult {
  if (precioContado <= 0 || plazoDias <= 0) {
    return { costo: 0, formula: "N/A", explicacion: "Parámetros inválidos" };
  }
  const costo = (descuento / precioContado) * (360 / plazoDias);
  return {
    costo,
    formula: `Costo implícito = (${descuento}/${precioContado}) × (360/${plazoDias}) = ${(costo * 100).toFixed(2)}% anual`,
    explicacion: "Costo efectivo anual de no tomar el descuento por pago contado. Señal de tensión financiera si supera tasas de fondeo."
  };
}

// ============================================================================
// 2. CICLO DE CONVERSIÓN Y NECESIDAD DE CAPITAL DE TRABAJO
// ============================================================================

export interface CicloConversionResult {
  diasStock: number;
  diasCobro: number;
  diasPago: number;
  cicloNeto: number;
  formula: string;
  explicacion: string;
}

export function cicloConversion(
  diasStock: number,
  diasCobro: number,
  diasPago: number
): CicloConversionResult {
  const cicloNeto = diasStock + diasCobro - diasPago;
  return {
    diasStock,
    diasCobro,
    diasPago,
    cicloNeto,
    formula: `Ciclo neto = ${diasStock} + ${diasCobro} - ${diasPago} = ${cicloNeto} días`,
    explicacion: cicloNeto > 0 
      ? "La empresa financia a sus clientes y proveedores (necesita CTN)."
      : "Los proveedores financian el ciclo operativo (superávit de CTN)."
  };
}

export interface NecesidadCTNResult {
  necesidad: number;
  formula: string;
  explicacion: string;
}

export function necesidadCTN(
  costoOperativoDiario: number,
  rotacionVentas: number,
  cicloConversionDias: number
): NecesidadCTNResult {
  const necesidad = costoOperativoDiario * rotacionVentas * cicloConversionDias;
  return {
    necesidad,
    formula: `CTN = ${costoOperativoDiario} × ${rotacionVentas} × ${cicloConversionDias} = ${necesidad.toFixed(2)}`,
    explicacion: "Monto de capital de trabajo necesario para financiar el ciclo operativo."
  };
}

// ============================================================================
// 3. DECISIONES DE INVERSIÓN EN CAPITAL DE TRABAJO
// ============================================================================

export interface InversionCTNResult {
  decision: "invertir" | "no_invertir";
  razonamiento: string;
  formula: string;
}

export function reglaInversionCTN(
  deltaMargenContribucion: number,
  deltaCTN: number,
  costoCapital: number
): InversionCTNResult {
  const retorno = deltaMargenContribucion / deltaCTN;
  const decision = retorno >= costoCapital ? "invertir" : "no_invertir";
  return {
    decision,
    razonamiento: `Retorno marginal = ${deltaMargenContribucion}/${deltaCTN} = ${(retorno * 100).toFixed(2)}% vs costo capital ${(costoCapital * 100).toFixed(2)}%`,
    formula: `r = ΔCM/ΔCTN ≥ k → ${retorno.toFixed(4)} ≥ ${costoCapital.toFixed(4)}`
  };
}

// ============================================================================
// 4. DECISIÓN DE CRÉDITO A CLIENTES (Van Horne)
// ============================================================================

export interface CreditoClienteResult {
  decision: "aceptar" | "rechazar";
  costoAceptar: number;
  costoRechazar: number;
  razonamiento: string;
}

export function decisionCreditoCliente(
  venta: number,
  margen: number,
  probabilidadPago: number,
  costoCapital: number,
  probabilidadImpago: number,
  costoCobranza: number
): CreditoClienteResult {
  const costoAceptar = venta * (1 - probabilidadPago) * costoCapital + venta * probabilidadImpago * costoCobranza;
  const costoRechazar = venta * margen;
  const decision = costoAceptar <= costoRechazar ? "aceptar" : "rechazar";
  
  return {
    decision,
    costoAceptar,
    costoRechazar,
    razonamiento: decision === "aceptar"
      ? `Aceptar crédito: costo aceptar ${costoAceptar.toFixed(2)} ≤ costo rechazar ${costoRechazar.toFixed(2)}`
      : `Rechazar crédito: costo aceptar ${costoAceptar.toFixed(2)} > costo rechazar ${costoRechazar.toFixed(2)}`
  };
}

// ============================================================================
// 5. GESTIÓN DE INVENTARIOS
// ============================================================================

export interface PuntoPedidoResult {
  puntoPedido: number;
  formula: string;
  explicacion: string;
}

export function puntoPedido(
  consumoDiario: number,
  plazoEntregaDias: number,
  stockSeguridad: number
): PuntoPedidoResult {
  const punto = consumoDiario * plazoEntregaDias + stockSeguridad;
  return {
    puntoPedido: punto,
    formula: `Punto pedido = ${consumoDiario} × ${plazoEntregaDias} + ${stockSeguridad} = ${punto.toFixed(2)}`,
    explicacion: "Nivel de stock que dispara el reabastecimiento. Incluye stock de seguridad."
  };
}

export interface LoteEconomicoResult {
  loteEconomico: number;
  formula: string;
  explicacion: string;
}

export function loteEconomico(
  demandaAnual: number,
  costoPedido: number,
  costoMantenimientoAnual: number
): LoteEconomicoResult {
  if (costoMantenimientoAnual <= 0) {
    return { loteEconomico: demandaAnual, formula: "N/A", explicacion: "Costo de mantenimiento debe ser positivo" };
  }
  const lote = Math.sqrt((2 * demandaAnual * costoPedido) / costoMantenimientoAnual);
  return {
    loteEconomico: lote,
    formula: `EOQ = √(2 × ${demandaAnual} × ${costoPedido} / ${costoMantenimientoAnual}) = ${lote.toFixed(2)}`,
    explicacion: "Lote económico de pedido (EOQ) que minimiza el costo total de inventario."
  };
}

// ============================================================================
// 6. MODELO DE PUNTAJE PONDERADO PARA COLOCACIONES DE TESORERÍA
// ============================================================================

export interface ColocacionTesoreria {
  nombre: string;
  seguridad: number; // 0-10
  liquidez: number; // 0-10
  rentabilidad: number; // 0-10
}

export interface PuntajeTesoreriaResult {
  colocaciones: Array<{ nombre: string; puntaje: number; ranking: number }>;
  mejor: string;
  formula: string;
}

export function puntajePonderadoTesoreria(
  colocaciones: ColocacionTesoreria[],
  pesos = { seguridad: 10, liquidez: 7, rentabilidad: 9 }
): PuntajeTesoreriaResult {
  const totalPesos = pesos.seguridad + pesos.liquidez + pesos.rentabilidad;
  
  const conPuntaje = colocaciones.map(c => ({
    nombre: c.nombre,
    puntaje: (c.seguridad * pesos.seguridad + c.liquidez * pesos.liquidez + c.rentabilidad * pesos.rentabilidad) / totalPesos
  })).sort((a, b) => b.puntaje - a.puntaje);
  
  const conRanking = conPuntaje.map((c, i) => ({ ...c, ranking: i + 1 }));
  
  return {
    colocaciones: conRanking,
    mejor: conRanking[0]?.nombre || "N/A",
    formula: `Puntaje = (${pesos.seguridad}×Seguridad + ${pesos.liquidez}×Liquidez + ${pesos.rentabilidad}×Rentabilidad) / ${totalPesos}`
  };
}

// ============================================================================
// 7. AHORRO DE TESORERÍA
// ============================================================================

export interface AhorroTesoreriaResult {
  ahorro: number;
  formula: string;
  explicacion: string;
}

export function ahorroTesoreria(
  flujoFondeo: number,
  tasaRetorno1: number,
  dias: number,
  frecuencia: number,
  tasaRetorno2: number,
  costoMantenimiento: number,
  tasaCosto: number
): AhorroTesoreriaResult {
  const retorno1 = flujoFondeo * tasaRetorno1 * (dias / 360);
  const retorno2 = frecuencia * tasaRetorno2;
  const costo = costoMantenimiento * tasaCosto;
  const ahorro = retorno1 + retorno2 - costo;
  
  return {
    ahorro,
    formula: `Ahorro = ${flujoFondeo}×${tasaRetorno1}×${dias}/360 + ${frecuencia}×${tasaRetorno2} - ${costoMantenimiento}×${tasaCosto} = ${ahorro.toFixed(2)}`,
    explicacion: "Ahorro neto de tesorería por optimización de fondeo y colocaciones."
  };
}

// ============================================================================
// 8. EJECUTOR PRINCIPAL: ANÁLISIS DE TESORERÍA
// ============================================================================

export interface AnalisisTesoreriaInput {
  costoFondeoActual: number; // TEA
  costoCreditoComercial: number; // TEA implícita
  cicloConversion: CicloConversionResult;
  necesidadCTN: number;
  colocacionesDisponibles: ColocacionTesoreria[];
}

export interface AnalisisTesoreriaResult {
  recomendacion: string;
  costoFondeoVsComercial: string;
  cicloOptimo: string;
  mejorColocacion: string;
  detalle: string;
}

export function ejecutarAnalisisTesoreria(input: AnalisisTesoreriaInput): AnalisisTesoreriaResult {
  const { costoFondeoActual, costoCreditoComercial, cicloConversion, necesidadCTN, colocacionesDisponibles } = input;
  
  // Comparar costo de fondeo vs crédito comercial
  const tensionFinanciera = costoCreditoComercial > costoFondeoActual;
  const costoFondeoVsComercial = tensionFinanciera
    ? `ALERTA: Costo crédito comercial (${(costoCreditoComercial * 100).toFixed(2)}%) > costo fondeo (${(costoFondeoActual * 100).toFixed(2)}%) → tensión financiera`
    : `Costo crédito comercial (${(costoCreditoComercial * 100).toFixed(2)}%) ≤ costo fondeo (${(costoFondeoActual * 100).toFixed(2)}%) → situación normal`;
  
  // Análisis de ciclo de conversión
  const cicloOptimo = cicloConversion.cicloNeto > 0
    ? `Ciclo neto positivo (${cicloConversion.cicloNeto} días) → necesita financiar CTN de ${necesidadCTN.toFixed(2)}. Reducir días de stock/cobro o negociar mejores plazos de pago.`
    : `Ciclo neto negativo (${cicloConversion.cicloNeto} días) → superávit de CTN. Proveedores financian operación. Considerar colocaciones de tesorería.`;
  
  // Mejor colocación de tesorería
  const ranking = puntajePonderadoTesoreria(colocacionesDisponibles);
  const mejorColocacion = `Mejor colocación: ${ranking.mejor} (puntaje ${ranking.colocaciones[0]?.puntaje.toFixed(2)}) según pesos Seguridad/Liquidez/Rentabilidad (10/7/9)`;
  
  const recomendacion = tensionFinanciera
    ? "PRIORIDAD: Renegociar plazos con proveedores y acelerar cobranzas para reducir costo de crédito comercial."
    : cicloConversion.cicloNeto < 0
    ? "PRIORIDAD: Optimizar colocaciones de tesorería con el superávit de CTN."
    : "PRIORIDAD: Monitorear ciclo de conversión y buscar financiamiento de menor costo.";
  
  return {
    recomendacion,
    costoFondeoVsComercial,
    cicloOptimo,
    mejorColocacion,
    detalle: `Análisis completo de tesorería según Alonso U3. Antinomia rentabilidad-liquidez: balancear colocaciones de alto retorno con liquidez suficiente.`
  };
}
