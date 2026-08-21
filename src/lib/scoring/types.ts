export type CategoriaMacro = "RentaFija" | "RentaVariable" | "Liquidez";
export type Subtipo =
  "Bono" | "ON" | "Letra" | "FCI-RF" | "FCI-RV" | "FCI-Mixto" | "CEDEAR" | "Accion" | "ADR";

export const SCORING_VERSION = "v1";

export interface AssetScoreDiario {
  ticker: string;
  fecha: string;
  scoringVersion: string;

  categoriaMacro: CategoriaMacro;
  subtipo: Subtipo;

  scoreFundamental: number | null;
  scoreTecnico: number | null;
  scoreCuantitativo: number;
  scoreNoticias: number | null;
  scoreContexto: number;

  scoreCompuesto: number;

  datosRaw: {
    precio: number;
    variacionPct: number;
    rsi: number | null;
    sma50: number | null;
    sma200: number | null;
    macd: number | null;
    pe: number | null;
    beta: number | null;
    rSquared: number | null;
    sharpe: number | null;
    var95: number | null;
    tir: number | null;
    tea: number | null;
    duration: number | null;
    valorizado: number;
  };
}

export interface ContextoDiario {
  fecha: string;
  brechaCCL: number | null;
  riesgoPais: number | null;
  vix: number | null;
  mervalVariacion: number | null;
  reservasBCRA: number | null;
  inflacionMensual: number | null;
  badlar: number | null;
  humorMercado: "risk-on" | "risk-off" | "mixto" | null;
}

export interface ReglaContexto {
  id: string;
  condicion: string;
  activosAfectados: Array<{
    categoriaMacro?: CategoriaMacro;
    subtipo?: Subtipo;
    tickerPattern?: string;
  }>;
  ajusteScore: number; // -20 a +20
  descripcion: string;
}

//  Tipos unificados (Fase 1: motor de scoring unificado) 

export type TipoActivo = "ACCION" | "CEDEAR" | "ADR" | "ETF" | "BONO" | "ON" | "OTRO";

export type ClaseActivo = "RV" | "RF";

export interface SubScore {
  valor: number; // siempre 0-100
  raw?: number; // score en escala original del motor (-2.5/+2.5, -1/+1, etc.)
  detalle: Record<string, number>;
  fuente: string; // nombre del módulo que lo calculó
  disponible: boolean; // false si faltaron datos (nunca inventar el valor, usar 50 neutral y disponible:false)
}

export interface Contradiccion {
  direccion: "tecnico_vs_fundamental";
  descripcion: string;
  severidad: 1 | 2 | 3;
}

export interface ScoreUnificado {
  ticker: string;
  scoreFinal: number; // 0-100
  clasificacion: "COMPRA" | "COMPRA_CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA";
  subScores: {
    tecnico: SubScore;
    fundamental: SubScore;
    cuantitativo: SubScore;
    sectorial: SubScore;
    noticias: SubScore;
    macroContexto: SubScore;
    calidadMoat?: SubScore;
  };
  contradicciones: Contradiccion[];
  coherenciaSenal: string; // output de coherencia-senal.ts
  timestamp: string;
}

export type SubScoreKey = keyof ScoreUnificado["subScores"];
