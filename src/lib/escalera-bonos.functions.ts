// src/lib/escalera-bonos.functions.ts
// Calculadora de escalera de bonos con datos reales de ArgentinaDatos/BCRA

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export interface TasaDisponible {
  fuente: string;
  nombre: string;
  valor: number; // decimal
  tipo: "badlar" | "badlar30" | "tasaPlazoFijo" | "inflacion";
}

export interface LetraCapitalizable {
  ticker: string;
  vpv: number;
  vencimiento: string;
  dias: number;
  tna: number;
  tea: number;
  tem: number;
  tipo: "lecap";
}

export interface BonoCEREstimado {
  ticker: string;
  descripcion: string;
  vencimiento: string;
  dias: number;
  cuponCER: number;
  tipo: "cer";
}

export interface EscaleraResult {
  tasas: TasaDisponible[];
  lecaps: LetraCapitalizable[];
  bonosCER: BonoCEREstimado[];
  timestamp: string;
}

async function fetchJson(url: string): Promise<any | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export const getEscaleraBonos = createServerFn({ method: "GET" }).handler(
  async (): Promise<EscaleraResult> => {
    const AD = "https://api.argentinadatos.com";
    const tasas: TasaDisponible[] = [];
    const lecaps: LetraCapitalizable[] = [];
    const bonosCER: BonoCEREstimado[] = [];

    // 1. BADLAR (BCRA id=17)
    try {
      const r = await fetchJson("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/17");
      const results = r?.results ?? r;
      if (Array.isArray(results) && results.length) {
        const ultimo = results[results.length - 1];
        const valor = ultimo?.valor ?? null;
        if (typeof valor === "number" && valor > 0) {
          tasas.push({ fuente: "BCRA", nombre: "BADLAR", valor: valor / 100, tipo: "badlar" });
        }
      }
    } catch {
      /* noop */
    }

    // 2. BADLAR 30 días (BCRA id=21)
    try {
      const r = await fetchJson("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/21");
      const results = r?.results ?? r;
      if (Array.isArray(results) && results.length) {
        const ultimo = results[results.length - 1];
        const valor = ultimo?.valor ?? null;
        if (typeof valor === "number" && valor > 0) {
          tasas.push({
            fuente: "BCRA",
            nombre: "BADLAR 30d",
            valor: valor / 100,
            tipo: "badlar30",
          });
        }
      }
    } catch {
      /* noop */
    }

    // 3. Tasa Plazo Fijo (BCRA id=131)
    try {
      const r = await fetchJson("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/131");
      const results = r?.results ?? r;
      if (Array.isArray(results) && results.length) {
        const ultimo = results[results.length - 1];
        const valor = ultimo?.valor ?? null;
        if (typeof valor === "number" && valor > 0) {
          tasas.push({
            fuente: "BCRA",
            nombre: "Plazo Fijo",
            valor: valor / 100,
            tipo: "tasaPlazoFijo",
          });
        }
      }
    } catch {
      /* noop */
    }

    // 4. Inflación mensual (BCRA)
    try {
      const r = await fetchJson(`${AD}/v1/finanzas/indices/inflacion`);
      if (Array.isArray(r) && r.length) {
        const ultimo = r[r.length - 1];
        const valor = ultimo?.valor ?? null;
        if (typeof valor === "number") {
          tasas.push({
            fuente: "BCRA",
            nombre: "Inflación mensual",
            valor: valor / 100,
            tipo: "inflacion",
          });
        }
      }
    } catch {
      /* noop */
    }

    // 5. LECAPs desde ArgentinaDatos
    try {
      const arr = await fetchJson(`${AD}/v1/finanzas/letras`);
      if (Array.isArray(arr)) {
        const hoy = new Date();
        for (const l of arr) {
          const vto = new Date(l.fechaVencimiento);
          const dias = Math.round((vto.getTime() - hoy.getTime()) / 86400000);
          if (dias <= 0) continue;
          const vpv = l.vpv ?? 100;
          let temPct = typeof l.tem === "number" && !isNaN(l.tem) ? l.tem : null;
          if (temPct == null) {
            const sym = String(l.ticker ?? "").toUpperCase();
            const months = sym.startsWith("T") ? 12 : sym.startsWith("S") ? 6 : 6;
            const temDec = Math.pow(vpv / 100, 1 / months) - 1;
            temPct = temDec * 100;
          }
          const temDec = temPct / 100;
          const tna = temDec * 12;
          const tea = Math.pow(1 + temDec, 12) - 1;
          lecaps.push({
            ticker: l.ticker,
            vpv: +vpv.toFixed(2),
            vencimiento: l.fechaVencimiento,
            dias,
            tna: +tna.toFixed(4),
            tea: +tea.toFixed(4),
            tem: +temPct.toFixed(4),
            tipo: "lecap",
          });
        }
      }
    } catch {
      /* noop */
    }

    lecaps.sort((a, b) => a.dias - b.dias);

    // 6. Bonos CER estimados (datos estáticos)
    const cerBonos = [
      { ticker: "TX26", descripcion: "BONO TESORO CER 2026", vencimiento: "2026-09-30" },
      { ticker: "TX28", descripcion: "BONO TESORO CER 2028", vencimiento: "2028-09-30" },
      { ticker: "TX30", descripcion: "BONO TESORO CER 2030", vencimiento: "2030-09-30" },
      { ticker: "TX33", descripcion: "BONO TESORO CER 2033", vencimiento: "2033-09-30" },
      { ticker: "TX35", descripcion: "BONO TESORO CER 2035", vencimiento: "2035-09-30" },
    ];
    const hoy = new Date();
    for (const cb of cerBonos) {
      const vto = new Date(cb.vencimiento);
      const dias = Math.round((vto.getTime() - hoy.getTime()) / 86400000);
      if (dias <= 0) continue;
      bonosCER.push({
        ticker: cb.ticker,
        descripcion: cb.descripcion,
        vencimiento: cb.vencimiento,
        dias,
        cuponCER: 0.01, // cupón estimado 1% trimestral ajustado por CER
        tipo: "cer",
      });
    }

    return { tasas, lecaps, bonosCER, timestamp: new Date().toISOString() };
  },
);

// ============================================================================
// Server function: calcular TIR de un portafolio (escalera)
// ============================================================================

export interface EscalonItem {
  ticker: string;
  tipo: "lecap" | "cer";
  nominal: number;
  vpv?: number;
  tna?: number;
  tea?: number;
  vencimiento?: string;
  dias?: number;
}

export interface FlujoEscalera {
  fecha: string;
  monto: number;
  ticker: string;
  tipo: "capital" | "cupon";
}

export interface TIRResult {
  tirPonderada: number;
  tirPct: string;
  flujos: FlujoEscalera[];
  totalInvertido: number;
  totalRetorno: number;
  rendimientoPct: string;
}

function parseFecha(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function diffDias(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function calcularTIRNewton(
  flujos: { fecha: Date; monto: number }[],
  precio: number,
  fechaHoy: Date,
): number | null {
  const futuros = flujos.filter((f) => f.fecha > fechaHoy);
  if (!futuros.length) return null;

  const fechas: Date[] = [fechaHoy];
  const montos: number[] = [-precio];
  for (const f of futuros) {
    fechas.push(f.fecha);
    montos.push(f.monto);
  }

  let tir = 0.15;
  for (let iter = 0; iter < 200; iter++) {
    let npv = 0,
      dnpv = 0;
    for (let i = 0; i < fechas.length; i++) {
      const dias = diffDias(fechas[i], fechaHoy) / 365;
      if (tir <= -1) return null;
      const factor = Math.pow(1 + tir, dias);
      npv += montos[i] / factor;
      dnpv -= (dias * montos[i]) / (factor * (1 + tir));
    }
    if (Math.abs(dnpv) < 1e-15) break;
    const tirNext = tir - npv / dnpv;
    if (Math.abs(tirNext - tir) < 1e-10) {
      tir = tirNext;
      break;
    }
    tir = tirNext;
    if (tir < -0.999 || tir > 10) return null;
  }
  return Number.isFinite(tir) ? tir : null;
}

export const calcularTIREscalera = createServerFn({ method: "POST" })
  .validator(
    z.object({
      escalones: z.array(
        z.object({
          ticker: z.string(),
          tipo: z.enum(["lecap", "cer"]),
          nominal: z.number(),
          vpv: z.number().optional(),
          tna: z.number().optional(),
          tea: z.number().optional(),
          vencimiento: z.string().optional(),
          dias: z.number().optional(),
        }),
      ),
    }),
  )
  .handler(async ({ data }) => {
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const flujos: FlujoEscalera[] = [];
    let totalInvertido = 0;
    let totalRetorno = 0;
    let tirPonderada = 0;

    for (const esc of data.escalones) {
      const nominal = esc.nominal;
      if (esc.tipo === "lecap" && esc.vpv != null && esc.vencimiento) {
        const precio = esc.vpv;
        const retorno = (nominal / 100) * 100; // al vencimiento cobra nominal
        totalInvertido += (nominal / 100) * precio;
        totalRetorno += retorno;
        flujos.push({
          fecha: esc.vencimiento,
          monto: retorno,
          ticker: esc.ticker,
          tipo: "capital",
        });

        const flujosXIRR = [
          { fecha: hoy, monto: -(nominal / 100) * precio },
          { fecha: parseFecha(esc.vencimiento), monto: retorno },
        ];
        const tir = calcularTIRNewton(flujosXIRR, (nominal / 100) * precio, hoy);
        if (tir != null) tirPonderada += tir * nominal;
      } else if (esc.tipo === "cer" && esc.vencimiento) {
        // CER: estimado, asume VPV=100 y cupones trimestrales CER
        const vto = parseFecha(esc.vencimiento);
        const dias = diffDias(vto, hoy);
        const trimestres = Math.floor(dias / 91);
        const precio = 100;
        totalInvertido += nominal;
        let acumulado = nominal;
        for (let t = 1; t <= trimestres; t++) {
          const fechaCupon = new Date(hoy.getTime() + t * 91 * 86400000);
          const cupon = nominal * 0.01; // 1% estimado
          acumulado += cupon;
          flujos.push({
            fecha: fechaCupon.toISOString().split("T")[0],
            monto: cupon,
            ticker: esc.ticker,
            tipo: "cupon",
          });
        }
        flujos.push({
          fecha: esc.vencimiento,
          monto: nominal,
          ticker: esc.ticker,
          tipo: "capital",
        });
        totalRetorno += acumulado;
        if (esc.tea != null) tirPonderada += esc.tea * nominal;
      }
    }

    const totalNominal = data.escalones.reduce((s, e) => s + e.nominal, 0);
    tirPonderada = totalNominal > 0 ? tirPonderada / totalNominal : 0;

    flujos.sort((a, b) => a.fecha.localeCompare(b.fecha));

    return {
      tirPonderada,
      tirPct: `${(tirPonderada * 100).toFixed(2)}%`,
      flujos,
      totalInvertido: +totalInvertido.toFixed(2),
      totalRetorno: +totalRetorno.toFixed(2),
      rendimientoPct:
        totalInvertido > 0
          ? `${(((totalRetorno - totalInvertido) / totalInvertido) * 100).toFixed(2)}%`
          : "0%",
    } as TIRResult;
  });
