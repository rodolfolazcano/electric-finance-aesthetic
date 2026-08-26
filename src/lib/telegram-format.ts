// Helpers de formato para mensajes de Telegram (estética moderna CORONAR).
// Unifica cómo se presentan múltiplos canales (earnings, señales, alertas).

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function fmtCapUsd(v: number | null): string {
  if (v == null || !isFinite(v) || v <= 0) return "";
  if (v >= 1e12) return (v / 1e12).toFixed(v >= 10e12 ? 0 : 1) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(v >= 10e9 ? 0 : 0) + "B";
  if (v >= 1e6) return Math.round(v / 1e6) + "M";
  return "";
}

export function nombreCorto(nombre: string, max = 26): string {
  let s = nombre
    .replace(/,?\s*(Inc\.?|Incorporated|Corporation|Corp\.?|Ltd\.?|Limited|Holdings?|Group|S\.?A\.?|S\.?A\.S\.?|plc\.?)$/i, "")
    .trim();
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

export function horaCorta(horaArt: string | null, momento: string | null): string {
  if (!horaArt && !momento) return "";
  const h = (horaArt ?? "").trim();
  const mom = momento === "pre-apertura" ? "🌅" : momento === "post-cierre" ? "🌙" : "";
  if (h && mom) return `${h} ${mom}`;
  if (h) return h;
  return mom;
}

export function pctCorto(v: number | null, dec = 1): string {
  if (v == null || !isFinite(v)) return "";
  return `${v >= 0 ? "+" : ""}${v.toFixed(dec)}%`;
}

export const SEPARADOR_FINO = "━━━━━━━━━━━━━━";

export function etiquetaFechaCorta(iso: string): string {
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  const meses = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  const d = new Date(`${iso}T12:00:00Z`);
  return `${dias[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")} ${meses[d.getUTCMonth()]}`;
}

// Marca sorpresas históricas negativas extremas.
export function esSorpresaExtremaNegativa(avgSorpresa: number | null): boolean {
  return avgSorpresa != null && avgSorpresa < -30;
}

// Normaliza mojibake común de encoding (doble-decodificación UTF-8→Latin-1).
export function normalizarUtf8(s: string): string {
  // Heurística: si aparecen secuencias típicas de mojibake, re-decodificar
  if (!/[ÃÂ]/.test(s)) return s;
  try {
    // Intentar recuperar interpretando como latin1→utf8
    const bytes = new TextEncoder().encode(s);
    // No existe TextDecoder latin1 fiable para mojibake inverso aquí;
    // para casos vistos (Ã³→ó, â€"→—) normalizamos directamente:
    return s
      .replace(/Ã³/g, "ó").replace(/Ã¡/g, "á").replace(/Ã©/g, "é").replace(/Ã­/g, "í").replace(/Ãº/g, "ú")
      .replace(/Ã±/g, "ñ").replace(/Ã¼/g, "ü")
      .replace(/â€"/g, "—").replace(/â€™/g, "’").replace(/â€œ/g, "“").replace(/â€/g, "”")
      .replace(/Ã/g, "í").replace(/Â/g, "");
  } catch {
    return s;
  }
}
