// src/lib/detector-activo.ts
// Determina el tipo de activo financiero para decidir qué análisis aplicar.
// Usa quoteType de Yahoo Finance + heurística de ticker.

export type TipoActivo =
  | "ACCION"
  | "CEDEAR"
  | "ADR"
  | "ETF"
  | "BONO"
  | "ON"
  | "FCI"
  | "CRIPTO"
  | "INDICE"
  | "FUTURO"
  | "OPCION"
  | "OTRO";

export interface InfoActivo {
  ticker: string;
  nombre: string | null;
  tipo: TipoActivo;
  descripcion: string;
  /** True si tiene sentido hacer análisis fundamental */
  soportaFundamental: boolean;
  /** True si tiene sentido hacer análisis técnico */
  soportaTecnico: boolean;
}

const BONOS_ARG = new Set([
  "AL29",
  "AL29D",
  "AL29C",
  "AL30",
  "AL30D",
  "AL30C",
  "AL35",
  "AL35D",
  "AL35C",
  "AL41",
  "AL41D",
  "AL41C",
  "GD29",
  "GD30",
  "GD35",
  "GD38",
  "GD41",
  "GD46",
  "AE38",
  "AE38D",
  "AE38C",
  "DICP",
  "DIP0",
  "PR13",
  "PR15",
  "PR26",
  "TDJ24",
  "TO23",
  "TO26",
  "TV24",
  "TV26",
  "PARA",
  "PARP",
  "PAYI",
  "PRAM",
  "PRYP",
  "BPA7D",
  "BPA8D",
  "BPB7D",
  "BPB8D",
  "BPC7D",
  "BPD7D",
]);

const ONS_SUFIJO_O = /O$/;
const CEDEAR_SUFIJO = /^[A-Z]+[0-9]*[BC]$/;
const ADR_SUFIJO = /^[A-Z]+\.[A-Z]{1,2}$/;

function heuristicoTipo(ticker: string, quoteType: string | null): TipoActivo {
  const upper = ticker.toUpperCase();

  // 1. Yahoo quoteType tiene la máxima prioridad
  if (quoteType) {
    if (quoteType === "EQUITY") return "ACCION";
    if (quoteType === "ETF") return "ETF";
    if (quoteType === "MUTUALFUND") return "FCI";
    if (quoteType === "INDEX") return "INDICE";
    if (quoteType === "CRYPTOCURRENCY") return "CRIPTO";
    if (quoteType === "FUTURE") return "FUTURO";
    if (quoteType === "OPTION") return "OPCION";
  }

  // 2. Heurísticas por ticker argentino
  if (BONOS_ARG.has(upper)) return "BONO";
  if (ONS_SUFIJO_O.test(upper) || upper.endsWith("D") || upper.endsWith("C")) {
    // O-species de ONs suelen terminar en O, pero el quoteType las marca como "BOND"
    if (quoteType === "BOND") return "ON";
    // Si termina en O pero tiene más de 4 chars y no es un bono conocido, probablemente ON
    if (
      upper.length >= 4 &&
      upper.endsWith("O") &&
      !upper.endsWith("ADO") &&
      !upper.endsWith("BCO")
    )
      return "ON";
  }

  // 3. Heurísticas por prefijo/sufijo
  if (upper.endsWith(".BA")) {
    const base = upper.slice(0, -3);
    // CEDEARs argentinos: tickers como AAPL.BA, SPY.BA
    if (CEDEAR_SUFIJO.test(base)) return "CEDEAR";
    return "ACCION";
  }

  // 4. ADR: tickers con punto (AAPL, no .BA)
  if (ADR_SUFIJO.test(upper) && !upper.endsWith(".BA")) return "ADR";

  // 5. Por defecto: si viene de Yahoo con datos, es acción
  if (quoteType) return "OTRO";
  return "OTRO";
}

/** Determina el tipo de activo y qué análisis soporta */
export function detectarTipoActivo(
  ticker: string,
  quoteType?: string | null,
  sector?: string | null,
): InfoActivo {
  const tipo = heuristicoTipo(ticker, quoteType ?? null);

  const soportaFundamental = ["ACCION", "CEDEAR", "ADR", "ETF"].includes(tipo);
  const soportaTecnico = tipo !== "FCI" && tipo !== "OPCION";

  const descripcionMap: Record<TipoActivo, string> = {
    ACCION: "Acción",
    CEDEAR: "CEDEAR (Argentino)",
    ADR: "ADR (US)",
    ETF: "ETF / Fondo Cotizado",
    BONO: "Bono Soberano / Corporativo",
    ON: "Obligación Negociable",
    FCI: "Fondo Común de Inversión",
    CRIPTO: "Criptomoneda",
    INDICE: "Índice",
    FUTURO: "Futuro",
    OPCION: "Opción",
    OTRO: "Otro",
  };

  return {
    ticker,
    nombre: null,
    tipo,
    descripcion: descripcionMap[tipo],
    soportaFundamental,
    soportaTecnico,
  };
}
