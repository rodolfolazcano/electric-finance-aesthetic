// @ts-nocheck
export type DataSource = "yahoo" | "iol";

export type MercadoIOL = "bCBA" | "NYSE" | "NASDAQ";

export interface MarketDataInputProps {
  defaultTicker?: string;
  defaultSource?: DataSource;
  defaultMercado?: MercadoIOL;
  defaultToken?: string | null;
  defaultRefreshToken?: string | null;
  defaultIntervalo?: IntervaloHistorico;
  onQuoteReceived?: (quote: QuoteData) => void;
  onHistoricalReceived?: (series: HistoricalBar[]) => void;
  onTokenRefresh?: (token: string, refreshToken: string) => void;
  onTickerChange?: (ticker: string) => void;
  onRangoChange?: (rango: RangoHistorico) => void;
  onIntervaloChange?: (intervalo: IntervaloHistorico) => void;
  onSourceChange?: (source: DataSource) => void;
  onMercadoChange?: (mercado: MercadoIOL) => void;
  onAnalyze?: (input: string, rango: RangoHistorico) => void;
  showChart?: boolean;
  showQuoteCard?: boolean;
  chartHeight?: number;
  className?: string;
  buttonLabel?: string;
  disabled?: boolean;
  overrideValue?: string;
  alwaysFireOnAnalyze?: boolean;
}

export interface QuoteData {
  ticker: string;
  source: DataSource;
  precio: number;
  variacion: number;
  variacionPct: number;
  apertura: number | null;
  maximo: number | null;
  minimo: number | null;
  volumen: number | null;
  fechaHora: string;
  moneda: "ARS" | "USD";
}

export interface HistoricalBar {
  fecha: string;
  apertura: number;
  maximo: number;
  minimo: number;
  cierre: number;
  volumen: number;
}

export type RangoHistorico = "1M" | "3M" | "6M" | "1A" | "2A" | "5A";

export type IntervaloHistorico = "1m" | "5m" | "15m" | "30m" | "1h" | "1d" | "1wk" | "1mo";

export const RANGO_DAYS: Record<RangoHistorico, number> = {
  "1M": 30,
  "3M": 90,
  "6M": 180,
  "1A": 365,
  "2A": 730,
  "5A": 1825,
};

export const INTERVALO_MAX_DAYS: Record<IntervaloHistorico, number> = {
  "1m": 7,
  "5m": 60,
  "15m": 60,
  "30m": 60,
  "1h": 730,
  "1d": 99999,
  "1wk": 99999,
  "1mo": 99999,
};

export function rangosDisponibles(intervalo: IntervaloHistorico): RangoHistorico[] {
  const maxDays = INTERVALO_MAX_DAYS[intervalo];
  return (Object.keys(RANGO_DAYS) as RangoHistorico[]).filter((r) => RANGO_DAYS[r] <= maxDays);
}

export interface MarketDataState {
  source: DataSource;
  ticker: string;
  mercadoIOL: MercadoIOL;
  rango: RangoHistorico;
  intervalo: IntervaloHistorico;
  isLoadingQuote: boolean;
  isLoadingHistorical: boolean;
  errorQuote: string | null;
  errorHistorical: string | null;
  quote: QuoteData | null;
  historical: HistoricalBar[];
}
