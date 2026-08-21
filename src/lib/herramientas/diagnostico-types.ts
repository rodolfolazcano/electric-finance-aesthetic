export type FuentePrecio = "IOL" | "ArgentinaDatos" | "Yahoo";
export type TipoDeclarado = "bono" | "on" | "letra" | "fci" | "cedear" | "accion" | "adr";
export type CategoriaMacro = "RentaFija" | "RentaVariable" | "Liquidez";
export type Subtipo =
  | "Bono"
  | "ON"
  | "Letra"
  | "FCI-RF"
  | "FCI-RV"
  | "FCI-Mixto"
  | "CEDEAR"
  | "Accion"
  | "AccionExterior"
  | "ADR";
export type Geografia = "Argentina" | "EEUU" | "Otro";
export type OrigenMoneda = "ARS" | "USD";

export interface PortfolioAssetInput {
  id: string;
  ticker: string;
  cantidad: number;
  fuente: FuentePrecio;
  tipoDeclarado?: TipoDeclarado;
}

export interface PipelineContext {
  iolToken?: string;
  iolRefreshToken?: string;
}

export interface RentaFijaInfo {
  tir: number;
  tea: number;
  tna: number;
  durationMacaulay: number;
  durationModificada: number;
  convexity: number;
  flujos: { fecha: string; monto: number }[];
}

export interface RentaVariableInfo {
  precio: number;
  variacionPct: number;
  rsi: number;
  macd: number;
  sma50: number;
  sma200: number;
  pe: number | null;
  score: number;
  beta: number;
  alpha: number;
  rSquared: number;
}

export interface PositionEnriquecida {
  id: string;
  ticker: string;
  cantidad: number;
  valorizado: number;
  categoriaMacro: CategoriaMacro;
  subtipo: Subtipo;
  pesoPct: number;

  rentaFija?: RentaFijaInfo;
  rentaVariable?: RentaVariableInfo;
}

export interface ClasificacionExtendida {
  geografia: Geografia;
  moneda: OrigenMoneda;
  mercado: string;
}

export type AlertaDiagnostico = {
  tipo:
    "sobrecompra" | "sobreventa" | "tir_competitiva" | "fcf_destacado" | "concentracion" | "info";
  mensaje: string;
  ticker?: string;
  severidad: "alta" | "media" | "baja";
};

export interface DiagnosticoHibridoResult {
  activos: (PositionEnriquecida &
    ClasificacionExtendida & { fcfYield: number | null; fundamentalScore: number | null })[];
  totalValorizado: number;
  composicion: {
    argentinaVsEeuu: { argentina: number; eeuu: number; otro: number };
    rentaFijaVsVariable: { rentaFija: number; rentaVariable: number; liquidez: number };
    moneda: { ars: number; usd: number };
  };
  metrics: {
    betaPromedio: number;
    tirPromedioRF: number | null;
    margenSeguridad: number | null;
    riesgoCuelloBotella: boolean;
  };
  alertas: AlertaDiagnostico[];
}

export interface PortfolioSummary {
  activos: PositionEnriquecida[];
  totalValorizado: number;
  rentaFija: {
    pesoPct: number;
    tirPromedioPonderada: number;
    teaPromedioPonderada: number;
    durationPromedioPonderada: number;
    convexityPromedioPonderada: number;
    cashflowTotal: { fecha: string; monto: number }[];
  };
  rentaVariable: {
    pesoPct: number;
    betaPromedioPonderado: number;
    alphaPromedioPonderado: number;
    rSquaredPromedioPonderado: number;
  };
  liquidez: {
    pesoPct: number;
  };
}
