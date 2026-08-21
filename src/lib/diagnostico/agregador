import type { PositionEnriquecida, PortfolioSummary } from "./types";

export function agregarPortfolio(activos: PositionEnriquecida[]): PortfolioSummary {
  const totalValorizado = activos.reduce((sum, a) => sum + a.valorizado, 0);

  if (totalValorizado <= 0) {
    return {
      activos,
      totalValorizado: 0,
      rentaFija: { pesoPct: 0, tirPromedioPonderada: 0, teaPromedioPonderada: 0, durationPromedioPonderada: 0, convexityPromedioPonderada: 0, cashflowTotal: [] },
      rentaVariable: { pesoPct: 0, betaPromedioPonderado: 0, alphaPromedioPonderado: 0, rSquaredPromedioPonderado: 0 },
      liquidez: { pesoPct: 0 },
    };
  }

  const activosConPeso = activos.map((a) => ({
    ...a,
    pesoPct: (a.valorizado / totalValorizado) * 100,
  }));

  const rfActivos = activosConPeso.filter((a) => a.categoriaMacro === "RentaFija" && a.rentaFija);
  const rvActivos = activosConPeso.filter((a) => a.categoriaMacro === "RentaVariable" && a.rentaVariable);

  const rfPeso = rfActivos.reduce((s, a) => s + a.pesoPct, 0);
  const rvPeso = rvActivos.reduce((s, a) => s + a.pesoPct, 0);
  const liqPeso = activosConPeso.filter((a) => a.categoriaMacro === "Liquidez").reduce((s, a) => s + a.pesoPct, 0);

  const tirPromedioPonderada = weightedAvg(rfActivos, (a) => a.rentaFija!.tir);
  const teaPromedioPonderada = weightedAvg(rfActivos, (a) => a.rentaFija!.tea);
  const durationPromedioPonderada = weightedAvg(rfActivos, (a) => a.rentaFija!.durationMacaulay);
  const convexityPromedioPonderada = weightedAvg(rfActivos, (a) => a.rentaFija!.convexity);

  const cashflowPorFecha = new Map<string, number>();
  for (const a of rfActivos) {
    for (const f of a.rentaFija!.flujos) {
      const monto = f.monto * a.cantidad;
      cashflowPorFecha.set(f.fecha, (cashflowPorFecha.get(f.fecha) ?? 0) + monto);
    }
  }
  const cashflowTotal = [...cashflowPorFecha.entries()]
    .map(([fecha, monto]) => ({ fecha, monto: Math.round(monto * 100) / 100 }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const betaPromedioPonderado = weightedAvg(rvActivos, (a) => a.rentaVariable!.beta);
  const alphaPromedioPonderado = weightedAvg(rvActivos, (a) => a.rentaVariable!.alpha);
  const rSquaredPromedioPonderado = weightedAvg(rvActivos, (a) => a.rentaVariable!.rSquared);

  return {
    activos: activosConPeso,
    totalValorizado,
    rentaFija: {
      pesoPct: rfPeso,
      tirPromedioPonderada,
      teaPromedioPonderada,
      durationPromedioPonderada,
      convexityPromedioPonderada,
      cashflowTotal,
    },
    rentaVariable: {
      pesoPct: rvPeso,
      betaPromedioPonderado,
      alphaPromedioPonderado,
      rSquaredPromedioPonderado,
    },
    liquidez: {
      pesoPct: liqPeso,
    },
  };
}

function weightedAvg(items: PositionEnriquecida[], fn: (item: PositionEnriquecida) => number): number {
  const totalPeso = items.reduce((s, a) => s + a.pesoPct, 0);
  if (totalPeso <= 0) return 0;
  const sum = items.reduce((s, a) => s + fn(a) * a.pesoPct, 0);
  return sum / totalPeso;
}
