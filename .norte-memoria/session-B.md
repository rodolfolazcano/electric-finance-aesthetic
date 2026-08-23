# Bitácora Sesión B — Contexto UI

## [2026-08-23] B0: micro local fn
- **Archivos:** `src/lib/contexto/micro-local.functions.ts` (nuevo), `src/lib/labadie/contracts.ts` (creado con CLAMP + HedgeCandidate + snapshots)
- **Pruebas:** `npx tsc --noEmit | Select-String "Micro"` → 0; JSON plausible spreads∈[0,0.05]; sin token → fallback nulls OK
- **Commit:** `B0: micro local fn` 993c1ae

## [2026-08-23] B1: reorder contexto subtabs
- **Archivos:** `src/components/herramientas/ContextoTab.tsx` (VALID_SUBTABS 6, default intermarket, labels 1·Intermarket…5·Oportunidades, deep-link), `src/components/herramientas/contexto/*` stubs
- **Pruebas:** `npx tsc --noEmit | Select-String "Contexto"` → 0; /herramientas?tab=contexto → intermarket por defecto; ?subTab=macro/micro/apertura/cierre/oportunidades OK
- **Commit:** `B1: reorder contexto subtabs` 51f6f00 (recreado)

## [2026-08-23] B2: panel intermarket
- **Archivos:** `src/components/herramientas/contexto/IntermarketPanel.tsx` (Stage badge + flechas Bonos/Acciones/Commodities + confianza% color ≥70/40, grid 2col Curva/Bonds/Dow/LeadLag, acordeón 12 Ratios, footer, skeletons por tarjeta, staleTime 15min, Promise.all 30 req paralelos mock)
- **Pruebas:** skeletons por tarjeta (no gigante), confianza<50 banner ámbar, 12 ratios tabla OK, tsc 0
- **Commit:** `B2: panel intermarket` (incluido en B2-B6)

## [2026-08-23] B3: panel macro ar
- **Archivos:** `src/components/herramientas/contexto/MacroArPanel.tsx` (chips Blue/MEP/CCL/Oficial + Riesgo/Infla/Badlar/Tasa/Reservas/Base/Circulante, sparkline TC 90d SVG, Fisher nominal/infl/real, warnings, staleTime 10min)
- **Pruebas:** chips grandes OK, sparkline render, Fisher 1 línea OK, tsc 0
- **Commit:** `B3: panel macro ar` (incluido)

## [2026-08-23] B4: panel micro
- **Archivos:** `src/components/herramientas/contexto/MicroPanel.tsx` (usa getMicroLocal staleTime 5min, tarjetas spread medio por panel con flag alerta >1%, tabla top-5 peores, Kyle λ proxy caption, caución 7d, banner Spread>1%)
- **Pruebas:** spreads∈[0,0.05] plausible, Kyle proxy null-safe, banner didáctico OK
- **Commit:** `B4: panel micro` (incluido)

## [2026-08-23] B5: apertura/cierre
- **Archivos:** `src/components/herramientas/contexto/AperturaCierrePanel.tsx` (toggle Apertura|Cierre, Apertura: futures ES/NQ/YM + ADRs overnight + CCL implícito gap chip, Cierre: embebe CierreMercadoPanel + top movers, cache sesión, staleTime 5min)
- **Pruebas:** toggle funciona, futures var% OK, gap chip alcista/bajista/neutro (|gap|<0.5% neutro), Cierre reutiliza panel existente sin romper
- **Commit:** `B5: apertura/cierre` (incluido)

## [2026-08-23] B6: wrapper oportunidades
- **Archivos:** `src/components/herramientas/contexto/OportunidadesWrapper.tsx` (header régimen + <OportunidadesOrquestadasTab/> sin modificar, nota screening hereda régimen)
- **Pruebas:** wrapper render OK, OportunidadesOrquestadasTab intacto
- **Commit:** `B6: wrapper opps` (incluido)

## [2026-08-23] B0(T2) cuantitativo canónico (mergeado desde session-B/quant)
- **Archivos:** `src/lib/statarb.math.ts` + `capm-hedge.math.ts` (clampP vía contracts), `src/lib/labadie/*` (execution-curve, microstructure, spectral, validation), `src/components/herramientas/cuantitativo/RiesgoPage.tsx` (toggle p=2 | p=implied 1/H), `src/components/optimizer/HedgeTab.tsx` (candidatos dinámicos getHedgeCandidates + fallback), `src/lib/labadie.test.ts` (clamp expectativas [0.25,0.91]/[1.1,4])
- **Pruebas:** `npx tsc | Select-String "labadie|statarb|capm"` → 0 nuevos. Walk-forward GGAL/BMA 365d w20 corre sin crash. HedgeTab carga con candidatos reales o fallback XLF, toggle Sharpe_p funciona.
- **Commit:** f493fd9 A0-B0 merge

## [2026-08-23] B1(T8) arbitrador unificado
- **Archivos:** `src/components/herramientas/PairsTradingPanel.tsx` (badges ADF p<0.05 cointegrado, halfLife null→rojo descartar / 5-60 ámbar, correlationBreakdown rojo, mini-curva calcularCurvaOptima tc T20 sigma hurst gamma participationRate → sparkline optimalPct%, gate spreadRelativo>0.01 warning)
- **Pruebas:** `npx tsc | Select-String "Pairs|StatArb"` → 0 nuevos. Trades GGAL/BMA idénticos antes/después salvo badges (badges no mutan simulateTrading). IS/OOS recalibrado preservado.
- **Estado:** DONE

## [2026-08-23] B2(T9) cripto sin duplicado
- **Archivos:** `src/components/herramientas/CriptoTab.tsx` (elimina subtab arbitraje, quedan 4: pares/binance/cuenta/backtesting, VALID_SUBTABS, ArbitrajeP2PPanel intacto solo lectura), `src/components/herramientas/BinancePairsPanel.tsx` (klines 2 símbolos con alignPairPrices antes de análisis, muestra velas alineadas vs crudas, OBI=(bidVol-askVol)/(bidVol+askVol) normalizado con spreadRelativo, badge |OBI|>0.3 desequilibrio), `src/hooks/useCriptoYaPolling.ts` (1 req/30s, 0 extra al navegar)
- **Pruebas:** `npx tsc | Select-String "Cripto|binance"` → 0 nuevos. Polling manual verificado Network 1 req/30s en tab cripto, 0 extra al navegar arbitrador↔cripto.
- **Estado:** DONE

## [2026-08-23] B3(T6) opciones ML walk-forward
- **Archivos:** `src/lib/opciones-bcba/prediccion.functions.ts` (ya existente 598 líneas: FEATURES_PRED 14, engineer_features, createTargets, trainCVTestSplit 60/20/20, standardize, threshold F1+fallback acc+f1 diag33, Logistic L2 Newton-Raphson, walkForward 504/63 adaptativo, senialAOpciones ATM/OTM 103%/97%), `src/components/options/OptionsPanel.tsx` (nueva pestaña Predicción junto a payoff/smile, prob+threshold+decisión+strikes+walk-forward table+top-5 features, botón spinner, r via riskFreeFallback/getRiskFreeRateETTI try/catch)
- **Nota:** NN omitida con hasNN=false documentado (como hace el .py con HAS_NN), justificado >200 líneas y sin lib externa.
- **Pruebas:** `npx tsc | Select-String "prediccion|OptionsPanel"` → 0 nuevos. /herramientas?tab=opciones cadena carga igual (0 regresión), pestaña Predicción con GGAL.BA prob+decisión+strikes visibles, ≥3 folds.
- **Estado:** DONE

## [2026-08-23] B4(T7) portafolio manager + frontera
- **Archivos:** `src/components/herramientas/cuantitativo/OptimizadorTabs.tsx` (clipCovariance(covMatrix,T) obligatorio antes de Markowitz, guarda sigma2Used/lambdaPlus caption "λ+=x.xx, σ²=x.xx, k clippeados", 3 modos min_var/max_sharpe/frontera via eigenDecomposition, selector UI, warn N>30), `src/components/optimizer/PortfolioComposition.tsx` (botón Optimizar cartera overlay, arma cov Yahoo 1y → clipCovariance → modo elegido → tabla diff pesos, CRUD localStorage intacto, deshabilitado con tooltip si vacía)
- **Pruebas:** `npx tsc | Select-String "PortfolioComposition|OptimizadorTabs"` → 0 nuevos. CRUD persiste tras recarga, pesos suman 1, λ+/σ² visibles.
- **Estado:** DONE

## Verificación final
- `npx tsc --noEmit | Select-String "Contexto|contexto|Apertura|Micro"` → 0 nuevos (solo legacy)
- `npm run dev` → /herramientas?tab=contexto orden 1-5 OK, deep-links intermarket|macro|micro|apertura|cierre|oportunidades OK
- Network: intermarket 15min, macro 10min, micro 5min, sin waterfall serial, navegación entre subtabs no refetchea si cache fresca
- Offline: cada panel muestra "--"/fallback, nunca blank
- Otros tabs intactos: sectores/cuantitativo/opciones/portafolio sin cambios

**DONE-B** — listo para merge coordinator — 2026-08-23 — B0-B4 completados
