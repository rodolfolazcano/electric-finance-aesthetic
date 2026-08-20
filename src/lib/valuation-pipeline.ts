/** Pipeline completo de valoración: Paper → Datos reales → Cálculo → Presentación.
 *
 *  Orquesta `paper-reader` (metodología), `market-data` (Yahoo Finance) y
 *  `dcf-engine` (cálculo). Genera un análisis con fuentes, supuestos,
 *  limitaciones y trazabilidad. Es educativo: NO es recomendación de inversión. */

import { leerPaper, type PaperMetodologia, type Supuesto } from "./paper-reader";
import {
  obtenerCrecimientoAnalistas,
  obtenerFundamentales,
  obtenerTasaLibreRiesgo,
  resolverSimbolo,
  type Fundamentales,
} from "./market-data";
import { calcularDCF, calcularWACC, type ResultadoValuacion } from "./dcf-engine";

export interface FuenteAnalisis {
  tipo: "paper" | "mercado" | "estimacion";
  descripcion: string;
  url?: string;
  archivo?: string | null;
}

export interface SupuestoUsado {
  variable: string;
  valor: string | number;
  fuente: string;
  descripcion?: string;
}

export interface AnalisisCompleto {
  ok: boolean;
  error?: string;
  simbolo: string;
  simboloResuelto: string;
  empresa: string | null;
  precioActual: number | null;
  moneda: string | null;
  fechaDatos: string;
  valorPorAccion: number | null;
  upsidePct: number | null;
  recomendacion: string | null;
  metodologia: PaperMetodologia;
  supuestos: SupuestoUsado[];
  fuentes: FuenteAnalisis[];
  limitaciones: string[];
  trazabilidad: string[];
  detalle: ResultadoValuacion | null;
  consensoAnalistas: number | null;
  upsideAnalistasPct: number | null;
}

const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function pct(v: number): number {
  return Math.round(v * 1000) / 10;
}

function recomendacionDeUpside(upside: number): string {
  if (upside >= 5) return "Infravalorada (potencial alcista)";
  if (upside <= -5) return "Sobrevalorada (potencial bajista)";
  return "En línea con su valor estimado";
}

function limiteSupuesto(v: string | number | null | undefined): string {
  return typeof v === "number" ? nf2.format(v) : String(v ?? "s/d");
}

/** Ejecuta el análisis completo para un símbolo y una metodología del paper. */
export async function analisisValorIntrinseco(
  simbolo: string,
  temaPaper = "DCF Flujo de Caja Descontado",
): Promise<AnalisisCompleto> {
  const traza: string[] = [];
  const fuentes: FuenteAnalisis[] = [];
  const simboloConsulta = (simbolo ?? "").trim();
  const fechaDatos = new Intl.DateTimeFormat("es-AR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const base: AnalisisCompleto = {
    ok: false,
    simbolo: simboloConsulta,
    simboloResuelto: simboloConsulta,
    empresa: null,
    precioActual: null,
    moneda: null,
    fechaDatos,
    valorPorAccion: null,
    upsidePct: null,
    recomendacion: null,
    metodologia: {
      tema: temaPaper,
      nombre: "",
      id: "",
      categoria: "",
      archivo: null,
      rutaAbsoluta: null,
      textoExtraido: "",
      extraidoCompleto: false,
      resumen: "",
      formulas: [],
      supuestos: [],
      variablesRequeridas: [],
      encontrado: false,
    },
    supuestos: [],
    fuentes,
    limitaciones: [],
    trazabilidad: traza,
    detalle: null,
    consensoAnalistas: null,
    upsideAnalistasPct: null,
  };

  if (!simboloConsulta) {
    return { ...base, error: "No recibí un símbolo para analizar." };
  }

  // 1) Paper: metodología.
  traza.push(`[paper] leyendo metodología para "${temaPaper}"`);
  let paper: PaperMetodologia;
  try {
    paper = await leerPaper(temaPaper);
  } catch (e) {
    paper = {
      ...base.metodologia,
      resumen: "Fallo al leer el paper; se usa metodología DCF estándar.",
    };
  }
  if (paper.encontrado) {
    traza.push(
      `[paper] encontrado: ${paper.id}${paper.archivo ? ` (${paper.archivo})` : ""} — ${paper.nombre}`,
    );
  } else {
    traza.push("[paper] no se encontró paper específico; se usan supuestos DCF estándar");
  }
  if (paper.formulas.length) {
    traza.push(`[paper] fórmulas detectadas: ${paper.formulas.map((f) => f.nombre).join(", ")}`);
  }
  fuentes.push({
    tipo: "paper",
    descripcion: `Paper: ${paper.nombre}${paper.id ? ` (${paper.id})` : ""}`,
    archivo: paper.archivo,
    ...(paper.rutaAbsoluta ? { url: paper.rutaAbsoluta } : {}),
  });

  // 2) Símbolo → ticker de Yahoo.
  traza.push(`[mercado] resolviendo símbolo "${simboloConsulta}"`);
  let resuelto: string | null = null;
  try {
    resuelto = await resolverSimbolo(simboloConsulta);
  } catch {
    resuelto = null;
  }
  const simboloResuelto = resuelto ?? simboloConsulta.toUpperCase();
  traza.push(`[mercado] símbolo resuelto: ${simboloResuelto}`);
  if (!resuelto) {
    traza.push("[mercado] sin resultado de resolución; se usa el símbolo tal cual");
  }

  // 3) Datos reales de mercado.
  const [fund, analistas, rf] = await Promise.all([
    obtenerFundamentales(simboloResuelto),
    obtenerCrecimientoAnalistas(simboloResuelto),
    obtenerTasaLibreRiesgo(false).catch(() => ({ tasa: 4.1, fuente: "default", obtenida: false })),
  ]);

  if (fund.error) {
    return {
      ...base,
      simboloResuelto,
      ok: false,
      error: `No pude obtener datos reales de ${simboloResuelto} en Yahoo Finance: ${fund.error}. Probá con el ticker exacto (ej. IBM, GGAL.BA, KO).`,
      trazabilidad: traza,
    };
  }

  const esEmergente = fund.esEmergente === true;
  const rfReal = esEmergente
    ? await obtenerTasaLibreRiesgo(true).catch(() => ({
        tasa: 10.5,
        fuente: "default",
        obtenida: false,
      }))
    : rf;

  traza.push(
    `[mercado] fundamentales: precio=${fund.precio}, FCF=${fund.fcf}, marketCap=${fund.marketCap}, revenueGrowth=${fund.revenueGrowth}, beta=${fund.beta} (${fund.benchmark ?? "s/d"}), deudaNeta=${fund.deudaNeta}, acciones=${fund.accionesCirculacion}`,
  );

  fuentes.push(
    {
      tipo: "mercado",
      descripcion: `Fundamentales (${fund.origen ?? "Yahoo Finance"}): FCF, deuda, caja, beta, acciones y consenso de ${simboloResuelto}`,
    },
    {
      tipo: "mercado",
      descripcion:
        "Precios diarios 3 años del activo y benchmarks (SPY / ^MERV) para beta por regresión",
    },
    {
      tipo: "mercado",
      descripcion: `Tasa libre de riesgo: ${rfReal.fuente} (${rfReal.obtenida ? "dato en vivo" : "default"})`,
    },
  );

  // 4) Supuestos clave.
  const growthHist = [fund.revenueGrowth, fund.earningsGrowth].filter(
    (v): v is number => typeof v === "number" && isFinite(v),
  );
  const growthAnalistas = [analistas.crecimientoActual, analistas.crecimientoAnoProximo].filter(
    (v): v is number => typeof v === "number" && isFinite(v),
  );
  let crecimiento =
    growthHist.length && growthAnalistas.length
      ? (growthHist.reduce((a, b) => a + b, 0) / growthHist.length +
          growthAnalistas.reduce((a, b) => a + b, 0) / growthAnalistas.length) /
        2
      : growthHist.length
        ? growthHist.reduce((a, b) => a + b, 0) / growthHist.length
        : growthAnalistas.length
          ? growthAnalistas.reduce((a, b) => a + b, 0) / growthAnalistas.length
          : esEmergente
            ? 0.06
            : 0.05;
  // growthCorregido sigue siendo fracción; se acota a -15%..50%.
  crecimiento = clamp(crecimiento, -0.15, 0.5);
  // dcf-engine espera crecimiento en %.
  const crecimientoPct = crecimiento * 100;

  const beta = fund.beta ?? 1;
  const mrp = esEmergente ? 6.5 : 5.5;
  const premio = esEmergente ? 1 : 0;
  const t = esEmergente ? 0.35 : 0.21;
  const rd = fund.rd ?? (esEmergente ? 9 : 5);
  const crecimientoTerminal = esEmergente ? 3.5 : 2.5;

  const wacc = calcularWACC({
    beta,
    rf: rfReal.tasa,
    mrp,
    premio,
    tasa_impuestos: t,
    deuda: fund.deudaTotal ?? 0,
    capital: fund.marketCap ?? 0,
    rd,
  });

  const fcf = fund.fcf;
  if (fcf == null || !isFinite(fcf) || fcf <= 0) {
    traza.push("[calculo] sin FCF disponible: no se puede aplicar DCF");
    return {
      ...base,
      simboloResuelto,
      empresa: fund.nombre,
      precioActual: fund.precio,
      moneda: fund.moneda,
      ok: false,
      error:
        "No hay dato de flujo de caja libre (FCF) disponible en Yahoo Finance para aplicar DCF. Probá con otra empresa o metodología.",
      trazabilidad: traza,
      fuentes,
    };
  }

  const deudaNeta = fund.deudaNeta ?? 0;
  const acciones = fund.accionesCirculacion ?? 0;

  const inputs = {
    fcf_actual: fcf,
    crecimiento_anual: crecimientoPct,
    años_proyeccion: 5,
    tasa_descuento: wacc,
    crecimiento_terminal: crecimientoTerminal,
    deuda_neta: deudaNeta,
    acciones_circulacion: acciones,
  };
  traza.push(
    `[calculo] inputs DCF: FCF0=${fcf}, g=${crecimientoPct.toFixed(2)}%, n=5, WACC=${wacc.toFixed(2)}%, gT=${crecimientoTerminal}%, deudaNeta=${deudaNeta}, acciones=${acciones}`,
  );

  const resultado = calcularDCF(inputs);
  if (!resultado.ok) {
    return {
      ...base,
      simboloResuelto,
      empresa: fund.nombre,
      precioActual: fund.precio,
      moneda: fund.moneda,
      ok: false,
      error: `El cálculo DCF no pudo completarse: ${resultado.error}`,
      trazabilidad: traza,
      fuentes,
    };
  }
  traza.push(
    `[calculo] resultado: EV=${resultado.valor_empresa}, valorAcción=${resultado.valor_por_accion}`,
  );

  const precio = fund.precio;
  let upside: number | null = null;
  if (precio && resultado.valor_por_accion != null && precio > 0) {
    upside = pct((resultado.valor_por_accion - precio) / precio);
  }

  const consenso = fund.targetMeanPrice ?? analistas.targetMeanPrice;
  let upsideAnalistas: number | null = null;
  if (precio && consenso && precio > 0) {
    upsideAnalistas = pct((consenso - precio) / precio);
  }

  const supuestosUsados: SupuestoUsado[] = [
    {
      variable: "FCF Año 0",
      valor: fcf,
      fuente: "Yahoo Finance cashflowStatementHistory / financialData",
      descripcion: "Flujo de caja libre de los últimos doce meses.",
    },
    {
      variable: "Crecimiento años 1-5",
      valor: `${nf2.format(crecimientoPct)}%`,
      fuente:
        "Promedio revenueGrowth/earningsGrowth (Yahoo) + estimaciones de analistas (earningsTrend)",
    },
    {
      variable: "Tasa de descuento (WACC)",
      valor: `${nf2.format(wacc)}%`,
      fuente: `CAPM: rf=${rfReal.tasa.toFixed(2)}% (${rfReal.fuente}), beta=${beta.toFixed(2)} (${fund.benchmark ?? "default"}), MRP=${mrp}%${premio ? `, prima país=${premio}%` : ""}, t=${t * 100}%`,
    },
    {
      variable: "Crecimiento terminal (Gordon)",
      valor: `${nf2.format(crecimientoTerminal)}%`,
      fuente: "PIB nominal esperado (US) / emergentes",
    },
    {
      variable: "Deuda neta",
      valor: deudaNeta,
      fuente: "Yahoo Finance balanceSheetHistory",
    },
    {
      variable: "Acciones en circulación",
      valor: acciones,
      fuente: "Yahoo Finance defaultKeyStatistics",
    },
    {
      variable: "Rango de proyección",
      valor: "5 años",
      fuente: "Práctica estándar del paper",
    },
  ];

  // Supuestos del paper que no estén ya cubiertos.
  for (const s of paper.supuestos) {
    if (supuestosUsados.some((u) => u.variable === s.variable)) continue;
    supuestosUsados.push({
      variable: s.variable,
      valor: limiteSupuesto(s.valor),
      fuente: s.fuente || "Paper",
      descripcion: s.descripcion,
    });
  }

  const limitaciones = [
    "Los supuestos de crecimiento se basan en el histórico (Yahoo Finance) y estimaciones de analistas; no en guidance forward de la compañía.",
    "El WACC es muy sensible a beta y al premio de riesgo asumido; pequeños cambios alteran el valor.",
    "El DCF no captura opciones reales, reestructuraciones, M&A ni ventajas estratégicas no contabilizadas.",
    esEmergente
      ? "En mercados emergentes la tasa libre de riesgo y el premio de mercado son estimaciones con alta dispersión; el resultado es orientativo."
      : "La beta calculada vs SPY puede diferir de la beta provista por Yahoo; se eligió la de mejor R².",
    "Es un análisis educativo: la decisión final la toma el inversor junto a su asesor (Agente Productora CNV).",
  ];

  return {
    ...base,
    ok: true,
    simboloResuelto,
    empresa: fund.nombre,
    precioActual: precio,
    moneda: fund.moneda,
    valorPorAccion: resultado.valor_por_accion ?? null,
    upsidePct: upside,
    recomendacion: upside != null ? recomendacionDeUpside(upside) : null,
    metodologia: paper,
    supuestos: supuestosUsados,
    fuentes,
    limitaciones,
    trazabilidad: traza,
    detalle: resultado,
    consensoAnalistas: consenso,
    upsideAnalistasPct: upsideAnalistas,
  };
}

/** Texto legible del análisis para el chat / consola. */
export function textoAnalisis(a: AnalisisCompleto): string {
  if (!a.ok) {
    return [
      `**Análisis de valor intrínseco — ${a.simboloResuelto}**`,
      ``,
      `_${a.error ?? "No se pudo completar el análisis."}_`,
      ``,
      ...(a.trazabilidad.length ? [`Trazabilidad:`, ...a.trazabilidad.map((t) => `- ${t}`)] : []),
      ``,
      `Análisis educativo; no constituye recomendación de inversión.`,
    ].join("\n");
  }
  const s = a.moneda === "ARS" ? "ARS " : "USD ";
  const lineas = [
    `📊 **Análisis Valor Intrínseco — ${a.empresa ?? a.simboloResuelto}**`,
    ``,
    `**Valor calculado:** ${s}${nf2.format(a.valorPorAccion ?? 0)}`,
    `**Precio actual:** ${s}${nf2.format(a.precioActual ?? 0)} (Yahoo Finance, ${a.fechaDatos})`,
    `**Upside estimado:** ${a.upsidePct != null ? (a.upsidePct >= 0 ? "+" : "") + nf1.format(a.upsidePct) + "%" : "s/d"}`,
    `**Recomendación:** ${a.recomendacion ?? "s/d"}`,
    `**Consenso analistas:** ${a.consensoAnalistas ? `${s}${nf2.format(a.consensoAnalistas)}` : "s/d"} (upside ${a.upsideAnalistasPct != null ? (a.upsideAnalistasPct >= 0 ? "+" : "") + nf1.format(a.upsideAnalistasPct) + "%" : "s/d"})`,
    ``,
    `**Metodología:** ${a.metodologia.nombre}${a.metodologia.id ? ` (Paper: ${a.metodologia.id})` : ""}`,
    a.metodologia.resumen ? `> ${a.metodologia.resumen}` : "",
    ``,
    `**Suposiciones clave:**`,
    ...a.supuestos.map(
      (s2) =>
        `- **${s2.variable}:** ${typeof s2.valor === "number" ? nf2.format(s2.valor) : s2.valor} (${s2.fuente})`,
    ),
    ``,
    `**Sensibilidad por tasa de descuento:**`,
    ...(a.detalle?.sensibilidad ?? []).map(
      (x) => `- ${nf1.format(x.tasa)}%: ${x.valor != null ? `${s}${nf2.format(x.valor)}` : "s/d"}`,
    ),
    ``,
    `**Fuentes:**`,
    ...a.fuentes.map((f) => `- ${f.tipo.toUpperCase()}: ${f.descripcion}`),
    ``,
    `**Limitaciones:**`,
    ...a.limitaciones.map((l) => `- ${l}`),
    ``,
    `**Trazabilidad:**`,
    ...a.trazabilidad.map((t) => `- ${t}`),
    ``,
    `Análisis educativo; no constituye recomendación de inversión. La decisión final requiere asesoramiento personalizado (Agente Productora CNV).`,
  ];
  return lineas.join("\n");
}
