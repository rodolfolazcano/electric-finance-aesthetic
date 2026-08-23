import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";

// ---------------------------------------------------------------------------
// Razones financieras — metodología Weston & Brigham (Cap. 2)
// Las 5 categorías de razones se calculan sobre un periodo histórico
// (anual/trimestral) y se complementan con la descomposición DuPont:
//   ROA = Margen × Rotación de activos totales
//   ROE = ROA × Multiplicador del patrimonio
// ---------------------------------------------------------------------------

export interface RazonesLiquidez {
  /** Razón circulante = Activo circulante / Pasivo circulante */
  razonCirculante: number | null;
  /** Razón rápida (prueba del ácido) = (Activo circulante − Inventarios) / Pasivo circulante */
  razonRapida: number | null;
  /** Capital de trabajo = Activo circulante − Pasivo circulante */
  capitalTrabajo: number | null;
}

export interface RazonesActividad {
  /** Rotación de inventarios = Ventas / Inventarios */
  rotacionInventarios: number | null;
  /** Días de ventas pendientes de cobro (DSO) = (Cuentas por cobrar / Ventas) × 365 */
  dso: number | null;
  /** Rotación de activos fijos = Ventas / Activos fijos netos */
  rotacionActivosFijos: number | null;
  /** Rotación de activos totales = Ventas / Activos totales */
  rotacionActivosTotales: number | null;
}

export interface RazonesEndeudamiento {
  /** Razón de deuda = Deuda total / Activos totales */
  razonDeuda: number | null;
  /** Deuda a patrimonio = Deuda total / Capital contable */
  deudaPatrimonio: number | null;
  /** Cobertura de intereses (TIE) = EBIT / Gastos por intereses */
  tie: number | null;
}

export interface RazonesRentabilidad {
  /** Margen de utilidad = Utilidad neta / Ventas */
  margenUtilidad: number | null;
  /** Poder básico de generación (BEP) = EBIT / Activos totales */
  bep: number | null;
  /** ROA = Utilidad neta / Activos totales */
  roa: number | null;
  /** ROE = Utilidad neta / Capital contable */
  roe: number | null;
}

export interface RazonesMercado {
  /** P/U (precio sobre utilidad) — requiere precio actual */
  pe: number | null;
  /** P/VL (precio sobre valor en libros) — requiere precio actual */
  priceToBook: number | null;
  /** Valor en libros por acción = Capital contable / Acciones en circulación */
  libroPorAccion: number | null;
}

export interface DuPontDescomposicion {
  /** Margen neto = Utilidad neta / Ventas */
  margenNeto: number | null;
  /** Rotación de activos totales = Ventas / Activos totales */
  rotacionActivos: number | null;
  /** Multiplicador del patrimonio = Activos totales / Capital contable */
  multiplicadorPatrimonio: number | null;
  /** ROE DuPont = margen × rotación × multiplicador */
  roeDupont: number | null;
  /** ROA DuPont = margen × rotación */
  roaDupont: number | null;
}

export interface RazonesPeriodo {
  label: string;
  endDate: string;
  liquidez: RazonesLiquidez;
  actividad: RazonesActividad;
  endeudamiento: RazonesEndeudamiento;
  rentabilidad: RazonesRentabilidad;
  mercado: RazonesMercado;
  dupont: DuPontDescomposicion;
}

export interface RazonesFinancierasResult {
  symbol: string;
  periods: RazonesPeriodo[];
  /** Interpretaciones cualitativas por categoría (Weston & Brigham) */
  interpretaciones: {
    liquidez: string[];
    actividad: string[];
    endeudamiento: string[];
    rentabilidad: string[];
    mercado: string[];
  };
  /** Resumen ejecutivo del último periodo */
  resumen: string[];
  error: string | null;
}

//  Helpers 

function safeNum(v: number | null | undefined): number | null {
  return v != null && isFinite(v) ? v : null;
}

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return Math.round((num / den) * 10000) / 10000;
}

function round2(v: number | null): number | null {
  return v != null ? Math.round(v * 100) / 100 : null;
}

//  Cálculo por periodo 

export function calcularRazonesPeriodo(
  p: PeriodoHistoricoRow,
  contexto: { currentPrice?: number | null; sharesOutstanding?: number | null } = {},
): RazonesPeriodo {
  const curAssets = safeNum(p.currentAssets);
  const curLiab = safeNum(p.currentLiabilities);
  const inventory = safeNum(p.inventory);
  const netRec = safeNum(p.netReceivables);
  const netFix = safeNum(p.netFixedAssets);
  const totalAssets = safeNum(p.totalAssets);
  const totalEquity = safeNum(p.totalEquity);
  const totalDebt = safeNum(p.totalDebt) ?? safeNum(p.totalLiabilities);
  const revenue = safeNum(p.revenue);
  const ebit = safeNum(p.ebit);
  const interest = safeNum(p.interestExpense);
  const netIncome = safeNum(p.netIncome);
  const currentPrice = safeNum(contexto.currentPrice);
  const shares = safeNum(contexto.sharesOutstanding);

  // 1) Liquidez
  const razonCirculante = ratio(curAssets, curLiab);
  const razonRapida = ratio(
    curAssets != null && inventory != null ? curAssets - inventory : null,
    curLiab,
  );
  const capitalTrabajo =
    curAssets != null && curLiab != null ? round2(curAssets - curLiab) : null;

  // 2) Actividad
  const rotacionInventarios = ratio(revenue, inventory);
  const dso = ratio(netRec, revenue) != null ? round2(ratio(netRec, revenue)! * 365) : null;
  const rotacionActivosFijos = ratio(revenue, netFix);
  const rotacionActivosTotales = ratio(revenue, totalAssets);

  // 3) Endeudamiento
  const razonDeuda = ratio(totalDebt, totalAssets);
  const deudaPatrimonio = ratio(totalDebt, totalEquity);
  const tie = ratio(ebit, interest != null ? Math.abs(interest) : null);

  // 4) Rentabilidad
  const margenUtilidad = ratio(netIncome, revenue);
  const bep = ratio(ebit, totalAssets);
  const roa = ratio(netIncome, totalAssets);
  const roe = ratio(netIncome, totalEquity);

  // 5) Mercado
  let pe: number | null = null;
  let priceToBook: number | null = null;
  let libroPorAccion: number | null = null;
  const eps = netIncome != null && shares != null && shares > 0 ? netIncome / shares : null;
  if (currentPrice != null) {
    if (eps != null && eps > 0) pe = round2(currentPrice / eps);
    if (totalEquity != null && shares != null && shares > 0) {
      libroPorAccion = round2(totalEquity / shares);
      if (libroPorAccion != null && libroPorAccion > 0) {
        priceToBook = round2(currentPrice / libroPorAccion);
      }
    }
  }

  // DuPont
  const margenNeto = ratio(netIncome, revenue);
  const rotacionActivos = ratio(revenue, totalAssets);
  const multiplicadorPatrimonio = ratio(totalAssets, totalEquity);
  const roeDupont =
    margenNeto != null && rotacionActivos != null && multiplicadorPatrimonio != null
      ? round2(margenNeto * rotacionActivos * multiplicadorPatrimonio * 100)
      : null;
  const roaDupont =
    margenNeto != null && rotacionActivos != null
      ? round2(margenNeto * rotacionActivos * 100)
      : null;

  return {
    label: p.label,
    endDate: p.endDate,
    liquidez: { razonCirculante: round2(razonCirculante), razonRapida: round2(razonRapida), capitalTrabajo },
    actividad: {
      rotacionInventarios: round2(rotacionInventarios),
      dso,
      rotacionActivosFijos: round2(rotacionActivosFijos),
      rotacionActivosTotales: round2(rotacionActivosTotales),
    },
    endeudamiento: { razonDeuda: round2(razonDeuda), deudaPatrimonio: round2(deudaPatrimonio), tie: round2(tie) },
    rentabilidad: {
      margenUtilidad: round2(margenUtilidad),
      bep: round2(bep),
      roa: round2(roa),
      roe: round2(roe),
    },
    mercado: { pe, priceToBook, libroPorAccion },
    dupont: {
      margenNeto: round2(margenNeto),
      rotacionActivos: round2(rotacionActivos),
      multiplicadorPatrimonio: round2(multiplicadorPatrimonio),
      roeDupont,
      roaDupont,
    },
  };
}

//  Interpretación cualitativa (Weston & Brigham) 

function interpretarLiquidez(r: RazonesPeriodo): string[] {
  const out: string[] = [];
  const rc = r.liquidez.razonCirculante;
  const rr = r.liquidez.razonRapida;
  if (rc != null) {
    if (rc >= 2) out.push(`Razón circulante ${rc.toFixed(2)}: cubre holgadamente el pasivo de corto plazo — posición de liquidez sólida.`);
    else if (rc >= 1.5) out.push(`Razón circulante ${rc.toFixed(2)}: dentro del rango cómodo (1.5-2).`);
    else if (rc >= 1) out.push(`Razón circulante ${rc.toFixed(2)}: apenas cubre el pasivo corriente — vigilar la tesorería.`);
    else out.push(`Razón circulante ${rc.toFixed(2)} < 1: el activo corriente no cubre el pasivo corriente — riesgo de iliquidez.`);
  }
  if (rr != null) {
    if (rr >= 1) out.push(`Razón rápida ${rr.toFixed(2)}: sin depender de inventarios, se cubre el pasivo corriente.`);
    else out.push(`Razón rápida ${rr.toFixed(2)} < 1: la cobertura inmediata depende de la venta de inventarios.`);
  }
  if (out.length === 0) out.push("Datos insuficientes para evaluar la liquidez.");
  return out;
}

function interpretarActividad(r: RazonesPeriodo): string[] {
  const out: string[] = [];
  const ri = r.actividad.rotacionInventarios;
  const dso = r.actividad.dso;
  const rf = r.actividad.rotacionActivosFijos;
  const rt = r.actividad.rotacionActivosTotales;
  if (ri != null) {
    out.push(`Rotación de inventarios ${ri.toFixed(2)}x: el inventario se renueva ~${ri.toFixed(1)} veces por año.`);
  } else {
    out.push("Rotación de inventarios N/D — el balance no reporta inventarios (común en servicios o finanzas).");
  }
  if (dso != null) {
    if (dso > 90) out.push(`DSO ${dso.toFixed(0)} días: cobro lento — capital inmovilizado en cuentas por cobrar.`);
    else if (dso > 45) out.push(`DSO ${dso.toFixed(0)} días: cobranza en zona normal a moderada.`);
    else out.push(`DSO ${dso.toFixed(0)} días: cobro rápido — buena gestión del crédito a clientes.`);
  }
  if (rf != null) {
    out.push(`Rotación de activos fijos ${rf.toFixed(2)}x: eficiencia en el uso de plantas/equipos para generar ventas.`);
  }
  if (rt != null) {
    if (rt >= 1) out.push(`Rotación de activos totales ${rt.toFixed(2)}x ≥ 1: el activo total genera más de su valor en ventas.`);
    else out.push(`Rotación de activos totales ${rt.toFixed(2)}x < 1: el activo es intensivo — comparar con el promedio industrial.`);
  }
  return out;
}

function interpretarEndeudamiento(r: RazonesPeriodo): string[] {
  const out: string[] = [];
  const rd = r.endeudamiento.razonDeuda;
  const dp = r.endeudamiento.deudaPatrimonio;
  const tie = r.endeudamiento.tie;
  if (rd != null) {
    if (rd <= 0.5) out.push(`Razón de deuda ${(rd * 100).toFixed(1)}%: los acreedores aportan hasta la mitad del financiamiento — apalancamiento moderado.`);
    else out.push(`Razón de deuda ${(rd * 100).toFixed(1)}%: más de la mitad de los activos se financia con deuda — mayor riesgo financiero (caso Allied Foods: 53.2%).`);
  }
  if (dp != null) {
    out.push(`Deuda/Patrimonio ${dp.toFixed(2)}x: relación entre financiamiento de terceros y capital propio.`);
  }
  if (tie != null) {
    if (tie >= 5) out.push(`Cobertura de intereses (TIE) ${tie.toFixed(1)}x: el EBIT cubre ~${tie.toFixed(0)} veces los intereses — holgado.`);
    else if (tie >= 2) out.push(`TIE ${tie.toFixed(1)}x: cobertura aceptable aunque reducida.`);
    else out.push(`TIE ${tie.toFixed(1)}x < 2: margen muy ajustado para pagar intereses — riesgo de incumplimiento.`);
  }
  return out;
}

function interpretarRentabilidad(r: RazonesPeriodo): string[] {
  const out: string[] = [];
  const m = r.rentabilidad.margenUtilidad;
  const bep = r.rentabilidad.bep;
  const roa = r.rentabilidad.roa;
  const roe = r.rentabilidad.roe;
  if (m != null) out.push(`Margen de utilidad ${(m * 100).toFixed(1)}%: utilidad neta sobre cada $1 de ventas.`);
  if (bep != null) out.push(`BEP ${(bep * 100).toFixed(1)}%: poder de generación básica del activo, sin efecto de impuestos ni apalancamiento.`);
  if (roa != null) out.push(`ROA ${(roa * 100).toFixed(1)}%: rendimiento de cada $1 invertido en activo total.`);
  if (roe != null) {
    if (roe * 100 >= 20) out.push(`ROE ${(roe * 100).toFixed(1)}%: rendimiento elevado sobre el capital contable (caso Allied Foods: 14.7%).`);
    else if (roe * 100 > 0) out.push(`ROE ${(roe * 100).toFixed(1)}%: rendimiento positivo sobre el capital contable.`);
    else out.push(`ROE ${(roe * 100).toFixed(1)}%: el capital contable está destruyendo valor.`);
  }
  return out;
}

function interpretarMercado(r: RazonesPeriodo): string[] {
  const out: string[] = [];
  const pe = r.mercado.pe;
  const pb = r.mercado.priceToBook;
  if (pe != null) {
    if (pe <= 15) out.push(`P/U ${pe.toFixed(1)}x: precio accesible frente a utilidades — posible subvaluación.`);
    else if (pe <= 25) out.push(`P/U ${pe.toFixed(1)}x: dentro del rango histórico típico.`);
    else out.push(`P/U ${pe.toFixed(1)}x: valoración exigente frente a utilidades.`);
  }
  if (pb != null) {
    if (pb < 1) out.push(`P/VL ${pb.toFixed(2)}x < 1: la acción cotiza por debajo de su valor en libros.`);
    else out.push(`P/VL ${pb.toFixed(2)}x: la prima sobre el valor en libros refleja expectativas de crecimiento.`);
  }
  return out;
}

function interpretarDuPont(r: RazonesPeriodo): string[] {
  const d = r.dupont;
  if (d.roeDupont == null) return ["DuPont N/D — datos insuficientes."];
  const partes: string[] = [];
  if (d.margenNeto != null) partes.push(`margen neto ${(d.margenNeto * 100).toFixed(1)}%`);
  if (d.rotacionActivos != null) partes.push(`rotación ${d.rotacionActivos.toFixed(2)}x`);
  if (d.multiplicadorPatrimonio != null) partes.push(`multiplicador ${d.multiplicadorPatrimonio.toFixed(2)}x`);
  return [
    `ROE DuPont = ${partes.join(" × ")} = ${d.roeDupont.toFixed(1)}%.`,
    d.roaDupont != null
      ? `ROA DuPont = ${d.margenNeto != null ? (d.margenNeto * 100).toFixed(1) + "%" : "N/D"} × ${d.rotacionActivos != null ? d.rotacionActivos.toFixed(2) + "x" : "N/D"} = ${d.roaDupont.toFixed(1)}%.`
      : "ROA DuPont N/D.",
  ];
}

//  Ajuste por inflación (Fowler Newton / Biondi — moneda homogénea)
// Convierte valores corrientes a moneda constante usando factor IPC.
// factor = IPC_hoy / IPC_periodo  (>1 si hubo inflación). Para ARS, usar inflación oficial de ArgentinaDatos;
// para USD, factor 1. Se aplica solo a magnitudes monetarias, no a ratios.
export interface IndiceInflacion { fecha: string; indice: number }

export function factorInflacionario(fechaPeriodo: string, serieIPC: IndiceInflacion[], fechaHoy?: string): number | null {
  if (!serieIPC.length) return null;
  const dPeriodo = new Date(fechaPeriodo).toISOString().slice(0, 10);
  const dHoy = fechaHoy ? new Date(fechaHoy).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const ipcPeriodo = serieIPC.find((x) => x.fecha.slice(0, 10) === dPeriodo)?.indice
    ?? serieIPC.filter((x) => x.fecha <= dPeriodo).slice(-1)[0]?.indice;
  const ipcHoy = serieIPC.find((x) => x.fecha.slice(0, 10) === dHoy)?.indice
    ?? serieIPC.slice(-1)[0]?.indice;
  if (ipcPeriodo == null || ipcHoy == null || ipcPeriodo <= 0) return null;
  return ipcHoy / ipcPeriodo;
}

export function ajustarPeriodoPorInflacion(
  p: PeriodoHistoricoRow,
  factor: number,
): PeriodoHistoricoRow {
  if (!isFinite(factor) || factor <= 0) return p;
  const moneyFields: Array<keyof PeriodoHistoricoRow> = [
    "revenue","netIncome","totalAssets","totalLiabilities","totalEquity","currentAssets","currentLiabilities","inventory","netReceivables","netFixedAssets","cash","totalDebt","cashFromOps","capex","fcf",
  ];
  const q: PeriodoHistoricoRow = { ...p };
  for (const k of moneyFields) {
    const v = (p as any)[k];
    if (typeof v === "number" && isFinite(v)) (q as any)[k] = v * factor;
  }
  return q;
}

export function calcularRazonesReales(
  result: FundamentalAFResult,
  historico: PeriodoHistoricoRow[],
  serieIPC: IndiceInflacion[],
): { nominal: RazonesFinancierasResult; real: RazonesFinancierasResult | null; factorUsado: number | null } {
  const nominal = calcularRazonesFinancieras(result, historico);
  if (!serieIPC.length || !historico.length) return { nominal, real: null, factorUsado: null };
  const ultimoFecha = historico[0]?.endDate ?? new Date().toISOString().slice(0,10);
  const f = factorInflacionario(ultimoFecha, serieIPC);
  if (f == null || Math.abs(f - 1) < 0.001) return { nominal, real: null, factorUsado: f };
  const historicoReal = historico.map((p) => {
    const fp = factorInflacionario(p.endDate, serieIPC);
    return fp != null ? ajustarPeriodoPorInflacion(p, fp) : p;
  });
  const real = calcularRazonesFinancieras(result, historicoReal);
  return { nominal, real, factorUsado: f };
}

//  Resultado completo 

export function calcularRazonesFinancieras(
  result: FundamentalAFResult,
  historico: PeriodoHistoricoRow[],
): RazonesFinancierasResult {
  const periods = historico.map((p) =>
    calcularRazonesPeriodo(p, {
      currentPrice: result.currentPrice,
      sharesOutstanding: result.sharesOutstanding,
    }),
  );

  const ultimo = periods[0] ?? null;
  const interpretaciones = {
    liquidez: ultimo ? interpretarLiquidez(ultimo) : ["Sin periodos históricos."],
    actividad: ultimo ? interpretarActividad(ultimo) : ["Sin periodos históricos."],
    endeudamiento: ultimo ? interpretarEndeudamiento(ultimo) : ["Sin periodos históricos."],
    rentabilidad: ultimo ? interpretarRentabilidad(ultimo) : ["Sin periodos históricos."],
    mercado: ultimo ? interpretarMercado(ultimo) : ["Sin periodos históricos."],
  };

  const resumen: string[] = [];
  if (ultimo) {
    const roe = ultimo.rentabilidad.roe;
    const roeD = ultimo.dupont.roeDupont;
    resumen.push(`Período ${ultimo.label} (${ultimo.endDate}):`);
    if (roe != null) resumen.push(`• ROE ${(roe * 100).toFixed(1)}% — retorno sobre el capital contable.`);
    if (roeD != null) resumen.push(`• DuPont: ROE descompuesto = ${roeD.toFixed(1)}% (margen × rotación × multiplicador).`);
    if (ultimo.liquidez.razonCirculante != null) resumen.push(`• Razón circulante ${ultimo.liquidez.razonCirculante.toFixed(2)} — posición de corto plazo.`);
    if (ultimo.endeudamiento.razonDeuda != null) resumen.push(`• Razón de deuda ${(ultimo.endeudamiento.razonDeuda * 100).toFixed(1)}% — apalancamiento.`);
    if (ultimo.mercado.pe != null) resumen.push(`• P/U ${ultimo.mercado.pe.toFixed(1)}x — valoración de mercado.`);
  } else {
    resumen.push("Sin datos históricos suficientes.");
  }

  return {
    symbol: result.symbol,
    periods,
    interpretaciones: {
      ...interpretaciones,
      rentabilidad: [...interpretaciones.rentabilidad, ...(ultimo ? interpretarDuPont(ultimo) : [])],
    },
    resumen,
    error: historico.length === 0 ? "No se encontraron estados financieros históricos para este símbolo." : null,
  };
}
