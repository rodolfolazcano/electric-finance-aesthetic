import * as XLSX from "xlsx";

const BRAND = "Coronar Inversiones";
const FOOTER = `Generado por ${BRAND} — ${new Date().toLocaleDateString("es-AR")}`;

export function createWorkbook(sheets: Record<string, XLSX.WorkSheet>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, ws] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return wb;
}

export function writeWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

export function sheetFromRows(rows: Record<string, unknown>[], header?: string[]): XLSX.WorkSheet {
  const ws = XLSX.utils.json_to_sheet(rows);
  if (header) {
    const ref = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let c = 0; c < header.length; c++) {
      const addr = XLSX.utils.encode_cell({ r: ref.s.r, c });
      ws[addr] = { t: "s", v: header[c] };
    }
  }
  const colWidths = header?.map((h) => ({ wch: Math.max(h.length + 2, 14) })) ?? [];
  ws["!cols"] = colWidths;
  ws["!rows"] = [{ hpx: 30 }];
  return ws;
}

export function addFooter(ws: XLSX.WorkSheet) {
  const ref = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
  const lastRow = ref.e.r + 2;
  XLSX.utils.sheet_add_aoa(ws, [[FOOTER]], { origin: { r: lastRow, c: 0 } });
}

export function addBranding(wb: XLSX.WorkBook) {
  if (wb.SheetNames.length > 0) {
    const ws = wb.Sheets[wb.SheetNames[0]];
    const ref = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    for (let r = 0; r <= 3; r++) {
      for (let c = 0; c <= (ref.e.c || 5); c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { t: "s", v: "" };
      }
    }
    XLSX.utils.sheet_add_aoa(ws, [["Coronar Inversiones — Planificación Financiera", "", "", "", "", ""]], { origin: "A1" });
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } }];
    const r = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
    r.s.r = 0;
    ws["!ref"] = XLSX.utils.encode_range(r);
  }
}

const name = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function downloadFilename(calculator: string): string {
  return `clarity-${calculator}-${name(new Date())}.xlsx`;
}

export function downloadBlob(wb: XLSX.WorkBook, filename: string) {
  const data = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}