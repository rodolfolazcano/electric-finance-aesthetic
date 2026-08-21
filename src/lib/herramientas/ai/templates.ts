// @ts-nocheck
// Catálogo de plantillas de piezas (5 familias × 5 variantes).
// Cada plantilla es un JSON base con posiciones % fijas: el modelo completa
// SOLO el contenido, no inventa layout. Reduce tokens de razonamiento y
// elimina los errores de "no sigue instrucciones".

export type SlideContentType =
  | "serie_temporal"
  | "comparacion"
  | "apertura_cierre"
  | "noticia"
  | "oportunidad"
  | "educativo"
  | "identidad";

export type SlideFamily = "A" | "B" | "C" | "D" | "E";

/** Slot reservado del logo (post-proceso, el modelo de imagen no lo pinta). */
export type LogoSlot = {
  x: number;
  y: number;
  w: number;
  maxSize: number;
  corner: "top-left" | "top-right" | "bottom-left" | "bottom-right";
};

export type SlideTemplate = {
  id: number;
  family: SlideFamily;
  name: string;
  contentType: SlideContentType;
  palette: "green" | "red" | "neutral";
  /** Si la plantilla admite elemento `chart`. */
  allowsChart: boolean;
  /** Si la plantilla admite elemento `table` (render: se arma como metric/text). */
  allowsTable: boolean;
  /** Zona de "negative space" que se le pide al modelo de imagen para el texto. */
  negativeSpace: string;
  logoSlot: LogoSlot;
  /** Las plantillas educativas/noticias reutilizan fondos cacheados. */
  reuseBackground: boolean;
  /** Estructura de elementos: el modelo completa text/value/series. */
  layout: Array<{
    id: string;
    type: "label" | "title" | "text" | "metric" | "chart";
    x: number;
    y: number;
    w: number;
    h?: number;
    size?: number;
    align?: "left" | "center" | "right";
    chartType?: "line" | "bar" | "ladder";
  }>;
};

const CORNER_LOGO: LogoSlot = { x: 5, y: 5, w: 22, maxSize: 9, corner: "top-left" };
const CORNER_RIGHT: LogoSlot = { x: 73, y: 5, w: 22, maxSize: 9, corner: "top-right" };

// ---------------------------------------------------------------------------
// Catálogo completo
// ---------------------------------------------------------------------------

export const TEMPLATES: SlideTemplate[] = [
  // ── Familia A — Mercado diario ──────────────────────────────────────────
  {
    id: 1,
    family: "A",
    name: "Resumen apertura",
    contentType: "apertura_cierre",
    palette: "neutral",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "upper half clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 6.5, align: "left" },
      { id: "m1", type: "metric", x: 8, y: 32, w: 40, size: 5.5 },
      { id: "m2", type: "metric", x: 52, y: 32, w: 40, size: 5.5 },
      { id: "m3", type: "metric", x: 8, y: 50, w: 40, size: 5.5 },
      { id: "m4", type: "metric", x: 52, y: 50, w: 40, size: 5.5 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 2,
    family: "A",
    name: "Resumen cierre",
    contentType: "apertura_cierre",
    palette: "neutral",
    allowsChart: true,
    allowsTable: false,
    negativeSpace: "lower half clean dark area",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 6, align: "left" },
      { id: "metric1", type: "metric", x: 8, y: 30, w: 40, size: 5 },
      { id: "chart", type: "chart", chartType: "line", x: 8, y: 46, w: 84, h: 38 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 3,
    family: "A",
    name: "Semáforo sectorial",
    contentType: "apertura_cierre",
    palette: "neutral",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "upper third clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "s1", type: "metric", x: 8, y: 34, w: 40, size: 4.2 },
      { id: "s2", type: "metric", x: 52, y: 34, w: 40, size: 4.2 },
      { id: "s3", type: "metric", x: 8, y: 50, w: 40, size: 4.2 },
      { id: "s4", type: "metric", x: 52, y: 50, w: 40, size: 4.2 },
      { id: "s5", type: "metric", x: 8, y: 66, w: 40, size: 4.2 },
      { id: "s6", type: "metric", x: 52, y: 66, w: 40, size: 4.2 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 4,
    family: "A",
    name: "Ficha dólar (MEP/CCL/oficial)",
    contentType: "apertura_cierre",
    palette: "neutral",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "center dark band for metrics",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "mep", type: "metric", x: 8, y: 32, w: 40, size: 5 },
      { id: "ccl", type: "metric", x: 52, y: 32, w: 40, size: 5 },
      { id: "ofi", type: "metric", x: 8, y: 50, w: 40, size: 5 },
      { id: "gap", type: "metric", x: 52, y: 50, w: 40, size: 5 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 5,
    family: "A",
    name: "Ranking del día",
    contentType: "apertura_cierre",
    palette: "neutral",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "upper half clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "rank1", type: "metric", x: 8, y: 34, w: 84, size: 4 },
      { id: "rank2", type: "metric", x: 8, y: 46, w: 84, size: 4 },
      { id: "rank3", type: "metric", x: 8, y: 58, w: 84, size: 4 },
      { id: "rank4", type: "metric", x: 8, y: 70, w: 84, size: 4 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },

  // ── Familia B — Comparación de instrumentos ─────────────────────────────
  {
    id: 6,
    family: "B",
    name: "Tasa vs inflación",
    contentType: "comparacion",
    palette: "green",
    allowsChart: true,
    allowsTable: false,
    negativeSpace: "upper quarter clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "metric1", type: "metric", x: 8, y: 28, w: 40, size: 4.5 },
      { id: "metric2", type: "metric", x: 52, y: 28, w: 40, size: 4.5 },
      { id: "chart", type: "chart", chartType: "bar", x: 8, y: 46, w: 84, h: 38 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 7,
    family: "B",
    name: "Curva de tasas",
    contentType: "serie_temporal",
    palette: "neutral",
    allowsChart: true,
    allowsTable: false,
    negativeSpace: "top-right quadrant clean dark",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "chart", type: "chart", chartType: "line", x: 8, y: 32, w: 84, h: 48 },
      { id: "metric1", type: "metric", x: 8, y: 82, w: 40, size: 4 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 8,
    family: "B",
    name: "FCI vs plazo fijo vs LECAP",
    contentType: "comparacion",
    palette: "green",
    allowsChart: true,
    allowsTable: true,
    negativeSpace: "upper third clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "opt1", type: "metric", x: 8, y: 32, w: 40, size: 4.5 },
      { id: "opt2", type: "metric", x: 52, y: 32, w: 40, size: 4.5 },
      { id: "opt3", type: "metric", x: 8, y: 48, w: 40, size: 4.5 },
      { id: "chart", type: "chart", chartType: "bar", x: 8, y: 62, w: 84, h: 24 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 9,
    family: "B",
    name: "Bonos soberanos",
    contentType: "comparacion",
    palette: "neutral",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "upper half clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "t1", type: "metric", x: 8, y: 32, w: 84, size: 4 },
      { id: "t2", type: "metric", x: 8, y: 44, w: 84, size: 4 },
      { id: "t3", type: "metric", x: 8, y: 56, w: 84, size: 4 },
      { id: "t4", type: "metric", x: 8, y: 68, w: 84, size: 4 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 10,
    family: "B",
    name: "ONs por sector",
    contentType: "comparacion",
    palette: "green",
    allowsChart: true,
    allowsTable: true,
    negativeSpace: "upper third clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "chart", type: "chart", chartType: "bar", x: 8, y: 32, w: 84, h: 40 },
      { id: "best", type: "metric", x: 8, y: 76, w: 84, size: 4 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },

  // ── Familia C — Oportunidades / producto ────────────────────────────────
  {
    id: 11,
    family: "C",
    name: "Ficha de bono",
    contentType: "oportunidad",
    palette: "green",
    allowsChart: true,
    allowsTable: true,
    negativeSpace: "lower third clean dark area",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "tir", type: "metric", x: 8, y: 30, w: 40, size: 5 },
      { id: "paridad", type: "metric", x: 52, y: 30, w: 40, size: 5 },
      { id: "duration", type: "metric", x: 8, y: 46, w: 40, size: 4.5 },
      { id: "chart", type: "chart", chartType: "ladder", x: 8, y: 60, w: 84, h: 26 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 12,
    family: "C",
    name: "Ficha de acción/CEDEAR",
    contentType: "oportunidad",
    palette: "neutral",
    allowsChart: true,
    allowsTable: true,
    negativeSpace: "upper half clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "metric1", type: "metric", x: 8, y: 30, w: 40, size: 5 },
      { id: "metric2", type: "metric", x: 52, y: 30, w: 40, size: 5 },
      { id: "chart", type: "chart", chartType: "line", x: 8, y: 48, w: 84, h: 36 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 13,
    family: "C",
    name: "Combo de cartera sugerida",
    contentType: "oportunidad",
    palette: "green",
    allowsChart: true,
    allowsTable: true,
    negativeSpace: "lower half clean dark area",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "p1", type: "metric", x: 8, y: 32, w: 40, size: 4.5 },
      { id: "p2", type: "metric", x: 52, y: 32, w: 40, size: 4.5 },
      { id: "p3", type: "metric", x: 8, y: 48, w: 40, size: 4.5 },
      { id: "chart", type: "chart", chartType: "bar", x: 8, y: 62, w: 84, h: 24 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 14,
    family: "C",
    name: "Alerta de oportunidad",
    contentType: "oportunidad",
    palette: "green",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "center clean dark band",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "actual", type: "metric", x: 8, y: 34, w: 40, size: 5 },
      { id: "objetivo", type: "metric", x: 52, y: 34, w: 40, size: 5 },
      { id: "upside", type: "metric", x: 8, y: 52, w: 40, size: 5 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 15,
    family: "C",
    name: "Comparativa de brokers",
    contentType: "comparacion",
    palette: "neutral",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "upper half clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "b1", type: "metric", x: 8, y: 34, w: 84, size: 4 },
      { id: "b2", type: "metric", x: 8, y: 46, w: 84, size: 4 },
      { id: "b3", type: "metric", x: 8, y: 58, w: 84, size: 4 },
      { id: "b4", type: "metric", x: 8, y: 70, w: 84, size: 4 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },

  // ── Familia D — Educativo / conceptual (sin cifras) ─────────────────────
  {
    id: 16,
    family: "D",
    name: "Cheat sheet de definiciones",
    contentType: "educativo",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "upper half clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "d1", type: "text", x: 8, y: 32, w: 84, size: 3 },
      { id: "d2", type: "text", x: 8, y: 46, w: 84, size: 3 },
      { id: "d3", type: "text", x: 8, y: 60, w: 84, size: 3 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 17,
    family: "D",
    name: "Paso a paso",
    contentType: "educativo",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "upper third clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "step1", type: "text", x: 8, y: 34, w: 84, size: 3 },
      { id: "step2", type: "text", x: 8, y: 47, w: 84, size: 3 },
      { id: "step3", type: "text", x: 8, y: 60, w: 84, size: 3 },
      { id: "step4", type: "text", x: 8, y: 73, w: 84, size: 3 },
    ],
  },
  {
    id: 18,
    family: "D",
    name: "Mito vs realidad",
    contentType: "educativo",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "center clean dark band",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "mito", type: "text", x: 8, y: 36, w: 40, size: 3.5 },
      { id: "realidad", type: "text", x: 52, y: 36, w: 40, size: 3.5 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 19,
    family: "D",
    name: "Glosario visual",
    contentType: "educativo",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "upper half clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "g1", type: "text", x: 8, y: 32, w: 84, size: 3 },
      { id: "g2", type: "text", x: 8, y: 46, w: 84, size: 3 },
      { id: "g3", type: "text", x: 8, y: 60, w: 84, size: 3 },
      { id: "g4", type: "text", x: 8, y: 74, w: 84, size: 3 },
    ],
  },
  {
    id: 20,
    family: "D",
    name: "Línea de tiempo conceptual",
    contentType: "educativo",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "upper and lower clean bands",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "t1", type: "text", x: 8, y: 34, w: 84, size: 3 },
      { id: "t2", type: "text", x: 8, y: 47, w: 84, size: 3 },
      { id: "t3", type: "text", x: 8, y: 60, w: 84, size: 3 },
      { id: "t4", type: "text", x: 8, y: 73, w: 84, size: 3 },
    ],
  },

  // ── Familia E — Noticias / contexto ─────────────────────────────────────
  {
    id: 21,
    family: "E",
    name: "Titular + 3 bullets",
    contentType: "noticia",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "upper third clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 6, align: "left" },
      { id: "b1", type: "text", x: 8, y: 40, w: 84, size: 3 },
      { id: "b2", type: "text", x: 8, y: 53, w: 84, size: 3 },
      { id: "b3", type: "text", x: 8, y: 66, w: 84, size: 3 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 22,
    family: "E",
    name: "Cita textual + contexto",
    contentType: "noticia",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "center clean dark band",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "quote", type: "title", x: 8, y: 26, w: 84, size: 5.5, align: "left" },
      { id: "ctx", type: "text", x: 8, y: 58, w: 84, size: 3 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 23,
    family: "E",
    name: "Calendario económico semanal",
    contentType: "noticia",
    palette: "neutral",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "upper half clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "e1", type: "metric", x: 8, y: 32, w: 84, size: 4 },
      { id: "e2", type: "metric", x: 8, y: 44, w: 84, size: 4 },
      { id: "e3", type: "metric", x: 8, y: 56, w: 84, size: 4 },
      { id: "e4", type: "metric", x: 8, y: 68, w: 84, size: 4 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 24,
    family: "E",
    name: "Antes / después",
    contentType: "noticia",
    palette: "neutral",
    allowsChart: false,
    allowsTable: true,
    negativeSpace: "center clean dark band",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "antes", type: "metric", x: 8, y: 36, w: 40, size: 5 },
      { id: "despues", type: "metric", x: 52, y: 36, w: 40, size: 5 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 25,
    family: "E",
    name: "Pregunta frecuente (Q&A)",
    contentType: "educativo",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "upper third clean dark sky",
    logoSlot: CORNER_LOGO,
    reuseBackground: true,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 16, w: 84, size: 5.5, align: "left" },
      { id: "q", type: "text", x: 8, y: 34, w: 84, size: 3.5 },
      { id: "a", type: "text", x: 8, y: 52, w: 84, size: 3 },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },

  // ── Familia F — Identidad / diseño puro (fondo real como mensaje) ────────
  {
    id: 26,
    family: "C",
    name: "Banner de identidad profesional",
    contentType: "identidad",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "upper third and lower band clean dark",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 10, w: 84, size: 2.2, align: "left" },
      { id: "title", type: "title", x: 8, y: 18, w: 84, size: 5.5, align: "left" },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9 },
    ],
  },
  {
    id: 27,
    family: "C",
    name: "Portada minimalista (solo fondo)",
    contentType: "identidad",
    palette: "neutral",
    allowsChart: false,
    allowsTable: false,
    negativeSpace: "center clean dark band",
    logoSlot: CORNER_LOGO,
    reuseBackground: false,
    layout: [
      { id: "kicker", type: "label", x: 8, y: 8, w: 84, size: 2, align: "center" },
      { id: "title", type: "title", x: 8, y: 44, w: 84, size: 6, align: "center" },
      { id: "note", type: "text", x: 8, y: 90, w: 84, size: 1.9, align: "center" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Clasificación de tipo de contenido (heurística, no gasta modelo)
// ---------------------------------------------------------------------------

const TEMPORAL_RE =
  /\b(serie|evoluci(ó|o)n|tendenc|hist(ó|o)rico|precio.*(tiempo|mes|a(ñ|n)o)|inflaci(ó|o)n.*(mes|a(ñ|n)o)|gr(á|a)fico.*tiempo|curva)\b/i;
const COMPARACION_RE =
  /\b(compar|cruc|vs\.?|frente a|versus|versus|ranking|top|cuadro|tabla|tasas|diferenc|mejor|peor)\b/i;
const APERTURA_RE =
  /\b(apertura|cierre|resumen del d(í|i)a|resumen de hoy|ronda|d(ó|o)lar (hoy|mep|ccl)|sem(á|a)foro|ranking del d(í|i)a)\b/i;
const NOTICIA_RE =
  /\b(notici|evento|titular|calendario|macro|bcra|banco central|indec|anunci|informe|news)\b/i;
const OPORTUNIDAD_RE =
  /\b(oportunidad|invert|comprar|rendimiento|tir|paridad|ficha|combo|alerta|precio objetivo|cedear|bono|on |obligaci|plazo fijo|fci)\b/i;
const EDUCATIVO_RE =
  /\b(qu(é|e) es|qu(é|e) significa|concepto|definici(ó|o)n|glosario|cheat sheet|aprend|explic(á|a)|tutorial|mito|paso a paso|pregunta frecuente)\b/i;
const IDENTIDAD_RE =
  /\b(dise(ñ|n)o|identidad|marca personal|perfil profesional|banner de|portada|asociad(?:o|a) a mi profes|mi profesi|imagen(es)? reales|fondo de imagen(es)? reales|sin texto|sin textos|solo la imagen|fondo foto real|fondo fotogr(á|a)fico)\b/i;

/**
 * Detecta el tipo de dato dominante del pedido de pieza para elegir plantilla.
 * Antes de llamar a cualquier modelo: regex/heurística pura.
 */
export function classifySlideContentType(message: string, filesCount = 0): SlideContentType {
  if (IDENTIDAD_RE.test(message)) return "identidad";
  if (EDUCATIVO_RE.test(message)) return "educativo";
  if (NOTICIA_RE.test(message)) return "noticia";
  if (OPORTUNIDAD_RE.test(message)) return "oportunidad";
  if (APERTURA_RE.test(message)) return "apertura_cierre";
  if (COMPARACION_RE.test(message)) return "comparacion";
  if (TEMPORAL_RE.test(message)) return "serie_temporal";
  // Sin señales claras: si hay archivos de datos, asumimos serie/evolución.
  return filesCount > 0 ? "serie_temporal" : "noticia";
}

/** Devuelve el bloque de plantillas para el tipo de dato detectado. */
export function templatesForContentType(type: SlideContentType): SlideTemplate[] {
  return TEMPLATES.filter((t) => t.contentType === type);
}

/** Elige una plantilla por señales del mensaje; default: primera de la familia. */
export function pickTemplate(type: SlideContentType, message: string): SlideTemplate {
  const pool = templatesForContentType(type);
  if (!pool.length) return TEMPLATES[20]; // titular + bullets
  const chart = /\b(gr(á|a)fico|chart|curva|escalera|ladder|linea)\b/i.test(message);
  const table = /\b(tabla|cuadro|ranking|comparativa)\b/i.test(message);
  const score = (t: SlideTemplate) => {
    let s = 0;
    if (chart && t.allowsChart) s += 2;
    if (table && t.allowsTable) s += 2;
    if (t.id === 4 && /\bd(ó|o)lar\b/i.test(message)) s += 5;
    if (t.id === 6 && /\binflaci(ó|o)n\b/i.test(message)) s += 5;
    return s;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

/** Bloque de texto inyectado en el prompt del slide con la plantilla elegida. */
export function buildTemplateBlock(template: SlideTemplate): string {
  const elements = template.layout
    .map((el) => {
      const base = `{ id:"${el.id}", type:"${el.type}", x:${el.x}, y:${el.y}, w:${el.w}`;
      const rest = [
        el.h ? `h:${el.h}` : "",
        el.size ? `size:${el.size}` : "",
        el.align ? `align:"${el.align}"` : "",
        el.chartType ? `chartType:"${el.chartType}"` : "",
      ]
        .filter(Boolean)
        .join(", ");
      return `${base}${rest ? `, ${rest}` : ""} }`;
    })
    .join(",\n    ");
  return [
    `PLANTILLA: ${template.id} — ${template.name} (familia ${template.family})`,
    `Paleta: ${template.palette}. Admite chart: ${template.allowsChart}. Admite tabla: ${template.allowsTable}.`,
    template.contentType === "identidad"
      ? "Pieza de DISEÑO/IDENTIDAD: el fondo fotográfico ES el mensaje. El background.prompt describe la imagen que pide el usuario (p. ej. el entorno visual de su profesión), NO datos de documentos. Si el usuario pide 'sin texto', no incluyas elementos de texto."
      : "",
    template.allowsChart
      ? "Completá el elemento chart SOLO si hay datos numéricos verificables en el contexto; si no, omitilo."
      : "Esta plantilla NO lleva chart: no incluyas elemento chart aunque haya números.",
    template.allowsTable
      ? "Podés usar múltiples elementos metric/text en el layout para representar la tabla."
      : "No incluyas tablas: usá solo texto jerárquico.",
    "Estructura de elementos (completá text/value/series; no cambiés posiciones ni ids):",
    `[${elements}]`,
    `Zona de negative space para el fondo: ${template.negativeSpace}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Slot del logo por defecto si la plantilla no lo define. */
export function logoSlotFor(template: SlideTemplate): LogoSlot {
  return template.logoSlot ?? CORNER_LOGO;
}
