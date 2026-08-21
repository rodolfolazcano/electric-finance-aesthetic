// @ts-nocheck
import type { MathCheck, SlideSpec, SeriesPoint } from "@/lib/types";

const numberRe = /-?\d{1,3}(?:[.\s]\d{3})*(?:,\d+)?|-?\d+(?:\.\d+)?/g;

/** Convierte "12.480,55" o "12480.55" a número. */
export function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(/\s/g, "");
  if (!cleaned) return null;
  const arg = /,\d{1,2}$/.test(cleaned);
  const normalized = arg
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned.replace(/,/g, "");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function formatARS(value: number, unit = ""): string {
  const formatted = new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: Math.abs(value) < 100 ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
  return unit ? `${unit} ${formatted}` : formatted;
}

export function sumSeries(series: SeriesPoint[]): number {
  return series.reduce((acc, point) => acc + (Number(point.value) || 0), 0);
}

/**
 * Recalcula y verifica antes de que el resultado se use en una pieza.
 * - toda serie debe tener valores numéricos finitos
 * - si una métrica declara un total, debe coincidir con la suma de la serie (±0,5%)
 */
export function verifySlide(spec: SlideSpec): MathCheck[] {
  const checks: MathCheck[] = [];
  const charts = spec.elements.filter((el) => el.type === "chart" && el.series?.length);

  for (const chart of charts) {
    const series = chart.series ?? [];
    const invalid = series.filter((p) => !Number.isFinite(Number(p.value)));
    checks.push({
      label: `Serie "${chart.id}"`,
      ok: invalid.length === 0 && series.length > 0,
      detail:
        invalid.length === 0
          ? `${series.length} períodos, total ${formatARS(sumSeries(series), chart.unit ?? "")}`
          : `${invalid.length} valores no numéricos`,
    });
  }

  const totals = spec.elements.filter(
    (el) => el.type === "metric" && /total|suma|acumulad/i.test(el.label ?? ""),
  );
  if (charts.length && totals.length) {
    const expected = sumSeries(charts[0].series ?? []);
    for (const metric of totals) {
      const found = (metric.value ?? "").match(numberRe)?.map(parseNumber).filter((n): n is number => n !== null) ?? [];
      const declared = found.length ? found[found.length - 1] : null;
      if (declared === null) continue;
      const delta = Math.abs(declared - expected);
      const tolerance = Math.max(Math.abs(expected) * 0.005, 0.01);
      checks.push({
        label: `Total declarado "${metric.label}"`,
        ok: delta <= tolerance,
        detail:
          delta <= tolerance
            ? `coincide con la suma de la serie (${formatARS(expected)})`
            : `declara ${formatARS(declared)} vs. suma real ${formatARS(expected)} (dif. ${formatARS(delta)})`,
      });
    }
  }

  if (!checks.length) {
    checks.push({
      label: "Verificación",
      ok: true,
      detail: "La pieza no contiene series numéricas que recalcular.",
    });
  }
  return checks;
}
