// src/lib/api/market.functions.ts
// 10 server functions para herramientas macro: Radiografía, Presión, Backtester, Regímenes, Tasa Real, Curva, Merval, Screener, Correlaciones, Liquidez

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// ============================================================================
// TIPOS COMPARTIDOS
// ============================================================================

type PuntoSerie = { d: string; v: number };
type Milestone = { d: string; e: string; t: string };

interface EstrategiaResult {
  nombre: string;
  valorFinalARS: number;
  valorRealCER: number;
  retornoNominalPct: number;
  retornoRealPct: number;
  ganoAlIPC: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

async function fetchBCRA(path: string): Promise<PuntoSerie[]> {
  const r = await fetch(`https://api.estadisticasbcra.com/${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!r.ok) return [];
  return r.json();
}

function filtrarRango(arr: PuntoSerie[], desde?: string, hasta?: string): PuntoSerie[] {
  return arr.filter((p) => {
    if (desde && p.d < desde) return false;
    if (hasta && p.d > hasta) return false;
    return true;
  });
}

function normalizar(val: number, min: number, max: number): number {
  if (max === min) return 50;
  return ((val - min) / (max - min)) * 100;
}

function forwardFill(arr: PuntoSerie[]): PuntoSerie[] {
  let ultimo = 0;
  return arr.map((p) => {
    if (p.v != null) ultimo = p.v;
    return { d: p.d, v: ultimo };
  });
}

// ============================================================================
// PROMPT 1: RADIOGRAFÍA DEL PESO
// ============================================================================

export const getMacroRadiografia = createServerFn({ method: "GET" })
  .validator(z.object({ periodo: z.enum(["1Y", "3Y", "5Y", "10Y", "MAX"]).default("1Y") }))
  .handler(async ({ data }) => {
    const [reservas, base, usd, usd_of, inflacion, milestones] = await Promise.all([
      fetchBCRA("reservas"),
      fetchBCRA("base"),
      fetchBCRA("usd"),
      fetchBCRA("usd_of"),
      fetchBCRA("inflacion_mensual_oficial"),
      fetchBCRA("milestones"),
    ]);

    const ahora = new Date();
    const desdeMap: Record<string, string> = { "1Y": "", "3Y": "", "5Y": "", "10Y": "", MAX: "" };
    const años: Record<string, number> = { "1Y": 1, "3Y": 3, "5Y": 5, "10Y": 10, MAX: 100 };
    const d = new Date(ahora);
    d.setFullYear(d.getFullYear() - años[data.periodo]);
    const desde = d.toISOString().split("T")[0];
    const hasta = ahora.toISOString().split("T")[0];

    const usdF = filtrarRango(usd, desde, hasta);
    const usd_ofF = filtrarRango(usd_of, desde, hasta);
    const inflacionF = filtrarRango(inflacion, desde, hasta);
    const reservasF = filtrarRango(reservas, desde, hasta);
    const msFiltrados = (milestones as unknown as Milestone[]).filter(
      (m) => m.d >= desde && m.d <= hasta,
    );

    // Alinear por fecha
    const fechas = [...new Set([...usdF, ...usd_ofF].map((p) => p.d))].sort();
    const serie = fechas.map((f) => {
      const u = usdF.find((p) => p.d === f)?.v ?? null;
      const uo = usd_ofF.find((p) => p.d === f)?.v ?? null;
      const inf = inflacionF.find((p) => p.d === f)?.v ?? null;
      const res = reservasF.find((p) => p.d === f)?.v ?? null;
      return {
        fecha: f,
        usd: u,
        usd_of: uo,
        brecha: u != null && uo != null && uo !== 0 ? ((u - uo) / uo) * 100 : null,
        inflacion_mensual: inf,
        reservas: res,
      };
    });

    const inflacionPeríodo = inflacionF.reduce((acc, p) => acc * (1 + p.v / 100), 1) - 1;
    const brechaActual = (() => {
      const ult = serie.filter((s) => s.brecha != null);
      return ult.length > 0 ? ult[ult.length - 1].brecha : null;
    })();
    const reservasActual = reservasF.length > 0 ? reservasF[reservasF.length - 1].v : null;
    const usdActual = serie.filter((s) => s.usd != null);
    const usdInicio = usdActual.length > 0 ? usdActual[0].usd : null;
    const usdFin = usdActual.length > 0 ? usdActual[usdActual.length - 1].usd : null;
    const varUSDPeríodo = usdInicio && usdFin ? ((usdFin - usdInicio) / usdInicio) * 100 : null;

    return {
      serie,
      milestones: msFiltrados,
      kpis: {
        reservasActual: reservasActual != null ? +(reservasActual / 1e9).toFixed(2) : null,
        inflacionAcumuladaPeríodo: +(inflacionPeríodo * 100).toFixed(2),
        brechaActual: brechaActual != null ? +brechaActual.toFixed(1) : null,
        varUSDPeríodo: varUSDPeríodo != null ? +varUSDPeríodo.toFixed(1) : null,
      },
    };
  });

// ============================================================================
// PROMPT 2: ÍNDICE DE PRESIÓN SOBRE EL PESO
// ============================================================================

export const getPresionPeso = createServerFn({ method: "GET" })
  .validator(z.object({ periodo: z.enum(["1Y", "3Y", "5Y", "MAX"]).default("1Y") }))
  .handler(async ({ data }) => {
    const [varBase, inflacion, varUSD, brecha] = await Promise.all([
      fetchBCRA("var_base_monetaria_interanual"),
      fetchBCRA("inflacion_interanual_oficial"),
      fetchBCRA("var_usd_interanual"),
      fetchBCRA("var_usd_vs_usd_of"),
    ]);

    const años: Record<string, number> = { "1Y": 1, "3Y": 3, "5Y": 5, MAX: 100 };
    const d = new Date();
    d.setFullYear(d.getFullYear() - años[data.periodo]);
    const desde = d.toISOString().split("T")[0];

    const vb = filtrarRango(varBase, desde).filter((p) => p.v != null);
    const inf = filtrarRango(inflacion, desde).filter((p) => p.v != null);
    const vUSD = filtrarRango(varUSD, desde).filter((p) => p.v != null);
    const br = filtrarRango(brecha, desde).filter((p) => p.v != null);

    // Fechas comunes
    const fechas = [...new Set([...vb, ...inf, ...vUSD, ...br].map((p) => p.d))].sort();
    const todos = [vb, inf, vUSD, br].flat();
    const min_max = (arr: PuntoSerie[]) => ({
      min: Math.min(...arr.filter((p) => p.v != null).map((p) => p.v)),
      max: Math.max(...arr.filter((p) => p.v != null).map((p) => p.v)),
    });
    const mmVB = min_max(vb);
    const mmInf = min_max(inf);
    const mmVUSD = min_max(vUSD);
    const mmBr = min_max(br);

    const serie = fechas.map((f) => {
      const v1 = vb.find((p) => p.d === f)?.v ?? null;
      const v2 = inf.find((p) => p.d === f)?.v ?? null;
      const v3 = vUSD.find((p) => p.d === f)?.v ?? null;
      const v4 = br.find((p) => p.d === f)?.v ?? null;
      const n1 = v1 != null ? normalizar(v1, mmVB.min, mmVB.max) : null;
      const n2 = v2 != null ? normalizar(v2, mmInf.min, mmInf.max) : null;
      const n3 = v3 != null ? normalizar(v3, mmVUSD.min, mmVUSD.max) : null;
      const n4 = v4 != null ? normalizar(v4, mmBr.min, mmBr.max) : null;
      const score = [n1, n2, n3, n4].filter((x) => x != null);
      return {
        fecha: f,
        varBase: v1,
        inflacionInteranual: v2,
        varUSDinteranual: v3,
        brecha: v4,
        n1,
        n2,
        n3,
        n4,
        score: score.length > 0 ? score.reduce((s, v) => s! + v!, 0)! / score.length : null,
        componentesDisponibles: score.length,
      };
    });

    const actual = serie.filter((s) => s.score != null);
    const scoreActual = actual.length > 0 ? actual[actual.length - 1].score : null;
    const ultimosComponentes = actual.length > 0 ? actual[actual.length - 1] : null;

    return { serie, scoreActual, ultimosComponentes };
  });

// ============================================================================
// PROMPT 3: BACKTESTER HISTÓRICO DE ESTRATEGIAS
// ============================================================================

export const getBacktest = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fechaInicio: z.string(),
      fechaFin: z.string(),
      montoARS: z.number().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const [usd, badlar, mervalUSD, cer] = await Promise.all([
      fetchBCRA("usd"),
      fetchBCRA("tasa_badlar"),
      fetchBCRA("merval_usd"),
      fetchBCRA("cer"),
    ]);

    // SPY desde Yahoo
    let spyPrecos: PuntoSerie[] = [];
    try {
      const r = await fetch(
        "https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=max&interval=1d",
        { cache: "no-store" },
      );
      if (r.ok) {
        const j = await r.json();
        const timestamps = j?.chart?.result?.[0]?.timestamp ?? [];
        const closes =
          j?.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose ??
          j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ??
          [];
        spyPrecos = timestamps
          .map((t: number, i: number) => ({
            d: new Date(t * 1000).toISOString().split("T")[0],
            v: closes[i] ?? null,
          }))
          .filter((p: PuntoSerie) => p.v != null);
      }
    } catch {
      /* spy falla, omitir */
    }

    const u = filtrarRango(usd, data.fechaInicio, data.fechaFin);
    const b = filtrarRango(badlar, data.fechaInicio, data.fechaFin);
    const m = filtrarRango(mervalUSD, data.fechaInicio, data.fechaFin);
    const c = filtrarRango(cer, data.fechaInicio, data.fechaFin);
    const s = filtrarRango(spyPrecos, data.fechaInicio, data.fechaFin);

    const fechas = [...new Set([...u, ...b, ...m, ...c, ...s].map((p) => p.d))].sort();
    const monto = data.montoARS;

    // Forward fill
    const series = {
      usd: forwardFill(u),
      badlar: forwardFill(b),
      merval: forwardFill(m),
      cer: forwardFill(c),
      spy: forwardFill(s),
    };

    const cerInicio = series.cer[0]?.v ?? 1;
    const cerFin = series.cer[series.cer.length - 1]?.v ?? 1;
    const usdInicio = series.usd[0]?.v ?? 1;
    const usdFin = series.usd[series.usd.length - 1]?.v ?? 1;
    const mervalInicio = series.merval[0]?.v ?? 1;
    const mervalFin = series.merval[series.merval.length - 1]?.v ?? 1;
    const spyInicio = series.spy[0]?.v ?? 1;
    const spyFin = series.spy[series.spy.length - 1]?.v ?? 1;

    function deflactar(valor: number): number {
      return valor / (cerFin / cerInicio);
    }

    const estrategias: EstrategiaResult[] = [];

    // Pesos
    const pesos = monto;
    estrategias.push({
      nombre: "Pesos sin invertir",
      valorFinalARS: pesos,
      valorRealCER: deflactar(pesos),
      retornoNominalPct: 0,
      retornoRealPct: (deflactar(pesos) / monto - 1) * 100,
      ganoAlIPC: deflactar(pesos) >= monto,
    });

    // BADLAR
    if (b.length > 0) {
      let badlarAcum = monto;
      const badlarDiario = series.badlar.map((p) => p.v / 100 / 365);
      badlarDiario.forEach((r) => (badlarAcum *= 1 + r));
      estrategias.push({
        nombre: "Plazo fijo BADLAR",
        valorFinalARS: badlarAcum,
        valorRealCER: deflactar(badlarAcum),
        retornoNominalPct: (badlarAcum / monto - 1) * 100,
        retornoRealPct: (deflactar(badlarAcum) / monto - 1) * 100,
        ganoAlIPC: deflactar(badlarAcum) >= monto,
      });
    }

    // Dólar libre
    if (u.length > 1) {
      const usdValor = (monto / usdInicio) * usdFin;
      estrategias.push({
        nombre: "Dólar libre MEP",
        valorFinalARS: usdValor,
        valorRealCER: deflactar(usdValor),
        retornoNominalPct: (usdValor / monto - 1) * 100,
        retornoRealPct: (deflactar(usdValor) / monto - 1) * 100,
        ganoAlIPC: deflactar(usdValor) >= monto,
      });
    }

    // Merval USD
    if (m.length > 1) {
      const mervValor = (monto / usdInicio) * (mervalFin / mervalInicio) * usdFin;
      estrategias.push({
        nombre: "Merval USD",
        valorFinalARS: mervValor,
        valorRealCER: deflactar(mervValor),
        retornoNominalPct: (mervValor / monto - 1) * 100,
        retornoRealPct: (deflactar(mervValor) / monto - 1) * 100,
        ganoAlIPC: deflactar(mervValor) >= monto,
      });
    }

    // SPY
    if (s.length > 1) {
      const spyValor = (monto / usdInicio) * (spyFin / spyInicio) * usdFin;
      estrategias.push({
        nombre: "SPY CEDEAR proxy",
        valorFinalARS: spyValor,
        valorRealCER: deflactar(spyValor),
        retornoNominalPct: (spyValor / monto - 1) * 100,
        retornoRealPct: (deflactar(spyValor) / monto - 1) * 100,
        ganoAlIPC: deflactar(spyValor) >= monto,
      });
    }

    // Serie mensual para gráfico
    const mensual: {
      fecha: string;
      pesos: number;
      badlar: number | null;
      dolar: number | null;
      merval: number | null;
      spy: number | null;
    }[] = [];
    const meses = [...new Set(fechas.map((f) => f.slice(0, 7)))].sort();

    for (const mes of meses) {
      const ultF = fechas.filter((f) => f.startsWith(mes));
      const f = ultF[ultF.length - 1];
      const idx = fechas.indexOf(f);
      const uVal = series.usd[idx]?.v ?? 1;
      const cVal = series.cer[idx]?.v ?? 1;
      const mVal = series.merval[idx]?.v ?? 1;
      const sVal = series.spy[idx]?.v ?? 1;
      const bVal = series.badlar[idx]?.v ?? 0;

      let bAcum = monto;
      for (let j = 0; j <= idx; j++) bAcum *= 1 + (series.badlar[j]?.v ?? 0) / 100 / 365;

      mensual.push({
        fecha: f,
        pesos: monto,
        badlar: b.length > 0 ? bAcum : null,
        dolar: u.length > 1 ? (monto / usdInicio) * uVal : null,
        merval: m.length > 1 ? (monto / usdInicio) * (mVal / mervalInicio) * uVal : null,
        spy: s.length > 1 ? (monto / usdInicio) * (sVal / spyInicio) * uVal : null,
      });
    }

    return { estrategias, serieMensual: mensual };
  });

// ============================================================================
// PROMPT 4: DETECTOR DE REGÍMENES MACRO
// ============================================================================

export const getRegimenMacro = createServerFn({ method: "GET" }).handler(async () => {
  const [reservas, brecha, badlar, inflacion, varBase, riesgoPais] = await Promise.all([
    fetchBCRA("reservas"),
    fetchBCRA("var_usd_vs_usd_of"),
    fetchBCRA("tasa_badlar"),
    fetchBCRA("inflacion_mensual_oficial"),
    fetchBCRA("var_base_monetaria_interanual"),
    (async () => {
      try {
        const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais", {
          cache: "no-store",
        });
        if (!r.ok) return [];
        return r.json() as Promise<PuntoSerie[]>;
      } catch {
        return [];
      }
    })(),
  ]);

  // Agrupar por mes
  const mesesMap = new Map<string, any>();
  const allData = [...reservas, ...brecha, ...badlar, ...inflacion, ...varBase, ...riesgoPais];

  for (const p of allData) {
    if (!p.d || p.v == null) continue;
    const mes = p.d.slice(0, 7);
    if (!mesesMap.has(mes))
      mesesMap.set(mes, {
        mes,
        reservas: [],
        brecha: [],
        badlar: [],
        inflacion: [],
        varBase: [],
        riesgoPais: [],
      });
    const m = mesesMap.get(mes);
    if (reservas.find((r) => r.d === p.d)) m.reservas.push(p.v);
    if (brecha.find((r) => r.d === p.d)) m.brecha.push(p.v);
    if (badlar.find((r) => r.d === p.d)) m.badlar.push(p.v);
    if (inflacion.find((r) => r.d === p.d)) m.inflacion.push(p.v);
    if (varBase.find((r) => r.d === p.d)) m.varBase.push(p.v);
    if (riesgoPais.find((r) => r.d === p.d)) m.riesgoPais.push(p.v);
  }

  const REGIMENES = [
    { id: "ESTABILIZACION", nombre: "Estabilización", color: "green" },
    { id: "EXPANSION", nombre: "Expansión", color: "blue" },
    { id: "CRISIS_CAMBIARIA", nombre: "Crisis Cambiaria", color: "red" },
    { id: "CEPO", nombre: "Cepo", color: "orange" },
    { id: "CORRECCION", nombre: "Corrección", color: "yellow" },
    { id: "ACELERACION_INFLACIONARIA", nombre: "Aceleración Inflacionaria", color: "purple" },
  ];

  function clasificar(m: any): string {
    const brechaProm = m.brecha.length > 0 ? m.brecha[m.brecha.length - 1] : null;
    const badlarProm = m.badlar.length > 0 ? m.badlar[m.badlar.length - 1] : null;
    const inflacionProm = m.inflacion.length > 0 ? m.inflacion[m.inflacion.length - 1] : null;
    const varBaseProm = m.varBase.length > 0 ? m.varBase[m.varBase.length - 1] : null;
    const rpProm = m.riesgoPais.length > 0 ? m.riesgoPais[m.riesgoPais.length - 1] : null;
    const resProm = m.reservas.length > 0 ? m.reservas[m.reservas.length - 1] : null;
    const resAnterior = m.reservas.length > 60 ? m.reservas[m.reservas.length - 60] : null;
    const varReservas60d =
      resAnterior && resProm ? ((resProm - resAnterior) / resAnterior) * 100 : null;
    const tasaReal =
      badlarProm != null && inflacionProm != null ? badlarProm / 12 - inflacionProm : null;

    if (
      brechaProm != null &&
      brechaProm < 15 &&
      tasaReal != null &&
      tasaReal > 0 &&
      varReservas60d != null &&
      varReservas60d > 0
    )
      return "ESTABILIZACION";
    if (
      varBaseProm != null &&
      varBaseProm > 50 &&
      inflacionProm != null &&
      inflacionProm < 5 &&
      brechaProm != null &&
      brechaProm < 20
    )
      return "EXPANSION";
    if (
      (brechaProm != null && brechaProm > 80) ||
      (varReservas60d != null && varReservas60d < -15 && brechaProm != null && brechaProm > 40)
    )
      return "CRISIS_CAMBIARIA";
    if (
      brechaProm != null &&
      brechaProm > 40 &&
      varReservas60d != null &&
      varReservas60d < 0 &&
      rpProm != null &&
      rpProm > 800
    )
      return "CEPO";
    if (
      tasaReal != null &&
      tasaReal > 2 &&
      varBaseProm != null &&
      varBaseProm < 20 &&
      brechaProm != null &&
      brechaProm < 30
    )
      return "CORRECCION";
    if (inflacionProm != null && inflacionProm > 6 && varBaseProm != null && varBaseProm > 40)
      return "ACELERACION_INFLACIONARIA";
    return "OTRO";
  }

  const mesesOrdenados = [...mesesMap.keys()].sort();
  const historico = mesesOrdenados.map((mes) => ({ mes, regimen: clasificar(mesesMap.get(mes)) }));

  const regimenActual = historico.length > 0 ? historico[historico.length - 1].regimen : "OTRO";

  // Duración por régimen
  const duraciones: Record<string, number> = {};
  let regimenAnterior = "";
  for (const h of historico) {
    if (h.regimen !== regimenAnterior) {
      regimenAnterior = h.regimen;
    }
    duraciones[h.regimen] = (duraciones[h.regimen] ?? 0) + 1;
  }

  // Períodos históricos
  const periodos: { regimen: string; desde: string; hasta: string; duracionMeses: number }[] = [];
  let inicioPeriodo = "";
  let regActual = "";
  for (const h of historico) {
    if (h.regimen !== regActual) {
      if (regActual && inicioPeriodo) {
        periodos.push({ regimen: regActual, desde: inicioPeriodo, hasta: h.mes, duracionMeses: 1 });
      }
      regActual = h.regimen;
      inicioPeriodo = h.mes;
    } else {
      if (periodos.length > 0) periodos[periodos.length - 1].hasta = h.mes;
    }
  }
  if (regActual && inicioPeriodo && periodos.length > 0) {
    periodos[periodos.length - 1].hasta = historico[historico.length - 1].mes;
    periodos[periodos.length - 1].duracionMeses = Math.round(
      (new Date(historico[historico.length - 1].mes + "-01").getTime() -
        new Date(inicioPeriodo + "-01").getTime()) /
        (30 * 86400000),
    );
  }

  return {
    historico,
    regimenActual,
    duraciones: Object.entries(duraciones).map(([r, d]) => ({ regimen: r, meses: d })),
    periodos,
  };
});

// ============================================================================
// PROMPT 5: MONITOR DE TASA REAL HISTÓRICA
// ============================================================================

export const getTasaReal = createServerFn({ method: "GET" })
  .validator(z.object({ periodo: z.enum(["3Y", "5Y", "10Y", "MAX"]).default("5Y") }))
  .handler(async ({ data }) => {
    const [badlar, leliq, depositos, inflacion, pfTasas] = await Promise.all([
      fetchBCRA("tasa_badlar"),
      fetchBCRA("tasa_leliq"),
      fetchBCRA("tasa_depositos_30_dias"),
      fetchBCRA("inflacion_mensual_oficial"),
      (async () => {
        try {
          const r = await fetch("https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo", {
            cache: "no-store",
          });
          if (!r.ok) return [];
          return r.json() as Promise<any[]>;
        } catch {
          return [];
        }
      })(),
    ]);

    const años: Record<string, number> = { "3Y": 3, "5Y": 5, "10Y": 10, MAX: 100 };
    const d = new Date();
    d.setFullYear(d.getFullYear() - años[data.periodo]);
    const desde = d.toISOString().split("T")[0];

    const bad = filtrarRango(badlar, desde);
    const lel = filtrarRango(leliq, desde);
    const dep = filtrarRango(depositos, desde);
    const inf = filtrarRango(inflacion, desde);

    function tnaAMensual(tna: number): number {
      return (Math.pow(1 + tna / 100 / 365, 30) - 1) * 100;
    }

    const fechas = [...new Set([...bad, ...lel, ...dep, ...inf].map((p) => p.d))].sort();

    const serie = fechas.map((f) => {
      const b = bad.find((p) => p.d === f)?.v ?? null;
      const l = lel.find((p) => p.d === f)?.v ?? null;
      const dp = dep.find((p) => p.d === f)?.v ?? null;
      const infP = inf.find((p) => p.d === f)?.v ?? null;
      const badMensual = b != null ? tnaAMensual(b) : null;
      const lelMensual = l != null ? tnaAMensual(l) : null;
      const depMensual = dp != null ? tnaAMensual(dp) : null;
      return {
        fecha: f,
        badlarReal: badMensual != null && infP != null ? +(badMensual - infP).toFixed(2) : null,
        leliqReal: lelMensual != null && infP != null ? +(lelMensual - infP).toFixed(2) : null,
        dep30Real: depMensual != null && infP != null ? +(depMensual - infP).toFixed(2) : null,
        badlarTNA: b,
        leliqTNA: l,
        dep30TNA: dp,
        inflacion: infP,
      };
    });

    function stats(arr: (number | null)[]) {
      const vals = arr.filter((x): x is number => x != null);
      if (vals.length === 0)
        return { ultimo: null, pctPositivo: null, mediana: null, peor: null, mejor: null };
      const sorted = [...vals].sort((a, b) => a - b);
      return {
        ultimo: +vals[vals.length - 1].toFixed(2),
        pctPositivo: +((vals.filter((v) => v > 0).length / vals.length) * 100).toFixed(1),
        mediana: +sorted[Math.floor(sorted.length / 2)].toFixed(2),
        peor: +sorted[0].toFixed(2),
        mejor: +sorted[sorted.length - 1].toFixed(2),
      };
    }

    return {
      serie,
      stats: {
        badlar: stats(serie.map((s) => s.badlarReal)),
        leliq: stats(serie.map((s) => s.leliqReal)),
        depositos30d: stats(serie.map((s) => s.dep30Real)),
      },
      bancosPF: pfTasas.slice(0, 20),
      inflacionUltimo: inf.length > 0 ? inf[inf.length - 1].v : null,
    };
  });

// ============================================================================
// PROMPT 6: CURVA DE RENDIMIENTOS LECAP
// ============================================================================

export const getCurvaRendimientos = createServerFn({ method: "GET" }).handler(async () => {
  let letras: any[] = [];
  try {
    const r = await fetch("https://api.argentinadatos.com/v1/finanzas/letras", {
      cache: "no-store",
    });
    if (r.ok) letras = await r.json();
  } catch {
    return { error: "Datos de letras no disponibles", puntos: [] };
  }

  if (!Array.isArray(letras) || letras.length === 0) {
    return { error: "Datos de letras no disponibles", puntos: [] };
  }

  const ahora = new Date();
  const puntos = letras
    .map((l: any) => {
      const vto = new Date(l.fechaVencimiento);
      const dias = Math.round((vto.getTime() - ahora.getTime()) / 86400000);
      if (dias <= 0) return null;
      const meses = dias / 30;
      const temMensual = l.tem ?? null;
      const temAnual = temMensual != null ? (Math.pow(1 + temMensual / 100, 12) - 1) * 100 : null;
      return {
        ticker: l.ticker,
        fechaEmision: l.fechaEmision,
        fechaVencimiento: l.fechaVencimiento,
        diasAlVencimiento: dias,
        temMensual: temMensual != null ? +temMensual.toFixed(2) : null,
        temAnual: temAnual != null ? +temAnual.toFixed(2) : null,
        vpv: l.vpv,
        fuente: "ArgentinaDatos" as const,
      };
    })
    .filter((p: any) => p != null && p.diasAlVencimiento > 0);

  // Puntos USA de referencia
  const usaSymbols = ["TLT", "IEF", "SHY"];
  const usaPuntos = await Promise.all(
    usaSymbols.map(async (sym) => {
      try {
        const r = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=5d&interval=1d`,
          { cache: "no-store" },
        );
        if (!r.ok) return null;
        const j = await r.json();
        const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
        const precio = closes[closes.length - 1];
        const diasMap: Record<string, number> = { TLT: 7300, IEF: 2920, SHY: 730 };
        return {
          ticker: sym,
          diasAlVencimiento: diasMap[sym],
          temMensual: precio ? +((1 / precio) * 100).toFixed(2) : null,
          temAnual: null,
          fuente: "Yahoo Finance" as const,
        };
      } catch {
        return null;
      }
    }),
  );

  return {
    puntos: [...puntos, ...usaPuntos.filter((p): p is NonNullable<typeof p> => p != null)],
    error: null,
  };
});

// ============================================================================
// PROMPT 7: MERVAL USD PERCENTILES HISTÓRICOS
// ============================================================================

export const getMervalPercentiles = createServerFn({ method: "GET" })
  .validator(z.object({ periodo: z.enum(["5Y", "10Y", "MAX"]).default("10Y") }))
  .handler(async ({ data }) => {
    const mervalUSD = await fetchBCRA("merval_usd");
    if (mervalUSD.length === 0) return { error: "Serie Merval USD no disponible" };

    const años: Record<string, number> = { "5Y": 5, "10Y": 10, MAX: 100 };
    const d = new Date();
    d.setFullYear(d.getFullYear() - años[data.periodo]);
    const desde = d.toISOString().split("T")[0];
    const serieCompleta = filtrarRango(mervalUSD, desde);
    const valores = serieCompleta.map((p) => p.v).filter((v): v is number => v != null);

    if (valores.length === 0) return { error: "Sin datos en el período" };

    const sorted = [...valores].sort((a, b) => a - b);
    function pctil(pct: number): number {
      const idx = Math.floor((sorted.length * pct) / 100);
      return sorted[Math.min(idx, sorted.length - 1)];
    }

    const actual = valores[valores.length - 1];
    const menorActual = sorted.filter((v) => v < actual).length;
    const percentilActual = (menorActual / sorted.length) * 100;

    // Buckets de percentil 0-100 de a 10
    const buckets = [];
    for (let i = 0; i <= 90; i += 10) {
      const inf = pctil(i);
      const sup = pctil(i + 10);
      const enBucket = valores.filter((v) => v >= inf && v <= sup);
      // Retorno forward 252 días
      const retornos = [];
      for (const v of valores) {
        const idx = valores.indexOf(v);
        if (idx + 252 < valores.length && v >= inf && v <= sup) {
          retornos.push(((valores[idx + 252] - v) / v) * 100);
        }
      }
      const retMediano =
        retornos.length > 0
          ? [...retornos].sort((a, b) => a - b)[Math.floor(retornos.length / 2)]
          : null;
      buckets.push({
        rango: `${i}-${i + 10}`,
        nObservaciones: enBucket.length,
        retornoFwdMedianoPct: retMediano != null ? +retMediano.toFixed(2) : null,
      });
    }

    // Serie mensual (último de cada mes)
    const mensualMap = new Map<string, number>();
    for (const p of serieCompleta) {
      const mes = p.d.slice(0, 7);
      mensualMap.set(mes, p.v);
    }
    const serieMensual = [...mensualMap.entries()].map(([mes, v]) => ({ mes, mervalUSD: v }));

    return {
      serieMensual,
      valorActual: actual,
      percentilActual: +percentilActual.toFixed(1),
      percentiles: {
        p10: pctil(10),
        p25: pctil(25),
        p50: pctil(50),
        p75: pctil(75),
        p90: pctil(90),
      },
      buckets,
      mediaHistorica: +valores.reduce((s, v) => s + v, 0 / valores.length).toFixed(2),
      mediana: pctil(50),
    };
  });

// ============================================================================
// PROMPT 8: SCREENER CEDEARS POR EARNINGS SURPRISE
// ============================================================================

const UNIVERSO_CEDEARS = [
  "AAPL",
  "MSFT",
  "GOOGL",
  "AMZN",
  "META",
  "NVDA",
  "JPM",
  "BAC",
  "XOM",
  "CVX",
  "PFE",
  "GLOB",
  "MELI",
  "BABA",
  "DIS",
  "NFLX",
  "TSLA",
  "GLD",
  "SPY",
];

export const getCedarScreener = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fcfYieldMinPct: z.number().default(0),
      minSurprisePositivos: z.number().default(2),
    }),
  )
  .handler(async ({ data }) => {
    const resultados: any[] = [];

    const lotes = [];
    for (let i = 0; i < UNIVERSO_CEDEARS.length; i += 4) {
      lotes.push(UNIVERSO_CEDEARS.slice(i, i + 4));
    }

    for (const lote of lotes) {
      const res = await Promise.all(
        lote.map(async (ticker) => {
          try {
            const r = await fetch(
              `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=earningsHistory,financialData,price,defaultKeyStatistics`,
              { cache: "no-store" },
            );
            if (!r.ok) return null;
            const j = await r.json();
            const q = j?.quoteSummary?.result?.[0];
            if (!q) return null;

            const earningsHistory = q.earningsHistory?.history ?? [];
            const surprises = earningsHistory
              .slice(0, 4)
              .map((e: any) => e.surprisePercent?.raw ?? null)
              .filter((s: any) => s != null);
            const surpriseScore = surprises.filter((s: number) => s > 0).length;
            const surpriseProm =
              surprises.length > 0
                ? surprises.reduce((s: number, v: number) => s + v, 0) / surprises.length
                : null;
            const fcf = q.financialData?.freeCashflow?.raw ?? null;
            const mktCap = q.price?.marketCap?.raw ?? null;
            const fcfYield =
              fcf != null && mktCap != null && mktCap > 0 ? (fcf / mktCap) * 100 : null;
            const precio =
              q.financialData?.currentPrice?.raw ?? q.price?.regularMarketPrice?.raw ?? null;

            if (surprises.length < 2) return null;
            if (fcfYield != null && fcfYield < data.fcfYieldMinPct) return null;
            if (surpriseScore < data.minSurprisePositivos) return null;

            return {
              ticker,
              fcfYield: fcfYield != null ? +fcfYield.toFixed(2) : null,
              surpriseScore,
              surpriseProm: surpriseProm != null ? +surpriseProm.toFixed(1) : null,
              precio: precio != null ? +precio.toFixed(2) : null,
              surprises: surprises.slice(0, 4).map((s: number) => (s > 0 ? "+" : "-")),
            };
          } catch {
            return null;
          }
        }),
      );
      for (const r of res) if (r) resultados.push(r);
    }

    return resultados.sort(
      (a, b) => b.surpriseScore - a.surpriseScore || (b.fcfYield ?? 0) - (a.fcfYield ?? 0),
    );
  });

// ============================================================================
// PROMPT 9: CORRELACIONES MÓVILES CEDEARS VS MACRO
// ============================================================================

export const getCorrelacionesMoviles = createServerFn({ method: "POST" })
  .validator(z.object({ ticker: z.string().min(1), ventana: z.number().default(120) }))
  .handler(async ({ data }) => {
    const [tickerChart, usd, merval, spyChart, gldChart] = await Promise.all([
      fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${data.ticker}?range=5y&interval=1d`,
        { cache: "no-store" },
      ).then((r) => (r.ok ? r.json() : null)),
      fetchBCRA("usd"),
      fetchBCRA("merval_usd"),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/SPY?range=5y&interval=1d`, {
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/GLD?range=5y&interval=1d`, {
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
    ]);

    if (!tickerChart)
      return { error: `Ticker ${data.ticker} no encontrado o sin datos suficientes`, serie: [] };

    function extraerPrecios(chart: any): PuntoSerie[] {
      const ts = chart?.chart?.result?.[0]?.timestamp ?? [];
      const cls =
        chart?.chart?.result?.[0]?.indicators?.adjclose?.[0]?.adjclose ??
        chart?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ??
        [];
      return ts
        .map((t: number, i: number) => ({
          d: new Date(t * 1000).toISOString().split("T")[0],
          v: cls[i],
        }))
        .filter((p: PuntoSerie) => p.v != null);
    }

    const tk = extraerPrecios(tickerChart);
    const sp = spyChart ? extraerPrecios(spyChart) : [];
    const gld = gldChart ? extraerPrecios(gldChart) : [];

    const ventana = data.ventana;
    const fechas = [...new Set([...tk, ...usd, ...merval, ...sp, ...gld].map((p) => p.d))].sort();

    if (fechas.length < ventana * 1.5)
      return { error: "Período insuficiente para la ventana seleccionada", serie: [] };

    function retDiarios(arr: PuntoSerie[]): { d: string; r: number }[] {
      const res: { d: string; r: number }[] = [];
      for (let i = 1; i < arr.length; i++) {
        if (arr[i - 1].v > 0)
          res.push({ d: arr[i].d, r: (arr[i].v - arr[i - 1].v) / arr[i - 1].v });
      }
      return res;
    }

    const rtTk = retDiarios(tk);
    const rtUSD = retDiarios(usd);
    const rtMerv = retDiarios(merval);
    const rtSP = retDiarios(sp);
    const rtGLD = retDiarios(gld);

    function correlacionMovil(
      rtA: { d: string; r: number }[],
      rtB: { d: string; r: number }[],
      vent: number,
    ): { d: string; corr: number }[] {
      const comunes = rtA.filter((a) => rtB.find((b) => b.d === a.d));
      const corrs: { d: string; corr: number }[] = [];
      for (let i = vent; i < comunes.length; i++) {
        const slice = comunes.slice(i - vent, i);
        const rA = slice.map((s) => s.r);
        const rB = slice.map((s) => rtB.find((b) => b.d === s.d)?.r ?? 0);
        const mA = rA.reduce((s, v) => s + v, 0) / rA.length;
        const mB = rB.reduce((s, v) => s + v, 0) / rB.length;
        const num = rA.reduce((s, v, j) => s + (v - mA) * (rB[j] - mB), 0);
        const dA = Math.sqrt(rA.reduce((s, v) => s + (v - mA) ** 2, 0));
        const dB = Math.sqrt(rB.reduce((s, v) => s + (v - mB) ** 2, 0));
        corrs.push({ d: comunes[i].d, corr: dA && dB ? num / (dA * dB) : 0 });
      }
      return corrs;
    }

    return {
      serie: fechas.map((f) => ({
        fecha: f,
        usd: correlacionMovil(rtTk, rtUSD, ventana).find((c) => c.d === f)?.corr ?? null,
        merval: correlacionMovil(rtTk, rtMerv, ventana).find((c) => c.d === f)?.corr ?? null,
        spy: correlacionMovil(rtTk, rtSP, ventana).find((c) => c.d === f)?.corr ?? null,
        gld: correlacionMovil(rtTk, rtGLD, ventana).find((c) => c.d === f)?.corr ?? null,
      })),
      error: null,
    };
  });

// ============================================================================
// PROMPT 10: LIQUIDEZ BANCARIA SISTÉMICA
// ============================================================================

export const getLiquidezSistemica = createServerFn({ method: "GET" })
  .validator(z.object({ periodo: z.enum(["5Y", "10Y", "MAX"]).default("10Y") }))
  .handler(async ({ data }) => {
    const [reservas, depositos, prestamosDepositos, efectivo, depositosBCRA, milestones] =
      await Promise.all([
        fetchBCRA("reservas"),
        fetchBCRA("depositos"),
        fetchBCRA("porc_prestamos_vs_depositos"),
        fetchBCRA("efectivo_en_ent_fin"),
        fetchBCRA("depositos_cuenta_ent_fin"),
        fetchBCRA("milestones"),
      ]);

    const años: Record<string, number> = { "5Y": 5, "10Y": 10, MAX: 100 };
    const d = new Date();
    d.setFullYear(d.getFullYear() - años[data.periodo]);
    const desde = d.toISOString().split("T")[0];

    const res = filtrarRango(reservas, desde);
    const dep = filtrarRango(depositos, desde);
    const pd = filtrarRango(prestamosDepositos, desde);
    const ef = filtrarRango(efectivo, desde);
    const db = filtrarRango(depositosBCRA, desde);
    const ms = (milestones as unknown as Milestone[]).filter((m) => m.d >= desde);

    // Agrupar por mes (último valor de cada mes)
    function ultimoPorMes(arr: PuntoSerie[]): Map<string, number> {
      const m = new Map<string, number>();
      for (const p of arr) {
        const mes = p.d.slice(0, 7);
        m.set(mes, p.v);
      }
      return m;
    }

    const mRes = ultimoPorMes(res);
    const mDep = ultimoPorMes(dep);
    const mPD = ultimoPorMes(pd);
    const mEf = ultimoPorMes(ef);
    const mDB = ultimoPorMes(db);

    const meses = [
      ...new Set([...mRes.keys(), ...mDep.keys(), ...mPD.keys(), ...mEf.keys(), ...mDB.keys()]),
    ].sort();

    const scores: { mes: string; score: number | null; componentes: number }[] = [];

    const allScores: number[] = [];
    for (const mes of meses) {
      const r = mRes.get(mes) ?? null;
      const d = mDep.get(mes) ?? null;
      const pdV = mPD.get(mes) ?? null;
      const efV = mEf.get(mes) ?? null;
      const dbV = mDB.get(mes) ?? null;

      const ratioEncaje = efV != null && dbV != null && d != null && d > 0 ? (efV + dbV) / d : null;
      const ratioPD = pdV != null ? 100 - pdV : null;
      const ratioReservas = r;

      const vals = [ratioEncaje, ratioPD, ratioReservas].filter((x): x is number => x != null);
      const score = vals.length >= 2 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      if (score != null) allScores.push(score);
      scores.push({ mes, score, componentes: vals.length });
    }

    const scoreActual = scores.filter((s) => s.score != null);
    const actual = scoreActual.length > 0 ? scoreActual[scoreActual.length - 1].score : null;
    const sortedScores = [...allScores].sort((a, b) => a - b);
    const percentilActual =
      actual != null
        ? (sortedScores.filter((s) => s < actual).length / sortedScores.length) * 100
        : null;

    // 5 mínimos históricos
    const minimos = scores
      .filter((s) => s.score != null)
      .sort((a, b) => a.score! - b.score!)
      .slice(0, 5);

    return {
      serie: scores,
      scoreActual: actual != null ? +actual.toFixed(1) : null,
      percentilActual: percentilActual != null ? +percentilActual.toFixed(1) : null,
      minimosHistoricos: minimos.map((m) => ({ fecha: m.mes, score: +m.score!.toFixed(1) })),
      milestones: ms,
      componentesActuales: scores.length > 0 ? scores[scores.length - 1].componentes : 0,
    };
  });
