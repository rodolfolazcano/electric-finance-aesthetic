import sectoresData from "../sectores.json";

export type PerfilSector = {
  fundamental: Record<string, number>; // suma de pesos = 1.0
  tecnico: Record<string, number>;       // suma de pesos = 1.0
  sensibilidadTasas: "alta" | "media" | "baja";
  sensibilidadCommodity: "alta" | "media" | "baja";
  justificacion: string;
};

export const PERFILES_SECTOR: Record<string, PerfilSector> = {
  "Tecnología": {
    fundamental: { crecimientoIngresos: 0.35, margenOperativo: 0.25, reinversionRD: 0.15, calidadBalance: 0.25 },
    tecnico: { momentum: 0.5, posicion52w: 0.3, cruceMedias: 0.2 },
    sensibilidadTasas: "alta",
    sensibilidadCommodity: "baja",
    justificacion: "Crecimiento y márgenes pesan más que dividendos. Ciclo temprano, muy sensible a ^TNX: yields subiendo fuerte deprime valuación de flujos futuros."
  },
  "Energía": {
    fundamental: { correlacionCommodity: 0.4, capexEficiencia: 0.25, margenOperativo: 0.2, deuda: 0.15 },
    tecnico: { momentum: 0.4, correlacionUSO: 0.35, posicion52w: 0.25 },
    sensibilidadTasas: "baja",
    sensibilidadCommodity: "alta",
    justificacion: "El precio del activo depende más de USO/petróleo que de crecimiento propio de la empresa. CAPEX intensivo, ciclo tardío."
  },
  "Materiales Básicos": {
    fundamental: { correlacionCommodity: 0.35, capexEficiencia: 0.25, margenOperativo: 0.2, deuda: 0.2 },
    tecnico: { momentum: 0.35, correlacionCommodityCanasta: 0.4, posicion52w: 0.25 },
    sensibilidadTasas: "media",
    sensibilidadCommodity: "alta",
    justificacion: "Similar a Energía pero correlaciona contra una canasta (GLD/COPX/DBA) en vez de un solo commodity. Ciclo medio-tardío."
  },
  "Servicios Financieros": {
    fundamental: { calidadActivos: 0.3, apalancamiento: 0.25, roe: 0.25, crecimientoIngresos: 0.2 },
    tecnico: { correlacionYieldCurve: 0.4, momentum: 0.35, posicion52w: 0.25 },
    sensibilidadTasas: "alta",
    sensibilidadCommodity: "baja",
    justificacion: "Muy sensible a la pendiente de la curva (TLT/IEF/SHY) y al nivel de tasas — no al nivel absoluto de precio de un commodity. Suele anticipar el próximo ciclo de baja de tasas."
  },
  "Consumo Cíclico": {
    fundamental: { crecimientoIngresos: 0.3, margenOperativo: 0.25, calidadBalance: 0.2, dividendos: 0.25 },
    tecnico: { momentum: 0.45, posicion52w: 0.3, cruceMedias: 0.25 },
    sensibilidadTasas: "media",
    sensibilidadCommodity: "baja",
    justificacion: "Sensible a empleo/confianza del consumidor más que a tasas o commodities directamente. Ciclo temprano-medio."
  },
  "Defensiva del Consumidor": {
    fundamental: { estabilidadMargen: 0.35, dividendos: 0.3, calidadBalance: 0.2, crecimientoIngresos: 0.15 },
    tecnico: { momentum: 0.3, posicion52w: 0.3, betaBaja: 0.4 },
    sensibilidadTasas: "baja",
    sensibilidadCommodity: "media",
    justificacion: "Defensivo: estabilidad y dividendo pesan más que crecimiento. Ciclo de contracción temprana."
  },
  "Acciones Industriales": {
    fundamental: { crecimientoIngresos: 0.25, capexEficiencia: 0.25, margenOperativo: 0.25, deuda: 0.25 },
    tecnico: { momentum: 0.4, correlacionActividadGlobal: 0.35, posicion52w: 0.25 },
    sensibilidadTasas: "media",
    sensibilidadCommodity: "media",
    justificacion: "Cíclico, CAPEX intensivo, exposición global. Ciclo de expansión media."
  },
  "Cuidado de la Salud": {
    fundamental: { estabilidadMargen: 0.3, crecimientoIngresos: 0.25, calidadBalance: 0.2, dividendos: 0.25 },
    tecnico: { momentum: 0.3, posicion52w: 0.3, betaBaja: 0.4 },
    sensibilidadTasas: "baja",
    sensibilidadCommodity: "baja",
    justificacion: "Defensivo con componente de crecimiento (biotech/farma). Regulatorio pesa más que macro. Ciclo de contracción temprana."
  },
  "Utilidades": {
    fundamental: { dividendos: 0.4, estabilidadMargen: 0.3, deuda: 0.3 },
    tecnico: { correlacionYieldCurve: 0.4, betaBaja: 0.35, momentum: 0.25 },
    sensibilidadTasas: "alta",
    sensibilidadCommodity: "media",
    justificacion: "Proxy de bono (dividendo estable), muy sensible a tasas por descuento de flujo. Ciclo de contracción tardía."
  },
  "Servicios de Comunicación": {
    fundamental: { crecimientoIngresos: 0.3, margenOperativo: 0.25, reinversionRD: 0.2, calidadBalance: 0.25 },
    tecnico: { momentum: 0.45, posicion52w: 0.3, cruceMedias: 0.25 },
    sensibilidadTasas: "media",
    sensibilidadCommodity: "baja",
    justificacion: "Mezcla de telcos defensivas (dividendo) y media/tech de crecimiento — perfil híbrido, revisar dispersión intra-sector antes de promediar."
  },
  "Bienes Raíces": {
    fundamental: { dividendos: 0.35, calidadBalance: 0.3, deuda: 0.35 },
    tecnico: { correlacionYieldCurve: 0.45, betaBaja: 0.3, momentum: 0.25 },
    sensibilidadTasas: "alta",
    sensibilidadCommodity: "baja",
    justificacion: "REITs: muy sensible a tasas (costo de financiamiento + descuento de flujo), poco a commodities. Solo 3 tickers en el JSON — dispersión alta, tratar con cautela estadística."
  },
  DEFAULT: {
    fundamental: { crecimientoIngresos: 0.25, margenOperativo: 0.25, calidadBalance: 0.25, dividendos: 0.25 },
    tecnico: { momentum: 0.4, posicion52w: 0.3, cruceMedias: 0.3 },
    sensibilidadTasas: "media",
    sensibilidadCommodity: "media",
    justificacion: "Perfil neutro — se usa SOLO si un ticker no matchea ningún sector del JSON. Debe loguearse como warning cada vez que se use."
  }
};

//  Mapa de normalización: nombres en sectores.json → clave de PERFILES_SECTOR 
const MAP_SECTOR_A_PERFIL: Record<string, string> = {
  "Technology": "Tecnología",
  "Tecnología": "Tecnología",
  "Communication Services": "Servicios de Comunicación",
  "Servicios de Comunicación": "Servicios de Comunicación",
  "Consumer Cyclical": "Consumo Cíclico",
  "Consumo Cíclico": "Consumo Cíclico",
  "Energy": "Energía",
  "Energía": "Energía",
  "Financial Services": "Servicios Financieros",
  "Servicios financieros": "Servicios Financieros",
  "Servicios Financieros": "Servicios Financieros",
  "Industrials": "Acciones Industriales",
  "Acciones Industriales": "Acciones Industriales",
  "Acciones industriales": "Acciones Industriales",
  "Consumer Defensive": "Defensiva del Consumidor",
  "Defensiva del Consumidor": "Defensiva del Consumidor",
  "Defensiva del consumidor": "Defensiva del Consumidor",
  "Utilities": "Utilidades",
  "Utilidades": "Utilidades",
  "Basic Materials": "Materiales Básicos",
  "Materiales Básicos": "Materiales Básicos",
  "Materiales basicos": "Materiales Básicos",
  "Healthcare": "Cuidado de la Salud",
  "Cuidado de la Salud": "Cuidado de la Salud",
  "Cuidado de la salud": "Cuidado de la Salud",
  "Real Estate": "Bienes Raíces",
  "Bienes Raíces": "Bienes Raíces",
  "Bienes raíces": "Bienes Raíces",
};

//  Índice invertido: ticker → sector (primer match gana) 
const TICKER_TO_SECTOR = new Map<string, string>();
for (const [sector, industrias] of Object.entries(sectoresData)) {
  for (const tickers of Object.values(industrias as Record<string, unknown>)) {
    if (!Array.isArray(tickers)) continue;
    for (const entry of tickers) {
      const t = typeof entry === "string" ? entry : (entry as { ticker?: string })?.ticker;
      if (t) TICKER_TO_SECTOR.set(t.toUpperCase(), sector);
    }
  }
}

export function buscarSectorPorTicker(ticker: string): string | null {
  return TICKER_TO_SECTOR.get(ticker.toUpperCase()) ?? null;
}

export function buscarPerfilPorTicker(ticker: string): {
  perfil: PerfilSector;
  sector: string;
  esDefault: boolean;
} {
  const sectorEn = buscarSectorPorTicker(ticker);
  if (!sectorEn) {
    // eslint-disable-next-line no-console
    console.warn(`[SectorProfile] Ticker "${ticker}" no encontrado en sectores.json — usando DEFAULT`);
    return { perfil: PERFILES_SECTOR.DEFAULT, sector: "UNKNOWN", esDefault: true };
  }
  const sectorEs = MAP_SECTOR_A_PERFIL[sectorEn];
  if (!sectorEs || !PERFILES_SECTOR[sectorEs]) {
    // eslint-disable-next-line no-console
    console.warn(`[SectorProfile] Sector "${sectorEn}" (ticker=${ticker}) no tiene perfil definido — usando DEFAULT`);
    return { perfil: PERFILES_SECTOR.DEFAULT, sector: sectorEn, esDefault: true };
  }
  return { perfil: PERFILES_SECTOR[sectorEs], sector: sectorEs, esDefault: false };
}
