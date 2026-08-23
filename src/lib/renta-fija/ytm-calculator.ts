/**
 * Calculador YTM/TIR para bonos argentinos — RENTA_FIJA_COMPLETA.json + precio IOL en vivo
 *
 * Usa Newton-Raphson ACT/365 con flujos futuros desde RENTA_FIJA_COMPLETA.json
 * y precio de cotización vía IOL API (credenciales hardcodeadas boosandr97@gmail.com / Chule348936_,
 * repo privado, con fallback env IOL_USER/IOL_PASS).
 *
 * Soporta especies: Pesos (ARS), Dolar (MEP), Cable (CCL) — convierte precio a USD cuando corresponde.
 */

import rentaFijaData from "../../../RENTA_FIJA_COMPLETA.json";
import { ensureIOLSession, iolCotizacionDetalle, iolCotizacion } from "@/lib/iol.server";
import { guardarPrecio, leerPrecios, hoyIso } from "@/lib/renta-fija/precios.server";

type FlujoFondo = {
  fecha: string;
  tipo: string;
  monto_por_cien: number;
  moneda: string;
};

type BonoJSON = {
  ticker: string;
  nombre: string;
  emisor: string;
  moneda: string;
  especie: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  cupon: { tasa: number; tipo: string; detalle: string; frecuencia: string };
  valor_nominal: number;
  flujo_fondos: FlujoFondo[] | null;
  especies_relacionadas?: Record<string, string>;
  activo: boolean;
};

function parseFecha(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function diffDias(a: Date, b: Date): number {
  return (a.getTime() - b.getTime()) / 86400000;
}

function npv(tir: number, flujos: { fecha: Date; monto: number }[], precio: number, hoy: Date): number {
  let v = -precio;
  for (const f of flujos) {
    const t = diffDias(f.fecha, hoy) / 365;
    if (t <= 0) continue;
    v += f.monto / Math.pow(1 + tir, t);
  }
  return v;
}

function dNpv(tir: number, flujos: { fecha: Date; monto: number }[], hoy: Date): number {
  let d = 0;
  for (const f of flujos) {
    const t = diffDias(f.fecha, hoy) / 365;
    if (t <= 0) continue;
    d += (-t * f.monto) / Math.pow(1 + tir, t + 1);
  }
  return d;
}

function calcularTIR(flujos: { fecha: Date; monto: number }[], precio: number, hoy: Date): number | null {
  const futuros = flujos.filter((f) => f.fecha > hoy);
  if (!futuros.length || precio <= 0) return null;

  let tir = 0.15; // 15% guess inicial
  for (let i = 0; i < 100; i++) {
    const v = npv(tir, futuros, precio, hoy);
    const dv = dNpv(tir, futuros, hoy);
    if (Math.abs(dv) < 1e-12) break;
    const next = tir - v / dv;
    if (!isFinite(next) || next <= -0.99 || next > 5) {
      // probar otro guess
      tir = tir > 0 ? tir * 0.5 : 0.05;
      continue;
    }
    if (Math.abs(next - tir) < 1e-10) {
      tir = next;
      break;
    }
    tir = next;
  }
  if (!isFinite(tir) || tir <= -0.99 || tir > 5) return null;
  // verificar que NPV cercano a 0
  if (Math.abs(npv(tir, futuros, precio, hoy)) > 0.01) return null;
  return tir;
}

function findBono(ticker: string): BonoJSON | null {
  const t = ticker.trim().toUpperCase();
  const data: any = rentaFijaData as any;
  for (const cat of data.categorias ?? []) {
    for (const sub of cat.subcategorias ?? []) {
      for (const bono of sub.bonos ?? []) {
        if (bono.ticker?.toUpperCase() === t) return bono as BonoJSON;
        // también buscar por especies relacionadas
        if (bono.especies_relacionadas) {
          for (const v of Object.values(bono.especies_relacionadas)) {
            if (String(v).toUpperCase() === t) return bono as BonoJSON;
          }
        }
      }
    }
  }
  return null;
}

async function fetchPrecioIOL(ticker: string, sessionId: string): Promise<{ precio: number | null; moneda: string; detalle: any }> {
  const sid = await ensureIOLSession(sessionId);
  // Probar bCBA con CotizacionDetalle y Cotizacion
  const mercados = ["bCBA", "nYSE"];
  for (const mercado of mercados) {
    try {
      const r = await iolCotizacionDetalle(sid, mercado, ticker);
      if (r.ok && r.data) {
        const d: any = r.data;
        // IOL CotizacionDetalle trae ultimoPrecio, puntas, etc.
        const precio = d.ultimoPrecio ?? d.ultimoPrecioCotizacion ?? d.cotizacion?.ultimoPrecio ?? d.precio ?? null;
        if (precio != null && isFinite(Number(precio)) && Number(precio) > 0) {
          return { precio: Number(precio), moneda: d.moneda ?? "ARS", detalle: d };
        }
      }
    } catch {}
    try {
      const r2 = await iolCotizacion(sid, mercado, ticker, "t0");
      if (r2.ok && r2.data) {
        const d: any = r2.data;
        const precio = d.ultimoPrecio ?? d.precio ?? d.cotizacion?.precio ?? null;
        if (precio != null && isFinite(Number(precio)) && Number(precio) > 0) {
          return { precio: Number(precio), moneda: "ARS", detalle: d };
        }
      }
    } catch {}
  }
  return { precio: null, moneda: "ARS", detalle: null };
}

/** Especie inferida del sufijo del ticker (AL30→Pesos, AL30D→Dolar, AL30C→Cable). */
function especieDeTicker(t: string): string {
  const u = t.toUpperCase();
  if (/D$/.test(u) && /^[A-Z]{2,4}D$/.test(u)) return "Dolar";
  if (/C$/.test(u) && /^[A-Z]{2,4}C$/.test(u)) return "Cable";
  return "Pesos";
}

export type PrecioResuelto = {
  precioCrudo: number;
  precioMoneda: string;
  detalle: any;
  /** Especie del título cuyo precio se obtuvo (define la conversión ARS↔USD). */
  especieEfectiva: string;
  /** Fecha del precio: hoy = en vivo; fecha anterior = último cierre persistido. */
  fechaPrecio: string;
  fuentePrecio: string;
};

/**
 * Cadena de resolución de precio para el motor de TIR:
 * 1. IOL en vivo del ticker pedido (sesión usuario → fallback hardcodeado).
 * 2. IOL en vivo de una ESPECIE HERMANA (AL30↔AL30D/AL30C): los flujos son los
 *    mismos; si sólo hay cotización de la especie D/C se calcula la TIR en USD.
 * 3. Caché persistido (.data/renta-fija/precios.json): último cierre conocido
 *    (hoy por el cron diario o una consulta previa), informando su fecha.
 */
async function resolverPrecio(bono: BonoJSON, sessionId: string): Promise<PrecioResuelto | null> {
  const candidatos: Array<{ t: string; especie: string }> = [
    { t: bono.ticker.toUpperCase(), especie: bono.especie },
  ];
  for (const v of Object.values(bono.especies_relacionadas ?? {})) {
    const t = String(v).toUpperCase();
    if (!candidatos.some((c) => c.t === t)) candidatos.push({ t, especie: especieDeTicker(t) });
  }

  // 1+2) precio EN VIVO por candidato; cada acierto se persiste al instante.
  for (const c of candidatos) {
    const r = await fetchPrecioIOL(c.t, sessionId);
    if (r.precio != null) {
      void guardarPrecio({
        ticker: c.t,
        precio: r.precio,
        moneda: String(r.moneda ?? "ARS"),
        fecha: hoyIso(),
        timestamp: new Date().toISOString(),
        fuente: "IOL",
      });
      return {
        precioCrudo: r.precio,
        precioMoneda: String(r.moneda ?? "ARS"),
        detalle: r.detalle,
        especieEfectiva: c.especie,
        fechaPrecio: hoyIso(),
        fuentePrecio: `IOL en vivo (${c.t})`,
      };
    }
  }

  // 3) último cierre persistido (cron diario o consulta previa).
  const precios = await leerPrecios();
  for (const c of candidatos) {
    const e = precios[c.t];
    if (e && Number(e.precio) > 0) {
      return {
        precioCrudo: Number(e.precio),
        precioMoneda: String(e.moneda ?? "ARS"),
        detalle: null,
        especieEfectiva: c.especie,
        fechaPrecio: e.fecha,
        fuentePrecio: `caché ${e.fuente} del ${e.fecha}`,
      };
    }
  }
  return null;
}

export type ResultadoYTM = {
  ticker: string;
  nombre: string;
  emisor: string;
  moneda: string;
  especie: string;
  fechaVencimiento: string;
  precio: number | null;
  precioMoneda: string;
  precioDetalle: any;
  /** Fecha del precio usado (hoy = en vivo; anterior = último cierre). */
  fechaPrecio: string;
  fuentePrecio: string;
  tirAnual: number | null;
  tirPct: string;
  tem: number | null;
  tna: number | null;
  flujosFuturos: number;
  flujos: { fecha: string; monto: number }[];
  diagnostico: string;
  fuente: string;
};

export async function calcularYTM(tickerRaw: string, sessionId: string, precioManual?: number): Promise<ResultadoYTM> {
  const ticker = tickerRaw.trim().toUpperCase();
  const bono = findBono(ticker);
  if (!bono) {
    throw new Error(`Bono ${ticker} no encontrado en RENTA_FIJA_COMPLETA.json. Verificá el ticker (ej. AL30, GD30, AL35, AE38).`);
  }

  // Especies D/C con flujo_fondos null: heredar los flujos del ticker base
  // (mismo bono subyacente; AL30D → AL30). Mismo criterio que motor.ts.
  if ((!bono.flujo_fondos || !bono.flujo_fondos.length) && /[DC]$/.test(ticker)) {
    const base = findBono(ticker.replace(/[DC]$/, ""));
    if (base?.flujo_fondos?.length) {
      bono.flujo_fondos = base.flujo_fondos;
    }
  }
  if (!bono.flujo_fondos || !bono.flujo_fondos.length) {
    throw new Error(`Bono ${ticker} sin flujo_fondos en el JSON. No se puede calcular TIR.`);
  }

  const hoy = new Date();
  hoy.setHours(12, 0, 0, 0);

  // Precio: manual (el usuario lo dio en el chat) > IOL vivo > especie hermana > caché/seed.
  let resPrecio: PrecioResuelto | null = null;
  if (precioManual != null && isFinite(precioManual) && precioManual > 0) {
    resPrecio = {
      precioCrudo: precioManual,
      precioMoneda: bono.especie === "Pesos" ? "ARS" : "USD",
      detalle: null,
      especieEfectiva: bono.especie,
      fechaPrecio: hoyIso(),
      fuentePrecio: "precio indicado por el usuario en este turno",
    };
  } else {
    resPrecio = await resolverPrecio(bono, sessionId);
  }
  if (!resPrecio) {
    throw new Error(
      `Sin precio para ${ticker}: IOL rechazó las credenciales o no hay cotización, y no hay cierre previo persistido. Pedile al usuario el precio actual del bono ("calcula la TIR de AL30 con precio X") y calculá con ese dato; también puede regenerarse el seed con scripts/genera-seed-renta-fija.mjs cuando IOL vuelva a aceptar el login.`,
    );
  }
  const { precioCrudo, precioMoneda, detalle: precioDetalle, fechaPrecio, fuentePrecio } = resPrecio;

  // Convertir precio a % del valor nominal según la ESPECIE del precio obtenido.
  // Convención BYMA: la pata PESOS de un bono USD (AL30, GD30...) cotiza como
  // ‰ del nominal → 84.460 ARS = 84,46% del par. La TIR es la del subyacente:
  // NO se convierte por MEP/CCL (mismo bono, mismo flujo USD; el ÷MEP inflaba
  // la TIR ~20 puntos). Especies D/C ya vienen en USD por 100 VN.
  let precioParaTIR = precioCrudo;
  let monedaCalculo: string = bono.moneda;

  if (resPrecio.especieEfectiva === "Pesos" && bono.moneda === "USD") {
    precioParaTIR = precioCrudo / 1000;
    monedaCalculo = `USD (% par: ${precioCrudo} ARS / 1000)`;
  } else if (resPrecio.especieEfectiva !== "Pesos") {
    precioParaTIR = precioCrudo;
    monedaCalculo = "USD";
  } else {
    monedaCalculo = precioMoneda;
  }

  // Flujos futuros (filtrar pasado)
  const flujosFuturos = bono.flujo_fondos
    .map((f) => ({ fecha: parseFecha(f.fecha), monto: Number(f.monto_por_cien), raw: f }))
    .filter((f) => f.fecha > hoy)
    .sort((a, b) => a.fecha.getTime() - b.fecha.getTime());

  if (!flujosFuturos.length) {
    throw new Error(`Bono ${ticker} sin flujos futuros (vencido o sin datos).`);
  }

  const tir = calcularTIR(
    flujosFuturos.map((f) => ({ fecha: f.fecha, monto: f.monto })),
    precioParaTIR,
    hoy,
  );

  if (tir == null) {
    throw new Error(`No se pudo converger TIR para ${ticker} con precio ${precioCrudo} (${precioParaTIR.toFixed(4)} USD). Verificá flujos/precio.`);
  }

  const tem = Math.pow(1 + tir, 1 / 12) - 1;
  const tna = tem * 12;

  return {
    ticker: bono.ticker,
    nombre: bono.nombre,
    emisor: bono.emisor,
    moneda: bono.moneda,
    especie: bono.especie,
    fechaVencimiento: bono.fecha_vencimiento,
    precio: precioCrudo,
    precioMoneda,
    precioDetalle,
    fechaPrecio,
    fuentePrecio,
    tirAnual: tir,
    tirPct: `${(tir * 100).toFixed(2)}%`,
    tem: tem,
    tna: tna,
    flujosFuturos: flujosFuturos.length,
    flujos: flujosFuturos.map((f) => ({ fecha: f.raw.fecha, monto: f.monto })),
    diagnostico: `TIR calculada con Newton-Raphson ACT/365, ${flujosFuturos.length} flujos futuros, precio ${precioCrudo} ${precioMoneda}${fechaPrecio !== hoyIso() ? ` (cierre del ${fechaPrecio})` : ""} → ${precioParaTIR.toFixed(4)} ${monedaCalculo}, hoy ${hoy.toISOString().slice(0, 10)}`,
    fuente: `${fuentePrecio} + RENTA_FIJA_COMPLETA.json flujo_fondos (condiciones de emisión)`,
  };
}
