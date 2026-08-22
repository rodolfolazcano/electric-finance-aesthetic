export type CategoriaMacro = "RentaFija" | "RentaVariable" | "Liquidez";

export type SubtipoActivo =
  | "Bono"
  | "ON"
  | "Letra"
  | "FCI-RF"
  | "FCI-RV"
  | "FCI-Mixto"
  | "CEDEAR"
  | "Accion"          // Acción local BCBA
  | "AccionExterior"  // Acción extranjera comprada directamente (NYSE/NASDAQ)
  | "ADR"             // ADR propiamente dicho (recibo de depósito)
  | "ETF";            // Fondo cotizado (SPY, QQQ, DIA, etc.)

export type FuenteDatos = "IOL" | "ArgentinaDatos" | "Yahoo";
export type Moneda = "ARS" | "USD";
export type Mercado = "BCBA" | "NYSE" | "NASDAQ" | "ARCA" | "OTRO_US";

export interface ClasificacionActivo {
  ticker: string;
  categoriaMacro: CategoriaMacro;
  subtipo: SubtipoActivo;
  mercado: Mercado;
  moneda: Moneda;
  fuentesDisponibles: FuenteDatos[];
  fuenteSugerida: FuenteDatos;
  confianza: "alta" | "media" | "baja";
  motivoClasificacion: string;          // auditable
  requiereConfirmacionManual: boolean;  // true si confianza === "baja" o hay ambigüedad
}

export interface ConfigInputPorSubtipo {
  labelCantidad: string;
  pasoCantidad: number;
  fuentesPermitidas: FuenteDatos[];
}

export const CONFIG_INPUT_POR_SUBTIPO: Record<SubtipoActivo, ConfigInputPorSubtipo> = {
  Bono:           { labelCantidad: "Nominales (VN)", pasoCantidad: 1,    fuentesPermitidas: ["IOL", "ArgentinaDatos"] },
  ON:             { labelCantidad: "Nominales (VN)", pasoCantidad: 1,    fuentesPermitidas: ["IOL"] },
  Letra:          { labelCantidad: "Nominales (VN)", pasoCantidad: 1,    fuentesPermitidas: ["IOL", "ArgentinaDatos"] },
  "FCI-RF":       { labelCantidad: "Cuotapartes",    pasoCantidad: 0.01, fuentesPermitidas: ["ArgentinaDatos"] },
  "FCI-RV":       { labelCantidad: "Cuotapartes",    pasoCantidad: 0.01, fuentesPermitidas: ["ArgentinaDatos"] },
  "FCI-Mixto":    { labelCantidad: "Cuotapartes",    pasoCantidad: 0.01, fuentesPermitidas: ["ArgentinaDatos"] },
  CEDEAR:         { labelCantidad: "Cantidad",       pasoCantidad: 1,    fuentesPermitidas: ["IOL", "Yahoo"] },
  Accion:         { labelCantidad: "Cantidad",       pasoCantidad: 1,    fuentesPermitidas: ["IOL", "Yahoo"] },
  AccionExterior: { labelCantidad: "Cantidad",       pasoCantidad: 1,    fuentesPermitidas: ["IOL", "Yahoo"] },
  ADR:            { labelCantidad: "Cantidad",       pasoCantidad: 1,    fuentesPermitidas: ["IOL", "Yahoo"] },
  ETF:            { labelCantidad: "Cantidad",       pasoCantidad: 1,    fuentesPermitidas: ["IOL", "Yahoo"] },
};
