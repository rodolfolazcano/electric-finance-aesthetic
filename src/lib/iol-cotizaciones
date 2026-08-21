import { createServerFn } from "@tanstack/react-start";

export interface LivePriceResult {
  ticker: string;
  precioArs: number | null;
  precioUsdMep: number | null;
  precioCcl: number | null;
}

export interface InstrumentDetail {
  ticker: string;
  ultimoPrecio: number | null;
  volumen: number | null;
  apertura: number | null;
  maximo: number | null;
  minimo: number | null;
  cierreAnterior: number | null;
  variacion: number | null;
}

const IOL_TOKEN_URL = "https://api.invertironline.com/token";
const IOL_API_BASE = "https://api.invertironline.com/api/v2";
const MERCADO = "bCBA";

async function obtenerToken(): Promise<string> {
  const payload = new URLSearchParams({
    username: process.env.IOL_USER ?? "boosandr97@gmail.com",
    password: process.env.IOL_PASS ?? "Chule348936_",
    grant_type: "password",
  });
  const resp = await fetch(IOL_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload,
  });
  if (!resp.ok) throw new Error("Error al obtener token IOL");
  const data = await resp.json();
  return data.access_token as string;
}

async function fetchPrecio(ticker: string, token: string): Promise<number | null> {
  const url = `${IOL_API_BASE}/${MERCADO}/Titulos/${ticker}/Cotizacion`;
  const resp = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  return (data.ultimoPrecio as number) ?? null;
}

function dTicker(oticker: string): string {
  return oticker.slice(0, -1) + "D";
}
function cTicker(oticker: string): string {
  return oticker.slice(0, -1) + "C";
}

export const fetchMep = createServerFn({ method: "GET" }).handler(
  async (): Promise<number | null> => {
    try {
      const token = await obtenerToken();
      const url = `${IOL_API_BASE}/Cotizaciones/MEP/AL30`;
      const resp = await fetch(url, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return (data as number) ?? null;
    } catch {
      return null;
    }
  },
);

// Raw version of fetchMep for internal use from other server fns
export async function fetchMepRaw(): Promise<number | null> {
  try {
    const token = await obtenerToken();
    const url = `${IOL_API_BASE}/Cotizaciones/MEP/AL30`;
    const resp = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data as number) ?? null;
  } catch {
    return null;
  }
}

export const fetchLivePrices = createServerFn({ method: "GET" }).handler(
  async (): Promise<LivePriceResult[]> => {
    const tickers = [
      "CP38O","CS46O","DNC5O","DNC7O","DNCAO","EAC4O","GN49O",
      "MGCOO","MGCRO","MR46O","PLC4O","PLC5O","PLC7O","PN35O",
      "PN43O","PNECO","PQCSO","RUCDO","TLCMO","TLCPO","TLCTO",
      "TLCUO","TSC3O","TSC4O","VSCIO","VSCRO","VSCTO","VSCVO",
      "VSCXO","YFCJO","YM34O","YM39O","YMCIO","YMCJO","YMCXO",
      "YM37O","YM42O","YM43O","OLC7O","CAC6O","CAC7O","CAC4O",
      "CP36O","CP37O","CP39O","CP40O","OZC6O","OZC8O","IRCFO",
      "IRCOO","IRCPO","RAC5O","RAC7O","AEC2O","DEC2O",
    ];
    try {
      const token = await obtenerToken();
      const results: LivePriceResult[] = [];
      for (const t of tickers) {
        const precioArs = await fetchPrecio(t, token);
        const precioUsdMep = await fetchPrecio(dTicker(t), token);
        const precioCcl = await fetchPrecio(cTicker(t), token);
        results.push({ ticker: t, precioArs, precioUsdMep, precioCcl });
        if (precioUsdMep != null) {
          results.push({ ticker: dTicker(t), precioArs: null, precioUsdMep, precioCcl: null });
        }
        if (precioCcl != null) {
          results.push({ ticker: cTicker(t), precioArs: null, precioUsdMep: null, precioCcl });
        }
      }
      return results;
    } catch {
      return tickers.map((t) => ({ ticker: t, precioArs: null, precioUsdMep: null, precioCcl: null }));
    }
  },
);

// Raw version of fetchLivePrices for internal use from other server fns
export async function fetchLivePricesRaw(): Promise<LivePriceResult[]> {
  const tickers = [
    "CP38O","CS46O","DNC5O","DNC7O","DNCAO","EAC4O","GN49O",
    "MGCOO","MGCRO","MR46O","PLC4O","PLC5O","PLC7O","PN35O",
    "PN43O","PNECO","PQCSO","RUCDO","TLCMO","TLCPO","TLCTO",
    "TLCUO","TSC3O","TSC4O","VSCIO","VSCRO","VSCTO","VSCVO",
    "VSCXO","YFCJO","YM34O","YM39O","YMCIO","YMCJO","YMCXO",
    "YM37O","YM42O","YM43O","OLC7O","CAC6O","CAC7O","CAC4O",
    "CP36O","CP37O","CP39O","CP40O","OZC6O","OZC8O","IRCFO",
    "IRCOO","IRCPO","RAC5O","RAC7O","AEC2O","DEC2O",
  ];
  try {
    const token = await obtenerToken();
    const results: LivePriceResult[] = [];
    for (const t of tickers) {
      const precioArs = await fetchPrecio(t, token);
      const precioUsdMep = await fetchPrecio(dTicker(t), token);
      const precioCcl = await fetchPrecio(cTicker(t), token);
      results.push({ ticker: t, precioArs, precioUsdMep, precioCcl });
      if (precioUsdMep != null) {
        results.push({ ticker: dTicker(t), precioArs: null, precioUsdMep, precioCcl: null });
      }
      if (precioCcl != null) {
        results.push({ ticker: cTicker(t), precioArs: null, precioUsdMep: null, precioCcl });
      }
    }
    return results;
  } catch {
    return tickers.map((t) => ({ ticker: t, precioArs: null, precioUsdMep: null, precioCcl: null }));
  }
}
