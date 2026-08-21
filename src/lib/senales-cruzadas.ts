// src/lib/senales-cruzadas.ts
// Señales cruzadas: combina mejora/empeora del semáforo (técnico + fundamental)
// con señales fundamentales discretas (earnings, etc.) dentro de una ventana.

import type { SenalSemaforo } from "./senales-tecnicas";
import type { SenalFundamental } from "./senales-fundamentales";

export const VENTANA_DEFAULT_DIAS = 15;

export type DireccionCruzada = "alcista" | "bajista" | "neutral";

export interface SenalCruzada {
  direccion: DireccionCruzada;
  senalSemaforo: SenalSemaforo;
  senalFundamental: SenalFundamental;
  fechaConfirmacion: string;
  precioConfirmacion: number;
  diasEntreSenales: number;
  descripcion: string;
}

export function detectarSenalesCruzadas(
  senalesSemaforo: SenalSemaforo[],
  senalesFundamentales: SenalFundamental[],
  ventanaMaximaDias: number = VENTANA_DEFAULT_DIAS,
): SenalCruzada[] {
  const cruzadas: SenalCruzada[] = [];

  for (const ss of senalesSemaforo) {
    const fechaSS = new Date(ss.fecha).getTime();

    // Buscar señal fundamental dentro de la ventana (antes o después de la semáforo)
    const candidatas = senalesFundamentales.filter((sf) => {
      const fechaSF = new Date(sf.fechaPublicacion).getTime();
      const diff = Math.abs(fechaSF - fechaSS) / (1000 * 60 * 60 * 24);
      return diff <= ventanaMaximaDias;
    });

    for (const sf of candidatas) {
      const fechaSF = new Date(sf.fechaPublicacion).getTime();
      const diffDias = Math.round(Math.abs(fechaSF - fechaSS) / (1000 * 60 * 60 * 24));

      // Determinar dirección
      const esAlcistaSemaforo = ss.tipo === "mejora";
      const esAlcistaFundamental = [
        "earnings_beat", "upgrade_analista",
        "mejora_score_fundamental", "revalorizacion_pe",
      ].includes(sf.tipo);

      let direccion: DireccionCruzada;
      if (esAlcistaSemaforo && esAlcistaFundamental) {
        direccion = "alcista";
      } else if (!esAlcistaSemaforo && !esAlcistaFundamental) {
        direccion = "bajista";
      } else {
        direccion = "neutral";
      }

      // Fecha de confirmación = la que ocurrió última (cuando ambas señales están disponibles)
      const fechaConfirm = fechaSS > fechaSF ? ss.fecha : sf.fechaPublicacion;
      const precioConfirm = fechaSS > fechaSF ? ss.precio : (sf.precioCierre || ss.precio);

      cruzadas.push({
        direccion,
        senalSemaforo: ss,
        senalFundamental: sf,
        fechaConfirmacion: fechaConfirm,
        precioConfirmacion: precioConfirm,
        diasEntreSenales: diffDias,
        descripcion: `Señal ${direccion}: semáforo ${ss.tipo} (${ss.clasificacionAnterior}→${ss.clasificacionActual}) + ${sf.tipo} en ${diffDias}d`,
      });
    }
  }

  // Ordenar por fecha de confirmación
  cruzadas.sort((a, b) => a.fechaConfirmacion.localeCompare(b.fechaConfirmacion));

  return cruzadas;
}
