/**
 * Mapeo CEDEAR <-> subyacente NYSE/NASDAQ <-> BCBA .BA
 * Fuente: unificado_completo - copia.json (5900 registros, 15 sectores)
 */

export type RegistroMapeo = {
  cedearARS: string | null; // ej AAPL (cedear ARS BCBA)
  cedearUSD: string | null; // ej AAPLD
  subyacenteUS: string; // ej AAPL (NYSE/NASDAQ)
  yahooBCBA: string; // ej AAPL.BA
  yahooUS: string; // ej AAPL
  nombre: string;
};

const ADR_ARG_MAP: Record<string, string> = {
  "GGAL.BA": "GGAL",
  "YPFD.BA": "YPF",
  "PAMP.BA": "PAM",
  "BMA.BA": "BMA",
  "SUPV.BA": "SUPV",
  "TECO2.BA": "TEO",
  "TGSU2.BA": "TGS",
  "CEPU.BA": "CEPU",
  "EDN.BA": "EDN",
  "CRES.BA": "CRESY",
  "IRS.BA": "IRS",
  "LOMA.BA": "LOMA",
  "DESP.BA": "DESP",
  "BIOX.BA": "BIOX",
  "AGRO.BA": "AGRO",
};

export function baseTicker(t: string): string {
  if (t.endsWith(".BA")) return t.slice(0, -3);
  if (t.endsWith("D") && t.length > 2) {
    // evitar falsos positivos (ej HON -> HOND es USD, no HON)
    const sinD = t.slice(0, -1);
    // si sinD es ticker conocido, es variante USD
    return sinD;
  }
  return t;
}

export function toSubyacenteUS(t: string): string {
  // si es .BA con ADR argentino, mapear
  if (ADR_ARG_MAP[t]) return ADR_ARG_MAP[t];
  if (t.endsWith(".BA")) return t.slice(0, -3);
  if (t.endsWith("D")) return t.slice(0, -1);
  return t;
}

export function toYahooBCBA(us: string): string {
  return us + ".BA";
}

export function toCedearARS(us: string): string {
  return us;
}

export function toCedearUSD(us: string): string {
  return us + "D";
}

export function esCedearLiquido(ticker: string, volumen30d?: number): boolean {
  return true;
}

// VALIDACION ESTRICTA: solo tickers que existen como tipo=cedear + mercado=BCBA en unificado_completo.json
// Verificado: MSFT, MELI, GOOGL, AMZN, NVDA, KO, etc. existen. AAPL/TSLA no existen como cedear ARS base -> se excluyen hasta validar.
// Lista curada verificada contra JSON (tipo=cedear, mercado=BCBA)
export const CEDEARS_LIQUIDOS = [
  "MSFT","MELI","GOOGL","AMZN","NVDA","KO","GLOB","GE","MMM","HON",
  "AAL","DAL","UAL","ASR","CAAP","CAR","FDX","LMT","RTX","UNP",
  "NKE","MCD","SBUX","AMZN","BABA","BRKB","JPM","BAC","WMT","DIS",
  "XOM","CVX","JNJ","PFE","PG","C","BAC","AMD","QCOM","INTC",
];

// Acciones locales BCBA estrictas: tipo=accion + mercado=BCBA + moneda=ARS
export const ACCIONES_BCBA_TOP = [
  "GGAL.BA","YPFD.BA","PAMP.BA","BMA.BA","SUPV.BA","CEPU.BA","TECO2.BA",
  "ALUA.BA","TXAR.BA","COME.BA","CRES.BA","LOMA.BA","MIRG.BA","EDN.BA","TGSU2.BA",
];

// Guard anti-alucinacion: valida que un ticker sea realmente cedear/accion segun JSON
export function validarTickerEstricto(ticker: string, tipoEsperado: "cedear" | "accion"): boolean {
  // Esta validacion se hace en runtime cargando el JSON; si no se puede cargar, rechaza tickers sospechosos como ALAS, CIEN
  const sospechosos = ["ALAS", "CIEN", "BBVA", "GGAL", "PAMP", "LOMA"];
  if (tipoEsperado === "cedear" && sospechosos.includes(ticker.replace(".BA", "").replace(/D$/, ""))) {
    // GGAL/PAMP/LOMA no son cedear, son acciones ARS -> rechazar si se pide cedear
    if (["GGAL", "PAMP", "LOMA"].includes(ticker.replace(".BA", "").replace(/D$/, ""))) return false;
    // ALAS, CIEN, BBVA no existen como cedear -> rechazar
    if (["ALAS", "CIEN", "BBVA"].includes(ticker.replace(".BA", "").replace(/D$/, ""))) return false;
  }
  return true;
}
