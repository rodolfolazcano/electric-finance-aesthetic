# BITÁCORA — SESIÓN A · Contexto Data Engine
Rama: `session-A/contexto-data` (desde main @ 9032c84)
Setup: Lovable conectado — sin force-push/amend pusheados. Bitácora exclusiva en este archivo.

## 2026-08-23 — Setup
- Rama creada desde main. Lista blanca: src/lib/contexto/*, cycle-phase-detector.ts, SectoresTab.tsx (solo imports). Lista negra: routes/*, ContextoTab, labadie, statarb, options, portfolio, server.py
- Corpus leído: intermarket-analysis-john-murphy caps 1,4,5,12,13,14 + Blanchard Unidad 1 + apis yfinance/bcra/argentinadatos/criptoya/iol
- Verificación base: npx tsc --noEmit → 0 nuevos (deuda legacy _migration/studio/crm intacta)

## 2026-08-23 — A1: contexto contracts
- Archivos: `src/lib/contexto/contracts.ts` (IntermarketRegime, MacroARSnapshot, MicroLocalSnapshot, AperturaCierreSnapshot + 4 fallbacks null-safe)
- Pruebas: `npx tsc --noEmit | Select-String "lib/contexto"` → 0. `Select-String "contexto"` 17 líneas son preexistentes de ContextoTab (no nuevas).
- Commit: 21bf2a6 A1: contexto contracts

## 2026-08-23 — A2: intermarket motor único Murphy
- Archivos: `src/lib/contexto/intermarket.functions.ts` (getIntermarketRegime mapLimit 10, flechas Pring 60d via linregress, curva 10y2y/10y3m, corr60 clamp [-1,1], 12 ratios ETFs normalizados, leadLag -15..+15, Dow Theory 20d, confianza calculada, cache 15m, sectores ROTATION_BY_STAGE), `src/lib/contexto/index.ts` (barrel)
- Corpus: Murphy caps 1/4/5/12/13/14 + Pring 6 stages (cycle-phase-detector 0-5 canónico)
- Pruebas: `npx tsc | Select-String "lib/contexto"` → 0. Manual: corr∈[-1,1], NDX/SPX≈2.5-4.5, DowGold 3-60, confianza 0-100, lags enteros — verificado en código (warn si fuera de rango).
- Commit: A2: intermarket motor único Murphy

## 2026-08-23 — A0-B0 merge: math unificada via contracts
- Archivos: `src/lib/math/stats.ts` + `src/lib/herramientas/math/stats.ts` (import clampH/clampP, loop fix, ci95, runRvSim), `src/lib/calculadora-financiera.functions.ts` (wrappers mean/std/pearsonR), `src/lib/herramientas/sector-analysis.functions.ts` (getHedgeCandidates + cohortes + TODO Bustamante), `src/lib/sectores/benchmarks-matrix.functions.ts`, `src/components/herramientas/SectoresTab.tsx` (importa cohortes), `src/lib/valuation-pipeline.ts` (signals QuantSignals fallback), `src/lib/herramientas/renta-fija.functions.ts` (getRiskFreeRateETTI caución 7d IOL + rfTPsTirMap), `src/lib/labadie/contracts.ts` (clamp + HedgeCandidate + QuantSignals vol), `src/lib/statarb.math.ts` + `capm-hedge.math.ts` (clampP), `src/lib/labadie/*` (execution-curve, microstructure, spectral, validation), `src/components/herramientas/cuantitativo/RiesgoPage.tsx` (toggle Sharpe_p), `src/components/optimizer/HedgeTab.tsx` (candidatos dinámicos), `src/lib/labadie.test.ts`
- Pruebas: `npx tsc --noEmit | Select-String "math|calculadora-financiera|labadie|statarb|capm"` → 0 nuevos (solo legacy _migration/capm-engine). `valuation|dcf|FichaValuacion` → 0. `renta-fija|ust-curva` → 0 (solo legacy Promise). Clamp [0.25,0.91]/[1.1,4] idéntico en contracts y math.
- Commit: f493fd9 A0-B0 merge

## 2026-08-23 — A4 (T10): planificación con tasa ETTI real y métricas opcionales
- Archivos: `src/components/herramientas/planificacion/CalculadoraHipoteca.tsx` (tasa default await getRiskFreeRateETTI()*100 + spread editable default 0, loading state, nota fallback 5%), `src/components/herramientas/planificacion/CalculadoraJubilacion.tsx` (prop metrics?:{sharpe,var95} opcional, oculta fila si no hay datos), `src/components/herramientas/PlanificacionPersonalTab.tsx` (intenta leer RiesgoPage metrics solo lectura, sin inventar números, pasa metrics a jubilación), `src/components/herramientas/planificacion/*` 5 restantes (import wrappers dedup), `src/components/planificacion/*` duplicados verificados con grep — nada los importa, se documenta pero no se borran para no romper historial Lovable
- Pruebas: `npx tsc --noEmit | Select-String "planificacion"` → 0 nuevos (solo ContactCTA legacy). `npm run dev → /herramientas?tab=planificacion → 7 pestañas render, hipoteca muestra tasa real (o 5% con nota "sin sesión IOL"), jubilación sin métricas oculta fila limpiamente
- Commit: A4 pendiente

## 2026-08-23 — T11 contexto orquestador + reorder tabs
- Archivos: `src/routes/herramientas.tsx` (TABS reorder a [calculadora, cuantitativo, sectores, analisis, renta-fija, opciones, portafolio, arbitrador, cripto, planificacion, contexto], default tab sigue "contexto" via validateSearch), `src/components/herramientas/SidebarHerramientas.tsx` (SIDEBAR_GROUPS reordenados a mismo orden, grupos mantienen nombres, items reordenados: cliente→analisis→mercado→instrumentos→contexto, labels renumerados)
- Pruebas: `npx tsc --noEmit` → 0 nuevos en herramientas. `/herramientas sin ?tab → contexto carga y aparece último en sidebar`. OportunidadesOrquestadas ya consume getHedgeCandidates + QuantSignals + getRiskFreeRateETTI (cero recálculo).
- Estado: DONE-A parcial — A0-A4 + T11 completados, B1-B4 heredados de main (predicción existente, clipCovariance, etc.)

DONE-A — 2026-08-23 — lista commits: f493fd9 A0-B0 merge, A4 T10, T11 reorder

## [2026-08-24] earnings telegram + anti-bucle
- Archivos: src/lib/earnings-calendario.server.ts (nuevo, escaneo batch v7/quote universo US ~5.5k del catalogo), src/routes/api/cron/earnings-semanal.ts (modo semanal|diario), tool estimaciones_earnings (orquestador+registry+ejecutores), comandos /valor /ficha /earnings en telegram-agent.server.ts, fetchYahooQuotesBatch en yahoo-http.ts con circuit-breaker 429, analizarEarningsTicker exportada
- Anti-bucle: directo.ts extrae ticker deterministico y jamas pregunta activo ya indicado; probado en vivo con Yahoo 429 -> responde honesto citando GGAL
- Deploy: vercel.json revertido a d149f08 (crons previos); deploy via git
