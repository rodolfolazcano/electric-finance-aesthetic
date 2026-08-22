import type { FundamentalAFResult } from "./fundamental-af.functions";

export interface MotivoExclusion {
  tipo: "contradiccion_mercado" | "datos_incompletos" | "deterioro_operativo" | "valuacion_exigente" | "apalancamiento_excesivo" | "riesgo_insolvencia_amat" | "upside_sobreestimado" | "crecimiento_insostenible" | "roe_extremo";
  descripcion: string;
  detalles: string[];
}

export interface ExclusionResult {
  ticker: string;
  excluido: boolean;
  motivos: MotivoExclusion[];
  scoreAjustado: number | null;
  advertencias: string[];
}

const UMBRAL_SCORE_MINIMO = 40;
const UMBRAL_COBERTURA_MINIMA = 6;
const SCORE_PENALIZACION: Record<MotivoExclusion["tipo"], number> = {
  contradiccion_mercado: 20,
  datos_incompletos: 25,
  deterioro_operativo: 18,
  valuacion_exigente: 15,
  apalancamiento_excesivo: 12,
  riesgo_insolvencia_amat: 100,
  upside_sobreestimado: 15,
  crecimiento_insostenible: 15,
  roe_extremo: 8,
};

export function analizarExclusion(result: FundamentalAFResult, waccOverride?: number | null): ExclusionResult {
  const motivos: MotivoExclusion[] = [];
  const advertencias: string[] = [];

  // ── 0. Riesgo de insolvencia (Amat, Cap. 10 y 18) ──
  // Si Endeudamiento Ratio > 0.6 y ROA < WACC → exclusión automática
  const liabilities = result.totalLiabilities;
  const equity = result.totalStockholderEquity;
  const ebit = result.ebit;
  const assets = result.totalAssets;
  const interestCov = result.interestCoverageRatio;

  if (liabilities != null && equity != null && (liabilities + equity) > 0 && ebit != null && assets != null && assets > 0) {
    const endeudamientoRatio = liabilities / (liabilities + equity);
    const roa = ebit / assets;

    if (endeudamientoRatio > 0.6) {
      const waccFinal = waccOverride ?? (interestCov != null && interestCov < 1.5 ? 999 : null);
      const waccConocido = waccFinal != null && waccFinal < 100;
      const roaInsuficiente = waccConocido ? roa < waccFinal / 100 : interestCov != null && interestCov < 1.5;
      if (roaInsuficiente) {
        motivos.push({
          tipo: "riesgo_insolvencia_amat",
          descripcion: `Endeudamiento del ${(endeudamientoRatio * 100).toFixed(1)}% (>60%) y Rentabilidad del Activo (ROA=${(roa * 100).toFixed(2)}%) ` +
            (waccConocido
              ? `menor al WACC (${waccFinal.toFixed(2)}%) — la deuda destruye valor según el criterio de Amat.`
              : `con cobertura de intereses de ${interestCov!.toFixed(2)}x (<1.5x) — riesgo inminente de insolvencia.`),
          detalles: [
            `Endeudamiento: ${(endeudamientoRatio * 100).toFixed(1)}%`,
            `ROA: ${(roa * 100).toFixed(2)}%`,
            waccConocido ? `WACC: ${waccFinal.toFixed(2)}%` : `Cobertura intereses: ${interestCov!.toFixed(2)}x`,
          ],
        });
      }
    }
  }

  // ── 1. Contradicción de mercado ──
  if (result.upsidePct != null && result.upsidePct < 0 && result.recommendationMean != null && result.recommendationMean <= 2.5) {
    motivos.push({
      tipo: "contradiccion_mercado",
      descripcion: `Upside negativo (${result.upsidePct.toFixed(1)}%) contrasta con recomendación "${result.recommendationMean < 1.5 ? 'Compra fuerte' : 'Compra'}" (${result.recommendationMean.toFixed(1)}). El precio actual ya superó el precio objetivo promedio — los targets pueden estar desactualizados.`,
      detalles: [`Upside: ${result.upsidePct.toFixed(1)}%`, `Recomendación: ${result.recommendationMean.toFixed(1)}`, `Precio objetivo: USD ${result.targetMeanPrice?.toFixed(2) ?? "N/A"}`].filter(Boolean),
    });
  }

  // ── 2. Upside sobreestimado (target viejo vs recomendación cautelosa) ──
  if (result.upsidePct != null && result.upsidePct > 25 && result.recommendationMean != null && result.recommendationMean >= 2.5) {
    motivos.push({
      tipo: "upside_sobreestimado",
      descripcion: `Upside de ${result.upsidePct.toFixed(0)}% con recomendación de "Mantener"/"Hold" (${result.recommendationMean.toFixed(1)}). Discrepancia entre el precio objetivo y el sentimiento real del consenso — posible target desactualizado.`,
      detalles: [`Upside: ${result.upsidePct.toFixed(1)}%`, `Recomendación: ${result.recommendationMean.toFixed(1)}`, `Precio objetivo: USD ${result.targetMeanPrice?.toFixed(2) ?? "N/A"}`],
    });
  }

  // ── 3. Crecimiento insostenible (crecimiento extremo + upside bajo o negativo) ──
  if (result.revenueGrowth != null && result.revenueGrowth > 0.50 && result.upsidePct != null && result.upsidePct < 10) {
    const det = [`Crecimiento ingresos: ${(result.revenueGrowth * 100).toFixed(1)}%`, `Upside: ${result.upsidePct.toFixed(1)}%`];
    if (result.pePercentile != null && result.pePercentile > 70) det.push(`P/E en percentil ${result.pePercentile} — históricamente caro`);
    motivos.push({
      tipo: "crecimiento_insostenible",
      descripcion: `Crecimiento de ingresos de ${(result.revenueGrowth * 100).toFixed(1)}% pero el mercado solo descuenta ${result.upsidePct.toFixed(1)}% de upside — posiblemente el crecimiento ya está descontado o se espera desaceleración.`,
      detalles: det,
    });
  }

  // ── 4. Datos incompletos + métricas negativas ──
  const cobertura = result.metricsAvailable;
  const scoreBajo = (result.fundScore ?? 0) < UMBRAL_SCORE_MINIMO;
  const datosInsuficientes = cobertura < UMBRAL_COBERTURA_MINIMA;

  if (scoreBajo || datosInsuficientes) {
    const problemas: string[] = [];
    if (result.trailingPE == null) problemas.push("Sin P/E Trailing histórico");
    if (result.revenueGrowth == null) problemas.push("Sin crecimiento de ingresos");
    if (result.returnOnEquity != null && result.returnOnEquity < 0) problemas.push(`ROE negativo (${(result.returnOnEquity * 100).toFixed(1)}%)`);
    if (result.profitMargin != null && result.profitMargin < 0) problemas.push(`Margen neto negativo (${(result.profitMargin * 100).toFixed(1)}%)`);
    if (result.freeCashflowM != null && result.freeCashflowM < 0) problemas.push("FCF negativo");

    if (problemas.length > 0) {
      motivos.push({
        tipo: "datos_incompletos",
        descripcion: `Score ${result.fundScore}/100, cobertura ${cobertura}/8. Datos insuficientes o métricas críticas negativas.`,
        detalles: problemas,
      });
    }
  }

  // ── 5. Valuación exigente ──
  if (result.trailingPE != null && result.trailingPE > 35 && result.upsidePct != null && result.upsidePct < 5) {
    motivos.push({
      tipo: "valuacion_exigente",
      descripcion: `Múltiplos exigentes: P/E de ${result.trailingPE.toFixed(1)}x${result.evToEbitda != null ? `, EV/EBITDA de ${result.evToEbitda.toFixed(1)}x` : ""}, sin upside (${result.upsidePct.toFixed(1)}%).`,
      detalles: [`P/E: ${result.trailingPE.toFixed(1)}x`, `Upside: ${result.upsidePct.toFixed(1)}%`].filter(Boolean),
    });
  }

  // ── 6. Deterioro operativo ──
  if (result.revenueGrowth != null && result.revenueGrowth < -0.03 && result.earningsGrowth != null && result.earningsGrowth < -0.03) {
    const d = [`Crec. ingresos: ${(result.revenueGrowth * 100).toFixed(1)}%`, `Crec. ganancias: ${(result.earningsGrowth * 100).toFixed(1)}%`];
    if (result.debtToEquityRaw != null && result.debtToEquityRaw > 150) {
      motivos.push({ tipo: "apalancamiento_excesivo", descripcion: `Crecimiento negativo en ingresos y ganancias, con D/E de ${(result.debtToEquityRaw).toFixed(1)}%.`, detalles: [...d, `D/E: ${(result.debtToEquityRaw).toFixed(1)}%`] });
    } else {
      motivos.push({ tipo: "deterioro_operativo", descripcion: `Crecimiento negativo en ingresos (${(result.revenueGrowth * 100).toFixed(1)}%) y ganancias (${(result.earningsGrowth * 100).toFixed(1)}%).`, detalles: d });
    }
  }

  // ── 7. Apalancamiento excesivo sin crecimiento ──
  if (result.debtToEquityRaw != null && result.debtToEquityRaw > 150 && !motivos.some(m => m.tipo === "apalancamiento_excesivo") && (result.revenueGrowth == null || result.revenueGrowth < 0.05)) {
    motivos.push({ tipo: "apalancamiento_excesivo", descripcion: `D/E de ${(result.debtToEquityRaw).toFixed(1)}% sin crecimiento compensatorio.`, detalles: [`D/E: ${(result.debtToEquityRaw).toFixed(1)}%`] });
  }

  // ── 8. ROE extremo sin apalancamiento → posibles distorsiones contables ──
  if (result.returnOnEquity != null && result.returnOnEquity > 1.0 && (result.debtToEquityRaw == null || result.debtToEquityRaw < 50)) {
    advertencias.push(`ROE de ${(result.returnOnEquity * 100).toFixed(1)}% con D/E bajo (${(result.debtToEquityRaw ?? 0).toFixed(1)}%) — verificar si hay recompras masivas de acciones o patrimonio neto reducido que distorsionan el ratio.`);
  }

  // ── 9. Advertencia: Crecimiento de ganancias extremo sin base ──
  if (result.earningsGrowth != null && result.earningsGrowth > 2.0 && result.trailingPE == null) {
    advertencias.push(`Crecimiento de ganancias de ${(result.earningsGrowth * 100).toFixed(1)}% sin P/E Trailing disponible — posible base de comparación distorsionada (año anterior con pérdidas).`);
  }

  // ── 10. Advertencia: Upside alto con fundamentales débiles ──
  if (result.upsidePct != null && result.upsidePct > 30 && (result.fundScore ?? 0) < 50) {
    advertencias.push(`Upside elevado (${result.upsidePct.toFixed(1)}%) con score fundamental bajo (${result.fundScore}/100) — verificar si los targets de analistas están actualizados.`);
  }

  // ── Score ajustado ──
  let scoreAjustado = result.fundScore ?? null;
  if (scoreAjustado != null) {
    for (const m of motivos) {
      scoreAjustado -= SCORE_PENALIZACION[m.tipo] ?? 10;
    }
    scoreAjustado = Math.max(0, scoreAjustado);
  }

  const excluido = motivos.length >= 1 || (result.fundScore != null && result.fundScore < UMBRAL_SCORE_MINIMO);

  return { ticker: result.symbol, excluido, motivos, scoreAjustado, advertencias };
}

export function generarReporteExclusiones(results: FundamentalAFResult[]): string {
  const analizados = results.map(r => ({ result: r, analisis: analizarExclusion(r) }));
  const excluidos = analizados.filter(a => a.analisis.excluido && a.analisis.motivos.length > 0);
  const admitidosConAdvertencias = analizados.filter(a => !a.analisis.excluido && a.analisis.advertencias.length > 0);

  let reporte = "";

  if (excluidos.length > 0) {
    reporte += "## 1. Filtro de Exclusión: Activos Descartados\n\n";
    for (const { result: r, analisis: a } of excluidos.sort((a, b) => (b.analisis.scoreAjustado ?? 0) - (a.analisis.scoreAjustado ?? 0))) {
      const nombre = r.companyName ?? r.symbol;
      const mp = a.motivos[0];
      const sub = a.motivos.slice(1);

      reporte += `### ${r.symbol} (${nombre}): `;
      if (mp) {
        if (mp.tipo === "contradiccion_mercado") reporte += `Descartada por contradicción mercado (Score ${r.fundScore ?? "N/D"}/100)`;
        else if (mp.tipo === "datos_incompletos") reporte += `Descartada por datos insuficientes`;
        else if (mp.tipo === "upside_sobreestimado") reporte += `Descartada por upside sobreestimado vs consenso real`;
        else if (mp.tipo === "crecimiento_insostenible") reporte += `Descartada por crecimiento insostenible`;
        else if (mp.tipo === "valuacion_exigente") reporte += `Descartada por valuación exigente`;
        else if (mp.tipo === "riesgo_insolvencia_amat") reporte += `Excluida por riesgo de insolvencia inminente (Amat)`;
        else if (mp.tipo === "deterioro_operativo" || mp.tipo === "apalancamiento_excesivo") reporte += `Relegada por deterioro operativo`;
        else reporte += `Descartada`;
        reporte += "\n\n" + mp.descripcion + "\n\n";
        for (const s of sub) reporte += `- ${s.descripcion}\n`;
        reporte += "\n";
      }
      if (a.advertencias.length > 0) {
        for (const adv of a.advertencias) reporte += `⚠ ${adv}\n`;
        reporte += "\n";
      }
    }
  }

  if (admitidosConAdvertencias.length > 0) {
    reporte += `\n## 2. Activos Admitidos con Advertencias\n\n`;
    for (const { result: r, analisis: a } of admitidosConAdvertencias) {
      for (const adv of a.advertencias) reporte += `- **${r.symbol}**: ⚠ ${adv}\n`;
    }
    reporte += "\n";
  }

  reporte += `\n**Resumen:** ${excluidos.length} excluidos, ${analizados.length - excluidos.length} admitidos.`;
  return reporte;
}
