// @ts-nocheck
import type { FundamentalAFResult, PeriodoHistoricoRow } from "./fundamental-af.functions";
import { calcularResilienciaMargen } from "./costos-de-cambio.functions";
import type { FuerzaSenal } from "./costos-de-cambio.functions";

export interface SenalPrecio {
  fuerza: FuerzaSenal;
  detalle: string;
}

export interface PoderFijacionPreciosResult {
  symbol: string;
  resilienciaMargen: SenalPrecio;
  crecimientoIngresosVsCosto: SenalPrecio;
  conclusion: "Alto" | "Moderado" | "Bajo" | "No concluyente";
  advertenciaMetodologica: string;
}

function ordenarPeriodos(historico: PeriodoHistoricoRow[]): PeriodoHistoricoRow[] {
  return (historico ?? [])
    .filter((p) => p.endDate)
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
}

export function calcularPoderFijacionPrecios(
  result: FundamentalAFResult,
  historico: PeriodoHistoricoRow[] | null,
): PoderFijacionPreciosResult {
  if (result.esETF) {
    return {
      symbol: result.symbol,
      resilienciaMargen: { fuerza: "no_disponible", detalle: "No aplica para ETFs." },
      crecimientoIngresosVsCosto: { fuerza: "no_disponible", detalle: "No aplica para ETFs." },
      conclusion: "No concluyente",
      advertenciaMetodologica: "No aplica para ETFs.",
    };
  }

  // ── Señal 1: Resiliencia de margen (reusada de costos-de-cambio) ──
  const periodos = ordenarPeriodos(historico ?? []);
  const resilienciaMargen = calcularResilienciaMargen(periodos);

  // ── Señal 2: Crecimiento de ingresos vs crecimiento de costo de ventas ──
  // costOfRevenue se deriva de revenue * (1 - grossMargin)
  let crecimientoIngresosVsCosto: SenalPrecio;
  const periodosConDato = periodos
    .filter(
      (p) => p.revenue != null && p.revenue > 0 && p.grossMargin != null && p.revenueChgPct != null,
    )
    .sort((a, b) => a.endDate.localeCompare(b.endDate));

  if (periodosConDato.length < 3) {
    crecimientoIngresosVsCosto = {
      fuerza: "no_disponible",
      detalle: `Se requieren al menos 3 períodos con revenue, grossMargin y revenueChgPct (hay ${periodosConDato.length}).`,
    };
  } else {
    let ingresosGananCosto = 0;
    let costoGanaIngresos = 0;
    for (let i = 1; i < periodosConDato.length; i++) {
      const curr = periodosConDato[i];
      const prev = periodosConDato[i - 1];
      const costCurr = curr.revenue! * (1 - curr.grossMargin!);
      const costPrev = prev.revenue! * (1 - prev.grossMargin!);
      if (costPrev <= 0) continue;
      const costGrowth = (costCurr - costPrev) / costPrev;
      const revGrowth = curr.revenueChgPct!;
      if (revGrowth > costGrowth * 1.01) {
        ingresosGananCosto++;
      } else if (costGrowth > revGrowth * 1.01) {
        costoGanaIngresos++;
      }
    }

    const total = ingresosGananCosto + costoGanaIngresos;
    if (total === 0) {
      crecimientoIngresosVsCosto = {
        fuerza: "mixta",
        detalle: `Ingresos y costo de ventas crecieron en línea en ${periodosConDato.length - 1} transiciones — sin desacople significativo.`,
      };
    } else {
      const pctFavorable = ingresosGananCosto / total;
      if (pctFavorable >= 0.66) {
        crecimientoIngresosVsCosto = {
          fuerza: "positiva",
          detalle: `En ${ingresosGananCosto}/${total} transiciones los ingresos crecieron más que el costo de ventas — sugiere poder de fijación de precio.`,
        };
      } else if (pctFavorable >= 0.33) {
        crecimientoIngresosVsCosto = {
          fuerza: "mixta",
          detalle: `Comportamiento mixto: ingresos superaron al costo en ${ingresosGananCosto} de ${total} transiciones analizadas.`,
        };
      } else {
        crecimientoIngresosVsCosto = {
          fuerza: "negativa",
          detalle: `En ${costoGanaIngresos}/${total} transiciones el costo de ventas creció más que los ingresos — compresión de margen por falta de poder de fijación de precio.`,
        };
      }
    }
  }

  // ── Conclusión ──
  const fuerzas: FuerzaSenal[] = [resilienciaMargen.fuerza, crecimientoIngresosVsCosto.fuerza];
  const disponibles = fuerzas.filter((f) => f !== "no_disponible");
  let conclusion: PoderFijacionPreciosResult["conclusion"];

  if (disponibles.length === 0) {
    conclusion = "No concluyente";
  } else {
    let suma = 0;
    for (const f of disponibles) suma += f === "positiva" ? 1 : f === "mixta" ? 0 : -1;
    conclusion =
      disponibles.length === 2 && suma >= 1
        ? "Alto"
        : disponibles.length === 2 && suma <= -1
          ? "Bajo"
          : "Moderado";
  }

  return {
    symbol: result.symbol,
    resilienciaMargen,
    crecimientoIngresosVsCosto,
    conclusion,
    advertenciaMetodologica:
      "Proxies financieros indirectos: el poder de fijación de precios real depende de estructura competitiva y contratos que estos datos no capturan directamente.",
  };
}
