/**
 * src/lib/crm/recomendaciones.types.ts
 *
 * Tipos compartidos para el sistema de recomendaciones y backtesting del CRM.
 * La fuente única de verdad para estos tipos es ESTE archivo.
 *
 * IMPORTANTE: fundamentoSnapshot y ratioCedearAlMomento se calculan UNA VEZ
 * al crear la recomendación y nunca se recalculan. No exponer un botón de
 * "refrescar fundamento" sobre una recomendación ya creada.
 */

export interface FundamentoSnapshot {
  score: number;
  peTrailing: number | null;
  roe: number | null;
  fcfYield: number | null;
  upsideAnalistas: number | null;
  señal: string;
  origen: "snapshot_original"; // siempre este valor al crear, inmutable
}

export interface Recomendacion {
  id: string;
  clienteId: string;
  tickerIol: string;
  tickerYf: string | null; // null si es bono/ON/letra
  tipoInstrumento: "accion" | "cedear" | "bono" | "on" | "letra" | "fci";
  fechaRecomendacion: string; // ISO
  precioRecomendado: number;
  monedaRecomendada: "ARS" | "USD";
  fundamentoSnapshot: FundamentoSnapshot;
  precioObjetivo: number | null;
  horizonteDias: number | null;
  tesis: string;
  ratioCedearAlMomento: number | null; // capturado de arbitrador.json al crear
}
