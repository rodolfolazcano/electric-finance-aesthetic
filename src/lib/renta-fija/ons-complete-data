import rfcJson from "@/../RENTA_FIJA_COMPLETA.json";
import type { RawFlow } from "./ons-tir-engine";
import { getSector, getPaymentModality } from "./ons-classification";

export interface CompleteOnData {
  ticker: string;
  emisor: string;
  vencimiento: string;
  moneda: string;
  cuponTasa: number;
  frecuencia: string;
  precioArs: number;
  tirPublicada: number;
  volumen: number;
  flujos: Array<{ fecha: Date; monto: number }>;
  rawFlujos: Array<{ fecha: string; monto: number }>;
  hasFlowData: boolean;
  sector: string;
  modality: string;
}

function flattenCompleteOns(): CompleteOnData[] {
  const cat = (rfcJson as any).armado_portafolio?.obligaciones_negociables?.clasificacion_por_moneda?.categorias;
  if (!cat) return [];

  const result: CompleteOnData[] = [];
  const seenTickers = new Set<string>();

  for (const [, catVal] of Object.entries(cat)) {
    const items: any[] = (catVal as any).instrumentos;
    if (!Array.isArray(items)) continue;

    for (const b of items) {
      if (!b.ticker) continue;
      const ticker = b.ticker.toUpperCase();
      if (seenTickers.has(ticker)) continue;
      seenTickers.add(ticker);

      const dt = b.datos_tecnicos;
      const pb = b.panel_balanz;
      const ff = b.flujo_fondos;

      const hasFlowData = !!(
        ff && Array.isArray(ff) && ff.length > 0
        && pb?.precio_ultimo != null && pb.precio_ultimo > 0 && pb.precio_ultimo < 100_000
      );

      const rawFlujos: Array<{ fecha: string; monto: number }> = hasFlowData
        ? (ff as RawFlow[]).map((f: RawFlow) => {
            const [y, m, d] = f.fecha.split("-").map(Number);
            const fecha = new Date(Date.UTC(y, m - 1, d));
            const monto = f.cupon_pct !== undefined || f.amort_pct !== undefined
              ? (f.cupon_pct ?? 0) + (f.amort_pct ?? 0)
              : (f.monto_por_cien ?? 0);
            return { fecha: f.fecha, monto };
          })
        : [];

      const flujos = rawFlujos.map((f) => ({
        fecha: new Date(f.fecha + "T00:00:00Z"),
        monto: f.monto,
      }));

      const sector = getSector(ticker) || (dt?.nombre ? "" : "");
      const modality = getPaymentModality(ticker);

      result.push({
        ticker,
        emisor: dt?.emisor ?? b.nombre ?? "",
        vencimiento: dt?.fecha_vencimiento ?? "",
        moneda: dt?.moneda ?? b.moneda ?? "",
        cuponTasa: dt?.cupon?.tasa ?? 0,
        frecuencia: dt?.cupon?.frecuencia ?? "",
        precioArs: pb?.precio_ultimo ?? 0,
        tirPublicada: pb?.tir_porcentual ?? 0,
        volumen: pb?.volumen_diario_pesos ?? 0,
        flujos,
        rawFlujos,
        hasFlowData,
        sector,
        modality,
      });
    }
  }

  return result;
}

export const COMPLETE_ONS = flattenCompleteOns();
export const COMPLETE_ONS_MAP = new Map(COMPLETE_ONS.map((o) => [o.ticker, o]));
export const COMPLETE_ONS_WITH_FLOWS = COMPLETE_ONS.filter((o) => o.hasFlowData);

// Generate synthetic D (MEP) and C (CCL) species from O-species bonds
// These share the same cash flows but trade in USD via MEP/CCL
function generateSyntheticSpecies(): CompleteOnData[] {
  const synthetic: CompleteOnData[] = [];
  const seenSynthetic = new Set<string>();

  for (const o of COMPLETE_ONS_WITH_FLOWS) {
    const root = o.ticker.slice(0, -1);
    const suffix = o.ticker.slice(-1).toUpperCase();

    // Only generate from O-species
    if (suffix !== "O") continue;

    // D-species (MEP)
    const dTicker = root + "D";
    if (!seenSynthetic.has(dTicker) && !COMPLETE_ONS_MAP.has(dTicker)) {
      seenSynthetic.add(dTicker);
      synthetic.push({
        ...o,
        ticker: dTicker,
        precioArs: 0,
      });
    }

    // C-species (CCL)
    const cTicker = root + "C";
    if (!seenSynthetic.has(cTicker) && !COMPLETE_ONS_MAP.has(cTicker)) {
      seenSynthetic.add(cTicker);
      synthetic.push({
        ...o,
        ticker: cTicker,
        precioArs: 0,
      });
    }
  }
  return synthetic;
}

const SYNTHETIC_SPECIES = generateSyntheticSpecies();

// Re-export augmented arrays
export const COMPLETE_ONS_ALL = [...COMPLETE_ONS, ...SYNTHETIC_SPECIES];
export const COMPLETE_ONS_ALL_WITH_FLOWS = [...COMPLETE_ONS_WITH_FLOWS, ...SYNTHETIC_SPECIES];
export const COMPLETE_ONS_ALL_MAP = new Map(COMPLETE_ONS_ALL.map((o) => [o.ticker, o]));
