# Skill: Indicadores Económicos y Riesgo País (Elbaum Cap 5)

## ID
`macro-latam-ciclo-extendido`

## Nombre
Indicadores Económicos y Riesgo País — Elbaum

## Descripción
Metodología editorial del Global Weekly Report según Elbaum Cap 5. Cuadro de signos del riesgo país, criterios de calidad de indicadores, reglas de política monetaria y matriz de contagio.

## Cuándo usar
- Generar el bloque "contexto" del informe semanal
- Analizar el riesgo país basado en variables macro
- Evaluar la postura de política monetaria
- Detectar riesgos de contagio entre mercados
- Diagnosticar tensiones macroeconómicas en Argentina/Latam

## Instrucciones
[SKILL · Indicadores Económicos y Riesgo País — Elbaum Cap 5]

### REGLAS CENTRALES (metodología editorial Global Weekly Report)

1. **CUADRO DE SIGNOS DEL RIESGO PAÍS (Tabla 5-3)**
   - Analizar 7 variables clave: crecimiento, inflación, déficit comercial, déficit fiscal, desempleo, reservas, tasa USA.
   - Cada variable tiene un signo (+/0/-) según umbrales específicos de Elbaum.
   - Calcular score total ponderado por relevancia de cada variable.
   - Interpretación: score > 30% → riesgo bajo, score < -30% → riesgo alto, intermedio → moderado.

2. **CRITERIOS DE CALIDAD DE INDICADOR**
   - Relevancia (1-10): importancia económica del indicador.
   - Timing (1-10): frecuencia de publicación y actualidad.
   - Confiabilidad (1-10): calidad de la fuente y metodología.
   - El impacto del riesgo país se ajusta por la calidad promedio del indicador.

3. **REGLAS DE POLÍTICA MONETARIA**
   - PBI anualizado >3% → postura expansiva.
   - PBI anualizado <2% → postura contractiva.
   - Entre 2% y 3% → postura neutra.
   - Detectar contradicciones (ej: política expansiva con inflación alta).

4. **MATRIZ DE CONTAGIO**
   - Usar correlación de Pearson entre series de tiempo de diferentes mercados.
   - |r| > 0.7 → fuerte correlación (alto contagio).
   - |r| > 0.4 → correlación moderada.
   - |r| < 0.4 → correlación débil (bajo contagio).

### FUNCIONES DISPONIBLES (src/lib/macro/indicadores-economico.functions.ts)

- **Cuadro de signos**: `cuadroSignosRiesgoPais(crecimiento, inflacion, deficitComercial, deficitFiscal, desempleo, reservas, tasaUSA)`
- **Impacto con calidad**: `impactoRiesgoPais(variable, valor, umbral, metadatos)`
- **Política monetaria**: `politicaMonetaria(pbiTrimestral, pbiTrimestralAnterior)`
- **Matriz de contagio**: `calcularMatrizContagio(datos)` (usa pearsonR de stats.ts)
- **Ejecutor principal**: `ejecutarContextoMacroSemana(input)`

### EJECUTOR PRINCIPAL

Cuando el usuario pida análisis macro o contexto del informe semanal:

1. Recolectar datos:
   - Crecimiento PBI (INDEC/ArgentinaDatos)
   - Inflación IPC (INDEC)
   - Déficit comercial y fiscal (INDEC, Ministerio Economía)
   - Desempleo (INDEC)
   - Reservas internacionales (BCRA v4)
   - Tasa USA 10y (yfinance ^TNX)
   - PBI trimestral actual y anterior (INDEC)

2. Ejecutar `ejecutarContextoMacroSemana(input)` con los datos recolectados.

3. Responder con:
   - Cuadro de signos del riesgo país (tabla con indicadores, signos, pesos)
   - Score total e interpretación del riesgo país
   - Postura de política monetaria con justificación
   - Matriz de contagio (si hay datos de series temporales)
   - Resumen ejecutivo del contexto macro
   - Recomendaciones y alertas según los indicadores

### GUARDRAILS

- Si faltan datos críticos (reservas, inflación), pedirlos explícitamente antes de calcular.
- Para el cuadro de signos, usar los umbrales de Elbaum (no modificar sin justificación).
- Si hay contradicciones (ej: política expansiva con inflación >30%), alertar explícitamente.
- Nunca inventar datos macro; si la API no responde, informar la limitación.
- La matriz de contagio requiere series de tiempo; si no hay datos, omitir esa sección.

### INTEGRACIÓN CON DATOS

- **BCRA v4**: Reservas internacionales, base monetaria, tasas de referencia. Endpoint: `/estadisticas/v4.0/PrincipalesVariables` por idVariable.
- **INDEC**: PBI, EMAE, IPC, desempleo, comercio exterior. Ya implementado en `informe-matutino/indec.functions.ts`.
- **ArgentinaDatos**: PBI, inflación, tipo de cambio. Ya implementado en `api/argentinadatos.ts`.
- **yfinance**: ^TNX (Treasury 10y), ^TYX (Treasury 30y) para tasas USA.
- **EMBI/riesgo país AR**: No hay API directa en el pack. Proxy: ETF EMB (JPM EM Bond) vía yfinance + scrape de riesgopais.ar/rava, o hardcodear serie histórica.

### CASOS DE USO TÍPICOS

- "¿Cuál es el riesgo país actual de Argentina?" → Usar cuadro de signos.
- "¿Cuál es la postura de política monetaria del BCRA?" → Usar políticaMonetaria.
- "¿Hay riesgo de contagio entre mercados?" → Usar calcularMatrizContagio.
- "Generar el contexto macro para el informe semanal" → Usar ejecutarContextoMacroSemana.
- "¿Hay alertas macroeconómicas esta semana?" → Revisar recomendaciones del ejecutor.

### ORQUESTACIÓN EN INFORME SEMANAL

Este agente corre PRIMERO en el orquestador del informe semanal. Su salida condiciona todas las demás secciones:

1. **Contexto macro** → base para análisis de renta fija, equity, commodities.
2. **Riesgo país** → afecta valoración de bonos y acciones argentinas.
3. **Política monetaria** → impacta tasas de interés y carry trade.
4. **Contagio** → alerta sobre propagación de shocks regionales.

El redactor del informe usa este contexto para ajustar el tono y énfasis de las demás secciones.
