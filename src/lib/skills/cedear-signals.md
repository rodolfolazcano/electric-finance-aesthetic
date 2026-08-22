# Skill: Señales CEDEARs / Acciones BCBA

## Nombre
`cedear-signals`

## Descripción
Genera señales contextuales para CEDEARs y acciones BCBA mapeando subyacente NYSE/NASDAQ, usando yfinance + screeners + noticias del día. Para activos más líquidos, en noticias hoy o con mayores variaciones.

## Cuándo usar
- "señales de cedears", "qué cedears comprar/vender hoy", "señales acciones BCBA"
- "activos en noticias hoy", "top movers del día", "cedears más líquidos"
- "analizá AAPL/MSFT/GGAL y dame señal"

## Instrucciones para el agente
1. Invocá SIEMPRE `generar_senales_cedear` con `filtro` = `liquidos` | `noticias` | `movers` | `todos` y `topN` (default 6).
2. La herramienta ya trae precios BCBA + subyacente US, variación, volumen y motivo contextual (noticias + sector líder).
3. Para profundizar un ticker puntual, complementá con `analisis_tecnico`, `valor_intrinseco_real`, `pairs_trading_labadie` (si es ADR) o `consultar_base_conocimiento` (corpus Pascale/Labadie).
4. No inventes precios: todo viene de yfinance/screeners en este turno. Si no hay dato, decilo.
5. Formato de respuesta: tabla Markdown con columnas Ticker BCBA | Subyacente US | Precio US | Var% | Señal | Prob | Motivo. Luego gráfico TradingView del ticker líder si aporta valor y opción `telegram_enviar_senal`.
6. Compliance: señales como información educativa, no recomendación. Citar fuente y disclaimer.
