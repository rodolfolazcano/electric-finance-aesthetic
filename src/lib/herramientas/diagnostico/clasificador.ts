// @ts-nocheck
import type { CategoriaMacro, FuentePrecio, PortfolioAssetInput, Subtipo, TipoDeclarado } from "./types";
import { BONOS_DB } from "../bonos-data";
import cedearsUniverse from "@/data/cedears-universe.json";
import sectoresData from "../sectores.json";

const LETRA_PATTERN = /^[ST]\d{2}[A-Z][A-Z0-9]?$/i;
const BA_SUFFIX = /\.BA$/i;
const US_TICKER = /^[A-Z0-9]{1,5}$/;

const cedearsUSD = new Set(
  (cedearsUniverse as { ARS: string[]; USD: string[] }).USD.map((t) => t.toUpperCase()),
);
const cedearsARS = new Set(
  (cedearsUniverse as { ARS: string[]; USD: string[] }).ARS.map((t) => t.toUpperCase() + ".BA"),
);

interface SectorEntry {
  ticker: string;
  nombre: string;
  tipo?: string;
  moneda?: string;
  mercado?: string;
  pais?: string;
}
type SectorsDict = Record<string, Record<string, SectorEntry[]>>;
const SECTORS_JSON = sectoresData as SectorsDict;

function buscarEnSectores(ticker: string): { tipo?: string; moneda?: string; mercado?: string; pais?: string } | null {
  const tk = ticker.toUpperCase();
  for (const industrias of Object.values(SECTORS_JSON)) {
    for (const tickers of Object.values(industrias)) {
      const found = tickers.find((t) => t.ticker.toUpperCase() === tk);
      if (found) {
        return { tipo: found.tipo, moneda: found.moneda, mercado: found.mercado, pais: found.pais };
      }
    }
  }
  return null;
}

export interface Clasificacion {
  tipo: TipoDeclarado;
  subtipo: Subtipo;
  categoriaMacro: CategoriaMacro;
  fuente: FuentePrecio;
}

export function clasificar(input: PortfolioAssetInput): Clasificacion {
  if (input.tipoDeclarado) {
    return clasificacionDesdeDeclarado(input.tipoDeclarado, input.fuente);
  }

  const ticker = input.ticker.toUpperCase().trim();
  const fuente = input.fuente;

  // 2. BONOS_DB → Bono u ON
  const bono = BONOS_DB[ticker];
  if (bono) {
    if (bono.tipo?.startsWith("ON")) {
      return { tipo: "on", subtipo: "ON", categoriaMacro: "RentaFija", fuente: "IOL" };
    }
    return { tipo: "bono", subtipo: "Bono", categoriaMacro: "RentaFija", fuente: "IOL" };
  }

  // 3. LECAP/BONCAP pattern
  if (LETRA_PATTERN.test(ticker)) {
    return { tipo: "letra", subtipo: "Letra", categoriaMacro: "RentaFija", fuente: "ArgentinaDatos" };
  }

  // 4. Source-aware: ArgentinaDatos → solo RF
  if (fuente === "ArgentinaDatos") {
    return { tipo: "fci", subtipo: "FCI-RF", categoriaMacro: "RentaFija", fuente: "ArgentinaDatos" };
  }

  // 5. Source-aware: IOL → BCBA (acciones, CEDEARs)
  if (fuente === "IOL") {
    const tickerBA = BA_SUFFIX.test(ticker) ? ticker : ticker + ".BA";
    // Si el raw ticker tiene datos enriquecidos como accion US → AccionExterior
    const jsonData = !BA_SUFFIX.test(ticker) ? buscarEnSectores(ticker) : null;
    if (jsonData && jsonData.tipo === "accion" && jsonData.pais === "EE.UU.") {
      return { tipo: "accion", subtipo: "AccionExterior", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
    }
    if (cedearsUSD.has(ticker) || cedearsARS.has(tickerBA)) {
      return { tipo: "cedear", subtipo: "CEDEAR", categoriaMacro: "RentaVariable", fuente: "IOL" };
    }
    return { tipo: "accion", subtipo: "Accion", categoriaMacro: "RentaVariable", fuente: "IOL" };
  }

  // 6. Yahoo (default): flujo original con prioridad US
  if (BA_SUFFIX.test(ticker) && cedearsARS.has(ticker)) {
    return { tipo: "cedear", subtipo: "CEDEAR", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
  }

  if (BA_SUFFIX.test(ticker)) {
    return { tipo: "accion", subtipo: "Accion", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
  }

  if (cedearsUSD.has(ticker)) {
    return { tipo: "cedear", subtipo: "CEDEAR", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
  }

  // 7. JSON fallback: usar datos enriquecidos de sectores.json
  const jsonMatch = buscarEnSectores(ticker);
  if (jsonMatch) {
    if (jsonMatch.tipo === "accion" && jsonMatch.pais === "EE.UU.") {
      return { tipo: "accion", subtipo: "AccionExterior", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
    }
    return { tipo: "adr", subtipo: "ADR", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
  }

  // 8. US ticker pattern
  if (US_TICKER.test(ticker)) {
    return { tipo: "adr", subtipo: "ADR", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
  }

  return { tipo: "accion", subtipo: "Accion", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
}

function clasificacionDesdeDeclarado(tipo: TipoDeclarado, fuente: FuentePrecio): Clasificacion {
  switch (tipo) {
    case "bono":
      return { tipo, subtipo: "Bono", categoriaMacro: "RentaFija", fuente: "IOL" };
    case "on":
      return { tipo, subtipo: "ON", categoriaMacro: "RentaFija", fuente: "IOL" };
    case "letra":
      return { tipo, subtipo: "Letra", categoriaMacro: "RentaFija", fuente: "ArgentinaDatos" };
    case "fci":
      return { tipo, subtipo: "FCI-RF", categoriaMacro: "RentaFija", fuente: "ArgentinaDatos" };
    case "cedear":
      return { tipo, subtipo: "CEDEAR", categoriaMacro: "RentaVariable", fuente };
    case "accion":
      return { tipo, subtipo: "Accion", categoriaMacro: "RentaVariable", fuente };
    case "adr":
      return { tipo, subtipo: "ADR", categoriaMacro: "RentaVariable", fuente: "Yahoo" };
  }
}
