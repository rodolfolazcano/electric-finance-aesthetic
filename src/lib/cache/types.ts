export type FuenteAPI = "yahoo" | "iol" | "bcra" | "argentina_datos" | "binance";

export interface CacheEntry<T> {
  cacheKey: string;
  fuente: FuenteAPI;
  payload: T;
  fetchedAt: string;
  ttlSeconds: number;
  stale: boolean;
}

export const TTL_POR_TIPO = {
  precioVivo: 90, // 90 segundos para precios en vivo
  fundamentals: 86400, // 24 horas para fundamentales (cambian lentamente)
  perfilEmpresa: 604800, // 7 días para perfil de empresa (cambia muy raramente)
  macroBcra: 21600, // 6 horas para datos macro BCRA
  historicoChart: 30 * 86400, // 30 días para histórico de precios (rara vez cambia)
  earningsHistory: 43200, // 12 horas para earnings history (cambia quarterly)
  recommendationTrend: 21600, // 6 horas para recomendaciones de analistas
  benchmark: 86400, // 24 horas para benchmarks (cambian lentamente)
} as const;
