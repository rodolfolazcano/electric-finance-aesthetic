import { createServerFn } from "@tanstack/react-start";

export type CasaDolar =
  | "mayorista" | "oficial" | "ahorro" | "tarjeta"
  | "blue" | "cripto" | "mep" | "ccl";

export interface CotizacionDolar {
  casa: CasaDolar;
  compra: number | null;
  venta: number | null;
  /** Variación diaria en porcentaje (vs día hábil anterior) */
  variacion?: number | null;
  /** Variación YTD en porcentaje (vs 1ero de enero del año corriente) */
  variacion_ytd?: number | null;
  /** Variación anual en porcentaje (vs ~365 días atrás) */
  variacion_anual?: number | null;
  /** Brecha contra el dólar Oficial (venta) en porcentaje */
  brecha_oficial?: number | null;
}

interface CriptoYaResponse {
  [key: string]: {
    compra: number;
    venta: number;
    variacion?: number;
    timestamp?: number;
  };
}

/** Mapeo de casa → endpoint de ArgentinaDatos */
const CASA_TO_AD_ENDPOINT: Record<string, string> = {
  oficial: "oficial",
  mayorista: "mayorista",
  blue: "blue",
  mep: "bolsa",
  ccl: "contadoconliqui",
};

interface ADCotizacion {
  moneda: string;
  casa: string;
  fecha: string;
  compra: number;
  venta: number;
}

async function fetchADHistorial(casa: string): Promise<ADCotizacion[]> {
  const endpoint = CASA_TO_AD_ENDPOINT[casa];
  if (!endpoint) return [];
  try {
    const r = await fetch(
      `https://api.argentinadatos.com/v1/cotizaciones/dolares/${endpoint}`,
      { cache: "no-store", signal: AbortSignal.timeout(6000) },
    );
    if (!r.ok) return [];
    return await r.json();
  } catch {
    return [];
  }
}

/** Busca el valor de venta más cercano a una fecha dada en un array ordenado asc */
function findClosestVenta(arr: ADCotizacion[], targetDate: string): number | null {
  // arr viene ordenado ascendente por fecha
  // Buscamos el último valor CON fecha <= targetDate (para evitar mirar "adelante")
  let best: number | null = null;
  for (const item of arr) {
    if (item.fecha <= targetDate) {
      best = item.venta;
    } else {
      break;
    }
  }
  return best;
}

export const fetchDolares = createServerFn({ method: "GET" }).handler(async (): Promise<CotizacionDolar[]> => {
  try {
    // ── 1. Current rates from CriptoYa ──
    const r = await fetch("https://criptoya.com/api/dolar", { cache: "no-store" });
    if (!r.ok) return [];
    const json: CriptoYaResponse = await r.json();
    const casas: CasaDolar[] = ["mayorista", "oficial", "ahorro", "tarjeta", "blue", "cripto", "mep", "ccl"];

    // ── 2. Historical data from ArgentinaDatos (solo casas con endpoint) ──
    const historicos = new Map<string, ADCotizacion[]>();
    const historicosRaw = await Promise.allSettled(
      casas.map((casa) => fetchADHistorial(casa)),
    );
    casas.forEach((casa, i) => {
      if (historicosRaw[i].status === "fulfilled") {
        const arr = historicosRaw[i].value;
        if (arr.length > 0) historicos.set(casa, arr);
      }
    });

    // ── 3. Fechas de referencia ──
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const ytdStartStr = `${now.getFullYear()}-01-01`; // 1ero enero
    const lastYear = new Date(now);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const lastYearStr = lastYear.toISOString().slice(0, 10);

    // Valor oficial para brecha
    const oficialEntry = json["oficial"];
    const oficialVenta = oficialEntry?.venta ?? null;

    // ── 4. Armar resultados ──
    return casas.map((casa) => {
      const entry = json[casa];
      const compra = entry?.compra ?? null;
      const venta = entry?.venta ?? null;
      const variacion = entry?.variacion ?? null;

      let variacion_ytd: number | null = null;
      let variacion_anual: number | null = null;
      let brecha_oficial: number | null = null;

      const hist = historicos.get(casa);
      if (hist && hist.length > 0 && venta != null && venta > 0) {
        // Buscar último valor antes de ayer (para var diaria, usamos la que da CriptoYa)
        // YTD: primer valor del año
        const ytdVal = findClosestVenta(hist, ytdStartStr);
        if (ytdVal != null && ytdVal > 0) {
          variacion_ytd = ((venta - ytdVal) / ytdVal) * 100;
        }
        // Anual: valor hace ~1 año
        const anualVal = findClosestVenta(hist, lastYearStr);
        if (anualVal != null && anualVal > 0) {
          variacion_anual = ((venta - anualVal) / anualVal) * 100;
        }
      }

      // Brecha vs oficial
      if (casa !== "oficial" && oficialVenta != null && venta != null && oficialVenta > 0) {
        brecha_oficial = ((venta - oficialVenta) / oficialVenta) * 100;
      }

      return {
        casa,
        compra,
        venta,
        variacion,
        variacion_ytd: variacion_ytd != null ? Math.round(variacion_ytd * 100) / 100 : null,
        variacion_anual: variacion_anual != null ? Math.round(variacion_anual * 100) / 100 : null,
        brecha_oficial: brecha_oficial != null ? Math.round(brecha_oficial * 100) / 100 : null,
      };
    });
  } catch {
    return [];
  }
});
