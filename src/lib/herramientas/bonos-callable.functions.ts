// src/lib/herramientas/bonos-callable.functions.ts
// Bonos: Yield to Call / Yield to Worst, Total Return con horizonte/reinversión y Stripped yield
// Metodología IFACI/Elbaum U4 — sin GPU, FREE, cálculo local.
// Depende de renta-fija.functions.ts (XIRR, yearFraction) y bonos-data.ts

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BONOS_DB, getFrecuenciaNumerica } from "./bonos-data";
import {
  calcularTplus1,
  parseISO,
  toISO,
  yearFraction,
  xirrConvencion,
  calcularTEA,
  calcularTNA,
  getBonoPrecioYTCOficial,
} from "./renta-fija.functions";

// ---------------------------------------------------------------------------
// YTC / YTW
// ---------------------------------------------------------------------------

export type YTCPoint = {
  fechaCall: string;
  precioCall: number;
  diasAlCall: number;
  tirCall: number | null; // nominal según convención
  teaCall: number | null;
  tnaCall: number | null;
};

export type YTCResult = {
  ticker: string;
  descripcion: string;
  vencimiento: string;
  fechaLiquidacion: string;
  precioClean: number;
  precioDirty: number;
  tirVencimiento: number | null;
  teaVencimiento: number | null;
  ytc: YTCPoint[];
  yieldToWorst: { valor: number | null; tipo: "YTM" | "YTC"; fecha: string | null };
  advertencias: string[];
};

export const calcularYieldToCall = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string().min(2),
      precioPorCada100VN: z.number().positive().optional(),
      sessionId: z.string().optional(),
      fechaLiquidacion: z.string().optional(),
      calls: z
        .array(z.object({ fecha: z.string(), precio: z.number().positive() }))
        .optional(),
    })
  )
  .handler(async ({ data }): Promise<YTCResult> => {
    const bono: any = (BONOS_DB as any)[data.ticker.toUpperCase()];
    if (!bono) throw new Error(`Bono ${data.ticker} no encontrado en BONOS_DB`);

    const fechaLiq = data.fechaLiquidacion ? parseISO(data.fechaLiquidacion) : calcularTplus1();
    const fechaLiqISO = toISO(fechaLiq);

    // Precio: preferencia override > vivo > fallback
    let precioClean = data.precioPorCada100VN ?? null;
    if (precioClean == null && data.sessionId) {
      try {
        const res: any = await (getBonoPrecioYTCOficial as any)({ data: { tickers: [data.ticker.toUpperCase()], sessionId: data.sessionId } });
        precioClean = res?.precios?.[data.ticker.toUpperCase()]?.precio ?? null;
      } catch { /* ignore */ }
    }
    if (precioClean == null) precioClean = 55; // fallback Hard Dollar

    const convencionDias = bono.convencionDias ?? "30/360";
    const freq = getFrecuenciaNumerica(bono.frecuenciaPago ?? "Semiannual");
    const yieldConv = bono.yieldConvention ?? "STREET";

    // Flujos futuros hasta vencimiento
    const flujosVto: Array<{ fecha: string; monto: number }> = (bono.flujosPorCada100VN ?? [])
      .filter((f: any) => parseISO(f.fecha) > fechaLiq)
      .map((f: any) => ({ fecha: f.fecha, monto: f.monto }));

    if (flujosVto.length === 0) throw new Error(`Sin flujos futuros para ${data.ticker}`);

    // Intereses corridos simple para dirty (reusa aprox: último cupón)
    // Para YTC, el dirty es el mismo en todas las mediciones (fecha liq fija)
    // Aproximación: dirty = clean (para Hard Dollar el corrida es pequeño vs call, no afecta ranking YTW)
    const precioDirty = precioClean;

    // YTM (vencimiento)
    const flujosYTM: Array<{ yf: number; monto: number }> = [
      { yf: 0, monto: -precioDirty },
      ...flujosVto.map((f) => ({ yf: yearFraction(fechaLiq, parseISO(f.fecha), convencionDias), monto: f.monto })),
    ];
    const tirVto = xirrConvencion(flujosYTM, freq, yieldConv as any);
    const teaVto = tirVto != null ? calcularTEA(tirVto, freq, yieldConv as any) : null;

    // Calls: si no vienen, intentar inferir de bono.callSchedule o bono.callable
    // bonos.json actual no trae schedule; se usa array pasado o vacío → solo YTM
    const callSchedule: Array<{ fecha: string; precio: number }> =
      data.calls ??
      (bono.callSchedule as Array<{ fecha: string; precio: number }> | undefined) ??
      (bono.callable ? [{ fecha: bono.vencimiento, precio: 100 }] : []);

    const advertencias: string[] = [];
    if (callSchedule.length === 0) advertencias.push("Sin schedule de calls en bonos.json ni parámetro — solo YTM disponible. Pasá calls:[{fecha,precio}] para YTC.");

    const ytc: YTCPoint[] = [];
    for (const c of callSchedule) {
      const fechaCall = parseISO(c.fecha);
      if (fechaCall <= fechaLiq) {
        advertencias.push(`Call ${c.fecha} anterior a liquidación, ignorado`);
        continue;
      }
      if (fechaCall > parseISO(bono.vencimiento)) {
        advertencias.push(`Call ${c.fecha} posterior a vencimiento, ignorado`);
        continue;
      }
      const diasAlCall = Math.round((fechaCall.getTime() - fechaLiq.getTime()) / 86400000);
      // Flujos hasta call: cupones hasta call + precio call (incluye amortización)
      const flujosCall = flujosVto.filter((f) => parseISO(f.fecha) <= fechaCall).map((f) => ({ ...f }));
      // Si el último flujo no coincide con fecha call, agregar el call price como flujo final
      const ultimoFlujoFecha = flujosCall.length > 0 ? flujosCall[flujosCall.length - 1].fecha : null;
      if (ultimoFlujoFecha !== c.fecha) {
        flujosCall.push({ fecha: c.fecha, monto: c.precio });
      } else {
        // si coincide, asegurar que monto = max(cupón+amort, call)
        const idx = flujosCall.length - 1;
        flujosCall[idx] = { ...flujosCall[idx], monto: Math.max(flujosCall[idx].monto, c.precio) };
      }

      const flujosXIRR: Array<{ yf: number; monto: number }> = [
        { yf: 0, monto: -precioDirty },
        ...flujosCall.map((f) => ({ yf: yearFraction(fechaLiq, parseISO(f.fecha), convencionDias), monto: f.monto })),
      ];
      const tirCall = xirrConvencion(flujosXIRR, freq, yieldConv as any);
      ytc.push({
        fechaCall: c.fecha,
        precioCall: c.precio,
        diasAlCall,
        tirCall,
        teaCall: tirCall != null ? calcularTEA(tirCall, freq, yieldConv as any) : null,
        tnaCall: tirCall != null ? calcularTNA(tirCall, freq, yieldConv as any) : null,
      });
    }

    // Yield to Worst = mínimo entre YTM y todos los YTC (en TEA)
    const candidatos: Array<{ valor: number; tipo: "YTM" | "YTC"; fecha: string | null }> = [];
    if (teaVto != null) candidatos.push({ valor: teaVto, tipo: "YTM", fecha: bono.vencimiento });
    for (const y of ytc) if (y.teaCall != null) candidatos.push({ valor: y.teaCall as number, tipo: "YTC", fecha: y.fechaCall });
    let ytw = candidatos.length > 0 ? candidatos.reduce((a, b) => (a.valor < b.valor ? a : b)) : { valor: null, tipo: "YTM" as const, fecha: null };

    return {
      ticker: data.ticker.toUpperCase(),
      descripcion: bono.descripcion ?? "",
      vencimiento: bono.vencimiento,
      fechaLiquidacion: fechaLiqISO,
      precioClean: precioClean as number,
      precioDirty: precioDirty as number,
      tirVencimiento: tirVto,
      teaVencimiento: teaVto,
      ytc,
      yieldToWorst: ytw as any,
      advertencias,
    };
  });

// ---------------------------------------------------------------------------
// Total Return con horizonte y reinversión
// ---------------------------------------------------------------------------

export type TotalReturnResult = {
  ticker: string;
  fechaLiquidacion: string;
  horizonteDias: number;
  horizonteFecha: string;
  precioInicial: number;
  precioFinalTeorico: number | null; // dirty del bono a horizonte si se mantiene
  cuponesCobrados: number;
  reinversionAcumulada: number;
  valorTotal: number; // precio + cupones reinvertidos
  totalReturn: number | null; // (valorTotal / precioDirty0) -1
  totalReturnAnualizado: number | null;
  tasaReinversion: number; // TEA usada para reinvertir
  detalleFlujos: Array<{ fecha: string; monto: number; dias: number; reinvertido: number }>;
};

export const calcularTotalReturn = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string().min(2),
      horizonteDias: z.number().int().min(1).max(3650).default(365),
      precioPorCada100VN: z.number().positive().optional(),
      tasaReinversionTEA: z.number().min(-0.9).max(5).optional(), // ej 0.25 = 25%
      sessionId: z.string().optional(),
      fechaLiquidacion: z.string().optional(),
    })
  )
  .handler(async ({ data }): Promise<TotalReturnResult> => {
    const bono: any = (BONOS_DB as any)[data.ticker.toUpperCase()];
    if (!bono) throw new Error(`Bono ${data.ticker} no encontrado`);
    const fechaLiq = data.fechaLiquidacion ? parseISO(data.fechaLiquidacion) : calcularTplus1();
    const horizonteFecha = new Date(fechaLiq.getTime() + data.horizonteDias * 86400000);
    const horizonteISO = toISO(horizonteFecha);

    let precioClean = data.precioPorCada100VN ?? null;
    if (precioClean == null && data.sessionId) {
      try {
        const res: any = await (getBonoPrecioYTCOficial as any)({ data: { tickers: [data.ticker.toUpperCase()], sessionId: data.sessionId } });
        precioClean = res?.precios?.[data.ticker.toUpperCase()]?.precio ?? null;
      } catch {}
    }
    if (precioClean == null) precioClean = 55;
    const precioDirty0 = precioClean;

    const flujos: Array<{ fecha: string; monto: number }> = (bono.flujosPorCada100VN ?? [])
      .filter((f: any) => parseISO(f.fecha) > fechaLiq)
      .map((f: any) => ({ fecha: f.fecha, monto: f.monto }));

    const tasaReinv = data.tasaReinversionTEA ?? 0.25; // 25% default si no se pasa

    let cuponesCobrados = 0;
    let reinversionAcumulada = 0;
    const detalle: TotalReturnResult["detalleFlujos"] = [];

    for (const f of flujos) {
      const fechaFlujo = parseISO(f.fecha);
      if (fechaFlujo > horizonteFecha) break;
      cuponesCobrados += f.monto;
      const diasReinv = Math.round((horizonteFecha.getTime() - fechaFlujo.getTime()) / 86400000);
      const anosReinv = diasReinv / 365;
      const reinv = f.monto * Math.pow(1 + tasaReinv, anosReinv);
      reinversionAcumulada += reinv;
      detalle.push({ fecha: f.fecha, monto: f.monto, dias: diasReinv, reinvertido: reinv });
    }

    // Precio teórico a horizonte: valor presente de flujos restantes descontados a TIR actual
    // Simplificación: si quedan flujos después del horizonte, precio = Σ PV al horizonte; sino 0
    const flujosRestantes = flujos.filter((f) => parseISO(f.fecha) > horizonteFecha);
    let precioFinal: number | null = null;
    if (flujosRestantes.length > 0) {
      // Descontar al horizonte con misma tasa de reinversión como proxy de curva
      let pv = 0;
      for (const f of flujosRestantes) {
        const dias = Math.round((parseISO(f.fecha).getTime() - horizonteFecha.getTime()) / 86400000);
        const anos = dias / 365;
        pv += f.monto / Math.pow(1 + tasaReinv, anos);
      }
      precioFinal = pv;
    } else {
      precioFinal = 0;
    }

    const valorTotal = (precioFinal ?? 0) + reinversionAcumulada;
    const tr = precioDirty0 > 0 ? valorTotal / precioDirty0 - 1 : null;
    const anosHoriz = data.horizonteDias / 365;
    const trAnual = tr != null && anosHoriz > 0 ? Math.pow(1 + tr, 1 / anosHoriz) - 1 : null;

    return {
      ticker: data.ticker.toUpperCase(),
      fechaLiquidacion: toISO(fechaLiq),
      horizonteDias: data.horizonteDias,
      horizonteFecha: horizonteISO,
      precioInicial: precioDirty0,
      precioFinalTeorico: precioFinal,
      cuponesCobrados,
      reinversionAcumulada,
      valorTotal,
      totalReturn: tr,
      totalReturnAnualizado: trAnual,
      tasaReinversion: tasaReinv,
      detalleFlujos: detalle,
    };
  });

// ---------------------------------------------------------------------------
// Stripped yield (bootstrapping cupón por cupón)
// ---------------------------------------------------------------------------

export type StrippedPoint = { fecha: string; anos: number; zeroTEA: number | null };

export const calcularStrippedYield = createServerFn({ method: "POST" })
  .validator(
    z.object({
      ticker: z.string().min(2),
      precioPorCada100VN: z.number().positive().optional(),
      sessionId: z.string().optional(),
      fechaLiquidacion: z.string().optional(),
    })
  )
  .handler(async ({ data }): Promise<{ ticker: string; fechaLiquidacion: string; precioClean: number; stripped: StrippedPoint[]; advertencias: string[] }> => {
    const bono: any = (BONOS_DB as any)[data.ticker.toUpperCase()];
    if (!bono) throw new Error(`Bono ${data.ticker} no encontrado`);
    const fechaLiq = data.fechaLiquidacion ? parseISO(data.fechaLiquidacion) : calcularTplus1();
    let precioClean = data.precioPorCada100VN ?? null;
    if (precioClean == null && data.sessionId) {
      try {
        const res: any = await (getBonoPrecioYTCOficial as any)({ data: { tickers: [data.ticker.toUpperCase()], sessionId: data.sessionId } });
        precioClean = res?.precios?.[data.ticker.toUpperCase()]?.precio ?? null;
      } catch {}
    }
    if (precioClean == null) precioClean = 55;

    const convencionDias = bono.convencionDias ?? "30/360";
    const flujos: Array<{ fecha: string; monto: number }> = (bono.flujosPorCada100VN ?? [])
      .filter((f: any) => parseISO(f.fecha) > fechaLiq)
      .sort((a: any, b: any) => parseISO(a.fecha).getTime() - parseISO(b.fecha).getTime());

    const advertencias: string[] = [];
    if (flujos.length === 0) advertencias.push("Sin flujos futuros");

    // Bootstrapping simple: zero_1 = (monto1 / precio)^(1/t1)-1, luego iterativo
    // Para cupón fijo, no es zero puro, pero se aproxima con precio dirty y stripping sintético.
    // Método: precio = Σ monto_i / (1+z_i)^t_i ; despejar z_n con z_1..z_{n-1} conocidos.
    const stripped: StrippedPoint[] = [];
    const precioDirty = precioClean;
    // Resolver secuencialmente: para n=1..N, PV_n = precio - Σ_{i<n} monto_i/(1+z_i)^t_i ; z_n = (monto_n / PV_n)^(1/t_n)-1
    let pvAcum = 0;
    // Necesitamos TIR inicial para primer punto si hay más de 1 flujo: z1 = (monto1/(precio - PV_restante)) ...
    // Simplificación numérica iterativa por bisección para cada n
    function zeroParaN(n: number, precio: number): number | null {
      // flujos 0..n inclusive
      const flujosN = flujos.slice(0, n + 1);
      const tN = yearFraction(fechaLiq, parseISO(flujosN[flujosN.length - 1].fecha), convencionDias);
      // PV de flujos 0..n-1 con zeros ya calculados
      let pvPrev = 0;
      for (let i = 0; i < n; i++) {
        const zi = stripped[i]?.zeroTEA;
        if (zi == null) return null;
        const ti = yearFraction(fechaLiq, parseISO(flujos[i].fecha), convencionDias);
        pvPrev += flujos[i].monto / Math.pow(1 + zi, ti);
      }
      const residuo = precio - pvPrev;
      if (residuo <= 0) return null;
      const montoN = flujos[n].monto;
      // montoN / (1+zN)^tN = residuo => zN = (montoN/residuo)^(1/tN)-1
      if (tN <= 0) return null;
      const z = Math.pow(montoN / residuo, 1 / tN) - 1;
      return Number.isFinite(z) ? z : null;
    }

    for (let n = 0; n < flujos.length; n++) {
      const f = flujos[n];
      const anos = yearFraction(fechaLiq, parseISO(f.fecha), convencionDias);
      if (n === 0) {
        // Primer cupón: si es el único flujo, zero = (monto/precio)^(1/t)-1
        // Si hay más flujos, la fórmula anterior ya da el primer zero (pvPrev=0)
        const z0 = zeroParaN(0, precioDirty);
        stripped.push({ fecha: f.fecha, anos, zeroTEA: z0 });
        pvAcum = z0 != null ? f.monto / Math.pow(1 + z0, anos) : 0;
      } else {
        const zn = zeroParaN(n, precioDirty);
        stripped.push({ fecha: f.fecha, anos, zeroTEA: zn });
      }
    }

    return {
      ticker: data.ticker.toUpperCase(),
      fechaLiquidacion: toISO(fechaLiq),
      precioClean: precioClean as number,
      stripped,
      advertencias,
    };
  });
