// Parsing de archivos en el cliente. El resultado se cachea una sola vez por archivo.
import Papa from "papaparse";
import type { StudioFile } from "@/lib/types";

export const MAX_DOC_BYTES = 50 * 1024 * 1024;
export const MAX_IMG_BYTES = 15 * 1024 * 1024;

export type Extraction = {
  text: string;
  structured?: { columns: string[]; rows: (string | number)[][] } | null;
};

export function kindOf(file: File): StudioFile["kind"] {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "xlsx";
  if (name.endsWith(".csv")) return "csv";
  if (name.endsWith(".json")) return "json";
  if (file.type.startsWith("image/")) return "image";
  return "txt";
}

function tableToText(columns: string[], rows: (string | number)[][]): string {
  const head = `| ${columns.join(" | ")} |`;
  const sep = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows
    .slice(0, 500)
    .map((row) => `| ${row.map((cell) => String(cell ?? "")).join(" | ")} |`)
    .join("\n");
  return `${head}\n${sep}\n${body}`;
}

export async function parseCsv(file: File): Promise<Extraction> {
  const text = await file.text();
  const parsed = Papa.parse<string[]>(text.trim(), { skipEmptyLines: true });
  const rows = (parsed.data as string[][]).filter((r) => r.length > 0);
  if (!rows.length) return { text: "", structured: null };
  const [columns, ...body] = rows;
  return { text: tableToText(columns, body), structured: { columns, rows: body } };
}

export async function parseXlsx(file: File): Promise<Extraction> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });
  const chunks: string[] = [];
  let structured: Extraction["structured"] = null;

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true });
    const clean = rows.filter((r) => Array.isArray(r) && r.length);
    if (!clean.length) continue;
    const columns = clean[0].map((c) => String(c ?? ""));
    const body = clean.slice(1);
    chunks.push(`#### Hoja: ${sheetName}\n${tableToText(columns, body)}`);
    if (!structured) structured = { columns, rows: body };
  }
  return { text: chunks.join("\n\n"), structured };
}

export async function parseJson(file: File): Promise<Extraction> {
  const raw = await file.text();
  const parsed = JSON.parse(raw) as unknown;
  if (Array.isArray(parsed) && parsed.length && typeof parsed[0] === "object" && parsed[0]) {
    const columns = Object.keys(parsed[0] as Record<string, unknown>);
    const rows = parsed.map((item) =>
      columns.map((col) => {
        const value = (item as Record<string, unknown>)[col];
        return typeof value === "number" ? value : String(value ?? "");
      }),
    );
    return { text: tableToText(columns, rows), structured: { columns, rows } };
  }
  return { text: JSON.stringify(parsed, null, 2), structured: null };
}

export async function parsePdf(file: File): Promise<Extraction> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) pages.push(`--- Página ${i} ---\n${text}`);
  }
  return { text: pages.join("\n\n"), structured: null };
}

export async function parseText(file: File): Promise<Extraction> {
  return { text: await file.text(), structured: null };
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i += 1) binary += String.fromCharCode(buffer[i]);
  return btoa(binary);
}
