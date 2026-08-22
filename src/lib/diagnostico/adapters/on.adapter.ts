import type { AssetAdapter } from "./adapter.interface";
import type { PortfolioAssetInput, PositionEnriquecida, RentaFijaInfo, PipelineContext } from "../types";
import type { Clasificacion } from "../clasificador";
import { calcularRendimientosBono, getBonoPrecioYTCOficial } from "../../renta-fija.functions";
import { BONOS_DB } from "../../bonos-data";
import { calcularValorizadoRentaFija } from "../convenciones-precio";

export const onAdapter: AssetAdapter = {
  tipo: "on",

  async enriquecer(input: PortfolioAssetInput, clasificacion: Clasificacion, ctx?: PipelineContext): Promise<PositionEnriquecida> {
    const precios = await getBonoPrecioYTCOficial({
      data: {
        tickers: [input.ticker],
        sessionId: ctx?.iolToken,
      },
    });

    const precioIOL = precios.precios[input.ticker]?.precio ?? null;
    if (!precioIOL || precioIOL <= 0) {
      return { ...base(input, clasificacion), valorizado: 0 };
    }

    const bonoConfig = BONOS_DB[input.ticker];
    const isHardDollar = bonoConfig?.tipo === "Hard Dollar" || bonoConfig?.tipo === "ON Hard Dollar";
    const tcMep = precios.tcMep ?? null;
    const precioEnUSD = isHardDollar && tcMep != null && tcMep > 0
      ? precioIOL / tcMep
      : precioIOL;

    const rendimiento = await calcularRendimientosBono({
      data: {
        ticker: input.ticker,
        precioPorCada100VN: precioEnUSD,
        tcOficial: precios.tcOficial ?? undefined,
      },
    });

    const rentaFija: RentaFijaInfo = {
      tir: rendimiento.tir ?? 0,
      tea: rendimiento.tea ?? 0,
      tna: rendimiento.tna ?? 0,
      durationMacaulay: rendimiento.durationMacaulay ?? 0,
      durationModificada: rendimiento.durationModificada ?? 0,
      convexity: rendimiento.convexity ?? 0,
      flujos: (rendimiento.flujos ?? []).map((f) => ({
        fecha: f.fecha,
        monto: f.monto,
      })),
    };

    return {
      ...base(input, clasificacion),
      valorizado: calcularValorizadoRentaFija(input.cantidad, precioEnUSD, clasificacion.fuente as any),
      rentaFija,
    };
  },
};

function base(input: PortfolioAssetInput, c: Clasificacion): PositionEnriquecida {
  return { id: input.id, ticker: input.ticker, cantidad: input.cantidad, valorizado: 0, categoriaMacro: c.categoriaMacro, subtipo: c.subtipo, pesoPct: 0 };
}
