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
- Commit: A1: contexto contracts
