// @ts-nocheck
export interface Interpretacion {
  dato: string;
  lectura: string;
  implicancia: string;
  tono: "positivo" | "neutral" | "alerta";
}

export interface InterpretacionSignal {
  label: string;
  tone: "good" | "neutral" | "bad";
  lectura?: string;
  implicancia?: string;
}

type TendenciaDir = "alcista" | "bajista" | "lateral";

function interpretarPrecioSMA50(current: number, sma50: number, tendencia: TendenciaDir): Interpretacion {
  const diff = ((current - sma50) / sma50) * 100;
  const sobre = current > sma50;
  if (sobre) {
    return {
      dato: `Precio $${current.toFixed(2)} sobre SMA50 $${sma50.toFixed(2)} (${diff > 0 ? "+" : ""}${diff.toFixed(1)}%)`,
      lectura: sobre
        ? "El precio está operando por encima de su media de 50 sesiones, lo que indica que el corto plazo es positivo."
        : "El precio está por debajo de su media de 50 sesiones, señal de debilidad en el corto plazo.",
      implicancia:
        tendencia === "alcista"
          ? "La tendencia de corto plazo acompaña a la general. No hay señales de agotamiento."
          : tendencia === "bajista"
            ? "El corto plazo confirma la debilidad. Evitar entradas agresivas."
            : "El precio está por encima de la media pero sin tendencia clara. Esperar confirmación.",
      tono: sobre ? "positivo" : "alerta",
    };
  }
  return {
    dato: `Precio $${current.toFixed(2)} bajo SMA50 $${sma50.toFixed(2)} (${diff.toFixed(1)}%)`,
    lectura: "El precio está por debajo de su media de 50 sesiones, señal de debilidad en el corto plazo.",
    implicancia:
      tendencia === "bajista"
        ? "El precio confirma la debilidad de corto plazo. No es momento de comprar."
        : "La debilidad de corto plazo puede ser una oportunidad si la tendencia general es alcista.",
    tono: "alerta",
  };
}

function interpretarCruceMedias(sma50: number, sma200: number | null, closes: number[]): Interpretacion {
  if (sma200 == null) {
    return {
      dato: `SMA200 no disponible (histórico < 200 barras)`,
      lectura: "No se puede evaluar el cruce de medias sin SMA200.",
      implicancia: "— No disponible",
      tono: "neutral",
    };
  }
  if (sma50 > sma200) {
    const cerca = Math.abs(sma50 - sma200) / sma200 < 0.01;
    return {
      dato: `SMA50 $${sma50.toFixed(2)} > SMA200 $${sma200.toFixed(2)}`,
      lectura: cerca
        ? "Las medias están muy cerca — puede haber un cambio de tendencia pronto."
        : "La media de 50 está por encima de la de 200, confirmando tendencia alcista de mediano plazo.",
      implicancia: "Las medias están alineadas con una tendencia alcista. Se considera una señal positiva.",
      tono: "positivo",
    };
  }
  const cerca = Math.abs(sma50 - sma200) / sma200 < 0.01;
  return {
    dato: `SMA50 $${sma50.toFixed(2)} < SMA200 $${sma200.toFixed(2)}`,
    lectura: cerca
      ? "Las medias están muy cerca — puede haber un cambio de tendencia pronto."
      : "La media de 50 está por debajo de la de 200, confirmando tendencia bajista de mediano plazo.",
    implicancia: "La estructura de medias es bajista. Considerar reducir exposición.",
    tono: "alerta",
  };
}

function interpretarRSI(rsi: number, tendencia: TendenciaDir): Interpretacion {
  const dato = `RSI(14) = ${rsi.toFixed(1)}`;
  if (rsi > 70) {
    return {
      dato,
      lectura: "El RSI indica que el activo está en zona de sobrecompra.",
      implicancia:
        tendencia === "alcista"
          ? "Sobrecompra en tendencia alcista: no necesariamente señal de venta, pero sugiere cautela."
          : "Sobrecompra sin tendencia que lo soporte: posible techo de corto plazo.",
      tono: "alerta",
    };
  }
  if (rsi < 30) {
    return {
      dato,
      lectura: "El RSI indica que el activo está en zona de sobreventa.",
      implicancia:
        tendencia === "alcista"
          ? "Sobreventa en tendencia alcista: posible oportunidad de compra en corrección."
          : "Sobreventa sin tendencia que lo soporte: podría seguir cayendo.",
      tono: tendencia === "alcista" ? "positivo" : "alerta",
    };
  }
  if (rsi >= 45 && rsi <= 55) {
    return {
      dato,
      lectura: "El RSI está en zona neutral, sin presión compradora ni vendedora dominante.",
      implicancia: "No hay un sesgo direccional claro. Esperar antes de tomar una decisión.",
      tono: "neutral",
    };
  }
  return {
    dato,
    lectura: rsi < 45
      ? "El RSI está del lado bajista, aunque sin estar en sobreventa."
      : "El RSI está del lado alcista, aunque sin estar en sobrecompra.",
    implicancia: rsi < 45
      ? "El sesgo es ligeramente bajista. Mantener cautela."
      : "El sesgo es ligeramente alcista. Favorable pero sin exceso.",
    tono: "neutral",
  };
}

function interpretarMACD(macd: number, signal: number): Interpretacion {
  const dato = `MACD ${macd > 0 ? "+" : ""}${macd.toFixed(3)} / señal ${signal.toFixed(3)}`;
  if (macd > signal && macd > 0) {
    return {
      dato,
      lectura: "El MACD está por encima de su señal y en terreno positivo — momentum alcista sólido.",
      implicancia: "La tendencia de corto plazo está siendo impulsada por compradores. Señal favorable.",
      tono: "positivo",
    };
  }
  if (macd > signal && macd <= 0) {
    return {
      dato,
      lectura: "El MACD acaba de cruzar al alza, pero aún está en terreno negativo.",
      implicancia: "Posible cambio de tendencia temprano. Requiere confirmación en los próximos días.",
      tono: "neutral",
    };
  }
  if (macd <= signal && macd > 0) {
    return {
      dato,
      lectura: "El MACD está perdiendo fuerza, aunque aún está en terreno positivo.",
      implicancia: "El impulso alcista se está debilitando. Podría ser el inicio de una corrección.",
      tono: "alerta",
    };
  }
  return {
    dato,
    lectura: "El MACD está por debajo de su señal y en terreno negativo — momentum bajista.",
    implicancia: "Los vendedores están controlando el corto plazo. Evitar compras hasta que mejore.",
    tono: "alerta",
  };
}

function interpretarPE(pe: number | null): Interpretacion | null {
  if (pe == null) return null;
  if (pe < 0) return null;
  const dato = `P/E = ${pe.toFixed(1)}`;
  if (pe < 15) {
    return {
      dato,
      lectura: "El precio está bajo en relación a las ganancias de la empresa.",
      implicancia: "Valoración atractiva según el mercado histórico. Puede ser una oportunidad.",
      tono: "positivo",
    };
  }
  if (pe < 30) {
    return {
      dato,
      lectura: "El precio está en línea con las ganancias de la empresa.",
      implicancia: "Valoración razonable. No está ni cara ni barata en términos históricos.",
      tono: "neutral",
    };
  }
  return {
    dato,
    lectura: "El precio está alto en relación a las ganancias de la empresa.",
    implicancia: "Valoración exigente. Las expectativas de crecimiento ya están descontadas.",
    tono: "alerta",
  };
}

function interpretarRevenueGrowth(growth: number | null): Interpretacion | null {
  if (growth == null) return null;
  const pct = growth * 100;
  const dato = `Revenue growth: ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  if (growth > 0.15) {
    return {
      dato,
      lectura: "La empresa está creciendo sus ingresos a un ritmo fuerte.",
      implicancia: "El crecimiento de ingresos es sólido, lo que suele preceder a ganancias más altas.",
      tono: "positivo",
    };
  }
  if (growth > 0) {
    return {
      dato,
      lectura: "La empresa está creciendo sus ingresos, aunque a un ritmo moderado.",
      implicancia: "Crecimiento positivo pero sin aceleración. Esperar para ver si se mantiene.",
      tono: "neutral",
    };
  }
  return {
    dato,
    lectura: "Los ingresos están cayendo respecto al año anterior.",
    implicancia: "Contracción de ingresos — puede indicar problemas de negocio o mercado.",
    tono: "alerta",
  };
}

function interpretarProfitMargin(margin: number | null): Interpretacion | null {
  if (margin == null) return null;
  const pct = margin * 100;
  const dato = `Margen de ganancia: ${pct.toFixed(1)}%`;
  if (margin > 0.2) {
    return {
      dato,
      lectura: "La empresa convierte más del 20% de sus ingresos en ganancia — márgenes excelentes.",
      implicancia: "Alta eficiencia operativa. La empresa tiene poder de fijación de precios.",
      tono: "positivo",
    };
  }
  if (margin > 0.1) {
    return {
      dato,
      lectura: "Márgenes saludables, dentro de lo esperable para su industria.",
      implicancia: "Rentabilidad adecuada. Sin señales de alerta en eficiencia.",
      tono: "neutral",
    };
  }
  if (margin <= 0) {
    return {
      dato,
      lectura: "La empresa opera con pérdidas — sus costos superan sus ingresos.",
      implicancia: "Márgenes negativos. Esto no es sostenible en el largo plazo sin cambios.",
      tono: "alerta",
    };
  }
  return {
    dato,
    lectura: "Márgenes justos, pero con poco margen de error.",
    implicancia: "Cualquier aumento de costos podría impactar la rentabilidad.",
    tono: "alerta",
  };
}

function interpretarROE(roe: number | null): Interpretacion | null {
  if (roe == null) return null;
  const pct = roe * 100;
  const dato = `ROE = ${pct.toFixed(1)}%`;
  if (roe > 0.15) {
    return {
      dato,
      lectura: "La empresa genera más del 15% de retorno sobre el capital de sus accionistas.",
      implicancia: "Uso eficiente del capital. La empresa crea valor para sus accionistas.",
      tono: "positivo",
    };
  }
  if (roe > 0) {
    return {
      dato,
      lectura: "Retorno positivo pero moderado sobre el capital de los accionistas.",
      implicancia: "Rentabilidad adecuada pero sin excelencia. Puede mejorar.",
      tono: "neutral",
    };
  }
  return {
    dato,
    lectura: "Retorno negativo sobre el capital — la empresa destruye valor.",
    implicancia: "Señal de alerta. La empresa no está generando retorno para sus accionistas.",
    tono: "alerta",
  };
}

export function generarInterpretacionSignal(
  tipo: string,
  valor: number,
  contexto: {
    tendencia: TendenciaDir;
    scoreTotal: number;
    sma50: number;
    sma200: number | null;
    current: number;
    pe: number | null;
    revGrowth: number | null;
    profitMargin: number | null;
    roe: number | null;
    closes: number[];
    macdSignal?: number;
  },
): InterpretacionSignal {
  let interp: Interpretacion | null = null;
  switch (tipo) {
    case "precio-sma50":
      interp = interpretarPrecioSMA50(valor, contexto.sma50, contexto.tendencia);
      break;
    case "cruce-medias":
      interp = interpretarCruceMedias(contexto.sma50, contexto.sma200, contexto.closes);
      break;
    case "rsi":
      interp = interpretarRSI(valor, contexto.tendencia);
      break;
    case "macd":
      interp = interpretarMACD(valor, contexto.macdSignal ?? contexto.sma50);
      break;
    case "pe":
      interp = interpretarPE(contexto.pe);
      break;
    case "rev-growth":
      interp = interpretarRevenueGrowth(contexto.revGrowth);
      break;
    case "profit-margin":
      interp = interpretarProfitMargin(contexto.profitMargin);
      break;
    case "roe":
      interp = interpretarROE(contexto.roe);
      break;
  }

  if (!interp) {
    return { label: `${tipo}: ${valor}`, tone: "neutral" };
  }

  return {
    label: interp.dato,
    tone: interp.tono === "positivo" ? "good" : interp.tono === "alerta" ? "bad" : "neutral",
    lectura: interp.lectura,
    implicancia: interp.implicancia,
  };
}

export function generarInterpretacionCartera(
  scorePonderado: number,
  posicionesDebiles: number,
): string {
  if (posicionesDebiles > 0) {
    return "Varias posiciones de tu cartera muestran fundamentos débiles según los datos disponibles.";
  }
  if (scorePonderado > 70) {
    return "Tu cartera está compuesta mayormente por empresas con fundamentos sólidos.";
  }
  return "Tu cartera tiene fundamentos mixtos — algunas posiciones son más sólidas que otras.";
}

export function generarCierreScore(scoreTotal: number, scoreTec: number, scoreFund: number): string {
  // scoreTotal = techScore (continuo) + fundScore, rango típico -5 a +8
  const recomendacion =
    scoreTotal >= 5
      ? "El score combinado es sólido. Si querés revisar cómo encaja en tu cartera, agendá una consulta."
      : scoreTotal >= 1.5
        ? "Las señales técnicas y fundamentales son moderadamente positivas. Monitorear evolución."
      : scoreTotal >= -0.5
        ? "El mercado no da señales claras en este momento — es un buen momento para revisar tu estrategia general, no necesariamente esta posición puntual."
      : scoreTotal >= -4
        ? "Las señales son mixtas con sesgo negativo. Antes de tomar una decisión, revisá tu exposición actual con un asesor."
      : "Las señales técnicas y fundamentales son desfavorables. Evaluar cobertura o reducción de posición.";
  return recomendacion;
}
