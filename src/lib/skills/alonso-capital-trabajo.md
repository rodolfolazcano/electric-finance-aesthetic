# Skill: Capital de Trabajo y Tesorería (Alonso Unidad 3)

## ID
`alonso-capital-trabajo`

## Nombre
Capital de Trabajo y Tesorería — Alonso

## Descripción
Gestión de capital de trabajo, crédito comercial, decisiones de tesorería y gestión de inventarios según Alonso (Administración de las Finanzas de la Empresa). Análisis de antinomia rentabilidad-liquidez.

## Cuándo usar
- Analizar el ciclo de conversión de una empresa
- Evaluar costo implícito del crédito comercial vs fondeo bancario
- Decidir otorgamiento de crédito a clientes (Van Horne)
- Optimizar inventarios (punto de pedido, lote económico)
- Seleccionar colocaciones de tesorería por puntaje ponderado
- Diagnosticar tensión financiera por costo de crédito comercial

## Instrucciones
[SKILL · Capital de Trabajo y Tesorería — Alonso]

### REGLAS CENTRALES (antinomia rentabilidad-liquidez)

1. **ANTINOMIA RENTABILIDAD-LIQUIDEZ**
   - No maximizar rentabilidad en detrimento de liquidez, ni viceversa.
   - Balancear colocaciones de alto retorno con liquidez suficiente para obligaciones de corto plazo.
   - Usar el modelo de puntaje ponderado (Seguridad/Liquidez/Rentabilidad = 10/7/9) para seleccionar colocaciones.

2. **ELEGIR POR COSTO EFECTIVO TOTAL, NUNCA TASA NOMINAL**
   - Para comparar alternativas de financiamiento, calcular el costo efectivo total (TEA).
   - El crédito comercial tiene un costo implícito: (d/c)·(360/t) donde d = descuento, c = precio contado, t = plazo.
   - Ejemplo clásico: 10/60 = 100% anual (descuento 10% por pago a 60 días).
   - Si el costo implícito del crédito comercial supera la tasa de fondeo (caución, plazo fijo), es señal de tensión financiera.

3. **COSTO IMPLÍCITO DEL CRÉDITO COMERCIAL COMO SEÑAL DE TENSIÓN**
   - Monitorear el costo implícito del crédito comercial como indicador de salud financiera.
   - En el informe semanal, incluir esta métrica en la sección "financiamiento".
   - Si el costo es muy alto (> 2× tasa de fondeo), alertar sobre posible refinanciación necesaria.

### FUNCIONES DISPONIBLES (src/lib/fundamentals/capital-trabajo.functions.ts)

- **Costo de financiamiento**: `costoAlternativaFinanciamiento(K, t, i)`, `costoImplicitoCreditoComercial(d, c, t)`
- **Ciclo de conversión**: `cicloConversion(diasStock, diasCobro, diasPago)`, `necesidadCTN(costoOp, rotacion, ciclo)`
- **Inversión en CTN**: `reglaInversionCTN(deltaCM, deltaCTN, k)` → invertir si r ≥ k
- **Crédito a clientes**: `decisionCreditoCliente(V, m, q, r, p, K)` (Van Horne)
- **Inventarios**: `puntoPedido(consumo, plazo, stockSeguridad)`, `loteEconomico(demanda, costoPedido, costoMantenimiento)`
- **Tesorería**: `puntajePonderadoTesoreria(colocaciones, pesos)`, `ahorroTesoreria(F, R1, D, Fm, R2, Km)`

### EJECUTOR PRINCIPAL

Cuando el usuario pida análisis de tesorería o capital de trabajo:

1. Recolectar datos:
   - Costo de fondeo actual (TEA de caución IOL o plazo fijo ArgentinaDatos)
   - Costo implícito del crédito comercial (descuentos y plazos de proveedores)
   - Ciclo de conversión (días de stock, cobro, pago)
   - Necesidad de capital de trabajo neto
   - Colocaciones disponibles con sus ratings de seguridad/liquidez/rentabilidad

2. Ejecutar `ejecutarAnalisisTesoreria(input)` con los datos recolectados.

3. Responder con:
   - Recomendación prioritaria
   - Comparación costo fondeo vs crédito comercial (señal de tensión)
   - Análisis del ciclo de conversión y necesidad de CTN
   - Mejor colocación de tesorería según puntaje ponderado
   - Detalle de la antinomia rentabilidad-liquidez

### GUARDRAILS

- Si faltan datos (costo de fondeo, plazos de proveedores), pedirlos explícitamente antes de calcular.
- Para el modelo de puntaje ponderado, usar los pesos por defecto (Seguridad=10, Liquidez=7, Rentabilidad=9) a menos que el usuario especifique otros.
- Nunca recomendar colocaciones de muy alta rentabilidad si comprometen la liquidez necesaria para obligaciones inmediatas.
- Si el ciclo de conversión es muy positivo (> 90 días), alertar sobre necesidad de financiamiento estructural.

### INTEGRACIÓN CON DATOS

- **Tasas de fondeo/caución**: IOL `/api/v2/Cotizaciones/MEP` (caucion.server.ts) o ArgentinaDatos (tasas de plazos fijos).
- **Comisiones bancarias**: Hardcodeadas por config (no hay API pública).
- **Estados contables**: Para ratios de Alonso (ciclo de conversión), se necesitan balances de empresas BCBA. Limitación actual: yfinance .BA devuelve balance_sheet casi siempre vacío. Solución pragmática: JSON manual por empresa o scraping CNV.

Si alguna API no devuelve el dato, informarlo con honestidad y usar una tasa de referencia alternativa o pedir al usuario que la especifique.

### CASOS DE USO TÍPICOS

- "¿Me conviene tomar el descuento de 10% por pago contado o pagar a 60 días?" → Usar `costoImplicitoCreditoComercial`.
- "¿Debería otorgar crédito a este cliente?" → Usar `decisionCreditoCliente` (Van Horne).
- "¿Cuál es mi ciclo de conversión y necesidad de CTN?" → Usar `cicloConversion` y `necesidadCTN`.
- "¿Dónde debo colocar el superávit de tesorería?" → Usar `puntajePonderadoTesoreria`.
- "¿Hay señal de tensión financiera en mi empresa?" → Comparar costo crédito comercial vs fondeo.
