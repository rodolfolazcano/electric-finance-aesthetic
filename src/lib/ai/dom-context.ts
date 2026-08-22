export type DataPoint = {
  label: string;
  value: string;
  section: string;
};

export function scanVisibleData(): DataPoint[] {
  if (typeof document === "undefined") return [];
  const points: DataPoint[] = [];
  const els = document.querySelectorAll<HTMLElement>("[data-ai-label]");
  els.forEach((el) => {
    const label = el.getAttribute("data-ai-label") ?? "";
    const value = el.getAttribute("data-ai-value") ?? el.textContent?.trim() ?? "";
    const section = el.closest<HTMLElement>("[data-ai-section]")?.getAttribute("data-ai-section") ?? "";
    if (label && value) points.push({ label, value, section });
  });
  return points;
}

export function scanVisibleImages(): string[] {
  if (typeof document === "undefined") return [];
  const imgs: string[] = [];
  document.querySelectorAll<HTMLImageElement>("img[data-ai-image]").forEach((img) => {
    const alt = img.getAttribute("data-ai-image") || img.alt || "imagen";
    const src = img.src || "";
    if (src) imgs.push(`${alt}: ${src}`);
  });
  return imgs;
}

export function buildUiContextBlob(): string {
  const points = scanVisibleData();
  const imgs = scanVisibleImages();
  const parts: string[] = [];
  parts.push(`Ruta: ${window.location.pathname}`);
  parts.push(`Título: ${document.title}`);
  if (points.length) {
    parts.push("\nDATOS VISIBLES:");
    for (const p of points) {
      const ctx = p.section ? `[${p.section}] ` : "";
      parts.push(`  ${ctx}${p.label}: ${p.value}`);
    }
  }
  if (imgs.length) {
    parts.push("\nIMÁGENES VISIBLES:");
    for (const img of imgs) parts.push(`  ${img}`);
  }
  return parts.join("\n");
}

export function onClickElement(el: HTMLElement): { label: string; value: string; section: string; html: string } | null {
  const label = el.getAttribute("data-ai-label") ?? "";
  const value = el.getAttribute("data-ai-value") ?? el.textContent?.trim() ?? "";
  if (!label && !value) return null;
  const section = el.closest<HTMLElement>("[data-ai-section]")?.getAttribute("data-ai-section") ?? "";
  const html = el.outerHTML.slice(0, 500);
  return { label, value, section, html };
}
