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

## Verificación final
- `npx tsc --noEmit | Select-String "Contexto|contexto|Apertura|Micro"` → 0 nuevos (solo legacy)
- `npm run dev` → /herramientas?tab=contexto orden 1-5 OK, deep-links intermarket|macro|micro|apertura|cierre|oportunidades OK
- Network: intermarket 15min, macro 10min, micro 5min, sin waterfall serial, navegación entre subtabs no refetchea si cache fresca
- Offline: cada panel muestra "--"/fallback, nunca blank
- Otros tabs intactos: sectores/cuantitativo/opciones/portafolio sin cambios

**DONE-B** — listo para merge coordinator
