// Motor Renta Fija CORONAR — TIR real desde RENTA_FIJA_COMPLETA.json + precio IOL vivo
// Fuente de verdad: RENTA_FIJA_COMPLETA.json (flujo_fondos, cupon, amortizacion)
// Precio: API IOL v2 — credenciales vía env IOL_USER/IOL_PASS (fallback demo). Motor: Newton-Raphson ACT/365.

import rentaFijaData from "@/../RENTA_FIJA_COMPLETA.json";
import { iolLogin, iolCotizacion, iolCotizacionDetalle, type FuenteIOL, FUENTE_IOL } from "@/lib/iol.server";

// Sanitizado: credenciales por env (repo privado pero evita hardcode en código)
const IOL_USER_HARDCODED = process.env.IOL_USER ?? "demo";
const IOL_PASS_HARDCODED = process.env.IOL_PASS ?? "demo";
const IOL_SESSION_SISTEMA = "renta-fija-sistema";

type FlujoJSON = { fecha: string; tipo: string; monto_por_cien: number; moneda: string };
type BonoJSON = {
  ticker: string;
  nombre: string;
  emisor: string;
  moneda: string;
  tipo: string;
  subtipo: string;
  ley: string;
  especie: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  plazo: string;
  cupon: { tasa: number; tipo: string; detalle: string; frecuencia: string; dias_cupon: number; convencion: string };
  valor_nominal: number;
  amortizacion: string;
  mercado: string;
  activo: boolean;
  calculo: { tir_metodo: string; tipo_tir: string };
  flujo_fondos: FlujoJSON[] | null;
};

function parseFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}
function diffDias(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 86400000;
}

function buscarBono(ticker: string): BonoJSON | null {
  const t = ticker.trim().toUpperCase();
  const data: any = rentaFijaData as any;
  for (const cat of data.categorias ?? []) {
    for (const sub of cat.subcategorias ?? []) {
      for (const b of sub.bonos ?? []) {
        if (String(b.ticker).toUpperCase() === t) return b as BonoJSON;
        // también buscar por especies_relacionadas
        const rel = (b as any).especies_relacionadas ?? {};
        for (const v of Object.values(rel)) if (String(v).toUpperCase() === t) return b as BonoJSON;
      }
    }
  }
  return null;
}

async function asegurarSesionIOL(): Promise<boolean> {
  // iolLogin es idempotente y cachea token por sessionId
  const r = await iolLogin(IOL_SESSION_SISTEMA, IOL_USER_HARDCODED, IOL_PASS_HARDCODED);
  return r.ok;
}

async function fetchPrecioIOL(ticker: string, mercado = "bCBA"): Promise<{ precio: number | null; monedaPrecio: string; detalle: any; fuente: string }> {
  const ok = await asegurarSesionIOL();
  if (!ok) return { precio: null, monedaPrecio: "ARS", detalle: null, fuente: "IOL login falló" };
  // Intentar Cotizacion (mas liviano) y luego CotizacionDetalle
  let precio: number | null = null;
  let detalle: any = null;
  try {
    const r = await iolCotizacion(IOL_SESSION_SISTEMA, mercado, ticker, "t0");
    if (r.ok && r.data) {
      detalle = r.data;
      const d: any = r.data;
      precio = d.ultimoPrecio ?? d.ultima?.precio ?? d.cotizacion?.ultimoPrecio ?? d.precio ?? d.last ?? null;
      if (precio == null && typeof d.ultimoPrecio === "string") precio = parseFloat(d.ultimoPrecio);
      // Algunos endpoints devuelven { ultimoPrecio: 65000, moneda: "peso_Argentino" }
      if (precio != null) precio = Number(precio);
    }
  } catch {}
  if (precio == null) {
    try {
      const r2 = await iolCotizacionDetalle(IOL_SESSION_SISTEMA, mercado, ticker);
      if (r2.ok && r2.data) {
        detalle = r2.data;
        const d: any = r2.data;
        precio = d.ultimoPrecio ?? d.cotizacion?.ultimoPrecio ?? d.precio ?? null;
        if (precio != null) precio = Number(precio);
      }
    } catch {}
  }
  return { precio: precio != null && isFinite(precio) ? precio : null, monedaPrecio: "ARS", detalle, fuente: "IOL bCBA" };
}

async function fetchDolarCCL(): Promise<number | null> {
  try {
    const r = await fetch("https://api.argentinadatos.com/v1/cotizaciones/dolares/ccl", { cache: "no-store" } as any);
    if (r.ok) {
      const d: any = await r.json();
      // argentinadatos ccl puede ser { compra, venta } o array
      if (Array.isArray(d) && d.length) return Number(d[d.length - 1]?.venta ?? d[0]?.venta);
      if (d?.venta) return Number(d.venta);
    }
  } catch {}
  // fallback via CriptoYa CCL
  try {
    const r = await fetch("https://criptoya.com/api/dolar", { cache: "no-store" } as any);
    if (r.ok) {
      const d: any = await r.json();
      const ccl = d?.ccl?.price ?? d?.ccl?.venta ?? d?.ccl?.ask;
      if (ccl) return Number(ccl);
    }
  } catch {}
  return null;
}

// Newton-Raphson para TIR con precio dirty
function npv(tir: number, flujos: { dias: number; monto: number }[]): number {
  let s = 0;
  for (const f of flujos) s += f.monto / Math.pow(1 + tir, f.dias / 365);
  return s;
}
function tirNewtonRaphson(precioDirty: number, flujosFuturos: { fecha: Date; monto: number }[], fechaValuacion: Date): number | null {
  if (!flujosFuturos.length) return null;
  const flujos = flujosFuturos.map((f) => ({ dias: diffDias(f.fecha, fechaValuacion), monto: f.monto }));
  // precio dirty como flujo negativo en t=0
  const allFlujos = [{ dias: 0, monto: -precioDirty }, ...flujos];
  let tir = 0.15; // 15% guess
  for (let i = 0; i < 1000; i++) {
    const v = npv(tir, allFlujos);
    const h = 1e-7;
    const dv = (npv(tir + h, allFlujos) - v) / h;
    if (Math.abs(dv) < 1e-12) break;
    const next = tir - v / dv;
    if (Math.abs(next - tir) < 1e-10) {
      tir = next;
      break;
    }
    tir = next;
    if (!isFinite(tir) || tir <= -0.999 || tir > 10) return null;
  }
  const vFinal = npv(tir, allFlujos);
  if (Math.abs(vFinal) > 1e-4) {
    // No converge bien; intentar con guess diferente
    return null;
  }
  return tir;
}

export type ResultadoTIR = {
  ticker: string;
  nombre: string;
  emisor: string;
  moneda: string;
  tipo: string;
  subtipo: string;
  especie: string;
  fechaValuacion: string;
  precio: { valor: number; moneda: string; fuente: string; detalle: any };
  precioUSD?: number | null;
  ccl?: number | null;
  tirAnual: number | null;
  tirPct: string;
  tem: number | null;
  temPct: string;
  tna: number | null;
  tnaPct: string;
  flujosConsiderados: Array<{ fecha: string; monto: number; dias: number }>;
  flujosTotales: number;
  vn: number;
  tipoTIR: string;
  error?: string;
  fuentes: FuenteIOL[];
};

export async function calcularTIRReal(tickerRaw: string, precioManual?: number): Promise<ResultadoTIR> {
  const ticker = tickerRaw.trim().toUpperCase();
  const bono = buscarBono(ticker);
  if (!bono) {
    throw new Error(`Bono ${ticker} no encontrado en RENTA_FIJA_COMPLETA.json`);
  }
  if (!bono.flujo_fondos || !bono.flujo_fondos.length) {
    // Algunos D/C no tienen flujo duplicado, usar el base
    const baseTicker = ticker.replace(/D$|C$/i, "");
    const base = buscarBono(baseTicker);
    if (base?.flujo_fondos?.length) {
      bono.flujo_fondos = base.flujo_fondos;
    } else {
      throw new Error(`Bono ${ticker} sin flujo_fondos en JSON`);
    }
  }

  const fechaValuacion = new Date();
  fechaValuacion.setUTCHours(12, 0, 0, 0);
  const fechaValStr = fechaValuacion.toISOString().slice(0, 10);

  // Precio
  let precioInfo: { precio: number | null; monedaPrecio: string; detalle: any; fuente: string } | null = null;
  let precio: number | null = precioManual ?? null;
  let fuentePrecio = precioManual != null ? "manual" : "";
  let detallePrecio: any = null;
  let ccl: number | null = null;
  let precioUSD: number | null = null;

  if (precio == null) {
    // Mercado por defecto bCBA para BYMA, pero IOL usa bCBA
    const mercado = bono.mercado === "MAE" ? "bCBA" : "bCBA";
    precioInfo = await fetchPrecioIOL(bono.ticker, mercado);
    precio = precioInfo.precio;
    fuentePrecio = precioInfo.fuente;
    detallePrecio = precioInfo.detalle;
    if (precio == null) {
      throw new Error(`No se pudo obtener precio IOL para ${ticker} (mercado ${mercado}). Detalle: ${JSON.stringify(detallePrecio)?.slice(0, 300)}`);
    }
  } else {
    fuentePrecio = "manual/IOL";
  }

  // Para hard dollar en especie Pesos: la cotización ARS es ‰ del nominal USD
  // (84.460 → 84,46% del par). La TIR es la del subyacente USD; NO se divide
  // por CCL/MEP (mismo bono, mismo flujo — el ÷CCL inflaba la TIR ~20 puntos).
  const esHardDollar = /Hard Dollar|Bonar|Global|Bonte.*Dollar/i.test(`${bono.tipo} ${bono.subtipo} ${bono.tipo}`) || bono.moneda === "USD";
  if (esHardDollar && bono.especie === "Pesos" && precio != null) {
    precioUSD = precio / 1000;
    ccl = null;
  } else if (bono.especie === "Dolar" || bono.especie === "Cable") {
    precioUSD = precio;
  }

  const precioParaTIR = esHardDollar ? (precioUSD ?? precio) : precio;
  if (precioParaTIR == null || !isFinite(precioParaTIR)) {
    throw new Error(`Precio para TIR inválido para ${ticker}: ${precioParaTIR}`);
  }

  // Flujos futuros
  const flujosFuturos: Array<{ fecha: Date; monto: number }> = [];
  const flujosConsiderados: Array<{ fecha: string; monto: number; dias: number }> = [];
  for (const f of bono.flujo_fondos!) {
    const fecha = parseFecha(f.fecha);
    if (fecha <= fechaValuacion) continue;
    const monto = Number(f.monto_por_cien);
    if (!isFinite(monto)) continue;
    flujosFuturos.push({ fecha, monto });
    flujosConsiderados.push({ fecha: f.fecha, monto, dias: Math.round(diffDias(fecha, fechaValuacion)) });
  }

  if (!flujosFuturos.length) {
    throw new Error(`Sin flujos futuros para ${ticker} a ${fechaValStr} (vencimiento ${bono.fecha_vencimiento})`);
  }

  const tir = tirNewtonRaphson(precioParaTIR, flujosFuturos, fechaValuacion);
  if (tir == null || !isFinite(tir)) {
    throw new Error(`TIR no converge para ${ticker} con precio ${precioParaTIR.toFixed(2)} y ${flujosFuturos.length} flujos`);
  }

  const tem = Math.pow(1 + tir, 1 / 12) - 1;
  const tna = tem * 12;

  return {
    ticker: bono.ticker,
    nombre: bono.nombre,
    emisor: bono.emisor,
    moneda: bono.moneda,
    tipo: bono.tipo,
    subtipo: bono.subtipo,
    especie: bono.especie,
    fechaValuacion: fechaValStr,
    precio: { valor: precio, moneda: precioInfo?.monedaPrecio ?? (esHardDollar && bono.especie === "Pesos" ? "ARS" : bono.moneda), fuente: fuentePrecio, detalle: detallePrecio },
    precioUSD: precioUSD,
    ccl,
    tirAnual: tir,
    tirPct: `${(tir * 100).toFixed(2)}%`,
    tem,
    temPct: `${(tem * 100).toFixed(2)}%`,
    tna,
    tnaPct: `${(tna * 100).toFixed(2)}%`,
    flujosConsiderados,
    flujosTotales: flujosConsiderados.reduce((s, f) => s + f.monto, 0),
    vn: bono.valor_nominal,
    tipoTIR: bono.calculo.tipo_tir,
    fuentes: [FUENTE_IOL],
  };
}
