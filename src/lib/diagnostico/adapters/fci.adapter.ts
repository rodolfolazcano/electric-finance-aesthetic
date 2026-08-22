import type { AssetAdapter } from "./adapter.interface";
import type { PortfolioAssetInput, PositionEnriquecida, RentaVariableInfo, RentaFijaInfo } from "../types";
import type { Clasificacion } from "../clasificador";
import { fetchLecapFciData } from "../../fci-lecap.functions";

const AD = "https://api.argentinadatos.com";

const HORIZONTE_MAP: Record<string, "FCI-RF" | "FCI-Mixto" | "FCI-RV"> = {
  corto: "FCI-RF",
  medio: "FCI-Mixto",
  largo: "FCI-RV",
};

export const fciAdapter: AssetAdapter = {
  tipo: "fci",

  async enriquecer(input: PortfolioAssetInput, clasificacion: Clasificacion): Promise<PositionEnriquecida> {
    const data = await fetchLecapFciData({ data: {} });

    const fci = (data.fcis ?? []).find(
      (f) => f.fondo.toUpperCase() === input.ticker.toUpperCase(),
    );

    if (!fci) {
      return { ...base(input, clasificacion), valorizado: 0 };
    }

    const subtipo = HORIZONTE_MAP[fci.horizonte] ?? "FCI-RF";
    const esRF = subtipo === "FCI-RF";
    const valorizado = input.cantidad * fci.ccp;
    const windowReturns = await calcularVentanasFCI(input.ticker, fci.tipo).catch(() => null);

    if (esRF) {
      const rendAnual = windowReturns?.rendimientoAnual ?? fci.variacionAnual ?? 0;
      const rentaFija: RentaFijaInfo = {
        tir: rendAnual,
        tea: rendAnual,
        tna: rendAnual / 12,
        durationMacaulay: 0.5,
        durationModificada: 0.5 / (1 + rendAnual / 100),
        convexity: 0,
        flujos: [],
      };
      return {
        ...base(input, { ...clasificacion, subtipo }),
        valorizado,
        rentaFija,
      };
    }

    const rentaVariable: RentaVariableInfo = {
      precio: fci.ccp,
      variacionPct: fci.variacionDiaria ?? 0,
      rsi: 0, macd: 0, sma50: 0, sma200: 0, pe: null, score: 0, beta: 0, alpha: 0, rSquared: 0,
    };
    return {
      ...base(input, { ...clasificacion, subtipo }),
      valorizado,
      rentaVariable,
    };
  },
};

async function calcularVentanasFCI(
  fondo: string,
  categoria: string,
): Promise<{ rendimiento30d: number; rendimiento90d: number; rendimientoAnual: number } | null> {
  const hoy = new Date();
  const fechas = [30, 90, 365].map((d) => {
    const f = new Date(hoy);
    f.setDate(f.getDate() - d);
    return f.toISOString().split("T")[0].replace(/-/g, "/");
  });

  const vcps = await Promise.all(
    fechas.map(async (fecha) => {
      try {
        const r = await fetch(`${AD}/v1/finanzas/fci/${categoria}/${fecha}`, { cache: "no-store" });
        if (!r.ok) return null;
        const arr: Array<{ fondo: string; vcp: number }> = await r.json();
        return arr.find((x) => x.fondo.toUpperCase() === fondo.toUpperCase())?.vcp ?? null;
      } catch {
        return null;
      }
    }),
  );

  const actual = (await (async () => {
    const r = await fetch(`${AD}/v1/finanzas/fci/${categoria}/ultimo`, { cache: "no-store" });
    if (!r.ok) return null;
    const arr: Array<{ fondo: string; vcp: number }> = await r.json();
    return arr.find((x) => x.fondo.toUpperCase() === fondo.toUpperCase())?.vcp ?? null;
  })());

  if (actual == null) return null;

  const rend = (pasado: number | null): number => {
    if (pasado == null || pasado <= 0) return 0;
    return ((actual - pasado) / pasado) * 100;
  };

  return {
    rendimiento30d: rend(vcps[0]),
    rendimiento90d: rend(vcps[1]),
    rendimientoAnual: rend(vcps[2]),
  };
}

function base(input: PortfolioAssetInput, c: Clasificacion & { subtipo: string }): PositionEnriquecida {
  return { id: input.id, ticker: input.ticker, cantidad: input.cantidad, valorizado: 0, categoriaMacro: c.categoriaMacro, subtipo: c.subtipo as any, pesoPct: 0 };
}
