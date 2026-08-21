import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import type { ConclusionSectorialInteligente } from "./interpretacion-sectorial.functions";
import type { VentajaCompetitivaCuantitativaResult } from "./ventaja-competitiva-cuantitativa.functions";
import type { CostosDeCambioResult } from "./costos-de-cambio.functions";
import type { GobiernoCorporativoCualitativoResult } from "./gobierno-corporativo-cualitativo.functions";
import type { PoderFijacionPreciosResult } from "./poder-fijacion-precios.functions";
import { calcularVentajaCompetitivaCuantitativa } from "./ventaja-competitiva-cuantitativa.functions";
import {
  calcularCostosDeCambio,
  calcularPredictibilidadIngresos,
} from "./costos-de-cambio.functions";
import { calcularGobiernoCorporativoCualitativo } from "./gobierno-corporativo-cualitativo.functions";
import { calcularPoderFijacionPrecios } from "./poder-fijacion-precios.functions";

export interface AnalisisCualitativoSemiAutomaticoResult {
  symbol: string;
  esETF: boolean;
  ventajaCompetitiva: VentajaCompetitivaCuantitativaResult | null;
  costosDeCambio: CostosDeCambioResult | null;
  gobiernoCorporativo: GobiernoCorporativoCualitativoResult | null;
  predictibilidadIngresos: { fuerza: string; detalle: string; interpretacion: string } | null;
  poderFijacionPrecios: PoderFijacionPreciosResult | null;
}

export function calcularAnalisisCualitativoSemiAutomatico(
  result: FundamentalAFResult,
  sectorComparacion: {
    peers: FundamentalAFResult[];
    sector: string;
    industria: string;
  } | null,
  sectorConclusion: ConclusionSectorialInteligente | null,
  historico: PeriodoHistoricoRow[] | null,
): AnalisisCualitativoSemiAutomaticoResult {
  if (result.esETF) {
    return {
      symbol: result.symbol,
      esETF: true,
      ventajaCompetitiva: null,
      costosDeCambio: null,
      gobiernoCorporativo: null,
      predictibilidadIngresos: null,
      poderFijacionPrecios: null,
    };
  }

  const ventajaCompetitiva = sectorComparacion
    ? calcularVentajaCompetitivaCuantitativa(result, sectorComparacion, sectorConclusion, historico)
    : null;

  return {
    symbol: result.symbol,
    esETF: false,
    ventajaCompetitiva,
    costosDeCambio: calcularCostosDeCambio(result, historico),
    gobiernoCorporativo: calcularGobiernoCorporativoCualitativo(result, historico),
    predictibilidadIngresos: calcularPredictibilidadIngresos(result, historico),
    poderFijacionPrecios: calcularPoderFijacionPrecios(result, historico),
  };
}
