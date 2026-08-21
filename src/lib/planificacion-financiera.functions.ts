// ---------------------------------------------------------------------------
// Planificación financiera de corto plazo — metodología Pascale (Cap. 37)
// Sistema presupuestario: Presupuesto de Ventas → Producción → Inversiones →
// Plan Financiero → PFC, PER, PES (productos finales de la planificación).
// Incluye el cálculo de razones financieras forward a partir del PES/PER
// proyectados (integración con razones-financieras.functions.ts).
// ---------------------------------------------------------------------------

export interface PlanificacionInputs {
  nombreEmpresa: string;
  moneda: string;
  iva: number; // 0.18
  //  Presupuesto de ventas 
  ventas: {
    unidadesMes1: number;
    precio1: number;
    unidadesMes2: number;
    precio2: number;
    /** Días de plazo de cobro (política de crédito a clientes) */
    plazoCobroDias: number;
    /** Stock inicial de cuentas a cobrar (ventas del año anterior) */
    stockInicialCreditos: number;
  };
  //  Presupuesto de producción 
  produccion: {
    /** Costo variable unitario por semestre */
    costoVariableUnit1: number;
    costoVariableUnit2: number;
    /** Costos fijos (incl. depreciaciones) por semestre */
    costosFijos1: number;
    costosFijos2: number;
    /** Política de inventarios: meses de ventas proyectadas a mantener */
    mesesStock: number;
    /** Stock inicial de materias primas (en $) */
    stockInicialMP: number;
    /** Stock inicial de productos terminados (en $) */
    stockInicialPT: number;
    /** Plazo de pago a proveedores en días (crédito de proveedores) */
    plazoPagoProveedoresDias: number;
  };
  //  Presupuesto de inversiones 
  inversiones: {
    /** Compra de bienes de uso ($) */
    compraActivoFijo: number;
    /** % pagado al contado */
    pctContadoCompra: number;
    /** Plazo de la cuota (semestres) */
    cuotas: number;
    /** Tasa de interés semestral sobre saldo para financiación de compra */
    tasaInteresCompra: number;
    /** Venta de bienes de uso ($) — costo revaluado */
    ventaActivoFijo: number;
    /** Depreciación del ejercicio */
    depreciacion: number;
  };
  //  Plan financiero 
  financiamiento: {
    /** Préstamo bancario a corto plazo al inicio */
    prestamoBancarioInicial: number;
    /** Tasa de interés cuatrimestral sobre préstamo bancario */
    tasaPrestamoBancario: number;
    /** Deuda a largo plazo al inicio */
    deudaLargoPlazoInicial: number;
    /** Tasa de interés semestral sobre deuda a largo plazo */
    tasaDeudaLargoPlazo: number;
    /** Línea de crédito disponible (tasa adelantada) */
    lineaCreditoTasa: number;
    /** Dividendos a pagar en efectivo */
    dividendosEfectivo: number;
    /** Tasa de impuesto a la renta */
    tasaImpuesto: number;
  };
  caja: {
    /** Saldo inicial de caja */
    inicial: number;
    /** Saldo mínimo de caja requerido */
    minimo: number;
  };
}

export interface PresupuestoVentasResult {
  unidades1: number;
  unidades2: number;
  unidadesTotal: number;
  ventas1: number;
  ventas2: number;
  ventasTotal: number;
  ivaVentas1: number;
  ivaVentas2: number;
  /** Cobranzas por período (PFC) */
  cobranzas1: number;
  cobranzas2: number;
  /** Cuentas a cobrar al cierre (PES) */
  creditosFinal: number;
}

export interface PresupuestoProduccionResult {
  /** Ventas del costo de productos vendidos por período */
  costoVentas1: number;
  costoVentas2: number;
  costoVentasTotal: number;
  /** Compras de materias primas por período (para proveedores) */
  compras1: number;
  compras2: number;
  /** Stock de materias primas al cierre */
  stockMPFinal: number;
  /** Stock de productos terminados al cierre */
  stockPTFinal: number;
  /** Pagos a proveedores (PFC) */
  pagosProveedores1: number;
  pagosProveedores2: number;
  /** Proveedores al cierre (PES) */
  proveedoresFinal: number;
}

export interface PresupuestoInversionesResult {
  /** Desembolsos de caja por período (PFC) */
  pagosInversion1: number;
  pagosInversion2: number;
  /** Intereses por financiación de compra (PER) */
  interesesCompra: number;
  /** Acreedores por compra al cierre (PES) */
  acreedoresCompraFinal: number;
  /** Utilidad por venta de activo fijo (PER) */
  resultadoVentaActivoFijo: number;
}

export interface PlanFinancieroResult {
  /** Pago de préstamo bancario + intereses por período (PFC) */
  pagosBancario1: number;
  pagosBancario2: number;
  /** Intereses por préstamo bancario (PER) */
  interesesBancario: number;
  /** Pago deuda LP + intereses (PFC) */
  pagosDeudaLP1: number;
  pagosDeudaLP2: number;
  /** Intereses por deuda LP (PER) */
  interesesDeudaLP: number;
  /** Préstamo de corto plazo final (PES) */
  prestamoBancarioFinal: number;
  /** Deuda LP al cierre (PES) */
  deudaLargoPlazoFinal: number;
  /** Intereses por nuevos préstamos (PER) */
  interesesNuevosPrestamos: number;
}

export interface PERResult {
  ventas: number;
  costoVentas: number;
  margenBruto: number;
  costosFijos: number;
  resultadoVentaActivoFijo: number;
  gaii: number;
  intereses: number;
  gai: number;
  impuesto: number;
  gananciaNeta: number;
}

export interface PESResult {
  caja: number;
  creditos: number;
  stockMP: number;
  stockPT: number;
  totalActivoCorriente: number;
  activoFijoNeto: number;
  totalActivo: number;
  proveedores: number;
  prestamosBancarios: number;
  acreedoresCompra: number;
  otrosPasivosCorrientes: number;
  totalPasivoCorriente: number;
  deudaLargoPlazo: number;
  totalPasivo: number;
  patrimonioInicial: number;
  utilidad: number;
  dividendos: number;
  patrimonioFinal: number;
  totalPasivoPatrimonio: number;
}

export interface PFCResult {
  /** Flujo neto por período (antes de financiamiento) */
  flujoNeto1: number;
  flujoNeto2: number;
  flujoNetoTotal: number;
  /** Saldo de caja por período */
  cajaFinal1: number;
  cajaFinal2: number;
}

export interface PlanificacionFinancieraResult {
  inputs: PlanificacionInputs;
  presupuestoVentas: PresupuestoVentasResult;
  presupuestoProduccion: PresupuestoProduccionResult;
  presupuestoInversiones: PresupuestoInversionesResult;
  planFinanciero: PlanFinancieroResult;
  per: PERResult;
  pes: PESResult;
  pfc: PFCResult;
  /** Ratios forward sobre el PER/PES proyectados (formato compatible con razones) */
  ratiosForward: {
    liquidez: {
      razonCirculante: number | null;
      razonRapida: number | null;
      capitalTrabajo: number | null;
    };
    actividad: {
      rotacionInventarios: number | null;
      dso: number | null;
      rotacionActivosTotales: number | null;
    };
    endeudamiento: {
      razonDeuda: number | null;
      deudaPatrimonio: number | null;
      tie: number | null;
    };
    rentabilidad: { margenUtilidad: number | null; roa: number | null; roe: number | null };
    dupont: {
      margenNeto: number | null;
      rotacionActivos: number | null;
      multiplicadorPatrimonio: number | null;
      roeDupont: number | null;
    };
  };
  /** Observaciones cualitativas del plan (metodología Pascale) */
  observaciones: string[];
}

//  Helpers 

function r(num: number, den: number): number | null {
  if (den === 0) return null;
  return Math.round((num / den) * 10000) / 10000;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

//  Simulación completa 

export function calcularPlanificacionFinanciera(
  inputs: PlanificacionInputs,
): PlanificacionFinancieraResult {
  const v = inputs.ventas;
  const p = inputs.produccion;
  const inv = inputs.inversiones;
  const fin = inputs.financiamiento;
  const iva = inputs.iva;

  //  Presupuesto de ventas 
  const unidades1 = v.unidadesMes1 * 6;
  const unidades2 = v.unidadesMes2 * 6;
  const ventas1 = round2(unidades1 * v.precio1);
  const ventas2 = round2(unidades2 * v.precio2);
  const ventasTotal = round2(ventas1 + ventas2);
  const ivaVentas1 = round2(ventas1 * iva);
  const ivaVentas2 = round2(ventas2 * iva);

  // Cobranzas: parte de las ventas del semestre se cobran dentro del mismo.
  // Con 180 días por semestre, el % cobrado en el semestre = (180 - plazo)/180.
  const diasSemestre = 180;
  const pctCobro1 =
    v.plazoCobroDias >= diasSemestre
      ? 0
      : Math.max(0, (diasSemestre - v.plazoCobroDias) / diasSemestre);
  const pctCobro2 =
    v.plazoCobroDias >= diasSemestre
      ? 0
      : Math.max(0, (diasSemestre - v.plazoCobroDias) / diasSemestre);
  const cobranzas1 = round2(v.stockInicialCreditos + ventas1 * pctCobro1);
  const cobranzas2 = round2(ventas2 * pctCobro2 + ventas1 * (1 - pctCobro1));
  const creditosFinal = round2(ventas2 * (1 - pctCobro2));

  //  Presupuesto de producción 
  const costoVentas1 = round2(unidades1 * p.costoVariableUnit1);
  const costoVentas2 = round2(unidades2 * p.costoVariableUnit2);
  const costoVentasTotal = round2(costoVentas1 + costoVentas2);

  // Política de inventarios: meses de ventas proyectadas.
  const mesesStockPct = p.mesesStock / 6;
  const stockMPTarget = round2(p.stockInicialMP + costoVentasTotal * mesesStockPct * 0.5);
  const stockPTFinal = round2(costoVentasTotal * mesesStockPct);
  const comprasTotal = round2(
    costoVentasTotal - p.stockInicialPT + stockPTFinal + (stockMPTarget - p.stockInicialMP),
  );
  const compras1 = round2(comprasTotal * 0.45);
  const compras2 = round2(comprasTotal - compras1);
  const stockMPFinal = stockMPTarget;

  // Pagos a proveedores: con plazo de pago en días, el % pagado en el semestre.
  const pctPagoProv1 =
    p.plazoPagoProveedoresDias >= diasSemestre
      ? 0
      : (diasSemestre - p.plazoPagoProveedoresDias) / diasSemestre;
  const pagosProveedores1 = round2(p.stockInicialMP * 0.1 + compras1 * pctPagoProv1);
  const pagosProveedores2 = round2(compras2 * pctPagoProv1 + compras1 * (1 - pctPagoProv1));
  const proveedoresFinal = round2(compras2 * (1 - pctPagoProv1));

  //  Presupuesto de inversiones 
  const pctContado = inv.pctContadoCompra;
  const contado = round2(inv.compraActivoFijo * pctContado);
  const saldoFinanciado = inv.compraActivoFijo * (1 - pctContado);
  const pagoCuota = inv.cuotas > 0 ? saldoFinanciado / inv.cuotas : 0;
  // Intereses sobre saldos (simple)
  let saldoRestante = saldoFinanciado;
  let interesesCompra = 0;
  for (let i = 0; i < inv.cuotas; i++) {
    interesesCompra += saldoRestante * inv.tasaInteresCompra;
    saldoRestante -= pagoCuota;
  }
  interesesCompra = round2(interesesCompra);
  const pagosInversion1 = round2(contado + (inv.cuotas >= 1 ? pagoCuota : 0));
  const pagosInversion2 = round2(inv.cuotas >= 2 ? pagoCuota * (inv.cuotas - 1) : 0);
  const acreedoresCompraFinal = round2(
    Math.max(0, saldoFinanciado - pagoCuota * Math.min(2, inv.cuotas)),
  );
  const resultadoVentaActivoFijo = round2(inv.ventaActivoFijo * 0.25); // utilidad estimada 25% del costo

  //  Plan financiero 
  const tasaSem1 = fin.tasaPrestamoBancario;
  const interesesBancario = round2(fin.prestamoBancarioInicial * tasaSem1 * 1.5);
  const pagoCapitalBancario = round2(fin.prestamoBancarioInicial / 3);
  const pagosBancario1 = round2(interesesBancario * 0.4 + pagoCapitalBancario);
  const pagosBancario2 = round2(interesesBancario * 0.6 + pagoCapitalBancario * 2);
  const prestamoBancarioFinal = round2(
    fin.prestamoBancarioInicial -
      pagoCapitalBancario * 3 +
      (pagosBancario2 > 0 ? fin.prestamoBancarioInicial * 0.2 : 0),
  );

  const interesesDeudaLP = round2(fin.deudaLargoPlazoInicial * fin.tasaDeudaLargoPlazo);
  const pagoCapitalLP = round2(fin.deudaLargoPlazoInicial / 2);
  const pagosDeudaLP1 = round2(interesesDeudaLP * 0.5 + pagoCapitalLP);
  const pagosDeudaLP2 = round2(interesesDeudaLP * 0.5 + pagoCapitalLP);
  const deudaLargoPlazoFinal = round2(fin.deudaLargoPlazoInicial - pagoCapitalLP * 2);

  // Intereses por nuevos préstamos (proxy: tasa de la línea × 50% de la necesidad de caja)
  const interesesNuevosPrestamos = round2((fin.prestamoBancarioInicial * fin.lineaCreditoTasa) / 2);

  //  PER 
  const gaii = round2(
    ventasTotal - costoVentasTotal - p.costosFijos1 - p.costosFijos2 - resultadoVentaActivoFijo,
  );
  const interesesTotales = round2(
    interesesCompra + interesesBancario + interesesDeudaLP + interesesNuevosPrestamos,
  );
  const gai = round2(gaii - interesesTotales);
  const impuesto = round2(Math.max(0, gai) * fin.tasaImpuesto);
  const gananciaNeta = round2(gai - impuesto);

  //  PES 
  const caja = round2(
    inputs.caja.inicial +
      (cobranzas1 + cobranzas2) -
      (pagosProveedores1 +
        pagosProveedores2 +
        p.costosFijos1 +
        p.costosFijos2 +
        pagosInversion1 +
        pagosInversion2 +
        fin.dividendosEfectivo +
        interesesTotales) +
      fin.prestamoBancarioInicial * 0.2,
  );
  const cajaFinal = Math.max(caja, inputs.caja.minimo);
  const otrosPasivosCorrientes = round2(inputs.caja.inicial * 0.05 + impuesto);
  const activoFijoNeto = round2(
    inputs.caja.inicial * 1.2 - inv.depreciacion + inv.compraActivoFijo - inv.ventaActivoFijo * 0.5,
  );
  const totalActivoCorriente = round2(cajaFinal + creditosFinal + stockMPFinal + stockPTFinal);
  const totalActivo = round2(totalActivoCorriente + activoFijoNeto);
  const totalPasivoCorriente = round2(
    proveedoresFinal + prestamoBancarioFinal + acreedoresCompraFinal + otrosPasivosCorrientes,
  );
  const totalPasivo = round2(totalPasivoCorriente + deudaLargoPlazoFinal);
  const patrimonioInicial = round2(inputs.caja.inicial * 0.6);
  const patrimonioFinal = round2(patrimonioInicial + gananciaNeta - fin.dividendosEfectivo);
  const totalPasivoPatrimonio = round2(totalPasivo + patrimonioFinal);

  //  PFC 
  const flujoNeto1 = round2(
    cobranzas1 -
      (pagosProveedores1 + p.costosFijos1 + pagosInversion1 + pagosBancario1 + pagosDeudaLP1),
  );
  const flujoNeto2 = round2(
    cobranzas2 -
      (pagosProveedores2 +
        p.costosFijos2 +
        pagosInversion2 +
        pagosBancario2 +
        pagosDeudaLP2 +
        fin.dividendosEfectivo),
  );
  const cajaFinal1 = round2(inputs.caja.inicial + flujoNeto1);
  const cajaFinal2 = round2(cajaFinal1 + flujoNeto2);

  //  Ratios forward 
  const totalAssets = totalActivo;
  const totalEquity = patrimonioFinal;
  const totalDebt = round2(prestamoBancarioFinal + deudaLargoPlazoFinal + acreedoresCompraFinal);
  const currentAssets = totalActivoCorriente;
  const currentLiabilities = totalPasivoCorriente;
  const inventory = round2(stockMPFinal + stockPTFinal);
  const netRec = creditosFinal;

  const razonCirculante = r(currentAssets, currentLiabilities);
  const razonRapida = r(currentAssets - inventory, currentLiabilities);
  const capitalTrabajo = round2(currentAssets - currentLiabilities);
  const rotacionInventarios = r(ventasTotal, inventory);
  const dso = r(netRec, ventasTotal) != null ? round2(r(netRec, ventasTotal)! * 365) : null;
  const rotacionActivosTotales = r(ventasTotal, totalAssets);
  const razonDeuda = r(totalDebt, totalAssets);
  const deudaPatrimonio = r(totalDebt, totalEquity);
  const tie = r(gaii, interesesTotales);
  const margenUtilidad = r(gananciaNeta, ventasTotal);
  const roa = r(gananciaNeta, totalAssets);
  const roe = r(gananciaNeta, totalEquity);
  const multiplicadorPatrimonio = r(totalAssets, totalEquity);
  const roeDupont =
    margenUtilidad != null && rotacionActivosTotales != null && multiplicadorPatrimonio != null
      ? round2(margenUtilidad * rotacionActivosTotales * multiplicadorPatrimonio * 100)
      : null;

  //  Observaciones 
  const observaciones: string[] = [];
  if (razonCirculante != null && razonCirculante < 1.5) {
    observaciones.push(
      `[ADVERTENCIA] Razón circulante proyectada ${razonCirculante.toFixed(2)} < 1.5 — revisar la política de financiamiento de corto plazo y el crédito de proveedores.`,
    );
  }
  if (dso != null && dso > 90) {
    observaciones.push(
      `[ADVERTENCIA] DSO proyectado de ${dso.toFixed(0)} días — cobranzas lentas; considerar acortar el plazo de crédito a clientes.`,
    );
  }
  if (tie != null && tie < 2) {
    observaciones.push(
      `[ADVERTENCIA] TIE proyectado ${tie.toFixed(1)}x < 2 — el GAII apenas cubre los intereses; revisar la estructura de deuda.`,
    );
  }
  if (cajaFinal2 < inputs.caja.minimo) {
    observaciones.push(
      `[ADVERTENCIA] La caja proyectada (${cajaFinal2.toFixed(0)}) queda por debajo del mínimo (${inputs.caja.minimo.toFixed(0)}) — se requiere financiamiento adicional o reducción de egresos.`,
    );
  } else {
    observaciones.push(
      ` La caja proyectada (${cajaFinal2.toFixed(0)}) cubre el saldo mínimo requerido (${inputs.caja.minimo.toFixed(0)}).`,
    );
  }
  if (fin.deudaLargoPlazoInicial > 0 && interesesDeudaLP > 0) {
    const palanca = roe != null && roa != null && roa !== 0 ? roe / roa : null;
    if (palanca != null && palanca > 1)
      observaciones.push(
        ` Efecto de palanca proyectado de ${palanca.toFixed(2)} — el apalancamiento amplifica el retorno del capital propio (Pascale: utilización del capital ajeno conveniente).`,
      );
  }

  return {
    inputs,
    presupuestoVentas: {
      unidades1,
      unidades2,
      unidadesTotal: unidades1 + unidades2,
      ventas1,
      ventas2,
      ventasTotal,
      ivaVentas1,
      ivaVentas2,
      cobranzas1,
      cobranzas2,
      creditosFinal,
    },
    presupuestoProduccion: {
      costoVentas1,
      costoVentas2,
      costoVentasTotal,
      compras1,
      compras2,
      stockMPFinal,
      stockPTFinal,
      pagosProveedores1,
      pagosProveedores2,
      proveedoresFinal,
    },
    presupuestoInversiones: {
      pagosInversion1,
      pagosInversion2,
      interesesCompra,
      acreedoresCompraFinal,
      resultadoVentaActivoFijo,
    },
    planFinanciero: {
      pagosBancario1,
      pagosBancario2,
      interesesBancario,
      pagosDeudaLP1,
      pagosDeudaLP2,
      interesesDeudaLP,
      prestamoBancarioFinal,
      deudaLargoPlazoFinal,
      interesesNuevosPrestamos,
    },
    per: {
      ventas: ventasTotal,
      costoVentas: costoVentasTotal,
      margenBruto: round2(ventasTotal - costoVentasTotal),
      costosFijos: round2(p.costosFijos1 + p.costosFijos2),
      resultadoVentaActivoFijo,
      gaii,
      intereses: interesesTotales,
      gai,
      impuesto,
      gananciaNeta,
    },
    pes: {
      caja: cajaFinal,
      creditos: creditosFinal,
      stockMP: stockMPFinal,
      stockPT: stockPTFinal,
      totalActivoCorriente,
      activoFijoNeto,
      totalActivo,
      proveedores: proveedoresFinal,
      prestamosBancarios: prestamoBancarioFinal,
      acreedoresCompra: acreedoresCompraFinal,
      otrosPasivosCorrientes,
      totalPasivoCorriente,
      deudaLargoPlazo: deudaLargoPlazoFinal,
      totalPasivo,
      patrimonioInicial,
      utilidad: gananciaNeta,
      dividendos: fin.dividendosEfectivo,
      patrimonioFinal,
      totalPasivoPatrimonio,
    },
    pfc: {
      flujoNeto1,
      flujoNeto2,
      flujoNetoTotal: round2(flujoNeto1 + flujoNeto2),
      cajaFinal1,
      cajaFinal2,
    },
    ratiosForward: {
      liquidez: { razonCirculante, razonRapida, capitalTrabajo },
      actividad: { rotacionInventarios, dso, rotacionActivosTotales },
      endeudamiento: { razonDeuda, deudaPatrimonio, tie },
      rentabilidad: { margenUtilidad, roa, roe },
      dupont: {
        margenNeto: margenUtilidad,
        rotacionActivos: rotacionActivosTotales,
        multiplicadorPatrimonio,
        roeDupont,
      },
    },
    observaciones,
  };
}

//  Valores por defecto (referencia: caso desarrollado en el capítulo) 

export function planificacionPorDefecto(): PlanificacionInputs {
  return {
    nombreEmpresa: "Empresa",
    moneda: "USD",
    iva: 0.18,
    ventas: {
      unidadesMes1: 25000,
      precio1: 50,
      unidadesMes2: 30000,
      precio2: 55,
      plazoCobroDias: 90,
      stockInicialCreditos: 3000000,
    },
    produccion: {
      costoVariableUnit1: 20,
      costoVariableUnit2: 30,
      costosFijos1: 320750,
      costosFijos2: 380750,
      mesesStock: 4,
      stockInicialMP: 1800000,
      stockInicialPT: 1200000,
      plazoPagoProveedoresDias: 150,
    },
    inversiones: {
      compraActivoFijo: 4000000,
      pctContadoCompra: 0.25,
      cuotas: 4,
      tasaInteresCompra: 0.2,
      ventaActivoFijo: 300000,
      depreciacion: 429000,
    },
    financiamiento: {
      prestamoBancarioInicial: 915000,
      tasaPrestamoBancario: 0.15,
      deudaLargoPlazoInicial: 2000000,
      tasaDeudaLargoPlazo: 0.18,
      lineaCreditoTasa: 0.3,
      dividendosEfectivo: 200000,
      tasaImpuesto: 0.25,
    },
    caja: { inicial: 285000, minimo: 200000 },
  };
}
