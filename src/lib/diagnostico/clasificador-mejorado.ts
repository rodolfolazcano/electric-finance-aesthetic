import { BONOS_DB } from "../bonos-data";
import cedearsUniverse from "@/data/cedears-universe.json";
import sectoresData from "../sectores.json";
import { yahooQuoteSummary } from "../yahoo-coronar.functions";
import type {
  ClasificacionActivo, SubtipoActivo, FuenteDatos,
  Mercado, Moneda, CategoriaMacro,
} from "./clasificacion-activos.types";

const LETRA_PATTERN = /^[ST]\d{2}[A-Z][A-Z0-9]?$/i;
const BA_SUFFIX = /\.BA$/i;
const US_TICKER = /^[A-Z0-9]{1,5}$/;

const cedearsUSD = new Set(
  (cedearsUniverse as { ARS: string[]; USD: string[] }).USD.map((t) => t.toUpperCase()),
);
const cedearsARS = new Set(
  (cedearsUniverse as { ARS: string[]; USD: string[] }).ARS.map((t) => t.toUpperCase() + ".BA"),
);

const ETF_LIST = new Set([
  "SPY", "QQQ", "DIA", "IWM", "EFA", "EWJ",
  "XLK", "XLF", "XLV", "XLE", "XLI", "XLB", "XLU", "XLRE", "XLC", "XLP", "XLY",
  "VTI", "VOO", "BND", "AGG",
  "ARKK", "ARKW", "ARKG", "ARKF", "ARKQ",
]);

// ─── JSON fallback: sectores.json → lookup ticker → sector/industria + datos enriquecidos ───
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

function buscarEnSectores(ticker: string): {
  sector: string; industria: string;
  tipo?: string; moneda?: string; mercado?: string; pais?: string;
} | null {
  const tk = ticker.toUpperCase();
  for (const [sector, industrias] of Object.entries(SECTORS_JSON)) {
    for (const [industria, tickers] of Object.entries(industrias)) {
      const found = tickers.find((t) => t.ticker.toUpperCase() === tk);
      if (found) {
        return { sector, industria, tipo: found.tipo, moneda: found.moneda, mercado: found.mercado, pais: found.pais };
      }
    }
  }
  return null;
}

// ─── Source-aware classification ──────────────────────────────────

export function clasificarMejorado(input: {
  ticker: string;
  fuente?: FuenteDatos;
  tipoDeclarado?: string;
}): ClasificacionActivo {
  const ticker = input.ticker.toUpperCase().trim();
  const baseTicker = ticker.replace(BA_SUFFIX, "");
  const fuente = input.fuente;

  // 1. tipoDeclarado explícito → respetar
  if (input.tipoDeclarado) {
    return desdeDeclarado(input.tipoDeclarado, ticker, fuente);
  }

  // 2. BONOS_DB → Bono u ON
  const bonoConfig = BONOS_DB[ticker];
  if (bonoConfig) {
    const isON = bonoConfig.tipo?.startsWith("ON");
    return {
      ticker,
      categoriaMacro: "RentaFija",
      subtipo: isON ? "ON" : "Bono",
      mercado: "BCBA",
      moneda: (bonoConfig.tipo === "Hard Dollar" || bonoConfig.tipo === "ON Hard Dollar") ? "USD" : "ARS",
      fuentesDisponibles: isON ? ["IOL"] : ["IOL", "ArgentinaDatos"],
      fuenteSugerida: "IOL",
      confianza: "alta",
      motivoClasificacion: `Ticker en BONOS_DB como "${bonoConfig.tipo}"`,
      requiereConfirmacionManual: false,
    };
  }

  // 3. Patrón LECAP/BONCAP
  if (LETRA_PATTERN.test(ticker)) {
    return {
      ticker,
      categoriaMacro: "RentaFija",
      subtipo: "Letra",
      mercado: "BCBA",
      moneda: "ARS",
      fuentesDisponibles: ["IOL", "ArgentinaDatos"],
      fuenteSugerida: "ArgentinaDatos",
      confianza: "alta",
      motivoClasificacion: "Patrón de letras LECAP/BONCAP (S###### o T######)",
      requiereConfirmacionManual: false,
    };
  }

  // 4. Source-aware: según la fuente seleccionada, priorizar ciertos tipos
  if (fuente === "ArgentinaDatos") {
    // ArgentinaDatos solo tiene RF: Letras, Bonos, FCIs
    // Si el ticker no matcheó BONOS_DB ni LECAP, asumir FCI-RF como fallback
    return {
      ticker,
      categoriaMacro: "RentaFija",
      subtipo: "FCI-RF",
      mercado: "BCBA",
      moneda: "ARS",
      fuentesDisponibles: ["ArgentinaDatos"],
      fuenteSugerida: "ArgentinaDatos",
      confianza: "media",
      motivoClasificacion: "Fuente ArgentinaDatos → Renta Fija (FCI/monetarios)",
      requiereConfirmacionManual: true,
    };
  }

  if (fuente === "IOL") {
    // IOL opera en BCBA → los tickers locales usan .BA
    // Si el usuario escribe "GGAL", auto-agregar .BA
    const tickerBA = BA_SUFFIX.test(ticker) ? ticker : ticker + ".BA";
    // Si el raw ticker (sin .BA) tiene datos enriquecidos en sectores.json como accion US → AccionExterior
    const jsonData = !BA_SUFFIX.test(ticker) ? buscarEnSectores(ticker) : null;
    if (jsonData && jsonData.tipo === "accion" && jsonData.pais === "EE.UU.") {
      return {
        ticker: ticker,
        categoriaMacro: "RentaVariable",
        subtipo: "AccionExterior",
        mercado: "NYSE",
        moneda: "USD",
        fuentesDisponibles: ["IOL", "Yahoo"],
        fuenteSugerida: "Yahoo",
        confianza: "alta",
        motivoClasificacion: `Fuente IOL + sectores.json tipo=${jsonData.tipo} pais=${jsonData.pais} → AccionExterior`,
        requiereConfirmacionManual: false,
      };
    }
    if (cedearsUSD.has(ticker) || cedearsARS.has(tickerBA)) {
      return {
        ticker: tickerBA,
        categoriaMacro: "RentaVariable",
        subtipo: "CEDEAR",
        mercado: "BCBA",
        moneda: cedearsUSD.has(ticker) ? "USD" : "ARS",
        fuentesDisponibles: ["IOL", "Yahoo"],
        fuenteSugerida: "IOL",
        confianza: "alta",
        motivoClasificacion: "Fuente IOL + CEDEAR universe",
        requiereConfirmacionManual: false,
      };
    }
    // IOL + cualquier ticker (con o sin .BA) → acción local BCBA
    // (si es bono/ON ya lo atrapó BONOS_DB arriba)
    return {
      ticker: tickerBA,
      categoriaMacro: "RentaVariable",
      subtipo: "Accion",
      mercado: "BCBA",
      moneda: "ARS",
      fuentesDisponibles: ["IOL", "Yahoo"],
      fuenteSugerida: "IOL",
      confianza: "alta",
      motivoClasificacion: "Fuente IOL → BCBA con .BA auto-agregado",
      requiereConfirmacionManual: false,
    };
  }

  // fuente === "Yahoo" (o undefined): flujo original con prioridad US
  if (BA_SUFFIX.test(ticker) && cedearsARS.has(ticker)) {
    return {
      ticker,
      categoriaMacro: "RentaVariable",
      subtipo: "CEDEAR",
      mercado: "BCBA",
      moneda: "ARS",
      fuentesDisponibles: ["IOL", "Yahoo"],
      fuenteSugerida: "Yahoo",
      confianza: "alta",
      motivoClasificacion: ".BA + en universo CEDEARs ARS",
      requiereConfirmacionManual: false,
    };
  }

  if (BA_SUFFIX.test(ticker)) {
    return {
      ticker,
      categoriaMacro: "RentaVariable",
      subtipo: "Accion",
      mercado: "BCBA",
      moneda: "ARS",
      fuentesDisponibles: ["IOL", "Yahoo"],
      fuenteSugerida: "Yahoo",
      confianza: "alta",
      motivoClasificacion: ".BA no CEDEAR → acción local",
      requiereConfirmacionManual: false,
    };
  }

  if (cedearsUSD.has(ticker)) {
    return {
      ticker,
      categoriaMacro: "RentaVariable",
      subtipo: "CEDEAR",
      mercado: "BCBA",
      moneda: "USD",
      fuentesDisponibles: ["IOL", "Yahoo"],
      fuenteSugerida: "Yahoo",
      confianza: "alta",
      motivoClasificacion: "En universo CEDEARs USD",
      requiereConfirmacionManual: false,
    };
  }

  if (ETF_LIST.has(ticker)) {
    return {
      ticker,
      categoriaMacro: "RentaVariable",
      subtipo: "ETF",
      mercado: "NYSE",
      moneda: "USD",
      fuentesDisponibles: ["IOL", "Yahoo"],
      fuenteSugerida: "Yahoo",
      confianza: "alta",
      motivoClasificacion: "ETF conocido",
      requiereConfirmacionManual: false,
    };
  }

  // ─── JSON fallback: buscar en sectores.json con datos enriquecidos ───
  const jsonMatch = buscarEnSectores(ticker);
  if (jsonMatch) {
    // Usar datos enriquecidos si están disponibles
    if (jsonMatch.tipo === "accion" && jsonMatch.pais === "EE.UU.") {
      return {
        ticker,
        categoriaMacro: "RentaVariable",
        subtipo: "AccionExterior",
        mercado: jsonMatch.mercado === "NYSE/NASDAQ" ? "NYSE" : "NYSE",
        moneda: "USD",
        fuentesDisponibles: ["IOL", "Yahoo"],
        fuenteSugerida: "Yahoo",
        confianza: "alta",
        motivoClasificacion: `JSON sectores: ${jsonMatch.sector}/${jsonMatch.industria} tipo=${jsonMatch.tipo} pais=${jsonMatch.pais}`,
        requiereConfirmacionManual: false,
      };
    }
    if (jsonMatch.tipo === "cedear") {
      return {
        ticker,
        categoriaMacro: "RentaVariable",
        subtipo: "CEDEAR",
        mercado: "BCBA",
        moneda: jsonMatch.moneda === "USD" ? "USD" : "ARS",
        fuentesDisponibles: ["IOL", "Yahoo"],
        fuenteSugerida: "Yahoo",
        confianza: "alta",
        motivoClasificacion: `JSON sectores: ${jsonMatch.sector}/${jsonMatch.industria} tipo=cedear`,
        requiereConfirmacionManual: false,
      };
    }
    const isUS = !BA_SUFFIX.test(ticker) && US_TICKER.test(ticker);
    return {
      ticker,
      categoriaMacro: "RentaVariable",
      subtipo: isUS ? "ADR" : "Accion",
      mercado: isUS ? "NYSE" : "BCBA",
      moneda: isUS ? "USD" : "ARS",
      fuentesDisponibles: ["IOL", "Yahoo"],
      fuenteSugerida: "Yahoo",
      confianza: "media",
      motivoClasificacion: `JSON sectores: ${jsonMatch.sector} / ${jsonMatch.industria}`,
      requiereConfirmacionManual: isUS,
    };
  }

  // ─── Fallback US ticker ─────────────────────────────────────────
  if (US_TICKER.test(ticker)) {
    return {
      ticker,
      categoriaMacro: "RentaVariable",
      subtipo: "ADR",
      mercado: "NYSE",
      moneda: "USD",
      fuentesDisponibles: ["IOL", "Yahoo"],
      fuenteSugerida: "Yahoo",
      confianza: "media",
      motivoClasificacion: "Sin Yahoo assetProfile.country no se distingue ADR vs AccionExterior",
      requiereConfirmacionManual: true,
    };
  }

  // ─── Fallback final ─────────────────────────────────────────────
  return {
    ticker,
    categoriaMacro: "RentaVariable",
    subtipo: "Accion",
    mercado: "BCBA",
    moneda: "ARS",
    fuentesDisponibles: ["IOL", "Yahoo"],
    fuenteSugerida: "Yahoo",
    confianza: "baja",
    motivoClasificacion: "Sin reglas aplicables — fallback a Accion BCBA",
    requiereConfirmacionManual: true,
  };
}

export async function refinarConYahoo(
  prev: ClasificacionActivo,
): Promise<ClasificacionActivo> {
  if (prev.subtipo !== "ADR" || !prev.requiereConfirmacionManual) return prev;

  try {
    const snap = await yahooQuoteSummary(prev.ticker);
    const country = snap.sectorKey ?? snap.sector ?? null;
    const isAccionExterior = country === "US" || country === "United States";

    if (isAccionExterior) {
      return {
        ...prev,
        subtipo: "AccionExterior",
        motivoClasificacion: `Yahoo assetProfile.country=${country} → AccionExterior (no ADR)`,
        confianza: "alta",
        requiereConfirmacionManual: false,
      };
    }
    return {
      ...prev,
      confianza: country ? "alta" : "media",
      motivoClasificacion: country
        ? `Yahoo assetProfile.country=${country} → ADR confirmado`
        : "Yahoo sin country — se mantiene ADR con confianza media",
      requiereConfirmacionManual: !country,
    };
  } catch {
    return {
      ...prev,
      motivoClasificacion: "Error llamando Yahoo — se mantiene clasificación previa",
      requiereConfirmacionManual: true,
    };
  }
}

function desdeDeclarado(
  tipo: string,
  ticker: string,
  fuente?: FuenteDatos,
): ClasificacionActivo {
  switch (tipo) {
    case "bono":
      return mkClasif("RentaFija", "Bono", "BCBA", "ARS", ["IOL", "ArgentinaDatos"], "IOL", ticker);
    case "on":
      return mkClasif("RentaFija", "ON", "BCBA", "ARS", ["IOL"], "IOL", ticker);
    case "letra":
      return mkClasif("RentaFija", "Letra", "BCBA", "ARS", ["IOL", "ArgentinaDatos"], "ArgentinaDatos", ticker);
    case "fci":
      return mkClasif("RentaFija", "FCI-RF", "BCBA", "ARS", ["ArgentinaDatos"], "ArgentinaDatos", ticker);
    case "cedear":
      return mkClasif("RentaVariable", "CEDEAR", "BCBA", "USD", ["IOL", "Yahoo"], "Yahoo", ticker);
    case "accion":
      return mkClasif("RentaVariable", "Accion", "BCBA", "ARS", ["IOL", "Yahoo"], "Yahoo", ticker);
    case "adr":
      return mkClasif("RentaVariable", "ADR", "NYSE", "USD", ["IOL", "Yahoo"], "Yahoo", ticker);
    default:
      return mkClasif("RentaVariable", "Accion", "BCBA", "ARS", ["IOL", "Yahoo"], "Yahoo", ticker);
  }
}

function mkClasif(
  cat: CategoriaMacro, sub: SubtipoActivo, mercado: Mercado, moneda: Moneda,
  fuentes: FuenteDatos[], sugerida: FuenteDatos, ticker: string,
): ClasificacionActivo {
  return {
    ticker, categoriaMacro: cat, subtipo: sub, mercado, moneda,
    fuentesDisponibles: fuentes, fuenteSugerida: sugerida,
    confianza: "alta",
    motivoClasificacion: `tipoDeclarado=${sub}`,
    requiereConfirmacionManual: false,
  };
}
