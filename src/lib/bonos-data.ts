// @ts-nocheck
import { loadJson } from "./supabase-loader";

// Cache local de bonosData cargada desde Supabase Storage
let _bonosDataCache: any = null;

export async function getBonosData(): Promise<any> {
  if (!_bonosDataCache) {
    _bonosDataCache = await loadJson("bonos.json");
  }
  return _bonosDataCache;
}

// Fallback sincrónico para imports que aún no migraron a async
// DEPRECATED: migrar a getBonosData() con await
let _bonosJson: any = null;
export function setBonosData(data: any) {
  _bonosJson = data;
}

import localBonosJson from "@/data/bonos.json";
_bonosJson = localBonosJson;

// ============================================================================
// TIPOS COMPARTIDOS
// ============================================================================

export type TipoBono =
  | "Hard Dollar"
  | "Dollar-Linked"
  | "CER"
  | "LECAP"
  | "Tasa Fija ARS"
  | "TAMAR"
  | "ON Hard Dollar"
  | "ON CER"
  | "ON Badlar"
  | "ON Tasa Fija";

export type YieldConvention = "STREET" | "TRUE";
export type TipoTasa = "fixed" | "step-up" | "zero-coupon" | "floating";
export type Ajuste = "CER" | "DolarOficial" | "DolarMEP" | "BADLAR" | "TAMAR" | null;
export type TipoInstrumento = "BONO" | "LETRA" | "ON" | "FCI";
export type TipoFlujo = "Cupon" | "Amortizacion" | "Cupon+Amortizacion" | "PagoUnico";
export type FrecuenciaPago = "Annual" | "Semiannual" | "Quarterly" | "Monthly" | "AtMaturity";
export type ConvencionDias = "30/360" | "ACT/360" | "ACT/365" | "ACT/ACT";
export type TipoAmortizacion = "Bullet" | "Sinkable" | "Amortizing";

export interface FlujoFuturo {
  fecha: string;
  monto: number;
  tipo: "cupon" | "amortizacion" | "cupon+amortizacion";
}

export interface FlujoEntry {
  fecha: string;
  monto: number;
  tipoFlujo: TipoFlujo;
}

export interface HistoricoEntry {
  fecha: string;
  precio: number;
  tirCalculada: number | null;
  paridad: number | null;
  fuente: string;
}

export interface BonoConfig {
  ticker: string;
  tickerApi: string;
  mercado: "bCBA" | "NYSE";
  tipo: TipoBono;
  descripcion: string;
  vencimiento: string;
  monedaFlujos: "USD" | "ARS";
  flujosPorCada100VN: FlujoFuturo[];
  isin?: string;
  jurisdiccion?: string;
  tipoCupon?: string;
  moneda?: string;
  frecuenciaPago?: string;
  convencionDias?: string;
  tipoAmortizacion?: string;
  montoEmision?: number;
  cuponAnual?: number;
  valorPar?: number;
  emision?: string;
  ley?: "argentina" | "extranjera";
  calificacion?: string;

  cuponDerivado?: boolean; // true si el cupón fue estimado (no confirmado con prospecto)
  origenCupon?: "prospecto_cnv" | "calibrado_inverso" | "docta_api";
  escalaPrecioIOL?: number;
  tipoBono?: string;
  activo?: boolean;
  subcategoria?: string;
  ley?: "argentina" | "extranjera";
  especie?: "Pesos" | "Dolar" | "Cable";
  especies_relacionadas?: Record<string, string>;
  fixtureValidacion?: {
    fechaSnapshot: string;
    precioIOLSnapshot: number;
    metricasPublicadas: Record<string, number>;
  };

  // NUEVOS CAMPOS estandarizados
  instrumento?: TipoInstrumento;
  monedaPago?: string;
  fechaEmision?: string;
  valorResidualActual?: number;
  yieldConvention?: YieldConvention;
  tipoTasa?: TipoTasa;
  ajuste?: Ajuste;
  flujosDetallados?: FlujoEntry[];
  historico?: HistoricoEntry[];
}

// ============================================================================
// TIPO DEL JSON (raw)
// ============================================================================

type BonosJson = Record<
  string,
  {
    ticker_api: string;
    mercado: string;
    tipo: string;
    descripcion: string;
    vencimiento: string;
    flujos_futuros_cada_100_vn: { fecha: string; monto: number; tipoFlujo?: string }[];
    isin?: string;
    jurisdiccion?: string;
    tipoCupon?: string;
    moneda?: string;
    frecuenciaPago?: string;
    convencionDias?: string;
    tipoAmortizacion?: string;
    montoEmision?: number;
    cuponAnual?: number;
    cuponDerivado?: boolean;
    valorPar?: number;
    // nuevos
    instrumento?: string;
    monedaPago?: string;
    fechaEmision?: string | null;
    valorResidualActual?: number;
    yieldConvention?: string;
    tipoTasa?: string;
    ajuste?: string | null;
    origenCupon?: "prospecto_cnv" | "calibrado_inverso" | "docta_api";
    escalaPrecioIOL?: number;
    tipoBono?: string;
    activo?: boolean;
    subcategoria?: string;
    ley?: string;
    especie?: string;
    especies_relacionadas?: Record<string, string>;
    fixtureValidacion?: {
      fechaSnapshot: string;
      precioIOLSnapshot: number;
      metricasPublicadas: Record<string, number>;
    };
    historico?: Array<{
      fecha: string;
      precio: number;
      tirCalculada: number | null;
      paridad: number | null;
      fuente: string;
    }>;
  }
>;

// ============================================================================
// HELPERS
// ============================================================================

function parseJsonFlujos(
  flujos: { fecha: string; monto: number; tipoFlujo?: string }[],
): FlujoFuturo[] {
  return flujos.map((f) => {
    const tf = f.tipoFlujo ?? "Cupon+Amortizacion";
    let tipo: "cupon" | "amortizacion" | "cupon+amortizacion";
    switch (tf) {
      case "Cupon":
        tipo = "cupon";
        break;
      case "Amortizacion":
        tipo = "amortizacion";
        break;
      case "PagoUnico":
        tipo = "cupon+amortizacion";
        break;
      default:
        tipo = "cupon+amortizacion";
    }
    return { fecha: f.fecha, monto: f.monto, tipo };
  });
}

function parseFlujosDetallados(
  flujos: { fecha: string; monto: number; tipoFlujo?: string }[],
): FlujoEntry[] {
  return flujos.map((f) => ({
    fecha: f.fecha,
    monto: f.monto,
    tipoFlujo: (f.tipoFlujo ?? "Cupon+Amortizacion") as TipoFlujo,
  }));
}

// ============================================================================
// BUILD DB
// ============================================================================

function buildBonosDB(): Record<string, BonoConfig> {
  const db: Record<string, BonoConfig> = {};
  const jsonData = _bonosJson as BonosJson;

  for (const [ticker, entry] of Object.entries(jsonData)) {
    const tipo = entry.tipo as TipoBono;

    // Infer monedaFlujos: Dollar-Linked paga en ARS, el resto según moneda del JSON
    let monedaFlujos: "USD" | "ARS";
    if (entry.monedaPago) {
      monedaFlujos = entry.monedaPago as "USD" | "ARS";
    } else if (tipo === "Dollar-Linked") {
      monedaFlujos = "ARS";
    } else {
      monedaFlujos = (entry.moneda === "ARS" ? "ARS" : "USD") as "USD" | "ARS";
    }

    // Infer instrumento, yieldConvention, etc. desde el JSON (ya vienen migrados)
    const instrumento = (entry.instrumento ?? "BONO") as TipoInstrumento;
    const yieldConvention = (entry.yieldConvention ?? "TRUE") as YieldConvention;
    const tipoTasa = (entry.tipoTasa ?? "fixed") as TipoTasa;
    const ajuste = entry.ajuste !== undefined ? (entry.ajuste as Ajuste) : null;
    const valorResidualActual =
      entry.valorResidualActual ?? (entry.valorPar != null ? entry.valorPar * 100 : 100);
    const fechaEmision = entry.fechaEmision ?? entry.vencimiento;
    const monedaPago = entry.monedaPago ?? entry.moneda ?? "USD";

    db[ticker] = {
      ticker,
      tickerApi: entry.ticker_api,
      mercado: (entry.mercado === "NYSE" ? "NYSE" : "bCBA") as "bCBA" | "NYSE",
      tipo,
      descripcion: entry.descripcion,
      vencimiento: entry.vencimiento,
      monedaFlujos,
      flujosPorCada100VN: parseJsonFlujos(entry.flujos_futuros_cada_100_vn),
      isin: entry.isin,
      jurisdiccion: entry.jurisdiccion,
      tipoCupon: entry.tipoCupon,
      moneda: entry.moneda,
      frecuenciaPago: entry.frecuenciaPago,
      convencionDias: entry.convencionDias,
      tipoAmortizacion: entry.tipoAmortizacion,
      montoEmision: entry.montoEmision,
      cuponAnual: entry.cuponAnual,
      cuponDerivado: entry.cuponDerivado ?? false,
      valorPar: entry.valorPar ?? 100,
      activo: entry.activo,
      subcategoria: entry.subcategoria,
      ley: entry.ley as "argentina" | "extranjera" | undefined,
      especie: entry.especie as "Pesos" | "Dolar" | "Cable" | undefined,
      especies_relacionadas: entry.especies_relacionadas,
      // Nuevos campos
      instrumento,
      monedaPago,
      fechaEmision,
      valorResidualActual,
      yieldConvention,
      tipoTasa,
      ajuste,
      origenCupon: entry.origenCupon,
      escalaPrecioIOL: entry.escalaPrecioIOL,
      tipoBono: entry.tipoBono,
      fixtureValidacion: entry.fixtureValidacion,
      flujosDetallados: parseFlujosDetallados(entry.flujos_futuros_cada_100_vn),
      historico: entry.historico ?? [],
    };
  }

  return db;
}

export const BONOS_DB = buildBonosDB();
export const BONOS_LIST = Object.values(BONOS_DB)
  .filter((b) => b.activo !== false)
  .sort((a, b) => a.ticker.localeCompare(b.ticker));
export const BONOS_TICKERS = BONOS_LIST.map((b) => b.ticker);

// ============================================================================
// HELPERS DE CONSULTA
// ============================================================================

export function getBonoByTicker(ticker: string): BonoConfig | undefined {
  return BONOS_DB[ticker.toUpperCase()];
}

export function getAllBonos(): BonoConfig[] {
  return BONOS_LIST;
}

export function bonoExiste(ticker: string): boolean {
  return ticker.toUpperCase() in BONOS_DB;
}

export function filtrarBonosPorTipo(tipo: TipoBono): BonoConfig[] {
  return BONOS_LIST.filter((b) => b.tipo === tipo);
}

export function filtrarBonosPorMercado(mercado: "bCBA" | "NYSE"): BonoConfig[] {
  return BONOS_LIST.filter((b) => b.mercado === mercado);
}

export function filtrarPorInstrumento(instrumento: TipoInstrumento): BonoConfig[] {
  return BONOS_LIST.filter((b) => b.instrumento === instrumento);
}

// ============================================================================
// BONOS ACTIVOS (excluye stubs sin vencimiento ni flujos)
// ============================================================================

export function bonosActivos(): BonoConfig[] {
  return BONOS_LIST.filter(
    (b) => b.activo !== false && b.vencimiento && b.flujosPorCada100VN.length > 0,
  );
}

export function getBonosActivosPorTipo(tipo: TipoBono): BonoConfig[] {
  return bonosActivos().filter((b) => b.tipo === tipo);
}

// ============================================================================
// TAXONOMÍA — Categorías madre del gráfico
// ============================================================================

export interface CategoriaTaxonomia {
  id: string;
  label: string;
  badge: string;
  color: string;
  hexColor: string;
}

export const CATEGORIAS_TAXONOMIA: CategoriaTaxonomia[] = [
  {
    id: "Hard Dollar",
    label: "Hard Dollar",
    badge: "bg-green-900/40 text-green-300 border-green-800",
    color: "text-green-400",
    hexColor: "#4ade80",
  },
  {
    id: "Dollar-Linked",
    label: "Dollar-Linked",
    badge: "bg-blue-900/40 text-blue-300 border-blue-800",
    color: "text-blue-400",
    hexColor: "#60a5fa",
  },
  {
    id: "CER",
    label: "CER",
    badge: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
    color: "text-yellow-400",
    hexColor: "#facc15",
  },
  {
    id: "LECAP",
    label: "LECAP",
    badge: "bg-purple-900/40 text-purple-300 border-purple-800",
    color: "text-purple-400",
    hexColor: "#c084fc",
  },
  {
    id: "Tasa Fija ARS",
    label: "Tasa Fija ARS",
    badge: "bg-orange-900/40 text-orange-300 border-orange-800",
    color: "text-orange-400",
    hexColor: "#fb923c",
  },
  {
    id: "TAMAR",
    label: "TAMAR",
    badge: "bg-pink-900/40 text-pink-300 border-pink-800",
    color: "text-pink-400",
    hexColor: "#f472b6",
  },
];

export function getCategoriaTaxonomia(tipo: TipoBono): CategoriaTaxonomia {
  return (
    CATEGORIAS_TAXONOMIA.find((c) => c.id === tipo) ?? {
      id: tipo,
      label: tipo,
      badge: "bg-muted text-muted-foreground border-border",
      color: "text-muted-foreground",
      hexColor: "#888",
    }
  );
}

export function getFrecuenciaNumerica(frecuencia?: string): number {
  switch (frecuencia) {
    case "Semiannual":
      return 2;
    case "Quarterly":
      return 4;
    case "Monthly":
      return 12;
    case "Annual":
      return 1;
    case "AtMaturity":
      return 1;
    default:
      return 1;
  }
}

export function categoriaBono(tipo: TipoBono): {
  label: string;
  badge: string;
  color: string;
} {
  const mapa: Record<TipoBono, { label: string; badge: string; color: string }> = {
    "Hard Dollar": {
      label: "Título Público",
      badge: "bg-green-900/40 text-green-300 border-green-800",
      color: "text-green-400",
    },
    "Dollar-Linked": {
      label: "Ajustable USD",
      badge: "bg-blue-900/40 text-blue-300 border-blue-800",
      color: "text-blue-400",
    },
    CER: {
      label: "Ajustable CER",
      badge: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
      color: "text-yellow-400",
    },
    LECAP: {
      label: "Letra",
      badge: "bg-purple-900/40 text-purple-300 border-purple-800",
      color: "text-purple-400",
    },
    "Tasa Fija ARS": {
      label: "Tasa Fija ARS",
      badge: "bg-orange-900/40 text-orange-300 border-orange-800",
      color: "text-orange-400",
    },
    TAMAR: {
      label: "TAMAR",
      badge: "bg-pink-900/40 text-pink-300 border-pink-800",
      color: "text-pink-400",
    },
    "ON Hard Dollar": {
      label: "ON Hard Dollar",
      badge: "bg-teal-900/40 text-teal-300 border-teal-800",
      color: "text-teal-400",
    },
    "ON CER": {
      label: "ON CER",
      badge: "bg-amber-900/40 text-amber-300 border-amber-800",
      color: "text-amber-400",
    },
    "ON Badlar": {
      label: "ON Badlar",
      badge: "bg-cyan-900/40 text-cyan-300 border-cyan-800",
      color: "text-cyan-400",
    },
    "ON Tasa Fija": {
      label: "ON Tasa Fija",
      badge: "bg-indigo-900/40 text-indigo-300 border-indigo-800",
      color: "text-indigo-400",
    },
  };
  return mapa[tipo];
}
