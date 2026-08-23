export type ComparadorId = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";

export interface ComparadorInfo {
  id: ComparadorId;
  label: string;
  descripcion: string;
}

export const COMPARADORES: ComparadorInfo[] = [
  { id: "A", label: "Hard Dollar vs UST10Y", descripcion: "Spread soberano argentino vs bono del Tesoro de EE.UU. a 10 años" },
  { id: "B", label: "PF vs LECAP vs Inflación", descripcion: "Rendimiento real de plazo fijo, LECAP e inflación" },
  { id: "C", label: "Bono CER vs Inflación", descripcion: "Retorno real de bonos CER contra inflación interanual" },
  { id: "D", label: "Breakeven CER vs Tasa Fija", descripcion: "Inflación de equilibrio implícita entre CER y tasa fija" },
  { id: "E", label: "Dollar-Linked vs Hard vs CER", descripcion: "Cobertura cambiaria: retorno USD en 3 escenarios" },
  { id: "F", label: "FCI vs Instrumento Directo", descripcion: "Comparación FCI vs equivalente directo (costo implícito)" },
  { id: "G", label: "BADLAR/TAMAR vs Tasa Fija", descripcion: "Breakeven de tasa flotante vs fija" },
  { id: "H", label: "Brecha de Ley AL vs GD", descripcion: "Riesgo jurisdiccional: TIR Bonares (ley AR) vs Globales (ley NY) por tramo — Elbaum 10.7" },
];

export interface ComparadorHData {
  pares: Array<{
    par: string; // "AL30 vs GD30"
    bonarTir: number | null;
    globalTir: number | null;
    brechaBps: number | null;
  }>;
  serieBrecha?: Array<{ fecha: string; brechaBps: number }>; // histórica del primer par disponible
  timestamp: string;
  error?: string;
}

export interface HardDollarAsset {
  ticker: string;
  descripcion: string;
  vencimiento: string;
  cuponAnual: number;
  frecuencia: string;
  moneda: string;
}

export interface MonthlyFlow {
  mes: string;
  año: number;
  mesNum: number;
  bonoCupon: number;
  bonoAmortizacion: number;
  bonoTotal: number;
  usTreasuryCupon: number;
}

export interface ComparadorAData {
  ticker: string;
  descripcion: string;
  vencimiento: string;
  tir: number | null;
  tirTEA: number | null;
  usTreasury10y: number | null;
  spreadBps: number | null;
  riesgoPais: number | null;
  deltaSpreadRiesgoPais: number | null;
  duration: number | null;
  usTreasuryDuration: number | null;
  cashFlows: Array<{ fecha: string; monto: number; tipo: string; montoUSD: number }>;
  syntheticUsTreasuryFlows: Array<{ fecha: string; monto: number }>;
  monthlyFlows: MonthlyFlow[];
  periodoMeses: number;
  totalCuponesPeriodo: number;
  totalAmortizacionesPeriodo: number;
  flujoNetoPeriodo: number;
  hardDollarAssets: HardDollarAsset[];
  timestamp: string;
  error?: string;
}

export interface HorizonteRetorno {
  dias: number;
  pfNominal: number | null;
  lecapNominal: number | null;
  pfReal: number | null;
  lecapReal: number | null;
  inflacionProyectadaPeriodo: number | null;
}

export interface ComparadorBData {
  bancoPF: string | null;
  tasaPF_TNA: number | null;
  lecapTicker: string | null;
  lecapTEM: number | null;
  inflacionMensual: number | null;
  inflacionInteranual: number | null;
  horizontes: HorizonteRetorno[];
  ranking: Array<{ instrumento: string; retornoReal: number | null }>;
  timestamp: string;
  error?: string;
}

export interface ComparadorCData {
  ticker: string;
  tirActual: number | null;
  inflacionInteranual: number | null;
  retornoReal: number | null;
  serieHistorica: Array<{ fecha: string; tirCER: number | null; inflacionInteranual: number | null; retornoReal: number | null }>;
  retornoRealAcumulado12m: number | null;
  timestamp: string;
  error?: string;
}

export interface ComparadorDData {
  cerTicker: string;
  tasaFijaTicker: string;
  tirCER: number | null;
  tirTasaFija: number | null;
  breakevenInflacion: number | null;
  inflacionInteranualActual: number | null;
  breakevenTooltip: string;
  comparacion: "breakeven-mayor" | "breakeven-menor" | "sin-datos" | null;
  comparacionTexto: string | null;
  serieHistorica: Array<{ fecha: string; breakeven: number | null; inflacionInteranual: number | null }>;
  diasMatch: number;
  timestamp: string;
  error?: string;
}

export interface EscenarioSensibilidad {
  nombre: string;
  devaluacionAnual: number;
  descripcion: string;
  retornos: Array<{ instrumento: string; ticker: string; retornoUSD: number | null }>;
}

export interface ComparadorEData {
  tcMepActual: number | null;
  instrumentos: Array<{ ticker: string; tipo: string; retornoLocal: number | null }>;
  escenarios: EscenarioSensibilidad[];
  timestamp: string;
  error?: string;
}

export interface FCIComparacionData {
  fciTicker: string;
  fciCategoria: string;
  vcpActual: number | null;
  retornoAnualizado: number | null;
  instrumentoDirecto: string;
  retornoDirecto: number | null;
  diferencia: number | null;
}

export interface ComparadorFData {
  fcismm: FCIComparacionData | null;
  fciRentaFija: FCIComparacionData | null;
  timestamp: string;
  error?: string;
}

export interface ComparadorGData {
  badlarActual: number | null;
  tamarActual: number | null;
  onBadlarTicker: string | null;
  onBadlarTIR: number | null;
  onTasaFijaTicker: string | null;
  onTasaFijaTIR: number | null;
  breakevenBadlar: number | null;
  breakevenTooltip: string;
  comparacion: "flotante-conviene" | "fija-conviene" | "sin-datos" | null;
  comparacionTexto: string | null;
  serieBadlar: Array<{ fecha: string; badlar: number | null; tamar: number | null }>;
  timestamp: string;
  error?: string;
}

export type ComparadorResultado =
  | { id: "A"; data: ComparadorAData }
  | { id: "B"; data: ComparadorBData }
  | { id: "C"; data: ComparadorCData }
  | { id: "D"; data: ComparadorDData }
  | { id: "E"; data: ComparadorEData }
  | { id: "F"; data: ComparadorFData }
  | { id: "G"; data: ComparadorGData };
