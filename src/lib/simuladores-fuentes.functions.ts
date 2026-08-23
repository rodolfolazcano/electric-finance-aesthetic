// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCached, setCache } from "./herramientas/cache";

const AD = "https://api.argentinadatos.com";
const BCRA_V4 = "https://api.bcra.gob.ar/estadisticas/v4.0";
const IOL = "https://api.invertironline.com";

// ---------- helpers ----------
function normPfTna(v: any): number | null {
  const n = typeof v === "number" ? v : null;
  if (n == null || !isFinite(n)) return null;
  return n > 0 && n < 5 ? +(n * 100).toFixed(2) : n;
}
function clampRate(v: number | null, lo = 0, hi = 200): number | null {
  if (v == null || !isFinite(v)) return null;
  if (v < lo || v > hi) return null;
  return Math.round(v * 100) / 100;
}
function tnaToTeaDiaria(tnaPct: number): number {
  return (Math.pow(1 + tnaPct / 100 / 365, 365) - 1) * 100;
}

export interface FuenteOpcion { id: string; label: string; tna: number; tea: number; tem: number | null; detalle?: string }
export interface SimuladorFuentes {
  pf: { opciones: FuenteOpcion[]; promedio: number | null; mejor: number | null; timestamp: string };
  pfUva: { opciones: FuenteOpcion[]; promedio: number | null; mejor: number | null; timestamp: string };
  fciMM: { opciones: FuenteOpcion[]; promedio: number | null; mejor: number | null; mediana: number | null; timestamp: string };
  lecap: { opciones: FuenteOpcion[]; promedio: number | null; mejor: number | null; timestamp: string };
  caucion: { opciones: FuenteOpcion[]; promedio: number | null; mejor: number | null; fuente: string; timestamp: string };
  inflacion: { mensual: number | null; interanual: number | null; fuente: string; timestamp: string };
  bcra: { badlar: number | null; tasaDepositos30: number | null };
}

async function fetchPfFuentes(): Promise<SimuladorFuentes["pf"]> {
  try {
    const r = await fetch(`${AD}/v1/finanzas/tasas/plazoFijo`, { cache: "no-store" });
    if (!r.ok) return { opciones: [], promedio: null, mejor: null, timestamp: new Date().toISOString() };
    const arr: any[] = await r.json();
    const tnaVals: number[] = [];
    const opciones: FuenteOpcion[] = [];
    for (const x of arr) {
      const tna = normPfTna(x.tnaClientes);
      if (tna == null) continue;
      const tea = clampRate((Math.pow(1 + tna / 100 / 12, 12) - 1) * 100);
      if (tea == null) continue;
      tnaVals.push(tna);
      opciones.push({ id: x.entidad ?? String(opciones.length), label: x.entidad ?? "Entidad", tna, tea, tem: clampRate((Math.pow(1 + tna / 100 / 12, 12) - 1) * 100), detalle: x.tnaNoClientes != null ? `No clientes ${normPfTna(x.tnaNoClientes)}%` : undefined });
    }
    opciones.sort((a, b) => b.tna - a.tna);
    const promedio = tnaVals.length ? clampRate(tnaVals.reduce((s, v) => s + v, 0) / tnaVals.length) : null;
    const mejor = tnaVals.length ? Math.max(...tnaVals) : null;
    return { opciones: opciones.slice(0, 18), promedio, mejor, timestamp: new Date().toISOString() };
  } catch { return { opciones: [], promedio: null, mejor: null, timestamp: new Date().toISOString() }; }
}

async function fetchUvaFuentes(): Promise<SimuladorFuentes["pfUva"]> {
  try {
    const r = await fetch(`${AD}/v1/finanzas/tasas/plazoFijoUvaPagoPeriodico`, { cache: "no-store" });
    if (!r.ok) return { opciones: [], promedio: null, mejor: null, timestamp: new Date().toISOString() };
    const arr: any[] = await r.json();
    const opciones: FuenteOpcion[] = [];
    const tnaVals: number[] = [];
    for (const prov of arr) {
      for (const t of prov.tasas ?? []) {
        let tna = typeof t.tna === "number" && t.tna > 0 && t.tna < 1 ? t.tna * 100 : t.tna ?? 0;
        let tea = typeof t.tea === "number" && t.tea > 0 && t.tea < 1 ? t.tea * 100 : t.tea ?? 0;
        tna = clampRate(tna) ?? 0;
        tea = clampRate(tea) ?? 0;
        // Sanity: TNA real UVA en rango 0-15%
        if (tna <= 0 || tna > 15) continue;
        if ((t.plazoMinDias ?? 0) < 90) continue;
        const tem = tea > 0 ? clampRate((Math.pow(1 + tea / 100, 1 / 12) - 1) * 100) : null;
        tnaVals.push(tna);
        opciones.push({ id: `${prov.id ?? prov.entidad}-${t.nombre ?? t.plazoMinDias}`, label: `${prov.entidad} — ${t.nombre ?? `${t.plazoMinDias}-${t.plazoMaxDias}d`}`, tna, tea, tem, detalle: `${t.plazoMinDias}-${t.plazoMaxDias}d` });
      }
    }
    opciones.sort((a, b) => b.tna - a.tna);
    const promedio = tnaVals.length ? clampRate(tnaVals.reduce((s, v) => s + v, 0) / tnaVals.length) : null;
    const mejor = tnaVals.length ? Math.max(...tnaVals) : null;
    return { opciones: opciones.slice(0, 12), promedio, mejor, timestamp: new Date().toISOString() };
  } catch { return { opciones: [], promedio: null, mejor: null, timestamp: new Date().toISOString() }; }
}

async function fetchFciFuentes(): Promise<SimuladorFuentes["fciMM"]> {
  try {
    const [rUlt, rPen] = await Promise.all([
      fetch(`${AD}/v1/finanzas/fci/mercadoDinero/ultimo`, { cache: "no-store" }),
      fetch(`${AD}/v1/finanzas/fci/mercadoDinero/penultimo`, { cache: "no-store" }),
    ]);
    if (!rUlt.ok) return { opciones: [], promedio: null, mejor: null, mediana: null, timestamp: new Date().toISOString() };
    const ult: any[] = await rUlt.json();
    let penMap = new Map<string, number>();
    if (rPen.ok) {
      const pen: any[] = await rPen.json();
      penMap = new Map(pen.map((p) => [p.fondo, p.vcp ?? 0]));
    }
    const clean: { label: string; tea: number; patrimonio: number }[] = [];
    for (const item of ult) {
      const vcp = item.vcp ?? 0;
      const vcpPen = penMap.get(item.fondo) ?? 0;
      if (!vcp || !vcpPen || vcpPen <= 0) continue;
      const varDiaria = ((vcp - vcpPen) / vcpPen) * 100;
      // Sanity: descartar fondos con var diaria rota (>5%)
      if (Math.abs(varDiaria) > 5) continue;
      const tea = (Math.pow(1 + varDiaria / 100, 365) - 1) * 100;
      if (!isFinite(tea) || tea < 0 || tea > 120) continue;
      clean.push({ label: item.fondo ?? "FCI", tea: Math.round(tea * 100) / 100, patrimonio: item.patrimonio ?? 0 });
    }
    // Ordenar por patrimonio (representatividad), NO por TEA (outliers)
    clean.sort((a, b) => b.patrimonio - a.patrimonio);
    const top = clean.slice(0, 12);
    if (!top.length) return { opciones: [], promedio: null, mejor: null, mediana: null, timestamp: new Date().toISOString() };
    const teaVals = top.map((x) => x.tea).sort((a, b) => a - b);
    const promedio = clampRate(teaVals.reduce((s, v) => s + v, 0) / teaVals.length);
    const mejor = Math.max(...teaVals);
    const mediana = teaVals[Math.floor(teaVals.length / 2)];
    const opciones: FuenteOpcion[] = top.map((x) => ({
      id: x.label,
      label: x.label,
      tna: Math.round(((Math.pow(1 + x.tea / 100, 1 / 12) - 1) * 12 * 100) * 100) / 100,
      tea: x.tea,
      tem: clampRate((Math.pow(1 + x.tea / 100, 1 / 12) - 1) * 100),
    }));
    return { opciones, promedio, mejor, mediana: mediana ?? null, timestamp: new Date().toISOString() };
  } catch { return { opciones: [], promedio: null, mejor: null, mediana: null, timestamp: new Date().toISOString() }; }
}

async function fetchLecapFuentes(): Promise<SimuladorFuentes["lecap"]> {
  try {
    const r = await fetch(`${AD}/v1/finanzas/letras`, { cache: "no-store" });
    if (!r.ok) return { opciones: [], promedio: null, mejor: null, timestamp: new Date().toISOString() };
    const arr: any[] = await r.json();
    const hoy = new Date();
    const clean: FuenteOpcion[] = [];
    for (const l of arr) {
      const tem = typeof l.tem === "number" ? l.tem : null;
      if (tem == null || tem <= 0 || tem > 10) continue;
      const tea = (Math.pow(1 + tem / 100, 12) - 1) * 100;
      if (!isFinite(tea) || tea > 300) continue;
      const venc = new Date(l.fechaVencimiento ?? "");
      if (isNaN(venc.getTime())) continue;
      const dias = Math.round((venc.getTime() - hoy.getTime()) / 86400000);
      if (dias <= 0 || dias > 540) continue;
      clean.push({
        id: l.ticker ?? String(clean.length),
        label: l.ticker ?? "LECAP",
        tna: Math.round(tem * 12 * 100) / 100,
        tea: Math.round(tea * 100) / 100,
        tem: Math.round(tem * 100) / 100,
        detalle: `${dias}d · vto ${venc.toLocaleDateString("es-AR")}`,
      });
    }
    clean.sort((a, b) => (b.tem ?? 0) - (a.tem ?? 0));
    const tems = clean.map((x) => x.tem ?? 0).filter((v) => v > 0);
    const promedioTna = clean.length ? clampRate(clean.reduce((s, o) => s + o.tna, 0) / clean.length) : null;
    const mejorTna = clean.length ? Math.max(...clean.map((o) => o.tna)) : null;
    return { opciones: clean.slice(0, 16), promedio: promedioTna, mejor: mejorTna, timestamp: new Date().toISOString() };
  } catch { return { opciones: [], promedio: null, mejor: null, timestamp: new Date().toISOString() }; }
}

/** Caución bursátil BYMA — TNA por plazo.
 *  Primario: IOL Cotizaciones/Cauciones (requiere token de sesión).
 *  Fallback: panel público de PPI (datos BYMA). */
async function fetchCaucionFuentes(sessionId?: string | null): Promise<SimuladorFuentes["caucion"]> {
  const opciones: FuenteOpcion[] = [];
  let fuente = "";

  if (sessionId) {
    try {
      const res = await fetch(`${IOL}/api/v2/Cotizaciones/Cauciones/Todas/Argentina`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${sessionId}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const data = await res.json();
        for (const t of data?.titulos ?? []) {
          let tna = typeof t.tasaPromedio === "number" ? t.tasaPromedio : parseFloat(String(t.tasaPromedio ?? ""));
          if (!isFinite(tna)) continue;
          if (tna > 0 && tna < 1.5) tna *= 100; // fracción → %
          if (tna < 0 || tna > 150) continue;
          const dias = typeof t.plazo === "number" ? t.plazo : parseInt(String(t.plazo ?? ""), 10);
          if (!isFinite(dias) || dias <= 0) continue;
          opciones.push({ id: `iol-${dias}`, label: `Caución ${dias}d`, tna: Math.round(tna * 100) / 100, tea: Math.round(tnaToTeaDiaria(tna) * 100) / 100, tem: null, detalle: `${dias} días · promedio BYMA vía IOL` });
        }
        if (opciones.length) fuente = "IOL · BYMA";
      }
    } catch {}
  }

  if (!opciones.length) {
    try {
      const res = await fetch("https://www.portfoliopersonal.com/Cotizaciones/Cauciones", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36", "Accept-Language": "es-AR,es;q=0.9" },
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
      });
      if (res.ok) {
        const body = await res.text();
        for (const m of body.matchAll(/"ticker":"(PESOS\d+)"[\s\S]{0,400}?"lastPrice":([0-9.]+)/g)) {
          const dias = parseInt((m[1] ?? "").replace("PESOS", ""), 10);
          const valor = parseFloat(m[2] ?? "");
          if (isFinite(dias) && isFinite(valor) && valor > 0 && valor <= 150) {
            opciones.push({ id: `ppi-${dias}`, label: `Caución ${dias}d`, tna: +valor.toFixed(2), tea: Math.round(tnaToTeaDiaria(valor) * 100) / 100, tem: null, detalle: `${dias} días · PPI/BYMA` });
          }
        }
        if (opciones.length) fuente = "PPI · BYMA";
      }
    } catch {}
  }

  opciones.sort((a, b) => parseInt(a.id.replace(/\D/g, "") || "0") - parseInt(b.id.replace(/\D/g, "") || "0"));
  const tnas = opciones.map((o) => o.tna);
  return {
    opciones,
    promedio: tnas.length ? +(tnas.reduce((s, v) => s + v, 0) / tnas.length).toFixed(2) : null,
    mejor: tnas.length ? Math.max(...tnas) : null,
    fuente: fuente || "sin datos",
    timestamp: new Date().toISOString(),
  };
}

async function fetchInflacionFuentes(): Promise<{ mensual: number | null; interanual: number | null; fuente: string; timestamp: string }> {
  let mensual: number | null = null;
  let interanual: number | null = null;
  try {
    const r = await fetch(`${AD}/v1/finanzas/indices/inflacion`, { cache: "no-store" });
    if (r.ok) {
      const arr: { fecha: string; valor: number }[] = await r.json();
      if (arr.length) mensual = arr[arr.length - 1].valor;
    }
  } catch {}
  try {
    const r = await fetch(`${AD}/v1/finanzas/indices/inflacionInteranual`, { cache: "no-store" });
    if (r.ok) {
      const arr: { fecha: string; valor: number }[] = await r.json();
      if (arr.length) interanual = arr[arr.length - 1].valor;
    }
  } catch {}
  return { mensual, interanual, fuente: "ArgentinaDatos · INDEC/BCRA", timestamp: new Date().toISOString() };
}

async function fetchBcraFallback(): Promise<{ badlar: number | null; tasaDepositos30: number | null }> {
  try {
    const catR = await fetch(`${BCRA_V4}/Monetarias?Limit=300`, { cache: "no-store" });
    if (catR.ok) {
      const j = await catR.json();
      const results: any[] = j?.results ?? [];
      const findId = (kws: string[]) => {
        for (const kw of kws) {
          const hit = results.find((x: any) => (x.descripcion ?? "").toLowerCase().includes(kw));
          if (hit) return hit.idVariable;
        }
        return null;
      };
      const badlarId = findId(["badlar"]);
      const depoId = findId(["depósitos a 30 días del sector privado", "depósitos a 30 días", "depositos a 30"]);
      const getVal = async (id: number | null) => {
        if (id == null) return null;
        try {
          const r = await fetch(`${BCRA_V4}/Monetarias/${id}?Limit=1`, { cache: "no-store" });
          if (!r.ok) return null;
          const jj = await r.json();
          const det = jj?.results?.[0]?.detalle;
          if (!det?.length) return null;
          return det[det.length - 1]?.valor ?? null;
        } catch { return null; }
      };
      const [badlar, depo] = await Promise.all([getVal(badlarId), getVal(depoId)]);
      const out = { badlar: badlar != null ? clampRate(badlar, 0, 300) : null, tasaDepositos30: depo != null ? clampRate(depo, 0, 300) : null };
      if (out.badlar != null || out.tasaDepositos30 != null) return out;
    }
  } catch {}
  // Última instancia: ids fijos conocidos (BADLAR=7 usado por el proyecto, depósitos=34)
  try {
    const [r7, r34] = await Promise.all([
      fetch(`${BCRA_V4}/Monetarias/7?Limit=1`, { cache: "no-store" }),
      fetch(`${BCRA_V4}/Monetarias/34?Limit=1`, { cache: "no-store" }).catch(() => null),
    ]);
    const val = async (r: any) => {
      if (!r || !r.ok) return null;
      const j = await r.json();
      const d = j?.results?.[0]?.detalle;
      return d?.length ? clampRate(d[d.length - 1]?.valor, 0, 300) : null;
    };
    return { badlar: await val(r7), tasaDepositos30: await val(r34) };
  } catch {}
  return { badlar: null, tasaDepositos30: null };
}

export const getSimuladorFuentes = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().optional().nullable() }).parse(input ?? {}))
  .handler(async ({ data }): Promise<SimuladorFuentes> => {
    const authed = !!(data?.sessionId);
    const cacheKey = `simFuentes_v3_${authed ? "auth" : "anon"}`;
    const cached = getCached<SimuladorFuentes>(cacheKey);
    if (cached) return cached;
    const [pf, pfUva, fciMM, lecap, caucion, inflacion, bcra] = await Promise.all([
      fetchPfFuentes(), fetchUvaFuentes(), fetchFciFuentes(), fetchLecapFuentes(),
      fetchCaucionFuentes(data?.sessionId ?? null),
      fetchInflacionFuentes(), fetchBcraFallback(),
    ]);
    const result: SimuladorFuentes = { pf, pfUva, fciMM, lecap, caucion, inflacion, bcra };
    setCache(cacheKey, result, 10 * 60 * 1000);
    return result;
  });
