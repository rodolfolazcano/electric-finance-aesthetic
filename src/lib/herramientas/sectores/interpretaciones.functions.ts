// ─── Types ─────────────────────────────────────────────────────────

export interface Interpretacion {
  resumen: string;
  contexto: string;
  tono: "positivo" | "neutral" | "negativo" | "sin-dato";
  confiabilidad: "alta" | "media" | "baja";
}

// ─── Helpers ────────────────────────────────────────────────────────

function zonaDesdePercentil(pct: number | null): {
  zona: string;
  tono: "positivo" | "neutral" | "negativo";
} {
  if (pct == null) return { zona: "sin comparación histórica", tono: "neutral" };
  if (pct >= 75)
    return { zona: "en la parte más cara de su propio rango histórico", tono: "negativo" };
  if (pct >= 60) return { zona: "en la zona media-alta de su rango histórico", tono: "negativo" };
  if (pct <= 25)
    return { zona: "en la parte más barata de su propio rango histórico", tono: "positivo" };
  if (pct <= 40) return { zona: "en la zona media-baja de su rango histórico", tono: "positivo" };
  return { zona: "en un nivel intermedio dentro de su propio rango histórico", tono: "neutral" };
}

// ─── Interpretación de P/E ─────────────────────────────────────────

export function interpretarPE(
  peActual: number | null,
  percentilHistorico: number | null,
  metodologia: string,
  nombreActivo: string,
): Interpretacion {
  if (peActual == null) {
    return {
      resumen:
        "Esta empresa no tiene ganancias positivas en este momento, por eso no se puede calcular P/E.",
      contexto:
        "El P/E mide cuántas veces las ganancias anuales paga el mercado por la acción. Sin ganancias, el indicador no aplica.",
      tono: "sin-dato",
      confiabilidad: "alta",
    };
  }
  if (percentilHistorico == null) {
    return {
      resumen: `${nombreActivo} cotiza a ${peActual.toFixed(1)} veces sus ganancias anuales.`,
      contexto:
        "No hay suficiente historial de precios de este activo para saber si este nivel es alto o bajo para él en particular.",
      tono: "neutral",
      confiabilidad: "baja",
    };
  }
  const { zona, tono } = zonaDesdePercentil(percentilHistorico);
  const direccion = peActual <= 0 ? " (ganancias negativas o nulas)" : "";
  return {
    resumen: `${nombreActivo} está ${zona} de los últimos datos disponibles.${direccion}`,
    contexto: `Hoy cotiza a ${peActual.toFixed(1)} veces ganancias — un nivel más alto que en el ${percentilHistorico}% del período analizado. Un P/E más bajo respecto a su propio historial suele indicar que el mercado valora la acción más barata de lo habitual.`,
    tono,
    confiabilidad: metodologia === "aproximada-eps-constante" ? "media" : "alta",
  };
}

// ─── Interpretación de P/B (Price to Book) ──────────────────────────

export function interpretarPB(
  pbActual: number | null,
  percentilHistorico: number | null,
  nombreActivo: string,
): Interpretacion {
  if (pbActual == null) {
    return {
      resumen:
        "No hay información disponible sobre el valor contable de esta empresa (Book Value).",
      contexto:
        "El P/B compara el precio de la acción con el valor contable de la empresa (activos menos deudas). Sin este dato, no se puede evaluar.",
      tono: "sin-dato",
      confiabilidad: "alta",
    };
  }
  if (percentilHistorico == null) {
    return {
      resumen: `${nombreActivo} cotiza a ${pbActual.toFixed(2)} veces su valor contable.`,
      contexto:
        "No hay suficiente historial para saber si este precio sobre valor libro es alto o bajo comparado con su propio pasado.",
      tono: "neutral",
      confiabilidad: "baja",
    };
  }
  const { zona, tono } = zonaDesdePercentil(percentilHistorico);
  return {
    resumen: `${nombreActivo} está ${zona}.`,
    contexto: `Hoy el mercado paga ${pbActual.toFixed(2)} veces el valor contable de la empresa — una relación mayor que en el ${percentilHistorico}% del tiempo analizado. Un P/B bajo respecto a su historia sugiere que el mercado podría estar descontando la acción por debajo de su valor intrínseco histórico.`,
    tono,
    confiabilidad: "media",
  };
}

// ─── Interpretación de ROE ──────────────────────────────────────────

export function interpretarROE(roe: number | null, nombreActivo: string): Interpretacion {
  if (roe == null) {
    return {
      resumen:
        "No hay datos suficientes para calcular la rentabilidad sobre patrimonio de esta empresa.",
      contexto: "",
      tono: "sin-dato",
      confiabilidad: "alta",
    };
  }
  const roePct = (roe * 100).toFixed(1);
  let resumen: string;
  let contexto: string;
  if (roe > 0.2) {
    resumen = `${nombreActivo} genera ${roePct}% de ganancia anual sobre el capital de sus accionistas — un nivel sólido.`;
    contexto =
      "Comparado con el promedio del mercado, un ROE superior al 20% suele indicar que la empresa usa eficientemente el capital de sus dueños para generar ganancias.";
  } else if (roe > 0.12) {
    resumen = `${nombreActivo} genera ${roePct}% de ganancia anual sobre el capital invertido — un nivel saludable.`;
    contexto =
      "Un ROE entre 12% y 20% está dentro de lo considerado bueno para empresas establecidas.";
  } else if (roe > 0.05) {
    resumen = `${nombreActivo} genera ${roePct}% anual sobre el capital — por debajo del promedio deseable.`;
    contexto =
      "Comparado con empresas del mismo perfil, este ROE sugiere que la rentabilidad sobre el capital es modesta.";
  } else if (roe > 0) {
    resumen = `${nombreActivo} genera ${roePct}% anual sobre el capital — por debajo de lo esperable para la mayoría de las empresas rentables.`;
    contexto =
      "Un ROE positivo pero bajo puede indicar que la empresa retiene mucho capital sin generar retornos proporcionales.";
  } else {
    resumen = `${nombreActivo} tiene rentabilidad negativa sobre el capital: pierde ${Math.abs(roe * 100).toFixed(1)}% anual del patrimonio de sus accionistas.`;
    contexto =
      "Esto significa que la empresa destruye valor: las ganancias no alcanzan para cubrir el costo del capital que los accionistas pusieron.";
  }
  return {
    resumen,
    contexto,
    tono: roe > 0.12 ? "positivo" : roe > 0.05 ? "neutral" : roe > 0 ? "negativo" : "negativo",
    confiabilidad: "alta",
  };
}

// ─── Interpretación de FCF Yield ────────────────────────────────────

export function interpretarFCFYield(fcfYield: number | null, nombreActivo: string): Interpretacion {
  if (fcfYield == null) {
    return {
      resumen: "No hay datos de flujo de caja libre para evaluar esta acción.",
      contexto:
        "El FCF Yield mide qué porcentaje del precio de la acción la empresa genera en efectivo libre cada año. Sin este dato, no se puede evaluar su capacidad de generar efectivo real.",
      tono: "sin-dato",
      confiabilidad: "alta",
    };
  }
  const fcfPct = (fcfYield * 100).toFixed(1);
  let resumen: string;
  if (fcfYield > 0.06) {
    resumen = `${nombreActivo} genera ${fcfPct}% de su valor en efectivo libre cada año — una generación de caja sólida.`;
  } else if (fcfYield > 0.03) {
    resumen = `${nombreActivo} genera ${fcfPct}% de su valor en efectivo libre anualmente — un nivel aceptable.`;
  } else if (fcfYield > 0) {
    resumen = `${nombreActivo} genera ${fcfPct}% de su valor en efectivo libre — por debajo del promedio del mercado.`;
  } else {
    resumen = `${nombreActivo} no genera efectivo libre positivo actualmente (consume más caja de la que produce).`;
  }
  return {
    resumen,
    contexto:
      "El FCF Yield se interpreta parecido a un rendimiento: un número más alto significa que la empresa produce más efectivo en relación a lo que cuesta. Es señal de salud financiera cuando es positivo y sostenido.",
    tono:
      fcfYield > 0.06
        ? "positivo"
        : fcfYield > 0.03
          ? "neutral"
          : fcfYield > 0
            ? "negativo"
            : "negativo",
    confiabilidad: "alta",
  };
}

// ─── Interpretación de Deuda / Patrimonio ───────────────────────────

export function interpretarDE(deudaEquity: number | null, nombreActivo: string): Interpretacion {
  if (deudaEquity == null) {
    return {
      resumen: "No hay información sobre el nivel de deuda de esta empresa.",
      contexto: "",
      tono: "sin-dato",
      confiabilidad: "alta",
    };
  }
  const ratio = (deudaEquity / 100).toFixed(1);
  let resumen: string;
  let tono: "positivo" | "neutral" | "negativo";
  if (deudaEquity < 50) {
    resumen = `${nombreActivo} tiene una deuda baja comparada con su patrimonio (${ratio}x).`;
    tono = "positivo";
  } else if (deudaEquity < 100) {
    resumen = `${nombreActivo} tiene un nivel de deuda moderado en relación a su patrimonio (${ratio}x).`;
    tono = "neutral";
  } else if (deudaEquity < 200) {
    resumen = `${nombreActivo} tiene una deuda elevada: ${ratio} veces su patrimonio.`;
    tono = "negativo";
  } else {
    resumen = `${nombreActivo} tiene una deuda muy elevada: más de ${ratio} veces su patrimonio — lo que implica mayor riesgo financiero.`;
    tono = "negativo";
  }
  return {
    resumen,
    contexto:
      "La relación deuda/patrimonio compara lo que la empresa debe (deuda total) con lo que los accionistas han puesto (patrimonio neto). Una cifra más baja implica menor apalancamiento y menos riesgo de insolvencia.",
    tono,
    confiabilidad: "alta",
  };
}

// ─── Interpretación de Upside de analistas ─────────────────────────

export function interpretarUpside(upsidePct: number | null, nombreActivo: string): Interpretacion {
  if (upsidePct == null) {
    return {
      resumen: "No hay precio objetivo de analistas disponible para esta acción.",
      contexto: "",
      tono: "sin-dato",
      confiabilidad: "alta",
    };
  }
  const signo = upsidePct >= 0 ? "por encima" : "por debajo";
  const absoluto = Math.abs(upsidePct).toFixed(1);
  return {
    resumen: `El precio promedio que los analistas proyectan para ${nombreActivo} está ${signo} del valor actual en un ${absoluto}%.`,
    contexto:
      "Esto es el consenso de los analistas que cubren la acción. No es una garantía de precio futuro — es una estimación basada en modelos propios de cada analista. Cuantos más analistas, más representativo suele ser el promedio.",
    tono: upsidePct > 15 ? "positivo" : upsidePct > 0 ? "neutral" : "negativo",
    confiabilidad: "media",
  };
}

// ─── Interpretación de Beta ─────────────────────────────────────────

export function interpretarBeta(
  beta: number | null,
  benchmark: string | null,
  nombreActivo: string,
): Interpretacion {
  if (beta == null) {
    return {
      resumen:
        "No hay suficiente historial de precios para medir la volatilidad de esta acción contra el mercado.",
      contexto: "",
      tono: "sin-dato",
      confiabilidad: "alta",
    };
  }
  let resumen: string;
  const ref = benchmark ?? "el índice de referencia";
  if (beta > 1.3) {
    resumen = `${nombreActivo} suele moverse con más fuerza que ${ref}: cuando el mercado sube o baja 1%, esta acción tiende a moverse cerca de ${beta.toFixed(1)}%.`;
  } else if (beta < 0.7) {
    resumen = `${nombreActivo} suele moverse con menos fuerza que ${ref}: cuando el mercado sube o baja 1%, esta acción tiende a moverse cerca de ${beta.toFixed(1)}%.`;
  } else {
    resumen = `${nombreActivo} tiende a moverse de forma parecida a ${ref}.`;
  }
  return {
    resumen,
    contexto:
      "Beta mide la sensibilidad histórica de la acción frente al mercado. Una beta mayor a 1 implica más volatilidad (más riesgo pero también más potencial de retorno). Una beta menor a 1 implica menor volatilidad. No es buena ni mala per se — depende del perfil de cada inversor.",
    tono: "neutral",
    confiabilidad: "alta",
  };
}

// ─── Interpretación del Score Fundamental ─────────────────────────--

export function interpretarScore(
  score: number | null,
  maxScore: number,
  nombreActivo: string,
): Interpretacion {
  if (score == null) {
    return {
      resumen: `${nombreActivo} no tiene suficientes datos fundamentales para calcular un score compuesto.`,
      contexto: "",
      tono: "sin-dato",
      confiabilidad: "alta",
    };
  }
  const pct = Math.round((score / maxScore) * 100);
  let resumen: string;
  let tono: "positivo" | "neutral" | "negativo";
  if (pct >= 70) {
    resumen = `${nombreActivo} obtiene un score fundamental de ${score}/${maxScore} — niveles sólidos en las métricas clave.`;
    tono = "positivo";
  } else if (pct >= 45) {
    resumen = `${nombreActivo} obtiene un score fundamental de ${score}/${maxScore} — niveles mixtos.`;
    tono = "neutral";
  } else {
    resumen = `${nombreActivo} obtiene un score fundamental de ${score}/${maxScore} — por debajo de lo deseable en varias métricas.`;
    tono = "negativo";
  }
  return {
    resumen,
    contexto:
      "El score combina ROE, crecimiento de ingresos, margen neto, FCF Yield, upside de analistas y crecimiento de ganancias. Cada métrica se puntúa y se pondera para dar un resultado de 0 a 100. Un score alto sugiere métricas fundamentalmente sólidas en conjunto.",
    tono,
    confiabilidad: "alta",
  };
}

// ─── Texto de disclaimer obligatorio ────────────────────────────────

export const DISCLAIMER_INTERPRETACION =
  "Interpretación automática basada en datos históricos del propio activo. No constituye recomendación de inversión ni sugerencia de compra o venta.";
