// @ts-nocheck
import { createServerFn } from "@tanstack/react-start";
import { getCached, setCache } from "./cache";
import { fetchTokens } from "./iol-auth";

// ─── Tipos ─────────────────────────────────────────────────────

export interface PanelItem {
  simbolo: string;
  descripcion: string;
  tipo: "cedear" | "accion_ar" | "adr" | "accion_us";
  mercado: string;
  ultimoPrecio: number | null;
  variacionPorcentual: number | null;
  apertura: number | null;
  maximo: number | null;
  minimo: number | null;
  volumen: number | null;
  cantidad: number | null;
}

export interface UniversoOportunidadesResult {
  items: PanelItem[];
  timestamp: string;
  fuentesOk: string[];
  fuentesFail: string[];
}

// ─── IOL API fetch con token refresh ───────────────────────────

function getTokensFromLS(): { token: string | null; refresh: string | null } {
  if (typeof window === "undefined") return { token: null, refresh: null };
  return {
    token: localStorage.getItem("iol_bearer_token"),
    refresh: localStorage.getItem("iol_refresh_token"),
  };
}

async function iolFetchPanel(
  instrumento: string,
  pais: string,
  token: string,
  refreshToken: string | null,
): Promise<{ data: any[]; newToken?: string; newRefreshToken?: string }> {
  const url = `https://api.invertironline.com/api/v2/Cotizaciones/${instrumento}/${pais}/Todos`;

  async function doFetch(t: string): Promise<Response> {
    return fetch(url, {
      headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
    });
  }

  let res = await doFetch(token);
  if (res.status === 401 && refreshToken) {
    const tokens = await fetchTokens({ refresh_token: refreshToken, grant_type: "refresh_token" });
    if (!("error" in tokens)) {
      res = await doFetch(tokens.accessToken);
      if (res.ok) {
        const json = await res.json();
        return {
          data: Array.isArray(json) ? json : json?.titulos ?? [],
          newToken: tokens.accessToken,
          newRefreshToken: tokens.refreshToken,
        };
      }
    }
    return { data: [] };
  }
  if (!res.ok) return { data: [] };
  const json = await res.json();
  return { data: Array.isArray(json) ? json : json?.titulos ?? [] };
}

function normalizarItem(raw: any, tipo: PanelItem["tipo"], mercado: string): PanelItem | null {
  const simbolo = raw.simbolo ?? raw.simbolo ?? "";
  if (!simbolo) return null;
  return {
    simbolo: simbolo.toUpperCase().trim(),
    descripcion: raw.descripcion ?? "",
    tipo,
    mercado,
    ultimoPrecio: raw.ultimoPrecio ?? raw.ultimoOperado ?? null,
    variacionPorcentual: raw.variacionPorcentual ?? raw.variacion ?? null,
    apertura: raw.apertura ?? null,
    maximo: raw.maximo ?? null,
    minimo: raw.minimo ?? null,
    volumen: raw.volumen ?? raw.volumenNominal ?? null,
    cantidad: raw.cantidadOperaciones ?? null,
  };
}

// ─── Server function principal ─────────────────────────────────

export const getUniversoOportunidades = createServerFn({ method: "POST" })
  .handler(async (): Promise<UniversoOportunidadesResult> => {
    const CACHE_KEY = "universo-oportunidades";
    const cached = getCached<UniversoOportunidadesResult>(CACHE_KEY, 5 * 60 * 1000);
    if (cached) return cached;

    const { token, refresh } = getTokensFromLS();
    if (!token) {
      // Fallback: usar el universo estático existente
      return {
        items: [],
        timestamp: new Date().toISOString(),
        fuentesOk: [],
        fuentesFail: ["IOL: no hay sesión activa"],
      };
    }

    const paneles = [
      { instrumento: "cedears", pais: "argentina", tipo: "cedear" as const, mercado: "BCBA" },
      { instrumento: "acciones", pais: "argentina", tipo: "accion_ar" as const, mercado: "BCBA" },
      { instrumento: "adrs", pais: "estados_unidos", tipo: "adr" as const, mercado: "NYSE/NASDAQ" },
      { instrumento: "acciones", pais: "estados_unidos", tipo: "accion_us" as const, mercado: "NYSE/NASDAQ" },
    ];

    const results = await Promise.allSettled(
      paneles.map((p) => iolFetchPanel(p.instrumento, p.pais, token, refresh)),
    );

    const allItems: PanelItem[] = [];
    const fuentesOk: string[] = [];
    const fuentesFail: string[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const panel = paneles[i];
      if (r.status === "fulfilled" && r.value.data.length > 0) {
        for (const raw of r.value.data) {
          const item = normalizarItem(raw, panel.tipo, panel.mercado);
          if (item) allItems.push(item);
        }
        fuentesOk.push(`${panel.instrumento}/${panel.pais}`);
      } else {
        fuentesFail.push(`${panel.instrumento}/${panel.pais}`);
      }
    }

    // Deduplicar por simbolo (IOL puede repetir tickers entre paneles)
    const seen = new Set<string>();
    const deduped = allItems.filter((item) => {
      if (seen.has(item.simbolo)) return false;
      seen.add(item.simbolo);
      return true;
    });

    const result: UniversoOportunidadesResult = {
      items: deduped,
      timestamp: new Date().toISOString(),
      fuentesOk,
      fuentesFail,
    };

    setCache(CACHE_KEY, result);
    return result;
  });
