import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "./cache";

export interface ArgentinaContext {
  dolarOficial: { compra: number; venta: number } | null;
  dolarBlue: { compra: number; venta: number } | null;
  dolarMEP: { compra: number; venta: number } | null;
  dolarCCL: { compra: number; venta: number } | null;
  dolarTarjeta: number | null;
  brechaCCLPct: number | null;
  brechaMEPPct: number | null;
  riesgoPais: { valor: number; variacion: number; fecha: string } | null;
  reservas: { nivel: number; variacionDiaria: number; fecha: string } | null;
  inflacionMensual: { valor: number; fecha: string } | null;
  inflacionInteranual: { valor: number; fecha: string } | null;
  uva: { valor: number; fecha: string } | null;
  tasaPF: { tna30d: number; entidad: string } | null;
  generatedAt: string;
}

const CACHE_KEY = "argentina-context";
const CACHE_TTL = 2 * 60 * 1000;

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const getArgentinaContext = createServerFn({ method: "GET" })
  .handler(async (): Promise<ArgentinaContext> => {
    const cached = getCached<ArgentinaContext>(CACHE_KEY, CACHE_TTL);
    if (cached) return cached;

    const result: ArgentinaContext = {
      dolarOficial: null,
      dolarBlue: null,
      dolarMEP: null,
      dolarCCL: null,
      dolarTarjeta: null,
      brechaCCLPct: null,
      brechaMEPPct: null,
      riesgoPais: null,
      reservas: null,
      inflacionMensual: null,
      inflacionInteranual: null,
      uva: null,
      tasaPF: null,
      generatedAt: new Date().toISOString(),
    };

    const fetches = await Promise.allSettled([
      fetchJson("https://api.argentinadatos.com/v1/cotizaciones/dolares"),
      fetchJson("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais"),
      fetchJson("https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/1?Limit=2"),
      fetchJson("https://api.argentinadatos.com/v1/finanzas/indices/inflacion"),
      fetchJson("https://api.argentinadatos.com/v1/finanzas/indices/inflacionInteranual"),
      fetchJson("https://api.argentinadatos.com/v1/finanzas/indices/uva"),
      fetchJson("https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo"),
    ]);

    // 1. Dólares
    const dolarJson = fetches[0].status === "fulfilled" ? fetches[0].value : null;
    if (Array.isArray(dolarJson)) {
      for (const item of dolarJson) {
        const casa = String(item.casa ?? "").toLowerCase();
        const compra = Number(item.compra) || 0;
        const venta = Number(item.venta) || 0;
        if (casa === "oficial") result.dolarOficial = { compra, venta };
        else if (casa === "blue") result.dolarBlue = { compra, venta };
        else if (casa === "bolsa" || casa === "mep") result.dolarMEP = { compra, venta };
        else if (casa.includes("ccl") || casa === "contadoconliqui") result.dolarCCL = { compra, venta };
        else if (casa === "tarjeta") result.dolarTarjeta = compra || venta;
      }
    }

    if (result.dolarOficial?.venta && result.dolarCCL?.venta) {
      result.brechaCCLPct = +(
        ((result.dolarCCL.venta - result.dolarOficial.venta) / result.dolarOficial.venta) * 100
      ).toFixed(1);
    }
    if (result.dolarOficial?.venta && result.dolarMEP?.venta) {
      result.brechaMEPPct = +(
        ((result.dolarMEP.venta - result.dolarOficial.venta) / result.dolarOficial.venta) * 100
      ).toFixed(1);
    }

    // 2. Riesgo País (ArgentinaDatos)
    const rpJson = fetches[1].status === "fulfilled" ? fetches[1].value : null;
    if (Array.isArray(rpJson) && rpJson.length > 0) {
      const sorted = [...rpJson].sort(
        (a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );
      const latest = sorted[0];
      const valor = Number(latest.valor) || 0;
      const prev = sorted.length > 1 ? Number(sorted[1].valor) || 0 : valor;
      result.riesgoPais = { valor, variacion: valor - prev, fecha: latest.fecha };
    }

    // 3. Reservas — BCRA v4.0 oficial (IdVariable 1)
    const reservasJson = fetches[2].status === "fulfilled" ? fetches[2].value : null;
    const reservasDetalle = (reservasJson as any)?.results?.[0]?.detalle;
    if (Array.isArray(reservasDetalle) && reservasDetalle.length > 0) {
      const sorted = [...reservasDetalle].sort(
        (a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
      );
      const nivel = Number(sorted[0].valor) || 0;
      const prev = sorted.length > 1 ? Number(sorted[1].valor) || 0 : nivel;
      result.reservas = { nivel, variacionDiaria: nivel - prev, fecha: sorted[0].fecha };
    }

    // 4. Inflación mensual
    const infJson = fetches[3].status === "fulfilled" ? fetches[3].value : null;
    if (Array.isArray(infJson) && infJson.length > 0) {
      const last = infJson[infJson.length - 1];
      result.inflacionMensual = { valor: Number(last.valor) || 0, fecha: last.fecha };
    }

    // 5. Inflación interanual
    const infIaJson = fetches[4].status === "fulfilled" ? fetches[4].value : null;
    if (Array.isArray(infIaJson) && infIaJson.length > 0) {
      const last = infIaJson[infIaJson.length - 1];
      result.inflacionInteranual = { valor: Number(last.valor) || 0, fecha: last.fecha };
    }

    // 6. UVA
    const uvaJson = fetches[5].status === "fulfilled" ? fetches[5].value : null;
    if (Array.isArray(uvaJson) && uvaJson.length > 0) {
      const last = uvaJson[uvaJson.length - 1];
      result.uva = { valor: Number(last.valor) || 0, fecha: last.fecha };
    }

    // 7. Tasa Plazo Fijo (tomar TNA 30 días promedio)
    const pfJson = fetches[6].status === "fulfilled" ? fetches[6].value : null;
    if (Array.isArray(pfJson) && pfJson.length > 0) {
      const tna30 = pfJson
        .map((b: any) => Number(b.tasas?.[0]?.tna))
        .filter((t: number) => t > 0);
      const tnaPromedio = tna30.length > 0
        ? tna30.reduce((a: number, b: number) => a + b, 0) / tna30.length
        : 0;
      result.tasaPF = {
        tna30d: +tnaPromedio.toFixed(3),
        entidad: pfJson[0]?.entidad ?? "",
      };
    }

    setCache(CACHE_KEY, result);
    return result;
  });
