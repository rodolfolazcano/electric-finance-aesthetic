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
        "Consulta la base de conocimiento interna del sitio web de Cintia Boos y el corpus académico indexado (55 documentos de finanzas y contabilidad: Pascale, Fowler Newton, Dumrauf, Blanchard, Dornbusch, Biondi, etc.). Úsala para preguntas sobre servicios (7 ítems), instrumentos (12 ítems), brokers (3 ítems), preguntas frecuentes (4 ítems), alianzas (2 ítems), sistema financiero argentino y su regulación (BCRA, Ley 21.526, CAMELBIG, efectivo mínimo, capitales mínimos/RPC, NIIF 9, SEDESA/seguro de depósitos, política monetaria, BADLAR, ETTI, mercado interbancario), sistema financiero europeo y español (ESI/EAF, MiFID II, mercados regulados y SMN, grupo BME, FGD y FOGAIN, BCE y política monetaria, TLTRO/QE, TARGET2, EONIA/EURIBOR/€STR), matemática financiera y rentabilidad (valor temporal del dinero, capitalización simple/compuesta/continua, descuento comercial/racional/compuesto, tasas spot y forward, curvas de tasas, tasa nominal vs real, TAE/CFT, TIR/VAN, TRE), calculadora financiera (HP 12C/Casio: rentas, VAN/TIR con flujos de caja, bonos, estadística descriptiva), asesoramiento y planificación financiera (banca personal y privada, perfiles de riesgo conservador/moderado/arriesgado, tríada rentabilidad-seguridad-liquidez, proceso de planificación en 5 fases, diseño, reajuste y reequilibrio de carteras, EAFI, idoneidad CNV), ética y conducta profesional del asesor (códigos de ética IEAF e IAEF, interés del cliente primero, conflictos de interés, prohibición de asegurar rendimientos), seguros según la Ley 17.418 (riesgo asegurable, contrato y póliza, prima, siniestro y reticencia, sobreseguro/infraseguro, seguros de daños patrimoniales y de personas, tipos de seguro de vida), administración de riesgos (identificación, evaluación con mapa de riesgos, prevención, transferencia al mercado de seguros), o para explicar conceptos, métodos, fórmulas y teoría de finanzas, contabilidad y macroeconomía (valoración, tasas, estados contables, carteras, costo de capital, DCF, etc.). El parámetro query es la pregunta del usuario en español.",
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
  {
    type: "function",
    function: {
      name: "analizar_fundamental",
      description:
        "Analiza el fundamental de un activo con datos reales en vivo (estados contables anuales de Yahoo Finance) replicando la metodología de la app Clarity: (a) análisis CUALITATIVO con 6 dimensiones (modelo de negocio 20%, management 25%, ventaja competitiva 30%, gobierno corporativo 15%, Porter 10% y círculo de competencia) con score 0-10 ponderado y gate: si < 5.0 el análisis cuantitativo queda BLOQUEADO; (b) análisis CUANTITATIVO con 15 métricas (M1 ingresos, M2 EBITDA, M3 resultado neto, M4 EPS, M5 margen EBITDA, M6 margen neto, M7 activo, M8 pasivo, M9 patrimonio, M10 deuda financiera neta, M11 capital de trabajo, M12 ROE, M13 ROA, M14 Deuda/EBITDA, M15 P/E, más EV/EBITDA) y alertas de riesgo (rojas y amarillas). Para preguntas como 'analizá el fundamental de X', 'ratios financieros de X', 'métricas M1-M15', 'qué salud financiera tiene X', 'ROE, ROA, deuda de X'. Acepta ticker o nombre.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description:
              "Ticker o nombre del activo (ej. 'AAPL', 'MSFT', 'YPF', 'GGAL.BA', 'MercadoLibre').",
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
      name: "calcular_wacc",
      description:
        "Calcula el WACC de un activo con datos reales en vivo (metodología CAPM de la app Clarity): tasa libre de riesgo UST 10Y (^TNX en vivo), beta por regresión logarítmica 1 año contra el benchmark correspondiente (^MERV para tickers .BA, SPY para el resto), prima de riesgo de mercado (6% ARG / 5.5% US), riesgo país vía ArgentinaDatos, size premium por capitalización (<USD 300M), costo de deuda (interés/deuda, mín 3%), tasa impositiva (35% ARG / 25% US), pesos de capital y deuda y WACC USD. Para tickers .BA además calibra a ARS con Fisher usando la inflación del BCRA (devaluación esperada y WACC nominal ARS). Para preguntas como 'cuál es el WACC de X', 'costo de capital de X', 'cuánto es el Ke y Kd de X'. Acepta ticker o nombre.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker o nombre del activo (ej. 'AAPL', 'MSFT', 'GGAL.BA', 'YPF').",
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
      name: "valor_por_metodos",
      description:
        "Valora un activo con TRES métodos con datos reales en vivo (Yahoo Finance) y triangula la decisión, replicando la metodología de la app Clarity: (1) DCF por proyección de márgenes (FCFF 5 años con CAGR de ingresos, valor terminal Gordon, WACC real calculado, deuda neta y caja); (2) Múltiplos (EV/EBITDA, P/E, P/BV, EV/Revenue) comparados contra medianas del sector; (3) Valor libro ajustado + APV (VAN unlevered + PV escudo fiscal). Luego combina los 3 con pesos según el perfil (crecimiento / madura / distress) y devuelve valor ponderado, rango y decisión (COMPRAR, MANTENER/ACUMULAR, MANTENER, REDUCIR o VENDER) por margen de seguridad. Para preguntas como 'valorame X por los tres métodos', 'cuánto vale X según DCF, múltiplos y valor libro', 'triangulación de valor de X'. Acepta ticker o nombre.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description:
              "Ticker o nombre del activo a valorar (ej. 'AAPL', 'MSFT', 'GGAL.BA', 'YPF', 'MercadoLibre').",
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
      name: "ficha_de_decision",
      description:
        "Genera la FICHA DE DECISIÓN COMPLETA de un activo con datos reales en vivo, replicando la metodología de la app Clarity (todas las capas): Capa 1 Macro (régimen, riesgo país, tasa libre de riesgo local), Capa 3 Cualitativo (6 dimensiones con gate >= 5.0), Capa 4 Cuantitativo (15 métricas + alertas), Capa 5 WACC (CAPM), Capas 6-9 Valuación triangulada (DCF + múltiplos + valor libro/APV con pesos por perfil), Paso 10 Margen de seguridad calibrado por score cualitativo (MOS 20%/35%/50%) con precio máximo de entrada, target y upside, y la DECISIÓN FINAL (COMPRAR / ESPERAR / NO COMPRAR / bloqueada por cualitativo). Para preguntas como 'haceme la ficha de decisión de X', 'analizá X con todas las capas', 'ficha completa de X', 'decime si compro X'. Es el análisis más completo: ejecuta macro + fundamental + wacc + valuación. Acepta ticker o nombre.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description:
              "Ticker o nombre del activo (ej. 'AAPL', 'MSFT', 'GGAL.BA', 'YPF', 'MercadoLibre').",
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
      name: "contexto_macro",
      description:
        "Obtiene el contexto macroeconómico actual en vivo: inflación mensual y tasa pasiva (BCRA), tipo de cambio oficial de referencia, riesgo país (ArgentinaDatos, serie y último), dólar oficial/blue/MEP/CCL (CriptoYa), precios y variación de SPY, DXY y Treasury 10Y (Yahoo Finance), tasas reales Fisher (mensual y anual compuesta), spread soberano implícito, clasificación de régimen macro (FAVORABLE / NEUTRO / ADVERSO con score y señales) y tasa libre de riesgo local calibrada. Usala cuando el usuario pregunte por el panorama macro, régimen, inflación, riesgo país, dólares, tasas reales o costos de capital en contexto. No requiere parámetros.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ciclo_economico",
      description:
        "Detecta la etapa actual del ciclo económico con el método intermarket de Pring/Stovall (6 etapas), con datos reales de Yahoo Finance: calcula los ratios 200 días DBC/TLT (commodities vs bonos), TLT/SPY, DIA/GLD y XLP/XLY (defensivos vs cíclicos) y la pendiente de las medias de 200 días de DBC, TLT, SPY y GLD para clasificar en Recuperación Inicial (1), Expansión Temprana (2), Expansión Tardía Inflacionaria (3), Pico/Euforia (4), Contracción/Flight-to-Quality (5) o Recesión Plena (6), con activos y sectores favorecidos y riesgos. Para preguntas como 'en qué etapa del ciclo estamos', 'dónde estamos en el ciclo económico', 'régimen intermarket'. No requiere parámetros.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "performance_sectorial",
      description:
        "Devuelve la performance de los 11 ETFs sectoriales de EE.UU. (XLK, XLF, XLV, XLE, XLC, XLY, XLP, XLI, XLB, XLRE, XLU) con datos reales de Yahoo Finance: variación porcentual del período y tendencia (cruce de precio vs SMA5) ordenado de mayor a menor rendimiento. Acepta un período opcional (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y). Para preguntas como 'qué sector rindió más', 'performance sectorial', 'cómo le fue a tecnología vs energía', 'rotación sectorial'. El parámetro es opcional (default 5d).",
      parameters: {
        type: "object",
        properties: {
          periodo: {
            type: "string",
            description:
              "Período de la performance (opcional). Opciones: '1d', '5d', '1mo', '3mo', '6mo', '1y', '2y'. Default '5d'.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "valuacion_sectorial",
      description:
        "Analiza la valuación de un sector de EE.UU. con datos reales en vivo (Yahoo Finance): toma los componentes principales del ETF sectorial, calcula P/E y P/BV promedio y percentiles por ticker, WACC estimado por empresa (CAPM simplificado con deuda/activos del balance) y solvencia (patrimonio/activos, saludable si >= 0.4), e identifica si el sector es frágil. Para preguntas como 'valuación del sector tecnología', 'en qué precio está el sector salud', 'WACC y solvencia del sector energía', 'es barato o caro el sector X'. Acepta el nombre del sector en inglés o español de la app Clarity: Technology, Healthcare, Financial Services, Energy, Consumer Defensive, Consumer Cyclical, Industrials, Basic Materials, Utilities, Communication Services, Real Estate.",
      parameters: {
        type: "object",
        properties: {
          sector: {
            type: "string",
            description:
              "Sector a analizar (ej. 'Technology', 'Healthcare', 'Energy', 'Financial Services', 'Communication Services', 'Consumer Discretionary'/'Consumer Cyclical', 'Real Estate', 'Utilities', 'Industrials', 'Basic Materials', 'Consumer Defensive').",
          },
          periodo: {
            type: "string",
            description: "Período opcional de los datos (default '1y').",
          },
        },
        required: ["sector"],
        additionalProperties: false,
      },
    },
  },
  // -------------------------------------------------------------------------
  // IOL (InvertirOnline) — cuenta personal vía API oficial con login.
  // -------------------------------------------------------------------------
  {
    type: "function",
    function: {
      name: "iol_login",
      description:
        "Inicia sesión en la API de InvertirOnline (IOL) con el usuario y contraseña que el usuario comparta en el chat. Necesario ANTES de usar iol_cuenta, iol_mercado o iol_operar. Las credenciales se guardan solo en memoria del servidor para esta conversación (nunca se guardan en disco ni se repiten en la respuesta). Si el usuario pide ver su portafolio, estado de cuenta u operaciones de IOL pero no inició sesión, pedile usuario y contraseña e invocá esta herramienta. Para cerrar sesión usá accion='cerrar'.",
      parameters: {
        type: "object",
        properties: {
          usuario: { type: "string", description: "Usuario (o DNI/CUIT) de IOL." },
          password: { type: "string", description: "Contraseña de IOL." },
          accion: {
            type: "string",
            description:
              "'iniciar' (default) para iniciar sesión; 'estado' para consultar si hay sesión activa; 'cerrar' para cerrarla.",
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "iol_cuenta",
      description:
        "Consulta la cuenta personal de IOL del usuario autenticado (requiere iol_login previo). Acciones: 'perfil' (datos personales y perfil inversor), 'estadocuenta' (saldos disponibles/comprometidos por moneda), 'portafolio' (posiciones valorizadas de un país), 'operaciones' (historial con filtros), 'operacion' (detalle por número), 'notificacion' (avisos de IOL), 'test_inversor' (preguntas del test de perfil). Presentá los resultados en tablas cuando haya varias filas.",
      parameters: {
        type: "object",
        properties: {
          accion: {
            type: "string",
            description:
              "Una de: perfil | estadocuenta | portafolio | operaciones | operacion | notificacion | test_inversor.",
          },
          pais: {
            type: "string",
            description: "Para 'portafolio': 'argentina' o 'estados_Unidos'. Default 'argentina'.",
          },
          numero: { type: "number", description: "Para 'operacion': número de operación." },
          estado: {
            type: "string",
            description: "Para 'operaciones': todas | pendientes | terminadas | canceladas.",
          },
          fechaDesde: { type: "string", description: "Para 'operaciones': YYYY-MM-DD." },
          fechaHasta: { type: "string", description: "Para 'operaciones': YYYY-MM-DD." },
        },
        required: ["accion"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "iol_mercado",
      description:
        "Consulta datos de MERCADO de IOL (requiere iol_login previo): cotización detallada de un título (último precio, puntas, apertura, máximo/mínimo, volumen), panel completo de un instrumento (acciones, cedears, titulospublicos, letras, bonos, futuros, opciones, adrs), opciones de un subyacente, fondos comunes de inversión (FCI listado o por símbolo), dólar MEP implícito de un bono y serie histórica de precios. Útil para cotizaciones argentinas puntuales (ej. AL30, GGAL, CEDEARs) que no están en fuentes públicas.",
      parameters: {
        type: "object",
        properties: {
          accion: {
            type: "string",
            description:
              "Una de: cotizacion_detalle | cotizacion | panel_todos | fci_todos | fci_simbolo | mep | serie_historica | opciones | instrumentos | paneles.",
          },
          simbolo: {
            type: "string",
            description: "Símbolo del título (ej. 'AL30', 'GGAL', 'AAPL').",
          },
          mercado: {
            type: "string",
            description: "Mercado IOL: 'bCBA' (default) o 'nYSE'/'nasdaq' para EE.UU.",
          },
          instrumento: {
            type: "string",
            description:
              "Para 'panel_todos': acciones | cedears | titulospublicos | letras | bonos | futuros | opciones | adrs.",
          },
          pais: { type: "string", description: "'argentina' (default) o 'estados_Unidos'." },
          fechaDesde: { type: "string", description: "Para 'serie_historica': YYYY-MM-DD." },
          fechaHasta: { type: "string", description: "Para 'serie_historica': YYYY-MM-DD." },
        },
        required: ["accion"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "iol_operar",
      description:
        "Ejecuta o SIMULA operaciones en IOL del usuario autenticado (requiere iol_login previo). Acciones de consulta/simulación: 'montos_estimados', 'venta_mep_simple_montos', 'parametros_operatoria', 'validar_monto', 'comisiones_cpd', 'subastas_cpd', 'puede_operar_cpd', 'suscripcion_fci' (con soloValidar=true), 'rescate_fci' (con soloValidar=true), 'token_ddjj'. Acciones que ENVÍAN una orden real (comprar, vender, comprar_especie_d, vender_especie_d, suscripcion_fci/rescate_fci con soloValidar=false, cpd_operar, operatoria_comprar): SOLO se invocan con confirmar=true DESPUÉS de que el usuario confirmó explícitamente los parámetros exactos (símbolo, cantidad/precio, mercado, validez). Sin confirmación explícita, mostrá el detalle de lo que harías y preguntá. Nunca sugieras qué comprar: solo ejecutás lo que el usuario ordena.",
      parameters: {
        type: "object",
        properties: {
          accion: {
            type: "string",
            description:
              "comprar | vender | comprar_especie_d | vender_especie_d | suscripcion_fci | rescate_fci | cpd_operar | cpd_comisiones | cpd_subastas | puede_operar_cpd | token_ddjj | montos_estimados | venta_mep_simple_montos | parametros_operatoria | validar_monto | operatoria_comprar.",
          },
          mercado: { type: "string", description: "'bCBA' (default) o 'nYSE'/'nasdaq'." },
          simbolo: { type: "string", description: "Símbolo del título o FCI." },
          cantidad: { type: "number", description: "Cantidad de títulos (órdenes y rescate FCI)." },
          precio: { type: "number", description: "Precio límite de la orden." },
          monto: {
            type: "number",
            description: "Monto en pesos (FCI suscripción, operatoria simplificada).",
          },
          tipoOrden: {
            type: "string",
            description: "'precioLimite' (default) o 'precioMercado'.",
          },
          plazo: { type: "string", description: "'t0' (default), 't1' o 't2'." },
          validez: {
            type: "string",
            description: "Fecha de validez ISO (ej. 2026-08-25T00:00:00Z).",
          },
          idCuentaBancaria: {
            type: "number",
            description: "Para especie D / operatoria simplificada.",
          },
          importe: { type: "number", description: "Para 'cpd_comisiones': importe a invertir." },
          tasa: { type: "number", description: "Para 'cpd_comisiones' y 'cpd_operar'." },
          idSubasta: { type: "number", description: "Para 'cpd_operar'." },
          estado: { type: "string", description: "Para 'cpd_subastas': estado de subastas." },
          segmento: { type: "string", description: "Para 'cpd_subastas': segmento." },
          idTipoOperatoria: {
            type: "number",
            description: "Para 'parametros_operatoria' / 'validar_monto'.",
          },
          idTipoOperatoriaSimplificada: {
            type: "number",
            description: "Para 'operatoria_comprar'.",
          },
          soloValidar: {
            type: "boolean",
            description: "Para FCI: true = solo valida sin ejecutar (default true).",
          },
          confirmar: {
            type: "boolean",
            description:
              "Debe ser true SOLO si el usuario ya confirmó explícitamente la operación con esos parámetros exactos. Si falta, la orden no se envía.",
          },
        },
        required: ["accion"],
        additionalProperties: false,
      },
    },
  },
  // -------------------------------------------------------------------------
  // Fuentes públicas genéricas
  // -------------------------------------------------------------------------
  {
    type: "function",
    function: {
      name: "datos_financieros",
      description:
        "Consulta directa a APIs financieras públicas por fuente. fuente='yfinance': cualquier dato de Yahoo Finance de un símbolo (módulos: price, summaryDetail, financialData, defaultKeyStatistics, assetProfile, earnings, recommendationTrend, calendarEvents, insiderTransactions, history para histórico 6 meses, news para noticias, search para buscar ticker); fuente='argentinadatos': endpoint v1 (cotizaciones/dolares[/casa], finanzas/indices/{inflacion,inflacionInteranual,uva,riesgo-pais[/ultimo]}, finanzas/tasas/{plazoFijo,depositos30Dias}, finanzas/criptopesos, finanzas/letras, finanzas/fci/...); fuente='criptoya': dólar ('dolar', 'dolar/blue') o exchange cripto ('belo/BTC/ARS'); fuente='bcra_cambiarias': divisas y cotizaciones oficiales BCRA de cualquier moneda; fuente='bcra_monetarias': variables monetarias BCRA v4 (principales_variables para listar, datos con idVariable para la serie). Usala cuando la consulta apunte claramente a una de estas fuentes o cuando consultar_mercado no cubra el dato.",
      parameters: {
        type: "object",
        properties: {
          fuente: {
            type: "string",
            description:
              "yfinance | argentinadatos | criptoya | bcra_cambiarias | bcra_monetarias.",
          },
          simbolo: {
            type: "string",
            description: "yfinance: ticker (ej. AAPL, GGAL.BA, BTC-USD).",
          },
          modulo: {
            type: "string",
            description:
              "yfinance: módulo(s) quoteSummary separados por coma, o 'history', 'news', 'search'. Default 'price,summaryDetail,financialData'.",
          },
          endpoint: {
            type: "string",
            description:
              "argentinadatos: ruta v1 (ej. 'finanzas/indices/uva'). criptoya: recurso (ej. 'dolar/blue').",
          },
          accion: {
            type: "string",
            description:
              "bcra_cambiarias: divisas | cotizaciones | cotizacion_moneda. bcra_monetarias: principales_variables | datos.",
          },
          codMoneda: {
            type: "string",
            description: "bcra_cambiarias: código de moneda (USD, EUR...).",
          },
          idVariable: { type: "number", description: "bcra_monetarias: id de la variable." },
          categoria: {
            type: "string",
            description: "bcra_monetarias: filtro de texto sobre descripción/categoría.",
          },
          fechaDesde: { type: "string", description: "Fecha desde (YYYY-MM-DD) según fuente." },
          fechaHasta: { type: "string", description: "Fecha hasta (YYYY-MM-DD) según fuente." },
        },
        required: ["fuente"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grafico_chat",
      description:
        "Genera un GRÁFICO que se muestra dentro del chat. Tipos: 'linea' (serie temporal con datos propios o traídos de Yahoo Finance con simbolo+rango), 'barras' (categoría/valor), 'tradingview' (gráfico profesional interactivo de TradingView embebido para cualquier símbolo global, ej. NASDAQ:AAPL, BCBA:GGAL, BINANCE:BTCUSDT). Usalo SIEMPRE que el usuario pida un gráfico, chart, evolución de precio, velas o visualización de una serie. Devuelve además un resumen numérico para que redactes el análisis.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", description: "linea | barras | tradingview." },
          titulo: { type: "string", description: "Título visible del gráfico." },
          unidad: { type: "string", description: "Unidad del eje Y (USD, ARS, %...)." },
          simbolo: {
            type: "string",
            description:
              "Para 'linea' con datos de Yahoo: ticker (ej. AAPL, ^MERV, BTC-USD). Para 'tradingview': símbolo con exchange (ej. NASDAQ:AAPL, BCBA:GGAL, BINANCE:BTCUSDT).",
          },
          rango: {
            type: "string",
            description: "Para 'linea' Yahoo: 1mo|3mo|6mo|1y|2y|5y. Default 6mo.",
          },
          intervalo: {
            type: "string",
            description: "Para 'tradingview': D (default), W, M, 60, 30, 15, 5, 1.",
          },
          categorias: {
            type: "array",
            items: { type: "string" },
            description: "Para 'barras': etiquetas de cada barra.",
          },
          valores: {
            type: "array",
            items: { type: "number" },
            description: "Para 'barras': valores numéricos de cada barra.",
          },
        },
        required: ["tipo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generar_informe",
      description:
        "Genera un INFORME estructurado (título + secciones en Markdown) que se muestra como documento en el chat, con botones para descargarlo e imprimirlo/guardarlo como PDF. Usalo cuando el usuario pida un informe, reporte, resumen ejecutivo o análisis consolidado (ej. 'informe de mi portafolio', 'reporte del dólar', 'informe PDF de YPF'). Redactá cada sección con los datos reales obtenidos de las herramientas en este turno; NO inventes cifras. El parámetro contenidoMarkdown es el informe completo en Markdown (con tablas GFM si aportan claridad).",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título del informe." },
          contenidoMarkdown: {
            type: "string",
            description:
              "Informe completo en Markdown: encabezados ##, párrafos, listas y tablas. Incluí fecha, fuentes citadas y disclaimer final.",
          },
        },
        required: ["titulo", "contenidoMarkdown"],
        additionalProperties: false,
      },
    },
  },
  // -------------------------------------------------------------------------
  // Herramientas migradas del tab /herramientas (clarity-dashboard).
  // -------------------------------------------------------------------------
  {
    type: "function",
    function: {
      name: "optimizar_cartera_avanzada",
      description:
        "Optimiza una cartera con 5 estrategias cuantitativas sobre series reales de Yahoo Finance (2 años por defecto): Máx. Sharpe, Mín. Varianza, Equi-weight, Riesgo inverso y Markowitz. Devuelve retorno anual, volatilidad, Sharpe, VaR95, skewness, kurtosis, test de normalidad Jarque-Bera y pesos por activo de cada estrategia. Usar cuando el usuario pida optimizar una cartera, comparar estrategias de asignación o 'cómo repartir' un monto entre varios tickers.",
      parameters: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "Entre 2 y 20 tickers (ej. ['SPY','QQQ','AAPL','GGAL.BA']).",
          },
          years: { type: "number", description: "Años de historia a usar (0.5 a 10, default 2)." },
          benchmarks: {
            type: "array",
            items: { type: "string" },
            description: "Benchmarks para el CAPM de la cartera (default ['SPY']).",
          },
          notional: {
            type: "number",
            description: "Monto nocional de referencia en USD (default 15000).",
          },
        },
        required: ["tickers"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "backtest_optimizacion",
      description:
        "Backtest walk-forward de la optimización de cartera: entrena con datos previos a una fecha de corte y evalúa fuera de muestra. Devuelve pesos entrenados vs resultado forward (retorno, volatilidad, Sharpe). Usar cuando el usuario pregunte si la estrategia 'hubiera funcionado', pida validar la optimización o backtesting.",
      parameters: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "Entre 2 y 20 tickers.",
          },
          cutoffDate: {
            type: "string",
            description: "Fecha de corte YYYY-MM-DD (entrena antes, evalúa después).",
          },
          years: { type: "number", description: "Años de historia de entrenamiento (default 2)." },
        },
        required: ["tickers", "cutoffDate"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "distribucion_riesgo",
      description:
        "Análisis de riesgo por distribución de retornos con datos reales: media y volatilidad anualizadas, Sharpe, VaR 95%, skewness, kurtosis, test Jarque-Bera de normalidad, pérdida/ganancia máxima y histograma. Acepta intervalos intradía (1m a 1mo) y períodos (1d a max). Usar cuando el usuario pida riesgo, volatilidad, VaR o 'qué tan riesgoso es' un activo o varios.",
      parameters: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "Entre 1 y 20 tickers.",
          },
          intervalo: {
            type: "string",
            description: "Intervalo: 1m|5m|15m|30m|1h|1d|1wk|1mo (default 1d).",
          },
          periodo: {
            type: "string",
            description: "Período: 1d|5d|1mo|3mo|6mo|1y|2y|5y|10y|max (default 2y).",
          },
        },
        required: ["tickers"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "capm_auto",
      description:
        "Regresión CAPM con auto-detección del mejor benchmark (mayor R² entre índices, sectores, países y factores) más beta p-variance y exponente de Hurst (metodología Labadie §3.2). Devuelve beta, alpha anualizado, R², correlación, p-valor y errores estándar por ticker. Usar cuando el usuario pida beta/alpha sin especificar benchmark, o análisis CAPM riguroso.",
      parameters: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "Entre 1 y 20 tickers.",
          },
          benchmarks: {
            type: "array",
            items: { type: "string" },
            description: "Benchmarks explícitos (opcional si autoDetect=true).",
          },
          autoDetect: {
            type: "boolean",
            description: "Auto-detectar mejor benchmark por R² (default true).",
          },
        },
        required: ["tickers"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analisis_industria",
      description:
        "Análisis sectorial/industrial completo: fundamentales (P/E, PEG, ROE, márgenes, FCF yield, upside de analistas), score fundamental por ticker, matriz de benchmarks por industria y comparación contra ETF sectorial. Usar cuando el usuario pida analizar un sector o industria, comparar empresas de un rubro o pedir 'los mejores valores de X industria'.",
      parameters: {
        type: "object",
        properties: {
          sector: {
            type: "string",
            description: "Sector GICS en inglés (ej. 'Technology', 'Healthcare').",
          },
          industry: {
            type: "string",
            description: "Industria en inglés (ej. 'Software - Infrastructure').",
          },
          tickers: {
            type: "array",
            items: {
              type: "object",
              properties: { ticker: { type: "string" }, nombre: { type: "string" } },
              required: ["ticker"],
            },
            description: "Tickers de la industria a incluir (1 a 50).",
          },
        },
        required: ["sector", "industry", "tickers"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ranking_valuacion_sectores",
      description:
        "Ranking de valuación relativa de los sectores EE.UU.: P/E forward y trailing promedio, PEG, percentil histórico mediano de P/E, cantidad de tickers válidos y market cap total por sector. No requiere parámetros. Usar cuando el usuario pregunte qué sectores están baratos/caros o pida una vista comparativa de valuación sectorial.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "oportunidades_diarias",
      description:
        "Screeners del día de Yahoo Finance: mayores alzas, mayores bajas, más operadas, más cortocircuitadas y infravaloradas de gran capitalización, con precio, variación %, volumen y market cap. No requiere parámetros. Usar cuando el usuario pregunte por oportunidades del día, qué está subiendo/bajando o movimientos inusuales de mercado.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "matriz_benchmarks",
      description:
        "Matriz de correlaciones semanales entre ETFs sectoriales y benchmarks (SPDRs, SPY, QQQ, etc.) con los pares más diversificadores y más redundantes, y mejor benchmark por R² para cada activo. No requiere parámetros. Usar cuando el usuario pregunte por correlaciones entre sectores, diversificación o qué ETF se mueve junto a cuál.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
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
  | "portafolio"
  | "iol"
  | "grafico"
  | "informe";

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
    case "analizar_fundamental":
    case "valor_por_metodos":
    case "ficha_de_decision":
      return "valoracion";
    case "calcular_wacc":
      return "capm";
    case "contexto_macro":
      return "mercado";
    case "ciclo_economico":
    case "performance_sectorial":
    case "valuacion_sectorial":
      return "portafolio";
    case "iol_login":
    case "iol_cuenta":
    case "iol_mercado":
    case "iol_operar":
      return "iol";
    case "datos_financieros":
      return "mercado";
    case "grafico_chat":
      return "grafico";
    case "generar_informe":
      return "informe";
    case "optimizar_cartera_avanzada":
    case "backtest_optimizacion":
      return "portafolio";
    case "distribucion_riesgo":
      return "riesgo";
    case "capm_auto":
    case "matriz_benchmarks":
      return "capm";
    case "analisis_industria":
    case "ranking_valuacion_sectores":
      return "portafolio";
    case "oportunidades_diarias":
      return "mercado";
    default:
      return "searching";
  }
}

export const NOMBRE_HERRAMIENTAS = TOOLS.map((t) => t.function.name);
