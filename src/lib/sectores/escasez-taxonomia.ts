export interface EscasezPerfil {
  leadTimeYears: number;
  tipoEscasez: "estructural" | "ciclica" | "geopolitica" | "tecnologica" | "regulatoria" | "n/a";
  bottleneckFactor: string;
  riesgoGeopolitico: "alto" | "medio" | "bajo";
  dependenciaImportaciones: string[];
  justificacion: string;
}

export const ESCASEZ_TAXONOMIA: Record<string, EscasezPerfil> = {
  Technology: {
    leadTimeYears: 3,
    tipoEscasez: "tecnologica",
    bottleneckFactor:
      "Capacidad de fabricación de semiconductores (TSMC/Samsung) + licencias EE.UU.",
    riesgoGeopolitico: "alto",
    dependenciaImportaciones: [
      "Taiwán (semiconductores 3nm/5nm)",
      "Corea del Sur (memoria HBM)",
      "Japón (wafer substrates)",
    ],
    justificacion:
      "Chips avanzados toman 3-5 años en fabricar (fab). Sin chips no hay crecimiento en AI/nube. Cuello de botella estructural por concentración geográfica de foundries.",
  },
  Semiconductors: {
    leadTimeYears: 4,
    tipoEscasez: "estructural",
    bottleneckFactor:
      "Foundries 3nm/5nm limitadas a TSMC + Intel + Samsung. Equipos ASML (litografía EUV) con backlog de 2 años.",
    riesgoGeopolitico: "alto",
    dependenciaImportaciones: [
      "Taiwán (TSMC 90% chips <7nm)",
      "Países Bajos (ASML)",
      "Japón (químicos especializados)",
    ],
    justificacion:
      "Inviu/Piazza: una fab tarda 4-5 años en construirse y cuesta $10-20B. Déficit estructural de oferta hasta 2027.",
  },
  Energy: {
    leadTimeYears: 7,
    tipoEscasez: "geopolitica",
    bottleneckFactor: "Permisos de perforación + capacidad de refinación + OPEC+ cuotas",
    riesgoGeopolitico: "alto",
    dependenciaImportaciones: [
      "OPEC+ (40% producción global)",
      "Rusia (gas)",
      "Medio Oriente (crudo liviano)",
    ],
    justificacion:
      "Un proyecto upstream tarda 5-10 años desde descubrimiento hasta producción. Refinerías no se construyen nuevas en OECD desde 2000. El verdadero cuello de botella es el spare capacity de OPEC+.",
  },
  "Basic Materials": {
    leadTimeYears: 12,
    tipoEscasez: "estructural",
    bottleneckFactor: "Permisos mineros + construcción de mina + concentración geográfica",
    riesgoGeopolitico: "alto",
    dependenciaImportaciones: [
      "Chile (cobre 28% global)",
      "Congo (cobalto 70%)",
      "China (tierras raras 90%)",
      "Australia (litio 50%)",
    ],
    justificacion:
      "Inviu: una mina de cobre tarda 16-20 años en abrirse desde exploración. Sin nueva oferta = déficit estructural. Cobre, litio, tierras raras son los más críticos para transición energética.",
  },
  Copper: {
    leadTimeYears: 18,
    tipoEscasez: "estructural",
    bottleneckFactor:
      "Descubrimientos decrecientes + leyes de mineral en caída + permisos ambientales",
    riesgoGeopolitico: "alto",
    dependenciaImportaciones: [
      "Chile (producción en declive)",
      "Perú (inestabilidad política)",
      "China (refinación 50%)",
    ],
    justificacion:
      "Piazza: el déficit de cobre estructual es el más profundo desde 1970. Sin nuevos descubrimientos, el gap oferta-demanda llega a 5MT para 2030.",
  },
  Healthcare: {
    leadTimeYears: 10,
    tipoEscasez: "regulatoria",
    bottleneckFactor:
      "Aprobaciones FDA/EMA + patentes + cadena de suministro de ingredientes activos",
    riesgoGeopolitico: "medio",
    dependenciaImportaciones: [
      "India (genéricos 40% mercado US)",
      "China (API ingredientes activos 80%)",
      "Irlanda (tax inversion)",
    ],
    justificacion:
      "Un fármaco tarda 10-15 años en aprobarse. La concentración de API en China-India es un riesgo geopolítico no cubierto. Biotech depende de financiamiento (tasas).",
  },
  "Financial Services": {
    leadTimeYears: 0,
    tipoEscasez: "n/a",
    bottleneckFactor: "Regulación (Basilea III/IV) + márgenes de interés netos",
    riesgoGeopolitico: "bajo",
    dependenciaImportaciones: [],
    justificacion:
      "Sector sin cuello de botella de oferta físico. El bottleneck es regulatorio: requerimientos de capital y estrés tests limitan el apalancamiento.",
  },
  "Consumer Cyclical": {
    leadTimeYears: 1,
    tipoEscasez: "ciclica",
    bottleneckFactor: "Logística marítima (contenedores) + capacidad de manufactura offshore",
    riesgoGeopolitico: "medio",
    dependenciaImportaciones: [
      "China (manufactura 30% global)",
      "Vietnam (textiles)",
      "Bangladesh (calzado)",
    ],
    justificacion:
      "Cuello de botella cíclico: logística se normaliza en 6-12 meses. Dependencia de China para bienes durables es un riesgo geopolítico de mediano plazo.",
  },
  "Consumer Defensive": {
    leadTimeYears: 1,
    tipoEscasez: "ciclica",
    bottleneckFactor: "Cosechas agrícolas (clima) + logística de alimentos",
    riesgoGeopolitico: "bajo",
    dependenciaImportaciones: ["Ucrania (girasol/maíz)", "Brasil (soja)", "Argentina (maíz/soja)"],
    justificacion:
      "Cuello de botella agrícola por clima, no estructural. La cadena es distribuida geográficamente, lo que reduce riesgo de concentración.",
  },
  Industrials: {
    leadTimeYears: 3,
    tipoEscasez: "tecnologica",
    bottleneckFactor: "Capacidad de manufactura de equipos especializados +ingeniería calificada",
    riesgoGeopolitico: "medio",
    dependenciaImportaciones: [
      "Alemania (maquinaria industrial)",
      "Japón (robótica)",
      "China (input manufactura básica)",
    ],
    justificacion:
      "Equipos industriales especializados (turbinas, compressores) tienen lead times de 2-3 años. Escasez de ingenieros calificados en países OECD.",
  },
  Utilities: {
    leadTimeYears: 6,
    tipoEscasez: "regulatoria",
    bottleneckFactor: "Permisos ambientales + construcción de red + NIMBY",
    riesgoGeopolitico: "bajo",
    dependenciaImportaciones: ["China (paneles solares 80%)", "Europa (turbinas eólicas offshore)"],
    justificacion:
      "Transmisión eléctrica tarda 5-10 años en construirse en US. La AIE advierte que la capacidad de red es el cuello de botella #1 para la transición energética.",
  },
  "Real Estate": {
    leadTimeYears: 3,
    tipoEscasez: "ciclica",
    bottleneckFactor:
      "Permisos de construcción + costo de financiamiento + disponibilidad de terreno",
    riesgoGeopolitico: "bajo",
    dependenciaImportaciones: [],
    justificacion:
      "Cuello de botella local (permisos municipales). No depende de importaciones. El bottleneck es tasas de interés (costo de capital).",
  },
  "Communication Services": {
    leadTimeYears: 2,
    tipoEscasez: "tecnologica",
    bottleneckFactor: "Espectro radioeléctrico + capacidad de fibra óptica + satélites",
    riesgoGeopolitico: "medio",
    dependenciaImportaciones: [
      "Corea del Sur (equipos 5G)",
      "Suecia (Ericsson)",
      "Finlandia (Nokia)",
    ],
    justificacion:
      "El espectro es finito y su asignación es regulatoria. Fibra óptica tiene lead time de 1-2 años. Satélites (Starlink) están aliviando el cuello de botella rural.",
  },
};

export function getEscasezPerfil(sectorKey: string): EscasezPerfil {
  return (
    ESCASEZ_TAXONOMIA[sectorKey] ?? {
      leadTimeYears: 0,
      tipoEscasez: "n/a",
      bottleneckFactor: "Sin datos de escasez para este sector",
      riesgoGeopolitico: "bajo",
      dependenciaImportaciones: [],
      justificacion: "Perfil de escasez no definido para este sector.",
    }
  );
}

export function getBottleneckWarning(sectorKey: string): string | null {
  const perfil = ESCASEZ_TAXONOMIA[sectorKey];
  if (!perfil) return null;
  if (perfil.tipoEscasez === "estructural" || perfil.leadTimeYears >= 5) {
    return `Cuello de botella ESTRUCTURAL: ${perfil.bottleneckFactor}. Lead time de oferta ~${perfil.leadTimeYears} años. Escasez no resoluble en el corto plazo — soporte para precio del activo a largo plazo.`;
  }
  if (perfil.riesgoGeopolitico === "alto") {
    return `Riesgo geopolítico ALTO: dependencia de ${perfil.dependenciaImportaciones.join(", ")}. Cualquier disrupción geopolítica impacta directamente la oferta.`;
  }
  return null;
}
