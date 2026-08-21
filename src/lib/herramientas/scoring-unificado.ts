// @ts-nocheck
// FASE 6 — Motor legacy conservado.
// # REVISAR (bloqueo estructural): calcularScoreUnificado (legacy) es llamado
// dentro de getSemaforo (finance.functions:518) y motor-unificado.ts llama a
// getSemaforo — delegar aquí provocaría recursión infinita. El motor real es
// src/lib/scoring/motor-unificado.ts (Fase 5). Este archivo queda como fuente
// compartida de detectarContradiccion, que el motor unificado sí consume
// (autocorrección FASE 5: tecnico.raw y fundamental (valor-50)/5).
// src/lib/scoring-unificado.ts
// Motor de scoring que unifica análisis técnico + fundamental en un solo score
// jerárquico, con detección de contradicciones y reglas por tipo de activo.
//
// Metodología basada en Labadie: scoring jerárquico con pesos dinámicos
// según régimen de mercado y tipo de activo.

import type { ScoreTecnicoResult } from "./semaforo-tecnico";
import type { InfoActivo } from "./detector-activo";

// ─── Tipos ──────────────────────────────────────────────────────────

export interface ScoreFundamentalInput {
  /** P/E ratio */
  pe: number | null;
  /** Revenue growth (en decimal, ej: 0.15 = 15%) */
  revenueGrowth: number | null;
  /** Profit margin (en decimal) */
  profitMargin: number | null;
  /** Return on Equity (en decimal) */
  roe: number | null;
  /** Earnings growth (en decimal) */
  earningsGrowth: number | null;
  /** PEG ratio */
  peg: number | null;
  /** Market cap */
  marketCap: number | null;
  /** Forward P/E */
  forwardPE: number | null;
  /** Free cash flow yield */
  fcfYield: number | null;
  /** Debt to equity */
  debtToEquity: number | null;
  /** Recommendation mean de analistas (1=SB, 5=SS) */
  recommendationMean: number | null;
}

export type DireccionContradiccion =
  | "tecnico-alcista-fundamental-bajista"
  | "tecnico-bajista-fundamental-alcista"
  | "divergencia-metodos-valuacion";

export interface Contradiccion {
  direccion: DireccionContradiccion;
  descripcion: string;
  /** Severidad: 1=baja, 2=media, 3=alta */
  severidad: 1 | 2 | 3;
}

export interface ScoreUnificadoResult {
  /** Score técnico puro (de semaforo-tecnico.ts) */
  tecnico: ScoreTecnicoResult;
  /** Score fundamental puro (-10 a +10) */
  fundamental: number;
  /** Score fundamental detallado */
  fundamentalDetalle: Record<string, number>;
  /** Score combinado final */
  total: number;
  /** Clasificación final */
  clasificacion: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA";
  /** Si hay contradicción entre técnico y fundamental */
  contradiccion: Contradiccion | null;
  /** Mensaje interpretativo */
  interpretacion: string;
  /** Señales individuales */
  senales: SenalUnificada[];
}

export interface SenalUnificada {
  origen: "tecnico" | "fundamental" | "unificado";
  label: string;
  tone: "good" | "neutral" | "bad";
  peso: number;
}

// ─── Pesos por tipo de activo ──────────────────────────────────────

const PESOS_POR_TIPO: Record<string, { tecnico: number; fundamental: number }> = {
  ACCION: { tecnico: 0.4, fundamental: 0.6 },
  CEDEAR: { tecnico: 0.4, fundamental: 0.6 },
  ADR:    { tecnico: 0.4, fundamental: 0.6 },
  ETF:    { tecnico: 0.7, fundamental: 0.3 }, // ETFs: más técnico
  BONO:   { tecnico: 0.8, fundamental: 0.2 },
  ON:     { tecnico: 0.8, fundamental: 0.2 },
  OTRO:   { tecnico: 0.9, fundamental: 0.1 },
};

// ─── Cálculo de score fundamental ──────────────────────────────────

export function calcularScoreFundamental(
  fin: ScoreFundamentalInput,
): { score: number; detalle: Record<string, number> } {
  let score = 0;
  const detalle: Record<string, number> = {};

  // P/E (0 a ±2)
  if (fin.pe != null && fin.pe > 0) {
    if (fin.pe < 10)       { detalle.pe = 2;   score += 2; }
    else if (fin.pe < 15)  { detalle.pe = 1.5; score += 1.5; }
    else if (fin.pe < 25)  { detalle.pe = 0.5; score += 0.5; }
    else if (fin.pe < 35)  { detalle.pe = -0.5; score -= 0.5; }
    else if (fin.pe < 50)  { detalle.pe = -1;   score -= 1; }
    else                   { detalle.pe = -2;   score -= 2; }
  } else {
    detalle.pe = 0;
  }

  // Revenue growth (0 a ±2)
  if (fin.revenueGrowth != null) {
    if (fin.revenueGrowth > 0.25)   { detalle.revGrowth = 2;   score += 2; }
    else if (fin.revenueGrowth > 0.10) { detalle.revGrowth = 1;   score += 1; }
    else if (fin.revenueGrowth > 0)    { detalle.revGrowth = 0.5; score += 0.5; }
    else if (fin.revenueGrowth > -0.05) { detalle.revGrowth = -0.5; score -= 0.5; }
    else                              { detalle.revGrowth = -1;   score -= 1; }
  } else {
    detalle.revGrowth = 0;
  }

  // Profit margin (0 a ±2)
  if (fin.profitMargin != null) {
    if (fin.profitMargin > 0.25)   { detalle.profitMargin = 2; score += 2; }
    else if (fin.profitMargin > 0.15) { detalle.profitMargin = 1.5; score += 1.5; }
    else if (fin.profitMargin > 0.05) { detalle.profitMargin = 0.5; score += 0.5; }
    else if (fin.profitMargin > 0)    { detalle.profitMargin = 0; }
    else if (fin.profitMargin > -0.10) { detalle.profitMargin = -0.5; score -= 0.5; }
    else                              { detalle.profitMargin = -1.5; score -= 1.5; }
  } else {
    detalle.profitMargin = 0;
  }

  // ROE (0 a ±1.5)
  if (fin.roe != null) {
    if (fin.roe > 0.20)  { detalle.roe = 1.5; score += 1.5; }
    else if (fin.roe > 0.10) { detalle.roe = 1;   score += 1; }
    else if (fin.roe > 0)    { detalle.roe = 0.5; score += 0.5; }
    else if (fin.roe > -0.10) { detalle.roe = -0.5; score -= 0.5; }
    else                    { detalle.roe = -1;   score -= 1; }
  } else {
    detalle.roe = 0;
  }

  // Earnings growth (0 a ±1)
  if (fin.earningsGrowth != null) {
    if (fin.earningsGrowth > 0.15)  { detalle.earningsGrowth = 1; score += 1; }
    else if (fin.earningsGrowth > 0)   { detalle.earningsGrowth = 0.5; score += 0.5; }
    else if (fin.earningsGrowth > -0.10) { detalle.earningsGrowth = -0.5; score -= 0.5; }
    else                              { detalle.earningsGrowth = -1; score -= 1; }
  } else {
    detalle.earningsGrowth = 0;
  }

  // Consenso de analistas (-1 a +1)
  if (fin.recommendationMean != null) {
    // recommendationMean: 1=SB, 2=B, 3=H, 4=S, 5=SS → normalizar a -1..+1
    const norm = 1 - (fin.recommendationMean - 1) / 2; // 1→1, 3→0, 5→-1
    detalle.consenso = Math.round(norm * 10) / 10;
    score += detalle.consenso;
  } else {
    detalle.consenso = 0;
  }

  // FCF yield (0 a ±2) — Método de Value Investing: flujo de caja sobre precio
  if (fin.fcfYield != null) {
    if (fin.fcfYield > 0.08)        { detalle.fcfYield = 2;   score += 2; }
    else if (fin.fcfYield > 0.05)   { detalle.fcfYield = 1.5; score += 1.5; }
    else if (fin.fcfYield > 0.03)   { detalle.fcfYield = 1;   score += 1; }
    else if (fin.fcfYield > 0)      { detalle.fcfYield = 0.5; score += 0.5; }
    else if (fin.fcfYield > -0.05)  { detalle.fcfYield = -0.5; score -= 0.5; }
    else                            { detalle.fcfYield = -1.5; score -= 1.5; }
  } else {
    detalle.fcfYield = 0;
  }

  // Deuda/Patrimonio (0 a ±1.5) — bajo apalancamiento es señal de calidad (Value Investing)
  if (fin.debtToEquity != null) {
    if (fin.debtToEquity > 0 && fin.debtToEquity <= 0.30)  { detalle.deuda = 1.5; score += 1.5; }
    else if (fin.debtToEquity <= 0.60)                     { detalle.deuda = 1;   score += 1; }
    else if (fin.debtToEquity <= 1.0)                      { detalle.deuda = 0.5; score += 0.5; }
    else if (fin.debtToEquity <= 2.0)                      { detalle.deuda = -0.5; score -= 0.5; }
    else if (fin.debtToEquity <= 4.0)                      { detalle.deuda = -1;   score -= 1; }
    else                                                   { detalle.deuda = -1.5; score -= 1.5; }
  } else {
    detalle.deuda = 0;
  }

  return { score: Math.round(score * 10) / 10, detalle };
}

// ─── Detección de contradicciones ──────────────────────────────────

export function detectarContradiccion(
  tecnicoScore: number,
  fundamentalScore: number,
): Contradiccion | null {
  const techEsAlcista = tecnicoScore > 0.3;
  const techEsBajista = tecnicoScore < -0.3;
  const fundEsAlcista = fundamentalScore > 2;
  const fundEsBajista = fundamentalScore < -2;

  if (techEsAlcista && fundEsBajista) {
    const severidad = tecnicoScore > 1 && fundamentalScore < -4 ? 3 : 2;
    return {
      direccion: "tecnico-alcista-fundamental-bajista",
      descripcion: `El análisis técnico sugiere COMPRA (score ${tecnicoScore.toFixed(1)}) pero el fundamental es negativo (${fundamentalScore.toFixed(1)}). Las métricas de valoración no respaldan el momentum alcista: revisar si el movimiento es sostenible.`,
      severidad: severidad as 1 | 2 | 3,
    };
  }

  if (techEsBajista && fundEsAlcista) {
    const severidad = tecnicoScore < -1 && fundamentalScore > 4 ? 3 : 2;
    return {
      direccion: "tecnico-bajista-fundamental-alcista",
      descripcion: `El análisis técnico sugiere VENTA (score ${tecnicoScore.toFixed(1)}) pero el fundamental es positivo (${fundamentalScore.toFixed(1)}). La empresa está fundamentalmente sólida pero el precio podría estar corrigiendo: posible oportunidad de compra en corrección.`,
      severidad: severidad as 1 | 2 | 3,
    };
  }

  return null;
}

// ─── Coherencia entre métodos de valuación (BLOQUE 3) ────────────────
// Fuente: Pascale, Cap. 13, punto 13.4 (tabla de los 3 métodos de VPN).
// Bajo condiciones teóricas normales de mercado, WACC y APV deben converger
// al mismo resultado. Si divergen > umbral (en puntos porcentuales de margen
// de seguridad), algo del supuesto de estructura de capital estable no se
// cumple en la vida del proyecto — señal de alerta metodológica, no un
// promedio ciego que la esconda.

const DEFAULT_UMBRAL_DIVERGENCIA_PP = 15;

export function detectarDivergenciaMetodosValuacion(
  waccMargen: number | null | undefined,
  apvMargen: number | null | undefined,
  umbralPuntosPorcentuales = DEFAULT_UMBRAL_DIVERGENCIA_PP,
): Contradiccion | null {
  if (waccMargen == null || apvMargen == null || !isFinite(waccMargen) || !isFinite(apvMargen)) {
    return null;
  }
  const diff = Math.abs(waccMargen - apvMargen);
  if (diff <= umbralPuntosPorcentuales) {
    return null;
  }
  const severidad: 1 | 2 | 3 = diff > 30 ? 3 : diff > 20 ? 2 : 1;
  return {
    direccion: "divergencia-metodos-valuacion",
    descripcion:
      `Divergencia metodológica entre WACC y APV (|${waccMargen.toFixed(1)} − ${apvMargen.toFixed(1)}| = ${diff.toFixed(1)}pp > umbral ${umbralPuntosPorcentuales}pp). ` +
      `Según Pascale (Cap. 13, 13.4), ambos métodos deberían converger bajo condiciones teóricas normales de mercado; ` +
      `si no convergen, el supuesto de estructura de capital estable (relación deuda/fondos propios) no se cumple en la ` +
      `vida del proyecto. Verificar la consistencia de la estructura de capital antes de confiar en el margen promedio.`,
    severidad,
  };
}

// ─── Score unificado principal ─────────────────────────────────────
// LEGACY: cálculo propio conservado (ver FASE 6 en cabecera de archivo).

export function calcularScoreUnificado(
  tecnico: ScoreTecnicoResult,
  fundamentos: ScoreFundamentalInput,
  infoActivo: InfoActivo,
): ScoreUnificadoResult {
  const pesos = PESOS_POR_TIPO[infoActivo.tipo] ?? PESOS_POR_TIPO.OTRO;
  const { score: fundamentalScore, detalle: fundamentalDetalle } = calcularScoreFundamental(fundamentos);

  // Normalizar scores a escala común (-10 a +10)
  const tecnicoNorm = tecnico.scoreFinal * 4; // scoreFinal ~ -2.5 a +2.5 → -10 a +10
  const fundNorm = fundamentalScore;

  // Score combinado con pesos por tipo de activo
  const total = tecnicoNorm * pesos.tecnico + fundNorm * pesos.fundamental;

  // Detectar contradicciones
  const contradiccion = infoActivo.soportaFundamental
    ? detectarContradiccion(tecnico.scoreFinal, fundamentalScore)
    : null;

  // Clasificación final (escala normalizada)
  let clasificacion: ScoreUnificadoResult["clasificacion"];
  if (total > 5) clasificacion = "COMPRA";
  else if (total > 1.5) clasificacion = "COMPRA CON CAUTELA";
  else if (total > -1.5) clasificacion = "MANTENER";
  else if (total > -5) clasificacion = "REDUCIR";
  else clasificacion = "VENTA";

  // Interpretación
  let interpretacion: string;
  if (contradiccion) {
    interpretacion = `⚠️ Señales mixtas: ${contradiccion.descripcion}`;
  } else if (total > 3) {
    interpretacion = `Perspectiva favorable: el análisis ${infoActivo.soportaFundamental ? "técnico y fundamental" : "técnico"} coinciden en una visión positiva.`;
  } else if (total < -3) {
    interpretacion = `Perspectiva desfavorable: el análisis ${infoActivo.soportaFundamental ? "técnico y fundamental" : "técnico"} coinciden en una visión negativa.`;
  } else if (!infoActivo.soportaFundamental) {
    interpretacion = `Sin datos fundamentales para ${infoActivo.descripcion}. Análisis basado solo en técnica.`;
  } else {
    interpretacion = "Señales mixtas sin dominancia clara. Revisar detalle de cada análisis.";
  }

  // Construir señales
  const senales: SenalUnificada[] = [
    {
      origen: "tecnico",
      label: `Técnico: ${tecnico.clasificacion} (score ${tecnico.scoreFinal.toFixed(2)})`,
      tone: tecnico.scoreFinal > 0.3 ? "good" : tecnico.scoreFinal < -0.3 ? "bad" : "neutral",
      peso: pesos.tecnico,
    },
  ];

  if (infoActivo.soportaFundamental) {
    senales.push({
      origen: "fundamental",
      label: `Fundamental: score ${fundamentalScore >= 0 ? "+" : ""}${fundamentalScore.toFixed(1)}`,
      tone: fundNorm > 2 ? "good" : fundNorm < -2 ? "bad" : "neutral",
      peso: pesos.fundamental,
    });
  }

  senales.push({
    origen: "unificado",
    label: `Score unificado: ${total >= 0 ? "+" : ""}${total.toFixed(1)} → ${clasificacion}`,
    tone: total > 1.5 ? "good" : total < -1.5 ? "bad" : "neutral",
    peso: 1,
  });

  return {
    tecnico,
    fundamental: fundamentalScore,
    fundamentalDetalle,
    total: Math.round(total * 100) / 100,
    clasificacion,
    contradiccion,
    interpretacion,
    senales,
  };
}
