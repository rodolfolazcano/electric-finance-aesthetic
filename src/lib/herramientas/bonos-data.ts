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
import rentaFijaCompletaJson from "@/data/RENTA_FIJA_COMPLETA.json";
_bonosJson = localBonosJson;

// Merge RENTA_FIJA_COMPLETA.json (fuente más completa para soberanos) — reciclaje Elbaum U4
let _rentaFijaCompleta: any = rentaFijaCompletaJson as any;

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

function mapRentaFijaTipo(entry: any): TipoBono {
  const moneda = entry.moneda as string;
  const tipo = entry.tipo as string;
  const subtipo = entry.subtipo as string;
  if (moneda === "CER") return "CER";
  if (tipo === "LECAP" || tipo === "LECAP_CAPITALIZABLE") return "LECAP";
  if (subtipo === "Dólar Linked" || tipo === "Bonte" && moneda === "USD") return "Dollar-Linked";
  return "Hard Dollar";
}

function parseRentaFijaFlujos(flujos: Array<{ fecha: string; monto_por_cien: number; tipo: string }>): FlujoFuturo[] {
  return (flujos ?? []).map((f) => {
    const tf = f.tipo as string;
    let tipo: FlujoFuturo["tipo"] = "cupon+amortizacion";
    if (tf === "Cupon") tipo = "cupon";
    else if (tf === "Amortizacion") tipo = "amortizacion";
    else if (tf === "PagoUnico") tipo = "cupon+amortizacion";
    return { fecha: f.fecha, monto: f.monto_por_cien, tipo };
  });
}

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

  // --- Merge RENTA_FIJA_COMPLETA.json (reciclaje) — prioriza flujos completos soberanos ---
  try {
    const completa: any = _rentaFijaCompleta;
    const cats: any[] = completa?.categorias ?? [];
    for (const cat of cats) {
      const subs: any[] = cat.subcategorias ?? [];
      for (const sub of subs) {
        const bonos: any[] = sub.bonos ?? [];
        for (const b of bonos) {
          const ticker: string = b.ticker;
          if (!ticker) continue;
          const existente = db[ticker];
          const flujosRenta = parseRentaFijaFlujos(b.flujo_fondos ?? []);
          // Si no existe o el existente tiene flujos truncados (<4) o monto sospechoso (0.38), sobreescribir con RENTA_FIJA completa
          const esMejor =
            !existente ||
            flujosRenta.length > (existente.flujosPorCada100VN?.length ?? 0) ||
            (existente.flujosPorCada100VN?.some((f: any) => f.monto < 1) ?? false);
          if (!esMejor && existente) continue;
          // Mapear a BonoConfig si es nuevo
          if (!existente) {
            const tipoRf = mapRentaFijaTipo(b);
            db[ticker] = {
              ticker,
              tickerApi: ticker,
              mercado: "bCBA",
              tipo: tipoRf,
              descripcion: b.nombre ?? b.descripcion ?? ticker,
              vencimiento: b.fecha_vencimiento,
              monedaFlujos: (b.moneda === "USD" ? "USD" : "ARS") as any,
              flujosPorCada100VN: flujosRenta,
              isin: b.isin,
              jurisdiccion: b.ley === "Nueva_York" ? "NY" : "ARG",
              tipoCupon: b.cupon?.tipo ?? "Fixed rate",
              moneda: b.moneda,
              frecuenciaPago: b.cupon?.frecuencia ?? "Semiannual",
              convencionDias: b.cupon?.convencion ?? "ACT/365",
              tipoAmortizacion: b.amortizacion?.includes("Bullet") ? "Bullet" : "Sinkable",
              montoEmision: b.montoEmision,
              cuponAnual: b.cupon?.tasa ?? 0,
              valorPar: b.valor_nominal ?? 100,
              valorResidualActual: 100,
              yieldConvention: (b.moneda === "USD" ? "STREET" : "TRUE") as any,
              tipoTasa: (b.cupon?.tipo === "Step-up" ? "step-up" : "fixed") as any,
              ajuste: (b.moneda === "CER" ? "CER" : null) as any,
              instrumento: "BONO",
              monedaPago: b.moneda,
              fechaEmision: b.fecha_emision,
              flujosDetallados: flujosRenta.map((f) => ({ fecha: f.fecha, monto: f.monto, tipoFlujo: "Cupon+Amortizacion" as any })),
              historico: [],
            } as any;
          } else {
            // Actualizar flujos del existente con los completos
            existente.flujosPorCada100VN = flujosRenta;
            existente.flujosDetallados = flujosRenta.map((f) => ({ fecha: f.fecha, monto: f.monto, tipoFlujo: "Cupon+Amortizacion" as any }));
            if (b.cupon?.tasa) existente.cuponAnual = b.cupon.tasa;
            if (b.fecha_vencimiento) existente.vencimiento = b.fecha_vencimiento;
            if (b.descripcion) existente.descripcion = b.nombre ?? b.descripcion;
          }
        }
      }
    }
  } catch (e) {
    console.warn("Merge RENTA_FIJA_COMPLETA falló", e);
  }

  return db;
}

export const BONOS_DB = buildBonosDB();
export const BONOS_LIST = Object.values(BONOS_DB).sort((a, b) => a.ticker.localeCompare(b.ticker));
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
