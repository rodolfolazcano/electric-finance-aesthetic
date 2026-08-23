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
        "Consulta cotizaciones y datos de mercado actuales del mercado argentino desde fuentes públicas y APIs oficiales: CriptoYa, ArgentinaDatos, BCRA (Estadísticas Cambiarias y Estadísticas v4 con token) y, como fallback para lo que no está en las APIs, la web (panel de cauciones de PPI/BYMA). Incluye: dólar (oficial, blue, MEP, CCL, mayorista, tarjeta, ahorro), riesgo país, UVA, inflación, letras del Tesoro (LECAP/BONCAP), tasas de plazo fijo, rendimiento de fondos comunes de inversión, cotización de otras monedas (euro, real, libra), tasas oficiales del BCRA (BADLAR, TM20, depósitos a 30 días, LELIQ, pases a 1 día) y la tasa de caución a 30 días. Usar siempre que se pidan cotizaciones, tasas o valores actuales. Para YTM/TIR/precio de un bono puntual (AL30, GD35...) usar calcular_ytm_bono; para acciones/CEDEARs usar datos_financieros(fuente=\"yfinance\").",
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
        "Consulta la base de conocimiento interna del sitio web de Cintia Boos y el corpus academico indexado (185 documentos / 12.776 chunks: Pascale, Fowler Newton, Biondi, Elbaum, Dumrauf, Alonso, Blanchard/Perez-Enrri, Dornbusch-Fischer, Bustamante, Murphy + Labadie Quant - 1205.3482v6 TC/IS p=1/H, 1303.7177 HFT, microstructure Kyle/Glosten, algo TWAP/VWAP/PoV, stat-arb 5 stages, spectral PCA, ML, zoology, ETFs, Black-Scholes). Usala SIEMPRE antes de calcular: encuadre academico dicta metodo. Categorias: Labadie - Quant & Microstructure; Pascale - Finanzas de la empresa; Contabilidad - Fowler Newton; Estados contables - Biondi; Carteras - Elbaum; Calculo financiero - Dumrauf; Macro LATAM - Blanchard/Perez-Enrri; Macro - Dornbusch-Fischer; Financiacion y mercados - Bustamante; Intermarket - Murphy. Para servicios (7), instrumentos (12), brokers (3), FAQs (4), alianzas (2), sistema financiero argentino (BCRA Ley 21.526 CAMELBIG RPC NIIF 9 SEDESA BADLAR ETTI), europeo (ESI MiFID II BME BCE TARGET EURIBOR/ESTR), matematica financiera (valor temporal, capitalizacion, descuento, spot/forward, TAE/CFT, TIR/VAN), calculadora (HP12C rentas/bonos), planificacion (perfiles riesgo, triada rentabilidad-seguridad-liquidez, 5 fases, carteras), etica (IEAF/IAEF), seguros Ley 17.418 y riesgos. OBLIGATORIO: clasificar dominio -> consultar_base_conocimiento(categoria + concepto) -> citar archivo/pagina antes de calcular. Para Labadie: consultar_base_conocimiento(Labadie tema p=1/H TC/IS Kyle Glosten HFT TWAP/VWAP/PoV spectral PCA).",
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
  // Ética y Asesoramiento Financiero — principios de conducta profesional
  // -------------------------------------------------------------------------
  {
    type: "function",
    function: {
      name: "consultar_principios_etico",
      description:
        "Consulta los principios éticos y de asesoramiento financiero basados en los manuales AFC 2022 (Códigos de Conducta IAEF/IEAF, Ética Manual, Asesoramiento Financiero). Úsalo para conocer los principios que deben guiar el comportamiento del asesor financiero: integridad, independencia, conflictos de interés, confidencialidad, cumplimiento normativo, conocimiento del cliente y asesoramiento financiero. El agente debe actuar siempre bajo estos principios.",
      parameters: {
        type: "object",
        properties: {
          categoria: {
            type: "string",
            description:
              "Categoría de principios a consultar (opcional). Opciones: 'Integridad y Honestidad', 'Independencia y Objetividad', 'Conflictos de Interés', 'Confidencialidad', 'Cumplimiento Normativo', 'Conocimiento del Cliente', 'Asesoramiento Financiero'. Si no se especifica, devuelve todos los principios.",
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
      name: "verificar_cumplimiento_etico",
      description:
        "Verifica si una recomendación o respuesta del agente cumple con los principios éticos del asesoramiento financiero. Detecta violaciones como: promesas de rendimiento garantizado, falta de advertencia de riesgos, falta de consideración del perfil del cliente, o conflicto de intereses. El agente debe usar esta herramienta antes de emitir recomendaciones de inversión para asegurar que su respuesta es éticamente adecuada.",
      parameters: {
        type: "object",
        properties: {
          recomendacion: {
            type: "string",
            description:
              "Texto de la recomendación o respuesta del agente que se quiere verificar desde el punto de vista ético.",
          },
        },
        required: ["recomendacion"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "obtener_guia_comportamiento",
      description:
        "Obtiene la guía completa de comportamiento ético para el agente, con instrucciones específicas sobre cómo aplicar cada principio ético en la práctica. El agente debe consultar esta guía para asegurar que su comportamiento y respuestas cumplen con los estándares profesionales del asesoramiento financiero según los manuales AFC 2022.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
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
  {
    type: "function",
    function: {
      name: "iol_asesor",
      description:
        "Módulo ASESOR de IOL para cuentas asesoradas (requiere iol_login con una cuenta que tenga rol de Asesor). Acciones: 'clientes' (LISTA DE CLIENTES ASESORADOS derivada de los movimientos del asesor), 'movimientos' (movimientos consolidados con filtros opcionales clientes[]/from/to/status/type/country/currency), 'test_inversor' (preguntas del test), 'responder_test_inversor' (perfil sugerido, opcionalmente para idClienteAsesorado) y 'vender_especie_d' (venta para un cliente asesorado, SOLO con confirmar=true tras confirmación explícita del usuario). Si IOL responde 401/403, informá que la cuenta no tiene el rol de Asesor habilitado.",
      parameters: {
        type: "object",
        properties: {
          accion: {
            type: "string",
            description:
              "clientes | movimientos | test_inversor | responder_test_inversor | vender_especie_d.",
          },
          clientes: {
            type: "array",
            items: { type: "number" },
            description: "Para 'movimientos': IDs de comitente/cliente a filtrar.",
          },
          from: { type: "string", description: "Fecha desde ISO (ej. 2026-01-01T00:00:00Z)." },
          to: { type: "string", description: "Fecha hasta ISO." },
          dateType: { type: "string", description: "Tipo de fecha del filtro." },
          status: { type: "string", description: "Estado de los movimientos." },
          type: { type: "string", description: "Tipo de movimiento." },
          country: { type: "string", description: "'argentina' o 'estados_Unidos'." },
          currency: {
            type: "string",
            description: "Moneda a filtrar (peso_Argentino, dolar_Estadounidense).",
          },
          cuentaComitente: {
            type: "string",
            description: "Número de cuenta comitente específica.",
          },
          idClienteAsesorado: {
            type: "number",
            description: "ID del cliente asesorado (responder_test_inversor / vender_especie_d).",
          },
          respuestas: {
            type: "object",
            additionalProperties: true,
            description:
              "Para responder_test_inversor: objeto con las respuestas según el esquema del test.",
          },
          mercado: { type: "string", description: "'bCBA' (default) o 'nYSE'/'nasdaq'." },
          simbolo: { type: "string", description: "Símbolo del título a vender." },
          cantidad: { type: "number", description: "Cantidad de títulos." },
          precio: { type: "number", description: "Precio límite." },
          validez: { type: "string", description: "Validez ISO de la orden." },
          tipoOrden: { type: "string", description: "'precioLimite' (default) o 'precioMercado'." },
          plazo: { type: "string", description: "'t0' (default), 't1', 't2'." },
          fondosParaOperacion: { type: "number", description: "Fondos asignados a la operación." },
          idCuentaBancaria: { type: "number", description: "Cuenta bancaria de acreditación." },
          confirmar: {
            type: "boolean",
            description:
              "true SOLO si el usuario confirmó explícitamente la orden para el cliente.",
          },
        },
        required: ["accion"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analisis_tecnico",
      description:
        "Análisis técnico completo de un activo con serie real de Yahoo Finance (1 año): precio actual y variación diaria, medias móviles MA20/MA50/MA200, EMA9, RSI14, MACD(12,26,9) con histograma, soporte y resistencia por pivotes, volatilidad anualizada y rango de 52 semanas, más una interpretación textual de tendencia y momentum. Usar cuando el usuario pida 'análisis técnico', 'medias móviles', 'RSI/MACD', 'soportes y resistencias' o la ficha técnica de un ticker.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker de Yahoo Finance (ej. AAPL, GGAL.BA, SPY, BTC-USD).",
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
      name: "analizar_portafolio_clarity",
      description:
        "Analiza un portafolio con la metodología clarity: precio y valorizado reales por activo, peso sobre el total, clasificación por categoría macro (Renta Variable / Renta Fija / CEDEAR), retorno y volatilidad anualizados por activo, capital separado en ARS y USD, y distribución por categoría. Acepta items [{ticker,cantidad}] explícitos; si no vienen y hay sesión IOL activa (iol_login), usa automáticamente las posiciones reales del portafolio IOL del usuario. Usar para 'analizá mi cartera', 'distribución de mi portafolio', 'cuánto tengo en ARS vs USD'.",
      parameters: {
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ticker: {
                  type: "string",
                  description: "Ticker local o de Yahoo (GGAL, GGAL.BA, AAPL, AAPL.D).",
                },
                cantidad: { type: "number", description: "Cantidad de títulos." },
              },
              required: ["ticker", "cantidad"],
            },
            description: "Posiciones del portafolio. Opcional si hay sesión IOL activa.",
          },
          period: {
            type: "number",
            description: "Días de historia para retorno/volatilidad (default 365).",
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
      name: "score_sectorial",
      description:
        "Score sectorial de un ticker con la metodología clarity: clasifica el activo en su sector/industria (universo EE.UU. + BCBA), aplica el perfil sectorial (pesos fundamentales/técnicos, sensibilidad a tasas y commodities), calcula el score fundamental 0-100 con bandas por sector y bonuses Graham (margen de seguridad) y Amat (solvencia PN/Activo), y genera una interpretación relativa contra pares del mismo sector: resumen ejecutivo, fortalezas, debilidades, mejor alternativa del sector y advertencias (cuellos de botella estructurales, riesgo geopolítico, muestra insuficiente). Lenguaje descriptivo conforme CNV. Usar cuando el usuario pida 'score sectorial', 'análisis sectorial de X', 'cómo está X vs su sector', 'posición relativa de X' o 'mejores acciones de su sector'.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description:
              "Ticker del activo (ej. AAPL, MSFT, GGAL.BA). Para CEDEARs el score queda no disponible: analizar el subyacente en USD.",
          },
          peersMax: {
            type: "number",
            description: "Cantidad máxima de pares del sector a comparar (default 10).",
          },
        },
        required: ["simbolo"],
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
  {
    type: "function",
    function: {
      name: "telegram_enviar_grafico",
      description:
        "Envía al bot de Telegram una IMAGEN PNG del gráfico TradingView del ticker (snapshot real vía chart-img.com + fallback). Usalo cuando el usuario pida 'enviá el gráfico de X a Telegram', 'mandale el chart de AAPL al bot', etc. Genera la imagen y la adjunta como foto con caption.Ticker con exchange opcional (ej. AAPL, NASDAQ:AAPL, BCBA:GGAL, BINANCE:BTCUSDT).",
      parameters: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description: "Ticker o símbolo con exchange (ej. AAPL, NASDAQ:AAPL, BCBA:GGAL, BINANCE:BTCUSDT).",
          },
          intervalo: {
            type: "string",
            description: "Intervalo TradingView: 1D (default), W, M, 60, 30, 15, 5, 1.",
          },
          caption: { type: "string", description: "Caption opcional para el mensaje de Telegram." },
          chatId: { type: "string", description: "Chat destino opcional; si falta usa los configurados del bot." },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "publicar_slide_mercado",
      description:
        "Genera y publica en el BOT DE PUBLICACIONES de Telegram una PUBLICACIÓN profesional: slide PNG moderno 1080x1080 (precio, variación, sparkline, ratio SHARPE calculado, volatilidad, beta, P/E forward, ROE, upside de analistas + noticias del día) más el texto editorial largo. Usala cuando el usuario pida 'enviá una publicación de X al bot', 'publicá el slide de AAPL con su Sharpe', 'posteá X con noticias'. Cruza datos reales de la app + noticias verificadas.",
      parameters: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description: "Ticker objetivo (ej. AAPL, GGAL.BA, MELI).",
          },
          senal: { type: "string", description: "Lectura/señal breve para el título (ej. 'temporada de balances confirma resiliencia')." },
          motivo: { type: "string", description: "Síntesis editorial (2-3 líneas) citando solo datos obtenidos." },
          chatId: { type: "string", description: "Chat destino opcional; si falta usa los chats configurados del bot de publicaciones." },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "publicar_oportunidades",
      description:
        "RAZONA sobre el mercado, busca oportunidades y PUBLICA en el bot de publicaciones (@Coronarinversiones777_bot) en formato 🚀 editorial corto con la lista de recomendados, descripción de cada uno y por qué sumarlos. Cruza el motor unificado de señales + datos vivos + catálogo curado. Usala cuando pidan 'buscá oportunidades y publicá', 'publicá oportunidades crypto en CEDEARs', etc.",
      parameters: {
        type: "object",
        properties: {
          tema: { type: "string", description: "cripto | cedears | argentina | auto (default auto)." },
          universo: {
            type: "array",
            items: { type: "string" },
            description: "Tickers específicos opcional (ej. ['IBIT','ETHA','COIN','HOOD']). Si falta usa el universo del tema.",
          },
          max: { type: "number", description: "Cantidad de recomendados (2-8, default 4)." },
          titulo: { type: "string", description: "Título 🚀 personalizado opcional." },
          porQue: { type: "string", description: "Texto 💡 personalizado opcional." },
          chatId: { type: "string", description: "Chat destino opcional; si falta usa los configurados." },
        },
        required: [],
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
  // -------------------------------------------------------------------------
  // Metodologías cuantitativas de Labadie (stat-arb y ejecución óptima).
  // -------------------------------------------------------------------------
  {
    type: "function",
    function: {
      name: "pairs_trading_labadie",
      description:
        "Analiza un PAR de activos con la metodología de arbitraje estadístico de Labadie sobre series reales de Yahoo Finance: correlación, beta de hedge por regresión, test ADF de cointegración, spread con media/volatilidad móviles, z-score actual, bandas de entrada mu±a·sigma y stop-loss ±b·sigma, Hurst del spread con p implícita (1/H), backtest completo (trades, win rate, Sharpe, Sharpe p-varianza, max drawdown) y validación In-Sample vs Out-of-Sample. Para preguntas como 'analizá el par GGAL y BMA', 'pairs trading entre X e Y', 'está cointegrado X con Y', 'spread entre AAPL y MSFT', 'arbitraje estadístico de X e Y'. Requiere DOS tickers.",
      parameters: {
        type: "object",
        properties: {
          simboloA: {
            type: "string",
            description: "Primer ticker del par (ej. 'GGAL.BA', 'AAPL', 'PAMP.BA').",
          },
          simboloB: {
            type: "string",
            description: "Segundo ticker del par (ej. 'BMA.BA', 'MSFT', 'YPF').",
          },
          ventana: {
            type: "number",
            description: "Ventana móvil del spread en días (5-120). Default 20.",
          },
          umbralEntrada: {
            type: "number",
            description: "Umbral de entrada a en múltiplos de sigma (0.3-4). Default 1.5.",
          },
          umbralStop: {
            type: "number",
            description:
              "Umbral de stop-loss b en múltiplos de sigma, debe ser > umbralEntrada. Default 2.5.",
          },
          rangoDias: {
            type: "number",
            description: "Días de historia para el análisis (90-730). Default 365.",
          },
        },
        required: ["simboloA", "simboloB"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "curva_ejecucion_labadie",
      description:
        "Calcula la CURVA DE EJECUCIÓN ÓPTIMA de un activo con la metodología Almgren-Chriss extendida de Labadie-Lehalle sobre datos reales de Yahoo Finance: volúmenes óptimos por slice (Target Close hacia adelante o Implementation Shortfall hacia atrás), impacto cóncavo (v/V)^gamma, restricción PVol de participación máxima, tiempos óptimos de inicio/parada y medida de riesgo p-varianza con exponente de Hurst (p=1/H). Para preguntas como 'cómo ejecuto una orden grande de X', 'curva de trading óptima de X', 'Target Close vs Implementation Shortfall', 'impacto de mercado de X', 'con qué agresividad compro X'.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker del activo a ejecutar (ej. 'AAPL', 'GGAL.BA', 'SPY').",
          },
          benchmark: {
            type: "string",
            description: "'tc' = Target Close (default) o 'is' = Implementation Shortfall.",
          },
          participacionMaxima: {
            type: "number",
            description: "Participación máxima del volumen PVol q (0.01-0.5). Default 0.1.",
          },
          pVarianza: {
            type: "number",
            description:
              "Exponente p de la p-varianza (1.1-4; p=2 varianza clásica; p=1/Hurst según Hurst estimado). Default 2.",
          },
          gammaImpacto: {
            type: "number",
            description: "Exponente gamma del impacto cóncavo (0-1). Default 0.5.",
          },
          volatilidadAnual: {
            type: "number",
            description:
              "Volatilidad anual opcional (fracción, ej. 0.25). Si falta se estima de los datos.",
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
      name: "predecir_direccion",
      description:
        "Predicción direccional ML del subyacente BCBA (metodología Labadie ML 2018 Secc 2-5): regresión logística L2 con 15 features técnicos sobre 2 años de precios diarios, split temporal 60/20/20 sin leakage, umbral F1 óptimo en CV y validación walk-forward. Devuelve probabilidad de subida, señal Call/Put/Neutral con confianza, strikes sugeridos y métricas de validación (CV/test/walk-forward). Para '¿sube o baja GGAL?', 'probabilidad de subida de PAMP', 'predicción del subyacente YPFD'. Incluye guardrail anti-alucinación: si walk-forward <55% lo marca sin ventaja estadística.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker del subyacente BCBA (ej. GGAL, PAMP, YPFD, COME, BMA). Sin sufijo .BA.",
          },
          horizonte: {
            type: "number",
            description: "Horizonte de predicción en días hábiles (1-60). Default 5.",
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
      name: "cadena_opciones_bcba",
      description:
        "Cadena de opciones listada en BCBA vía API IOL (requiere credenciales configuradas): spot, volatilidad EWMA anual, tasa de caución 7d real, strikes con precio/bid/ask, volatilidad implícita por bisección, griegas Black-Scholes, VaR delta-gamma 95% y skew/sesgo de volatilidad OTM (>+10% alcista, <-10% bajista) con lectura interpretada. Para 'opciones de GGAL', 'volatilidad implícita PAMP', 'sesgo de opciones', 'IV smile YPFD'. Solo símbolos con opciones listadas.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Subyacente BCBA con opciones listadas (GGAL, PAMP, YPFD, COME, BMA).",
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
      name: "consultar_cierre_mercado",
      description:
        "Reporte de CIERRE DE MERCADO automático (EE.UU. + global) con datos en vivo de Yahoo Finance: 7 índices (S&P 500, Nasdaq 100, DJIA, Russell 2000, Mid/Small/Micro Cap) con precio, % HOY/1M/YTD y serie para sparkline; 11 sectores SPDR ordenados por % HOY; Top 6 ganadores/perdedores; DXY/VIX/tasas 5Y/10Y/30Y; renta fija gobierno (MUB/GOVT/TIP) y corporativa (CWB/LQD/HYG); 7 desarrollados y 8 emergentes; 7 commodities (oro/plata/BTC/WTI/Brent/gas/soja). Cacheado al último cierre de Wall Street (16:15 ET). Usar para 'cierre de hoy', 'cómo cerró el mercado', 'resumen del mercado'.",
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
      name: "generar_informe_matutino",
      description:
        "INFORME MATUTINO completo con snapshot de mercado + agenda económica + narrativa IA (humor risk-on/off/mixto, resumen ejecutivo, radar internacional/local, oportunidades y recomendación por perfil CNV 7 niveles). Reutiliza snapshot de Yahoo/ArgentinaDatos + Gemini/LLM. Parámetro fecha opcional YYYY-MM-DD (default hoy). Usar para 'informe de la mañana', 'qué pasó hoy', 'resumen matutino'.",
      parameters: {
        type: "object",
        properties: {
          fecha: {
            type: "string",
            description: "Fecha YYYY-MM-DD opcional (default hoy, zona America/Argentina).",
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
      name: "consultar_agenda_economica",
      description:
        "Agenda ECONÓMICA curada de la semana: eventos con hora, relevancia alta/media/baja (BCRA licitaciones LECAP, INDEC IPC/EMAE, FOMC Fed, Tesoro USA, vencimientos). Calculada para la fecha pedida o semana en curso. Usar para 'qué hay en agenda hoy', 'eventos de esta semana', 'calendario económico'.",
      parameters: {
        type: "object",
        properties: {
          fecha: {
            type: "string",
            description: "Fecha YYYY-MM-DD opcional para filtrar la semana (default hoy).",
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
      name: "generar_senales_cedear",
      description:
        "Señales CEDEARs/ACCIONES BCBA: mapea subyacente NYSE/NASDAQ, trae precios BCBA+US y genera señales contextuales (liquidos / en noticias hoy / top movers / todos). Usa yfinance + screeners + noticias reales. Para 'señales cedear', 'qué cedears hoy', 'acciones BCBA señal'.",
      parameters: {
        type: "object",
        properties: {
          filtro: {
            type: "string",
            enum: ["liquidos", "noticias", "movers", "todos"],
            description: "Criterio: liquidos (volumen), noticias (en noticias hoy), movers (mayor variación), todos (mix). Default todos.",
          },
          topN: {
            type: "number",
            description: "Cantidad de señales (1-15, default 6).",
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
      name: "analizar_portfolio_pegado",
      description:
        "AUTO-DETECCION al pegar portfolio IOL: parsea texto con Patrimonio total, Tenencias, Cedears/Acciones con tickers, cantidades, montos ARS, variaciones. Clasifica cada activo por tipo/moneda/mercado usando unificado_completo.json + cedears-universe (replica Optimizador tab). Para cualquier paste con 'PAMP', 'AMZN', 'ARS', 'Cedears'. Ejecutar inmediatamente sin pedir confirmacion.",
      parameters: {
        type: "object",
        properties: {
          texto: {
            type: "string",
            description: "Texto completo pegado del portfolio IOL (incluir todo el bloque con tickers y montos).",
          },
        },
        required: ["texto"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_opciones_completo",
      description:
        "Análisis completo de opciones BYMA/BCBA con Black-Scholes, griegas (Delta Gamma Theta Vega Rho), volatilidad implícita (Newton-Raphson), Monte Carlo 10k paths (Euler GBM), histograma, sonrisa IV vs strike, prob ITM/profit vs strike. Genera tabla Strike|Prima|BS|IV|Delta|Gamma|ProbITM + gráficos sonrisa, Monte Carlo hist, BS. Usa yfinance/IOL para spot y cadena, Labadie Options para BS. Para 'opciones GGAL', 'GGAL 5700 2026-03-11 Call'.",
      parameters: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description: "Ticker subyacente, ej GGAL.BA, GGAL, PAMP.BA",
          },
          strike: {
            type: "number",
            description: "Strike de la opción, ej 5700",
          },
          vencimiento: {
            type: "string",
            description: "Fecha vencimiento YYYY-MM-DD, ej 2026-03-11. Si no se da, usa 3 meses.",
          },
          tipo: {
            type: "string",
            enum: ["Call", "Put"],
            description: "Tipo de opción Call/Put, default Call",
          },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_tir_bono",
      description:
        "Calcula TIR/TEM/TNA real de un bono argentino desde RENTA_FIJA_COMPLETA.json + precio vivo IOL (usa credenciales harcodeadas boosandr97@gmail.com si no hay sesión del usuario). Lee flujo_fondos, aplica Newton-Raphson ACT/365, convierte precio ARS→USD vía CCL para hard dollar. Para 'TIR de AL30', 'YTM de GD30', 'rendimiento de AE38', 'TIR del Bonar 2030'. Devuelve TIR anual, TEM, TNA, precio, CCL, flujos y gráfico.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker del bono (ej. AL30, GD30, AE38, GD38, AL35, GD29, AL30D)" },
          precioManual: { type: "number", description: "Precio manual opcional (si no, fetchea de IOL bCBA)" },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generar_senal_unificada",
      description:
        "MOTOR UNIFICADO CORONAR — Señal de compra/venta para 1 ticker con orquestación estricta 4 capas: 1) Intermarket (Pring/Stovall 6 etapas + contexto macro BCRA/CriptoYa, metodología pt/Pascale-Blanchard) → 2) Fundamental (gate cualitativo 5.0 + ficha DCF/múltiplos/libro, Pascale/Elbaum) → 3) Técnico (semaforo RSI14/MACD/SMA20-50-200 + soporte/resistencia) → 4) Cuantitativo (Sharpe/VaR/CAPM beta/Hurst). Usa unificado_completo.json como universo. Devuelve COMPRA/COMPRA CON CAUTELA/MANTENER/REDUCIR/VENTA con score 0-10, confianza 0.50-0.85, precio, stops y motivo con las 4 capas citadas. Para 'señal de GGAL', 'analizá GGAL completa', 'comprar o vender YPF'.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker a analizar (ej. 'GGAL.BA', 'YPF', 'AAPL', 'MELI', 'PAMP.BA').",
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
      name: "generar_senales_unificadas",
      description:
        "MOTOR UNIFICADO CORONAR — Batch de señales para N tickers (universo unificado_completo.json). Ejecuta en lotes de 3 el pipeline 4 capas (Intermarket → Fundamental → Técnico → Cuantitativo) y devuelve topN ordenado por scoreTotal. Para 'señales de hoy', 'qué comprar hoy', 'top 6 señales', 'señales CEDEARs unificadas', 'armá la cartera del día'.",
      parameters: {
        type: "object",
        properties: {
          simbolos: {
            type: "array",
            items: { type: "string" },
            description: "Lista de tickers (ej. ['GGAL.BA','YPF','PAMP.BA','AAPL']). Si vacío, usa top líquidos + rotación sectorial.",
          },
          topN: { type: "number", description: "Cuántas señales devolver ordenadas por score (1-15, default 6)." },
          filtro: {
            type: "string",
            enum: ["todos", "solo_compras"],
            description: "Filtra solo señales compradoras o todas. Default todos.",
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
      name: "telegram_enviar_senal",
      description:
        "PUBLICA una señal en el canal de inversores vía @Coronarinversiones777_bot (bot de salida). Con solo el ticker genera la señal unificada 4 capas y la publica sola con formato institucional + gráfico TradingView como adjunto (líneas Entrada/SL/TP1/TP2 anotadas). Si pasás señal explícita, publica ese texto directo. Usar para 'enviá la señal de GGAL', 'publicá esta señal en Telegram', 'mandala al canal'. Ejecuta sin pedir confirmación ni chat_id.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker (ej. 'GGAL.BA', 'YPF', 'AAPL')." },
          senal: {
            type: "string",
            description:
              "Opcional: COMPRA | COMPRA CON CAUTELA | MANTENER | REDUCIR | VENTA. Si se omite, se genera con el motor unificado 4 capas antes de publicar.",
          },
          precio: { type: "number", description: "Precio actual opcional (solo con señal explícita)." },
          variacion1d: { type: "number", description: "Variación % diaria opcional." },
          motivo: { type: "string", description: "Motivo breve opcional (score, RSI, cataliza)." },
          chatId: { type: "string", description: "Chat destino opcional; default canal de señales configurado." },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "telegram_enviar_mensaje",
      description:
        "PUBLICA texto libre en el canal de inversores vía @Coronarinversiones777_bot (bot de salida, formato HTML, máx 4000 chars). Usar para 'publicá el resumen en el canal', 'avisale a los inversores que...'. Ejecuta sin pedir confirmación ni chat_id.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Texto HTML (<b>, <i>, <code>) a publicar." },
          chatId: { type: "string", description: "Chat destino opcional; default canal de señales." },
        },
        required: ["text"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_ytm_bono",
      description:
        "Calcula YTM/TIR real de un bono argentino usando RENTA_FIJA_COMPLETA.json (flujo_fondos = condiciones de emisión) + precio de cotización (cadena automática: sesión IOL → credenciales guardadas → especie hermana → último cierre persistido). Si el precio está a mano (el usuario lo dio, ej 'calcula la TIR de AL30 con precio 76250'), pasalo en 'precio' y el cálculo es inmediato. Método Newton-Raphson ACT/365. Devuelve TIR anual, TEM, TNA, precio usado con su fecha y flujos futuros.",
      parameters: {
        type: "object",
        properties: {
          ticker: {
            type: "string",
            description: "Ticker del bono (ej. AL30, GD30, AL35, AE38, GD29, TX26, etc. — sin sufijo D/C si es especie Pesos)",
          },
          precio: {
            type: "number",
            description: "Precio OPCIONAL por cada 100 VN en la moneda de cotización del ticker (AL30 en ARS ej 76250; AL30D en USD ej 62.5). Usarlo si el usuario lo indicó o si la fuente automática no está disponible; el resultado aclara que se calculó con ese precio.",
          },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_curva_etti",
      description:
        "ETTI soberana: curva spot (AL30/GD30/AE38/GD35/AL35/GD38/AL41/GD41) con TIR/TEA por vencimiento, forma de curva (normal/plana/invertida/jorobada/oscilante) y forwards implícitos entre tramos. Metodología Elbaum U4. Para 'curva ETTI', 'curva spot soberana', 'forwards implícitos', 'forma de la curva', 'pendiente de la curva'.",
      parameters: {
        type: "object",
        properties: {
          tickers: {
            type: "array",
            items: { type: "string" },
            description: "Tickers soberanos a incluir (default soberanos AL30/GD30/AE38/GD35/AL35/GD38/AL41/GD41/GD46).",
          },
          fechaLiquidacion: { type: "string", description: "Fecha liquidación YYYY-MM-DD (default T+1)." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_yield_call",
      description:
        "Yield to Call / Yield to Worst de un bono con opción de rescate anticipado. Calcula YTM y YTC para cada call (fecha+precio) y el YTW = min(YTM,YTCs). Para 'yield to call de AL30', 'YTW', 'bono callable', 'rescate anticipado', 'yield to worst'.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker del bono (ej. AL30, GD30, AE38)." },
          precioPorCada100VN: { type: "number", description: "Precio clean por 100 VN (si no, usa precio vivo IOL)." },
          calls: {
            type: "array",
            items: { type: "object", properties: { fecha: { type: "string" }, precio: { type: "number" } }, required: ["fecha", "precio"] },
            description: "Schedule de calls [{fecha:'YYYY-MM-DD',precio:100}, ...]. Si no se pasa y no hay en bonos.json, solo devuelve YTM.",
          },
          fechaLiquidacion: { type: "string", description: "Fecha liquidación YYYY-MM-DD." },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_total_return",
      description:
        "Total Return de un bono con horizonte y reinversión de cupones: valor total (precio al horizonte + cupones reinvertidos a TEA dada), TR y TR anualizado. Metodología Elbaum U4. Para 'total return de GD30 a 1 año', 'holding period return', 'reinversión de cupones'.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker del bono." },
          horizonteDias: { type: "number", description: "Horizonte en días (1-3650, default 365)." },
          precioPorCada100VN: { type: "number", description: "Precio clean inicial (si no, vivo IOL)." },
          tasaReinversionTEA: { type: "number", description: "TEA reinversión 0.25=25% (default 0.25)." },
          fechaLiquidacion: { type: "string", description: "Fecha liquidación YYYY-MM-DD." },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_stripped_yield",
      description:
        "Stripped yield / bootstrapping: curva zero por cupón (un stripped por flujo) vía precio del bono. Para 'stripped yield de AL30', 'curva zero', 'bootstrapping', 'zero por cupón'.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker del bono." },
          precioPorCada100VN: { type: "number", description: "Precio clean (si no, vivo IOL)." },
          fechaLiquidacion: { type: "string", description: "Fecha liquidación YYYY-MM-DD." },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_semaforo_riesgo_bono",
      description:
        "Semáforo de riesgos por bono Elbaum U4: 6 factores (tasa/duration, reinversión cupón, downgrade/ley, iliquidez volumen, FX, inflación/CER) con niveles 1-5 y semáforo VERDE/AMARILLO/NARANJA/ROJO. Usa BONOS_DB unificada + volumen + duración. Para 'riesgo de AL30', 'semáforo de GD30', 'qué riesgo tiene AE38'.",
      parameters: {
        type: "object",
        properties: {
          ticker: { type: "string", description: "Ticker del bono (ej. AL30, GD30, TX26)." },
          precioPorCada100VN: { type: "number", description: "Precio clean (si no, vivo IOL)." },
        },
        required: ["ticker"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_tir_portafolio",
      description:
        "TIR/TEA/TNA y duration ponderada de un portafolio RF: valoriza cada bono con TIR viva (renta-fija.functions) y pondera por valorMercado, con composición por tipo/moneda. Incluye % con TIR y TR agregada opcional con horizonte. Para 'TIR de mi cartera RF', 'rendimiento de mi portafolio de bonos', 'qué TIR tiene mi cartera'.",
      parameters: {
        type: "object",
        properties: {
          posiciones: {
            type: "array",
            items: { type: "object", properties: { ticker: { type: "string" }, cantidad: { type: "number" }, precioPorCada100VN: { type: "number" } }, required: ["ticker", "cantidad"] },
            description: "Posiciones [{ticker,cantidad,precioPorCada100VN?}] nominal VN.",
          },
          horizonteDias: { type: "number", description: "Horizonte para TR agregada (1-3650)." },
          tasaReinversionTEA: { type: "number", description: "TEA reinversión 0.25=25%." },
        },
        required: ["posiciones"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "predecir_direccion",
      description:
        "Predicción ML Labadie 05 — Logistic/Ridge/NN + walk-forward sobre 15 features (returns, vol, spread, RSI, MACD, BB). Llama POST localhost:5000/api/prediccion. Devuelve probabilidad dirección, umbral óptimo, CV/test/walk-forward accuracies, feature-importance y decisión Call/Put con strike. GUARDRAILS: si wf_acc < 0.55 o regla_oro_ok=false → responder 'modelo sin ventaja predictiva verificada' (anti-alucinación cuantitativa). Para 'predicción GGAL', 'dirección de YPF', 'probabilidad de suba'.",
      parameters: {
        type: "object",
        properties: {
          simbolo: { type: "string", description: "Ticker BCBA/CEDEAR (ej. GGAL.BA, YPF, PAMP.BA, BMA.BA)." },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analizar_opciones",
      description:
        "Cadena de opciones BCBA — llama POST /api/opciones/cadena. Devuelve tabla strikes con IV/griegas/VaR, gráfico smile/skew OTM y señal→estrategia. INTERPRETACIÓN: skew puts>calls = sesgo bajista (Bustamante: dato→interpretación→implicancia). Para 'opciones GGAL', 'cadena GGAL.BA', 'smile GGAL'.",
      parameters: {
        type: "object",
        properties: {
          simbolo: { type: "string", description: "Ticker subyacente BCBA (ej. GGAL.BA, PAMP.BA, COME.BA)." },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analisis_completo",
      description:
        "PIPELINE MAESTRO F0→F10 — Análisis financiero COMPLETO de un ticker siguiendo la jerarquía metodológica coronar bases/pt (Blanchard/Dornbusch → Fowler/Biondi → Dumrauf → Pascale/Alonso → Sectores → Elbaum/CAPM → Renta Fija → Dunbar/Black-Scholes → Labadie Quant → Ejecución+Perfil). Ejecuta EN ORDEN: (F0) contexto macro ampliado (BCRA v4: Badlar, reservas, base monetaria, circulante, TC oficial histórico + ArgentinaDatos + CriptoYa + SPY/DXY/TNX) + ciclo intermarket 6 etapas, (F1) fundamental cualitativo 6D con gate >=5.0 + 15 ratios M1-M15 con alertas, (F2) cálculo financiero (VAN/TIR/YTM), (F3) valuación triangulada DCF+múltiplos+APV con WACC CAPM+riesgo país+size, (F4) sectorial score+benchmarks+industria, (F5+F6) CAPM/factores/riesgo/distribución + cobertura, (F7) renta fija ETTI si es bono, (F8) opciones BCBA si tiene cadena, (F9) quant pairs/stat-arb si aplica, (F10) ficha de decisión con MOS calibrado y notas de consistencia + (T) validación transversal determinística anti-alucinación. Para 'haceme el análisis completo de GGAL', 'analizá YPF completa', 'ficha coronar de AAPL', 'valuación integral de MELI'. Acepta ticker o nombre; si es .BA calibra a ARS con Fisher.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker o nombre del activo (ej. 'GGAL.BA','YPF','AAPL','MELI','AL30').",
          },
          incluirOpciones: {
            type: "boolean",
            description: "Si true incluye F8 cadena de opciones BCBA (default true si subyacente BCBA).",
          },
          incluirQuant: {
            type: "boolean",
            description: "Si true incluye F9 señales quant adicionales (default true).",
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
      name: "validar_analisis",
      description:
        "VALIDACIÓN TRANSVERSAL T — Suite determinística pre-publicación (recicla validar.py): verifica coherencia del análisis completo antes de reportar al cliente. Checks: total declarado vs suma serie, mos coherente con score cualitativo, Deuda/EBITDA>4, PN<0, margen<0, capital trabajo<0, beta/WACC faltante, VIX/DXY desalineado, triangulación sin rango, semáforo técnico vs fundamental contradictorio sin advertencia. Para usar como gate final del pipeline F0-F10.",
      parameters: {
        type: "object",
        properties: {
          simbolo: {
            type: "string",
            description: "Ticker validado (ej. 'GGAL.BA').",
          },
          payload: {
            type: "string",
            description: "JSON string del resultado de analisis_completo a validar (opcional).",
          },
        },
        required: ["simbolo"],
        additionalProperties: false,
      },
    },
  },
  // -------------------------------------------------------------------------
  // CRYPTO QUANT (port de trading_bots_unificado — Labadie sobre Binance futures)
  // -------------------------------------------------------------------------
  {
    type: "function",
    function: {
      name: "walkforward_bb_rsi",
      description:
        "WALK-FORWARD de la estrategia BB+RSI Scalping 5m sobre futuros Binance (port de bb_rsi_scalper/walkforward.py): ventanas rodantes TRAIN→TEST; en cada TRAIN optimiza un grid de 12 combos (RSI oversold/overbought × TP) por expectancia con mínimo de trades y aplica los params ganadores al TEST inmediato fuera de muestra. Devuelve folds IS vs OOS y el AGREGADO OUT-OF-SAMPLE (la única métrica válida) + veredicto de sobreajuste por decaimiento de expectancia. Para '¿el WR 80% de BTCUSDT es real o sobreajustado?', 'walk-forward de la BB+RSI', 'validá la estrategia scalping'.",
      parameters: {
        type: "object",
        properties: {
          simbolo: { type: "string", description: "Par de futuros Binance (default BTCUSDT)." },
          dias: { type: "number", description: "Histórico total 5m (90-180, default 135)." },
          trainDias: { type: "number", description: "Ventana de entrenamiento (default 30)." },
          testDias: { type: "number", description: "Ventana de test OOS rodante (default 15)." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "mm_inventario_sim",
      description:
        "Simulación MARKET-MAKING con control de inventario sobre klines 1m de futuros Binance (Avellaneda-Stoikov / Fodra-Labadie, port de metodologias/mm_inventory.py): precio de reserva r = S(1+Δ)(1−skew·q·σ²), spread ψ_bps = ψ_min + 2α + vol·|q|·σ, fills cuando la vela toca bid/ask. Modo grid: 64 combos optimizados en TRAIN 60% y validados OOS 40%. Devuelve PnL USDT, fills, PnL/fill en bps, Sharpe anualizado por minuto, MaxDD e inventario final. Para '¿renta el market-making en BTC?', 'simulá Avellaneda-Stoikov', 'spread óptimo market maker'.",
      parameters: {
        type: "object",
        properties: {
          simbolo: { type: "string", description: "Par de futuros (default BTCUSDT)." },
          dias: { type: "number", description: "Días de velas 1m (5-30, default 10)." },
          grid: { type: "boolean", description: "true = optimiza 64 combos train/OOS (default false = simulación base)." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ejecucion_optima_crypto",
      description:
        "EJECUCIÓN ÓPTIMA Almgren-Chriss vs TWAP vs naive sobre futuros Binance (port de metodologias/optimal_execution.py): impacto h(v)=σ√steps·(v/V)^γ con γ=0.5, métrica Implementation Shortfall en bps para una COMPRA de notional dado en un horizonte de minutos, κ elegido por ventana en grid (0.005-0.1). Devuelve IS medio/std/funcional J(λ=0.5) por ejecutor, % de ventanas donde cada uno gana al naive y veredicto. Para 'cómo ejecuto una orden grande de BTC', 'AC vs TWAP', 'impacto de mercado crypto'.",
      parameters: {
        type: "object",
        properties: {
          simbolo: { type: "string", description: "Par de futuros (default BTCUSDT)." },
          horizonteMin: { type: "number", description: "Horizonte de ejecución en minutos (default 60)." },
          notionalUsdt: { type: "number", description: "Tamaño de la orden en USDT (default 100000)." },
          dias: { type: "number", description: "Historia de velas 1m para las ventanas (default 20)." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pairs_crypto_scan",
      description:
        "ESCÁNER de cointegración entre los perps USDT más líquidos de Binance (port de scan_cointegration.py + pairs_trading/scanner.py): descarga klines alineadas por timestamp, calcula correlación de retornos log y Engle-Granger proxy (OLS beta + ADF de residuos) para todos los pares, devuelve los top ordenados por p-value ascendente. Para 'qué pares crypto están cointegrados', 'buscá pares stat-arb Binance'.",
      parameters: {
        type: "object",
        properties: {
          topN: { type: "number", description: "Cantidad de perps top por volumen a incluir (10-20, default 15)." },
          intervalo: { type: "string", description: "'15m' o '1h' (default 1h)." },
          dias: { type: "number", description: "Historia (14-30, default 30)." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "pairs_crypto_analizar",
      description:
        "ANÁLISIS STAT-ARB de un PAR de cripto sobre futuros Binance (motor unificado port de pairs_trading/engine.py): hedge ratio rolling_ratio_mean | cointegration_static (β OLS + ADF residuos), z-score del spread con bandas de entrada/salida (zscore_band) o cruce de media con stop-loss y timeout (mean_cross_with_stop), backtest completo neto de comisiones + split In-Sample 70%/Out-of-Sample 30% con robustez. Para 'analizá el par BTC/ETH', 'está cointegrado SOL con BNB', 'stat-arb crypto'.",
      parameters: {
        type: "object",
        properties: {
          simboloA: { type: "string", description: "Primer perp (ej. 'BTCUSDT')." },
          simboloB: { type: "string", description: "Segundo perp (ej. 'ETHUSDT')." },
          hedgeRatioMethod: { type: "string", description: "'rolling_ratio_mean' (default) o 'cointegration_static'." },
          exitMethod: { type: "string", description: "'zscore_band' (default) o 'mean_cross_with_stop'." },
          intervalo: { type: "string", description: "'15m' o '1h' (default 1h)." },
          dias: { type: "number", description: "Historia (30-90, default 60)." },
        },
        required: ["simboloA", "simboloB"],
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
    case "iol_asesor":
      return "iol";
    case "analisis_tecnico":
      return "semaforo";
    case "analizar_portafolio_clarity":
      return "portafolio";
    case "score_sectorial":
      return "portafolio";
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
    case "pairs_trading_labadie":
      return "portafolio";
    case "curva_ejecucion_labadie":
      return "portafolio";
    case "consultar_cierre_mercado":
    case "generar_informe_matutino":
      return "informe";
    case "consultar_agenda_economica":
      return "mercado";
    case "generar_senales_cedear":
      return "mercado";
    case "analizar_portfolio_pegado":
      return "portafolio";
    case "analizar_opciones_completo":
      return "valoracion";
    case "calcular_tir_bono":
    case "calcular_ytm_bono":
      return "valoracion";
    case "consultar_curva_etti":
    case "calcular_yield_call":
    case "calcular_total_return":
    case "calcular_stripped_yield":
    case "consultar_semaforo_riesgo_bono":
    case "calcular_tir_portafolio":
      return "valoracion";
    case "generar_senal_unificada":
    case "generar_senales_unificadas":
      return "portafolio";
    case "predecir_direccion":
      return "portafolio";
    case "analizar_opciones":
      return "valoracion";
    case "analisis_completo":
      return "valoracion";
    case "validar_analisis":
      return "valoracion";
    case "walkforward_bb_rsi":
    case "mm_inventario_sim":
    case "ejecucion_optima_crypto":
    case "pairs_crypto_scan":
    case "pairs_crypto_analizar":
      return "portafolio";
    case "telegram_enviar_grafico":
    case "publicar_slide_mercado":
    case "publicar_oportunidades":
      return "informe";
    default:
      return "searching";
  }
}

export const NOMBRE_HERRAMIENTAS = TOOLS.map((t) => t.function.name);
