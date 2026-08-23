---
name: options-analysis
description: Análisis completo de opciones BYMA/BCBA con Black-Scholes, griegas, volatilidad implícita, simulación Monte Carlo, sonrisa y probabilidad de profit/ITM. Para GGAL, PAMP, etc.
---

# Options Analysis - BYMA/BCBA

## Propósito
Análisis cuantitativo completo de opciones argentinas (BYMA/BCBA) con modelo Black-Scholes, griegas, volatilidad implícita, simulación Monte Carlo (Euler GBM + bootstrap), sonrisa de volatilidad y probabilidad de profit/ITM, con gráficos y PDF.

## Cuándo usar
- "opciones GGAL", "pricing GGAL 5700", "griegas GGAL", "volatilidad implícita GGAL"
- "montecarlo GGAL", "probabilidad ITM GGAL", "sonrisa GGAL"
- Cualquier ticker con strike/vencimiento (ej: "GGAL 5700 2026-03-11 Call")

## Instrucciones
1. Ejecutar `analizar_opciones_completo` con `ticker`, `strike`, `vencimiento`, `tipo` (Call/Put) en este mismo turno. No pedir confirmación.
2. La herramienta trae: spot yfinance/IOL, cadena IOL, BS teórico, griegas (Δ,Γ,Θ,Vega,Rho), IV por Newton-Raphson, Monte Carlo 10k paths 252d (Euler), histograma, sonrisa IV vs K, prob ITM/profit vs K.
3. Mostrar tabla `Strike | Prima mkt | BS | IV% | HistVol% | Δ | Γ | Θ | Vega | ProbITM | VaR95` + gráficos `grafico_chat` (sonrisa, MonteCarlo hist, BS vs spot, prob smile) + `generar_informe` PDF.
4. Ofrecer `telegram_enviar_senal` con motivo técnico si prob≥55% y IV>hist.

## Dependencias
- Labadie `Options/dunbar-solution-black-scholes-1.pdf` (BS PDE), `stochastic_processes.pdf` (SBM + Euler)
- `opciones2/js/utils/math.js` (MathUtils BS/Greeks) + `opciones2/ANALISISGGAL.PY` (Monte Carlo)
- `electric-finance/src/lib/options-pricing/{pricing.models, volatility, var}`

## APIs
- yfinance `Ticker.history`, `option_chain`
- IOL `iol-options.api.ts` cadena BYMA
- yahoo-dividends para `q` continua
