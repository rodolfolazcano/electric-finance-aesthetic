export type OptionType = "Call" | "Put";

export type Moneyness = "ITM" | "OTM" | "ATM";

export interface OptionContract {
  simbolo: string;
  descripcion: string;
  tipoOpcion: OptionType;
  strike: number;
  fechaVencimiento: string; // ISO date
  T: number; // time to expiry in years (trading days / 252)
  precioOpcion: number; // ultimoPrecio from IOL
  bid: number;
  ask: number;
  volumen: number;
  montoOperado: number;
  precioSubyacente: number;
  openInterest: number;
}

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number; // daily theta (/252)
  rho: number;
}

export interface PricingInput {
  tipo: OptionType;
  S: number; // spot price
  K: number; // strike
  T: number; // time to expiry (years)
  r: number; // risk-free rate (decimal)
  sigma: number; // volatility (decimal)
  q?: number; // dividend yield (decimal)
}

export interface ProcessedOption extends OptionContract {
  moneyness: Moneyness;
  volatilidadImplicita: number | null;
  greeks: Greeks | null;
  blackScholes: number | null;
  binomial: number | null;
  probITM: number | null;
  probOTM: number | null;
  var: number | null;
  diffBSPct: number | null;
  diffBinPct: number | null;
}

export interface VolatilityResult {
  historica: number;
  dinamica: number;
  serie: { date: string; value: number }[];
}

export interface VarResult {
  var: number;
  nivelConfianza: number;
  dias: number;
}

export interface DividendInfo {
  fecha: string;
  monto: number;
}

export interface OptionsConfig {
  simbolo: string;
  mercado: string;
  tasaRiesgo: number;
  volPeriodo: string;
  pasosBinomial: number;
}

export interface RangoPrecios {
  fecha: string;
  soporte: number;
  resistencia: number;
  spot: number;
}

export interface SkewResult {
  skewPct: number;
  interpretation: "alcista" | "bajista" | "neutral";
}

export interface CaucionData {
  plazo: number;
  tasaPromedio: number;
  tasaMinima: number;
  tasaMaxima: number;
}

export interface IOLOptionResponse {
  simbolo: string;
  descripcion: string;
  tipoOpcion: OptionType;
  fechaVencimiento: string;
  cotizacion: {
    ultimoPrecio: number | null;
    volumen: number | null;
    bid: number | null;
    ask: number | null;
    montoOperado: number | null;
    openInterest: number | null;
  };
}
