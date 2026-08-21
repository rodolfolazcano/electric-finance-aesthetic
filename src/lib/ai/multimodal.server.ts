// Skills multimodales del estudio (v3). Server-only.
// Cada skill es una llamada acotada con su propio motor:
// - design_direction → modelo de texto barato (Gemma) devuelve 2-3 direcciones en JSON
// - generate_image    → flux.1-schnell, prompt armado server-side con la dirección elegida
// - edit_image        → determinístico con @napi-rs/canvas (borde, recorte, logo, fondo)
// - build_pptx        → pptxgenjs (sin IA: el modelo solo decide contenido)
// - render_canvas     → satori + resvg (HTML/CSS → SVG → PNG/PDF, sin IA)
// - generate_video    → motion graphics (GIF) sobre los elementos del slide; NUNCA personas
// - generate_audio    → TTS genérico vía endpoint configurable; nunca clonación de voces

import { IMAGE_CHAIN_HQ, resolveChain, type ModelPrefs } from "./model-catalog";
import { resilientImage, resilientJson, type CallAttempt } from "./providers.server";
import { improvePrompt, improveVideoPrompt } from "./improve-prompt.server";
import type { DesignDirection, SlideSpec } from "@/lib/types";
import type { Canvas } from "@napi-rs/canvas";
import type { ReactNode } from "react";
import { z } from "zod";

const FS_BASE = process.env.STUDIO_EXPORTS_DIR ?? "studio-exports";

// 
// design_direction
// 

const designSchema = z.object({
  options: z
    .array(
      z.object({
        name: z.string(),
        palette: z.array(z.string()).min(2).max(6),
        typography: z.string(),
        mood: z.string(),
        referenceDescription: z.string(),
      }),
    )
    .min(2)
    .max(3),
});

/**
 * Devuelve 2-3 direcciones visuales (paleta, tipografía, mood) para un brief.
 * NO renderiza nada: es el paso de "boceto" previo a generar imagen.
 */
export async function designDirection(
  brief: string,
  extraContext = "",
  modelPrefs?: ModelPrefs | null,
): Promise<{
  options: DesignDirection[];
  provider: string;
  model: string;
  attempts: CallAttempt[];
}> {
  const result = await resilientJson<{ options: DesignDirection[] }>(
    resolveChain("design", modelPrefs),
    [
      {
        role: "system",
        content:
          "Sos un director de arte. Para un brief de pieza financiera de redes sociales (público: inversor minorista argentino, formato 1:1), proponés 2 a 3 direcciones visuales distintas y coherentes entre sí. Cada dirección incluye: name (nombre corto), palette (3-5 colores hex complementarios, con un acento y un neutro), typography (una familia y jerarquía tipográfica), mood (estado de ánimo: sobrio, audaz, cálido, tech, editorial...), referenceDescription (descripción textual de la referencia visual: fotografía, textura, iluminación). No generás imágenes ni layouts: solo dirección de estilo. Devolvés SOLO JSON: { options: [ { name, palette, typography, mood, referenceDescription } ] }",
      },
      {
        role: "user",
        content: `${extraContext ? `CONTEXTO ADICIONAL:\n${extraContext}\n\n` : ""}BRIEF: ${brief}`,
      },
    ],
    { maxTokens: 2400, temperature: 0.8, schema: designSchema },
  );
  return {
    options: result.value.options,
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
  };
}

/** Formato legible para devolverle al agente / usuario. */
export function formatDesignOptions(options: DesignDirection[]): string {
  return options
    .map(
      (o, i) =>
        `${i + 1}. ${o.name}\n   Paleta: ${o.palette.join(" ")}\n   Tipografía: ${o.typography}\n   Mood: ${o.mood}\n   Referencia: ${o.referenceDescription}`,
    )
    .join("\n\n");
}

/** Bloque de texto inyectado en el prompt del slide con la dirección elegida. */
export function designDirectionBlock(design: DesignDirection): string {
  return [
    "DIRECCIÓN VISUAL ELEGIDA (respetala en el fondo, paleta y tipografía de la pieza):",
    `- ${design.name}`,
    `- Paleta: ${design.palette.join(", ")}`,
    `- Tipografía: ${design.typography}`,
    `- Mood: ${design.mood}`,
    `- Referencia: ${design.referenceDescription}`,
  ].join("\n");
}

/** Elige la dirección que mejor matchea la paleta de la plantilla (default: 1). */
export function pickDesignForTemplate(
  options: DesignDirection[],
  templatePalette?: string,
): DesignDirection {
  if (!options.length) {
    return {
      name: "Default",
      palette: ["#0A0B0D", "#46A758", "#EDEDED"],
      typography: "Sans",
      mood: "sobrio",
      referenceDescription: "fondo oscuro con acento verde",
    };
  }
  const target =
    templatePalette === "green" ? "green" : templatePalette === "red" ? "red" : "neutral";
  const scored = options
    .map((o, i) => ({
      o,
      score: (o.palette.join(" ").toLowerCase().includes(target) ? 2 : 0) + (i === 0 ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  return scored[0].o;
}

/** Enriquece el prompt de fondo con la dirección visual elegida. */
export function buildImagePrompt(prompt: string, design: DesignDirection): string {
  return `${prompt}. Visual direction: ${design.name} — palette ${design.palette.join(", ")}, mood ${design.mood}. ${design.referenceDescription}`;
}

// 
// generate_image
// 

/**
 * Genera una imagen y la sube a Studio (devuelve URL firmada + base64).
 * El prompt SIEMPRE se arma server-side combinando el prompt del usuario con la
 * dirección visual elegida: el modelo de imagen nunca decide estilo por su cuenta.
 */
export async function generateImage(input: {
  prompt: string;
  design?: DesignDirection | string | null;
  highQuality?: boolean;
  modelPrefs?: ModelPrefs | null;
}): Promise<{ url: string; base64: string; provider: string; model: string }> {
  const direction =
    typeof input.design === "string"
      ? input.design
      : input.design
        ? `${input.design.name} — palette ${input.design.palette.join(", ")}, mood ${input.design.mood}. ${input.design.referenceDescription}`
        : "";
  // Mejora el prompt descriptivo con el improver de Ollama configurado para la
  // tarea "prompt_image" (gnokit/goonsai) antes de agregar las restricciones de
  // seguridad; fallback al original si falla o queda bloqueado por la guarda.
  const basePrompt = await improvePrompt(input.prompt, input.modelPrefs);
  const enriched = `${basePrompt}. Financial photography, dark moody cinematic lighting, deep charcoal blue tones, subtle depth of field${direction ? `, visual direction: ${direction}` : ""}. No text, no numbers, no logos, no watermark, no UI elements.`;
  const result = await resilientImage(
    resolveChain("image", input.modelPrefs, input.highQuality ? IMAGE_CHAIN_HQ : undefined),
    enriched.trim(),
  );
  const bytes = Uint8Array.from(atob(result.value.base64), (c) => c.charCodeAt(0));
  const url = await uploadToStudio("backgrounds", result.value.mime, bytes);
  return {
    url,
    base64: result.value.base64,
    provider: result.provider,
    model: result.model,
  };
}

// 
// edit_image — determinístico con @napi-rs/canvas (sin créditos de IA)
// 

async function bufferFromUrl(url: string): Promise<Buffer> {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function imageCanvasFromUrl(url: string) {
  const { createCanvas, loadImage } = await import(/* @vite-ignore */ "@napi-rs/canvas");
  const image = await loadImage(await bufferFromUrl(url));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return { canvas, image };
}

/** Quita el fondo por proximidad de color a las esquinas (best-effort, sin IA). */
function removeBackground(canvas: Canvas): Canvas {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d");
  const image = ctx.getImageData(0, 0, w, h);
  const data = image.data;

  const corners = [
    [0, 0],
    [w - 1, 0],
    [0, h - 1],
    [w - 1, h - 1],
  ];
  const refs = corners.map(([x, y]) => {
    const i = (y * w + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  });

  const closeTo = (r: number, g: number, b: number, ref: number[]): boolean =>
    Math.abs(r - ref[0]) < 32 && Math.abs(g - ref[1]) < 32 && Math.abs(b - ref[2]) < 32;
  const isBg = (r: number, g: number, b: number): boolean =>
    refs.some((ref) => closeTo(r, g, b, ref));

  // BFS desde los bordes: solo transparenta píxeles conectados al borde que
  // matchean el color de esquina (evita agujeros internos).
  const visited = new Uint8Array(w * h);
  const queue: Array<[number, number]> = [];
  for (let x = 0; x < w; x++) queue.push([x, 0], [x, h - 1]);
  for (let y = 0; y < h; y++) queue.push([0, y], [w - 1, y]);

  while (queue.length) {
    const [x, y] = queue.pop() as [number, number];
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const idx = y * w + x;
    if (visited[idx]) continue;
    const i = idx * 4;
    if (!isBg(data[i], data[i + 1], data[i + 2])) continue;
    visited[idx] = 1;
    data[i + 3] = 0;
    queue.push([x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]);
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Edición determinística de imagen. Devuelve la imagen editada subida a Studio.
 * operation: add_border | remove_bg | crop | overlay_logo.
 */
export async function editImage(args: {
  imageUrl: string;
  operation: "add_border" | "remove_bg" | "crop" | "overlay_logo";
  borderColor?: string;
  borderWidth?: number;
  crop?: { x: number; y: number; w: number; h: number };
  logoUrl?: string;
  logoX?: number;
  logoY?: number;
  logoW?: number;
}): Promise<{ url: string; mime: string }> {
  const { createCanvas } = await import(/* @vite-ignore */ "@napi-rs/canvas");
  const { canvas, image } = await imageCanvasFromUrl(args.imageUrl);
  let out = canvas;

  if (args.operation === "add_border") {
    const pad = Math.max(1, args.borderWidth ?? 20);
    const w = canvas.width + pad * 2;
    const h = canvas.height + pad * 2;
    out = createCanvas(w, h);
    const ctx = out.getContext("2d");
    ctx.fillStyle = args.borderColor ?? "#0A0B0D";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(canvas, pad, pad);
  } else if (args.operation === "crop") {
    const { x = 0, y = 0, w = 100, h = 100 } = args.crop ?? {};
    const cw = Math.max(1, Math.min(image.width, Math.round(w)));
    const ch = Math.max(1, Math.min(image.height, Math.round(h)));
    out = createCanvas(cw, ch);
    out.getContext("2d").drawImage(canvas, x, y, cw, ch, 0, 0, cw, ch);
  } else if (args.operation === "remove_bg") {
    out = removeBackground(canvas);
  } else if (args.operation === "overlay_logo" && args.logoUrl) {
    const { loadImage } = await import(/* @vite-ignore */ "@napi-rs/canvas");
    const logo = await loadImage(await bufferFromUrl(args.logoUrl));
    const logoW = args.logoW ?? Math.round(out.width * 0.25);
    const logoH = Math.round(logoW * (logo.height / logo.width));
    const logoX = args.logoX ?? out.width - logoW - 24;
    const logoY = args.logoY ?? 24;
    const ctx = out.getContext("2d");
    ctx.drawImage(logo, logoX, logoY, logoW, logoH);
  }

  const base64 = out.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const url = await uploadToStudio("edits", "image/png", bytes);
  return { url, mime: "image/png" };
}

// 
// build_pptx — pptxgenjs (sin IA: el modelo solo decide contenido/layout)
// 

const FORMAT_SIZE: Record<SlideSpec["format"], { w: number; h: number }> = {
  square: { w: 8, h: 8 },
  story: { w: 6, h: 10.67 },
  banner: { w: 10.67, h: 6 },
  report: { w: 7.5, h: 10 },
};

const PALETTE_BG: Record<string, string> = {
  green: "0A0B0D",
  red: "100A0A",
  neutral: "0A0B0D",
};

/**
 * Convierte una especificación de slide (o varias) a un archivo .pptx y lo sube
 * a Studio. Usa posiciones % del SlideSpec → pulgadas de pptxgenjs.
 */
export async function buildPptxBytes(slides: SlideSpec[]): Promise<Buffer> {
  const { default: PptxGenJS } = await import(/* @vite-ignore */ "pptxgenjs");

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "CORONAR", width: 8, height: 8 });
  pptx.layout = "CORONAR";

  for (const spec of slides) {
    const dims = FORMAT_SIZE[spec.format] ?? FORMAT_SIZE.square;
    const slide = pptx.addSlide();
    slide.background = { color: PALETTE_BG[spec.palette ?? "neutral"] ?? "0A0B0D" };

    if (spec.background.imageUrl) {
      try {
        const bytes = await bufferFromUrl(spec.background.imageUrl);
        slide.addImage({
          data: `data:image/png;base64,${bytes.toString("base64")}`,
          x: 0,
          y: 0,
          w: dims.w,
          h: dims.h,
        });
        if (spec.background.overlay) {
          slide.addShape(pptx.ShapeType.rect, {
            x: 0,
            y: 0,
            w: dims.w,
            h: dims.h,
            fill: { color: "0A0B0D", transparency: 100 - spec.background.overlay * 100 },
            line: { transparency: 100 },
          });
        }
      } catch {
        // sin fondo de imagen: sigue el color sólido
      }
    }

    for (const el of spec.elements) {
      const xIn = (el.x / 100) * dims.w;
      const yIn = (el.y / 100) * dims.h;
      const wIn = (el.w / 100) * dims.w;
      const hIn = ((el.h ?? 10) / 100) * dims.h;
      const fontSize = Math.max(8, Math.round(((el.size ?? 3) / 100) * dims.h * 72));
      const color =
        el.tone === "negative" ? "E5484D" : el.tone === "positive" ? "46A758" : "EDEDED";

      if (el.type === "chart" && el.series?.length) {
        const labels = el.series.map((s) => s.label);
        const values = el.series.map((s) => s.value);
        const chartType =
          el.chartType === "line"
            ? pptx.ChartType.line
            : el.chartType === "ladder"
              ? pptx.ChartType.bar
              : pptx.ChartType.bar;
        slide.addChart(chartType, [{ name: el.label ?? "Serie", labels, values }], {
          x: xIn,
          y: yIn,
          w: wIn,
          h: hIn,
          barDir: el.chartType === "ladder" ? "col" : "bar",
          chartColors: ["46A758", "8E4EC6", "E5484D", "3E63DD"],
          showLegend: false,
          dataLabelColor: "EDEDED",
        });
        continue;
      }

      const text =
        el.text ??
        (el.type === "metric" ? `${el.label ? `${el.label}: ` : ""}${el.value ?? ""}` : "");
      if (!text && el.type === "metric") continue;
      slide.addText(text || " ", {
        x: xIn,
        y: yIn,
        w: wIn,
        h: hIn,
        fontSize,
        color,
        bold: el.type === "title" || el.type === "metric",
        align: el.align ?? "left",
        breakLine: false,
        autoFit: true,
      });
    }

    if (spec.logo?.url) {
      try {
        const bytes = await bufferFromUrl(spec.logo.url);
        const logoW = (spec.logo.w / 100) * dims.w;
        const logoH = logoW / 2.4;
        slide.addImage({
          data: `data:image/png;base64,${bytes.toString("base64")}`,
          x: (spec.logo.x / 100) * dims.w,
          y: (spec.logo.y / 100) * dims.h,
          w: logoW,
          h: logoH,
        });
      } catch {
        // sin logo: no rompe la pieza
      }
    }
  }

  const raw = await pptx.write({ outputType: "nodebuffer" });
  if (Buffer.isBuffer(raw)) return raw;
  if (typeof raw === "string") return Buffer.from(raw, "base64");
  if (raw instanceof ArrayBuffer) return Buffer.from(raw);
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  if (raw instanceof Blob) return Buffer.from(await raw.arrayBuffer());
  return Buffer.from(String(raw));
}

/**
 * Convierte una especificación de slide (o varias) a un archivo .pptx y lo sube
 * a Studio. Usa posiciones % del SlideSpec → pulgadas de pptxgenjs.
 */
export async function buildPptx(slides: SlideSpec[]): Promise<{ filePath: string; url: string }> {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const bytes = await buildPptxBytes(slides);

  const dir = path.resolve(FS_BASE);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `coronar-${Date.now()}.pptx`;
  const filePath = path.join(dir, fileName);
  fs.writeFileSync(filePath, bytes);

  const url = await uploadToStudio(
    "exports",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    new Uint8Array(bytes),
  );
  return { filePath, url };
}

// 
// export_gslides / export_pptx_live — conectores a docs vivos (opt-in por config)
// 

/**
 * Sube el .pptx a Google Drive pidiendo conversión a Google Slides. Requiere
 * GOOGLE_DRIVE_TOKEN (access token OAuth con scope drive.file). Devuelve el
 * enlace de edición del documento vivo.
 */
export async function exportGslides(
  slides: SlideSpec[],
  name?: string,
): Promise<{ url: string; fileId: string }> {
  const token = process.env.GOOGLE_DRIVE_TOKEN ?? process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) {
    throw new Error(
      "export_gslides requiere configurar GOOGLE_DRIVE_TOKEN (access token OAuth con scope drive.file). Sin él no se puede crear el documento vivo.",
    );
  }
  const bytes = await buildPptxBytes(slides);
  const form = new FormData();
  form.append(
    "metadata",
    new Blob(
      [
        JSON.stringify({
          name: name ?? `coronar-${Date.now()}`,
          mimeType: "application/vnd.google-apps.presentation",
        }),
      ],
      { type: "application/json; charset=UTF-8" },
    ),
  );
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    "presentation.pptx",
  );
  const res = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    throw new Error(
      `export_gslides: Google Drive rechazó el upload (${res.status} ${await res.text()})`,
    );
  }
  const data = (await res.json()) as { id: string };
  return { fileId: data.id, url: `https://docs.google.com/presentation/d/${data.id}/edit` };
}

/**
 * Sube el .pptx a OneDrive como documento vivo (Microsoft Graph). Requiere
 * MS_GRAPH_TOKEN (token de acceso con Files.ReadWrite). Devuelve el webUrl.
 */
export async function exportPptxLive(
  slides: SlideSpec[],
  name?: string,
): Promise<{ url: string; itemId: string }> {
  const token = process.env.MS_GRAPH_TOKEN;
  if (!token) {
    throw new Error(
      "export_pptx_live requiere configurar MS_GRAPH_TOKEN (token de Microsoft Graph con Files.ReadWrite). Sin él no se puede crear el documento vivo.",
    );
  }
  const bytes = await buildPptxBytes(slides);
  const fileName = `${name ?? `coronar-${Date.now()}`}.pptx`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${encodeURIComponent(fileName)}:/content`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
      body: new Uint8Array(bytes),
    },
  );
  if (!res.ok) {
    throw new Error(
      `export_pptx_live: Microsoft Graph rechazó el upload (${res.status} ${await res.text()})`,
    );
  }
  const data = (await res.json()) as { id: string; webUrl: string };
  return { itemId: data.id, url: data.webUrl };
}

// 
// render_canvas — satori + resvg (HTML/CSS → SVG → PNG/PDF, determinístico)
// 

/** Carga una fuente del sistema para satori (Windows/Linux/macOS). */
async function loadSystemFont(): Promise<{
  name: string;
  data: ArrayBuffer;
  weight: 400;
  style: "normal";
}> {
  const fs = await import("node:fs");
  const candidates = [
    "C:/Windows/Fonts/arial.ttf",
    "C:/Windows/Fonts/segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
  ];
  for (const p of candidates) {
    try {
      const data = fs.readFileSync(p);
      const ab = data.buffer.slice(
        data.byteOffset,
        data.byteOffset + data.byteLength,
      ) as ArrayBuffer;
      return { name: "Sans", data: ab, weight: 400 as const, style: "normal" as const };
    } catch {
      // siguiente candidato
    }
  }
  throw new Error("No se encontró una fuente del sistema para renderizar canvas.");
}

/**
 * Renderiza un HTML/CSS a PNG o PDF. Satori convierte a SVG y resvg a PNG;
 * PDF = PNG envuelto en pdf-lib (determinístico, sin IA).
 */
export async function renderCanvas(input: {
  html: string;
  css?: string;
  format: "png" | "pdf";
  width?: number;
  height?: number;
}): Promise<{ filePath: string; url: string }> {
  const { default: satori } = await import(/* @vite-ignore */ "satori");
  const { html: toVNode } = await import(/* @vite-ignore */ "satori-html");
  const { Resvg } = await import(/* @vite-ignore */ "@resvg/resvg-js");
  const fs = await import("node:fs");
  const path = await import("node:path");

  const width = input.width ?? 1080;
  const height = input.height ?? 1080;
  const styleBlock = input.css ? `<style>${input.css}</style>` : "";
  const markup = `<div style="width:${width}px;height:${height}px;overflow:hidden;background:#0A0B0D;color:#EDEDED;font-family:Sans">${styleBlock}${input.html}</div>`;
  const vnode = toVNode(markup) as unknown as ReactNode;

  const font = await loadSystemFont();
  const svg = await satori(vnode, {
    width,
    height,
    fonts: [font],
  });

  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: width } });
  const png = resvg.render().asPng();

  const dir = path.resolve(FS_BASE);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `coronar-canvas-${Date.now()}.${input.format === "pdf" ? "pdf" : "png"}`;
  const filePath = path.join(dir, fileName);

  if (input.format === "pdf") {
    const { PDFDocument } = await import(/* @vite-ignore */ "pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([width, height]);
    const image = await doc.embedPng(png);
    page.drawImage(image, { x: 0, y: 0, width, height });
    fs.writeFileSync(filePath, Buffer.from(await doc.save()));
  } else {
    fs.writeFileSync(filePath, png);
  }

  const bytes = fs.readFileSync(filePath);
  const mime = input.format === "pdf" ? "application/pdf" : "image/png";
  const url = await uploadToStudio("exports", mime, new Uint8Array(bytes));
  return { filePath, url };
}

// 
// generate_video — NVIDIA Cosmos 3 (Generator NIM o build.nvidia.com alojado)
// 
// Motor preferido: Cosmos3-Generator. Dos modos según COSMOS_VIDEO_URL:
// - NIM local:  http://<host>:8000/v1/infer
// - Hosted:     https://ai.api.nvidia.com/v1/genai/nvidia/cosmos3-nano
//               (usa NVIDIA_API_KEY; respuesta inline, URL del CDN o async NVCF)
// Sin endpoint configurado → GIF determinístico (@napi-rs/canvas + GifEncoder)
// sobre chart/metric/table.
// Reglas duras (sin excepción):
// - NUNCA personas reales ni rostros identificables ni figuras públicas.
// - NUNCA modelos/LoRAs orientados a generar personas.
// - El prompt de video SIEMPRE se arma server-side (nunca lo arma el usuario).

/** Mapea el formato de la pieza a la resolución Cosmos (tier + aspecto). */
function cosmosResolution(format: SlideSpec["format"]): string {
  const tier = process.env.COSMOS_RESOLUTION ?? "256";
  const aspect =
    format === "square"
      ? "_1_1"
      : format === "story"
        ? "_9_16"
        : format === "banner"
          ? "_16_9"
          : "_4_3";
  return `${tier}${aspect}`;
}

/** Ajusta num_output_frames a la cadencia 4k+1 y al tope del tier. */
function cosmosFrameCount(durationSec: number): number {
  const tier = process.env.COSMOS_RESOLUTION ?? "256";
  const cap = tier === "256" ? 397 : tier === "480" ? 297 : 197;
  const fps = Number(process.env.COSMOS_FPS ?? 24);
  const raw = Math.max(25, Math.round(durationSec * fps));
  const stepped = Math.floor((Math.min(raw, cap) - 1) / 4) * 4 + 1;
  return Math.max(25, stepped);
}

/**
 * Arma el prompt de video server-side desde el SlideSpec: describe escenas de
 * mercados/datos (gráficos animados, dashboards, pantallas) sin personas.
 */
export function buildVideoPrompt(spec: SlideSpec): string {
  const dataParts: string[] = [];
  for (const el of spec.elements) {
    if (el.type === "chart" && el.series?.length) {
      const points = el.series.map((s) => `${s.label}=${s.value}`).join(", ");
      dataParts.push(`animated bar/line chart: ${points}`);
    } else if (el.type === "metric" && el.label) {
      dataParts.push(`metric "${el.label}"${el.value ? ` = ${el.value}` : ""}`);
    } else if (el.type === "title" && el.text) {
      dataParts.push(`title "${el.text}"`);
    }
  }
  const data = dataParts.length ? dataParts.join("; ") : "financial data dashboard";
  const motion =
    process.env.COSMOS_MOTION ??
    "slow cinematic camera push-in, graphs animating smoothly, particles of light in a dark room";
  return `A premium financial markets visualization, dark charcoal blue ambiance (#0A0B0D), ${spec.title || "market data"} theme. On-screen content: ${data}. ${motion}. Clean interface, professional investment research desk aesthetic, elegant motion design, high production value. NO people, NO faces, NO human figures, NO hands, NO bodies. NO readable text overlays, no watermarks, no logos.`;
}

/**
 * Busca recursivamente el campo de video en la respuesta (b64_video inline,
 * URL firmada del CDN, o el payload de un job async de NVCF).
 */
function findVideoField(obj: unknown, depth = 0): string | undefined {
  if (depth > 8 || !obj || typeof obj !== "object") return undefined;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findVideoField(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  const record = obj as Record<string, unknown>;
  for (const key of ["b64_video", "video_url", "media_url", "video"]) {
    const v = record[key];
    if (typeof v === "string" && v) return v;
  }
  for (const value of Object.values(record)) {
    const found = findVideoField(value, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Decodifica un campo de video: data-URI/base64 o URL remota → Buffer MP4. */
async function resolveVideoField(field: string): Promise<Buffer> {
  if (field.startsWith("http")) {
    const res = await fetch(field, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Descarga del video falló: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const b64 = field.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(b64, "base64");
}

/** Pollea un job async de NVCF (build.nvidia.com devuelve 202 + NVCF-REQID). */
async function pollNvcfVideo(reqId: string, apiKey: string): Promise<Buffer> {
  const url = `https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/${reqId}`;
  const deadline = Date.now() + Number(process.env.COSMOS_TIMEOUT_MS ?? 600_000);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  while (Date.now() < deadline) {
    const res = await fetch(url, {
      headers: { accept: "application/json", authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const body = (await res.json()) as Record<string, unknown>;
      const field = findVideoField(body);
      if (field) return resolveVideoField(field);
      const status = String(body.status ?? body.state ?? "").toLowerCase();
      if (["error", "failed", "cancelled", "canceled"].includes(status)) {
        throw new Error(`Cosmos async falló: ${JSON.stringify(body).slice(0, 300)}`);
      }
    }
    await sleep(3_000);
  }
  throw new Error("Timeout esperando el video de Cosmos (async).");
}

/**
 * Pide un video a Cosmos3-Generator.
 * - NIM local: POST {COSMOS_VIDEO_URL}/v1/infer → b64_video.
 * - Hosted (build.nvidia.com): endpoint ai.api.nvidia.com/v1/genai/... con
 *   Authorization Bearer $NVIDIA_API_KEY; respuesta inline, URL del CDN o
 *   async 202 + NVCF-REQID (se pollea).
 * imageData: base64 (data URI) opcional para Image2Video.
 */
async function cosmosInferVideo(
  prompt: string,
  spec: SlideSpec,
  imageData?: string,
): Promise<Buffer> {
  const endpoint = process.env.COSMOS_VIDEO_URL;
  if (!endpoint) throw new Error("COSMOS_VIDEO_URL no está configurado.");
  const hosted = /ai\.api\.nvidia\.com\/v1\/genai\//i.test(endpoint);
  const apiKey = process.env.NVIDIA_API_KEY ?? "";
  if (hosted && !apiKey) {
    throw new Error(
      "NVIDIA_API_KEY requerida para el endpoint alojado de build.nvidia.com (generala en https://build.nvidia.com/settings).",
    );
  }
  const payload: Record<string, unknown> = {
    prompt,
    negative_prompt: process.env.COSMOS_NEGATIVE_PROMPT,
    seed: Number(process.env.COSMOS_SEED ?? Math.floor(Math.random() * 100000)),
    guidance_scale: Number(process.env.COSMOS_GUIDANCE ?? 6.0),
    steps: Number(process.env.COSMOS_STEPS ?? 35),
    resolution: cosmosResolution(spec.format),
    num_output_frames: cosmosFrameCount(Number(process.env.COSMOS_DURATION_SEC ?? 8)),
    fps: Number(process.env.COSMOS_FPS ?? 24),
  };
  if (imageData) payload.image = imageData;

  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (hosted) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(Number(process.env.COSMOS_TIMEOUT_MS ?? 600_000)),
  });

  // Async: build.nvidia.com puede responder 202 + header NVCF-REQID.
  const reqId = res.headers.get("nvcf-reqid");
  if (res.status === 202 && reqId) {
    await res.text().catch(() => {});
    return pollNvcfVideo(reqId, apiKey);
  }

  if (!res.ok)
    throw new Error(`Cosmos NIM HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

  const body = (await res.json()) as Record<string, unknown>;
  const field = findVideoField(body);
  if (!field) throw new Error("Cosmos NIM no devolvió video (ni b64_video ni URL).");
  return resolveVideoField(field);
}

export async function generateVideo(
  spec: SlideSpec,
  durationSec = 15,
  imageUrl?: string,
  modelPrefs?: ModelPrefs | null,
): Promise<{ url: string; filePath: string }> {
  const fs = await import("node:fs");
  const path = await import("node:path");
  const dir = path.resolve(FS_BASE);
  fs.mkdirSync(dir, { recursive: true });

  // 1) Motor Cosmos 3 si está configurado (texto→video o imagen→video).
  if (process.env.COSMOS_VIDEO_URL) {
    const imageData = imageUrl
      ? await bufferFromUrl(imageUrl).then((b) => b.toString("base64"))
      : undefined;

    // Primer intento con el prompt server-side.
    const prompt = buildVideoPrompt(spec);
    try {
      const bytes = await cosmosInferVideo(prompt, spec, imageData);
      const fileName = `coronar-cosmos-${Date.now()}.mp4`;
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, bytes);
      const url = await uploadToStudio("exports", "video/mp4", new Uint8Array(bytes));
      return { url, filePath };
    } catch (error) {
      // Reintento con prompt reescrito por Ollama (fallback silencioso): si
      // Ollama no responde, improveVideoPrompt devuelve el prompt original y
      // se cae directo al GIF de motion graphics.
      console.error(
        "[generate_video] Cosmos falló, reintento con prompt mejorado por Ollama:",
        error,
      );
      const retryPrompt = await improveVideoPrompt(prompt, modelPrefs);
      if (retryPrompt !== prompt) {
        try {
          const bytes = await cosmosInferVideo(retryPrompt, spec, imageData);
          const fileName = `coronar-cosmos-${Date.now()}.mp4`;
          const filePath = path.join(dir, fileName);
          fs.writeFileSync(filePath, bytes);
          const url = await uploadToStudio("exports", "video/mp4", new Uint8Array(bytes));
          return { url, filePath };
        } catch (retryError) {
          console.error(
            "[generate_video] Cosmos falló también con el prompt mejorado, uso GIF:",
            retryError,
          );
        }
      }
    }
  }

  // 2) Fallback: motion graphics determinístico (GIF) sobre chart/metric/table.
  const { createCanvas, GifEncoder } = await import(/* @vite-ignore */ "@napi-rs/canvas");

  const W = 540;
  const H = 540;
  const dims = FORMAT_SIZE[spec.format] ?? FORMAT_SIZE.square;
  const scale = W / dims.w;

  const frames = 24;
  const delayMs = Math.max(40, Math.round((durationSec * 1000) / frames));
  const gif = new GifEncoder(W, H, { repeat: 0, quality: 10 });
  const fileName = `coronar-motion-${Date.now()}.gif`;
  const filePath = path.join(dir, fileName);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // El gráfico avanza progresivamente por frame: cada frame muestra una porción
  // más de la serie. Solo datos — cero contenido de personas.
  const chartEl = spec.elements.find((e) => e.type === "chart" && e.series?.length);
  const series = chartEl?.series ?? [];
  const maxV = Math.max(1, ...series.map((s) => Math.abs(s.value)));

  for (let f = 0; f < frames; f++) {
    const progress = (f + 1) / frames;
    ctx.fillStyle = PALETTE_BG[spec.palette ?? "neutral"] ?? "#0A0B0D";
    ctx.fillRect(0, 0, W, H);

    if (chartEl && series.length) {
      const bx = ((chartEl.x ?? 8) / 100) * W;
      const by = ((chartEl.y ?? 46) / 100) * H;
      const bw = ((chartEl.w ?? 84) / 100) * W;
      const bh = ((chartEl.h ?? 34) / 100) * H * scale;
      const bars = Math.max(1, Math.ceil(series.length * progress));
      const slot = bw / series.length;
      for (let i = 0; i < bars; i++) {
        const v = series[i].value;
        const barH = (Math.abs(v) / maxV) * (bh * 0.8);
        const color = v >= 0 ? "#46A758" : "#E5484D";
        ctx.fillStyle = color;
        ctx.fillRect(bx + i * slot + slot * 0.15, by + bh - barH, slot * 0.7, barH);
      }
    }

    // Título con fade-in suave.
    const title = spec.title;
    ctx.fillStyle = `rgba(237,237,237,${Math.min(1, progress * 2)})`;
    ctx.font = "bold 40px Arial";
    ctx.textAlign = "left";
    ctx.fillText(title.slice(0, 40), 40, 70);

    // Marca de leyenda (nunca personas, solo datos/texto).
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "16px Arial";
    ctx.textAlign = "right";
    ctx.fillText("Coronar Inversiones · Matrícula 2192", W - 24, H - 24);

    gif.addFrame(
      new Uint8Array(
        ctx
          .getImageData(0, 0, W, H)
          .data.buffer.slice(
            ctx.getImageData(0, 0, W, H).data.byteOffset,
            ctx.getImageData(0, 0, W, H).data.byteOffset +
              ctx.getImageData(0, 0, W, H).data.byteLength,
          ),
      ),
      W,
      H,
      { delay: delayMs },
    );
  }

  const gifBytes = gif.finish();
  fs.writeFileSync(filePath, Buffer.from(gifBytes));

  const bytes = fs.readFileSync(filePath);
  const url = await uploadToStudio("exports", "image/gif", new Uint8Array(bytes));
  return { url, filePath };
}

// 
// generate_audio — TTS genérico (Kokoro/XTTS) vía endpoint configurable
// 
// Reglas duras:
// - Solo voces sintéticas genéricas (es-AR-generic). Nunca clonación de voces
//   reales sin consentimiento explícito y documentado.
// - Requiere KOKORO_TTS_URL configurado (endpoint OpenAI-compatible o Kokoro).

export async function generateAudio(
  script: string,
  voice = "es-AR-generic",
): Promise<{ url: string }> {
  const endpoint = process.env.KOKORO_TTS_URL ?? process.env.TTS_URL;
  if (!endpoint) {
    throw new Error(
      "TTS no configurado: definí KOKORO_TTS_URL (endpoint OpenAI-compatible). Solo se usan voces sintéticas genéricas; nunca clonación de voces reales.",
    );
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: script.slice(0, 4000),
      voice,
      response_format: "mp3",
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const url = await uploadToStudio("exports", "audio/mpeg", bytes);
  return { url };
}

// 
// Utilidades compartidas: subir a Supabase Studio y firmar URL
// 

/** Sube bytes al bucket `studio-files` y devuelve una URL firmada. */
export async function uploadToStudio(
  prefix: string,
  mime: string,
  bytes: Uint8Array,
): Promise<string> {
  const { supabaseAdmin } = await import("@/lib/supabase-admin");
  if (!supabaseAdmin?.storage) {
    throw new Error(
      "Supabase no configurado: definí SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el .env.",
    );
  }
  const ext =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/gif"
        ? "gif"
        : mime === "audio/mpeg"
          ? "mp3"
          : mime === "video/mp4"
            ? "mp4"
            : mime === "application/pdf"
              ? "pdf"
              : "png";
  const path = `${prefix.replace(/\/+$/, "")}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("studio-files")
    .upload(path, bytes, { contentType: mime, upsert: true });
  if (error) throw new Error(`No se pudo subir a Studio: ${error.message}`);
  const { data } = await supabaseAdmin.storage
    .from("studio-files")
    .createSignedUrl(path, 60 * 60 * 24 * 7);
  if (!data?.signedUrl) throw new Error("No se pudo firmar la URL");
  return data.signedUrl;
}
