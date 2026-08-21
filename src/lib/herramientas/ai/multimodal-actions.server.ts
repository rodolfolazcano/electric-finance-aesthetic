// @ts-nocheck
// Acciones multimodales del chat IA (6 conversiones). Server-only.
//   text_to_image    → generateImage
//   image_to_image   → editImage (o describir + regenerar)
//   text_to_video    → generateVideo
//   image_to_text    → describeImage (transcribe/analiza)
//   image_to_video   → generateVideo con imagen de arranque
//   video_to_text    → extrae frames y transcribe con visión
//
// Pipeline obligatorio antes de cualquier generador:
//   usuario → ROUTER → CASCADA (nemotron-cascade-2) → MEJORADOR
//   (improve-prompt para imagen/video/texto/pdf) → GENERADOR
//
// Si no hay API key cloud, los generadores de imagen/video caen al fallback
// local de Ollama cuando hay un modelo de generación instalado; si tampoco,
// devuelven error claro sin romper el turno.
import type { ModelPrefs } from "./model-catalog";
import {
  cascadeBlock,
  cascadeReason,
  type CascadeInterpretation,
} from "./cascade-reasoning.server";
import { improvePromptForGenerator } from "./improve-prompt.server";
import {
  buildContextBlock,
  type ContextFile,
} from "./studio.server";
import { describeImage } from "./studio.server";
import { generateImage, editImage } from "./multimodal.server";
import { resilientVision, resilientChat, type ChatMessage } from "./providers.server";
import { VISION_CHAIN, NARRATIVE_CHAIN } from "./model-catalog";
import type { MultimodalMode } from "./router-agent.server";

export type AttachmentInput = {
  /** URL o data URI de la imagen/video de entrada. */
  url?: string;
  base64?: string;
  mime?: string;
};

export type MultimodalInput = {
  message: string;
  mode: MultimodalMode;
  /** Archivos de contexto cargados (datos/referencias). */
  files?: ContextFile[];
  /** Imagen/video adjunto del turno (según el modo). */
  attachment?: AttachmentInput | null;
  modelPrefs?: ModelPrefs | null;
  conversationId?: string | null;
};

export type MultimodalOutput = {
  text: string;
  /** URL del asset generado (imagen/video/pdf…). */
  assetUrl?: string;
  mime?: string;
  model: string;
  cascade?: CascadeInterpretation;
};

//  Utilidades 

/** Ejecuta la cascada y arma el bloque de instrucciones (con fallback). */
async function reasonCascade(
  message: string,
  files: ContextFile[],
): Promise<CascadeInterpretation> {
  const contexto = files?.length ? buildContextBlock(files).slice(0, 6000) : undefined;
  return cascadeReason(message, contexto);
}

function describeAttachment(attachment?: AttachmentInput | null): string {
  if (!attachment) return "";
  if (attachment.url) return ` (adjunto: ${attachment.url})`;
  return " (adjunto)";
}

//  Acciones 

async function textToImage(input: MultimodalInput): Promise<MultimodalOutput> {
  const cascade = await reasonCascade(input.message, input.files ?? []);
  // 1) cascada → 2) mejorador de prompt de imagen (Ollama local)
  const prompt = await improvePromptForGenerator(cascade.objetivo, "image", input.modelPrefs);
  // 3) generador
  const result = await generateImage({
    prompt: `${prompt} ${cascadeBlock(cascade)}`,
    highQuality: false,
    modelPrefs: input.modelPrefs,
  });
  return {
    text: `Imagen generada con ${result.model}. ${cascade.objetivo}`,
    assetUrl: result.url,
    mime: "image/png",
    model: result.model,
    cascade,
  };
}

async function imageToImage(input: MultimodalInput): Promise<MultimodalOutput> {
  const cascade = await reasonCascade(input.message, input.files ?? []);
  const url = input.attachment?.url;
  if (!url) {
    return {
      text: "Necesito la imagen a editar adjunta (URL o archivo).",
      model: "none",
      cascade,
    };
  }
  // 1) interpretar la edición → 2) mejorador → 3) edición determinística
  const prompt = await improvePromptForGenerator(
    `${cascade.objetivo} ${cascadeBlock(cascade)}`,
    "image",
    input.modelPrefs,
  );
  const op = editOperationFor(prompt);
  const result = await editImage({
    imageUrl: url,
    operation: op.operation,
    borderColor: op.borderColor,
    borderWidth: op.borderWidth,
    crop: op.crop,
  });
  return {
    text: `Imagen editada (${op.operation}). ${cascade.objetivo}`,
    assetUrl: result.url,
    mime: result.mime,
    model: "edit_image",
    cascade,
  };
}

/** Mapea el prompt interpretado a una operación determinística de edición. */
function editOperationFor(prompt: string): {
  operation: "add_border" | "remove_bg" | "crop";
  borderColor?: string;
  borderWidth?: number;
  crop?: { x: number; y: number; w: number; h: number };
} {
  const p = prompt.toLowerCase();
  if (/fondo|background|remove/.test(p)) return { operation: "remove_bg" };
  if (/borde|border|marco|frame/.test(p)) return { operation: "add_border", borderWidth: 24 };
  if (/crop|recort|zoom|centr/.test(p)) return { operation: "crop", crop: { x: 0, y: 0, w: 90, h: 90 } };
  return { operation: "add_border", borderWidth: 20 };
}

async function textToVideo(input: MultimodalInput): Promise<MultimodalOutput> {
  const cascade = await reasonCascade(input.message, input.files ?? []);
  const prompt = await improvePromptForGenerator(cascade.objetivo, "video", input.modelPrefs);
  const { generateVideo } = await import("./multimodal.server");
  const { specFromPrompt } = await import("./video-spec.server");
  const spec = await specFromPrompt(prompt, cascade);
  const result = await generateVideo(spec, 15, undefined, input.modelPrefs);
  return {
    text: `Video generado (${result.filePath.split(".").pop()}). ${cascade.objetivo}`,
    assetUrl: result.url,
    mime: result.filePath.endsWith(".mp4") ? "video/mp4" : "image/gif",
    model: "cosmos|motion",
    cascade,
  };
}

async function imageToVideo(input: MultimodalInput): Promise<MultimodalOutput> {
  const cascade = await reasonCascade(input.message, input.files ?? []);
  const url = input.attachment?.url;
  const prompt = await improvePromptForGenerator(cascade.objetivo, "video", input.modelPrefs);
  const { generateVideo } = await import("./multimodal.server");
  const { specFromPrompt } = await import("./video-spec.server");
  const spec = await specFromPrompt(prompt, cascade);
  const result = await generateVideo(spec, 15, url ?? undefined, input.modelPrefs);
  return {
    text: `Video a partir de imagen generado (${result.filePath.split(".").pop()}). ${cascade.objetivo}`,
    assetUrl: result.url,
    mime: result.filePath.endsWith(".mp4") ? "video/mp4" : "image/gif",
    model: "cosmos|motion",
    cascade,
  };
}

async function imageToText(input: MultimodalInput): Promise<MultimodalOutput> {
  const base64 = input.attachment?.base64;
  const url = input.attachment?.url;
  if (!base64 && !url) {
    return { text: "Necesito la imagen para transcribirla/analizarla.", model: "none" };
  }
  const result = await describeImage(
    input.conversationId,
    base64 ?? url!,
    input.attachment?.mime ?? "image/png",
  );
  return { text: result.text, model: result.model };
}

/** Video → texto: extrae frames del video local y los transcribe con visión. */
async function videoToText(input: MultimodalInput): Promise<MultimodalOutput> {
  const url = input.attachment?.url;
  const base64 = input.attachment?.base64;
  if (!url && !base64) {
    return { text: "Necesito el video (URL o archivo) para transcribirlo.", model: "none" };
  }
  const frames = await extractVideoFrames(url ?? base64!, input.attachment?.mime);
  if (!frames.length) {
    return {
      text: "No pude extraer frames del video. Asegurate de que sea un .mp4/.webm accesible.",
      model: "none",
    };
  }
  const parts: string[] = [];
  for (let i = 0; i < frames.length; i++) {
    const res = await resilientVision(
      VISION_CHAIN,
      frames[i].base64,
      "image/jpeg",
      "Transcribí con precisión todo el texto, tablas y números visibles en este frame de un video financiero. Si no hay texto, describí la escena brevemente.",
    );
    parts.push(`[Frame ${i + 1}/${frames.length}]\n${res.value}`);
  }
  return { text: parts.join("\n\n"), model: "vision-frames" };
}

//  Video → frames (ffmpeg best-effort) 

async function extractVideoFrames(
  source: string,
  mime = "video/mp4",
): Promise<Array<{ base64: string }>> {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const cp = await import("node:child_process");
  const tmp = path.join(os.tmpdir(), `clarity-v2t-${Date.now()}.mp4`);
  try {
    if (source.startsWith("http")) {
      const res = await fetch(source, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
    } else {
      const b64 = source.replace(/^data:[^;]+;base64,/, "");
      fs.writeFileSync(tmp, Buffer.from(b64, "base64"));
    }

    const outDir = path.join(os.tmpdir(), `clarity-v2t-frames-${Date.now()}`);
    fs.mkdirSync(outDir, { recursive: true });
    const hasFfmpeg = ffmpegAvailable();
    if (!hasFfmpeg) return [];
    cp.execSync(
      `ffmpeg -y -i "${tmp}" -vf "fps=1/2,scale=480:-1" -frames:v 8 "${outDir}/f%d.jpg"`,
      { encoding: "utf-8", timeout: 60_000, stdio: "ignore" },
    );
    const files = fs
      .readdirSync(outDir)
      .filter((f) => f.endsWith(".jpg"))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .slice(0, 8);
    return files.map((f) => ({
      base64: fs.readFileSync(path.join(outDir, f)).toString("base64"),
    }));
  } catch (e: any) {
    console.error("[video_to_text] extracción de frames falló", e?.message ?? e);
    return [];
  } finally {
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}

let _ffmpegChecked: boolean | null = null;
function ffmpegAvailable(): boolean {
  if (_ffmpegChecked !== null) return _ffmpegChecked;
  try {
    const cp = require("node:child_process") as typeof import("node:child_process");
    cp.execSync("ffmpeg -version", { stdio: "ignore", timeout: 5000 });
    _ffmpegChecked = true;
  } catch {
    _ffmpegChecked = false;
  }
  return _ffmpegChecked;
}

//  Dispatcher 

export async function runMultimodal(input: MultimodalInput): Promise<MultimodalOutput> {
  switch (input.mode) {
    case "text_to_image":
      return textToImage(input);
    case "image_to_image":
      return imageToImage(input);
    case "text_to_video":
      return textToVideo(input);
    case "image_to_video":
      return imageToVideo(input);
    case "image_to_text":
      return imageToText(input);
    case "video_to_text":
      return videoToText(input);
    default:
      return { text: `Modo multimodal no soportado: ${input.mode}`, model: "none" };
  }
}

/** Prepara el turno completo: cascada → mejorador → dispatch multimodal. */
export async function multimodalTurn(input: MultimodalInput): Promise<MultimodalOutput> {
  return runMultimodal(input);
}
