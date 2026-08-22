// src/lib/coherencia/flags.ts
// Flags determinísticos de coherencia cruzada.
// Gemini NO detecta flags — solo recibe estos y los redacta en lenguaje llano.

import type { AssetScoreDiario } from "../scoring/types";
import type { PositionEnriquecida } from "../diagnostico/types";

export type Severidad = "alta" | "media" | "baja";

export interface FlagCoherencia {
  tipo: string;
  severidad: Severidad;
  detalle: string;
  activos?: string[];
}

// ── Flags por activo individual ─────────────────────────

export function generarFlagsPorActivo(activo: AssetScoreDiario): FlagCoherencia[] {
  const flags: FlagCoherencia[] = [];

  // 1. Divergencia técnico-fundamental
  if (activo.scoreTecnico != null && activo.scoreFundamental != null) {
    if (activo.scoreTecnico - activo.scoreFundamental > 30) {
      flags.push({
        tipo: "divergencia-tecnico-fundamental",
        severidad: "media",
        detalle: `${activo.ticker}: El precio muestra fortaleza técnica (score ${activo.scoreTecnico}) pero los fundamentos no acompañan (score ${activo.scoreFundamental}) — posible sobreextensión.`,
        activos: [activo.ticker],
      });
    }
    if (activo.scoreFundamental - activo.scoreTecnico > 30) {
      flags.push({
        tipo: "divergencia-fundamental-tecnico",
        severidad: "media",
        detalle: `${activo.ticker}: Los fundamentos son sólidos (score ${activo.scoreFundamental}) pero el precio no lo refleja (score técnico ${activo.scoreTecnico}) — posible oportunidad de valor.`,
        activos: [activo.ticker],
      });
    }
  }

  // 2. Noticias negativas vs momentum positivo
  if (activo.scoreNoticias != null && activo.scoreNoticias < 30 && activo.scoreTecnico != null && activo.scoreTecnico > 70) {
    flags.push({
      tipo: "noticias-negativas-vs-momentum-positivo",
      severidad: "alta",
      detalle: `${activo.ticker}: Noticias recientes negativas (score ${activo.scoreNoticias}) todavía no se reflejaron en el precio que sigue alcista (score técnico ${activo.scoreTecnico}).`,
      activos: [activo.ticker],
    });
  }

  // 3. Beta poco confiable (R² bajo)
  if (activo.datosRaw.rSquared != null && activo.datosRaw.rSquared < 0.3) {
    flags.push({
      tipo: "beta-poco-confiable",
      severidad: "baja",
      detalle: `${activo.ticker}: El beta (${activo.datosRaw.beta?.toFixed(2) ?? "N/A"}) contra el benchmark tiene baja significancia (R² = ${(activo.datosRaw.rSquared * 100).toFixed(0)}%). Tomar con cautela.`,
      activos: [activo.ticker],
    });
  }

  // 4. Score alto pero Sharpe negativo
  if (activo.scoreCompuesto > 70 && activo.datosRaw.sharpe != null && activo.datosRaw.sharpe < 0) {
    flags.push({
      tipo: "score-alto-sharpe-negativo",
      severidad: "media",
      detalle: `${activo.ticker}: Score compuesto alto (${activo.scoreCompuesto}) pero retorno ajustado por riesgo negativo (Sharpe ${activo.datosRaw.sharpe.toFixed(2)}). Revisar si el score está sobreponderando factores no relacionados al rendimiento.`,
      activos: [activo.ticker],
    });
  }

  // 5. Duration muy larga con TIR baja
  if (activo.datosRaw.duration != null && activo.datosRaw.tir != null) {
    if (activo.datosRaw.duration > 5 && activo.datosRaw.tir < 0.05) {
      flags.push({
        tipo: "duration-larga-tir-baja",
        severidad: "alta",
        detalle: `${activo.ticker}: Duration de ${activo.datosRaw.duration.toFixed(1)} años con TIR de ${(activo.datosRaw.tir * 100).toFixed(2)}% — riesgo de tasa no compensado.`,
        activos: [activo.ticker],
      });
    }
  }

  return flags;
}

// ── Flags a nivel portafolio ────────────────────────────

export interface CorrelacionPar {
  tickerA: string;
  tickerB: string;
  correlacion: number;
}

export function generarFlagsPortafolio(
  posiciones: PositionEnriquecida[],
  correlacionesAltas: CorrelacionPar[],
): FlagCoherencia[] {
  const flags: FlagCoherencia[] = [];

  // 6. Concentración excesiva en un activo
  for (const p of posiciones) {
    if (p.pesoPct > 30) {
      flags.push({
        tipo: "concentracion-excesiva",
        severidad: "alta",
        detalle: `${p.ticker} concentra el ${p.pesoPct.toFixed(1)}% del portafolio — riesgo idiosincrático elevado.`,
        activos: [p.ticker],
      });
    }
  }

  // 7. Diversificación limitada (correlación > 0.85 entre pares)
  for (const par of correlacionesAltas) {
    flags.push({
      tipo: "diversificacion-limitada",
      severidad: "media",
      detalle: `${par.tickerA} y ${par.tickerB} tienen correlación de ${(par.correlacion * 100).toFixed(0)}% — no aportan diversificación entre sí aunque individualmente scoreen bien.`,
      activos: [par.tickerA, par.tickerB],
    });
  }

  // 8. Sin cobertura cambiaria si hay activos en USD y ARS mezclados
  const monedas = new Set(posiciones.map((p) => {
    if (p.rentaFija) return "ARS";
    if (p.rentaVariable?.beta != null) return p.ticker.includes("D") ? "USD" : "ARS";
    return "ARS";
  }));
  if (monedas.size > 1) {
    flags.push({
      tipo: "exposicion-cambiaria-mixta",
      severidad: "baja",
      detalle: "El portafolio combina activos en ARS y USD sin cobertura cambiaria explícita — el rendimiento en pesos depende del tipo de cambio futuro.",
    });
  }

  // 9. Sobreponderación de un sector (si hay datos de sector disponibles)
  const sectorCount = new Map<string, number>();
  for (const p of posiciones) {
    if (p.rentaVariable) {
      const sector = "N/A";
      sectorCount.set(sector, (sectorCount.get(sector) ?? 0) + p.pesoPct);
    }
  }

  return flags;
}

// ── Agregador para informe ──────────────────────────────

export function generarTodosLosFlags(
  scores: AssetScoreDiario[],
  posiciones: PositionEnriquecida[],
  correlacionesAltas: CorrelacionPar[],
): FlagCoherencia[] {
  const flags: FlagCoherencia[] = [];

  for (const s of scores) {
    flags.push(...generarFlagsPorActivo(s));
  }

  flags.push(...generarFlagsPortafolio(posiciones, correlacionesAltas));

  return flags;
}
