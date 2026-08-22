/**
 * Calendario de mercado XBUE (BCBA).
 * No hay librería TypeScript para feriados argentinos, así que usamos
 * un enfoque híbrido: tabla de feriados fijos + regla de finde.
 */

// Feriados inamovibles 2024-2026 (fuente: BCRA/CNV)
const FERIADOS_FIJOS: Record<string, string[]> = {
  "2024": ["2024-01-01", "2024-02-12", "2024-02-13", "2024-03-24", "2024-03-29", "2024-04-01", "2024-04-02",
    "2024-05-01", "2024-05-25", "2024-06-17", "2024-06-20", "2024-07-09", "2024-08-19", "2024-10-11",
    "2024-11-18", "2024-12-08", "2024-12-25"],
  "2025": ["2025-01-01", "2025-03-03", "2025-03-04", "2025-03-24", "2025-04-17", "2025-04-18",
    "2025-05-01", "2025-05-25", "2025-06-16", "2025-06-20", "2025-07-09", "2025-08-18", "2025-10-13",
    "2025-11-24", "2025-12-08", "2025-12-25"],
  "2026": ["2026-01-01", "2026-02-16", "2026-02-17", "2026-03-24", "2026-04-02", "2026-04-03",
    "2026-05-01", "2026-05-25", "2026-06-15", "2026-06-20", "2026-07-09", "2026-08-17", "2026-10-12",
    "2026-11-30", "2026-12-08", "2026-12-25"],
};

function esFeriado(dateStr: string): boolean {
  const year = dateStr.slice(0, 4);
  return FERIADOS_FIJOS[year]?.includes(dateStr) ?? false;
}

function esFinDeSemana(date: Date): boolean {
  const d = date.getDay();
  return d === 0 || d === 6;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Cuenta días hábiles XBUE (sin feriados ni findes) entre dos fechas.
 * startDate y endDate inclusive.
 */
export function countBusinessDays(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const ds = toDateStr(cursor);
    if (!esFinDeSemana(cursor) && !esFeriado(ds)) {
      count++;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Convierte días hábiles a fracción de año (base 252).
 */
export function businessDaysToYear(dias: number): number {
  return dias / 252;
}

/**
 * Días hábiles entre hoy y una fecha de vencimiento, en fracción de año.
 */
export function timeToExpiry(vencimiento: string): number {
  const hoy = toDateStr(new Date());
  if (vencimiento <= hoy) return 0;
  const dias = countBusinessDays(hoy, vencimiento);
  return businessDaysToYear(dias);
}

/**
 * Lista de fechas hábiles entre dos fechas (útil para pricing diario).
 */
export function businessDaysRange(startDate: string, endDate: string): string[] {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const ds = toDateStr(cursor);
    if (!esFinDeSemana(cursor) && !esFeriado(ds)) {
      days.push(ds);
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
