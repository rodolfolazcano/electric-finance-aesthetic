/**
 * Indicadores técnicos y estadísticos puros (sin I/O).
 * Implementaciones alineadas con las definiciones del corpus académico
 * (Labadie stat-arb: z-score del spread; RSI de Wilder; MACD estándar).
 */

export function sma(serie: number[], periodo: number): number | null {
  if (serie.length < periodo) return null;
  const ventana = serie.slice(-periodo);
  return ventana.reduce((s, x) => s + x, 0) / periodo;
}

export function ema(serie: number[], periodo: number): number[] {
  const k = 2 / (periodo + 1);
  const out: number[] = [];
  let prev = serie[0] ?? 0;
  for (let i = 0; i < serie.length; i++) {
    prev = i === 0 ? serie[0]! : (serie[i] as number) * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/** RSI de Wilder (idéntico a TradingView). */
export function rsi(serie: number[], periodo = 14): number | null {
  if (serie.length < periodo + 1) return null;
  let ganancia = 0;
  let perdida = 0;
  for (let i = 1; i <= periodo; i++) {
    const d = (serie[i] as number) - (serie[i - 1] as number);
    if (d > 0) ganancia += d;
    else perdida -= d;
  }
  ganancia /= periodo;
  perdida /= periodo;
  for (let i = periodo + 1; i < serie.length; i++) {
    const d = (serie[i] as number) - (serie[i - 1] as number);
    ganancia = (ganancia * (periodo - 1) + Math.max(d, 0)) / periodo;
    perdida = (perdida * (periodo - 1) + Math.max(-d, 0)) / periodo;
  }
  if (perdida === 0) return 100;
  const rs = ganancia / perdida;
  return 100 - 100 / (1 + rs);
}

export type MacdResultado = { macd: number | null; senal: number | null; histograma: number | null };

export function macd(serie: number[], rapida = 12, lenta = 26, señal = 9): MacdResultado {
  if (serie.length < lenta + señal) return { macd: null, senal: null, histograma: null };
  const eRapida = ema(serie, rapida);
  const eLenta = ema(serie, lenta);
  const linea = serie.map((_, i) => (eRapida[i] ?? 0) - (eLenta[i] ?? 0));
  const lineaSenal = ema(linea.slice(lenta - 1), señal);
  const macdActual = linea[linea.length - 1] ?? null;
  const senalActual = lineaSenal[lineaSenal.length - 1] ?? null;
  return {
    macd: macdActual,
    senal: senalActual,
    histograma: macdActual != null && senalActual != null ? macdActual - senalActual : null,
  };
}

export function desvioEstandar(serie: number[]): number {
  if (serie.length < 2) return 0;
  const m = serie.reduce((s, x) => s + x, 0) / serie.length;
  return Math.sqrt(serie.reduce((s, x) => s + (x - m) ** 2, 0) / (serie.length - 1));
}

export function media(serie: number[]): number {
  if (!serie.length) return 0;
  return serie.reduce((s, x) => s + x, 0) / serie.length;
}

/** z-score del último valor contra la ventana. Método del spread en Labadie. */
export function zScoreUltimo(spread: number[], ventana = 60): number | null {
  const w = spread.slice(-ventana);
  if (w.length < 20) return null;
  const m = media(w);
  const sd = desvioEstandar(w);
  if (sd === 0) return null;
  const ultimo = w[w.length - 1]!;
  return (ultimo - m) / sd;
}

export function correlacion(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 20) return null;
  const ax = a.slice(-n);
  const bx = b.slice(-n);
  const ma = media(ax);
  const mb = media(bx);
  let num = 0;
  let da = 0;
  let dbb = 0;
  for (let i = 0; i < n; i++) {
    num += (ax[i]! - ma) * (bx[i]! - mb);
    da += (ax[i]! - ma) ** 2;
    dbb += (bx[i]! - mb) ** 2;
  }
  if (da === 0 || dbb === 0) return null;
  return num / Math.sqrt(da * dbb);
}

/** ATR simplificado con closes+highs+lows; si solo hay closes, usa variaciones absolutas. */
export function atrAproximado(closes: number[], highs?: number[], lows?: number[], periodo = 14): number | null {
  if (closes.length < periodo + 1) return null;
  const tr: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (highs?.[i] != null && lows?.[i] != null) {
      tr.push(Math.max((highs[i] as number) - (lows[i] as number), Math.abs((highs[i] as number) - closes[i - 1]!), Math.abs((lows[i] as number) - closes[i - 1]!)));
    } else {
      tr.push(Math.abs((closes[i] as number) - closes[i - 1]!));
    }
  }
  const valor = media(tr.slice(-periodo));
  const precio = closes[closes.length - 1]!;
  return precio > 0 ? (valor / precio) * 100 : null; // % del precio
}

/** Canal de Donchian: máximo/mínimo de los últimos N períodos excluyendo la vela actual. */
export function donchian(closes: number[], periodo = 20): { superior: number | null; inferior: number | null } {
  if (closes.length < periodo + 1) return { superior: null, inferior: null };
  const w = closes.slice(-(periodo + 1), -1);
  return { superior: Math.max(...w), inferior: Math.min(...w) };
}

export function retornosDiarios(serie: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < serie.length; i++) {
    if ((serie[i - 1] as number) > 0) out.push(((serie[i] as number) - serie[i - 1]!) / serie[i - 1]!);
  }
  return out;
}
