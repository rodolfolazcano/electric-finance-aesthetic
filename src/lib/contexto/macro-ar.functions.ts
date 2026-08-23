// @ts-nocheck
// src/lib/contexto/macro-ar.functions.ts — Snapshot macro local
// Fetch paralelo con fallbacks parciales, cache 10m. Nunca throw (fallback null).

import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "@/lib/cache";
import { tasaRealFisherExacta } from "@/lib/math/calculo-financiero.functions";
import type { MacroARSnapshot } from "./contracts";
import { macroARSnapshotFallback } from "./contracts";

async function fetchJson<T>(url: string, timeoutMs = 7000): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" as any, headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export const getMacroAR = createServerFn({ method: "GET" }).handler(async (): Promise<MacroARSnapshot> => {
  const now = new Date();
  const cacheKey = `ctx-macro-${now.toISOString().slice(0, 13)}`; // por hora
  const cached = getCached<MacroARSnapshot>(cacheKey, 10 * 60 * 1000);
  if (cached) return cached;

  const fb = macroARSnapshotFallback();

  try {
    // ── Paralelo ──────────────────────────────────────────────────
    const [dolarCripto, dolarOfiAD, riesgo, infla, inflaHist, bcraVars, tc90] = await Promise.all([
      // CriptoYa — blue/MEP/CCL + oficial cripto
      fetchJson<any>("https://criptoya.com/api/dolar").catch(() => null),
      // ArgentinaDatos — oficial (fallback)
      fetchJson<any>("https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial").catch(() => null),
      // Riesgo país último
      fetchJson<any>("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo").catch(() => null),
      // Inflación mensual último
      fetchJson<any>("https://api.argentinadatos.com/v1/finanzas/indices/inflacion").catch(() => null),
      // Inflación histórico para YTD (últimos 12)
      fetchJson<any>("https://api.argentinadatos.com/v1/finanzas/indices/inflacion").catch(() => null),
      // BCRA Principales Variables v2 — intentar, fallback a v4 Monetarias
      (async () => {
        // v2 PrincipalesVariables
        const v2 = await fetchJson<any>("https://api.bcra.gob.ar/estadisticas/v2.0/PrincipalesVariables").catch(() => null);
        if (v2?.results?.length) return v2;
        // fallback v4 Monetarias: reservas (1), base (3), circulante (4), Badlar (5?), tasa política (6)
        const ids = [1, 3, 4, 5, 6];
        const res = await Promise.all(ids.map((id) => fetchJson<any>(`https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/${id}?Limit=1`).catch(() => null)));
        return { fallback: true, res };
      })(),
      // TC serie 90d — CCL histórico ArgentinaDatos
      fetchJson<any>("https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui").catch(() => null),
    ]);

    // ── Dólar ─────────────────────────────────────────────────────
    const dolar = { ...fb.dolar };
    if (dolarCripto) {
      // CriptoYa /api/dolar: { oficial:{price}, blue:{price}, mep:{price}, ccl:{price} } o variantes
      const pick = (obj: any, keys: string[]) => {
        for (const k of keys) if (obj?.[k]?.price != null) return Number(obj[k].price);
        for (const k of keys) if (obj?.[k] != null && typeof obj[k] === "number") return Number(obj[k]);
        return null;
      };
      dolar.blue = pick(dolarCripto, ["blue"]) ?? dolar.blue;
      dolar.mep = pick(dolarCripto, ["mep", "bolsa"]) ?? dolar.mep;
      dolar.ccl = pick(dolarCripto, ["ccl", "contadoconliqui"]) ?? dolar.ccl;
      dolar.oficial = pick(dolarCripto, ["oficial", "mayorista"]) ?? dolar.oficial;
    }
    // ArgentinaDatos oficial como fallback/confirmación
    if (dolarOfiAD) {
      const arr = Array.isArray(dolarOfiAD) ? dolarOfiAD : dolarOfiAD?.data ?? [];
      const last = Array.isArray(arr) ? arr[arr.length - 1] : null;
      const v = last?.venta ?? last?.valor ?? last?.price;
      if (v != null && dolar.oficial == null) dolar.oficial = Number(v);
    }

    // ── Riesgo país ───────────────────────────────────────────────
    let riesgoPais: number | null = fb.riesgoPais;
    if (riesgo?.valor != null) riesgoPais = Number(riesgo.valor);
    else if (riesgo?.ultimo?.valor != null) riesgoPais = Number(riesgo.ultimo.valor);

    // ── Inflación ─────────────────────────────────────────────────
    let inflacionMensual: number | null = fb.inflacionMensual;
    let inflacionYTD: number | null = fb.inflacionYTD;
    if (infla && Array.isArray(infla) && infla.length) {
      const last = infla[infla.length - 1];
      inflacionMensual = last?.valor ?? last?.value ?? null;
      if (inflacionMensual != null) inflacionMensual = Number(inflacionMensual);
      // YTD: suma últimos 12 meses (aprox) o campo ytd si existe
      const last12 = infla.slice(-12);
      const ytd = last12.reduce((acc: number, cur: any) => acc + (Number(cur.valor ?? cur.value) || 0), 0);
      inflacionYTD = isFinite(ytd) ? Math.round(ytd * 100) / 100 : null;
    } else if (infla?.valor != null) {
      inflacionMensual = Number(infla.valor);
    }

    // ── BCRA ──────────────────────────────────────────────────────
    let reservasUSD: number | null = fb.reservasUSD;
    let baseMonetaria: number | null = fb.baseMonetaria;
    let circulante: number | null = fb.circulante;
    let badlar: number | null = fb.badlar;
    let tasaPoliticaMonetaria: number | null = fb.tasaPoliticaMonetaria;

    if (bcraVars) {
      if (bcraVars.results && Array.isArray(bcraVars.results)) {
        // v2 PrincipalesVariables: buscar por descripcion
        const find = (needle: string) => bcraVars.results.find((r: any) => String(r.descripcion ?? r.variable ?? "").toLowerCase().includes(needle));
        const rRes = find("reservas");
        const rBase = find("base monetaria");
        const rCirc = find("circulante") ?? find("billetes");
        const rBad = find("badlar");
        const rTasa = find("tasa") ?? find("politica");
        const num = (x: any) => (x?.valor != null ? Number(String(x.valor).replace(/,/g, "")) : null);
        if (rRes) reservasUSD = num(rRes);
        if (rBase) baseMonetaria = num(rBase);
        if (rCirc) circulante = num(rCirc);
        if (rBad) badlar = num(rBad);
        if (rTasa) tasaPoliticaMonetaria = num(rTasa);
      } else if (bcraVars.fallback) {
        const [r1, r3, r4, r5, r6] = bcraVars.res;
        const numV = (j: any) => {
          const v = j?.results?.[0]?.valor ?? j?.results?.[0]?.value;
          return v != null ? Number(String(v).replace(/,/g, "")) : null;
        };
        reservasUSD = numV(r1) ?? reservasUSD;
        baseMonetaria = numV(r3) ?? baseMonetaria;
        circulante = numV(r4) ?? circulante;
        badlar = numV(r5) ?? badlar;
        tasaPoliticaMonetaria = numV(r6) ?? tasaPoliticaMonetaria;
      }
    }

    // ── TC serie 90d ──────────────────────────────────────────────
    let tcSerie90d: MacroARSnapshot["tcSerie90d"] = [];
    if (tc90 && Array.isArray(tc90) && tc90.length) {
      const slice = tc90.slice(-90);
      tcSerie90d = slice
        .map((r: any) => ({
          fecha: String(r.fecha ?? r.date ?? "").slice(0, 10),
          valor: Number(r.venta ?? r.compra ?? r.valor ?? r.price),
        }))
        .filter((x) => x.fecha && isFinite(x.valor));
    }

    // ── Régimen Fisher exacto ─────────────────────────────────────
    let regimenFisher: MacroARSnapshot["regimenFisher"] = { realExacta: null, nominal: null, inflImpl: null };
    if (badlar != null && inflacionMensual != null) {
      const nominal = badlar / 100; // Badlar viene en % anual
      const inflMensualDec = inflacionMensual / 100;
      const inflAnualizada = Math.pow(1 + inflMensualDec, 12) - 1;
      try {
        const realExacta = tasaRealFisherExacta(nominal, inflAnualizada);
        regimenFisher = {
          realExacta: isFinite(realExacta) ? Math.round(realExacta * 10000) / 100 : null,
          nominal: Math.round(nominal * 10000) / 100,
          inflImpl: Math.round(inflAnualizada * 10000) / 100,
        };
      } catch {
        regimenFisher = { realExacta: null, nominal: Math.round(nominal * 10000) / 100, inflImpl: Math.round(inflAnualizada * 10000) / 100 };
      }
    }

    const out: MacroARSnapshot = {
      dolar,
      riesgoPais,
      inflacionMensual,
      inflacionYTD,
      badlar,
      tasaPoliticaMonetaria,
      reservasUSD,
      baseMonetaria,
      circulante,
      tcSerie90d,
      regimenFisher,
      timestamp: new Date().toISOString(),
    };

    setCache(cacheKey, out);
    return out;
  } catch (e) {
    console.warn("[ctx] getMacroAR fallback", e);
    return macroARSnapshotFallback();
  }
});
