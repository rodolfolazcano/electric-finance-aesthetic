// ─── Phase 1 — Tipos compartidos ────────────────────────────────
// Macro snapshot + GWR validation + wrapper del Murphy Engine

import type { LecturaIntermarket } from "../intermarket-engine";

// ─── 1. Macro Snapshot ──────────────────────────────────────────

export interface MacroIndicator {
  ticker: string;
  label: string;
  valor: number | null;
  variacion1dPct: number | null;
  variacion1mPct: number | null;
  rango52wMin: number | null;
  rango52wMax: number | null;
  timestamp: string;
}

export interface MacroSnapshot {
  // Curva de tasas US
  tnx: MacroIndicator;   // ^TNX — UST 10Y yield
  tyx: MacroIndicator;   // ^TYX — UST 30Y yield
  irx: MacroIndicator;   // ^IRX — T-Bill 13-week (short end)
  // Corto plazo (money market ETFs)
  sgov: MacroIndicator;  // SGOV — 0-3月 Treasury
  bil: MacroIndicator;   // BIL — 1-3月 Treasury
  usfr: MacroIndicator;  // USFR — Floating Rate Treasury
  // Macro global
  vix: MacroIndicator;   // ^VIX — Volatilidad / miedo
  dxy: MacroIndicator;   // DX-Y.NYB — Dólar index
  // Commodities
  gold: MacroIndicator;  // GC=F — Oro
  oil: MacroIndicator;   // CL=F — Petróleo WTI
  copper: MacroIndicator; // HG=F — Cobre
  // Spreads
  spread10y2y: number | null;   // TNX - ^2YY (proxy: IRX)
  spread10y30y: number | null;  // TYX - TNX
}

// ─── 2. GWR Validation ──────────────────────────────────────────

export type GwrVeredicto = "acertado" | "fallido" | "pendiente" | "indeterminado";

export interface GwrClaim {
  id: string;               // ej "GWR#63-1"
  claim: string;            // ej "La Fed hará un recorte en septiembre"
  fechaClaim: string;       // ISO date
  fuente: string;           // ej "GWR#63 — 14/7/2026"
  // Validación
  veredicto: GwrVeredicto;
  fechaValidacion: string;  // ISO date
  evidencia: string;        // Explicación del veredicto
  datosRespaldo?: {
    metric: string;         // ej "Fed Funds Rate"
    valorActual: number;
    valorAnterior: number;
  };
}

export interface GwrSummary {
  total: number;
  acertados: number;
  fallidos: number;
  pendientes: number;
  tasaAcierto: number;     // 0–100
  claims: GwrClaim[];
  ultimaActualizacion: string;
}

// ─── 3. Phase 1 Overview (wrapper del Murphy Engine) ────────────

export interface Phase1Regime {
  classification: string;       // "inflacionario" | "deflacionario" | etc.
  inflationPressureScore: number; // 0–100
  confianza: number;            // 0–100
  stage: number;                // 1–6 ciclo económico
  stageLabel: string;
  stageSectores: string[];
  description: string;
}

export interface Phase1Data {
  timestamp: string;
  macro: MacroSnapshot;
  regime: Phase1Regime;
  murphy: {
    regimen: string;
    confianza: number;
    indicePresion: number;
    alertaActiva: string | null;
    recomendacionSesgo: string;
    patronHistorico: string | null;
    bearMarketSilencioso: boolean;
    secuenciaGirosCorrecta: boolean;
  };
  gwr_validation: GwrSummary;
}
