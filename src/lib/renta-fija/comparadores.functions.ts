// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { BONOS_DB, getFrecuenciaNumerica, type YieldConvention } from "@/lib/bonos-data";
import {
  xirrConvencion,
  calcularTEA,
  yearFraction,
  parseISO,
  calcularTplus1,
  toISO,
  diasEntre,
  getBonoPrecioYTCOficial,
  calcularRendimientosBono,
} from "@/lib/renta-fija.functions";
import { fetchUST10Y } from "./ust10y.functions";
import { getCached, setCache } from "@/lib/cache";
import type {
  ComparadorAData,
  ComparadorBData,
  ComparadorCData,
  ComparadorDData,
  ComparadorEData,
  ComparadorFData,
  ComparadorGData,
  FCIComparacionData,
} from "./comparadores.types";

const AD = "https://api.argentinadatos.com";
const IOL = "https://api.invertironline.com";

// 
// HELPERS COMPARTIDOS
// 

function fetchConCache<T>(url: string, cacheKey: string, ttl = 120_000): Promise<T | null> {
  const cached = getCached<T>(cacheKey, ttl);
  if (cached) return Promise.resolve(cached);
  return fetch(url, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data) setCache(cacheKey, data);
      return data as T;
    })
    .catch(() => null);
}

function parseFechaArgs(fechaLiq?: string): string {
  return fechaLiq ?? toISO(calcularTplus1());
}

function buildUST10YSyntheticFlows(fechaLiq: Date, yieldPct: number): Array<{ fecha: string; monto: number }> {
  if (yieldPct <= 0 || yieldPct > 0.5) return [];
  const flows: Array<{ fecha: string; monto: number }> = [];
  const cuponSemestral = yieldPct / 2;
  for (let sem = 1; sem <= 20; sem++) {
    const fecha = new Date(fechaLiq);
    fecha.setMonth(fecha.getMonth() + 6 * sem);
    const esUltimo = sem === 20;
    flows.push({
      fecha: toISO(fecha),
      monto: esUltimo ? (cuponSemestral + 1) * 100 : cuponSemestral * 100,
    });
  }
  return flows;
}

// 
// COMPARADOR A — Hard Dollar vs UST10Y
// 

function generarFlujoMensual(
  fechaLiq: Date,
  flujos: Array<{ fecha: string; monto: number; tipo: string }>,
  periodoMeses: number,
  usTreasury10y: number | null,
): { monthlyFlows: MonthlyFlow[]; totalCupones: number; totalAmort: number; flujoNeto: number } {
  const fechaCorte = new Date(fechaLiq);
  fechaCorte.setMonth(fechaCorte.getMonth() + periodoMeses);

  const meses: Map<string, { bonoCupon: number; bonoAmort: number; usCupon: number }> = new Map();
  for (let m = 0; m < periodoMeses; m++) {
    const d = new Date(fechaLiq);
    d.setMonth(d.getMonth() + m + 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    meses.set(key, { bonoCupon: 0, bonoAmort: 0, usCupon: 0 });
  }

  for (const f of flujos) {
    const fDate = parseISO(f.fecha);
    if (fDate <= fechaLiq || fDate > fechaCorte) continue;
    const key = `${fDate.getFullYear()}-${String(fDate.getMonth() + 1).padStart(2, "0")}`;
    const entry = meses.get(key);
    if (!entry) continue;
    if (f.tipo === "cupon" || f.tipo === "cupon+amortizacion") {
      entry.bonoCupon += f.monto;
    }
    if (f.tipo === "amortizacion" || f.tipo === "cupon+amortizacion") {
      entry.bonoAmort += f.monto;
    }
  }

  if (usTreasury10y != null && usTreasury10y > 0) {
    const cuponSemestralUST = (usTreasury10y / 2) * 100;
    let idx = 0;
    for (const key of meses.keys()) {
      const [y, m] = key.split("-").map(Number);
      // Pago semestral: enero, julio
      if (m === 1 || m === 7) {
        const d = new Date(fechaLiq);
        d.setMonth(d.getMonth() + idx + 1);
        meses.get(key)!.usCupon = cuponSemestralUST;
      }
      idx++;
    }
  }

  const monthlyFlows: MonthlyFlow[] = [];
  let totalCupones = 0, totalAmort = 0;
  for (const [key, v] of meses) {
    const [y, m] = key.split("-").map(Number);
    const total = v.bonoCupon + v.bonoAmort;
    totalCupones += v.bonoCupon;
    totalAmort += v.bonoAmort;
    monthlyFlows.push({
      mes: `${m}/${y}`,
      año: y,
      mesNum: m,
      bonoCupon: v.bonoCupon,
      bonoAmortizacion: v.bonoAmort,
      bonoTotal: total,
      usTreasuryCupon: v.usCupon,
    });
  }

  return { monthlyFlows, totalCupones, totalAmort, flujoNeto: totalCupones + totalAmort };
}

export const comparadorA = createServerFn({ method: "POST" })
  .validator(z.object({
    ticker: z.string().default("GD30"),
    precioPorCada100VN: z.number().positive().optional(),
    sessionId: z.string().optional(),
    refreshToken: z.string().optional(),
    periodoMeses: z.number().default(12),
  }))
  .handler(async ({ data }): Promise<ComparadorAData> => {
    const bono = BONOS_DB[data.ticker];
    const allHardDollar: HardDollarAsset[] = Object.values(BONOS_DB)
      .filter((b) => b.tipo === "Hard Dollar")
      .map((b) => ({
        ticker: b.ticker,
        descripcion: b.descripcion,
        vencimiento: b.vencimiento,
        cuponAnual: b.cuponAnual ?? 0,
        frecuencia: b.frecuenciaPago ?? "Semiannual",
        moneda: b.monedaFlujos ?? "USD",
      }));

    if (!bono) return { ticker: data.ticker, descripcion: "", vencimiento: "", tir: null, tirTEA: null, usTreasury10y: null, spreadBps: null, riesgoPais: null, deltaSpreadRiesgoPais: null, duration: null, usTreasuryDuration: null, cashFlows: [], syntheticUsTreasuryFlows: [], monthlyFlows: [], periodoMeses: data.periodoMeses, totalCuponesPeriodo: 0, totalAmortizacionesPeriodo: 0, flujoNetoPeriodo: 0, hardDollarAssets: allHardDollar, timestamp: new Date().toISOString(), error: "Bono no encontrado en DB" };

    try {
      const [tresoreriaSerie, riesgoPaisData, preciosResult] = await Promise.all([
        fetchUST10Y(),
        // Riesgo país: endpoint devuelve { fecha, valor } (objeto único)
        (async () => {
          try {
            const r = await fetch(`${AD}/v1/finanzas/indices/riesgo-pais/ultimo`, { cache: "no-store" });
            if (r.ok) { const j = await r.json(); return j?.valor ?? null; }
          } catch { /* ignore */ }
          return null;
        })(),
        (async () => {
          try {
            return await getBonoPrecioYTCOficial({ data: { tickers: [data.ticker], sessionId: data.sessionId } });
          } catch { return null; }
        })(),
      ]);

      const ultimoPunto = tresoreriaSerie.length > 0 ? tresoreriaSerie[tresoreriaSerie.length - 1] : null;
      const usTreasury10y = ultimoPunto ? ultimoPunto.yieldPct / 100 : null;
      const riesgoPais = riesgoPaisData as number | null;

      let precio = data.precioPorCada100VN;
      if (!precio && preciosResult?.precios[data.ticker]?.precio) {
        precio = preciosResult.precios[data.ticker].precio!;
      }

      let tir: number | null = null;
      let tirTEA: number | null = null;
      let rendimiento: any = null;

      if (precio && precio > 0) {
        try {
          rendimiento = await calcularRendimientosBono({ data: { ticker: data.ticker, precioPorCada100VN: precio } });
          if (rendimiento && !rendimiento.error) {
            tir = rendimiento.tir ?? null;
            tirTEA = rendimiento.tea ?? null;
          }
        } catch { /* fallback */ }
      }

      if (!tir && precio && precio > 0) {
        const freq = getFrecuenciaNumerica(bono.frecuenciaPago);
        const yieldConv: YieldConvention = (bono.yieldConvention ?? "TRUE");
        const fechaLiq = calcularTplus1();
        const flujos = bono.flujosPorCada100VN
          .filter((f) => parseISO(f.fecha) > fechaLiq)
          .map((f) => ({ yf: yearFraction(fechaLiq, parseISO(f.fecha), bono.convencionDias ?? "30/360"), monto: f.monto }));
        if (flujos.length > 0) {
          const outflow: Array<{ yf: number; monto: number }> = [{ yf: 0, monto: -precio }];
          tir = xirrConvencion([...outflow, ...flujos], freq, yieldConv);
          tirTEA = tir !== null ? calcularTEA(tir, freq, yieldConv) : null;
        }
      }

      const spreadBps = tir !== null && usTreasury10y !== null ? (tir - usTreasury10y) * 10000 : null;
      const deltaSpreadRiesgoPais = spreadBps !== null && riesgoPais !== null ? spreadBps - riesgoPais : null;

      const fechaLiq = calcularTplus1();
      const syntheticUsTreasuryFlows = usTreasury10y !== null ? buildUST10YSyntheticFlows(fechaLiq, usTreasury10y) : [];

      const cashFlows = bono.flujosPorCada100VN.map((f) => ({ fecha: f.fecha, monto: f.monto, tipo: f.tipo, montoUSD: f.monto }));

      const flujosFuturos = bono.flujosPorCada100VN
        .filter((f) => parseISO(f.fecha) > fechaLiq)
        .map((f) => ({ fecha: f.fecha, monto: f.monto, tipo: f.tipo }));

      const { monthlyFlows, totalCupones, totalAmort, flujoNeto } = generarFlujoMensual(fechaLiq, flujosFuturos, data.periodoMeses, usTreasury10y);

      return {
        ticker: data.ticker,
        descripcion: bono.descripcion,
        vencimiento: bono.vencimiento,
        tir,
        tirTEA,
        usTreasury10y,
        spreadBps,
        riesgoPais,
        deltaSpreadRiesgoPais,
        duration: rendimiento?.durationMacaulay ?? null,
        usTreasuryDuration: usTreasury10y !== null ? 8.5 : null,
        cashFlows,
        syntheticUsTreasuryFlows,
        monthlyFlows,
        periodoMeses: data.periodoMeses,
        totalCuponesPeriodo: totalCupones,
        totalAmortizacionesPeriodo: totalAmort,
        flujoNetoPeriodo: flujoNeto,
        hardDollarAssets: allHardDollar,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      return {
        ticker: data.ticker, descripcion: bono.descripcion, vencimiento: bono.vencimiento,
        tir: null, tirTEA: null, usTreasury10y: null, spreadBps: null, riesgoPais: null,
        deltaSpreadRiesgoPais: null, duration: null, usTreasuryDuration: null,
        cashFlows: [], syntheticUsTreasuryFlows: [], monthlyFlows: [],
        periodoMeses: data.periodoMeses, totalCuponesPeriodo: 0, totalAmortizacionesPeriodo: 0, flujoNetoPeriodo: 0,
        hardDollarAssets: allHardDollar,
        timestamp: new Date().toISOString(),
        error: `Error: ${e instanceof Error ? e.message : "desconocido"}`,
      };
    }
  });

// 
// COMPARADOR B — PF vs LECAP vs Inflación
// 
// API response formats:
//   PF: tnaClientes en decimal (0.19 = 19% TNA)
//   LECAP: tem en % (2.4 = 2.4% TEM)
//   Inflación: valor en % (2.1 = 2.1% mensual)

export const comparadorB = createServerFn({ method: "POST" })
  .validator(z.object({ tickerLecap: z.string().default("S17A6") }))
  .handler(async ({ data }): Promise<ComparadorBData> => {
    try {
      const [pfData, lecapData, inflacionData] = await Promise.all([
        fetchConCache<Array<{ entidad: string; tnaClientes: number | null }>>(`${AD}/v1/finanzas/tasas/plazoFijo`, "tasas_pf", 180_000),
        fetchConCache<Array<{ ticker: string; tem: number; vpv: number; fechaVencimiento: string }>>(`${AD}/v1/finanzas/letras`, "lecaps_ad", 120_000),
        fetchConCache<Array<{ fecha: string; valor: number }>>(`${AD}/v1/finanzas/indices/inflacion`, "inflacion_mensual", 300_000),
      ]);

      // Inflación: API devuelve en % (2.1 → 2.1%), convertir a decimal
      const inflacionMensual = inflacionData && inflacionData.length > 0
        ? inflacionData[inflacionData.length - 1].valor / 100
        : null;

      const inflacionInteranualRaw = await fetchConCache<Array<{ fecha: string; valor: number }>>(
        `${AD}/v1/finanzas/indices/inflacionInteranual`,
        "inflacion_interanual",
        300_000,
      );
      const inflacionInteranual = inflacionInteranualRaw && inflacionInteranualRaw.length > 0
        ? inflacionInteranualRaw[inflacionInteranualRaw.length - 1].valor / 100
        : null;

      // PF: API devuelve tnaClientes en decimal (0.19 = 19% TNA)
      let tasaPF_TNA: number | null = null;
      let bancoPF: string | null = null;
      if (pfData && pfData.length > 0) {
        const conTasa = pfData.filter((e) => e.tnaClientes != null && e.tnaClientes > 0);
        if (conTasa.length > 0) {
          tasaPF_TNA = conTasa.reduce((s, e) => s + e.tnaClientes!, 0) / conTasa.length;
          bancoPF = `Promedio ${conTasa.length} bancos`;
        }
      }

      // LECAP: API devuelve tem en % (2.4 = 2.4%), convertir a decimal
      let lecapTEM: number | null = null;
      let lecapTicker: string | null = null;
      if (lecapData && lecapData.length > 0) {
        const target = lecapData.find((l) => l.ticker === data.tickerLecap) ?? lecapData[0];
        lecapTEM = target.tem / 100;
        lecapTicker = target.ticker;
      }

      const horizontes = [30, 60, 90].map((dias) => {
        const inflacionPeriodo = inflacionMensual != null
          ? Math.pow(1 + inflacionMensual, dias / 30) - 1
          : null;
        // PF: tna ya en decimal (0.19), TNA * días/365 = retorno nominal
        const pfNominal = tasaPF_TNA != null ? tasaPF_TNA * (dias / 365) : null;
        // LECAP: tem ya en decimal (0.024), proyectar a días
        const lecapNominal = lecapTEM != null ? Math.pow(1 + lecapTEM, dias / 30) - 1 : null;
        const pfReal = pfNominal != null && inflacionPeriodo != null
          ? (1 + pfNominal) / (1 + inflacionPeriodo) - 1
          : null;
        const lecapReal = lecapNominal != null && inflacionPeriodo != null
          ? (1 + lecapNominal) / (1 + inflacionPeriodo) - 1
          : null;
        return { dias, pfNominal, lecapNominal, pfReal, lecapReal, inflacionProyectadaPeriodo: inflacionPeriodo };
      });

      const pfReal = horizontes.length > 0 ? horizontes[0].pfReal : null;
      const lecapReal = horizontes.length > 0 ? horizontes[0].lecapReal : null;
      const ranking = [
        { instrumento: "LECAP", retornoReal: lecapReal },
        { instrumento: "Plazo Fijo", retornoReal: pfReal },
      ].sort((a, b) => (b.retornoReal ?? -999) - (a.retornoReal ?? -999));

      return {
        bancoPF, tasaPF_TNA, lecapTicker, lecapTEM, inflacionMensual, inflacionInteranual,
        horizontes, ranking, timestamp: new Date().toISOString(),
      };
    } catch (e) {
      return { bancoPF: null, tasaPF_TNA: null, lecapTicker: null, lecapTEM: null, inflacionMensual: null, inflacionInteranual: null, horizontes: [], ranking: [], timestamp: new Date().toISOString(), error: `Error: ${e instanceof Error ? e.message : "desconocido"}` };
    }
  });

// 
// COMPARADOR C — Bono CER vs Inflación (retorno real)
// 
// Busca bonos CER en BONOS_DB + IOL (vía titulos públicos con "CER" en descripción)

export interface CerInstrumento {
  ticker: string;
  descripcion: string;
  fuente: "db" | "iol";
}

export const buscarCERIOL = createServerFn({ method: "POST" })
  .validator(z.object({ sessionId: z.string().optional(), refreshToken: z.string().optional() }))
  .handler(async ({ data }): Promise<CerInstrumento[]> => {
    const dbCER = Object.values(BONOS_DB)
      .filter((b) => b.ajuste === "CER" || b.tipo === "CER")
      .map((b) => ({ ticker: b.ticker, descripcion: b.descripcion, fuente: "db" as const }));

    const iolCER: CerInstrumento[] = [];
    if (data.sessionId) {
      try {
        const r = await fetch(`${IOL}/api/v2/Cotizaciones/titulosPublicos/argentina/Todos`, {
          headers: { Authorization: `Bearer ${data.sessionId}` },
          cache: "no-store",
        });
        if (r.ok) {
          const j = await r.json();
          const titulos: Array<{ simbolo: string; descripcion: string }> = j?.titulos ?? [];
          for (const t of titulos) {
            const desc = (t.descripcion ?? "").toUpperCase();
            const sim = (t.simbolo ?? "").toUpperCase();
            if (desc.includes("CER") || desc.includes("AJUSTABLE") || desc.includes("AJUSTE")) {
              if (!dbCER.some((d) => d.ticker === sim)) {
                iolCER.push({ ticker: sim, descripcion: t.descripcion ?? sim, fuente: "iol" });
              }
            }
          }
        }
      } catch { /* solo DB */ }
    }

    return [...dbCER, ...iolCER];
  });

export const comparadorC = createServerFn({ method: "POST" })
  .validator(z.object({
    ticker: z.string().default("CUJ26"),
    precio: z.number().positive().optional(),
    fechaLiq: z.string().optional(),
    sessionId: z.string().optional(),
  }))
  .handler(async ({ data }): Promise<ComparadorCData> => {
    try {
      const bono = BONOS_DB[data.ticker];
      if (!bono) return { ticker: data.ticker, tirActual: null, inflacionInteranual: null, retornoReal: null, serieHistorica: [], retornoRealAcumulado12m: null, timestamp: new Date().toISOString(), error: "Bono CER no encontrado en DB local. Use el selector con sesión IOL para buscar más bonos CER." };

      const fechaLiq = parseISO(parseFechaArgs(data.fechaLiq));
      const freq = getFrecuenciaNumerica(bono.frecuenciaPago);
      const yieldConv: YieldConvention = "TRUE";

      const precio = data.precio ?? 110;
      const flujos = bono.flujosPorCada100VN.filter((f) => parseISO(f.fecha) > fechaLiq).map((f) => ({ yf: yearFraction(fechaLiq, parseISO(f.fecha), bono.convencionDias ?? "ACT/365"), monto: f.monto }));
      if (flujos.length === 0) return { ticker: data.ticker, tirActual: null, inflacionInteranual: null, retornoReal: null, serieHistorica: [], retornoRealAcumulado12m: null, timestamp: new Date().toISOString(), error: "Sin flujos futuros" };

      const outflow: Array<{ yf: number; monto: number }> = [{ yf: 0, monto: -precio }];
      const tirActual = xirrConvencion([...outflow, ...flujos], freq, yieldConv);

      const inflacionInteranualData = await fetchConCache<Array<{ fecha: string; valor: number }>>(
        `${AD}/v1/finanzas/indices/inflacionInteranual`,
        "inflacion_interanual",
        300_000,
      );
      const inflacionInteranual = inflacionInteranualData && inflacionInteranualData.length > 0
        ? inflacionInteranualData[inflacionInteranualData.length - 1].valor / 100
        : null;

      const retornoReal = tirActual != null && inflacionInteranual != null ? (1 + tirActual) / (1 + inflacionInteranual) - 1 : null;

      let serieHistorica: ComparadorCData["serieHistorica"] = [];
      if (bono.historico && inflacionInteranualData) {
        const inflMap = new Map(inflacionInteranualData.map((e) => [e.fecha, e.valor / 100]));
        serieHistorica = bono.historico.slice(-60).map((h) => {
          const inf = inflMap.get(h.fecha) ?? null;
          return {
            fecha: h.fecha,
            tirCER: h.tirCalculada,
            inflacionInteranual: inf,
            retornoReal: h.tirCalculada != null && inf != null ? (1 + h.tirCalculada) / (1 + inf) - 1 : null,
          };
        });
      }

      const ultimos12 = serieHistorica.slice(-12).filter((s) => s.retornoReal != null);
      const retornoRealAcumulado12m = ultimos12.length > 0
        ? ultimos12.reduce((p, c) => (p + 1) * (1 + (c.retornoReal ?? 0)) - 1, 0)
        : null;

      return { ticker: data.ticker, tirActual, inflacionInteranual, retornoReal, serieHistorica, retornoRealAcumulado12m, timestamp: new Date().toISOString() };
    } catch (e) {
      return { ticker: data.ticker, tirActual: null, inflacionInteranual: null, retornoReal: null, serieHistorica: [], retornoRealAcumulado12m: null, timestamp: new Date().toISOString(), error: `Error: ${e instanceof Error ? e.message : "desconocido"}` };
    }
  });

// 
// COMPARADOR D — CER vs Tasa Fija (breakeven de inflación)
// 

export const comparadorD = createServerFn({ method: "POST" })
  .validator(z.object({ cerTicker: z.string().default("TX26"), tasaFijaTicker: z.string().default("S17L6") }))
  .handler(async ({ data }): Promise<ComparadorDData> => {
    try {
      const cerBono = BONOS_DB[data.cerTicker];
      const tasaFijaBono = BONOS_DB[data.tasaFijaTicker];
      if (!cerBono || !tasaFijaBono) return { cerTicker: data.cerTicker, tasaFijaTicker: data.tasaFijaTicker, tirCER: null, tirTasaFija: null, breakevenInflacion: null, inflacionInteranualActual: null, breakevenTooltip: "", comparacion: null, comparacionTexto: null, serieHistorica: [], diasMatch: 0, timestamp: new Date().toISOString(), error: "Uno o ambos bonos no encontrados" };

      const fechaVtoCER = parseISO(cerBono.vencimiento);
      const fechaVtoTF = parseISO(tasaFijaBono.vencimiento);
      const diasMatch = Math.abs(Math.round(diasEntre(fechaVtoCER, fechaVtoTF)));

      const fechaLiq = calcularTplus1();
      const freqTF = getFrecuenciaNumerica(tasaFijaBono.frecuenciaPago);
      const yieldConvTF: YieldConvention = tasaFijaBono.yieldConvention ?? "TRUE";

      // Para LECAP: TIR directa ≈ TEA (convención TRUE)
      const lecapAD = await fetchConCache<Array<{ ticker: string; tem: number; tea: number; precio: number }>>(
        `${AD}/v1/finanzas/letras`,
        "lecaps_ad_tir",
        120_000,
      );
      const lecapData = lecapAD?.find((l) => l.ticker === data.tasaFijaTicker);
      const tirTasaFija = lecapData?.tea != null ? lecapData.tea / 100 : null;

      const cerPrecio = 110;
      const flujosCER = cerBono.flujosPorCada100VN.filter((f) => parseISO(f.fecha) > fechaLiq).map((f) => ({ yf: yearFraction(fechaLiq, parseISO(f.fecha), cerBono.convencionDias ?? "ACT/365"), monto: f.monto }));
      const outflowCER: Array<{ yf: number; monto: number }> = [{ yf: 0, monto: -cerPrecio }];
      const tirCER = xirrConvencion([...outflowCER, ...flujosCER], 1, "TRUE");

      const breakevenInflacion = tirCER != null && tirTasaFija != null ? tirTasaFija - tirCER : null;

      const inflacionData = await fetchConCache<Array<{ fecha: string; valor: number }>>(
        `${AD}/v1/finanzas/indices/inflacionInteranual`,
        "inflacion_interanual_d",
        300_000,
      );
      const inflacionInteranualActual = inflacionData && inflacionData.length > 0
        ? inflacionData[inflacionData.length - 1].valor / 100
        : null;

      let comparacion: ComparadorDData["comparacion"] = null;
      let comparacionTexto: string | null = null;
      if (breakevenInflacion != null && inflacionInteranualActual != null) {
        if (breakevenInflacion > inflacionInteranualActual) {
          comparacion = "breakeven-mayor";
          comparacionTexto = `Breakeven (${(breakevenInflacion * 100).toFixed(2)}%) > inflación interanual (${(inflacionInteranualActual * 100).toFixed(2)}%) → el mercado pricea inflación mayor a la actual. El mercado paga de más por cobertura CER vs tasa fija.`;
        } else {
          comparacion = "breakeven-menor";
          comparacionTexto = `Breakeven (${(breakevenInflacion * 100).toFixed(2)}%) < inflación interanual (${(inflacionInteranualActual * 100).toFixed(2)}%) → la tasa fija rinde más que la cobertura CER al nivel actual de inflación.`;
        }
      }

      let serieHistorica: ComparadorDData["serieHistorica"] = [];
      if (cerBono.historico && inflacionData) {
        const inflMap = new Map(inflacionData.map((e) => [e.fecha, e.valor / 100]));
        serieHistorica = cerBono.historico.slice(-36).map((h) => ({
          fecha: h.fecha,
          breakeven: h.tirCalculada != null && inflMap.get(h.fecha) != null
            ? (inflMap.get(h.fecha) ?? 0) - h.tirCalculada
            : null,
          inflacionInteranual: inflMap.get(h.fecha) ?? null,
        }));
      }

      return {
        cerTicker: data.cerTicker, tasaFijaTicker: data.tasaFijaTicker,
        tirCER, tirTasaFija, breakevenInflacion, inflacionInteranualActual,
        breakevenTooltip: "Breakeven = TIR tasa fija (TEA) − TIR CER (TEA)",
        comparacion, comparacionTexto, serieHistorica, diasMatch,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      return { cerTicker: data.cerTicker, tasaFijaTicker: data.tasaFijaTicker, tirCER: null, tirTasaFija: null, breakevenInflacion: null, inflacionInteranualActual: null, breakevenTooltip: "", comparacion: null, comparacionTexto: null, serieHistorica: [], diasMatch: 0, timestamp: new Date().toISOString(), error: `Error: ${e instanceof Error ? e.message : "desconocido"}` };
    }
  });

// 
// COMPARADOR E — Dollar-Linked vs Hard Dollar vs CER (cobertura cambiaria)
// 
// CER retorno real basado en inflación interanual histórica real

export const comparadorE = createServerFn({ method: "POST" })
  .validator(z.object({
    tickerDL: z.string().default("TZV26"),
    tickerHD: z.string().default("AL30D"),
    tickerCER: z.string().default("CUJ26"),
    devaluacionBase: z.number().default(0.30),
    devaluacionAcelerada: z.number().default(0.60),
    devaluacionAtraso: z.number().default(0.10),
  }))
  .handler(async ({ data }): Promise<ComparadorEData> => {
    try {
      const [tcData, inflacionIaData, cerBonoData] = await Promise.all([
        fetchConCache<Array<{ fecha: string; venta: number; compra: number }>>(
          `${AD}/v1/cotizaciones/dolares/bolsa`, "tc_mep_comp", 120_000,
        ),
        fetchConCache<Array<{ fecha: string; valor: number }>>(
          `${AD}/v1/finanzas/indices/inflacionInteranual`, "inflacion_ia_e", 300_000,
        ),
        (async () => {
          const bono = BONOS_DB[data.tickerCER];
          if (!bono) return null;
          const fechaLiq = calcularTplus1();
          const flujos = bono.flujosPorCada100VN
            .filter((f) => parseISO(f.fecha) > fechaLiq)
            .map((f) => ({ yf: yearFraction(fechaLiq, parseISO(f.fecha), bono.convencionDias ?? "ACT/365"), monto: f.monto }));
          if (flujos.length === 0) return null;
          const outflow: Array<{ yf: number; monto: number }> = [{ yf: 0, monto: -110 }];
          const tir = xirrConvencion([...outflow, ...flujos], 1, "TRUE");
          return { tir, descripcion: bono.descripcion };
        })(),
      ]);

      const tcMepActual = tcData && tcData.length > 0 ? tcData[tcData.length - 1].venta : null;
      const inflacionInteranual = inflacionIaData && inflacionIaData.length > 0
        ? inflacionIaData[inflacionIaData.length - 1].valor / 100
        : 0.15; // fallback 15% si no hay datos
      const cerTIR = cerBonoData?.tir ?? inflacionInteranual; // si no hay bono, usar inflación como proxy

      // Retorno USD de CER: (1 + TIR) / (1 + devaluación) - 1
      const calcCER = (deval: number) => ((1 + cerTIR) / (1 + deval)) - 1;

      const escenarios: ComparadorEData["escenarios"] = [
        {
          nombre: "Devaluación acelerada",
          devaluacionAnual: data.devaluacionAcelerada,
          descripcion: `TC MEP +${(data.devaluacionAcelerada * 100).toFixed(0)}% en 12m`,
          retornos: [
            { instrumento: "Dollar-Linked", ticker: data.tickerDL, retornoUSD: data.devaluacionAcelerada },
            { instrumento: "Hard Dollar", ticker: data.tickerHD, retornoUSD: 0.05 },
            { instrumento: `CER (${data.tickerCER})`, ticker: data.tickerCER, retornoUSD: calcCER(data.devaluacionAcelerada) },
          ],
        },
        {
          nombre: "En línea con inflación",
          devaluacionAnual: data.devaluacionBase,
          descripcion: `TC MEP +${(data.devaluacionBase * 100).toFixed(0)}% en 12m`,
          retornos: [
            { instrumento: "Dollar-Linked", ticker: data.tickerDL, retornoUSD: data.devaluacionBase },
            { instrumento: "Hard Dollar", ticker: data.tickerHD, retornoUSD: 0.05 },
            { instrumento: `CER (${data.tickerCER})`, ticker: data.tickerCER, retornoUSD: calcCER(data.devaluacionBase) },
          ],
        },
        {
          nombre: "Atraso cambiario",
          devaluacionAnual: data.devaluacionAtraso,
          descripcion: `TC MEP +${(data.devaluacionAtraso * 100).toFixed(0)}% en 12m`,
          retornos: [
            { instrumento: "Dollar-Linked", ticker: data.tickerDL, retornoUSD: data.devaluacionAtraso },
            { instrumento: "Hard Dollar", ticker: data.tickerHD, retornoUSD: 0.05 },
            { instrumento: `CER (${data.tickerCER})`, ticker: data.tickerCER, retornoUSD: calcCER(data.devaluacionAtraso) },
          ],
        },
      ];

      return {
        tcMepActual,
        instrumentos: [
          { ticker: data.tickerDL, tipo: "Dollar-Linked", retornoLocal: null },
          { ticker: data.tickerHD, tipo: "Hard Dollar", retornoLocal: null },
          { ticker: data.tickerCER, tipo: "CER", retornoLocal: cerTIR },
        ],
        escenarios,
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      return { tcMepActual: null, instrumentos: [], escenarios: [], timestamp: new Date().toISOString(), error: `Error: ${e instanceof Error ? e.message : "desconocido"}` };
    }
  });

// 
// COMPARADOR F — FCI vs Instrumento Directo
// 
// FCI API devuelve: { fondo, fecha, vcp, ccp, patrimonio, horizonte }
// Se matchean por nombre "fondo" entre ultimo y penultimo

interface FCIEntry { fondo: string; fecha: string; vcp: number; ccp: number; patrimonio: number; horizonte?: string }

function calcRetornoAnualizado(ultimo: FCIEntry, penultimo: FCIEntry): number | null {
  if (ultimo.vcp <= 0 || penultimo.vcp <= 0) return null;
  const ret = (ultimo.vcp / penultimo.vcp) - 1;
  const d1 = new Date(ultimo.fecha), d2 = new Date(penultimo.fecha);
  const dias = Math.max(1, (d1.getTime() - d2.getTime()) / 86400000);
  const anual = Math.pow(1 + ret, 365 / dias) - 1;
  if (!Number.isFinite(anual) || Math.abs(anual) > 20) return null; // sanity cap ±2000%
  return anual;
}

export const comparadorF = createServerFn({ method: "POST" }).handler(async (): Promise<ComparadorFData> => {
  try {
    const [lecapAD, mmUltimo, mmPenultimo, rfUltimo, rfPenultimo] = await Promise.all([
      fetchConCache<Array<{ ticker: string; tem: number }>>(`${AD}/v1/finanzas/letras`, "lecaps_ad_fci", 120_000),
      fetchConCache<FCIEntry[]>(`${AD}/v1/finanzas/fci/mercadoDinero/ultimo`, "fci_mm_u", 180_000),
      fetchConCache<FCIEntry[]>(`${AD}/v1/finanzas/fci/mercadoDinero/penultimo`, "fci_mm_p", 180_000),
      fetchConCache<FCIEntry[]>(`${AD}/v1/finanzas/fci/rentaFija/ultimo`, "fci_rf_u", 180_000),
      fetchConCache<FCIEntry[]>(`${AD}/v1/finanzas/fci/rentaFija/penultimo`, "fci_rf_p", 180_000),
    ]);

    let lecapTEA: number | null = null;
    if (lecapAD && lecapAD.length > 0) {
      lecapTEA = lecapAD[0].tem / 100;
    }

    const matchFCI = (ultimos: FCIEntry[] | null, penultimos: FCIEntry[] | null): FCIComparacionData | null => {
      if (!ultimos || ultimos.length === 0) return null;
      const penMap = new Map((penultimos ?? []).map((f) => [f.fondo, f]));
      // Tomar el de mayor patrimonio que tenga matching penultimo
      const candidatos = ultimos
        .filter((u) => penMap.has(u.fondo))
        .sort((a, b) => (b.patrimonio ?? 0) - (a.patrimonio ?? 0));
      if (candidatos.length === 0) {
        // Sin matching: mostrar el de mayor volumen sin retorno
        const top = [...ultimos].sort((a, b) => (b.patrimonio ?? 0) - (a.patrimonio ?? 0))[0];
        return { fciTicker: top.fondo, fciCategoria: "", vcpActual: top.vcp, retornoAnualizado: null, instrumentoDirecto: "", retornoDirecto: null, diferencia: null };
      }
      const u = candidatos[0];
      const p = penMap.get(u.fondo)!;
      return {
        fciTicker: u.fondo,
        fciCategoria: "",
        vcpActual: u.vcp,
        retornoAnualizado: calcRetornoAnualizado(u, p),
        instrumentoDirecto: "",
        retornoDirecto: null,
        diferencia: null,
      };
    };

    const mm = matchFCI(mmUltimo, mmPenultimo);
    const rf = matchFCI(rfUltimo, rfPenultimo);

    if (mm) { mm.fciCategoria = "Money Market"; mm.instrumentoDirecto = "Plazo Fijo Promedio"; }
    if (rf) { rf.fciCategoria = "Renta Fija"; rf.instrumentoDirecto = "LECAP corto plazo"; }
    if (rf && lecapTEA != null) {
      rf.retornoDirecto = lecapTEA;
      rf.diferencia = rf.retornoAnualizado != null ? rf.retornoAnualizado - lecapTEA : null;
    }

    return { fcismm: mm, fciRentaFija: rf, timestamp: new Date().toISOString() };
  } catch (e) {
    return { fcismm: null, fciRentaFija: null, timestamp: new Date().toISOString(), error: `Error: ${e instanceof Error ? e.message : "desconocido"}` };
  }
});

// 
// COMPARADOR G — BADLAR/TAMAR flotante vs Tasa Fija (breakeven de tasa)
// 

export const comparadorG = createServerFn({ method: "POST" })
  .validator(z.object({
    onBadlarTicker: z.string().default("BFR26O"),
    onTasaFijaTicker: z.string().default("CO26O"),
    precioBadlar: z.number().positive().optional(),
    precioFija: z.number().positive().optional(),
  }))
  .handler(async ({ data }): Promise<ComparadorGData> => {
    try {
      const [badlar, tamar] = await Promise.all([
        fetchConCache<Array<{ valor: number }>>("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7", "badlar_rate", 180_000),
        fetchConCache<Array<{ valor: number }>>("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/13", "tamar_rate", 180_000),
      ]);

      const badlarActual = badlar && badlar.length > 0 ? badlar[0].valor / 100 : null;
      const tamarActual = tamar && tamar.length > 0 ? tamar[0].valor / 100 : null;

      const badlarON = BONOS_DB[data.onBadlarTicker];
      const fijaON = BONOS_DB[data.onTasaFijaTicker];

      let onBadlarTIR: number | null = null;
      let onTasaFijaTIR: number | null = null;

      if (badlarON) {
        const fechaLiq = calcularTplus1();
        const flujos = badlarON.flujosPorCada100VN.filter((f) => parseISO(f.fecha) > fechaLiq).map((f) => ({
          yf: yearFraction(fechaLiq, parseISO(f.fecha), badlarON.convencionDias ?? "30/360"),
          monto: f.monto,
        }));
        if (flujos.length > 0) {
          const price = data.precioBadlar ?? 100;
          const outflow: Array<{ yf: number; monto: number }> = [{ yf: 0, monto: -price }];
          const freq = getFrecuenciaNumerica(badlarON.frecuenciaPago);
          onBadlarTIR = xirrConvencion([...outflow, ...flujos], freq, (badlarON.yieldConvention ?? "TRUE"));
        }
      }

      if (fijaON) {
        const fechaLiq = calcularTplus1();
        const flujos = fijaON.flujosPorCada100VN.filter((f) => parseISO(f.fecha) > fechaLiq).map((f) => ({
          yf: yearFraction(fechaLiq, parseISO(f.fecha), fijaON.convencionDias ?? "ACT/365"),
          monto: f.monto,
        }));
        if (flujos.length > 0) {
          const price = data.precioFija ?? 100;
          const outflow: Array<{ yf: number; monto: number }> = [{ yf: 0, monto: -price }];
          const freq = getFrecuenciaNumerica(fijaON.frecuenciaPago);
          onTasaFijaTIR = xirrConvencion([...outflow, ...flujos], freq, (fijaON.yieldConvention ?? "TRUE"));
        }
      }

      const breakevenBadlar = onBadlarTIR != null && onTasaFijaTIR != null ? onTasaFijaTIR : null;

      let comparacion: ComparadorGData["comparacion"] = null;
      let comparacionTexto: string | null = null;
      if (badlarActual != null && breakevenBadlar != null) {
        if (badlarActual > breakevenBadlar) {
          comparacion = "flotante-conviene";
          comparacionTexto = `BADLAR actual (${(badlarActual * 100).toFixed(2)}%) > breakeven (${(breakevenBadlar * 100).toFixed(2)}%) → conviene flotante.`;
        } else {
          comparacion = "fija-conviene";
          comparacionTexto = `BADLAR actual (${(badlarActual * 100).toFixed(2)}%) < breakeven (${(breakevenBadlar * 100).toFixed(2)}%) → conviene tasa fija.`;
        }
      }

      return {
        badlarActual,
        tamarActual,
        onBadlarTicker: data.onBadlarTicker,
        onBadlarTIR,
        onTasaFijaTicker: data.onTasaFijaTicker,
        onTasaFijaTIR,
        breakevenBadlar,
        breakevenTooltip: "Breakeven = TIR ON Tasa Fija (TEA). Si BADLAR > breakeven → conviene flotante.",
        comparacion,
        comparacionTexto,
        serieBadlar: [],
        timestamp: new Date().toISOString(),
      };
    } catch (e) {
      return { badlarActual: null, tamarActual: null, onBadlarTicker: null, onBadlarTIR: null, onTasaFijaTicker: null, onTasaFijaTIR: null, breakevenBadlar: null, breakevenTooltip: "", comparacion: null, comparacionTexto: null, serieBadlar: [], timestamp: new Date().toISOString(), error: `Error: ${e instanceof Error ? e.message : "desconocido"}` };
    }
  });

// 
// EVOLUCIÓN CAMBIARIA — USD oficial, blue, MEP, CCL + inflación
// 

export interface PuntoEvolucion {
  fecha: string;
  oficial: number | null;
  blue: number | null;
  mep: number | null;
  ccl: number | null;
  inflacionMensual: number | null;
  inflacionInteranual: number | null;
}

export const fetchEvolucionCambiaria = createServerFn({ method: "GET" }).handler(async (): Promise<{
  serie: PuntoEvolucion[];
  timestamp: string;
  error?: string;
}> => {
  try {
    const [oficialRaw, blueRaw, mepRaw, inflacionRaw, inflacionIaRaw] = await Promise.all([
      fetchConCache<Array<{ fecha: string; venta: number }>>(`${AD}/v1/cotizaciones/dolares/oficial`, "tc_oficial_evo", 600_000),
      fetchConCache<Array<{ fecha: string; venta: number }>>(`${AD}/v1/cotizaciones/dolares/blue`, "tc_blue_evo", 600_000),
      fetchConCache<Array<{ fecha: string; venta: number }>>(`${AD}/v1/cotizaciones/dolares/bolsa`, "tc_mep_evo", 600_000),
      fetchConCache<Array<{ fecha: string; valor: number }>>(`${AD}/v1/finanzas/indices/inflacion`, "inflacion_evo", 600_000),
      fetchConCache<Array<{ fecha: string; valor: number }>>(`${AD}/v1/finanzas/indices/inflacionInteranual`, "inflacion_ia_evo", 600_000),
    ]);

    const inflMap = new Map((inflacionRaw ?? []).map((e) => [e.fecha, e.valor]));
    const inflIaMap = new Map((inflacionIaRaw ?? []).map((e) => [e.fecha, e.valor / 100]));

    const fechasSet = new Set<string>();
    for (const arr of [oficialRaw, blueRaw, mepRaw]) {
      if (arr) for (const e of arr) fechasSet.add(e.fecha);
    }

    const fechas = [...fechasSet].sort();
    const oficialMap = new Map((oficialRaw ?? []).map((e) => [e.fecha, e.venta]));
    const blueMap = new Map((blueRaw ?? []).map((e) => [e.fecha, e.venta]));
    const mepMap = new Map((mepRaw ?? []).map((e) => [e.fecha, e.venta]));

    // CCL ≈ MEP × 1.02 (aproximación, no disponible directamente)
    const serie: PuntoEvolucion[] = fechas.slice(-365).map((f) => {
      const of = oficialMap.get(f) ?? null;
      const bl = blueMap.get(f) ?? null;
      const mp = mepMap.get(f) ?? null;
      return {
        fecha: f,
        oficial: of,
        blue: bl,
        mep: mp,
        ccl: mp != null ? mp * 1.02 : null,
        inflacionMensual: inflMap.get(f) ?? null,
        inflacionInteranual: inflIaMap.get(f) ?? null,
      };
    });

    return { serie, timestamp: new Date().toISOString() };
  } catch (e) {
    return { serie: [], timestamp: new Date().toISOString(), error: `Error: ${e instanceof Error ? e.message : "desconocido"}` };
  }
});
