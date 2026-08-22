# Skill: Portfolio Paste Parser

## Nombre
`portfolio-paste-parser`

## Descripción
Detecta automáticamente texto pegado de portfolio IOL (tenencias, C.I., 24HS, montos ARS/USD), clasifica cada activo por tipo/moneda/mercado usando unificado_completo.json + cedears-universe.json, y orquesta análisis cuantitativo Labadie.

## Cuándo usar
- Usuario pega bloque de texto con "Patrimonio total", "Tenencias", "Cedears", "Acciones", tickers como PAMP/AMZN/GOOGL/SPY + cantidades + ARS
- Cualquier paste que contenga patrón IOL: ticker + cantidad + ARS + variación %

## Instrucciones
1. TRIGGER AUTOMATICO: si el mensaje contiene "Patrimonio total" o lista de tickers con montos ARS y variaciones %, EJECUTÁ INMEDIATAMENTE analizar_portfolio_pegado(texto=contenido completo) en este mismo turno, SIN pedir confirmación.
2. La herramienta parsea con regex IOL, clasifica vía buscarEnSectores (sectores.json) + BONOS_DB + LETRA_PATTERN + cedears sets (igual que Optimizador tab).
3. Devuelve tabla Markdown | Ticker | Tipo | Mercado | Moneda | Cant | Ultimo ARS | Monto | Var | Fuente |.
4. Luego encadená APIs: yfinance (subyacente US), estadisticas_retornos (volatilidad), analizar_capm, optimizar_portafolio para mostrar composición, histograma y frontera eficiente si el usuario tiene 3+ activos.
5. Usar metodología Labadie: portfolio.py manager + risk VaR 95% + CAPM beta, citando fuente. No inventar precios.
