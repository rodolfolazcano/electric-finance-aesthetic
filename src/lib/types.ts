export type Intent = "question" | "slide" | "report" | "marketing" | "edit" | "crossdata";

/** Dirección visual propuesta antes de renderizar nada (skill design_direction). */
export type DesignDirection = {
  name: string;
  palette: string[];
  typography: string;
  mood: string;
  referenceDescription: string;
};

export type SlideContentType =
  | "serie_temporal"
  | "comparacion"
  | "apertura_cierre"
  | "noticia"
  | "oportunidad"
  | "educativo"
  | "identidad";

export type SlideFormat = "square" | "story" | "banner" | "report";

export type SeriesPoint = { label: string; value: number };

export type SlideElement = {
  id: string;
  type: "label" | "title" | "text" | "metric" | "chart";
  text?: string;
  label?: string;
  value?: string;
  chartType?: "ladder" | "line" | "bar";
  series?: SeriesPoint[];
  unit?: string;
  x: number;
  y: number;
  w: number;
  h?: number;
  size?: number;
  align?: "left" | "center" | "right";
  tone?: "positive" | "negative" | "neutral";
};

export type SlideSpec = {
  title: string;
  format: SlideFormat;
  palette?: "green" | "red" | "neutral";
  background: { prompt?: string; imageUrl?: string; overlay: number };
  elements: SlideElement[];
  /** Plantilla usada para la pieza (catálogo de templates). */
  templateId?: number | null;
  /** Logo superpuesto en post-proceso (no lo pinta el modelo de imagen). */
  logo?: SlideLogo | null;
};

export type SlideLogo = {
  url: string;
  x: number;
  y: number;
  w: number;
  maxSize: number;
};

/** Adjunto producido por el turno (pptx/png/pdf exportado por el servidor). */
export type TurnAttachment = {
  kind: "pptx" | "png" | "pdf" | "mp4" | "mp3";
  filePath?: string;
  url: string;
  label: string;
};

export type MathCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type StudioFile = {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  status: "uploading" | "extracting" | "ready" | "error";
  error?: string;
  text: string;
  structured?: { columns: string[]; rows: (string | number)[][] } | null;
  storagePath?: string;
  active: boolean;
  segment?: ContextSegment;
  source?: ContextSource;
  remoteId?: string;
  url?: string | null;
};

export type ChatTurn = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string;
  model?: string;
  intent?: Intent;
  pending?: boolean;
  checks?: MathCheck[];
  agentTrace?: ToolCallTrace[];
  /** Dirección visual elegida en el turno (design_direction). */
  design?: DesignDirection | null;
  /** Adjunto exportado (pptx/pdf/png/video/audio). */
  attachment?: TurnAttachment | null;
};

export type ToolCallTrace = {
  tool: string;
  args: string;
  result: string;
};

export type ContextFile = { name: string; kind: string; text: string };

export type ContextSegment = "reference" | "data";
export type ContextSource = "file" | "paste" | "web" | "answer";

export type StudioSession = {
  id: string;
  title: string;
  files: StudioFile[];
  turns: ChatTurn[];
  slide: SlideSpec | null;
  queue: string[];
  busy: boolean;
  lastProvider: string | null;
};

export type PreviewRef = { elementId: string; label: string };
