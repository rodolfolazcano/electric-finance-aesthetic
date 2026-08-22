/**
 * AGENDA ECONÓMICA CURADA MANUALMENTE
 *
 * Elegimos OPCIÓN A (ver README de decisiones en este directorio):
 * - 100% curada a mano, sin paso por Gemini ni Google Search grounding.
 * - Gemini SOLO reordena y resume estos eventos en el informe final;
 *   NUNCA los genera, modifica fechas o agrega eventos por su cuenta.
 * - Esto elimina por completo el riesgo de alucinación de fechas, horarios
 *   o eventos inexistentes que tendría la Opción B (grounding).
 *
 * Instrucciones de mantenimiento:
 *   1. Actualizar esta lista CADA VIERNES para la semana siguiente.
 *   2. Fuentes: BCRA (licitaciones), INDEC (IPC), Fed (FOMC), Ministerio
 *      de Economía (vencimientos), Bloomberg/Econoday (datos internacionales).
 *   3. Los eventos sin hora fija usar "00:00" y el campo hora se omite
 *      en la UI (solo se muestra la fecha).
 *   4. Si un evento se confirma después del viernes, editar directamente.
 *
 * Categorías cubiertas:
 *   - BCRA: licitaciones de LECAPs, licitaciones de bonos, tasas de referencia
 *   - INDEC: IPC, EMAE, desempleo, actividad industrial
 *   - Fed: decisiones FOMC, minutas
 *   - Tesoro EUA: subastas de treasuries
 *   - Economía Argentina: vencimientos de deuda, licitaciones
 *   - Datos internacionales: CPI EUA, Payrolls, PBI, PMIs
 */

import type { AgendaEvento } from "./types";

type Mes = number; // 1-12
type Dia = number; // 1-31

interface EventoFijo {
  mes: Mes;
  dia: Dia;
  hora: string;
  evento: string;
  relevancia: AgendaEvento["relevancia"];
  /** Semana del mes aproximada cuando el día exacto varía (ej: "2da semana") */
  ventana?: string;
}

/**
 * AGENDA SEMANA DEL 6 AL 10 DE JULIO 2026
 * ===========================================
 * Pendiente: actualizar cada viernes para la semana siguiente.
 *
 * Eventos confirmados para esta semana:
 *
 * LUNES 6
 *   - Alemania: Producción industrial (mayo)
 *
 * MARTES 7
 *   - INDEC: Índice de Producción Industrial (mayo)
 *   - Brasil: IPC-FIPE (semanal)
 *
 * MIÉRCOLES 8
 *   - EUA: Inventarios mayoristas (mayo)
 *   - EUA: Subasta Treasury 10Y
 *   - BCRA: licitación LECAPs
 *
 * JUEVES 9
 *   - EUA: CPI (junio)
 *   - EUA: Subasta Treasury 30Y
 *   - Argentina: vencimiento corto BONCAP 2026
 *
 * VIERNES 10
 *   - Brasil: IPC-IBGE (junio)
 *   - Canadá: empleo (junio)
 */

const EVENTOS_FIJOS: EventoFijo[] = [
  // ─── Lunes 6 ───────────────────────────────────────────
  { mes: 7, dia: 6, hora: "08:00", evento: "Alemania: Producción industrial (mayo)", relevancia: "media" },

  // ─── Martes 7 ──────────────────────────────────────────
  { mes: 7, dia: 7, hora: "16:00", evento: "INDEC: Índice de Producción Industrial (mayo)", relevancia: "alta" },
  { mes: 7, dia: 7, hora: "09:00", evento: "Brasil: IPC-FIPE (semanal)", relevancia: "media" },

  // ─── Miércoles 8 ───────────────────────────────────────
  { mes: 7, dia: 8, hora: "10:30", evento: "EUA: Inventarios mayoristas (mayo)", relevancia: "media" },
  { mes: 7, dia: 8, hora: "13:00", evento: "EUA: Subasta Treasury 10Y", relevancia: "alta" },
  { mes: 7, dia: 8, hora: "15:00", evento: "BCRA: licitación LECAPs", relevancia: "alta" },

  // ─── Jueves 9 ──────────────────────────────────────────
  { mes: 7, dia: 9, hora: "08:30", evento: "EUA: CPI (junio)", relevancia: "alta" },
  { mes: 7, dia: 9, hora: "13:00", evento: "EUA: Subasta Treasury 30Y", relevancia: "alta" },
  { mes: 7, dia: 9, hora: "00:00", evento: "Argentina: vencimiento corto BONCAP 2026", relevancia: "media" },

  // ─── Viernes 10 ────────────────────────────────────────
  { mes: 7, dia: 10, hora: "09:00", evento: "Brasil: IPC-IBGE (junio)", relevancia: "alta" },
  { mes: 7, dia: 10, hora: "08:30", evento: "Canadá: empleo (junio)", relevancia: "media" },

  // ─── Eventos recurrentes sin fecha fija esta semana ────
  // (se agregan manualmente cuando se confirma la fecha exacta)
];

/**
 * Filtra los eventos de la semana actual y los devuelve como AgendaEvento[]
 * listos para inyectar en MarketContextSnapshot.agendaDelDia.
 *
 * Gemini recibe esto como parte del snapshot y puede REORDENAR y RESUMIR
 * los eventos en el informe final, pero NUNCA genera eventos nuevos ni
 * modifica fechas.
 */
export function getAgendaSemana(fechaISO: string): AgendaEvento[] {
  const fecha = new Date(fechaISO + "T12:00:00-03:00");
  const mesActual = fecha.getMonth() + 1;
  const diaActual = fecha.getDate();

  // Traer eventos del día actual y siguientes (hasta el viernes de esta semana)
  const diaSemana = fecha.getDay(); // 0=domingo
  const diasRestantes = diaSemana === 0 ? 0 : 6 - diaSemana;

  const eventos: AgendaEvento[] = [];

  for (const ev of EVENTOS_FIJOS) {
    if (ev.mes !== mesActual) continue;

    const diff = ev.dia - diaActual;
    if (diff < 0 || diff > diasRestantes) continue;

    eventos.push({
      hora: ev.hora,
      evento: ev.evento,
      relevancia: ev.relevancia,
    });
  }

  return eventos.sort((a, b) => a.hora.localeCompare(b.hora));
}
