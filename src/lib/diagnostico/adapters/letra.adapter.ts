import type { AssetAdapter } from "./adapter.interface";
import type { PortfolioAssetInput, PositionEnriquecida, RentaFijaInfo } from "../types";
import type { Clasificacion } from "../clasificador";
import { fetchLecapFciData } from "../../fci-lecap.functions";
import { calcularValorizadoRentaFija } from "../convenciones-precio";

export const letraAdapter: AssetAdapter = {
  tipo: "letra",

  async enriquecer(input: PortfolioAssetInput, clasificacion: Clasificacion): Promise<PositionEnriquecida> {
    const data = await fetchLecapFciData({ data: {} });

    const lecap = (data.lecaps ?? []).find(
      (l) => l.ticker.toUpperCase() === input.ticker.toUpperCase(),
    );

    if (!lecap || lecap.diasAlVencimiento <= 0) {
      return { ...base(input, clasificacion), valorizado: 0 };
    }

    const precio = lecap.precio ?? lecap.vpv;
    // ⚠ VERIFICAR: escalaArgentinaDatos=1 (VPV por 1 VN) es ASUNCIÓN NO CONFIRMADA.
    // Si ArgentinaDatos devuelve VPV cada 100 VN (como IOL), cambiar escalaVN a 100
    // en CONVENCIONES_PRECIO_RENTA_FIJA (convenciones-precio.ts:16-17).
    const valorizado = calcularValorizadoRentaFija(input.cantidad, precio, clasificacion.fuente as any);
    const dias = lecap.diasAlVencimiento;
    const teaDecimal = lecap.tea / 100;

    const durationSimple = dias / 365;

    const rentaFija: RentaFijaInfo = {
      tir: lecap.tna / 100,
      tea: lecap.tea / 100,
      tna: lecap.tna / 100,
      durationMacaulay: durationSimple,
      durationModificada: teaDecimal > 0 ? durationSimple / (1 + teaDecimal) : 0,
      convexity: 0,
      flujos: [{
        fecha: lecap.fechaVencimiento,
        monto: lecap.vpv,
      }],
    };

    return {
      ...base(input, clasificacion),
      valorizado,
      rentaFija,
    };
  },
};

function base(input: PortfolioAssetInput, c: Clasificacion): PositionEnriquecida {
  return { id: input.id, ticker: input.ticker, cantidad: input.cantidad, valorizado: 0, categoriaMacro: c.categoriaMacro, subtipo: c.subtipo, pesoPct: 0 };
}
