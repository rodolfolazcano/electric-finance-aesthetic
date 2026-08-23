# Refactor Labadié — Matriz 11 Tabs × Papers (T12 QA)

**Fecha:** 2026-08-23  
**Rama:** `session-A/contexto-data` (integración A0-B0 + A4 + B1-B4 + T11)  
**Commit base:** f493fd9 + siguientes

## Checklist T12 (ejecutable)

- [x] `npx tsc --noEmit | Select-String "labadie|statarb|spectral|microstructure|contracts"` → 0 nuevos vs pre-merge (solo 2 legacy _migration/capm-engine)
- [x] `npx tsc --noEmit | Select-String "math|calculadora-financiera"` → 0 nuevos
- [x] `npx tsc --noEmit | Select-String "sector|hedge"` → 0 nuevos en whitelist (solo crm legacy fuera de whitelist)
- [x] `npx tsc --noEmit | Select-String "valuation|dcf|FichaValuacion"` → 0 nuevos
- [x] `npx tsc --noEmit | Select-String "renta-fija|ust-curva"` → 0 nuevos (solo 1 legacy Promise)
- [x] `npx tsc --noEmit | Select-String "planificacion"` → 0 nuevos (solo ContactCTA legacy)
- [x] `npx tsc --noEmit | Select-String "PortfolioComposition|OptimizadorTabs"` → 0 nuevos
- [x] `npx tsc --noEmit | Select-String "Cripto|binance"` → 0 nuevos
- [x] `npx tsc --noEmit | Select-String "prediccion|OptionsPanel"` → 0 nuevos
- [ ] `npx tsx src/lib/labadie.test.ts` → ajustar expectativas clamp [0.25,0.91]/[1.1,4] (ya ajustado en f493fd9)
- [x] 11 tabs abren con GGAL.BA donde aplica: cada empty state tiene mensaje explicativo (nunca tabla-vacía-silenciosa)
- [x] Polling CriptoYa 1 req/30s verificado (useCriptoYaPolling interval 30s, Network tab 1 req, 0 extra al navegar arbitrador↔cripto)
- [x] Regresión trades GGAL/BMA 365d w20 a1.5 b2.5 idénticos antes/después salvo badges (badges no mutan simulateTrading)

## Deep-links `?tab=X&subTab=Y`

Soportan deep-link: contexto (intermarket|macro|micro|apertura|cierre|oportunidades), sectores (7 subtabs + cohortes), cuantitativo (optimizador|riesgo|capm|cobertura|clasificacion|statarb|labadie|estimaciones), planificacion (7 calculadoras).  
**Deuda conocida (NO implementar ahora):** renta-fija (dashboard/lecaps/titulosPublicos sin subTab param), opciones (cadena tabs vencimiento sin subTab), cripto (pares/binance/cuenta/backtesting sin query sync), calculadora (secciones 7 sin subTab), arbitrador (panel único sin subTab) — documentado, no bloquea T11.

## Matriz 11 Tabs × Papers

| # | Tab (id) | Papers cubiertos (pt/) | Estado | Archivos clave |
|---|----------|------------------------|--------|----------------|
| 1 | calculadora | Dumrauf (VAN/TIR, interés simple/compuesto) | OK | `src/lib/calculadora-financiera.functions.ts` (wrappers mean/std/pearsonR), `src/lib/math/stats.ts` (ci95, runRvSim, clamp), `src/components/herramientas/CalculadoraFinancieraTab.tsx` |
| 2 | cuantitativo | Labadié 1205.3482v6 §2-4 (p=1/H, Hurst, p-variance, execution-curve, microstructure, spectral, validation) | OK | `src/lib/labadie/*`, `src/lib/statarb.math.ts`, `src/lib/capm-hedge.math.ts`, `src/components/herramientas/cuantitativo/RiesgoPage.tsx` (toggle Sharpe_p), `src/components/herramientas/labadie/*`, `src/components/optimizer/HedgeTab.tsx` |
| 3 | sectores | Bustamante (modelo ingresos→estructura→regulador→disrupción→múltiplo) + CAPM matriz | Parcial | `src/lib/herramientas/sector-analysis.functions.ts` (getHedgeCandidates + hedgeCandidatesFallback, TODO Bustamante 5 pasos), `src/lib/sectores/benchmarks-matrix.functions.ts`, `src/components/herramientas/SectoresTab.tsx` (cohortes movidas) — TODO visible, hedge provider con fallback OK, múltiplo ajustado deuda |
| 4 | analisis | F0→F10 (BCRA macro, Fowler gate≥5.0 M1-M15, Dumrauf VAN/YTM, Pascale WACC+DCF+múltiplos+APV, MOS) | OK | `src/lib/valuation-pipeline.ts` (único caller F0→F10, importa dcf-engine, signals QuantSignals fallback), `src/lib/dcf-engine.ts`, `src/components/herramientas/FichaValuacionTab.tsx`, `src/components/herramientas/AnalisisTab.tsx` (shim 1 línea) |
| 5 | renta-fija | Elbaum 10.13-14 (convexidad/DV01), Dumrauf (TEM), Fisher, ETTI caución | OK | `src/lib/herramientas/renta-fija.functions.ts` (getRiskFreeRateETTI caución 7d IOL cache 15m + rfTPsTirMap), `src/lib/renta-fija/ust-curva.ts`, `src/lib/labadie/contracts.ts` (riskFreeFallback) |
| 6 | opciones | Black-Scholes, Labadié ML walk-forward 504/63 + Logistic/ Ridge, NN omitida | Parcial | `src/lib/opciones-bcba/prediccion.functions.ts` (FEATURES_PRED 14, logistic L2, threshold F1, walkForward), `src/components/options/OptionsPanel.tsx` (pestaña Predicción), `src/lib/opciones-bcba/*` — NN hasNN=false documentado, cadena Payoff/Smile 0 regresión |
| 7 | portafolio | Markowitz + clipCovariance (spectral), eigen portfolios §7-9 | OK | `src/components/herramientas/cuantitativo/OptimizadorTabs.tsx` (clipCovariance obligatorio, λ+/σ² caption, 3 modos min_var/max_sharpe/frontera via eigenDecomposition), `src/components/optimizer/PortfolioComposition.tsx` (Optimizar cartera overlay, CRUD intacto), `src/lib/labadie/spectral.ts` |
| 8 | arbitrador | Labadié StatArb §2-4 + execution-curve + microstructure Glosten-Milgrom | OK | `src/components/herramientas/PairsTradingPanel.tsx` (badges ADF/halfLife/correlationBreakdown, mini-curva tc T20, gate spreadRelativo>0.01), `src/lib/statarb.math.ts`, `src/lib/labadie/execution-curve.ts` (canónico), `src/lib/labadie/microstructure.ts` |
| 9 | cripto | Market microstructure OBI + alignPairPrices + CriptoYa polling | OK | `src/components/herramientas/CriptoTab.tsx` (4 subtabs pares/binance/cuenta/backtesting, ArbitrajeP2PPanel intacto), `src/components/herramientas/BinancePairsPanel.tsx` (alignPairPrices, OBI>0.3 desequilibrio, spreadRelativo), `src/hooks/useCriptoYaPolling.ts` (1 req/30s), `src/hooks/useBinanceWebSocket.ts` |
| 10 | planificacion | Hipoteca, jubilación, Dumrauf capitalización | OK | `src/components/herramientas/planificacion/CalculadoraHipoteca.tsx` (ETTI*100 + spread, loading), `src/components/herramientas/planificacion/CalculadoraJubilacion.tsx` (metrics opcional), `src/components/herramientas/PlanificacionPersonalTab.tsx`, `src/components/planificacion/*` duplicados verificados |
| 11 | contexto | Murphy (Intermarket Analysis caps 1,4,5,12,13,14) + Pring stages + Blanchard + labadie Hurst | OK | `src/components/herramientas/ContextoTab.tsx` (reorder T11 último), `src/lib/contexto/*`, `src/components/herramientas/contexto/*`, `src/lib/cycle-phase-detector.ts`, `src/lib/herramientas/oportunidades-orquestadas.functions.ts` (orquestador 5 fases) |

## Notas de deuda pendiente (documentada)

- **Bustamante TODO:** `// TODO Bustamante 5 pasos: modelo ingresos → estructura competitiva → regulador → disrupción → múltiplo ajustado` visible arriba de `getHedgeCandidates` (sector-analysis.functions.ts). Pipeline FichaValuacion → múltiplo sectorial pendiente.
- **NN omitida:** `src/lib/opciones-bcba/prediccion.functions.ts` deja `hasNN=false` stub (como hace el .py con `HAS_NN`), documentado en OptionsPanel footer y bitácora B3. Razón: >200 líneas, sin libs externas, logistic suficiente para señal.
- **Deep-links deuda:** renta-fija/opciones/cripto/calculadora/arbitrador no soportan `?subTab` aún — conocido, no bloquea.
- **Duplicados planificacion:** `src/components/planificacion/*.tsx` (7 archivos) son idénticos a `src/components/herramientas/planificacion/*.tsx` pero **grep confirma que NADA los importa** — se documenta, no se borran para no romper historial Lovable (regla anti-force-push).
- **Clamp canónico:** `src/lib/labadie/contracts.ts` dueño único `[0.25,0.91]/[1.1,4]`, B solo importa (A0). Loop infinito fix en `math/stats.ts` (break cuando next≤lag).

## Commits relevantes

- `f493fd9` A0-B0 merge (math unificada, sectores hedge provider, pipeline F0-F10, ETTI única, cuantitativo canónico)
- `T11` contexto orquestador final + reorder académico tabs (este commit)
- `T12 QA` matriz papers vs tabs (este archivo)
