/**
 * Spread vs UST interpolado por duración (Elbaum 10.7)
 * En vez de UST10Y plana, interpola la curva UST (2Y/5Y/10Y/30Y) a la duración del bono.
 * Reutiliza fetchUST10Y existente y agrega ^FVX (5Y), ^TYX (30Y), ^IRX (13w→2Y proxy).
 */

export interface CurvaUst {
  t2: number | null; // 2Y yield decimal
  t5: number | null; // 5Y
  t10: number | null; // 10Y
  t30: number | null; // 30Y
  timestamp: number;
}

/** Fetch curva UST completa (4 tramos). Fallback: solo 10Y si fallan los demás. */
export async function fetchCurvaUst(): Promise<CurvaUst> {
  const out: CurvaUst = { t2: null, t5: null, t10: null, t30: null, timestamp: Date.now() };
  const tramos = await Promise.allSettled([
    fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?range=1mo&interval=1d", { cache: "no-store" }),
    fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EFVX?range=1mo&interval=1d", { cache: "no-store" }),
    fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ETNX?range=1mo&interval=1d", { cache: "no-store" }),
    fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5ETYX?range=1mo&interval=1d", { cache: "no-store" }),
  ]);
  const extract = (r: PromiseSettledResult<Response>): number | null => {
    if (r.status !== "fulfilled" || !r.value.ok) return null;
    return r.value.json().then((j: any) => {
      const closes = j?.chart?.result?.[0]?.indicators?.quote?.[0]?.close?.filter((c: any) => c != null) ?? [];
      const last = closes[closes.length - 1];
      return typeof last === "number" ? last / 100 : null; // TNX cotiza en % ×100 → decimal
    }).catch(() => null);
  };
  // IRX = 13 semanas (~0.25a) → usar como proxy 2Y con ajuste; idealmente ^UST2Y no existe en Yahoo
  out.t2 = await extract(tramos[0]); // 13-week T-bill anualizado
  out.t5 = await extract(tramos[1]);
  out.t10 = await extract(tramos[2]);
  out.t30 = await extract(tramos[3]);
  return out;
}

/**
 * Interpola linealmente el yield UST a la duración dada (en años).
 * Fuera de rango: clamp a extremos. Si solo hay 10Y, retorna ese valor.
 */
export function interpolarUstPorDuracion(curva: CurvaUst, duracionAnios: number): number | null {
  const d = Math.max(0.1, Math.min(30, duracionAnios));
  const puntos: Array<[number, number]> = [];
  if (curva.t2 != null) puntos.push([0.25, curva.t2]); // IRX ~3m
  if (curva.t5 != null) puntos.push([5, curva.t5]);
  if (curva.t10 != null) puntos.push([10, curva.t10]);
  if (curva.t30 != null) puntos.push([30, curva.t30]);
  if (!puntos.length) return curva.t10 ?? null;
  puntos.sort((a, b) => a[0] - b[0]);
  if (d <= puntos[0][0]) return puntos[0][1];
  if (d >= puntos[puntos.length - 1][0]) return puntos[puntos.length - 1][1];
  for (let i = 0; i < puntos.length - 1; i++) {
    const [x1, y1] = puntos[i]!;
    const [x2, y2] = puntos[i + 1]!;
    if (d >= x1 && d <= x2) {
      const t = (d - x1) / (x2 - x1 || 1);
      return y1 + t * (y2 - y1);
    }
  }
  return curva.t10 ?? null;
}

/** Spread = TIR bono − UST interpolada, en basis points */
export function spreadVsUst(tirBonoDecimal: number, ustInterpoladaDecimal: number): number {
  return Math.round((tirBonoDecimal - ustInterpoladaDecimal) * 10000); // bp
}
