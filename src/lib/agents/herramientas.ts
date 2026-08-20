/**
 * Definición de herramientas del asistente IA (esquema OpenAI function).
 * Compartido por todos los agentes del sistema multi-agente.
 */

export type ToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
      additionalProperties?: boolean;
    };
  };
};

export const TOOLS: ToolSpec[] = [
  {
    type: "function",
    function: {
      name: "buscar_web",
      description:
        "Busca información actual en la web y devuelve resultados reales con el texto extraído de las páginas. Usar para cotizaciones, noticias, normativa vigente, sitios oficiales y verificación de entidades.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Consulta de búsqueda en español." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_mercado",
      description:
        "Consulta cotizaciones y datos de mercado actuales del mercado argentino desde fuentes públicas y APIs oficiales: CriptoYa, ArgentinaDatos, BCRA (Estadísticas Cambiarias y Estadísticas v4 con token) y, como fallback para lo que no está en las APIs, la web (panel de cauciones de PPI/BYMA). Incluye: dólar (oficial, blue, MEP, CCL, mayorista, tarjeta, ahorro), riesgo país, UVA, inflación, letras del Tesoro (LECAP/BONCAP), tasas de plazo fijo, rendimiento de fondos comunes de inversión, cotización de otras monedas (euro, real, libra), tasas oficiales del BCRA (BADLAR, TM20, depósitos a 30 días, LELIQ, pases a 1 día) y la tasa de caución a 30 días. Usar siempre que se pidan cotizaciones, tasas o valores actuales. NO usar para acciones o bonos puntuales (ej. AL30).",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Palabras clave del dato buscado, en español. Ejemplos: 'dólar blue y MEP', 'riesgo país', 'UVA', 'letras LECAP', 'mejor plazo fijo', 'fondo de money market', 'cotización del euro'.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_noticias",
      description:
        "Busca noticias actuales o de un período pasado (en español) sobre un tema del mercado argentino o empresas, desde fuentes públicas sin API key (RSS de Ámbito, El Cronista, Infobae Economía y Google Noticias). Usar siempre que el usuario pregunte por noticias, novedades o 'qué pasó con X' en un período de tiempo.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Tema de las noticias, en español. Ejemplos: 'dólar', 'bonos argentinos', 'riesgo país', 'inflación', 'MercadoLibre', 'obligaciones negociables', 'CEDEARs'. Si no hay tema puntual, usá 'mercado argentino'.",
          },
          periodo: {
            type: "string",
            description:
              "Período de tiempo en español. Ejemplos: 'hoy', 'ayer', 'última semana', 'último mes', 'último trimestre', 'último año', 'de marzo', 'de marzo 2025', 'de 2025', 'del 1/6 al 15/6', 'del 1 de marzo al 15 de abril'. Dejalo vacío si el usuario no pide un período puntual (trae lo más reciente).",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_base_conocimiento",
      description:
        "Consulta la base de conocimiento interna del sitio web de Cintia Boos y el corpus académico indexado (55 documentos de finanzas y contabilidad: Pascale, Fowler Newton, Dumrauf, Blanchard, Dornbusch, Biondi, etc.). Úsala para preguntas sobre servicios (7 ítems), instrumentos (12 ítems), brokers (3 ítems), preguntas frecuentes (4 ítems), alianzas (2 ítems), o para explicar conceptos, métodos, fórmulas y teoría de finanzas, contabilidad y macroeconomía (valoración, tasas, estados contables, carteras, costo de capital, DCF, etc.). El parámetro query es la pregunta del usuario en español.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Pregunta sobre el sitio web, servicios, instrumentos, brokers, FAQs o alianzas. Ejemplos: 'Qué es el servicio 3', 'Qué son los CEDEARs', 'Cuántos brokers tiene Cintia', 'Qué dice la FAQ sobre el costo', 'Quién es Franco Lamas'.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_dcf",
      description:
        "Calcula el valor intrínseco teórico de una empresa mediante el método de flujo de caja descontado (DCF), a partir de los supuestos que el usuario indique (o los que el asistente proponga como base de trabajo). Es un ejercicio educativo: el resultado depende de los supuestos y NO es recomendación de inversión ni promesa de rentabilidad. Usar cuando el usuario pregunte por valoración de empresas, valor intrínseco, DCF, 'cuánto vale' una acción o comparar alternativas de inversión.",
      parameters: {
        type: "object",
        properties: {
          empresa: {
            type: "string",
            description:
              "Nombre de la empresa o acción que se valora (en español, según la preguntó el usuario). Es obligatorio para poder validar después el resultado contra la cotización real de mercado.",
          },
          flujoCajaLibre: {
            type: "number",
            description:
              "Flujo de caja libre del año base, en la moneda elegida. Ejemplo: 100 para 100 millones de USD (o de pesos).",
          },
          moneda: {
            type: "string",
            description: "Moneda: 'USD' (default) o 'ARS'.",
          },
          crecimiento: {
            type: "number",
            description:
              "Crecimiento anual del flujo de caja durante la proyección explícita, en %. Default 5.",
          },
          anos: {
            type: "number",
            description: "Años de proyección explícita. Default 5.",
          },
          crecimientoTerminal: {
            type: "number",
            description: "Crecimiento perpetuo del valor terminal, en %. Default 2.5.",
          },
          tasaDescuento: {
            type: "number",
            description:
              "Tasa de descuento / WACC, en %. Debe ser mayor al crecimiento terminal. Default 12.",
          },
          deudaNeta: {
            type: "number",
            description:
              "Deuda neta a restar del valor de la empresa, en la misma moneda. Default 0.",
          },
          acciones: {
            type: "number",
            description:
              "Cantidad de acciones en circulación, para estimar el valor por acción. Opcional.",
          },
        },
        required: ["empresa", "flujoCajaLibre"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "valor_intrinseco_real",
      description:
        "Calcula el valor intrínseco REAL de una empresa/acción usando datos en vivo de Yahoo Finance (flujo de caja libre, deuda neta, beta vía CAPM, WACC, crecimiento de analistas), aplicando la metodología del paper académico correspondiente (DCF, empresas emergentes o CAPM) de la base de conocimiento, y busca noticias recientes sobre la empresa para fundamentar el dato y el resultado. Para preguntas tipo 'cuánto vale X', 'valor intrínseco de X', 'analizá el valor de X' o 'DCF de X'. Acepta ticker o nombre (ej. IBM, Microsoft, GGAL.BA). No requiere que el usuario aporte supuestos: los datos se obtienen de la API.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description:
              "Ticker o nombre de la empresa a valorar, en español o con su ticker de mercado (ej. 'IBM', 'Microsoft', 'MSFT', 'GGAL.BA', 'YPF', 'MercadoLibre').",
          },
          tema: {
            type: "string",
            description:
              "Metodología del paper: 'DCF Flujo de Caja Descontado', 'Valuación empresas emergentes' o 'CAPM / beta'. Opcional: se autodetecta desde la pregunta si no se indica.",
          },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_semaforo",
      description:
        "Analiza un activo con un semáforo técnico + fundamental usando datos reales en vivo de Yahoo Finance: indicadores técnicos (RSI14, MACD, SMA20/50/200, soportes y resistencias, anomalía de precio, posición en el rango de 52 semanas) y métricas fundamentales (P/E, crecimiento de ingresos, margen, ROE, upside vs consenso de analistas, deuda/patrimonio). Calcula scores en [-2, 2] con pesos tendencia 40% / momentum 30% / S/R 20% / anomalía 10%, clasifica con umbrales (>1.5 COMPRA, >0.3 COMPRA CON CAUTELA, >-0.3 MANTENER, >-1.5 REDUCIR, VENTA) y valida el resultado con noticias recientes sobre el activo. Para preguntas como 'analizá el semáforo de X', 'análisis técnico de X', 'indicadores técnicos', 'soportes y resistencias de X', 'conviene comprar o vender X', 'RSI/MACD de X'. Acepta ticker o nombre (ej. AAPL, YPF, GGAL.BA, MercadoLibre, Banco Galicia).",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description:
              "Ticker o nombre del activo a analizar, en español o con su ticker de mercado (ej. 'AAPL', 'MSFT', 'YPF', 'GGAL.BA', 'MercadoLibre', 'Banco Galicia').",
          },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_capm",
      description:
        "Calcula el CAPM / beta de un activo contra un benchmark usando datos reales de Yahoo Finance (regresión OLS de retornos diarios): beta, alfa (diario y anualizado), R², correlación, p-valor (significancia), error estándar, exponente de Hurst y beta con p-variance. Si no se indica benchmark, auto-detecta el de mayor R² entre los 140+ factores maestros (sectores US, factors, país, macro, commodities, crypto). Para preguntas como 'cuál es el beta de X', 'beta de SPY vs QQQ', 'riesgo sistemático de X', 'configurá el CAPM de X contra Y', 'compará X contra el MERVAL'. Acepta ticker o nombre (ej. AAPL, GGAL.BA, SPY, QQQ, MSFT).",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker/activo a analizar (ej. 'AAPL', 'QQQ', 'GGAL.BA', 'MSFT', 'SPY').",
          },
          benchmark: {
            type: "string",
            description:
              "Benchmark opcional (ej. 'SPY', '^MERV', 'QQQ', 'XLK', 'EWZ'). Si no se indica, se auto-detecta el de mejor R².",
          },
          autoDetect: {
            type: "boolean",
            description:
              "Si true (default cuando no hay benchmark), busca el mejor benchmark por R².",
          },
          rango: {
            type: "string",
            description:
              "Rango de la serie histórica. Default '2y'. Opciones: 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, max.",
          },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "matriz_capm",
      description:
        "Calcula la matriz de betas, correlaciones y R² entre varios activos (NxN) usando retornos diarios reales de Yahoo Finance. Para preguntas como 'armá la matriz de beta entre X, Y y Z', 'correlaciones de mi cartera', 'cómo se mueven juntos estos activos'. Acepta tickers o nombres (ej. ['AAPL','MSFT','QQQ','GGAL.BA']).",
      parameters: {
        type: "object",
        properties: {
          simbolos: {
            type: "array",
            items: { type: "string" },
            description:
              "Lista de tickers/activos a comparar entre sí (ej. ['AAPL', 'MSFT', 'QQQ'] o ['GGAL.BA', 'YPF', 'SPY']).",
          },
          rango: {
            type: "string",
            description: "Rango de la serie histórica. Default '2y'.",
          },
        },
        required: ["simbolos"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_sectores",
      description:
        "Analiza el sector de un activo: detecta su sector (catálogo unificado o quoteSummary de Yahoo), lo compara contra los ETFs sectoriales de EE.UU. (XLK, XLF, XLV, XLE, XLC, XLY, XLP, XLI, XLB, XLRE, XLU) y devuelve beta, R² y correlación de cada uno ordenados por ajuste, más los peers del mismo sector/industria del catálogo. Para preguntas como 'a qué sector pertenece X', 'cómo se comporta X vs su sector', 'perfil sectorial de X', 'benchmark sectorial de X'. Acepta ticker o nombre.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description:
              "Ticker o nombre del activo (ej. 'AAPL', 'GGAL.BA', 'MercadoLibre', 'TPSA').",
          },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_cobertura",
      description:
        "Calcula el beta del portafolio ponderado por monto en USD y sugiere la cobertura (hedge) contra un benchmark (delta/beta neutral de primer orden): nocional a shortear (o comprar puts) o a comprar según el beta del portafolio. Pide las posiciones y el benchmark opcional. Para preguntas como 'cómo cubro mi cartera', 'hedge de mi portafolio', 'qué beta tiene mi cartera', 'cobertura con SPY/QQQ'. Acepta lista de posición/ticker + valuación en USD.",
      parameters: {
        type: "object",
        properties: {
          posiciones: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ticker: {
                  type: "string",
                  description: "Ticker del activo (ej. 'AAPL', 'GGAL.BA', 'SPY').",
                },
                valorUSD: { type: "number", description: "Valuación de la posición en USD." },
              },
              required: ["ticker", "valorUSD"],
            },
            description:
              "Lista de posiciones con su ticker y valuación en USD (ej. [{ticker:'AAPL',valorUSD:5000},{ticker:'GGAL.BA',valorUSD:3000}]).",
          },
          benchmark: {
            type: "string",
            description: "Benchmark de cobertura opcional (default 'SPY').",
          },
        },
        required: ["posiciones"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_catalogo",
      description:
        "Consulta el catálogo unificado de activos operables (JSON de paneles por sector/industria con ticker, tipo, moneda, mercado y país). Busca por ticker, nombre, sector o industria y devuelve los activos alcanzados, sirviéndose también para resolver el símbolo real de Yahoo Finance. Para preguntas como 'qué activos hay en tecnología', 'paneles de energía', 'cédears de bancos', 'a qué sector pertenece AAPL', 'cuántos ETFs hay'. También útil para conocer el mercado/moneda de un ticker.",
      parameters: {
        type: "object",
        properties: {
          criterio: {
            type: "string",
            description:
              "Término de búsqueda: ticker, nombre, sector o industria en español (ej. 'tecnología', 'energía', 'bancos', 'AAPL', 'semiconductores', 'CEDEAR').",
          },
        },
        required: ["criterio"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "estadisticas_retornos",
      description:
        "Calcula la distribución de los retornos diarios de un activo con series históricas reales de Yahoo Finance (réplica de la clase `distribution` de referencia): retorno medio anualizado (×252), volatilidad anualizada (σ×√252), ratio de Sharpe anual, VaR 95% diario, sesgo (skewness), curtosis en exceso, estadístico de Jarque-Bera, p-valor y si la distribución es normal (p > 0.05). Además valida el resultado con noticias recientes del activo. Para preguntas como 'cómo se distribuyen los retornos de X', 'es normal la distribución de retornos de X', 'VaR de X', 'Sharpe de X', 'cola gruesa', 'skewness y curtosis'. Acepta ticker o nombre.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker o nombre del activo (ej. 'AAPL', 'GGAL.BA', 'SPY', 'MSFT').",
          },
          rango: {
            type: "string",
            description: "Rango de la serie histórica. Default '2y'.",
          },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "optimizar_portafolio",
      description:
        "Optimiza un portafolio con datos reales de Yahoo Finance (réplica de las clases `manager`/`output` y `Hedger` de referencia): matriz de covarianza anualizada (×252), matriz de correlación, estadísticas por activo (retorno anual, vol, Sharpe, VaR95, Jarque-Bera), optimizaciones (equi-weight, volatility-weighted, mínima varianza L1/L2, long-only y Markowitz con target de retorno), frontera eficiente, PCA sobre la covarianza (autovalores, varianza explicada, vector de mínima varianza) y cobertura CAPM contra un benchmark. Valida con noticias recientes del activo principal. Para preguntas como 'optimizá mi portafolio', 'cartera de mínima varianza', 'matriz de covarianza de X, Y, Z', 'frontera eficiente', 'cómo distribuyo entre AAPL y MSFT', 'PCA de mi cartera', 'cuánto ponderar cada activo'. Acepta lista de tickers con montos opcionales.",
      parameters: {
        type: "object",
        properties: {
          activos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ticker: {
                  type: "string",
                  description: "Ticker del activo (ej. 'AAPL', 'GGAL.BA', 'SPY').",
                },
                montoUSD: {
                  type: "number",
                  description: "Monto en USD de la posición (opcional, default 10000 por activo).",
                },
              },
              required: ["ticker"],
            },
            description:
              "Lista de activos del portafolio (ej. [{ticker:'AAPL',montoUSD:5000},{ticker:'GGAL.BA',montoUSD:3000}]).",
          },
          tipo: {
            type: "string",
            description:
              "Tipo de optimización (opcional, si no va calcula todas): 'equi-weight', 'volatility-weighted', 'min-variance-l1', 'min-variance-l2', 'long-only', 'markowitz'.",
          },
          targetReturn: {
            type: "number",
            description:
              "Target de retorno anual (fracción, ej. 0.15) para 'markowitz'. Opcional: default el retorno medio de los activos.",
          },
          benchmark: {
            type: "string",
            description: "Benchmark de cobertura CAPM. Default 'SPY'.",
          },
          rango: {
            type: "string",
            description: "Rango de la serie histórica. Default '2y'.",
          },
        },
        required: ["activos"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_factores",
      description:
        "Calcula las correlaciones, betas y R² de un activo contra los factores maestros del corpus de referencia (más de 140: sectores US, factors de estilo, países, macro, commodities, crypto, real estate y temáticos) con series reales de Yahoo Finance, y devuelve las más altas (positivas y negativas). Para preguntas como 'a qué se correlaciona X', 'qué factores explican a X', 'estilo de X', 'X vs petróleo/oro/tech'. Acepta ticker o nombre.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker o nombre del activo (ej. 'AAPL', 'GGAL.BA', 'MercadoLibre').",
          },
          limite: {
            type: "number",
            description: "Cantidad máxima de factores a devolver. Default 10.",
          },
          rango: {
            type: "string",
            description: "Rango de la serie histórica. Default '1y'.",
          },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_riesgo",
      description:
        "Calcula el riesgo/desvío de un activo con series históricas REALES de Yahoo Finance: desvío estándar diario de retornos (σ), volatilidad anualizada (σ×√252), retorno medio (diario y anualizado), Sharpe, VaR 95% y 99% (histórico), CVaR/Expected Shortfall, máximo drawdown del periodo y beta/R² contra el mejor benchmark entre SPY y MERVAL. Para preguntas como 'calculá el desvío de AAPL', 'cuál es el riesgo/volatilidad de X', 'VaR de mi posición', 'qué tan volátil es X', 'estándar/desviación de X', 'beta de X'. Acepta ticker o nombre (ej. AAPL, GGAL.BA, SPY) y un rango opcional (1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, max; default 2y).",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker o nombre del activo (ej. 'AAPL', 'GGAL.BA', 'SPY', 'MSFT').",
          },
          rango: {
            type: "string",
            description:
              "Rango de la serie histórica. Default '2y'. Opciones: 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, max.",
          },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
];

export type EstadoHerramienta =
  | "searching"
  | "mercado"
  | "noticias"
  | "base_conocimiento"
  | "dcf"
  | "valoracion"
  | "semaforo"
  | "capm"
  | "riesgo"
  | "portafolio";

export function estadoDeHerramienta(name: string): EstadoHerramienta {
  switch (name) {
    case "consultar_mercado":
      return "mercado";
    case "buscar_noticias":
      return "noticias";
    case "consultar_base_conocimiento":
      return "base_conocimiento";
    case "calcular_dcf":
      return "dcf";
    case "valor_intrinseco_real":
      return "valoracion";
    case "analizar_semaforo":
      return "semaforo";
    case "analizar_capm":
    case "matriz_capm":
    case "analizar_factores":
    case "estadisticas_retornos":
      return "capm";
    case "analizar_sectores":
    case "calcular_cobertura":
    case "optimizar_portafolio":
      return "portafolio";
    case "analizar_riesgo":
      return "riesgo";
    default:
      return "searching";
  }
}

export const NOMBRE_HERRAMIENTAS = TOOLS.map((t) => t.function.name);
