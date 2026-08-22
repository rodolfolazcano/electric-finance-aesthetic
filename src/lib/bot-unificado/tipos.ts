/**
 * Tipos del Bot Unificado de Señales CORONAR (acciones BCBA + CEDEARs).
 *
 * Arquitectura híbrida: cada estrategia cuantitativa produce CANDIDATOS con
 * datos reales; el agente de razonamiento del chat lateral (mismo stack NVIDIA
 * + skills académicas) los valida, enriquece y redacta; el motor filtra
 * duplicados, envía por Telegram y persiste el estado.
 */

export type DireccionSenal = "COMPRA" | "VENTA" | "NEUTRAL";

/** Candidato bruto producido por un scanner cuantitativo. */
export type CandidatoSenal = {
  /** id de la estrategia que lo generó */
  estrategia: string;
  tickerBCBA: string;
  tickerUS: string;
  direccion: DireccionSenal;
  precio: number | null;
  /** niveles sugeridos (stop / objetivo / entrada) en texto corto */
  nivel: string | null;
  prob: number;
  motivo: string;
  /** métricas cuantitativas que respaldan la señal (z-score, RSI, etc.) */
  metricas: Record<string, number | string | null>;
};

/** Señal final validada y redactada por el agente de razonamiento. */
export type SenalFinal = {
  estrategia: string;
  tickerBCBA: string;
  tickerUS: string;
  senal: "COMPRA" | "COMPRA CON CAUTELA" | "MANTENER" | "REDUCIR" | "VENTA";
  precio: number | null;
  variacion1d: number | null;
  motivo: string;
  nivel: string | null;
  confianza: number;
  fuente: string;
  validadaPorAgente: boolean;
};

export type ResultadoCiclo = {
  iniciadoEn: string;
  duracionMs: number;
  disparo: "scheduler" | "manual" | "cron-externo";
  estrategiasCorridas: string[];
  candidatos: number;
  senales: SenalFinal[];
  resumenAgente: string | null;
  enviadasTelegram: number;
  errores: string[];
};

export type ConfigEstrategiaBot = {
  id: string;
  nombre: string;
  descripcion: string;
  fuenteAcademica: string;
  activa: boolean;
  /** frecuencia mínima entre corridas, en minutos */
  cadaMinutos: number;
  /** ventana horaria opcional en hora Argentina (ART). null = todo el día */
  desde?: string | null;
  hasta?: string | null;
};

export type ConfigBotUnificado = {
  activo: boolean;
  telegramEnviar: boolean;
  maxSenalesPorCiclo: number;
  /** dedupe: horas mínimas para repetir mismo ticker+dirección */
  cooldownHoras: number;
  probMinimaEnvio: number;
  estrategias: ConfigEstrategiaBot[];
  actualizadaEn: string;
};

export type RegistroSenalEnviada = {
  ticker: string;
  direccion: string;
  estrategia: string;
  prob: number;
  fecha: string;
};

export type RegistroCiclo = {
  fecha: string;
  disparo: ResultadoCiclo["disparo"];
  estrategias: string[];
  candidatos: number;
  enviadas: number;
  ok: boolean;
  error?: string;
};
