// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCached, setCache } from "./cache";

const AD = "https://api.argentinadatos.com";
const IOL = "https://api.invertironline.com";

export interface LecapItem {
  ticker: string;
  fechaEmision: string;
  fechaVencimiento: string;
  tem: number;
  tea: number;
  tna: number;
  tnaReal: number | null;
  vpv: number;
  precio: number | null;
  precioFuente: "iol" | "argentinadatos" | null;
  diasAlVencimiento: number;
  esCER: boolean;
}

export interface FciItem {
  fondo: string;
  fecha: string;
  vcp: number;
  ccp: number;
  patrimonio: number;
  horizonte: string;
  tipo: "rentaFija" | "mercadoDinero" | "rentaVariable" | "rentaMixta";
  variacionDiaria: number | null;
  variacionMensual: number | null;
  variacionAnual: number | null;
}

export interface FciHistorialItem {
  fecha: string;
  vcp: number;
}

export interface FciRendimiento {
  fondo: string;
  rendimientoMensual: number | null;
  rendimientoAnual: number | null;
  rendimientoAcumulado: number | null;
}

export interface InflacionData {
  mensual: number | null;
  anual: number | null;
  acumulada: number | null;
}

export interface LecapFciResult {
  lecaps: LecapItem[];
  fcis: FciItem[];
  inflacion: InflacionData;
  timestamp: string;
}

const FCI_TIPOS = ["rentaFija", "mercadoDinero", "rentaVariable", "rentaMixta"] as const;

async function fetchInflacion(): Promise<InflacionData> {
  let mensual: number | null = null;
  let interanual: number | null = null;
  let acumuladaYTD: number | null = null;

  try {
    const r = await fetch(`${AD}/v1/finanzas/indices/inflacionInteranual`, { cache: "no-store" });
    if (r.ok) {
      const arr: { fecha: string; valor: number }[] = await r.json();
      if (arr.length > 0) interanual = arr[arr.length - 1].valor;
    }
  } catch {}

  try {
    const r = await fetch(`${AD}/v1/finanzas/indices/inflacion`, { cache: "no-store" });
    if (r.ok) {
      const arr: { fecha: string; valor: number }[] = await r.json();
      if (arr.length >= 1) {
        mensual = arr[arr.length - 1].valor;
        const yearStart = `${new Date().getFullYear()}-01`;
        const ytd = arr.filter((v) => v.fecha >= yearStart);
        if (ytd.length > 0) acumuladaYTD = ytd.reduce((s, v) => s + v.valor, 0);
      }
    }
  } catch {}

  return { mensual, anual: interanual, acumulada: acumuladaYTD };
}

function parseFciTipo(tipo: string): FciItem["tipo"] {
  switch (tipo) {
    case "rentaFija":
      return "rentaFija";
    case "mercadoDinero":
      return "mercadoDinero";
    case "rentaVariable":
      return "rentaVariable";
    case "rentaMixta":
      return "rentaMixta";
    default:
      return "rentaFija";
  }
}

async function fetchFciByTipo(tipo: FciItem["tipo"]): Promise<FciItem[]> {
  try {
    const [rUlt, rPen] = await Promise.all([
      fetch(`${AD}/v1/finanzas/fci/${tipo}/ultimo`, { cache: "no-store" }),
      fetch(`${AD}/v1/finanzas/fci/${tipo}/penultimo`, { cache: "no-store" }),
    ]);
    if (!rUlt.ok) return [];
    const arr: any[] = await rUlt.json();
    let penMap = new Map<string, { vcp: number; fecha: string }>();
    if (rPen.ok) {
      const penArr: any[] = await rPen.json();
      penMap = new Map(penArr.map((p) => [p.fondo, { vcp: p.vcp ?? 0, fecha: p.fecha ?? "" }]));
    }
    return arr.map((item) => {
      const fondo = item.fondo ?? "";
      const pen = penMap.get(fondo);
      const vcp = item.vcp ?? 0;
      const ccp = item.ccp ?? 0;
      const variacionDiaria = pen && pen.vcp > 0 ? ((vcp - pen.vcp) / pen.vcp) * 100 : null;
      // Rough monthly estimate from daily var
      const variacionMensual = variacionDiaria != null ? variacionDiaria * 22 : null;
      const variacionAnual =
        variacionMensual != null ? Math.pow(1 + variacionMensual / 100, 12) - 1 : null;
      return {
        fondo,
        fecha: item.fecha ?? "",
        vcp,
        ccp,
        patrimonio: item.patrimonio ?? 0,
        horizonte: item.horizonte ?? "",
        tipo,
        variacionDiaria: variacionDiaria != null ? +variacionDiaria.toFixed(4) : null,
        variacionMensual: variacionMensual != null ? +variacionMensual.toFixed(4) : null,
        variacionAnual: variacionAnual != null ? +(variacionAnual * 100).toFixed(4) : null,
      };
    });
  } catch {
    return [];
  }
}

export const fetchLecapFciData = createServerFn({ method: "POST" })
  .validator(z.object({ sessionId: z.string().optional() }))
  .handler(async ({ data }): Promise<LecapFciResult> => {
    const cacheKey = `lecapFci_${data.sessionId ?? ""}`;
    const cached = getCached<LecapFciResult>(cacheKey);
    if (cached) return cached;

    const inflacion = await fetchInflacion();

    // Fetch BADLAR as fallback discount rate for TEM=0 LECAPs
    let badlarRate: number | null = null;
    try {
      const r = await fetch("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/7", {
        cache: "no-store",
      });
      if (r.ok) {
        const j = await r.json();
        const detalle = j?.results?.[0]?.detalle;
        if (detalle?.length > 0) badlarRate = detalle[detalle.length - 1].valor;
      }
    } catch {}

    const [rentaFija, mercadoDinero, rentaVariable, rentaMixta] = await Promise.all(
      FCI_TIPOS.map((t) => fetchFciByTipo(t)),
    );
    const lecaps = (await fetchLecaps(data.sessionId, badlarRate)).map((l) => ({
      ...l,
      tna: l.tem * 12,
      tnaReal: inflacion.mensual != null && l.tem > 0 ? l.tem * 12 - inflacion.mensual * 12 : null,
    }));
    const fcis = [...rentaFija, ...mercadoDinero, ...rentaVariable, ...rentaMixta];
    const result: LecapFciResult = { lecaps, fcis, inflacion, timestamp: new Date().toISOString() };
    setCache(cacheKey, result);
    return result;
  });

async function fetchLecaps(sessionId?: string, badlarRate?: number | null): Promise<LecapItem[]> {
  const lecaps: LecapItem[] = [];
  try {
    const r = await fetch(`${AD}/v1/finanzas/letras`, { cache: "no-store" });
    if (r.ok) {
      const arr: any[] = await r.json();
      for (const l of arr) {
        const ticker = l.ticker ?? "";
        const fechaEmision = l.fechaEmision ?? "";
        const fechaVencimiento = l.fechaVencimiento ?? "";
        const temRaw = l.tem ?? null;
        const vpv = l.vpv ?? 0;
        const venc = new Date(fechaVencimiento);
        const hoy = new Date();
        const dias = Math.round((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24));

        let precio: number | null = null;
        let precioFuente: "iol" | "argentinadatos" | null = null;
        if (sessionId) {
          try {
            const res = await fetch(`${IOL}/api/v2/BCBA/Titulos/${ticker}/Cotizacion`, {
              headers: { Authorization: `Bearer ${sessionId}` },
              cache: "no-store",
            });
            if (res.ok) {
              const j = await res.json();
              precio = j?.ultimoPrecio ?? j?.precio ?? null;
              if (precio != null) precioFuente = "iol";
            }
          } catch {}
        }

        let tem = temRaw ?? 0;

        // Si TEM no viene de ArgentinaDatos pero tenemos precio de IOL y VPV, calcular TEM
        if (
          (temRaw == null || temRaw <= 0) &&
          precio != null &&
          precio > 0 &&
          vpv > 0 &&
          dias > 0
        ) {
          tem = (Math.pow(vpv / precio, 30 / dias) - 1) * 100;
        }

        // Fallback: si TEM sigue siendo 0 y no hay precio IOL, usar BADLAR como tasa proxy
        if (
          tem <= 0 &&
          precio == null &&
          badlarRate != null &&
          badlarRate > 0 &&
          vpv > 0 &&
          dias > 0
        ) {
          tem = badlarRate / 12;
        }

        // Precio desde VPV + TEM (sea de API, IOL, o proxy BADLAR)
        if (precio == null && tem > 0 && dias > 0) {
          const meses = dias / 30;
          precio = vpv / Math.pow(1 + tem / 100, meses);
          if (precio > 0) precioFuente = "argentinadatos";
        }

        const tea = tem > 0 ? (Math.pow(1 + tem / 100, 12) - 1) * 100 : 0;
        const tna = tem * 12;

        if (dias <= 0) continue;
        lecaps.push({
          ticker,
          fechaEmision,
          fechaVencimiento,
          tem: Math.round(tem * 100) / 100,
          tea: Math.round(tea * 100) / 100,
          tna: Math.round(tna * 100) / 100,
          tnaReal: null,
          vpv,
          precio: precio != null && precio > 0 ? Math.round(precio * 100) / 100 : null,
          precioFuente,
          diasAlVencimiento: dias,
          esCER: false,
        });
      }
    }
  } catch {}
  return lecaps;
}

export interface PlazoFijoItem { entidad: string; tnaClientes: number | null; tnaNoClientes: number | null; logo: string | null; link?: string | null }
export interface PlazoFijoUvaItem { id: string; entidad: string; logo: string; nombre: string; plazoMinDias: number; plazoMaxDias: number; tna: number; tea: number }
function normPfTna(v: any): number | null { const n = typeof v === "number" ? v : null; if (n == null || !isFinite(n)) return null; return n > 0 && n < 5 ? +(n*100).toFixed(2) : n; }
export const fetchPlazoFijoTasas = createServerFn({ method: "GET" }).handler(async (): Promise<PlazoFijoItem[]> => {
  const cached = getCached<PlazoFijoItem[]>("plazoFijoTasas");
  if (cached) return cached;
  try {
    const r = await fetch(`${AD}/v1/finanzas/tasas/plazoFijo`, { cache: "no-store" });
    if (!r.ok) return [];
    const arr: any[] = await r.json();
    const out: PlazoFijoItem[] = arr.map((x) => ({ entidad: x.entidad ?? "", tnaClientes: normPfTna(x.tnaClientes), tnaNoClientes: normPfTna(x.tnaNoClientes), logo: x.logo ?? null, link: x.link ?? null }));
    setCache("plazoFijoTasas", out, 15 * 60 * 1000);
    return out;
  } catch { return []; }
});
export const fetchPlazoFijoUva = createServerFn({ method: "GET" }).handler(async (): Promise<PlazoFijoUvaItem[]> => {
  const cached = getCached<PlazoFijoUvaItem[]>("plazoFijoUva");
  if (cached) return cached;
  try {
    const r = await fetch(`${AD}/v1/finanzas/tasas/plazoFijoUvaPagoPeriodico`, { cache: "no-store" });
    if (!r.ok) return [];
    const arr: any[] = await r.json();
    const out: PlazoFijoUvaItem[] = [];
    for (const prov of arr) {
      for (const t of prov.tasas ?? []) {
        const ntna = typeof t.tna === "number" && t.tna > 0 && t.tna < 1 ? +(t.tna*100).toFixed(2) : t.tna ?? 0;
        const ntea = typeof t.tea === "number" && t.tea > 0 && t.tea < 1 ? +(t.tea*100).toFixed(2) : t.tea ?? 0;
        out.push({ id: prov.id ?? "", entidad: prov.entidad ?? "", logo: prov.logo ?? "", nombre: t.nombre ?? "", plazoMinDias: t.plazoMinDias ?? 0, plazoMaxDias: t.plazoMaxDias ?? 0, tna: ntna, tea: ntea });
      }
    }
    setCache("plazoFijoUva", out, 15 * 60 * 1000);
    return out;
  } catch { return []; }
});

export const fetchFciPricesIOL = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().min(1), refreshToken: z.string().nullable() }))
  .handler(async ({ data }) => {
    try {
      const res = await fetch(`${IOL}/api/v2/Cotizaciones/fci/argentina/Todos`, {
        headers: { Authorization: `Bearer ${data.token}`, Accept: "application/json" },
      });
      if (res.status === 401 && data.refreshToken) {
        const { fetchTokens } = await import("./iol-auth");
        const tokens = await fetchTokens({
          refresh_token: data.refreshToken,
          grant_type: "refresh_token",
        });
        if (!("error" in tokens)) {
          const retry = await fetch(`${IOL}/api/v2/Cotizaciones/fci/argentina/Todos`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}`, Accept: "application/json" },
          });
          if (retry.ok)
            return {
              data: await retry.json(),
              newToken: tokens.accessToken,
              newRefreshToken: tokens.refreshToken,
            };
        }
        return { data: null, error: "IOL auth failed" };
      }
      if (!res.ok) return { data: null, error: `IOL error ${res.status}` };
      return { data: await res.json(), error: null };
    } catch (e) {
      return { data: null, error: String(e) };
    }
  });
