# Skill: Renta Fija Completa (Elbaum Cap 10)

## ID
`elbaum-renta-fija`

## Nombre
Renta Fija Completa — Elbaum

## Descripción
Análisis completo de renta fija según Elbaum Cap 10. Duration, convexidad, DV01, bootstrapping, IPD, GS-ESS, curva argentina y covenants.

## Cuándo usar
- Analizar bonos argentinos (pesos, Globales, provinciales)
- Calcular sensibilidad de precios a cambios en tasas
- Evaluar riesgo de default implícito (IPD)
- Comparar spreads vs equilibrio (GS-ESS)
- Ajustar curva de rendimientos argentina
- Evaluar covenants de emisoras

## Instrucciones
[SKILL · Renta Fija Completa — Elbaum Cap 10]

### REGLAS CENTRALES (análisis de renta fija profesional)

1. **SENSIBILIDAD DE PRECIO: DURATION + CONVEXIDAD**
   - Duration modificada mide sensibilidad lineal: ΔP/P ≈ -Dmod·Δy
   - Convexidad captura curvatura: ΔP/P ≈ -Dmod·Δy + 0.5·Convexidad·(Δy)²
   - Para cambios grandes en tasas (>100bps), incluir convexidad.
   - DV01 = P·Dmod·0.0001 (cambio en precio por 1bp).

2. **ARBITRAJE POR DV01**
   - Ratio DV01 = DV01_1 / DV01_2
   - Nominales para hedge: N2 = N1 × (DV01_1 / DV01_2)
   - Usar para construir portfolios inmunizados o estrategias de carry trade.

3. **BOOTSTRAPPING DE CURVA SPOT**
   - Construir curva spot desde bonos cupón cero.
   - Calcular tasas forward implícitas: f(t1,t2) = [(1+z2)^t2/(1+z1)^t1]^(1/(t2-t1)) - 1
   - La curva spot es base para valoración de cualquier instrumento de renta fija.

4. **PROBABILIDAD DE DEFAULT IMPLÍCITA (IPD)**
   - IPD = [S(1+r)]/[S(1+r)+(1+r-R)]
   - S = spread, r = tasa libre de riesgo, R = tasa de recupero (Argentina ≈ 20.8%)
   - IPD > 50% indica alto riesgo de default.

5. **SPREAD DE EQUILIBRIO (GS-ESS)**
   - Spread eq = -691.3·GROWTH + 165·DEFAULT + 500 (coeficientes Elbaum)
   - Comparar spread actual vs equilibrio: caro/barato/fair.
   - Usar para detectar oportunidades relativas en bonos.

6. **CURVA ARGENTINA**
   - TIR = a + b·ln(Duration) (regresión log-lin)
   - Agrupar títulos por tipo (pesos/Globales/provinciales).
   - R² > 0.8 indica buen ajuste de la curva.

7. **COVENANTS**
   - EBITDA/Deuda ≥ 6.5×, Cobertura ≥ 1.75×, Liquidez ≥ 1×
   - Alerta si 1+ covenant en rojo, warning si 1+ en amarillo.
   - Monitorear trimestralmente para riesgo de refinanciación.

### FUNCIONES DISPONIBLES (src/lib/renta-fija/ons-tir-engine.ts)

- **Sensibilidad**: `convexidad(flows, tir, valuation, freq)`, `variacionTotal(dMod, convexidad, deltaY)`, `dv01(precio, dMod)`
- **Arbitraje**: `arbitrajeDV01(dv01_1, dv01_2, nominal1)`
- **Curva**: `bootstrapCurva(bonos)`, `curvaArgentina(titulos)`
- **Riesgo**: `ipd(spread, tasaLibreRiesgo, recupero)`, `gseessSpreadEquilibrio(crecimiento, defaultProb, spreadActual)`
- **Covenants**: `evaluarCovenants(ebitda, deudaTotal, ebit, gastoInteres, activoCorriente, pasivoCorriente)`
- **Base**: `calcularRendimientosON(flows, precio, valorResidual, freq, valuation)` (TIR, TEA, TNA, duration)

### EJECUTOR PRINCIPAL

Cuando el usuario pida análisis de renta fija:

1. Recolectar datos del bono:
   - Flujos de caja (cupones + amortización)
   - Precio actual (USD par 100)
   - TIR, TEA, TNA (calcular con calcularRendimientosON)
   - Duration Macaulay y modificada

2. Análisis de sensibilidad:
   - Calcular convexidad
   - Calcular DV01
   - Simular variación de precio para ±100bps

3. Análisis de riesgo:
   - Calcular IPD (si es bono soberano o corporativo con spread)
   - Comparar spread vs equilibrio GS-ESS
   - Evaluar covenants (si es corporativo)

4. Análisis de curva:
   - Si hay múltiples bonos, ajustar curva argentina
   - Calcular tasas forward implícitas

5. Responder con:
   - TIR, TEA, duration, convexidad
   - DV01 y sensibilidad a cambios de tasa
   - IPD y clasificación de riesgo
   - Comparación spread vs equilibrio
   - Covenants (si aplica)
   - Recomendación de inversión

### GUARDRAILS

- Si faltan flujos de caja, pedirlos explícitamente (ticker, cupón, vencimiento).
- Para bonos en pesos, convertir precio a USD usando MEP.
- Si el spread no está disponible, usar EMBI+ regional como proxy.
- Para covenants, si no hay estados contables, pedir balance y estado de resultados.
- Nunca recomendar bonos sin verificar el riesgo de default (IPD).

### INTEGRACIÓN CON DATOS

- **Flujos de bonos**: RENTA_FIJA_COMPLETA.json (manual) o IOL API (cuotas/cupones).
- **Precios**: IOL `/api/v2/Cotizaciones/{ticker}` o yfinance para bonos listados.
- **Tasas USA**: yfinance ^TNX (10y), ^TYX (30y).
- **EMBI/riesgo país**: ArgentinaDatos `/v1/finanzas/indices/riesgo-pais` o hardcodear serie.
- **Estados contables**: yfinance .BA (balance_sheet, income_statement) - limitado en Argentina. Solución: JSON manual por empresa.

### CASOS DE USO TÍPICOS

- "¿Cuál es la TIR del GD30?" → Usar calcularRendimientosON con flujos del GD30.
- "¿Cuánto cae el GD30 si suben las tasas 100bps?" → Usar variacionTotal con dMod y convexidad.
- "¿Cuál es el DV01 del AL30?" → Usar dv01(precio, dMod).
- "¿Cuál es la probabilidad de default del GD30?" → Usar ipd(spread, tasaUSA).
- "¿El GD30 está caro o barato?" → Usar gseessSpreadEquilibrio.
- "¿Cómo están los covenants de YPF?" → Usar evaluarCovenants con estados contables.
- "Ajustar la curva de bonos en pesos" → Usar curvaArgentina con array de títulos.

### ORQUESTACIÓN EN INFORME SEMANAL

Este agente corre DESPUÉS del contexto macro. Su salida alimenta la sección "renta fija" del informe:

1. **Sensibilidad** → base para análisis de carry trade.
2. **IPD** → afecta clasificación de riesgo de bonos.
3. **Curva** → detecta anomalías de valuación.
4. **Covenants** → alerta sobre riesgo corporativo.

El redactor del informe usa este análisis para recomendar posiciones en renta fija.
