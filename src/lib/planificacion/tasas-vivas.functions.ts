// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "../herramientas/cache";
import { getRiskFreeRateETTI } from "../herramientas/renta-fija.functions";

export interface TasasVivasPlanificacion {
  caucion7d: number | null;
  mejorPF: { entidad: string; tna: number; tnaNoClientes: number | null } | null;
  fciMM: { fondo: string; teaAnual: number | null; tnaAprox: number | null } | null;
  lecapTea: number | null;
  inflacionMensual: number | null;
  inflacionAnual: number | null;
  timestamp: string;
}

function normTna(v: number | null | undefined): number {
  if (v == null || !isFinite(v)) return 0;
  // ArgentinaDatos suele dar % (ej 45 = 45% anual). Si viene fracción (0.24 = 24%) → ×100. Umbral 5 distingue.
  return v > 0 && v < 5 ? v * 100 : v;
}
async function fetchPlazoFijo(): Promise<TasasVivasPlanificacion["mejorPF"]> {
  try {
    const r = await fetch("https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo", { cache: "no-store" });
    if (!r.ok) return null;
    const arr: any[] = await r.json();
    let best: any = null; let bestT = -1;
    for (const x of arr) {
      const t = normTna(x.tnaClientes ?? x.tnaNoClientes ?? 0);
      if (t > bestT) { bestT = t; best = { ...x, _tnaNorm: t }; }
    }
    if (!best) return null;
    return { entidad: best.entidad ?? "", tna: best._tnaNorm ?? normTna(best.tnaClientes ?? best.tnaNoClientes ?? 0), tnaNoClientes: normTna(best.tnaNoClientes) || null };
  } catch { return null; }
}
async function fetchFciMM(): Promise<TasasVivasPlanificacion["fciMM"]> {
  try {
    const [rU, rP] = await Promise.all([
      fetch("https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/ultimo", { cache: "no-store" }),
      fetch("https://api.argentinadatos.com/v1/finanzas/fci/mercadoDinero/penultimo", { cache: "no-store" }),
    ]);
    if (!rU.ok) return null;
    const arr: any[] = await rU.json();
    let penMap = new Map<string, number>();
    if (rP.ok) {
      const pen: any[] = await rP.json();
      penMap = new Map(pen.map((p) => [p.fondo, p.vcp ?? 0]));
    }
    let best: any = null; let bestVar = -Infinity;
    for (const f of arr) {
      const vcp = f.vcp ?? 0; const prev = penMap.get(f.fondo) ?? 0;
      const d = prev > 0 ? ((vcp - prev) / prev) * 100 : 0;
      const anual = d != null ? (Math.pow(1 + d / 100, 365) - 1) * 100 : null;
      if (anual != null && anual > bestVar) { bestVar = anual; best = { f, anual, diaria: d }; }
    }
    if (!best) return null;
    const tea = best.anual; const tnaAprox = tea != null ? (Math.pow(1 + tea/100, 1/12)-1)*12*100 : null;
    return { fondo: best.f.fondo ?? "", teaAnual: tea, tnaAprox };
  } catch { return null; }
}
async function fetchInflacion(): Promise<{ mensual: number | null; anual: number | null }> {
  let mensual: number | null = null; let anual: number | null = null;
  try { const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacion", { cache: "no-store" }); if (r.ok) { const a: any[] = await r.json(); mensual = a.length ? a[a.length-1].valor : null; } } catch {}
  try { const r = await fetch("https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual", { cache: "no-store" }); if (r.ok) { const a: any[] = await r.json(); anual = a.length ? a[a.length-1].valor : null; } } catch {}
  return { mensual, anual };
}
async function fetchLecapTea(): Promise<number | null> {
  try {
    const r = await fetch("https://api.argentinadatos.com/v1/finanzas/letras", { cache: "no-store" });
    if (!r.ok) return null;
    const arr: any[] = await r.json();
    // filtrar vigentes con tem>0 y dias>0
    let best: any = null; let bestTea = -1;
    const hoy = Date.now();
    for (const l of arr) {
      const tem = l.tem ?? 0; if (tem <= 0) continue;
      const tea = (Math.pow(1 + tem/100, 12)-1)*100;
      const dias = l.fechaVencimiento ? Math.round((new Date(l.fechaVencimiento).getTime()-hoy)/86400000) : 999;
      if (dias <= 0 || dias > 400) continue;
      if (tea > bestTea) { bestTea = tea; best = l; }
    }
    return bestTea > 0 ? +bestTea.toFixed(2) : null;
  } catch { return null; }
}

export const getTasasVivasPlanificacion = createServerFn({ method: "GET" }).handler(async (): Promise<TasasVivasPlanificacion> => {
  const cached = getCached<TasasVivasPlanificacion>("tasasVivasPlanificacion");
  if (cached) return cached;
  const [cau, pf, fci, infl, ltea] = await Promise.all([
    getRiskFreeRateETTI().catch(()=>0.05),
    fetchPlazoFijo(),
    fetchFciMM(),
    fetchInflacion(),
    fetchLecapTea(),
  ]);
  // fallback escalonado: si caución es fallback 0.05 sin IOL, usa PF vivo como proxy r (no ideal pero mejor que 5% fijo)
  let caucionNorm = typeof cau === "number" && isFinite(cau) ? cau : 0.05;
  const pfTnaDec = pf?.tna != null ? pf.tna / 100 : 0;
  const isFallback = caucionNorm === 0.05;
  if (isFallback && pfTnaDec > 0) {
    // PF TNA → tasa diaria equivalente para 7d aprox: r7d ≈ TNA *7/365
    caucionNorm = pfTnaDec * 7 / 365;
  }
  const out: TasasVivasPlanificacion = {
    caucion7d: caucionNorm,
    mejorPF: pf,
    fciMM: fci,
    lecapTea: ltea,
    inflacionMensual: infl.mensual,
    inflacionAnual: infl.anual,
    timestamp: new Date().toISOString(),
  };
  setCache("tasasVivasPlanificacion", out, 15*60*1000);
  return out;
});
