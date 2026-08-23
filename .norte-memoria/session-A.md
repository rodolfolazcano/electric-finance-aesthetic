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
