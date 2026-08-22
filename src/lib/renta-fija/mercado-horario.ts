/**
 * mercado-horario.ts
 *
 * Helpers para determinar si el mercado BYMA está abierto.
 * Horario: lunes a viernes, 11:00 – 17:00 ART (UTC-3).
 */

export function esMercadoAbierto(now: Date = new Date()): boolean {
  const dia = now.getDay();
  if (dia === 6 || dia === 0) return false; // sábado o domingo

  // Convertir a hora ART (UTC-3)
  const horaART = now.getHours();
  const minutosART = now.getMinutes();
  const horaMinutos = horaART * 60 + minutosART;

  const apertura = 11 * 60;   // 11:00 ART
  const cierre = 17 * 60;     // 17:00 ART

  return horaMinutos >= apertura && horaMinutos < cierre;
}

/**
 * Próxima fecha hábil BYMA (skip weekends).
 */
export function proximoDiaHabil(fecha: Date = new Date()): Date {
  const d = new Date(fecha);
  d.setDate(d.getDate() + 1);
  if (d.getDay() === 6) d.setDate(d.getDate() + 2); // sábado → lunes
  if (d.getDay() === 0) d.setDate(d.getDate() + 1); // domingo → lunes
  return d;
}
