// @ts-nocheck
// Convierte un prompt interpretado (+ cascada) en un SlideSpec para el motor
// de video (generateVideo). Server-only. El spec alimenta buildVideoPrompt y
// el GIF de motion graphics determinístico; nunca genera personas.
import type { SlideSpec } from "@/lib/types";
import type { CascadeInterpretation } from "./cascade-reasoning.server";

/** Formato del video según la cascada (story = vertical, banner = horizontal). */
function formatFor(cascade?: CascadeInterpretation): SlideSpec["format"] {
  const f = cascade?.formato?.toLowerCase() ?? "";
  if (f.includes("story") || f.includes("vertical") || f.includes("reel")) return "story";
  if (f.includes("banner") || f.includes("horizontal") || f.includes("wide")) return "banner";
  if (f.includes("report") || f.includes("informe")) return "report";
  return "square";
}

/**
 * Construye un SlideSpec básico a partir del prompt y la interpretación en
 * cascada: título, métricas detectadas y un chart de ejemplo cuando no hay
 * datos reales. El generador de video solo necesita series/valores para
 * animar; si la cascada no trae números, usa un chart genérico de 4 puntos.
 */
export async function specFromPrompt(
  prompt: string,
  cascade?: CascadeInterpretation,
): Promise<SlideSpec> {
  const title =
    cascade?.objetivo?.slice(0, 48) || prompt.slice(0, 48) || "Mercado financiero";
  const format = formatFor(cascade);

  // Intentar extraer pares "clave=valor" o "clave: valor" del prompt.
  const series: Array<{ label: string; value: number }> = [];
  const kv = prompt.matchAll(/([A-Za-zÁÉÍÓÚÑñáéíóú0-9.%$]+)[\s]*[:=][\s]*([\d.,]+)/g);
  for (const m of kv) {
    const value = parseFloat(m[2].replace(/\./g, "").replace(",", "."));
    if (Number.isFinite(value)) series.push({ label: m[1].slice(0, 12), value });
    if (series.length >= 6) break;
  }

  return {
    title,
    format,
    palette: "neutral",
    background: { prompt: undefined, imageUrl: undefined, overlay: 0 },
    elements: [
      {
        id: "title-1",
        type: "title",
        text: title,
        x: 8,
        y: 8,
        w: 84,
        h: 12,
        size: 5,
        align: "center",
        tone: "neutral",
      },
      {
        id: "chart-1",
        type: "chart",
        chartType: "ladder",
        series: series.length ? series : [
          { label: "Ene", value: 100 },
          { label: "Feb", value: 120 },
          { label: "Mar", value: 110 },
          { label: "Abr", value: 140 },
        ],
        x: 8,
        y: 42,
        w: 84,
        h: 40,
      },
    ],
    templateId: null,
    logo: null,
  };
}
