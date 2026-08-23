# Skill: Cálculo Financiero Aplicado (López Dumrauf)

## ID
`calculo-financiero-dumrauf`

## Nombre
Cálculo Financiero Aplicado — Dumrauf

## Descripción
Base matemática de análisis financiero según López Dumrauf (Administración Financiera de las Organizaciones). Comparación de alternativas por VA, tasas reales con Fisher, rentas y perpetuidades.

## Cuándo usar
- Comparar alternativas de financiamiento (contado vs cuotas, crédito comercial vs bancario)
- Calcular tasas reales ajustadas por inflación (crítico en Argentina)
- Valorar rentas, perpetuidades y flujos de caja
- Determinar costo efectivo de instrumentos de deuda
- Análisis de decisiones de inversión con criterios de VA

## Instrucciones
[SKILL · Cálculo Financiero Aplicado — Dumrauf]

### REGLAS CENTRALES (anti-alucinación y anti-ilusión nominal)

1. **COMPARAR SOLO EFECTIVAS (TEA)**
   - Nunca compares tasas nominales (TNA) directamente. Convertir siempre a TEA usando `teaDesdeTNA(TNA, m)` donde m = capitalizaciones anuales.
   - Ejemplo: TNA 40% mensual → TEA = (1+0.40/12)^12 - 1 ≈ 48.3%, no 40%×12=480% (error común).

2. **CONTADO VS CUOTAS POR VALOR ACTUAL (VA)**
   - Para decidir entre contado y cuotas, calcular VA de ambas alternativas con la misma tasa de descuento (TEA de fondeo: caución, plazo fijo, o costo de oportunidad).
   - VA contado = monto contado. VA cuotas = Σ(cuota_i / (1+i)^t). Elegir la de menor VA.
   - Usar `ejecutarComparacionFinanciera(altA, altB, tasaDescuentoAnual)` para automatizar.

3. **ILUSIÓN ÓPTICA TASA NOMINAL EN INFLACIÓN ALTA**
   - En Argentina (ia > 20% o π > 10%), usar Fisher EXACTA: `tasaRealFisherExacta(ia, π) = (1+ia)/(1+π)-1`.
   - NO usar la aproximación ia - π (solo válida para tasas bajas).
   - Ejemplo: TNA 80% anual, inflación 50% → real exacta = (1.80/1.50)-1 = 20%, no 80%-50%=30% (sobreestimación).

4. **COSTO EFECTIVO POR TIR**
   - Para instrumentos con flujos irregulares (bonos, letras), el costo efectivo es la TIR que iguala VA de flujos al precio.
   - Usar `costoEfectivoTIR(flujos, precio)` que reutiliza `calcularTIR` de ons-tir-engine.

### FUNCIONES DISPONIBLES (src/lib/math/calculo-financiero.functions.ts)

- **Capitalización**: `capitalizacion(Co, TNA, m, tAnios)`, `teaDesdeTNA(TNA, m)`, `tnaDesdeTEA(TEA, m)`
- **Tasa real Fisher**: `tasaRealFisher(ia, pi, umbralExacta=0.20)` → devuelve `{real, metodo, ia, pi}`
- **Rentas**: `valorActualRenta(A, i, n)`, `valorFinalRenta(A, i, n)`, `cuotaPrestamo(P, i, n)`
- **Perpetuidades**: `perpetuidad(A, i)`, `perpetuidadCreciente(A, g, i, proximoFlujoIncluido)` (Gordon)
- **Fondo de amortización**: `fondoAmortizacion(S, i, n)`
- **Costo efectivo**: `costoEfectivoTIR(flujos, precio)`, `npvFlujos(flujos, tasa)`
- **Comparador**: `ejecutarComparacionFinanciera(altA, altB, tasaDescuentoAnual)`

### EJECUTOR PRINCIPAL

Cuando el usuario pida comparar alternativas (ej. "¿me conviene pagar contado $100.000 o en 12 cuotas de $10.000?"):

1. Identificar las dos alternativas con sus parámetros:
   - Tipo: "contado" (montoContado), "cuotas" (importe, cantidad, tasaPeriodica opcional), o "flujos" (array de Flow + precio)
2. Determinar la tasa de descuento anual (TEA):
   - Si el usuario no la especifica, usar TEA de caución IOL o plazo fijo ArgentinaDatos como referencia.
   - Consultar la API correspondiente en este turno para obtener el dato actual.
3. Ejecutar `ejecutarComparacionFinanciera(altA, altB, tasaDescuentoAnual)`.
4. Responder con el resultado: ganador, VA de cada alternativa, detalle y recomendación.

### GUARDRAILS

- Si faltan datos (tasa de descuento, monto de cuotas), pedirlos explícitamente antes de calcular.
- Si la tasa nominal es > 20% anual o la inflación > 10%, siempre mencionar que se usó Fisher exacta.
- Nunca comparar tasas nominales de diferentes frecuencias sin convertirlas a TEA primero.
- Para perpetuidades crecientes (Gordon), verificar que i > g; si no, el modelo diverge (VA infinito).

### INTEGRACIÓN CON DATOS

- **TNA/TEM plazos fijos**: API ArgentinaDatos (endpoint de tasas) o BCRA v4.
- **Inflación IPC**: BCRA v4 `/estadisticas/v4.0/PrincipalesVariables` (idVariable de IPC).
- **Tasas caución**: IOL `/api/v2/Cotizaciones/MEP` o endpoint de caución.
- **REM BCRA (expectativas)**: BCRA v4 por idVariable de expectativas de inflación.

Si alguna API no devuelve el dato, informarlo con honestidad y usar una tasa de referencia alternativa o pedir al usuario que la especifique.
